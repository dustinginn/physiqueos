import Foundation
import Observation
import WatchConnectivity
import WatchKit

enum WatchWorkoutCallbackBridge {
    static func reply(
        _ receive: @escaping @MainActor @Sendable (Data) -> Void
    ) -> @Sendable (Data) -> Void {
        { data in
            Task { @MainActor in receive(data) }
        }
    }

    static func failure(
        _ receive: @escaping @MainActor @Sendable () -> Void
    ) -> @Sendable (any Error) -> Void {
        { _ in
            Task { @MainActor in receive() }
        }
    }
}

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
    private(set) var debugSurface: String?
    private(set) var gate = WatchWorkoutCommandDeliveryGate()
    let health = WatchWorkoutHealthController()

    private let session: WCSession?
    private var installed = false
    private var pendingHealthReport: (operationId: String, succeeded: Bool)?
    private var countdownHapticTask: Task<Void, Never>?

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
#if DEBUG
        if let fixtureName = ProcessInfo.processInfo.argumentValue(after: "-watchFixture"),
           let fixture = WatchWorkoutPreviewFixtures.make(fixtureName) {
            projection = fixture.projection
            connectionState = fixture.connectionState
            notice = fixture.notice
            controlsVisible = fixtureName == "controls"
            debugSurface = fixtureName
            health.installDebugMetrics(
                heartRate: fixture.heartRate,
                activeCalories: fixture.activeCalories,
                basalCalories: fixture.basalCalories,
                averageHeartRate: fixture.averageHeartRate
            )
            return
        }
#endif
        session?.delegate = self
        session?.activate()
        if let data = session?.receivedApplicationContext[WatchWorkoutContract.applicationContextProjectionKey] as? Data,
           let incoming = try? WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: data) {
            apply(incoming)
            resumeSavedHealthReportIfNeeded()
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

    func retryHealthStart() {
        guard let projection, projection.phase == .active || projection.phase == .paused else { return }
        Task {
            do {
                try await health.start(structuredSessionId: projection.sessionId)
                if projection.phase == .paused { health.pause() }
                notice = nil
            } catch { notice = .healthStartFailed }
        }
    }

    func retryHealthFinish() {
        guard let operationId = projection?.finish?.operationId else { return }
        Task { await finishHealthKit(operationId: operationId) }
    }

    func retryPending() {
        guard let pending = gate.pending else {
            if pendingHealthReport != nil {
                issuePendingHealthReport()
                return
            }
            refresh()
            return
        }
        send(pending)
    }

    private func issue(
        _ kind: WatchWorkoutCommand.Kind,
        exerciseId: String? = nil,
        setId: String? = nil,
        finishOperationId: String? = nil
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
            finishOperationId: finishOperationId,
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
        let replyHandler = WatchWorkoutCallbackBridge.reply { [weak self] data in
            self?.receiveAcknowledgement(data)
        }
        let errorHandler = WatchWorkoutCallbackBridge.failure { [weak self] in
            self?.connectionState = .reconnecting
            // Keep the exact pending command for an idempotent retry.
        }
        session.sendMessageData(data, replyHandler: replyHandler, errorHandler: errorHandler)
    }

    private func receiveAcknowledgement(_ data: Data) {
        guard let acknowledgement = try? WatchWorkoutWireCodec.decode(
            WatchWorkoutAcknowledgement.self, from: data
        ) else { return }
        let command = gate.pending
        let kind = command?.kind
        let matched = gate.acknowledge(acknowledgement)
        if let incoming = acknowledgement.projection { apply(incoming) }
        guard matched else { return }

        switch acknowledgement.status {
        case .applied, .unchanged:
            notice = nil
            if acknowledgement.status == .applied {
                WKInterfaceDevice.current().play(.success)
                if kind == .completeSet,
                   acknowledgement.projection?.completedSets == acknowledgement.projection?.totalSets {
                    WKInterfaceDevice.current().play(.notification)
                } else if kind == .pause || kind == .resume {
                    WKInterfaceDevice.current().play(.click)
                }
            }
            synchronizeHealthKit(after: acknowledgement, originalKind: kind)
            if kind == .reportHealthSaved || kind == .reportHealthSaveFailed {
                if kind == .reportHealthSaved, let sessionId = acknowledgement.projection?.sessionId {
                    health.markSavedCorrelationReported(sessionId)
                }
                pendingHealthReport = nil
            }
        case .stale:
            notice = .staleRefreshed
            WKInterfaceDevice.current().play(.retry)
            if kind == .reportHealthSaved || kind == .reportHealthSaveFailed {
                issuePendingHealthReport()
            }
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
                    let operationId = projection.finish?.operationId
                        ?? acknowledgement.mutationId
                    await finishHealthKit(operationId: operationId)
                default: break
                }
            } catch {
                if originalKind == .startPreparedWorkout { notice = .healthStartFailed }
                else if originalKind == .confirmFinish { notice = .finishPending }
            }
        }
    }

    private func finishHealthKit(operationId: String) async {
        do {
            _ = try await health.finish()
            reportHealthSave(operationId: operationId, succeeded: true)
        } catch {
            notice = .finishPending
            reportHealthSave(operationId: operationId, succeeded: false)
        }
    }

    private func reportHealthSave(operationId: String, succeeded: Bool) {
        pendingHealthReport = (operationId, succeeded)
        issuePendingHealthReport()
    }

    private func issuePendingHealthReport() {
        guard gate.pending == nil, let report = pendingHealthReport else { return }
        issue(
            report.succeeded ? .reportHealthSaved : .reportHealthSaveFailed,
            finishOperationId: report.operationId
        )
    }

    private func apply(_ incoming: WatchWorkoutProjection) {
        if let current = projection,
           current.sessionId == incoming.sessionId,
           incoming.revision < current.revision {
            return
        }
        projection = incoming
        connectionState = session?.isReachable == true ? .reachable : .phoneUnavailable
        scheduleCountdownHaptics(for: incoming)
    }

    private func scheduleCountdownHaptics(for projection: WatchWorkoutProjection) {
        countdownHapticTask?.cancel()
        guard projection.phase == .active,
              let rest = projection.rest,
              rest.mode == .countdown,
              let endsAt = rest.endsAt
        else { return }
        countdownHapticTask = Task { @MainActor [weak self] in
            for threshold in [10.0, 5.0, 0.0] {
                guard let self, !Task.isCancelled,
                      self.projection?.rest?.id == rest.id,
                      self.projection?.phase == .active
                else { return }
                let delay = endsAt.timeIntervalSinceNow - threshold
                if delay > 0 {
                    do { try await Task.sleep(for: .seconds(delay)) }
                    catch { return }
                }
                guard !Task.isCancelled,
                      self.projection?.rest?.id == rest.id,
                      self.projection?.phase == .active
                else { return }
                WKInterfaceDevice.current().play(threshold == 0 ? .notification : .directionUp)
            }
        }
    }

    private func resumeSavedHealthReportIfNeeded() {
        guard pendingHealthReport == nil,
              let projection,
              let operationId = projection.finish?.operationId,
              health.savedCorrelationPendingReport == projection.sessionId
        else { return }
        pendingHealthReport = (operationId, true)
        issuePendingHealthReport()
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
        Task { @MainActor [weak self] in
            self?.apply(incoming)
            self?.resumeSavedHealthReportIfNeeded()
        }
    }
}

private extension ProcessInfo {
    func argumentValue(after flag: String) -> String? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}
