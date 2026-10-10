import HealthKit
import XCTest
@testable import PhysiqueOS

@MainActor
final class DEXAHealthKitWritebackTests: XCTestCase {
    func testEvidencePageRemovesTemporaryWritebackCardWithoutRemovingSynchronizationOrSettings() throws {
        let testFile = URL(fileURLWithPath: #filePath)
        let iosRoot = testFile.deletingLastPathComponent().deletingLastPathComponent()
        let evidence = try String(
            contentsOf: iosRoot.appendingPathComponent("PhysiqueOS/Presentation/Evidence/DEXAHistoryView.swift"),
            encoding: .utf8
        )
        let settings = try String(
            contentsOf: iosRoot.appendingPathComponent("PhysiqueOS/Presentation/You/YouPlaceholderView.swift"),
            encoding: .utf8
        )
        let synchronization = try String(
            contentsOf: iosRoot.appendingPathComponent("PhysiqueOS/Networking/DEXAHealthKitWriteback.swift"),
            encoding: .utf8
        )

        XCTAssertFalse(evidence.contains("dexa.writeback"))
        XCTAssertFalse(evidence.contains("evidence-review.dexa-writeback"))
        XCTAssertFalse(evidence.contains("DEXA → Apple Health"))
        XCTAssertTrue(settings.contains("DEXA → Apple Health"))
        XCTAssertTrue(settings.contains("reconcilePermanent()"))
        XCTAssertTrue(synchronization.contains("final class DEXAHealthKitWritebackCoordinator"))
        XCTAssertTrue(synchronization.contains("dexa-healthkit-writeback"))
        XCTAssertTrue(synchronization.contains("recordDexaHealthKitWritebackReceipt"))
    }

    func testProductionTimestampParserAcceptsServerFractionalAndPlainISOInstants() {
        XCTAssertNotNil(SystemDEXAHealthKitSampleStore.parseSampleInstant("2026-09-12T19:00:00.000Z"))
        XCTAssertNotNil(SystemDEXAHealthKitSampleStore.parseSampleInstant("2026-09-12T19:00:00Z"))
        XCTAssertNil(SystemDEXAHealthKitSampleStore.parseSampleInstant("2026-09-12"))
    }

    func testIdentityFormulaMatchesPinnedServerContractVector() {
        let logicalScanKey = "dexa_scan|owner|2026-10-09"
        XCTAssertEqual(
            DEXAHealthKitIdentity.intentIdentity(logicalScanKey: logicalScanKey, kind: .bodyFatPercentage),
            "dexa_hk_intent_c04667e70d46dbb79a2f4249388237ea71003dcdcb0481ae0c3ae0ed4e8fc667"
        )
        let sync = DEXAHealthKitIdentity.syncIdentity(
            logicalScanKey: logicalScanKey, kind: .bodyFatPercentage
        )
        XCTAssertEqual(sync.identifier, "physiqueos.dexa.v1.05505994aa71fa0b26509a943388be3f")
        XCTAssertEqual(sync.externalUUID, "05505994-aa71-fa0b-2650-9a943388be3f")
    }

    func testRegistryWritesOnlyBodyFatAndLeanBodyMassNeverWeight() {
        let identifiers = HealthKitTypeRegistry.physiqueOSV1.allWriteTypes.map(\.identifier)
        XCTAssertEqual(Set(identifiers), Set([
            HKQuantityTypeIdentifier.bodyFatPercentage.rawValue,
            HKQuantityTypeIdentifier.leanBodyMass.rawValue,
        ]))
        XCTAssertFalse(identifiers.contains(HKQuantityTypeIdentifier.bodyMass.rawValue))
    }

    func testEnableUsesSharedCoordinatorForExactDEXAWriteScope() async {
        let authorization = DEXAAuthorizationMock()
        let preferences = MemoryDEXAPreferences(enabled: false)
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: FakeDEXAServer(projection: projection(enabled: false, intents: [])),
            samples: FakeDEXASamples(),
            preferences: preferences,
            authorization: authorization
        )

        await coordinator.enable()

        XCTAssertEqual(authorization.requests.count, 1)
        XCTAssertEqual(authorization.requests.first?.0, .futureBodyMeasurementWrite)
        XCTAssertEqual(authorization.requests.first?.1, .foreground)
        XCTAssertTrue(preferences.isEnabled)
    }

