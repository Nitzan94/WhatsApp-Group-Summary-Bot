# 📋 WhatsApp Bot Web Dashboard - Detailed Implementation Tasks

## 🎯 Project Status Overview
**Date:** September 4, 2025  
**Current State:** Backend complete, Frontend structure ready, JavaScript implementation missing  
**Priority:** HIGH - Complete frontend JavaScript to make dashboard functional

---

## ✅ Completed Components

### Backend (100% Complete)
- [x] **WebServer.js** - Express server with all API endpoints
- [x] **ConfigService.js** - Configuration management service
- [x] **Database Schema** - Web tables (web_config, web_tasks, task_executions)
- [x] **Bot.js Integration** - WebServer initialization on startup
- [x] **API Endpoints** - All REST endpoints defined and ready

### Frontend Structure (100% Complete)
- [x] **HTML Dashboard** - Complete RTL Hebrew interface
- [x] **Tailwind CSS** - Styling and responsive design
- [x] **Layout** - Status cards, management groups, API config, tasks

---

## 🔴 Critical Tasks - Frontend JavaScript Implementation

### Task 1: Core API Communication Layer
**File:** `src/web/public/js/api.js`  
**Priority:** CRITICAL  
**Time Estimate:** 30 minutes

```javascript
// Required Implementation:
class API {
  constructor() {
    this.baseURL = window.location.origin + '/api';
    this.headers = { 'Content-Type': 'application/json' };
  }

  // Core request method with error handling
  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers: { ...this.headers, ...options.headers }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Status endpoints
  async getStatus() {
    return this.request('/status');
  }
  
  // Real-time status stream (Server-Sent Events)
  streamStatus(callback) {
    const eventSource = new EventSource(`${this.baseURL}/status/stream`);
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      callback(data);
    };
    return eventSource;
  }

  // Management Groups endpoints
  async getManagementGroups() {
    return this.request('/config/management-groups');
  }
  
  async addManagementGroup(groupName) {
    return this.request('/config/management-groups', {
      method: 'POST',
      body: JSON.stringify({ groupName })
    });
  }
  
  async removeManagementGroup(id) {
    return this.request(`/config/management-groups/${id}`, {
      method: 'DELETE'
    });
  }

  // API Key endpoints
  async getApiKeyStatus() {
    return this.request('/config/api-key');
  }
  
  async testApiKey(apiKey) {
    return this.request('/config/api-key/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    });
  }

  // Task Management endpoints
  async getTasks(type = null) {
    const query = type ? `?type=${type}` : '';
    return this.request(`/tasks${query}`);
  }
  
  async createTask(taskData) {
    return this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  }
  
  async updateTask(id, taskData) {
    return this.request(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(taskData)
    });
  }
  
  async deleteTask(id) {
    return this.request(`/tasks/${id}`, {
      method: 'DELETE'
    });
  }
  
  async executeTask(id) {
    return this.request(`/tasks/${id}/execute`, {
      method: 'POST'
    });
  }
}

// Export as global
window.API = new API();
```

---

### Task 2: Status Component - Real-time Updates
**File:** `src/web/public/js/components/status.js`  
**Priority:** HIGH  
**Time Estimate:** 45 minutes

