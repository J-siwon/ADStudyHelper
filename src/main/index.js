'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor } = require('electron');
const path = require('path');

const tracker          = require('./tracker');
const chromeBridge     = require('./chromeBridge');
const { evaluate }     = require('./whitelist');
const FocusState       = require('./focusState');
const store            = require('./store');
const petWindow        = require('./petWindow');
const gazeManager      = require('./gazeManager');
const { createAwayManager } = require('./awayManager');
const notifier         = require('./notifier');
const { startControlServer, stopControlServer, getManualBreak, getLanIp } = require('./controlServer');

let mainWindow = null;
let helpWindow = null;
let tray = null;
let focusState = null;
let awayManager = null;

// 폴링 간 최신 창/URL 상태를 보관
let lastWindowInfo     = { app: '', title: '', isChrome: false };
let lastUrlInfo        = { url: '', tabActive: true };
let extensionConnected = false;

// 카메라가 BREAK를 강제하는지 여부 (gazeManager onUpdate 콜백으로 갱신)
let gazeForceBreak = false;
// 카메라/스트림이 실제 연결되어 신호를 주는 중인지 (대시보드 웹캠 상태 표시용)
let gazeConnected = false;

// 단일 인스턴스 락
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// whitelist 판정 + 카메라 BREAK 신호를 AND로 합산해 focusState에 적용
function evaluateAndUpdate() {
  const config = store.getWhitelist();
  const settings = store.getSettings();

  let state = evaluate(
    {
      app: lastWindowInfo.app,
      isChrome: lastWindowInfo.isChrome,
      url: lastUrlInfo.url,
      extensionConnected,
    },
    config
  );

  // 카메라 추적이 켜져 있고 gaze가 BREAK를 강제하면 AND → BREAK
  if (settings.cameraEnabled && gazeForceBreak) {
    state = 'BREAK';
  }

  focusState.setState(state);

  // 현재 무엇을 보고 어떻게 판정했는지 대시보드에 표시 (사용자가 화이트리스트에 추가할 이름 확인용)
  sendToRenderer('status', {
    app: lastWindowInfo.app,
    isChrome: lastWindowInfo.isChrome,
    url: lastUrlInfo.url,
    extensionConnected,
    state,
    // 웹캠 상태: 카메라 추적 on/off + 실제 연결 여부
    cameraEnabled: !!settings.cameraEnabled,
    cameraConnected: gazeConnected,
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 대시보드를 닫으면 항상 위 펫 창도 닫아 window-all-closed가 발생하도록(앱 종료)
    petWindow.hidePet();
  });
}

function createHelpWindow() {
  // 이미 열려 있으면 포커스만
  if (helpWindow && !helpWindow.isDestroyed()) {
    if (helpWindow.isMinimized()) helpWindow.restore();
    helpWindow.focus();
    return;
  }

  helpWindow = new BrowserWindow({
    width: 720,
    height: 760,
    title: 'ADStudyHelper — 사용 방법',
    parent: mainWindow || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 메뉴바 숨김 (도움말 창은 콘텐츠만)
  helpWindow.setMenuBarVisibility(false);
  helpWindow.loadFile(path.join(__dirname, '../renderer/help.html'));

  helpWindow.on('closed', () => {
    helpWindow = null;
  });
}

function createTray() {
  try {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'ADStudyHelper', enabled: false },
      { type: 'separator' },
      { label: '종료', click: () => app.quit() },
    ]);
    tray.setToolTip('ADStudyHelper');
    tray.setContextMenu(contextMenu);
  } catch (e) {
    // 트레이 생성 실패 시 무시 (헤드리스 환경)
  }
}

function startFocusState() {
  focusState = new FocusState({});  // FOCUS_BREAK_SEC 환경변수 또는 기본 600초

  // WORK/BREAK 전환 → 펫 자세 반영 (공부/자기)
  focusState.on('stateChange', (state) => {
    petWindow.setPetState(state);
  });

  // 쉬는시간 제한(BREAK 임계값) 도달 → 펫이 방방 뛰며 말풍선
  focusState.on('breakAlert', () => {
    petWindow.petAlert();
  });

  // 1초마다 tick → WORK면 누적, 렌더러로 전송
  focusState.on('tick', ({ state, breakSeconds }) => {
    if (state === 'WORK') {
      store.addWorkSeconds(1);
    }
    // 표시용 집중 시간은 store의 "오늘" 누적값을 쓴다.
    // 날짜가 바뀌면 store 키(YYYY-MM-DD)가 바뀌어 자동으로 0부터 시작하고(하루 단위 초기화),
    // 앱을 재시작해도 그날 누적은 유지된다. breakSeconds는 현재 연속 휴식 시간(WORK 복귀 시 0).
    sendToRenderer('tick', {
      state,
      workSeconds: store.getTodayWorkSeconds(),
      breakSeconds,
    });
  });

  focusState.start();
}

