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
}
