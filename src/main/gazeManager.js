'use strict';

const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

const GAZE_BREAK_DELAY_MS = 5000;

// gaze 상태를 BREAK 신호로 변환하는 순수 함수 — 단독 테스트 가능
// 카메라/스트림이 실제 연결되지 않았으면(connected===false) 강제하지 않고 false 반환
//   → main이 화이트리스트(크롬 확장)만으로 판정하도록 폴백한다.
// 연결된 상태에서 facePresent=false 또는 gazeOnScreen=false 이면 true(BREAK 권고)를 반환.
// (connected 미지정=undefined는 하위호환을 위해 기존처럼 얼굴 기준으로 판정)
function shouldForceBreak({ facePresent, gazeOnScreen, connected }) {
  if (connected === false) return false;
  return !facePresent || !gazeOnScreen;
}

// 얼굴 미감지/시선 이탈이 연속으로 유지될 때만 BREAK를 허용한다.
// 정상 응시 또는 카메라 연결 끊김(화이트리스트 폴백)이 오면 누적을 즉시 초기화한다.
function createGazeBreakGate({ delayMs = GAZE_BREAK_DELAY_MS, now = () => Date.now() } = {}) {
  let awaySince = null;

  return {
    update(gazeState) {
      if (!shouldForceBreak(gazeState)) {
        awaySince = null;
        return false;
      }

      const currentTime = now();
      if (awaySince === null) {
        awaySince = currentTime;
        return false;
      }

      return currentTime - awaySince >= delayMs;
    },

    reset() {
      awaySince = null;
    },
  };
}

// 스트림 URL 유효성 검사 — 순수 함수, 단독 테스트 가능
// http/https 로 시작하고 공백이 아닌 문자열이면 true
function isValidStreamUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return /^https?:\/\/.+/i.test(trimmed);
}

// settings에서 카메라 소스 모드와 스트림 URL을 결정 — 순수 함수, 단독 테스트 가능
// 반환: { mode: 'webcam'|'stream', streamUrl: string, deviceId: string|null }
// cameraSource='stream' 이고 유효한 cameraStreamUrl 이 있을 때만 stream 모드,
// 그 외(미설정/무효 URL)는 webcam 모드로 폴백.
function pickCameraSource(settings) {
  const s = settings || {};
  if (s.cameraSource === 'stream' && isValidStreamUrl(s.cameraStreamUrl)) {
    return { mode: 'stream', streamUrl: String(s.cameraStreamUrl).trim(), deviceId: null };
  }
  return { mode: 'webcam', streamUrl: '', deviceId: s.cameraDeviceId || null };
}

let gazeWin = null;
let onGazeUpdate = null; // (shouldBreak: boolean) => void
let pollInterval = null;
let allowDestroy = false; // 사용자가 X로 닫으면 파괴 대신 숨김(인식 지속), 진짜 종료 때만 true
const gazeBreakGate = createGazeBreakGate();

// BrowserWindow에서 웹캠/스트림 접근 + gaze 판정 결과를 IPC로 수신.
// 창은 미리보기로 보이지만, 닫아도(숨겨도) 인식은 계속된다.
function startGaze({ cameraDeviceId, cameraSource, cameraStreamUrl, onUpdate }) {
  // 이미 창이 있으면(숨겨져 있을 수도) 다시 보여주기만
  if (gazeWin && !gazeWin.isDestroyed()) {
    onGazeUpdate = onUpdate || onGazeUpdate;
    gazeWin.show();
    return;
  }

  onGazeUpdate = onUpdate;
  gazeBreakGate.reset();

  // 소스 모드/URL 결정 (stream 무효 시 webcam 폴백)
  const source = pickCameraSource({ cameraSource, cameraStreamUrl, cameraDeviceId });

  gazeWin = new BrowserWindow({
    width: 340,
    height: 300,
    show: true,            // 카메라 미리보기 창 (얼굴 인식 상태 확인용)
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    title: '카메라 미리보기',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // 숨겨도 인식 루프가 풀속도로 계속 돌도록
      preload: path.join(__dirname, '../preload/gaze.js'),
    },
  });
  try { gazeWin.setMenuBarVisibility(false); } catch (e) { /* noop */ }

  gazeWin.loadFile(path.join(__dirname, '../renderer/gaze.html'));

  gazeWin.webContents.once('did-finish-load', () => {
    // 소스 모드/장치ID/스트림URL 전달 (webcam이면 deviceId, stream이면 streamUrl)
    gazeWin.webContents.send('gaze:init', {
      cameraDeviceId: source.deviceId,
      cameraSource: source.mode,
      cameraStreamUrl: source.streamUrl,
    });
  });

  // 사용자가 X로 닫으면 파괴하지 않고 숨김 → 인식 계속. 진짜 종료(stopGaze) 때만 파괴.
  gazeWin.on('close', (e) => {
    if (!allowDestroy && gazeWin && !gazeWin.isDestroyed()) {
      e.preventDefault();
      gazeWin.hide();
    }
  });

  gazeWin.on('closed', () => {
    gazeWin = null;
  });

  // 렌더러로부터 1초마다 gaze 상태 수신
  ipcMain.on('gaze:update', (_event, { facePresent, gazeOnScreen, connected }) => {
    const forceBreak = gazeBreakGate.update({ facePresent, gazeOnScreen, connected });
    if (typeof onGazeUpdate === 'function') {
      // 두 번째 인자로 카메라 실제 연결 여부도 전달 (대시보드 웹캠 상태 표시용)
      onGazeUpdate(forceBreak, connected === true);
    }
  });
}

function stopGaze() {
  ipcMain.removeAllListeners('gaze:update');
  if (gazeWin && !gazeWin.isDestroyed()) {
    allowDestroy = true;   // 진짜 파괴 허용
    gazeWin.destroy();
    gazeWin = null;
    allowDestroy = false;
  }
  onGazeUpdate = null;
  gazeBreakGate.reset();
}

// 숨겨둔 미리보기 창을 다시 표시 (인식은 계속 돌던 중). 창이 있으면 true.
function showGazeWindow() {
  if (gazeWin && !gazeWin.isDestroyed()) {
    gazeWin.show();
    gazeWin.focus();
    return true;
  }
  return false;
}

// 현재 gaze(카메라) 창이 살아있는지 (숨김 포함)
function hasGazeWindow() {
  return !!(gazeWin && !gazeWin.isDestroyed());
}

module.exports = {
  startGaze,
  stopGaze,
  showGazeWindow,
  hasGazeWindow,
  // 순수 로직 — 테스트 노출
  _shouldForceBreak: shouldForceBreak,
  _createGazeBreakGate: createGazeBreakGate,
  _GAZE_BREAK_DELAY_MS: GAZE_BREAK_DELAY_MS,
  _isValidStreamUrl: isValidStreamUrl,
  _pickCameraSource: pickCameraSource,
};
