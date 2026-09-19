import HealthKit

struct HealthKitAuthorizationRequest {
    let scope: HealthKitAuthorizationScope
    let readTypes: Set<HKObjectType>
    let writeTypes: Set<HKSampleType>

    var readTypeIdentifiers: Set<String> {
        Set(readTypes.map(\.identifier))
    }

    var writeTypeIdentifiers: Set<String> {
        Set(writeTypes.map(\.identifier))
    }
}

/// One authority for the intended PhysiqueOS V1 HealthKit surface. Read and
/// future-write sets are intentionally separate so body-measurement export
/// can be authorized independently after observe-only synchronization.
struct HealthKitTypeRegistry {
    let readTypesByDomain: [HealthKitReadDomain: Set<HKObjectType>]
    let writeTypesByDomain: [HealthKitWriteDomain: Set<HKSampleType>]

    static let physiqueOSV1 = HealthKitTypeRegistry(
        readTypesByDomain: [
            .activity: [
                HKObjectType.activitySummaryType(),
                requiredQuantity(.activeEnergyBurned),
                requiredQuantity(.appleExerciseTime),
                requiredQuantity(.appleStandTime),
                requiredQuantity(.stepCount),
                requiredQuantity(.distanceWalkingRunning),
                requiredQuantity(.flightsClimbed),
            ],
            .nutrition: [
                requiredQuantity(.dietaryEnergyConsumed),
                requiredQuantity(.dietaryProtein),
                requiredQuantity(.dietaryCarbohydrates),
                requiredQuantity(.dietaryFatTotal),
                requiredQuantity(.dietaryFiber),
            ],
            .workouts: [
                HKObjectType.workoutType(),
                requiredQuantity(.activeEnergyBurned),
                requiredQuantity(.heartRate),
                requiredQuantity(.distanceWalkingRunning),
                requiredQuantity(.distanceCycling),
            ],
            .sleep: [requiredCategory(.sleepAnalysis)],
        ],
        writeTypesByDomain: [
            .weight: [requiredQuantity(.bodyMass)],
            .bodyComposition: [requiredQuantity(.bodyFatPercentage)],
        ]
    )

    var allReadTypes: Set<HKObjectType> {
        readTypesByDomain.values.reduce(into: Set<HKObjectType>()) { result, types in
            result.formUnion(types)
        }
    }

    var allWriteTypes: Set<HKSampleType> {
        writeTypesByDomain.values.reduce(into: Set<HKSampleType>()) { result, types in
            result.formUnion(types)
        }
    }

    func authorizationRequest(for scope: HealthKitAuthorizationScope) -> HealthKitAuthorizationRequest {
        switch scope {
        case .initialRead:
            HealthKitAuthorizationRequest(scope: scope, readTypes: allReadTypes, writeTypes: [])
        case .futureBodyMeasurementWrite:
            HealthKitAuthorizationRequest(scope: scope, readTypes: [], writeTypes: allWriteTypes)
        }
    }
}

private func requiredQuantity(_ identifier: HKQuantityTypeIdentifier) -> HKQuantityType {
    guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
        preconditionFailure("Required HealthKit quantity type is unavailable: \(identifier.rawValue)")
    }
    return type
}

private func requiredCategory(_ identifier: HKCategoryTypeIdentifier) -> HKCategoryType {
    guard let type = HKObjectType.categoryType(forIdentifier: identifier) else {
        preconditionFailure("Required HealthKit category type is unavailable: \(identifier.rawValue)")
    }
    return type
}
