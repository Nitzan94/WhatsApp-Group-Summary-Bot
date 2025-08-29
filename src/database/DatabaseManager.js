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
}

module.exports = DatabaseManager;