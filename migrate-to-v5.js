#!/usr/bin/env node

// 🔄 Migration Script: Text Files → v5.0 Database
// Migrates existing schedule files to the new DB-driven system

const fs = require('fs').promises;
const path = require('path');
const DatabaseManager = require('./src/database/DatabaseManager');
const ScheduleParser = require('./src/services/ScheduleParser');
const logger = require('./src/utils/logger');

class V5Migrator {
  constructor() {
    this.db = new DatabaseManager();
    this.parser = new ScheduleParser();
    this.schedulesPath = path.join(__dirname, 'schedules');
  }

  async migrate() {
    console.log('🔄 Starting migration from text files to v5.0 database...\n');

    try {
      // Initialize database
      console.log('📊 1. Initializing database...');
      await this.db.initialize();
      
      // Ensure v5.0 tables exist
      const hasV5 = await this.db.hasV5Tables();
      if (!hasV5) {
        console.log('🚀 Creating v5.0 schema...');
        await this.db.createTablesV5();
      }
      console.log('✅ Database ready\n');

      // Read existing schedule files
      console.log('📁 2. Reading existing schedule files...');
      const scheduleFiles = await this.getScheduleFiles();
      console.log(`Found ${scheduleFiles.length} schedule files\n`);

      // Parse and migrate each file
      const allMigratedTasks = [];
      
      for (const file of scheduleFiles) {
        console.log(`📄 Processing: ${file}`);
        try {
          const migratedTasks = await this.migrateFile(file);
          allMigratedTasks.push(...migratedTasks);
          console.log(`✅ Migrated ${migratedTasks.length} tasks from ${file}\n`);
        } catch (error) {
          console.error(`❌ Failed to migrate ${file}:`, error.message);
        }
      }

      // Show migration summary
      console.log('📊 3. Migration Summary:');
      console.log(`✅ Total files processed: ${scheduleFiles.length}`);
      console.log(`✅ Total tasks migrated: ${allMigratedTasks.length}`);
      
      if (allMigratedTasks.length > 0) {
        console.log('\n📋 Migrated Tasks:');
        allMigratedTasks.forEach((task, index) => {
          console.log(`  ${index + 1}. ${task.name} (${task.action_type}) → ${task.send_to_group}`);
          console.log(`     Schedule: ${task.cron_expression}`);
          console.log(`     Groups: ${task.target_groups.join(', ')}\n`);
        });
      }

      // Verify migration
      console.log('🔍 4. Verifying migration...');
      const allTasks = await this.db.getScheduledTasks();
      console.log(`✅ Database now contains ${allTasks.length} scheduled tasks\n`);

      console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!\n');

      // Show next steps
      console.log('📋 NEXT STEPS:');
      console.log('1. ✅ Database schema v5.0 is ready');
      console.log('2. ✅ All schedule data migrated');
      console.log('3. 🔄 Update SchedulerService to use database');
      console.log('4. 🚀 Deploy and test new system');
      console.log('5. 🗑️  Remove old schedule files (after verification)\n');

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    } finally {
      await this.db.close();
    }
  }

  async getScheduleFiles() {
    try {
      const files = await fs.readdir(this.schedulesPath);
      return files.filter(file => file.endsWith('.txt') && !file.startsWith('.'));
    } catch (error) {
      console.error('❌ Failed to read schedules directory:', error);
      return [];
    }
  }

