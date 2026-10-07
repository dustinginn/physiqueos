import Foundation
import HealthKit
import OSLog
import UIKit
import WatchConnectivity

private final class WatchWorkoutReplyBox: @unchecked Sendable {
    let send: (Data) -> Void
    init(_ send: @escaping (Data) -> Void) { self.send = send }
}

/// iPhone transport for the paired Watch execution client. The only
/// mutation implementation remains `TrainingSessionAuthority`; this object
/// decodes, routes, replies, and publishes a replaceable latest projection.
@MainActor
final class PhoneWatchWorkoutConnectivityBridge: NSObject, WCSessionDelegate, HKWorkoutSessionDelegate {
    private unowned let environment: AppEnvironment
    private let session: WCSession?
    private let finishCoordinator: WatchWorkoutFinishCoordinator
    private let healthStore = HKHealthStore()
    private var mirroredWorkoutSession: HKWorkoutSession?
    private var observation: TrainingSessionObservation?
    /// Latest values of both application-context slots. `updateApplicationContext`
    /// replaces the whole dictionary, so every publish carries both.
    private var latestProjectionData: Data?
    private var latestDailyTotalsData: Data?
    /// The Founder's Watch appearance, carried in the same replace-whole
    /// application context so it reaches the Watch whenever it next
    /// activates, with no network or Server involvement.
    private(set) var latestWatchAppearance: WatchAppearancePreference?
    private var connectivityObservation: UUID?

    init(environment: AppEnvironment, session: WCSession? = WCSession.isSupported() ? .default : nil) {
        self.environment = environment
        self.session = session
        self.finishCoordinator = WatchWorkoutFinishCoordinator(environment: environment)
        super.init()
    }

    func install() {
        healthStore.workoutSessionMirroringStartHandler = { [weak self] mirroredSession in
            Task { @MainActor in
                self?.mirroredWorkoutSession = mirroredSession
                mirroredSession.delegate = self
            }
        }
        session?.delegate = self
        session?.activate()
        // "Waiting for network" on a pending finish reaches the Watch too.
        connectivityObservation = CommandConnectivityStatus.shared.observe { [weak self] in
            self?.publishCurrentProjection()
        }
        attachToSelectedAuthority()
    }

    /// Daily Totals from the same canonical snapshot Home and the Home
    /// Widget render. Published on every snapshot write; no network traffic
    /// of its own and no per-second updates.
    func publishDailyTotals(_ totals: WatchDailyTotals?) {
        latestDailyTotalsData = totals.flatMap { try? WatchWorkoutWireCodec.encode($0) }
        publishContext()
    }

    /// Publishes the Watch appearance. Never blocked on reachability:
    /// application context is delivered when the Watch next connects.
    func publishWatchAppearance(_ appearance: WatchAppearancePreference) {
        guard latestWatchAppearance != appearance else { return }
        latestWatchAppearance = appearance
        publishContext()
    }

    /// The exact application-context dictionary a publish sends (pure, so
    /// tests can assert every slot is carried together).
    static func applicationContext(
        projection: Data?, dailyTotals: Data?, appearance: WatchAppearancePreference?
    ) -> [String: Any] {
        var context: [String: Any] = [:]
        if let projection { context[WatchWorkoutContract.applicationContextProjectionKey] = projection }
        if let dailyTotals { context[WatchWorkoutContract.applicationContextDailyTotalsKey] = dailyTotals }
        if let appearance { context[WatchWorkoutContract.applicationContextAppearanceKey] = appearance.rawValue }
        return context
    }

    func attachToSelectedAuthority() {
        observation?.cancel()
        let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
        observation = authority.observeChanges { [weak self] change in
            if change.kind == .ended(.cancelled), let self {
                self.publish(self.router().cancelledProjection(sessionId: change.sessionId, revision: change.revision))
            } else {
                self?.publishCurrentProjection()
            }
            self?.finishCoordinator.reconcile()
        }
        publishCurrentProjection()
        finishCoordinator.reconcile()
    }

    func reconcile() {
        attachToSelectedAuthority()
    }

    private func router() -> WatchWorkoutCommandRouter {
        WatchWorkoutCommandRouter(
            authority: environment.trainingSessionAuthority(for: environment.nativeAuthority),
            // Receipt of an interactive message proves the paired phone
            // authority is reachable for this mutation.
            isPhoneReachable: { true },
            serverWaitingForNetwork: { CommandConnectivityStatus.shared.isWaitingForNetwork },
            canCommitFinish: { [environment] draft in
                environment.nativeAuthority != .founderProduction
                    || environment.trainingWriteAPI.localValidationError(for: draft) == nil
            }
        )
    }

