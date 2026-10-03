import Foundation

/// Phone-side command boundary. The Watch never mutates a draft directly:
/// every command is compare-and-set through `TrainingSessionAuthority`, and
/// reachability loss fails closed for structured mutations.
@MainActor
final class WatchWorkoutCommandRouter {
    private let authority: TrainingSessionAuthority
    private let isPhoneReachable: () -> Bool
    private let serverWaitingForNetwork: () -> Bool
    private let canCommitFinish: (TrainingLoggerDraft) -> Bool
    private let now: () -> Date

    init(
        authority: TrainingSessionAuthority,
        isPhoneReachable: @escaping () -> Bool,
        serverWaitingForNetwork: @escaping () -> Bool = { false },
        canCommitFinish: @escaping (TrainingLoggerDraft) -> Bool = { _ in true },
        now: @escaping () -> Date = Date.init
    ) {
        self.authority = authority
        self.isPhoneReachable = isPhoneReachable
        self.serverWaitingForNetwork = serverWaitingForNetwork
        self.canCommitFinish = canCommitFinish
        self.now = now
    }

    func currentProjection(stalenessReason: WatchWorkoutProjection.StalenessReason? = nil) -> WatchWorkoutProjection? {
        let date = now()
        let waiting = serverWaitingForNetwork()
        if let active = authority.liveActivitySubject(at: date) {
            return .make(draft: active, authority: authority, now: date, stalenessReason: stalenessReason, serverWaitingForNetwork: waiting)
        }
        if let prepared = authority.preparedWorkout() {
            return .make(draft: prepared, authority: authority, now: date, prepared: true, stalenessReason: stalenessReason)
        }
        if let completed = authority.pendingCompletion(at: date) {
            return .make(draft: completed, authority: authority, now: date, stalenessReason: stalenessReason)
        }
        return nil
    }

    /// No current session. Carries how recent sessions ended, so a Watch
    /// still holding a HealthKit workout for one of them saves it when it
    /// was committed instead of discarding it.
    func unavailableProjection() -> WatchWorkoutProjection {
        .terminal(
            sessionId: "current",
            revision: 0,
            phase: .unavailable,
            stalenessReason: .authorityUnavailable,
            recentlyEnded: WatchWorkoutProjection.recentlyEnded(authority: authority)
        )
    }

    func cancelledProjection(sessionId: String, revision: Int) -> WatchWorkoutProjection {
        .terminal(
            sessionId: sessionId, revision: revision, phase: .cancelled,
            recentlyEnded: WatchWorkoutProjection.recentlyEnded(authority: authority)
        )
    }

    /// The projection a refresh naming `sessionId` receives. A cancelled
    /// session the Watch still shows gets its explicit terminal first (the
    /// Watch then refreshes "current"); everything else gets the current
    /// state, which lists committed sessions in `recentlyEnded`.
    func refreshProjection(for sessionId: String) -> WatchWorkoutProjection {
        if sessionId != "current", authority.draft(id: sessionId) == nil,
           authority.isCancelled(sessionId: sessionId) {
            return cancelledProjection(sessionId: sessionId, revision: authority.lastChange?.revision ?? 0)
        }
        return currentProjection() ?? unavailableProjection()
    }

