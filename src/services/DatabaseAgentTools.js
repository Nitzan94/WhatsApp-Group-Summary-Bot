const logger = require('../utils/logger');

/**
 * DatabaseAgentTools - כלים למסד נתונים עבור AI Agent
 * מאפשר ל-AI לחפש ולקרוא הודעות בעצמו
 */
class DatabaseAgentTools {
  constructor(databaseManager) {
    this.db = databaseManager;
  }

  /**
   * חיפוש קבוצות - ה-AI יכול לראות איזה קבוצות קיימות
   */
  async searchGroups(searchTerm = null) {
    try {
      let sql = `SELECT id, name FROM groups WHERE is_active = 1`;
      const params = [];
      
      if (searchTerm) {
        sql += ` AND LOWER(name) LIKE LOWER(?)`;
        params.push(`%${searchTerm}%`);
      }
      
      sql += ` ORDER BY name`;
      const groups = await this.db.allQuery(sql, params);
      
      logger.info(`🔍 [DB TOOLS] Found ${groups.length} groups for search: "${searchTerm || 'all'}"`);
      return groups;
      
    } catch (error) {
      logger.error('Error in searchGroups:', error);
      return [];
    }
  }

  /**
   * חיפוש הודעות בקבוצה ספציפית
   */
  async searchMessagesInGroup(groupId, searchQuery = null, options = {}) {
    try {
      const {
        dateStart = null,
        dateEnd = null,
        limit = 100,
        senderName = null
      } = options;

      let sql = `
        SELECT 
          m.id,
          m.content,
          m.sender_name,
          m.timestamp,
          m.message_type,
          g.name as group_name
        FROM messages m
        JOIN groups g ON m.group_id = g.id
        WHERE m.group_id = ?
      `;
      
      const params = [groupId];
      
      // סינון לפי טקסט
      if (searchQuery) {
        sql += ` AND LOWER(m.content) LIKE LOWER(?)`;
        params.push(`%${searchQuery}%`);
      }
      
      // סינון לפי תאריך
      if (dateStart) {
        sql += ` AND m.timestamp >= ?`;
        params.push(dateStart);
      }
      
      if (dateEnd) {
        sql += ` AND m.timestamp <= ?`;
        params.push(dateEnd);
      }
      
      // סינון לפי שולח
      if (senderName) {
        sql += ` AND LOWER(m.sender_name) LIKE LOWER(?)`;
        params.push(`%${senderName}%`);
      }
      
      // סינון הודעות איכותיות
      sql += ` AND m.content IS NOT NULL 
               AND m.content NOT IN ('[undefined]', '[senderKeyDistributionMessage]', '[תמונה]', '[image]', '[sticker]', '[מדבקה]')
               AND LENGTH(m.content) > 5`;
      
      sql += ` ORDER BY m.timestamp DESC LIMIT ?`;
      params.push(limit);
      
      const messages = await this.db.allQuery(sql, params);
      
      logger.info(`🔍 [DB TOOLS] Found ${messages.length} messages in group ${groupId}`);
      return messages;
      
    } catch (error) {
      logger.error('Error in searchMessagesInGroup:', error);
      return [];
    }
  }

  /**
   * חיפוש הודעות בכל הקבוצות
   */
  async searchAllMessages(searchQuery, options = {}) {
    try {
      const {
        dateStart = null,
        dateEnd = null,
        limit = 100,
        groupName = null
      } = options;

      let sql = `
        SELECT 
          m.id,
          m.content,
          m.sender_name,
          m.timestamp,
          m.message_type,
          g.name as group_name,
          g.id as group_id
        FROM messages m
        JOIN groups g ON m.group_id = g.id
        WHERE LOWER(m.content) LIKE LOWER(?)
      `;
      
      const params = [`%${searchQuery}%`];
      
      // סינון לפי קבוצה
      if (groupName) {
        sql += ` AND LOWER(g.name) LIKE LOWER(?)`;
        params.push(`%${groupName}%`);
      }
      
      // סינון לפי תאריך
      if (dateStart) {
        sql += ` AND m.timestamp >= ?`;
        params.push(dateStart);
      }
      
      if (dateEnd) {
        sql += ` AND m.timestamp <= ?`;
        params.push(dateEnd);
      }
      
      // סינון הודעות איכותיות
      sql += ` AND m.content IS NOT NULL 
               AND m.content NOT IN ('[undefined]', '[senderKeyDistributionMessage]', '[תמונה]', '[image]', '[sticker]', '[מדבקה]')
               AND LENGTH(m.content) > 5`;
      
      sql += ` ORDER BY m.timestamp DESC LIMIT ?`;
      params.push(limit);
      
      const messages = await this.db.allQuery(sql, params);
      
      logger.info(`🔍 [DB TOOLS] Found ${messages.length} messages across all groups for: "${searchQuery}"`);
      return messages;
      
    } catch (error) {
      logger.error('Error in searchAllMessages:', error);
      return [];
    }
  }

