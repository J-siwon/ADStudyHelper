'use strict';

const crypto = require('crypto');
const http = require('http');
const { backupPreview, parseBackup, MAX_BACKUP_BYTES } = require('./study-calendar');

const SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata';
const PURPOSE = 'adstudyhelper-study-v1';
const fingerprint = (file) => file ? `${file.id}:${file.version}` : '';

function normalizeClient(value) {
  const client = value?.installed;
  if (!client || typeof client.client_id !== 'string' || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client.client_id)
    || typeof client.client_secret !== 'string' || !client.client_secret || client.client_secret.length > 256) throw new Error('invalid_google_client');
  return { clientId: client.client_id, clientSecret: client.client_secret };
}

function authorizationUrl(clientId, redirectUri, state, verifier) {
  const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES,
    state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    access_type: 'offline', prompt: 'consent select_account' });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}

async function authorize(openExternal, clientId, timeoutMs = 180000) {
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  let resolveCode; let rejectCode; let timer;
  const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
  // A failure opening the browser must not leave an unhandled callback promise.
  codePromise.catch(() => {});
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'GET' || url.pathname !== '/' || url.searchParams.get('state') !== state) {
      response.writeHead(400); response.end('Invalid login request.'); return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    if (url.searchParams.has('error')) {
      response.end('로그인이 취소되었습니다. 앱으로 돌아가세요.'); rejectCode(new Error('google_login_cancelled'));
    } else if (!url.searchParams.get('code')) {
      response.end('로그인 응답이 올바르지 않습니다.'); rejectCode(new Error('google_login_failed'));
    } else {
      response.end('Google 연결을 확인 중입니다. 앱으로 돌아가세요.'); resolveCode(url.searchParams.get('code'));
    }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const redirectUri = `http://127.0.0.1:${server.address().port}/`;
    timer = setTimeout(() => rejectCode(new Error('google_login_timeout')), timeoutMs);
    await openExternal(authorizationUrl(clientId, redirectUri, state, verifier));
    const code = await codePromise;
    return { code, verifier, redirectUri };
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  }
}

async function limitedText(response) {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_BACKUP_BYTES) throw new Error('invalid_backup');
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BACKUP_BYTES) throw new Error('invalid_backup');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}

class GoogleBackup {
  constructor({ store, safeStorage, openExternal, fetchImpl = fetch, authorizeImpl = authorize, now = () => new Date() }) {
    Object.assign(this, { store, safeStorage, openExternal, fetchImpl, authorizeImpl, now });
    this.busy = false; this.error = ''; this.conflict = null; this.preview = null; this.timer = null; this.generation = 0;
    try {
      const encrypted = store.getGoogleTokens();
      if (encrypted && safeStorage.isEncryptionAvailable()) this.tokens = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
    } catch { this.error = 'google_reconnect_required'; }
  }

  status() {
    const meta = this.store.getGoogleBackupMeta();
    return { configured: !!this.store.getGoogleClient(), connected: !!this.tokens, email: this.tokens?.email || '',
      busy: this.busy, error: this.error, lastBackupAt: meta.lastBackupAt || null, lastRestoreAt: meta.lastRestoreAt || null,
      conflict: this.conflict ? { token: this.conflict.token, modifiedAt: this.conflict.file?.modifiedTime || null } : null };
  }

  persistTokens() {
    if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('secure_storage_unavailable');
    this.store.setGoogleTokens(this.safeStorage.encryptString(JSON.stringify(this.tokens)).toString('base64'));
  }

  async run(action) {
    if (this.busy) throw new Error('backup_busy');
    this.busy = true; this.error = '';
    try { return await action(); } catch (error) {
      const codes = ['google_reconnect_required', 'google_login_cancelled', 'google_login_failed', 'google_login_timeout', 'secure_storage_unavailable',
        'google_client_required', 'google_not_connected', 'backup_conflict', 'no_backup', 'invalid_backup', 'restore_preview_expired', 'backup_too_large'];
      this.error = codes.includes(error.message) ? error.message : 'google_request_failed';
      throw new Error(this.error);
    } finally { this.busy = false; }
  }

