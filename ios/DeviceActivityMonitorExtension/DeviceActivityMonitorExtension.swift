import DeviceActivity
import Foundation

final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, activity: activity)
        guard activity == .adshPhoneFocus, event == .adshPhoneUse else { return }

        let store = SharedStore.shared
        let configuration = store.configuration
        guard configuration.enabled else { return }

        // iOS 26 계열의 즉시 오발 콜백을 최소한으로 방어한다. 공개 API가 실제 사용시간 원본을 주지는 않는다.
        let minimumElapsed = configuration.detectionMode == .screenOn
            ? 1
            : configuration.actualUseThresholdSec
        if let armedAt = store.monitorArmedAt,
           Date().timeIntervalSince(armedAt) + 0.5 < Double(minimumElapsed) {
            store.lastMonitorError = "Screen Time 콜백이 설정 임계값보다 일찍 도착해 무시했습니다. 앱에서 모니터링을 다시 시작해 주세요."
            return
        }

        EventDispatcher.dispatchDetectedUse(configuration: configuration, store: store)

        // 한 번의 임계 이벤트 뒤 새 세션으로 재등록해 다음 사용도 감지한다.
        do {
            try MonitoringPlan.apply(
                configuration: configuration,
                selection: store.activitySelection,
                store: store
            )
        } catch {
            store.lastMonitorError = error.localizedDescription
        }
    }
}
