import XCTest
@testable import PhysiqueOS

/// Adversarial coverage for the app-scoped Workout Logger session
/// authority: identity, idempotency, revision conflicts, persistence
/// ordering/failure, completedAt, rest, relaunch, and the view-model
/// migration (no lost update between the screen and an intent-style caller).
@MainActor
final class TrainingSessionAuthorityTests: XCTestCase {
    private let api = FixtureTrainingLoggerAPI()
    private let t0 = ISO8601DateFormatter().date(from: "2026-10-01T17:00:00Z")!

    // MARK: Fixtures

    final class Clock: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Date
        init(_ value: Date) { self.value = value }
        var now: Date { lock.lock(); defer { lock.unlock() }; return value }
        func advance(_ seconds: TimeInterval) { lock.lock(); value = value.addingTimeInterval(seconds); lock.unlock() }
    }

    /// Records every write and can refuse the next ones.
    final class RecordingStore: TrainingLoggerDraftStore {
        private(set) var drafts: [TrainingLoggerDraft]
        private(set) var persistCount = 0
        private(set) var discardCount = 0
        var failPersist = false
        /// Observed by the store at write time: proves persistence happens
        /// before the authority publishes.
        var onPersist: ((TrainingLoggerDraft) -> Void)?

        init(_ drafts: [TrainingLoggerDraft] = []) { self.drafts = drafts }
        func loadAll() -> [TrainingLoggerDraft] { drafts }
        func save(_ draft: TrainingLoggerDraft) { try? persist(draft) }
        func persist(_ draft: TrainingLoggerDraft) throws {
            if failPersist { throw TrainingLoggerDraftStoreError.encodingFailed }
            onPersist?(draft)
            persistCount += 1
            drafts.removeAll { $0.id == draft.id }
            drafts.append(draft)
        }
        func discard(id: String) {
            discardCount += 1
            drafts.removeAll { $0.id == id }
        }
        func stored(_ id: String) -> TrainingLoggerDraft? { drafts.first { $0.id == id } }
    }

    private func set(_ id: String, _ number: Int, reps: Double? = 8, load: Double? = 100, duration: Double? = nil, done: Bool = false) -> TrainingLoggerDraftSet {
        TrainingLoggerDraftSet(id: id, setNumber: number, reps: reps, load: load, durationSeconds: duration, isCompleted: done)
    }

    private func exercise(
        _ id: String, name: String? = nil, measurement: TrainingLoggerMeasurement = .repsLoad,
        defaultLoadType: String? = nil, canonical: String? = nil, sets: [TrainingLoggerDraftSet]
    ) -> TrainingLoggerDraftExercise {
        TrainingLoggerDraftExercise(
            id: id, canonicalExerciseId: canonical ?? "canonical-\(id)", name: name ?? id.capitalized, areaId: "chest",
            measurement: measurement, defaultLoadType: defaultLoadType, executionVariant: nil, sets: sets,
            previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
            isProvisional: false, provenance: nil
        )
    }

    private func liveSession(
        id: String = "session-1",
        exercises: [TrainingLoggerDraftExercise]? = nil,
        step: TrainingLoggerStep = .workout,
        mode: TrainingLoggerMode = .live,
        startedAt: String = "2026-10-01T16:30:00Z"
    ) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: mode, workoutDate: "2026-10-01", startedAt: mode == .live ? startedAt : nil)
        draft.id = id
        draft.selectedAreaIds = ["chest"]
        draft.step = step
        draft.exercises = exercises ?? [
            exercise("bench", sets: [set("b1", 1), set("b2", 2), set("b3", 3)]),
            exercise("fly", sets: [set("f1", 1), set("f2", 2)]),
        ]
        return draft
    }

    private func makeAuthority(
        _ store: TrainingLoggerDraftStore,
        environment: NativeAPIEnvironment = .sandbox,
        rest: TrainingRestConfiguration? = .stopwatch,
        clock: Clock? = nil
    ) -> (TrainingSessionAuthority, Clock) {
        let clock = clock ?? Clock(t0)
        let authority = TrainingSessionAuthority(
            store: store, environment: environment,
            restPreferences: FixedTrainingRestPreferences(rest), now: { clock.now }
        )
        return (authority, clock)
    }

    /// An intent rendered from the session's current revision.
    private func intent(_ authority: TrainingSessionAuthority, _ mutationId: String, session: String = "session-1") -> TrainingSessionMutationContext {
        .intent(mutationId: mutationId, expectedRevision: authority.draft(id: session)?.currentRevision ?? 0)
    }

    private func completedAt(_ authority: TrainingSessionAuthority, _ setId: String, in session: String = "session-1") -> String? {
        authority.draft(id: session)?.exercises.flatMap(\.sets).first { $0.id == setId }?.completedAt
    }

    // MARK: Load / selection

    func testPerformedProjectionDropsUnfinishedSetsAndExercises() {
        var draft = liveSession()
        draft.exercises[0].sets[0].isCompleted = true

        let performed = TrainingPerformedSessionProjection.make(from: draft)

        XCTAssertEqual(performed.exercises.map(\.id), ["bench"])
        XCTAssertEqual(performed.exercises[0].sets.map(\.id), ["b1"])
        XCTAssertTrue(performed.relationships.isEmpty)
    }

    func testPerformedProjectionDropsPartialSupersetButKeepsCompletedMembers() {
        var draft = liveSession()
        draft.relationships = [
            .init(id: "super-1", relationshipType: "superset", memberExerciseIds: ["bench", "fly"]),
        ]
        draft.exercises[0].sets[0].isCompleted = true

        var performed = TrainingPerformedSessionProjection.make(from: draft)
        XCTAssertEqual(performed.exercises.map(\.id), ["bench"])
        XCTAssertTrue(performed.relationships.isEmpty, "One performed member is not a performed superset.")

        draft.exercises[1].sets[0].isCompleted = true
        performed = TrainingPerformedSessionProjection.make(from: draft)
        XCTAssertEqual(performed.exercises.map(\.id), ["bench", "fly"])
        XCTAssertEqual(performed.relationships.first?.memberExerciseIds, ["bench", "fly"])
        XCTAssertEqual(performed.exercises.flatMap(\.sets).map(\.id), ["b1", "f1"])
    }

    func testPerformedProjectionRetainsOnlyTwoPerformedMembersOfThreeWithoutRenumbering() {
        var draft = liveSession(exercises: [
            exercise("bench", sets: [set("b1", 1, done: true), set("b2", 2)]),
            exercise("fly", measurement: .duration, sets: [set("f1", 1, reps: nil, load: nil, duration: 45, done: true)]),
            exercise("dip", measurement: .bodyweightReps, defaultLoadType: "bodyweight", sets: [set("d1", 1, reps: 10, load: nil)]),
        ])
        draft.relationships = [
            .init(id: "super-3", relationshipType: "superset", memberExerciseIds: ["bench", "fly", "dip"]),
        ]

        let performed = TrainingPerformedSessionProjection.make(from: draft)

        XCTAssertEqual(performed.exercises.map(\.id), ["bench", "fly"])
        XCTAssertEqual(performed.exercises.flatMap(\.sets).map(\.id), ["b1", "f1"])
        XCTAssertEqual(performed.exercises[1].sets[0].durationSeconds, 45)
        XCTAssertEqual(performed.relationships, [
            .init(id: "super-3", relationshipType: "superset", memberExerciseIds: ["bench", "fly"]),
        ])
    }

    func testLoadRecoversPersistedSessionsWithoutBackfillingTimestamps() {
        var legacy = liveSession()
        legacy.exercises[0].sets[0].isCompleted = true // completed before completedAt existed
        let store = RecordingStore([legacy, liveSession(id: "past", mode: .past)])
        let (authority, _) = makeAuthority(store)

        XCTAssertEqual(Set(authority.drafts.map(\.id)), ["session-1", "past"])
        XCTAssertNil(completedAt(authority, "b1"), "Older completed sets are never given an invented timestamp.")
        XCTAssertEqual(authority.draft(id: "session-1")?.currentRevision, 0)
        XCTAssertEqual(store.persistCount, 0, "Loading never writes.")
    }

    func testActiveLiveSessionIgnoresLeftPastSubmittedAndStaleDrafts() {
        var left = liveSession(id: "left", startedAt: "2026-10-01T16:50:00Z"); left.leftAt = "2026-10-01T16:55:00Z"
        var submitted = liveSession(id: "submitted", startedAt: "2026-10-01T16:52:00Z"); submitted.submissionState = .acceptedProcessing
        let stale = liveSession(id: "stale", startedAt: "2026-09-30T01:00:00Z")
        let past = liveSession(id: "past", mode: .past)
        let active = liveSession(id: "active", startedAt: "2026-10-01T16:00:00Z")
        let (authority, _) = makeAuthority(RecordingStore([left, submitted, stale, past, active]))
        XCTAssertEqual(authority.activeLiveSession()?.id, "active")
    }

    // MARK: completeSet / identity / idempotency / revision

    func testPauseFreezesAndResumeReanchorsWorkoutAndStopwatchRest() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1"), .applied(revision: 1))
        clock.advance(25)
        XCTAssertEqual(authority.pause(sessionId: "session-1"), .applied(revision: 2))
        let frozen = try XCTUnwrap(authority.draft(id: "session-1")?.rest)
        XCTAssertEqual(try XCTUnwrap(frozen.frozenElapsedSeconds), 25, accuracy: 0.001)
        let elapsedAtPause = try XCTUnwrap(authority.activeElapsedSeconds(sessionId: "session-1"))

        clock.advance(120)
        XCTAssertEqual(try XCTUnwrap(authority.activeElapsedSeconds(sessionId: "session-1")), elapsedAtPause, accuracy: 0.001)
        XCTAssertEqual(
            authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2"),
            .rejected(.sessionPaused)
        )
        XCTAssertEqual(authority.resumePaused(sessionId: "session-1"), .applied(revision: 3))
        let resumed = try XCTUnwrap(authority.draft(id: "session-1")?.rest)
        XCTAssertNil(resumed.frozenElapsedSeconds)
        XCTAssertEqual(clock.now.timeIntervalSince(try XCTUnwrap(resumed.startedAtDate)), 25, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(authority.draft(id: "session-1")?.accumulatedPausedSeconds), 120, accuracy: 0.001)
    }

    func testCountdownPauseFreezesRemainingAndResumeReanchorsDeadline() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store, rest: .countdown(seconds: 90))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        clock.advance(20)
        authority.pause(sessionId: "session-1")
        XCTAssertEqual(try XCTUnwrap(authority.draft(id: "session-1")?.rest?.frozenRemainingSeconds), 70, accuracy: 0.001)
        clock.advance(300)
        authority.resumePaused(sessionId: "session-1")
        let end = try XCTUnwrap(authority.draft(id: "session-1")?.rest?.endsAtDate)
        XCTAssertEqual(end.timeIntervalSince(clock.now), 70, accuracy: 0.001)
    }

    func testPreparedWorkoutSelectionAndRouterFailClosedWhenPhoneUnreachable() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        XCTAssertEqual(authority.setReadyForWatch(sessionId: "session-1", ready: true), .applied(revision: 1))
        XCTAssertNil(authority.draft(id: "session-1")?.startedAt)
        XCTAssertEqual(authority.preparedWorkout()?.id, "session-1")
        var reachable = false
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { reachable }, now: { clock.now })
        let command = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "c1", mutationId: "m1",
            kind: .startPreparedWorkout, sessionId: "session-1", expectedRevision: 1,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )
        XCTAssertEqual(router.route(command).reason, .phoneUnreachable)
        XCTAssertNil(authority.draft(id: "session-1")?.startedAt)
        reachable = true
        XCTAssertEqual(router.route(command).status, .applied)
        XCTAssertNotNil(authority.draft(id: "session-1")?.startedAt)
        XCTAssertNil(authority.draft(id: "session-1")?.readyForWatchAt)
    }

    func testWatchStartReplayCreatesExactlyOneStructuredStart() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        XCTAssertEqual(authority.setReadyForWatch(sessionId: "session-1", ready: true), .applied(revision: 1))
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let start = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "start-once", mutationId: "start-once",
            kind: .startPreparedWorkout, sessionId: "session-1", expectedRevision: 1,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )

        XCTAssertEqual(router.route(start).status, .applied)
        let first = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(router.route(start).status, .unchanged)
        let replayed = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(replayed.startedAt, first.startedAt)
        XCTAssertEqual(replayed.currentRevision, first.currentRevision)
        XCTAssertEqual(replayed.appliedMutationIds?.filter { $0 == "start-once" }.count, 1)
    }

    func testWatchCompleteReplayRecordsExactlyOneSet() {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let complete = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "complete-once", mutationId: "complete-once",
            kind: .completeSet, sessionId: "session-1", expectedRevision: 0,
            exerciseId: "bench", setId: "b1", issuedAt: clock.now
        )

        XCTAssertEqual(router.route(complete).status, .applied)
        XCTAssertEqual(router.route(complete).status, .unchanged)
        XCTAssertEqual(authority.draft(id: "session-1")?.completedSetCount, 1)
        XCTAssertEqual(authority.draft(id: "session-1")?.currentRevision, 1)
    }

    // MARK: Overnight Lane A — Watch Complete Set gating + timed-set projection

    /// The phone on Workout Review (or Final Confirmation) makes sets
    /// read-only for the Watch. The projection must not offer Complete Set
    /// there, must say why, and the authority must still refuse the command.
    func testWatchProjectionWithholdsCompleteSetWhileThePhoneReviewsAndAuthorityStillRejects() throws {
        for step in [TrainingLoggerStep.summary, .evidence, .review] {
            let (authority, clock) = makeAuthority(RecordingStore([liveSession(step: step)]))
            let draft = try XCTUnwrap(authority.draft(id: "session-1"))
            let projection = try XCTUnwrap(WatchWorkoutProjection.make(draft: draft, authority: authority, now: clock.now))
            XCTAssertEqual(projection.phase, .active, "\(step)")
            XCTAssertFalse(projection.canCompleteSet, "\(step): no actionable Complete Set while reviewing")
            XCTAssertFalse(projection.rows.contains(where: \.isCompletionTarget), "\(step)")
            XCTAssertEqual(projection.isPhoneReviewing, true, "\(step)")

            let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
            let complete = WatchWorkoutCommand(
                schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "c-\(step)", mutationId: "m-\(step)",
                kind: .completeSet, sessionId: "session-1", expectedRevision: draft.currentRevision,
                exerciseId: "bench", setId: "b1", issuedAt: clock.now
            )
            let response = router.route(complete)
            XCTAssertEqual(response.status, .rejected, "\(step): UI gating is not a substitute for rejection")
            XCTAssertEqual(response.reason, .sessionNotMutable, "\(step)")
            XCTAssertEqual(authority.draft(id: "session-1")?.completedSetCount, 0, "\(step)")
        }
    }

    func testWatchProjectionOffersCompleteSetDuringSetEntryOnly() throws {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        let draft = try XCTUnwrap(authority.draft(id: "session-1"))
        let projection = try XCTUnwrap(WatchWorkoutProjection.make(draft: draft, authority: authority, now: clock.now))
        XCTAssertTrue(projection.canCompleteSet)
        XCTAssertNil(projection.isPhoneReviewing)
        XCTAssertEqual(projection.rows.first(where: \.isCompletionTarget)?.setId, "b1")

        XCTAssertEqual(authority.pause(sessionId: "session-1"), .applied(revision: 1))
        let paused = try XCTUnwrap(authority.draft(id: "session-1"))
        let pausedProjection = try XCTUnwrap(WatchWorkoutProjection.make(draft: paused, authority: authority, now: clock.now))
        XCTAssertFalse(pausedProjection.canCompleteSet)
        XCTAssertNil(pausedProjection.isPhoneReviewing, "Paused is its own phase, not review.")
    }

    /// A timed set carries its entered seconds to the Watch instead of an
    /// empty reps value; reps sets carry no duration.
    func testWatchProjectionCarriesTimedSetSeconds() throws {
        let draft = liveSession(exercises: [
            exercise("plank", name: "Plank", measurement: .duration,
                     sets: [set("p1", 1, reps: nil, load: nil, duration: 45), set("p2", 2, reps: nil, load: nil, duration: 60.5)]),
            exercise("bench", sets: [set("b1", 1)]),
        ])
        let (authority, clock) = makeAuthority(RecordingStore([draft]))
        let projection = try XCTUnwrap(WatchWorkoutProjection.make(
            draft: try XCTUnwrap(authority.draft(id: "session-1")), authority: authority, now: clock.now
        ))
        let current = try XCTUnwrap(projection.rows.first(where: \.isCompletionTarget))
        XCTAssertEqual(current.setId, "p1")
        XCTAssertEqual(current.durationText, "45")
        XCTAssertNil(current.repsText)
        XCTAssertEqual(current.valueText, "45 s")

        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "plank", setId: "p1"), .applied(revision: 1))
        let next = try XCTUnwrap(WatchWorkoutProjection.make(
            draft: try XCTUnwrap(authority.draft(id: "session-1")), authority: authority, now: clock.now
        ))
        XCTAssertEqual(next.rows.first(where: \.isCompletionTarget)?.durationText, "60.5")

        let reps = try XCTUnwrap(WatchWorkoutProjection.make(
            draft: liveSession(), authority: makeAuthority(RecordingStore([liveSession()])).0, now: clock.now
        ))
        XCTAssertTrue(reps.rows.allSatisfy { $0.durationText == nil })
    }

    /// Additive wire fields: an older phone's payload (no `durationText`,
    /// no `isPhoneReviewing`) still decodes, and round-trips keep them.
    func testWatchProjectionLaneAFieldsAreOptionalOnTheWire() throws {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession(step: .review)]))
        let projection = try XCTUnwrap(WatchWorkoutProjection.make(
            draft: try XCTUnwrap(authority.draft(id: "session-1")), authority: authority, now: clock.now
        ))
        let data = try WatchWorkoutWireCodec.encode(projection)
        let decoded = try WatchWorkoutWireCodec.decode(WatchWorkoutProjection.self, from: data)
        XCTAssertEqual(decoded.isPhoneReviewing, true)
        XCTAssertEqual(decoded.rows, projection.rows)

        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        json.removeValue(forKey: "isPhoneReviewing")
        json["rows"] = (json["rows"] as? [[String: Any]])?.map { row in
            var row = row
            row.removeValue(forKey: "durationText")
            return row
        }
        let legacy = try WatchWorkoutWireCodec.decode(
            WatchWorkoutProjection.self, from: try JSONSerialization.data(withJSONObject: json)
        )
        XCTAssertNil(legacy.isPhoneReviewing)
        XCTAssertTrue(legacy.rows.allSatisfy { $0.durationText == nil })
    }

    func testSimultaneousPhoneAndWatchCompleteFailsWatchStaleWithoutAdvancingAnotherSet() {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        let watch = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "watch-complete", mutationId: "watch-complete",
            kind: .completeSet, sessionId: "session-1", expectedRevision: 0,
            exerciseId: "bench", setId: "b1", issuedAt: clock.now
        )
        XCTAssertEqual(
            authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1"),
            .applied(revision: 1)
        )

        let response = WatchWorkoutCommandRouter(
            authority: authority, isPhoneReachable: { true }, now: { clock.now }
        ).route(watch)
        XCTAssertEqual(response.status, .stale)
        XCTAssertEqual(response.projection?.completedSets, 1)
        XCTAssertEqual(authority.draft(id: "session-1")?.completedSetCount, 1)
        XCTAssertFalse(authority.draft(id: "session-1")!.exercises[0].sets[1].isCompleted)
    }

    func testWatchRouterReturnsMutationIdentityAndAuthoritativeStaleProjection() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let first = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "command-1", mutationId: "mutation-1", kind: .completeSet,
            sessionId: "session-1", expectedRevision: 0, exerciseId: "bench", setId: "b1", issuedAt: clock.now
        )
        let accepted = router.route(first)
        XCTAssertEqual(accepted.status, .applied)
        XCTAssertEqual(accepted.mutationId, "mutation-1")
        XCTAssertEqual(accepted.projection?.lastAcknowledgedMutationId, "mutation-1")

        let stale = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "command-2", mutationId: "mutation-2", kind: .completeSet,
            sessionId: "session-1", expectedRevision: 0, exerciseId: "bench", setId: "b2", issuedAt: clock.now
        )
        let refused = router.route(stale)
        XCTAssertEqual(refused.status, .stale)
        XCTAssertEqual(refused.reason, .staleRevision)
        XCTAssertEqual(refused.acknowledgedRevision, 1)
        XCTAssertEqual(refused.projection?.stalenessReason, .revisionMismatch)
        XCTAssertFalse(authority.draft(id: "session-1")!.exercises[0].sets[1].isCompleted)
    }

    func testFinishAlwaysRequiresExplicitRequestBeforeConfirmEvenAfterFinalSet() {
        var draft = liveSession(exercises: [exercise("bench", sets: [set("b1", 1)])])
        draft.exercises[0].sets[0].isCompleted = true
        let (authority, _) = makeAuthority(RecordingStore([draft]))
        XCTAssertEqual(authority.confirmFinish(sessionId: "session-1"), .rejected(.sessionNotMutable))
        XCTAssertNil(authority.draft(id: "session-1")?.finishedAt)
        XCTAssertEqual(authority.requestFinishConfirmation(sessionId: "session-1"), .applied(revision: 1))
        XCTAssertEqual(authority.confirmFinish(sessionId: "session-1"), .applied(revision: 2))
        XCTAssertNotNil(authority.draft(id: "session-1")?.finishedAt)
    }

    /// A Watch-started session (one Watch HealthKit workout) with one
    /// completed set (Finish needs at least one).
    private func watchStartedSession() -> TrainingLoggerDraft {
        var draft = liveSession()
        draft.watchStartedAt = draft.startedAt
        draft.exercises[0].sets[0].isCompleted = true
        return draft
    }

    func testWatchFinishUsesOneOperationAndStructuredCommitAloneIsTerminal() throws {
        let (authority, _) = makeAuthority(RecordingStore([watchStartedSession()]))
        XCTAssertEqual(authority.requestFinishConfirmation(sessionId: "session-1"), .applied(revision: 1))
        XCTAssertEqual(
            authority.confirmFinish(sessionId: "session-1", finishOperationId: "finish-one"),
            .applied(revision: 2)
        )
        var draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(draft.watchFinishOperationId, "finish-one")
        XCTAssertEqual(draft.watchHealthSaveState, .pending)
        XCTAssertEqual(draft.watchServerCommitState, .pending)
        XCTAssertFalse(WatchWorkoutFinishCoordinator.isTerminalReady(draft))

        XCTAssertEqual(
            authority.recordWatchHealthSave(
                sessionId: "session-1", finishOperationId: "wrong", succeeded: true,
                context: .intent(mutationId: "health-wrong", expectedRevision: 2)
            ),
            .rejected(.sessionNotMutable)
        )
        XCTAssertEqual(
            authority.recordWatchHealthSave(
                sessionId: "session-1", finishOperationId: "finish-one", succeeded: true,
                context: .intent(mutationId: "health-one", expectedRevision: 2)
            ),
            .applied(revision: 3)
        )
        draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertFalse(WatchWorkoutFinishCoordinator.isTerminalReady(draft), "Health alone is never structured durability")

        XCTAssertEqual(
            authority.recordWatchServerCommit(
                sessionId: "session-1", finishOperationId: "finish-one",
                succeeded: true, authoritativePRCount: 2
            ),
            .applied(revision: 4)
        )
        draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertTrue(WatchWorkoutFinishCoordinator.isTerminalReady(draft))
        XCTAssertEqual(draft.watchAuthoritativePRCount, 2)
    }

    /// Build 83: HealthKit never blocks structured durability. A durable
    /// Server commit is terminal while the Health leg is still pending; the
    /// Health report is recorded afterwards on the same operation.
    func testWatchFinishServerFirstIsTerminalWithoutWaitingForHealth() throws {
        let (authority, _) = makeAuthority(RecordingStore([watchStartedSession()]))
        _ = authority.requestFinishConfirmation(sessionId: "session-1")
        _ = authority.confirmFinish(sessionId: "session-1", finishOperationId: "finish-server-first")
        XCTAssertEqual(
            authority.recordWatchServerCommit(
                sessionId: "session-1", finishOperationId: "finish-server-first", succeeded: true
            ),
            .applied(revision: 3)
        )
        var draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertTrue(WatchWorkoutFinishCoordinator.isTerminalReady(draft))
        XCTAssertEqual(draft.watchHealthSaveState, .pending)

        XCTAssertEqual(
            authority.recordWatchHealthSave(
                sessionId: "session-1", finishOperationId: "finish-server-first", succeeded: true,
                context: .intent(mutationId: "health-after-server", expectedRevision: 3)
            ),
            .applied(revision: 4)
        )
        draft = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertTrue(WatchWorkoutFinishCoordinator.isTerminalReady(draft))
    }

    /// Build 83: a Health report is guarded by its finish operation, not by
    /// the session revision (which moves while the structured commit runs;
    /// revision-guarding made the Watch retry a stale report forever).
    func testWatchHealthSaveReportIsOperationGuardedAndIdempotent() throws {
        let (authority, clock) = makeAuthority(RecordingStore([watchStartedSession()]))
        _ = authority.requestFinishConfirmation(sessionId: "session-1")
        _ = authority.confirmFinish(sessionId: "session-1", finishOperationId: "finish-one")
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let wrongOperation = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "health-wrong", mutationId: "health-wrong",
            kind: .reportHealthSaved, sessionId: "session-1", expectedRevision: 0,
            exerciseId: nil, setId: nil, finishOperationId: "another-finish", issuedAt: clock.now
        )
        XCTAssertEqual(router.route(wrongOperation).status, .rejected)
        XCTAssertEqual(authority.draft(id: "session-1")?.watchHealthSaveState, .pending)

        var oldRevision = wrongOperation
        oldRevision.commandId = "health-old-revision"
        oldRevision.mutationId = "health-old-revision"
        oldRevision.finishOperationId = "finish-one"
        oldRevision.expectedRevision = 1
        XCTAssertEqual(router.route(oldRevision).status, .applied, "An older revision does not make a report stale.")
        XCTAssertEqual(router.route(oldRevision).status, .unchanged, "A replay is idempotent.")
        XCTAssertEqual(authority.draft(id: "session-1")?.watchHealthSaveState, .succeeded)

        var lateFailure = oldRevision
        lateFailure.kind = .reportHealthSaveFailed
        lateFailure.commandId = "health-late-failure"
        lateFailure.mutationId = "health-late-failure"
        _ = router.route(lateFailure)
        XCTAssertEqual(authority.draft(id: "session-1")?.watchHealthSaveState, .succeeded, "Never downgraded.")
    }


    func testWatchCancelActiveIsCanonicalTerminalAndDuplicateIsIdempotent() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let cancel = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "cancel-active", mutationId: "cancel-active", kind: .cancelWorkout,
            sessionId: "session-1", expectedRevision: 0,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )

        let accepted = router.route(cancel)
        XCTAssertEqual(accepted.status, .applied)
        XCTAssertEqual(accepted.projection?.phase, .cancelled)
        XCTAssertNil(authority.draft(id: "session-1"))
        XCTAssertTrue(store.drafts.isEmpty)
        XCTAssertTrue(authority.pendingCompletions.isEmpty)

        let replayed = router.route(cancel)
        XCTAssertEqual(replayed.status, .unchanged)
        XCTAssertEqual(replayed.projection?.phase, .cancelled)
        XCTAssertEqual(store.discardCount, 1, "A lost acknowledgement retry cannot discard twice.")
    }

    func testWatchCancelPausedDoesNotRequireResume() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        XCTAssertEqual(authority.pause(sessionId: "session-1"), .applied(revision: 1))
        let cancel = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "cancel-paused", mutationId: "cancel-paused", kind: .cancelWorkout,
            sessionId: "session-1", expectedRevision: 1,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )

        let response = WatchWorkoutCommandRouter(
            authority: authority, isPhoneReachable: { true }, now: { clock.now }
        ).route(cancel)
        XCTAssertEqual(response.status, .applied)
        XCTAssertEqual(response.projection?.phase, .cancelled)
        XCTAssertNil(authority.draft(id: "session-1"))
    }

    func testWatchCancelWithStaleRevisionFailsClosedWithoutDiscarding() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        _ = authority.pause(sessionId: "session-1")
        let staleCancel = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "cancel-stale", mutationId: "cancel-stale", kind: .cancelWorkout,
            sessionId: "session-1", expectedRevision: 0,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )

        let response = WatchWorkoutCommandRouter(
            authority: authority, isPhoneReachable: { true }, now: { clock.now }
        ).route(staleCancel)
        XCTAssertEqual(response.status, .stale)
        XCTAssertEqual(response.reason, .staleRevision)
        XCTAssertEqual(response.projection?.phase, .paused)
        XCTAssertNotNil(authority.draft(id: "session-1"))
        XCTAssertEqual(store.discardCount, 0)
    }

    func testPhoneCancelRefreshPublishesTerminalProjectionInsteadOfStaleWorkout() {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        _ = authority.endSession(sessionId: "session-1", reason: .cancelled)
        let refresh = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "refresh-after-phone-cancel", mutationId: "refresh-after-phone-cancel",
            kind: .refreshProjection, sessionId: "session-1", expectedRevision: 0,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )

        let response = WatchWorkoutCommandRouter(
            authority: authority, isPhoneReachable: { true }, now: { clock.now }
        ).route(refresh)
        XCTAssertEqual(response.status, .unchanged)
        XCTAssertEqual(response.projection?.phase, .cancelled)
        XCTAssertTrue(response.projection?.rows.isEmpty == true)
        XCTAssertNil(response.projection?.rest)
        XCTAssertNil(response.projection?.metrics)
    }

    func testCancelAfterCompletedSetCreatesNoPerformedTrainingEvidence() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        XCTAssertEqual(
            authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1"),
            .applied(revision: 1)
        )
        let cancel = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "cancel-partial", mutationId: "cancel-partial", kind: .cancelWorkout,
            sessionId: "session-1", expectedRevision: 1,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )
        let response = WatchWorkoutCommandRouter(
            authority: authority, isPhoneReachable: { true }, now: { clock.now }
        ).route(cancel)

        XCTAssertEqual(response.status, .applied)
        XCTAssertNil(authority.draft(id: "session-1"))
        XCTAssertTrue(authority.pendingCompletions.isEmpty)
        XCTAssertTrue(store.drafts.isEmpty, "Cancel cannot retain a source for volume, PRs, history, or performance records.")
    }

    func testWatchMetricsTotalRequiresActiveAndBasalEnergy() {
        XCTAssertNil(WatchWorkoutMetrics(elapsedActiveSeconds: 60, currentHeartRateBPM: 120, activeCalories: 50, basalCalories: nil).totalCalories)
        XCTAssertEqual(WatchWorkoutMetrics(elapsedActiveSeconds: 60, currentHeartRateBPM: 120, activeCalories: 50, basalCalories: 12).totalCalories, 62)
    }

    func testWatchContractUnknownCommandDecodesToSafeNonMutatingCase() throws {
        let data = Data(#"{"schemaVersion":1,"commandId":"c","mutationId":"m","kind":"futureCommand","sessionId":"s","expectedRevision":0,"issuedAt":0}"#.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        XCTAssertEqual(try decoder.decode(WatchWorkoutCommand.self, from: data).kind, .unknown)
    }

    func testWatchHealthKitLifecycleRequiresExplicitEndAndUsesLockedV1Semantics() throws {
        XCTAssertEqual(WatchHealthKitWorkoutContract.activityType, "traditionalStrengthTraining")
        XCTAssertEqual(WatchHealthKitWorkoutContract.locationType, "indoor")
        var state = try WatchHealthKitWorkoutContract.transition(.notStarted, event: .start)
        state = try WatchHealthKitWorkoutContract.transition(state, event: .pause)
        state = try WatchHealthKitWorkoutContract.transition(state, event: .resume)
        XCTAssertThrowsError(try WatchHealthKitWorkoutContract.transition(state, event: .finishSaving))
        state = try WatchHealthKitWorkoutContract.transition(state, event: .requestEnd)
        XCTAssertEqual(try WatchHealthKitWorkoutContract.transition(state, event: .finishSaving), .ended)
    }

    func testHealthKitExactCorrelationRequiresTrustedStrengthIndoorOwnerAndEnvelope() {
        let sessionId = UUID()
        let context = HealthKitTrustedWorkoutCorrelationContext(
            trustedSourceBundleIdentifiers: ["com.physiqueos.watch"],
            traditionalStrengthTrainingActivityTypes: ["50"],
            effectiveAt: t0.addingTimeInterval(-60),
            ownerKey: "founder",
            sessions: [.init(sessionId: sessionId, ownerKey: "founder", startedAt: t0, endedAt: t0.addingTimeInterval(3_600))],
            clockToleranceSeconds: 30
        )
        func extract(source: String = "com.physiqueos.watch", activity: String = "50", indoor: Bool? = true) -> String? {
            HealthKitTrustedWorkoutCorrelation.extract(
                externalUUID: sessionId.uuidString, sourceBundleIdentifier: source,
                activityType: activity, isIndoorWorkout: indoor,
                startedAt: t0.addingTimeInterval(5), endedAt: t0.addingTimeInterval(3_590), context: context
            )
        }
        XCTAssertEqual(extract(), sessionId.uuidString.lowercased())
        XCTAssertNil(extract(source: "com.other.watch"))
        XCTAssertNil(extract(activity: "13"))
        XCTAssertNil(extract(indoor: false))
        XCTAssertNil(HealthKitTrustedWorkoutCorrelation.extract(
            externalUUID: sessionId.uuidString, sourceBundleIdentifier: "com.physiqueos.watch",
            activityType: "50", isIndoorWorkout: true,
            startedAt: t0.addingTimeInterval(-60), endedAt: t0.addingTimeInterval(3_590), context: context
        ))
        var preActivation = context
        preActivation.effectiveAt = t0.addingTimeInterval(10)
        XCTAssertNil(HealthKitTrustedWorkoutCorrelation.extract(
            externalUUID: sessionId.uuidString, sourceBundleIdentifier: "com.physiqueos.watch",
            activityType: "50", isIndoorWorkout: true,
            startedAt: t0.addingTimeInterval(5), endedAt: t0.addingTimeInterval(3_590), context: preActivation
        ), "A delayed historical workout never gains prospective exact authority.")
    }

    func testTrustedWatchCapabilityAndCommittedLedgerSurviveRelaunchFailClosed() throws {
        let effective = t0.addingTimeInterval(-60)
        let block: ProductionJSONValue = .object([
            "contractVersion": .string(HealthKitTrustedWorkoutCorrelationContract.contractVersion),
            "enabled": .bool(true),
            "prospectiveOnly": .bool(true),
            "trustedSourceBundleIdentifiers": .array([.string("com.physiqueos.native.dev")]),
            "traditionalStrengthTrainingActivityTypes": .array([.string("50")]),
            "clockToleranceSeconds": .number(120),
            "effectiveAt": .string(ISO8601DateFormatter().string(from: effective))
        ])
        let capability = HealthKitTrustedWorkoutCorrelationCapability.resolve(manifestBlock: block, at: t0)
        XCTAssertTrue(capability.enabled)

        let capabilityStore = MemoryTrustedWorkoutCapabilityStore()
        let gate = HealthKitTrustedWorkoutCorrelationGate(store: capabilityStore)
        gate.update(capability)
        let sessionID = UUID()
        let ledger = MemoryTrainingSessionTerminalLedgerStore([.init(
            sessionId: sessionID.uuidString,
            outcome: .committed,
            finishOperationId: "finish-1",
            startedAt: TrainingSessionClock.string(from: t0),
            finishedAt: TrainingSessionClock.string(from: t0.addingTimeInterval(3_600)),
            healthSaveState: .succeeded,
            cancelMutationId: nil,
            recordedAt: TrainingSessionClock.string(from: t0.addingTimeInterval(3_601)),
            acknowledgedAt: nil
        )])
        let registryNow = t0.addingTimeInterval(3_700)
        let registry = HealthKitTrustedWorkoutCorrelationRegistry(
            gate: gate,
            drafts: MemoryTrainingLoggerDraftStore(),
            terminalLedger: ledger,
            now: { registryNow }
        )
        let context = registry.context(ownerKey: "founder")
        XCTAssertEqual(context.sessions.map(\.sessionId), [sessionID])
        XCTAssertEqual(context.trustedSourceBundleIdentifiers, ["com.physiqueos.native.dev"])

        let malformed = HealthKitTrustedWorkoutCorrelationCapability.resolve(
            manifestBlock: .object(["enabled": .bool(true)]), at: t0
        )
        XCTAssertFalse(malformed.enabled)
        gate.update(malformed)
        XCTAssertTrue(registry.context(ownerKey: "founder").sessions.isEmpty)
    }

    func testTrustedWatchRegistryBridgesHealthFirstFinishButExcludesPreActivationDrafts() throws {
        let effective = t0.addingTimeInterval(-60)
        let capability = HealthKitTrustedWorkoutCorrelationCapability.resolve(manifestBlock: .object([
            "contractVersion": .string(HealthKitTrustedWorkoutCorrelationContract.contractVersion),
            "enabled": .bool(true), "prospectiveOnly": .bool(true),
            "trustedSourceBundleIdentifiers": .array([.string("com.physiqueos.native.dev")]),
            "traditionalStrengthTrainingActivityTypes": .array([.string("50")]),
            "clockToleranceSeconds": .number(120),
            "effectiveAt": .string(ISO8601DateFormatter().string(from: effective))
        ]), at: t0)
        let capabilityStore = MemoryTrustedWorkoutCapabilityStore()
        let gate = HealthKitTrustedWorkoutCorrelationGate(store: capabilityStore)
        gate.update(capability)

        let currentID = UUID()
        var healthFirst = liveSession(id: currentID.uuidString, startedAt: TrainingSessionClock.string(from: t0))
        healthFirst.watchStartedAt = healthFirst.startedAt
        healthFirst.finishedAt = TrainingSessionClock.string(from: t0.addingTimeInterval(3_600))
        healthFirst.watchFinishOperationId = "finish-current"
        healthFirst.watchHealthSaveState = .succeeded
        XCTAssertNil(healthFirst.completionPresentationPending, "The Server commit has not completed yet.")

        let historicalID = UUID()
        var historical = liveSession(id: historicalID.uuidString, startedAt: TrainingSessionClock.string(from: effective.addingTimeInterval(-1)))
        historical.watchStartedAt = historical.startedAt
        historical.finishedAt = TrainingSessionClock.string(from: t0.addingTimeInterval(1_800))
        historical.watchFinishOperationId = "finish-historical"

        let registryNow = t0.addingTimeInterval(3_700)
        let registry = HealthKitTrustedWorkoutCorrelationRegistry(
            gate: gate,
            drafts: MemoryTrainingLoggerDraftStore(drafts: [healthFirst, historical]),
            terminalLedger: MemoryTrainingSessionTerminalLedgerStore(),
            now: { registryNow }
        )
        let context = registry.context(ownerKey: "founder")
        XCTAssertEqual(context.sessions.map(\.sessionId), [currentID])
        XCTAssertEqual(context.effectiveAt, effective)
    }

    func testCompleteSetStampsCompletedAtAdvancesRevisionAndPersistsBeforePublishing() {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        var publishedAtPersistTime: Bool?
        store.onPersist = { written in
            publishedAtPersistTime = authority.draft(id: written.id)?.currentRevision == written.currentRevision
        }

        let outcome = authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                            context: .intent(mutationId: "m1", expectedRevision: 0))

        XCTAssertEqual(outcome, .applied(revision: 1))
        XCTAssertEqual(publishedAtPersistTime, false, "The write happens before memory is published.")
        XCTAssertEqual(completedAt(authority, "b1"), TrainingSessionClock.string(from: t0))
        XCTAssertEqual(store.stored("session-1"), authority.draft(id: "session-1"), "Memory equals storage.")
        XCTAssertEqual(authority.lastChange, .init(sessionId: "session-1", revision: 1, kind: .mutated))
        XCTAssertEqual(store.persistCount, 1)
    }

    func testDuplicateCompletionIsSafeAndPreservesTimestampAndRest() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                             context: .intent(mutationId: "m1", expectedRevision: 0)), .applied(revision: 1))
        let stamped = completedAt(authority, "b1")
        let rest = authority.draft(id: "session-1")?.rest
        clock.advance(30)

        // Same mutation id replayed (e.g. intent delivered twice), even with an old revision.
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                             context: .intent(mutationId: "m1", expectedRevision: 0)), .duplicate(revision: 1))
        // A different caller asking for the same end state.
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                             context: .intent(mutationId: "m2", expectedRevision: 0)), .unchanged(revision: 1))
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1"), .unchanged(revision: 1))

        XCTAssertEqual(completedAt(authority, "b1"), stamped)
        XCTAssertEqual(authority.draft(id: "session-1")?.rest, rest, "A duplicate never restarts rest.")
        XCTAssertEqual(store.persistCount, 1, "No duplicate persistence.")
    }

    func testDuplicateMutationIdSurvivesRelaunch() {
        let store = RecordingStore([liveSession()])
        let (first, _) = makeAuthority(store)
        first.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: .intent(mutationId: "m1", expectedRevision: 0))
        first.setCompletion(sessionId: "session-1", exerciseId: "bench", setId: "b1", completed: false)

        let (relaunched, _) = makeAuthority(store)
        XCTAssertEqual(relaunched.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                              context: .intent(mutationId: "m1", expectedRevision: 0)), .duplicate(revision: 2),
                       "A replayed intent must not re-complete a set the Founder has since un-completed.")
        XCTAssertEqual(relaunched.draft(id: "session-1")?.exercises[0].sets[0].isCompleted, false)
    }

    func testMutationLedgerIsBounded() {
        let store = RecordingStore([liveSession(exercises: [exercise("bench", sets: (1...40).map { set("s\($0)", $0) })])])
        let (authority, _) = makeAuthority(store)
        for number in 1...40 {
            authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "s\(number)",
                                  context: intent(authority, "m\(number)"))
        }
        let ledger = authority.draft(id: "session-1")?.appliedMutationIds ?? []
        XCTAssertEqual(ledger.count, TrainingSessionInvariants.mutationLedgerLimit)
        XCTAssertEqual(ledger.last, "m40")
    }

    func testStaleRevisionIsRefusedWithoutWritingButSatisfiedRequestIsUnchanged() {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b1", field: .load, value: 105) // UI edit -> rev 1

        let stale = authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                          context: .intent(mutationId: "m1", expectedRevision: 0))
        XCTAssertEqual(stale, .rejected(.staleRevision(current: 1)))
        XCTAssertEqual(authority.draft(id: "session-1")?.exercises[0].sets[0].isCompleted, false)
        XCTAssertEqual(store.persistCount, 1)
        XCTAssertNil(authority.draft(id: "session-1")?.appliedMutationIds, "A refused id is not recorded.")

        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1") // UI completes -> rev 2
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                             context: .intent(mutationId: "m1", expectedRevision: 0)), .unchanged(revision: 2),
                       "An intent whose goal already holds is safe even when stale.")
    }

    func testIdentityIsValidatedSoAStaleIntentCannotCompleteTheWrongSet() {
        let store = RecordingStore([liveSession(), liveSession(id: "other", startedAt: "2026-10-01T16:40:00Z")])
        let (authority, _) = makeAuthority(store)
        let intent = TrainingSessionMutationContext.intent(mutationId: "m", expectedRevision: 0)

        XCTAssertEqual(authority.completeSet(sessionId: "missing", exerciseId: "bench", setId: "b1", context: intent), .rejected(.sessionNotFound))
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "fly", setId: "b1", context: intent), .rejected(.setNotFound),
                       "A set id from another exercise is refused, never resolved by position.")
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "gone", setId: "b1", context: intent), .rejected(.exerciseNotFound))

        authority.edit(sessionId: "session-1") { $0.removeSet(exerciseId: "bench", setId: "b3") }
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b3", context: intent), .rejected(.setNotFound),
                       "A removed set can never be completed by a late intent, and set 4 is not substituted.")
        XCTAssertEqual(store.persistCount, 1)
        XCTAssertTrue(authority.draft(id: "other")!.exercises.flatMap(\.sets).allSatisfy { !$0.isCompleted })
    }

    func testIntentOnlyMutatesAnInProgressLiveSessionAtSetEntry() {
        let intent = TrainingSessionMutationContext.intent(mutationId: "m", expectedRevision: 0)
        func outcome(_ adjust: (inout TrainingLoggerDraft) -> Void) -> TrainingSessionMutationOutcome {
            var draft = liveSession()
            adjust(&draft)
            let (subject, _) = makeAuthority(RecordingStore([draft]))
            return subject.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: intent)
        }
        XCTAssertEqual(outcome { $0.leftAt = "2026-10-01T16:59:00Z" }, .rejected(.sessionNotMutable))
        XCTAssertEqual(outcome { $0.step = .review }, .rejected(.sessionNotMutable))
        XCTAssertEqual(outcome { $0.step = .summary }, .rejected(.sessionNotMutable))
        XCTAssertEqual(outcome { $0.submissionState = .resultUnknown }, .rejected(.sessionNotMutable))
        XCTAssertEqual(outcome { $0.mode = .past }, .rejected(.sessionNotMutable))
        XCTAssertEqual(outcome { $0.beginAddingExercises() }, .applied(revision: 1), "Adding exercises mid-workout is still the live workout.")

        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        XCTAssertTrue(authority.beginSubmission(sessionId: "session-1"))
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: intent), .rejected(.sessionNotMutable),
                       "Nothing external may change a draft whose Finish commit is in flight.")
        authority.endSubmission(sessionId: "session-1")
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: intent), .applied(revision: 1))
    }

    func testIntentCompletesOnlyFilledSetsAndCannotUseStructuralEdits() {
        let store = RecordingStore([liveSession(exercises: [exercise("bench", sets: [set("blank", 1, reps: nil, load: nil), set("b2", 2)])])])
        let (authority, _) = makeAuthority(store)
        let intent = TrainingSessionMutationContext.intent(mutationId: "m", expectedRevision: 0)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "blank", context: intent), .rejected(.setValuesIncomplete))
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "blank"), .applied(revision: 1),
                       "The Logger itself keeps its existing permissive checkmark.")
        XCTAssertEqual(authority.edit(sessionId: "session-1", context: intent) { $0.exercises.removeAll() }, .rejected(.originNotPermitted))
        XCTAssertEqual(authority.draft(id: "session-1")?.exercises.count, 1)
    }

    // MARK: Persistence failure

    func testPersistenceFailureLeavesMemoryEqualToStorage() {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        let before = authority.draft(id: "session-1")
        store.failPersist = true

        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2"), .rejected(.persistenceFailed))
        XCTAssertEqual(authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b2", field: .reps, value: 9), .rejected(.persistenceFailed))
        XCTAssertNil(authority.startSession(mode: .live, workoutDate: "2026-10-01", startedAt: nil))
        XCTAssertEqual(authority.draft(id: "session-1"), before)
        XCTAssertEqual(store.stored("session-1"), before)
        XCTAssertEqual(authority.drafts.count, 1)

        store.failPersist = false
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2"), .applied(revision: 2),
                       "The revision does not skip after a refused write.")
    }

    func testRealDraftStoreRefusesUnencodableValueAndKeepsPriorState() throws {
        let suite = "TrainingSessionAuthorityTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: "draft")
        store.save(liveSession())
        let (authority, _) = makeAuthority(store)

        XCTAssertEqual(authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b1", field: .load, value: .nan), .rejected(.persistenceFailed))
        XCTAssertEqual(authority.draft(id: "session-1")?.exercises[0].sets[0].load, 100)
        XCTAssertEqual(authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b1", field: .load, value: 110), .applied(revision: 1),
                       "Before: one unencodable value silently stopped every later save of the draft.")
        XCTAssertEqual(UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: "draft").loadAll().first?.exercises[0].sets[0].load, 110)
    }

    // MARK: completedAt

    func testCompletedAtSetPreserveClearSemantics() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        let first = completedAt(authority, "b1")
        clock.advance(20)
        authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b1", field: .reps, value: 10)
        XCTAssertEqual(completedAt(authority, "b1"), first, "Editing a completed set keeps its completion instant.")

        authority.setCompletion(sessionId: "session-1", exerciseId: "bench", setId: "b1", completed: false)
        XCTAssertNil(completedAt(authority, "b1"), "Marking incomplete clears it.")
        clock.advance(20)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        XCTAssertEqual(completedAt(authority, "b1"), TrainingSessionClock.string(from: t0.addingTimeInterval(40)), "Re-completion is a new transition.")

        authority.edit(sessionId: "session-1") { $0.addSet(to: "bench") }
        XCTAssertNil(authority.draft(id: "session-1")?.exercises[0].sets.last?.completedAt, "A copied set never inherits a timestamp.")
        authority.edit(sessionId: "session-1") { draft in
            for index in draft.exercises[0].sets.indices { draft.exercises[0].sets[index].isCompleted = false } // progression reset path
        }
        XCTAssertTrue(authority.draft(id: "session-1")!.exercises[0].sets.allSatisfy { $0.completedAt == nil })
    }

    func testStructuralEditCannotForgeOrMoveATimestamp() {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        let original = completedAt(authority, "b1")
        clock.advance(60)
        authority.edit(sessionId: "session-1") { $0.exercises[0].sets[0].completedAt = "2020-01-01T00:00:00Z" }
        XCTAssertEqual(completedAt(authority, "b1"), original)
        authority.edit(sessionId: "session-1") { $0.exercises[0].sets[1].completedAt = "2020-01-01T00:00:00Z" }
        XCTAssertNil(completedAt(authority, "b2"), "An incomplete set never carries a timestamp.")
    }

    func testRetrospectiveEntryRecordsNoCompletionInstantOrRest() {
        let store = RecordingStore([liveSession(mode: .past)])
        let (authority, _) = makeAuthority(store)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        XCTAssertEqual(authority.draft(id: "session-1")?.exercises[0].sets[0].isCompleted, true)
        XCTAssertNil(completedAt(authority, "b1"), "Data-entry time is not when a past set was performed.")
        XCTAssertNil(authority.draft(id: "session-1")?.rest)
    }

    // MARK: Rest

    func testStopwatchStartsAtCompletionAndNextCompletionReplacesIt() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store, rest: .stopwatch)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        let first = try XCTUnwrap(authority.draft(id: "session-1")?.rest)
        XCTAssertEqual(first.mode, .stopwatch)
        XCTAssertEqual(first.startedAtDate, t0)
        XCTAssertNil(first.endsAt)
        XCTAssertEqual(first.sourceSetId, "b1")
        XCTAssertEqual(first.sourceExerciseId, "bench")

        clock.advance(95)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        let second = try XCTUnwrap(authority.draft(id: "session-1")?.rest)
        XCTAssertNotEqual(second.id, first.id)
        XCTAssertEqual(second.startedAtDate, t0.addingTimeInterval(95))
        XCTAssertEqual(second.sourceSetId, "b2")
        XCTAssertEqual(store.persistCount, 2, "Rest adds no writes beyond the completion itself; nothing ticks.")
    }

    func testCountdownUsesAbsoluteEndAndExpiryChangesNothing() throws {
        let store = RecordingStore([liveSession()])
        let (authority, clock) = makeAuthority(store, rest: .countdown(seconds: 90))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        let rest = try XCTUnwrap(authority.draft(id: "session-1")?.rest)
        XCTAssertEqual(rest.mode, .countdown)
        XCTAssertEqual(rest.durationSeconds, 90)
        XCTAssertEqual(rest.endsAtDate, t0.addingTimeInterval(90))
        XCTAssertFalse(rest.isExpired(at: t0.addingTimeInterval(89)))

        clock.advance(600)
        XCTAssertTrue(rest.isExpired(at: clock.now))
        XCTAssertEqual(authority.draft(id: "session-1")?.rest, rest, "Expiry neither clears rest nor advances or completes anything.")
        XCTAssertEqual(authority.draft(id: "session-1")?.completedSetCount, 1)
        XCTAssertEqual(store.persistCount, 1)

        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        XCTAssertEqual(authority.draft(id: "session-1")?.rest?.endsAtDate, clock.now.addingTimeInterval(90))
    }

    func testOffAndInvalidCountdownCreateNoRestAndOffEndsAPriorRest() {
        for configuration: TrainingRestConfiguration? in [nil, .off, .countdown(seconds: 0), .init(mode: .countdown, countdownDurationSeconds: nil)] {
            let (authority, _) = makeAuthority(RecordingStore([liveSession()]), rest: configuration)
            authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
            XCTAssertNil(authority.draft(id: "session-1")?.rest, "\(String(describing: configuration))")
        }

        let (authority, _) = makeAuthority(RecordingStore([liveSession()]), rest: .stopwatch)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        XCTAssertNotNil(authority.draft(id: "session-1")?.rest)
        authority.setRestConfiguration(sessionId: "session-1", .off)
        XCTAssertNotNil(authority.draft(id: "session-1")?.rest, "Changing the mode leaves a running interval as started.")
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        XCTAssertNil(authority.draft(id: "session-1")?.rest, "The next completion under Off ends the prior rest.")
    }

    func testRestPreferencePrecedenceSessionThenExerciseThenGlobal() {
        let preferences = FixedTrainingRestPreferences(.stopwatch, exerciseOverrides: ["canonical-fly": .countdown(seconds: 45)])
        let authority = TrainingSessionAuthority(store: RecordingStore([liveSession()]), environment: .sandbox,
                                                 restPreferences: preferences, now: { [t0] in t0 })
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        XCTAssertEqual(authority.draft(id: "session-1")?.rest?.mode, .stopwatch)
        authority.completeSet(sessionId: "session-1", exerciseId: "fly", setId: "f1")
        XCTAssertEqual(authority.draft(id: "session-1")?.rest?.durationSeconds, 45)
        authority.setRestConfiguration(sessionId: "session-1", .countdown(seconds: 120))
        authority.completeSet(sessionId: "session-1", exerciseId: "fly", setId: "f2")
        XCTAssertEqual(authority.draft(id: "session-1")?.rest?.durationSeconds, 120)
    }

    func testUncompletingTheRestSourceEndsRestButOtherSetsDoNot() {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        authority.setCompletion(sessionId: "session-1", exerciseId: "bench", setId: "b1", completed: false)
        XCTAssertEqual(authority.draft(id: "session-1")?.rest?.sourceSetId, "b2")
        authority.setCompletion(sessionId: "session-1", exerciseId: "bench", setId: "b2", completed: false)
        XCTAssertNil(authority.draft(id: "session-1")?.rest)
    }

    func testEndRestIsIdempotentAndRefusesAReplacedInterval() throws {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        let firstId = try XCTUnwrap(authority.draft(id: "session-1")?.rest?.id)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        let secondId = try XCTUnwrap(authority.draft(id: "session-1")?.rest?.id)
        XCTAssertEqual(authority.endRest(sessionId: "session-1", restId: firstId), .rejected(.restNotFound))
        XCTAssertNotNil(authority.draft(id: "session-1")?.rest)
        XCTAssertEqual(authority.endRest(sessionId: "session-1", restId: secondId), .applied(revision: 3))
        XCTAssertEqual(authority.endRest(sessionId: "session-1", restId: secondId), .unchanged(revision: 3))
    }

    func testRelaunchRestoresStopwatchAndCountdownExactly() throws {
        for configuration in [TrainingRestConfiguration.stopwatch, .countdown(seconds: 150)] {
            let store = RecordingStore([liveSession()])
            let (first, _) = makeAuthority(store, rest: configuration)
            first.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
            let rest = try XCTUnwrap(first.draft(id: "session-1")?.rest)

            let later = Clock(t0.addingTimeInterval(70))
            let (relaunched, _) = makeAuthority(store, rest: configuration, clock: later)
            XCTAssertEqual(relaunched.draft(id: "session-1")?.rest, rest)
            let projection = try XCTUnwrap(TrainingSessionLiveProjection.make(from: relaunched.draft(id: "session-1")!, now: later.now))
            XCTAssertEqual(projection.rest?.startedAt, t0, "Stopwatch elapsed = now - startedAt = 70 s, with no app ticking.")
            if configuration.mode == .countdown {
                XCTAssertEqual(projection.rest?.endsAt, t0.addingTimeInterval(150))
                XCTAssertEqual(projection.rest?.isExpired, false)
            }
        }
    }

    // MARK: Lifecycle

    func testSaveAndLeaveEndsRestResumeDoesNotRestartIt() {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        authority.saveAndLeave(sessionId: "session-1", leftAt: "2026-10-01T17:05:00Z")
        XCTAssertNil(authority.draft(id: "session-1")?.rest)
        XCTAssertNotNil(store.stored("session-1")?.leftAt)
        XCTAssertNil(authority.activeLiveSession(), "A left workout is not routed into.")

        authority.resume(sessionId: "session-1")
        XCTAssertNil(store.stored("session-1")?.leftAt, "Resume is durable immediately.")
        XCTAssertNil(authority.draft(id: "session-1")?.rest)
        XCTAssertEqual(authority.activeLiveSession()?.id, "session-1")
    }

    func testFinishStampsOnceAndEndsRestCancelAndCommitEndSessionsWithReasons() {
        let store = RecordingStore([liveSession(), liveSession(id: "second", startedAt: "2026-10-01T16:45:00Z")])
        let (authority, _) = makeAuthority(store)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        authority.markFinishing(sessionId: "session-1", finishedAt: "2026-10-01T17:30:00Z")
        authority.markFinishing(sessionId: "session-1", finishedAt: "2026-10-01T17:45:00Z")
        XCTAssertEqual(authority.draft(id: "session-1")?.finishedAt, "2026-10-01T17:30:00Z", "One stable session window.")
        XCTAssertNil(authority.draft(id: "session-1")?.rest)

        authority.endSession(sessionId: "session-1", reason: .committed)
        XCTAssertEqual(authority.lastChange?.kind, .ended(.committed))
        authority.endSession(sessionId: "second", reason: .cancelled)
        XCTAssertEqual(authority.lastChange?.kind, .ended(.cancelled))
        XCTAssertTrue(store.drafts.isEmpty)
        XCTAssertEqual(authority.endSession(sessionId: "second", reason: .cancelled), .rejected(.sessionEnded))
        XCTAssertEqual(authority.completeSet(sessionId: "second", exerciseId: "bench", setId: "b1",
                                             context: .intent(mutationId: "late", expectedRevision: 0)), .rejected(.sessionEnded),
                       "An intent arriving after Cancel cannot resurrect the session.")
    }

    func testAwaitingDurabilityEndsRestAndBlocksIntents() {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        authority.setSubmissionState(sessionId: "session-1", .acceptedProcessing)
        XCTAssertNil(authority.draft(id: "session-1")?.rest)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2",
                                             context: .intent(mutationId: "m", expectedRevision: 2)), .rejected(.sessionNotMutable))
    }

    func testMultipleDraftsAreIndependent() {
        let store = RecordingStore([liveSession(), liveSession(id: "past", mode: .past)])
        let (authority, _) = makeAuthority(store)
        let started = authority.startSession(mode: .live, workoutDate: "2026-10-01", startedAt: "2026-10-01T16:58:00Z")
        XCTAssertEqual(started?.currentRevision, 1)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        XCTAssertEqual(store.drafts.count, 3)
        XCTAssertEqual(store.stored("past")?.exercises.flatMap(\.sets).filter(\.isCompleted).count, 0)
        XCTAssertEqual(authority.activeLiveSession()?.id, started?.id, "The newest live draft is the active one.")
        XCTAssertNil(started?.rest)
    }

    func testAuthoritySwitchKeepsSandboxAndProductionSessionsSeparate() {
        let suite = "TrainingSessionAuthorityTests.switch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let environment = AppEnvironment(
            nativeAuthority: .sandbox,
            authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority"),
            trainingLoggerDraftStore: RecordingStore([liveSession(id: "sandbox-session")]),
            founderProductionTrainingLoggerDraftStore: RecordingStore([liveSession(id: "production-session")])
        )
        let sandbox = environment.trainingSessionAuthority(for: .sandbox)
        let production = environment.trainingSessionAuthority(for: .founderProduction)
        XCTAssertTrue(sandbox === environment.trainingSessionAuthority(for: .sandbox), "One app-scoped authority per Native authority.")
        XCTAssertEqual(sandbox.drafts.map(\.id), ["sandbox-session"])
        XCTAssertEqual(production.drafts.map(\.id), ["production-session"])
        XCTAssertEqual(sandbox.completeSet(sessionId: "production-session", exerciseId: "bench", setId: "b1",
                                           context: .intent(mutationId: "m", expectedRevision: 0)), .rejected(.sessionNotFound))
    }

    // MARK: Draft schema compatibility

    func testOlderDraftJSONDecodesAndUnknownRestModeDegradesToOff() throws {
        let older = #"{"id":"old","mode":"live","workoutDate":"2026-09-30","selectedAreaIds":[],"exercises":[{"id":"e","name":"Row","areaId":"back","measurement":"reps_load","sets":[{"id":"s","setNumber":1,"reps":8,"load":100,"isCompleted":true}],"isProvisional":false}],"relationships":[],"step":"workout"}"#
        let draft = try JSONDecoder().decode(TrainingLoggerDraft.self, from: Data(older.utf8))
        XCTAssertNil(draft.revision)
        XCTAssertNil(draft.rest)
        XCTAssertNil(draft.exercises[0].sets[0].completedAt)

        let newer = #"{"id":"r","mode":"interval","startedAt":"2026-10-01T17:00:00.000Z","sourceExerciseId":"e","sourceSetId":"s"}"#
        XCTAssertEqual(try JSONDecoder().decode(TrainingSessionRestState.self, from: Data(newer.utf8)).mode, .off)
    }

    // MARK: View model migration

    func testViewModelRendersAuthorityAndAnIntentIsVisibleImmediately() async throws {
        let store = RecordingStore()
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.start(mode: .live)
        let id = try XCTUnwrap(viewModel.draft?.id)
        let config = try await api.fetchConfiguration()
        let catalogExercise = try XCTUnwrap(config.exercises.first { $0.measurement == .repsLoad })
        viewModel.update { $0.addExercise(catalogExercise); $0.step = .workout }
        let exercise = try XCTUnwrap(viewModel.draft?.exercises.first)

        // UI edits, then an intent-style completion, then another UI edit.
        viewModel.setValue(exerciseId: exercise.id, setId: exercise.sets[0].id, field: .load, value: 95)
        viewModel.setValue(exerciseId: exercise.id, setId: exercise.sets[0].id, field: .reps, value: 12)
        let revision = try XCTUnwrap(viewModel.draft?.currentRevision)
        XCTAssertEqual(authority.completeSet(sessionId: id, exerciseId: exercise.id, setId: exercise.sets[0].id,
                                             context: .intent(mutationId: "la-1", expectedRevision: revision)), .applied(revision: revision + 1))
        XCTAssertEqual(viewModel.draft?.exercises[0].sets[0].isCompleted, true, "The screen reads the authority, never a private copy.")
        viewModel.setValue(exerciseId: exercise.id, setId: exercise.sets[1].id, field: .load, value: 135)

        let stored = try XCTUnwrap(store.stored(id))
        XCTAssertEqual(stored.exercises[0].sets[0].reps, 12)
        XCTAssertEqual(stored.exercises[0].sets[0].isCompleted, true, "The intent's completion was not lost to a later UI write.")
        XCTAssertEqual(stored.exercises[0].sets[1].load, 135)
        XCTAssertEqual(viewModel.draft, stored)
    }

    func testIntentAfterUIAndUIAfterIntentNeverLoseUpdatesThroughTheStructuralEditPath() async throws {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")

        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: intent(authority, "m1"))
        viewModel.update { $0.applyVariant(nil, to: "fly", catalog: []) ; $0.exercises[1].sets[0].reps = 15 }
        authority.completeSet(sessionId: "session-1", exerciseId: "fly", setId: "f1", context: intent(authority, "m2"))
        viewModel.setCompletion(exerciseId: "bench", setId: "b2", completed: true)

        let stored = try XCTUnwrap(store.stored("session-1"))
        XCTAssertEqual(stored.exercises.flatMap(\.sets).filter(\.isCompleted).map(\.id), ["b1", "b2", "f1"])
        XCTAssertEqual(stored.exercises[1].sets[0].reps, 15)
        XCTAssertEqual(stored.currentRevision, 4)
    }

    func testStaleRowTapCannotInvertANewerCompletion() async throws {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        let renderedIncomplete = try XCTUnwrap(viewModel.draft?.exercises[0].sets[0])
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: intent(authority, "m"))
        viewModel.setCompletion(exerciseId: "bench", setId: "b1", completed: !renderedIncomplete.isCompleted)
        XCTAssertEqual(viewModel.draft?.exercises[0].sets[0].isCompleted, true)
    }

    func testReopenedScreenSeesCurrentAuthorityStateWithoutReload() async throws {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        let first = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await first.load()
        first.resume(draftId: "session-1")
        first.setValue(exerciseId: "bench", setId: "b1", field: .reps, value: 6)
        // Screen dismissed; an intent completes a set while no Logger is on screen.
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: intent(authority, "bg"))

        let reopened = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await reopened.load()
        XCTAssertEqual(reopened.savedDraft?.exercises[0].sets[0].isCompleted, true)
        reopened.resume(draftId: "session-1")
        XCTAssertEqual(reopened.draft?.exercises[0].sets[0].reps, 6)
        XCTAssertEqual(first.draft, reopened.draft, "Every screen observes the same authoritative session.")
    }

    func testViewModelPersistIsANoOpAndEditsWriteExactlyOnce() async throws {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        let afterResume = store.persistCount
        viewModel.setValue(exerciseId: "bench", setId: "b1", field: .reps, value: 9)
        viewModel.setValue(exerciseId: "bench", setId: "b1", field: .reps, value: 9)
        viewModel.persist()
        viewModel.persist()
        XCTAssertEqual(store.persistCount, afterResume + 1, "One accepted change, one write; unchanged values and persist() write nothing.")
    }

    func testViewModelSurfacesOnlyPersistenceFailure() async throws {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        store.failPersist = true
        viewModel.setCompletion(exerciseId: "bench", setId: "b1", completed: true)
        XCTAssertEqual(viewModel.draft?.exercises[0].sets[0].isCompleted, false)
        XCTAssertNotNil(viewModel.validationMessage)
        store.failPersist = false
        viewModel.setCompletion(exerciseId: "bench", setId: "b1", completed: true)
        XCTAssertNil(viewModel.validationMessage)
    }

    // MARK: Review hardening

    func testIntentWithoutRevisionIsRefused() {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        let unversioned = TrainingSessionMutationContext(origin: .intent, mutationId: "m", expectedRevision: nil)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: unversioned), .rejected(.revisionRequired))
    }

    func testUnchangedIntentReplayedAfterUndoCannotReapply() {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1") // UI first, rev 1
        let rendered = intent(authority, "m1")
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: rendered), .unchanged(revision: 1))
        authority.setCompletion(sessionId: "session-1", exerciseId: "bench", setId: "b1", completed: false) // Founder undoes, rev 2
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1", context: rendered), .rejected(.staleRevision(current: 2)))
        XCTAssertEqual(authority.draft(id: "session-1")?.exercises[0].sets[0].isCompleted, false)
    }

    func testEndedSessionCannotBeRecreatedByALateWholeDraftWrite() async throws {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        let staleCopy = try XCTUnwrap(viewModel.draft)
        viewModel.cancelWorkout()
        XCTAssertEqual(authority.replace(staleCopy), .rejected(.sessionEnded))
        viewModel.draft = staleCopy
        XCTAssertTrue(store.drafts.isEmpty, "A cancelled workout never comes back as a saved draft.")
    }

    func testSecondFinishForTheSameSessionIsRefusedByTheLock() {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        XCTAssertTrue(authority.beginSubmission(sessionId: "session-1"))
        XCTAssertFalse(authority.beginSubmission(sessionId: "session-1"))
        authority.endSubmission(sessionId: "session-1")
        XCTAssertTrue(authority.beginSubmission(sessionId: "session-1"))
    }

    func testRestWithUnknownModeIsDropped() {
        var draft = liveSession()
        draft.exercises[0].sets[0].isCompleted = true
        draft.rest = .init(id: "r", mode: .off, startedAt: "2026-10-01T16:59:00.000Z", endsAt: nil, durationSeconds: nil, sourceExerciseId: "bench", sourceSetId: "b1")
        let (authority, _) = makeAuthority(RecordingStore([draft]))
        authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b2", field: .reps, value: 9)
        XCTAssertNil(authority.draft(id: "session-1")?.rest)
    }

    // MARK: Finish boundary through the view model

    private actor CountingWriteAPI: TrainingWriteAPI {
        enum Mode { case durable, processing, fail }
        var mode: Mode
        private(set) var commits: [TrainingLoggerDraft] = []
        private(set) var reconciles = 0
        private(set) var alreadyDurable = false
        init(_ mode: Mode = .durable) { self.mode = mode }
        func setAlreadyDurable(_ value: Bool) { alreadyDurable = value }
        func setMode(_ value: Mode) { mode = value }
        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            commits.append(draft)
            if mode == .fail { throw URLError(.notConnectedToInternet) }
            return TrainingCommitResult(
                status: mode == .durable ? "durable" : "accepted_processing", reviewId: nil, reviewRevision: nil,
                sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: draft.exercises.map(\.id)
            )
        }
        func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async { reconciles += 1 }
        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { alreadyDurable }
    }

    private func finishableSession() -> TrainingLoggerDraft {
        var draft = liveSession(step: .review)
        draft.exercises[0].sets[0].isCompleted = true
        return draft
    }

    func testFinishCommitsOnceReleasesTheLockAndEndsTheSession() async throws {
        let store = RecordingStore([finishableSession()])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        let writeAPI = CountingWriteAPI(.durable)
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()

        let commits = await writeAPI.commits
        XCTAssertEqual(commits.count, 1)
        XCTAssertNotNil(commits.first?.finishedAt, "finishedAt is stamped and persisted before the commit.")
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertTrue(authority.drafts.isEmpty, "The session is no longer editable.")
        XCTAssertEqual(store.drafts.map(\.isPendingCompletionPresentation), [true],
                       "Only the read-only Workout Complete presentation remains until Return to Log.")
        XCTAssertFalse(authority.isSubmitting(sessionId: "session-1"), "The lock is released after a durable commit.")
        XCTAssertEqual(authority.lastChange?.kind, .ended(.committed))
    }

    func testFailedFinishKeepsTheDraftAndReleasesTheLockSoRetryIsPossible() async throws {
        let store = RecordingStore([finishableSession()])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        let writeAPI = CountingWriteAPI(.fail)
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()
        XCTAssertNotNil(viewModel.validationMessage)
        XCTAssertFalse(authority.isSubmitting(sessionId: "session-1"))
        let stamped = try XCTUnwrap(store.stored("session-1")?.finishedAt)
        await writeAPI.setMode(.durable)
        await viewModel.submit()
        let commits = await writeAPI.commits
        XCTAssertEqual(commits.map(\.finishedAt), [stamped, stamped], "A retry reuses the one persisted finish window (same idempotency identity).")
        XCTAssertTrue(authority.drafts.isEmpty)
        XCTAssertEqual(store.drafts.map(\.isPendingCompletionPresentation), [true])
    }

    func testAcceptedProcessingPersistsSubmissionStateAndBlocksIntents() async throws {
        let store = RecordingStore([finishableSession()])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        let writeAPI = CountingWriteAPI(.processing)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction,
            durabilityRecoveryMaxAttempts: 0
        )
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        await viewModel.submit()
        XCTAssertEqual(store.stored("session-1")?.submissionState, .acceptedProcessing)
        XCTAssertTrue(viewModel.isAwaitingDurability)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2",
                                             context: .intent(mutationId: "late", expectedRevision: authority.draft(id: "session-1")!.currentRevision)),
                       .rejected(.sessionNotMutable))
    }

    func testRecoveryOfAnAlreadyDurableDraftCleansUpOnceAcrossTwoScreens() async throws {
        let store = RecordingStore([finishableSession()])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        let writeAPI = CountingWriteAPI(.durable)
        await writeAPI.setAlreadyDurable(true)
        let first = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction)
        let second = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, sessionAuthority: authority, authority: .founderProduction)
        await first.load()
        await second.load()
        XCTAssertTrue(store.drafts.isEmpty)
        XCTAssertEqual(store.discardCount, 1, "Only the screen that ended the session discards it.")
        XCTAssertEqual(first.draft?.step, .complete, "The recovering screen shows the completed workout.")
        XCTAssertNil(second.draft)
    }

    func testStartSurfacesAFailedLocalWrite() async throws {
        let store = RecordingStore()
        store.failPersist = true
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, sessionAuthority: authority)
        await viewModel.load()
        viewModel.start(mode: .live)
        XCTAssertNil(viewModel.draft)
        XCTAssertNotNil(viewModel.validationMessage)
    }

    // MARK: Concurrency

    func testInterleavedUIAndIntentCallersFromManyTasksSerializeWithoutLoss() async throws {
        let sets = (1...24).map { set("s\($0)", $0) }
        let store = RecordingStore([liveSession(exercises: [exercise("bench", sets: sets)])])
        let (authority, _) = makeAuthority(store)

        await withTaskGroup(of: Void.self) { group in
            for number in 1...24 {
                group.addTask {
                    // Off the main actor, like an intent's perform(): render the
                    // revision and complete in one turn on the authority's actor.
                    await MainActor.run {
                        _ = authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "s\(number)",
                                                  context: .intent(mutationId: "intent-\(number)",
                                                                   expectedRevision: authority.draft(id: "session-1")!.currentRevision))
                    }
                }
                group.addTask {
                    await authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "s\(number)",
                                             field: .load, value: Double(100 + number))
                }
                group.addTask { // replayed intent carrying an old revision
                    await authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "s\(number)",
                                                context: .intent(mutationId: "intent-\(number)", expectedRevision: 0))
                }
            }
        }

        let final = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertTrue(final.exercises[0].sets.allSatisfy(\.isCompleted))
        XCTAssertEqual(final.exercises[0].sets.map(\.load), (1...24).map { Double(100 + $0) })
        XCTAssertEqual(final.currentRevision, 48, "Exactly one revision per accepted change; replays add none.")
        XCTAssertEqual(store.persistCount, 48)
        XCTAssertEqual(store.stored("session-1"), final)
        XCTAssertNotNil(final.rest)
    }

    func testCompareAndSetLetsExactlyOneOfTwoRacingIntentsWin() async {
        let (authority, _) = makeAuthority(RecordingStore([liveSession()]))
        async let first = authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1",
                                                context: .intent(mutationId: "a", expectedRevision: 0))
        async let second = authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2",
                                                 context: .intent(mutationId: "b", expectedRevision: 0))
        let outcomes = await [first, second]
        XCTAssertEqual(outcomes.filter { $0 == .applied(revision: 1) }.count, 1)
        XCTAssertEqual(outcomes.filter { $0 == .rejected(.staleRevision(current: 1)) }.count, 1)
    }

    func testTwoRapidCompletionsOrderTimestampsEvenWithinOneSecond() {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        clock.advance(0.2)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b2")
        let first = TrainingSessionClock.date(from: completedAt(authority, "b1")!)!
        let second = TrainingSessionClock.date(from: completedAt(authority, "b2")!)!
        XCTAssertLessThan(first, second)
        XCTAssertEqual(authority.draft(id: "session-1")?.rest?.sourceSetId, "b2")
        XCTAssertEqual(authority.draft(id: "session-1")?.currentRevision, 2)
    }

    // MARK: Performance (deterministic)

    func testSetEntryStaysLocalAndWritesOncePerKeystroke() async throws {
        let store = RecordingStore([liveSession()])
        let (authority, _) = makeAuthority(store)
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: NotAvailableTrainingWriteAPI(), sessionAuthority: authority)
        await viewModel.load()
        viewModel.resume(draftId: "session-1")
        let before = store.persistCount
        let start = Date()
        for value in 1...200 {
            viewModel.setValue(exerciseId: "bench", setId: "b1", field: .reps, value: Double(value))
        }
        viewModel.setCompletion(exerciseId: "bench", setId: "b1", completed: true)
        let elapsed = Date().timeIntervalSince(start)
        XCTAssertEqual(store.persistCount - before, 201, "Exactly one synchronous local write per accepted edit, no network.")
        XCTAssertEqual(viewModel.draft?.exercises[0].sets[0].isCompleted, true, "Completion is visible synchronously.")
        XCTAssertLessThan(elapsed, 2, "201 local mutations took \(elapsed)s")
    }
}

