'use strict';

const { CHAPTERS, CURRICULUM, STAGE_DEFINITIONS, getChapter } = require('./learning-catalog');
const { DEFAULT_LEARNING_BALANCE, mergeLearningBalance } = require('./learning-balance');

const LEARNING_VERSION = 3;
const FEATURED_CHAPTER_ID = 'memory-alignment';
const ACTIVE_CHAPTER_ID = FEATURED_CHAPTER_ID;
const REVIEW_OFFSETS = DEFAULT_LEARNING_BALANCE.reviewIntervalsDays;
const VALID_STAGE_IDS = new Set(STAGE_DEFINITIONS.map((stage) => stage.id));
const VALID_GRADES = new Set(['correct', 'partial', 'incorrect']);
const LEGACY_ALIGNMENT_OBJECTIVE_IDS = Object.freeze({
  'define-alignment': 'memory-alignment-objective-1',
  'cpu-reason': 'memory-alignment-objective-2',
  padding: 'memory-alignment-objective-3',
  sizeof: 'memory-alignment-objective-4',
  'new-layout': 'memory-alignment-objective-5',
});
const TIER_LABELS = Object.freeze({
  bronze: '브론즈', silver: '실버', gold: '골드', platinum: '플레티넘',
  diamond: '다이아', master: '마스터', challenger: '챌린저',
});

const STAGES = getChapter(FEATURED_CHAPTER_ID).stages;
const OBJECTIVES = getChapter(FEATURED_CHAPTER_ID).objectives;
let activeBalance = mergeLearningBalance(DEFAULT_LEARNING_BALANCE);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function setLearningBalance(value) { activeBalance = mergeLearningBalance(value); return getLearningBalance(); }
function getLearningBalance() { return clone(activeBalance); }

function createChapterState() {
  return {
    status: 'Ready', checkedStageIds: [], checkedObjectiveIds: [], objectiveProgress: {},
    startedAt: null, completedAt: null, promptVersion: 3, completionSource: null,
    sessionSummary: '', reviewSchedules: [], importHistory: [], priorCoverage: null,
  };
}

function createDefaultLearningState() {
  return {
    version: LEARNING_VERSION,
    activeChapterId: null,
    chapters: Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, createChapterState()])),
    surpriseReview: { weekKey: null, assignments: [], rotationAskedIds: [] },
  };
}

function normalizeIdList(value, validIds, mapLegacy = null) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => (mapLegacy && mapLegacy[id]) || id).filter((id) => validIds.has(id)))];
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
    confidence: Number.isFinite(Number(value.confidence)) ? Math.max(0, Math.min(1, Number(value.confidence))) : 0,
    evidence: typeof value.evidence === 'string' ? value.evidence.slice(0, 1000) : '',
    summary: typeof value.summary === 'string' ? value.summary.slice(0, 2000) : '',
    assessedAt: typeof value.assessedAt === 'string' ? value.assessedAt : null,
    adapterId: typeof value.adapterId === 'string' ? value.adapterId : 'unknown',
  };
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

function dateFromKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function weekKey(date) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() - day + 1);
  return toLocalDateKey(local);
}

function nextWeekKey(key) { const date = dateFromKey(key); return date ? addLocalDays(date, 7) : null; }
function endOfWeekKey(key) { const date = dateFromKey(key); return date ? addLocalDays(date, 6) : null; }

function createReviewState(achievedAt, now = new Date()) {
  const achievedDate = achievedAt ? new Date(achievedAt) : now;
  const validDate = Number.isNaN(achievedDate.getTime()) ? now : achievedDate;
  return {
    phaseIndex: 0,
    dueDate: addLocalDays(validDate, activeBalance.reviewIntervalsDays[0]),
    lastGrade: null, multiplier: 1, lastReviewedAt: null, lastSurpriseAt: null,
  };
}

function normalizeReviewState(value, achievedAt, now) {
  const defaults = createReviewState(achievedAt, now);
  if (!value || typeof value !== 'object') return defaults;
  const phaseIndex = Number.isInteger(value.phaseIndex) ? Math.max(0, Math.min(4, value.phaseIndex)) : 0;
  const grade = [...VALID_GRADES, 'overdue'].includes(value.lastGrade) ? value.lastGrade : null;
  return {
    phaseIndex,
    dueDate: phaseIndex >= 4 ? null : (typeof value.dueDate === 'string' ? value.dueDate : defaults.dueDate),
    lastGrade: grade,
    multiplier: Number.isFinite(Number(value.multiplier)) ? Math.max(0, Math.min(1, Number(value.multiplier))) : 1,
    lastReviewedAt: typeof value.lastReviewedAt === 'string' ? value.lastReviewedAt : null,
    lastSurpriseAt: typeof value.lastSurpriseAt === 'string' ? value.lastSurpriseAt : null,
  };
}

