import Foundation
import DeviceActivity
import FamilyControls

extension DeviceActivityName {
    static let adshPhoneFocus = Self("adsh.phone.focus")
}
extension DeviceActivityEvent.Name {
    static let adshPhoneUse = Self("adsh.phone.use")
}

enum MonitoringPlanError: LocalizedError {
    case selectionRequired

    var errorDescription: String? {
        switch self {
        case .selectionRequired:
            return "실제 사용 모드에서는 쉬는 시간으로 처리할 앱이나 카테고리를 하나 이상 선택해야 합니다."
        }
    }
}

enum MonitoringPlan {
    static func apply(
        configuration: PhoneConfiguration = SharedStore.shared.configuration,
        selection: FamilyActivitySelection = SharedStore.shared.activitySelection,
        store: SharedStore = .shared
    ) throws {
        let center = DeviceActivityCenter()
        center.stopMonitoring([.adshPhoneFocus])
        guard configuration.enabled else {
            store.monitorArmedAt = nil
            return
        }

        let applications: Set<ApplicationToken>
        let categories: Set<ActivityCategoryToken>
        let webDomains: Set<WebDomainToken>
        let thresholdSeconds: Int

        switch configuration.detectionMode {
        case .screenOn:
            // 빈 선택은 모든 앱/카테고리/웹 활동을 포함한다. 실제 화면 켜짐 API가 없어 가장 가까운 근사치다.
            applications = []
            categories = []
            webDomains = []
            thresholdSeconds = 1
        case .actualUse:
            applications = selection.applicationTokens
            categories = selection.categoryTokens
            webDomains = selection.webDomainTokens
            guard !applications.isEmpty || !categories.isEmpty || !webDomains.isEmpty else {
                throw MonitoringPlanError.selectionRequired
            }
            thresholdSeconds = configuration.actualUseThresholdSec
        }

        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0, second: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59, second: 59),
            repeats: true
        )
        let event = DeviceActivityEvent(
            applications: applications,
            categories: categories,
            webDomains: webDomains,
            threshold: DateComponents(second: max(1, thresholdSeconds))
        )

        store.monitorArmedAt = Date()
        try center.startMonitoring(
            .adshPhoneFocus,
            during: schedule,
            events: [.adshPhoneUse: event]
        )
        store.lastMonitorError = ""
    }
}
