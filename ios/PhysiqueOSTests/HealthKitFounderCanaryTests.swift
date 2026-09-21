import Foundation
import HealthKit
import XCTest
@testable import PhysiqueOS

final class HealthKitFounderCanaryTests: XCTestCase {
    fileprivate static let now = Date(timeIntervalSince1970: 1_789_128_000) // 2026-09-10T12:00:00Z

    func testValidationWindowRequiresExactBoundedLocalDatesAndEnforcesMaximum() throws {
        XCTAssertThrowsError(try HealthKitActivityValidationWindow(startDate: "", endDate: "2026-09-10"))
        XCTAssertThrowsError(try HealthKitActivityValidationWindow(startDate: "2026-09-10", endDate: ""))
        XCTAssertThrowsError(try HealthKitActivityValidationWindow(startDate: "2026-09-11", endDate: "2026-09-10"))
        XCTAssertThrowsError(try HealthKitActivityValidationWindow(startDate: "2026-08-10", endDate: "2026-09-10"))

        let maximum = try HealthKitActivityValidationWindow(startDate: "2026-08-11", endDate: "2026-09-10")
        XCTAssertEqual(maximum.startDate, "2026-08-11")
        XCTAssertEqual(maximum.endDate, "2026-09-10")
        XCTAssertTrue(maximum.contains(localDate: "2026-08-11"))
        XCTAssertTrue(maximum.contains(localDate: "2026-09-10"))
        XCTAssertFalse(maximum.contains(localDate: "2026-08-10"))
        XCTAssertFalse(maximum.contains(localDate: "2026-09-11"))
    }

    func testWindowBuildsExactLocalDayPredicateAndIdentifiesCurrentDayAsProvisional() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let window = try HealthKitActivityValidationWindow(startDate: "2026-09-05", endDate: "2026-09-10")
        let bounds = try window.queryBounds(calendar: calendar)

