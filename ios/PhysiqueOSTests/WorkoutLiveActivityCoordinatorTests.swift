import XCTest
@testable import PhysiqueOS

/// In-memory ActivityKit stand-in. Ending leaves the record as `.dismissed`
/// (like the system after an immediate dismissal) so tests can tell our own
/// endings from a user swipe.
@MainActor
final class FakeWorkoutLiveActivityClient: WorkoutLiveActivityClient {
    struct EndRecord: Equatable {
        var id: String
        var state: WorkoutActivityAttributes.ContentState?
        var dismissal: WorkoutLiveActivityDismissal
    }

    var areActivitiesEnabled = true
    /// Like the real system, dismissed activities leave `activities()`.
    var dropsDismissedActivities = true
    /// While true, `update` suspends until `releaseUpdates()`.
    var holdUpdates = false
    private var heldUpdates: [CheckedContinuation<Void, Never>] = []
    private var lifecycleHandlers: [UUID: @MainActor (String, WorkoutLiveActivitySnapshot.Lifecycle) -> Void] = [:]
    private var enablementHandlers: [UUID: @MainActor (Bool) -> Void] = [:]
    var requestError: WorkoutLiveActivityRequestError?
    private(set) var records: [WorkoutLiveActivitySnapshot] = []
    private(set) var requests = 0
    private(set) var updates: [(id: String, state: WorkoutActivityAttributes.ContentState, staleDate: Date?)] = []
    private(set) var ends: [EndRecord] = []
    private(set) var lastRequestStaleDate: Date?

    var live: [WorkoutLiveActivitySnapshot] { records.filter(\.isLive) }

    func activities() -> [WorkoutLiveActivitySnapshot] { records }

    func request(
        attributes: WorkoutActivityAttributes, state: WorkoutActivityAttributes.ContentState, staleDate: Date?
    ) throws -> String {
        if let requestError { throw requestError }
        guard areActivitiesEnabled else { throw WorkoutLiveActivityRequestError.disabled }
        requests += 1
        lastRequestStaleDate = staleDate
        let id = "activity-\(requests)"
        records.append(.init(id: id, attributes: attributes, state: state, lifecycle: .active))
        return id
    }

    func update(id: String, state: WorkoutActivityAttributes.ContentState, staleDate: Date?) async {
        if holdUpdates { await withCheckedContinuation { heldUpdates.append($0) } }
        updates.append((id, state, staleDate))
        if let index = records.firstIndex(where: { $0.id == id }) {
            records[index].state = state
            if records[index].lifecycle == .stale { records[index].lifecycle = .active } // a refresh clears staleness
        }
    }

    var heldCount: Int { heldUpdates.count }

    func releaseUpdates() {
        holdUpdates = false
        let held = heldUpdates
        heldUpdates = []
        held.forEach { $0.resume() }
    }

    func observeLifecycle(_ onChange: @escaping @MainActor (String, WorkoutLiveActivitySnapshot.Lifecycle) -> Void) -> WorkoutLiveActivityObservation {
        let key = UUID()
        lifecycleHandlers[key] = onChange
        return WorkoutLiveActivityObservation { [weak self] in self?.lifecycleHandlers[key] = nil }
    }

    func observeEnablement(_ onChange: @escaping @MainActor (Bool) -> Void) -> WorkoutLiveActivityObservation {
        let key = UUID()
        enablementHandlers[key] = onChange
        return WorkoutLiveActivityObservation { [weak self] in self?.enablementHandlers[key] = nil }
    }

    private func settle(_ id: String, _ lifecycle: WorkoutLiveActivitySnapshot.Lifecycle) {
        if let index = records.firstIndex(where: { $0.id == id }) {
            if dropsDismissedActivities, lifecycle == .dismissed { records.remove(at: index) } else { records[index].lifecycle = lifecycle }
        }
        // (a real dismissal of an already-ended activity keeps its record id for the sweep)
        lifecycleHandlers.values.forEach { $0(id, lifecycle) }
    }

    /// The user swipes the activity away.
    func userDismiss(id: String) { settle(id, .dismissed) }
    /// The system ends it (8 h limit, force quit, Settings toggle).
    func systemEnd(id: String) { settle(id, .ended) }

