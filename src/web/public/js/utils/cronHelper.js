/**
 * CRON Helper Utility - עזר לעבודה עם תזמונים CRON
 * 
 * תומך בפורמטים CRON מתקדמים וכולל validation ו-humanization
 */
class CronHelper {
  
  /**
   * בדיקת תקינות ביטוי CRON
   * @param {string} cronExpression - ביטוי CRON (5 או 6 חלקים)
   * @returns {Object} {isValid: boolean, error?: string}
   */
  static validateCron(cronExpression) {
    if (!cronExpression || typeof cronExpression !== 'string') {
      return { isValid: false, error: 'ביטוי CRON לא יכול להיות ריק' };
    }

    const parts = cronExpression.trim().split(/\s+/);
    
    // CRON צריך להיות 5 חלקים: minute hour day month day-of-week
    if (parts.length !== 5) {
      return { isValid: false, error: 'ביטוי CRON חייב לכלול 5 חלקים בדיוק: minute hour day month day-of-week' };
    }

    const [minute, hour, day, month, dayOfWeek] = parts;

    // בדיקת כל חלק
    const validations = [
      { value: minute, min: 0, max: 59, name: 'דקות' },
      { value: hour, min: 0, max: 23, name: 'שעות' },
      { value: day, min: 1, max: 31, name: 'יום בחודש' },
      { value: month, min: 1, max: 12, name: 'חודש' },
      { value: dayOfWeek, min: 0, max: 7, name: 'יום בשבוע' } // 0 ו-7 זה ראשון
    ];

    for (const validation of validations) {
      const error = this.validateCronField(validation.value, validation.min, validation.max, validation.name);
      if (error) {
        return { isValid: false, error };
      }
    }

    return { isValid: true };
  }

  /**
   * בדיקת שדה CRON בודד
   * @param {string} field - ערך השדה
   * @param {number} min - ערך מינימלי
   * @param {number} max - ערך מקסימלי  
   * @param {string} fieldName - שם השדה לשגיאה
   * @returns {string|null} הודעת שגיאה או null
   */
  static validateCronField(field, min, max, fieldName) {
    // כוכבית מותרת
    if (field === '*') return null;
    
    // רשימה (comma separated)
    if (field.includes(',')) {
      const values = field.split(',');
      for (const value of values) {
        const error = this.validateCronField(value.trim(), min, max, fieldName);
        if (error) return error;
      }
      return null;
    }
    
    // טווח (dash)
    if (field.includes('-')) {
      const [start, end] = field.split('-');
      if (!start || !end) {
        return `טווח לא תקין ב${fieldName}: ${field}`;
      }
      const error1 = this.validateCronField(start.trim(), min, max, fieldName);
      const error2 = this.validateCronField(end.trim(), min, max, fieldName);
      if (error1 || error2) return error1 || error2;
      
      if (parseInt(start) > parseInt(end)) {
        return `טווח לא תקין ב${fieldName}: ${field} - התחלה גדולה מסוף`;
      }
      return null;
    }
    
    // צעד (slash)
    if (field.includes('/')) {
      const [base, step] = field.split('/');
      if (!step || isNaN(step)) {
        return `צעד לא תקין ב${fieldName}: ${field}`;
      }
      const error = this.validateCronField(base, min, max, fieldName);
      if (error) return error;
      return null;
    }
    
    // מספר בודד
    const num = parseInt(field);
    if (isNaN(num)) {
      return `ערך לא תקין ב${fieldName}: ${field}`;
    }
    
    if (num < min || num > max) {
      return `ערך ${fieldName} חייב להיות בין ${min} ל-${max}, קיבלת: ${num}`;
    }
    
    return null;
  }