function normalizeObjectiveProgress(chapter, savedChapter, checkedObjectiveIds, now) {
  const source = savedChapter.objectiveProgress && typeof savedChapter.objectiveProgress === 'object' ? savedChapter.objectiveProgress : {};
  const result = {};
  checkedObjectiveIds.forEach((objectiveId) => {
    const saved = source[objectiveId] && typeof source[objectiveId] === 'object' ? source[objectiveId] : {};
    const achievedAt = typeof saved.achievedAt === 'string' ? saved.achievedAt
      : (typeof savedChapter.completedAt === 'string' ? savedChapter.completedAt
        : (typeof savedChapter.startedAt === 'string' ? savedChapter.startedAt : now.toISOString()));
    result[objectiveId] = {
      achievedAt,
      source: typeof saved.source === 'string' ? saved.source : (savedChapter.completionSource || 'legacy_progress'),
      evidence: typeof saved.evidence === 'string' ? saved.evidence.slice(0, 2000) : '',
      review: normalizeReviewState(saved.review, achievedAt, now),
    };
  });
  return result;
}

function normalizeChapterState(chapter, savedChapter, now) {
  const defaults = createChapterState();
  if (!savedChapter || typeof savedChapter !== 'object' || savedChapter.completionSource === 'demo_seed') return defaults;
  const validObjectiveIds = new Set(chapter.objectives.map((objective) => objective.id));
  const legacyMap = chapter.id === FEATURED_CHAPTER_ID ? LEGACY_ALIGNMENT_OBJECTIVE_IDS : null;
  const checkedStageIds = normalizeIdList(savedChapter.checkedStageIds, VALID_STAGE_IDS);
  const checkedObjectiveIds = normalizeIdList(savedChapter.checkedObjectiveIds, validObjectiveIds, legacyMap);
  const stagesComplete = checkedStageIds.length === chapter.stages.length;
  let status = ['Ready', 'Progress', 'Learning', 'Completed'].includes(savedChapter.status) ? savedChapter.status : 'Ready';
  if (stagesComplete) status = 'Completed';
  else if (status === 'Completed') status = checkedStageIds.length || checkedObjectiveIds.length ? 'Progress' : 'Ready';
  return {
    ...defaults, ...savedChapter, status, checkedStageIds, checkedObjectiveIds,
    objectiveProgress: normalizeObjectiveProgress(chapter, savedChapter, checkedObjectiveIds, now),
    startedAt: typeof savedChapter.startedAt === 'string' ? savedChapter.startedAt : null,
    completedAt: typeof savedChapter.completedAt === 'string' ? savedChapter.completedAt : null,
    sessionSummary: typeof savedChapter.sessionSummary === 'string' ? savedChapter.sessionSummary.slice(0, 20000) : '',
    reviewSchedules: [], importHistory: normalizeImportHistory(savedChapter.importHistory),
    priorCoverage: normalizePriorCoverage(savedChapter.priorCoverage),
    completionSource: typeof savedChapter.completionSource === 'string' ? savedChapter.completionSource : null,
    promptVersion: 3,
  };
}

function normalizeSurpriseReview(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    weekKey: typeof source.weekKey === 'string' && dateFromKey(source.weekKey) ? source.weekKey : null,
    assignments: Array.isArray(source.assignments) ? source.assignments
      .filter((item) => item && typeof item.objectiveId === 'string')
      .map((item) => ({ objectiveId: item.objectiveId, status: item.status === 'graded' ? 'graded' : 'pending', grade: VALID_GRADES.has(item.grade) ? item.grade : null })) : [],
    rotationAskedIds: Array.isArray(source.rotationAskedIds) ? [...new Set(source.rotationAskedIds.filter((id) => typeof id === 'string'))] : [],
  };
}

function normalizeLearningState(saved, now = new Date()) {
  const defaults = createDefaultLearningState();
  if (!saved || typeof saved !== 'object') return defaults;
  const savedChapters = saved.chapters && typeof saved.chapters === 'object' ? saved.chapters : {};
  const chapters = Object.fromEntries(CHAPTERS.map((chapter) => [chapter.id, normalizeChapterState(chapter, savedChapters[chapter.id], now)]));
  const requestedActiveId = typeof saved.activeChapterId === 'string' && chapters[saved.activeChapterId] ? saved.activeChapterId : null;
  return { version: LEARNING_VERSION, activeChapterId: requestedActiveId, chapters, surpriseReview: normalizeSurpriseReview(saved.surpriseReview) };
}

