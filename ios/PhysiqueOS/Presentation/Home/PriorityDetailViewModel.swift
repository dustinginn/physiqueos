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
    /// Only ever populated for the Morning Weigh-In priority under
    /// Founder Production — `getPriorityDetail` has no weight cross-
    /// reference of its own (`createMorningWeighInPriorityDetail`'s
    /// "Completion" section is static copy, no value/date/id), so this is
    /// a second, explicit read of the `morning-check-in` resource's own
    /// date-matched (never "latest") same-day weight.
    private(set) var morningCheckIn: MorningCheckInReadModel?
    private let api: PriorityAPI
    private let morningCheckInAPI: MorningCheckInAPI
    private let store: LoggingSandboxStore
    private let authority: NativeAPIEnvironment
    private let priorityId: String

    init(api: PriorityAPI, morningCheckInAPI: MorningCheckInAPI, store: LoggingSandboxStore, authority: NativeAPIEnvironment, priorityId: String) {
        self.api = api
        self.morningCheckInAPI = morningCheckInAPI
        self.store = store
        self.authority = authority
        self.priorityId = priorityId
    }

    func load() async {
        if authority == .sandbox {
            state = .loaded(store.priorityOccurrence(id: priorityId))
            return
        }
        let occurrence = try? await api.fetchPriority(priorityId: priorityId)
        state = .loaded(occurrence)
        if let occurrence, PriorityOccurrence.isMorningWeighIn(executionItemId: occurrence.executionItemId, id: occurrence.id) {
            morningCheckIn = try? await morningCheckInAPI.fetchMorningCheckIn()
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
