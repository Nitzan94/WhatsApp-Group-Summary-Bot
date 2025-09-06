# 🧪 אסטרטגיית בדיקות למערכת התזמון החדשה

## 📋 סקירה כללית

מסמך מקיף המגדיר את כל סוגי הבדיקות הנדרשים להבטיח פעילות תקינה של מערכת התזמון החדשה מבוססת ה-DB.

## 🏗️ פירמידת הבדיקות

```
                    🔺 E2E Tests
                 🔺 Integration Tests  
              🔺 Component Tests
           🔺 Unit Tests (בסיס רחב)
```

### **70% Unit Tests** - בדיקות יחידה מפורטות
### **20% Integration Tests** - בדיקות אינטגרציה
### **8% Component Tests** - בדיקות רכיבים
### **2% E2E Tests** - בדיקות מקצה לקצה

## 🎯 בדיקות יחידה (Unit Tests)

### 1. **DatabaseManager Tests**

**קובץ:** `tests/unit/DatabaseManager.test.js`

```javascript
describe('DatabaseManager - Scheduled Tasks', () => {
  describe('createScheduledTask()', () => {
    it('should create task with valid data', async () => {
      const taskData = {
        name: 'Test Task',
        action_type: 'daily_summary',
        target_groups: ['Group 1'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target Group'
      };
      
      const result = await db.createScheduledTask(taskData);
      
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Task');
    });

    it('should reject duplicate task names', async () => {
      // Create first task
      await db.createScheduledTask({
        name: 'Duplicate Task',
        action_type: 'daily_summary',
        target_groups: ['Group 1'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target'
      });

      // Attempt to create duplicate
      await expect(db.createScheduledTask({
        name: 'Duplicate Task', // Same name
        action_type: 'weekly_summary',
        target_groups: ['Group 2'],
        cron_expression: '0 18 * * 0',
        send_to_group: 'Target'
      })).rejects.toThrow('Task name already exists');
    });

    it('should validate action_type values', async () => {
      const invalidTask = {
        name: 'Invalid Task',
        action_type: 'invalid_action',
        target_groups: ['Group 1'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target'
      };

      await expect(db.createScheduledTask(invalidTask))
        .rejects.toThrow('Invalid action_type');
    });

    it('should validate cron expression format', async () => {
      const invalidCronTask = {
        name: 'Bad Cron Task',
        action_type: 'daily_summary',
        target_groups: ['Group 1'],
        cron_expression: '60 25 * * *', // Invalid: minutes=60, hours=25
        send_to_group: 'Target'
      };

      await expect(db.createScheduledTask(invalidCronTask))
        .rejects.toThrow('Invalid cron expression');
    });
  });

  describe('updateScheduledTask()', () => {
    it('should update existing task', async () => {
      const originalTask = await db.createScheduledTask({
        name: 'Update Test',
        action_type: 'daily_summary',
        target_groups: ['Original Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Original Target'
      });

      const updated = await db.updateScheduledTask(originalTask.id, {
        action_type: 'weekly_summary',
        cron_expression: '0 18 * * 0'
      });

      expect(updated.action_type).toBe('weekly_summary');
      expect(updated.cron_expression).toBe('0 18 * * 0');
      expect(updated.target_groups).toEqual(['Original Group']); // Unchanged
    });

    it('should update updated_at timestamp', async () => {
      const task = await db.createScheduledTask({
        name: 'Timestamp Test',
        action_type: 'daily_summary',
        target_groups: ['Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target'
      });

      const originalTimestamp = task.updated_at;
      
      // Wait 1ms to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const updated = await db.updateScheduledTask(task.id, {
        name: 'Updated Timestamp Test'
      });

      expect(new Date(updated.updated_at)).toBeGreaterThan(new Date(originalTimestamp));
    });
  });

  describe('getScheduledTasks()', () => {
    it('should return all active tasks by default', async () => {
      await db.createScheduledTask({
        name: 'Active Task',
        action_type: 'daily_summary',
        target_groups: ['Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target',
        active: true
      });

      await db.createScheduledTask({
        name: 'Inactive Task',
        action_type: 'weekly_summary',
        target_groups: ['Group'],
        cron_expression: '0 18 * * 0',
        send_to_group: 'Target',
        active: false
      });

      const tasks = await db.getScheduledTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('Active Task');
    });

    it('should filter by action_type', async () => {
      await db.createScheduledTask({
        name: 'Daily Task',
        action_type: 'daily_summary',
        target_groups: ['Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target'
      });

      await db.createScheduledTask({
        name: 'Weekly Task',
        action_type: 'weekly_summary',
        target_groups: ['Group'],
        cron_expression: '0 18 * * 0',
        send_to_group: 'Target'
      });

      const dailyTasks = await db.getScheduledTasks({ action_type: 'daily_summary' });
      expect(dailyTasks).toHaveLength(1);
      expect(dailyTasks[0].name).toBe('Daily Task');
    });
  });

  describe('logTaskExecution()', () => {
    it('should create execution log with all fields', async () => {
      const task = await db.createScheduledTask({
        name: 'Log Test Task',
        action_type: 'daily_summary',
        target_groups: ['Test Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Target'
      });

      const logData = {
        task_id: task.id,
        ai_query: 'Test query',
        ai_response: 'Test response',
        tools_used: ['search_groups', 'get_recent_messages'],
        success: true,
        total_execution_time: 2500
      };

      const log = await db.logTaskExecution(logData);
      
      expect(log.task_id).toBe(task.id);
      expect(log.ai_query).toBe('Test query');
      expect(log.success).toBe(true);
      expect(log.execution_start).toBeDefined();
    });
  });
});
```

