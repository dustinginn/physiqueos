import HealthKit
import XCTest
@testable import PhysiqueOS

@MainActor
final class HealthKitCapabilityTests: XCTestCase {
    func testN0FeatureGateDisablesEveryRuntimeOperation() {
        let gate = HealthKitFeatureGate.n0Disabled
        XCTAssertEqual(gate.enabledOperations, [])
        for operation in HealthKitCapabilityOperation.allCases {
            XCTAssertFalse(gate.allows(operation), "N0 unexpectedly enabled \(operation.rawValue)")
        }
    }

    func testAvailabilityDistinguishesUnavailableUnrequestedAndRestricted() {
        let unavailable = MockHealthKitService(deviceAvailability: .unavailable)
        XCTAssertEqual(coordinator(service: unavailable).currentAvailability, .unavailableOnDevice)

        let available = MockHealthKitService(deviceAvailability: .available)
        XCTAssertEqual(
            coordinator(service: available).currentAvailability,
            .availableAuthorizationNotRequested
        )

        let restricted = MockHealthKitService(deviceAvailability: .restrictedOrUnavailable)
        XCTAssertEqual(
            coordinator(service: restricted).currentAvailability,
            .restrictedOrUnavailable
        )
    }

    func testExplicitRequirementEvaluationDoesNotClaimReadDenial() async {
        let service = MockHealthKitService(
            deviceAvailability: .available,
            requestRequirement: .shouldRequest
        )
        let coordinator = coordinator(service: service, authorizationEnabled: true)

        let availability = await coordinator.evaluateAuthorizationRequirement(for: .automaticRead)
        XCTAssertEqual(availability, .authorizationRequestRequired)
        XCTAssertEqual(coordinator.availabilityAfterEmptyRead(), .availableNoVisibleData)
        XCTAssertEqual(service.requirementCalls, 1)
    }

    func testOperationalAuthorizationErrorIsRepresentedExplicitly() async {
        let service = MockHealthKitService(
            deviceAvailability: .available,
            requestError: HealthKitServiceError.operational(code: "synthetic_failure")
        )
        let result = await coordinator(service: service, authorizationEnabled: true)
            .requestAuthorization(for: .automaticRead)
        XCTAssertEqual(result, .failed(.operationalError(code: "synthetic_failure")))
    }

    func testReadAndWriteRegistrySetsAreSeparateAndComplete() throws {
        let registry = HealthKitTypeRegistry.physiqueOSV1
        let read = Set(registry.allReadTypes.map(\.identifier))
        let write = Set(registry.allWriteTypes.map(\.identifier))

        XCTAssertTrue(read.isDisjoint(with: write))
        XCTAssertEqual(Set(registry.readTypesByDomain[.activity, default: []].map(\.identifier)), [
            HKObjectType.activitySummaryType().identifier,
            try identifier(.activeEnergyBurned),
            try identifier(.appleExerciseTime),
            try identifier(.appleStandTime),
            try identifier(.stepCount),
            try identifier(.distanceWalkingRunning),
            try identifier(.flightsClimbed),
        ])
        XCTAssertEqual(Set(registry.readTypesByDomain[.nutrition, default: []].map(\.identifier)), [
            try identifier(.dietaryEnergyConsumed),
            try identifier(.dietaryProtein),
            try identifier(.dietaryCarbohydrates),
            try identifier(.dietaryFatTotal),
            try identifier(.dietaryFiber),
        ])
        XCTAssertEqual(Set(registry.readTypesByDomain[.workouts, default: []].map(\.identifier)), [
            HKObjectType.workoutType().identifier,
            try identifier(.activeEnergyBurned),
            try identifier(.heartRate),
            try identifier(.distanceWalkingRunning),
            try identifier(.distanceCycling),
        ])
        XCTAssertEqual(Set(registry.readTypesByDomain[.sleep, default: []].map(\.identifier)), [
            try categoryIdentifier(.sleepAnalysis),
        ])
        XCTAssertEqual(write, [
            try identifier(.bodyFatPercentage),
            try identifier(.leanBodyMass),
        ])
    }

