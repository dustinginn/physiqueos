import HealthKit

enum HealthKitDeviceAvailability: Equatable {
    case available
    case unavailable
    case restrictedOrUnavailable
}

enum HealthKitAuthorizationRequestRequirement: Equatable {
    case shouldRequest
    case unnecessary
    case unknown
}

enum HealthKitServiceError: Error, Equatable {
    case restrictedOrUnavailable
    case operational(code: String)
}

/// N0 exposes authorization only. Query, background-delivery, upload, and
/// write methods are deliberately absent so disabled runtime code cannot
/// accidentally begin synchronization.
protocol HealthKitService: AnyObject {
    var deviceAvailability: HealthKitDeviceAvailability { get }
    func authorizationRequestRequirement(
        for request: HealthKitAuthorizationRequest
    ) async throws -> HealthKitAuthorizationRequestRequirement
    func requestAuthorization(_ request: HealthKitAuthorizationRequest) async throws -> Bool
}

final class SystemHealthKitService: HealthKitService {
    private let healthStore: HKHealthStore

    init(healthStore: HKHealthStore = HKHealthStore()) {
        self.healthStore = healthStore
    }

    var deviceAvailability: HealthKitDeviceAvailability {
        HKHealthStore.isHealthDataAvailable() ? .available : .unavailable
    }

    func authorizationRequestRequirement(
        for request: HealthKitAuthorizationRequest
    ) async throws -> HealthKitAuthorizationRequestRequirement {
        try await withCheckedThrowingContinuation { continuation in
            healthStore.getRequestStatusForAuthorization(
                toShare: request.writeTypes,
                read: request.readTypes
            ) { status, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                switch status {
                case .shouldRequest:
                    continuation.resume(returning: .shouldRequest)
                case .unnecessary:
                    continuation.resume(returning: .unnecessary)
                case .unknown:
                    continuation.resume(returning: .unknown)
                @unknown default:
                    continuation.resume(returning: .unknown)
                }
            }
        }
    }

    func requestAuthorization(_ request: HealthKitAuthorizationRequest) async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            healthStore.requestAuthorization(
                toShare: request.writeTypes,
                read: request.readTypes
            ) { completed, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: completed)
            }
        }
    }
}
