'use strict';

// 와일드카드(*) 패턴을 정규식으로 변환
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp(regexStr);
}

// url이 urlPatterns 중 하나에 매칭되는지 확인 (부분 문자열 또는 와일드카드)
function matchesUrl(url, urlPatterns) {
  for (const pattern of urlPatterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(url)) return true;
  }
  return false;
}

/**
 * app/url을 받아 WORK|BREAK 판정.
 * config = { apps: string[], urlPatterns: string[] }
 *
 * 규칙:
 * - 활성앱이 크롬이 아니면: 앱 프로세스명이 허용앱 목록에 있으면 WORK, 없으면 BREAK.
 * - 활성앱이 크롬이면: 확장이 보고한 현재 URL이 허용 URL 패턴에 매칭되면 WORK, 아니면 BREAK.
 *   확장 미연결이면 BREAK.
 */
function evaluate({ app, isChrome, url, extensionConnected }, config) {
  const { apps = [], urlPatterns = [] } = config || {};

  if (!isChrome) {
    // 앱 이름 비교 (대소문자 무시)
    const appLower = (app || '').toLowerCase();
    const matched = apps.some((a) => a.toLowerCase() === appLower);
    return matched ? 'WORK' : 'BREAK';
  }

  // 크롬인 경우
  if (!extensionConnected || !url) return 'BREAK';
  return matchesUrl(url, urlPatterns) ? 'WORK' : 'BREAK';
}

module.exports = { evaluate };
