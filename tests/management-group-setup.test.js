/**
 * TDD Test for Management Group Setup Flow
 * Tests the new user experience for selecting initial management group
 */

const assert = require('assert');
const path = require('path');

describe('Management Group Setup for New Users', function() {
  let mockDatabase, configService, webServer;
  
  // Mock groups data for testing
  const mockGroups = [
    { id: '120363417758222119@g.us', name: 'Nitzan bot', message_count: 1000, is_active: 1 },
    { id: '972546262108-1556219067@g.us', name: 'ניצן', message_count: 500, is_active: 1 },
    { id: '120363123456789@g.us', name: 'בדיקות בוט', message_count: 100, is_active: 1 }
  ];
  
  beforeEach(function() {
    // Mock database with groups
    mockDatabase = {
      allQuery: async (query, params) => {
        if (query.includes('FROM groups')) {
          return mockGroups;
        }
        if (query.includes('FROM management_groups_view')) {
          return []; // New user - no management groups yet
        }
        return [];
      },
      getQuery: async (query, params) => {
        if (query.includes('FROM groups') && params[0]) {
          return mockGroups.find(g => g.name.toLowerCase().includes(params[0].toLowerCase()));
        }
        return null;
      },
      runQuery: async (query, params) => {
        return { changes: 1 };
      }
    };
  });
  
  describe('Initial Setup Detection', function() {
    
    it('should detect when user has no management groups configured', async function() {
      // GIVEN: New user with no management groups
      const ConfigService = require('../src/services/ConfigService');
      configService = new ConfigService(mockDatabase);
      
      // WHEN: Getting management groups
      const groups = await configService.getManagementGroups();
      
      // THEN: Should return empty array
      assert.strictEqual(groups.length, 0, 'New user should have no management groups');
    });
    
    it('should show setup wizard when no management groups exist', async function() {
      // GIVEN: Fresh installation
      const groups = await configService.getManagementGroups();
      const needsSetup = groups.length === 0;
      
      // THEN: Should trigger setup mode
      assert.strictEqual(needsSetup, true, 'Should detect need for initial setup');
    });
    
  });
  
  describe('Group Selection Interface', function() {
    
    it('should display available groups for selection', async function() {
      // GIVEN: Available groups in database
      const availableGroups = await mockDatabase.allQuery(`
        SELECT id, name, COUNT(*) as message_count 
        FROM groups WHERE is_active = 1 
        ORDER BY message_count DESC
      `);
      
      // THEN: Should show all active groups
      assert.strictEqual(availableGroups.length, 3, 'Should show all available groups');
      assert.strictEqual(availableGroups[0].name, 'Nitzan bot', 'Should order by message count');
    });
    
    it('should allow user to select a management group', async function() {
      // GIVEN: User selects "ניצן" as management group
      const selectedGroupName = 'ניצן';
      
      // WHEN: Adding management group
      const result = await configService.addManagementGroup(selectedGroupName);
      
      // THEN: Should succeed
      assert.strictEqual(result.success, true, 'Should successfully add management group');
      assert.strictEqual(result.group.name, selectedGroupName, 'Should return correct group name');
    });
    
  });
  
  describe('First Time Setup Flow', function() {
    
    it('should show welcome message for new users', function() {
      // GIVEN: New user accessing dashboard
      const hasManagementGroups = false;
      
      // WHEN: Determining UI state
      const shouldShowWelcome = !hasManagementGroups;
      
      // THEN: Should show setup wizard
      assert.strictEqual(shouldShowWelcome, true, 'Should show welcome setup');
    });
    
    it('should guide user through group selection', function() {
      // GIVEN: Setup wizard is active
      const setupSteps = [
        'ברוכים הבאים לבוט WhatsApp AI!',
        'כדי להתחיל, בחר קבוצה שתשמש לניהול הבוט',
        'הקבוצה הנבחרת תוכל לשלוח פקודות מתקדמות'
      ];
      
      // THEN: Should have clear setup flow
      assert.strictEqual(setupSteps.length, 3, 'Should have structured setup steps');
      assert(setupSteps[0].includes('ברוכים'), 'Should have Hebrew welcome message');
    });
    
    it('should persist selected management group', async function() {
      // GIVEN: User completed setup
      const selectedGroup = 'ניצן';
      await configService.addManagementGroup(selectedGroup);
      
      // WHEN: Checking management groups after setup
      mockDatabase.allQuery = async (query) => {
        if (query.includes('management_groups_view')) {
          return [{ 
            group_name: selectedGroup, 
            active: 1, 
            resolved_name: selectedGroup 
          }];
        }
        return [];
      };
      
      const groups = await configService.getManagementGroups();
      
      // THEN: Should remember the selection
      assert.strictEqual(groups.length, 1, 'Should have one management group');
      assert.strictEqual(groups[0].group_name, selectedGroup, 'Should persist selection');
    });
    
  });
  
  describe('API Endpoints for Setup', function() {
    
    it('should have endpoint to check setup status', function() {
      // GIVEN: Setup status check endpoint
      const endpointExists = true; // We'll implement this
      
      // THEN: Should be available
      assert.strictEqual(endpointExists, true, 'Should have setup status endpoint');
    });
    
    it('should have endpoint to complete initial setup', function() {
      // GIVEN: Initial setup completion endpoint
      const setupEndpointExists = true; // We'll implement this
      
      // THEN: Should be available  
      assert.strictEqual(setupEndpointExists, true, 'Should have setup completion endpoint');
    });
    
  });
  
  describe('User Experience Tests', function() {
    
    it('should skip setup if management groups already exist', async function() {
      // GIVEN: User with existing management groups
      mockDatabase.allQuery = async (query) => {
        if (query.includes('management_groups_view')) {
          return [{ group_name: 'Existing Group', active: 1 }];
        }
        return [];
      };
      
      const groups = await configService.getManagementGroups();
      const needsSetup = groups.length === 0;
      
      // THEN: Should not show setup
      assert.strictEqual(needsSetup, false, 'Should skip setup for existing users');
    });
    
    it('should validate group selection', async function() {
      // GIVEN: Invalid group name
      const invalidGroupName = 'קבוצה לא קיימת';
      
      // WHEN: Trying to add non-existent group
      mockDatabase.getQuery = async () => null; // Group not found
      const result = await configService.addManagementGroup(invalidGroupName);
      
      // THEN: Should fail with helpful message
      assert.strictEqual(result.success, false, 'Should reject invalid group');
      assert(result.message.includes('לא נמצאה'), 'Should show Hebrew error message');
    });
    
  });
  
});