        XCTAssertEqual(Self.localDate(bounds.startDateInclusive, calendar: calendar), "2026-09-05")
        XCTAssertEqual(Self.localDate(bounds.endDateExclusive, calendar: calendar), "2026-09-11")
        XCTAssertTrue(window.isProvisional(now: calendar.date(from: DateComponents(year: 2026, month: 9, day: 10, hour: 12))!, calendar: calendar))
        XCTAssertFalse(window.isProvisional(now: calendar.date(from: DateComponents(year: 2026, month: 9, day: 11, hour: 12))!, calendar: calendar))
    }

    /// Build 42 physical-device crash: the real query client handed HealthKit
    /// date components without a calendar, and HealthKit raised an uncaught
    /// NSInvalidArgumentException ("Date components require a calendar")
    /// before any Activity query ran. Every canary test injects a fake query
    /// client, so this exercises the real HealthKit predicate API with the
    /// exact components `SystemHealthKitQueryClient` builds. No Health store,
    /// authorization, or data is involved.
    func testActivitySummaryPredicateComponentsSatisfyRealHealthKitCalendarContract() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let window = try HealthKitActivityValidationWindow(startDate: "2026-09-05", endDate: "2026-09-10")
        let bounds = try window.queryBounds(calendar: calendar)

        let components = SystemHealthKitQueryClient.activitySummaryPredicateComponents(
            bounds: bounds,
            calendar: calendar
        )

        // Checked before calling HealthKit: a missing calendar here is the
        // Build 42 crash, which would otherwise abort the test process.
        let startCalendar = try XCTUnwrap(components.start.calendar, "HealthKit requires a calendar on startDateComponents")
        let endCalendar = try XCTUnwrap(components.end.calendar, "HealthKit requires a calendar on endDateComponents")
        XCTAssertEqual(startCalendar.identifier, calendar.identifier)
        XCTAssertEqual(startCalendar.timeZone, calendar.timeZone)
        XCTAssertEqual(endCalendar.identifier, calendar.identifier)
        XCTAssertEqual(endCalendar.timeZone, calendar.timeZone)
        XCTAssertEqual(components.start.era, 1)
        XCTAssertEqual([components.start.year, components.start.month, components.start.day], [2026, 9, 5])
        XCTAssertEqual(components.end.era, 1)
        XCTAssertEqual([components.end.year, components.end.month, components.end.day], [2026, 9, 11])

        let predicate = HKQuery.predicate(
            forActivitySummariesBetweenStart: components.start,
            end: components.end
        )
        XCTAssertFalse(predicate.predicateFormat.isEmpty)
    }

    @MainActor
    func testCanaryIsDisabledByDefaultAndNeverPromptsOrReadsAutomatically() async throws {
        let harness = CanaryCoordinatorHarness()
        XCTAssertFalse(harness.coordinator.isEnabled)
        XCTAssertFalse(harness.coordinator.authorizationWasExplicitlyRequested)
        XCTAssertEqual(harness.authorization.requestCount, 0)
        let initialSyncCount = await harness.synchronizer.syncCount()
        XCTAssertEqual(initialSyncCount, 0)

        let blockedAuthorization = await harness.coordinator.requestAuthorization()
        XCTAssertEqual(blockedAuthorization, .blockedByFeatureGate)
        await XCTAssertThrowsCanaryError(.disabled) {
            _ = try await harness.coordinator.synchronize(window: Self.window())
        }
        XCTAssertEqual(harness.authorization.requestCount, 0)
        let finalSyncCount = await harness.synchronizer.syncCount()
        XCTAssertEqual(finalSyncCount, 0)
    }

    @MainActor
    func testExplicitEnableAuthorizationAndForegroundSyncUseValidationWindowScope() async throws {
        let harness = CanaryCoordinatorHarness()
        harness.coordinator.setEnabled(true)
        await XCTAssertThrowsCanaryError(.authorizationRequired) {
            _ = try await harness.coordinator.synchronize(window: Self.window())
        }
        let syncCountBeforeAuthorization = await harness.synchronizer.syncCount()
        XCTAssertEqual(syncCountBeforeAuthorization, 0)

        let authorization = await harness.coordinator.requestAuthorization()
        XCTAssertEqual(authorization, .completed)
        let result = try await harness.coordinator.synchronize(window: Self.window())
        let scopes = await harness.synchronizer.scopes()
        XCTAssertEqual(harness.authorization.requestCount, 1)
        XCTAssertEqual(scopes.count, 1)
        XCTAssertEqual(scopes[0].ownerIdentity, "user_founder_001")
        XCTAssertEqual(scopes[0].enrolledDeviceIdentity, "founder-device-stable")
        XCTAssertEqual(scopes[0].stream, .activitySummary)
        XCTAssertEqual(scopes[0].predicateVersion, Self.window().predicateVersion)
        XCTAssertEqual(result.readback.boundedRange.startDate, Self.window().startDate)
        XCTAssertEqual(result.readback.items.first?.ingestionPurpose, "validation_only")
    }

    @MainActor
    func testServerContractMismatchFailsClosedBeforeHealthKitQuery() async throws {
        let server = CanaryServerMock(contract: .init(
            commandType: HealthKitServerIngestionContract.commandType,
            contractVersion: "wrong-version",
            maximumBatchSize: 100,
            observationTypes: ["activity_summary", "workout", "quantity_sample"],
            ingestionPurposes: ["operational", "validation_only"],
            diagnosticEndpoint: HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint
        ))
        let harness = CanaryCoordinatorHarness(server: server)
        harness.coordinator.setEnabled(true)
        _ = await harness.coordinator.requestAuthorization()

        await XCTAssertThrowsCanaryError(.serverContractMismatch) {
            _ = try await harness.coordinator.synchronize(window: Self.window())
        }
        let syncCount = await harness.synchronizer.syncCount()
        let readCount = await server.readCount()
        XCTAssertEqual(syncCount, 0)
        XCTAssertEqual(readCount, 0)
    }

    @MainActor
    func testDiagnosticBoundaryMustRemainValidationOnlyRawAndBounded() async throws {
        let outside = Self.diagnosticItem(localDate: "2026-09-04")
        let server = CanaryServerMock(diagnostic: Self.diagnostic(items: [outside]))
        let harness = CanaryCoordinatorHarness(server: server)
        harness.coordinator.setEnabled(true)
        _ = await harness.coordinator.requestAuthorization()

        await XCTAssertThrowsCanaryError(.diagnosticBoundaryViolation) {
            _ = try await harness.coordinator.synchronize(window: Self.window())
        }
    }

    func testCanaryGateCannotActivateBackgroundCanonicalWritesOrOtherDomains() {
        let gate = HealthKitFeatureGate.founderActivityValidation
        XCTAssertTrue(gate.allows(.requestAuthorization))
        XCTAssertTrue(gate.allows(.observationQuery))
        XCTAssertTrue(gate.allows(.serverUpload))
        XCTAssertFalse(gate.allows(.backgroundDelivery))
        XCTAssertFalse(gate.allows(.canonicalSynchronization))
        XCTAssertFalse(gate.allows(.healthKitWrite))
        XCTAssertEqual(HealthKitSynchronizationStream.nutritionEnergy.deliveryCapability, .s1(observationType: .quantitySample))
        XCTAssertEqual(HealthKitSynchronizationStream.workouts.deliveryCapability, .s1(observationType: .workout))
        XCTAssertEqual(HealthKitSynchronizationStream.sleepAnalysis.deliveryCapability, .localOnly(reason: "server_sleep_contract_deferred"))
    }

    func testActivityCanaryFiltersOutsideWindowAndUploadsOnlyValidationPurpose() async throws {
        let additions = [
            Self.activity(localDate: "2026-09-04", calories: 400),
            Self.activity(localDate: "2026-09-05", calories: 500),
            Self.activity(localDate: "2026-09-10", calories: 700),
            Self.activity(localDate: "2026-09-11", calories: 800),
        ]
        let harness = try CanaryEngineHarness(additions: additions)
        let summary = try await harness.engine.synchronizeActivityValidation(
            scope: harness.scope,
            window: Self.window(),
            calendar: Self.calendar
        )
        let partitions = await harness.uploader.partitions()
        let bounds = await harness.query.bounds()

        XCTAssertEqual(summary.additionsDiscovered, 4)
        XCTAssertEqual(summary.additionsFilteredByWindow, 2)
        XCTAssertEqual(partitions.count, 1)
        XCTAssertEqual(partitions[0].ingestionPurpose, .validationOnly)
        XCTAssertEqual(partitions[0].additions.map(\.occurrence.localDate), ["2026-09-05", "2026-09-10"])
        XCTAssertEqual(bounds.count, 1)
        XCTAssertEqual(bounds[0]?.startLocalDate, "2026-09-05")
        XCTAssertEqual(bounds[0]?.endLocalDate, "2026-09-10")
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor)
    }

    func testLostAcknowledgementReplaysExactValidationOnlyPartitionWithoutRequery() async throws {
        let harness = try CanaryEngineHarness(
            additions: [Self.activity(localDate: "2026-09-06", calories: 600)],
            uploadModes: [.transient, .accept]
        )
        _ = try await harness.engine.synchronizeActivityValidation(
            scope: harness.scope,
            window: Self.window(),
            calendar: Self.calendar
        )
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(pending.first?.ingestionPurpose, .validationOnly)
        let cursorBeforeReplay = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursorBeforeReplay)

        let replay = try await harness.engine.synchronizeActivityValidation(
            scope: harness.scope,
            window: Self.window(),
            calendar: Self.calendar
        )
        let identities = await harness.uploader.identities()
        XCTAssertTrue(replay.resumedPendingBatch)
        XCTAssertEqual(identities.count, 2)
        XCTAssertEqual(identities[0], identities[1])
        let queryCount = await harness.query.callCount()
        let cursorAfterReplay = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(queryCount, 1)
        XCTAssertNotNil(cursorAfterReplay)
    }

    func testWindowOwnerAndDeviceProduceIncompatibleCursorScopes() async throws {
        let first = try CanaryEngineHarness(additions: [Self.activity(localDate: "2026-09-06", calories: 600)])
        _ = try await first.engine.synchronizeActivityValidation(scope: first.scope, window: Self.window(), calendar: Self.calendar)

        let otherWindow = try HealthKitActivityValidationWindow(startDate: "2026-09-06", endDate: "2026-09-10")
        let otherWindowScope = HealthKitCursorScope(
            ownerIdentity: first.scope.ownerIdentity,
            enrolledDeviceIdentity: first.scope.enrolledDeviceIdentity,
            stream: .activitySummary,
            predicateVersion: otherWindow.predicateVersion
        )
        let otherOwnerScope = HealthKitCursorScope(
            ownerIdentity: "other-owner",
            enrolledDeviceIdentity: first.scope.enrolledDeviceIdentity,
            stream: .activitySummary,
            predicateVersion: Self.window().predicateVersion
        )
        let otherDeviceScope = HealthKitCursorScope(
            ownerIdentity: first.scope.ownerIdentity,
            enrolledDeviceIdentity: "other-device",
            stream: .activitySummary,
            predicateVersion: Self.window().predicateVersion
        )
        let otherWindowCursor = try await first.store.authoritativeCursor(for: otherWindowScope)
        let otherOwnerCursor = try await first.store.authoritativeCursor(for: otherOwnerScope)
        let otherDeviceCursor = try await first.store.authoritativeCursor(for: otherDeviceScope)
        XCTAssertNil(otherWindowCursor)
        XCTAssertNil(otherOwnerCursor)
        XCTAssertNil(otherDeviceCursor)
    }

    func testWirePayloadExplicitlyCarriesValidationPurposeAndNoAnchorOrStrategicFields() throws {
        let query = HealthKitAnchoredQueryResult(
            additions: [Self.activity(localDate: "2026-09-07", calories: 650)],
            deletions: [],
            proposedAnchorData: Data("opaque-anchor-must-stay-local".utf8),
            completedAt: Self.now
        )
        let batch = try HealthKitBatchBuilder().build(
            scope: Self.scope(window: Self.window()),
            previousCursor: nil,
            queryResult: query,
            createdAt: Self.now,
            ingestionPurpose: .validationOnly
        )
        let payload = try HealthKitS1WireMapper.payload(for: try XCTUnwrap(batch.partitions.first))
        let encoded = try JSONEncoder().encode(payload)
        let text = String(decoding: encoded, as: UTF8.self)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let observations = try XCTUnwrap(root["observations"] as? [[String: Any]])
        let observation = try XCTUnwrap(observations.first)
        let source = try XCTUnwrap(observation["source"] as? [String: Any])
        XCTAssertTrue(text.contains("\"ingestionPurpose\":\"validation_only\""))
        XCTAssertEqual(source["sourceName"] as? String, "Apple Health")
        XCTAssertEqual(source["privacySafeDeviceProvenance"] as? String, "Apple/Watch")
        for forbidden in ["opaqueAnchor", "Confidence", "Narrative", "Evidence", "Goal", "Strategy", "Forecast", "coaching"] {
            XCTAssertFalse(text.contains(forbidden), "Wire payload contained forbidden field: \(forbidden)")
        }
    }

    fileprivate static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }

    fileprivate static func window() -> HealthKitActivityValidationWindow {
        try! HealthKitActivityValidationWindow(startDate: "2026-09-05", endDate: "2026-09-10")
    }

    fileprivate static func scope(window: HealthKitActivityValidationWindow) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "user_founder_001",
            enrolledDeviceIdentity: "founder-device-stable",
            stream: .activitySummary,
            predicateVersion: window.predicateVersion
        )
    }

    private static func localDate(_ date: Date, calendar: Calendar) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
    }

    private static func activity(localDate: String, calories: Double) -> HealthKitQueryAddition {
        let day = Int(localDate.suffix(2))!
        let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: day))!
        return HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier,
            source: .init(
                bundleIdentifier: "com.apple.Health",
                sourceName: "Apple Health",
                sourceRevision: "watchOS-13",
                productType: "Watch",
                privacySafeDeviceProvenance: "Apple/Watch"
            ),
            occurrence: .init(
                startedAt: start,
                endedAt: calendar.date(byAdding: .day, value: 1, to: start),
                localDate: localDate,
                calendarIdentifier: "gregorian",
                timeZoneIdentifier: calendar.timeZone.identifier,
                utcOffsetSeconds: calendar.timeZone.secondsFromGMT(for: start),
                localDayStartedAt: start,
                localDayEndedAt: calendar.date(byAdding: .day, value: 1, to: start)!
            ),
            payload: .activitySummary(.init(
                dailyActivity: [
                    "move_calories": calories,
                    "exercise_minutes": 30,
                    "stand_hours": 10,
                    "steps": 9_876,
                    "walking_running_distance": 7_654,
                    "flights_climbed": 8,
                ],
                aggregationScope: "daily_total_including_workouts",
                coverage: .completeDay,
                sourceRevision: 1
            )),
            allowlistedMetadata: [:]
        )
    }

    fileprivate static func diagnostic(items: [HealthKitActivityCanaryDiagnostic.Item] = [diagnosticItem(localDate: "2026-09-05")]) -> HealthKitActivityCanaryDiagnostic {
        HealthKitActivityCanaryDiagnostic(
            purpose: "validation_only",
            boundedRange: .init(startDate: "2026-09-05", endDate: "2026-09-10", inclusive: true),
            canonicalAuthority: "none",
            strategicAuthority: "none",
            items: items
        )
    }

    private static func diagnosticItem(localDate: String) -> HealthKitActivityCanaryDiagnostic.Item {
        .init(
            sourceObservationId: "healthkit_observation_\(localDate)",
            ingestionPurpose: "validation_only",
            observationType: "activity_summary",
            frozenLocalDate: localDate,
            occurrence: .init(
                startedAt: "2026-09-05T07:00:00.000Z",
                endedAt: "2026-09-06T07:00:00.000Z",
                timeZone: "America/Los_Angeles",
                utcOffsetSeconds: -25_200
            ),
            activity: .init(
                metrics: [
                    "move_calories": .init(value: 500, unit: "kcal"),
                    "exercise_minutes": .init(value: 30, unit: "min"),
                    "stand_hours": .init(value: 10, unit: "h"),
                    "steps": .init(value: 9_876, unit: "count"),
                    "walking_running_distance": .init(value: 7_654, unit: "m"),
                    "flights_climbed": .init(value: 8, unit: "count"),
                ],
                coverage: "complete_day",
                sourceRevision: 1,
                aggregationScope: "daily_total_including_workouts",
                workoutActiveCaloriesAdditive: false
            ),
            source: .init(
                bundleIdentifier: "com.apple.Health",
                sourceName: "Apple Health",
                sourceRevision: "watchOS-13",
                productType: "Watch",
                privacySafeDeviceProvenance: "Apple/Watch"
            ),
            deliveryDeviceId: "founder-device-stable",
            reconciliation: .init(
                state: "validation_only_raw",
                reason: "validation_only_permanent_canonical_bar",
                canonicalized: false,
                canonicalizationPermanentBar: true
            ),
            evidenceEligibility: "not_assessed"
        )
    }
}