    func markStale(id: String) {
        if let index = records.firstIndex(where: { $0.id == id }) { records[index].lifecycle = .stale }
    }

    func setEnabled(_ enabled: Bool) {
        areActivitiesEnabled = enabled
        enablementHandlers.values.forEach { $0(enabled) }
    }

    func end(id: String, state: WorkoutActivityAttributes.ContentState?, dismissal: WorkoutLiveActivityDismissal) async {
        ends.append(.init(id: id, state: state, dismissal: dismissal))
        if let index = records.firstIndex(where: { $0.id == id }), let state { records[index].state = state }
        settle(id, .dismissed)
    }

    /// Pre-existing activity from an earlier process.
    @discardableResult
    func seed(attributes: WorkoutActivityAttributes, state: WorkoutActivityAttributes.ContentState,
              lifecycle: WorkoutLiveActivitySnapshot.Lifecycle = .active) -> String {
        let id = "seed-\(records.count + 1)"
        records.append(.init(id: id, attributes: attributes, state: state, lifecycle: lifecycle))
        return id
    }

}

@MainActor
final class WorkoutLiveActivityCoordinatorTests: XCTestCase {
    private typealias F = WorkoutLiveActivityTestFixtures

    private final class Clock: @unchecked Sendable {
        var now = F.now
        func advance(_ seconds: TimeInterval) { now = now.addingTimeInterval(seconds) }
    }

    private struct Harness {
        var client: FakeWorkoutLiveActivityClient
        var store: TrainingSessionAuthorityTests.RecordingStore
        var authority: TrainingSessionAuthority
        var coordinator: WorkoutLiveActivityCoordinator
        var clock: Clock
        var defaults: UserDefaults
    }

    private func harness(drafts: [TrainingLoggerDraft] = [], rest: TrainingRestConfiguration? = .stopwatch,
                         client: FakeWorkoutLiveActivityClient = FakeWorkoutLiveActivityClient(), attach: Bool = true) -> Harness {
        let clock = Clock()
        let store = TrainingSessionAuthorityTests.RecordingStore(drafts)
        let authority = TrainingSessionAuthority(
            store: store, environment: .sandbox, restPreferences: FixedTrainingRestPreferences(rest), now: { clock.now }
        )
        let suite = "WorkoutLiveActivityCoordinatorTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let coordinator = WorkoutLiveActivityCoordinator(client: client, defaults: defaults, now: { clock.now })
        if attach { coordinator.attach(to: authority, environment: .sandbox) }
        return Harness(client: client, store: store, authority: authority, coordinator: coordinator, clock: clock, defaults: defaults)
    }

    private func settle(_ harness: Harness) async {
        for _ in 0..<4 { await Task.yield() }
        await harness.coordinator.flush()
    }

    private func liveDraft(id: String = "session-1", step: TrainingLoggerStep = .workout) -> TrainingLoggerDraft {
        F.session(id: id, [
            F.exercise("bench", "Bench Press", sets: [F.set("b1", 1), F.set("b2", 2), F.set("b3", 3)]),
            F.exercise("fly", "Cable Fly", sets: [F.set("f1", 1), F.set("f2", 2)]),
        ], step: step, revision: 1)
    }

    // MARK: Start / duplicates

    func testRequestsExactlyOneActivityForAnActiveWorkoutAndNeverDuplicates() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        XCTAssertEqual(h.client.requests, 1)
        XCTAssertEqual(h.client.live.count, 1)
        XCTAssertEqual(h.client.live.first?.attributes.sessionId, "session-1")
        XCTAssertEqual(h.client.live.first?.attributes.authority, "sandbox")
        XCTAssertEqual(h.client.live.first?.state.phase, .inProgress)

