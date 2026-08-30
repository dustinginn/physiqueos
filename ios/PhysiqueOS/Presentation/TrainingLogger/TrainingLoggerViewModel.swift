import Foundation

@MainActor
@Observable
final class TrainingLoggerViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private let api: TrainingLoggerAPI
    private let draftStore: TrainingLoggerDraftStore

    var loadState: LoadState = .loading
    var configuration: TrainingLoggerConfiguration?
    var draft: TrainingLoggerDraft?
    var savedDraft: TrainingLoggerDraft?
    var searchText = ""
    var isBrowsingAllExercises = false
    var validationMessage: String?

    init(api: TrainingLoggerAPI, draftStore: TrainingLoggerDraftStore) {
        self.api = api
        self.draftStore = draftStore
    }

    func load() async {
        guard configuration == nil else { return }
        do {
            configuration = try await api.fetchConfiguration()
            savedDraft = draftStore.load()
            loadState = .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func start(mode: TrainingLoggerMode, date: Date = Date()) {
        let workoutDate = mode == .live ? Self.dateKey(Date()) : Self.dateKey(date)
        draft = .fresh(mode: mode, workoutDate: workoutDate)
        validationMessage = nil
        persist()
    }

    func resume() {
        draft = savedDraft
        validationMessage = nil
    }

    func discardSavedDraft() {
        draftStore.discard()
        savedDraft = nil
        draft = nil
    }

    func cancelWorkout() {
        draftStore.discard()
        savedDraft = nil
        draft = nil
        validationMessage = nil
    }

    func update(_ mutation: (inout TrainingLoggerDraft) -> Void) {
        guard var draft else { return }
        mutation(&draft)
        self.draft = draft
        validationMessage = nil
        persist()
    }

    func go(to step: TrainingLoggerStep) {
        update { $0.step = step }
    }

    func continueFromAreas() {
        guard let draft, !draft.selectedAreaIds.isEmpty else {
            validationMessage = "Select at least one Training Area."
            return
        }
        go(to: .exercises)
    }

    func continueFromExercises() {
        guard let draft, !draft.exercises.isEmpty else {
            validationMessage = "Add at least one exercise."
            return
        }
        go(to: .workout)
    }

    func reviewWorkout() {
        guard let draft else { return }
        guard draft.completedSetCount > 0 else {
            validationMessage = "Complete at least one valid set before review."
            return
        }
        let messages = draft.validationMessages()
        guard messages.isEmpty else {
            validationMessage = messages[0]
            return
        }
        go(to: .summary)
    }

    func completeLocalCapture() {
        guard var draft else { return }
        draft.step = .complete
        self.draft = draft
        draftStore.discard()
        savedDraft = nil
    }

    func persist() {
        guard let draft, draft.step != .complete else { return }
        draftStore.save(draft)
        savedDraft = draft
    }

    func pickerExercises() -> [TrainingLoggerCatalogExercise] {
        guard let draft, let configuration else { return [] }
        return draft.pickerExercises(in: configuration.exercises, browseAll: isBrowsingAllExercises, query: searchText)
    }

    func areaLabel(_ id: String) -> String {
        configuration?.areas.first(where: { $0.id == id })?.label ?? id.capitalized
    }

    func isSelected(_ exercise: TrainingLoggerCatalogExercise) -> Bool {
        draft?.exercises.contains(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) == true
    }

    var selectionPresentation: TrainingLoggerSelectionPresentation {
        TrainingLoggerSelectionPresentation(draft: draft)
    }

    var workoutPresentation: TrainingLoggerWorkoutPresentation? {
        draft.map(TrainingLoggerWorkoutPresentation.init)
    }

    static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

struct TrainingLoggerSelectionPresentation: Equatable {
    var selectedCount: Int
    var startTitle: String
    var canStart: Bool

    init(draft: TrainingLoggerDraft?) {
        selectedCount = draft?.exercises.count ?? 0
        startTitle = "Start logging · \(selectedCount) selected"
        canStart = selectedCount > 0
    }
}

struct TrainingLoggerWorkoutPresentation: Equatable {
    var eyebrow: String
    var context: String
    var progress: String
    var completedSetCount: Int
    var totalSetCount: Int
    var canFinish: Bool

    init(_ draft: TrainingLoggerDraft) {
        let exerciseLabel = "\(draft.exercises.count) exercise\(draft.exercises.count == 1 ? "" : "s")"
        eyebrow = draft.mode == .live ? "Workout in progress" : "Past workout entry"
        context = draft.mode == .live
            ? "Started now · \(exerciseLabel)"
            : "\(draft.workoutDate) · \(exerciseLabel)"
        completedSetCount = draft.completedSetCount
        totalSetCount = draft.totalSetCount
        progress = "\(completedSetCount)/\(totalSetCount) sets"
        canFinish = completedSetCount > 0 && draft.validationMessages().isEmpty
    }
}
