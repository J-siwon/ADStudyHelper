'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const {
  startControlServer,
  stopControlServer,
  getCodingAgentCount,
} = require('../src/main/controlServer');

let port;
const token = 'test-phone-token';
const receivedEvents = [];
let config = { enabled: true, detectionMode: 'actual_use' };

function request(method, pathname, { authorized = true, body } = {}) {
  return new Promise((resolve, reject) => {
    const encoded = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        ...(authorized ? { Authorization: `Bearer ${token}` } : {}),
        ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) } : {}),
      },
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, json: JSON.parse(responseBody) }));
    });
    req.on('error', reject);
    if (encoded) req.write(encoded);
    req.end();
  });
}

describe('iPhone 로컬 제어 API', () => {
  before(async () => {
    const server = startControlServer(0, {
      phoneApi: {
        getPairingToken: () => token,
        getConfig: () => config,
        getStatus: () => ({ enabled: true, isBreak: false }),
        updateConfig: (partial) => {
          config = { ...config, ...partial };
          return config;
        },
        receiveEvent: (event) => {
          receivedEvents.push(event);
          return { accepted: true, shouldNotify: true };
        },
      },
    });
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
  });

  after(() => stopControlServer());

  it('인증 없는 요청을 거부한다', async () => {
    const response = await request('GET', '/api/phone/status', { authorized: false });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json.error, 'unauthorized');
  });

  it('인증된 iPhone이 설정을 조회하고 변경한다', async () => {
    const initial = await request('GET', '/api/phone/config');
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.json.config.detectionMode, 'actual_use');

    const updated = await request('PUT', '/api/phone/config', {
      body: { config: { detectionMode: 'screen_on' } },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json.config.detectionMode, 'screen_on');
  });

  it('휴대폰 이벤트를 코딩 에이전트 세션과 섞지 않는다', async () => {
    const response = await request('POST', '/api/phone/event', {
      body: { eventId: 'phone-event', type: 'screen_on', sessionId: 'ios-session' },
    });
    assert.equal(response.statusCode, 202);
    assert.equal(receivedEvents.length, 1);
    assert.equal(receivedEvents[0].sessionId, 'ios-session');
    assert.equal(getCodingAgentCount(), 0);
  });
});
