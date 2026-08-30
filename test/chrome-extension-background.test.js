'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backgroundPath = path.join(__dirname, '../chrome-extension/background.js');
const manifestPath = path.join(__dirname, '../chrome-extension/manifest.json');

function loadBackground() {
  const sockets = [];
  const intervals = [];
  const timeouts = [];
  const clearedIntervals = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.listeners = new Map();
      this.sent = [];
      sockets.push(this);
    }

    addEventListener(eventName, listener) {
      this.listeners.set(eventName, listener);
    }

    emit(eventName) {
      if (eventName === 'open') this.readyState = FakeWebSocket.OPEN;
      if (eventName === 'close') this.readyState = FakeWebSocket.CLOSED;
      const listener = this.listeners.get(eventName);
      if (listener) listener();
    }

    send(data) {
      assert.equal(this.readyState, FakeWebSocket.OPEN);
      this.sent.push(data);
    }

    close() {
      if (this.readyState !== FakeWebSocket.CLOSED) this.emit('close');
    }
  }

  const chrome = {
    tabs: {
      query(_queryInfo, callback) {
        callback([{ url: 'https://example.com', active: true }]);
      },
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener() {} },
    },
  };

  const context = {
    WebSocket: FakeWebSocket,
    chrome,
    console: { log() {}, error() {} },
    setInterval(callback, delay) {
      const id = intervals.length + 1;
      intervals.push({ id, callback, delay });
      return id;
    },
    clearInterval(id) {
      clearedIntervals.push(id);
    },
    setTimeout(callback, delay) {
      const id = timeouts.length + 1;
      timeouts.push({ id, callback, delay });
      return id;
    },
    clearTimeout() {},
  };

  vm.runInNewContext(fs.readFileSync(backgroundPath, 'utf8'), context, {
    filename: backgroundPath,
  });

  return { sockets, intervals, timeouts, clearedIntervals };
}

test('manifest requires a Chrome version with service-worker WebSocket keepalive support', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.minimum_chrome_version, '116');
});

test('connected service worker sends a keepalive every 20 seconds', () => {
  const { sockets, intervals } = loadBackground();
  const socket = sockets[0];

  socket.emit('open');

  assert.equal(intervals.length, 1);
  assert.equal(intervals[0].delay, 20000);
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    type: 'activeUrl',
    url: 'https://example.com',
    tabActive: true,
  });

  intervals[0].callback();
  assert.deepEqual(JSON.parse(socket.sent[1]), { type: 'keepalive' });
});

test('closing the socket stops keepalive and reconnects after 3 seconds', () => {
  const { sockets, intervals, timeouts, clearedIntervals } = loadBackground();
  const socket = sockets[0];

  socket.emit('open');
  socket.emit('close');

  assert.deepEqual(clearedIntervals, [intervals[0].id]);
  assert.equal(timeouts.length, 1);
  assert.equal(timeouts[0].delay, 3000);

  timeouts[0].callback();
  assert.equal(sockets.length, 2);
});
