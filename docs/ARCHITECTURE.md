# Architecture Documentation

## System Overview

ChoreOS Bot is a serverless Telegram bot built on Google Apps Script with Pipedream as a proxy layer.

## Component Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                         User Layer                              │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                   │
│  │  User 1  │   │  User 2  │   │  User 3  │                   │
│  │ (Telegram)   │ (Telegram)   │ (Telegram)                   │
│  └─────┬────┘   └─────┬────┘   └─────┬────┘                   │
│        │              │              │                          │
└────────┼──────────────┼──────────────┼──────────────────────────┘
         │              │              │
         └──────────────┴──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │    Telegram Bot API         │
         │  (Webhook Delivery)         │
         └──────────────┬──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │      Pipedream Proxy        │
         │  • Receives webhook         │
         │  • Returns 200 OK           │
         │  • Forwards to Apps Script  │
         └──────────────┬──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │    Google Apps Script       │
         │  • Bot logic                │
         │  • Message routing          │
         │  • Button handling          │
         │  • Spreadsheet operations   │
         └──────────────┬──────────────┘
                        │
         ┌──────────────▼──────────────┐
         │     Google Sheets           │
         │  • Master sheet (chores)    │
         │  • Log sheet (history)      │
         │  • Formulas (calculations)  │
         └─────────────────────────────┘
```

## Data Flow

### User Logs a Chore
```
1. User sends /log
   ↓
2. Telegram → Pipedream (webhook)
   ↓
3. Pipedream → Apps Script (HTTP POST)
   ↓
4. Apps Script:
   - Reads Master sheet (get chores)
   - Generates inline keyboard
   ↓
5. Apps Script → Telegram API (send message)
   ↓
6. User clicks "Bathroom" button
   ↓
7. Telegram → Pipedream → Apps Script
   ↓
8. Apps Script:
   - Validates button age
   - Writes to Log sheet
   - Updates button message
   ↓
9. Apps Script → Telegram API (edit message)
   ↓
10. User sees "✅ Logged: Bathroom"
```

### Status Check
```
1. User sends /status
   ↓
2. Telegram → Pipedream → Apps Script
   ↓
3. Apps Script:
   - Reads Master sheet
   - Gets Column E (Status)
   - Builds report with emojis
   ↓
4. Apps Script → Telegram API
   ↓
