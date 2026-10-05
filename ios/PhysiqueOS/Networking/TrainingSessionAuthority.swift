import Foundation
import Observation

/// App-scoped owner of the Workout Logger's in-progress sessions for one
/// Native authority (Sandbox or Founder Production).
///
/// The persisted `TrainingLoggerDraftStore` stays the durable record; this
/// object is its only writer. It holds the authoritative in-memory copy,
/// applies every mutation to that copy on the main actor (so mutations are
/// serialized and none is computed from a stale snapshot), writes the result
/// through the store, and only then publishes it. `TrainingLoggerViewModel`
/// renders and commands this state; a future LiveActivityIntent uses the
/// same typed operations (`completeSet`, `endRest`) with a mutation id and
/// expected revision.
///
/// The Server stays authoritative only after a durable Finish
/// (`TrainingWriteAPI.commit`), which this type does not perform.
@MainActor
@Observable
final class TrainingSessionAuthority {
    let environment: NativeAPIEnvironment
    @ObservationIgnored private let store: TrainingLoggerDraftStore
    @ObservationIgnored private let restPreferences: TrainingRestPreferenceProviding
    @ObservationIgnored private let now: @Sendable () -> Date
    /// Sessions whose Finish commit is in flight. Non-UI origins cannot
    /// change them meanwhile, so the committed payload and the local draft
    /// cannot diverge underneath the request.
    @ObservationIgnored private var submittingSessionIds: Set<String> = []
    /// Sessions ended in this process. A late whole-draft write can never
    /// bring one back.
    @ObservationIgnored private var endedSessionIds: Set<String> = []
    /// Persisted, bounded record of how recent sessions ended (committed with
    /// its finish operation, or cancelled with its Cancel mutation id). It
    /// outlives the draft and a relaunch, so a late Watch command or a still
    /// running Watch HealthKit workout is answered with the real outcome.
    @ObservationIgnored private let terminalLedgerStore: TrainingSessionTerminalLedgerStore
    private(set) var terminalRecords: [TrainingSessionTerminalRecord]

    /// Every saved (editable) draft for this authority, newest first (store
    /// order). Pending completion presentations are held separately.
    private(set) var drafts: [TrainingLoggerDraft]
    /// Durably committed workouts whose Workout Complete presentation the
    /// Founder has not acknowledged yet (`Return to Log`). Read-only records
    /// kept in the same store, so the Server-owned performance records can
    /// be re-read after navigation or a process restart. Never editable,
    /// never a Live Activity subject.
    private(set) var pendingCompletions: [TrainingLoggerDraft]
    /// The most recent accepted change.
    private(set) var lastChange: TrainingSessionChange? {
        didSet { if let lastChange { observers.values.forEach { $0(lastChange) } } }
    }
    @ObservationIgnored private var observers: [UUID: @MainActor (TrainingSessionChange) -> Void] = [:]

    init(
        store: TrainingLoggerDraftStore,
        environment: NativeAPIEnvironment,
        restPreferences: TrainingRestPreferenceProviding = UnsetTrainingRestPreferences(),
        terminalLedger: TrainingSessionTerminalLedgerStore = MemoryTrainingSessionTerminalLedgerStore(),
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.store = store
        self.environment = environment
        self.restPreferences = restPreferences
        self.now = now
        self.terminalLedgerStore = terminalLedger
        self.terminalRecords = TrainingSessionTerminalLedger.pruned(terminalLedger.loadRecords(), now: now())
        let stored = store.loadAll()
        self.drafts = Self.sorted(stored.filter { !$0.isPendingCompletionPresentation })
        self.pendingCompletions = stored.filter(\.isPendingCompletionPresentation)
        // Created at launch: drop stale presentations even if the Logger is
        // never opened again.
        reloadFromStore()
    }

    var canWrite: Bool {
        (try? NativeProductWriteGuard.authorize(.workoutLogger, in: environment)) != nil
    }

    func draft(id: String) -> TrainingLoggerDraft? {
        drafts.first { $0.id == id }
    }

    /// Calls `handler` synchronously after every accepted change (including
    /// the end of a session) on the main actor, after memory and storage
    /// agree. For projections such as the Live Activity coordinator, which
    /// are write-only consumers and never mutate from the callback.
    /// Cancel with the returned token.
    func observeChanges(_ handler: @escaping @MainActor (TrainingSessionChange) -> Void) -> TrainingSessionObservation {
        let id = UUID()
        observers[id] = handler
        return TrainingSessionObservation { [weak self] in self?.observers[id] = nil }
    }

    /// The live session the Log tab routes into (see
    /// `TrainingLoggerDraft.activeLiveSession`).
    func activeLiveSession(at date: Date? = nil) -> TrainingLoggerDraft? {
        TrainingLoggerDraft.activeLiveSession(in: drafts, now: date ?? now())
    }

