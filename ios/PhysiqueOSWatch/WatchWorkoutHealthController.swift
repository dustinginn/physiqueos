import Foundation
import HealthKit
import Observation

enum WatchHealthAuthorizationPresentation: Equatable {
    case automatic
    case direct
}

struct WatchHealthAuthorizationTypeIdentifiers: Equatable, Codable {
    let read: Set<String>
    let share: Set<String>
}

struct WatchHealthAuthorizationDiagnostics: Equatable {
    let installationID: String
    let sessionID: String
    let build: String
    let sessionEventCounts: [String: Int]
    let buildEventCounts: [String: Int]
    let lastReason: String?
}

protocol WatchHealthAuthorizationReceiptStoring: AnyObject {
    func covers(_ identifiers: WatchHealthAuthorizationTypeIdentifiers) -> Bool
    func recordHandled(_ identifiers: WatchHealthAuthorizationTypeIdentifiers)
    func record(event: String, reason: String)
    var diagnostics: WatchHealthAuthorizationDiagnostics { get }
}

/// The Watch is an independent HealthKit client. Its local receipt therefore
/// lives in the Watch container and never relies on an iPhone authorization.
/// Like the phone receipt, this records only a completed decision for a type
/// set, not whether opaque read access was granted.
final class UserDefaultsWatchHealthAuthorizationReceiptStore: WatchHealthAuthorizationReceiptStoring {
    private struct State: Codable {
        var installationID: String
        var handled: WatchHealthAuthorizationTypeIdentifiers?
        var buildEventCounts: [String: [String: Int]]
        var lastReason: String?
    }

    private let defaults: UserDefaults
    private let key: String
    private let build: String
    private let sessionID = UUID().uuidString
    private var sessionEventCounts: [String: Int] = [:]
    private var state: State

    init(
        defaults: UserDefaults = .standard,
        key: String = "physiqueos.watch.healthkit.authorization-receipt.v2",
        build: String = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"
    ) {
        self.defaults = defaults
        self.key = key
        self.build = build
        if let data = defaults.data(forKey: key), let decoded = try? JSONDecoder().decode(State.self, from: data) {
            state = decoded
        } else {
            state = State(installationID: UUID().uuidString, handled: nil, buildEventCounts: [:], lastReason: nil)
        }
    }

    func covers(_ identifiers: WatchHealthAuthorizationTypeIdentifiers) -> Bool {
        guard let handled = state.handled else { return false }
        return identifiers.read.isSubset(of: handled.read) && identifiers.share.isSubset(of: handled.share)
    }

    func recordHandled(_ identifiers: WatchHealthAuthorizationTypeIdentifiers) {
        let prior = state.handled ?? WatchHealthAuthorizationTypeIdentifiers(read: [], share: [])
        state.handled = WatchHealthAuthorizationTypeIdentifiers(
            read: prior.read.union(identifiers.read),
            share: prior.share.union(identifiers.share)
        )
        persist()
    }

    func record(event: String, reason: String) {
        sessionEventCounts[event, default: 0] += 1
        sessionEventCounts["reason.\(reason)", default: 0] += 1
        state.buildEventCounts[build, default: [:]][event, default: 0] += 1
        state.buildEventCounts[build, default: [:]]["reason.\(reason)", default: 0] += 1
        if state.buildEventCounts.count > 12 {
            let removable = state.buildEventCounts.keys.filter { $0 != build }.sorted().prefix(state.buildEventCounts.count - 12)
            removable.forEach { state.buildEventCounts.removeValue(forKey: $0) }
        }
        state.lastReason = reason
        persist()
    }

    var diagnostics: WatchHealthAuthorizationDiagnostics {
        WatchHealthAuthorizationDiagnostics(
            installationID: state.installationID,
            sessionID: sessionID,
            build: build,
            sessionEventCounts: sessionEventCounts,
            buildEventCounts: state.buildEventCounts[build, default: [:]],
            lastReason: state.lastReason
        )
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }
}

@MainActor
protocol WatchHealthAuthorizationServicing: AnyObject {
    var isHealthDataAvailable: Bool { get }
    func authorizationTypeIdentifiers() throws -> WatchHealthAuthorizationTypeIdentifiers
    func hasDecidedLegacySharingAuthorization() throws -> Bool
    func requestStatus() async throws -> HKAuthorizationRequestStatus
    func requestAuthorization() async throws
}

