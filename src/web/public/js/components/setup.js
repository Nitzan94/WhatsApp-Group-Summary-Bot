/**
 * Setup Component - Initial Management Group Selection
 * TDD-driven implementation for new user onboarding
 */

class SetupComponent {
  constructor() {
    this.isFirstTime = false;
    this.availableGroups = [];
    this.selectedGroup = null;
  }

  /**
   * Check if user needs initial setup
   */
  async checkSetupNeeded() {
    try {
      const response = await window.API.getSetupStatus();
      this.isFirstTime = response.data.needsSetup;
      return this.isFirstTime;
    } catch (error) {
      console.error('Setup check failed:', error);
      // Fallback to checking management groups
      try {
        const groups = await window.API.getManagementGroups();
        this.isFirstTime = groups.data.length === 0;
        return this.isFirstTime;
      } catch (fallbackError) {
        console.error('Fallback setup check failed:', fallbackError);
        return false;
      }
    }
  }

  /**
   * Initialize setup wizard if needed
   */
  async initialize() {
    const needsSetup = await this.checkSetupNeeded();
    
    if (needsSetup) {
      await this.showSetupWizard();
    }
    
    return needsSetup;
  }

  /**
   * Show setup wizard modal
   */
  async showSetupWizard() {
    try {
      // Load available groups
      this.availableGroups = await window.API.getAvailableGroups();
      
      // Create setup modal
      const modal = this.createSetupModal();
      document.body.appendChild(modal);
      
      // Show modal with animation
      setTimeout(() => {
        modal.classList.add('show');
      }, 10);
      
      // Setup event listeners
      this.bindSetupEvents(modal);
      
    } catch (error) {
      console.error('Failed to show setup wizard:', error);
      this.showError('שגיאה בטעינת אשף ההתקנה');
    }
  }

