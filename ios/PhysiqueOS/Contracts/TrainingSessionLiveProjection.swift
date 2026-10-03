import Foundation

/// A small, pure, glanceable projection of one live Workout Logger session,
/// computed from `TrainingSessionAuthority` state. It is the contract a
/// future Live Activity (ActivityKit `ContentState`) renders without
/// recomputing workout semantics: previous + current set, whether the
/// current set is the exercise's last, what comes up next, progress, and
/// the rest clock as absolute instants. It carries no workout history and
/// no Server data, and nothing ever reads it back into the draft.
///
/// Stopwatch rest renders as `now - rest.startedAt`; Countdown as
/// `rest.endsAt - now`. Neither needs per-second updates.
struct TrainingSessionLiveProjection: Codable, Hashable, Sendable {
    static let schemaVersion = 1
    static let labelLimit = 40
    static let nameLimit = 32

    enum Phase: String, Codable, Hashable, Sendable {
        /// Choosing areas/exercises before set entry.
        case planning
        /// Set entry (including adding exercises mid-workout).
        case inProgress
        /// Workout Review / confirmation, before durability.
        case reviewing
        /// Finish accepted by the Server but not yet durable.
        case finishing
        /// Explicit structured-workout pause. Save & Leave has no live
        /// projection and therefore no Live Activity/Watch subject.
        case paused
        /// Durably committed.
        case complete

