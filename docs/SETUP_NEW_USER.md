# 🚀 Setup Guide for New Users

## Quick Start (3 Steps)

### Step 1: Install and Configure API Key
```bash
# Clone the repository
git clone [repository-url]
cd botbot

# Install dependencies
npm install

# Create .env file with your API key
echo "OPENROUTER_API_KEY=sk-or-v1-YOUR-KEY-HERE" > .env
```

### Step 2: Find Your Management Group ID
```bash
# Start the bot
node src/bot.js

# Scan QR code with WhatsApp

# In ANY WhatsApp group, send:
!mygroups

# You'll receive a list of all your groups with their IDs
# Choose ONE group to be your management group (like "My Bot Control")
# Copy its ID (looks like: 123456789@g.us)
```

### Step 3: Configure Your Management Group
Replace the default group IDs with YOUR management group ID in these 2 locations:

#### Location 1: `src/services/DatabaseAgentTools.js` (line ~756)
```javascript
// Before:
const authorizedGroups = [
  '120363417758222119@g.us', // Nitzan bot group
  '972546262108-1556219067@g.us' // ניצן group
];

// After (replace with YOUR group ID):
const authorizedGroups = [
  'YOUR-GROUP-ID-HERE@g.us', // Your management group
];
```

#### Location 2: `src/bot.js` (search for "summaryTargetGroupId")
```javascript
// Before:
this.summaryTargetGroupId = '972546262108-1556219067@g.us';

// After:
this.summaryTargetGroupId = 'YOUR-GROUP-ID-HERE@g.us';
```

## That's It! 🎉

### Test Your Setup
1. Restart the bot: `node src/bot.js`
2. In your management group, send: `!status`
3. Try advanced commands: `!list`, `!today [group name]`

### What Your Management Group Can Do
- ✅ Send commands to other groups
- ✅ Receive automatic summaries
- ✅ Access all remote commands
- ✅ Manage schedules

### Regular Groups Can
- ✅ Use basic commands (!summary, !today, !status)
- ✅ Ask natural questions (AI Agent)
- ❌ Cannot control other groups

## Troubleshooting

### "Command only available from Nitzan group"
You're seeing the old group name. Make sure you replaced BOTH locations above.

### Groups not showing in !mygroups
Wait a few seconds after connecting. The bot needs time to sync groups.

### Can't find summaryTargetGroupId
Search for: `972546262108-1556219067@g.us` in src/bot.js

## Advanced Configuration (Optional)

### Multiple Management Groups
You can add multiple management groups in DatabaseAgentTools.js:
```javascript
const authorizedGroups = [
  'GROUP-1-ID@g.us', // Main control
  'GROUP-2-ID@g.us', // Backup control
];
```

### Change Summary Target
If you want summaries to go to a different group than management:
```javascript
this.summaryTargetGroupId = 'SUMMARY-GROUP-ID@g.us';
```

---

**Need help?** 
- Check logs: `tail -f logs/bot.log`
- Run test: `!test` in any group
- Verify setup: `!mygroups` to see all groups