'use strict';

// Claude Code/Codex hook 공용 런타임.
// hook payload에서 session_id만 꺼내 localhost의 ADStudyHelper로 전송한다.
// 앱이 꺼져 있거나 응답하지 않아도 에이전트 작업을 방해하지 않고 성공 종료한다.

const http = require('http');

const ALLOWED_PROVIDERS = new Set(['claude', 'codex']);
const DEFAULT_PORT = 47616;

function resolvePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : DEFAULT_PORT;
}

function sessionIdFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return typeof payload.session_id === 'string' ? payload.session_id : '';
}

function sendStatus(provider, action, payload, options = {}) {
  if (!ALLOWED_PROVIDERS.has(provider)) return Promise.resolve(false);
  const normalizedAction = action === 'done' ? 'done' : 'working';
  const sessionId = sessionIdFromPayload(payload);
  const query = sessionId ? `?id=${encodeURIComponent(sessionId)}` : '';
  const port = resolvePort(options.port || process.env.ADSTUDYHELPER_PORT);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (sent) => {
      if (settled) return;
      settled = true;
      resolve(sent);
    };

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/${provider}/${normalizedAction}${query}`,
        method: 'POST',
        timeout: 1500,
      },
      (res) => {
        res.resume();
        res.on('end', () => finish(res.statusCode >= 200 && res.statusCode < 300));
      }
    );
    req.on('error', () => finish(false));
    req.on('timeout', () => {
      req.destroy();
      finish(false);
    });
    req.end();
  });
}

function readHookPayload(stream = process.stdin, timeoutMs = 400) {
  return new Promise((resolve) => {
    let input = '';
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => finish({}), timeoutMs);

    try {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => { input += chunk; });
      stream.on('end', () => {
        try { finish(JSON.parse(input || '{}')); } catch (e) { finish({}); }
      });
      stream.on('error', () => finish({}));
      stream.resume();
    } catch (e) {
      finish({});
    }
  });
}

async function runHook(provider, action) {
  const safetyTimer = setTimeout(() => process.exit(0), 2500);
  const payload = await readHookPayload();
  await sendStatus(provider, action, payload);
  clearTimeout(safetyTimer);
}

module.exports = {
  readHookPayload,
  sendStatus,
  sessionIdFromPayload,
  runHook,
};