private final class MemoryTrustedWorkoutCapabilityStore: HealthKitTrustedWorkoutCorrelationCapabilityStore, @unchecked Sendable {
    private var capability: HealthKitTrustedWorkoutCorrelationCapability?
    func load() -> HealthKitTrustedWorkoutCorrelationCapability? { capability }
    func save(_ capability: HealthKitTrustedWorkoutCorrelationCapability) { self.capability = capability }
}

// MARK: - Build 78: pending Workout Complete presentation

extension TrainingSessionAuthorityTests {
    func testCommittedPresentationIsReadOnlyAcknowledgedOnceAndFailsSoftWhenUnwritable() throws {
        let store = RecordingStore([finishableSession()])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        XCTAssertTrue(authority.endCommittedSession(sessionId: "session-1", retainingPresentation: true).isAccepted)
        XCTAssertEqual(authority.lastChange?.kind, .ended(.committed))
        let pending = try XCTUnwrap(authority.pendingCompletion(id: "session-1"))
        XCTAssertEqual(pending.step, .complete)
        XCTAssertNil(pending.rest, "No rest interval survives the commit.")
        XCTAssertNil(pending.submissionState)
        XCTAssertNotNil(pending.completionRecordedAt)
        XCTAssertEqual(authority.completeSet(sessionId: "session-1", exerciseId: pending.exercises[0].id,
                                             setId: pending.exercises[0].sets[0].id),
                       .rejected(.sessionEnded), "A Live Activity intent cannot touch a committed workout.")

        XCTAssertTrue(authority.acknowledgeCompletion(sessionId: "session-1"))
        // Build 83 (P8): Return to Log publishes so the paired Watch leaves
        // its summary at once; it is not a session mutation.
        XCTAssertEqual(authority.lastChange?.kind, .completionAcknowledged)
        let changeAfterAcknowledge = authority.lastChange
        XCTAssertFalse(authority.acknowledgeCompletion(sessionId: "session-1"), "Idempotent.")
        XCTAssertEqual(authority.lastChange, changeAfterAcknowledge, "A repeated acknowledge publishes nothing.")
        XCTAssertNotNil(authority.terminalRecord(sessionId: "session-1")?.acknowledgedAt)
        XCTAssertTrue(store.drafts.isEmpty)

        // A store that cannot write the presentation still ends the session.
        let failing = RecordingStore([finishableSession()])
        let (unwritable, _) = makeAuthority(failing, environment: .founderProduction)
        failing.failPersist = true
        XCTAssertTrue(unwritable.endCommittedSession(sessionId: "session-1", retainingPresentation: true).isAccepted)
        XCTAssertNil(unwritable.pendingCompletion())
        XCTAssertTrue(failing.drafts.isEmpty, "The durable workout is the Server's; only the presentation is lost.")
    }

