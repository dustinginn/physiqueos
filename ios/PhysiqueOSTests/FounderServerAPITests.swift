import Foundation
import XCTest
@testable import PhysiqueOS

final class FounderServerAPITests: XCTestCase {
    func testNativeEnvironmentConfigurationPinsProductionAndPreservesSandbox() {
        XCTAssertEqual(NativeAPIEnvironment.founderProduction.baseURL.absoluteString, "https://physiqueos.dustinginn.com")
        XCTAssertEqual(NativeAPIEnvironment.founderProduction.routeFamily, "/api/v1/native")
        XCTAssertEqual(NativeAPIEnvironment.founderProduction.expectedAuthority, "founder-production")
        XCTAssertFalse(NativeAPIEnvironment.founderProduction.permitsProductWrites)

        XCTAssertEqual(NativeAPIEnvironment.sandbox.baseURL, FounderServerAPI.sandboxOrigin)
        XCTAssertEqual(NativeAPIEnvironment.sandbox.routeFamily, "/api/v1/native/sandbox")
        XCTAssertTrue(NativeAPIEnvironment.sandbox.permitsProductWrites)
    }

    func testAuthoritySelectionPersistsOnlyTheExplicitEnvironment() {
        let suite = "PhysiqueOS.NativeAuthoritySelection.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        XCTAssertNil(store.load())
        store.save(.founderProduction)
        XCTAssertEqual(store.load(), .founderProduction)
        store.save(.sandbox)
        XCTAssertEqual(store.load(), .sandbox)
    }

    func testKeychainItemsAreAuthorityNamespacedWithoutWeakeningProtectionConfiguration() {
        let sandbox = KeychainFounderCredentialStore(namespace: .sandbox)
        let production = KeychainFounderCredentialStore(namespace: .founderProduction)

        XCTAssertEqual(sandbox.serviceIdentifier, "com.physiqueos.native.dev.founder-auth")
        XCTAssertEqual(production.serviceIdentifier, "com.physiqueos.native.founder-production-auth")
        XCTAssertNotEqual(sandbox.serviceIdentifier, production.serviceIdentifier)
        XCTAssertEqual(sandbox.accountIdentifier, production.accountIdentifier)
    }

    func testSandboxAndProductionCredentialsCannotOverwriteOrRevokeEachOther() throws {
        let vault = NamespacedMemoryCredentialVault()
        let sandbox = vault.store(namespace: .sandbox)
        let production = vault.store(namespace: .founderProduction)

        try sandbox.saveRefreshCredential("sandbox-refresh")
        try production.saveRefreshCredential("production-refresh")
        XCTAssertEqual(try sandbox.loadRefreshCredential(), "sandbox-refresh")
        XCTAssertEqual(try production.loadRefreshCredential(), "production-refresh")

        try production.deleteRefreshCredential()
        XCTAssertEqual(try sandbox.loadRefreshCredential(), "sandbox-refresh")
        XCTAssertNil(try production.loadRefreshCredential())
    }

