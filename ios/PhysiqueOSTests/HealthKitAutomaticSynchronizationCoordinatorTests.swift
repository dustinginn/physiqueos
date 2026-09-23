import XCTest
@testable import PhysiqueOS

/// Coverage for the permanent, background-eligible Activity + Nutrition +
/// Workouts bootstrap: idempotent per-session authorization, per-stream
/// error isolation, the exact stream set (Activity, Nutrition, Workouts --
/// Workouts floor-bounded by `HealthKitWorkoutActivationFloor`, see the
/// engine tests at the bottom of this file), and that its cursor namespace
/// (`predicateVersion`) never collides with the Founder diagnostic screen's
/// own bounded-window/test-day cursors.
final class HealthKitAutomaticSynchronizationCoordinatorTests: XCTestCase {
    private static let allStreams: Set<HealthKitSynchronizationStream> = [.activitySummary, .nutritionDailyTotal, .workouts]

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
    func testHappyPathRegistersObservingBackgroundDeliveryAndCatchesUpAllThreeStreams() async {
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        let scopes = await synchronizer.observedScopes()
        XCTAssertEqual(Set(scopes.map(\.stream)), Self.allStreams)
        XCTAssertEqual(outcome.caughtUpStreams, Self.allStreams)
        XCTAssertTrue(outcome.streamErrors.isEmpty)
        for scope in scopes {
            XCTAssertEqual(scope.ownerIdentity, "user_founder_001")
            XCTAssertEqual(scope.enrolledDeviceIdentity, "founder-device-stable")
            XCTAssertEqual(scope.predicateVersion, HealthKitAutomaticSynchronizationCoordinator.predicateVersion)
        }
        let observeCount = await synchronizer.observeCallCount()
        let backgroundDeliveryCount = await synchronizer.backgroundDeliveryCallCount()
        let syncCount = await synchronizer.syncCallCount()
        XCTAssertEqual(observeCount, 3)
        XCTAssertEqual(backgroundDeliveryCount, 3)
        XCTAssertEqual(syncCount, 3)
    }

    /// Build 54 inverts the old "never Workout" invariant: the automatic
    /// path now observes `HKWorkout` samples prospectively. Order matters
    /// only for readability (daily aggregates first), but the SET is exact:
    /// no other per-sample stream may sneak into the anchor-less path,
    /// because only `.workouts` has the activation floor that keeps a first
    /// run from sweeping all history.
    @MainActor
    func testExactlyActivityNutritionAndWorkouts() {
        XCTAssertEqual(
            HealthKitAutomaticSynchronizationCoordinator.streams,
            [.activitySummary, .nutritionDailyTotal, .workouts]
        )
        XCTAssertTrue(HealthKitAutomaticSynchronizationCoordinator.streams.contains(.workouts))
    }

