# ADStudyHelper

ADHD 사용자를 위한 집중력 향상 데스크톱 앱 (Electron 기반).

## 주요 기능

- 활성 창을 2초마다 폴링하여 허용 앱/URL 여부를 판정
- 집중(WORK) / 휴식(BREAK) 상태를 실시간 대시보드에 표시
- 연속 휴식이 임계값(기본 10분)을 초과하면 떠다니는 코딩 펫이 방방 뛰며 알림 (공부 중엔 공부, 휴식 중엔 자는 모습)
- Claude Code와 Codex의 동시 작업 세션 수를 감지해 펫의 노트북 개수로 표시
- 크롬 확장과 WebSocket(포트 47615)으로 연동해 현재 탭 URL 기반 판정
- 허용 앱 / URL 패턴 목록을 대시보드에서 편집 및 저장
- 오늘 누적 집중 시간(초) 영속화

## 설치 및 실행

### 요구 사항

- Node.js 18 이상
- npm 9 이상
- Windows 10/11 (get-windows 의존성)

### 설치

```bash
git clone <repo-url>
cd ADStudyHelper
npm install
```

### 실행

```bash
npm start
```

대시보드 창이 열립니다. 시스템 트레이 아이콘에서 종료할 수 있습니다.

### Codex 작업 상태 연동

Codex가 작업을 시작하고 마칠 때 ADStudyHelper의 로컬 서버(`127.0.0.1:47616`)로 상태를 보내도록 사용자 훅을 설치합니다. 프롬프트나 응답 내용은 보내지 않고 `session_id`만 사용합니다.

```bash
npm run codex:install
```

설치 후 새 Codex 세션을 열고 `/hooks`에서 ADStudyHelper 훅 4개를 검토해 신뢰하세요. Codex는 새로 추가되거나 변경된 비관리형 훅을 사용자가 한 번 신뢰하기 전까지 실행하지 않습니다.

설치 직후 한 번의 읽기 전용 Codex 세션으로 연동을 점검하려면 다음 명령을 실행할 수 있습니다.

```bash
npm run codex:verify
```

- `UserPromptSubmit`, `PostToolUse`: 해당 Codex 세션을 작업 중으로 표시
- `Stop`, `SessionEnd`: 해당 Codex 세션을 대기로 전환
- 기존 `~/.codex/hooks.json`은 유지하며, 변경 전 같은 폴더에 백업 생성
- 훅 런타임은 `~/.codex/hooks/adstudyhelper/`에 복사되므로 저장소를 옮겨도 동작

연동 제거:

```bash
npm run codex:uninstall
```

### 단위 테스트

```bash
npm test
```

### 모듈 로드 검증 (헤드리스 환경)

```bash
npm run check
```

### BREAK 임계값 단축 (테스트용)

```bash
FOCUS_BREAK_SEC=5 npm start
```

5초 연속 휴식 상태면 펫이 방방 뛰는 알림이 트리거됩니다.

## 크롬 확장 로드 방법

1. Chrome에서 `chrome://extensions` 열기
2. 오른쪽 상단 **개발자 모드** 활성화
3. **압축 해제된 확장 프로그램 로드** 클릭
4. 프로젝트 루트의 `chrome-extension/` 폴더 선택
5. 확장이 로드되면 앱 대시보드에 **"확장 연결됨"** 표시

> 확장이 연결되지 않으면 크롬 활성 탭은 항상 BREAK로 판정됩니다.

## 허용 목록 설정

대시보드 하단 **허용 앱 / URL 목록** 섹션에서 편집 후 **저장** 버튼 클릭.

- **허용 앱**: 프로세스 이름 한 줄에 하나씩 (예: `Code`, `WindowsTerminal`)
- **허용 URL 패턴**: 부분 문자열 또는 와일드카드(`*`) 패턴 (예: `github.com/*`, `docs.google.com`)

## 프로젝트 구조

```
ADStudyHelper/
├── src/
│   ├── main/
│   │   ├── index.js          # 메인 프로세스 (통합 진입점)
│   │   ├── tracker.js        # 활성 창 폴링
│   │   ├── chromeBridge.js   # WebSocket 브리지
│   │   ├── whitelist.js      # WORK/BREAK 판정
│   │   ├── focusState.js     # 집중 상태 머신
│   │   ├── store.js          # 영속화 (electron-store)
│   │   └── petWindow.js      # 펫 창 (공부/자기/방방 알림)
│   ├── preload/
│   │   ├── index.js          # 대시보드 preload (focusAPI)
│   │   └── pet.js            # 펫 창 preload (petAPI)
│   └── renderer/
│       ├── index.html        # 대시보드 HTML
│       ├── renderer.js       # 대시보드 렌더러 스크립트
│       ├── pet.html          # 펫 창 HTML
│       ├── pet.js            # 펫 창 렌더러 스크립트
│       └── pet.css           # 펫 창 스타일/애니메이션
├── test/
│   ├── whitelist.test.js     # whitelist.evaluate 단위 테스트
│   └── focusState.test.js    # FocusState 단위 테스트
├── scripts/
│   ├── claude-hook.js        # Claude Code 작업 상태 훅
│   ├── codex-hook.js         # Codex 작업 상태 훅
│   ├── install-codex-hook.js # Codex 사용자 훅 설치/제거
│   └── verify-codex-hook.js  # 실제 Codex 세션 연동 점검
├── CONTRACTS.md              # 모듈 인터페이스 계약
└── package.json
```