        /// Unknown future values decode as `.paused`, so a renderer never
        /// offers Complete Set for a state it does not understand.
        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Self(rawValue: raw) ?? .paused
        }
    }

    struct Progress: Codable, Hashable, Sendable {
        var completedSets: Int
        var totalSets: Int
        var completedExercises: Int
        var totalExercises: Int
    }

    struct ExerciseCue: Codable, Hashable, Sendable {
        var exerciseId: String
        var name: String
        var variantLabel: String?
        var measurement: TrainingLoggerMeasurement
        var setCount: Int
        var completedSetCount: Int
        var supersetPartnerName: String?
        /// "A" / "B": this exercise's member letter inside its superset, nil
        /// for an ordinary exercise. A set's round is its `setNumber`.
        var supersetLabel: String?
    }

    struct SetCue: Codable, Hashable, Sendable {
        /// Identity a Complete Set control passes back to the authority.
        var exerciseId: String
        var setId: String
        var setNumber: Int
        var setCount: Int
        var reps: Double?
        var load: Double?
        var isBodyweight: Bool
        var durationSeconds: Double?
        var isCompleted: Bool
        var completedAt: Date?
        /// "185 lb × 8", "BW × 12", "BW + 25 lb × 8", "45 s"; nil when
        /// nothing is entered.
        var valueText: String?
    }

    /// Which two (at most) set/context rows a glance surface shows. Encodes
    /// the Founder's two-row rule so a renderer never derives it:
    /// - `previousAndCurrent`: normal set entry (row 1 Previous, row 2 Current).
    /// - `currentAndUpNext`: Current is the exercise's final set (Previous drops away).
    /// - `completedAndUpNext`: an exercise was just finished; row 1 is that
    ///   completed set, row 2 is the next exercise's first set, not yet started.
    /// - `currentOnly`: nothing completed yet.
    /// - `completedOnly`: every set is complete.
    /// - `empty`: no sets yet (planning).
    enum ContextLayout: String, Codable, Hashable, Sendable {
        case previousAndCurrent
        case currentAndUpNext
        case completedAndUpNext
        case currentOnly
        case completedOnly
        case empty

        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Self(rawValue: raw) ?? .previousAndCurrent
        }
    }

    struct ContextRow: Hashable, Sendable {
        enum Role: String, Hashable, Sendable { case previous, completed, current, upNext }
        var role: Role
        var set: SetCue
        var exercise: ExerciseCue?
        /// This row's set is `currentSet`, the one Complete Set completes.
        /// After an exercise is finished, the "Up Next" row is that target.
        var isCompletionTarget: Bool
    }

    struct Rest: Codable, Hashable, Sendable {
        var id: String
        var mode: TrainingRestMode
        var startedAt: Date
        /// Countdown only.
        var endsAt: Date?
        var durationSeconds: Int?
        var sourceExerciseId: String
        var sourceSetId: String
        var frozenElapsedSeconds: Double?
        var frozenRemainingSeconds: Double?
        /// Countdown past `endsAt` at projection time. Presentation only.
        var isExpired: Bool
    }

    var schemaVersion: Int
    var sessionId: String
    /// The authority revision this was computed from; a control passes it
    /// back as `expectedRevision`.
    var revision: Int
    var sessionLabel: String
    var startedAt: Date?
    var finishedAt: Date?
    var phase: Phase
    var progress: Progress
    /// The most recently completed set (by `completedAt`; list order for
    /// sets completed before timestamps existed).
    var previousSet: SetCue?
    /// `previousSet`'s exercise.
    var previousExercise: ExerciseCue?
    var currentExercise: ExerciseCue?
    /// The set a Complete Set control would complete.
    var currentSet: SetCue?
    /// `currentSet` is the last incomplete set of its *unit*: an ordinary
    /// exercise, or a whole superset (both members, every round).
    var isFinalSetOfUnit: Bool
    /// The set that becomes current once `currentSet` is completed.
    var upNextSet: SetCue?
    /// `upNextSet`'s exercise when it differs from `currentExercise`.
    var upNextExercise: ExerciseCue?
    /// Every set is complete (and there is at least one).
    var isWorkoutComplete: Bool
    var contextLayout: ContextLayout
    /// Present while in progress or paused. A paused renderer uses the
    /// frozen values and must not animate from the absolute anchors.
    var rest: Rest?

    /// `nil` for retrospective (past) entries, which have no live session.
    static func make(
        from draft: TrainingLoggerDraft,
        areaLabels: [String: String] = [:],
        now: Date
    ) -> Self? {
        guard draft.mode == .live else { return nil }
        let phase = Self.phase(of: draft)
        let cursor = TrainingSessionCursor(draft: draft)
        let current = cursor.current()
        let upNext = current.flatMap { cursor.current(afterCompleting: $0) }
        let incompleteInUnit = current.map { cursor.incompleteCount(inUnitOf: $0.exerciseIndex) } ?? 0

        let labels = draft.selectedAreaIds.map { areaLabels[$0] ?? PresentationLanguage.displayName(fromIdentifier: $0) }
        let label = labels.isEmpty ? "Workout" : labels.joined(separator: " · ")

        var restCue: Rest?
        // Rest is hidden (and its haptics silent) from the moment Finish is
        // requested or confirmed; Not Yet restores it from its anchor.
        if (phase == .inProgress || phase == .paused),
           draft.finishConfirmationRequestedAt == nil, draft.finishedAt == nil,
           let rest = draft.rest, let started = rest.startedAtDate {
            restCue = Rest(
                id: rest.id, mode: rest.mode, startedAt: started, endsAt: rest.endsAtDate,
                durationSeconds: rest.durationSeconds, sourceExerciseId: rest.sourceExerciseId,
                sourceSetId: rest.sourceSetId,
                frozenElapsedSeconds: rest.frozenElapsedSeconds,
                frozenRemainingSeconds: rest.frozenRemainingSeconds,
                isExpired: phase == .paused ? false : rest.isExpired(at: now)
            )
        }

        let totalSets = draft.totalSetCount
        let completedSets = draft.completedSetCount
        let upNextExerciseIndex = upNext.flatMap { next in next.exerciseIndex == current?.exerciseIndex ? nil : next.exerciseIndex }
        let previous = cursor.previous(before: current)
        let isFinal = current != nil && incompleteInUnit == 1
        let layout: ContextLayout
        if let current {
            if let previous, !cursor.sameUnit(previous.exerciseIndex, current.exerciseIndex),
               !cursor.hasCompletedSet(inUnitOf: current.exerciseIndex),
               cursor.incompleteCount(inUnitOf: previous.exerciseIndex) == 0 {
                // The transition moment wins even when the next unit is a
                // single set: Completed + Up Next, never a third row. A unit
                // is a whole superset, so one member running out of sets
                // mid-round never triggers it.
                layout = .completedAndUpNext
            } else if isFinal, upNext != nil {
                layout = .currentAndUpNext
            } else {
                layout = previous == nil ? .currentOnly : .previousAndCurrent
            }
        } else {
            layout = previous == nil ? .empty : .completedOnly
        }
        return Self(
            schemaVersion: schemaVersion,
            sessionId: draft.id,
            revision: draft.currentRevision,
            sessionLabel: truncate(label, to: labelLimit),
            startedAt: draft.startedAt.flatMap(TrainingSessionClock.date(from:)),
            finishedAt: draft.finishedAt.flatMap(TrainingSessionClock.date(from:)),
            phase: phase,
            progress: .init(
                completedSets: completedSets,
                totalSets: totalSets,
                completedExercises: draft.exercises.filter { !$0.sets.isEmpty && $0.sets.allSatisfy(\.isCompleted) }.count,
                totalExercises: draft.exercises.count
            ),
            previousSet: previous.map { setCue(draft, $0) },
            previousExercise: previous.map { exerciseCue(draft, $0.exerciseIndex) },
            currentExercise: current.map { exerciseCue(draft, $0.exerciseIndex) },
            currentSet: current.map { setCue(draft, $0) },
            isFinalSetOfUnit: isFinal,
            upNextSet: upNext.map { setCue(draft, $0) },
            upNextExercise: upNextExerciseIndex.map { exerciseCue(draft, $0) },
            isWorkoutComplete: totalSets > 0 && completedSets == totalSets,
            contextLayout: layout,
            rest: restCue
        )
    }

    /// The rows to render, in order, never more than two.
    var contextRows: [ContextRow] {
        func row(_ role: ContextRow.Role, _ set: SetCue?, _ exercise: ExerciseCue?) -> ContextRow? {
            set.map { cue in
                ContextRow(
                    role: role, set: cue, exercise: exercise,
                    isCompletionTarget: cue.setId == currentSet?.setId && cue.exerciseId == currentSet?.exerciseId
                )
            }
        }
        let rows: [ContextRow?]
        switch contextLayout {
        case .previousAndCurrent: rows = [row(.previous, previousSet, previousExercise), row(.current, currentSet, currentExercise)]
        case .currentAndUpNext: rows = [row(.current, currentSet, currentExercise), row(.upNext, upNextSet, upNextExercise)]
        case .completedAndUpNext: rows = [row(.completed, previousSet, previousExercise), row(.upNext, currentSet, currentExercise)]
        case .currentOnly: rows = [row(.current, currentSet, currentExercise)]
        case .completedOnly: rows = [row(.completed, previousSet, previousExercise)]
        case .empty: rows = []
        }
        return Array(rows.compactMap { $0 }.prefix(2))
    }

    /// Lock-Screen-safe variant: no exercise names, values, or areas.
    func redacted() -> Self {
        var copy = self
        copy.sessionLabel = "Workout"
        for keyPath in [\Self.previousSet, \Self.currentSet, \Self.upNextSet] {
            copy[keyPath: keyPath]?.reps = nil
            copy[keyPath: keyPath]?.load = nil
            copy[keyPath: keyPath]?.durationSeconds = nil
            copy[keyPath: keyPath]?.valueText = nil
        }
        for keyPath in [\Self.previousExercise, \Self.currentExercise, \Self.upNextExercise] {
            copy[keyPath: keyPath]?.name = "Exercise"
            copy[keyPath: keyPath]?.variantLabel = nil
            copy[keyPath: keyPath]?.supersetPartnerName = nil
            copy[keyPath: keyPath]?.supersetLabel = nil
        }
        return copy
    }

    static func phase(of draft: TrainingLoggerDraft) -> Phase {
        if draft.step == .complete { return .complete }
        if draft.submissionState != nil { return .finishing }
        // A confirmed Finish (phone or Watch) never offers Complete Set again.
        if draft.finishedAt != nil, draft.watchFinishOperationId != nil { return .finishing }
        if draft.pausedAt != nil { return .paused }
        if draft.leftAt != nil { return .planning }
        if draft.step == .workout || draft.isAddingExercises { return .inProgress }
        switch draft.step {
        case .summary, .evidence, .review: return .reviewing
        case .entry, .areas, .exercises, .workout, .complete: return .planning
        }
    }

    private static func exerciseCue(_ draft: TrainingLoggerDraft, _ index: Int) -> ExerciseCue {
        let exercise = draft.exercises[index]
        let unit = TrainingSessionCursor(draft: draft).unitMembers(ofExercise: index)
        let partner = unit.first { $0 != index }.map { draft.exercises[$0].name }
        let letter = unit.count > 1 ? unit.firstIndex(of: index).map { String(UnicodeScalar(UInt8(65 + $0))) } : nil
        return ExerciseCue(
            exerciseId: exercise.id,
            name: truncate(exercise.name, to: nameLimit),
            variantLabel: exercise.executionVariant?.label,
            measurement: exercise.measurement,
            setCount: exercise.sets.count,
            completedSetCount: exercise.sets.filter(\.isCompleted).count,
            supersetPartnerName: partner.map { truncate($0, to: nameLimit) },
            supersetLabel: letter
        )
    }

    private static func setCue(_ draft: TrainingLoggerDraft, _ position: TrainingSessionCursor.Position) -> SetCue {
        let exercise = draft.exercises[position.exerciseIndex]
        let set = exercise.sets[position.setIndex]
        let semantics = set.loadSemantics(defaultLoadType: exercise.defaultLoadType)
        let isBodyweight = exercise.measurement == .bodyweightReps || semantics == .bodyweight || semantics == .weightedBodyweight
        return SetCue(
            exerciseId: exercise.id,
            setId: set.id,
            setNumber: set.setNumber,
            setCount: exercise.sets.count,
            reps: set.reps,
            load: set.load,
            isBodyweight: isBodyweight,
            durationSeconds: set.durationSeconds,
            isCompleted: set.isCompleted,
            completedAt: set.completedAt.flatMap(TrainingSessionClock.date(from:)),
            valueText: valueText(set, measurement: exercise.measurement, isBodyweight: isBodyweight)
        )
    }

    static func valueText(_ set: TrainingLoggerDraftSet, measurement: TrainingLoggerMeasurement, isBodyweight: Bool) -> String? {
        func number(_ value: Double) -> String {
            value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        }
        if measurement == .duration {
            return set.durationSeconds.map { "\(number($0)) s" }
        }
        let loadText: String?
        if isBodyweight {
            loadText = (set.load ?? 0) > 0 ? "BW + \(number(set.load ?? 0)) lb" : "BW"
        } else {
            loadText = set.load.map { "\(number($0)) lb" }
        }
        switch (loadText, set.reps) {
        case let (load?, reps?): return "\(load) × \(number(reps))"
        case let (load?, nil): return isBodyweight ? nil : load
        case let (nil, reps?): return "\(number(reps)) reps"
        case (nil, nil): return nil
        }
    }

    private static func truncate(_ value: String, to limit: Int) -> String {
        value.count <= limit ? value : String(value.prefix(limit - 1)) + "…"
    }
}

