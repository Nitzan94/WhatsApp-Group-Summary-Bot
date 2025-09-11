const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('../utils/logger');

/**
 * WebServer - Express.js server לממשק הדשבורד
 * מספק API endpoints ו-static files לניהול הבוט
 */
class WebServer {
  constructor(bot, db, configService) {
    this.bot = bot;
    this.db = db;
    this.configService = configService;
    this.app = express();
    this.server = null;
    this.port = process.env.WEB_PORT || 3001;
    this.startTime = Date.now();

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS - allow all origins for now (TODO: restrict in production)
    this.app.use(cors());

    // Body parsing middleware
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Static files serving
    const publicPath = path.join(__dirname, 'public');
    this.app.use(express.static(publicPath));

    // Add specific route for JS files
    this.app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, { 
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });

    // Error handling middleware
    this.app.use((err, req, res, next) => {
      logger.error('Express error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'שגיאה פנימית בשרת'
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime
      });
    });

    // Serve dashboard on root
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // API Routes
    this.setupApiRoutes();
  }

  /**
   * Setup API endpoints
   */
  setupApiRoutes() {
    const apiRouter = express.Router();

    // ===== Status & Monitoring =====
    
    apiRouter.get('/status', async (req, res) => {
      try {
        const botStatus = await this.getBotStatus();
        const webStatus = await this.getWebStatus();
        
        res.json({
          success: true,
          data: {
            bot: botStatus,
            web: webStatus,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        logger.error('Failed to get status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get status'
        });
      }
    });

    // Real-time status updates (Server-Sent Events)
    apiRouter.get('/status/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const sendStatus = async () => {
        try {
          const botStatus = await this.getBotStatus();
          const webStatus = await this.getWebStatus();
          
          res.write(`data: ${JSON.stringify({
            bot: botStatus,
            web: webStatus,
            timestamp: new Date().toISOString()
          })}\\n\\n`);
        } catch (error) {
          logger.error('SSE status update failed:', error);
        }
      };

      // Send initial status
      sendStatus();

      // Send updates every 5 seconds
      const interval = setInterval(sendStatus, 5000);

      // Cleanup on client disconnect
      req.on('close', () => {
        clearInterval(interval);
      });
    });

    // ===== Management Groups =====
    
    apiRouter.get('/config/management-groups', async (req, res) => {
      try {
        const groups = await this.configService.getManagementGroups();
        res.json({
          success: true,
          data: { groups }
        });
      } catch (error) {
        logger.error('Failed to get management groups:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get management groups'
        });
      }
    });

    apiRouter.post('/config/management-groups', async (req, res) => {
      try {
        const { groupName } = req.body;
        
        if (!groupName) {
          return res.status(400).json({
            success: false,
            error: 'Missing group name'
          });
        }

        const result = await this.configService.addManagementGroup(groupName);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error('Failed to add management group:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to add management group'
        });
      }
    });

    apiRouter.delete('/config/management-groups/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.configService.removeManagementGroup(id);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(404).json(result);
        }
      } catch (error) {
        logger.error('Failed to remove management group:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to remove management group'
        });
      }
    });

    // ===== Initial Setup & Available Groups =====
    
    // Check if initial setup is needed
    apiRouter.get('/setup/status', async (req, res) => {
      try {
        const groups = await this.configService.getManagementGroups();
        const needsSetup = groups.length === 0;
        
        res.json({
          success: true,
          data: {
            needsSetup,
            managementGroupsCount: groups.length,
            hasConfiguration: !needsSetup
          }
        });
      } catch (error) {
        logger.error('Failed to check setup status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to check setup status'
        });
      }
    });

    // Get available groups for setup
    apiRouter.get('/setup/groups', async (req, res) => {
      try {
        const groups = await this.db.allQuery(`
          SELECT g.id, g.name, COUNT(m.id) as message_count, g.is_active
          FROM groups g 
          LEFT JOIN messages m ON g.id = m.group_id
          WHERE g.is_active = 1
          GROUP BY g.id, g.name 
          ORDER BY message_count DESC
          LIMIT 20
        `);
        
        res.json({
          success: true,
          data: groups || []
        });
      } catch (error) {
        logger.error('Failed to get available groups:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get available groups'
        });
      }
    });

    // Complete initial setup
    apiRouter.post('/setup/complete', async (req, res) => {
      try {
        const { selectedGroupName } = req.body;
        
        if (!selectedGroupName) {
          return res.status(400).json({
            success: false,
            error: 'Missing selected group name',
            message: 'שם הקבוצה הנבחרת חסר'
          });
        }

        // Add the selected group as management group
        const result = await this.configService.addManagementGroup(selectedGroupName);
        
        if (result.success) {
          logger.info(`Initial setup completed with group: ${selectedGroupName}`);
          res.json({
            success: true,
            message: 'הגדרה ראשונית הושלמה בהצלחה',
            data: {
              managementGroup: result.group,
              setupCompleted: true
            }
          });
        } else {
          res.status(400).json(result);
        }

      } catch (error) {
        logger.error('Failed to complete initial setup:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to complete setup',
          message: 'שגיאה בהשלמת ההגדרה הראשונית'
        });
      }
    });

    // ===== API Key Management =====
    
    apiRouter.get('/config/api-key', async (req, res) => {
      try {
        const status = await this.configService.getApiKeyStatus();
        res.json({
          success: true,
          data: status
        });
      } catch (error) {
        logger.error('Failed to get API key status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get API key status'
        });
      }
    });

    apiRouter.post('/config/api-key/test', async (req, res) => {
      try {
        const { apiKey } = req.body;
        const result = await this.configService.testApiKey(apiKey);
        
        res.json(result);
      } catch (error) {
        logger.error('Failed to test API key:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to test API key'
        });
      }
    });

    apiRouter.post('/config/api-key/save', async (req, res) => {
      try {
        const { apiKey, model } = req.body;
        const result = await this.configService.saveApiKey(apiKey, model);
        
        res.json(result);
      } catch (error) {
        logger.error('Failed to save API key:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to save API key'
        });
      }
    });

    // ===== Task Management =====
    
    apiRouter.get('/tasks', async (req, res) => {
      try {
        const { type } = req.query;
        const tasks = await this.configService.getWebTasks(type);
        
        // Separate by type for easier frontend handling
        const scheduled = tasks.filter(t => t.task_type === 'scheduled');
        const oneTime = tasks.filter(t => t.task_type === 'one_time');
        
        res.json({
          success: true,
          data: {
            scheduled,
            oneTime,
            total: tasks.length
          }
        });
      } catch (error) {
        logger.error('Failed to get tasks:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get tasks'
        });
      }
    });

    apiRouter.post('/tasks', async (req, res) => {
      try {
        logger.info('🔍 WebServer received POST /tasks:', JSON.stringify(req.body, null, 2));
        const result = await this.configService.createWebTask(req.body);
        logger.info('📝 ConfigService returned:', JSON.stringify(result, null, 2));
        
        if (result.success) {
          res.status(201).json(result);
        } else {
          logger.warn('❌ Task creation failed, returning 400:', result.message || result.error);
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error('Failed to create task:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create task'
        });
      }
    });

    apiRouter.put('/tasks/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.configService.updateWebTask(id, req.body);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error('Failed to update task:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update task'
        });
      }
    });

    apiRouter.delete('/tasks/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const result = await this.configService.deleteWebTask(id);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(404).json(result);
        }
      } catch (error) {
        logger.error('Failed to delete task:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete task'
        });
      }
    });

    // Execute task immediately (for testing)
    apiRouter.post('/tasks/:id/execute', async (req, res) => {
      try {
        const { id } = req.params;
        
        // Execute task via TaskExecutionService
        if (this.bot.taskExecutionService) {
          logger.info(`🔧 [MANUAL] Manual execution requested for task ${id} via API`);
          const result = await this.bot.taskExecutionService.executeManually(id, 'web-api');
          
          res.json({
            success: true,
            message: 'Task execution completed',
            taskId: id,
            result: result
          });
        } else {
          res.status(503).json({
            success: false,
            error: 'TaskExecutionService not available'
          });
        }
      } catch (error) {
        logger.error('Failed to execute task:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to execute task',
          message: error.message
        });
      }
    });

    // Mount API router
    this.app.use('/api', apiRouter);
  }

  /**
   * Get bot status information
   */
  async getBotStatus() {
    try {
      const totalGroups = await this.db.getQuery(
        'SELECT COUNT(*) as count FROM groups WHERE is_active = 1'
      );
      
      const totalMessages = await this.db.getQuery(
        'SELECT COUNT(*) as count FROM messages'
      );

      const recentActivity = await this.db.getQuery(`
        SELECT MAX(timestamp) as last_activity 
        FROM messages 
        WHERE timestamp > datetime('now', '-1 hour')
      `);

      return {
        connected: this.bot.isConnected || false,
        account: this.bot.socket?.user ? (this.bot.socket.user.name || this.bot.socket.user.id.split(':')[0]) : null,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        activeGroups: totalGroups ? totalGroups.count : 0,
        totalMessages: totalMessages ? totalMessages.count : 0,
        lastActivity: recentActivity ? recentActivity.last_activity : null,
        version: require('../../package.json').version || '1.0.0'
      };
    } catch (error) {
      logger.error('Failed to get bot status:', error);
      return {
        connected: false,
        error: 'Status unavailable'
      };
    }
  }

  /**
   * Get web interface status
   */
  async getWebStatus() {
    try {
      const managementGroups = await this.configService.getManagementGroups();
      const activeTasks = await this.configService.getWebTasks();
      
      const nextScheduledTask = activeTasks
        .filter(t => t.task_type === 'scheduled' && t.active)
        .sort((a, b) => new Date(a.next_run) - new Date(b.next_run))[0];

      return {
        managementGroups: managementGroups.filter(g => g.active).map(g => g.group_name),
        activeTasks: activeTasks.filter(t => t.active).length,
        nextScheduledTask: nextScheduledTask ? nextScheduledTask.next_run : null,
        webServerUptime: Math.floor((Date.now() - this.startTime) / 1000)
      };
    } catch (error) {
      logger.error('Failed to get web status:', error);
      return {
        error: 'Web status unavailable'
      };
    }
  }

  /**
   * Start the web server
   */
  async start() {
    try {
      // Initialize web configuration
      await this.configService.initializeWebConfig();

      return new Promise((resolve, reject) => {
        this.server = this.app.listen(this.port, '0.0.0.0', (err) => {
          if (err) {
            logger.error('Failed to start web server:', err);
            reject(err);
          } else {
            logger.info(`🌐 Web dashboard started at http://localhost:${this.port}`);
            resolve({
              port: this.port,
              url: `http://localhost:${this.port}`
            });
          }
        });

        // Handle server errors
        this.server.on('error', (error) => {
          logger.error('Web server error:', error);
        });
      });
    } catch (error) {
      logger.error('Failed to start web server:', error);
      throw error;
    }
  }

  /**
   * Stop the web server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Web dashboard stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return {
      port: this.port,
      url: `http://localhost:${this.port}`,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      isRunning: this.server && this.server.listening
    };
  }
}

module.exports = WebServer;