// Quick test של TaskExecutionService
const DatabaseManager = require('./src/database/DatabaseManager');
const ConversationHandler = require('./src/services/ConversationHandler');
const TaskExecutionService = require('./src/services/TaskExecutionService');

async function quickTest() {
  console.log('🔧 Quick test of TaskExecutionService...');
  
  try {
    const db = new DatabaseManager();
    await db.initialize();
    console.log('✅ Database OK');
    
    const conversationHandler = new ConversationHandler(db);
    await conversationHandler.initialize();
    console.log('✅ ConversationHandler OK');
    
    const mockBot = {
      sendMessageToGroup: async (groupName, message) => {
        console.log(`📤 MOCK SEND to ${groupName}: OK`);
        return true;
      }
    };
    
    const taskExecutionService = new TaskExecutionService(db, conversationHandler, mockBot);
    await taskExecutionService.initialize();
    console.log('✅ TaskExecutionService OK');
    
    // Test buildAIQuery
    const mockTask = {
      action_type: 'daily_summary',
      target_groups: ['test group'],
      custom_query: null
    };
    
    const query = taskExecutionService.buildAIQuery(mockTask);
    console.log('✅ buildAIQuery worked:', query.substring(0, 50) + '...');
    
    // Test buildExecutionContext
    const context = taskExecutionService.buildExecutionContext(mockTask, 'test-session');
    console.log('✅ buildExecutionContext worked:', JSON.stringify(context, null, 2));
    
    console.log('✅ All components work individually!');
    
  } catch (error) {
    console.error('❌ Quick test failed:', error.message);
    console.error(error.stack);
  }
}

quickTest().catch(console.error);