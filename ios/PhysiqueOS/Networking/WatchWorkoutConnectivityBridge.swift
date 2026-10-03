import Foundation
import HealthKit
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
            serverWaitingForNetwork: { CommandConnectivityStatus.shared.isWaitingForNetwork }
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
        var context: [String: Any] = [:]
        if let latestProjectionData { context[WatchWorkoutContract.applicationContextProjectionKey] = latestProjectionData }
        if let latestDailyTotalsData { context[WatchWorkoutContract.applicationContextDailyTotalsKey] = latestDailyTotalsData }
        guard !context.isEmpty else { return }
        try? session.updateApplicationContext(context)
    }

    private func route(_ data: Data) -> Data? {
        guard let command = try? WatchWorkoutWireCodec.decode(WatchWorkoutCommand.self, from: data) else { return nil }
        let acknowledgement = router().route(command)
        publishCurrentProjection()
        finishCoordinator.reconcile()
        return try? WatchWorkoutWireCodec.encode(acknowledgement)
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        Task { @MainActor [weak self] in self?.publishCurrentProjection() }
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
        Task { @MainActor [weak self] in
            guard let data = self?.route(messageData) else { return }
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
