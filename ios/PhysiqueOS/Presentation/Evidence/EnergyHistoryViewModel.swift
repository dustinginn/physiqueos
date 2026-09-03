import Foundation

@Observable
@MainActor
final class EnergyHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(EnergyReportReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Energy's own real default context (Build Lean Mass — see
    /// `EnergyAPI.fetchEnergyReport()`'s doc comment).
    private(set) var scope: EvidenceScopeSelection = EnergyScopeDefault.selection
    private let api: EnergyAPI

    init(api: EnergyAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchEnergyReport(scope: scope))
        } catch {
            state = .failed("Energy could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
