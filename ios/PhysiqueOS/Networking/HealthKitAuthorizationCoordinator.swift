import Foundation

struct HealthKitAuthorizationDiagnostics: Equatable, Sendable {
    let installationID: String
    let sessionID: String
    let build: String
    let sessionEventCounts: [String: Int]
    let buildEventCounts: [String: Int]
    let lastReason: HealthKitAuthorizationReason?
}

protocol HealthKitAuthorizationReceiptStoring: AnyObject {
    func covers(_ request: HealthKitAuthorizationRequest) -> Bool
    func adoptLegacyIfEligible(_ request: HealthKitAuthorizationRequest) -> Bool
    func recordHandled(_ request: HealthKitAuthorizationRequest)
    func record(event: String, reason: HealthKitAuthorizationReason)
    var diagnostics: HealthKitAuthorizationDiagnostics { get }
}

extension HealthKitAuthorizationReceiptStoring {
    func adoptLegacyIfEligible(_ request: HealthKitAuthorizationRequest) -> Bool { false }
}

/// Durable, local-only record of the exact type sets whose HealthKit flow has
/// already completed. It is an intent/attempt receipt, never a claim that a
/// read permission was granted (HealthKit deliberately keeps that opaque).
final class UserDefaultsHealthKitAuthorizationReceiptStore: HealthKitAuthorizationReceiptStoring {
    private struct Receipt: Codable {
        var read: Set<String>
        var write: Set<String>
    }

    private struct State: Codable {
        var installationID: String
        var receipts: [String: Receipt]
        var buildEventCounts: [String: [String: Int]]
        var lastReason: String?
    }

    private let defaults: UserDefaults
    private let key: String
    private let build: String
    private let legacyAutomaticOwnerIdentityKey: String
    private let sessionID = UUID().uuidString
    private var sessionEventCounts: [String: Int] = [:]
    private var state: State

    init(
        defaults: UserDefaults = .standard,
        key: String = "physiqueos.healthkit.authorization-receipts.v2",
        build: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown",
        legacyAutomaticOwnerIdentityKey: String = "physiqueos.healthkit.automatic.owner-identity.v1"
    ) {
        self.defaults = defaults
        self.key = key
        self.build = build
        self.legacyAutomaticOwnerIdentityKey = legacyAutomaticOwnerIdentityKey
        if let data = defaults.data(forKey: key), let decoded = try? JSONDecoder().decode(State.self, from: data) {
            state = decoded
        } else {
            state = State(installationID: UUID().uuidString, receipts: [:], buildEventCounts: [:], lastReason: nil)
        }
    }

    func covers(_ request: HealthKitAuthorizationRequest) -> Bool {
        guard let receipt = state.receipts[request.scope.receiptKey] else { return false }
        return request.readTypeIdentifiers.isSubset(of: receipt.read)
            && request.writeTypeIdentifiers.isSubset(of: receipt.write)
    }

    /// Build 95 and earlier had no authorization receipt. The automatic
    /// synchronization owner cache is written only after that exact read lane
    /// completed authorization and began operating. Adopt it solely for the
    /// frozen v1 type set; any later type expansion still follows the normal
    /// HealthKit preflight and may present one genuinely new request.
    func adoptLegacyIfEligible(_ request: HealthKitAuthorizationRequest) -> Bool {
        guard request.scope == .automaticRead,
              request.readTypeIdentifiers == HealthKitTypeRegistry.physiqueOSV1
                .authorizationRequest(for: .automaticRead).readTypeIdentifiers,
              request.writeTypeIdentifiers.isEmpty,
              let owner = defaults.string(forKey: legacyAutomaticOwnerIdentityKey),
              !owner.isEmpty
        else { return false }
        recordHandled(request)
        return true
    }

    func recordHandled(_ request: HealthKitAuthorizationRequest) {
        var receipt = state.receipts[request.scope.receiptKey] ?? Receipt(read: [], write: [])
        receipt.read.formUnion(request.readTypeIdentifiers)
        receipt.write.formUnion(request.writeTypeIdentifiers)
        state.receipts[request.scope.receiptKey] = receipt
        persist()
    }

    func record(event: String, reason: HealthKitAuthorizationReason) {
        sessionEventCounts[event, default: 0] += 1
        sessionEventCounts["reason.\(reason.rawValue)", default: 0] += 1
        state.buildEventCounts[build, default: [:]][event, default: 0] += 1
        state.buildEventCounts[build, default: [:]]["reason.\(reason.rawValue)", default: 0] += 1
        // Bound diagnostics across long-lived installs while retaining the
        // current build. Build numbers are numeric in release artifacts.
        if state.buildEventCounts.count > 12 {
            let removable = state.buildEventCounts.keys.filter { $0 != build }.sorted().prefix(state.buildEventCounts.count - 12)
            removable.forEach { state.buildEventCounts.removeValue(forKey: $0) }
        }
        state.lastReason = reason.rawValue
        persist()
    }

