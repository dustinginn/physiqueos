import HealthKit
import XCTest
@testable import PhysiqueOS

/// Phase B: the dormant Native Sleep path against the Phase A Server contract
/// `healthkit-sleep-ingestion-v1`. Synthetic data only.
final class HealthKitSleepIngestionTests: XCTestCase {
    // MARK: Capability / gate

    func testAbsentOrDisabledCapabilityResolvesOff() {
        XCTAssertNil(HealthKitSleepCapability.resolve(manifestBlock: nil, at: SleepFixtures.now).activeFloor(at: SleepFixtures.now))
        let off = HealthKitSleepCapability.resolve(manifestBlock: SleepFixtures.block(enabled: false), at: SleepFixtures.now)
        XCTAssertFalse(off.enabled)
        XCTAssertNil(off.activeFloor(at: SleepFixtures.now))
    }

    func testMalformedCapabilityFailsClosed() {
        let malformed: [ProductionJSONValue] = [
            .string("enabled"),
            SleepFixtures.block(overrides: ["enabled": .string("true")]),
            SleepFixtures.block(overrides: ["commandType": .string("healthkit.observations.ingest.v1")]),
            SleepFixtures.block(overrides: ["contractVersion": .string("healthkit-sleep-ingestion-v2")]),
            SleepFixtures.block(overrides: ["mode": .string("strategic")]),
            SleepFixtures.block(overrides: ["mode": .null]),
            SleepFixtures.block(overrides: ["activationFloor": .null]),
            SleepFixtures.block(overrides: ["activationFloor": .string("2026-10-03")]),
            SleepFixtures.block(overrides: ["effectiveSleepDay": .string("2026-02-30")]),
            SleepFixtures.block(overrides: ["endSleepDay": .string("2026-10-01")]),
            SleepFixtures.block(overrides: ["endSleepDay": .number(20261010)]),
            SleepFixtures.block(overrides: ["maximumSamplesPerBatch": .number(500)]),
            SleepFixtures.block(overrides: ["maximumManifestLiveIds": .number(5000)]),
        ]
        for block in malformed {
            let capability = HealthKitSleepCapability.resolve(manifestBlock: block, at: SleepFixtures.now)
            XCTAssertNil(capability.activeFloor(at: SleepFixtures.now), "\(block)")
        }
    }

    func testValidCapabilityActivatesWithProspectiveFloorAndBoundedWindowExpires() throws {
        let open = HealthKitSleepCapability.resolve(manifestBlock: SleepFixtures.block(), at: SleepFixtures.now)
        XCTAssertEqual(open.activeFloor(at: SleepFixtures.now), SleepFixtures.floor)
        XCTAssertEqual(open.mode, .operational)
        let validation = HealthKitSleepCapability.resolve(
            manifestBlock: SleepFixtures.block(overrides: ["mode": .string("validation_only"), "endSleepDay": .string("2026-10-05")]),
            at: SleepFixtures.now
        )
        XCTAssertEqual(validation.mode, .validationOnly)
        XCTAssertEqual(validation.activeFloor(at: SleepFixtures.now), SleepFixtures.floor)
        // endSleepDay + 1 day of Server slack, then OFF.
        XCTAssertNil(validation.activeFloor(at: SleepFixtures.date("2026-10-08T00:00:01Z")))
    }

    func testGatePersistsLastKnownStateAndLatchesOffOnServerDisabled() {
        let store = InMemorySleepCapabilityStore()
        let gate = HealthKitSleepActivationGate(store: store)
        XCTAssertNil(gate.activeFloor(at: SleepFixtures.now), "absent persisted state is OFF")
        gate.update(HealthKitSleepCapability.resolve(manifestBlock: SleepFixtures.block(), at: SleepFixtures.now))
        XCTAssertEqual(HealthKitSleepActivationGate(store: store).activeFloor(at: SleepFixtures.now), SleepFixtures.floor,
                       "a background launch (fresh gate) sees the persisted capability")
        gate.markServerDisabled(at: SleepFixtures.now)
        XCTAssertNil(gate.activeFloor(at: SleepFixtures.now))
        XCTAssertNil(HealthKitSleepActivationGate(store: store).activeFloor(at: SleepFixtures.now))
    }

    // MARK: Engine gating

    func testInactiveGateMeansNoQueryNoStagingNoObserverNoBackgroundDelivery() async throws {
        let harness = try SleepEngineHarness(gate: SleepFixtures.inactiveGate())
        await assertNotActivated { try await harness.engine.synchronize(scope: harness.scope) }
        await assertNotActivated { try await harness.engine.startObserving(scope: harness.scope) }
        await assertNotActivated { try await harness.engine.enableBackgroundDelivery(scope: harness.scope) }
        await assertNotActivated { try await harness.engine.resumePending(scope: harness.scope) }
        let queries = await harness.query.callCount()
        let uploads = await harness.uploader.payloads().count
        XCTAssertEqual(queries, 0)
        XCTAssertEqual(uploads, 0)
        XCTAssertEqual(harness.observer.registrationCount, 0)
        XCTAssertEqual(harness.observer.backgroundEnableCount, 0)
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertTrue(pending.isEmpty)
    }

