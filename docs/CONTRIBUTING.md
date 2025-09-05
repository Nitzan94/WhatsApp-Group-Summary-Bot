# 🤝 Contributing Guide

## 📋 Overview

Welcome to the WhatsApp AI Agent Bot project! This guide will help you contribute effectively to this sophisticated AI-powered WhatsApp bot that uses Claude 3.5 Sonnet for intelligent message analysis.

## 🎯 Project Architecture Understanding

Before contributing, ensure you understand the core architecture:

### Key Components
- **ConversationHandler**: AI Agent core using Claude 3.5 Sonnet
- **DatabaseAgentTools**: 5 smart tools for database interaction
- **messaging-history.set Events**: Critical WhatsApp history sync mechanism
- **SQLite + FTS5**: Optimized database with full-text search

### Critical Files
```
src/
├── bot.js                    # Main WhatsApp bot logic
├── services/
│   ├── ConversationHandler.js # AI Agent implementation  
│   ├── DatabaseAgentTools.js  # Database tools for AI
│   └── SchedulerService.js    # Automated scheduling
├── database/
│   ├── DatabaseManager.js     # SQLite operations
│   └── schema.sql             # Database schema
```

## 🚀 Development Setup

### Prerequisites
```bash
# Required versions
Node.js >= 22.18.0
npm >= 8.0.0
SQLite >= 3.35.0

# Development tools
git >= 2.25.0
```

### Local Development Environment
```bash
# Fork and clone the repository
git clone https://github.com/your-username/whatsapp-ai-bot.git
cd whatsapp-ai-bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your development API keys
nano .env
```

### Development Environment Configuration
```bash
# .env for development
NODE_ENV=development
OPENROUTER_API_KEY=sk-or-v1-your-dev-key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
DB_PATH=./data/messages-dev.db
LOG_LEVEL=debug
PHONE_NUMBER=  # Leave empty for QR code auth
```

### Development Database Setup
```bash
# Initialize development database
node test-database.js

# Verify database schema
sqlite3 data/messages-dev.db ".schema"

# Run basic tests
node test-summary.js
```

## 🏗️ Development Workflow

### Branch Strategy
```bash
# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/your-feature-name

# Work on your feature
# ... make changes ...

# Create pull request when ready
git push origin feature/your-feature-name
```

### Code Standards

#### 1. JavaScript/Node.js Standards
```javascript
// Use modern ES6+ syntax
const { functionName } = require('./module');

// Async/await over promises
async function processMessage(message) {
  try {
    const result = await this.db.getQuery(sql, params);
    return result;
  } catch (error) {
    logger.error('Error processing message:', error);
    throw error;
  }
}

// Consistent error handling
catch (error) {
  logger.error('Operation failed:', error);
  throw new CustomError('User-friendly message', error);
}
```

#### 2. Database Query Standards
```javascript
// Always use parameterized queries
const messages = await this.db.allQuery(
  'SELECT * FROM messages WHERE group_id = ? AND timestamp > ?',
  [groupId, startDate]
);

// Never use string concatenation
// ❌ BAD
const sql = `SELECT * FROM messages WHERE content LIKE '%${query}%'`;

// ✅ GOOD  
const sql = 'SELECT * FROM messages WHERE content LIKE ?';
const params = [`%${query}%`];
```

#### 3. AI Tool Development Standards
```javascript
// DatabaseAgentTools function template
async toolFunction(parameter, options = {}) {
  try {
    // Input validation
    if (!parameter) {
      throw new Error('Parameter is required');
    }

    // Build query with proper error handling
    const sql = 'SELECT * FROM table WHERE condition = ?';
    const params = [parameter];
    
    const results = await this.db.allQuery(sql, params);
    
    // Log for debugging (no sensitive data)
    logger.info(`🛠️ [DB TOOLS] Tool executed: ${results.length} results`);
    
    return results;
    
  } catch (error) {
    logger.error(`Error in ${this.toolFunction.name}:`, error);
    return []; // Always return safe fallback
  }
}
```

