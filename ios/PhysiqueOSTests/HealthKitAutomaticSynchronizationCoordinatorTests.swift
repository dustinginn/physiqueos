import XCTest
@testable import PhysiqueOS

/// Coverage for the permanent, background-eligible Activity + Nutrition
/// bootstrap: idempotent per-session authorization, per-stream error
/// isolation, the exact stream set (Activity + Nutrition, never Workout),
/// and that its cursor namespace (`predicateVersion`) never collides with
/// the Founder diagnostic screen's own bounded-window/test-day cursors.
final class HealthKitAutomaticSynchronizationCoordinatorTests: XCTestCase {
    @MainActor
    func testRequestsAuthorizationOnlyOnceAcrossRepeatedBootstraps() async {
        let harness = AutomaticCoordinatorHarness()
        _ = await harness.coordinator.bootstrap()
        _ = await harness.coordinator.bootstrap()
        _ = await harness.coordinator.bootstrap()
        XCTAssertEqual(harness.authorization.requestCount, 1)
    }

    @MainActor
    func testSkipsAllWorkWhenAuthorizationNeverBecomesAvailable() async {
        let authorization = AutomaticAuthorizationMock()
        authorization.outcomeToReturn = .failed(.restrictedOrUnavailable)
        authorization.availabilityAfterRequest = .restrictedOrUnavailable
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(authorization: authorization, synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()
        XCTAssertEqual(outcome.skippedReason, "authorization_not_available")
        let scopesAtSkip = await synchronizer.observedScopes()
        XCTAssertTrue(scopesAtSkip.isEmpty)
    }

    @MainActor
    func testSkipsAllWorkWhenOwnerIdentityIsUnavailable() async {
        let server = AutomaticServerMock(ownerIdentityError: AutomaticCoordinatorTestError.serverUnreachable)
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer, server: server)
        let outcome = await harness.coordinator.bootstrap()
        XCTAssertEqual(outcome.skippedReason, "owner_identity_unavailable")
        let scopesAtSkip = await synchronizer.observedScopes()
        XCTAssertTrue(scopesAtSkip.isEmpty)
    }

    @MainActor
    func testSkipsAllWorkWhenDeviceIdentityIsUnavailable() async {
        let deviceIdentityStore = AutomaticDeviceIdentityStore(shouldThrow: true)
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer, deviceIdentityStore: deviceIdentityStore)
        let outcome = await harness.coordinator.bootstrap()
        XCTAssertEqual(outcome.skippedReason, "device_identity_unavailable")
        let scopesAtSkip = await synchronizer.observedScopes()
        XCTAssertTrue(scopesAtSkip.isEmpty)
    }

    @MainActor
    func testHappyPathRegistersObservingBackgroundDeliveryAndCatchesUpBothStreams() async {
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        let scopes = await synchronizer.observedScopes()
        XCTAssertEqual(Set(scopes.map(\.stream)), [.activitySummary, .nutritionDailyTotal])
        XCTAssertEqual(outcome.caughtUpStreams, [.activitySummary, .nutritionDailyTotal])
        XCTAssertTrue(outcome.streamErrors.isEmpty)
        for scope in scopes {
            XCTAssertEqual(scope.ownerIdentity, "user_founder_001")
            XCTAssertEqual(scope.enrolledDeviceIdentity, "founder-device-stable")
            XCTAssertEqual(scope.predicateVersion, HealthKitAutomaticSynchronizationCoordinator.predicateVersion)
        }
        let observeCount = await synchronizer.observeCallCount()
        let backgroundDeliveryCount = await synchronizer.backgroundDeliveryCallCount()
        let syncCount = await synchronizer.syncCallCount()
        XCTAssertEqual(observeCount, 2)
        XCTAssertEqual(backgroundDeliveryCount, 2)
        XCTAssertEqual(syncCount, 2)
    }

    @MainActor
    func testExactlyActivityAndNutritionNeverWorkout() {
        XCTAssertEqual(HealthKitAutomaticSynchronizationCoordinator.streams, [.activitySummary, .nutritionDailyTotal])
        XCTAssertFalse(HealthKitAutomaticSynchronizationCoordinator.streams.contains(.workouts))
    }

    @MainActor
    func testCursorNamespaceNeverCollidesWithBoundedDiagnosticCursors() throws {
        let automatic = HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let fixedNow = ISO8601DateFormatter().date(from: "2026-09-22T12:00:00Z")!
        let testDay = try HealthKitCanonicalTestDay(localDate: "2026-09-22", now: fixedNow, calendar: utc)
        let validation = try HealthKitActivityValidationWindow(startDate: "2026-09-12", endDate: "2026-09-19")
        XCTAssertNotEqual(automatic, testDay.predicateVersion)
        XCTAssertNotEqual(automatic, validation.predicateVersion)
        XCTAssertFalse(automatic.hasPrefix(HealthKitCanonicalTestDay.predicatePrefix))
    }

    /// One stream's registration failure does not prevent the other stream
    /// from being attempted; a single HealthKit hiccup on Activity must never
    /// silently stop Nutrition (or vice versa) from catching up.
    @MainActor
    func testOneStreamFailingDoesNotBlockTheOtherStream() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailObserving = [.activitySummary]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.activitySummary], "observer_registration_failed")
        XCTAssertNil(outcome.streamErrors[.nutritionDailyTotal])
        XCTAssertEqual(outcome.caughtUpStreams, [.activitySummary, .nutritionDailyTotal])
        let scopes = await synchronizer.observedScopes()
        XCTAssertEqual(Set(scopes.map(\.stream)), [.activitySummary, .nutritionDailyTotal])
    }

    @MainActor
    func testBackgroundDeliveryFailureIsIsolatedPerStreamAndStillAttemptsCatchUp() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailBackgroundDelivery = [.nutritionDailyTotal]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.nutritionDailyTotal], "background_delivery_registration_failed")
        XCTAssertNil(outcome.streamErrors[.activitySummary])
        // Registration failing does not skip the catch-up sync for that stream.
        XCTAssertEqual(outcome.caughtUpStreams, [.activitySummary, .nutritionDailyTotal])
    }

    @MainActor
    func testCatchUpSyncFailureIsRecordedButDoesNotAbortTheOtherStream() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailSync = [.activitySummary]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.activitySummary], "catch_up_sync_failed")
        XCTAssertFalse(outcome.caughtUpStreams.contains(.activitySummary))
        XCTAssertTrue(outcome.caughtUpStreams.contains(.nutritionDailyTotal))
    }

    @MainActor
    func testNeverThrowsAndRecordsLastOutcome() async {
        let harness = AutomaticCoordinatorHarness()
        let outcome = await harness.coordinator.bootstrap()
        XCTAssertEqual(harness.coordinator.lastBootstrapOutcome, outcome)
    }
}

