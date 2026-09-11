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

    func testAuthoritySwitchSelectsOnlyMatchingDailyDriverProviders() {
        let suite = "PhysiqueOS.DailyDriverProviderSelection.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let selection = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: selection)

        XCTAssertTrue(environment.homeAPI is FixtureHomeAPI)
        XCTAssertTrue(environment.goalsAPI is FixtureGoalsAPI)
        XCTAssertTrue(environment.trainingAPI is FixtureTrainingAPI)
        XCTAssertNil(environment.operatingPlanAPI)

        environment.selectNativeAuthority(.founderProduction)

        XCTAssertTrue(environment.homeAPI is ProductionHomeAPI)
        XCTAssertTrue(environment.goalsAPI is ProductionGoalsAPI)
        XCTAssertTrue(environment.trainingAPI is ProductionTrainingAPI)
        XCTAssertTrue(environment.nutritionAPI is ProductionNutritionAPI)
        XCTAssertTrue(environment.activityAPI is ProductionActivityAPI)
        XCTAssertTrue(environment.energyAPI is ProductionEnergyAPI)
        XCTAssertTrue(environment.priorityAPI is ProductionPriorityAPI)
        XCTAssertTrue(environment.trainingLoggerAPI is ProductionTrainingLoggerAPI)
        XCTAssertNotNil(environment.operatingPlanAPI)
        XCTAssertEqual(selection.load(), .founderProduction)
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

    @MainActor
    func testProductionHomeUsesServerProjectionWithoutSandboxOverwriteAndRefetches() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionHomeJSON(priorityID: "priority-server-old", goalID: "goal-server", confidence: 71)),
            .json(200, productionHomeJSON(priorityID: "priority-server-new", goalID: "goal-server", confidence: 74)),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let viewModel = HomeViewModel(
            api: ProductionHomeAPI(api: native),
            priorityStore: LoggingSandboxStore(),
            goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: BriefingSandboxStore(),
            appliesSandboxProjections: false
        )

        await viewModel.load()
        guard case .loaded(let first) = viewModel.state else { return XCTFail("Expected production Home") }
        XCTAssertEqual(first.hero.confidence, 71)
        XCTAssertEqual(first.hero.mode, .active)
        XCTAssertEqual(first.hero.daysRemaining, "4 weeks remaining")
        XCTAssertEqual(first.goals.first?.id, "goal-server")
        XCTAssertEqual(first.goals.first?.current, "148.3")
        XCTAssertEqual(first.goals.first?.target, "10")
        XCTAssertEqual(first.goals.first?.presentation, .primary(progress: 8))
        XCTAssertEqual(first.todaysFocus.map(\.id), ["priority-server-old"])
        XCTAssertFalse(first.todaysFocus[0].completable)
        XCTAssertNil(first.todaysFocus[0].completionContext)

        await viewModel.load()
        guard case .loaded(let refreshed) = viewModel.state else { return XCTFail("Expected refreshed production Home") }
        XCTAssertEqual(refreshed.hero.confidence, 74)
        XCTAssertEqual(refreshed.todaysFocus.map(\.id), ["priority-server-new"])
        let homePaths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(Array(homePaths.suffix(2)), [
            "/api/v1/native/read/home", "/api/v1/native/read/home",
        ])
    }

    func testProductionGoalsHandlesEmptyActiveStateAndPreservesCanonicalGoalPhaseIDs() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionEnvelope(resource: "goals", data: #"{"activeGoals":[],"completedGoals":[],"transitionEntry":null,"relationshipContext":{}}"#)),
            .json(200, productionGoalsJSON),
            .json(200, productionGoalsJSON),
            .json(200, productionActiveGoalJSON),
            .json(200, productionGoalsJSON),
            .json(200, productionActiveGoalJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionGoalsAPI(api: native)

        let empty = try await api.fetchGoalsHub()
        XCTAssertNil(empty.activeGoal)
        XCTAssertTrue(empty.completedGoals.isEmpty)

        let hub = try await api.fetchGoalsHub()
        let active = try XCTUnwrap(hub.activeGoal)
        let fetchedDetail = try await api.fetchGoalDetail(goalId: active.id)
        let detail = try XCTUnwrap(fetchedDetail?.active)
        XCTAssertEqual(active.id, "goal-canonical")
        XCTAssertEqual(active.currentPhaseName, "Foundation")
        XCTAssertEqual(detail.id, active.id)
        XCTAssertEqual(detail.activePhaseId, "phase-canonical")
        XCTAssertEqual(detail.activePhase?.id, "phase-canonical")

        // `turningPoints[]` never carries an `id` on the wire — confirms a
        // stable id is still derived rather than the decode failing.
        let turningPoint = try XCTUnwrap(detail.turningPoints.first)
        XCTAssertEqual(turningPoint.id, "2026-07-19-Goal journey activated")
        XCTAssertEqual(turningPoint.title, "Goal journey activated")

        // `journey[]` carries the full chronology — a completed phase
        // must survive into `phases`, not just the currently active one,
        // and canonical numbering (not `journeyNumber - 1`) must be used.
        XCTAssertEqual(detail.orderedPhases.count, 2)
        let completedPhase = detail.orderedPhases[0]
        let activePhaseEntry = detail.orderedPhases[1]
        XCTAssertEqual(completedPhase.name, "Establish Maintenance")
        XCTAssertEqual(completedPhase.status, .completed)
        XCTAssertEqual(completedPhase.order, 1)
        XCTAssertEqual(completedPhase.progress.percentage, 100)
        XCTAssertEqual(activePhaseEntry.name, "Foundation")
        XCTAssertEqual(activePhaseEntry.status, .active)
        XCTAssertEqual(activePhaseEntry.order, 2)
        XCTAssertEqual(activePhaseEntry.id, "phase-canonical")

        // Historical (completed) phase detail must remain reachable, not
        // only the active phase — this is what makes Phase 1's own card
        // navigable in "Your Journey" instead of a dead end.
        let historical = try await api.fetchGoalPhase(goalId: "goal-canonical", phaseId: completedPhase.id)
        XCTAssertEqual(historical?.phase.name, "Establish Maintenance")
        XCTAssertEqual(historical?.phase.status, .completed)
    }

    /// Proves the chronology mapping is entirely data-driven — a
    /// three-phase journey with names/numbers that share nothing with any
    /// other fixture in this file must still come out in the right order,
    /// with the right names and statuses. If a future change reintroduced
    /// a hardcoded "Establish Maintenance"/"Lean Mass Build" or a
    /// two-phase assumption, this would catch it.
    func testProductionGoalChronologyIsFullyDataDrivenNotHardcodedToAnyPhaseNames() async throws {
        let threePhaseJourneyJSON = productionEnvelope(resource: "active-goal", data: #"{"goalId":"goal-canonical","phaseId":"phase-gamma","confidence":{"score":55,"band":"Moderate","summary":"Server confidence"},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Alpha Stage","number":1,"status":"Completed","dates":"Started Jan 1 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Beta Stage","number":2,"status":"Completed","dates":"Started Mar 1 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Gamma Stage","number":3,"status":"Active","dates":"Started Jun 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":40}],"currentPhase":{"id":"phase-gamma","goalId":"goal-canonical","title":"Gamma Stage","purpose":"Continue the plan","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain range","scope":"Every phase","body":"Server monitored","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[],"strategy":[]}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionGoalsJSON),
            .json(200, threePhaseJourneyJSON),
            .json(200, productionGoalsJSON),
            .json(200, threePhaseJourneyJSON),
            .json(200, productionGoalsJSON),
            .json(200, threePhaseJourneyJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionGoalsAPI(api: native)

        let fetchedDetail = try await api.fetchGoalDetail(goalId: "goal-canonical")
        let detail = try XCTUnwrap(fetchedDetail?.active)
        XCTAssertEqual(detail.orderedPhases.map(\.name), ["Alpha Stage", "Beta Stage", "Gamma Stage"])
        XCTAssertEqual(detail.orderedPhases.map(\.order), [1, 2, 3])
        XCTAssertEqual(detail.orderedPhases.map(\.status), [.completed, .completed, .active])
        XCTAssertEqual(detail.activePhase?.name, "Gamma Stage")
        XCTAssertEqual(detail.activePhaseId, "phase-gamma")

        // Every completed phase, not only the most recent one, must stay
        // independently reachable.
        let alpha = try await api.fetchGoalPhase(goalId: "goal-canonical", phaseId: detail.orderedPhases[0].id)
        let beta = try await api.fetchGoalPhase(goalId: "goal-canonical", phaseId: detail.orderedPhases[1].id)
        XCTAssertEqual(alpha?.phase.name, "Alpha Stage")
        XCTAssertEqual(beta?.phase.name, "Beta Stage")
    }

    func testProductionCompletedGoalUsesCanonicalReadWithoutWiringPrivatePhotosOrBriefings() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCompletedGoalsHubJSON),
            .json(200, productionCompletedGoalJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let detail = try await ProductionGoalsAPI(api: native).fetchGoalDetail(goalId: "goal-visible-abs")
        let completed = try XCTUnwrap(detail?.completed)
        XCTAssertEqual(completed.id, "goal-visible-abs")
        XCTAssertEqual(completed.achievement, "7.7% Body Fat")
        XCTAssertEqual(completed.highlights.map(\.title), ["The finish line aligned"])
        XCTAssertTrue(completed.photos.isEmpty)
        XCTAssertNil(completed.finalComposition.briefingDestination)
        XCTAssertEqual(completed.unlocked?.destination, .goalDetail(goalId: "goal-canonical"))
        let paths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(Array(paths.suffix(2)), ["/api/v1/native/read/goals", "/api/v1/native/read/completed-goal"])
    }

    func testProductionOperatingPlanAndPriorityUseCanonicalReadsAndRemainReadOnly() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionOperatingPlanJSON),
            .json(200, productionPriorityJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let plan = try await ProductionOperatingPlanAPI(api: native).fetchOperatingPlan()
        XCTAssertEqual(plan.sections.first?.title, "Energy Strategy")
        XCTAssertNil(plan.sections.first?.items.first?.destination)
        XCTAssertFalse(plan.sections.first?.supplementsAction == true)

        let fetchedPriority = try await ProductionPriorityAPI(api: native).fetchPriority(priorityId: "priority-canonical")
        let priority = try XCTUnwrap(fetchedPriority)
        XCTAssertEqual(priority.id, "priority-canonical")
        XCTAssertEqual(priority.executionItemId, "execution-canonical")
        XCTAssertEqual(priority.date, "2026-09-10")
        XCTAssertFalse(priority.completable)
        XCTAssertNil(priority.completionContext)
        let requests = await transport.requests
        XCTAssertEqual(requests[1].url?.path, "/api/v1/native/read/operating-plan")
        XCTAssertEqual(requests[2].url?.path, "/api/v1/native/read/priority")
        XCTAssertEqual(URLComponents(url: requests[2].url!, resolvingAgainstBaseURL: false)?.queryItems,
                       [URLQueryItem(name: "priorityId", value: "priority-canonical")])
        XCTAssertThrowsError(try NativeProductWriteGuard.authorize(.priorityCompletion, in: .founderProduction))
        XCTAssertThrowsError(try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction))
    }

    /// `LogFixture.json`'s exact bundled values ("Strength Training · 52
    /// min", "3 meals · 2,140 calories", "Nothing logged yet", the August
    /// 28 "Check-in ready to review" pending item) were showing under
    /// Founder Production even before the Founder had logged anything
    /// today — `AppEnvironment.logAPI` was a stored constant that never
    /// switched with authority. This proves the corrected
    /// `ProductionLogAPI` reflects real canonical current-day state
    /// instead, and specifically that none of the fixture's values leak
    /// through.
    func testProductionLogReflectsCanonicalTodayNotFixtureTrainingNutritionOrActivity() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionLogJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertEqual(log.localDate, "2026-09-10")
        XCTAssertEqual(log.loggedToday.map(\.kind), [.training, .nutrition, .activity])

        let training = log.loggedToday[0]
        XCTAssertNotEqual(training.summary, "Strength Training · 52 min")
        XCTAssertEqual(training.summary, "Traditional Strength Training · 45 min")
        XCTAssertEqual(training.destination, .trainingSession(sessionId: "session-canonical"))

        let nutrition = log.loggedToday[1]
        XCTAssertNotEqual(nutrition.summary, "3 meals · 2,140 calories")
        XCTAssertEqual(nutrition.summary, "4 meals · 2300 calories")
        XCTAssertEqual(nutrition.destination, .nutritionDay(dayId: "nutrition-day-canonical"))

        let activity = log.loggedToday[2]
        XCTAssertNotEqual(activity.summary, "Nothing logged yet")
        XCTAssertEqual(activity.summary, "650 active calories")
        XCTAssertEqual(activity.destination, .activityDay(date: "2026-09-10"))

        // The pending review must be the real canonical one, never the
        // fixture's `review-fixture-001` / "Friday, August 28" entry.
        let review = try XCTUnwrap(log.pendingEvidenceReviews.first)
        XCTAssertNotEqual(review.id, "review-fixture-001")
        XCTAssertEqual(review.id, "review-canonical")
        XCTAssertEqual(review.date, "Thursday, September 10")
        XCTAssertEqual(review.destination, .evidenceReview(reviewId: "review-canonical"))
    }

    /// When nothing is genuinely logged yet and no review is genuinely
    /// pending, Founder Production must show that honestly (the server's
    /// own "Nothing logged yet" / an empty review queue) rather than
    /// falling back to fixture content to fill the screen.
    func testProductionLogWithNothingLoggedYetShowsHonestEmptyStateNotFixtureFallback() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionEnvelope(resource: "evidence-review-queue", data: #"{"localDate":"2026-09-10","loggedToday":{"rows":[{"id":"training","summary":"Nothing logged yet","context":null,"recordId":null},{"id":"nutrition","summary":"Nothing logged yet","context":null,"recordId":null},{"id":"activity","summary":"Nothing logged yet","context":null,"recordId":null}]},"pendingEvidenceReviews":[]}"#)),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertTrue(log.loggedToday.allSatisfy { $0.summary == "Nothing logged yet" && $0.destination == nil })
        XCTAssertTrue(log.pendingEvidenceReviews.isEmpty)
        XCTAssertFalse(log.hasPendingEvidenceReviews)
    }

    /// The architectural defect was that `logAPI` could never have
    /// switched with authority no matter what either implementation
    /// returned — this confirms the property itself is now authority-
    /// aware, and that Sandbox keeps using the exact fixture instance it
    /// was constructed with (no regression to Sandbox's own Log behavior).
    @MainActor
    func testAppEnvironmentLogAPISwitchesWithAuthorityAndSandboxKeepsTheInjectedFixture() {
        final class ProbeLogAPI: LogAPI {
            func fetchLog() async throws -> LogReadModel {
                LogReadModel(localDate: "2026-01-01", loggedToday: [], pendingEvidenceReviews: [])
            }
        }
        let suite = "PhysiqueOS.LogAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        let probe = ProbeLogAPI()
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store, logAPI: probe)
        XCTAssertTrue((environment.logAPI as? ProbeLogAPI) === probe)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.logAPI is ProductionLogAPI)
        XCTAssertNil(environment.logAPI as? ProbeLogAPI)

        environment.selectNativeAuthority(.sandbox)
        XCTAssertTrue((environment.logAPI as? ProbeLogAPI) === probe)
    }

    func testProductionTrainingLibraryAndLoggerShareCanonicalUniverseAndUnknownIdentityFailsClosed() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionTrainingLibraryJSON(exerciseID: "canonical-incline-press", muscleGroup: "Chest")),
            .json(200, productionTrainingLoggerJSON(exerciseID: "canonical-incline-press", muscleGroup: "Chest")),
            .json(200, productionTrainingLibraryJSON(exerciseID: "canonical-unknown", muscleGroup: "Unmapped Muscle")),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetchedLibrary = try await ProductionTrainingAPI(api: native).fetchTrainingArea(areaId: "chest", scope: .all)
        let library = try XCTUnwrap(fetchedLibrary)
        let logger = try await ProductionTrainingLoggerAPI(api: native).fetchConfiguration()
        XCTAssertEqual(library.exercises.map(\.canonicalExerciseId), ["canonical-incline-press"])
        XCTAssertEqual(logger.exercises.map(\.canonicalExerciseId), ["canonical-incline-press"])
        XCTAssertEqual(library.exercises.map(\.canonicalExerciseId), logger.exercises.map(\.canonicalExerciseId))

        // The leaner `initialHistorySessions` projection (no `set_number`,
        // no presentation fields) must still decode into real set history.
        let history = try XCTUnwrap(logger.exercises.first?.history.first)
        XCTAssertEqual(history.sessionId, "session-canonical")
        XCTAssertEqual(history.workoutDate, "2026-09-09")
        XCTAssertEqual(history.sets.map(\.reps), [10, 8])
        XCTAssertEqual(history.sets.map(\.weight), [135, 145])
        XCTAssertEqual(history.sets.map(\.setNumber), [1, 2])

        await XCTAssertThrowsErrorAsync(try await ProductionTrainingAPI(api: native).fetchTrainingArea(areaId: "chest", scope: .all)) { error in
            XCTAssertEqual(error as? ProductionDailyDriverError,
                           .unknownCanonicalExerciseArea(exerciseID: "canonical-unknown", muscleGroupID: "Unmapped Muscle"))
        }
        XCTAssertThrowsError(try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction))
    }

    func testProductionTrainingExerciseUsesCanonicalCatalogAndServerPerformanceRecords() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionTrainingLibraryJSON(exerciseID: "canonical-incline-press", muscleGroup: "Chest")),
            .json(200, productionTrainingExerciseJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionTrainingAPI(api: native).fetchTrainingExercise(
            exerciseId: "canonical-incline-press",
            scope: .all
        )
        let exercise = try XCTUnwrap(fetched)
        XCTAssertEqual(exercise.id, "canonical-incline-press")
        XCTAssertEqual(exercise.title, "Incline Press")
        XCTAssertNil(exercise.benchmark)
        XCTAssertNil(exercise.lastSession)
        XCTAssertTrue(exercise.history.isEmpty)
        XCTAssertEqual(exercise.performanceRecords?.canonicalExerciseId, "canonical-incline-press")
        XCTAssertEqual(exercise.performanceRecords?.records.first?.sourceEventId, "event-canonical")

        let requests = await transport.requests
        XCTAssertEqual(Array(requests.suffix(2)).map { $0.url?.path }, [
            "/api/v1/native/read/training-library",
            "/api/v1/native/read/training-exercise",
        ])
        XCTAssertEqual(
            URLComponents(url: requests.last!.url!, resolvingAgainstBaseURL: false)?.queryItems,
            [
                URLQueryItem(name: "context", value: "all"),
                URLQueryItem(name: "exerciseId", value: "canonical-incline-press"),
            ]
        )
    }

    func testProductionGoalContextRejectsUnknownCanonicalIdentityInsteadOfAliasing() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(
            try await ProductionEnergyAPI(api: native).fetchEnergyReport(
                scope: EvidenceScopeSelection.goal(goalId: "goal-unrecognized")
            )
        ) { error in
            XCTAssertEqual(error as? ProductionDailyDriverError, .unsupportedGoalContext(id: "goal-unrecognized"))
        }
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 1, "An unknown Goal must fail before any resource read is sent.")
    }

    func testProductionNutritionAndActivityDecodeCanonicalDaysAndSelectExactContextRoutes() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionNutritionJSON),
            .json(200, productionActivityJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let nutrition = try await ProductionNutritionAPI(api: native).fetchNutritionLanding(scope: .all)
        XCTAssertEqual(nutrition.latestNutritionDay?.id, "nutrition-day-canonical")
        XCTAssertEqual(nutrition.latestNutritionDay?.totals.calories, 2_300)
        XCTAssertNil(nutrition.latestNutritionDay?.totals.fiberG)
        // The wire meal carries no `slot` key at all — confirms it's derived
        // from `name` ("Breakfast") rather than requiring the fixture-only key.
        XCTAssertEqual(nutrition.latestNutritionDay?.meals.first?.slot, .breakfast)
        XCTAssertEqual(nutrition.latestNutritionDay?.meals.first?.name, "Breakfast")
        // The wire sends a count (`0`), not a boolean — confirms both
        // representations decode rather than only the fixture's boolean.
        XCTAssertEqual(nutrition.latestNutritionDay?.meals.first?.additionalFoodsDetected, false)

        let activity = try await ProductionActivityAPI(api: native).fetchActivityLanding(scope: .all)
        XCTAssertEqual(activity.latestActivityDay?.id, "activity-day-canonical")
        XCTAssertEqual(activity.latestActivityDay?.activeCalories, 650)
        XCTAssertNil(activity.latestActivityDay?.totalCalories)
        // `linkedTrainingContext` entries never carry `date`/`sourceEvidence`
        // on the wire — confirms both decode as absent rather than failing.
        let linkedContext = try XCTUnwrap(activity.linkedTrainingContext.first)
        XCTAssertEqual(linkedContext.label, "Traditional Strength Training")
        XCTAssertNil(linkedContext.date)
        XCTAssertEqual(linkedContext.sourceEvidence, [])

        let requests = await transport.requests
        for request in requests.suffix(2) {
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems,
                           [URLQueryItem(name: "context", value: "all")])
        }
        XCTAssertThrowsError(try NativeProductWriteGuard.authorize(.nutrition, in: .founderProduction))
        XCTAssertThrowsError(try NativeProductWriteGuard.authorize(.activityAndHealthKit, in: .founderProduction))
    }

    func testProductionEnergyUsesFinishedServerReportPreservingMissingZeroPartialAndWeeklyValues() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionEnergyJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let report = try await ProductionEnergyAPI(api: native).fetchEnergyReport(scope: .all)
        XCTAssertEqual(report.summary.averageBalance, -125)
        XCTAssertEqual(report.dailyHistory.map(\.id), ["2026-09-10", "2026-09-09"])
        XCTAssertNil(report.dailyHistory[0].calorieIntake)
        XCTAssertEqual(report.dailyHistory[1].calorieIntake, 0)
        XCTAssertEqual(report.dailyHistory[0].completeness, "activity-only")
        XCTAssertEqual(report.weeklyHistory.first?.averageBalance, -125)
        XCTAssertTrue(report.weeklyHistory.first?.partial == true)
        XCTAssertEqual(report.recentFourWeeks, report.weeklyHistory)
        XCTAssertEqual(report.weeklyTrend.map(\.id), ["week-server"])
        let energyPath = await transport.requests.last?.url?.path
        XCTAssertEqual(energyPath, "/api/v1/native/read/energy")
    }

    /// The Evidence Hub is not backed by its own native read resource (no
    /// `evidence`/`progress-hub` entry exists in the Package 7 contract
    /// manifest) — `ProductionEvidenceAPI` composes it from the same
    /// per-domain production reads Weight/Training/Nutrition/Activity/
    /// Energy already use. This is the regression this correction exists
    /// to add: before it, `AppEnvironment.evidenceAPI` was a constant
    /// `FixtureEvidenceAPI` that never switched with `nativeAuthority`, so
    /// Founder Production showed stale Sandbox fixture summaries (e.g.
    /// Weight "179.4 lb" instead of the real canonical value).
    @MainActor
    func testProductionEvidenceHubComposesRealPerDomainSummariesNotFixtureValues() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "weight": productionWeightJSON(value: 172.4, id: "weight-canonical"),
                "training-landing": productionTrainingLandingJSON,
                "training-library": productionEmptyTrainingLibraryJSON,
                "nutrition": productionNutritionJSON,
                "activity": productionActivityJSON,
                "energy": productionEnergyJSON,
            ]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let hub = try await ProductionEvidenceAPI(api: native).fetchEvidenceHub()
        let streamsByID = Dictionary(uniqueKeysWithValues: hub.streams.map { ($0.id, $0) })

        // Real canonical Weight, never the Sandbox fixture's stale 179.4 lb.
        XCTAssertEqual(streamsByID["weight"]?.metric, "172.4 lb")
        XCTAssertEqual(streamsByID["weight"]?.status, .available)

        // Real production Training/Nutrition/Activity/Energy summaries.
        XCTAssertEqual(streamsByID["training"]?.lastUpdated, "2026-09-09")
        XCTAssertEqual(streamsByID["nutrition"]?.lastUpdated, "2026-09-10")
        XCTAssertEqual(streamsByID["nutrition"]?.metric, "2300 calories")
        XCTAssertEqual(streamsByID["activity"]?.lastUpdated, "2026-09-10")
        XCTAssertEqual(streamsByID["activity"]?.metric, "650 active cal / 45 min")
        XCTAssertEqual(streamsByID["energy"]?.lastUpdated, "2026-09-10")

        // Domains not yet wired to production reads must show an explicit
        // safe state, never the bundled fixture's "available" values —
        // this is not a Patch 3 wiring, it is honesty about what Founder
        // Production actually has.
        XCTAssertEqual(streamsByID["photos"]?.status, .placeholder)
        XCTAssertEqual(streamsByID["photos"]?.metric, "Not yet available in Founder Production")
        XCTAssertEqual(streamsByID["dexa"]?.status, .placeholder)
        XCTAssertEqual(streamsByID["dexa"]?.metric, "Not yet available in Founder Production")

        // Never-built surfaces keep the same "Coming soon" placeholder
        // Sandbox already shows — no regression there either.
        XCTAssertEqual(streamsByID["recovery"]?.metric, "Coming soon")
        XCTAssertEqual(streamsByID["health-metrics"]?.metric, "Coming soon")
    }

    /// The defect this guards against was architectural, not a data bug:
    /// `evidenceAPI` was a stored constant, so it could never have switched
    /// with authority no matter what either implementation returned.
    /// Confirms the property itself is authority-aware and Sandbox keeps
    /// using the exact fixture instance it was constructed with.
    @MainActor
    func testAppEnvironmentEvidenceAPISwitchesWithAuthorityAndSandboxKeepsTheInjectedFixture() {
        final class ProbeEvidenceAPI: EvidenceAPI {
            func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
                EvidenceHubReadModel(title: "probe", subtitle: "probe", streams: [])
            }
        }
        let suite = "PhysiqueOS.EvidenceAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        let probe = ProbeEvidenceAPI()
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store, evidenceAPI: probe)
        XCTAssertTrue((environment.evidenceAPI as? ProbeEvidenceAPI) === probe)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.evidenceAPI is ProductionEvidenceAPI)
        XCTAssertNil(environment.evidenceAPI as? ProbeEvidenceAPI)

        environment.selectNativeAuthority(.sandbox)
        XCTAssertTrue((environment.evidenceAPI as? ProbeEvidenceAPI) === probe)
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

