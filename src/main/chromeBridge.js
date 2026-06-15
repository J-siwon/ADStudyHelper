'use strict';

const { WebSocketServer } = require('ws');

// localhost-only WebSocket server on port 47615.
// Chrome extension connects and sends active tab URL messages.
// module.exports: { startBridge(port, onUrl, onConnectionChange), stopBridge() }

let wss = null;
let currentClient = null;

/**
 * Start the WebSocket bridge server.
 * @param {number} port - Port to listen on (47615)
 * @param {function} onUrl - Called with { url: string, tabActive: boolean } on each URL message
 * @param {function} onConnectionChange - Called with (connected: boolean) on connect/disconnect
 */
function startBridge(port, onUrl, onConnectionChange) {
  if (wss) return; // already running

  wss = new WebSocketServer({ host: '127.0.0.1', port });

  wss.on('connection', (ws) => {
    // Only keep one client (the extension); close any previous connection
    if (currentClient && currentClient.readyState === currentClient.OPEN) {
      currentClient.close();
    }
    currentClient = ws;
    onConnectionChange(true);

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (e) {
        return; // ignore malformed messages
      }
      if (msg && msg.type === 'activeUrl') {
        onUrl({ url: msg.url, tabActive: !!msg.tabActive });
      }
    });

    ws.on('close', () => {
      if (currentClient === ws) {
        currentClient = null;
        onConnectionChange(false);
      }
    });

    ws.on('error', () => {
      if (currentClient === ws) {
        currentClient = null;
        onConnectionChange(false);
      }
    });
  });
}

/**
 * Stop the WebSocket bridge server and close any active client connection.
 */
function stopBridge() {
  if (currentClient) {
    currentClient.close();
    currentClient = null;
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}

module.exports = { startBridge, stopBridge };
