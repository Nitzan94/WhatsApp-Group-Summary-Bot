const DatabaseManager = require('./src/database/DatabaseManager');
const SchedulerService = require('./src/services/SchedulerService');
const cron = require('node-cron');

async function debugScheduledTasks() {
  const db = new DatabaseManager();
  
  try {
    // Initialize database connection
    await db.initialize();
    console.log('✅ Database initialized successfully');
    
    // Check if v5.0 tables exist
    console.log('\n🔍 CHECKING v5.0 TABLES:');
    console.log('==========================================');
    
    // Check scheduled_tasks table
    try {
      const tasksResult = await db.allQuery('SELECT COUNT(*) as count FROM scheduled_tasks');
      console.log(`✅ scheduled_tasks table exists with ${tasksResult[0].count} tasks`);
    } catch (error) {
      console.log('❌ scheduled_tasks table does not exist');
      console.log('Error:', error.message);
    }
    
    // Check task_execution_logs table
    try {
      const logsResult = await db.allQuery('SELECT COUNT(*) as count FROM task_execution_logs');
      console.log(`✅ task_execution_logs table exists with ${logsResult[0].count} logs`);
    } catch (error) {
      console.log('❌ task_execution_logs table does not exist');
      console.log('Error:', error.message);
    }
    
    // Get all scheduled tasks if table exists
    console.log('\n📋 SCHEDULED TASKS:');
    console.log('==========================================');
    try {
      const tasks = await db.getScheduledTasks(false); // Get all tasks, active and inactive
      
      if (tasks.length === 0) {
        console.log('📝 No scheduled tasks found');
      } else {
        console.log(`📊 Found ${tasks.length} scheduled tasks:`);
        
        tasks.forEach((task, i) => {
          console.log(`\n${i+1}. Task ID: ${task.id}`);
          console.log(`   Name: ${task.name}`);
          console.log(`   Description: ${task.description || 'No description'}`);
          console.log(`   Action Type: ${task.action_type}`);
          console.log(`   Target Groups: ${task.target_groups}`);
          console.log(`   Cron Expression: ${task.cron_expression}`);
          console.log(`   Send To Group: ${task.send_to_group}`);
          console.log(`   Active: ${task.active ? '✅' : '❌'}`);
          console.log(`   Created: ${task.created_at}`);
          console.log(`   Last Execution: ${task.last_execution || 'Never'}`);
          console.log(`   Next Execution: ${task.next_execution || 'Not calculated'}`);
          
          // Validate cron expression
          const isValid = cron.validate(task.cron_expression);
          console.log(`   Cron Valid: ${isValid ? '✅' : '❌'}`);
          
          if (isValid) {
            try {
              // Try to get next run time
              const job = cron.schedule(task.cron_expression, () => {}, { scheduled: false });
              console.log(`   Next Run: ${job.getNextDate?.()?.toISOString() || 'Cannot calculate'}`);
            } catch (cronError) {
              console.log(`   Next Run: Error - ${cronError.message}`);
            }
          }
        });
      }
    } catch (error) {
      console.log('❌ Failed to get scheduled tasks:', error.message);
    }
    
    // Test SchedulerService initialization
    console.log('\n🚀 TESTING SCHEDULER SERVICE:');
    console.log('==========================================');
    
    try {
      // Create a mock bot and conversation handler for testing
      const mockBot = {
        db: db,
        conversationHandler: null,
        taskExecutionService: null
      };
      
      const scheduler = new SchedulerService(mockBot, db, null, null);
      
      // Test timezone
      console.log(`System timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
      console.log(`Current Jerusalem time: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
      console.log(`Current system time: ${new Date().toISOString()}`);
      
      // Test cron validation
      console.log('\n⏰ TESTING CRON VALIDATIONS:');
      const testCronExpressions = [
        '0 16 * * *',  // Daily at 16:00
        '30 22 * * *', // Daily at 22:30
        '49 18 * * *', // Daily at 18:49
        '40 21 * * *', // Daily at 21:40
        '25 23 * * *'  // Daily at 23:25
      ];
      
      testCronExpressions.forEach(cronExpr => {
        const isValid = cron.validate(cronExpr);
        console.log(`   ${cronExpr}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
        
        if (isValid) {
          try {
            const job = cron.schedule(cronExpr, () => {}, { 
              scheduled: false,
              timezone: 'Asia/Jerusalem' 
            });
            console.log(`      Next run: ${job.getNextDate?.()?.toISOString() || 'Cannot calculate'}`);
          } catch (error) {
            console.log(`      Error: ${error.message}`);
          }
        }
      });
      
    } catch (error) {
      console.log('❌ SchedulerService test failed:', error.message);
    }
    
    // Test current active jobs (this would require full bot instance)
    console.log('\n🎯 CURRENT STATUS:');
    console.log('==========================================');
    console.log('This debug script shows the database state and cron validation.');
    console.log('To see if cron jobs are actually running, the full bot needs to be started.');
    console.log('The issue seems to be that cron callbacks are not executing even though jobs are created.');
    
  } catch (error) {
    console.error('❌ Debug script failed:', error);
  } finally {
    // Close database connection
    if (db && db.db) {
      await db.db.close();
      console.log('\n📝 Database connection closed');
    }
  }
}

// Run the debug
debugScheduledTasks().catch(console.error);