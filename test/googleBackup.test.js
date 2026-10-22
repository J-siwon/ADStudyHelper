'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { GoogleBackup, authorizationUrl, authorize, normalizeClient } = require('../src/main/google-backup');
const calendar = require('../src/main/study-calendar');
const learning = require('../src/main/learning');
const now = new Date('2026-09-17T12:00:00');
const client = { installed: { client_id: '123-test.apps.googleusercontent.com', client_secret: 'desktop-client-value' } };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

function fixture({ remote = null, failUpload = false, secure = true, expired = false } = {}) {
  let current = remote; let revision = 'one'; let restored = 0; let encrypted = '';
  let meta = { deviceId: 'device-one', account: 'user-one', seenRemote: remote ? `${remote.id}:${remote.version}` : '' };
  const requests = []; const b = { schema: calendar.BACKUP_SCHEMA, createdAt: now.toISOString(), workSeconds: { '2026-09-17': 600 }, studyDays: {}, learning: learning.createDefaultLearningState() };
  const store = {
    getGoogleTokens: () => encrypted, setGoogleTokens: (value) => { encrypted = value; },
    getGoogleClient: () => normalizeClient(client), setGoogleClient: () => {},
    getGoogleBackupMeta: () => meta, setGoogleBackupMeta: (value) => { meta = value; },
    getStudyRevision: () => revision, exportStudyBackup: () => b,
    restoreStudyBackup: () => { restored += 1; revision = 'restored'; },
  };
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes('/token')) return json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, scope: 'openid email https://www.googleapis.com/auth/drive.appdata' });
    if (url.includes('/userinfo')) return json({ sub: 'user-one', email: 'person@example.com' });
    if (url.includes('/upload/')) {
      if (failUpload) return json({}, 503);
      current = { id: 'owned', version: String(Number(current?.version || 0) + 1), modifiedTime: now.toISOString(), appProperties: { deviceId: 'device-one', purpose: 'adstudyhelper-study-v1' } };
      return json(current);
    }
    if (url.includes('alt=media')) return json(b);
    if (url.includes('/files?')) return json({ files: current ? [current] : [] });
    if (url.includes('/files/')) return json({ id: 'owned', appProperties: { deviceId: 'device-one', purpose: 'adstudyhelper-study-v1' } });
    throw new Error('unexpected request');
  };
  const safeStorage = { isEncryptionAvailable: () => secure, encryptString: (text) => Buffer.from(text), decryptString: (buffer) => buffer.toString() };
  const instance = new GoogleBackup({ store, safeStorage, openExternal: async () => {}, fetchImpl, now: () => now,
    authorizeImpl: async () => ({ code: 'code', verifier: 'verifier', redirectUri: 'http://127.0.0.1:123/' }) });
  instance.tokens = { accessToken: 'access', refreshToken: 'refresh', email: 'person@example.com', sub: 'user-one', expiresAt: expired ? 0 : now.getTime() + 3600000 };
  return { instance, requests, store, meta: () => meta, restored: () => restored, encrypted: () => encrypted,
    changeRemote: (file) => { current = file; }, revision: (value) => { revision = value; } };
}

test('OAuth uses installed credentials, PKCE, state and only app data access', () => {
  assert.equal(normalizeClient(client).clientId, client.installed.client_id);
  assert.throws(() => normalizeClient({ web: client.installed }), /invalid_google_client/);
  const url = new URL(authorizationUrl(client.installed.client_id, 'http://127.0.0.1:1/', 'state', 'verifier'));
  assert.equal(url.origin, 'https://accounts.google.com'); assert.equal(url.searchParams.get('state'), 'state');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256'); assert.ok(url.searchParams.get('code_challenge'));
  assert.ok(url.searchParams.get('scope').includes('drive.appdata')); assert.ok(!url.searchParams.get('scope').includes('calendar'));
});

test('loopback login rejects wrong state, accepts correct state and closes listener', async () => {
  let redirect;
  const result = await authorize(async (authorization) => {
    const url = new URL(authorization); redirect = url.searchParams.get('redirect_uri');
    const wrong = await fetch(`${redirect}?state=wrong&code=wrong`); assert.equal(wrong.status, 400);
    const correct = await fetch(`${redirect}?state=${url.searchParams.get('state')}&code=test-code`); assert.equal(correct.status, 200);
  }, client.installed.client_id, 2000);
  assert.equal(result.code, 'test-code'); assert.equal(result.verifier.length, 43);
  await assert.rejects(fetch(redirect));
});

test('loopback cancellation and browser failure release resources', async () => {
  await assert.rejects(authorize(async (authorization) => {
    const url = new URL(authorization); await fetch(`${url.searchParams.get('redirect_uri')}?state=${url.searchParams.get('state')}&error=access_denied`);
  }, client.installed.client_id, 2000), /google_login_cancelled/);
  await assert.rejects(authorize(async () => { throw new Error('browser unavailable'); }, client.installed.client_id, 2000), /browser unavailable/);
  await assert.rejects(authorize(async () => {}, client.installed.client_id, 20), /google_login_timeout/);
});

test('first backup creates appDataFolder file and subsequent backup updates only own file', async () => {
  const f = fixture(); await f.instance.backup();
  const create = f.requests.find((request) => request.url.includes('/upload/'));
  assert.equal(create.options.method, 'POST'); assert.ok(create.options.body.includes('appDataFolder'));
  assert.ok(create.options.body.includes(calendar.BACKUP_SCHEMA)); assert.ok(!create.options.body.includes('refreshToken'));
  assert.equal(f.meta().backedRevision, 'one'); await f.instance.backup();
  assert.equal(f.requests.filter((r) => r.url.includes('/upload/'))[1].options.method, 'PATCH');
  assert.equal(f.meta().ownFileId, 'owned');
});

