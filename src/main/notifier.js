'use strict';

// AWAY_NOTIFY_SEC 환경변수로 단축 가능 (테스트용)
// notifier: 채널 추상화. 기본 구현 = ntfy.sh
// sendPhone(message, settings) — settings: { ntfyTopic, telegram }

/**
 * ntfy.sh POST 헬퍼.
 * fetch가 없는 Node 버전을 위해 https 모듈 폴백 포함.
 */
async function postNtfy(topic, title, body) {
  const url = `https://ntfy.sh/${topic}`;
  const headers = {
    'Content-Type': 'application/json',
    Title: title,
    Tags: 'warning,hourglass_flowing_sand',
  };

  // Node 18+에는 글로벌 fetch 있음; 없으면 https 모듈 사용
  if (typeof fetch === 'function') {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
    return res;
  }

  // https 모듈 폴백
  return new Promise((resolve, reject) => {
    const https = require('https');
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, (res) => resolve(res));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Telegram sendMessage API 헬퍼.
 */
async function postTelegram(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text });

  if (typeof fetch === 'function') {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }

  return new Promise((resolve, reject) => {
    const https = require('https');
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path: `${urlObj.pathname}${urlObj.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => resolve(res));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 폰으로 알림 전송.
 * @param {string} message - 전송할 메시지
 * @param {object} settings - { ntfyTopic: string, telegram: {botToken, chatId}|null }
 * @returns {Promise<void>}
 */
async function sendPhone(message, settings = {}) {
  const { ntfyTopic = '', telegram = null } = settings;

  let sent = false;

  // ntfy.sh 채널
  if (ntfyTopic && ntfyTopic.trim()) {
    try {
      await postNtfy(ntfyTopic.trim(), 'ADStudyHelper', message);
      sent = true;
    } catch (err) {
      console.warn('[notifier] ntfy.sh 전송 실패:', err.message);
    }
  }

  // Telegram 채널 (선택)
  if (telegram && telegram.botToken && telegram.chatId) {
    try {
      await postTelegram(telegram.botToken, telegram.chatId, message);
      sent = true;
    } catch (err) {
      console.warn('[notifier] Telegram 전송 실패:', err.message);
    }
  }

  if (!sent) {
    console.warn('[notifier] 알림 채널 미설정 — ntfyTopic이 비어있거나 telegram 설정 없음. 알림을 보내지 않습니다.');
  }
}

module.exports = {
  sendPhone,
  // 테스트에서 내부 헬퍼를 모킹할 수 있도록 노출
  _postNtfy: postNtfy,
  _postTelegram: postTelegram,
};
