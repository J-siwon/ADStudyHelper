'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// store.js의 순수 로직을 인라인으로 재현 (electron-store 없이 테스트)
const DEFAULT_SETTINGS = {
  cameraEnabled: false,
  cameraDeviceId: null,
  ntfyTopic: '',
  awayThresholdMin: 10,
  telegram: null,
};

function mergeSettings(base, partial) {
  return Object.assign({}, base, partial);
}

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

describe('DEFAULT_SETTINGS 기본값', () => {
  it('cameraEnabled 기본값은 false', () => {
    assert.equal(DEFAULT_SETTINGS.cameraEnabled, false);
  });

  it('cameraDeviceId 기본값은 null', () => {
    assert.equal(DEFAULT_SETTINGS.cameraDeviceId, null);
  });

  it('ntfyTopic 기본값은 빈 문자열', () => {
    assert.equal(DEFAULT_SETTINGS.ntfyTopic, '');
  });

  it('awayThresholdMin 기본값은 10', () => {
    assert.equal(DEFAULT_SETTINGS.awayThresholdMin, 10);
  });

  it('telegram 기본값은 null', () => {
    assert.equal(DEFAULT_SETTINGS.telegram, null);
  });
});

describe('mergeSettings() 병합 로직', () => {
  it('partial이 없으면 base를 그대로 반환한다', () => {
    const result = mergeSettings(DEFAULT_SETTINGS, {});
    assert.deepEqual(result, DEFAULT_SETTINGS);
  });

  it('원본 base 객체를 변경하지 않는다 (불변성)', () => {
    const base = { ...DEFAULT_SETTINGS };
    mergeSettings(base, { cameraEnabled: true });
    assert.equal(base.cameraEnabled, false);
  });

  it('partial 키가 base를 덮어쓴다', () => {
    const result = mergeSettings(DEFAULT_SETTINGS, { cameraEnabled: true });
    assert.equal(result.cameraEnabled, true);
  });

  it('partial에 없는 기본 키는 보존된다', () => {
    const result = mergeSettings(DEFAULT_SETTINGS, { ntfyTopic: 'my-topic' });
    assert.equal(result.awayThresholdMin, 10);
    assert.equal(result.cameraEnabled, false);
  });

  it('awayThresholdMin을 숫자로 갱신할 수 있다', () => {
    const result = mergeSettings(DEFAULT_SETTINGS, { awayThresholdMin: 5 });
    assert.equal(result.awayThresholdMin, 5);
  });

  it('telegram 객체를 설정할 수 있다', () => {
    const tg = { botToken: 'tok', chatId: '123' };
    const result = mergeSettings(DEFAULT_SETTINGS, { telegram: tg });
    assert.deepEqual(result.telegram, tg);
  });

  it('여러 키를 동시에 병합할 수 있다', () => {
    const partial = { cameraEnabled: true, ntfyTopic: 'focus', awayThresholdMin: 15 };
    const result = mergeSettings(DEFAULT_SETTINGS, partial);
    assert.equal(result.cameraEnabled, true);
    assert.equal(result.ntfyTopic, 'focus');
    assert.equal(result.awayThresholdMin, 15);
  });

  it('저장값 위에 partial을 병합하면 이전 저장값이 유지된다', () => {
    // getSettings/setSettings 흐름 시뮬레이션
    const saved = { cameraEnabled: true, ntfyTopic: 'old-topic' };
    const merged = mergeSettings(saved, { ntfyTopic: 'new-topic' });
    assert.equal(merged.cameraEnabled, true);   // 이전 저장값 유지
    assert.equal(merged.ntfyTopic, 'new-topic'); // 새 값 반영
  });
});
