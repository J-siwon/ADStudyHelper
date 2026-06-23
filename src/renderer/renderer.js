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

  // ── Phase 2 설정 패널 ──────────────────────────────────────────────

  const cameraToggle         = document.getElementById('cameraToggle');
  const cameraSourceSelect   = document.getElementById('cameraSourceSelect');
  const cameraDeviceSelect   = document.getElementById('cameraDeviceSelect');
  const cameraStreamUrlInput = document.getElementById('cameraStreamUrlInput');
  const cameraDeviceRow      = document.getElementById('cameraDeviceRow');
  const cameraStreamRow      = document.getElementById('cameraStreamRow');
  const ntfyTopicInput       = document.getElementById('ntfyTopicInput');
  const awayThresholdInput   = document.getElementById('awayThresholdInput');
  const controlUrlEl         = document.getElementById('controlUrl');
  const settingsSaveBtn      = document.getElementById('settingsSaveBtn');
  const settingsSaveStatus   = document.getElementById('settingsSaveStatus');

  // 카메라 소스에 따라 장치 선택 / 스트림 URL 행 표시 토글
  function applyCameraSourceVisibility() {
    const mode = cameraSourceSelect ? cameraSourceSelect.value : 'webcam';
    const isStream = mode === 'stream';
    if (cameraDeviceRow) cameraDeviceRow.style.display = isStream ? 'none' : '';
    if (cameraStreamRow) cameraStreamRow.style.display = isStream ? '' : 'none';
  }

  if (cameraSourceSelect) {
    cameraSourceSelect.addEventListener('change', applyCameraSourceVisibility);
  }

  // focusAPI에 getSettings/setSettings 가 있을 때만 활성화
  // (worker-1이 ipcMain 'settings:get'/'settings:set' 핸들러를 연결함 — 주석 참고)
  const hasSettingsAPI = !!(
    window.focusAPI &&
    typeof window.focusAPI.getSettings === 'function' &&
    typeof window.focusAPI.setSettings === 'function'
  );

  // 카메라 장치 목록 채우기 (브라우저 API)
  async function populateCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      // 기본 옵션은 HTML에 있으므로 추가 항목만 삽입
      videoDevices.forEach((dev) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `카메라 ${cameraDeviceSelect.options.length}`;
        cameraDeviceSelect.appendChild(opt);
      });
    } catch {
      // 권한 없으면 무시
    }
  }

  // 폰 제어 주소 표시
  // focusAPI.getControlUrl() 이 있으면 사용, 없으면 포트만 안내
  async function loadControlUrl() {
    if (window.focusAPI && typeof window.focusAPI.getControlUrl === 'function') {
      try {
        const url = await window.focusAPI.getControlUrl();
        if (controlUrlEl) controlUrlEl.textContent = url || 'http://<LAN-IP>:47616';
      } catch {
        if (controlUrlEl) controlUrlEl.textContent = 'http://<LAN-IP>:47616';
      }
    } else {
      if (controlUrlEl) controlUrlEl.textContent = 'http://<LAN-IP>:47616';
    }
  }

  // 설정 초기 로드
  async function loadSettings() {
    if (!hasSettingsAPI) return;
    try {
      const s = await window.focusAPI.getSettings();
      if (cameraToggle)         cameraToggle.checked           = !!s.cameraEnabled;
      if (cameraSourceSelect)   cameraSourceSelect.value       = s.cameraSource || 'webcam';
      if (cameraDeviceSelect)   cameraDeviceSelect.value       = s.cameraDeviceId || '';
      if (cameraStreamUrlInput) cameraStreamUrlInput.value     = s.cameraStreamUrl || '';
      if (ntfyTopicInput)       ntfyTopicInput.value           = s.ntfyTopic || '';
      if (awayThresholdInput)   awayThresholdInput.value       = s.awayThresholdMin ?? 10;
      applyCameraSourceVisibility();
    } catch {
      // 로드 실패 시 기본값 유지
    }
  }

  // 설정 저장
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', async () => {
      if (!hasSettingsAPI) {
        settingsSaveStatus.textContent = 'API 미연결 (main 측 핸들러 필요)';
        setTimeout(() => { settingsSaveStatus.textContent = ''; }, 3000);
        return;
      }
      const partial = {
        cameraEnabled:    cameraToggle ? cameraToggle.checked : false,
        cameraSource:     cameraSourceSelect ? cameraSourceSelect.value : 'webcam',
        cameraDeviceId:   cameraDeviceSelect ? (cameraDeviceSelect.value || null) : null,
        cameraStreamUrl:  cameraStreamUrlInput ? cameraStreamUrlInput.value.trim() : '',
        ntfyTopic:        ntfyTopicInput ? ntfyTopicInput.value.trim() : '',
        awayThresholdMin: awayThresholdInput ? Number(awayThresholdInput.value) || 10 : 10,
      };
      try {
        await window.focusAPI.setSettings(partial);
        settingsSaveStatus.textContent = '저장됨 ✓';
        setTimeout(() => { settingsSaveStatus.textContent = ''; }, 2000);
      } catch {
        settingsSaveStatus.textContent = '저장 실패';
      }
    });
  }

  // 초기화
  populateCameraDevices();
  loadControlUrl();
  loadSettings();

  // NOTE (worker-1 연동): preload/index.js에 아래를 추가해야 함:
  //   getSettings: () => ipcRenderer.invoke('settings:get'),
  //   setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  //   getControlUrl: () => ipcRenderer.invoke('control:url'),
  // main/index.js에서:
  //   ipcMain.handle('settings:get', () => store.getSettings())
  //   ipcMain.handle('settings:set', (_, partial) => store.setSettings(partial))
  //   ipcMain.handle('control:url', () => `http://${lanIp}:47616`)
});
