'use strict';

// get-windows v9+ 는 ESM 전용 패키지라 Electron 번들 Node(CommonJS)에서 require()하면
// ERR_REQUIRE_ESM 으로 앱이 부팅 중 크래시한다. 동적 import()로 지연 로드해 회피한다.
// (시스템 Node 22+ 는 require(ESM)을 허용하지만 Electron 28의 Node 18은 불가)
let _getWindowsPromise = null;
function loadGetWindows() {
  if (!_getWindowsPromise) {
    _getWindowsPromise = import('get-windows');
  }
  return _getWindowsPromise;
}

let _intervalId = null;

// 활성 창을 intervalMs마다 폴링. get-windows 사용.
// onUpdate({ app: string, title: string, isChrome: boolean })
function startTracking(intervalMs, onUpdate) {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
  }

  async function poll() {
    try {
      const { activeWindow } = await loadGetWindows();
      const result = await activeWindow();
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
