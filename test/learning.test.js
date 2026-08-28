'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { CHAPTERS, getChapter } = require('../src/main/learning-catalog');
const {
  ACTIVE_CHAPTER_ID,
  REVIEW_OFFSETS,
  applyCurriculumCoverage,
  applyCurriculumDetailAssessments,
  applyPriorLearningAssessment,
  buildLearningPrompt,
  cancelChapter,
  completeChapter,
  createDefaultLearningState,
  getSnapshot,
  normalizeLearningState,
  startChapter,
  updateChecklist,
} = require('../src/main/learning');

function completeChecklist(state, chapterId) {
  const chapter = getChapter(chapterId);
  return updateChecklist(state, chapterId, {
    checkedStageIds: chapter.stages.map((stage) => stage.id),
    checkedObjectiveIds: chapter.objectives.map((objective) => objective.id),
  });
}

function assessmentFor(chapterId) {
  const chapter = getChapter(chapterId);
  return {
    contract: 'learning-assessment/v1',
    adapterId: 'manual-handoff',
    chapterId,
    overallSummary: `${chapter.title} 이전 학습 요약`,
    stageRecommendations: chapter.stages.map((stage) => ({ id: stage.id, completed: true, evidence: `${stage.title} 근거` })),
    objectiveRecommendations: chapter.objectives.map((objective) => ({ id: objective.id, completed: true, evidence: `${objective.description} 근거` })),
  };
}

