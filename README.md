# ChoreOS Bot 🧹

A Telegram bot for household chore tracking, built with Google Apps Script and powered by Google Sheets.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- 📝 **Log chores** via inline keyboard buttons
- 📊 **View status** of all chores with emoji indicators
- ⏱️ **Button expiration** (60 minutes) to ensure fresh data
- ❌ **Cancel button** for easy dismissal
- 🚀 **Performance optimized** with spreadsheet caching
- 💾 **Automatic tracking** of who completed each chore and when

## Demo
/start  → Welcome message with command list
/log    → Shows buttons for each chore
/status → Displays current status of all chores

## Architecture
Telegram Bot → Pipedream Proxy → Google Apps Script → Google Sheets

**Why Pipedream?** Google Apps Script returns 302 redirects that Telegram's webhook client doesn't follow. Pipedream acts as a proxy that returns immediate 200 OK responses while forwarding requests to Apps Script.

## Prerequisites

- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Google Account
- Pipedream Account (free tier works)
- Google Sheets with Master and Log sheets

## Quick Start

See [SETUP.md](docs/SETUP.md) for detailed setup instructions.

### 1. Create Telegram Bot
Message @BotFather on Telegram
Send /newbot
Follow prompts to get your bot token


### 2. Set Up Google Sheets
Create a spreadsheet with two sheets:

**Master Sheet:**
| Chore Name | Freq (Days) | Last Done | Next Due | Status |
|------------|-------------|-----------|----------|--------|
| Bathroom   | 7           | (formula) | (formula)| (formula)|

**Log Sheet:**
| Timestamp | Chore Name | User Name |
|-----------|------------|-----------|
| (auto)    | (auto)     | (auto)    |

### 3. Deploy Apps Script
1. Create new Apps Script project
2. Copy `src/Code.gs` into the editor
3. Update constants with your bot token and spreadsheet ID
4. Deploy as Web App (see [DEPLOYMENT.md](docs/DEPLOYMENT.md))

### 4. Set Up Pipedream Proxy
1. Create Pipedream workflow with HTTP trigger
2. Add Node.js code step (see [DEPLOYMENT.md](docs/DEPLOYMENT.md))
3. Deploy workflow
4. Point Telegram webhook to Pipedream URL

## Configuration
Copy `config/config.example.gs` and fill in your values:
javascriptconst BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const WEB_APP_URL = 'YOUR_PIPEDREAM_URL_HERE';

## Google Sheets Formulas
### Last Done (Column C)=IFERROR(MAX(FILTER(Log!A:A,Log!B:B=A2)),"")
### Next Due (Column D)=IF(C2="","Never",C2+B2)
### Status (Column E)=IF(C2="","❌ Never",IF(D2<TODAY(),"⚠️ OVERDUE","✅ OK"))

## Project Structuresrc/Code.gs → Main bot code
config/               → Configuration files
docs/                 → Documentation
sheets/               → Sheet templates and formulas

## Commands
| Command | Description |
|---------|-------------|
| `/start` | Show welcome message and available commands |
| `/log` | Display chore selection buttons |
| `/status` | View current status of all chores |

## Key Features Explained

### Spreadsheet Caching
The bot caches the spreadsheet object to avoid repeated expensive `openById()` calls, improving response time by ~3x.

### Button Expiration
Buttons expire after 60 minutes to prevent logging against stale chore lists. Configurable via `BUTTON_EXPIRY_MINUTES`.

### Idempotency
Old messages (>10 seconds) are silently ignored to prevent processing queued retries.

### Cancel Button
Every `/log` menu includes a cancel button for easy dismissal without clicking outside.

## Troubleshooting

### Bot doesn't respond
- Check webhook status: Run `testConnection()` in Apps Script
- Verify Pipedream workflow is deployed
- Check Apps Script execution logs

### 302/401 Errors
- Ensure Apps Script deployment uses `ANYONE_ANONYMOUS` access
- Verify Pipedream is forwarding correctly
- Check `appsscript.json` manifest settings

## Contributing
Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License
MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments
- Built during a debugging marathon with Claude (Anthropic)
- Inspired by the need for better household chore tracking
- Thanks to the Google Apps Script and Telegram Bot API communities