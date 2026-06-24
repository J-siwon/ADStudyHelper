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

  // get-windows v9는 친근한 표시 이름(owner.name)을 반환한다:
  //   VS Code → "Visual Studio Code", 터미널 → "Windows Terminal Host", 메모장 → "Notepad.exe"
  // 화이트리스트 키워드가 실제 앱 이름의 일부면 매칭되어야 한다.
  it('실제 앱 이름이 키워드를 포함하면 WORK (VS Code)', () => {
    assert.equal(evaluate({ app: 'Visual Studio Code', isChrome: false, url: '', extensionConnected: false }, config), 'WORK');
  });

  it('실제 앱 이름이 키워드를 포함하면 WORK (Windows Terminal Host)', () => {
    const c = { apps: ['Terminal'], urlPatterns: [] };
    assert.equal(evaluate({ app: 'Windows Terminal Host', isChrome: false, url: '', extensionConnected: false }, c), 'WORK');
  });

  it('.exe 접미사가 붙어도 키워드 포함이면 WORK (Notepad.exe)', () => {
    const c = { apps: ['Notepad'], urlPatterns: [] };
    assert.equal(evaluate({ app: 'Notepad.exe', isChrome: false, url: '', extensionConnected: false }, c), 'WORK');
  });

  it('포함되지 않는 앱은 여전히 BREAK', () => {
    assert.equal(evaluate({ app: 'JetBrains Rider', isChrome: false, url: '', extensionConnected: false }, config), 'BREAK');
  });

  it('빈 앱 이름은 BREAK (빈 키워드 오매칭 방지)', () => {
    assert.equal(evaluate({ app: '', isChrome: false, url: '', extensionConnected: false }, config), 'BREAK');
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

  it('urlMode 미지정이면 허용 목록 모드로 동작(하위호환)', () => {
    // config에 urlMode 없음 → 'allow' 기본
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://youtube.com', extensionConnected: true }, config), 'BREAK');
  });
});

describe('whitelist.evaluate — 크롬 제한(block) 모드', () => {
  const blockConfig = {
    apps: ['Code'],
    urlPatterns: ['youtube.com', 'instagram.com', 'facebook.com/*'],
    urlMode: 'block',
  };

  it('제한 목록에 매칭되면 BREAK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://youtube.com/watch', extensionConnected: true }, blockConfig), 'BREAK');
  });

  it('제한 와일드카드 매칭 → BREAK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://facebook.com/feed', extensionConnected: true }, blockConfig), 'BREAK');
  });

  it('제한 목록에 없는 URL → WORK', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://github.com/myrepo', extensionConnected: true }, blockConfig), 'WORK');
  });

  it('제한 모드에서 확장 미연결이면 WORK(관대)', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: 'https://youtube.com', extensionConnected: false }, blockConfig), 'WORK');
  });

  it('제한 모드에서 url 없으면 WORK(관대)', () => {
    assert.equal(evaluate({ app: 'chrome', isChrome: true, url: '', extensionConnected: true }, blockConfig), 'WORK');
  });

  it('제한 모드라도 비크롬 앱은 허용앱 목록으로 판정', () => {
    assert.equal(evaluate({ app: 'Code', isChrome: false, url: '', extensionConnected: false }, blockConfig), 'WORK');
    assert.equal(evaluate({ app: 'notepad', isChrome: false, url: '', extensionConnected: false }, blockConfig), 'BREAK');
  });
});
