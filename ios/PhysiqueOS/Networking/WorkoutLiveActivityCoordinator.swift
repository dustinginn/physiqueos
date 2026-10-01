import Foundation
import os

/// Keeps at most one Workout Live Activity in step with the app-scoped
/// `TrainingSessionAuthority`. It is a write-only projection: it observes
/// authority changes, derives `TrainingSessionLiveProjection`, and pushes the
/// result to ActivityKit with LOCAL updates only. Nothing the system reports
/// back (state, dismissal, content) ever feeds into a workout.
///
/// Product semantics:
/// - An activity exists while a live workout is at set entry, in review, or
///   finishing (see `TrainingSessionAuthority.liveActivitySubject`).
/// - Save & Leave ends it ("not now"); Resume starts a new one.
/// - Cancel / discard end it immediately; a durable commit shows "Workout
///   saved" and dismisses after `savedDismissalDelay`.
/// - If the user swipes it away (or the system ends it at its limit) it is
///   suppressed for that session and never resurrected.
/// - Authorization off, or a device with no Dynamic Island, never affects
///   the workout; the coordinator simply does nothing it cannot do.
@MainActor
final class WorkoutLiveActivityCoordinator {
    static let savedDismissalDelay: TimeInterval = 15 * 60
    /// With no rest countdown, an activity nobody has updated for this long
    /// is shown as "needs an update" (crash/abandonment safety net).
    static let staleInterval: TimeInterval = 3 * 3600
    /// Value-only edits (typing reps/load) are coalesced to one update per
    /// interval; completions, rest, phase and layout changes send at once.
    static let valueCoalescingDelay: Duration = .seconds(1)
    static let suppressedKey = "physiqueos.workoutLiveActivity.suppressedSessions.v1"
    /// Activity ids this app ended itself, so a later `.dismissed` is not
    /// mistaken for the user swiping the activity away.
    static let endedByUsKey = "physiqueos.workoutLiveActivity.endedByUs.v1"

    private let client: WorkoutLiveActivityClient
    private let now: @MainActor () -> Date
    private let defaults: UserDefaults
    private let areaLabels: @MainActor () -> [String: String]

    private var authority: TrainingSessionAuthority?
    private var authorityEnvironment: NativeAPIEnvironment = .sandbox
    private var observation: TrainingSessionObservation?
    private var endedReasons: [String: TrainingSessionEndReason] = [:]
    private var lastProjection: [String: TrainingSessionLiveProjection] = [:]
    /// What this process last sent for the live activity, by activity id.
    private var lastSent: [String: WorkoutActivityAttributes.ContentState] = [:]
    private var pendingValueUpdate: Task<Void, Never>?
    /// Serializes ActivityKit calls: an async update/end must finish before
    /// the next sync decision, so a request can never race an end.
    private var syncInFlight = false
    private var syncRequested = false
    private var immediateRequested = false

    /// Test visibility (bounded). Also logged (event names only; never
    /// exercise names, values or ids).
    private(set) var diagnostics: [String] = [] {
        didSet {
            if let last = diagnostics.last { Self.log.info("event \(last, privacy: .public)") }
            if diagnostics.count > 64 { diagnostics.removeFirst(diagnostics.count - 64) }
        }
    }
    private static let log = Logger(subsystem: "com.physiqueos.native", category: "WorkoutLiveActivity")

    init(
        client: WorkoutLiveActivityClient,
        defaults: UserDefaults = .standard,
        now: @escaping @MainActor () -> Date = { Date() },
        areaLabels: @escaping @MainActor () -> [String: String] = { [:] }
    ) {
        self.client = client
        self.defaults = defaults
        self.now = now
        self.areaLabels = areaLabels
    }

    // MARK: - Wiring

    /// Starts observing `authority` (the selected Native authority). Calling
    /// it again with a different authority ends the old authority's activity.
    func attach(to authority: TrainingSessionAuthority, environment: NativeAPIEnvironment) {
        if self.authority === authority { return }
        observation?.cancel()
        self.authority = authority
        authorityEnvironment = environment
        lastProjection.removeAll()
        observation = authority.observeChanges { [weak self] change in
            self?.noteChange(change)
        }
        requestSync()
    }

