import Foundation
import HealthKit
import Observation

@MainActor
@Observable
final class WatchWorkoutHealthController: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    enum Lifecycle: String, Equatable {
        case idle, authorizing, starting, running, paused, ending, saved, failed
    }

    enum ControllerError: Error { case anotherSessionActive, missingTypes, notRunning, saveFailed }

    private(set) var lifecycle: Lifecycle = .idle
    private(set) var currentHeartRateBPM: Double?
    private(set) var activeCalories: Double?
    private(set) var basalCalories: Double?
    private(set) var averageHeartRateBPM: Double?
    private(set) var rawDurationSeconds: Double?
    private(set) var correlationId: String?
    private(set) var lastErrorDescription: String?

    var totalCalories: Double? {
        guard let activeCalories, let basalCalories else { return nil }
        return activeCalories + basalCalories
    }

    private let healthStore = HKHealthStore()
    private var workoutSession: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private let correlationKey = "physiqueos.watchWorkout.activeCorrelation.v1"

    func start(structuredSessionId: String) async throws {
        if correlationId == structuredSessionId, [.starting, .running, .paused].contains(lifecycle) { return }
        guard workoutSession == nil else { throw ControllerError.anotherSessionActive }
        lifecycle = .authorizing
        try await authorize()

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: configuration
        )
        session.delegate = self
        builder.delegate = self
        workoutSession = session
        self.builder = builder
        correlationId = structuredSessionId
        UserDefaults.standard.set(structuredSessionId, forKey: correlationKey)
        lifecycle = .starting

        let startedAt = Date()
        try await builder.addMetadata([HKMetadataKeyExternalUUID: structuredSessionId])
        session.startActivity(with: startedAt)
        try await builder.beginCollection(at: startedAt)
        lifecycle = .running
        try? await session.startMirroringToCompanionDevice()
    }

    func pause() {
        guard lifecycle == .running else { return }
        workoutSession?.pause()
        lifecycle = .paused
    }

    func resume() {
        guard lifecycle == .paused else { return }
        workoutSession?.resume()
        lifecycle = .running
    }

    @discardableResult
    func finish() async throws -> HKWorkout? {
        guard let workoutSession, let builder,
              lifecycle == .running || lifecycle == .paused || lifecycle == .ending
        else { throw ControllerError.notRunning }
        lifecycle = .ending
        let endedAt = Date()
        workoutSession.end()
        try await builder.endCollection(at: endedAt)
        let workout = try await builder.finishWorkout()
        rawDurationSeconds = workout?.duration ?? builder.elapsedTime
        lifecycle = .saved
        self.workoutSession = nil
        self.builder = nil
        UserDefaults.standard.removeObject(forKey: correlationKey)
        return workout
    }

    func recover(structuredSessionId: String?) async throws {
        guard workoutSession == nil,
              let stored = UserDefaults.standard.string(forKey: correlationKey),
              structuredSessionId == nil || structuredSessionId == stored
        else { return }
        let recovered = try await healthStore.recoverActiveWorkoutSession()
        guard let recovered else {
            UserDefaults.standard.removeObject(forKey: correlationKey)
            return
        }
        let builder = recovered.associatedWorkoutBuilder()
        recovered.delegate = self
        builder.delegate = self
        workoutSession = recovered
        self.builder = builder
        correlationId = stored
        lifecycle = recovered.state == .paused ? .paused : .running
    }

    private func authorize() async throws {
        guard HKHealthStore.isHealthDataAvailable(),
              let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate),
              let active = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
              let basal = HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)
        else { throw ControllerError.missingTypes }
        try await healthStore.requestAuthorization(
            toShare: [HKObjectType.workoutType()],
            read: [heartRate, active, basal]
        )
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            switch toState {
            case .running: lifecycle = .running
            case .paused: lifecycle = .paused
            case .ended where lifecycle != .saved: lifecycle = .ending
            default: break
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: any Error) {
        Task { @MainActor [weak self] in
            self?.lifecycle = .failed
            self?.lastErrorDescription = error.localizedDescription
        }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        Task { @MainActor [weak self] in self?.refreshStatistics(for: collectedTypes, builder: workoutBuilder) }
    }

    private func refreshStatistics(for types: Set<HKSampleType>, builder: HKLiveWorkoutBuilder) {
        for type in types {
            guard let quantityType = type as? HKQuantityType,
                  let statistics = builder.statistics(for: quantityType) else { continue }
            switch quantityType.identifier {
            case HKQuantityTypeIdentifier.heartRate.rawValue:
                let unit = HKUnit.count().unitDivided(by: .minute())
                currentHeartRateBPM = statistics.mostRecentQuantity()?.doubleValue(for: unit)
                averageHeartRateBPM = statistics.averageQuantity()?.doubleValue(for: unit)
            case HKQuantityTypeIdentifier.activeEnergyBurned.rawValue:
                activeCalories = statistics.sumQuantity()?.doubleValue(for: .kilocalorie())
            case HKQuantityTypeIdentifier.basalEnergyBurned.rawValue:
                basalCalories = statistics.sumQuantity()?.doubleValue(for: .kilocalorie())
            default: break
            }
        }
        rawDurationSeconds = builder.elapsedTime
    }
}
