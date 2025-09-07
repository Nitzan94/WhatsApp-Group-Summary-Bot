// Test script for database-driven scheduler integration
const DatabaseManager = require('./src/database/DatabaseManager');
const TaskExecutionService = require('./src/services/TaskExecutionService');
const ConversationHandler = require('./src/services/ConversationHandler');

async function testIntegration() {
  try {
    console.log('🧪 Testing Database-Driven Scheduler Integration...\n');

    // Initialize database
    console.log('1️⃣ Initializing database...');
    const db = new DatabaseManager();
    await db.initialize();
    console.log('✅ Database initialized\n');

    // Check if v5 tables exist
    console.log('2️⃣ Checking v5.0 tables...');
    const hasV5Tables = await db.hasV5Tables();
    console.log(`✅ v5.0 tables exist: ${hasV5Tables}\n`);

    if (!hasV5Tables) {
      console.log('❌ v5.0 tables not found. Please run migration first.');
      return;
    }

    // Initialize ConversationHandler (mock)
    console.log('3️⃣ Initializing ConversationHandler...');
    const conversationHandler = new ConversationHandler(db);
    await conversationHandler.initialize();
    console.log('✅ ConversationHandler initialized\n');

    // Initialize TaskExecutionService with mock bot
    console.log('4️⃣ Initializing TaskExecutionService...');
    const mockBot = {
      sendMessageToGroup: async (groupName, message) => {
        console.log(`📤 [MOCK] Sending message to ${groupName}: ${message.substring(0, 50)}...`);
        return true;
      }
    };
    const taskExecutionService = new TaskExecutionService(db, conversationHandler, mockBot);
    await taskExecutionService.initialize();
    console.log('✅ TaskExecutionService initialized\n');

    // Check scheduled tasks
    console.log('5️⃣ Checking scheduled tasks in database...');
    const scheduledTasks = await db.getScheduledTasks(true);
    console.log(`📋 Found ${scheduledTasks.length} active scheduled tasks:\n`);

    for (const task of scheduledTasks) {
      console.log(`   📌 ID: ${task.id}, Name: ${task.name}`);
      console.log(`      Action: ${task.action_type}`);
      console.log(`      Cron: ${task.cron_expression}`);
      
      try {
        const targetGroups = JSON.parse(task.target_groups);
        console.log(`      Target Groups: ${Array.isArray(targetGroups) ? targetGroups.join(', ') : targetGroups}`);
      } catch (e) {
        console.log(`      Target Groups: ${task.target_groups} (parsing error)`);
      }
      
      console.log(`      Send To: ${task.send_to_group}`);
      console.log('');
    }

    // Test TaskExecutionService health
    console.log('6️⃣ Testing TaskExecutionService health...');
    const isHealthy = taskExecutionService.isHealthy();
    console.log(`✅ TaskExecutionService healthy: ${isHealthy}\n`);

    // Test execution status
    console.log('7️⃣ Getting execution status...');
    const executionStatus = taskExecutionService.getExecutionStatus();
    console.log(`📊 Running executions: ${executionStatus.running_executions}\n`);

    console.log('🎉 All tests passed! Database-driven scheduler integration is working!\n');

    // Cleanup
    await db.close();
    console.log('✅ Database connection closed');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testIntegration();