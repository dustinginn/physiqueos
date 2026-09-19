import Foundation
import XCTest
@testable import PhysiqueOS

final class HealthKitSynchronizationTests: XCTestCase {
    func testObserverWakeRunsAnchoredQueryAndCompletesAfterStagingBeforeUpload() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled)
        let completion = CompletionProbe()
        await harness.uploader.setCompletionProbe(completion)

        await harness.engine.handleObserverWake(scope: harness.scope) {
            completion.markCompleted()
        }

        let queryCount = await harness.query.callCount()
        let uploadCount = await harness.uploader.receivedCount()
        let completedBeforeUpload = await harness.uploader.observedCompletionBeforeUpload()
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(queryCount, 1)
        XCTAssertEqual(uploadCount, 1)
        XCTAssertTrue(completedBeforeUpload)
        XCTAssertNotNil(cursor)
    }

    func testObserverRegistrationRoutesWakeupToTheStreamWorkflow() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled)
        try await harness.engine.startObserving(scope: harness.scope)
        let completed = expectation(description: "observer completion")
        try harness.observer.fire(stream: .activeEnergy) { completed.fulfill() }
        await fulfillment(of: [completed], timeout: 2)
        await eventually { await harness.query.callCount() == 1 }
        XCTAssertEqual(harness.observer.registrationCount, 1)
    }

    func testCursorDoesNotAdvanceBeforeDurableServerAcknowledgement() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, uploadModes: [.transient])
        try await harness.engine.synchronize(scope: harness.scope)

        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursor)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending[0].partitions[0].attemptCount, 1)
    }

    func testExactAcknowledgementAdvancesCursor() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled)
        try await harness.engine.synchronize(scope: harness.scope)

        let storedCursor = try await harness.store.authoritativeCursor(for: harness.scope)
        let cursor = try XCTUnwrap(storedCursor)
        XCTAssertEqual(cursor.opaqueAnchorData, Data("anchor-1".utf8))
        XCTAssertEqual(cursor.generation, 1)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertTrue(pending.isEmpty)
    }

    func testInvalidAcknowledgementCannotAdvanceCursor() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .queryOnly)
        try await harness.engine.synchronize(scope: harness.scope)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        let batch = try XCTUnwrap(pending.first)
        let partition = try XCTUnwrap(batch.partitions.first)

        await XCTAssertThrowsErrorAsync {
            try await harness.store.acknowledge(
                batchID: batch.identity,
                partitionID: partition.identity,
                acknowledgedBatchID: "different-batch",
                receiptIdentity: "receipt",
                at: Self.now
            )
        }
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursor)
    }

    func testLostAcknowledgementReplaysIdenticalPartitionIdentity() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, uploadModes: [.transient, .accept])
        try await harness.engine.synchronize(scope: harness.scope)
        try await harness.engine.resumePending(scope: harness.scope)

        let identities = await harness.uploader.receivedIdentities()
        XCTAssertEqual(identities.count, 2)
        XCTAssertEqual(identities[0], identities[1])
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor)
    }

    func testServerRejectionLeavesPriorCursorAuthoritative() async throws {
        let first = Self.quantityResult(anchor: "anchor-1", UUID(uuidString: "00000000-0000-0000-0000-000000000001")!)
        let second = Self.quantityResult(anchor: "anchor-2", UUID(uuidString: "00000000-0000-0000-0000-000000000002")!)
        let harness = try Harness(
            stream: .activeEnergy,
            gate: .enabled,
            queryResults: [first, second],
            uploadModes: [.accept, .reject]
        )
        try await harness.engine.synchronize(scope: harness.scope)
        let firstCursor = try await harness.store.authoritativeCursor(for: harness.scope)
        let accepted = try XCTUnwrap(firstCursor)
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }

        let cursorAfterRejection = try await harness.store.authoritativeCursor(for: harness.scope)
        let pendingAfterRejection = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(cursorAfterRejection, accepted)
        XCTAssertEqual(pendingAfterRejection.count, 1)
    }

    func testCrashAfterStagingRecoversPendingBatchFromProtectedFile() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .queryOnly)
        try await harness.engine.synchronize(scope: harness.scope)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        let staged = try XCTUnwrap(pending.first)

        let reopenedStore = FileHealthKitSynchronizationStore(root: harness.root)
        let uploader = MockUploader(modes: [.accept])
        let restarted = HealthKitSynchronizationEngine(
            queryClient: MockQueryClient(results: []),
            observerClient: MockObserverClient(),
            store: reopenedStore,
            uploader: uploader,
            featureGate: .enabled,
            now: { Self.now }
        )
        try await restarted.resumePending(scope: harness.scope)

        let uploadedIdentities = await uploader.receivedIdentities()
        let recoveredCursor = try await reopenedStore.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(uploadedIdentities, [staged.partitions[0].identity])
        XCTAssertNotNil(recoveredCursor)
    }

    func testCrashAfterUploadBeforeAcknowledgementReplaysStagedIdentity() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .queryOnly)
        try await harness.engine.synchronize(scope: harness.scope)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        let staged = try XCTUnwrap(pending.first)
        let partition = try XCTUnwrap(staged.partitions.first)
        try await harness.store.markUploadAttempt(
            batchID: staged.identity,
            partitionID: partition.identity,
            at: Self.now
        )

        let reopenedStore = FileHealthKitSynchronizationStore(root: harness.root)
        let uploader = MockUploader(modes: [.accept])
        let restarted = HealthKitSynchronizationEngine(
            queryClient: MockQueryClient(results: []), observerClient: MockObserverClient(),
            store: reopenedStore, uploader: uploader, featureGate: .enabled, now: { Self.now }
        )
        try await restarted.resumePending(scope: harness.scope)
        let uploadedIdentities = await uploader.receivedIdentities()
        XCTAssertEqual(uploadedIdentities, [partition.identity])
    }

    func testMoreThanOneHundredObservationsPartitionDeterministically() async throws {
        let additions = (0..<205).map { index in
            Self.quantityAddition(UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index + 1))!)
        }
        let result = HealthKitAnchoredQueryResult(
            additions: additions, deletions: [], proposedAnchorData: Data("large-anchor".utf8), completedAt: Self.now
        )
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, queryResults: [result])
        try await harness.engine.synchronize(scope: harness.scope)

        let sizes = await harness.uploader.receivedSizes()
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(sizes, [100, 100, 5])
        XCTAssertNotNil(cursor)
    }

    func testCursorWaitsForEveryRequiredPartition() async throws {
        let additions = (0..<101).map { index in
            Self.quantityAddition(UUID(uuidString: String(format: "10000000-0000-0000-0000-%012d", index + 1))!)
        }
        let result = HealthKitAnchoredQueryResult(
            additions: additions, deletions: [], proposedAnchorData: Data("partition-anchor".utf8), completedAt: Self.now
        )
        let harness = try Harness(
            stream: .activeEnergy, gate: .enabled, queryResults: [result], uploadModes: [.accept, .transient, .accept]
        )
        try await harness.engine.synchronize(scope: harness.scope)
        let cursorBeforeAllAcknowledgements = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursorBeforeAllAcknowledgements)

        try await harness.engine.resumePending(scope: harness.scope)
        let cursorAfterAllAcknowledgements = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursorAfterAllAcknowledgements)
    }

    func testDeterministicBatchIdentityAndDistinctUUIDs() throws {
        let additions = [
            Self.quantityAddition(UUID(uuidString: "20000000-0000-0000-0000-000000000001")!),
            Self.quantityAddition(UUID(uuidString: "20000000-0000-0000-0000-000000000002")!),
        ]
        let result = HealthKitAnchoredQueryResult(
            additions: additions, deletions: [], proposedAnchorData: Data("stable-anchor".utf8), completedAt: Self.now
        )
        let scope = Self.scope(.activeEnergy)
        let builder = HealthKitBatchBuilder()
        let first = try builder.build(scope: scope, previousCursor: nil, queryResult: result, createdAt: Self.now)
        let second = try builder.build(scope: scope, previousCursor: nil, queryResult: result, createdAt: Self.now.addingTimeInterval(50))

        XCTAssertEqual(first.identity, second.identity)
        XCTAssertEqual(first.partitions.map(\.identity), second.partitions.map(\.identity))
        XCTAssertEqual(Set(first.partitions[0].additions.map(\.immutableExternalID)).count, 2)
    }

    func testNutritionSourceStreamsRemainSeparateAndMissingMacrosAreNotZeroFilled() throws {
        let myFitnessPal = Self.quantityAddition(
            UUID(uuidString: "30000000-0000-0000-0000-000000000001")!,
            bundle: "com.myfitnesspal.mfp",
            type: HealthKitSynchronizationStream.nutritionProtein.objectTypeIdentifier,
            value: 42
        )
        let other = Self.quantityAddition(
            UUID(uuidString: "30000000-0000-0000-0000-000000000002")!,
            bundle: "com.example.nutrition",
            type: HealthKitSynchronizationStream.nutritionProtein.objectTypeIdentifier,
            value: 42
        )
        let result = HealthKitAnchoredQueryResult(
            additions: [myFitnessPal, other], deletions: [], proposedAnchorData: Data("nutrition".utf8), completedAt: Self.now
        )
        let batch = try HealthKitBatchBuilder().build(
            scope: Self.scope(.nutritionProtein), previousCursor: nil, queryResult: result, createdAt: Self.now
        )
        let observations = batch.partitions.flatMap(\.additions)
        XCTAssertEqual(observations.count, 2)
        XCTAssertEqual(Set(observations.map(\.source.bundleIdentifier)), ["com.myfitnesspal.mfp", "com.example.nutrition"])
        XCTAssertTrue(observations.allSatisfy {
            if case let .quantity(quantity) = $0.payload { return quantity.normalizedValue == 42 }
            return false
        })
    }

    func testActivityTotalIncludesWorkoutEnergyWithoutAddingWorkoutCalories() throws {
        let summary = Self.activitySummaryAddition(moveCalories: 500)
        let result = HealthKitAnchoredQueryResult(
            additions: [summary], deletions: [], proposedAnchorData: Data("activity".utf8), completedAt: Self.now
        )
        let batch = try HealthKitBatchBuilder().build(
            scope: Self.scope(.activitySummary), previousCursor: nil, queryResult: result, createdAt: Self.now
        )
        let observation = try XCTUnwrap(batch.partitions.first?.additions.first)
        guard case let .activitySummary(activity) = observation.payload else { return XCTFail("Expected summary") }
        XCTAssertEqual(activity.aggregationScope, "daily_total_including_workouts")
        XCTAssertEqual(activity.dailyActivity["move_calories"], 500)
    }

    func testWorkoutNormalizationPreservesSourceFactsWithoutTrainingMutationFields() throws {
        let workout = Self.workoutAddition()
        let normalized = HealthKitObservationNormalizer().normalize(workout)
        XCTAssertEqual(normalized.immutableExternalID, workout.healthKitUUID?.uuidString.lowercased())
        guard case let .workout(payload) = normalized.payload else { return XCTFail("Expected workout") }
        XCTAssertEqual(payload.activityType, "37")
        XCTAssertEqual(payload.telemetryTypeIdentifiers.count, 2)
        let encoded = String(data: try JSONEncoder().encode(normalized), encoding: .utf8) ?? ""
        XCTAssertFalse(encoded.contains("TrainingSession"))
        XCTAssertFalse(encoded.contains("sets"))
        XCTAssertFalse(encoded.contains("reps"))
    }

    func testSleepIsObservedAndDurablyDeferredWithoutServerDelivery() async throws {
        let result = HealthKitAnchoredQueryResult(
            additions: [Self.sleepAddition()], deletions: [], proposedAnchorData: Data("sleep-anchor".utf8), completedAt: Self.now
        )
        let harness = try Harness(stream: .sleepAnalysis, gate: .enabled, queryResults: [result])
        try await harness.engine.synchronize(scope: harness.scope)

        let queryCount = await harness.query.callCount()
        let uploadCount = await harness.uploader.receivedCount()
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        let deferred = try await harness.store.deferredChanges(for: harness.scope)
        XCTAssertEqual(queryCount, 1)
        XCTAssertEqual(uploadCount, 0)
        XCTAssertNotNil(cursor)
        XCTAssertEqual(deferred.first?.additions.count, 1)
    }

    func testDeletionSurvivesRestartAndDoesNotDeadlockCursor() async throws {
        let deletion = HealthKitQueryDeletion(
            healthKitUUID: UUID(uuidString: "40000000-0000-0000-0000-000000000001")!,
            immutableExternalID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.activeEnergy.objectTypeIdentifier
        )
        let result = HealthKitAnchoredQueryResult(
            additions: [], deletions: [deletion], proposedAnchorData: Data("delete-anchor".utf8), completedAt: Self.now
        )
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, queryResults: [result])
        try await harness.engine.synchronize(scope: harness.scope)
        let reopened = FileHealthKitSynchronizationStore(root: harness.root)

        let cursor = try await reopened.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor)
        let deferred = try await reopened.deferredChanges(for: harness.scope)
        XCTAssertEqual(deferred.first?.deletions.first?.healthKitUUID, deletion.healthKitUUID)
        let uploadCount = await harness.uploader.receivedCount()
        XCTAssertEqual(uploadCount, 0)
    }

    func testFeatureDisabledPerformsNoQueryUploadObserverOrBackgroundRegistration() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .n0Disabled)
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        await XCTAssertThrowsErrorAsync { try await harness.engine.startObserving(scope: harness.scope) }
        await XCTAssertThrowsErrorAsync { try await harness.engine.enableBackgroundDelivery(scope: harness.scope) }

        let queryCount = await harness.query.callCount()
        let uploadCount = await harness.uploader.receivedCount()
        XCTAssertEqual(queryCount, 0)
        XCTAssertEqual(uploadCount, 0)
        XCTAssertEqual(harness.observer.registrationCount, 0)
        XCTAssertEqual(harness.observer.backgroundEnableCount, 0)
    }

    func testOwnerAndDeviceScopesCannotReuseCursorOrPendingBatch() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .queryOnly)
        try await harness.engine.synchronize(scope: harness.scope)
        let otherOwner = HealthKitCursorScope(
            ownerIdentity: "owner-b", enrolledDeviceIdentity: harness.scope.enrolledDeviceIdentity,
            stream: .activeEnergy, predicateVersion: "healthkit-sync-v1"
        )
        let otherDevice = HealthKitCursorScope(
            ownerIdentity: harness.scope.ownerIdentity, enrolledDeviceIdentity: "device-b",
            stream: .activeEnergy, predicateVersion: "healthkit-sync-v1"
        )
        let otherOwnerPending = try await harness.store.pendingBatches(for: otherOwner)
        let otherDevicePending = try await harness.store.pendingBatches(for: otherDevice)
        let otherOwnerCursor = try await harness.store.authoritativeCursor(for: otherOwner)
        let otherDeviceCursor = try await harness.store.authoritativeCursor(for: otherDevice)
        XCTAssertTrue(otherOwnerPending.isEmpty)
        XCTAssertTrue(otherDevicePending.isEmpty)
        XCTAssertNil(otherOwnerCursor)
        XCTAssertNil(otherDeviceCursor)
    }

    func testCorruptCursorStateUsesOneBoundedFullRescanRecovery() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled)
        try await harness.engine.synchronize(scope: harness.scope)
        let url = await harness.store.stateFileURL(for: harness.scope)
        try Data("not-json".utf8).write(to: url, options: .atomic)

        let reopened = FileHealthKitSynchronizationStore(root: harness.root)
        let cursor = try await reopened.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursor)
        let diagnostics = try await reopened.diagnostics(for: harness.scope)
        XCTAssertEqual(diagnostics.boundedRecoveryCount, 1)
        XCTAssertEqual(diagnostics.lastErrorCode, "healthkit_cursor_corrupt_full_rescan_required")
    }

    func testDiagnosticsContainOnlyOperationalMetadata() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled)
        try await harness.engine.synchronize(scope: harness.scope)
        let diagnostics = try await harness.engine.diagnostics(scope: harness.scope)
        let encoded = String(data: try JSONEncoder().encode(diagnostics), encoding: .utf8) ?? ""
        XCTAssertTrue(diagnostics.enabled)
        XCTAssertFalse(encoded.contains("kilocalorie"))
        XCTAssertFalse(encoded.contains("source.bundle"))
        XCTAssertFalse(encoded.contains("500"))
    }

    fileprivate static let now = Date(timeIntervalSince1970: 1_800_000_000)

    private static func scope(_ stream: HealthKitSynchronizationStream) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: stream, predicateVersion: "healthkit-sync-v1"
        )
    }

    fileprivate static func quantityResult(anchor: String, _ uuid: UUID) -> HealthKitAnchoredQueryResult {
        HealthKitAnchoredQueryResult(
            additions: [quantityAddition(uuid)], deletions: [],
            proposedAnchorData: Data(anchor.utf8), completedAt: now
        )
    }

    private static func quantityAddition(
        _ uuid: UUID,
        bundle: String = "com.apple.Health",
        type: String = HealthKitSynchronizationStream.activeEnergy.objectTypeIdentifier,
        value: Double = 50
    ) -> HealthKitQueryAddition {
        HealthKitQueryAddition(
            healthKitUUID: uuid,
            objectTypeIdentifier: type,
            source: HealthKitQuerySource(
                bundleIdentifier: bundle, sourceName: "Source", sourceRevision: "1",
                productType: "Watch", privacySafeDeviceProvenance: "Apple/Watch"
            ),
            occurrence: occurrence(),
            payload: .quantity(HealthKitQueryQuantity(
                originalValue: value, originalUnit: "kcal", normalizedValue: value,
                normalizedUnit: "kcal", workoutExternalID: nil
            )),
            allowlistedMetadata: [:]
        )
    }

    private static func activitySummaryAddition(moveCalories: Double) -> HealthKitQueryAddition {
        HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil,
                productType: nil, privacySafeDeviceProvenance: nil
            ),
            occurrence: occurrence(),
            payload: .activitySummary(HealthKitQueryActivitySummary(
                dailyActivity: ["move_calories": moveCalories, "exercise_minutes": 30, "stand_hours": 10],
                aggregationScope: "daily_total_including_workouts", coverage: .completeDay, sourceRevision: 1
            )),
            allowlistedMetadata: [:]
        )
    }

    private static func workoutAddition() -> HealthKitQueryAddition {
        HealthKitQueryAddition(
            healthKitUUID: UUID(uuidString: "50000000-0000-0000-0000-000000000001")!,
            objectTypeIdentifier: HealthKitSynchronizationStream.workouts.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Watch", sourceRevision: "11",
                productType: "Watch", privacySafeDeviceProvenance: "Apple/Watch"
            ),
            occurrence: occurrence(),
            payload: .workout(HealthKitQueryWorkout(
                activityType: "37", durationSeconds: 3600, activeCalories: 300, totalCalories: 350,
                distance: nil, distanceUnit: nil, averageHeartRate: 125,
                telemetryTypeIdentifiers: ["heart-rate", "active-energy"]
            )),
            allowlistedMetadata: [:]
        )
    }

    private static func sleepAddition() -> HealthKitQueryAddition {
        HealthKitQueryAddition(
            healthKitUUID: UUID(uuidString: "60000000-0000-0000-0000-000000000001")!,
            objectTypeIdentifier: HealthKitSynchronizationStream.sleepAnalysis.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Watch", sourceRevision: "11",
                productType: "Watch", privacySafeDeviceProvenance: "Apple/Watch"
            ),
            occurrence: occurrence(), payload: .sleep(HealthKitQuerySleep(stageValue: 3)), allowlistedMetadata: [:]
        )
    }

    private static func occurrence() -> HealthKitQueryOccurrence {
        HealthKitQueryOccurrence(
            startedAt: now, endedAt: now.addingTimeInterval(60), localDate: "2027-01-15",
            calendarIdentifier: "gregorian", timeZoneIdentifier: "America/Los_Angeles",
            utcOffsetSeconds: -28_800, localDayStartedAt: now, localDayEndedAt: now.addingTimeInterval(86_400)
        )
    }
}

