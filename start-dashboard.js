// Simple standalone dashboard server
const express = require('express');
const cors = require('cors');
const path = require('path');
const DatabaseManager = require('./src/database/DatabaseManager');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'src/web/public')));

let db = null;

// Initialize database
async function initDB() {
  try {
    db = new DatabaseManager();
    await db.initialize();
    console.log('✅ Dashboard database connected');
  } catch (error) {
    console.error('❌ Dashboard database failed:', error);
  }
}

// API Routes
app.get('/api/status', async (req, res) => {
  try {
    const stats = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: db ? 'connected' : 'disconnected'
    };
    
    if (db) {
      const tasks = await db.getScheduledTasks(true);
      stats.activeTasks = tasks.length;
      stats.tasks = tasks.map(task => ({
        id: task.id,
        name: task.name,
        cron: task.cron_expression,
        active: task.active,
        lastExecution: task.last_execution
      }));
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ error: 'Database not connected' });
    }
    
    const tasks = await db.getScheduledTasks(false); // Get all tasks
    res.json({ tasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: port });
});

// Start server
app.listen(port, async () => {
  console.log(`🌐 Dashboard running on http://localhost:${port}`);
  console.log('🔧 Initializing database...');
  await initDB();
  console.log('✅ Dashboard ready!');
});