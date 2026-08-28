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

  // main -> renderer: { app, isChrome, url, extensionConnected, state } (현재 활성 컨텍스트)
  onStatus(cb) {
    ipcRenderer.on('status', (_event, data) => cb(data));
  },

  // renderer -> main: 화이트리스트 조회
  getWhitelist() {
    return ipcRenderer.invoke('wl:get');
  },

  // renderer -> main: 화이트리스트 저장
  setWhitelist(wl) {
    return ipcRenderer.invoke('wl:set', wl);
  },

  // renderer -> main: 설정 조회 (Phase 2)
  getSettings() {
    return ipcRenderer.invoke('settings:get');
  },

  // renderer -> main: 설정 저장 (Phase 2, partial update)
  setSettings(partial) {
    return ipcRenderer.invoke('settings:set', partial);
  },

  // renderer -> main: 폰 제어 서버 LAN IP 조회
  getLanIp() {
    return ipcRenderer.invoke('control:getLanIp');
  },

  // renderer -> main: 폰 제어 서버 접속 URL(http://<LAN-IP>:47616) 조회
  getControlUrl() {
    return ipcRenderer.invoke('control:url');
  },

  // renderer -> main: iPhone 동반 앱 서버 주소/페어링 토큰/현재 상태 조회
  getPhoneSetup() {
    return ipcRenderer.invoke('phone:setup');
  },

  // renderer -> main: 도움말 창 열기
  openHelp() {
    return ipcRenderer.invoke('help:open');
  },

  // renderer -> main: 카메라 미리보기 창 다시 띄우기
  showCameraPreview() {
    return ipcRenderer.invoke('camera:showPreview');
  },
});
