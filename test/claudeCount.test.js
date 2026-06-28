'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startControlServer, stopControlServer, getClaudeCount } = require('../src/main/controlServer');

// 실행 중인 앱(47616)과 충돌하지 않도록 별도 포트 사용.
const TEST_PORT = 47621;

/** GET http://127.0.0.1:<port><path> → { statusCode, json } */
function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, json: JSON.parse(body) }));
    }).on('error', reject);
  });
}

before(() => startControlServer(TEST_PORT));
after(() => stopControlServer());

test('세션별 작업중 핑이 컴퓨터 대수(count)로 집계된다', async () => {
  // 신규 세션마다 +1
  let r = await get('/claude/working?id=AAA');
  assert.equal(r.json.count, 1);
  r = await get('/claude/working?id=BBB');
  assert.equal(r.json.count, 2);
  r = await get('/claude/working?id=CCC');
  assert.equal(r.json.count, 3);
  assert.equal(getClaudeCount(), 3);

  // 같은 세션 재핑은 늘지 않음
  r = await get('/claude/working?id=AAA');
  assert.equal(r.json.count, 3);

  // done은 해당 세션만 제거
  r = await get('/claude/done?id=BBB');
  assert.equal(r.json.count, 2);
  assert.equal(r.json.working, true);

  // 모두 종료 → 0, working=false
  await get('/claude/done?id=AAA');
  r = await get('/claude/done?id=CCC');
  assert.equal(r.json.count, 0);
  assert.equal(r.json.working, false);
});

test('id 없는 핑은 default 세션 하나로 합쳐진다(하위호환)', async () => {
  let r = await get('/claude/working');
  assert.equal(r.json.count, 1);
  r = await get('/claude/working');   // 또 id 없음 → 여전히 1
  assert.equal(r.json.count, 1);
  r = await get('/claude/done');
  assert.equal(r.json.count, 0);
});
