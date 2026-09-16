'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// gazeManager.js의 순수 로직을 인라인으로 재현 (Electron API 없이 테스트)
// gazeManager._shouldForceBreak 와 동일한 구현
function shouldForceBreak({ facePresent, gazeOnScreen }) {
  return !facePresent || !gazeOnScreen;
}

describe('shouldForceBreak() — gaze → BREAK 판정', () => {
  it('facePresent=true, gazeOnScreen=true → BREAK 아님', () => {
    assert.equal(shouldForceBreak({ facePresent: true, gazeOnScreen: true }), false);
  });

  it('facePresent=false, gazeOnScreen=true → BREAK 강제', () => {
    assert.equal(shouldForceBreak({ facePresent: false, gazeOnScreen: true }), true);
  });

  it('facePresent=true, gazeOnScreen=false → BREAK 강제', () => {
    assert.equal(shouldForceBreak({ facePresent: true, gazeOnScreen: false }), true);
  });

  it('facePresent=false, gazeOnScreen=false → BREAK 강제', () => {
    assert.equal(shouldForceBreak({ facePresent: false, gazeOnScreen: false }), true);
  });
});

describe('gaze 상태 전이 시나리오', () => {
  it('카메라 미연결(facePresent=false)이면 항상 BREAK', () => {
    const states = [
      { facePresent: false, gazeOnScreen: false },
      { facePresent: false, gazeOnScreen: true },
    ];
    for (const s of states) {
      assert.equal(shouldForceBreak(s), true, JSON.stringify(s));
    }
  });

  it('얼굴 있고 화면 주시 중이면 BREAK 강제 없음', () => {
    assert.equal(shouldForceBreak({ facePresent: true, gazeOnScreen: true }), false);
  });

  it('화면 밖을 보면(gazeOnScreen=false) BREAK 강제', () => {
    assert.equal(shouldForceBreak({ facePresent: true, gazeOnScreen: false }), true);
  });

  it('연속 WORK 상태: 모두 facePresent+gazeOnScreen=true', () => {
    const ticks = Array.from({ length: 5 }, () => ({ facePresent: true, gazeOnScreen: true }));
    const results = ticks.map(shouldForceBreak);
    assert.ok(results.every((r) => r === false), 'WORK 상태에서 BREAK 강제 없어야 함');
  });

  it('중간에 얼굴 이탈 → BREAK 강제 발생', () => {
    const ticks = [
      { facePresent: true, gazeOnScreen: true },
      { facePresent: true, gazeOnScreen: true },
      { facePresent: false, gazeOnScreen: false }, // 이탈
      { facePresent: false, gazeOnScreen: false },
    ];
    const results = ticks.map(shouldForceBreak);
    assert.equal(results[0], false);
    assert.equal(results[1], false);
    assert.equal(results[2], true);
    assert.equal(results[3], true);
  });
});

// 실제 gazeManager.js 모듈을 require해 카메라 소스 순수 로직을 검증
// (gazeManager는 Electron API를 load 시 실행하지 않아 헤드리스 require 가능)
const gazeManager = require('../src/main/gazeManager');

describe('_createGazeBreakGate() — 5초 연속 이탈 후 BREAK', () => {
  function createGate() {
    let now = 0;
    return {
      gate: gazeManager._createGazeBreakGate({
        delayMs: gazeManager._GAZE_BREAK_DELAY_MS,
        now: () => now,
      }),
      setNow(value) { now = value; },
    };
  }

  it('눈 깜빡임처럼 5초 미만 얼굴 미감지는 BREAK로 처리하지 않는다', () => {
    const clock = createGate();
    const missingFace = { facePresent: false, gazeOnScreen: false, connected: true };

    assert.equal(clock.gate.update(missingFace), false);
    clock.setNow(4999);
    assert.equal(clock.gate.update(missingFace), false);
  });

  it('얼굴 미감지 또는 화면 밖 응시가 연속 5초면 BREAK로 처리한다', () => {
    const missingFace = createGate();
    assert.equal(missingFace.gate.update({ facePresent: false, gazeOnScreen: false, connected: true }), false);
    missingFace.setNow(5000);
    assert.equal(missingFace.gate.update({ facePresent: false, gazeOnScreen: false, connected: true }), true);

    const lookingAway = createGate();
    assert.equal(lookingAway.gate.update({ facePresent: true, gazeOnScreen: false, connected: true }), false);
    lookingAway.setNow(5000);
    assert.equal(lookingAway.gate.update({ facePresent: true, gazeOnScreen: false, connected: true }), true);
  });

  it('5초 안에 화면을 다시 보면 이탈 누적을 초기화한다', () => {
    const clock = createGate();
    const lookingAway = { facePresent: true, gazeOnScreen: false, connected: true };
    const lookingAtScreen = { facePresent: true, gazeOnScreen: true, connected: true };

    assert.equal(clock.gate.update(lookingAway), false);
    clock.setNow(4000);
    assert.equal(clock.gate.update(lookingAtScreen), false);

    clock.setNow(5000);
    assert.equal(clock.gate.update(lookingAway), false);
    clock.setNow(9999);
    assert.equal(clock.gate.update(lookingAway), false);
    clock.setNow(10000);
    assert.equal(clock.gate.update(lookingAway), true);
  });

  it('카메라 연결 끊김은 BREAK를 강제하지 않고 이탈 누적도 초기화한다', () => {
    const clock = createGate();
    const lookingAway = { facePresent: true, gazeOnScreen: false, connected: true };

    assert.equal(clock.gate.update(lookingAway), false);
    clock.setNow(5000);
    assert.equal(clock.gate.update({ facePresent: false, gazeOnScreen: false, connected: false }), false);

    clock.setNow(6000);
    assert.equal(clock.gate.update(lookingAway), false);
    clock.setNow(10999);
    assert.equal(clock.gate.update(lookingAway), false);
    clock.setNow(11000);
    assert.equal(clock.gate.update(lookingAway), true);
  });
});

