import Foundation

enum DesktopClientError: LocalizedError {
    case invalidServerURL
    case missingPairingToken
    case invalidResponse
    case server(Int)

    var errorDescription: String? {
        switch self {
        case .invalidServerURL: return "데스크톱 서버 주소를 확인해 주세요."
        case .missingPairingToken: return "페어링 토큰을 입력해 주세요."
        case .invalidResponse: return "데스크톱 응답을 해석할 수 없습니다."
        case .server(let status): return "데스크톱이 오류를 반환했습니다. (HTTP \(status))"
        }
    }
}

struct DesktopClient {
    let serverURL: String
    let pairingToken: String

    init(
        serverURL: String = SharedStore.shared.serverURL,
        pairingToken: String = SharedStore.shared.pairingToken
    ) {
        self.serverURL = serverURL
        self.pairingToken = pairingToken
    }

    func checkConnection() async throws {
        let request = try makeRequest(path: "/api/phone/status", method: "GET")
        _ = try await execute(request)
    }

    func fetchConfiguration() async throws -> PhoneConfiguration {
        let request = try makeRequest(path: "/api/phone/config", method: "GET")
        let data = try await execute(request)
        guard let response = try? JSONDecoder().decode(PhoneConfigResponse.self, from: data) else {
            throw DesktopClientError.invalidResponse
        }
        return response.config
    }

    func pushConfiguration(_ configuration: PhoneConfiguration) async throws {
        var request = try makeRequest(path: "/api/phone/config", method: "PUT")
        request.httpBody = try JSONEncoder().encode(PhoneConfigRequest(config: configuration))
        _ = try await execute(request)
    }

    func sendEvent(_ event: PhoneEvent) async throws {
        var request = try makeRequest(path: "/api/phone/event", method: "POST")
        request.httpBody = try JSONEncoder().encode(event)
        _ = try await execute(request)
    }

    func flushPendingEvents(store: SharedStore = .shared) async {
        for event in store.pendingEvents {
            do {
                try await sendEvent(event)
                store.removePending(eventId: event.eventId)
            } catch DesktopClientError.server(let status) where status == 409 {
                // 비활성화/모드 변경으로 거부된 오래된 이벤트는 다시 보내지 않는다.
                store.removePending(eventId: event.eventId)
            } catch {
                return
            }
        }
    }

    static func sendBestEffort(_ event: PhoneEvent, store: SharedStore = .shared) {
        store.enqueue(event)
        guard let request = try? DesktopClient().eventRequest(event) else { return }
        URLSession.shared.dataTask(with: request) { _, response, _ in
            guard let http = response as? HTTPURLResponse,
                  (200..<300).contains(http.statusCode) || http.statusCode == 409 else { return }
            store.removePending(eventId: event.eventId)
        }.resume()
    }

    private func eventRequest(_ event: PhoneEvent) throws -> URLRequest {
        var request = try makeRequest(path: "/api/phone/event", method: "POST")
        request.httpBody = try JSONEncoder().encode(event)
        return request
    }

    private func makeRequest(path: String, method: String) throws -> URLRequest {
        let trimmed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed + path), url.host != nil else {
            throw DesktopClientError.invalidServerURL
        }
        guard !pairingToken.isEmpty else { throw DesktopClientError.missingPairingToken }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 8
        request.setValue("Bearer \(pairingToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        return request
    }

    private func execute(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw DesktopClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw DesktopClientError.server(http.statusCode) }
        return data
    }
}
