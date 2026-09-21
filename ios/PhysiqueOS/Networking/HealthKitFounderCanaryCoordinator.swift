import Foundation
import Security

@MainActor
protocol HealthKitCanaryAuthorizationCoordinating: AnyObject {
    var currentAvailability: HealthKitAvailability { get }
    var authorizationWasRequested: Bool { get }
    func requestAuthorization(for scope: HealthKitAuthorizationScope) async -> HealthKitAuthorizationOutcome
}

extension HealthKitAuthorizationCoordinator: HealthKitCanaryAuthorizationCoordinating {}

protocol HealthKitActivityCanarySynchronizing: Sendable {
    func synchronizeActivityValidation(
        scope: HealthKitCursorScope,
        window: HealthKitActivityValidationWindow,
        calendar: Calendar
    ) async throws -> HealthKitCanarySyncSummary
    func diagnostics(scope: HealthKitCursorScope) async throws -> HealthKitStreamDiagnostics
}

extension HealthKitSynchronizationEngine: HealthKitActivityCanarySynchronizing {}

/// Adds the exact-day operational path without widening the base canary
/// protocol, so existing validation-only test doubles are unaffected.
protocol HealthKitCanonicalTestDaySynchronizing: HealthKitActivityCanarySynchronizing {
    func synchronizeCanonicalTestDay(
        scope: HealthKitCursorScope,
        testDay: HealthKitCanonicalTestDay,
        calendar: Calendar
    ) async throws -> HealthKitCanarySyncSummary
}

extension HealthKitSynchronizationEngine: HealthKitCanonicalTestDaySynchronizing {}

/// The dormant exact-day Workout path, again without widening the base protocol.
protocol HealthKitWorkoutCanarySynchronizing: HealthKitActivityCanarySynchronizing {
    func synchronizeWorkoutCanary(
        scope: HealthKitCursorScope,
        day: HealthKitWorkoutCanaryDay,
        calendar: Calendar
    ) async throws -> HealthKitCanarySyncSummary
}

extension HealthKitSynchronizationEngine: HealthKitWorkoutCanarySynchronizing {}

protocol HealthKitFounderCanaryServer: Sendable {
    func healthKitCanaryContract() async throws -> HealthKitCanaryServerContract
    func founderOwnerIdentity() async throws -> String
    func healthKitActivityValidation(
        startDate: String,
        endDate: String
    ) async throws -> HealthKitActivityCanaryDiagnostic
}

extension ProductionNativeAPI: HealthKitFounderCanaryServer {
    func healthKitCanaryContract() async throws -> HealthKitCanaryServerContract {
        let manifest = try await readContracts()
        guard let healthKit = manifest.healthKitIngestion,
              manifest.writes.contains(where: {
                  $0.commandType == HealthKitServerIngestionContract.commandType &&
                  $0.endpoint == "/api/v1/native/commands"
              }),
              manifest.reads.contains(where: {
                  $0.resource == HealthKitServerIngestionContract.activityCanaryDiagnosticResource &&
                  $0.endpoint == HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint
              }),
              healthKit.commandType == HealthKitServerIngestionContract.commandType,
              healthKit.contractVersion == HealthKitServerIngestionContract.contractVersion,
              healthKit.maximumBatchSize == HealthKitServerIngestionContract.maximumObservationsPerBatch,
              Set(healthKit.observationTypes) == Set(HealthKitS1ObservationType.allRawValues),
              Set(healthKit.ingestionPurposes) == Set([
                  HealthKitIngestionPurpose.operational.rawValue,
                  HealthKitIngestionPurpose.validationOnly.rawValue,
              ]),
              healthKit.defaultIngestionPurpose == HealthKitIngestionPurpose.operational.rawValue,
              healthKit.validationDiagnostic.contains(HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint),
              healthKit.queryCursor.contains("device-owned")
        else { throw HealthKitCanaryError.serverContractMismatch }
        return HealthKitCanaryServerContract(
            commandType: healthKit.commandType,
            contractVersion: healthKit.contractVersion,
            maximumBatchSize: healthKit.maximumBatchSize,
            observationTypes: Set(healthKit.observationTypes),
            ingestionPurposes: Set(healthKit.ingestionPurposes),
            diagnosticEndpoint: HealthKitServerIngestionContract.activityCanaryDiagnosticEndpoint,
            additionalObservationTypes: Set(healthKit.additionalObservationTypes ?? []),
            hasCanonicalDailyActivation: !(healthKit.canonicalDailyActivation ?? "").isEmpty,
            hasWorkoutCanonicalActivation: !(healthKit.workoutCanonicalActivation ?? "").isEmpty
        )
    }

    func founderOwnerIdentity() async throws -> String {
        let profile = try await readProfile()
        guard let identity = profile.data.profile.identity?.id, !identity.isEmpty else {
            throw HealthKitCanaryError.serverContractMismatch
        }
        return identity
    }