/// Deterministic "where am I" for a workout with no stored cursor.
///
/// Exercises form units in display order; a superset pair is one unit at
/// its first member's position. The anchor is the most recently completed
/// set (by `completedAt`). The current set is the next incomplete set in the
/// anchor's unit (alternating between superset members), else the first
/// unit after it with work left (wrapping to earlier units). With no
/// timestamps (older drafts) it is the first unit with work left.
struct TrainingSessionCursor {
    struct Position: Equatable {
        var exerciseIndex: Int
        var setIndex: Int
    }

    let draft: TrainingLoggerDraft
    private let units: [[Int]]

    init(draft: TrainingLoggerDraft) {
        self.draft = draft
        var placed = Set<Int>()
        var units: [[Int]] = []
        for (index, exercise) in draft.exercises.enumerated() where !placed.contains(index) {
            var unit = [index]
            if let group = draft.relationships.first(where: { $0.memberExerciseIds.contains(exercise.id) }) {
                for memberId in group.memberExerciseIds where memberId != exercise.id {
                    if let partner = draft.exercises.firstIndex(where: { $0.id == memberId }), !placed.contains(partner), partner != index {
                        unit.append(partner)
                    }
                }
            }
            unit = Array(Set(unit)).sorted()
            unit.forEach { placed.insert($0) }
            units.append(unit)
        }
        self.units = units
    }

