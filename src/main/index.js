'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor, protocol, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// MediaPipe(wasm/모델) 오프라인 로딩용 커스텀 프로토콜.
// file:// 페이지에서는 fetch가 막혀 MediaPipe가 wasm/모델을 못 불러오므로,
// vendor/mediapipe 디렉터리를 mp://app/... 로 서빙한다. (반드시 app ready 전에 등록)
protocol.registerSchemesAsPrivileged([
  { scheme: 'mp', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

const MP_VENDOR_DIR = path.join(__dirname, '../renderer/vendor/mediapipe');
const MP_CONTENT_TYPES = {
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.task': 'application/octet-stream',
  '.data': 'application/octet-stream',
};

function registerMpProtocol() {
  protocol.handle('mp', async (request) => {
    try {
      const u = new URL(request.url);                 // mp://app/<rel>
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const filePath = path.join(MP_VENDOR_DIR, rel);
      if (!filePath.startsWith(MP_VENDOR_DIR)) {
        return new Response('forbidden', { status: 403 });
      }
      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        headers: { 'content-type': MP_CONTENT_TYPES[ext] || 'application/octet-stream' },
      });
    } catch (e) {
      return new Response('not found: ' + e.message, { status: 404 });
    }
  });
}

const tracker          = require('./tracker');
const chromeBridge     = require('./chromeBridge');
const { evaluate }     = require('./whitelist');
const FocusState       = require('./focusState');
const store            = require('./store');
const petWindow        = require('./petWindow');
const gazeManager      = require('./gazeManager');
const { createAwayManager } = require('./awayManager');
const notifier         = require('./notifier');
const { createPhoneFocusManager, normalizePhoneConfig } = require('./phoneFocusManager');
const learning = require('./learning');
const learningAssessment = require('./learning-assessment');
const {
  startControlServer,
  stopControlServer,
  getManualBreak,
  getLanIp,
  getCodingAgentWorking,
  getCodingAgentCount,
  setCodingAgentStatusListener,
} = require('./controlServer');

let mainWindow = null;
let helpWindow = null;
let tray = null;
let focusState = null;
let awayManager = null;
let phoneFocusManager = null;

const LEARNING_CHAT_URLS = Object.freeze({
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
});

function loadLearningBalanceFile() {
  const balancePath = path.join(app.getPath('userData'), 'learning-rating.json');
  try {
    if (!fs.existsSync(balancePath)) return learning.getLearningBalance();
    const parsed = JSON.parse(fs.readFileSync(balancePath, 'utf8'));
    return learning.setLearningBalance(parsed);
  } catch (error) {
    console.warn(`[learning] 밸런스 설정을 적용하지 못해 기본값을 사용합니다: ${error.message}`);
    return learning.setLearningBalance(null);
  }
}

function getLearningChatProvider() {
  const provider = store.getSettings().learningChatProvider;
  return Object.prototype.hasOwnProperty.call(LEARNING_CHAT_URLS, provider) ? provider : 'chatgpt';
}

async function openLearningChat() {
  const provider = getLearningChatProvider();
  const url = LEARNING_CHAT_URLS[provider];
  await shell.openExternal(url);
  return { ok: true, provider, url };
}

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

function getPhoneStatus() {
  return phoneFocusManager
    ? phoneFocusManager.getStatus()
    : { enabled: false, isBreak: false, scheduledBreak: false, source: null };
}

function isAuthorizedRest() {
  const phoneStatus = getPhoneStatus();
  return getManualBreak() || phoneStatus.scheduledBreak;
}

// whitelist 판정 + 카메라/휴대폰 BREAK 신호를 합산해 focusState에 적용
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

  const phoneStatus = getPhoneStatus();
  if (getManualBreak() || phoneStatus.isBreak) {
    state = 'BREAK';
  }

  focusState.setBreakAlertSuppressed(isAuthorizedRest());
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
    phoneEnabled: phoneStatus.enabled,
    phoneBreak: phoneStatus.isBreak,
    phoneBreakSource: phoneStatus.source,
    phoneActiveSchedule: phoneStatus.activeSchedule || null,
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 대시보드를 닫으면 보조 창(펫·카메라 미리보기)도 닫아 window-all-closed가 발생하도록(앱 종료)
    petWindow.hidePet();
    gazeManager.stopGaze();
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

// 현재 집중상태 × 코딩 에이전트 작업여부(+Claude/Codex 동시 세션 수) → 펫 자세 갱신
function updatePetPose() {
  if (!focusState) return;
  petWindow.setPetState(focusState.getState(), getCodingAgentWorking(), getCodingAgentCount());
}

function startFocusState() {
  focusState = new FocusState({});  // FOCUS_BREAK_SEC 환경변수 또는 기본 600초

  // WORK/BREAK 전환 → 펫 자세 반영 (코딩 에이전트 작업여부와 조합)
  focusState.on('stateChange', () => {
    updatePetPose();
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
    isManualBreak: () => isAuthorizedRest(),
    sendPhone: (message, settings) => notifier.sendPhone(message, settings),
    pollIntervalMs: 5000,
  });
  awayManager.start();
}

function publicConfigToSettings(partial = {}) {
  const current = phoneFocusManager
    ? phoneFocusManager.getConfig()
    : normalizePhoneConfig(store.getSettings());
  const merged = { ...current, ...partial };
  const normalized = normalizePhoneConfig({
    phoneIntegrationEnabled: merged.enabled,
    phoneDetectionMode: merged.detectionMode,
    phoneBreakDurationSec: merged.breakDurationSec,
    phoneActualUseThresholdSec: merged.actualUseThresholdSec,
    phoneAlertMessage: merged.alertMessage,
    phoneRestSchedules: merged.restSchedules,
  });
  return {
    phoneIntegrationEnabled: normalized.enabled,
    phoneDetectionMode: normalized.detectionMode,
    phoneBreakDurationSec: normalized.breakDurationSec,
    phoneActualUseThresholdSec: normalized.actualUseThresholdSec,
    phoneAlertMessage: normalized.alertMessage,
    phoneRestSchedules: normalized.restSchedules,
  };
}

function updatePhoneConfig(partial) {
  store.setSettings(publicConfigToSettings(partial));
  if (phoneFocusManager) phoneFocusManager.refresh();
  if (focusState) evaluateAndUpdate();
  return phoneFocusManager
    ? phoneFocusManager.getConfig()
    : normalizePhoneConfig(store.getSettings());
}

function startPhoneFocusManager() {
  phoneFocusManager = createPhoneFocusManager({
    getSettings: () => store.getSettings(),
  });
  phoneFocusManager.onChange(() => {
    if (focusState) evaluateAndUpdate();
  });
  phoneFocusManager.start();
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
  if (phoneFocusManager) phoneFocusManager.refresh();
  if (updated.cameraEnabled) {
    startGazeTracking();
  } else {
    gazeManager.stopGaze();
    gazeForceBreak = false;
    gazeConnected = false;
  }

  if (focusState) evaluateAndUpdate();

  // petEnabled 변경 시 펫 창 표시/숨김
  if (updated.petEnabled) {
    petWindow.showPet(focusState ? focusState.getState() : 'BREAK', getCodingAgentWorking(), getCodingAgentCount());
  } else {
    petWindow.hidePet();
  }

  return { ok: true };
});

