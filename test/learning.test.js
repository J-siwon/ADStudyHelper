'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { CHAPTERS, getChapter } = require('../src/main/learning-catalog');
const {
  LEARNING_VERSION,
  applyCurriculumDetailAssessments,
  buildLearningPrompt,
  buildObjectiveFocusPrompt,
  buildReviewPrompt,
  calculateRating,
  completeObjectiveSession,
  completeStage,
  createDefaultLearningState,
  getSnapshot,
  gradeObjectiveReview,
  normalizeLearningState,
  startChapter,
} = require('../src/main/learning');

function startAndCompleteStage(state, chapterId, stageIndex, objectiveIds = [], now = new Date('2026-09-01T10:00:00')) {
  const chapter = getChapter(chapterId);
  const started = startChapter(state, chapterId, now);
  return completeStage(started, chapterId, chapter.stages[stageIndex].id, objectiveIds, {}, now).state;
}

function makeAssessment(chapterId) {
  const chapter = getChapter(chapterId);
  return {
    adapterId: 'manual-handoff', chapterId, overallSummary: '이전 학습',
    stageRecommendations: chapter.stages.map((stage) => ({ id: stage.id, completed: true, evidence: '단계 근거' })),
    objectiveRecommendations: chapter.objectives.map((objective) => ({ id: objective.id, completed: true, evidence: '목표 근거' })),
  };
}

describe('목표 중심 카탈로그와 RP', () => {
  it('40개 챕터와 200개 목표가 난이도와 고유 ID를 가진다', () => {
    assert.equal(CHAPTERS.length, 40);
    const objectives = CHAPTERS.flatMap((chapter) => chapter.objectives);
    assert.equal(objectives.length, 200);
    assert.equal(new Set(objectives.map((objective) => objective.id)).size, 200);
    assert.ok(objectives.every((objective) => ['basic', 'applied', 'advanced'].includes(objective.difficulty)));
    for (const difficulty of ['basic', 'applied', 'advanced']) {
      assert.ok(objectives.some((objective) => objective.difficulty === difficulty));
    }
  });

  it('기본 밸런스에서 목표 난이도의 합으로 최대 RP를 계산한다', () => {
    const snapshot = getSnapshot(createDefaultLearningState(), new Date('2026-09-01T10:00:00'));
    const objectives = CHAPTERS.flatMap((chapter) => chapter.objectives);
    const counts = objectives.reduce((result, objective) => ({
      ...result,
      [objective.difficulty]: result[objective.difficulty] + 1,
    }), { basic: 0, applied: 0, advanced: 0 });
    const expected = objectives
      .reduce((sum, objective) => sum + snapshot.balance.objectiveRp[objective.difficulty], 0);
    assert.deepEqual(counts, { basic: 20, applied: 151, advanced: 29 });
    assert.equal(expected, 4090);
    assert.equal(snapshot.rating.maxRp, expected);
    assert.equal(snapshot.rating.earnedRp, 0);
    assert.equal(snapshot.rating.tier.display, '브론즈 5');
    assert.equal(snapshot.rating.nextTier, '브론즈 4');
  });
});

describe('단계별 학습과 여러 챕터 진행', () => {
  it('두 챕터를 동시에 중간 진행 상태로 유지할 수 있다', () => {
    let state = startChapter(createDefaultLearningState(), 'cpp');
    state = startChapter(state, 'csharp');
    assert.equal(state.chapters.cpp.status, 'Learning');
    assert.equal(state.chapters.csharp.status, 'Learning');
    assert.equal(state.activeChapterId, 'csharp');
  });

  it('현재 단계만 순서대로 완료하고 목표 최초 달성에만 RP를 준다', () => {
    const chapter = getChapter('inventory');
    const objective = chapter.objectives[0];
    let state = startChapter(createDefaultLearningState(), chapter.id);
    assert.throws(() => completeStage(state, chapter.id, chapter.stages[1].id), /stage_out_of_order/);

    let result = completeStage(state, chapter.id, chapter.stages[0].id, [objective.id]);
    state = result.state;
    assert.deepEqual(result.newlyAchievedObjectiveIds, [objective.id]);
    const firstRp = calculateRating(state).earnedRp;
    assert.equal(firstRp, getSnapshot(state).balance.objectiveRp[objective.difficulty]);

    state = startChapter(state, chapter.id);
    result = completeStage(state, chapter.id, chapter.stages[1].id, [objective.id]);
    assert.deepEqual(result.newlyAchievedObjectiveIds, []);
    assert.equal(calculateRating(result.state).earnedRp, firstRp);
  });

  it('6단계가 끝나면 미달성 목표가 있어도 챕터 사이클을 완료한다', () => {
    const chapter = getChapter('game-math');
    let state = createDefaultLearningState();
    for (let index = 0; index < chapter.stages.length; index += 1) {
      state = startAndCompleteStage(state, chapter.id, index, index === 0 ? [chapter.objectives[0].id] : []);
    }
    assert.equal(state.chapters[chapter.id].status, 'Completed');
    assert.equal(state.chapters[chapter.id].checkedObjectiveIds.length, 1);

    const focused = completeObjectiveSession(state, chapter.id, chapter.objectives[1].id, '직접 계산 근거');
    assert.deepEqual(focused.newlyAchievedObjectiveIds, [chapter.objectives[1].id]);
    assert.equal(focused.state.chapters[chapter.id].checkedObjectiveIds.length, 2);
  });

  it('단계 프롬프트는 현재 단계만 진행하고 다음 단계는 예고로 끝낸다', () => {
    const prompt = buildLearningPrompt('inventory', 'principle');
    assert.match(prompt, /"원리 이해" 단계만 학습/);
    assert.match(prompt, /다음 학습 예고:/);
    assert.match(prompt, /현재 단계 밖의 다음 학습을 실제로 시작하지 마세요/);
    assert.match(prompt, /learning-stage-result\/v1/);
    assert.doesNotMatch(prompt, /ChatGPT|Claude|API key/i);
    assert.match(buildObjectiveFocusPrompt('inventory', 'inventory-objective-3'), /이 목표 하나만/);
  });
});

