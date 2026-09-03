import Foundation

enum TrainingLoggerMode: String, Codable, Equatable {
    case live
    case past

    var title: String { self == .live ? "Live workout" : "Past workout" }
}

enum TrainingLoggerStep: String, Codable, Equatable {
    case entry
    case areas
    case exercises
    case workout
    case summary
    case evidence
    case review
    case complete
}

enum TrainingLoggerMeasurement: String, Codable, Equatable {
    case repsLoad = "reps_load"
    case bodyweightReps = "bodyweight_reps"
    case duration
}

struct TrainingLoggerArea: Codable, Equatable, Identifiable {
    var id: String
    var label: String
}

struct TrainingLoggerConfiguration: Codable, Equatable {
    var areas: [TrainingLoggerArea]
    var variants: [TrainingExecutionVariant]
    var exercises: [TrainingLoggerCatalogExercise]
}

struct TrainingLoggerCatalogExercise: Codable, Equatable, Identifiable {
    var id: String { canonicalExerciseId }
    var canonicalExerciseId: String
    var name: String
    var areaId: String
    var equipment: String?
    var measurement: TrainingLoggerMeasurement
    var previouslyPerformed: Bool
    var history: [TrainingLoggerHistoryRecord]
    var progressionRecommendation: TrainingLoggerProgressionRecommendation?

    var historyOccurrences: [TrainingExerciseHistoryOccurrence] {
        history.map { record in
            TrainingExerciseHistoryOccurrence(
                sessionId: record.sessionId,
                sessionDate: record.workoutDate,
                exercise: TrainingExerciseOccurrence(
                    id: "\(record.sessionId)-\(canonicalExerciseId)",
                    name: name,
                    canonicalExerciseId: canonicalExerciseId,
                    executionVariant: record.executionVariant,
                    sets: record.sets
                ),
                relationship: record.relationship.map {
                    TrainingExerciseRelationshipContext(
                        relationshipType: $0.relationshipType,
                        partnerNames: $0.partnerNames,
                        partnerCanonicalExerciseIds: $0.partnerCanonicalExerciseIds
                    )
                }
            )
        }
    }
}

struct TrainingLoggerHistoryRecord: Codable, Equatable {
    var sessionId: String
    var workoutDate: String
    var executionVariant: TrainingExecutionVariant?
    var relationship: TrainingLoggerHistoryRelationship?
    var sets: [TrainingSet]
}

struct TrainingLoggerHistoryRelationship: Codable, Equatable {
    var relationshipType: String
    var partnerNames: [String]
    var partnerCanonicalExerciseIds: [String]
}

struct TrainingLoggerDraft: Codable, Equatable, Identifiable {
    var id: String
    var mode: TrainingLoggerMode
    var workoutDate: String
    var selectedAreaIds: [String]
    var exercises: [TrainingLoggerDraftExercise]
    var relationships: [TrainingLoggerDraftRelationship]
    var step: TrainingLoggerStep
    /// Present only while the accepted picker is being reused from set entry.
    /// Optional keeps build-5 drafts forward-decodable.
    var exercisePickerReturnStep: TrainingLoggerStep?
    var exercisePickerExistingExerciseIds: [String]?
    /// Manual Apple Health screenshots are supporting workout evidence today.
    /// A future HealthKit adapter can populate this same boundary.
    var supportingEvidence: [TrainingLoggerSupportingEvidence]?
    /// Qualifying non-strength workouts remain separate observations even
    /// when this review reconciles the same gym visit.
    var supportingWorkouts: [TrainingLoggerSupportingWorkout]?
    /// Supporting-evidence asset ids whose local interpretation could not
    /// extract workout details — kept separate from `supportingWorkouts`
    /// so a failed screenshot never silently falls back to a fixture
    /// result and is never confused with a genuinely successful read.
    var supportingWorkoutFailureAssetIds: [String]?

    static func fresh(mode: TrainingLoggerMode, workoutDate: String) -> Self {
        .init(
            id: UUID().uuidString,
            mode: mode,
            workoutDate: workoutDate,
            selectedAreaIds: [],
            exercises: [],
            relationships: [],
            step: .areas,
            exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil,
            supportingEvidence: nil,
            supportingWorkouts: nil,
            supportingWorkoutFailureAssetIds: nil
        )
    }

    var completedSetCount: Int {
        exercises.flatMap(\.sets).filter(\.isCompleted).count
    }

    var totalSetCount: Int {
        exercises.reduce(0) { $0 + $1.sets.count }
    }

