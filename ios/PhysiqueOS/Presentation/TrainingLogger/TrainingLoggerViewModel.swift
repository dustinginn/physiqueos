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
    private let writeAPI: TrainingWriteAPI
    private let draftStore: TrainingLoggerDraftStore
    private let attachmentStore: TrainingLoggerAttachmentStore
    let authority: NativeAPIEnvironment

    var loadState: LoadState = .loading
    var configuration: TrainingLoggerConfiguration?
    var draft: TrainingLoggerDraft?
    var savedDraft: TrainingLoggerDraft?
    var searchText = ""
    var isBrowsingAllExercises = false
    var validationMessage: String?
    var isSubmitting = false
    /// Set only when a workout already committed canonically but a
    /// subsequent, non-authoritative refresh (e.g. `fetchConfiguration()`)
    /// failed. Never implies the workout itself needs to be resubmitted.
    var refreshWarning: String?

    /// Interprets attached supporting-evidence screenshots as soon as they
    /// are attached, so the wait `submit()` would otherwise hit at Finish is
    /// normally already satisfied. Each new attachment chains after the
    /// previous prewarm rather than racing it, so the cached binding always
    /// ends up reflecting the most recently attached asset set, never an
    /// earlier, incomplete one that happened to finish last.
    private var evidencePrewarmTask: Task<Void, Never>?

    init(
        api: TrainingLoggerAPI,
        writeAPI: TrainingWriteAPI = NotAvailableTrainingWriteAPI(),
        draftStore: TrainingLoggerDraftStore,
        attachmentStore: TrainingLoggerAttachmentStore = FileTrainingLoggerAttachmentStore(),
        authority: NativeAPIEnvironment = .sandbox
    ) {
        self.api = api
        self.writeAPI = writeAPI
        self.draftStore = draftStore
        self.attachmentStore = attachmentStore
        self.authority = authority
    }

    func load() async {
        guard configuration == nil else { return }
        do {
            configuration = try await api.fetchConfiguration()
            savedDraft = canWrite ? draftStore.load() : nil
            loadState = .loaded
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func start(mode: TrainingLoggerMode, date: Date = Date()) {
        guard canWrite else { return }
        let workoutDate = mode == .live ? Self.dateKey(Date()) : Self.dateKey(date)
        draft = .fresh(mode: mode, workoutDate: workoutDate)
        validationMessage = nil
        persist()
    }

    func resume() {
        guard canWrite else { return }
        draft = savedDraft
        if draft?.supportingEvidenceAssets.isEmpty == false,
           draft?.supportingWorkouts == nil {
            update { $0.addSupportingEvidence([]) }
        }
        validationMessage = nil
    }

    func discardSavedDraft() {
        guard canWrite else { return }
        if let draftId = savedDraft?.id { attachmentStore.removeAll(draftId: draftId) }
        draftStore.discard()
        savedDraft = nil
        draft = nil
    }

    func cancelWorkout() {
        guard canWrite else { return }
        if let draftId = draft?.id { attachmentStore.removeAll(draftId: draftId) }
        draftStore.discard()
        savedDraft = nil
        draft = nil
        validationMessage = nil
    }

    func update(_ mutation: (inout TrainingLoggerDraft) -> Void) {
        guard canWrite else { return }
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
        update { $0.finishExerciseSelection() }
    }

    func beginAddingExercises() {
        searchText = ""
        isBrowsingAllExercises = false
        update { $0.beginAddingExercises() }
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
        guard canWrite else { return }
        guard var draft else { return }
        draft.step = .complete
        self.draft = draft
        attachmentStore.removeAll(draftId: draft.id)
        draftStore.discard()
        savedDraft = nil
    }

    func submit() async {
        guard canWrite, let draft, !isSubmitting else { return }
        guard authority == .founderProduction else {
            completeLocalCapture()
            return
        }
        isSubmitting = true
        validationMessage = nil
        refreshWarning = nil
        defer { isSubmitting = false }
        // If evidence is still being interpreted from an attachment made
        // moments ago, wait for that same work rather than letting `commit`
        // start a redundant, duplicate interpretation of its own.
        await evidencePrewarmTask?.value
        do {
            _ = try await writeAPI.commit(draft)
        } catch {
            // The mutation itself did not reach canonical success — this is
            // the only branch allowed to report the submission as failed,
            // and the only one that leaves the draft in place.
            validationMessage = (error as? LocalizedError)?.errorDescription ?? "This workout could not be saved."
            return
        }
        // `commit` returning means the canonical write is already durable.
        // Nothing past this point may retroactively report the submission
        // as failed or resurrect the local draft — nothing after this point
        // is authoritative over that.
        completeLocalCapture()
        do {
            configuration = try await api.fetchConfiguration()
        } catch {
            // Non-destructive: the workout is already saved. A later screen
            // load will retry this same read.
            refreshWarning = "Workout saved. Some details may be out of date until you return to Training."
        }
    }

    func persist() {
        guard canWrite else { return }
        guard let draft, draft.step != .complete else { return }
        draftStore.save(draft)
        savedDraft = draft
    }

    func retainSupportingEvidence(assetId: String, data: Data, contentType: String) throws {
        guard let draft, let asset = draft.supportingEvidenceAssets.first(where: { $0.id == assetId }) else {
            throw TrainingLoggerAttachmentStoreError.unavailable
        }
        let reference = try attachmentStore.save(
            data: data, draftId: draft.id, assetId: assetId, displayName: asset.displayName
        )
        update { $0.retainSupportingEvidenceFile(assetId: assetId, reference: reference, contentType: contentType) }
        prewarmSupportingEvidenceIfNeeded()
    }

    func removeSupportingEvidence(assetId: String) {
        guard let reference = draft?.supportingEvidenceAssets.first(where: { $0.id == assetId })?.storageReference else {
            update { $0.removeSupportingEvidence(id: assetId) }
            return
        }
        attachmentStore.remove(reference: reference)
        update { $0.removeSupportingEvidence(id: assetId) }
    }

    /// Fires the write API's best-effort evidence-intake prewarm for the
    /// current draft's full attached asset set, chained after any prewarm
    /// already in flight. Chaining (rather than cancelling) matters because
    /// Swift task cancellation is cooperative and this call still completes
    /// its network work in the background either way — without an explicit
    /// order, a second attachment's prewarm could finish before the first
    /// one and leave an earlier, incomplete binding cached.
    private func prewarmSupportingEvidenceIfNeeded() {
        guard authority == .founderProduction, let draft, !draft.supportingEvidenceAssets.isEmpty else { return }
        let previous = evidencePrewarmTask
        evidencePrewarmTask = Task { [writeAPI] in
            _ = await previous?.value
            await writeAPI.prewarmSupportingEvidence(for: draft)
        }
    }

    func pickerExercises() -> [TrainingLoggerCatalogExercise] {
        guard let draft, let configuration else { return [] }
        return draft.pickerExercises(
            in: configuration.exercises,
            browseAll: isBrowsingAllExercises,
            query: searchText,
            includeAllAreas: draft.isAddingExercises
        )
    }

    func areaLabel(_ id: String) -> String {
        configuration?.areas.first(where: { $0.id == id })?.label ?? PresentationLanguage.displayName(fromIdentifier: id)
    }

    func isSelected(_ exercise: TrainingLoggerCatalogExercise) -> Bool {
        draft?.exercises.contains(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) == true
    }

    func isLockedDuringAdd(_ exercise: TrainingLoggerCatalogExercise) -> Bool {
        draft?.exerciseWasPresentBeforePicker(exercise) == true
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

    var canWrite: Bool {
        (try? NativeProductWriteGuard.authorize(.workoutLogger, in: authority)) != nil
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