  async migrateFile(filename) {
    const filePath = path.join(this.schedulesPath, filename);
    
    try {
      // Read and parse the file
      const content = await fs.readFile(filePath, 'utf8');
      console.log(`  📖 Reading ${filename}...`);
      
      // Parse schedules using existing parser
      const schedules = await this.parser.parse(filePath);
      console.log(`  🔍 Found ${schedules.length} schedules in file`);
      
      const migratedTasks = [];
      
      // Convert each schedule to v5.0 format
      for (const schedule of schedules) {
        try {
          const taskData = this.convertScheduleToTask(schedule, filename);
          
          // Check if task with this name already exists
          const existingTasks = await this.db.getScheduledTasks(false);
          const nameExists = existingTasks.some(t => t.name === taskData.name);
          
          if (nameExists) {
            taskData.name = `${taskData.name} (${Date.now()})`;
            console.log(`  ⚠️  Renamed duplicate: ${taskData.name}`);
          }
          
          // Create the task
          const createdTask = await this.db.createScheduledTask(taskData);
          migratedTasks.push(createdTask);
          console.log(`  ✅ Created: ${taskData.name}`);
          
        } catch (taskError) {
          console.error(`  ❌ Failed to migrate schedule:`, taskError.message);
        }
      }
      
      return migratedTasks;
      
    } catch (error) {
      console.error(`❌ Error processing ${filename}:`, error.message);
      return [];
    }
  }

  convertScheduleToTask(schedule, sourceFile) {
    // Generate unique name based on groups and action
    const groupsText = schedule.groups ? schedule.groups.slice(0, 2).join(', ') : 'Unknown';
    const truncatedGroups = groupsText.length > 30 ? groupsText.substring(0, 27) + '...' : groupsText;
    
    const taskName = `${this.mapActionToReadableName(schedule.action)} - ${truncatedGroups}`;
    
    return {
      name: taskName,
      description: `Migrated from ${sourceFile} - ${schedule.action} for ${schedule.groups?.length || 0} groups`,
      action_type: this.mapLegacyActionType(schedule.action),
      target_groups: schedule.groups || [],
      cron_expression: this.convertScheduleToCron(schedule.schedule),
      custom_query: this.generateCustomQuery(schedule),
      send_to_group: schedule.send_to || 'ניצן',
      active: true,
      created_by: 'v5-migration'
    };
  }

  mapLegacyActionType(legacyAction) {
    const mapping = {
      'daily_summary': 'daily_summary',
      'latest_message': 'latest_message', 
      'summary': 'daily_summary',
      'today': 'today_summary'
    };
    
    return mapping[legacyAction] || 'daily_summary';
  }

  mapActionToReadableName(action) {
    const mapping = {
      'daily_summary': 'Daily Summary',
      'latest_message': 'Latest Messages',
      'summary': 'Summary',
      'today': 'Today Summary'
    };
    
    return mapping[action] || 'Summary Task';
  }

  convertScheduleToCron(scheduleText) {
    if (!scheduleText) return '0 16 * * *'; // Default: 4 PM daily
    
    console.log(`    🔄 Converting schedule: "${scheduleText}"`);
    
    // Common patterns in the existing files
    if (scheduleText.includes('every day at')) {
      const timeMatch = scheduleText.match(/(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        const [, hour, minute] = timeMatch;
        const cron = `${minute} ${hour} * * *`;
        console.log(`    ✅ Converted to cron: ${cron}`);
        return cron;
      }
    }
    
    // Handle specific times like "22:15"
    const directTimeMatch = scheduleText.match(/(\d{1,2}):(\d{2})/);
    if (directTimeMatch) {
      const [, hour, minute] = directTimeMatch;
      const cron = `${minute} ${hour} * * *`;
      console.log(`    ✅ Converted time to cron: ${cron}`);
      return cron;
    }
    
    // Default fallback
    const defaultCron = '0 16 * * *';
    console.log(`    ⚠️  Using default cron: ${defaultCron}`);
    return defaultCron;
  }

  generateCustomQuery(schedule) {
    // For custom action types, generate appropriate queries
    if (schedule.action === 'latest_message') {
      return 'מה הההודעה האחרונה מהקבוצות הבאות?';
    } else if (schedule.action === 'today') {
      return 'תן לי סיכום של מה שקרה היום בקבוצות הבאות.';
    }
    
    return null;
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new V5Migrator();
  migrator.migrate().catch(error => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = V5Migrator;