    private func unitIndex(ofExercise exerciseIndex: Int) -> Int? {
        units.firstIndex { $0.contains(exerciseIndex) }
    }

    /// Exercise indices of the unit (a superset's members in list order, or
    /// the single exercise).
    func unitMembers(ofExercise exerciseIndex: Int) -> [Int] {
        unitIndex(ofExercise: exerciseIndex).map { units[$0] } ?? [exerciseIndex]
    }

    func sameUnit(_ lhs: Int, _ rhs: Int) -> Bool {
        unitIndex(ofExercise: lhs) == unitIndex(ofExercise: rhs)
    }

    /// Incomplete sets across every member of the unit.
    func incompleteCount(inUnitOf exerciseIndex: Int) -> Int {
        unitMembers(ofExercise: exerciseIndex).reduce(0) { $0 + draft.exercises[$1].sets.filter { !$0.isCompleted }.count }
    }

    func hasCompletedSet(inUnitOf exerciseIndex: Int) -> Bool {
        unitMembers(ofExercise: exerciseIndex).contains { draft.exercises[$0].sets.contains(where: \.isCompleted) }
    }

    /// The most recently completed set that has a timestamp.
    func anchor() -> Position? {
        var best: (position: Position, date: Date)?
        for (exerciseIndex, exercise) in draft.exercises.enumerated() {
            for (setIndex, set) in exercise.sets.enumerated() where set.isCompleted {
                guard let date = set.completedAt.flatMap(TrainingSessionClock.date(from:)) else { continue }
                if best == nil || date >= best!.date {
                    best = (Position(exerciseIndex: exerciseIndex, setIndex: setIndex), date)
                }
            }
        }
        return best?.position
    }