    /// The Workout stream goes through the exact same three bootstrap steps
    /// as the daily aggregates: local observer registration, iOS background
    /// delivery registration, and one immediate catch-up synchronize, all
    /// under the automatic cursor namespace (so its anchor can never be
    /// confused with the Founder's exact-day Workout canary cursor).
    @MainActor
    func testAutomaticBootstrapRegistersObserverAndBackgroundDeliveryForWorkouts() async {
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        let observed = await synchronizer.observedScopes().filter { $0.stream == .workouts }
        let backgroundDelivery = await synchronizer.backgroundDeliveryScopes().filter { $0.stream == .workouts }
        let synchronized = await synchronizer.synchronizedScopes().filter { $0.stream == .workouts }
        XCTAssertEqual(observed.count, 1)
        XCTAssertEqual(backgroundDelivery.count, 1)
        XCTAssertEqual(synchronized.count, 1)
        XCTAssertEqual(observed.first?.predicateVersion, HealthKitAutomaticSynchronizationCoordinator.predicateVersion)
        XCTAssertEqual(backgroundDelivery.first, observed.first)
        XCTAssertEqual(synchronized.first, observed.first)
        XCTAssertFalse(observed.first?.predicateVersion.hasPrefix(HealthKitWorkoutCanaryDay.predicatePrefix) ?? true)
        XCTAssertTrue(outcome.caughtUpStreams.contains(.workouts))
        XCTAssertNil(outcome.streamErrors[.workouts])
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

    /// One stream's registration failure does not prevent the other streams
    /// from being attempted; a single HealthKit hiccup on Activity must never
    /// silently stop Nutrition or Workouts (or vice versa) from catching up.
    @MainActor
    func testOneStreamFailingDoesNotBlockTheOtherStreams() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailObserving = [.activitySummary]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.activitySummary], ["observer_registration_failed"])
        XCTAssertNil(outcome.streamErrors[.nutritionDailyTotal])
        XCTAssertNil(outcome.streamErrors[.workouts])
        XCTAssertEqual(outcome.caughtUpStreams, Self.allStreams)
        let scopes = await synchronizer.observedScopes()
        XCTAssertEqual(Set(scopes.map(\.stream)), Self.allStreams)
    }

    @MainActor
    func testBackgroundDeliveryFailureIsIsolatedPerStreamAndStillAttemptsCatchUp() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailBackgroundDelivery = [.nutritionDailyTotal]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.nutritionDailyTotal], ["background_delivery_registration_failed"])
        XCTAssertNil(outcome.streamErrors[.activitySummary])
        XCTAssertNil(outcome.streamErrors[.workouts])
        // Registration failing does not skip the catch-up sync for that stream.
        XCTAssertEqual(outcome.caughtUpStreams, Self.allStreams)
    }

    @MainActor
    func testCatchUpSyncFailureIsRecordedButDoesNotAbortTheOtherStreams() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailSync = [.activitySummary]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.activitySummary], ["catch_up_sync_failed"])
        XCTAssertFalse(outcome.caughtUpStreams.contains(.activitySummary))
        XCTAssertTrue(outcome.caughtUpStreams.contains(.nutritionDailyTotal))
        XCTAssertTrue(outcome.caughtUpStreams.contains(.workouts))
    }

    /// A Workout catch-up failure (e.g. a Server rejection now surfacing
    /// through `deliverPending`'s abandon-on-rejection path) is isolated to
    /// the Workout stream exactly like the daily aggregates' failures are.
    @MainActor
    func testWorkoutCatchUpFailureIsIsolatedFromActivityAndNutrition() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailSync = [.workouts]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.streamErrors[.workouts], ["catch_up_sync_failed"])
        XCTAssertEqual(outcome.caughtUpStreams, [.activitySummary, .nutritionDailyTotal])
    }

    /// The exact race the review flagged: two `bootstrap()` calls launched
    /// before the first one's async work (an authenticated server round
    /// trip, standing in for a real network delay) completes. Without
    /// coalescing, both would race past the `authorizationWasRequested`
    /// check and both would drive a full, concurrent synchronize pass.
    @MainActor
    func testOverlappingBootstrapCallsCoalesceIntoOneExecution() async {
        let server = AutomaticServerMock(ownerIdentityDelayNanoseconds: 20_000_000)
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer, server: server)

        async let first = harness.coordinator.bootstrap()
        async let second = harness.coordinator.bootstrap()
        let (outcomeA, outcomeB) = await (first, second)

        XCTAssertEqual(outcomeA, outcomeB)
        XCTAssertEqual(harness.authorization.requestCount, 1)
        let observeCount = await synchronizer.observeCallCount()
        let syncCount = await synchronizer.syncCallCount()
        let ownerIdentityCalls = await server.ownerIdentityCallCount()
        // Three streams, ONE execution -- not two.
        XCTAssertEqual(observeCount, 3)
        XCTAssertEqual(syncCount, 3)
        XCTAssertEqual(ownerIdentityCalls, 1)
    }

    /// A THIRD, non-overlapping call after the first fully completes must
    /// still work (the coordinator is reusable across the app's lifetime,
    /// not a one-shot), and should reuse the cached owner identity rather
    /// than re-fetching it.
    @MainActor
    func testSequentialBootstrapsAfterCompletionReuseTheCachedOwnerIdentity() async {
        let server = AutomaticServerMock()
        let synchronizer = AutomaticSynchronizerMock()
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer, server: server)

        _ = await harness.coordinator.bootstrap()
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(outcome.caughtUpStreams, Self.allStreams)
        let ownerIdentityCalls = await server.ownerIdentityCallCount()
        XCTAssertEqual(ownerIdentityCalls, 1)
        let syncCount = await synchronizer.syncCallCount()
        // Three streams x two completed bootstraps.
        XCTAssertEqual(syncCount, 6)
    }

    /// If more than one of the three per-stream calls fails, all of them must
    /// be recorded -- not just the last one to run.
    @MainActor
    func testMultipleFailuresForTheSameStreamAreAllRecordedNotOverwritten() async {
        let synchronizer = AutomaticSynchronizerMock()
        synchronizer.streamsToFailObserving = [.activitySummary]
        synchronizer.streamsToFailSync = [.activitySummary]
        let harness = AutomaticCoordinatorHarness(synchronizer: synchronizer)
        let outcome = await harness.coordinator.bootstrap()

        XCTAssertEqual(
            outcome.streamErrors[.activitySummary],
            ["observer_registration_failed", "catch_up_sync_failed"]
        )
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
    private var backgroundScopes: [HealthKitCursorScope] = []
    private var syncScopes: [HealthKitCursorScope] = []
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
        backgroundScopes.append(scope)
        if streamsToFailBackgroundDelivery.contains(scope.stream) { throw AutomaticCoordinatorTestError.serverUnreachable }
    }

    func synchronize(scope: HealthKitCursorScope, stagingCompletion: (@Sendable () -> Void)?) async throws {
        syncCalls += 1
        syncScopes.append(scope)
        if streamsToFailSync.contains(scope.stream) { throw AutomaticCoordinatorTestError.serverUnreachable }
    }

    func observedScopes() -> [HealthKitCursorScope] { scopes }
    func backgroundDeliveryScopes() -> [HealthKitCursorScope] { backgroundScopes }
    func synchronizedScopes() -> [HealthKitCursorScope] { syncScopes }
    func observeCallCount() -> Int { observeCalls }
    func backgroundDeliveryCallCount() -> Int { backgroundDeliveryCalls }
    func syncCallCount() -> Int { syncCalls }
}

