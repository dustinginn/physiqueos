import Foundation

enum HealthKitSynchronizationStream: String, CaseIterable, Codable, Hashable, Sendable {
    case activitySummary
    case activeEnergy
    case exerciseTime
    case standTime
    case stepCount
    case walkingRunningDistance
    case flightsClimbed
    case nutritionEnergy
    case nutritionProtein
    case nutritionCarbohydrates
    case nutritionTotalFat
    case nutritionFiber
    case workouts
    case heartRate
    case cyclingDistance
    case sleepAnalysis

    var domain: HealthKitReadDomain {
        switch self {
        case .activitySummary, .activeEnergy, .exerciseTime, .standTime,
             .stepCount, .walkingRunningDistance, .flightsClimbed:
            .activity
        case .nutritionEnergy, .nutritionProtein, .nutritionCarbohydrates,
             .nutritionTotalFat, .nutritionFiber:
            .nutrition
        case .workouts, .heartRate, .cyclingDistance:
            .workouts
        case .sleepAnalysis:
            .sleep
        }
    }

    var objectTypeIdentifier: String {
        switch self {
        case .activitySummary: "HKActivitySummaryType"
        case .activeEnergy: "HKQuantityTypeIdentifierActiveEnergyBurned"
        case .exerciseTime: "HKQuantityTypeIdentifierAppleExerciseTime"
        case .standTime: "HKQuantityTypeIdentifierAppleStandTime"
        case .stepCount: "HKQuantityTypeIdentifierStepCount"
        case .walkingRunningDistance: "HKQuantityTypeIdentifierDistanceWalkingRunning"
        case .flightsClimbed: "HKQuantityTypeIdentifierFlightsClimbed"
        case .nutritionEnergy: "HKQuantityTypeIdentifierDietaryEnergyConsumed"
        case .nutritionProtein: "HKQuantityTypeIdentifierDietaryProtein"
        case .nutritionCarbohydrates: "HKQuantityTypeIdentifierDietaryCarbohydrates"
        case .nutritionTotalFat: "HKQuantityTypeIdentifierDietaryFatTotal"
        case .nutritionFiber: "HKQuantityTypeIdentifierDietaryFiber"
        case .workouts: "HKWorkoutTypeIdentifier"
        case .heartRate: "HKQuantityTypeIdentifierHeartRate"
        case .cyclingDistance: "HKQuantityTypeIdentifierDistanceCycling"
        case .sleepAnalysis: "HKCategoryTypeIdentifierSleepAnalysis"
        }
    }

    var deliveryCapability: HealthKitStreamDeliveryCapability {
        switch self {
        case .activitySummary: .s1(observationType: .activitySummary)
        case .workouts: .s1(observationType: .workout)
        case .sleepAnalysis: .localOnly(reason: "server_sleep_contract_deferred")
        default: .s1(observationType: .quantitySample)
        }
    }
}

enum HealthKitS1ObservationType: String, Codable, Sendable {
    case activitySummary = "activity_summary"
    case workout
    case quantitySample = "quantity_sample"
}

enum HealthKitStreamDeliveryCapability: Equatable, Codable, Sendable {
    case s1(observationType: HealthKitS1ObservationType)
    case localOnly(reason: String)
}

struct HealthKitCursorScope: Equatable, Hashable, Codable, Sendable {
    let ownerIdentity: String
    let enrolledDeviceIdentity: String
    let stream: HealthKitSynchronizationStream
    let predicateVersion: String
}

struct HealthKitAuthoritativeCursor: Equatable, Codable, Sendable {
    let scope: HealthKitCursorScope
    let opaqueAnchorData: Data
    let generation: UInt64
    let digest: String
    let acceptedAt: Date
}

struct HealthKitQuerySource: Equatable, Codable, Sendable {
    let bundleIdentifier: String
    let sourceName: String
    let sourceRevision: String?
    let productType: String?
    let privacySafeDeviceProvenance: String?
}

struct HealthKitQueryOccurrence: Equatable, Codable, Sendable {
    let startedAt: Date?
    let endedAt: Date?
    let localDate: String
    let calendarIdentifier: String
    let timeZoneIdentifier: String
    let utcOffsetSeconds: Int
    let localDayStartedAt: Date
    let localDayEndedAt: Date
}

struct HealthKitQueryQuantity: Equatable, Codable, Sendable {
    let originalValue: Double?
    let originalUnit: String?
    let normalizedValue: Double?
    let normalizedUnit: String?
    let workoutExternalID: String?
}

struct HealthKitQueryWorkout: Equatable, Codable, Sendable {
    let activityType: String
    let durationSeconds: Double?
    let activeCalories: Double?
    let totalCalories: Double?
    let distance: Double?
    let distanceUnit: String?
    let averageHeartRate: Double?
    let telemetryTypeIdentifiers: [String]
}

