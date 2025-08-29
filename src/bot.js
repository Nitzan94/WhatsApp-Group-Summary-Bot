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
const DatabaseManager = require('./database/DatabaseManager');
const SummaryService = require('./services/SummaryService');
const SchedulerService = require('./services/SchedulerService');

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
    this.summaryService = new SummaryService();
    this.schedulerService = new SchedulerService(this, this.db);
    this.summaryTargetGroupId = '972546262108-1556219067@g.us'; // קבוצת "ניצן"
    
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
      
      // Clean old messages (older than 72 hours)
      await this.db.cleanOldMessages(72);
      
      // Initialize scheduler service
      await this.schedulerService.initialize();
      logger.info('⏰ מערכת תזמונים אותחלה');
      
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
        this.handleGroupsUpdate(groups);
      });

      // Handle historical messages
      this.socket.ev.on('messaging-history.set', (historyUpdate) => {
        this.handleMessageHistory(historyUpdate);
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
          if (text?.startsWith('!')) {
            logger.info(`📝 פקודה התקבלה: ${text}`);
            await this.handleCommand(message, text);
          }
        }
      } catch (error) {
        logger.error('Failed to process message:', error);
      }
    }
  }

  /**
   * Process and save message to database
   */
  async processAndSaveMessage(message) {
    const groupId = message.key.remoteJid;
    const messageId = message.key.id;
    const senderId = message.key.participant || message.key.remoteJid;
    
    // Only process group messages
    if (!groupId?.endsWith('@g.us')) return;
    
    // Extract message content
    const messageType = Object.keys(message.message || {})[0];
    const messageContent = message.message?.[messageType];
    let content = '';
    
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
      default:
        content = `[${messageType}]`;
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
      if (messages && messages.length > 0) {
        logger.info(`📜 קיבל ${messages.length} הודעות היסטוריות, התקדמות: ${progress || 0}%`);
        
        let savedCount = 0;
        for (const message of messages) {
          // Process only group messages
          if (message.key?.remoteJid?.includes('@g.us')) {
            await this.saveMessage(message);
            savedCount++;
          }
        }
        
        if (savedCount > 0) {
          logger.info(`💾 נשמרו ${savedCount} הודעות היסטוריות מקבוצות`);
        }
        
        if (isLatest) {
          logger.info('✅ סיים לקבל היסטוריית הודעות');
        }
      }
      
      if (chats && chats.length > 0) {
        logger.debug(`📊 עודכנו ${chats.length} צ'אטים בהיסטוריה`);
      }
      
    } catch (error) {
      logger.error('Failed to handle message history:', error);
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
      const cmd = command.toLowerCase().trim();
      const args = command.split(' ').slice(1); // Get arguments after command
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
        }
      }
      
      // Handle single-word commands (both local and from ניצן)
      switch (cmd) {
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
          await this.testSummaryService(groupId);
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
• !search כושר`;
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
      
      // Generate summary
      const result = await this.summaryService.generateSummary(messages, groupName);
      
      if (!result.success) {
        await this.socket.sendMessage(groupId, {
          text: `❌ שגיאה בייצור סיכום: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp
      const formattedSummary = this.summaryService.formatSummaryForWhatsApp(
        result.summary, 
        groupName, 
        result.metadata
      );
      
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
      const result = await this.summaryService.generateSummary(messages, groupName);
      
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
   * Test summary service
   */
  async testSummaryService(groupId) {
    try {
      await this.socket.sendMessage(groupId, { 
        text: '🧪 בודק חיבור ל-AI...' 
      });
      
      const result = await this.summaryService.testConnection();
      
      if (result.success) {
        await this.socket.sendMessage(groupId, {
          text: `✅ חיבור לAPI תקין!\n💬 תגובה: "${result.message}"`
        });
      } else {
        await this.socket.sendMessage(groupId, {
          text: `❌ בעיה בחיבור לAPI:\n${result.error}`
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
      const result = await this.summaryService.generateSummary(messages, targetGroup.name);
      
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
      const result = await this.summaryService.generateSummary(messages, targetGroup.name);
      
      if (!result.success) {
        await this.socket.sendMessage(this.summaryTargetGroupId, {
          text: `❌ שגיאה בייצור הסיכום: ${result.error}`
        });
        return;
      }
      
      // Format summary for WhatsApp
      const formattedSummary = this.summaryService.formatSummaryForWhatsApp(
        result.summary, 
        `${targetGroup.name} (מרחוק)`, 
        result.metadata
      );
      
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
      const groups = await this.searchGroups(groupName);
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
      const groups = await this.searchGroups(groupName);
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
    } catch (error) {
      logger.error('Failed to get groups:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('🔄 מתחיל כיבוי מבוקר...');
    
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