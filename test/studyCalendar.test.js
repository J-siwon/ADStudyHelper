'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const calendar = require('../src/main/study-calendar');
const learning = require('../src/main/learning');
const { CHAPTERS } = require('../src/main/learning-catalog');
const now = new Date('2026-09-17T12:00:00');
const chapter = CHAPTERS[0]; const objective = chapter.objectives[0];
const complete = (state) => learning.completeObjectiveSession(state, chapter.id, objective.id, 'test evidence', now).state;

function backup(state = learning.createDefaultLearningState()) {
  return { schema: calendar.BACKUP_SCHEMA, createdAt: now.toISOString(), workSeconds: { '2026-09-16': 3600 },
    studyDays: calendar.updateDay({}, state, [], now), learning: state };
}

// Execute the real store module with an in-memory electron-store adapter.
function storeFixture(initial = {}) {
  let data = structuredClone(initial); const safetyCopies = [];
  class MemoryStore {
    constructor() { this.path = 'C:/test/ad-study-helper.json'; }
    get(key, fallback) { const value = key.split('.').reduce((item, part) => item?.[part], data); return value === undefined ? fallback : structuredClone(value); }
    set(key, value) { const parts = key.split('.'); let next = data; for (const part of parts.slice(0, -1)) next = next[part] ||= {}; next[parts.at(-1)] = structuredClone(value); }
    get store() { return structuredClone(data); }
    set store(value) { data = structuredClone(value); }
  }
  const filename = path.resolve(__dirname, '../src/main/store.js'); const instance = new Module(filename);
  const actualRequire = Module.createRequire(filename);
  instance.require = (name) => name === 'electron-store' ? MemoryStore : name === 'fs' ? {
    writeFileSync: (file, text) => safetyCopies.push({ file, backup: JSON.parse(text) }),
  } : actualRequire(name);
  instance._compile(fs.readFileSync(filename, 'utf8'), filename);
  return { store: instance.exports, data: () => data, safetyCopies };
}

test('month includes legacy seconds without fabricating historical summaries', () => {
  const rows = calendar.monthRecords('2026-02', { '2026-02-10': 3600 }, {});
  assert.equal(rows.length, 28); assert.equal(rows[9].workSeconds, 3600); assert.equal(rows[9].summary, null); assert.deepEqual(rows[9].events, []);
  assert.equal(calendar.monthRecords('2028-02', {}, {}).length, 29);
  assert.throws(() => calendar.monthRecords('2026-13', {}, {}), /invalid_month/);
});

test('local midnight creates a new snapshot while preserving the prior tier', () => {
  let days = calendar.updateDay({}, learning.createDefaultLearningState(), [], new Date('2026-09-17T23:59:59'));
  const before = structuredClone(days['2026-09-17']);
  days = calendar.updateDay(days, complete(learning.createDefaultLearningState()), [], new Date('2026-09-18T00:00:01'));
  assert.deepEqual(days['2026-09-17'], before); assert.equal(days['2026-09-18'].summary.completedObjectives, 1);
});

test('completion events are deduplicated and progress uses objectives', () => {
  const before = learning.createDefaultLearningState(); const after = complete(before);
  const events = calendar.learningEvents(before, after, now);
  assert.equal(events.length, 1); assert.equal(events[0].type, 'complete');
  let days = calendar.updateDay({}, after, events, now); days = calendar.updateDay(days, after, events, now);
  assert.equal(days['2026-09-17'].events.length, 1); assert.equal(days['2026-09-17'].summary.progress, 1 / 200);
  assert.deepEqual(calendar.learningEvents(after, after, now), []);
});

test('review transitions and imports are recorded, repeated snapshot reads add nothing', () => {
  const before = complete(learning.createDefaultLearningState());
  const after = learning.gradeObjectiveReview(before, chapter.id, objective.id, 'partial', new Date('2026-09-17T13:00:00'));
  assert.equal(calendar.learningEvents(before, after, now)[0].grade, 'partial');
  assert.deepEqual(calendar.learningEvents(after, after, now), []);
  const imported = structuredClone(after);
  imported.chapters[chapter.id].importHistory.push({ importedAt: now.toISOString(), objectiveIds: [objective.id], stageIds: [], adapterId: 'test', evidence: [] });
  assert.equal(calendar.learningEvents(after, imported, now)[0].type, 'import');
});