## Phase 2 기능 (선택사항)

### 웹캠 시선 추적 (F1)

카메라 추적을 켜면 얼굴이 없거나 시선이 화면을 벗어났을 때 BREAK로 강제 판정합니다.

1. 대시보드 설정 패널에서 **카메라 추적** 토글을 켬
2. 앱 처음 실행 시 브라우저 카메라 권한 요청이 뜨면 허용
3. 얼굴이 인식되지 않으면 앱/URL과 관계없이 BREAK 처리됨

> 카메라 추적은 기본값 off입니다 (프라이버시 보호).

### 자리 비움 감지 + 폰 알림 (F2)

자리를 오래 비우면 스마트폰으로 알림을 보냅니다.

**ntfy.sh 앱 설치 및 설정:**

1. 스마트폰에 [ntfy](https://ntfy.sh/) 앱 설치 (Android/iOS 무료)
2. 앱에서 원하는 토픽 이름 구독 (예: `myname-study-alert`)
3. 대시보드 설정 패널의 **ntfy 토픽** 입력란에 같은 토픽 이름 입력 후 저장
4. 자리 비움이 임계값(기본 10분)을 초과하면 폰으로 알림 도착

**자리 비움 임계값 단축 (테스트용):**

```bash
AWAY_NOTIFY_SEC=10 npm start
```

10초 자리 비움 시 알림이 트리거됩니다.

### 폰 쉬는시간 체크 → 알림 억제 (F3)

같은 네트워크의 스마트폰에서 쉬는시간을 등록하면 자리 비움 알림이 억제됩니다.

1. 대시보드 설정 패널에서 **폰 제어 주소** 확인 (예: `http://192.168.0.x:47616`)
2. 스마트폰 브라우저에서 해당 주소 접속
3. **쉬는시간 등록** 버튼 클릭 → 알림 억제 시작
4. **복귀** 버튼 클릭 → 알림 다시 활성화

### 설정 항목 (F4)

대시보드 설정 패널에서 다음 항목을 편집할 수 있습니다:

| 항목 | 설명 | 기본값 |
|------|------|--------|
| 카메라 추적 | 웹캠 시선 추적 on/off | off |
| ntfy 토픽 | ntfy.sh 알림 토픽 이름 | (비어있음) |
| 자리 비움 임계값 | 알림까지 연속 자리비움 시간(분) | 10분 |
| 허용 앱 | WORK 판정 앱 목록 | Code, WindowsTerminal, cmd |
| 허용 URL 패턴 | WORK 판정 URL 패턴 | docs.google.com 등 |

## 프로젝트 구조

```
ADStudyHelper/
├── src/
│   ├── main/
│   │   ├── index.js            # 메인 프로세스 (전체 통합 진입점)
│   │   ├── tracker.js          # 활성 창 폴링
│   │   ├── chromeBridge.js     # WebSocket 브리지 (크롬 확장)
│   │   ├── whitelist.js        # WORK/BREAK 판정
│   │   ├── focusState.js       # 집중 상태 머신
│   │   ├── store.js            # 영속화 (electron-store)
│   │   ├── petWindow.js        # 펫 창 (공부/자기/방방 알림)
│   │   ├── gazeManager.js      # 웹캠 시선 추적 (Phase 2)
│   │   ├── awayManager.js      # 자리 비움 감지 (Phase 2)
│   │   ├── notifier.js         # 폰 알림 전송 (Phase 2)
│   │   └── controlServer.js    # 폰 제어 HTTP 서버 (Phase 2)
│   ├── preload/
│   │   ├── index.js            # 대시보드 preload (focusAPI)
│   │   ├── pet.js              # 펫 창 preload (petAPI)
│   │   └── gaze.js             # 시선 추적 창 preload
│   └── renderer/
│       ├── index.html          # 대시보드 HTML
│       ├── renderer.js         # 대시보드 렌더러
│       ├── pet.html            # 펫 창 HTML
│       ├── pet.js              # 펫 창 렌더러
│       ├── pet.css             # 펫 창 스타일/애니메이션
│       ├── gaze.html           # 시선 추적 창 HTML
│       └── gaze.js             # 시선 추적 렌더러
├── test/
│   ├── whitelist.test.js       # whitelist 단위 테스트
│   ├── focusState.test.js      # FocusState 단위 테스트
│   ├── away.test.js            # awayManager 단위 테스트
│   └── notifier.test.js        # notifier 단위 테스트
├── CONTRACTS.md                # 모듈 인터페이스 계약
├── PHASE2-PLAN.md              # Phase 2 기능 사양
└── package.json
```

## 기술 스택

- [Electron](https://www.electronjs.org/) — 데스크톱 앱 프레임워크
- [get-windows](https://github.com/sindresorhus/get-windows) — 활성 창 정보 조회
- [ws](https://github.com/websockets/ws) — WebSocket 서버
- [electron-store](https://github.com/sindresorhus/electron-store) — 설정/데이터 영속화
- [ntfy.sh](https://ntfy.sh/) — 폰 푸시 알림 (Phase 2)
