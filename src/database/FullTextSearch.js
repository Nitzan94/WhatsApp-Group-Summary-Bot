const logger = require('../utils/logger');

/**
 * FullTextSearch - מערכת חיפוש מתקדמת עם SQLite FTS5
 * מעבדת 75,000+ הודעות עם ביצועים מיטביים
 */
class FullTextSearch {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.isInitialized = false;
    
    // הגדרות חיפוש
    this.config = {
      maxResults: 100,
      minRelevance: 0.3,
      snippetLength: 32,
      highlightStart: '<mark>',
      highlightEnd: '</mark>'
    };
  }

  /**
   * אתחול מערכת החיפוש
   */
  async initialize() {
    try {
      logger.info('🔍 מתחיל אתחול FTS5 search engine...');
      
      // יצירת FTS5 virtual table
      await this.createFTSTable();
      
      // בדיקה אם צריך למלא את האינדקס
      const indexCount = await this.getIndexCount();
      const messagesCount = await this.getMessagesCount();
      
      logger.info(`📊 FTS Index: ${indexCount} entries, Messages: ${messagesCount} total`);
      
      if (indexCount === 0 && messagesCount > 0) {
        logger.info('🔄 מתחיל מילוי אינדקס החיפוש...');
        await this.populateSearchIndex();
        logger.info('✅ אינדקס החיפוש הושלם בהצלחה');
      }
      
      this.isInitialized = true;
      logger.info('✅ FTS5 search engine אותחל בהצלחה');
      
      return true;
      
    } catch (error) {
      logger.error('Failed to initialize FTS5:', error);
      throw error;
    }
  }

  /**
   * יצירת FTS5 virtual table
   */
  async createFTSTable() {
    const sql = `
      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        content,
        sender_name,
        group_name,
        message_type,
        content=messages,
        content_rowid=id,
        tokenize='unicode61 remove_diacritics 1'
      );
    `;
    
    await this.db.runQuery(sql);
    logger.info('📋 FTS5 virtual table created/verified');
  }

  /**
   * מילוי אינדקס החיפוש מכל ההודעות
   */
  async populateSearchIndex() {
    try {
      // מחיקת אינדקס קיים
      await this.db.runQuery('DELETE FROM messages_fts');
      
      // מילוי האינדקס בבאצ'ים לביצועים טובים
      const batchSize = 1000;
      let offset = 0;
      let totalProcessed = 0;
      
      while (true) {
        const messages = await this.db.allQuery(`
          SELECT 
            m.id,
            m.content,
            m.sender_name,
            g.name as group_name,
            m.message_type
          FROM messages m
          JOIN groups g ON m.group_id = g.id
          LIMIT ? OFFSET ?
        `, [batchSize, offset]);
        
        if (messages.length === 0) break;
        
        // הכנסת הבאצ' לאינדקס
        await this.insertBatchToIndex(messages);
        
        totalProcessed += messages.length;
        offset += batchSize;
        
        if (totalProcessed % 5000 === 0) {
          logger.info(`📈 עובד באינדקס: ${totalProcessed} הודעות נוספו`);
        }
      }
      
      // אופטימיזציה של האינדקס
      await this.db.runQuery('INSERT INTO messages_fts(messages_fts) VALUES(\'optimize\')');
      
      logger.info(`✅ אינדקס החיפוש הושלם: ${totalProcessed} הודעות`);
      
    } catch (error) {
      logger.error('Error populating search index:', error);
      throw error;
    }
  }

  /**
   * הכנסת באצ' הודעות לאינדקס
   */
  async insertBatchToIndex(messages) {
    const placeholders = messages.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const sql = `
      INSERT INTO messages_fts(rowid, content, sender_name, group_name, message_type)
      VALUES ${placeholders}
    `;
    
    const params = [];
    messages.forEach(msg => {
      params.push(
        msg.id,
        msg.content || '',
        msg.sender_name || '',
        msg.group_name || '',
        msg.message_type || 'text'
      );
    });
    
    await this.db.runQuery(sql, params);
  }

  /**
   * חיפוש הודעות עם FTS5
   */
  async searchMessages(query, options = {}) {
    try {
      logger.info(`🔍 [FTS DEBUG] searchMessages called with query: "${query}"`);
      logger.info(`🔍 [FTS DEBUG] options: ${JSON.stringify(options)}`);
      
      if (!this.isInitialized) {
        logger.error('🔍 [FTS DEBUG] FTS5 not initialized!');
        throw new Error('FTS5 not initialized');
      }
      
      const {
        limit = this.config.maxResults,
        groupId = null,
        dateRange = null,
        minRelevance = this.config.minRelevance,
        includeSnippets = true
      } = options;
      
      logger.info(`🔍 [FTS DEBUG] Processed options: limit=${limit}, groupId=${groupId}, minRelevance=${minRelevance}`);
      
      // בניית FTS query
      const ftsQuery = this.buildSearchQuery(query);
      logger.info(`🔍 [FTS DEBUG] Built FTS query: "${ftsQuery}"`);
      
      if (!ftsQuery) {
        logger.info(`🔍 [FTS DEBUG] No FTS query built - returning empty array`);
        return [];
      }
      
      let sql = `
        SELECT 
          m.id,
          m.content,
          m.sender_name,
          m.timestamp,
          g.name as group_name,
          m.message_type,
          bm25(messages_fts) as relevance_score
      `;
      
      if (includeSnippets) {
        sql += `, snippet(messages_fts, 0, '${this.config.highlightStart}', '${this.config.highlightEnd}', '...', ${this.config.snippetLength}) as snippet`;
      }
      
      sql += `
        FROM messages_fts 
        JOIN messages m ON messages_fts.rowid = m.id
        JOIN groups g ON m.group_id = g.id
        WHERE messages_fts MATCH ?
      `;
      
      const params = [ftsQuery];
      
      // סינון לפי קבוצה
      if (groupId) {
        sql += ' AND m.group_id = ?';
        params.push(groupId);
      }
      
      // סינון לפי טווח זמן
      if (dateRange) {
        sql += ' AND m.timestamp BETWEEN ? AND ?';
        params.push(dateRange.start, dateRange.end);
      }
      
      // סינון הודעות לא רלוונטיות (שיפור איכות)
      sql += ` AND m.content IS NOT NULL 
               AND m.content != '[undefined]' 
               AND m.content != '[senderKeyDistributionMessage]'
               AND m.content != '[תמונה]'
               AND m.content != '[image]'
               AND m.content != '[sticker]'
               AND m.content != '[מדבקה]'
               AND LENGTH(m.content) > 10`;
      
      // מיון לפי רלוונטיות ומגבלה
      sql += ' ORDER BY bm25(messages_fts) LIMIT ?';
      params.push(limit);
      
      logger.info(`🔍 [FTS DEBUG] Final SQL: ${sql}`);
      logger.info(`🔍 [FTS DEBUG] Parameters: ${JSON.stringify(params)}`);
      
      const results = await this.db.allQuery(sql, params);
      
      logger.info(`🔍 [FTS DEBUG] Raw results count: ${results.length}`);
      if (results.length > 0) {
        logger.info(`🔍 [FTS DEBUG] Sample relevance scores: ${results.slice(0, 3).map(r => r.relevance_score)}`);
      }
      
      // סינון לפי ציון רלוונטיות מינימלי
      const filteredResults = results.filter(r => Math.abs(r.relevance_score) >= minRelevance);
      
      logger.info(`🔍 FTS5 Search: "${query}" -> ${filteredResults.length}/${results.length} results (minRelevance: ${minRelevance})`);
      
      return filteredResults;
      
    } catch (error) {
      logger.error('Error searching messages with FTS5:', error);
      return [];
    }
  }

  /**
   * בניית FTS query מחרוזת החיפוש
   */
  buildSearchQuery(userQuery) {
    try {
      // ניקוי והכנה של השאלה
      const cleanQuery = userQuery
        .replace(/[^\u0590-\u05FFa-zA-Z0-9\s'"]/g, ' ')
        .trim();
      
      if (!cleanQuery) return null;
      
      // חילוק לביטויים ומילים
      const phrases = this.extractPhrases(cleanQuery);
      const keywords = this.extractKeywords(cleanQuery);
      
      let ftsQuery = '';
      
      // הוספת ביטויים מדויקים
      if (phrases.length > 0) {
        const phraseQueries = phrases.map(phrase => `"${phrase}"`);
        ftsQuery += phraseQueries.join(' AND ');
      }
      
      // הוספת מילות מפתח
      if (keywords.length > 0) {
        if (ftsQuery) ftsQuery += ' AND ';
        
        // שימוש ב-OR למילות מפתח לגמישות
        if (keywords.length > 1) {
          ftsQuery += `(${keywords.join(' OR ')})`;
        } else {
          ftsQuery += keywords[0];
        }
      }
      
      // fallback לשאלה המקורית אם לא נמצאו מילות מפתח
      return ftsQuery || `"${cleanQuery}"`;
      
    } catch (error) {
      logger.error('Error building FTS query:', error);
      return `"${userQuery}"`;
    }
  }

  /**
   * חילוץ ביטויים מהשאלה
   */
  extractPhrases(query) {
    const phrases = [];
    
    // חיפוש ביטויים בגרשיים
    const quotedPhrases = query.match(/"([^"]+)"/g);
    if (quotedPhrases) {
      quotedPhrases.forEach(phrase => {
        phrases.push(phrase.replace(/"/g, ''));
      });
    }
    
    return phrases;
  }

  /**
   * חילוץ מילות מפתח מהשאלה
   */
  extractKeywords(query) {
    // הסרת ביטויים בגרשיים
    let cleanQuery = query.replace(/"[^"]*"/g, ' ');
    
    // מילות עצר בעברית ואנגלית
    const stopWords = new Set([
      'של', 'על', 'את', 'עם', 'אל', 'מה', 'איך', 'מתי', 'איפה', 'למה', 'מי',
      'זה', 'זאת', 'הזה', 'הזאת', 'כל', 'יש', 'היה', 'יהיה', 'אני', 'אתה', 'הוא',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'is', 'was', 'are', 'were', 'be', 'been', 'have', 'has', 'had'
    ]);
    
    const words = cleanQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(word => {
        return word.length > 2 && 
               !stopWords.has(word) &&
               /[\u0590-\u05FFa-zA-Z0-9]/.test(word);
      });
    
    return [...new Set(words)]; // הסרת כפילויות
  }

  /**
   * קבלת מספר רשומות באינדקס
   */
  async getIndexCount() {
    try {
      const result = await this.db.getQuery('SELECT COUNT(*) as count FROM messages_fts');
      return result ? result.count : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * קבלת מספר הודעות כולל
   */
  async getMessagesCount() {
    try {
      const result = await this.db.getQuery('SELECT COUNT(*) as count FROM messages');
      return result ? result.count : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * עדכון אינדקס עבור הודעה חדשה
   */
  async indexNewMessage(messageId, content, senderName, groupName, messageType = 'text') {
    try {
      if (!this.isInitialized) return;
      
      await this.db.runQuery(`
        INSERT INTO messages_fts(rowid, content, sender_name, group_name, message_type)
        VALUES (?, ?, ?, ?, ?)
      `, [messageId, content || '', senderName || '', groupName || '', messageType]);
      
    } catch (error) {
      logger.error('Error indexing new message:', error);
    }
  }

  /**
   * מחיקת הודעה מהאינדקס
   */
  async removeFromIndex(messageId) {
    try {
      if (!this.isInitialized) return;
      
      await this.db.runQuery('DELETE FROM messages_fts WHERE rowid = ?', [messageId]);
      
    } catch (error) {
      logger.error('Error removing message from index:', error);
    }
  }

  /**
   * אופטימיזציה של האינדקס
   */
  async optimizeIndex() {
    try {
      if (!this.isInitialized) return;
      
      logger.info('🔧 מבצע אופטימיזציה של אינדקס החיפוש...');
      await this.db.runQuery('INSERT INTO messages_fts(messages_fts) VALUES(\'optimize\')');
      logger.info('✅ אופטימיזציה הושלמה');
      
    } catch (error) {
      logger.error('Error optimizing index:', error);
    }
  }

  /**
   * סטטיסטיקות של מערכת החיפוש
   */
  async getSearchStats() {
    try {
      const indexCount = await this.getIndexCount();
      const messagesCount = await this.getMessagesCount();
      
      return {
        totalMessages: messagesCount,
        indexedMessages: indexCount,
        indexCoverage: messagesCount > 0 ? (indexCount / messagesCount * 100).toFixed(2) : 0,
        isInitialized: this.isInitialized,
        config: this.config
      };
      
    } catch (error) {
      logger.error('Error getting search stats:', error);
      return null;
    }
  }
}

module.exports = FullTextSearch;