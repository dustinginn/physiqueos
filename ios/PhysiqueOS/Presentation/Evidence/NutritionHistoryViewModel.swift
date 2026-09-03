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
    /// Nutrition's own real default context ("build-lean-mass", matching
    /// Weight/Activity — see `NutritionAPI.fetchNutritionLanding()`'s doc
    /// comment).
    private(set) var scope: EvidenceScopeID = .buildLeanMass
    private let api: NutritionAPI

    init(api: NutritionAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchNutritionLanding(scope: scope))
        } catch {
            state = .failed("Nutrition could not be loaded.")
        }
    }

    func selectScope(_ scopeID: EvidenceScopeID) async {
        guard scopeID != scope else { return }
        scope = scopeID
        await load()
    }
}
