'use strict';

const Store = require('electron-store');

// 기본 시드 화이트리스트
const DEFAULT_WHITELIST = {
  apps: ['Code', 'WindowsTerminal', 'cmd'],
  urlPatterns: ['docs.google.com', 'github.com', 'stackoverflow.com'],
};

// 기본 설정값 — 순수 상수이므로 단독 테스트 가능
const DEFAULT_SETTINGS = {
  cameraEnabled: false,       // 웹캠 시선 추적 on/off
  cameraSource: 'webcam',     // 카메라 소스: 'webcam'(내장) | 'stream'(폰 MJPEG/스트림 URL)
  cameraDeviceId: null,       // getUserMedia deviceId (null = 기본 장치, cameraSource='webcam'일 때)
  cameraStreamUrl: '',        // 폰 스트림 URL (cameraSource='stream'일 때 사용, 빈 문자열 = 미설정)
  ntfyTopic: '',              // ntfy.sh 토픽 (빈 문자열 = no-op)
  awayThresholdMin: 10,       // 자리 비움 알림 임계값(분)
  telegram: null,             // { botToken: string, chatId: string } | null
};

// partial 설정을 기본값에 얕게 병합 — 순수 함수이므로 단독 테스트 가능
function mergeSettings(base, partial) {
  return Object.assign({}, base, partial);
}

// 오늘 날짜 키(YYYY-MM-DD) 반환 — 순수 함수이므로 단독 테스트 가능
function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const store = new Store({ name: 'ad-study-helper' });

module.exports = {
  // 화이트리스트 조회 (없으면 기본 시드 반환)
  getWhitelist() {
    return store.get('whitelist', DEFAULT_WHITELIST);
  },

  // 화이트리스트 저장
  setWhitelist(wl) {
    store.set('whitelist', wl);
  },

  // 오늘 날짜 키에 n초 누적
  addWorkSeconds(n) {
    const key = `workSeconds.${todayKey()}`;
    const current = store.get(key, 0);
    store.set(key, current + n);
  },

  // 오늘 누적 작업초 반환 (날짜 바뀌면 자동으로 0)
  getTodayWorkSeconds() {
    return store.get(`workSeconds.${todayKey()}`, 0);
  },

  // 설정 전체 조회 (없는 키는 기본값으로 채워 반환)
  getSettings() {
    const saved = store.get('settings', {});
    return mergeSettings(DEFAULT_SETTINGS, saved);
  },

  // 설정 부분 갱신 (기존 저장값에 partial 병합 후 저장)
  setSettings(partial) {
    const current = store.get('settings', {});
    const next = mergeSettings(current, partial);
    store.set('settings', next);
  },

  // 테스트에서 순수 로직을 직접 검증하기 위해 노출
  _todayKey: todayKey,
  _DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  _mergeSettings: mergeSettings,
};
