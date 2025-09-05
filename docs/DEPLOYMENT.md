# 🚀 Production Deployment Guide

## 📋 Overview

This guide covers deploying the WhatsApp AI Agent Bot to production environments with focus on reliability, security, and monitoring.

## 🏗️ Infrastructure Requirements

### System Requirements
```bash
# Minimum Specifications
CPU: 2 cores (4+ recommended for heavy usage)
RAM: 2GB (4GB+ recommended)
Storage: 10GB SSD (database can grow to 100MB+ with history)
Network: Stable internet connection (for WhatsApp Web & OpenRouter API)

# Supported Operating Systems
- Ubuntu 20.04 LTS / 22.04 LTS (recommended)
- CentOS 8+ / RHEL 8+
- Debian 11+
- macOS 12+ (development only)
```

### Required Dependencies
```bash
# Node.js (LTS version)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# SQLite 3 (usually pre-installed)
sudo apt-get install -y sqlite3

# PM2 for process management
npm install -g pm2

# Git for deployment
sudo apt-get install -y git
```

## 🔧 Production Configuration

### Environment Setup
```bash
# Create production user
sudo useradd -m -s /bin/bash whatsapp-bot
sudo usermod -aG sudo whatsapp-bot

# Create directory structure
sudo mkdir -p /opt/whatsapp-ai-bot
sudo chown whatsapp-bot:whatsapp-bot /opt/whatsapp-ai-bot

# Switch to bot user
sudo su - whatsapp-bot
cd /opt/whatsapp-ai-bot
```

### Application Deployment
```bash
# Clone repository
git clone https://github.com/your-repo/whatsapp-ai-bot.git .

# Install dependencies
npm install --production

# Create required directories
mkdir -p data logs

# Set proper permissions
chmod 700 data
chmod 755 logs
```

### Production Environment Variables
```bash
# Create production .env file
cat > .env << 'EOF'
# Production Environment Configuration
NODE_ENV=production

# OpenRouter AI API
OPENROUTER_API_KEY=sk-or-v1-your-production-api-key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Database Configuration
DB_PATH=./data/messages.db

# Logging Configuration  
LOG_LEVEL=info
LOG_FILE=./logs/bot.log

# Security Settings
AUTHORIZED_USERS=972501234567,972507654321

# WhatsApp Authentication (QR code mode)
PHONE_NUMBER=

# Scheduling (4 PM daily summaries)
DEFAULT_SCHEDULE=0 16 * * *

# Performance Settings
MAX_MESSAGES_PER_SUMMARY=100
BOT_NAME=ProductionBot
EOF

# Secure the environment file
chmod 600 .env
```

### Database Optimization
```bash
# Pre-optimize SQLite for production
sqlite3 data/messages.db << 'EOF'
-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;

-- Optimize for performance
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;
PRAGMA mmap_size = 268435456;

-- Vacuum database for optimal performance
VACUUM;

-- Analyze for query optimizer
ANALYZE;
EOF
```

## 🔄 Process Management with PM2

### PM2 Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'whatsapp-ai-bot',
    script: 'src/bot.js',
    cwd: '/opt/whatsapp-ai-bot',
    user: 'whatsapp-bot',
    
    // Process management
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    
    // Memory and CPU limits
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Logging
    log_file: './logs/pm2.log',
    out_file: './logs/pm2-out.log', 
    error_file: './logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000
  }]
};
```

### PM2 Deployment Commands
```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions provided by PM2

# Monitor application
pm2 monit

# View logs
pm2 logs whatsapp-ai-bot

# Restart application
pm2 restart whatsapp-ai-bot

# Stop application
pm2 stop whatsapp-ai-bot
```

## 🔒 Security Hardening

### Firewall Configuration
```bash
# UFW basic setup
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (adjust port if needed)
sudo ufw allow 22/tcp

# Allow outbound HTTPS for API calls
sudo ufw allow out 443/tcp

# Enable firewall
sudo ufw enable
```

### File Permissions
```bash
# Set secure permissions
chmod 700 /opt/whatsapp-ai-bot
chmod 600 /opt/whatsapp-ai-bot/.env
chmod 600 /opt/whatsapp-ai-bot/data/messages.db
chmod 755 /opt/whatsapp-ai-bot/logs

# Set ownership
chown -R whatsapp-bot:whatsapp-bot /opt/whatsapp-ai-bot
```

### API Key Security
```bash
# Store sensitive keys in separate file
cat > /opt/whatsapp-ai-bot/.secrets << 'EOF'
OPENROUTER_API_KEY=sk-or-v1-your-production-key
EOF

