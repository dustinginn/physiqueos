import Foundation

@Observable
@MainActor
final class TrainingLibraryRootViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingLandingReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI
    private(set) var scope: EvidenceScopeSelection = TrainingScopeDefault.selection

    init(api: TrainingAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingLanding(scope: scope))
        } catch {
            state = .failed("Training Library could not be loaded.")
        }
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
