'use strict';

const Store = require('electron-store');

// 기본 시드 화이트리스트
const DEFAULT_WHITELIST = {
  apps: ['Code', 'WindowsTerminal', 'cmd'],
  urlPatterns: ['docs.google.com', 'github.com', 'stackoverflow.com'],
};

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

  // 테스트에서 날짜 키 로직을 직접 검증하기 위해 노출
  _todayKey: todayKey,
};