    func testFrozenServerContractMetadataRemainsDeviceOwnedAndV1Bounded() {
        XCTAssertEqual(HealthKitServerIngestionContract.commandType, "healthkit.observations.ingest.v1")
        XCTAssertEqual(HealthKitServerIngestionContract.maximumObservationsPerBatch, 100)
        XCTAssertEqual(HealthKitServerIngestionContract.queryCursorAuthority, "device")
    }

    func testDEXAWriteSetExcludesWeightAndContainsOnlyApprovedMappings() throws {
        let write = Set(HealthKitTypeRegistry.physiqueOSV1.allWriteTypes.map(\.identifier))
        XCTAssertFalse(write.contains(try identifier(.bodyMass)))
        XCTAssertEqual(write, [try identifier(.leanBodyMass), try identifier(.bodyFatPercentage)])
    }

    func testAuthorizationConstructionSeparatesAutomaticSleepAndFutureWrites() {
        let registry = HealthKitTypeRegistry.physiqueOSV1
        let automatic = registry.authorizationRequest(for: .automaticRead)
        let sleep = registry.authorizationRequest(for: .sleepRead)
        let futureWrite = registry.authorizationRequest(for: .futureBodyMeasurementWrite)

        XCTAssertFalse(automatic.readTypes.isEmpty)
        XCTAssertTrue(automatic.writeTypes.isEmpty)
        XCTAssertEqual(sleep.readTypeIdentifiers, Set(registry.readTypesByDomain[.sleep, default: []].map(\.identifier)))
        XCTAssertTrue(automatic.readTypeIdentifiers.isDisjoint(with: sleep.readTypeIdentifiers))
        XCTAssertTrue(futureWrite.readTypes.isEmpty)
        XCTAssertFalse(futureWrite.writeTypes.isEmpty)
        XCTAssertEqual(futureWrite.writeTypeIdentifiers, Set(registry.allWriteTypes.map(\.identifier)))
    }

    func testFeatureDisabledAuthorizationNeverCallsHealthKit() async {
        let service = MockHealthKitService(deviceAvailability: .available)
        let coordinator = coordinator(service: service)

        let outcome = await coordinator.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(outcome, .blockedByFeatureGate)
        XCTAssertEqual(service.authorizationCalls, 0)
        XCTAssertEqual(service.requirementCalls, 0)
    }

    func testMockServiceReceivesTheRegistryRequest() async {
        let service = MockHealthKitService(deviceAvailability: .available)
        let coordinator = coordinator(service: service, authorizationEnabled: true)

        let outcome = await coordinator.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(outcome, .completed)
        XCTAssertEqual(service.authorizationCalls, 0)
        XCTAssertEqual(service.requirementCalls, 1)
        XCTAssertEqual(service.lastRequest?.scope, .automaticRead)
        XCTAssertEqual(
            service.lastRequest?.readTypeIdentifiers,
            HealthKitTypeRegistry.physiqueOSV1.authorizationRequest(for: .automaticRead).readTypeIdentifiers
        )
        XCTAssertTrue(service.lastRequest?.writeTypes.isEmpty == true)
        XCTAssertEqual(coordinator.currentAvailability, .available)
    }

    func testCompletedTypeSetIsDurableAcrossLaunchesAndBuilds() async {
        let receipts = MemoryAuthorizationReceiptStore()
        let firstService = MockHealthKitService(
            deviceAvailability: .available,
            requestRequirement: .shouldRequest
        )
        let first = coordinator(service: firstService, authorizationEnabled: true, receipts: receipts)

        let firstOutcome = await first.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(firstOutcome, .completed)
        XCTAssertEqual(firstService.authorizationCalls, 1)

        let upgradedService = MockHealthKitService(
            deviceAvailability: .available,
            requestRequirement: .shouldRequest
        )
        let upgraded = coordinator(service: upgradedService, authorizationEnabled: true, receipts: receipts)
        let upgradedOutcome = await upgraded.requestAuthorization(
            for: .automaticRead,
            reason: .foregroundSynchronization
        )
        XCTAssertEqual(upgradedOutcome, .completed)
        XCTAssertEqual(upgradedService.requirementCalls, 0, "Same type set must not be re-preflighted after an update.")
        XCTAssertEqual(upgradedService.authorizationCalls, 0)
        XCTAssertEqual(receipts.events["covered_skip"], 1)
    }