### 2. **TaskExecutionService Tests**

**קובץ:** `tests/unit/TaskExecutionService.test.js`

```javascript
describe('TaskExecutionService', () => {
  let taskExecutionService;
  let mockConversationHandler;
  let mockDb;
  let mockBot;

  beforeEach(() => {
    mockConversationHandler = {
      processNaturalQuery: jest.fn()
    };
    mockDb = {
      getScheduledTask: jest.fn(),
      logTaskExecution: jest.fn(),
      updateScheduledTask: jest.fn()
    };
    mockBot = {
      socket: {
        sendMessage: jest.fn()
      }
    };

    taskExecutionService = new TaskExecutionService(
      mockDb, 
      mockConversationHandler, 
      mockBot
    );
  });

  describe('executeTask()', () => {
    it('should execute daily summary task successfully', async () => {
      const task = {
        id: 1,
        name: 'Test Daily Summary',
        action_type: 'daily_summary',
        target_groups: ['Test Group'],
        send_to_group: 'Target Group'
      };

      mockDb.getScheduledTask.mockResolvedValue(task);
      mockConversationHandler.processNaturalQuery.mockResolvedValue({
        success: true,
        response: 'Daily summary response from AI'
      });

      const result = await taskExecutionService.executeTask(1);

      expect(result.success).toBe(true);
      expect(mockConversationHandler.processNaturalQuery).toHaveBeenCalledWith(
        expect.stringContaining('תסכם לי מה היה היום בקבוצת "Test Group"'),
        null,
        'system',
        true
      );
      expect(mockDb.logTaskExecution).toHaveBeenCalled();
    });

    it('should handle custom query task', async () => {
      const task = {
        id: 2,
        name: 'Custom Query Task',
        action_type: 'custom_query',
        custom_query: 'מה הנושאים הכי פופולריים השבוע?',
        target_groups: ['AI Group'],
        send_to_group: 'Results Group'
      };

      mockDb.getScheduledTask.mockResolvedValue(task);
      mockConversationHandler.processNaturalQuery.mockResolvedValue({
        success: true,
        response: 'Custom query response'
      });

      const result = await taskExecutionService.executeTask(2);

      expect(mockConversationHandler.processNaturalQuery).toHaveBeenCalledWith(
        'מה הנושאים הכי פופולריים השבוע? בקבוצת "AI Group"',
        null,
        'system',
        true
      );
      expect(result.success).toBe(true);
    });

    it('should handle AI failure gracefully', async () => {
      const task = {
        id: 3,
        name: 'Failing Task',
        action_type: 'daily_summary',
        target_groups: ['Test Group'],
        send_to_group: 'Target'
      };

      mockDb.getScheduledTask.mockResolvedValue(task);
      mockConversationHandler.processNaturalQuery.mockResolvedValue({
        success: false,
        error: 'AI service unavailable'
      });

      const result = await taskExecutionService.executeTask(3);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI service unavailable');
      expect(mockDb.logTaskExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error_message: expect.stringContaining('AI service unavailable')
        })
      );
    });

    it('should retry on failure if configured', async () => {
      const task = {
        id: 4,
        name: 'Retry Task',
        action_type: 'daily_summary',
        target_groups: ['Test Group'],
        send_to_group: 'Target',
        max_retries: 2
      };

      mockDb.getScheduledTask.mockResolvedValue(task);
      mockConversationHandler.processNaturalQuery
        .mockResolvedValueOnce({ success: false, error: 'Temporary failure' })
        .mockResolvedValueOnce({ success: true, response: 'Success on retry' });

      const result = await taskExecutionService.executeTask(4);

      expect(result.success).toBe(true);
      expect(mockConversationHandler.processNaturalQuery).toHaveBeenCalledTimes(2);
      expect(mockDb.logTaskExecution).toHaveBeenCalledTimes(2); // Log each attempt
    });
  });

  describe('buildNaturalQuery()', () => {
    it('should build daily summary query correctly', () => {
      const query = taskExecutionService.buildNaturalQuery('daily_summary', ['AI Group'], null);
      expect(query).toBe('תסכם לי מה היה היום בקבוצת "AI Group"');
    });

    it('should build custom query with group context', () => {
      const query = taskExecutionService.buildNaturalQuery(
        'custom_query', 
        ['Tech Group'], 
        'מה הטכנולוגיות החדשות שדיברו עליהן?'
      );
      expect(query).toBe('מה הטכנולוגיות החדשות שדיברו עליהן? בקבוצת "Tech Group"');
    });

    it('should handle multiple target groups', () => {
      const query = taskExecutionService.buildNaturalQuery(
        'daily_summary', 
        ['Group 1', 'Group 2'], 
        null
      );
      expect(query).toBe('תסכם לי מה היה היום בקבוצות "Group 1", "Group 2"');
    });
  });
});
```