    func testSleepIsRefusedOutsideItsDedicatedCursorNamespace() async throws {
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), predicateVersion: "healthkit-automatic-v1")
        await assertNotActivated { try await harness.engine.synchronize(scope: harness.scope) }
        let queries = await harness.query.callCount()
        XCTAssertEqual(queries, 0)
    }

    func testActiveGateUploadsSamplesAndDeletionsTogetherAndAdvancesCursorOnlyAfterAcknowledgement() async throws {
        let result = SleepFixtures.result(
            additions: [SleepFixtures.addition(id: 1, stage: 4), SleepFixtures.addition(id: 2, stage: 5, source: .oura)],
            deletions: [SleepFixtures.deletion(id: 9)]
        )
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), results: [result], modes: [.transient, .accept])
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        var cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursor, "no cursor advance before a durable acknowledgement")
        let firstPending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(firstPending.count, 1)

        // Relaunch/next wake: the staged partition replays; no second query.
        try await harness.engine.synchronize(scope: harness.scope)
        cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor)
        let queries = await harness.query.callCount()
        XCTAssertEqual(queries, 1)
        let payloads = await harness.uploader.payloads()
        XCTAssertEqual(payloads.count, 2)
        XCTAssertEqual(payloads[0], payloads[1], "duplicate delivery replays the identical request")
        XCTAssertEqual(payloads[0].samples?.map(\.externalId), [SleepFixtures.uuid(1), SleepFixtures.uuid(2)])
        XCTAssertEqual(payloads[0].deletions, [HealthKitSleepWireDeletion(externalId: SleepFixtures.uuid(9))])
        let batchIDs = await harness.uploader.batchIDs()
        XCTAssertEqual(Set(batchIDs).count, 1)
    }

    func testActivationFloorPreventsBackfillAndKeepsFloorStraddlingSample() async throws {
        let result = SleepFixtures.result(additions: [
            SleepFixtures.addition(id: 1, start: "2026-10-01T06:00:00Z", end: "2026-10-01T14:00:00Z"),
            SleepFixtures.addition(id: 2, start: "2026-10-02T23:00:00Z", end: "2026-10-03T01:30:00Z"),
            SleepFixtures.addition(id: 3, start: "2026-10-03T06:00:00Z", end: "2026-10-03T14:00:00Z"),
        ])
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), results: [result])
        try await harness.engine.synchronize(scope: harness.scope)
        let payloads = await harness.uploader.payloads()
        XCTAssertEqual(payloads.first?.samples?.map(\.externalId), [SleepFixtures.uuid(2), SleepFixtures.uuid(3)])
    }

    func testServerDisabled409RetainsStagingAndCursorLatchesGateAndResumesLater() async throws {
        let gate = SleepFixtures.activeGate()
        let result = SleepFixtures.result(additions: [SleepFixtures.addition(id: 1)])
        let harness = try SleepEngineHarness(gate: gate, results: [result], modes: [.disabled(gate), .accept])
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        let pending = try await harness.store.pendingBatches(for: harness.scope)
        XCTAssertEqual(pending.count, 1, "409 keeps the staged batch")
        XCTAssertEqual(pending.first?.partitions.first?.attemptState, .transientFailure(code: HealthKitSleepIngestionContract.disabledDiagnosticCode))
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursor)
        XCTAssertNil(gate.activeFloor(at: SleepFixtures.now), "409 latches the gate off")

        // While latched off: no query and no upload at all.
        await assertNotActivated { try await harness.engine.synchronize(scope: harness.scope) }
        var uploads = await harness.uploader.payloads().count
        XCTAssertEqual(uploads, 1)

        // A later manifest read re-enables: the SAME staged batch is delivered.
        gate.update(HealthKitSleepCapability.resolve(manifestBlock: SleepFixtures.block(), at: SleepFixtures.now))
        try await harness.engine.synchronize(scope: harness.scope)
        uploads = await harness.uploader.payloads().count
        XCTAssertEqual(uploads, 2)
        let queries = await harness.query.callCount()
        XCTAssertEqual(queries, 1)
        let advanced = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(advanced)
    }

    func testContractBug400FailsClosedWithoutAdvancingCursor() async throws {
        let result = SleepFixtures.result(additions: [SleepFixtures.addition(id: 1)])
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), results: [result], modes: [.reject("HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED")])
        await XCTAssertThrowsErrorAsync { try await harness.engine.synchronize(scope: harness.scope) }
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNil(cursor, "a rejected request never counts as delivered")
        let diagnostics = try await harness.store.diagnostics(for: harness.scope)
        XCTAssertEqual(diagnostics.lastAbandonedBatchCode, "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED")
    }

    func testDeletionOnlyAndDeletionBeforeAddBothReachTheServer() async throws {
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), results: [
            SleepFixtures.result(deletions: [SleepFixtures.deletion(id: 7)], anchor: "a1"),
            SleepFixtures.result(additions: [SleepFixtures.addition(id: 7)], anchor: "a2"),
        ])
        try await harness.engine.synchronize(scope: harness.scope)
        try await harness.engine.synchronize(scope: harness.scope)
        let payloads = await harness.uploader.payloads()
        XCTAssertEqual(payloads.count, 2)
        XCTAssertNil(payloads[0].samples)
        XCTAssertEqual(payloads[0].deletions?.map(\.externalId), [SleepFixtures.uuid(7)],
                       "an unknown UUID still reaches the Server as tombstone input")
        XCTAssertEqual(payloads[1].samples?.map(\.externalId), [SleepFixtures.uuid(7)])
    }

    func testAllStageValuesAndUnknownFutureValuesPassThroughUnchanged() async throws {
        let values = [0, 1, 2, 3, 4, 5, 6, 42]
        let result = SleepFixtures.result(additions: values.enumerated().map { SleepFixtures.addition(id: $0.offset + 1, stage: $0.element) })
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), results: [result])
        try await harness.engine.synchronize(scope: harness.scope)
        let payloads = await harness.uploader.payloads()
        XCTAssertEqual(payloads.first?.samples?.map(\.categoryValue), values)
    }

    func testMoreThanOneHundredChangesPartitionWithinContractLimits() async throws {
        let result = SleepFixtures.result(
            additions: (1...150).map { SleepFixtures.addition(id: $0) },
            deletions: (1001...1030).map { SleepFixtures.deletion(id: $0) }
        )
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate(), results: [result])
        try await harness.engine.synchronize(scope: harness.scope)
        let payloads = await harness.uploader.payloads()
        XCTAssertEqual(payloads.map { $0.samples?.count ?? 0 }, [100, 50])
        XCTAssertEqual(payloads.map { $0.deletions?.count ?? 0 }, [30, 0])
        let cursor = try await harness.store.authoritativeCursor(for: harness.scope)
        XCTAssertNotNil(cursor, "cursor waits for, then follows, every partition")
    }

    func testAnchorResetRecoveryStaysFloorBounded() async throws {
        let harness = try SleepEngineHarness(
            gate: SleepFixtures.activeGate(),
            results: [SleepFixtures.result(additions: [
                SleepFixtures.addition(id: 1, start: "2026-09-01T06:00:00Z", end: "2026-09-01T14:00:00Z"),
                SleepFixtures.addition(id: 2),
            ])],
            corruptFirst: true
        )
        try await harness.engine.synchronize(scope: harness.scope)
        let anchors = await harness.query.receivedAnchors()
        XCTAssertEqual(anchors.count, 2)
        XCTAssertNil(anchors.last ?? Data())
        let payloads = await harness.uploader.payloads()
        XCTAssertEqual(payloads.first?.samples?.map(\.externalId), [SleepFixtures.uuid(2)],
                       "a reset anchor can never sweep pre-floor history")
        let diagnostics = try await harness.store.diagnostics(for: harness.scope)
        XCTAssertEqual(diagnostics.boundedRecoveryCount, 1)
    }

    func testObserverRegistrationIsIdempotentForTheSleepScope() async throws {
        let harness = try SleepEngineHarness(gate: SleepFixtures.activeGate())
        try await harness.engine.startObserving(scope: harness.scope)
        try await harness.engine.startObserving(scope: harness.scope)
        try await harness.engine.enableBackgroundDelivery(scope: harness.scope)
        XCTAssertEqual(harness.observer.registrationCount, 1)
        XCTAssertEqual(harness.observer.registeredStreams, [.sleepAnalysis])
        XCTAssertEqual(harness.observer.backgroundEnableCount, 1)
    }

    func testLockedDeviceWakeReleasesCompletionWithoutAnyProgress() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("SleepLocked-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let scope = SleepFixtures.scope()
        try await FileHealthKitSynchronizationStore(root: root).recordObserverWakeup(for: scope, at: SleepFixtures.now)
        let locked = FileHealthKitSynchronizationStore(root: root, dataReader: { _ in
            throw NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoPermissionError)
        })
        let query = SleepQueryMock(results: [SleepFixtures.result(additions: [SleepFixtures.addition(id: 1)])])
        let uploader = SleepUploaderMock(modes: [])
        let engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: SleepObserverMock(), store: locked, uploader: uploader,
            featureGate: .n1Automatic, sleepActivation: SleepFixtures.activeGate(), now: { SleepFixtures.now }
        )
        let completions = SleepCounter()
        await engine.handleObserverWake(scope: scope) { completions.increment() }
        XCTAssertEqual(completions.value, 1)
        let queries = await query.callCount()
        let uploads = await uploader.payloads().count
        XCTAssertEqual(queries, 0)
        XCTAssertEqual(uploads, 0)
        // Unlock: the protected state is intact (nothing was quarantined).
        let reopened = FileHealthKitSynchronizationStore(root: root)
        let diagnostics = try await reopened.diagnostics(for: scope)
        XCTAssertEqual(diagnostics.boundedRecoveryCount, 0)
    }

    func testProtectedDataTriggerInstallsOnceAndFiresOnUnlock() async {
        let center = NotificationCenter()
        defer { ProtectedDataRecoveryTrigger.uninstall(center: center) }
        let fired = SleepCounter()
        XCTAssertTrue(ProtectedDataRecoveryTrigger.install(center: center) { fired.increment() })
        XCTAssertFalse(ProtectedDataRecoveryTrigger.install(center: center) { fired.increment() })
        center.post(name: UIApplication.protectedDataDidBecomeAvailableNotification, object: nil)
        XCTAssertEqual(fired.value, 1)
    }

    // MARK: Query predicate / observer

    func testSleepPredicateIsAlwaysTheFloorAndNeverUnbounded() {
        let bounds = HealthKitQueryBounds(
            startDateInclusive: SleepFixtures.date("2020-01-01T00:00:00Z"),
            endDateExclusive: SleepFixtures.now,
            startLocalDate: "2020-01-01", endLocalDate: "2026-10-05", timeZoneIdentifier: "UTC"
        )
        XCTAssertEqual(SystemHealthKitQueryClient.samplePredicateDecision(stream: .sleepAnalysis, requested: nil, workoutFloor: nil), .refused)
        XCTAssertEqual(SystemHealthKitQueryClient.samplePredicateDecision(stream: .sleepAnalysis, requested: bounds, workoutFloor: nil), .refused)
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .sleepAnalysis, requested: bounds, workoutFloor: nil, sleepFloor: SleepFixtures.floor),
            .sleepFloor(SleepFixtures.floor)
        )
        // Other streams are untouched by the Sleep floor.
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .workouts, requested: nil, workoutFloor: SleepFixtures.floor, sleepFloor: SleepFixtures.now),
            .workoutFloor(SleepFixtures.floor)
        )
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .heartRate, requested: nil, workoutFloor: nil, sleepFloor: SleepFixtures.floor),
            .unbounded
        )
    }

    func testSleepObserverRegistersTheConcreteSleepTypeHourly() {
        XCTAssertEqual(
            SystemHealthKitObserverClient.observerTypes(for: .sleepAnalysis).map(\.identifier),
            [HKCategoryTypeIdentifier.sleepAnalysis.rawValue]
        )
        XCTAssertEqual(SystemHealthKitObserverClient.backgroundDeliveryFrequency(for: .sleepAnalysis), .hourly)
        XCTAssertEqual(SystemHealthKitObserverClient.backgroundDeliveryFrequency(for: .workouts), .immediate)
    }

    // MARK: Wire / privacy

    func testWirePayloadCarriesExactlyThePhaseAFields() throws {
        let partition = try SleepFixtures.stagedPartition(
            additions: [SleepFixtures.addition(id: 1, source: .watch)], deletions: [SleepFixtures.deletion(id: 2)]
        )
        let payload = try HealthKitSleepWireMapper.payload(for: partition)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["batchId", "samples", "deletions"])
        let sample = try XCTUnwrap((json["samples"] as? [[String: Any]])?.first)
        XCTAssertEqual(Set(sample.keys), [
            "externalId", "categoryValue", "startedAt", "endedAt", "timeZone", "timeZoneSource", "wasUserEntered", "source",
        ])
        XCTAssertEqual(Set((sample["source"] as? [String: Any] ?? [:]).keys), ["bundleIdentifier", "sourceVersion", "productType"])
        XCTAssertEqual(sample["startedAt"] as? String, "2026-10-04T06:00:00.000Z")
        let text = String(decoding: try JSONEncoder().encode(payload), as: UTF8.self)
        // Forbidden keys (the value "sample_metadata" is a legitimate enum).
        for forbidden in ["\"sourceName\"", "\"name\"", "\"deviceName\"", "\"device\"", "\"localIdentifier\"",
                          "\"udiDeviceIdentifier\"", "\"firmwareVersion\"", "\"metadata\"", "HKDevice", "Personal"] {
            XCTAssertFalse(text.contains(forbidden), forbidden)
        }
    }

    func testSourceBundlesPassThroughWithoutAnyNativePreference() throws {
        let partition = try SleepFixtures.stagedPartition(additions: [
            SleepFixtures.addition(id: 1, source: .oura),
            SleepFixtures.addition(id: 2, source: .watch),
            SleepFixtures.addition(id: 3, source: .sleepCycle),
            SleepFixtures.addition(id: 4, source: .manual, userEntered: true),
        ])
        let samples = try XCTUnwrap(HealthKitSleepWireMapper.payload(for: partition).samples)
        XCTAssertEqual(samples.map(\.source.bundleIdentifier), [
            "com.ouraring.oura", "com.apple.health.9F2A", "com.lexwarelabs.goodmorning", "com.apple.Health",
        ])
        XCTAssertEqual(samples.map(\.wasUserEntered), [false, false, false, true])
        XCTAssertEqual(samples.map(\.source.productType), ["iPhone16,1", "Watch7,1", "iPhone16,1", "iPhone16,1"])
    }

    func testTimeZoneMetadataPresentOrMissingIsRecordedExplicitly() throws {
        let partition = try SleepFixtures.stagedPartition(additions: [
            SleepFixtures.addition(id: 1, zone: "Asia/Tokyo", zoneSource: "sample_metadata"),
            SleepFixtures.addition(id: 2, zone: "America/Los_Angeles", zoneSource: nil),
        ])
        let samples = try XCTUnwrap(HealthKitSleepWireMapper.payload(for: partition).samples)
        XCTAssertEqual(samples.map(\.timeZone), ["Asia/Tokyo", "America/Los_Angeles"])
        XCTAssertEqual(samples.map(\.timeZoneSource), ["sample_metadata", "device_at_ingest"])
    }

    func testOnlyPureSleepPartitionsUseTheSleepCommand() throws {
        let sleep = try SleepFixtures.stagedPartition(additions: [SleepFixtures.addition(id: 1)])
        XCTAssertTrue(HealthKitSleepWireMapper.isSleepPartition(sleep))
        let empty = try SleepFixtures.stagedPartition(additions: [])
        XCTAssertFalse(HealthKitSleepWireMapper.isSleepPartition(empty))
        let workoutDeletion = HealthKitStagedPartition(
            identity: "p", index: 0, ingestionPurpose: .operational, disposition: .serverRequired, additions: [],
            deletions: [NormalizedHealthKitDeletion(immutableExternalID: "x", healthKitUUID: UUID(), objectTypeIdentifier: "HKWorkoutTypeIdentifier")],
            attemptState: .pending, attemptCount: 0, lastAttemptAt: nil
        )
        XCTAssertFalse(HealthKitSleepWireMapper.isSleepPartition(workoutDeletion))
    }

    // MARK: Server responses

    func testResponseClassificationMatchesPhaseA() {
        XCTAssertEqual(HealthKitSleepResponseClassification.classify(ProductionNativeError.conflict(SleepFixtures.problem(409, "HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED"))), .disabled)
        XCTAssertEqual(HealthKitSleepResponseClassification.classify(ProductionNativeError.conflict(SleepFixtures.problem(409, "IDEMPOTENCY_KEY_REUSED"))), .rejected(code: "IDEMPOTENCY_KEY_REUSED"))
        XCTAssertEqual(HealthKitSleepResponseClassification.classify(ProductionNativeError.validation(SleepFixtures.problem(400, "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED"))), .rejected(code: "HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED"))
        XCTAssertEqual(HealthKitSleepResponseClassification.classify(ProductionNativeError.validation(SleepFixtures.problem(400, "HEALTHKIT_SLEEP_CONTRACT_INVALID"))), .rejected(code: "HEALTHKIT_SLEEP_CONTRACT_INVALID"))
        XCTAssertEqual(HealthKitSleepResponseClassification.classify(URLError(.notConnectedToInternet)), .transient(code: "healthkit_sleep_upload_failed"))
    }

    func testIngestResultMustAcknowledgeEverySubmittedIdentityWithAKnownOutcome() throws {
        let payload = HealthKitSleepWirePayload(
            batchId: "b", samples: [try HealthKitSleepWireMapper.sample(SleepFixtures.normalized(SleepFixtures.addition(id: 1)))],
            deletions: [HealthKitSleepWireDeletion(externalId: SleepFixtures.uuid(2))], windowManifest: nil
        )
        func result(_ sampleOutcome: String, deletionOutcome: String = "tombstoned", batch: String = "b", ids: [String]? = nil) throws -> HealthKitSleepIngestResult {
            let body: [String: Any] = [
                "contractVersion": "healthkit-sleep-ingestion-v1", "batchId": batch,
                "samples": (ids ?? [SleepFixtures.uuid(1)]).map { ["externalId": $0, "outcome": sampleOutcome] },
                "deletions": [["externalId": SleepFixtures.uuid(2), "outcome": deletionOutcome]],
                "windowManifest": NSNull(), "sleepDays": [], "strategicEvidenceEligibility": "quarantined",
            ]
            return try JSONDecoder().decode(HealthKitSleepIngestResult.self, from: JSONSerialization.data(withJSONObject: body))
        }
        for outcome in HealthKitSleepIngestResult.sampleOutcomes {
            XCTAssertTrue(try result(outcome).acknowledges(payload), outcome)
        }
        XCTAssertFalse(try result("maybe_stored").acknowledges(payload))
        XCTAssertFalse(try result("stored", deletionOutcome: "gone").acknowledges(payload))
        XCTAssertFalse(try result("stored", batch: "other").acknowledges(payload))
        XCTAssertFalse(try result("stored", ids: []).acknowledges(payload))
    }

    // MARK: Window manifest

    func testWindowManifestPlanHonorsCadenceAndNeverPrecedesTheFloor() {
        XCTAssertEqual(HealthKitSleepWindowManifestPlan.plan(now: SleepFixtures.now, activationFloor: nil, lastSentAt: nil),
                       .skip(reason: HealthKitSleepIngestionContract.notActivatedDiagnosticCode))
        XCTAssertEqual(HealthKitSleepWindowManifestPlan.plan(now: SleepFixtures.now, activationFloor: SleepFixtures.floor, lastSentAt: nil),
                       .send(windowStart: SleepFixtures.floor, windowEnd: SleepFixtures.now), "window starts at the floor, not 72 h back")
        let later = SleepFixtures.date("2026-10-20T15:00:00Z")
        XCTAssertEqual(HealthKitSleepWindowManifestPlan.plan(now: later, activationFloor: SleepFixtures.floor, lastSentAt: nil),
                       .send(windowStart: later.addingTimeInterval(-72 * 3600), windowEnd: later))
        XCTAssertEqual(HealthKitSleepWindowManifestPlan.plan(now: later, activationFloor: SleepFixtures.floor, lastSentAt: later.addingTimeInterval(-11 * 3600)),
                       .skip(reason: "healthkit_sleep_manifest_cadence"))
        XCTAssertEqual(HealthKitSleepWindowManifestPlan.plan(now: later, activationFloor: SleepFixtures.floor, lastSentAt: later.addingTimeInterval(-13 * 3600)),
                       .send(windowStart: later.addingTimeInterval(-72 * 3600), windowEnd: later))
        XCTAssertEqual(HealthKitSleepWindowManifestPlan.plan(now: SleepFixtures.floor, activationFloor: SleepFixtures.floor, lastSentAt: nil),
                       .skip(reason: "healthkit_sleep_manifest_window_empty"))
    }

    func testWindowManifestSendsAllSourcesOnceAndRecordsCadenceOnlyOnAcceptance() async {
        let reader = SleepWindowReaderMock(ids: [UUID(uuidString: SleepFixtures.uuid(3))!, UUID(uuidString: SleepFixtures.uuid(1))!, UUID(uuidString: SleepFixtures.uuid(1))!])
        let submitter = SleepManifestSubmitterMock(results: [.failed(code: "healthkit_sleep_upload_unavailable"), .accepted(markedDeleted: 2)])
        let cadence = SleepCadenceStore()
        let sender = HealthKitSleepWindowManifestSender(
            gate: SleepFixtures.activeGate(), reader: reader, submitter: submitter, cadenceStore: cadence, now: { SleepFixtures.now }
        )
        let failed = await sender.sendIfDue()
        XCTAssertEqual(failed, .failed(code: "healthkit_sleep_upload_unavailable"))
        XCTAssertNil(cadence.lastSentAt(), "a failed submission is not recorded as sent")
        let sent = await sender.sendIfDue()
        XCTAssertEqual(sent, .sent(liveCount: 2, markedDeleted: 2))
        XCTAssertEqual(cadence.lastSentAt(), SleepFixtures.now)
        let skipped = await sender.sendIfDue()
        XCTAssertEqual(skipped, .skipped(reason: "healthkit_sleep_manifest_cadence"))
        let manifests = await submitter.received()
        XCTAssertEqual(manifests.last?.liveExternalIds, [SleepFixtures.uuid(1), SleepFixtures.uuid(3)])
        XCTAssertEqual(manifests.last?.windowStart, "2026-10-03T01:00:00.000Z")
        let reads = await reader.ranges()
        XCTAssertEqual(reads.first?.0, SleepFixtures.floor.addingTimeInterval(-60))
    }

    func testWindowManifestFailsClosedOnReadErrorEmptyListOrMoreThan1000IDs() async {
        let cases: [(SleepWindowReaderMock, HealthKitSleepManifestOutcome)] = [
            (SleepWindowReaderMock(error: true), .failed(code: "healthkit_sleep_manifest_read_failed")),
            (SleepWindowReaderMock(ids: []), .skipped(reason: "healthkit_sleep_manifest_no_live_samples")),
            (SleepWindowReaderMock(ids: (0..<1001).map { _ in UUID() }), .failed(code: "healthkit_sleep_manifest_too_many_ids")),
        ]
        for (reader, expected) in cases {
            let submitter = SleepManifestSubmitterMock(results: [.accepted(markedDeleted: 0)])
            let sender = HealthKitSleepWindowManifestSender(
                gate: SleepFixtures.activeGate(), reader: reader, submitter: submitter, cadenceStore: SleepCadenceStore(), now: { SleepFixtures.now }
            )
            let outcome = await sender.sendIfDue()
            XCTAssertEqual(outcome, expected)
            let submitted = await submitter.received()
            XCTAssertTrue(submitted.isEmpty, "nothing is sent when failing closed")
        }
    }

    func testWindowManifestIsInertWhileGateIsOffAndLatchesOffOn409() async {
        let reader = SleepWindowReaderMock(ids: [UUID()])
        let inactive = HealthKitSleepWindowManifestSender(
            gate: SleepFixtures.inactiveGate(), reader: reader, submitter: SleepManifestSubmitterMock(results: []),
            cadenceStore: SleepCadenceStore(), now: { SleepFixtures.now }
        )
        let off = await inactive.sendIfDue()
        XCTAssertEqual(off, .skipped(reason: HealthKitSleepIngestionContract.notActivatedDiagnosticCode))
        let readsWhileOff = await reader.ranges()
        XCTAssertTrue(readsWhileOff.isEmpty, "no HealthKit read while dormant")

        let gate = SleepFixtures.activeGate()
        let cadence = SleepCadenceStore()
        let sender = HealthKitSleepWindowManifestSender(
            gate: gate, reader: reader, submitter: SleepManifestSubmitterMock(results: [.disabled]), cadenceStore: cadence, now: { SleepFixtures.now }
        )
        let disabled = await sender.sendIfDue()
        XCTAssertEqual(disabled, .failed(code: HealthKitSleepIngestionContract.disabledDiagnosticCode))
        XCTAssertNil(gate.activeFloor(at: SleepFixtures.now))
        XCTAssertNil(cadence.lastSentAt())
    }

    // MARK: Deferred-change bound (shared persistence)

    func testDeferredChangesAreBoundedAndEveryRetirementIsCounted() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("SleepDeferred-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FileHealthKitSynchronizationStore(root: root)
        let scope = HealthKitCursorScope(ownerIdentity: "o", enrolledDeviceIdentity: "d", stream: .workouts, predicateVersion: "healthkit-automatic-v1")
        var previous: HealthKitAuthoritativeCursor?
        for index in 0..<40 {
            let batch = try HealthKitBatchBuilder().build(
                scope: scope,
                previousCursor: previous,
                queryResult: HealthKitAnchoredQueryResult(
                    additions: [],
                    deletions: [HealthKitQueryDeletion(healthKitUUID: UUID(), immutableExternalID: nil, objectTypeIdentifier: "HKWorkoutTypeIdentifier")],
                    proposedAnchorData: Data("anchor-\(index)".utf8),
                    completedAt: SleepFixtures.now
                ),
                createdAt: SleepFixtures.now
            )
            try await store.stage(batch)
            previous = try await store.authoritativeCursor(for: scope)
        }
        let deferred = try await store.deferredChanges(for: scope)
        XCTAssertEqual(deferred.count, FileHealthKitSynchronizationStore.maximumRetainedDeferredChanges)
        let diagnostics = try await store.diagnostics(for: scope)
        XCTAssertEqual(diagnostics.deferredChangesRetiredCount, 40 - FileHealthKitSynchronizationStore.maximumRetainedDeferredChanges)
        XCTAssertEqual(previous?.generation, 40, "bounding never blocks cursor progress")
    }

    // MARK: Coordinator (launch + foreground)

    @MainActor
    func testLaunchRegistrationRegistersSleepOnlyWhenPersistedCapabilityIsActive() async {
        let inactive = SleepCoordinatorHarness(gate: SleepFixtures.inactiveGate(), ownerIdentityCache: "user_founder_001")
        let off = await inactive.coordinator.registerObserversForBackgroundLaunch()
        XCTAssertFalse(off.sleepActive)
        let inactiveScopes = await inactive.synchronizer.observedScopes()
        XCTAssertFalse(inactiveScopes.contains { $0.stream == .sleepAnalysis })
        XCTAssertEqual(Set(inactiveScopes.map(\.stream)), [.activitySummary, .nutritionDailyTotal, .workouts])

        let active = SleepCoordinatorHarness(gate: SleepFixtures.activeGate(), ownerIdentityCache: "user_founder_001")
        let on = await active.coordinator.registerObserversForBackgroundLaunch()
        XCTAssertTrue(on.sleepActive)
        let scopes = await active.synchronizer.observedScopes()
        XCTAssertEqual(scopes.filter { $0.stream == .sleepAnalysis }.map(\.predicateVersion), [HealthKitSleepIngestionContract.predicateVersion])
        let background = await active.synchronizer.backgroundDeliveryScopes()
        XCTAssertTrue(background.contains { $0.stream == .sleepAnalysis })
        let syncs = await active.synchronizer.synchronizedScopes()
        XCTAssertTrue(syncs.isEmpty, "launch registration never queries or uploads")
    }

    @MainActor
    func testBootstrapRunsSleepOnlyWhenTheManifestEnablesItAndLeavesOtherStreamsUnchanged() async {
        let absent = SleepCoordinatorHarness(gate: SleepFixtures.inactiveGate(), capability: .success(nil))
        let off = await absent.coordinator.bootstrap()
        XCTAssertFalse(off.sleepActive)
        let offSyncs = await absent.synchronizer.synchronizedScopes()
        XCTAssertFalse(offSyncs.contains { $0.stream == .sleepAnalysis })

        let enabled = SleepCoordinatorHarness(gate: SleepFixtures.inactiveGate(), capability: .success(SleepFixtures.block()))
        let on = await enabled.coordinator.bootstrap()
        XCTAssertTrue(on.sleepActive)
        let syncs = await enabled.synchronizer.synchronizedScopes()
        XCTAssertEqual(syncs.filter { $0.stream == .sleepAnalysis }.map(\.predicateVersion), [HealthKitSleepIngestionContract.predicateVersion])
        XCTAssertEqual(
            Set(offSyncs.filter { $0.stream != .sleepAnalysis }),
            Set(syncs.filter { $0.stream != .sleepAnalysis }),
            "Activity/Nutrition/Workouts scopes are identical with or without Sleep"
        )

        // The Server turns Sleep off: the next bootstrap stops the lane.
        let disabled = SleepCoordinatorHarness(gate: SleepFixtures.activeGate(), capability: .success(SleepFixtures.block(enabled: false)))
        let stopped = await disabled.coordinator.bootstrap()
        XCTAssertFalse(stopped.sleepActive)
        let stoppedSyncs = await disabled.synchronizer.synchronizedScopes()
        XCTAssertFalse(stoppedSyncs.contains { $0.stream == .sleepAnalysis })
    }

    @MainActor
    func testBootstrapKeepsLastKnownCapabilityWhenTheManifestReadFails() async {
        let harness = SleepCoordinatorHarness(gate: SleepFixtures.activeGate(), capability: .failure)
        let outcome = await harness.coordinator.bootstrap()
        XCTAssertTrue(outcome.sleepActive)
        XCTAssertEqual(outcome.streamErrors[.sleepAnalysis]?.first, "sleep_capability_refresh_failed")
    }

    // MARK: Helpers

    private func assertNotActivated(_ body: () async throws -> Void, file: StaticString = #filePath, line: UInt = #line) async {
        do {
            try await body()
            XCTFail("expected Sleep to be refused", file: file, line: line)
        } catch let error as HealthKitSyncError {
            XCTAssertEqual(error.diagnosticCode, HealthKitSleepIngestionContract.notActivatedDiagnosticCode, file: file, line: line)
        } catch {
            XCTFail("unexpected \(error)", file: file, line: line)
        }
    }
}

