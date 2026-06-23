'use strict';

// gaze.js — 웹캠 시선 추적 렌더러 스크립트
// webgazer.js CDN 로드를 시도하고, 실패 시 얼굴 존재 여부(facePresent)만 보고.

const REPORT_INTERVAL_MS = 1000; // 1초마다 main에 보고
const STATUS_EL = document.getElementById('status');
const VIDEO_EL = document.getElementById('videoEl');
const STREAM_EL = document.getElementById('streamEl');

let state = { facePresent: false, gazeOnScreen: false, connected: false };
let deviceId = null;
let stream = null;
let reportTimer = null;
let streamHealthy = false; // 폰 스트림(MJPEG) 수신 정상 여부
let sourceMode = 'webcam'; // 'webcam' | 'stream' — connected 계산에 사용

// webgazer 로드 여부
let webgazerReady = false;

function setStatus(msg) {
  if (STATUS_EL) STATUS_EL.textContent = msg;
}

// 카메라 스트림 시작
async function startCamera(reqDeviceId) {
  const constraints = {
    video: reqDeviceId
      ? { deviceId: { exact: reqDeviceId } }
      : true,
    audio: false,
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    VIDEO_EL.srcObject = stream;
    return true;
  } catch (err) {
    setStatus('카메라 접근 실패: ' + err.message);
    return false;
  }
}

// webgazer.js를 동적으로 CDN에서 로드 (오프라인이면 실패→폴백)
function loadWebgazer() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://webgazer.cs.brown.edu/webgazer.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false); // 오프라인 폴백
    // 타임아웃 5초
    const timer = setTimeout(() => resolve(false), 5000);
    script.onload = () => { clearTimeout(timer); resolve(true); };
    document.head.appendChild(script);
  });
}

// webgazer 기반 시선 추적 시작
async function startWebgazer() {
  try {
    await window.webgazer
      .setGazeListener((data) => {
        if (!data) {
          state.facePresent = false;
          state.gazeOnScreen = false;
          return;
        }
        state.facePresent = true;
        // 화면 범위 내에 예측 좌표가 있으면 gazeOnScreen=true
        state.gazeOnScreen =
          data.x >= 0 && data.x <= window.screen.width &&
          data.y >= 0 && data.y <= window.screen.height;
      })
      .begin();

    window.webgazer.showVideoPreview(false);
    window.webgazer.showPredictionPoints(false);
    webgazerReady = true;
    setStatus('webgazer 실행 중');
    startCalibration();
  } catch (err) {
    setStatus('webgazer 오류: ' + err.message + ' — 얼굴 감지 폴백 모드');
    startFaceFallback();
  }
}

// 폰 스트림(MJPEG/URL) 소스: webgazer(getUserMedia) 비호환 → 존재 여부(presence)만 판정.
// 스트림 로드 성공=facePresent=true, 실패/끊김=false. gaze 정밀 추적은 불가(presence=화면주시로 가정).
function startStream(streamUrl) {
  if (!STREAM_EL) {
    setStatus('스트림 엘리먼트 없음');
    return;
  }
  if (VIDEO_EL) VIDEO_EL.style.display = 'none';
  STREAM_EL.style.display = 'block';

  STREAM_EL.addEventListener('load', () => {
    streamHealthy = true;
    setStatus('폰 스트림 수신 중 (presence 모드)');
  });
  STREAM_EL.addEventListener('error', () => {
    streamHealthy = false;
    setStatus('폰 스트림 오류 — URL 확인');
  });

  STREAM_EL.src = streamUrl;

  // 주기적으로 스트림 상태 → state 반영 (MJPEG는 트랙 개념이 없어 load/error + naturalWidth로 판정)
  setInterval(() => {
    const alive = streamHealthy && STREAM_EL.naturalWidth > 0;
    state.facePresent = alive;
    state.gazeOnScreen = alive; // presence 모드: 스트림 정상=화면 주시로 가정
  }, REPORT_INTERVAL_MS);
}

