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
        case .startWorkout(let authority):
            guard authority == selectedAuthority.rawValue else { return .startWorkout }
            return .startWorkout
        case .resumeWorkout(let sessionId, let authority):
            guard authority == selectedAuthority.rawValue,
                  sessionAuthority.activeLiveSession()?.id == sessionId
            else { return .startWorkout }
            return .resumeWorkout(sessionId: sessionId)
        }
    }
}
