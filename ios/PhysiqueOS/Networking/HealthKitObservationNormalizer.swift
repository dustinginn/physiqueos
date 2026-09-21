import Foundation

struct HealthKitObservationNormalizer: Sendable {
    func normalize(
        _ addition: HealthKitQueryAddition,
        externalIDNamespace: String? = nil
    ) -> NormalizedHealthKitObservation {
        let externalID: String
        let namespace = externalIDNamespace.map { "\($0):" } ?? ""
        if let uuid = addition.healthKitUUID {
            externalID = uuid.uuidString.lowercased()
        } else if case .activitySummary = addition.payload {
            externalID = "activity-summary:\(namespace)\(addition.occurrence.localDate)"
        } else if case .nutritionDailyTotal = addition.payload {
            externalID = "nutrition-daily-total:\(namespace)\(addition.occurrence.localDate)"
        } else {
            externalID = "source-object:\(addition.objectTypeIdentifier):\(addition.occurrence.localDate)"
        }
        return NormalizedHealthKitObservation(
            immutableExternalID: externalID,
            healthKitUUID: addition.healthKitUUID,
            objectTypeIdentifier: addition.objectTypeIdentifier,
            source: addition.source,
            occurrence: addition.occurrence,
            payload: addition.payload,
            allowlistedMetadata: addition.allowlistedMetadata
        )
    }

    func normalize(_ deletion: HealthKitQueryDeletion) -> NormalizedHealthKitDeletion {
        NormalizedHealthKitDeletion(
            immutableExternalID: deletion.immutableExternalID ?? deletion.healthKitUUID.uuidString.lowercased(),
            healthKitUUID: deletion.healthKitUUID,
            objectTypeIdentifier: deletion.objectTypeIdentifier
        )
    }
}

struct HealthKitBatchBuilder: Sendable {
    let maximumPartitionSize: Int
    private let encoder: JSONEncoder

    init(maximumPartitionSize: Int = HealthKitServerIngestionContract.maximumObservationsPerBatch) {
        self.maximumPartitionSize = maximumPartitionSize
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder
    }

