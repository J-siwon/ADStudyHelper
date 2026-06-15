'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { startBridge, stopBridge } = require('../src/main/chromeBridge');

const TEST_PORT = 47615;

test('onUrl is called when fake client sends activeUrl message', (t, done) => {
  let urlReceived = null;
  let connectionChanges = [];

  startBridge(
    TEST_PORT,
    (payload) => { urlReceived = payload; },
    (connected) => { connectionChanges.push(connected); }
  );

  const client = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);

  client.on('open', () => {
    client.send(JSON.stringify({
      type: 'activeUrl',
      url: 'https://github.com/test',
      tabActive: true,
    }));

    // Give server time to process the message before asserting
    setTimeout(() => {
      assert.deepEqual(urlReceived, { url: 'https://github.com/test', tabActive: true });
      assert.equal(connectionChanges[0], true, 'onConnectionChange(true) should fire on connect');

      client.close();

      // Give server time to fire the disconnect callback
      setTimeout(() => {
        assert.equal(connectionChanges[connectionChanges.length - 1], false,
          'onConnectionChange(false) should fire on disconnect');
        stopBridge();
        done();
      }, 100);
    }, 100);
  });

  client.on('error', (err) => {
    stopBridge();
    done(err);
  });
});
