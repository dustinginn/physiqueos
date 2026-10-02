import Foundation
import Observation
import WatchConnectivity
import WatchKit

@MainActor
@Observable
final class WatchWorkoutStore: NSObject, WCSessionDelegate {
    enum ConnectionState: Equatable {
        case activating, reachable, phoneUnavailable, reconnecting
    }

    enum Notice: Equatable {
        case setPending, staleRefreshed, rejected(String), healthStartFailed, finishPending
    }

    private(set) var projection: WatchWorkoutProjection?
    private(set) var connectionState: ConnectionState = .activating
    private(set) var notice: Notice?
    private(set) var controlsVisible = false
    private(set) var gate = WatchWorkoutCommandDeliveryGate()
    let health = WatchWorkoutHealthController()

    private let session: WCSession?
    private var installed = false

    override convenience init() {
        self.init(session: WCSession.isSupported() ? .default : nil)
    }

    init(session: WCSession?) {
        self.session = session
        super.init()
    }

    var isMutationPending: Bool { gate.pending != nil }
    var currentRow: WatchWorkoutProjection.Row? {
        projection?.rows.first(where: \.isCompletionTarget)
            ?? projection?.rows.first(where: { $0.role == "current" || $0.role == "upNext" })
    }

    func install() {
        guard !installed else { return }
        installed = true
        session?.delegate = self
        session?.activate()
        if let data = session?.receivedApplicationContext[WatchWorkoutContract.applicationContextProjectionKey] as? Data,
           let incoming = try? WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: data) {
            apply(incoming)
        }
        Task { await recoverHealthKitIfNeeded() }
    }

    func setControlsVisible(_ visible: Bool) { controlsVisible = visible }

    func refresh() {
        issue(.refreshProjection)
    }

    func startPreparedWorkout() {
        guard projection?.phase == .prepared else { return }
        issue(.startPreparedWorkout)
    }

    func completeSet() {
        guard projection?.canCompleteSet == true, let row = currentRow else { return }
        notice = .setPending
        issue(.completeSet, exerciseId: row.exerciseId, setId: row.setId)
    }

    func pauseOrResume() {
        guard let projection else { return }
        issue(projection.phase == .paused ? .resume : .pause)
    }

    func requestFinish() { issue(.requestFinish) }
    func cancelFinish() { issue(.cancelFinish) }
    func confirmFinish() {
        notice = .finishPending
        issue(.confirmFinish)
    }

    func retryPending() {
        guard let pending = gate.pending else {
            refresh()
            return
        }
        send(pending)
    }

    private func issue(
        _ kind: WatchWorkoutCommand.Kind,
        exerciseId: String? = nil,
        setId: String? = nil
    ) {
        guard let session, session.activationState == .activated, session.isReachable else {
            connectionState = .phoneUnavailable
            return
        }
        let projection = projection
        let identity = UUID().uuidString
        let command = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: identity,
            mutationId: identity,
            kind: kind,
            sessionId: projection?.sessionId ?? "current",
            expectedRevision: projection?.revision ?? 0,
            exerciseId: exerciseId,
            setId: setId,
            issuedAt: Date()
        )
        guard gate.begin(command) else { return }
        send(command)
    }

    private func send(_ command: WatchWorkoutCommand) {
        guard let session, session.isReachable,
              let data = try? WatchWorkoutWireCodec.encode(command)
        else {
            connectionState = .phoneUnavailable
            return
        }
        connectionState = .reachable
        session.sendMessageData(data) { [weak self] data in
            Task { @MainActor in self?.receiveAcknowledgement(data) }
        } errorHandler: { [weak self] _ in
            Task { @MainActor in
                self?.connectionState = .reconnecting
                // Keep the exact pending command for an idempotent retry.
            }
        }
    }

    private func receiveAcknowledgement(_ data: Data) {
        guard let acknowledgement = try? WatchWorkoutWireCodec.decode(
            WatchWorkoutAcknowledgement.self, from: data
        ) else { return }
        let kind = gate.pending?.kind
        let matched = gate.acknowledge(acknowledgement)
        if let incoming = acknowledgement.projection { apply(incoming) }
        guard matched else { return }

        switch acknowledgement.status {
        case .applied, .unchanged:
            notice = nil
            if acknowledgement.status == .applied {
                WKInterfaceDevice.current().play(.success)
            }
            synchronizeHealthKit(after: acknowledgement, originalKind: kind)
        case .stale:
            notice = .staleRefreshed
            WKInterfaceDevice.current().play(.retry)
        case .rejected:
            notice = .rejected(acknowledgement.reason?.rawValue ?? "rejected")
            WKInterfaceDevice.current().play(.failure)
        }
    }

    private func synchronizeHealthKit(
        after acknowledgement: WatchWorkoutAcknowledgement,
        originalKind: WatchWorkoutCommand.Kind?
    ) {
        guard acknowledgement.status == .applied || acknowledgement.status == .unchanged,
              let projection = acknowledgement.projection
        else { return }
        Task {
            do {
                switch originalKind {
                case .startPreparedWorkout:
                    try await health.start(structuredSessionId: projection.sessionId)
                case .pause: health.pause()
                case .resume: health.resume()
                case .confirmFinish:
                    _ = try await health.finish()
                default: break
                }
            } catch {
                if originalKind == .startPreparedWorkout { notice = .healthStartFailed }
                else if originalKind == .confirmFinish { notice = .finishPending }
            }
        }
    }

    private func apply(_ incoming: WatchWorkoutProjection) {
        if let current = projection,
           current.sessionId == incoming.sessionId,
           incoming.revision < current.revision {
            return
        }
        projection = incoming
        connectionState = session?.isReachable == true ? .reachable : .phoneUnavailable
    }

    private func recoverHealthKitIfNeeded() async {
        do {
            try await health.recover(structuredSessionId: projection?.sessionId)
            refresh()
        } catch {
            // No recoverable session is the normal cold-launch state.
        }
    }

    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        let reachable = activationState == .activated && session.isReachable
        Task { @MainActor [weak self] in
            self?.connectionState = reachable ? .reachable : .phoneUnavailable
            self?.refresh()
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor [weak self] in
            self?.connectionState = reachable ? .reachable : .phoneUnavailable
            if reachable { self?.retryPending() }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let data = applicationContext[WatchWorkoutContract.applicationContextProjectionKey] as? Data,
              let incoming = try? WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: data)
        else { return }
        Task { @MainActor [weak self] in self?.apply(incoming) }
    }
}
