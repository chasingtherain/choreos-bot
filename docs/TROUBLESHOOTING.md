# Troubleshooting Guide

## Bot Doesn't Respond

### Symptom
Send `/start` but no response from bot.

### Possible Causes

1. **Webhook not set**
```
   Run: testConnection()
   Look for: "Webhook URL: https://..."
```
   **Fix:** Run `setWebhook()`

2. **Pipedream workflow not deployed**
   - Check Pipedream dashboard
   - Look for recent invocations
   **Fix:** Deploy workflow

3. **Wrong bot token**
```
   Run: verifyBotToken()
   Should show: "✅ Bot token is VALID"
```
   **Fix:** Update BOT_TOKEN constant

4. **Talking to wrong bot**
   - Check bot username in Telegram
   - Should match username from @BotFather
   **Fix:** Search for correct bot

## 302/401 Errors

### Symptom
```
Last error: Wrong response from the webhook: 302 Moved Temporarily
```
OR
```
Last error: Wrong response from the webhook: 401 Unauthorized
```

### Cause
Apps Script deployment permissions incorrect.

### Fix

1. Check `appsscript.json`:
```json
   {
     "webapp": {
       "executeAs": "USER_DEPLOYING",
       "access": "ANYONE_ANONYMOUS"
     }
   }
```

2. Redeploy:
   - Deploy → New deployment
   - Execute as: **Me**
   - Who has access: **Anyone**

3. If still failing, use Pipedream proxy (see SETUP.md)

## Buttons Don't Work

### Symptom
Click button but nothing happens, or see "This menu expired" message.

### Possible Causes

1. **Button expired (>60 minutes old)**
   - Expected behavior
   **Fix:** Send `/log` again to get fresh buttons

2. **Callback handler not working**
   - Check Apps Script executions for errors
   **Fix:** Review `handleButtonClick()` function

3. **Spreadsheet permission issue**
   - Check that bot owner has edit access
   **Fix:** Verify SPREADSHEET_ID is correct

## Formula Errors in Sheets

### #REF! Error

**Cause:** Column references broken

**Fix:**
```
Check formula: =IFERROR(MAX(FILTER(Log!A:A,Log!B:B=A2)),"")
Verify: Log sheet exists and has data in columns A and B
```

### #VALUE! Error

**Cause:** Data type mismatch

**Fix:**
- Ensure Freq (Days) is a number
- Ensure Last Done is formatted as Date/Time

### Shows number instead of date

**Cause:** Column not formatted

**Fix:**
1. Select column
2. Format → Number → Date time

## Chore Not Logging

### Symptom
Click button, see "✅ Logged: Bathroom", but Log sheet doesn't update.

### Possible Causes

1. **Wrong spreadsheet ID**
```
   Run: debugMaster()
   Should show: "✅ Spreadsheet opened"
```
   **Fix:** Update SPREADSHEET_ID constant

2. **Log sheet doesn't exist**
   - Check for sheet named exactly "Log" (case-sensitive)
   **Fix:** Bot auto-creates it, but verify it exists

3. **No write permission**
   - Bot owner must have edit access to sheet
   **Fix:** File → Share → Make sure your account can edit

## Status Not Updating

### Symptom
Log chore but Master sheet "Last Done" doesn't change.

### Cause
Formula missing or incorrect in Master sheet.

### Fix

1. Check cell C2 has formula:
```
   =IFERROR(MAX(FILTER(Log!A:A,Log!B:B=A2)),"")
```

2. Verify chore name in Master matches exactly (case-sensitive)

3. Check Log sheet has correct headers:
```
   | Timestamp | Chore Name | User Name |
```

## Pipedream Errors

### Error: Request failed with status code 401

**Cause:** Apps Script deployment needs ANYONE_ANONYMOUS access.

**Fix:** Update `appsscript.json` and redeploy.

### Error: timeout of 25000ms exceeded

**Cause:** Apps Script taking too long (>25 seconds).

**Fix:**
- Optimize spreadsheet operations
- Check for infinite loops
- Reduce data processing

### Pipedream shows no recent invocations

**Cause:** Telegram webhook not pointing to Pipedream.

**Fix:**
```
Run: testConnection()
Webhook URL should be: https://eoxxx.m.pipedream.net
If not: Run setWebhook()
```

## Multiple Responses

### Symptom
Send one command, get multiple identical responses.

### Cause
Telegram retrying failed webhook deliveries.

### Fix

1. Clear pending updates:
```javascript
   function clearQueue() {
     const url = TELEGRAM_API + '/deleteWebhook?drop_pending_updates=true';
     UrlFetchApp.fetch(url);
     Utilities.sleep(2000);
     setWebhook();
   }
```

2. Run `clearQueue()`

3. Wait 1 minute

4. Test again

## Logs and Debugging

### View Apps Script Logs

1. View → Executions
2. Click on recent `doPost` execution
3. See logs and errors

### View Pipedream Logs

1. Open workflow
2. Check left sidebar for recent invocations
3. Click to see details

### Enable Debug Mode

Add to `handleMessage()`:
```javascript
Logger.log('Received command: ' + text);
Logger.log('Message age: ' + messageAge);
```

## Common Mistakes

### 1. Forgot to deploy after code changes

**Symptom:** Changes don't take effect

**Fix:** Deploy → Manage deployments → Edit → New version → Deploy

### 2. Using wrong sheet names

**Symptom:** "Sheet not found" errors

**Fix:** Use exactly "Master" and "Log" (case-sensitive)

### 3. Formula references wrong columns

**Symptom:** #REF! or wrong data

**Fix:** Verify Log sheet has Timestamp in A, Chore Name in B

### 4. Bot token exposed in public repo

**Symptom:** Bot taken over by someone else

**Fix:**
- Regenerate token with @BotFather
- Update BOT_TOKEN constant
- Never commit token to git

## Still Not Working?

### Diagnostic Checklist

Run these in order:

1. ✅ `verifyBotToken()` - Token valid?
2. ✅ `testConnection()` - Webhook set correctly?
3. ✅ `debugMaster()` - Spreadsheet accessible?
4. ✅ Check Pipedream dashboard - Invocations showing up?
5. ✅ Check Apps Script executions - Any errors?
6. ✅ Send test message - Any response at all?

### Getting Help

If still stuck:
1. Copy error messages from Apps Script logs
2. Note what command you're running
3. Check if Pipedream shows the request
4. Open an issue on GitHub with details

### Nuclear Option

Start fresh:
1. Archive all Apps Script deployments
2. Delete Pipedream workflow
3. Create new deployment from scratch
4. Create new Pipedream workflow
5. Set webhook again

This fixes 90% of stubborn issues.