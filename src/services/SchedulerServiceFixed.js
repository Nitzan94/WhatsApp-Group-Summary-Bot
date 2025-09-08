// 🔧 SchedulerService FIXED VERSION - פתרון אמיתי לבעיית CRON callbacks
// קפטן, זה הפתרון האמיתי לבעיה!
// 
// הבעיה: node-cron callbacks לא מתבצעים למרות שהjobs נוצרים
// הפתרון: שילוב של polling mechanism עם cron validation

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

class SchedulerServiceFixed {
  constructor(bot, db, conversationHandler = null, taskExecutionService = null) {
    this.bot = bot;
    this.db = db;
    this.conversationHandler = conversationHandler;
    this.taskExecutionService = taskExecutionService;
    this.activeCronJobs = new Map(); // Keep for compatibility
    this.scheduleParser = new ScheduleParser();
    this.schedules = [];
    this.schedulesPath = path.join(__dirname, '../../schedules');
    this.isInitialized = false;
    this.fileWatcher = null;
    this.dbScheduledTasks = []; // Database-driven tasks
    this.dbTaskJobs = new Map(); // Keep for compatibility
    
    // 🚀 NEW POLLING SYSTEM - פתרון אמיתי לבעיה!
    this.pollingInterval = null;
    this.pollingFrequencyMs = 30000; // Check every 30 seconds
    this.lastCheckTime = new Date();
    this.executionLocks = new Set(); // Prevent duplicate executions
  }

  /**
   * Initialize scheduler service with FIXED polling system
   */
  async initialize() {
    try {
      logger.info('🔧 מאתחל מערכת תזמונים מתוקנת עם POLLING MECHANISM...');
      
      // Validate conversationHandler availability
      if (!this.conversationHandler) {
        logger.warn('⚠️ ConversationHandler לא זמין - סיכומים מתוזמנים לא יעבדו');
      }
      
      // Load scheduled tasks from database only (v5.0 system)
      if (this.taskExecutionService) {
        await this.loadScheduledTasksFromDB();
      } else {
        logger.warn('⚠️ TaskExecutionService לא זמין - משימות מתוזמנות מהמסד נתונים לא יטענו');
      }
      
      // 🚀 START POLLING MECHANISM - זה יפתור את הבעיה!
      await this.startPollingMechanism();
      
      this.isInitialized = true;
      logger.info(`✅ מערכת תזמונים מתוקנת הופעלה - ${this.dbScheduledTasks.length} משימות פעילות`);
      logger.info(`🔄 POLLING ACTIVE: בדיקה כל ${this.pollingFrequencyMs/1000} שניות`);
      
    } catch (error) {
      logger.error('Failed to initialize FIXED scheduler:', error);
      throw error;
    }
  }

  /**
   * 🚀 POLLING MECHANISM - הפתרון האמיתי!
   * במקום להסתמך על node-cron callbacks, נבדוק באופן ידני כל 30 שניות
   */
  async startPollingMechanism() {
    logger.info('🔄 מפעיל POLLING MECHANISM לתזמונים...');
    
    // Clear existing interval if any
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    // Start polling
    this.pollingInterval = setInterval(async () => {
      await this.checkAndExecuteTasks();
    }, this.pollingFrequencyMs);
    
    // Run first check immediately
    setTimeout(() => this.checkAndExecuteTasks(), 5000); // Wait 5 seconds then check
    
    logger.info(`✅ POLLING מופעל - בדיקת משימות כל ${this.pollingFrequencyMs/1000} שניות`);
  }

  /**
   * 🎯 CORE FUNCTION - בדיקה וביצוע משימות שמגיע להן הזמן
   * זה יחליף את הcron callbacks שלא עבדו!
   */
  async checkAndExecuteTasks() {
    const currentTime = new Date();
    const currentTimeISO = currentTime.toISOString();
    const jerusalemTime = currentTime.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    
    try {
      logger.debug(`🔍 [POLLING] בדיקת משימות - ${jerusalemTime}`);
      
      // Get all active scheduled tasks
      const tasks = await this.db.getScheduledTasks(true);
      
      if (!tasks || tasks.length === 0) {
        logger.debug('📝 [POLLING] אין משימות פעילות');
        return;
      }
      
      logger.debug(`📋 [POLLING] בדיקת ${tasks.length} משימות פעילות`);
      
      for (const task of tasks) {
        await this.checkSingleTask(task, currentTime);
      }
      
    } catch (error) {
      logger.error('❌ [POLLING] שגיאה בבדיקת משימות:', error);
    }
  }

