const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs', { recursive: true });
}

/**
 * Enhanced Request Logger - מערכת לוגים מפורטת לבקשות משתמש
 * מתעדת את כל תהליך החשיבה של הבוט כולל:
 * - כל שלב בטיפול בבקשה
 * - מידע שהבוט קרא ושלח במלואו
 * - כלים ופרמטרים שהבוט השתמש בהם
 */
const requestLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json()
  ),
  transports: [
    // קובץ לוג יעודי לבקשות משתמש
    new winston.transports.File({
      filename: './logs/user-requests.log',
      maxsize: '100m',
      maxFiles: 50,
      tailable: true
    })
  ]
});

/**
 * תיעוד תחילת בקשת משתמש
 */
function logRequestStart(sessionId, request) {
  requestLogger.info('REQUEST_START', {
    sessionId,
    timestamp: new Date().toISOString(),
    userId: request.userId,
    userName: request.userName || 'Unknown',
    groupId: request.groupId,
    groupName: request.groupName || 'Private Chat',
    messageId: request.messageId,
    originalQuestion: request.question,
    questionLength: request.question?.length || 0,
    event: 'request_start'
  });
}

/**
 * תיעוד שלבי עיבוד הבקשה
 */
function logProcessingStep(sessionId, stepName, details) {
  requestLogger.info('PROCESSING_STEP', {
    sessionId,
    timestamp: new Date().toISOString(),
    stepName,
    stepDetails: details,
    event: 'processing_step'
  });
}

/**
 * תיעוד מידע שהבוט קרא מהמסד נתונים
 */
function logDataRead(sessionId, operation, query, results) {
  const truncatedResults = truncateData(results, 5);
  
  requestLogger.info('DATA_READ', {
    sessionId,
    timestamp: new Date().toISOString(),
    operation,
    query: query ? String(query).substring(0, 300) : null,
    resultCount: Array.isArray(results) ? results.length : (results ? 1 : 0),
    resultSample: truncatedResults,
    event: 'data_read'
  });
}

/**
 * תיעוד שימוש בכלים
 */
function logToolUsage(sessionId, toolName, parameters, result, executionTime) {
  const truncatedResult = truncateData(result, 3);
  
  requestLogger.info('TOOL_USAGE', {
    sessionId,
    timestamp: new Date().toISOString(),
    toolName,
    parameters: parameters ? JSON.parse(JSON.stringify(parameters)) : null,
    executionTimeMs: executionTime,
    resultType: Array.isArray(result) ? 'array' : typeof result,
    resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0),
    resultSample: truncatedResult,
    event: 'tool_usage'
  });
}

/**
 * תיעוד קריאה לAI (Claude)
 */
function logAIInteraction(sessionId, prompt, response, toolCalls, processingTime) {
  requestLogger.info('AI_INTERACTION', {
    sessionId,
    timestamp: new Date().toISOString(),
    promptLength: prompt?.length || 0,
    promptPreview: prompt ? prompt.substring(0, 200) + '...' : null,
    responseLength: response?.length || 0,
    responsePreview: response ? response.substring(0, 200) + '...' : null,
    toolCallsCount: toolCalls?.length || 0,
    toolCallsSummary: toolCalls?.map(tc => ({
      name: tc.function?.name,
      parameters: Object.keys(tc.function?.arguments ? JSON.parse(tc.function.arguments) : {})
    })) || [],
    processingTimeMs: processingTime,
    event: 'ai_interaction'
  });
}

/**
 * תיעוד תגובה סופית למשתמש
 */
function logResponse(sessionId, response, success, error) {
  requestLogger.info('RESPONSE_SENT', {
    sessionId,
    timestamp: new Date().toISOString(),
    success,
    responseLength: response?.length || 0,
    responsePreview: response ? response.substring(0, 200) + '...' : null,
    error: error ? {
      message: error.message,
      type: error.constructor.name,
      stack: error.stack?.split('\n')[0]
    } : null,
    event: 'response_sent'
  });
}

/**
 * תיעוד סיום טיפול בבקשה
 */
