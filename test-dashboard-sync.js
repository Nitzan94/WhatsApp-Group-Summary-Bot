#!/usr/bin/env node

/**
 * בדיקות אינטגרציה מקיפות - דשבורד ניהול משימות
 * 
 * בדיקת סנכרון מלא בין:
 * 1. ממשק הדשבורד (Frontend)
 * 2. מסד נתונים (SQLite) 
 * 3. קבצי טקסט (schedules/)
 * 
 * @author ניצן + Claude Code
 * @version v4.3-Enhanced
 */

const fs = require('fs').promises;
const path = require('path');
const DatabaseManager = require('./src/database/DatabaseManager');
const ConfigService = require('./src/services/ConfigService');
const colors = require('colors'); // npm install colors --save-dev

// הגדרות בדיקה
const TEST_CONFIG = {
    schedulesPath: path.join(__dirname, 'schedules'),
    testTaskPrefix: 'TEST_TASK_',
    cleanup: true // מחיקה אוטומטית של בדיקות
};

class DashboardSyncTester {
    constructor() {
        this.db = null;
        this.configService = null;
        this.testTasks = [];
        this.testResults = [];
    }

    /**
     * אתחול הבדיקות
     */
    async init() {
        console.log('🚀 מתחיל בדיקות אינטגרציה - דשבורד ניהול משימות'.cyan.bold);
        console.log('='.repeat(60).gray);
        
        try {
            // אתחול מסד נתונים
            this.db = new DatabaseManager();
            await this.db.initialize();
            
            // אתחול ConfigService
            this.configService = new ConfigService(this.db);
            
            console.log('✅ אתחול מערכות הושלם'.green);
        } catch (error) {
            console.error('❌ כשל באתחול:'.red, error.message);
            throw error;
        }
    }

    /**
     * בדיקה 1: יצירת משימה בדשבורד ושמירה בקובץ
     */
    async test1_CreateTaskSavesToFile() {
        console.log('\n📝 בדיקה 1: יצירת משימה חדשה ושמירה לקובץ'.yellow.bold);
        
        const testTask = {
            name: `${TEST_CONFIG.testTaskPrefix}יומי_בוקר`,
            task_type: 'scheduled',
            cron_expression: '0 8 * * *',  // כל יום ב-8:00
            action_type: 'daily_summary',
            target_groups: ['קבוצת בדיקה 1', 'קבוצת בדיקה 2'],
            send_to_group: 'ניצן'
        };

        try {
            // יצירת משימה דרך ConfigService (כמו הדשבורד)
            const result = await this.configService.createWebTask(testTask);
            
            if (!result.success) {
                throw new Error(`יצירת משימה נכשלה: ${result.error}`);
            }
            
            const taskId = result.taskId;
            this.testTasks.push(taskId);
            
            console.log(`   ✅ משימה נוצרה במסד נתונים (ID: ${taskId})`.green);
            
            // בדיקה שהקובץ נוצר
            const expectedFilePath = path.join(TEST_CONFIG.schedulesPath, `web-task-${taskId}.txt`);
            
            // המתנה קצרה לוודא שהקובץ נכתב
            await this.sleep(500);
            
            try {
                const fileExists = await fs.access(expectedFilePath).then(() => true).catch(() => false);
                if (!fileExists) {
                    throw new Error('קובץ התזמון לא נוצר');
                }
                
                const fileContent = await fs.readFile(expectedFilePath, 'utf8');
                console.log(`   ✅ קובץ נוצר: ${expectedFilePath}`.green);
                console.log(`   📄 תוכן הקובץ:\n${fileContent.trim()}`.blue);
                
                // בדיקת תוכן הקובץ
                await this.verifyFileContent(fileContent, testTask);
                
                this.addTestResult('test1_CreateTaskSavesToFile', 'PASS', 'משימה נוצרה ונשמרה לקובץ בהצלחה');
                
            } catch (fileError) {
                throw new Error(`בעיה בקובץ: ${fileError.message}`);
            }
            
        } catch (error) {
            console.error(`   ❌ בדיקה 1 נכשלה:`.red, error.message);
            this.addTestResult('test1_CreateTaskSavesToFile', 'FAIL', error.message);
        }
    }