@MainActor
private final class CanaryAuthorizationMock: HealthKitCanaryAuthorizationCoordinating {
    var currentAvailability: HealthKitAvailability = .availableAuthorizationNotRequested
    private(set) var authorizationWasRequested = false
    private(set) var requestCount = 0

    func requestAuthorization(for scope: HealthKitAuthorizationScope) async -> HealthKitAuthorizationOutcome {
        requestCount += 1
        authorizationWasRequested = true
        currentAvailability = .available
        return .completed
    }
}

private actor CanarySynchronizerMock: HealthKitActivityCanarySynchronizing {
    private var capturedScopes: [HealthKitCursorScope] = []

    func synchronizeActivityValidation(
        scope: HealthKitCursorScope,
        window: HealthKitActivityValidationWindow,
        calendar: Calendar
    ) async throws -> HealthKitCanarySyncSummary {
        capturedScopes.append(scope)
        return .init(
            batchIdentity: "healthkit_batch_validation",
            additionsDiscovered: 1,
            deletionsDiscovered: 0,
            additionsFilteredByWindow: 0,
            deletionsFilteredByWindow: 0,
            resumedPendingBatch: false
        )
    }

    func diagnostics(scope: HealthKitCursorScope) async throws -> HealthKitStreamDiagnostics {
        .init(
            enabled: true,
            availability: .available,
            authorizationState: "available_without_read_denial_inference",
            lastObserverWakeup: nil,
            lastSuccessfulAnchoredQuery: HealthKitFounderCanaryTests.now,
            cursorGeneration: 1,
            cursorDigest: "digest",
            pendingBatchCount: 0,
            lastUploadAttempt: HealthKitFounderCanaryTests.now,
            lastDurableAcknowledgement: HealthKitFounderCanaryTests.now,
            lastErrorCode: nil,
            boundedRecoveryCount: 0
        )
    }

    func syncCount() -> Int { capturedScopes.count }
    func scopes() -> [HealthKitCursorScope] { capturedScopes }
}