function assertChapter(chapterId) { return getChapter(chapterId); }
function currentStage(definition, state) { return definition.stages.find((stage) => !state.checkedStageIds.includes(stage.id)) || null; }

function startChapter(current, chapterId, now = new Date()) {
  const definition = assertChapter(chapterId);
  const next = normalizeLearningState(clone(current), now);
  const chapter = next.chapters[chapterId];
  if (!currentStage(definition, chapter)) throw new Error('chapter_already_completed');
  chapter.status = 'Learning';
  chapter.startedAt = chapter.startedAt || now.toISOString();
  next.activeChapterId = chapterId;
  return next;
}

function cancelChapter(current, chapterId) {
  assertChapter(chapterId);
  const next = normalizeLearningState(clone(current));
  const chapter = next.chapters[chapterId];
  if (chapter.status !== 'Learning') throw new Error('chapter_not_learning');
  const hasProgress = chapter.checkedStageIds.length > 0 || chapter.checkedObjectiveIds.length > 0;
  chapter.status = hasProgress ? 'Progress' : 'Ready';
  if (!hasProgress) chapter.startedAt = null;
  if (next.activeChapterId === chapterId) next.activeChapterId = null;
  return next;
}

function validateChecklist(ids, validIds, errorCode) {
  if (!Array.isArray(ids) || ids.some((id) => !validIds.has(id))) throw new Error(errorCode);
  return [...new Set(ids)];
}

function ensureObjectivesAchieved(next, chapterId, objectiveIds, now, source, evidenceById = {}) {
  const definition = assertChapter(chapterId);
  const chapter = next.chapters[chapterId];
  const selected = validateChecklist(objectiveIds || [], new Set(definition.objectives.map((objective) => objective.id)), 'invalid_objective_id');
  const newlyAchieved = [];
  selected.forEach((objectiveId) => {
    if (chapter.checkedObjectiveIds.includes(objectiveId)) return;
    chapter.checkedObjectiveIds.push(objectiveId);
    chapter.objectiveProgress[objectiveId] = {
      achievedAt: now.toISOString(), source,
      evidence: typeof evidenceById[objectiveId] === 'string' ? evidenceById[objectiveId].slice(0, 2000) : '',
      review: createReviewState(now.toISOString(), now),
    };
    newlyAchieved.push(objectiveId);
  });
  return newlyAchieved;
}

function finishChapter(next, chapterId, summary, now, completionSource) {
  const chapter = next.chapters[chapterId];
  chapter.status = 'Completed'; chapter.completedAt = chapter.completedAt || now.toISOString();
  chapter.completionSource = chapter.completionSource || completionSource;
  const normalizedSummary = typeof summary === 'string' ? summary.trim().slice(0, 20000) : '';
  if (!chapter.sessionSummary && normalizedSummary) chapter.sessionSummary = normalizedSummary;
  chapter.reviewSchedules = [];
  if (next.activeChapterId === chapterId) next.activeChapterId = null;
  return next;
}

function completeStage(current, chapterId, stageId, objectiveIds = [], evidenceById = {}, now = new Date(), source = 'learning_session') {
  const definition = assertChapter(chapterId);
  const next = normalizeLearningState(clone(current), now);
  const chapter = next.chapters[chapterId];
  if (chapter.status !== 'Learning') throw new Error('chapter_not_learning');
  const expected = currentStage(definition, chapter);
  if (!expected) throw new Error('chapter_already_completed');
  if (expected.id !== stageId) throw new Error('stage_out_of_order');
  chapter.checkedStageIds.push(stageId);
  const newlyAchievedObjectiveIds = ensureObjectivesAchieved(next, chapterId, objectiveIds, now, source, evidenceById);
  if (chapter.checkedStageIds.length === definition.stages.length) finishChapter(next, chapterId, '', now, source);
  else { chapter.status = 'Progress'; chapter.startedAt = chapter.startedAt || now.toISOString(); next.activeChapterId = chapterId; }
  return { state: next, stageId, newlyAchievedObjectiveIds };
}

function completeObjectiveSession(current, chapterId, objectiveId, evidence = '', now = new Date()) {
  const next = normalizeLearningState(clone(current), now);
  const newlyAchievedObjectiveIds = ensureObjectivesAchieved(next, chapterId, [objectiveId], now, 'objective_focus', { [objectiveId]: evidence });
  if (!newlyAchievedObjectiveIds.length) throw new Error('objective_already_completed');
  return { state: next, newlyAchievedObjectiveIds };
}