    /// Re-reads the store. Memory already equals storage because every
    /// accepted mutation is written before it is published; this only picks
    /// up writes made outside the authority (older call sites, tests).
    func reloadFromStore() {
        let all = store.loadAll()
        let stored = Self.sorted(all.filter { !$0.isPendingCompletionPresentation })
        if stored != drafts { drafts = stored }
        var completions = all.filter(\.isPendingCompletionPresentation)
        if canWrite {
            // An unacknowledged presentation older than the in-progress
            // window is stale; its workout is long durable on the Server.
            let expired = completions.filter { !isCurrentPendingCompletion($0) }
            expired.forEach { store.discard(id: $0.id) }
            completions.removeAll { expired.contains($0) }
        }
        if completions != pendingCompletions { pendingCompletions = completions }
    }

    // MARK: - Pending completion presentation

    /// The newest unacknowledged durable completion, if it is recent.
    func pendingCompletion(at date: Date? = nil) -> TrainingLoggerDraft? {
        let reference = date ?? now()
        return TrainingLoggerDraft.pendingCompletion(
            in: pendingCompletions.filter { isCurrentPendingCompletion($0, now: reference) }
        )
    }

    func pendingCompletion(id: String) -> TrainingLoggerDraft? {
        pendingCompletions.first { $0.id == id && isCurrentPendingCompletion($0) }
    }

    /// Where entering the Log tab routes. A live workout in progress always
    /// wins (exactly the Build 77 routing), so the Founder lands in the
    /// workout they are doing. Otherwise an unacknowledged durable
    /// completion is routed back to, so a late performance-record read is
    /// never lost behind a tab switch. The completion stays owed either way
    /// and is shown when the Logger next opens without a live workout.
    func logTabRoutingTarget(at date: Date? = nil) -> TrainingLoggerDraft? {
        let reference = date ?? now()
        return activeLiveSession(at: reference) ?? pendingCompletion(at: reference)
    }

    /// `Return to Log`: the only point that clears a pending presentation.
    /// Idempotent; touches no editable session. It publishes
    /// `.completionAcknowledged` so the paired Watch leaves its summary at
    /// once (the Live Activity already ended with the commit).
    @discardableResult
    func acknowledgeCompletion(sessionId: String) -> Bool {
        guard canWrite, let presentation = pendingCompletions.first(where: { $0.id == sessionId }) else { return false }
        store.discard(id: sessionId)
        pendingCompletions.removeAll { $0.id == sessionId }
        updateTerminalRecord(sessionId: sessionId) {
            $0.acknowledgedAt = TrainingSessionClock.string(from: self.now())
        }
        lastChange = .init(sessionId: sessionId, revision: presentation.currentRevision, kind: .completionAcknowledged)
        return true
    }

    // MARK: - Terminal ledger

    func terminalRecord(sessionId: String) -> TrainingSessionTerminalRecord? {
        terminalRecords.first { $0.sessionId == sessionId }
    }

    /// Recently ended sessions for the paired Watch (newest first).
    func recentlyEndedSessions() -> [TrainingSessionTerminalRecord] {
        TrainingSessionTerminalLedger.pruned(terminalRecords, now: now())
    }

    private func appendTerminalRecord(_ record: TrainingSessionTerminalRecord) {
        var records = terminalRecords.filter { $0.sessionId != record.sessionId }
        records.insert(record, at: 0)
        terminalRecords = TrainingSessionTerminalLedger.pruned(records, now: now())
        terminalLedgerStore.saveRecords(terminalRecords)
    }

    private func updateTerminalRecord(sessionId: String, _ transform: (inout TrainingSessionTerminalRecord) -> Void) {
        guard let index = terminalRecords.firstIndex(where: { $0.sessionId == sessionId }) else { return }
        var record = terminalRecords[index]
        transform(&record)
        guard record != terminalRecords[index] else { return }
        terminalRecords[index] = record
        terminalLedgerStore.saveRecords(terminalRecords)
    }

    /// The Watch Health leg reported after the structured commit already
    /// ended the session. Recorded on the pending presentation (when still
    /// shown) and on the ledger. Idempotent; a different operation id is
    /// refused, so a stale report can never touch another finish.
    @discardableResult
    func recordHealthSaveAfterCommit(
        sessionId: String,
        finishOperationId: String,
        succeeded: Bool
    ) -> TrainingSessionMutationOutcome {
        guard canWrite else { return .rejected(.writesNotAuthorized) }
        guard let record = terminalRecord(sessionId: sessionId), record.outcome == .committed,
              record.finishOperationId == finishOperationId
        else { return .rejected(.sessionNotMutable) }
        let state: WatchWorkoutFinishComponentState = succeeded ? .succeeded : .failed
        // A saved workout is never downgraded by a late failure report.
        if record.healthSaveState == .succeeded || record.healthSaveState == state {
            return .unchanged(revision: pendingCompletions.first { $0.id == sessionId }?.currentRevision ?? 0)
        }
        updateTerminalRecord(sessionId: sessionId) { $0.healthSaveState = state }
        var revision = 0
        if let index = pendingCompletions.firstIndex(where: { $0.id == sessionId }) {
            var presentation = pendingCompletions[index]
            presentation.watchHealthSaveState = state
            revision = presentation.currentRevision
            if (try? store.persist(presentation)) != nil { pendingCompletions[index] = presentation }
        }
        lastChange = .init(sessionId: sessionId, revision: revision, kind: .completionUpdated)
        return .applied(revision: revision)
    }

