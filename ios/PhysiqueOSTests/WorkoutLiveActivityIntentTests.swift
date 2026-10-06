import AppIntents
import XCTest
@testable import PhysiqueOS

/// The Complete Set path: the shared intent's runtime hook -> bridge ->
/// `TrainingSessionAuthority.completeSet`. There is one mutation
/// implementation; these tests prove every outcome fails (or succeeds) safely.
@MainActor
final class WorkoutLiveActivityIntentTests: XCTestCase {
    private typealias F = WorkoutLiveActivityTestFixtures

    private struct Rig {
        var environment: AppEnvironment
        var bridge: WorkoutLiveActivityBridge
        var store: TrainingSessionAuthorityTests.RecordingStore
        var authority: TrainingSessionAuthority
        var client: FakeWorkoutLiveActivityClient
    }

    private func rig(draft: TrainingLoggerDraft? = nil) -> Rig {
        let suite = "WorkoutLiveActivityIntentTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let store = TrainingSessionAuthorityTests.RecordingStore(draft.map { [$0] } ?? [])
        let environment = AppEnvironment(
            nativeAuthority: .sandbox,
            authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority"),
            trainingLoggerDraftStore: store
        )
        environment.useTrainingRestPreferences(UserDefaultsTrainingRestPreferences(defaults: defaults))
        let client = FakeWorkoutLiveActivityClient()
        let bridge = WorkoutLiveActivityBridge(environment: environment, client: client)
        return Rig(environment: environment, bridge: bridge, store: store,
                   authority: environment.trainingSessionAuthority(for: .sandbox), client: client)
    }

    private func session(step: TrainingLoggerStep = .workout, startedSecondsAgo: TimeInterval = 600) -> TrainingLoggerDraft {
        var draft = F.session([
            F.exercise("bench", "Bench Press", sets: [F.set("b1", 1), F.set("b2", 2)]),
        ], step: step, startedAt: TrainingSessionClock.string(from: Date().addingTimeInterval(-startedSecondsAgo)), revision: 3)
        draft.startedAt = TrainingSessionClock.string(from: Date().addingTimeInterval(-startedSecondsAgo))
        return draft
    }

    private func request(_ rig: Rig, set: String = "b1", revision: Int? = nil, id: String = UUID().uuidString,
                         authority: String = "sandbox", session: String = "session-1", exercise: String = "bench") -> WorkoutCompleteSetRequest {
        .init(sessionId: session, authority: authority, exerciseId: exercise, setId: set,
              expectedRevision: revision ?? (rig.authority.draft(id: "session-1")?.currentRevision ?? 0), mutationId: id)
    }

    func testAppliedCompletesTheExactSetAndStartsRestAtTheNewRevision() {
        let rig = rig(draft: session())
        let outcome = rig.bridge.complete(request(rig))
        XCTAssertEqual(outcome, .applied)
        let draft = rig.authority.draft(id: "session-1")
        XCTAssertEqual(draft?.exercises[0].sets[0].isCompleted, true)
        XCTAssertNotNil(draft?.exercises[0].sets[0].completedAt)
        XCTAssertEqual(draft?.currentRevision, 4)
        XCTAssertNotNil(draft?.rest, "Completing from the Live Activity starts rest like the Logger does.")
        XCTAssertEqual(rig.store.stored("session-1"), draft, "Memory equals storage.")
    }

    func testTheSameRequestAgainIsADuplicateAndChangesNothing() {
        let rig = rig(draft: session())
        let first = request(rig)
        XCTAssertEqual(rig.bridge.complete(first), .applied)
        let persisted = rig.store.persistCount
        XCTAssertEqual(rig.bridge.complete(first), .duplicate)
        XCTAssertEqual(rig.store.persistCount, persisted)
    }

