const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * ScheduleParser - מנתח קבצי תזמונים טקסטואליים לאובייקטי תזמון מובנים
 */
class ScheduleParser {
  constructor() {
    this.scheduleValidators = {
      groups: (groups) => Array.isArray(groups) && groups.length > 0,
      action: (action) => typeof action === 'string' && action.trim().length > 0,
      schedule: (schedule) => typeof schedule === 'string' && this.isValidScheduleFormat(schedule),
      sendTo: (sendTo) => typeof sendTo === 'string' && sendTo.trim().length > 0
    };
  }

  /**
   * מנתח קובץ schedules.txt לרשימת תזמונים
   */
  async parse(filePath) {
    try {
      logger.info(`📄 [PARSER] Reading schedule file: ${filePath}`);
      
      const content = await fs.readFile(filePath, 'utf8');
      const scheduleBlocks = this.splitIntoBlocks(content);
      const parsedSchedules = [];

      for (let i = 0; i < scheduleBlocks.length; i++) {
        const block = scheduleBlocks[i];
        const schedule = this.parseBlock(block, i + 1);
        
        if (schedule) {
          parsedSchedules.push(schedule);
        }
      }

      logger.info(`✅ [PARSER] Successfully parsed ${parsedSchedules.length} schedules`);
      return parsedSchedules;

    } catch (error) {
      logger.error('❌ [PARSER] Failed to parse schedule file:', error);
      return [];
    }
  }

  /**
   * מפצל את תוכן הקובץ לבלוקי תזמון נפרדים
   */
  splitIntoBlocks(content) {
    return content
      .split('---')
      .map(block => block.trim())
      .filter(block => block.length > 0 && !this.isCommentOnly(block));
  }

  /**
   * בודק אם בלוק מכיל רק הערות
   */
  isCommentOnly(block) {
    const lines = block.split('\n').map(line => line.trim());
    return lines.every(line => line.startsWith('#') || line === '');
  }

  /**
   * מנתח בלוק תזמון יחיד
   */
  parseBlock(block, blockNumber) {
    try {
      const lines = block
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      const schedule = {
        id: `schedule_${blockNumber}`,
        name: this.extractName(block),
        groups: [],
        action: '',
        schedule: '',
        sendTo: '',
        cronExpression: ''
      };

      let currentSection = null;
      let groupsStarted = false;

      for (const line of lines) {
        if (line.startsWith('groups:')) {
          currentSection = 'groups';
          groupsStarted = true;
          continue;
        }

        if (line.startsWith('action:')) {
          currentSection = 'action';
          schedule.action = line.substring(7).trim();
          continue;
        }

        if (line.startsWith('schedule:')) {
          currentSection = 'schedule';
          schedule.schedule = line.substring(9).trim();
          continue;
        }

        if (line.startsWith('send to:')) {
          currentSection = 'sendTo';
          schedule.sendTo = line.substring(8).trim();
          continue;
        }

        // אם אנחנו בסקציית groups, הוסף את השורה כקבוצה (רק אם לא ריקה)
        if (currentSection === 'groups' && groupsStarted && line.trim().length > 0) {
          schedule.groups.push(line);
        }
      }

      // המרת לוח זמנים טבעי לביטוי cron
      schedule.cronExpression = this.convertToCron(schedule.schedule);

      // ולידציה
      const validation = this.validateSchedule(schedule);
      if (!validation.valid) {
        logger.warn(`⚠️ [PARSER] Invalid schedule ${blockNumber}: ${validation.error}`);
        return null;
      }

      logger.debug(`✅ [PARSER] Parsed schedule: ${schedule.name} (${schedule.groups.length} groups)`);
      return schedule;

    } catch (error) {
      logger.error(`❌ [PARSER] Failed to parse block ${blockNumber}:`, error);
      return null;
    }
  }

  /**
   * מחלץ שם תזמון מהערה
   */
  extractName(block) {
    const lines = block.split('\n');
    const commentLine = lines.find(line => line.trim().startsWith('#'));
    
    if (commentLine) {
      return commentLine.trim().substring(1).trim();
    }
    
    return `Schedule ${Date.now()}`;
  }

  /**
   * ולידציה של תזמון
   */
  validateSchedule(schedule) {
    for (const [field, validator] of Object.entries(this.scheduleValidators)) {
      if (!validator(schedule[field])) {
        return {
          valid: false,
          error: `Invalid ${field}: ${schedule[field]}`
        };
      }
    }

    return { valid: true };
  }

