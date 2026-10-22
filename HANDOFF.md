# ADStudyHelper — 세션 인수인계

> 최종 업데이트: 2026-10-23. 이번 작업에서 확인한 소스와 검증 결과를 기준으로 작성합니다.

## 현재 상태

Electron 기반 집중력 향상 앱입니다. 활성 앱·Chrome URL 판정, WORK/BREAK 타이머, 코딩 펫, 선택적 카메라·자리 비움 알림, iPhone 동반 앱, 게임 개발 학습 기능이 있습니다. 현재 변경에는 공부 캘린더와 Google Drive 백업·복원이 포함됩니다.

- 로컬: `C:\Users\tldnj\GitHub\ADStudyHelper`
- 원격: https://github.com/J-siwon/ADStudyHelper
- 작업 브랜치: `feature/iphone-screen-time`
- CommonJS 사용. Chrome WebSocket 포트 47615, 로컬 제어 HTTP 포트 47616.

## 이번 변경

- 공부 캘린더: 월 이동·날짜 선택, 일별 집중 시간, 티어·RP·목표 진행률, 완료·복습·가져오기 내역.
- 기존 집중 시간 유지. 과거 티어·상세 내역은 추정하지 않습니다.
- Google 데스크톱 OAuth 연결 및 Drive 앱 전용 공간 백업. 연결 후 변경 기록을 5분 간격으로 확인합니다.
- 다른 PC의 새 백업을 발견하면 자동 업로드를 멈추고 사용자의 선택을 기다립니다. 자동 병합은 없습니다.
- 복원은 미리보기·확인을 거쳐 적용하고 교체 전 `study-before-restore-*.json` 사본을 만듭니다.
- 공부 기록·학습 상태만 백업하며 설정·로그인 토큰·페어링 토큰은 로컬에 유지합니다.
- 기존 `dist/ADStudyHelper-1.0.0-portable.exe` 삭제가 이번 변경에 포함됩니다. 이번 문서 갱신에서 새 실행 파일은 생성하지 않았습니다.

## 주요 파일

- `src/main/index.js`: 앱 초기화, 집중 tick, 학습·캘린더 IPC 배선.
- `src/main/store.js`: 설정·집중 시간·학습·일별 기록 영속화, 복원 전 사본 생성.
- `src/main/study-calendar.js`: 날짜·월별 기록, 학습 변화 이벤트, 백업 스키마 검증.
- `src/main/google-backup.js`: OAuth, 토큰 암호화, Drive 요청, 백업 충돌·복원 처리.
- `src/main/learning*.js`: 40개 챕터·200개 목표, 단계·RP·티어·복습·수동 AI 판정 계약.
- `src/preload/index.js`: `focusAPI`, `learningAPI`, `studyAPI` 노출.
- `src/renderer/calendar-app.js`: 캘린더, Google 연결·백업·복원 화면.
- `src/renderer/learning-app.js`: 학습 화면.
- `src/main/petWindow.js`, `src/renderer/pet.*`: 코딩 펫.
- `src/renderer/gaze.js`: MediaPipe 기반 카메라 처리.
- `ios/`: iPhone 동반 앱. Windows 검증과 Mac·기기 검증을 구분합니다.

## 검증과 남은 확인

`npm test` 211/211, `npm run check` 통과. 자세한 결과는 [작업 기록](docs/work-log.md)에 기재합니다. 과거 세션의 GUI 부팅 결과를 이번 변경의 검증 결과로 취급하지 않습니다.

실제 Electron 화면에서 월 이동·날짜 선택·자정 갱신을 확인해야 합니다. 본인 Google 계정의 로그인·백업·다른 PC 충돌·복원·재연결은 실제 계정과 네트워크에서 확인해야 합니다. 포터블 패키징, Mac/Xcode 및 iPhone 기기 검증은 이번 작업에서 수행하지 않았습니다.

## 다음 세션 시작

1. `README.md`, `docs/work-log.md`, `docs/google-study-backup.md`, `CONTRACTS.md`를 읽습니다.
2. `git status`로 브랜치와 로컬 변경을 확인합니다. 소유권 오류가 있으면 명령별 `git -c safe.directory=C:/Users/tldnj/GitHub/ADStudyHelper ...`를 사용합니다.
3. `npm test`, `npm run check`로 자동 검증합니다. 필요하면 `npm start`로 GUI를 확인하고 `npm run dist`로 포터블을 빌드합니다.
4. 커밋 메시지는 Conventional Commits 형식을 사용합니다.
