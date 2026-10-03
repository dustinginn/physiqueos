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

/// What the Watch does with its own HealthKit workout when the phone's
/// authoritative state says the structured session has moved on. Pure, so
/// every combination is unit-testable without HealthKit.
enum WatchHealthSessionResolution: Equatable {
    /// Keep the HealthKit workout running (the session is still live).
    case keep
    /// End and save it under this finish operation, ending at `endAt`.
    case save(operationId: String, endAt: Date?)
    /// End it without saving (canonical Cancel, or the phone has no record).
    case discard

    static func resolve(
        healthSessionId: String,
        incoming: WatchWorkoutProjection,
        knownFinish: WatchWorkoutStore.FinishKnowledge?
    ) -> Self {
        if incoming.sessionId == healthSessionId {
            if incoming.requiresHealthSave, let operationId = incoming.finish?.operationId {
                return .save(operationId: operationId, endAt: incoming.finishedAt)
            }
            switch incoming.phase {
            case .cancelled: return .discard
            case .unavailable: break
            default: return .keep
            }
        }
        // Once a finish was confirmed for this workout it is saved, never
        // discarded, whatever later happened to the structured session.
        if let knownFinish {
            return .save(operationId: knownFinish.operationId, endAt: knownFinish.finishedAt)
        }
        if let ended = incoming.recentlyEnded.first(where: { $0.sessionId == healthSessionId }) {
            switch ended.outcome {
            case .committed, .discardedAfterFinish:
                if let operationId = ended.finishOperationId {
                    return .save(operationId: operationId, endAt: ended.finishedAt)
                }
                return .keep
            case .cancelled: return .discard
            case .unknown: return .keep
            }
        }
        // No record either way (Save & Leave, another session became
        // current, a lost ledger): keep recording. Only an explicit Cancel
        // ever discards; the Watch offers End & Save / Discard for an
        // orphaned workout instead of guessing.
        return .keep
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

    /// Horizontal pages. Controls sit to the LEFT of the workout, so the
    /// Founder's physical swipe RIGHT (finger moving left to right) reveals
    /// them; the system page physics guarantee the direction.
    enum Page: Hashable { case controls, workout }

    /// The phase the Watch presents. A local Finish tap shows the
    /// confirmation immediately, before the phone acknowledges it.
    enum PresentedPhase: Equatable {
        case none, prepared, active, paused, finishConfirmation, finishing, committed
    }

    struct FinishKnowledge: Codable, Equatable {
        var operationId: String
        var finishedAt: Date?
        /// Eviction order: the oldest knowledge goes first.
        var recordedAt: Date = .distantPast
    }

    /// Interactive commands retry with backoff while the phone does not
    /// answer, and surface "Waiting for iPhone" after this long.
    static let waitingForPhoneAfter: TimeInterval = 30
    static let replyWatchdog: TimeInterval = 12
    static let retryBackoff: [TimeInterval] = [2, 4, 8]

    private(set) var projection: WatchWorkoutProjection?
    private(set) var connectionState: ConnectionState = .activating
    private(set) var notice: Notice?
    var page: Page = .workout
    private(set) var cancelConfirmationVisible = false
    /// Set the instant Finish is tapped (before any phone reply) and cleared
    /// by Not Yet, by the confirm, or by authoritative state.
    private(set) var localFinishConfirmation = false
    private(set) var debugSurface: String?
    private(set) var gate = WatchWorkoutCommandDeliveryGate()
    private(set) var pendingIssuedAt: Date?
    /// When the Watch first saw the confirmed finish of the shown session.
    private(set) var finishingObservedAt: Date?
    private(set) var dailyTotals: WatchDailyTotals?
    let health = WatchWorkoutHealthController()

    private let session: WCSession?
    private let defaults: UserDefaults
    /// Test seam: when set, commands are handed here (as if the phone were
    /// reachable) instead of WatchConnectivity; replies arrive through
    /// `receiveAcknowledgement`.
    var commandSinkForTesting: ((WatchWorkoutCommand) -> Void)?
    private var resumedReportSessionIds: Set<String> = []
    private let now: () -> Date
    private var installed = false
    private var pendingHealthReport: (sessionId: String, operationId: String, succeeded: Bool)?
    private var queuedAfterAcknowledgement: WatchWorkoutCommand.Kind?
    private var countdownHapticTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var healthSaveTask: Task<Void, Never>?
    private var terminalSessionIds: Set<String> = []
    private var authoritativeTerminalReceived = false
    /// Sessions whose HealthKit workout this process already tried to save
    /// automatically. Later saves are explicit (Retry Health Save), so a
    /// failing save can never loop with every acknowledgement.
    private var autoSaveAttemptedSessionIds: Set<String> = []
    /// Transport attempts for the pending command (bounded backoff).
    private var sendAttempts = 0
    private var healthReportStaleRetries = 0
    private var finishStaleRetries = 0
    /// A finish-related command tapped while another command was in flight;
    /// sent once that one is answered.
    private var deferredKind: WatchWorkoutCommand.Kind?
    static let maximumSendAttempts = 4

    private static let dismissedSummariesKey = "physiqueos.watchWorkout.dismissedSummaries.v1"
    private static let finishKnowledgeKey = "physiqueos.watchWorkout.finishKnowledge.v1"
    /// A Workout Saved summary older than this never comes back.
    static let summaryLifetime: TimeInterval = 12 * 60 * 60

    override convenience init() {
        self.init(session: WCSession.isSupported() ? .default : nil)
    }

    init(session: WCSession?, defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init) {
        self.session = session
        self.defaults = defaults
        self.now = now
        super.init()
    }

    var isMutationPending: Bool { gate.pending != nil }
    var currentRow: WatchWorkoutProjection.Row? {
        projection?.rows.first(where: \.isCompletionTarget)
            ?? projection?.rows.first(where: { $0.role == "current" || $0.role == "upNext" })
    }

    var presentedPhase: PresentedPhase {
        guard let projection else { return .none }
        switch projection.phase {
        case .prepared: return .prepared
        case .active: return localFinishConfirmation ? .finishConfirmation : .active
        case .paused: return localFinishConfirmation ? .finishConfirmation : .paused
        case .finishConfirmation:
            // Not Yet answers at once, even while it waits for the phone.
            if !localFinishConfirmation, isCancelFinishOutstanding {
                return projection.pausedAt != nil ? .paused : .active
            }
            return .finishConfirmation
        case .finishing: return .finishing
        case .committed: return .committed
        case .unavailable, .cancelled: return .none
        }
    }

    private var isCancelFinishOutstanding: Bool {
        gate.pending?.kind == .cancelFinish || deferredKind == .cancelFinish
            || queuedAfterAcknowledgement == .cancelFinish
    }

    /// Rest is shown only while sets are being executed. A Finish intent
    /// hides it locally at once, without waiting for the phone.
    var visibleRest: WatchWorkoutProjection.Rest? {
        switch presentedPhase {
        case .active, .paused: return projection?.rest
        default: return nil
        }
    }

    /// True once an interactive command has gone unanswered for
    /// `waitingForPhoneAfter`, or the phone is not reachable while one is
    /// pending.
    func isWaitingForPhone(at date: Date) -> Bool {
        guard let pendingIssuedAt, gate.pending != nil else { return false }
        return connectionState != .reachable || date.timeIntervalSince(pendingIssuedAt) >= Self.waitingForPhoneAfter
    }

    /// Why a confirmed finish is still in progress after `waitingForPhoneAfter`.
    func finishWaitReason(at date: Date) -> String? {
        guard presentedPhase == .finishing, let observed = finishingObservedAt,
              date.timeIntervalSince(observed) >= Self.waitingForPhoneAfter
        else { return nil }
        if connectionState != .reachable { return "Waiting for iPhone" }
        guard let finish = projection?.finish else { return "Waiting for iPhone" }
        if finish.serverWaitingForNetwork { return "iPhone waiting for network" }
        if finish.serverPending { return "Saving to PhysiqueOS" }
        if finish.healthExpected, !finish.healthSaved { return "Saving to Apple Health" }
        return nil
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
            page = fixture.page
            localFinishConfirmation = fixture.localFinishConfirmation
            dailyTotals = fixture.dailyTotals
            finishingObservedAt = fixture.finishingObservedAt
            if let pending = fixture.pendingCommand {
                _ = gate.begin(pending)
                pendingIssuedAt = fixture.pendingIssuedAt
            }
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
        if let context = session?.receivedApplicationContext {
            receiveApplicationContext(context)
        }
        Task { await recoverHealthKitIfNeeded() }
    }

    /// A HealthKit workout still recording on this Watch for a session the
    /// phone is not showing (Save & Leave, a newer session, a lost record).
    var orphanedHealthSessionId: String? {
        guard let active = health.activeCorrelationId else { return nil }
        return projection?.sessionId == active ? nil : active
    }

    /// End & Save an orphaned workout: under its known finish operation when
    /// there is one (and report it), otherwise as a plain HealthKit save.
    func saveOrphanedWorkout() {
        guard let sessionId = orphanedHealthSessionId else { return }
        if let known = finishKnowledge[sessionId] {
            saveHealthWorkout(sessionId: sessionId, operationId: known.operationId, endAt: known.finishedAt, automatic: false)
        } else {
            Task { _ = try? await health.finish(structuredSessionId: sessionId) }
        }
    }

    func discardOrphanedWorkout() {
        guard orphanedHealthSessionId != nil else { return }
        Task { await health.cancel() }
    }

    func showControls() { page = .controls }
    func showWorkout() { page = .workout }

    func requestCancelWorkout() { cancelConfirmationVisible = true }
    func dismissCancelWorkout() { cancelConfirmationVisible = false }
    func confirmCancelWorkout() {
        cancelConfirmationVisible = false
        issue(.cancelWorkout)
    }

    func refresh() {
        issue(.refreshProjection)
    }

    func startPreparedWorkout() {
        guard projection?.phase == .prepared else { return }
        issue(.startPreparedWorkout)
    }

    func completeSet() {
        guard presentedPhase == .active, projection?.canCompleteSet == true, let row = currentRow else { return }
        notice = .setPending
        issue(.completeSet, exerciseId: row.exerciseId, setId: row.setId)
    }

    func pauseOrResume() {
        guard let projection, presentedPhase == .active || presentedPhase == .paused else { return }
        issue(projection.phase == .paused ? .resume : .pause)
    }

    /// Finish Workout (final-set primary action or the controls page). Shows
    /// the explicit confirmation at once and stops rest/haptics; nothing is
    /// finishing until Finish is confirmed.
    func requestFinish() {
        guard let projection else { return }
        switch projection.phase {
        case .active, .paused:
            localFinishConfirmation = true
            stopCountdownHaptics()
            finishStaleRetries = 0
            if !issue(.requestFinish), gate.pending != nil { deferredKind = .requestFinish }
        case .finishConfirmation:
            localFinishConfirmation = true
            stopCountdownHaptics()
            if queuedAfterAcknowledgement == .cancelFinish { queuedAfterAcknowledgement = nil }
            if deferredKind == .cancelFinish { deferredKind = nil }
            // A Not Yet already on its way: ask again once it lands.
            if gate.pending?.kind == .cancelFinish { deferredKind = .requestFinish }
        default:
            return
        }
    }

    /// Not Yet. Returns to the workout; rest is restored from its absolute
    /// anchor and no missed countdown haptic replays.
    func cancelFinish() {
        localFinishConfirmation = false
        if queuedAfterAcknowledgement == .confirmFinish { queuedAfterAcknowledgement = nil }
        if deferredKind == .requestFinish { deferredKind = nil }
        if gate.pending?.kind == .requestFinish {
            queuedAfterAcknowledgement = .cancelFinish
        } else if projection?.phase == .finishConfirmation {
            if !issue(.cancelFinish), gate.pending != nil { deferredKind = .cancelFinish }
        }
        if let projection { scheduleCountdownHaptics(for: projection) }
    }

    /// Finish (confirm). Uses the same state machine from both surfaces.
    func confirmFinish() {
        guard presentedPhase == .finishConfirmation else { return }
        notice = .finishPending
        if gate.pending?.kind == .requestFinish {
            // The request is still in flight: confirm as soon as it lands.
            queuedAfterAcknowledgement = .confirmFinish
            return
        }
        if projection?.phase == .finishConfirmation {
            if !issue(.confirmFinish), gate.pending != nil { deferredKind = .confirmFinish }
        } else {
            // The request never reached the phone (or was refused): ask again
            // and confirm when it lands.
            queuedAfterAcknowledgement = .confirmFinish
            if !issue(.requestFinish), gate.pending != nil { deferredKind = .requestFinish }
        }
    }

    /// Done on Workout Saved: dismisses this summary locally only. It sends
    /// no commit and does not touch HealthKit.
    func dismissSummary() {
        guard let projection, projection.phase == .committed else { return }
        // Ordered (oldest first) so the bound evicts the oldest dismissal,
        // never the one just made.
        var dismissed = defaults.stringArray(forKey: Self.dismissedSummariesKey) ?? []
        dismissed.removeAll { $0 == projection.sessionId }
        dismissed.append(projection.sessionId)
        defaults.set(Array(dismissed.suffix(50)), forKey: Self.dismissedSummariesKey)
        self.projection = nil
        page = .workout
        notice = nil
        finishingObservedAt = nil
        refresh()
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
        guard let projection, let operationId = projection.finish?.operationId else { return }
        saveHealthWorkout(sessionId: projection.sessionId, operationId: operationId, endAt: projection.finishedAt, automatic: false)
    }

    /// Retry from "Waiting for iPhone": resend the exact pending command
    /// (same mutation id, so a duplicate is idempotent), or a pending Health
    /// report, or refresh (which also restarts the phone's commit recovery).
    func retryPending() {
        if let pending = gate.pending {
            pendingIssuedAt = now()
            sendAttempts = 0
            send(pending)
            return
        }
        if pendingHealthReport != nil {
            healthReportStaleRetries = 0
            issuePendingHealthReport()
            return
        }
        // A Finish request that never reached the phone (it was unreachable)
        // is asked again; a queued confirm follows when it lands.
        if presentedPhase == .finishConfirmation,
           let phase = projection?.phase, phase == .active || phase == .paused {
            issue(.requestFinish)
            return
        }
        refresh()
    }

    // MARK: - Command delivery

    /// Sends a command unless one is already in flight or the phone is
    /// unreachable. Returns whether it was sent.
    @discardableResult
    private func issue(
        _ kind: WatchWorkoutCommand.Kind,
        exerciseId: String? = nil,
        setId: String? = nil,
        finishOperationId: String? = nil,
        sessionId: String? = nil
    ) -> Bool {
        if commandSinkForTesting == nil {
            guard let session, session.activationState == .activated, session.isReachable else {
                connectionState = .phoneUnavailable
                return false
            }
        }
        let identity = UUID().uuidString
        let targetSessionId = sessionId ?? projection?.sessionId ?? "current"
        let command = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: identity,
            mutationId: identity,
            kind: kind,
            sessionId: targetSessionId,
            expectedRevision: projection?.sessionId == targetSessionId ? projection?.revision ?? 0 : 0,
            exerciseId: exerciseId,
            setId: setId,
            finishOperationId: finishOperationId,
            issuedAt: now()
        )
        guard gate.begin(command) else { return false }
        pendingIssuedAt = now()
        sendAttempts = 0
        send(command)
        return true
    }

