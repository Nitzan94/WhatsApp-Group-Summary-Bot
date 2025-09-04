const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * ConfigService - ניהול הגדרות ווב וסנכרון עם קבצים
 * מתאם בין ממשק הווב למערכת המבוססת קבצים הקיימת
 */
class ConfigService {
  constructor(db) {
    this.db = db;
    this.schedulesPath = path.join(__dirname, '../../schedules');
    
    // Ensure schedules directory exists
    this.ensureSchedulesDirectory();
  }

  async ensureSchedulesDirectory() {
    try {
      await fs.access(this.schedulesPath);
    } catch (error) {
      await fs.mkdir(this.schedulesPath, { recursive: true });
      logger.info('Created schedules directory for ConfigService');
    }
  }

  // ===== Management Groups Management =====

  /**
   * Get all management groups from web config
   */
  async getManagementGroups() {
    try {
      const groups = await this.db.allQuery(`
        SELECT 
          id, key as group_name, value as group_id, active,
          resolved_name, group_exists, message_count, 
          last_message_time, created_at, updated_at
        FROM management_groups_view
        ORDER BY active DESC, created_at DESC
      `);
      
      return groups || [];
    } catch (error) {
      logger.error('Failed to get management groups:', error);
      return [];
    }
  }

  /**
   * Add new management group by name
   * @param {string} groupName - Name of the group to add
   * @returns {Object} Result with success status and group data
   */
  async addManagementGroup(groupName) {
    try {
      // 1. Search for group by name in database
      const groupSearchResult = await this.searchGroupByName(groupName);
      
      if (!groupSearchResult.found) {
        return {
          success: false,
          error: 'Group not found',
          message: `לא נמצאה קבוצה בשם "${groupName}". ודא שהבוט חבר לקבוצה.`,
          suggestions: groupSearchResult.suggestions
        };
      }

      // 2. Check if already exists
      const existing = await this.db.getQuery(`
        SELECT id FROM web_config 
        WHERE category = 'management_groups' AND key = ?
      `, [groupName]);

      if (existing) {
        return {
          success: false,
          error: 'Group already exists',
          message: `קבוצה "${groupName}" כבר קיימת ברשימת קבוצות הניהול`
        };
      }

      // 3. Add to web_config
      await this.db.runQuery(`
        INSERT INTO web_config (category, key, value, metadata, active)
        VALUES ('management_groups', ?, ?, ?, 1)
      `, [
        groupName,
        groupSearchResult.groupId,
        JSON.stringify({
          resolved_at: new Date().toISOString(),
          message_count: groupSearchResult.messageCount || 0
        })
      ]);

      logger.info(`Added management group: ${groupName} (${groupSearchResult.groupId})`);

      return {
        success: true,
        message: `קבוצה "${groupName}" נוספה בהצלחה לקבוצות הניהול`,
        group: {
          name: groupName,
          groupId: groupSearchResult.groupId,
          messageCount: groupSearchResult.messageCount || 0
        }
      };

    } catch (error) {
      logger.error('Failed to add management group:', error);
      return {
        success: false,
        error: 'Database error',
        message: 'שגיאה בהוספת קבוצת ניהול'
      };
    }
  }

  /**
   * Remove management group
   */
  async removeManagementGroup(groupId) {
    try {
      const result = await this.db.runQuery(`
        DELETE FROM web_config 
        WHERE category = 'management_groups' AND id = ?
      `, [groupId]);

      if (result.changes > 0) {
        logger.info(`Removed management group with ID: ${groupId}`);
        return {
          success: true,
          message: 'קבוצת הניהול הוסרה בהצלחה'
        };
      } else {
        return {
          success: false,
          error: 'Group not found',
          message: 'קבוצת הניהול לא נמצאה'
        };
      }
    } catch (error) {
      logger.error('Failed to remove management group:', error);
      return {
        success: false,
        error: 'Database error',
        message: 'שגיאה בהסרת קבוצת ניהול'
      };
    }
  }

