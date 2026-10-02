import Foundation
import WatchConnectivity

private final class WatchWorkoutReplyBox: @unchecked Sendable {
    let send: (Data) -> Void
    init(_ send: @escaping (Data) -> Void) { self.send = send }
}

/// iPhone transport for the paired Watch execution client. The only
/// mutation implementation remains `TrainingSessionAuthority`; this object
/// decodes, routes, replies, and publishes a replaceable latest projection.
@MainActor
final class PhoneWatchWorkoutConnectivityBridge: NSObject, WCSessionDelegate {
    private unowned let environment: AppEnvironment
    private let session: WCSession?
    private var observation: TrainingSessionObservation?

    init(environment: AppEnvironment, session: WCSession? = WCSession.isSupported() ? .default : nil) {
        self.environment = environment
        self.session = session
        super.init()
    }

    func install() {
        session?.delegate = self
        session?.activate()
        attachToSelectedAuthority()
    }

    func attachToSelectedAuthority() {
        observation?.cancel()
        let authority = environment.trainingSessionAuthority(for: environment.nativeAuthority)
        observation = authority.observeChanges { [weak self] _ in self?.publishCurrentProjection() }
        publishCurrentProjection()
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
}