private actor CanaryServerMock: HealthKitFounderCanaryServer {
    private let contract: HealthKitCanaryServerContract
    private let diagnostic: HealthKitActivityCanaryDiagnostic
    private var reads = 0

    init(
        contract: HealthKitCanaryServerContract = .init(
            commandType: HealthKitServerIngestionContract.commandType,
            contractVersion: HealthKitServerIngestionContract.contractVersion,
            maximumBatchSize: HealthKitServerIngestionContract.maximumObservationsPerBatch,
            observationTypes: ["activity_summary", "workout", "quantity_sample"],
            ingestionPurposes: ["operational", "validation_only"],
            diagnosticEndpoint: HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint
        ),
        diagnostic: HealthKitActivityCanaryDiagnostic = HealthKitFounderCanaryTests.diagnostic()
    ) {
        self.contract = contract
        self.diagnostic = diagnostic
    }

    func healthKitCanaryContract() async throws -> HealthKitCanaryServerContract { contract }
    func founderOwnerIdentity() async throws -> String { "user_founder_001" }
    func healthKitActivityValidation(startDate: String, endDate: String) async throws -> HealthKitActivityCanaryDiagnostic {
        reads += 1
        return diagnostic
    }
    func readCount() -> Int { reads }
}

private struct CanaryDeviceIdentityStore: HealthKitCanaryDeviceIdentityStore {
    func stableIdentity() throws -> String { "founder-device-stable" }
}

@MainActor
private struct CanaryCoordinatorHarness {
    let authorization: CanaryAuthorizationMock
    let synchronizer: CanarySynchronizerMock
    let server: CanaryServerMock
    let coordinator: HealthKitFounderCanaryCoordinator

    init(server: CanaryServerMock = CanaryServerMock()) {
        let authorization = CanaryAuthorizationMock()
        let synchronizer = CanarySynchronizerMock()
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.server = server
        self.coordinator = HealthKitFounderCanaryCoordinator(
            authorization: authorization,
            synchronizer: synchronizer,
            server: server,
            deviceIdentityStore: CanaryDeviceIdentityStore(),
            calendar: HealthKitFounderCanaryTests.calendar,
            now: { HealthKitFounderCanaryTests.now }
        )
    }
}

private actor CanaryQueryMock: HealthKitAnchoredQueryClient {
    private var result: HealthKitAnchoredQueryResult
    private var capturedBounds: [HealthKitQueryBounds?] = []

    init(result: HealthKitAnchoredQueryResult) { self.result = result }

    func execute(
        stream: HealthKitSynchronizationStream,
        after anchorData: Data?,
        bounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult {
        capturedBounds.append(bounds)
        return result
    }

    func bounds() -> [HealthKitQueryBounds?] { capturedBounds }
    func callCount() -> Int { capturedBounds.count }
}

private final class CanaryObserverMock: HealthKitObserverClient, @unchecked Sendable {
    func register(
        stream: HealthKitSynchronizationStream,
        onWake: @escaping @Sendable (String?, @escaping @Sendable () -> Void) -> Void
    ) throws -> HealthKitObserverRegistration { .init(id: UUID()) }
    func unregister(_ registration: HealthKitObserverRegistration) {}
    func enableBackgroundDelivery(for stream: HealthKitSynchronizationStream) async throws {
        XCTFail("Canary must not enable background delivery")
    }
}

private actor CanaryUploaderMock: HealthKitObservationUploader {
    enum Mode { case accept, transient }
    private var modes: [Mode]
    private var received: [HealthKitStagedPartition] = []

    init(modes: [Mode]) { self.modes = modes }

    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult {
        received.append(partition)
        let mode = modes.isEmpty ? .accept : modes.removeFirst()
        switch mode {
        case .accept:
            return .durablyAccepted(batchID: partition.identity, receiptIdentity: "receipt")
        case .transient:
            return .transientFailure(code: "lost_acknowledgement")
        }
    }

    func partitions() -> [HealthKitStagedPartition] { received }
    func identities() -> [String] { received.map(\.identity) }
}

private final class CanaryEngineHarness {
    let root: URL
    let scope: HealthKitCursorScope
    let store: FileHealthKitSynchronizationStore
    let query: CanaryQueryMock
    let uploader: CanaryUploaderMock
    let engine: HealthKitSynchronizationEngine

    init(
        additions: [HealthKitQueryAddition],
        uploadModes: [CanaryUploaderMock.Mode] = [.accept]
    ) throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSFounderCanaryTests-\(UUID().uuidString)", isDirectory: true)
        scope = HealthKitFounderCanaryTests.scope(window: HealthKitFounderCanaryTests.window())
        store = FileHealthKitSynchronizationStore(root: root)
        query = CanaryQueryMock(result: .init(
            additions: additions,
            deletions: [],
            proposedAnchorData: Data("private-device-anchor".utf8),
            completedAt: HealthKitFounderCanaryTests.now
        ))
        uploader = CanaryUploaderMock(modes: uploadModes)
        engine = HealthKitSynchronizationEngine(
            queryClient: query,
            observerClient: CanaryObserverMock(),
            store: store,
            uploader: uploader,
            featureGate: .founderActivityValidation,
            now: { HealthKitFounderCanaryTests.now }
        )
    }

    deinit { try? FileManager.default.removeItem(at: root) }
}

@MainActor
private func XCTAssertThrowsCanaryError<T>(
    _ expected: HealthKitCanaryError,
    expression: () async throws -> T,
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        _ = try await expression()
        XCTFail("Expected \(expected)", file: file, line: line)
    } catch let error as HealthKitCanaryError {
        XCTAssertEqual(error, expected, file: file, line: line)
    } catch {
        XCTFail("Unexpected error: \(error)", file: file, line: line)
    }
}

// MARK: - Controlled canonical test day (Activity + Nutrition)

final class HealthKitCanonicalTestDayTests: XCTestCase {
    private static let now = HealthKitFounderCanaryTests.now // 2026-09-12T12:00:00Z = 05:00 PDT
    private static var calendar: Calendar { HealthKitFounderCanaryTests.calendar }

    // MARK: exact-day model

    func testTestDayIsOneExactRecentLocalDateNeverARangeOrFuture() throws {
        let today = try HealthKitCanonicalTestDay(localDate: "2026-09-11", now: Self.now, calendar: Self.calendar)
        XCTAssertEqual(today.window.startDate, "2026-09-11")
        XCTAssertEqual(today.window.endDate, "2026-09-11")
        XCTAssertEqual(today.predicateVersion, "healthkit-canonical-testday-v1:2026-09-11")
        XCTAssertTrue(today.isProvisional(now: Self.now, calendar: Self.calendar))
        XCTAssertEqual(today.streams, [.activitySummary, .nutritionDailyTotal])
        XCTAssertNoThrow(try HealthKitCanonicalTestDay(localDate: "2026-09-10", now: Self.now, calendar: Self.calendar))
        XCTAssertNoThrow(try HealthKitCanonicalTestDay(localDate: "2026-09-08", now: Self.now, calendar: Self.calendar))
        for invalid in ["2026-09-07", "2026-09-12", "2026-02-31", "", "2026-9-11"] {
            XCTAssertThrowsError(try HealthKitCanonicalTestDay(localDate: invalid, now: Self.now, calendar: Self.calendar), invalid)
        }
    }