    /**
     * בדיקה 2: התאמה מדויקת בין דשבורד לקובץ
     */
    async test2_DashboardFileSync() {
        console.log('\n🔄 בדיקה 2: סנכרון מדויק בין דשבורד לקובצים'.yellow.bold);
        
        try {
            // קבלת כל המשימות מהדשבורד
            const tasks = await this.configService.getWebTasks('scheduled');
            console.log(`   📊 נמצאו ${tasks.length} משימות בדשבורד`.blue);
            
            let syncErrors = [];
            
            for (const task of tasks) {
                if (!task.name.startsWith(TEST_CONFIG.testTaskPrefix)) continue; // רק בדיקות שלנו
                
                console.log(`   🔍 בודק משימה: ${task.name}`.cyan);
                
                // חיפוש הקובץ התואם
                const expectedFilePath = path.join(TEST_CONFIG.schedulesPath, `web-task-${task.id}.txt`);
                
                try {
                    const fileContent = await fs.readFile(expectedFilePath, 'utf8');
                    
                    // בדיקת התאמה
                    const syncResult = await this.verifyTaskFileSync(task, fileContent);
                    
                    if (syncResult.success) {
                        console.log(`     ✅ סנכרון תקין`.green);
                    } else {
                        syncErrors.push(`${task.name}: ${syncResult.errors.join(', ')}`);
                        console.log(`     ❌ שגיאות סנכרון: ${syncResult.errors.join(', ')}`.red);
                    }
                    
                } catch (fileError) {
                    syncErrors.push(`${task.name}: קובץ לא נמצא`);
                    console.log(`     ❌ קובץ לא נמצא: ${expectedFilePath}`.red);
                }
            }
            
            if (syncErrors.length === 0) {
                this.addTestResult('test2_DashboardFileSync', 'PASS', 'כל המשימות מסונכרנות בין דשבורד לקבצים');
            } else {
                this.addTestResult('test2_DashboardFileSync', 'FAIL', `שגיאות סנכרון: ${syncErrors.join('; ')}`);
            }
            
        } catch (error) {
            console.error(`   ❌ בדיקה 2 נכשלה:`.red, error.message);
            this.addTestResult('test2_DashboardFileSync', 'FAIL', error.message);
        }
    }

    /**
     * בדיקה 3: הצגה נכונה בדשבורד
     */
    async test3_DashboardDisplay() {
        console.log('\n👁️  בדיקה 3: הצגת משימות בדשבורד'.yellow.bold);
        
        try {
            const tasks = await this.configService.getWebTasks('scheduled');
            const testTasks = tasks.filter(t => t.name.startsWith(TEST_CONFIG.testTaskPrefix));
            
            console.log(`   📋 בודק תצוגה של ${testTasks.length} משימות בדיקה`.blue);
            
            let displayErrors = [];
            
            for (const task of testTasks) {
                console.log(`   🎯 בודק תצוגה: ${task.name}`.cyan);
                
                // בדיקת שדות חובה להצגה
                const displayChecks = [
                    {
                        field: 'name',
                        check: task.name && task.name.trim() !== '',
                        error: 'שם המשימה ריק'
                    },
                    {
                        field: 'target_groups',
                        check: Array.isArray(task.target_groups) && task.target_groups.length > 0,
                        error: 'קבוצות יעד לא מוגדרות נכון'
                    },
                    {
                        field: 'cron_expression',
                        check: task.cron_expression && task.cron_expression.trim() !== '',
                        error: 'תזמון CRON ריק'
                    },
                    {
                        field: 'active',
                        check: typeof task.active === 'number',
                        error: 'סטטוס פעיל/לא פעיל לא מוגדר'
                    }
                ];
                
                const failedChecks = displayChecks.filter(check => !check.check);
                
                if (failedChecks.length === 0) {
                    console.log(`     ✅ כל שדות התצוגה תקינים`.green);
                    
                    // הצגת הפרטים כפי שיופיעו בדשבורד
                    console.log(`     📝 כותרת: ${task.name}`.blue);
                    console.log(`     🎯 קבוצות: ${task.target_groups.join(', ')}`.blue);
                    console.log(`     ⏰ תזמון: ${this.humanizeCron(task.cron_expression)}`.blue);
                    console.log(`     🔘 סטטוס: ${task.active ? 'פעיל' : 'מושהה'}`.blue);
                    
                } else {
                    const errors = failedChecks.map(check => check.error);
                    displayErrors.push(`${task.name}: ${errors.join(', ')}`);
                    console.log(`     ❌ שגיאות תצוגה: ${errors.join(', ')}`.red);
                }
            }
            
            if (displayErrors.length === 0) {
                this.addTestResult('test3_DashboardDisplay', 'PASS', 'כל המשימות מוצגות נכון בדשבורד');
            } else {
                this.addTestResult('test3_DashboardDisplay', 'FAIL', `שגיאות תצוגה: ${displayErrors.join('; ')}`);
            }
            
        } catch (error) {
            console.error(`   ❌ בדיקה 3 נכשלה:`.red, error.message);
            this.addTestResult('test3_DashboardDisplay', 'FAIL', error.message);
        }
    }

