const sqlite3 = require('sqlite3').verbose();
const util = require('util');

const db = new sqlite3.Database('./data/messages.db');
const dbAll = util.promisify(db.all.bind(db));

async function checkDuplicates() {

  console.log('📊 בדיקת כפילויות במסד הנתונים...\n');

  const duplicates = await dbAll(`
      SELECT 
          id, 
          name, 
          target_groups,
          file_path,
          created_at
      FROM web_tasks 
      ORDER BY name, created_at
  `);

  console.log('כל המשימות:');
  console.table(duplicates);

  // Group by name to find duplicates
  const grouped = duplicates.reduce((acc, task) => {
      if (!acc[task.name]) acc[task.name] = [];
      acc[task.name].push(task);
      return acc;
  }, {});

  console.log('\n🔍 מצא כפילויות:');
  for (const [name, tasks] of Object.entries(grouped)) {
      if (tasks.length > 1) {
          console.log(`\n❌ כפילות עבור: "${name}" (${tasks.length} רשומות)`);
          tasks.forEach(task => {
              const groups = JSON.parse(task.target_groups);
              console.log(`  - ID: ${task.id}, Groups: ${groups.length} [${groups.slice(0,2).join(', ')}${groups.length > 2 ? '...' : ''}], File: ${task.file_path}`);
          });
      }
  }

  db.close();
}

checkDuplicates().catch(console.error);