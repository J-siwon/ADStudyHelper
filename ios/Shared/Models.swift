import Foundation

enum DetectionMode: String, Codable, CaseIterable, Identifiable {
    case screenOn = "screen_on"
    case actualUse = "actual_use"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .screenOn: return "화면 켜짐 근사"
        case .actualUse: return "실제 사용 시작"
        }
    }
}
struct RestSchedule: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var enabled: Bool
    /// 0=일요일 ... 6=토요일. 데스크톱 JavaScript Date.getDay()와 동일하다.
    var days: [Int]
    var start: String
    var end: String

    static func makeDefault() -> RestSchedule {
        RestSchedule(
            id: UUID().uuidString,
            name: "쉬는 시간",
            enabled: true,
            days: [0, 1, 2, 3, 4, 5, 6],
            start: "12:00",
            end: "13:00"
        )
    }
}

struct PhoneConfiguration: Codable, Equatable {
    var enabled: Bool
    var detectionMode: DetectionMode
    var breakDurationSec: Int
    var actualUseThresholdSec: Int
    var alertMessage: String
    var restSchedules: [RestSchedule]

    static let `default` = PhoneConfiguration(
        enabled: false,
        detectionMode: .actualUse,
        breakDurationSec: 60,
        actualUseThresholdSec: 60,
        alertMessage: "집중해라!!!",
        restSchedules: []
    )

    mutating func normalize() {
        breakDurationSec = min(3_600, max(5, breakDurationSec))
        actualUseThresholdSec = min(3_600, max(1, actualUseThresholdSec))
        alertMessage = String((alertMessage.isEmpty ? "집중해라!!!" : alertMessage).prefix(200))
        restSchedules = Array(restSchedules.prefix(32))
    }
}

struct PhoneEvent: Codable, Identifiable, Equatable {
    let eventId: String
    let type: DetectionMode
    let deviceId: String
    let sessionId: String
    let detectedAt: String

    var id: String { eventId }

    static func make(type: DetectionMode, store: SharedStore = .shared, date: Date = Date()) -> PhoneEvent {
        PhoneEvent(
            eventId: UUID().uuidString,
            type: type,
            deviceId: store.deviceId,
            sessionId: store.sessionId,
            detectedAt: ISO8601DateFormatter().string(from: date)
        )
    }
}

struct PhoneStatusResponse: Decodable {
    let ok: Bool
}

struct PhoneConfigResponse: Decodable {
    let ok: Bool
    let config: PhoneConfiguration
}

struct PhoneConfigRequest: Encodable {
    let config: PhoneConfiguration
}