    private func send(_ command: WatchWorkoutCommand) {
        retryTask?.cancel()
        if let sink = commandSinkForTesting {
            sendAttempts += 1
            connectionState = .reachable
            sink(command)
            return
        }
        guard let session, session.isReachable,
              let data = try? WatchWorkoutWireCodec.encode(command)
        else {
            connectionState = .phoneUnavailable
            return
        }
        connectionState = .reachable
        sendAttempts += 1
        let commandId = command.commandId
        let replyHandler = WatchWorkoutCallbackBridge.reply { [weak self] data in
            self?.receiveAcknowledgement(data)
        }
        let errorHandler = WatchWorkoutCallbackBridge.failure { [weak self] in
            guard let self, gate.pending?.commandId == commandId else { return }
            connectionState = .reconnecting
            // Keep the exact pending command and retry it with backoff.
            scheduleRetry(commandId: commandId)
        }
        session.sendMessageData(data, replyHandler: replyHandler, errorHandler: errorHandler)
        // A lost reply (neither callback) is retried by the watchdog.
        retryTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(Self.replyWatchdog)) } catch { return }
            guard let self, gate.pending?.commandId == commandId else { return }
            scheduleRetry(commandId: commandId)
        }
    }

    /// Bounded: after `maximumSendAttempts` the command stays pending (same
    /// mutation id) and the Watch shows "Waiting for iPhone" with Retry.
    private func scheduleRetry(commandId: String) {
        retryTask?.cancel()
        guard sendAttempts < Self.maximumSendAttempts else { return }
        let delay = Self.retryBackoff[min(max(sendAttempts - 1, 0), Self.retryBackoff.count - 1)]
        retryTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            guard let self, let pending = gate.pending, pending.commandId == commandId else { return }
            guard let session, session.isReachable else {
                connectionState = .phoneUnavailable
                return
            }
            send(pending)
        }
    }

    func receiveAcknowledgement(_ data: Data) {
        guard let acknowledgement = try? WatchWorkoutWireCodec.decode(
            WatchWorkoutAcknowledgement.self, from: data
        ) else { return }
        let command = gate.pending
        let kind = command?.kind
        let matched = gate.acknowledge(acknowledgement)
        let isReport = kind == .reportHealthSaved || kind == .reportHealthSaveFailed
        if matched {
            retryTask?.cancel()
            pendingIssuedAt = nil
            sendAttempts = 0
            connectionState = .reachable
            // Settle a Health report BEFORE applying state, so a terminal or
            // re-applied projection can never re-send an answered report.
            if isReport {
                switch acknowledgement.status {
                case .applied, .unchanged:
                    completeHealthReport(acknowledgement)
                case .rejected:
                    // The phone can never accept it (unknown session or a
                    // different operation): stop, and do not re-arm it from
                    // the saved-report marker on every later context.
                    if let report = pendingHealthReport { health.markSavedCorrelationReported(report.sessionId) }
                    pendingHealthReport = nil
                case .stale:
                    healthReportStaleRetries += 1
                }
            }
        }
        defer { if matched { runDeferredCommands() } }
        let isTerminal = acknowledgement.projection?.isTerminalAuthorityState == true
        if let incoming = acknowledgement.projection { apply(incoming) }
        guard matched else { return }
        if isTerminal {
            if kind == .cancelWorkout,
               acknowledgement.status == .applied || acknowledgement.status == .unchanged {
                WKInterfaceDevice.current().play(.success)
            }
            return
        }

        switch acknowledgement.status {
        case .applied, .unchanged:
            if kind != .reportHealthSaved && kind != .reportHealthSaveFailed { notice = nil }
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
            if kind == .confirmFinish { localFinishConfirmation = false }
            runQueuedCommand(after: kind)
        case .stale:
            notice = .staleRefreshed
            WKInterfaceDevice.current().play(.retry)
            switch kind {
            case .reportHealthSaved, .reportHealthSaveFailed:
                if healthReportStaleRetries <= 2 { issuePendingHealthReport() }
            case .requestFinish, .confirmFinish:
                // Re-ask on the refreshed revision (bounded); an explicit
                // confirm is never silently dropped while the confirmation
                // is up.
                let wantsConfirm = kind == .confirmFinish || queuedAfterAcknowledgement == .confirmFinish
                queuedAfterAcknowledgement = nil
                finishStaleRetries += 1
                guard presentedPhase == .finishConfirmation, finishStaleRetries <= 2 else { break }
                if projection?.phase == .finishConfirmation {
                    if wantsConfirm { issue(.confirmFinish) }
                } else {
                    if wantsConfirm { queuedAfterAcknowledgement = .confirmFinish }
                    issue(.requestFinish)
                }
            case .cancelFinish:
                if projection?.phase == .finishConfirmation, !localFinishConfirmation { issue(.cancelFinish) }
            default:
                break
            }
        case .rejected:
            queuedAfterAcknowledgement = nil
            deferredKind = nil
            if kind == .requestFinish || kind == .confirmFinish {
                // The phone refused to finish (e.g. no completed set): close
                // the confirmation and return to the workout.
                localFinishConfirmation = false
                if let projection { scheduleCountdownHaptics(for: projection) }
            }
            if !isReport {
                notice = .rejected(acknowledgement.reason?.rawValue ?? "rejected")
                WKInterfaceDevice.current().play(.failure)
            }
        }
    }

    /// One-shot follow-ups once the in-flight command is answered: a
    /// finish-related tap made meanwhile, then any owed Health report.
    private func runDeferredCommands() {
        guard gate.pending == nil else { return }
        if let kind = deferredKind {
            deferredKind = nil
            switch kind {
            case .requestFinish where localFinishConfirmation
                && (projection?.phase == .active || projection?.phase == .paused):
                issue(.requestFinish)
            case .confirmFinish where projection?.phase == .finishConfirmation:
                issue(.confirmFinish)
            case .cancelFinish where projection?.phase == .finishConfirmation && !localFinishConfirmation:
                issue(.cancelFinish)
            default:
                break
            }
        }
        if gate.pending == nil, pendingHealthReport != nil, healthReportStaleRetries <= 2 {
            issuePendingHealthReport()
        }
    }

    private func runQueuedCommand(after kind: WatchWorkoutCommand.Kind?) {
        guard kind == .requestFinish, let queued = queuedAfterAcknowledgement else { return }
        queuedAfterAcknowledgement = nil
        switch queued {
        case .confirmFinish where projection?.phase == .finishConfirmation:
            issue(.confirmFinish)
        case .cancelFinish where projection?.phase == .finishConfirmation:
            issue(.cancelFinish)
        default:
            break
        }
    }

    private func synchronizeHealthKit(
        after acknowledgement: WatchWorkoutAcknowledgement,
        originalKind: WatchWorkoutCommand.Kind?
    ) {
        guard acknowledgement.status == .applied || acknowledgement.status == .unchanged,
              let projection = acknowledgement.projection
        else { return }
        switch originalKind {
        case .startPreparedWorkout:
            Task {
                do { try await health.start(structuredSessionId: projection.sessionId) }
                catch { notice = .healthStartFailed }
            }
        case .pause: health.pause()
        case .resume: health.resume()
        default: break
        }
    }

    // MARK: - HealthKit leg

    /// Ends and saves the Watch HealthKit workout for a confirmed finish,
    /// exactly once (single flight; a workout already saved for this
    /// session reports success instead of failing).
    private func saveHealthWorkout(sessionId: String, operationId: String, endAt: Date?, automatic: Bool) {
        rememberFinish(sessionId: sessionId, operationId: operationId, finishedAt: endAt)
        guard healthSaveTask == nil else { return }
        if automatic {
            guard !autoSaveAttemptedSessionIds.contains(sessionId) else { return }
            autoSaveAttemptedSessionIds.insert(sessionId)
        }
        healthSaveTask = Task { @MainActor [weak self] in
            guard let self else { return }
            defer { healthSaveTask = nil }
            let succeeded: Bool
            do {
                _ = try await health.finish(structuredSessionId: sessionId, endAt: endAt)
                succeeded = true
            } catch {
                succeeded = health.hasSaved(structuredSessionId: sessionId)
            }
            if !succeeded { notice = .finishPending }
            reportHealthSave(sessionId: sessionId, operationId: operationId, succeeded: succeeded)
        }
    }

    private func reportHealthSave(sessionId: String, operationId: String, succeeded: Bool) {
        pendingHealthReport = (sessionId, operationId, succeeded)
        healthReportStaleRetries = 0
        issuePendingHealthReport()
    }

    private func issuePendingHealthReport() {
        guard gate.pending == nil, let report = pendingHealthReport else { return }
        issue(
            report.succeeded ? .reportHealthSaved : .reportHealthSaveFailed,
            finishOperationId: report.operationId,
            sessionId: report.sessionId
        )
    }

    private func completeHealthReport(_ acknowledgement: WatchWorkoutAcknowledgement) {
        guard acknowledgement.status == .applied || acknowledgement.status == .unchanged,
              let report = pendingHealthReport
        else { return }
        if report.succeeded { health.markSavedCorrelationReported(report.sessionId) }
        pendingHealthReport = nil
    }

    private func resolveHealthSession(for incoming: WatchWorkoutProjection) {
        guard let healthSessionId = health.activeCorrelationId else {
            guard incoming.isTerminalAuthorityState else { return }
            // No live HealthKit workout here. An explicit Cancel of the
            // session this Watch last ran still tears down (and discards) a
            // not-yet-recovered one; anything else only clears stale metrics.
            let stored = health.storedCorrelationId
            if incoming.phase == .cancelled, stored == nil || stored == incoming.sessionId {
                Task { await health.cancel() }
            } else {
                health.resetPresentationMetrics()
            }
            return
        }
        switch WatchHealthSessionResolution.resolve(
            healthSessionId: healthSessionId,
            incoming: incoming,
            knownFinish: finishKnowledge[healthSessionId]
        ) {
        case .keep:
            return
        case .save(let operationId, let endAt):
            saveHealthWorkout(sessionId: healthSessionId, operationId: operationId, endAt: endAt, automatic: true)
        case .discard:
            Task { await health.cancel() }
        }
    }

    // MARK: - Authoritative state

    func apply(_ incoming: WatchWorkoutProjection) {
        guard incoming.schemaVersion == WatchWorkoutContract.schemaVersion else { return }
        if incoming.requiresHealthSave, let operationId = incoming.finish?.operationId {
            rememberFinish(sessionId: incoming.sessionId, operationId: operationId, finishedAt: incoming.finishedAt)
        }
        for ended in incoming.recentlyEnded
        where ended.outcome == .committed || ended.outcome == .discardedAfterFinish {
            if let operationId = ended.finishOperationId {
                rememberFinish(
                    sessionId: ended.sessionId,
                    operationId: operationId,
                    finishedAt: ended.finishedAt,
                    recordedAt: ended.finishedAt
                )
            }
        }
        resolveHealthSession(for: incoming)
        if incoming.isTerminalAuthorityState {
            // Tombstone only sessions that really ended (an explicit Cancel,
            // or listed as ended): a session merely not current (Save &
            // Leave) must be able to come back when it is resumed.
            if incoming.phase == .cancelled, incoming.sessionId != "current" {
                terminalSessionIds.insert(incoming.sessionId)
            }
            // A committed session may still owe its Workout Saved summary;
            // only cancelled ones are closed for good.
            for ended in incoming.recentlyEnded where ended.outcome == .cancelled {
                terminalSessionIds.insert(ended.sessionId)
            }
            authoritativeTerminalReceived = true
            projection = nil
            page = .workout
            cancelConfirmationVisible = false
            localFinishConfirmation = false
            queuedAfterAcknowledgement = nil
            notice = nil
            finishingObservedAt = nil
            if let pending = gate.pending, pending.kind != .reportHealthSaved, pending.kind != .reportHealthSaveFailed {
                gate.reset()
                pendingIssuedAt = nil
                retryTask?.cancel()
            }
            deferredKind = nil
            stopCountdownHaptics()
            connectionState = session?.isReachable == true ? .reachable : .phoneUnavailable
            if incoming.phase == .cancelled { refresh() }
            return
        }
        guard !terminalSessionIds.contains(incoming.sessionId) else { return }
        if incoming.phase == .committed, isStaleOrDismissedSummary(incoming) {
            if projection?.sessionId == incoming.sessionId { projection = nil }
            return
        }
        if let current = projection,
           current.sessionId == incoming.sessionId,
           incoming.revision < current.revision {
            return
        }
        let previousPhase = projection?.sessionId == incoming.sessionId ? projection?.phase : nil
        if projection?.sessionId != incoming.sessionId {
            localFinishConfirmation = false
            finishingObservedAt = nil
        }
        projection = incoming
        authoritativeTerminalReceived = false
        connectionState = session?.isReachable == true ? .reachable : .phoneUnavailable
        switch incoming.phase {
        case .finishConfirmation:
            // The phone (or this Watch, earlier) asked to finish: confirm
            // here, unless Not Yet is already on its way to the phone.
            if queuedAfterAcknowledgement != .cancelFinish, deferredKind != .cancelFinish,
               gate.pending?.kind != .cancelFinish {
                localFinishConfirmation = true
            }
            stopCountdownHaptics()
        case .finishing, .committed:
            localFinishConfirmation = false
            if finishingObservedAt == nil { finishingObservedAt = now() }
            stopCountdownHaptics()
        case .active, .paused:
            // Only the phone leaving a requested confirmation (Not Yet from
            // either device) closes it. A projection that was already active
            // (another command's reply, a stale request's refresh) never
            // drops a Finish tap still being asked for.
            let finishIntentPending = gate.pending?.kind == .requestFinish
                || deferredKind == .requestFinish || queuedAfterAcknowledgement != nil
            if previousPhase == .finishConfirmation, !finishIntentPending {
                localFinishConfirmation = false
            }
            if !localFinishConfirmation { scheduleCountdownHaptics(for: incoming) }
        default:
            stopCountdownHaptics()
        }
    }

    func receiveDailyTotals(_ totals: WatchDailyTotals) {
        guard totals.schemaVersion == WatchDailyTotals.schemaVersion else { return }
        dailyTotals = totals
    }

    private func receiveApplicationContext(_ context: [String: Any]) {
        // The phone always publishes both slots: an absent totals slot means
        // the canonical snapshot was cleared (sign-out, authority switch).
        if let data = context[WatchWorkoutContract.applicationContextDailyTotalsKey] as? Data,
           let totals = try? WatchWorkoutWireCodec.decode(WatchDailyTotals.self, from: data) {
            receiveDailyTotals(totals)
        } else {
            dailyTotals = nil
        }
        if let data = context[WatchWorkoutContract.applicationContextProjectionKey] as? Data,
           let incoming = try? WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: data) {
            apply(incoming)
            resumeSavedHealthReportIfNeeded()
        }
    }

    private func isStaleOrDismissedSummary(_ incoming: WatchWorkoutProjection) -> Bool {
        if dismissedSummaries.contains(incoming.sessionId) { return true }
        guard let finishedAt = incoming.finishedAt else { return false }
        return now().timeIntervalSince(finishedAt) > Self.summaryLifetime
    }

    private var dismissedSummaries: Set<String> {
        Set(defaults.stringArray(forKey: Self.dismissedSummariesKey) ?? [])
    }

    private(set) var finishKnowledge: [String: FinishKnowledge] {
        get {
            guard let data = defaults.data(forKey: Self.finishKnowledgeKey) else { return [:] }
            return (try? WatchWorkoutWireCodec.decode([String: FinishKnowledge].self, from: data)) ?? [:]
        }
        set {
            // Keep the 12 most recent; the oldest knowledge is evicted first.
            let newest = newValue.sorted { $0.value.recordedAt > $1.value.recordedAt }.prefix(12)
            let bounded = Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) })
            if let data = try? WatchWorkoutWireCodec.encode(bounded) {
                defaults.set(data, forKey: Self.finishKnowledgeKey)
            }
        }
    }

    private func rememberFinish(
        sessionId: String,
        operationId: String,
        finishedAt: Date?,
        recordedAt: Date? = nil
    ) {
        var knowledge = finishKnowledge
        guard knowledge[sessionId]?.operationId != operationId else { return }
        knowledge[sessionId] = FinishKnowledge(
            operationId: operationId,
            finishedAt: finishedAt,
            recordedAt: recordedAt ?? now()
        )
        finishKnowledge = knowledge
    }

    // MARK: - Rest haptics

    private func stopCountdownHaptics() {
        countdownHapticTask?.cancel()
        countdownHapticTask = nil
    }

    /// Countdown cues at 10 s, 5 s and 0 s. Only cues still ahead fire: a
    /// re-applied projection (Not Yet, a refresh, a relaunch) never replays
    /// a cue whose moment has passed.
    private func scheduleCountdownHaptics(for projection: WatchWorkoutProjection) {
        stopCountdownHaptics()
        guard presentedPhase == .active,
              projection.phase == .active,
              let rest = projection.rest,
              rest.mode == .countdown,
              let endsAt = rest.endsAt
        else { return }
        let thresholds = Self.upcomingCountdownThresholds(endsAt: endsAt, now: now())
        guard !thresholds.isEmpty else { return }
        countdownHapticTask = Task { @MainActor [weak self] in
            for threshold in thresholds {
                let delay = endsAt.timeIntervalSinceNow - threshold
                if delay > 0 {
                    do { try await Task.sleep(for: .seconds(delay)) }
                    catch { return }
                }
                guard let self, !Task.isCancelled,
                      self.projection?.rest?.id == rest.id,
                      self.presentedPhase == .active
                else { return }
                WKInterfaceDevice.current().play(threshold == 0 ? .notification : .directionUp)
            }
        }
    }

    nonisolated static func upcomingCountdownThresholds(endsAt: Date, now: Date) -> [TimeInterval] {
        [10.0, 5.0, 0.0].filter { endsAt.timeIntervalSince(now) - $0 > -0.5 }
    }

    // MARK: - Recovery

    private func resumeSavedHealthReportIfNeeded() {
        guard pendingHealthReport == nil,
              let savedSessionId = health.savedCorrelationPendingReport,
              !resumedReportSessionIds.contains(savedSessionId),
              let operationId = finishKnowledge[savedSessionId]?.operationId
                ?? (projection?.sessionId == savedSessionId ? projection?.finish?.operationId : nil)
        else { return }
        resumedReportSessionIds.insert(savedSessionId)
        pendingHealthReport = (savedSessionId, operationId, true)
        issuePendingHealthReport()
    }

    /// A relaunched Watch reattaches to its running HealthKit workout and
    /// asks the phone how that session stands. It never discards on a cached
    /// (possibly stale) terminal context: the authoritative reply decides.
    private func recoverHealthKitIfNeeded() async {
        do {
            // Recover whatever workout is stored, even if the cached context
            // names another session; resolution decides save, keep or discard.
            try await health.recover(structuredSessionId: nil)
            if let projection { resolveHealthSession(for: projection) }
            refresh()
        } catch {
            // No recoverable session is the normal cold-launch state.
        }
    }

    // MARK: - WCSessionDelegate

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
        let projectionData = applicationContext[WatchWorkoutContract.applicationContextProjectionKey] as? Data
        let totalsData = applicationContext[WatchWorkoutContract.applicationContextDailyTotalsKey] as? Data
        Task { @MainActor [weak self] in
            var context: [String: Any] = [:]
            if let projectionData { context[WatchWorkoutContract.applicationContextProjectionKey] = projectionData }
            if let totalsData { context[WatchWorkoutContract.applicationContextDailyTotalsKey] = totalsData }
            self?.receiveApplicationContext(context)
        }
    }
}

private extension ProcessInfo {
    func argumentValue(after flag: String) -> String? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
}