    func testANewerCompletionSupersedesAnOlderOwedOne() {
        var second = finishableSession()
        second.id = "session-2"
        let store = RecordingStore([finishableSession(), second])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        XCTAssertTrue(authority.endCommittedSession(sessionId: "session-1", retainingPresentation: true).isAccepted)
        XCTAssertTrue(authority.endCommittedSession(sessionId: "session-2", retainingPresentation: true).isAccepted)
        XCTAssertEqual(authority.pendingCompletions.map(\.id), ["session-2"])
        XCTAssertTrue(authority.acknowledgeCompletion(sessionId: "session-2"))
        XCTAssertNil(authority.pendingCompletion(), "The older completion never resurfaces.")
        XCTAssertNil(authority.logTabRoutingTarget())
        XCTAssertTrue(store.drafts.isEmpty)
    }

    func testStalePresentationIsPrunedWhenTheAuthorityIsCreatedAtLaunch() {
        var stale = finishableSession()
        stale.step = .complete
        stale.completionPresentationPending = true
        stale.completionRecordedAt = "2026-09-30T08:00:00Z"
        var recent = finishableSession()
        recent.id = "session-recent"
        recent.step = .complete
        recent.completionPresentationPending = true
        recent.completionRecordedAt = TrainingSessionClock.string(from: t0.addingTimeInterval(-60))
        let store = RecordingStore([stale, recent])
        let (authority, _) = makeAuthority(store, environment: .founderProduction)
        XCTAssertEqual(store.drafts.map(\.id), ["session-recent"], "Older than the in-progress window: discarded.")
        XCTAssertEqual(authority.pendingCompletion()?.id, "session-recent")
        XCTAssertTrue(authority.drafts.isEmpty)
    }
}