function getLearningSnapshot(state = store.getLearningState()) {
  const snapshot = learning.getSnapshot(state);
  store.setLearningState(snapshot.state);
  return {
    ...snapshot,
    chatProvider: getLearningChatProvider(),
    assessmentCapability: learningAssessment.getAssessmentCapability(),
  };
}

// 학습 런타임 IPC. 외부 채팅 URL은 main의 고정 allowlist만 사용한다.
ipcMain.handle('learning:getSnapshot', async () => getLearningSnapshot());

ipcMain.handle('learning:startChapter', async (_event, chapterId) => {
  const next = learning.startChapter(store.getLearningState(), chapterId);
  const chapter = learning.getSnapshot(next).chapterCatalog.find((item) => item.id === chapterId);
  const stage = chapter.stages.find((item) => !next.chapters[chapterId].checkedStageIds.includes(item.id));
  clipboard.writeText(learning.buildLearningPrompt(chapterId, stage.id));
  store.setLearningState(next);
  const opened = await openLearningChat();
  return {
    ...getLearningSnapshot(next),
    chatProvider: opened.provider,
    promptCopied: true,
  };
});

ipcMain.handle('learning:cancelChapter', async (_event, chapterId) => {
  const next = learning.cancelChapter(store.getLearningState(), chapterId);
  store.setLearningState(next);
  return getLearningSnapshot(next);
});

ipcMain.handle('learning:copyPrompt', async (_event, chapterId, stageId) => {
  clipboard.writeText(learning.buildLearningPrompt(chapterId, stageId));
  return { ok: true };
});

ipcMain.handle('learning:openChat', async () => openLearningChat());

ipcMain.handle('learning:previewStageResult', async (_event, chapterId, stageId, rawResponse) => (
  learningAssessment.parseStageResult(chapterId, stageId, rawResponse)
));

ipcMain.handle('learning:completeStage', async (_event, chapterId, stageId, objectiveIds, evidenceById) => {
  const before = getLearningSnapshot();
  const result = learning.completeStage(store.getLearningState(), chapterId, stageId, objectiveIds, evidenceById);
  store.setLearningState(result.state);
  const after = getLearningSnapshot(result.state);
  return {
    ...after,
    reward: {
      stageId,
      objectiveIds: result.newlyAchievedObjectiveIds,
      rp: after.rating.earnedRp - before.rating.earnedRp,
      previousTier: before.rating.tier,
      tier: after.rating.tier,
    },
  };
});