  /**
   * Create setup wizard modal HTML
   */
  createSetupModal() {
    const modal = document.createElement('div');
    modal.id = 'setup-wizard';
    modal.className = 'modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.style.display = 'flex'; // Override default modal hide
    
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl max-w-2xl w-full mx-4 fade-in">
        
        <!-- Header -->
        <div class="text-center mb-8">
          <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
            </svg>
          </div>
          <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            ברוכים הבאים לבוט WhatsApp AI!
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            כדי להתחיל, בחר קבוצה שתשמש לניהול הבוט
          </p>
        </div>

        <!-- Step Indicator -->
        <div class="flex items-center justify-center mb-8">
          <div class="flex items-center">
            <div class="flex items-center justify-center w-8 h-8 bg-blue-600 text-white rounded-full text-sm font-medium">
              1
            </div>
            <span class="mr-3 text-sm font-medium text-gray-900 dark:text-white">בחירת קבוצת ניהול</span>
          </div>
        </div>

        <!-- Group Selection -->
        <div class="mb-8">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            קבוצות זמינות לניהול הבוט:
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            הקבוצה שתבחר תוכל לשלוח פקודות מתקדמות לבוט ולנהל את המשימות המתוזמנות
          </p>
          
          <div id="setup-groups-list" class="space-y-3 max-h-60 overflow-y-auto">
            ${this.renderGroupsList()}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-600">
          <button id="setup-skip" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            דלג לעת עתה
          </button>
          
          <div class="flex space-x-3">
            <button id="setup-complete" disabled 
                    class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors">
              השלם הגדרה
            </button>
          </div>
        </div>
      </div>
    `;
    
    return modal;
  }

  /**
   * Render groups list for selection
   */
  renderGroupsList() {
    if (!this.availableGroups.length) {
      return `
        <div class="text-center py-8">
          <div class="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-gray-500 dark:text-gray-400">טוען קבוצות זמינות...</p>
        </div>
      `;
    }

    return this.availableGroups.map(group => `
      <label class="group-option flex items-center p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
        <input type="radio" name="management-group" value="${group.id}" class="sr-only">
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center">
            <div class="w-4 h-4 border-2 border-gray-300 dark:border-gray-500 rounded-full flex-shrink-0 group-radio"></div>
            <div class="mr-3">
              <div class="font-medium text-gray-900 dark:text-white">${group.name}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                ${group.message_count} הודעות • ${this.getGroupActivity(group)}
              </div>
            </div>
          </div>
          
          <!-- Recommended badge -->
          ${group.message_count > 500 ? `
            <span class="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded-full font-medium">
              מומלץ
            </span>
          ` : ''}
        </div>
      </label>
    `).join('');
  }

  /**
   * Get group activity description
   */
  getGroupActivity(group) {
    if (group.message_count > 1000) return 'קבוצה פעילה מאוד';
    if (group.message_count > 500) return 'קבוצה פעילה';
    if (group.message_count > 100) return 'קבוצה בינונית';
    return 'קבוצה חדשה';
  }

  /**
   * Bind event listeners to setup modal
   */
  bindSetupEvents(modal) {
    const groupOptions = modal.querySelectorAll('input[name="management-group"]');
    const completeBtn = modal.querySelector('#setup-complete');
    const skipBtn = modal.querySelector('#setup-skip');

    // Group selection
    groupOptions.forEach(option => {
      option.addEventListener('change', (e) => {
        // Update radio button appearance
        this.updateRadioSelection(modal, e.target);
        
        // Store selection
        this.selectedGroup = this.availableGroups.find(g => g.id === e.target.value);
        
        // Enable complete button
        completeBtn.disabled = false;
        completeBtn.classList.remove('disabled:bg-gray-400');
        completeBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      });
    });

    // Complete setup
    completeBtn.addEventListener('click', async () => {
      await this.completeSetup(modal);
    });

    // Skip setup
    skipBtn.addEventListener('click', () => {
      this.skipSetup(modal);
    });

    // Prevent modal close on backdrop click during setup
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        e.preventDefault();
        this.showSkipConfirmation();
      }
    });
  }

  /**
   * Update radio button visual selection
   */
  updateRadioSelection(modal, selectedInput) {
    const allRadios = modal.querySelectorAll('.group-radio');
    const allOptions = modal.querySelectorAll('.group-option');
    
    // Reset all
    allRadios.forEach(radio => {
      radio.classList.remove('bg-blue-600', 'border-blue-600');
      radio.classList.add('border-gray-300', 'dark:border-gray-500');
      radio.innerHTML = '';
    });
    
    allOptions.forEach(option => {
      option.classList.remove('ring-2', 'ring-blue-500', 'border-blue-500');
    });
    
    // Mark selected
    const selectedOption = selectedInput.closest('.group-option');
    const selectedRadio = selectedOption.querySelector('.group-radio');
    
    selectedRadio.classList.remove('border-gray-300', 'dark:border-gray-500');
    selectedRadio.classList.add('bg-blue-600', 'border-blue-600');
    selectedRadio.innerHTML = `
      <div class="w-2 h-2 bg-white rounded-full mx-auto"></div>
    `;
    
    selectedOption.classList.add('ring-2', 'ring-blue-500', 'border-blue-500');
  }

  /**
   * Complete setup process
   */
  async completeSetup(modal) {
    if (!this.selectedGroup) {
      this.showError('אנא בחר קבוצת ניהול');
      return;
    }

    try {
      // Show loading
      const completeBtn = modal.querySelector('#setup-complete');
      const originalText = completeBtn.textContent;
      completeBtn.disabled = true;
      completeBtn.innerHTML = `
        <div class="flex items-center">
          <div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full ml-2"></div>
          מגדיר...
        </div>
      `;

      // Complete setup with selected group
      const result = await window.API.completeSetup(this.selectedGroup.name);
      
      if (result.success) {
        // Success animation
        completeBtn.innerHTML = `
          <div class="flex items-center">
            <svg class="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            הושלם!
          </div>
        `;
        
        // Close modal after success
        setTimeout(() => {
          this.closeSetup(modal, true);
        }, 1500);
        
        // Show success message
        this.showSuccess(`קבוצת "${this.selectedGroup.name}" נקבעה כקבוצת ניהול`);
        
      } else {
        throw new Error(result.message || result.error);
      }
      
    } catch (error) {
      console.error('Setup completion failed:', error);
      
      // Reset button
      const completeBtn = modal.querySelector('#setup-complete');
      completeBtn.disabled = false;
      completeBtn.textContent = originalText;
      
      this.showError('שגיאה בהגדרת קבוצת הניהול: ' + error.message);
    }
  }

  /**
   * Skip setup (for now)
   */
  skipSetup(modal) {
    this.showSkipConfirmation(() => {
      this.closeSetup(modal, false);
    });
  }

  /**
   * Show skip confirmation
   */
  showSkipConfirmation(onConfirm) {
    const confirmModal = document.createElement('div');
    confirmModal.className = 'modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60';
    confirmModal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md mx-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          לדלג על ההגדרה?
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          בלי קבוצת ניהול, לא תוכל לנהל משימות מתוזמנות דרך הדשבורד.
          תוכל להגדיר זאת מאוחר יותר.
        </p>
        <div class="flex justify-end space-x-3">
          <button id="confirm-skip-cancel" class="px-4 py-2 text-gray-500 hover:text-gray-700">
            חזור
          </button>
          <button id="confirm-skip-yes" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg">
            דלג לעת עתה
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(confirmModal);
    setTimeout(() => confirmModal.classList.add('show'), 10);
    
    confirmModal.querySelector('#confirm-skip-yes').addEventListener('click', () => {
      document.body.removeChild(confirmModal);
      if (onConfirm) onConfirm();
    });
    
    confirmModal.querySelector('#confirm-skip-cancel').addEventListener('click', () => {
      document.body.removeChild(confirmModal);
    });
  }

  /**
   * Close setup modal and refresh dashboard
   */
  closeSetup(modal, wasCompleted) {
    modal.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(modal);
    }, 300);

    if (wasCompleted) {
      // Refresh dashboard to show new management group
      if (window.dashboard) {
        window.dashboard.refresh();
      }
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    if (window.showToast) {
      window.showToast(message, 'success');
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    if (window.showToast) {
      window.showToast(message, 'error');
    }
  }
}

// Make available globally
window.SetupComponent = SetupComponent;