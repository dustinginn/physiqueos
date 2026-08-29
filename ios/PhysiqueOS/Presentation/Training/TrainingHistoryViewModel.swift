import Foundation

@Observable
@MainActor
final class TrainingHistoryViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingHistoryReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI

    init(api: TrainingAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingHistory())
        } catch {
            state = .failed("Training history could not be loaded.")
        }
    }
}