```javascript
// Required Implementation:
class StatusComponent {
  constructor() {
    this.eventSource = null;
    this.elements = {
      connectionText: document.getElementById('connection-text'),
      connectionIndicator: document.getElementById('connection-indicator'),
      connectionDetails: document.getElementById('connection-details'),
      groupsCount: document.getElementById('groups-count'),
      groupsDetails: document.getElementById('groups-details'),
      tasksCount: document.getElementById('tasks-count'),
      tasksDetails: document.getElementById('tasks-details'),
      apiText: document.getElementById('api-text'),
      apiDetails: document.getElementById('api-details')
    };
  }

  async initialize() {
    // Load initial status
    await this.loadStatus();
    
    // Start real-time updates
    this.startStreaming();
    
    // Refresh button handler
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadStatus();
    });
  }

  async loadStatus() {
    try {
      const response = await window.API.getStatus();
      this.updateDisplay(response.data);
    } catch (error) {
      console.error('Failed to load status:', error);
      this.showError();
    }
  }

  startStreaming() {
    this.eventSource = window.API.streamStatus((data) => {
      this.updateDisplay(data);
    });
  }

  updateDisplay(data) {
    // Bot connection status
    if (data.bot) {
      const { connected, account, uptime, activeGroups, totalMessages, lastActivity } = data.bot;
      
      // Update connection status
      this.elements.connectionText.textContent = connected ? 'מחובר' : 'מנותק';
      this.elements.connectionIndicator.className = 'status-indicator ' + 
        (connected ? 'status-connected' : 'status-disconnected');
      
      // Update details
      if (connected && account) {
        const uptimeMinutes = Math.floor(uptime / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeText = uptimeHours > 0 ? 
          `${uptimeHours} שעות ו-${uptimeMinutes % 60} דקות` : 
          `${uptimeMinutes} דקות`;
        
        this.elements.connectionDetails.textContent = `${account} • ${uptimeText}`;
      } else {
        this.elements.connectionDetails.textContent = 'ממתין לחיבור...';
      }
      
      // Update groups count
      this.elements.groupsCount.textContent = activeGroups || '0';
      this.elements.groupsDetails.textContent = 
        `${totalMessages?.toLocaleString() || '0'} הודעות`;
    }
    
    // Web status
    if (data.web) {
      const { managementGroups, activeTasks, nextScheduledTask } = data.web;
      
      // Update tasks count
      this.elements.tasksCount.textContent = activeTasks || '0';
      
      // Next task details
      if (nextScheduledTask) {
        const nextDate = new Date(nextScheduledTask);
        const timeStr = nextDate.toLocaleTimeString('he-IL', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        this.elements.tasksDetails.textContent = `הבא: ${timeStr}`;
      } else {
        this.elements.tasksDetails.textContent = 'אין משימות מתוזמנות';
      }
      
      // Management groups details
      if (managementGroups && managementGroups.length > 0) {
        this.elements.groupsDetails.textContent = managementGroups.join(', ');
      }
    }
    
    // API status (from separate call)
    this.updateApiStatus();
  }

  async updateApiStatus() {
    try {
      const response = await window.API.getApiKeyStatus();
      const { keyPresent, keyMasked, status } = response.data;
      
      if (keyPresent) {
        this.elements.apiText.textContent = 'פעיל';
        this.elements.apiDetails.textContent = keyMasked || 'מפתח קיים';
      } else {
        this.elements.apiText.textContent = 'חסר';
        this.elements.apiDetails.textContent = 'לא הוגדר מפתח API';
      }
    } catch (error) {
      this.elements.apiText.textContent = 'שגיאה';
      this.elements.apiDetails.textContent = 'לא ניתן לטעון מצב';
    }
  }

  showError() {
    this.elements.connectionText.textContent = 'שגיאה';
    this.elements.connectionIndicator.className = 'status-indicator status-disconnected';
    this.elements.connectionDetails.textContent = 'בעיה בחיבור לשרת';
  }

  destroy() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

window.StatusComponent = StatusComponent;
```

---

### Task 3: Management Groups Component
**File:** `src/web/public/js/components/groups.js`  
**Priority:** HIGH  
**Time Estimate:** 45 minutes

