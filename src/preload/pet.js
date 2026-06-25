'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 펫 창에 petAPI 노출
contextBridge.exposeInMainWorld('petAPI', {
  // main → renderer: { state: 'study' | 'sleep' | 'alert' }
  onState(cb) {
    ipcRenderer.on('pet:state', (_event, data) => cb(data));
  },
});
