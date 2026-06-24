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
 * config = { apps: string[], urlPatterns: string[], urlMode?: 'allow' | 'block' }
 *
 * 규칙:
 * - 활성앱이 크롬이 아니면: 앱 프로세스명이 허용앱 목록에 있으면 WORK, 없으면 BREAK.
 * - 활성앱이 크롬이면 urlMode에 따라 판정:
 *   · 'allow'(허용 목록, 기본값): URL이 목록 패턴에 매칭되면 WORK, 아니면 BREAK.
 *     확장 미연결/URL 모름이면 허용 여부를 확인할 수 없으므로 BREAK.
 *   · 'block'(제한 목록): URL이 목록 패턴에 매칭되면 BREAK, 아니면 WORK.
 *     확장 미연결/URL 모름이면 제한 대상인지 확인할 수 없으므로 WORK.
 */
function evaluate({ app, isChrome, url, extensionConnected }, config) {
  const { apps = [], urlPatterns = [], urlMode = 'allow' } = config || {};

  if (!isChrome) {
    // 앱 이름 매칭 (대소문자 무시, 부분 포함).
    // get-windows v9의 owner.name은 친근한 표시 이름이라 정확히 일치하지 않는다:
    //   VS Code → "Visual Studio Code", 터미널 → "Windows Terminal Host", 메모장 → "Notepad.exe"
    // 따라서 화이트리스트 키워드가 실제 앱 이름에 포함되면 매칭한다. (예: "Code" ⊂ "Visual Studio Code")
    const appLower = (app || '').toLowerCase();
    const matched = appLower !== '' && apps.some((a) => {
      const keyword = (a || '').toLowerCase().trim();
      return keyword !== '' && appLower.includes(keyword);
    });
    return matched ? 'WORK' : 'BREAK';
  }

  // 크롬인 경우 — 제한 목록 모드
  if (urlMode === 'block') {
    // URL을 모르면 제한 대상인지 알 수 없으므로 WORK(관대)
    if (!extensionConnected || !url) return 'WORK';
    return matchesUrl(url, urlPatterns) ? 'BREAK' : 'WORK';
  }

  // 크롬인 경우 — 허용 목록 모드(기본)
  // URL을 모르면 허용 대상인지 알 수 없으므로 BREAK(엄격)
  if (!extensionConnected || !url) return 'BREAK';
  return matchesUrl(url, urlPatterns) ? 'WORK' : 'BREAK';
}

module.exports = { evaluate };
