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

    init(api: HomeAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchHome())
        } catch {
            state = .failed("Home could not be loaded.")
        }
    }
}
