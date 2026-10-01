import Foundation

@Observable
@MainActor
final class TrainingAreaViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingAreaReadModel?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI
    private let areaId: String
    private(set) var scope: EvidenceScopeSelection = TrainingScopeDefault.selection
    private(set) var browseAll: Bool
    private var loadGeneration = 0

    init(api: TrainingAPI, areaId: String, browseAll: Bool = false) {
        self.api = api
        self.areaId = areaId
        self.browseAll = browseAll
    }

    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        do {
            let area = try await api.fetchTrainingLibraryArea(areaId: areaId, scope: scope, browseAll: browseAll)
            guard generation == loadGeneration else { return }
            state = .loaded(area)
        } catch {
            guard generation == loadGeneration else { return }
            state = .failed("This training area could not be loaded.")
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
