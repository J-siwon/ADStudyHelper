# ADStudyHelper — 세션 인수인계 (HANDOFF)

> 다음 세션이 컨텍스트 없이 이어받을 수 있도록 작성. 최종 업데이트: 2026-06-16

## 1. 한 줄 요약
주의력 결핍(ADHD) 사용자를 위한 **집중력 향상 데스크톱 앱**. Electron + Node. MVP + Phase 2(선택기능) **완성·검증·GitHub push 완료**.

## 2. 위치 / 원격
- 로컬: `C:\Users\tldnj\Desktop\ADStudyHelper`
- GitHub: `https://github.com/J-siwon/ADStudyHelper` (브랜치 `main`)
- 현재 동기화: local HEAD = remote = `c855856`, 총 18 커밋, 워킹트리 깨끗(`.omc/`만 untracked — 무시)

## 3. 현재 상태 (DONE)
- ✅ **MVP**: 활성앱/크롬URL 감지 → 화이트리스트 판정 → 연속 BREAK 10분 초과 시 캐릭터 팝업 → 일별 작업시간 누적/표시
- ✅ **Phase 2**: 웹캠 시선추적, 자리비움 10분→폰 알림(ntfy), 폰 휴식체크 시 알림 억제, 설정 UI 확장
- ✅ **검증**: verifier 독립 검증 PASS — `npm test` **61/61 통과**, 11개 main 모듈 require 정상, IPC 배선 확인, 전 커밋 Conventional Commits
- ✅ 빌드: `npm install`(240 packages), `npm run check` 통과

## 4. 기술 스택 / 구조
- Electron + Node, **CommonJS**(`require`/`module.exports`) — `"type":"module"` 쓰지 말 것
- 의존성: `electron`(dev), `get-windows`, `ws`, `electron-store@8`(v9+는 ESM이라 8 고정)
- 고정 포트: 크롬 브리지 WS **47615**, 폰 제어 HTTP **47616**
- BREAK 임계값: 기본 600초, 환경변수 `FOCUS_BREAK_SEC`로 단축 가능 / 자리비움: `AWAY_NOTIFY_SEC`

### 파일 맵 (src/)
- `main/index.js` — 앱 진입점, 전체 배선(tracker+bridge+whitelist+focusState+character+store+gaze+away+notifier+controlServer)
- `main/tracker.js` — get-windows 활성창 폴링
- `main/chromeBridge.js` — 크롬 확장용 WS 서버(47615)
- `main/whitelist.js` — WORK/BREAK 판정 (`evaluate`)
- `main/focusState.js` — 상태머신(EventEmitter): tick/stateChange/breakAlert
- `main/store.js` — electron-store: 일별 작업시간 + 화이트리스트 + 설정(getSettings/setSettings)
- `main/characterWindow.js` — 캐릭터 팝업 창
- `main/gazeManager.js` — 웹캠 시선추적 매니저 (shouldForceBreak)
- `main/awayManager.js` — 자리비움 감지 + 알림 트리거 (manualBreak 억제)
- `main/notifier.js` — ntfy.sh(+Telegram 옵션) 폰 알림
- `main/controlServer.js` — 폰 휴식체크 HTTP 서버(47616): /break /resume /
- `preload/index.js` — focusAPI(onTick/onConnection/getWhitelist/setWhitelist/getSettings/setSettings/getLanIp)
- `preload/gaze.js`, `preload/character.js`
- `renderer/index.html` + `renderer.js` + `styles.css` — 대시보드 + 설정 패널
- `renderer/character.*`, `renderer/gaze.*`
- `chrome-extension/` — MV3 확장(manifest, background.js, README)
- `test/*.test.js` — 8개 파일, 61 테스트

### 참고 문서
- `CONTRACTS.md` — 모듈 인터페이스 계약(소스 오브 트루스)
- `PHASE2-PLAN.md` — Phase 2 사양 + 무인 검증 한계
- `README.md` — 설치/실행/크롬확장 로드/사용법
- `.omc/plans/` (FocusApp 초기 계획) — 참고용

## 5. 실행 / 테스트
```bash
cd C:\Users\tldnj\Desktop\ADStudyHelper
npm install      # 최초 1회
npm start        # 앱 실행(대시보드 창)
npm test         # node --test, 61 테스트
npm run check    # whitelist+focusState 로드 점검
```

## 6. 남은 일 / 미검증 (TODO — 실기기 필요)
- [ ] **실제 동작 확인**: `npm start`로 GUI 창·캐릭터 팝업 실제 표시 확인(무인 빌드라 GUI는 코드/문법까지만 검증됨)
- [ ] **크롬 확장 로드**: `chrome://extensions` → 개발자모드 → `chrome-extension/` 로드 후 URL 전달 확인
- [ ] **폰 알림 실수신**: 폰에 ntfy 앱 설치 + 설정의 토픽 구독 → 자리비움 알림 도착 확인
- [ ] **카메라 시선추적**: 카메라 권한 허용 + 정확도 확인(webgazer 기반이라 정밀도 제한 — 캘리브레이션 개선 여지)
- [ ] **폰을 카메라로 사용**: 현재 미구현(수동 스트림 설정 안내만, PHASE2-PLAN.md 참고)

## 7. 개선 권장 (비차단, verifier 지적)
- `npm run check`가 whitelist/focusState만 로드 → 전체 main 모듈로 확장 권장
- `.omc/`가 .gitignore에 없음(사용자가 .gitignore 의도적으로 단순화함) → 필요 시 추가

## 8. 다음 세션 빠른 시작
1. 이 파일 + `CONTRACTS.md` + `README.md` 읽기
2. `git -C C:\Users\tldnj\Desktop\ADStudyHelper status` 로 상태 확인
3. 위 6번 TODO부터 진행(실기기 검증) 또는 신규 기능
4. 커밋은 Conventional Commits, push 전 verifier 검증 권장