private final class Harness {
    let root: URL
    let scope: HealthKitCursorScope
    let store: FileHealthKitSynchronizationStore
    let query: MockQueryClient
    let observer: MockObserverClient
    let uploader: MockUploader
    let engine: HealthKitSynchronizationEngine

    init(
        stream: HealthKitSynchronizationStream,
        gate: HealthKitFeatureGate,
        queryResults: [HealthKitAnchoredQueryResult]? = nil,
        uploadModes: [MockUploader.Mode] = []
    ) throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSHealthKitTests-\(UUID().uuidString)", isDirectory: true)
        scope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: stream, predicateVersion: "healthkit-sync-v1"
        )
        store = FileHealthKitSynchronizationStore(root: root)
        query = MockQueryClient(results: queryResults ?? [HealthKitSynchronizationTests.quantityResult(
            anchor: "anchor-1", UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        )])
        observer = MockObserverClient()
        uploader = MockUploader(modes: uploadModes)
        engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: observer, store: store, uploader: uploader,
            featureGate: gate, now: { HealthKitSynchronizationTests.now }
        )
    }

    deinit { try? FileManager.default.removeItem(at: root) }
}

private extension HealthKitFeatureGate {
    static let enabled = HealthKitFeatureGate(enabledOperations: [
        .observationQuery, .serverUpload, .backgroundDelivery,
    ])
    static let queryOnly = HealthKitFeatureGate(enabledOperations: [.observationQuery])
}