function startTracking() {
  // 활성 창 폴링 (2초)
  tracker.startTracking(2000, (windowInfo) => {
    lastWindowInfo = windowInfo;
    evaluateAndUpdate();
  });

  // 크롬 확장 WebSocket 브리지 (포트 47615)
  chromeBridge.startBridge(
    47615,
    (urlInfo) => {
      lastUrlInfo = urlInfo;
      evaluateAndUpdate();
    },
    (connected) => {
      extensionConnected = connected;
      if (!connected) {
        lastUrlInfo = { url: '', tabActive: true };
      }
      sendToRenderer('connection', connected);
      evaluateAndUpdate();
    }
  );
}

function startGazeTracking() {
  const settings = store.getSettings();
  if (!settings.cameraEnabled) return;

  gazeManager.startGaze({
    cameraDeviceId: settings.cameraDeviceId || null,
    cameraSource: settings.cameraSource || 'webcam',
    cameraStreamUrl: settings.cameraStreamUrl || '',
    onUpdate: (forceBreak, connected) => {
      gazeForceBreak = forceBreak;
      gazeConnected = connected === true;
      evaluateAndUpdate();
    },
  });
}

function startAwayManager() {
  awayManager = createAwayManager({
    getSettings: () => store.getSettings(),
    getIdleTimeSec: () => {
      try { return powerMonitor.getSystemIdleTime(); }
      catch (e) { return 0; }
    },
    getFacePresent: () => !gazeForceBreak,  // gazeForceBreak=true → facePresent=false
    isManualBreak: () => getManualBreak(),
    sendPhone: (message, settings) => notifier.sendPhone(message, settings),
    pollIntervalMs: 5000,
  });
  awayManager.start();
}

// 화이트리스트 IPC 핸들러
ipcMain.handle('wl:get', async () => {
  return store.getWhitelist();
});

ipcMain.handle('wl:set', async (_event, wl) => {
  store.setWhitelist(wl);
  return { ok: true };
});

// 설정 IPC 핸들러
ipcMain.handle('settings:get', async () => {
  return store.getSettings();
});

ipcMain.handle('settings:set', async (_event, partial) => {
  store.setSettings(partial);

  // cameraEnabled 변경 시 gaze 추적 on/off
  const updated = store.getSettings();
  if (updated.cameraEnabled) {
    startGazeTracking();
  } else {
    gazeManager.stopGaze();
    gazeForceBreak = false;
    gazeConnected = false;
  }

  // petEnabled 변경 시 펫 창 표시/숨김
  if (updated.petEnabled) {
    petWindow.showPet(focusState ? focusState.getState() : 'BREAK');
  } else {
    petWindow.hidePet();
  }

  return { ok: true };
});

// 도움말 창 열기
ipcMain.handle('help:open', async () => {
  createHelpWindow();
  return { ok: true };
});

// 폰 제어 서버 LAN IP 조회
ipcMain.handle('control:getLanIp', async () => {
  return getLanIp();
});

// 폰 제어 서버 접속 URL 조회 (renderer loadControlUrl()가 사용)
ipcMain.handle('control:url', async () => {
  return `http://${getLanIp()}:47616`;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startFocusState();
  startTracking();
  startGazeTracking();  // cameraEnabled=false면 no-op
  startAwayManager();
  startControlServer(47616);

  // 펫 창 표시 (설정에서 끄지 않았으면 기본 on)
  if (store.getSettings().petEnabled) {
    petWindow.showPet(focusState ? focusState.getState() : 'BREAK');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (focusState) focusState.stop();
    if (awayManager) awayManager.stop();
    tracker.stopTracking();
    chromeBridge.stopBridge();
    gazeManager.stopGaze();
    petWindow.hidePet();
    stopControlServer();
    app.quit();
  }
});
