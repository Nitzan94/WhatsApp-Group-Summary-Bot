-- 📊 Database Schema v5.0 - DB-Driven Scheduler System
-- WhatsApp AI Agent Bot - New Scheduler Architecture
-- Created: September 2025
-- Author: Nitza + Claude Code

-- ========================================
-- 🗓️ טבלת משימות מתוזמנות
-- ========================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 📝 מידע בסיסי
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- 🎯 סוג הפעולה
  action_type TEXT NOT NULL CHECK (action_type IN (
    'daily_summary',      -- סיכום יומי 
    'weekly_summary',     -- סיכום שבועי
    'today_summary',      -- סיכום היום (קיים)
    'latest_message',     -- הודעה אחרונה (קיים)
    'custom_query',       -- שאילתה מותאמת אישית
    'send_message',       -- שליחת הודעה רגילה
    'group_analytics'     -- ניתוח קבוצה מתקדם
  )),
  
  -- 🎯 קבוצות יעד (JSON Array)
  target_groups TEXT NOT NULL, -- JSON: ["קבוצה 1", "קבוצה 2"]
  
  -- ⏰ תזמון (Cron Expression)
  cron_expression TEXT NOT NULL,
  
  -- 💬 שאילתה מותאמת (אם action_type = 'custom_query')
  custom_query TEXT,
  
  -- 📤 קבוצת יעד לשליחה
  send_to_group TEXT NOT NULL,
  
  -- ⚡ סטטוס
  active BOOLEAN DEFAULT 1,
  
  -- 🕒 זמנים
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_execution DATETIME,
  next_execution DATETIME,
  
  -- 👤 מי יצר
  created_by TEXT DEFAULT 'system'
);

-- ========================================
-- 📊 טבלת לוגי ביצוע משימות
-- ========================================

CREATE TABLE IF NOT EXISTS task_execution_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 🔗 קשר למשימה
  task_id INTEGER NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
  
  -- ⏱️ זמני ביצוע
  execution_start DATETIME DEFAULT CURRENT_TIMESTAMP,
  execution_end DATETIME,
  
  -- 🤖 אינטראקציית AI
  ai_query TEXT NOT NULL,                    -- השאלה שנשלחה ל-AI Agent
  ai_response TEXT,                          -- התשובה מ-Claude 3.5 Sonnet
  ai_model TEXT DEFAULT 'claude-3.5-sonnet', -- מודל AI שנעשה שימוש
  ai_tokens_used INTEGER DEFAULT 0,         -- מספר טוקנים שנצרכו
  ai_processing_time INTEGER DEFAULT 0,     -- זמן עיבוד AI במילישניות
  
  -- 🛠️ שימוש בכלים (DatabaseAgentTools)
  tools_used TEXT,                          -- JSON: ["search_groups", "get_recent_messages"]
  tools_data TEXT,                          -- JSON: נתונים שהתקבלו מהכלים
  database_queries INTEGER DEFAULT 0,      -- מספר שאילתות DB שבוצעו
  database_results INTEGER DEFAULT 0,      -- מספר תוצאות שהתקבלו
  
  -- ✅ תוצאות ביצוע
  success BOOLEAN NOT NULL,
  error_message TEXT,                       -- הודעת שגיאה אם יש
  output_message TEXT,                      -- ההודעה הסופית שנשלחה
  output_sent_to TEXT,                      -- לאיזה קבוצה נשלח
  
  -- 📈 מדדי ביצועים
  total_execution_time INTEGER DEFAULT 0,   -- זמן ביצוע כולל במילישניות
  memory_usage INTEGER DEFAULT 0,          -- שימוש בזיכרון בMB
  
  -- 📝 מטאדטה נוספת
  execution_context TEXT,                  -- JSON: הקשר נוסף למעקב
  
  -- 🏷️ תגיות וסיווג
  execution_type TEXT DEFAULT 'scheduled', -- 'scheduled' | 'manual' | 'test'
  session_id TEXT,                         -- מזהה ייחודי לסשן (UUID)
  
  -- 📊 נתונים סטטיסטיים
  groups_processed INTEGER DEFAULT 0,      -- מספר קבוצות שעובדו
  messages_analyzed INTEGER DEFAULT 0      -- מספר הודעות שנותחו
);

-- ========================================
-- 💬 טבלת שיחות AI Agent
-- ========================================

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 📝 מידע בסיסי  
  group_id TEXT NOT NULL,
  group_name TEXT,
  user_message TEXT NOT NULL,
  bot_response TEXT,
  
  -- 🤖 AI Agent מטאדטה
  ai_model TEXT DEFAULT 'claude-3.5-sonnet',
  tools_used TEXT, -- JSON array של כלים שנעשה בהם שימוש
  processing_time INTEGER DEFAULT 0, -- במילישניות
  tokens_used INTEGER DEFAULT 0,
  
  -- ⏰ זמנים
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- 📊 סטטוס
  success BOOLEAN DEFAULT 1,
  error_message TEXT
);