function buildLearningPrompt(chapterId, requestedStageId = null) {
  const chapter = assertChapter(chapterId);
  const stage = requestedStageId ? chapter.stages.find((item) => item.id === requestedStageId) : chapter.stages[0];
  if (!stage) throw new Error('invalid_stage_id');
  const stageIndex = chapter.stages.findIndex((item) => item.id === stage.id);
  const nextStage = chapter.stages[stageIndex + 1] || null;
  const nextChapter = CHAPTERS[CHAPTERS.findIndex((item) => item.id === chapter.id) + 1] || null;
  const teaser = nextStage ? `${nextStage.title}: ${nextStage.description}`
    : (nextChapter ? `${nextChapter.title}: ${nextChapter.description}` : '전체 커리큘럼 복습');
  const outputShape = {
    contract: 'learning-stage-result/v1', chapterId: chapter.id, stageId: stage.id,
    achievedObjectives: chapter.objectives.map((objective) => ({ id: objective.id, achieved: false, evidence: '사용자의 답변에서 확인한 근거 또는 부족한 점' })),
    stageFeedback: '이번 단계에서 잘한 점과 보완할 점',
  };
  return `당신은 게임 개발자를 위한 소크라테스식 학습 코치입니다.

사용자는 ${[...chapter.path, chapter.title].join(' > ')} 챕터의 "${stage.title}" 단계만 학습합니다.

[현재 단계]
${stage.description}

[이 챕터의 학습 목표]
${chapter.objectives.map((objective) => `- ${objective.id} [${objective.difficulty}]: ${objective.description}`).join('\n')}

[규칙]
- 정답이나 완성된 설명을 먼저 공개하지 말고 한 번에 질문 하나만 제시하세요.
- 사용자의 예상과 이유를 먼저 듣고 맞는 부분과 부족한 부분을 구분해 피드백하세요.
- 현재 단계 밖의 다음 학습을 실제로 시작하지 마세요.
- 충분히 검증되면 "완료한 단계: ${stage.title}"을 명시하세요.
- 이어서 "다음 학습 예고: ${teaser}"를 한두 문장으로만 보여주고 대화를 멈추세요.
- 마지막에는 아래 JSON 객체를 Markdown 코드 블록 하나로 출력하세요. 실제로 근거가 확인된 목표만 achieved를 true로 하세요.

${JSON.stringify(outputShape, null, 2)}

이제 설명부터 시작하지 말고 현재 단계의 첫 질문 하나만 제시하세요.`;
}

function buildObjectiveFocusPrompt(chapterId, objectiveId) {
  const chapter = assertChapter(chapterId);
  const objective = chapter.objectives.find((item) => item.id === objectiveId);
  if (!objective) throw new Error('invalid_objective_id');
  return `당신은 게임 개발 학습 목표를 검증하는 소크라테스식 코치입니다.

[챕터] ${[...chapter.path, chapter.title].join(' > ')}
[집중 목표] ${objective.id}: ${objective.description}

- 이 목표 하나만 다루고 한 번에 질문 하나씩 제시하세요.
- 사용자가 설명·추론·적용하는 과정을 확인하고 답을 먼저 공개하지 마세요.
- 달성 근거가 충분할 때만 완료를 제안하세요.
- 종료 시 다음 JSON만 Markdown 코드 블록으로 출력하세요.

${JSON.stringify({ contract: 'learning-objective-result/v1', chapterId, objectiveId, achieved: false, evidence: '사용자의 답변에서 확인한 구체적인 근거', feedback: '보완할 점' }, null, 2)}`;
}

function objectiveLookup() {
  return new Map(CHAPTERS.flatMap((chapter) => chapter.objectives.map((objective) => [objective.id, { chapter, objective }])));
}

function storedObjectiveMultiplier(progress) {
  return progress && progress.review && Number.isFinite(Number(progress.review.multiplier)) ? Number(progress.review.multiplier) : 1;
}

function effectiveObjectiveMultiplier(progress, today) {
  const stored = storedObjectiveMultiplier(progress);
  if (progress.review.phaseIndex < 4 && progress.review.dueDate && progress.review.dueDate < today) {
    return Math.min(stored, activeBalance.reviewMultipliers.overdue);
  }
  return stored;
}

