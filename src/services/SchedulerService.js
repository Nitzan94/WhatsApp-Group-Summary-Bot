const cron = require('node-cron');
const logger = require('../utils/logger');

class SchedulerService {
  constructor(bot, db) {
    this.bot = bot;
    this.db = db;
    this.activeCronJobs = new Map(); // Map of groupId -> cron job
    this.isInitialized = false;
  }

  /**
   * Initialize scheduler service and load existing schedules
   */
  async initialize() {
    try {
      logger.info('🕒 מאתחל מערכת תזמונים...');
      
      // Load all active schedules from database
      const groups = await this.db.getActiveGroups();
      let scheduledCount = 0;
      
      for (const group of groups) {
        if (group.schedule && this.isValidCronSchedule(group.schedule)) {
          await this.scheduleGroup(group.id, group.schedule);
          scheduledCount++;
        }
      }
      
      // Schedule daily cleanup at 02:00
      await this.scheduleDailyCleanup();
      
      this.isInitialized = true;
      logger.info(`✅ מערכת תזמונים הופעלה - ${scheduledCount} תזמונים פעילים`);
      
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
   * Execute scheduled summary for a group
   */
  async executeScheduledSummary(groupId) {
    try {
      const group = await this.db.getGroup(groupId);
      if (!group) {
        logger.error(`Scheduled job for unknown group: ${groupId}`);
        return;
      }

      logger.info(`⏰ מבצע סיכום מתוזמן לקבוצת "${group.name}"`);
      
      // Get today's messages
      const messages = await this.db.getTodaysMessages(groupId);
      
      if (messages.length === 0) {
        logger.info(`📭 אין הודעות לסיכום בקבוצת "${group.name}"`);
        return;
      }

      // Generate summary
      const result = await this.bot.summaryService.generateSummary(messages, group.name);
      
      if (!result.success) {
        logger.error(`Failed scheduled summary for "${group.name}": ${result.error}`);
        return;
      }

      // Format summary
      const today = new Date().toLocaleDateString('he-IL');
      const formattedSummary = `⏰ *סיכום אוטומטי - ${today}*\n*קבוצת ${group.name}*\n\n${result.summary}\n\n📊 *מידע טכני:*\n• הודעות: ${messages.length}\n• מודל: ${result.metadata.model}\n• זמן: ${new Date().toLocaleString('he-IL')}\n\n_סיכום אוטומטי זה הופק באמצעות AI_`;

      // Send summary to target group (ניצן)
      await this.bot.socket.sendMessage(this.bot.summaryTargetGroupId, {
        text: formattedSummary
      });

      // Save summary to database
      const summaryData = {
        groupId: groupId,
        summaryText: result.summary,
        messagesCount: messages.length,
        startTime: messages[0]?.timestamp || new Date().toISOString(),
        endTime: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        modelUsed: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed
      };

      const summaryId = await this.db.saveSummary(summaryData);
      logger.info(`✅ סיכום אוטומטי הושלם לקבוצת "${group.name}" (ID: ${summaryId})`);

    } catch (error) {
      logger.error('Failed to execute scheduled summary:', error);
    }
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
   * Stop all scheduled jobs (for cleanup)
   */
  stopAll() {
    for (const [groupId, job] of this.activeCronJobs) {
      job.stop();
    }
    this.activeCronJobs.clear();
    logger.info('⏰ כל התזמונים הופסקו');
  }
}

module.exports = SchedulerService;