#### 4. Logging Standards
```javascript
// Use structured logging with context
logger.info('🤖 [AI AGENT] Processing query', {
  queryLength: question.length,
  groupId: context.groupId,
  timestamp: new Date().toISOString()
});

// Error logging with full context
logger.error('Database operation failed', {
  operation: 'getMessages',
  error: error.message,
  stack: error.stack,
  context: { groupId, dateRange }
});
```

### Testing Requirements

#### Unit Tests
```javascript
// test/database-agent-tools.test.js
describe('DatabaseAgentTools', () => {
  let dbTools;
  let mockDb;
  
  beforeEach(() => {
    mockDb = {
      allQuery: jest.fn(),
      getQuery: jest.fn()
    };
    dbTools = new DatabaseAgentTools(mockDb);
  });
  
  describe('searchGroups', () => {
    it('should return all groups when no search term', async () => {
      // Arrange
      const mockGroups = [
        { id: '1', name: 'Test Group 1' },
        { id: '2', name: 'Test Group 2' }
      ];
      mockDb.allQuery.mockResolvedValue(mockGroups);
      
      // Act
      const result = await dbTools.searchGroups();
      
      // Assert
      expect(result).toEqual(mockGroups);
      expect(mockDb.allQuery).toHaveBeenCalledWith(
        'SELECT id, name FROM groups WHERE is_active = 1 ORDER BY name',
        []
      );
    });
    
    it('should filter groups by search term', async () => {
      // Test implementation
    });
  });
});
```

#### Integration Tests
```javascript
// test/integration/ai-agent.test.js
describe('AI Agent Integration', () => {
  let bot;
  let testDb;
  
  beforeAll(async () => {
    // Setup test database with sample data
    testDb = new DatabaseManager('./data/test.db');
    await testDb.initialize();
    // Insert test data
  });
  
  afterAll(async () => {
    // Cleanup test database
    await testDb.close();
    fs.unlinkSync('./data/test.db');
  });
  
  it('should handle natural language queries', async () => {
    // Test full AI Agent workflow
  });
});
```

### Code Review Checklist

#### Before Submitting PR
- [ ] All tests pass locally (`npm test`)
- [ ] Code follows established patterns and standards
- [ ] No console.log statements (use logger instead)
- [ ] Error handling implemented for all database calls
- [ ] No hardcoded values (use configuration)
- [ ] Documentation updated for new features
- [ ] No sensitive information in code or tests

#### Security Checklist
- [ ] All database queries use parameterized statements
- [ ] No API keys or secrets in code
- [ ] Input validation for all user-facing functions
- [ ] Error messages don't expose internal details
- [ ] Proper authentication checks for admin features

## 🔧 Common Development Tasks

### Adding a New DatabaseAgentTool

1. **Define the tool function in DatabaseAgentTools.js**:
```javascript
async newToolFunction(parameter, options = {}) {
  try {
    // Implementation with proper error handling
    const results = await this.db.allQuery(sql, params);
    logger.info(`🛠️ [DB TOOLS] New tool executed: ${results.length} results`);
    return results;
  } catch (error) {
    logger.error('Error in newToolFunction:', error);
    return [];
  }
}
```

2. **Add tool definition to createToolDefinitions()**:
```javascript
{
  name: 'new_tool_function',
  description: 'Clear description of what this tool does',
  parameters: {
    type: 'object',
    properties: {
      parameter: {
        type: 'string',
        description: 'Parameter description'
      }
    },
    required: ['parameter']
  }
}
```

3. **Add execution case to executeTool()**:
```javascript
case 'new_tool_function':
  return await this.newToolFunction(
    parameters.parameter,
    parameters.options
  );
```

4. **Write comprehensive tests**
5. **Update API.md documentation**

### Modifying AI Agent Behavior

1. **System prompt changes** in `ConversationHandler.js`:
```javascript
buildSystemPromptForAgent() {
  const currentDate = new Date().toISOString().split('T')[0];
  
  return `אתה AI Agent חכם המתמחה בניתוח הודעות WhatsApp.
  