    func testProductionPairingUsesAcceptedEndpointAndStoresOnlyProductionRefreshCredential() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r"))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "r", count: 43))
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, ["/api/v1/native/auth/pair"])
        XCTAssertEqual(requests.first?.httpMethod, "POST")
        XCTAssertNil(requests.first?.value(forHTTPHeaderField: "Authorization"))
        let body = try XCTUnwrap(requests.first?.httpBody)
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(fields["platform"], "ios")
        XCTAssertEqual(fields["displayName"], "Founder iPhone")
    }

    func testProductionProfileDecodesAndValidatesFounderAuthority() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionProfileJSON),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let profile = try await api.readProfile()

        XCTAssertEqual(profile.resource, "profile")
        XCTAssertEqual(profile.authority, "founder-production")
        XCTAssertEqual(profile.data.profile.identity?.displayName, "Founder")
        XCTAssertFalse(profile.data.authority.sandbox)
    }

    func testProductionContractsDecodeAdvertisedReadsWithoutEnablingWrites() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionContractsJSON),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let manifest = try await api.readContracts()

        XCTAssertEqual(manifest.contractVersion, "1")
        XCTAssertEqual(manifest.reads.map(\.resource), ["weight"])
        XCTAssertEqual(manifest.writes.map(\.commandType), ["weight.submit.v1"])
        XCTAssertFalse(NativeAPIEnvironment.founderProduction.permitsProductWrites)
    }

    func testPackage7WeightUsesGenericEnvelopeAndCanonicalRouteOnly() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionWeightJSON(value: 167.2, id: "weight-canonical")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let envelope = try await api.readWeight()

        XCTAssertEqual(envelope.contractVersion, "1")
        XCTAssertEqual(envelope.resource, "weight")
        XCTAssertEqual(envelope.data.currentWeight?.id, "weight-canonical")
        let paths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(paths.last, "/api/v1/native/read/weight")
        XCTAssertFalse(paths.contains("/api/v1/native/weight/summary"))
    }

    func testProductionWeightAdapterMapsOnlyServerSelectedCanonicalDTO() {
        let current = FounderWeightSummary.CurrentWeight(
            id: "server-selected-revision",
            value: 167.2,
            unit: "lb",
            measurementDate: "2026-09-10"
        )

        let report = ProductionWeightReportAdapter.report(from: current, scope: WeightScopeDefault.selection)

        XCTAssertEqual(report.chart.points.map(\.id), ["server-selected-revision"])
        XCTAssertEqual(report.history.map(\.id), ["server-selected-revision"])
        XCTAssertEqual(report.history.first?.value, "167.2 lb")
    }

    func testEnvelopeFailsClosedOnAuthorityAndResourceMismatch() async throws {
        for (resource, authority, expected) in [
            ("weight", "founder-sandbox", "authority"),
            ("nutrition", "founder-production", "resource"),
        ] {
            let response = productionWeightJSON(value: 167.2, resource: resource, authority: authority)
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .json(200, response),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
            await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
                if expected == "authority" {
                    guard case ProductionNativeError.authorityMismatch = error else { return XCTFail("Expected authority mismatch") }
                } else {
                    guard case ProductionNativeError.resourceMismatch = error else { return XCTFail("Expected resource mismatch") }
                }
            }
        }
    }

    func testEnvelopeFailsClosedOnIncompatibleContractVersion() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionWeightJSON(value: 167.2, contractVersion: "2")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
            XCTAssertEqual(
                error as? ProductionNativeError,
                .incompatibleContractVersion(expected: "1", actual: "2")
            )
        }
    }

    func testProblemJSONPreservesFieldErrorsAndRecoveryWithoutStringMatching() async throws {
        let problem = #"{"problemVersion":"1","type":"https://physiqueos.app/problems/contract-validation-failed","title":"Invalid request","status":400,"code":"CONTRACT_VALIDATION_FAILED","detail":"One field is invalid.","instance":"/api/v1/native/read/weight","requestId":"request-1","fieldErrors":[{"field":"context","code":"invalid","detail":"Unsupported context."}],"recovery":{"action":"refresh"}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(400, problem),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
            guard case ProductionNativeError.validation(let details) = error else { return XCTFail("Expected validation error") }
            XCTAssertEqual(details.code, "CONTRACT_VALIDATION_FAILED")
            XCTAssertEqual(details.fieldErrors.first?.field, "context")
            XCTAssertEqual(details.recovery, .object(["action": .string("refresh")]))
        }
    }

    func testProblemStatusMappingCoversAuthenticationNotFoundPreconditionConflictAndTemporaryFailure() async throws {
        let cases: [(Int, String)] = [(401, "AUTHENTICATION_REQUIRED"), (404, "RESOURCE_NOT_FOUND"), (412, "STALE_VERSION"), (409, "CONFLICT"), (503, "INTERNAL_ERROR")]
        for (status, code) in cases {
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .json(status, productionProblemJSON(status: status, code: code)),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
            await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
                switch (status, error) {
                case (401, ProductionNativeError.unauthenticated),
                     (404, ProductionNativeError.notFound),
                     (412, ProductionNativeError.failedPrecondition),
                     (409, ProductionNativeError.conflict),
                     (503, ProductionNativeError.temporaryServer): break
                default: XCTFail("Unexpected status mapping: \(status), \(error)")
                }
            }
        }
    }

    func testProductionAccessRefreshRotatesCredentialAndRetriesReadOnce() async throws {
        let store = MemoryCredentialStore(refreshCredential: String(repeating: "r", count: 43))
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, productionWeightJSON(value: 167.2)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        _ = try await api.readWeight()

        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "s", count: 43))
        let paths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(paths, ["/api/v1/native/auth/refresh", "/api/v1/native/read/weight"])
    }

    func testProductionSessionRevocationDeletesOnlyInjectedProductionCredential() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"revoked":true}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        try await api.revokeCurrentSession()

        XCTAssertNil(try store.loadRefreshCredential())
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/native/auth/session")
        XCTAssertEqual(requests.last?.httpMethod, "DELETE")
    }

    func testFounderProductionWriteGuardDeniesEveryKnownDomainAndSandboxRemainsIsolated() throws {
        for domain in NativeProductWriteDomain.allCases {
            XCTAssertThrowsError(try NativeProductWriteGuard.authorize(domain, in: .founderProduction)) { error in
                XCTAssertEqual(error as? NativeWriteGuardError, .productionReadOnly(domain))
            }
            XCTAssertNoThrow(try NativeProductWriteGuard.authorize(domain, in: .sandbox))
        }
    }

    func testProductionMediaAcceptsAuthenticatedImageAndPDF() async throws {
        let fixtures = [
            ("image/jpeg", Data([0xFF, 0xD8, 0xFF, 0xD9])),
            ("image/png", Data([0x89, 0x50, 0x4E, 0x47])),
            ("image/heic", Data("ftypheic".utf8)),
            ("image/webp", Data([0x52, 0x49, 0x46, 0x46])),
            ("application/pdf", Data("%PDF-1.7".utf8)),
        ]
        for (contentType, bytes) in fixtures {
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .data(200, mimeType: contentType, bytes),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

            let media = try await api.readMedia(mediaId: "media_opaque_1")

            XCTAssertEqual(media.contentType, contentType)
            XCTAssertEqual(media.data, bytes)
            let request = await transport.requests.last
            XCTAssertEqual(request?.url?.path, "/api/v1/native/media/media_opaque_1")
            XCTAssertTrue(request?.value(forHTTPHeaderField: "Accept")?.contains("application/pdf") == true)
        }
    }

    func testProductionMediaRefreshesExpiredBearerAndRetriesOnce() async throws {
        let expired = productionProblemJSON(status: 401, code: "ACCESS_TOKEN_EXPIRED")
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(401, expired),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .data(200, mimeType: "application/pdf", Data("%PDF-1.7".utf8)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        _ = try await api.readMedia(mediaId: "media_opaque_1")

        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/auth/pair",
            "/api/v1/native/media/media_opaque_1",
            "/api/v1/native/auth/refresh",
            "/api/v1/native/media/media_opaque_1",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testProductionMediaRejectsUnsupportedContentType() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(200, mimeType: "text/html", Data("no".utf8)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readMedia(mediaId: "media_opaque_1")) { error in
            XCTAssertEqual(error as? ProductionNativeError, .unsupportedMediaType("text/html"))
        }
    }

    @MainActor
    func testWeightProviderRefetchReplacesPriorProductionResult() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionWeightJSON(value: 168.0, id: "weight-old")),
            .json(200, productionWeightJSON(value: 167.2, id: "weight-new")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let viewModel = WeightHistoryViewModel(api: ProductionWeightEvidenceAPI(api: api))

        await viewModel.load()
        await viewModel.load()

        guard case .loaded(let report) = viewModel.state else { return XCTFail("Expected loaded Weight") }
        XCTAssertEqual(report.history.first?.id, "weight-new")
        XCTAssertEqual(report.history.first?.value, "167.2 lb")
        let requestCount = await transport.requests.count
        XCTAssertEqual(requestCount, 3)
    }

    func testProductionFailuresNeverExposeCredentialMaterialInDescriptions() async throws {
        let access = String(repeating: "a", count: 43)
        let refresh = String(repeating: "r", count: 43)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, "not-json"),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
            let description = String(describing: error) + ((error as? LocalizedError)?.errorDescription ?? "")
            XCTAssertFalse(description.contains(access))
            XCTAssertFalse(description.contains(refresh))
        }
    }

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

    func testPhotoManifestUsesTheAuthenticatedSandboxRouteAndStableViewIdentity() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        let manifest = try await api.readPhotoAcceptanceManifest()

        XCTAssertEqual(manifest.schemaVersion, "native-founder-photo-media-v1")
        XCTAssertEqual(manifest.sessions.first?.photos.first?.viewIdentity, "session-1-front-relaxed")
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/native/sandbox/photo-acceptance/manifest")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testPhotoManifestRefreshesExpiredAccessBeforeRetrying() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(401, code: "ACCESS_TOKEN_EXPIRED"),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        _ = try await api.readPhotoAcceptanceManifest()

        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/sandbox/auth/pair",
            "/api/v1/native/sandbox/photo-acceptance/manifest",
            "/api/v1/native/sandbox/auth/refresh",
            "/api/v1/native/sandbox/photo-acceptance/manifest",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testPhotoMediaRejectsPathInjectionBeforeMakingARequest() async throws {
        let transport = SequencedFounderTransport([])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)

        await XCTAssertThrowsErrorAsync(try await api.readPhotoAcceptanceMedia(mediaId: "../founder-object")) { error in
            XCTAssertEqual(error as? FounderServerError, .invalidResponse)
        }
        let requests = await transport.requests
        XCTAssertTrue(requests.isEmpty)
    }

    func testPhotoMediaUsesBearerAndReturnsOnlyImageBytes() async throws {
        let bytes = Data([0xFF, 0xD8, 0xFF, 0xD9])
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(200, mimeType: "image/jpeg", bytes),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        let result = try await api.readPhotoAcceptanceMedia(mediaId: "media_1")

        XCTAssertEqual(result, bytes)
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/native/sandbox/photo-acceptance/media/media_1")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
        XCTAssertTrue(requests.last?.value(forHTTPHeaderField: "Accept")?.contains("image/jpeg") == true)
    }

    @MainActor
    func testPhotoManifestCanRecoverAfterPairingWithoutRestartingTheApp() async throws {
        let credentialStore = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        let mediaStore = FounderPhotoMediaStore(api: api)

        await mediaStore.loadManifestIfNeeded()
        XCTAssertEqual(mediaStore.manifestState, .unavailable)

        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        await mediaStore.loadManifestIfNeeded()

        XCTAssertEqual(mediaStore.manifestState, .ready)
        XCTAssertEqual(mediaStore.sessions.map(\.photoSessionId), ["session-1"])
    }

    @MainActor
    func testPhotoStoreMapsManifestSessionsByExactDateAndPoseWithoutWrongFallback() async throws {
        let credentialStore = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let mediaStore = FounderPhotoMediaStore(api: api)

        await mediaStore.loadManifestIfNeeded()

        XCTAssertEqual(mediaStore.sessions.map(\.captureDate), ["2026-07-18"])
        XCTAssertNotNil(mediaStore.resolvedItem(setId: "fixture", captureDate: "2026-07-18", poseId: .frontRelaxed))
        XCTAssertNil(mediaStore.resolvedItem(setId: "fixture", captureDate: "2026-07-18", poseId: .backFlexed))
        XCTAssertEqual(mediaStore.projectedSetsByID["session-1"]?.views.first?.id, "session-1-front-relaxed")
    }

    @MainActor
    func testPhotoBriefingComparisonUsesDistinctAuthorizedHistoricalSessionWhenFixtureDatesDiffer() async throws {
        let credentialStore = MemoryCredentialStore()
        let manifest = #"{"schemaVersion":"native-founder-photo-media-v1","authority":{"kind":"sandbox-founder-photo-acceptance","sandboxAuthorityId":"sandbox-1"},"sessions":[{"photoSessionId":"session-old","captureDate":"2026-08-08","photos":[{"viewIdentity":"session-old-front-relaxed","photoSessionId":"session-old","photoId":"photo-old","mediaId":"media_old","poseId":"front-relaxed","captureDate":"2026-08-08","contentType":"image/jpeg","pixelWidth":1200,"pixelHeight":1600,"delivery":{"kind":"authenticated_proxy","path":"/api/v1/native/sandbox/photo-acceptance/media/media_old"}}]},{"photoSessionId":"session-new","captureDate":"2026-08-22","photos":[{"viewIdentity":"session-new-front-relaxed","photoSessionId":"session-new","photoId":"photo-new","mediaId":"media_new","poseId":"front-relaxed","captureDate":"2026-08-22","contentType":"image/jpeg","pixelWidth":1200,"pixelHeight":1600,"delivery":{"kind":"authenticated_proxy","path":"/api/v1/native/sandbox/photo-acceptance/media/media_new"}}]}]}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manifest),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let mediaStore = FounderPhotoMediaStore(api: api)
        await mediaStore.loadManifestIfNeeded()

        let pair = mediaStore.resolvedComparisonItems(
            priorSetId: "photo-set-fixture-004",
            priorDate: "2026-08-16",
            currentSetId: "photo-set-fixture-005",
            currentDate: "2026-08-30",
            poseId: .frontRelaxed
        )

        XCTAssertEqual(pair.current?.photoSessionId, "session-new")
        XCTAssertEqual(pair.prior?.photoSessionId, "session-old")
        XCTAssertNotEqual(pair.prior?.viewIdentity, pair.current?.viewIdentity)
    }

    @MainActor
    func testPhotoStoreFailsClosedOnMismatchedServerViewIdentity() async throws {
        let credentialStore = MemoryCredentialStore()
        let invalidManifest = photoManifestJSON.replacingOccurrences(of: "session-1-front-relaxed", with: "wrong-view")
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, invalidManifest),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let mediaStore = FounderPhotoMediaStore(api: api)

        await mediaStore.loadManifestIfNeeded()

        XCTAssertEqual(mediaStore.manifestState, .unavailable)
        XCTAssertTrue(mediaStore.itemsByViewIdentity.isEmpty)
    }
}

