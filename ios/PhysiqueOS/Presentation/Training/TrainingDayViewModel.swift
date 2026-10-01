import Foundation

@Observable
@MainActor
final class TrainingDayViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingDayReadModel?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI
    private let date: String

    init(api: TrainingAPI, date: String) {
        self.api = api
        self.date = date
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingDay(date: date))
        } catch {
            state = .failed("This training day could not be loaded.")
        }
    }
}