describe('_isValidStreamUrl() — 스트림 URL 유효성', () => {
  it('http URL은 유효', () => {
    assert.equal(gazeManager._isValidStreamUrl('http://192.168.0.5:8080/video'), true);
  });
  it('https URL은 유효', () => {
    assert.equal(gazeManager._isValidStreamUrl('https://cam.local/stream'), true);
  });
  it('앞뒤 공백은 무시하고 판정', () => {
    assert.equal(gazeManager._isValidStreamUrl('  http://x/y  '), true);
  });
  it('빈 문자열은 무효', () => {
    assert.equal(gazeManager._isValidStreamUrl(''), false);
  });
  it('http(s)가 아닌 스킴은 무효', () => {
    assert.equal(gazeManager._isValidStreamUrl('ftp://x/y'), false);
    assert.equal(gazeManager._isValidStreamUrl('192.168.0.5:8080'), false);
  });
  it('문자열이 아니면 무효', () => {
    assert.equal(gazeManager._isValidStreamUrl(null), false);
    assert.equal(gazeManager._isValidStreamUrl(undefined), false);
    assert.equal(gazeManager._isValidStreamUrl(123), false);
  });
});

describe('_pickCameraSource() — 소스 모드 결정', () => {
  it('stream 소스 + 유효 URL → stream 모드', () => {
    const r = gazeManager._pickCameraSource({
      cameraSource: 'stream',
      cameraStreamUrl: 'http://192.168.0.5:8080/video',
    });
    assert.equal(r.mode, 'stream');
    assert.equal(r.streamUrl, 'http://192.168.0.5:8080/video');
    assert.equal(r.deviceId, null);
  });

  it('stream 소스이지만 URL 무효 → webcam 폴백', () => {
    const r = gazeManager._pickCameraSource({ cameraSource: 'stream', cameraStreamUrl: '' });
    assert.equal(r.mode, 'webcam');
  });

  it('webcam 소스 → deviceId 전달', () => {
    const r = gazeManager._pickCameraSource({ cameraSource: 'webcam', cameraDeviceId: 'cam-1' });
    assert.equal(r.mode, 'webcam');
    assert.equal(r.deviceId, 'cam-1');
    assert.equal(r.streamUrl, '');
  });

  it('설정 없음/빈 객체 → webcam 기본', () => {
    assert.equal(gazeManager._pickCameraSource({}).mode, 'webcam');
    assert.equal(gazeManager._pickCameraSource(undefined).mode, 'webcam');
  });

  it('stream URL 앞뒤 공백은 trim 되어 반환', () => {
    const r = gazeManager._pickCameraSource({
      cameraSource: 'stream',
      cameraStreamUrl: '  http://x/y  ',
    });
    assert.equal(r.streamUrl, 'http://x/y');
  });
});

describe('_shouldForceBreak() — connected 폴백 (실모듈)', () => {
  it('connected=false면 얼굴 없어도 BREAK 강제 안 함 (크롬 확장 폴백)', () => {
    assert.equal(
      gazeManager._shouldForceBreak({ facePresent: false, gazeOnScreen: false, connected: false }),
      false
    );
  });

  it('connected=true + 얼굴 이탈 → BREAK 강제 (자리비움)', () => {
    assert.equal(
      gazeManager._shouldForceBreak({ facePresent: false, gazeOnScreen: false, connected: true }),
      true
    );
  });

  it('connected=true + 얼굴 있고 화면 주시 → BREAK 강제 없음', () => {
    assert.equal(
      gazeManager._shouldForceBreak({ facePresent: true, gazeOnScreen: true, connected: true }),
      false
    );
  });

  it('connected=true + 화면 밖 응시 → BREAK 강제', () => {
    assert.equal(
      gazeManager._shouldForceBreak({ facePresent: true, gazeOnScreen: false, connected: true }),
      true
    );
  });

  it('connected 미지정(undefined)은 하위호환: 얼굴 기준 판정', () => {
    assert.equal(
      gazeManager._shouldForceBreak({ facePresent: false, gazeOnScreen: false }),
      true
    );
    assert.equal(
      gazeManager._shouldForceBreak({ facePresent: true, gazeOnScreen: true }),
      false
    );
  });
});
