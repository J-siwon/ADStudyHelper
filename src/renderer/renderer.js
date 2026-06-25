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
  const breakTimerEl   = document.getElementById('breakTimer');
  const stateBadgeEl   = document.getElementById('stateBadge');
  const connectionEl   = document.getElementById('connectionBadge');
  const cameraBadgeEl  = document.getElementById('cameraBadge');
  const currentAppEl   = document.getElementById('currentApp');
  const appsTextarea   = document.getElementById('appsTextarea');
  const urlsTextarea   = document.getElementById('urlsTextarea');
  const urlModeSelect  = document.getElementById('urlModeSelect');
  const urlsLabel      = document.getElementById('urlsLabel');
  const urlModeHint    = document.getElementById('urlModeHint');
  const helpBtn        = document.getElementById('helpBtn');
  const settingsBtn    = document.getElementById('settingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsOverlay  = document.getElementById('settingsOverlay');
  const saveBtn        = document.getElementById('saveBtn');
  const saveStatusEl   = document.getElementById('saveStatus');

  // URL 판정 방식(allow/block)에 따라 라벨·안내 문구 갱신
  function applyUrlModeUI() {
    const mode = urlModeSelect ? urlModeSelect.value : 'allow';
    if (mode === 'block') {
      if (urlsLabel) urlsLabel.textContent = '제한 URL 패턴 (방문 시 휴식)';
      if (urlModeHint) urlModeHint.textContent =
        '제한 목록: 아래 URL을 방문하면 휴식(BREAK)으로 처리하고, 그 외 모든 사이트는 집중(WORK)으로 인정합니다. 확장 미연결이면 집중으로 간주합니다.';
      if (urlsTextarea) urlsTextarea.placeholder = '한 줄에 하나씩 입력\n예: youtube.com';
    } else {
      if (urlsLabel) urlsLabel.textContent = '허용 URL 패턴 (방문 시 집중)';
      if (urlModeHint) urlModeHint.textContent =
        '허용 목록: 아래 URL만 집중(WORK)으로 인정하고, 그 외 사이트는 휴식(BREAK)으로 처리합니다. 확장 미연결이면 휴식으로 간주합니다.';
      if (urlsTextarea) urlsTextarea.placeholder = '한 줄에 하나씩 입력\n예: github.com';
    }
  }

  if (urlModeSelect) {
    urlModeSelect.addEventListener('change', applyUrlModeUI);
  }

  // 도움말 창 열기
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      if (window.focusAPI && typeof window.focusAPI.openHelp === 'function') {
        window.focusAPI.openHelp();
      }
    });
  }

  // 설정 오버레이 열기/닫기 (페이드 인/아웃)
  function openSettings() {
    if (!settingsOverlay) return;
    settingsOverlay.classList.add('open');
    settingsOverlay.setAttribute('aria-hidden', 'false');
  }
  function closeSettings() {
    if (!settingsOverlay) return;
    settingsOverlay.classList.remove('open');
    settingsOverlay.setAttribute('aria-hidden', 'true');
  }
  if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
  // 패널 바깥(어두운 배경) 클릭 시 닫기
  if (settingsOverlay) {
    settingsOverlay.addEventListener('click', (e) => {
      if (e.target === settingsOverlay) closeSettings();
    });
  }
  // Esc로 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsOverlay && settingsOverlay.classList.contains('open')) {
      closeSettings();
    }
  });

  if (!window.focusAPI) {
    // preload 미연결 환경(개발용 브라우저 직접 열기 등)에서 경고 표시
    timerEl.textContent = '--:--:--';
    stateBadgeEl.textContent = 'N/A';
    return;
  }

  // 1초마다 tick: { state, workSeconds, breakSeconds }
  window.focusAPI.onTick(({ state, workSeconds, breakSeconds }) => {
    // 오늘 집중 시간 (자정에 자동 0)
    timerEl.textContent = formatTime(workSeconds);

    // 상태 배지 갱신
    const isWork = state === 'WORK';
    stateBadgeEl.textContent = isWork ? 'WORK' : 'BREAK';
    stateBadgeEl.classList.toggle('work', isWork);
    stateBadgeEl.classList.toggle('break', !isWork);

    // 누적 쉬는 시간 — 휴식 중엔 실시간 증가, 작업 복귀 후에도 누적값 유지(연속 집중 유지 시 초기화).
    if (breakTimerEl) {
      const bs = breakSeconds || 0;
      if (bs > 0) {
        breakTimerEl.textContent = isWork
          ? `쉬는 시간 ${formatTime(bs)} · 집중 유지 시 초기화`
          : `쉬는 시간 ${formatTime(bs)}`;
        breakTimerEl.style.display = '';
      } else {
        breakTimerEl.textContent = '';
        breakTimerEl.style.display = 'none';
      }
    }
  });

  // 확장 연결 상태
  window.focusAPI.onConnection((connected) => {
    connectionEl.textContent = connected ? '확장 연결됨' : '확장 미연결';
    connectionEl.classList.toggle('connected', connected);
  });

  // 현재 활성 앱/URL 표시 — 사용자가 어떤 이름을 화이트리스트에 넣어야 할지 알 수 있게
  if (currentAppEl && typeof window.focusAPI.onStatus === 'function') {
    window.focusAPI.onStatus((s) => {
      if (!s) return;
      let label;
      if (s.isChrome) {
        if (!s.extensionConnected) label = 'Chrome (확장 미연결)';
        else label = `Chrome — ${s.url || 'URL 없음'}`;
      } else {
        label = s.app || '(알 수 없음)';
      }
      const mark = s.state === 'WORK' ? '집중' : '휴식';
      currentAppEl.textContent = `현재 활성: ${label} → ${mark}`;

      // 웹캠 상태 배지
      if (cameraBadgeEl) {
        cameraBadgeEl.classList.remove('connected', 'disconnected');
        if (!s.cameraEnabled) {
          cameraBadgeEl.textContent = '웹캠 꺼짐';
        } else if (s.cameraConnected) {
          cameraBadgeEl.textContent = '웹캠 연결됨';
          cameraBadgeEl.classList.add('connected');
        } else {
          cameraBadgeEl.textContent = '웹캠 미연결';
          cameraBadgeEl.classList.add('disconnected');
        }
      }
    });
  }

  // 화이트리스트 초기 로드
  window.focusAPI.getWhitelist().then((wl) => {
    appsTextarea.value = (wl.apps || []).join('\n');
    urlsTextarea.value = (wl.urlPatterns || []).join('\n');
    if (urlModeSelect) urlModeSelect.value = wl.urlMode === 'block' ? 'block' : 'allow';
    applyUrlModeUI();
  }).catch(() => {
    // 로드 실패 시 무시 (빈 상태 유지)
    applyUrlModeUI();
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
    const urlMode = urlModeSelect && urlModeSelect.value === 'block' ? 'block' : 'allow';

    try {
      await window.focusAPI.setWhitelist({ apps, urlPatterns, urlMode });
      saveStatusEl.textContent = '저장됨 ✓';
      setTimeout(() => { saveStatusEl.textContent = ''; }, 2000);
    } catch {
      saveStatusEl.textContent = '저장 실패';
    }
  });

  // ── Phase 2 설정 패널 ──────────────────────────────────────────────

  const petToggle            = document.getElementById('petToggle');
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
      if (petToggle)            petToggle.checked              = s.petEnabled !== false;
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
        petEnabled:       petToggle ? petToggle.checked : true,
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
