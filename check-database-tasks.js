const DatabaseManager = require('./src/database/DatabaseManager');

async function checkDatabaseTasks() {
    try {
        const db = new DatabaseManager();
        await db.initialize();
        
        console.log('🔍 בדיקת משימות במסד הנתונים:');
        console.log('=' .repeat(50));
        
        // קבלת כל המשימות
        const tasks = await db.allQuery(`
            SELECT 
              id, name, task_type, cron_expression, 
              target_groups, active, file_path,
              created_at, updated_at
            FROM web_tasks 
            ORDER BY created_at DESC
        `);
        
        console.log(`📊 נמצאו ${tasks.length} משימות במסד הנתונים:`);
        console.log();
        
        tasks.forEach((task, index) => {
            console.log(`${index + 1}. [ID: ${task.id}] ${task.name}`);
            console.log(`   🔄 סוג: ${task.task_type}`);
            console.log(`   ⏰ CRON: ${task.cron_expression || 'לא מוגדר'}`);
            console.log(`   🎯 קבוצות: ${task.target_groups || 'לא מוגדר'}`);
            console.log(`   🔘 פעיל: ${task.active ? 'כן' : 'לא'}`);
            console.log(`   📁 קובץ: ${task.file_path || 'לא מוגדר'}`);
            console.log(`   📅 נוצר: ${new Date(task.created_at).toLocaleString('he-IL')}`);
            console.log('   ' + '-'.repeat(40));
        });
        
        // בדיקה האם יש קשר בין קבצי התזמון למסד הנתונים
        console.log('🔗 בדיקת קישור לקבצי תזמון:');
        const scheduleFiles = ['daily-summaries.txt', 'web-task-38.txt'];
        
        for (const fileName of scheduleFiles) {
            const matchingTask = tasks.find(t => t.file_path && t.file_path.includes(fileName));
            if (matchingTask) {
                console.log(`✅ ${fileName} מחובר למשימה ID ${matchingTask.id}: ${matchingTask.name}`);
            } else {
                console.log(`❌ ${fileName} לא מחובר לשום משימה במסד הנתונים`);
            }
        }
        
        await db.close();
        
    } catch (error) {
        console.error('❌ שגיאה:', error);
    }
}

checkDatabaseTasks();