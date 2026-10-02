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
        attachToSelectedAuthority()
    }

    func attachToSelectedAuthority() {
        observation?.cancel()
        let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
        observation = authority.observeChanges { [weak self] _ in
            self?.publishCurrentProjection()
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
            isPhoneReachable: { true }
        )
    }

    private func publishCurrentProjection() {
        guard let session, session.activationState == .activated,
              let projection = router().currentProjection(),
              let data = try? WatchWorkoutWireCodec.encode(projection)
        else { return }
        try? session.updateApplicationContext([
            WatchWorkoutContract.applicationContextProjectionKey: data
        ])
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