@MainActor
final class SystemWatchHealthAuthorizationService: WatchHealthAuthorizationServicing {
    private let healthStore: HKHealthStore

    init(healthStore: HKHealthStore) { self.healthStore = healthStore }

    var isHealthDataAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func authorizationTypeIdentifiers() throws -> WatchHealthAuthorizationTypeIdentifiers {
        let types = try authorizationTypes()
        return WatchHealthAuthorizationTypeIdentifiers(
            read: Set(types.read.map(\.identifier)),
            share: Set(types.share.map(\.identifier))
        )
    }

    func hasDecidedLegacySharingAuthorization() throws -> Bool {
        let types = try authorizationTypes()
        return types.share.allSatisfy { healthStore.authorizationStatus(for: $0) != .notDetermined }
    }

    func requestStatus() async throws -> HKAuthorizationRequestStatus {
        let types = try authorizationTypes()
        return try await withCheckedThrowingContinuation { continuation in
            healthStore.getRequestStatusForAuthorization(toShare: types.share, read: types.read) { status, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: status) }
            }
        }
    }

    func requestAuthorization() async throws {
        let types = try authorizationTypes()
        try await healthStore.requestAuthorization(toShare: types.share, read: types.read)
    }

    private func authorizationTypes() throws -> (share: Set<HKSampleType>, read: Set<HKObjectType>) {
        guard let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate),
              let active = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
              let basal = HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)
        else { throw WatchHealthAuthorizationError.missingTypes }
        return ([HKObjectType.workoutType()], [heartRate, active, basal])
    }
}

enum WatchHealthAuthorizationError: Error, Equatable {
    case unavailable
    case missingTypes
    case requestRequiredOnWatch
    case requestStatusUnknown
}

/// Shared Watch-side preflight/request lane for the exact workout scope.
@MainActor
final class WatchHealthAuthorizationCoordinator {
    private let service: any WatchHealthAuthorizationServicing
    private let receipts: any WatchHealthAuthorizationReceiptStoring
    private var inFlight: InFlight?

    private struct InFlight {
        let id: UUID
        let task: Task<Result<Void, Error>, Never>
    }

    init(
        service: any WatchHealthAuthorizationServicing,
        receipts: (any WatchHealthAuthorizationReceiptStoring)? = nil
    ) {
        self.service = service
        self.receipts = receipts ?? UserDefaultsWatchHealthAuthorizationReceiptStore()
    }

    var diagnostics: WatchHealthAuthorizationDiagnostics { receipts.diagnostics }

    func ensureAuthorization(presentation: WatchHealthAuthorizationPresentation) async throws {
        if let active = inFlight {
            let result = await active.task.value
            if inFlight?.id == active.id { inFlight = nil }
            do {
                try result.get()
                return
            } catch WatchHealthAuthorizationError.requestRequiredOnWatch where presentation == .direct {
                return try await ensureAuthorization(presentation: .direct)
            } catch {
                throw error
            }
        }

        let id = UUID()
        let task = Task { @MainActor [weak self] () -> Result<Void, Error> in
            guard let self else { return .failure(WatchHealthAuthorizationError.unavailable) }
            do {
                try await self.perform(presentation: presentation)
                return .success(())
            } catch {
                return .failure(error)
            }
        }
        inFlight = InFlight(id: id, task: task)
        let result = await task.value
        if inFlight?.id == id { inFlight = nil }
        try result.get()
    }

    private func perform(presentation: WatchHealthAuthorizationPresentation) async throws {
        guard service.isHealthDataAvailable else { throw WatchHealthAuthorizationError.unavailable }
        let identifiers = try service.authorizationTypeIdentifiers()
        let reason = presentation == .automatic ? "automatic_workout_start" : "direct_workout_start"
        if receipts.covers(identifiers) {
            receipts.record(event: "covered_skip", reason: reason)
            return
        }
        // The receipt was introduced after production users had already
        // answered this sheet. A decided workout-share permission proves the
        // legacy flow ran; adopt only the exact original set so a future read
        // or share type remains a genuinely new request.
        if identifiers == (try SystemWatchHealthAuthorizationService.legacyTypeIdentifiers()),
           try service.hasDecidedLegacySharingAuthorization() {
            receipts.recordHandled(identifiers)
            receipts.record(event: "legacy_exact_set_adopted", reason: reason)
            return
        }
        receipts.record(event: "status_check", reason: reason)
        switch try await service.requestStatus() {
        case .unnecessary:
            receipts.recordHandled(identifiers)
            receipts.record(event: "system_unnecessary", reason: reason)
            return
        case .shouldRequest where presentation == .automatic:
            receipts.record(event: "prompt_deferred", reason: reason)
            throw WatchHealthAuthorizationError.requestRequiredOnWatch
        case .shouldRequest:
            try await service.requestAuthorization()
            receipts.recordHandled(identifiers)
            receipts.record(event: "authorization_completed", reason: reason)
        case .unknown:
            throw WatchHealthAuthorizationError.requestStatusUnknown
        @unknown default:
            throw WatchHealthAuthorizationError.requestStatusUnknown
        }
    }
}

