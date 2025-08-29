# 🤖 WhatsApp Group Summary Bot

בוט WhatsApp חכם שמאזין לקבוצות, שומר הודעות ומייצר סיכומים אוטומטיים באמצעות בינה מלאכותית.

## ✨ תכונות עיקריות

- 📊 **מעקב אחר קבוצות WhatsApp** - שמירה אוטומטית של כל ההודעות
- 🤖 **סיכומים חכמים** - יצירת סיכומים מובנים עם AI (Qwen 2.5 72B)
- ⏰ **תזמון אוטומטי** - סיכומים מתוזמנים לקבוצות נבחרות
- 🧹 **ניהול אוטומטי** - מחיקת הודעות ישנות וניקוי יומי
- 📬 **איסוף היסטוריה** - יכולת לאסוף הודעות גם כשהבוט לא היה מחובר
- 🎮 **פקודות מתקדמות** - ניהול מרחוק וחיפוש קבוצות

## 🚀 התקנה מהירה

### 1. דרישות מערכת
```bash
# Node.js (גרסה 18 או חדשה יותר)
node --version

# Git
git --version
```

### 2. הורדה והתקנה
```bash
# שכפול הפרויקט
git clone https://github.com/Nitzan94/WhatsApp-Group-Summary-Bot.git
cd WhatsApp-Group-Summary-Bot

# התקנת תלותות
npm install
```

### 3. הגדרת API Key
צור חשבון ב-[OpenRouter.ai](https://openrouter.ai) וקבל API key חינמי:

```bash
# צור קובץ .env
nano .env
```

הוסף את השורות הבאות:
```bash
# OpenRouter API Configuration
OPENROUTER_API_KEY=sk-or-v1-YOUR-API-KEY-HERE
OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct:free

# Bot Configuration
BOT_NAME=GroupSummaryBot
MAX_MESSAGES_PER_SUMMARY=100
SUMMARY_LANGUAGE=hebrew

# Database Configuration
DB_PATH=./data/messages.db

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/bot.log

# WhatsApp Authentication (leave empty for QR code)
PHONE_NUMBER=
```

### 4. הפעלת הבוט
```bash
node src/bot.js
```

### 5. חיבור לWhatsApp
- סרוק את קוד ה-QR שיופיע בטרמינל עם WhatsApp שלך
- הבוט יתחבר אוטומטית ויתחיל לפעול

## 📱 שימוש בסיסי

### פקודות זמינות בכל קבוצה
- `!status` - מצב הבוט ומספר ההודעות
- `!summary` - סיכום הודעות חדשות מאז הסיכום האחרון
- `!today` - סיכום כל ההודעות מהיום (החל מ-00:00)
- `!test` - בדיקת חיבור למערכת הAI
- `!help` - רשימה מלאה של הפקודות

### פקודות מתקדמות (לקבוצת הניהול)
- `!today [שם קבוצה]` - סיכום יומי לקבוצה אחרת
- `!summary [שם קבוצה]` - סיכום לקבוצה אחרת
- `!list` - רשימת כל הקבוצות
- `!search [טקסט]` - חיפוש קבוצות
- `!schedules` - רשימת תזמונים פעילים
- `!schedule [קבוצה] [זמן]` - הגדרת תזמון
- `!unschedule [קבוצה]` - ביטול תזמון

### דוגמה לשימוש
1. שלח `!test` בקבוצה כדי לבדוק שהכל עובד
2. שלח `!summary` לקבלת סיכום הודעות חדשות
3. שלח `!today` לסיכום מלא של כל הודעות היום

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