    func testNutritionDailyTotalStreamIsDeliverableNutritionDomainAndNotAPerSampleStream() {
        XCTAssertEqual(HealthKitSynchronizationStream.nutritionDailyTotal.deliveryCapability, .s1(observationType: .nutritionDailyTotal))
        XCTAssertEqual(HealthKitSynchronizationStream.nutritionDailyTotal.domain, .nutrition)
        XCTAssertEqual(HealthKitS1ObservationType.nutritionDailyTotal.rawValue, "nutrition_daily_total")
        XCTAssertEqual(HealthKitSynchronizationStream.nutritionEnergy.deliveryCapability, .s1(observationType: .quantitySample))
    }

    // MARK: snapshot rules

    func testSnapshotEmitsCaloriesProteinCarbsFatOnlyWithPartialCoverageForToday() throws {
        let output = try Self.build(energy: ["2026-09-11": 1800], protein: ["2026-09-11": 150], carbs: ["2026-09-11": 180], fat: ["2026-09-11": 55])
        let addition = try XCTUnwrap(output.additions.first)
        guard case let .nutritionDailyTotal(total) = addition.payload else { return XCTFail("Expected nutrition daily total") }
        XCTAssertEqual(total.dailyNutrition, ["calories": 1800, "protein_g": 150, "carbs_g": 180, "fat_g": 55])
        XCTAssertTrue(Set(total.dailyNutrition.keys).isSubset(of: HealthKitQueryNutritionDailyTotal.permittedKeys))
        XCTAssertEqual(total.coverage, .partialDay)
        XCTAssertEqual(total.sourceRevision, 1)
        XCTAssertEqual(total.aggregationScope, "daily_total_all_sources")
        XCTAssertEqual(addition.occurrence.localDate, "2026-09-11")
        XCTAssertNil(addition.occurrence.startedAt)
        XCTAssertNil(addition.healthKitUUID)
    }

    func testSnapshotCompletedDayIsCompleteAndAbsentMacrosAreOmittedNotAssertedAsZero() throws {
        let output = try Self.build(energy: ["2026-09-10": 2400], protein: [:], carbs: [:], fat: [:], start: "2026-09-10", end: "2026-09-10")
        guard case let .nutritionDailyTotal(total) = try XCTUnwrap(output.additions.first).payload else { return XCTFail("Expected nutrition daily total") }
        XCTAssertEqual(total.coverage, .completeDay)
        XCTAssertEqual(total.dailyNutrition, ["calories": 2400])
    }

    func testPartialDayBecomingCompleteWithIdenticalNumbersIsANewRevision() throws {
        let evening = try Self.build(energy: ["2026-09-11": 2400], protein: ["2026-09-11": 200], carbs: [:], fat: [:])
        guard case let .nutritionDailyTotal(first) = try XCTUnwrap(evening.additions.first).payload else { return XCTFail("Expected first revision") }
        XCTAssertEqual(first.coverage, .partialDay)
        XCTAssertEqual(first.sourceRevision, 1)
        // Next morning: identical totals, but the day is now complete.
        let nextMorning = Date(timeIntervalSince1970: HealthKitFounderCanaryTests.now.timeIntervalSince1970 + 86_400)
        let complete = try Self.build(energy: ["2026-09-11": 2400], protein: ["2026-09-11": 200], carbs: [:], fat: [:], prior: evening.cursor, now: nextMorning)
        guard case let .nutritionDailyTotal(second) = try XCTUnwrap(complete.additions.first).payload else { return XCTFail("Coverage change must emit a revision") }
        XCTAssertEqual(second.coverage, .completeDay)
        XCTAssertEqual(second.sourceRevision, 2)
        XCTAssertEqual(second.dailyNutrition, first.dailyNutrition)
        // And once complete, an unchanged repeat is silent again.
        let repeatRun = try Self.build(energy: ["2026-09-11": 2400], protein: ["2026-09-11": 200], carbs: [:], fat: [:], prior: complete.cursor, now: nextMorning)
        XCTAssertTrue(repeatRun.additions.isEmpty)
    }

    func testSnapshotIsIdempotentAndAdvancesRevisionOnlyWhenTheDayChanges() throws {
        let first = try Self.build(energy: ["2026-09-11": 1800], protein: ["2026-09-11": 150], carbs: [:], fat: [:])
        XCTAssertEqual(first.additions.count, 1)
        let unchanged = try Self.build(energy: ["2026-09-11": 1800], protein: ["2026-09-11": 150], carbs: [:], fat: [:], prior: first.cursor)
        XCTAssertTrue(unchanged.additions.isEmpty)
        XCTAssertEqual(unchanged.cursor, first.cursor)
        let changed = try Self.build(energy: ["2026-09-11": 2100], protein: ["2026-09-11": 170], carbs: [:], fat: [:], prior: first.cursor)
        guard case let .nutritionDailyTotal(total) = try XCTUnwrap(changed.additions.first).payload else { return XCTFail("Expected nutrition daily total") }
        XCTAssertEqual(total.sourceRevision, 2)
        XCTAssertEqual(total.dailyNutrition["calories"], 2100)
    }

    func testEmptyDayWithNoPriorUploadEmitsNothingButPreviouslyUploadedDayBecomesZeroRevision() throws {
        let empty = try Self.build(energy: [:], protein: [:], carbs: [:], fat: [:])
        XCTAssertTrue(empty.additions.isEmpty)
        XCTAssertTrue(empty.cursor.entries.isEmpty)

        let first = try Self.build(energy: ["2026-09-11": 900], protein: [:], carbs: [:], fat: [:])
        let cleared = try Self.build(energy: [:], protein: [:], carbs: [:], fat: [:], prior: first.cursor)
        guard case let .nutritionDailyTotal(total) = try XCTUnwrap(cleared.additions.first).payload else { return XCTFail("Expected zero revision") }
        XCTAssertEqual(total.dailyNutrition, ["calories": 0])
        XCTAssertEqual(total.sourceRevision, 2)
    }

    func testSnapshotIgnoresDaysOutsideTheBounds() throws {
        let output = try Self.build(energy: ["2026-09-10": 2000, "2026-09-12": 300], protein: [:], carbs: [:], fat: [:])
        XCTAssertTrue(output.additions.isEmpty)
    }

    // MARK: wire contract

