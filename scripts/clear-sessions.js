#!/usr/bin/env node
/**
 * Clear WhatsApp sessions script
 * Run this if you have connection issues
 */

const fs = require('fs');
const path = require('path');

const sessionPath = path.join(__dirname, '../data/sessions');

console.log('🧹 מנקה sessions של WhatsApp...');

if (fs.existsSync(sessionPath)) {
  try {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    console.log('✅ Sessions נמחקו בהצלחה');
  } catch (error) {
    console.error('❌ שגיאה במחיקת sessions:', error.message);
  }
} else {
  console.log('ℹ️  אין sessions למחיקה');
}

console.log('🔄 כעת הפעל מחדש את הבוט עם: npm start');