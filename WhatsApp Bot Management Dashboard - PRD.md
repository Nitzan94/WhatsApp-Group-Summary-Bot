# WhatsApp Bot Management Dashboard - PRD
*Product Requirements Document*

## 📋 Executive Summary

**Product:** Web-based management dashboard for existing WhatsApp bot system
**Objective:** Create a professional UI to manage bot configuration, monitoring, and task scheduling
**Integration:** Add Express.js web interface to existing `src/bot.js` without disrupting current functionality

---

## 🎯 Project Scope & Requirements

### **Primary Goal**
Transform existing command-line WhatsApp bot into a full-featured web-managed system while preserving all current functionality.

### **Current System Overview**
- WhatsApp bot running via `node src/bot.js`
- Task management through text files converted to CRON jobs
- Group-based management system using Group IDs
- Group management and definition is from the code
- API key management system from the code
- Automated task scheduling system from text files

---

## 🔧 Technical Requirements

### **1. Architecture Integration**
- **Framework:** Add Express.js server to existing `src/bot.js`
- **Port:** as the bot now (configurable via environment)
- **Launch:** Single command `node src/bot.js` starts both bot and web interface
- **Data Persistence:** Utilize existing file-based configuration system
- **No Breaking Changes:** Preserve all existing bot functionality

### **2. Core Dashboard Features**

#### **2.1 Connection Status Monitor**
```javascript
// Required Display Elements:
- Bot connection status (Connected/Disconnected/Connecting)
- Connected WhatsApp account details
- Uptime counter
- Last activity timestamp
- Connection quality indicators
- Auto-refresh status every 5 seconds
```

#### **2.2 Management Groups Configuration**
```javascript
// Features Required:
- Display current management groups list
- Add new groups by NAME (not ID)
- Automatic Group ID resolution from group name
- Smart group search with suggestions
- Edit/Remove existing management groups
- Group status indicators (Active/Inactive/Not Found)
- Real-time group validation
```

#### **2.3 API Key Management**
```javascript
// Security & Management:
- Secure API key input field (masked display)
- API key validation system
- Multiple API keys support (if needed)
- Test API connectivity button
- Last API usage timestamp
- API quota/usage indicators (if applicable)
```

#### **2.4 Task & Schedule Management**
```javascript
// Task Types:
1. Recurring Tasks (תזמונים)
   - CRON expression based
   - Human-readable schedule display
   - Template message support
   - Enable/Disable toggle
   - Next execution time display

2. One-time Tasks (משימות חד פעמיות)
   - Specific date/time execution
   - Immediate execution option
   - Status tracking (Pending/Completed/Failed)

// Required Interface:
- Visual task list with status indicators
- Add new task modal/form
- Edit existing tasks
- Delete tasks with confirmation
- Task execution history
- Task logs and results display
```

---

## 🎨 UI/UX Requirements

### **3.1 Dashboard Layout**
```
┌─────────────────────────────────────────┐
│ Header: WhatsApp Bot Management         │
├─────────────────────────────────────────┤
│ Status Cards Row:                       │
│ [Connection] [Groups] [Tasks] [API]     │
├─────────────────────────────────────────┤
│ Main Content Area:                      │
│ ┌─────────────┐ ┌─────────────────────┐│
│ │ Quick       │ │ Task Management     ││
│ │ Actions     │ │ List & Controls     ││
│ │             │ │                     ││
│ └─────────────┘ └─────────────────────┘│
├─────────────────────────────────────────┤
│ Groups Configuration Section            │
└─────────────────────────────────────────┘
```

### **3.2 Design Standards**
- **Framework:** Tailwind CSS for styling
- **Icons:** Font Awesome or Lucide React icons
- **Colors:** Professional dark/light theme support
- **Responsiveness:** Full mobile and desktop compatibility
- **Language:** Hebrew RTL support where appropriate
- **Accessibility:** WCAG 2.1 compliance

---

## 🔄 Functional Requirements

### **4.1 Group Management Flow**
1. **Add Group by Name:**
   - User enters group name in text field
   - System searches WhatsApp groups for matching names
   - Display search results with group details
   - User selects correct group
   - System stores group name + resolved ID

2. **Auto Group ID Resolution:**
   - Background process to refresh group IDs periodically
   - Handle group name changes
   - Alert when groups become unavailable
   - Suggest similar group names for failed matches

### **4.2 Task Management Flow**
1. **Create Task:**
   - Task type selection (Recurring/One-time)
   - Schedule definition (CRON or datetime picker)
   - Message/Action configuration
   - Target group selection
   - Validation and preview

