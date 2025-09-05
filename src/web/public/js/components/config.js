class ConfigComponent {
  constructor() {
    this.apiKeyInput = document.getElementById('api-key-input');
    this.toggleBtn = document.getElementById('toggle-api-key');
    this.testBtn = document.getElementById('test-api-btn');
    this.saveBtn = document.getElementById('save-api-btn');
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
    this.saveBtn.addEventListener('click', () => this.saveApiKey());
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
    let apiKey = this.apiKeyInput.value.trim();
    
    // If no key entered, use the existing key from server
    if (!apiKey) {
      try {
        const statusResponse = await window.API.getApiKeyStatus();
        if (statusResponse.data && statusResponse.data.keyPresent) {
          // Use existing API key for testing
          apiKey = 'EXISTING_KEY'; // Signal to use existing key
        } else {
          this.showToast('נא להזין מפתח API', 'error');
          return;
        }
      } catch (error) {
        this.showToast('נא להזין מפתח API', 'error');
        return;
      }
    }

    // Show loading state
    this.testBtn.disabled = true;
    this.testBtn.textContent = 'בודק...';
    
    try {
      const response = await window.API.testApiKey(apiKey);
      
      if (response.success) {
        this.showToast(`החיבור תקין! ${response.details || ''}`, 'success');
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

  async saveApiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    const model = this.currentModel.textContent.trim() || 'anthropic/claude-3.5-sonnet';
    
    if (!apiKey) {
      this.showToast('נא להזין מפתח API לפני השמירה', 'error');
      return;
    }

    // Show loading state
    this.saveBtn.disabled = true;
    this.saveBtn.innerHTML = '<span>שומר...</span>';
    
    try {
      const response = await window.API.saveApiKey(apiKey, model);
      
      if (response.success) {
        this.showToast('המפתח נשמר בהצלחה!', 'success');
        // Clear the input field for security
        this.apiKeyInput.value = '';
        // Reload API status to show updated info
        await this.loadApiStatus();
      } else {
        this.showToast(response.error || 'שגיאה בשמירת המפתח', 'error');
      }
    } catch (error) {
      this.showToast('שגיאה בשמירת המפתח', 'error');
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.innerHTML = `
        <span>שמור מפתח</span>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
        </svg>
      `;
    }
  }

  showToast(message, type = 'info') {
    window.showToast?.(message, type);
  }
}

window.ConfigComponent = ConfigComponent;