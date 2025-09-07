#!/usr/bin/env node
/**
 * Summary Service Test Script
 * Tests OpenRouter API integration
 */

const SummaryService = require('./src/services/SummaryService');
const DatabaseManager = require('./src/database/DatabaseManager');
const logger = require('./src/utils/logger');

async function testSummaryService() {
  const summaryService = new SummaryService();
  const db = new DatabaseManager();
  
  try {
    logger.info('🧪 מתחיל בדיקת SummaryService...');
    
    // Test 1: API Connection Test
    logger.info('🔹 בדיקה 1: חיבור ל-API');
    const connectionTest = await summaryService.testConnection();
    
    if (connectionTest.success) {
      logger.info(`✅ חיבור לAPI תקין: "${connectionTest.message}"`);
    } else {
      logger.error(`❌ בעיה בחיבור לAPI: ${connectionTest.error}`);
      return; // Stop if API is not working
    }
    
    // Test 2: Generate Summary from Sample Data
    logger.info('🔹 בדיקה 2: יצירת סיכום מדגימת נתונים');
    
    const sampleMessages = [
      {
        messageId: 'msg_001',
        groupId: '120363sample@g.us',
        senderId: '972501234567@s.whatsapp.net',
        senderName: 'אליס',
        content: 'שלום לכולם! אני רוצה לארגן מסיבת יום הולדת לדן',
        messageType: 'conversation',
        timestamp: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
      },
      {
        messageId: 'msg_002',
        groupId: '120363sample@g.us',
        senderId: '972507654321@s.whatsapp.net',
        senderName: 'בוב',
        content: 'רעיון מעולה! איך אתם חושבים על יום שישי הבא?',
        messageType: 'conversation',
        timestamp: new Date(Date.now() - 3300000).toISOString() // 55 minutes ago
      },
      {
        messageId: 'msg_003',
        groupId: '120363sample@g.us',
        senderId: '972509876543@s.whatsapp.net',
        senderName: 'דנה',
        content: 'בטח! אני יכולה לעזור עם העוגה 🎂',
        messageType: 'conversation',
        timestamp: new Date(Date.now() - 3000000).toISOString() // 50 minutes ago
      },
      {
        messageId: 'msg_004',
        groupId: '120363sample@g.us',
        senderId: '972501234567@s.whatsapp.net',
        senderName: 'אליס',
        content: 'מושלם! נפגש אצלי בשעה 7 בערב',
        messageType: 'conversation',
        timestamp: new Date(Date.now() - 2700000).toISOString() // 45 minutes ago
      },
      {
        messageId: 'msg_005',
        groupId: '120363sample@g.us',
        senderId: '972507654321@s.whatsapp.net',
        senderName: 'בוב',
        content: 'אני אביא שתייה קלה למסיבה',
        messageType: 'conversation',
        timestamp: new Date(Date.now() - 2400000).toISOString() // 40 minutes ago
      }
    ];
    
    const summaryResult = await summaryService.generateSummary(
      sampleMessages, 
      'קבוצת החברים'
    );
    
    if (summaryResult.success) {
      logger.info('✅ סיכום נוצר בהצלחה!');
      logger.info('📄 הסיכום:');
      console.log('\n' + '='.repeat(60));
      console.log(summaryResult.summary);
      console.log('='.repeat(60) + '\n');
      
      logger.info(`📊 מטא-נתונים:`);
      logger.info(`  • מספר הודעות: ${summaryResult.metadata.messagesCount}`);
      logger.info(`  • מודל: ${summaryResult.metadata.model}`);
      logger.info(`  • טוקנים: ${summaryResult.metadata.tokensUsed}`);
      logger.info(`  • זמן: ${summaryResult.metadata.duration}ms`);
      
      // Test 3: Format for WhatsApp
      logger.info('🔹 בדיקה 3: עיצוב לWhatsApp');
      const formattedSummary = summaryService.formatSummaryForWhatsApp(
        summaryResult.summary,
        'קבוצת החברים',
        summaryResult.metadata
      );
      
      logger.info('✅ סיכום מעוצב לWhatsApp:');
      console.log('\n' + '-'.repeat(40));
      console.log(formattedSummary);
      console.log('-'.repeat(40) + '\n');
      
    } else {
      logger.error(`❌ שגיאה ביצירת סיכום: ${summaryResult.error}`);
      if (summaryResult.details) {
        logger.error(`   פרטים: ${summaryResult.details}`);
      }
    }
    
    // Test 4: Save to Database
    if (summaryResult.success) {
      logger.info('🔹 בדיקה 4: שמירה במסד נתונים');
      
      await db.initialize();
      
      // Create sample group first
      await db.upsertGroup('120363sample@g.us', 'קבוצת החברים');
      
      const summaryData = {
        groupId: '120363sample@g.us',
        summaryText: summaryResult.summary,
        messagesCount: sampleMessages.length,
        startTime: sampleMessages[0].timestamp,
        endTime: sampleMessages[sampleMessages.length - 1].timestamp,
        modelUsed: summaryResult.metadata.model,
        tokensUsed: summaryResult.metadata.tokensUsed
      };
      
      const summaryId = await db.saveSummary(summaryData);
      logger.info(`✅ סיכום נשמר במסד נתונים (ID: ${summaryId})`);
      
      // Test reading it back
      const savedSummary = await db.getLatestSummary('120363sample@g.us');
      if (savedSummary) {
        logger.info('✅ סיכום נקרא חזרה מהמסד בהצלחה');
      }
      
      await db.close();
    }
    
    logger.info('✅ כל הבדיקות הסתיימו בהצלחה!');
    
  } catch (error) {
    logger.error('❌ בדיקת SummaryService נכשלה:', error);
  }
}

// Run test if called directly
if (require.main === module) {
  testSummaryService();
}

module.exports = testSummaryService;