-- ========================================
-- 🚀 אינדקסים לביצועים מיטביים
-- ========================================

-- אינדקס עיקרי - משימות פעילות ותזמון הבא
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active_next 
ON scheduled_tasks(active, next_execution) 
WHERE active = 1;

-- אינדקס לוגי ביצוע - חיפוש לפי משימה וזמן
CREATE INDEX IF NOT EXISTS idx_execution_logs_task_time 
ON task_execution_logs(task_id, execution_start DESC);

-- אינדקס הצלחה - מעקב אחר כשלים
CREATE INDEX IF NOT EXISTS idx_execution_logs_success 
ON task_execution_logs(success, execution_start DESC);

-- אינדקס סוג ביצוע - הפרדה בין scheduled/manual
CREATE INDEX IF NOT EXISTS idx_execution_logs_type 
ON task_execution_logs(execution_type, execution_start DESC);

-- אינדקס שם משימה - חיפוש מהיר
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_name 
ON scheduled_tasks(name) 
WHERE active = 1;

-- ========================================
-- 🔧 Triggers עבור עדכון אוטומטי
-- ========================================

-- עדכון updated_at אוטומטי במשימות
CREATE TRIGGER IF NOT EXISTS update_scheduled_tasks_updated_at
AFTER UPDATE ON scheduled_tasks
FOR EACH ROW
BEGIN
  UPDATE scheduled_tasks 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;

-- עדכון execution_end אוטומטי בלוגים
CREATE TRIGGER IF NOT EXISTS update_execution_logs_end_time
BEFORE UPDATE ON task_execution_logs
FOR EACH ROW
WHEN NEW.success IS NOT NULL AND OLD.execution_end IS NULL
BEGIN
  UPDATE task_execution_logs 
  SET execution_end = CURRENT_TIMESTAMP,
      total_execution_time = CAST((julianday(CURRENT_TIMESTAMP) - julianday(NEW.execution_start)) * 86400000 AS INTEGER)
  WHERE id = NEW.id;
END;

-- ========================================
-- 📝 Views לדוחות מהירים
-- ========================================

-- תצוגה של משימות פעילות עם הביצוע האחרון
CREATE VIEW IF NOT EXISTS active_tasks_with_last_execution AS
SELECT 
  st.*,
  tel.execution_start as last_execution_start,
  tel.success as last_execution_success,
  tel.error_message as last_error
FROM scheduled_tasks st
LEFT JOIN task_execution_logs tel ON st.id = tel.task_id 
  AND tel.execution_start = (
    SELECT MAX(execution_start) 
    FROM task_execution_logs 
    WHERE task_id = st.id
  )
WHERE st.active = 1
ORDER BY st.next_execution ASC;

-- תצוגה של סטטיסטיקות ביצוע יומיות
CREATE VIEW IF NOT EXISTS daily_execution_stats AS
SELECT 
  DATE(execution_start) as execution_date,
  COUNT(*) as total_executions,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_executions,
  AVG(total_execution_time) as avg_execution_time,
  AVG(ai_tokens_used) as avg_tokens_used,
  SUM(messages_analyzed) as total_messages_analyzed
FROM task_execution_logs
WHERE execution_start >= DATE('now', '-30 days')
GROUP BY DATE(execution_start)
ORDER BY execution_date DESC;

-- ========================================
-- 💾 הוספת טבלאות קיימות (אם לא קיימות)
-- ========================================

-- וידוא שטבלאות הקיימות נמצאות (לא משנה אותן!)
-- הטבלאות הבאות כבר קיימות ולא נוגעים בהן:
-- - messages (75,000+ הודעות עם FTS5)
-- - groups (122 קבוצות)  
-- - summaries (היסטוריית סיכומים)
-- - bot_stats (סטטיסטיקות יומיות)
-- - contacts (500+ אנשי קשר)
-- - chat_metadata (מטא-דטה צ'אטים)
-- - conversations (מעקב שיחות AI Agent)

-- ========================================
-- ✅ הודעת הצלחה
-- ========================================

-- אם הגעת עד לכאן - הסכמה נוצרה בהצלחה! 🎉
-- גרסה: v5.0-schema
-- תאריך: ספטמבר 2025  
-- פיצ'רים: DB-Driven Scheduler + AI Agent Integration