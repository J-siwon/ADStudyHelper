'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeGaze, _IDX } = require('../src/shared/gazeMath.js');

// 478개 랜드마크 배열 생성 (기본 중앙 0.5), overrides로 특정 인덱스 좌표 지정
function makeLandmarks(overrides) {
  const lm = [];
  for (let i = 0; i < 478; i++) lm.push({ x: 0.5, y: 0.5, z: 0 });
  Object.keys(overrides || {}).forEach((idx) => {
    lm[idx] = Object.assign({ z: 0 }, lm[idx], overrides[idx]);
  });
  return lm;
}

// 양안 시선이 정면(중앙)을 향하도록 코너/홍채 배치
function centeredEyes() {
  const R = _IDX.rightEye;
  const L = _IDX.leftEye;
  return makeLandmarks({
    // 오른쪽 눈: inner.x=0.6, outer.x=0.4 → iris.x=0.5 ⇒ h=0.5
    [R.inner]: { x: 0.6, y: 0.5 },
    [R.outer]: { x: 0.4, y: 0.5 },
    [R.top]: { x: 0.5, y: 0.4 },
    [R.bottom]: { x: 0.5, y: 0.6 },
    [R.iris]: { x: 0.5, y: 0.5 },
    // 왼쪽 눈: inner.x=0.4, outer.x=0.6 → iris.x=0.5 ⇒ h=0.5
    [L.inner]: { x: 0.4, y: 0.5 },
    [L.outer]: { x: 0.6, y: 0.5 },
    [L.top]: { x: 0.5, y: 0.4 },
    [L.bottom]: { x: 0.5, y: 0.6 },
    [L.iris]: { x: 0.5, y: 0.5 },
  });
}

describe('gazeMath.computeGaze', () => {
  it('랜드마크가 부족하면 present=false, onScreen=false', () => {
    const r = computeGaze([]);
    assert.equal(r.present, false);
    assert.equal(r.onScreen, false);
  });

  it('홍채가 중앙이면 present=true, onScreen=true, hRatio≈0.5', () => {
    const r = computeGaze(centeredEyes());
    assert.equal(r.present, true);
    assert.equal(r.onScreen, true);
    assert.ok(Math.abs(r.hRatio - 0.5) < 1e-9);
    assert.ok(Math.abs(r.vRatio - 0.5) < 1e-9);
  });

  it('시선이 수평으로 크게 돌아가면 onScreen=false', () => {
    const lm = centeredEyes();
    const R = _IDX.rightEye;
    const L = _IDX.leftEye;
    // 두 눈 홍채를 한쪽 코너 쪽으로 이동 (h가 0.5에서 크게 벗어남)
    lm[R.iris] = { x: 0.41, y: 0.5 }; // inner0.6,outer0.4 → h≈0.95
    lm[L.iris] = { x: 0.59, y: 0.5 }; // inner0.4,outer0.6 → h≈0.95
    const r = computeGaze(lm);
    assert.equal(r.present, true);
    assert.equal(r.onScreen, false);
  });

  it('시선이 수직으로 크게 내려가면 onScreen=false', () => {
    const lm = centeredEyes();
    const R = _IDX.rightEye;
    const L = _IDX.leftEye;
    lm[R.iris] = { x: 0.5, y: 0.59 }; // top0.4,bottom0.6 → v≈0.95
    lm[L.iris] = { x: 0.5, y: 0.59 };
    const r = computeGaze(lm);
    assert.equal(r.onScreen, false);
  });

  it('임계값을 키우면 같은 이탈도 onScreen=true로 허용', () => {
    const lm = centeredEyes();
    const R = _IDX.rightEye;
    const L = _IDX.leftEye;
    lm[R.iris] = { x: 0.45, y: 0.5 }; // h≈0.75 (|0.25|)
    lm[L.iris] = { x: 0.55, y: 0.5 };
    assert.equal(computeGaze(lm).onScreen, false);            // 기본 0.20 → 이탈
    assert.equal(computeGaze(lm, { hThreshold: 0.3 }).onScreen, true); // 0.30 → 허용
  });
});