function calculateTier(effectiveRp, maxRp, achievedCount, totalObjectives) {
  const ratio = maxRp > 0 ? Math.max(0, Math.min(1, effectiveRp / maxRp)) : 0;
  if (achievedCount === totalObjectives && ratio >= 1) return { key: 'challenger', label: TIER_LABELS.challenger, division: null, display: TIER_LABELS.challenger, ratio };
  const ordered = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'];
  let key = 'bronze';
  for (const candidate of ordered) if (ratio >= activeBalance.tierStarts[candidate]) key = candidate;
  if (key === 'master') return { key, label: TIER_LABELS[key], division: null, display: TIER_LABELS[key], ratio };
  const index = ordered.indexOf(key);
  const start = activeBalance.tierStarts[key];
  const end = activeBalance.tierStarts[ordered[index + 1]];
  const position = Math.max(0, Math.min(0.999999, (ratio - start) / (end - start)));
  const division = activeBalance.divisionsPerTier - Math.floor(position * activeBalance.divisionsPerTier);
  return { key, label: TIER_LABELS[key], division, display: `${TIER_LABELS[key]} ${division}`, ratio };
}

function calculateRating(state, now = new Date()) {
  const today = toLocalDateKey(now);
  let maxRp = 0; let earnedRp = 0; let effectiveRp = 0; let achievedCount = 0;
  const objectiveRatings = [];
  CHAPTERS.forEach((chapter) => {
    const chapterState = state.chapters[chapter.id];
    chapter.objectives.forEach((objective) => {
      const baseRp = activeBalance.objectiveRp[objective.difficulty];
      maxRp += baseRp;
      const progress = chapterState.objectiveProgress[objective.id];
      if (!progress) return;
      achievedCount += 1; earnedRp += baseRp;
      const multiplier = effectiveObjectiveMultiplier(progress, today);
      const effective = baseRp * multiplier;
      effectiveRp += effective;
      objectiveRatings.push({ chapterId: chapter.id, objectiveId: objective.id, baseRp, effectiveRp: effective, multiplier });
    });
  });
  const totalObjectives = CHAPTERS.reduce((count, chapter) => count + chapter.objectives.length, 0);
  const tier = calculateTier(effectiveRp, maxRp, achievedCount, totalObjectives);
  const tierOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'challenger'];
  let nextTier = null;
  let nextThresholdRp = maxRp;
  if (tier.division && tier.division > 1) {
    const majorOrder = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'];
    const majorIndex = majorOrder.indexOf(tier.key);
    const start = activeBalance.tierStarts[tier.key];
    const end = activeBalance.tierStarts[majorOrder[majorIndex + 1]];
    const completedDivisions = activeBalance.divisionsPerTier - tier.division;
    nextTier = `${tier.label} ${tier.division - 1}`;
    nextThresholdRp = Math.ceil(maxRp * (start + ((end - start) / activeBalance.divisionsPerTier) * (completedDivisions + 1)));
  } else {
    const nextKey = tierOrder[tierOrder.indexOf(tier.key) + 1] || null;
    nextTier = nextKey ? TIER_LABELS[nextKey] : null;
    nextThresholdRp = nextKey ? Math.ceil(maxRp * activeBalance.tierStarts[nextKey]) : maxRp;
  }
  return {
    maxRp, earnedRp, effectiveRp, penaltyRp: earnedRp - effectiveRp,
    achievedObjectives: achievedCount, totalObjectives, tier,
    nextTier, nextThresholdRp,
    objectiveRatings,
  };
}

function allObjectiveRecords(state) {
  const lookup = objectiveLookup();
  return [...lookup.entries()].flatMap(([objectiveId, entry]) => {
    const progress = state.chapters[entry.chapter.id].objectiveProgress[objectiveId];
    return progress ? [{ ...entry, objectiveId, progress }] : [];
  });
}

function markMissedAssignments(state) {
  const lookup = objectiveLookup();
  state.surpriseReview.assignments.forEach((assignment) => {
    if (assignment.status !== 'pending') return;
    const entry = lookup.get(assignment.objectiveId);
    const progress = entry && state.chapters[entry.chapter.id].objectiveProgress[assignment.objectiveId];
    if (progress) { progress.review.lastGrade = 'overdue'; progress.review.multiplier = activeBalance.reviewMultipliers.overdue; }
  });
}

