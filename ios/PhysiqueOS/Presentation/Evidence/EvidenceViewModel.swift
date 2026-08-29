import Foundation

/// Mirrors `HomeViewModel`/`LogViewModel`'s pattern exactly: loads the read
/// model through the injected `EvidenceAPI` seam and holds it for
/// `EvidenceView`.
@Observable
@MainActor
final class EvidenceViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(EvidenceHubReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: EvidenceAPI

    init(api: EvidenceAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchEvidenceHub())
        } catch {
            state = .failed("Evidence could not be loaded.")
        }
    }
}