ipcMain.handle('learning:startObjectiveSession', async (_event, chapterId, objectiveId) => {
  clipboard.writeText(learning.buildObjectiveFocusPrompt(chapterId, objectiveId));
  const opened = await openLearningChat();
  return { ok: true, ...opened, promptCopied: true };
});

ipcMain.handle('learning:previewObjectiveResult', async (_event, chapterId, objectiveId, rawResponse) => (
  learningAssessment.parseObjectiveResult(chapterId, objectiveId, rawResponse)
));

ipcMain.handle('learning:completeObjectiveSession', async (_event, chapterId, objectiveId, evidence) => {
  const before = getLearningSnapshot();
  const result = learning.completeObjectiveSession(store.getLearningState(), chapterId, objectiveId, evidence);
  store.setLearningState(result.state);
  const after = getLearningSnapshot(result.state);
  return {
    ...after,
    reward: {
      objectiveIds: result.newlyAchievedObjectiveIds,
      rp: after.rating.earnedRp - before.rating.earnedRp,
      previousTier: before.rating.tier,
      tier: after.rating.tier,
    },
  };
});

ipcMain.handle('learning:startReview', async (_event, review) => {
  clipboard.writeText(learning.buildReviewPrompt(review.chapterId, review.objectiveId, review.phaseLabel, review.retry === true));
  const opened = await openLearningChat();
  return { ok: true, ...opened, promptCopied: true };
});

ipcMain.handle('learning:previewReviewResult', async (_event, chapterId, objectiveId, rawResponse) => (
  learningAssessment.parseReviewResult(chapterId, objectiveId, rawResponse)
));

ipcMain.handle('learning:completeReview', async (_event, chapterId, objectiveId, grade, kind) => {
  const next = learning.gradeObjectiveReview(store.getLearningState(), chapterId, objectiveId, grade, new Date(), kind);
  store.setLearningState(next);
  return getLearningSnapshot(next);
});

ipcMain.handle('learning:preparePriorAssessment', async (_event, chapterId, sourceText) => {
  const request = learningAssessment.createAssessmentRequest(chapterId, sourceText);
  clipboard.writeText(learningAssessment.MANUAL_HANDOFF_ADAPTER.createPrompt(request));
  const opened = await openLearningChat();
  return {
    ok: true,
    adapter: learningAssessment.getAssessmentCapability(),
    provider: opened.provider,
    promptCopied: true,
  };
});

ipcMain.handle('learning:previewPriorAssessment', async (_event, chapterId, sourceText, rawResponse) => {
  const request = learningAssessment.createAssessmentRequest(chapterId, sourceText);
  return learningAssessment.MANUAL_HANDOFF_ADAPTER.parseResponse(request, rawResponse);
});

ipcMain.handle('learning:applyPriorAssessment', async (_event, chapterId, assessment, selection) => {
  // Renderer에서 돌아온 값은 신뢰하지 않고 표준 판정 계약으로 다시 정규화한다.
  const request = learningAssessment.createAssessmentRequest(chapterId, 'validated renderer assessment');
  const normalizedAssessment = learningAssessment.normalizeAssessmentResult(
    request,
    assessment,
    learningAssessment.MANUAL_HANDOFF_ADAPTER.id
  );
  const next = learning.applyPriorLearningAssessment(
    store.getLearningState(),
    chapterId,
    normalizedAssessment,
    selection
  );
  store.setLearningState(next);
  return getLearningSnapshot(next);
});

ipcMain.handle('learning:prepareCurriculumAssessment', async (_event, sourceText) => {
  const request = learningAssessment.createCurriculumAssessmentRequest(sourceText);
  clipboard.writeText(learningAssessment.MANUAL_CURRICULUM_ADAPTER.createPrompt(request));
  const opened = await openLearningChat();
  return { ok: true, provider: opened.provider, promptCopied: true };
});

ipcMain.handle('learning:previewCurriculumAssessment', async (_event, sourceText, rawResponse) => {
  const request = learningAssessment.createCurriculumAssessmentRequest(sourceText);
  return learningAssessment.MANUAL_CURRICULUM_ADAPTER.parseResponse(request, rawResponse);
});

ipcMain.handle('learning:applyCurriculumCoverage', async (_event, assessment, selectedChapterIds) => {
  const request = learningAssessment.createCurriculumAssessmentRequest('validated renderer curriculum assessment');
  const normalizedAssessment = learningAssessment.normalizeCurriculumAssessmentResult(
    request,
    assessment,
    learningAssessment.MANUAL_CURRICULUM_ADAPTER.id
  );
  const next = learning.applyCurriculumCoverage(store.getLearningState(), normalizedAssessment, selectedChapterIds);
  store.setLearningState(next);
  return getLearningSnapshot(next);
});

