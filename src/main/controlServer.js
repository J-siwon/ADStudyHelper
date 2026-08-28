'use strict';

const http = require('http');
const os = require('os');

// Local HTTP control server (port 47616).
// Lets a phone on the same LAN toggle manualBreak to suppress away notifications.
// Routes: GET / → status page, GET /break → set manualBreak on, GET /resume → off.
// Exports: startControlServer(port), stopControlServer(), getManualBreak(), getLanIp()

let manualBreak = false;
let server = null;

// Claude Code + Codex 작업 상태 — 공급자와 session_id 조합으로 작업중 추적.
// hook이 /<provider>/working?id=<sid> 으로 핑, /<provider>/done?id=<sid> 으로 종료.
// 동시에 작동 중인 전체 세션 수를 펫이 컴퓨터 대수로 표현한다.
const codingAgentSessions = new Map();   // `${provider}:${sessionId}` -> lastPing(ms)
let codingAgentStatusListener = null;
let codingAgentWatchdog = null;
// 신호가 끊겨도(예: 에이전트 크래시) 일정 시간 뒤 안전하게 idle 처리.
const CODING_AGENT_TIMEOUT_MS = 180 * 1000;

/** Returns the current manualBreak flag. awayManager polls this to suppress notifications. */
function getManualBreak() {
  return manualBreak;
}

function sessionKey(provider, sessionId) {
  return `${provider}:${sessionId || 'default'}`;
}

/** Returns how many sessions are active for one provider, or across all providers. */
function getCodingAgentCount(provider) {
  if (!provider) return codingAgentSessions.size;
  const prefix = `${provider}:`;
  let count = 0;
  for (const key of codingAgentSessions.keys()) {
    if (key.startsWith(prefix)) count += 1;
  }
  return count;
}

function getCodingAgentWorking(provider) {
  return getCodingAgentCount(provider) > 0;
}

function getAgentCounts() {
  return {
    claude: getCodingAgentCount('claude'),
    codex: getCodingAgentCount('codex'),
  };
}

// 기존 호출부/외부 모듈 호환용 Claude 전용 접근자.
function getClaudeWorking() { return getCodingAgentWorking('claude'); }
function getClaudeCount() { return getCodingAgentCount('claude'); }
function getCodexWorking() { return getCodingAgentWorking('codex'); }
function getCodexCount() { return getCodingAgentCount('codex'); }

/** index.js가 펫 자세 갱신을 위해 상태 변경 콜백을 등록. cb(working, count, counts). */
function setCodingAgentStatusListener(cb) {
  codingAgentStatusListener = cb;
}

// 기존 이름을 유지해 외부 호출이 깨지지 않게 한다.
function setClaudeStatusListener(cb) {
  setCodingAgentStatusListener(cb);
}

function notifyCodingAgentListener() {
  if (typeof codingAgentStatusListener === 'function') {
    try {
      codingAgentStatusListener(getCodingAgentWorking(), getCodingAgentCount(), getAgentCounts());
    } catch (e) { /* noop */ }
  }
}

/** 세션 작업중 핑. 신규 세션이면 대수 증가 → 리스너 통지. */
function codingAgentWorkingPing(provider, sessionId) {
  const key = sessionKey(provider, sessionId);
  const isNew = !codingAgentSessions.has(key);
  codingAgentSessions.set(key, Date.now());   // lastPing 갱신
  if (isNew) notifyCodingAgentListener();      // 대수 변화시에만
}

/** 세션 종료 핑(Stop). 해당 세션 제거 → 대수 변화시 리스너 통지. */
function codingAgentDonePing(provider, sessionId) {
  const key = sessionKey(provider, sessionId);
  if (codingAgentSessions.delete(key)) notifyCodingAgentListener();
}

