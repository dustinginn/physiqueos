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

    init(api: HomeAPI, priorityStore: LoggingSandboxStore) {
        self.api = api
        self.priorityStore = priorityStore
    }

    func load(now: Date = Date()) async {
        do {
            var home = try await api.fetchHome()
            home.todaysFocus = priorityStore.todaysPriorities(now: now)
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
}