private actor AutomaticServerMock: HealthKitFounderCanaryServer {
    private let ownerIdentityError: Error?
    private let ownerIdentityDelayNanoseconds: UInt64
    private var ownerIdentityCalls = 0

    init(ownerIdentityError: Error? = nil, ownerIdentityDelayNanoseconds: UInt64 = 0) {
        self.ownerIdentityError = ownerIdentityError
        self.ownerIdentityDelayNanoseconds = ownerIdentityDelayNanoseconds
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
        ownerIdentityCalls += 1
        if ownerIdentityDelayNanoseconds > 0 { try? await Task.sleep(nanoseconds: ownerIdentityDelayNanoseconds) }
        if let ownerIdentityError { throw ownerIdentityError }
        return "user_founder_001"
    }

    func ownerIdentityCallCount() -> Int { ownerIdentityCalls }

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

// MARK: - Workout activation floor

/// `HealthKitWorkoutActivationFloor` is the device-side reason the first
/// anchor-less Workout catch-up can never upload pre-activation history. It
/// is a fixed Founder-local calendar date resolved to an instant in the
/// device's zone; comparison is by workout END instant, never by the
/// start-based `occurrence.localDate`.
final class HealthKitWorkoutActivationFloorTests: XCTestCase {
    private static var losAngeles: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }

    private static func instant(_ iso8601: String) -> Date {
        ISO8601DateFormatter().date(from: iso8601)!
    }

    func testFloorIsStartOfTheActivationDayInTheSuppliedTimeZone() {
        let floor = HealthKitWorkoutActivationFloor(calendar: Self.losAngeles)
        XCTAssertEqual(HealthKitWorkoutActivationFloor.localDate, "2026-09-23")
        // 2026-09-23 00:00 PDT (UTC-7).
        XCTAssertEqual(floor.startOfDay, Self.instant("2026-09-23T07:00:00Z"))
        XCTAssertEqual(floor.timeZoneIdentifier, "America/Los_Angeles")

        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        XCTAssertEqual(HealthKitWorkoutActivationFloor(calendar: utc).startOfDay, Self.instant("2026-09-23T00:00:00Z"))
    }

    /// The device's calendar setting only contributes its time zone; the
    /// fixed year/month/day is always Gregorian, so a Buddhist/Japanese
    /// device calendar can never move the floor by centuries.
    func testFloorPinsDayArithmeticToGregorianRegardlessOfDeviceCalendar() {
        var buddhist = Calendar(identifier: .buddhist)
        buddhist.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        XCTAssertEqual(
            HealthKitWorkoutActivationFloor(calendar: buddhist).startOfDay,
            HealthKitWorkoutActivationFloor(calendar: Self.losAngeles).startOfDay
        )
    }

    func testAdmitsByEndInstantAndFailsClosedOnAnUnknownEnd() {
        let floor = HealthKitWorkoutActivationFloor(calendar: Self.losAngeles)
        XCTAssertFalse(floor.admits(endedAt: Self.instant("2026-09-23T06:59:59Z"))) // 23:59:59 PDT on Sep 22
        XCTAssertTrue(floor.admits(endedAt: Self.instant("2026-09-23T07:00:00Z"))) // exactly midnight PDT
        XCTAssertTrue(floor.admits(endedAt: Self.instant("2026-09-23T07:20:00Z")))
        XCTAssertFalse(floor.admits(endedAt: nil))
    }
}

