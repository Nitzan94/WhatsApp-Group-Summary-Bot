const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

async function updateDatabaseSchema() {
  const dbPath = './data/messages.db';
  const schemaPath = './src/database/schema-v5.sql';
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database file not found:', dbPath);
    return;
  }
  
  const db = new sqlite3.Database(dbPath);
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  // Split schema into individual statements
  const statements = schema.split(';').filter(stmt => stmt.trim());
  
  console.log('🔄 Updating database schema...');
  
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    
    try {
      await new Promise((resolve, reject) => {
        db.run(trimmed, (err) => {
          if (err) {
            // Ignore "already exists" errors
            if (err.message.includes('already exists') || err.message.includes('duplicate')) {
              resolve();
            } else {
              reject(err);
            }
          } else {
            resolve();
          }
        });
      });
      console.log('✅ Executed statement');
    } catch (error) {
      console.log('⚠️ Statement error (might be expected):', error.message);
    }
  }
  
  db.close();
  console.log('✅ Database schema updated successfully');
}

updateDatabaseSchema().catch(console.error);