private func productionEnvelope(resource: String, data: String) -> String {
    #"{"contractVersion":"1","resource":"\#(resource)","authority":"founder-production","generatedAt":"2026-09-10T15:00:00.000Z","data":\#(data)}"#
}

private func productionHomeJSON(priorityID: String, goalID: String, confidence: Int) -> String {
    productionEnvelope(resource: "home", data: """
    {
      "header":{"greeting":"Good morning","name":"Founder"},
      "hero":{"mode":"phase_trajectory","goalLabel":"Current Goal","headline":"Server headline","supportLine":"Server support","confidence":\(confidence),"confidenceDetail":null,"primaryTimeline":"4 weeks remaining","plannedReviewDate":"2026-10-08"},
      "nextBestAction":{"title":"Server action","icon":"target","destination":{"id":"goal.detail","parameters":{"goalId":"\(goalID)"}}},
      "briefingCards":[],
      "goals":[{"id":"\(goalID)","title":"Server Goal","icon":"dumbbell","color":"success","destination":{"id":"goal.detail","parameters":{"goalId":"\(goalID)"}},"presentation":{"mode":"phase_trajectory_goal","trajectory":{"goalProgress":{"baselineValue":147.5,"latestValue":148.3,"targetAmount":10,"unit":"lb","clampedProgressPercentage":8}}}}],
      "todaysFocus":[{"id":"\(priorityID)","completionId":"completion-canonical","executionId":"execution-canonical","occurrenceDate":"2026-09-10","label":"Server Priority","subtitle":"Server-owned occurrence","metadata":"Production","changeLabel":null,"icon":"target","color":"primary","state":"available","completed":false,"actionLabel":"Complete","completionContext":{"occurrenceDate":"2026-09-10","dose":null,"protocolId":null}}]
    }
    """)
}

