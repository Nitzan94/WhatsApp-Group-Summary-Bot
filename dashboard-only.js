// Dashboard Only Mode - No WhatsApp Connection
const express = require('express');
const path = require('path');
const DatabaseManager = require('./src/database/DatabaseManager');
const ConfigService = require('./src/services/ConfigService');
const WebServer = require('./src/web/WebServer');
const SchedulerService = require('./src/services/SchedulerService');
const TaskExecutionService = require('./src/services/TaskExecutionService');
const logger = require('./src/utils/logger');

async function startDashboardOnly() {
  try {
    console.log('🚀 Starting Dashboard Only Mode...');
    logger.info('🚀 Starting Dashboard Only Mode');
    
    // Initialize database
    const db = new DatabaseManager();
    await db.initialize();
    logger.info('📊 Database initialized');
    
    // Initialize TaskExecutionService
    const taskExecutionService = new TaskExecutionService(null, db);
    logger.info('🚀 TaskExecutionService initialized');
    
    // Initialize SchedulerService 
    const schedulerService = new SchedulerService(null, db, null, taskExecutionService);
    await schedulerService.initialize();
    logger.info('⏰ Scheduler initialized');
    
    // Initialize ConfigService
    const configService = new ConfigService(null, db);
    logger.info('⚙️ ConfigService initialized');
    
    // Create mock bot object for WebServer
    const mockBot = {
      isConnected: false,
      socket: null
    };
    
    // Initialize WebServer
    const webServer = new WebServer(mockBot, db, configService);
    const webInfo = await webServer.start();
    
    logger.info(`✅ Dashboard running at ${webInfo.url}`);
    logger.info('📊 All services active (without WhatsApp)');
    
    // Keep process alive
    process.on('SIGINT', () => {
      logger.info('Shutting down dashboard...');
      schedulerService.stopAll();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start dashboard:', error);
    process.exit(1);
  }
}

startDashboardOnly();