    /**
     * בדיקה 4: עדכון משימה דרך דשבורד
     */
    async test4_UpdateTaskFromDashboard() {
        console.log('\n✏️  בדיקה 4: עדכון משימה דרך דשבורד'.yellow.bold);
        
        if (this.testTasks.length === 0) {
            console.log('   ⚠️  אין משימות בדיקה לעדכון'.yellow);
            this.addTestResult('test4_UpdateTaskFromDashboard', 'SKIP', 'אין משימות בדיקה');
            return;
        }
        
        const taskId = this.testTasks[0];
        
        try {
            // עדכון המשימה
            const updatedData = {
                name: `${TEST_CONFIG.testTaskPrefix}עודכן_ערב`,
                cron_expression: '0 20 * * *',  // שינוי מ-8:00 ל-20:00
                action_type: 'weekly_summary',
                target_groups: ['קבוצה מעודכנת', 'קבוצה נוספת'],
                send_to_group: 'ניצן'
            };
            
            // קבלת הנתונים הנוכחיים לפני העדכון
            const beforeTasks = await this.configService.getWebTasks();
            const beforeTask = beforeTasks.find(t => t.id === taskId);
            
            console.log(`   📝 עדכון משימה ID: ${taskId}`.blue);
            console.log(`   🔄 שינוי זמן: ${this.humanizeCron(beforeTask.cron_expression)} → ${this.humanizeCron(updatedData.cron_expression)}`.cyan);
            
            // ביצוע העדכון (כמו בדשבורד)
            const updateResult = await this.configService.updateWebTask(taskId, updatedData);
            
            if (!updateResult.success) {
                throw new Error(`עדכון נכשל: ${updateResult.error}`);
            }
            
            console.log(`   ✅ עדכון במסד נתונים הושלם`.green);
            
            // המתנה לסנכרון
            await this.sleep(1000);
            
            // בדיקה שהקובץ עודכן
            const filePath = path.join(TEST_CONFIG.schedulesPath, `web-task-${taskId}.txt`);
            const updatedFileContent = await fs.readFile(filePath, 'utf8');
            
            console.log(`   📄 תוכן קובץ מעודכן:\n${updatedFileContent.trim()}`.blue);
            
            // בדיקה שהשינויים נשמרו בקובץ
            const syncCheck = await this.verifyFileContent(updatedFileContent, updatedData);
            
            if (syncCheck) {
                this.addTestResult('test4_UpdateTaskFromDashboard', 'PASS', 'עדכון דרך דשבורד עבד בהצלחה');
            } else {
                this.addTestResult('test4_UpdateTaskFromDashboard', 'FAIL', 'הקובץ לא עודכן נכון');
            }
            
        } catch (error) {
            console.error(`   ❌ בדיקה 4 נכשלה:`.red, error.message);
            this.addTestResult('test4_UpdateTaskFromDashboard', 'FAIL', error.message);
        }
    }

    /**
     * בדיקה 5: עדכון קובץ וסנכרון לדשבורד
     */
    async test5_UpdateFileSync() {
        console.log('\n📁 בדיקה 5: עדכון קובץ טקסט וסנכרון לדשבורד'.yellow.bold);
        
        if (this.testTasks.length === 0) {
            console.log('   ⚠️  אין משימות בדיקה לעדכון קובץ'.yellow);
            this.addTestResult('test5_UpdateFileSync', 'SKIP', 'אין משימות בדיקה');
            return;
        }
        
        const taskId = this.testTasks[0];
        const filePath = path.join(TEST_CONFIG.schedulesPath, `web-task-${taskId}.txt`);
        
        try {
            console.log(`   📝 עדכון ידני של קובץ: ${filePath}`.blue);
            
            // יצירת תוכן קובץ חדש
            const newFileContent = `# תזמון משימה - עדכון ידני
NAME=${TEST_CONFIG.testTaskPrefix}עדכון_מקובץ
TYPE=scheduled
CRON=0 22 * * *
ACTION=daily_summary
TARGETS=קבוצה מהקובץ,קבוצה נוספת מהקובץ
SEND_TO=ניצן
ACTIVE=1

# עודכן ידנית בבדיקה
# ${new Date().toISOString()}
`;
            
            // כתיבת הקובץ
            await fs.writeFile(filePath, newFileContent, 'utf8');
            console.log(`   ✅ קובץ עודכן ידנית`.green);
            console.log(`   📄 תוכן חדש:\n${newFileContent.trim()}`.blue);
            
            // הדמיה של סנכרון (בפועל זה יקרה על ידי file watcher)
            // כאן נבדוק האם המערכת תזהה את השינוי
            console.log(`   🔄 מדמה סנכרון קובץ למסד נתונים...`.cyan);
            
            // בדיקה עתידית: כאן נוסיף קוד שיקרא את הקובץ ויעדכן את מסד הנתונים
            // לעת עתה, נסמן שהבדיקה מוכנה לפיתוח
            
            this.addTestResult('test5_UpdateFileSync', 'PENDING', 'מוכן לפיתוח - צריך file watcher');
            
        } catch (error) {
            console.error(`   ❌ בדיקה 5 נכשלה:`.red, error.message);
            this.addTestResult('test5_UpdateFileSync', 'FAIL', error.message);
        }
    }

