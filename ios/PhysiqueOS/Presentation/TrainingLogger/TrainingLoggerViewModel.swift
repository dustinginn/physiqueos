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
    private let catalogWriteAPI: TrainingExerciseCatalogWriteAPI
    private let draftStore: TrainingLoggerDraftStore
    private let attachmentStore: TrainingLoggerAttachmentStore
    let authority: NativeAPIEnvironment

    var loadState: LoadState = .loading
    var configuration: TrainingLoggerConfiguration?
    var draft: TrainingLoggerDraft?
    var savedDraft: TrainingLoggerDraft?
    var searchText = ""
    var isBrowsingAllExercises = false
    var isCreatingNewExercise = false
    var newExerciseMessage: String?
    var newExerciseCandidates: [CanonicalExerciseMatch] = []
    var isSubmittingNewExercise = false
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
        catalogWriteAPI: TrainingExerciseCatalogWriteAPI = NotAvailableTrainingExerciseCatalogWriteAPI(),
        draftStore: TrainingLoggerDraftStore,
        attachmentStore: TrainingLoggerAttachmentStore = FileTrainingLoggerAttachmentStore(),
        authority: NativeAPIEnvironment = .sandbox
    ) {
        self.api = api
        self.writeAPI = writeAPI
        self.catalogWriteAPI = catalogWriteAPI
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
            loadState = .failed("Workout Logger couldn't be loaded. Try again.")
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
        // When supporting evidence is attached, its files stay on disk until
        // `reconcileSupportingEvidenceAfterCommit` (running in the
        // background, after this returns) has read them — it owns deleting
        // them once done. With nothing attached, clean up immediately as
        // before.
        if draft.supportingEvidenceAssets.isEmpty {
            attachmentStore.removeAll(draftId: draft.id)
        }
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
        // Reconciling any attached supporting evidence happens entirely in
        // the background, after the durable commit above and after
        // navigation to the completion screen — never blocking either one.
        // If an attach-time prewarm is already interpreting the same
        // screenshots, wait for that instead of starting a redundant,
        // duplicate interpretation.
        let pendingPrewarm = evidencePrewarmTask
        Task { [writeAPI] in
            _ = await pendingPrewarm?.value
            await writeAPI.reconcileSupportingEvidenceAfterCommit(for: draft)
        }
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

    func toggleExerciseSelection(_ exercise: TrainingLoggerCatalogExercise) {
        guard let draft else { return }
        if let selectedExercise = draft.exercises.first(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) {
            update { $0.removeExercise(id: selectedExercise.id) }
            return
        }
        update { $0.addExercise(exercise) }
        addToMyLibraryIfNeeded(exercise)
    }

    /// Selecting from All Exercises immediately and durably adds the
    /// exercise to My Library — even if the Founder backs out of the
    /// workout before performing it. "Explicitly added" is the only
    /// membership signal that can't be inferred from TrainingSession
    /// history, so it must persist the moment the Founder chooses it, not
    /// only on a completed workout.
    private func addToMyLibraryIfNeeded(_ exercise: TrainingLoggerCatalogExercise) {
        guard authority == .founderProduction, !(exercise.inMyLibrary ?? false) else { return }
        Task { [catalogWriteAPI] in
            do {
                try await catalogWriteAPI.addToMyLibrary(canonicalExerciseId: exercise.canonicalExerciseId)
                markInMyLibraryLocally(exercise.canonicalExerciseId)
            } catch {
                validationMessage = "This exercise was selected, but couldn't be added to My Library. Deselect and select it again to retry."
            }
        }
    }

    private func markInMyLibraryLocally(_ canonicalExerciseId: String) {
        guard var configuration else { return }
        guard let index = configuration.exercises.firstIndex(where: { $0.canonicalExerciseId == canonicalExerciseId }) else { return }
        configuration.exercises[index].inMyLibrary = true
        self.configuration = configuration
    }

    /// Create New Exercise. Under Sandbox this is unchanged — a local
    /// provisional exercise pending evidence-review resolution. Under
    /// Founder Production it calls the standalone creation command (full-
    /// catalog duplicate-checked server-side), which — unlike the
    /// sandbox/provisional path — receives one canonical identity and
    /// enters My Library immediately, before any workout completes. A
    /// server-detected duplicate is not an error: the existing exercise is
    /// surfaced for explicit selection; shared-alias candidates are never
    /// silently chosen. Selection durably adds membership before readback.
    func submitNewExercise(name: String, areaId: String) {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, !areaId.isEmpty else { return }
        guard authority == .founderProduction else {
            update { $0.addProvisionalExercise(name: trimmedName, areaId: areaId) }
            return
        }
        isSubmittingNewExercise = true
        newExerciseMessage = nil
        newExerciseCandidates = []
        Task { [catalogWriteAPI] in
            defer { isSubmittingNewExercise = false }
            do {
                let outcome = try await catalogWriteAPI.createExercise(
                    canonicalName: trimmedName, primaryMuscleGroupId: areaId, equipment: nil, aliases: []
                )
                switch outcome {
                case .created(let canonicalExerciseId):
                    try await refreshCatalogAndSelect(canonicalExerciseId: canonicalExerciseId)
                    isCreatingNewExercise = false
                case .duplicate(let existingCanonicalExerciseId, let existingCanonicalExerciseName):
                    newExerciseCandidates = [CanonicalExerciseMatch(id: existingCanonicalExerciseId, name: existingCanonicalExerciseName)]
                    newExerciseMessage = "An existing exercise matches. Choose it to add to My Library and this workout."
                case .candidates(let candidates):
                    newExerciseCandidates = candidates
                    newExerciseMessage = "Choose the matching exercise to add to My Library and this workout."
                }
            } catch {
                newExerciseMessage = "This exercise could not be created. Try again."
            }
        }
    }

    func selectExistingExercise(_ candidate: CanonicalExerciseMatch) async {
        guard authority == .founderProduction, newExerciseCandidates.contains(candidate), !isSubmittingNewExercise else { return }
        isSubmittingNewExercise = true
        defer { isSubmittingNewExercise = false }
        do {
            try await catalogWriteAPI.addToMyLibrary(canonicalExerciseId: candidate.id)
            try await refreshCatalogAndSelect(canonicalExerciseId: candidate.id)
            newExerciseCandidates = []
            isCreatingNewExercise = false
        } catch {
            newExerciseMessage = "Couldn't select this exercise. Try again."
        }
    }

    private func refreshCatalogAndSelect(canonicalExerciseId: String) async throws {
        let refreshed = try await api.fetchConfiguration()
        configuration = refreshed
        guard let exercise = refreshed.exercises.first(where: { $0.canonicalExerciseId == canonicalExerciseId }) else { throw ProductionNativeError.invalidResponse }
        if !isSelected(exercise) { update { $0.addExercise(exercise) } }
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