    func testWirePayloadCarriesNutritionDailyTotalOperationalWithNoMealsOrStrategicFields() throws {
        let output = try Self.build(energy: ["2026-09-11": 1800], protein: ["2026-09-11": 150], carbs: ["2026-09-11": 180], fat: ["2026-09-11": 55])
        let scope = Self.scope(.nutritionDailyTotal, "2026-09-11")
        let batch = try HealthKitBatchBuilder().build(
            scope: scope,
            previousCursor: nil,
            queryResult: .init(additions: output.additions, deletions: [], proposedAnchorData: try output.encodedCursor(), completedAt: Self.now),
            createdAt: Self.now,
            ingestionPurpose: .operational
        )
        let partition = try XCTUnwrap(batch.partitions.first)
        XCTAssertEqual(partition.ingestionPurpose, .operational)
        let encoded = try JSONEncoder().encode(try HealthKitS1WireMapper.payload(for: partition))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        let observation = try XCTUnwrap((root["observations"] as? [[String: Any]])?.first)
        XCTAssertEqual(observation["observationType"] as? String, "nutrition_daily_total")
        XCTAssertEqual(observation["externalId"] as? String, "nutrition-daily-total:testday:2026-09-11")
        XCTAssertEqual(observation["ingestionPurpose"] as? String, "operational")
        let total = try XCTUnwrap(observation["nutritionDailyTotal"] as? [String: Any])
        XCTAssertEqual(total["aggregationScope"] as? String, "daily_total_all_sources")
        XCTAssertEqual(total["coverage"] as? String, "partial_day")
        XCTAssertEqual(total["sourceRevision"] as? Int, 1)
        XCTAssertEqual(Set(try XCTUnwrap(total["dailyNutrition"] as? [String: Double]).keys), ["calories", "protein_g", "carbs_g", "fat_g"])
        XCTAssertNil(observation["activitySummary"])
        XCTAssertNil(observation["quantitySample"])
        let text = String(decoding: encoded, as: UTF8.self)
        for forbidden in ["meals", "Meal", "opaqueAnchor", "Confidence", "Narrative", "Goal", "Strategy", "coaching", "fiber"] {
            XCTAssertFalse(text.contains(forbidden), "Wire payload contained forbidden field: \(forbidden)")
        }
    }

    func testWireMapperRefusesNutritionWithUnlistedKeysMissingCaloriesOrNegativeValues() throws {
        func addition(_ nutrition: [String: Double], scope: String = "daily_total_all_sources", revision: UInt64 = 1) -> NormalizedHealthKitObservation {
            var value = Self.rawAddition()
            value = HealthKitQueryAddition(
                healthKitUUID: nil,
                objectTypeIdentifier: value.objectTypeIdentifier,
                source: value.source,
                occurrence: value.occurrence,
                payload: .nutritionDailyTotal(.init(dailyNutrition: nutrition, aggregationScope: scope, coverage: .completeDay, sourceRevision: revision)),
                allowlistedMetadata: [:]
            )
            return HealthKitObservationNormalizer().normalize(value)
        }
        XCTAssertTrue(HealthKitS1WireMapper.canDeliver(addition(["calories": 1, "protein_g": 1, "carbs_g": 1, "fat_g": 1])))
        XCTAssertFalse(HealthKitS1WireMapper.canDeliver(addition(["calories": 1, "fiber_g": 3])))
        XCTAssertFalse(HealthKitS1WireMapper.canDeliver(addition(["protein_g": 10])))
        XCTAssertFalse(HealthKitS1WireMapper.canDeliver(addition(["calories": -1])))
        XCTAssertFalse(HealthKitS1WireMapper.canDeliver(addition(["calories": 1], scope: "single_source")))
        XCTAssertFalse(HealthKitS1WireMapper.canDeliver(addition(["calories": 1], revision: 0)))
    }

    // MARK: engine

