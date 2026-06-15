'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const notifier = require('../src/main/notifier.js');

describe('notifier.sendPhone — ntfy.sh', () => {
  it('ntfyTopic 없으면 no-op (에러 없음)', async () => {
    // 경고만 출력하고 예외 발생 없어야 함
    await assert.doesNotReject(() =>
      notifier.sendPhone('test', { ntfyTopic: '', telegram: null })
    );
  });

  it('_postNtfy: 올바른 URL/헤더/body로 fetch 호출', async () => {
    const origFetch = globalThis.fetch;
    let fetchUrl = '';
    let fetchOpts = {};
    globalThis.fetch = async (url, opts) => {
      fetchUrl = url;
      fetchOpts = opts;
      return { status: 200 };
    };

    await notifier._postNtfy('my-topic', 'ADStudyHelper', '테스트 메시지');

    assert.equal(fetchUrl, 'https://ntfy.sh/my-topic');
    assert.equal(fetchOpts.method, 'POST');
    assert.equal(fetchOpts.body, '테스트 메시지');
    assert.equal(fetchOpts.headers.Title, 'ADStudyHelper');

    globalThis.fetch = origFetch;
  });

  it('sendPhone: ntfyTopic 있고 fetch 모킹 → POST 호출', async () => {
    const origFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, method: opts.method, body: opts.body });
      return { status: 200 };
    };

    await notifier.sendPhone('자리 비움 알림', { ntfyTopic: 'test-topic', telegram: null });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('test-topic'));
    assert.equal(calls[0].method, 'POST');

    globalThis.fetch = origFetch;
  });

  it('sendPhone: telegram botToken+chatId 있으면 telegram POST 호출', async () => {
    const origFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push({ url, method: opts.method });
      return { status: 200 };
    };

    await notifier.sendPhone('telegram 테스트', {
      ntfyTopic: '',
      telegram: { botToken: 'BOT123', chatId: '456' },
    });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('BOT123'));
    assert.ok(calls[0].url.includes('sendMessage'));

    globalThis.fetch = origFetch;
  });

  it('sendPhone: ntfy + telegram 둘 다 있으면 두 번 POST', async () => {
    const origFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => {
      calls.push(url);
      return { status: 200 };
    };

    await notifier.sendPhone('둘 다 테스트', {
      ntfyTopic: 'mytopic',
      telegram: { botToken: 'BOT', chatId: '42' },
    });

    assert.equal(calls.length, 2);

    globalThis.fetch = origFetch;
  });
});
