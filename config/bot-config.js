require('dotenv').config();

module.exports = {
  // OpenRouter API Configuration
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    baseURL: 'https://openrouter.ai/api/v1'
  },

  // Bot Settings
  bot: {
    name: process.env.BOT_NAME || 'GroupSummaryBot',
    maxMessagesPerSummary: parseInt(process.env.MAX_MESSAGES_PER_SUMMARY) || 100,
    summaryLanguage: process.env.SUMMARY_LANGUAGE || 'hebrew',
    retryAttempts: 3,
    retryDelay: 5000
  },

  // Database Configuration
  database: {
    path: process.env.DB_PATH || './data/messages.db',
    timeout: 10000
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/bot.log',
    maxFiles: 7,
    maxSize: '10m'
  },

  // Security Settings
  security: {
    authorizedUsers: process.env.AUTHORIZED_USERS ? 
      process.env.AUTHORIZED_USERS.split(',') : [],
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each user to 100 requests per windowMs
    }
  },

  // Schedule Configuration
  schedule: {
    default: process.env.DEFAULT_SCHEDULE || '0 16 * * *',
    timezone: 'Asia/Jerusalem'
  },

  // Baileys Configuration
  baileys: {
    printQRInTerminal: true,
    browser: ['WhatsApp Group Bot', 'Desktop', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 60000
  }
};