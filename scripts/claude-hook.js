'use strict';

// Claude Code hook → ADStudyHelper 로컬 제어 서버에 작업 상태 알림.
// 사용: node claude-hook.js working|done
// 앱이 꺼져 있어도(연결 실패) 항상 조용히 exit 0 → hook이 툴 실행을 막지 않는다.

const http = require('http');

const action = process.argv[2] === 'done' ? 'done' : 'working';

const req = http.request(
  { host: '127.0.0.1', port: 47616, path: '/claude/' + action, method: 'POST', timeout: 1500 },
  (res) => { res.resume(); res.on('end', () => process.exit(0)); }
);
req.on('error', () => process.exit(0));
req.on('timeout', () => { req.destroy(); process.exit(0); });
req.end();

// 안전망: 어떤 이유로든 위 콜백이 안 끝나도 종료
setTimeout(() => process.exit(0), 2000);
