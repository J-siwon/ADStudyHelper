'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { WebSocket } = require('ws');
const { startBridge, stopBridge } = require('../src/main/chromeBridge');

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

test('onUrl is called when fake client sends activeUrl message', async (t) => {
  const testPort = await getAvailablePort();
  let urlReceived = null;
  let connectionChanges = [];
  t.after(() => stopBridge());

  startBridge(
    testPort,
    (payload) => { urlReceived = payload; },
    (connected) => { connectionChanges.push(connected); }
  );

  await new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${testPort}`);

    client.on('open', () => {
      client.send(JSON.stringify({
        type: 'activeUrl',
        url: 'https://github.com/test',
        tabActive: true,
      }));

      // Give server time to process the message before asserting
      setTimeout(() => {
        try {
          assert.deepEqual(urlReceived, { url: 'https://github.com/test', tabActive: true });
          assert.equal(connectionChanges[0], true, 'onConnectionChange(true) should fire on connect');
        } catch (err) {
          client.close();
          reject(err);
          return;
        }

        client.close();

        // Give server time to fire the disconnect callback
        setTimeout(() => {
          try {
            assert.equal(connectionChanges[connectionChanges.length - 1], false,
              'onConnectionChange(false) should fire on disconnect');
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 100);
      }, 100);
    });

    client.on('error', reject);
  });
});
