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

    init(api: TrainingAPI, areaId: String) {
        self.api = api
        self.areaId = areaId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingArea(areaId: areaId))
        } catch {
            state = .failed("This training area could not be loaded.")
        }
    }
}
