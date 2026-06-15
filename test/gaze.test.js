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
