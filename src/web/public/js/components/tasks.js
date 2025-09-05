class TasksComponent {
  constructor() {
    this.scheduledTasks = [];
    this.oneTimeTasks = [];
    this.scheduledContainer = document.getElementById('scheduled-tasks-list');
    this.oneTimeContainer = document.getElementById('one-time-tasks-list');
    this.addScheduledBtn = document.getElementById('add-scheduled-task-btn');
    this.addOneTimeBtn = document.getElementById('add-onetime-task-btn');
    this.refreshInterval = null;
  }

  async initialize() {
    await this.loadTasks();
    this.setupEventListeners();
    this.startAutoRefresh();
  }
  
  startAutoRefresh() {
    // Refresh tasks every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadTasks(true); // Silent refresh
    }, 30000);
  }
  
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  setupEventListeners() {
    this.addScheduledBtn.addEventListener('click', () => this.showAddTaskModal('scheduled'));
    this.addOneTimeBtn.addEventListener('click', () => this.showAddTaskModal('one_time'));
  }

  async loadTasks(silent = false) {
    try {
      const response = await window.API.getTasks();
      this.scheduledTasks = response.data.scheduled || [];
      this.oneTimeTasks = response.data.oneTime || [];
      this.render();
      
      if (!silent) {
        // Show success feedback only for manual refresh
        console.log('Tasks loaded successfully');
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      if (!silent) {
        this.showError();
      }
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
            ${task.last_execution ? `
              <div class="text-xs text-gray-500">
                הרצה אחרונה: ${new Date(task.last_execution).toLocaleString('he-IL')}
              </div>
            ` : ''}
          </div>
          <div class="flex items-center space-x-2 space-x-reverse">
            <button onclick="window.tasksComponent.toggleTask(${task.id}, ${!task.active})" 
                    class="p-2 text-${task.active ? 'yellow' : 'green'}-600 hover:text-${task.active ? 'yellow' : 'green'}-800">
              ${task.active ? '⏸️' : '▶️'}
            </button>
            <button onclick="window.tasksComponent.executeTask(${task.id})" 
                    class="p-2 text-blue-600 hover:text-blue-800" title="בצע עכשיו">
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

    // Show loading state
    this.showToast('מבצע משימה...', 'info');
    
    try {
      const response = await window.API.executeTask(id);
      if (response.success) {
        this.showToast('המשימה נשלחה לביצוע', 'success');
        // Refresh tasks after 2 seconds to show updated status
        setTimeout(() => {
          this.loadTasks();
        }, 2000);
      } else {
        this.showToast(response.message || 'המשימה לא בוצעה', 'error');
      }
    } catch (error) {
      console.error('Task execution error:', error);
      this.showToast(`שגיאה בביצוע המשימה: ${error.message || 'שגיאה לא ידועה'}`, 'error');
    }
  }

  async deleteTask(id) {
    if (!confirm('למחוק את המשימה? פעולה זו אינה ניתנת לביטול.')) {
      return;
    }

    try {
      const response = await window.API.deleteTask(id);
      if (response.success) {
        this.showToast('המשימה נמחקה בהצלחה', 'success');
        await this.loadTasks();
      } else {
        this.showToast(response.message || 'המשימה לא נמחקה', 'error');
      }
    } catch (error) {
      console.error('Task deletion error:', error);
      this.showToast(`שגיאה במחיקת המשימה: ${error.message || 'שגיאה לא ידועה'}`, 'error');
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
  
  destroy() {
    this.stopAutoRefresh();
  }
}

window.TasksComponent = TasksComponent;