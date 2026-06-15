'use strict';

const getWindows = require('get-windows');

let _intervalId = null;

// 활성 창을 intervalMs마다 폴링. get-windows 사용.
// onUpdate({ app: string, title: string, isChrome: boolean })
function startTracking(intervalMs, onUpdate) {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
  }

  async function poll() {
    try {
      const result = await getWindows.activeWindow();
      if (!result) return;

      const app = result.owner ? result.owner.name : '';
      const title = result.title || '';
      // isChrome 판정: app 프로세스명에 'chrome'이 포함되면 true (대소문자 무시)
      const isChrome = app.toLowerCase().includes('chrome');

      onUpdate({ app, title, isChrome });
    } catch (err) {
      // 창 정보 조회 실패 시 무시 (화면 잠금 등)
    }
  }

  // 즉시 1회 실행 후 interval 시작
  poll();
  _intervalId = setInterval(poll, intervalMs);
}

function stopTracking() {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

module.exports = { startTracking, stopTracking };