    func testEngineUploadsOperationalExactDayOnlyAndDropsDeletions() async throws {
        let testDay = try Self.testDay()
        let harness = try CanonicalEngineHarness(
            stream: .activitySummary,
            testDay: testDay,
            additions: [
                Self.rawAddition(localDate: "2026-09-10"),
                Self.rawAddition(localDate: "2026-09-11"),
                Self.rawAddition(localDate: "2026-09-12"),
            ],
            deletions: [.init(healthKitUUID: UUID(), immutableExternalID: "activity-summary:2026-09-11", objectTypeIdentifier: "HKActivitySummaryType")]
        )
        let summary = try await harness.engine.synchronizeCanonicalTestDay(scope: harness.scope, testDay: testDay, calendar: Self.calendar)
        let partitions = await harness.uploader.partitions()
        let bounds = await harness.query.bounds()
        XCTAssertEqual(summary.additionsDiscovered, 3)
        XCTAssertEqual(summary.additionsFilteredByWindow, 2)
        XCTAssertEqual(summary.deletionsFilteredByWindow, 1)
        XCTAssertEqual(partitions.count, 1)
        XCTAssertEqual(partitions[0].ingestionPurpose, .operational)
        XCTAssertEqual(partitions[0].additions.map(\.occurrence.localDate), ["2026-09-11"])
        XCTAssertTrue(partitions[0].deletions.isEmpty)
        XCTAssertEqual(bounds.count, 1)
        XCTAssertEqual(bounds[0]?.startLocalDate, "2026-09-11")
        XCTAssertEqual(bounds[0]?.endLocalDate, "2026-09-11")
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor)
    }

    func testEngineRefusesAScopeThatIsNotBoundToTheTestDayOrAnUnsupportedStream() async throws {
        let testDay = try Self.testDay()
        let harness = try CanonicalEngineHarness(stream: .activitySummary, testDay: testDay, additions: [Self.rawAddition()])
        let wrongDate = HealthKitCursorScope(ownerIdentity: "o", enrolledDeviceIdentity: "d", stream: .activitySummary, predicateVersion: "healthkit-canonical-testday-v1:2026-09-10")
        let wrongStream = HealthKitCursorScope(ownerIdentity: "o", enrolledDeviceIdentity: "d", stream: .workouts, predicateVersion: testDay.predicateVersion)
        let validationScope = HealthKitCursorScope(ownerIdentity: "o", enrolledDeviceIdentity: "d", stream: .activitySummary, predicateVersion: HealthKitFounderCanaryTests.window().predicateVersion)
        for scope in [wrongDate, wrongStream, validationScope] {
            do {
                _ = try await harness.engine.synchronizeCanonicalTestDay(scope: scope, testDay: testDay, calendar: Self.calendar)
                XCTFail("Expected refusal for \(scope.predicateVersion)")
            } catch {
                XCTAssertEqual(error as? HealthKitSyncError, .ownerOrDeviceMismatch)
            }
        }
        let calls = await harness.query.callCount()
        XCTAssertEqual(calls, 0)
    }

    func testLostAcknowledgementReplaysTheExactOperationalPartitionWithoutRequery() async throws {
        let testDay = try Self.testDay()
        let harness = try CanonicalEngineHarness(
            stream: .nutritionDailyTotal, testDay: testDay,
            additions: [Self.rawAddition(stream: .nutritionDailyTotal)],
            uploadModes: [.transient, .accept]
        )
        _ = try await harness.engine.synchronizeCanonicalTestDay(scope: harness.scope, testDay: testDay, calendar: Self.calendar)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(pending.first?.ingestionPurpose, .operational)
        let replay = try await harness.engine.synchronizeCanonicalTestDay(scope: harness.scope, testDay: testDay, calendar: Self.calendar)
        let identities = await harness.uploader.identities()
        XCTAssertTrue(replay.resumedPendingBatch)
        XCTAssertEqual(identities.count, 2)
        XCTAssertEqual(identities[0], identities[1])
        let queryCount = await harness.query.callCount()
        XCTAssertEqual(queryCount, 1)
    }

    func testAPendingValidationOnlyBatchIsNeverResumedAsOperational() async throws {
        let testDay = try Self.testDay()
        let harness = try CanonicalEngineHarness(stream: .activitySummary, testDay: testDay, additions: [Self.rawAddition()])
        let batch = try HealthKitBatchBuilder().build(
            scope: harness.scope,
            previousCursor: nil,
            queryResult: .init(additions: [Self.rawAddition()], deletions: [], proposedAnchorData: Data("a".utf8), completedAt: Self.now),
            createdAt: Self.now,
            ingestionPurpose: .validationOnly
        )
        try await harness.store.stage(batch)
        do {
            _ = try await harness.engine.synchronizeCanonicalTestDay(scope: harness.scope, testDay: testDay, calendar: Self.calendar)
            XCTFail("A validation-only batch must never be uploaded as operational")
        } catch {
            XCTAssertEqual(error as? HealthKitSyncError, .ownerOrDeviceMismatch)
        }
        let uploads = await harness.uploader.partitions()
        XCTAssertTrue(uploads.isEmpty)
    }

    func testTestDayIdentitiesNeverShareAnExternalIdWithTheValidationCanary() throws {
        let addition = Self.rawAddition(localDate: "2026-09-11")
        let testDayBatch = try HealthKitBatchBuilder().build(
            scope: Self.scope(.activitySummary, "2026-09-11"), previousCursor: nil,
            queryResult: .init(additions: [addition], deletions: [], proposedAnchorData: Data("a".utf8), completedAt: Self.now),
            createdAt: Self.now, ingestionPurpose: .operational
        )
        let validationBatch = try HealthKitBatchBuilder().build(
            scope: HealthKitFounderCanaryTests.scope(window: HealthKitFounderCanaryTests.window()), previousCursor: nil,
            queryResult: .init(additions: [addition], deletions: [], proposedAnchorData: Data("a".utf8), completedAt: Self.now),
            createdAt: Self.now, ingestionPurpose: .validationOnly
        )
        XCTAssertEqual(testDayBatch.partitions.first?.additions.first?.immutableExternalID, "activity-summary:testday:2026-09-11")
        XCTAssertEqual(validationBatch.partitions.first?.additions.first?.immutableExternalID, "activity-summary:2026-09-11")
    }

    func testTheLedgerReportsWhatTheServerCanonicalizedVersusDeferred() {
        let ledger = HealthKitCanonicalizationLedger()
        ledger.record([
            .init(observationType: "activity_summary", outcome: "created", reconciliationState: "activity_day_canonicalized", reason: nil, occurredAt: "2026-09-11"),
            .init(observationType: "nutrition_daily_total", outcome: "created", reconciliationState: "nutrition_canonicalization_deferred", reason: "canonicalization_not_activated", occurredAt: "2026-09-11"),
        ])
        let reports = ledger.reports()
        XCTAssertEqual(reports.filter(\.wasCanonicalized).map(\.observationType), ["activity_summary"])
        XCTAssertEqual(reports.last?.reason, "canonicalization_not_activated")
        ledger.reset()
        XCTAssertTrue(ledger.reports().isEmpty)
    }

    // MARK: coordinator

    @MainActor
    func testCoordinatorRunsActivityThenNutritionBoundToTheTestDayAfterExplicitEnableAndAuthorization() async throws {
        let harness = CanonicalCoordinatorHarness()
        let testDay = try Self.testDay()
        await XCTAssertThrowsCanaryError(.disabled) { _ = try await harness.coordinator.synchronizeCanonicalTestDay(testDay) }
        harness.coordinator.setEnabled(true)
        await XCTAssertThrowsCanaryError(.authorizationRequired) { _ = try await harness.coordinator.synchronizeCanonicalTestDay(testDay) }
        let untouched = await harness.synchronizer.scopes()
        XCTAssertTrue(untouched.isEmpty)

        _ = await harness.coordinator.requestAuthorization()
        let result = try await harness.coordinator.synchronizeCanonicalTestDay(testDay)
        let scopes = await harness.synchronizer.scopes()
        XCTAssertEqual(scopes.map(\.stream), [.activitySummary, .nutritionDailyTotal])
        XCTAssertTrue(scopes.allSatisfy { $0.predicateVersion == testDay.predicateVersion })
        XCTAssertTrue(scopes.allSatisfy { $0.ownerIdentity == "user_founder_001" && $0.enrolledDeviceIdentity == "founder-device-stable" })
        XCTAssertTrue(result.endDateIsProvisional)
        XCTAssertEqual(result.testDay, testDay)
    }

    @MainActor
    func testCoordinatorFailsClosedWithoutTheServerCanonicalContractOrACapableSynchronizer() async throws {
        let testDay = try Self.testDay()
        // Server without the canonical contract (an older Server).
        let old = CanonicalCoordinatorHarness(supportsCanonical: false)
        old.coordinator.setEnabled(true)
        _ = await old.coordinator.requestAuthorization()
        await XCTAssertThrowsCanaryError(.canonicalTestDayUnsupported) { _ = try await old.coordinator.synchronizeCanonicalTestDay(testDay) }
        let oldScopes = await old.synchronizer.scopes()
        XCTAssertTrue(oldScopes.isEmpty)

        // The original validation-only synchronizer cannot perform the operational path.
        let base = CanaryCoordinatorHarness()
        base.coordinator.setEnabled(true)
        _ = await base.coordinator.requestAuthorization()
        await XCTAssertThrowsCanaryError(.canonicalTestDayUnsupported) { _ = try await base.coordinator.synchronizeCanonicalTestDay(testDay) }
        let baseCount = await base.synchronizer.syncCount()
        XCTAssertEqual(baseCount, 0)
    }

    func testTheOriginalThreeTypeContractStillPassesTheValidationCanaryCompatibilityCheck() {
        let contract = HealthKitCanaryServerContract(
            commandType: HealthKitServerIngestionContract.commandType,
            contractVersion: HealthKitServerIngestionContract.contractVersion,
            maximumBatchSize: HealthKitServerIngestionContract.maximumObservationsPerBatch,
            observationTypes: ["activity_summary", "workout", "quantity_sample"],
            ingestionPurposes: ["operational", "validation_only"],
            diagnosticEndpoint: HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint,
            additionalObservationTypes: ["nutrition_daily_total"],
            hasCanonicalDailyActivation: true
        )
        XCTAssertTrue(contract.isCompatible)
        XCTAssertTrue(contract.supportsCanonicalTestDay)
    }

    // MARK: helpers

    private static func testDay() throws -> HealthKitCanonicalTestDay {
        try HealthKitCanonicalTestDay(localDate: "2026-09-11", now: now, calendar: calendar)
    }

    fileprivate static func scope(_ stream: HealthKitSynchronizationStream, _ date: String) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "user_founder_001",
            enrolledDeviceIdentity: "founder-device-stable",
            stream: stream,
            predicateVersion: "healthkit-canonical-testday-v1:\(date)"
        )
    }

    private static func build(
        energy: [String: Double], protein: [String: Double], carbs: [String: Double], fat: [String: Double],
        prior: HealthKitNutritionDailySnapshotBuilder.Cursor = .init(entries: [:]),
        start: String = "2026-09-11", end: String = "2026-09-11",
        now: Date = HealthKitFounderCanaryTests.now
    ) throws -> HealthKitNutritionDailySnapshotBuilder.Output {
        let window = try HealthKitActivityValidationWindow(startDate: start, endDate: end)
        return try HealthKitNutritionDailySnapshotBuilder.build(
            energy: energy, protein: protein, carbohydrates: carbs, fat: fat, prior: prior,
            bounds: try window.queryBounds(calendar: calendar), calendar: calendar, now: now
        )
    }

    fileprivate static func rawAddition(
        localDate: String = "2026-09-11",
        stream: HealthKitSynchronizationStream = .activitySummary
    ) -> HealthKitQueryAddition {
        let day = Int(localDate.suffix(2))!
        let start = calendar.date(from: DateComponents(year: 2026, month: 9, day: day))!
        let payload: HealthKitQueryPayload = stream == .nutritionDailyTotal
            ? .nutritionDailyTotal(.init(
                dailyNutrition: ["calories": 1800, "protein_g": 150, "carbs_g": 180, "fat_g": 55],
                aggregationScope: "daily_total_all_sources", coverage: .partialDay, sourceRevision: 1))
            : .activitySummary(.init(
                dailyActivity: ["move_calories": 600, "exercise_minutes": 30, "stand_hours": 10],
                aggregationScope: "daily_total_including_workouts", coverage: .partialDay, sourceRevision: 1))
        return HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: stream.objectTypeIdentifier,
            source: .init(bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil, productType: nil, privacySafeDeviceProvenance: nil),
            occurrence: .init(
                startedAt: nil, endedAt: nil, localDate: localDate, calendarIdentifier: "gregorian",
                timeZoneIdentifier: calendar.timeZone.identifier, utcOffsetSeconds: calendar.timeZone.secondsFromGMT(for: start),
                localDayStartedAt: start, localDayEndedAt: calendar.date(byAdding: .day, value: 1, to: start)!
            ),
            payload: payload,
            allowlistedMetadata: [:]
        )
    }
}

