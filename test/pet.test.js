'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const petWindow = require('../src/main/petWindow.js');

describe('petWindow._poseForState — (집중상태 × Claude 작업여부) → 펫 자세', () => {
  it('WORK + Claude 대기 → study', () => {
    assert.equal(petWindow._poseForState('WORK', false), 'study');
    assert.equal(petWindow._poseForState('WORK'), 'study'); // 인자 생략 = 대기
  });

  it('WORK + Claude 작업중 → coding', () => {
    assert.equal(petWindow._poseForState('WORK', true), 'coding');
  });

  it('BREAK + Claude 대기 → sleep', () => {
    assert.equal(petWindow._poseForState('BREAK', false), 'sleep');
    assert.equal(petWindow._poseForState('BREAK'), 'sleep');
  });

  it('BREAK + Claude 작업중 → deskSleep', () => {
    assert.equal(petWindow._poseForState('BREAK', true), 'deskSleep');
  });

  it('알 수 없는 상태 → sleep 계열 (안전 기본값)', () => {
    assert.equal(petWindow._poseForState(undefined, false), 'sleep');
    assert.equal(petWindow._poseForState('', true), 'deskSleep');
  });
});
