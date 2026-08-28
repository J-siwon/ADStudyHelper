import FamilyControls
import Foundation
import UserNotifications

@MainActor
final class FocusIntegrationModel: ObservableObject {
    @Published var configuration: PhoneConfiguration
    @Published var selection: FamilyActivitySelection
    @Published var serverURL: String
    @Published var pairingToken: String
    @Published var statusMessage = ""
    @Published var isBusy = false
    @Published var authorizationText = "확인 전"

    private let store = SharedStore.shared

    init() {
        configuration = store.configuration
        selection = store.activitySelection
        serverURL = store.serverURL
        pairingToken = store.pairingToken
        refreshAuthorizationText()
    }

    func requestPermissions() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let notificationsAllowed = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            refreshAuthorizationText()
            statusMessage = notificationsAllowed
                ? "Screen Time과 알림 권한이 허용되었습니다."
                : "Screen Time은 허용됐지만 알림 권한이 꺼져 있습니다."
        } catch {
            refreshAuthorizationText()
            statusMessage = "권한 요청 실패: \(error.localizedDescription)"
        }
    }

    func saveAndStart() async {
        isBusy = true
        defer { isBusy = false }

        configuration.normalize()
        store.configuration = configuration
        store.activitySelection = selection
        store.serverURL = serverURL
        store.pairingToken = pairingToken
        store.rotateSession()

        do {
            try MonitoringPlan.apply(
                configuration: configuration,
                selection: selection,
                store: store
            )

            if !serverURL.isEmpty && !pairingToken.isEmpty {
                try await DesktopClient(
                    serverURL: serverURL,
                    pairingToken: pairingToken
                ).pushConfiguration(configuration)
                statusMessage = configuration.enabled
                    ? "저장·동기화 완료. Screen Time 감지를 시작했습니다."
                    : "저장·동기화 완료. Screen Time 감지를 중지했습니다."
            } else {
                statusMessage = "iPhone에는 저장했습니다. 데스크톱 주소와 토큰을 입력하면 PC와 동기화됩니다."
            }
        } catch {
            statusMessage = "저장됨, 시작/동기화 실패: \(error.localizedDescription)"
        }
    }

    func connectAndPull() async {
        isBusy = true
        defer { isBusy = false }
        store.serverURL = serverURL
        store.pairingToken = pairingToken

        let client = DesktopClient(serverURL: serverURL, pairingToken: pairingToken)
        do {
            try await client.checkConnection()
            var remote = try await client.fetchConfiguration()
            remote.normalize()
            configuration = remote
            store.configuration = remote
            try MonitoringPlan.apply(configuration: remote, selection: selection, store: store)
            await client.flushPendingEvents(store: store)
            statusMessage = "데스크톱 연결 성공. PC 설정을 가져왔습니다."
        } catch {
            statusMessage = "데스크톱 연결 실패: \(error.localizedDescription)"
        }
    }

    func flushPendingEvents() async {
        guard !serverURL.isEmpty, !pairingToken.isEmpty else { return }
        await DesktopClient(serverURL: serverURL, pairingToken: pairingToken)
            .flushPendingEvents(store: store)
        if !store.lastMonitorError.isEmpty {
            statusMessage = store.lastMonitorError
        }
    }

    func addSchedule() {
        configuration.restSchedules.append(.makeDefault())
    }

    func removeSchedules(at offsets: IndexSet) {
        configuration.restSchedules.remove(atOffsets: offsets)
    }

    private func refreshAuthorizationText() {
        switch AuthorizationCenter.shared.authorizationStatus {
        case .approved: authorizationText = "허용됨"
        case .denied: authorizationText = "거부됨"
        case .notDetermined: authorizationText = "요청 전"
        @unknown default: authorizationText = "알 수 없음"
        }
    }
}