describe('마이그레이션과 이전 학습 가져오기', () => {
  it('v2 완료 시각과 목표 체크를 목표별 복습으로 옮긴다', () => {
    const chapter = getChapter('cpp');
    const state = normalizeLearningState({
      version: 2,
      chapters: {
        cpp: {
          status: 'Completed',
          checkedStageIds: chapter.stages.map((stage) => stage.id),
          checkedObjectiveIds: [chapter.objectives[0].id],
          completedAt: '2026-08-01T12:00:00.000Z',
          completionSource: 'learning_session',
        },
      },
    }, new Date('2026-09-01T10:00:00'));
    assert.equal(state.version, LEARNING_VERSION);
    assert.equal(state.chapters.cpp.objectiveProgress[chapter.objectives[0].id].review.dueDate, '2026-08-02');
    assert.equal(getSnapshot(state, new Date('2026-09-01T10:00:00')).rating.objectiveRatings[0].multiplier, 0.5);
  });

  it('여러 챕터의 가져온 단계와 목표를 독립적으로 적용하고 동일 RP를 준다', () => {
    const cpp = getChapter('cpp');
    const csharp = getChapter('csharp');
    const state = applyCurriculumDetailAssessments(
      createDefaultLearningState(),
      { chapterAssessments: [makeAssessment('cpp'), makeAssessment('csharp')] },
      [
        { chapterId: 'cpp', stageIds: ['discovery'], objectiveIds: [cpp.objectives[0].id], summary: '' },
        { chapterId: 'csharp', stageIds: ['discovery', 'principle'], objectiveIds: [csharp.objectives[0].id], summary: '' },
      ],
      new Date('2026-09-01T10:00:00')
    );
    assert.equal(state.chapters.cpp.status, 'Progress');
    assert.equal(state.chapters.csharp.status, 'Progress');
    assert.equal(calculateRating(state).achievedObjectives, 2);
  });
});

describe('목표별 복습과 레이팅 복구', () => {
  it('1·3·7·30일을 직전 정답일 기준으로 예약한다', () => {
    const chapter = getChapter('physics');
    const objectiveId = chapter.objectives[0].id;
    let state = startAndCompleteStage(createDefaultLearningState(), chapter.id, 0, [objectiveId], new Date('2026-09-01T10:00:00'));
    let review = state.chapters[chapter.id].objectiveProgress[objectiveId].review;
    assert.equal(review.dueDate, '2026-09-02');

    state = gradeObjectiveReview(state, chapter.id, objectiveId, 'correct', new Date('2026-09-02T12:00:00'));
    review = state.chapters[chapter.id].objectiveProgress[objectiveId].review;
    assert.equal(review.dueDate, '2026-09-05');
    state = gradeObjectiveReview(state, chapter.id, objectiveId, 'correct', new Date('2026-09-05T12:00:00'));
    assert.equal(state.chapters[chapter.id].objectiveProgress[objectiveId].review.dueDate, '2026-09-12');
    state = gradeObjectiveReview(state, chapter.id, objectiveId, 'correct', new Date('2026-09-12T12:00:00'));
    assert.equal(state.chapters[chapter.id].objectiveProgress[objectiveId].review.dueDate, '2026-10-12');
    state = gradeObjectiveReview(state, chapter.id, objectiveId, 'correct', new Date('2026-10-12T12:00:00'));
    assert.equal(state.chapters[chapter.id].objectiveProgress[objectiveId].review.phaseIndex, 4);
  });

  it('연체·부분정답·오답을 감점하고 즉시 정답 재복습으로 복구한다', () => {
    const chapter = getChapter('physics');
    const objective = chapter.objectives[0];
    let state = startAndCompleteStage(createDefaultLearningState(), chapter.id, 0, [objective.id], new Date('2026-09-01T10:00:00'));
    const baseRp = getSnapshot(state, new Date('2026-09-01T10:00:00')).balance.objectiveRp[objective.difficulty];
    assert.equal(calculateRating(state, new Date('2026-09-03T10:00:00')).effectiveRp, baseRp * 0.5);

    state = gradeObjectiveReview(state, chapter.id, objective.id, 'partial', new Date('2026-09-03T10:00:00'));
    assert.equal(calculateRating(state, new Date('2026-09-03T10:00:00')).effectiveRp, baseRp * 0.75);
    state = gradeObjectiveReview(state, chapter.id, objective.id, 'correct', new Date('2026-09-03T11:00:00'));
    assert.equal(calculateRating(state, new Date('2026-09-03T11:00:00')).effectiveRp, baseRp);
  });

  it('복습 프롬프트는 목표 하나를 판정 계약으로 평가한다', () => {
    const prompt = buildReviewPrompt('physics', 'physics-objective-1', '7일 복습', true);
    assert.match(prompt, /physics-objective-1/);
    assert.match(prompt, /즉시 재도전/);
    assert.match(prompt, /learning-review-assessment\/v1/);
  });
});

