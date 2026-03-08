// ============================================================================
// CONSTANTS - UPDATE THESE WITH YOUR VALUES
// ============================================================================
const BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const WEB_APP_URL = 'YOUR_WEB_APP_URL_HERE';
const CHAT_ID = 'YOUR_CHAT_ID_HERE'; 
const TELEGRAM_API = 'https://api.telegram.org/bot' + BOT_TOKEN;
const STATUS_TRIGGER_FUNCTION = 'sendScheduledStatus';
const OVERDUE_TRIGGER_FUNCTION = 'sendOverdueAlert';

// ============================================================================
// SPREADSHEET CACHING
// ============================================================================
let _spreadsheet = null;
function getSpreadsheet() {
  if (!_spreadsheet) _spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _spreadsheet;
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    if (update.callback_query) {
      handleButtonClick(update.callback_query);
    } else if (update.message && update.message.text) {
      handleMessage(update.message);
    }
  } catch (error) {
    Logger.log('Error: ' + error);
  }
  return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// MESSAGE ROUTER
// ============================================================================
function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text.trim();
  const userName = message.from.first_name || 'User';
  
  const messageAge = Math.floor(Date.now() / 1000) - message.date;
  if (messageAge > 10) return;

  switch(text) {
    case '/start':
      sendMessage(chatId, '✅ Connected! I am ready to track chores.\n\nCommands:\n/log - Log chores\n/status - View status');
      break;
    case '/log':
      sendThinking(chatId);
      const buttons = generateChoreButtons(userName, "");
      sendMessageWithButtons(chatId, '📝 Select chores to log:', buttons);
      break;
    case '/status':
      sendThinking(chatId);
      showChoreStatus(chatId);
      break;
  }
}

// ============================================================================
// BUTTON GENERATOR (MULTI-SELECT LOGIC)
// ============================================================================
function generateChoreButtons(userName, selectedIds = "") {
  const ss = getSpreadsheet();
  const masterSheet = ss.getSheetByName('Master');
  const data = masterSheet.getDataRange().getValues();
  const selectedArray = selectedIds ? selectedIds.split(',') : [];
  
  const overdueList = getOverdueChores();
  const overdueMap = {};
  overdueList.forEach(c => overdueMap[c.name] = c.daysOverdue);

  const buttons = [];
  
  for (let i = 1; i < data.length; i++) {
    const choreName = data[i][0].toString().trim();
    if (!choreName) continue;

    const rowId = (i + 1).toString(); 
    const isSelected = selectedArray.includes(rowId);
    
    let newSelection = isSelected 
      ? selectedArray.filter(id => id !== rowId).join(',') 
      : (selectedArray.length > 0 ? selectedArray.join(',') + ',' + rowId : rowId);

    let label = (isSelected ? "✅ " : "") + choreName;
    if (choreName in overdueMap && !isSelected) {
      const d = overdueMap[choreName];
      label = '⚠️ ' + choreName + (d > 0 ? ' (' + d + 'd)' : ' (due)');
    }

    buttons.push([{ 
      text: label, 
      callback_data: 'toggle:' + newSelection + ':' + userName 
    }]);
  }

  const controlRow = [];
  if (selectedArray.length > 0) {
    controlRow.push({ text: "🚀 LOG (" + selectedArray.length + ")", callback_data: 'bulk:' + selectedIds + ':' + userName });
  }
  controlRow.push({ text: '❌ Cancel', callback_data: 'cancel' });
  buttons.push(controlRow);

  return buttons;
}

