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