describe('주간 기습 질문과 티어', () => {
  function surpriseReadyState(count) {
    let state = createDefaultLearningState();
    const objectives = CHAPTERS.flatMap((chapter) => chapter.objectives.map((objective) => ({ chapter, objective }))).slice(0, count);
    objectives.forEach(({ chapter, objective }) => {
      state = completeObjectiveSession(state, chapter.id, objective.id, '근거', new Date('2026-08-01T10:00:00')).state;
      const review = state.chapters[chapter.id].objectiveProgress[objective.id].review;
      review.phaseIndex = 4;
      review.dueDate = null;
    });
    return state;
  }

  it('주당 7개를 배정하고 한 순환이 끝나기 전 남은 목표를 먼저 고른다', () => {
    let snapshot = getSnapshot(surpriseReadyState(8), new Date('2026-09-07T10:00:00'));
    const first = new Set(snapshot.reviews.surprise.assignments.map((item) => item.objectiveId));
    assert.equal(first.size, 7);
    snapshot = getSnapshot(snapshot.state, new Date('2026-09-14T10:00:00'));
    const second = new Set(snapshot.reviews.surprise.assignments.map((item) => item.objectiveId));
    assert.equal(second.size, 7);
    assert.ok([...second].some((id) => !first.has(id)));
  });

  it('앱을 열지 않은 주의 미제출 목표를 50%로 낮추고 복구 목록에 노출한다', () => {
    let snapshot = getSnapshot(surpriseReadyState(1), new Date('2026-09-07T10:00:00'));
    snapshot = getSnapshot(snapshot.state, new Date('2026-09-14T10:00:00'));
    assert.ok(snapshot.rating.penaltyRp > 0);
    assert.equal(snapshot.reviews.surprise.assignments.length, 1);
    const assignment = snapshot.reviews.surprise.assignments[0];
    const restored = gradeObjectiveReview(snapshot.state, assignment.chapterId, assignment.objectiveId, 'correct', new Date('2026-09-14T11:00:00'), 'surprise');
    assert.equal(calculateRating(restored, new Date('2026-09-14T11:00:00')).penaltyRp, 0);
  });

  it('대상 목표가 7개보다 적으면 중복 없이 배정하고 부분정답을 즉시 재도전할 수 있다', () => {
    let snapshot = getSnapshot(surpriseReadyState(3), new Date('2026-09-07T10:00:00'));
    assert.equal(snapshot.reviews.surprise.assignments.length, 3);
    assert.equal(new Set(snapshot.reviews.surprise.assignments.map((item) => item.objectiveId)).size, 3);

    const assignment = snapshot.reviews.surprise.assignments[0];
    let state = gradeObjectiveReview(snapshot.state, assignment.chapterId, assignment.objectiveId, 'partial', new Date('2026-09-07T11:00:00'), 'surprise');
    snapshot = getSnapshot(state, new Date('2026-09-07T11:00:00'));
    assert.equal(snapshot.reviews.surprise.assignments.find((item) => item.objectiveId === assignment.objectiveId).multiplier, 0.75);

    state = gradeObjectiveReview(snapshot.state, assignment.chapterId, assignment.objectiveId, 'correct', new Date('2026-09-07T12:00:00'), 'surprise');
    assert.equal(getSnapshot(state, new Date('2026-09-07T12:00:00')).reviews.surprise.assignments.find((item) => item.objectiveId === assignment.objectiveId).multiplier, 1);
  });

  it('모든 목표 달성과 100% 유효 RP에서만 챌린저가 된다', () => {
    let state = surpriseReadyState(200);
    let rating = calculateRating(state, new Date('2026-09-01T10:00:00'));
    assert.equal(rating.tier.key, 'challenger');
    const first = CHAPTERS[0].objectives[0];
    state.chapters[CHAPTERS[0].id].objectiveProgress[first.id].review.multiplier = 0.5;
    rating = calculateRating(state, new Date('2026-09-01T10:00:00'));
    assert.equal(rating.tier.key, 'master');
    assert.equal(rating.tier.division, null);
  });
});
