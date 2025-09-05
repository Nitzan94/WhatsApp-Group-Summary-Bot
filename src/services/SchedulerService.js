const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');
const ScheduleParser = require('./ScheduleParser');
// מערכת לוגים מפורטת לתזמונים
const {
  logScheduledTaskStart,
  logScheduledTaskStep,
  logScheduledDataOperation,
  logScheduledToolUsage,
  logScheduledAIInteraction,
  logScheduledOutput,
  logScheduledTaskEnd,
  logScheduledTaskError,
  logScheduledInsights,
  logSchedulerManagement,
  generateSchedulerSessionId
} = require('../utils/schedulerLogger');

class SchedulerService {
  constructor(bot, db, conversationHandler = null) {
    this.bot = bot;
    this.db = db;
    this.conversationHandler = conversationHandler;
    this.activeCronJobs = new Map(); // Map of schedule id -> cron job
    this.scheduleParser = new ScheduleParser();
    this.schedules = [];
    this.schedulesPath = path.join(__dirname, '../../schedules');
    this.isInitialized = false;
    this.fileWatcher = null;
  }

  /**
   * Initialize scheduler service and load schedules from files
   */
  async initialize() {
    try {
      logger.info('🕒 מאתחל מערכת תזמונים חדשה עם AI Agent...');
      
      // Validate conversationHandler availability
      if (!this.conversationHandler) {
        logger.warn('⚠️ ConversationHandler לא זמין - סיכומים מתוזמנים לא יעבדו');
      }
      
      // Load schedules from files
      await this.loadSchedulesFromFiles();
      
      // Set up file watching for hot reload
      this.setupFileWatching();
      
      // Schedule daily cleanup at 02:00 - DISABLED TO KEEP ALL MESSAGES
      // await this.scheduleDailyCleanup();
      
      this.isInitialized = true;
      logger.info(`✅ מערכת תזמונים חדשה הופעלה - ${this.schedules.length} תזמונים נטענו`);
      
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  /**
   * Validate cron schedule format
   */
  isValidCronSchedule(schedule) {
    try {
      return cron.validate(schedule);
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse user-friendly schedule to cron format
   * Examples: 
   * - "יומי 16:00" -> "0 16 * * *"
   * - "שבועי ראשון 10:00" -> "0 10 * * 0"
   * - "חודשי 1 09:00" -> "0 9 1 * *"
   */
  parseUserSchedule(scheduleText) {
    const text = scheduleText.toLowerCase().trim();
    
    // Extract time (HH:MM)
    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) {
      throw new Error('פורמט שעה לא תקין - השתמש בפורמט HH:MM (למשל 16:00)');
    }
    
    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);
    
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('שעה לא תקינה - שעה 0-23, דקה 0-59');
    }

    // Parse frequency
    if (text.includes('יומי')) {
      return `${minute} ${hour} * * *`;
    }
    
    if (text.includes('שבועי')) {
      // Default to Sunday if no day specified
      let dayOfWeek = 0; // Sunday
      
      if (text.includes('ראשון')) dayOfWeek = 0; // Sunday
      else if (text.includes('שני')) dayOfWeek = 1; // Monday  
      else if (text.includes('שלישי')) dayOfWeek = 2; // Tuesday
      else if (text.includes('רביעי')) dayOfWeek = 3; // Wednesday
      else if (text.includes('חמישי')) dayOfWeek = 4; // Thursday
      else if (text.includes('שישי')) dayOfWeek = 5; // Friday
      else if (text.includes('שבת')) dayOfWeek = 6; // Saturday
      
      return `${minute} ${hour} * * ${dayOfWeek}`;
    }
    
    if (text.includes('חודשי')) {
      // Extract day of month
      const dayMatch = text.match(/(\d{1,2})/);
      const dayOfMonth = dayMatch ? parseInt(dayMatch[1]) : 1;
      
      if (dayOfMonth < 1 || dayOfMonth > 31) {
        throw new Error('יום בחודש לא תקין - 1-31');
      }
      
      return `${minute} ${hour} ${dayOfMonth} * *`;
    }
    
    // If it's already a cron format, validate and return
    if (this.isValidCronSchedule(text)) {
      return text;
    }
    
    throw new Error('פורמט תזמון לא מוכר. השתמש ב: יומי/שבועי/חודשי + שעה (למשל: "יומי 16:00")');
  }

  /**
   * Schedule automatic summaries for a group
   */
  async scheduleGroup(groupId, cronSchedule) {
    try {
      // Stop existing schedule if any
      if (this.activeCronJobs.has(groupId)) {
        this.activeCronJobs.get(groupId).stop();
        this.activeCronJobs.delete(groupId);
      }

      // Create new cron job
      const job = cron.schedule(cronSchedule, async () => {
        await this.executeScheduledSummary(groupId);
      }, {
        scheduled: false, // Don't start immediately
        timezone: 'Asia/Jerusalem'
      });

      // Start the job
      job.start();
      this.activeCronJobs.set(groupId, job);
      
      const group = await this.db.getGroup(groupId);
      logger.info(`⏰ תזמון הופעל לקבוצת "${group?.name}" - ${cronSchedule}`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to schedule group ${groupId}:`, error);
      return false;
    }
  }

  /**
   * Load all schedule files from the schedules directory
   */
  async loadSchedulesFromFiles() {
    try {
      logger.info('📄 טוען קבצי תזמון...');
      
      // Ensure schedules directory exists
      await fs.mkdir(this.schedulesPath, { recursive: true });
      
      // Read all .txt files in schedules directory
      const files = await fs.readdir(this.schedulesPath);
      const scheduleFiles = files.filter(file => file.endsWith('.txt'));
      
      logger.info(`📂 נמצאו ${scheduleFiles.length} קבצי תזמון`);
      
      this.schedules = [];
      
      for (const file of scheduleFiles) {
        const filePath = path.join(this.schedulesPath, file);
        const parsedSchedules = await this.scheduleParser.parse(filePath);
        
        this.schedules.push(...parsedSchedules);
      }
      
      // Stop existing jobs
      this.stopAllJobs();
      
      // Start new cron jobs
      let activeJobs = 0;
      for (const schedule of this.schedules) {
        if (await this.createCronJob(schedule)) {
          activeJobs++;
        }
      }
      
      logger.info(`✅ נטענו ${this.schedules.length} תזמונים, ${activeJobs} פעילים`);
      
    } catch (error) {
      logger.error('Failed to load schedules from files:', error);
      this.schedules = [];
    }
  }

  /**
   * Setup file watching for hot reload of schedules
   */
  setupFileWatching() {
    try {
      if (this.fileWatcher) {
        this.fileWatcher.close();
      }
      
      this.fileWatcher = chokidar.watch(
        path.join(this.schedulesPath, '*.txt'),
        { 
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
          }
        }
      );
      
      this.fileWatcher.on('add', async (filePath) => {
        logger.info(`📄 קובץ תזמון חדש נוסף: ${path.basename(filePath)}`);
        await this.loadSchedulesFromFiles();
      });
      
      this.fileWatcher.on('change', async (filePath) => {
        logger.info(`📝 קובץ תזמון עודכן: ${path.basename(filePath)}`);
        await this.loadSchedulesFromFiles();
      });
      
      this.fileWatcher.on('unlink', async (filePath) => {
        logger.info(`🗑️ קובץ תזמון נמחק: ${path.basename(filePath)}`);
        await this.loadSchedulesFromFiles();
      });
      
      logger.info('👀 מערכת מעקב קבצים הופעלה');
      
    } catch (error) {
      logger.error('Failed to setup file watching:', error);
    }
  }

  /**
   * Create cron job for a schedule
   */
  async createCronJob(schedule) {
    try {
      const job = cron.schedule(schedule.cronExpression, async () => {
        await this.executeSchedule(schedule);
      }, {
        scheduled: false,
        timezone: 'Asia/Jerusalem'
      });
      
      job.start();
      this.activeCronJobs.set(schedule.id, job);
      
      logger.info(`⏰ תזמון הופעל: ${schedule.name} - ${this.scheduleParser.cronToReadable(schedule.cronExpression)}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to create cron job for ${schedule.name}:`, error);
      return false;
    }
  }

  /**
   * Execute a scheduled task using AI Agent
   */
  async executeSchedule(schedule) {
    const sessionId = generateSchedulerSessionId(schedule.id || schedule.name);
    const startTime = Date.now();
    
    try {
      logger.info(`⏰ מבצע תזמון: ${schedule.name}`);
      
      // Log scheduled task start
      logScheduledTaskStart(sessionId, {
        id: schedule.id || schedule.name,
        name: schedule.name,
        task_type: 'scheduled',
        description: schedule.description || schedule.action,
        schedule_expression: schedule.schedule,
        next_run: new Date().toISOString(),
        target_groups: schedule.groups || []
      });
      
      if (!this.conversationHandler) {
        logger.error('ConversationHandler לא זמין לביצוע תזמון');
        logScheduledTaskError(sessionId, schedule.id, new Error('ConversationHandler not available'), {
          schedule: schedule.name
        });
        return;
      }
      
      logScheduledTaskStep(sessionId, schedule.id, 'processing_groups', {
        groupCount: schedule.groups?.length || 0,
        groups: schedule.groups || []
      });
      
      // Process each group in the schedule
      for (const groupName of schedule.groups) {
        await this.executeScheduleForGroup(schedule, groupName, sessionId);
      }
      
      const duration = Date.now() - startTime;
      logger.info(`✅ תזמון הושלם: ${schedule.name}`);
      
      // Log successful completion
      logScheduledTaskEnd(sessionId, schedule.id, duration, true, {
        toolsUsed: schedule.groups?.length || 0,
        dataOperationsExecuted: schedule.groups?.length || 0,
        groupsProcessed: schedule.groups || [],
        outputsSent: schedule.groups?.length || 0
      }, this.getNextRunTime(schedule));
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Failed to execute schedule ${schedule.name}:`, error);
      
      logScheduledTaskError(sessionId, schedule.id, error, {
        schedule: schedule.name,
        duration
      });
      
      logScheduledTaskEnd(sessionId, schedule.id, duration, false, {
        toolsUsed: 0,
        dataOperationsExecuted: 0,
        groupsProcessed: [],
        outputsSent: 0
      });
    }
  }

  /**
   * Execute schedule for a specific group using AI Agent
   */
  async executeScheduleForGroup(schedule, groupName, sessionId) {
    const taskId = schedule.id || schedule.name;
    const stepStartTime = Date.now();
    
    try {
      logger.info(`🤖 מבצע ${schedule.action} עבור קבוצת "${groupName}"`);
      
      logScheduledTaskStep(sessionId, taskId, 'processing_single_group', {
        groupName,
        action: schedule.action
      });
      
      // Create a natural language query based on the schedule action
      const query = this.buildNaturalQuery(schedule.action, groupName);
      
      logger.debug(`🗣️ שאילתה טבעית: "${query}"`);
      
      logScheduledTaskStep(sessionId, taskId, 'natural_query_built', {
        query: query.substring(0, 200) + '...',
        queryLength: query.length
      });
      
      // Use ConversationHandler to process the query
      const aiStartTime = Date.now();
      const result = await this.conversationHandler.processNaturalQuery(
        query,
        null, // no specific groupId - let AI Agent resolve the group name
        'system', // system user
        true // forceGroupQuery to ensure proper context
      );
      const aiDuration = Date.now() - aiStartTime;
      
      logScheduledAIInteraction(sessionId, taskId, query, result?.response || '', [], aiDuration);
      
      if (!result || !result.success) {
        logger.error(`AI Agent failed for ${groupName}: ${result?.error || 'Unknown error'}`);
        logScheduledTaskError(sessionId, taskId, new Error(result?.error || 'AI Agent failed'), {
          groupName,
          query
        });
        return;
      }
      
      logScheduledTaskStep(sessionId, taskId, 'formatting_result', {
        responseLength: result.response?.length || 0,
        scheduleName: schedule.name
      });
      
      // Format the result for scheduled delivery
      const scheduledMessage = this.formatScheduledResult(
        result.response,
        schedule.name,
        groupName
      );
      
      logScheduledTaskStep(sessionId, taskId, 'sending_message', {
        messageLength: scheduledMessage?.length || 0,
        sendTo: schedule.sendTo
      });
      
      // Send to target group/chat
      const sendStartTime = Date.now();
      await this.sendScheduledMessage(scheduledMessage, schedule.sendTo);
      const sendDuration = Date.now() - sendStartTime;
      
      logScheduledOutput(sessionId, taskId, [schedule.sendTo], {
        attempted: 1,
        successful: 1,
        failed: 0
      }, true, []);
      
      const totalDuration = Date.now() - stepStartTime;
      logger.info(`✅ תזמון הושלם עבור קבוצת "${groupName}" תוך ${totalDuration}ms`);
      
    } catch (error) {
      const totalDuration = Date.now() - stepStartTime;
      logger.error(`Failed to execute schedule for group ${groupName}:`, error);
      
      logScheduledTaskError(sessionId, taskId, error, {
        groupName,
        duration: totalDuration,
        step: 'execution'
      });
      
      logScheduledOutput(sessionId, taskId, [schedule.sendTo], {
        attempted: 1,
        successful: 0,
        failed: 1
      }, false, [{ groupId: schedule.sendTo, error }]);
    }
  }

  /**
   * Get next scheduled run time for a schedule
   */
  getNextRunTime(schedule) {
    try {
      if (schedule.cronExpression) {
        return cron.schedule(schedule.cronExpression, () => {}).nextRun?.toISOString();
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Build natural language query from schedule action
   */
  buildNaturalQuery(action, groupName) {
    // Convert schedule action to natural language query
    const actionMap = {
      'daily_summary': `תסכם לי מה היה היום בקבוצת "${groupName}"`,
      'weekly_summary': `תסכם לי מה היה השבוع בקבוצת "${groupName}"`,
      'today_summary': `תסכם לי את ההודעות מהיום בקבוצת "${groupName}"`,
      'summary': `תסכם לי את ההודעות האחרונות בקבוצת "${groupName}"`,
      'status': `מה המצב בקבוצת "${groupName}"?`,
      'activity': `איך הפעילות בקבוצת "${groupName}"?`,
      'latest_message': `מה ההודעה האחרונה בקבוצת "${groupName}"?`
    };
    
    // If action is in the map, use it; otherwise use it as-is with group name
    return actionMap[action] || `${action} בקבוצת "${groupName}"`;
  }

  /**
   * Format AI Agent result for scheduled delivery
   */
  formatScheduledResult(response, scheduleName, groupName) {
    const timestamp = new Date().toLocaleString('he-IL');
    
    return `⏰ *תזמון אוטומטי - ${scheduleName}*\n` +
           `📍 *קבוצת ${groupName}*\n` +
           `🕐 ${timestamp}\n\n` +
           `${response}\n\n` +
           `_תזמון אוטומטי זה הופק באמצעות AI Agent_`;
  }

  /**
   * Send scheduled message to target group/chat
   */
  async sendScheduledMessage(message, sendTo) {
    try {
      // Resolve sendTo to actual WhatsApp ID
      let targetId = null;
      
      if (sendTo === 'ניצן' || sendTo === 'nitzer') {
        targetId = this.bot.summaryTargetGroupId; // Nitzer's group
      } else {
        // Try to find group by name
        targetId = await this.resolveGroupId(sendTo);
      }
      
      if (!targetId) {
        logger.error(`לא ניתן למצוא את היעד לשליחה: ${sendTo}`);
        return false;
      }
      
      await this.bot.socket.sendMessage(targetId, { text: message });
      logger.info(`📤 הודעה מתוזמנת נשלחה ל-${sendTo}`);
      return true;
      
    } catch (error) {
      logger.error('Failed to send scheduled message:', error);
      return false;
    }
  }

  /**
   * Resolve group name to WhatsApp ID
   */
  async resolveGroupId(groupName) {
    try {
      // Try to find group in database by name
      const groups = await this.db.allQuery('SELECT id, name FROM groups WHERE is_active = 1');
      const group = groups.find(g => 
        g.name.toLowerCase().includes(groupName.toLowerCase()) ||
        groupName.toLowerCase().includes(g.name.toLowerCase())
      );
      
      return group ? group.id : null;
    } catch (error) {
      logger.error('Failed to resolve group ID:', error);
      return null;
    }
  }

  /**
   * Stop all active cron jobs
   */
  stopAllJobs() {
    for (const [id, job] of this.activeCronJobs) {
      try {
        job.stop();
      } catch (error) {
        logger.error(`Failed to stop job ${id}:`, error);
      }
    }
    this.activeCronJobs.clear();
    logger.info('⏰ כל התזמונים הופסקו');
  }

  /**
   * Add or update schedule for a group
   */
  async setGroupSchedule(groupId, scheduleText) {
    try {
      // Parse user schedule to cron format
      const cronSchedule = this.parseUserSchedule(scheduleText);
      
      // Update database
      await this.db.updateGroupSchedule(groupId, cronSchedule);
      
      // Schedule the job
      const success = await this.scheduleGroup(groupId, cronSchedule);
      
      return {
        success: success,
        cronSchedule: cronSchedule,
        message: success ? 'תזמון הוגדר בהצלחה' : 'שגיאה בהגדרת תזמון'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message || 'שגיאה בהגדרת תזמון'
      };
    }
  }

  /**
   * Remove schedule for a group
   */
  async removeGroupSchedule(groupId) {
    try {
      // Stop cron job
      if (this.activeCronJobs.has(groupId)) {
        this.activeCronJobs.get(groupId).stop();
        this.activeCronJobs.delete(groupId);
      }

      // Update database
      await this.db.updateGroupSchedule(groupId, null);
      
      const group = await this.db.getGroup(groupId);
      logger.info(`⏰ תזמון בוטל לקבוצת "${group?.name}"`);
      
      return { success: true, message: 'תזמון בוטל בהצלחה' };
      
    } catch (error) {
      logger.error('Failed to remove schedule:', error);
      return { success: false, error: 'שגיאה בביטול תזמון' };
    }
  }

  /**
   * Get all active schedules
   */
  async getActiveSchedules() {
    try {
      const groups = await this.db.getActiveGroups();
      const schedules = groups
        .filter(group => group.schedule)
        .map(group => ({
          groupId: group.id,
          groupName: group.name,
          schedule: group.schedule,
          readable: this.cronToReadable(group.schedule)
        }));
      
      return schedules;
    } catch (error) {
      logger.error('Failed to get schedules:', error);
      return [];
    }
  }

  /**
   * Convert cron schedule to readable Hebrew format
   */
  cronToReadable(cronSchedule) {
    try {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = cronSchedule.split(' ');
      
      const timeStr = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      
      // Daily
      if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        return `יומי בשעה ${timeStr}`;
      }
      
      // Weekly
      if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
        return `שבועי ביום ${dayName} בשעה ${timeStr}`;
      }
      
      // Monthly  
      if (dayOfMonth !== '*' && month === '*' && dayOfWeek === '*') {
        return `חודשי ביום ${dayOfMonth} בשעה ${timeStr}`;
      }
      
      return cronSchedule; // Return original if can't parse
    } catch (error) {
      return cronSchedule;
    }
  }

  /**
   * Schedule daily cleanup of old messages at 02:00
   */
  async scheduleDailyCleanup() {
    try {
      const cleanupJob = cron.schedule('0 2 * * *', async () => {
        await this.executeCleanup();
      }, {
        scheduled: false,
        timezone: 'Asia/Jerusalem'
      });

      cleanupJob.start();
      this.activeCronJobs.set('CLEANUP_JOB', cleanupJob);
      logger.info('🧹 תזמון ניקוי יומי הופעל - 02:00');
      
      return true;
    } catch (error) {
      logger.error('Failed to schedule daily cleanup:', error);
      return false;
    }
  }

  /**
   * Execute daily cleanup of old messages
   */
  async executeCleanup() {
    try {
      logger.info('🧹 מתחיל ניקוי יומי של הודעות ישנות...');
      
      const deletedCount = await this.db.cleanOldMessages(72);
      
      if (deletedCount > 0) {
        logger.info(`✅ ניקוי יומי הושלם - נמחקו ${deletedCount} הודעות ישנות מעל 72 שעות`);
      } else {
        logger.info('✅ ניקוי יומי הושלם - לא נמצאו הודעות ישנות למחיקה');
      }
      
    } catch (error) {
      logger.error('Failed to execute daily cleanup:', error);
    }
  }

  /**
   * Get all active schedules (for management interface)
   */
  getActiveSchedules() {
    return this.schedules.map(schedule => ({
      id: schedule.id,
      name: schedule.name,
      groups: schedule.groups,
      action: schedule.action,
      schedule: schedule.schedule,
      cronExpression: schedule.cronExpression,
      readable: this.scheduleParser.cronToReadable(schedule.cronExpression),
      sendTo: schedule.sendTo,
      isActive: this.activeCronJobs.has(schedule.id)
    }));
  }

  /**
   * Reload all schedules (for manual refresh)
   */
  async reloadSchedules() {
    logger.info('🔄 רענון ידני של תזמונים...');
    await this.loadSchedulesFromFiles();
  }

  /**
   * Stop all scheduled jobs (for cleanup)
   */
  stopAll() {
    this.stopAllJobs();
    
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    logger.info('⏰ מערכת תזמונים הופסקה לחלוטין');
  }
}

module.exports = SchedulerService;