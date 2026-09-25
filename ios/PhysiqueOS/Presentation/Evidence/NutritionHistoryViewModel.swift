import Foundation

@Observable
@MainActor
final class NutritionHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(NutritionLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Nutrition's own real default context (Build Lean Mass, matching
    /// Weight/Activity — see `NutritionAPI.fetchNutritionLanding()`'s doc
    /// comment).
    private(set) var scope: EvidenceScopeSelection = NutritionScopeDefault.selection
    private let api: NutritionAPI

    init(api: NutritionAPI) {
        self.api = api
    }

    func load() async {
        // See ActivityHistoryViewModel.load: a stale-scope response is dropped.
        let requestedScope = scope
        do {
            let value = try await api.fetchNutritionLanding(scope: requestedScope)
            guard requestedScope == scope else { return }
            state = .loaded(value)
        } catch {
            guard requestedScope == scope else { return }
            state = .failed("Nutrition could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