// ============================================================================
// BUTTON CLICK HANDLER (INCLUDES POST-LOG SUMMARY)
// ============================================================================
function handleButtonClick(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const parts = callbackQuery.data.split(':');
  const action = parts[0];

  if (action === 'cancel') {
    editMessage(chatId, messageId, '❌ Cancelled');
    answerCallback(callbackQuery.id);
    return;
  }

  if (action === 'toggle') {
    const selectedIds = parts[1] || "";
    const userName = parts[2];
    const newButtons = generateChoreButtons(userName, selectedIds);
    editMessageWithButtons(chatId, messageId, '📝 Select chores to log:', newButtons);
    answerCallback(callbackQuery.id);
  } 
  
  else if (action === 'bulk') {
    const ids = parts[1].split(',');
    const userName = parts[2];
    const chores = getChoreList(); 
    
    ids.forEach(id => {
      const rowIndex = parseInt(id) - 2;
      if (chores[rowIndex]) logChore(chores[rowIndex], userName);
    });

    editMessage(chatId, messageId, '✅ Logged ' + ids.length + ' chore(s) successfully!');
    answerCallback(callbackQuery.id, 'Logged!');

    // Restore the "Still Overdue" alert logic
    Utilities.sleep(1000); // Give Sheet time to recalculate
    const stillOverdue = getOverdueChores();
    if (stillOverdue.length > 0) {
      let warning = '⚠️ ' + stillOverdue.length + ' other chore' + (stillOverdue.length === 1 ? '' : 's') + ' still overdue:\n';
      stillOverdue.forEach(c => {
        let dueText = c.daysOverdue === 0 ? 'due today' : c.daysOverdue + 'd overdue';
        warning += '🔴 ' + c.name + ' — ' + dueText + '\n';
      });
      sendMessage(chatId, warning);
    }
  }
}

// ============================================================================
// STATUS REPORT (FIXED DATE PARSING & 0-DAY ISSUE)
// ============================================================================
function showChoreStatus(chatId) {
  try {
    const ss = getSpreadsheet();
    const masterSheet = ss.getSheetByName('Master');
    const data = masterSheet.getDataRange().getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = [];
    const onTrack = [];

    for (let i = 1; i < data.length; i++) {
      const choreName = data[i][0];
      const lastDoneRaw = data[i][2]; // Column C
      const nextDueRaw = data[i][3];  // Column D
      const status = data[i][4] ? data[i][4].toString().toUpperCase() : '';

      if (!choreName || choreName.toString().trim() === '') continue;

      // Robust parsing for Last Done
      let lastDoneDate = null;
      if (lastDoneRaw instanceof Date) lastDoneDate = lastDoneRaw;
      else if (typeof lastDoneRaw === 'number' && lastDoneRaw > 0) lastDoneDate = new Date((lastDoneRaw - 25569) * 86400000);
      
      let lastDoneStr = lastDoneDate ? 'done ' + formatShortDate(lastDoneDate) : 'never done';
      
      // Robust parsing for Next Due
      let nextDue = null;
      if (nextDueRaw instanceof Date) nextDue = new Date(nextDueRaw);
      else if (typeof nextDueRaw === 'number' && nextDueRaw > 0) nextDue = new Date((nextDueRaw - 25569) * 86400000);
      
      if (nextDue) nextDue.setHours(0,0,0,0);

      const daysUntilDue = nextDue ? Math.ceil((nextDue - today) / 86400000) : null;
      const isOverdue = status.includes('OVERDUE') || status.includes('NEVER');
      const chore = { name: choreName, lastDoneStr: lastDoneStr, daysUntilDue: daysUntilDue };

      if (isOverdue) overdue.push(chore); else onTrack.push(chore);
    }

    let report = '📊 Chore Status — ' + onTrack.length + '/' + (overdue.length + onTrack.length) + ' on track\n';

    if (overdue.length > 0) {
      report += '\n⚠️ OVERDUE:\n';
      overdue.sort((a,b) => (a.daysUntilDue || 0) - (b.daysUntilDue || 0)).forEach(c => {
        let dueText = c.daysUntilDue === 0 ? 'DUE TODAY 🔔' : (c.daysUntilDue < 0 ? Math.abs(c.daysUntilDue) + 'd overdue' : 'overdue');
        report += '🔴 ' + c.name + ' — ' + c.lastDoneStr + ', ' + dueText + '\n';
      });
    }

    if (onTrack.length > 0) {
      report += '\n✅ UP TO DATE:\n';
      onTrack.sort((a,b) => (a.daysUntilDue || 0) - (b.daysUntilDue || 0)).forEach(c => {
        let dueText = c.daysUntilDue === 0 ? 'due TODAY 🔔' : (c.daysUntilDue === 1 ? 'due tomorrow' : 'due in ' + c.daysUntilDue + ' days');
        report += '  ' + c.name + ' — ' + c.lastDoneStr + ', ' + dueText + '\n';
      });
    }

    sendMessage(chatId, report);
  } catch (e) { sendMessage(chatId, '❌ Error loading status.'); }
}