// 폴백: 단순 얼굴 존재 감지 (비디오 트랙 활성 여부만 확인)
function startFaceFallback() {
  setStatus('폴백 모드: 카메라 활성 여부만 감지');
  // 트랙이 살아있으면 facePresent=true로 간주 (단순 폴백)
  setInterval(() => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      state.facePresent = !!(track && track.readyState === 'live');
      state.gazeOnScreen = state.facePresent; // 폴백: 카메라=화면 주시로 가정
    }
  }, REPORT_INTERVAL_MS);
}

// 캘리브레이션 lite: 화면 5점 클릭
function startCalibration() {
  const calEl = document.getElementById('calibration');
  const skipBtn = document.getElementById('skipCalBtn');
  if (!calEl) return;

  const points = [
    { x: '5%', y: '5%' },
    { x: '95%', y: '5%' },
    { x: '50%', y: '50%' },
    { x: '5%', y: '95%' },
    { x: '95%', y: '95%' },
  ];

  let idx = 0;
  calEl.classList.add('active');

  function showDot() {
    // 이전 점 제거
    document.querySelectorAll('.cal-dot').forEach((d) => d.remove());
    if (idx >= points.length) {
      calEl.classList.remove('active');
      setStatus('캘리브레이션 완료 — 추적 중');
      return;
    }
    const dot = document.createElement('div');
    dot.className = 'cal-dot';
    dot.style.left = points[idx].x;
    dot.style.top = points[idx].y;
    dot.addEventListener('click', () => {
      if (webgazerReady && window.webgazer) {
        window.webgazer.recordScreenPosition(
          dot.getBoundingClientRect().left + 10,
          dot.getBoundingClientRect().top + 10,
          window.webgazer.params.eventTypes[0]
        );
      }
      idx++;
      showDot();
    });
    document.body.appendChild(dot);
  }

  skipBtn.addEventListener('click', () => {
    calEl.classList.remove('active');
    document.querySelectorAll('.cal-dot').forEach((d) => d.remove());
    setStatus('캘리브레이션 건너뜀 — 추적 중');
  });

  showDot();
}

// 카메라/스트림이 실제로 연결되어 신호를 주는 중인지 판정.
// connected=false면 main이 BREAK를 강제하지 않고 크롬 확장(화이트리스트)으로 폴백한다.
function computeConnected() {
  if (sourceMode === 'stream') {
    return streamHealthy && !!STREAM_EL && STREAM_EL.naturalWidth > 0;
  }
  // webcam: getUserMedia 트랙이 살아있어야 연결로 간주
  if (!stream) return false;
  const track = stream.getVideoTracks()[0];
  return !!(track && track.readyState === 'live');
}

// 주기적으로 main에 gaze 상태 보고
function startReporting() {
  reportTimer = setInterval(() => {
    if (window.gazeAPI) {
      state.connected = computeConnected();
      window.gazeAPI.sendUpdate({ ...state });
    }
  }, REPORT_INTERVAL_MS);
}

// 진입점
window.addEventListener('DOMContentLoaded', () => {
  if (!window.gazeAPI) {
    setStatus('gazeAPI 없음 (preload 미연결)');
    return;
  }

  window.gazeAPI.onInit(async ({ cameraDeviceId, cameraSource, cameraStreamUrl }) => {
    deviceId = cameraDeviceId;

    // 폰 스트림 모드: webgazer 대신 presence 판정만 사용
    if (cameraSource === 'stream' && cameraStreamUrl) {
      sourceMode = 'stream';
      setStatus('폰 스트림 연결 중...');
      startStream(cameraStreamUrl);
      startReporting();
      return;
    }

    // 내장 웹캠 모드 (기존 경로)
    sourceMode = 'webcam';
    setStatus('카메라 시작 중...');

    const camOk = await startCamera(deviceId);
    if (!camOk) {
      // 카메라 없이 항상 BREAK 신호
      startReporting();
      return;
    }

    setStatus('webgazer 로드 중...');
    const wgLoaded = await loadWebgazer();

    if (wgLoaded) {
      await startWebgazer();
    } else {
      setStatus('오프라인 — 폴백 모드');
      startFaceFallback();
    }

    startReporting();
  });
});
