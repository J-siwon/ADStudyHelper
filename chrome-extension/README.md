# ADStudyHelper Chrome Extension

크롬 확장 — 활성 탭 URL을 데스크톱 앱에 전송합니다.

## 개발자 모드로 로드하는 방법

1. 크롬 주소창에 `chrome://extensions` 입력 후 이동
2. 우측 상단 **개발자 모드** 토글 활성화
3. **압축 해제된 확장 프로그램을 로드합니다** 버튼 클릭
4. 이 `chrome-extension` 폴더 선택 (manifest.json이 있는 폴더)
5. 확장이 목록에 나타나면 설치 완료

## 동작 방식

- 데스크톱 앱(`npm start`)이 실행 중일 때 `ws://127.0.0.1:47615`로 자동 연결
- 활성 탭이 바뀌거나 페이지 로딩이 완료될 때마다 현재 URL을 전송
- 연결이 끊기면 3초 후 자동 재접속

## 메시지 형식

```json
{ "type": "activeUrl", "url": "https://example.com", "tabActive": true }
```
