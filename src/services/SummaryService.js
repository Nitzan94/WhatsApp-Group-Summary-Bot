const OpenAI = require('openai');
const logger = require('../utils/logger');
const config = require('../../config/bot-config');

class SummaryService {
  constructor() {
    // Initialize OpenRouter API (compatible with OpenAI client)
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.openrouter.apiKey,
      defaultHeaders: {
        'HTTP-Referer': config.openrouter.siteName,
        'X-Title': config.openrouter.appName
      }
    });
    
    this.model = config.openrouter.model;
    this.maxTokens = config.openrouter.maxTokens;
  }

  /**
   * Generate summary from messages
   */
  async generateSummary(messages, groupName = 'הקבוצה') {
    try {
      if (!messages || messages.length === 0) {
        return {
          success: false,
          error: 'אין הודעות לסיכום'
        };
      }

      logger.info(`🤖 מייצר סיכום עבור ${messages.length} הודעות`);
      
      const prompt = this.buildPrompt(messages, groupName);
      const startTime = Date.now();
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.3, // Lower temperature for more consistent summaries
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const summaryText = response.choices[0]?.message?.content?.trim();
      const tokensUsed = response.usage?.total_tokens || 0;
      
      if (!summaryText) {
        throw new Error('לא התקבל תוכן בתגובה מה-API');
      }

      logger.info(`✅ סיכום הופק בהצלחה (${duration}ms, ${tokensUsed} tokens)`);
      
      return {
        success: true,
        summary: summaryText,
        metadata: {
          messagesCount: messages.length,
          model: this.model,
          tokensUsed: tokensUsed,
          duration: duration,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Failed to generate summary:', error);
      
      // Handle common API errors
      let errorMessage = 'שגיאה בייצור הסיכום';
      
      if (error.status === 401) {
        errorMessage = 'שגיאת הרשאה - בדוק את מפתח ה-API';
      } else if (error.status === 429) {
        errorMessage = 'חרגת ממגבלת הבקשות - נסה מאוחר יותר';
      } else if (error.status === 500) {
        errorMessage = 'שגיאה בשרת OpenRouter - נסה מאוחר יותר';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'בעיית חיבור לאינטרנט';
      }
      
      return {
        success: false,
        error: errorMessage,
        details: error.message
      };
    }
  }

  /**
   * Build prompt for summarization
   */
  buildPrompt(messages, groupName) {
    // Sort messages by timestamp
    const sortedMessages = messages.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Get time range
    const firstMessage = sortedMessages[0];
    const lastMessage = sortedMessages[sortedMessages.length - 1];
    const startTime = new Date(firstMessage.timestamp).toLocaleString('he-IL');
    const endTime = new Date(lastMessage.timestamp).toLocaleString('he-IL');

    // Format messages for prompt
    const formattedMessages = sortedMessages.map((msg, index) => {
      const time = new Date(msg.timestamp).toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `${index + 1}. [${time}] ${msg.senderName}: ${msg.content}`;
    }).join('\n');

    return `
נתח וסכם את השיחה הבאה מקבוצת "${groupName}" בפורמט המבוקש:

הודעות מהתקופה ${startTime} - ${endTime}:
${formattedMessages}

אנא הצג סיכום מסודר לפי המבנה שנדרש במדויק:

### 📊 מידע כללי
### 🗂️ סיכום לפי נושאים  
### ⚡ החלטות ומשימות
### 🔥 נקודות דחופות
### 💡 תובנות נוספות

עקוב אחר הפורמט המדויק שהוגדר במערכת, כולל האמוג'ים והמבנה.
`.trim();
  }

  /**
   * Get system prompt for the AI
   */
  getSystemPrompt() {
    return `
אתה בוט מומחה לסיכום שיחות WhatsApp. המשימה שלך היא לנתח שיחה ולהציג סיכום מסודר ומקצועי.

## המבנה הנדרש לכל סיכום:

### 📊 מידע כללי
- תאריך השיחה ומשך הזמן (אם ניתן לזהות)
- מספר המשתתפים הפעילים
- אופי השיחה (אישי/עבודה/קבוצה/משפחה)

### 🗂️ סיכום לפי נושאים
לכל נושא שזוהה, הצג:
- **[שם הנושא]**
  • נקודה ראשונה
  • נקודה שנייה  
  • נקודה שלישית

### ⚡ החלטות ומשימות
- משימות שהוקצו לאנשים ספציפיים
- החלטות שהתקבלו
- תאריכי יעד שהוזכרו

### 🔥 נקודות דחופות
- נושאים שדרשו תשומת לב מיידית
- בקשות דחופות שהועלו

### 💡 תובנות נוספות
- מידע חשוב שעלה אגב
- קישורים או המלצות שנשלחו

## הנחיות חשובות:
1. התעלם מהודעות של "הצטרף לקבוצה", "עזב את הקבוצה" וסטטוסים טכניים
2. התעלם מסטיקרים, אמוג'ים בודדים וממזג האוויר השגרתי
3. אם יש הודעה שנמחקה - אל תתייחס אליה
4. שמור על פרטיות - אל תציין מספרי טלפון או מידע אישי רגיש
5. אם השיחה בעברית - הסיכום בעברית, אם באנגלית - באנגלית
6. התמקד במהות ולא בפרטים טכניים של האפליקציה

## מה לעשות אם:
- **השיחה קצרה מדי (פחות מ-5 הודעות ממשיות):** "השיחה קצרה מדי לסיכום מסודר"
- **השיחה רק צחוקים/סטיקרים:** "השיחה מכילה בעיקר תגובות חברתיות ללא תוכן משמעותי"
- **שיחה לא ברורה:** ציין במפורש איזה חלקים לא היו ברורים

עכשיו, נתח את השיחה שתועבר אליך והצג סיכום לפי המבנה הזה.
`.trim();
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      logger.info('🧪 בודק חיבור ל-OpenRouter API...');
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: 'תגיד שלום בעברית'
          }
        ],
        max_tokens: 50
      });

      const content = response.choices[0]?.message?.content?.trim();
      
      if (content) {
        logger.info(`✅ חיבור לAPI תקין: "${content}"`);
        return { success: true, message: content };
      } else {
        throw new Error('לא התקבלה תגובה תקינה');
      }

    } catch (error) {
      logger.error('API connection test failed:', error);
      return { 
        success: false, 
        error: error.message || 'שגיאה לא ידועה' 
      };
    }
  }

  /**
   * Get available models
   */
  async getModels() {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${config.openrouter.apiKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data || [];
      
    } catch (error) {
      logger.error('Failed to fetch models:', error);
      return [];
    }
  }

  /**
   * Format summary for WhatsApp
   */
  formatSummaryForWhatsApp(summary, groupName, metadata = {}) {
    const header = `🤖 *סיכום קבוצת ${groupName}*\n`;
    const footer = `\n📊 *מידע טכני:*\n• הודעות: ${metadata.messagesCount || 'לא ידוע'}\n• מודל: ${metadata.model || 'לא ידוע'}\n• זמן: ${new Date().toLocaleString('he-IL')}\n\n_סיכום זה הופק באמצעות AI_`;
    
    return header + summary + footer;
  }
}

module.exports = SummaryService;