    var variantCount: Int { exercises.filter { $0.executionVariant != nil }.count }
    var supersetCount: Int { relationships.count }
    var isAddingExercises: Bool { exercisePickerReturnStep == .workout }
    var supportingEvidenceAssets: [TrainingLoggerSupportingEvidence] { supportingEvidence ?? [] }
    var supportingWorkoutObservations: [TrainingLoggerSupportingWorkout] { supportingWorkouts ?? [] }
    var supportingWorkoutFailureIds: [String] { supportingWorkoutFailureAssetIds ?? [] }
    var addedExerciseCount: Int {
        guard isAddingExercises else { return exercises.count }
        let existing = Set(exercisePickerExistingExerciseIds ?? [])
        return exercises.filter { !existing.contains($0.id) }.count
    }

    /// Uses only the already strict-matched previous-performance context.
    /// No achievement is emitted when variant/relationship comparison was unavailable.
    var performanceAchievementLines: [String] {
        exercises.compactMap { exercise in
            guard let previous = exercise.previousPerformance else { return nil }
            let completed = exercise.sets.filter(\.isCompleted)
            switch exercise.measurement {
            case .repsLoad:
                let improved = completed.contains { current in
                    guard let load = current.load, let reps = current.reps else { return false }
                    guard let priorBest = previous.sets.filter({ $0.weight == load }).compactMap(\.reps).max() else { return false }
                    return reps > priorBest
                }
                return improved ? "\(exercise.name) · better reps at matched load" : nil
            case .bodyweightReps:
                guard let priorBest = previous.sets.compactMap(\.reps).max() else { return nil }
                return completed.compactMap(\.reps).max().map { $0 > priorBest } == true ? "\(exercise.name) · bodyweight rep best" : nil
            case .duration:
                guard let priorBest = previous.sets.compactMap(\.durationSeconds).max() else { return nil }
                return completed.compactMap(\.durationSeconds).max().map { $0 > priorBest } == true ? "\(exercise.name) · duration best" : nil
            }
        }
    }
}

struct TrainingLoggerSupportingEvidence: Codable, Equatable, Identifiable {
    enum Source: String, Codable, Equatable {
        case photos = "Photos"
        case files = "Files"
    }

    var id: String
    var displayName: String
    var source: Source
}

enum TrainingLoggerWorkoutRecordOwner: String, Codable, Equatable {
    case trainingSession
    case activity
}

struct TrainingLoggerSupportingWorkout: Codable, Equatable, Identifiable {
    var id: String
    var activityName: String
    var category: String
    var durationMinutes: Double
    var activeCalories: Double?
    var totalCalories: Double?
    var averageHeartRate: Double?
    var distance: Double?
    var distanceUnit: String?
    var sourceEvidenceIds: [String]
    var recordOwner: TrainingLoggerWorkoutRecordOwner

    /// Fixture/test-only demonstration workout. Never produced by the real
    /// attach flow — `TrainingLoggerDraft.addSupportingEvidence` no longer
    /// auto-populates this; a real screenshot's metrics come only from
    /// `EvidenceLocalInterpretation.supportingWorkout(id:sourceEvidenceIds:from:)`
    /// via `setSupportingWorkoutInterpretation`.
    static func stairStepper(sourceEvidenceIds: [String]) -> Self {
        .init(
            id: "supporting-cardio-stair-stepper",
            activityName: "Stair Stepper",
            category: "Cardio",
            durationMinutes: 42,
            activeCalories: 386,
            totalCalories: nil,
            averageHeartRate: 128,
            distance: nil,
            distanceUnit: nil,
            sourceEvidenceIds: sourceEvidenceIds,
            recordOwner: .activity
        )
    }
}

struct TrainingLoggerDraftExercise: Codable, Equatable, Identifiable {
    var id: String
    var canonicalExerciseId: String?
    var name: String
    var areaId: String
    var measurement: TrainingLoggerMeasurement
    var executionVariant: TrainingExecutionVariant?
    var sets: [TrainingLoggerDraftSet]
    var previousPerformance: TrainingLoggerPreviousPerformance?
    var progressionRecommendation: TrainingLoggerProgressionRecommendation?
    var progressionChoice: TrainingLoggerProgressionChoice?
    var isProvisional: Bool
    var provenance: String?
}

struct TrainingLoggerDraftSet: Codable, Equatable, Identifiable {
    var id: String
    var setNumber: Int
    var reps: Double?
    var load: Double?
    var durationSeconds: Double?
    var isCompleted: Bool

