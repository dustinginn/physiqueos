import Foundation

/// Phone-side command boundary. The Watch never mutates a draft directly:
/// every command is compare-and-set through `TrainingSessionAuthority`, and
/// reachability loss fails closed for structured mutations.
@MainActor
final class WatchWorkoutCommandRouter {
    private let authority: TrainingSessionAuthority
    private let isPhoneReachable: () -> Bool
    private let now: () -> Date

    init(
        authority: TrainingSessionAuthority,
        isPhoneReachable: @escaping () -> Bool,
        now: @escaping () -> Date = Date.init
    ) {
        self.authority = authority
        self.isPhoneReachable = isPhoneReachable
        self.now = now
    }

    func currentProjection(stalenessReason: WatchWorkoutProjection.StalenessReason? = nil) -> WatchWorkoutProjection? {
        let date = now()
        if let active = authority.liveActivitySubject(at: date) {
            return .make(draft: active, authority: authority, now: date, stalenessReason: stalenessReason)
        }
        if let prepared = authority.preparedWorkout() {
            return .make(draft: prepared, authority: authority, now: date, prepared: true, stalenessReason: stalenessReason)
        }
        if let completed = authority.pendingCompletion(at: date) {
            return .make(draft: completed, authority: authority, now: date, stalenessReason: stalenessReason)
        }
        return nil
    }

    func unavailableProjection() -> WatchWorkoutProjection {
        .terminal(
            sessionId: "current",
            revision: 0,
            phase: .unavailable,
            stalenessReason: .authorityUnavailable
        )
    }

    func cancelledProjection(sessionId: String, revision: Int) -> WatchWorkoutProjection {
        .terminal(sessionId: sessionId, revision: revision, phase: .cancelled)
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
            if authority.isCancelled(sessionId: command.sessionId) {
                return acknowledgement(
                    command, .unchanged, nil, revision ?? command.expectedRevision,
                    projection: cancelledProjection(
                        sessionId: command.sessionId,
                        revision: revision ?? command.expectedRevision
                    )
                )
            }
            return acknowledgement(
                command, .unchanged, nil, revision,
                projection: currentProjection() ?? unavailableProjection()
            )
        }
        guard let current = authority.draft(id: command.sessionId) else {
            let replayedCancel = command.kind == .cancelWorkout
                && authority.isCancelled(sessionId: command.sessionId, mutationId: command.mutationId)
            return acknowledgement(
                command,
                replayedCancel ? .unchanged : .rejected,
                replayedCancel ? nil : .sessionUnavailable,
                command.expectedRevision,
                projection: cancelledProjection(
                    sessionId: command.sessionId,
                    revision: command.expectedRevision
                )
            )
        }
        if current.appliedMutationIds?.contains(command.mutationId) == true {
            return acknowledgement(command, .unchanged, nil, current.currentRevision)
        }
        if current.currentRevision != command.expectedRevision {
            return acknowledgement(
                command, .stale, .staleRevision, current.currentRevision,
                stalenessReason: .revisionMismatch
            )
        }
        let context = TrainingSessionMutationContext.intent(
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
        default: .sessionNotMutable
        }
    }
}