// MARK: - Fixtures

enum SleepFixtures {
    enum Source { case watch, oura, sleepCycle, manual }

    static func date(_ text: String) -> Date { ISO8601DateFormatter().date(from: text)! }
    static let now = date("2026-10-05T15:00:00Z")
    /// (D0 - 1) 18:00 America/Los_Angeles for D0 = 2026-10-03.
    static let floor = date("2026-10-03T01:00:00Z")

    static func uuid(_ index: Int) -> String {
        String(format: "00000000-0000-4000-8000-%012d", index)
    }

    static func scope(predicateVersion: String = HealthKitSleepIngestionContract.predicateVersion) -> HealthKitCursorScope {
        HealthKitCursorScope(ownerIdentity: "owner-a", enrolledDeviceIdentity: "device-a", stream: .sleepAnalysis, predicateVersion: predicateVersion)
    }

    static func block(enabled: Bool = true, overrides: [String: ProductionJSONValue] = [:]) -> ProductionJSONValue {
        var value: [String: ProductionJSONValue] = [
            "commandType": .string("healthkit.sleep.ingest.v1"),
            "contractVersion": .string("healthkit-sleep-ingestion-v1"),
            "enabled": .bool(enabled),
            "mode": enabled ? .string("operational") : .null,
            "effectiveSleepDay": enabled ? .string("2026-10-03") : .null,
            "endSleepDay": .null,
            "activationFloor": enabled ? .string("2026-10-03T01:00:00.000Z") : .null,
            "maximumSamplesPerBatch": .number(100),
            "maximumDeletionsPerBatch": .number(100),
            "maximumManifestLiveIds": .number(1000),
            "maximumManifestWindowHours": .number(96),
        ]
        for (key, item) in overrides { value[key] = item }
        return .object(value)
    }