function chooseSurpriseAssignments(state, key) {
  const eligible = allObjectiveRecords(state).filter(({ progress }) => progress.review.phaseIndex >= 4);
  const limit = Math.min(activeBalance.surpriseQuestionsPerWeek, eligible.length);
  if (!limit) return [];
  const asked = new Set(state.surpriseReview.rotationAskedIds);
  const sortCandidates = (items) => items.sort((left, right) => {
    const multiplierDelta = storedObjectiveMultiplier(left.progress) - storedObjectiveMultiplier(right.progress);
    if (multiplierDelta) return multiplierDelta;
    const leftDate = left.progress.review.lastSurpriseAt || '';
    const rightDate = right.progress.review.lastSurpriseAt || '';
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return left.objectiveId.localeCompare(right.objectiveId);
  });
  const remaining = sortCandidates(eligible.filter((item) => !asked.has(item.objectiveId)));
  const selected = remaining.slice(0, limit);
  if (selected.length < limit) {
    const alreadySelected = new Set(selected.map((item) => item.objectiveId));
    const refill = sortCandidates(eligible.filter((item) => !alreadySelected.has(item.objectiveId)))
      .slice(0, limit - selected.length);
    selected.push(...refill);
    state.surpriseReview.rotationAskedIds = selected.map((item) => item.objectiveId);
  } else {
    selected.forEach(({ objectiveId }) => state.surpriseReview.rotationAskedIds.push(objectiveId));
  }
  selected.forEach(({ progress }) => { progress.review.lastSurpriseAt = key; });
  return selected.map(({ objectiveId }) => ({ objectiveId, status: 'pending', grade: null }));
}

function syncSurpriseReview(state, now = new Date()) {
  const currentWeek = weekKey(now);
  if (!state.surpriseReview.weekKey) {
    state.surpriseReview.weekKey = currentWeek;
    state.surpriseReview.assignments = chooseSurpriseAssignments(state, currentWeek);
    return state;
  }
  while (state.surpriseReview.weekKey < currentWeek) {
    markMissedAssignments(state);
    const nextKey = nextWeekKey(state.surpriseReview.weekKey);
    state.surpriseReview.weekKey = nextKey;
    state.surpriseReview.assignments = chooseSurpriseAssignments(state, nextKey);
  }
  return state;
}

function reviewItem(entry, today) {
  const review = entry.progress.review;
  return {
    chapterId: entry.chapter.id, chapterTitle: entry.chapter.title, chapterPath: entry.chapter.path,
    objectiveId: entry.objective.id, objectiveDescription: entry.objective.description,
    phaseIndex: review.phaseIndex,
    phaseLabel: review.phaseIndex < 4 ? `${activeBalance.reviewIntervalsDays[review.phaseIndex]}일 복습` : '기습 질문',
    dueDate: review.dueDate, overdue: review.phaseIndex < 4 && review.dueDate && review.dueDate < today,
    multiplier: effectiveObjectiveMultiplier(entry.progress, today),
  };
}

function gradeObjectiveReview(current, chapterId, objectiveId, grade, now = new Date(), kind = 'scheduled') {
  if (!VALID_GRADES.has(grade)) throw new Error('invalid_review_grade');
  const definition = assertChapter(chapterId);
  if (!definition.objectives.some((item) => item.id === objectiveId)) throw new Error('invalid_objective_id');
  const next = syncSurpriseReview(normalizeLearningState(clone(current), now), now);
  const progress = next.chapters[chapterId].objectiveProgress[objectiveId];
  if (!progress) throw new Error('objective_not_completed');
  const review = progress.review;
  review.lastGrade = grade; review.multiplier = activeBalance.reviewMultipliers[grade]; review.lastReviewedAt = now.toISOString();
  if (kind === 'surprise') {
    const assignment = next.surpriseReview.assignments.find((item) => item.objectiveId === objectiveId);
    if (assignment) { assignment.status = 'graded'; assignment.grade = grade; }
  } else if (grade === 'correct' && review.phaseIndex < 4) {
    review.phaseIndex += 1;
    review.dueDate = review.phaseIndex >= 4 ? null : addLocalDays(now, activeBalance.reviewIntervalsDays[review.phaseIndex]);
  } else if (kind !== 'surprise' && review.phaseIndex < 4) {
    review.dueDate = toLocalDateKey(now);
  }
  return next;
}

