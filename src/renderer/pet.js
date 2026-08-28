'use strict';

// pet.js — 펫 창 렌더러. main에서 받은 상태로 자세(coding|study|deskSleep|sleep|alert) 전환.
// data.count = 동시 작동중인 Claude Code + Codex 세션 수 → 책상에 노트북을 그 수만큼 그린다(개수↑ → 크기↓).
// alert(쉬는시간 제한 도달)는 일시적 오버레이라 일정 시간 후 직전 기본자세로 복귀.

const ALERT_DURATION_MS = 6000;

window.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('stage');
  const desk = document.getElementById('desk');
  if (!stage) return;

  const BASE_STAGES = ['coding', 'study', 'deskSleep', 'sleep'];
  const DESK_STAGES = ['coding', 'deskSleep'];   // 노트북을 보여주는 자세
  let baseStage = 'sleep';   // 지속 상태
  let lastCount = 0;         // 마지막으로 받은 세션 수
  let alertTimer = null;

  // 노트북 한 대 (viewBox 64×48). 폭은 pet.js가 대수에 맞춰 인라인 width로 지정.
  const LAPTOP =
    '<svg class="laptop" viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="10" y="3" width="44" height="29" rx="3" fill="#3a3f5c" stroke="#23263a" stroke-width="2"/>' +
    '<rect x="14" y="7" width="36" height="21" rx="2" fill="#1e2236"/>' +
    '<rect class="code-line c1" x="17" y="11" width="16" height="2.4" rx="1" fill="#CC785C"/>' +
    '<rect class="code-line c2" x="17" y="16" width="24" height="2.4" rx="1" fill="#6C8EEF"/>' +
    '<rect class="code-line c3" x="17" y="21" width="12" height="2.4" rx="1" fill="#43e97b"/>' +
    '<path d="M4,36 L60,36 L64,46 L0,46 Z" fill="#4a4f6e" stroke="#23263a" stroke-width="2" stroke-linejoin="round"/>' +
    '</svg>';

  // 책상 가용 폭 안에서 노트북 폭 계산 (대수가 많아지면 작아짐).
  const DESK_W = 188;   // 펫 창(200) 내 책상 가용 폭(px)
  const GAP = 4;        // 노트북 사이 간격(px, .desk gap과 동일)
  const BASE = 52;      // 기본 노트북 폭
  const MINW = 14;      // 최소 폭
  const MAXN = 12;      // 표시 상한 (그 이상은 동일하게 취급)
  function laptopWidth(n) {
    if (n <= 1) return BASE;
    const w = Math.floor((DESK_W - (n - 1) * GAP) / n);
    return Math.max(MINW, Math.min(BASE, w));
  }

  // 현재 baseStage·lastCount에 맞춰 책상의 노트북들을 다시 그린다.
  function renderDesk() {
    if (!desk) return;
    const show = DESK_STAGES.indexOf(baseStage) !== -1;
    const n = show ? Math.min(MAXN, Math.max(1, lastCount)) : 0;
    // 대수가 그대로면 재생성 생략 → 코드 깜빡임 애니메이션 안 끊김.
    if (desk.dataset.n === String(n)) return;
    desk.innerHTML = n > 0 ? LAPTOP.repeat(n) : '';
    desk.dataset.n = String(n);
    if (n > 0) {
      const w = laptopWidth(n) + 'px';
      for (const lap of desk.children) lap.style.width = w;  // CSSOM 설정 → CSP 허용
    }
  }

  function applyStage(cls) {
    stage.classList.remove('coding', 'study', 'deskSleep', 'sleep', 'alert');
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
      if (data && typeof data.count === 'number') lastCount = data.count;

      if (state === 'alert') {
        applyStage('alert');
        clearAlertTimer();
        alertTimer = setTimeout(() => {
          alertTimer = null;
          applyStage(baseStage);
        }, ALERT_DURATION_MS);
        return;
      }

      if (BASE_STAGES.indexOf(state) !== -1) {
        baseStage = state;
        clearAlertTimer();   // 새 지속 상태가 오면 alert 종료
        applyStage(state);
        renderDesk();        // 자세·세션 수 변화를 책상에 반영
      } else {
        // 자세 메시지가 아니어도(예: count만 갱신) 책상 수는 최신화
        renderDesk();
      }
    });
  }
});