    func detach() {
        observation?.cancel()
        observation = nil
        authority = nil
    }

    /// App launch / scene became active: adopt, dedupe and clean up existing
    /// activities, then bring them in step with the authority.
    func reconcile() {
        pruneSuppressed()
        requestSync()
    }

    /// Flush any coalesced update now (used by the Complete Set intent so
    /// the rendered state is current before the process can suspend).
    func flush() async {
        pendingValueUpdate?.cancel()
        pendingValueUpdate = nil
        await runSync(coalesceValuesOnly: false)
    }

    // MARK: - Change handling

    private func noteChange(_ change: TrainingSessionChange) {
        if case .ended(let reason) = change.kind { endedReasons[change.sessionId] = reason }
        requestSync()
    }

    private func requestSync() {
        Task { @MainActor [weak self] in
            await self?.runSync(coalesceValuesOnly: true)
        }
    }

    // MARK: - Sync

    private func runSync(coalesceValuesOnly: Bool) async {
        if !coalesceValuesOnly { immediateRequested = true }
        if syncInFlight {
            syncRequested = true
            return
        }
        syncInFlight = true
        repeat {
            syncRequested = false
            let immediate = immediateRequested
            immediateRequested = false
            await syncOnce(coalesceValuesOnly: !immediate)
        } while syncRequested
        syncInFlight = false
    }

    private func syncOnce(coalesceValuesOnly: Bool) async {
        guard let authority else { return }
        let current = now()
        let subject = authority.liveActivitySubject(at: current)
        let live = client.activities().filter(\.isLive)
        let endedByUs = endedByUsIds()

        // The user swiped it away, or the system ended it (8 h limit): never
        // bring that session's activity back. Endings this app made itself
        // (Save & Leave, a replaced session) are not suppression.
        for snapshot in client.activities()
        where !snapshot.isLive && !endedByUs.contains(snapshot.id) && authority.draft(id: snapshot.attributes.sessionId) != nil {
            suppress(sessionId: snapshot.attributes.sessionId)
        }

        guard let subject else {
            await endAll(live, authority: authority)
            return
        }
        if isSuppressed(sessionId: subject.id) {
            await endAll(live, authority: authority)
            return
        }

        let projection = TrainingSessionLiveProjection.make(from: subject, areaLabels: areaLabels(), now: current)
        guard let projection else {
            await endAll(live, authority: authority)
            return
        }
        lastProjection[subject.id] = projection
        let state = WorkoutActivityAttributes.ContentState(
            projection: projection, finishing: authority.isSubmitting(sessionId: subject.id)
        )
        let attributes = WorkoutActivityAttributes(
            projection: projection, authority: authorityEnvironment, startedAtFallback: current
        )

        // Adopt exactly one activity for this session; end everything else
        // (other sessions, other schema versions, other authority, duplicates).
        let keeper = live.first {
            $0.attributes.sessionId == subject.id
                && $0.attributes.authority == authorityEnvironment.rawValue
                && $0.attributes.schemaVersion == WorkoutActivityAttributes.currentSchemaVersion
        }
        for snapshot in live where snapshot.id != keeper?.id {
            await end(snapshot, state: nil, dismissal: .immediate)
        }

        if let keeper {
            await updateIfNeeded(keeper, state: state, projection: projection, current: current, coalesceValuesOnly: coalesceValuesOnly)
        } else {
            requestNew(attributes: attributes, state: state, current: current)
        }
    }

    private func requestNew(attributes: WorkoutActivityAttributes, state: WorkoutActivityAttributes.ContentState, current: Date) {
        guard client.areActivitiesEnabled else {
            diagnostics.append("disabled")
            return
        }
        do {
            let id = try client.request(attributes: attributes, state: state, staleDate: staleDate(for: state, current: current))
            lastSent[id] = state
            diagnostics.append("requested")
        } catch WorkoutLiveActivityRequestError.notForeground {
            // Retried by `reconcile()` when the app next becomes active.
            diagnostics.append("not-foreground")
        } catch WorkoutLiveActivityRequestError.disabled {
            diagnostics.append("disabled")
        } catch {
            Self.log.error("request failed: \(String(describing: error), privacy: .public)")
            diagnostics.append("request-failed")
        }
    }