function buildReviewPrompt(chapterId, objectiveId, phaseLabel, retry = false) {
  const chapter = assertChapter(chapterId);
  const objective = chapter.objectives.find((item) => item.id === objectiveId);
  if (!objective) throw new Error('invalid_objective_id');
  return `당신은 게임 개발 학습 내용을 복습시키는 평가자입니다.

[챕터] ${chapter.title}
[목표] ${objective.id}: ${objective.description}
[복습] ${phaseLabel}${retry ? ' 즉시 재도전' : ''}

- 이전과 다른 구체적인 회상·적용 질문 하나만 먼저 제시하고 답은 공개하지 마세요.
- 사용자의 답변을 받은 뒤 correct, partial, incorrect 중 하나를 보수적으로 판정하세요.
- 마지막에는 아래 JSON만 Markdown 코드 블록으로 출력하세요.

${JSON.stringify({ contract: 'learning-review-assessment/v1', chapterId, objectiveId, grade: 'partial', evidence: '판정 근거', feedback: '보완할 점' }, null, 2)}`;
}

function validateAssessmentSelection(definition, selection) {
  if (!selection || typeof selection !== 'object') throw new Error('invalid_assessment_selection');
  return {
    stageIds: validateChecklist(selection.stageIds || [], VALID_STAGE_IDS, 'invalid_stage_id'),
    objectiveIds: validateChecklist(selection.objectiveIds || [], new Set(definition.objectives.map((item) => item.id)), 'invalid_objective_id'),
    summary: typeof selection.summary === 'string' ? selection.summary.trim().slice(0, 20000) : '',
  };
}

function collectSelectedEvidence(assessment, stageIds, objectiveIds) {
  const selected = new Set([...stageIds, ...objectiveIds]);
  return [...(assessment.stageRecommendations || []), ...(assessment.objectiveRecommendations || [])]
    .filter((item) => item && selected.has(item.id))
    .map((item) => ({ id: item.id, recommended: item.completed === true, evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 1000) : '' })).slice(0, 20);
}

function applyPriorLearningAssessment(current, chapterId, assessment, selection, now = new Date()) {
  const definition = assertChapter(chapterId);
  if (!assessment || assessment.chapterId !== chapterId) throw new Error('assessment_chapter_mismatch');
  const selected = validateAssessmentSelection(definition, selection);
  if (!selected.stageIds.length && !selected.objectiveIds.length) throw new Error('nothing_selected');
  const next = normalizeLearningState(clone(current), now);
  const chapter = next.chapters[chapterId];
  chapter.checkedStageIds = [...new Set([...chapter.checkedStageIds, ...selected.stageIds])];
  const evidenceEntries = collectSelectedEvidence(assessment, selected.stageIds, selected.objectiveIds);
  ensureObjectivesAchieved(next, chapterId, selected.objectiveIds, now, 'prior_learning_import', Object.fromEntries(evidenceEntries.map((item) => [item.id, item.evidence])));
  chapter.importHistory = [...chapter.importHistory, { importedAt: now.toISOString(), adapterId: assessment.adapterId || 'unknown', stageIds: selected.stageIds, objectiveIds: selected.objectiveIds, evidence: evidenceEntries }].slice(-20);
  if (chapter.checkedStageIds.length === definition.stages.length) finishChapter(next, chapterId, selected.summary || assessment.overallSummary, now, 'prior_learning_import');
  else chapter.status = 'Progress';
  return next;
}

function applyCurriculumCoverage(current, assessment, selectedChapterIds, now = new Date()) {
  if (!assessment || !Array.isArray(assessment.chapterAssessments)) throw new Error('curriculum_assessment_invalid');
  if (!Array.isArray(selectedChapterIds)) throw new Error('invalid_curriculum_chapter_ids');
  const selectedIds = [...new Set(selectedChapterIds)];
  if (!selectedIds.length) throw new Error('curriculum_chapter_selection_required');
  const byId = new Map(assessment.chapterAssessments.map((item) => [item.chapterId, item]));
  const next = normalizeLearningState(clone(current), now);
  selectedIds.forEach((chapterId) => {
    assertChapter(chapterId);
    const item = byId.get(chapterId);
    if (!item) throw new Error('curriculum_assessment_chapter_missing');
    next.chapters[chapterId].priorCoverage = normalizePriorCoverage({ ...item, assessedAt: now.toISOString(), adapterId: assessment.adapterId });
  });
  return next;
}