// MARK: - Test doubles

private enum AutomaticCoordinatorTestError: Error {
    case serverUnreachable
}

@MainActor
private final class AutomaticAuthorizationMock: HealthKitCanaryAuthorizationCoordinating {
    var currentAvailability: HealthKitAvailability = .availableAuthorizationNotRequested
    private(set) var authorizationWasRequested = false
    private(set) var requestCount = 0
    var outcomeToReturn: HealthKitAuthorizationOutcome = .completed
    var availabilityAfterRequest: HealthKitAvailability = .available

    func requestAuthorization(for scope: HealthKitAuthorizationScope) async -> HealthKitAuthorizationOutcome {
        requestCount += 1
        authorizationWasRequested = true
        currentAvailability = availabilityAfterRequest
        return outcomeToReturn
    }
}

private actor AutomaticSynchronizerMock: HealthKitAutomaticSynchronizing {
    private var scopes: [HealthKitCursorScope] = []
    private var observeCalls = 0
    private var backgroundDeliveryCalls = 0
    private var syncCalls = 0
    nonisolated(unsafe) var streamsToFailObserving: Set<HealthKitSynchronizationStream> = []
    nonisolated(unsafe) var streamsToFailBackgroundDelivery: Set<HealthKitSynchronizationStream> = []
    nonisolated(unsafe) var streamsToFailSync: Set<HealthKitSynchronizationStream> = []

    func startObserving(scope: HealthKitCursorScope) async throws {
        observeCalls += 1
        scopes.append(scope)
        if streamsToFailObserving.contains(scope.stream) { throw AutomaticCoordinatorTestError.serverUnreachable }
    }

    func enableBackgroundDelivery(scope: HealthKitCursorScope) async throws {
        backgroundDeliveryCalls += 1
        if streamsToFailBackgroundDelivery.contains(scope.stream) { throw AutomaticCoordinatorTestError.serverUnreachable }
    }

    func synchronize(scope: HealthKitCursorScope, stagingCompletion: (@Sendable () -> Void)?) async throws {
        syncCalls += 1
        if streamsToFailSync.contains(scope.stream) { throw AutomaticCoordinatorTestError.serverUnreachable }
    }

    func observedScopes() -> [HealthKitCursorScope] { scopes }
    func observeCallCount() -> Int { observeCalls }
    func backgroundDeliveryCallCount() -> Int { backgroundDeliveryCalls }
    func syncCallCount() -> Int { syncCalls }
}

private actor AutomaticServerMock: HealthKitFounderCanaryServer {
    private let ownerIdentityError: Error?

    init(ownerIdentityError: Error? = nil) {
        self.ownerIdentityError = ownerIdentityError
    }

    func healthKitCanaryContract() async throws -> HealthKitCanaryServerContract {
        .init(
            commandType: HealthKitServerIngestionContract.commandType,
            contractVersion: HealthKitServerIngestionContract.contractVersion,
            maximumBatchSize: HealthKitServerIngestionContract.maximumObservationsPerBatch,
            observationTypes: ["activity_summary", "nutrition_daily_total"],
            ingestionPurposes: ["operational", "validation_only"],
            diagnosticEndpoint: HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint
        )
    }

    func founderOwnerIdentity() async throws -> String {
        if let ownerIdentityError { throw ownerIdentityError }
        return "user_founder_001"
    }

    func healthKitActivityValidation(startDate: String, endDate: String) async throws -> HealthKitActivityCanaryDiagnostic {
        fatalError("not exercised by these tests")
    }
}

private struct AutomaticDeviceIdentityStore: HealthKitCanaryDeviceIdentityStore {
    var shouldThrow = false
    func stableIdentity() throws -> String {
        if shouldThrow { throw AutomaticCoordinatorTestError.serverUnreachable }
        return "founder-device-stable"
    }
}

@MainActor
private struct AutomaticCoordinatorHarness {
    let authorization: AutomaticAuthorizationMock
    let synchronizer: AutomaticSynchronizerMock
    let server: AutomaticServerMock
    let coordinator: HealthKitAutomaticSynchronizationCoordinator

    init(
        authorization: AutomaticAuthorizationMock = AutomaticAuthorizationMock(),
        synchronizer: AutomaticSynchronizerMock = AutomaticSynchronizerMock(),
        server: AutomaticServerMock = AutomaticServerMock(),
        deviceIdentityStore: AutomaticDeviceIdentityStore = AutomaticDeviceIdentityStore()
    ) {
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.server = server
        self.coordinator = HealthKitAutomaticSynchronizationCoordinator(
            authorization: authorization,
            synchronizer: synchronizer,
            server: server,
            deviceIdentityStore: deviceIdentityStore
        )
    }
}
