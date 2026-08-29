import SwiftUI

/// The single place every `NavigationStack`'s
/// `.navigationDestination(for: AppDestination.self)` resolves through —
/// Home, Log, and Evidence all share this one router instead of three
/// independently-guessed switch statements, so a destination that gains a
/// real screen (Training history/day/session today) renders identically no
/// matter which tab pushed it. A destination without a real screen yet
/// falls through to the existing `DestinationPlaceholderView`.
struct AppDestinationRouterView: View {
    let destination: AppDestination

    var body: some View {
        switch destination {
        case .trainingSession(let sessionId):
            TrainingSessionDetailView(sessionId: sessionId)
        case .trainingDay(let date):
            TrainingDayView(date: date)
        case .progressStream(let streamId) where streamId == "training":
            TrainingHistoryView()
        // All 10 canonical Training Areas are fixture-backed (see
        // TrainingFixture.json's `areas` array) — `TrainingAreaView` is
        // fully generic over `areaId` and already renders an honest empty
        // "Browse" section for an area with zero exercises (matching real
        // web behavior). An individual exercise leaf (drilling into one
        // exercise from inside an area, e.g. "bench-press") uses this exact
        // same `.trainingExercise` case with a non-area id, and now routes
        // to the real Exercise Detail/history screen instead of a
        // placeholder.
        case .trainingExercise(let exerciseId) where TrainingAreaIcon.canonicalAreaIds.contains(exerciseId):
            TrainingAreaView(areaId: exerciseId)
        case .trainingExercise(let exerciseId):
            TrainingExerciseDetailView(exerciseId: exerciseId)
        default:
            DestinationPlaceholderView(destination: destination)
        }
    }
}
