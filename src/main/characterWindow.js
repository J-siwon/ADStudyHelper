'use strict';

const path = require('path');
const { BrowserWindow, ipcMain } = require('electron');

let win = null;

// frameless/transparent/always-on-top 팝업 생성
function createWindow() {
  win = new BrowserWindow({
    width: 320,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/character.js'),
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/character.html'));

  win.on('closed', () => {
    win = null;
  });

  // 렌더러에서 닫기 버튼 클릭 시
  ipcMain.once('character:close', () => {
    hideCharacter();
  });
}

// 팝업 표시 (이미 떠 있으면 메시지만 갱신)
function showCharacterAlert(message) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('character:message', message);
    if (!win.isVisible()) win.show();
  } else {
    createWindow();
    // 창 로드 완료 후 메시지 전송
    win.webContents.once('did-finish-load', () => {
      win.webContents.send('character:message', message);
    });
  }
}

// 팝업 숨기기/닫기
function hideCharacter() {
  if (win && !win.isDestroyed()) {
    win.close();
    win = null;
  }
}

module.exports = { showCharacterAlert, hideCharacter };
