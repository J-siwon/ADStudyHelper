'use strict';

// Claude Code hook → ADStudyHelper 로컬 제어 서버에 작업 상태 알림.
// 사용: node claude-hook.js working|done
// stdin 으로 들어오는 hook JSON 의 session_id 를 함께 보내 동시 세션 수를 구분한다
// (펫이 세션 수만큼 컴퓨터를 그림). 앱이 꺼져 있어도 항상 조용히 exit 0.

const http = require('http');

const action = process.argv[2] === 'done' ? 'done' : 'working';
let input = '';
let sent = false;

function send(sessionId) {
  if (sent) return;
  sent = true;
  const q = sessionId ? '?id=' + encodeURIComponent(sessionId) : '';
  const req = http.request(
    { host: '127.0.0.1', port: 47616, path: '/claude/' + action + q, method: 'POST', timeout: 1500 },
    (res) => { res.resume(); res.on('end', () => process.exit(0)); }
  );
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.end();
}

// hook payload(JSON)에서 session_id 추출 후 전송.
try {
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    let sid = '';
    try { sid = (JSON.parse(input) || {}).session_id || ''; } catch (e) { /* noop */ }
    send(sid);
  });
  process.stdin.on('error', () => send(''));
} catch (e) {
  send('');
}

// stdin 이 없거나 끝나지 않아도 보장: 잠시 뒤 그냥 보낸다.
setTimeout(() => send(''), 400);
// 최후 안전망: 어떤 이유로든 안 끝나도 종료
setTimeout(() => process.exit(0), 2000);
