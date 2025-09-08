const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');

/**
 * SyncManager - Handles two-way synchronization between web dashboard and file system
 * This is the foundation for the future Natural Language Command system
 */
class SyncManager extends EventEmitter {
  constructor(configService, schedulerService, db) {
    super();
    this.configService = configService;
    this.schedulerService = schedulerService;
    this.db = db;
    this.schedulesPath = path.join(__dirname, '../../schedules');
    this.watcher = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the sync manager
   */
  async initialize() {
    try {
      logger.info('🔄 Initializing SyncManager...');
      
      // Skip file sync since we're using database only
      logger.info('📊 Using database-only mode - skipping file sync');
      
      // Set up event listeners for database changes
      this.setupDatabaseChangeListeners();
      
      this.isInitialized = true;
      logger.info('✅ SyncManager initialized successfully (database-only mode)');
      
      return true;
    } catch (error) {
      logger.error('❌ Failed to initialize SyncManager:', error);
      throw error;
    }
  }

  /**
   * Sync all schedule files to database
   */
  async syncFilesToDatabase() {
    try {
      logger.info('📁 Syncing files to database...');
      
      // Get all schedule files
      const files = await fs.readdir(this.schedulesPath);
      const scheduleFiles = files.filter(f => f.endsWith('.txt'));
      
      let syncedCount = 0;
      
      for (const file of scheduleFiles) {
        try {
          const filePath = path.join(this.schedulesPath, file);
          const schedules = await this.parseScheduleFile(filePath);
          
          for (const schedule of schedules) {
            const success = await this.upsertTaskFromSchedule(schedule, file);
            if (success) syncedCount++;
          }
        } catch (error) {
          logger.warn(`Failed to sync file ${file}:`, error.message);
        }
      }
      
      logger.info(`✅ Synced ${syncedCount} tasks from ${scheduleFiles.length} files`);
      return syncedCount;
    } catch (error) {
      logger.error('Failed to sync files to database:', error);
      throw error;
    }
  }

  /**
   * Parse a schedule file and extract tasks
   */
  async parseScheduleFile(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    const schedules = [];
    
    // Split by --- delimiter
    const sections = content.split(/---\s*\n/).filter(s => s.trim());
    
    for (const section of sections) {
      try {
        const schedule = this.parseScheduleSection(section);
        if (schedule) {
          schedule.file_path = filePath;
          schedules.push(schedule);
        }
      } catch (error) {
        logger.warn('Failed to parse schedule section:', error.message);
      }
    }
    
    return schedules;
  }

  /**
   * Parse a single schedule section
   */
  parseScheduleSection(section) {
    const lines = section.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    
    const schedule = {
      name: null,
      groups: [],
      action: null,
      schedule: null,
      sendTo: null,
      task_type: 'scheduled' // Default
    };
    
    let currentSection = null;
    
    for (const line of lines) {
      if (line.startsWith('groups:')) {
        currentSection = 'groups';
        continue;
      }
      
      if (line.includes(':')) {
        const colonIndex = line.indexOf(':');
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        switch (key) {
          case 'action':
            schedule.action = value;
            break;
          case 'schedule':
            schedule.schedule = value;
            break;
          case 'send to':
            schedule.sendTo = value;
            break;
          case 'execute at':
            schedule.executeAt = value;
            schedule.task_type = 'one_time';
            break;
        }
        currentSection = null;
        continue;
      }
      
      // Handle group lines
      if (currentSection === 'groups' && line) {
        schedule.groups.push(line);
      }
    }
    
    // Generate name from first group or action
    if (!schedule.name) {
      schedule.name = schedule.groups[0] || schedule.action || 'Unnamed Task';
    }
    
    // Validate required fields
    if (!schedule.action || (!schedule.schedule && !schedule.executeAt)) {
      return null;
    }
    
    return schedule;
  }

  /**
   * Convert parsed schedule to web task format and upsert
   */
  async upsertTaskFromSchedule(schedule, fileName) {
    try {
      // Convert schedule format to CRON
      let cronExpression = null;
      let executeAt = null;
      
      if (schedule.task_type === 'one_time' && schedule.executeAt) {
        executeAt = new Date(schedule.executeAt).toISOString();
      } else if (schedule.schedule) {
        // Use ScheduleParser for consistent parsing logic
        logger.info(`🔍 Schedule text before parsing: "${schedule.schedule}"`);
        cronExpression = this.schedulerService.scheduleParser.convertToCron(schedule.schedule);
        logger.info(`🕒 Using ScheduleParser: "${schedule.schedule}" → ${cronExpression}`);
      }
      
      const taskData = {
        name: schedule.name,
        task_type: schedule.task_type,
        cron_expression: cronExpression,
        execute_at: executeAt,
        action_type: schedule.action,
        target_groups: schedule.groups,
        send_to_group: schedule.sendTo || 'ניצן',
        file_path: schedule.file_path,
        // Mark as synced from file
        synced_from_file: true
      };
      
      // Check if task already exists (by name and file_path)
      const existingTask = await this.db.getQuery(`
        SELECT id FROM web_tasks 
        WHERE name = ? AND (file_path = ? OR (file_path IS NULL AND ? LIKE '%' || name || '%'))
      `, [taskData.name, taskData.file_path, fileName]);
      
      if (existingTask) {
        // Update existing task
        await this.db.runQuery(`
          UPDATE web_tasks 
          SET task_type = ?, cron_expression = ?, execute_at = ?, 
              action_type = ?, target_groups = ?, send_to_group = ?, 
              file_path = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          taskData.task_type, taskData.cron_expression, taskData.execute_at,
          taskData.action_type, JSON.stringify(taskData.target_groups),
          taskData.send_to_group, taskData.file_path, existingTask.id
        ]);
        
        logger.debug(`Updated task: ${taskData.name}`);
      } else {
        // Insert new task
        await this.db.runQuery(`
          INSERT INTO web_tasks (
            name, task_type, cron_expression, execute_at,
            action_type, target_groups, send_to_group, file_path
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          taskData.name, taskData.task_type, taskData.cron_expression, taskData.execute_at,
          taskData.action_type, JSON.stringify(taskData.target_groups),
          taskData.send_to_group, taskData.file_path
        ]);
        
        logger.debug(`Created task: ${taskData.name}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to upsert task ${schedule.name}:`, error);
      return false;
    }
  }

  /**
   * Convert human-readable schedule to CRON expression
   */
  convertScheduleToCron(scheduleText) {
    const schedule = scheduleText.toLowerCase();
    
    // Extract hour from "every day at XX:XX" pattern - prioritize flexible parsing
    const dayPattern = /every day at (\d{1,2}):(\d{2})/;
    const match = schedule.match(dayPattern);
    if (match) {
      const hour = parseInt(match[1]);
      const minute = parseInt(match[2]);
      const cron = `${minute} ${hour} * * *`;
      logger.info(`🕒 Parsed schedule "${scheduleText}" to CRON: ${cron}`);
      return cron;
    }
    
    // Fallback specific patterns for common times
    if (schedule.includes('every day at 18:00') || schedule === 'every day at 18:00') {
      return '0 18 * * *';
    }
    if (schedule.includes('every day at 16:00') || schedule === 'every day at 16:00') {
      return '0 16 * * *';
    }
    if (schedule.includes('every day at 23:09') || schedule === 'every day at 23:09') {
      return '9 23 * * *';
    }
    
    // Final fallback - return daily at 18:00
    logger.warn(`Unknown schedule format: "${scheduleText}", defaulting to daily at 18:00`);
    return '0 18 * * *';
  }

  /**
   * Start watching for file changes
   */
  startFileWatcher() {
    try {
      this.watcher = chokidar.watch(this.schedulesPath, {
        ignored: /^\./, // ignore dotfiles
        persistent: true,
        ignoreInitial: true // don't trigger on initial scan
      });

      this.watcher
        .on('add', (filePath) => this.handleFileChange('add', filePath))
        .on('change', (filePath) => this.handleFileChange('change', filePath))
        .on('unlink', (filePath) => this.handleFileChange('unlink', filePath));

      logger.info('👀 File watcher started for schedule files');
    } catch (error) {
      logger.error('Failed to start file watcher:', error);
    }
  }

  /**
   * Handle file system changes
   */
  async handleFileChange(event, filePath) {
    try {
      if (!filePath.endsWith('.txt')) return;
      
      logger.info(`📄 File ${event}: ${path.basename(filePath)}`);
      
      if (event === 'unlink') {
        // Remove tasks from database when file is deleted
        await this.db.runQuery(`DELETE FROM web_tasks WHERE file_path = ?`, [filePath]);
        logger.info(`Removed tasks from deleted file: ${path.basename(filePath)}`);
      } else {
        // Re-sync this specific file
        const schedules = await this.parseScheduleFile(filePath);
        let syncedCount = 0;
        
        for (const schedule of schedules) {
          const success = await this.upsertTaskFromSchedule(schedule, path.basename(filePath));
          if (success) syncedCount++;
        }
        
        logger.info(`Re-synced ${syncedCount} tasks from ${path.basename(filePath)}`);
      }
      
      // Emit sync event for dashboard updates
      this.emit('filesSynced');
      
    } catch (error) {
      logger.error(`Failed to handle file change ${event}:`, error);
    }
  }

  /**
   * Setup listeners for database changes
   */
  setupDatabaseChangeListeners() {
    // Listen for changes from ConfigService
    this.configService.on('taskCreated', (taskData) => {
      this.syncDatabaseToFiles();
    });
    
    this.configService.on('taskUpdated', (taskData) => {
      this.syncDatabaseToFiles();
    });
    
    this.configService.on('taskDeleted', (taskId) => {
      this.syncDatabaseToFiles();
    });
  }

  /**
   * Sync database changes back to files
   */
  async syncDatabaseToFiles() {
    try {
      logger.info('💾 Syncing database to files...');
      
      const tasks = await this.db.allQuery(`
        SELECT * FROM web_tasks 
        WHERE created_at >= date('now', '-1 day')
        ORDER BY created_at DESC
      `);
      
      for (const task of tasks) {
        if (!task.file_path || task.file_path.includes('web-task-')) {
          // This is a web-created task, ensure it has a file
          await this.ensureTaskHasFile(task);
        }
      }
      
      logger.info(`✅ Database sync to files completed`);
      
    } catch (error) {
      logger.error('Failed to sync database to files:', error);
    }
  }

  /**
   * Ensure a task has a corresponding file
   */
  async ensureTaskHasFile(task) {
    try {
      if (task.file_path && await this.fileExists(task.file_path)) {
        return; // File already exists
      }
      
      // Generate file path
      const fileName = `web-task-${task.id}.txt`;
      const filePath = path.join(this.schedulesPath, fileName);
      
      // Generate file content
      const content = this.configService.convertTaskToFileFormat(task);
      
      // Write file
      await fs.writeFile(filePath, content, 'utf8');
      
      // Update task with file path
      await this.db.runQuery(`
        UPDATE web_tasks SET file_path = ? WHERE id = ?
      `, [filePath, task.id]);
      
      logger.debug(`Created file for task ${task.name}: ${fileName}`);
      
    } catch (error) {
      logger.error(`Failed to create file for task ${task.name}:`, error);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop the sync manager
   */
  async stop() {
    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }
      
      this.removeAllListeners();
      this.isInitialized = false;
      
      logger.info('🔄 SyncManager stopped');
    } catch (error) {
      logger.error('Failed to stop SyncManager:', error);
    }
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      watching: !!this.watcher,
      schedulesPath: this.schedulesPath
    };
  }
}

module.exports = SyncManager;