function logRequestEnd(sessionId, totalTime, success, summary) {
  requestLogger.info('REQUEST_END', {
    sessionId,
    timestamp: new Date().toISOString(),
    totalProcessingTimeMs: totalTime,
    success,
    summary: {
      toolsUsed: summary?.toolsUsed || 0,
      dataQueriesExecuted: summary?.dataQueriesExecuted || 0,
      messagesAnalyzed: summary?.messagesAnalyzed || 0,
      groupsAccessed: summary?.groupsAccessed || [],
      aiInteractions: summary?.aiInteractions || 0
    },
    event: 'request_end'
  });
}

/**
 * תיעוד תובנות מהנתונים שנצברו
 */
function logInsights(sessionId, insights) {
  requestLogger.info('REQUEST_INSIGHTS', {
    sessionId,
    timestamp: new Date().toISOString(),
    insights: {
      topicsDiscussed: insights.topicsDiscussed || [],
      timeRangeAnalyzed: insights.timeRangeAnalyzed || null,
      mostActiveUsers: insights.mostActiveUsers || [],
      keyFindings: insights.keyFindings || [],
      dataSourcesUsed: insights.dataSourcesUsed || []
    },
    event: 'request_insights'
  });
}

/**
 * פונקציה לקיצור נתונים גדולים - מציגה רק דגימה
 */
function truncateData(data, maxItems = 5) {
  if (!data) return null;
  
  if (Array.isArray(data)) {
    if (data.length === 0) return { type: 'empty_array' };
    if (data.length <= maxItems) return data;
    
    return {
      type: 'array_sample',
      totalItems: data.length,
      sample: data.slice(0, maxItems),
      note: `(מציג ${maxItems} מתוך ${data.length} פריטים)`
    };
  }
  
  if (typeof data === 'string' && data.length > 500) {
    return {
      type: 'truncated_string',
      originalLength: data.length,
      preview: data.substring(0, 200) + '...',
      note: `(מציג 200 מתוך ${data.length} תווים)`
    };
  }
  
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length > 10) {
      const sample = {};
      keys.slice(0, 10).forEach(key => sample[key] = data[key]);
      return {
        type: 'object_sample',
        totalKeys: keys.length,
        sample,
        note: `(מציג 10 מתוך ${keys.length} מפתחות)`
      };
    }
  }
  
  return data;
}

/**
 * יצירת דוח נגיש לקריאה אנושית
 */
