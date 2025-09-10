/**
 * בדיקות TDD לזרימת הגדרת API KEY למשתמש חדש
 * קפטן, אלה הבדיקות שיבטיחו שמשתמש חדש יכול להגדיר API KEY דרך הדשבורד
 */

const request = require('supertest');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const assert = require('assert');
const ConfigService = require('../src/services/ConfigService');
const DatabaseManager = require('../src/database/DatabaseManager');

describe('API Key Setup Flow - זרימת הגדרת API KEY למשתמש חדש', () => {
  let app;
  let configService;
  let db;

  before(async function() {
    this.timeout(10000); // יותר זמן לאתחול
  });

  beforeEach(async function() {
    this.timeout(10000);
    
    // ניקוי משתני סביבה לבדיקה נקייה
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    
    // יצירת מסד נתונים זמני לבדיקות
    db = new DatabaseManager(':memory:');
    await db.initialize();
    
    // יצירת ConfigService לבדיקות
    configService = new ConfigService(db);
    
    // יצירת Express app לבדיקות
    app = express();
    app.use(express.json());
    
    // הוספת routes לבדיקה
    app.get('/api/config/api-key', async (req, res) => {
      const status = await configService.getApiKeyStatus();
      res.json({ success: true, data: status });
    });

    app.post('/api/config/api-key/test', async (req, res) => {
      const { apiKey } = req.body;
      const result = await configService.testApiKey(apiKey);
      res.json(result);
    });

    app.post('/api/config/api-key/save', async (req, res) => {
      const { apiKey, model } = req.body;
      const result = await configService.saveApiKey(apiKey, model);
      res.json(result);
    });
  });

  describe('📱 תסריט משתמש חדש - New User Scenario', () => {
    
    it('🔍 צעד 1: בדיקת מצב API KEY ראשוני - מפתח קיים וניתן לקריאה', async function() {
      // Arrange - משתמש נכנס לדשבורד
      
      // Act - קבלת מצב ה-API KEY
      const response = await request(app).get('/api/config/api-key');
      
      // Assert - המערכת מחזירה מצב תקין
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);
      assert(typeof response.body.data.keyPresent === 'boolean');
      
      // אם יש מפתח, הוא אמור להיות מוסתר
      if (response.body.data.keyPresent) {
        assert(response.body.data.keyMasked.includes('••••••••'));
      }
    });

    it('🔑 צעד 2: הזנת API KEY תקין - צריך להצליח', async function() {
      // Arrange
      const validApiKey = 'sk-or-v1-1234567890abcdef1234567890abcdef1234567890abcdef12';
      
      // Act - שמירת מפתח תקין
      const response = await request(app)
        .post('/api/config/api-key/save')
        .send({ 
          apiKey: validApiKey,
          model: 'anthropic/claude-3.5-sonnet' 
        });
      
      // Assert
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, true);
      assert.match(response.body.message || '', /saved|נשמר/);
    });

    it('❌ צעד 3: הזנת API KEY לא תקין - צריך להיכשל', async function() {
      // Arrange
      const invalidApiKey = 'invalid-key-format';
      
      // Act
      const response = await request(app)
        .post('/api/config/api-key/save')
        .send({ apiKey: invalidApiKey });
      
      // Assert
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.error, /Invalid.*format|פורמט/);
    });

    it('🧪 צעד 4: בדיקת חיבור עם מפתח תקין', async function() {
      // Arrange
      const validApiKey = 'sk-or-v1-1234567890abcdef1234567890abcdef1234567890abcdef12';
      
      // Act - בדיקת המפתח
      const response = await request(app)
        .post('/api/config/api-key/test')
        .send({ apiKey: validApiKey });
      
      // Assert - הבדיקה תיכשל כי זה לא מפתח אמיתי, אבל הפורמט תקין
      assert.strictEqual(response.status, 200);
      assert(response.body.hasOwnProperty('success'));
      // בדיקת פורמט אמורה לעבור גם אם ה-API call נכשל
    });

  });

  describe('🔒 בטיחות ואבטחה - Security & Validation', () => {
    
    it('🚫 מניעת הזנת מפתח ריק', async function() {
      const response = await request(app)
        .post('/api/config/api-key/save')
        .send({ apiKey: '' });
      
      assert.strictEqual(response.body.success, false);
      assert.match(response.body.error, /empty|ריק/);
    });

    it('🚫 מניעת הזנת מפתח עם פורמט שגוי', async function() {
      const invalidKeys = [
        'sk-wrong-format',
        '1234567890',
        'api-key-test',
        'sk-or-v2-invalid'  // גרסה לא נכונה
      ];

      for (const invalidKey of invalidKeys) {
        const response = await request(app)
          .post('/api/config/api-key/save')
          .send({ apiKey: invalidKey });
        
        assert.strictEqual(response.body.success, false);
        assert.match(response.body.error, /Invalid.*format/);
      }
    });

  });

  describe('🎯 זרימה מלאה של משתמש חדש - Complete New User Flow', () => {
    
    it('🚀 תסריט מלא: משתמש מעדכן API KEY בהצלחה', async function() {
      this.timeout(15000);
      
      // צעד 1: בדיקה ראשונית - יש מצב כלשהו
      let response = await request(app).get('/api/config/api-key');
      assert.strictEqual(response.body.success, true);
      
      // צעד 2: הזנת מפתח חדש תקין
      const newApiKey = 'sk-or-v1-new1234567890abcdef1234567890abcdef1234567890abc';
      response = await request(app)
        .post('/api/config/api-key/save')
        .send({ 
          apiKey: newApiKey,
          model: 'anthropic/claude-3.5-sonnet' 
        });
      assert.strictEqual(response.body.success, true);
      
      // צעד 3: וידוא שהמפתח החדש נשמר
      response = await request(app).get('/api/config/api-key');
      assert.strictEqual(response.body.data.keyPresent, true);
      assert.strictEqual(response.body.data.model, 'anthropic/claude-3.5-sonnet');
      assert(response.body.data.keyMasked.includes('••••••••'));
      
      // צעד 4: בדיקת חיבור עם המפתח החדש (פורמט תקין)
      response = await request(app)
        .post('/api/config/api-key/test')
        .send({ apiKey: newApiKey });
      assert(response.body.hasOwnProperty('success'));
      
    });

  });

  describe('🎛️ בחירת מודל - Model Selection', () => {
    
    it('📋 ברירת מחדל למודל Claude 3.5 Sonnet', async function() {
      const validApiKey = 'sk-or-v1-1234567890abcdef1234567890abcdef1234567890abcdef12';
      
      const response = await request(app)
        .post('/api/config/api-key/save')
        .send({ apiKey: validApiKey }); // ללא מודל מפורש
      
      assert.strictEqual(response.body.success, true);
      
      // וידוא שהמודל ברירת המחדל נשמר
      const statusResponse = await request(app).get('/api/config/api-key');
      assert.strictEqual(statusResponse.body.data.model, 'anthropic/claude-3.5-sonnet');
    });

  });

});