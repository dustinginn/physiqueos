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
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.store = store
        self.environment = environment
        self.restPreferences = restPreferences
        self.now = now
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
    /// Idempotent; touches no editable session and publishes no session
    /// change (the Live Activity already ended with the commit).
    @discardableResult
    func acknowledgeCompletion(sessionId: String) -> Bool {
        guard canWrite, pendingCompletions.contains(where: { $0.id == sessionId }) else { return false }
        store.discard(id: sessionId)
        pendingCompletions.removeAll { $0.id == sessionId }
        return true
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

    /// Save & Leave: keep the draft, stop Log-tab routing into it, end rest.
    @discardableResult
    func saveAndLeave(sessionId: String, leftAt: String) -> TrainingSessionMutationOutcome {
        mutate(sessionId: sessionId, context: .ui, scope: .lifecycle) { draft in
            draft.leftAt = leftAt
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
        endSession(sessionId: sessionId, reason: reason, retainingPresentation: false)
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
        retainingPresentation: Bool
    ) -> TrainingSessionMutationOutcome {
        guard canWrite else { return .rejected(.writesNotAuthorized) }
        guard let existing = draft(id: sessionId) else {
            return .rejected(endedSessionIds.contains(sessionId) ? .sessionEnded : .sessionNotFound)
        }
        var presentation = existing
        presentation.step = .complete
        presentation.submissionState = nil
        presentation.rest = nil
        presentation.completionPresentationPending = true
        presentation.completionRecordedAt = TrainingSessionClock.string(from: now())
        if retainingPresentation, reason == .committed, (try? store.persist(presentation)) != nil {
            pendingCompletions.removeAll { $0.id == sessionId }
            pendingCompletions.append(presentation)
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