        h.coordinator.reconcile()
        h.coordinator.reconcile()
        await settle(h)
        h.authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b1", field: .reps, value: 9)
        await settle(h)
        XCTAssertEqual(h.client.requests, 1, "Reconciles and edits never create a second activity.")
        XCTAssertEqual(h.client.live.count, 1)
    }

    func testPlanningAndRetrospectiveWorkoutsHaveNoActivity() async {
        var past = liveDraft(id: "past")
        past.mode = .past
        let h = harness(drafts: [liveDraft(id: "planning", step: .areas), past])
        await settle(h)
        XCTAssertEqual(h.client.requests, 0)

        h.authority.edit(sessionId: "planning") { $0.step = .workout }
        await settle(h)
        XCTAssertEqual(h.client.requests, 1, "The activity starts when set entry begins.")
    }

    func testNewestLiveWorkoutIsTheOnlySubject() async {
        let older = F.session(id: "older", [F.exercise("a", "A", sets: [F.set("a1", 1)])], startedAt: F.stamp(3000))
        let h = harness(drafts: [older, liveDraft()])
        await settle(h)
        XCTAssertEqual(h.client.live.map(\.attributes.sessionId), ["session-1"])
    }

    // MARK: Updates

    func testCompletionUpdatesImmediatelyWithTheNewTargetAndRest() async throws {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let before = h.client.updates.count
        h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        await settle(h)
        XCTAssertEqual(h.client.updates.count, before + 1)
        let state = try XCTUnwrap(h.client.live.first?.state)
        XCTAssertEqual(state.completedSets, 1)
        XCTAssertEqual(state.target?.setId, "b2")
        XCTAssertEqual(state.rest?.mode, .stopwatch)
        XCTAssertEqual(state.revision, 2)
    }

    func testValueOnlyEditsAreCoalescedUntilFlushed() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let before = h.client.updates.count
        for value in 1...10 {
            h.authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b1", field: .reps, value: Double(value))
        }
        for _ in 0..<4 { await Task.yield() }
        XCTAssertEqual(h.client.updates.count, before, "Typing never floods ActivityKit with updates.")
        await h.coordinator.flush()
        XCTAssertEqual(h.client.updates.count, before + 1)
        XCTAssertEqual(h.client.live.first?.state.rows.first?.valueText, "185 lb × 10")
    }

    func testIdenticalStateSendsNoUpdate() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let before = h.client.updates.count
        h.coordinator.reconcile()
        await settle(h)
        await h.coordinator.flush()
        XCTAssertEqual(h.client.updates.count, before)
    }

    func testStaleDatePolicy() async {
        let h = harness(drafts: [liveDraft()], rest: .countdown(seconds: 90))
        await settle(h)
        XCTAssertEqual(h.client.lastRequestStaleDate, F.now.addingTimeInterval(WorkoutLiveActivityCoordinator.staleInterval))

        h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        await settle(h)
        XCTAssertEqual(h.client.updates.last?.staleDate, F.now.addingTimeInterval(90), "A running Countdown goes stale exactly when it ends.")

        let state = h.client.live.first!.state
        XCTAssertEqual(h.coordinator.staleDate(for: state.saved(completedAt: F.now), current: F.now), nil)
    }

    // MARK: Lifecycle

    func testSaveAndLeaveEndsAndResumeStartsAFreshActivity() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.authority.saveAndLeave(sessionId: "session-1", leftAt: "2026-10-01T17:01:00Z")
        await settle(h)
        XCTAssertTrue(h.client.live.isEmpty)
        XCTAssertEqual(h.client.ends.last?.dismissal, .immediate)

        h.authority.resume(sessionId: "session-1")
        await settle(h)
        XCTAssertEqual(h.client.requests, 2, "Our own ending is not a user dismissal, so Resume brings it back.")
        XCTAssertEqual(h.client.live.count, 1)
    }

    func testCancelAndDiscardEndImmediatelyWithoutSavedState() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.authority.endSession(sessionId: "session-1", reason: .cancelled)
        await settle(h)
        XCTAssertTrue(h.client.live.isEmpty)
        XCTAssertEqual(h.client.ends.last?.dismissal, .immediate)
        XCTAssertNil(h.client.ends.last?.state)
    }

    func testDurableCommitShowsSavedThenDismissesAfterFifteenMinutes() async throws {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        await settle(h)
        h.authority.endSession(sessionId: "session-1", reason: .committed)
        await settle(h)
        let end = try XCTUnwrap(h.client.ends.last)
        XCTAssertEqual(end.state?.phase, .saved)
        XCTAssertEqual(end.state?.completedSets, 1)
        XCTAssertEqual(end.dismissal, .after(F.now.addingTimeInterval(15 * 60)))
        XCTAssertTrue(h.client.live.isEmpty)
    }

    func testFinishInFlightShowsSavingAndHidesCompleteSet() async throws {
        let h = harness(drafts: [liveDraft(step: .review)])
        await settle(h)
        XCTAssertEqual(h.client.live.first?.state.phase, .reviewing)
        XCTAssertTrue(h.authority.beginSubmission(sessionId: "session-1"))
        await settle(h)
        let state = try XCTUnwrap(h.client.live.first?.state)
        XCTAssertEqual(state.phase, .finishing)
        XCTAssertNil(state.target)
        h.authority.endSubmission(sessionId: "session-1")
        await settle(h)
        XCTAssertEqual(h.client.live.first?.state.phase, .reviewing)
    }

    func testAuthoritySwitchEndsTheOldAuthoritysActivity() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        XCTAssertEqual(h.client.live.count, 1)
        let other = TrainingSessionAuthority(store: TrainingSessionAuthorityTests.RecordingStore(), environment: .founderProduction, now: { F.now })
        h.coordinator.attach(to: other, environment: .founderProduction)
        await settle(h)
        XCTAssertTrue(h.client.live.isEmpty)
    }

    // MARK: Launch reconciliation, orphans, suppression

    func testLaunchAdoptsTheExistingActivityInsteadOfRequestingAnother() async {
        let client = FakeWorkoutLiveActivityClient()
        let draft = liveDraft()
        let projection = F.projection(draft)
        let seeded = client.seed(
            attributes: .init(projection: projection, authority: .sandbox, startedAtFallback: F.now),
            state: .init(projection: projection)
        )
        let h = harness(drafts: [draft], client: client)
        await settle(h)
        XCTAssertEqual(h.client.requests, 0)
        XCTAssertEqual(h.client.live.map(\.id), [seeded])
    }

    func testLaunchEndsOrphansDuplicatesAndOldSchemaThenRequestsFresh() async {
        let client = FakeWorkoutLiveActivityClient()
        let draft = liveDraft()
        let projection = F.projection(draft)
        let good = WorkoutActivityAttributes(projection: projection, authority: .sandbox, startedAtFallback: F.now)
        var otherSession = good; otherSession.sessionId = "gone"
        var oldSchema = good; oldSchema.schemaVersion = 0
        var otherAuthority = good; otherAuthority.authority = "founderProduction"
        let state = WorkoutActivityAttributes.ContentState(projection: projection)
        let keeper = client.seed(attributes: good, state: state)
        let duplicate = client.seed(attributes: good, state: state)
        client.seed(attributes: otherSession, state: state)
        client.seed(attributes: otherAuthority, state: state)
        let h = harness(drafts: [draft], client: client)
        await settle(h)
        XCTAssertEqual(h.client.live.map(\.id), [keeper])
        XCTAssertTrue(h.client.ends.contains { $0.id == duplicate && $0.dismissal == .immediate })
        XCTAssertEqual(h.client.ends.count, 3)

        let schemaClient = FakeWorkoutLiveActivityClient()
        schemaClient.seed(attributes: oldSchema, state: state)
        let h2 = harness(drafts: [draft], client: schemaClient)
        await settle(h2)
        XCTAssertEqual(schemaClient.requests, 1, "An old-schema activity is ended and re-requested with the current schema.")
        XCTAssertEqual(schemaClient.live.first?.attributes.schemaVersion, WorkoutActivityAttributes.currentSchemaVersion)
    }

    func testNoWorkoutEndsEveryLeftoverActivity() async {
        let client = FakeWorkoutLiveActivityClient()
        let projection = F.projection(liveDraft())
        client.seed(attributes: .init(projection: projection, authority: .sandbox, startedAtFallback: F.now), state: .init(projection: projection))
        let h = harness(drafts: [], client: client)
        await settle(h)
        XCTAssertTrue(client.live.isEmpty)
    }

    func testUserDismissalSuppressesThatSessionForever() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.client.userDismiss(id: h.client.live[0].id)
        h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        await settle(h)
        h.coordinator.reconcile()
        await settle(h)
        XCTAssertEqual(h.client.requests, 1, "A swiped-away activity is never resurrected.")
        XCTAssertTrue(h.client.live.isEmpty)
    }

    func testSuppressionIsBoundedAndKeepsTheNewestEntries() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let ids = (0..<45).map { "old-\($0)" }
        h.defaults.set(ids, forKey: WorkoutLiveActivityCoordinator.suppressedKey)
        h.coordinator.reconcile()
        await settle(h)
        let kept = h.defaults.stringArray(forKey: WorkoutLiveActivityCoordinator.suppressedKey) ?? []
        XCTAssertEqual(kept.count, 40)
        XCTAssertEqual(kept.last, "old-44")
        XCTAssertEqual(h.client.live.count, 1, "An unrelated suppressed id never affects the current workout.")
    }

    func testASystemEndingIsNeverASwipe() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.client.systemEnd(id: h.client.live[0].id) // 8 h limit / force quit / Settings: `.ended`, not `.dismissed`
        await settle(h)
        h.coordinator.reconcile()
        await settle(h)
        XCTAssertEqual(h.client.requests, 2, "The workout is still live, so the activity may be requested again.")
        XCTAssertFalse(h.coordinator.diagnostics.contains("suppressed"))
    }

    func testDismissingAnAlreadyEndedActivityIsNotASwipe() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let id = h.client.live[0].id
        h.client.systemEnd(id: id)
        h.client.userDismiss(id: id) // the system's later cleanup of the ended activity
        await settle(h)
        XCTAssertFalse(h.coordinator.diagnostics.contains("suppressed"))
        XCTAssertEqual(h.client.live.count, 1)
    }

    func testAnOldWorkoutResumedLaterIsStillSwipeSuppressed() async {
        // The 8 h guard measures the ACTIVITY, not the workout: a workout begun this
        // morning and resumed tonight gets a fresh activity whose swipe must stick.
        let morning = F.session(id: "morning", [F.exercise("a", "A", sets: [F.set("a1", 1), F.set("a2", 2)])], startedAt: F.stamp(9 * 3600))
        let h = harness(drafts: [morning])
        await settle(h)
        XCTAssertEqual(h.client.live.count, 1)
        h.client.userDismiss(id: h.client.live[0].id)
        await settle(h)
        h.coordinator.reconcile()
        await settle(h)
        XCTAssertEqual(h.client.requests, 1)
        XCTAssertTrue(h.client.live.isEmpty)
    }

    func testASwipeNearTheSystemLimitOfThisActivityIsTreatedAsTheSystem() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.clock.advance(WorkoutLiveActivityCoordinator.systemLimitGuard + 60)
        h.client.userDismiss(id: h.client.live[0].id)
        await settle(h)
        XCTAssertFalse(h.coordinator.diagnostics.contains("suppressed"))
    }

    func testTurningLiveActivitiesOffAndOnClearsSwipeSuppression() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.client.userDismiss(id: h.client.live[0].id)
        await settle(h)
        XCTAssertTrue(h.client.live.isEmpty)

        h.client.setEnabled(false)
        h.client.setEnabled(true)
        await settle(h)
        XCTAssertEqual(h.client.live.count, 1, "Re-enabling Live Activities is an explicit opt-in.")
    }

    func testEndingsMadeWhileDisabledNeverSuppress() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.client.setEnabled(false)
        h.client.systemEnd(id: h.client.live[0].id)
        h.client.setEnabled(true)
        await settle(h)
        XCTAssertEqual(h.client.live.count, 1)
    }

    func testOurOwnEndingsSurviveARelaunchOfTheCoordinator() async {
        let client = FakeWorkoutLiveActivityClient()
        client.dropsDismissedActivities = false // the ended record stays listed across the restart
        let h = harness(drafts: [liveDraft()], client: client)
        await settle(h)
        h.authority.saveAndLeave(sessionId: "session-1", leftAt: "2026-10-01T17:01:00Z")
        await settle(h)
        XCTAssertTrue(client.live.isEmpty)
        XCTAssertEqual(client.records.map(\.lifecycle), [.dismissed], "Precondition: our ended record is still listed.")
        // New process: same defaults, same client.
        let relaunched = WorkoutLiveActivityCoordinator(client: client, defaults: h.defaults, now: { F.now })
        h.authority.resume(sessionId: "session-1")
        relaunched.attach(to: h.authority, environment: .sandbox)
        for _ in 0..<4 { await Task.yield() }
        await relaunched.flush()
        XCTAssertEqual(client.live.count, 1, "A pre-restart Save & Leave ending must not read as a swipe.")
    }

    func testFlushWaitsForAnInFlightSyncAndRendersTheNewestState() async throws {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        h.client.holdUpdates = true
        h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        var spins = 0
        while h.client.heldCount == 0, spins < 200 { await Task.yield(); spins += 1 }
        XCTAssertEqual(h.client.heldCount, 1, "Precondition: a sync is suspended inside the held update.")

        h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        let flushFinished = FlagBox()
        let flushed = Task { @MainActor in
            await h.coordinator.flush()
            flushFinished.value = true
        }
        for _ in 0..<20 { await Task.yield() }
        XCTAssertFalse(flushFinished.value, "flush must not return while the in-flight sync has not rendered.")

        h.client.releaseUpdates()
        await flushed.value
        XCTAssertTrue(flushFinished.value)
        let state = try XCTUnwrap(h.client.live.first?.state)
        XCTAssertEqual(state.completedSets, 2, "flush returned only after the second completion was rendered.")
        XCTAssertEqual(state.target?.setId, "b3")
    }

    private final class FlagBox { var value = false }

    func testAStaleActivityIsRefreshedEvenWhenItsContentIsUnchanged() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let before = h.client.updates.count
        let id = h.client.live[0].id
        h.client.markStale(id: id)
        h.coordinator.reconcile()
        await settle(h)
        XCTAssertEqual(h.client.updates.count, before + 1)
    }

    // MARK: Authorization / platform

    func testDisabledActivitiesNeverAffectTheWorkout() async {
        let client = FakeWorkoutLiveActivityClient()
        client.areActivitiesEnabled = false
        let h = harness(drafts: [liveDraft()], client: client)
        await settle(h)
        XCTAssertEqual(client.requests, 0)
        XCTAssertEqual(h.authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1"), .applied(revision: 2))
        await settle(h)
        XCTAssertEqual(h.authority.draft(id: "session-1")?.completedSetCount, 1)
        XCTAssertTrue(h.coordinator.diagnostics.contains("disabled"))
    }

    func testBackgroundRequestIsRetriedWhenTheAppBecomesActive() async {
        let client = FakeWorkoutLiveActivityClient()
        client.requestError = .notForeground
        let h = harness(drafts: [liveDraft()], client: client)
        await settle(h)
        XCTAssertEqual(client.requests, 0)
        XCTAssertTrue(h.coordinator.diagnostics.contains("not-foreground"))
        client.requestError = nil
        h.coordinator.reconcile()
        await settle(h)
        XCTAssertEqual(client.requests, 1)
    }

    func testRequestFailureLeavesTheWorkoutUntouched() async {
        let client = FakeWorkoutLiveActivityClient()
        client.requestError = .failed("targetMaximumExceeded")
        let h = harness(drafts: [liveDraft()], client: client)
        await settle(h)
        XCTAssertTrue(h.coordinator.diagnostics.contains("request-failed"))
        XCTAssertEqual(h.authority.draft(id: "session-1")?.currentRevision, 1)
    }

    // MARK: Never authoritative

    func testNothingTheActivityReportsFeedsBackIntoTheWorkout() async {
        let h = harness(drafts: [liveDraft()])
        await settle(h)
        let before = h.authority.draft(id: "session-1")
        let persisted = h.store.persistCount
        h.client.userDismiss(id: h.client.live.first?.id ?? "")
        h.coordinator.reconcile()
        await settle(h)
        XCTAssertEqual(h.authority.draft(id: "session-1"), before)
        XCTAssertEqual(h.store.persistCount, persisted)
    }
}