private let productionGoalsJSON = productionEnvelope(resource: "goals", data: #"{"activeGoals":[{"id":"goal-canonical","title":"Build Lean Mass","status":"active","statusLabel":"On Track","confidence":{"value":74,"band":"Moderate","source":"server","explanation":"Server explanation"},"phase":{"id":"phase-canonical","name":"Foundation","status":"active","startedAt":"2026-09-01","plannedReviewAt":"2026-10-01"}}],"completedGoals":[],"transitionEntry":null,"relationshipContext":{"activeGoalId":"goal-canonical","activePhaseId":"phase-canonical"}}"#)

private let productionCompletedGoalsHubJSON = productionEnvelope(resource: "goals", data: #"{"activeGoals":[],"completedGoals":[{"id":"goal-visible-abs","title":"Visible Abs at Rest","status":"Completed","dates":"May 20 → Jul 18","achievement":"7.7% Body Fat"}],"transitionEntry":null,"relationshipContext":{}}"#)

private let productionCompletedGoalJSON = productionEnvelope(resource: "completed-goal", data: #"{"goalId":"goal-visible-abs","status":"completed","preview":{"readOnly":true,"canonicalGoalId":"goal-visible-abs","supportingGoalIds":[]},"hero":{"title":"Visible Abs at Rest","status":"Completed","dates":"May 20 → Jul 18","achievement":"7.7% Body Fat"},"recap":"Server recap","highlights":[{"date":"2026-07-18","title":"The finish line aligned","body":"Server evidence converged."}],"photos":{"beginning":null,"completion":null,"historyHref":"/progress/photos"},"finalComposition":{"scanId":"scan-canonical","date":"2026-07-18","bodyFat":"7.7%","leanMass":"147.5 lb","fatMass":"12.3 lb","weight":"159.8 lb","narrative":"Server conclusion","briefingHref":"/briefings/dexa/scan-canonical"},"achievedBy":["Server outcome"],"unlocked":{"title":"Build Lean Mass","destination":{"id":"goal.detail","parameters":{"goalId":"goal-canonical"}},"body":"Next canonical goal."}}"#)

/// A completed journey entry's `support` is genuinely `null` on the wire
/// (confirmed against a real Package 7 `active-goal` response) — this
/// fixture must include that null case, not just an active entry with a
/// populated `support`, or it can't catch a regression to
/// `Journey.support: String` non-optional.
private let productionActiveGoalJSON = productionEnvelope(resource: "active-goal", data: #"{"goalId":"goal-canonical","phaseId":"phase-canonical","confidence":{"score":74,"band":"Moderate","summary":"Server confidence"},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Establish Maintenance","number":1,"status":"Completed","dates":"Started Jul 19 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Foundation","number":2,"status":"Active","dates":"Started Sep 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":32}],"currentPhase":{"id":"phase-canonical","goalId":"goal-canonical","title":"Foundation","purpose":"Build deliberately","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain 8–9% body fat","scope":"Every phase","body":"DEXA is authoritative","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[{"title":"Goal journey activated","body":"The journey began.","date":"2026-07-19"}],"strategy":[{"label":"Energy","active":true}]}"#)

private let productionOperatingPlanJSON = productionEnvelope(resource: "operating-plan", data: #"{"sections":[{"iconKey":"energy","tone":"primary","title":"Energy Strategy","subtitle":"Active","items":[{"id":"energy-canonical","title":"Phase Execution","detail":"2300 kcal/day intake","status":"Active","destination":{"id":"operating-plan","parameters":{}}}]}],"sourceVersions":{"energy":"4"},"relationshipContext":{"activeGoalId":"goal-canonical","activePhaseId":"phase-canonical"}}"#)

private let productionPriorityJSON = productionEnvelope(resource: "priority", data: #"{"id":"priority-canonical","title":"Morning weigh-in","subtitle":"Today","status":"Available","sections":[{"title":"Context","items":[{"label":"Goal","detail":"Build Lean Mass"}]}],"completionContext":{"occurrenceDate":"2026-09-10","dose":null,"protocolId":null},"executionContract":{"priorityId":"priority-canonical","occurrenceDate":"2026-09-10","occurrenceKey":"priority-canonical:2026-09-10","workflow":"priority_detail","destination":{"id":"priority.detail","parameters":{"priorityId":"priority-canonical"}}},"executionProjection":{"executionId":"execution-canonical"}}"#)

private func productionTrainingLibraryJSON(exerciseID: String, muscleGroup: String) -> String {
    productionEnvelope(resource: "training-library", data: """
    {"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"canonicalExercises":[{"canonicalExerciseId":"\(exerciseID)","label":"Incline Press","primaryMuscleGroupId":"\(muscleGroup)","primaryMuscleGroups":["\(muscleGroup)"],"regionLabel":"Upper Body","equipment":"Dumbbells","defaultMeasurement":"reps_load","defaultLoadType":"external"}]}}
    """)
}

/// `coreNavigation.getTrainingLogger`'s `initialHistorySessions` are the
/// server's own leaner `projectTrainingHistorySession` projection, not the
/// full `training-session` presentation shape — `{id, evidence_type,
/// observed_at, exercises: [{id, canonicalExerciseId, name, body_region,
/// equipment, sets: [{reps, weight, weight_unit}]}]}`, with no
/// `set_number`, `label`, `value`, `detail`, or `sourceEvidence` anywhere
/// (confirmed against a real production response). This fixture must use
/// that exact leaner shape or it can't catch a regression to reusing
/// `TrainingSessionDetailReadModel` here.
private func productionTrainingLoggerJSON(exerciseID: String, muscleGroup: String) -> String {
    productionEnvelope(resource: "training-logger", data: """
    {"initialDate":"2026-09-10","initialCanonicalExercises":[{"id":"\(exerciseID)","name":"Incline Press","equipment":"Dumbbells","bodyRegion":"Upper Body","primaryMuscleGroups":["\(muscleGroup)"],"defaultMeasurement":"reps_load","defaultLoadType":"external"}],"initialHistorySessions":[{"id":"session-canonical","evidence_type":"training","observed_at":"2026-09-09","exercises":[{"id":"exercise-occurrence-canonical","canonicalExerciseId":"\(exerciseID)","name":"Incline Press","body_region":"Upper Body","equipment":"Dumbbells","sets":[{"reps":10,"weight":135,"weight_unit":"lb"},{"reps":8,"weight":145,"weight_unit":"lb"}]}]}],"initialPerformedExerciseIds":["\(exerciseID)"]}
    """)
}

private let productionTrainingExerciseJSON = productionEnvelope(resource: "training-exercise", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"entries":[]},"exerciseRecords":{"id":"records-canonical","heading":"Performance Records","canonicalExerciseId":"canonical-incline-press","canonicalExerciseName":"Incline Press","records":[{"id":"record-canonical","canonicalExerciseId":"canonical-incline-press","canonicalExerciseName":"Incline Press","title":"Volume PR","value":"4,200 lb","previousBaseline":null,"improvement":null,"detail":null,"workoutDate":"2026-09-09","executionVariant":null,"relationshipContext":null,"achievedValue":4200,"achievementType":"session_volume_pr","sourceEventId":"event-canonical"}],"visibleCount":1,"totalCount":1,"hiddenCount":0,"countLabel":null}}"#)

/// The Package 7 `nutrition` resource's canonical meal shape never carries
/// a `slot` key — only a free-text `name` ("Breakfast", "Lunch", "Dinner",
/// "Snacks", confirmed against a real production response). This fixture
/// must omit `slot` from `meals[]` or it can't catch a regression to a
/// non-optional `slot` decode requirement.
private let productionNutritionJSON = productionEnvelope(resource: "nutrition", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Nutrition","selected":true}]},"report":{"title":"Nutrition","subtitle":"Nutrition evidence","tone":"success","nutritionDays":[{"id":"nutrition-day-canonical","date":"2026-09-10","value":"2300 calories","detail":"180g protein · 220g carbs · 70g fat · 1 meal","sourceEvidence":["web"],"totals":{"calories":2300,"proteinG":180,"carbsG":220,"fatG":70,"fiberG":null},"meals":[{"id":"meal-canonical","name":"Breakfast","completeness":"complete","totals":{"calories":2300,"proteinG":180,"carbsG":220,"fatG":70,"fiberG":null},"foods":[],"additionalFoodsDetected":0}]}],"nutritionLibrary":[],"nutritionReportingLinks":[],"dataSources":[{"name":"Manual","status":"Connected"}]}}"#)

/// `getLinkedActivityTrainingContext` only ever emits
/// `{id, label, value, detail}` — no `date`/`sourceEvidence` (confirmed
/// against a real production response). This fixture must include a
/// non-empty entry in that exact leaner shape or it can't catch a
/// regression to non-optional `date`/`sourceEvidence` decode requirements.
private let productionActivityJSON = productionEnvelope(resource: "activity", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Activity","selected":true}]},"report":{"title":"Activity","subtitle":"Whole-day movement","tone":"success","latestActivityDay":{"id":"activity-day-canonical","label":"Daily Activity","value":"650 active cal / 45 min","detail":"1 workout linked","date":"2026-09-10","isToday":true,"activeCalories":650,"totalCalories":null,"exerciseMinutes":45,"standHours":12,"moveGoal":600,"exerciseGoal":30,"standGoal":12,"ringCompletion":null,"workoutActiveCalories":400,"nonWorkoutActiveCalories":250,"linkedTrainingSessionCount":1,"protocolStatus":"50 active calories above target."},"activityAreas":[],"linkedTrainingContext":[{"id":"training-canonical","label":"Traditional Strength Training","value":"356 active cal","detail":"1h 12m · 4 exercises"}],"activityHistory":[{"id":"activity-day-canonical","label":"Daily Activity","value":"650 active cal / 45 min","detail":"1 workout linked","date":"2026-09-10","isToday":true,"activeCalories":650,"totalCalories":null,"exerciseMinutes":45,"standHours":12,"moveGoal":600,"exerciseGoal":30,"standGoal":12,"ringCompletion":null,"workoutActiveCalories":400,"nonWorkoutActiveCalories":250,"linkedTrainingSessionCount":1,"protocolStatus":"50 active calories above target."}],"dataSources":[{"name":"Web","status":"Connected"}]}}"#)

private let productionEnergyJSON = productionEnvelope(resource: "energy", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Energy","selected":true}]},"summary":{"averageIntake":2300,"averageExpenditure":2425,"averageBalance":-125,"completeDays":1,"evidenceDays":2},"days":[{"date":"2026-09-10","nutritionDayId":null,"activityDayId":"activity-1","calorieIntake":null,"activeCalories":500,"rmr":1700,"estimatedExpenditure":2200,"energyBalance":null,"completeness":"activity-only","sources":{"nutrition":[],"activity":["Activity"]}},{"date":"2026-09-09","nutritionDayId":"nutrition-1","activityDayId":"activity-2","calorieIntake":0,"activeCalories":600,"rmr":1700,"estimatedExpenditure":2300,"energyBalance":-2300,"completeness":"complete","sources":{"nutrition":["Web"],"activity":["Activity"]}}],"weeks":[{"id":"week-server","weekStart":"2026-09-07","weekEnd":"2026-09-13","averageIntake":2300,"averageExpenditure":2425,"averageBalance":-125,"completeDayCount":1,"evidenceDayCount":2,"expectedDayCount":4,"partial":true}],"recentFourWeeks":[{"id":"week-server","weekStart":"2026-09-07","weekEnd":"2026-09-13","averageIntake":2300,"averageExpenditure":2425,"averageBalance":-125,"completeDayCount":1,"evidenceDayCount":2,"expectedDayCount":4,"partial":true}],"latestEvidenceDate":"2026-09-10","dataSources":[{"name":"Nutrition","status":"Connected"}],"audit":{"nutritionDays":1,"activityDays":2,"overlappingDates":1}}"#)

private let productionTrainingLandingJSON = productionEnvelope(resource: "training-landing", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"title":"Training","subtitle":"Training evidence","tone":"success","latestTrainingDay":{"date":"2026-09-09","label":"Sep 9","summary":"Biceps · Triceps","destination":{"id":"progress.stream","parameters":{"streamId":"training"}},"sessions":[]},"reportingLinks":[],"trainingDays":[],"currentProtocol":{"sourceOfTruth":"Server","dailyActivityTarget":"1000 cal","resistanceTraining":"3x/week","goal":"Build Lean Mass"},"relatedGoals":[],"sourceEvidence":[]}}"#)

private let productionEmptyTrainingLibraryJSON = productionEnvelope(resource: "training-library", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"canonicalExercises":[]}}"#)

/// The `evidence-review-queue` resource is `coreNavigation.getLog`'s real
/// response shape (`LoggedTodayService.composeLoggedTodaySummary` +
/// `LogReadService.projectPendingReviews`) — always exactly three
/// `loggedToday` rows (training, nutrition, activity, in that order),
/// each with `{id, summary, context, recordId}`; `recordId` is the
/// canonical record's own id, not a native-shaped destination object.
private let productionLogJSON = productionEnvelope(resource: "evidence-review-queue", data: #"{"localDate":"2026-09-10","loggedToday":{"rows":[{"id":"training","summary":"Traditional Strength Training · 45 min","context":null,"recordId":"session-canonical"},{"id":"nutrition","summary":"4 meals · 2300 calories","context":null,"recordId":"nutrition-day-canonical"},{"id":"activity","summary":"650 active calories","context":null,"recordId":"activity-day-canonical"}]},"pendingEvidenceReviews":[{"id":"review-canonical","date":"Thursday, September 10","title":"Check-in ready to review","summary":"1 weight entry","likelyDuplicate":false}]}"#)

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

/// Routes by resource name (the last path segment) rather than a strict
/// request order. `ProductionEvidenceAPI` composes several independent
/// reads — one of which (`ProductionTrainingAPI.fetchTrainingLanding`)
/// itself fires two concurrent sub-requests — so a FIFO-sequenced mock
/// would be flaky: which of two concurrently-issued requests lands first
/// is not guaranteed. Order-independent routing sidesteps that entirely.
private actor RoutedFounderTransport: FounderHTTPTransport {
    private(set) var requests: [URLRequest] = []
    private let pairing: String
    private var pairingServed = false
    private let responsesByResource: [String: String]

    init(pairing: String, byResource responsesByResource: [String: String]) {
        self.pairing = pairing
        self.responsesByResource = responsesByResource
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let path = request.url?.path ?? ""
        if !pairingServed, path.hasSuffix("/auth/pair") {
            pairingServed = true
            return (Data(pairing.utf8), response(request: request))
        }
        let resource = (request.url?.lastPathComponent).flatMap { $0.isEmpty ? nil : $0 } ?? ""
        guard let json = responsesByResource[resource] else {
            throw URLError(.badServerResponse)
        }
        return (Data(json.utf8), response(request: request))
    }

    private func response(request: URLRequest) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
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
