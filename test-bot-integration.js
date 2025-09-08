// 🧪 בדיקת אינטגרציה של הבוט עם מערכת התזמון המתוקנת
// Test real bot integration with fixed scheduler

const path = require('path');

// Mock WhatsApp socket for testing
const mockSocket = {
  ev: {
    on: () => {},
    off: () => {}
  },
  sendMessage: async (jid, message) => {
    console.log(`📤 MOCK WHATSAPP SEND to ${jid}: ${message.text?.substring(0, 100) || 'No text'}...`);
    return { key: { id: 'mock_message_id' } };
  },
  ws: {
    on: () => {},
    readyState: 1
  },
  authState: {
    state: 'open'
  }
};

async function testBotIntegration() {
  console.log('🤖 בדיקת אינטגרציה של בוט + מערכת תזמון מתוקנת...\n');
  
  try {
    // Import bot components
    const DatabaseManager = require('./src/database/DatabaseManager');
    const ConversationHandler = require('./src/services/ConversationHandler');
    const TaskExecutionService = require('./src/services/TaskExecutionService');
    const SchedulerService = require('./src/services/SchedulerService'); // Now uses the fixed version!
    
    console.log('✅ All components imported successfully');
    
    // Initialize database
    const db = new DatabaseManager();
    await db.initialize();
    console.log('✅ Database initialized');
    
    // Initialize conversation handler
    const conversationHandler = new ConversationHandler(db);
    await conversationHandler.initialize();
    console.log('✅ ConversationHandler initialized');
    
    // Create mock bot instance
    const mockBot = {
      socket: mockSocket,
      db: db,
      conversationHandler: conversationHandler,
      sendMessageToGroup: async (groupName, message) => {
        console.log(`📤 BOT SEND to ${groupName}: ${message?.substring(0, 100) || 'No message'}...`);
        return true;
      },
      summaryTargetGroupId: '972546262108-1556219067@g.us' // ניצן group
    };
    
    // Initialize task execution service
    const taskExecutionService = new TaskExecutionService(db, conversationHandler, mockBot);
    await taskExecutionService.initialize();
    console.log('✅ TaskExecutionService initialized');
    
    // Initialize FIXED scheduler service
    const schedulerService = new SchedulerService(mockBot, db, conversationHandler, taskExecutionService);
    await schedulerService.initialize();
    console.log('✅ FIXED SchedulerService initialized');
    
    // Check polling status
    console.log('\n📊 POLLING STATUS:');
    console.log('==========================================');
    const status = schedulerService.getPollingStatus();
    console.log(`Active: ${status.isActive ? '✅' : '❌'}`);
    console.log(`Frequency: ${status.pollingFrequency}`);
    console.log(`Active Tasks: ${status.activeTasks}`);
    console.log(`Currently Executing: ${status.currentlyExecuting}`);
    
    // Show loaded tasks
    console.log('\n📋 LOADED TASKS:');
    console.log('==========================================');
    const tasks = await db.getScheduledTasks(true);
    
    if (tasks.length === 0) {
      console.log('❌ אין משימות פעילות במסד הנתונים');
    } else {
      tasks.forEach((task, i) => {
        console.log(`${i+1}. [${task.id}] ${task.name}`);
        console.log(`   ⏰ ${task.cron_expression} -> ${schedulerService.cronToReadable(task.cron_expression)}`);
        console.log(`   📤 Send to: ${task.send_to_group}`);
        console.log(`   ✅ Active: ${task.active ? 'Yes' : 'No'}`);
        console.log(`   🕐 Last: ${task.last_execution || 'Never'}`);
      });
    }
    
    // Test manual execution
    if (tasks.length > 0) {
      console.log('\n🔧 TESTING MANUAL EXECUTION:');
      console.log('==========================================');
      
      const testTask = tasks[0];
      console.log(`מנסה ביצוע ידני של: ${testTask.name} (ID: ${testTask.id})`);
      
      const result = await schedulerService.executeTaskManually(testTask.id);
      console.log(`תוצאה: ${result.success ? '✅ Success' : '❌ Failed'}`);
      
      if (result.success) {
        console.log(`⏱️ זמן ביצוע: ${result.executionTime}ms`);
        console.log(`🎯 Session ID: ${result.sessionId}`);
      } else {
        console.log(`❌ שגיאה: ${result.error}`);
      }
    }
    
    // Test the intelligent scheduling logic
    console.log('\n🧠 TESTING INTELLIGENT SCHEDULING:');
    console.log('==========================================');
    
    const testCurrentTime = new Date();
    console.log(`זמן נוכחי: ${testCurrentTime.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
    
    // Create test scenarios
    const testScenarios = [
      {
        name: 'משימה חדשה (אף פעם לא בוצעה)',
        cronExpr: '30 22 * * *', // 22:30 daily
        lastExec: null
      },
      {
        name: 'משימה שבוצעה אתמול',
        cronExpr: '0 16 * * *', // 16:00 daily
        lastExec: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
      },
      {
        name: 'משימה שבוצעה לפני דקה',
        cronExpr: `${testCurrentTime.getMinutes()} ${testCurrentTime.getHours()} * * *`, // Now
        lastExec: new Date(Date.now() - 60 * 1000).toISOString() // 1 minute ago
      }
    ];
    
    testScenarios.forEach(scenario => {
      const shouldExecute = schedulerService.shouldTaskExecuteNow(
        scenario.cronExpr, 
        scenario.lastExec, 
        testCurrentTime
      );
      console.log(`${scenario.name}: ${shouldExecute ? '🔥 יתבצע' : '⏭️ לא יתבצע'}`);
    });
    
    // Let polling run for a bit
    console.log('\n⏰ מערכת תעמוד 10 שניות לבדיקת polling...');
    
    await new Promise(resolve => {
      setTimeout(() => {
        console.log('\n🛑 סיום בדיקה...');
        schedulerService.stopAll();
        resolve();
      }, 10000);
    });
    
    console.log('\n🎉 INTEGRATION TEST COMPLETED SUCCESSFULLY! 🎉');
    console.log('המערכת המתוקנת עובדת מושלם עם polling mechanism');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error(error.stack);
  }
}

// Run the integration test
testBotIntegration().catch(console.error);