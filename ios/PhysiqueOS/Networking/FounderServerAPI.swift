import Foundation

protocol FounderHTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
    func upload(
        for request: URLRequest,
        from body: Data,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> (Data, HTTPURLResponse)
}

extension FounderHTTPTransport {
    func upload(
        for request: URLRequest,
        from body: Data,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> (Data, HTTPURLResponse) {
        var request = request
        request.httpBody = body
        let result = try await data(for: request)
        onProgress(1)
        return result
    }
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

    func upload(
        for request: URLRequest,
        from body: Data,
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> (Data, HTTPURLResponse) {
        let delegate = FounderUploadProgressDelegate(onProgress: onProgress)
        let (data, response) = try await session.upload(for: request, from: body, delegate: delegate)
        guard let httpResponse = response as? HTTPURLResponse else { throw FounderServerError.invalidResponse }
        onProgress(1)
        return (data, httpResponse)
    }
}

private final class FounderUploadProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(min(max(Double(totalBytesSent) / Double(totalBytesExpectedToSend), 0), 1))
    }
}

/// Owns one live Founder device session. Access credentials are memory-only;
/// every successful pairing/refresh atomically replaces the rotating refresh
/// credential in the injected Keychain-backed store.
actor FounderServerAPI {
    static let sandboxOrigin = NativeAPIEnvironment.sandbox.baseURL
    private static let sandboxRoutePrefix = "/api/v1/native/sandbox"

    private let baseURL: URL
    private let credentialStore: FounderRefreshCredentialStore
    private let transport: FounderHTTPTransport
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private var accessToken: String?

    init(
        baseURL: URL = FounderServerAPI.sandboxOrigin,
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
        let session: FounderServerSession = try await sendJSON(path: "\(Self.sandboxRoutePrefix)/auth/pair", method: "POST", body: payload)
        try persist(session)
        return session
    }

    func readCurrentWeight() async throws -> FounderWeightReadResult {
        let startedAt = ContinuousClock.now
        let token = try await validAccessToken()
        do {
            let summary: FounderWeightSummary = try await send(path: "\(Self.sandboxRoutePrefix)/weight/summary", method: "GET", bearer: token)
            return FounderWeightReadResult(summary: summary, requestDurationMilliseconds: elapsedMilliseconds(since: startedAt))
        } catch FounderServerError.accessTokenExpired {
            let refreshedToken = try await refreshAccessToken()
            let summary: FounderWeightSummary = try await send(path: "\(Self.sandboxRoutePrefix)/weight/summary", method: "GET", bearer: refreshedToken)
            return FounderWeightReadResult(summary: summary, requestDurationMilliseconds: elapsedMilliseconds(since: startedAt))
        }
    }

    func readPhotoAcceptanceManifest() async throws -> FounderPhotoAcceptanceManifest {
        try await authenticatedRead(path: "\(Self.sandboxRoutePrefix)/photo-acceptance/manifest")
    }

    func readPhotoAcceptanceMedia(mediaId: String) async throws -> Data {
        guard !mediaId.isEmpty,
              mediaId.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil
        else { throw FounderServerError.invalidResponse }
        return try await authenticatedData(path: "\(Self.sandboxRoutePrefix)/photo-acceptance/media/\(mediaId)")
    }

    /// Writes canonical sandbox Weight directly from a Founder-entered
    /// scalar — the sandbox-only counterpart to the web's
    /// `saveDirectWeighIn`. No media, OCR, or candidate/review pipeline is
    /// involved; the server commits (or corrects) the day record itself.
    func submitManualWeight(_ manualWeight: NativeSandboxWeightManualRequest) async throws -> NativeSandboxWeightManualResult {
        let token = try await validAccessToken()
        do {
            return try await sendJSON(path: "\(Self.sandboxRoutePrefix)/weight/manual", method: "POST", body: manualWeight, bearer: token)
        } catch FounderServerError.accessTokenExpired {
            let refreshedToken = try await refreshAccessToken()
            return try await sendJSON(path: "\(Self.sandboxRoutePrefix)/weight/manual", method: "POST", body: manualWeight, bearer: refreshedToken)
        }
    }

    /// Prepares the real-asset Weight acceptance path without committing a
    /// canonical Weight record. The server receives both the original bytes
    /// and Native's local candidate and remains responsible for validation.
    func submitWeightCandidate(
        _ candidate: NativeSandboxWeightCandidate,
        asset: Data,
        filename: String,
        contentType: String
    ) async throws -> NativeSandboxWeightReview {
        let token = try await validAccessToken()
        do {
            return try await sendMultipartWeightCandidate(
                candidate, asset: asset, filename: filename, contentType: contentType, bearer: token
            )
        } catch FounderServerError.accessTokenExpired {
            let refreshedToken = try await refreshAccessToken()
            return try await sendMultipartWeightCandidate(
                candidate, asset: asset, filename: filename, contentType: contentType, bearer: refreshedToken
            )
        }
    }

    func revokeCurrentSession() async throws {
        let token = try await validAccessToken()
        let _: RevocationResponse = try await send(path: "\(Self.sandboxRoutePrefix)/auth/session", method: "DELETE", bearer: token)
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
                path: "\(Self.sandboxRoutePrefix)/auth/refresh",
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

    private func sendJSON<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        bearer: String
    ) async throws -> Response {
        var request = request(path: path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.httpBody = try encoder.encode(body)
        return try await execute(request)
    }

    private func send<Response: Decodable>(path: String, method: String, bearer: String) async throws -> Response {
        var request = request(path: path, method: method)
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        return try await execute(request)
    }

    private func authenticatedRead<Response: Decodable>(path: String) async throws -> Response {
        let token = try await validAccessToken()
        do {
            return try await send(path: path, method: "GET", bearer: token)
        } catch FounderServerError.accessTokenExpired {
            let refreshedToken = try await refreshAccessToken()
            return try await send(path: path, method: "GET", bearer: refreshedToken)
        }
    }

    private func authenticatedData(path: String) async throws -> Data {
        let token = try await validAccessToken()
        do {
            return try await sendData(path: path, bearer: token)
        } catch FounderServerError.accessTokenExpired {
            let refreshedToken = try await refreshAccessToken()
            return try await sendData(path: path, bearer: refreshedToken)
        }
    }

    private func sendData(path: String, bearer: String) async throws -> Data {
        var request = request(path: path, method: "GET")
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        // The generic request builder asks for JSON. Photo delivery is a
        // binary endpoint and must explicitly advertise the formats iOS can
        // decode; leaving `application/json` here caused some proxies to
        // negotiate an error body even though the manifest was valid.
        request.setValue("image/heic,image/heif,image/jpeg,image/png,image/webp,image/*;q=0.9", forHTTPHeaderField: "Accept")
        let (data, response): (Data, HTTPURLResponse)
        do {
            (data, response) = try await transport.data(for: request)
        } catch {
            throw FounderServerError.networkFailure
        }
        guard (200..<300).contains(response.statusCode) else {
            throw mapProblem(status: response.statusCode, data: data)
        }
        guard response.mimeType?.hasPrefix("image/") == true, !data.isEmpty else {
            throw FounderServerError.invalidResponse
        }
        return data
    }

    private func sendMultipartWeightCandidate(
        _ candidate: NativeSandboxWeightCandidate,
        asset: Data,
        filename: String,
        contentType: String,
        bearer: String
    ) async throws -> NativeSandboxWeightReview {
        let boundary = "PhysiqueOSNativeWeight\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var request = request(path: "\(Self.sandboxRoutePrefix)/weight/candidates", method: "POST")
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        body.appendMultipartField(name: "candidate", value: try encoder.encode(candidate), boundary: boundary, contentType: "application/json")
        body.appendMultipartFile(name: "asset", filename: filename, contentType: contentType, data: asset, boundary: boundary)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
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

/// The single authenticated transport boundary for Founder Production.
/// It intentionally exposes reads, media, and auth lifecycle operations but
/// no product command API; Founder Production is hard read-only in Patch 1.
actor ProductionNativeAPI {
    static let contractVersion = "1"

    private let configuration: NativeAPIEnvironment
    private let baseURL: URL
    private let credentialStore: FounderRefreshCredentialStore
    private let transport: FounderHTTPTransport
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
    private let encoder = JSONEncoder()
    private var accessToken: String?
    private var refreshTask: Task<String, Error>?

    init(
        configuration: NativeAPIEnvironment = .founderProduction,
        baseURL: URL? = nil,
        credentialStore: FounderRefreshCredentialStore? = nil,
        transport: FounderHTTPTransport = URLSessionFounderHTTPTransport()
    ) {
        precondition(configuration == .founderProduction, "ProductionNativeAPI requires Founder Production authority.")
        self.configuration = configuration
        self.baseURL = baseURL ?? configuration.baseURL
        self.credentialStore = credentialStore ?? KeychainFounderCredentialStore(namespace: configuration.credentialNamespace)
        self.transport = transport
    }

    func hasStoredSession() throws -> Bool {
        try credentialStore.loadRefreshCredential() != nil
    }

    @discardableResult
    func pair(pairingCredential: String, displayName: String) async throws -> FounderServerSession {
        let payload = PairRequest(pairingCredential: pairingCredential, platform: "ios", displayName: displayName)
        let session: FounderServerSession = try await sendJSON(
            path: "\(configuration.routeFamily)/auth/pair",
            method: "POST",
            body: payload,
            bearer: nil
        )
        try persist(session)
        return session
    }

    func revokeCurrentSession() async throws {
        let response: RevocationResponse = try await authenticatedJSON(
            path: "\(configuration.routeFamily)/auth/session",
            method: "DELETE"
        )
        guard response.revoked else { throw ProductionNativeError.invalidResponse }
        accessToken = nil
        try credentialStore.deleteRefreshCredential()
    }

    func readProfile() async throws -> ProductionResponseEnvelope<ProductionProfileData> {
        let envelope: ProductionResponseEnvelope<ProductionProfileData> = try await authenticatedJSON(
            path: "\(configuration.routeFamily)/profile",
            method: "GET"
        )
        try validate(envelope, expectedResource: "profile")
        guard envelope.data.authority.type == configuration.expectedAuthority,
              envelope.data.authority.sandbox == false
        else {
            throw ProductionNativeError.authorityMismatch(
                expected: configuration.expectedAuthority,
                actual: envelope.data.authority.type
            )
        }
        return envelope
    }

    func readContracts() async throws -> ProductionContractManifest {
        let manifest: ProductionContractManifest = try await authenticatedJSON(
            path: "\(configuration.routeFamily)/contracts",
            method: "GET"
        )
        guard manifest.contractVersion == Self.contractVersion else {
            throw ProductionNativeError.incompatibleContractVersion(expected: Self.contractVersion, actual: manifest.contractVersion)
        }
        guard manifest.authority == configuration.expectedAuthority,
              manifest.bootstrap.authority == configuration.expectedAuthority,
              manifest.reads.allSatisfy({ $0.authority == configuration.expectedAuthority }),
              manifest.writes.allSatisfy({ $0.authority == configuration.expectedAuthority })
        else {
            throw ProductionNativeError.authorityMismatch(expected: configuration.expectedAuthority, actual: manifest.authority)
        }
        return manifest
    }

    func readWeight() async throws -> ProductionResponseEnvelope<FounderProductionWeightSummary> {
        try await readResource("weight", as: FounderProductionWeightSummary.self)
    }

    func readResource<Payload: Decodable & Sendable>(
        _ resource: String,
        query: [String: String] = [:],
        as type: Payload.Type
    ) async throws -> ProductionResponseEnvelope<Payload> {
        guard resource.range(of: #"^[a-z][a-z0-9-]*$"#, options: .regularExpression) != nil else {
            throw ProductionNativeError.invalidResponse
        }
        let envelope: ProductionResponseEnvelope<Payload> = try await authenticatedJSON(
            path: "\(configuration.routeFamily)/read/\(resource)",
            method: "GET",
            query: query
        )
        try validate(envelope, expectedResource: resource)
        return envelope
    }

    func readMedia(mediaId: String) async throws -> ProductionMediaPayload {
        guard !mediaId.isEmpty,
              mediaId.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil
        else { throw ProductionNativeError.invalidResponse }

        let (data, response) = try await authenticatedResponse(
            path: "\(configuration.routeFamily)/media/\(mediaId)",
            method: "GET",
            accept: "image/jpeg,image/png,image/heic,image/webp,application/pdf"
        )
        let contentType = response.mimeType?.lowercased()
        let supported = ["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"]
        guard let contentType, supported.contains(contentType) else {
            throw ProductionNativeError.unsupportedMediaType(contentType)
        }
        guard !data.isEmpty else { throw ProductionNativeError.invalidResponse }
        return ProductionMediaPayload(data: data, contentType: contentType)
    }

    /// `POST /api/v1/native/evidence/intakes` — DEXA PDF / Nutrition &
    /// Activity screenshot intake (`NativeEvidenceIntakeRequest.js`). The
    /// server REQUIRES `Idempotency-Key` to equal the `submissionIdentity`
    /// form field exactly (`IDEMPOTENCY_IDENTITY_MISMATCH` otherwise) and
    /// validates it as a UUID — always pass a plain `UUID().uuidString`.
    /// Returns HTTP 202; the artifact is verified/stored synchronously but
    /// interpretation (producing a `reviewId`) happens asynchronously —
    /// poll `fetchEvidenceIntakeStatus(intakeId:)`.
    func submitEvidenceIntake(
        submissionIdentity: String,
        effectiveDate: String,
        expectedEvidenceType: String,
        files: [(filename: String, contentType: String, data: Data)],
        onUploadProgress: @escaping @Sendable (Double) -> Void = { _ in }
    ) async throws -> ProductionEvidenceIntakeStatus {
        let boundary = "PhysiqueOSNativeIntake\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var body = Data()
        body.appendMultipartField(name: "submissionIdentity", value: Data(submissionIdentity.utf8), boundary: boundary, contentType: "text/plain")
        body.appendMultipartField(name: "effectiveDate", value: Data(effectiveDate.utf8), boundary: boundary, contentType: "text/plain")
        body.appendMultipartField(name: "expectedEvidenceType", value: Data(expectedEvidenceType.utf8), boundary: boundary, contentType: "text/plain")
        for file in files {
            body.appendMultipartFile(name: "evidenceFiles", filename: file.filename, contentType: file.contentType, data: file.data, boundary: boundary)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        let headers = [
            "Idempotency-Key": submissionIdentity,
            "Content-Type": "multipart/form-data; boundary=\(boundary)",
        ]
        let path = "\(configuration.routeFamily)/evidence/intakes"
        let token = try await validAccessToken()
        var result = try await performUpload(path: path, method: "POST", body: body, bearer: token, accept: "application/json", headers: headers, onProgress: onUploadProgress)
        if result.1.statusCode == 401, isRefreshableAuthenticationProblem(data: result.0) {
            let refreshedToken = try await refreshAccessToken()
            result = try await performUpload(path: path, method: "POST", body: body, bearer: refreshedToken, accept: "application/json", headers: headers, onProgress: onUploadProgress)
        }
        try validateHTTP(result.1, data: result.0)
        do { return try decoder.decode(ProductionEvidenceIntakeStatus.self, from: result.0) }
        catch { throw ProductionNativeError.invalidResponse }
    }

    private func performUpload(
        path: String,
        method: String,
        body: Data,
        bearer: String,
        accept: String,
        headers: [String: String],
        onProgress: @escaping @Sendable (Double) -> Void
    ) async throws -> (Data, HTTPURLResponse) {
        let endpoint = baseURL.appending(path: path)
        guard let url = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)?.url else {
            throw ProductionNativeError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 120
        request.setValue(accept, forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        do { return try await transport.upload(for: request, from: body, onProgress: onProgress) }
        catch { throw ProductionNativeError.networkFailure }
    }

    func fetchEvidenceIntakeStatus(intakeId: String) async throws -> ProductionEvidenceIntakeStatus {
        try await authenticatedJSON(path: "\(configuration.routeFamily)/evidence/intakes/\(intakeId)", method: "GET")
    }

    private func validate<Payload>(_ envelope: ProductionResponseEnvelope<Payload>, expectedResource: String) throws {
        guard envelope.contractVersion == Self.contractVersion else {
            throw ProductionNativeError.incompatibleContractVersion(expected: Self.contractVersion, actual: envelope.contractVersion)
        }
        guard envelope.resource == expectedResource else {
            throw ProductionNativeError.resourceMismatch(expected: expectedResource, actual: envelope.resource)
        }
        guard envelope.authority == configuration.expectedAuthority else {
            throw ProductionNativeError.authorityMismatch(expected: configuration.expectedAuthority, actual: envelope.authority)
        }
    }

    private func validAccessToken() async throws -> String {
        if let accessToken { return accessToken }
        return try await refreshAccessToken()
    }

    private func refreshAccessToken() async throws -> String {
        if let refreshTask { return try await refreshTask.value }
        let task = Task { try await self.rotateRefreshCredential() }
        refreshTask = task
        do {
            let token = try await task.value
            refreshTask = nil
            return token
        } catch {
            refreshTask = nil
            throw error
        }
    }

    private func rotateRefreshCredential() async throws -> String {
        guard let refreshCredential = try credentialStore.loadRefreshCredential() else {
            throw ProductionNativeError.notPaired
        }
        do {
            let session: FounderServerSession = try await sendJSON(
                path: "\(configuration.routeFamily)/auth/refresh",
                method: "POST",
                body: RefreshRequest(refreshCredential: refreshCredential),
                bearer: nil
            )
            try persist(session)
            return session.accessToken
        } catch {
            if case ProductionNativeError.unauthenticated = error {
                accessToken = nil
                try? credentialStore.deleteRefreshCredential()
            }
            throw error
        }
    }

    private func persist(_ session: FounderServerSession) throws {
        try credentialStore.saveRefreshCredential(session.refreshCredential)
        accessToken = session.accessToken
    }

    private func authenticatedJSON<Response: Decodable>(
        path: String,
        method: String,
        query: [String: String] = [:]
    ) async throws -> Response {
        let (data, _) = try await authenticatedResponse(path: path, method: method, query: query, accept: "application/json")
        do { return try decoder.decode(Response.self, from: data) }
        catch { throw ProductionNativeError.invalidResponse }
    }

    private func authenticatedResponse(
        path: String,
        method: String,
        query: [String: String] = [:],
        accept: String
    ) async throws -> (Data, HTTPURLResponse) {
        let token = try await validAccessToken()
        var result = try await perform(path: path, method: method, query: query, body: nil, bearer: token, accept: accept)
        if result.1.statusCode == 401, isRefreshableAuthenticationProblem(data: result.0) {
            let refreshedToken = try await refreshAccessToken()
            result = try await perform(path: path, method: method, query: query, body: nil, bearer: refreshedToken, accept: accept)
        }
        try validateHTTP(result.1, data: result.0)
        return result
    }

    private func sendJSON<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        bearer: String?
    ) async throws -> Response {
        let encoded: Data
        do { encoded = try encoder.encode(body) }
        catch { throw ProductionNativeError.invalidResponse }
        let (data, response) = try await perform(
            path: path,
            method: method,
            body: encoded,
            bearer: bearer,
            accept: "application/json"
        )
        try validateHTTP(response, data: data)
        do { return try decoder.decode(Response.self, from: data) }
        catch { throw ProductionNativeError.invalidResponse }
    }

    private func perform(
        path: String,
        method: String,
        query: [String: String] = [:],
        body: Data?,
        bearer: String?,
        accept: String,
        headers: [String: String] = [:]
    ) async throws -> (Data, HTTPURLResponse) {
        let endpoint = baseURL.appending(path: path)
        guard var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false) else {
            throw ProductionNativeError.invalidResponse
        }
        if !query.isEmpty {
            components.queryItems = query.keys.sorted().map { URLQueryItem(name: $0, value: query[$0]) }
        }
        guard let url = components.url else { throw ProductionNativeError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        request.setValue(accept, forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        do { return try await transport.data(for: request) }
        catch { throw ProductionNativeError.networkFailure }
    }

    /// Founder Production's one command dispatch endpoint
    /// (`POST /api/v1/native/commands`, `Phase3CommandService.js`) —
    /// every enabled write domain funnels through this single method.
    /// `idempotencyKey` MUST be the same value across a retry of the same
    /// logical write attempt (the caller owns generating/persisting it —
    /// see `ProductionIdempotentSubmission`) so the server's own command
    /// receipt replay returns the original outcome instead of creating a
    /// second mutation. `expectedVersion` becomes the `If-Match` header
    /// (server strips a leading `W/` and surrounding quotes) for
    /// correction-style commands that require optimistic concurrency;
    /// omit it for create-only commands that don't need it.
    func submitCommand<Payload: Encodable, Result: Decodable>(
        _ commandType: String,
        idempotencyKey: String,
        expectedVersion: String? = nil,
        payload: Payload
    ) async throws -> ProductionCommandOutcome<Result> {
        let metadata = ProductionCommandRequestMetadata(
            commandId: UUIDv7.generateString(),
            idempotencyKey: idempotencyKey,
            expectedVersion: expectedVersion
        )
        let envelope = ProductionCommandRequestEnvelope(commandType: commandType, metadata: metadata, payload: payload)
        let encoded: Data
        do { encoded = try encoder.encode(envelope) }
        catch { throw ProductionNativeError.invalidResponse }

        var headers = ["Idempotency-Key": idempotencyKey]
        if let expectedVersion { headers["If-Match"] = "\"\(expectedVersion)\"" }

        let token = try await validAccessToken()
        var result = try await perform(
            path: "\(configuration.routeFamily)/commands",
            method: "POST",
            body: encoded,
            bearer: token,
            accept: "application/json",
            headers: headers
        )
        if result.1.statusCode == 401, isRefreshableAuthenticationProblem(data: result.0) {
            let refreshedToken = try await refreshAccessToken()
            result = try await perform(
                path: "\(configuration.routeFamily)/commands",
                method: "POST",
                body: encoded,
                bearer: refreshedToken,
                accept: "application/json",
                headers: headers
            )
        }
        try validateHTTP(result.1, data: result.0)
        do { return try decoder.decode(ProductionCommandOutcome<Result>.self, from: result.0) }
        catch { throw ProductionNativeError.invalidResponse }
    }

    private func validateHTTP(_ response: HTTPURLResponse, data: Data) throws {
        guard !(200..<300).contains(response.statusCode) else { return }
        let problem = try? decoder.decode(ProductionProblemDetails.self, from: data)
        switch response.statusCode {
        case 401: throw ProductionNativeError.unauthenticated(problem)
        case 404: throw ProductionNativeError.notFound(problem)
        case 400:
            if let problem { throw ProductionNativeError.validation(problem) }
            throw ProductionNativeError.server(nil)
        case 412:
            if let problem { throw ProductionNativeError.failedPrecondition(problem) }
            throw ProductionNativeError.server(nil)
        case 428:
            if let problem { throw ProductionNativeError.preconditionRequired(problem) }
            throw ProductionNativeError.server(nil)
        case 409:
            if let problem { throw ProductionNativeError.conflict(problem) }
            throw ProductionNativeError.server(nil)
        case 500...599: throw ProductionNativeError.temporaryServer(problem)
        default: throw ProductionNativeError.server(problem)
        }
    }

    private func isRefreshableAuthenticationProblem(data: Data) -> Bool {
        guard let problem = try? decoder.decode(ProductionProblemDetails.self, from: data) else { return false }
        return ["ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_INVALID"].contains(problem.code)
    }
}

extension Data {
    mutating func appendMultipartField(name: String, value: Data, boundary: String, contentType: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        append(value)
        append("\r\n".data(using: .utf8)!)
    }

    mutating func appendMultipartFile(name: String, filename: String, contentType: String, data: Data, boundary: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(contentType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
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