    func testNewTypeExpandsTheReceiptAndMayPromptExactlyOnce() async throws {
        let receipts = MemoryAuthorizationReceiptStore()
        let originalService = MockHealthKitService(deviceAvailability: .available, requestRequirement: .shouldRequest)
        _ = await coordinator(service: originalService, authorizationEnabled: true, receipts: receipts)
            .requestAuthorization(for: .automaticRead)

        var domains = HealthKitTypeRegistry.physiqueOSV1.readTypesByDomain
        domains[.activity, default: []].insert(try XCTUnwrap(HKObjectType.categoryType(forIdentifier: .sleepAnalysis)))
        let expandedRegistry = HealthKitTypeRegistry(
            readTypesByDomain: domains,
            writeTypesByDomain: HealthKitTypeRegistry.physiqueOSV1.writeTypesByDomain
        )
        let expandedService = MockHealthKitService(deviceAvailability: .available, requestRequirement: .shouldRequest)
        let expanded = HealthKitAuthorizationCoordinator(
            service: expandedService,
            registry: expandedRegistry,
            featureGate: HealthKitFeatureGate(enabledOperations: [.requestAuthorization]),
            receipts: receipts
        )

        let expandedOutcome = await expanded.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(expandedOutcome, .completed)
        XCTAssertEqual(expandedService.requirementCalls, 1)
        XCTAssertEqual(expandedService.authorizationCalls, 1)
        let repeatedExpandedOutcome = await expanded.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(repeatedExpandedOutcome, .completed)
        XCTAssertEqual(expandedService.authorizationCalls, 1)
    }

    func testLegacyAutomaticSyncEvidenceAdoptsOnlyTheFrozenTypeSet() async throws {
        let suite = "healthkit.authorization.legacy.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("owner-proof", forKey: "physiqueos.healthkit.automatic.owner-identity.v1")
        let receipts = UserDefaultsHealthKitAuthorizationReceiptStore(
            defaults: defaults,
            key: "receipt",
            build: "96"
        )
        let service = MockHealthKitService(deviceAvailability: .available, requestRequirement: .shouldRequest)
        let adopted = HealthKitAuthorizationCoordinator(
            service: service,
            featureGate: HealthKitFeatureGate(enabledOperations: [.requestAuthorization]),
            receipts: receipts
        )

        let adoptedOutcome = await adopted.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(adoptedOutcome, .completed)
        XCTAssertEqual(service.requirementCalls, 0)
        XCTAssertEqual(service.authorizationCalls, 0)
        XCTAssertEqual(receipts.diagnostics.buildEventCounts["legacy_exact_set_adopted"], 1)

        var domains = HealthKitTypeRegistry.physiqueOSV1.readTypesByDomain
        domains[.activity, default: []].insert(try XCTUnwrap(HKObjectType.categoryType(forIdentifier: .sleepAnalysis)))
        let expanded = HealthKitAuthorizationCoordinator(
            service: service,
            registry: HealthKitTypeRegistry(
                readTypesByDomain: domains,
                writeTypesByDomain: HealthKitTypeRegistry.physiqueOSV1.writeTypesByDomain
            ),
            featureGate: HealthKitFeatureGate(enabledOperations: [.requestAuthorization]),
            receipts: receipts
        )
        let expandedOutcome = await expanded.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(expandedOutcome, .completed)
        XCTAssertEqual(service.requirementCalls, 1)
        XCTAssertEqual(service.authorizationCalls, 1)
    }

    func testCompletedDeniedOrPartialDecisionIsNotRepromptedAndPermissionChangeStaysUserControlled() async {
        let receipts = MemoryAuthorizationReceiptStore()
        let service = MockHealthKitService(deviceAvailability: .available, requestRequirement: .shouldRequest)
        let coordinator = coordinator(service: service, authorizationEnabled: true, receipts: receipts)

        let initialOutcome = await coordinator.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(initialOutcome, .completed)
        // HealthKit does not disclose read denial/partial grants. A completed
        // sheet is therefore durable even if Settings changes later.
        service.requestRequirement = .shouldRequest
        let repeatedOutcome = await coordinator.requestAuthorization(for: .automaticRead)
        XCTAssertEqual(repeatedOutcome, .completed)
        XCTAssertEqual(service.authorizationCalls, 1)
        XCTAssertEqual(service.requirementCalls, 1)
    }