    private func isCurrentPendingCompletion(_ draft: TrainingLoggerDraft, now date: Date? = nil) -> Bool {
        guard let recorded = draft.completionRecordedAt.flatMap(TrainingSessionClock.date(from:)) else {
            // Written by the reviewed pre-integration lifecycle without a
            // timestamp: still exact and unacknowledged, so keep it.
            return true
        }
        let age = (date ?? now()).timeIntervalSince(recorded)
        return age >= -5 * 60 && age <= TrainingLoggerDraft.activeLiveSessionWindow
    }

    // MARK: - Lifecycle

    /// Starts a new draft with its own identity. Existing drafts are never
    /// touched (multiple drafts are allowed by design).
    @discardableResult
    func startSession(mode: TrainingLoggerMode, workoutDate: String, startedAt: String?) -> TrainingLoggerDraft? {
        guard canWrite else { return nil }
        var draft = TrainingLoggerDraft.fresh(mode: mode, workoutDate: workoutDate, startedAt: startedAt)
        draft.revision = 1
        do { try store.persist(draft) } catch { return nil }
        drafts = Self.sorted(drafts + [draft])
        lastChange = .init(sessionId: draft.id, revision: 1, kind: .started)
        return draft
    }

    /// Resume makes a left draft the in-progress workout again.
    @discardableResult
    func resume(sessionId: String) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .ui, scope: .lifecycle) { $0.leftAt = nil }
    }

    /// Freezes structured elapsed/rest time. The HealthKit workout lifecycle
    /// is driven by the Watch adapter, but it uses this same accepted pause.
    @discardableResult
    func pause(
        sessionId: String,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        return mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            guard draft.mode == .live, draft.leftAt == nil, draft.submissionState == nil,
                  draft.finishedAt == nil,
                  draft.step == .workout || draft.isAddingExercises
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            guard draft.pausedAt == nil else { return }
            let pausedAt = self.now()
            draft.pausedAt = TrainingSessionClock.string(from: pausedAt)
            if var rest = draft.rest, let started = rest.startedAtDate {
                rest.frozenElapsedSeconds = max(0, pausedAt.timeIntervalSince(started))
                if rest.mode == .countdown, let end = rest.endsAtDate {
                    rest.frozenRemainingSeconds = max(0, end.timeIntervalSince(pausedAt))
                }
                draft.rest = rest
            }
        }
    }

    /// Re-anchors every frozen clock at the accepted resume instant. The
    /// accumulated pause ledger makes elapsed workout time deterministic
    /// across relaunches and repeated commands.
    @discardableResult
    func resumePaused(
        sessionId: String,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            guard draft.mode == .live, draft.leftAt == nil,
                  draft.submissionState == nil, draft.finishedAt == nil
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            guard let paused = draft.pausedAt.flatMap(TrainingSessionClock.date(from:)) else { return }
            let resumedAt = self.now()
            draft.accumulatedPausedSeconds = (draft.accumulatedPausedSeconds ?? 0)
                + max(0, resumedAt.timeIntervalSince(paused))
            draft.pausedAt = nil
            if var rest = draft.rest {
                let elapsed = max(0, rest.frozenElapsedSeconds ?? 0)
                rest.startedAt = TrainingSessionClock.string(from: resumedAt.addingTimeInterval(-elapsed))
                if rest.mode == .countdown {
                    rest.endsAt = TrainingSessionClock.string(
                        from: resumedAt.addingTimeInterval(max(0, rest.frozenRemainingSeconds ?? 0))
                    )
                }
                rest.frozenElapsedSeconds = nil
                rest.frozenRemainingSeconds = nil
                draft.rest = rest
            }
        }
    }

    func activeElapsedSeconds(sessionId: String, at date: Date? = nil) -> TimeInterval? {
        guard let draft = draft(id: sessionId),
              let started = draft.startedAt.flatMap(TrainingSessionClock.date(from:)) else { return nil }
        let reference = draft.finishedAt.flatMap(TrainingSessionClock.date(from:)) ?? date ?? now()
        let openPause = draft.pausedAt.flatMap(TrainingSessionClock.date(from:))
            .map { max(0, reference.timeIntervalSince($0)) } ?? 0
        return max(0, reference.timeIntervalSince(started) - (draft.accumulatedPausedSeconds ?? 0) - openPause)
    }

    /// Marks one phone-authored plan as the deterministic Watch start
    /// candidate. No Watch code can create or edit this plan.
    @discardableResult
    func setReadyForWatch(sessionId: String, ready: Bool) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .ui, scope: .lifecycle) { draft in
            guard draft.mode == .live, draft.completedSetCount == 0,
                  !draft.exercises.isEmpty, draft.submissionState == nil
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            draft.readyForWatchAt = ready ? TrainingSessionClock.string(from: self.now()) : nil
            if ready {
                draft.startedAt = nil
                draft.finishedAt = nil
                draft.pausedAt = nil
                draft.accumulatedPausedSeconds = nil
                draft.leftAt = nil
                draft.rest = nil
            }
        }
    }

    /// The newest explicitly prepared plan wins; ties are broken by session
    /// id. This keeps selection stable without a second authority/store.
    func preparedWorkout() -> TrainingLoggerDraft? {
        drafts.filter { $0.readyForWatchAt != nil && $0.completedSetCount == 0 }
            .sorted {
                let left = $0.readyForWatchAt ?? ""
                let right = $1.readyForWatchAt ?? ""
                return left == right ? $0.id < $1.id : left > right
            }.first
    }

    @discardableResult
    func startPreparedWorkout(
        sessionId: String,
        context: TrainingSessionMutationContext
    ) -> TrainingSessionMutationOutcome {
        guard preparedWorkout()?.id == sessionId,
              activeLiveSession() == nil
        else { return .rejected(.sessionNotMutable) }
        return mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            guard draft.readyForWatchAt != nil, draft.completedSetCount == 0,
                  !draft.exercises.isEmpty, draft.mode == .live
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            draft.startedAt = TrainingSessionClock.string(from: self.now())
            draft.watchStartedAt = draft.startedAt
            draft.readyForWatchAt = nil
            draft.leftAt = nil
        }
    }

    @discardableResult
    func requestFinishConfirmation(
        sessionId: String,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            guard draft.mode == .live, draft.startedAt != nil, draft.submissionState == nil
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            // Already confirmed (from either device): nothing left to ask.
            guard draft.finishedAt == nil else { return }
            guard draft.completedSetCount > 0 else { throw TrainingSessionMutationRejection.noCompletedSets }
            if draft.finishConfirmationRequestedAt == nil {
                draft.finishConfirmationRequestedAt = TrainingSessionClock.string(from: self.now())
            }
            // Rest stays recorded (Not Yet restores it from its absolute
            // anchor); every surface hides it while confirmation is open.
        }
    }

    @discardableResult
    func cancelFinishConfirmation(
        sessionId: String,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            // A confirmed Finish cannot be taken back by Not Yet.
            guard draft.finishedAt == nil else { return }
            draft.finishConfirmationRequestedAt = nil
        }
    }

    @discardableResult
    func confirmFinish(
        sessionId: String,
        finishOperationId: String? = nil,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            // Joining a Finish already confirmed elsewhere (the phone, or a
            // lost acknowledgement) reuses its one operation: no change.
            if draft.finishedAt != nil, draft.watchFinishOperationId != nil { return }
            guard draft.finishConfirmationRequestedAt != nil
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            // Sets may have been unchecked since the request: a confirmed
            // finish must be committable.
            guard draft.completedSetCount > 0 else { throw TrainingSessionMutationRejection.noCompletedSets }
            Self.stampFinish(&draft, finishedAt: TrainingSessionClock.string(from: self.now()), operationId: finishOperationId)
        }
    }

    /// Phone Finish (Final Confirmation). The Logger's own confirmation
    /// screen is the explicit confirmation, so no Watch request is needed.
    /// Mints the session's one finish operation unless the Watch (or an
    /// earlier attempt) already did, so a phone Finish of a Watch-started
    /// workout drives the Watch to end and save its HealthKit workout, and a
    /// phone Finish during a Watch finish joins that same operation.
    @discardableResult
    func confirmPhoneFinish(
        sessionId: String,
        finishedAt: String,
        finishOperationId: String = UUID().uuidString
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .ui, scope: .lifecycle) { draft in
            guard draft.mode == .live else { return }
            Self.stampFinish(&draft, finishedAt: finishedAt, operationId: finishOperationId)
        }
    }

    /// One finish per session: `finishedAt` and the operation are stamped
    /// once and never moved (the idempotency signature includes
    /// `finishedAt`); rest ends; the confirmation gate closes.
    private static func stampFinish(_ draft: inout TrainingLoggerDraft, finishedAt: String, operationId: String?) {
        if draft.finishedAt == nil { draft.finishedAt = finishedAt }
        if draft.watchFinishOperationId == nil, let operationId {
            draft.watchFinishOperationId = operationId
            draft.watchServerCommitState = .pending
            draft.watchHealthSaveState = draft.expectsWatchHealthWorkout ? .pending : nil
        }
        draft.finishConfirmationRequestedAt = nil
        draft.rest = nil
    }

    /// The Watch began its HealthKit workout for this already-running live
    /// session. Stamped once (a replay or a Watch-started session is
    /// unchanged); the structured start is never moved. A start reported
    /// after the finish was stamped (but before the session ended) still
    /// makes the Finish expect the Health leg.
    @discardableResult
    func recordWatchHealthStart(
        sessionId: String,
        healthStartedAt: Date,
        context: TrainingSessionMutationContext
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            guard draft.mode == .live, draft.startedAt != nil, draft.leftAt == nil, draft.step != .complete
            else { throw TrainingSessionMutationRejection.sessionNotMutable }
            guard !draft.expectsWatchHealthWorkout else { return }
            draft.watchHealthStartedAt = TrainingSessionClock.string(from: healthStartedAt)
            if draft.watchFinishOperationId != nil, draft.watchHealthSaveState == nil {
                draft.watchHealthSaveState = .pending
            }
        }
    }

    @discardableResult
    func recordWatchHealthSave(
        sessionId: String,
        finishOperationId: String,
        succeeded: Bool,
        context: TrainingSessionMutationContext
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .lifecycle) { draft in
            guard draft.watchFinishOperationId == finishOperationId else {
                throw TrainingSessionMutationRejection.sessionNotMutable
            }
            // A saved workout is never downgraded by a late failure report.
            if draft.watchHealthSaveState == .succeeded, !succeeded { return }
            draft.watchHealthSaveState = succeeded ? .succeeded : .failed
        }
    }

    @discardableResult
    func recordWatchServerCommit(
        sessionId: String,
        finishOperationId: String,
        succeeded: Bool,
        authoritativePRCount: Int? = nil,
        authoritativeRecords: [TrainingPerformanceRecord]? = nil
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .system, scope: .lifecycle) { draft in
            guard draft.watchFinishOperationId == finishOperationId else {
                throw TrainingSessionMutationRejection.sessionNotMutable
            }
            draft.watchServerCommitState = succeeded ? .succeeded : .failed
            if succeeded {
                draft.watchAuthoritativePRCount = authoritativeRecords?.count ?? authoritativePRCount
                draft.watchAuthoritativePerformanceRecords = authoritativeRecords
            }
        }
    }

    /// Save & Leave: keep the draft, stop Log-tab routing into it, end rest.
    @discardableResult
    func saveAndLeave(sessionId: String, leftAt: String) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .ui, scope: .lifecycle) { draft in
            // A confirmed finish is being committed; it cannot be put aside.
            guard draft.watchFinishOperationId == nil else { throw TrainingSessionMutationRejection.sessionNotMutable }
            draft.leftAt = leftAt
            draft.pausedAt = nil
            draft.rest = nil
        }
    }

    /// Finish pressed: stamp `finishedAt` once (persisted before the commit
    /// so retries keep one session window) and end rest.
    @discardableResult
    func markFinishing(sessionId: String, finishedAt: String) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .ui, scope: .lifecycle) { draft in
            if draft.mode == .live, draft.finishedAt == nil { draft.finishedAt = finishedAt }
            draft.rest = nil
        }
    }

    @discardableResult
    func setSubmissionState(sessionId: String, _ state: TrainingLoggerSubmissionState?) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .system, scope: .lifecycle) { $0.submissionState = state }
    }

    /// Returns `false` when a Finish for this session is already in flight
    /// (for example from another Logger screen); the caller must not commit.
    func beginSubmission(sessionId: String) -> Bool {
        let inserted = submittingSessionIds.insert(sessionId).inserted
        if inserted { announceSubmissionChange(sessionId) }
        return inserted
    }

    func endSubmission(sessionId: String) {
        if submittingSessionIds.remove(sessionId) != nil { announceSubmissionChange(sessionId) }
    }

    private func announceSubmissionChange(_ sessionId: String) {
        guard let draft = draft(id: sessionId) else { return }
        lastChange = .init(sessionId: sessionId, revision: draft.currentRevision, kind: .submission)
    }
    func isSubmitting(sessionId: String) -> Bool { submittingSessionIds.contains(sessionId) }

    /// Removes a session: Cancel, discard of a saved draft, or durable
    /// commit. Attachment files are the caller's concern.
    @discardableResult
    func endSession(sessionId: String, reason: TrainingSessionEndReason) -> TrainingSessionMutationOutcome {
        // Cancel never races a confirmed finish: its commit may already have
        // landed, and a cancelled record would make the Watch discard the
        // HealthKit workout of a saved session. (Discarding a saved draft
        // stays possible as the explicit escape hatch.)
        if let current = draft(id: sessionId), reason != .committed {
            // Nothing ends a session while its commit is in flight.
            if submittingSessionIds.contains(sessionId) { return .rejected(.sessionNotMutable) }
            if reason == .cancelled, current.watchFinishOperationId != nil { return .rejected(.sessionNotMutable) }
        }
        return endSession(sessionId: sessionId, reason: reason, retainingPresentation: false)
    }

    /// Canonical Watch Cancel boundary. It validates the same revision and
    /// mutation identity rules as every Watch mutation, then delegates to the
    /// existing phone Cancel semantics: remove the draft without creating a
    /// performed projection, completion presentation, or durable commit.
    @discardableResult
    func cancelWorkout(
        sessionId: String,
        context: TrainingSessionMutationContext
    ) -> TrainingSessionMutationOutcome {
        guard canWrite else { return .rejected(.writesNotAuthorized) }
        guard let current = draft(id: sessionId) else {
            if let record = terminalRecord(sessionId: sessionId), record.outcome == .cancelled,
               record.cancelMutationId != nil, record.cancelMutationId == context.mutationId {
                return .duplicate(revision: lastChange?.revision ?? 0)
            }
            return .rejected(endedSessionIds.contains(sessionId) ? .sessionEnded : .sessionNotFound)
        }
        guard context.origin == .intent, let expectedRevision = context.expectedRevision else {
            return .rejected(.revisionRequired)
        }
        if current.appliedMutationIds?.contains(context.mutationId ?? "") == true {
            return .duplicate(revision: current.currentRevision)
        }
        guard expectedRevision == current.currentRevision else {
            return .rejected(.staleRevision(current: current.currentRevision))
        }
        guard current.mode == .live, current.leftAt == nil,
              current.finishedAt == nil, current.submissionState == nil,
              !submittingSessionIds.contains(sessionId)
        else { return .rejected(.sessionNotMutable) }

        return endSession(sessionId: sessionId, reason: .cancelled, retainingPresentation: false, cancelMutationId: context.mutationId)
    }

    /// The session ended without a commit (Cancel or discard), per the
    /// persisted ledger; with `mutationId`, only that exact Cancel.
    func isCancelled(sessionId: String, mutationId: String? = nil) -> Bool {
        guard let record = terminalRecord(sessionId: sessionId), record.outcome == .cancelled else { return false }
        guard let mutationId else { return true }
        return record.cancelMutationId == mutationId
    }

    /// The session is durable on the Server (pending presentation or ledger).
    func isCommitted(sessionId: String) -> Bool {
        pendingCompletions.contains { $0.id == sessionId } || terminalRecord(sessionId: sessionId)?.outcome == .committed
    }

    /// A durable commit. Ends the session exactly like
    /// `endSession(.committed)` (same change, so the Live Activity shows
    /// "Workout saved"), and with `retainingPresentation` keeps a read-only
    /// copy as a pending Workout Complete presentation until
    /// `acknowledgeCompletion`. Only the caller this returns accepted to owns
    /// cleanup; a second caller cannot create a second presentation.
    @discardableResult
    func endCommittedSession(sessionId: String, retainingPresentation: Bool) -> TrainingSessionMutationOutcome {
        endSession(sessionId: sessionId, reason: .committed, retainingPresentation: retainingPresentation)
    }

    private func endSession(
        sessionId: String,
        reason: TrainingSessionEndReason,
        retainingPresentation: Bool,
        cancelMutationId: String? = nil
    ) -> TrainingSessionMutationOutcome {
        guard canWrite else { return .rejected(.writesNotAuthorized) }
        guard let existing = draft(id: sessionId) else {
            return .rejected(endedSessionIds.contains(sessionId) ? .sessionEnded : .sessionNotFound)
        }
        var presentation = existing
        presentation.step = .complete
        presentation.submissionState = nil
        presentation.rest = nil
        presentation.finishConfirmationRequestedAt = nil
        if reason == .committed, presentation.watchFinishOperationId != nil {
            presentation.watchServerCommitState = .succeeded
        }
        presentation.completionPresentationPending = true
        presentation.completionRecordedAt = TrainingSessionClock.string(from: now())
        let keepsFinish = reason == .committed
            || (reason == .discarded && existing.watchFinishOperationId != nil)
        let outcome: TrainingSessionTerminalRecord.Outcome = reason == .committed ? .committed
            : keepsFinish ? .discardedAfterFinish : .cancelled
        appendTerminalRecord(.init(
            sessionId: sessionId,
            outcome: outcome,
            finishOperationId: keepsFinish ? existing.watchFinishOperationId : nil,
            startedAt: keepsFinish ? (existing.watchStartedAt ?? existing.startedAt) : nil,
            finishedAt: keepsFinish ? existing.finishedAt : nil,
            healthSaveState: keepsFinish ? existing.watchHealthSaveState : nil,
            cancelMutationId: reason == .committed ? nil : cancelMutationId,
            recordedAt: presentation.completionRecordedAt ?? TrainingSessionClock.string(from: now())
        ))
        if retainingPresentation, reason == .committed, (try? store.persist(presentation)) != nil {
            // Only the just-completed session is owed: a newer completion
            // supersedes any older unacknowledged one, which therefore can
            // never resurface after this one is acknowledged.
            for older in pendingCompletions where older.id != sessionId { store.discard(id: older.id) }
            pendingCompletions = [presentation]
        } else {
            // A presentation that cannot be written is lost, never the
            // durable workout; the Server already owns it.
            store.discard(id: sessionId)
        }
        submittingSessionIds.remove(sessionId)
        endedSessionIds.insert(sessionId)
        drafts.removeAll { $0.id == sessionId }
        lastChange = .init(sessionId: sessionId, revision: existing.currentRevision, kind: .ended(reason))
        return .applied(revision: existing.currentRevision)
    }

    // MARK: - Set operations

    /// Completes one exact set. Idempotent: an already-complete set is
    /// `.unchanged` and keeps its `completedAt` and rest. The set must belong
    /// to the named exercise in the named session. An `.intent` caller may
    /// only complete a set whose entered values are valid, on an in-progress
    /// live session at set entry.
    @discardableResult
    func completeSet(
        sessionId: String, exerciseId: String, setId: String,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        setCompletion(sessionId: sessionId, exerciseId: exerciseId, setId: setId, completed: true, context: context)
    }

    /// Sets a set's completion to an explicit end state (never a toggle, so
    /// a tap rendered from older state cannot invert a newer change).
    @discardableResult
    func setCompletion(
        sessionId: String, exerciseId: String, setId: String, completed: Bool,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .content) { draft in
            let (exerciseIndex, setIndex) = try Self.locate(exerciseId: exerciseId, setId: setId, in: draft)
            if completed, context.origin == .intent, !draft.exercises[exerciseIndex].sets[setIndex].isCompleted {
                let exercise = draft.exercises[exerciseIndex]
                if exercise.sets[setIndex].validationMessage(for: exercise.measurement) != nil {
                    throw TrainingSessionMutationRejection.setValuesIncomplete
                }
            }
            draft.exercises[exerciseIndex].sets[setIndex].isCompleted = completed
        }
    }

    @discardableResult
    func setValue(
        sessionId: String, exerciseId: String, setId: String,
        field: TrainingSessionSetField, value: Double?,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .content) { draft in
            let (exerciseIndex, setIndex) = try Self.locate(exerciseId: exerciseId, setId: setId, in: draft)
            draft.exercises[exerciseIndex].sets[setIndex][keyPath: field.keyPath] = value
        }
    }

    // MARK: - Rest

    /// Ends the named rest interval. Ending a rest that already ended is
    /// `.unchanged`; naming a different (replaced) rest is refused.
    @discardableResult
    func endRest(sessionId: String, restId: String, context: TrainingSessionMutationContext = .ui) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .content) { draft in
            guard let rest = draft.rest else { return }
            guard rest.id == restId else { throw TrainingSessionMutationRejection.restNotFound }
            draft.rest = nil
        }
    }

    /// Session-level rest override (`nil` = follow preferences). Applies to
    /// the next completion; an interval already running is left as started.
    @discardableResult
    func setRestConfiguration(
        sessionId: String, _ configuration: TrainingRestConfiguration?,
        context: TrainingSessionMutationContext = .ui
    ) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: context, scope: .content) { $0.restConfiguration = configuration }
    }

    /// Effective rest configuration for a set of this exercise: session
    /// override, then exercise/global preference, then Off.
    func restConfiguration(for exercise: TrainingLoggerDraftExercise, in draft: TrainingLoggerDraft) -> TrainingRestConfiguration {
        draft.restConfiguration
            ?? restPreferences.restConfiguration(canonicalExerciseId: exercise.canonicalExerciseId)
            ?? .off
    }

    // MARK: - Structural edits (UI only)

    /// General Logger edit (exercise list, variants, supersets, evidence,
    /// areas, step navigation) applied to the authoritative current draft,
    /// never to a caller's copy. UI origin only: other origins must use the
    /// typed operations above.
    @discardableResult
    func edit(
        sessionId: String, context: TrainingSessionMutationContext = .ui,
        _ transform: (inout TrainingLoggerDraft) -> Void
    ) -> TrainingSessionMutationOutcome {
        guard context.origin == .ui else { return .rejected(.originNotPermitted) }
        return mutate(sessionId: sessionId, context: context, scope: .content) { transform(&$0) }
    }

    /// Whole-draft replacement kept for older call sites (`viewModel.draft =`).
    /// Identity, revision, and invariants still come from the authority, but
    /// the content is the caller's: only use it with a draft read from this
    /// authority in the same main-actor turn. Product code uses typed
    /// operations and `edit`.
    @discardableResult
    func replace(_ replacement: TrainingLoggerDraft) -> TrainingSessionMutationOutcome {
        guard canWrite else { return .rejected(.writesNotAuthorized) }
        guard draft(id: replacement.id) != nil else {
            guard !endedSessionIds.contains(replacement.id),
                  !pendingCompletions.contains(where: { $0.id == replacement.id })
            else { return .rejected(.sessionEnded) }
            var inserted = replacement
            inserted.revision = max(1, replacement.currentRevision)
            do { try store.persist(inserted) } catch { return .rejected(.persistenceFailed) }
            drafts = Self.sorted(drafts + [inserted])
            lastChange = .init(sessionId: inserted.id, revision: inserted.currentRevision, kind: .started)
            return .applied(revision: inserted.currentRevision)
        }
        return edit(sessionId: replacement.id) { draft in
            let revision = draft.revision, ledger = draft.appliedMutationIds
            draft = replacement
            draft.revision = revision
            draft.appliedMutationIds = ledger
        }
    }

    // MARK: - Core

    private enum Scope {
        /// Workout content; refused for non-UI origins unless the session is
        /// externally mutable and no Finish is in flight.
        case content
        /// Resume / leave / finish / submission bookkeeping.
        case lifecycle
    }

    private func mutate(
        sessionId: String,
        context: TrainingSessionMutationContext,
        scope: Scope,
        _ transform: (inout TrainingLoggerDraft) throws -> Void
    ) -> TrainingSessionMutationOutcome {
        guard canWrite else { return .rejected(.writesNotAuthorized) }
        guard let index = drafts.firstIndex(where: { $0.id == sessionId }) else {
            return .rejected(endedSessionIds.contains(sessionId) ? .sessionEnded : .sessionNotFound)
        }
        let current = drafts[index]
        if context.origin == .intent, context.expectedRevision == nil { return .rejected(.revisionRequired) }
        if let mutationId = context.mutationId, current.appliedMutationIds?.contains(mutationId) == true {
            return .duplicate(revision: current.currentRevision)
        }
        if scope == .content, current.pausedAt != nil {
            return .rejected(.sessionPaused)
        }
        if scope == .content, context.origin != .ui {
            guard TrainingSessionInvariants.acceptsExternalContentMutation(current),
                  !submittingSessionIds.contains(sessionId) else { return .rejected(.sessionNotMutable) }
        }

        var next = current
        do { try transform(&next) }
        catch let rejection as TrainingSessionMutationRejection { return .rejected(rejection) }
        catch { return .rejected(.sessionNotMutable) }
        guard next.id == current.id else { return .rejected(.sessionNotFound) }
        let sessionOverride = next.restConfiguration
        TrainingSessionInvariants.normalize(&next, previous: current, now: now()) { exercise in
            sessionOverride
                ?? restPreferences.restConfiguration(canonicalExerciseId: exercise.canonicalExerciseId)
                ?? .off
        }

        if TrainingSessionInvariants.contentEqual(next, current) {
            return .unchanged(revision: current.currentRevision)
        }
        if let expected = context.expectedRevision, expected != current.currentRevision {
            return .rejected(.staleRevision(current: current.currentRevision))
        }
        next.revision = current.currentRevision + 1
        next.appliedMutationIds = current.appliedMutationIds
        if let mutationId = context.mutationId {
            next.appliedMutationIds = Array(((current.appliedMutationIds ?? []) + [mutationId])
                .suffix(TrainingSessionInvariants.mutationLedgerLimit))
        }

        do { try store.persist(next) } catch { return .rejected(.persistenceFailed) }
        drafts[index] = next
        if Self.sortKey(next) != Self.sortKey(current) { drafts = Self.sorted(drafts) }
        lastChange = .init(sessionId: sessionId, revision: next.currentRevision, kind: .mutated)
        return .applied(revision: next.currentRevision)
    }

    private static func locate(exerciseId: String, setId: String, in draft: TrainingLoggerDraft) throws -> (Int, Int) {
        guard let exerciseIndex = draft.exercises.firstIndex(where: { $0.id == exerciseId }) else {
            throw TrainingSessionMutationRejection.exerciseNotFound
        }
        guard let setIndex = draft.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == setId }) else {
            throw TrainingSessionMutationRejection.setNotFound
        }
        return (exerciseIndex, setIndex)
    }

    private static func sortKey(_ draft: TrainingLoggerDraft) -> String { draft.startedAt ?? draft.workoutDate }

    /// Same order as the draft store and the Logger's saved-draft list.
    static func sorted(_ drafts: [TrainingLoggerDraft]) -> [TrainingLoggerDraft] {
        drafts.sorted {
            let left = sortKey($0), right = sortKey($1)
            return left == right ? $0.id < $1.id : left > right
        }
    }
}