  /**
   * Search for group by name in database
   */
  async searchGroupByName(groupName) {
    try {
      // First try exact match
      let group = await this.db.getQuery(`
        SELECT g.id, g.name, COUNT(m.id) as message_count
        FROM groups g 
        LEFT JOIN messages m ON g.id = m.group_id
        WHERE LOWER(g.name) = LOWER(?) AND g.is_active = 1
        GROUP BY g.id, g.name 
        ORDER BY message_count DESC 
        LIMIT 1
      `, [groupName]);

      if (group) {
        return {
          found: true,
          groupId: group.id,
          groupName: group.name,
          messageCount: group.message_count
        };
      }

      // If no exact match, try partial match
      group = await this.db.getQuery(`
        SELECT g.id, g.name, COUNT(m.id) as message_count
        FROM groups g 
        LEFT JOIN messages m ON g.id = m.group_id
        WHERE LOWER(g.name) LIKE LOWER(?) AND g.is_active = 1
        GROUP BY g.id, g.name 
        ORDER BY message_count DESC 
        LIMIT 1
      `, [`%${groupName}%`]);

      if (group) {
        return {
          found: true,
          groupId: group.id,
          groupName: group.name,
          messageCount: group.message_count
        };
      }

      // Get suggestions for similar names
      const suggestions = await this.db.allQuery(`
        SELECT g.name, COUNT(m.id) as message_count
        FROM groups g 
        LEFT JOIN messages m ON g.id = m.group_id
        WHERE g.is_active = 1
        GROUP BY g.id, g.name 
        ORDER BY message_count DESC 
        LIMIT 5
      `);

      return {
        found: false,
        suggestions: suggestions.map(s => s.name)
      };

    } catch (error) {
      logger.error('Failed to search group by name:', error);
      return { found: false, suggestions: [] };
    }
  }

  // ===== API Key Management =====

  /**
   * Get API key status (masked for security)
   */
  async getApiKeyStatus() {
    try {
      const config = require('../../config/bot-config');
      const apiKey = config.openrouter.apiKey;
      
      if (!apiKey) {
        return {
          keyPresent: false,
          status: 'missing'
        };
      }

      return {
        keyPresent: true,
        keyMasked: this.maskApiKey(apiKey),
        model: config.openrouter.model,
        status: 'present', // TODO: Add actual API test
        lastUsed: null // TODO: Track usage
      };

    } catch (error) {
      logger.error('Failed to get API key status:', error);
      return {
        keyPresent: false,
        status: 'error'
      };
    }
  }

  /**
   * Test API key connection
   */
  async testApiKey(apiKey = null) {
    try {
      const testKey = apiKey || require('../../config/bot-config').openrouter.apiKey;
      
      if (!testKey) {
        return {
          success: false,
          error: 'No API key provided'
        };
      }

      // TODO: Implement actual API test call
      // For now, just validate format
      if (!testKey.startsWith('sk-or-v1-')) {
        return {
          success: false,
          error: 'Invalid API key format'
        };
      }

      return {
        success: true,
        message: 'API key format is valid'
      };

    } catch (error) {
      logger.error('Failed to test API key:', error);
      return {
        success: false,
        error: 'API test failed'
      };
    }
  }

