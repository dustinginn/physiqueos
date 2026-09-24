import Foundation
import XCTest
@testable import PhysiqueOS

final class HealthKitSynchronizationTests: XCTestCase {
    func testDailyRevisionIdentityDigestMatchesServerContractMaterialExactly() {
        XCTAssertEqual(
            HealthKitDailyRevisionRecovery.identityDigest(
                observationType: .activitySummary,
                externalID: "activity-summary:automatic:2026-09-23",
                bundleIdentifier: "com.apple.Health",
                deliveryDeviceID: "device-a",
                ingestionPurpose: .operational
            ),
            "4b0fe57d0dd4eaa933d423f70edc9cce19717abbf2c5a033e03a50654c63345c"
        )
    }

    func testDailyRevisionRecoveryDecodesOnlyTypedMonotonicServerFacts() {
        let recovery: ProductionJSONValue = .object([
            "kind": .string("healthkit_daily_revision_collision"),
            "schemaVersion": .string("healthkit-daily-revision-recovery-v1"),
            "observationType": .string("activity_summary"),
            "localDate": .string("2026-09-23"),
            "receivedSourceRevision": .number(5),
            "nextExpectedRevision": .number(6),
            "identityDigest": .string(String(repeating: "a", count: 64)),
        ])
        let problem = ProductionProblemDetails(
            problemVersion: "1", type: nil, title: "collision", status: 409,
            code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION", detail: nil,
            instance: nil, requestId: nil, fieldErrors: [], recovery: recovery
        )
        XCTAssertEqual(
            HealthKitDailyRevisionRecovery(problem: problem),
            HealthKitDailyRevisionRecovery(
                observationType: .activitySummary,
                localDate: "2026-09-23",
                receivedSourceRevision: 5,
                nextExpectedRevision: 6,
                identityDigest: String(repeating: "a", count: 64)
            )
        )

        let nonMonotonic = ProductionProblemDetails(
            problemVersion: "1", type: nil, title: "collision", status: 409,
            code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION", detail: nil,
            instance: nil, requestId: nil, fieldErrors: [],
            recovery: .object([
                "kind": .string("healthkit_daily_revision_collision"),
                "schemaVersion": .string("healthkit-daily-revision-recovery-v1"),
                "observationType": .string("activity_summary"),
                "localDate": .string("2026-09-23"),
                "receivedSourceRevision": .number(5),
                "nextExpectedRevision": .number(5),
                "identityDigest": .string(String(repeating: "a", count: 64)),
            ])
        )
        XCTAssertNil(HealthKitDailyRevisionRecovery(problem: nonMonotonic))

        let roundedBeyondExactJSONInteger = ProductionProblemDetails(
            problemVersion: "1", type: nil, title: "collision", status: 409,
            code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION", detail: nil,
            instance: nil, requestId: nil, fieldErrors: [],
            recovery: .object([
                "kind": .string("healthkit_daily_revision_collision"),
                "schemaVersion": .string("healthkit-daily-revision-recovery-v1"),
                "observationType": .string("activity_summary"),
                "localDate": .string("2026-09-23"),
                "receivedSourceRevision": .number(9_007_199_254_740_992),
                "nextExpectedRevision": .number(9_007_199_254_740_992),
                "identityDigest": .string(String(repeating: "a", count: 64)),
            ])
        )
        XCTAssertNil(
            HealthKitDailyRevisionRecovery(problem: roundedBeyondExactJSONInteger),
            "A rounded JSON Double must never become a durable revision floor"
        )
    }

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
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }

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

    func testCancellationAfterDurableAcceptanceStillAcknowledgesAndAdvancesCursor() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, uploadModes: [.acceptAndCancel])
        let operation = Task { try await harness.engine.synchronize(scope: harness.scope) }
        try await operation.value

        XCTAssertTrue(operation.isCancelled)
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertNotNil(cursor)
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
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        try await harness.engine.resumePending(scope: harness.scope)

        let identities = await harness.uploader.receivedIdentities()
        XCTAssertEqual(identities.count, 2)
        XCTAssertEqual(identities[0], identities[1])
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor)
    }

    /// A rejection must not advance the cursor past undelivered data (a
    /// prior acceptance's cursor must stay authoritative), but it also must
    /// NOT leave the scope permanently stuck: this is the Build 51 defect
    /// (the rejected partition, and the whole scope behind it, blocked
    /// every future foreground indefinitely, recoverable in production only
    /// by a reinstall). `abandonPendingBatch` retires the rejected batch
    /// immediately, without touching the cursor, so the next synchronize()
    /// re-queries fresh instead of re-encountering the same dead end.
    func testServerRejectionLeavesPriorCursorAuthoritativeButDoesNotPermanentlyBlockTheScope() async throws {
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
        XCTAssertEqual(cursorAfterRejection, accepted, "the prior acceptance must remain authoritative")
        XCTAssertTrue(pendingAfterRejection.isEmpty, "the rejected batch must be retired, not left stuck forever")

        let diagnostics = try await harness.store.diagnostics(for: harness.scope)
        XCTAssertEqual(diagnostics.lastAbandonedBatchCode, "synthetic_rejection")
        XCTAssertEqual(diagnostics.abandonedBatchCount, 1)
        XCTAssertNotNil(diagnostics.lastAbandonedAt, "abandonment must be durably diagnosable, not just in-memory")
    }

    /// The defect this heals: with the OLD `deliverPending` (which merely
    /// threw on an already-`.rejected` partition, never retiring it),
    /// `pendingBatches` would stay stuck at 1 forever and a THIRD
    /// synchronize() call would never even re-query HealthKit. On the fixed
    /// engine, once the doomed batch is retired, a later, corrected/new
    /// revision is queried fresh and delivered normally -- proving actual
    /// recovery, not merely that the stuck state was renamed.
    func testPermanentRejectionRecoversOnANewRevisionInsteadOfStayingPoisoned() async throws {
        let first = Self.quantityResult(anchor: "anchor-1", UUID(uuidString: "00000000-0000-0000-0000-000000000001")!)
        let second = Self.quantityResult(anchor: "anchor-2", UUID(uuidString: "00000000-0000-0000-0000-000000000002")!)
        let third = Self.quantityResult(anchor: "anchor-3", UUID(uuidString: "00000000-0000-0000-0000-000000000003")!)
        let harness = try Harness(
            stream: .activeEnergy,
            gate: .enabled,
            queryResults: [first, second, third],
            uploadModes: [.accept, .reject, .accept]
        )
        try await harness.engine.synchronize(scope: harness.scope)
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }

        // The poisoned scope's very next synchronize() must re-query
        // HealthKit (not silently no-op on a stuck pending batch) and
        // successfully deliver the new, corrected revision.
        try await harness.engine.synchronize(scope: harness.scope)

        let queryCount = await harness.query.callCount()
        let finalCursor = try await harness.store.authoritativeCursor(for: harness.scope)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(queryCount, 3, "the third call must re-query HealthKit, not skip it")
        XCTAssertEqual(finalCursor?.opaqueAnchorData, Data("anchor-3".utf8))
        XCTAssertTrue(pending.isEmpty)
    }

    /// Simulates the exact real-world poisoned state: a batch already
    /// persisted as `.rejected` from a *prior* app version/session (not
    /// freshly rejected in this run). The engine must recognize and retire
    /// it the same way on the very next synchronize() -- this is what heals
    /// an already-poisoned Build 51 device with no migration step.
    func testAlreadyPersistedRejectedPartitionFromAPriorSessionSelfHealsOnNextSync() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .queryOnly)
        try await harness.engine.synchronize(scope: harness.scope)
        let pendingBeforeRejection = try await harness.store.pendingBatches(for: harness.scope)
        let staged = try XCTUnwrap(pendingBeforeRejection.first)
        let partition = try XCTUnwrap(staged.partitions.first)
        // Simulate the pre-fix persisted state directly, bypassing
        // deliverPending entirely -- exactly what a real poisoned device's
        // on-disk envelope already contains before this fix ever runs.
        try await harness.store.markRejected(batchID: staged.identity, partitionID: partition.identity, code: "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE")
        let pendingAfterRejection = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(pendingAfterRejection.count, 1)

        let uploader = MockUploader(modes: [.accept])
        let healedEngine = HealthKitSynchronizationEngine(
            queryClient: MockQueryClient(results: [Self.quantityResult(
                anchor: "anchor-healed", UUID(uuidString: "00000000-0000-0000-0000-000000000099")!
            )]),
            observerClient: MockObserverClient(), store: harness.store, uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )
        // First post-update call encounters the already-poisoned partition
        // and retires it (still honestly reporting THIS attempt as failed);
        // the very next call is the one that proves recovery by querying
        // HealthKit fresh and delivering successfully -- no reinstall.
        await XCTAssertThrowsErrorAsync { try await healedEngine.synchronize(scope: harness.scope) }
        try await healedEngine.synchronize(scope: harness.scope)

        let pendingAfterHeal = try await harness.store.pendingBatches(for: harness.scope)
        let cursorAfterHeal = try await harness.store.authoritativeCursor(for: harness.scope)
        let diagnostics = try await harness.store.diagnostics(for: harness.scope)
        XCTAssertTrue(pendingAfterHeal.isEmpty)
        XCTAssertEqual(cursorAfterHeal?.opaqueAnchorData, Data("anchor-healed".utf8))
        XCTAssertEqual(diagnostics.lastAbandonedBatchCode, "HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE")
    }

    /// A partition that fails validation on this device (truly invalid
    /// payload) is retried at most once per foreground -- never in a tight
    /// loop within a single call -- and never silently blocks the scope.
    func testTrulyInvalidPermanentPayloadDoesNotRetryForeverWithinOneCall() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, uploadModes: [.reject])
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        let uploadAttempts = await harness.uploader.receivedCount()
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(uploadAttempts, 1, "a rejected upload must not be retried within the same call")
        XCTAssertTrue(pending.isEmpty, "must not remain permanently blocking after being surfaced")
    }

    func testDailyIdentityCollisionPersistsServerFloorAcrossRelaunchAndFreshRevisionSucceeds() async throws {
        let first = Self.activitySummaryResult(revision: 1, moveCalories: 606, cursorFingerprint: "stale-local")
        let second = Self.activitySummaryResult(revision: 6, moveCalories: 700, cursorFingerprint: "current-healthkit")
        let harness = try Harness(
            stream: .activitySummary,
            gate: .enabled,
            queryResults: [first],
            uploadModes: [.dailyCollision(received: 1, nextExpected: 6)]
        )

        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        let pendingAfterCollision = try await harness.store.pendingBatches(for: harness.scope)
        let floorsAfterCollision = try await harness.store.dailyRevisionFloors(for: harness.scope)
        XCTAssertTrue(pendingAfterCollision.isEmpty)
        XCTAssertEqual(floorsAfterCollision, ["2026-09-23": 6])

        let reopened = FileHealthKitSynchronizationStore(root: harness.root)
        let query = MockQueryClient(results: [second])
        let uploader = MockUploader(modes: [.accept])
        let restarted = HealthKitSynchronizationEngine(
            queryClient: query,
            observerClient: MockObserverClient(),
            store: reopened,
            uploader: uploader,
            featureGate: .enabled,
            now: { Self.now }
        )
        try await restarted.synchronize(scope: harness.scope)

        let captured = await query.receivedAnchors()
        let queryAnchor = try XCTUnwrap(captured.first ?? nil)
        let overlay = try XCTUnwrap(JSONSerialization.jsonObject(with: queryAnchor) as? [String: Any])
        let entries = try XCTUnwrap(overlay["entries"] as? [String: [String: Any]])
        XCTAssertEqual((entries["2026-09-23"]?["revision"] as? NSNumber)?.uint64Value, 5)
        XCTAssertTrue((entries["2026-09-23"]?["fingerprint"] as? String)?.hasPrefix("server-revision-recovery-v1:") == true)
        let uploadedRevisions = await uploader.receivedDailyRevisions()
        let finalFloors = try await reopened.dailyRevisionFloors(for: harness.scope)
        let finalCursor = try await reopened.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(uploadedRevisions, [6])
        XCTAssertEqual(finalFloors, [:])
        XCTAssertNotNil(finalCursor)
    }

    func testNutritionDailyIdentityCollisionPersistsIndependentFloorAcrossRelaunch() async throws {
        let first = Self.nutritionDailyResult(revision: 2, calories: 2_050, cursorFingerprint: "stale-nutrition")
        let second = Self.nutritionDailyResult(revision: 8, calories: 2_175, cursorFingerprint: "current-nutrition")
        let harness = try Harness(
            stream: .nutritionDailyTotal,
            gate: .enabled,
            queryResults: [first],
            uploadModes: [.dailyCollision(observationType: .nutritionDailyTotal, received: 2, nextExpected: 8)]
        )

        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        let floorsAfterCollision = try await harness.store.dailyRevisionFloors(for: harness.scope)
        XCTAssertEqual(floorsAfterCollision, ["2026-09-23": 8])

        let reopened = FileHealthKitSynchronizationStore(root: harness.root)
        let query = MockQueryClient(results: [second])
        let uploader = MockUploader(modes: [.accept])
        let restarted = HealthKitSynchronizationEngine(
            queryClient: query,
            observerClient: MockObserverClient(),
            store: reopened,
            uploader: uploader,
            featureGate: .enabled,
            now: { Self.now }
        )
        try await restarted.synchronize(scope: harness.scope)

        let uploadedRevisions = await uploader.receivedDailyRevisions()
        let finalFloors = try await reopened.dailyRevisionFloors(for: harness.scope)
        let finalCursor = try await reopened.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(uploadedRevisions, [8])
        XCTAssertEqual(finalFloors, [:])
        XCTAssertNotNil(finalCursor)
    }

    func testCurrentDayZeroAndNonzeroActivityAggregatesAreBothDurablyUploaded() async throws {
        for (value, revision) in [(0.0, UInt64(1)), (725.0, UInt64(2))] {
            let result = Self.dailyActivityResult(
                localDate: "2027-01-15",
                revision: revision,
                moveCalories: value,
                cursorFingerprint: "current-\(revision)",
                exerciseMinutes: value == 0 ? 0 : 30,
                standHours: value == 0 ? 0 : 10
            )
            let harness = try Harness(
                stream: .activitySummary,
                gate: .enabled,
                queryResults: [result],
                uploadModes: [.accept],
                predicateVersion: HealthKitAutomaticSynchronizationCoordinator.currentDayPredicateVersion
            )

            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
            try await harness.engine.synchronizeCurrentDay(scope: harness.scope, calendar: calendar)

            let uploadedRevisions = await harness.uploader.receivedDailyRevisions()
            let externalIDs = await harness.uploader.receivedExternalIDs()
            let receivedBounds = await harness.query.receivedBounds()
            let pending = try await harness.store.pendingBatches(for: harness.scope)
            let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
            XCTAssertEqual(uploadedRevisions, [revision])
            XCTAssertEqual(externalIDs, ["activity-summary:automatic:2027-01-15"])
            let bounds = try XCTUnwrap(receivedBounds.first ?? nil)
            XCTAssertEqual(bounds.startLocalDate, "2027-01-15")
            XCTAssertEqual(bounds.endLocalDate, "2027-01-15")
            XCTAssertEqual(bounds.timeZoneIdentifier, "America/Los_Angeles")
            XCTAssertTrue(pending.isEmpty)
            XCTAssertNotNil(cursor)
        }
    }

    func testCurrentDayZeroNutritionAggregateIsAValidPresentObservation() async throws {
        let result = Self.dailyNutritionResult(
            localDate: "2027-01-15", revision: 1, calories: 0,
            protein: 0, cursorFingerprint: "zero-nutrition"
        )
        let harness = try Harness(
            stream: .nutritionDailyTotal,
            gate: .enabled,
            queryResults: [result],
            uploadModes: [.accept],
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.currentDayPredicateVersion
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!

        try await harness.engine.synchronizeCurrentDay(scope: harness.scope, calendar: calendar)

        let revisions = await harness.uploader.receivedDailyRevisions()
        let externalIDs = await harness.uploader.receivedExternalIDs()
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertEqual(revisions, [1])
        XCTAssertEqual(externalIDs, ["nutrition-daily-total:automatic:2027-01-15"])
        XCTAssertNotNil(cursor)
    }

    func testAutomaticObserverWakeAlwaysAttemptsCurrentBeforeCollidingHistory() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSObserverPriority-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let historical = Self.automaticScope(.activitySummary)
        let current = Self.currentDayScope(.activitySummary)
        let query = MockQueryClient(results: [
            Self.dailyActivityResult(localDate: "2027-01-15", revision: 1, moveCalories: 0, cursorFingerprint: "today", exerciseMinutes: 0, standHours: 0),
            Self.dailyActivityResult(localDate: "2027-01-14", revision: 1, moveCalories: 300, cursorFingerprint: "history"),
            Self.dailyActivityResult(localDate: "2027-01-14", revision: 4, moveCalories: 300, cursorFingerprint: "history-rebased"),
        ])
        let uploader = MockUploader(modes: [
            .accept,
            .dailyCollision(localDate: "2027-01-14", received: 1, nextExpected: 4),
            .accept,
        ])
        let store = FileHealthKitSynchronizationStore(root: root)
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(), store: store, uploader: uploader,
            featureGate: .enabled, historicalLookbackDays: 1, now: { Self.now }
        )
        let completion = CompletionProbe()

        await engine.handleObserverWake(scope: historical) { completion.markCompleted() }

        let bounds = (await query.receivedBounds()).compactMap { $0 }
        let currentCursor = try await store.authoritativeCursor(for: current)
        let historicalDay = Self.historicalDayScope(.activitySummary, localDate: "2027-01-14")
        let historyFloors = try await store.dailyRevisionFloors(for: historicalDay)
        XCTAssertTrue(completion.isCompleted)
        XCTAssertEqual(bounds.map(\.startLocalDate), ["2027-01-15", "2027-01-14", "2027-01-14"])
        XCTAssertEqual(bounds.map(\.endLocalDate), ["2027-01-15", "2027-01-14", "2027-01-14"])
        XCTAssertNotNil(currentCursor)
        XCTAssertEqual(historyFloors, [:])
    }

    func testCurrentDayCollisionRebasesAndRetriesExactlyOnce() async throws {
        let first = Self.dailyActivityResult(
            localDate: "2027-01-15", revision: 1, moveCalories: 100, cursorFingerprint: "stale"
        )
        let second = Self.dailyActivityResult(
            localDate: "2027-01-15", revision: 6, moveCalories: 100, cursorFingerprint: "rebased"
        )
        let harness = try Harness(
            stream: .activitySummary,
            gate: .enabled,
            queryResults: [first, second],
            uploadModes: [.dailyCollision(localDate: "2027-01-15", received: 1, nextExpected: 6), .accept],
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.currentDayPredicateVersion
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!

        try await harness.engine.synchronizeCurrentDay(scope: harness.scope, calendar: calendar)

        let queryCount = await harness.query.callCount()
        let uploadedRevisions = await harness.uploader.receivedDailyRevisions()
        let floors = try await harness.store.dailyRevisionFloors(for: harness.scope)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(queryCount, 2)
        XCTAssertEqual(uploadedRevisions, [1, 6])
        XCTAssertEqual(floors, [:])
        XCTAssertTrue(pending.isEmpty)
    }

    func testHistoricalCollisionStateCannotPoisonCurrentDayScope() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSCurrentIsolation-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileHealthKitSynchronizationStore(root: root)
        let query = MockQueryClient(results: [
            Self.dailyActivityResult(localDate: "2027-01-14", revision: 1, moveCalories: 300, cursorFingerprint: "history"),
            Self.dailyActivityResult(localDate: "2027-01-14", revision: 9, moveCalories: 300, cursorFingerprint: "history-rebased"),
            Self.dailyActivityResult(localDate: "2027-01-15", revision: 1, moveCalories: 0, cursorFingerprint: "today"),
        ])
        let uploader = MockUploader(modes: [
            .dailyCollision(localDate: "2027-01-14", received: 1, nextExpected: 9),
            .accept,
            .accept,
        ])
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(), store: store,
            uploader: uploader, featureGate: .enabled, historicalLookbackDays: 1, now: { Self.now }
        )
        let historical = Self.automaticScope(.activitySummary)
        let current = Self.currentDayScope(.activitySummary)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!

        try await engine.synchronizeHistoricalCatchUp(scope: historical, calendar: calendar)
        try await engine.synchronizeCurrentDay(scope: current, calendar: calendar)

        let historicalDay = Self.historicalDayScope(.activitySummary, localDate: "2027-01-14")
        let historicalFloors = try await store.dailyRevisionFloors(for: historicalDay)
        let currentFloors = try await store.dailyRevisionFloors(for: current)
        let currentCursor = try await store.authoritativeCursor(for: current)
        let externalIDs = await uploader.receivedExternalIDs()
        XCTAssertEqual(historicalFloors, [:])
        XCTAssertEqual(currentFloors, [:])
        XCTAssertNotNil(currentCursor)
        XCTAssertEqual(externalIDs.last, "activity-summary:automatic:2027-01-15")
    }

    func testFailedHistoricalDateCannotBlockLaterHistoricalDate() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSHistoricalDayIsolation-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileHealthKitSynchronizationStore(root: root)
        let query = MockQueryClient(results: [
            Self.dailyActivityResult(localDate: "2027-01-13", revision: 1, moveCalories: 100, cursorFingerprint: "day-1"),
            Self.dailyActivityResult(localDate: "2027-01-14", revision: 1, moveCalories: 200, cursorFingerprint: "day-2"),
        ])
        let uploader = MockUploader(modes: [.transient, .accept])
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(), store: store,
            uploader: uploader, featureGate: .enabled, historicalLookbackDays: 2, now: { Self.now }
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!

        await XCTAssertThrowsErrorAsync {
            try await engine.synchronizeHistoricalCatchUp(
                scope: Self.automaticScope(.activitySummary), calendar: calendar
            )
        }

        let failedDay = Self.historicalDayScope(.activitySummary, localDate: "2027-01-13")
        let laterDay = Self.historicalDayScope(.activitySummary, localDate: "2027-01-14")
        let failedPending = try await store.pendingBatches(for: failedDay)
        let laterCursor = try await store.authoritativeCursor(for: laterDay)
        let queryCount = await query.callCount()
        let externalIDs = await uploader.receivedExternalIDs()
        XCTAssertEqual(failedPending.count, 1)
        XCTAssertNotNil(laterCursor)
        XCTAssertEqual(queryCount, 2)
        XCTAssertEqual(externalIDs, [
            "activity-summary:automatic:2027-01-13",
            "activity-summary:automatic:2027-01-14",
        ])
    }

    func testPersistedHistoricalPendingBatchDoesNotBlockCurrentDayAfterRelaunch() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSCurrentRelaunch-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let historical = Self.automaticScope(.activitySummary)
        let current = Self.currentDayScope(.activitySummary)
        let firstStore = FileHealthKitSynchronizationStore(root: root)
        let historyEngine = HealthKitSynchronizationEngine(
            queryClient: MockQueryClient(results: [Self.dailyActivityResult(
                localDate: "2027-01-14", revision: 1, moveCalories: 320, cursorFingerprint: "pending"
            )]),
            observerClient: MockObserverClient(), store: firstStore, uploader: MockUploader(modes: []),
            featureGate: .queryOnly, now: { Self.now }
        )
        try await historyEngine.synchronize(scope: historical)
        let originalHistoricalPending = try await firstStore.pendingBatches(for: historical)
        XCTAssertEqual(originalHistoricalPending.count, 1)

        let reopened = FileHealthKitSynchronizationStore(root: root)
        let uploader = MockUploader(modes: [.accept])
        let currentEngine = HealthKitSynchronizationEngine(
            queryClient: MockQueryClient(results: [Self.dailyActivityResult(
                localDate: "2027-01-15", revision: 1, moveCalories: 0, cursorFingerprint: "today"
            )]),
            observerClient: MockObserverClient(), store: reopened, uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        try await currentEngine.synchronizeCurrentDay(scope: current, calendar: calendar)

        let historicalPending = try await reopened.pendingBatches(for: historical)
        let currentPending = try await reopened.pendingBatches(for: current)
        let externalIDs = await uploader.receivedExternalIDs()
        XCTAssertEqual(historicalPending.count, 1)
        XCTAssertTrue(currentPending.isEmpty)
        XCTAssertEqual(externalIDs, ["activity-summary:automatic:2027-01-15"])
    }

    func testCurrentDayOfflinePendingResumesWithoutASecondQuery() async throws {
        let result = Self.dailyActivityResult(
            localDate: "2027-01-15", revision: 1, moveCalories: 0, cursorFingerprint: "offline"
        )
        let harness = try Harness(
            stream: .activitySummary,
            gate: .enabled,
            queryResults: [result],
            uploadModes: [.transient, .accept],
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.currentDayPredicateVersion
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!

        await XCTAssertThrowsErrorAsync {
            try await harness.engine.synchronizeCurrentDay(scope: harness.scope, calendar: calendar)
        }
        let pendingOffline = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(pendingOffline.count, 1)
        try await harness.engine.synchronizeCurrentDay(scope: harness.scope, calendar: calendar)

        let queryCount = await harness.query.callCount()
        let uploadCount = await harness.uploader.receivedCount()
        let pendingAfterReconnect = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(queryCount, 1)
        XCTAssertEqual(uploadCount, 2)
        XCTAssertTrue(pendingAfterReconnect.isEmpty)
    }

    func testCurrentAndHistoricalBoundsHonorLocalTimezoneRolloverWithoutBackfillExpansion() throws {
        let instant = ISO8601DateFormatter().date(from: "2026-09-24T04:30:00Z")!
        var texas = Calendar(identifier: .gregorian)
        texas.timeZone = TimeZone(identifier: "America/Chicago")!
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!

        let texasCurrent = try HealthKitSynchronizationEngine.currentDayBounds(at: instant, calendar: texas)
        let utcCurrent = try HealthKitSynchronizationEngine.currentDayBounds(at: instant, calendar: utc)
        let texasHistory = try HealthKitSynchronizationEngine.historicalCatchUpBounds(at: instant, calendar: texas)

        XCTAssertEqual(texasCurrent.startLocalDate, "2026-09-23")
        XCTAssertEqual(utcCurrent.startLocalDate, "2026-09-24")
        XCTAssertEqual(texasHistory.startLocalDate, "2026-08-24")
        XCTAssertEqual(texasHistory.endLocalDate, "2026-09-22")
        XCTAssertEqual(
            texas.dateComponents([.day], from: texasHistory.startDateInclusive, to: texasHistory.endDateExclusive).day,
            30
        )
    }

    func testSeptember23RepairDryRunReadsOnlyExactActivityDayAcceptsZerosAndUploadsNothing() async throws {
        let zero = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 0,
            cursorFingerprint: "zero", exerciseMinutes: 0, standHours: 0
        )
        let query = MockQueryClient(results: [zero])
        let uploader = MockUploader(modes: [])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairDryRun-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(),
            store: FileHealthKitSynchronizationStore(root: root), uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Chicago")!

        let result = try await engine.dryRunSeptember23ActivityRepair(
            scope: Self.september23RepairScope(), calendar: calendar
        )

        XCTAssertEqual(result.localDate, "2026-09-23")
        XCTAssertEqual(result.dailyActivity.values.reduce(0, +), 0)
        XCTAssertEqual(result.predictedMutation, .exact)
        XCTAssertFalse(result.aggregateDigest.isEmpty)
        let uploadCount = await uploader.receivedCount()
        let streams = await query.receivedStreams()
        let receivedBounds = await query.receivedBounds()
        XCTAssertEqual(uploadCount, 0)
        XCTAssertEqual(streams, [.activitySummary])
        let bounds = try XCTUnwrap(receivedBounds.first ?? nil)
        XCTAssertEqual(bounds.startLocalDate, "2026-09-23")
        XCTAssertEqual(bounds.endLocalDate, "2026-09-23")
        XCTAssertEqual(bounds.timeZoneIdentifier, "America/Chicago")
    }

    func testSeptember23RepairWrongScopeAndMissingAuthorizationRefuseBeforeQuery() async throws {
        let query = MockQueryClient(results: [])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairRefusal-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(),
            store: FileHealthKitSynchronizationStore(root: root), uploader: MockUploader(modes: []),
            featureGate: .enabled, now: { Self.now }
        )

        let invalidScopes = [
            Self.currentDayScope(.activitySummary),
            HealthKitCursorScope(
                ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: .activitySummary,
                predicateVersion: "healthkit-automatic-sep23-activity-repair-v1:2026-09-22"
            ),
            HealthKitCursorScope(
                ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: .nutritionDailyTotal,
                predicateVersion: HealthKitSeptember23ActivityRepairContract.predicateVersion
            ),
        ]
        for scope in invalidScopes {
            do {
                _ = try await engine.dryRunSeptember23ActivityRepair(scope: scope)
                XCTFail("wrong date, namespace, or stream must refuse")
            } catch let error as HealthKitCanaryError {
                XCTAssertEqual(error, .september23RepairBoundaryViolation)
            }
        }
        do {
            _ = try await engine.applySeptember23ActivityRepair(
                scope: Self.september23RepairScope(), authorization: nil
            )
            XCTFail("missing authorization must refuse")
        } catch let error as HealthKitCanaryError {
            XCTAssertEqual(error, .september23RepairApplyNotAuthorized)
        }
        let queryCount = await query.callCount()
        XCTAssertEqual(queryCount, 0)
    }

    func testSeptember23RepairFrozenServerFactDriftRefusesBeforeQueryOrUpload() async throws {
        let query = MockQueryClient(results: [])
        let uploader = MockUploader(modes: [])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairAuthority-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(),
            store: FileHealthKitSynchronizationStore(root: root), uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )
        let driftedFacts = [
            Self.september23ServerFacts(canonicalDayCount: 2),
            Self.september23ServerFacts(canonicalRevision: 51),
            Self.september23ServerFacts(runtimeSHA: "unexpected-runtime"),
            Self.september23ServerFacts(dailyPolicyDigest: "unexpected-policy"),
            Self.september23ServerFacts(september24ActivityCanonicalDayCount: 1),
        ]
        for facts in driftedFacts {
            await uploader.setServerFacts(facts)
            let authorization = HealthKitSeptember23ActivityRepairAuthorization(
                contractVersion: HealthKitSeptember23ActivityRepairContract.contractVersion,
                approvedAggregateDigest: "approved"
            )
            do {
                _ = try await engine.applySeptember23ActivityRepair(
                    scope: Self.september23RepairScope(), authorization: authorization
                )
                XCTFail("duplicate, revision, authority, policy, or Sep 24 drift must refuse")
            } catch let error as HealthKitCanaryError {
                XCTAssertEqual(error, .september23RepairAuthorityDrift)
            }
        }
        let queryCount = await query.callCount()
        let uploadCount = await uploader.receivedCount()
        XCTAssertEqual(queryCount, 0)
        XCTAssertEqual(uploadCount, 0)
    }

    func testSeptember23RepairRefusesAnyExtraDateDeletionOrUnrelatedObservation() async throws {
        let september23 = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 400, cursorFingerprint: "base"
        )
        let september24 = Self.dailyActivityResult(
            localDate: "2026-09-24", revision: 1, moveCalories: 0, cursorFingerprint: "other",
            exerciseMinutes: 0, standHours: 0
        )
        let mixed = HealthKitAnchoredQueryResult(
            additions: september23.additions + september24.additions,
            deletions: [], proposedAnchorData: september23.proposedAnchorData, completedAt: Self.now
        )
        let deleted = HealthKitAnchoredQueryResult(
            additions: september23.additions,
            deletions: [HealthKitQueryDeletion(
                healthKitUUID: UUID(), immutableExternalID: "activity-summary:automatic:2026-09-23",
                objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier
            )],
            proposedAnchorData: september23.proposedAnchorData, completedAt: Self.now
        )
        for result in [mixed, deleted] {
            let root = FileManager.default.temporaryDirectory
                .appendingPathComponent("PhysiqueOSRepairUnrelated-\(UUID().uuidString)", isDirectory: true)
            defer { try? FileManager.default.removeItem(at: root) }
            let query = MockQueryClient(results: [result])
            let uploader = MockUploader(modes: [])
            let engine = HealthKitSynchronizationEngine(
                queryClient: query, observerClient: MockObserverClient(),
                store: FileHealthKitSynchronizationStore(root: root), uploader: uploader,
                featureGate: .enabled, now: { Self.now }
            )
            do {
                _ = try await engine.dryRunSeptember23ActivityRepair(scope: Self.september23RepairScope())
                XCTFail("extra date or deletion must refuse")
            } catch let error as HealthKitCanaryError {
                XCTAssertEqual(error, .september23RepairAggregateMissing)
            }
            let uploadCount = await uploader.receivedCount()
            XCTAssertEqual(uploadCount, 0)
        }
    }

    func testSeptember23RepairDigestDriftRefusesBeforeAnyUpload() async throws {
        let approvedResult = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 400, cursorFingerprint: "approved"
        )
        let changedResult = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 401, cursorFingerprint: "changed"
        )
        let approved = try await Self.repairDryRun(for: approvedResult)
        let query = MockQueryClient(results: [changedResult])
        let uploader = MockUploader(modes: [])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairDigest-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(),
            store: FileHealthKitSynchronizationStore(root: root), uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )

        do {
            _ = try await engine.applySeptember23ActivityRepair(
                scope: Self.september23RepairScope(),
                authorization: Self.september23Authorization(digest: approved.aggregateDigest)
            )
            XCTFail("digest drift must refuse")
        } catch let error as HealthKitCanaryError {
            XCTAssertEqual(error, .september23RepairAggregateDrift)
        }
        let uploadCount = await uploader.receivedCount()
        XCTAssertEqual(uploadCount, 0)
    }

    func testSeptember23RepairRejectsUnexpectedNextRevisionAfterOneRequest() async throws {
        let first = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 400, cursorFingerprint: "first"
        )
        let approved = try await Self.repairDryRun(for: first)
        let query = MockQueryClient(results: [first])
        let uploader = MockUploader(modes: [
            .dailyCollision(localDate: "2026-09-23", received: 1, nextExpected: 52),
        ])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairRevision-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileHealthKitSynchronizationStore(root: root)
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(), store: store, uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )

        do {
            _ = try await engine.applySeptember23ActivityRepair(
                scope: Self.september23RepairScope(),
                authorization: Self.september23Authorization(digest: approved.aggregateDigest)
            )
            XCTFail("unexpected next revision must refuse")
        } catch let error as HealthKitCanaryError {
            XCTAssertEqual(error, .september23RepairRevisionMismatch)
        }
        let uploadCount = await uploader.receivedCount()
        let queryCount = await query.callCount()
        let floors = try await store.dailyRevisionFloors(for: Self.september23RepairScope())
        XCTAssertEqual(uploadCount, 1)
        XCTAssertEqual(queryCount, 1)
        XCTAssertEqual(floors, [:])
    }

    func testSeptember23RepairRejectsMismatchedRecoveryIdentityDigest() async throws {
        let first = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 400, cursorFingerprint: "first"
        )
        let approved = try await Self.repairDryRun(for: first)
        let query = MockQueryClient(results: [first])
        let uploader = MockUploader(modes: [
            .dailyCollision(
                localDate: "2026-09-23", received: 1, nextExpected: 51,
                identityDigest: String(repeating: "a", count: 64)
            ),
        ])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairIdentityDigest-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileHealthKitSynchronizationStore(root: root)
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(), store: store, uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )

        await XCTAssertThrowsErrorAsync {
            _ = try await engine.applySeptember23ActivityRepair(
                scope: Self.september23RepairScope(),
                authorization: Self.september23Authorization(digest: approved.aggregateDigest)
            )
        }
        let uploadCount = await uploader.receivedCount()
        let queryCount = await query.callCount()
        let floors = try await store.dailyRevisionFloors(for: Self.september23RepairScope())
        let pending = try await store.pendingBatches(for: Self.september23RepairScope())
        XCTAssertEqual(uploadCount, 1)
        XCTAssertEqual(queryCount, 1)
        XCTAssertEqual(floors, [:])
        XCTAssertTrue(pending.isEmpty)
    }

    func testSeptember23RepairExactFixtureUsesOnlyTwoSep23RequestsAndPredictsFiftyOne() async throws {
        let first = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 1, moveCalories: 400, cursorFingerprint: "first"
        )
        let rebased = Self.dailyActivityResult(
            localDate: "2026-09-23", revision: 51, moveCalories: 400, cursorFingerprint: "rebased"
        )
        let approved = try await Self.repairDryRun(for: first)
        let query = MockQueryClient(results: [first, rebased])
        let uploader = MockUploader(modes: [
            .dailyCollision(localDate: "2026-09-23", received: 1, nextExpected: 51),
            .accept,
        ])
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairSuccess-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileHealthKitSynchronizationStore(root: root)
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: MockObserverClient(), store: store, uploader: uploader,
            featureGate: .enabled, now: { Self.now }
        )

        let result = try await engine.applySeptember23ActivityRepair(
            scope: Self.september23RepairScope(),
            authorization: Self.september23Authorization(digest: approved.aggregateDigest)
        )

        XCTAssertEqual(result.requestCount, 2)
        XCTAssertEqual(result.prediction.canonicalRevisionAfter, 51)
        XCTAssertEqual(result.prediction.sourceObservationCountAfter, 51)
        XCTAssertEqual(result.prediction.historyCountAfter, 50)
        let queryCount = await query.callCount()
        let streams = await query.receivedStreams()
        let bounds = await query.receivedBounds()
        let externalIDs = await uploader.receivedExternalIDs()
        let uploadedRevisions = await uploader.receivedDailyRevisions()
        let floors = try await store.dailyRevisionFloors(for: Self.september23RepairScope())
        let pending = try await store.pendingBatches(for: Self.september23RepairScope())
        XCTAssertEqual(queryCount, 2)
        XCTAssertEqual(streams, [.activitySummary, .activitySummary])
        XCTAssertTrue(bounds.compactMap { $0 }.allSatisfy {
            $0.startLocalDate == "2026-09-23" && $0.endLocalDate == "2026-09-23"
        })
        XCTAssertEqual(externalIDs, ["activity-summary:automatic:2026-09-23", "activity-summary:automatic:2026-09-23"])
        XCTAssertEqual(uploadedRevisions, [1, 51])
        XCTAssertEqual(floors, [:])
        XCTAssertTrue(pending.isEmpty)
    }

    func testProtectedDataReadFailureDoesNotQuarantineOrResetDurableState() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .queryOnly)
        try await harness.engine.synchronize(scope: harness.scope)
        let stateURL = await harness.store.stateFileURL(for: harness.scope)
        let original = try Data(contentsOf: stateURL)
        let locked = FileHealthKitSynchronizationStore(root: harness.root) { _ in
            throw CocoaError(.fileReadNoPermission)
        }

        do {
            _ = try await locked.authoritativeCursor(for: harness.scope)
            XCTFail("Expected protected-data unavailability")
        } catch let error as HealthKitSyncError {
            XCTAssertEqual(error, .operational(code: "healthkit_state_protected_data_unavailable"))
        }

        XCTAssertEqual(try Data(contentsOf: stateURL), original)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stateURL.appendingPathExtension("corrupt").path))
        let reopened = FileHealthKitSynchronizationStore(root: harness.root)
        let reopenedPending = try await reopened.pendingBatches(for: harness.scope)
        XCTAssertEqual(reopenedPending.count, 1)
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
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
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

    // MARK: - Automatic-ingestion identity namespacing (Build 51/52 root cause)

    /// This is the exact collision that produced the real
    /// `HEALTHKIT_INGESTION_PURPOSE_IMMUTABLE` 409 in production: before
    /// namespacing, the canary's validation-only predicate version and the
    /// automatic path's predicate version both resolved to `nil` (no
    /// namespace), so both produced the bare `activity-summary:<date>` /
    /// `nutrition-daily-total:<date>` external id for the same day.
    func testCanaryAndAutomaticPredicateVersionsNoLongerShareAnExternalIDNamespace() {
        let canaryPredicateVersion = "healthkit-activity-validation-only-v1:2026-09-22:2026-09-22"
        XCTAssertNil(HealthKitBatchBuilder.externalIDNamespace(for: canaryPredicateVersion))
        XCTAssertEqual(
            HealthKitBatchBuilder.externalIDNamespace(for: HealthKitAutomaticSynchronizationCoordinator.predicateVersion),
            "automatic"
        )
        XCTAssertNotEqual(
            HealthKitBatchBuilder.externalIDNamespace(for: canaryPredicateVersion),
            HealthKitBatchBuilder.externalIDNamespace(for: HealthKitAutomaticSynchronizationCoordinator.predicateVersion)
        )
    }

    /// The current-day and one-shot repair scopes deliberately share the
    /// established automatic wire namespace while retaining separate local
    /// cursor/pending state. Canary/test-day/workout-canary remain distinct.
    func testKnownPredicateVersionsUseOnlyTheirIntendedIdentityNamespaces() {
        let canary = HealthKitBatchBuilder.externalIDNamespace(for: "healthkit-activity-validation-only-v1:2026-09-22:2026-09-22")
        let testDay = HealthKitBatchBuilder.externalIDNamespace(for: "healthkit-canonical-testday-v1:2026-09-22")
        let workoutCanary = HealthKitBatchBuilder.externalIDNamespace(for: "healthkit-workout-canary-v1:2026-09-22")
        let automatic = HealthKitBatchBuilder.externalIDNamespace(for: HealthKitAutomaticSynchronizationCoordinator.predicateVersion)
        let current = HealthKitBatchBuilder.externalIDNamespace(
            for: HealthKitAutomaticSynchronizationCoordinator.currentDayPredicateVersion
        )
        let repair = HealthKitBatchBuilder.externalIDNamespace(
            for: HealthKitSeptember23ActivityRepairContract.predicateVersion
        )
        let historicalDay = HealthKitBatchBuilder.externalIDNamespace(
            for: HealthKitAutomaticSynchronizationCoordinator.historicalDayPredicatePrefix + "2026-09-23"
        )
        XCTAssertEqual(canary, nil)
        XCTAssertEqual(testDay, "testday")
        XCTAssertEqual(workoutCanary, "workoutcanary")
        XCTAssertEqual(automatic, "automatic")
        XCTAssertEqual(current, automatic)
        XCTAssertEqual(historicalDay, automatic)
        XCTAssertEqual(repair, automatic)
        let registered = [testDay, workoutCanary, automatic].compactMap { $0 }
        XCTAssertEqual(registered.count, Set(registered).count, "every registered namespace must be pairwise distinct")
    }

    /// End-to-end proof at the `HealthKitBatchBuilder` level (one step
    /// short of the real Server round trip, but exercising the exact same
    /// identity-construction code the Server sees): building an Activity
    /// Summary batch for the canary's scope and for the automatic scope, on
    /// the same day, must never produce the same external id.
    func testBuildingTheSameDayForCanaryAndAutomaticScopesNeverProducesTheSameExternalID() throws {
        let day = "2027-01-15" // matches Self.occurrence()'s fixture localDate
        let summary = Self.activitySummaryAddition(moveCalories: 624)
        let result = HealthKitAnchoredQueryResult(
            additions: [summary], deletions: [], proposedAnchorData: Data("scope-check".utf8), completedAt: Self.now
        )
        let canaryScope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: .activitySummary, predicateVersion: "healthkit-activity-validation-only-v1:\(day):\(day)"
        )
        let automaticScope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: .activitySummary, predicateVersion: HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        )
        let canaryBatch = try HealthKitBatchBuilder().build(
            scope: canaryScope, previousCursor: nil, queryResult: result, createdAt: Self.now,
            ingestionPurpose: .validationOnly
        )
        let automaticBatch = try HealthKitBatchBuilder().build(
            scope: automaticScope, previousCursor: nil, queryResult: result, createdAt: Self.now
        )
        let canaryExternalID = try XCTUnwrap(canaryBatch.partitions.first?.additions.first?.immutableExternalID)
        let automaticExternalID = try XCTUnwrap(automaticBatch.partitions.first?.additions.first?.immutableExternalID)
        XCTAssertEqual(canaryExternalID, "activity-summary:\(day)", "the canary's identity format must stay exactly as-is (V1 compatibility)")
        XCTAssertEqual(automaticExternalID, "activity-summary:automatic:\(day)")
        XCTAssertNotEqual(canaryExternalID, automaticExternalID)
    }

    /// Activity and Nutrition must never collide with each other under the
    /// same namespace either -- they already don't (different string
    /// prefixes), and this fix must not change that.
    func testAutomaticActivityAndNutritionNeverShareAnExternalIDEvenOnTheSameDay() throws {
        let day = "2027-01-15" // matches Self.occurrence()'s fixture localDate
        let activityResult = HealthKitAnchoredQueryResult(
            additions: [Self.activitySummaryAddition(moveCalories: 624)], deletions: [],
            proposedAnchorData: Data("activity".utf8), completedAt: Self.now
        )
        let nutritionAddition = HealthKitQueryAddition(
            healthKitUUID: nil, objectTypeIdentifier: HealthKitSynchronizationStream.nutritionDailyTotal.objectTypeIdentifier,
            source: HealthKitQuerySource(bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil, productType: nil, privacySafeDeviceProvenance: nil),
            occurrence: Self.occurrence(),
            payload: .nutritionDailyTotal(HealthKitQueryNutritionDailyTotal(dailyNutrition: ["calories": 456], aggregationScope: HealthKitQueryNutritionDailyTotal.aggregationScope, coverage: .completeDay, sourceRevision: 1)),
            allowlistedMetadata: [:]
        )
        let nutritionResult = HealthKitAnchoredQueryResult(
            additions: [nutritionAddition], deletions: [], proposedAnchorData: Data("nutrition".utf8), completedAt: Self.now
        )
        let activityScope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: .activitySummary, predicateVersion: HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        )
        let nutritionScope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: .nutritionDailyTotal, predicateVersion: HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        )
        let activityBatch = try HealthKitBatchBuilder().build(scope: activityScope, previousCursor: nil, queryResult: activityResult, createdAt: Self.now)
        let nutritionBatch = try HealthKitBatchBuilder().build(scope: nutritionScope, previousCursor: nil, queryResult: nutritionResult, createdAt: Self.now)
        let activityID = try XCTUnwrap(activityBatch.partitions.first?.additions.first?.immutableExternalID)
        let nutritionID = try XCTUnwrap(nutritionBatch.partitions.first?.additions.first?.immutableExternalID)
        XCTAssertEqual(activityID, "activity-summary:automatic:\(day)")
        XCTAssertEqual(nutritionID, "nutrition-daily-total:automatic:\(day)")
        XCTAssertNotEqual(activityID, nutritionID)
    }

    /// Background wake and foreground catch-up both call
    /// `HealthKitBatchBuilder.build` with the identical `HealthKitCursorScope`
    /// (same `predicateVersion`) the coordinator constructs once per
    /// bootstrap -- this exercises the actual daily-aggregate branch that
    /// collided in production (a `.activeEnergy`-style UUID-bearing sample
    /// would short-circuit past the namespace entirely and prove nothing
    /// about this bug). "One identity, not two" is a claim about the PAIR
    /// the Server's purpose-immutability check keys on: (external id,
    /// ingestion purpose) -- not the external id alone, and not the
    /// per-attempt envelope/batch identity (which legitimately differs
    /// each call, chained to the prior cursor digest).
    func testAutomaticDailyAggregateConvergesOnOneExternalIDAndPurposeAcrossRepeatedBuilds() throws {
        let scope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: .activitySummary, predicateVersion: HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        )
        let result = HealthKitAnchoredQueryResult(
            additions: [Self.activitySummaryAddition(moveCalories: 624)], deletions: [],
            proposedAnchorData: Data("unchanged-day".utf8), completedAt: Self.now
        )
        // Same scope, same unchanged content, built twice -- simulating a
        // foreground catch-up and a background observer wake for the
        // identical revision. Neither call path passes an explicit
        // ingestionPurpose, so both take the default.
        let foreground = try HealthKitBatchBuilder().build(scope: scope, previousCursor: nil, queryResult: result, createdAt: Self.now)
        let background = try HealthKitBatchBuilder().build(scope: scope, previousCursor: nil, queryResult: result, createdAt: Self.now.addingTimeInterval(30))
        let foregroundObservation = try XCTUnwrap(foreground.partitions.first?.additions.first)
        let backgroundObservation = try XCTUnwrap(background.partitions.first?.additions.first)
        XCTAssertEqual(foregroundObservation.immutableExternalID, backgroundObservation.immutableExternalID)
        XCTAssertEqual(foreground.ingestionPurpose, .operational, "the automatic path always uses the default (omitted) purpose")
        XCTAssertEqual(foreground.ingestionPurpose, background.ingestionPurpose)

        // The exact shape of the Build 51/52 collision: the SAME external
        // id submitted under a DIFFERENT purpose (as if some other caller
        // mistakenly reused the automatic identity for a validation-only
        // upload). The identity alone is unaffected by purpose -- purpose
        // travels on the batch, not the identity string -- which is
        // precisely why namespacing the identity, not the purpose, is what
        // this fix relies on to keep automatic and canary uploads apart.
        let mismatchedPurpose = try HealthKitBatchBuilder().build(
            scope: scope, previousCursor: nil, queryResult: result, createdAt: Self.now, ingestionPurpose: .validationOnly
        )
        let mismatchedObservation = try XCTUnwrap(mismatchedPurpose.partitions.first?.additions.first)
        XCTAssertEqual(mismatchedObservation.immutableExternalID, foregroundObservation.immutableExternalID)
        XCTAssertNotEqual(mismatchedPurpose.ingestionPurpose, foreground.ingestionPurpose)
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

    func testRepeatedIdenticalDeferredDeletionDoesNotGrowDurableState() async throws {
        let checkpoint = HealthKitAnchoredQueryResult(
            additions: [], deletions: [], proposedAnchorData: Data("activity-anchor".utf8), completedAt: Self.now
        )
        let deletion = HealthKitQueryDeletion(
            healthKitUUID: UUID(uuidString: "40000000-0000-0000-0000-000000000002")!,
            immutableExternalID: "activity-summary:2026-09-23",
            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier
        )
        let absent = HealthKitAnchoredQueryResult(
            additions: [], deletions: [deletion], proposedAnchorData: Data("activity-anchor".utf8), completedAt: Self.now
        )
        let harness = try Harness(
            stream: .activitySummary,
            gate: .enabled,
            queryResults: [checkpoint, absent, absent]
        )

        try await harness.engine.synchronize(scope: harness.scope)
        try await harness.engine.synchronize(scope: harness.scope)
        try await harness.engine.synchronize(scope: harness.scope)

        let deferred = try await harness.store.deferredChanges(for: harness.scope)
        XCTAssertEqual(deferred.count, 1)
        XCTAssertEqual(deferred.first?.deletions, [HealthKitObservationNormalizer().normalize(deletion)])
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

    /// The three new diagnostics fields (`lastAbandonedBatchCode`,
    /// `lastAbandonedAt`, `abandonedBatchCount`) are `Optional`, not
    /// defaulted, specifically so decoding a real pre-fix envelope --
    /// persisted by a build that predates this fix and therefore never
    /// wrote those keys at all -- still succeeds, rather than hitting
    /// `load`'s generic decode-failure path (which would QUARANTINE the
    /// envelope and silently reset the cursor and any pending batch, wiping
    /// exactly the state this fix needs intact to self-heal).
    ///
    /// Swift's synthesized `Encodable` conformance omits an `Optional`
    /// property's key entirely when its value is `nil` (`encodeIfPresent`,
    /// not `encode` -- it does not write `null`), so ANY envelope written
    /// before an abandonment has ever happened is *already*, structurally,
    /// exactly what a real pre-fix envelope looks like for these three
    /// keys: this is not a scenario that needs manufacturing. This test
    /// proves both directions of the same guarantee: decoding succeeds
    /// when the keys are genuinely absent (before any abandonment), and
    /// still succeeds, now round-tripping real values, after a genuine
    /// abandonment has occurred and been persisted.
    func testDecodingEnvelopesWithAndWithoutTheNewDiagnosticsKeysBothSucceed() async throws {
        let first = Self.quantityResult(anchor: "anchor-1", UUID(uuidString: "00000000-0000-0000-0000-000000000001")!)
        let second = Self.quantityResult(anchor: "anchor-2", UUID(uuidString: "00000000-0000-0000-0000-000000000002")!)
        let harness = try Harness(
            stream: .activeEnergy, gate: .enabled, queryResults: [first, second], uploadModes: [.accept, .reject]
        )
        try await harness.engine.synchronize(scope: harness.scope)

        let dataBefore = try Data(contentsOf: await harness.store.stateFileURL(for: harness.scope))
        let jsonBefore = try XCTUnwrap(JSONSerialization.jsonObject(with: dataBefore) as? [String: Any])
        let diagnosticsBefore = try XCTUnwrap(jsonBefore["diagnostics"] as? [String: Any])
        for key in ["lastAbandonedBatchCode", "lastAbandonedAt", "abandonedBatchCount"] {
            XCTAssertNil(diagnosticsBefore[key], "a pre-abandonment envelope must omit \(key) entirely, matching a real pre-fix envelope")
        }
        let reopenedBefore = FileHealthKitSynchronizationStore(root: harness.root)
        let cursorBefore = try await reopenedBefore.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursorBefore, "decoding an envelope missing these keys must not quarantine the cursor")

        // Trigger a real rejection/abandonment, then confirm a fresh reopen
        // still decodes correctly with the keys now genuinely present.
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        let reopenedAfter = FileHealthKitSynchronizationStore(root: harness.root)
        let diagnosticsAfter = try await reopenedAfter.diagnostics(for: harness.scope)
        XCTAssertEqual(diagnosticsAfter.lastAbandonedBatchCode, "synthetic_rejection")
        XCTAssertNotNil(diagnosticsAfter.lastAbandonedAt)
        XCTAssertEqual(diagnosticsAfter.abandonedBatchCount, 1)
        XCTAssertNotEqual(diagnosticsAfter.lastErrorCode, "healthkit_cursor_corrupt_full_rescan_required", "must not be treated as corrupt")
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

    func testForegroundQueryFailurePersistsDiagnosticErrorCode() async throws {
        let harness = try Harness(stream: .activeEnergy, gate: .enabled, queryResults: [])

        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }

        let diagnostics = try await harness.store.diagnostics(for: harness.scope)
        XCTAssertEqual(diagnostics.lastErrorCode, "mock_query_exhausted")
    }

    fileprivate static let now = Date(timeIntervalSince1970: 1_800_000_000)

    private static func scope(_ stream: HealthKitSynchronizationStream) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: stream, predicateVersion: "healthkit-sync-v1"
        )
    }

    private static func automaticScope(_ stream: HealthKitSynchronizationStream) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: stream,
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.predicateVersion
        )
    }

    private static func currentDayScope(_ stream: HealthKitSynchronizationStream) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: stream,
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.currentDayPredicateVersion
        )
    }

    private static func historicalDayScope(
        _ stream: HealthKitSynchronizationStream,
        localDate: String
    ) -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: stream,
            predicateVersion: HealthKitAutomaticSynchronizationCoordinator.historicalDayPredicatePrefix + localDate
        )
    }

    private static func september23RepairScope() -> HealthKitCursorScope {
        HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: .activitySummary,
            predicateVersion: HealthKitSeptember23ActivityRepairContract.predicateVersion
        )
    }

    private static func september23ServerFacts(
        authenticatedDeviceId: String = "server-device-a",
        runtimeSHA: String = HealthKitSeptember23ActivityRepairContract.productionServerSHA,
        dailyPolicyDigest: String = HealthKitSeptember23ActivityRepairContract.dailyPolicyDigest,
        canonicalDayCount: Int = HealthKitSeptember23ActivityRepairContract.expectedCanonicalDayCount,
        canonicalRevision: UInt64 = HealthKitSeptember23ActivityRepairContract.expectedCurrentRevision,
        canonicalSourceRevision: UInt64 = HealthKitSeptember23ActivityRepairContract.expectedCurrentSourceRevision,
        sourceObservationCount: Int = HealthKitSeptember23ActivityRepairContract.expectedSourceObservationCount,
        historyCount: Int = HealthKitSeptember23ActivityRepairContract.expectedHistoryCount,
        september24ActivityCanonicalDayCount: Int = 0
    ) -> HealthKitSeptember23ActivityRepairServerFacts {
        HealthKitSeptember23ActivityRepairServerFacts(
            contractVersion: "healthkit-sep23-activity-repair-preflight-v1",
            localDate: HealthKitSeptember23ActivityRepairContract.localDate,
            authenticatedDeviceId: authenticatedDeviceId,
            runtimeSHA: runtimeSHA,
            dailyPolicyDigest: dailyPolicyDigest,
            canonicalDayCount: canonicalDayCount,
            canonicalRevision: canonicalRevision,
            canonicalSourceRevision: canonicalSourceRevision,
            sourceObservationCount: sourceObservationCount,
            historyCount: historyCount,
            september24ActivityCanonicalDayCount: september24ActivityCanonicalDayCount
        )
    }

    private static func september23Authorization(
        digest: String
    ) -> HealthKitSeptember23ActivityRepairAuthorization {
        HealthKitSeptember23ActivityRepairAuthorization(
            contractVersion: HealthKitSeptember23ActivityRepairContract.contractVersion,
            approvedAggregateDigest: digest
        )
    }

    private static func repairDryRun(
        for result: HealthKitAnchoredQueryResult
    ) async throws -> HealthKitSeptember23ActivityRepairDryRun {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSRepairDigestSeed-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let engine = HealthKitSynchronizationEngine(
            queryClient: MockQueryClient(results: [result]), observerClient: MockObserverClient(),
            store: FileHealthKitSynchronizationStore(root: root), uploader: MockUploader(modes: []),
            featureGate: .enabled, now: { Self.now }
        )
        return try await engine.dryRunSeptember23ActivityRepair(scope: september23RepairScope())
    }

    fileprivate static func quantityResult(anchor: String, _ uuid: UUID) -> HealthKitAnchoredQueryResult {
        HealthKitAnchoredQueryResult(
            additions: [quantityAddition(uuid)], deletions: [],
            proposedAnchorData: Data(anchor.utf8), completedAt: now
        )
    }

    fileprivate static func activitySummaryResult(
        revision: UInt64,
        moveCalories: Double,
        cursorFingerprint: String
    ) -> HealthKitAnchoredQueryResult {
        let cursor = try! JSONSerialization.data(withJSONObject: [
            "entries": ["2026-09-23": ["fingerprint": cursorFingerprint, "revision": revision]],
        ], options: [.sortedKeys])
        return HealthKitAnchoredQueryResult(
            additions: [activitySummaryAddition(
                moveCalories: moveCalories,
                revision: revision,
                localDate: "2026-09-23"
            )],
            deletions: [], proposedAnchorData: cursor, completedAt: now
        )
    }

    fileprivate static func dailyActivityResult(
        localDate: String,
        revision: UInt64,
        moveCalories: Double,
        cursorFingerprint: String,
        exerciseMinutes: Double = 30,
        standHours: Double = 10
    ) -> HealthKitAnchoredQueryResult {
        let cursor = try! JSONSerialization.data(withJSONObject: [
            "entries": [localDate: ["fingerprint": cursorFingerprint, "revision": revision]],
        ], options: [.sortedKeys])
        return HealthKitAnchoredQueryResult(
            additions: [activitySummaryAddition(
                moveCalories: moveCalories,
                revision: revision,
                localDate: localDate,
                exerciseMinutes: exerciseMinutes,
                standHours: standHours
            )],
            deletions: [], proposedAnchorData: cursor, completedAt: now
        )
    }

    fileprivate static func nutritionDailyResult(
        revision: UInt64,
        calories: Double,
        cursorFingerprint: String
    ) -> HealthKitAnchoredQueryResult {
        let localDate = "2026-09-23"
        let start = ISO8601DateFormatter().date(from: "2026-09-23T07:00:00Z")!
        let cursor = try! JSONSerialization.data(withJSONObject: [
            "entries": [localDate: ["fingerprint": cursorFingerprint, "revision": revision]],
        ], options: [.sortedKeys])
        let addition = HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.nutritionDailyTotal.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil,
                productType: nil, privacySafeDeviceProvenance: nil
            ),
            occurrence: HealthKitQueryOccurrence(
                startedAt: nil, endedAt: nil, localDate: localDate,
                calendarIdentifier: "gregorian", timeZoneIdentifier: "America/Los_Angeles",
                utcOffsetSeconds: -25_200, localDayStartedAt: start,
                localDayEndedAt: start.addingTimeInterval(86_400)
            ),
            payload: .nutritionDailyTotal(HealthKitQueryNutritionDailyTotal(
                dailyNutrition: ["calories": calories, "protein_g": 180],
                aggregationScope: HealthKitQueryNutritionDailyTotal.aggregationScope,
                coverage: .completeDay,
                sourceRevision: revision
            )),
            allowlistedMetadata: [:]
        )
        return HealthKitAnchoredQueryResult(
            additions: [addition], deletions: [], proposedAnchorData: cursor, completedAt: now
        )
    }

    fileprivate static func dailyNutritionResult(
        localDate: String,
        revision: UInt64,
        calories: Double,
        protein: Double,
        cursorFingerprint: String
    ) -> HealthKitAnchoredQueryResult {
        let start = ISO8601DateFormatter().date(from: "\(localDate)T08:00:00Z") ?? now
        let cursor = try! JSONSerialization.data(withJSONObject: [
            "entries": [localDate: ["fingerprint": cursorFingerprint, "revision": revision]],
        ], options: [.sortedKeys])
        let addition = HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.nutritionDailyTotal.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil,
                productType: nil, privacySafeDeviceProvenance: nil
            ),
            occurrence: HealthKitQueryOccurrence(
                startedAt: nil, endedAt: nil, localDate: localDate,
                calendarIdentifier: "gregorian", timeZoneIdentifier: "America/Los_Angeles",
                utcOffsetSeconds: -28_800, localDayStartedAt: start,
                localDayEndedAt: start.addingTimeInterval(86_400)
            ),
            payload: .nutritionDailyTotal(HealthKitQueryNutritionDailyTotal(
                dailyNutrition: ["calories": calories, "protein_g": protein],
                aggregationScope: HealthKitQueryNutritionDailyTotal.aggregationScope,
                coverage: .completeDay,
                sourceRevision: revision
            )),
            allowlistedMetadata: [:]
        )
        return HealthKitAnchoredQueryResult(
            additions: [addition], deletions: [], proposedAnchorData: cursor, completedAt: now
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

    private static func activitySummaryAddition(
        moveCalories: Double,
        revision: UInt64 = 1,
        localDate: String = "2027-01-15",
        exerciseMinutes: Double = 30,
        standHours: Double = 10
    ) -> HealthKitQueryAddition {
        let start = ISO8601DateFormatter().date(from: "\(localDate)T08:00:00Z") ?? now
        return HealthKitQueryAddition(
            healthKitUUID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.activitySummary.objectTypeIdentifier,
            source: HealthKitQuerySource(
                bundleIdentifier: "com.apple.Health", sourceName: "Apple Health", sourceRevision: nil,
                productType: nil, privacySafeDeviceProvenance: nil
            ),
            occurrence: HealthKitQueryOccurrence(
                startedAt: nil, endedAt: nil, localDate: localDate,
                calendarIdentifier: "gregorian", timeZoneIdentifier: "America/Los_Angeles",
                utcOffsetSeconds: -25_200, localDayStartedAt: start,
                localDayEndedAt: start.addingTimeInterval(86_400)
            ),
            payload: .activitySummary(HealthKitQueryActivitySummary(
                dailyActivity: [
                    "move_calories": moveCalories,
                    "exercise_minutes": exerciseMinutes,
                    "stand_hours": standHours,
                ],
                aggregationScope: "daily_total_including_workouts", coverage: .completeDay, sourceRevision: revision
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
        uploadModes: [MockUploader.Mode] = [],
        predicateVersion: String = "healthkit-sync-v1"
    ) throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("PhysiqueOSHealthKitTests-\(UUID().uuidString)", isDirectory: true)
        scope = HealthKitCursorScope(
            ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a",
            stream: stream, predicateVersion: predicateVersion
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
    private var bounds: [HealthKitQueryBounds?] = []
    private var streams: [HealthKitSynchronizationStream] = []

    init(results: [HealthKitAnchoredQueryResult]) { self.results = results }

    func execute(
        stream: HealthKitSynchronizationStream,
        after anchorData: Data?,
        bounds: HealthKitQueryBounds?
    ) async throws -> HealthKitAnchoredQueryResult {
        anchors.append(anchorData)
        self.bounds.append(bounds)
        streams.append(stream)
        guard !results.isEmpty else { throw HealthKitSyncError.operational(code: "mock_query_exhausted") }
        return results.removeFirst()
    }

    func callCount() -> Int { anchors.count }
    func receivedAnchors() -> [Data?] { anchors }
    func receivedBounds() -> [HealthKitQueryBounds?] { bounds }
    func receivedStreams() -> [HealthKitSynchronizationStream] { streams }
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

private actor MockUploader: HealthKitObservationUploader, HealthKitRevisionRecoveryAuthoritySource {
    enum Mode {
        case accept
        case acceptAndCancel
        case transient
        case reject
        case dailyCollision(
            observationType: HealthKitS1ObservationType = .activitySummary,
            localDate: String = "2026-09-23",
            received: UInt64,
            nextExpected: UInt64,
            identityDigest: String? = nil
        )
    }
    private var modes: [Mode]
    private var received: [HealthKitStagedPartition] = []
    private var completionProbe: CompletionProbe?
    private var sawCompletedBeforeUpload = false
    private let serverDeviceIdentity: String
    private var serverFacts: HealthKitSeptember23ActivityRepairServerFacts

    init(
        modes: [Mode],
        serverDeviceIdentity: String = "server-device-a",
        serverFacts: HealthKitSeptember23ActivityRepairServerFacts? = nil
    ) {
        self.modes = modes
        self.serverDeviceIdentity = serverDeviceIdentity
        self.serverFacts = serverFacts ?? HealthKitSeptember23ActivityRepairServerFacts(
            contractVersion: "healthkit-sep23-activity-repair-preflight-v1",
            localDate: HealthKitSeptember23ActivityRepairContract.localDate,
            authenticatedDeviceId: serverDeviceIdentity,
            runtimeSHA: HealthKitSeptember23ActivityRepairContract.productionServerSHA,
            dailyPolicyDigest: HealthKitSeptember23ActivityRepairContract.dailyPolicyDigest,
            canonicalDayCount: HealthKitSeptember23ActivityRepairContract.expectedCanonicalDayCount,
            canonicalRevision: HealthKitSeptember23ActivityRepairContract.expectedCurrentRevision,
            canonicalSourceRevision: HealthKitSeptember23ActivityRepairContract.expectedCurrentSourceRevision,
            sourceObservationCount: HealthKitSeptember23ActivityRepairContract.expectedSourceObservationCount,
            historyCount: HealthKitSeptember23ActivityRepairContract.expectedHistoryCount,
            september24ActivityCanonicalDayCount: 0
        )
    }

    func healthKitAuthenticatedDeviceIdentity() async throws -> String { serverDeviceIdentity }
    func healthKitSeptember23ActivityRepairPreflight() async throws -> HealthKitSeptember23ActivityRepairServerFacts {
        serverFacts
    }
    func setServerFacts(_ facts: HealthKitSeptember23ActivityRepairServerFacts) { serverFacts = facts }

    func setCompletionProbe(_ probe: CompletionProbe) { completionProbe = probe }

    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult {
        received.append(partition)
        if completionProbe?.isCompleted == true { sawCompletedBeforeUpload = true }
        let mode = modes.isEmpty ? .accept : modes.removeFirst()
        switch mode {
        case .accept:
            return .durablyAccepted(batchID: partition.identity, receiptIdentity: "receipt-\(partition.identity)")
        case .acceptAndCancel:
            withUnsafeCurrentTask { $0?.cancel() }
            return .durablyAccepted(batchID: partition.identity, receiptIdentity: "receipt-\(partition.identity)")
        case .transient:
            return .transientFailure(code: "synthetic_lost_ack")
        case .reject:
            return .rejected(code: "synthetic_rejection")
        case let .dailyCollision(observationType, localDate, received, nextExpected, identityDigest):
            let addition = partition.additions.first
            return .rejected(
                code: "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION",
                recovery: HealthKitDailyRevisionRecovery(
                    observationType: observationType,
                    localDate: localDate,
                    receivedSourceRevision: received,
                    nextExpectedRevision: nextExpected,
                    identityDigest: identityDigest ?? HealthKitDailyRevisionRecovery.identityDigest(
                        observationType: observationType,
                        externalID: addition?.immutableExternalID ?? "missing",
                        bundleIdentifier: addition?.source.bundleIdentifier ?? "missing",
                        deliveryDeviceID: serverDeviceIdentity,
                        ingestionPurpose: partition.ingestionPurpose
                    )
                )
            )
        }
    }

    func receivedCount() -> Int { received.count }
    func receivedIdentities() -> [String] { received.map(\.identity) }
    func receivedSizes() -> [Int] { received.map(\.additions.count) }
    func receivedDailyRevisions() -> [UInt64] {
        received.flatMap(\.additions).compactMap {
            switch $0.payload {
            case let .activitySummary(summary): summary.sourceRevision
            case let .nutritionDailyTotal(summary): summary.sourceRevision
            default: nil
            }
        }
    }
    func receivedExternalIDs() -> [String] {
        received.flatMap(\.additions).map(\.immutableExternalID)
    }
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
