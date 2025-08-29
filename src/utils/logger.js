const winston = require('winston');
const config = require('../../config/bot-config');

// Create logs directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('./logs')) {
  fs.mkdirSync('./logs', { recursive: true });
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
    })
  ),
  transports: [
    // Console logging
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // File logging
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: config.logging.maxSize || '10m',
      maxFiles: config.logging.maxFiles || 7,
      tailable: true
    })
  ]
});

module.exports = logger;