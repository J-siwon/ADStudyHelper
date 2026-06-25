'use strict';

// gaze.js — 카메라 미리보기 + MediaPipe FaceLandmarker 기반 얼굴/시선 추적 (ESM).
// 웹캠 모드: 얼굴 랜드마크(iris)로 facePresent + 시선 이탈(gazeOnScreen) 판정.
// 폰 스트림 모드: MJPEG는 프레임 분석이 어려워 presence(존재 여부)만 판정.
// MediaPipe 초기화 실패 시: 카메라 트랙 생존 여부만 보는 presence 폴백.

import { FaceLandmarker, FilesetResolver } from './vendor/mediapipe/vision_bundle.mjs';

const REPORT_INTERVAL_MS = 1000;   // main 보고 주기
const DETECT_INTERVAL_MS = 140;    // 얼굴 검출 주기(CPU 절약)
const PRESENCE_GRACE_MS = 1500;    // 얼굴이 잠깐 사라져도 유지하는 유예

const VIDEO_EL = document.getElementById('videoEl');
const STREAM_EL = document.getElementById('streamEl');
const OVERLAY = document.getElementById('overlay');
const STATUS_EL = document.getElementById('status');
const BADGE_EL = document.getElementById('badge');

let state = { facePresent: false, gazeOnScreen: false, connected: false };
let stream = null;
let landmarker = null;
let lastFaceAt = 0;
let streamHealthy = false;
let sourceMode = 'webcam';

function setStatus(msg) { if (STATUS_EL) STATUS_EL.textContent = msg; }
function setBadge(text, cls) {
  if (!BADGE_EL) return;
  BADGE_EL.textContent = text;
  BADGE_EL.classList.remove('ok', 'off');
  if (cls) BADGE_EL.classList.add(cls);
}

async function startCamera(reqDeviceId) {
  const constraints = {
    video: reqDeviceId ? { deviceId: { exact: reqDeviceId } } : { width: 320, height: 240 },
    audio: false,
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    VIDEO_EL.srcObject = stream;
    await VIDEO_EL.play().catch(() => {});
    return true;
  } catch (err) {
    setStatus('카메라 접근 실패: ' + err.message);
    setBadge('카메라 없음', 'off');
    return false;
  }
}

function trackAlive() {
  if (!stream) return false;
  const t = stream.getVideoTracks()[0];
  return !!(t && t.readyState === 'live');
}

// MediaPipe FaceLandmarker 초기화 (mp:// 커스텀 프로토콜로 오프라인 에셋 로드)
async function initLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks('mp://app/wasm');
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: 'mp://app/face_landmarker.task', delegate: 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
  });
}

function drawOverlay(landmarks) {
  if (!OVERLAY) return;
  const ctx = OVERLAY.getContext('2d');
  ctx.clearRect(0, 0, OVERLAY.width, OVERLAY.height);
  if (!landmarks) return;
  const W = OVERLAY.width, H = OVERLAY.height;
  const idx = window.gazeMath ? window.gazeMath._IDX : null;
  ctx.fillStyle = '#43e97b';
  // 얼굴 윤곽 일부(가벼운 점들)
  for (let i = 0; i < landmarks.length; i += 12) {
    const p = landmarks[i];
    ctx.fillRect(p.x * W - 1, p.y * H - 1, 2, 2);
  }
  // 홍채 강조
  if (idx) {
    ctx.fillStyle = '#7c83fd';
    [idx.rightEye.iris, idx.leftEye.iris].forEach((i) => {
      const p = landmarks[i];
      if (p) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2); ctx.fill(); }
    });
  }
}