    init(
        id: String,
        setNumber: Int,
        reps: Double?,
        load: Double?,
        durationSeconds: Double?,
        isCompleted: Bool
    ) {
        self.id = id
        self.setNumber = setNumber
        self.reps = reps
        self.load = load
        self.durationSeconds = durationSeconds
        self.isCompleted = isCompleted
    }

    static func empty(number: Int) -> Self {
        .init(id: UUID().uuidString, setNumber: number, reps: nil, load: nil, durationSeconds: nil, isCompleted: false)
    }

    init(source: TrainingSet, number: Int) {
        id = UUID().uuidString
        setNumber = number
        reps = source.reps
        load = source.weight
        durationSeconds = source.durationSeconds
        isCompleted = false
    }

    func validationMessage(for measurement: TrainingLoggerMeasurement) -> String? {
        switch measurement {
        case .repsLoad:
            guard let reps, reps > 0 else { return "Enter reps greater than zero." }
            guard let load, load >= 0 else { return "Enter a load of zero or more." }
        case .bodyweightReps:
            guard let reps, reps > 0 else { return "Enter reps greater than zero." }
        case .duration:
            guard let durationSeconds, durationSeconds > 0 else { return "Enter a duration greater than zero." }
        }
        return nil
    }
}

struct TrainingLoggerPreviousPerformance: Codable, Equatable {
    var workoutDate: String
    var sets: [TrainingSet]
    var contextLabel: String

    var compactSummary: String {
        sets.map(\.glance).joined(separator: " · ")
    }

    var compactLine: String {
        "Previous \(sets.first?.glance ?? compactSummary) · \(workoutDate) · \(contextLabel)"
    }
}

enum TrainingLoggerProgressionState: String, Codable, Equatable {
    case opportunity
    case maintain
    case recover
}

enum TrainingLoggerProgressionChoice: String, Codable, Equatable {
    case suggestion
    case previous
}

struct TrainingLoggerProgressionRecommendation: Codable, Equatable {
    var state: TrainingLoggerProgressionState
    var eyebrow: String
    var message: String
    var prescription: String
    var suggestedLoad: Double?
    var suggestedReps: Double?

    var hasExplicitTarget: Bool {
        suggestedLoad != nil && suggestedReps != nil
    }
}

struct TrainingLoggerDraftRelationship: Codable, Equatable, Identifiable {
    var id: String
    var relationshipType: String
    var memberExerciseIds: [String]
}

struct TrainingLoggerSummary: Equatable {
    var exerciseCount: Int
    var completedSetCount: Int
    var variantCount: Int
    var supersetCount: Int
}

extension TrainingLoggerDraft {
    mutating func toggleArea(_ areaId: String) {
        if let index = selectedAreaIds.firstIndex(of: areaId) {
            selectedAreaIds.remove(at: index)
        } else {
            selectedAreaIds.append(areaId)
        }
    }