    static func activeGate() -> HealthKitSleepActivationGate {
        let gate = HealthKitSleepActivationGate(store: InMemorySleepCapabilityStore())
        gate.update(HealthKitSleepCapability.resolve(manifestBlock: block(), at: now))
        return gate
    }

    static func inactiveGate() -> HealthKitSleepActivationGate {
        HealthKitSleepActivationGate(store: InMemorySleepCapabilityStore())
    }

    static func addition(
        id: Int,
        stage: Int = 3,
        start: String = "2026-10-04T06:00:00Z",
        end: String = "2026-10-04T14:00:00Z",
        source: Source = .watch,
        zone: String = "America/Los_Angeles",
        zoneSource: String? = "sample_metadata",
        userEntered: Bool? = nil
    ) -> HealthKitQueryAddition {
        let bundle: String
        let product: String
        switch source {
        case .watch: bundle = "com.apple.health.9F2A"; product = "Watch7,1"
        case .oura: bundle = "com.ouraring.oura"; product = "iPhone16,1"
        case .sleepCycle: bundle = "com.lexwarelabs.goodmorning"; product = "iPhone16,1"
        case .manual: bundle = "com.apple.Health"; product = "iPhone16,1"
        }
        let startDate = date(start)
        return HealthKitQueryAddition(
            healthKitUUID: UUID(uuidString: uuid(id))!,
            objectTypeIdentifier: HealthKitSynchronizationStream.sleepAnalysis.objectTypeIdentifier,
            source: HealthKitQuerySource(bundleIdentifier: bundle, sourceName: "", sourceRevision: "11.0", productType: product, privacySafeDeviceProvenance: nil),
            occurrence: HealthKitQueryOccurrence(
                startedAt: startDate, endedAt: date(end), localDate: "2026-10-04", calendarIdentifier: "gregorian",
                timeZoneIdentifier: zone, utcOffsetSeconds: 0, localDayStartedAt: startDate, localDayEndedAt: startDate
            ),
            payload: .sleep(HealthKitQuerySleep(stageValue: stage, timeZoneSource: zoneSource, wasUserEntered: userEntered)),
            allowlistedMetadata: [:]
        )
    }

