'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const petWindow = require('../src/main/petWindow.js');

describe('petWindow._poseForState — WORK/BREAK → 펫 자세', () => {
  it('WORK → study', () => {
    assert.equal(petWindow._poseForState('WORK'), 'study');
  });

  it('BREAK → sleep', () => {
    assert.equal(petWindow._poseForState('BREAK'), 'sleep');
  });

  it('알 수 없는 값 → sleep (안전 기본값)', () => {
    assert.equal(petWindow._poseForState(undefined), 'sleep');
    assert.equal(petWindow._poseForState(''), 'sleep');
  });
});
