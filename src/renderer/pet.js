'use strict';

// pet.js — 펫 창 렌더러. main에서 받은 상태로 자세(study|sleep|alert) 전환.
// alert(쉬는시간 제한 도달)는 일시적 오버레이라 일정 시간 후 직전 기본자세로 복귀.

const ALERT_DURATION_MS = 6000;

window.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('stage');
  if (!stage) return;

  let baseStage = 'sleep';   // study|sleep — 지속 상태
  let alertTimer = null;

  function applyStage(cls) {
    stage.classList.remove('study', 'sleep', 'alert');
    stage.classList.add(cls);
  }

  function clearAlertTimer() {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
  }

  if (window.petAPI && typeof window.petAPI.onState === 'function') {
    window.petAPI.onState((data) => {
      const state = data && data.state;

      if (state === 'alert') {
        applyStage('alert');
        clearAlertTimer();
        alertTimer = setTimeout(() => {
          alertTimer = null;
          applyStage(baseStage);
        }, ALERT_DURATION_MS);
        return;
      }

      if (state === 'study' || state === 'sleep') {
        baseStage = state;
        clearAlertTimer();   // 새 지속 상태가 오면 alert 종료
        applyStage(state);
      }
    });
  }
});
