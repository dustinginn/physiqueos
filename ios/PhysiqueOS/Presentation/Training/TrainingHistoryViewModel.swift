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
    private let api: TrainingAPI

    init(api: TrainingAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingLanding())
        } catch {
            state = .failed("Training could not be loaded.")
        }
    }
}