    func testDisabledPermanentPolicyPerformsNoHealthKitMutation() async {
        let server = FakeDEXAServer(projection: projection(enabled: false, intents: [intent()]))
        let samples = FakeDEXASamples()
        let preferences = MemoryDEXAPreferences(enabled: true)
        let coordinator = DEXAHealthKitWritebackCoordinator(server: server, samples: samples, preferences: preferences)

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        XCTAssertEqual(samples.deleteCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, [])
        XCTAssertEqual(coordinator.state, .ready)
    }

    func testRelaunchAfterSaveIsExactlyOnceAndReportsAlreadyPresent() async {
        let value = intent()
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [value]))
        let samples = FakeDEXASamples()
        samples.stored[value.syncIdentifier] = [.init(correlationId: "owned-1", syncVersion: 1, healthValue: 0.081)]
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["already_present"])
        XCTAssertEqual(coordinator.state, .current)
    }

    func testKillAfterHealthKitSaveBeforeReceiptRetriesWithoutDuplicate() async {
        let value = intent()
        let samples = FakeDEXASamples()
        let preferences = MemoryDEXAPreferences(enabled: true)
        let interruptedServer = FakeDEXAServer(
            projection: projection(enabled: true, intents: [value]), failRecord: true
        )
        let firstLaunch = DEXAHealthKitWritebackCoordinator(
            server: interruptedServer, samples: samples, preferences: preferences
        )

        await firstLaunch.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 1)
        XCTAssertEqual(firstLaunch.state, .pending)

        let recoveredServer = FakeDEXAServer(projection: projection(enabled: true, intents: [value]))
        let relaunched = DEXAHealthKitWritebackCoordinator(
            server: recoveredServer, samples: samples, preferences: preferences
        )
        await relaunched.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 1)
        let outcomes = await recoveredServer.receiptOutcomes()
        XCTAssertEqual(outcomes, ["already_present"])
        XCTAssertEqual(relaunched.state, .current)
    }

    func testOfflineProjectionDefersWithoutHealthKitMutation() async {
        let server = FakeDEXAServer(
            projection: projection(enabled: true, intents: [intent()]), failProjection: true
        )
        let samples = FakeDEXASamples()
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        XCTAssertEqual(coordinator.state, .pending)
    }

    func testLockedHealthKitStoreDefersAndRemainsRetryable() async {
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [intent()]))
        let samples = FakeDEXASamples()
        samples.failQueries = true
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["deferred"])
        XCTAssertEqual(coordinator.state, .pending)
    }

    func testCorrectionUsesStableSyncIdentityAndHigherRevisionReplacement() async {
        var corrected = intent()
        corrected.canonicalRevision = 2
        corrected.syncVersion = 2
        corrected.value = 8.2
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [corrected]))
        let samples = FakeDEXASamples()
        samples.stored[corrected.syncIdentifier] = [.init(correlationId: "old", syncVersion: 1, healthValue: 0.081)]
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 1)
        XCTAssertEqual(samples.stored[corrected.syncIdentifier]?.map(\.syncVersion), [2])
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["saved"])
    }

    func testPermissionDenialIsPerTypeAndNeverWrites() async {
        let value = intent(kind: .leanBodyMassFatFree, healthValue: 160.5)
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [value]))
        let samples = FakeDEXASamples()
        samples.statuses[.leanBodyMassFatFree] = .sharingDenied
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["permission_needed"])
        XCTAssertEqual(coordinator.state, .permissionNeeded)
    }

    func testFirstEnablePersistsOptInAndReconcilesEachPermissionIndependently() async {
        let bodyFat = intent()
        let lean = intent(kind: .leanBodyMassFatFree, healthValue: 160.5)
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [bodyFat, lean]))
        let samples = FakeDEXASamples()
        samples.statuses[.leanBodyMassFatFree] = .sharingDenied
        let preferences = MemoryDEXAPreferences(enabled: false)
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server,
            samples: samples,
            preferences: preferences,
            authorization: DEXAAuthorizationMock()
        )

        await coordinator.enable()

        XCTAssertTrue(coordinator.isEnabled)
        XCTAssertEqual(samples.saveCount, 1)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["saved", "permission_needed"])
        XCTAssertEqual(coordinator.state, .permissionNeeded)
    }

    func testPhysicalValidationIsPairAtomicWhenAuthorizationIsPartial() async {
        let server = FakeDEXAServer(projection: projection(
            enabled: false, intents: validationIntents(desiredState: "present")
        ))
        let samples = FakeDEXASamples()
        samples.statuses[.leanBodyMassFatFree] = .sharingDenied
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.runPhysicalValidation(action: "write")

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, [])
        XCTAssertEqual(coordinator.state, .permissionNeeded)
    }

    func testDeletionRefusesAmbiguousOwnedMatches() async {
        var remove = intent()
        remove.desiredState = "withdrawn"
        remove.value = nil
        remove.unit = nil
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [remove]))
        let samples = FakeDEXASamples()
        samples.stored[remove.syncIdentifier] = [
            .init(correlationId: "one", syncVersion: 1, healthValue: 0.081),
            .init(correlationId: "two", syncVersion: 1, healthValue: 0.081),
        ]
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.deleteCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["failed"])
        XCTAssertEqual(coordinator.state, .failed("Apple Health writeback failed."))
    }

    func testPermanentWithdrawalDeletesANewerOwnSampleAfterLostCorrectionReceipt() async {
        var remove = intent()
        remove.desiredState = "withdrawn"
        remove.value = nil
        remove.unit = nil
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [remove]))
        let samples = FakeDEXASamples()
        samples.stored[remove.syncIdentifier] = [
            .init(correlationId: "newer", syncVersion: 2, healthValue: 0.082),
        ]
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.deleteCount, 1)
        XCTAssertEqual(samples.stored[remove.syncIdentifier], [])
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["deleted"])
        XCTAssertEqual(coordinator.state, .current)
    }

    func testPhysicalValidationWritesAndDeletesExactlyTheGuardedRealPair() async {
        let samples = FakeDEXASamples()
        let preferences = MemoryDEXAPreferences(enabled: true)
        let writeServer = FakeDEXAServer(projection: projection(
            enabled: false,
            intents: validationIntents(desiredState: "present")
        ))
        let writer = DEXAHealthKitWritebackCoordinator(
            server: writeServer, samples: samples, preferences: preferences
        )

        await writer.runPhysicalValidation(action: "write")

        XCTAssertEqual(samples.saveCount, 2)
        XCTAssertEqual(Set(samples.stored.values.flatMap { $0 }.map(\.healthValue)), Set([0.081, 160.5]))
        let writeOutcomes = await writeServer.receiptOutcomes()
        XCTAssertEqual(writeOutcomes, ["saved", "saved"])

        let deleteServer = FakeDEXAServer(projection: projection(
            enabled: false,
            intents: validationIntents(desiredState: "withdrawn")
        ))
        let deleter = DEXAHealthKitWritebackCoordinator(
            server: deleteServer, samples: samples, preferences: preferences
        )

        await deleter.runPhysicalValidation(action: "delete")

        XCTAssertEqual(samples.deleteCount, 2)
        XCTAssertTrue(samples.stored.values.allSatisfy(\.isEmpty))
        let deleteOutcomes = await deleteServer.receiptOutcomes()
        XCTAssertEqual(deleteOutcomes, ["deleted", "deleted"])
        XCTAssertEqual(deleter.state, .deleted)
        XCTAssertEqual(deleter.state.label, "Deleted")
    }

    func testPhysicalValidationRejectsAnyScanOutsideTheGuardedSeptember12Identity() async {
        var unsafe = validationIntents(desiredState: "present")
        unsafe[0].occurrenceDate = "2026-09-13"
        let server = FakeDEXAServer(projection: projection(enabled: false, intents: unsafe))
        let samples = FakeDEXASamples()
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.runPhysicalValidation(action: "write")

        XCTAssertEqual(samples.saveCount, 0)
        XCTAssertEqual(samples.deleteCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, [])
        XCTAssertEqual(coordinator.state, .pending)
    }

    func testPhysicalValidationRejectsAlteredValuesUnderTheGuardedIdentity() async {
        var unsafe = validationIntents(desiredState: "present")
        unsafe[0].value = 8.2
        let server = FakeDEXAServer(projection: projection(enabled: false, intents: unsafe))
        let samples = FakeDEXASamples()
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.runPhysicalValidation(action: "write")

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, [])
        XCTAssertEqual(coordinator.state, .pending)
    }

    func testMalformedDeterministicIdentityIsRejectedBeforeHealthKitMutation() async {
        var malformed = intent()
        malformed.syncIdentifier = "physiqueos.dexa.v1.bogus"
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [malformed]))
        let samples = FakeDEXASamples()
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["failed"])
    }

    func testNonCanonicalLogicalKeyShapeIsRejectedEvenWhenHashesAgree() async {
        var malformed = intent()
        let logicalScanKey = "bogus|owner|2026-10-09"
        let sync = DEXAHealthKitIdentity.syncIdentity(
            logicalScanKey: logicalScanKey, kind: malformed.measurementKind
        )
        malformed.logicalScanKey = logicalScanKey
        malformed.canonicalId = logicalScanKey
        malformed.intentIdentity = DEXAHealthKitIdentity.intentIdentity(
            logicalScanKey: logicalScanKey, kind: malformed.measurementKind
        )
        malformed.syncIdentifier = sync.identifier
        malformed.externalUUID = sync.externalUUID
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [malformed]))
        let samples = FakeDEXASamples()
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["failed"])
    }

    func testSampleInstantMustResolveToOccurrenceDateInDeclaredTimeZone() async {
        var malformed = intent()
        malformed.sampleInstant = "2026-10-10T19:00:00.000Z"
        let server = FakeDEXAServer(projection: projection(enabled: true, intents: [malformed]))
        let samples = FakeDEXASamples()
        let coordinator = DEXAHealthKitWritebackCoordinator(
            server: server, samples: samples, preferences: MemoryDEXAPreferences(enabled: true)
        )

        await coordinator.reconcilePermanent()

        XCTAssertEqual(samples.saveCount, 0)
        let outcomes = await server.receiptOutcomes()
        XCTAssertEqual(outcomes, ["failed"])
    }

    private func projection(enabled: Bool, intents: [DEXAHealthKitIntent]) -> DEXAHealthKitProjection {
        .init(
            schemaVersion: "dexa-hk-writeback-v1",
            policy: .init(enabled: enabled, effectiveFromScanDate: "2026-10-09", measurementKinds: [.bodyFatPercentage, .leanBodyMassFatFree], prospectiveOnly: true, historicalBackfill: false),
            validation: .init(supported: true, scanDate: "2026-09-12", expectedRevision: 1, requiresExplicitAction: true, permanentPolicyEnabled: enabled, permanentEffectiveFromScanDate: "2026-10-09"),
            intents: intents
        )
    }

    private func intent(
        kind: DEXAHealthKitMeasurementKind = .bodyFatPercentage,
        healthValue: Double = 8.1
    ) -> DEXAHealthKitIntent {
        let logicalScanKey = "dexa_scan|owner|2026-10-09"
        let sync = DEXAHealthKitIdentity.syncIdentity(logicalScanKey: logicalScanKey, kind: kind)
        return .init(
            schemaVersion: "dexa-hk-writeback-v1",
            intentIdentity: DEXAHealthKitIdentity.intentIdentity(logicalScanKey: logicalScanKey, kind: kind),
            canonicalId: logicalScanKey,
            logicalScanKey: logicalScanKey, canonicalRevision: 1, occurrenceDate: "2026-10-09",
            sampleInstant: "2026-10-09T19:00:00.000Z", timeZone: "America/Los_Angeles", timePrecision: "date",
            measurementKind: kind, value: healthValue, unit: kind == .bodyFatPercentage ? "percent" : "lb",
            derivation: kind == .leanBodyMassFatFree ? "fat_free_mass_total_minus_fat" : nil,
            desiredState: "present", syncIdentifier: sync.identifier, syncVersion: 1,
            externalUUID: sync.externalUUID, mode: "permanent"
        )
    }

    private func validationIntents(desiredState: String) -> [DEXAHealthKitIntent] {
        let kinds: [DEXAHealthKitMeasurementKind] = [.bodyFatPercentage, .leanBodyMassFatFree]
        return kinds.map { kind in
            var value = intent(kind: kind, healthValue: kind == .bodyFatPercentage ? 8.1 : 160.5)
            let logicalScanKey = "dexa_scan|owner|2026-09-12"
            let sync = DEXAHealthKitIdentity.syncIdentity(logicalScanKey: logicalScanKey, kind: kind)
            value.intentIdentity = DEXAHealthKitIdentity.intentIdentity(logicalScanKey: logicalScanKey, kind: kind)
            value.canonicalId = logicalScanKey
            value.logicalScanKey = logicalScanKey
            value.occurrenceDate = "2026-09-12"
            value.sampleInstant = "2026-09-12T19:00:00.000Z"
            value.desiredState = desiredState
            value.syncIdentifier = sync.identifier
            value.externalUUID = sync.externalUUID
            value.mode = "validation"
            if desiredState == "withdrawn" {
                value.value = nil
                value.unit = nil
            }
            return value
        }
    }
}

