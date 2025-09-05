 1. 🗂️ מערכת לוגינג מתקדמת:
  - קובץ ייעודי: logs/ai-agent-activity.log בפורמט JSON
  - דו"ח אנושי: פונקצית generateHumanReadableReport() ליצירת סיכום נקרא

  2. 📊 מה נרשם בכל שיחה:
  - 🎬 תחילת שיחה: שאלה, משתמש, קבוצה, זמן
  - 🛠️ ביצוע כלים: איזה כלי, פרמטרים, תוצאות, זמן ביצוע
  - 🔍 חיפושי מסד נתונים: סוג חיפוש, מילות מפתח, מספר תוצאות, דוגמאות
  - 🤖 תגובת AI: אורך תגובה, מספר tool calls, זמן עיבוד כולל
  - 📈 תובנות נתונים: קבוצות שנוגעו, נושאים מרכזיים, משתמשים מעורבים
  - 🏁 סיום שיחה: הצלחה/כישלון, זמן כולל

  3. 🔍 דוגמה למידע שנרשם:
  {
    "event": "tool_execution",
    "sessionId": "ai_1756895579852_4izrodzse",
    "toolName": "search_messages_in_group",
    "parameters": {
      "groupId": "test-group-id@g.us",
      "searchQuery": "בינה מלאכותית",
      "limit": 20
    },
    "resultSummary": {
      "count": 2,
      "sample": {
        "firstItem": {
          "sender_name": "ניצן",
          "content": "דיברנו על ChatGPT"
        }
      }
    },
    "executionTime": 145
  }

  🚀 כיצד להשתמש:

  להבנת פעילות AI בזמן אמת:
  # צפייה בלוג החי
  tail -f logs/ai-agent-activity.log

  # חיפוש לפי session מסוים
  grep "ai_1756895579852" logs/ai-agent-activity.log

  ליצירת דוח קריא לאדם:
  const { generateHumanReadableReport } = require('./src/utils/agentLogger');
  const report = await generateHumanReadableReport('session-id-here');
  console.log(report);

  💡 יתרונות המערכת:

  1. 🔍 שקיפות מלאה - אתה יודע בדיוק איזה מידע ה-AI קרא
  2. ⚡ אנליזת ביצועים - זמני ביצוע של כל כלי וחיפוש
  3. 📊 הבנת התנהגות - איזה כלים נבחרים לאיזה שאלות
  4. 🐛 דיבאג מתקדם - עקיבה מלאה אחר workflow של AI
  5. 📈 אופטימיזציה - זיהוי צוואי צוואר וחיפושים איטיים