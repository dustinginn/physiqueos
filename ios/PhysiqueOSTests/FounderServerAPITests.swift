import Foundation
import XCTest
@testable import PhysiqueOS

final class FounderServerAPITests: XCTestCase {
    func testPairStoresOnlyRotatingRefreshAndUsesAccessTokenForTypedWeightRead() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        let session = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let result = try await api.readCurrentWeight()

        XCTAssertEqual(session.accessToken, String(repeating: "a", count: 43))
        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "r", count: 43))
        XCTAssertEqual(result.summary.currentWeight?.measurementDate, "2026-08-31")
        XCTAssertEqual(result.summary.currentWeight?.value, 168.4)
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testStoredRefreshCredentialRotatesBeforeFirstReadAfterRelaunch() async throws {
        let store = MemoryCredentialStore(refreshCredential: String(repeating: "r", count: 43))
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        let result = try await api.readCurrentWeight()

        XCTAssertEqual(result.summary.currentWeight?.unit, "lb")
        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "s", count: 43))
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, ["/api/v1/native/sandbox/auth/refresh", "/api/v1/native/sandbox/weight/summary"])
        let refreshBody = try XCTUnwrap(requests[0].httpBody)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: refreshBody) as? [String: String], ["refreshCredential": String(repeating: "r", count: 43)])
    }

    func testExpiredAccessRefreshesOnceAndRetriesTheNarrowRead() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(401, code: "ACCESS_TOKEN_EXPIRED"),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        let result = try await api.readCurrentWeight()

        XCTAssertEqual(result.summary.currentWeight?.id, "weight-1")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/sandbox/auth/pair", "/api/v1/native/sandbox/weight/summary",
            "/api/v1/native/sandbox/auth/refresh", "/api/v1/native/sandbox/weight/summary",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testNoStoredRefreshIsASeparateUnauthenticatedState() async {
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: SequencedFounderTransport([]))
        await XCTAssertThrowsErrorAsync(try await api.readCurrentWeight()) { error in
            XCTAssertEqual(error as? FounderServerError, .notPaired)
        }
    }

    func testRefreshReuseOrRevocationClearsTheStoredSession() async throws {
        for code in ["REFRESH_REUSE_DETECTED", "REFRESH_CREDENTIAL_REVOKED"] {
            let store = MemoryCredentialStore(refreshCredential: String(repeating: "r", count: 43))
            let transport = SequencedFounderTransport([.problem(401, code: code)])
            let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
            await XCTAssertThrowsErrorAsync(try await api.readCurrentWeight()) { error in
                XCTAssertEqual(error as? FounderServerError, .deviceOrSessionRevoked)
            }
            XCTAssertNil(try store.loadRefreshCredential())
        }
    }

    func testTypedFailureSeparatesScopeNetworkAndServerAvailability() async throws {
        let cases: [(SequencedFounderTransport.Outcome, FounderServerError)] = [
            (.problem(403, code: "AUTHORIZATION_DENIED"), .unauthorizedScope),
            (.failure(URLError(.notConnectedToInternet)), .networkFailure),
            (.problem(503, code: "INTERNAL_ERROR"), .serverUnavailable),
        ]
        for (outcome, expected) in cases {
            let store = MemoryCredentialStore()
            let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), outcome])
            let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
            await XCTAssertThrowsErrorAsync(try await api.readCurrentWeight()) { error in
                XCTAssertEqual(error as? FounderServerError, expected)
            }
        }
    }

    func testSessionRevocationClearsKeychainMaterialOnlyAfterServerConfirmation() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"revoked":true}"#),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        try await api.revokeCurrentSession()

        XCTAssertNil(try store.loadRefreshCredential())
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.httpMethod, "DELETE")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testCalendarDateDTOIsDecodedWithoutTimezoneConversion() async throws {
        let oldTimeZone = TimeZone.ReferenceType.default
        TimeZone.ReferenceType.default = TimeZone(identifier: "America/Los_Angeles")!
        defer { TimeZone.ReferenceType.default = oldTimeZone }
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let result = try await api.readCurrentWeight()
        XCTAssertEqual(result.summary.currentWeight?.measurementDate, "2026-08-31")
    }

    func testWeightFastPathSendsOriginalBytesAndLocalCandidateToSandboxOnly() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"id":"review-1","status":"pending","version":1,"occurrenceDate":"2026-08-31","candidate":{"value":168.4,"unit":"lb","confidence":0.97,"disposition":"deterministic_review_ready"}}"#),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let candidate = NativeSandboxWeightCandidate(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-acceptance-1",
            candidateType: "weight",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb",
            confidence: 0.97,
            localParserVersion: "ios-vision-weight-v1",
            assetSha256: String(repeating: "a", count: 64),
            founderContext: nil,
            fieldProvenance: .init(value: .init(source: "native_local_extraction", regions: [.init(page: 1, text: "168.4 lb")]))
        )
        let asset = Data("actual screenshot bytes".utf8)

        let review = try await api.submitWeightCandidate(candidate, asset: asset, filename: "weight.png", contentType: "image/png")

        XCTAssertEqual(review.candidate.value, 168.4)
        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.url?.path, "/api/v1/native/sandbox/weight/candidates")
        XCTAssertTrue(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        let body = try XCTUnwrap(request.httpBody)
        XCTAssertNotNil(body.range(of: asset))
        XCTAssertNotNil(body.range(of: Data("\"measurementDate\":\"2026-08-31\"".utf8)))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testManualWeightRequestEncodesOnlyScalarFieldsWithNoMediaOrOCR() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        _ = try await api.submitManualWeight(request)

        let requests = await transport.requests
        let lastRequest = try XCTUnwrap(requests.last)
        XCTAssertEqual(lastRequest.url?.path, "/api/v1/native/sandbox/weight/manual")
        XCTAssertEqual(lastRequest.httpMethod, "POST")
        let body = try XCTUnwrap(lastRequest.httpBody)
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(Set(fields.keys), ["submissionIdentity", "idempotencyKey", "measurementDate", "value", "unit"])
    }

    func testManualWeightSendsBearerAndDecodesConfirmedResponse() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        let result = try await api.submitManualWeight(request)

        XCTAssertEqual(result.status, "confirmed")
        XCTAssertEqual(result.value, 168.4)
        XCTAssertEqual(result.measurementDate, "2026-08-31")
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testManualWeightRefreshesExpiredAccessTokenOnceAndRetries() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(401, code: "ACCESS_TOKEN_EXPIRED"),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        let result = try await api.submitManualWeight(request)

        XCTAssertEqual(result.id, "weight-manual-1")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/sandbox/auth/pair", "/api/v1/native/sandbox/weight/manual",
            "/api/v1/native/sandbox/auth/refresh", "/api/v1/native/sandbox/weight/manual",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testManualWeightMeasurementDateRoundTripsWithoutTimezoneShift() async throws {
        let oldTimeZone = TimeZone.ReferenceType.default
        TimeZone.ReferenceType.default = TimeZone(identifier: "America/Los_Angeles")!
        defer { TimeZone.ReferenceType.default = oldTimeZone }
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        let result = try await api.submitManualWeight(request)

        XCTAssertEqual(result.measurementDate, "2026-08-31")
        let requests = await transport.requests
        let body = try XCTUnwrap(requests.last?.httpBody)
        XCTAssertNotNil(body.range(of: Data(#""measurementDate":"2026-08-31""#.utf8)))
    }

    func testManualWeightServerFailureDoesNotSynthesizeSuccess() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(503, code: "INTERNAL_ERROR"),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        await XCTAssertThrowsErrorAsync(try await api.submitManualWeight(request)) { error in
            XCTAssertEqual(error as? FounderServerError, .serverUnavailable)
        }
    }

    func testSandboxHostStaysPinnedAcrossPairManualWriteAndSummaryRefresh() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )
        _ = try await api.submitManualWeight(request)
        _ = try await api.readCurrentWeight()

        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertTrue(requests.allSatisfy { $0.url?.host == testOrigin.host && $0.url?.scheme == testOrigin.scheme })
    }

    func testManualSubmissionIdentityStaysStableForASameSignatureRetry() {
        let previous = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-1", idempotencyKey: "key-1")
        let fresh = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-2", idempotencyKey: "key-2")
        let signature = NativeSandboxWeightManualSubmission.signature(value: 168.4, unit: "lb", measurementDate: "2026-08-31")

        let resolved = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: signature,
            previousSignature: signature,
            previousIdentity: previous,
            freshIdentity: fresh
        )

        XCTAssertEqual(resolved, previous)
    }

    func testManualSubmissionIdentityIsFreshForADeliberateCorrection() {
        let previous = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-1", idempotencyKey: "key-1")
        let fresh = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-2", idempotencyKey: "key-2")
        let previousSignature = NativeSandboxWeightManualSubmission.signature(value: 168.4, unit: "lb", measurementDate: "2026-08-31")
        let correctedSignature = NativeSandboxWeightManualSubmission.signature(value: 169.0, unit: "lb", measurementDate: "2026-08-31")

        let resolved = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: correctedSignature,
            previousSignature: previousSignature,
            previousIdentity: previous,
            freshIdentity: fresh
        )

        XCTAssertEqual(resolved, fresh)
    }

    func testManualSubmissionIdentityIsFreshForTheFirstAttempt() {
        let fresh = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-2", idempotencyKey: "key-2")
        let signature = NativeSandboxWeightManualSubmission.signature(value: 168.4, unit: "lb", measurementDate: "2026-08-31")

        let resolved = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: signature,
            previousSignature: nil,
            previousIdentity: nil,
            freshIdentity: fresh
        )

        XCTAssertEqual(resolved, fresh)
    }
}

