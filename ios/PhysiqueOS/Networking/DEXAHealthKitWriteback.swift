import Foundation
import HealthKit
import CryptoKit

enum DEXAHealthKitMeasurementKind: String, Codable, Sendable {
    case bodyFatPercentage
    case leanBodyMassFatFree

    var quantityType: HKQuantityType {
        let identifier: HKQuantityTypeIdentifier = switch self {
        case .bodyFatPercentage: .bodyFatPercentage
        case .leanBodyMassFatFree: .leanBodyMass
        }
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            preconditionFailure("Required DEXA HealthKit type is unavailable: \(identifier.rawValue)")
        }
        return type
    }
}

struct DEXAHealthKitPolicy: Decodable, Equatable, Sendable {
    var enabled: Bool
    var effectiveFromScanDate: String
    var measurementKinds: [DEXAHealthKitMeasurementKind]
    var prospectiveOnly: Bool
    var historicalBackfill: Bool
}

struct DEXAHealthKitValidationCapability: Decodable, Equatable, Sendable {
    var supported: Bool
    var scanDate: String
    var expectedRevision: Int
    var requiresExplicitAction: Bool
    var permanentPolicyEnabled: Bool
    var permanentEffectiveFromScanDate: String
}

struct DEXAHealthKitIntent: Decodable, Equatable, Sendable {
    var schemaVersion: String
    var intentIdentity: String
    var canonicalId: String?
    var logicalScanKey: String
    var canonicalRevision: Int
    var occurrenceDate: String?
    var sampleInstant: String?
    var timeZone: String
    var timePrecision: String
    var measurementKind: DEXAHealthKitMeasurementKind
    var value: Double?
    var unit: String?
    var derivation: String?
    var desiredState: String
    var syncIdentifier: String
    var syncVersion: Int
    var externalUUID: String
    var mode: String
}

struct DEXAHealthKitProjection: Decodable, Equatable, Sendable {
    var schemaVersion: String
    var policy: DEXAHealthKitPolicy
    var validation: DEXAHealthKitValidationCapability
    var intents: [DEXAHealthKitIntent]
}

struct DEXAHealthKitReceiptPayload: Encodable, Sendable {
    var intentIdentity: String
    var canonicalId: String?
    var logicalScanKey: String
    var canonicalRevision: Int
    var occurrenceDate: String?
    var sampleInstant: String?
    var timeZone: String
    var timePrecision: String
    var measurementKind: DEXAHealthKitMeasurementKind
    var desiredState: String
    var syncIdentifier: String
    var outcome: String
    var healthKitCorrelationId: String?
    var errorCode: String?
}

private struct DEXAHealthKitReceiptResult: Decodable, Sendable {
    var receiptId: String
    var intentIdentity: String
    var outcome: String
    var version: Int
}

protocol DEXAHealthKitWritebackServer: Sendable {
    func projection(mode: String, validationAction: String?) async throws -> DEXAHealthKitProjection
    func record(_ receipt: DEXAHealthKitReceiptPayload) async throws
}

struct ProductionDEXAHealthKitWritebackServer: DEXAHealthKitWritebackServer {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func projection(mode: String, validationAction: String?) async throws -> DEXAHealthKitProjection {
        var query = ["mode": mode]
        if let validationAction { query["validationAction"] = validationAction }
        return try await api.readResource(
            "dexa-healthkit-writeback", query: query, policy: .reload,
            as: DEXAHealthKitProjection.self
        ).data
    }

    func record(_ receipt: DEXAHealthKitReceiptPayload) async throws {
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.recordDexaHealthKitWritebackReceipt,
            receipt.intentIdentity, String(receipt.canonicalRevision), receipt.desiredState,
            receipt.outcome, receipt.errorCode ?? "",
        ])
        let key = idempotencyStore.resolvedKey(
            scope: "dexa-healthkit-writeback.\(receipt.intentIdentity)", signature: signature
        )
        let outcome: ProductionCommandOutcome<DEXAHealthKitReceiptResult> = try await api.submitCommand(
            ProductionCommandType.recordDexaHealthKitWritebackReceipt,
            idempotencyKey: key,
            payload: receipt
        )
        guard outcome.isConfirmed, outcome.receipt.result?.intentIdentity == receipt.intentIdentity else {
            throw ProductionNativeError.invalidResponse
        }
    }
}