### 3. **SchedulerService Tests**

**קובץ:** `tests/unit/SchedulerService.test.js`

```javascript
describe('SchedulerService - Database Integration', () => {
  let schedulerService;
  let mockDb;
  let mockCron;

  beforeEach(() => {
    mockDb = {
      getScheduledTasks: jest.fn(),
      updateScheduledTask: jest.fn()
    };

    mockCron = {
      schedule: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn()
      })),
      validate: jest.fn()
    };

    jest.doMock('node-cron', () => mockCron);

    const SchedulerService = require('../../../src/services/SchedulerService');
    schedulerService = new SchedulerService(mockBot, mockDb, mockConversationHandler);
  });

  describe('loadSchedulesFromDatabase()', () => {
    it('should load active tasks and create cron jobs', async () => {
      const mockTasks = [
        {
          id: 1,
          name: 'Daily Task',
          cron_expression: '0 16 * * *',
          active: true
        },
        {
          id: 2,
          name: 'Weekly Task', 
          cron_expression: '0 18 * * 0',
          active: true
        }
      ];

      mockDb.getScheduledTasks.mockResolvedValue(mockTasks);
      mockCron.validate.mockReturnValue(true);

      await schedulerService.loadSchedulesFromDatabase();

      expect(mockCron.schedule).toHaveBeenCalledTimes(2);
      expect(schedulerService.activeCronJobs.size).toBe(2);
    });

    it('should skip invalid cron expressions', async () => {
      const mockTasks = [
        {
          id: 1,
          name: 'Valid Task',
          cron_expression: '0 16 * * *',
          active: true
        },
        {
          id: 2,
          name: 'Invalid Task',
          cron_expression: 'invalid cron',
          active: true
        }
      ];

      mockDb.getScheduledTasks.mockResolvedValue(mockTasks);
      mockCron.validate
        .mockReturnValueOnce(true)  // Valid task
        .mockReturnValueOnce(false); // Invalid task

      await schedulerService.loadSchedulesFromDatabase();

      expect(mockCron.schedule).toHaveBeenCalledTimes(1);
      expect(schedulerService.activeCronJobs.size).toBe(1);
    });
  });

  describe('syncCronJobsWithDatabase()', () => {
    it('should add new tasks from database', async () => {
      // Initial state: one job running
      schedulerService.activeCronJobs.set(1, { stop: jest.fn() });

      // Database now has two tasks
      const updatedTasks = [
        { id: 1, name: 'Existing Task', cron_expression: '0 16 * * *', active: true },
        { id: 2, name: 'New Task', cron_expression: '0 18 * * *', active: true }
      ];

      mockDb.getScheduledTasks.mockResolvedValue(updatedTasks);
      mockCron.validate.mockReturnValue(true);

      await schedulerService.syncCronJobsWithDatabase();

      expect(mockCron.schedule).toHaveBeenCalledTimes(1); // Only new task
      expect(schedulerService.activeCronJobs.size).toBe(2);
    });

    it('should remove deleted tasks', async () => {
      // Initial state: two jobs running
      const mockJob1 = { stop: jest.fn() };
      const mockJob2 = { stop: jest.fn() };
      schedulerService.activeCronJobs.set(1, mockJob1);
      schedulerService.activeCronJobs.set(2, mockJob2);

      // Database now has only one task
      const updatedTasks = [
        { id: 1, name: 'Remaining Task', cron_expression: '0 16 * * *', active: true }
      ];

      mockDb.getScheduledTasks.mockResolvedValue(updatedTasks);

      await schedulerService.syncCronJobsWithDatabase();

      expect(mockJob2.stop).toHaveBeenCalled();
      expect(schedulerService.activeCronJobs.size).toBe(1);
      expect(schedulerService.activeCronJobs.has(1)).toBe(true);
      expect(schedulerService.activeCronJobs.has(2)).toBe(false);
    });
  });
});
```

