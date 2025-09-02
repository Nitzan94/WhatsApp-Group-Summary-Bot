# 🤖 WhatsApp AI Agent Bot

**Advanced WhatsApp Bot with Full AI Agent Capabilities**

A sophisticated WhatsApp bot that captures comprehensive message history from WhatsApp Web and provides intelligent responses to natural language queries using Claude 3.5 Sonnet.

## ✨ Key Features

- 🤖 **Full AI Agent** - Natural conversation with Claude 3.5 Sonnet
- 📊 **122+ Active Groups** - Comprehensive WhatsApp monitoring  
- 🔍 **75,000+ Messages** - Complete history synced from WhatsApp Web
- 🛠️ **5 Smart Tools** - DatabaseAgentTools for advanced search
- 📤 **Message Sending** - Send messages to groups via natural language (v4.3)
- ⏰ **Scheduled Groups** - Automatic daily summaries
- 📈 **Advanced Search** - FTS5 full-text search with date ranges


## 🚀 Quick Start

```bash
# Clone and setup
git clone <repository-url>
cd botbot
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Run the bot
node src/bot.js
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WhatsApp Web  │    │  ConversationHandler │    │ Claude 3.5 Sonnet │
│   (Groups)  │───▶│    (AI Agent)     │───▶│  (OpenRouter)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ SQLite Database │    │ DatabaseAgentTools│    │   Tool Calls    │
│  (75K+ Messages)│    │   (5 Smart Tools) │    │  (Search/Query) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🛠️ Technology Stack

- **Runtime:** Node.js 22.18.0
- **WhatsApp:** Baileys library with messaging-history.set events
- **AI:** Claude 3.5 Sonnet via OpenRouter API
- **Database:** SQLite with FTS5 full-text search
- **Scheduling:** node-cron for automated tasks
- **Logging:** Winston with structured logging

## 📱 Usage Examples

### Natural Conversation (Any Group)
```
User: "מה דיברו השבוע על בינה מלאכותית?"
Bot: [Searches AI-related messages from the week and provides summary]

User: "תמצא לי הודעות מאתמול על השקעות"
Bot: [Uses get_messages_by_date tool to find investment discussions]
```

### Command Interface  
```bash
!today                    # Today's summary
!date 2025-08-30         # Specific date summary
!date week               # Last week summary
!status                  # Bot status and stats

# NEW! Message sending (from authorized groups only)
"שלח הודעה לקבוצת X: תוכן ההודעה"
```

### 📤 Message Sending Feature (v4.3)
The bot can now send messages to groups through natural language:
- **Authorized Groups:** "Nitzan bot" and "ניצן" groups only
- **Smart Group Matching:** Exact name matching with fallback to partial search  
- **Secure:** Permission validation and error handling
- **Usage:** "שלח לקבוצת [שם] את [הודעה]" or similar natural phrasing

## 😦 System Status

| Component | Status | Details |
|-----------|--------|---------|
| WhatsApp Connection | ✅ Active | 122 groups monitored |
| AI Agent | ✅ Operational | Claude 3.5 Sonnet responding |
| Database | ✅ Healthy | 75,000+ messages indexed |
| Scheduled Tasks | ✅ Running | 32 groups with daily summaries |
| Message Retention | ✅ Active | Auto-cleanup after 72 hours |

## 📆 Documentation

- [CLAUDE.md](./CLAUDE.md) - Complete technical guide for Claude Code
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture deep dive  
- [API.md](./docs/API.md) - DatabaseAgentTools API reference
- [DEPLOYMENT.md](./docs/DEPLOYMENT.md) - Production deployment guide
- [CONTRIBUTING.md](./docs/CONTRIBUTING.md) - Development guidelines

## ⚙️ הגדרות מתקדמות

### תזמון אוטומטי של סיכומים
```bash
# הגדרת סיכום יומי בשעה 16:00
!schedule "שם הקבוצה" "יומי 16:00"

# דוגמאות נוספות
!schedule "שם הקבוצה" "שבועי ראשון 10:00"
!schedule "שם הקבוצה" "חודשי 1 09:00"

# ביטול תזמון
!unschedule "שם הקבוצה"
```

### הגדרת קבוצת ניהול
הבוט יזהה אוטומטית את הקבוצה הראשונה בה תשלח פקודה כקבוצת ניהול.
או הגדר ידנית ב-`.env`:
```bash
# ID של קבוצת הניהול (אופציונלי)
SUMMARY_TARGET_GROUP_ID=YOUR_GROUP_ID_HERE
```

### שינוי מודל הAI
```bash
# ב-.env - בחר מודל שונה
OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct:free
# או
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
# או
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

