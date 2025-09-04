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