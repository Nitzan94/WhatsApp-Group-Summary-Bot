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
      try {
        const data = JSON.parse(event.data);
        callback(data);
      } catch (error) {
        console.error('Failed to parse SSE data:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Try to reconnect after a delay if connection is closed
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('SSE connection closed, will attempt to reconnect...');
      }
    };
    
    eventSource.onopen = () => {
      console.log('SSE connection established');
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

  // Initial Setup & Available Groups endpoints
  async getSetupStatus() {
    return this.request('/setup/status');
  }
  
  async getAvailableGroups() {
    const response = await this.request('/setup/groups');
    return response.data || [];
  }
  
  async completeSetup(selectedGroupName) {
    return this.request('/setup/complete', {
      method: 'POST',
      body: JSON.stringify({ selectedGroupName })
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
  
  async saveApiKey(apiKey, model) {
    return this.request('/config/api-key/save', {
      method: 'POST',
      body: JSON.stringify({ apiKey, model })
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