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
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Sandbox-only compatibility. Founder Production receives its exact
    /// occurrence-bound Weight relationship inside the Priority detail.
    private(set) var morningCheckIn: MorningCheckInReadModel?
    private let api: PriorityAPI
    private let morningCheckInAPI: MorningCheckInAPI
    private let store: LoggingSandboxStore
    private let authority: NativeAPIEnvironment
    private let priorityId: String
    private let occurrenceDate: String?

    init(api: PriorityAPI, morningCheckInAPI: MorningCheckInAPI, store: LoggingSandboxStore, authority: NativeAPIEnvironment, priorityId: String, occurrenceDate: String? = nil) {
        self.api = api
        self.morningCheckInAPI = morningCheckInAPI
        self.store = store
        self.authority = authority
        self.priorityId = priorityId
        self.occurrenceDate = occurrenceDate
    }

    func load() async {
        if authority == .sandbox {
            state = .loaded(store.priorityOccurrence(id: priorityId))
            return
        }
        do {
            state = .loaded(try await api.fetchPriority(priorityId: priorityId, occurrenceDate: occurrenceDate))
        } catch {
            state = .failed("This priority could not be loaded. Pull to refresh and try again.")
        }
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
