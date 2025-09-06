# 🎯 Conversation Groups Implementation - TODO

## 📋 Overview
Implementation of dynamic conversation groups management through dashboard.
Allow any user to add groups via dashboard and enable/disable natural conversation for each group.

## 🎨 Frontend (Dashboard UI) Changes

### 1. Update `src/web/public/js/components/groups.js`
- [ ] **Add conversation toggle to each group display**
  ```html
  <div class="conversation-toggle">
    <label class="inline-flex items-center">
      <input type="checkbox" class="form-checkbox" 
             onchange="window.groupsComponent.toggleConversation(${group.id}, this.checked)"
             ${group.conversation_enabled ? 'checked' : ''}>
      <span class="ml-2">שיחה פעילה</span>
    </label>
  </div>
  ```

- [ ] **Add conversation checkbox to "Add Group" modal**
  - Add checkbox with default checked
  - Update addGroup() method to include conversation_enabled parameter

- [ ] **Add toggleConversation(groupId, enabled) method**
  - Call API to update conversation status
  - Update UI immediately on success
  - Show error message on failure

- [ ] **Update renderGroups() to show conversation status**
  - Show visual indicator (icon/badge) for conversation-enabled groups
  - Use different styling for conversation vs non-conversation groups

### 2. Update `src/web/public/js/api.js`
- [ ] **Add updateGroupConversationStatus(groupId, enabled) method**
  ```javascript
  async updateGroupConversationStatus(groupId, enabled) {
    return this.request(`/config/management-groups/${groupId}/conversation`, {
      method: 'PUT',
      body: JSON.stringify({ conversation_enabled: enabled })
    });
  }
  ```

- [ ] **Update addManagementGroup to accept conversation_enabled**
  ```javascript
  async addManagementGroup(groupName, conversationEnabled = true) {
    return this.request('/config/management-groups', {
      method: 'POST',
      body: JSON.stringify({ 
        groupName, 
        conversation_enabled: conversationEnabled 
      })
    });
  }
  ```

## 🔧 Backend API Changes

### 3. Update `src/web/WebServer.js`
- [ ] **Add PUT endpoint for conversation status**
  ```javascript
  apiRouter.put('/config/management-groups/:id/conversation', async (req, res) => {
    try {
      const { id } = req.params;
      const { conversation_enabled } = req.body;
      
      const result = await this.configService.updateGroupConversationStatus(id, conversation_enabled);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error('Failed to update conversation status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update conversation status'
      });
    }
  });
  ```

- [ ] **Update POST endpoint to accept conversation_enabled**
  - Modify existing POST /config/management-groups
  - Extract conversation_enabled from req.body
  - Pass to configService.addManagementGroup()

## ⚙️ ConfigService Changes

### 4. Update `src/services/ConfigService.js`
- [ ] **Update getManagementGroups() to return conversation_enabled**
  ```javascript
  // Parse metadata and extract conversation_enabled
  const groups = rawGroups.map(group => ({
    ...group,
    conversation_enabled: this.parseMetadataField(group.metadata, 'conversation_enabled', true)
  }));
  ```

- [ ] **Add parseMetadataField() helper method**
  ```javascript
  parseMetadataField(metadataJson, field, defaultValue) {
    try {
      const metadata = JSON.parse(metadataJson || '{}');
      return metadata[field] !== undefined ? metadata[field] : defaultValue;
    } catch (error) {
      return defaultValue;
    }
  }
  ```

- [ ] **Update addManagementGroup() to accept conversation_enabled**
  ```javascript
  async addManagementGroup(groupName, conversationEnabled = true) {
    // Include conversation_enabled in metadata when inserting
    const metadata = {
      resolved_at: new Date().toISOString(),
      message_count: groupSearchResult.messageCount || 0,
      conversation_enabled: conversationEnabled
    };
  }
  ```

- [ ] **Add updateGroupConversationStatus(groupId, enabled) method**
  ```javascript
  async updateGroupConversationStatus(groupId, enabled) {
    try {
      // Get current metadata
      const current = await this.db.getQuery(`
        SELECT metadata FROM web_config 
        WHERE category = 'management_groups' AND id = ?
      `, [groupId]);
      
      // Update metadata
      const metadata = JSON.parse(current?.metadata || '{}');
      metadata.conversation_enabled = enabled;
      
      // Save back
      const result = await this.db.runQuery(`
        UPDATE web_config 
        SET metadata = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = 'management_groups' AND id = ?
      `, [JSON.stringify(metadata), groupId]);
      
      return {
        success: result.changes > 0,
        message: result.changes > 0 ? 'Conversation status updated' : 'Group not found'
      };
    } catch (error) {
      logger.error('Failed to update conversation status:', error);
      return {
        success: false,
        error: 'Failed to update conversation status'
      };
    }
  }
  ```

