'use strict';

const path = require('path');
const { BrowserWindow, screen } = require('electron');

let win = null;

// (내 집중상태 WORK/BREAK) × (Claude Code 작업중 여부) → 펫 지속 자세 매핑
// (순수 함수, 단독 테스트 노출)
//   WORK  + Claude 작업중 → coding    (코딩하는 모습)
//   WORK  + Claude 대기   → study     (기본 공부 모습)
//   BREAK + Claude 작업중 → deskSleep (컴퓨터 앞에서 자는 모습)
//   BREAK + Claude 대기   → sleep     (자는 모습)
function poseForState(state, claudeWorking) {
  if (state === 'WORK') {
    return claudeWorking ? 'coding' : 'study';
  }
  return claudeWorking ? 'deskSleep' : 'sleep';
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

function sendState(stage, count) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet:state', { state: stage, count: count || 0 });
  }
}

// 펫 창 표시 (없으면 생성). 초기 자세를 로드 완료 후 전송.
function showPet(initialFocusState, claudeWorking, claudeCount) {
  const w = createPetWindow();
  const pose = poseForState(initialFocusState || 'BREAK', !!claudeWorking);
  const cnt = claudeCount || 0;
  if (w.webContents.isLoading()) {
    w.webContents.once('did-finish-load', () => sendState(pose, cnt));
  } else {
    sendState(pose, cnt);
  }
  if (!w.isVisible()) w.show();
  return w;
}

// 현재 (집중상태 × Claude 작업여부 + 동시 세션 수)를 펫 자세로 반영
function setPetState(focusStateValue, claudeWorking, claudeCount) {
  sendState(poseForState(focusStateValue, !!claudeWorking), claudeCount || 0);
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