struct DEXAHealthKitOwnedSample: Equatable, Sendable {
    var correlationId: String
    var syncVersion: Int
    var healthValue: Double
}

protocol DEXAHealthKitSampleStore: AnyObject {
    @MainActor func authorizationStatus(for kind: DEXAHealthKitMeasurementKind) -> HKAuthorizationStatus
    @MainActor func ownedSamples(for intent: DEXAHealthKitIntent) async throws -> [DEXAHealthKitOwnedSample]
    @MainActor func save(_ intent: DEXAHealthKitIntent) async throws
    @MainActor func delete(_ sample: DEXAHealthKitOwnedSample, for intent: DEXAHealthKitIntent) async throws
}

final class SystemDEXAHealthKitSampleStore: DEXAHealthKitSampleStore {
    private let healthStore: HKHealthStore
    private let bundleIdentifier: String
    private let schemaVersion = "dexa-hk-writeback-v1"
    private var objectsByCorrelationId: [String: HKQuantitySample] = [:]

    init(healthStore: HKHealthStore = HKHealthStore(), bundleIdentifier: String = Bundle.main.bundleIdentifier ?? "") {
        self.healthStore = healthStore
        self.bundleIdentifier = bundleIdentifier
    }

    @MainActor func authorizationStatus(for kind: DEXAHealthKitMeasurementKind) -> HKAuthorizationStatus {
        healthStore.authorizationStatus(for: kind.quantityType)
    }

    @MainActor func ownedSamples(for intent: DEXAHealthKitIntent) async throws -> [DEXAHealthKitOwnedSample] {
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: [intent.syncIdentifier])
        let samples: [HKQuantitySample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: intent.measurementKind.quantityType,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, values, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (values as? [HKQuantitySample]) ?? [])
            }
            healthStore.execute(query)
        }
        objectsByCorrelationId.removeAll(keepingCapacity: true)
        return samples.compactMap { sample in
            guard sample.sourceRevision.source.bundleIdentifier == bundleIdentifier,
                  sample.metadata?["PhysiqueOSSchemaVersion"] as? String == schemaVersion,
                  sample.metadata?[HKMetadataKeySyncIdentifier] as? String == intent.syncIdentifier,
                  let version = sample.metadata?[HKMetadataKeySyncVersion] as? Int
            else { return nil }
            let correlationId = sample.uuid.uuidString
            objectsByCorrelationId[correlationId] = sample
            return DEXAHealthKitOwnedSample(
                correlationId: correlationId,
                syncVersion: version,
                healthValue: sample.quantity.doubleValue(for: healthUnit(for: intent.measurementKind))
            )
        }
    }

    @MainActor func save(_ intent: DEXAHealthKitIntent) async throws {
        guard intent.desiredState == "present", let value = intent.value,
              let dateText = intent.sampleInstant, let date = Self.parseSampleInstant(dateText)
        else { throw DEXAHealthKitWritebackError.invalidIntent }
        let healthValue = intent.measurementKind == .bodyFatPercentage ? value / 100 : value
        let metadata: [String: Any] = [
            HKMetadataKeySyncIdentifier: intent.syncIdentifier,
            HKMetadataKeySyncVersion: intent.syncVersion,
            HKMetadataKeyExternalUUID: intent.externalUUID,
            "PhysiqueOSSchemaVersion": schemaVersion,
            "PhysiqueOSIntentIdentity": intent.intentIdentity,
            "PhysiqueOSMeasurementKind": intent.measurementKind.rawValue,
            "PhysiqueOSDerivation": intent.derivation ?? "reported_body_fat_percentage",
            "PhysiqueOSTimePrecision": intent.timePrecision,
            "PhysiqueOSTimeZone": intent.timeZone,
        ]
        let sample = HKQuantitySample(
            type: intent.measurementKind.quantityType,
            quantity: HKQuantity(unit: healthUnit(for: intent.measurementKind), doubleValue: healthValue),
            start: date,
            end: date,
            device: HKDevice(name: "PhysiqueOS", manufacturer: "PhysiqueOS", model: "DEXA Scan", hardwareVersion: nil, firmwareVersion: nil, softwareVersion: nil, localIdentifier: nil, udiDeviceIdentifier: nil),
            metadata: metadata
        )
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            healthStore.save(sample) { accepted, error in
                if let error { continuation.resume(throwing: error) }
                else if !accepted { continuation.resume(throwing: DEXAHealthKitWritebackError.saveNotAccepted) }
                else { continuation.resume(returning: ()) }
            }
        }
    }

    @MainActor func delete(_ sample: DEXAHealthKitOwnedSample, for intent: DEXAHealthKitIntent) async throws {
        guard let object = objectsByCorrelationId[sample.correlationId],
              object.metadata?[HKMetadataKeySyncIdentifier] as? String == intent.syncIdentifier,
              object.sourceRevision.source.bundleIdentifier == bundleIdentifier
        else { throw DEXAHealthKitWritebackError.ownedSampleChanged }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            healthStore.delete(object) { accepted, error in
                if let error { continuation.resume(throwing: error) }
                else if !accepted { continuation.resume(throwing: DEXAHealthKitWritebackError.deleteNotAccepted) }
                else { continuation.resume(returning: ()) }
            }
        }
    }

    private func healthUnit(for kind: DEXAHealthKitMeasurementKind) -> HKUnit {
        kind == .bodyFatPercentage ? .percent() : .pound()
    }

    static func parseSampleInstant(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        return ISO8601DateFormatter().date(from: text)
    }
}