    func healthKitActivityValidation(
        startDate: String,
        endDate: String
    ) async throws -> HealthKitActivityCanaryDiagnostic {
        let envelope: ProductionResponseEnvelope<HealthKitActivityCanaryDiagnostic> = try await readResource(
            HealthKitServerIngestionContract.activityCanaryDiagnosticResource,
            query: ["startDate": startDate, "endDate": endDate],
            policy: .reload,
            as: HealthKitActivityCanaryDiagnostic.self
        )
        return envelope.data
    }
}

private extension HealthKitS1ObservationType {
    static var allRawValues: [String] {
        [activitySummary.rawValue, workout.rawValue, quantitySample.rawValue]
    }
}

protocol HealthKitCanaryDeviceIdentityStore: Sendable {
    func stableIdentity() throws -> String
}

final class KeychainHealthKitCanaryDeviceIdentityStore: HealthKitCanaryDeviceIdentityStore, @unchecked Sendable {
    private let service = "com.physiqueos.native.healthkit-canary-device"
    private let account = "stable-enrolled-device-identity-v1"

    func stableIdentity() throws -> String {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess,
           let data = result as? Data,
           let value = String(data: data, encoding: .utf8),
           !value.isEmpty {
            return value
        }
        guard status == errSecItemNotFound else {
            throw HealthKitCanaryError.stableDeviceIdentityUnavailable
        }
        let value = "founder-device-\(UUID().uuidString.lowercased())"
        guard let data = value.data(using: .utf8) else {
            throw HealthKitCanaryError.stableDeviceIdentityUnavailable
        }
        var insert = baseQuery
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else {
            throw HealthKitCanaryError.stableDeviceIdentityUnavailable
        }
        return value
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

final class HealthKitFounderCanaryCoordinator {
    private let authorization: any HealthKitCanaryAuthorizationCoordinating
    private let synchronizer: any HealthKitActivityCanarySynchronizing
    private let server: any HealthKitFounderCanaryServer
    private let deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore
    private let calendar: Calendar
    private let now: @Sendable () -> Date
    private let canonicalizationLedger: HealthKitCanonicalizationLedger?

    @MainActor private(set) var isEnabled = false

    init(
        authorization: any HealthKitCanaryAuthorizationCoordinating,
        synchronizer: any HealthKitActivityCanarySynchronizing,
        server: any HealthKitFounderCanaryServer,
        deviceIdentityStore: any HealthKitCanaryDeviceIdentityStore = KeychainHealthKitCanaryDeviceIdentityStore(),
        calendar: Calendar = .autoupdatingCurrent,
        now: @escaping @Sendable () -> Date = Date.init,
        canonicalizationLedger: HealthKitCanonicalizationLedger? = nil
    ) {
        self.canonicalizationLedger = canonicalizationLedger
        self.authorization = authorization
        self.synchronizer = synchronizer
        self.server = server
        self.deviceIdentityStore = deviceIdentityStore
        self.calendar = calendar
        self.now = now
    }

    @MainActor var availability: HealthKitAvailability { authorization.currentAvailability }
    @MainActor var authorizationWasExplicitlyRequested: Bool { authorization.authorizationWasRequested }

    @MainActor
    func setEnabled(_ enabled: Bool) {
        isEnabled = enabled
    }

    @MainActor
    func requestAuthorization() async -> HealthKitAuthorizationOutcome {
        guard isEnabled else { return .blockedByFeatureGate }
        return await authorization.requestAuthorization(for: .initialRead)
    }

    /// Foreground, exact-day Activity + Nutrition upload for the controlled
    /// canonical test day. Nothing here runs at launch, and the Server alone
    /// decides whether the day canonicalizes (its own activation window) and
    /// keeps the result quarantined from V3, Confidence, and briefings.
    @MainActor
    func synchronizeCanonicalTestDay(_ testDay: HealthKitCanonicalTestDay) async throws -> HealthKitCanonicalTestDayRunResult {
        guard isEnabled else { throw HealthKitCanaryError.disabled }
        guard authorization.authorizationWasRequested else { throw HealthKitCanaryError.authorizationRequired }
        guard let synchronizer = synchronizer as? any HealthKitCanonicalTestDaySynchronizing else {
            throw HealthKitCanaryError.canonicalTestDayUnsupported
        }

        let contract = try await server.healthKitCanaryContract()
        guard contract.isCompatible else { throw HealthKitCanaryError.serverContractMismatch }
        guard contract.supportsCanonicalTestDay else { throw HealthKitCanaryError.canonicalTestDayUnsupported }
        let ownerIdentity = try await server.founderOwnerIdentity()
        let deviceIdentity = try deviceIdentityStore.stableIdentity()
        func scope(_ stream: HealthKitSynchronizationStream) -> HealthKitCursorScope {
            HealthKitCursorScope(
                ownerIdentity: ownerIdentity,
                enrolledDeviceIdentity: deviceIdentity,
                stream: stream,
                predicateVersion: testDay.predicateVersion
            )
        }
        let activityScope = scope(.activitySummary)
        let nutritionScope = scope(.nutritionDailyTotal)
        canonicalizationLedger?.reset()
        let activity = try await synchronizer.synchronizeCanonicalTestDay(
            scope: activityScope, testDay: testDay, calendar: calendar
        )
        let nutrition = try await synchronizer.synchronizeCanonicalTestDay(
            scope: nutritionScope, testDay: testDay, calendar: calendar
        )
        return HealthKitCanonicalTestDayRunResult(
            testDay: testDay,
            endDateIsProvisional: testDay.isProvisional(now: now(), calendar: calendar),
            activity: activity,
            nutrition: nutrition,
            activityDiagnostics: try await synchronizer.diagnostics(scope: activityScope),
            nutritionDiagnostics: try await synchronizer.diagnostics(scope: nutritionScope),
            canonicalization: canonicalizationLedger?.reports() ?? []
        )
    }

    /// Foreground, exact-day workout upload for the dormant Workout canary.
    /// Nothing runs at launch. The Server decides whether a workout
    /// canonicalizes (its own separate policy, OFF by default) and always keeps
    /// it quarantined; the Workout Logger stays the authority for training content.
    @MainActor
    func synchronizeWorkoutCanary(_ day: HealthKitWorkoutCanaryDay) async throws -> HealthKitWorkoutCanaryRunResult {
        guard isEnabled else { throw HealthKitCanaryError.disabled }
        guard authorization.authorizationWasRequested else { throw HealthKitCanaryError.authorizationRequired }
        guard let synchronizer = synchronizer as? any HealthKitWorkoutCanarySynchronizing else {
            throw HealthKitCanaryError.canonicalTestDayUnsupported
        }
        let contract = try await server.healthKitCanaryContract()
        guard contract.isCompatible else { throw HealthKitCanaryError.serverContractMismatch }
        guard contract.supportsWorkoutCanary else { throw HealthKitCanaryError.canonicalTestDayUnsupported }
        let scope = HealthKitCursorScope(
            ownerIdentity: try await server.founderOwnerIdentity(),
            enrolledDeviceIdentity: try deviceIdentityStore.stableIdentity(),
            stream: .workouts,
            predicateVersion: day.predicateVersion
        )
        canonicalizationLedger?.reset()
        let summary = try await synchronizer.synchronizeWorkoutCanary(scope: scope, day: day, calendar: calendar)
        return HealthKitWorkoutCanaryRunResult(
            day: day,
            synchronization: summary,
            diagnostics: try await synchronizer.diagnostics(scope: scope),
            canonicalization: canonicalizationLedger?.reports() ?? []
        )
    }

    @MainActor
    func synchronize(window: HealthKitActivityValidationWindow) async throws -> HealthKitFounderCanaryRunResult {
        guard isEnabled else { throw HealthKitCanaryError.disabled }
        guard authorization.authorizationWasRequested else { throw HealthKitCanaryError.authorizationRequired }

        let contract = try await server.healthKitCanaryContract()
        guard contract.isCompatible else { throw HealthKitCanaryError.serverContractMismatch }
        let ownerIdentity = try await server.founderOwnerIdentity()
        let deviceIdentity = try deviceIdentityStore.stableIdentity()
        let scope = HealthKitCursorScope(
            ownerIdentity: ownerIdentity,
            enrolledDeviceIdentity: deviceIdentity,
            stream: .activitySummary,
            predicateVersion: window.predicateVersion
        )
        let summary = try await synchronizer.synchronizeActivityValidation(
            scope: scope,
            window: window,
            calendar: calendar
        )
        let diagnostics = try await synchronizer.diagnostics(scope: scope)
        let readback = try await server.healthKitActivityValidation(
            startDate: window.startDate,
            endDate: window.endDate
        )
        guard readback.boundedRange.startDate == window.startDate,
              readback.boundedRange.endDate == window.endDate,
              readback.boundedRange.inclusive,
              readback.canonicalAuthority == "none",
              readback.strategicAuthority == "none",
              readback.items.allSatisfy({ item in
                  window.contains(localDate: item.frozenLocalDate) &&
                  item.ingestionPurpose == HealthKitIngestionPurpose.validationOnly.rawValue &&
                  item.reconciliation.canonicalized == false &&
                  item.reconciliation.canonicalizationPermanentBar &&
                  item.evidenceEligibility == "not_assessed"
              })
        else { throw HealthKitCanaryError.diagnosticBoundaryViolation }
        return HealthKitFounderCanaryRunResult(
            window: window,
            endDateIsProvisional: window.isProvisional(now: now(), calendar: calendar),
            synchronization: summary,
            diagnostics: diagnostics,
            readback: readback
        )
    }
}