2. **Task Execution:**
   - Integration with existing CRON system
   - Real-time execution status updates
   - Error handling and retry logic
   - Execution history logging

### **4.3 Configuration Management**
- **Export/Import:** Configuration backup and restore
- **Validation:** Real-time configuration validation
- **Rollback:** Previous configuration restore capability

---

## 📊 Data Requirements

### **5.1 Configuration Structure**
```javascript
// Expected existing data structure to interface with:
{
  managementGroups: [
    { name: "string", groupId: "string", active: boolean }
  ],
  apiKeys: {
    primary: "string",
    // additional keys as needed
  },
  tasks: {
    recurring: [
      {
        id: "uuid",
        name: "string",
        cron: "string",
        message: "string",
        targetGroups: ["string"],
        active: boolean,
        lastRun: "datetime",
        nextRun: "datetime"
      }
    ],
    oneTime: [
      {
        id: "uuid",
        name: "string",
        executeAt: "datetime",
        message: "string",
        targetGroups: ["string"],
        status: "pending|completed|failed"
      }
    ]
  }
}
```

### **5.2 File System Integration**
- Read existing configuration files
- Write updates without corrupting current system
- Maintain backward compatibility with current text-file task management
- Atomic file operations to prevent corruption

---

## 🚨 Security Requirements

### **6.1 Access Control**
- Optional basic authentication for dashboard access
- API key masking in UI (show only last 4 characters)
- Secure storage of sensitive configuration
- Input validation and sanitization

### **6.2 Data Protection**
- No API keys in browser localStorage
- Encrypted configuration files (if not already implemented)
- Audit log for configuration changes
- Secure session management

---

## ⚡ Performance Requirements

### **7.1 Response Times**
- Dashboard load: < 2 seconds
- Status updates: < 500ms
- Configuration saves: < 1 second
- Group search: < 3 seconds

### **7.2 Resource Usage**
- Minimal impact on existing bot performance
- Efficient memory usage for web interface
- Optimized database queries (if applicable)

---

## 🧪 Testing Requirements

### **8.1 Critical Test Cases**
1. **Integration Testing:**
   - Verify bot continues normal operation with UI added
   - Test configuration changes don't break bot functionality
   - Validate CRON integration works correctly

2. **UI Testing:**
   - Group search and ID resolution accuracy
   - Task creation and execution flow
   - Status monitoring real-time updates
   - Mobile responsiveness

3. **Security Testing:**
   - API key protection
   - Input validation
   - Access control (if implemented)

---

## 📋 Acceptance Criteria

### **9.1 Must Have (MVP)**
✅ Single command launch (`node src/bot.js`) starts both bot and web UI
✅ Real-time connection status monitoring
✅ Group management with name-to-ID resolution
✅ Task creation and management interface
✅ API key configuration interface
✅ Mobile-responsive design
✅ Integration with existing file-based configuration
✅ No disruption to current bot functionality

### **9.2 Should Have**
- Task execution history and logs
- Configuration export/import
- Theme switching (dark/light)
- Advanced CRON expression builder
- Group search with autocomplete

### **9.3 Could Have**
- Multi-user access control
- Dashboard widgets customization
- Advanced analytics and reporting
- Webhook integration for external systems

---

## 🗓️ Technical Constraints

### **10.1 Technology Stack**
- **Backend:** Node.js with Express.js (integrate with existing)
- **Frontend:** Pure HTML/CSS/JavaScript (no build process) or lightweight framework
- **Database:** File-based system (maintain current approach)
- **Authentication:** Optional, basic implementation if needed

### **10.2 Compatibility**
- Node.js version compatibility with existing bot
- WhatsApp Web.js library integration
- Existing CRON job system preservation
- Current configuration file format support

---

## 🎯 Success Metrics

1. **Functionality:** All existing bot features work unchanged
2. **Usability:** Non-technical users can manage bot configuration
3. **Reliability:** 99%+ uptime for both bot and web interface
4. **Performance:** No measurable impact on bot response times
5. **Security:** No configuration data exposure or vulnerabilities

---

## 📞 Support & Maintenance

### **11.1 Documentation Required**
- Setup and installation guide
- User manual for dashboard features
- API documentation for integration
- Troubleshooting guide

### **11.2 Monitoring**
- Error logging for both bot and web interface
- Performance monitoring
- Configuration change audit trail

---

**Priority Level:** High
**Complexity:** Medium
**Estimated Development Time:** 2-3 weeks
**Risk Level:** Low (non-breaking integration)

---

*This PRD serves as the complete specification for developing a professional web management interface for the existing WhatsApp bot system. All requirements are designed to enhance the current system without disrupting its proven functionality.*