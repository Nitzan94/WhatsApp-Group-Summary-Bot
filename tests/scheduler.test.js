const fs = require('fs').promises;
const path = require('path');
const { describe, beforeEach, afterEach, it, expect } = require('@jest/globals');

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
};

const mockDb = {
  getQuery: jest.fn(),
  allQuery: jest.fn(),
  getGroup: jest.fn(),
  getActiveGroups: jest.fn(),
  updateGroupSchedule: jest.fn(),
  cleanOldMessages: jest.fn()
};

const mockBot = {
  socket: {
    sendMessage: jest.fn()
  },
  summaryTargetGroupId: '972546262108-1556219067@g.us'
};

const mockConversationHandler = {
  processNaturalQuery: jest.fn()
};

jest.mock('../src/utils/logger', () => mockLogger);
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn()
  })),
  validate: jest.fn()
}));
jest.mock('chokidar', () => ({
  watch: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn()
  }))
}));

const SchedulerService = require('../src/services/SchedulerService');

describe('Scheduler TDD Tests - Text File Based System', () => {
  let schedulerService;
  let tempSchedulesDir;

  beforeEach(async () => {
    // Create temporary schedules directory
    tempSchedulesDir = path.join(__dirname, 'temp-schedules');
    await fs.mkdir(tempSchedulesDir, { recursive: true });

    // Override schedules path for testing
    schedulerService = new SchedulerService(mockBot, mockDb, mockConversationHandler);
    schedulerService.schedulesPath = tempSchedulesDir;

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up
    await fs.rmdir(tempSchedulesDir, { recursive: true }).catch(() => {});
    if (schedulerService) {
      schedulerService.stopAll();
    }
  });

  describe('Text File Schedule Management', () => {
    
    it('should create a text file when task is created from dashboard', async () => {
      // Arrange - TDD Requirements:
      // 1. Task created in dashboard should be saved to text file in schedules/
      const taskData = {
        name: 'Test Daily Summary',
        groups: ['Test Group 1', 'Test Group 2'],
        action: 'daily_summary',
        schedule: 'every day at 18:00',
        cronExpression: '0 18 * * *',
        sendTo: 'ניצן'
      };

      const expectedFilePath = path.join(tempSchedulesDir, 'web-task-test.txt');

      // Act
      await schedulerService.saveTaskToTextFile(taskData);

      // Assert
      const fileExists = await fs.access(expectedFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const fileContent = await fs.readFile(expectedFilePath, 'utf8');
      expect(fileContent).toContain('Test Daily Summary');
      expect(fileContent).toContain('groups:');
      expect(fileContent).toContain('Test Group 1');
      expect(fileContent).toContain('Test Group 2');
      expect(fileContent).toContain('action: daily_summary');
      expect(fileContent).toContain('schedule: 0 18 * * *');
      expect(fileContent).toContain('send to: ניצן');
    });

    it('should parse text file correctly with all parameters', async () => {
      // Arrange - TDD Requirements:
      // 2. Text file contains all parameters: groups, task, day, hour
      const scheduleContent = `# Test Schedule
# Created by web interface

groups:
AI-ACADEMY BY GUY AGA
קורס דיגיטלי | שימוש פרקטי בכלי AI עם גיא אגא יוני 2025

action: daily_summary
schedule: 0 16 * * *
send to: ניצן

---`;

      const testFile = path.join(tempSchedulesDir, 'test-schedule.txt');
      await fs.writeFile(testFile, scheduleContent);

      // Act
      await schedulerService.loadSchedulesFromFiles();

      // Assert
      const schedules = schedulerService.schedules;
      expect(schedules).toHaveLength(1);
      
      const schedule = schedules[0];
      expect(schedule.groups).toContain('AI-ACADEMY BY GUY AGA');
      expect(schedule.groups).toContain('קורס דיגיטלי | שימוש פרקטי בכלי AI עם גיא אגא יוני 2025');
      expect(schedule.action).toBe('daily_summary');
      expect(schedule.cronExpression).toBe('0 16 * * *');
      expect(schedule.sendTo).toBe('ניצן');
    });

    it('should display task in dashboard exactly once with correct format', async () => {
      // Arrange - TDD Requirements:
      // 3. Task appears in dashboard once: name as title, groups below, schedule type and time below, no next run display, active/inactive status
      const taskData = {
        id: 'test-task-1',
        name: 'Weekly Summary Test',
        groups: ['Group A', 'Group B'],
        action: 'weekly_summary',
        cronExpression: '0 10 * * 0',
        sendTo: 'ניצן',
        active: true
      };

      schedulerService.schedules = [taskData];

      // Act
      const dashboardTasks = schedulerService.getActiveSchedules();

      // Assert
      expect(dashboardTasks).toHaveLength(1);
      
      const displayedTask = dashboardTasks[0];
      expect(displayedTask.name).toBe('Weekly Summary Test');
      expect(displayedTask.groups).toEqual(['Group A', 'Group B']);
      expect(displayedTask.readable).toContain('שבועי');
      expect(displayedTask.readable).toContain('10:00');
      expect(displayedTask.isActive).toBe(true);
      expect(displayedTask.sendTo).toBe('ניצן');
    });

    it('should sync dashboard data exactly with text file data', async () => {
      // Arrange - TDD Requirements:
      // 4. Dashboard data matches text file: hour, schedule, groups exactly
      const scheduleContent = `# Sync Test Schedule

groups:
Test Sync Group 1
Test Sync Group 2

action: today_summary
schedule: 30 14 * * *
send to: Test Target

---`;

      const testFile = path.join(tempSchedulesDir, 'sync-test.txt');
      await fs.writeFile(testFile, scheduleContent);

      // Act
      await schedulerService.loadSchedulesFromFiles();
      const dashboardTasks = schedulerService.getActiveSchedules();

      // Assert - Text file data should match dashboard exactly
      const task = dashboardTasks[0];
      expect(task.groups).toEqual(['Test Sync Group 1', 'Test Sync Group 2']);
      expect(task.cronExpression).toBe('30 14 * * *');
      expect(task.action).toBe('today_summary');
      expect(task.sendTo).toBe('Test Target');
      
      // Verify readable format shows correct time
      expect(task.readable).toContain('14:30');
    });

    it('should update text file when dashboard task is edited', async () => {
      // Arrange - TDD Requirements:
      // 5. Dashboard edits update text file schedule
      const originalContent = `# Original Task

groups:
Original Group

action: daily_summary
schedule: 0 18 * * *
send to: ניצן

---`;

      const testFile = path.join(tempSchedulesDir, 'edit-test.txt');
      await fs.writeFile(testFile, originalContent);
      
      const updatedTaskData = {
        id: 'edit-test',
        name: 'Updated Task',
        groups: ['Updated Group 1', 'Updated Group 2'],
        action: 'weekly_summary',
        cronExpression: '0 16 * * 1',
        sendTo: 'Updated Target'
      };

      // Act
      await schedulerService.updateTaskTextFile('edit-test', updatedTaskData);

      // Assert
      const updatedContent = await fs.readFile(testFile, 'utf8');
      expect(updatedContent).toContain('Updated Group 1');
      expect(updatedContent).toContain('Updated Group 2');
      expect(updatedContent).toContain('action: weekly_summary');
      expect(updatedContent).toContain('schedule: 0 16 * * 1');
      expect(updatedContent).toContain('send to: Updated Target');
      expect(updatedContent).not.toContain('Original Group');
    });

    it('should update dashboard when text file is manually edited', async () => {
      // Arrange - TDD Requirements:
      // 6. Text file edits update dashboard schedule
      const originalContent = `# Manual Edit Test

groups:
Manual Group

action: daily_summary
schedule: 0 20 * * *
send to: ניצן

---`;

      const testFile = path.join(tempSchedulesDir, 'manual-edit-test.txt');
      await fs.writeFile(testFile, originalContent);
      
      // Load initial schedules
      await schedulerService.loadSchedulesFromFiles();
      expect(schedulerService.schedules[0].cronExpression).toBe('0 20 * * *');

      // Act - Manually edit the file
      const editedContent = `# Manual Edit Test

groups:
Manually Edited Group
Second Edited Group

action: weekly_summary
schedule: 30 15 * * 5
send to: Edited Target

---`;

      await fs.writeFile(testFile, editedContent);
      
      // Simulate file watcher trigger
      await schedulerService.loadSchedulesFromFiles();

      // Assert
      const updatedTask = schedulerService.schedules[0];
      expect(updatedTask.groups).toContain('Manually Edited Group');
      expect(updatedTask.groups).toContain('Second Edited Group');
      expect(updatedTask.action).toBe('weekly_summary');
      expect(updatedTask.cronExpression).toBe('30 15 * * 5');
      expect(updatedTask.sendTo).toBe('Edited Target');
    });

    it('should execute tasks according to schedule and log all actions', async () => {
      // Arrange - TDD Requirements:
      // 7. Bot receives tasks and executes on time
      // 8. Logs are saved for schedule and bot actions/tools
      const taskData = {
        id: 'execute-test',
        name: 'Execution Test',
        groups: ['Test Execute Group'],
        action: 'daily_summary',
        cronExpression: '0 18 * * *',
        sendTo: 'ניצן'
      };

      schedulerService.schedules = [taskData];
      
      // Mock successful AI response
      mockConversationHandler.processNaturalQuery.mockResolvedValue({
        success: true,
        response: 'Test summary response from AI Agent'
      });

      // Act
      await schedulerService.executeSchedule(taskData);

      // Assert - Task execution
      expect(mockConversationHandler.processNaturalQuery).toHaveBeenCalledWith(
        expect.stringContaining('תסכם לי מה היה היום בקבוצת "Test Execute Group"'),
        null,
        'system',
        true
      );

      // Assert - Message sending
      expect(mockBot.socket.sendMessage).toHaveBeenCalledWith(
        mockBot.summaryTargetGroupId,
        expect.objectContaining({
          text: expect.stringContaining('תזמון אוטומטי - Execution Test')
        })
      );

      // Assert - Logging (scheduler logger should be called)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('מבצע תזמון: Execution Test')
      );
    });

    it('should handle multiple schedule formats correctly', async () => {
      // Test various CRON formats and user-friendly formats
      const testCases = [
        { input: 'יומי 16:00', expected: '0 16 * * *' },
        { input: 'שבועי ראשון 10:00', expected: '0 10 * * 0' },
        { input: 'חודשי 1 09:00', expected: '0 9 1 * *' },
        { input: '0 18 * * *', expected: '0 18 * * *' }
      ];

      for (const testCase of testCases) {
        // Act
        const result = schedulerService.parseUserSchedule(testCase.input);
        
        // Assert
        expect(result).toBe(testCase.expected);
      }
    });

    it('should handle file system operations safely', async () => {
      // Test error handling for file operations
      const invalidPath = path.join(tempSchedulesDir, 'non-existent', 'test.txt');
      
      // Act & Assert - Should handle missing directory gracefully
      await expect(
        schedulerService.saveTaskToTextFile({
          name: 'Test',
          filePath: invalidPath
        })
      ).rejects.toThrow();
    });

    it('should validate task data before saving to text file', async () => {
      // Test data validation
      const invalidTaskData = {
        // Missing required fields
        name: '',
        groups: [],
        action: 'invalid_action'
      };

      // Act & Assert
      await expect(
        schedulerService.validateAndSaveTask(invalidTaskData)
      ).rejects.toThrow('Invalid task data');
    });

  });

  describe('Integration with Bot System', () => {
    
    it('should integrate with existing bot scheduler system', async () => {
      // Test that new text-based system works with existing SchedulerService
      const scheduleContent = `# Integration Test

groups:
Integration Test Group

action: daily_summary
schedule: 0 17 * * *
send to: ניצן

---`;

      const testFile = path.join(tempSchedulesDir, 'integration-test.txt');
      await fs.writeFile(testFile, scheduleContent);

      // Act
      await schedulerService.initialize();

      // Assert
      expect(schedulerService.isInitialized).toBe(true);
      expect(schedulerService.schedules).toHaveLength(1);
      expect(schedulerService.activeCronJobs.size).toBeGreaterThan(0);
    });

    it('should maintain backward compatibility with existing schedule files', async () => {
      // Ensure existing daily-summaries.txt format still works
      const legacyContent = `# Daily Summary Schedule for Active Groups

---

groups:
AI-ACADEMY BY GUY AGA
קורס דיגיטלי | שימוש פרקטי בכלי AI עם גיא אגא יוני 2025

action: daily_summary
schedule: every day at 14:05
send to: ניצן

---`;

      const legacyFile = path.join(tempSchedulesDir, 'daily-summaries.txt');
      await fs.writeFile(legacyFile, legacyContent);

      // Act
      await schedulerService.loadSchedulesFromFiles();

      // Assert
      expect(schedulerService.schedules).toHaveLength(1);
      const schedule = schedulerService.schedules[0];
      expect(schedule.groups).toContain('AI-ACADEMY BY GUY AGA');
      expect(schedule.action).toBe('daily_summary');
    });

  });

  // Helper method implementations to be added to SchedulerService
  describe('Required Helper Methods', () => {
    
    it('should implement saveTaskToTextFile method', () => {
      expect(typeof schedulerService.saveTaskToTextFile).toBe('function');
    });

    it('should implement updateTaskTextFile method', () => {
      expect(typeof schedulerService.updateTaskTextFile).toBe('function');
    });

    it('should implement validateAndSaveTask method', () => {
      expect(typeof schedulerService.validateAndSaveTask).toBe('function');
    });

  });

});

// Additional test helper functions
function createMockTask(overrides = {}) {
  return {
    id: 'test-task',
    name: 'Test Task',
    groups: ['Test Group'],
    action: 'daily_summary',
    cronExpression: '0 18 * * *',
    sendTo: 'ניצן',
    active: true,
    ...overrides
  };
}

function createMockScheduleFile(content) {
  return `# Generated Test Schedule
# Created at ${new Date().toISOString()}

${content}

---`;
}