const OpenAI = require('openai');
const logger = require('../utils/logger');
const config = require('../../config/bot-config');
const DatabaseAgentTools = require('./DatabaseAgentTools');
const {
  logConversationStart,
  logToolExecution,
  logDatabaseSearch,
  logAIResponse,
  logConversationEnd,
  logDataInsights,
  generateSessionId
} = require('../utils/agentLogger');
// מערכת לוגים מפורטת חדשה לבקשות משתמש
const {
  logRequestStart,
  logProcessingStep,
  logDataRead,
  logToolUsage,
  logAIInteraction,
  logResponse,
  logRequestEnd,
  logInsights,
  generateSessionId: generateRequestSessionId
} = require('../utils/requestLogger');

/**
 * ConversationHandler - הליבה החדשה לשיחה טבעית
 * מעבד שאלות טבעיות ומחפש תשובות במסד הנתונים ההיסטורי
 */
class ConversationHandler {
  constructor(databaseManager) {
    this.db = databaseManager;
    this.dbTools = new DatabaseAgentTools(databaseManager);
    
    // Initialize OpenRouter API (compatible with OpenAI client)
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: config.openrouter.apiKey,
      defaultHeaders: {
        'HTTP-Referer': config.openrouter.siteName || 'http://localhost:3000',
        'X-Title': config.openrouter.appName || 'WhatsApp Natural Language Bot'
      }
    });
    
    // מודל שניתן להחליף בקלות - תמיכה במודלים מרובים
    this.model = config.openrouter.model || 'anthropic/claude-3.5-sonnet';
    this.maxTokens = config.openrouter.maxTokens || 2000;
    
    // הגדרות חיפוש
    this.searchLimits = {
      maxResults: 50,        // מספר תוצאות מקסימלי
      maxContextLength: 8000, // מספר תווים מקסימלי להקשר
      minRelevance: 0.3      // ציון רלוונטיות מינימלי
    };
  }

  /**
   * אתחול מערכת השיחה
   */
  async initialize() {
    try {
      logger.info('🤖 ConversationHandler initialized successfully as AI Agent');
      return true;
    } catch (error) {
      logger.error('Failed to initialize ConversationHandler:', error);
      throw error;
    }
  }

  /**
   * Set bot instance for message sending functionality
   */
  setBotInstance(botInstance) {
    this.botInstance = botInstance;
    this.dbTools.setBotInstance(botInstance);
    logger.info('🔗 Bot instance set for ConversationHandler and DatabaseAgentTools');
  }

  /**
   * Set ConfigService reference for dynamic group management
   */
  setConfigService(configService) {
    this.dbTools.setConfigService(configService);
    logger.info('📊 ConfigService injected for dynamic group management');
  }

  /**
   * עיבוד שאלות טבעיות - הפונקציה המרכזית עם AI Agent
   */
  async processNaturalQuery(question, groupId = null, userType = 'user', forceGroupQuery = false, userId = null, userName = null) {
    const sessionId = generateSessionId();
    const requestSessionId = generateRequestSessionId();
    const startTime = Date.now();
    let success = false;
    let error = null;
    
    try {
      logger.info(`🤖 [AI AGENT] עיבוד שאלה: "${question.substring(0, 100)}..."`);
      
      // Get group info for logging
      let groupName = null;
      if (groupId) {
        try {
          const groupInfo = await this.db.getQuery('SELECT name FROM groups WHERE id = ?', [groupId]);
          groupName = groupInfo?.name || 'Unknown Group';
          logDataRead(requestSessionId, 'group_info_lookup', 'SELECT name FROM groups WHERE id = ?', groupInfo);
        } catch (err) {
          groupName = 'Unknown Group';
        }
      }
      
      // Log conversation start (existing system)
      logConversationStart(sessionId, question, userId || 'Unknown User', groupId, groupName);
      
      // Log request start (new detailed system)
      logRequestStart(requestSessionId, {
        userId,
        userName,
        groupId,
        groupName,
        messageId: null,
        question
      });
      
      logProcessingStep(requestSessionId, 'initialization', {
        userType,
        forceGroupQuery,
        sessionId: sessionId
      });
      
      // Build context from parameters
      const context = { groupId, userType, forceGroupQuery, sessionId, requestSessionId };
      
      logProcessingStep(requestSessionId, 'context_setup', {
        context: Object.keys(context)
      });
      
      // Set context for DatabaseAgentTools (for permission checking)
      this.dbTools.setContext(context);
      
      logProcessingStep(requestSessionId, 'sending_to_ai_agent', {
        model: this.model,
        maxTokens: this.maxTokens
      });
      
      // שליחה ל-AI כ-Agent עם כלי מסד נתונים
      const response = await this.queryAIAgent(question, context);
      
      logProcessingStep(requestSessionId, 'ai_response_received', {
        responseLength: response?.length || 0,
        responsePreview: response ? response.substring(0, 100) + '...' : null
      });
      
      const duration = Date.now() - startTime;
      logger.info(`✅ [AI AGENT] שאלה עובדה תוך ${duration}ms`);
      
      success = true;
      
      // Log response sent (new system)
      logResponse(requestSessionId, response, true, null);
      
      // Log request end (new system)
      logRequestEnd(requestSessionId, duration, true, {
        toolsUsed: this.dbTools.getToolUsageCount?.() || 0,
        dataQueriesExecuted: this.dbTools.getQueryCount?.() || 0,
        messagesAnalyzed: this.dbTools.getAnalyzedMessagesCount?.() || 0,
        groupsAccessed: [groupId].filter(Boolean),
        aiInteractions: 1
      });
      
      logConversationEnd(sessionId, true, null, duration);
      
      // Return structured response only for SchedulerService (when userType is 'system')
      // For regular users, return plain string
      if (userType === 'system') {
        return {
          success: true,
          response: response,
          error: null
        };
      }
      
      // For regular conversation, return plain string
      return response;
      
    } catch (error) {
      logger.error('Error processing natural query with AI Agent:', error);
      
      const duration = Date.now() - startTime;
      const errorMessage = `❌ מצטער ${userType === 'user' ? 'Nitzan Bar-Ness' : ''}, יש לי קצת בעיה טכנית עכשיו.\nאנסה שוב מאוחר יותר או נסח את השאלה אחרת.`;
      
      // Log error in new system
      logResponse(requestSessionId, errorMessage, false, error);
      logRequestEnd(requestSessionId, duration, false, {
        toolsUsed: this.dbTools.getToolUsageCount?.() || 0,
        dataQueriesExecuted: this.dbTools.getQueryCount?.() || 0,
        messagesAnalyzed: 0,
        groupsAccessed: [groupId].filter(Boolean),
        aiInteractions: 0
      });
      
      // Log conversation error (existing system) 
      logConversationEnd(sessionId, false, error, duration);
      
      // Return structured response for system calls, plain error message for users
      if (userType === 'system') {
        return {
          success: false,
          response: null,
          error: error.message || 'Unknown error occurred'
        };
      }
      
      // For regular users, return a user-friendly error message
      return errorMessage;
    }
  }

  /**
   * עיבוד תזמונים מתוזמנים (חדש!)
   */
  async processScheduledQuery(frequency, groupId, customPrompt = null) {
    try {
      logger.info(`⏰ עיבוד תזמון: ${frequency} עבור קבוצה ${groupId}`);
      
      const prompt = customPrompt || this.generateSchedulePrompt(frequency, groupId);
      const context = { 
        groupId, 
        isScheduled: true, 
        frequency,
        timeRange: this.getTimeRangeForFrequency(frequency)
      };
      
      return await this.processNaturalQuery(prompt, context);
      
    } catch (error) {
      logger.error('Error processing scheduled query:', error);
      return `שגיאה בעיבוד תזמון: ${error.message}`;
    }
  }

  /**
   * חיפוש הודעות רלוונטיות במסד הנתונים
   */
  async searchRelevantMessages(question, context = {}) {
    try {
      logger.info(`🔍 [DEBUG] searchRelevantMessages called with:`);
      logger.info(`   Question: "${question}"`);
      logger.info(`   Context: ${JSON.stringify(context)}`);
      
      // זיהוי קבוצה מהשאלה
      const detectedGroupId = await this.detectGroupFromQuestion(question);
      
      // שימוש במערכת FTS5 לחיפוש מתקדם
      const searchOptions = {
        limit: this.searchLimits.maxResults,
        groupId: detectedGroupId || null, // אם לא זוהתה קבוצה ספציפית, חפש בכל הקבוצות
        dateRange: context.timeRange,
        minRelevance: this.searchLimits.minRelevance,
        includeSnippets: true
      };
      
      logger.info(`🔍 [DEBUG] Search options: ${JSON.stringify(searchOptions)}`);
      logger.info(`🔍 [DEBUG] FTS initialized: ${this.fts.isInitialized}`);
      logger.info(`🔍 [DEBUG] Detected group ID: ${detectedGroupId}`);
      
      const results = await this.fts.searchMessages(question, searchOptions);
      logger.info(`🔍 FTS5 מצא ${results.length} הודעות רלוונטיות לשאלה`);
      
      if (results.length === 0) {
        logger.info(`🔍 [DEBUG] No results found - trying without group filter...`);
        // נסיון חיפוש נוסף ללא סינון קבוצה
        const fallbackOptions = { ...searchOptions, groupId: null };
        const fallbackResults = await this.fts.searchMessages(question, fallbackOptions);
        logger.info(`🔍 [DEBUG] Fallback search (no group filter): ${fallbackResults.length} results`);
        return fallbackResults;
      }
      
      return results;
      
    } catch (error) {
      logger.error('Error searching relevant messages:', error);
      // Fallback לחיפוש בסיסי אם FTS5 נכשל
      return await this.fallbackSearch(question, context);
    }
  }

  /**
   * חיפוש בסיסי כ-fallback אם FTS5 נכשל
   */
  async fallbackSearch(question, context = {}) {
    try {
      let sql = `
        SELECT 
          m.content,
          m.sender_name,
          m.timestamp,
          g.name as group_name,
          m.message_type,
          0.5 as relevance_score
        FROM messages m
        JOIN groups g ON m.group_id = g.id
        WHERE 1=1
      `;
      
      const params = [];
      
      // סינון לפי קבוצה אם צוין
      if (context.groupId) {
        sql += ' AND m.group_id = ?';
        params.push(context.groupId);
      }
      
      // סינון לפי טווח זמן אם צוין
      if (context.timeRange) {
        sql += ' AND m.timestamp >= ? AND m.timestamp <= ?';
        params.push(context.timeRange.start, context.timeRange.end);
      }
      
      // חיפוש טקסט בסיסי
      const keywords = this.extractKeywords(question);
      if (keywords.length > 0) {
        const searchConditions = keywords.map(() => 'm.content LIKE ?').join(' OR ');
        sql += ` AND (${searchConditions})`;
        keywords.forEach(keyword => params.push(`%${keyword}%`));
      }
      
      // מיון לפי זמן ומגבלה
      sql += ' ORDER BY m.timestamp DESC LIMIT ?';
      params.push(this.searchLimits.maxResults);
      
      const results = await this.db.allQuery(sql, params);
      logger.info(`🔍 Fallback search מצא ${results.length} הודעות`);
      
      return results;
      
    } catch (error) {
      logger.error('Error in fallback search:', error);
      return [];
    }
  }

  /**
   * זיהוי קבוצה ספציפית מהשאלה
   */
  async detectGroupFromQuestion(question) {
    try {
      // דפוסי זיהוי קבוצות בעברית
      const groupPatterns = [
        /בקבוצ[תה]\s*["']?([^"']+)["']?/i,
        /בצ'אט\s*["']?([^"']+)["']?/i,
        /ב[-]?["']?([^"']+)["']?\s*קבוצה/i,
        /קבוצ[תה]\s*["']?([^"']+)["']?/i
      ];
      
      // חיפוש דפוסים
      for (const pattern of groupPatterns) {
        const match = question.match(pattern);
        if (match && match[1]) {
          const groupName = match[1].trim();
          logger.info(`🔍 זוהה שם קבוצה מהשאלה: "${groupName}"`);
          
          // חיפוש הקבוצה במסד הנתונים
          const group = await this.findGroupByName(groupName);
          if (group) {
            logger.info(`✅ נמצאה קבוצה: ${group.name} (${group.id})`);
            return group.id;
          }
        }
      }
      
      // אם לא נמצאה קבוצה ספציפית
      logger.info(`🔍 לא זוהתה קבוצה ספציפית בשאלה`);
      return null;
      
    } catch (error) {
      logger.error('Error detecting group from question:', error);
      return null;
    }
  }

  /**
   * חיפוש קבוצה לפי שם (חיפוש חלקי)
   */
  async findGroupByName(searchName) {
    try {
      // חיפוש בשם המדויק
      let sql = `SELECT id, name FROM groups WHERE LOWER(name) LIKE LOWER(?) AND is_active = 1`;
      let results = await this.db.allQuery(sql, [`%${searchName}%`]);
      
      if (results.length > 0) {
        // אם יש מספר תוצאות, נבחר את הכי דומה
        const bestMatch = results.find(g => g.name.toLowerCase().includes(searchName.toLowerCase())) || results[0];
        return bestMatch;
      }
      
      logger.info(`🔍 לא נמצאה קבוצה בשם: "${searchName}"`);
      return null;
      
    } catch (error) {
      logger.error('Error finding group by name:', error);
      return null;
    }
  }

  /**
   * חילוץ מילות מפתח מהשאלה
   */
  extractKeywords(question) {
    // מילים להתעלם מהן
    const stopWords = [
      'מה', 'איך', 'מתי', 'איפה', 'למה', 'מי', 'אם', 'כן', 'לא',
      'זה', 'של', 'על', 'את', 'עם', 'אל', 'היום', 'אתמול', 'מחר'
    ];
    
    // חילוץ מילים ללא סימני פיסוק
    const words = question
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
      
    return [...new Set(words)]; // הסרת כפילויות
  }

  /**
   * בניית הקשר לשליחה לAI
   */
  buildAIContext(question, searchResults, context) {
    let contextText = '';
    let currentLength = 0;
    
    for (const message of searchResults) {
      const messageText = `[${message.timestamp}] ${message.sender_name} בקבוצת "${message.group_name}": ${message.content}\n`;
      
      if (currentLength + messageText.length > this.searchLimits.maxContextLength) {
        break;
      }
      
      contextText += messageText;
      currentLength += messageText.length;
    }
    
    return {
      messages: contextText,
      messageCount: searchResults.length,
      groupContext: context.groupId ? 'שאלה על קבוצה ספציפית' : 'שאלה כללית',
      timeContext: context.timeRange ? `טווח זמן: ${context.timeRange.description}` : 'כל הזמנים'
    };
  }

  /**
   * שליחת שאלה לAI כ-Agent עם כלי מסד נתונים
   */
  async queryAIAgent(question, context = {}) {
    const startTime = Date.now();
    const { requestSessionId } = context;
    
    try {
      const systemPrompt = this.buildSystemPromptForAgent();
      const tools = this.dbTools.createToolDefinitions();
      
      logger.info(`🤖 [AI AGENT] Sending question with ${tools.length} database tools available`);
      
      if (requestSessionId) {
        logProcessingStep(requestSessionId, 'ai_agent_preparation', {
          toolsAvailable: tools.length,
          systemPromptLength: systemPrompt.length,
          model: this.model
        });
      }
      
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ];
      
      let response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages,
        max_tokens: this.maxTokens,
        temperature: 0.7,
        tools: tools.map(tool => ({
          type: 'function',
          function: tool
        })),
        tool_choice: 'auto'
      });
      
      if (requestSessionId) {
        logAIInteraction(requestSessionId, 
          systemPrompt + '\n\nUser: ' + question,
          response.choices[0]?.message?.content || '',
          response.choices[0]?.message?.tool_calls || [],
          Date.now() - startTime
        );
      }
      
      let finalAnswer = '';
      let toolCallsCount = 0;
      const maxToolCalls = 10; // מניעת לולאות אינסופיות
      
      // לולאת tool calls
      while (response.choices[0].message.tool_calls && toolCallsCount < maxToolCalls) {
        const toolCalls = response.choices[0].message.tool_calls;
        logger.info(`🛠️ [AI AGENT] AI requested ${toolCalls.length} tool calls`);
        
        // הוספת תגובת ה-AI עם tool calls
        messages.push(response.choices[0].message);
        
        // ביצוע כל ה-tool calls
        for (const toolCall of toolCalls) {
          const { name, arguments: args, id } = toolCall.function;
          const toolStartTime = Date.now();
          
          try {
            logger.info(`🛠️ [AI AGENT] Executing tool: ${name}`);
            const parsedArgs = JSON.parse(args);
            const toolResult = await this.dbTools.executeTool(name, parsedArgs);
            const toolExecutionTime = Date.now() - toolStartTime;
            
            // Log detailed tool execution (existing system)
            logToolExecution(context.sessionId, name, parsedArgs, toolResult, toolExecutionTime);
            
            // Log tool usage (new detailed system)
            if (requestSessionId) {
              logToolUsage(requestSessionId, name, parsedArgs, toolResult, toolExecutionTime);
            }
            
            // הוספת תוצאת ה-tool
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult)
            });
            
          } catch (error) {
            const toolExecutionTime = Date.now() - toolStartTime;
            logger.error(`Error executing tool ${name}:`, error);
            
            // Log failed tool execution (existing system)
            logToolExecution(context.sessionId, name, JSON.parse(args || '{}'), { error: error.message }, toolExecutionTime);
            
            // Log failed tool usage (new detailed system)
            if (requestSessionId) {
              logToolUsage(requestSessionId, name, JSON.parse(args || '{}'), { error: error.message }, toolExecutionTime);
            }
            
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: ${error.message}`
            });
          }
        }
        
        // קריאה נוספת ל-AI עם תוצאות ה-tools
        response = await this.client.chat.completions.create({
          model: this.model,
          messages: messages,
          max_tokens: this.maxTokens,
          temperature: 0.7,
          tools: tools.map(tool => ({
            type: 'function',
            function: tool
          })),
          tool_choice: 'auto'
        });
        
        toolCallsCount++;
      }
      
      finalAnswer = response.choices[0]?.message?.content || 'לא הצלחתי לקבל תשובה מהמערכת';
      
      // Log AI response
      const totalTime = Date.now() - startTime;
      logAIResponse(context.sessionId, finalAnswer, toolCallsCount, totalTime);
      
      logger.info(`🤖 [AI AGENT] Completed with ${toolCallsCount} tool call rounds`);
      return finalAnswer;
      
    } catch (error) {
      logger.error('Error in queryAIAgent:', error);
      throw error;
    }
  }

  /**
   * שליחת שאלה לAI עם הקשר (deprecated - ישן)
   */
  async queryAIWithContext(question, contextData) {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(question, contextData);
      
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this.maxTokens,
        temperature: 0.7
      });
      
      const answer = response.choices[0]?.message?.content || 'לא הצלחתי לקבל תשובה מהמערכת';
      
      // הוספת מידע על מספר ההודעות שנבדקו
      const footer = `\n\n📊 *בדקתי ${contextData.messageCount} הודעות מההיסטוריה*`;
      
      return answer + footer;
      
    } catch (error) {
      logger.error('Error querying AI:', error);
      throw error;
    }
  }

  /**
   * בניית system prompt חדש לAI Agent
   */
  buildSystemPromptForAgent() {
    const currentDate = new Date().toISOString().split('T')[0]; // 2025-08-31
    return `אתה AI Agent חכם המתמחה בניתוח הודעות WhatsApp. אתה יכול לגשת למסד נתונים של הודעות ולחפש בו בעצמך.

⏰ **תאריך נוכחי: ${currentDate}** - תאריכים לפני זה הם עבר, אחרי זה הם עתיד.

🎯 **התפקיד שלך:**
- לענות על שאלות על בסיס מסד הנתונים של הודעות WhatsApp
- לחפש במסד הנתונים בעצמך באמצעות הכלים הזמינים לך
- לנתח ולסכם מידע מהודעות בצורה חכמה ומדויקת

🛠️ **הכלים הזמינים לך:**
- search_groups: חיפוש קבוצות לפי שם
- get_group_by_name: מציאת קבוצה לפי שם וקבלת ה-ID שלה
- search_messages_in_group: חיפוש הודעות בקבוצה ספציפית
- get_recent_messages: קבלת הודעות אחרונות מקבוצה
- get_messages_by_date: קבלת הודעות מתאריך ספציפי
- send_message_to_group: שליחת הודעה לקבוצת WhatsApp אחרת (רק מקבוצת Nitzan bot)

📋 **אסטרטגיית העבודה:**
1. **הבן את השאלה** - מה המשתמש רוצה לדעת?
2. **זהה קבוצות רלוונטיות** - איזו קבוצה הוא מתכוון אליה?
3. **חפש את הקבוצה** - השתמש בכלים למציאת ה-ID הנכון
4. **חפש הודעות** - השתמש בכלים לחיפוש הודעות רלוונטיות
5. **נתח ותן תשובה** - סכם את הממצאים בצורה ברורה

🎯 **כללי עבודה חשובים:**
- **תמיד חפש בעצמך** - אל תסתמך על מידע שלא חיפשת
- **אם לא מוצא מידע** - נסה אסטרטגיות חיפוש שונות
- **תן תשובות מדויקות** - התבסס רק על מה שמצאת במסד הנתונים
- **סכם בצורה ידידותית** - כתוב בעברית ברורה ומובנת
- **ציין מקורות** - אם מתאים, ציין מאיזו קבוצה המידע הגיע

💡 **דוגמאות לשאלות:**
- "מה קרה אתמול בקבוצת חדשות טכנולוגיה?" → חפש קבוצה → קבל הודעות מאתמול → סכם
- "חפש לי מידע על AI בכל הקבוצות" → חפש "AI" בכל מקום → סכם ממצאים
- "תן לי עדכון מהקבוצה של ניצן" → מצא קבוצת ניצן → קבל הודעות אחרונות → סכם
- "תשלח לקבוצת הילדים הודעה שהגעתי" → השתמש בsend_message_to_group → שלח הודעה

זכור: אתה Agent עצמאי שיכול לחפש ולנתח. השתמש בכלים שלך בחכמה!`;
  }

  /**
   * בניית system prompt ישן לAI (deprecated)
   */
  buildSystemPrompt() {
    return `אתה עוזר חכם לניתוח הודעות WhatsApp. התפקיד שלך:

1. לענות על שאלות על בסיס הודעות ההיסטוריה שמועברות אליך
2. להיות מדויק ולהסתמך רק על המידע שמועבר אליك
3. לכתוב בעברית ברורה ונגישה
4. לסכם מידע מרובה בצורה מובנת
5. לציין אם אין מספיק מידע לתשובה מלאה

כללים חשובים:
- תמיד התבסס על ההודעות שמועברות אליך
- אל תמציא מידע שלא קיים בהודעות
- אם אין מידע רלוונטי, תגיד זאת במפורש
- כתב בסגנון ידידותי וברור`;
  }

  /**
   * בניית user prompt עם השאלה וההקשר
   */
  buildUserPrompt(question, contextData) {
    return `שאלה: ${question}

הודעות רלוונטיות מההיסטוריה:
${contextData.messages}

הקשר נוסף:
- ${contextData.groupContext}
- ${contextData.timeContext}
- נבדקו ${contextData.messageCount} הודעות

אנא ענה על השאלה על בסיס ההודעות שמופיעות למעלה.`;
  }

  /**
   * יצירת prompt לתזמונים
   */
  generateSchedulePrompt(frequency, groupId) {
    const prompts = {
      daily: "תן סיכום של הדיונים החשובים מהיום, התמקד במה שבאמת מעניין ורלוונטי",
      weekly: "תן סיכום של השבוע האחרון, כולל המגמות והנושאים המרכזיים שעלו",
      monthly: "תן סיכום חודשי עם דגש על החלטות, כיוונים חדשים ונושאים חשובים"
    };
    
    return prompts[frequency] || prompts.daily;
  }

  /**
   * חישוב טווח זמן לתזמון
   */
  getTimeRangeForFrequency(frequency) {
    const now = new Date();
    let start = new Date();
    
    switch (frequency) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        return {
          start: start.toISOString(),
          end: now.toISOString(),
          description: 'היום'
        };
      
      case 'weekly':
        start.setDate(now.getDate() - 7);
        return {
          start: start.toISOString(),
          end: now.toISOString(),
          description: 'השבוע האחרון'
        };
      
      case 'monthly':
        start.setDate(now.getDate() - 30);
        return {
          start: start.toISOString(),
          end: now.toISOString(),
          description: 'החודש האחרון'
        };
      
      default:
        start.setHours(0, 0, 0, 0);
        return {
          start: start.toISOString(),
          end: now.toISOString(),
          description: 'היום'
        };
    }
  }

  /**
   * תשובה כשאין תוצאות
   */
  generateNoResultsResponse(question) {
    return `🤔 לא מצאתי מידע רלוונטי לשאלה "${question}" בהיסטוריית ההודעות.

אולי תוכל לנסח את השאלה אחרת או לברר על נושא שנדון יותר בקבוצות?`;
  }

  /**
   * תשובת שגיאה
   */
  generateErrorResponse(question, error) {
    logger.error('Generating error response for question:', question, error);
    return `❌ מצטער, אירעה שגיאה בעיבוד השאלה שלך.
    
אנא נסה שוב מאוחר יותר או נסח את השאלה אחרת.`;
  }
}

module.exports = ConversationHandler;