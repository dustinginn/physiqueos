import Foundation

protocol FounderHTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

struct URLSessionFounderHTTPTransport: FounderHTTPTransport {
    let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { throw FounderServerError.invalidResponse }
        return (data, httpResponse)
    }
}

/// Owns one live Founder device session. Access credentials are memory-only;
/// every successful pairing/refresh atomically replaces the rotating refresh
/// credential in the injected Keychain-backed store.
actor FounderServerAPI {
    static let productionOrigin = URL(string: "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app")!

    private let baseURL: URL
    private let credentialStore: FounderRefreshCredentialStore
    private let transport: FounderHTTPTransport
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var accessToken: String?

    init(
        baseURL: URL = FounderServerAPI.productionOrigin,
        credentialStore: FounderRefreshCredentialStore = KeychainFounderCredentialStore(),
        transport: FounderHTTPTransport = URLSessionFounderHTTPTransport()
    ) {
        self.baseURL = baseURL
        self.credentialStore = credentialStore
        self.transport = transport
        decoder = JSONDecoder()
        encoder = JSONEncoder()
    }

    func hasStoredSession() throws -> Bool {
        try credentialStore.loadRefreshCredential() != nil
    }

    @discardableResult
    func pair(pairingCredential: String, displayName: String) async throws -> FounderServerSession {
        let payload = PairRequest(pairingCredential: pairingCredential, platform: "ios", displayName: displayName)
        let session: FounderServerSession = try await sendJSON(path: "/api/v1/native/auth/pair", method: "POST", body: payload)
        try persist(session)
        return session
    }

    func readCurrentWeight() async throws -> FounderWeightReadResult {
        let startedAt = ContinuousClock.now
        let token = try await validAccessToken()
        do {
            let summary: FounderWeightSummary = try await send(path: "/api/v1/native/weight/summary", method: "GET", bearer: token)
            return FounderWeightReadResult(summary: summary, requestDurationMilliseconds: elapsedMilliseconds(since: startedAt))
        } catch FounderServerError.accessTokenExpired {
            let refreshedToken = try await refreshAccessToken()
            let summary: FounderWeightSummary = try await send(path: "/api/v1/native/weight/summary", method: "GET", bearer: refreshedToken)
            return FounderWeightReadResult(summary: summary, requestDurationMilliseconds: elapsedMilliseconds(since: startedAt))
        }
    }

    func revokeCurrentSession() async throws {
        let token = try await validAccessToken()
        let _: RevocationResponse = try await send(path: "/api/v1/native/auth/session", method: "DELETE", bearer: token)
        accessToken = nil
        try credentialStore.deleteRefreshCredential()
    }

    private func validAccessToken() async throws -> String {
        if let accessToken { return accessToken }
        return try await refreshAccessToken()
    }

    private func refreshAccessToken() async throws -> String {
        let refreshCredential: String
        do {
            guard let stored = try credentialStore.loadRefreshCredential() else { throw FounderServerError.notPaired }
            refreshCredential = stored
        } catch let error as FounderServerError {
            throw error
        } catch {
            throw FounderServerError.refreshFailed
        }

        do {
            let session: FounderServerSession = try await sendJSON(
                path: "/api/v1/native/auth/refresh",
                method: "POST",
                body: RefreshRequest(refreshCredential: refreshCredential)
            )
            try persist(session)
            return session.accessToken
        } catch let error as FounderServerError {
            if error == .deviceOrSessionRevoked || error == .refreshFailed {
                accessToken = nil
                try? credentialStore.deleteRefreshCredential()
            }
            throw error
        } catch {
            // The server has consumed the old rotating credential. If the
            // atomic Keychain replacement fails, deleting the stale value
            // prevents an accidental replay from triggering family reuse.
            accessToken = nil
            try? credentialStore.deleteRefreshCredential()
            throw FounderServerError.refreshFailed
        }
    }

    private func persist(_ session: FounderServerSession) throws {
        try credentialStore.saveRefreshCredential(session.refreshCredential)
        accessToken = session.accessToken
    }

    private func sendJSON<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body
    ) async throws -> Response {
        var request = request(path: path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await execute(request)
    }

    private func send<Response: Decodable>(path: String, method: String, bearer: String) async throws -> Response {
        var request = request(path: path, method: method)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await execute(request)
    }

    private func request(path: String, method: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private func execute<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch let error as FounderServerError {
            throw error
        } catch let error as URLError {
            if [.cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .networkConnectionLost, .notConnectedToInternet, .timedOut].contains(error.code) {
                throw FounderServerError.networkFailure
            }
            throw FounderServerError.networkFailure
        } catch {
            throw FounderServerError.networkFailure
        }

        guard (200..<300).contains(response.statusCode) else {
            throw mapProblem(status: response.statusCode, data: data)
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw FounderServerError.invalidResponse
        }
    }

    private func mapProblem(status: Int, data: Data) -> FounderServerError {
        let problem = try? decoder.decode(FounderServerProblem.self, from: data)
        switch problem?.code {
        case "ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_INVALID": return .accessTokenExpired
        case "ACCESS_TOKEN_REVOKED", "REFRESH_CREDENTIAL_REVOKED", "REFRESH_REUSE_DETECTED": return .deviceOrSessionRevoked
        case "REFRESH_CREDENTIAL_INVALID", "REFRESH_CREDENTIAL_EXPIRED", "CREDENTIAL_MALFORMED": return .refreshFailed
        case "AUTHENTICATION_REQUIRED": return .notPaired
        case "AUTHORIZATION_DENIED": return .unauthorizedScope
        default:
            if status >= 500 { return .serverUnavailable }
            if status == 401 { return .refreshFailed }
            if status == 403 { return .unauthorizedScope }
            return .serverProblem(code: problem?.code ?? "HTTP_\(status)", message: problem?.title ?? "The request could not be completed.")
        }
    }

    private func elapsedMilliseconds(since instant: ContinuousClock.Instant) -> Int {
        let components = instant.duration(to: .now).components
        return max(0, Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000))
    }
}

private struct PairRequest: Encodable {
    let pairingCredential: String
    let platform: String
    let displayName: String
}

private struct RefreshRequest: Encodable {
    let refreshCredential: String
}

private struct RevocationResponse: Decodable {
    let revoked: Bool
}
