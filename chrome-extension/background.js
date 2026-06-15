'use strict';

// ADStudyHelper Chrome Extension — background service worker (MV3)
// Connects to the desktop app's WebSocket server on ws://127.0.0.1:47615
// and sends the active tab URL whenever it changes.

const WS_URL = 'ws://127.0.0.1:47615';
const RECONNECT_DELAY_MS = 3000;

let ws = null;
let reconnectTimer = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    console.log('[ADStudyHelper] WebSocket connected');
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Send current active tab URL immediately on connect
    sendActiveTab();
  });

  ws.addEventListener('close', () => {
    console.log('[ADStudyHelper] WebSocket closed — reconnecting in', RECONNECT_DELAY_MS, 'ms');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    // error is always followed by close; just let close handler retry
    ws.close();
  });
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

function sendActiveTab() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    const msg = {
      type: 'activeUrl',
      url: tab.url || '',
      tabActive: true,
    };
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      console.error('[ADStudyHelper] send error:', e);
    }
  });
}

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(() => {
  sendActiveTab();
});

// Listen for tab URL updates (navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    sendActiveTab();
  }
});

// Listen for window focus changes
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    sendActiveTab();
  }
});

// Initial connection
connect();