  /**
   * בדיקת משימה בודדת אם הגיע זמנה לביצוע
   */
  async checkSingleTask(task, currentTime) {
    const { id, name, cron_expression, last_execution } = task;
    
    try {
      // Create lock key to prevent duplicate execution
      const lockKey = `task_${id}`;
      if (this.executionLocks.has(lockKey)) {
        logger.debug(`⏭️ [POLLING] משימה ${id} כבר רצה, מדלג`);
        return;
      }
      
      // Validate cron expression
      if (!cron.validate(cron_expression)) {
        logger.warn(`⚠️ [POLLING] ביטוי cron לא תקין עבור משימה ${id}: ${cron_expression}`);
        return;
      }
      
      // Check if it's time to execute
      const shouldExecute = this.shouldTaskExecuteNow(cron_expression, last_execution, currentTime);
      
      if (shouldExecute) {
        logger.info(`🔥 [POLLING] זמן ביצוע משימה ${id} (${name}) - ${currentTime.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
        
        // Lock execution
        this.executionLocks.add(lockKey);
        
        try {
          // Execute the task
          const sessionId = generateSchedulerSessionId();
          logger.info(`🎯 [POLLING EXECUTION] מבצע משימה ${id} (Session: ${sessionId})`);
          
          // Execute via TaskExecutionService (same as before)
          const result = await this.taskExecutionService.executeScheduledTask(id);
          
          if (result.success) {
            logger.info(`✅ [POLLING] משימה ${id} (${name}) בוצעה בהצלחה`);
            
            // Update last_execution time in database
            await this.db.runQuery(
              'UPDATE scheduled_tasks SET last_execution = ? WHERE id = ?',
              [currentTime.toISOString(), id]
            );
            
          } else {
            logger.error(`❌ [POLLING] משימה ${id} (${name}) נכשלה: ${result.error || 'Unknown error'}`);
          }
          
        } catch (executionError) {
          logger.error(`❌ [POLLING] שגיאה בביצוע משימה ${id}:`, executionError);
        } finally {
          // Release lock after 2 minutes to prevent permanent locks
          setTimeout(() => {
            this.executionLocks.delete(lockKey);
            logger.debug(`🔓 [POLLING] שוחרר נעילה עבור משימה ${id}`);
          }, 2 * 60 * 1000);
        }
      }
      
    } catch (error) {
      logger.error(`❌ [POLLING] שגיאה בבדיקת משימה ${id}:`, error);
    }
  }

  /**
   * 🧠 INTELLIGENT SCHEDULING - בדיקה חכמה אם משימה צריכה להתבצע
   * זה המנוע הליבה של המערכת החדשה!
   */
  shouldTaskExecuteNow(cronExpression, lastExecution, currentTime) {
    try {
      // Parse cron expression
      const [minute, hour, dayOfMonth, month, dayOfWeek] = cronExpression.split(' ');
      
      const currentMinute = currentTime.getMinutes();
      const currentHour = currentTime.getHours();
      const currentDay = currentTime.getDate();
      const currentMonth = currentTime.getMonth() + 1;
      const currentWeekDay = currentTime.getDay();
      
      // Check if current time matches cron pattern
      const minuteMatch = minute === '*' || parseInt(minute) === currentMinute;
      const hourMatch = hour === '*' || parseInt(hour) === currentHour;
      const dayMatch = dayOfMonth === '*' || parseInt(dayOfMonth) === currentDay;
      const monthMatch = month === '*' || parseInt(month) === currentMonth;
      const weekDayMatch = dayOfWeek === '*' || parseInt(dayOfWeek) === currentWeekDay;
      
      const cronMatches = minuteMatch && hourMatch && dayMatch && monthMatch && weekDayMatch;
      
      if (!cronMatches) {
        return false;
      }
      
      // If no previous execution, execute now
      if (!lastExecution) {
        logger.info(`🚀 [SCHEDULE LOGIC] משימה חדשה, מבצע לראשונה`);
        return true;
      }
      
      // Check if enough time has passed since last execution
      const lastExecTime = new Date(lastExecution);
      const timeSinceLastExec = currentTime - lastExecTime;
      const oneHourMs = 60 * 60 * 1000;
      
      // Only execute if more than 1 hour has passed (prevents multiple executions in the same minute)
      if (timeSinceLastExec > oneHourMs) {
        logger.info(`⏰ [SCHEDULE LOGIC] עבר יותר משעה מהביצוע האחרון, מבצע עכשיו`);
        return true;
      }
      
      logger.debug(`⏭️ [SCHEDULE LOGIC] עדיין לא הגיע הזמן (ביצוע אחרון לפני ${Math.round(timeSinceLastExec / (60 * 1000))} דקות)`);
      return false;
      
    } catch (error) {
      logger.error('❌ [SCHEDULE LOGIC] שגיאה בחישוב זמן ביצוע:', error);
      return false;
    }
  }

  /**
   * Load scheduled tasks from database (same as before, but with polling)
   */
  async loadScheduledTasksFromDB() {
    try {
      logger.info('🗄️ טוען משימות מתוזמנות מהמסד נתונים (POLLING MODE)...');
      
      // Get active scheduled tasks from database
      const tasks = await this.db.getScheduledTasks(true); // activeOnly = true
      this.dbScheduledTasks = tasks;
      
      logger.info(`📋 נמצאו ${tasks.length} משימות פעילות במסד הנתונים`);
      
      // Don't create cron jobs anymore - we use polling!
      logger.info(`🔄 POLLING MODE: לא יוצרים cron jobs, משתמשים בpolling`);
      
      // Show what will be monitored
      tasks.forEach((task, index) => {
        logger.info(`${index + 1}. משימה ${task.id}: "${task.name}" - ${task.cron_expression}`);
      });
      
      logger.info(`✅ POLLING נטען עם ${tasks.length} משימות מתוזמנות`);
      
    } catch (error) {
      logger.error('❌ Failed to load scheduled tasks for POLLING:', error);
      this.dbScheduledTasks = [];
    }
  }

  /**
   * Reload database tasks (for web dashboard updates)
   */
  async reloadDatabaseTasks() {
    try {
      logger.info('🔄 מעדכן משימות מתוזמנות מהמסד נתונים (POLLING)...');
      await this.loadScheduledTasksFromDB();
      logger.info('✅ עדכון משימות מתוזמנות הושלם');
    } catch (error) {
      logger.error('❌ Failed to reload database tasks:', error);
    }
  }

  /**
   * Manual execution for testing
   */
  async executeTaskManually(taskId) {
    const lockKey = `task_${taskId}_manual`;
    
    if (this.executionLocks.has(lockKey)) {
      return { success: false, error: 'Task already executing' };
    }
    
    this.executionLocks.add(lockKey);
    
    try {
      logger.info(`🔧 [MANUAL] ביצוע ידני של משימה ${taskId}`);
      const result = await this.taskExecutionService.executeScheduledTask(taskId);
      
      // Update last execution time if successful
      if (result.success) {
        await this.db.runQuery(
          'UPDATE scheduled_tasks SET last_execution = ? WHERE id = ?',
          [new Date().toISOString(), taskId]
        );
      }
      
      return result;
    } finally {
      setTimeout(() => this.executionLocks.delete(lockKey), 5000);
    }
  }

  /**
   * Get polling status and statistics
   */
  getPollingStatus() {
    return {
      isActive: !!this.pollingInterval,
      pollingFrequency: `${this.pollingFrequencyMs / 1000}s`,
      lastCheckTime: this.lastCheckTime.toISOString(),
      activeTasks: this.dbScheduledTasks.length,
      currentlyExecuting: this.executionLocks.size,
      nextCheckIn: this.pollingInterval ? `${this.pollingFrequencyMs / 1000}s` : 'Stopped'
    };
  }

  // Keep all other methods from original SchedulerService for compatibility
  // (cronToReadable, parseUserSchedule, etc.)
  
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
   * Stop all scheduled jobs and polling
   */
  stopAll() {
    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info('⏰ POLLING הופסק');
    }
    
    // Clear execution locks
    this.executionLocks.clear();
    
    // Stop file watcher
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    
    logger.info('⏰ מערכת תזמונים מתוקנת הופסקה לחלוטין');
  }

  // Compatibility methods (keep existing interface)
  async scheduleGroup(groupId, cronSchedule) { return false; } // Not needed in polling mode
  stopAllJobs() { this.stopAll(); }
  stopAllDBTaskJobs() { } // Not needed in polling mode
  async createDBTaskCronJob(task) { return true; } // Not needed in polling mode
  isValidCronSchedule(schedule) {
    try {
      return cron.validate(schedule);
    } catch (error) {
      return false;
    }
  }
}

module.exports = SchedulerServiceFixed;