const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs', { recursive: true });
}

/**
 * Scheduler Logger - מערכת לוגים מפורטת לתזמונים
 * מתעדת את כל פעילות התזמונים כולל:
 * - ביצוע משימות מתוזמנות
 * - תהליכי עיבוד וכלים בשימוש
 * - תוצאות וביצועים
 */
const schedulerLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json()
  ),
  transports: [
    // קובץ לוג יעודי לתזמונים
    new winston.transports.File({
      filename: './logs/scheduler-activity.log',
      maxsize: '100m',
      maxFiles: 50,
      tailable: true
    })
  ]
});

/**
 * תיעוד התחלת ביצוע משימה מתוזמנת
 */
function logScheduledTaskStart(sessionId, task) {
  schedulerLogger.info('SCHEDULED_TASK_START', {
    sessionId,
    timestamp: new Date().toISOString(),
    taskId: task.id,
    taskName: task.name,
    taskType: task.task_type,
    taskDescription: task.description,
    schedule: task.schedule_expression,
    expectedRunTime: task.next_run,
    targetGroups: task.target_groups || [],
    event: 'scheduled_task_start'
  });
}

/**
 * תיעוד שלבי ביצוע משימה מתוזמנת
 */
function logScheduledTaskStep(sessionId, taskId, stepName, details) {
  schedulerLogger.info('SCHEDULED_TASK_STEP', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    stepName,
    stepDetails: details,
    event: 'scheduled_task_step'
  });
}

/**
 * תיעוד פעולת נתונים במהלך ביצוע תזמון
 */
function logScheduledDataOperation(sessionId, taskId, operation, query, results) {
  const truncatedResults = truncateSchedulerData(results, 5);
  
  schedulerLogger.info('SCHEDULED_DATA_OPERATION', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    operation,
    query: query ? String(query).substring(0, 300) : null,
    resultCount: Array.isArray(results) ? results.length : (results ? 1 : 0),
    resultSample: truncatedResults,
    event: 'scheduled_data_operation'
  });
}

/**
 * תיעוד שימוש בכלים בתזמונים
 */
function logScheduledToolUsage(sessionId, taskId, toolName, parameters, result, executionTime) {
  const truncatedResult = truncateSchedulerData(result, 3);
  
  schedulerLogger.info('SCHEDULED_TOOL_USAGE', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    toolName,
    parameters: parameters ? JSON.parse(JSON.stringify(parameters)) : null,
    executionTimeMs: executionTime,
    resultType: Array.isArray(result) ? 'array' : typeof result,
    resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0),
    resultSample: truncatedResult,
    event: 'scheduled_tool_usage'
  });
}

/**
 * תיעוד אינטראקציה עם AI במהלך תזמון
 */
function logScheduledAIInteraction(sessionId, taskId, prompt, response, toolCalls, processingTime) {
  schedulerLogger.info('SCHEDULED_AI_INTERACTION', {
    sessionId,
    taskId,
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
    event: 'scheduled_ai_interaction'
  });
}

/**
 * תיעוד שליחת תוצאה של תזמון לקבוצות
 */
function logScheduledOutput(sessionId, taskId, groupsTargeted, messagesSent, success, errors) {
  schedulerLogger.info('SCHEDULED_OUTPUT', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    groupsTargeted: groupsTargeted || [],
    messagesAttempted: messagesSent?.attempted || 0,
    messagesSuccess: messagesSent?.successful || 0,
    messagesFailed: messagesSent?.failed || 0,
    success,
    errors: errors?.map(err => ({
      groupId: err.groupId,
      error: err.error?.message || err.error,
      type: err.error?.constructor?.name || 'Unknown'
    })) || [],
    event: 'scheduled_output'
  });
}

/**
 * תיעוד סיום ביצוע משימה מתוזמנת
 */
function logScheduledTaskEnd(sessionId, taskId, totalTime, success, summary, nextRun) {
  schedulerLogger.info('SCHEDULED_TASK_END', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    totalExecutionTimeMs: totalTime,
    success,
    nextScheduledRun: nextRun,
    summary: {
      toolsUsed: summary?.toolsUsed || 0,
      dataOperationsExecuted: summary?.dataOperationsExecuted || 0,
      messagesAnalyzed: summary?.messagesAnalyzed || 0,
      groupsProcessed: summary?.groupsProcessed || [],
      aiInteractions: summary?.aiInteractions || 0,
      outputsSent: summary?.outputsSent || 0
    },
    event: 'scheduled_task_end'
  });
}