    func route(_ command: WatchWorkoutCommand) -> WatchWorkoutAcknowledgement {
        guard command.isBoundedAndSupported else {
            return acknowledgement(command, .rejected, .unsupportedContract, nil)
        }
        guard isPhoneReachable() else {
            return acknowledgement(
                command, .rejected, .phoneUnreachable,
                authority.draft(id: command.sessionId)?.currentRevision,
                stalenessReason: .phoneUnreachable
            )
        }
        if command.kind == .refreshProjection {
            let revision = authority.draft(id: command.sessionId)?.currentRevision
            return acknowledgement(
                command, .unchanged, nil, revision ?? command.expectedRevision,
                projection: refreshProjection(for: command.sessionId)
            )
        }
        guard let current = authority.draft(id: command.sessionId) else {
            return routeEndedSession(command)
        }
        if current.appliedMutationIds?.contains(command.mutationId) == true {
            return acknowledgement(command, .unchanged, nil, current.currentRevision)
        }
        // A Health report is identified by its finish operation (checked
        // below), not by the session revision, which moves while the
        // structured commit runs; revision-guarding it made the Watch retry
        // a stale report forever.
        let isHealthReport = command.kind == .reportHealthSaved || command.kind == .reportHealthSaveFailed
        if !isHealthReport, current.currentRevision != command.expectedRevision {
            return acknowledgement(
                command, .stale, .staleRevision, current.currentRevision,
                stalenessReason: .revisionMismatch
            )
        }
        let context = isHealthReport
            ? TrainingSessionMutationContext(origin: .system, mutationId: command.mutationId, expectedRevision: nil)
            : TrainingSessionMutationContext.intent(
                mutationId: command.mutationId,
                expectedRevision: command.expectedRevision
            )
        let outcome: TrainingSessionMutationOutcome
        switch command.kind {
        case .refreshProjection:
            outcome = .unchanged(revision: command.expectedRevision)
        case .startPreparedWorkout:
            outcome = authority.startPreparedWorkout(sessionId: command.sessionId, context: context)
        case .completeSet:
            guard let exerciseId = command.exerciseId, let setId = command.setId else {
                return acknowledgement(command, .rejected, .invalidCommand, command.expectedRevision)
            }
            outcome = authority.completeSet(
                sessionId: command.sessionId, exerciseId: exerciseId, setId: setId, context: context
            )
        case .pause:
            outcome = authority.pause(sessionId: command.sessionId, context: context)
        case .resume:
            outcome = authority.resumePaused(sessionId: command.sessionId, context: context)
        case .requestFinish:
            outcome = authority.requestFinishConfirmation(sessionId: command.sessionId, context: context)
        case .cancelFinish:
            outcome = authority.cancelFinishConfirmation(sessionId: command.sessionId, context: context)
        case .confirmFinish:
            // A Watch-confirmed finish freezes the session, so it must pass
            // the same local commit validation as a phone Finish.
            guard current.watchFinishOperationId != nil || canCommitFinish(current) else {
                return acknowledgement(command, .rejected, .sessionNotMutable, current.currentRevision)
            }
            outcome = authority.confirmFinish(
                sessionId: command.sessionId,
                finishOperationId: command.mutationId,
                context: context
            )
        case .cancelWorkout:
            outcome = authority.cancelWorkout(sessionId: command.sessionId, context: context)
        case .reportHealthSaved, .reportHealthSaveFailed:
            guard let finishOperationId = command.finishOperationId else {
                return acknowledgement(command, .rejected, .invalidCommand, command.expectedRevision)
            }
            outcome = authority.recordWatchHealthSave(
                sessionId: command.sessionId,
                finishOperationId: finishOperationId,
                succeeded: command.kind == .reportHealthSaved,
                context: context
            )
        case .unknown:
            return acknowledgement(command, .rejected, .unsupportedContract, command.expectedRevision)
        }
        switch outcome {
        case .applied(let revision):
            return acknowledgement(
                command, .applied, nil, revision,
                projection: command.kind == .cancelWorkout
                    ? cancelledProjection(sessionId: command.sessionId, revision: revision)
                    : nil
            )
        case .unchanged(let revision):
            return acknowledgement(
                command, .unchanged, nil, revision,
                projection: command.kind == .cancelWorkout
                    ? cancelledProjection(sessionId: command.sessionId, revision: revision)
                    : nil
            )
        case .duplicate(let revision):
            return acknowledgement(
                command, .unchanged, nil, revision,
                projection: command.kind == .cancelWorkout
                    ? cancelledProjection(sessionId: command.sessionId, revision: revision)
                    : nil
            )
        case .rejected(let rejection):
            let mappedReason: WatchWorkoutAcknowledgement.Reason =
                command.kind == .confirmFinish && current.finishConfirmationRequestedAt == nil
                ? .finishConfirmationRequired : reason(rejection)
            return acknowledgement(
                command, .rejected, mappedReason,
                authority.draft(id: command.sessionId)?.currentRevision
            )
        }
    }

