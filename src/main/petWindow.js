'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');

let win = null;

// WORK/BREAK → 펫 지속 자세 매핑 (순수 함수, 단독 테스트 노출)
function poseForState(state) {
  return state === 'WORK' ? 'study' : 'sleep';
}

const PET_WIDTH = 200;
const PET_HEIGHT = 220;

function createPetWindow() {
  if (win && !win.isDestroyed()) return win;

  // 기본 위치: 주 디스플레이 작업영역 우하단
  let x;
  let y;
  try {
    const { workArea } = screen.getPrimaryDisplay();
    x = workArea.x + workArea.width - PET_WIDTH - 24;
    y = workArea.y + workArea.height - PET_HEIGHT - 24;
  } catch (e) {
    x = undefined;
    y = undefined;
  }

  win = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/pet.js'),
    },
  });

  // 전체화면 앱 위에도 뜨도록
  try { win.setAlwaysOnTop(true, 'screen-saver'); } catch (e) { /* noop */ }

  win.loadFile(path.join(__dirname, '../renderer/pet.html'));

  win.on('closed', () => {
    win = null;
  });

  return win;
}

function sendState(stage) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet:state', { state: stage });
  }
}

// 펫 창 표시 (없으면 생성). 초기 WORK/BREAK 상태 자세를 로드 완료 후 전송.
function showPet(initialFocusState) {
  const w = createPetWindow();
  const pose = poseForState(initialFocusState || 'BREAK');
  if (w.webContents.isLoading()) {
    w.webContents.once('did-finish-load', () => sendState(pose));
  } else {
    sendState(pose);
  }
  if (!w.isVisible()) w.show();
  return w;
}

// 현재 WORK/BREAK 상태를 펫 자세로 반영
function setPetState(focusStateValue) {
  sendState(poseForState(focusStateValue));
}

// 쉬는시간 제한 도달 → 방방 뛰기 + 말풍선
function petAlert() {
  sendState('alert');
}

function hidePet() {
  if (win && !win.isDestroyed()) {
    win.close();
    win = null;
  }
}

module.exports = {
  showPet,
  hidePet,
  setPetState,
  petAlert,
  // 순수 로직 — 테스트 노출
  _poseForState: poseForState,
};
