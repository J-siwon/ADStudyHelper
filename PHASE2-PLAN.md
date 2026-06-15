# ADStudyHelper — Phase 2 (선택사항 / 전체 기능) 사양

MVP(필수) 완료·검증·push 후 진행. 원래 사용자 계획의 "선택사항"을 구현한다.
프로젝트 루트: `C:\Users\tldnj\Desktop\ADStudyHelper`. MVP와 동일 스택(Electron+Node, CommonJS).
커밋: Conventional Commits. push는 team-lead가 일괄.

## 원래 요구(선택사항) 매핑
- 핸드폰/웹캠 연결로 컴퓨터 끝~끝 시선 움직임 추적
- 시선이 모니터/서브모니터를 향하지 않으면 쉬는시간 간주
- 자리에서 떠난 상태면 10분 뒤 핸드폰으로 알림
- 핸드폰으로 쉬는시간 체크하면 알림이 울리지 않음

---

## F1: 웹캠 시선 추적 (gaze tracking)
- 파일: `src/renderer/gaze.html` + `src/renderer/gaze.js` (숨김 BrowserWindow 또는 메인윈도우 내 hidden view), `src/main/gazeManager.js`
- 라이브러리: webgazer.js (또는 @mediapipe/tasks-vision FaceLandmarker). 오프라인 가능하면 번들, 아니면 CDN+오프라인 폴백.
- 출력: `{ facePresent: boolean, gazeOnScreen: boolean }` 를 IPC로 main에 주기 전송(예 1초).
- 판정 통합: 카메라 추적이 켜져 있으면, (facePresent=false 또는 gazeOnScreen=false)가 디바운스 N초 지속되면 focusState 입력을 BREAK로 강제(앱/URL이 WORK여도). 즉 whitelist 판정과 AND.
- 캘리브레이션-lite: 화면 4모서리+중앙 클릭 5점 보정 옵션(스킵 가능, 스킵 시 얼굴 존재 여부만 사용).
- 카메라 소스 설정 가능: 기본 내장 웹캠(getUserMedia deviceId). 폰-카메라는 MJPEG/스트림 URL 설정 필드로 남김(수동, 검증 제외).
- 설정 토글: camera tracking on/off(기본 off — 권한/프라이버시).

## F2: 자리 비움 감지 + 폰 알림
- 파일: `src/main/awayManager.js`, `src/main/notifier.js`
- away 판정: (카메라 켜짐+facePresent=false) OR powerMonitor.getSystemIdleTime() > idleThreshold. away 연속시간 트래킹.
- away가 10분(`AWAY_NOTIFY_SEC`, env로 단축 가능) 초과 시 notifier.sendPhone(message) 1회 호출, 복귀 시 리셋.
- notifier: 채널 추상화. 기본 구현 = ntfy.sh. 설정의 `ntfyTopic`로 `https://ntfy.sh/<topic>`에 POST(제목/본문/태그). 토픽 없으면 no-op + 경고 로그. (Telegram 옵션: botToken+chatId 있으면 sendMessage API — 선택 구현)
- 단위 테스트: awayManager의 임계 로직(가짜 타이머), notifier는 fetch를 모킹해 POST 페이로드 검증.

## F3: 폰 쉬는시간 체크 → 알림 억제
- chromeBridge의 WS 서버와 별개로, `src/main/controlServer.js`에 로컬 HTTP 서버(예: 47616) 추가.
- 라우트: `GET /break` → manualBreak 플래그 on + 응답 페이지("쉬는시간 등록됨"). `GET /resume` → off. `GET /` → 현재 상태 + 버튼.
- 폰이 같은 네트워크에서 `http://<PC_LAN_IP>:47616/break` 접속하면 manualBreak on. manualBreak on 동안 F2의 away 알림을 억제(보내지 않음).
- 대시보드에 PC LAN IP + QR(선택)로 접속 주소 안내.
- 단위 테스트: 라우트 핸들러가 플래그를 올바르게 토글하는지.

## F4: 설정 UI 확장
- 대시보드 설정 패널에 추가: 카메라 추적 on/off + 카메라 선택, ntfy 토픽 입력, away 임계값(분), 폰 제어 주소 표시.
- store에 신규 키: `cameraEnabled`, `cameraDeviceId`, `ntfyTopic`, `awayThresholdMin`, (선택)`telegram`. 기존 store API 확장(setSettings/getSettings) 또는 whitelist와 동일 패턴.

## 통합/검증
- index.js에 gazeManager/awayManager/notifier/controlServer 배선. focusState 입력에 카메라/away 신호 합류.
- `npm test` 전체 통과, `npm run check` 통과. 시간의존(10분)은 env 단축으로 테스트.
- README에 Phase 2 사용법(카메라 권한, ntfy 앱 설치+토픽 구독, 폰 제어 주소) 추가.

## 무인 검증 한계 (명시)
- 실제 폰 알림 도착·폰 카메라 스트림은 사용자의 기기/구독이 필요 → 코드/단위테스트까지만 검증, 실기기 확인은 기상 후.
- webgazer 정확도는 제한적 → 동작하는 기반(얼굴 존재/대략 시선)까지. 정밀 보정은 후속.