  /**
   * בדיקת תקינות פורמט תזמון
   */
  isValidScheduleFormat(schedule) {
    const naturalLanguagePatterns = [
      /^every day at \d{1,2}:\d{2}$/,
      /^every \d+ minutes?$/,
      /^every hour$/,
      /^every (sunday|monday|tuesday|wednesday|thursday|friday|saturday) at \d{1,2}:\d{2}$/,
      /^every weekday at \d{1,2}:\d{2}$/,
      /^every weekend at \d{1,2}:\d{2}$/
    ];

    // בדיקת שפה טבעית
    const lowerSchedule = schedule.toLowerCase().trim();
    for (const pattern of naturalLanguagePatterns) {
      if (pattern.test(lowerSchedule)) {
        return true;
      }
    }

    // בדיקת ביטוי cron ישיר
    return this.isValidCronExpression(schedule);
  }

  /**
   * בדיקת תקינות ביטוי cron
   */
  isValidCronExpression(expr) {
    try {
      const parts = expr.split(' ');
      return parts.length === 5; // פורמט cron בסיסי
    } catch {
      return false;
    }
  }

  /**
   * המרת לוח זמנים טבעי לביטוי cron
   */
  convertToCron(schedule) {
    const lowerSchedule = schedule.toLowerCase().trim();

    // every day at HH:MM
    const dailyMatch = lowerSchedule.match(/^every day at (\d{1,2}):(\d{2})$/);
    if (dailyMatch) {
      const hour = parseInt(dailyMatch[1]);
      const minute = parseInt(dailyMatch[2]);
      return `${minute} ${hour} * * *`;
    }

    // every X minutes
    const minutesMatch = lowerSchedule.match(/^every (\d+) minutes?$/);
    if (minutesMatch) {
      const minutes = parseInt(minutesMatch[1]);
      return `*/${minutes} * * * *`;
    }

    // every hour
    if (lowerSchedule === 'every hour') {
      return `0 * * * *`;
    }

    // every [day] at HH:MM
    const weekdayMatch = lowerSchedule.match(/^every (sunday|monday|tuesday|wednesday|thursday|friday|saturday) at (\d{1,2}):(\d{2})$/);
    if (weekdayMatch) {
      const dayMap = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6
      };
      const day = dayMap[weekdayMatch[1]];
      const hour = parseInt(weekdayMatch[2]);
      const minute = parseInt(weekdayMatch[3]);
      return `${minute} ${hour} * * ${day}`;
    }

    // every weekday at HH:MM
    const weekdayTimeMatch = lowerSchedule.match(/^every weekday at (\d{1,2}):(\d{2})$/);
    if (weekdayTimeMatch) {
      const hour = parseInt(weekdayTimeMatch[1]);
      const minute = parseInt(weekdayTimeMatch[2]);
      return `${minute} ${hour} * * 1-5`;
    }

    // every weekend at HH:MM
    const weekendMatch = lowerSchedule.match(/^every weekend at (\d{1,2}):(\d{2})$/);
    if (weekendMatch) {
      const hour = parseInt(weekendMatch[1]);
      const minute = parseInt(weekendMatch[2]);
      return `${minute} ${hour} * * 0,6`;
    }

    // אם זה כבר ביטוי cron, החזר כמו שהוא
    if (this.isValidCronExpression(schedule)) {
      return schedule;
    }

    logger.warn(`⚠️ [PARSER] Unknown schedule format: "${schedule}", using default daily at midnight`);
    return `0 0 * * *`;
  }

  /**
   * מייצא תזמון חזרה לפורמט קריא
   */
  cronToReadable(cronExpr) {
    try {
      const parts = cronExpr.split(' ');
      if (parts.length !== 5) return cronExpr;

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // יומי
      if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        if (minute.startsWith('*/')) {
          const mins = minute.substring(2);
          return `כל ${mins} דקות`;
        }
        if (hour === '*' && minute === '0') {
          return `כל שעה`;
        }
        return `יומי בשעה ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }

      // שבועי
      if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        
        if (dayOfWeek === '1-5') {
          return `בימי שבוע בשעה ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        }
        if (dayOfWeek === '0,6') {
          return `בסוף שבוע בשעה ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
        }
        
        const dayName = days[parseInt(dayOfWeek)] || dayOfWeek;
        return `שבועי ביום ${dayName} בשעה ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      }

      return cronExpr;
    } catch (error) {
      return cronExpr;
    }
  }
}

module.exports = ScheduleParser;