private let testOrigin = URL(string: "https://example.invalid")!
private let weightJSON = #"{"schemaVersion":"1","currentWeight":{"id":"weight-1","value":168.4,"unit":"lb","measurementDate":"2026-08-31"}}"#
private let manualWeightResultJSON = #"{"schemaVersion":"1","id":"weight-manual-1","status":"confirmed","measurementDate":"2026-08-31","value":168.4,"unit":"lb"}"#
private let photoManifestJSON = #"{"schemaVersion":"native-founder-photo-media-v1","authority":{"kind":"sandbox-founder-photo-acceptance","sandboxAuthorityId":"sandbox-1"},"sessions":[{"photoSessionId":"session-1","captureDate":"2026-07-18","photos":[{"viewIdentity":"session-1-front-relaxed","photoSessionId":"session-1","photoId":"photo-1","mediaId":"media_1","poseId":"front-relaxed","captureDate":"2026-07-18","contentType":"image/jpeg","pixelWidth":1200,"pixelHeight":1600,"delivery":{"kind":"authenticated_proxy","path":"/api/v1/native/sandbox/photo-acceptance/media/media_1"}}]}]}"#
private let productionProfileJSON = #"{"contractVersion":"1","resource":"profile","authority":"founder-production","generatedAt":"2026-09-10T15:00:00.000Z","data":{"profile":{"user":{"id":"user-founder","displayName":"Founder","firstName":"Dustin","lastName":null,"timezone":"America/Los_Angeles"},"operatingStatus":{"goals":1},"evidenceSources":[]},"authority":{"type":"founder-production","sandbox":false},"capabilities":{"read":true,"write":true,"media":true}}}"#
private let productionContractsJSON = #"{"contractVersion":"1","apiVersion":"v1","authority":"founder-production","authentication":"founder-device-bearer","bootstrap":{"issuerEndpoint":"/api/v1/native/auth/pairing-credentials","issuerAuthentication":"founder-web-session","pairEndpoint":"/api/v1/native/auth/pair","credentialLifetimeSeconds":600,"credentialUse":"single-use","authority":"founder-production"},"sandboxAuthority":"physically-isolated-separate-contract","errorFormat":"application/problem+json; problemVersion=1","dateSemantics":"intended local dates are YYYY-MM-DD","media":{"endpoint":"/api/v1/native/media/{mediaId}","identity":"opaque canonical media ID","authorization":"bearer, owner-scoped","cache":"private, no-store"},"reads":[{"resource":"weight","endpoint":"/api/v1/native/read/weight","service":"weightSummary.getCurrentWeight","auth":"founder-device-bearer","authority":"founder-production","goalPhase":"server-resolved","media":"opaque references only","pagination":"bounded"}],"writes":[{"commandType":"weight.submit.v1","endpoint":"/api/v1/native/commands","auth":"founder-device-bearer","authority":"founder-production","idempotency":"Idempotency-Key","revision":"If-Match"}]}"#