    /**
     * בדיקה 6: בדיקת תקינות פורמטי CRON
     */
    async test6_CronValidation() {
        console.log('\n⏰ בדיקה 6: בדיקת פורמטי CRON שונים'.yellow.bold);
        
        const testCases = [
            { cron: '0 8 * * *', name: 'יומי 8:00', valid: true },
            { cron: '30 16 * * 1-5', name: 'ימי חול 16:30', valid: true },
            { cron: '0 22 * * 0', name: 'ראשון 22:00', valid: true },
            { cron: '*/15 * * * *', name: 'כל 15 דקות', valid: true },
            { cron: '0 8,12,18 * * *', name: '3 פעמים ביום', valid: true },
            { cron: 'invalid cron', name: 'CRON לא תקין', valid: false }
        ];
        
        let cronErrors = [];
        
        for (const testCase of testCases) {
            try {
                console.log(`   🔍 בודק: ${testCase.name} (${testCase.cron})`.cyan);
                
                const testTask = {
                    name: `${TEST_CONFIG.testTaskPrefix}cron_test_${Date.now()}`,
                    task_type: 'scheduled',
                    cron_expression: testCase.cron,
                    action_type: 'daily_summary',
                    target_groups: ['בדיקת CRON'],
                    send_to_group: 'ניצן'
                };
                
                const result = await this.configService.createWebTask(testTask);
                
                if (testCase.valid && result.success) {
                    console.log(`     ✅ CRON תקין התקבל`.green);
                    this.testTasks.push(result.taskId);
                    
                } else if (!testCase.valid && !result.success) {
                    console.log(`     ✅ CRON לא תקין נדחה כצפוי`.green);
                    
                } else {
                    throw new Error(`תוצאה לא צפויה: expected ${testCase.valid ? 'valid' : 'invalid'}`);
                }
                
            } catch (error) {
                cronErrors.push(`${testCase.name}: ${error.message}`);
                console.log(`     ❌ ${error.message}`.red);
            }
        }
        
        if (cronErrors.length === 0) {
            this.addTestResult('test6_CronValidation', 'PASS', 'כל פורמטי CRON התנהגו כצפוי');
        } else {
            this.addTestResult('test6_CronValidation', 'FAIL', `שגיאות: ${cronErrors.join('; ')}`);
        }
    }

    /**
     * ניקוי משימות בדיקה
     */
    async cleanup() {
        if (!TEST_CONFIG.cleanup) {
            console.log('\n🚫 ניקוי מבוטל לפי הגדרות'.yellow);
            return;
        }
        
        console.log('\n🧹 מנקה משימות בדיקה...'.cyan.bold);
        
        let cleanupErrors = [];
        
        for (const taskId of this.testTasks) {
            try {
                // מחיקת המשימה ממסד הנתונים
                await this.configService.deleteWebTask(taskId);
                
                // מחיקת הקובץ
                const filePath = path.join(TEST_CONFIG.schedulesPath, `web-task-${taskId}.txt`);
                try {
                    await fs.unlink(filePath);
                    console.log(`   🗑️  נמחק: ${filePath}`.gray);
                } catch (fileError) {
                    // אם הקובץ לא קיים, זה לא משנה
                }
                
            } catch (error) {
                cleanupErrors.push(`Task ${taskId}: ${error.message}`);
            }
        }
        
        if (cleanupErrors.length === 0) {
            console.log(`   ✅ ניקוי הושלם (${this.testTasks.length} משימות נמחקו)`.green);
        } else {
            console.log(`   ⚠️  שגיאות ניקוי: ${cleanupErrors.join('; ')}`.yellow);
        }
    }

