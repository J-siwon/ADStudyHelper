'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor } = require('electron');
const path = require('path');

const tracker          = require('./tracker');
const chromeBridge     = require('./chromeBridge');
const { evaluate }     = require('./whitelist');
const FocusState       = require('./focusState');
const store            = require('./store');
const characterWindow  = require('./characterWindow');
const gazeManager      = require('./gazeManager');
const { createAwayManager } = require('./awayManager');
const notifier         = require('./notifier');
const { startControlServer, stopControlServer, getManualBreak, getLanIp } = require('./controlServer');

let mainWindow = null;
let tray = null;
let focusState = null;
let awayManager = null;

// 폴링 간 최신 창/URL 상태를 보관
let lastWindowInfo     = { app: '', title: '', isChrome: false };
let lastUrlInfo        = { url: '', tabActive: true };
let extensionConnected = false;

// 카메라가 BREAK를 강제하는지 여부 (gazeManager onUpdate 콜백으로 갱신)
let gazeForceBreak = false;

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

  // BREAK 임계값 초과 → 캐릭터 팝업
  focusState.on('breakAlert', () => {
    characterWindow.showCharacterAlert('다시 집중! 🐱');
  });

  // 1초마다 tick → WORK면 누적, 렌더러로 전송
  focusState.on('tick', ({ state, workSeconds }) => {
    if (state === 'WORK') {
      store.addWorkSeconds(1);
    }
    sendToRenderer('tick', { state, workSeconds });
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
    onUpdate: (forceBreak) => {
      gazeForceBreak = forceBreak;
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
  }

  return { ok: true };
});

// 폰 제어 서버 LAN IP 조회
ipcMain.handle('control:getLanIp', async () => {
  return getLanIp();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startFocusState();
  startTracking();
  startGazeTracking();  // cameraEnabled=false면 no-op
  startAwayManager();
  startControlServer(47616);

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
    stopControlServer();
    app.quit();
  }
});