/// Cancels an `observeChanges` subscription. Releasing it does not cancel;
/// call `cancel()` (or let the authority go away).
@MainActor
final class TrainingSessionObservation {
    private var onCancel: (@MainActor () -> Void)?
    init(onCancel: @escaping @MainActor () -> Void) { self.onCancel = onCancel }
    func cancel() { onCancel?(); onCancel = nil }
}

extension TrainingSessionAuthority {
    /// How long a live workout can be the Live Activity's subject, matching
    /// the Log tab's "in progress" window.
    static let liveActivityWindow = TrainingLoggerDraft.activeLiveSessionWindow

    /// The session the Live Activity should represent: the newest live draft
    /// that is at set entry, in review, or finishing, and not left or
    /// complete. Planning (areas / exercise picking) has no sets to show, and
    /// Save & Leave means "not now", so neither has an activity.
    func liveActivitySubject(at now: Date) -> TrainingLoggerDraft? {
        // Accepts both plain and fractional-second timestamps.
        func started(_ draft: TrainingLoggerDraft) -> Date? { draft.startedAt.flatMap(TrainingSessionClock.date(from:)) }
        return drafts
            .filter { draft in
                guard draft.mode == .live, draft.step != .complete, draft.leftAt == nil,
                      let start = started(draft) else { return false }
                let age = now.timeIntervalSince(start)
                guard age >= -5 * 60, age <= Self.liveActivityWindow else { return false }
                switch draft.step {
                case .workout, .summary, .evidence, .review: return true
                case .exercises: return draft.isAddingExercises
                case .entry, .areas, .complete: return false
                }
            }
            .max { (started($0) ?? .distantPast) < (started($1) ?? .distantPast) }
    }
}
