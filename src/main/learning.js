'use strict';

const {
  CHAPTERS,
  CURRICULUM,
  STAGE_DEFINITIONS,
  getChapter,
} = require('./learning-catalog');

const LEARNING_VERSION = 2;
const FEATURED_CHAPTER_ID = 'memory-alignment';
const ACTIVE_CHAPTER_ID = FEATURED_CHAPTER_ID;
const REVIEW_OFFSETS = [1, 3, 7, 30];
const ALLOWED_STATUSES = new Set(['Ready', 'Progress', 'Learning', 'Completed']);
const VALID_STAGE_IDS = new Set(STAGE_DEFINITIONS.map((stage) => stage.id));
const LEGACY_ALIGNMENT_OBJECTIVE_IDS = Object.freeze({
  'define-alignment': 'memory-alignment-objective-1',
  'cpu-reason': 'memory-alignment-objective-2',
  padding: 'memory-alignment-objective-3',
  sizeof: 'memory-alignment-objective-4',
  'new-layout': 'memory-alignment-objective-5',
});

const STAGES = getChapter(FEATURED_CHAPTER_ID).stages;
const OBJECTIVES = getChapter(FEATURED_CHAPTER_ID).objectives;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createChapterState() {
  return {
    status: 'Ready',
    checkedStageIds: [],
    checkedObjectiveIds: [],
    startedAt: null,
    completedAt: null,
    promptVersion: 2,
    completionSource: null,
    sessionSummary: '',
    reviewSchedules: [],
    importHistory: [],
    priorCoverage: null,
  };
}

function createDefaultLearningState() {
  return {
    version: LEARNING_VERSION,
    activeChapterId: null,
    chapters: Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, createChapterState()])),
  };
}

function normalizeIdList(value, validIds, mapLegacy = null) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((id) => (mapLegacy && mapLegacy[id]) || id)
    .filter((id) => validIds.has(id)))];
}

function normalizeReviewSchedules(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((review) => review && typeof review.dueDate === 'string')
    .map((review) => ({
      offsetDays: Number.isInteger(review.offsetDays) ? review.offsetDays : 0,
      dueDate: review.dueDate,
      status: review.status === 'completed' ? 'completed' : 'scheduled',
    }));
}

function normalizeImportHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === 'object').slice(-20).map((entry) => ({
    importedAt: typeof entry.importedAt === 'string' ? entry.importedAt : null,
    adapterId: typeof entry.adapterId === 'string' ? entry.adapterId : 'unknown',
    stageIds: Array.isArray(entry.stageIds) ? entry.stageIds.filter((id) => typeof id === 'string') : [],
    objectiveIds: Array.isArray(entry.objectiveIds) ? entry.objectiveIds.filter((id) => typeof id === 'string') : [],
    evidence: Array.isArray(entry.evidence) ? entry.evidence.filter((item) => item && typeof item.id === 'string').slice(0, 20) : [],
  }));
}

function normalizePriorCoverage(value) {
  if (!value || typeof value !== 'object') return null;
  const validLevels = new Set(['unseen', 'familiar', 'practiced', 'applied']);
  const level = validLevels.has(value.level) ? value.level : 'unseen';
  return {
    level,
    confidence: Number.isFinite(Number(value.confidence))
      ? Math.max(0, Math.min(1, Number(value.confidence)))
      : 0,
    evidence: typeof value.evidence === 'string' ? value.evidence.slice(0, 1000) : '',
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 2000) : '',
    assessedAt: typeof value.assessedAt === 'string' ? value.assessedAt : null,
    adapterId: typeof value.adapterId === 'string' ? value.adapterId : 'unknown',
  };
}

