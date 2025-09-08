#!/usr/bin/env node
/**
 * WhatsApp Group Summary Bot
 * Powered by Baileys - A lightweight WhatsApp Web API
 */

console.log('🚀 Starting WhatsApp Bot...');

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
const DatabaseManager = require('./database/DatabaseManager');
const SchedulerService = require('./services/SchedulerService');
const ConversationHandler = require('./services/ConversationHandler');
const TaskExecutionService = require('./services/TaskExecutionService');
const ConfigService = require('./services/ConfigService');
const WebServer = require('./web/WebServer');

class WhatsAppBot {
  constructor() {
    this.socket = null;
    this.qrAttempts = 0;
    this.maxQrAttempts = 3;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.isConnected = false;
    this.pairingOffered = false;
    this.pairingCodeSent = false;
    this.sessionPath = path.join(__dirname, '../data/sessions');
    this.phoneNumber = process.env.PHONE_NUMBER || null; // For pairing code authentication
    this.db = new DatabaseManager();
    this.conversationHandler = new ConversationHandler(this.db);
    this.taskExecutionService = new TaskExecutionService(this.db, this.conversationHandler, this);
    this.schedulerService = new SchedulerService(this, this.db, this.conversationHandler, this.taskExecutionService);
    this.summaryTargetGroupId = '972546262108-1556219067@g.us'; // קבוצת "ניצן"
    this.isHistorySyncComplete = false; // Track if initial history sync is done
    
    // Web Dashboard Components
    this.configService = new ConfigService(this.db);
    
    // Inject ConfigService into ConversationHandler for dynamic group management
    this.conversationHandler.setConfigService(this.configService);
    
    // Initialize SyncManager for two-way sync between web dashboard and files
    const SyncManager = require('./services/SyncManager');
    this.syncManager = new SyncManager(this.configService, this.schedulerService, this.db);
    
    this.webServer = new WebServer(this, this.db, this.configService);
    
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
      
      // Initialize database
      await this.db.initialize();
      
      // Initialize task execution service
      await this.taskExecutionService.initialize();
      logger.info('🚀 TaskExecutionService אותחל בהצלחה');
      
      // Initialize scheduler service
      await this.schedulerService.initialize();
      logger.info('⏰ מערכת תזמונים אותחלה');

      // Initialize conversation handler
      await this.conversationHandler.initialize();
      // Set bot instance for message sending functionality
      this.conversationHandler.setBotInstance(this);
      logger.info('🤖 מערכת שיחה טבעית אותחלה');
      
      // Initialize web dashboard
      try {
        const webInfo = await this.webServer.start();
        logger.info(`🌐 דשבורד ווב הופעל: ${webInfo.url}`);
      } catch (webError) {
        logger.error('⚠️ שגיאה בהפעלת דשבורד הווב:', webError);
        logger.warn('הבוט ימשיך לפעול ללא ממשק ווב');
      }
      
      // Get latest Baileys version
      const { version } = await fetchLatestBaileysVersion();
      logger.info(`🔧 גרסת Baileys: ${version}`);

      // Try WhatsApp connection but don't crash if it fails
      try {
        await this.createConnection();
      } catch (whatsappError) {
        logger.error('⚠️ WhatsApp connection failed, but bot services will continue:', whatsappError.message);
        logger.info('📊 Dashboard and scheduler are still running');
        // Keep the process alive for dashboard and scheduler
        setInterval(() => {
          logger.debug('🔄 Bot services running (no WhatsApp)');
        }, 60000); // Log every minute
      }
    } catch (error) {
      logger.error('Failed to initialize bot:', error);
      process.exit(1);
    }
  }

  /**
   * Create WhatsApp connection with authentication
   */
  async createConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn('⏰ WhatsApp connection timeout, but continuing...');
        resolve(); // Resolve instead of reject to continue
      }, 45000); // 45 second timeout

      try {
        this.connectWithRetry(resolve, reject, timeout);
      } catch (error) {
        clearTimeout(timeout);
        logger.error('❌ Connection setup failed:', error.message);
        resolve(); // Don't crash, just continue
      }
    });
  }

  async connectWithRetry(resolve, reject, timeout) {
    try {
      // Load auth state from session files
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
      
      // Create socket connection with error handling
      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false, // We'll handle QR ourselves
        browser: config.baileys.browser,
        syncFullHistory: config.baileys.syncFullHistory,
        markOnlineOnConnect: config.baileys.markOnlineOnConnect,
        shouldSyncHistoryMessage: config.baileys.shouldSyncHistoryMessage,
        defaultQueryTimeoutMs: config.baileys.defaultQueryTimeoutMs,
        // Enhanced configuration for full history sync
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false,
        maxMsgRetryCount: 3, // Reduced retries to fail faster
        msgRetryCounterMap: {},
        // Add connection options to handle errors better
        connectTimeoutMs: 30000,
        connectCooldownMs: 5000
      });

      // Add global error handler for socket
      this.socket.ev.on('error', (error) => {
        logger.error('⚠️ WhatsApp Socket Error:', error.message);
        // Don't crash on socket errors
      });

      // Handle authentication updates
      this.socket.ev.on('creds.update', saveCreds);

      // Handle connection updates with error protection
      this.socket.ev.on('connection.update', (update) => {
        try {
          this.handleConnectionUpdate(update, resolve, timeout);
        } catch (error) {
          logger.error('❌ Connection update error:', error.message);
          // Don't crash, continue
        }
      });

      // Handle messages (will expand this later)
      this.socket.ev.on('messages.upsert', (messageUpdate) => {
        this.handleMessages(messageUpdate);
      });

      // Handle groups updates
      this.socket.ev.on('groups.upsert', (groups) => {
        logger.info(`📊 עודכנו ${groups.length} קבוצות`);
        
        // Only show this tip for new users (first time setup)
        if (groups.length > 0 && groups.length < 10) {
          console.log('\n🎯 ========== SETUP TIP ==========');
          console.log('To see all your groups and set up management group:');
          console.log('Send !mygroups in any WhatsApp group');
          console.log('==================================\n');
        }
        
        this.handleGroupsUpdate(groups);
      });

      // Handle historical messages
      this.socket.ev.on('messaging-history.set', (historyUpdate) => {
        this.handleMessageHistory(historyUpdate);
      });

    } catch (error) {
      clearTimeout(timeout);
      logger.error('Failed to create connection:', error.message);
      logger.warn('⚠️ WhatsApp connection failed, but services will continue');
      resolve(); // Don't crash, just continue without WhatsApp
    }
  }

  /**
   * Handle connection state updates
   */
  async handleConnectionUpdate(update, resolve = null, timeout = null) {
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
    logger.debug(`🔍 Connection state: ${connection}`); // Debug log
    if (connection === 'close') {
      this.handleDisconnection(lastDisconnect);
    } else if (connection === 'open') {
      logger.info('🔗 Connection is open, calling handleSuccessfulConnection');
      if (timeout) clearTimeout(timeout);
      this.handleSuccessfulConnection();
      if (resolve) resolve(); // Resolve the connection promise
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
    this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
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
    
    // Catch up on missed messages (after a small delay to let connection settle)
    setTimeout(() => {
      this.catchUpOnMissedMessages();
    }, 3000);
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
      
      // Check if we've exceeded max reconnect attempts
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error(`❌ חרגנו מ-${this.maxReconnectAttempts} ניסיונות התחברות. עוצר את הבוט`);
        logger.info('💡 נא לבדוק שאין WhatsApp Web פתוח במקום אחר והפעל מחדש את הבוט');
        process.exit(1);
        return;
      }
      
      this.reconnectAttempts++;
      logger.info(`🧹 מנקה session ודורש התחברות מחדש... (ניסיון ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
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
   * Handle incoming messages and save to database
   */
  async handleMessages(messageUpdate) {
    const { messages, type } = messageUpdate;
    
    for (const message of messages) {
      if (message.key.fromMe) continue; // Skip own messages
      
      try {
        await this.processAndSaveMessage(message);
        
        // Handle commands
        const messageType = Object.keys(message.message || {})[0];
        const messageContent = message.message?.[messageType];
        
        if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
          const text = messageContent?.text || messageContent;
          const groupId = message.key.remoteJid;
          const senderId = message.key.participant || message.key.remoteJid;
          const senderName = message.pushName || senderId.split('@')[0];
          
          // Only log group ID on first message from each group (for setup)
          if (groupId.includes('@g.us') && !this.loggedGroups?.has(groupId)) {
            if (!this.loggedGroups) this.loggedGroups = new Set();
            this.loggedGroups.add(groupId);
            
            const groupInfo = await this.db.getGroup(groupId);
            if (groupInfo) {
              console.log(`\n🆕 New group detected:`);
              console.log(`   Group Name: ${groupInfo.name}`);
              console.log(`   Group ID: ${groupId}`);
              console.log(`   ────────────────────────`);
            }
          }
          
          if (text?.startsWith('!')) {
            // פקודות קיימות
            logger.info(`📝 פקודה התקבלה: ${text}`);
            await this.handleCommand(message, text);
          } else if (await this.isConversationGroup(groupId) && text && text.trim().length > 3) {
            // שיחה טבעית בקבוצת ניצן
            logger.info(`🗣️ שאלה טבעית מתקבלת: "${text.substring(0, 100)}..."`);
            await this.handleNaturalConversation(message, text, groupId, senderId, senderName);
          }
        }
      } catch (error) {
        logger.error('Failed to process message:', error);
      }
    }
  }

  /**
   * Extract and save contact information from private message (without saving content)
   */
  async saveContactFromPrivateMessage(message) {
    try {
      const contactJid = message.key.remoteJid;
      const contactName = message.pushName;
      const phoneNumber = contactJid.split('@')[0];
      
      if (contactName && contactName.trim() && contactName !== phoneNumber) {
        // Save only the contact info, not the message content
        await this.db.saveContact({
          name: contactName.trim(),
          phone_number: contactJid
        });
        
        logger.debug(`👤 נשמר איש קשר מהודעה פרטית: ${contactName}`);
      }
    } catch (error) {
      logger.debug('Failed to save contact from private message:', error);
    }
  }

  /**
   * Process and save message to database
   */
  async processAndSaveMessage(message) {
    const groupId = message.key.remoteJid;
    const messageId = message.key.id;
    const senderId = message.key.participant || message.key.remoteJid;
    
    // Handle private messages - extract contact info only (no message content)
    if (groupId?.endsWith('@s.whatsapp.net')) {
      await this.saveContactFromPrivateMessage(message);
      return; // Don't save the actual message content for privacy
    }
    
    // Only process group messages for full message saving
    if (!groupId?.endsWith('@g.us')) return;
    
    // Extract message content
    const messageType = Object.keys(message.message || {})[0];
    const messageContent = message.message?.[messageType];
    let content = '';
    
    // 🔥 SAFETY CHECK - handle cases where messageType is undefined
    if (!messageType) {
      logger.warn(`⚠️ No message type found for message:`, JSON.stringify(message, null, 2));
      content = '[הודעה ללא סוג]';
      
      // Save as is with unknown type
      const senderName = message.pushName || (message.key.participant || message.key.remoteJid).split('@')[0];
      await this.db.saveMessage({
        group_id: groupId,
        message_id: messageId,
        sender_id: senderId,
        sender_name: senderName,
        content,
        timestamp: new Date(message.messageTimestamp * 1000).toISOString(),
        message_type: 'unknown'
      });
      return;
    }
    
    // 🔥 DEBUG - בואי נראה מה בדיוק מגיע (expanded for all groups showing [undefined])
    const debugGroups = [
      '972546262108-1556219067@g.us', // ניצן
      '120363417758222119@g.us',      // Nitzan bot
      '120363417919003634@g.us',      // Ron.Kav Hub  
      '120363400630794167@g.us',      // הקהילה
      '120363040426958814@g.us',      // המוקד 462
      '120363144406735324@g.us',      // רמתשרונים🍓-קבוצת העיר
      '972528910743-1437583145@g.us'  // משפחה של לולה
    ];
    
    if (debugGroups.includes(groupId)) {
      logger.info(`🔍 CONTENT DEBUG for ${groupId}:`);
      logger.info(`📝 Message Type: ${messageType}`);
      logger.info(`📦 Message Content:`, JSON.stringify(messageContent, null, 2));
    }
    
    switch (messageType) {
      case 'conversation':
        content = messageContent;
        break;
      case 'extendedTextMessage':
        content = messageContent?.text || '';
        break;
      case 'imageMessage':
        content = messageContent?.caption || '[תמונה]';
        break;
      case 'videoMessage':
        content = messageContent?.caption || '[וידאו]';
        break;
      case 'documentMessage':
        content = `[מסמך: ${messageContent?.fileName || 'לא ידוע'}]`;
        break;
      case 'audioMessage':
        content = '[הודעה קולית]';
        break;
      case 'stickerMessage':
        content = '[מדבקה]';
        break;
      case 'reactionMessage':
        content = `[תגובה: ${messageContent?.text || ''}]`;
        break;
      case 'protocolMessage':
        // הודעות מחיקה או שינוי
        if (messageContent?.type === 0) {
          content = '[הודעה נמחקה]';
        } else {
          content = `[הודעת פרוטוקול: ${messageContent?.type}]`;
        }
        break;
      case 'ephemeralMessage':
        // הודעות נעלמות
        const ephemeralContent = messageContent?.message;
        const ephemeralType = Object.keys(ephemeralContent || {})[0];
        if (ephemeralType === 'conversation') {
          content = ephemeralContent[ephemeralType];
        } else if (ephemeralType === 'extendedTextMessage') {
          content = ephemeralContent[ephemeralType]?.text || '';
        } else {
          content = `[הודעה נעלמת: ${ephemeralType}]`;
        }
        break;
      case 'senderKeyDistributionMessage':
        // הודעות חלוקת מפתחות - לא צריך לשמור תוכן
        content = '[מפתח הצפנה]';
        break;
      case 'viewOnceMessage':
        // הודעות חד פעמיות
        const viewOnceContent = messageContent?.message;
        const viewOnceType = Object.keys(viewOnceContent || {})[0];
        if (viewOnceType === 'imageMessage') {
          content = '[תמונה חד פעמית]';
        } else if (viewOnceType === 'videoMessage') {
          content = '[וידאו חד פעמי]';
        } else {
          content = `[הודעה חד פעמית: ${viewOnceType}]`;
        }
        break;
      case 'contactMessage':
        content = `[איש קשר: ${messageContent?.displayName || 'לא ידוע'}]`;
        break;
      case 'locationMessage':
        content = '[מיקום]';
        break;
      case 'liveLocationMessage':
        content = '[מיקום בזמן אמת]';
        break;
      case 'pollCreationMessage':
        content = `[סקר: ${messageContent?.name || 'ללא כותרת'}]`;
        break;
      case 'pollUpdateMessage':
        content = '[עדכון סקר]';
        break;
      default:
        content = `[${messageType}]`;
    }
    
    // 🔥 DEBUG - תוצאה סופית
    if (debugGroups.includes(groupId)) {
      logger.info(`✅ Final content: "${content}"`);
    }
    
    // Get sender name (try to get pushName or use ID)
    const senderName = message.pushName || senderId.split('@')[0];
    
    const messageData = {
      messageId,
      groupId,
      senderId,
      senderName,
      content,
      messageType: messageType || 'unknown',
      timestamp: new Date(message.messageTimestamp * 1000).toISOString()
    };
    
    await this.db.saveMessage(messageData);
    logger.debug(`💾 הודעה נשמרה: ${content.substring(0, 50)}...`);
  }

  /**
   * Handle groups update and save to database
   */
  async handleGroupsUpdate(groups) {
    for (const group of groups) {
      try {
        await this.db.upsertGroup(group.id, group.subject || 'קבוצה ללא שם');
        logger.info(`📋 קבוצה עודכנה: ${group.subject} (${group.id})`);
      } catch (error) {
        logger.error('Failed to update group:', error);
      }
    }
  }

  /**
   * Handle message history sync (for catching up on missed messages)
   */
  async handleMessageHistory(historyUpdate) {
    const { chats, contacts, messages, isLatest, progress, syncType } = historyUpdate;
    
    try {
      logger.info(`📜 מעבד היסטוריה: ${syncType || 'unknown'}, התקדמות: ${progress || 0}%`);
      
      // Process contacts first
      if (contacts && contacts.length > 0) {
        logger.info(`👥 מעבד ${contacts.length} קשרים מההיסטוריה...`);
        let contactsSaved = 0;
        
        for (const contact of contacts) {
          try {
            await this.processAndSaveContact(contact);
            contactsSaved++;
          } catch (error) {
            logger.debug(`Failed to save contact: ${error.message}`);
          }
        }
        
        if (contactsSaved > 0) {
          logger.info(`💾 נשמרו ${contactsSaved} קשרים`);
        }
      }
      
      // Process chats metadata
      if (chats && chats.length > 0) {
        logger.info(`💬 מעבד ${chats.length} צ'אטים מההיסטוריה...`);
        let chatsSaved = 0;
        
        for (const chat of chats) {
          try {
            await this.processAndSaveChat(chat);
            chatsSaved++;
          } catch (error) {
            logger.debug(`Failed to save chat: ${error.message}`);
          }
        }
        
        if (chatsSaved > 0) {
          logger.info(`💾 נשמרו ${chatsSaved} צ'אטים`);
        }
      }
      
      // Process messages (with batch processing for better performance)
      if (messages && messages.length > 0) {
        logger.info(`📝 מעבד ${messages.length} הודעות היסטוריות...`);
        
        let savedCount = 0;
        let groupMessages = [];
        
        // Filter and collect group messages for batch processing
        for (const message of messages) {
          if (message.key?.remoteJid?.includes('@g.us')) {
            groupMessages.push(message);
          }
        }
        
        // Process messages in batches of 50 for better performance
        const batchSize = 50;
        for (let i = 0; i < groupMessages.length; i += batchSize) {
          const batch = groupMessages.slice(i, i + batchSize);
          
          try {
            await this.processBatchMessages(batch);
            savedCount += batch.length;
            
            // Log progress every 100 messages
            if (savedCount % 100 === 0 || i + batchSize >= groupMessages.length) {
              logger.info(`💾 נשמרו ${savedCount}/${groupMessages.length} הודעות היסטוריות`);
            }
          } catch (error) {
            logger.error(`Failed to process message batch ${i}-${i + batchSize}:`, error);
          }
        }
        
        if (savedCount > 0) {
          logger.info(`✅ סיים לשמור ${savedCount} הודעות היסטוריות מקבוצות`);
        }
        
        // Update statistics
        await this.updateHistoryStats(savedCount, syncType);
      }
      
      if (isLatest) {
        logger.info('🎉 סיים לקבל כל היסטוריית הודעות! הבוט מוכן לעבודה מלאה');
        await this.onHistorySyncComplete();
      }
      
    } catch (error) {
      logger.error('Failed to handle message history:', error);
    }
  }

  /**
   * Process and save contact information from history
   */
  async processAndSaveContact(contact) {
    try {
      // Extract contact details
      const contactId = contact.id;
      const name = contact.name || contact.notify || contact.short;
      const phoneNumber = contact.id?.replace('@s.whatsapp.net', '').replace('@c.us', '');
      const isGroup = contactId?.includes('@g.us');
      
      if (!contactId) return;
      
      // Prepare contact data
      const contactData = {
        id: contactId,
        name: name,
        phoneNumber: phoneNumber,
        isGroup: isGroup,
        profilePictureUrl: contact.profilePictureUrl || null,
        status: contact.status || null
      };
      
      // Save contact to database using new DatabaseManager method
      await this.db.upsertContact(contactData);
      logger.debug(`📞 קשר נשמר: ${name || contactId}`);
      
    } catch (error) {
      logger.error('Error processing contact:', error);
    }
  }

  /**
   * Process and save chat metadata from history
   */
  async processAndSaveChat(chat) {
    try {
      const chatId = chat.id;
      const name = chat.name || chat.subject;
      const isGroup = chatId?.includes('@g.us');
      
      if (!chatId || !name) return;
      
      // Determine chat type
      const chatType = isGroup ? 'group' : 'private';
      
      // Prepare chat metadata
      const chatData = {
        id: chatId,
        name: name,
        chatType: chatType,
        description: chat.desc || null,
        participantCount: isGroup ? (chat.participants?.length || 0) : 0,
        creationTime: chat.creation ? new Date(chat.creation * 1000).toISOString() : null,
        isActive: !chat.archived,
        lastActivity: chat.t ? new Date(chat.t * 1000).toISOString() : null,
        archiveStatus: chat.archived || false,
        pinned: chat.pin || false,
        muted: chat.mute || false,
        ownerId: isGroup ? chat.owner : null,
        subjectChangedAt: chat.subjectTime ? new Date(chat.subjectTime * 1000).toISOString() : null,
        subjectChangedBy: chat.subjectOwner || null
      };
      
      // Save chat metadata to database
      await this.db.upsertChatMetadata(chatData);
      
      // Also update groups table if it's a group
      if (isGroup) {
        await this.updateGroupMetadata(chat);
      }
      
      logger.debug(`💬 מטא-דטה נשמר: ${name} (${chatType})`);
      
    } catch (error) {
      logger.error('Error processing chat metadata:', error);
    }
  }

  /**
   * Process messages in batch for better performance
   */
  async processBatchMessages(messages) {
    for (const message of messages) {
      await this.processAndSaveMessage(message);
    }
  }

  /**
   * Update history sync statistics
   */
  async updateHistoryStats(messageCount, syncType) {
    try {
      // Update daily stats using new DatabaseManager method
      await this.db.updateHistorySyncStats(messageCount);
      
      logger.debug(`📊 עדכן סטטיסטיקות: +${messageCount} הודעות (${syncType})`);
    } catch (error) {
      logger.error('Failed to update history stats:', error);
    }
  }

  /**
   * Called when full history sync is complete
   */
  async onHistorySyncComplete() {
    try {
      // Send notification to admin group about successful sync
      if (this.summaryTargetGroupId) {
        const totalMessages = await this.db.allQuery(
          'SELECT COUNT(*) as count FROM messages'
        );
        
        const totalGroups = await this.db.allQuery(
          'SELECT COUNT(*) as count FROM groups WHERE is_active = 1'
        );
        
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `🎉 *סנכרון היסטוריה הושלם!*

📊 *סטטיסטיקות:*
• ${totalMessages[0]?.count || 0} הודעות סה"כ
• ${totalGroups[0]?.count || 0} קבוצות פעילות
• הבוט מוכן לעבודה מלאה עם גישה לכל ההיסטוריה!

💡 עכשיו ניתן להשתמש בפקודות:
• !history [תאריך] - סיכום מתאריך ספציפי
• !search-history [מילות מפתח] - חיפוש בהיסטוריה
• !ask [שאלה] - שאלות על כל התוכן ההיסטורי`
        });
      }
      
      // Set flag that initial sync is complete
      this.isHistorySyncComplete = true;
      
    } catch (error) {
      logger.error('Failed to handle history sync completion:', error);
    }
  }

  /**
   * Update group metadata from chat info
   */
  async updateGroupMetadata(chat) {
    try {
      const groupId = chat.id;
      const name = chat.name || chat.subject;
      
      if (!groupId?.includes('@g.us')) return;
      
      // Check if group exists, if not create it
      const existingGroup = await this.db.getGroup(groupId);
      
      if (!existingGroup) {
        // Create new group entry
        await this.db.runQuery(`
          INSERT OR IGNORE INTO groups (id, name, is_active) 
          VALUES (?, ?, 1)
        `, [groupId, name]);
        
        logger.info(`➕ נוספה קבוצה חדשה מההיסטוריה: ${name}`);
      } else if (existingGroup.name !== name) {
        // Update group name if changed
        await this.db.runQuery(`
          UPDATE groups SET name = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [name, groupId]);
        
        logger.info(`📝 עודכן שם קבוצה: ${existingGroup.name} → ${name}`);
      }
      
    } catch (error) {
      logger.error(`Failed to update group metadata for ${chat.id}:`, error);
    }
  }

  /**
   * Catch up on missed messages for active groups
   */
  async catchUpOnMissedMessages() {
    try {
      logger.info('🔄 מתחיל לאסוף הודעות שהוחמצו...');
      
      const activeGroups = await this.db.getActiveGroups();
      let catchupCount = 0;
      
      for (const group of activeGroups) {
        try {
          // Get the last message we have for this group
          const lastMessage = await this.db.getLastMessage(group.id);
          
          if (lastMessage) {
            // Request message history starting from the last known message
            const messageKey = {
              remoteJid: group.id,
              id: lastMessage.message_id,
              fromMe: false
            };
            
            // Fetch up to 50 messages (Baileys limit)
            // Convert ISO timestamp to Unix timestamp (seconds)
            const timestampInSeconds = Math.floor(new Date(lastMessage.timestamp).getTime() / 1000);
            await this.socket.fetchMessageHistory(50, messageKey, timestampInSeconds);
            catchupCount++;
            
            // Delay between requests to avoid overwhelming WhatsApp API
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logger.error(`Failed to catch up for group ${group.name}:`, error);
        }
      }
      
      if (catchupCount > 0) {
        logger.info(`📬 בקש היסטוריה עבור ${catchupCount} קבוצות פעילות`);
      } else {
        logger.info('📭 אין הודעות היסטוריות לבקש');
      }
      
    } catch (error) {
      logger.error('Failed to catch up on messages:', error);
    }
  }

  /**
   * Enhanced command handler with remote commands support
   */
  async handleCommand(message, command) {
    const groupId = message.key.remoteJid;
    
    try {
      // Clean command text - remove brackets and extra spaces
      const cleanCommand = command.replace(/\[|\]/g, '').trim();
      const cmd = cleanCommand.toLowerCase().trim();
      const args = cleanCommand.split(' ').slice(1); // Get arguments after command
      logger.info(`🔧 מטפל בפקודה: ${cmd} מקבוצה: ${groupId}`);
      
      // Check if this is a remote command from ניצן group
      const isFromNitzanGroup = groupId === this.summaryTargetGroupId;
      
      // Handle remote commands (only from ניצן group)
      if (isFromNitzanGroup && args.length > 0) {
        const baseCmd = cmd.split(' ')[0];
        switch (baseCmd) {
          case '!today':
            await this.handleRemoteTodaySummary(message, args.join(' '));
            return;
          case '!summary':
            await this.handleRemoteSummary(message, args.join(' '));
            return;
          case '!search':
            await this.handleSearchGroups(message, args.join(' '));
            return;
          case '!schedule':
            await this.handleSetSchedule(message, args);
            return;
          case '!unschedule':
            await this.handleRemoveSchedule(message, args);
            return;
          case '!stats':
            await this.handleRemoteStats(message, args.join(' '));
            return;
          case '!activity':
            await this.handleRemoteActivity(message, args.join(' '));
            return;
          case '!ask':
            await this.handleRemoteAsk(message, args.join(' '));
            return;
          case '!history':
            // Handle remote history command
            await this.handleHistoryCommand(message, args);
            return;
          case '!date':
            // Handle remote date command
            await this.handleDateCommand(message, args);
            return;
          case '!search-history':
            // Handle remote search-history command
            if (args.length > 0) {
              await this.handleSearchHistory(message, args.join(' '));
            } else {
              await this.socket.sendMessage(groupId, {
                text: '❓ נדרש טקסט לחיפוש. דוגמה: !search-history פיצה'
              });
            }
            return;
          case '!timeline':
            // Handle remote timeline command
            await this.handleTimelineCommand(message, args);
            return;
          case '!group-stats':
            // Handle remote group-stats command
            await this.handleGroupStats(message, args);
            return;
        }
      }
      
      // Handle single-word commands (both local and from ניצן)
      switch (cmd) {
        case '!mygroups':
          await this.handleMyGroups(message);
          break;
        case '!status':
          await this.sendStatusMessage(groupId);
          break;
        case '!summary':
          await this.handleSummaryRequest(message);
          break;
        case '!today':
          await this.handleTodaySummaryRequest(message);
          break;
        case '!help':
          await this.sendHelpMessage(groupId);
          break;
        case '!test':
          await this.testAIConnection(groupId);
          break;
        case '!list':
          if (isFromNitzanGroup) {
            await this.handleListGroups(message);
          } else {
            await this.socket.sendMessage(groupId, {
              text: '❌ פקודה זו זמינה רק מקבוצת ניצן'
            });
          }
          break;
        case '!schedules':
          if (isFromNitzanGroup) {
            await this.handleListSchedules(message);
          } else {
            await this.socket.sendMessage(groupId, {
              text: '❌ פקודה זו זמינה רק מקבוצת ניצן'
            });
          }
          break;
        case '!stats':
          await this.handleGroupStats(message);
          break;
        case '!activity':
          await this.handleActivityAnalysis(message);
          break;
        case '!top-users':
          await this.handleTopUsers(message);
          break;
        case '!ask':
          await this.handleAskQuestion(message, args.join(' '));
          break;
        case '!history':
          await this.handleHistoryCommand(message, args);
          break;
        case '!date':
          await this.handleDateCommand(message, args);
          break;
        case '!search-history':
          if (args.length > 0) {
            await this.handleSearchHistory(message, args.join(' '));
          } else {
            await this.socket.sendMessage(groupId, {
              text: '❓ נדרש טקסט לחיפוש. דוגמה: !search-history פיצה'
            });
          }
          break;
        case '!timeline':
          await this.handleTimelineCommand(message, args);
          break;
        case '!group-stats':
          await this.handleGroupStats(message);
          break;
        default:
          logger.debug(`❓ פקודה לא מוכרת: ${command}`);
          await this.socket.sendMessage(groupId, {
            text: `❓ פקודה לא מוכרת: ${command}\nשלח !help לרשימת הפקודות`
          });
      }
    } catch (error) {
      logger.error('Failed to handle command:', error);
    }
  }

  /**
   * Send status message to group
   */
  async sendStatusMessage(groupId) {
    try {
      const messageCount = await this.db.getMessageCount(groupId);
      const group = await this.db.getGroup(groupId);
      
      const statusText = `🤖 סטטוס הבוט:\n📊 מספר הודעות במעקב: ${messageCount}\n📋 קבוצה: ${group?.name || 'לא ידוע'}`;
      
      await this.socket.sendMessage(groupId, { text: statusText });
    } catch (error) {
      logger.error('Failed to send status:', error);
    }
  }

  /**
   * Send help message to group
   */
  async sendHelpMessage(groupId) {
    try {
      // Check if this is ניצן group for extended commands
      const isFromNitzanGroup = groupId === this.summaryTargetGroupId;
      
      let helpText = `🤖 *פקודות זמינות:*

📊 *!status* - מצב הבוט ומספר ההודעות
📝 *!summary* - סיכום הודעות חדשות (מאז סיכום אחרון)
🗓️ *!today* - סיכום כל הודעות היום (מ-00:00)
🧪 *!test* - בדיקת חיבור ל-AI
🏠 *!mygroups* - רשימת כל הקבוצות שלך עם ה-IDs להגדרות

🔍 *היסטוריה וחיפוש:*
📜 *!history [תקופה]* - סיכום מתקופה (yesterday/week/month/YYYY-MM-DD)
📅 *!date [תאריך/טווח]* - סיכום מתאריך או טווח (2025-08-29 או 2025-08-20 2025-08-22)
🔍 *!search-history [טקסט]* - חיפוש בהיסטוריה
📈 *!timeline [תקופה]* - ציר זמן פעילות
📊 *!group-stats* - סטטיסטיקות מפורטות

📈 *ניתוח וסטטיסטיקות:*
📊 *!stats* - סטטיסטיקות קבוצה (7 ימים)
📈 *!activity* - ניתוח פעילות לפי שעות וימים
👥 *!top-users* - רשימת המשתמשים המובילים

🤔 *שאלות על התוכן:*
❓ *!ask [שאלה]* - שאל שאלות על תוכן הקבוצה

❓ *!help* - הודעה זו

✨ *כל הסיכומים נשלחים לקבוצת ניצן*`;

      if (isFromNitzanGroup) {
        helpText += `

🎯 *פקודות מרחוק מיוחדות לקבוצת ניצן:*

🗓️ *!today [שם קבוצה]* - סיכום יומי לקבוצה אחרת
📝 *!summary [שם קבוצה]* - סיכום חדש לקבוצה אחרת
📋 *!list* - רשימת כל הקבוצות הזמינות
🔍 *!search [חלק מהשם]* - חיפוש קבוצות
⏰ *!schedules* - רשימת כל התזמונים הפעילים

🔍 *פקודות היסטוריה מרחוק:*
📜 *!history [שם קבוצה] [תקופה]* - סיכום היסטורי של קבוצה
📅 *!date [שם קבוצה] [תאריך/טווח]* - סיכום תאריך של קבוצה
🔍 *!search-history [שם קבוצה] [טקסט]* - חיפוש בהיסטוריה של קבוצה
📈 *!timeline [שם קבוצה] [תקופה]* - ציר זמן פעילות של קבוצה
📊 *!group-stats [שם קבוצה]* - סטטיסטיקות מפורטות של קבוצה

📈 *ניתוח מרחוק:*
📊 *!stats [שם קבוצה]* - סטטיסטיקות עבור קבוצה אחרת
📈 *!activity [שם קבוצה]* - ניתוח פעילות עבור קבוצה אחרת
❓ *!ask [שם קבוצה] | [שאלה]* - שאל שאלה על תוכן קבוצה אחרת

⏱️ *תזמונים אוטומטיים:*
📅 *!schedule [שם קבוצה] [זמן]* - הגדרת תזמון
❌ *!unschedule [שם קבוצה]* - ביטול תזמון

💡 *דוגמאות תזמונים:*
• !schedule AI TIPS יומי 16:00
• !schedule כושר שבועי ראשון 09:00
• !schedule הילדים חודשי 1 08:00
• !unschedule AI TIPS

💡 *דוגמאות סיכומים:*
• !today AI TIPS
• !summary הילדים שלי ואני
• !search כושר

💡 *דוגמאות ניתוח:*
• !stats AI TIPS
• !activity הילדים שלי ואני
• !ask AI TIPS | מה הנושא המרכזי השבוע?
• !ask הילדים שלי ואני | מי דיבר על חינוך?`;
      }

      
      await this.socket.sendMessage(groupId, { text: helpText });
    } catch (error) {
      logger.error('Failed to send help:', error);
    }
  }

  /**
   * Handle summary request
   */
  async handleSummaryRequest(message) {
    const groupId = message.key.remoteJid;
    const requesterId = message.key.participant || message.key.remoteJid;
    
    try {
      // Send acknowledgment in group
      await this.socket.sendMessage(groupId, { 
        text: '🤖 מייצר סיכום... זה יכול לקחת כמה רגעים' 
      });
      
      // Get group info
      const group = await this.db.getGroup(groupId);
      const groupName = group?.name || 'קבוצה לא ידועה';
      
      // Get new messages since last summary (change this to use today's messages for better results)
      const messages = await this.db.getTodaysMessages(groupId);
      
      if (messages.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: `📭 אין הודעות חדשות לסיכום בקבוצת "${groupName}"`
        });
        return;
      }
      
      logger.info(`📊 מייצר סיכום לקבוצת "${groupName}" (${messages.length} הודעות)`);
      
      // Generate summary using AI Agent
      const summaryQuery = `צור סיכום של ${messages.length} הודעות מקבוצת "${groupName}". הנה ההודעות:\n\n${messages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const result = await this.conversationHandler.processNaturalQuery(
        summaryQuery, null, 'system', false
      );
      
      if (!result.success) {
        await this.socket.sendMessage(groupId, {
          text: `❌ שגיאה בייצור סיכום: ${result.error}`
        });
        return;
      }
      
      const formattedSummary = result.response;
      
      // Send summary to the target group (ניצן)
      const summaryWithSource = `📊 *סיכום מקבוצת "${groupName}"*\n\n${formattedSummary}`;
      await this.socket.sendMessage(this.summaryTargetGroupId, { text: summaryWithSource });
      
      // Save summary to database
      const summaryData = {
        groupId: groupId,
        summaryText: result.summary,
        messagesCount: messages.length,
        startTime: messages[0]?.timestamp || new Date().toISOString(),
        endTime: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        modelUsed: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed
      };
      
      const summaryId = await this.db.saveSummary(summaryData);
      
      // Confirm (summary already sent above)
      logger.info(`📨 סיכום נשלח לקבוצה "${groupName}" (${messages.length} הודעות)`);
      
      logger.info(`✅ סיכום נוצר ונשלח (ID: ${summaryId})`);
      
    } catch (error) {
      logger.error('Failed to handle summary request:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בייצור הסיכום. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle today's summary request (always from start of day)
   */
  async handleTodaySummaryRequest(message) {
    const groupId = message.key.remoteJid;
    const requesterId = message.key.participant || message.key.remoteJid;
    
    try {
      // Send acknowledgment in group
      await this.socket.sendMessage(groupId, { 
        text: '🗓️ מאסף הודעות מהיום ומייצר סיכום... זה יכול לקחת כמה רגעים' 
      });
      
      // Get group info
      const group = await this.db.getGroup(groupId);
      const groupName = group?.name || 'קבוצה לא ידועה';
      
      // Request history for today (from 00:00 today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Math.floor(today.getTime() / 1000);
      
      logger.info(`📅 מבקש היסטוריה מהיום (${today.toISOString()}) לקבוצת "${groupName}"`);
      
      // Request message history from WhatsApp
      try {
        // We need to get the last message from this group to use as a reference
        const lastMsg = await this.db.getLastMessage(groupId);
        
        if (lastMsg && lastMsg.message_id) {
          // Parse the message ID to get the key
          const [timestamp, fromMe, id] = lastMsg.message_id.split('_');
          const messageKey = {
            remoteJid: groupId,
            fromMe: fromMe === 'true',
            id: id
          };
          
          // Request history from today at 00:00
          await this.socket.fetchMessageHistory(100, messageKey, todayTimestamp);
          logger.info(`📬 ביקשתי היסטוריה מהיום עבור ${groupName}`);
        } else {
          // No previous messages, try without reference
          logger.debug(`No previous messages found for ${groupId}, skipping history request`);
        }
      } catch (err) {
        logger.debug(`Could not fetch history for ${groupId}:`, err.message);
      }
      
      // Wait for history to be processed (give it 3 seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Now get today's messages from database
      const messages = await this.db.getTodaysMessages(groupId);
      
      if (messages.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: `📭 אין הודעות היום לסיכום בקבוצת "${groupName}"`
        });
        return;
      }
      
      logger.info(`📊 מייצר סיכום יומי לקבוצת "${groupName}" (${messages.length} הודעות)`);
      
      // Generate summary
      const summaryQuery = `צור סיכום של ${messages.length} הודעות מקבוצת "${groupName}". הנה ההודעות:\n\n${messages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const result = await this.conversationHandler.processNaturalQuery(summaryQuery, null, 'system', false);
      
      if (!result.success) {
        await this.socket.sendMessage(groupId, {
          text: `❌ שגיאה בייצור הסיכום היומי: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp with today's date
      const todayStr = new Date().toLocaleDateString('he-IL');
      const formattedSummary = `🗓️ *סיכום יומי - ${todayStr}*\n*קבוצת ${groupName}*\n\n${result.summary}\n\n📊 *מידע טכני:*\n• הודעות: ${messages.length}\n• מודל: ${result.metadata.model}\n• זמן: ${new Date().toLocaleString('he-IL')}\n\n_סיכום יומי זה הופק באמצעות AI_`;
      
      // Send summary to the target group (ניצן) with source information
      const summaryWithSource = `📊 *סיכום יומי מקבוצת "${groupName}"*\n${todayStr}\n\n${formattedSummary}`;
      await this.socket.sendMessage(this.summaryTargetGroupId, { text: summaryWithSource });
      
      // Save summary to database
      const summaryData = {
        groupId: groupId,
        summaryText: result.summary,
        messagesCount: messages.length,
        startTime: messages[0]?.timestamp || new Date().toISOString(),
        endTime: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        modelUsed: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed
      };
      
      const summaryId = await this.db.saveSummary(summaryData);
      
      // Confirm (summary already sent above)
      logger.info(`📨 סיכום יומי נשלח לקבוצת ניצן מקבוצת "${groupName}" (${messages.length} הודעות מהיום)`);
      
      logger.info(`✅ סיכום יומי נוצר ונשלח (ID: ${summaryId})`);
      
    } catch (error) {
      logger.error('Failed to handle today summary request:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בייצור הסיכום היומי. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Test AI connection
   */
  async testAIConnection(groupId) {
    try {
      await this.socket.sendMessage(groupId, { 
        text: '🧪 בודק חיבור ל-AI...' 
      });
      
      const result = await this.conversationHandler.processNaturalQuery(
        'בדיקה מהירה - אמור שלום', null, 'system', false
      );
      
      if (result && result.success) {
        await this.socket.sendMessage(groupId, {
          text: `✅ חיבור לAPI תקין!\n💬 תגובה: "${result.response}"`
        });
      } else {
        await this.socket.sendMessage(groupId, {
          text: `❌ בעיה בחיבור לAPI:\n${result?.error || 'שגיאה לא ידועה'}`
        });
      }
      
    } catch (error) {
      logger.error('Failed to test API:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בבדיקת החיבור'
      });
    }
  }

  /**
   * Search for groups by name (smart fuzzy search)
   */
  async searchGroupsByName(searchTerm) {
    try {
      const allGroups = await this.db.getActiveGroups();
      const searchLower = searchTerm.toLowerCase();
      
      // Score and filter groups based on relevance
      const matches = allGroups.map(group => {
        const nameLower = group.name.toLowerCase();
        let score = 0;
        
        // Exact match gets highest score
        if (nameLower === searchLower) score = 100;
        // Starts with search term
        else if (nameLower.startsWith(searchLower)) score = 80;
        // Contains search term
        else if (nameLower.includes(searchLower)) score = 60;
        // Word boundary match (whole words)
        else if (nameLower.includes(` ${searchLower} `) || 
                 nameLower.includes(` ${searchLower}`) ||
                 nameLower.includes(`${searchLower} `)) score = 70;
        
        return { ...group, score };
      })
      .filter(group => group.score > 0)
      .sort((a, b) => b.score - a.score);
      
      return matches;
    } catch (error) {
      logger.error('Failed to search groups:', error);
      return [];
    }
  }

  /**
   * Handle remote today summary command from ניצן group
   */
  async handleRemoteTodaySummary(message, groupName) {
    try {
      await this.socket.sendMessage(this.summaryTargetGroupId, { 
        text: `🔍 מחפש קבוצה: "${groupName}"...` 
      });

      const matches = await this.searchGroupsByName(groupName);
      
      if (matches.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה עם השם "${groupName}"\nנסה פקודה !search "${groupName}" לחיפוש רחב יותר`
        });
        return;
      }
      
      if (matches.length > 1) {
        const topMatches = matches.slice(0, 5);
        const matchList = topMatches.map((match, idx) => 
          `${idx + 1}. ${match.name}`
        ).join('\n');
        
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `🔍 נמצאו ${matches.length} קבוצות. האם התכוונת לאחת מאלה?\n\n${matchList}\n\nשלח !today עם השם המדויק`
        });
        return;
      }
      
      // Single match found - proceed with summary
      const targetGroup = matches[0];
      await this.socket.sendMessage(this.summaryTargetGroupId, { 
        text: `🗓️ מאסף הודעות מהיום לקבוצת "${targetGroup.name}"...` 
      });
      
      // Request history for today (from 00:00 today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Math.floor(today.getTime() / 1000);
      
      logger.info(`📅 מבקש היסטוריה מהיום (${today.toISOString()}) לקבוצת "${targetGroup.name}"`);
      
      // Request message history from WhatsApp
      try {
        // We need to get the last message from this group to use as a reference
        const lastMsg = await this.db.getLastMessage(targetGroup.id);
        
        if (lastMsg && lastMsg.message_id) {
          // Parse the message ID to get the key
          const [timestamp, fromMe, id] = lastMsg.message_id.split('_');
          const messageKey = {
            remoteJid: targetGroup.id,
            fromMe: fromMe === 'true',
            id: id
          };
          
          // Request history from today at 00:00
          await this.socket.fetchMessageHistory(100, messageKey, todayTimestamp);
          logger.info(`📬 ביקשתי היסטוריה מהיום עבור ${targetGroup.name}`);
        } else {
          // No previous messages, try without reference
          logger.debug(`No previous messages found for ${targetGroup.id}, skipping history request`);
        }
      } catch (err) {
        logger.debug(`Could not fetch history for ${targetGroup.id}:`, err.message);
      }
      
      // Wait for history to be processed (give it 3 seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Now get today's messages from database
      const messages = await this.db.getTodaysMessages(targetGroup.id);
      
      if (messages.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `📭 אין הודעות היום לסיכום בקבוצת "${targetGroup.name}"`
        });
        return;
      }
      
      logger.info(`📊 מייצר סיכום יומי מרחוק לקבוצת "${targetGroup.name}" (${messages.length} הודעות)`);
      
      // Generate summary
      const summaryQuery = `צור סיכום של ${messages.length} הודעות מקבוצת "${targetGroup.name}". הנה ההודעות:\n\n${messages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const result = await this.conversationHandler.processNaturalQuery(summaryQuery, null, 'system', false);
      
      if (!result.success) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שגיאה בייצור הסיכום היומי: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp
      const todayStr = new Date().toLocaleDateString('he-IL');
      const formattedSummary = `🗓️ *סיכום יומי מרחוק - ${todayStr}*\n*קבוצת ${targetGroup.name}*\n\n${result.summary}\n\n📊 *מידע טכני:*\n• הודעות: ${messages.length}\n• מודל: ${result.metadata.model}\n• זמן: ${new Date().toLocaleString('he-IL')}\n\n_סיכום יומי זה הופק באמצעות AI_`;
      
      // Send summary to ניצן group
      await this.socket.sendMessage(this.summaryTargetGroupId, { text: formattedSummary });
      
      // Save summary to database
      const summaryData = {
        groupId: targetGroup.id,
        summaryText: result.summary,
        messagesCount: messages.length,
        startTime: messages[0]?.timestamp || new Date().toISOString(),
        endTime: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        modelUsed: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed
      };
      
      const summaryId = await this.db.saveSummary(summaryData);
      logger.info(`📨 סיכום יומי מרחוק נוצר לקבוצת "${targetGroup.name}" (ID: ${summaryId})`);
      
    } catch (error) {
      logger.error('Failed to handle remote today summary:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בייצור הסיכום. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle remote summary command from ניצן group
   */
  async handleRemoteSummary(message, groupName) {
    try {
      await this.socket.sendMessage(this.summaryTargetGroupId, { 
        text: `🔍 מחפש קבוצה: "${groupName}"...` 
      });

      const matches = await this.searchGroupsByName(groupName);
      
      if (matches.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה עם השם "${groupName}"\nנסה פקודה !search "${groupName}" לחיפוש רחב יותר`
        });
        return;
      }
      
      if (matches.length > 1) {
        const topMatches = matches.slice(0, 5);
        const matchList = topMatches.map((match, idx) => 
          `${idx + 1}. ${match.name}`
        ).join('\n');
        
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `🔍 נמצאו ${matches.length} קבוצות. האם התכוונת לאחת מאלה?\n\n${matchList}\n\nשלח !summary עם השם המדויק`
        });
        return;
      }
      
      // Single match found - proceed with summary
      const targetGroup = matches[0];
      await this.socket.sendMessage(this.summaryTargetGroupId, { 
        text: `📊 מייצר סיכום חדש לקבוצת "${targetGroup.name}"...` 
      });
      
      // Get new messages since last summary
      const messages = await this.db.getNewMessages(targetGroup.id);
      
      if (messages.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `📭 אין הודעות חדשות לסיכום בקבוצת "${targetGroup.name}"`
        });
        return;
      }
      
      logger.info(`📊 מייצר סיכום חדש מרחוק לקבוצת "${targetGroup.name}" (${messages.length} הודעות)`);
      
      // Generate summary
      const summaryQuery = `צור סיכום של ${messages.length} הודעות מקבוצת "${targetGroup.name}". הנה ההודעות:\n\n${messages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const result = await this.conversationHandler.processNaturalQuery(summaryQuery, null, 'system', false);
      
      if (!result.success) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שגיאה בייצור הסיכום: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp
      const formattedSummary = result.response;
      
      // Send summary to ניצן group
      await this.socket.sendMessage(this.summaryTargetGroupId, { text: formattedSummary });
      
      // Save summary to database
      const summaryData = {
        groupId: targetGroup.id,
        summaryText: result.summary,
        messagesCount: messages.length,
        startTime: messages[0]?.timestamp || new Date().toISOString(),
        endTime: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
        modelUsed: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed
      };
      
      const summaryId = await this.db.saveSummary(summaryData);
      logger.info(`📨 סיכום חדש מרחוק נוצר לקבוצת "${targetGroup.name}" (ID: ${summaryId})`);
      
    } catch (error) {
      logger.error('Failed to handle remote summary:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בייצור הסיכום. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle search groups command from ניצן group
   */
  async handleSearchGroups(message, searchTerm) {
    try {
      const matches = await this.searchGroupsByName(searchTerm);
      
      if (matches.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `🔍 לא נמצאו קבוצות עם המילה "${searchTerm}"`
        });
        return;
      }
      
      const resultCount = Math.min(matches.length, 20);
      const matchList = matches.slice(0, resultCount).map((match, idx) => 
        `${idx + 1}. ${match.name}`
      ).join('\n');
      
      const moreText = matches.length > 20 ? `\n\n...ועוד ${matches.length - 20} קבוצות` : '';
      
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: `🔍 נמצאו ${matches.length} קבוצות עם "${searchTerm}":\n\n${matchList}${moreText}`
      });
      
    } catch (error) {
      logger.error('Failed to search groups:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בחיפוש קבוצות'
      });
    }
  }

  /**
   * Handle list all groups command from ניצן group
   */
  async handleListGroups(message) {
    try {
      const allGroups = await this.db.getActiveGroups();
      
      if (allGroups.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: '📭 אין קבוצות פעילות במערכת'
        });
        return;
      }
      
      // Split into chunks of 50 groups per message
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < allGroups.length; i += chunkSize) {
        chunks.push(allGroups.slice(i, i + chunkSize));
      }
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const groupList = chunk.map((group, idx) => 
          `${i * chunkSize + idx + 1}. ${group.name}`
        ).join('\n');
        
        const chunkInfo = chunks.length > 1 ? ` (חלק ${i + 1}/${chunks.length})` : '';
        
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `📋 רשימת קבוצות זמינות${chunkInfo}:\n\n${groupList}`
        });
        
        // Add delay between messages to avoid spam
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: `📊 סה"כ ${allGroups.length} קבוצות פעילות\n\n💡 שימוש:\n• !today [שם קבוצה]\n• !summary [שם קבוצה]\n• !search [חלק מהשם]`
      });
      
    } catch (error) {
      logger.error('Failed to list groups:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בקבלת רשימת קבוצות'
      });
    }
  }

  /**
   * Handle schedule listing command
   */
  async handleListSchedules(message) {
    try {
      const schedules = await this.schedulerService.getActiveSchedules();
      
      if (schedules.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: '⏰ אין תזמונים פעילים במערכת\n\n💡 כדי להוסיף תזמון: !schedule [שם קבוצה] [זמן]'
        });
        return;
      }
      
      const scheduleList = schedules.map((schedule, idx) => 
        `${idx + 1}. ${schedule.groupName}\n   ⏰ ${schedule.readable}`
      ).join('\n\n');
      
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: `⏰ *תזמונים פעילים:*\n\n${scheduleList}\n\n📊 סה"כ ${schedules.length} תזמונים פעילים`
      });
      
    } catch (error) {
      logger.error('Failed to list schedules:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בקבלת רשימת תזמונים'
      });
    }
  }

  /**
   * Handle schedule setting command
   */
  async handleSetSchedule(message, args) {
    try {
      if (args.length < 2) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שימוש שגוי בפקודה

📅 *שימוש נכון:*
!schedule [שם קבוצה] [תזמון]

💡 *דוגמאות:*
• !schedule AI TIPS יומי 16:00
• !schedule כושר שבועי ראשון 09:00
• !schedule הילדים חודשי 1 08:00`
        });
        return;
      }

      // Extract group name and schedule from args
      const lastWord = args[args.length - 1];
      const timePattern = /^\d{1,2}:\d{2}$/;
      
      let groupName, scheduleText;
      
      if (timePattern.test(lastWord)) {
        // Time is at the end - need to find where schedule starts
        let scheduleStartIdx = args.length - 1;
        while (scheduleStartIdx > 0 && 
               !['יומי', 'שבועי', 'חודשי'].includes(args[scheduleStartIdx - 1])) {
          scheduleStartIdx--;
        }
        if (scheduleStartIdx > 0) scheduleStartIdx--;
        
        groupName = args.slice(0, scheduleStartIdx).join(' ');
        scheduleText = args.slice(scheduleStartIdx).join(' ');
      } else {
        // Assume last 2 args are schedule
        groupName = args.slice(0, -2).join(' ');
        scheduleText = args.slice(-2).join(' ');
      }

      if (!groupName || !scheduleText) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: '❌ לא הצלחתי לזהות את שם הקבוצה או התזמון\n\n💡 וודא שהפורמט נכון: !schedule [שם קבוצה] [תזמון]'
        });
        return;
      }

      // Find the group
      const groups = await this.searchGroupsByName(groupName);
      if (groups.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה המתאימה ל "${groupName}"\n\n💡 השתמש ב-!search כדי למצוא את השם המדויק`
        });
        return;
      }

      const selectedGroup = groups[0]; // Take the best match
      const result = await this.schedulerService.setGroupSchedule(selectedGroup.id, scheduleText);
      
      if (result.success) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `✅ תזמון הוגדר בהצלחה!\n\n📋 קבוצה: ${selectedGroup.name}\n⏰ תזמון: ${scheduleText}\n🔧 פורמט טכני: ${result.cronSchedule}\n\n📅 הסיכום הבא יתבצע לפי התזמון החדש`
        });
      } else {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שגיאה בהגדרת תזמון: ${result.error}`
        });
      }

    } catch (error) {
      logger.error('Failed to set schedule:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בהגדרת תזמון'
      });
    }
  }

  /**
   * Handle schedule removal command
   */
  async handleRemoveSchedule(message, args) {
    try {
      if (args.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שימוש שגוי בפקודה

❌ *שימוש נכון:*
!unschedule [שם קבוצה]

💡 *דוגמה:*
• !unschedule AI TIPS`
        });
        return;
      }

      const groupName = args.join(' ');
      
      // Find the group
      const groups = await this.searchGroupsByName(groupName);
      if (groups.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה המתאימה ל "${groupName}"\n\n💡 השתמש ב-!search כדי למצוא את השם המדויק`
        });
        return;
      }

      const selectedGroup = groups[0]; // Take the best match
      const result = await this.schedulerService.removeGroupSchedule(selectedGroup.id);
      
      if (result.success) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `✅ תזמון בוטל בהצלחה!\n\n📋 קבוצה: ${selectedGroup.name}\n⏰ תזמונים אוטומטיים הופסקו עבור קבוצה זו`
        });
      } else {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שגיאה בביטול תזמון: ${result.error}`
        });
      }

    } catch (error) {
      logger.error('Failed to remove schedule:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בביטול תזמון'
      });
    }
  }

  /**
   * Handle group statistics command
   */
  async handleGroupStats(message) {
    const groupId = message.key.remoteJid;
    
    try {
      await this.socket.sendMessage(groupId, {
        text: '📊 מכין נתוני סטטיסטיקה... אנא המתן'
      });

      // Get 7-day statistics
      const weekStats = await this.db.getGroupStats(groupId, 7);
      const monthStats = await this.db.getGroupStats(groupId, 30);
      const overview = await this.db.getGroupOverview(groupId);

      if (!weekStats || weekStats.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: '❌ לא נמצאו נתונים סטטיסטיים עבור קבוצה זו'
        });
        return;
      }

      const groupName = overview.groupName || 'קבוצה זו';
      
      // Format weekly stats
      const top5Week = weekStats.slice(0, 5);
      const weeklyStatsText = top5Week.map((user, index) => {
        const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
        return `${emoji} *${user.sender_name}*\n   💬 ${user.message_count} הודעות | 📏 אורך ממוצע: ${Math.round(user.avg_message_length)} תווים`;
      }).join('\n');

      // Format monthly comparison
      const monthlyTotal = monthStats.reduce((sum, user) => sum + user.message_count, 0);
      const weeklyTotal = weekStats.reduce((sum, user) => sum + user.message_count, 0);

      const statsMessage = `📊 *סטטיסטיקות קבוצה - ${groupName}*

🗓️ *נתוני השבוע (7 ימים אחרונים):*
${weeklyStatsText}

📈 *סיכום כללי:*
• 💬 הודעות השבוע: ${weeklyTotal}
• 📊 הודעות החודש: ${monthlyTotal}
• 👥 משתתפים פעילים: ${weekStats.length}
• 🏆 הכי פעיל השבוע: *${weekStats[0]?.sender_name || 'לא ידוע'}*

⏰ *נוצר ב-${new Date().toLocaleString('he-IL')}*`;

      await this.socket.sendMessage(groupId, { text: statsMessage });

    } catch (error) {
      logger.error('Failed to get group stats:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בקבלת נתונים סטטיסטיים. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle activity analysis command
   */
  async handleActivityAnalysis(message) {
    const groupId = message.key.remoteJid;
    
    try {
      await this.socket.sendMessage(groupId, {
        text: '📈 מנתח פעילות קבוצה... אנא המתן'
      });

      const hourlyActivity = await this.db.getActivityByHour(groupId, 7);
      const dailyActivity = await this.db.getActivityByDay(groupId, 7);
      const overview = await this.db.getGroupOverview(groupId);

      if (!hourlyActivity || hourlyActivity.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: '❌ לא נמצאו נתוני פעילות עבור קבוצה זו'
        });
        return;
      }

      const groupName = overview.groupName || 'קבוצה זו';

      // Find peak hours (top 5)
      const sortedHours = hourlyActivity.sort((a, b) => b.message_count - a.message_count);
      const peakHours = sortedHours.slice(0, 5);
      
      const peakHoursText = peakHours.map((hour, index) => {
        const emoji = ['🔥', '⚡', '✨', '💫', '⭐'][index];
        const hourFormatted = hour.hour.toString().padStart(2, '0');
        return `${emoji} ${hourFormatted}:00 - ${(parseInt(hourFormatted) + 1).toString().padStart(2, '0')}:00 (${hour.message_count} הודעות)`;
      }).join('\n');

      // Weekly activity summary
      const weeklyTotals = dailyActivity.map(day => ({
        day: day.day_name,
        count: day.message_count
      }));

      const dailyText = weeklyTotals.map(day => 
        `📅 ${day.day} - ${day.count} הודעות`
      ).join('\n');

      const activityMessage = `📈 *ניתוח פעילות - ${groupName}*

🔥 *שעות השיא (7 ימים אחרונים):*
${peakHoursText}

📅 *פעילות לפי ימים:*
${dailyText}

📊 *תובנות:*
• ⏰ שעת השיא: ${sortedHours[0]?.hour}:00
• 📈 יום הכי פעיל: ${weeklyTotals.sort((a, b) => b.count - a.count)[0]?.day}
• 💬 ממוצע הודעות יומי: ${Math.round(weeklyTotals.reduce((sum, day) => sum + day.count, 0) / weeklyTotals.length)}

⏰ *נוצר ב-${new Date().toLocaleString('he-IL')}*`;

      await this.socket.sendMessage(groupId, { text: activityMessage });

    } catch (error) {
      logger.error('Failed to analyze activity:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בניתוח פעילות. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle top users command
   */
  async handleTopUsers(message) {
    const groupId = message.key.remoteJid;
    
    try {
      await this.socket.sendMessage(groupId, {
        text: '👥 מכין רשימת משתמשים מובילים... אנא המתן'
      });

      const topUsers = await this.db.getGroupStats(groupId, 30); // Last 30 days
      const overview = await this.db.getGroupOverview(groupId);

      if (!topUsers || topUsers.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: '❌ לא נמצאו נתונים עבור משתמשי הקבוצה'
        });
        return;
      }

      const groupName = overview.groupName || 'קבוצה זו';
      const top10Users = topUsers.slice(0, 10);
      
      // Calculate total messages for percentages
      const totalMessages = topUsers.reduce((sum, user) => sum + user.message_count, 0);

      const topUsersText = top10Users.map((user, index) => {
        const position = (index + 1).toString();
        const percentage = ((user.message_count / totalMessages) * 100).toFixed(1);
        
        let emoji = '';
        if (index === 0) emoji = '🥇';
        else if (index === 1) emoji = '🥈';
        else if (index === 2) emoji = '🥉';
        else emoji = `${position}️⃣`;

        const firstMessage = new Date(user.first_message).toLocaleDateString('he-IL');
        const lastMessage = new Date(user.last_message).toLocaleDateString('he-IL');

        return `${emoji} *${user.sender_name}*
   💬 ${user.message_count} הודעות (${percentage}%)
   📏 אורך ממוצע: ${Math.round(user.avg_message_length)} תווים
   📅 מ-${firstMessage} עד ${lastMessage}`;
      }).join('\n\n');

      const topUsersMessage = `👥 *המשתמשים המובילים - ${groupName}*
📊 *נתוני חודש אחרון*

${topUsersText}

📈 *סיכום:*
• 💬 סה"כ הודעות: ${totalMessages.toLocaleString()}
• 👥 משתתפים פעילים: ${topUsers.length}
• 📊 ממוצע הודעות למשתמש: ${Math.round(totalMessages / topUsers.length)}

⏰ *נוצר ב-${new Date().toLocaleString('he-IL')}*`;

      await this.socket.sendMessage(groupId, { text: topUsersMessage });

    } catch (error) {
      logger.error('Failed to get top users:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בקבלת רשימת משתמשים מובילים. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle remote stats command (from management group)
   */
  async handleRemoteStats(message, groupName) {
    try {
      if (!groupName) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שימוש שגוי בפקודה

*שימוש נכון:*
!stats [שם קבוצה]

💡 *דוגמה:*
• !stats AI TIPS`
        });
        return;
      }

      const groups = await this.searchGroupsByName(groupName);
      if (groups.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה המתאימה ל "${groupName}"\n\n💡 השתמש ב-!search כדי למצוא את השם המדויק`
        });
        return;
      }

      const selectedGroup = groups[0];
      
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: `📊 מכין סטטיסטיקות עבור "${selectedGroup.name}"...`
      });

      // Generate stats for the remote group
      const weekStats = await this.db.getGroupStats(selectedGroup.id, 7);
      const monthStats = await this.db.getGroupStats(selectedGroup.id, 30);

      if (!weekStats || weekStats.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאו נתונים סטטיסטיים עבור "${selectedGroup.name}"`
        });
        return;
      }

      const top5Week = weekStats.slice(0, 5);
      const weeklyStatsText = top5Week.map((user, index) => {
        const emoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index];
        return `${emoji} *${user.sender_name}* - ${user.message_count} הודעות`;
      }).join('\n');

      const monthlyTotal = monthStats.reduce((sum, user) => sum + user.message_count, 0);
      const weeklyTotal = weekStats.reduce((sum, user) => sum + user.message_count, 0);

      const remoteStatsMessage = `📊 *סטטיסטיקות - ${selectedGroup.name}*

🗓️ *נתוני השבוע:*
${weeklyStatsText}

📈 *סיכום:*
• השבוע: ${weeklyTotal} הודעות
• החודש: ${monthlyTotal} הודעות  
• משתתפים פעילים: ${weekStats.length}

⏰ ${new Date().toLocaleString('he-IL')}`;

      await this.socket.sendMessage(this.summaryTargetGroupId, { text: remoteStatsMessage });

    } catch (error) {
      logger.error('Failed to get remote stats:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בקבלת סטטיסטיקות מרחוק'
      });
    }
  }

  /**
   * Handle remote activity analysis command (from management group)
   */
  async handleRemoteActivity(message, groupName) {
    try {
      if (!groupName) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שימוש שגוי בפקודה

*שימוש נכון:*
!activity [שם קבוצה]

💡 *דוגמה:*
• !activity AI TIPS`
        });
        return;
      }

      const groups = await this.searchGroupsByName(groupName);
      if (groups.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה המתאימה ל "${groupName}"\n\n💡 השתמש ב-!search כדי למצוא את השם המדויק`
        });
        return;
      }

      const selectedGroup = groups[0];
      
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: `📈 מנתח פעילות עבור "${selectedGroup.name}"...`
      });

      const hourlyActivity = await this.db.getActivityByHour(selectedGroup.id, 7);
      const dailyActivity = await this.db.getActivityByDay(selectedGroup.id, 7);

      if (!hourlyActivity || hourlyActivity.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאו נתוני פעילות עבור "${selectedGroup.name}"`
        });
        return;
      }

      const sortedHours = hourlyActivity.sort((a, b) => b.message_count - a.message_count);
      const top3Hours = sortedHours.slice(0, 3);
      
      const peakHoursText = top3Hours.map((hour, index) => {
        const emoji = ['🔥', '⚡', '✨'][index];
        return `${emoji} ${hour.hour}:00 (${hour.message_count} הודעות)`;
      }).join(', ');

      const dailyTotals = dailyActivity.map(day => day.message_count);
      const avgDaily = Math.round(dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length);

      const remoteActivityMessage = `📈 *ניתוח פעילות - ${selectedGroup.name}*

🔥 *שעות השיא:* ${peakHoursText}
📊 *ממוצע יומי:* ${avgDaily} הודעות
📅 *ימים נבדקו:* ${dailyActivity.length}

⏰ ${new Date().toLocaleString('he-IL')}`;

      await this.socket.sendMessage(this.summaryTargetGroupId, { text: remoteActivityMessage });

    } catch (error) {
      logger.error('Failed to analyze remote activity:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בניתוח פעילות מרחוק'
      });
    }
  }

  /**
   * Handle ASK question command (local)
   */
  async handleAskQuestion(message, question) {
    const groupId = message.key.remoteJid;
    
    try {
      if (!question || question.trim().length < 3) {
        await this.socket.sendMessage(groupId, {
          text: `❓ *איך להשתמש בפקודת !ask:*

🎯 *שאל שאלות על תוכן הקבוצה:*
• !ask מה הנושא המרכזי השבוע?
• !ask מי דיבר על AI?
• !ask איזה עצות ניתנו לגבי השקעות?
• !ask מה היו הדעות על המוצר החדש?

💡 *הבוט יחפש בהודעות האחרונות ויענה על בסיס התוכן*`
        });
        return;
      }

      await this.socket.sendMessage(groupId, {
        text: '🤔 חושב על השאלה שלך... אנא המתן'
      });

      // Get recent messages for analysis
      const messages = await this.db.getMessagesForAsk(groupId, 7, 50);
      const overview = await this.db.getGroupOverview(groupId);

      if (!messages || messages.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: '❌ לא נמצאו הודעות מתאימות לניתוח בקבוצה זו'
        });
        return;
      }

      const groupName = overview.groupName || 'קבוצה זו';
      
      // Prepare context for AI
      const contextMessages = messages.slice(0, 30).map(msg => 
        `[${new Date(msg.timestamp).toLocaleDateString('he-IL')}] ${msg.sender_name}: ${msg.content}`
      ).join('\n');

      // Generate answer using AI Agent
      const analysisQuery = `בקשה: ${question}\n\nקונטקסט מקבוצת "${groupName}":\n${contextMessages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const analysisResult = await this.conversationHandler.processNaturalQuery(analysisQuery, null, 'system', false);

      if (analysisResult.success) {
        const formattedAnswer = `🤖 *תשובה לשאלתך: "${question}"*