    static func deletion(id: Int) -> HealthKitQueryDeletion {
        HealthKitQueryDeletion(
            healthKitUUID: UUID(uuidString: uuid(id))!,
            immutableExternalID: nil,
            objectTypeIdentifier: HealthKitSynchronizationStream.sleepAnalysis.objectTypeIdentifier
        )
    }

    static func result(
        additions: [HealthKitQueryAddition] = [],
        deletions: [HealthKitQueryDeletion] = [],
        anchor: String = "sleep-anchor"
    ) -> HealthKitAnchoredQueryResult {
        HealthKitAnchoredQueryResult(additions: additions, deletions: deletions, proposedAnchorData: Data(anchor.utf8), completedAt: now)
    }

    static func normalized(_ addition: HealthKitQueryAddition) -> NormalizedHealthKitObservation {
        HealthKitObservationNormalizer().normalize(addition)
    }

    static func stagedPartition(
        additions: [HealthKitQueryAddition],
        deletions: [HealthKitQueryDeletion] = []
    ) throws -> HealthKitStagedPartition {
        let batch = try HealthKitBatchBuilder().build(
            scope: scope(), previousCursor: nil,
            queryResult: result(additions: additions, deletions: deletions), createdAt: now
        )
        return batch.partitions[0]
    }

    static func problem(_ status: Int, _ code: String) -> ProductionProblemDetails {
        ProductionProblemDetails(
            problemVersion: "1", type: nil, title: code, status: status, code: code, detail: nil,
            instance: nil, requestId: nil, fieldErrors: [], recovery: nil
        )
    }
}