// ============================================================================
// HELPERS
// ============================================================================
function formatShortDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  let str = months[date.getMonth()] + ' ' + date.getDate();
  if (date.getFullYear() !== now.getFullYear()) str += " '" + String(date.getFullYear()).slice(2);
  return str;
}

function getChoreList() {
  const sheet = getSpreadsheet().getSheetByName('Master');
  const data = sheet.getDataRange().getValues();
  return data.slice(1).map(r => r[0].toString().trim()).filter(n => n !== "");
}

function getOverdueChores() {
  const sheet = getSpreadsheet().getSheetByName('Master');
  const data = sheet.getDataRange().getValues();
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = [];
  for (let i = 1; i < data.length; i++) {
    const status = data[i][4] ? data[i][4].toString().toUpperCase() : '';
    if (status.includes('OVERDUE') || status.includes('NEVER')) {
      const raw = data[i][3];
      let nextDue = null;
      if (raw instanceof Date) nextDue = new Date(raw);
      else if (typeof raw === 'number' && raw > 0) nextDue = new Date((raw - 25569) * 86400000);
      
      if (nextDue) nextDue.setHours(0,0,0,0);
      const days = nextDue ? Math.ceil((today - nextDue) / 86400000) : 0;
      overdue.push({ name: data[i][0], daysOverdue: days });
    }
  }
  return overdue.sort((a,b) => b.daysOverdue - a.daysOverdue);
}

function logChore(choreName, userName) {
  let logSheet = getSpreadsheet().getSheetByName('Log') || getSpreadsheet().insertSheet('Log');
  if (logSheet.getLastRow() === 0) logSheet.appendRow(['Timestamp', 'Chore Name', 'User Name']);
  logSheet.appendRow([new Date(), choreName, userName]);
}

// ============================================================================
// TELEGRAM API
// ============================================================================
function sendMessage(chatId, text) {
  UrlFetchApp.fetch(TELEGRAM_API + '/sendMessage', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: chatId, text: text }), muteHttpExceptions: true });
}

function sendMessageWithButtons(chatId, text, buttons) {
  UrlFetchApp.fetch(TELEGRAM_API + '/sendMessage', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: chatId, text: text, reply_markup: { inline_keyboard: buttons } }), muteHttpExceptions: true });
}

function editMessage(chatId, messageId, text) {
  UrlFetchApp.fetch(TELEGRAM_API + '/editMessageText', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text }), muteHttpExceptions: true });
}

function editMessageWithButtons(chatId, messageId, text, buttons) {
  UrlFetchApp.fetch(TELEGRAM_API + '/editMessageText', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, reply_markup: { inline_keyboard: buttons } }), muteHttpExceptions: true });
}

function answerCallback(id, text) {
  UrlFetchApp.fetch(TELEGRAM_API + '/answerCallbackQuery', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ callback_query_id: id, text: text || '' }), muteHttpExceptions: true });
}

function sendThinking(chatId) {
  UrlFetchApp.fetch(TELEGRAM_API + '/sendChatAction', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ chat_id: chatId, action: 'typing' }), muteHttpExceptions: true });
}

function setWebhook() {
  const response = UrlFetchApp.fetch(TELEGRAM_API + '/setWebhook', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ url: WEB_APP_URL, drop_pending_updates: true }), muteHttpExceptions: true });
  Logger.log(response.getContentText());
}

function doGet() { return ContentService.createTextOutput('Bot is alive!'); }