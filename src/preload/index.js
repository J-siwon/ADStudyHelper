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

contextBridge.exposeInMainWorld('learningAPI', {
  getSnapshot() {
    return ipcRenderer.invoke('learning:getSnapshot');
  },
  startChapter(chapterId) {
    return ipcRenderer.invoke('learning:startChapter', chapterId);
  },
  cancelChapter(chapterId) {
    return ipcRenderer.invoke('learning:cancelChapter', chapterId);
  },
  copyPrompt(chapterId, stageId) {
    return ipcRenderer.invoke('learning:copyPrompt', chapterId, stageId);
  },
  openChat() {
    return ipcRenderer.invoke('learning:openChat');
  },
  previewStageResult(chapterId, stageId, rawResponse) {
    return ipcRenderer.invoke('learning:previewStageResult', chapterId, stageId, rawResponse);
  },
  completeStage(chapterId, stageId, objectiveIds, evidenceById) {
    return ipcRenderer.invoke('learning:completeStage', chapterId, stageId, objectiveIds, evidenceById);
  },
  startObjectiveSession(chapterId, objectiveId) {
    return ipcRenderer.invoke('learning:startObjectiveSession', chapterId, objectiveId);
  },
  previewObjectiveResult(chapterId, objectiveId, rawResponse) {
    return ipcRenderer.invoke('learning:previewObjectiveResult', chapterId, objectiveId, rawResponse);
  },
  completeObjectiveSession(chapterId, objectiveId, evidence) {
    return ipcRenderer.invoke('learning:completeObjectiveSession', chapterId, objectiveId, evidence);
  },
  startReview(review) {
    return ipcRenderer.invoke('learning:startReview', review);
  },
  previewReviewResult(chapterId, objectiveId, rawResponse) {
    return ipcRenderer.invoke('learning:previewReviewResult', chapterId, objectiveId, rawResponse);
  },
  completeReview(chapterId, objectiveId, grade, kind) {
    return ipcRenderer.invoke('learning:completeReview', chapterId, objectiveId, grade, kind);
  },
  preparePriorAssessment(chapterId, sourceText) {
    return ipcRenderer.invoke('learning:preparePriorAssessment', chapterId, sourceText);
  },
  previewPriorAssessment(chapterId, sourceText, rawResponse) {
    return ipcRenderer.invoke('learning:previewPriorAssessment', chapterId, sourceText, rawResponse);
  },
  applyPriorAssessment(chapterId, assessment, selection) {
    return ipcRenderer.invoke('learning:applyPriorAssessment', chapterId, assessment, selection);
  },
  prepareCurriculumAssessment(sourceText) {
    return ipcRenderer.invoke('learning:prepareCurriculumAssessment', sourceText);
  },
  previewCurriculumAssessment(sourceText, rawResponse) {
    return ipcRenderer.invoke('learning:previewCurriculumAssessment', sourceText, rawResponse);
  },
  applyCurriculumCoverage(assessment, selectedChapterIds) {
    return ipcRenderer.invoke('learning:applyCurriculumCoverage', assessment, selectedChapterIds);
  },
  prepareCurriculumDetailAssessment(sourceText, chapterIds) {
    return ipcRenderer.invoke('learning:prepareCurriculumDetailAssessment', sourceText, chapterIds);
  },
  previewCurriculumDetailAssessment(sourceText, chapterIds, rawResponse) {
    return ipcRenderer.invoke('learning:previewCurriculumDetailAssessment', sourceText, chapterIds, rawResponse);
  },
  applyCurriculumDetailAssessment(assessmentBatch, selections) {
    return ipcRenderer.invoke('learning:applyCurriculumDetailAssessment', assessmentBatch, selections);
  },
  setChatProvider(provider) {
    return ipcRenderer.invoke('learning:setProvider', provider);
  },
});

// Study calendar and account backup; no tokens or credentials are exposed.
contextBridge.exposeInMainWorld('studyAPI', {
  getMonth: (month) => ipcRenderer.invoke('study:getMonth', month),
  getBackupStatus: () => ipcRenderer.invoke('study:backupStatus'),
  configureGoogle: () => ipcRenderer.invoke('study:configureGoogle'),
  connectGoogle: () => ipcRenderer.invoke('study:connectGoogle'),
  disconnectGoogle: () => ipcRenderer.invoke('study:disconnectGoogle'),
  backup: (token) => ipcRenderer.invoke('study:backup', token),
  previewRestore: () => ipcRenderer.invoke('study:previewRestore'),
  confirmRestore: (token) => ipcRenderer.invoke('study:confirmRestore', token),
  cancelRestore: () => ipcRenderer.invoke('study:cancelRestore'),
});