final class InMemorySleepCapabilityStore: HealthKitSleepCapabilityStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: HealthKitSleepCapability?
    func load() -> HealthKitSleepCapability? { lock.withLock { value } }
    func save(_ capability: HealthKitSleepCapability) { lock.withLock { value = capability } }
}

private final class SleepCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    var value: Int { lock.withLock { count } }
    func increment() { lock.withLock { count += 1 } }
}

private actor SleepQueryMock: HealthKitAnchoredQueryClient {
    private var results: [HealthKitAnchoredQueryResult]
    private var corruptFirst: Bool
    private var anchors: [Data?] = []

    init(results: [HealthKitAnchoredQueryResult], corruptFirst: Bool = false) {
        self.results = results
        self.corruptFirst = corruptFirst
    }

    func execute(stream: HealthKitSynchronizationStream, after anchorData: Data?, bounds: HealthKitQueryBounds?) async throws -> HealthKitAnchoredQueryResult {
        anchors.append(anchorData)
        if corruptFirst {
            corruptFirst = false
            throw HealthKitSyncError.corruptCursor
        }
        guard !results.isEmpty else { throw HealthKitSyncError.operational(code: "mock_query_exhausted") }
        return results.removeFirst()
    }

    func callCount() -> Int { anchors.count }
    func receivedAnchors() -> [Data?] { anchors }
}