private actor MockQueryClient: HealthKitAnchoredQueryClient {
    private var results: [HealthKitAnchoredQueryResult]
    private var anchors: [Data?] = []

    init(results: [HealthKitAnchoredQueryResult]) { self.results = results }

    func execute(stream: HealthKitSynchronizationStream, after anchorData: Data?) async throws -> HealthKitAnchoredQueryResult {
        anchors.append(anchorData)
        guard !results.isEmpty else { throw HealthKitSyncError.operational(code: "mock_query_exhausted") }
        return results.removeFirst()
    }

    func callCount() -> Int { anchors.count }
}

private final class MockObserverClient: HealthKitObserverClient, @unchecked Sendable {
    typealias Handler = @Sendable (String?, @escaping @Sendable () -> Void) -> Void
    private let lock = NSLock()
    private var handlers: [HealthKitSynchronizationStream: Handler] = [:]
    private var storedRegistrationCount = 0
    private var storedBackgroundEnableCount = 0
    var registrationCount: Int { lock.withLock { storedRegistrationCount } }
    var backgroundEnableCount: Int { lock.withLock { storedBackgroundEnableCount } }

    func register(stream: HealthKitSynchronizationStream, onWake: @escaping Handler) throws -> HealthKitObserverRegistration {
        lock.lock(); defer { lock.unlock() }
        handlers[stream] = onWake
        storedRegistrationCount += 1
        return HealthKitObserverRegistration(id: UUID())
    }