  /**
   * המרת ביטוי CRON לטקסט בעברית
   * @param {string} cronExpression 
   * @returns {string}
   */
  static humanizeCron(cronExpression) {
    try {
      const validation = this.validateCron(cronExpression);
      if (!validation.isValid) {
        return `CRON לא תקין: ${validation.error}`;
      }

      const [minute, hour, day, month, dayOfWeek] = cronExpression.split(/\s+/);
      
      let result = '';
      
      // זמן
      if (minute === '0' && hour !== '*') {
        result += `כל יום ב-${hour}:00`;
      } else if (minute !== '*' && hour !== '*') {
        result += `כל יום ב-${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      } else if (minute !== '*' && hour === '*') {
        result += `כל שעה בדקה ${minute}`;
      } else {
        result += 'כל דקה';
      }
      
      // יום בשבוע
      if (dayOfWeek !== '*') {
        const days = {
          '0': 'ראשון', '1': 'שני', '2': 'שלישי', '3': 'רביעי',
          '4': 'חמישי', '5': 'שישי', '6': 'שבת', '7': 'ראשון'
        };
        
        if (dayOfWeek.includes(',')) {
          const dayNames = dayOfWeek.split(',').map(d => days[d.trim()]).filter(Boolean);
          result = result.replace('כל יום', `בימי ${dayNames.join(', ')}`);
        } else if (dayOfWeek.includes('-')) {
          const [start, end] = dayOfWeek.split('-');
          result = result.replace('כל יום', `בימי ${days[start]}-${days[end]}`);
        } else {
          result = result.replace('כל יום', `בכל יום ${days[dayOfWeek] || dayOfWeek}`);
        }
      }
      
      // יום בחודש
      if (day !== '*') {
        if (day.includes(',')) {
          result += ` בימים ${day}`;
        } else if (day.includes('-')) {
          result += ` בימים ${day}`;
        } else {
          result += ` ביום ${day} בחודש`;
        }
      }
      
      // חודש
      if (month !== '*') {
        const months = {
          '1': 'ינואר', '2': 'פברואר', '3': 'מרץ', '4': 'אפריל',
          '5': 'מאי', '6': 'יוני', '7': 'יולי', '8': 'אוגוסט',
          '9': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר'
        };
        
        if (month.includes(',')) {
          const monthNames = month.split(',').map(m => months[m.trim()]).filter(Boolean);
          result += ` בחודשים ${monthNames.join(', ')}`;
        } else {
          result += ` בחודש ${months[month] || month}`;
        }
      }
      
      return result;
      
    } catch (error) {
      return `שגיאה בפענוח CRON: ${cronExpression}`;
    }
  }

  /**
   * בניית ביטוי CRON לפי סוג ואפשרויות
   * @param {string} type - 'daily', 'weekly', 'custom'
   * @param {Object} options - אפשרויות התזמון
   * @returns {Object} {cron: string, description: string}
   */
  static buildCron(type, options = {}) {
    switch (type) {
      case 'daily':
        return this.buildDailyCron(options);
      
      case 'weekly':
        return this.buildWeeklyCron(options);
      
      case 'custom':
        return this.buildCustomCron(options);
      
      default:
        throw new Error(`סוג תזמון לא נתמך: ${type}`);
    }
  }

  /**
   * בניית CRON יומי
   * @param {Object} options - {hour: number, minute: number}
   * @returns {Object}
   */
  static buildDailyCron(options) {
    const { hour = 18, minute = 0 } = options;
    const cron = `${minute} ${hour} * * *`;
    
    return {
      cron,
      description: this.humanizeCron(cron)
    };
  }

  /**
   * בניית CRON שבועי
   * @param {Object} options - {day: number, hour: number, minute: number}
   * @returns {Object}
   */
  static buildWeeklyCron(options) {
    const { day = 0, hour = 18, minute = 0 } = options; // ברירת מחדל: ראשון 18:00
    const cron = `${minute} ${hour} * * ${day}`;
    
    return {
      cron,
      description: this.humanizeCron(cron)
    };
  }

  /**
   * בניית CRON מותאם אישית
   * @param {Object} options - {cron: string}
   * @returns {Object}
   */
  static buildCustomCron(options) {
    const { cron } = options;
    
    const validation = this.validateCron(cron);
    if (!validation.isValid) {
      throw new Error(`CRON לא תקין: ${validation.error}`);
    }
    
    return {
      cron,
      description: this.humanizeCron(cron)
    };
  }

  /**
   * דוגמאות CRON נפוצות
   * @returns {Array<Object>}
   */
  static getCommonExamples() {
    return [
      { cron: '0 18 * * *', description: 'כל יום ב-18:00', label: 'יומי - 18:00' },
      { cron: '0 16 * * *', description: 'כל יום ב-16:00', label: 'יומי - 16:00' },
      { cron: '30 20 * * *', description: 'כל יום ב-20:30', label: 'יומי - 20:30' },
      { cron: '0 9 * * 1-5', description: 'בימי שני-שישי ב-9:00', label: 'ימי חול - 9:00' },
      { cron: '0 22 * * 0', description: 'בכל יום ראשון ב-22:00', label: 'שבועי - ראשון 22:00' },
      { cron: '0 12 1 * *', description: 'ב-1 לחודש ב-12:00', label: 'חודשי - ה-1 בצהריים' },
      { cron: '*/15 * * * *', description: 'כל 15 דקות', label: 'כל רבע שעה' },
      { cron: '0 8,12,18 * * *', description: 'ב-8:00, 12:00 ו-18:00', label: '3 פעמים ביום' }
    ];
  }

  /**
   * חישוב זמן ההרצה הבא
   * @param {string} cronExpression 
   * @returns {Date|null}
   */
  static getNextRunTime(cronExpression) {
    try {
      const validation = this.validateCron(cronExpression);
      if (!validation.isValid) {
        return null;
      }
      
      // פשטנות - חישוב בסיסי לזמנים פשוטים
      const [minute, hour, day, month, dayOfWeek] = cronExpression.split(/\s+/);
      const now = new Date();
      let next = new Date(now);
      
      // אם זה תזמון יומי פשוט (0 XX * * *)
      if (minute === '0' && !hour.includes('*') && day === '*' && month === '*' && dayOfWeek === '*') {
        const targetHour = parseInt(hour);
        next.setHours(targetHour, 0, 0, 0);
        
        // אם הזמן עבר היום, עבור ליום הבא
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        
        return next;
      }
      
      // למקרים מורכבים יותר, נחזיר null (יצטרך ספרייה חיצונית)
      return null;
      
    } catch (error) {
      return null;
    }
  }
}

// Export לשימוש גלובלי
if (typeof window !== 'undefined') {
  window.CronHelper = CronHelper;
}

// Export ל-Node.js אם רלוונטי  
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CronHelper;
}