function normalizeChapterState(chapter, savedChapter) {
  const defaults = createChapterState();
  if (!savedChapter || typeof savedChapter !== 'object' || savedChapter.completionSource === 'demo_seed') {
    return defaults;
  }

  const validObjectiveIds = new Set(chapter.objectives.map((objective) => objective.id));
  const legacyMap = chapter.id === FEATURED_CHAPTER_ID ? LEGACY_ALIGNMENT_OBJECTIVE_IDS : null;
  const normalized = { ...defaults, ...savedChapter };
  normalized.status = ALLOWED_STATUSES.has(normalized.status) ? normalized.status : 'Ready';
  normalized.checkedStageIds = normalizeIdList(normalized.checkedStageIds, VALID_STAGE_IDS);
  normalized.checkedObjectiveIds = normalizeIdList(normalized.checkedObjectiveIds, validObjectiveIds, legacyMap);
  normalized.startedAt = typeof normalized.startedAt === 'string' ? normalized.startedAt : null;
  normalized.completedAt = typeof normalized.completedAt === 'string' ? normalized.completedAt : null;
  normalized.sessionSummary = typeof normalized.sessionSummary === 'string'
    ? normalized.sessionSummary.slice(0, 20000)
    : '';
  normalized.reviewSchedules = normalizeReviewSchedules(normalized.reviewSchedules);
  normalized.importHistory = normalizeImportHistory(normalized.importHistory);
  normalized.priorCoverage = normalizePriorCoverage(normalized.priorCoverage);
  normalized.completionSource = typeof normalized.completionSource === 'string' ? normalized.completionSource : null;
  return normalized;
}

function normalizeLearningState(saved) {
  const defaults = createDefaultLearningState();
  if (!saved || typeof saved !== 'object') return defaults;

  const savedChapters = saved.chapters && typeof saved.chapters === 'object' ? saved.chapters : {};
  const chapters = Object.fromEntries(CHAPTERS.map((chapter) => [
    chapter.id,
    normalizeChapterState(chapter, savedChapters[chapter.id]),
  ]));

  const learningIds = CHAPTERS
    .map((chapter) => chapter.id)
    .filter((chapterId) => chapters[chapterId].status === 'Learning');
  const requestedActiveId = typeof saved.activeChapterId === 'string' ? saved.activeChapterId : null;
  const activeChapterId = learningIds.includes(requestedActiveId) ? requestedActiveId : (learningIds[0] || null);

  learningIds.forEach((chapterId) => {
    if (chapterId !== activeChapterId) chapters[chapterId].status = 'Ready';
  });

  return { version: LEARNING_VERSION, activeChapterId, chapters };
}

function assertChapter(chapterId) {
  return getChapter(chapterId);
}

function startChapter(current, chapterId, now = new Date()) {
  assertChapter(chapterId);
  const next = normalizeLearningState(clone(current));
  const chapter = next.chapters[chapterId];
  if (chapter.status === 'Completed') throw new Error('chapter_already_completed');
  if (next.activeChapterId && next.activeChapterId !== chapterId) throw new Error('another_session_active');
  chapter.status = 'Learning';
  chapter.startedAt = chapter.startedAt || now.toISOString();
  next.activeChapterId = chapterId;
  return next;
}

function cancelChapter(current, chapterId) {
  assertChapter(chapterId);
  const next = normalizeLearningState(clone(current));
  const chapter = next.chapters[chapterId];
  if (chapter.status !== 'Learning' || next.activeChapterId !== chapterId) throw new Error('chapter_not_learning');

  const hasProgress = chapter.checkedStageIds.length > 0 || chapter.checkedObjectiveIds.length > 0;
  chapter.status = hasProgress ? 'Progress' : 'Ready';
  if (!hasProgress) chapter.startedAt = null;
  next.activeChapterId = null;
  return next;
}

function validateChecklist(ids, validIds, errorCode) {
  if (!Array.isArray(ids) || ids.some((id) => !validIds.has(id))) throw new Error(errorCode);
  return [...new Set(ids)];
}

function updateChecklist(current, chapterId, patch) {
  const chapterDefinition = assertChapter(chapterId);
  const next = normalizeLearningState(clone(current));
  const chapter = next.chapters[chapterId];
  if (chapter.status !== 'Learning' || next.activeChapterId !== chapterId) throw new Error('chapter_not_learning');
  if (!patch || typeof patch !== 'object') throw new Error('invalid_checklist');
  if (Object.prototype.hasOwnProperty.call(patch, 'checkedStageIds')) {
    chapter.checkedStageIds = validateChecklist(patch.checkedStageIds, VALID_STAGE_IDS, 'invalid_stage_id');
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'checkedObjectiveIds')) {
    const validObjectiveIds = new Set(chapterDefinition.objectives.map((objective) => objective.id));
    chapter.checkedObjectiveIds = validateChecklist(patch.checkedObjectiveIds, validObjectiveIds, 'invalid_objective_id');
  }
  return next;
}

