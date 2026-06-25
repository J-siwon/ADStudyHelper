'use strict';

const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

// gaze 상태를 BREAK 신호로 변환하는 순수 함수 — 단독 테스트 가능
// 카메라/스트림이 실제 연결되지 않았으면(connected===false) 강제하지 않고 false 반환
//   → main이 화이트리스트(크롬 확장)만으로 판정하도록 폴백한다.
// 연결된 상태에서 facePresent=false 또는 gazeOnScreen=false 이면 true(BREAK 권고)를 반환.
// (connected 미지정=undefined는 하위호환을 위해 기존처럼 얼굴 기준으로 판정)
function shouldForceBreak({ facePresent, gazeOnScreen, connected }) {
  if (connected === false) return false;
  return !facePresent || !gazeOnScreen;
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

// 숨김 BrowserWindow에서 웹캠/스트림 접근 + gaze 판정 결과를 IPC로 수신
function startGaze({ cameraDeviceId, cameraSource, cameraStreamUrl, onUpdate }) {
  if (gazeWin && !gazeWin.isDestroyed()) return;

  onGazeUpdate = onUpdate;

  // 소스 모드/URL 결정 (stream 무효 시 webcam 폴백)
  const source = pickCameraSource({ cameraSource, cameraStreamUrl, cameraDeviceId });

  gazeWin = new BrowserWindow({
    width: 640,
    height: 480,
    show: false,           // 숨김 창
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/gaze.js'),
    },
  });

  gazeWin.loadFile(path.join(__dirname, '../renderer/gaze.html'));

  gazeWin.webContents.once('did-finish-load', () => {
    // 소스 모드/장치ID/스트림URL 전달 (webcam이면 deviceId, stream이면 streamUrl)
    gazeWin.webContents.send('gaze:init', {
      cameraDeviceId: source.deviceId,
      cameraSource: source.mode,
      cameraStreamUrl: source.streamUrl,
    });
  });

  gazeWin.on('closed', () => {
    gazeWin = null;
  });

  // 렌더러로부터 1초마다 gaze 상태 수신
  ipcMain.on('gaze:update', (_event, { facePresent, gazeOnScreen, connected }) => {
    const forceBreak = shouldForceBreak({ facePresent, gazeOnScreen, connected });
    if (typeof onGazeUpdate === 'function') {
      // 두 번째 인자로 카메라 실제 연결 여부도 전달 (대시보드 웹캠 상태 표시용)
      onGazeUpdate(forceBreak, connected === true);
    }
  });
}

function stopGaze() {
  ipcMain.removeAllListeners('gaze:update');
  if (gazeWin && !gazeWin.isDestroyed()) {
    gazeWin.close();
    gazeWin = null;
  }
  onGazeUpdate = null;
}

module.exports = {
  startGaze,
  stopGaze,
  // 순수 로직 — 테스트 노출
  _shouldForceBreak: shouldForceBreak,
  _isValidStreamUrl: isValidStreamUrl,
  _pickCameraSource: pickCameraSource,
};