## 🔗 בדיקות אינטגרציה (Integration Tests)

### 1. **Database Integration Tests**

**קובץ:** `tests/integration/database.test.js`

```javascript
describe('Database Integration - Full Flow', () => {
  let db;
  let testDbPath;

  beforeEach(async () => {
    // Create temporary test database
    testDbPath = path.join(__dirname, `test-${Date.now()}.db`);
    db = new DatabaseManager(testDbPath);
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
    await fs.unlink(testDbPath).catch(() => {}); // Clean up
  });

  it('should handle complete task lifecycle', async () => {
    // 1. Create task
    const taskData = {
      name: 'Integration Test Task',
      action_type: 'daily_summary',
      target_groups: ['Test Group'],
      cron_expression: '0 16 * * *',
      send_to_group: 'Results Group'
    };

    const createdTask = await db.createScheduledTask(taskData);
    expect(createdTask.id).toBeDefined();

    // 2. Execute task and log results
    const executionLog = {
      task_id: createdTask.id,
      ai_query: 'Integration test query',
      ai_response: 'Integration test response',
      tools_used: ['search_groups', 'get_recent_messages'],
      success: true,
      total_execution_time: 3000
    };

    await db.logTaskExecution(executionLog);

    // 3. Update task after execution
    await db.updateScheduledTask(createdTask.id, {
      last_execution: new Date().toISOString(),
      next_execution: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });

    // 4. Verify all data is correctly stored and related
    const task = await db.getScheduledTask(createdTask.id);
    const logs = await db.getTaskExecutionLogs(createdTask.id);

    expect(task.last_execution).toBeDefined();
    expect(logs).toHaveLength(1);
    expect(logs[0].success).toBe(true);
  });

  it('should handle concurrent task operations', async () => {
    // Create multiple tasks concurrently
    const taskPromises = Array.from({ length: 5 }, (_, i) =>
      db.createScheduledTask({
        name: `Concurrent Task ${i}`,
        action_type: 'daily_summary',
        target_groups: [`Group ${i}`],
        cron_expression: '0 16 * * *',
        send_to_group: 'Results'
      })
    );

    const tasks = await Promise.all(taskPromises);
    expect(tasks).toHaveLength(5);

    // All tasks should have unique IDs
    const ids = tasks.map(t => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });
});
```

### 2. **API Integration Tests**

**קובץ:** `tests/integration/api.test.js`