async function generateRequestReport(sessionId) {
  try {
    const logPath = './logs/user-requests.log';
    if (!fs.existsSync(logPath)) {
      return null;
    }

    const logContent = fs.readFileSync(logPath, 'utf8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    const sessionLogs = lines
      .filter(line => line.includes(sessionId))
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(log => log !== null)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (sessionLogs.length === 0) {
      return null;
    }

    // יצירת דוח מפורט
    let report = `🤖 דוח מפורט - בקשת משתמש\n`;
    report += `📅 Session ID: ${sessionId}\n`;
    report += `⏰ התחיל: ${sessionLogs[0]?.timestamp}\n\n`;

    const startLog = sessionLogs.find(log => log.event === 'request_start');
    if (startLog) {
      report += `👤 משתמש: ${startLog.userName} (${startLog.userId})\n`;
      report += `🏠 קבוצה: ${startLog.groupName}\n`;
      report += `❓ שאלה מקורית: ${startLog.originalQuestion}\n\n`;
    }

    // שלבי עיבוד
    const processingSteps = sessionLogs.filter(log => log.event === 'processing_step');
    if (processingSteps.length > 0) {
      report += `⚙️ שלבי עיבוד (${processingSteps.length}):\n`;
      processingSteps.forEach((step, index) => {
        report += `  ${index + 1}. ${step.stepName}\n`;
        if (step.stepDetails) {
          report += `     📋 פרטים: ${JSON.stringify(step.stepDetails, null, 2).substring(0, 200)}\n`;
        }
      });
      report += '\n';
    }

    // קריאת נתונים
    const dataReads = sessionLogs.filter(log => log.event === 'data_read');
    if (dataReads.length > 0) {
      report += `📊 קריאת נתונים (${dataReads.length}):\n`;
      dataReads.forEach((read, index) => {
        report += `  ${index + 1}. ${read.operation}\n`;
        report += `     🔍 שאילתה: ${read.query || 'N/A'}\n`;
        report += `     📈 תוצאות: ${read.resultCount} פריטים\n`;
        if (read.resultSample && read.resultSample.note) {
          report += `     💡 ${read.resultSample.note}\n`;
        }
      });
      report += '\n';
    }

    // שימוש בכלים
    const toolUsages = sessionLogs.filter(log => log.event === 'tool_usage');
    if (toolUsages.length > 0) {
      report += `🛠️ כלים ששימשו (${toolUsages.length}):\n`;
      toolUsages.forEach((tool, index) => {
        report += `  ${index + 1}. ${tool.toolName}\n`;
        report += `     ⏱️ זמן ביצוע: ${tool.executionTimeMs}ms\n`;
        report += `     📊 תוצאות: ${tool.resultCount} פריטים\n`;
        if (tool.parameters) {
          const paramKeys = Object.keys(tool.parameters);
          report += `     🔧 פרמטרים: ${paramKeys.join(', ')}\n`;
        }
      });
      report += '\n';
    }

    // אינטראקציות AI
    const aiInteractions = sessionLogs.filter(log => log.event === 'ai_interaction');
    if (aiInteractions.length > 0) {
      report += `🧠 אינטראקציות עם AI (${aiInteractions.length}):\n`;
      aiInteractions.forEach((ai, index) => {
        report += `  ${index + 1}. קריאה לAI\n`;
        report += `     ⏱️ זמן עיבוד: ${ai.processingTimeMs}ms\n`;
        report += `     📝 אורך prompt: ${ai.promptLength} תווים\n`;
        report += `     💬 אורך תגובה: ${ai.responseLength} תווים\n`;
        report += `     🛠️ כלים בשימוש: ${ai.toolCallsCount}\n`;
        if (ai.toolCallsSummary && ai.toolCallsSummary.length > 0) {
          report += `     🔧 כלים: ${ai.toolCallsSummary.map(tc => tc.name).join(', ')}\n`;
        }
      });
      report += '\n';
    }

    // סיכום
    const endLog = sessionLogs.find(log => log.event === 'request_end');
    if (endLog) {
      report += `📊 סיכום ביצועים:\n`;
      report += `   ⏱️ זמן כולל: ${endLog.totalProcessingTimeMs}ms\n`;
      report += `   ✅ הצלחה: ${endLog.success ? 'כן' : 'לא'}\n`;
      if (endLog.summary) {
        report += `   🛠️ כלים: ${endLog.summary.toolsUsed}\n`;
        report += `   🔍 שאילתות: ${endLog.summary.dataQueriesExecuted}\n`;
        report += `   💬 הודעות נותחו: ${endLog.summary.messagesAnalyzed}\n`;
        report += `   🏠 קבוצות: ${endLog.summary.groupsAccessed.length}\n`;
      }
    }

    const responseLog = sessionLogs.find(log => log.event === 'response_sent');
    if (responseLog) {
      report += `\n💌 תגובה שנשלחה:\n`;
      report += `   📏 אורך: ${responseLog.responseLength} תווים\n`;
      report += `   📄 תצוגה מקדימה: ${responseLog.responsePreview}\n`;
      if (responseLog.error) {
        report += `   ❌ שגיאה: ${responseLog.error.message}\n`;
      }
    }

    return report;
  } catch (error) {
    requestLogger.error('Error generating request report:', error);
    return null;
  }
}

/**
 * יצירת session ID יחודי
 */
function generateSessionId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  requestLogger,
  logRequestStart,
  logProcessingStep,
  logDataRead,
  logToolUsage,
  logAIInteraction,
  logResponse,
  logRequestEnd,
  logInsights,
  generateRequestReport,
  generateSessionId,
  truncateData
};