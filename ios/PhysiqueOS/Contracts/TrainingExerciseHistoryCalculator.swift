import Foundation

/// Ports `getCurrentExerciseBenchmark`, `getExerciseSetStats`,
/// `compareExerciseSets`, and the "Today"/"Yesterday" session-badge
/// formatter from `TrainingKnowledgeScreen.jsx` exactly — algorithm, not
/// reinterpretation, so a future Workout Logger prepopulation feature can
/// call `benchmark(for:)` directly instead of re-deriving "previous
/// performance" from raw occurrences a second time.
enum TrainingExerciseHistoryCalculator {
    /// `compareExerciseSets` (`TrainingKnowledgeScreen.jsx:1694-1707`):
    /// ranks by weight descending, then reps descending, treating a
    /// missing/non-finite value as `-1` (worse than any real 0). Negative
    /// means `lhs` is the better set; `0` means equal; positive means
    /// `rhs` is better.
    static func compare(_ lhs: TrainingSet?, _ rhs: TrainingSet?) -> Int {
        let lhsWeight = lhs?.weight ?? -1
        let rhsWeight = rhs?.weight ?? -1
        if lhsWeight != rhsWeight { return lhsWeight > rhsWeight ? -1 : 1 }
        let lhsReps = lhs?.reps ?? -1
        let rhsReps = rhs?.reps ?? -1
        if lhsReps != rhsReps { return lhsReps > rhsReps ? -1 : 1 }
        return 0
    }

    /// The single best set among `sets`, per `compare(_:_:)`. `nil` for an
    /// empty array.
    static func bestSet(in sets: [TrainingSet]) -> TrainingSet? {
        sets.min { compare($0, $1) < 0 }
    }

    /// `getExerciseSetStats` (`TrainingKnowledgeScreen.jsx:1614-1637`):
    /// volume only counts sets with both a finite `reps` and `weight`
    /// (bodyweight/timed sets contribute nothing to volume, matching
    /// source exactly — not a native simplification).
    static func volume(of sets: [TrainingSet]) -> Double {
        sets.reduce(0) { total, set in
            guard let reps = set.reps, let weight = set.weight else { return total }
            return total + reps * weight
        }
    }

    /// `formatVolume` (`TrainingKnowledgeScreen.jsx`): rounded, thousands-
    /// separated, always in lb.
    static func formattedVolume(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = ","
        formatter.maximumFractionDigits = 0
        return "\(formatter.string(from: NSNumber(value: value.rounded())) ?? "\(Int(value.rounded()))") lb"
    }

    static let ordinaryVariantKey = "ordinary"
    static let standaloneRelationshipKey = "standalone"

    private static func variantKey(_ exercise: TrainingExerciseOccurrence) -> String {
        exercise.executionVariant?.key ?? ordinaryVariantKey
    }

    private static func relationshipKey(_ relationship: TrainingExerciseRelationshipContext?) -> String {
        guard let relationship else { return standaloneRelationshipKey }
        let partnerIdentity = relationship.partnerCanonicalExerciseIds.isEmpty
            ? relationship.partnerNames.map { $0.lowercased() }
            : relationship.partnerCanonicalExerciseIds
        return "\(relationship.relationshipType):\(partnerIdentity.sorted().joined(separator: ","))"
    }

    /// The Logger's source-derived previous-performance lookup. The web
    /// requires a strict match on canonical exercise (already scoped by the
    /// caller), execution variant, relationship/superset comparison key, and
    /// a workout date strictly before the draft date. Keeping this beside the
    /// read-side benchmark calculator prevents a second, weaker Native-only
    /// history algorithm from emerging in the capture workflow.
    static func previousComparableOccurrence(
        in occurrences: [TrainingExerciseHistoryOccurrence],
        before workoutDate: String,
        executionVariant: TrainingExecutionVariant?,
        relationship: TrainingExerciseRelationshipContext?
    ) -> TrainingExerciseHistoryOccurrence? {
        let requestedVariant = executionVariant?.key ?? ordinaryVariantKey
        let requestedRelationship = relationshipKey(relationship)
        return occurrences
            .filter { $0.sessionDate < workoutDate }
            .filter { variantKey($0.exercise) == requestedVariant }
            .filter { relationshipKey($0.relationship) == requestedRelationship }
            .sorted { $0.sessionDate > $1.sessionDate }
            .first
    }