describe('전체 학습 카탈로그와 기본 상태', () => {
  it('노출된 40개 챕터가 모두 Ready 상태다', () => {
    const state = createDefaultLearningState();
    assert.equal(CHAPTERS.length, 40);
    assert.equal(Object.keys(state.chapters).length, 40);
    assert.ok(CHAPTERS.every((chapter) => state.chapters[chapter.id].status === 'Ready'));
  });

  it('모든 챕터에 고유 목표 5개, 맞춤 단계 6개와 학습 프롬프트가 있다', () => {
    const prompts = new Set();
    for (const chapter of CHAPTERS) {
      assert.equal(chapter.objectives.length, 5, chapter.id);
      assert.equal(chapter.stages.length, 6, chapter.id);
      assert.equal(new Set(chapter.objectives.map((objective) => objective.id)).size, 5, chapter.id);
      const prompt = buildLearningPrompt(chapter.id);
      assert.match(prompt, new RegExp(chapter.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.ok(prompt.includes(chapter.learningPlan.final));
      prompts.add(prompt);
    }
    assert.equal(prompts.size, CHAPTERS.length);
  });

  it('전체 6개 영역과 40개 제공 챕터 진행도를 반환한다', () => {
    const snapshot = getSnapshot(createDefaultLearningState());
    assert.equal(snapshot.curriculum.length, 6);
    assert.equal(snapshot.chapterCatalog.length, 40);
    assert.deepEqual(snapshot.releasedProgress, { completed: 0, total: 40 });
  });

  it('모든 챕터가 커리큘럼에 중복이나 누락 없이 한 번씩 노출된다', () => {
    const snapshot = getSnapshot(createDefaultLearningState());
    const curriculumIds = snapshot.curriculum.flatMap((area) => area.topics.flatMap((topic) => (
      topic.chapters ? topic.chapters.map((chapter) => chapter.id) : [topic.id]
    )));
    assert.equal(new Set(curriculumIds).size, curriculumIds.length);
    assert.deepEqual(curriculumIds.toSorted(), CHAPTERS.map((chapter) => chapter.id).toSorted());
  });

  it('v1 Alignment 체크를 새 ID로 옮기고 체험용 완료는 Ready로 되돌린다', () => {
    const state = normalizeLearningState({
      version: 1,
      activeChapterId: ACTIVE_CHAPTER_ID,
      chapters: {
        'data-type': { status: 'Completed', completionSource: 'demo_seed' },
        [ACTIVE_CHAPTER_ID]: {
          status: 'Learning',
          checkedStageIds: ['discovery'],
          checkedObjectiveIds: ['define-alignment'],
        },
      },
    });
    assert.equal(state.version, 2);
    assert.equal(state.chapters['data-type'].status, 'Ready');
    assert.equal(state.activeChapterId, ACTIVE_CHAPTER_ID);
    assert.deepEqual(state.chapters[ACTIVE_CHAPTER_ID].checkedObjectiveIds, ['memory-alignment-objective-1']);
  });
});

describe('다중 챕터 세션과 수동 체크', () => {
  it('어떤 챕터든 시작할 수 있고 해당 챕터를 활성 세션으로 저장한다', () => {
    const now = new Date('2026-08-28T10:00:00.000Z');
    const state = startChapter(createDefaultLearningState(), 'cpp', now);
    assert.equal(state.activeChapterId, 'cpp');
    assert.equal(state.chapters.cpp.status, 'Learning');
    assert.equal(state.chapters.cpp.startedAt, now.toISOString());
  });

  it('동시에 두 챕터를 시작하지 못한다', () => {
    const state = startChapter(createDefaultLearningState(), 'cpp');
    assert.throws(() => startChapter(state, 'csharp'), /another_session_active/);
  });

  it('챕터별 목표 ID만 저장하고 다른 챕터 목표 ID는 거부한다', () => {
    let state = startChapter(createDefaultLearningState(), 'cpp');
    state = updateChecklist(state, 'cpp', {
      checkedStageIds: ['discovery', 'discovery'],
      checkedObjectiveIds: ['cpp-objective-1'],
    });
    assert.deepEqual(state.chapters.cpp.checkedStageIds, ['discovery']);
    assert.throws(
      () => updateChecklist(state, 'cpp', { checkedObjectiveIds: ['csharp-objective-1'] }),
      /invalid_objective_id/
    );
  });

  it('학습 취소 시 체크한 단계와 목표를 Progress로 보존하고 활성 세션만 종료한다', () => {
    const startedAt = new Date('2026-08-29T01:00:00.000Z');
    let state = startChapter(createDefaultLearningState(), 'memory-alignment', startedAt);
    state = updateChecklist(state, 'memory-alignment', {
      checkedStageIds: ['discovery', 'principle'],
      checkedObjectiveIds: ['memory-alignment-objective-1'],
    });

    const canceled = cancelChapter(state, 'memory-alignment');
    const chapter = canceled.chapters['memory-alignment'];
    assert.equal(canceled.activeChapterId, null);
    assert.equal(chapter.status, 'Progress');
    assert.equal(chapter.startedAt, startedAt.toISOString());
    assert.deepEqual(chapter.checkedStageIds, ['discovery', 'principle']);
    assert.deepEqual(chapter.checkedObjectiveIds, ['memory-alignment-objective-1']);
  });

  it('체크하지 않은 학습을 취소하면 Ready로 돌아가고 시작 시각을 비운다', () => {
    const state = startChapter(createDefaultLearningState(), 'cpp');
    const canceled = cancelChapter(state, 'cpp');
    assert.equal(canceled.activeChapterId, null);
    assert.equal(canceled.chapters.cpp.status, 'Ready');
    assert.equal(canceled.chapters.cpp.startedAt, null);
    assert.throws(() => cancelChapter(canceled, 'cpp'), /chapter_not_learning/);
  });
});

describe('완료와 복습 일정', () => {
  it('체크가 하나라도 부족하면 완료를 거부한다', () => {
    const state = startChapter(createDefaultLearningState(), 'game-math');
    assert.throws(() => completeChapter(state, 'game-math'), /checklist_incomplete/);
  });

  it('아무 챕터나 완료하고 1/3/7/30일 복습을 등록한다', () => {
    let state = startChapter(createDefaultLearningState(), 'game-math');
    state = completeChecklist(state, 'game-math');
    const completed = completeChapter(state, 'game-math', '  벡터 학습 요약  ', new Date(2026, 7, 28, 12));
    const chapter = completed.chapters['game-math'];
    assert.equal(chapter.status, 'Completed');
    assert.equal(chapter.completionSource, 'learning_session');
    assert.equal(chapter.sessionSummary, '벡터 학습 요약');
    assert.deepEqual(chapter.reviewSchedules.map((review) => review.offsetDays), REVIEW_OFFSETS);
    assert.deepEqual(chapter.reviewSchedules.map((review) => review.dueDate), [
      '2026-08-29', '2026-08-31', '2026-09-04', '2026-09-27',
    ]);
    const snapshot = getSnapshot(completed, new Date(2026, 7, 29));
    assert.equal(snapshot.reviews.due[0].chapterId, 'game-math');
    assert.equal(snapshot.releasedProgress.completed, 1);
  });
});

describe('이전 학습 적용', () => {
  it('사용자가 승인한 일부 단계와 목표만 적용하고 세션을 이어간다', () => {
    const assessment = assessmentFor('profiling');
    const state = applyPriorLearningAssessment(
      createDefaultLearningState(),
      'profiling',
      assessment,
      { stageIds: ['discovery', 'principle'], objectiveIds: ['profiling-objective-1'], summary: '부분 학습' },
      new Date('2026-08-28T10:00:00.000Z')
    );
    const chapter = state.chapters.profiling;
    assert.equal(chapter.status, 'Learning');
    assert.equal(state.activeChapterId, 'profiling');
    assert.deepEqual(chapter.checkedStageIds, ['discovery', 'principle']);
    assert.deepEqual(chapter.checkedObjectiveIds, ['profiling-objective-1']);
    assert.equal(chapter.importHistory[0].adapterId, 'manual-handoff');
    assert.equal(chapter.sessionSummary, '');
  });

  it('전체 범위 분석은 경험 수준만 저장하고 상태와 체크리스트를 바꾸지 않는다', () => {
    const state = applyCurriculumCoverage(
      createDefaultLearningState(),
      {
        adapterId: 'manual-handoff',
        chapterAssessments: [{
          chapterId: 'cpp', level: 'applied', confidence: 0.87,
          evidence: 'RAII를 프로젝트에 적용함', summary: '수명 관리 경험',
        }],
      },
      ['cpp'],
      new Date('2026-08-28T10:00:00.000Z')
    );
    assert.equal(state.chapters.cpp.status, 'Ready');
    assert.deepEqual(state.chapters.cpp.checkedStageIds, []);
    assert.equal(state.chapters.cpp.priorCoverage.level, 'applied');
    assert.equal(state.chapters.cpp.priorCoverage.confidence, 0.87);
    assert.equal(state.chapters.cpp.priorCoverage.assessedAt, '2026-08-28T10:00:00.000Z');
  });

  it('전체 상세 판정의 부분 진행도를 여러 챕터에 Progress로 함께 저장한다', () => {
    const batch = {
      chapterAssessments: [assessmentFor('cpp'), assessmentFor('csharp')],
    };
    const state = applyCurriculumDetailAssessments(
      createDefaultLearningState(),
      batch,
      [
        { chapterId: 'cpp', stageIds: ['discovery'], objectiveIds: ['cpp-objective-1'], summary: 'C++ 부분' },
        { chapterId: 'csharp', stageIds: ['discovery', 'principle'], objectiveIds: ['csharp-objective-1'], summary: 'C# 부분' },
      ]
    );
    assert.equal(state.activeChapterId, null);
    assert.equal(state.chapters.cpp.status, 'Progress');
    assert.equal(state.chapters.csharp.status, 'Progress');
    assert.deepEqual(state.chapters.cpp.checkedObjectiveIds, ['cpp-objective-1']);
    assert.deepEqual(normalizeLearningState(state).chapters.csharp.checkedStageIds, ['discovery', 'principle']);
  });

  it('전체 상세 판정에서 모두 충족한 챕터만 완료하고 기존 활성 세션은 유지한다', () => {
    const portfolio = getChapter('portfolio');
    let current = startChapter(createDefaultLearningState(), 'cpp');
    current = applyCurriculumDetailAssessments(
      current,
      { chapterAssessments: [assessmentFor('portfolio')] },
      [{
        chapterId: 'portfolio',
        stageIds: portfolio.stages.map((stage) => stage.id),
        objectiveIds: portfolio.objectives.map((objective) => objective.id),
        summary: '포트폴리오 전체 경험',
      }],
      new Date(2026, 7, 28)
    );
    assert.equal(current.activeChapterId, 'cpp');
    assert.equal(current.chapters.cpp.status, 'Learning');
    assert.equal(current.chapters.portfolio.status, 'Completed');
    assert.equal(current.chapters.portfolio.completionSource, 'curriculum_prior_learning_import');
    assert.equal(current.chapters.portfolio.reviewSchedules.length, 4);
  });

  it('모든 항목을 승인하면 이전 학습으로 완료하고 복습을 등록한다', () => {
    const chapterDefinition = getChapter('portfolio');
    const assessment = assessmentFor('portfolio');
    const state = applyPriorLearningAssessment(
      createDefaultLearningState(),
      'portfolio',
      assessment,
      {
        stageIds: chapterDefinition.stages.map((stage) => stage.id),
        objectiveIds: chapterDefinition.objectives.map((objective) => objective.id),
        summary: '',
      },
      new Date(2026, 7, 28)
    );
    const chapter = state.chapters.portfolio;
    assert.equal(chapter.status, 'Completed');
    assert.equal(chapter.completionSource, 'prior_learning_import');
    assert.equal(chapter.sessionSummary, 'Portfolio 이전 학습 요약');
    assert.equal(chapter.reviewSchedules.length, 4);
  });

  it('선택 항목이 없거나 다른 활성 세션이 있으면 적용을 거부한다', () => {
    const assessment = assessmentFor('csharp');
    assert.throws(
      () => applyPriorLearningAssessment(createDefaultLearningState(), 'csharp', assessment, { stageIds: [], objectiveIds: [] }),
      /nothing_selected/
    );
    const state = startChapter(createDefaultLearningState(), 'cpp');
    assert.throws(
      () => applyPriorLearningAssessment(state, 'csharp', assessment, { stageIds: ['discovery'], objectiveIds: [] }),
      /another_session_active/
    );
  });
});

describe('외부 AI 학습 프롬프트', () => {
  it('공급자 이름이나 API key 없이 챕터별 학습 규칙을 만든다', () => {
    const prompt = buildLearningPrompt('inventory');
    assert.match(prompt, /아이템 정의와 인벤토리 인스턴스/);
    assert.match(prompt, /개념 발견 → 원리 이해 → 코드·사례 추론/);
    assert.match(prompt, /Markdown 요약/);
    assert.doesNotMatch(prompt, /ChatGPT|Claude|API key/i);
  });

  it('정의되지 않은 챕터는 거부한다', () => {
    assert.throws(() => buildLearningPrompt('not-a-chapter'), /chapter_unavailable/);
  });
});