private final class SleepObserverMock: HealthKitObserverClient, @unchecked Sendable {
    private let lock = NSLock()
    private var streams: [HealthKitSynchronizationStream] = []
    private var enables = 0
    var registrationCount: Int { lock.withLock { streams.count } }
    var registeredStreams: [HealthKitSynchronizationStream] { lock.withLock { streams } }
    var backgroundEnableCount: Int { lock.withLock { enables } }

    func register(stream: HealthKitSynchronizationStream, onWake: @escaping @Sendable (String?, @escaping @Sendable () -> Void) -> Void) throws -> HealthKitObserverRegistration {
        lock.withLock { streams.append(stream) }
        return HealthKitObserverRegistration(id: UUID())
    }
    func unregister(_ registration: HealthKitObserverRegistration) {}
    func enableBackgroundDelivery(for stream: HealthKitSynchronizationStream) async throws { lock.withLock { enables += 1 } }
}

/// Mirrors `ProductionHealthKitObservationUploader.uploadSleep` result
/// mapping, recording exactly the wire payload it would have sent.
private actor SleepUploaderMock: HealthKitObservationUploader {
    enum Mode {
        case accept
        case transient
        case disabled(HealthKitSleepActivationGate)
        case reject(String)
    }
    private var modes: [Mode]
    private var sent: [HealthKitSleepWirePayload] = []

    init(modes: [Mode]) { self.modes = modes }

    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult {
        guard HealthKitSleepWireMapper.isSleepPartition(partition),
              let payload = try? HealthKitSleepWireMapper.payload(for: partition)
        else { return .rejected(code: "not_a_sleep_partition") }
        sent.append(payload)
        let mode = modes.isEmpty ? .accept : modes.removeFirst()
        switch mode {
        case .accept:
            return .durablyAccepted(batchID: partition.identity, receiptIdentity: "receipt-\(partition.identity)")
        case .transient:
            return .transientFailure(code: "synthetic_lost_ack")
        case let .disabled(gate):
            gate.markServerDisabled(at: SleepFixtures.now)
            return .transientFailure(code: HealthKitSleepIngestionContract.disabledDiagnosticCode)
        case let .reject(code):
            return .rejected(code: code)
        }
    }

    func payloads() -> [HealthKitSleepWirePayload] { sent }
    func batchIDs() -> [String] { sent.map(\.batchId) }
}

