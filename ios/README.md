# ADStudyHelper iPhone 동반 앱

이 폴더는 Apple의 Family Controls + Device Activity(Screen Time) 공개 API를 사용하는 SwiftUI 앱과 `DeviceActivityMonitor` 확장을 포함합니다.

## 동작

- `화면 켜짐 근사`: 모든 앱/웹의 화면 전면 활동을 약 1초 임계로 감지합니다. iOS는 일반 앱에 실제 화면 켜짐/잠금 해제 이벤트를 공개하지 않으므로 정확한 화면 켜짐 감지가 아닙니다.
- `실제 사용 시작`: 사용자가 고른 앱/카테고리/웹 활동이 설정 임계에 도달하면 감지합니다. 선택하지 않은 앱은 집중 허용 앱으로 취급됩니다.
- 감지 시 iPhone에 설정 문구(기본 `집중해라!!!`)의 로컬 알림을 보내고, 같은 Wi-Fi의 데스크톱 `/api/phone/event`로 독립 `deviceId`/`sessionId`/`eventId` 이벤트를 보냅니다.
- 예약 휴식은 데스크톱의 앱 허용 목록보다 우선합니다. 예약 중 감지는 로컬 알림을 보내지 않으며 예약 종료 뒤까지 BREAK를 연장하지 않습니다.
- 네트워크 실패 이벤트는 App Group에 보관하고 다음 앱 실행 시 다시 보냅니다.

## Xcode 프로젝트 생성

