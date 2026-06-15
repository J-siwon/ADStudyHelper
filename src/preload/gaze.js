'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gazeAPI', {
  // main → renderer: 초기화 (cameraDeviceId 전달)
  onInit(cb) {
    ipcRenderer.on('gaze:init', (_event, config) => cb(config));
  },
  // renderer → main: gaze 상태 보고 (1초마다)
  sendUpdate(state) {
    ipcRenderer.send('gaze:update', state);
  },
});
