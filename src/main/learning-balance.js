'use strict';

const DIFFICULTIES = Object.freeze(['basic', 'applied', 'advanced']);

const DEFAULT_LEARNING_BALANCE = Object.freeze({
  schemaVersion: 1,
  objectiveRp: Object.freeze({ basic: 10, applied: 20, advanced: 30 }),
  tierStarts: Object.freeze({
    bronze: 0,
    silver: 0.08,
    gold: 0.20,
    platinum: 0.38,
    diamond: 0.62,
    master: 0.90,
    challenger: 1,
  }),
  divisionsPerTier: 5,
  reviewMultipliers: Object.freeze({ correct: 1, partial: 0.75, incorrect: 0.5, overdue: 0.5 }),
  reviewIntervalsDays: Object.freeze([1, 3, 7, 30]),
  surpriseQuestionsPerWeek: 7,
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, errorCode) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(errorCode);
  return number;
}

function validateLearningBalance(value) {
  if (!value || typeof value !== 'object') throw new Error('learning_balance_invalid');
  if (value.schemaVersion !== 1) throw new Error('learning_balance_schema_unsupported');

  const objectiveRp = {};
  DIFFICULTIES.forEach((difficulty) => {
    const rp = finiteNumber(value.objectiveRp && value.objectiveRp[difficulty], 'learning_balance_objective_rp_invalid');
    if (!Number.isInteger(rp) || rp <= 0) throw new Error('learning_balance_objective_rp_invalid');
    objectiveRp[difficulty] = rp;
  });
  if (!(objectiveRp.basic < objectiveRp.applied && objectiveRp.applied < objectiveRp.advanced)) {
    throw new Error('learning_balance_objective_rp_order_invalid');
  }

  const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'challenger'];
  const tierStarts = {};
  tierOrder.forEach((tier) => {
    const threshold = finiteNumber(value.tierStarts && value.tierStarts[tier], 'learning_balance_tier_invalid');
    if (threshold < 0 || threshold > 1) throw new Error('learning_balance_tier_invalid');
    tierStarts[tier] = threshold;
  });
  if (tierStarts.bronze !== 0 || tierStarts.challenger !== 1) throw new Error('learning_balance_tier_edge_invalid');
  for (let index = 1; index < tierOrder.length; index += 1) {
    if (tierStarts[tierOrder[index]] <= tierStarts[tierOrder[index - 1]]) {
      throw new Error('learning_balance_tier_order_invalid');
    }
  }

  const divisionsPerTier = finiteNumber(value.divisionsPerTier, 'learning_balance_divisions_invalid');
  if (!Number.isInteger(divisionsPerTier) || divisionsPerTier < 1 || divisionsPerTier > 10) {
    throw new Error('learning_balance_divisions_invalid');
  }

  const reviewMultipliers = {};
  ['correct', 'partial', 'incorrect', 'overdue'].forEach((key) => {
    const multiplier = finiteNumber(value.reviewMultipliers && value.reviewMultipliers[key], 'learning_balance_multiplier_invalid');
    if (multiplier < 0 || multiplier > 1) throw new Error('learning_balance_multiplier_invalid');
    reviewMultipliers[key] = multiplier;
  });
  if (reviewMultipliers.correct !== 1
    || reviewMultipliers.partial > reviewMultipliers.correct
    || reviewMultipliers.incorrect > reviewMultipliers.partial) {
    throw new Error('learning_balance_multiplier_order_invalid');
  }

  if (!Array.isArray(value.reviewIntervalsDays) || value.reviewIntervalsDays.length !== 4) {
    throw new Error('learning_balance_review_intervals_invalid');
  }
  const reviewIntervalsDays = value.reviewIntervalsDays.map((entry) => finiteNumber(entry, 'learning_balance_review_intervals_invalid'));
  if (reviewIntervalsDays.some((entry) => !Number.isInteger(entry) || entry <= 0)) {
    throw new Error('learning_balance_review_intervals_invalid');
  }

  const surpriseQuestionsPerWeek = finiteNumber(value.surpriseQuestionsPerWeek, 'learning_balance_surprise_count_invalid');
  if (!Number.isInteger(surpriseQuestionsPerWeek) || surpriseQuestionsPerWeek < 1 || surpriseQuestionsPerWeek > 50) {
    throw new Error('learning_balance_surprise_count_invalid');
  }

  return {
    schemaVersion: 1,
    objectiveRp,
    tierStarts,
    divisionsPerTier,
    reviewMultipliers,
    reviewIntervalsDays,
    surpriseQuestionsPerWeek,
  };
}

function mergeLearningBalance(value) {
  if (!value || typeof value !== 'object') return clone(DEFAULT_LEARNING_BALANCE);
  return validateLearningBalance({
    ...clone(DEFAULT_LEARNING_BALANCE),
    ...value,
    objectiveRp: { ...DEFAULT_LEARNING_BALANCE.objectiveRp, ...(value.objectiveRp || {}) },
    tierStarts: { ...DEFAULT_LEARNING_BALANCE.tierStarts, ...(value.tierStarts || {}) },
    reviewMultipliers: { ...DEFAULT_LEARNING_BALANCE.reviewMultipliers, ...(value.reviewMultipliers || {}) },
    reviewIntervalsDays: value.reviewIntervalsDays || DEFAULT_LEARNING_BALANCE.reviewIntervalsDays,
  });
}

module.exports = {
  DEFAULT_LEARNING_BALANCE,
  DIFFICULTIES,
  mergeLearningBalance,
  validateLearningBalance,
};
