import Foundation

/// Mirrors `HomeViewModel`'s pattern exactly: loads the read model through
/// the injected `LogAPI` seam and holds it for `LogView`. No caching,
/// retry, or offline behavior in this fixture-only slice.
@Observable
@MainActor
final class LogViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(LogReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: LogAPI

    init(api: LogAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchLog())
        } catch {
            state = .failed("Log could not be loaded.")
        }
    }

    /// Identity of the reviews currently shown as Processing, nil when none. A
    /// change restarts the bounded refresh; nil means there is nothing to wait for.
    var processingKey: String? {
        guard case .loaded(let log) = state, let processing = log.processingEvidenceReviews, !processing.isEmpty else { return nil }
        return processing.map(\.id).sorted().joined(separator: ",")
    }

    /// One quiet refresh while Processing is showing: never flips the screen back to
    /// a spinner, and a transient failure keeps the last good state.
    func refreshWhileProcessing() async -> ProcessingRefreshOutcome {
        if let refreshed = try? await api.refreshLog() { state = .loaded(refreshed) }
        return processingKey == nil ? .finished : .waiting
    }
}
