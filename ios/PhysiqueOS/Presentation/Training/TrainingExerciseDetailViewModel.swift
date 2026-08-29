import Foundation

@Observable
@MainActor
final class TrainingExerciseDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(TrainingExerciseDetailReadModel?)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: TrainingAPI
    private let exerciseId: String

    init(api: TrainingAPI, exerciseId: String) {
        self.api = api
        self.exerciseId = exerciseId
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchTrainingExercise(exerciseId: exerciseId))
        } catch {
            state = .failed("This exercise could not be loaded.")
        }
    }
}
