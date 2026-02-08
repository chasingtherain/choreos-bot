# Setup Guide

Complete step-by-step guide to get ChoreOS Bot running.

## Prerequisites

- Google Account
- Telegram Account
- Pipedream Account (free)

## Step 1: Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Follow the prompts:
   - Choose a name (e.g., "ChoreOS")
   - Choose a username (must end in 'bot', e.g., "choreos_bot")
4. Save the bot token - you'll need this later

## Step 2: Create Google Spreadsheet

1. Create a new Google Sheet
2. Rename it to "ChoreOS Tracker" (or your preference)
3. Create two sheets:

### Master Sheet

| Chore Name | Freq (Days) | Last Done | Next Due | Status |
|------------|-------------|-----------|----------|--------|
| Bathroom   | 7           |           |          |        |
| Kitchen    | 3           |           |          |        |
| Laundry    | 7           |           |          |        |

**Add Formulas:**

- **C2 (Last Done)**: `=IFERROR(MAX(FILTER(Log!A:A,Log!B:B=A2)),"" )`
- **D2 (Next Due)**: `=IF(C2="","Never",C2+B2)`
- **E2 (Status)**: `=IF(C2="","❌ Never",IF(D2<TODAY(),"⚠️ OVERDUE","✅ OK"))`

Copy these formulas down for all chore rows.

### Log Sheet

| Timestamp | Chore Name | User Name |
|-----------|------------|-----------|
|           |            |           |

Leave empty - the bot will populate this automatically.

4. Copy the Spreadsheet ID from the URL:
```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
```

## Step 3: Deploy Apps Script

1. Go to https://script.google.com
2. Click **New Project**
3. Name it "ChoreOS Bot"
4. Copy the entire contents of `src/Code.gs` into the editor
5. Update the constants at the top:
```javascript
   const BOT_TOKEN = 'your_bot_token_from_step_1';
   const SPREADSHEET_ID = 'your_spreadsheet_id_from_step_2';
   const WEB_APP_URL = 'will_add_this_later';
```
6. Click **Project Settings** (gear icon)
7. Check "Show 'appsscript.json' manifest file in editor"
8. Go back to **Editor**
9. Open `appsscript.json` and replace with contents from `config/appsscript.json`
10. **Save** all files

### Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click gear icon → **Web app**
3. Settings:
   - Description: "ChoreOS Bot v1"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. Click **Authorize access** and complete authorization
6. **Copy the Web App URL** (you won't use it directly, but keep it for reference)

## Step 4: Set Up Pipedream Proxy

1. Go to https://pipedream.com and sign up (free)
2. Click **New Workflow**
3. Select **HTTP / Webhook**
4. **Copy the trigger URL** (looks like `https://eoxxx.m.pipedream.net`)
5. Click **Save and continue**
6. Click **+ Add Step** below the trigger
7. Select **Run custom code**
8. Paste this code:
```javascript
import axios from 'axios';

export default defineComponent({
  async run({ steps, $ }) {
    // Your Apps Script URL - GET THIS FROM STEP 3
    const appScriptUrl = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';
    
    // Forward the Telegram update to Apps Script
    try {
      const response = await axios({
        method: 'post',
        url: appScriptUrl,
        data: steps.trigger.event.body,
        headers: {
          'Content-Type': 'application/json'
        },
        maxRedirects: 5,
        timeout: 25000
      });
      
      console.log('Forwarded to Apps Script:', response.status);
    } catch (error) {
      console.error('Error forwarding:', error.message);
    }
  }
});
```

9. Replace `PASTE_YOUR_APPS_SCRIPT_URL_HERE` with your Apps Script Web App URL
10. Click **Deploy**

## Step 5: Connect Everything

1. Go back to Apps Script
2. Update the `WEB_APP_URL` constant with your Pipedream URL from Step 4:
```javascript
   const WEB_APP_URL = 'https://eoxxx.m.pipedream.net';
```
3. **Save**
4. Deploy a new version:
   - **Deploy** → **Manage deployments**
   - Click **Edit** → **New version** → **Deploy**
5. Run the `setWebhook()` function:
   - Select `setWebhook` from the dropdown
   - Click **Run**
   - Check logs for "✅ Webhook set successfully!"

## Step 6: Test Your Bot

1. Open Telegram
2. Search for your bot (e.g., `@choreos_bot`)
3. Send `/start` - you should get a welcome message
4. Send `/log` - you should see chore buttons
5. Click a button - it should log successfully
6. Send `/status` - you should see chore status

## Verification

Run `testConnection()` in Apps Script - you should see:
- ✅ Webhook URL pointing to Pipedream
- Pending updates: 0
- Last error: None

## Troubleshooting

If something doesn't work, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Next Steps

- Add more chores to your Master sheet
- Customize button expiry time
- Invite family members to use the bot
- Set up notifications (optional advanced feature)