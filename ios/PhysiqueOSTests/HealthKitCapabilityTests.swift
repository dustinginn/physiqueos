import HealthKit
import XCTest
@testable import PhysiqueOS

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

        let availability = await coordinator.evaluateAuthorizationRequirement(for: .initialRead)
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
            .requestAuthorization(for: .initialRead)
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
            try identifier(.bodyMass),
            try identifier(.bodyFatPercentage),
        ])
    }

    func testFrozenServerContractMetadataRemainsDeviceOwnedAndV1Bounded() {
        XCTAssertEqual(HealthKitServerIngestionContract.commandType, "healthkit.observations.ingest.v1")
        XCTAssertEqual(HealthKitServerIngestionContract.maximumObservationsPerBatch, 100)
        XCTAssertEqual(HealthKitServerIngestionContract.queryCursorAuthority, "device")
    }

    func testUnsupportedDEXAMappingsRemainExcluded() throws {
        let write = Set(HealthKitTypeRegistry.physiqueOSV1.allWriteTypes.map(\.identifier))
        XCTAssertFalse(write.contains(try identifier(.leanBodyMass)))
        XCTAssertEqual(write, [try identifier(.bodyMass), try identifier(.bodyFatPercentage)])
    }

    func testAuthorizationConstructionSeparatesInitialReadsFromFutureWrites() {
        let registry = HealthKitTypeRegistry.physiqueOSV1
        let initial = registry.authorizationRequest(for: .initialRead)
        let futureWrite = registry.authorizationRequest(for: .futureBodyMeasurementWrite)

        XCTAssertFalse(initial.readTypes.isEmpty)
        XCTAssertTrue(initial.writeTypes.isEmpty)
        XCTAssertTrue(futureWrite.readTypes.isEmpty)
        XCTAssertFalse(futureWrite.writeTypes.isEmpty)
        XCTAssertEqual(initial.readTypeIdentifiers, Set(registry.allReadTypes.map(\.identifier)))
        XCTAssertEqual(futureWrite.writeTypeIdentifiers, Set(registry.allWriteTypes.map(\.identifier)))
    }

    func testFeatureDisabledAuthorizationNeverCallsHealthKit() async {
        let service = MockHealthKitService(deviceAvailability: .available)
        let coordinator = coordinator(service: service)

        let outcome = await coordinator.requestAuthorization(for: .initialRead)
        XCTAssertEqual(outcome, .blockedByFeatureGate)
        XCTAssertEqual(service.authorizationCalls, 0)
        XCTAssertEqual(service.requirementCalls, 0)
    }

    func testMockServiceReceivesTheRegistryRequest() async {
        let service = MockHealthKitService(deviceAvailability: .available)
        let coordinator = coordinator(service: service, authorizationEnabled: true)

        let outcome = await coordinator.requestAuthorization(for: .initialRead)
        XCTAssertEqual(outcome, .completed)
        XCTAssertEqual(service.authorizationCalls, 1)
        XCTAssertEqual(service.lastRequest?.scope, .initialRead)
        XCTAssertEqual(
            service.lastRequest?.readTypeIdentifiers,
            Set(HealthKitTypeRegistry.physiqueOSV1.allReadTypes.map(\.identifier))
        )
        XCTAssertTrue(service.lastRequest?.writeTypes.isEmpty == true)
        XCTAssertEqual(coordinator.currentAvailability, .available)
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
        authorizationEnabled: Bool = false
    ) -> HealthKitAuthorizationCoordinator {
        HealthKitAuthorizationCoordinator(
            service: service,
            featureGate: authorizationEnabled
                ? HealthKitFeatureGate(enabledOperations: [.requestAuthorization])
                : .n0Disabled
        )
    }

    private func identifier(_ value: HKQuantityTypeIdentifier) throws -> String {
        try XCTUnwrap(HKObjectType.quantityType(forIdentifier: value)).identifier
    }

    private func categoryIdentifier(_ value: HKCategoryTypeIdentifier) throws -> String {
        try XCTUnwrap(HKObjectType.categoryType(forIdentifier: value)).identifier
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

private final class MemoryAuthoritySelectionStore: NativeAuthoritySelectionStore {
    private var value: NativeAPIEnvironment?

    func load() -> NativeAPIEnvironment? { value }
    func save(_ environment: NativeAPIEnvironment) { value = environment }
}
