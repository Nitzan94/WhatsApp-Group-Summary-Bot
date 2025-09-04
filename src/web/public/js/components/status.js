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