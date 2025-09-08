const SchedulerServiceFixed = require('./src/services/SchedulerServiceFixed');
const DatabaseManager = require('./src/database/DatabaseManager');
const TaskExecutionService = require('./src/services/TaskExecutionService');
const ConversationHandler = require('./src/services/ConversationHandler');

async function testFixedScheduler() {
  console.log('🧪 בדיקת הפתרון המתוקן לScheduler...\n');
  
  const db = new DatabaseManager();
  
  try {
    // Initialize database
    await db.initialize();
    console.log('✅ Database initialized');
    
    // Mock dependencies for testing
    const mockConversationHandler = {
      handleMessage: async (query, groupId, messageType, context) => {
        console.log(`🤖 MOCK AI: Processing query: "${query.substring(0, 50)}..."`);
        return {
          response: `Mock response for query about ${context?.taskName || 'unknown task'}`,
          success: true,
          tokensUsed: 500
        };
      }
    };
    
    const mockBot = {
      sendMessageToGroup: async (groupName, message) => {
        console.log(`📤 MOCK SEND to ${groupName}: ${message.substring(0, 100)}...`);
        return true;
      },
      socket: null
    };
    
    // Initialize TaskExecutionService
    const taskExecutionService = new TaskExecutionService(db, mockConversationHandler, mockBot);
    await taskExecutionService.initialize();
    console.log('✅ TaskExecutionService initialized');
    
    // Initialize Fixed Scheduler
    const scheduler = new SchedulerServiceFixed(mockBot, db, mockConversationHandler, taskExecutionService);
    await scheduler.initialize();
    console.log('✅ SchedulerServiceFixed initialized');
    
    console.log('\n📊 POLLING STATUS:');
    console.log('==========================================');
    const pollingStatus = scheduler.getPollingStatus();
    console.log(`Active: ${pollingStatus.isActive ? '✅' : '❌'}`);
    console.log(`Frequency: ${pollingStatus.pollingFrequency}`);
    console.log(`Active Tasks: ${pollingStatus.activeTasks}`);
    console.log(`Currently Executing: ${pollingStatus.currentlyExecuting}`);
    console.log(`Next Check In: ${pollingStatus.nextCheckIn}`);
    
    // Test scheduling logic
    console.log('\n🧠 בדיקת לוגיקת זמון:');
    console.log('==========================================');
    
    const currentTime = new Date();
    const testCases = [
      {
        name: 'יומי 16:00',
        cronExpression: '0 16 * * *',
        lastExecution: null
      },
      {
        name: 'יומי 22:30',
        cronExpression: '30 22 * * *',
        lastExecution: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
      },
      {
        name: 'יומי 23:25',
        cronExpression: '25 23 * * *',
        lastExecution: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
      }
    ];
    
    testCases.forEach(testCase => {
      const shouldExecute = scheduler.shouldTaskExecuteNow(
        testCase.cronExpression, 
        testCase.lastExecution, 
        currentTime
      );
      
      console.log(`${testCase.name}: ${shouldExecute ? '🔥 יתבצע עכשיו' : '⏭️ לא יתבצע'}`);
      console.log(`   Cron: ${testCase.cronExpression}`);
      console.log(`   Last: ${testCase.lastExecution || 'Never'}`);
      console.log(`   Current time: ${currentTime.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
    });
    
    // Test manual execution
    console.log('\n🔧 בדיקת ביצוע ידני:');
    console.log('==========================================');
    
    try {
      const tasks = await db.getScheduledTasks(true);
      if (tasks.length > 0) {
        const firstTask = tasks[0];
        console.log(`מנסה ביצוע ידני של משימה ${firstTask.id}: ${firstTask.name}`);
        
        const result = await scheduler.executeTaskManually(firstTask.id);
        console.log(`תוצאה: ${result.success ? '✅ Success' : '❌ Failed'}`);
        
        if (!result.success) {
          console.log(`שגיאה: ${result.error}`);
        }
      } else {
        console.log('❌ אין משימות פעילות לבדיקה');
      }
    } catch (error) {
      console.log('❌ שגיאה בביצוע ידני:', error.message);
    }
    
    console.log('\n⏰ מערכת תעמוד כ-30 שניות לבדיקת polling...');
    
    // Let it run for 30 seconds to test polling
    await new Promise(resolve => {
      setTimeout(() => {
        console.log('\n🛑 עוצר בדיקה...');
        scheduler.stopAll();
        resolve();
      }, 30000);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (db && db.db) {
      await db.db.close();
      console.log('\n📝 Database connection closed');
    }
  }
}

// Run the test
testFixedScheduler().catch(console.error);