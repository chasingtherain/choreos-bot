// ============================================================================
// CONSTANTS - UPDATE THESE WITH YOUR VALUES
// ============================================================================
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const WEB_APP_URL = 'YOUR_PIPEDREAM_URL_HERE';
const CHAT_ID = 'YOUR_CHAT_ID_HERE'; // Chat ID to receive scheduled status reports
const TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;
const BUTTON_EXPIRY_MINUTES = 5; // Buttons expire after 5 minutes
const STATUS_TRIGGER_FUNCTION = 'sendScheduledStatus';

// ============================================================================
// SPREADSHEET CACHING (Performance Optimization)
// ============================================================================
let _spreadsheet = null;

function getSpreadsheet() {
  if (!_spreadsheet) {
    _spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _spreadsheet;
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    
    // Handle button clicks
    if (update.callback_query) {
      handleButtonClick(update.callback_query);
    } else if (update.message && update.message.text) {
      handleMessage(update.message);
    }
    
  } catch (error) {
    Logger.log('Error: ' + error);
  }
  
  // ALWAYS return 200 OK immediately
  return ContentService.createTextOutput(JSON.stringify({status: 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// MESSAGE ROUTER
// ============================================================================
function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text.trim();
  const userName = message.from.first_name || 'User';
  
  // Ignore messages older than 10 seconds (prevents processing old queue)
  const messageAge = Math.floor(Date.now() / 1000) - message.date;
  if (messageAge > 10) {
    Logger.log('Ignoring old message (age: ' + messageAge + 's)');
    return;
  }
  
  // Route to handlers
  switch(text) {
    case '/start':
      sendMessage(chatId, '✅ Connected! I am ready to track chores.\n\nCommands:\n/log - Log a chore\n/status - View chore status');
      break;
      
    case '/log':
      sendThinking(chatId);
      showChoreButtons(chatId, userName);
      break;
      
    case '/status':
      sendThinking(chatId);
      showChoreStatus(chatId);
      break;
      
    default:
      Logger.log('Unknown command: ' + text);
      break;
  }
}

// ============================================================================
// /LOG COMMAND - Show chore selection buttons
// ============================================================================
function showChoreButtons(chatId, userName) {
  try {
    const chores = getChoreList();
    
    if (chores.length === 0) {
      sendMessage(chatId, '❌ No chores found in Master sheet.');
      return;
    }
    
    // Add timestamp for expiration checking
    const timestamp = Date.now();
    
    // Build inline keyboard with timestamp in callback data
    const buttons = chores.map(chore => [{
      text: chore,
      callback_data: 'log:' + chore + ':' + userName + ':' + timestamp
    }]);
    
    // Add Cancel button at the end
    buttons.push([{
      text: '❌ Cancel',
      callback_data: 'cancel:' + timestamp
    }]);
    
    sendMessageWithButtons(chatId, '📝 Select a chore to log:', buttons);
    
  } catch (error) {
    Logger.log('Error in showChoreButtons: ' + error);
    sendMessage(chatId, '❌ Error loading chores.');
  }
}

// ============================================================================
// BUTTON CLICK HANDLER
// ============================================================================
function handleButtonClick(callbackQuery) {
  try {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    
    // Parse callback data
    const parts = data.split(':');
    const action = parts[0];
    
    // Handle Cancel button
    if (action === 'cancel') {
      editMessage(chatId, messageId, '❌ Cancelled');
      answerCallback(callbackQuery.id);
      return;
    }
    
    // Handle Log button
    if (action === 'log') {
      const choreName = parts[1];
      const userName = parts[2];
      const timestamp = parseInt(parts[3]);
      
      // Check if button is expired (older than BUTTON_EXPIRY_MINUTES)
      const ageMinutes = (Date.now() - timestamp) / 1000 / 60;
      
      if (ageMinutes > BUTTON_EXPIRY_MINUTES) {
        answerCallback(callbackQuery.id, '❌ This menu expired. Use /log again for fresh options.');
        editMessage(chatId, messageId, '⚠️ This menu is too old. Please use /log again.');
        return;
      }
      
      // Log to spreadsheet
      logChore(choreName, userName);
      
      // Update the message
      editMessage(chatId, messageId, '✅ Logged: ' + choreName);
      
      // Show popup confirmation
      answerCallback(callbackQuery.id, 'Logged successfully!');
    }
    
  } catch (error) {
    Logger.log('Error in handleButtonClick: ' + error);
    answerCallback(callbackQuery.id, 'Error logging chore');
  }
}

// ============================================================================
// /STATUS COMMAND - Show chore status report
// ============================================================================
function showChoreStatus(chatId) {
  try {
    const ss = getSpreadsheet();
    const masterSheet = ss.getSheetByName('Master');

    if (!masterSheet) {
      sendMessage(chatId, '❌ Master sheet not found.');
      return;
    }

    const data = masterSheet.getDataRange().getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = [];
    const onTrack = [];

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const choreName = data[i][0]; // Column A
      const lastDoneRaw = data[i][2]; // Column C
      const nextDueRaw = data[i][3]; // Column D
      const status = data[i][4]; // Column E

      if (!choreName || choreName.toString().trim() === '') continue;

      // Parse last done date
      let lastDoneStr = 'never done';
      if (lastDoneRaw instanceof Date) {
        lastDoneStr = 'done ' + formatShortDate(lastDoneRaw);
      } else if (lastDoneRaw && typeof lastDoneRaw === 'number') {
        lastDoneStr = 'done ' + formatShortDate(new Date((lastDoneRaw - 25569) * 86400000));
      }

      // Parse next due and calculate days
      let daysUntilDue = null;
      if (nextDueRaw instanceof Date) {
        const d = new Date(nextDueRaw);
        d.setHours(0, 0, 0, 0);
        daysUntilDue = Math.ceil((d - today) / 86400000);
      } else if (nextDueRaw && typeof nextDueRaw === 'number') {
        const d = new Date((nextDueRaw - 25569) * 86400000);
        d.setHours(0, 0, 0, 0);
        daysUntilDue = Math.ceil((d - today) / 86400000);
      }

      const statusStr = status ? status.toString().toUpperCase() : '';
      const isOverdue = statusStr.includes('OVERDUE') || statusStr.includes('NEVER');
      const chore = { name: choreName, lastDoneStr: lastDoneStr, daysUntilDue: daysUntilDue };

      if (isOverdue) {
        overdue.push(chore);
      } else {
        onTrack.push(chore);
      }
    }

    const total = overdue.length + onTrack.length;
    if (total === 0) {
      sendMessage(chatId, '❌ No chores found.');
      return;
    }

    // Sort: overdue by most overdue first, on-track by soonest due first
    overdue.sort(function(a, b) { return (a.daysUntilDue || -9999) - (b.daysUntilDue || -9999); });
    onTrack.sort(function(a, b) { return (a.daysUntilDue || 9999) - (b.daysUntilDue || 9999); });

    // Build report
    let report = '📊 Chore Status — ' + onTrack.length + '/' + total + ' on track\n';

    if (overdue.length > 0) {
      report += '\n⚠️ OVERDUE:\n';
      for (let j = 0; j < overdue.length; j++) {
        const c = overdue[j];
        let dueText = 'overdue';
        if (c.daysUntilDue !== null && c.daysUntilDue < 0) {
          dueText = Math.abs(c.daysUntilDue) + (Math.abs(c.daysUntilDue) === 1 ? ' day overdue' : ' days overdue');
        }
        report += '🔴 ' + c.name + ' — ' + c.lastDoneStr + ', ' + dueText + '\n';
      }
    }

    if (onTrack.length > 0) {
      report += '\n✅ UP TO DATE:\n';
      for (let k = 0; k < onTrack.length; k++) {
        const c = onTrack[k];
        let dueText = '';
        if (c.daysUntilDue !== null) {
          dueText = 'due in ' + c.daysUntilDue + ' day' + (c.daysUntilDue === 1 ? '' : 's');
        }
        report += '  ' + c.name + ' — ' + c.lastDoneStr + (dueText ? ', ' + dueText : '') + '\n';
      }
    }

    sendMessage(chatId, report);

  } catch (error) {
    Logger.log('Error in showChoreStatus: ' + error);
    sendMessage(chatId, '❌ Error loading status.');
  }
}

function formatShortDate(date) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var now = new Date();
  var str = months[date.getMonth()] + ' ' + date.getDate();
  if (date.getFullYear() !== now.getFullYear()) {
    str += " '" + String(date.getFullYear()).slice(2);
  }
  return str;
}

// ============================================================================
// SPREADSHEET HELPERS
// ============================================================================
function getChoreList() {
  try {
    const ss = getSpreadsheet();
    const masterSheet = ss.getSheetByName('Master');
    
    if (!masterSheet) return [];
    
    const data = masterSheet.getDataRange().getValues();
    const chores = [];
    
    // Skip header row, get chore names from column A
    for (let i = 1; i < data.length; i++) {
      const choreName = data[i][0];
      if (choreName && choreName.toString().trim() !== '') {
        chores.push(choreName.toString().trim());
      }
    }
    
    return chores;
    
  } catch (error) {
    Logger.log('Error in getChoreList: ' + error);
    return [];
  }
}

function logChore(choreName, userName) {
  try {
    const ss = getSpreadsheet();
    let logSheet = ss.getSheetByName('Log');
    
    // Create Log sheet if it doesn't exist
    if (!logSheet) {
      logSheet = ss.insertSheet('Log');
      logSheet.appendRow(['Timestamp', 'Chore Name', 'User Name']);
    }
    
    // Append new row
    const timestamp = new Date();
    logSheet.appendRow([timestamp, choreName, userName]);
    
    Logger.log('Logged: ' + choreName + ' by ' + userName);
    
  } catch (error) {
    Logger.log('Error in logChore: ' + error);
    throw error;
  }
}

// ============================================================================
// TELEGRAM API HELPERS
// ============================================================================
function sendMessage(chatId, text) {
  const url = TELEGRAM_API + '/sendMessage';
  const payload = {
    chat_id: chatId,
    text: text
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log('Error sending message: ' + error);
  }
}

function sendThinking(chatId) {
  const url = TELEGRAM_API + '/sendChatAction';
  const payload = {
    chat_id: chatId,
    action: 'typing'
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log('Error sending typing indicator: ' + error);
  }
}

function sendMessageWithButtons(chatId, text, buttons) {
  const url = TELEGRAM_API + '/sendMessage';
  const payload = {
    chat_id: chatId,
    text: text,
    reply_markup: {
      inline_keyboard: buttons
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log('Error sending message with buttons: ' + error);
  }
}

function editMessage(chatId, messageId, text) {
  const url = TELEGRAM_API + '/editMessageText';
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log('Error editing message: ' + error);
  }
}

function answerCallback(callbackQueryId, text) {
  const url = TELEGRAM_API + '/answerCallbackQuery';
  const payload = {
    callback_query_id: callbackQueryId,
    text: text || ''
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    Logger.log('Error answering callback: ' + error);
  }
}

// For browser testing
function doGet() {
  return ContentService.createTextOutput('Bot is alive! Deployment works correctly.');
}

// ============================================================================
// SCHEDULED STATUS - Auto-send /status every 2 days
// ============================================================================
function sendScheduledStatus() {
  if (!CHAT_ID || CHAT_ID === 'YOUR_CHAT_ID_HERE') {
    Logger.log('❌ CHAT_ID not set. Update the CHAT_ID constant and re-run setupStatusTrigger.');
    return;
  }
  showChoreStatus(CHAT_ID);
}

// Run once to create the trigger. Skips if one already exists.
function setupStatusTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === STATUS_TRIGGER_FUNCTION) {
      Logger.log('ℹ️ Trigger already exists — no duplicate created.');
      return;
    }
  }
  ScriptApp.newTrigger(STATUS_TRIGGER_FUNCTION)
    .timeBased()
    .everyDays(2)
    .atHour(9) // Fires at ~9 AM in the script's timezone
    .create();
  Logger.log('✅ Status trigger created — will run every 2 days at 9 AM.');
}