    private func updateIfNeeded(
        _ snapshot: WorkoutLiveActivitySnapshot,
        state: WorkoutActivityAttributes.ContentState,
        projection: TrainingSessionLiveProjection,
        current: Date,
        coalesceValuesOnly: Bool
    ) async {
        let previous = lastSent[snapshot.id] ?? snapshot.state
        guard state != previous else { return }
        if coalesceValuesOnly, state.significantKey == previous.significantKey {
            scheduleValueUpdate()
            return
        }
        pendingValueUpdate?.cancel()
        pendingValueUpdate = nil
        lastSent[snapshot.id] = state
        await client.update(id: snapshot.id, state: state, staleDate: staleDate(for: state, current: current))
        diagnostics.append("updated")
    }

    private func scheduleValueUpdate() {
        pendingValueUpdate?.cancel()
        pendingValueUpdate = Task { @MainActor [weak self] in
            try? await Task.sleep(for: Self.valueCoalescingDelay)
            guard !Task.isCancelled, let self else { return }
            self.pendingValueUpdate = nil
            await self.runSync(coalesceValuesOnly: false)
        }
    }

    // MARK: - Ending

    private func endAll(_ snapshots: [WorkoutLiveActivitySnapshot], authority: TrainingSessionAuthority) async {
        pendingValueUpdate?.cancel()
        pendingValueUpdate = nil
        for snapshot in snapshots {
            let sessionId = snapshot.attributes.sessionId
            if endedReasons[sessionId] == .committed, let projection = lastProjection[sessionId] {
                // Durable commit: a short-lived "Workout saved" state.
                let saved = WorkoutActivityAttributes.ContentState(projection: projection).saved(completedAt: now())
                await end(snapshot, state: saved, dismissal: .after(now().addingTimeInterval(Self.savedDismissalDelay)))
            } else {
                await end(snapshot, state: nil, dismissal: .immediate)
            }
            endedReasons[sessionId] = nil
            lastProjection[sessionId] = nil
        }
    }

    private func end(
        _ snapshot: WorkoutLiveActivitySnapshot,
        state: WorkoutActivityAttributes.ContentState?,
        dismissal: WorkoutLiveActivityDismissal
    ) async {
        lastSent[snapshot.id] = nil
        markEndedByUs(snapshot.id)
        await client.end(id: snapshot.id, state: state, dismissal: dismissal)
        diagnostics.append(state == nil ? "ended" : "ended-saved")
    }

    // MARK: - Staleness and suppression

    /// A running Countdown goes stale exactly when it ends (the view shows
    /// "rest complete"); otherwise the safety-net interval applies.
    func staleDate(for state: WorkoutActivityAttributes.ContentState, current: Date) -> Date? {
        guard state.phase == .inProgress else {
            return state.phase == .saved ? nil : current.addingTimeInterval(Self.staleInterval)
        }
        if let rest = state.rest, rest.mode == .countdown, let endsAt = rest.endsAt { return endsAt }
        return current.addingTimeInterval(Self.staleInterval)
    }

    private func suppressedIds() -> Set<String> {
        Set(defaults.stringArray(forKey: Self.suppressedKey) ?? [])
    }

    private func isSuppressed(sessionId: String) -> Bool { suppressedIds().contains(sessionId) }

    private func suppress(sessionId: String) {
        var ids = suppressedIds()
        guard ids.insert(sessionId).inserted else { return }
        defaults.set(Array(ids).sorted(), forKey: Self.suppressedKey)
    }

    private func endedByUsIds() -> Set<String> {
        Set(defaults.stringArray(forKey: Self.endedByUsKey) ?? [])
    }

    private func markEndedByUs(_ id: String) {
        var ids = (defaults.stringArray(forKey: Self.endedByUsKey) ?? []).filter { $0 != id }
        ids.append(id)
        defaults.set(Array(ids.suffix(40)), forKey: Self.endedByUsKey)
    }

    /// Drops suppressed ids whose workouts no longer exist.
    private func pruneSuppressed() {
        guard let authority else { return }
        let existing = Set(authority.drafts.map(\.id))
        let kept = suppressedIds().filter { existing.contains($0) }
        defaults.set(Array(kept).sorted(), forKey: Self.suppressedKey)
    }
}
