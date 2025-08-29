#!/usr/bin/env node
/**
 * WhatsApp Group Summary Bot
 * Powered by Baileys - A lightweight WhatsApp Web API
 */

const { 
  default: makeWASocket, 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const config = require('../config/bot-config');

class WhatsAppBot {
  constructor() {
    this.socket = null;
    this.qrAttempts = 0;
    this.maxQrAttempts = 3;
    this.isConnected = false;
    this.pairingOffered = false;
    this.pairingCodeSent = false;
    this.sessionPath = path.join(__dirname, '../data/sessions');
    this.phoneNumber = process.env.PHONE_NUMBER || null; // For pairing code authentication
    
    // Ensure session directory exists
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      logger.info('Created sessions directory');
    }

    // Log authentication method
    if (this.phoneNumber) {
      logger.info(`🔑 מוגדר לפיירינג קוד עם מספר: ${this.phoneNumber}`);
    } else {
      logger.info('📱 מוגדר לאותנטיקציה עם QR Code');
    }
  }

  /**
   * Initialize the WhatsApp connection
   */
  async initialize() {
    try {
      logger.info('🤖 מתחיל את WhatsApp Group Summary Bot');
      logger.info(`📱 גרסת Node.js: ${process.version}`);
      
      // Get latest Baileys version
      const { version } = await fetchLatestBaileysVersion();
      logger.info(`🔧 גרסת Baileys: ${version}`);

      await this.createConnection();
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      process.exit(1);
    }
  }

  /**
   * Create WhatsApp connection with authentication
   */
  async createConnection() {
    try {
      // Load auth state from session files
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      
      // Create socket connection
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR ourselves
        browser: config.baileys.browser,
        syncFullHistory: config.baileys.syncFullHistory,
        markOnlineOnConnect: config.baileys.markOnlineOnConnect
      });

      // Handle authentication updates
      this.socket.ev.on('creds.update', saveCreds);

      // Handle connection updates
      this.socket.ev.on('connection.update', (update) => {
        this.handleConnectionUpdate(update);
      });

      // Handle messages (will expand this later)
      this.socket.ev.on('messages.upsert', (messageUpdate) => {
        this.handleMessages(messageUpdate);
      });

      // Handle groups updates
      this.socket.ev.on('groups.upsert', (groups) => {
        logger.info(`📊 עודכנו ${groups.length} קבוצות`);
      });

    } catch (error) {
      logger.error('Failed to create connection:', error);
      throw error;
    }
  }

  /**
   * Handle connection state updates
   */
  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    // Handle authentication based on configured method
    if (connection === 'connecting' || qr) {
      if (this.phoneNumber && !this.pairingCodeSent) {
        // Use pairing code if phone number is configured
        this.pairingCodeSent = true;
        await this.requestPairingCode(this.phoneNumber);
      } else if (qr && !this.phoneNumber) {
        // Use QR code if no phone number configured
        await this.handleQRCode(qr);
        
        // Offer pairing code alternative when QR fails too many times
        if (this.qrAttempts >= this.maxQrAttempts) {
          await this.offerPairingCodeAlternative();
        }
      }
    }

    // Handle connection states
    if (connection === 'close') {
      this.handleDisconnection(lastDisconnect);
    } else if (connection === 'open') {
      this.handleSuccessfulConnection();
    } else if (connection === 'connecting') {
      logger.info('🔄 מתחבר לWhatsApp...');
    }
  }

  /**
   * Handle QR code display
   */
  async handleQRCode(qr) {
    this.qrAttempts++;
    logger.info(`📱 QR Code (ניסיון ${this.qrAttempts}/${this.maxQrAttempts}):`);
    logger.info('📲 סרוק עם WhatsApp בטלפון שלך:');
    
    // Clear screen for better QR display
    console.clear();
    console.log('\n='.repeat(60));
    console.log('🤖 WhatsApp Group Summary Bot - QR Code');
    console.log('='.repeat(60));
    console.log(`📱 ניסיון ${this.qrAttempts}/${this.maxQrAttempts}`);
    console.log('📲 סרוק את הקוד הזה עם WhatsApp בטלפון שלך:\n');
    
    try {
      // Use QRCode.toString() as recommended by Baileys documentation
      const qrString = await QRCode.toString(qr, { 
        type: 'terminal',
        small: true,
        errorCorrectionLevel: 'L'
      });
      console.log(qrString);
    } catch (error) {
      logger.error('שגיאה בהצגת QR Code:', error.message);
      // Fallback to qrcode-terminal
      qrcode.generate(qr, { 
        small: true,
        errorCorrectionLevel: 'L'
      }, (fallbackQrString) => {
        console.log(fallbackQrString);
      });
    }

    console.log('\n⏳ ממתין לסריקת QR Code...');
    console.log('💡 אם הקוד חתוך, הרחב את חלון הטרמינל');
    console.log('🔄 אחרי הסריקה, WhatsApp יבצע disconnection אוטומטי - זה נורמלי!');
    
    // Also save QR as image file for backup
    try {
      const qrImagePath = path.join(__dirname, '../data/qr-code.png');
      await QRCode.toFile(qrImagePath, qr, {
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256,
        margin: 2
      });
      console.log(`💾 QR Code נשמר גם כקובץ: ${qrImagePath}`);
    } catch (error) {
      logger.warn('Failed to save QR image:', error.message);
    }
    
    console.log('='.repeat(60));

    // Check if we've exceeded max attempts
    if (this.qrAttempts >= this.maxQrAttempts) {
      logger.warn(`⚠️  הגעת למקסימום ניסיונות QR (${this.maxQrAttempts})`);
      logger.info('💡 נסה להפעיל מחדש את הבוט או השתמש ב-pairing code');
    }
  }

  /**
   * Offer pairing code as alternative to QR when QR fails multiple times
   */
  async offerPairingCodeAlternative() {
    if (this.pairingOffered) return; // Don't offer multiple times
    this.pairingOffered = true;
    
    logger.info('\n🔑 אלטרנטיבה לQR Code - Pairing Code:');
    logger.info('📞 אם הQR Code לא עובד, אפשר להשתמש בפיירינג קוד');
    logger.info('💡 לשם כך צריך להזין את מספר הטלפון שלך');
    logger.info('⚠️  המספר חייב להיות בפורמט E.164 (בלי +)');
    logger.info('   לדוגמה: 972501234567 (במקום +972-50-123-4567)');
    logger.info('\n🔧 להפעלת פיירינג קוד, הוסף את השורה הזאת לקובץ .env:');
    logger.info('   PHONE_NUMBER=972501234567');
    logger.info('🔄 ואז הפעל מחדש את הבוט');
  }

  /**
   * Request pairing code for phone number authentication
   */
  async requestPairingCode(phoneNumber) {
    try {
      logger.info(`📱 מבקש pairing code למספר: ${phoneNumber}`);
      const code = await this.socket.requestPairingCode(phoneNumber);
      logger.info(`🔑 Pairing Code: ${code}`);
      logger.info('💬 הכנס את הקוד הזה בWhatsApp בטלפון שלך:');
      logger.info('   WhatsApp > הגדרות > מכשירים מקושרים > קשר מכשיר > הכנס קוד');
      return code;
    } catch (error) {
      logger.error('שגיאה בקבלת pairing code:', error.message);
      throw error;
    }
  }

  /**
   * Handle successful connection
   */
  handleSuccessfulConnection() {
    this.isConnected = true;
    this.qrAttempts = 0;
    this.pairingOffered = false; // Reset for next time
    
    logger.info('✅ הבוט התחבר בהצלחה לWhatsApp!');
    logger.info('🎯 הבוט מוכן לקבל פקודות');
    
    // Get bot info
    if (this.socket.user) {
      logger.info(`📱 מחובר בתור: ${this.socket.user.name || this.socket.user.id}`);
      logger.info(`📞 מספר: ${this.socket.user.id.split(':')[0]}`);
    }

    // Log available groups (will implement group detection later)
    this.logAvailableGroups();
  }

  /**
   * Handle disconnection and reconnection logic
   */
  handleDisconnection(lastDisconnect) {
    this.isConnected = false;
    
    const disconnectReason = lastDisconnect?.error?.output?.statusCode;
    
    let reasonText = 'לא ידוע';
    switch (disconnectReason) {
      case DisconnectReason.badSession:
        reasonText = 'סשן שגוי';
        break;
      case DisconnectReason.connectionClosed:
        reasonText = 'חיבור נסגר';
        break;
      case DisconnectReason.connectionLost:
        reasonText = 'חיבור אבד';
        break;
      case DisconnectReason.connectionReplaced:
        reasonText = 'חיבור הוחלף';
        break;
      case DisconnectReason.loggedOut:
        reasonText = 'התנתקות';
        break;
      case DisconnectReason.restartRequired:
        reasonText = 'נדרש ריסטרט (אחרי סריקת QR)';
        break;
      case DisconnectReason.timedOut:
        reasonText = 'פג זמן חיבור';
        break;
    }

    logger.warn(`❌ חיבור נותק: ${reasonText}`);

    // Handle restartRequired separately - this happens after QR scan
    if (disconnectReason === DisconnectReason.restartRequired) {
      logger.info('✅ QR נסרק בהצלחה! יוצר חיבור חדש...');
      // Create a new socket connection after QR scan - don't reuse the old one
      setTimeout(() => {
        this.createConnection();
      }, 2000);
      return;
    }

    // Handle device_removed / 401 errors - clear session and require re-authentication
    if (disconnectReason === DisconnectReason.loggedOut || 
        lastDisconnect?.error?.message?.includes('device_removed') || 
        lastDisconnect?.error?.message?.includes('Stream Errored (conflict)')) {
      
      logger.error('🚫 המכשיר הוסר מWhatsApp Web או יש התנגשות');
      logger.info('🧹 מנקה session ודורש התחברות מחדש...');
      
      // Clear the session to force re-authentication
      this.clearSessionAndReconnect();
      return;
    }

    // Handle other disconnection reasons
    const shouldReconnect = disconnectReason !== DisconnectReason.loggedOut;
    
    if (shouldReconnect) {
      logger.info('🔄 מנסה להתחבר מחדש...');
      setTimeout(() => {
        this.createConnection();
      }, 5000); // Wait 5 seconds before reconnecting
    } else {
      logger.error('🚫 נדרשת התחברות מחדש ידנית');
      logger.info('💡 הפעל מחדש את הבוט');
    }
  }

  /**
   * Clear session and force re-authentication
   */
  async clearSessionAndReconnect() {
    try {
      // Clear session files
      if (fs.existsSync(this.sessionPath)) {
        fs.rmSync(this.sessionPath, { recursive: true, force: true });
        logger.info('✅ Session נמחק');
      }
      
      // Reset state
      this.qrAttempts = 0;
      this.pairingCodeSent = false;
      this.pairingOffered = false;
      
      // Recreate session directory
      if (!fs.existsSync(this.sessionPath)) {
        fs.mkdirSync(this.sessionPath, { recursive: true });
      }
      
      // Wait a bit then reconnect
      setTimeout(() => {
        logger.info('🔄 יוצר חיבור חדש עם אותנטיקציה מחדש...');
        this.createConnection();
      }, 3000);
      
    } catch (error) {
      logger.error('שגיאה בניקוי session:', error.message);
      logger.info('💡 הפעל מחדש את הבוט ידנית');
    }
  }

  /**
   * Handle incoming messages (basic implementation)
   */
  handleMessages(messageUpdate) {
    const { messages } = messageUpdate;
    
    for (const message of messages) {
      if (message.key.fromMe) continue; // Skip own messages
      
      const messageType = Object.keys(message.message || {})[0];
      const messageContent = message.message?.[messageType];
      
      // Log received message (for debugging)
      logger.debug(`📩 הודעה התקבלה: ${messageType} מ-${message.key.remoteJid}`);
      
      // Basic message handling (will expand this later)
      if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
        const text = messageContent?.text || messageContent;
        if (text?.startsWith('!')) {
          logger.info(`📝 פקודה התקבלה: ${text}`);
          // Will implement command handling in next phase
        }
      }
    }
  }

  /**
   * Log available groups for debugging
   */
  async logAvailableGroups() {
    try {
      // Will implement proper group detection later
      logger.info('📊 מאתר קבוצות זמינות...');
      // For now, just log that we're ready
      logger.info('✨ הבוט מוכן לפעולה!');
    } catch (error) {
      logger.error('Failed to get groups:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('🔄 מתחיל כיבוי מבוקר...');
    
    if (this.socket) {
      try {
        await this.socket.end();
        logger.info('✅ החיבור נסגר בהצלחה');
      } catch (error) {
        logger.error('Error closing connection:', error);
      }
    }
    
    logger.info('👋 הבוט הושבת');
    process.exit(0);
  }
}

// Handle process termination gracefully
const bot = new WhatsAppBot();

process.on('SIGINT', () => {
  logger.info('📱 נתקבל אות SIGINT');
  bot.shutdown();
});

process.on('SIGTERM', () => {
  logger.info('📱 נתקבל אות SIGTERM');
  bot.shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  bot.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  bot.shutdown();
});

// Start the bot
if (require.main === module) {
  bot.initialize().catch((error) => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  });
}

module.exports = WhatsAppBot;