private actor FakeDEXAServer: DEXAHealthKitWritebackServer {
    let value: DEXAHealthKitProjection
    let failProjection: Bool
    let failRecord: Bool
    private var receipts: [DEXAHealthKitReceiptPayload] = []
    init(projection: DEXAHealthKitProjection, failProjection: Bool = false, failRecord: Bool = false) {
        value = projection
        self.failProjection = failProjection
        self.failRecord = failRecord
    }
    func projection(mode: String, validationAction: String?) async throws -> DEXAHealthKitProjection {
        if failProjection { throw URLError(.notConnectedToInternet) }
        return value
    }
    func record(_ receipt: DEXAHealthKitReceiptPayload) async throws {
        if failRecord { throw URLError(.networkConnectionLost) }
        receipts.append(receipt)
    }
    func receiptOutcomes() -> [String] { receipts.map(\.outcome) }
}

private final class FakeDEXASamples: DEXAHealthKitSampleStore {
    var statuses: [DEXAHealthKitMeasurementKind: HKAuthorizationStatus] = [
        .bodyFatPercentage: .sharingAuthorized,
        .leanBodyMassFatFree: .sharingAuthorized,
    ]
    var stored: [String: [DEXAHealthKitOwnedSample]] = [:]
    var saveCount = 0
    var deleteCount = 0
    var failQueries = false
    func authorizationStatus(for kind: DEXAHealthKitMeasurementKind) -> HKAuthorizationStatus { statuses[kind] ?? .notDetermined }
    func ownedSamples(for intent: DEXAHealthKitIntent) async throws -> [DEXAHealthKitOwnedSample] {
        if failQueries { throw CocoaError(.fileReadNoPermission) }
        return stored[intent.syncIdentifier] ?? []
    }
    func save(_ intent: DEXAHealthKitIntent) async throws {
        saveCount += 1
        let value = intent.measurementKind == .bodyFatPercentage ? (intent.value ?? 0) / 100 : (intent.value ?? 0)
        stored[intent.syncIdentifier] = [.init(correlationId: "saved-\(saveCount)", syncVersion: intent.syncVersion, healthValue: value)]
    }
    func delete(_ sample: DEXAHealthKitOwnedSample, for intent: DEXAHealthKitIntent) async throws {
        deleteCount += 1
        stored[intent.syncIdentifier] = []
    }
}

@MainActor
private final class DEXAAuthorizationMock: HealthKitCanaryAuthorizationCoordinating {
    var currentAvailability: HealthKitAvailability = .available
    private(set) var requests: [(HealthKitAuthorizationScope, HealthKitAuthorizationPresentation)] = []
    func requestAuthorization(
        for scope: HealthKitAuthorizationScope,
        presentation: HealthKitAuthorizationPresentation,
        reason: HealthKitAuthorizationReason
    ) async -> HealthKitAuthorizationOutcome {
        requests.append((scope, presentation))
        return .completed
    }
}

private final class MemoryDEXAPreferences: DEXAHealthKitWritebackPreferenceStore {
    var isEnabled: Bool
    init(enabled: Bool) { isEnabled = enabled }
}
