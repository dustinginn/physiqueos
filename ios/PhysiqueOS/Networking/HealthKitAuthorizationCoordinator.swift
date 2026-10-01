import Foundation

final class HealthKitAuthorizationCoordinator {
    let registry: HealthKitTypeRegistry
    let featureGate: HealthKitFeatureGate

    private let service: any HealthKitService
    private(set) var authorizationWasRequested = false

    init(
        service: any HealthKitService,
        registry: HealthKitTypeRegistry = .physiqueOSV1,
        featureGate: HealthKitFeatureGate = .n0Disabled
    ) {
        self.service = service
        self.registry = registry
        self.featureGate = featureGate
    }

    var currentAvailability: HealthKitAvailability {
        switch service.deviceAvailability {
        case .unavailable:
            .unavailableOnDevice
        case .restrictedOrUnavailable:
            .restrictedOrUnavailable
        case .available:
            authorizationWasRequested ? .available : .availableAuthorizationNotRequested
        }
    }

    func authorizationRequest(for scope: HealthKitAuthorizationScope) -> HealthKitAuthorizationRequest {
        registry.authorizationRequest(for: scope)
    }

    /// This check is explicit and feature-gated. App initialization never
    /// invokes it, so N0 cannot produce a surprise Health permission prompt.
    func evaluateAuthorizationRequirement(
        for scope: HealthKitAuthorizationScope
    ) async -> HealthKitAvailability {
        guard featureGate.allows(.requestAuthorization) else {
            return currentAvailability
        }
        guard service.deviceAvailability == .available else {
            return currentAvailability
        }
        do {
            switch try await service.authorizationRequestRequirement(
                for: authorizationRequest(for: scope)
            ) {
            case .shouldRequest:
                return .authorizationRequestRequired
            case .unnecessary:
                return .available
            case .unknown:
                return .operationalError(code: "healthkit_authorization_requirement_unknown")
            }
        } catch let error as HealthKitServiceError where error == .restrictedOrUnavailable {
            return .restrictedOrUnavailable
        } catch let error as HealthKitServiceError {
            return .operationalError(code: error.operationalCode)
        } catch {
            return .operationalError(code: "healthkit_authorization_requirement_failed")
        }
    }

    func requestAuthorization(
        for scope: HealthKitAuthorizationScope
    ) async -> HealthKitAuthorizationOutcome {
        guard featureGate.allows(.requestAuthorization) else {
            return .blockedByFeatureGate
        }
        guard service.deviceAvailability == .available else {
            return .unavailable(currentAvailability)
        }
        do {
            guard try await service.requestAuthorization(authorizationRequest(for: scope)) else {
                return .failed(.operationalError(code: "healthkit_authorization_request_not_completed"))
            }
            authorizationWasRequested = true
            return .completed
        } catch let error as HealthKitServiceError where error == .restrictedOrUnavailable {
            return .failed(.restrictedOrUnavailable)
        } catch let error as HealthKitServiceError {
            return .failed(.operationalError(code: error.operationalCode))
        } catch {
            return .failed(.operationalError(code: "healthkit_authorization_request_failed"))
        }
    }

    /// A successful empty read means only that no data was visible. Apple
    /// does not disclose per-type read denial, so this state must never be
    /// translated into a claimed read-denied status.
    func availabilityAfterEmptyRead() -> HealthKitAvailability {
        service.deviceAvailability == .available
            ? .availableNoVisibleData
            : currentAvailability
    }
}

private extension HealthKitServiceError {
    var operationalCode: String {
        switch self {
        case .restrictedOrUnavailable:
            "healthkit_restricted_or_unavailable"
        case let .operational(code):
            code
        }
    }
}
