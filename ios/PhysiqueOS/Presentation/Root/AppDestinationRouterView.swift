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
        default:
            DestinationPlaceholderView(destination: destination)
        }
    }
}
