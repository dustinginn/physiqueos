import Foundation

@Observable
@MainActor
final class TrainingSessionDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingSessionDetailReadModel?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI
    private let sessionId: String

    init(api: TrainingAPI, sessionId: String) {
        self.api = api
        self.sessionId = sessionId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingSession(sessionId: sessionId))
        } catch {
            state = .failed("This session could not be loaded.")
        }
    }
}
