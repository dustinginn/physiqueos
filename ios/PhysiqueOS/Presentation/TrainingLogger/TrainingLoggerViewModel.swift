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
    /// The app-scoped owner of in-progress sessions. This view model only
    /// selects a session and commands it; it never holds its own mutable
    /// copy, so nothing it writes can overwrite a newer change (for example
    /// a future Live Activity intent).
    let sessionAuthority: TrainingSessionAuthority
    private let attachmentStore: TrainingLoggerAttachmentStore
    let authority: NativeAPIEnvironment
    private let now: @Sendable () -> Date

    var loadState: LoadState = .loading
    var configuration: TrainingLoggerConfiguration?
    /// The session this screen shows, by identity.
    private var selectedDraftId: String?
    /// A finished workout shown on Workout Complete. It no longer exists in
    /// the authority (the Server owns it after a durable commit).
    private var completedDraft: TrainingLoggerDraft?

    /// The selected session as the authority currently holds it.
    /// Assigning is a compatibility path: `nil` deselects; a draft is
    /// written through the authority as a whole-draft replacement.
    var draft: TrainingLoggerDraft? {
        get {
            if let completedDraft { return completedDraft }
            return selectedDraftId.flatMap { sessionAuthority.draft(id: $0) }
        }
        set {
            completedDraft = nil
            guard let newValue else {
                selectedDraftId = nil
                return
            }
            guard newValue.step != .complete else {
                completedDraft = newValue
                selectedDraftId = newValue.id
                return
            }
            selectedDraftId = newValue.id
            noteRejection(sessionAuthority.replace(newValue))
        }
    }

    var savedDrafts: [TrainingLoggerDraft] { canWrite ? sessionAuthority.drafts : [] }
    /// Canonical performance records the just-completed session established,
    /// as reported by the Server. Empty when there are none or they are not
    /// known; Native never computes them.
    var completedPerformanceRecords: [TrainingPerformanceRecord] = [] {
        didSet { if completedPerformanceRecords.isEmpty { completedPerformanceRecordsDraftId = nil } }
    }
    /// The completion whose Server records are actually known (an empty list
    /// can mean "none earned" or "not read yet"; only this tells them apart).
    private var completedPerformanceRecordsDraftId: String?
    private var completedPerformanceRecordsReadDraftId: String?
    /// Compatibility for older presentation/tests. New flows always select
    /// an exact draft identity from `savedDrafts`.
    var savedDraft: TrainingLoggerDraft? { savedDrafts.first }
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
    var processingMessage: String?
    private var durabilityRecoveryTasks: [String: Task<Void, Never>] = [:]
    private let durabilityRecoveryMaxAttempts: Int
    private let durabilityRecoveryDelay: Duration
    /// When the current Finish wait began (a commit attempt, a joined
    /// finish, or durability recovery). After `stillSavingThreshold` the
    /// screen says so honestly and offers a same-key Retry; there is never a
    /// destructive Cancel for a confirmed Finish.
    private(set) var finishWaitStartedAt: Date?
    static let stillSavingThreshold: TimeInterval = 20
    private var submitTask: Task<Void, Never>?
    private var submitToken = UUID()
    private var authorityObservation: TrainingSessionObservation?
    private let backgroundScheduler: (any BackgroundTaskScheduling)?

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
        draftStore: TrainingLoggerDraftStore? = nil,
        sessionAuthority: TrainingSessionAuthority? = nil,
        attachmentStore: TrainingLoggerAttachmentStore = FileTrainingLoggerAttachmentStore(),
        authority: NativeAPIEnvironment = .sandbox,
        durabilityRecoveryMaxAttempts: Int = 30,
        durabilityRecoveryDelay: Duration = .seconds(2),
        backgroundScheduler: (any BackgroundTaskScheduling)? = nil,
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.api = api
        self.writeAPI = writeAPI
        self.catalogWriteAPI = catalogWriteAPI
        // The app passes its app-scoped authority. A bare store (tests,
        // previews) gets a private authority over that store, which is what
        // a fresh process does on relaunch.
        self.sessionAuthority = sessionAuthority ?? TrainingSessionAuthority(
            store: draftStore ?? MemoryTrainingLoggerDraftStore(), environment: authority, now: now
        )
        self.attachmentStore = attachmentStore
        self.authority = authority
        self.durabilityRecoveryMaxAttempts = durabilityRecoveryMaxAttempts
        self.durabilityRecoveryDelay = durabilityRecoveryDelay
        self.backgroundScheduler = backgroundScheduler
        self.now = now
        // A finish committed by another owner (a Watch Finish, or recovery)
        // lands this screen on Workout Complete instead of an empty Logger.
        authorityObservation = self.sessionAuthority.observeChanges { [weak self] change in
            self?.noteAuthorityChange(change)
        }
    }

    private func noteAuthorityChange(_ change: TrainingSessionChange) {
        // A finish committed elsewhere that came back ambiguous (accepted /
        // result unknown) while this screen is open gets the same honest
        // recovery (and Still saving / Retry) as this screen's own commit.
        if change.sessionId == selectedDraftId, completedDraft == nil,
           let current = sessionAuthority.draft(id: change.sessionId),
           current.submissionState != nil, durabilityRecoveryTasks[current.id] == nil,
           !sessionAuthority.isSubmitting(sessionId: current.id), authority == .founderProduction {
            scheduleDurabilityRecovery(for: current)
        }
        guard change.kind == .ended(.committed), completedDraft == nil,
              selectedDraftId == change.sessionId,
              let pending = sessionAuthority.pendingCompletion(id: change.sessionId)
        else { return }
        presentRecoveredCompletion(pending)
    }

    func load() async {
        guard configuration == nil else { return }
        do {
            configuration = try await api.fetchConfiguration()
            if canWrite { sessionAuthority.reloadFromStore() }
            // An unacknowledged durable completion (left behind a tab switch
            // or a relaunch) is presented again and its Server-owned records
            // re-read. Only the exact pending identity can come back; an
            // acknowledged or historical workout never replays.
            var recoveredCompletions: [TrainingLoggerDraft] = canWrite
                ? sessionAuthority.pendingCompletion().map { [$0] } ?? []
                : []
            if authority == .founderProduction {
                for candidate in savedDrafts {
                    if await writeAPI.isDraftAlreadyDurable(candidate) {
                        // Only the caller that actually ends the session runs
                        // its cleanup, so two screens recovering the same
                        // draft never reconcile its evidence twice. Only a
                        // draft from the explicit submitted-command lifecycle
                        // becomes a pending presentation; an older residue
                        // must not replay as a surprise after an upgrade.
                        // A confirmed finish (one operation stamped) is the
                        // explicit lifecycle too, even when no reply arrived.
                        guard sessionAuthority.endCommittedSession(
                            sessionId: candidate.id,
                            retainingPresentation: candidate.submissionState != nil
                                || candidate.watchFinishOperationId != nil
                        ).isAccepted else { continue }
                        // Exact deterministic identity/fingerprint proof
                        // clears only this residue. Same-date/category sibling
                        // drafts remain independent and untouched. Attached
                        // evidence still owns a separate exact-target
                        // reconciliation, so never delete its bytes merely
                        // because the structured session became durable while
                        // the app was away.
                        if candidate.supportingEvidenceAssets.isEmpty {
                            attachmentStore.removeAll(draftId: candidate.id)
                        } else {
                            Task { [writeAPI] in
                                await writeAPI.reconcileSupportingEvidenceAfterCommit(for: candidate)
                            }
                        }
                        recoveredCompletions.append(candidate)
                    } else if candidate.submissionState != nil {
                        scheduleDurabilityRecovery(for: candidate)
                    }
                }
            }
            if let recovered = TrainingSessionAuthority.sorted(recoveredCompletions).first {
                presentRecoveredCompletion(recovered)
            }
            loadState = .loaded
        } catch {
            loadState = .failed("Workout Logger couldn't be loaded. Try again.")
        }
    }

    func start(mode: TrainingLoggerMode, date: Date = Date()) {
        guard canWrite else { return }
        let workoutDate = Self.dateKey(date)
        let startedAt = mode == .live ? ISO8601DateFormatter().string(from: date) : nil
        completedPerformanceRecords = []
        completedDraft = nil
        selectedDraftId = sessionAuthority.startSession(mode: mode, workoutDate: workoutDate, startedAt: startedAt)?.id
        validationMessage = selectedDraftId == nil ? "This workout couldn't be saved on this device. Try again." : nil
    }

    func resume() {
        guard let savedDraft else { return }
        resume(draftId: savedDraft.id)
    }

    /// Shows Workout Complete for a completion that is already durable and
    /// re-reads its records from the Server (never from local state).
    private func presentRecoveredCompletion(_ recovered: TrainingLoggerDraft) {
        var completed = recovered
        completed.step = .complete
        completed.submissionState = nil
        completedDraft = completed
        selectedDraftId = completed.id
        completedPerformanceRecords = []
        processingMessage = nil
        loadCompletedPerformanceRecords(for: completed, commitResult: nil)
    }

    func resume(draftId: String) {
        guard canWrite else { return }
        if completedDraft?.id == draftId {
            refreshCompletedPerformanceRecordsIfUnknown()
            return
        }
        completedPerformanceRecords = []
        completedDraft = nil
        guard sessionAuthority.draft(id: draftId) != nil else {
            selectedDraftId = nil
            // The Log tab routes to an unacknowledged completion by its id.
            if let pending = sessionAuthority.pendingCompletion(id: draftId) {
                presentRecoveredCompletion(pending)
            }
            return
        }
        selectedDraftId = draftId
        validationMessage = nil
        noteRejection(sessionAuthority.resume(sessionId: draftId))
        if draft?.supportingEvidenceAssets.isEmpty == false,
           draft?.supportingWorkouts == nil {
            update { $0.addSupportingEvidence([]) }
        }
    }

    func discardSavedDraft() {
        guard let savedDraft else { return }
        discardSavedDraft(draftId: savedDraft.id)
    }

    func discardSavedDraft(draftId: String) {
        guard canWrite else { return }
        guard savedDrafts.contains(where: { $0.id == draftId }) else { return }
        // Refused while a commit for it is in flight; files are removed only
        // once the authority actually ended it.
        guard sessionAuthority.endSession(sessionId: draftId, reason: .discarded).isAccepted else {
            validationMessage = "This workout is being saved and can't be discarded right now."
            return
        }
        attachmentStore.removeAll(draftId: draftId)
        if draft?.id == draftId { draft = nil }
    }

    /// Explicit escape hatch after a confirmed Finish has returned a
    /// definite failure. The authority preserves the finish operation in a
    /// `discardedAfterFinish` terminal record, so a paired Watch still saves
    /// its HealthKit workout while the unsaved structured draft is removed.
    var canDiscardFailedConfirmedFinish: Bool {
        isFinishConfirmed && !isSubmitting && !isAwaitingDurability && validationMessage != nil
    }

    func discardFailedConfirmedFinish() {
        guard canDiscardFailedConfirmedFinish, let draftId = draft?.id else { return }
        discardSavedDraft(draftId: draftId)
    }

    func cancelWorkout() {
        guard canWrite, !isFinishConfirmed else { return }
        if let draftId = draft?.id {
            guard sessionAuthority.endSession(sessionId: draftId, reason: .cancelled).isAccepted else { return }
            attachmentStore.removeAll(draftId: draftId)
        }
        draft = nil
        completedPerformanceRecords = []
        validationMessage = nil
    }

    /// Structural Logger edit, applied by the authority to its current
    /// draft (never to a copy held here).
    func update(_ mutation: (inout TrainingLoggerDraft) -> Void) {
        guard canWrite, completedDraft == nil, !isFinishConfirmed, let selectedDraftId,
              sessionAuthority.draft(id: selectedDraftId) != nil else { return }
        validationMessage = nil
        noteRejection(sessionAuthority.edit(sessionId: selectedDraftId, mutation))
    }

    /// Set-row checkmark. `completed` is the end state the row asked for,
    /// so a tap rendered before a newer change cannot invert it.
    func setCompletion(exerciseId: String, setId: String, completed: Bool) {
        guard canWrite, completedDraft == nil, !isFinishConfirmed, let selectedDraftId else { return }
        validationMessage = nil
        noteRejection(sessionAuthority.setCompletion(
            sessionId: selectedDraftId, exerciseId: exerciseId, setId: setId, completed: completed
        ))
    }

    func setValue(exerciseId: String, setId: String, field: TrainingSessionSetField, value: Double?) {
        guard canWrite, completedDraft == nil, !isFinishConfirmed, let selectedDraftId else { return }
        validationMessage = nil
        noteRejection(sessionAuthority.setValue(
            sessionId: selectedDraftId, exerciseId: exerciseId, setId: setId, field: field, value: value
        ))
    }

    func setReadyForWatch(_ ready: Bool) {
        guard canWrite, completedDraft == nil, let selectedDraftId else { return }
        validationMessage = nil
        let outcome = sessionAuthority.setReadyForWatch(sessionId: selectedDraftId, ready: ready)
        noteRejection(outcome)
        if case .rejected = outcome {
            validationMessage = "Finish preparing the workout before making it available on Watch."
        }
    }

    /// Only a failed device write is worth telling the Founder about; the
    /// screen already reflects authoritative state for every other outcome.
    private func noteRejection(_ outcome: TrainingSessionMutationOutcome) {
        if outcome == .rejected(.persistenceFailed) {
            validationMessage = "This change couldn't be saved on this device. Try again."
        }
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

    /// Shows Workout Complete and ends the session. `source` is the draft
    /// that was committed (the screen's own selection may already have been
    /// ended by another screen's recovery). Returns whether this call ended
    /// the session; only that caller owns cleanup and evidence reconciliation.
    @discardableResult
    func completeLocalCapture(source: TrainingLoggerDraft? = nil) -> Bool {
        guard canWrite else { return false }
        guard var draft = source ?? draft else { return false }
        draft.step = .complete
        completedDraft = draft
        selectedDraftId = draft.id
        let ended = sessionAuthority.endCommittedSession(sessionId: draft.id, retainingPresentation: true).isAccepted
        // When supporting evidence is attached, its files stay on disk until
        // `reconcileSupportingEvidenceAfterCommit` (running in the
        // background, after this returns) has read them — it owns deleting
        // them once done. With nothing attached, clean up immediately as
        // before.
        if ended, draft.supportingEvidenceAssets.isEmpty {
            attachmentStore.removeAll(draftId: draft.id)
        }
        return ended
    }

    /// The Finish button. Owns the attempt so `retryFinish` can replace it.
    func finish() {
        guard submitTask == nil else { return }
        startSubmitTask(after: nil)
    }

    /// Same-key Retry for a Finish that is taking too long. The abandoned
    /// attempt's request may still land; the Server can only replay its
    /// original receipt, because the retry carries the same persisted
    /// idempotency identity. Never discards anything.
    func retryFinish() {
        if let draft, draft.submissionState != nil {
            retryDurabilityRecovery(for: draft)
            return
        }
        let previous = submitTask
        previous?.cancel()
        startSubmitTask(after: previous)
    }

    private func startSubmitTask(after previous: Task<Void, Never>?) {
        let token = UUID()
        submitToken = token
        submitTask = Task { [weak self] in
            await previous?.value
            await self?.submit()
            if self?.submitToken == token { self?.submitTask = nil }
        }
    }

    var isStillSaving: Bool { isStillSaving(at: now()) }

    func isStillSaving(at date: Date) -> Bool {
        guard let started = finishWaitStartedAt, isSubmitting || isAwaitingDurability else { return false }
        return date.timeIntervalSince(started) >= Self.stillSavingThreshold
    }

    func submit() async {
        guard canWrite, completedDraft == nil, let sessionId = draft?.id, !isSubmitting else { return }
        // A confirmed finish is frozen (its payload is the idempotency
        // identity), so it must be committable before anything is stamped.
        if authority == .founderProduction, let current = draft,
           let problem = writeAPI.localValidationError(for: current) {
            validationMessage = problem.errorDescription
            return
        }
        isSubmitting = true
        finishWaitStartedAt = now()
        refreshWarning = nil
        defer {
            isSubmitting = false
            if draft?.submissionState == nil { finishWaitStartedAt = nil }
        }
        // Own the commit BEFORE stamping the finish: stamping publishes a
        // change synchronously, and the background finish coordinator must
        // see this interactive Finish already holding the one submission
        // lock (otherwise it would take the commit over). Another owner
        // already committing this exact finish (a Watch Finish, recovery,
        // another screen) is joined rather than refused.
        if !sessionAuthority.beginSubmission(sessionId: sessionId) {
            guard await joinInFlightSubmission(sessionId: sessionId),
                  sessionAuthority.beginSubmission(sessionId: sessionId)
            else { return }
        }
        defer { sessionAuthority.endSubmission(sessionId: sessionId) }
        if draft?.mode == .live {
            // Stamps `finishedAt` and the session's one finish operation
            // only the first time (reusing a Watch-confirmed one); always
            // ends rest. A refused stamp stops here: committing without the
            // persisted window would change the idempotency signature on
            // retry. For a Watch-started workout the stamped operation is
            // what makes the Watch end and save its HealthKit workout.
            if draft?.finishedAt == nil { validationMessage = nil }
            let stamped = sessionAuthority.confirmPhoneFinish(
                sessionId: sessionId, finishedAt: ISO8601DateFormatter().string(from: now())
            )
            noteRejection(stamped)
            guard stamped.isAccepted else {
                if validationMessage == nil { validationMessage = "This workout couldn't be finished. Try again." }
                return
            }
        }
        validationMessage = nil
        guard let submittedDraft = draft else { return }
        guard authority == .founderProduction else {
            completeLocalCapture()
            return
        }
        if let scheduler = backgroundScheduler {
            // Finish is usually tapped right before the phone is locked.
            _ = try? await withBackgroundExecutionAssertion(
                named: "training-finish-submit", scheduler: scheduler
            ) { await commitSubmission(submittedDraft) }
        } else {
            await commitSubmission(submittedDraft)
        }
    }

    /// A confirmed finish (one operation stamped, not yet durable) is frozen
    /// on this phone too: no set edits, structural edits, Cancel or Save &
    /// Leave, so the committed payload (and its idempotency key) can never
    /// change between attempts. Retry is the normal action; after a definite
    /// failed attempt, the user may explicitly discard through the guarded
    /// `discardedAfterFinish` path above.
    var isFinishConfirmed: Bool {
        guard let draft, completedDraft == nil else { return false }
        return draft.watchFinishOperationId != nil && draft.step != .complete
    }

    /// Waits while another owner commits `sessionId`. Returns `true` when
    /// that owner stopped without proving durability and this Finish should
    /// commit itself (same key); `false` when it finished (or was cancelled).
    private func joinInFlightSubmission(sessionId: String) async -> Bool {
        while !Task.isCancelled {
            if sessionAuthority.draft(id: sessionId) == nil {
                if completedDraft == nil, let pending = sessionAuthority.pendingCompletion(id: sessionId) {
                    presentRecoveredCompletion(pending)
                }
                return false
            }
            if !sessionAuthority.isSubmitting(sessionId: sessionId) { return true }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return false
    }

    private func commitSubmission(_ submittedDraft: TrainingLoggerDraft) async {
        let sessionId = submittedDraft.id
        let committed: TrainingCommitResult
        do {
            let result = try await writeAPI.commit(submittedDraft)
            committed = result
            guard result.isDurable else {
                let state: TrainingLoggerSubmissionState = result.status == "accepted_processing"
                    ? .acceptedProcessing : .resultUnknown
                noteRejection(sessionAuthority.setSubmissionState(sessionId: sessionId, state))
                processingMessage = state == .acceptedProcessing
                    ? "Finishing workout… PhysiqueOS has accepted it. You can safely leave while it finishes."
                    : "Checking workout… Keep this saved draft while PhysiqueOS verifies the result. You do not need to retry."
                if let pending = self.draft { scheduleDurabilityRecovery(for: pending) }
                return
            }
        } catch {
            // Retry replaced this attempt; it reports nothing.
            if Task.isCancelled { return }
            // The mutation itself did not reach canonical success — this is
            // the only branch allowed to report the submission as failed,
            // and the only one that leaves the draft in place. The confirmed
            // finish keeps its operation, so Retry (or background recovery)
            // reuses the same idempotency identity.
            validationMessage = (error as? LocalizedError)?.errorDescription ?? "This workout could not be saved."
            return
        }
        // `commit` returning means the canonical write is already durable.
        // Nothing past this point may retroactively report the submission
        // as failed or resurrect the local draft — nothing after this point
        // is authoritative over that.
        let ended = completeLocalCapture(source: submittedDraft)
        loadCompletedPerformanceRecords(for: submittedDraft, commitResult: committed)
        // Reconciling any attached supporting evidence happens entirely in
        // the background, after the durable commit above and after
        // navigation to the completion screen — never blocking either one.
        // If an attach-time prewarm is already interpreting the same
        // screenshots, wait for that instead of starting a redundant,
        // duplicate interpretation.
        let pendingPrewarm = evidencePrewarmTask
        if ended {
            Task { [writeAPI] in
                _ = await pendingPrewarm?.value
                await writeAPI.reconcileSupportingEvidenceAfterCommit(for: submittedDraft)
            }
        }
        do {
            configuration = try await api.fetchConfiguration()
        } catch {
            // Non-destructive: the workout is already saved. A later screen
            // load will retry this same read.
            refreshWarning = "Workout saved. Some details may be out of date until you return to Training."
        }
    }

    var isAwaitingDurability: Bool { draft?.submissionState != nil }

    private func scheduleDurabilityRecovery(for candidate: TrainingLoggerDraft, commitImmediately: Bool = false) {
        guard durabilityRecoveryTasks[candidate.id] == nil else { return }
        let maxAttempts = durabilityRecoveryMaxAttempts
        let recoveryDelay = durabilityRecoveryDelay
        if finishWaitStartedAt == nil { finishWaitStartedAt = now() }
        let token = UUID()
        durabilityRecoveryTokens[candidate.id] = token
        durabilityRecoveryTasks[candidate.id] = Task { [weak self, writeAPI] in
            defer {
                if self?.durabilityRecoveryTokens[candidate.id] == token {
                    self?.durabilityRecoveryTasks[candidate.id] = nil
                    self?.durabilityRecoveryTokens[candidate.id] = nil
                }
            }
            for attempt in 0..<maxAttempts {
                guard !Task.isCancelled else { return }
                if await writeAPI.isDraftAlreadyDurable(candidate) {
                    self?.resolveDurableDraft(candidate)
                    return
                }
                // Reuse the exact persisted idempotency identity to resolve
                // an ambiguous acknowledgement. This can only replay the
                // original command; it cannot create a sibling session.
                if attempt > 0 || commitImmediately, let result = try? await writeAPI.commit(candidate), result.isDurable {
                    self?.resolveDurableDraft(candidate, commitResult: result)
                    return
                }
                do { try await Task.sleep(for: recoveryDelay) }
                catch { return }
            }
        }
    }

    private var durabilityRecoveryTokens: [String: UUID] = [:]

    /// Retry from "Still saving": restart recovery now, committing at once
    /// with the same persisted idempotency identity.
    private func retryDurabilityRecovery(for candidate: TrainingLoggerDraft) {
        durabilityRecoveryTasks[candidate.id]?.cancel()
        durabilityRecoveryTasks[candidate.id] = nil
        durabilityRecoveryTokens[candidate.id] = nil
        finishWaitStartedAt = now()
        scheduleDurabilityRecovery(for: candidate, commitImmediately: true)
    }

    private func resolveDurableDraft(
        _ candidate: TrainingLoggerDraft,
        commitResult: TrainingCommitResult? = nil
    ) {
        // Only the caller that actually ends the session owns its cleanup.
        let ended = sessionAuthority.endCommittedSession(sessionId: candidate.id, retainingPresentation: true).isAccepted
        if ended, candidate.supportingEvidenceAssets.isEmpty {
            attachmentStore.removeAll(draftId: candidate.id)
        }
        if draft?.id == candidate.id || selectedDraftId == candidate.id {
            var completed = candidate
            completed.step = .complete
            completed.submissionState = nil
            completedDraft = completed
            selectedDraftId = completed.id
            completedPerformanceRecords = []
            processingMessage = nil
            finishWaitStartedAt = nil
            loadCompletedPerformanceRecords(for: candidate, commitResult: commitResult)
        }
        guard ended else { return }
        Task { [writeAPI] in
            await writeAPI.reconcileSupportingEvidenceAfterCommit(for: candidate)
        }
    }

    /// The only local acknowledgement boundary for a durable completion.
    /// Until this is called, the exact completed draft remains recoverable so
    /// its authoritative Server records can be re-read after navigation or a
    /// process restart.
    func acknowledgeCompletion() {
        guard canWrite, let completedDraft else { return }
        sessionAuthority.acknowledgeCompletion(sessionId: completedDraft.id)
        self.completedDraft = nil
        selectedDraftId = nil
        completedPerformanceRecords = []
    }

    /// Save & Leave: keep the workout, and stop the Log tab routing into it.
    func saveAndLeave() {
        guard canWrite, completedDraft == nil, !isFinishConfirmed, let selectedDraftId,
              sessionAuthority.draft(id: selectedDraftId) != nil else { return }
        noteRejection(sessionAuthority.saveAndLeave(
            sessionId: selectedDraftId, leftAt: ISO8601DateFormatter().string(from: now())
        ))
    }

    /// Uses only the authoritative commit/read contract. The draft identity
    /// guard prevents a late read for an earlier completion from leaking its
    /// records into a newly started or resumed workout.
    private func loadCompletedPerformanceRecords(
        for completedDraft: TrainingLoggerDraft,
        commitResult: TrainingCommitResult?
    ) {
        if let records = commitResult?.performanceRecords, records.isAuthoritative {
            applyCompletedPerformanceRecords(records.records, draftId: completedDraft.id)
            return
        }
        // A Watch-originated finish already received the Server's records in
        // its own commit (or read-back); they travel with the completion.
        if let records = completedDraft.watchAuthoritativePerformanceRecords {
            applyCompletedPerformanceRecords(records, draftId: completedDraft.id)
            return
        }
        readCompletedPerformanceRecords(for: completedDraft)
    }

    private func readCompletedPerformanceRecords(for completedDraft: TrainingLoggerDraft) {
        guard completedPerformanceRecordsReadDraftId != completedDraft.id else { return }
        completedPerformanceRecordsReadDraftId = completedDraft.id
        Task { [weak self, writeAPI] in
            let records = await writeAPI.sessionPerformanceRecords(for: completedDraft)
            guard let self else { return }
            if self.completedPerformanceRecordsReadDraftId == completedDraft.id {
                self.completedPerformanceRecordsReadDraftId = nil
            }
            guard let records else { return }
            self.applyCompletedPerformanceRecords(records, draftId: completedDraft.id)
        }
    }

    /// Re-reads the Server records for the shown completion while they are
    /// still unknown (a read that failed while the app was suspended after a
    /// Watch Finish). Called when Workout Complete appears or the app becomes
    /// active; a known list (including a known empty one) is never re-read.
    func refreshCompletedPerformanceRecordsIfUnknown() {
        guard let completedDraft, completedDraft.step == .complete,
              completedPerformanceRecordsDraftId != completedDraft.id
        else { return }
        loadCompletedPerformanceRecords(for: completedDraft, commitResult: nil)
    }

    private func applyCompletedPerformanceRecords(
        _ records: [TrainingPerformanceRecord],
        draftId: String
    ) {
        guard draft?.id == draftId, draft?.step == .complete else { return }
        completedPerformanceRecords = records
        completedPerformanceRecordsDraftId = draftId
    }

    /// Every accepted mutation is already durable when the authority
    /// publishes it, so there is nothing left to flush. Kept for the view's
    /// `onDisappear` hook and older call sites; it never writes.
    func persist() {}

    var availableCategorySuggestion: TrainingLoggerCategorySuggestion? {
        guard let draft, let suggestion = configuration?.categorySuggestion,
              suggestion.date == draft.workoutDate,
              !suggestion.categoryIds.isEmpty,
              suggestion.categoryIds.allSatisfy({ id in configuration?.areas.contains(where: { $0.id == id }) == true })
        else { return nil }
        return suggestion
    }

    var isCategorySuggestionAccepted: Bool {
        guard let suggestion = availableCategorySuggestion, let draft else { return false }
        return draft.selectedAreaIds.count == suggestion.categoryIds.count &&
            Set(draft.selectedAreaIds) == Set(suggestion.categoryIds)
    }

    func acceptCategorySuggestion() {
        guard let suggestion = availableCategorySuggestion else { return }
        update { $0.selectedAreaIds = suggestion.categoryIds }
    }

    func savedDraftPresentation(_ draft: TrainingLoggerDraft) -> SavedDraftPresentation {
        let categoryIds = draft.selectedAreaIds.isEmpty
            ? Array(Set(draft.exercises.map(\.areaId))).sorted()
            : draft.selectedAreaIds
        let labels = categoryIds.map(areaLabel)
        let category = labels.isEmpty ? nil : labels.joined(separator: " + ")
        let count = draft.exercises.count
        let exerciseText = count == 0 ? nil : "\(count) exercise\(count == 1 ? "" : "s")"
        return SavedDraftPresentation(
            date: Self.displayDate(draft.workoutDate),
            time: Self.displayTime(draft.startedAt),
            detail: [category, exerciseText].compactMap { $0 }.joined(separator: " · ")
        )
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

    struct SavedDraftPresentation: Equatable {
        var date: String
        var time: String?
        var detail: String
    }

    private static func displayDate(_ value: String) -> String {
        let input = DateFormatter()
        input.locale = Locale(identifier: "en_US_POSIX")
        input.calendar = Calendar(identifier: .gregorian)
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: value) else { return value }
        let output = DateFormatter()
        output.locale = Locale(identifier: "en_US")
        output.dateFormat = "MMM d"
        return output.string(from: date)
    }

    private static func displayTime(_ value: String?) -> String? {
        guard let value, let date = ISO8601DateFormatter().date(from: value) else { return nil }
        let output = DateFormatter()
        output.locale = Locale(identifier: "en_US")
        output.timeStyle = .short
        output.dateStyle = .none
        return output.string(from: date)
    }

    func isSelected(_ exercise: TrainingLoggerCatalogExercise) -> Bool {
        draft?.exercises.contains(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) == true
    }

    func toggleExerciseSelection(_ exercise: TrainingLoggerCatalogExercise) {
        guard let draft else { return }
        if let selectedExercise = draft.exercises.first(where: { $0.canonicalExerciseId == exercise.canonicalExerciseId }) {
            update { [catalog = configuration?.exercises ?? []] in $0.removeExercise(id: selectedExercise.id, catalog: catalog) }
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
