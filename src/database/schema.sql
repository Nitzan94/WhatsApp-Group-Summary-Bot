-- WhatsApp Group Summary Bot Database Schema
-- SQLite Database for tracking messages, summaries, and groups

-- Groups table - track WhatsApp groups
CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,                    -- WhatsApp group ID (e.g., "120363XXX@g.us")
    name TEXT NOT NULL,                     -- Display name of the group
    phone_number_id TEXT,                   -- Associated phone number (for multi-account support)
    is_active BOOLEAN DEFAULT 1,            -- Whether to track this group
    schedule TEXT DEFAULT '0 16 * * *',     -- Cron schedule for summaries
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table - store group messages for summarization
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT UNIQUE NOT NULL,        -- WhatsApp message ID
    group_id TEXT NOT NULL,                 -- Reference to groups table
    sender_id TEXT NOT NULL,                -- WhatsApp sender ID
    sender_name TEXT,                       -- Display name of sender
    content TEXT NOT NULL,                  -- Message content
    message_type TEXT DEFAULT 'text',       -- text, image, video, document, etc.
    timestamp DATETIME NOT NULL,            -- When the message was sent
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- Summaries table - store generated summaries
CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,                 -- Reference to groups table
    summary_text TEXT NOT NULL,             -- The AI-generated summary
    messages_count INTEGER NOT NULL,        -- Number of messages summarized
    start_time DATETIME NOT NULL,           -- Earliest message timestamp in summary
    end_time DATETIME NOT NULL,             -- Latest message timestamp in summary
    model_used TEXT DEFAULT 'anthropic/claude-3.5-sonnet', -- AI model used
    tokens_used INTEGER,                    -- Number of tokens consumed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- Summary triggers table - track when summaries were triggered and by whom
CREATE TABLE IF NOT EXISTS summary_triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    summary_id INTEGER NOT NULL,            -- Reference to summaries table
    trigger_type TEXT NOT NULL,             -- 'scheduled', 'manual', 'command'
    triggered_by TEXT,                      -- User ID who triggered (for manual)
    trigger_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (summary_id) REFERENCES summaries(id) ON DELETE CASCADE
);

