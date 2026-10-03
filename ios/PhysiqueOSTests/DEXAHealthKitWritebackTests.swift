import HealthKit
import XCTest
@testable import PhysiqueOS

@MainActor
final class DEXAHealthKitWritebackTests: XCTestCase {
    func testRegistryWritesOnlyBodyFatAndLeanBodyMassNeverWeight() {
        let identifiers = HealthKitTypeRegistry.physiqueOSV1.allWriteTypes.map(\.identifier)
        XCTAssertEqual(Set(identifiers), Set([
            HKQuantityTypeIdentifier.bodyFatPercentage.rawValue,
            HKQuantityTypeIdentifier.leanBodyMass.rawValue,
        ]))
        XCTAssertFalse(identifiers.contains(HKQuantityTypeIdentifier.bodyMass.rawValue))
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
        XCTAssertEqual(coordinator.state, .pending)
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
        .init(
            schemaVersion: "dexa-hk-writeback-v1", intentIdentity: "intent-1", canonicalId: "dexa_scan|owner|2026-10-09",
            logicalScanKey: "dexa_scan|owner|2026-10-09", canonicalRevision: 1, occurrenceDate: "2026-10-09",
            sampleInstant: "2026-10-09T19:00:00.000Z", timeZone: "America/Los_Angeles", timePrecision: "date",
            measurementKind: kind, value: healthValue, unit: kind == .bodyFatPercentage ? "percent" : "lb",
            derivation: kind == .leanBodyMassFatFree ? "fat_free_mass_total_minus_fat" : nil,
            desiredState: "present", syncIdentifier: "physiqueos.dexa.v1.stable", syncVersion: 1,
            externalUUID: "00000000-0000-4000-8000-000000000001", mode: "permanent"
        )
    }

    private func validationIntents(desiredState: String) -> [DEXAHealthKitIntent] {
        let kinds: [DEXAHealthKitMeasurementKind] = [.bodyFatPercentage, .leanBodyMassFatFree]
        return kinds.map { kind in
            var value = intent(kind: kind, healthValue: kind == .bodyFatPercentage ? 8.1 : 160.5)
            value.intentIdentity = "validation-\(kind.rawValue)"
            value.canonicalId = "dexa_scan|owner|2026-09-12"
            value.logicalScanKey = "dexa_scan|owner|2026-09-12"
            value.occurrenceDate = "2026-09-12"
            value.sampleInstant = "2026-09-12T19:00:00.000Z"
            value.desiredState = desiredState
            value.syncIdentifier = "physiqueos.dexa.v1.validation.\(kind.rawValue)"
            value.externalUUID = kind == .bodyFatPercentage
                ? "00000000-0000-4000-8000-000000000001"
                : "00000000-0000-4000-8000-000000000002"
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
    private var receipts: [DEXAHealthKitReceiptPayload] = []
    init(projection: DEXAHealthKitProjection) { value = projection }
    func projection(mode: String, validationAction: String?) async throws -> DEXAHealthKitProjection { value }
    func record(_ receipt: DEXAHealthKitReceiptPayload) async throws { receipts.append(receipt) }
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
    func requestAuthorization() async throws -> Bool { true }
    func authorizationStatus(for kind: DEXAHealthKitMeasurementKind) -> HKAuthorizationStatus { statuses[kind] ?? .notDetermined }
    func ownedSamples(for intent: DEXAHealthKitIntent) async throws -> [DEXAHealthKitOwnedSample] { stored[intent.syncIdentifier] ?? [] }
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

private final class MemoryDEXAPreferences: DEXAHealthKitWritebackPreferenceStore {
    var isEnabled: Bool
    init(enabled: Bool) { isEnabled = enabled }
}