5. User sees status report
```

## Key Design Decisions

### 1. Why Pipedream?

**Problem:** Google Apps Script's Content Service returns 302 redirects to `script.googleusercontent.com`. Telegram's webhook client doesn't follow redirects.

**Solution:** Pipedream receives the webhook, returns 200 OK immediately, then forwards to Apps Script in the background.

**Alternatives Considered:**
- Cloudflare Workers (more complex)
- AWS Lambda (overkill for this use case)
- Direct connection (doesn't work reliably)

### 2. Why Google Sheets?

**Pros:**
- Free for personal use
- Formulas for automatic calculations
- Familiar interface for non-technical users
- Easy manual editing if needed
- Built-in version history

**Cons:**
- Not suitable for high-frequency updates
- Limited to ~10 million cells
- No ACID transactions

**Alternatives Considered:**
- Google Firestore (more complex, overkill)
- PostgreSQL (requires hosting)
- Airtable (not free)

### 3. Why Apps Script?

**Pros:**
- Serverless (no hosting costs)
- Native Sheets integration
- JavaScript (familiar to many)
- Built-in scheduling (triggers)

**Cons:**
- 6 minute execution time limit
- No persistent state between invocations
- Limited npm package support

**Alternatives Considered:**
- Node.js + Heroku (costs money, more complex)
- Python + Google Cloud Functions (more setup)
- Telegram Bot API long polling (requires always-on server)

## Performance Characteristics

### Latency

| Operation | Average Time |
|-----------|--------------|
| `/start` response | ~500ms |
| `/log` button display | ~1.5s |
| Button click → confirmation | ~1s |
| `/status` report | ~2s |

**Bottlenecks:**
1. Spreadsheet operations (~70% of time)
2. Telegram API calls (~20% of time)
3. Apps Script execution (~10% of time)

### Throughput

**Theoretical Max:**
- Apps Script: 90 min/day = 900 executions/day @ 6s each
- Pipedream: 10,000 invocations/month = ~333/day
- **Actual limit: 333 bot commands/day (Pipedream limit)**

**Practical Usage:**
- Small family: ~20-30 commands/day
- Well within limits

### Reliability

**Single Points of Failure:**
1. Telegram API (SLA unknown)
2. Pipedream (99.9% uptime claimed)
3. Google Apps Script (99.9% SLA)
4. Google Sheets (99.9% SLA)

**Overall reliability: ~99.6% (product of all components)**

## Security Model

### Authentication Flow
```
Telegram User → Telegram Bot API (verified by Telegram)
                       ↓
                 Pipedream (no auth required)
                       ↓
               Apps Script (ANYONE_ANONYMOUS access)
                       ↓
            Google Sheets (bot owner's account only)
```

### Authorization

- **Telegram:** User must know bot username to interact
- **Pipedream:** Webhook URL is "secret" (security by obscurity)
- **Apps Script:** Public access, but no sensitive operations exposed
- **Sheets:** Only bot owner has access

### Data Privacy

**What's logged:**
- User's first name (from Telegram)
- Chore name
- Timestamp

**What's NOT logged:**
- Telegram user ID
- Phone number
- Username (unless first name unavailable)
- IP address

## Scalability Considerations

### Current Limits

| Resource | Limit | Usage |
|----------|-------|-------|
| Pipedream invocations | 10K/month | ~1% |
| Apps Script runtime | 90 min/day | ~1% |
| Sheets cells | 10M | <0.01% |

### Scaling Strategies

**If usage exceeds free tier:**

1. **Upgrade Pipedream** ($19/month for 100K invocations)
2. **Multiple Apps Script projects** (separate bots per family/group)
3. **Batch operations** (queue logs, write in batches)
4. **Cache chore list** (reduce Sheets reads)

### Horizontal Scaling

Not needed for personal use. For multiple families:
- Each family gets own instance (bot + spreadsheet)
- Each instance is independent
- No shared state

## Error Handling

### Retry Logic

**Telegram → Pipedream:**
- Telegram retries failed webhooks with exponential backoff
- Max retries: ~10 over 24 hours
- Pipedream returns 200 OK immediately (no retries needed)

**Apps Script:**
- No built-in retry for Sheets operations
- Errors logged to Apps Script console
- User sees error message in Telegram

### Failure Scenarios

| Failure | Impact | Recovery |
|---------|--------|----------|
| Sheets quota exceeded | Bot responds with error | Wait for quota reset (next day) |
| Telegram API down | No messages sent | Automatic retry when Telegram recovers |
| Pipedream down | Webhooks fail | Telegram retries for 24h |
| Apps Script error | Specific command fails | Fix code, deploy new version |

## Monitoring

### Health Checks

**Manual checks:**
1. Send `/start` - should respond immediately
2. Run `testConnection()` - should show no errors
3. Check Pipedream dashboard - should show recent invocations

**Automatic monitoring:**
- None implemented (not critical for personal use)
- Could add: UptimeRobot to ping `/start` every 5 minutes

### Metrics

**Available:**
- Apps Script execution logs
- Pipedream invocation count
- Sheets modification history

**Not available:**
- User engagement metrics
- Command usage statistics
- Error rates

Could be added with additional logging to a separate Sheets tab.

## Future Enhancements

### Planned

1. **Notifications** - Remind users when chores are overdue
2. **Recurring templates** - Pre-set common chore schedules
3. **Multi-household** - Support multiple families per bot

### Under Consideration

1. **Web dashboard** - View stats outside Telegram
2. **Photo logging** - Upload before/after photos
3. **Point system** - Gamify chore completion
4. **Calendar integration** - Sync with Google Calendar

### Technical Debt

1. **No unit tests** - Add tests for critical functions
2. **Hard-coded strings** - Move to constants
3. **No CI/CD** - Automated deployment pipeline
4. **No rate limiting** - Could add if abuse becomes issue

## Development Workflow

### Local Development

1. Edit `Code.gs` locally
2. Use clasp to push to Apps Script: `clasp push`
3. Test in Telegram
4. Commit to git when working

### Deployment

1. Make changes in Apps Script editor
2. Save
3. Deploy new version
4. Test in Telegram
5. If broken, roll back to previous version

### Testing Strategy

**Manual testing:**
- Test each command after deployment
- Verify Sheets updates correctly
- Check edge cases (expired buttons, etc.)

**No automated tests currently** (Apps Script testing is complex)

## Dependencies

### External Services

- Telegram Bot API (free)
- Pipedream (free tier)
- Google Apps Script (free)
- Google Sheets (free)

### Libraries

- None (vanilla JavaScript only)
- Axios (Pipedream only, built-in)

### APIs

- Telegram Bot API v6.0+
- Google Sheets API v4 (via Apps Script built-ins)

## Appendix: Alternative Architectures

### Architecture A: Direct Connection (Attempted)
```
Telegram → Apps Script → Sheets
```

**Status:** Doesn't work due to 302 redirects

### Architecture B: Long Polling
```
Apps Script polls Telegram API every minute → Sheets
```

**Pros:** No webhook needed
**Cons:** 
- Inefficient (constant polling)
- Higher quota usage
- Slower response time

### Architecture C: Serverless Functions
```
Telegram → AWS Lambda/Cloud Functions → Sheets API
```

**Pros:** More control, better performance
**Cons:** 
- Costs money
- More complex setup
- Requires authentication management

### Architecture D: Self-Hosted
```
Telegram → Your server (Node.js) → Database
```

**Pros:** Full control
**Cons:**
- Requires hosting ($)
- Requires maintenance
- Overkill for personal use