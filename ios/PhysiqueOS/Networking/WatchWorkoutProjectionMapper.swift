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
        stalenessReason: StalenessReason? = nil
    ) -> Self? {
        guard let live = TrainingSessionLiveProjection.make(from: draft, now: now) else { return nil }
        let phase: Phase
        if prepared { phase = .prepared }
        else if draft.step == .complete { phase = .committed }
        else if draft.submissionState != nil || draft.finishedAt != nil { phase = .finishing }
        else if draft.finishConfirmationRequestedAt != nil { phase = .finishing }
        else if draft.pausedAt != nil { phase = .paused }
        else { phase = .active }
        let canComplete = phase == .active && live.currentSet != nil
        let finishEligibility: FinishEligibility
        if draft.finishConfirmationRequestedAt != nil { finishEligibility = .confirmable }
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
            rest: live.rest.map {
                .init(
                    id: $0.id,
                    mode: $0.mode == .countdown ? .countdown : .stopwatch,
                    startedAt: $0.startedAt,
                    endsAt: $0.endsAt,
                    frozenElapsedSeconds: $0.frozenElapsedSeconds,
                    frozenRemainingSeconds: $0.frozenRemainingSeconds
                )
            },
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
            finish: Self.finishStatus(draft),
            summary: Self.summary(draft, authority: authority, now: now)
        )
    }

    private static func finishStatus(_ draft: TrainingLoggerDraft) -> WatchWorkoutFinishStatus? {
        guard let operationId = draft.watchFinishOperationId else { return nil }
        let healthSaved = draft.watchHealthSaveState == .succeeded
        let serverCommitted = draft.watchServerCommitState == .succeeded
        return .init(
            operationId: operationId,
            healthSaved: healthSaved,
            healthFailed: draft.watchHealthSaveState == .failed,
            serverCommitted: serverCommitted,
            serverPending: !serverCommitted,
            correlationPending: !(healthSaved && serverCommitted)
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
