import Foundation
import FamilyControls

final class SharedStore {
    static let shared = SharedStore()
    static let appGroup = "group.com.jsiwon.adstudyhelper"

    private enum Key {
        static let configuration = "phone.configuration"
        static let serverURL = "desktop.serverURL"
        static let pairingToken = "desktop.pairingToken"
        static let deviceId = "phone.deviceId"
        static let sessionId = "phone.sessionId"
        static let selection = "screenTime.selection"
        static let monitorArmedAt = "screenTime.monitorArmedAt"
        static let pendingEvents = "desktop.pendingEvents"
        static let lastMonitorError = "screenTime.lastError"
    }

    private let defaults: UserDefaults
    private let lock = NSLock()
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        defaults = UserDefaults(suiteName: Self.appGroup) ?? .standard
    }

    var configuration: PhoneConfiguration {
        get { decode(PhoneConfiguration.self, forKey: Key.configuration) ?? .default }
        set {
            var normalized = newValue
            normalized.normalize()
            encode(normalized, forKey: Key.configuration)
        }
    }

    var serverURL: String {
        get { defaults.string(forKey: Key.serverURL) ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Key.serverURL) }
    }

    var pairingToken: String {
        get { defaults.string(forKey: Key.pairingToken) ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: Key.pairingToken) }
    }

    var deviceId: String {
        if let existing = defaults.string(forKey: Key.deviceId), !existing.isEmpty { return existing }
        let created = UUID().uuidString
        defaults.set(created, forKey: Key.deviceId)
        return created
    }

    var sessionId: String {
        if let existing = defaults.string(forKey: Key.sessionId), !existing.isEmpty { return existing }
        return rotateSession()
    }

    @discardableResult
    func rotateSession() -> String {
        let created = UUID().uuidString
        defaults.set(created, forKey: Key.sessionId)
        return created
    }

    var activitySelection: FamilyActivitySelection {
        get { decode(FamilyActivitySelection.self, forKey: Key.selection) ?? FamilyActivitySelection() }
        set { encode(newValue, forKey: Key.selection) }
    }

    var monitorArmedAt: Date? {
        get { defaults.object(forKey: Key.monitorArmedAt) as? Date }
        set { defaults.set(newValue, forKey: Key.monitorArmedAt) }
    }

    var lastMonitorError: String {
        get { defaults.string(forKey: Key.lastMonitorError) ?? "" }
        set { defaults.set(newValue, forKey: Key.lastMonitorError) }
    }

    var pendingEvents: [PhoneEvent] {
        get { decode([PhoneEvent].self, forKey: Key.pendingEvents) ?? [] }
        set { encode(Array(newValue.suffix(100)), forKey: Key.pendingEvents) }
    }

    func enqueue(_ event: PhoneEvent) {
        lock.lock()
        defer { lock.unlock() }
        var events = pendingEvents
        if !events.contains(where: { $0.eventId == event.eventId }) {
            events.append(event)
            pendingEvents = events
        }
    }

    func removePending(eventId: String) {
        lock.lock()
        defer { lock.unlock() }
        pendingEvents = pendingEvents.filter { $0.eventId != eventId }
    }

    private func encode<T: Encodable>(_ value: T, forKey key: String) {
        if let data = try? encoder.encode(value) {
            defaults.set(data, forKey: key)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? decoder.decode(type, from: data)
    }
}
