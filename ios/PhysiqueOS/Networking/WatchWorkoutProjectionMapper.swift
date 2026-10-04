import Foundation

/// Phone-only mapper from the single structured authority into the shared
/// Foundation wire projection. Kept out of `WatchWorkoutContracts.swift` so
/// that contract compiles unchanged in a future watchOS target.
extension WatchWorkoutProjection {
    @MainActor
    static func make(
        draft: TrainingLoggerDraft,
        authority: TrainingSessionAuthority,
        now: Date,
        prepared: Bool = false,
        stalenessReason: StalenessReason? = nil,
        serverWaitingForNetwork: Bool = false
    ) -> Self? {
        guard let live = TrainingSessionLiveProjection.make(from: draft, now: now) else { return nil }
        let phase = Self.phase(of: draft, prepared: prepared)
        let canComplete = phase == .active && live.currentSet != nil
        let finishEligibility: FinishEligibility
        if phase == .finishConfirmation { finishEligibility = .confirmable }
        else if phase == .active || phase == .paused { finishEligibility = .confirmationRequired }
        else { finishEligibility = .unavailable }
        return .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            sessionId: draft.id,
            revision: draft.currentRevision,
            phase: phase,
            title: live.sessionLabel,
            completedSets: live.progress.completedSets,
            totalSets: live.progress.totalSets,
            rows: live.contextRows.prefix(WatchWorkoutContract.maximumRows).map { row in
                .init(
                    role: row.role.rawValue,
                    exerciseId: row.set.exerciseId,
                    exerciseName: row.exercise?.name ?? "Exercise",
                    setId: row.set.setId,
                    setNumber: row.set.setNumber,
                    setCount: row.set.setCount,
                    valueText: row.set.valueText,
                    loadText: Self.loadText(row.set),
                    repsText: Self.number(row.set.reps),
                    supersetLabel: row.exercise?.supersetLabel,
                    partnerName: row.exercise?.supersetPartnerName,
                    isCompletionTarget: canComplete && row.isCompletionTarget
                )
            },
            // Rest belongs to set execution only: hidden (and silent) the
            // moment Finish is requested, confirmed, or committed. The draft
            // keeps the interval, so Not Yet restores it from its anchor.
            rest: (phase == .active || phase == .paused) ? live.rest.map {
                .init(
                    id: $0.id,
                    mode: $0.mode == .countdown ? .countdown : .stopwatch,
                    startedAt: $0.startedAt,
                    endsAt: $0.endsAt,
                    frozenElapsedSeconds: $0.frozenElapsedSeconds,
                    frozenRemainingSeconds: $0.frozenRemainingSeconds
                )
            } : nil,
            canCompleteSet: canComplete,
            finishEligibility: finishEligibility,
            isFinalPlannedSetTransition: live.isWorkoutComplete,
            startedAt: draft.startedAt.flatMap(TrainingSessionClock.date(from:)),
            pausedAt: draft.pausedAt.flatMap(TrainingSessionClock.date(from:)),
            accumulatedPausedSeconds: draft.accumulatedPausedSeconds ?? 0,
            elapsedWorkoutSeconds: prepared ? nil : authority.activeElapsedSeconds(sessionId: draft.id, at: now),
            stalenessReason: stalenessReason,
            lastAcknowledgedMutationId: draft.appliedMutationIds?.last,
            metrics: nil,
            finish: Self.finishStatus(draft, serverWaitingForNetwork: serverWaitingForNetwork),
            summary: Self.summary(draft, authority: authority, now: now),
            finishedAt: draft.finishedAt.flatMap(TrainingSessionClock.date(from:)),
            recentlyEnded: Self.recentlyEnded(authority: authority, excluding: draft.id),
            watchHealthStartedAt: (draft.watchStartedAt ?? draft.watchHealthStartedAt)
                .flatMap(TrainingSessionClock.date(from:))
        )
    }

    /// One phase per lifecycle point. `finishConfirmation` (requested, not
    /// confirmed) is never presented as finishing.
    static func phase(of draft: TrainingLoggerDraft, prepared: Bool = false) -> Phase {
        if prepared { return .prepared }
        if draft.step == .complete { return .committed }
        if draft.submissionState != nil || draft.finishedAt != nil { return .finishing }
        if draft.finishConfirmationRequestedAt != nil { return .finishConfirmation }
        if draft.pausedAt != nil { return .paused }
        return .active
    }

    @MainActor
    static func recentlyEnded(authority: TrainingSessionAuthority, excluding sessionId: String? = nil) -> [WatchWorkoutEndedSession] {
        let records = authority.recentlyEndedSessions()
            .filter { $0.sessionId != sessionId }
        let saveRequired = records.filter { $0.outcome == .committed || $0.outcome == .discardedAfterFinish }
        let cancelled = records.filter { $0.outcome == .cancelled }
        return (saveRequired + cancelled)
            .prefix(WatchWorkoutContract.maximumRecentlyEndedSessions)
            .map { record in
                .init(
                    sessionId: record.sessionId,
                    outcome: {
                        switch record.outcome {
                        case .committed: return .committed
                        case .cancelled: return .cancelled
                        case .discardedAfterFinish: return .discardedAfterFinish
                        }
                    }(),
                    finishOperationId: record.finishOperationId,
                    finishedAt: record.finishedAt.flatMap(TrainingSessionClock.date(from:))
                )
            }
    }

    private static func finishStatus(_ draft: TrainingLoggerDraft, serverWaitingForNetwork: Bool) -> WatchWorkoutFinishStatus? {
        guard let operationId = draft.watchFinishOperationId else { return nil }
        let healthExpected = draft.watchHealthSaveState != nil
        let healthSaved = draft.watchHealthSaveState == .succeeded
        let serverCommitted = draft.watchServerCommitState == .succeeded || draft.step == .complete
        return .init(
            operationId: operationId,
            healthSaved: healthSaved,
            healthFailed: draft.watchHealthSaveState == .failed,
            serverCommitted: serverCommitted,
            serverPending: !serverCommitted,
            correlationPending: healthExpected && !(healthSaved && serverCommitted),
            healthExpected: healthExpected,
            serverWaitingForNetwork: !serverCommitted && serverWaitingForNetwork
        )
    }

    @MainActor
    private static func summary(
        _ draft: TrainingLoggerDraft,
        authority: TrainingSessionAuthority,
        now: Date
    ) -> WatchWorkoutSummary? {
        guard draft.finishedAt != nil || draft.step == .complete else { return nil }
        let performed = TrainingPerformedSessionProjection.make(from: draft)
        let volume = performed.exercises.reduce(0.0) { exerciseTotal, exercise in
            exerciseTotal + exercise.sets.reduce(0.0) { setTotal, set in
                let write = set.writeRepresentation(defaultLoadType: exercise.defaultLoadType)
                guard let reps = set.reps, reps.isFinite, reps > 0,
                      let load = write.load, load.isFinite, load > 0
                else { return setTotal }
                return setTotal + reps * load
            }
        }
        let activeDuration: Double? = {
            if let started = draft.startedAt.flatMap(TrainingSessionClock.date(from:)),
               let finished = draft.finishedAt.flatMap(TrainingSessionClock.date(from:)) {
                return max(0, finished.timeIntervalSince(started) - (draft.accumulatedPausedSeconds ?? 0))
            }
            return authority.activeElapsedSeconds(sessionId: draft.id, at: now)
        }()
        return .init(
            activeDurationSeconds: activeDuration,
            completedSets: draft.completedSetCount,
            volume: volume > 0 ? volume : nil,
            authoritativePRCount: draft.watchAuthoritativePRCount
        )
    }

    private static func number(_ value: Double?) -> String? {
        guard let value else { return nil }
        return value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func loadText(_ set: TrainingSessionLiveProjection.SetCue) -> String? {
        if set.isBodyweight {
            guard let load = set.load, load > 0 else { return "BW" }
            return "BW + \(number(load) ?? "—")"
        }
        return number(set.load)
    }
}