private extension SystemWatchHealthAuthorizationService {
    static func legacyTypeIdentifiers() throws -> WatchHealthAuthorizationTypeIdentifiers {
        guard let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate),
              let active = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
              let basal = HKObjectType.quantityType(forIdentifier: .basalEnergyBurned)
        else { throw WatchHealthAuthorizationError.missingTypes }
        return .init(
            read: [heartRate.identifier, active.identifier, basal.identifier],
            share: [HKObjectType.workoutType().identifier]
        )
    }
}

/// Everything `WatchWorkoutStore` and the Watch views need from the Watch's
/// HealthKit workout. The shipping implementation is
/// `WatchWorkoutHealthController`; tests substitute a deterministic fake so
/// start/pause/finish decisions are provable without HealthKit.
@MainActor
protocol WatchWorkoutHealthRecording: AnyObject {
    var lifecycle: WatchWorkoutHealthController.Lifecycle { get }
    var currentHeartRateBPM: Double? { get }
    var activeCalories: Double? { get }
    var basalCalories: Double? { get }
    var totalCalories: Double? { get }
    var averageHeartRateBPM: Double? { get }
    var rawDurationSeconds: Double? { get }
    var activeCorrelationId: String? { get }
    var storedCorrelationId: String? { get }
    var savedCorrelationPendingReport: String? { get }
    /// The structured session whose workout is running or paused right now.
    var recordingCorrelationId: String? { get }
    func hasSaved(structuredSessionId: String) -> Bool
    /// Returns the HealthKit workout's start instant.
    @discardableResult
    func start(
        structuredSessionId: String,
        authorizationPresentation: WatchHealthAuthorizationPresentation
    ) async throws -> Date
    func pause()
    func resume()
    func finish(structuredSessionId: String?, endAt: Date?) async throws
    func cancel() async
    func recover(structuredSessionId: String?) async throws
    func resetPresentationMetrics()
    func markSavedCorrelationReported(_ structuredSessionId: String)
#if DEBUG
    func installDebugMetrics(
        heartRate: Double?, activeCalories: Double?, basalCalories: Double?, averageHeartRate: Double?,
        recordingCorrelationId: String?
    )
#endif
}

#if DEBUG
extension WatchWorkoutHealthRecording {
    func installDebugMetrics(heartRate: Double?, activeCalories: Double?, basalCalories: Double?, averageHeartRate: Double?) {
        installDebugMetrics(
            heartRate: heartRate, activeCalories: activeCalories, basalCalories: basalCalories,
            averageHeartRate: averageHeartRate, recordingCorrelationId: nil
        )
    }
}
#endif

