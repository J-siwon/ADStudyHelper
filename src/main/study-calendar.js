'use strict';

const crypto = require('crypto');
const learning = require('./learning');
const { CHAPTERS } = require('./learning-catalog');

const BACKUP_SCHEMA = 'adstudyhelper-study-backup/v1';
const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
const plain = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

function dateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validDate(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === key;
}

function summary(state, now = new Date()) {
  const rating = learning.calculateRating(learning.normalizeLearningState(state, now), now);
  return {
    tier: rating.tier.display, rp: rating.effectiveRp, earnedRp: rating.earnedRp,
    completedObjectives: rating.achievedObjectives, totalObjectives: rating.totalObjectives,
    progress: rating.totalObjectives ? rating.achievedObjectives / rating.totalObjectives : 0,
  };
}

// Compare actual state transitions; opening an existing save must not invent old events.
function learningEvents(before, after, now = new Date()) {
  const events = [];
  const at = now.toISOString();
  CHAPTERS.forEach((chapter) => {
    const old = before.chapters[chapter.id]; const next = after.chapters[chapter.id];
    chapter.objectives.forEach((objective) => {
      const previous = old.objectiveProgress[objective.id]; const current = next.objectiveProgress[objective.id];
      const base = { chapterId: chapter.id, chapterTitle: chapter.title, objectiveId: objective.id, title: objective.description };
      if (!previous && current) events.push({ ...base, id: `complete:${objective.id}`, type: 'complete', at, source: current.source });
      if (previous && current && current.review.lastReviewedAt && (
        previous.review.lastReviewedAt !== current.review.lastReviewedAt
        || previous.review.lastGrade !== current.review.lastGrade
        || previous.review.phaseIndex !== current.review.phaseIndex
      )) events.push({ ...base, id: `review:${objective.id}:${current.review.lastReviewedAt}:${current.review.lastGrade}:${current.review.phaseIndex}`, type: 'review', at, grade: current.review.lastGrade });
    });
    const oldImports = new Set(old.importHistory.map((item) => JSON.stringify(item)));
    next.importHistory.filter((item) => !oldImports.has(JSON.stringify(item))).forEach((item) => {
      const id = crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');
      events.push({ id: `import:${chapter.id}:${id}`, type: 'import', at, chapterId: chapter.id, chapterTitle: chapter.title, title: '기존 학습 가져오기' });
    });
  });
  return events;
}

function updateDay(days, state, events = [], now = new Date()) {
  const key = dateKey(now);
  const previous = days[key] || { events: [] };
  const known = new Set(previous.events.map((event) => event.id));
  const next = { summary: summary(state, now), events: [...previous.events, ...events.filter((event) => !known.has(event.id))] };
  return { ...days, [key]: next };
}

function monthRecords(month, seconds, days) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('invalid_month');
  const [year, number] = month.split('-').map(Number);
  const count = new Date(year, number, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    return { date, workSeconds: seconds[date] || 0, summary: days[date]?.summary || null, events: days[date]?.events || [] };
  });
}

function validateBackup(value) {
  const fail = () => { throw new Error('invalid_backup'); };
  if (!plain(value) || value.schema !== BACKUP_SCHEMA || !Number.isFinite(Date.parse(value.createdAt))) fail();
  if (!plain(value.workSeconds) || !plain(value.studyDays) || !plain(value.learning) || value.learning.version !== learning.LEARNING_VERSION || !plain(value.learning.chapters)) fail();
  for (const [date, seconds] of Object.entries(value.workSeconds)) {
    if (!validDate(date) || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 86400) fail();
  }
  for (const [date, day] of Object.entries(value.studyDays)) {
    if (!validDate(date) || !plain(day) || !plain(day.summary) || !Array.isArray(day.events)) fail();
    const s = day.summary;
    if (typeof s.tier !== 'string' || s.tier.length > 80 || !['rp', 'earnedRp', 'progress', 'completedObjectives', 'totalObjectives'].every((key) => Number.isFinite(s[key]) && s[key] >= 0)
      || s.progress > 1 || s.completedObjectives > s.totalObjectives) fail();
    if (day.events.some((event) => !plain(event) || typeof event.id !== 'string' || typeof event.title !== 'string'
      || typeof event.chapterTitle !== 'string' || !['complete', 'review', 'import'].includes(event.type) || !Number.isFinite(Date.parse(event.at)))) fail();
  }
  for (const chapter of CHAPTERS) {
    const saved = value.learning.chapters[chapter.id];
    if (!plain(saved) || !Array.isArray(saved.checkedObjectiveIds) || !Array.isArray(saved.checkedStageIds)
      || saved.checkedObjectiveIds.some((id) => !chapter.objectives.some((objective) => objective.id === id))
      || saved.checkedStageIds.some((id) => !chapter.stages.some((stage) => stage.id === id))) fail();
  }
  // Only these three roots may cross the backup boundary.
  return { schema: BACKUP_SCHEMA, createdAt: value.createdAt, workSeconds: value.workSeconds, studyDays: value.studyDays, learning: learning.normalizeLearningState(value.learning) };
}

function parseBackup(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BACKUP_BYTES) throw new Error('invalid_backup');
  try { return validateBackup(JSON.parse(text)); } catch { throw new Error('invalid_backup'); }
}

function backupPreview(backup) {
  const dates = [...new Set([...Object.keys(backup.workSeconds), ...Object.keys(backup.studyDays)])].sort();
  return { createdAt: backup.createdAt, from: dates[0] || null, to: dates.at(-1) || null, days: dates.length,
    workSeconds: Object.values(backup.workSeconds).reduce((total, seconds) => total + seconds, 0), ...summary(backup.learning) };
}

module.exports = { BACKUP_SCHEMA, MAX_BACKUP_BYTES, backupPreview, dateKey, learningEvents, monthRecords, parseBackup, summary, updateDay, validateBackup };