    private func publishCurrentProjection() {
        let router = router()
        publish(router.currentProjection() ?? router.unavailableProjection())
    }

    private func publish(_ projection: WatchWorkoutProjection) {
        guard let data = try? WatchWorkoutWireCodec.encode(projection) else { return }
        latestProjectionData = data
        publishContext()
    }

    private func publishContext() {
        guard let session, session.activationState == .activated else { return }
        let context = Self.applicationContext(
            projection: latestProjectionData, dailyTotals: latestDailyTotalsData, appearance: latestWatchAppearance
        )
        guard !context.isEmpty else { return }
        try? session.updateApplicationContext(context)
    }

    /// Privacy-safe phone half of the Watch latency trace: command kind,
    /// outcome and main-actor routing time only (category `WatchBridge`).
    private static let latencyLog = Logger(subsystem: "com.physiqueos.native.dev", category: "WatchBridge")

    private func route(_ data: Data, receivedAt: ContinuousClock.Instant = .now) -> Data? {
        guard let command = try? WatchWorkoutWireCodec.decode(WatchWorkoutCommand.self, from: data) else { return nil }
        let started = ContinuousClock.now
        let acknowledgement = router().route(command)
        let routed = ContinuousClock.now
        publishCurrentProjection()
        finishCoordinator.reconcile()
        let finished = ContinuousClock.now
        // queue = WatchConnectivity delivery -> main actor; mutate = router +
        // authority persist + synchronous observers; publish = context +
        // finish reconcile. Mutation prefix pairs with the Watch line.
        let state = UIApplication.shared.applicationState == .active ? "active"
            : UIApplication.shared.applicationState == .background ? "background" : "inactive"
        Self.latencyLog.notice(
            "route \(command.kind.rawValue, privacy: .public) -> \(acknowledgement.status.rawValue, privacy: .public) \(Self.milliseconds(started, finished), privacy: .public)ms m=\(String(command.mutationId.prefix(8)), privacy: .public) queue=\(Self.milliseconds(receivedAt, started), privacy: .public)ms mutate=\(Self.milliseconds(started, routed), privacy: .public)ms publish=\(Self.milliseconds(routed, finished), privacy: .public)ms app=\(state, privacy: .public)"
        )
        return try? WatchWorkoutWireCodec.encode(acknowledgement)
    }

    private static func milliseconds(_ from: ContinuousClock.Instant, _ to: ContinuousClock.Instant) -> Int {
        let elapsed = from.duration(to: to)
        return Int((Double(elapsed.components.seconds) * 1000 + Double(elapsed.components.attoseconds) / 1e15).rounded())
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        let status = Self.companionStatus(session)
        Task { @MainActor [weak self] in
            self?.environment.watchCompanion.update(isPaired: status.0, isWatchAppInstalled: status.1, isReachable: status.2)
            self?.publishCurrentProjection()
        }
    }

    /// Paired / installed / reachable, read on the delegate's queue.
    nonisolated private static func companionStatus(_ session: WCSession) -> (Bool, Bool, Bool) {
        guard session.activationState == .activated else { return (false, false, false) }
        return (session.isPaired, session.isWatchAppInstalled, session.isReachable)
    }

    nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
        let status = Self.companionStatus(session)
        Task { @MainActor [weak self] in
            self?.environment.watchCompanion.update(isPaired: status.0, isWatchAppInstalled: status.1, isReachable: status.2)
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let status = Self.companionStatus(session)
        Task { @MainActor [weak self] in
            self?.environment.watchCompanion.update(isPaired: status.0, isWatchAppInstalled: status.1, isReachable: status.2)
        }
    }

    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}

    nonisolated func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessageData messageData: Data,
        replyHandler: @escaping (Data) -> Void
    ) {
        let reply = WatchWorkoutReplyBox(replyHandler)
        let receivedAt = ContinuousClock.now
        Task { @MainActor [weak self] in
            guard let data = self?.route(messageData, receivedAt: receivedAt) else { return }
            reply.send(data)
        }
    }

    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        if toState == .ended {
            Task { @MainActor [weak self] in self?.mirroredWorkoutSession = nil }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: any Error) {
        Task { @MainActor [weak self] in self?.mirroredWorkoutSession = nil }
    }
}