private let testOrigin = URL(string: "https://example.invalid")!
private let weightJSON = #"{"schemaVersion":"1","currentWeight":{"id":"weight-1","value":168.4,"unit":"lb","measurementDate":"2026-08-31"}}"#
private let manualWeightResultJSON = #"{"schemaVersion":"1","id":"weight-manual-1","status":"confirmed","measurementDate":"2026-08-31","value":168.4,"unit":"lb"}"#

private func sessionJSON(access: Character, refresh: Character) -> String {
    let accessToken = String(repeating: String(access), count: 43)
    let refreshCredential = String(repeating: String(refresh), count: 43)
    return """
    {"sessionId":"session-1","accessToken":"\(accessToken)","accessExpiresAt":"2026-09-01T12:10:00.000Z","refreshCredential":"\(refreshCredential)","refreshIdleExpiresAt":"2026-10-01T12:00:00.000Z","refreshAbsoluteExpiresAt":"2026-11-30T12:00:00.000Z"}
    """
}

private final class MemoryCredentialStore: FounderRefreshCredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var refreshCredential: String?

    init(refreshCredential: String? = nil) {
        self.refreshCredential = refreshCredential
    }

    func loadRefreshCredential() throws -> String? {
        lock.withLock { refreshCredential }
    }

    func saveRefreshCredential(_ credential: String) throws {
        lock.withLock { refreshCredential = credential }
    }

    func deleteRefreshCredential() throws {
        lock.withLock { refreshCredential = nil }
    }
}

private actor SequencedFounderTransport: FounderHTTPTransport {
    enum Outcome: @unchecked Sendable {
        case json(Int, String)
        case problem(Int, code: String)
        case failure(Error)
    }

    private(set) var requests: [URLRequest] = []
    private var outcomes: [Outcome]

    init(_ outcomes: [Outcome]) {
        self.outcomes = outcomes
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        guard !outcomes.isEmpty else { throw URLError(.badServerResponse) }
        let outcome = outcomes.removeFirst()
        switch outcome {
        case .json(let status, let json):
            return (Data(json.utf8), response(status: status, request: request))
        case .problem(let status, let code):
            let json = """
            {"status":\(status),"code":"\(code)","title":"Request failed","detail":null}
            """
            return (Data(json.utf8), response(status: status, request: request))
        case .failure(let error):
            throw error
        }
    }

    private func response(status: Int, request: URLRequest) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
    }
}

private func XCTAssertThrowsErrorAsync<T>(
    _ expression: @autoclosure () async throws -> T,
    _ errorHandler: (Error) -> Void,
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        _ = try await expression()
        XCTFail("Expected an error.", file: file, line: line)
    } catch {
        errorHandler(error)
    }
}