    @MainActor
    func testBackgroundPreflightNeverPresentsRequiredConsent() async {
        let service = MockHealthKitService(
            deviceAvailability: .available,
            requestRequirement: .shouldRequest
        )
        let coordinator = coordinator(service: service, authorizationEnabled: true)

        let outcome = await coordinator.requestAuthorization(
            for: .automaticRead,
            presentation: .prohibited
        )

        XCTAssertEqual(outcome, .requestRequired)
        XCTAssertEqual(service.requirementCalls, 1)
        XCTAssertEqual(service.authorizationCalls, 0)
    }

    @MainActor
    func testForegroundJoiningBackgroundPreflightRetriesAndPromptsExactlyOnce() async {
        let service = SuspendingHealthKitService()
        let coordinator = HealthKitAuthorizationCoordinator(
            service: service,
            featureGate: HealthKitFeatureGate(enabledOperations: [.requestAuthorization]),
            receipts: MemoryAuthorizationReceiptStore()
        )

        async let background = coordinator.requestAuthorization(
            for: .automaticRead,
            presentation: .prohibited
        )
        while service.requirementCalls == 0 { await Task.yield() }
        async let foreground = coordinator.requestAuthorization(
            for: .automaticRead,
            presentation: .foreground
        )
        service.releaseFirstRequirement(as: .shouldRequest)

        let (backgroundOutcome, foregroundOutcome) = await (background, foreground)
        XCTAssertEqual(backgroundOutcome, .requestRequired)
        XCTAssertEqual(foregroundOutcome, .completed)
        XCTAssertEqual(service.requirementCalls, 2)
        XCTAssertEqual(service.authorizationCalls, 1)
    }

    func testAppEnvironmentDoesNotRequestAuthorizationOnLaunchConstruction() {
        let service = MockHealthKitService(deviceAvailability: .available)
        let gate = HealthKitFeatureGate(enabledOperations: [.requestAuthorization])
        let selection = MemoryAuthoritySelectionStore()

        let environment = AppEnvironment(
            nativeAuthority: .sandbox,
            authoritySelectionStore: selection,
            healthKitFeatureGate: gate,
            healthKitService: service
        )

        XCTAssertEqual(service.authorizationCalls, 0)
        XCTAssertEqual(service.requirementCalls, 0)
        XCTAssertTrue(environment.homeAPI is FixtureHomeAPI)
        XCTAssertEqual(environment.healthKitFeatureGate, gate)
    }

    func testDefaultEnvironmentPreservesBuild41BehaviorWithHealthKitDisabled() {
        let environment = AppEnvironment(
            nativeAuthority: .sandbox,
            authoritySelectionStore: MemoryAuthoritySelectionStore(),
            healthKitService: MockHealthKitService(deviceAvailability: .available)
        )

        XCTAssertTrue(environment.homeAPI is FixtureHomeAPI)
        XCTAssertTrue(environment.logAPI is FixtureLogAPI)
        XCTAssertTrue(environment.activityAPI is FixtureActivityAPI)
        XCTAssertEqual(environment.healthKitFeatureGate, .n0Disabled)
        XCTAssertEqual(
            environment.healthKitAuthorizationCoordinator.currentAvailability,
            .availableAuthorizationNotRequested
        )
    }

    private func coordinator(
        service: MockHealthKitService,
        authorizationEnabled: Bool = false,
        receipts: MemoryAuthorizationReceiptStore = MemoryAuthorizationReceiptStore()
    ) -> HealthKitAuthorizationCoordinator {
        HealthKitAuthorizationCoordinator(
            service: service,
            featureGate: authorizationEnabled
                ? HealthKitFeatureGate(enabledOperations: [.requestAuthorization])
                : .n0Disabled,
            receipts: receipts
        )
    }

    private func identifier(_ value: HKQuantityTypeIdentifier) throws -> String {
        try XCTUnwrap(HKObjectType.quantityType(forIdentifier: value)).identifier
    }

    private func categoryIdentifier(_ value: HKCategoryTypeIdentifier) throws -> String {
        try XCTUnwrap(HKObjectType.categoryType(forIdentifier: value)).identifier
    }
}

