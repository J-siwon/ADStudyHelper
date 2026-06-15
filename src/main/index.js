'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '../../src/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  // 임시 트레이 아이콘 (통합 단계에서 실제 아이콘으로 교체)
  try {
    const { nativeImage } = require('electron');
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

// 화이트리스트 IPC 핸들러 (통합 단계에서 store 연결)
ipcMain.handle('wl:get', async () => {
  return { apps: [], urlPatterns: [] };
});

ipcMain.handle('wl:set', async (_event, wl) => {
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