    /// A command for a session that is no longer editable. A committed
    /// session never answers with a cancelled terminal (that would make the
    /// Watch discard a workout that was saved): a late Health report is
    /// recorded on the completion, a late Finish is already satisfied, and
    /// anything else is refused with the current state.
    private func routeEndedSession(_ command: WatchWorkoutCommand) -> WatchWorkoutAcknowledgement {
        if authority.isCommitted(sessionId: command.sessionId) {
            let projection = currentProjection() ?? unavailableProjection()
            switch command.kind {
            case .reportHealthSaved, .reportHealthSaveFailed:
                guard let finishOperationId = command.finishOperationId else {
                    return acknowledgement(command, .rejected, .invalidCommand, command.expectedRevision, projection: projection)
                }
                let outcome = authority.recordHealthSaveAfterCommit(
                    sessionId: command.sessionId,
                    finishOperationId: finishOperationId,
                    succeeded: command.kind == .reportHealthSaved
                )
                let refreshed = currentProjection() ?? unavailableProjection()
                switch outcome {
                case .applied(let revision):
                    return acknowledgement(command, .applied, nil, revision, projection: refreshed)
                case .unchanged(let revision), .duplicate(let revision):
                    return acknowledgement(command, .unchanged, nil, revision, projection: refreshed)
                case .rejected:
                    return acknowledgement(command, .rejected, .sessionNotMutable, command.expectedRevision, projection: refreshed)
                }
            case .requestFinish, .confirmFinish:
                return acknowledgement(command, .unchanged, nil, command.expectedRevision, projection: projection)
            default:
                return acknowledgement(command, .rejected, .sessionNotMutable, command.expectedRevision, projection: projection)
            }
        }
        if authority.isCancelled(sessionId: command.sessionId) {
            let replayedCancel = command.kind == .cancelWorkout
                && authority.isCancelled(sessionId: command.sessionId, mutationId: command.mutationId)
            return acknowledgement(
                command,
                replayedCancel ? .unchanged : .rejected,
                replayedCancel ? nil : .sessionUnavailable,
                command.expectedRevision,
                projection: cancelledProjection(sessionId: command.sessionId, revision: command.expectedRevision)
            )
        }
        return acknowledgement(
            command, .rejected, .sessionUnavailable, command.expectedRevision,
            projection: unavailableProjection()
        )
    }

    private func acknowledgement(
        _ command: WatchWorkoutCommand,
        _ status: WatchWorkoutAcknowledgement.Status,
        _ reason: WatchWorkoutAcknowledgement.Reason?,
        _ revision: Int?,
        stalenessReason: WatchWorkoutProjection.StalenessReason? = nil,
        projection: WatchWorkoutProjection? = nil
    ) -> WatchWorkoutAcknowledgement {
        .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: command.commandId,
            mutationId: command.mutationId,
            status: status,
            reason: reason,
            acknowledgedRevision: revision,
            projection: projection ?? currentProjection(stalenessReason: stalenessReason)
        )
    }

    private func reason(_ rejection: TrainingSessionMutationRejection) -> WatchWorkoutAcknowledgement.Reason {
        switch rejection {
        case .staleRevision: .staleRevision
        case .sessionPaused: .sessionPaused
        case .persistenceFailed: .persistenceFailed
        case .sessionNotFound, .sessionEnded: .sessionUnavailable
        case .noCompletedSets: .noCompletedSets
        default: .sessionNotMutable
        }
    }
}