// 웹캠 모드: 주기적으로 얼굴 검출 → state 갱신
function startWebcamDetection() {
  let lastTs = -1;
  function loop() {
    if (!landmarker || !VIDEO_EL || VIDEO_EL.readyState < 2 || VIDEO_EL.videoWidth === 0) {
      return;
    }
    const ts = performance.now();
    if (ts === lastTs) return;
    lastTs = ts;
    let result = null;
    try {
      result = landmarker.detectForVideo(VIDEO_EL, ts);
    } catch (e) {
      return;
    }
    const faces = result && result.faceLandmarks;
    if (faces && faces.length > 0) {
      const lm = faces[0];
      const gaze = window.gazeMath
        ? window.gazeMath.computeGaze(lm)
        : { present: true, onScreen: true };
      lastFaceAt = ts;
      state.facePresent = true;
      state.gazeOnScreen = gaze.onScreen;
      drawOverlay(lm);
      setBadge(gaze.onScreen ? '얼굴 인식됨' : '시선 이탈', gaze.onScreen ? 'ok' : 'off');
      setStatus(gaze.onScreen ? '집중 자세 인식 중' : '시선이 화면을 벗어났어요');
    } else {
      // 잠깐 놓쳐도 유예시간 동안 유지
      if (ts - lastFaceAt > PRESENCE_GRACE_MS) {
        state.facePresent = false;
        state.gazeOnScreen = false;
        drawOverlay(null);
        setBadge('얼굴 안 보임', 'off');
        setStatus('얼굴을 찾는 중...');
      }
    }
  }
  setInterval(loop, DETECT_INTERVAL_MS);
}

// 폰 스트림 모드: presence만 (MJPEG)
function startStream(streamUrl) {
  sourceMode = 'stream';
  if (VIDEO_EL) VIDEO_EL.style.display = 'none';
  STREAM_EL.style.display = 'block';
  STREAM_EL.addEventListener('load', () => { streamHealthy = true; setStatus('폰 스트림 수신 중 (presence)'); });
  STREAM_EL.addEventListener('error', () => { streamHealthy = false; setStatus('폰 스트림 오류 — URL 확인'); });
  STREAM_EL.src = streamUrl;
  setInterval(() => {
    const alive = streamHealthy && STREAM_EL.naturalWidth > 0;
    state.facePresent = alive;
    state.gazeOnScreen = alive;
    setBadge(alive ? '스트림 연결됨' : '스트림 끊김', alive ? 'ok' : 'off');
  }, REPORT_INTERVAL_MS);
}

// MediaPipe 실패 시: 카메라 트랙 생존만 보는 presence 폴백
function startPresenceFallback() {
  setStatus('얼굴 인식 모듈 로드 실패 — presence 폴백');
  setInterval(() => {
    const alive = trackAlive();
    state.facePresent = alive;
    state.gazeOnScreen = alive;
    setBadge(alive ? '카메라 활성(폴백)' : '카메라 없음', alive ? 'ok' : 'off');
  }, REPORT_INTERVAL_MS);
}

// 카메라 실제 연결 여부
function computeConnected() {
  if (sourceMode === 'stream') {
    return streamHealthy && !!STREAM_EL && STREAM_EL.naturalWidth > 0;
  }
  return trackAlive();
}

function startReporting() {
  setInterval(() => {
    if (window.gazeAPI) {
      state.connected = computeConnected();
      window.gazeAPI.sendUpdate({ ...state });
    }
  }, REPORT_INTERVAL_MS);
}

window.addEventListener('DOMContentLoaded', () => {
  if (!window.gazeAPI) { setStatus('gazeAPI 없음 (preload 미연결)'); return; }

  window.gazeAPI.onInit(async ({ cameraDeviceId, cameraSource, cameraStreamUrl }) => {
    // 폰 스트림 모드
    if (cameraSource === 'stream' && cameraStreamUrl) {
      setStatus('폰 스트림 연결 중...');
      startStream(cameraStreamUrl);
      startReporting();
      return;
    }

    // 내장 웹캠 모드
    sourceMode = 'webcam';
    setStatus('카메라 시작 중...');
    const camOk = await startCamera(cameraDeviceId || null);
    if (!camOk) { startReporting(); return; }

    setStatus('얼굴 인식 모듈 로드 중...');
    try {
      await initLandmarker();
      setStatus('얼굴을 찾는 중...');
      setBadge('얼굴 찾는 중');
      startWebcamDetection();
    } catch (err) {
      // wasm/모델 로드 실패 등 → presence 폴백
      startPresenceFallback();
    }
    startReporting();
  });
});
