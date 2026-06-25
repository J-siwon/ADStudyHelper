# ADStudyHelper — 모듈 인터페이스 계약 (모든 워커 필독)

주의력 결핍(ADHD) 사용자를 위한 집중력 향상 데스크톱 앱.
병렬로 작업하므로 **아래 인터페이스를 정확히 지켜야** 통합 단계에서 충돌이 없습니다.
**프로젝트 루트: `C:\Users\tldnj\Desktop\ADStudyHelper`** (이 폴더에서 작업. 모든 경로는 이 루트 기준).

## 기술 스택
- Electron + Node (CommonJS, `require`/`module.exports` 사용 — `"type":"module"` 쓰지 말 것)
- 의존성: `electron`(devDep), `get-windows`(활성창), `ws`(WebSocket), `electron-store`(영속화)
- package.json name: `ad-study-helper`
- 고정 WebSocket 포트: **47615**
- BREAK 임계값 상수: `BREAK_THRESHOLD_SEC` 기본 600초. 단, 환경변수 `FOCUS_BREAK_SEC`가 있으면 그 값 사용(테스트용 단축).

## 상태 정의
- 상태값: 문자열 `"WORK"` 또는 `"BREAK"`.
- 활성앱이 크롬이 아니면: 앱 프로세스명이 허용앱 목록에 있으면 WORK, 없으면 BREAK.
- 활성앱이 크롬이면: 확장이 보고한 현재 URL이 허용 URL 패턴에 매칭되면 WORK, 아니면 BREAK. 확장 미연결이면 BREAK.

---

## src/main/tracker.js  (owner: worker-1)
```js
// 활성 창을 intervalMs마다 폴링. get-windows 사용.
module.exports = {
  // onUpdate({ app: string, title: string, isChrome: boolean })
  startTracking(intervalMs, onUpdate),  // 반환: 없음
  stopTracking(),
};
// isChrome 판정: app 프로세스명에 'chrome'이 포함되면 true (대소문자 무시).
```

## src/main/chromeBridge.js  (owner: worker-2)
```js
// localhost 전용 WebSocket 서버(포트 47615). 크롬 확장이 접속해 URL 전송.
module.exports = {
  // onUrl({ url: string, tabActive: boolean })
  // onConnectionChange(connected: boolean)
  startBridge(port, onUrl, onConnectionChange),
  stopBridge(),
};
// 확장이 보내는 메시지 형식: { type: "activeUrl", url: string, tabActive: boolean }
```

## src/main/whitelist.js  (owner: worker-1)
```js
module.exports = {
  // app/url을 받아 WORK|BREAK 판정. config = { apps: string[], urlPatterns: string[] }
  // urlPatterns는 부분 문자열 또는 와일드카드(*) 매칭(간단 구현). 예: "docs.google.com", "github.com/*"
  evaluate({ app, isChrome, url, extensionConnected }, config),  // 반환: "WORK"|"BREAK"
};
```

## src/main/focusState.js  (owner: worker-1)
```js
const { EventEmitter } = require('events');
// 사용: const fs = new FocusState({ breakThresholdSec });
// 이벤트:
//   'stateChange'  -> (state: "WORK"|"BREAK")
//   'breakAlert'   -> ()   // 연속 BREAK가 임계값 초과 시 1회 발생, WORK 복귀 시 리셋
//   'tick'         -> ({ state, workSeconds, breakSeconds })  // 1초마다
class FocusState extends EventEmitter {
  constructor({ breakThresholdSec }) {...}
  // 매 폴링마다 호출. 현재 상태를 갱신.
  setState(state /* "WORK"|"BREAK" */) {...}
  start() {...}   // 1초 타이머 시작
  stop() {...}
  getWorkSeconds() {...}   // 누적 WORK 초
}
module.exports = FocusState;
```

## src/main/store.js  (owner: worker-3)
```js
// electron-store 기반. 날짜(YYYY-MM-DD)별 작업시간 누적 + 화이트리스트 영속화.
module.exports = {
  getWhitelist(),                 // 반환: { apps: string[], urlPatterns: string[] }  (없으면 기본 시드)
  setWhitelist(wl),
  addWorkSeconds(n),              // 오늘 날짜 키에 n초 누적
  getTodayWorkSeconds(),          // 반환: number (오늘 누적 초; 날짜 바뀌면 0부터)
};
// 기본 시드 화이트리스트: { apps: ["Code","WindowsTerminal","cmd"], urlPatterns: ["docs.google.com","github.com","stackoverflow.com"] }
```

## src/main/petWindow.js
```js
// frameless/transparent/always-on-top/draggable BrowserWindow. src/renderer/pet.html 로드.
// (기존 characterWindow.js의 고양이 팝업을 대체)
module.exports = {
  showPet(initialFocusState /* 'WORK'|'BREAK' */),  // 펫 창 표시(없으면 생성)
  hidePet(),
  setPetState(focusStateValue /* 'WORK'|'BREAK' */), // 공부/자기 자세 반영
  petAlert(),                                         // 쉬는시간 제한 도달 → 방방 뛰기 + 말풍선
  _poseForState(state),                               // 순수: 'WORK'→'study', 그외 'sleep'
};
// pet.html은 IPC 'pet:state' { state:'study'|'sleep'|'alert' }를 받아 자세 전환.
```

## src/preload/index.js  (owner: worker-1)
```js
// contextBridge로 렌더러에 노출:
// window.focusAPI = {
//   onTick(cb),                 // main -> renderer: { state, workSeconds }
//   onConnection(cb),           // main -> renderer: boolean (확장 연결 상태)
//   getWhitelist(): Promise,    // renderer -> main (ipcRenderer.invoke 'wl:get')
//   setWhitelist(wl): Promise,  // ipcRenderer.invoke 'wl:set'
// }
```

## 대시보드 IPC (owner: worker-3 가 renderer 측, worker-1 가 main/preload 측)
- main → renderer 이벤트: `'tick'` payload `{ state, workSeconds }` (1초마다)
- main → renderer 이벤트: `'connection'` payload `boolean`
- renderer → main invoke: `'wl:get'` → whitelist, `'wl:set'`(wl) → ok

## 통합(owner: worker-1, 마지막)
src/main/index.js 에서: store→whitelist config 로드 → tracker+chromeBridge 시작 →
각 입력으로 focusState.setState(evaluate(...)) 호출 → focusState 'stateChange'에 petWindow.setPetState, 'breakAlert'에 petWindow.petAlert 연결 →
focusState 'tick'에서 WORK면 store.addWorkSeconds(1) + 대시보드로 tick 전송.

## Git 커밋 컨벤션 (Conventional Commits — 모든 커밋 필수)
형식: `<type>(<scope>): <subject>` — 한국어 subject 허용.
- type: feat, fix, chore, docs, test, refactor, style, build
- 예: `feat(tracker): get-windows 기반 활성창 폴링 구현`, `test(whitelist): evaluate 케이스 추가`, `chore: 프로젝트 스캐폴딩`
- 워커는 자기 모듈 완료 시 자기 파일만 `git add`하고 위 형식으로 커밋. push는 통합/검증 후 team-lead가 일괄 수행.

## 검증 (owner: worker-1, 마지막)
- `npm install` 성공
- `npm start` 로 대시보드 창이 뜸 (헤드리스면 메인 모듈 require 검증 `npm run check`)
- `FOCUS_BREAK_SEC=5` 로 단축해 BREAK 후 캐릭터 팝업 트리거 로직 동작 단위 테스트(test/focusState.test.js)
- whitelist.evaluate 단위 테스트(test/whitelist.test.js)
