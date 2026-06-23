# ADStudyHelper — 세션 인수인계 (HANDOFF)

> 다음 세션이 컨텍스트 없이 이어받을 수 있도록 작성. 최종 업데이트: 2026-06-24

## 1. 한 줄 요약
주의력 결핍(ADHD) 사용자를 위한 **집중력 향상 데스크톱 앱**. Electron + Node. MVP + Phase 2(선택기능) + **폰 카메라 스트림** 완성. **실제 Electron 부팅 검증 완료**.

## 2. 위치 / 원격
- 로컬: `C:\Users\tldnj\GitHub\ADStudyHelper`
- GitHub: `https://github.com/J-siwon/ADStudyHelper` (브랜치 `main`)
- `.omc/`만 untracked — 커밋 대상 아님(무시)

## 3. 현재 상태 (DONE)
- ✅ **MVP**: 활성앱/크롬URL 감지 → 화이트리스트 판정 → 연속 BREAK 10분 초과 시 캐릭터 팝업 → 일별 작업시간 누적/표시
- ✅ **Phase 2**: 웹캠 시선추적, 자리비움 10분→폰 알림(ntfy), 폰 휴식체크 시 알림 억제, 설정 UI 확장
- ✅ **폰 카메라 스트림(F1 확장)**: 설정에서 카메라 소스 `내장 웹캠` / `폰 스트림(MJPEG/URL)` 선택 가능. 스트림 모드는 webgazer(getUserMedia) 비호환이라 **presence(존재 여부) 판정**만 사용.
- ✅ **카메라 선택 동작 확정**: `cameraEnabled` OFF면 크롬 확장(화이트리스트)만으로 타이머 판정. ON이라도 **카메라/폰이 실제 연결 안 되면(`connected=false`) BREAK 강제하지 않고 크롬 확장으로 폴백**. 연결됨+얼굴이탈일 때만 BREAK.
- ✅ **부팅 크래시 수정**: `get-windows` v9는 ESM 전용 → `tracker.js`가 `require()`로 불러 Electron(Node 18) 부팅 시 `ERR_REQUIRE_ESM` 크래시. **동적 `import()`로 지연 로드해 해결** — 이 프로젝트에서 앱이 처음으로 실제 부팅됨.
- ✅ **검증**: `npm test` **82/82 통과**, `npm run check`(9개 main 모듈 require) exit 0, `npm start` 실부팅 무크래시(controlServer 정상 기동 로그 확인).

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

## 6. 남은 일 / 최종 확인 (사용자 실기기 — 1차는 코드/부팅 검증 완료)
- [x] **앱 실제 부팅**: `npm start` 무크래시 부팅 확인 완료(get-windows ESM 수정 후). GUI 창·캐릭터 팝업의 **시각적** 표시는 사용자 눈으로 최종 확인 필요.
- [ ] **크롬 확장 로드**: `chrome://extensions` → 개발자모드 → `chrome-extension/` 로드 후 URL 전달 확인
- [ ] **폰 알림 실수신**: 폰에 ntfy 앱 설치 + 설정의 토픽 구독 → 자리비움 알림 도착 확인
- [ ] **내장 웹캠 시선추적**: 카메라 권한 허용 + 정확도 확인(webgazer 기반이라 정밀도 제한 — 캘리브레이션 개선 여지)
- [ ] **폰 카메라 스트림**: 폰에 MJPEG 스트림 앱(예: IP Webcam) 설치 → 설정에서 `폰 스트림` 선택 + URL 입력 → presence 판정 동작 확인

## 7. 개선 권장 (비차단)
- ~~`npm run check`가 whitelist/focusState만 로드~~ → **완료**: 9개 main 모듈 전체 require로 확장.
- `.omc/`가 .gitignore에 없음(사용자가 .gitignore 의도적으로 단순화함) → 필요 시 추가
- 폰 스트림 모드의 시선 정밀도: 현재 presence(존재 여부)만. 정밀 시선은 내장 웹캠 모드 전용.

## 8. 다음 세션 빠른 시작
1. 이 파일 + `CONTRACTS.md` + `README.md` 읽기
2. `git -C C:\Users\tldnj\GitHub\ADStudyHelper status` 로 상태 확인
3. 위 6번 실기기 최종 확인 진행 또는 신규 기능
4. 커밋은 Conventional Commits
