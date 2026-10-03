import Foundation
import CryptoKit
import Security

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
    private let envelopeStore: (any FounderSessionEnvelopeStore)?
    private let installationSigningKey: (any FounderInstallationSigningKey)?
    private let backgroundTaskScheduler: any BackgroundTaskScheduling
    private let transport: FounderHTTPTransport
    /// Used by `submitCommand` only -- every other call site (`readResource`,
    /// `readMedia`, auth) keeps using `transport`. See the doc comment on
    /// `CommandNetworkDiagnosticsTransport` for why commands get their own.
    private let commandTransport: FounderHTTPTransport
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
    private let encoder = JSONEncoder()
    private var accessToken: String?
    private var authenticatedDeviceId: String?
    private var refreshTask: Task<String, Error>?
    private var recoveryState: ProductionSessionRecoveryState = .unpaired
    private struct CachedRead {
        let data: Data
        let storedAt: Date
    }
    private var readCache: [String: CachedRead] = [:]
    private var readCacheOrder: [String] = []
    private struct InFlightRead {
        let id: UUID
        let task: Task<Data, Error>
    }
    private var inFlightReads: [String: InFlightRead] = [:]
    private var readCacheGeneration = 0
    private let maximumCachedReads = 32
    private var acceptedEvidenceReviewProcessing: [String: AcceptedEvidenceReviewProcessing] = [:]
    private let snapshotStore: ProductionReadSnapshotStore?

    /// Resources whose last validated envelope survives process death so a
    /// cold launch can show last-known content while the authoritative read
    /// runs. Snapshots are never served as a read result — only through
    /// `lastKnownResource`, which callers must present as last-known.
    static let lastKnownSnapshotResources: Set<String> = ["home"]

    enum ReadPolicy: Sendable, Equatable {
        case cacheFirst
        case reload
    }

    init(
        configuration: NativeAPIEnvironment = .founderProduction,
        baseURL: URL? = nil,
        credentialStore: FounderRefreshCredentialStore? = nil,
        installationSigningKey: (any FounderInstallationSigningKey)? = nil,
        backgroundTaskScheduler: any BackgroundTaskScheduling = UIKitBackgroundTaskScheduler(),
        transport: FounderHTTPTransport = URLSessionFounderHTTPTransport(),
        // `nil` means "commands share the read transport" -- the exact
        // pre-existing behavior, unchanged for every caller that doesn't
        // explicitly opt into a separate one (including every existing
        // test). `AppEnvironment` opts the real app into
        // `CommandNetworkDiagnosticsTransport.production()`, an isolated
        // session, for exactly the reason documented on that type.
        commandTransport: FounderHTTPTransport? = nil,
        snapshotStore: ProductionReadSnapshotStore? = nil
    ) {
        precondition(configuration == .founderProduction, "ProductionNativeAPI requires Founder Production authority.")
        self.configuration = configuration
        self.baseURL = baseURL ?? configuration.baseURL
        let resolvedCredentialStore = credentialStore ?? KeychainFounderCredentialStore(namespace: configuration.credentialNamespace)
        self.credentialStore = resolvedCredentialStore
        self.envelopeStore = resolvedCredentialStore as? any FounderSessionEnvelopeStore
        self.installationSigningKey = installationSigningKey
        self.backgroundTaskScheduler = backgroundTaskScheduler
        self.transport = transport
        self.commandTransport = commandTransport ?? transport
        self.snapshotStore = snapshotStore
    }

    func hasStoredSession() throws -> Bool {
        if let envelope = try loadEnvelope() {
            recoveryState = envelope.pendingRotation == nil ? .authenticated : .recoveringSession
            return true
        }
        recoveryState = .unpaired
        return false
    }

    func sessionRecoveryState() -> ProductionSessionRecoveryState {
        recoveryState
    }

    @discardableResult
    func resolveStoredSession() async -> ProductionSessionRecoveryState {
        do {
            guard try hasStoredSession() else { return .unpaired }
            _ = try await validAccessToken()
            recoveryState = .authenticated
        } catch let error as ProductionNativeError {
            switch error {
            case .networkFailure, .temporaryServer:
                recoveryState = .temporarilyOfflineLastKnown
            case .reconnectRequired:
                recoveryState = .reconnectRequired
            default:
                if recoveryState != .reconnectRequired { recoveryState = .recoveringSession }
            }
        } catch {
            if recoveryState != .reconnectRequired { recoveryState = .recoveringSession }
        }
        return recoveryState
    }

    @discardableResult
    func pair(pairingCredential: String, displayName: String) async throws -> FounderServerSession {
        let refreshProof: PairRequest.RefreshProof?
        if let installationSigningKey {
            do {
                refreshProof = PairRequest.RefreshProof(
                    algorithm: "ES256",
                    publicKeySpki: try installationSigningKey.publicKeySPKIBase64URL()
                )
            } catch {
                recoveryState = .reconnectRequired
                throw ProductionNativeError.secureInstallationKeyUnavailable
            }
        } else {
            refreshProof = nil
        }
        let payload = PairRequest(
            pairingCredential: pairingCredential,
            platform: "ios",
            displayName: displayName,
            refreshProof: refreshProof
        )
        let session: FounderServerSession = try await sendJSON(
            path: "\(configuration.routeFamily)/auth/pair",
            method: "POST",
            body: payload,
            bearer: nil
        )
        try persistPairingSession(session)
        recoveryState = .authenticated
        retireAllLastKnownSnapshots()
        return session
    }

    func revokeCurrentSession() async throws {
        let response: RevocationResponse = try await authenticatedJSON(
            path: "\(configuration.routeFamily)/auth/session",
            method: "DELETE"
        )
        guard response.revoked else { throw ProductionNativeError.invalidResponse }
        accessToken = nil
        authenticatedDeviceId = nil
        recoveryState = .unpaired
        retireAllLastKnownSnapshots()
        try credentialStore.deleteRefreshCredential()
    }

    /// The opaque device identity assigned by Server pairing and carried by
    /// every authenticated principal. Access tokens are memory-only, so a
    /// relaunch necessarily refreshes first and repopulates this identity
    /// from the authoritative Server response.
    func authenticatedServerDeviceIdentity() async throws -> String {
        _ = try await validAccessToken()
        guard let authenticatedDeviceId, !authenticatedDeviceId.isEmpty else {
            throw ProductionNativeError.invalidResponse
        }
        return authenticatedDeviceId
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
        policy: ReadPolicy = .cacheFirst,
        as type: Payload.Type
    ) async throws -> ProductionResponseEnvelope<Payload> {
        guard resource.range(of: #"^[a-z][a-z0-9-]*$"#, options: .regularExpression) != nil else {
            throw ProductionNativeError.invalidResponse
        }
        let key = readCacheKey(resource: resource, query: query)
        let startedAt = ContinuousClock.now
        var cacheHit = false
        var generationForStore: Int?
        let data: Data
        if policy == .cacheFirst,
           let cached = readCache[key],
           Date().timeIntervalSince(cached.storedAt) <= cacheLifetime(for: resource) {
            data = cached.data
            cacheHit = true
        } else if let active = inFlightReads[key] {
            data = try await active.task.value
        } else {
            let generation = readCacheGeneration
            generationForStore = generation
            let task = Task { try await self.loadReadData(resource: resource, query: query) }
            let flightId = UUID()
            inFlightReads[key] = InFlightRead(id: flightId, task: task)
            do {
                data = try await task.value
                if inFlightReads[key]?.id == flightId { inFlightReads[key] = nil }
            } catch {
                if inFlightReads[key]?.id == flightId { inFlightReads[key] = nil }
                throw error
            }
        }
        let decodeStartedAt = ContinuousClock.now
        let envelope: ProductionResponseEnvelope<Payload>
        do { envelope = try decoder.decode(ProductionResponseEnvelope<Payload>.self, from: data) }
        catch {
            NativeReadFailureDiagnostics.recordDecode(resource: resource, error: error)
            throw ProductionNativeError.invalidResponse
        }
        let decodeMilliseconds = Self.elapsedMilliseconds(since: decodeStartedAt)
        try validate(envelope, expectedResource: resource)
        if let generationForStore, generationForStore == readCacheGeneration {
            storeRead(data, for: key)
            if Self.lastKnownSnapshotResources.contains(resource) { snapshotStore?.save(data, for: key) }
        }
#if DEBUG
        NativePerformanceDiagnostics.recordRead(
            resource: resource,
            milliseconds: Self.elapsedMilliseconds(since: startedAt),
            decodeMilliseconds: decodeMilliseconds,
            bytes: data.count,
            cacheHit: cacheHit
        )
#endif
        return envelope
    }

    /// The last validated envelope persisted for this exact resource+query,
    /// or nil. Never touches the network and never counts as a fresh read.
    func lastKnownResource<Payload: Decodable & Sendable>(
        _ resource: String,
        query: [String: String] = [:],
        as type: Payload.Type
    ) -> ProductionResponseEnvelope<Payload>? {
        guard Self.lastKnownSnapshotResources.contains(resource) else { return nil }
        let key = readCacheKey(resource: resource, query: query)
        guard let data = snapshotStore?.load(for: key) else { return nil }
        do {
            let envelope = try decoder.decode(ProductionResponseEnvelope<Payload>.self, from: data)
            try validate(envelope, expectedResource: resource)
            return envelope
        } catch {
            snapshotStore?.remove(for: key)
            return nil
        }
    }

    /// `retainingLastKnown` is only for an explicit user refresh (pull to
    /// refresh), which is not a write: a failed offline refresh must not
    /// discard the last-known Home. Every write-driven invalidation retires
    /// the persisted snapshot, so a later cold launch cannot show pre-write
    /// content (e.g. an already-completed priority).
    func invalidateReadResources(_ resources: Set<String>, retainingLastKnown: Bool = false) {
        if !retainingLastKnown {
            for resource in resources where Self.lastKnownSnapshotResources.contains(resource) {
                snapshotStore?.removeResource(resource)
            }
        }
        readCacheGeneration += 1
        // Detach affected pre-mutation GETs without cancelling their callers.
        // A post-mutation read must not join old data; the flight ID prevents
        // the old completion from erasing a newer request's coalescing slot.
        inFlightReads = inFlightReads.filter { key, _ in
            !resources.contains(where: { key == $0 || key.hasPrefix("\($0)?") })
        }
        readCache = readCache.filter { key, _ in
            !resources.contains(where: { key == $0 || key.hasPrefix("\($0)?") })
        }
        readCacheOrder.removeAll { key in
            resources.contains(where: { key == $0 || key.hasPrefix("\($0)?") })
        }
    }

    /// Pairing, revocation, and a rejected refresh credential end the
    /// session whose reads were persisted. Bumping the generation also stops
    /// any read still in flight from re-persisting after the snapshots go.
    private func retireAllLastKnownSnapshots() {
        readCacheGeneration += 1
        snapshotStore?.removeAll()
        sessionBoundaryObserver?()
    }

    /// Notified at the same credential boundary that retires the persisted
    /// last-known snapshots (pairing, revocation, a rejected refresh
    /// credential), so other on-device copies of this session's reads (the
    /// Home Screen widget's App Group snapshot) are retired with them.
    private var sessionBoundaryObserver: (@Sendable () -> Void)?

    func setSessionBoundaryObserver(_ observer: (@Sendable () -> Void)?) {
        sessionBoundaryObserver = observer
    }

    func acknowledgeAcceptedEvidenceReviewProcessing(_ value: AcceptedEvidenceReviewProcessing) {
        acceptedEvidenceReviewProcessing[value.id] = value
    }

    func acceptedEvidenceReviewProcessingAcknowledgments() -> [AcceptedEvidenceReviewProcessing] {
        acceptedEvidenceReviewProcessing.values.sorted { $0.id < $1.id }
    }

    func clearAcceptedEvidenceReviewProcessing(reviewId: String) {
        acceptedEvidenceReviewProcessing[reviewId] = nil
    }

    private func loadReadData(resource: String, query: [String: String]) async throws -> Data {
        let (data, _) = try await authenticatedResponse(
            path: "\(configuration.routeFamily)/read/\(resource)",
            method: "GET",
            query: query,
            accept: "application/json"
        )
        return data
    }

    private func readCacheKey(resource: String, query: [String: String]) -> String {
        guard !query.isEmpty else { return resource }
        return resource + "?" + query.keys.sorted().map { "\($0)=\(query[$0] ?? "")" }.joined(separator: "&")
    }

    private func cacheLifetime(for resource: String) -> TimeInterval {
        switch resource {
        case "home": 30
        case "briefing-history", "training-landing", "training-reporting", "training-library": 60
        default: 90
        }
    }

    private func storeRead(_ data: Data, for key: String) {
        readCache[key] = CachedRead(data: data, storedAt: Date())
        readCacheOrder.removeAll { $0 == key }
        readCacheOrder.append(key)
        while readCacheOrder.count > maximumCachedReads {
            readCache.removeValue(forKey: readCacheOrder.removeFirst())
        }
    }

    private static func elapsedMilliseconds(since instant: ContinuousClock.Instant) -> Int {
        let components = instant.duration(to: .now).components
        return max(0, Int(components.seconds * 1_000 + components.attoseconds / 1_000_000_000_000_000))
    }

    func readMedia(mediaId: String) async throws -> ProductionMediaPayload {
        guard !mediaId.isEmpty,
              mediaId.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil
        else { throw ProductionNativeError.invalidResponse }

        let mediaPath = "\(configuration.routeFamily)/media/\(mediaId)"
        let mediaAccept = "image/jpeg,image/png,image/heic,image/webp,application/pdf"
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await authenticatedResponse(path: mediaPath, method: "GET", accept: mediaAccept)
        } catch ProductionNativeError.notFound {
            // The media route reports an expired 10-minute access token as a plain
            // 404 rather than the 401 `ACCESS_TOKEN_EXPIRED` problem the JSON routes
            // return, so the generic refresh never runs and a Retry would resend the
            // same stale bearer forever. Refresh once (single-flight) and read once
            // more; a genuinely absent object still fails with `notFound`.
            _ = try await refreshAccessToken()
            (data, response) = try await authenticatedResponse(path: mediaPath, method: "GET", accept: mediaAccept)
        }
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
        clientExtractedText: String? = nil,
        targetTrainingDraftId: String? = nil,
        targetTrainingSessionCanonicalId: String? = nil,
        replacementForSubmissionIdentity: String? = nil,
        photoIdentitiesJSON: String? = nil,
        photoSessionTimeOfDay: String? = nil,
        photoSessionFasted: Bool? = nil,
        photoSessionPostWorkout: Bool? = nil,
        photoSessionPump: Bool? = nil,
        originalUnedited: Bool? = nil,
        files: [(filename: String, contentType: String, data: Data)],
        onUploadProgress: @escaping @Sendable (Double) -> Void = { _ in }
    ) async throws -> ProductionEvidenceIntakeStatus {
        let boundary = "PhysiqueOSNativeIntake\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        var body = Data()
        body.appendMultipartField(name: "submissionIdentity", value: Data(submissionIdentity.utf8), boundary: boundary, contentType: "text/plain")
        body.appendMultipartField(name: "effectiveDate", value: Data(effectiveDate.utf8), boundary: boundary, contentType: "text/plain")
        body.appendMultipartField(name: "expectedEvidenceType", value: Data(expectedEvidenceType.utf8), boundary: boundary, contentType: "text/plain")
        if let clientExtractedText, !clientExtractedText.isEmpty {
            body.appendMultipartField(
                name: "clientExtractedText", value: Data(clientExtractedText.utf8),
                boundary: boundary, contentType: "text/plain"
            )
        }
        if let targetTrainingDraftId, !targetTrainingDraftId.isEmpty {
            body.appendMultipartField(
                name: "targetTrainingDraftId", value: Data(targetTrainingDraftId.utf8),
                boundary: boundary, contentType: "text/plain"
            )
        }
        if let targetTrainingSessionCanonicalId, !targetTrainingSessionCanonicalId.isEmpty {
            body.appendMultipartField(
                name: "targetTrainingSessionCanonicalId",
                value: Data(targetTrainingSessionCanonicalId.utf8),
                boundary: boundary, contentType: "text/plain"
            )
        }
        if let replacementForSubmissionIdentity, !replacementForSubmissionIdentity.isEmpty {
            body.appendMultipartField(
                name: "replacementForSubmissionIdentity",
                value: Data(replacementForSubmissionIdentity.utf8),
                boundary: boundary,
                contentType: "text/plain"
            )
        }
        for (name, value) in [
            ("photoIdentitiesJson", photoIdentitiesJSON),
            ("photoSessionTimeOfDay", photoSessionTimeOfDay),
            ("photoSessionFasted", photoSessionFasted.map(String.init)),
            ("photoSessionPostWorkout", photoSessionPostWorkout.map(String.init)),
            ("photoSessionPump", photoSessionPump.map(String.init)),
            ("originalUnedited", originalUnedited.map(String.init)),
        ] where value != nil {
            body.appendMultipartField(
                name: name, value: Data(value!.utf8), boundary: boundary, contentType: "text/plain"
            )
        }
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

    /// `POST /api/v1/native/evidence/intakes/staged` — declares a staged
    /// Progress Photos intake (session details plus the expected artifact
    /// set) without any photo bytes. Replaying the same declaration returns
    /// the same intake with its current artifact progress; the Server
    /// requires `Idempotency-Key` to equal `submissionIdentity`.
    func declareStagedEvidenceIntake(
        _ declaration: StagedPhotoIntakeWireDeclaration,
        idempotencyKey: String
    ) async throws -> ProductionEvidenceIntakeStatus {
        let encoded: Data
        do { encoded = try encoder.encode(declaration) }
        catch { throw ProductionNativeError.invalidResponse }
        let headers = ["Idempotency-Key": idempotencyKey]
        let path = "\(configuration.routeFamily)/evidence/intakes/staged"
        let token = try await validAccessToken()
        var result = try await perform(path: path, method: "POST", body: encoded, bearer: token, accept: "application/json", headers: headers, timeoutInterval: 30)
        if result.1.statusCode == 401, isRefreshableAuthenticationProblem(data: result.0) {
            let refreshedToken = try await refreshAccessToken()
            result = try await perform(path: path, method: "POST", body: encoded, bearer: refreshedToken, accept: "application/json", headers: headers, timeoutInterval: 30)
        }
        try validateHTTP(result.1, data: result.0)
        do { return try decoder.decode(ProductionEvidenceIntakeStatus.self, from: result.0) }
        catch { throw ProductionNativeError.invalidResponse }
    }

    /// `PUT /api/v1/native/evidence/intakes/{intakeId}/artifacts/{artifactId}`
    /// — transfers exactly one declared artifact as a raw image body under
    /// its declared content type. The Server verifies length, SHA-256, and
    /// container against the declaration; an already stored artifact is
    /// acknowledged as `already_stored` without a second object.
    func uploadStagedEvidenceArtifact(
        intakeId: String,
        artifactId: String,
        contentType: String,
        data: Data,
        onUploadProgress: @escaping @Sendable (Double) -> Void = { _ in }
    ) async throws -> ProductionEvidenceIntakeStatus {
        guard intakeId.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil,
              artifactId.range(of: #"^artifact_[0-9a-f]{32}_[1-9][0-9]{0,2}$"#, options: .regularExpression) != nil
        else { throw ProductionNativeError.invalidResponse }
        let headers = ["Content-Type": contentType]
        let path = "\(configuration.routeFamily)/evidence/intakes/\(intakeId)/artifacts/\(artifactId)"
        let token = try await validAccessToken()
        var result = try await performUpload(path: path, method: "PUT", body: data, bearer: token, accept: "application/json", headers: headers, onProgress: onUploadProgress)
        if result.1.statusCode == 401, isRefreshableAuthenticationProblem(data: result.0) {
            let refreshedToken = try await refreshAccessToken()
            result = try await performUpload(path: path, method: "PUT", body: data, bearer: refreshedToken, accept: "application/json", headers: headers, onProgress: onUploadProgress)
        }
        try validateHTTP(result.1, data: result.0)
        do { return try decoder.decode(ProductionEvidenceIntakeStatus.self, from: result.0) }
        catch { throw ProductionNativeError.invalidResponse }
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
        guard let envelope = try loadEnvelope() else {
            recoveryState = .unpaired
            throw ProductionNativeError.notPaired
        }
        if envelope.authProtocol == FounderCredentialEnvelope.senderConstrainedProtocol {
            return try await rotateSenderConstrainedRefresh(envelope)
        }
        let refreshCredential = envelope.currentRefreshCredential
        do {
            let session: FounderServerSession = try await sendJSON(
                path: "\(configuration.routeFamily)/auth/refresh",
                method: "POST",
                body: RefreshRequest(refreshCredential: refreshCredential),
                bearer: nil
            )
            try persistPairingSession(session)
            recoveryState = .authenticated
            return session.accessToken
        } catch {
            if isTerminalRefreshError(error) {
                accessToken = nil
                authenticatedDeviceId = nil
                // A Server-side revocation must not leave this session's
                // last-known Home on the device.
                retireAllLastKnownSnapshots()
                try? credentialStore.deleteRefreshCredential()
                recoveryState = .reconnectRequired
                throw ProductionNativeError.reconnectRequired
            }
            throw error
        }
    }

    private func rotateSenderConstrainedRefresh(_ storedEnvelope: FounderCredentialEnvelope) async throws -> String {
        guard let envelopeStore, let installationSigningKey else {
            recoveryState = .reconnectRequired
            throw ProductionNativeError.secureInstallationKeyUnavailable
        }
        var envelope = storedEnvelope
        if envelope.pendingRotation == nil {
            envelope.pendingRotation = FounderCredentialEnvelope.PendingRotation(
                predecessorRefreshCredential: envelope.currentRefreshCredential,
                rotationIntentId: try SenderConstrainedRefresh.randomValue(),
                proposedSuccessorRefreshCredential: try SenderConstrainedRefresh.randomValue(),
                createdAt: Date()
            )
            // This atomic Keychain update is the correctness boundary. No
            // network call occurs until A/intent/B are durable together.
            try envelopeStore.saveSessionEnvelope(envelope)
        }
        guard let pending = envelope.pendingRotation else { throw ProductionNativeError.invalidResponse }
        recoveryState = .recoveringSession
        let commitment = SenderConstrainedRefresh.successorCommitment(
            pending.proposedSuccessorRefreshCredential
        )

        do {
            return try await withBackgroundExecutionAssertion(
                named: "Founder session rotation",
                scheduler: backgroundTaskScheduler
            ) {
                let challenge: RefreshProofChallenge = try await self.sendJSON(
                    path: "\(self.configuration.routeFamily)/auth/refresh-challenge",
                    method: "POST",
                    body: RefreshProofChallengeRequest(
                        refreshCredential: pending.predecessorRefreshCredential,
                        rotationIntentId: pending.rotationIntentId,
                        successorCommitment: commitment
                    ),
                    bearer: nil
                )
                guard challenge.proofVersion == 1 else { throw ProductionNativeError.invalidResponse }
                let proofId = try SenderConstrainedRefresh.randomValue()
                let message = SenderConstrainedRefresh.proofMessage(
                    refreshCredential: pending.predecessorRefreshCredential,
                    rotationIntentId: pending.rotationIntentId,
                    successorRefreshCredential: pending.proposedSuccessorRefreshCredential,
                    successorCommitment: commitment,
                    nonce: challenge.nonce,
                    proofId: proofId
                )
                let signature: String
                do { signature = try installationSigningKey.sign(message: message) }
                catch { throw ProductionNativeError.secureInstallationKeyUnavailable }
                let session: FounderServerSession = try await self.sendJSON(
                    path: "\(self.configuration.routeFamily)/auth/refresh",
                    method: "POST",
                    body: SenderConstrainedRefreshRequest(
                        refreshCredential: pending.predecessorRefreshCredential,
                        rotationIntentId: pending.rotationIntentId,
                        successorRefreshCredential: pending.proposedSuccessorRefreshCredential,
                        successorCommitment: commitment,
                        proof: .init(
                            challengeId: challenge.challengeId,
                            nonce: challenge.nonce,
                            proofId: proofId,
                            signature: signature
                        )
                    ),
                    bearer: nil
                )
                guard session.authProtocol == FounderCredentialEnvelope.senderConstrainedProtocol,
                      session.refreshCredential == pending.proposedSuccessorRefreshCredential
                else { throw ProductionNativeError.invalidResponse }

                let promoted = FounderCredentialEnvelope(
                    version: FounderCredentialEnvelope.currentVersion,
                    authProtocol: FounderCredentialEnvelope.senderConstrainedProtocol,
                    currentRefreshCredential: pending.proposedSuccessorRefreshCredential,
                    pendingRotation: nil
                )
                // Publish memory state only after atomic Keychain promotion.
                try envelopeStore.saveSessionEnvelope(promoted)
                self.accessToken = session.accessToken
                self.authenticatedDeviceId = session.deviceId
                self.recoveryState = .authenticated
                return session.accessToken
            }
        } catch {
            accessToken = nil
            authenticatedDeviceId = nil
            if isTerminalRefreshError(error) {
                retireAllLastKnownSnapshots()
                try? credentialStore.deleteRefreshCredential()
                recoveryState = .reconnectRequired
                throw ProductionNativeError.reconnectRequired
            }
            if isRetryableProofError(error) {
                recoveryState = .recoveringSession
                throw ProductionNativeError.sessionRecoveryUnavailable
            }
            if Task.isCancelled || error is CancellationError {
                recoveryState = .recoveringSession
                throw ProductionNativeError.sessionRecoveryUnavailable
            } else if case ProductionNativeError.networkFailure = error {
                recoveryState = .temporarilyOfflineLastKnown
            } else if case ProductionNativeError.temporaryServer = error {
                recoveryState = .temporarilyOfflineLastKnown
            } else {
                recoveryState = .recoveringSession
            }
            // A, intent, and B remain in the atomic envelope. A later retry
            // obtains a fresh nonce/proof and resolves the exact exchange.
            throw error
        }
    }

    private func persistPairingSession(_ session: FounderServerSession) throws {
        guard !session.deviceId.isEmpty else { throw ProductionNativeError.invalidResponse }
        if session.authProtocol == FounderCredentialEnvelope.senderConstrainedProtocol {
            guard let envelopeStore, installationSigningKey != nil else {
                throw ProductionNativeError.secureInstallationKeyUnavailable
            }
            try envelopeStore.saveSessionEnvelope(FounderCredentialEnvelope(
                version: FounderCredentialEnvelope.currentVersion,
                authProtocol: FounderCredentialEnvelope.senderConstrainedProtocol,
                currentRefreshCredential: session.refreshCredential,
                pendingRotation: nil
            ))
        } else {
            try credentialStore.saveRefreshCredential(session.refreshCredential)
        }
        accessToken = session.accessToken
        authenticatedDeviceId = session.deviceId
    }

    private func loadEnvelope() throws -> FounderCredentialEnvelope? {
        if let envelopeStore { return try envelopeStore.loadSessionEnvelope() }
        return try credentialStore.loadRefreshCredential().map(FounderCredentialEnvelope.legacy)
    }

    private func isTerminalRefreshError(_ error: Error) -> Bool {
        guard case ProductionNativeError.unauthenticated(let problem) = error,
              let code = problem?.code else { return error as? ProductionNativeError == .reconnectRequired }
        return [
            "REFRESH_CREDENTIAL_REVOKED",
            "REFRESH_CREDENTIAL_INVALID",
            "REFRESH_CREDENTIAL_EXPIRED",
            "REFRESH_REUSE_DETECTED",
            "SESSION_REAUTHENTICATION_REQUIRED",
            "REFRESH_PROOF_UNAVAILABLE",
            "CREDENTIAL_MALFORMED",
        ].contains(code)
    }

    private func isRetryableProofError(_ error: Error) -> Bool {
        guard case ProductionNativeError.unauthenticated(let problem) = error else { return false }
        return problem?.code == "DEVICE_PROOF_INVALID"
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
        if !(200..<300).contains(result.1.statusCode), path.contains("/read/") {
            NativeReadFailureDiagnostics.recordHTTP(resource: String(path.split(separator: "/").last ?? "read"), status: result.1.statusCode)
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
        headers: [String: String] = [:],
        timeoutInterval: TimeInterval = 15,
        // `nil` uses `transport` (every read call site). `submitCommand`
        // passes `commandTransport` explicitly.
        overrideTransport: FounderHTTPTransport? = nil
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
        request.timeoutInterval = timeoutInterval
        request.setValue(accept, forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        for (field, value) in headers { request.setValue(value, forHTTPHeaderField: field) }
        do { return try await (overrideTransport ?? transport).data(for: request) }
        catch {
            // Diagnostic-only: captures the identity `.networkFailure` below
            // discards (genuine connection failure vs. cooperative task
            // cancellation vs. timeout vs. an ATS/certificate problem) purely
            // for later reading. Changes nothing about what is thrown or when.
            NetworkFailureDiagnostics.record(path: path, error: error)
            throw ProductionNativeError.networkFailure
        }
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
        timeoutInterval: TimeInterval = 15,
        payload: Payload
    ) async throws -> ProductionCommandOutcome<Result> {
        // Build 83 diagnostics: one sanitized event per command call (type,
        // key fingerprint, duration, outcome) so a stall is attributable to
        // the exact command without storing its key or payload.
        let started = Date()
        do {
            let outcome: ProductionCommandOutcome<Result> = try await performSubmitCommand(
                commandType, idempotencyKey: idempotencyKey, expectedVersion: expectedVersion,
                timeoutInterval: timeoutInterval, payload: payload
            )
            CommandNetworkDiagnostics.recordCommand(
                commandType: commandType, idempotencyKey: idempotencyKey, succeeded: true,
                durationMs: Date().timeIntervalSince(started) * 1_000
            )
            return outcome
        } catch {
            CommandNetworkDiagnostics.recordCommand(
                commandType: commandType, idempotencyKey: idempotencyKey, succeeded: false,
                durationMs: Date().timeIntervalSince(started) * 1_000, error: error
            )
            throw error
        }
    }

    private func performSubmitCommand<Payload: Encodable, Result: Decodable>(
        _ commandType: String,
        idempotencyKey: String,
        expectedVersion: String?,
        timeoutInterval: TimeInterval,
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
            headers: headers,
            timeoutInterval: timeoutInterval,
            overrideTransport: commandTransport
        )
        if result.1.statusCode == 401, isRefreshableAuthenticationProblem(data: result.0) {
            let refreshedToken = try await refreshAccessToken()
            // The retried send after a token refresh is the write's only
            // remaining chance: `submitCommand` has no caller-level retry of
            // its own, so if this exact attempt hits a second, independent
            // transport failure (a plain dropped connection, unrelated to
            // the token that was just fixed), the write is silently lost
            // from the Founder's perspective -- no server-side command
            // receipt exists to show for it, and no further attempt follows
            // automatically. One bounded extra attempt, with the SAME
            // idempotency key and body, is safe to repeat here: the server's
            // own command-receipt replay is keyed on exactly that identity,
            // so a genuine duplicate delivery returns the original outcome
            // rather than creating a second mutation (see the idempotency
            // contract documented on this function above).
            do {
                result = try await perform(
                    path: "\(configuration.routeFamily)/commands",
                    method: "POST",
                    body: encoded,
                    bearer: refreshedToken,
                    accept: "application/json",
                    headers: headers,
                    timeoutInterval: timeoutInterval,
                    overrideTransport: commandTransport
                )
            } catch ProductionNativeError.networkFailure {
                result = try await perform(
                    path: "\(configuration.routeFamily)/commands",
                    method: "POST",
                    body: encoded,
                    bearer: refreshedToken,
                    accept: "application/json",
                    headers: headers,
                    timeoutInterval: timeoutInterval,
                    overrideTransport: commandTransport
                )
            }
        }
        try validateHTTP(result.1, data: result.0)
        do {
            let outcome = try decoder.decode(ProductionCommandOutcome<Result>.self, from: result.0)
            invalidateReadResources(resourcesAffected(by: commandType))
            return outcome
        }
        catch { throw ProductionNativeError.invalidResponse }
    }

    // Internal (not private) so the mapping from a command type to the
    // cache keys it invalidates is directly unit-testable — a mismatch
    // here (e.g. invalidating "log" when Log is actually cached under
    // "evidence-review-queue") silently leaves a stale read cached with
    // no error anywhere, exactly the Build 32/33 workout-visibility defect
    // this was found fixing.
    func resourcesAffected(by commandType: String) -> Set<String> {
        if commandType == ProductionCommandType.submitWeight {
            return ["home", "weight"]
        }
        if commandType == ProductionCommandType.submitCheckIn {
            return ["home", "weight", "morning-check-in", "priority"]
        }
        if commandType.hasPrefix("operating-plan.") {
            // A peptide pause/resume or schedule change moves occurrences:
            // Home, every Priority detail and Morning Check-In's previous-
            // day selection (design S3 enforcement site 5) all re-project.
            return [
                "home", "priority", "morning-check-in", "operating-plan", "operating-plan-recurring-support",
                "operating-plan-nutrition-strategy", "operating-plan-training-strategy",
                "operating-plan-peptide-support", "operating-plan-protocol-domain",
                "operating-plan-supplement-support", "operating-plan-supplement-strategy-editor",
                "operating-plan-energy-strategy", "operating-plan-coaching-updates",
                "training-logger", "training-landing", "training-reporting", "dexa", "photos",
                "briefing-history", "briefing",
            ]
        }
        if commandType.contains("priority") { return ["home", "priority"] }
        if commandType.contains("training") || commandType.contains("workout") {
            return [
                "home", "training-landing", "training-reporting", "training-library",
                "training-logger", "training-day", "training-session", "evidence-review", "evidence-review-queue",
            ]
        }
        if commandType.contains("evidence") || commandType.contains("review") {
            // Confirmed Training evidence can add history-backed My Library
            // membership or reconcile telemetry onto an existing session.
            return [
                "home", "evidence-review", "evidence-review-queue", "reporting", "weight", "nutrition", "activity", "energy", "dexa", "photos", "timeline",
                "training-landing", "training-reporting", "training-library", "training-logger", "training-day", "training-session",
            ]
        }
        return ["home"]
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
    struct RefreshProof: Encodable {
        let algorithm: String
        let publicKeySpki: String
    }

    let pairingCredential: String
    let platform: String
    let displayName: String
    let refreshProof: RefreshProof?

    init(
        pairingCredential: String,
        platform: String,
        displayName: String,
        refreshProof: RefreshProof? = nil
    ) {
        self.pairingCredential = pairingCredential
        self.platform = platform
        self.displayName = displayName
        self.refreshProof = refreshProof
    }
}

private struct RefreshRequest: Encodable {
    let refreshCredential: String
}

private struct RefreshProofChallengeRequest: Encodable {
    let refreshCredential: String
    let rotationIntentId: String
    let successorCommitment: String
}

private struct RefreshProofChallenge: Decodable {
    let proofVersion: Int
    let challengeId: String
    let nonce: String
    let expiresAt: String
}

private struct SenderConstrainedRefreshRequest: Encodable {
    struct Proof: Encodable {
        let challengeId: String
        let nonce: String
        let proofId: String
        let signature: String
    }

    let refreshCredential: String
    let rotationIntentId: String
    let successorRefreshCredential: String
    let successorCommitment: String
    let proof: Proof
}

enum SenderConstrainedRefresh {
    static func randomValue() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw ProductionNativeError.secureInstallationKeyUnavailable
        }
        return Data(bytes).base64URLEncodedString()
    }

    static func successorCommitment(_ successor: String) -> String {
        var data = Data("physiqueos-refresh-successor-v1\0".utf8)
        data.append(Data(successor.utf8))
        return Data(SHA256.hash(data: data)).base64URLEncodedString()
    }

    static func proofMessage(
        refreshCredential: String,
        rotationIntentId: String,
        successorRefreshCredential: String,
        successorCommitment: String,
        nonce: String,
        proofId: String
    ) -> Data {
        let body = [
            "physiqueos-refresh-request-v1",
            refreshCredential,
            rotationIntentId,
            successorRefreshCredential,
            successorCommitment,
        ].joined(separator: "\n")
        let bodyDigest = Data(SHA256.hash(data: Data(body.utf8))).base64URLEncodedString()
        return Data([
            "physiqueos-device-proof-v1",
            "POST",
            "/api/v1/native/auth/refresh",
            bodyDigest,
            nonce,
            proofId,
        ].joined(separator: "\n").utf8)
    }
}

private struct RevocationResponse: Decodable {
    let revoked: Bool
}

/// Disk persistence for `ProductionNativeAPI.lastKnownSnapshotResources`.
/// One file per cache key, written atomically with complete file protection
/// and excluded from backup. Reads fail closed (locked device, missing or
/// corrupt file) to nil, which callers treat as "no last-known content".
struct ProductionReadSnapshotStore: Sendable {
    let directory: URL

    static func applicationSupport(namespace: String) -> ProductionReadSnapshotStore? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        return ProductionReadSnapshotStore(
            directory: base.appendingPathComponent("PhysiqueOS/LastKnownReads/\(namespace)", isDirectory: true)
        )
    }

    func save(_ data: Data, for key: String) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var excluded = URLResourceValues()
            excluded.isExcludedFromBackup = true
            var mutableDirectory = directory
            try? mutableDirectory.setResourceValues(excluded)
            try data.write(to: fileURL(for: key), options: [.atomic, .completeFileProtection])
        } catch {
            remove(for: key)
        }
    }

    func load(for key: String) -> Data? {
        try? Data(contentsOf: fileURL(for: key))
    }

    func remove(for key: String) {
        try? FileManager.default.removeItem(at: fileURL(for: key))
    }

    /// Removes every key of a resource (`home`, `home?…`).
    func removeResource(_ resource: String) {
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return }
        let prefix = Self.fileName(for: resource)
        let queryPrefix = Self.fileName(for: "\(resource)?")
        for file in files where file.lastPathComponent == prefix || file.lastPathComponent.hasPrefix(queryPrefix) {
            try? FileManager.default.removeItem(at: file)
        }
    }

    func removeAll() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func fileURL(for key: String) -> URL {
        directory.appendingPathComponent(Self.fileName(for: key), isDirectory: false)
    }

    /// Keys are `resource[?k=v&…]`; percent-encoding keeps them one path
    /// component while preserving prefix order for `removeResource`.
    static func fileName(for key: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.")
        return key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
    }
}