private final class SleepEngineHarness {
    let root: URL
    let scope: HealthKitCursorScope
    let store: FileHealthKitSynchronizationStore
    let query: SleepQueryMock
    let observer = SleepObserverMock()
    let uploader: SleepUploaderMock
    let engine: HealthKitSynchronizationEngine

    init(
        gate: HealthKitSleepActivationGate,
        results: [HealthKitAnchoredQueryResult] = [SleepFixtures.result(additions: [SleepFixtures.addition(id: 1)])],
        modes: [SleepUploaderMock.Mode] = [],
        predicateVersion: String = HealthKitSleepIngestionContract.predicateVersion,
        corruptFirst: Bool = false
    ) throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("PhysiqueOSSleepTests-\(UUID().uuidString)", isDirectory: true)
        scope = SleepFixtures.scope(predicateVersion: predicateVersion)
        store = FileHealthKitSynchronizationStore(root: root)
        query = SleepQueryMock(results: results, corruptFirst: corruptFirst)
        uploader = SleepUploaderMock(modes: modes)
        engine = HealthKitSynchronizationEngine(
            queryClient: query, observerClient: observer, store: store, uploader: uploader,
            featureGate: .n1Automatic, sleepActivation: gate, now: { SleepFixtures.now }
        )
    }

    deinit { try? FileManager.default.removeItem(at: root) }
}

private actor SleepWindowReaderMock: HealthKitSleepWindowReader {
    private let ids: [UUID]
    private let error: Bool
    private var calls: [(Date, Date)] = []

    init(ids: [UUID] = [], error: Bool = false) {
        self.ids = ids
        self.error = error
    }

    func liveSleepSampleIdentifiers(endingFrom start: Date, to end: Date) async throws -> [UUID] {
        calls.append((start, end))
        if error { throw HealthKitSyncError.operational(code: "healthkit_sleep_window_query_failed") }
        return ids
    }

    func ranges() -> [(Date, Date)] { calls }
}

private actor SleepManifestSubmitterMock: HealthKitSleepManifestSubmitting {
    private var results: [HealthKitSleepManifestSubmitResult]
    private var manifests: [HealthKitSleepWireWindowManifest] = []

    init(results: [HealthKitSleepManifestSubmitResult]) { self.results = results }

    func submitSleepWindowManifest(_ manifest: HealthKitSleepWireWindowManifest) async -> HealthKitSleepManifestSubmitResult {
        manifests.append(manifest)
        return results.isEmpty ? .failed(code: "mock_exhausted") : results.removeFirst()
    }

    func received() -> [HealthKitSleepWireWindowManifest] { manifests }
}

private final class SleepCadenceStore: HealthKitSleepManifestCadenceStore, @unchecked Sendable {
    private let lock = NSLock()
    private var value: Date?
    func lastSentAt() -> Date? { lock.withLock { value } }
    func recordSent(at date: Date) { lock.withLock { value = date } }
}

// MARK: - Coordinator fakes

@MainActor
private final class SleepAuthorizationMock: HealthKitCanaryAuthorizationCoordinating {
    var currentAvailability: HealthKitAvailability = .available
    private(set) var authorizationWasRequested = true
    func requestAuthorization(for scope: HealthKitAuthorizationScope) async -> HealthKitAuthorizationOutcome { .completed }
}

private actor SleepSynchronizerMock: HealthKitAutomaticSynchronizing {
    private var observed: [HealthKitCursorScope] = []
    private var background: [HealthKitCursorScope] = []
    private var synced: [HealthKitCursorScope] = []

    func startObserving(scope: HealthKitCursorScope) async throws { observed.append(scope) }
    func enableBackgroundDelivery(scope: HealthKitCursorScope) async throws { background.append(scope) }
    func synchronize(scope: HealthKitCursorScope, stagingCompletion: (@Sendable () -> Void)?) async throws { synced.append(scope) }
    func synchronizeCurrentDay(scope: HealthKitCursorScope, calendar: Calendar) async throws { synced.append(scope) }
    func synchronizeHistoricalCatchUp(scope: HealthKitCursorScope, calendar: Calendar) async throws { synced.append(scope) }

    func observedScopes() -> [HealthKitCursorScope] { observed }
    func backgroundDeliveryScopes() -> [HealthKitCursorScope] { background }
    func synchronizedScopes() -> [HealthKitCursorScope] { synced }
}

private struct SleepServerMock: HealthKitFounderCanaryServer {
    func healthKitCanaryContract() async throws -> HealthKitCanaryServerContract { throw HealthKitCanaryError.serverContractMismatch }
    func founderOwnerIdentity() async throws -> String { "user_founder_001" }
    func healthKitActivityValidation(startDate: String, endDate: String) async throws -> HealthKitActivityCanaryDiagnostic {
        throw HealthKitCanaryError.serverContractMismatch
    }
}

private struct SleepCapabilitySourceMock: HealthKitSleepCapabilitySource {
    enum Behavior: Sendable {
        case success(ProductionJSONValue?)
        case failure
    }
    let behavior: Behavior
    func healthKitSleepCapabilityBlock() async throws -> ProductionJSONValue? {
        switch behavior {
        case let .success(block): return block
        case .failure: throw URLError(.notConnectedToInternet)
        }
    }
}

private struct SleepDeviceIdentityStore: HealthKitCanaryDeviceIdentityStore {
    func stableIdentity() throws -> String { "founder-device-stable" }
}

private final class SleepOwnerIdentityCache: HealthKitOwnerIdentityCache, @unchecked Sendable {
    private let value: String?
    init(_ value: String?) { self.value = value }
    func load() -> String? { value }
    func save(_ identity: String) {}
}

@MainActor
private struct SleepCoordinatorHarness {
    let synchronizer = SleepSynchronizerMock()
    let coordinator: HealthKitAutomaticSynchronizationCoordinator

    init(
        gate: HealthKitSleepActivationGate,
        capability: SleepCapabilitySourceMock.Behavior = .success(nil),
        ownerIdentityCache: String? = nil
    ) {
        coordinator = HealthKitAutomaticSynchronizationCoordinator(
            authorization: SleepAuthorizationMock(),
            synchronizer: synchronizer,
            server: SleepServerMock(),
            deviceIdentityStore: SleepDeviceIdentityStore(),
            ownerIdentityCache: SleepOwnerIdentityCache(ownerIdentityCache),
            now: { SleepFixtures.now },
            sleepActivation: gate,
            sleepCapabilitySource: SleepCapabilitySourceMock(behavior: capability),
            sleepManifestSender: nil
        )
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