  /**
   * קבלת הודעות אחרונות מקבוצה
   */
  async getRecentMessages(groupId, hours = 24, limit = 50) {
    try {
      const hoursAgo = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
      
      return await this.searchMessagesInGroup(groupId, null, {
        dateStart: hoursAgo,
        limit
      });
      
    } catch (error) {
      logger.error('Error in getRecentMessages:', error);
      return [];
    }
  }

  /**
   * קבלת הודעות מתאריך ספציפי
   */
  async getMessagesByDate(date, groupId = null, limit = 100) {
    try {
      // המרת תאריך ליום שלם
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      if (groupId) {
        return await this.searchMessagesInGroup(groupId, null, {
          dateStart: startDate.toISOString(),
          dateEnd: endDate.toISOString(),
          limit
        });
      } else {
        return await this.searchAllMessages('', {
          dateStart: startDate.toISOString(),
          dateEnd: endDate.toISOString(),
          limit
        });
      }
      
    } catch (error) {
      logger.error('Error in getMessagesByDate:', error);
      return [];
    }
  }

  /**
   * סטטיסטיקות קבוצה
   */
  async getGroupStats(groupId) {
    try {
      const stats = await this.db.getQuery(`
        SELECT 
          g.name,
          COUNT(m.id) as total_messages,
          COUNT(DISTINCT m.sender_name) as unique_senders,
          MIN(m.timestamp) as first_message,
          MAX(m.timestamp) as last_message
        FROM groups g
        LEFT JOIN messages m ON g.id = m.group_id
        WHERE g.id = ?
        GROUP BY g.id, g.name
      `, [groupId]);
      
      logger.info(`📊 [DB TOOLS] Stats for group ${groupId}: ${stats?.total_messages || 0} messages`);
      return stats;
      
    } catch (error) {
      logger.error('Error in getGroupStats:', error);
      return null;
    }
  }

  /**
   * המרת שם קבוצה ל-ID
   */
  async getGroupIdByName(groupName) {
    try {
      // First try exact match
      let group = await this.db.getQuery(
        `SELECT g.id, g.name, COUNT(m.id) as message_count
         FROM groups g 
         LEFT JOIN messages m ON g.id = m.group_id
         WHERE LOWER(g.name) = LOWER(?) AND g.is_active = 1 
         GROUP BY g.id, g.name
         ORDER BY message_count DESC, g.id DESC
         LIMIT 1`,
        [groupName]
      );
      
      // If no exact match, try partial match
      if (!group) {
        group = await this.db.getQuery(
          `SELECT g.id, g.name, COUNT(m.id) as message_count
           FROM groups g 
           LEFT JOIN messages m ON g.id = m.group_id
           WHERE LOWER(g.name) LIKE LOWER(?) AND g.is_active = 1 
           GROUP BY g.id, g.name
           ORDER BY message_count DESC, g.id DESC
           LIMIT 1`,
          [`%${groupName}%`]
        );
      }
      
      if (group) {
        logger.info(`🔍 [DB TOOLS] Found group "${group.name}" with ID: ${group.id} (${group.message_count} messages)`);
        return { id: group.id, name: group.name };
      }
      
      logger.info(`🔍 [DB TOOLS] No group found for name: "${groupName}"`);
      return null;
      
    } catch (error) {
      logger.error('Error in getGroupIdByName:', error);
      return null;
    }
  }