private final class MemoryAuthorizationReceiptStore: HealthKitAuthorizationReceiptStoring {
    private var handled: [HealthKitAuthorizationScope: (read: Set<String>, write: Set<String>)] = [:]
    private(set) var events: [String: Int] = [:]

    func covers(_ request: HealthKitAuthorizationRequest) -> Bool {
        guard let receipt = handled[request.scope] else { return false }
        return request.readTypeIdentifiers.isSubset(of: receipt.read)
            && request.writeTypeIdentifiers.isSubset(of: receipt.write)
    }

    func recordHandled(_ request: HealthKitAuthorizationRequest) {
        let prior = handled[request.scope] ?? ([], [])
        handled[request.scope] = (
            prior.read.union(request.readTypeIdentifiers),
            prior.write.union(request.writeTypeIdentifiers)
        )
    }

    func record(event: String, reason: HealthKitAuthorizationReason) { events[event, default: 0] += 1 }

    var diagnostics: HealthKitAuthorizationDiagnostics {
        HealthKitAuthorizationDiagnostics(
            installationID: "install", sessionID: "session", build: "95",
            sessionEventCounts: events, buildEventCounts: events, lastReason: nil
        )
    }
}

private final class MockHealthKitService: HealthKitService {
    let deviceAvailability: HealthKitDeviceAvailability
    var requestRequirement: HealthKitAuthorizationRequestRequirement
    var requestError: Error?
    var requestCompleted: Bool
    private(set) var authorizationCalls = 0
    private(set) var requirementCalls = 0
    private(set) var lastRequest: HealthKitAuthorizationRequest?

    init(
        deviceAvailability: HealthKitDeviceAvailability,
        requestRequirement: HealthKitAuthorizationRequestRequirement = .unnecessary,
        requestError: Error? = nil,
        requestCompleted: Bool = true
    ) {
        self.deviceAvailability = deviceAvailability
        self.requestRequirement = requestRequirement
        self.requestError = requestError
        self.requestCompleted = requestCompleted
    }

    func authorizationRequestRequirement(
        for request: HealthKitAuthorizationRequest
    ) async throws -> HealthKitAuthorizationRequestRequirement {
        requirementCalls += 1
        lastRequest = request
        if let requestError { throw requestError }
        return requestRequirement
    }

    func requestAuthorization(_ request: HealthKitAuthorizationRequest) async throws -> Bool {
        authorizationCalls += 1
        lastRequest = request
        if let requestError { throw requestError }
        return requestCompleted
    }
}

private final class SuspendingHealthKitService: HealthKitService, @unchecked Sendable {
    let deviceAvailability: HealthKitDeviceAvailability = .available
    private let lock = NSLock()
    private var pendingRequirement: CheckedContinuation<HealthKitAuthorizationRequestRequirement, Never>?
    private var storedRequirementCalls = 0
    private var storedAuthorizationCalls = 0

    var requirementCalls: Int { lock.withLock { storedRequirementCalls } }
    var authorizationCalls: Int { lock.withLock { storedAuthorizationCalls } }

    func authorizationRequestRequirement(
        for request: HealthKitAuthorizationRequest
    ) async throws -> HealthKitAuthorizationRequestRequirement {
        let call = lock.withLock { () -> Int in
            storedRequirementCalls += 1
            return storedRequirementCalls
        }
        if call > 1 { return .shouldRequest }
        return await withCheckedContinuation { continuation in
            lock.withLock { pendingRequirement = continuation }
        }
    }

    func releaseFirstRequirement(as requirement: HealthKitAuthorizationRequestRequirement) {
        let continuation = lock.withLock { () -> CheckedContinuation<HealthKitAuthorizationRequestRequirement, Never>? in
            defer { pendingRequirement = nil }
            return pendingRequirement
        }
        continuation?.resume(returning: requirement)
    }

    func requestAuthorization(_ request: HealthKitAuthorizationRequest) async throws -> Bool {
        lock.withLock { storedAuthorizationCalls += 1 }
        return true
    }
}

private final class MemoryAuthoritySelectionStore: NativeAuthoritySelectionStore {
    private var value: NativeAPIEnvironment?

    func load() -> NativeAPIEnvironment? { value }
    func save(_ environment: NativeAPIEnvironment) { value = environment }
}
