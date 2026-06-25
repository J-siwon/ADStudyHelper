'use strict';

const http = require('http');
const os = require('os');

// Local HTTP control server (port 47616).
// Lets a phone on the same LAN toggle manualBreak to suppress away notifications.
// Routes: GET / → status page, GET /break → set manualBreak on, GET /resume → off.
// Exports: startControlServer(port), stopControlServer(), getManualBreak(), getLanIp()

let manualBreak = false;
let server = null;

// Claude Code 작업 상태 (hook이 /claude/working·/claude/done 으로 갱신).
let claudeWorking = false;
let lastClaudePing = 0;
let claudeStatusListener = null;
let claudeWatchdog = null;
// 신호가 끊겨도(예: Claude 크래시) 일정 시간 뒤 안전하게 idle 처리.
const CLAUDE_TIMEOUT_MS = 180 * 1000;

/** Returns the current manualBreak flag. awayManager polls this to suppress notifications. */
function getManualBreak() {
  return manualBreak;
}

/** Returns whether Claude Code is currently working (hook으로 갱신됨). */
function getClaudeWorking() {
  return claudeWorking;
}

/** index.js가 펫 자세 갱신을 위해 상태 변경 콜백을 등록. */
function setClaudeStatusListener(cb) {
  claudeStatusListener = cb;
}

function setClaudeWorking(working) {
  const changed = claudeWorking !== working;
  claudeWorking = working;
  if (working) lastClaudePing = Date.now();
  if (changed && typeof claudeStatusListener === 'function') {
    try { claudeStatusListener(claudeWorking); } catch (e) { /* noop */ }
  }
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

    // Claude Code hook 상태 갱신 (GET/POST 무관)
    if (url === '/claude/working' || url === '/claude/done') {
      setClaudeWorking(url === '/claude/working');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, working: claudeWorking }));
      return;
    }
    if (url === '/claude/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ working: claudeWorking }));
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
  // 워치독: Claude hook 신호가 끊기면 일정 시간 뒤 idle 처리 (크래시 대비)
  if (!claudeWatchdog) {
    claudeWatchdog = setInterval(() => {
      if (claudeWorking && Date.now() - lastClaudePing > CLAUDE_TIMEOUT_MS) {
        setClaudeWorking(false);
      }
    }, 15 * 1000);
  }
}

/** Stop the control HTTP server. manualBreak state is preserved across restarts. */
function stopControlServer() {
  if (claudeWatchdog) {
    clearInterval(claudeWatchdog);
    claudeWatchdog = null;
  }
  if (!server) return;
  server.close();
  server = null;
}

module.exports = {
  startControlServer,
  stopControlServer,
  getManualBreak,
  getLanIp,
  getClaudeWorking,
  setClaudeStatusListener,
};
