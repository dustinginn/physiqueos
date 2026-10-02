import Foundation

enum HomeWidgetNavigationResolution: Equatable {
    case logRoot
    case destination(AppDestination)
    case refreshTotals
    case startWorkout
    case resumeWorkout(sessionId: String)
}

enum HomeWidgetNavigationResolver {
    @MainActor
    static func resolve(
        _ route: HomeWidgetDeepLink,
        selectedAuthority: NativeAPIEnvironment,
        sessionAuthority: TrainingSessionAuthority
    ) -> HomeWidgetNavigationResolution {
        switch route {
        case .summary:
            return .logRoot
        case .training(let localDate):
            return .destination(.trainingDay(date: localDate))
        case .nutrition:
            return .destination(.progressStream(streamId: "nutrition"))
        case .activity(let localDate):
            return .destination(.activityDay(date: localDate))
        case .weight:
            return .destination(.progressStream(streamId: "weight"))
        case .refresh:
            return .refreshTotals
        case .startWorkout, .resumeWorkout:
            // Navigation only. A live workout on the selected authority is
            // always the one reopened (a stale snapshot's Start or an old
            // Resume link must never lead to a second workout); otherwise the
            // Logger opens at its start. Saved-and-left drafts are never
            // auto-resumed.
            if let live = sessionAuthority.activeLiveSession() {
                return .resumeWorkout(sessionId: live.id)
            }
            return .startWorkout
        }
    }
}