  configure(json) {
    if (this.busy || this.tokens) throw new Error('disconnect_before_configure');
    this.store.setGoogleClient(normalizeClient(json));
    this.error = '';
    return this.status();
  }

  async tokenRequest(params) {
    const client = this.store.getGoogleClient();
    if (!client) throw new Error('google_client_required');
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST',
      body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, ...params }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) throw new Error('google_reconnect_required');
      throw new Error('google_request_failed');
    }
    const tokens = await response.json();
    if (typeof tokens.access_token !== 'string' || !Number.isFinite(tokens.expires_in)) throw new Error('google_login_failed');
    return tokens;
  }

  async connect() {
    await this.run(async () => {
      const client = this.store.getGoogleClient();
      if (!client) throw new Error('google_client_required');
      if (this.tokens) throw new Error('google_already_connected');
      if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('secure_storage_unavailable');
      const generation = this.generation;
      const auth = await this.authorizeImpl(this.openExternal, client.clientId);
      const result = await this.tokenRequest({ grant_type: 'authorization_code', code: auth.code, code_verifier: auth.verifier, redirect_uri: auth.redirectUri });
      if (!result.refresh_token || !SCOPES.split(' ').filter((scope) => scope.includes('drive.')).every((scope) => result.scope?.split(' ').includes(scope))) throw new Error('google_login_failed');
      const response = await this.fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${result.access_token}` }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('google_login_failed');
      const user = await response.json();
      if (typeof user.sub !== 'string' || typeof user.email !== 'string' || generation !== this.generation) throw new Error('google_login_failed');
      this.tokens = { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: this.now().getTime() + result.expires_in * 1000, sub: user.sub, email: user.email };
      try { this.persistTokens(); } catch (error) { this.tokens = null; throw error; }
      const meta = this.store.getGoogleBackupMeta();
      this.store.setGoogleBackupMeta({ deviceId: meta.deviceId || crypto.randomUUID(), account: user.sub });
      this.preview = null; this.conflict = null;
      // A connection never automatically replaces an existing remote backup.
      const remote = await this.latest();
      if (remote) this.setConflict(remote);
    });
    return this.status();
  }

  disconnect() {
    if (this.busy) throw new Error('backup_busy');
    this.generation += 1; this.tokens = null; this.preview = null; this.conflict = null; this.error = '';
    this.store.setGoogleTokens(''); this.store.setGoogleBackupMeta({ deviceId: this.store.getGoogleBackupMeta().deviceId || crypto.randomUUID() });
    return this.status();
  }

  async accessToken(force = false) {
    if (!this.tokens) throw new Error('google_not_connected');
    if (force || this.tokens.expiresAt < this.now().getTime() + 60000) {
      const result = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken });
      this.tokens = { ...this.tokens, accessToken: result.access_token, refreshToken: result.refresh_token || this.tokens.refreshToken, expiresAt: this.now().getTime() + result.expires_in * 1000 };
      this.persistTokens();
    }
    return this.tokens.accessToken;
  }

  async request(url, options = {}, retry = true) {
    const response = await this.fetchImpl(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(30000) });
    if (response.status === 401 && retry) { await this.accessToken(true); return this.request(url, options, false); }
    if (!response.ok) {
      if (response.status === 401) throw new Error('google_reconnect_required');
      throw new Error('google_request_failed');
    }
    return response;
  }

  async latest() {
    const query = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and appProperties has { key='purpose' and value='${PURPOSE}' }`,
      fields: 'nextPageToken,files(id,modifiedTime,version,appProperties)', orderBy: 'modifiedTime desc', pageSize: '100' });
    const response = await this.request(`https://www.googleapis.com/drive/v3/files?${query}`);
    const result = await response.json();
    return result.files?.[0] || null;
  }

  setConflict(file) {
    this.conflict = { file, fingerprint: fingerprint(file), token: crypto.randomBytes(24).toString('base64url') };
    this.error = 'backup_conflict';
  }

  async backup(overwriteToken) {
    await this.run(async () => {
      const meta = this.store.getGoogleBackupMeta();
      const remote = await this.latest();
      const current = fingerprint(remote);
      if (current !== (meta.seenRemote || '')) {
        if (!overwriteToken || overwriteToken !== this.conflict?.token || current !== this.conflict.fingerprint) {
          this.setConflict(remote); throw new Error('backup_conflict');
        }
      }
      const payload = JSON.stringify(this.store.exportStudyBackup(this.now()));
      const revision = this.store.getStudyRevision();
      if (Buffer.byteLength(payload) > MAX_BACKUP_BYTES) throw new Error('backup_too_large');
      let response;
      // Each installation owns one file. Concurrent PCs retain separate files, so
      // a race between list and upload cannot erase another PC's backup.
      if (meta.ownFileId) {
        const verify = await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(meta.ownFileId)}?fields=id,appProperties`);
        const owned = await verify.json();
        if (owned.appProperties?.deviceId !== meta.deviceId || owned.appProperties?.purpose !== PURPOSE) throw new Error('google_request_failed');
        response = await this.request(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(meta.ownFileId)}?uploadType=media&fields=id,modifiedTime,version,appProperties`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload });
      } else {
        const boundary = `adstudy_${crypto.randomBytes(16).toString('hex')}`;
        const metadata = { name: `adstudyhelper-study-${meta.deviceId}.json`, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: { purpose: PURPOSE, deviceId: meta.deviceId } };
        const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--${boundary}--\r\n`;
        response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime,version,appProperties', {
          method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      }
      const uploaded = await response.json();
      this.store.setGoogleBackupMeta({ ...meta, ownFileId: uploaded.id, seenRemote: fingerprint(uploaded), lastBackupAt: this.now().toISOString(), backedRevision: revision });
      this.conflict = null; this.preview = null;
    });
    return this.status();
  }

  async previewRestore() {
    const result = await this.run(async () => {
      const file = await this.latest();
      if (!file) throw new Error('no_backup');
      const response = await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`);
      const backup = parseBackup(await limitedText(response));
      const after = await this.latest();
      if (fingerprint(after) !== fingerprint(file)) { this.setConflict(after); throw new Error('backup_conflict'); }
      const token = crypto.randomBytes(24).toString('base64url');
      this.preview = { token, backup, file, sub: this.tokens.sub, expiresAt: this.now().getTime() + 10 * 60000 };
      return { token, ...backupPreview(backup) };
    });
    return result;
  }

  async confirmRestore(token) {
    await this.run(async () => {
      const preview = this.preview;
      if (!preview || token !== preview.token || preview.sub !== this.tokens?.sub || preview.expiresAt < this.now().getTime()) throw new Error('restore_preview_expired');
      const remote = await this.latest();
      if (fingerprint(remote) !== fingerprint(preview.file)) { this.setConflict(remote); this.preview = null; throw new Error('backup_conflict'); }
      this.store.restoreStudyBackup(preview.backup);
      const meta = this.store.getGoogleBackupMeta();
      this.store.setGoogleBackupMeta({ ...meta, seenRemote: fingerprint(remote), lastRestoreAt: this.now().toISOString(), backedRevision: this.store.getStudyRevision() });
      this.preview = null; this.conflict = null;
    });
    return this.status();
  }

  cancelRestore() { this.preview = null; }

  start() {
    this.timer = setInterval(() => {
      if (this.tokens && !this.busy && !this.conflict && this.store.getStudyRevision() !== this.store.getGoogleBackupMeta().backedRevision) this.backup().catch(() => {});
    }, 5 * 60000);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); this.preview = null; }
}

module.exports = { GoogleBackup, authorizationUrl, authorize, normalizeClient };
