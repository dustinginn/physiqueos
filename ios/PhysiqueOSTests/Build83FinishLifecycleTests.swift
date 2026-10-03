import XCTest
@testable import PhysiqueOS

/// Build 83 deterministic coverage for the first real Build 82 workout:
/// one finish operation across phone and Watch, exactly one Training commit,
/// HealthKit never blocking structured durability, bounded transport waits,
/// recoverable finish UX, rest termination, terminal publication, and the
/// Add Set audit's rep-edit + Complete set-count invariant.
@MainActor
final class Build83FinishLifecycleTests: XCTestCase {
    private let api = FixtureTrainingLoggerAPI()
    private let t0 = ISO8601DateFormatter().date(from: "2026-10-02T22:55:12Z")!

    // MARK: Fixtures

    final class Clock: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Date
        init(_ value: Date) { self.value = value }
        var now: Date { lock.lock(); defer { lock.unlock() }; return value }
        func advance(_ seconds: TimeInterval) { lock.lock(); value = value.addingTimeInterval(seconds); lock.unlock() }
    }

    final class Store: TrainingLoggerDraftStore {
        private(set) var drafts: [TrainingLoggerDraft]
        init(_ drafts: [TrainingLoggerDraft] = []) { self.drafts = drafts }
        func loadAll() -> [TrainingLoggerDraft] { drafts }
        func save(_ draft: TrainingLoggerDraft) { try? persist(draft) }
        func persist(_ draft: TrainingLoggerDraft) throws {
            drafts.removeAll { $0.id == draft.id }
            drafts.append(draft)
        }
        func discard(id: String) { drafts.removeAll { $0.id == id } }
        func stored(_ id: String) -> TrainingLoggerDraft? { drafts.first { $0.id == id } }
    }

    /// A commit fake that can hold a commit in flight (`gated`), fail, and
    /// prove durability afterwards, recording every attempt.
    actor WriteAPI: TrainingWriteAPI {
        enum Outcome { case durable, fail, processing }
        private(set) var commits: [TrainingLoggerDraft] = []
        private var outcomes: [Outcome]
        private var gated: Bool
        private var waiters: [CheckedContinuation<Void, Never>] = []
        private(set) var durableIds: Set<String> = []
        private(set) var evidenceReconciles = 0

        init(outcomes: [Outcome] = [], gated: Bool = false) {
            self.outcomes = outcomes
            self.gated = gated
        }

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            commits.append(draft)
            if gated {
                try await withTaskCancellationHandler {
                    await withCheckedContinuation { waiters.append($0) }
                    try Task.checkCancellation()
                } onCancel: {
                    Task { await self.releaseWaiters() }
                }
            }
            let outcome = outcomes.isEmpty ? .durable : outcomes.removeFirst()
            switch outcome {
            case .fail:
                throw URLError(.notConnectedToInternet)
            case .processing:
                return .init(status: "accepted_processing", reviewId: nil, reviewRevision: nil,
                             sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: [])
            case .durable:
                durableIds.insert(draft.id)
                return .init(status: "durable", reviewId: nil, reviewRevision: nil,
                             sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: [])
            }
        }

        func release() {
            gated = false
            releaseWaiters()
        }

        func markDurable(_ id: String) { durableIds.insert(id) }

        private func releaseWaiters() {
            let pending = waiters
            waiters = []
            pending.forEach { $0.resume() }
        }

        var inFlight: Int { waiters.count }
        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { durableIds.contains(draft.id) }
        func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async { evidenceReconciles += 1 }
        nonisolated func localValidationError(for draft: TrainingLoggerDraft) -> TrainingWriteError? {
            ProductionTrainingWriteAPI.validateLocally(draft)
        }
    }

    private func set(_ id: String, _ number: Int, done: Bool = false) -> TrainingLoggerDraftSet {
        TrainingLoggerDraftSet(id: id, setNumber: number, reps: 8, load: 100, durationSeconds: nil, isCompleted: done)
    }

    private func exercise(_ id: String, sets: Int, done: Bool = false) -> TrainingLoggerDraftExercise {
        TrainingLoggerDraftExercise(
            id: id, canonicalExerciseId: "canonical-\(id)", name: id.capitalized, areaId: "chest",
            measurement: .repsLoad, defaultLoadType: nil, executionVariant: nil,
            sets: (1...sets).map { set("\(id)\($0)", $0, done: done) },
            previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
            isProvisional: false, provenance: nil
        )
    }

    /// The real workout's shape: 3 exercises, 4 + 4 + 5 = 13 sets,
    /// Watch-started (one Watch HealthKit workout).
    private func thirteenSetSession(done: Bool = false, watchStarted: Bool = true, step: TrainingLoggerStep = .workout) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-10-02", startedAt: "2026-10-02T22:55:12Z")
        draft.id = "session-1"
        draft.selectedAreaIds = ["chest"]
        draft.step = step
        draft.exercises = [exercise("a", sets: 4, done: done), exercise("b", sets: 4, done: done), exercise("c", sets: 5, done: done)]
        if watchStarted { draft.watchStartedAt = draft.startedAt }
        return draft
    }

    private func makeAuthority(
        _ store: Store,
        environment: NativeAPIEnvironment = .founderProduction,
        rest: TrainingRestConfiguration? = .stopwatch,
        clock: Clock,
        ledger: TrainingSessionTerminalLedgerStore = MemoryTrainingSessionTerminalLedgerStore()
    ) -> TrainingSessionAuthority {
        TrainingSessionAuthority(
            store: store, environment: environment,
            restPreferences: FixedTrainingRestPreferences(rest),
            terminalLedger: ledger,
            now: { clock.now }
        )
    }

    private func router(_ authority: TrainingSessionAuthority, _ clock: Clock) -> WatchWorkoutCommandRouter {
        WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
    }

    private func coordinator(_ authority: TrainingSessionAuthority, _ writeAPI: WriteAPI) -> WatchWorkoutFinishCoordinator {
        WatchWorkoutFinishCoordinator(
            dependencies: .init(
                authority: { authority }, writeAPI: { writeAPI }, isSandbox: { false }, backgroundScheduler: nil
            ),
            retryDelay: .milliseconds(10),
            maxAttempts: 3
        )
    }

    private func command(
        _ kind: WatchWorkoutCommand.Kind,
        _ authority: TrainingSessionAuthority,
        id: String,
        session: String = "session-1",
        exerciseId: String? = nil,
        setId: String? = nil,
        finishOperationId: String? = nil,
        revision: Int? = nil
    ) -> WatchWorkoutCommand {
        .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: id, mutationId: id, kind: kind, sessionId: session,
            expectedRevision: revision ?? authority.draft(id: session)?.currentRevision ?? 0,
            exerciseId: exerciseId, setId: setId, finishOperationId: finishOperationId,
            issuedAt: Date(timeIntervalSince1970: 0)
        )
    }

    private func completeAllSets(_ authority: TrainingSessionAuthority, _ router: WatchWorkoutCommandRouter) {
        for exercise in authority.draft(id: "session-1")!.exercises {
            for set in exercise.sets {
                let ack = router.route(command(.completeSet, authority, id: "c-\(set.id)", exerciseId: exercise.id, setId: set.id))
                XCTAssertEqual(ack.status, .applied)
            }
        }
    }

    private func waitUntil(
        timeout: TimeInterval = 3,
        _ message: String = "condition",
        _ condition: () async -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Timed out waiting for \(message)")
    }

    // MARK: 1. Today's exact sequence: final-set Finish -> confirmation, never "finishing"

    func testFinalSetFinishRequestPresentsConfirmationNotFinishingAndHidesRest() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let router = router(authority, clock)
        completeAllSets(authority, router)
        XCTAssertNotNil(authority.draft(id: "session-1")?.rest, "The final set started a rest Stopwatch.")
        let active = try XCTUnwrap(router.currentProjection())
        XCTAssertEqual(active.completedSets, 13)
        XCTAssertEqual(active.totalSets, 13)

        let ack = router.route(command(.requestFinish, authority, id: "request"))
        XCTAssertEqual(ack.status, .applied)
        let projection = try XCTUnwrap(ack.projection)
        XCTAssertEqual(projection.phase, .finishConfirmation, "A requested finish is a confirmation, not finishing.")
        XCTAssertEqual(projection.finishEligibility, .confirmable)
        XCTAssertNil(projection.rest, "Rest is hidden the moment Finish is requested.")
        XCTAssertNil(projection.finish, "No finish operation exists before confirmation.")
        XCTAssertNil(authority.draft(id: "session-1")?.finishedAt)
    }

    func testNotYetReturnsActiveAndRestoresRestFromItsAnchor() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let router = router(authority, clock)
        completeAllSets(authority, router)
        let restBefore = try XCTUnwrap(router.currentProjection()?.rest)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        clock.advance(20)
        let notYet = router.route(command(.cancelFinish, authority, id: "not-yet"))
        XCTAssertEqual(notYet.status, .applied)
        let projection = try XCTUnwrap(notYet.projection)
        XCTAssertEqual(projection.phase, .active)
        XCTAssertEqual(projection.rest?.id, restBefore.id, "Not Yet restores the same interval.")
        XCTAssertEqual(projection.rest?.startedAt, restBefore.startedAt, "Anchored at its real start; nothing restarted.")
    }

    // MARK: 2. One finish operation, one commit, HealthKit independent

    func testWatchConfirmMintsOneOperationAndProjectsFinishingWithFinishedAt() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let router = router(authority, clock)
        completeAllSets(authority, router)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        clock.advance(3)
        let confirm = router.route(command(.confirmFinish, authority, id: "confirm-op"))
        XCTAssertEqual(confirm.status, .applied)
        let projection = try XCTUnwrap(confirm.projection)
        XCTAssertEqual(projection.phase, .finishing)
        XCTAssertEqual(projection.finish?.operationId, "confirm-op")
        XCTAssertEqual(projection.finish?.healthExpected, true)
        XCTAssertTrue(projection.requiresHealthSave, "The Watch ends and saves its HealthKit workout.")
        XCTAssertEqual(projection.finishedAt, clock.now)
        XCTAssertNil(projection.rest)

        // A lost acknowledgement retried with the same mutation id is unchanged.
        let replay = router.route(command(.confirmFinish, authority, id: "confirm-op", revision: confirm.acknowledgedRevision))
        XCTAssertEqual(replay.status, .unchanged)
        XCTAssertEqual(authority.draft(id: "session-1")?.watchFinishOperationId, "confirm-op")
    }

    func testPhoneFinishOfWatchStartedWorkoutDrivesTheWatchHealthSaveWithOneCommit() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true, step: .review)])
        let authority = makeAuthority(store, clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI(gated: true)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        viewModel.finish()
        await waitUntil("commit in flight") { await writeAPI.inFlight == 1 }

        // While the phone commit is in flight the Watch is told to save HealthKit.
        let during = try XCTUnwrap(router.currentProjection())
        XCTAssertEqual(during.phase, .finishing)
        let operationId = try XCTUnwrap(during.finish?.operationId)
        XCTAssertTrue(during.requiresHealthSave)
        XCTAssertTrue(viewModel.isSubmitting)

        // A late Watch Finish joins the same operation (no second commit).
        let lateWatchConfirm = router.route(command(.confirmFinish, authority, id: "late-watch"))
        XCTAssertEqual(lateWatchConfirm.status, .unchanged)
        XCTAssertEqual(lateWatchConfirm.projection?.finish?.operationId, operationId)

        await writeAPI.release()
        await waitUntil("session ended") { authority.drafts.isEmpty }
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1, "Exactly one Training commit.")
        XCTAssertEqual(commits.first?.watchFinishOperationId, operationId)
        let pending = try XCTUnwrap(authority.pendingCompletion(id: "session-1"))
        XCTAssertEqual(pending.watchFinishOperationId, operationId)
        XCTAssertEqual(pending.watchHealthSaveState, .pending, "Structured durability did not wait for HealthKit.")
        let committed = try XCTUnwrap(router.currentProjection())
        XCTAssertEqual(committed.phase, .committed)
        XCTAssertTrue(committed.requiresHealthSave, "A Watch that missed .finishing still saves on .committed.")
        XCTAssertEqual(viewModel.draft?.step, .complete)
    }

    func testPhoneFinishWhileWatchConfirmationIsRequestedUsesTheSameOperation() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true, step: .review)])
        let authority = makeAuthority(store, clock: clock)
        let router = router(authority, clock)
        XCTAssertEqual(router.route(command(.requestFinish, authority, id: "watch-request")).projection?.phase, .finishConfirmation)

        let writeAPI = WriteAPI()
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()

        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1)
        let operationId = try XCTUnwrap(commits.first?.watchFinishOperationId)
        XCTAssertNil(commits.first?.finishConfirmationRequestedAt, "The phone Finish closed the Watch confirmation.")
        XCTAssertEqual(authority.terminalRecord(sessionId: "session-1")?.finishOperationId, operationId)
        // The Watch's confirm arriving afterwards cannot finish twice.
        let late = router.route(command(.confirmFinish, authority, id: "watch-confirm"))
        XCTAssertEqual(late.status, .unchanged)
        XCTAssertNotEqual(late.projection?.phase, .cancelled)
    }

    func testPhoneFinishJoinsAnInFlightWatchFinishCommit() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true)])
        let authority = makeAuthority(store, clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI(gated: true)
        let coordinator = coordinator(authority, writeAPI)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "watch-op"))
        coordinator.reconcile()
        await waitUntil("watch commit in flight") { await writeAPI.inFlight == 1 }
        XCTAssertTrue(authority.isSubmitting(sessionId: "session-1"))

        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        viewModel.finish()
        try await Task.sleep(for: .milliseconds(80))
        XCTAssertTrue(viewModel.isSubmitting, "The phone Finish joins (Saving…), it is not refused.")
        XCTAssertNil(viewModel.validationMessage)

        await writeAPI.release()
        await waitUntil("joined finish completes") { viewModel.draft?.step == .complete }
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1, "One commit owner.")
        XCTAssertEqual(authority.pendingCompletion(id: "session-1")?.watchFinishOperationId, "watch-op")
    }

    func testDelayedHealthKitNeverBlocksStructuredDurabilityAndLateReportIsRecordedOnce() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true)]), clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI()
        let coordinator = coordinator(authority, writeAPI)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-1"))
        coordinator.reconcile()
        await waitUntil("structured commit ends the session") { authority.drafts.isEmpty }
        XCTAssertEqual(authority.pendingCompletion(id: "session-1")?.watchHealthSaveState, .pending)

        clock.advance(120) // HealthKit finish took two minutes.
        let wrong = router.route(command(.reportHealthSaved, authority, id: "h-wrong", finishOperationId: "other-op"))
        XCTAssertEqual(wrong.status, .rejected)
        XCTAssertNotEqual(wrong.projection?.phase, .cancelled, "A committed session never answers cancelled.")
        let report = router.route(command(.reportHealthSaved, authority, id: "h-1", finishOperationId: "op-1"))
        XCTAssertEqual(report.status, .applied)
        XCTAssertEqual(authority.pendingCompletion(id: "session-1")?.watchHealthSaveState, .succeeded)
        XCTAssertEqual(authority.terminalRecord(sessionId: "session-1")?.healthSaveState, .succeeded)
        let duplicate = router.route(command(.reportHealthSaved, authority, id: "h-2", finishOperationId: "op-1"))
        XCTAssertEqual(duplicate.status, .unchanged)
        let downgrade = router.route(command(.reportHealthSaveFailed, authority, id: "h-3", finishOperationId: "op-1"))
        XCTAssertEqual(downgrade.status, .unchanged, "A saved workout is never downgraded by a late failure.")
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1)
    }

    func testDelayedServerRetriesWithTheSameFinishIdentity() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true)]), clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI(outcomes: [.fail, .fail, .durable])
        let coordinator = coordinator(authority, writeAPI)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-1"))
        coordinator.reconcile()
        await waitUntil("durable after retries") { authority.drafts.isEmpty }
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 3)
        XCTAssertEqual(Set(commits.map(\.finishedAt)).count, 1, "Same persisted finish window -> same idempotency key.")
        XCTAssertEqual(Set(commits.map(\.watchFinishOperationId)), ["op-1"])
        XCTAssertEqual(Set(commits.map { TrainingPerformedSessionProjection.make(from: $0).exercises.flatMap(\.sets).count }), [13])
    }

    func testLostPhoneAcknowledgementResolvesByDurabilityProofWithoutASecondCommit() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true)])
        var draft = thirteenSetSession(done: true)
        draft.finishedAt = "2026-10-02T23:58:45Z"
        draft.watchFinishOperationId = "op-lost"
        draft.watchServerCommitState = .pending
        draft.watchHealthSaveState = .pending
        try store.persist(draft)
        let authority = makeAuthority(store, clock: clock)
        let writeAPI = WriteAPI()
        _ = try await writeAPI.commit(draft) // The Server committed; the reply was lost.
        let coordinator = coordinator(authority, writeAPI)
        coordinator.reconcile()
        await waitUntil("recovered by readback") { authority.drafts.isEmpty }
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1, "isDraftAlreadyDurable resolves it; no second commit.")
        XCTAssertNotNil(authority.pendingCompletion(id: "session-1"))
    }

    func testRelaunchMidSavingResumesTheSameOperationAndPresentsCompletionOnce() async throws {
        let clock = Clock(t0)
        var draft = thirteenSetSession(done: true, step: .review)
        draft.finishedAt = "2026-10-02T23:58:45Z"
        draft.watchFinishOperationId = "op-phone"
        draft.watchServerCommitState = .pending
        draft.watchHealthSaveState = .pending
        let store = Store([draft])
        // "Relaunch": a fresh authority over the persisted draft, durable already.
        let authority = makeAuthority(store, clock: clock)
        let writeAPI = WriteAPI()
        _ = try await writeAPI.commit(draft)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        XCTAssertEqual(viewModel.draft?.step, .complete, "Relaunch re-proves durability and shows Workout Complete.")
        XCTAssertNotNil(authority.pendingCompletion(id: "session-1"), "A confirmed finish keeps its presentation.")
        XCTAssertEqual(authority.terminalRecord(sessionId: "session-1")?.finishOperationId, "op-phone")
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1, "Nothing was re-created.")
    }

    func testDuplicatePhoneFinishTapsCommitOnce() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true, step: .review)]), clock: clock)
        let writeAPI = WriteAPI(gated: true)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        viewModel.finish()
        viewModel.finish()
        await waitUntil("in flight") { await writeAPI.inFlight == 1 }
        await writeAPI.release()
        await waitUntil("complete") { viewModel.draft?.step == .complete }
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1)
    }

    // MARK: 5. Recoverable finish UX

    func testStillSavingAfterTwentySecondsAndRetryReusesTheSameFinish() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true, step: .review)]), clock: clock)
        let writeAPI = WriteAPI(gated: true)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        viewModel.finish()
        await waitUntil("in flight") { await writeAPI.inFlight == 1 }
        XCTAssertFalse(viewModel.isStillSaving(at: clock.now.addingTimeInterval(19)))
        XCTAssertTrue(viewModel.isStillSaving(at: clock.now.addingTimeInterval(21)), "Honest Still saving after ~20 s.")

        // Retry abandons the stalled attempt and sends the same finish again.
        viewModel.retryFinish()
        await waitUntil("second attempt in flight") { await writeAPI.commits.count == 2 }
        await writeAPI.release()
        await waitUntil("complete") { viewModel.draft?.step == .complete }
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 2)
        XCTAssertEqual(commits[0].finishedAt, commits[1].finishedAt)
        XCTAssertEqual(commits[0].watchFinishOperationId, commits[1].watchFinishOperationId)
        XCTAssertNil(viewModel.validationMessage, "A replaced attempt reports no failure.")
        XCTAssertEqual(authority.pendingCompletions.count, 1, "One completion.")
    }

    // MARK: 7/8. Rest termination, frozen finish, terminal publication

    func testRestIsHiddenFromTheLiveActivityDuringFinishConfirmation() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let router = router(authority, clock)
        let first = authority.draft(id: "session-1")!.exercises[0].sets[0]
        _ = router.route(command(.completeSet, authority, id: "c1", exerciseId: "a", setId: first.id))
        var draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertNotNil(TrainingSessionLiveProjection.make(from: draft, now: clock.now)?.rest)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        draft = try XCTUnwrap(authority.draft(id: "session-1"))
        let live = try XCTUnwrap(TrainingSessionLiveProjection.make(from: draft, now: clock.now))
        XCTAssertNil(live.rest)
        XCTAssertNil(WorkoutActivityAttributes.ContentState(projection: live).rest)
    }

    func testConfirmedFinishFreezesWatchAndLiveActivitySetMutations() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let router = router(authority, clock)
        _ = router.route(command(.completeSet, authority, id: "c1", exerciseId: "a", setId: "a1"))
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op"))
        let set = authority.draft(id: "session-1")!.exercises[0].sets[1]
        let intent = authority.completeSet(
            sessionId: "session-1", exerciseId: "a", setId: set.id,
            context: .intent(mutationId: "late-intent", expectedRevision: authority.draft(id: "session-1")!.currentRevision)
        )
        XCTAssertEqual(intent, .rejected(.sessionNotMutable), "The commit payload (and key) cannot change after confirm.")
        let draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(TrainingSessionLiveProjection.make(from: draft, now: clock.now)?.phase, .finishing)
    }

    func testReturnToLogPublishesTerminalImmediatelyAndCarriesTheCommittedOperation() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true)]), clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI()
        let coordinator = coordinator(authority, writeAPI)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-1"))
        coordinator.reconcile()
        await waitUntil("ended") { authority.drafts.isEmpty }

        var changes: [TrainingSessionChange] = []
        let observation = authority.observeChanges { changes.append($0) }
        defer { observation.cancel() }
        XCTAssertTrue(authority.acknowledgeCompletion(sessionId: "session-1"))
        XCTAssertEqual(changes.last?.kind, .completionAcknowledged, "Published at once (the bridge republishes on it).")
        let projection = router.currentProjection() ?? router.unavailableProjection()
        XCTAssertEqual(projection.phase, .unavailable)
        let ended = try XCTUnwrap(projection.recentlyEnded.first { $0.sessionId == "session-1" })
        XCTAssertEqual(ended.outcome, .committed)
        XCTAssertEqual(ended.finishOperationId, "op-1", "A Watch still holding HealthKit saves, never discards.")

        // Late Watch commands for the committed session never get a cancelled terminal.
        for kind in [WatchWorkoutCommand.Kind.cancelWorkout, .completeSet, .confirmFinish, .pause] {
            let ack = router.route(command(kind, authority, id: "late-\(kind.rawValue)", exerciseId: "a", setId: "a1", revision: 3))
            XCTAssertNotEqual(ack.projection?.phase, .cancelled, "\(kind)")
        }
    }

    func testCancelledSessionStillAnswersCancelledAcrossRelaunchViaTheLedger() {
        let clock = Clock(t0)
        let ledger = MemoryTrainingSessionTerminalLedgerStore()
        let store = Store([thirteenSetSession()])
        let authority = makeAuthority(store, clock: clock, ledger: ledger)
        let cancel = command(.cancelWorkout, authority, id: "cancel-1")
        XCTAssertEqual(router(authority, clock).route(cancel).projection?.phase, .cancelled)

        let relaunched = makeAuthority(store, clock: clock, ledger: ledger)
        let replay = router(relaunched, clock).route(cancel)
        XCTAssertEqual(replay.status, .unchanged, "A lost Cancel ack replays idempotently after relaunch.")
        XCTAssertEqual(replay.projection?.phase, .cancelled)
        let unknown = router(relaunched, clock).route(command(.completeSet, relaunched, id: "x", session: "never-seen", exerciseId: "a", setId: "a1"))
        XCTAssertEqual(unknown.projection?.phase, .unavailable, "An unknown session is unavailable, not cancelled.")
    }

    // MARK: Review fixes (fresh independent review)

    /// The real bridge wiring: every authority change re-enters the finish
    /// coordinator synchronously. An interactive phone Finish still owns its
    /// commit (lock taken before the finish is stamped), so the coordinator
    /// never takes it over and supporting evidence reconciles exactly once.
    func testInteractivePhoneFinishOwnsItsCommitWithTheRealCoordinatorWiring() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true, step: .review)]), clock: clock)
        let writeAPI = WriteAPI()
        let coordinator = coordinator(authority, writeAPI)
        let wiring = authority.observeChanges { _ in coordinator.reconcile() }
        defer { wiring.cancel() }
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()
        XCTAssertFalse(coordinator.isCommitting(sessionId: "session-1"), "The coordinator never took the phone's commit.")
        XCTAssertEqual(viewModel.draft?.step, .complete)
        try await Task.sleep(for: .milliseconds(100))
        let commits = await writeAPI.commits
        let reconciles = await writeAPI.evidenceReconciles
        XCTAssertEqual(commits.count, 1)
        XCTAssertEqual(reconciles, 1, "Supporting evidence reconciles exactly once.")
    }

    func testWatchFinishCommittedByTheCoordinatorReconcilesEvidenceOnce() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true)]), clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI()
        let coordinator = coordinator(authority, writeAPI)
        let wiring = authority.observeChanges { _ in coordinator.reconcile() }
        defer { wiring.cancel() }
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-1"))
        await waitUntil("ended") { authority.drafts.isEmpty }
        try await Task.sleep(for: .milliseconds(100))
        let reconciles = await writeAPI.evidenceReconciles
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1)
        XCTAssertEqual(reconciles, 1, "The re-entrant callback no longer ends the session before its owner.")
    }

    func testAConfirmedFinishIsFrozenOnThePhoneAfterAFailedCommit() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true, step: .review)])
        let authority = makeAuthority(store, clock: clock)
        let writeAPI = WriteAPI(outcomes: [.fail])
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()
        XCTAssertNotNil(viewModel.validationMessage)
        XCTAssertTrue(viewModel.isFinishConfirmed)
        let frozen = try XCTUnwrap(authority.draft(id: "session-1"))

        viewModel.setValue(exerciseId: "a", setId: "a1", field: .reps, value: 99)
        viewModel.setCompletion(exerciseId: "a", setId: "a2", completed: false)
        viewModel.go(to: .workout)
        viewModel.saveAndLeave()
        viewModel.cancelWorkout()
        XCTAssertEqual(authority.endSession(sessionId: "session-1", reason: .cancelled), .rejected(.sessionNotMutable))
        XCTAssertEqual(authority.saveAndLeave(sessionId: "session-1", leftAt: "2026-10-02T23:59:00Z"), .rejected(.sessionNotMutable))
        let after = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(after.exercises, frozen.exercises, "The committed payload cannot change after confirm.")
        XCTAssertNil(after.leftAt)

        await viewModel.submit() // Retry: the same finish.
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 2)
        XCTAssertEqual(commits[0].exercises, commits[1].exercises)
        XCTAssertEqual(commits[0].finishedAt, commits[1].finishedAt)
        XCTAssertTrue(authority.drafts.isEmpty)
    }

    func testAFinishThatCannotBeCommittedIsNeverStamped() async throws {
        let clock = Clock(t0)
        var draft = thirteenSetSession(done: true, step: .review)
        draft.exercises[0].canonicalExerciseId = nil
        let authority = makeAuthority(Store([draft]), clock: clock)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: WriteAPI(), sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()
        XCTAssertNotNil(viewModel.validationMessage)
        XCTAssertNil(authority.draft(id: "session-1")?.watchFinishOperationId, "Fixable locally: not frozen.")
        XCTAssertFalse(viewModel.isFinishConfirmed)
    }

    func testWatchCannotFinishAWorkoutWithNoCompletedSet() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let ack = router(authority, clock).route(command(.requestFinish, authority, id: "empty-finish"))
        XCTAssertEqual(ack.status, .rejected)
        XCTAssertEqual(ack.reason, .noCompletedSets)
        XCTAssertNil(authority.draft(id: "session-1")?.finishConfirmationRequestedAt)
    }

    func testRecentlyEndedListsCommittedSessionsAheadOfDiscards() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true)])
        let authority = makeAuthority(store, clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI()
        let coordinator = coordinator(authority, writeAPI)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-kept"))
        coordinator.reconcile()
        await waitUntil("committed") { authority.drafts.isEmpty }
        for index in 0..<5 {
            clock.advance(60)
            var discarded = thirteenSetSession()
            discarded.id = "discard-\(index)"
            try store.persist(discarded)
            authority.reloadFromStore()
            _ = authority.endSession(sessionId: discarded.id, reason: .discarded)
        }
        let ended = router.unavailableProjection().recentlyEnded
        XCTAssertTrue(ended.contains { $0.sessionId == "session-1" && $0.outcome == .committed && $0.finishOperationId == "op-kept" })
        XCTAssertLessThanOrEqual(ended.count, WatchWorkoutContract.maximumRecentlyEndedSessions)
    }

    // MARK: Fresh re-review fixes (N3, N5, N6)

    func testDiscardingAConfirmedFinishIsRefusedWhileCommittingAndOtherwiseKeepsTheFinish() async throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(done: true)])
        let authority = makeAuthority(store, clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI(gated: true)
        let coordinator = coordinator(authority, writeAPI)
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-1"))
        coordinator.reconcile()
        await waitUntil("committing") { await writeAPI.inFlight == 1 }
        XCTAssertEqual(authority.endSession(sessionId: "session-1", reason: .discarded), .rejected(.sessionNotMutable),
                       "Nothing ends a session while its commit is in flight.")
        await writeAPI.release()
        await waitUntil("ended") { authority.drafts.isEmpty }

        // A frozen finish that cannot commit can be discarded (escape hatch);
        // the Watch is told the finish existed, so it saves HealthKit.
        var stuck = thirteenSetSession(done: true)
        stuck.id = "session-2"
        stuck.finishedAt = "2026-10-02T23:58:45Z"
        stuck.watchFinishOperationId = "op-2"
        stuck.watchServerCommitState = .failed
        stuck.watchHealthSaveState = .pending
        try store.persist(stuck)
        authority.reloadFromStore()
        XCTAssertTrue(authority.endSession(sessionId: "session-2", reason: .discarded).isAccepted)
        let record = try XCTUnwrap(authority.terminalRecord(sessionId: "session-2"))
        XCTAssertEqual(record.outcome, .discardedAfterFinish)
        XCTAssertEqual(record.finishOperationId, "op-2")
        let ended = router.unavailableProjection().recentlyEnded.first { $0.sessionId == "session-2" }
        XCTAssertEqual(ended?.outcome, .discardedAfterFinish)
        XCTAssertFalse(authority.isCancelled(sessionId: "session-2"))
    }

    func testWatchConfirmIsRefusedWhenSetsWereUncheckedOrTheFinishCannotCommit() throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession()]), clock: clock)
        let router = router(authority, clock)
        _ = router.route(command(.completeSet, authority, id: "c1", exerciseId: "a", setId: "a1"))
        _ = router.route(command(.requestFinish, authority, id: "request"))
        // The phone unchecks the only completed set before the Watch confirms.
        authority.setCompletion(sessionId: "session-1", exerciseId: "a", setId: "a1", completed: false)
        let confirm = router.route(command(.confirmFinish, authority, id: "op"))
        XCTAssertEqual(confirm.status, .rejected)
        XCTAssertNil(authority.draft(id: "session-1")?.watchFinishOperationId, "Never frozen uncommittable.")

        let validating = WatchWorkoutCommandRouter(
            authority: authority, isPhoneReachable: { true }, canCommitFinish: { _ in false }, now: { clock.now }
        )
        _ = validating.route(command(.completeSet, authority, id: "c2", exerciseId: "a", setId: "a1"))
        let invalid = validating.route(command(.confirmFinish, authority, id: "op-invalid"))
        XCTAssertEqual(invalid.status, .rejected)
        XCTAssertNil(authority.draft(id: "session-1")?.watchFinishOperationId)
    }

    func testAnOpenLoggerRecoversAFinishThatCameBackAmbiguousElsewhere() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true)]), clock: clock)
        let router = router(authority, clock)
        let writeAPI = WriteAPI(outcomes: [.processing, .processing, .processing])
        let coordinator = coordinator(authority, writeAPI)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction,
            durabilityRecoveryDelay: .milliseconds(20), now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        _ = router.route(command(.requestFinish, authority, id: "request"))
        _ = router.route(command(.confirmFinish, authority, id: "op-1"))
        coordinator.reconcile()
        await waitUntil("coordinator done, ambiguous") {
            !coordinator.isCommitting(sessionId: "session-1") && authority.draft(id: "session-1")?.submissionState != nil
        }
        XCTAssertTrue(viewModel.isAwaitingDurability)
        XCTAssertTrue(viewModel.isStillSaving(at: clock.now.addingTimeInterval(25)), "Still saving / Retry is offered.")
        await writeAPI.markDurable("session-1")
        await waitUntil("recovered") { viewModel.draft?.step == .complete }
    }

    // MARK: 13-set performed fixture

    func testThirteenSetPerformedFixtureCommitsExactlyThirteenSets() async throws {
        let clock = Clock(t0)
        let authority = makeAuthority(Store([thirteenSetSession(done: true, step: .review)]), clock: clock)
        let writeAPI = WriteAPI()
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction, now: { clock.now }
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()
        let commits = await writeAPI.commits
        let committed = try XCTUnwrap(commits.first)
        let performed = TrainingPerformedSessionProjection.make(from: committed)
        XCTAssertEqual(performed.exercises.map { $0.sets.count }, [4, 4, 5])
        XCTAssertEqual(performed.exercises.flatMap(\.sets).count, 13)
    }

    // MARK: 16. Add Set audit: rep edit + Complete never changes the set list

    func testEditingRepsThenCompletingNeverAddsRemovesOrReordersSets() throws {
        let clock = Clock(t0)
        let store = Store([thirteenSetSession(watchStarted: false)])
        let authority = makeAuthority(store, environment: .sandbox, clock: clock)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority, now: { clock.now })
        viewModel.resume(draftId: "session-1")
        let originalIds = authority.draft(id: "session-1")!.exercises.map { $0.sets.map(\.id) }

        for setId in ["a1", "a4"] { // the current set, and the last row (next to Add Set)
            viewModel.setValue(exerciseId: "a", setId: setId, field: .reps, value: 1)
            viewModel.setValue(exerciseId: "a", setId: setId, field: .reps, value: 12)
            viewModel.setCompletion(exerciseId: "a", setId: setId, completed: true)
            let revision = authority.draft(id: "session-1")!.currentRevision
            viewModel.setValue(exerciseId: "a", setId: setId, field: .reps, value: 12)
            XCTAssertEqual(authority.draft(id: "session-1")!.currentRevision, revision, "A repeated keystroke is unchanged.")
            let stale = authority.completeSet(
                sessionId: "session-1", exerciseId: "a", setId: setId,
                context: .intent(mutationId: "stale-\(setId)", expectedRevision: 0)
            )
            XCTAssertNotEqual(stale, .applied(revision: revision + 1))

            let draft = try XCTUnwrap(authority.draft(id: "session-1"))
            XCTAssertEqual(draft.exercises.map { $0.sets.map(\.id) }, originalIds)
            XCTAssertEqual(draft.exercises[0].sets.map(\.setNumber), [1, 2, 3, 4])
            XCTAssertEqual(draft.totalSetCount, 13)
            let target = try XCTUnwrap(draft.exercises[0].sets.first { $0.id == setId })
            XCTAssertEqual(target.reps, 12)
            XCTAssertTrue(target.isCompleted)
            XCTAssertEqual(store.stored("session-1"), draft)
        }
        XCTAssertEqual(authority.draft(id: "session-1")?.completedSetCount, 2)
        XCTAssertEqual(viewModel.workoutPresentation?.progress, "2/13 sets")

        // Control: Add Set is the only path that grows the list, and it
        // pre-fills the last set's values, which is why it can look like a
        // duplicated set; the copy is incomplete and never committed.
        viewModel.update { $0.addSet(to: "a") }
        let added = try XCTUnwrap(authority.draft(id: "session-1")?.exercises[0].sets.last)
        XCTAssertFalse(originalIds[0].contains(added.id))
        XCTAssertEqual(added.reps, 12)
        XCTAssertFalse(added.isCompleted)
        XCTAssertNil(added.completedAt)
        let performed = TrainingPerformedSessionProjection.make(from: authority.draft(id: "session-1")!)
        XCTAssertEqual(performed.exercises.flatMap(\.sets).count, 2, "Only completed sets are committed.")
    }

    // MARK: 3/6. Command transport: bounded connectivity waits, session recreation, diagnostics

    private struct FixedPath: NetworkPathProviding {
        let snapshot: NetworkPathSnapshot
        func currentSnapshot() -> NetworkPathSnapshot { snapshot }
    }

    final class Flag: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func hit() { lock.lock(); value += 1; lock.unlock() }
        var count: Int { lock.lock(); defer { lock.unlock() }; return value }
    }

    func testWaitingOnASatisfiedPathIsCancelledAtOnceAsAStuckSession() {
        let delegate = MetricsCollectingDelegate(connectivityBudget: 12, pathProvider: FixedPath(snapshot: .unavailable))
        let cancelled = Flag()
        let scheduled = Flag()
        delegate.handleWaiting(
            snapshot: NetworkPathSnapshot(status: "satisfied", interface: "wifi", isConstrained: false, isExpensive: false),
            cancel: { cancelled.hit() }, isStillWaiting: { true }, schedule: { _, _ in scheduled.hit() }
        )
        XCTAssertEqual(cancelled.count, 1, "Reads work but this session waits: cancel now, retry on a fresh session.")
        XCTAssertEqual(scheduled.count, 0)
        XCTAssertEqual(delegate.waitOutcome, .stuckPathSatisfied)
    }

    func testConnectivityWaitIsBoundedByTheInteractiveBudgetNotSixtySeconds() {
        XCTAssertLessThanOrEqual(CommandNetworkDiagnosticsTransport.interactiveConnectivityBudget, 15)
        let delegate = MetricsCollectingDelegate(connectivityBudget: 12, pathProvider: FixedPath(snapshot: .unavailable))
        let cancelled = Flag()
        var budget: TimeInterval?
        delegate.handleWaiting(
            snapshot: NetworkPathSnapshot(status: "unsatisfied", interface: nil, isConstrained: nil, isExpensive: nil),
            cancel: { cancelled.hit() }, isStillWaiting: { true },
            schedule: { delay, work in budget = delay; work() }
        )
        XCTAssertEqual(budget, 12)
        XCTAssertEqual(cancelled.count, 1)
        XCTAssertEqual(delegate.waitOutcome, .budgetExceeded)

        // A task that connected (bytes sent) inside the budget is left alone.
        let connected = MetricsCollectingDelegate(connectivityBudget: 12, pathProvider: FixedPath(snapshot: .unavailable))
        let untouched = Flag()
        connected.handleWaiting(
            snapshot: NetworkPathSnapshot(status: "unsatisfied", interface: nil, isConstrained: nil, isExpensive: nil),
            cancel: { untouched.hit() }, isStillWaiting: { false }, schedule: { _, work in work() }
        )
        XCTAssertEqual(untouched.count, 0)
        XCTAssertEqual(connected.waitOutcome, .none)
    }

    func testCommandSessionIsRecreatedOncePerFailedGeneration() {
        let made = Flag()
        let pool = CommandURLSessionPool {
            made.hit()
            return URLSession(configuration: .ephemeral)
        }
        let first = pool.current()
        XCTAssertEqual(first.generation, 0)
        XCTAssertEqual(pool.recreate(after: 0), 1)
        XCTAssertNil(pool.recreate(after: 0), "Two attempts failing on the same session recreate it once.")
        XCTAssertFalse(pool.current().session === first.session)
        XCTAssertEqual(made.count, 2)
        let fixed = CommandURLSessionPool(fixed: .shared)
        XCTAssertNil(fixed.recreate(after: 0), "A fixed (test) session is never replaced.")
    }

    func testTransportFailureClassificationExcludesCallerCancellation() {
        XCTAssertTrue(CommandNetworkDiagnosticsTransport.isTransportFailure(URLError(.timedOut)))
        XCTAssertTrue(CommandNetworkDiagnosticsTransport.isTransportFailure(URLError(.networkConnectionLost)))
        XCTAssertTrue(CommandNetworkDiagnosticsTransport.isTransportFailure(URLError(.notConnectedToInternet)))
        XCTAssertFalse(CommandNetworkDiagnosticsTransport.isTransportFailure(URLError(.cancelled)))
        XCTAssertFalse(CommandNetworkDiagnosticsTransport.isTransportFailure(URLError(.badServerResponse)))
    }

    func testCommitAttemptBudgetsCoverTheObservedSixSecondServerCommit() {
        XCTAssertGreaterThanOrEqual(ProductionTrainingWriteAPI.commitAttemptTimeouts.first ?? 0, 15)
        XCTAssertGreaterThan(ProductionTrainingWriteAPI.commitAttemptTimeouts.last ?? 0, 6.75)
    }

    func testConnectionRefusedRecreatesTheCommandSessionAndRecordsItForExport() async throws {
        let defaults = UserDefaults(suiteName: "Build83.transport")!
        defaults.removePersistentDomain(forName: "Build83.transport")
        let made = Flag()
        let transport = CommandNetworkDiagnosticsTransport(
            pool: CommandURLSessionPool {
                made.hit()
                return URLSession(configuration: .ephemeral)
            },
            pathProvider: FixedPath(snapshot: .unavailable),
            recordEvent: { CommandNetworkDiagnostics.record($0, defaults: UserDefaults(suiteName: "Build83.transport")!) },
            reportWaiting: { _ in }
        )
        var request = URLRequest(url: URL(string: "http://127.0.0.1:9/api/v1/native/commands?secret=never")!)
        request.timeoutInterval = 2
        do {
            _ = try await transport.data(for: request)
            XCTFail("Nothing listens on the discard port.")
        } catch {}
        XCTAssertEqual(made.count, 2, "A transport failure recreates the command session.")
        let kinds = CommandNetworkDiagnostics.recentFailureEvents(defaults: defaults).compactMap(\.kind)
        XCTAssertTrue(kinds.contains("sessionRecreated"))
        XCTAssertTrue(kinds.contains("attempt"))

        let json = String(decoding: NetworkDiagnosticsExport.makeJSON(defaults: defaults), as: UTF8.self)
        XCTAssertTrue(json.contains("sessionRecreated"))
        XCTAssertFalse(json.contains("secret"), "Exports carry paths, never query strings.")
        XCTAssertFalse(json.lowercased().contains("bearer"))
    }

    func testCommandOutcomeDiagnosticsFingerprintTheKeyAndNeverStoreIt() {
        let defaults = UserDefaults(suiteName: "Build83.commandOutcome")!
        defaults.removePersistentDomain(forName: "Build83.commandOutcome")
        CommandNetworkDiagnostics.recordCommand(
            commandType: "training-session.commit.v1", idempotencyKey: "132ACD3D-FULL-KEY",
            succeeded: false, durationMs: 61_000, error: URLError(.timedOut), defaults: defaults
        )
        let event = CommandNetworkDiagnostics.recentFailureEvents(defaults: defaults).first
        XCTAssertEqual(event?.commandType, "training-session.commit.v1")
        XCTAssertEqual(event?.kind, "command")
        XCTAssertEqual(event?.idempotencyFingerprint?.count, 16)
        let json = String(decoding: NetworkDiagnosticsExport.makeJSON(defaults: defaults), as: UTF8.self)
        XCTAssertFalse(json.contains("132ACD3D-FULL-KEY"))
    }

    // MARK: 13. Daily Totals come from the canonical Home snapshot

    func testWatchDailyTotalsAreTheCanonicalHomeSnapshotValuesUnchanged() throws {
        let snapshot = HomeWidgetSnapshot(
            authority: "founderProduction", accountScope: "scope", localDate: "2026-10-02",
            timeZoneIdentifier: "America/Los_Angeles", writtenAt: "2026-10-03T00:17:46Z",
            lastSuccessfulReadAt: "2026-10-03T00:17:40Z", refreshState: .success,
            training: nil,
            nutrition: .init(calories: 2463.3, proteinG: 182.2, carbsG: 166.7, fatG: 110.1),
            activity: .init(activeCalories: 945.744, isPartialDay: true),
            weight: nil, workout: .none
        )
        let totals = try XCTUnwrap(WatchDailyTotals(snapshot: snapshot))
        XCTAssertEqual(totals.localDate, "2026-10-02")
        XCTAssertEqual(totals.activeCalories, 945.744, "No Watch-side recomputation or rounding of the value.")
        XCTAssertEqual(totals.nutritionCalories, 2463.3)
        XCTAssertTrue(totals.isActivityPartialDay)
        XCTAssertFalse(totals.isOffline)
        XCTAssertNotNil(totals.refreshedAt)
        XCTAssertNil(WatchDailyTotals(snapshot: nil), "A cleared snapshot clears the Watch page.")
        var offline = snapshot
        offline.refreshState = .offline
        XCTAssertEqual(WatchDailyTotals(snapshot: offline)?.isOffline, true)
    }
}