ipcMain.handle('learning:prepareCurriculumDetailAssessment', async (_event, sourceText, chapterIds) => {
  const request = learningAssessment.createCurriculumDetailRequest(sourceText, chapterIds);
  clipboard.writeText(learningAssessment.MANUAL_CURRICULUM_DETAIL_ADAPTER.createPrompt(request));
  const opened = await openLearningChat();
  return { ok: true, provider: opened.provider, promptCopied: true, chapterCount: request.chapters.length };
});

ipcMain.handle('learning:previewCurriculumDetailAssessment', async (_event, sourceText, chapterIds, rawResponse) => {
  const request = learningAssessment.createCurriculumDetailRequest(sourceText, chapterIds);
  return learningAssessment.MANUAL_CURRICULUM_DETAIL_ADAPTER.parseResponse(request, rawResponse);
});

ipcMain.handle('learning:applyCurriculumDetailAssessment', async (_event, assessmentBatch, selections) => {
  const chapterIds = assessmentBatch && Array.isArray(assessmentBatch.chapterAssessments)
    ? assessmentBatch.chapterAssessments.map((item) => item && item.chapterId).filter(Boolean)
    : [];
  const request = learningAssessment.createCurriculumDetailRequest('validated renderer detail assessment', chapterIds);
  const normalizedBatch = learningAssessment.normalizeCurriculumDetailResult(
    request,
    assessmentBatch,
    learningAssessment.MANUAL_CURRICULUM_DETAIL_ADAPTER.id
  );
  const next = learning.applyCurriculumDetailAssessments(store.getLearningState(), normalizedBatch, selections);
  store.setLearningState(next);
  return getLearningSnapshot(next);
});

ipcMain.handle('learning:setProvider', async (_event, provider) => {
  if (!Object.prototype.hasOwnProperty.call(LEARNING_CHAT_URLS, provider)) {
    throw new Error('invalid_chat_provider');
  }
  store.setSettings({ learningChatProvider: provider });
  return { ok: true, provider };
});

// 도움말 창 열기
ipcMain.handle('help:open', async () => {
  createHelpWindow();
  return { ok: true };
});

// 카메라 미리보기 창 다시 띄우기 (숨겨져 있으면 표시, 없으면 생성). 인식은 그동안도 계속됨.
ipcMain.handle('camera:showPreview', async () => {
  const settings = store.getSettings();
  if (!settings.cameraEnabled) {
    return { ok: false, reason: 'disabled' };
  }
  startGazeTracking();   // startGaze가 숨김창은 show, 없으면 생성
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

// iPhone 동반 앱 연결 정보. 토큰은 로컬 UI에만 노출하고 로그에는 남기지 않는다.
ipcMain.handle('phone:setup', async () => ({
  serverUrl: `http://${getLanIp()}:47616`,
  pairingToken: store.getPhonePairingToken(),
  config: phoneFocusManager ? phoneFocusManager.getConfig() : normalizePhoneConfig(store.getSettings()),
  status: getPhoneStatus(),
}));

app.whenReady().then(() => {
  loadLearningBalanceFile();
  registerMpProtocol();   // MediaPipe 에셋 서빙
  createWindow();
  createTray();
  startFocusState();
  startPhoneFocusManager();
  startTracking();
  startGazeTracking();  // cameraEnabled=false면 no-op
  startAwayManager();
  startControlServer(47616, {
    onManualBreakChange: () => evaluateAndUpdate(),
    phoneApi: {
      getPairingToken: () => store.getPhonePairingToken(),
      getConfig: () => phoneFocusManager.getConfig(),
      getStatus: () => phoneFocusManager.getStatus(),
      updateConfig: (partial) => updatePhoneConfig(partial),
      receiveEvent: (event) => phoneFocusManager.receiveEvent(event),
    },
  });

  // Claude Code/Codex 작업 상태(hook으로 갱신)가 바뀌면 펫 자세 갱신
  setCodingAgentStatusListener(() => updatePetPose());

  // 펫 창 표시 (설정에서 끄지 않았으면 기본 on)
  if (store.getSettings().petEnabled) {
    petWindow.showPet(focusState ? focusState.getState() : 'BREAK', getCodingAgentWorking(), getCodingAgentCount());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (focusState) focusState.stop();
    if (awayManager) awayManager.stop();
    if (phoneFocusManager) phoneFocusManager.stop();
    tracker.stopTracking();
    chromeBridge.stopBridge();
    gazeManager.stopGaze();
    petWindow.hidePet();
    stopControlServer();
    app.quit();
  }
});
