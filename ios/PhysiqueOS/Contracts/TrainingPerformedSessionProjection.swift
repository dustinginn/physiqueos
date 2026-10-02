import Foundation

/// The only structured training evidence that may cross the durable Finish
/// boundary. Planned-but-unperformed sets and exercises are deliberately
/// absent. A relationship survives only when at least two of its performed
/// members survive, so a partially performed superset can never turn an
/// unfinished plan into volume, PR, history, or performance evidence.
struct TrainingPerformedSessionProjection: Equatable {
    var exercises: [TrainingLoggerDraftExercise]
    var relationships: [TrainingLoggerDraftRelationship]

    static func make(from draft: TrainingLoggerDraft) -> Self {
        let exercises = draft.exercises.compactMap { exercise -> TrainingLoggerDraftExercise? in
            let completedSets = exercise.sets.filter(\.isCompleted)
            guard !completedSets.isEmpty else { return nil }
            var performed = exercise
            performed.sets = completedSets
            return performed
        }
        let performedExerciseIds = Set(exercises.map(\.id))
        let relationships = draft.relationships.compactMap { relationship -> TrainingLoggerDraftRelationship? in
            let performedMembers = relationship.memberExerciseIds.filter(performedExerciseIds.contains)
            guard performedMembers.count >= 2 else { return nil }
            var performed = relationship
            performed.memberExerciseIds = performedMembers
            return performed
        }
        return .init(exercises: exercises, relationships: relationships)
    }
}