    func unregister(_ registration: HealthKitObserverRegistration) {}

    func enableBackgroundDelivery(for stream: HealthKitSynchronizationStream) async throws {
        lock.withLock { storedBackgroundEnableCount += 1 }
    }

    func fire(stream: HealthKitSynchronizationStream, completion: @escaping @Sendable () -> Void) throws {
        lock.lock(); let handler = handlers[stream]; lock.unlock()
        guard let handler else { throw HealthKitSyncError.operational(code: "observer_not_registered") }
        handler(nil, completion)
    }
}

private actor MockUploader: HealthKitObservationUploader {
    enum Mode { case accept, transient, reject }
    private var modes: [Mode]
    private var received: [HealthKitStagedPartition] = []
    private var completionProbe: CompletionProbe?
    private var sawCompletedBeforeUpload = false

    init(modes: [Mode]) { self.modes = modes }

    func setCompletionProbe(_ probe: CompletionProbe) { completionProbe = probe }

    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult {
        received.append(partition)
        if completionProbe?.isCompleted == true { sawCompletedBeforeUpload = true }
        let mode = modes.isEmpty ? .accept : modes.removeFirst()
        switch mode {
        case .accept:
            return .durablyAccepted(batchID: partition.identity, receiptIdentity: "receipt-\(partition.identity)")
        case .transient:
            return .transientFailure(code: "synthetic_lost_ack")
        case .reject:
            return .rejected(code: "synthetic_rejection")
        }
    }

    func receivedCount() -> Int { received.count }
    func receivedIdentities() -> [String] { received.map(\.identity) }
    func receivedSizes() -> [Int] { received.map(\.additions.count) }
    func observedCompletionBeforeUpload() -> Bool { sawCompletedBeforeUpload }
}

private final class CompletionProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var completed = false
    var isCompleted: Bool { lock.withLock { completed } }
    func markCompleted() { lock.withLock { completed = true } }
}

private extension NSLock {
    func withLock<T>(_ body: () -> T) -> T {
        lock(); defer { unlock() }
        return body()
    }
}

private func eventually(
    timeout: TimeInterval = 2,
    condition: @escaping () async -> Bool
) async {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if await condition() { return }
        try? await Task.sleep(for: .milliseconds(10))
    }
}

private func XCTAssertThrowsErrorAsync(
    _ expression: () async throws -> Void,
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        try await expression()
        XCTFail("Expected async expression to throw", file: file, line: line)
    } catch {}
}