  /**
   * Mask API key for display
   */
  maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8) {
      return '••••••••';
    }
    return apiKey.substring(0, 12) + '••••••••' + apiKey.slice(-4);
  }

  // ===== Task Management =====

  /**
   * Get all web tasks
   */
  async getWebTasks(type = null) {
    try {
      let query = `
        SELECT 
          wt.*,
          COUNT(te.id) as total_executions,
          COUNT(CASE WHEN te.status = 'completed' THEN 1 END) as successful_executions,
          MAX(te.executed_at) as last_execution
        FROM web_tasks wt
        LEFT JOIN task_executions te ON wt.id = te.task_id
      `;
      
      const params = [];
      if (type) {
        query += ' WHERE wt.task_type = ?';
        params.push(type);
      }
      
      query += ' GROUP BY wt.id ORDER BY wt.created_at DESC';
      
      const tasks = await this.db.allQuery(query, params);
      
      // Parse JSON fields
      return tasks.map(task => ({
        ...task,
        target_groups: task.target_groups ? JSON.parse(task.target_groups) : [],
        next_run: this.calculateNextRun(task)
      }));

    } catch (error) {
      logger.error('Failed to get web tasks:', error);
      return [];
    }
  }

  /**
   * Create new web task
   */
  async createWebTask(taskData) {
    try {
      const {
        name, task_type, cron_expression, execute_at,
        action_type, target_groups, message_template, send_to_group
      } = taskData;

      // Validate required fields
      if (!name || !task_type || !action_type) {
        return {
          success: false,
          error: 'Missing required fields'
        };
      }

      // Validate task type specific fields
      if (task_type === 'scheduled' && !cron_expression) {
        return {
          success: false,
          error: 'Scheduled tasks require cron expression'
        };
      }

      if (task_type === 'one_time' && !execute_at) {
        return {
          success: false,
          error: 'One-time tasks require execution date'
        };
      }

      // Insert into database
      const result = await this.db.runQuery(`
        INSERT INTO web_tasks (
          name, task_type, cron_expression, execute_at,
          action_type, target_groups, message_template, send_to_group
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, task_type, cron_expression, execute_at,
        action_type, JSON.stringify(target_groups || []), 
        message_template, send_to_group
      ]);

      const taskId = result.lastID;

      // Sync to file system
      await this.syncTaskToFile(taskId);

      logger.info(`Created web task: ${name} (ID: ${taskId})`);

      return {
        success: true,
        message: 'משימה נוצרה בהצלחה',
        taskId: taskId
      };

    } catch (error) {
      logger.error('Failed to create web task:', error);
      return {
        success: false,
        error: 'Database error',
        message: 'שגיאה ביצירת המשימה'
      };
    }
  }

  /**
   * Update existing web task
   */
  async updateWebTask(taskId, taskData) {
    try {
      const updates = [];
      const params = [];
      
      // Build dynamic update query
      const updateableFields = [
        'name', 'cron_expression', 'execute_at', 'action_type',
        'target_groups', 'message_template', 'send_to_group', 'active'
      ];

      updateableFields.forEach(field => {
        if (taskData.hasOwnProperty(field)) {
          updates.push(`${field} = ?`);
          if (field === 'target_groups') {
            params.push(JSON.stringify(taskData[field]));
          } else {
            params.push(taskData[field]);
          }
        }
      });

      if (updates.length === 0) {
        return {
          success: false,
          error: 'No fields to update'
        };
      }

      params.push(taskId);

      await this.db.runQuery(`
        UPDATE web_tasks 
        SET ${updates.join(', ')} 
        WHERE id = ?
      `, params);

      // Sync to file system
      await this.syncTaskToFile(taskId);

      logger.info(`Updated web task: ${taskId}`);

      return {
        success: true,
        message: 'משימה עודכנה בהצלחה'
      };

    } catch (error) {
      logger.error('Failed to update web task:', error);
      return {
        success: false,
        error: 'Database error',
        message: 'שגיאה בעדכון המשימה'
      };
    }
  }

  /**
   * Delete web task
   */
  async deleteWebTask(taskId) {
    try {
      // Get task info before deletion
      const task = await this.db.getQuery(
        'SELECT file_path FROM web_tasks WHERE id = ?',
        [taskId]
      );

      // Delete from database
      const result = await this.db.runQuery(
        'DELETE FROM web_tasks WHERE id = ?',
        [taskId]
      );

      if (result.changes > 0) {
        // Delete associated file if exists
        if (task && task.file_path) {
          try {
            await fs.unlink(task.file_path);
          } catch (fileError) {
            logger.warn(`Could not delete task file: ${task.file_path}`);
          }
        }

        logger.info(`Deleted web task: ${taskId}`);
        return {
          success: true,
          message: 'משימה נמחקה בהצלחה'
        };
      } else {
        return {
          success: false,
          error: 'Task not found'
        };
      }

    } catch (error) {
      logger.error('Failed to delete web task:', error);
      return {
        success: false,
        error: 'Database error'
      };
    }
  }

  // ===== File Synchronization =====

  /**
   * Sync web task to file system
   */
  async syncTaskToFile(taskId) {
    try {
      const task = await this.db.getQuery(`
        SELECT * FROM web_tasks WHERE id = ?
      `, [taskId]);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Only sync scheduled tasks to files (one-time tasks are web-only)
      if (task.task_type !== 'scheduled') {
        return;
      }

      const fileContent = this.convertTaskToFileFormat(task);
      const fileName = `web-task-${taskId}.txt`;
      const filePath = path.join(this.schedulesPath, fileName);

      // Atomic write
      const tempPath = filePath + '.tmp';
      await fs.writeFile(tempPath, fileContent, 'utf8');
      await fs.rename(tempPath, filePath);

      // Update file path in database
      await this.db.runQuery(
        'UPDATE web_tasks SET file_path = ? WHERE id = ?',
        [filePath, taskId]
      );

      logger.info(`Synced task ${taskId} to file: ${fileName}`);

    } catch (error) {
      logger.error(`Failed to sync task ${taskId} to file:`, error);
    }
  }

  /**
   * Convert web task to file format
   */
  convertTaskToFileFormat(task) {
    const targetGroups = task.target_groups ? 
      JSON.parse(task.target_groups).join('\n') : '';
    
    const schedule = this.cronToHumanReadable(task.cron_expression);

    return `# ${task.name}
# Created by web interface at ${new Date(task.created_at).toLocaleString('he-IL')}

groups:
${targetGroups}

action: ${task.action_type}
schedule: ${schedule}
send to: ${task.send_to_group || 'ניצן'}

---

`;
  }

  /**
   * Convert cron expression to human readable Hebrew
   */
  cronToHumanReadable(cronExpression) {
    if (!cronExpression) return 'לא הוגדר';
    
    // Basic conversion for common patterns
    if (cronExpression === '0 18 * * *') return 'every day at 18:00';
    if (cronExpression === '0 16 * * *') return 'every day at 16:00';
    if (cronExpression.startsWith('0 ') && cronExpression.endsWith(' * * *')) {
      const hour = cronExpression.split(' ')[1];
      return `every day at ${hour}:00`;
    }
    
    return cronExpression; // Fallback to raw cron
  }

  /**
   * Calculate next run time for scheduled task
   */
  calculateNextRun(task) {
    if (task.task_type === 'one_time') {
      return task.execute_at;
    }
    
    if (task.task_type === 'scheduled' && task.cron_expression) {
      // TODO: Use cron parser to calculate next run
      // For now, return placeholder
      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    
    return null;
  }

  // ===== General Configuration =====

  /**
   * Get web configuration value
   */
  async getWebConfig(category, key = null) {
    try {
      let query = 'SELECT * FROM web_config WHERE category = ?';
      const params = [category];
      
      if (key) {
        query += ' AND key = ?';
        params.push(key);
      }
      
      if (key) {
        const result = await this.db.getQuery(query, params);
        return result ? result.value : null;
      } else {
        return await this.db.allQuery(query, params);
      }
    } catch (error) {
      logger.error('Failed to get web config:', error);
      return null;
    }
  }

  /**
   * Set web configuration value
   */
  async setWebConfig(category, key, value, metadata = null) {
    try {
      await this.db.runQuery(`
        INSERT OR REPLACE INTO web_config (category, key, value, metadata)
        VALUES (?, ?, ?, ?)
      `, [category, key, value, metadata ? JSON.stringify(metadata) : null]);
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to set web config:', error);
      return { success: false, error: 'Database error' };
    }
  }

  /**
   * Initialize default web configuration
   */
  async initializeWebConfig() {
    try {
      // Ensure web tables exist
      await this.db.getQuery(`
        -- This will be executed when ConfigService is initialized
        -- Web tables should already exist from schema.sql
        SELECT name FROM sqlite_master WHERE type='table' AND name='web_config';
      `);
      
      logger.info('Web configuration tables initialized');
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize web config:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ConfigService;