    func build(
        scope: HealthKitCursorScope,
        previousCursor: HealthKitAuthoritativeCursor?,
        queryResult: HealthKitAnchoredQueryResult,
        createdAt: Date,
        ingestionPurpose: HealthKitIngestionPurpose = .operational
    ) throws -> HealthKitStagedBatch {
        let normalizer = HealthKitObservationNormalizer()
        let namespace = scope.predicateVersion.hasPrefix(HealthKitCanonicalTestDay.predicatePrefix)
            ? HealthKitCanonicalTestDay.externalIDNamespace
            : nil
        let additions = queryResult.additions
            .map { normalizer.normalize($0, externalIDNamespace: namespace) }
            .sorted(by: Self.observationOrder)
        let deletions = queryResult.deletions.map(normalizer.normalize).sorted {
            $0.immutableExternalID < $1.immutableExternalID
        }
        let proposedDigest = HealthKitStableDigest.hex(queryResult.proposedAnchorData)
        let generation = (previousCursor?.generation ?? 0) + 1
        let proposedCursor = HealthKitAuthoritativeCursor(
            scope: scope,
            opaqueAnchorData: queryResult.proposedAnchorData,
            generation: generation,
            digest: proposedDigest,
            acceptedAt: queryResult.completedAt
        )
        let identityMaterial = try encoder.encode(BatchIdentityMaterial(
            scope: scope,
            previousCursorDigest: previousCursor?.digest,
            proposedCursorDigest: proposedDigest,
            ingestionPurpose: ingestionPurpose,
            additions: additions,
            deletions: deletions
        ))
        let batchID = "healthkit_batch_\(HealthKitStableDigest.hex(identityMaterial))"
        var partitions: [HealthKitStagedPartition] = []

        switch scope.stream.deliveryCapability {
        case .s1:
            let deliverable = additions.filter { HealthKitS1WireMapper.canDeliver($0) }
            let deferredAdditions = additions.filter { !HealthKitS1WireMapper.canDeliver($0) }
            for chunk in deliverable.chunks(of: maximumPartitionSize) {
                partitions.append(try partition(
                    batchID: batchID,
                    index: partitions.count,
                    ingestionPurpose: ingestionPurpose,
                    disposition: .serverRequired,
                    additions: chunk,
                    deletions: [],
                    initialState: .pending
                ))
            }
            let deferredReason = "server_deletion_contract_deferred"
            for chunk in deferredAdditions.chunks(of: maximumPartitionSize) {
                partitions.append(try partition(
                    batchID: batchID,
                    index: partitions.count,
                    ingestionPurpose: ingestionPurpose,
                    disposition: .localDeferred(reason: "server_observation_shape_deferred"),
                    additions: chunk,
                    deletions: [],
                    initialState: .deferredByCapability(reason: "server_observation_shape_deferred")
                ))
            }
            for chunk in deletions.chunks(of: maximumPartitionSize) {
                partitions.append(try partition(
                    batchID: batchID,
                    index: partitions.count,
                    ingestionPurpose: ingestionPurpose,
                    disposition: .localDeferred(reason: deferredReason),
                    additions: [],
                    deletions: chunk,
                    initialState: .deferredByCapability(reason: deferredReason)
                ))
            }
        case let .localOnly(reason):
            let count = max(additions.count, deletions.count)
            if count > 0 {
                let partitionCount = Int(ceil(Double(count) / Double(maximumPartitionSize)))
                for index in 0..<partitionCount {
                    let additionStart = index * maximumPartitionSize
                    let deletionStart = index * maximumPartitionSize
                    let additionChunk = additions.safeSlice(from: additionStart, count: maximumPartitionSize)
                    let deletionChunk = deletions.safeSlice(from: deletionStart, count: maximumPartitionSize)
                    partitions.append(try partition(
                        batchID: batchID,
                        index: partitions.count,
                        ingestionPurpose: ingestionPurpose,
                        disposition: .localDeferred(reason: reason),
                        additions: additionChunk,
                        deletions: deletionChunk,
                        initialState: .deferredByCapability(reason: reason)
                    ))
                }
            }
        }

        if partitions.isEmpty {
            partitions.append(try partition(
                batchID: batchID,
                index: 0,
                ingestionPurpose: ingestionPurpose,
                disposition: .localCheckpoint,
                additions: [],
                deletions: [],
                initialState: .checkpointed
            ))
        }
        return HealthKitStagedBatch(
            identity: batchID,
            scope: scope,
            ingestionPurpose: ingestionPurpose,
            previousCursorDigest: previousCursor?.digest,
            proposedCursor: proposedCursor,
            createdAt: createdAt,
            partitions: partitions
        )
    }

    private func partition(
        batchID: String,
        index: Int,
        ingestionPurpose: HealthKitIngestionPurpose,
        disposition: HealthKitPartitionDisposition,
        additions: [NormalizedHealthKitObservation],
        deletions: [NormalizedHealthKitDeletion],
        initialState: HealthKitPartitionAttemptState
    ) throws -> HealthKitStagedPartition {
        let material = try encoder.encode(PartitionIdentityMaterial(
            batchID: batchID,
            index: index,
            ingestionPurpose: ingestionPurpose,
            additions: additions,
            deletions: deletions
        ))
        return HealthKitStagedPartition(
            identity: "healthkit_partition_\(HealthKitStableDigest.hex(material))",
            index: index,
            ingestionPurpose: ingestionPurpose,
            disposition: disposition,
            additions: additions,
            deletions: deletions,
            attemptState: initialState,
            attemptCount: 0,
            lastAttemptAt: nil
        )
    }

    private static func observationOrder(
        _ left: NormalizedHealthKitObservation,
        _ right: NormalizedHealthKitObservation
    ) -> Bool {
        if left.immutableExternalID != right.immutableExternalID {
            return left.immutableExternalID < right.immutableExternalID
        }
        return left.objectTypeIdentifier < right.objectTypeIdentifier
    }

    private struct BatchIdentityMaterial: Encodable {
        let scope: HealthKitCursorScope
        let previousCursorDigest: String?
        let proposedCursorDigest: String
        let ingestionPurpose: HealthKitIngestionPurpose
        let additions: [NormalizedHealthKitObservation]
        let deletions: [NormalizedHealthKitDeletion]
    }