function toLocalDateKey(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addLocalDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return toLocalDateKey(next);
}

function isChecklistComplete(chapterState, chapterId = FEATURED_CHAPTER_ID) {
  const chapterDefinition = assertChapter(chapterId);
  return STAGE_DEFINITIONS.every((stage) => chapterState.checkedStageIds.includes(stage.id))
    && chapterDefinition.objectives.every((objective) => chapterState.checkedObjectiveIds.includes(objective.id));
}

function finishChapter(next, chapterId, summary, now, completionSource) {
  const chapter = next.chapters[chapterId];
  chapter.status = 'Completed';
  chapter.completedAt = now.toISOString();
  chapter.completionSource = completionSource;
  chapter.sessionSummary = typeof summary === 'string' ? summary.trim().slice(0, 20000) : '';
  chapter.reviewSchedules = REVIEW_OFFSETS.map((offsetDays) => ({
    offsetDays,
    dueDate: addLocalDays(now, offsetDays),
    status: 'scheduled',
  }));
  if (next.activeChapterId === chapterId) next.activeChapterId = null;
  return next;
}

function completeChapter(current, chapterId, summary = '', now = new Date()) {
  assertChapter(chapterId);
  const next = normalizeLearningState(clone(current));
  const chapter = next.chapters[chapterId];
  if (chapter.status === 'Completed') return next;
  if (chapter.status !== 'Learning' || next.activeChapterId !== chapterId) throw new Error('chapter_not_learning');
  if (!isChecklistComplete(chapter, chapterId)) throw new Error('checklist_incomplete');
  return finishChapter(next, chapterId, summary, now, 'learning_session');
}

function buildLearningPrompt(chapterId) {
  const chapter = assertChapter(chapterId);
  return `당신은 게임 개발자를 위한 소크라테스식 학습 코치입니다.

사용자는 지금 ${[...chapter.path, chapter.title].join(' > ')} 챕터를 학습합니다.

[챕터 설명]
${chapter.description}

[학습 목표]
${chapter.objectives.map((objective, index) => `${index + 1}. ${objective.description}`).join('\n')}

[이 챕터의 맞춤 학습 과제]
- 첫 예측 질문: ${chapter.learningPlan.discovery}
- 원리 탐색: ${chapter.learningPlan.principle}
- 코드·사례 추론: ${chapter.learningPlan.practice}
- 변형 문제: ${chapter.learningPlan.variation}
- 최종 검증: ${chapter.learningPlan.final}

[반드시 지킬 학습 규칙]
- 정답이나 완성된 설명을 먼저 알려주지 마세요.
- 먼저 질문을 제시하고 사용자의 예상과 그렇게 생각한 이유를 물으세요.
- 답변에서 맞는 부분과 부족한 부분을 명확히 구분해 피드백하세요.
- Why 질문을 여러 단계 내려가며 원인을 연결하세요.
- 다음 순서를 지키세요: 개념 발견 → 원리 이해 → 코드·사례 추론 → 변형 문제 → 사용자 설명 → 최종 검증.
- 새 주제로 벗어나려는 궁금증은 짧게 목록으로 정리만 하고 현재 챕터 학습을 계속하세요.
- 사용자가 스스로 설명하거나 계산하기 전에는 답을 공개하지 마세요.
- 코드가 자연스러운 주제에는 실행 결과를 예측할 짧은 코드를 사용하고, 코드가 부자연스러운 주제에는 구체적인 사례나 설계 문제를 사용하세요.

각 단계가 끝날 때 "완료한 단계: <단계명>"이라고 명시해 주세요. 모든 목표를 다룬 뒤에는 사용자가 도움 없이 푸는 최종 문제를 내세요.

최종 검증이 끝나면 아래 형식의 Markdown 요약도 제공하세요. 사용자가 학습 앱에 선택적으로 붙여넣을 수 있어야 합니다.

## 오늘 배운 것
- ...
## 잘 이해한 것
- ...
## 헷갈린 것
- ...
## 잘못된 추론
- ...
## 다음 복습에서 확인할 것
- ...

이제 설명부터 시작하지 말고, 이 챕터의 첫 번째 예측 질문 하나만 제시하세요.`;
}