${analysisResult.analysis}

📊 *מבוסס על:*
• ${messages.length} הודעות אחרונות
• ${groupName}
• תקופה: 7 ימים אחרונים

⏰ *נוצר ב-${new Date().toLocaleString('he-IL')}*`;

        await this.socket.sendMessage(groupId, { text: formattedAnswer });

      } else {
        await this.socket.sendMessage(groupId, {
          text: `❌ שגיאה בניתוח התוכן: ${analysisResult.error}`
        });
      }

    } catch (error) {
      logger.error('Failed to handle ask question:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בעיבוד השאלה. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle remote ASK question command (from management group)
   */
  async handleRemoteAsk(message, input) {
    try {
      // Parse input: "group_name | question"
      const parts = input.split('|').map(p => p.trim());
      
      if (parts.length < 2) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❓ *שימוש בפקודת !ask מרחוק:*

*שימוש נכון:*
!ask [שם קבוצה] | [שאלה]

💡 *דוגמאות:*
• !ask AI TIPS | מה הנושא המרכזי השבוע?
• !ask הילדים שלי ואני | מי דיבר על חינוך?
• !ask חדשות טכנולוגיה | איזה חדשות היו?

⚠️ *חשוב לכלול את הסימן | בין שם הקבוצה לשאלה*`
        });
        return;
      }

      const [groupName, question] = parts;

      if (!groupName || !question) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: '❌ נא לכלול גם שם קבוצה וגם שאלה'
        });
        return;
      }

      const groups = await this.searchGroupsByName(groupName);
      if (groups.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאה קבוצה המתאימה ל "${groupName}"\n\n💡 השתמש ב-!search כדי למצוא את השם המדויק`
        });
        return;
      }

      const selectedGroup = groups[0];
      
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: `🤔 חושב על השאלה "${question}" עבור "${selectedGroup.name}"...`
      });

      // Get messages for analysis
      const messages = await this.db.getMessagesForAsk(selectedGroup.id, 7, 50);

      if (!messages || messages.length === 0) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ לא נמצאו הודעות מתאימות לניתוח עבור "${selectedGroup.name}"`
        });
        return;
      }

      // Prepare context
      const contextMessages = messages.slice(0, 30).map(msg => 
        `[${new Date(msg.timestamp).toLocaleDateString('he-IL')}] ${msg.sender_name}: ${msg.content}`
      ).join('\n');

      // Generate analysis using AI Agent
      const analysisQuery = `בקשה: ${question}\n\nקונטקסט מקבוצת "${selectedGroup.name}":\n${contextMessages}`;
      const analysisResult = await this.conversationHandler.processNaturalQuery(analysisQuery, null, 'system', false);

      if (analysisResult.success) {
        const formattedAnswer = `🤖 *תשובה מרחוק - ${selectedGroup.name}*

❓ *השאלה:* "${question}"

${analysisResult.analysis}

📊 *מבוסס על ${messages.length} הודעות מ-7 ימים אחרונים*

⏰ ${new Date().toLocaleString('he-IL')}`;

        await this.socket.sendMessage(this.summaryTargetGroupId, { text: formattedAnswer });

      } else {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שגיאה בניתוח תוכן עבור "${selectedGroup.name}": ${analysisResult.error}`
        });
      }

    } catch (error) {
      logger.error('Failed to handle remote ask:', error);
      await this.socket.sendMessage(this.summaryTargetGroupId, {
        text: '❌ שגיאה בעיבוד שאלה מרחוק'
      });
    }
  }

  /**
   * Log available groups from database and WhatsApp
   */
  async logAvailableGroups() {
    try {
      logger.info('📊 מאתר קבוצות זמינות...');
      
      // Get groups from database
      const dbGroups = await this.db.getActiveGroups();
      if (dbGroups.length > 0) {
        logger.info(`💾 קבוצות במסד נתונים: ${dbGroups.length}`);
        dbGroups.forEach(group => {
          logger.info(`  📋 ${group.name} (${group.id})`);
        });
      }
      
      // Try to get groups from WhatsApp (when socket is ready)
      if (this.socket) {
        try {
          const chats = await this.socket.groupFetchAllParticipating();
          const groupChats = Object.values(chats).filter(chat => chat.id.endsWith('@g.us'));
          
          logger.info(`📱 קבוצות ב-WhatsApp: ${groupChats.length}`);
          
          // Save new groups to database
          for (const chat of groupChats) {
            await this.db.upsertGroup(chat.id, chat.subject || 'קבוצה ללא שם');
          }
          
          logger.info('✅ כל הקבוצות עודכנו במסד נתונים');
        } catch (error) {
          logger.warn('לא ניתן לקבל רשימת קבוצות מWhatsApp:', error.message);
        }
      }
      
      logger.info('✨ הבוט מוכן לפעולה!');
      
      // Initialize SyncManager for two-way sync between web dashboard and files
      try {
        await this.syncManager.initialize();
        logger.info('🔄 SyncManager הופעל בהצלחה');
      } catch (error) {
        logger.error('Failed to initialize SyncManager:', error);
      }
    } catch (error) {
      logger.error('Failed to get groups:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('🔄 מתחיל כיבוי מבוקר...');
    
    // Stop SyncManager
    if (this.syncManager) {
      try {
        await this.syncManager.stop();
        logger.info('✅ SyncManager נסגר בהצלחה');
      } catch (error) {
        logger.error('Error stopping SyncManager:', error);
      }
    }
    
    // Close database connection
    if (this.db) {
      try {
        await this.db.close();
      } catch (error) {
        logger.error('Error closing database:', error);
      }
    }
    
    // Close WhatsApp connection
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

  /**
   * Handle !history command - get messages from specific date/period
   * Now supports group name parameter when called from ניצן group
   */
  async handleHistoryCommand(message, args) {
    // Debug log לוודא שהפונקציה נקראת
    logger.info(`🔍 DEBUG handleHistoryCommand called with args: ${args.join(' ')}`);
    
    const groupId = message.key.remoteJid;
    const isNitzanGroup = groupId === '972546262108-1556219067@g.us';
    
    try {
      let targetGroupId = groupId;
      let targetGroupName = null;
      let startDate, endDate, period;
      
      // Check if first argument is a group name (only from ניצן group)
      if (isNitzanGroup && args.length > 0 && !args[0].match(/^\d{4}-\d{2}-\d{2}$/) && !['yesterday', 'אתמול', 'week', 'שבוע', 'month', 'חודש'].includes(args[0].toLowerCase())) {
        const groupName = args[0];
        const groups = await this.db.allQuery('SELECT id, name FROM groups WHERE name LIKE ? AND is_active = 1', [`%${groupName}%`]);
        
        if (groups.length === 0) {
          await this.socket.sendMessage(groupId, {
            text: `❌ לא נמצאה קבוצה עם השם "${groupName}"`
          });
          return;
        } else if (groups.length > 1) {
          const groupsList = groups.map(g => `• ${g.name}`).join('\n');
          await this.socket.sendMessage(groupId, {
            text: `🔍 נמצאו מספר קבוצות:\n${groupsList}\n\nהשתמש בשם מדויק יותר`
          });
          return;
        }
        
        targetGroupId = groups[0].id;
        targetGroupName = groups[0].name;
        args = args.slice(1); // Remove group name from args
      }
      
      if (args.length === 0) {
        // Default: last week
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        period = 'השבוע האחרון';
      } else if (args.length === 1) {
        const arg = args[0].toLowerCase();
        if (arg === 'yesterday' || arg === 'אתמול') {
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          period = 'אתמול';
        } else if (arg === 'week' || arg === 'שבוע') {
          endDate = new Date();
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          period = 'השבוע האחרון';
        } else if (arg === 'month' || arg === 'חודש') {
          endDate = new Date();
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);
          period = 'החודש האחרון';
        } else {
          // Try to parse as date (YYYY-MM-DD)
          const dateMatch = arg.match(/^\d{4}-\d{2}-\d{2}$/);
          if (dateMatch) {
            startDate = new Date(arg);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            period = arg;
          } else {
            await this.socket.sendMessage(groupId, {
              text: '❌ פורמט תאריך לא תקין. השתמש ב: YYYY-MM-DD, או: yesterday, week, month'
            });
            return;
          }
        }
      } else if (args.length === 2) {
        // Date range: start-date end-date
        try {
          startDate = new Date(args[0]);
          endDate = new Date(args[1]);
          period = `${args[0]} עד ${args[1]}`;
        } catch (err) {
          await this.socket.sendMessage(groupId, {
            text: '❌ פורמט תאריכים לא תקין. דוגמה: !history 2024-08-01 2024-08-07'
          });
          return;
        }
      }

      const searchMessage = targetGroupName ? 
        `🔍 מחפש הודעות מ${period} בקבוצת "${targetGroupName}"...` :
        `🔍 מחפש הודעות מ${period}...`;
      
      await this.socket.sendMessage(groupId, { 
        text: searchMessage
      });

      // Get messages from database
      const messages = await this.db.getMessagesByDateRange(targetGroupId, startDate, endDate);
      
      // Debug log לבדיקת ההודעות
      logger.info(`🔍 DEBUG messages found: ${messages.length} for date range ${startDate.toDateString()} - ${endDate.toDateString()}`);
      logger.info(`🔍 DEBUG targetGroupId: ${targetGroupId}`);
      
      if (messages.length === 0) {
        const noMessagesText = targetGroupName ? 
          `📭 לא נמצאו הודעות מ${period} בקבוצת "${targetGroupName}"` :
          `📭 לא נמצאו הודעות מ${period}`;
        
        await this.socket.sendMessage(groupId, {
          text: noMessagesText
        });
        return;
      }

      // Create summary with AI
      const currentGroupName = targetGroupName || (await this.db.getQuery('SELECT name FROM groups WHERE id = ?', [targetGroupId]))?.name || 'הקבוצה';
      const summaryQuery = `צור סיכום של ${messages.length} הודעות מקבוצת "${currentGroupName}". הנה ההודעות:\n\n${messages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const result = await this.conversationHandler.processNaturalQuery(summaryQuery, null, 'system', false);
      
      // Debug log לבדיקת התוצאה
      logger.info(`🔍 DEBUG result.success: ${result.success}`);
      logger.info(`🔍 DEBUG result keys: ${Object.keys(result).join(', ')}`);
      
      if (!result.success) {
        await this.socket.sendMessage(groupId, {
          text: `❌ שגיאה בייצור סיכום היסטוריה: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp
      const formattedSummary = result.response;
      
      // Debug logs זמניים
      logger.info(`🔍 DEBUG result.summary length: ${result.summary?.length || 'undefined'}`);
      logger.info(`🔍 DEBUG formattedSummary length: ${formattedSummary?.length || 'undefined'}`); 
      logger.info(`🔍 DEBUG currentGroupName: ${currentGroupName}`);
      
      const historyTitle = targetGroupName ? 
        `📜 *סיכום היסטוריה - ${period}*\n*קבוצה: ${targetGroupName}*` :
        `📜 *סיכום היסטוריה - ${period}*`;
      
      const responseText = `${historyTitle}\n\n${formattedSummary || result.summary || 'שגיאה בעיבוד הסיכום'}`;

      await this.socket.sendMessage(groupId, { text: responseText });

    } catch (error) {
      logger.error('Error in handleHistoryCommand:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בקבלת היסטוריה. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle !date command - get messages from specific date/period with range support
   * Based on !today functionality but with flexible date selection
   */
  async handleDateCommand(message, args) {
    const groupId = message.key.remoteJid;
    const isNitzanGroup = groupId === '972546262108-1556219067@g.us';
    
    try {
      let targetGroupId = groupId;
      let targetGroupName = null;
      let startDate, endDate, period;
      
      // Check if we have a group name (only from ניצן group)
      // Look for date patterns in the args to determine if first part is group name
      let hasDateInArgs = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i].match(/^\d{4}-\d{2}-\d{2}$/) || 
            ['yesterday', 'אתמול', 'week', 'שבוע', 'month', 'חודש'].includes(args[i].toLowerCase())) {
          hasDateInArgs = true;
          break;
        }
      }
      
      if (isNitzanGroup && args.length > 1 && hasDateInArgs && !args[0].match(/^\d{4}-\d{2}-\d{2}$/) && !['yesterday', 'אתמול', 'week', 'שבוע', 'month', 'חודש'].includes(args[0].toLowerCase())) {
        // Find where the group name ends and date begins
        let groupNameParts = [];
        let dateArgsStart = -1;
        
        for (let i = 0; i < args.length; i++) {
          if (args[i].match(/^\d{4}-\d{2}-\d{2}$/) || 
              ['yesterday', 'אתמול', 'week', 'שבוע', 'month', 'חודש'].includes(args[i].toLowerCase())) {
            dateArgsStart = i;
            break;
          }
          groupNameParts.push(args[i]);
        }
        
        if (dateArgsStart > 0) {
          const groupName = groupNameParts.join(' ');
        
        await this.socket.sendMessage(groupId, { 
          text: `🔍 מחפש קבוצה: "${groupName}"...` 
        });

        const matches = await this.searchGroupsByName(groupName);
        
        if (matches.length === 0) {
          await this.socket.sendMessage(groupId, {
            text: `❌ לא נמצאה קבוצה עם השם "${groupName}"\nנסה פקודה !search "${groupName}" לחיפוש רחב יותר`
          });
          return;
        }
        
        if (matches.length > 1) {
          const topMatches = matches.slice(0, 5);
          const matchList = topMatches.map((match, idx) => 
            `${idx + 1}. ${match.name}`
          ).join('\n');
          
          await this.socket.sendMessage(groupId, {
            text: `🔍 נמצאו ${matches.length} קבוצות. האם התכוונת לאחת מאלה?\n\n${matchList}\n\nשלח !date עם השם המדויק`
          });
          return;
        }
        
          // Single match found - proceed with date command
          const targetGroup = matches[0];
          targetGroupId = targetGroup.id;
          targetGroupName = targetGroup.name;
          args = args.slice(dateArgsStart); // Remove group name from args, keep date args
          
          await this.socket.sendMessage(groupId, { 
            text: `📅 מכין סיכום תאריך לקבוצת "${targetGroup.name}"...`
          });
        }
      }
      
      // Parse date arguments
      if (args.length === 0) {
        // Default: today
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        period = 'היום';
      } else if (args.length === 1) {
        const arg = args[0].toLowerCase();
        if (arg === 'yesterday' || arg === 'אתמול') {
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          period = 'אתמול';
        } else if (arg === 'week' || arg === 'שבוע') {
          endDate = new Date();
          endDate.setHours(23, 59, 59, 999);
          startDate = new Date();
          startDate.setDate(startDate.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          period = 'השבוע האחרון';
        } else if (arg === 'month' || arg === 'חודש') {
          endDate = new Date();
          endDate.setHours(23, 59, 59, 999);
          startDate = new Date();
          startDate.setMonth(startDate.getMonth() - 1);
          startDate.setHours(0, 0, 0, 0);
          period = 'החודש האחרון';
        } else {
          // Try to parse as date (YYYY-MM-DD)
          const dateMatch = arg.match(/^\d{4}-\d{2}-\d{2}$/);
          if (dateMatch) {
            startDate = new Date(arg);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            period = arg;
          } else {
            await this.socket.sendMessage(groupId, {
              text: '❌ פורמט תאריך לא תקין. השתמש ב: YYYY-MM-DD, או: yesterday, week, month'
            });
            return;
          }
        }
      } else if (args.length === 2) {
        // Date range: start-date end-date
        try {
          const startStr = args[0];
          const endStr = args[1];
          
          if (!startStr.match(/^\d{4}-\d{2}-\d{2}$/) || !endStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            throw new Error('Invalid date format');
          }
          
          startDate = new Date(startStr);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(endStr);
          endDate.setHours(23, 59, 59, 999);
          period = `${startStr} עד ${endStr}`;
        } catch (err) {
          await this.socket.sendMessage(groupId, {
            text: '❌ פורמט תאריכים לא תקין. דוגמה: !date 2025-08-20 2025-08-22'
          });
          return;
        }
      } else {
        await this.socket.sendMessage(groupId, {
          text: '❌ יותר מדי פרמטרים. דוגמאות:\n• !date 2025-08-29\n• !date 2025-08-20 2025-08-22\n• !date yesterday'
        });
        return;
      }

      const searchMessage = targetGroupName ? 
        `🔍 מחפש הודעות מ${period} בקבוצת "${targetGroupName}"...` :
        `🔍 מחפש הודעות מ${period}...`;

      await this.socket.sendMessage(groupId, { 
        text: searchMessage
      });

      // Get messages from database using date range
      const messages = await this.db.getMessagesByDateRange(targetGroupId, startDate, endDate);
      
      if (messages.length === 0) {
        const noMessagesText = targetGroupName ? 
          `📭 לא נמצאו הודעות מ${period} בקבוצת "${targetGroupName}"` :
          `📭 לא נמצאו הודעות מ${period}`;
        
        await this.socket.sendMessage(groupId, {
          text: noMessagesText
        });
        return;
      }

      logger.info(`📊 מייצר סיכום תאריך עבור ${period} (${messages.length} הודעות)`);
      
      // Generate summary using AI Agent
      const currentGroupName = targetGroupName || (await this.db.getQuery('SELECT name FROM groups WHERE id = ?', [targetGroupId]))?.name || 'הקבוצה';
      const summaryQuery = `צור סיכום של ${messages.length} הודעות מקבוצת "${currentGroupName}". הנה ההודעות:\n\n${messages.map(m => `${m.sender}: ${m.body}`).join('\n')}`;
      const result = await this.conversationHandler.processNaturalQuery(summaryQuery, null, 'system', false);
      
      if (!result.success) {
        await this.socket.sendMessage(groupId, {
          text: `❌ שגיאה בייצור סיכום: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp (same as other commands)
      const formattedSummary = result.response;
      
      const dateTitle = targetGroupName ? 
        `📅 *סיכום תאריך - ${period}*\n*קבוצה: ${targetGroupName}*` :
        `📅 *סיכום תאריך - ${period}*`;
      
      const responseText = `${dateTitle}\n\n${formattedSummary}`;

      await this.socket.sendMessage(groupId, { text: responseText });
      
      // Save summary to database  
      const summaryData = {
        groupId: targetGroupId,
        summaryText: result.summary,
        messagesCount: messages.length,
        startTime: messages[0]?.timestamp || startDate.toISOString(),
        endTime: messages[messages.length - 1]?.timestamp || endDate.toISOString(),
        modelUsed: result.metadata.model,
        tokensUsed: result.metadata.tokensUsed
      };
      
      const summaryId = await this.db.saveSummary(summaryData);
      logger.info(`💾 סיכום תאריך נשמר (ID: ${summaryId}) עבור תקופת ${period}`);

    } catch (error) {
      logger.error('Error in handleDateCommand:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בקבלת סיכום תאריך. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle !search-history command - search for specific content
   */
  async handleSearchHistory(message, searchTerm) {
    const groupId = message.key.remoteJid;
    const isNitzanGroup = groupId === '972546262108-1556219067@g.us';
    
    try {
      let targetGroupId = groupId;
      let targetGroupName = null;
      
      // Check if searchTerm contains group name (only from ניצן group)
      if (isNitzanGroup && searchTerm.includes(' ')) {
        const parts = searchTerm.split(' ');
        const possibleGroupName = parts[0];
        
        // Check if first word is a group name
        const groups = await this.db.allQuery('SELECT id, name FROM groups WHERE name LIKE ? AND is_active = 1', [`%${possibleGroupName}%`]);
        
        if (groups.length === 1) {
          targetGroupId = groups[0].id;
          targetGroupName = groups[0].name;
          searchTerm = parts.slice(1).join(' '); // Remove group name from search term
        }
      }
      
      const searchMessage = targetGroupName ? 
        `🔍 מחפש "${searchTerm}" בהיסטוריה של "${targetGroupName}"...` :
        `🔍 מחפש "${searchTerm}" בהיסטוריה...`;
      
      await this.socket.sendMessage(groupId, { 
        text: searchMessage
      });

      // Search in database
      const results = await this.db.searchMessagesContent(targetGroupId, searchTerm);
      
      if (results.length === 0) {
        const noResultsText = targetGroupName ? 
          `📭 לא נמצאו תוצאות לחיפוש "${searchTerm}" בקבוצת "${targetGroupName}"` :
          `📭 לא נמצאו תוצאות לחיפוש "${searchTerm}"`;
        
        await this.socket.sendMessage(groupId, {
          text: noResultsText
        });
        return;
      }

      // Group results by date
      const groupedResults = {};
      results.forEach(msg => {
        const date = new Date(msg.timestamp).toLocaleDateString('he-IL');
        if (!groupedResults[date]) groupedResults[date] = [];
        groupedResults[date].push(msg);
      });

      const searchTitle = targetGroupName ? 
        `🔍 *תוצאות חיפוש: "${searchTerm}"*\n*קבוצה: ${targetGroupName}*` :
        `🔍 *תוצאות חיפוש: "${searchTerm}"*`;
      
      let responseText = `${searchTitle}\n\n`;
      
      const dates = Object.keys(groupedResults).slice(0, 5); // Show max 5 dates
      dates.forEach(date => {
        responseText += `📅 *${date}:*\n`;
        groupedResults[date].slice(0, 3).forEach(msg => { // Max 3 messages per date
          const sender = msg.sender_name || 'משתמש לא ידוע';
          const content = msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '');
          const time = new Date(msg.timestamp).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'});
          responseText += `• ${time} ${sender}: ${content}\n`;
        });
        responseText += '\n';
      });

      if (results.length > 15) {
        responseText += `\n📈 נמצאו ${results.length} תוצאות נוספות...`;
      }

      await this.socket.sendMessage(groupId, { text: responseText });

    } catch (error) {
      logger.error('Error in handleSearchHistory:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בחיפוש בהיסטוריה. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle !timeline command - show activity timeline
   * Now supports group name parameter when called from ניצן group
   */
  async handleTimelineCommand(message, args) {
    const groupId = message.key.remoteJid;
    const isNitzanGroup = groupId === '972546262108-1556219067@g.us';
    
    try {
      let targetGroupId = groupId;
      let targetGroupName = null;
      
      // Check if first argument is a group name (only from ניצן group)
      if (isNitzanGroup && args.length > 0 && !['day', 'יום', 'week', 'שבוע', 'month', 'חודש'].includes(args[0].toLowerCase())) {
        const groupName = args[0];
        const groups = await this.db.allQuery('SELECT id, name FROM groups WHERE name LIKE ? AND is_active = 1', [`%${groupName}%`]);
        
        if (groups.length === 1) {
          targetGroupId = groups[0].id;
          targetGroupName = groups[0].name;
          args = args.slice(1); // Remove group name from args
        }
      }
      
      const period = args[0] || 'week';
      let days;
      
      switch (period.toLowerCase()) {
        case 'day':
        case 'יום':
          days = 1;
          break;
        case 'week':
        case 'שבוע':
          days = 7;
          break;
        case 'month':
        case 'חודש':
          days = 30;
          break;
        default:
          days = 7;
      }

      const timelineMessage = targetGroupName ? 
        `📈 מכין ציר זמן לפעילות של ${days} ימים אחרונים בקבוצת "${targetGroupName}"...` :
        `📈 מכין ציר זמן לפעילות של ${days} ימים אחרונים...`;
      
      await this.socket.sendMessage(groupId, { 
        text: timelineMessage
      });

      // Get activity data
      const timeline = await this.db.getActivityTimeline(targetGroupId, days);
      
      if (timeline.length === 0) {
        const noDataText = targetGroupName ? 
          `📭 אין נתוני פעילות לתקופה זו בקבוצת "${targetGroupName}"` :
          '📭 אין נתוני פעילות לתקופה זו';
        
        await this.socket.sendMessage(groupId, {
          text: noDataText
        });
        return;
      }

      const timelineTitle = targetGroupName ? 
        `📈 *ציר זמן פעילות - ${days} ימים אחרונים*\n*קבוצה: ${targetGroupName}*` :
        `📈 *ציר זמן פעילות - ${days} ימים אחרונים*`;
      
      let responseText = `${timelineTitle}\n\n`;
      
      timeline.forEach(day => {
        const date = new Date(day.date).toLocaleDateString('he-IL');
        const dayName = new Date(day.date).toLocaleDateString('he-IL', { weekday: 'long' });
        const bar = '█'.repeat(Math.min(Math.floor(day.count / 10), 20)) || '▌';
        responseText += `📅 ${date} (${dayName})\n💬 ${day.count} הודעות ${bar}\n👥 ${day.active_users} משתמשים פעילים\n\n`;
      });

      // Add peak hours
      const peakHour = await this.db.getPeakHour(targetGroupId, days);
      if (peakHour) {
        responseText += `🌟 *שעת השיא:* ${peakHour.hour}:00-${peakHour.hour + 1}:00 (${peakHour.count} הודעות)`;
      }

      await this.socket.sendMessage(groupId, { text: responseText });

    } catch (error) {
      logger.error('Error in handleTimelineCommand:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה ביצירת ציר זמן. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * Handle !group-stats command - comprehensive group statistics
   * Now supports group name parameter when called from ניצן group
   */
  async handleGroupStats(message, args) {
    const groupId = message.key.remoteJid;
    const isNitzanGroup = groupId === '972546262108-1556219067@g.us';
    
    try {
      let targetGroupId = groupId;
      let targetGroupName = null;
      
      // Check if first argument is a group name (only from ניצן group)
      if (isNitzanGroup && args && args.length > 0) {
        const groupName = args[0];
        const groups = await this.db.allQuery('SELECT id, name FROM groups WHERE name LIKE ? AND is_active = 1', [`%${groupName}%`]);
        
        if (groups.length === 1) {
          targetGroupId = groups[0].id;
          targetGroupName = groups[0].name;
        } else if (groups.length > 1) {
          const groupsList = groups.map(g => `• ${g.name}`).join('\n');
          await this.socket.sendMessage(groupId, {
            text: `🔍 נמצאו מספר קבוצות:\n${groupsList}\n\nהשתמש בשם מדויק יותר`
          });
          return;
        } else if (groups.length === 0) {
          await this.socket.sendMessage(groupId, {
            text: `❌ לא נמצאה קבוצה עם השם "${groupName}"`
          });
          return;
        }
      }
      
      const statsMessage = targetGroupName ? 
        `📊 מכין סטטיסטיקות מפורטות של "${targetGroupName}"...` :
        '📊 מכין סטטיסטיקות מפורטות...';
      
      await this.socket.sendMessage(groupId, { 
        text: statsMessage
      });

      // Get comprehensive stats
      const stats = await this.db.getComprehensiveGroupStats(targetGroupId);
      
      if (!stats) {
        const noDataText = targetGroupName ? 
          `📭 אין מספיק נתונים לסטטיסטיקות בקבוצת "${targetGroupName}"` :
          '📭 אין מספיק נתונים לסטטיסטיקות';
        
        await this.socket.sendMessage(groupId, {
          text: noDataText
        });
        return;
      }

      const statsTitle = targetGroupName ? 
        `📊 *סטטיסטיקות הקבוצה*\n*קבוצה: ${targetGroupName}*` :
        '📊 *סטטיסטיקות הקבוצה*';
      
      let responseText = `${statsTitle}\n\n`;
      
      responseText += `💬 *סה"כ הודעות:* ${stats.total_messages.toLocaleString()}\n`;
      responseText += `👥 *משתמשים פעילים:* ${stats.active_users}\n`;
      responseText += `📈 *ממוצע הודעות ביום:* ${Math.round(stats.daily_average)}\n`;
      responseText += `🎯 *פעילות השבוע:* ${stats.week_messages.toLocaleString()} הודעות\n\n`;
      
      responseText += `🏆 *המשתמשים המובילים:*\n`;
      if (stats.top_users && stats.top_users.length > 0) {
        stats.top_users.slice(0, 5).forEach((user, index) => {
          const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][index] || '•';
          responseText += `${medal} ${user.name}: ${user.count} הודעות\n`;
        });
      }
      
      responseText += `\n⏰ *הזמנים הפעילים ביותר:*\n`;
      if (stats.peak_hours && stats.peak_hours.length > 0) {
        stats.peak_hours.slice(0, 3).forEach(hour => {
          responseText += `• ${hour.hour}:00-${hour.hour + 1}:00 (${hour.count} הודעות)\n`;
        });
      }

      if (stats.oldest_message) {
        const oldestDate = new Date(stats.oldest_message).toLocaleDateString('he-IL');
        responseText += `\n📅 *הודעה ראשונה:* ${oldestDate}`;
      }

      await this.socket.sendMessage(groupId, { text: responseText });

    } catch (error) {
      logger.error('Error in handleGroupStats:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בקבלת סטטיסטיקות. נסה שוב מאוחר יותר.'
      });
    }
  }

  /**
   * בדיקה אם הקבוצה מוגדרת לשיחה טבעית
   */
  async isConversationGroup(groupId) {
    try {
      // קבוצות שיחה = כל הקבוצות הפעילות מהדשבורד
      if (this.configService) {
        const managementGroups = await this.configService.getManagementGroups();
        const conversationGroupIds = managementGroups
          .filter(g => g.active)
          .map(g => g.group_id);
        return conversationGroupIds.includes(groupId);
      }
      
      // Fallback לקבוצות קבועות אם ConfigService לא זמין
      const fallbackGroups = [
        '120363417758222119@g.us' // Nitzan bot
      ];
      return fallbackGroups.includes(groupId);
      
    } catch (error) {
      logger.error('Error checking conversation group:', error);
      // Fallback במקרה של שגיאה
      const fallbackGroups = [
        '120363417758222119@g.us' // Nitzan bot
      ];
      return fallbackGroups.includes(groupId);
    }
  }

  /**
   * עיבוד שיחה טבעית
   */
  async handleNaturalConversation(message, text, groupId, senderId, senderName) {
    try {
      const startTime = Date.now();
      
      // בניית הקשר לשאלה
      const context = {
        groupId,
        senderId,
        senderName,
        requestTime: new Date().toISOString(),
        messageKey: message.key
      };
      
      // עיבוד השאלה עם ConversationHandler - כולל פרמטרי לוגינג
      const response = await this.conversationHandler.processNaturalQuery(text, groupId, 'user', false, senderId, senderName);
      
      // שליחת התשובה לקבוצה
      await this.socket.sendMessage(groupId, { 
        text: response,
        quoted: message // מענה לההודעה המקורית
      });
      
      const duration = Date.now() - startTime;
      
      // שמירת הקשר השיחה במסד הנתונים
      await this.saveConversationContext(context, text, response, duration);
      
      logger.info(`✅ שיחה טבעית עובדה תוך ${duration}ms עבור ${senderName}`);
      
    } catch (error) {
      logger.error('Error handling natural conversation:', error);
      
      // שליחת הודעת שגיאה נדיבה למשתמש
      try {
        await this.socket.sendMessage(groupId, {
          text: `❌ מצטער ${senderName}, יש לי קצת בעיה טכנית עכשיו.\nאנסה שוב מאוחר יותר או נסח את השאלה אחרת.`,
          quoted: message
        });
      } catch (sendError) {
        logger.error('Failed to send error message:', sendError);
      }
    }
  }

  /**
   * שמירת הקשר השיחה במסד הנתונים
   */
  async saveConversationContext(context, question, response, responseTimeMs) {
    try {
      await this.db.runQuery(`
        INSERT INTO conversation_context (
          group_id, user_id, last_question, last_response, 
          context_data, response_time_ms, ai_model_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        context.groupId,
        context.senderId, 
        question,
        response,
        JSON.stringify({
          senderName: context.senderName,
          requestTime: context.requestTime,
          messageKey: context.messageKey
        }),
        responseTimeMs,
        this.conversationHandler.model
      ]);
      
    } catch (error) {
      logger.error('Failed to save conversation context:', error);
    }
  }

  /**
   * Handle !mygroups command - Show all groups with their IDs for configuration
   */
  async handleMyGroups(message) {
    const groupId = message.key.remoteJid;
    
    try {
      logger.info('📋 [MY GROUPS] Fetching all connected groups');
      
      // Get all active groups from database
      const groups = await this.db.allQuery(`
        SELECT 
          g.id,
          g.name,
          COUNT(m.id) as message_count,
          MAX(m.timestamp) as last_message_time
        FROM groups g
        LEFT JOIN messages m ON g.id = m.group_id
        WHERE g.is_active = 1
        GROUP BY g.id, g.name
        ORDER BY message_count DESC
      `);
      
      if (!groups || groups.length === 0) {
        await this.socket.sendMessage(groupId, {
          text: '❌ לא נמצאו קבוצות פעילות'
        });
        return;
      }
      
      // Build response message
      let response = `🏠 *רשימת הקבוצות שלך (${groups.length} קבוצות):*\n\n`;
      response += `⚠️ *חשוב - הגדרות ראשוניות:*\n`;
      response += `1. בחר *קבוצת ניהול אחת* (כמו "Nitzan bot")\n`;
      response += `2. העתק את ה-ID שלה\n`;
      response += `3. החלף את ה-ID ב-*3 מקומות*:\n`;
      response += `   • src/services/DatabaseAgentTools.js (שורה 756)\n`;
      response += `   • src/bot.js - חפש "summaryTargetGroupId"\n`;
      response += `   • src/bot.js - שורה ~3106 "conversationGroupId" (לשיחות AI!)\n\n`;
      response += `💡 *הקבוצה הזו תוכל:*\n`;
      response += `• לשלוח פקודות לקבוצות אחרות\n`;
      response += `• לקבל סיכומים אוטומטיים\n`;
      response += `• לנהל את הבוט\n\n`;
      response += `📊 *הקבוצות שלך:*\n`;
      response += `────────────────────────\n\n`;
      
      // Add groups to response
      groups.forEach((group, index) => {
        const lastMessageDate = group.last_message_time ? 
          new Date(group.last_message_time).toLocaleDateString('he-IL') : 
          'אין הודעות';
        
        response += `${index + 1}. *${group.name}*\n`;
        response += `   📱 ID: \`${group.id}\`\n`;
        response += `   💬 הודעות: ${group.message_count || 0}\n`;
        response += `   ⏰ הודעה אחרונה: ${lastMessageDate}\n`;
        response += `   ────────────────\n`;
      });
      
      response += `\n💡 *טיפ:* לחץ על ה-ID כדי להעתיק אותו`;
      
      // Also log to console for easy copying
      console.log('\n🏠 ========== YOUR GROUPS ==========');
      groups.forEach((group, index) => {
        console.log(`${index + 1}. ${group.name}`);
        console.log(`   ID: ${group.id}`);
        console.log(`   Messages: ${group.message_count || 0}`);
        console.log('   ─────────────────────────');
      });
      console.log('===================================\n');
      
      await this.socket.sendMessage(groupId, { text: response });
      
    } catch (error) {
      logger.error('Error in handleMyGroups:', error);
      await this.socket.sendMessage(groupId, {
        text: '❌ שגיאה בקבלת רשימת הקבוצות'
      });
    }
  }

  // ===== Dynamic Management Groups Support =====
  
  /**
   * Get active management groups from web config (replaces hardcoded summaryTargetGroupId)
   */
  async getManagementGroups() {
    try {
      return await this.configService.getManagementGroups();
    } catch (error) {
      logger.error('Failed to get management groups:', error);
      // Fallback to hardcoded group for backwards compatibility
      return [{
        id: 1,
        group_name: 'ניצן',
        group_id: this.summaryTargetGroupId,
        active: true
      }];
    }
  }

  /**
   * Check if group is a management group (replaces isFromNitzanGroup checks)
   */
  async isManagementGroup(groupId) {
    try {
      const managementGroups = await this.getManagementGroups();
      return managementGroups.some(g => g.group_id === groupId && g.active);
    } catch (error) {
      logger.error('Failed to check management group:', error);
      // Fallback to hardcoded check
      return groupId === this.summaryTargetGroupId;
    }
  }

  /**
   * Get primary management group for sending summary results
   */
  async getPrimaryManagementGroup() {
    try {
      const groups = await this.getManagementGroups();
      const activeGroups = groups.filter(g => g.active);
      
      if (activeGroups.length > 0) {
        // Return the first active group
        return activeGroups[0].group_id;
      } else {
        // Fallback to hardcoded group
        return this.summaryTargetGroupId;
      }
    } catch (error) {
      logger.error('Failed to get primary management group:', error);
      return this.summaryTargetGroupId;
    }
  }

  /**
   * Send message to all active management groups
   */
  async sendToManagementGroups(message, options = {}) {
    try {
      const groups = await this.getManagementGroups();
      const activeGroups = groups.filter(g => g.active);
      
      if (activeGroups.length === 0) {
        // Fallback to hardcoded group
        if (this.socket && this.summaryTargetGroupId) {
          await this.socket.sendMessage(this.summaryTargetGroupId, message);
        }
        return;
      }

      // Send to all active management groups
      const promises = activeGroups.map(group => {
        if (this.socket && group.group_id) {
          return this.socket.sendMessage(group.group_id, message);
        }
      });

      await Promise.all(promises.filter(p => p));
      
      if (options.logSuccess) {
        logger.info(`Message sent to ${activeGroups.length} management groups`);
      }
    } catch (error) {
      logger.error('Failed to send message to management groups:', error);
      
      // Fallback to hardcoded group
      if (this.socket && this.summaryTargetGroupId) {
        try {
          await this.socket.sendMessage(this.summaryTargetGroupId, message);
        } catch (fallbackError) {
          logger.error('Fallback message sending also failed:', fallbackError);
        }
      }
    }
  }

  /**
   * Gracefully stop the bot and web server
   */
  async shutdown() {
    try {
      logger.info('🛑 Shutting down WhatsApp Bot...');
      
      // Stop web server
      if (this.webServer) {
        await this.webServer.stop();
      }
      
      // Stop scheduler
      if (this.schedulerService) {
        await this.schedulerService.stop();
      }
      
      // Close database connection
      if (this.db) {
        await this.db.close();
      }
      
      // Close WhatsApp socket
      if (this.socket) {
        this.socket.end();
      }
      
      logger.info('✅ Bot shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }
}

module.exports = WhatsAppBot;

// Start the bot if this file is run directly
if (require.main === module) {
  // Add global error handlers to prevent crashes
  process.on('uncaughtException', (error) => {
    logger.error('🔴 Uncaught Exception:', error);
    // Don't exit - keep running
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('🔴 Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit - keep running
  });

  process.on('warning', (warning) => {
    logger.warn('⚠️ Process Warning:', warning.message);
  });

  console.log('📱 Initializing WhatsApp Bot...');
  const bot = new WhatsAppBot();
  bot.initialize().catch(error => {
    logger.error('Failed to start bot:', error);
    // Try to restart after 5 seconds instead of exiting
    setTimeout(() => {
      logger.info('🔄 Attempting to restart bot...');
      bot.initialize().catch(restartError => {
        logger.error('❌ Failed to restart:', restartError.message);
        process.exit(1);
      });
    }, 5000);
  });
}