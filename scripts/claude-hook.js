'use strict';

// Claude Code hook → ADStudyHelper 로컬 제어 서버에 작업 상태 알림.
// 사용: node claude-hook.js working|done

require('./coding-agent-hook').runHook('claude', process.argv[2]);