    func current() -> Position? { current(anchor: anchor(), completedOverride: nil) }

    /// The current set once `position` is also complete.
    func current(afterCompleting position: Position) -> Position? {
        current(anchor: position, completedOverride: position)
    }

    /// Previous completed set: the anchor; for older drafts without
    /// timestamps, the last completed set in list order before `current`
    /// (or overall when nothing is left).
    func previous(before current: Position?) -> Position? {
        if let anchor = anchor() { return anchor }
        // Round-interleaved inside a superset (A1 B1 A2 B2 ...), so the
        // fallback alternates exactly like the live cursor does.
        let ordered = units.flatMap { unit -> [Position] in
            let positions = unit.flatMap { exerciseIndex in
                draft.exercises[exerciseIndex].sets.indices.map { Position(exerciseIndex: exerciseIndex, setIndex: $0) }
            }
            return unit.count == 1 ? positions : positions.sorted {
                $0.setIndex == $1.setIndex ? $0.exerciseIndex < $1.exerciseIndex : $0.setIndex < $1.setIndex
            }
        }
        let limit = current.flatMap { ordered.firstIndex(of: $0) } ?? ordered.count
        return ordered[..<limit].last { draft.exercises[$0.exerciseIndex].sets[$0.setIndex].isCompleted }
    }

    private func current(anchor: Position?, completedOverride: Position?) -> Position? {
        func isComplete(_ exerciseIndex: Int, _ setIndex: Int) -> Bool {
            Position(exerciseIndex: exerciseIndex, setIndex: setIndex) == completedOverride
                || draft.exercises[exerciseIndex].sets[setIndex].isCompleted
        }
        func firstIncomplete(_ exerciseIndex: Int) -> Int? {
            draft.exercises[exerciseIndex].sets.indices
                .filter { !isComplete(exerciseIndex, $0) }
                .min { draft.exercises[exerciseIndex].sets[$0].setNumber < draft.exercises[exerciseIndex].sets[$1].setNumber }
        }
        func pick(in unit: [Int], avoiding lastExercise: Int?) -> Position? {
            let candidates = unit.compactMap { exerciseIndex in
                firstIncomplete(exerciseIndex).map { Position(exerciseIndex: exerciseIndex, setIndex: $0) }
            }
            guard candidates.count > 1 else { return candidates.first }
            func number(_ position: Position) -> Int { draft.exercises[position.exerciseIndex].sets[position.setIndex].setNumber }
            let lowest = candidates.map(number).min()!
            let tied = candidates.filter { number($0) == lowest }
            return tied.first { $0.exerciseIndex != lastExercise } ?? tied.first
        }

        guard let anchor, let anchorUnit = units.firstIndex(where: { $0.contains(anchor.exerciseIndex) }) else {
            return units.lazy.compactMap { pick(in: $0, avoiding: nil) }.first
        }
        if let sameUnit = pick(in: units[anchorUnit], avoiding: anchor.exerciseIndex) { return sameUnit }
        let order = Array(units.indices[(anchorUnit + 1)...]) + Array(units.indices[..<anchorUnit])
        return order.lazy.compactMap { pick(in: units[$0], avoiding: nil) }.first
    }
}