// Run to remove the scheduled trigger.
function deleteStatusTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === STATUS_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  Logger.log(deleted > 0 ? '✅ Status trigger deleted.' : 'ℹ️ No trigger found to delete.');
}

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================
function setWebhook() {
  const url = TELEGRAM_API + '/setWebhook';
  const payload = {
    url: WEB_APP_URL,
    drop_pending_updates: true
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    Logger.log('Webhook response: ' + JSON.stringify(result));
    
    if (result.ok) {
      Logger.log('✅ Webhook set successfully!');
    } else {
      Logger.log('❌ Webhook setup failed: ' + result.description);
    }
    
    return result;
  } catch (error) {
    Logger.log('Error setting webhook: ' + error);
    return null;
  }
}

function testConnection() {
  const url = TELEGRAM_API + '/getWebhookInfo';
  const options = {
    method: 'get',
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    Logger.log('Webhook info: ' + JSON.stringify(result, null, 2));
    
    if (result.result) {
      Logger.log('✅ Webhook URL: ' + result.result.url);
      Logger.log('Pending updates: ' + result.result.pending_update_count);
      
      if (result.result.last_error_message) {
        Logger.log('⚠️ Last error: ' + result.result.last_error_message);
      }
    }
    
    return result;
  } catch (error) {
    Logger.log('Error getting webhook info: ' + error);
    return null;
  }
}