private final class CanonicalEngineHarness {
    let root: URL
    let scope: HealthKitCursorScope
    let store: FileHealthKitSynchronizationStore
    let query: CanaryQueryMock
    let uploader: CanaryUploaderMock
    let engine: HealthKitSynchronizationEngine

    init(
        stream: HealthKitSynchronizationStream,
        testDay: HealthKitCanonicalTestDay,
        additions: [HealthKitQueryAddition],
        deletions: [HealthKitQueryDeletion] = [],
        uploadModes: [CanaryUploaderMock.Mode] = [.accept]
    ) throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSCanonicalTestDayTests-\(UUID().uuidString)", isDirectory: true)
        scope = HealthKitCursorScope(
            ownerIdentity: "user_founder_001",
            enrolledDeviceIdentity: "founder-device-stable",
            stream: stream,
            predicateVersion: testDay.predicateVersion
        )
        store = FileHealthKitSynchronizationStore(root: root)
        query = CanaryQueryMock(result: .init(
            additions: additions,
            deletions: deletions,
            proposedAnchorData: Data("private-device-anchor".utf8),
            completedAt: HealthKitFounderCanaryTests.now
        ))
        uploader = CanaryUploaderMock(modes: uploadModes)
        engine = HealthKitSynchronizationEngine(
            queryClient: query,
            observerClient: CanaryObserverMock(),
            store: store,
            uploader: uploader,
            featureGate: .founderActivityValidation,
            now: { HealthKitFounderCanaryTests.now }
        )
    }

    deinit { try? FileManager.default.removeItem(at: root) }
}

private actor CanonicalSynchronizerMock: HealthKitCanonicalTestDaySynchronizing {
    private var capturedScopes: [HealthKitCursorScope] = []

    func synchronizeActivityValidation(
        scope: HealthKitCursorScope, window: HealthKitActivityValidationWindow, calendar: Calendar
    ) async throws -> HealthKitCanarySyncSummary {
        XCTFail("The canonical test day must not use the validation-only path")
        throw HealthKitSyncError.featureDisabled
    }

    func synchronizeCanonicalTestDay(
        scope: HealthKitCursorScope, testDay: HealthKitCanonicalTestDay, calendar: Calendar
    ) async throws -> HealthKitCanarySyncSummary {
        capturedScopes.append(scope)
        return .init(
            batchIdentity: "healthkit_batch_canonical", additionsDiscovered: 1, deletionsDiscovered: 0,
            additionsFilteredByWindow: 0, deletionsFilteredByWindow: 0, resumedPendingBatch: false
        )
    }

    func diagnostics(scope: HealthKitCursorScope) async throws -> HealthKitStreamDiagnostics {
        .init(
            enabled: true, availability: .available, authorizationState: "available_without_read_denial_inference",
            lastObserverWakeup: nil, lastSuccessfulAnchoredQuery: HealthKitFounderCanaryTests.now, cursorGeneration: 1,
            cursorDigest: "digest", pendingBatchCount: 0, lastUploadAttempt: HealthKitFounderCanaryTests.now,
            lastDurableAcknowledgement: HealthKitFounderCanaryTests.now, lastErrorCode: nil, boundedRecoveryCount: 0
        )
    }

    func scopes() -> [HealthKitCursorScope] { capturedScopes }
}

@MainActor
private struct CanonicalCoordinatorHarness {
    let authorization: CanaryAuthorizationMock
    let synchronizer: CanonicalSynchronizerMock
    let coordinator: HealthKitFounderCanaryCoordinator

    init(supportsCanonical: Bool = true) {
        let authorization = CanaryAuthorizationMock()
        let synchronizer = CanonicalSynchronizerMock()
        let contract = HealthKitCanaryServerContract(
            commandType: HealthKitServerIngestionContract.commandType,
            contractVersion: HealthKitServerIngestionContract.contractVersion,
            maximumBatchSize: HealthKitServerIngestionContract.maximumObservationsPerBatch,
            observationTypes: ["activity_summary", "workout", "quantity_sample"],
            ingestionPurposes: ["operational", "validation_only"],
            diagnosticEndpoint: HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint,
            additionalObservationTypes: supportsCanonical ? ["nutrition_daily_total"] : [],
            hasCanonicalDailyActivation: supportsCanonical
        )
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.coordinator = HealthKitFounderCanaryCoordinator(
            authorization: authorization,
            synchronizer: synchronizer,
            server: CanaryServerMock(contract: contract),
            deviceIdentityStore: CanaryDeviceIdentityStore(),
            calendar: HealthKitFounderCanaryTests.calendar,
            now: { HealthKitFounderCanaryTests.now }
        )
    }
}
