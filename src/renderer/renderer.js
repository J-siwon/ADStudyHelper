'use strict';

// renderer.js — 대시보드 렌더러 스크립트
// window.focusAPI 는 src/preload/index.js 가 contextBridge로 노출

// HH:MM:SS 포맷 변환
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

window.addEventListener('DOMContentLoaded', () => {
  const timerEl        = document.getElementById('timer');
  const stateBadgeEl   = document.getElementById('stateBadge');
  const connectionEl   = document.getElementById('connectionBadge');
  const appsTextarea   = document.getElementById('appsTextarea');
  const urlsTextarea   = document.getElementById('urlsTextarea');
  const saveBtn        = document.getElementById('saveBtn');
  const saveStatusEl   = document.getElementById('saveStatus');

  if (!window.focusAPI) {
    // preload 미연결 환경(개발용 브라우저 직접 열기 등)에서 경고 표시
    timerEl.textContent = '--:--:--';
    stateBadgeEl.textContent = 'N/A';
    return;
  }

  // 1초마다 tick: { state, workSeconds }
  window.focusAPI.onTick(({ state, workSeconds }) => {
    // 타이머 갱신
    timerEl.textContent = formatTime(workSeconds);

    // 상태 배지 갱신
    const isWork = state === 'WORK';
    stateBadgeEl.textContent = isWork ? 'WORK' : 'BREAK';
    stateBadgeEl.classList.toggle('work', isWork);
    stateBadgeEl.classList.toggle('break', !isWork);
  });

  // 확장 연결 상태
  window.focusAPI.onConnection((connected) => {
    connectionEl.textContent = connected ? '확장 연결됨' : '확장 미연결';
    connectionEl.classList.toggle('connected', connected);
  });

  // 화이트리스트 초기 로드
  window.focusAPI.getWhitelist().then((wl) => {
    appsTextarea.value = (wl.apps || []).join('\n');
    urlsTextarea.value = (wl.urlPatterns || []).join('\n');
  }).catch(() => {
    // 로드 실패 시 무시 (빈 상태 유지)
  });

  // 화이트리스트 저장
  saveBtn.addEventListener('click', async () => {
    const apps = appsTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const urlPatterns = urlsTextarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await window.focusAPI.setWhitelist({ apps, urlPatterns });
      saveStatusEl.textContent = '저장됨 ✓';
      setTimeout(() => { saveStatusEl.textContent = ''; }, 2000);
    } catch {
      saveStatusEl.textContent = '저장 실패';
    }
  });
});