macOS에서 Xcode 15 이상과 [XcodeGen](https://github.com/yonaskolb/XcodeGen)을 설치한 뒤:

```bash
cd ios
xcodegen generate
open ADStudyHelperPhone.xcodeproj
```

Xcode에서 다음을 설정해야 합니다.

1. `ADStudyHelperPhone`과 `ADStudyHelperMonitor` 타깃의 Team을 자신의 Apple Developer Team으로 선택합니다.
2. 두 타깃 모두 `Family Controls`와 `App Groups` capability를 켭니다.
3. App Group `group.com.jsiwon.adstudyhelper`를 두 타깃에 동일하게 연결합니다. 다른 ID를 쓰면 entitlements와 `SharedStore.appGroup`도 함께 바꿉니다.
4. 실제 iPhone을 대상으로 빌드합니다. Screen Time API는 시뮬레이터만으로 검증할 수 없습니다.
5. 앱에서 PC 설정 화면의 `서버 주소`와 `페어링 토큰`을 입력하고 연결합니다.

App Store/TestFlight 배포에는 Apple에 Family Controls 배포 entitlement를 별도로 요청해야 합니다. 개발 서명과 실기기 권한 승인도 사용자가 Xcode/iPhone에서 직접 해야 합니다.

## Mac을 한 번 빌려 설치할 때 체크리스트

### 빌리기 전에 준비

- Apple Developer Program 가입을 완료합니다. 이 프로젝트는 `Family Controls`와 `App Groups` 개발 capability가 필요하므로 무료 Personal Team을 전제로 하지 않습니다.
- Apple Account 암호와 2단계 인증 수단을 준비합니다.
- iPhone의 iOS 버전을 지원하는 Xcode를 설치할 수 있는 Mac인지 확인합니다. 최신 iOS라면 최신 Xcode와 그 Xcode를 지원하는 macOS가 필요합니다.
- 데이터 전송이 가능한 iPhone 케이블과 이 `ios` 폴더 전체를 준비합니다.
- 다른 사람의 Mac이라면 가능하면 별도의 임시 macOS 사용자 계정에서 작업합니다.

### Mac에서 프로젝트 열기

1. Xcode를 설치하고 한 번 실행하여 라이선스 동의와 추가 구성 요소 설치를 마칩니다.
2. Homebrew가 설치되어 있다면 터미널에서 `brew install xcodegen`을 실행합니다. Homebrew를 쓰지 않는 경우 [XcodeGen 공식 릴리스](https://github.com/yonaskolb/XcodeGen/releases)에서 설치할 수 있습니다.
3. 이 폴더에서 프로젝트를 생성하고 엽니다.

```bash
cd "/복사한/ADStudyHelper/ios"
xcodegen generate
open ADStudyHelperPhone.xcodeproj
```

4. Xcode의 `Settings > Accounts`에서 자신의 Apple Account로 로그인합니다.
5. 프로젝트의 `ADStudyHelperPhone`과 `ADStudyHelperMonitor` 타깃에서 다음을 각각 확인합니다.
   - `Signing & Capabilities > Automatically manage signing`: 켬
   - `Team`: 자신의 Apple Developer Team
   - `Family Controls`: 추가됨
   - `App Groups`: 추가됨
   - `group.com.jsiwon.adstudyhelper`: 두 타깃 모두 체크됨

현재 식별자는 다음과 같습니다.

- 앱 Bundle ID: `com.jsiwon.adstudyhelper.phone`
- 확장 Bundle ID: `com.jsiwon.adstudyhelper.phone.monitor`
- App Group: `group.com.jsiwon.adstudyhelper`

`Failed Registering Bundle Identifier`, App Group 또는 provisioning 오류가 나면 한 식별자만 임의로 변경하지 마세요. `project.yml`, 두 entitlements 파일과 `Shared/SharedStore.swift`의 값을 함께 맞춰야 합니다.

### iPhone에 설치

1. iPhone을 케이블로 연결하고 iPhone의 `이 컴퓨터를 신뢰하시겠습니까?`에서 `신뢰`를 누릅니다.
2. Xcode 상단 실행 기기에서 연결한 iPhone을 선택합니다.
3. iPhone의 `설정 > 개인정보 보호 및 보안 > 개발자 모드`를 켜고 안내에 따라 재시동한 뒤 다시 활성화를 확인합니다.
4. Xcode에서 `ADStudyHelperPhone` scheme을 선택하고 실행 버튼 또는 `Command-R`을 누릅니다.
5. Xcode가 기기 등록과 개발용 provisioning profile 생성을 마치면 iPhone에 `ADStudyHelper`가 설치됩니다.

직접 연결한 기기에 개발용으로 설치하는 단계에는 Family Controls의 App Store/TestFlight 배포 승인이 필요하지 않습니다. TestFlight나 App Store로 배포할 때는 앱과 `ADStudyHelperMonitor` 확장 각각에 대해 Apple에 Family Controls 배포 entitlement를 요청해야 합니다.

### PC와 연결하고 확인

1. Windows에서 iPhone 연동 버전의 ADStudyHelper를 실행하고 설정에서 `iPhone 연동`을 켭니다.
2. Windows 방화벽이 물으면 개인 네트워크 접근을 허용합니다.
3. PC와 iPhone을 같은 Wi-Fi에 연결합니다.
4. iPhone 앱에서 `Screen Time 및 알림 권한 요청`을 누르고 Screen Time, 알림, 로컬 네트워크 권한을 허용합니다.
5. PC 설정에 표시되는 서버 주소와 페어링 토큰을 iPhone에 입력한 뒤 `연결 확인 및 PC 설정 가져오기`를 누릅니다.
6. 감지 방식, 대상 앱, 감지 임계값, BREAK 시간과 예약 휴식을 설정하고 `저장·동기화·감지 시작`을 누릅니다.
7. 다음 항목을 실기기에서 확인합니다.
   - 선택한 앱을 임계값 이상 사용하면 iPhone에 알림이 오고 PC가 BREAK가 되는지
   - 예약 휴식 중에는 허용 앱을 사용해도 PC가 BREAK인지
   - 예약 휴식 중에는 `집중해라!!!` 알림이 발생하지 않는지
   - 예약 휴식이 끝나면 자동으로 일반 집중 판정으로 돌아오는지

### Mac을 반납하기 전에

- Xcode `Settings > Accounts`에서 자신의 Apple Account를 제거합니다.
- 브라우저에서 Apple Developer/App Store Connect 계정을 로그아웃합니다.
- 복사한 프로젝트와 `ADStudyHelperPhone`의 Derived Data만 삭제합니다.
- 키체인에 본인 명의의 `Apple Development` 인증서와 개인 키가 남았다면 해당 Mac의 로컬 복사본만 삭제합니다.
- Apple Developer 웹사이트에서 인증서를 바로 폐기하지는 않습니다. 폐기하면 설치한 개발 빌드에 영향을 줄 수 있습니다.

개발 서명 또는 provisioning profile이 만료되거나 앱을 업데이트해야 하면 Mac에서 같은 절차로 다시 빌드·설치해야 합니다. Mac은 앱 사용 중 계속 켜 둘 필요가 없습니다.

## 알려진 iOS 제약

- 공개 API에는 매번 발생하는 화면 켜짐/잠금 해제 콜백이 없습니다.
- Device Activity 이벤트는 시스템이 전달하므로 정확한 즉시성이 보장되지 않습니다.
- iOS 26 계열에서 임계 이벤트의 조기 콜백 보고가 있어, 확장은 등록 직후 너무 일찍 온 콜백을 무시하고 앱에 상태를 남깁니다.
- PC 로컬 API는 LAN HTTP이므로 처음 연결할 때 iOS의 로컬 네트워크 권한과 Windows 방화벽 인바운드 허용이 필요할 수 있습니다.
