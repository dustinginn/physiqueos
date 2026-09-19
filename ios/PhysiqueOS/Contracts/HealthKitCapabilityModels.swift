import Foundation

enum HealthKitCapabilityOperation: String, CaseIterable, Hashable, Sendable {
    case requestAuthorization
    case observationQuery
    case serverUpload
    case backgroundDelivery
    case canonicalSynchronization
    case healthKitWrite
}

/// N0 ships with an empty operation set. Later stages must opt into each
/// capability independently; enabling authorization must never implicitly
/// enable reads, uploads, background delivery, canonicalization, or writes.
struct HealthKitFeatureGate: Equatable, Sendable {
    let enabledOperations: Set<HealthKitCapabilityOperation>

    static let n0Disabled = HealthKitFeatureGate(enabledOperations: [])

    func allows(_ operation: HealthKitCapabilityOperation) -> Bool {
        enabledOperations.contains(operation)
    }
}

enum HealthKitAvailability: Equatable, Sendable {
    case unavailableOnDevice
    case availableAuthorizationNotRequested
    case authorizationRequestRequired
    case available
    case availableNoVisibleData
    case restrictedOrUnavailable
    case operationalError(code: String)
}

enum HealthKitReadDomain: String, CaseIterable, Hashable, Sendable {
    case activity
    case nutrition
    case workouts
    case sleep
}

enum HealthKitWriteDomain: String, CaseIterable, Hashable, Sendable {
    case weight
    case bodyComposition
}

enum HealthKitAuthorizationScope: Equatable, Sendable {
    case initialRead
    case futureBodyMeasurementWrite
}

enum HealthKitAuthorizationOutcome: Equatable, Sendable {
    case blockedByFeatureGate
    case unavailable(HealthKitAvailability)
    case completed
    case failed(HealthKitAvailability)
}

enum HealthKitServerIngestionContract {
    static let commandType = "healthkit.observations.ingest.v1"
    static let maximumObservationsPerBatch = 100
    static let queryCursorAuthority = "device"
}

/// Opaque HealthKit query state is device-owned. These bytes must never be
/// included in a Server command or treated as Server authority.
struct HealthKitDeviceOwnedCursor: Equatable, Sendable {
    let sampleTypeIdentifier: String
    let opaqueAnchorData: Data
    let localRevision: UInt64
}

struct HealthKitSourceMetadata: Equatable, Codable, Sendable {
    let bundleIdentifier: String
    let sourceName: String
    let sourceRevision: String?
    let productType: String?
    let privacySafeDeviceProvenance: String?
}

struct HealthKitNormalizedMeasurement: Equatable, Codable, Sendable {
    let originalValue: Double?
    let originalUnit: String?
    let normalizedValue: Double?
    let normalizedUnit: String?
}

struct HealthKitFrozenOccurrence: Equatable, Codable, Sendable {
    let startedAt: Date?
    let endedAt: Date?
    let localDate: String
    let timeZoneIdentifier: String
    let utcOffsetSeconds: Int
    let localDayStartedAt: Date
    let localDayEndedAt: Date
}

/// Transport normalization deliberately contains source facts only. It has
/// no Goal, Evidence-authority, Confidence, Narrative, Strategy, or coaching
/// fields and therefore cannot perform strategic interpretation.
struct HealthKitNormalizedSourceObservation: Equatable, Codable, Sendable {
    let immutableHealthKitExternalID: String
    let healthKitUUID: UUID?
    let sampleTypeIdentifier: String
    let source: HealthKitSourceMetadata
    let measurement: HealthKitNormalizedMeasurement?
    let occurrence: HealthKitFrozenOccurrence
    let allowlistedMetadata: [String: String]
}

/// Future anchored-query deletion output. N0 only defines the device-owned
/// staging shape; it does not query, persist, upload, or interpret deletions.
struct HealthKitNormalizedSourceDeletion: Equatable, Codable, Sendable {
    let immutableHealthKitExternalID: String
    let healthKitUUID: UUID
    let sampleTypeIdentifier: String
}

struct HealthKitPendingBatchIdentity: Equatable, Hashable, Codable, Sendable {
    let value: String
}

struct HealthKitPendingBatch: Equatable, Sendable {
    let identity: HealthKitPendingBatchIdentity
    let observations: [HealthKitNormalizedSourceObservation]
    let deletions: [HealthKitNormalizedSourceDeletion]
    let previousCursor: HealthKitDeviceOwnedCursor?
    let proposedCursor: HealthKitDeviceOwnedCursor
    let stagedAt: Date
}

struct HealthKitServerAcknowledgement: Equatable, Sendable {
    let batchIdentity: HealthKitPendingBatchIdentity
    let receiptIdentity: String
    let acknowledgedAt: Date
}

struct HealthKitSynchronizationDiagnostics: Equatable, Sendable {
    let stagedBatchCount: Int
    let pendingUploadCount: Int
    let lastAcknowledgedAt: Date?
    let lastOperationalErrorCode: String?
}

/// N1 will provide the durable implementation. Its ordering contract is:
/// observer wake -> anchored query -> durable local stage -> observer
/// completion -> Server upload -> durable acknowledgement -> local anchor
/// advance. A lost acknowledgement replays the same deterministic batch.
protocol HealthKitDeviceSyncStateStore {
    func stage(_ batch: HealthKitPendingBatch) async throws
    func pendingBatches() async throws -> [HealthKitPendingBatch]
    func recordAcknowledgement(_ acknowledgement: HealthKitServerAcknowledgement) async throws
    func advanceCursor(
        _ cursor: HealthKitDeviceOwnedCursor,
        after acknowledgement: HealthKitServerAcknowledgement
    ) async throws
}
