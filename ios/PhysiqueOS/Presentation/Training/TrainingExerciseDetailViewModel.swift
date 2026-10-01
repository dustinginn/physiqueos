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
    /// Training's own real default context — see `TrainingScopeDefault`.
    private(set) var scope: EvidenceScopeSelection = TrainingScopeDefault.selection
    private let api: TrainingAPI
    private let exerciseId: String

    init(api: TrainingAPI, exerciseId: String) {
        self.api = api
        self.exerciseId = exerciseId
    }

    func load() async {
        // See ActivityHistoryViewModel.load: a stale-scope response is dropped.
        let requestedScope = scope
        do {
            let value = try await api.fetchTrainingExercise(exerciseId: exerciseId, scope: requestedScope)
            guard requestedScope == scope else { return }
            state = .loaded(value)
        } catch {
            guard requestedScope == scope else { return }
            state = .failed("This exercise could not be loaded.")
        }
    }

    /// Same shared-chronology adoption as every other Evidence vertical's
    /// `selectScope` — genuinely re-fetches Current Benchmark/Last Session/
    /// Recent History for the newly selected Goal/Phase window rather than
    /// leaving the selector inert.
    func selectScope(pillID: String) async {
        guard let selection = EvidenceScopeSelection(pillID: pillID), selection != scope else { return }
        scope = selection
        await load()
    }
}
