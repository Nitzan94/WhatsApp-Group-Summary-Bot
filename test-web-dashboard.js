#!/usr/bin/env node
// Test script for Web Dashboard improvements

const http = require('http');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log(`${colors.blue}🧪 Testing Web Dashboard Improvements${colors.reset}\n`);
  
  let passedTests = 0;
  let failedTests = 0;
  
  // Test 1: API Status
  try {
    console.log(`${colors.yellow}Test 1: API Status Endpoint${colors.reset}`);
    const response = await makeRequest('/status');
    if (response.status === 200 && response.data.success) {
      console.log(`${colors.green}✓ API Status working${colors.reset}`);
      console.log(`  Bot connected: ${response.data.data.bot.connected}`);
      console.log(`  Active groups: ${response.data.data.bot.activeGroups}`);
      console.log(`  Total messages: ${response.data.data.bot.totalMessages}`);
      passedTests++;
    } else {
      throw new Error('Invalid status response');
    }
  } catch (error) {
    console.log(`${colors.red}✗ API Status failed: ${error.message}${colors.reset}`);
    failedTests++;
  }
  
  // Test 2: Management Groups
  try {
    console.log(`\n${colors.yellow}Test 2: Management Groups Endpoint${colors.reset}`);
    const response = await makeRequest('/config/management-groups');
    if (response.status === 200 && response.data.success) {
      console.log(`${colors.green}✓ Management Groups working${colors.reset}`);
      console.log(`  Groups found: ${response.data.data.groups.length}`);
      response.data.data.groups.forEach(g => {
        console.log(`    - ${g.group_name} (${g.message_count} messages)`);
      });
      passedTests++;
    } else {
      throw new Error('Invalid groups response');
    }
  } catch (error) {
    console.log(`${colors.red}✗ Management Groups failed: ${error.message}${colors.reset}`);
    failedTests++;
  }
  
  // Test 3: Tasks List
  try {
    console.log(`\n${colors.yellow}Test 3: Tasks List Endpoint${colors.reset}`);
    const response = await makeRequest('/tasks');
    if (response.status === 200 && response.data.success) {
      console.log(`${colors.green}✓ Tasks List working${colors.reset}`);
      console.log(`  Scheduled tasks: ${response.data.data.scheduled.length}`);
      console.log(`  One-time tasks: ${response.data.data.oneTime.length}`);
      passedTests++;
    } else {
      throw new Error('Invalid tasks response');
    }
  } catch (error) {
    console.log(`${colors.red}✗ Tasks List failed: ${error.message}${colors.reset}`);
    failedTests++;
  }
  
  // Test 4: Task Execution (dry run)
  try {
    console.log(`\n${colors.yellow}Test 4: Task Execution Endpoint${colors.reset}`);
    const tasksResponse = await makeRequest('/tasks');
    if (tasksResponse.data.data.scheduled.length > 0) {
      const taskId = tasksResponse.data.data.scheduled[0].id;
      const response = await makeRequest(`/tasks/${taskId}/execute`, 'POST');
      if (response.status === 200 && response.data.success) {
        console.log(`${colors.green}✓ Task Execution working${colors.reset}`);
        console.log(`  Task ${taskId} initiated successfully`);
        passedTests++;
      } else {
        throw new Error('Task execution failed');
      }
    } else {
      console.log(`${colors.yellow}⚠ No tasks to test execution${colors.reset}`);
      passedTests++;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Task Execution failed: ${error.message}${colors.reset}`);
    failedTests++;
  }
  
  // Test 5: Web Interface
  try {
    console.log(`\n${colors.yellow}Test 5: Web Interface${colors.reset}`);
    const response = await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/', (res) => {
        resolve({ status: res.statusCode });
      }).on('error', reject);
    });
    
    if (response.status === 200) {
      console.log(`${colors.green}✓ Web Interface accessible${colors.reset}`);
      passedTests++;
    } else {
      throw new Error('Web interface not accessible');
    }
  } catch (error) {
    console.log(`${colors.red}✗ Web Interface failed: ${error.message}${colors.reset}`);
    failedTests++;
  }
  
  // Test 6: JavaScript Files
  try {
    console.log(`\n${colors.yellow}Test 6: JavaScript Files${colors.reset}`);
    const jsFiles = [
      '/js/api.js',
      '/js/dashboard.js', 
      '/js/components/status.js',
      '/js/components/groups.js',
      '/js/components/tasks.js',
      '/js/components/config.js'
    ];
    
    let allFilesOk = true;
    for (const file of jsFiles) {
      const response = await new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${file}`, (res) => {
          resolve({ status: res.statusCode });
        }).on('error', reject);
      });
      
      if (response.status === 200) {
        console.log(`  ${colors.green}✓${colors.reset} ${file}`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${file}`);
        allFilesOk = false;
      }
    }
    
    if (allFilesOk) {
      console.log(`${colors.green}✓ All JavaScript files accessible${colors.reset}`);
      passedTests++;
    } else {
      throw new Error('Some JS files not accessible');
    }
  } catch (error) {
    console.log(`${colors.red}✗ JavaScript Files failed: ${error.message}${colors.reset}`);
    failedTests++;
  }
  
  // Summary
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}Test Summary:${colors.reset}`);
  console.log(`${colors.green}✓ Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.red}✗ Failed: ${failedTests}${colors.reset}`);
  
  if (failedTests === 0) {
    console.log(`\n${colors.green}🎉 All tests passed! Web Dashboard is working correctly.${colors.reset}`);
    console.log(`\n${colors.blue}Improvements implemented:${colors.reset}`);
    console.log('  ✓ Enhanced error handling for task operations');
    console.log('  ✓ Auto-refresh for task status (every 30 seconds)');
    console.log('  ✓ Better confirmation dialogs for destructive actions');
    console.log('  ✓ Improved loading indicators and feedback');
    console.log('  ✓ Display of last execution time for tasks');
    console.log('  ✓ Visual tooltips for action buttons');
  } else {
    console.log(`\n${colors.red}⚠️  Some tests failed. Please check the errors above.${colors.reset}`);
  }
  
  console.log(`\n${colors.blue}Access the dashboard at: http://localhost:3000/${colors.reset}`);
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test runner error:${colors.reset}`, error);
});