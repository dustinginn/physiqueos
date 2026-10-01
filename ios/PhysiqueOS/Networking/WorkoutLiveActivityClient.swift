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

/// Cancels a client observation.
@MainActor
final class WorkoutLiveActivityObservation {
    private var onCancel: (@MainActor () -> Void)?
    init(onCancel: @escaping @MainActor () -> Void) { self.onCancel = onCancel }
    func cancel() { onCancel?(); onCancel = nil }
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
    /// Reports every activity state change (including activities started by
    /// another process). A dismissed activity may vanish from `activities()`,
    /// so this is how a user swipe-away is actually observed.
    func observeLifecycle(
        _ onChange: @escaping @MainActor (_ activityId: String, _ lifecycle: WorkoutLiveActivitySnapshot.Lifecycle) -> Void
    ) -> WorkoutLiveActivityObservation
    /// Reports Live Activities being turned on or off for the app.
    func observeEnablement(_ onChange: @escaping @MainActor (_ enabled: Bool) -> Void) -> WorkoutLiveActivityObservation
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
            startWatching(activity.id)
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

    private var lifecycleOnChange: (@MainActor (String, WorkoutLiveActivitySnapshot.Lifecycle) -> Void)?
    private var stateWatchers: [String: Task<Void, Never>] = [:]
    private var updatesWatcher: Task<Void, Never>?

    func observeLifecycle(
        _ onChange: @escaping @MainActor (String, WorkoutLiveActivitySnapshot.Lifecycle) -> Void
    ) -> WorkoutLiveActivityObservation {
        lifecycleOnChange = onChange
        for activity in Activity<WorkoutActivityAttributes>.activities { startWatching(activity.id) }
        // Activities started elsewhere (another process); this process's own
        // requests are watched directly from `request`.
        updatesWatcher = Task.detached { [weak self] in
            for await activity in Activity<WorkoutActivityAttributes>.activityUpdates {
                if Task.isCancelled { return }
                let id = activity.id
                await MainActor.run { self?.startWatching(id) }
            }
        }
        return WorkoutLiveActivityObservation { [weak self] in
            self?.updatesWatcher?.cancel()
            self?.updatesWatcher = nil
            self?.stateWatchers.values.forEach { $0.cancel() }
            self?.stateWatchers.removeAll()
            self?.lifecycleOnChange = nil
        }
    }

    private func startWatching(_ id: String) {
        guard stateWatchers[id] == nil, let onChange = lifecycleOnChange else { return }
        stateWatchers[id] = Task.detached { await Self.watchStates(id: id, onChange) }
    }

    func observeEnablement(_ onChange: @escaping @MainActor (Bool) -> Void) -> WorkoutLiveActivityObservation {
        let task = Task.detached {
            for await enabled in ActivityAuthorizationInfo().activityEnablementUpdates {
                if Task.isCancelled { return }
                await MainActor.run { onChange(enabled) }
            }
        }
        return WorkoutLiveActivityObservation { task.cancel() }
    }

    private nonisolated static func watchStates(
        id: String,
        _ onChange: @escaping @MainActor (String, WorkoutLiveActivitySnapshot.Lifecycle) -> Void
    ) async {
        guard let activity = Activity<WorkoutActivityAttributes>.activities.first(where: { $0.id == id }) else { return }
        for await state in activity.activityStateUpdates {
            if Task.isCancelled { return }
            let lifecycle = lifecycle(of: state)
            await MainActor.run { onChange(id, lifecycle) }
        }
    }

    private nonisolated static func lifecycle(of state: ActivityState) -> WorkoutLiveActivitySnapshot.Lifecycle {
        switch state {
        case .active: .active
        case .stale: .stale
        case .ended: .ended
        case .dismissed: .dismissed
        case .pending: .pending
        @unknown default: .ended
        }
    }

    private static func snapshot(_ activity: Activity<WorkoutActivityAttributes>) -> WorkoutLiveActivitySnapshot {
        WorkoutLiveActivitySnapshot(
            id: activity.id, attributes: activity.attributes, state: activity.content.state,
            lifecycle: lifecycle(of: activity.activityState)
        )
    }
}