extension WatchDailyTotals {
    /// The Watch's Daily Totals are the canonical Home snapshot's values,
    /// unchanged: today's Activity active calories and Nutrition calories.
    init?(snapshot: HomeWidgetSnapshot?) {
        guard let snapshot, let writtenAt = HomeWidgetSnapshotClock.date(from: snapshot.writtenAt) else { return nil }
        self.init(
            schemaVersion: Self.schemaVersion,
            localDate: snapshot.localDate,
            activeCalories: snapshot.activity?.activeCalories,
            nutritionCalories: snapshot.nutrition?.calories,
            isActivityPartialDay: snapshot.activity?.isPartialDay ?? false,
            refreshedAt: snapshot.lastSuccessfulReadAt.flatMap(HomeWidgetSnapshotClock.date),
            isOffline: snapshot.refreshState != .success,
            writtenAt: writtenAt
        )
    }
}

// MARK: - Guided Watch handoff support (Build 90)

/// What this iPhone truthfully knows about its paired Watch, read from
/// WatchConnectivity. `isReachable` is normally false until the PhysiqueOS
/// Watch app is running, so the guided handoff is offered on paired +
/// installed, never on reachability.
@Observable
final class WatchCompanionAvailability {
    private(set) var isPaired = false
    private(set) var isWatchAppInstalled = false
    private(set) var isReachable = false

    /// A paired Watch with the PhysiqueOS app installed.
    var canOfferHandoff: Bool { isPaired && isWatchAppInstalled }

    init(isPaired: Bool = false, isWatchAppInstalled: Bool = false, isReachable: Bool = false) {
        self.isPaired = isPaired
        self.isWatchAppInstalled = isWatchAppInstalled
        self.isReachable = isReachable
#if DEBUG
        // UI-test fixture only: the simulator has no paired Watch.
        if ProcessInfo.processInfo.arguments.contains("-physiqueos.watch-review.paired") {
            self.isPaired = true
            self.isWatchAppInstalled = true
        }
#endif
    }

    func update(isPaired: Bool, isWatchAppInstalled: Bool, isReachable: Bool) {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-physiqueos.watch-review.paired") { return }
#endif
        if self.isPaired != isPaired { self.isPaired = isPaired }
        if self.isWatchAppInstalled != isWatchAppInstalled { self.isWatchAppInstalled = isWatchAppInstalled }
        if self.isReachable != isReachable { self.isReachable = isReachable }
    }
}

/// Asks watchOS to open PhysiqueOS on the paired Watch. `true` means only
/// that the request was delivered: watchOS cannot bring the app to the front
/// of a locked, asleep, off-wrist or out-of-range Watch, so callers never
/// treat it as acknowledgment (that is the authority's `watchStartedAt`).
@MainActor
protocol WatchAppLaunching {
    func requestWatchAppLaunch(sessionId: String) async -> Bool
}

/// The sanctioned path: `HKHealthStore.startWatchApp(with:)`, which delivers
/// the workout configuration to the Watch app's
/// `WKApplicationDelegate.handle(_:)`.
struct HealthKitWatchAppLauncher: WatchAppLaunching {
    func requestWatchAppLaunch(sessionId: String) async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor
        return await withCheckedContinuation { continuation in
            HKHealthStore().startWatchApp(with: configuration) { success, _ in
                continuation.resume(returning: success)
            }
        }
    }
}

#if DEBUG
/// UI-test fixture only (absent from Release). The simulator has no paired
/// Watch, so `-physiqueos.watch-review.launch delivered|failed` decides the
/// request result, and `-physiqueos.watch-review.watch-start <seconds>`
/// stands in for the Watch tapping Start Workout: it sends the exact
/// `.startPreparedWorkout` command a Watch sends through the real router,
/// so acknowledgment still comes only from the authority's `watchStartedAt`.
struct ReviewWatchAppLauncher: WatchAppLaunching {
    weak var environment: AppEnvironment?

    static var isEnabled: Bool {
        ProcessInfo.processInfo.arguments.contains("-physiqueos.watch-review.launch")
    }

    private static func value(_ flag: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    func requestWatchAppLaunch(sessionId: String) async -> Bool {
        let delivered = Self.value("-physiqueos.watch-review.launch") == "delivered"
        if let seconds = Self.value("-physiqueos.watch-review.watch-start").flatMap(Double.init), let environment {
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(seconds))
                let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
                guard let draft = authority.draft(id: sessionId) else { return }
                let router = WatchWorkoutCommandRouter(
                    authority: authority, isPhoneReachable: { true },
                    serverWaitingForNetwork: { false }, canCommitFinish: { _ in true }
                )
                _ = router.route(WatchWorkoutCommand(
                    schemaVersion: WatchWorkoutContract.schemaVersion,
                    commandId: UUID().uuidString, mutationId: UUID().uuidString,
                    kind: .startPreparedWorkout, sessionId: sessionId,
                    expectedRevision: draft.currentRevision,
                    exerciseId: nil, setId: nil, issuedAt: Date()
                ))
            }
        }
        return delivered
    }
}
#endif