```javascript
// Required Implementation:
class GroupsComponent {
  constructor() {
    this.groups = [];
    this.container = document.getElementById('groups-list');
    this.addButton = document.getElementById('add-group-btn');
  }

  async initialize() {
    await this.loadGroups();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.addButton.addEventListener('click', () => this.showAddGroupModal());
  }

  async loadGroups() {
    try {
      const response = await window.API.getManagementGroups();
      this.groups = response.data.groups;
      this.render();
    } catch (error) {
      console.error('Failed to load groups:', error);
      this.showError();
    }
  }

  render() {
    if (this.groups.length === 0) {
      this.container.innerHTML = `
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          אין קבוצות ניהול מוגדרות
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.groups.map(group => `
      <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div class="flex-1">
          <div class="font-medium text-gray-900 dark:text-white">
            ${this.escapeHtml(group.group_name)}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            ${group.message_count || 0} הודעות
            ${group.active ? 
              '<span class="text-green-500 mr-2">• פעיל</span>' : 
              '<span class="text-red-500 mr-2">• לא פעיל</span>'}
          </div>
        </div>
        <button onclick="window.groupsComponent.removeGroup(${group.id})" 
                class="text-red-600 hover:text-red-800 p-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
        </button>
      </div>
    `).join('');
  }

  showAddGroupModal() {
    const modalHtml = `
      <div id="add-group-modal" class="modal show fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            הוסף קבוצת ניהול
          </h3>
          <input type="text" id="new-group-name" 
                 class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                        bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                        focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                 placeholder="שם הקבוצה">
          <div class="mt-4 flex justify-end space-x-3 space-x-reverse">
            <button onclick="window.groupsComponent.closeModal()" 
                    class="px-4 py-2 text-gray-600 hover:text-gray-800">
              ביטול
            </button>
            <button onclick="window.groupsComponent.addGroup()" 
                    class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
              הוסף
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('modals').innerHTML = modalHtml;
  }

  async addGroup() {
    const input = document.getElementById('new-group-name');
    const groupName = input.value.trim();
    
    if (!groupName) {
      this.showToast('נא להזין שם קבוצה', 'error');
      return;
    }

    try {
      const response = await window.API.addManagementGroup(groupName);
      if (response.success) {
        this.showToast(response.message || 'הקבוצה נוספה בהצלחה', 'success');
        this.closeModal();
        await this.loadGroups();
      } else {
        this.showToast(response.message || response.error, 'error');
      }
    } catch (error) {
      this.showToast('שגיאה בהוספת הקבוצה', 'error');
    }
  }

  async removeGroup(id) {
    if (!confirm('האם למחוק את קבוצת הניהול?')) {
      return;
    }

    try {
      const response = await window.API.removeManagementGroup(id);
      if (response.success) {
        this.showToast('הקבוצה הוסרה בהצלחה', 'success');
        await this.loadGroups();
      } else {
        this.showToast('שגיאה בהסרת הקבוצה', 'error');
      }
    } catch (error) {
      this.showToast('שגיאה בהסרת הקבוצה', 'error');
    }
  }

  closeModal() {
    document.getElementById('modals').innerHTML = '';
  }

  showToast(message, type = 'info') {
    window.showToast?.(message, type);
  }

  showError() {
    this.container.innerHTML = `
      <div class="text-center py-8 text-red-500">
        שגיאה בטעינת קבוצות הניהול
      </div>
    `;
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

window.GroupsComponent = GroupsComponent;
```

---

### Task 4: Tasks Management Component
**File:** `src/web/public/js/components/tasks.js`  
**Priority:** HIGH  
**Time Estimate:** 60 minutes

```javascript
// Required Implementation:
class TasksComponent {
  constructor() {
    this.scheduledTasks = [];
    this.oneTimeTasks = [];
    this.scheduledContainer = document.getElementById('scheduled-tasks-list');
    this.oneTimeContainer = document.getElementById('one-time-tasks-list');
    this.addScheduledBtn = document.getElementById('add-scheduled-task-btn');
    this.addOneTimeBtn = document.getElementById('add-onetime-task-btn');
  }

  async initialize() {
    await this.loadTasks();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.addScheduledBtn.addEventListener('click', () => this.showAddTaskModal('scheduled'));
    this.addOneTimeBtn.addEventListener('click', () => this.showAddTaskModal('one_time'));
  }

  async loadTasks() {
    try {
      const response = await window.API.getTasks();
      this.scheduledTasks = response.data.scheduled || [];
      this.oneTimeTasks = response.data.oneTime || [];
      this.render();
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.showError();
    }
  }

  render() {
    this.renderScheduledTasks();
    this.renderOneTimeTasks();
  }

  renderScheduledTasks() {
    if (this.scheduledTasks.length === 0) {
      this.scheduledContainer.innerHTML = `
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          אין משימות מתוזמנות
        </div>
      `;
      return;
    }

    this.scheduledContainer.innerHTML = this.scheduledTasks.map(task => `
      <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <h4 class="font-medium text-gray-900 dark:text-white">
              ${this.escapeHtml(task.name)}
            </h4>
            <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              <span class="ml-3">⏰ ${this.humanizeCron(task.cron_expression)}</span>
              <span class="ml-3">📊 ${task.action_type}</span>
              ${task.active ? 
                '<span class="text-green-500">• פעיל</span>' : 
                '<span class="text-red-500">• מושהה</span>'}
            </div>
            ${task.next_run ? `
              <div class="text-xs text-gray-500 mt-1">
                הרצה הבאה: ${new Date(task.next_run).toLocaleString('he-IL')}
              </div>
            ` : ''}
          </div>
          <div class="flex items-center space-x-2 space-x-reverse">
            <button onclick="window.tasksComponent.toggleTask(${task.id}, ${!task.active})" 
                    class="p-2 text-${task.active ? 'yellow' : 'green'}-600 hover:text-${task.active ? 'yellow' : 'green'}-800">
              ${task.active ? '⏸️' : '▶️'}
            </button>
            <button onclick="window.tasksComponent.executeTask(${task.id})" 
                    class="p-2 text-blue-600 hover:text-blue-800">
              🚀
            </button>
            <button onclick="window.tasksComponent.deleteTask(${task.id})" 
                    class="p-2 text-red-600 hover:text-red-800">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderOneTimeTasks() {
    if (this.oneTimeTasks.length === 0) {
      this.oneTimeContainer.innerHTML = `
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          אין משימות חד פעמיות
        </div>
      `;
      return;
    }

    this.oneTimeContainer.innerHTML = this.oneTimeTasks.map(task => `
      <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <h4 class="font-medium text-gray-900 dark:text-white">
              ${this.escapeHtml(task.name)}
            </h4>
            <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              <span class="ml-3">📅 ${new Date(task.execute_at).toLocaleString('he-IL')}</span>
              <span class="ml-3 ${this.getStatusColor(task.status)}">
                • ${this.getStatusText(task.status)}
              </span>
            </div>
          </div>
          <div class="flex items-center space-x-2 space-x-reverse">
            ${task.status === 'pending' ? `
              <button onclick="window.tasksComponent.executeTask(${task.id})" 
                      class="p-2 text-blue-600 hover:text-blue-800">
                🚀
              </button>
            ` : ''}
            <button onclick="window.tasksComponent.deleteTask(${task.id})" 
                    class="p-2 text-red-600 hover:text-red-800">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  showAddTaskModal(type) {
    const modalHtml = `
      <div id="add-task-modal" class="modal show fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            ${type === 'scheduled' ? 'הוסף משימה מתוזמנת' : 'הוסף משימה חד פעמית'}
          </h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                שם המשימה
              </label>
              <input type="text" id="task-name" 
                     class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                     placeholder="לדוגמה: סיכום יומי">
            </div>
            
            ${type === 'scheduled' ? `
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תזמון (CRON)
                </label>
                <select id="task-cron" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="0 18 * * *">כל יום ב-18:00</option>
                  <option value="0 16 * * *">כל יום ב-16:00</option>
                  <option value="0 9 * * *">כל יום ב-09:00</option>
                  <option value="0 21 * * *">כל יום ב-21:00</option>
                  <option value="0 10 * * 0">כל יום ראשון ב-10:00</option>
                  <option value="custom">מותאם אישית...</option>
                </select>
              </div>
            ` : `
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  תאריך ושעה
                </label>
                <input type="datetime-local" id="task-datetime" 
                       class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                              bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
              </div>
            `}
            
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                סוג פעולה
              </label>
              <select id="task-action" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                                              bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                <option value="daily_summary">סיכום יומי</option>
                <option value="today_summary">סיכום היום</option>
                <option value="weekly_summary">סיכום שבועי</option>
                <option value="send_message">שליחת הודעה</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                קבוצות יעד
              </label>
              <input type="text" id="task-targets" 
                     class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                     placeholder="קבוצה 1, קבוצה 2 (מופרד בפסיקים)">
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                שלח תוצאות לקבוצה
              </label>
              <input type="text" id="task-send-to" 
                     class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                            bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                     placeholder="ניצן">
            </div>
          </div>
          
          <div class="mt-6 flex justify-end space-x-3 space-x-reverse">
            <button onclick="window.tasksComponent.closeModal()" 
                    class="px-4 py-2 text-gray-600 hover:text-gray-800">
              ביטול
            </button>
            <button onclick="window.tasksComponent.saveTask('${type}')" 
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              שמור
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('modals').innerHTML = modalHtml;
  }

  async saveTask(type) {
    const name = document.getElementById('task-name').value.trim();
    const action_type = document.getElementById('task-action').value;
    const targets = document.getElementById('task-targets').value
      .split(',')
      .map(t => t.trim())
      .filter(t => t);
    const send_to_group = document.getElementById('task-send-to').value.trim();
    
    if (!name) {
      this.showToast('נא להזין שם למשימה', 'error');
      return;
    }

    const taskData = {
      name,
      task_type: type,
      action_type,
      target_groups: targets,
      send_to_group: send_to_group || 'ניצן'
    };

    if (type === 'scheduled') {
      taskData.cron_expression = document.getElementById('task-cron').value;
      if (taskData.cron_expression === 'custom') {
        this.showToast('נא להזין ביטוי CRON מותאם אישית', 'error');
        return;
      }
    } else {
      taskData.execute_at = document.getElementById('task-datetime').value;
      if (!taskData.execute_at) {
        this.showToast('נא לבחור תאריך ושעה', 'error');
        return;
      }
    }

    try {
      const response = await window.API.createTask(taskData);
      if (response.success) {
        this.showToast(response.message || 'המשימה נוצרה בהצלחה', 'success');
        this.closeModal();
        await this.loadTasks();
      } else {
        this.showToast(response.message || response.error, 'error');
      }
    } catch (error) {
      this.showToast('שגיאה ביצירת המשימה', 'error');
    }
  }

  async toggleTask(id, activate) {
    try {
      const response = await window.API.updateTask(id, { active: activate });
      if (response.success) {
        this.showToast(activate ? 'המשימה הופעלה' : 'המשימה הושהתה', 'success');
        await this.loadTasks();
      }
    } catch (error) {
      this.showToast('שגיאה בעדכון המשימה', 'error');
    }
  }

  async executeTask(id) {
    if (!confirm('לבצע את המשימה עכשיו?')) {
      return;
    }

    try {
      const response = await window.API.executeTask(id);
      if (response.success) {
        this.showToast('המשימה נשלחה לביצוע', 'success');
      }
    } catch (error) {
      this.showToast('שגיאה בביצוע המשימה', 'error');
    }
  }

  async deleteTask(id) {
    if (!confirm('למחוק את המשימה?')) {
      return;
    }

    try {
      const response = await window.API.deleteTask(id);
      if (response.success) {
        this.showToast('המשימה נמחקה', 'success');
        await this.loadTasks();
      }
    } catch (error) {
      this.showToast('שגיאה במחיקת המשימה', 'error');
    }
  }

  humanizeCron(cron) {
    const patterns = {
      '0 18 * * *': 'כל יום ב-18:00',
      '0 16 * * *': 'כל יום ב-16:00',
      '0 9 * * *': 'כל יום ב-09:00',
      '0 21 * * *': 'כל יום ב-21:00',
      '0 10 * * 0': 'כל יום ראשון ב-10:00'
    };
    return patterns[cron] || cron;
  }

  getStatusColor(status) {
    const colors = {
      'pending': 'text-yellow-500',
      'running': 'text-blue-500',
      'completed': 'text-green-500',
      'failed': 'text-red-500'
    };
    return colors[status] || 'text-gray-500';
  }

  getStatusText(status) {
    const texts = {
      'pending': 'ממתין',
      'running': 'בביצוע',
      'completed': 'הושלם',
      'failed': 'נכשל'
    };
    return texts[status] || status;
  }

  closeModal() {
    document.getElementById('modals').innerHTML = '';
  }

  showToast(message, type = 'info') {
    window.showToast?.(message, type);
  }

  showError() {
    this.scheduledContainer.innerHTML = `
      <div class="text-center py-8 text-red-500">
        שגיאה בטעינת המשימות
      </div>
    `;
    this.oneTimeContainer.innerHTML = this.scheduledContainer.innerHTML;
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

window.TasksComponent = TasksComponent;
```

---

### Task 5: API Configuration Component
**File:** `src/web/public/js/components/config.js`  
**Priority:** MEDIUM  
**Time Estimate:** 30 minutes

```javascript
// Required Implementation:
class ConfigComponent {
  constructor() {
    this.apiKeyInput = document.getElementById('api-key-input');
    this.toggleBtn = document.getElementById('toggle-api-key');
    this.testBtn = document.getElementById('test-api-btn');
    this.currentModel = document.getElementById('current-model');
    this.lastUsage = document.getElementById('last-api-usage');
    this.isPasswordVisible = false;
  }

  async initialize() {
    await this.loadApiStatus();
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.toggleBtn.addEventListener('click', () => this.togglePasswordVisibility());
    this.testBtn.addEventListener('click', () => this.testApiKey());
  }

  async loadApiStatus() {
    try {
      const response = await window.API.getApiKeyStatus();
      const { keyPresent, keyMasked, model, lastUsed, status } = response.data;
      
      if (keyPresent) {
        this.apiKeyInput.placeholder = keyMasked || 'sk-or-v1-••••••••••••••••••••';
      }
      
      if (model) {
        this.currentModel.textContent = model;
      }
      
      if (lastUsed) {
        const date = new Date(lastUsed);
        this.lastUsage.textContent = date.toLocaleString('he-IL');
      } else {
        this.lastUsage.textContent = 'לא נעשה שימוש לאחרונה';
      }
      
      // Update visual status
      if (status === 'connected' || status === 'present') {
        this.apiKeyInput.classList.add('border-green-500');
      } else if (status === 'error' || status === 'invalid') {
        this.apiKeyInput.classList.add('border-red-500');
      }
    } catch (error) {
      console.error('Failed to load API status:', error);
    }
  }

  togglePasswordVisibility() {
    this.isPasswordVisible = !this.isPasswordVisible;
    this.apiKeyInput.type = this.isPasswordVisible ? 'text' : 'password';
    
    // Update icon
    this.toggleBtn.innerHTML = this.isPasswordVisible ? `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>
      </svg>
    ` : `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
      </svg>
    `;
  }

  async testApiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    
    if (!apiKey) {
      this.showToast('נא להזין מפתח API', 'error');
      return;
    }

    // Show loading state
    this.testBtn.disabled = true;
    this.testBtn.textContent = 'בודק...';
    
    try {
      const response = await window.API.testApiKey(apiKey);
      
      if (response.success) {
        this.showToast('החיבור תקין!', 'success');
        this.apiKeyInput.classList.remove('border-red-500');
        this.apiKeyInput.classList.add('border-green-500');
      } else {
        this.showToast(response.error || 'המפתח לא תקין', 'error');
        this.apiKeyInput.classList.remove('border-green-500');
        this.apiKeyInput.classList.add('border-red-500');
      }
    } catch (error) {
      this.showToast('שגיאה בבדיקת המפתח', 'error');
    } finally {
      this.testBtn.disabled = false;
      this.testBtn.innerHTML = `
        <span>בדוק חיבור</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      `;
    }
  }

  showToast(message, type = 'info') {
    window.showToast?.(message, type);
  }
}

window.ConfigComponent = ConfigComponent;
```

---

### Task 6: Main Dashboard Controller
**File:** `src/web/public/js/dashboard.js`  
**Priority:** CRITICAL  
**Time Estimate:** 20 minutes

```javascript
// Required Implementation:
class Dashboard {
  constructor() {
    this.components = {};
  }

  async initialize() {
    try {
      // Show loading overlay
      this.showLoading(true);

      // Initialize all components
      this.components.status = new window.StatusComponent();
      this.components.groups = new window.GroupsComponent();
      this.components.tasks = new window.TasksComponent();
      this.components.config = new window.ConfigComponent();
      
      // Store globally for onclick handlers
      window.statusComponent = this.components.status;
      window.groupsComponent = this.components.groups;
      window.tasksComponent = this.components.tasks;
      window.configComponent = this.components.config;

      // Initialize each component
      await Promise.all([
        this.components.status.initialize(),
        this.components.groups.initialize(),
        this.components.tasks.initialize(),
        this.components.config.initialize()
      ]);

      // Setup global utilities
      this.setupToastNotifications();
      this.setupGlobalErrorHandling();

      console.log('Dashboard initialized successfully');
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      this.showError('Failed to initialize dashboard');
    } finally {
      this.showLoading(false);
    }
  }

  showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = show ? 'flex' : 'none';
    }
  }

  setupToastNotifications() {
    window.showToast = (message, type = 'info') => {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
      };

      const toast = document.createElement('div');
      toast.className = `${colors[type] || colors.info} text-white px-6 py-3 rounded-lg shadow-lg fade-in`;
      toast.textContent = message;

      container.appendChild(toast);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-100%)';
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    };
  }

  setupGlobalErrorHandling() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      window.showToast('אירעה שגיאה בלתי צפויה', 'error');
    });

    // Handle general errors
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      window.showToast('אירעה שגיאה במערכת', 'error');
    });
  }

  showError(message) {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="flex items-center justify-center min-h-screen">
          <div class="text-center">
            <div class="text-6xl mb-4">❌</div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              שגיאה בטעינת הדשבורד
            </h1>
            <p class="text-gray-600 dark:text-gray-400">
              ${message}
            </p>
            <button onclick="location.reload()" 
                    class="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              נסה שוב
            </button>
          </div>
        </div>
      `;
    }
  }

  destroy() {
    // Cleanup all components
    Object.values(this.components).forEach(component => {
      if (component.destroy) {
        component.destroy();
      }
    });
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const dashboard = new Dashboard();
  dashboard.initialize();
  
  // Store globally for debugging
  window.dashboard = dashboard;
});
```

---

## 🔧 Additional Tasks

### Task 7: Fix CORS and Express Static Files
**File:** `src/web/WebServer.js` (Update line 36)  
**Priority:** HIGH  
**Time Estimate:** 5 minutes

```javascript
// Fix static files path serving
const publicPath = path.join(__dirname, 'public');
this.app.use(express.static(publicPath));

// Add specific route for JS files
this.app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
```

---

### Task 8: Add Error Handling to ConfigService
**File:** `src/services/ConfigService.js` (Updates)  
**Priority:** MEDIUM  
**Time Estimate:** 15 minutes

Add null checks and error handling for database queries that might fail.

---

## 🧪 Testing Checklist

### Phase 1: Basic Connectivity
- [ ] Bot starts successfully with web dashboard
- [ ] Web dashboard accessible at http://localhost:3000
- [ ] API endpoints respond to requests
- [ ] Static files (JS/CSS) load correctly

### Phase 2: Core Functionality
- [ ] Real-time status updates work (SSE)
- [ ] Management groups can be added/removed
- [ ] Tasks can be created/edited/deleted
- [ ] API key testing works

### Phase 3: Integration
- [ ] Web tasks sync to file system
- [ ] File changes reflect in web interface
- [ ] Task execution works from web
- [ ] Bot responds to management groups added via web

### Phase 4: Edge Cases
- [ ] Error handling for network failures
- [ ] Validation for invalid inputs
- [ ] Graceful handling of bot disconnection
- [ ] Database transaction integrity

---

## 📊 Success Metrics

1. **Functionality:** All web features work without breaking bot
2. **Performance:** Dashboard loads < 2 seconds
3. **Real-time:** Status updates every 5 seconds via SSE
4. **Reliability:** No crashes, proper error handling
5. **UX:** Intuitive Hebrew RTL interface

---

## 🚀 Deployment Steps

1. **Stop current bot:** `Ctrl+C` in terminal
2. **Implement all JavaScript files** (Tasks 1-6)
3. **Fix static file serving** (Task 7)
4. **Test locally:** `node src/bot.js`
5. **Open dashboard:** http://localhost:3000
6. **Run through testing checklist**
7. **Deploy to production** (if applicable)

---

## 📝 Notes

- All JavaScript implementations follow ES6+ standards
- Hebrew RTL support is already in HTML
- Toast notifications for user feedback
- Modal dialogs for forms
- Real-time updates via Server-Sent Events (SSE)
- All API calls use async/await pattern
- Error handling at every level

---

**This comprehensive task file provides everything needed to complete the WhatsApp Bot Web Dashboard implementation. The frontend JavaScript is the only missing piece - implement these 6 core files and the dashboard will be fully functional!**