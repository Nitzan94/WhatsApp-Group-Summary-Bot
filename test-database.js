#!/usr/bin/env node
/**
 * Database Test Script
 * Run this to test database functionality
 */

const DatabaseManager = require('./src/database/DatabaseManager');
const logger = require('./src/utils/logger');

async function testDatabase() {
  const db = new DatabaseManager();
  
  try {
    logger.info('🧪 מתחיל בדיקת מסד נתונים...');
    
    // Initialize database
    await db.initialize();
    
    // Test 1: Add a test group
    logger.info('🔹 בדיקה 1: הוספת קבוצה');
    await db.upsertGroup('120363123456789@g.us', 'קבוצת בדיקה');
    
    // Test 2: Add test messages
    logger.info('🔹 בדיקה 2: הוספת הודעות');
    const testMessages = [
      {
        messageId: 'msg_001',
        groupId: '120363123456789@g.us',
        senderId: '972501234567@s.whatsapp.net',
        senderName: 'אליס',
        content: 'שלום לכולם!',
        messageType: 'conversation',
        timestamp: new Date().toISOString()
      },
      {
        messageId: 'msg_002',
        groupId: '120363123456789@g.us',
        senderId: '972507654321@s.whatsapp.net',
        senderName: 'בוב',
        content: 'מה שלומכם?',
        messageType: 'conversation',
        timestamp: new Date().toISOString()
      }
    ];
    
    for (const msg of testMessages) {
      await db.saveMessage(msg);
    }
    
    // Test 3: Read messages
    logger.info('🔹 בדיקה 3: קריאת הודעות');
    const messages = await db.getNewMessages('120363123456789@g.us');
    logger.info(`📊 נמצאו ${messages.length} הודעות`);
    
    // Test 4: Get message count
    logger.info('🔹 בדיקה 4: ספירת הודעות');
    const count = await db.getMessageCount('120363123456789@g.us');
    logger.info(`🔢 סך כל ההודעות: ${count}`);
    
    // Test 5: Get groups
    logger.info('🔹 בדיקה 5: רשימת קבוצות');
    const groups = await db.getActiveGroups();
    logger.info(`📋 קבוצות פעילות: ${groups.length}`);
    groups.forEach(group => {
      logger.info(`  📌 ${group.name} (${group.id})`);
    });
    
    // Test 6: Database info
    logger.info('🔹 בדיקה 6: מידע על המסד');
    const dbInfo = await db.getDatabaseInfo();
    if (dbInfo) {
      logger.info(`📊 גודל מסד נתונים: ${dbInfo.sizeFormatted}`);
      logger.info(`🗂️  מספר טבלאות: ${dbInfo.tables}`);
    }
    
    logger.info('✅ כל הבדיקות הצליחו!');
    
  } catch (error) {
    logger.error('❌ בדיקת המסד נכשלה:', error);
  } finally {
    await db.close();
  }
}

// Run test if called directly
if (require.main === module) {
  testDatabase();
}

module.exports = testDatabase;