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

-- Bot stats table - track bot usage and performance
CREATE TABLE IF NOT EXISTS bot_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stat_date DATE NOT NULL UNIQUE,        -- Date of the stats
    messages_processed INTEGER DEFAULT 0,   -- Messages processed today
    summaries_generated INTEGER DEFAULT 0,  -- Summaries generated today
    api_calls INTEGER DEFAULT 0,           -- OpenRouter API calls today
    uptime_minutes INTEGER DEFAULT 0,       -- Minutes the bot was running
    errors_count INTEGER DEFAULT 0,        -- Number of errors today
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_group_timestamp ON messages(group_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_summaries_group_created ON summaries(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(is_active);

-- Triggers to update timestamps
CREATE TRIGGER IF NOT EXISTS update_groups_timestamp 
    AFTER UPDATE ON groups
    BEGIN
        UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
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