⏰ **תאריך נוכחי: ${currentDate}**

🛠️ **כלים זמינים:**
[Tool descriptions...]

📋 **הוראות:**
[Specific instructions for the AI...]`;
}
```

2. **Test changes thoroughly** with various query types
3. **Document behavior changes** in CLAUDE.md

### Database Schema Changes

1. **Create migration script**:
```sql
-- migrations/002_add_new_table.sql
CREATE TABLE new_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_new_table_created_at ON new_table(created_at);
```

2. **Update schema.sql** with full current schema
3. **Update DatabaseManager.js** if needed
4. **Test migration thoroughly**

## 🐛 Debugging Guide

### Common Issues and Solutions

#### 1. Database Method Errors
```
TypeError: this.db.get is not a function
```
**Solution**: Use correct DatabaseManager methods:
- `this.db.getQuery()` instead of `this.db.get()`  
- `this.db.allQuery()` instead of `this.getAllQuery()`

#### 2. AI Agent Tool Calling Issues
```javascript
// Debug tool calling
logger.debug('🛠️ Tool call details:', {
  toolName: name,
  arguments: args,
  parsedArgs: parsedArgs
});
```

#### 3. WhatsApp Connection Problems
```javascript
// Add detailed connection logging
socket.ev.on('connection.update', (update) => {
  logger.debug('WhatsApp connection update:', update);
});
```

### Development Debugging Tools

#### Database Inspection
```bash
# Interactive database exploration
sqlite3 data/messages-dev.db

# Useful queries for development
SELECT COUNT(*) FROM messages;
SELECT name, COUNT(*) FROM groups g LEFT JOIN messages m ON g.id = m.group_id GROUP BY g.id;
SELECT * FROM conversations ORDER BY created_at DESC LIMIT 5;
```

#### Log Analysis
```bash
# Real-time log monitoring
tail -f logs/bot.log | grep -E "(ERROR|WARN|🛠️|🤖)"

# Filter AI Agent activity
grep "AI AGENT" logs/bot.log | tail -20

# Database tool activity
grep "DB TOOLS" logs/bot.log | tail -20
```

## 📖 Documentation Standards

### Code Documentation
```javascript
/**
 * Searches for messages within a specific group with advanced filtering
 * 
 * @param {string} groupId - WhatsApp group ID
 * @param {string|null} searchQuery - Text to search for in messages
 * @param {Object} options - Search options
 * @param {string} options.dateStart - ISO date string for start date
 * @param {string} options.dateEnd - ISO date string for end date  
 * @param {number} options.limit - Maximum number of results (default: 100)
 * @returns {Promise<Array>} Array of message objects
 * 
 * @example
 * const messages = await searchMessagesInGroup(
 *   "120363165018257961",
 *   "בינה מלאכותית", 
 *   { 
 *     dateStart: "2025-08-24T00:00:00.000Z",
 *     limit: 50 
 *   }
 * );
 */
async searchMessagesInGroup(groupId, searchQuery = null, options = {}) {
  // Implementation...
}
```

### README Updates
When adding new features, update relevant sections:
- Feature list in main README.md
- Usage examples
- Configuration options
- API documentation references

## 🚀 Release Process

### Version Management
```bash
# Update version in package.json
npm version patch   # Bug fixes
npm version minor   # New features  
npm version major   # Breaking changes
```

### Release Checklist
- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped appropriately
- [ ] Tag created with release notes
- [ ] Production deployment tested

## 🤝 Community Guidelines

### Communication
- Use GitHub Issues for bug reports and feature requests
- Use GitHub Discussions for general questions
- Be respectful and constructive in all interactions
- Provide detailed information when reporting issues

### Code of Conduct
- Be inclusive and welcoming to all contributors
- Focus on constructive feedback in code reviews
- Respect different approaches and experience levels
- Help maintain a positive community environment

---

## 🏆 Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file  
- Release notes for significant contributions
- Special thanks in README.md for major features

**Thank you for contributing to the WhatsApp AI Agent Bot project! Your contributions help make this tool more powerful and accessible to users worldwide.**