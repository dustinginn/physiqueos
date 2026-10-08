import Foundation

/// Mutable request state is MainActor-isolated; immutable registry/gate/service
/// references are assigned once during construction. This allows concurrent
/// callers to express coalescing while all service use remains on MainActor.
final class HealthKitAuthorizationCoordinator: @unchecked Sendable {
    let registry: HealthKitTypeRegistry
    let featureGate: HealthKitFeatureGate

    private let service: any HealthKitService
    @MainActor private var readyScopes: Set<HealthKitAuthorizationScope> = []
    @MainActor private var inFlight: InFlightRequest?

    private struct InFlightRequest {
        let id: UUID
        let scope: HealthKitAuthorizationScope
        let task: Task<HealthKitAuthorizationOutcome, Never>
    }

    init(
        service: any HealthKitService,
        registry: HealthKitTypeRegistry = .physiqueOSV1,
        featureGate: HealthKitFeatureGate = .n0Disabled
    ) {
        self.service = service
        self.registry = registry
        self.featureGate = featureGate
    }

    @MainActor var currentAvailability: HealthKitAvailability {
        switch service.deviceAvailability {
        case .unavailable:
            .unavailableOnDevice
        case .restrictedOrUnavailable:
            .restrictedOrUnavailable
        case .available:
            readyScopes.isEmpty ? .availableAuthorizationNotRequested : .available
        }
    }

    func authorizationRequest(for scope: HealthKitAuthorizationScope) -> HealthKitAuthorizationRequest {
        registry.authorizationRequest(for: scope)
    }

    /// This check is explicit and feature-gated. App initialization never
    /// invokes it, so N0 cannot produce a surprise Health permission prompt.
    @MainActor func evaluateAuthorizationRequirement(
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

    /// Preflights the exact type set before any raw request. All phone callers
    /// share this one serialized lane, so launch, foreground, recovery,
    /// diagnostics, and DEXA cannot race independent HealthKit sheets.
    @MainActor
    func requestAuthorization(
        for scope: HealthKitAuthorizationScope,
        presentation: HealthKitAuthorizationPresentation = .foreground
    ) async -> HealthKitAuthorizationOutcome {
        if let active = inFlight {
            let result = await active.task.value
            if inFlight?.id == active.id { inFlight = nil }
            // A background preflight must not suppress a foreground caller
            // that joined it while the exact scope was in flight.
            if result == .requestRequired, presentation == .foreground {
                return await requestAuthorization(for: scope, presentation: presentation)
            }
            if active.scope == scope { return result }
            return await requestAuthorization(for: scope, presentation: presentation)
        }

        let id = UUID()
        let task: Task<HealthKitAuthorizationOutcome, Never> = Task { @MainActor [weak self] in
            guard let self else {
                return .failed(.operationalError(code: "healthkit_authorization_coordinator_released"))
            }
            return await self.performAuthorization(for: scope, presentation: presentation)
        }
        inFlight = InFlightRequest(id: id, scope: scope, task: task)
        let result = await task.value
        if inFlight?.id == id { inFlight = nil }
        return result
    }

    @MainActor
    private func performAuthorization(
        for scope: HealthKitAuthorizationScope,
        presentation: HealthKitAuthorizationPresentation
    ) async -> HealthKitAuthorizationOutcome {
        guard featureGate.allows(.requestAuthorization) else {
            return .blockedByFeatureGate
        }
        guard service.deviceAvailability == .available else {
            return .unavailable(currentAvailability)
        }
        do {
            let request = authorizationRequest(for: scope)
            switch try await service.authorizationRequestRequirement(for: request) {
            case .unnecessary:
                readyScopes.insert(scope)
                return .completed
            case .shouldRequest where presentation == .prohibited:
                return .requestRequired
            case .shouldRequest:
                break
            case .unknown:
                return .failed(.operationalError(code: "healthkit_authorization_requirement_unknown"))
            }
            guard try await service.requestAuthorization(request) else {
                return .failed(.operationalError(code: "healthkit_authorization_request_not_completed"))
            }
            // This records only that the OS flow completed for the exact
            // scope. It is never interpreted as proof of any read grant.
            readyScopes.insert(scope)
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
    @MainActor func availabilityAfterEmptyRead() -> HealthKitAvailability {
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