function validateAssessmentSelection(chapterDefinition, selection) {
  if (!selection || typeof selection !== 'object') throw new Error('invalid_assessment_selection');
  const validObjectiveIds = new Set(chapterDefinition.objectives.map((objective) => objective.id));
  return {
    stageIds: validateChecklist(selection.stageIds || [], VALID_STAGE_IDS, 'invalid_stage_id'),
    objectiveIds: validateChecklist(selection.objectiveIds || [], validObjectiveIds, 'invalid_objective_id'),
    summary: typeof selection.summary === 'string' ? selection.summary.trim().slice(0, 20000) : '',
  };
}

function collectSelectedEvidence(assessment, stageIds, objectiveIds) {
  const selected = new Set([...stageIds, ...objectiveIds]);
  return [...(assessment.stageRecommendations || []), ...(assessment.objectiveRecommendations || [])]
    .filter((item) => item && selected.has(item.id))
    .map((item) => ({
      id: item.id,
      recommended: item.completed === true,
      evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 1000) : '',
    }))
    .slice(0, 20);
}

function applyPriorLearningAssessment(current, chapterId, assessment, selection, now = new Date()) {
  const chapterDefinition = assertChapter(chapterId);
  if (!assessment || assessment.chapterId !== chapterId) throw new Error('assessment_chapter_mismatch');
  const selected = validateAssessmentSelection(chapterDefinition, selection);
  if (!selected.stageIds.length && !selected.objectiveIds.length) throw new Error('nothing_selected');

  const next = normalizeLearningState(clone(current));
  const chapter = next.chapters[chapterId];
  if (chapter.status === 'Completed') throw new Error('chapter_already_completed');
  if (next.activeChapterId && next.activeChapterId !== chapterId) throw new Error('another_session_active');

  chapter.checkedStageIds = [...new Set([...chapter.checkedStageIds, ...selected.stageIds])];
  chapter.checkedObjectiveIds = [...new Set([...chapter.checkedObjectiveIds, ...selected.objectiveIds])];
  chapter.importHistory = [...chapter.importHistory, {
    importedAt: now.toISOString(),
    adapterId: typeof assessment.adapterId === 'string' ? assessment.adapterId : 'unknown',
    stageIds: selected.stageIds,
    objectiveIds: selected.objectiveIds,
    evidence: collectSelectedEvidence(assessment, selected.stageIds, selected.objectiveIds),
  }].slice(-20);

  if (isChecklistComplete(chapter, chapterId)) {
    const summary = selected.summary || (typeof assessment.overallSummary === 'string' ? assessment.overallSummary : '');
    return finishChapter(next, chapterId, summary, now, 'prior_learning_import');
  }

  chapter.status = 'Learning';
  chapter.startedAt = chapter.startedAt || now.toISOString();
  next.activeChapterId = chapterId;
  return next;
}

function applyCurriculumCoverage(current, assessment, selectedChapterIds, now = new Date()) {
  if (!assessment || !Array.isArray(assessment.chapterAssessments)) throw new Error('curriculum_assessment_invalid');
  if (!Array.isArray(selectedChapterIds)) throw new Error('invalid_curriculum_chapter_ids');
  const selectedIds = [...new Set(selectedChapterIds)];
  if (!selectedIds.length) throw new Error('curriculum_chapter_selection_required');
  const byId = new Map(assessment.chapterAssessments.map((item) => [item.chapterId, item]));
  const next = normalizeLearningState(clone(current));

  selectedIds.forEach((chapterId) => {
    assertChapter(chapterId);
    const item = byId.get(chapterId);
    if (!item) throw new Error('curriculum_assessment_chapter_missing');
    next.chapters[chapterId].priorCoverage = normalizePriorCoverage({
      ...item,
      assessedAt: now.toISOString(),
      adapterId: assessment.adapterId,
    });
  });
  return next;
}

