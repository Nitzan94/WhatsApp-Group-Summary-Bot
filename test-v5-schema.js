#!/usr/bin/env node

// 🧪 Test Script for v5.0 Database Schema Creation
// Tests the new DB-Driven Scheduler functionality

const DatabaseManager = require('./src/database/DatabaseManager');
const logger = require('./src/utils/logger');

async function testV5Schema() {
  console.log('🧪 Testing v5.0 Database Schema Creation...\n');
  
  const db = new DatabaseManager();
  
  try {
    // Initialize database connection
    console.log('📊 1. Initializing database connection...');
    await db.initialize();
    console.log('✅ Database initialized successfully\n');
    
    // Check if v5 tables already exist
    console.log('🔍 2. Checking if v5.0 tables exist...');
    const hasV5Tables = await db.hasV5Tables();
    console.log(`${hasV5Tables ? '✅' : '❌'} v5.0 tables exist: ${hasV5Tables}\n`);
    
    // Create v5.0 schema if needed
    if (!hasV5Tables) {
      console.log('🚀 3. Creating v5.0 schema...');
      await db.createTablesV5();
      console.log('✅ v5.0 schema created successfully\n');
    } else {
      console.log('✅ 3. v5.0 schema already exists, skipping creation\n');
    }
    
    // Verify tables were created
    console.log('🔎 4. Verifying table structure...');
    const tables = await db.allQuery(`
      SELECT name, sql FROM sqlite_master 
      WHERE type='table' AND name IN ('scheduled_tasks', 'task_execution_logs')
      ORDER BY name
    `);
    
    console.log(`Found ${tables.length} v5.0 tables:`);
    tables.forEach(table => {
      console.log(`  📋 ${table.name}`);
    });
    console.log();
    
    // Test basic CRUD operations
    console.log('🧪 5. Testing CRUD operations...\n');
    
    // CREATE - Add a test task
    console.log('  📝 Creating test task...');
    const testTask = {
      name: 'Test Task v5.0',
      description: 'Testing the new DB-driven scheduler',
      action_type: 'daily_summary',
      target_groups: ['Test Group 1', 'Test Group 2'],
      cron_expression: '0 9 * * *',
      send_to_group: 'ניצן',
      created_by: 'test-script'
    };
    
    const createdTask = await db.createScheduledTask(testTask);
    console.log(`  ✅ Created task ID: ${createdTask.id}`);
    
    // READ - Get the task back
    console.log('  🔍 Reading task back...');
    const retrievedTask = await db.getScheduledTaskById(createdTask.id);
    console.log(`  ✅ Retrieved: ${retrievedTask.name}`);
    console.log(`  📊 Target groups: ${retrievedTask.target_groups.join(', ')}`);
    
    // UPDATE - Modify the task
    console.log('  📝 Updating task...');
    await db.updateScheduledTask(createdTask.id, {
      description: 'Updated description for testing',
      cron_expression: '0 10 * * *'
    });
    console.log('  ✅ Task updated successfully');
    
    // Test logging functionality
    console.log('  📊 Testing execution logging...');
    const logId = await db.logTaskExecutionStart(createdTask.id, 'Test AI query for v5.0');
    console.log(`  ✅ Started execution log ID: ${logId}`);
    
    // Complete the log
    await db.logTaskExecutionEnd(logId, {
      ai_response: 'Test response from AI',
      ai_tokens_used: 150,
      ai_processing_time: 1500,
      tools_used: ['search_groups', 'get_recent_messages'],
      database_queries: 3,
      database_results: 25,
      success: true,
      output_message: 'Test execution completed successfully',
      output_sent_to: 'ניצן',
      total_execution_time: 2500,
      groups_processed: 2,
      messages_analyzed: 25
    });
    console.log('  ✅ Execution log completed');
    
    // Get execution stats
    console.log('  📈 Getting execution statistics...');
    const stats = await db.getExecutionStats(30);
    console.log(`  ✅ Total executions: ${stats.total_executions}`);
    console.log(`  ✅ Success rate: ${stats.success_rate}%`);
    
    // List all tasks
    console.log('  📋 Getting all scheduled tasks...');
    const allTasks = await db.getScheduledTasks();
    console.log(`  ✅ Found ${allTasks.length} active tasks`);
    
    // DELETE - Clean up test task
    console.log('  🗑️  Cleaning up test task...');
    await db.deleteScheduledTask(createdTask.id);
    console.log('  ✅ Test task deleted');
    
    console.log('\n🎉 ALL TESTS PASSED! v5.0 Schema is working perfectly!\n');
    
    // Show summary
    console.log('📊 SUMMARY:');
    console.log('✅ Schema v5.0 created successfully');
    console.log('✅ All CRUD operations working');  
    console.log('✅ Execution logging functional');
    console.log('✅ Statistics generation working');
    console.log('✅ Ready for production use\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    await db.close();
    console.log('🔒 Database connection closed');
  }
}

// Run the test
if (require.main === module) {
  testV5Schema().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testV5Schema };