/// The automatic engine path (`HealthKitSynchronizationEngine.synchronize`)
/// with fixture workouts around the floor: the query client is a fake that
/// returns everything it is given (standing in for a client with no floor,
/// or a predicate that let something through), so this exercises the
/// engine's own defense-in-depth filter in isolation. Hermetic: no
/// `HKHealthStore`.
final class HealthKitAutomaticWorkoutFloorEngineTests: XCTestCase {
    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }
    fileprivate static let now = ISO8601DateFormatter().date(from: "2026-09-23T20:00:00Z")!

    /// One ending 2026-09-22 23:30 local (dropped), one starting 23:30 on
    /// the 22nd and ending 00:20 on the 23rd (kept -- END is past the
    /// floor even though its start-based `localDate` is still the 22nd),
    /// one wholly on the 23rd (kept), plus a deletion (never delivered).
    func testStagesExactlyTheWorkoutsEndingOnOrAfterTheFloorAndDeliversNoDeletions() async throws {
        let endedBefore = Self.workout(start: (22, 22, 30), end: (22, 23, 30))
        let straddling = Self.workout(start: (22, 23, 30), end: (23, 0, 20))
        let onActivationDay = Self.workout(start: (23, 10, 0), end: (23, 11, 0))
        XCTAssertEqual(straddling.occurrence.localDate, "2026-09-22", "fixture: straddling session is start-dated on the 22nd")
        let deletion = HealthKitQueryDeletion(healthKitUUID: UUID(), immutableExternalID: nil, objectTypeIdentifier: "HKWorkoutTypeIdentifier")
        let harness = AutomaticWorkoutEngineHarness(
            floor: HealthKitWorkoutActivationFloor(calendar: Self.calendar),
            additions: [endedBefore, straddling, onActivationDay],
            deletions: [deletion]
        )

        try await harness.engine.synchronize(scope: harness.scope)

        let requests = await harness.query.requests()
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests.first?.stream, .workouts)
        XCTAssertNil(requests.first?.bounds, "the automatic path never supplies bounds; the floor is the only lower bound")

        let partitions = await harness.uploader.partitions()
        XCTAssertEqual(partitions.count, 1)
        let uploaded = try XCTUnwrap(partitions.first)
        XCTAssertEqual(uploaded.ingestionPurpose, .operational)
        XCTAssertEqual(
            Set(uploaded.additions.map(\.immutableExternalID)),
            Set([straddling, onActivationDay].map { $0.healthKitUUID!.uuidString.lowercased() })
        )
        XCTAssertFalse(uploaded.additions.contains { $0.healthKitUUID == endedBefore.healthKitUUID })
        XCTAssertTrue(uploaded.deletions.isEmpty)

        let encoded = try JSONEncoder().encode(try HealthKitS1WireMapper.payload(for: uploaded))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let observations = try XCTUnwrap(root["observations"] as? [[String: Any]])
        XCTAssertEqual(observations.count, 2)
        for observation in observations {
            XCTAssertEqual(observation["observationType"] as? String, "workout")
            XCTAssertEqual(observation["ingestionPurpose"] as? String, "operational")
            let workout = try XCTUnwrap(observation["workout"] as? [String: Any])
            XCTAssertNil(workout["exercises"])
            XCTAssertNil(workout["sets"])
        }
        let text = String(decoding: encoded, as: UTF8.self)
        XCTAssertFalse(text.contains("exercises"))
        XCTAssertFalse(text.contains("\"sets\""))
        XCTAssertFalse(text.contains(endedBefore.healthKitUUID!.uuidString.lowercased()))

        // The staged batch (now acknowledged) carried the deletion only as a
        // locally deferred partition: nothing but the one server-required
        // partition above ever reached the uploader.
        let uploadedCount = await harness.uploader.partitions().count
        XCTAssertEqual(uploadedCount, 1)
    }

    /// An engine constructed without a floor is byte-for-byte the pre-Build-54
    /// behavior: every addition the client returned is staged.
    func testWithoutAFloorEveryReturnedWorkoutIsStaged() async throws {
        let harness = AutomaticWorkoutEngineHarness(
            floor: nil,
            additions: [
                Self.workout(start: (22, 22, 30), end: (22, 23, 30)),
                Self.workout(start: (23, 10, 0), end: (23, 11, 0)),
            ]
        )
        try await harness.engine.synchronize(scope: harness.scope)
        let partitions = await harness.uploader.partitions()
        XCTAssertEqual(partitions.first?.additions.count, 2)
    }

    /// The floor is a Workout-stream concern only: a daily-aggregate
    /// observation has no end instant at all, and must never be dropped by
    /// a floor-carrying engine.
    func testFloorNeverFiltersNonWorkoutStreams() async throws {
        let harness = AutomaticWorkoutEngineHarness(
            floor: HealthKitWorkoutActivationFloor(calendar: Self.calendar),
            stream: .activitySummary,
            additions: [Self.activitySummary(localDate: "2026-09-01")]
        )
        try await harness.engine.synchronize(scope: harness.scope)
        let partitions = await harness.uploader.partitions()
        XCTAssertEqual(partitions.first?.additions.count, 1)
    }

    // MARK: fixtures

    private static func workout(start: (day: Int, hour: Int, minute: Int), end: (day: Int, hour: Int, minute: Int)) -> HealthKitQueryAddition {
        let startedAt = calendar.date(from: DateComponents(year: 2026, month: 9, day: start.day, hour: start.hour, minute: start.minute))!
        let endedAt = calendar.date(from: DateComponents(year: 2026, month: 9, day: end.day, hour: end.hour, minute: end.minute))!
        let dayStart = calendar.startOfDay(for: startedAt)
        return HealthKitQueryAddition(
            healthKitUUID: UUID(),
            objectTypeIdentifier: "HKWorkoutTypeIdentifier",
            source: .init(bundleIdentifier: "com.apple.health.watch", sourceName: "Apple Watch", sourceRevision: nil, productType: "Watch7,5", privacySafeDeviceProvenance: nil),
            occurrence: .init(
                startedAt: startedAt,
                endedAt: endedAt,
                localDate: String(format: "2026-09-%02d", start.day),
                calendarIdentifier: "gregorian",
                timeZoneIdentifier: calendar.timeZone.identifier,
                utcOffsetSeconds: calendar.timeZone.secondsFromGMT(for: startedAt),
                localDayStartedAt: dayStart,
                localDayEndedAt: calendar.date(byAdding: .day, value: 1, to: dayStart)!
            ),
            payload: .workout(.init(
                activityType: "50", durationSeconds: endedAt.timeIntervalSince(startedAt), activeCalories: 400, totalCalories: nil,
                distance: nil, distanceUnit: nil, averageHeartRate: 122, telemetryTypeIdentifiers: []
            )),
            allowlistedMetadata: [:]
        )
    }

    private static func activitySummary(localDate: String) -> HealthKitQueryAddition {
        let day = Int(localDate.suffix(2))!
        let dayStart = calendar.date(from: DateComponents(year: 2026, month: 9, day: day))!
        return HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier,
            source: .init(bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil, productType: nil, privacySafeDeviceProvenance: nil),
            occurrence: .init(
                startedAt: nil, endedAt: nil, localDate: localDate, calendarIdentifier: "gregorian",
                timeZoneIdentifier: calendar.timeZone.identifier, utcOffsetSeconds: calendar.timeZone.secondsFromGMT(for: dayStart),
                localDayStartedAt: dayStart, localDayEndedAt: calendar.date(byAdding: .day, value: 1, to: dayStart)!
            ),
            payload: .activitySummary(.init(
                dailyActivity: ["move_calories": 500, "exercise_minutes": 30, "stand_hours": 10],
                aggregationScope: "daily_total_including_workouts", coverage: .completeDay, sourceRevision: 1
            )),
            allowlistedMetadata: [:]
        )
    }
}