chmod 400 /opt/whatsapp-ai-bot/.secrets
chown whatsapp-bot:whatsapp-bot /opt/whatsapp-ai-bot/.secrets

# Source in .env
echo "source /opt/whatsapp-ai-bot/.secrets" >> /opt/whatsapp-ai-bot/.env
```

## 📊 Monitoring & Observability

### Health Check Script
```bash
#!/bin/bash
# health-check.sh

BOT_PID=$(pm2 pid whatsapp-ai-bot)
DB_PATH="/opt/whatsapp-ai-bot/data/messages.db"
LOG_PATH="/opt/whatsapp-ai-bot/logs/bot.log"

# Check if process is running
if [ -z "$BOT_PID" ] || [ "$BOT_PID" == "0" ]; then
    echo "CRITICAL: WhatsApp bot process not running"
    exit 2
fi

# Check database accessibility
if ! sqlite3 "$DB_PATH" "SELECT 1;" > /dev/null 2>&1; then
    echo "CRITICAL: Database not accessible"
    exit 2
fi

# Check recent activity (last 10 minutes)
RECENT_LOGS=$(tail -n 100 "$LOG_PATH" | grep "$(date -d '10 minutes ago' '+%Y-%m-%d %H:%M')" | wc -l)
if [ "$RECENT_LOGS" -eq 0 ]; then
    echo "WARNING: No recent activity in logs"
    exit 1
fi

# Check memory usage
MEMORY_MB=$(pm2 show whatsapp-ai-bot | grep "Memory usage" | awk '{print $4}' | sed 's/MB//')
if [ "$MEMORY_MB" -gt 800 ]; then
    echo "WARNING: High memory usage: ${MEMORY_MB}MB"
    exit 1
fi

echo "OK: WhatsApp AI Bot healthy"
exit 0
```

### Log Rotation Setup
```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/whatsapp-ai-bot << 'EOF'
/opt/whatsapp-ai-bot/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 whatsapp-bot whatsapp-bot
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

### System Monitoring
```bash
# Install basic monitoring tools
sudo apt-get install -y htop iotop nethogs

# Create monitoring script
cat > /opt/whatsapp-ai-bot/monitor.sh << 'EOF'
#!/bin/bash

echo "=== WhatsApp AI Bot System Status ==="
echo "Date: $(date)"
echo

# Process status
echo "Process Status:"
pm2 show whatsapp-ai-bot | grep -E "(status|uptime|restarts|memory|cpu)"
echo

# Database size
echo "Database Size:"
du -h /opt/whatsapp-ai-bot/data/messages.db
echo

# Recent errors
echo "Recent Errors (last 100 lines):"
tail -n 100 /opt/whatsapp-ai-bot/logs/bot.log | grep -i error | tail -5
echo

# System resources
echo "System Resources:"
free -h
df -h /opt/whatsapp-ai-bot
EOF

chmod +x /opt/whatsapp-ai-bot/monitor.sh
```

## 📈 Performance Optimization

### Node.js Optimization
```bash
# Add to .bashrc or .profile for production user
export NODE_OPTIONS="--max-old-space-size=1024 --gc-interval=100"
export NODE_ENV=production
```

### Database Tuning
```sql
-- Production SQLite optimization
-- Run these in production database

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;
PRAGMA mmap_size = 268435456;

-- Analyze tables for optimizer
ANALYZE messages;
ANALYZE groups;
ANALYZE conversations;

-- Rebuild FTS5 index
INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
```

### Memory Management
```javascript
// Add to src/bot.js for production monitoring
if (process.env.NODE_ENV === 'production') {
  // Memory monitoring
  setInterval(() => {
    const usage = process.memoryUsage();
    if (usage.heapUsed > 800 * 1024 * 1024) { // 800MB threshold
      logger.warn('High memory usage detected:', {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB'
      });
    }
  }, 60000); // Check every minute
}
```

## 🔄 Backup & Recovery

### Automated Backup Script
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/opt/backups/whatsapp-ai-bot"
DATE=$(date +%Y%m%d_%H%M%S)
BOT_DIR="/opt/whatsapp-ai-bot"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
echo "Backing up database..."
sqlite3 "$BOT_DIR/data/messages.db" ".backup $BACKUP_DIR/messages_$DATE.db"

# Backup configuration
echo "Backing up configuration..."
cp "$BOT_DIR/.env" "$BACKUP_DIR/env_$DATE.backup"

# Backup logs (last 7 days)
echo "Backing up recent logs..."
find "$BOT_DIR/logs" -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

