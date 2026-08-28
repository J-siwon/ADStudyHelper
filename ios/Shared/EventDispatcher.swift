import Foundation
import UserNotifications

enum EventDispatcher {
    static func dispatchDetectedUse(
        configuration: PhoneConfiguration = SharedStore.shared.configuration,
        store: SharedStore = .shared,
        at date: Date = Date()
    ) {
        let event = PhoneEvent.make(type: configuration.detectionMode, store: store, date: date)
        let isScheduledRest = RestScheduleEvaluator.activeSchedule(
            in: configuration.restSchedules,
            at: date
        ) != nil

        // 예약 휴식 중에는 집중 경고를 보내지 않지만 데스크톱에는 독립 이벤트로 기록한다.
        if !isScheduledRest {
            let content = UNMutableNotificationContent()
            content.title = "ADStudyHelper"
            content.body = configuration.alertMessage
            content.sound = .default
            let request = UNNotificationRequest(
                identifier: "phone-focus-\(event.eventId)",
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request) { _ in }
        }

        DesktopClient.sendBestEffort(event, store: store)
    }
}