    func testRapidDoubleTapWithFreshMutationIdsCompletesOnlyOnce() {
        let rig = rig(draft: session())
        let revision = rig.authority.draft(id: "session-1")!.currentRevision
        XCTAssertEqual(rig.bridge.complete(request(rig, revision: revision)), .applied)
        XCTAssertEqual(rig.bridge.complete(request(rig, revision: revision)), .unchanged, "The same rendered button tapped twice.")
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 1)
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.currentRevision, revision + 1)
    }

    func testStaleRevisionIsRefusedAndTheWrongSetIsNeverCompleted() {
        let rig = rig(draft: session())
        // The Founder edits in the Logger after the activity rendered.
        let rendered = rig.authority.draft(id: "session-1")!.currentRevision
        rig.authority.setValue(sessionId: "session-1", exerciseId: "bench", setId: "b2", field: .reps, value: 12)
        XCTAssertEqual(rig.bridge.complete(request(rig, revision: rendered)), .stale)
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 0)
    }

    func testWrongIdentityAndEndedSessions() {
        let rig = rig(draft: session())
        XCTAssertEqual(rig.bridge.complete(request(rig, set: "nope")), .stale, "A set that no longer exists is a stale target.")
        XCTAssertEqual(rig.bridge.complete(request(rig, exercise: "other")), .stale)
        XCTAssertEqual(rig.bridge.complete(request(rig, session: "ended-session")), .sessionEnded)
        rig.authority.endSession(sessionId: "session-1", reason: .cancelled)
        XCTAssertEqual(rig.bridge.complete(request(rig, revision: 3)), .sessionEnded, "A late tap after Cancel cannot resurrect the workout.")
    }

    func testWrongPhaseIsRefused() {
        for step in [TrainingLoggerStep.review, .summary] {
            let rig = rig(draft: session(step: step))
            XCTAssertEqual(rig.bridge.complete(request(rig)), .notMutable, "\(step)")
            XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 0)
        }
        var left = session()
        left.leftAt = TrainingSessionClock.string(from: Date())
        let leftRig = rig(draft: left)
        XCTAssertEqual(leftRig.bridge.complete(request(leftRig)), .notMutable)

        var submitting = session()
        submitting.submissionState = .acceptedProcessing
        let rig3 = rig(draft: submitting)
        XCTAssertEqual(rig3.bridge.complete(request(rig3)), .notMutable)

        let rig4 = rig(draft: session())
        XCTAssertTrue(rig4.authority.beginSubmission(sessionId: "session-1"))
        XCTAssertEqual(rig4.bridge.complete(request(rig4)), .notMutable, "Finish in flight blocks Complete Set.")
    }

    func testInvalidValuesAreNotRecordedAsPerformed() {
        var draft = session()
        draft.exercises[0].sets[0].reps = nil
        draft.exercises[0].sets[0].load = nil
        let rig = rig(draft: draft)
        XCTAssertEqual(rig.bridge.complete(request(rig)), .invalidValues)
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 0)
    }

    func testPrefilledValuesAreConfirmedAsDisplayed() {
        // Founder decision: Complete Set records the values currently shown.
        let rig = rig(draft: session())
        XCTAssertEqual(rig.bridge.complete(request(rig)), .applied)
        let set = rig.authority.draft(id: "session-1")?.exercises[0].sets[0]
        XCTAssertEqual(set?.reps, 8)
        XCTAssertEqual(set?.load, 185)
    }

    func testPersistenceFailureLeavesStateUnchanged() {
        let rig = rig(draft: session())
        rig.store.failPersist = true
        XCTAssertEqual(rig.bridge.complete(request(rig)), .persistenceFailed)
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 0)
        rig.store.failPersist = false
        XCTAssertEqual(rig.bridge.complete(request(rig)), .applied)
    }

    func testUnknownOrMismatchedAuthority() {
        let rig = rig(draft: session())
        XCTAssertEqual(rig.bridge.complete(request(rig, authority: "bogus")), .unavailable)
        XCTAssertEqual(rig.bridge.complete(request(rig, authority: "founderProduction")), .sessionEnded,
                       "The Production authority has no such workout; Sandbox state is never touched.")
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 0)
    }

    func testOutcomeMappingIsExhaustive() {
        typealias Reason = TrainingSessionMutationRejection
        let cases: [(TrainingSessionMutationOutcome, WorkoutCompleteSetOutcome)] = [
            (.applied(revision: 1), .applied), (.unchanged(revision: 1), .unchanged), (.duplicate(revision: 1), .duplicate),
            (.rejected(Reason.staleRevision(current: 2)), .stale), (.rejected(Reason.exerciseNotFound), .stale), (.rejected(Reason.setNotFound), .stale),
            (.rejected(Reason.sessionNotFound), .sessionEnded), (.rejected(Reason.sessionEnded), .sessionEnded),
            (.rejected(Reason.sessionNotMutable), .notMutable), (.rejected(Reason.originNotPermitted), .notMutable),
            (.rejected(Reason.revisionRequired), .notMutable), (.rejected(Reason.restNotFound), .notMutable), (.rejected(Reason.writesNotAuthorized), .notMutable),
            (.rejected(Reason.setValuesIncomplete), .invalidValues), (.rejected(Reason.persistenceFailed), .persistenceFailed),
        ]
        for (input, expected) in cases { XCTAssertEqual(WorkoutLiveActivityBridge.map(input), expected, "\(input)") }
    }

    // MARK: Runtime hook / intent object

    func testRuntimeResolvesThroughTheInstalledHandlerAndFailsClosedWithout() async {
        let previous = WorkoutActivityIntentRuntime.handler
        defer { WorkoutActivityIntentRuntime.handler = previous }
        let sample = WorkoutCompleteSetRequest(sessionId: "s", authority: "sandbox", exerciseId: "e", setId: "x", expectedRevision: 1, mutationId: "m")

        WorkoutActivityIntentRuntime.handler = nil
        let none = await WorkoutActivityIntentRuntime.resolve(sample, waitingUpTo: 0.15)
        XCTAssertEqual(none, .unavailable)

        WorkoutActivityIntentRuntime.handler = { request in request == sample ? .applied : .stale }
        let applied = await WorkoutActivityIntentRuntime.resolve(sample)
        XCTAssertEqual(applied, .applied)
    }

    func testBridgeInstallsTheHandlerThatReachesTheAuthority() async {
        let previous = WorkoutActivityIntentRuntime.handler
        defer { WorkoutActivityIntentRuntime.handler = previous }
        let rig = rig(draft: session())
        rig.bridge.install()
        let outcome = await WorkoutActivityIntentRuntime.resolve(request(rig))
        XCTAssertEqual(outcome, .applied)
        XCTAssertEqual(rig.authority.draft(id: "session-1")?.completedSetCount, 1)
        let rendered = rig.client.live.first?.state
        XCTAssertEqual(rendered?.completedSets, 1, "The intent returns only after the Live Activity re-rendered.")
        XCTAssertEqual(rendered?.target?.setId, "b2")
        XCTAssertEqual(rendered?.revision, rig.authority.draft(id: "session-1")?.currentRevision)
        XCTAssertNotNil(rendered?.rest)
    }

    /// Build 89 integration: the real Complete Set pipeline moves the
    /// rendered clock from the no-rest WORKOUT stopwatch to the rest
    /// stopwatch; the timer authority (rest state, revision) is untouched.
    func testCompleteSetRendersTheTransitionFromWorkoutStopwatchToRestStopwatch() async {
        let previous = WorkoutActivityIntentRuntime.handler
        defer { WorkoutActivityIntentRuntime.handler = previous }
        let rig = rig(draft: session())
        rig.bridge.install()
        let draftBefore = rig.authority.draft(id: "session-1")
        XCTAssertNil(draftBefore?.rest, "Before the first set there is no rest.")
        let projection = TrainingSessionLiveProjection.make(from: draftBefore!, areaLabels: [:], now: Date())!
        let beforeState = WorkoutActivityAttributes.ContentState(projection: projection, finishing: false)
        XCTAssertNil(beforeState.rest)
        XCTAssertEqual(WorkoutClockPresentation.make(state: beforeState, isStale: false, showsRest: true),
                       .init(clock: .workoutElapsed, glyph: "stopwatch", label: "WORKOUT", accessibilityLabel: "Workout time"))

        let outcome = await WorkoutActivityIntentRuntime.resolve(request(rig))
        XCTAssertEqual(outcome, .applied)
        let draftAfter = rig.authority.draft(id: "session-1")
        let rendered = rig.client.live.first?.state
        XCTAssertEqual(rendered?.rest?.mode, .stopwatch)
        XCTAssertEqual(rendered?.rest?.id, draftAfter?.rest?.id, "The rendered rest is the authority's rest.")
        XCTAssertEqual(rendered?.revision, draftAfter?.currentRevision)
        XCTAssertEqual(rendered.map { WorkoutClockPresentation.make(state: $0, isStale: false, showsRest: true) },
                       .init(clock: .rest, glyph: "stopwatch", label: "REST · STOPWATCH", accessibilityLabel: "Rest stopwatch"))
    }

    func testTheIntentCarriesTheExactRenderedIdentityAndIsNotDiscoverable() async throws {
        let intent = CompleteWorkoutSetIntent(sessionId: "s1", authority: "founderProduction", exerciseId: "e1", setId: "set1", expectedRevision: 7)
        XCTAssertEqual(intent.sessionId, "s1")
        XCTAssertEqual(intent.authority, "founderProduction")
        XCTAssertEqual(intent.exerciseId, "e1")
        XCTAssertEqual(intent.setId, "set1")
        XCTAssertEqual(intent.expectedRevision, 7)
        XCTAssertFalse(CompleteWorkoutSetIntent.isDiscoverable)
        XCTAssertFalse(CompleteWorkoutSetIntent.openAppWhenRun)
        XCTAssertEqual(String(describing: CompleteWorkoutSetIntent.authenticationPolicy), String(describing: IntentAuthenticationPolicy.alwaysAllowed))

        let previous = WorkoutActivityIntentRuntime.handler
        defer { WorkoutActivityIntentRuntime.handler = previous }
        let box = RequestBox()
        WorkoutActivityIntentRuntime.handler = { request in await box.record(request); return .applied }
        _ = try await intent.perform()
        _ = try await intent.perform()
        let seen = await box.requests
        XCTAssertEqual(seen.count, 2)
        XCTAssertEqual(seen.map(\.setId), ["set1", "set1"])
        XCTAssertEqual(seen.map(\.expectedRevision), [7, 7])
        XCTAssertNotEqual(seen[0].mutationId, seen[1].mutationId, "Each user action gets its own mutation id.")
    }

    private actor RequestBox {
        private(set) var requests: [WorkoutCompleteSetRequest] = []
        func record(_ request: WorkoutCompleteSetRequest) { requests.append(request) }
    }

    // MARK: Relaunch

    func testRelaunchBetweenTheTapAndTheNextRenderKeepsTheCompletion() {
        let rig = rig(draft: session())
        XCTAssertEqual(rig.bridge.complete(request(rig)), .applied)
        // A new process: a fresh authority over the same store.
        let relaunched = TrainingSessionAuthority(store: rig.store, environment: .sandbox)
        XCTAssertEqual(relaunched.draft(id: "session-1")?.exercises[0].sets[0].isCompleted, true)
        XCTAssertNotNil(relaunched.draft(id: "session-1")?.rest)
    }
}
