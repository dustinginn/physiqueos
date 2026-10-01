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
        XCTAssertTrue(store.drafts.isEmpty)
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
        XCTAssertTrue(store.drafts.isEmpty)
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
