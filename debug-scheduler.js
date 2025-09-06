const SchedulerService = require('./src/services/SchedulerService');
const DatabaseManager = require('./src/database/DatabaseManager');

async function debugScheduler() {
    try {
        console.log('🔍 בדיקת מערכת תזמונים...');
        
        // אתחול DB
        const db = new DatabaseManager();
        await db.initialize();
        
        // יצירת SchedulerService (בלי bot)
        const scheduler = new SchedulerService(null, db, null);
        
        console.log('📄 טוען קבצי תזמון...');
        await scheduler.loadSchedulesFromFiles();
        
        console.log(`📊 נטענו ${scheduler.schedules.length} תזמונים:`);
        
        scheduler.schedules.forEach((schedule, index) => {
            console.log(`${index + 1}. ${schedule.name}`);
            console.log(`   📅 CRON: ${schedule.cronExpression}`);
            console.log(`   🎯 קבוצות: ${schedule.groups.join(', ')}`);
            console.log(`   ⚙️ פעולה: ${schedule.action}`);
            console.log(`   📤 שלח ל: ${schedule.sendTo}`);
            console.log(`   📁 קובץ: ${schedule.filePath || 'לא ידוע'}`);
            console.log('   ---');
        });
        
        await db.close();
        
    } catch (error) {
        console.error('❌ שגיאה:', error);
    }
}

debugScheduler();