## 🔧 התאמה אישית

### שינוי זמן מחיקת הודעות
הבוט מוחק הודעות אוטומטית אחרי 72 שעות. לשינוי, ערוך בקובץ הקוד:
```javascript
// ב-SchedulerService.js
const deletedCount = await this.db.cleanOldMessages(72); // שעות
```

### שינוי זמן ניקוי יומי
ברירת מחדל: 02:00. לשינוי ערוך:
```javascript
// ב-SchedulerService.js
const cleanupJob = cron.schedule('0 2 * * *', ...); // 02:00
```

## 📊 מעקב וניטור

### צפייה בלוגים
```bash
# לוגים חיים
tail -f logs/bot.log

# לוגים מהיום
grep "$(date +%Y-%m-%d)" logs/bot.log
```

### בדיקת בסיס הנתונים
```bash
# התחברות לבסיס הנתונים
sqlite3 data/messages.db

# שאילתות שימושיות
.tables                                    # רשימת טבלאות
SELECT COUNT(*) FROM messages;            # סה"כ הודעות
SELECT COUNT(*) FROM groups WHERE is_active=1;  # קבוצות פעילות
SELECT * FROM summaries ORDER BY created_at DESC LIMIT 5;  # 5 סיכומים אחרונים
```

## 🛠️ פתרון בעיות נפוצות

### הבוט לא מתחבר לWhatsApp
- וודא שקוד ה-QR עדיין תקף (מתחדש כל דקה)
- בדוק שאין חיבור WhatsApp Web אחר פתוח
- נסה להפעיל מחדש: `Ctrl+C` ואז `node src/bot.js`

### שגיאות API
- בדוק שה-API key ב-`.env` נכון
- וודא שיש זיכוי ב-OpenRouter (התכנית החינמית מוגבלת)
- נסה מודל אחר ב-`OPENROUTER_MODEL`

### הבוט לא מגיב לפקודות
- וודא שהודעות הפקודה מתחילות ב-`!`
- בדוק שהבוט רואה את הקבוצה: `!status`
- עיין בלוגים: `tail -f logs/bot.log`

### מחסור בזיכרון
```bash
# הגדלת זיכרון Node.js
node --max-old-space-size=4096 src/bot.js
```

### בעיות חיבור
```bash
# בדיקת חיבור לאינטרנט
ping google.com

# בדיקת API
curl -H "Authorization: Bearer YOUR_API_KEY" https://openrouter.ai/api/v1/models
```

## 🔒 אבטחה ופרטיות

- **הודעות נשמרות מקומית** - רק במחשב שלך
- **מחיקה אוטומטית** - הודעות נמחקות אחרי 72 שעות
- **ללא גיבוי ענן** - כל הנתונים אצלך בלבד
- **API Key מוצפן** - לא נשמר בקוד המקור

### גיבוי מומלץ
```bash
# גיבוי בסיס הנתונים
cp data/messages.db backup-$(date +%Y%m%d).db

# גיבוי הגדרות
cp .env .env.backup
```

## 🎯 שימושים מומלצים

### לעסקים
- מעקב אחר צוותי עבודה
- סיכומי פגישות אוטומטיים
- דוחות פעילות יומיים

### לקהילות
- סיכומי דיונים בקבוצות גדולות
- מעקב אחר הודעות חשובות
- ארכיון מסודר של שיחות

### לפרויקטים
- תיעוד התקדמות
- סיכומי החלטות
- מעקב אחר משימות

## 🤝 תמיכה ופיתוח

### דיווח על בעיות
פתח issue ב-[GitHub](https://github.com/Nitzan94/WhatsApp-Group-Summary-Bot/issues)

### תרומה לפרויקט
1. Fork הפרויקט
2. צור branch חדש
3. בצע שינויים
4. שלח Pull Request

### רישיון
MIT License - חופשי לשימוש ולשינוי

---

## 📞 מדריך מהיר

```bash
# התקנה
git clone https://github.com/Nitzan94/WhatsApp-Group-Summary-Bot.git
cd WhatsApp-Group-Summary-Bot
npm install

# הגדרה
echo "OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY" > .env
echo "OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct:free" >> .env

# הפעלה
node src/bot.js

# שימוש - שלח בקבוצת WhatsApp:
# !test
# !summary
# !today
```

**בהצלחה! 🎉**

---
*פותח עם ❤️ לקהילת WhatsApp | גרסה 3.0*