    func pickerExercises(
        in catalog: [TrainingLoggerCatalogExercise],
        browseAll: Bool,
        query: String,
        includeAllAreas: Bool = false
    ) -> [TrainingLoggerCatalogExercise] {
        let selected = Set(selectedAreaIds)
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return catalog
            .filter { includeAllAreas || selected.contains($0.areaId) }
            .filter { browseAll || $0.previouslyPerformed }
            .filter { normalizedQuery.isEmpty || $0.name.lowercased().contains(normalizedQuery) }
            .sorted {
                if $0.previouslyPerformed != $1.previouslyPerformed { return $0.previouslyPerformed && !$1.previouslyPerformed }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
    }

    mutating func addExercise(_ catalogExercise: TrainingLoggerCatalogExercise) {
        guard !exercises.contains(where: { $0.canonicalExerciseId == catalogExercise.canonicalExerciseId }) else { return }
        let previous = comparablePerformance(for: catalogExercise, variant: nil, relationship: nil)
        let sets = previous?.sets.enumerated().map { TrainingLoggerDraftSet(source: $0.element, number: $0.offset + 1) }
            ?? (1...3).map(TrainingLoggerDraftSet.empty)
        exercises.append(.init(
            id: UUID().uuidString,
            canonicalExerciseId: catalogExercise.canonicalExerciseId,
            name: catalogExercise.name,
            areaId: catalogExercise.areaId,
            measurement: catalogExercise.measurement,
            executionVariant: nil,
            sets: sets,
            previousPerformance: previous,
            progressionRecommendation: previous == nil ? nil : catalogExercise.progressionRecommendation,
            progressionChoice: previous == nil || catalogExercise.progressionRecommendation == nil ? nil : .previous,
            isProvisional: false,
            provenance: nil
        ))
    }

    mutating func beginAddingExercises() {
        exercisePickerReturnStep = .workout
        exercisePickerExistingExerciseIds = exercises.map(\.id)
        step = .exercises
    }

    mutating func finishExerciseSelection() {
        step = exercisePickerReturnStep ?? .workout
        exercisePickerReturnStep = nil
        exercisePickerExistingExerciseIds = nil
    }

    func exerciseWasPresentBeforePicker(_ exercise: TrainingLoggerCatalogExercise) -> Bool {
        guard isAddingExercises,
              let draftExercise = exercises.first(where: {
                  $0.canonicalExerciseId == exercise.canonicalExerciseId
              }) else { return false }
        return Set(exercisePickerExistingExerciseIds ?? []).contains(draftExercise.id)
    }

    /// Records asset metadata only — it does not itself decide what the
    /// workout was. Real interpretation is async (local OCR), so the
    /// caller attaches metadata here immediately for a responsive picker,
    /// then reports each asset's actual interpreted result separately via
    /// `setSupportingWorkoutInterpretation` once local extraction finishes.
    mutating func addSupportingEvidence(_ assets: [TrainingLoggerSupportingEvidence]) {
        var current = supportingEvidenceAssets
        var identities = Set(current.map { "\($0.source.rawValue)|\($0.displayName)" })
        for asset in assets where identities.insert("\(asset.source.rawValue)|\(asset.displayName)").inserted {
            current.append(asset)
        }
        supportingEvidence = current
    }

    mutating func removeSupportingEvidence(id: String) {
        supportingEvidence = supportingEvidenceAssets.filter { $0.id != id }
        supportingWorkouts = supportingWorkoutObservations.filter { !$0.sourceEvidenceIds.contains(id) }
        let remainingFailures = supportingWorkoutFailureIds.filter { $0 != id }
        supportingWorkoutFailureAssetIds = remainingFailures.isEmpty ? nil : remainingFailures
    }

    /// Attaches one supporting-evidence asset's real, locally interpreted
    /// workout — one entry per asset (`sourceEvidenceIds: [assetId]`), so
    /// multiple attached screenshots that represent multiple distinct
    /// workouts stay distinct rather than being merged into one combined
    /// record. `workout == nil` records that this specific asset's local
    /// interpretation could not extract workout details — a genuinely
    /// different, explicit outcome from a successful read, never
    /// papered over with fixture/demo values.
    mutating func setSupportingWorkoutInterpretation(assetId: String, workout: TrainingLoggerSupportingWorkout?) {
        guard supportingEvidenceAssets.contains(where: { $0.id == assetId }) else { return }
        var workouts = supportingWorkoutObservations.filter { $0.sourceEvidenceIds != [assetId] }
        var failures = Set(supportingWorkoutFailureIds)
        if let workout {
            var stamped = workout
            stamped.sourceEvidenceIds = [assetId]
            workouts.append(stamped)
            failures.remove(assetId)
        } else {
            failures.insert(assetId)
        }
        supportingWorkouts = workouts
        supportingWorkoutFailureAssetIds = failures.isEmpty ? nil : failures.sorted()
    }

    mutating func addProvisionalExercise(name: String, areaId: String) {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty,
              !exercises.contains(where: { $0.name.caseInsensitiveCompare(cleanName) == .orderedSame }) else { return }
        exercises.append(.init(
            id: UUID().uuidString,
            canonicalExerciseId: nil,
            name: cleanName,
            areaId: areaId,
            measurement: .repsLoad,
            executionVariant: nil,
            sets: (1...3).map(TrainingLoggerDraftSet.empty),
            previousPerformance: nil,
            progressionRecommendation: nil,
            progressionChoice: nil,
            isProvisional: true,
            provenance: "User-entered during local Native workout capture; requires canonical review."
        ))
    }

    mutating func removeExercise(id: String) {
        exercises.removeAll { $0.id == id }
        relationships.removeAll { $0.memberExerciseIds.contains(id) }
    }

    mutating func moveExercise(id: String, offset: Int) {
        guard let index = exercises.firstIndex(where: { $0.id == id }) else { return }
        let destination = max(0, min(exercises.count - 1, index + offset))
        guard destination != index else { return }
        let exercise = exercises.remove(at: index)
        exercises.insert(exercise, at: destination)
    }

    mutating func addSet(to exerciseId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        var set = exercises[index].sets.last ?? .empty(number: 1)
        set.id = UUID().uuidString
        set.setNumber = exercises[index].sets.count + 1
        set.isCompleted = false
        exercises[index].sets.append(set)
    }

    mutating func removeSet(exerciseId: String, setId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }), exercises[index].sets.count > 1 else { return }
        exercises[index].sets.removeAll { $0.id == setId }
        for setIndex in exercises[index].sets.indices { exercises[index].sets[setIndex].setNumber = setIndex + 1 }
    }

    mutating func applyVariant(_ variant: TrainingExecutionVariant?, to exerciseId: String, catalog: [TrainingLoggerCatalogExercise]) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }) else { return }
        exercises[index].executionVariant = variant
        refreshPreviousPerformance(at: index, catalog: catalog)
    }

    mutating func applyProgressionSuggestion(to exerciseId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }),
              let recommendation = exercises[index].progressionRecommendation,
              recommendation.hasExplicitTarget,
              let suggestedReps = recommendation.suggestedReps,
              let suggestedLoad = recommendation.suggestedLoad else { return }
        exercises[index].progressionChoice = .suggestion
        for setIndex in exercises[index].sets.indices {
            exercises[index].sets[setIndex].reps = suggestedReps
            exercises[index].sets[setIndex].load = suggestedLoad
            exercises[index].sets[setIndex].isCompleted = false
        }
    }

    mutating func keepPreviousPerformance(for exerciseId: String) {
        guard let index = exercises.firstIndex(where: { $0.id == exerciseId }),
              let previous = exercises[index].previousPerformance,
              !previous.sets.isEmpty else { return }
        exercises[index].progressionChoice = .previous
        for setIndex in exercises[index].sets.indices {
            let source = previous.sets[min(setIndex, previous.sets.count - 1)]
            exercises[index].sets[setIndex].reps = source.reps
            exercises[index].sets[setIndex].load = source.weight
            exercises[index].sets[setIndex].durationSeconds = source.durationSeconds
            exercises[index].sets[setIndex].isCompleted = false
        }
    }

    mutating func setSuperset(firstId: String, secondId: String, catalog: [TrainingLoggerCatalogExercise]) {
        guard firstId != secondId,
              exercises.contains(where: { $0.id == firstId }),
              exercises.contains(where: { $0.id == secondId }) else { return }
        relationships.removeAll { $0.memberExerciseIds.contains(firstId) || $0.memberExerciseIds.contains(secondId) }
        relationships.append(.init(id: UUID().uuidString, relationshipType: "superset", memberExerciseIds: [firstId, secondId]))
        if let first = exercises.firstIndex(where: { $0.id == firstId }) { refreshPreviousPerformance(at: first, catalog: catalog) }
        if let second = exercises.firstIndex(where: { $0.id == secondId }) { refreshPreviousPerformance(at: second, catalog: catalog) }
    }

    mutating func removeSuperset(containing exerciseId: String, catalog: [TrainingLoggerCatalogExercise]) {
        let affected = relationships.first(where: { $0.memberExerciseIds.contains(exerciseId) })?.memberExerciseIds ?? []
        relationships.removeAll { $0.memberExerciseIds.contains(exerciseId) }
        for id in affected {
            if let index = exercises.firstIndex(where: { $0.id == id }) { refreshPreviousPerformance(at: index, catalog: catalog) }
        }
    }

    mutating func swapExercise(id: String, with replacement: TrainingLoggerCatalogExercise) {
        guard let index = exercises.firstIndex(where: { $0.id == id }),
              !exercises.contains(where: { $0.id != id && $0.canonicalExerciseId == replacement.canonicalExerciseId }) else { return }
        let previous = comparablePerformance(for: replacement, variant: nil, relationship: relationshipContext(for: id))
        exercises[index].canonicalExerciseId = replacement.canonicalExerciseId
        exercises[index].name = replacement.name
        exercises[index].areaId = replacement.areaId
        exercises[index].measurement = replacement.measurement
        exercises[index].executionVariant = nil
        exercises[index].previousPerformance = previous
        exercises[index].progressionRecommendation = previous == nil ? nil : replacement.progressionRecommendation
        exercises[index].progressionChoice = previous == nil || replacement.progressionRecommendation == nil ? nil : .previous
        exercises[index].sets = previous?.sets.enumerated().map { TrainingLoggerDraftSet(source: $0.element, number: $0.offset + 1) }
            ?? (1...3).map(TrainingLoggerDraftSet.empty)
        exercises[index].isProvisional = false
        exercises[index].provenance = nil
    }

    func relationshipContext(for exerciseId: String) -> TrainingExerciseRelationshipContext? {
        guard let group = relationships.first(where: { $0.memberExerciseIds.contains(exerciseId) }) else { return nil }
        let partners = group.memberExerciseIds.compactMap { id in id == exerciseId ? nil : exercises.first(where: { $0.id == id }) }
        return .init(
            relationshipType: group.relationshipType,
            partnerNames: partners.map(\.name),
            partnerCanonicalExerciseIds: partners.compactMap(\.canonicalExerciseId)
        )
    }

    func summary() -> TrainingLoggerSummary {
        .init(exerciseCount: exercises.count, completedSetCount: completedSetCount, variantCount: variantCount, supersetCount: supersetCount)
    }

    func validationMessages() -> [String] {
        exercises.flatMap { exercise in
            exercise.sets.filter(\.isCompleted).compactMap { $0.validationMessage(for: exercise.measurement) }
        }
    }

    private func comparablePerformance(
        for item: TrainingLoggerCatalogExercise,
        variant: TrainingExecutionVariant?,
        relationship: TrainingExerciseRelationshipContext?
    ) -> TrainingLoggerPreviousPerformance? {
        guard let occurrence = TrainingExerciseHistoryCalculator.previousComparableOccurrence(
            in: item.historyOccurrences,
            before: workoutDate,
            executionVariant: variant,
            relationship: relationship
        ) else { return nil }
        let context = [occurrence.exercise.executionVariant?.label, occurrence.relationship?.label].compactMap { $0 }.joined(separator: " · ")
        return .init(workoutDate: occurrence.sessionDate, sets: occurrence.exercise.sets, contextLabel: context.isEmpty ? "Ordinary · Standalone" : context)
    }

    private mutating func refreshPreviousPerformance(at index: Int, catalog: [TrainingLoggerCatalogExercise]) {
        guard let canonicalId = exercises[index].canonicalExerciseId,
              let item = catalog.first(where: { $0.canonicalExerciseId == canonicalId }) else {
            exercises[index].previousPerformance = nil
            return
        }
        exercises[index].previousPerformance = comparablePerformance(
            for: item,
            variant: exercises[index].executionVariant,
            relationship: relationshipContext(for: exercises[index].id)
        )
        let relationship = relationshipContext(for: exercises[index].id)
        let canRecommend = exercises[index].previousPerformance != nil
            && exercises[index].executionVariant == nil
            && relationship == nil
        exercises[index].progressionRecommendation = canRecommend ? item.progressionRecommendation : nil
        exercises[index].progressionChoice = exercises[index].progressionRecommendation == nil ? nil : .previous
    }
}

