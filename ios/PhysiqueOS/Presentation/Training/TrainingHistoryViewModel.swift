import Foundation

@Observable
@MainActor
final class TrainingHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    /// Training's own real default context ("all" —
    /// `normalizeTrainingContextId`, unlike Weight/Nutrition/Activity's
    /// `.buildLeanMass` default), matching the existing fixture's
    /// `"all"`-selected pill.
    private(set) var scope: EvidenceScopeID = .all
    private let api: TrainingAPI

    init(api: TrainingAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingLanding(scope: scope))
        } catch {
            state = .failed("Training could not be loaded.")
        }
    }

    /// Makes the previously-inert `TrainingScopeSelectorView` pills real:
    /// selecting a scope re-fetches the same fixture, narrowed to that
    /// scope's window — mirroring the web's own full-navigation re-fetch
    /// (`/progress/training?context=...`) with an in-memory reload instead.
    func selectScope(_ scopeID: EvidenceScopeID) async {
        guard scopeID != scope else { return }
        scope = scopeID
        await load()
    }
}
