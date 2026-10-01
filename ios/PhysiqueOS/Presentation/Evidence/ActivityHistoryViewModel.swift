import Foundation

@Observable
@MainActor
final class ActivityHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(ActivityLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Activity's own real default context (Build Lean Mass, matching
    /// Weight/Nutrition — see `ActivityAPI.fetchActivityLanding()`'s doc
    /// comment).
    private(set) var scope: EvidenceScopeSelection = ActivityScopeDefault.selection
    private let api: ActivityAPI

    init(api: ActivityAPI) {
        self.api = api
    }

    func load() async {
        // A reload that finishes after the Founder picked another scope must
        // not overwrite the newer scope's content (view models now survive
        // reappearance, so a reappearance reload can overlap a scope change).
        let requestedScope = scope
        do {
            let value = try await api.fetchActivityLanding(scope: requestedScope)
            guard requestedScope == scope else { return }
            state = .loaded(value)
        } catch {
            guard requestedScope == scope else { return }
            state = .failed("Activity could not be loaded.")
        }
    }

    /// Same shared-chronology adoption as `TrainingHistoryViewModel.selectScope`.
    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
