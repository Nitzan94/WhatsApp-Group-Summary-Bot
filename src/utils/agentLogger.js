const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs', { recursive: true });
}

/**
 * AI Agent Activity Logger
 * Logs all AI Agent activities including questions, tool calls, and responses
 */
const agentLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json()
  ),
  transports: [
    // Dedicated file for AI Agent activity
    new winston.transports.File({
      filename: './logs/ai-agent-activity.log',
      maxsize: '50m',
      maxFiles: 30,
      tailable: true
    })
  ]
});

/**
 * Log AI Agent conversation session
 */
function logConversationStart(sessionId, question, userId, groupId, groupName) {
  agentLogger.info('CONVERSATION_START', {
    sessionId,
    timestamp: new Date().toISOString(),
    question: question.substring(0, 500), // Limit question length
    userId,
    groupId,
    groupName,
    event: 'conversation_start'
  });
}

/**
 * Log tool execution
 */
function logToolExecution(sessionId, toolName, parameters, result, executionTime) {
  agentLogger.info('TOOL_EXECUTION', {
    sessionId,
    timestamp: new Date().toISOString(),
    toolName,
    parameters,
    resultSummary: {
      type: Array.isArray(result) ? 'array' : typeof result,
      count: Array.isArray(result) ? result.length : (result ? 1 : 0),
      sample: Array.isArray(result) && result.length > 0 ? 
        {
          firstItem: result[0],
          totalItems: result.length
        } : 
        result
    },
    executionTime,
    event: 'tool_execution'
  });
}

/**
 * Log database search results
 */
function logDatabaseSearch(sessionId, searchType, query, filters, results) {
  agentLogger.info('DATABASE_SEARCH', {
    sessionId,
    timestamp: new Date().toISOString(),
    searchType,
    query: query ? query.substring(0, 200) : null,
    filters,
    resultCount: Array.isArray(results) ? results.length : 0,
    resultSample: Array.isArray(results) && results.length > 0 ? 
      results.slice(0, 3).map(msg => ({
        id: msg.id,
        sender: msg.sender_name,
        timestamp: msg.timestamp,
        contentPreview: msg.body ? msg.body.substring(0, 100) : null
      })) : [],
    event: 'database_search'
  });
}

/**
 * Log AI response generation
 */
function logAIResponse(sessionId, response, toolCallsCount, totalTime) {
  agentLogger.info('AI_RESPONSE', {
    sessionId,
    timestamp: new Date().toISOString(),
    responseLength: response ? response.length : 0,
    responsePreview: response ? response.substring(0, 200) : null,
    toolCallsCount,
    totalProcessingTime: totalTime,
    event: 'ai_response'
  });
}

/**
 * Log conversation completion
 */
function logConversationEnd(sessionId, success, error = null, totalTime = 0) {
  agentLogger.info('CONVERSATION_END', {
    sessionId,
    timestamp: new Date().toISOString(),
    success,
    error: error ? error.message : null,
    totalConversationTime: totalTime,
    event: 'conversation_end'
  });
}

/**
 * Log data insights - what information was accessed
 */
function logDataInsights(sessionId, insights) {
  agentLogger.info('DATA_INSIGHTS', {
    sessionId,
    timestamp: new Date().toISOString(),
    insights: {
      groupsAccessed: insights.groupsAccessed || [],
      timeRangeAnalyzed: insights.timeRangeAnalyzed || null,
      messagesAnalyzed: insights.messagesAnalyzed || 0,
      keyTopics: insights.keyTopics || [],
      usersInvolved: insights.usersInvolved || []
    },
    event: 'data_insights'
  });
}

/**
 * Generate a unique session ID for tracking conversations
 */
function generateSessionId() {
  return `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper to create readable log file for human analysis
 */
async function generateHumanReadableReport(sessionId) {
  try {
    const logPath = './logs/ai-agent-activity.log';
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
      .filter(log => log !== null);

    if (sessionLogs.length === 0) {
      return null;
    }

    // Generate human-readable report
    let report = `🤖 AI Agent Session Report\n`;
    report += `📅 Session ID: ${sessionId}\n`;
    report += `⏰ Started: ${sessionLogs[0]?.timestamp}\n\n`;

    const startLog = sessionLogs.find(log => log.event === 'conversation_start');
    if (startLog) {
      report += `❓ Question: ${startLog.question}\n`;
      report += `👤 User: ${startLog.userId}\n`;
      report += `🏠 Group: ${startLog.groupName} (${startLog.groupId})\n\n`;
    }

    const toolLogs = sessionLogs.filter(log => log.event === 'tool_execution');
    if (toolLogs.length > 0) {
      report += `🛠️ Tools Used (${toolLogs.length}):\n`;
      toolLogs.forEach((tool, index) => {
        report += `  ${index + 1}. ${tool.toolName}\n`;
        report += `     ⏱️ Time: ${tool.executionTime}ms\n`;
        report += `     📊 Result: ${tool.resultSummary?.count || 0} items\n`;
      });
      report += '\n';
    }

    const searchLogs = sessionLogs.filter(log => log.event === 'database_search');
    if (searchLogs.length > 0) {
      report += `🔍 Database Searches (${searchLogs.length}):\n`;
      searchLogs.forEach((search, index) => {
        report += `  ${index + 1}. ${search.searchType}: ${search.query}\n`;
        report += `     📊 Found: ${search.resultCount} messages\n`;
      });
      report += '\n';
    }

    const responseLog = sessionLogs.find(log => log.event === 'ai_response');
    if (responseLog) {
      report += `💬 AI Response:\n`;
      report += `   📝 Length: ${responseLog.responseLength} characters\n`;
      report += `   🛠️ Tool calls: ${responseLog.toolCallsCount}\n`;
      report += `   ⏱️ Processing time: ${responseLog.totalProcessingTime}ms\n`;
      report += `   📄 Preview: ${responseLog.responsePreview}...\n\n`;
    }

    const endLog = sessionLogs.find(log => log.event === 'conversation_end');
    if (endLog) {
      report += `✅ Status: ${endLog.success ? 'Success' : 'Failed'}\n`;
      if (endLog.error) {
        report += `❌ Error: ${endLog.error}\n`;
      }
      report += `⏱️ Total time: ${endLog.totalConversationTime}ms\n`;
    }

    return report;
  } catch (error) {
    agentLogger.error('Error generating human readable report:', error);
    return null;
  }
}

module.exports = {
  agentLogger,
  logConversationStart,
  logToolExecution,
  logDatabaseSearch,
  logAIResponse,
  logConversationEnd,
  logDataInsights,
  generateSessionId,
  generateHumanReadableReport
};