enum TrainingLoggerNumericFieldKind: String, Equatable {
    case reps
    case load
    case duration
}

struct TrainingLoggerNumericFieldTarget: Equatable, Identifiable {
    var exerciseId: String
    var setId: String
    var kind: TrainingLoggerNumericFieldKind
    var id: String { "\(exerciseId)|\(setId)|\(kind.rawValue)" }
}

enum TrainingLoggerNumericFocusOrder {
    static func targets(for draft: TrainingLoggerDraft) -> [TrainingLoggerNumericFieldTarget] {
        draft.exercises.flatMap { exercise in
            exercise.sets.flatMap { set -> [TrainingLoggerNumericFieldTarget] in
                switch exercise.measurement {
                case .repsLoad:
                    return [
                        .init(exerciseId: exercise.id, setId: set.id, kind: .reps),
                        .init(exerciseId: exercise.id, setId: set.id, kind: .load),
                    ]
                case .bodyweightReps:
                    return [.init(exerciseId: exercise.id, setId: set.id, kind: .reps)]
                case .duration:
                    return [.init(exerciseId: exercise.id, setId: set.id, kind: .duration)]
                }
            }
        }
    }

    static func next(after id: String, in draft: TrainingLoggerDraft) -> String? {
        let ids = targets(for: draft).map(\.id)
        guard let index = ids.firstIndex(of: id), ids.indices.contains(index + 1) else { return nil }
        return ids[index + 1]
    }

    static func previous(before id: String, in draft: TrainingLoggerDraft) -> String? {
        let ids = targets(for: draft).map(\.id)
        guard let index = ids.firstIndex(of: id), index > ids.startIndex else { return nil }
        return ids[index - 1]
    }
}
