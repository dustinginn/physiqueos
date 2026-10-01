import Foundation

@Observable
@MainActor
final class DEXAHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(DEXAReportReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private(set) var scope: EvidenceScopeSelection = DEXAScopeDefault.selection
    private let api: DEXAAPI

    init(api: DEXAAPI) {
        self.api = api
    }

    func load() async {
        // See ActivityHistoryViewModel.load: a stale-scope response is dropped.
        let requestedScope = scope
        do {
            let value = try await api.fetchDEXAReport(scope: requestedScope)
            guard requestedScope == scope else { return }
            state = .loaded(value)
        } catch {
            guard requestedScope == scope else { return }
            state = .failed("DEXA could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
