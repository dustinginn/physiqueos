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
        // Chest is the only Training Area with a real screen this slice —
        // establishing the pattern, not every area (task-bounded scope).
        // Every other `.trainingExercise` id (other areas, or an
        // individual exercise leaf) still honestly falls to
        // `DestinationPlaceholderView` below.
        case .trainingExercise(let exerciseId) where exerciseId == "chest":
            TrainingAreaView(areaId: exerciseId)
        default:
            DestinationPlaceholderView(destination: destination)
        }
    }
}