enum DEXAHealthKitWritebackError: Error, Equatable {
    case invalidIntent
    case unauthorized
    case ambiguousOwnedSamples
    case newerSampleExists
    case verificationFailed
    case saveNotAccepted
    case deleteNotAccepted
    case ownedSampleChanged
}

enum DEXAHealthKitIdentity {
    static func intentIdentity(logicalScanKey: String, kind: DEXAHealthKitMeasurementKind) -> String {
        "dexa_hk_intent_\(digest("dexa-hk-intent-v1|\(logicalScanKey)|\(kind.rawValue)"))"
    }

    static func syncIdentity(logicalScanKey: String, kind: DEXAHealthKitMeasurementKind) -> (identifier: String, externalUUID: String) {
        let hex = String(digest("dexa-hk-v1|\(logicalScanKey)|\(kind.rawValue)").prefix(32))
        let uuid = "\(hex.prefix(8))-\(hex.dropFirst(8).prefix(4))-\(hex.dropFirst(12).prefix(4))-\(hex.dropFirst(16).prefix(4))-\(hex.dropFirst(20))"
        return ("physiqueos.dexa.v1.\(hex)", uuid)
    }

    static func localDate(of instant: Date, timeZone: String) -> String? {
        guard let zone = TimeZone(identifier: timeZone) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let components = calendar.dateComponents([.year, .month, .day], from: instant)
        guard let year = components.year, let month = components.month, let day = components.day else { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    private static func digest(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

enum DEXAHealthKitWritebackState: Equatable, Sendable {
    case off
    case ready
    case reconciling
    case current
    case deleted
    case permissionNeeded
    case pending
    case failed(String)

    var label: String {
        switch self {
        case .off: "Off"
        case .ready: "Ready"
        case .reconciling: "Updating Apple Health…"
        case .current: "Saved"
        case .deleted: "Deleted"
        case .permissionNeeded: "Apple Health permission needed"
        case .pending: "Pending retry"
        case .failed: "Needs attention"
        }
    }
}

protocol DEXAHealthKitWritebackPreferenceStore: AnyObject {
    var isEnabled: Bool { get set }
}

final class UserDefaultsDEXAHealthKitWritebackPreferenceStore: DEXAHealthKitWritebackPreferenceStore {
    private let defaults: UserDefaults
    private let key: String
    init(defaults: UserDefaults = .standard, key: String = "physiqueos.dexa-healthkit-writeback.enabled.v1") {
        self.defaults = defaults; self.key = key
    }
    var isEnabled: Bool {
        get { defaults.bool(forKey: key) }
        set { defaults.set(newValue, forKey: key) }
    }
}

@Observable
final class DEXAHealthKitWritebackCoordinator {
    private let server: any DEXAHealthKitWritebackServer
    private let samples: any DEXAHealthKitSampleStore
    private let preferences: any DEXAHealthKitWritebackPreferenceStore
    private let authorization: (any HealthKitCanaryAuthorizationCoordinating)?
    private var running = false
    private(set) var state: DEXAHealthKitWritebackState
    private(set) var lastCompletedAt: Date?

    var isEnabled: Bool { preferences.isEnabled }

    init(
        server: any DEXAHealthKitWritebackServer,
        samples: any DEXAHealthKitSampleStore,
        preferences: any DEXAHealthKitWritebackPreferenceStore,
        authorization: (any HealthKitCanaryAuthorizationCoordinating)? = nil
    ) {
        self.server = server; self.samples = samples; self.preferences = preferences
        self.authorization = authorization
        self.state = preferences.isEnabled ? .ready : .off
    }

    @MainActor func enable() async {
        do {
            guard let authorization else { throw DEXAHealthKitWritebackError.unauthorized }
            let outcome = await authorization.requestAuthorization(
                for: .futureBodyMeasurementWrite,
                presentation: .foreground,
                reason: .dexaWritebackEnable
            )
            guard outcome == .completed else { throw DEXAHealthKitWritebackError.unauthorized }
            preferences.isEnabled = true
            state = .ready
            await reconcilePermanent()
        } catch {
            state = .failed("Apple Health authorization could not be completed.")
        }
    }

    @MainActor func disable() {
        preferences.isEnabled = false
        state = .off
    }

    @MainActor func reconcilePermanent() async {
        guard preferences.isEnabled else { state = .off; return }
        await reconcile(mode: "permanent", validationAction: nil)
    }

    @MainActor func runPhysicalValidation(action: String) async {
        guard preferences.isEnabled, ["write", "delete"].contains(action) else { return }
        guard allTypesAuthorized else { state = .permissionNeeded; return }
        await reconcile(mode: "validation", validationAction: action)
    }

    @MainActor private var allTypesAuthorized: Bool {
        samples.authorizationStatus(for: .bodyFatPercentage) == .sharingAuthorized &&
        samples.authorizationStatus(for: .leanBodyMassFatFree) == .sharingAuthorized
    }

    @MainActor private func reconcile(mode: String, validationAction: String?) async {
        guard !running else { return }
        running = true; state = .reconciling
        defer { running = false }
        do {
            let projection = try await server.projection(mode: mode, validationAction: validationAction)
            guard projectionIsSafe(projection, mode: mode, validationAction: validationAction) else {
                state = .pending
                return
            }
            if mode == "permanent" && !projection.policy.enabled {
                state = .ready
                return
            }
            var sawPermission = false
            var sawFailure = false
            var sawDeferred = false
            for intent in projection.intents {
                let result = await reconcile(intent)
                sawPermission = sawPermission || result == "permission_needed"
                sawFailure = sawFailure || result == "failed"
                sawDeferred = sawDeferred || result == "deferred"
            }
            if sawPermission { state = .permissionNeeded }
            else if sawFailure { state = .failed("Apple Health writeback failed.") }
            else if sawDeferred { state = .pending }
            else {
                state = mode == "validation" && validationAction == "delete" ? .deleted : .current
                lastCompletedAt = Date()
            }
        } catch {
            state = .pending
        }
    }

    private func projectionIsSafe(
        _ projection: DEXAHealthKitProjection,
        mode: String,
        validationAction: String?
    ) -> Bool {
        let allowedKinds: Set<DEXAHealthKitMeasurementKind> = [.bodyFatPercentage, .leanBodyMassFatFree]
        guard projection.schemaVersion == "dexa-hk-writeback-v1",
              projection.policy.effectiveFromScanDate == "2026-10-09",
              Set(projection.policy.measurementKinds) == allowedKinds,
              projection.policy.prospectiveOnly,
              !projection.policy.historicalBackfill
        else { return false }

        if mode == "permanent" {
            return projection.intents.allSatisfy { intent in
                intent.mode == "permanent" &&
                (intent.occurrenceDate.map { $0 >= projection.policy.effectiveFromScanDate } ?? false)
            }
        }

        guard let validationAction, mode == "validation", ["write", "delete"].contains(validationAction),
              projection.validation.supported,
              projection.validation.requiresExplicitAction,
              !projection.policy.enabled,
              !projection.validation.permanentPolicyEnabled,
              projection.validation.scanDate == "2026-09-12",
              projection.validation.expectedRevision == 1,
              projection.validation.permanentEffectiveFromScanDate == "2026-10-09",
              projection.intents.count == 2,
              Set(projection.intents.map(\.measurementKind)) == allowedKinds,
              Set(projection.intents.map(\.logicalScanKey)).count == 1
        else { return false }
        let expectedState = validationAction == "write" ? "present" : "withdrawn"
        let identitiesAreBounded = projection.intents.allSatisfy { intent in
            intent.mode == "validation" &&
            intent.occurrenceDate == "2026-09-12" &&
            intent.canonicalRevision == 1 &&
            intent.syncVersion == 1 &&
            intent.timePrecision == "date" &&
            intent.desiredState == expectedState
        }
        guard identitiesAreBounded else { return false }
        if validationAction == "delete" {
            return projection.intents.allSatisfy { $0.value == nil && $0.unit == nil }
        }
        return projection.intents.allSatisfy { intent in
            switch intent.measurementKind {
            case .bodyFatPercentage:
                intent.value == 8.1 && intent.unit == "percent"
            case .leanBodyMassFatFree:
                intent.value == 160.5 && intent.unit == "lb" &&
                intent.derivation == "fat_free_mass_total_minus_fat"
            }
        }
    }

    @MainActor private func reconcile(_ intent: DEXAHealthKitIntent) async -> String {
        guard intent.schemaVersion == "dexa-hk-writeback-v1",
              intent.canonicalRevision >= 1,
              intent.syncVersion == intent.canonicalRevision,
              ["present", "withdrawn"].contains(intent.desiredState),
              identityIsSafe(intent),
              intent.measurementKind != .leanBodyMassFatFree || intent.derivation == "fat_free_mass_total_minus_fat"
        else { return await report(intent, outcome: "failed", errorCode: "intent_invalid") }
        guard samples.authorizationStatus(for: intent.measurementKind) == .sharingAuthorized else {
            return await report(intent, outcome: "permission_needed", errorCode: "sharing_not_authorized")
        }
        do {
            let existing = try await samples.ownedSamples(for: intent)
            guard existing.count <= 1 else { throw DEXAHealthKitWritebackError.ambiguousOwnedSamples }
            if intent.desiredState == "withdrawn" {
                if let sample = existing.first {
                    if intent.mode == "validation" {
                        guard sample.syncVersion == intent.syncVersion else {
                            throw DEXAHealthKitWritebackError.newerSampleExists
                        }
                    }
                    try await samples.delete(sample, for: intent)
                }
                guard try await samples.ownedSamples(for: intent).isEmpty else {
                    throw DEXAHealthKitWritebackError.verificationFailed
                }
                return await report(intent, outcome: "deleted", correlationId: existing.first?.correlationId)
            }
            guard let value = intent.value, intent.unit == (intent.measurementKind == .bodyFatPercentage ? "percent" : "lb") else {
                throw DEXAHealthKitWritebackError.invalidIntent
            }
            guard (intent.measurementKind == .bodyFatPercentage && value > 0 && value < 100) ||
                    (intent.measurementKind == .leanBodyMassFatFree && value > 0)
            else { throw DEXAHealthKitWritebackError.invalidIntent }
            let expectedHealthValue = intent.measurementKind == .bodyFatPercentage ? value / 100 : value
            if let sample = existing.first {
                if sample.syncVersion > intent.syncVersion { throw DEXAHealthKitWritebackError.newerSampleExists }
                if sample.syncVersion == intent.syncVersion && approximatelyEqual(sample.healthValue, expectedHealthValue, kind: intent.measurementKind) {
                    return await report(intent, outcome: "already_present", correlationId: sample.correlationId)
                }
            }
            try await samples.save(intent)
            let verified = try await samples.ownedSamples(for: intent)
            guard verified.count == 1, let sample = verified.first,
                  sample.syncVersion == intent.syncVersion,
                  approximatelyEqual(sample.healthValue, expectedHealthValue, kind: intent.measurementKind)
            else { throw DEXAHealthKitWritebackError.verificationFailed }
            return await report(intent, outcome: "saved", correlationId: sample.correlationId)
        } catch let error as DEXAHealthKitWritebackError {
            return await report(intent, outcome: "failed", errorCode: String(describing: error))
        } catch {
            return await report(intent, outcome: "deferred", errorCode: "healthkit_unavailable")
        }
    }

    @MainActor private func report(
        _ intent: DEXAHealthKitIntent,
        outcome: String,
        correlationId: String? = nil,
        errorCode: String? = nil
    ) async -> String {
        do {
            try await server.record(DEXAHealthKitReceiptPayload(
                intentIdentity: intent.intentIdentity, canonicalId: intent.canonicalId,
                logicalScanKey: intent.logicalScanKey, canonicalRevision: intent.canonicalRevision,
                occurrenceDate: intent.occurrenceDate, sampleInstant: intent.sampleInstant,
                timeZone: intent.timeZone, timePrecision: intent.timePrecision,
                measurementKind: intent.measurementKind, desiredState: intent.desiredState,
                syncIdentifier: intent.syncIdentifier, outcome: outcome,
                healthKitCorrelationId: correlationId, errorCode: errorCode
            ))
            return outcome
        } catch {
            return "deferred"
        }
    }

    private func approximatelyEqual(_ left: Double, _ right: Double, kind: DEXAHealthKitMeasurementKind) -> Bool {
        abs(left - right) <= (kind == .bodyFatPercentage ? 0.000_01 : 0.01)
    }

    private func identityIsSafe(_ intent: DEXAHealthKitIntent) -> Bool {
        guard let canonicalId = intent.canonicalId,
              canonicalId == intent.logicalScanKey,
              let occurrenceDate = intent.occurrenceDate,
              ["exact", "appointment_time", "date"].contains(intent.timePrecision),
              let instantText = intent.sampleInstant,
              let instant = SystemDEXAHealthKitSampleStore.parseSampleInstant(instantText),
              DEXAHealthKitIdentity.localDate(of: instant, timeZone: intent.timeZone) == occurrenceDate,
              intent.intentIdentity == DEXAHealthKitIdentity.intentIdentity(
                logicalScanKey: intent.logicalScanKey, kind: intent.measurementKind
              )
        else { return false }
        let logicalParts = intent.logicalScanKey.split(separator: "|", omittingEmptySubsequences: false)
        guard logicalParts.count == 3,
              logicalParts[0] == "dexa_scan",
              !logicalParts[1].isEmpty,
              logicalParts[2] == Substring(occurrenceDate)
        else { return false }
        let sync = DEXAHealthKitIdentity.syncIdentity(
            logicalScanKey: intent.logicalScanKey, kind: intent.measurementKind
        )
        return intent.syncIdentifier == sync.identifier && intent.externalUUID == sync.externalUUID
    }
}