/**
 * תיעוד שגיאות בתזמון
 */
function logScheduledTaskError(sessionId, taskId, error, context) {
  schedulerLogger.error('SCHEDULED_TASK_ERROR', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      type: error.constructor.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    },
    context: context || {},
    event: 'scheduled_task_error'
  });
}

/**
 * תיעוד ביצועים ותובנות על תזמונים
 */
function logScheduledInsights(sessionId, taskId, insights) {
  schedulerLogger.info('SCHEDULED_INSIGHTS', {
    sessionId,
    taskId,
    timestamp: new Date().toISOString(),
    insights: {
      executionPattern: insights.executionPattern || null,
      averageExecutionTime: insights.averageExecutionTime || null,
      successRate: insights.successRate || null,
      mostActiveGroups: insights.mostActiveGroups || [],
      commonTopics: insights.commonTopics || [],
      dataSourcesUsed: insights.dataSourcesUsed || [],
      performanceMetrics: insights.performanceMetrics || {}
    },
    event: 'scheduled_insights'
  });
}

/**
 * תיעוד ניהול תזמונים (יצירה, עדכון, מחיקה)
 */
function logSchedulerManagement(action, taskDetails, result) {
  const sessionId = `mgmt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  schedulerLogger.info('SCHEDULER_MANAGEMENT', {
    sessionId,
    timestamp: new Date().toISOString(),
    action, // 'create', 'update', 'delete', 'sync'
    taskId: taskDetails.id || null,
    taskName: taskDetails.name || null,
    taskType: taskDetails.task_type || null,
    result: {
      success: result.success || false,
      message: result.message || null,
      error: result.error || null,
      affectedTasks: result.affectedTasks || 0
    },
    event: 'scheduler_management'
  });
}

/**
 * קיצור נתונים גדולים לתזמונים
 */
function truncateSchedulerData(data, maxItems = 5) {
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
  
  if (typeof data === 'string' && data.length > 400) {
    return {
      type: 'truncated_string',
      originalLength: data.length,
      preview: data.substring(0, 150) + '...',
      note: `(מציג 150 מתוך ${data.length} תווים)`
    };
  }
  
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length > 8) {
      const sample = {};
      keys.slice(0, 8).forEach(key => sample[key] = data[key]);
      return {
        type: 'object_sample',
        totalKeys: keys.length,
        sample,
        note: `(מציג 8 מתוך ${keys.length} מפתחות)`
      };
    }
  }
  
  return data;
}

/**
 * יצירת דוח תזמון מפורט
 */
async function generateSchedulerReport(sessionId) {
  try {
    const logPath = './logs/scheduler-activity.log';
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

    // יצירת דוח תזמון מפורט
    let report = `⏰ דוח ביצוע תזמון\n`;
    report += `📅 Session ID: ${sessionId}\n`;
    report += `🕐 התחיל: ${sessionLogs[0]?.timestamp}\n\n`;

    const startLog = sessionLogs.find(log => log.event === 'scheduled_task_start');
    if (startLog) {
      report += `📝 משימה: ${startLog.taskName}\n`;
      report += `🏷️ סוג: ${startLog.taskType}\n`;
      report += `📋 תיאור: ${startLog.taskDescription}\n`;
      report += `🕒 לוח זמנים: ${startLog.schedule}\n`;
      report += `🎯 קבוצות יעד: ${startLog.targetGroups?.length || 0} קבוצות\n\n`;
    }

    // שלבי ביצוע
    const taskSteps = sessionLogs.filter(log => log.event === 'scheduled_task_step');
    if (taskSteps.length > 0) {
      report += `⚙️ שלבי ביצוע (${taskSteps.length}):\n`;
      taskSteps.forEach((step, index) => {
        report += `  ${index + 1}. ${step.stepName}\n`;
        if (step.stepDetails) {
          report += `     📋 פרטים: ${JSON.stringify(step.stepDetails, null, 2).substring(0, 150)}...\n`;
        }
      });
      report += '\n';
    }

    // פעולות נתונים
    const dataOps = sessionLogs.filter(log => log.event === 'scheduled_data_operation');
    if (dataOps.length > 0) {
      report += `📊 פעולות נתונים (${dataOps.length}):\n`;
      dataOps.forEach((op, index) => {
        report += `  ${index + 1}. ${op.operation}\n`;
        report += `     🔍 שאילתה: ${op.query || 'N/A'}\n`;
        report += `     📈 תוצאות: ${op.resultCount} פריטים\n`;
      });
      report += '\n';
    }

    // כלים בשימוש
    const toolUsages = sessionLogs.filter(log => log.event === 'scheduled_tool_usage');
    if (toolUsages.length > 0) {
      report += `🛠️ כלים בשימוש (${toolUsages.length}):\n`;
      toolUsages.forEach((tool, index) => {
        report += `  ${index + 1}. ${tool.toolName}\n`;
        report += `     ⏱️ זמן ביצוע: ${tool.executionTimeMs}ms\n`;
        report += `     📊 תוצאות: ${tool.resultCount} פריטים\n`;
      });
      report += '\n';
    }

    // אינטראקציות AI
    const aiInteractions = sessionLogs.filter(log => log.event === 'scheduled_ai_interaction');
    if (aiInteractions.length > 0) {
      report += `🧠 אינטראקציות AI (${aiInteractions.length}):\n`;
      aiInteractions.forEach((ai, index) => {
        report += `  ${index + 1}. קריאה לAI\n`;
        report += `     ⏱️ זמן עיבוד: ${ai.processingTimeMs}ms\n`;
        report += `     📝 אורך prompt: ${ai.promptLength} תווים\n`;
        report += `     💬 אורך תגובה: ${ai.responseLength} תווים\n`;
        report += `     🛠️ כלים: ${ai.toolCallsCount}\n`;
      });
      report += '\n';
    }

    // פלטים שנשלחו
    const outputs = sessionLogs.filter(log => log.event === 'scheduled_output');
    if (outputs.length > 0) {
      report += `📤 פלטים שנשלחו (${outputs.length}):\n`;
      outputs.forEach((output, index) => {
        report += `  ${index + 1}. שליחה לקבוצות\n`;
        report += `     🎯 קבוצות יעד: ${output.groupsTargeted?.length || 0}\n`;
        report += `     ✅ הצליחו: ${output.messagesSuccess || 0}\n`;
        report += `     ❌ נכשלו: ${output.messagesFailed || 0}\n`;
      });
      report += '\n';
    }

    // סיכום
    const endLog = sessionLogs.find(log => log.event === 'scheduled_task_end');
    if (endLog) {
      report += `📊 סיכום ביצועים:\n`;
      report += `   ⏱️ זמן ביצוע כולל: ${endLog.totalExecutionTimeMs}ms\n`;
      report += `   ✅ הצלחה: ${endLog.success ? 'כן' : 'לא'}\n`;
      report += `   🕐 הריצה הבאה: ${endLog.nextScheduledRun}\n`;
      if (endLog.summary) {
        report += `   🛠️ כלים בשימוש: ${endLog.summary.toolsUsed}\n`;
        report += `   🔍 פעולות נתונים: ${endLog.summary.dataOperationsExecuted}\n`;
        report += `   💬 הודעות נותחו: ${endLog.summary.messagesAnalyzed}\n`;
        report += `   🏠 קבוצות עובדו: ${endLog.summary.groupsProcessed?.length || 0}\n`;
        report += `   📤 פלטים נשלחו: ${endLog.summary.outputsSent}\n`;
      }
    }

    // שגיאות
    const errors = sessionLogs.filter(log => log.event === 'scheduled_task_error');
    if (errors.length > 0) {
      report += `\n❌ שגיאות (${errors.length}):\n`;
      errors.forEach((error, index) => {
        report += `  ${index + 1}. ${error.error.type}: ${error.error.message}\n`;
      });
    }

    return report;
  } catch (error) {
    schedulerLogger.error('Error generating scheduler report:', error);
    return null;
  }
}

/**
 * יצירת session ID לתזמונים
 */
function generateSchedulerSessionId(taskId) {
  return `sch_${taskId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

module.exports = {
  schedulerLogger,
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
  generateSchedulerReport,
  generateSchedulerSessionId,
  truncateSchedulerData
};