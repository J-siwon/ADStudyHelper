'use strict';

// character.js — 캐릭터 팝업 렌더러 스크립트
window.addEventListener('DOMContentLoaded', () => {
  const messageEl = document.getElementById('message');
  const closeBtn = document.getElementById('closeBtn');

  // main으로부터 메시지 수신 → DOM 갱신
  window.characterAPI.onMessage((msg) => {
    if (messageEl) messageEl.textContent = msg;
  });

  // 닫기 버튼 클릭 → main에 close 이벤트 전송
  closeBtn.addEventListener('click', () => {
    window.characterAPI.close();
  });
});