@MainActor
@Observable
final class WatchWorkoutHealthController: NSObject, WatchWorkoutHealthRecording, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    enum CancellationDisposition: Equatable { case discard }
    static let cancellationDisposition: CancellationDisposition = .discard

    enum Lifecycle: String, Equatable {
        case idle, authorizing, starting, running, paused, ending, cancelled, saved, failed
    }

    enum ControllerError: Error { case anotherSessionActive, notRunning, saveFailed }

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

    private let healthStore: HKHealthStore
    private let authorization: WatchHealthAuthorizationCoordinator
    private var workoutSession: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var cancellationInFlight = false
    private let correlationKey = "physiqueos.watchWorkout.activeCorrelation.v1"
    private let savedCorrelationKey = "physiqueos.watchWorkout.savedCorrelationPendingReport.v1"

    var savedCorrelationPendingReport: String? {
        UserDefaults.standard.string(forKey: savedCorrelationKey)
    }

    /// The structured session whose HealthKit workout can still be saved
    /// or discarded here: exactly the states `finish()` accepts. That
    /// includes a workout the system already ended and one whose save
    /// failed (both stay savable by Retry). A save in flight is excluded;
    /// the store attempts automatic saves at most once, so a failing save
    /// can never loop.
    var activeCorrelationId: String? {
        guard workoutSession != nil, !finishInFlight, Self.savableStates.contains(lifecycle) else { return nil }
        return correlationId
    }

    static let savableStates: Set<Lifecycle> = [.running, .paused, .ending, .failed]

    var recordingCorrelationId: String? {
#if DEBUG
        if let debugRecordingCorrelationId { return debugRecordingCorrelationId }
#endif
        guard workoutSession != nil, lifecycle == .running || lifecycle == .paused else { return nil }
        return correlationId
    }
    private var finishInFlight = false
    /// `endCollection` already succeeded for the current builder, so a
    /// retried save goes straight to `finishWorkout`.
    private var collectionEnded = false

    override convenience init() {
        let healthStore = HKHealthStore()
        self.init(
            healthStore: healthStore,
            authorization: WatchHealthAuthorizationCoordinator(
                service: SystemWatchHealthAuthorizationService(healthStore: healthStore)
            )
        )
    }

    init(healthStore: HKHealthStore, authorization: WatchHealthAuthorizationCoordinator) {
        self.healthStore = healthStore
        self.authorization = authorization
        super.init()
    }

    /// The last structured session whose workout this controller saved.
    private(set) var lastSavedCorrelationId: String?

    func hasSaved(structuredSessionId: String) -> Bool {
        lastSavedCorrelationId == structuredSessionId || savedCorrelationPendingReport == structuredSessionId
    }

    /// The HealthKit end instant for a confirmed finish: the phone's
    /// `finishedAt` (so both records share one window), clamped to the
    /// workout's start and to now.
    nonisolated static func endDate(finishedAt: Date?, workoutStart: Date?, now: Date) -> Date {
        guard let finishedAt else { return now }
        var end = min(finishedAt, now)
        if let workoutStart { end = max(end, workoutStart) }
        return end
    }

    /// The current workout's start instant (nil when none is live).
    private(set) var workoutStartedAt: Date?

    @discardableResult
    func start(
        structuredSessionId: String,
        authorizationPresentation: WatchHealthAuthorizationPresentation
    ) async throws -> Date {
        if correlationId == structuredSessionId, [.starting, .running, .paused].contains(lifecycle) {
            return workoutStartedAt ?? builder?.startDate ?? Date()
        }
        guard workoutSession == nil else { throw ControllerError.anotherSessionActive }
        lifecycle = .authorizing
        lastErrorDescription = nil
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        let session: HKWorkoutSession
        do {
            try await authorization.ensureAuthorization(presentation: authorizationPresentation)
            session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
        } catch {
            lifecycle = .failed
            lastErrorDescription = error.localizedDescription
            throw error
        }
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(
            healthStore: healthStore,
            workoutConfiguration: configuration
        )
        session.delegate = self
        builder.delegate = self
        workoutSession = session
        self.builder = builder
        collectionEnded = false
        correlationId = structuredSessionId
        UserDefaults.standard.set(structuredSessionId, forKey: correlationKey)
        lifecycle = .starting

        let startedAt = Date()
        do {
            try await builder.addMetadata([HKMetadataKeyExternalUUID: structuredSessionId])
            session.startActivity(with: startedAt)
            try await builder.beginCollection(at: startedAt)
        } catch {
            // A half-started workout is torn down, never left blocking every
            // later start (Retry Health Start must be able to succeed).
            session.end()
            builder.discardWorkout()
            workoutSession = nil
            self.builder = nil
            correlationId = nil
            UserDefaults.standard.removeObject(forKey: correlationKey)
            lifecycle = .failed
            lastErrorDescription = error.localizedDescription
            throw error
        }
        workoutStartedAt = startedAt
        lifecycle = .running
        try? await session.startMirroringToCompanionDevice()
        return startedAt
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

    /// Ends and saves the workout for `structuredSessionId` (exactly that
    /// session) at the confirmed finish instant. Single flight: a second
    /// call while one is ending, or after it saved, throws `notRunning`;
    /// callers check `hasSaved(structuredSessionId:)`.
    func finish(structuredSessionId: String? = nil, endAt: Date? = nil) async throws {
        guard let workoutSession, let builder, !finishInFlight,
              Self.savableStates.contains(lifecycle),
              structuredSessionId == nil || structuredSessionId == correlationId
        else { throw ControllerError.notRunning }
        finishInFlight = true
        defer { finishInFlight = false }
        lifecycle = .ending
        let endedAt = Self.endDate(finishedAt: endAt, workoutStart: builder.startDate, now: Date())
        if workoutSession.state != .ended { workoutSession.end() }
        do {
            if !collectionEnded {
                try await builder.endCollection(at: endedAt)
                collectionEnded = true
            }
            let workout = try await builder.finishWorkout()
            rawDurationSeconds = workout?.duration ?? builder.elapsedTime
            lifecycle = .saved
            if let correlationId {
                lastSavedCorrelationId = correlationId
                UserDefaults.standard.set(correlationId, forKey: savedCorrelationKey)
            }
            self.workoutSession = nil
            self.builder = nil
            workoutStartedAt = nil
            collectionEnded = false
            UserDefaults.standard.removeObject(forKey: correlationKey)
        } catch {
            // Keep the session and builder: Retry Health Save (or End &
            // Save) can finish the same workout later.
            lifecycle = .failed
            lastErrorDescription = error.localizedDescription
            throw error
        }
    }

    /// Canonical Cancel policy: end the active workout session and discard
    /// its builder rather than creating an Apple Health workout. Recovery is
    /// attempted first so a phone-originated Cancel received after a Watch
    /// relaunch still tears down the Watch-owned workout.
    func cancel() async {
        guard !cancellationInFlight else { return }
        cancellationInFlight = true
        defer { cancellationInFlight = false }

        if workoutSession == nil,
           let stored = UserDefaults.standard.string(forKey: correlationKey),
           let recovered = try? await healthStore.recoverActiveWorkoutSession() {
            let recoveredBuilder = recovered.associatedWorkoutBuilder()
            recovered.delegate = self
            recoveredBuilder.delegate = self
            workoutSession = recovered
            builder = recoveredBuilder
            correlationId = stored
        }

        let cancelledCorrelationId = correlationId
        lifecycle = .ending
        workoutSession?.end()
        switch Self.cancellationDisposition {
        case .discard: builder?.discardWorkout()
        }
        workoutSession = nil
        builder = nil
        workoutStartedAt = nil
        collectionEnded = false
        correlationId = nil
        currentHeartRateBPM = nil
        activeCalories = nil
        basalCalories = nil
        averageHeartRateBPM = nil
        rawDurationSeconds = nil
        lastErrorDescription = nil
#if DEBUG
        debugRecordingCorrelationId = nil
#endif
        UserDefaults.standard.removeObject(forKey: correlationKey)
        // A different session's saved workout still owes its report.
        if cancelledCorrelationId != nil, savedCorrelationPendingReport == cancelledCorrelationId {
            UserDefaults.standard.removeObject(forKey: savedCorrelationKey)
        }
        lifecycle = .cancelled
    }

    /// The correlation persisted for a running (possibly not yet
    /// recovered) workout.
    var storedCorrelationId: String? {
        UserDefaults.standard.string(forKey: correlationKey)
    }

    /// Clears on-screen metrics when no workout session is live.
    func resetPresentationMetrics() {
        guard workoutSession == nil else { return }
        currentHeartRateBPM = nil
        activeCalories = nil
        basalCalories = nil
        averageHeartRateBPM = nil
        rawDurationSeconds = nil
    }

    func markSavedCorrelationReported(_ structuredSessionId: String) {
        guard savedCorrelationPendingReport == structuredSessionId else { return }
        UserDefaults.standard.removeObject(forKey: savedCorrelationKey)
    }

#if DEBUG
    /// Fixture captures only: presents a recording workout for exactly the
    /// fixture session without touching HealthKit.
    private var debugRecordingCorrelationId: String?

    func installDebugMetrics(
        heartRate: Double?,
        activeCalories: Double?,
        basalCalories: Double?,
        averageHeartRate: Double?,
        recordingCorrelationId: String?
    ) {
        currentHeartRateBPM = heartRate
        self.activeCalories = activeCalories
        self.basalCalories = basalCalories
        averageHeartRateBPM = averageHeartRate
        debugRecordingCorrelationId = recordingCorrelationId
        lifecycle = .running
    }
#endif

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
        workoutStartedAt = builder.startDate
        collectionEnded = false
        correlationId = stored
        lifecycle = recovered.state == .paused ? .paused : .running
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
            case .ended where lifecycle != .saved && lifecycle != .cancelled: lifecycle = .ending
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