    private struct PartitionIdentityMaterial: Encodable {
        let batchID: String
        let index: Int
        let ingestionPurpose: HealthKitIngestionPurpose
        let additions: [NormalizedHealthKitObservation]
        let deletions: [NormalizedHealthKitDeletion]
    }
}

private extension Array {
    func chunks(of size: Int) -> [[Element]] {
        guard !isEmpty else { return [] }
        return stride(from: 0, to: count, by: size).map { start in
            Array(self[start..<Swift.min(start + size, count)])
        }
    }

    func safeSlice(from start: Int, count requestedCount: Int) -> [Element] {
        guard start < count else { return [] }
        return Array(self[start..<Swift.min(start + requestedCount, count)])
    }
}

struct HealthKitS1WirePayload: Encodable, Sendable {
    let batchId: String
    let observations: [HealthKitS1WireObservation]
}

struct HealthKitS1WireObservation: Encodable, Sendable {
    struct Source: Encodable, Sendable {
        let bundleIdentifier: String
        let sourceName: String?
        let sourceRevision: String?
        let productType: String?
        let deviceModel: String?
        let operatingSystemVersion: String?
        let privacySafeDeviceProvenance: String?
    }

    struct Occurrence: Encodable, Sendable {
        let localDate: String
        let timeZone: String
        let utcOffsetSeconds: Int
        let startedAt: String?
        let endedAt: String?
    }

    struct ActivitySummary: Encodable, Sendable {
        let aggregationScope: String
        let coverage: String
        let sourceRevision: UInt64
        let dailyActivity: [String: Double]
    }

    struct NutritionDailyTotal: Encodable, Sendable {
        let aggregationScope: String
        let coverage: String
        let sourceRevision: UInt64
        let dailyNutrition: [String: Double]
    }

    struct Workout: Encodable, Sendable {
        let activityType: String
        let durationSeconds: Double?
        let activeCalories: Double?
        let totalCalories: Double?
        let distance: Double?
        let distanceUnit: String?
        let averageHeartRate: Double?
    }

    struct QuantitySample: Encodable, Sendable {
        let sampleType: String
        let value: Double
        let unit: String
        let workoutExternalId: String?
    }

    let observationType: String
    let externalId: String
    let ingestionPurpose: String
    let source: Source
    let occurrence: Occurrence
    let activitySummary: ActivitySummary?
    let nutritionDailyTotal: NutritionDailyTotal?
    let workout: Workout?
    let quantitySample: QuantitySample?
}

enum HealthKitS1WireMapper {
    static func canDeliver(_ observation: NormalizedHealthKitObservation) -> Bool {
        (try? map(observation)) != nil
    }

    static func payload(for partition: HealthKitStagedPartition) throws -> HealthKitS1WirePayload {
        guard case .serverRequired = partition.disposition,
              partition.additions.count <= HealthKitServerIngestionContract.maximumObservationsPerBatch,
              partition.deletions.isEmpty
        else { throw HealthKitSyncError.operational(code: "healthkit_partition_not_s1_deliverable") }
        return HealthKitS1WirePayload(
            batchId: partition.identity,
            observations: try partition.additions.map {
                try map($0, ingestionPurpose: partition.ingestionPurpose)
            }
        )
    }

