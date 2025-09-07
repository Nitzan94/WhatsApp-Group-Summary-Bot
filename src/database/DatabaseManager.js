const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../../config/bot-config');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.dbPath = config.database.path;
    this.schemaPath = path.join(__dirname, 'schema.sql');
    this.isInitialized = false;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info('Created data directory');
      }

      // Connect to database
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Failed to connect to database:', err.message);
          throw err;
        }
        logger.info(`📊 Connected to SQLite database: ${this.dbPath}`);
      });

      // Enable WAL mode for better performance
      await this.runQuery('PRAGMA journal_mode=WAL;');
      await this.runQuery('PRAGMA synchronous=NORMAL;');
      await this.runQuery('PRAGMA cache_size=10000;');
      await this.runQuery('PRAGMA temp_store=memory;');

      // Create tables from schema
      await this.createTables();
      
      this.isInitialized = true;
      logger.info('✅ Database initialized successfully');

    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create tables from schema file
   */
  async createTables() {
    try {
      const schema = fs.readFileSync(this.schemaPath, 'utf8');
      
      // Split SQL statements more intelligently
      // Handle triggers and other complex statements
      const statements = this.splitSQLStatements(schema);
      
      for (const statement of statements) {
        const trimmedStatement = statement.trim();
        if (trimmedStatement && !trimmedStatement.startsWith('--')) {
          logger.debug(`Executing SQL: ${trimmedStatement.substring(0, 100)}...`);
          await this.runQuery(trimmedStatement);
        }
      }
      
      logger.info('📋 Database schema created/updated');
    } catch (error) {
      logger.error('Failed to create database schema:', error);
      throw error;
    }
  }

  /**
   * Split SQL statements intelligently, handling triggers and other complex statements
   */
  splitSQLStatements(sql) {
    const statements = [];
    let current = '';
    let inTrigger = false;
    let beginCount = 0;
    
    const lines = sql.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments
      if (trimmedLine.startsWith('--') || trimmedLine === '') {
        continue;
      }
      
      current += line + '\n';
      
      // Check for trigger start
      if (trimmedLine.toLowerCase().includes('create trigger')) {
        inTrigger = true;
      }
      
      // Count BEGIN/END blocks
      if (trimmedLine.toLowerCase().includes('begin')) {
        beginCount++;
      }
      if (trimmedLine.toLowerCase().includes('end')) {
        beginCount--;
      }
      
      // Check for statement end
      if (trimmedLine.endsWith(';')) {
        // If we're not in a trigger, or if we're in a trigger but all BEGIN/END blocks are closed
        if (!inTrigger || beginCount === 0) {
          statements.push(current.trim());
          current = '';
          inTrigger = false;
          beginCount = 0;
        }
      }
    }
    
    // Add any remaining statement
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements;
  }

  /**
   * Run a SQL query (Promise wrapper for sqlite3)
   */
  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('SQL Error:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Get single row from database
   */
  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.error('SQL Get Error:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get multiple rows from database
   */
  allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('SQL All Error:', { sql, params, error: err.message });
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // ===== GROUP METHODS =====

  /**
   * Add or update a group
   */
  async upsertGroup(groupId, name, phoneNumberId = null) {
    const sql = `
      INSERT INTO groups (id, name, phone_number_id, is_active, updated_at)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        phone_number_id = excluded.phone_number_id,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    try {
      const result = await this.runQuery(sql, [groupId, name, phoneNumberId]);
      logger.debug(`Group upserted: ${name} (${groupId})`);
      return result;
    } catch (error) {
      logger.error('Failed to upsert group:', error);
      throw error;
    }
  }

  /**
   * Get all active groups
   */
  async getActiveGroups() {
    const sql = 'SELECT * FROM groups WHERE is_active = 1 ORDER BY name';
    return await this.allQuery(sql);
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId) {
    const sql = 'SELECT * FROM groups WHERE id = ?';
    return await this.getQuery(sql, [groupId]);
  }

  /**
   * Update group schedule
   */
  async updateGroupSchedule(groupId, schedule) {
    const sql = 'UPDATE groups SET schedule = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    return await this.runQuery(sql, [schedule, groupId]);
  }

  // ===== MESSAGE METHODS =====

  /**
   * Save a message to database
   */
  async saveMessage(messageData) {
    const sql = `
      INSERT OR IGNORE INTO messages 
      (message_id, group_id, sender_id, sender_name, content, message_type, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      messageData.messageId,
      messageData.groupId,
      messageData.senderId,
      messageData.senderName,
      messageData.content,
      messageData.messageType || 'text',
      messageData.timestamp
    ];

    try {
      const result = await this.runQuery(sql, params);
      if (result.changes > 0) {
        logger.debug(`Message saved: ${messageData.messageId}`);
      }
      return result;
    } catch (error) {
      logger.error('Failed to save message:', error);
      throw error;
    }
  }

  /**
   * Get messages from a group since last summary
   */
  async getNewMessages(groupId, sinceTimestamp = null) {
    let sql = `
      SELECT * FROM messages 
      WHERE group_id = ? 
      AND timestamp > COALESCE(?, '1970-01-01')
      ORDER BY timestamp ASC
    `;

    // If no timestamp provided, get timestamp of last summary
    if (!sinceTimestamp) {
      const lastSummary = await this.getQuery(
        'SELECT MAX(end_time) as last_time FROM summaries WHERE group_id = ?',
        [groupId]
      );
      sinceTimestamp = lastSummary?.last_time || '1970-01-01';
    }

    return await this.allQuery(sql, [groupId, sinceTimestamp]);
  }

  /**
   * Get messages from today (from start of day)
   */
  async getTodaysMessages(groupId) {
    // Get today's date in YYYY-MM-DD format (Israel timezone)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`; // YYYY-MM-DD in local time
    
    logger.debug(`📅 Getting messages for today: ${todayString} (group: ${groupId})`);
    
    const sql = `
      SELECT * FROM messages 
      WHERE group_id = ? 
      AND date(timestamp, 'localtime') = ?
      ORDER BY timestamp ASC
    `;

    return await this.allQuery(sql, [groupId, todayString]);
  }

  /**
   * Get message count for a group
   */
  async getMessageCount(groupId, sinceTimestamp = null) {
    const sql = `
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE group_id = ? 
      AND timestamp > COALESCE(?, '1970-01-01')
    `;
    
    if (!sinceTimestamp) {
      const lastSummary = await this.getQuery(
        'SELECT MAX(end_time) as last_time FROM summaries WHERE group_id = ?',
        [groupId]
      );
      sinceTimestamp = lastSummary?.last_time || '1970-01-01';
    }

    const result = await this.getQuery(sql, [groupId, sinceTimestamp]);
    return result?.count || 0;
  }

  /**
   * Get the last message for a specific group (for catch-up functionality)
   */
  async getLastMessage(groupId) {
    const sql = `
      SELECT message_id, timestamp FROM messages 
      WHERE group_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;

    try {
      const result = await this.getQuery(sql, [groupId]);
      return result;
    } catch (error) {
      logger.error('Failed to get last message:', error);
      return null;
    }
  }

  // ===== SUMMARY METHODS =====

  /**
   * Save a summary to database
   */
  async saveSummary(summaryData) {
    const sql = `
      INSERT INTO summaries 
      (group_id, summary_text, messages_count, start_time, end_time, model_used, tokens_used)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      summaryData.groupId,
      summaryData.summaryText,
      summaryData.messagesCount,
      summaryData.startTime,
      summaryData.endTime,
      summaryData.modelUsed || 'anthropic/claude-3.5-sonnet',
      summaryData.tokensUsed || null
    ];

    try {
      const result = await this.runQuery(sql, params);
      logger.info(`💾 Summary saved for group: ${summaryData.groupId}`);
      return result.lastID;
    } catch (error) {
      logger.error('Failed to save summary:', error);
      throw error;
    }
  }

  /**
   * Get latest summary for a group
   */
  async getLatestSummary(groupId) {
    const sql = `
      SELECT * FROM summaries 
      WHERE group_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    return await this.getQuery(sql, [groupId]);
  }

  /**
   * Get summary history for a group
   */
  async getSummaryHistory(groupId, limit = 10) {
    const sql = `
      SELECT * FROM summaries 
      WHERE group_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `;
    return await this.allQuery(sql, [groupId, limit]);
  }

  // ===== STATS METHODS =====

  /**
   * Update daily stats
   */
  async updateDailyStats(statsData) {
    const today = new Date().toISOString().split('T')[0];
    
    const sql = `
      INSERT INTO bot_stats 
      (stat_date, messages_processed, summaries_generated, api_calls, uptime_minutes, errors_count)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(stat_date) DO UPDATE SET
        messages_processed = excluded.messages_processed,
        summaries_generated = excluded.summaries_generated,
        api_calls = excluded.api_calls,
        uptime_minutes = excluded.uptime_minutes,
        errors_count = excluded.errors_count
    `;

    const params = [
      today,
      statsData.messagesProcessed || 0,
      statsData.summariesGenerated || 0,
      statsData.apiCalls || 0,
      statsData.uptimeMinutes || 0,
      statsData.errorsCount || 0
    ];

    return await this.runQuery(sql, params);
  }

  /**
   * Get bot statistics
   */
  async getBotStats(days = 7) {
    const sql = `
      SELECT * FROM bot_stats 
      ORDER BY stat_date DESC 
      LIMIT ?
    `;
    return await this.allQuery(sql, [days]);
  }

  // ===== ANALYTICS METHODS =====

  /**
   * Get message statistics for a group in a time period
   */
  async getGroupStats(groupId, days = 7) {
    const sql = `
      SELECT 
        sender_name,
        COUNT(*) as message_count,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message,
        AVG(LENGTH(content)) as avg_message_length
      FROM messages 
      WHERE group_id = ? 
      AND timestamp > datetime('now', '-${days} days')
      GROUP BY sender_name, sender_id
      ORDER BY message_count DESC
    `;
    
    try {
      const results = await this.allQuery(sql, [groupId]);
      return results;
    } catch (error) {
      logger.error('Failed to get group stats:', error);
      return [];
    }
  }

  /**
   * Get activity by hour of day for a group
   */
  async getActivityByHour(groupId, days = 7) {
    const sql = `
      SELECT 
        CAST(strftime('%H', timestamp, 'localtime') AS INTEGER) as hour,
        COUNT(*) as message_count
      FROM messages 
      WHERE group_id = ? 
      AND timestamp > datetime('now', '-${days} days')
      GROUP BY hour
      ORDER BY hour
    `;
    
    try {
      const results = await this.allQuery(sql, [groupId]);
      // Fill missing hours with 0
      const hourlyData = Array(24).fill(0);
      results.forEach(row => {
        hourlyData[row.hour] = row.message_count;
      });
      return hourlyData.map((count, hour) => ({ hour, count }));
    } catch (error) {
      logger.error('Failed to get activity by hour:', error);
      return [];
    }
  }

  /**
   * Get activity by day of week for a group
   */
  async getActivityByDay(groupId, days = 30) {
    const sql = `
      SELECT 
        CASE strftime('%w', timestamp, 'localtime')
          WHEN '0' THEN 'ראשון'
          WHEN '1' THEN 'שני'
          WHEN '2' THEN 'שלישי'
          WHEN '3' THEN 'רביעי'
          WHEN '4' THEN 'חמישי'
          WHEN '5' THEN 'שישי'
          WHEN '6' THEN 'שבת'
        END as day_name,
        strftime('%w', timestamp, 'localtime') as day_num,
        COUNT(*) as message_count
      FROM messages 
      WHERE group_id = ? 
      AND timestamp > datetime('now', '-${days} days')
      GROUP BY day_num
      ORDER BY day_num
    `;
    
    try {
      const results = await this.allQuery(sql, [groupId]);
      return results;
    } catch (error) {
      logger.error('Failed to get activity by day:', error);
      return [];
    }
  }

  /**
   * Get messages for content analysis
   */
  async getMessagesForAnalysis(groupId, days = 7, limit = 200) {
    const sql = `
      SELECT sender_name, content, timestamp
      FROM messages 
      WHERE group_id = ? 
      AND timestamp > datetime('now', '-${days} days')
      AND LENGTH(content) > 10
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    
    try {
      const results = await this.allQuery(sql, [groupId, limit]);
      return results;
    } catch (error) {
      logger.error('Failed to get messages for analysis:', error);
      return [];
    }
  }

  /**
   * Get group overview statistics
   */
  async getGroupOverview(groupId) {
    const overviewSql = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT sender_id) as unique_senders,
        MIN(timestamp) as first_message_date,
        MAX(timestamp) as last_message_date,
        AVG(LENGTH(content)) as avg_message_length
      FROM messages 
      WHERE group_id = ?
    `;
    
    const recentSql = `
      SELECT COUNT(*) as recent_messages
      FROM messages 
      WHERE group_id = ? 
      AND timestamp > datetime('now', '-7 days')
    `;
    
    try {
      const [overview] = await this.allQuery(overviewSql, [groupId]);
      const [recent] = await this.allQuery(recentSql, [groupId]);
      
      return {
        ...overview,
        recent_messages: recent.recent_messages
      };
    } catch (error) {
      logger.error('Failed to get group overview:', error);
      return null;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Clean old messages (keep last 72 hours / 3 days)
   */
  async cleanOldMessages(hoursToKeep = 72) {
    const sql = `
      DELETE FROM messages 
      WHERE timestamp < datetime('now', '-${hoursToKeep} hours')
    `;
    
    try {
      const result = await this.runQuery(sql);
      if (result.changes > 0) {
        logger.info(`🧹 מחק ${result.changes} הודעות ישנות מעל 72 שעות`);
      }
      return result.changes;
    } catch (error) {
      logger.error('Failed to clean old messages:', error);
      throw error;
    }
  }

  /**
   * Get database size and stats
   */
  async getDatabaseInfo() {
    try {
      const stats = fs.statSync(this.dbPath);
      const tables = await this.allQuery(`
        SELECT name, 
               (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=m.name) as table_count
        FROM sqlite_master m WHERE type='table'
      `);
      
      return {
        size: stats.size,
        sizeFormatted: this.formatBytes(stats.size),
        tables: tables.length,
        lastModified: stats.mtime
      };
    } catch (error) {
      logger.error('Failed to get database info:', error);
      return null;
    }
  }

  /**
   * Get messages for content analysis (for ASK functionality)
   * Returns recent messages with context for AI analysis
   */
  async getMessagesForAsk(groupId, days = 7, limit = 100) {
    try {
      const sql = `
        SELECT 
          m.content,
          m.sender_name,
          m.timestamp,
          m.message_type
        FROM messages m
        WHERE m.group_id = ?
        AND m.timestamp > datetime('now', '-${days} days')
        AND m.content IS NOT NULL
        AND m.content != ''
        AND m.content NOT LIKE '!%'  -- Exclude bot commands
        AND LENGTH(m.content) > 3    -- Exclude very short messages
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      return new Promise((resolve, reject) => {
        this.db.all(sql, [groupId, limit], (err, rows) => {
          if (err) {
            logger.error('Error getting messages for ask:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    } catch (error) {
      logger.error('Error in getMessagesForAsk:', error);
      throw error;
    }
  }

  /**
   * Search messages by content for specific topics
   */
  async searchMessagesByContent(groupId, searchTerm, days = 30, limit = 50) {
    try {
      const sql = `
        SELECT 
          m.content,
          m.sender_name,
          m.timestamp,
          m.message_type
        FROM messages m
        WHERE m.group_id = ?
        AND m.timestamp > datetime('now', '-${days} days')
        AND (
          LOWER(m.content) LIKE LOWER(?)
          OR LOWER(m.content) LIKE LOWER(?)
          OR LOWER(m.content) LIKE LOWER(?)
        )
        AND m.content IS NOT NULL
        AND m.content != ''
        AND m.content NOT LIKE '!%'
        ORDER BY m.timestamp DESC
        LIMIT ?
      `;
      
      const searchPattern1 = `%${searchTerm}%`;
      const searchPattern2 = `%${searchTerm.split(' ').join('%')}%`;
      const searchPattern3 = `%${searchTerm.replace(/\s+/g, '%')}%`;
      
      return new Promise((resolve, reject) => {
        this.db.all(sql, [groupId, searchPattern1, searchPattern2, searchPattern3, limit], (err, rows) => {
          if (err) {
            logger.error('Error searching messages by content:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    } catch (error) {
      logger.error('Error in searchMessagesByContent:', error);
      throw error;
    }
  }

  /**
   * Get conversation context around specific timeframe
   */
  async getConversationContext(groupId, targetDate, contextHours = 2) {
    try {
      const sql = `
        SELECT 
          m.content,
          m.sender_name,
          m.timestamp,
          m.message_type
        FROM messages m
        WHERE m.group_id = ?
        AND m.timestamp BETWEEN datetime(?, '-${contextHours} hours') AND datetime(?, '+${contextHours} hours')
        AND m.content IS NOT NULL
        AND m.content != ''
        ORDER BY m.timestamp ASC
      `;
      
      return new Promise((resolve, reject) => {
        this.db.all(sql, [groupId, targetDate, targetDate], (err, rows) => {
          if (err) {
            logger.error('Error getting conversation context:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    } catch (error) {
      logger.error('Error in getConversationContext:', error);
      throw error;
    }
  }

  /**
   * Get popular topics/keywords from group messages
   */
  async getPopularTopics(groupId, days = 30, minLength = 4) {
    try {
      const sql = `
        SELECT 
          m.content,
          COUNT(*) as frequency,
          MIN(m.timestamp) as first_mention,
          MAX(m.timestamp) as last_mention
        FROM messages m
        WHERE m.group_id = ?
        AND m.timestamp > datetime('now', '-${days} days')
        AND m.content IS NOT NULL
        AND LENGTH(m.content) >= ?
        AND m.content NOT LIKE '!%'
        GROUP BY LOWER(TRIM(m.content))
        HAVING COUNT(*) > 1
        ORDER BY frequency DESC
        LIMIT 20
      `;
      
      return new Promise((resolve, reject) => {
        this.db.all(sql, [groupId, minLength], (err, rows) => {
          if (err) {
            logger.error('Error getting popular topics:', err.message);
            reject(err);
          } else {
            resolve(rows || []);
          }
        });
      });
    } catch (error) {
      logger.error('Error in getPopularTopics:', error);
      throw error;
    }
  }

  // ===== CONTACT METHODS =====

  /**
   * Save or update a contact
   */
  async upsertContact(contactData) {
    const sql = `
      INSERT INTO contacts (id, name, phone_number, is_group, profile_picture_url, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = COALESCE(excluded.name, contacts.name),
        phone_number = COALESCE(excluded.phone_number, contacts.phone_number),
        is_group = COALESCE(excluded.is_group, contacts.is_group),
        profile_picture_url = COALESCE(excluded.profile_picture_url, contacts.profile_picture_url),
        status = COALESCE(excluded.status, contacts.status),
        last_seen = CURRENT_TIMESTAMP
    `;
    
    const params = [
      contactData.id,
      contactData.name || null,
      contactData.phoneNumber || null,
      contactData.isGroup ? 1 : 0,
      contactData.profilePictureUrl || null,
      contactData.status || null
    ];

    try {
      const result = await this.runQuery(sql, params);
      logger.debug(`Contact upserted: ${contactData.id}`);
      return result;
    } catch (error) {
      logger.error('Failed to upsert contact:', error);
      throw error;
    }
  }

  /**
   * Get contact by ID
   */
  async getContact(contactId) {
    const sql = 'SELECT * FROM contacts WHERE id = ?';
    return await this.getQuery(sql, [contactId]);
  }

  /**
   * Search contacts by name or phone
   */
  async searchContacts(searchTerm, limit = 20) {
    const sql = `
      SELECT * FROM contacts 
      WHERE name LIKE ? OR phone_number LIKE ?
      ORDER BY last_seen DESC
      LIMIT ?
    `;
    const pattern = `%${searchTerm}%`;
    return await this.allQuery(sql, [pattern, pattern, limit]);
  }

  // ===== CHAT METADATA METHODS =====

  /**
   * Save or update chat metadata
   */
  async upsertChatMetadata(chatData) {
    const sql = `
      INSERT INTO chat_metadata 
      (id, name, chat_type, description, participant_count, creation_time, 
       is_active, last_activity, archive_status, pinned, muted, owner_id,
       subject_changed_at, subject_changed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = COALESCE(excluded.name, chat_metadata.name),
        description = COALESCE(excluded.description, chat_metadata.description),
        participant_count = COALESCE(excluded.participant_count, chat_metadata.participant_count),
        is_active = COALESCE(excluded.is_active, chat_metadata.is_active),
        last_activity = COALESCE(excluded.last_activity, chat_metadata.last_activity),
        archive_status = COALESCE(excluded.archive_status, chat_metadata.archive_status),
        pinned = COALESCE(excluded.pinned, chat_metadata.pinned),
        muted = COALESCE(excluded.muted, chat_metadata.muted),
        owner_id = COALESCE(excluded.owner_id, chat_metadata.owner_id),
        subject_changed_at = COALESCE(excluded.subject_changed_at, chat_metadata.subject_changed_at),
        subject_changed_by = COALESCE(excluded.subject_changed_by, chat_metadata.subject_changed_by),
        updated_at = CURRENT_TIMESTAMP
    `;
    
    const params = [
      chatData.id,
      chatData.name,
      chatData.chatType || 'private',
      chatData.description || null,
      chatData.participantCount || 0,
      chatData.creationTime || null,
      chatData.isActive !== undefined ? (chatData.isActive ? 1 : 0) : 1,
      chatData.lastActivity || null,
      chatData.archiveStatus ? 1 : 0,
      chatData.pinned ? 1 : 0,
      chatData.muted ? 1 : 0,
      chatData.ownerId || null,
      chatData.subjectChangedAt || null,
      chatData.subjectChangedBy || null
    ];

    try {
      const result = await this.runQuery(sql, params);
      logger.debug(`Chat metadata upserted: ${chatData.id}`);
      return result;
    } catch (error) {
      logger.error('Failed to upsert chat metadata:', error);
      throw error;
    }
  }

  /**
   * Get chat metadata by ID
   */
  async getChatMetadata(chatId) {
    const sql = 'SELECT * FROM chat_metadata WHERE id = ?';
    return await this.getQuery(sql, [chatId]);
  }

  /**
   * Get active chats ordered by last activity
   */
  async getActiveChats(limit = 50) {
    const sql = `
      SELECT * FROM chat_metadata 
      WHERE is_active = 1 
      ORDER BY last_activity DESC 
      LIMIT ?
    `;
    return await this.allQuery(sql, [limit]);
  }

  /**
   * Update chat last activity
   */
  async updateChatActivity(chatId, timestamp) {
    const sql = 'UPDATE chat_metadata SET last_activity = ? WHERE id = ?';
    return await this.runQuery(sql, [timestamp, chatId]);
  }

  // ===== HISTORY SYNC STATISTICS =====

  /**
   * Update bot stats with history sync count
   */
  async updateHistorySyncStats(count) {
    const today = new Date().toISOString().split('T')[0];
    const sql = `
      INSERT INTO bot_stats (stat_date, history_sync_count)
      VALUES (?, ?)
      ON CONFLICT(stat_date) DO UPDATE SET
        history_sync_count = history_sync_count + excluded.history_sync_count
    `;
    return await this.runQuery(sql, [today, count]);
  }

  // ===== ADVANCED HISTORY QUERIES =====

  /**
   * Get messages from a specific date range
   */
  async getMessagesByDateRange(groupId, startDate, endDate) {
    const sql = `
      SELECT m.*, g.name as group_name
      FROM messages m
      JOIN groups g ON m.group_id = g.id
      WHERE m.group_id = ? 
        AND m.timestamp BETWEEN ? AND ?
      ORDER BY m.timestamp ASC
    `;
    
    return await this.allQuery(sql, [
      groupId,
      startDate.toISOString(),
      endDate.toISOString()
    ]);
  }

  /**
   * Search messages by content
   */
  async searchMessagesContent(groupId, searchTerm) {
    const sql = `
      SELECT m.*, g.name as group_name
      FROM messages m
      JOIN groups g ON m.group_id = g.id
      WHERE m.group_id = ? 
        AND m.content LIKE ?
        AND m.message_type = 'text'
      ORDER BY m.timestamp DESC
      LIMIT 50
    `;
    
    return await this.allQuery(sql, [groupId, `%${searchTerm}%`]);
  }

  /**
   * Get activity timeline for group
   */
  async getActivityTimeline(groupId, days) {
    const sql = `
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as count,
        COUNT(DISTINCT sender_id) as active_users
      FROM messages
      WHERE group_id = ?
        AND timestamp >= datetime('now', '-${days} days')
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `;
    
    return await this.allQuery(sql, [groupId]);
  }

  /**
   * Get peak hour for group activity
   */
  async getPeakHour(groupId, days) {
    const sql = `
      SELECT 
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM messages
      WHERE group_id = ?
        AND timestamp >= datetime('now', '-${days} days')
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `;
    
    const result = await this.getQuery(sql, [groupId]);
    return result;
  }

  /**
   * Get comprehensive group statistics
   */
  async getComprehensiveGroupStats(groupId) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

    // Total messages
    const totalMessages = await this.getQuery(`
      SELECT COUNT(*) as count FROM messages WHERE group_id = ?
    `, [groupId]);

    // Active users count
    const activeUsers = await this.getQuery(`
      SELECT COUNT(DISTINCT sender_id) as count 
      FROM messages 
      WHERE group_id = ? AND timestamp >= datetime('now', '-30 days')
    `, [groupId]);

    // Weekly messages
    const weekMessages = await this.getQuery(`
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE group_id = ? AND timestamp >= datetime('now', '-7 days')
    `, [groupId]);

    // Top users
    const topUsers = await this.allQuery(`
      SELECT sender_name as name, COUNT(*) as count
      FROM messages
      WHERE group_id = ? AND timestamp >= datetime('now', '-30 days')
      GROUP BY sender_id, sender_name
      ORDER BY count DESC
      LIMIT 10
    `, [groupId]);

    // Peak hours
    const peakHours = await this.allQuery(`
      SELECT 
        CAST(strftime('%H', timestamp) AS INTEGER) as hour,
        COUNT(*) as count
      FROM messages
      WHERE group_id = ? AND timestamp >= datetime('now', '-30 days')
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 5
    `, [groupId]);

    // Oldest message
    const oldestMessage = await this.getQuery(`
      SELECT MIN(timestamp) as oldest FROM messages WHERE group_id = ?
    `, [groupId]);

    // Calculate daily average
    const firstMessageDate = oldestMessage?.oldest ? new Date(oldestMessage.oldest) : new Date();
    const daysSinceFirst = Math.max(1, Math.floor((now - firstMessageDate) / (24 * 60 * 60 * 1000)));
    const dailyAverage = totalMessages ? totalMessages.count / daysSinceFirst : 0;

    return {
      total_messages: totalMessages?.count || 0,
      active_users: activeUsers?.count || 0,
      week_messages: weekMessages?.count || 0,
      daily_average: dailyAverage,
      top_users: topUsers || [],
      peak_hours: peakHours || [],
      oldest_message: oldestMessage?.oldest || null
    };
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            logger.error('Error closing database:', err.message);
            reject(err);
          } else {
            logger.info('📊 Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check if database is initialized
   */
  isReady() {
    return this.isInitialized && this.db;
  }

  // ========================================
  // 🚀 NEW v5.0 METHODS - DB-Driven Scheduler
  // ========================================

  /**
   * Create v5.0 tables from schema-v5.sql
   */
  async createTablesV5() {
    try {
      const schemaV5Path = path.join(__dirname, 'schema-v5.sql');
      
      if (!fs.existsSync(schemaV5Path)) {
        throw new Error(`Schema v5.0 file not found: ${schemaV5Path}`);
      }

      const schema = fs.readFileSync(schemaV5Path, 'utf8');
      const statements = this.splitSQLStatements(schema);
      
      logger.info('🚀 Creating v5.0 database schema...');
      
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          await this.runQuery(trimmed);
        }
      }
      
      logger.info('✅ Schema v5.0 created successfully');
      return true;
    } catch (error) {
      logger.error('❌ Failed to create v5.0 schema:', error);
      throw error;
    }
  }

  // ========================================
  // 📋 SCHEDULED TASKS METHODS
  // ========================================

  /**
   * Create a new scheduled task
   */
  async createScheduledTask(taskData) {
    const sql = `
      INSERT INTO scheduled_tasks (
        name, description, action_type, target_groups, 
        cron_expression, custom_query, send_to_group, 
        active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      taskData.name,
      taskData.description || null,
      taskData.action_type,
      JSON.stringify(taskData.target_groups),
      taskData.cron_expression,
      taskData.custom_query || null,
      taskData.send_to_group,
      taskData.active !== undefined ? taskData.active : true,
      taskData.created_by || 'system'
    ];

    try {
      const result = await this.runQuery(sql, params);
      logger.info(`✅ Created scheduled task: ${taskData.name} (ID: ${result.lastID})`);
      return { id: result.lastID, ...taskData };
    } catch (error) {
      logger.error('❌ Failed to create scheduled task:', error);
      throw error;
    }
  }

  /**
   * Update an existing scheduled task
   */
  async updateScheduledTask(taskId, updateData) {
    const allowedFields = [
      'name', 'description', 'action_type', 'target_groups',
      'cron_expression', 'custom_query', 'send_to_group', 'active'
    ];

    const updates = [];
    const params = [];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`);
        if (key === 'target_groups' && Array.isArray(updateData[key])) {
          params.push(JSON.stringify(updateData[key]));
        } else {
          params.push(updateData[key]);
        }
      }
    });

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(taskId);

    const sql = `UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE id = ?`;

    try {
      const result = await this.runQuery(sql, params);
      if (result.changes === 0) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      logger.info(`✅ Updated scheduled task ID: ${taskId}`);
      return await this.getScheduledTaskById(taskId);
    } catch (error) {
      logger.error('❌ Failed to update scheduled task:', error);
      throw error;
    }
  }

  /**
   * Get all scheduled tasks (active by default)
   */
  async getScheduledTasks(activeOnly = true) {
    const sql = activeOnly 
      ? 'SELECT * FROM scheduled_tasks WHERE active = 1 ORDER BY next_execution ASC'
      : 'SELECT * FROM scheduled_tasks ORDER BY created_at DESC';

    try {
      const tasks = await this.allQuery(sql);
      return tasks.map(task => ({
        ...task,
        target_groups: JSON.parse(task.target_groups || '[]')
      }));
    } catch (error) {
      logger.error('❌ Failed to get scheduled tasks:', error);
      return [];
    }
  }

  /**
   * Get scheduled task by ID
   */
  async getScheduledTaskById(taskId) {
    const sql = 'SELECT * FROM scheduled_tasks WHERE id = ?';
    
    try {
      const task = await this.getQuery(sql, [taskId]);
      if (!task) return null;
      
      return {
        ...task,
        target_groups: JSON.parse(task.target_groups || '[]')
      };
    } catch (error) {
      logger.error('❌ Failed to get scheduled task by ID:', error);
      return null;
    }
  }

  /**
   * Delete a scheduled task
   */
  async deleteScheduledTask(taskId) {
    const sql = 'DELETE FROM scheduled_tasks WHERE id = ?';
    
    try {
      const result = await this.runQuery(sql, [taskId]);
      if (result.changes === 0) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      logger.info(`✅ Deleted scheduled task ID: ${taskId}`);
      return true;
    } catch (error) {
      logger.error('❌ Failed to delete scheduled task:', error);
      throw error;
    }
  }

  /**
   * Update task next execution time
   */
  async updateTaskNextExecution(taskId, nextExecutionTime) {
    const sql = `
      UPDATE scheduled_tasks 
      SET next_execution = ?, last_execution = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    try {
      await this.runQuery(sql, [nextExecutionTime, taskId]);
      logger.debug(`Updated next execution for task ${taskId}: ${nextExecutionTime}`);
    } catch (error) {
      logger.error('❌ Failed to update task execution time:', error);
      throw error;
    }
  }

  // ========================================
  // 📊 TASK EXECUTION LOGGING METHODS
  // ========================================

  /**
   * Log task execution start
   */
  async logTaskExecutionStart(taskId, aiQuery, sessionId = null) {
    const sql = `
      INSERT INTO task_execution_logs (
        task_id, ai_query, session_id, success
      ) VALUES (?, ?, ?, 0)
    `;
    
    try {
      const result = await this.runQuery(sql, [taskId, aiQuery, sessionId]);
      logger.debug(`Started execution log for task ${taskId} (Log ID: ${result.lastID})`);
      return result.lastID;
    } catch (error) {
      logger.error('❌ Failed to log task execution start:', error);
      throw error;
    }
  }

  /**
   * Update task execution log with results
   */
  async logTaskExecutionEnd(logId, executionData) {
    const sql = `
      UPDATE task_execution_logs SET
        ai_response = ?,
        ai_model = ?,
        ai_tokens_used = ?,
        ai_processing_time = ?,
        tools_used = ?,
        tools_data = ?,
        database_queries = ?,
        database_results = ?,
        success = ?,
        error_message = ?,
        output_message = ?,
        output_sent_to = ?,
        total_execution_time = ?,
        memory_usage = ?,
        execution_context = ?,
        execution_type = ?,
        groups_processed = ?,
        messages_analyzed = ?,
        execution_end = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const params = [
      executionData.ai_response || null,
      executionData.ai_model || 'claude-3.5-sonnet',
      executionData.ai_tokens_used || 0,
      executionData.ai_processing_time || 0,
      executionData.tools_used ? JSON.stringify(executionData.tools_used) : null,
      executionData.tools_data ? JSON.stringify(executionData.tools_data) : null,
      executionData.database_queries || 0,
      executionData.database_results || 0,
      executionData.success || false,
      executionData.error_message || null,
      executionData.output_message || null,
      executionData.output_sent_to || null,
      executionData.total_execution_time || 0,
      executionData.memory_usage || 0,
      executionData.execution_context ? JSON.stringify(executionData.execution_context) : null,
      executionData.execution_type || 'scheduled',
      executionData.groups_processed || 0,
      executionData.messages_analyzed || 0,
      logId
    ];

    try {
      await this.runQuery(sql, params);
      logger.debug(`Completed execution log ID: ${logId}`);
      return true;
    } catch (error) {
      logger.error('❌ Failed to log task execution end:', error);
      throw error;
    }
  }

  /**
   * Get task execution logs
   */
  async getTaskExecutionLogs(taskId, limit = 50) {
    const sql = `
      SELECT tel.*, st.name as task_name
      FROM task_execution_logs tel
      JOIN scheduled_tasks st ON tel.task_id = st.id
      WHERE tel.task_id = ?
      ORDER BY tel.execution_start DESC
      LIMIT ?
    `;

    try {
      const logs = await this.allQuery(sql, [taskId, limit]);
      return logs.map(log => ({
        ...log,
        tools_used: log.tools_used ? JSON.parse(log.tools_used) : null,
        tools_data: log.tools_data ? JSON.parse(log.tools_data) : null,
        execution_context: log.execution_context ? JSON.parse(log.execution_context) : null
      }));
    } catch (error) {
      logger.error('❌ Failed to get task execution logs:', error);
      return [];
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(days = 30) {
    const sql = `
      SELECT 
        COUNT(*) as total_executions,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_executions,
        AVG(total_execution_time) as avg_execution_time,
        AVG(ai_tokens_used) as avg_tokens_used,
        SUM(messages_analyzed) as total_messages_analyzed,
        SUM(groups_processed) as total_groups_processed
      FROM task_execution_logs 
      WHERE execution_start >= datetime('now', '-${days} days')
    `;

    try {
      const stats = await this.getQuery(sql);
      return {
        total_executions: stats?.total_executions || 0,
        successful_executions: stats?.successful_executions || 0,
        failed_executions: stats?.failed_executions || 0,
        success_rate: stats?.total_executions > 0 
          ? ((stats.successful_executions / stats.total_executions) * 100).toFixed(2)
          : '0.00',
        avg_execution_time: Math.round(stats?.avg_execution_time || 0),
        avg_tokens_used: Math.round(stats?.avg_tokens_used || 0),
        total_messages_analyzed: stats?.total_messages_analyzed || 0,
        total_groups_processed: stats?.total_groups_processed || 0
      };
    } catch (error) {
      logger.error('❌ Failed to get execution stats:', error);
      return null;
    }
  }

  // ========================================
  // 🔄 MIGRATION HELPER METHODS  
  // ========================================

  /**
   * Check if v5.0 tables exist
   */
  async hasV5Tables() {
    const sql = `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('scheduled_tasks', 'task_execution_logs')
    `;
    
    try {
      const tables = await this.allQuery(sql);
      return tables.length === 2;
    } catch (error) {
      logger.error('❌ Failed to check v5.0 tables:', error);
      return false;
    }
  }

  /**
   * Migrate data from text files to database
   * Called from migration script
   */
  async migrateFromTextFiles(schedulesData) {
    try {
      logger.info('🔄 Starting migration from text files to database...');
      
      const migratedTasks = [];
      
      for (const schedule of schedulesData) {
        try {
          const taskData = {
            name: schedule.name || `Task-${Date.now()}`,
            description: schedule.description || 'Migrated from text file',
            action_type: this.mapLegacyActionType(schedule.action),
            target_groups: schedule.groups || [],
            cron_expression: this.convertScheduleToCron(schedule.schedule),
            send_to_group: schedule.send_to || 'ניצן',
            active: true,
            created_by: 'migration'
          };

          const created = await this.createScheduledTask(taskData);
          migratedTasks.push(created);
          
        } catch (taskError) {
          logger.error(`Failed to migrate schedule: ${schedule.name}`, taskError);
        }
      }
      
      logger.info(`✅ Migration completed: ${migratedTasks.length} tasks migrated`);
      return migratedTasks;
      
    } catch (error) {
      logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Map legacy action types to v5.0 types
   */
  mapLegacyActionType(legacyAction) {
    const mapping = {
      'daily_summary': 'daily_summary',
      'latest_message': 'latest_message',  // This stays as is for compatibility
      'summary': 'daily_summary',
      'today': 'today_summary'
    };
    
    return mapping[legacyAction] || 'daily_summary';
  }

  /**
   * Convert legacy schedule format to cron
   */
  convertScheduleToCron(scheduleText) {
    if (!scheduleText) return '0 16 * * *'; // Default: daily at 4 PM
    
    // Parse common patterns
    if (scheduleText.includes('every day at')) {
      const timeMatch = scheduleText.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const [, hour, minute] = timeMatch;
        return `${minute} ${hour} * * *`;
      }
    }
    
    // Default fallback
    return '0 16 * * *';
  }
}

module.exports = DatabaseManager;