import Foundation
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