    private static func map(
        _ observation: NormalizedHealthKitObservation,
        ingestionPurpose: HealthKitIngestionPurpose = .operational
    ) throws -> HealthKitS1WireObservation {
        let source = HealthKitS1WireObservation.Source(
            bundleIdentifier: observation.source.bundleIdentifier,
            sourceName: observation.source.sourceName,
            sourceRevision: observation.source.sourceRevision,
            productType: observation.source.productType,
            deviceModel: observation.source.privacySafeDeviceProvenance,
            operatingSystemVersion: nil,
            privacySafeDeviceProvenance: observation.source.privacySafeDeviceProvenance
        )
        let occurrence = HealthKitS1WireObservation.Occurrence(
            localDate: observation.occurrence.localDate,
            timeZone: observation.occurrence.timeZoneIdentifier,
            utcOffsetSeconds: observation.occurrence.utcOffsetSeconds,
            startedAt: observation.occurrence.startedAt.map { ISO8601DateFormatter().string(from: $0) },
            endedAt: observation.occurrence.endedAt.map { ISO8601DateFormatter().string(from: $0) }
        )
        switch observation.payload {
        case let .activitySummary(summary):
            guard summary.aggregationScope == "daily_total_including_workouts",
                  summary.dailyActivity["move_calories"] != nil,
                  summary.sourceRevision > 0
            else { throw HealthKitSyncError.operational(code: "healthkit_activity_summary_invalid") }
            return HealthKitS1WireObservation(
                observationType: HealthKitS1ObservationType.activitySummary.rawValue,
                externalId: observation.immutableExternalID,
                ingestionPurpose: ingestionPurpose.rawValue,
                source: source,
                occurrence: occurrence,
                activitySummary: .init(
                    aggregationScope: summary.aggregationScope,
                    coverage: summary.coverage.rawValue,
                    sourceRevision: summary.sourceRevision,
                    dailyActivity: summary.dailyActivity
                ),
                nutritionDailyTotal: nil,
                workout: nil,
                quantitySample: nil
            )
        case let .nutritionDailyTotal(total):
            guard total.aggregationScope == HealthKitQueryNutritionDailyTotal.aggregationScope,
                  total.dailyNutrition["calories"] != nil,
                  total.sourceRevision > 0,
                  Set(total.dailyNutrition.keys).isSubset(of: HealthKitQueryNutritionDailyTotal.permittedKeys),
                  total.dailyNutrition.values.allSatisfy({ $0.isFinite && $0 >= 0 })
            else { throw HealthKitSyncError.operational(code: "healthkit_nutrition_daily_total_invalid") }
            return HealthKitS1WireObservation(
                observationType: HealthKitS1ObservationType.nutritionDailyTotal.rawValue,
                externalId: observation.immutableExternalID,
                ingestionPurpose: ingestionPurpose.rawValue,
                source: source,
                occurrence: occurrence,
                activitySummary: nil,
                nutritionDailyTotal: .init(
                    aggregationScope: total.aggregationScope,
                    coverage: total.coverage.rawValue,
                    sourceRevision: total.sourceRevision,
                    dailyNutrition: total.dailyNutrition
                ),
                workout: nil,
                quantitySample: nil
            )
        case let .workout(workout):
            return HealthKitS1WireObservation(
                observationType: HealthKitS1ObservationType.workout.rawValue,
                externalId: observation.immutableExternalID,
                ingestionPurpose: ingestionPurpose.rawValue,
                source: source,
                occurrence: occurrence,
                activitySummary: nil,
                nutritionDailyTotal: nil,
                workout: .init(
                    activityType: workout.activityType,
                    durationSeconds: workout.durationSeconds,
                    activeCalories: workout.activeCalories,
                    totalCalories: workout.totalCalories,
                    distance: workout.distance,
                    distanceUnit: workout.distanceUnit,
                    averageHeartRate: workout.averageHeartRate
                ),
                quantitySample: nil
            )
        case let .quantity(quantity):
            guard let value = quantity.normalizedValue,
                  let unit = quantity.normalizedUnit,
                  value >= 0
            else { throw HealthKitSyncError.operational(code: "healthkit_quantity_not_deliverable") }
            return HealthKitS1WireObservation(
                observationType: HealthKitS1ObservationType.quantitySample.rawValue,
                externalId: observation.immutableExternalID,
                ingestionPurpose: ingestionPurpose.rawValue,
                source: source,
                occurrence: occurrence,
                activitySummary: nil,
                nutritionDailyTotal: nil,
                workout: nil,
                quantitySample: .init(
                    sampleType: observation.objectTypeIdentifier,
                    value: value,
                    unit: unit,
                    workoutExternalId: quantity.workoutExternalID
                )
            )
        case .sleep:
            throw HealthKitSyncError.operational(code: "server_sleep_contract_deferred")
        }
    }
}
