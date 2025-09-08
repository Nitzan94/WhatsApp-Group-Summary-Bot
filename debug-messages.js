const DatabaseManager = require('./src/database/DatabaseManager');

async function checkRecentMessages() {
  const db = new DatabaseManager();
  
  // Initialize database connection
  await db.initialize();
  
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // 2025-09-07
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    
    console.log(`🕐 Current time: ${now.toISOString()}`);
    console.log(`📅 Today: ${today}`);
    console.log(`⏰ One hour ago: ${oneHourAgo}`);
    console.log('==========================================\n');

    // 1. Check ALL messages from today across ALL groups
    const allTodayMessages = await db.allQuery(`
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE timestamp >= '${today}' 
    `);
    console.log(`📊 TOTAL messages from today (ALL GROUPS): ${allTodayMessages[0].count}`);

    // 2. Check messages in last hour across ALL groups
    const lastHourMessages = await db.allQuery(`
      SELECT COUNT(*) as count 
      FROM messages 
      WHERE timestamp >= '${oneHourAgo}'
    `);
    console.log(`🔥 Messages in LAST HOUR (ALL GROUPS): ${lastHourMessages[0].count}`);

    // 3. Check last 20 messages from ANY group to see activity
    console.log('\n📋 LAST 20 MESSAGES FROM ANY GROUP:');
    console.log('==========================================');
    const recentMessages = await db.allQuery(`
      SELECT timestamp, group_id, sender_name, content,
             (SELECT name FROM groups WHERE id = messages.group_id) as group_name
      FROM messages 
      ORDER BY timestamp DESC 
      LIMIT 20
    `);
    
    recentMessages.forEach((msg, i) => {
      const timeAgo = ((now - new Date(msg.timestamp)) / (1000 * 60)).toFixed(0);
      console.log(`${i+1}. ${msg.timestamp} (${timeAgo} min ago)`);
      console.log(`   Group: ${msg.group_name || msg.group_id}`);
      console.log(`   From: ${msg.sender_name}`);
      console.log(`   Content: ${msg.content?.substring(0, 80) || 'No content'}`);
      console.log('---');
    });

    // 4. Check when messages stopped coming
    console.log('\n🔍 MESSAGES BY HOUR TODAY:');
    console.log('==========================================');
    const hourlyBreakdown = await db.allQuery(`
      SELECT 
        strftime('%H', timestamp) as hour,
        COUNT(*) as count
      FROM messages 
      WHERE timestamp >= '${today}' 
      GROUP BY strftime('%H', timestamp)
      ORDER BY hour DESC
    `);
    
    hourlyBreakdown.forEach(row => {
      console.log(`Hour ${row.hour}:00 - ${row.count} messages`);
    });

    // 5. Find the EXACT last message received
    console.log('\n🎯 VERY LAST MESSAGE RECEIVED:');
    console.log('==========================================');
    const lastMessage = await db.allQuery(`
      SELECT timestamp, group_id, sender_name, content,
             (SELECT name FROM groups WHERE id = messages.group_id) as group_name
      FROM messages 
      ORDER BY timestamp DESC 
      LIMIT 1
    `);
    
    if (lastMessage[0]) {
      const msg = lastMessage[0];
      const timeSince = ((now - new Date(msg.timestamp)) / (1000 * 60)).toFixed(0);
      console.log(`⏰ Last message: ${msg.timestamp} (${timeSince} minutes ago)`);
      console.log(`📱 Group: ${msg.group_name || msg.group_id}`);
      console.log(`👤 From: ${msg.sender_name}`);
      console.log(`💬 Content: ${msg.content?.substring(0, 100) || 'No content'}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRecentMessages();