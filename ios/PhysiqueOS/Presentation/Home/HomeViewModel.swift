import Foundation

/// Loads the Home read model through the injected `HomeAPI` seam and holds
/// it for `HomeView`. No caching, retry, or offline behavior is
/// implemented here — Stage 1 is online-authoritative and this is a
/// fixture load, not production networking (see
/// docs/PHYSIQUEOS_NATIVE_V1.md, section 25).
@Observable
@MainActor
final class HomeViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(HomeReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: HomeAPI
    /// The shared Priority engine — `todaysFocus` is computed from here,
    /// not from the static Home fixture, so it can never drift from what
    /// the Priority detail screen and Morning Check-In show for the same
    /// occurrence ids (see `PriorityReadModel.swift`'s doc comment).
    private let priorityStore: LoggingSandboxStore
    /// The shared Goals engine — after a fixture Goal Transition, the
    /// active primary goal's identity can change (a new goal id replaces
    /// the completed one). Home's primary Goal row is projected from here
    /// rather than the static Home fixture so it never points at a goal
    /// id that no longer exists.
    private let goalsSandboxStore: GoalsSandboxStore

    init(api: HomeAPI, priorityStore: LoggingSandboxStore, goalsSandboxStore: GoalsSandboxStore) {
        self.api = api
        self.priorityStore = priorityStore
        self.goalsSandboxStore = goalsSandboxStore
    }

    func load(now: Date = Date()) async {
        do {
            var home = try await api.fetchHome()
            home.todaysFocus = priorityStore.todaysPriorities(now: now)
            home.goals = Self.projectPrimaryGoal(home.goals, from: goalsSandboxStore.hub.activeGoal)
            state = .loaded(home)
        } catch {
            state = .failed("Home could not be loaded.")
        }
    }

    /// Re-reads only `todaysFocus` from the shared store — called after a
    /// Home inline completion so the tapped row's state updates without a
    /// full re-fetch of the rest of Home.
    func refreshTodaysFocus(now: Date = Date()) {
        guard case .loaded(var home) = state else { return }
        home.todaysFocus = priorityStore.todaysPriorities(now: now)
        state = .loaded(home)
    }

    /// Replaces the identity (`id`/`title`/`destination`) of whichever
    /// Home goal row is presented as `.primary` with the Goals engine's
    /// current active goal — everything else about that row (icon, color,
    /// and the numeric current/target/unit display) stays as the Home
    /// fixture already renders it, since a brand-new transitioned goal
    /// has no evidence-derived numbers of its own yet and Home does not
    /// compute those independently.
    private static func projectPrimaryGoal(_ goals: [HomeGoal], from activeGoal: GoalSummaryReadModel) -> [HomeGoal] {
        guard let index = goals.firstIndex(where: { if case .primary = $0.presentation { true } else { false } }) else { return goals }
        var updated = goals
        updated[index].id = activeGoal.id
        updated[index].title = activeGoal.title
        updated[index].destination = activeGoal.destination
        return updated
    }
}