// MARK: - Build 86: Watch Health start for phone-started sessions

extension TrainingSessionAuthorityTests {
    private func healthStartCommand(
        id: String, sessionId: String = "session-1", at healthStartedAt: Date?, revision: Int = 99
    ) -> WatchWorkoutCommand {
        WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: id, mutationId: id,
            kind: .reportHealthStarted, sessionId: sessionId, expectedRevision: revision,
            exerciseId: nil, setId: nil, healthStartedAt: healthStartedAt, issuedAt: t0
        )
    }

    // 6: the phone records the Watch Health start exactly once and never moves the structured start.
    func testWatchHealthStartIsRecordedOnceAndNeverMovesTheStructuredStart() throws {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let structuredStart = try XCTUnwrap(authority.draft(id: "session-1")?.startedAt)
        let healthStart = t0.addingTimeInterval(300)

        let first = router.route(healthStartCommand(id: "hs-1", at: healthStart))
        XCTAssertEqual(first.status, .applied, "Identified by session, not revision-guarded.")
        let recorded = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(recorded.watchHealthStartedAt, TrainingSessionClock.string(from: healthStart))
        XCTAssertEqual(recorded.startedAt, structuredStart, "The structured start (and every envelope) is unchanged.")
        XCTAssertNil(recorded.watchStartedAt, "A phone-started session is not relabelled Watch-started.")
        XCTAssertEqual(first.projection?.watchHealthStartedAt, healthStart)

        XCTAssertEqual(router.route(healthStartCommand(id: "hs-1", at: healthStart)).status, .unchanged, "Replay.")
        XCTAssertEqual(router.route(healthStartCommand(id: "hs-2", at: healthStart.addingTimeInterval(60))).status, .unchanged)
        XCTAssertEqual(authority.draft(id: "session-1")?.watchHealthStartedAt, TrainingSessionClock.string(from: healthStart))
        XCTAssertEqual(authority.draft(id: "session-1")?.currentRevision, recorded.currentRevision, "Exactly one mutation.")

        let missingInstant = router.route(healthStartCommand(id: "hs-3", at: nil))
        XCTAssertEqual(missingInstant.status, .rejected)
        XCTAssertEqual(missingInstant.reason, .invalidCommand)
        XCTAssertEqual(router.route(healthStartCommand(id: "hs-4", sessionId: "unknown", at: healthStart)).status, .rejected)
    }

    func testWatchStartedSessionAlreadyOwnsItsHealthWorkout() throws {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        XCTAssertEqual(authority.setReadyForWatch(sessionId: "session-1", ready: true), .applied(revision: 1))
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        let start = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "start", mutationId: "start",
            kind: .startPreparedWorkout, sessionId: "session-1", expectedRevision: 1,
            exerciseId: nil, setId: nil, issuedAt: clock.now
        )
        let started = router.route(start)
        XCTAssertEqual(started.status, .applied)
        XCTAssertNotNil(started.projection?.watchHealthStartedAt, "The Watch never auto-starts a second workout.")
        XCTAssertEqual(router.route(healthStartCommand(id: "hs", at: t0.addingTimeInterval(5))).status, .unchanged)
        XCTAssertNil(authority.draft(id: "session-1")?.watchHealthStartedAt)
    }

    // 7 (phone half): a phone Finish after a reported start expects exactly one Health leg.
    func testPhoneFinishAfterReportedHealthStartExpectsExactlyOneHealthSave() throws {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        XCTAssertEqual(router.route(healthStartCommand(id: "hs", at: t0.addingTimeInterval(30))).status, .applied)
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        clock.advance(600)
        XCTAssertTrue(authority.confirmPhoneFinish(
            sessionId: "session-1", finishedAt: TrainingSessionClock.string(from: clock.now), finishOperationId: "op-1"
        ).isAccepted)
        let finished = try XCTUnwrap(authority.draft(id: "session-1"))
        XCTAssertEqual(finished.watchHealthSaveState, .pending)
        let projection = try XCTUnwrap(router.currentProjection())
        XCTAssertTrue(projection.requiresHealthSave)
        XCTAssertEqual(projection.finish?.healthExpected, true)

        let save = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion, commandId: "save", mutationId: "save",
            kind: .reportHealthSaved, sessionId: "session-1", expectedRevision: 0,
            exerciseId: nil, setId: nil, finishOperationId: "op-1", issuedAt: clock.now
        )
        XCTAssertEqual(router.route(save).status, .applied)
        XCTAssertEqual(router.route(save).status, .unchanged, "One Health save leg.")
        XCTAssertEqual(authority.draft(id: "session-1")?.watchHealthSaveState, .succeeded)

        // Without a Watch Health workout the Finish expects no Health leg (unchanged behavior).
        let (plain, _) = makeAuthority(RecordingStore([liveSession(id: "session-2")]))
        plain.completeSet(sessionId: "session-2", exerciseId: "bench", setId: "b1")
        XCTAssertTrue(plain.confirmPhoneFinish(sessionId: "session-2", finishedAt: TrainingSessionClock.string(from: t0)).isAccepted)
        XCTAssertNil(plain.draft(id: "session-2")?.watchHealthSaveState)
    }

    func testHealthStartReportedAfterTheFinishStampStillExpectsTheHealthLeg() throws {
        let (authority, clock) = makeAuthority(RecordingStore([liveSession()]))
        authority.completeSet(sessionId: "session-1", exerciseId: "bench", setId: "b1")
        XCTAssertTrue(authority.confirmPhoneFinish(
            sessionId: "session-1", finishedAt: TrainingSessionClock.string(from: t0), finishOperationId: "op-1"
        ).isAccepted)
        XCTAssertNil(authority.draft(id: "session-1")?.watchHealthSaveState)
        let router = WatchWorkoutCommandRouter(authority: authority, isPhoneReachable: { true }, now: { clock.now })
        XCTAssertEqual(router.route(healthStartCommand(id: "late", at: t0.addingTimeInterval(-60))).status, .applied)
        XCTAssertEqual(authority.draft(id: "session-1")?.watchHealthSaveState, .pending)
    }

    // 15: today's evidence set at the policy level. The trusted boundary is unchanged.
    func testTodaysWorkoutSetNeverWidensTrustedCorrelation() throws {
        let effective = t0.addingTimeInterval(-3_600)
        let capability = HealthKitTrustedWorkoutCorrelationCapability.resolve(manifestBlock: .object([
            "contractVersion": .string(HealthKitTrustedWorkoutCorrelationContract.contractVersion),
            "enabled": .bool(true), "prospectiveOnly": .bool(true),
            "trustedSourceBundleIdentifiers": .array([.string("com.physiqueos.native.dev")]),
            "traditionalStrengthTrainingActivityTypes": .array([.string("50")]),
            "clockToleranceSeconds": .number(120),
            "effectiveAt": .string(ISO8601DateFormatter().string(from: effective))
        ]), at: t0)
        let gate = HealthKitTrustedWorkoutCorrelationGate(store: MemoryTrustedWorkoutCapabilityStore())
        gate.update(capability)

        // A phone-started session whose Watch Health workout began 20 minutes late.
        let sessionID = UUID()
        var session = liveSession(id: sessionID.uuidString, startedAt: TrainingSessionClock.string(from: t0))
        session.watchHealthStartedAt = TrainingSessionClock.string(from: t0.addingTimeInterval(1_200))
        session.finishedAt = TrainingSessionClock.string(from: t0.addingTimeInterval(4_200))
        session.watchFinishOperationId = "finish-today"
        let registryNow = t0.addingTimeInterval(4_300)
        let registry = HealthKitTrustedWorkoutCorrelationRegistry(
            gate: gate,
            drafts: MemoryTrainingLoggerDraftStore(drafts: [session]),
            terminalLedger: MemoryTrainingSessionTerminalLedgerStore(),
            now: { registryNow }
        )
        let context = registry.context(ownerKey: "founder")
        XCTAssertEqual(context.sessions.map(\.startedAt), [t0], "Envelope = structured start, never the Health start.")
        XCTAssertEqual(context.clockToleranceSeconds, 120)

        func extract(
            uuid: String? = sessionID.uuidString, source: String = "com.physiqueos.native.dev",
            activity: String = "50", start: TimeInterval, end: TimeInterval
        ) -> String? {
            HealthKitTrustedWorkoutCorrelation.extract(
                externalUUID: uuid, sourceBundleIdentifier: source, activityType: activity, isIndoorWorkout: true,
                startedAt: t0.addingTimeInterval(start), endedAt: t0.addingTimeInterval(end), context: context
            )
        }
        // The PhysiqueOS Watch workout carrying the exact session UUID is the same session.
        XCTAssertEqual(extract(start: 1_200, end: 4_200), sessionID.uuidString.lowercased())
        // The 120 s boundary is exactly where it was.
        XCTAssertNotNil(extract(start: -120, end: 4_200))
        XCTAssertNil(extract(start: -121, end: 4_200))
        XCTAssertNil(extract(start: 1_200, end: 4_321))
        // Apple's Workout app strength workout, started late by hand: never trusted.
        XCTAssertNil(extract(uuid: nil, source: "com.apple.health.workout", start: 1_500, end: 4_190))
        XCTAssertNil(extract(source: "com.apple.health.workout", start: 1_500, end: 4_190))
        // Two Stair Stepper workouts (stair climbing, type 44): never trusted strength.
        XCTAssertNil(extract(activity: "44", start: -1_800, end: -600))
        XCTAssertNil(extract(uuid: nil, source: "com.apple.health.workout", activity: "44", start: 4_400, end: 5_000))
        // Before the prospective activation nothing is trusted.
        var preActivation = context
        preActivation.effectiveAt = t0.addingTimeInterval(1_300)
        XCTAssertNil(HealthKitTrustedWorkoutCorrelation.extract(
            externalUUID: sessionID.uuidString, sourceBundleIdentifier: "com.physiqueos.native.dev", activityType: "50",
            isIndoorWorkout: true, startedAt: t0.addingTimeInterval(1_200), endedAt: t0.addingTimeInterval(4_200),
            context: preActivation
        ))
    }
}