# Compress old backups (keep last 30 days)
echo "Compressing old backups..."
find "$BACKUP_DIR" -name "*.db" -mtime +7 -exec gzip {} \;

# Clean very old backups (older than 30 days)
find "$BACKUP_DIR" -name "*" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR"
```

### Cron Job Setup
```bash
# Add to crontab for whatsapp-bot user
crontab -e

# Add these lines:
# Backup every 6 hours
0 */6 * * * /opt/whatsapp-ai-bot/backup.sh >> /opt/whatsapp-ai-bot/logs/backup.log 2>&1

# Health check every 15 minutes  
*/15 * * * * /opt/whatsapp-ai-bot/health-check.sh

# System monitoring report daily at 8 AM
0 8 * * * /opt/whatsapp-ai-bot/monitor.sh > /opt/whatsapp-ai-bot/logs/daily-report.txt
```

### Recovery Procedure
```bash
# To restore from backup
cd /opt/whatsapp-ai-bot

# Stop the bot
pm2 stop whatsapp-ai-bot

# Restore database (replace with actual backup file)
cp /opt/backups/whatsapp-ai-bot/messages_20250831_120000.db data/messages.db

# Restore configuration if needed
cp /opt/backups/whatsapp-ai-bot/env_20250831_120000.backup .env

# Start the bot
pm2 start whatsapp-ai-bot

# Verify recovery
pm2 logs whatsapp-ai-bot
```

## 🔍 Troubleshooting Guide

### Common Production Issues

#### 1. Bot Not Starting
```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs whatsapp-ai-bot

# Check system resources
free -h
df -h

# Verify environment configuration
cat .env | head -5  # Don't show API keys
```

#### 2. WhatsApp Connection Issues
```bash
# Clear WhatsApp auth state
rm -rf .wwebjs_auth

# Check network connectivity
curl -I https://web.whatsapp.com

# Monitor connection logs
tail -f logs/bot.log | grep -i whatsapp
```

#### 3. High Memory Usage
```bash
# Check memory usage
pm2 monit

# Restart application
pm2 restart whatsapp-ai-bot

# Check for memory leaks
node --inspect src/bot.js
```

#### 4. Database Issues
```bash
# Check database integrity
sqlite3 data/messages.db "PRAGMA integrity_check;"

# Analyze database performance
sqlite3 data/messages.db "ANALYZE; .stats on; SELECT COUNT(*) FROM messages;"

# Vacuum database if needed
sqlite3 data/messages.db "VACUUM;"
```

### Performance Monitoring Commands
```bash
# Real-time monitoring
watch -n 5 'pm2 show whatsapp-ai-bot | grep -E "(status|memory|cpu|restarts)"'

# Database performance
watch -n 10 'sqlite3 data/messages.db "SELECT COUNT(*) as total_messages FROM messages; SELECT COUNT(*) as total_groups FROM groups WHERE is_active=1;"'

# Log analysis
tail -f logs/bot.log | grep -E "(ERROR|WARN|memory|performance)"
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] Server provisioned with adequate resources
- [ ] All dependencies installed (Node.js, SQLite, PM2)
- [ ] Production user created with proper permissions
- [ ] Firewall configured and enabled
- [ ] Backup strategy implemented

### Deployment
- [ ] Application code deployed to `/opt/whatsapp-ai-bot`
- [ ] Production `.env` configured with secure API keys
- [ ] Database initialized and optimized
- [ ] PM2 ecosystem configuration created
- [ ] File permissions set correctly

### Post-Deployment
- [ ] Application started via PM2
- [ ] PM2 startup script configured
- [ ] Health checks passing
- [ ] Log rotation configured
- [ ] Monitoring scripts activated
- [ ] Backup cron jobs scheduled
- [ ] WhatsApp authentication completed (QR scan)

### Verification
- [ ] Bot responds to test messages
- [ ] Natural language queries work correctly
- [ ] Database queries perform well (<5 second response time)
- [ ] Scheduled summaries functioning
- [ ] Memory usage within acceptable limits (<800MB)
- [ ] Log files rotating properly

---

## 🎯 Production Success Metrics

- **✅ Uptime**: Target 99.9% (less than 8.76 hours downtime per year)
- **✅ Response Time**: <5 seconds for 95% of AI queries
- **✅ Memory Usage**: <800MB steady state
- **✅ Database Performance**: <100ms for most queries
- **✅ Error Rate**: <1% of total operations
- **✅ Backup Success**: 100% backup success rate

**This deployment guide ensures a robust, secure, and monitored production environment for the WhatsApp AI Agent Bot.**