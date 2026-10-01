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
        /// Save & Leave.
        case paused
        /// Durably committed.
        case complete

        /// Unknown future values decode as `.inProgress`.
        init(from decoder: Decoder) throws {
            let raw = try decoder.singleValueContainer().decode(String.self)
            self = Self(rawValue: raw) ?? .inProgress
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

    struct Rest: Codable, Hashable, Sendable {
        var id: String
        var mode: TrainingRestMode
        var startedAt: Date
        /// Countdown only.
        var endsAt: Date?
        var durationSeconds: Int?
        var sourceExerciseId: String
        var sourceSetId: String
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
    var currentExercise: ExerciseCue?
    /// The set a Complete Set control would complete.
    var currentSet: SetCue?
    /// `currentSet` is the last incomplete set of `currentExercise`.
    var isFinalSetOfExercise: Bool
    /// The set that becomes current once `currentSet` is completed.
    var upNextSet: SetCue?
    /// `upNextSet`'s exercise when it differs from `currentExercise`.
    var upNextExercise: ExerciseCue?
    /// Every set is complete (and there is at least one).
    var isWorkoutComplete: Bool
    /// Present only while `phase == .inProgress`.
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
        let currentExercise = current.map { draft.exercises[$0.exerciseIndex] }
        let incompleteInCurrent = currentExercise?.sets.filter { !$0.isCompleted }.count ?? 0

        let labels = draft.selectedAreaIds.map { areaLabels[$0] ?? PresentationLanguage.displayName(fromIdentifier: $0) }
        let label = labels.isEmpty ? "Workout" : labels.joined(separator: " · ")

        var restCue: Rest?
        if phase == .inProgress, let rest = draft.rest, let started = rest.startedAtDate {
            restCue = Rest(
                id: rest.id, mode: rest.mode, startedAt: started, endsAt: rest.endsAtDate,
                durationSeconds: rest.durationSeconds, sourceExerciseId: rest.sourceExerciseId,
                sourceSetId: rest.sourceSetId, isExpired: rest.isExpired(at: now)
            )
        }

        let totalSets = draft.totalSetCount
        let completedSets = draft.completedSetCount
        let upNextExerciseIndex = upNext.flatMap { next in next.exerciseIndex == current?.exerciseIndex ? nil : next.exerciseIndex }
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
            previousSet: cursor.previous(before: current).map { setCue(draft, $0) },
            currentExercise: current.map { exerciseCue(draft, $0.exerciseIndex) },
            currentSet: current.map { setCue(draft, $0) },
            isFinalSetOfExercise: current != nil && incompleteInCurrent == 1,
            upNextSet: upNext.map { setCue(draft, $0) },
            upNextExercise: upNextExerciseIndex.map { exerciseCue(draft, $0) },
            isWorkoutComplete: totalSets > 0 && completedSets == totalSets,
            rest: restCue
        )
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
        for keyPath in [\Self.currentExercise, \Self.upNextExercise] {
            copy[keyPath: keyPath]?.name = "Exercise"
            copy[keyPath: keyPath]?.variantLabel = nil
            copy[keyPath: keyPath]?.supersetPartnerName = nil
        }
        return copy
    }

    static func phase(of draft: TrainingLoggerDraft) -> Phase {
        if draft.step == .complete { return .complete }
        if draft.submissionState != nil { return .finishing }
        if draft.leftAt != nil { return .paused }
        if draft.step == .workout || draft.isAddingExercises { return .inProgress }
        switch draft.step {
        case .summary, .evidence, .review: return .reviewing
        case .entry, .areas, .exercises, .workout, .complete: return .planning
        }
    }

    private static func exerciseCue(_ draft: TrainingLoggerDraft, _ index: Int) -> ExerciseCue {
        let exercise = draft.exercises[index]
        let partner = draft.relationshipContext(for: exercise.id)?.partnerNames.first
        return ExerciseCue(
            exerciseId: exercise.id,
            name: truncate(exercise.name, to: nameLimit),
            variantLabel: exercise.executionVariant?.label,
            measurement: exercise.measurement,
            setCount: exercise.sets.count,
            completedSetCount: exercise.sets.filter(\.isCompleted).count,
            supersetPartnerName: partner.map { truncate($0, to: nameLimit) }
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
            unit.sort()
            unit.forEach { placed.insert($0) }
            units.append(unit)
        }
        self.units = units
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
        let ordered = units.flatMap { unit in
            unit.flatMap { exerciseIndex in
                draft.exercises[exerciseIndex].sets.indices.map { Position(exerciseIndex: exerciseIndex, setIndex: $0) }
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