```javascript
describe('API Integration Tests', () => {
  let app;
  let server;
  let db;

  beforeAll(async () => {
    // Setup test database and web server
    db = new DatabaseManager(':memory:');
    await db.initialize();

    const WebServer = require('../../src/web/WebServer');
    const webServer = new WebServer(mockBot, db, mockConfigService);
    server = await webServer.start();
    app = webServer.app;
  });

  afterAll(async () => {
    await server.close();
    await db.close();
  });

  describe('Task Management API', () => {
    it('should create task via POST /api/tasks', async () => {
      const taskData = {
        name: 'API Test Task',
        task_type: 'scheduled',
        action_type: 'daily_summary',
        target_groups: ['API Test Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Results'
      };

      const response = await request(app)
        .post('/api/tasks')
        .send(taskData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();

      // Verify task was created in database
      const task = await db.getScheduledTask(response.body.data.id);
      expect(task.name).toBe('API Test Task');
    });

    it('should retrieve tasks via GET /api/tasks', async () => {
      // Create test tasks
      await db.createScheduledTask({
        name: 'API Get Test 1',
        action_type: 'daily_summary',
        target_groups: ['Group 1'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Results'
      });

      await db.createScheduledTask({
        name: 'API Get Test 2',
        action_type: 'weekly_summary', 
        target_groups: ['Group 2'],
        cron_expression: '0 18 * * 0',
        send_to_group: 'Results'
      });

      const response = await request(app)
        .get('/api/tasks')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.scheduled.length).toBeGreaterThanOrEqual(2);
    });

    it('should update task via PUT /api/tasks/:id', async () => {
      const task = await db.createScheduledTask({
        name: 'Update API Test',
        action_type: 'daily_summary',
        target_groups: ['Original Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Results'
      });

      const updateData = {
        name: 'Updated API Test',
        action_type: 'weekly_summary'
      };

      const response = await request(app)
        .put(`/api/tasks/${task.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify update in database
      const updatedTask = await db.getScheduledTask(task.id);
      expect(updatedTask.name).toBe('Updated API Test');
      expect(updatedTask.action_type).toBe('weekly_summary');
    });

    it('should delete task via DELETE /api/tasks/:id', async () => {
      const task = await db.createScheduledTask({
        name: 'Delete API Test',
        action_type: 'daily_summary',
        target_groups: ['Test Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Results'
      });

      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(200);

      // Verify task no longer exists
      const deletedTask = await db.getScheduledTask(task.id);
      expect(deletedTask).toBeNull();
    });
  });
});
```

## 🎭 בדיקות רכיבים (Component Tests)

### 1. **Task Component Tests**

**קובץ:** `tests/component/TasksComponent.test.js`

```javascript
describe('TasksComponent', () => {
  let container;
  let tasksComponent;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="scheduled-tasks-list"></div>
      <div id="one-time-tasks-list"></div>
      <button id="add-scheduled-task-btn">Add Task</button>
      <div id="modals"></div>
    `;

    // Mock API
    window.API = {
      getTasks: jest.fn(),
      createTask: jest.fn(),
      updateTask: jest.fn(),
      deleteTask: jest.fn(),
      executeTask: jest.fn()
    };

    tasksComponent = new TasksComponent();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.API;
  });

  describe('Task Display', () => {
    it('should render scheduled tasks correctly', async () => {
      const mockTasks = {
        scheduled: [
          {
            id: 1,
            name: 'Test Daily Task',
            action_type: 'daily_summary',
            target_groups: ['AI Group', 'Tech Group'],
            cron_expression: '0 16 * * *',
            active: true,
            next_run: '2025-09-07T16:00:00Z'
          }
        ],
        oneTime: []
      };

      window.API.getTasks.mockResolvedValue({
        success: true,
        data: mockTasks
      });

      await tasksComponent.loadTasks();

      const scheduledContainer = document.getElementById('scheduled-tasks-list');
      expect(scheduledContainer.innerHTML).toContain('Test Daily Task');
      expect(scheduledContainer.innerHTML).toContain('AI Group');
      expect(scheduledContainer.innerHTML).toContain('Tech Group');
      expect(scheduledContainer.innerHTML).toContain('פעיל');
    });

    it('should show empty state when no tasks exist', async () => {
      window.API.getTasks.mockResolvedValue({
        success: true,
        data: { scheduled: [], oneTime: [] }
      });

      await tasksComponent.loadTasks();

      const scheduledContainer = document.getElementById('scheduled-tasks-list');
      expect(scheduledContainer.innerHTML).toContain('אין משימות מתוזמנות');
    });
  });

  describe('Task Creation', () => {
    it('should show create task modal when button clicked', () => {
      const addButton = document.getElementById('add-scheduled-task-btn');
      addButton.click();

      const modal = document.querySelector('#add-task-modal');
      expect(modal).toBeTruthy();
      expect(modal.innerHTML).toContain('הוסף משימה מתוזמנת');
    });

    it('should create task with valid form data', async () => {
      // Show modal
      tasksComponent.showAddTaskModal('scheduled');

      // Fill form
      document.getElementById('task-name').value = 'New Test Task';
      document.getElementById('task-action').value = 'daily_summary';
      document.getElementById('task-targets').value = 'Test Group 1, Test Group 2';
      document.getElementById('task-send-to').value = 'Results Group';
      
      // Set up scheduler
      document.querySelector('input[name="schedule-type"][value="daily"]').checked = true;
      document.getElementById('daily-time').value = '18:00';

      window.API.createTask.mockResolvedValue({
        success: true,
        message: 'Task created successfully'
      });

      // Submit form
      await tasksComponent.saveTask('scheduled');

      expect(window.API.createTask).toHaveBeenCalledWith({
        name: 'New Test Task',
        task_type: 'scheduled',
        action_type: 'daily_summary',
        target_groups: ['Test Group 1', 'Test Group 2'],
        send_to_group: 'Results Group',
        cron_expression: '0 18 * * *'
      });
    });
  });

  describe('Task Actions', () => {
    it('should toggle task active status', async () => {
      window.API.updateTask.mockResolvedValue({
        success: true,
        message: 'Task updated'
      });

      await tasksComponent.toggleTask(1, false);

      expect(window.API.updateTask).toHaveBeenCalledWith(1, { active: false });
    });

    it('should execute task immediately', async () => {
      // Mock confirm dialog
      global.confirm = jest.fn(() => true);
      
      window.API.executeTask.mockResolvedValue({
        success: true,
        message: 'Task executed'
      });

      await tasksComponent.executeTask(1);

      expect(window.API.executeTask).toHaveBeenCalledWith(1);
    });
  });
});
```

## 🌐 בדיקות מקצה לקצה (E2E Tests)

### 1. **Full Workflow E2E Test**

**קובץ:** `tests/e2e/full-workflow.test.js`

```javascript
describe('Complete Task Workflow E2E', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should complete full task lifecycle', async () => {
    // 1. Navigate to dashboard
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#scheduled-tasks-list');

    // 2. Create new task
    await page.click('#add-scheduled-task-btn');
    await page.waitForSelector('#add-task-modal');

    // Fill form
    await page.type('#task-name', 'E2E Test Task');
    await page.select('#task-action', 'daily_summary');
    await page.type('#task-targets', 'E2E Test Group');
    await page.type('#task-send-to', 'E2E Results');

    // Set schedule
    await page.click('input[name="schedule-type"][value="daily"]');
    await page.type('#daily-time', '16:00');

    // Submit
    await page.click('button[onclick*="saveTask"]');
    
    // Wait for task to appear in list
    await page.waitForFunction(() => 
      document.body.innerText.includes('E2E Test Task')
    );

    // 3. Execute task immediately
    const executeButton = await page.$('button[title="בצע עכשיו"]');
    await executeButton.click();

    // Confirm execution
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 4. Check execution logs
    const logsButton = await page.$('button[title="לוגים"]');
    await logsButton.click();

    await page.waitForSelector('#task-logs-modal');
    
    // Verify log entry was created
    const logsContent = await page.$eval('#task-logs-content', el => el.textContent);
    expect(logsContent).toContain('E2E Test Task');
    
    // 5. Edit task
    await page.click('button[title="ערוך"]');
    await page.waitForSelector('#edit-task-modal');
    
    await page.clear('#edit-task-name');
    await page.type('#edit-task-name', 'E2E Test Task - Edited');
    
    await page.click('button[onclick*="updateTask"]');
    
    // Verify edit
    await page.waitForFunction(() => 
      document.body.innerText.includes('E2E Test Task - Edited')
    );

    // 6. Delete task
    await page.click('button[title="מחק"]');
    
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Verify deletion
    await page.waitForFunction(() => 
      !document.body.innerText.includes('E2E Test Task - Edited')
    );
  });
});
```

## 📊 בדיקות ביצועים (Performance Tests)

### 1. **Load Testing**

**קובץ:** `tests/performance/load.test.js`

```javascript
describe('Performance Tests', () => {
  describe('Database Load', () => {
    it('should handle 100 concurrent task creations', async () => {
      const startTime = Date.now();
      
      const tasks = Array.from({ length: 100 }, (_, i) => 
        db.createScheduledTask({
          name: `Load Test Task ${i}`,
          action_type: 'daily_summary',
          target_groups: [`Group ${i}`],
          cron_expression: '0 16 * * *',
          send_to_group: 'Results'
        })
      );

      const results = await Promise.all(tasks);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should handle large log volume efficiently', async () => {
      const task = await db.createScheduledTask({
        name: 'Log Volume Test',
        action_type: 'daily_summary',
        target_groups: ['Test Group'],
        cron_expression: '0 16 * * *',
        send_to_group: 'Results'
      });

      const logPromises = Array.from({ length: 1000 }, (_, i) =>
        db.logTaskExecution({
          task_id: task.id,
          ai_query: `Log ${i}`,
          ai_response: `Response ${i}`,
          success: true,
          total_execution_time: 2000
        })
      );

      const startTime = Date.now();
      await Promise.all(logPromises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000); // 10 seconds for 1000 logs

      // Verify logs can be retrieved quickly
      const retrieveStart = Date.now();
      const logs = await db.getTaskExecutionLogs(task.id, { limit: 100 });
      const retrieveDuration = Date.now() - retrieveStart;

      expect(logs).toHaveLength(100);
      expect(retrieveDuration).toBeLessThan(500); // 500ms for retrieval
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during task execution', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Execute 50 tasks
      for (let i = 0; i < 50; i++) {
        const task = {
          id: i,
          name: `Memory Test ${i}`,
          action_type: 'daily_summary',
          target_groups: ['Test Group'],
          send_to_group: 'Results'
        };

        await taskExecutionService.executeTask(task.id);
      }

      // Force garbage collection
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
```

## 📈 בדיקות מוניטורינג ותפעול

### 1. **Health Check Tests**

**קובץ:** `tests/monitoring/health.test.js`

```javascript
describe('System Health Monitoring', () => {
  it('should respond to health check endpoint', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should detect database connectivity issues', async () => {
    // Simulate DB connection issue
    const originalQuery = db.query;
    db.query = jest.fn().mockRejectedValue(new Error('Connection lost'));

    const healthChecker = new HealthChecker(db);
    const result = await healthChecker.checkDatabase();

    expect(result.healthy).toBe(false);
    expect(result.error).toContain('Connection lost');

    // Restore
    db.query = originalQuery;
  });

  it('should monitor scheduler service health', async () => {
    const healthChecker = new HealthChecker(db, schedulerService);
    const result = await healthChecker.checkScheduler();

    expect(result.healthy).toBe(true);
    expect(result.activeJobs).toBeGreaterThanOrEqual(0);
  });
});
```

## 🎛️ הרצת הבדיקות

### Test Scripts ב-package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit --coverage",
    "test:integration": "jest tests/integration",
    "test:component": "jest tests/component",
    "test:e2e": "jest tests/e2e --runInBand",
    "test:performance": "jest tests/performance --detectOpenHandles",
    "test:monitoring": "jest tests/monitoring",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --watchAll=false"
  }
}
```

### Jest Configuration

```javascript
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/web/public/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 10000
};
```

## 📊 דוחות איכות

### Coverage Requirements
- **Line Coverage:** מינימום 80%
- **Branch Coverage:** מינימום 75%
- **Function Coverage:** מינימום 85%

### Performance Benchmarks
- **Task Creation:** < 100ms
- **Task Execution:** < 5s
- **Database Queries:** < 50ms
- **API Response:** < 200ms

---

**גרסה:** v5.0-testing  
**תאריך יצירה:** 6 ספטמבר 2025  
**מחבר:** ניצן + Claude Code