test('remote changes pause backup and require confirmation tied to latest version', async () => {
  const f = fixture(); f.changeRemote({ id: 'other', version: '2', modifiedTime: now.toISOString() });
  await assert.rejects(f.instance.backup(), /backup_conflict/); assert.equal(f.requests.filter((r) => r.url.includes('/upload/')).length, 0);
  const oldToken = f.instance.status().conflict.token; f.changeRemote({ id: 'other', version: '3' });
  await assert.rejects(f.instance.backup(oldToken), /backup_conflict/);
  await f.instance.backup(f.instance.status().conflict.token); assert.equal(f.instance.status().conflict, null);
});

test('offline upload keeps local records dirty and reports failure', async () => {
  const f = fixture({ failUpload: true }); await assert.rejects(f.instance.backup(), /google_request_failed/);
  assert.equal(f.meta().backedRevision, undefined); assert.equal(f.store.getStudyRevision(), 'one'); assert.equal(f.restored(), 0);
});

test('expired access token refreshes and persists tokens without exposing them in status', async () => {
  const f = fixture({ expired: true }); await f.instance.backup();
  assert.equal(f.requests.filter((r) => r.url.includes('/token')).length, 1); assert.ok(f.encrypted());
  assert.ok(!JSON.stringify(f.instance.status()).includes('new-refresh')); assert.ok(!JSON.stringify(f.instance.status()).includes('new-access'));
});

test('restore preview does not mutate local state, cancellation invalidates token', async () => {
  const f = fixture({ remote: { id: 'other', version: '2' } }); const preview = await f.instance.previewRestore();
  assert.equal(preview.workSeconds, 600); assert.equal(f.restored(), 0);
  f.instance.cancelRestore(); await assert.rejects(f.instance.confirmRestore(preview.token), /restore_preview_expired/); assert.equal(f.restored(), 0);
});

test('restore applies only the reviewed version, and changed remote invalidates preview', async () => {
  const f = fixture({ remote: { id: 'other', version: '2' } }); const preview = await f.instance.previewRestore();
  f.changeRemote({ id: 'other', version: '3' }); await assert.rejects(f.instance.confirmRestore(preview.token), /backup_conflict/); assert.equal(f.restored(), 0);
  const next = await f.instance.previewRestore(); await f.instance.confirmRestore(next.token);
  assert.equal(f.restored(), 1); assert.equal(f.meta().seenRemote, 'other:3'); assert.equal(f.meta().backedRevision, 'restored');
});

test('malformed remote backup does not restore', async () => {
  const f = fixture({ remote: { id: 'other', version: '1' } });
  const original = f.instance.fetchImpl;
  f.instance.fetchImpl = (url, options) => url.includes('alt=media') ? Promise.resolve(json({ schema: 'wrong' })) : original(url, options);
  await assert.rejects(f.instance.previewRestore(), /invalid_backup/); assert.equal(f.restored(), 0);
});

test('connection uses secure storage, existing remote requires a restore or backup decision', async () => {
  const f = fixture({ remote: { id: 'other', version: '1' } }); f.instance.tokens = null;
  await f.instance.connect(); assert.equal(f.instance.status().email, 'person@example.com'); assert.ok(f.instance.status().conflict); assert.ok(f.encrypted());
  f.instance.disconnect(); assert.equal(f.encrypted(), ''); assert.equal(f.instance.status().connected, false);
  const unsafe = fixture({ secure: false }); unsafe.instance.tokens = null; await assert.rejects(unsafe.instance.connect(), /secure_storage_unavailable/);
});

test('one unauthorized request retries token refresh, further denial requires reconnect', async () => {
  const f = fixture(); const original = f.instance.fetchImpl; let denied = false;
  f.instance.fetchImpl = async (url, options) => {
    if (!url.includes('/token') && !denied) { denied = true; return json({}, 401); }
    return original(url, options);
  };
  await f.instance.backup(); assert.equal(f.requests.filter((r) => r.url.includes('/token')).length, 1);
  f.instance.fetchImpl = async (url, options) => url.includes('/token') ? original(url, options) : json({}, 401);
  await assert.rejects(f.instance.backup(), /google_reconnect_required/);
});

test('automatic backup runs at five minutes, retries failure and pauses on conflict', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); const original = f.instance.fetchImpl; let fail = true;
  f.instance.fetchImpl = async (url, options) => url.includes('/upload/') && fail ? json({}, 503) : original(url, options);
  f.instance.start();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(299999); await flush(); assert.equal(f.meta().backedRevision, undefined); assert.equal(f.requests.length, 0);
  t.mock.timers.tick(1); await flush(); assert.equal(f.instance.status().error, 'google_request_failed'); assert.equal(f.meta().backedRevision, undefined);
  fail = false; t.mock.timers.tick(300000); await flush(); assert.equal(f.meta().backedRevision, 'one');
  f.revision('two'); f.changeRemote({ id: 'other', version: '9' });
  t.mock.timers.tick(300000); await flush(); assert.ok(f.instance.status().conflict);
  const count = f.requests.length; t.mock.timers.tick(300000); await flush(); assert.equal(f.requests.length, count);
  f.instance.stop();
});

test('a new day created during export is included in the backed revision', async () => {
  const f = fixture(); const exportBackup = f.store.exportStudyBackup;
  f.store.exportStudyBackup = () => { f.revision('new-day'); return exportBackup(); };
  await f.instance.backup(); assert.equal(f.meta().backedRevision, 'new-day');
});