private func productionWeightJSON(
    value: Double,
    id: String = "weight-current",
    resource: String = "weight",
    authority: String = "founder-production",
    contractVersion: String = "1"
) -> String {
    """
    {"contractVersion":"\(contractVersion)","resource":"\(resource)","authority":"\(authority)","generatedAt":"2026-09-10T15:00:00.000Z","data":{"schemaVersion":"1","currentWeight":{"id":"\(id)","value":\(value),"unit":"lb","measurementDate":"2026-09-10"}}}
    """
}

private func productionProblemJSON(status: Int, code: String) -> String {
    """
    {"problemVersion":"1","type":"https://physiqueos.app/problems/test","title":"Request failed","status":\(status),"code":"\(code)","detail":null,"instance":"/api/v1/native/read/weight","requestId":"request-1","fieldErrors":[],"recovery":null}
    """
}

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

private final class NamespacedMemoryCredentialVault: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [FounderCredentialNamespace: String] = [:]

    func store(namespace: FounderCredentialNamespace) -> FounderRefreshCredentialStore {
        Store(vault: self, namespace: namespace)
    }

    private func load(_ namespace: FounderCredentialNamespace) -> String? {
        lock.withLock { values[namespace] }
    }

    private func save(_ credential: String, namespace: FounderCredentialNamespace) {
        lock.withLock { values[namespace] = credential }
    }

    private func delete(_ namespace: FounderCredentialNamespace) {
        _ = lock.withLock { values.removeValue(forKey: namespace) }
    }

    private final class Store: FounderRefreshCredentialStore, @unchecked Sendable {
        let vault: NamespacedMemoryCredentialVault
        let namespace: FounderCredentialNamespace

        init(vault: NamespacedMemoryCredentialVault, namespace: FounderCredentialNamespace) {
            self.vault = vault
            self.namespace = namespace
        }

        func loadRefreshCredential() throws -> String? { vault.load(namespace) }
        func saveRefreshCredential(_ credential: String) throws { vault.save(credential, namespace: namespace) }
        func deleteRefreshCredential() throws { vault.delete(namespace) }
    }
}

private actor SequencedFounderTransport: FounderHTTPTransport {
    enum Outcome: @unchecked Sendable {
        case json(Int, String)
        case data(Int, mimeType: String, Data)
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
        case .data(let status, let mimeType, let data):
            return (data, response(status: status, request: request, mimeType: mimeType))
        case .problem(let status, let code):
            let json = """
            {"status":\(status),"code":"\(code)","title":"Request failed","detail":null}
            """
            return (Data(json.utf8), response(status: status, request: request))
        case .failure(let error):
            throw error
        }
    }

    private func response(status: Int, request: URLRequest, mimeType: String = "application/json") -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mimeType])!
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