function applyCurriculumDetailAssessments(current, assessmentBatch, selections, now = new Date()) {
  if (!assessmentBatch || !Array.isArray(assessmentBatch.chapterAssessments)) throw new Error('curriculum_detail_assessment_invalid');
  if (!Array.isArray(selections)) throw new Error('invalid_assessment_selection');
  const assessmentById = new Map(assessmentBatch.chapterAssessments.map((item) => [item.chapterId, item]));
  const next = normalizeLearningState(clone(current), now);
  let appliedCount = 0;
  selections.forEach((selection) => {
    if (!selection || typeof selection.chapterId !== 'string') throw new Error('invalid_assessment_selection');
    const definition = assertChapter(selection.chapterId);
    const assessment = assessmentById.get(selection.chapterId);
    if (!assessment) throw new Error('curriculum_detail_chapter_missing');
    const selected = validateAssessmentSelection(definition, selection);
    if (!selected.stageIds.length && !selected.objectiveIds.length) return;
    const chapter = next.chapters[selection.chapterId];
    chapter.checkedStageIds = [...new Set([...chapter.checkedStageIds, ...selected.stageIds])];
    const evidenceEntries = collectSelectedEvidence(assessment, selected.stageIds, selected.objectiveIds);
    ensureObjectivesAchieved(next, selection.chapterId, selected.objectiveIds, now, 'curriculum_prior_learning_import', Object.fromEntries(evidenceEntries.map((item) => [item.id, item.evidence])));
    chapter.importHistory = [...chapter.importHistory, { importedAt: now.toISOString(), adapterId: assessment.adapterId || 'unknown', stageIds: selected.stageIds, objectiveIds: selected.objectiveIds, evidence: evidenceEntries }].slice(-20);
    if (chapter.checkedStageIds.length === definition.stages.length) finishChapter(next, selection.chapterId, selected.summary || assessment.overallSummary, now, 'curriculum_prior_learning_import');
    else chapter.status = 'Progress';
    appliedCount += 1;
  });
  if (!appliedCount) throw new Error('nothing_selected');
  return next;
}

function getSnapshot(current, now = new Date()) {
  const state = syncSurpriseReview(normalizeLearningState(current, now), now);
  const today = toLocalDateKey(now);
  const currentAssignmentIds = new Set(state.surpriseReview.assignments.map((item) => item.objectiveId));
  const reviewItems = allObjectiveRecords(state).filter(({ progress }) => progress.review.phaseIndex < 4).map((entry) => reviewItem(entry, today));
  const recoveryItems = allObjectiveRecords(state)
    .filter(({ objectiveId, progress }) => progress.review.phaseIndex >= 4 && storedObjectiveMultiplier(progress) < 1 && !currentAssignmentIds.has(objectiveId))
    .map((entry) => ({ ...reviewItem(entry, today), phaseLabel: '레이팅 복구', overdue: true }));
  const lookup = objectiveLookup();
  const surpriseAssignments = state.surpriseReview.assignments.map((assignment) => {
    const entry = lookup.get(assignment.objectiveId);
    return entry ? { ...reviewItem({ ...entry, progress: state.chapters[entry.chapter.id].objectiveProgress[assignment.objectiveId] }, today), ...assignment } : null;
  }).filter(Boolean);
  const completed = CHAPTERS.filter((chapter) => state.chapters[chapter.id].status === 'Completed').length;
  return {
    state, curriculum: CURRICULUM, chapterCatalog: CHAPTERS,
    activeChapterId: state.activeChapterId, featuredChapterId: state.activeChapterId || FEATURED_CHAPTER_ID,
    releasedProgress: { completed, total: CHAPTERS.length }, rating: calculateRating(state, now),
    reviews: {
      due: reviewItems.filter((item) => item.dueDate && item.dueDate <= today),
      upcoming: reviewItems.filter((item) => item.dueDate && item.dueDate > today),
      recovery: recoveryItems,
      surprise: {
        weekKey: state.surpriseReview.weekKey, dueDate: endOfWeekKey(state.surpriseReview.weekKey),
        completed: surpriseAssignments.filter((item) => item.status === 'graded').length,
        target: surpriseAssignments.length, configuredTarget: activeBalance.surpriseQuestionsPerWeek,
        assignments: surpriseAssignments,
      },
    },
    balance: getLearningBalance(),
  };
}

module.exports = {
  ACTIVE_CHAPTER_ID, CURRICULUM, FEATURED_CHAPTER_ID, LEARNING_VERSION, OBJECTIVES, REVIEW_OFFSETS, STAGES,
  applyCurriculumCoverage, applyCurriculumDetailAssessments, applyPriorLearningAssessment,
  buildLearningPrompt, buildObjectiveFocusPrompt, buildReviewPrompt, calculateRating, cancelChapter,
  completeObjectiveSession, completeStage, createDefaultLearningState, getLearningBalance,
  getSnapshot, gradeObjectiveReview, normalizeLearningState, setLearningBalance,
  startChapter, _addLocalDays: addLocalDays, _toLocalDateKey: toLocalDateKey, _weekKey: weekKey,
};