private actor AutomaticWorkoutQueryMock: HealthKitAnchoredQueryClient {
    struct Request: Equatable { let stream: HealthKitSynchronizationStream; let bounds: HealthKitQueryBounds? }
    private let result: HealthKitAnchoredQueryResult
    private var captured: [Request] = []

    init(result: HealthKitAnchoredQueryResult) { self.result = result }

    func execute(
        stream: HealthKitSynchronizationStream,
        after anchorData: Data?,
        bounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult {
        captured.append(Request(stream: stream, bounds: bounds))
        return result
    }

    func requests() -> [Request] { captured }
}

private final class AutomaticWorkoutObserverMock: HealthKitObserverClient, @unchecked Sendable {
    func register(
        stream: HealthKitSynchronizationStream,
        onWake: @escaping @Sendable (String?, @escaping @Sendable () -> Void) -> Void
    ) throws -> HealthKitObserverRegistration { .init(id: UUID()) }
    func unregister(_ registration: HealthKitObserverRegistration) {}
    func enableBackgroundDelivery(for stream: HealthKitSynchronizationStream) async throws {}
}

private actor AutomaticWorkoutUploaderMock: HealthKitObservationUploader {
    private var received: [HealthKitStagedPartition] = []

    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult {
        received.append(partition)
        return .durablyAccepted(batchID: partition.identity, receiptIdentity: "receipt")
    }

    func partitions() -> [HealthKitStagedPartition] { received }
}

private final class AutomaticWorkoutEngineHarness {
    let root: URL
    let scope: HealthKitCursorScope
    let query: AutomaticWorkoutQueryMock
    let uploader: AutomaticWorkoutUploaderMock
    let engine: HealthKitSynchronizationEngine

    init(
        floor: HealthKitWorkoutActivationFloor?,
        stream: HealthKitSynchronizationStream = .workouts,
        additions: [HealthKitQueryAddition],
        deletions: [HealthKitQueryDeletion] = []
    ) {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSAutomaticWorkoutFloorTests-\(UUID().uuidString)", isDirectory: true)
        scope = HealthKitCursorScope(
            ownerIdentity: "user_founder_001",
            enrolledDeviceIdentity: "founder-device-stable",
            stream: stream,
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        )
        query = AutomaticWorkoutQueryMock(result: .init(
            additions: additions,
            deletions: deletions,
            proposedAnchorData: Data("private-device-anchor".utf8),
            completedAt: HealthKitAutomaticWorkoutFloorEngineTests.now
        ))
        uploader = AutomaticWorkoutUploaderMock()
        engine = HealthKitSynchronizationEngine(
            queryClient: query,
            observerClient: AutomaticWorkoutObserverMock(),
            store: FileHealthKitSynchronizationStore(root: root),
            uploader: uploader,
            featureGate: .n1Automatic,
            workoutActivationFloor: floor,
            now: { HealthKitAutomaticWorkoutFloorEngineTests.now }
        )
    }

    deinit { try? FileManager.default.removeItem(at: root) }
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
