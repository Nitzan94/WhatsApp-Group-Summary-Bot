# 🔄 Web Dashboard Two-Way Sync Implementation Plan

**Date:** September 4, 2025  
**Priority:** CRITICAL - Fix current issues and prepare for Natural Language Commands

## 🎯 Vision & Goals

### Current State Problems:
1. **One-time tasks:** `undefined` execution time when created from dashboard
2. **Daily summaries:** File-based schedules not appearing in dashboard
3. **API Key:** Not displayed in dashboard
4. **Management Groups:** Dashboard changes don't sync to bot
5. **Task Templates:** Limited to fixed templates, no free text

### Future Vision:
- **Natural Language Commands:** "שלח סיכום של קבוצת AI לניצן מחר בבוקר"
- **Dynamic Tool Integration:** Bot can receive new tools and capabilities
- **Flexible Task Execution:** Any command in natural language
- **AI-Powered Understanding:** Bot understands context and intent

## 🏗️ Architecture Design

### Phase 1: Fix Current Infrastructure (Today)
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Web Dashboard│◄───►│ ConfigService│◄───►│File System  │
│   (React)    │     │   (Sync Hub) │     │ (schedules/)│
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Database   │
                    │ (web_config) │
                    └──────────────┘
```

### Phase 2: Natural Language Support (Future Ready)
```
┌─────────────┐
│Natural Lang │──► "סכם את קבוצת AI ושלח לניצן"
│   Input     │
└─────────────┘
       │
       ▼
┌─────────────┐
│ AI Parser   │──► Intent: SUMMARY
│(Claude/GPT) │    Target: "קבוצת AI"  
└─────────────┘    SendTo: "ניצן"
       │           Time: "now"
       ▼
┌─────────────┐
│Tool Registry│──► Available Tools:
│             │    - summarize_group
└─────────────┘    - send_message
                   - search_messages
                   - generate_report
                   - [future tools...]
```

## 📋 Implementation Tasks

### 1. Fix One-Time Task Time Issue
**Problem:** `execute_at` not being saved properly
**Solution:**
```javascript
// In ConfigService.js - createWebTask()
if (taskData.task_type === 'one_time' && taskData.execute_at) {
  // Ensure ISO format
  config.execute_at = new Date(taskData.execute_at).toISOString();
}
```

### 2. Two-Way Sync System
**Problem:** Changes in dashboard don't reflect in files and vice versa
**Solution:** Create SyncManager

```javascript
// New file: src/services/SyncManager.js
class SyncManager {
  constructor(configService, schedulerService, db) {
    this.configService = configService;
    this.schedulerService = schedulerService;
    this.db = db;
  }

  // Sync from files to DB (on startup and file changes)
  async syncFilesToDB() {
    const fileSchedules = await this.schedulerService.loadSchedules();
    for (const schedule of fileSchedules) {
      await this.configService.upsertWebTask(schedule);
    }
  }

  // Sync from DB to files (on web changes)
  async syncDBToFiles() {
    const webTasks = await this.configService.getWebTasks();
    for (const task of webTasks) {
      await this.schedulerService.saveTaskToFile(task);
    }
  }

  // Watch for changes
  startWatching() {
    // Watch file changes
    fs.watch('./schedules/', async (eventType, filename) => {
      if (filename.endsWith('.txt')) {
        await this.syncFilesToDB();
      }
    });
    
    // Watch DB changes (via event emitter)
    this.configService.on('taskUpdated', async () => {
      await this.syncDBToFiles();
    });
  }
}
```

### 3. Natural Language Task Support
**Future-Ready Structure:**

```javascript
// In web_config table - new schema
CREATE TABLE IF NOT EXISTS web_tasks_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  task_type TEXT, -- 'scheduled' | 'one_time' | 'natural_language'
  
  -- For natural language tasks
  natural_language_command TEXT, -- "שלח סיכום של קבוצת AI לניצן"
  parsed_intent JSON, -- AI parsed: {action: "summary", target: "AI", sendTo: "ניצן"}
  
  -- Legacy fields for backward compatibility
  cron_expression TEXT,
  execute_at TEXT,
  action_type TEXT,
  
  -- Execution
  tools_required JSON, -- ["summarize", "send_message"]
  execution_plan JSON, -- Step by step plan
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4. API Key Display
**Solution:**
```javascript
// In ConfigService.js
async getApiKeyStatus() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  return {
    keyPresent: !!apiKey,
    keyMasked: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.slice(-4)}` : null,
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'
  };
}
```

### 5. Management Groups Sync
**Solution:**
```javascript
// In ConfigService.js
async addManagementGroup(groupName) {
  // 1. Add to database
  await this.db.run(`INSERT INTO web_config ...`);
  
  // 2. Update bot's managementGroups array
  this.bot.managementGroups.push(groupName);
  
  // 3. Emit sync event
  this.emit('managementGroupsUpdated');
  
  return { success: true };
}
```

## 🚀 Implementation Order

### Step 1: Fix Immediate Issues (30 min)
- [ ] Fix undefined execute_at in one-time tasks
- [ ] Display API key in dashboard
- [ ] Show all schedules from files in dashboard

### Step 2: Implement Two-Way Sync (1 hour)
- [ ] Create SyncManager class
- [ ] Add file watching
- [ ] Add DB change events
- [ ] Test sync in both directions

### Step 3: Prepare Natural Language Infrastructure (1 hour)
- [ ] Update database schema for natural language
- [ ] Create flexible task input in UI
- [ ] Add task parser skeleton
- [ ] Create tool registry structure

### Step 4: Testing & Validation (30 min)
- [ ] Test all sync scenarios
- [ ] Verify natural language input storage
- [ ] Ensure backward compatibility

## 🔮 Future Enhancements

### Natural Language Processing
```javascript
class NaturalLanguageParser {
  async parseCommand(command) {
    // Use AI to understand intent
    const prompt = `
      Parse this Hebrew command into structured actions:
      "${command}"
      
      Available actions: summary, send_message, search, schedule
      Available groups: [list from DB]
      
      Return JSON: {action, target, sendTo, when, parameters}
    `;
    
    const parsed = await this.aiService.parse(prompt);
    return parsed;
  }
}
```

### Dynamic Tool Loading
```javascript
class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }
  
  register(name, handler) {
    this.tools.set(name, handler);
  }
  
  async execute(toolName, params) {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found`);
    return await tool.execute(params);
  }
}

// Register tools dynamically
toolRegistry.register('summarize', new SummarizeTool());
toolRegistry.register('send_message', new SendMessageTool());
toolRegistry.register('web_scrape', new WebScrapeTool()); // Future
toolRegistry.register('analyze_sentiment', new SentimentTool()); // Future
```

## ✅ Success Criteria

1. **Immediate:** All current features work with proper sync
2. **Short-term:** Natural language commands can be stored and displayed
3. **Long-term:** Bot executes any natural language command using available tools

## 🎉 End Result

A flexible, extensible system where users can:
- Write tasks in natural language
- Dashboard and files stay in perfect sync
- Bot understands context and chooses appropriate tools
- New capabilities can be added without changing core infrastructure

**The foundation we build today enables the AI-powered bot of tomorrow!**