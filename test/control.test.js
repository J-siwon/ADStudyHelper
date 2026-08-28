'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startControlServer, stopControlServer, getManualBreak } = require('../src/main/controlServer');

let testPort;

/** Helper: GET http://127.0.0.1:<port><path> — resolves with { statusCode, body } */
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${testPort}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    }).on('error', reject);
  });
}

// Start server once for all tests, stop after all done
before(async () => {
  const server = startControlServer(0);
  if (!server.listening) {
    await new Promise((resolve) => server.once('listening', resolve));
  }
  testPort = server.address().port;
});

after(() => {
  stopControlServer();
});

// Reset manualBreak to false before each test via /resume
beforeEach(async () => {
  await get('/resume');
});

test('GET /break sets manualBreak to true', async () => {
  const { statusCode, body } = await get('/break');
  assert.equal(statusCode, 200);
  assert.equal(getManualBreak(), true);
  assert.ok(body.includes('쉬는시간'), 'response page should mention 쉬는시간');
});

test('GET /resume sets manualBreak to false after break', async () => {
  await get('/break');
  assert.equal(getManualBreak(), true);

  const { statusCode } = await get('/resume');
  assert.equal(statusCode, 200);
  assert.equal(getManualBreak(), false);
});

test('GET / returns status page with both buttons', async () => {
  const { statusCode, body } = await get('/');
  assert.equal(statusCode, 200);
  assert.ok(body.includes('/break'), 'status page should have /break link');
  assert.ok(body.includes('/resume'), 'status page should have /resume link');
});
