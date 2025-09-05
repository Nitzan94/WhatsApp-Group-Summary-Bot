#!/usr/bin/env node

/**
 * בדיקת מערכת הלוגים החדשה
 * מדמה בקשת משתמש ותזמון לבדיקת הלוגים
 */

const {
  logRequestStart,
  logProcessingStep,
  logDataRead,
  logToolUsage,
  logAIInteraction,
  logResponse,
  logRequestEnd,
  logInsights,
  generateRequestReport,
  generateSessionId: generateRequestSessionId
} = require('./src/utils/requestLogger');

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
  generateSchedulerReport,
  generateSchedulerSessionId
} = require('./src/utils/schedulerLogger');

console.log('🧪 מתחיל בדיקת מערכת הלוגים החדשה...');

// בדיקת לוג בקשת משתמש
async function testUserRequestLogging() {
  console.log('\n📋 בודק לוג בקשות משתמש...');
  
  const sessionId = generateRequestSessionId();
  
  // דמיון בקשת משתמש
  logRequestStart(sessionId, {
    userId: '972546262108@s.whatsapp.net',
    userName: 'ניצן',
    groupId: '120363417758222119@g.us',
    groupName: 'Nitzan bot',
    messageId: 'test_123',
    question: 'מה היה היום בקבוצת AI?'
  });
  
  logProcessingStep(sessionId, 'initialization', {
    userType: 'user',
    forceGroupQuery: false
  });
  
  logDataRead(sessionId, 'group_lookup', 'SELECT * FROM groups WHERE name LIKE ?', [
    { id: '120363272743443472@g.us', name: 'AI TIPS & TRICKS' },
    { id: '120363165018257961@g.us', name: 'AI-ACADEMY BY GUY AGA' }
  ]);
  
  logToolUsage(sessionId, 'search_groups', { groupName: 'AI' }, [
    { id: 1, name: 'AI TIPS & TRICKS' },
    { id: 2, name: 'AI-ACADEMY' }
  ], 150);
  
  logAIInteraction(sessionId, 'מה היה היום בקבוצת AI?', 'הייתה פעילות גבוהה היום עם דיונים על GPT-4 ו...', [
    { function: { name: 'get_recent_messages', arguments: '{"groupId": "123", "hours": 24}' }}
  ], 3200);
  
  logResponse(sessionId, 'הייתה פעילות גבוהה היום בקבוצת AI עם דיונים על:', true, null);
  
  logRequestEnd(sessionId, 5500, true, {
    toolsUsed: 2,
    dataQueriesExecuted: 3,
    messagesAnalyzed: 45,
    groupsAccessed: ['120363272743443472@g.us'],
    aiInteractions: 1
  });
  
  logInsights(sessionId, {
    topicsDiscussed: ['GPT-4', 'AI Tools', 'Machine Learning'],
    timeRangeAnalyzed: '24 hours',
    mostActiveUsers: ['User1', 'User2'],
    keyFindings: ['High activity', 'AI discussion trending'],
    dataSourcesUsed: ['messages', 'groups']
  });
  
  console.log(`✅ בדיקת בקשת משתמש הושלמה - Session: ${sessionId}`);
  
  // יצירת דוח
  const report = await generateRequestReport(sessionId);
  if (report) {
    console.log('\n📊 דוח מדגם:');
    console.log(report.substring(0, 500) + '...');
  }
  
  return sessionId;
}

// בדיקת לוג תזמונים
async function testSchedulerLogging() {
  console.log('\n⏰ בודק לוג תזמונים...');
  
  const taskId = 'daily_summary_test';
  const sessionId = generateSchedulerSessionId(taskId);
  
  // דמיון תזמון
  logScheduledTaskStart(sessionId, {
    id: taskId,
    name: 'בדיקת סיכום יומי',
    task_type: 'scheduled',
    description: 'סיכום יומי לקבוצות העיקריות',
    schedule_expression: '0 16 * * *',
    next_run: new Date().toISOString(),
    target_groups: ['AI TIPS & TRICKS', 'Nitzan bot']
  });
  
  logScheduledTaskStep(sessionId, taskId, 'processing_groups', {
    groupCount: 2,
    groups: ['AI TIPS & TRICKS', 'Nitzan bot']
  });
  
  logScheduledDataOperation(sessionId, taskId, 'get_daily_messages', 
    'SELECT * FROM messages WHERE timestamp > datetime("now", "-1 day")',
    Array(25).fill().map((_, i) => ({ id: i, content: `Message ${i}` }))
  );
  
  logScheduledToolUsage(sessionId, taskId, 'get_recent_messages', 
    { groupId: '120363272743443472@g.us', hours: 24 },
    Array(15).fill().map((_, i) => ({ id: i, sender: `User${i}` })),
    850
  );
  
  logScheduledAIInteraction(sessionId, taskId, 'תסכם מה היה היום בקבוצות',
    'סיכום: היום היה יום פעיל עם דיונים על...', [], 4200);
  
  logScheduledOutput(sessionId, taskId, ['120363417758222119@g.us'], {
    attempted: 1,
    successful: 1,
    failed: 0
  }, true, []);
  
  logScheduledTaskEnd(sessionId, taskId, 8500, true, {
    toolsUsed: 3,
    dataOperationsExecuted: 2,
    messagesAnalyzed: 40,
    groupsProcessed: ['AI TIPS & TRICKS', 'Nitzan bot'],
    aiInteractions: 1,
    outputsSent: 1
  }, new Date(Date.now() + 24*60*60*1000).toISOString());
  
  logScheduledInsights(sessionId, taskId, {
    executionPattern: 'daily_16:00',
    averageExecutionTime: 7500,
    successRate: 0.95,
    mostActiveGroups: ['AI TIPS & TRICKS'],
    commonTopics: ['AI', 'Technology', 'Learning'],
    dataSourcesUsed: ['messages', 'groups'],
    performanceMetrics: {
      avgResponseTime: 3200,
      memoryUsage: '45MB'
    }
  });
  
  console.log(`✅ בדיקת תזמון הושלמה - Session: ${sessionId}`);
  
  // יצירת דוח
  const report = await generateSchedulerReport(sessionId);
  if (report) {
    console.log('\n📊 דוח תזמון מדגם:');
    console.log(report.substring(0, 500) + '...');
  }
  
  return sessionId;
}

// הרצת הבדיקות
async function runTests() {
  try {
    const requestSessionId = await testUserRequestLogging();
    const schedulerSessionId = await testSchedulerLogging();
    
    console.log('\n🎉 כל הבדיקות הושלמו בהצלחה!');
    console.log(`📋 בקשת משתמש: ${requestSessionId}`);
    console.log(`⏰ תזמון: ${schedulerSessionId}`);
    
    // בדיקת קבצי לוג
    const fs = require('fs');
    console.log('\n📁 קבצי לוג שנוצרו:');
    
    const logFiles = [
      './logs/user-requests.log',
      './logs/scheduler-activity.log'
    ];
    
    for (const file of logFiles) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        console.log(`✅ ${file} - ${Math.round(stats.size / 1024)}KB`);
      } else {
        console.log(`❌ ${file} - קובץ לא קיים`);
      }
    }
    
  } catch (error) {
    console.error('❌ שגיאה בבדיקות:', error);
  }
}

// הרצה
runTests();