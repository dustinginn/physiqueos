import Foundation

/// Mirrors `getTrainingSessionExerciseRenderItems`
/// (`src/screens/TrainingKnowledgeScreen.jsx:804-826`): walks a session's
/// exercises in order, grouping members of the same
/// `exerciseRelationshipGroups` entry (superset) into one render item and
/// leaving standalone exercises as their own item — so superset members
/// render together, once, in their original order, rather than as
/// independent rows.
enum TrainingSessionRenderItem: Identifiable {
    case exercise(TrainingExerciseOccurrence)
    case relationship(group: TrainingExerciseRelationshipGroup, exercises: [TrainingExerciseOccurrence])

    var id: String {
        switch self {
        case .exercise(let exercise): exercise.id
        case .relationship(let group, _): group.id
        }
    }
}

enum TrainingSessionExerciseGrouping {
    static func renderItems(for session: TrainingSessionDetailReadModel) -> [TrainingSessionRenderItem] {
        let exercisesById = Dictionary(uniqueKeysWithValues: session.exercises.map { ($0.id, $0) })
        var groupByExerciseId: [String: TrainingExerciseRelationshipGroup] = [:]
        for group in session.exerciseRelationshipGroups {
            for memberId in group.memberExerciseIds {
                groupByExerciseId[memberId] = group
            }
        }

        var items: [TrainingSessionRenderItem] = []
        var emittedGroupIds: Set<String> = []

        for exercise in session.exercises {
            guard let group = groupByExerciseId[exercise.id] else {
                items.append(.exercise(exercise))
                continue
            }
            guard !emittedGroupIds.contains(group.id) else { continue }
            emittedGroupIds.insert(group.id)
            let members = group.memberExerciseIds.compactMap { exercisesById[$0] }
            items.append(.relationship(group: group, exercises: members))
        }

        return items
    }
}
