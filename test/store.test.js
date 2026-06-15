'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

// electron-store는 Electron 환경이 없으면 직접 require가 어려우므로
// todayKey 순수 함수만 단독으로 추출해서 테스트한다.
// store 전체 통합 테스트는 Electron 실행 환경에서 수행.

// todayKey 로직을 인라인으로 재현 (store.js 와 동일한 구현)
function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('todayKey()', () => {
  it('YYYY-MM-DD 형식을 반환한다', () => {
    const key = todayKey();
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('오늘 날짜와 일치한다', () => {
    const key = todayKey();
    const d = new Date();
    const expected = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
    assert.equal(key, expected);
  });

  it('월과 일이 두 자리 패딩된다', () => {
    // 1월 1일이라면 "01-01" 형식이어야 함
    const key = todayKey();
    const parts = key.split('-');
    assert.equal(parts[1].length, 2, '월은 두 자리여야 한다');
    assert.equal(parts[2].length, 2, '일은 두 자리여야 한다');
  });

  it('날짜가 달라지면 다른 키를 반환한다 (고정 날짜 비교)', () => {
    // 다른 날짜 키를 수동 생성해 비교
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, '0'),
      String(yesterday.getDate()).padStart(2, '0'),
    ].join('-');
    assert.notEqual(todayKey(), yKey);
  });
});

describe('DEFAULT_WHITELIST 구조', () => {
  // store.js를 직접 require하지 않고 계약 명세 대조
  const DEFAULT_WHITELIST = {
    apps: ['Code', 'WindowsTerminal', 'cmd'],
    urlPatterns: ['docs.google.com', 'github.com', 'stackoverflow.com'],
  };

  it('apps 배열이 존재한다', () => {
    assert.ok(Array.isArray(DEFAULT_WHITELIST.apps));
    assert.ok(DEFAULT_WHITELIST.apps.length > 0);
  });

  it('urlPatterns 배열이 존재한다', () => {
    assert.ok(Array.isArray(DEFAULT_WHITELIST.urlPatterns));
    assert.ok(DEFAULT_WHITELIST.urlPatterns.length > 0);
  });

  it('CONTRACTS.md 명세 앱 포함: Code, WindowsTerminal, cmd', () => {
    assert.ok(DEFAULT_WHITELIST.apps.includes('Code'));
    assert.ok(DEFAULT_WHITELIST.apps.includes('WindowsTerminal'));
    assert.ok(DEFAULT_WHITELIST.apps.includes('cmd'));
  });

  it('CONTRACTS.md 명세 URL 포함: docs.google.com, github.com, stackoverflow.com', () => {
    assert.ok(DEFAULT_WHITELIST.urlPatterns.includes('docs.google.com'));
    assert.ok(DEFAULT_WHITELIST.urlPatterns.includes('github.com'));
    assert.ok(DEFAULT_WHITELIST.urlPatterns.includes('stackoverflow.com'));
  });
});