    var diagnostics: HealthKitAuthorizationDiagnostics {
        HealthKitAuthorizationDiagnostics(
            installationID: state.installationID,
            sessionID: sessionID,
            build: build,
            sessionEventCounts: sessionEventCounts,
            buildEventCounts: state.buildEventCounts[build, default: [:]],
            lastReason: state.lastReason.flatMap(HealthKitAuthorizationReason.init(rawValue:))
        )
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }
}

private extension HealthKitAuthorizationScope {
    var receiptKey: String {
        switch self {
        case .automaticRead: "automatic-read"
        case .sleepRead: "sleep-read"
        case .futureBodyMeasurementWrite: "body-measurement-write"
        }
    }
}

/// Mutable request state is MainActor-isolated; immutable registry/gate/service
/// references are assigned once during construction. This allows concurrent
/// callers to express coalescing while all service use remains on MainActor.
final class HealthKitAuthorizationCoordinator: @unchecked Sendable {
    let registry: HealthKitTypeRegistry
    let featureGate: HealthKitFeatureGate

    private let service: any HealthKitService
    private let receipts: any HealthKitAuthorizationReceiptStoring
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
        featureGate: HealthKitFeatureGate = .n0Disabled,
        receipts: (any HealthKitAuthorizationReceiptStoring)? = nil
    ) {
        self.service = service
        self.registry = registry
        self.featureGate = featureGate
        self.receipts = receipts ?? UserDefaultsHealthKitAuthorizationReceiptStore()
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

    @MainActor var authorizationDiagnostics: HealthKitAuthorizationDiagnostics { receipts.diagnostics }

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
            let request = authorizationRequest(for: scope)
            if receipts.covers(request) { return .available }
            if receipts.adoptLegacyIfEligible(request) {
                receipts.record(event: "legacy_exact_set_adopted", reason: .foregroundSynchronization)
                return .available
            }
            switch try await service.authorizationRequestRequirement(
                for: request
            ) {
            case .shouldRequest:
                return .authorizationRequestRequired
            case .unnecessary:
                receipts.recordHandled(request)
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
        presentation: HealthKitAuthorizationPresentation = .foreground,
        reason: HealthKitAuthorizationReason = .foregroundSynchronization
    ) async -> HealthKitAuthorizationOutcome {
        if let active = inFlight {
            let result = await active.task.value
            if inFlight?.id == active.id { inFlight = nil }
            // A background preflight must not suppress a foreground caller
            // that joined it while the exact scope was in flight.
            if result == .requestRequired, presentation == .foreground {
                return await requestAuthorization(for: scope, presentation: presentation, reason: reason)
            }
            if active.scope == scope { return result }
            return await requestAuthorization(for: scope, presentation: presentation, reason: reason)
        }

        let id = UUID()
        let task: Task<HealthKitAuthorizationOutcome, Never> = Task { @MainActor [weak self] in
            guard let self else {
                return .failed(.operationalError(code: "healthkit_authorization_coordinator_released"))
            }
            return await self.performAuthorization(for: scope, presentation: presentation, reason: reason)
        }
        inFlight = InFlightRequest(id: id, scope: scope, task: task)
        let result = await task.value
        if inFlight?.id == id { inFlight = nil }
        return result
    }

    @MainActor
    private func performAuthorization(
        for scope: HealthKitAuthorizationScope,
        presentation: HealthKitAuthorizationPresentation,
        reason: HealthKitAuthorizationReason
    ) async -> HealthKitAuthorizationOutcome {
        guard featureGate.allows(.requestAuthorization) else {
            return .blockedByFeatureGate
        }
        guard service.deviceAvailability == .available else {
            return .unavailable(currentAvailability)
        }
        do {
            let request = authorizationRequest(for: scope)
            if receipts.covers(request) {
                receipts.record(event: "covered_skip", reason: reason)
                readyScopes.insert(scope)
                return .completed
            }
            if receipts.adoptLegacyIfEligible(request) {
                receipts.record(event: "legacy_exact_set_adopted", reason: reason)
                readyScopes.insert(scope)
                return .completed
            }
            receipts.record(event: "status_check", reason: reason)
            switch try await service.authorizationRequestRequirement(for: request) {
            case .unnecessary:
                receipts.recordHandled(request)
                receipts.record(event: "system_unnecessary", reason: reason)
                readyScopes.insert(scope)
                return .completed
            case .shouldRequest where presentation == .prohibited:
                receipts.record(event: "prompt_deferred", reason: reason)
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
            receipts.recordHandled(request)
            receipts.record(event: "authorization_completed", reason: reason)
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
