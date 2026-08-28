'use strict';

// Codex hook → ADStudyHelper 로컬 제어 서버에 작업 상태 알림.
// 사용: node codex-hook.js working|done

require('./coding-agent-hook').runHook('codex', process.argv[2]);