struct HealthKitQueryActivitySummary: Equatable, Codable, Sendable {
    enum Coverage: String, Codable, Sendable { case partialDay = "partial_day"; case completeDay = "complete_day" }

    let dailyActivity: [String: Double]
    let aggregationScope: String
    let coverage: Coverage
    let sourceRevision: UInt64
}

struct HealthKitQuerySleep: Equatable, Codable, Sendable {
    let stageValue: Int
}

enum HealthKitQueryPayload: Equatable, Codable, Sendable {
    case quantity(HealthKitQueryQuantity)
    case workout(HealthKitQueryWorkout)
    case activitySummary(HealthKitQueryActivitySummary)
    case sleep(HealthKitQuerySleep)
}

struct HealthKitQueryAddition: Equatable, Codable, Sendable {
    let healthKitUUID: UUID?
    let objectTypeIdentifier: String
    let source: HealthKitQuerySource
    let occurrence: HealthKitQueryOccurrence
    let payload: HealthKitQueryPayload
    let allowlistedMetadata: [String: String]
}

struct HealthKitQueryDeletion: Equatable, Codable, Sendable {
    let healthKitUUID: UUID
    let immutableExternalID: String?
    let objectTypeIdentifier: String
}

struct HealthKitAnchoredQueryResult: Equatable, Codable, Sendable {
    let additions: [HealthKitQueryAddition]
    let deletions: [HealthKitQueryDeletion]
    let proposedAnchorData: Data
    let completedAt: Date
}

struct NormalizedHealthKitObservation: Equatable, Codable, Sendable {
    let immutableExternalID: String
    let healthKitUUID: UUID?
    let objectTypeIdentifier: String
    let source: HealthKitQuerySource
    let occurrence: HealthKitQueryOccurrence
    let payload: HealthKitQueryPayload
    let allowlistedMetadata: [String: String]
}

struct NormalizedHealthKitDeletion: Equatable, Codable, Sendable {
    let immutableExternalID: String
    let healthKitUUID: UUID
    let objectTypeIdentifier: String
}

enum HealthKitPartitionDisposition: Equatable, Codable, Sendable {
    case serverRequired
    case localDeferred(reason: String)
    case localCheckpoint
}

enum HealthKitPartitionAttemptState: Equatable, Codable, Sendable {
    case pending
    case uploading
    case transientFailure(code: String)
    case rejected(code: String)
    case acknowledged(receiptIdentity: String, at: Date)
    case deferredByCapability(reason: String)
    case checkpointed

    var permitsCursorAdvance: Bool {
        switch self {
        case .acknowledged, .deferredByCapability, .checkpointed: true
        default: false
        }
    }
}

struct HealthKitStagedPartition: Equatable, Codable, Sendable {
    let identity: String
    let index: Int
    let disposition: HealthKitPartitionDisposition
    let additions: [NormalizedHealthKitObservation]
    let deletions: [NormalizedHealthKitDeletion]
    var attemptState: HealthKitPartitionAttemptState
    var attemptCount: Int
    var lastAttemptAt: Date?
}

struct HealthKitStagedBatch: Equatable, Codable, Sendable {
    let identity: String
    let scope: HealthKitCursorScope
    let previousCursorDigest: String?
    let proposedCursor: HealthKitAuthoritativeCursor
    let createdAt: Date
    var partitions: [HealthKitStagedPartition]
}

struct HealthKitDeferredChange: Equatable, Codable, Sendable {
    let batchIdentity: String
    let partitionIdentity: String
    let reason: String
    let additions: [NormalizedHealthKitObservation]
    let deletions: [NormalizedHealthKitDeletion]
    let stagedAt: Date
}

struct HealthKitStreamDiagnostics: Equatable, Codable, Sendable {
    var enabled: Bool
    var availability: HealthKitAvailability
    var authorizationState: String
    var lastObserverWakeup: Date?
    var lastSuccessfulAnchoredQuery: Date?
    var cursorGeneration: UInt64?
    var cursorDigest: String?
    var pendingBatchCount: Int
    var lastUploadAttempt: Date?
    var lastDurableAcknowledgement: Date?
    var lastErrorCode: String?
    var boundedRecoveryCount: Int
}

enum HealthKitSyncError: Error, Equatable, Sendable {
    case featureDisabled
    case pendingBatchMustResolve
    case corruptCursor
    case ownerOrDeviceMismatch
    case invalidAcknowledgement
    case serverRejected(code: String)
    case operational(code: String)

    var diagnosticCode: String {
        switch self {
        case .featureDisabled: "healthkit_feature_disabled"
        case .pendingBatchMustResolve: "healthkit_pending_batch_must_resolve"
        case .corruptCursor: "healthkit_cursor_corrupt"
        case .ownerOrDeviceMismatch: "healthkit_owner_or_device_mismatch"
        case .invalidAcknowledgement: "healthkit_acknowledgement_invalid"
        case let .serverRejected(code), let .operational(code): code
        }
    }
}