/** Returns the first non-loopback IPv4 LAN address, or '127.0.0.1' if none found. */
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function html(title, body, port) {
  const ip = getLanIp();
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 40px auto; padding: 0 16px; text-align: center; }
    h1 { font-size: 1.4rem; }
    .status { font-size: 1.1rem; margin: 16px 0; }
    a.btn {
      display: inline-block; margin: 8px; padding: 14px 28px;
      border-radius: 8px; text-decoration: none; font-size: 1rem; color: #fff;
    }
    .break-btn { background: #e07b39; }
    .resume-btn { background: #4caf50; }
    .info { margin-top: 24px; font-size: 0.85rem; color: #666; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
  <p class="info">제어 서버: http://${ip}:${port}</p>
</body>
</html>`;
}

function handleRequest(port) {
  return function (req, res) {
    const url = req.url.split('?')[0];

    // Claude Code/Codex hook 상태 갱신 (GET/POST 무관). 공급자 + session_id로 구분.
    const agentRoute = url.match(/^\/(claude|codex)\/(working|done|status)$/);
    if (agentRoute) {
      const provider = agentRoute[1];
      const action = agentRoute[2];
      let sid = '';
      try { sid = new URL(req.url, 'http://x').searchParams.get('id') || ''; } catch (e) { /* noop */ }
      if (action === 'working') codingAgentWorkingPing(provider, sid);
      if (action === 'done') codingAgentDonePing(provider, sid);

      const providerCount = getCodingAgentCount(provider);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        provider,
        working: providerCount > 0,
        count: providerCount,
        totalWorking: getCodingAgentWorking(),
        totalCount: getCodingAgentCount(),
        counts: getAgentCounts(),
      }));
      return;
    }

    if (url === '/agents/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        working: getCodingAgentWorking(),
        count: getCodingAgentCount(),
        counts: getAgentCounts(),
      }));
      return;
    }

    if (url === '/break') {
      manualBreak = true;
      const body = `<p class="status">쉬는시간 등록됨 — 알림이 꺼졌습니다.</p>
  <a class="btn resume-btn" href="/resume">복귀 (알림 다시 켜기)</a>
  <a class="btn" style="background:#607d8b" href="/">현재 상태</a>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('쉬는시간 등록됨', body, port));

    } else if (url === '/resume') {
      manualBreak = false;
      const body = `<p class="status">복귀 완료 — 알림이 다시 켜졌습니다.</p>
  <a class="btn break-btn" href="/break">쉬는시간 등록</a>
  <a class="btn" style="background:#607d8b" href="/">현재 상태</a>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('복귀 완료', body, port));

    } else {
      // GET / — status + buttons
      const state = manualBreak ? '쉬는중 🔴 (알림 꺼짐)' : '집중중 🟢 (알림 켜짐)';
      const body = `<p class="status">현재 상태: <strong>${state}</strong></p>
  <a class="btn break-btn" href="/break">쉬는시간 등록</a>
  <a class="btn resume-btn" href="/resume">복귀</a>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html('ADStudyHelper 폰 제어', body, port));
    }
  };
}

/**
 * Start the control HTTP server.
 * @param {number} port - Port to listen on (default 47616)
 */
function startControlServer(port) {
  if (server) return;
  server = http.createServer(handleRequest(port));
  server.listen(port, '0.0.0.0', () => {
    console.log(`[controlServer] 폰 제어 서버 시작: http://${getLanIp()}:${port}`);
  });
  // 워치독: 에이전트 hook 신호가 끊긴 세션은 일정 시간 뒤 제거 (크래시 대비)
  if (!codingAgentWatchdog) {
    codingAgentWatchdog = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [key, ts] of codingAgentSessions) {
        if (now - ts > CODING_AGENT_TIMEOUT_MS) {
          codingAgentSessions.delete(key);
          changed = true;
        }
      }
      if (changed) notifyCodingAgentListener();
    }, 15 * 1000);
  }
}

/** Stop the control HTTP server. manualBreak state is preserved across restarts. */
function stopControlServer() {
  if (codingAgentWatchdog) {
    clearInterval(codingAgentWatchdog);
    codingAgentWatchdog = null;
  }
  codingAgentSessions.clear();
  if (!server) return;
  server.close();
  server = null;
}

module.exports = {
  startControlServer,
  stopControlServer,
  getManualBreak,
  getLanIp,
  getCodingAgentWorking,
  getCodingAgentCount,
  getAgentCounts,
  setCodingAgentStatusListener,
  getClaudeWorking,
  getClaudeCount,
  getCodexWorking,
  getCodexCount,
  setClaudeStatusListener,
};
