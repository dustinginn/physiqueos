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
    private(set) var browseAll = false
    private var loadGeneration = 0

    init(api: TrainingAPI) {
        self.api = api
    }

    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        let requestedScope = scope
        let requestedBrowseAll = browseAll
        do {
            let landing = try await api.fetchTrainingLibrary(scope: requestedScope, browseAll: requestedBrowseAll)
            guard generation == loadGeneration else { return }
            state = .loaded(landing)
        } catch {
            guard generation == loadGeneration else { return }
            state = .failed("Training Library could not be loaded.")
        }
    }

    func selectCatalog(browseAll: Bool) async {
        guard browseAll != self.browseAll else { return }
        self.browseAll = browseAll
        state = .loading
        await load()
    }

    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
