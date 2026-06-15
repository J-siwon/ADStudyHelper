# ADStudyHelper

ADHD 사용자를 위한 집중력 향상 데스크톱 앱 (Electron 기반).

## 주요 기능

- 활성 창을 2초마다 폴링하여 허용 앱/URL 여부를 판정
- 집중(WORK) / 휴식(BREAK) 상태를 실시간 대시보드에 표시
- 연속 휴식이 임계값(기본 10분)을 초과하면 귀여운 고양이 캐릭터 팝업 알림
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

5초 연속 휴식 상태면 캐릭터 팝업이 트리거됩니다.

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
│   │   └── characterWindow.js# 캐릭터 팝업 창
│   ├── preload/
│   │   ├── index.js          # 대시보드 preload (focusAPI)
│   │   └── character.js      # 캐릭터 창 preload (characterAPI)
│   └── renderer/
│       ├── index.html        # 대시보드 HTML
│       ├── renderer.js       # 대시보드 렌더러 스크립트
│       ├── character.html    # 캐릭터 팝업 HTML
│       └── character.js      # 캐릭터 팝업 렌더러 스크립트
├── test/
│   ├── whitelist.test.js     # whitelist.evaluate 단위 테스트
│   └── focusState.test.js    # FocusState 단위 테스트
├── CONTRACTS.md              # 모듈 인터페이스 계약
└── package.json
```

## 기술 스택

- [Electron](https://www.electronjs.org/) — 데스크톱 앱 프레임워크
- [get-windows](https://github.com/sindresorhus/get-windows) — 활성 창 정보 조회
- [ws](https://github.com/websockets/ws) — WebSocket 서버
- [electron-store](https://github.com/sindresorhus/electron-store) — 설정/데이터 영속화
