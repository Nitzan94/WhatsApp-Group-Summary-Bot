# 🚀 Quick Start Guide - v5.0 Database-Driven Bot

**Status:** ✅ PRODUCTION READY - Phase 2 Complete  
**Last Updated:** September 7, 2025

## ⚡ Start Bot (30 seconds)
```bash
cd C:\Users\nitza\devprojects\botbot
node src/bot.js
# ✅ Bot starts + Dashboard at http://localhost:5000
```

## 🌐 Dashboard Access
- **Main Dashboard**: http://localhost:5000
- **API Status**: http://localhost:5000/api/status  
- **Tasks API**: http://localhost:5000/api/tasks
- **Health Check**: http://localhost:5000/health

## 🔍 System Health Check
```bash
# Quick test
curl http://localhost:5000/health

# Detailed status
curl http://localhost:5000/api/status

# Integration test
node test-db-scheduler-integration.js
```

## 📊 Current System Stats
- **WhatsApp Groups**: 153 active
- **Messages Stored**: 89,000+
- **Scheduled Tasks**: 6 total (3 files + 3 database)
- **Database**: SQLite v5.0 schema
- **Web Port**: 5000 (configurable via WEB_PORT)

## 🏗️ Architecture Overview
```
✅ WhatsApp Bot (bot.js)
├── ✅ TaskExecutionService (AI-powered task execution)  
├── ✅ SchedulerService (Hybrid file+DB scheduling)
├── ✅ ConversationHandler (AI Agent with 5 tools)
└── ✅ WebServer (Express dashboard on port 5000)
```

## 🔧 Key Files
- **Main Bot**: `src/bot.js` (Phase 2 integrated)
- **Task Execution**: `src/services/TaskExecutionService.js`
- **Scheduler**: `src/services/SchedulerService.js` (enhanced)
- **Web Server**: `src/web/WebServer.js`
- **Database**: `src/database/DatabaseManager.js` (+18 new methods)

## 📁 Documentation
- **Main Guide**: `CLAUDE.md` (updated to v5.0)
- **Phase 2 Status**: `new_dashboard/06-phase-2-completion-status.md`
- **Implementation Plan**: `new_dashboard/05-implementation-status-report.md`

## 🚨 Troubleshooting
```bash
# Multiple processes conflict
tasklist | findstr node
powershell "Stop-Process -Name node -Force"

# Port already in use
netstat -ano | findstr :5000

# Database locked
# Stop all bot processes first
```

## 🎯 What's Working
- ✅ **Hybrid Scheduling**: File-based + Database tasks
- ✅ **Web Dashboard**: Full API + UI
- ✅ **AI Agent Integration**: Ready for task execution
- ✅ **WhatsApp Connection**: Auto-reconnecting
- ✅ **Database v5.0**: All tables operational
- ✅ **Real-time Sync**: Files ↔ Database

## 🔄 Next Steps (Phase 3)
1. **Task Execution UI**: Dashboard buttons for manual task execution
2. **Performance Monitoring**: Task execution success/failure tracking
3. **Advanced Scheduling**: Complex cron expressions support
4. **Multi-user Support**: Beyond single management group

---
**🎉 Phase 2 Implementation: COMPLETE**  
**Ready for production use with full web dashboard! 🌐**