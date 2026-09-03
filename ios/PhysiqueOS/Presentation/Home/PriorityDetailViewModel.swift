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
    private let store: LoggingSandboxStore
    private let priorityId: String

    init(store: LoggingSandboxStore, priorityId: String) {
        self.store = store
        self.priorityId = priorityId
    }

    func load() {
        state = .loaded(store.priorityOccurrence(id: priorityId))
    }

    /// `completePriority` (`src/app/priorities/[priorityId]/actions.js`) —
    /// evidence-aware when the occurrence carries a completion context
    /// (dose/protocol), a plain completion otherwise, matching the real
    /// server's own branch exactly.
    func complete() {
        guard case .loaded(.some(let occurrence)) = state else { return }
        store.completePriority(occurrenceId: occurrence.id, context: occurrence.completionContext)
        load()
    }
}