function applyCurriculumDetailAssessments(current, assessmentBatch, selections, now = new Date()) {
  if (!assessmentBatch || !Array.isArray(assessmentBatch.chapterAssessments)) {
    throw new Error('curriculum_detail_assessment_invalid');
  }
  if (!Array.isArray(selections)) throw new Error('invalid_assessment_selection');
  const assessmentById = new Map(assessmentBatch.chapterAssessments.map((item) => [item.chapterId, item]));
  const next = normalizeLearningState(clone(current));
  let appliedCount = 0;

  selections.forEach((selection) => {
    if (!selection || typeof selection.chapterId !== 'string') throw new Error('invalid_assessment_selection');
    const chapterId = selection.chapterId;
    const chapterDefinition = assertChapter(chapterId);
    const assessment = assessmentById.get(chapterId);
    if (!assessment) throw new Error('curriculum_detail_chapter_missing');
    const selected = validateAssessmentSelection(chapterDefinition, selection);
    if (!selected.stageIds.length && !selected.objectiveIds.length) return;
    const chapter = next.chapters[chapterId];
    if (chapter.status === 'Completed') return;

    chapter.checkedStageIds = [...new Set([...chapter.checkedStageIds, ...selected.stageIds])];
    chapter.checkedObjectiveIds = [...new Set([...chapter.checkedObjectiveIds, ...selected.objectiveIds])];
    chapter.importHistory = [...chapter.importHistory, {
      importedAt: now.toISOString(),
      adapterId: typeof assessment.adapterId === 'string' ? assessment.adapterId : 'unknown',
      stageIds: selected.stageIds,
      objectiveIds: selected.objectiveIds,
      evidence: collectSelectedEvidence(assessment, selected.stageIds, selected.objectiveIds),
    }].slice(-20);

    if (isChecklistComplete(chapter, chapterId)) {
      const summary = selected.summary || (typeof assessment.overallSummary === 'string' ? assessment.overallSummary : '');
      finishChapter(next, chapterId, summary, now, 'curriculum_prior_learning_import');
    } else if (next.activeChapterId !== chapterId) {
      chapter.status = 'Progress';
    }
    appliedCount += 1;
  });

  if (!appliedCount) throw new Error('nothing_selected');
  return next;
}

function getSnapshot(current, now = new Date()) {
  const state = normalizeLearningState(current);
  const today = toLocalDateKey(now);
  const reviews = CHAPTERS.flatMap((chapterDefinition) => {
    const chapterState = state.chapters[chapterDefinition.id];
    return chapterState.reviewSchedules.map((review) => ({
      ...review,
      chapterId: chapterDefinition.id,
      chapterTitle: chapterDefinition.title,
      chapterPath: chapterDefinition.path,
    }));
  });
  const completed = CHAPTERS.filter((chapter) => state.chapters[chapter.id].status === 'Completed').length;
  return {
    state,
    curriculum: CURRICULUM,
    chapterCatalog: CHAPTERS,
    activeChapterId: state.activeChapterId,
    featuredChapterId: state.activeChapterId || FEATURED_CHAPTER_ID,
    releasedProgress: { completed, total: CHAPTERS.length },
    reviews: {
      due: reviews.filter((review) => review.status === 'scheduled' && review.dueDate <= today),
      upcoming: reviews.filter((review) => review.status === 'scheduled' && review.dueDate > today),
    },
  };
}

module.exports = {
  ACTIVE_CHAPTER_ID,
  CURRICULUM,
  FEATURED_CHAPTER_ID,
  OBJECTIVES,
  REVIEW_OFFSETS,
  STAGES,
  applyCurriculumCoverage,
  applyCurriculumDetailAssessments,
  applyPriorLearningAssessment,
  buildLearningPrompt,
  cancelChapter,
  completeChapter,
  createDefaultLearningState,
  getSnapshot,
  isChecklistComplete,
  normalizeLearningState,
  startChapter,
  updateChecklist,
  _addLocalDays: addLocalDays,
  _toLocalDateKey: toLocalDateKey,
};
