'use strict';

const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

// gaze 상태를 BREAK 신호로 변환하는 순수 함수 — 단독 테스트 가능
// facePresent=false 또는 gazeOnScreen=false 이면 true(BREAK 권고)를 반환
function shouldForceBreak({ facePresent, gazeOnScreen }) {
  return !facePresent || !gazeOnScreen;
}

let gazeWin = null;
let onGazeUpdate = null; // (shouldBreak: boolean) => void
let pollInterval = null;

// 숨김 BrowserWindow에서 웹캠 접근 + gaze 판정 결과를 IPC로 수신
function startGaze({ cameraDeviceId, onUpdate }) {
  if (gazeWin && !gazeWin.isDestroyed()) return;

  onGazeUpdate = onUpdate;

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
    // 카메라 장치 ID 전달 (null이면 기본 장치 사용)
    gazeWin.webContents.send('gaze:init', { cameraDeviceId: cameraDeviceId || null });
  });

  gazeWin.on('closed', () => {
    gazeWin = null;
  });

  // 렌더러로부터 1초마다 gaze 상태 수신
  ipcMain.on('gaze:update', (_event, { facePresent, gazeOnScreen }) => {
    const forceBreak = shouldForceBreak({ facePresent, gazeOnScreen });
    if (typeof onGazeUpdate === 'function') {
      onGazeUpdate(forceBreak);
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
};
