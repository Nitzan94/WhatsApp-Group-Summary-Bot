const sqlite3 = require('sqlite3').verbose();
const util = require('util');

const db = new sqlite3.Database('./data/messages.db');
const dbRun = util.promisify(db.run.bind(db));
const dbAll = util.promisify(db.all.bind(db));

async function cleanDuplicates() {
  console.log('🧹 ניקוי כפילויות במסד הנתונים...\n');

  try {
    // First, let's see what we have
    const before = await dbAll(`
      SELECT id, name, created_at, file_path 
      FROM web_tasks 
      ORDER BY name, created_at
    `);

    console.log('📊 לפני הניקוי:');
    console.table(before);

    // Clean duplicates: keep only the newest record for each name
    console.log('\n🗑️ מוחק רשומות כפולות...');
    
    // Delete older duplicates for "בוטבוט" - keep only ID 30 (newest)
    await dbRun('DELETE FROM web_tasks WHERE name = "בוטבוט" AND id IN (27, 28)');
    console.log(`מחק רשומות ישנות של "בוטבוט"`);

    // Delete older duplicates for "חדשות טכנולוגיה 💡" - keep only ID 29 (newest)
    await dbRun('DELETE FROM web_tasks WHERE name = "חדשות טכנולוגיה 💡" AND id = 26');
    console.log(`מחק רשומות ישנות של "חדשות טכנולוגיה 💡"`);

    // Check results
    const after = await dbAll(`
      SELECT id, name, created_at, file_path, target_groups
      FROM web_tasks 
      ORDER BY name, created_at
    `);

    console.log('\n✅ אחרי הניקוי:');
    console.table(after);

    // Show target_groups for verification
    console.log('\n🔍 קבוצות יעד בכל רשומה:');
    after.forEach(task => {
      const groups = JSON.parse(task.target_groups);
      console.log(`ID ${task.id} (${task.name}): ${groups.length} קבוצות - ${groups.join(', ')}`);
    });

    console.log('\n🎉 ניקוי הושלם בהצלחה!');

  } catch (error) {
    console.error('❌ שגיאה בניקוי כפילויות:', error);
  } finally {
    db.close();
  }
}

cleanDuplicates().catch(console.error);