  /**
   * יצירת פונקציות כלים עבור ה-AI
   */
  createToolDefinitions() {
    return [
      {
        name: 'search_groups',
        description: 'Search for WhatsApp groups by name. Use this to find which groups exist.',
        parameters: {
          type: 'object',
          properties: {
            search_term: {
              type: 'string',
              description: 'Group name to search for (optional - leave empty to see all groups)'
            }
          }
        }
      },
      {
        name: 'search_messages_in_group',
        description: 'Search for messages within a specific group. Very useful for focused searches.',
        parameters: {
          type: 'object',
          properties: {
            group_id: {
              type: 'string',
              description: 'The group ID to search in'
            },
            search_query: {
              type: 'string',
              description: 'Text to search for in messages (optional)'
            },
            date_start: {
              type: 'string',
              description: 'Start date in ISO format (optional)'
            },
            date_end: {
              type: 'string',
              description: 'End date in ISO format (optional)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages to return (default: 100)'
            }
          },
          required: ['group_id']
        }
      },
      {
        name: 'get_recent_messages',
        description: 'Get recent messages from a group within the last X hours.',
        parameters: {
          type: 'object',
          properties: {
            group_id: {
              type: 'string',
              description: 'The group ID to get messages from'
            },
            hours: {
              type: 'number',
              description: 'How many hours back to look (default: 24)'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages (default: 50)'
            }
          },
          required: ['group_id']
        }
      },
      {
        name: 'get_messages_by_date',
        description: 'Get all messages from a specific date, optionally from a specific group.',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date to search (YYYY-MM-DD format)'
            },
            group_id: {
              type: 'string',
              description: 'Optional group ID to limit search to specific group'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of messages (default: 100)'
            }
          },
          required: ['date']
        }
      },
      {
        name: 'get_group_by_name',
        description: 'Find a group by its name and get its ID and details.',
        parameters: {
          type: 'object',
          properties: {
            group_name: {
              type: 'string',
              description: 'Name of the group to find'
            }
          },
          required: ['group_name']
        }
      },
      {
        name: 'send_message_to_group',
        description: 'Send a WhatsApp message to another group. Use this when the user asks to send/deliver/forward a message to a specific group. Examples: "תשלח לקבוצת X הודעה", "שלח הודעה לקבוצה Y", "תודיע לקבוצת Z". Only works from the Nitzan bot group.',
        parameters: {
          type: 'object',
          properties: {
            group_name: {
              type: 'string',
              description: 'Name of the target WhatsApp group to send the message to'
            },
            message: {
              type: 'string',
              description: 'The message text to send to the group'
            }
          },
          required: ['group_name', 'message']
        }
      }
    ];
  }

  /**
   * ביצוע tool call
   */
  async executeTool(toolName, parameters) {
    try {
      logger.info(`🛠️ [DB TOOLS] Executing tool: ${toolName} with params: ${JSON.stringify(parameters)}`);
      
      switch (toolName) {
        case 'search_groups':
          return await this.searchGroups(parameters.search_term);
          
        case 'search_messages_in_group':
          return await this.searchMessagesInGroup(
            parameters.group_id,
            parameters.search_query,
            {
              dateStart: parameters.date_start,
              dateEnd: parameters.date_end,
              limit: parameters.limit
            }
          );
          
        case 'get_recent_messages':
          return await this.getRecentMessages(
            parameters.group_id,
            parameters.hours,
            parameters.limit
          );
          
        case 'get_messages_by_date':
          return await this.getMessagesByDate(
            parameters.date,
            parameters.group_id,
            parameters.limit
          );
          
        case 'get_group_by_name':
          return await this.getGroupIdByName(parameters.group_name);
          
        case 'send_message_to_group':
          return await this.sendMessageToGroup(parameters.group_name, parameters.message);
          
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
      
    } catch (error) {
      logger.error(`Error executing tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Send message to a specific WhatsApp group - NEW TOOL
   */
  async sendMessageToGroup(groupName, message) {
    try {
      logger.info(`📤 [DB TOOLS] Attempting to send message to group: "${groupName}"`);
      
      // Permission check - only works from Nitzan bot group
      if (!this.isAuthorizedForSending()) {
        logger.warn(`🚫 [DB TOOLS] Unauthorized attempt to send message from non-Nitzan group`);
        return {
          success: false,
          error: 'שליחת הודעות לקבוצות אחרות מותרת רק מקבוצת ניצן'
        };
      }

      // Find group by name
      const group = await this.getGroupIdByName(groupName);
      if (!group || group.length === 0) {
        logger.warn(`🚫 [DB TOOLS] Group not found: "${groupName}"`);
        return {
          success: false,
          error: `קבוצת "${groupName}" לא נמצאה`
        };
      }

      const targetGroup = Array.isArray(group) ? group[0] : group;
      const groupId = targetGroup.id;

      // Send message via bot instance
      if (!this.botInstance || !this.botInstance.socket) {
        logger.error(`🚫 [DB TOOLS] Bot instance not available for message sending`);
        return {
          success: false,
          error: 'מערכת הבוט לא זמינה כרגע לשליחת הודעות'
        };
      }

      await this.botInstance.socket.sendMessage(groupId, { text: message });
      
      logger.info(`✅ [DB TOOLS] Message sent successfully to "${groupName}" (${groupId})`);
      return {
        success: true,
        message: `הודעה נשלחה בהצלחה לקבוצת "${groupName}"`
      };

    } catch (error) {
      logger.error(`❌ [DB TOOLS] Error sending message to group "${groupName}":`, error);
      return {
        success: false,
        error: `שגיאה בשליחת הודעה לקבוצת "${groupName}": ${error.message}`
      };
    }
  }

  /**
   * Check if current request is authorized for sending messages
   */
  isAuthorizedForSending() {
    // This will be set by ConversationHandler based on the requesting group
    const authorizedGroups = [
      '120363417758222119@g.us', // Nitzan bot group
      '972546262108-1556219067@g.us' // ניצן group
    ];
    return authorizedGroups.includes(this.currentContext?.groupId);
  }

  /**
   * Set context for permission checking
   */
  setContext(context) {
    this.currentContext = context;
  }

  /**
   * Set bot instance for message sending
   */
  setBotInstance(botInstance) {
    this.botInstance = botInstance;
  }
}

module.exports = DatabaseAgentTools;