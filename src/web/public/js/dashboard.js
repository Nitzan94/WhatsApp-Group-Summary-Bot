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