    /**
     * דו"ח סיכום
     */
    printSummary() {
        console.log('\n📊 סיכום בדיקות'.cyan.bold);
        console.log('='.repeat(60).gray);
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const pending = this.testResults.filter(r => r.status === 'PENDING').length;
        const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
        
        console.log(`✅ עברו: ${passed}`.green.bold);
        console.log(`❌ נכשלו: ${failed}`.red.bold);
        console.log(`⏳ ממתינות לפיתוח: ${pending}`.yellow.bold);
        console.log(`⏭️  דולגו: ${skipped}`.gray.bold);
        console.log(`📋 סה"כ: ${this.testResults.length}`.blue.bold);
        
        console.log('\n📋 פירוט תוצאות:'.cyan.bold);
        for (const result of this.testResults) {
            const icon = {
                'PASS': '✅',
                'FAIL': '❌', 
                'PENDING': '⏳',
                'SKIP': '⏭️'
            }[result.status];
            
            const color = {
                'PASS': 'green',
                'FAIL': 'red',
                'PENDING': 'yellow', 
                'SKIP': 'gray'
            }[result.status];
            
            console.log(`${icon} ${result.testName}: ${result.message}`[color]);
        }
        
        // המלצות
        if (failed > 0) {
            console.log('\n🔧 נדרשים תיקונים לפני עליה לפרודקשן!'.red.bold);
        } else if (pending > 0) {
            console.log('\n🚀 מוכן לפרודקשן - יש עוד תכונות לפיתוח'.yellow.bold);
        } else {
            console.log('\n🎉 מערכת מוכנה ומתפקדת במלואה!'.green.bold);
        }
    }

    /**
     * הרצת כל הבדיקות
     */
    async runAllTests() {
        await this.init();
        
        try {
            await this.test1_CreateTaskSavesToFile();
            await this.test2_DashboardFileSync();
            await this.test3_DashboardDisplay();
            await this.test4_UpdateTaskFromDashboard();
            await this.test5_UpdateFileSync();
            await this.test6_CronValidation();
            
        } finally {
            await this.cleanup();
            this.printSummary();
            await this.db.close();
        }
    }

    // === Helper Functions ===

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    addTestResult(testName, status, message) {
        this.testResults.push({ testName, status, message });
    }

    /**
     * בדיקת תוכן קובץ מול נתוני משימה
     */
    async verifyFileContent(fileContent, taskData) {
        const requiredFields = [
            { field: 'NAME', value: taskData.name },
            { field: 'CRON', value: taskData.cron_expression },
            { field: 'ACTION', value: taskData.action_type }
        ];
        
        for (const { field, value } of requiredFields) {
            if (!fileContent.includes(`${field}=${value}`)) {
                throw new Error(`שדה ${field} לא נמצא בקובץ או לא תואם`);
            }
        }
        
        return true;
    }

    /**
     * בדיקת סנכרון בין משימה לקובץ
     */
    async verifyTaskFileSync(task, fileContent) {
        const errors = [];
        
        // בדיקת שם
        if (!fileContent.includes(`NAME=${task.name}`)) {
            errors.push('שם לא תואם');
        }
        
        // בדיקת CRON
        if (!fileContent.includes(`CRON=${task.cron_expression}`)) {
            errors.push('תזמון CRON לא תואם');
        }
        
        // בדיקת פעולה
        if (!fileContent.includes(`ACTION=${task.action_type}`)) {
            errors.push('סוג פעולה לא תואם');
        }
        
        // בדיקת קבוצות (אם זה מערך, לבדוק כל אחת)
        if (Array.isArray(task.target_groups)) {
            const targetsString = task.target_groups.join(',');
            if (!fileContent.includes(`TARGETS=${targetsString}`)) {
                errors.push('קבוצות יעד לא תואמות');
            }
        }
        
        return {
            success: errors.length === 0,
            errors
        };
    }

    /**
     * המרת CRON לטקסט בעברית (בסיסי)
     */
    humanizeCron(cron) {
        const patterns = {
            '0 8 * * *': 'כל יום ב-8:00',
            '0 20 * * *': 'כל יום ב-20:00', 
            '0 22 * * *': 'כל יום ב-22:00',
            '30 16 * * 1-5': 'ימי חול ב-16:30',
            '0 22 * * 0': 'יום ראשון ב-22:00',
            '*/15 * * * *': 'כל 15 דקות',
            '0 8,12,18 * * *': '3 פעמים ביום (8:00, 12:00, 18:00)'
        };
        
        return patterns[cron] || cron;
    }
}

// הרצת הבדיקות
if (require.main === module) {
    const tester = new DashboardSyncTester();
    
    tester.runAllTests()
        .then(() => {
            console.log('\n🏁 בדיקות הושלמו'.green.bold);
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 כשל קריטי:'.red.bold, error.message);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = DashboardSyncTester;