test('backup validation rejects invalid dates, malformed goals, unsafe numbers and unknown schemas', () => {
  for (const change of [
    (b) => { b.schema = 'unknown'; }, (b) => { b.workSeconds['2026-02-30'] = 1; },
    (b) => { b.workSeconds['2026-09-16'] = -1; }, (b) => { b.studyDays['2026-09-17'].summary.progress = 2; },
    (b) => { b.learning.chapters[chapter.id].checkedObjectiveIds = ['unknown']; },
    (b) => { delete b.learning.chapters[chapter.id]; },
  ]) { const b = backup(); change(b); assert.throws(() => calendar.parseBackup(JSON.stringify(b)), /invalid_backup/); }
  assert.throws(() => calendar.parseBackup('{'), /invalid_backup/);
});

test('backup whitelist excludes configuration and secrets', () => {
  const b = { ...backup(), settings: { telegram: 'secret' }, googleTokens: 'secret', phonePairingToken: 'secret' };
  const normalized = calendar.validateBackup(b);
  assert.deepEqual(Object.keys(normalized).sort(), ['createdAt', 'learning', 'schema', 'studyDays', 'workSeconds']);
});

test('real store records confirmed progress once and preserves legacy work seconds', () => {
  const { store } = storeFixture({ workSeconds: { '2026-09-16': 900 } });
  const state = complete(store.getLearningState()); store.setLearningState(state); store.setLearningState(state);
  const row = store.getStudyMonth(calendar.dateKey().slice(0, 7)).find((item) => item.date === calendar.dateKey());
  assert.equal(row.events.filter((event) => event.type === 'complete').length, 1);
  assert.equal(store.exportStudyBackup().workSeconds['2026-09-16'], 900);
  const revision = store.getStudyRevision(); store.addWorkSeconds(1);
  assert.equal(store.getTodayWorkSeconds(), 1); assert.notEqual(store.getStudyRevision(), revision);
});

test('real store creates a day even without WORK and keeps old summary unchanged', () => {
  const { store, data } = storeFixture();
  store.ensureStudyDay(new Date('2026-09-16T23:59:59'));
  const previous = structuredClone(data().studyDays['2026-09-16']);
  store.ensureStudyDay(now); assert.deepEqual(data().studyDays['2026-09-16'], previous);
  assert.ok(data().studyDays['2026-09-17']);
});

test('real store restores study data atomically after making a copy, retaining secrets', () => {
  const { store, data, safetyCopies } = storeFixture({ settings: { telegram: { botToken: 'local' } }, phonePairingToken: 'phone', googleTokens: 'encrypted', workSeconds: { '2026-09-15': 42 } });
  store.restoreStudyBackup(backup(complete(learning.createDefaultLearningState())));
  assert.equal(safetyCopies.length, 1); assert.equal(safetyCopies[0].backup.workSeconds['2026-09-15'], 42);
  assert.equal(data().workSeconds['2026-09-16'], 3600); assert.equal(data().phonePairingToken, 'phone');
  assert.equal(data().settings.telegram.botToken, 'local'); assert.equal(data().googleTokens, 'encrypted');
  assert.throws(() => store.restoreStudyBackup({}), /invalid_backup/); assert.equal(safetyCopies.length, 1);
});

test('old day summary survives a rating balance change', () => {
  const state = complete(learning.createDefaultLearningState()); let days = calendar.updateDay({}, state, [], now);
  const prior = structuredClone(days['2026-09-17']); const defaults = learning.getLearningBalance();
  try {
    learning.setLearningBalance({ ...defaults, objectiveRp: { basic: 100, applied: 200, advanced: 300 } });
    days = calendar.updateDay(days, state, [], new Date('2026-09-18T12:00:00'));
    assert.deepEqual(days['2026-09-17'], prior); assert.notEqual(days['2026-09-18'].summary.earnedRp, prior.summary.earnedRp);
  } finally { learning.setLearningBalance(defaults); }
});
