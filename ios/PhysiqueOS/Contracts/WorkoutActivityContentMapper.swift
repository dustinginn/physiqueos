import Foundation

/// Maps the authority's pure `TrainingSessionLiveProjection` onto the
/// ActivityKit contract shared with the Widget Extension. No workout
/// semantics are decided here: the cursor, the two-row rule, the completion
/// target and the rest clock all come from the projection.
extension WorkoutActivityAttributes {
    init(projection: TrainingSessionLiveProjection, authority: NativeAPIEnvironment, startedAtFallback: Date) {
        self.init(
            schemaVersion: Self.currentSchemaVersion,
            sessionId: projection.sessionId,
            authority: authority.rawValue,
            startedAt: projection.startedAt ?? startedAtFallback
        )
    }
}

extension WorkoutActivityAttributes.ContentState {
    /// `finishing` forces the saving state while a Finish commit is in
    /// flight (the authority's submission lock is not part of the draft).
    init(projection: TrainingSessionLiveProjection, finishing: Bool = false) {
        let phase: Phase = {
            if finishing { return .finishing }
            switch projection.phase {
            case .inProgress:
                return projection.isWorkoutComplete && projection.currentSet == nil ? .allSetsComplete : .inProgress
            case .reviewing: return .reviewing
            case .finishing: return .finishing
            case .complete: return .saved
            case .paused, .planning: return .paused
            }
        }()
        let canComplete = phase == .inProgress
        let rows: [Row] = canComplete || phase == .allSetsComplete || phase == .paused
            ? projection.contextRows.map { row in
                Row(
                    role: Row.Role(rawValue: row.role.rawValue) ?? .current,
                    exerciseName: row.exercise?.name ?? "Exercise",
                    variantLabel: row.exercise?.variantLabel,
                    supersetLabel: row.exercise?.supersetLabel,
                    partnerName: row.exercise?.supersetPartnerName,
                    setNumber: row.set.setNumber,
                    setCount: row.set.setCount,
                    valueText: row.set.valueText,
                    isTarget: canComplete && row.isCompletionTarget
                )
            }
            : []
        self.init(
            schemaVersion: WorkoutActivityAttributes.currentSchemaVersion,
            revision: projection.revision,
            phase: phase,
            label: projection.sessionLabel,
            completedSets: projection.progress.completedSets,
            totalSets: projection.progress.totalSets,
            layout: Layout(rawValue: projection.contextLayout.rawValue) ?? .empty,
            rows: Array(rows.prefix(2)),
            target: canComplete ? projection.currentSet.map { Target(exerciseId: $0.exerciseId, setId: $0.setId) } : nil,
            rest: canComplete ? projection.rest.map {
                Rest(
                    id: $0.id,
                    mode: $0.mode == .countdown ? .countdown : .stopwatch,
                    startedAt: $0.startedAt,
                    endsAt: $0.endsAt
                )
            } : nil,
            finishedAt: projection.finishedAt
        )
    }

    /// The same state with the saved presentation, for the short-lived
    /// "Workout saved" Live Activity after a durable commit.
    func saved(completedAt: Date) -> Self {
        var copy = self
        copy.phase = .saved
        copy.rows = []
        copy.target = nil
        copy.rest = nil
        copy.finishedAt = finishedAt ?? completedAt
        return copy
    }

    /// Everything except per-row value text and the revision it advanced:
    /// a difference here is a significant change (sent at once); a
    /// value-only difference is someone typing reps/load and is coalesced.
    /// (A refused-as-stale Complete Set tap flushes the activity, so the
    /// button's `expectedRevision` catches up immediately.)
    var significantKey: Self {
        var copy = self
        copy.rows = rows.map { var row = $0; row.valueText = nil; return row }
        copy.revision = 0
        return copy
    }
}