    /// `getCurrentExerciseBenchmark` (`TrainingKnowledgeScreen.jsx:1639-1692`),
    /// ported field-for-field. `occurrences` must already be sorted newest
    /// first (the same order `TrainingAPI.fetchTrainingExercise` returns).
    static func benchmark(for occurrences: [TrainingExerciseHistoryOccurrence]) -> TrainingExerciseBenchmark? {
        guard let latest = occurrences.first else { return nil }

        let latestVariantKey = variantKey(latest.exercise)
        let latestRelationshipKey = relationshipKey(latest.relationship)
        let comparable = occurrences.filter {
            variantKey($0.exercise) == latestVariantKey && relationshipKey($0.relationship) == latestRelationshipKey
        }

        let latestBest = bestSet(in: latest.exercise.sets)
        let lifetimeBest = bestSet(in: comparable.flatMap(\.exercise.sets))
        guard let lifetimeBest else { return nil }
        let priorBest = bestSet(in: comparable.dropFirst().flatMap(\.exercise.sets))

        let hasVariantContext = latestVariantKey != ordinaryVariantKey
        let hasRelationshipContext = latestRelationshipKey != standaloneRelationshipKey

        var comparison: String?
        if let latestBest, comparable.count > 1 || (!hasVariantContext && !hasRelationshipContext) {
            if let priorBest, compare(latestBest, priorBest) < 0 {
                comparison = "Last session established a new best."
            } else if compare(latestBest, lifetimeBest) == 0 {
                comparison = "Last session matched your current best."
            } else {
                comparison = "Last session finished below your current best."
            }
        } else if latestBest != nil, hasVariantContext || hasRelationshipContext {
            comparison = hasRelationshipContext
                ? "No comparable prior \(latest.relationship?.relationshipType ?? "relationship") session."
                : "No comparable prior variant session."
        }

        return TrainingExerciseBenchmark(
            bestSet: lifetimeBest.glance,
            comparison: comparison,
            lastSessionDate: TrainingDateFormatting.short(latest.sessionDate),
            workingWeight: latestBest?.formattedLoad ?? "Pending"
        )
    }

    /// `formatExerciseHistoryMeta` (`TrainingKnowledgeScreen.jsx`):
    /// `"{N} sets - Best {reps x load} - {volume} lb"`, omitting any part
    /// that doesn't apply.
    static func historyMeta(for sets: [TrainingSet]) -> String {
        var parts: [String] = []
        if !sets.isEmpty { parts.append("\(sets.count) sets") }
        if let best = bestSet(in: sets) { parts.append("Best \(best.glance)") }
        let totalVolume = volume(of: sets)
        if totalVolume > 0 { parts.append(formattedVolume(totalVolume)) }
        return parts.joined(separator: " - ")
    }

    /// `SessionBadge`'s date formatting: "Today" / "Yesterday" / a short
    /// "Mon D" fallback (`TrainingDateFormatting.short`). `referenceDate`
    /// is injectable so this is deterministically testable rather than
    /// depending on the device clock.
    static func sessionBadge(for isoDate: String, referenceDate: Date = Date()) -> String {
        guard let date = TrainingDateFormatting.date(from: isoDate) else {
            return TrainingDateFormatting.short(isoDate)
        }
        let calendar = Calendar(identifier: .gregorian)
        if calendar.isDate(date, inSameDayAs: referenceDate) { return "Today" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: referenceDate),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "Yesterday"
        }
        return TrainingDateFormatting.short(isoDate)
    }
}
