import ActivityKit
import Foundation

/// A running Workout Live Activity as the coordinator sees it.
struct WorkoutLiveActivitySnapshot: Equatable {
    enum Lifecycle: Equatable {
        case active, stale, ended, dismissed, pending
    }
    var id: String
    var attributes: WorkoutActivityAttributes
    var state: WorkoutActivityAttributes.ContentState
    var lifecycle: Lifecycle

    var isLive: Bool { lifecycle == .active || lifecycle == .stale || lifecycle == .pending }
}

enum WorkoutLiveActivityDismissal: Equatable {
    case immediate
    case after(Date)
}

enum WorkoutLiveActivityRequestError: Error, Equatable {
    /// Live Activities are turned off for this app.
    case disabled
    /// ActivityKit only starts an activity while the app is foreground.
    case notForeground
    case failed(String)
}

/// The ActivityKit seam. The coordinator is written and tested against this
/// protocol; `ActivityKitWorkoutLiveActivityClient` is the only real
/// implementation, and local updates are the only transport (no push).
@MainActor
protocol WorkoutLiveActivityClient: AnyObject {
    var areActivitiesEnabled: Bool { get }
    func activities() -> [WorkoutLiveActivitySnapshot]
    func request(
        attributes: WorkoutActivityAttributes,
        state: WorkoutActivityAttributes.ContentState,
        staleDate: Date?
    ) throws -> String
    func update(id: String, state: WorkoutActivityAttributes.ContentState, staleDate: Date?) async
    func end(
        id: String,
        state: WorkoutActivityAttributes.ContentState?,
        dismissal: WorkoutLiveActivityDismissal
    ) async
}

@MainActor
final class ActivityKitWorkoutLiveActivityClient: WorkoutLiveActivityClient {
    var areActivitiesEnabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

    func activities() -> [WorkoutLiveActivitySnapshot] {
        Activity<WorkoutActivityAttributes>.activities.map(Self.snapshot)
    }

    func request(
        attributes: WorkoutActivityAttributes,
        state: WorkoutActivityAttributes.ContentState,
        staleDate: Date?
    ) throws -> String {
        guard areActivitiesEnabled else { throw WorkoutLiveActivityRequestError.disabled }
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: staleDate),
                pushType: nil
            )
            return activity.id
        } catch let error as ActivityAuthorizationError {
            switch error {
            case .visibility: throw WorkoutLiveActivityRequestError.notForeground
            case .denied, .unsupported, .unsupportedTarget, .unentitled: throw WorkoutLiveActivityRequestError.disabled
            default: throw WorkoutLiveActivityRequestError.failed("\(error)")
            }
        } catch {
            throw WorkoutLiveActivityRequestError.failed("\(error)")
        }
    }

    func update(id: String, state: WorkoutActivityAttributes.ContentState, staleDate: Date?) async {
        await Self.performUpdate(id: id, state: state, staleDate: staleDate)
    }

    func end(id: String, state: WorkoutActivityAttributes.ContentState?, dismissal: WorkoutLiveActivityDismissal) async {
        await Self.performEnd(id: id, state: state, dismissal: dismissal)
    }

    // `Activity` is not Sendable, so look it up and await it entirely off
    // the main actor instead of sending it across the isolation boundary.
    private nonisolated static func performUpdate(
        id: String, state: WorkoutActivityAttributes.ContentState, staleDate: Date?
    ) async {
        guard let activity = Activity<WorkoutActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
        await activity.update(ActivityContent(state: state, staleDate: staleDate))
    }

    private nonisolated static func performEnd(
        id: String, state: WorkoutActivityAttributes.ContentState?, dismissal: WorkoutLiveActivityDismissal
    ) async {
        guard let activity = Activity<WorkoutActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
        let policy: ActivityUIDismissalPolicy = {
            switch dismissal {
            case .immediate: .immediate
            case .after(let date): .after(date)
            }
        }()
        await activity.end(state.map { ActivityContent(state: $0, staleDate: nil) }, dismissalPolicy: policy)
    }

    private static func snapshot(_ activity: Activity<WorkoutActivityAttributes>) -> WorkoutLiveActivitySnapshot {
        let lifecycle: WorkoutLiveActivitySnapshot.Lifecycle
        switch activity.activityState {
        case .active: lifecycle = .active
        case .stale: lifecycle = .stale
        case .ended: lifecycle = .ended
        case .dismissed: lifecycle = .dismissed
        case .pending: lifecycle = .pending
        @unknown default: lifecycle = .ended
        }
        return WorkoutLiveActivitySnapshot(
            id: activity.id, attributes: activity.attributes, state: activity.content.state, lifecycle: lifecycle
        )
    }
}
