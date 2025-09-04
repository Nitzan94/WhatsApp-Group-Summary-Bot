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