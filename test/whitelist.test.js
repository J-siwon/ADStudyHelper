'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('../src/main/whitelist.js');

const config = {
  apps: ['Code', 'WindowsTerminal', 'cmd'],
  urlPatterns: ['docs.google.com', 'github.com/*', 'stackoverflow.com'],
};

describe('whitelist.evaluate — 비크롬 앱', () => {
  it('허용 앱이면 WORK 반환', () => {
    assert.equal(evaluate({ app: 'Code', isChrome: false, url: '', extensionConnected: false }, config), 'WORK');
  });

  it('허용 앱 대소문자 무시', () => {
    assert.equal(evaluate({ app: 'code', isChrome: false, url: '', extensionConnected: false }, config), 'WORK');
  });

  it('비허용 앱이면 BREAK 반환', () => {
    assert.equal(evaluate({ app: 'notepad', isChrome: false, url: '', extensionConnected: false }, config), 'BREAK');
  });
});

describe('whitelist.evaluate — 크롬', () => {
  it('확장 미연결이면 BREAK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://github.com/test', extensionConnected: false }, config), 'BREAK');
  });

  it('허용 URL 패턴 매칭 → WORK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://docs.google.com/doc', extensionConnected: true }, config), 'WORK');
  });

  it('와일드카드 패턴 매칭 → WORK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://github.com/myrepo', extensionConnected: true }, config), 'WORK');
  });

  it('비허용 URL → BREAK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://youtube.com/watch', extensionConnected: true }, config), 'BREAK');
  });

  it('url 없으면 BREAK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: '', extensionConnected: true }, config), 'BREAK');
  });
});
