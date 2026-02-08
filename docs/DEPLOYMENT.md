# Deployment Guide

## Architecture Overview
```
┌──────────┐     ┌───────────┐     ┌────────────────┐     ┌──────────────┐
│ Telegram │────▶│ Pipedream │────▶│ Apps Script    │────▶│ Google       │
│   Bot    │     │  (Proxy)  │     │  (Bot Logic)   │     │  Sheets      │
└──────────┘     └───────────┘     └────────────────┘     └──────────────┘
```

## Why Pipedream?

Google Apps Script's Content Service redirects responses to `script.googleusercontent.com` for security. Telegram's webhook client doesn't follow these 302 redirects, causing delivery failures.

**Solution:** Pipedream acts as a proxy that:
1. Receives webhook from Telegram
2. Returns immediate 200 OK (no redirect)
3. Forwards request to Apps Script in background

## Deployment Options

### Option 1: Pipedream + Apps Script (Recommended)

**Pros:**
- ✅ Reliable (no redirect issues)
- ✅ Free tier sufficient
- ✅ Easy to monitor and debug
- ✅ Works for all Telegram bots

**Cons:**
- ⚠️ Requires third-party service
- ⚠️ Adds extra hop in request chain

**Setup Time:** ~10 minutes

### Option 2: Direct to Apps Script (Not Recommended)

**Pros:**
- ✅ No third-party dependency
- ✅ Simpler architecture

**Cons:**
- ❌ Requires `ANYONE_ANONYMOUS` access
- ❌ Telegram webhook client doesn't follow redirects
- ❌ 302/401 errors common
- ❌ Difficult to troubleshoot

**Status:** Not working reliably due to Google's redirect behavior

## Apps Script Deployment Settings

### Critical Settings
```json
{
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- **executeAs: USER_DEPLOYING** - Script runs as you (the owner)
- **access: ANYONE_ANONYMOUS** - Allows unauthenticated access (required for webhooks)

### Alternative Settings (Not Recommended)
```json
{
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "ANYONE"
  }
}
```

This causes 401 errors because Telegram can't authenticate.

## Pipedream Configuration

### Trigger Settings

- **Event Data:** Full HTTP request
- **HTTP Response:** Return HTTP 200 OK
- **Domains:** pipedream.net
- **Authorization:** None

### Forwarding Code
```javascript
import axios from 'axios';

export default defineComponent({
  async run({ steps, $ }) {
    const appScriptUrl = 'YOUR_APPS_SCRIPT_URL';
    
    try {
      await axios({
        method: 'post',
        url: appScriptUrl,
        data: steps.trigger.event.body,
        headers: { 'Content-Type': 'application/json' },
        maxRedirects: 5,
        timeout: 25000
      });
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
});
```

**Key Parameters:**
- `maxRedirects: 5` - Follows Apps Script redirects
- `timeout: 25000` - 25 second timeout (Apps Script limit is 30s)
- No response handling needed - fire and forget

## Updating the Bot

### Code Changes

1. Edit `Code.gs` in Apps Script
2. **Save**
3. **Deploy** → **Manage deployments**
4. Click **Edit** → **New version** → **Deploy**

No Pipedream changes needed.

### Webhook URL Changes

1. Update `WEB_APP_URL` in `Code.gs`
2. **Save** and deploy new version
3. Run `setWebhook()` function

### Pipedream Changes

1. Edit workflow
2. Update code
3. Click **Deploy**

No Apps Script changes needed.

## Monitoring

### Apps Script Logs

View → Executions shows:
- Function calls from Pipedream
- Execution time
- Errors and stack traces
- Logger.log() output

### Pipedream Logs

Workflow dashboard shows:
- Incoming webhooks from Telegram
- Forwarding status to Apps Script
- Axios errors if any

### Telegram Webhook Status

Run `testConnection()` in Apps Script:
```
✅ Webhook URL: https://eoxxx.m.pipedream.net
Pending updates: 0
Last error: None
```

## Performance Optimization

### Current Optimizations

1. **Spreadsheet Caching**
   - Single `openById()` call per execution
   - ~3x speed improvement

2. **Age-based Filtering**
   - Ignores messages >10 seconds old
   - Prevents processing retry queues

3. **Async Telegram Responses**
   - No waiting for API responses
   - Faster user experience

### Potential Future Optimizations

1. **Batch Logging**
   - Queue logs and write in batches
   - Reduces spreadsheet API calls

2. **Redis Caching**
   - Cache chore list (rarely changes)
   - Reduce spreadsheet reads

3. **Webhook Batching**
   - Telegram supports up to 100 updates/request
   - Reduces function invocations

## Security Considerations

### Bot Token Security

- ✅ Stored in Apps Script (not client-side)
- ✅ Not visible in Pipedream logs
- ⚠️ Visible in Apps Script logs (don't share logs)

### Spreadsheet Access

- ✅ Only bot owner can access spreadsheet
- ✅ No public API endpoints
- ✅ Telegram users only see bot responses

### Pipedream Security

- ✅ HTTPS only
- ✅ No data stored (stateless forwarding)
- ⚠️ Pipedream can see webhook payloads (not sensitive)

## Backup and Recovery

### Backup Apps Script

1. File → Make a copy
2. Or use clasp: `clasp pull`

### Backup Spreadsheet

1. File → Make a copy
2. Or File → Download → Excel

### Recovery Steps

If webhook breaks:
1. Run `testConnection()` to see error
2. Run `setWebhook()` to reset
3. Check Pipedream workflow is deployed
4. Verify Apps Script deployment is active

## Cost Analysis

### Free Tier Limits

**Apps Script:**
- ✅ Unlimited for personal use
- ✅ 6 min execution time per invocation
- ✅ 90 min/day total execution time

**Pipedream:**
- ✅ 10,000 invocations/month free
- ✅ More than enough for household use

**Google Sheets:**
- ✅ Unlimited for personal use

**Telegram:**
- ✅ Completely free

### Scalability

Current setup handles:
- ~300 bot commands/day (well within free tier)
- Multiple family members simultaneously
- Thousands of log entries without performance issues

## Advanced: Direct Deployment (Experimental)

If you really want to avoid Pipedream, try these experimental approaches:

### Option A: ngrok Tunnel
ngrok http 8080
# Point Telegram webhook to ngrok URL
# Run local server that forwards to Apps Script

### Option B: Cloudflare Workers

Similar to Pipedream but self-hosted on Cloudflare's edge network.

### Option C: AWS Lambda

More complex but offers more control and monitoring.

**Note:** All these still require a proxy due to Apps Script's redirect behavior.