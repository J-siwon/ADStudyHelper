'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 렌더러에 focusAPI 노출
contextBridge.exposeInMainWorld('focusAPI', {
  // main -> renderer: { state, workSeconds } (1초마다 tick 이벤트)
  onTick(cb) {
    ipcRenderer.on('tick', (_event, data) => cb(data));
  },

  // main -> renderer: boolean (확장 연결 상태)
  onConnection(cb) {
    ipcRenderer.on('connection', (_event, connected) => cb(connected));
  },

  // renderer -> main: 화이트리스트 조회
  getWhitelist() {
    return ipcRenderer.invoke('wl:get');
  },

  // renderer -> main: 화이트리스트 저장
  setWhitelist(wl) {
    return ipcRenderer.invoke('wl:set', wl);
  },
});
