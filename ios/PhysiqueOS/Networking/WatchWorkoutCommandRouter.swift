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
        return nil
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
            return acknowledgement(command, .unchanged, nil, authority.draft(id: command.sessionId)?.currentRevision)
        }
        guard let current = authority.draft(id: command.sessionId) else {
            return acknowledgement(command, .rejected, .sessionUnavailable, nil)
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
            outcome = authority.confirmFinish(sessionId: command.sessionId, context: context)
        case .unknown:
            return acknowledgement(command, .rejected, .unsupportedContract, command.expectedRevision)
        }
        switch outcome {
        case .applied(let revision): return acknowledgement(command, .applied, nil, revision)
        case .unchanged(let revision): return acknowledgement(command, .unchanged, nil, revision)
        case .duplicate(let revision): return acknowledgement(command, .unchanged, nil, revision)
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
        stalenessReason: WatchWorkoutProjection.StalenessReason? = nil
    ) -> WatchWorkoutAcknowledgement {
        .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: command.commandId,
            mutationId: command.mutationId,
            status: status,
            reason: reason,
            acknowledgedRevision: revision,
            projection: currentProjection(stalenessReason: stalenessReason)
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