- [ ] **Add isConversationGroup(groupId) method**
  ```javascript
  async isConversationGroup(groupId) {
    try {
      const groups = await this.getManagementGroups();
      const group = groups.find(g => g.group_id === groupId && g.active);
      return group ? group.conversation_enabled : false;
    } catch (error) {
      logger.error('Failed to check conversation group:', error);
      return false;
    }
  }
  ```

## 🤖 Bot Logic Changes

### 5. Update `src/bot.js`
- [ ] **Update isConversationGroup() to use ConfigService**
  ```javascript
  async isConversationGroup(groupId) {
    try {
      if (this.configService) {
        return await this.configService.isConversationGroup(groupId);
      }
      
      // Fallback to hardcoded groups if ConfigService not available
      const fallbackGroups = [
        '120363417758222119@g.us', // Nitzan bot
        '972546262108-1556219067@g.us' // ניצן
      ];
      return fallbackGroups.includes(groupId);
      
    } catch (error) {
      logger.error('Error checking conversation group:', error);
      // Fallback on error
      const fallbackGroups = [
        '120363417758222119@g.us', // Nitzan bot  
        '972546262108-1556219067@g.us' // ניצן
      ];
      return fallbackGroups.includes(groupId);
    }
  }
  ```

## 🗄️ Database Changes

### 6. Ensure Metadata Structure
- [ ] **Verify all existing groups have conversation_enabled in metadata**
  ```sql
  -- Check current groups metadata
  SELECT id, key, metadata FROM web_config WHERE category = 'management_groups';
  ```

- [ ] **Update existing groups without conversation_enabled**
  ```javascript
  // Migration script to add conversation_enabled to existing groups
  async migrateExistingGroups() {
    const groups = await this.db.allQuery(`
      SELECT id, metadata FROM web_config WHERE category = 'management_groups'
    `);
    
    for (const group of groups) {
      const metadata = JSON.parse(group.metadata || '{}');
      if (metadata.conversation_enabled === undefined) {
        metadata.conversation_enabled = true; // Default to enabled
        await this.db.runQuery(`
          UPDATE web_config SET metadata = ? WHERE id = ?
        `, [JSON.stringify(metadata), group.id]);
      }
    }
  }
  ```

## 🧪 Testing & Validation

### 7. Manual Testing Checklist
- [ ] **Test adding new group with conversation enabled**
  - Add group through dashboard with conversation checked
  - Verify group appears with conversation toggle ON
  - Send message in WhatsApp group and verify bot responds

- [ ] **Test adding new group with conversation disabled**
  - Add group through dashboard with conversation unchecked
  - Verify group appears with conversation toggle OFF
  - Send message in WhatsApp group and verify bot does NOT respond

- [ ] **Test toggling existing group conversation status**
  - Toggle OFF conversation for existing group
  - Send message and verify bot stops responding
  - Toggle ON conversation for same group
  - Send message and verify bot starts responding again

- [ ] **Test fallback functionality**
  - Simulate ConfigService error
  - Verify bot falls back to hardcoded groups
  - Verify no crashes occur

- [ ] **Test UI responsiveness**
  - Verify toggle updates immediately
  - Verify error messages show properly
  - Verify groups refresh after changes

### 8. Edge Cases Testing
- [ ] **Test with invalid group IDs**
- [ ] **Test with malformed metadata**
- [ ] **Test ConfigService failure scenarios**
- [ ] **Test concurrent updates**

## 🚀 Deployment Steps

### 9. Deployment Checklist
- [ ] **Backup database before deployment**
- [ ] **Run metadata migration script**
- [ ] **Deploy backend changes first**
- [ ] **Deploy frontend changes**
- [ ] **Restart bot service**
- [ ] **Verify all existing groups still work**
- [ ] **Test adding new group end-to-end**

## 📊 Success Criteria
- ✅ Any user can add groups through dashboard
- ✅ Each group has conversation toggle that works
- ✅ Bot respects conversation settings in real-time
- ✅ Fallback works if ConfigService fails
- ✅ All existing functionality continues working
- ✅ UI is intuitive and responsive

---

**תאריך יצירה:** $(date)  
**מצב:** 🔄 In Progress  
**אחראי:** Claude + ניצן