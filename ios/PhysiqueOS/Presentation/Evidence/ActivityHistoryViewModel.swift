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
    /// Activity's own real default context ("build-lean-mass", matching
    /// Weight/Nutrition — see `ActivityAPI.fetchActivityLanding()`'s doc
    /// comment).
    private(set) var scope: EvidenceScopeID = .buildLeanMass
    private let api: ActivityAPI

    init(api: ActivityAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchActivityLanding(scope: scope))
        } catch {
            state = .failed("Activity could not be loaded.")
        }
    }

    /// Same shared-chronology adoption as `TrainingHistoryViewModel.selectScope`.
    func selectScope(_ scopeID: EvidenceScopeID) async {
        guard scopeID != scope else { return }
        scope = scopeID
        await load()
    }
}