-- Contacts table - store contact information from history sync
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,                    -- WhatsApp contact ID (e.g., "972123456789@c.us")
    name TEXT,                              -- Display name of contact
    phone_number TEXT,                      -- Phone number
    is_group BOOLEAN DEFAULT 0,             -- Is this contact actually a group
    profile_picture_url TEXT,               -- Profile picture URL if available
    status TEXT,                            -- WhatsApp status if available
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chat metadata table - store enhanced chat information from history sync
CREATE TABLE IF NOT EXISTS chat_metadata (
    id TEXT PRIMARY KEY,                    -- Chat ID (group or contact ID)
    name TEXT NOT NULL,                     -- Display name
    chat_type TEXT DEFAULT 'private',       -- 'private', 'group', 'broadcast'
    description TEXT,                       -- Group description if available
    participant_count INTEGER DEFAULT 0,    -- Number of participants (for groups)
    creation_time DATETIME,                 -- When the chat was created
    is_active BOOLEAN DEFAULT 1,            -- Whether the chat is active
    last_activity DATETIME,                 -- Last message timestamp
    archive_status BOOLEAN DEFAULT 0,       -- Is chat archived
    pinned BOOLEAN DEFAULT 0,               -- Is chat pinned
    muted BOOLEAN DEFAULT 0,                -- Is chat muted
    owner_id TEXT,                          -- Group owner ID (for groups)
    subject_changed_at DATETIME,            -- When group subject was last changed
    subject_changed_by TEXT,                -- Who changed the group subject
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bot stats table - track bot usage and performance
CREATE TABLE IF NOT EXISTS bot_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_date DATE NOT NULL UNIQUE,        -- Date of the stats
    messages_processed INTEGER DEFAULT 0,   -- Messages processed today
    summaries_generated INTEGER DEFAULT 0,  -- Summaries generated today
    api_calls INTEGER DEFAULT 0,           -- OpenRouter API calls today
    uptime_minutes INTEGER DEFAULT 0,       -- Minutes the bot was running
    errors_count INTEGER DEFAULT 0,        -- Number of errors today
    history_sync_count INTEGER DEFAULT 0,   -- Messages synced from history today
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_group_timestamp ON messages(group_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_summaries_group_created ON summaries(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(is_active);

-- New indexes for history sync tables
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_last_seen ON contacts(last_seen);
CREATE INDEX IF NOT EXISTS idx_chat_metadata_type ON chat_metadata(chat_type);
CREATE INDEX IF NOT EXISTS idx_chat_metadata_activity ON chat_metadata(last_activity);
CREATE INDEX IF NOT EXISTS idx_chat_metadata_active ON chat_metadata(is_active);

-- Triggers to update timestamps
CREATE TRIGGER IF NOT EXISTS update_groups_timestamp 
    AFTER UPDATE ON groups
    BEGIN
        UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_chat_metadata_timestamp 
    AFTER UPDATE ON chat_metadata
    BEGIN
        UPDATE chat_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_contacts_last_seen 
    AFTER UPDATE ON contacts
    BEGIN
        UPDATE contacts SET last_seen = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Views for easy querying
CREATE VIEW IF NOT EXISTS recent_messages AS
SELECT 
    m.id,
    m.message_id,
    m.group_id,
    g.name as group_name,
    m.sender_name,
    m.content,
    m.timestamp,
    m.message_type
FROM messages m
JOIN groups g ON m.group_id = g.id
WHERE g.is_active = 1
ORDER BY m.timestamp DESC;

CREATE VIEW IF NOT EXISTS summary_stats AS
SELECT 
    g.id as group_id,
    g.name as group_name,
    COUNT(s.id) as total_summaries,
    MAX(s.created_at) as last_summary,
    AVG(s.messages_count) as avg_messages_per_summary,
    SUM(s.tokens_used) as total_tokens_used
FROM groups g
LEFT JOIN summaries s ON g.id = s.group_id
WHERE g.is_active = 1
GROUP BY g.id, g.name;

-- =====================================================
-- Natural Language Conversation Extensions
-- =====================================================

-- Conversation context table - זיכרון קצר מועד לשיחות
CREATE TABLE IF NOT EXISTS conversation_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,                 -- קבוצה בה מתקיימת השיחה
    user_id TEXT NOT NULL,                  -- משתמש ששואל
    last_question TEXT,                     -- השאלה האחרונה
    last_response TEXT,                     -- התשובה האחרונה
    context_data TEXT,                      -- JSON עם הקשר נוסף
    search_results_count INTEGER DEFAULT 0, -- כמה תוצאות נמצאו
    ai_model_used TEXT,                     -- איזה מודל AI נוצל
    response_time_ms INTEGER,               -- זמן תגובה במילישניות
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT (datetime('now', '+1 hour')), -- פג תוקף אחרי שעה
    
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- FTS5 Virtual Table - חיפוש מהיר בכל ההודעות
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    content,                                -- תוכן ההודעה
    sender_name,                            -- שם השולח
    group_name,                             -- שם הקבוצה
    message_type,                           -- סוג ההודעה
    content=messages,                       -- טבלת המקור
    content_rowid=id,                       -- קישור לטבלת המקור
    tokenize='unicode61 remove_diacritics 1' -- תמיכה בעברית משופרת
);

-- טבלת סטטיסטיקות חיפוש ושיחות
CREATE TABLE IF NOT EXISTS conversation_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_date DATE NOT NULL UNIQUE,        -- תאריך הסטטיסטיקה
    natural_queries INTEGER DEFAULT 0,     -- מספר שאלות טבעיות
    fts_searches INTEGER DEFAULT 0,        -- מספר חיפושי FTS
    avg_response_time_ms INTEGER DEFAULT 0, -- זמן תגובה ממוצע
    avg_results_count INTEGER DEFAULT 0,   -- מספר תוצאות ממוצע
    successful_queries INTEGER DEFAULT 0,   -- שאלות שהצליחו
    failed_queries INTEGER DEFAULT 0,      -- שאלות שנכשלו
    total_ai_tokens INTEGER DEFAULT 0,     -- סך האסימונים שנוצלו
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- אינדקסים לביצועים מיטביים
CREATE INDEX IF NOT EXISTS idx_conversation_context_group ON conversation_context(group_id);
CREATE INDEX IF NOT EXISTS idx_conversation_context_user ON conversation_context(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_context_expires ON conversation_context(expires_at);
CREATE INDEX IF NOT EXISTS idx_conversation_stats_date ON conversation_stats(stat_date);

-- Triggers לניקוי אוטומטי של זיכרון ישן
CREATE TRIGGER IF NOT EXISTS cleanup_expired_context
    AFTER INSERT ON conversation_context
    BEGIN
        DELETE FROM conversation_context 
        WHERE expires_at < datetime('now');
    END;

-- Trigger לעדכון סטטיסטיקות יומיות
CREATE TRIGGER IF NOT EXISTS update_daily_stats
    AFTER INSERT ON conversation_context
    BEGIN
        INSERT OR REPLACE INTO conversation_stats (
            stat_date, 
            natural_queries,
            avg_response_time_ms,
            avg_results_count,
            successful_queries,
            failed_queries
        )
        SELECT 
            date('now') as stat_date,
            COUNT(*) as natural_queries,
            AVG(response_time_ms) as avg_response_time_ms,
            AVG(search_results_count) as avg_results_count,
            SUM(CASE WHEN last_response IS NOT NULL AND last_response != '' THEN 1 ELSE 0 END) as successful_queries,
            SUM(CASE WHEN last_response IS NULL OR last_response = '' THEN 1 ELSE 0 END) as failed_queries
        FROM conversation_context
        WHERE date(created_at) = date('now');
    END;

-- View מאוחד לסטטיסטיקות מקיפות
CREATE VIEW IF NOT EXISTS bot_overview_stats AS
SELECT 
    bs.stat_date,
    bs.messages_processed,
    bs.summaries_generated,
    bs.api_calls,
    bs.uptime_minutes,
    bs.errors_count,
    cs.natural_queries,
    cs.avg_response_time_ms,
    cs.successful_queries,
    cs.failed_queries,
    (CAST(cs.successful_queries AS REAL) / NULLIF(cs.natural_queries, 0) * 100) as success_rate_percent
FROM bot_stats bs
LEFT JOIN conversation_stats cs ON bs.stat_date = cs.stat_date
ORDER BY bs.stat_date DESC;

-- =====================================================
-- Web Dashboard Extensions
-- =====================================================

-- Web Configuration Table - הגדרות ממשק הווב
CREATE TABLE IF NOT EXISTS web_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,                     -- 'management_groups', 'api_keys', 'settings'
    key TEXT NOT NULL,                          -- group name או config key
    value TEXT,                                 -- group ID או config value  
    metadata TEXT,                              -- JSON for additional data
    active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

-- Web Tasks Table - משימות ותזמונים מהממשק
CREATE TABLE IF NOT EXISTS web_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    task_type TEXT CHECK(task_type IN ('scheduled', 'one_time')),
    cron_expression TEXT,                       -- For scheduled tasks
    execute_at DATETIME,                        -- For one-time tasks
    action_type TEXT,                           -- 'daily_summary', 'today_summary', etc.
    target_groups TEXT,                         -- JSON array של שמות קבוצות
    message_template TEXT,
    send_to_group TEXT,                         -- Management group לשליחת תוצאות
    active BOOLEAN DEFAULT 1,
    file_path TEXT,                             -- Path לקובץ txt המקושר
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Task Execution History - היסטוריית ביצוע משימות
CREATE TABLE IF NOT EXISTS task_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES web_tasks(id),
    execution_type TEXT DEFAULT 'scheduled',    -- 'scheduled', 'manual', 'web_trigger'
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('pending', 'running', 'completed', 'failed')),
    result_message TEXT,
    error_message TEXT,
    duration_ms INTEGER,                        -- Duration in milliseconds
    triggered_by TEXT                           -- User or system that triggered
);

-- Web Sessions - ניהול sessions (אופציונלי)
CREATE TABLE IF NOT EXISTS web_sessions (
    id TEXT PRIMARY KEY,                        -- Session ID
    user_identifier TEXT,                       -- IP או user identifier
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (datetime('now', '+24 hours')),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT                               -- JSON with session data
);

-- Configuration History - Audit trail לשינויי הגדרות
CREATE TABLE IF NOT EXISTS config_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,                   -- איזו טבלה השתנתה
    record_id TEXT NOT NULL,                    -- ID של הרקורד
    action TEXT CHECK(action IN ('insert', 'update', 'delete')),
    old_values TEXT,                            -- JSON של ערכים ישנים
    new_values TEXT,                            -- JSON של ערכים חדשים
    changed_by TEXT,                            -- מי ביצע את השינוי
    change_reason TEXT,                         -- סיבת השינוי
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes לביצועים
CREATE INDEX IF NOT EXISTS idx_web_config_category ON web_config(category);
CREATE INDEX IF NOT EXISTS idx_web_config_active ON web_config(active);
CREATE INDEX IF NOT EXISTS idx_web_tasks_type ON web_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_web_tasks_active ON web_tasks(active);
CREATE INDEX IF NOT EXISTS idx_task_executions_task ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_date ON task_executions(executed_at);
CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_config_history_table_record ON config_history(table_name, record_id);

-- Triggers לעדכון timestamps
CREATE TRIGGER IF NOT EXISTS update_web_config_timestamp 
    AFTER UPDATE ON web_config
    BEGIN
        UPDATE web_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_web_tasks_timestamp 
    AFTER UPDATE ON web_tasks
    BEGIN
        UPDATE web_tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_web_sessions_activity 
    AFTER UPDATE ON web_sessions
    BEGIN
        UPDATE web_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Auto-cleanup expired sessions
CREATE TRIGGER IF NOT EXISTS cleanup_expired_sessions
    AFTER INSERT ON web_sessions
    BEGIN
        DELETE FROM web_sessions 
        WHERE expires_at < datetime('now');
    END;

-- Configuration change audit trigger
CREATE TRIGGER IF NOT EXISTS audit_web_config_changes
    AFTER UPDATE ON web_config
    BEGIN
        INSERT INTO config_history (
            table_name, record_id, action, 
            old_values, new_values, changed_by, change_reason
        ) VALUES (
            'web_config', 
            NEW.id,
            'update',
            json_object('category', OLD.category, 'key', OLD.key, 'value', OLD.value, 'active', OLD.active),
            json_object('category', NEW.category, 'key', NEW.key, 'value', NEW.value, 'active', NEW.active),
            'web_interface',
            'Configuration updated via web dashboard'
        );
    END;

-- View לניהול קבוצות ממשק הווב
CREATE VIEW IF NOT EXISTS management_groups_view AS
SELECT 
    wc.id,
    wc.key as group_name,
    wc.value as group_id,
    wc.active,
    g.name as resolved_name,
    g.is_active as group_exists,
    COUNT(m.id) as message_count,
    MAX(m.timestamp) as last_message_time,
    wc.created_at,
    wc.updated_at
FROM web_config wc
LEFT JOIN groups g ON wc.value = g.id
LEFT JOIN messages m ON g.id = m.group_id
WHERE wc.category = 'management_groups'
GROUP BY wc.id, wc.key, wc.value, wc.active, g.name, g.is_active, wc.created_at, wc.updated_at;

-- View לסטטיסטיקות משימות
CREATE VIEW IF NOT EXISTS task_stats_view AS
SELECT 
    wt.id,
    wt.name,
    wt.task_type,
    wt.active,
    COUNT(te.id) as total_executions,
    COUNT(CASE WHEN te.status = 'completed' THEN 1 END) as successful_executions,
    COUNT(CASE WHEN te.status = 'failed' THEN 1 END) as failed_executions,
    MAX(te.executed_at) as last_execution,
    AVG(te.duration_ms) as avg_duration_ms,
    wt.created_at
FROM web_tasks wt
LEFT JOIN task_executions te ON wt.id = te.task_id
GROUP BY wt.id, wt.name, wt.task_type, wt.active, wt.created_at;