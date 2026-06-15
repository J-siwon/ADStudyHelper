'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('characterAPI', {
  // main → renderer: 메시지 수신
  onMessage(cb) {
    ipcRenderer.on('character:message', (_event, msg) => cb(msg));
  },
  // renderer → main: 닫기 요청
  close() {
    ipcRenderer.send('character:close');
  },
});
