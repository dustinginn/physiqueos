import Foundation

/// Reads/writes through the same shared `LoggingSandboxStore` Home and
/// Morning Check-In use — never a second, independently-fetched Priority
/// projection. See `PriorityReadModel.swift`'s type-level doc comment.
@Observable
@MainActor
final class PriorityDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(PriorityOccurrence?)
    }

    private(set) var state: LoadState = .loading
    private let api: PriorityAPI
    private let store: LoggingSandboxStore
    private let authority: NativeAPIEnvironment
    private let priorityId: String

    init(api: PriorityAPI, store: LoggingSandboxStore, authority: NativeAPIEnvironment, priorityId: String) {
        self.api = api
        self.store = store
        self.authority = authority
        self.priorityId = priorityId
    }

    func load() async {
        if authority == .sandbox {
            state = .loaded(store.priorityOccurrence(id: priorityId))
            return
        }
        state = .loaded(try? await api.fetchPriority(priorityId: priorityId))
    }

    /// `completePriority` (`src/app/priorities/[priorityId]/actions.js`) —
    /// evidence-aware when the occurrence carries a completion context
    /// (dose/protocol), a plain completion otherwise, matching the real
    /// server's own branch exactly.
    func complete() {
        guard (try? NativeProductWriteGuard.authorize(.priorityCompletion, in: authority)) != nil else { return }
        guard case .loaded(.some(let occurrence)) = state else { return }
        store.completePriority(occurrenceId: occurrence.id, context: occurrence.completionContext)
        state = .loaded(store.priorityOccurrence(id: priorityId))
    }
}
