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
Replace the default group IDs with YOUR management group ID in these 3 locations:

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

#### Location 3: `src/bot.js` (line ~3106 - CRITICAL for AI conversations!)
```javascript
// Before:
const conversationGroupId = '120363417758222119@g.us'; // Nitzan bot

// After:
const conversationGroupId = 'YOUR-GROUP-ID-HERE@g.us'; // Your management group
```

⚠️ **Without Location 3, the bot won't respond to natural questions - only to commands!**

## That's It! 🎉

### Test Your Setup
1. Restart the bot: `node src/bot.js`
2. In your management group, send: `!status`
3. Try natural conversation: "What happened today?"
4. Try advanced commands: `!list`, `!today [group name]`

### What Your Management Group Can Do
- ✅ Ask natural questions to AI (e.g., "What happened today?")
- ✅ Send commands to other groups
- ✅ Receive automatic summaries
- ✅ Access all remote commands
- ✅ Manage schedules

### Regular Groups Can
- ✅ Use basic commands (!summary, !today, !status)
- ❌ Cannot ask natural questions (only management group can)
- ❌ Cannot control other groups

## Troubleshooting

### "Command only available from Nitzan group"
You're seeing the old group name. Make sure you replaced ALL 3 locations above.

### Groups not showing in !mygroups
Wait a few seconds after connecting. The bot needs time to sync groups.

### Can't find summaryTargetGroupId
Search for: `972546262108-1556219067@g.us` in src/bot.js

### Bot doesn't respond to natural questions
Make sure you updated Location 3 (`conversationGroupId`). Without it, the bot only responds to commands starting with `!`

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