'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  DEFAULT_LEARNING_BALANCE,
  mergeLearningBalance,
  validateLearningBalance,
} = require('../src/main/learning-balance');

describe('학습 밸런스 설정', () => {
  it('기본 설정을 검증하고 일부 값만 안전하게 덮어쓴다', () => {
    const validated = validateLearningBalance(JSON.parse(JSON.stringify(DEFAULT_LEARNING_BALANCE)));
    assert.equal(validated.objectiveRp.advanced, 30);
    const merged = mergeLearningBalance({ objectiveRp: { applied: 25, advanced: 40 } });
    assert.deepEqual(merged.objectiveRp, { basic: 10, applied: 25, advanced: 40 });
  });

  it('난이도 RP 역전과 티어 경계 역전을 거부한다', () => {
    assert.throws(() => mergeLearningBalance({ objectiveRp: { basic: 30 } }), /objective_rp_order/);
    assert.throws(() => mergeLearningBalance({ tierStarts: { gold: 0.05 } }), /tier_order/);
  });

  it('복습 간격과 주간 질문 수의 비정상 범위를 거부한다', () => {
    assert.throws(() => mergeLearningBalance({ reviewIntervalsDays: [1, 3, 7] }), /review_intervals/);
    assert.throws(() => mergeLearningBalance({ surpriseQuestionsPerWeek: 0 }), /surprise_count/);
  });
});
