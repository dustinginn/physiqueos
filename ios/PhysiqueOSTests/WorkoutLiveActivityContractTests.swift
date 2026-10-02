import XCTest
@testable import PhysiqueOS

/// Shared fixtures for the Live Activity test files.
enum WorkoutLiveActivityTestFixtures {
    static let now = ISO8601DateFormatter().date(from: "2026-10-01T17:00:00Z")!

    static func stamp(_ secondsAgo: TimeInterval) -> String {
        TrainingSessionClock.string(from: now.addingTimeInterval(-secondsAgo))
    }

    static func set(_ id: String, _ number: Int, reps: Double? = 8, load: Double? = 185, duration: Double? = nil,
                    done: String? = nil) -> TrainingLoggerDraftSet {
        TrainingLoggerDraftSet(id: id, setNumber: number, reps: reps, load: load, durationSeconds: duration,
                               isCompleted: done != nil, completedAt: done)
    }

    static func exercise(_ id: String, _ name: String, measurement: TrainingLoggerMeasurement = .repsLoad,
                         defaultLoadType: String? = nil, sets: [TrainingLoggerDraftSet]) -> TrainingLoggerDraftExercise {
        TrainingLoggerDraftExercise(
            id: id, canonicalExerciseId: "canonical-\(id)", name: name, areaId: "chest", measurement: measurement,
            defaultLoadType: defaultLoadType, executionVariant: nil, sets: sets, previousPerformance: nil,
            progressionRecommendation: nil, progressionChoice: nil, isProvisional: false, provenance: nil
        )
    }

    static func session(
        id: String = "session-1", _ exercises: [TrainingLoggerDraftExercise],
        relationships: [TrainingLoggerDraftRelationship] = [], step: TrainingLoggerStep = .workout,
        startedAt: String? = nil, revision: Int = 5
    ) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-10-01", startedAt: startedAt ?? stamp(48 * 60 + 12))
        draft.id = id
        draft.selectedAreaIds = ["chest", "shoulders"]
        draft.exercises = exercises
        draft.relationships = relationships
        draft.step = step
        draft.revision = revision
        return draft
    }

    /// Bench 4 sets (2 done), Fly 3 sets: a normal Previous + Current moment.
    static func normalDraft() -> TrainingLoggerDraft {
        session([
            exercise("bench", "Incline Dumbbell Press", sets: [
                set("b1", 1, load: 80, done: stamp(300)), set("b2", 2, reps: 10, load: 80, done: stamp(200)),
                set("b3", 3, reps: 8, load: 85), set("b4", 4, reps: 8, load: 85),
            ]),
            exercise("fly", "Cable Lateral Raise", sets: [set("f1", 1, reps: 12, load: 20), set("f2", 2, reps: 12, load: 20), set("f3", 3, reps: 12, load: 20)]),
        ])
    }

    static func projection(_ draft: TrainingLoggerDraft, now: Date = now) -> TrainingSessionLiveProjection {
        TrainingSessionLiveProjection.make(from: draft, areaLabels: ["chest": "Chest", "shoulders": "Shoulders"], now: now)!
    }

    static func rest(stopwatchSecondsAgo seconds: TimeInterval) -> TrainingSessionRestState {
        .init(id: "rest-1", mode: .stopwatch, startedAt: stamp(seconds), endsAt: nil, durationSeconds: nil,
              sourceExerciseId: "bench", sourceSetId: "b2")
    }

    static func countdown(startedSecondsAgo: TimeInterval, remaining: TimeInterval, duration: Int = 90) -> TrainingSessionRestState {
        .init(id: "rest-2", mode: .countdown, startedAt: stamp(startedSecondsAgo),
              endsAt: TrainingSessionClock.string(from: now.addingTimeInterval(remaining)), durationSeconds: duration,
              sourceExerciseId: "bench", sourceSetId: "b2")
    }
}

final class WorkoutLiveActivityContractTests: XCTestCase {
    private typealias F = WorkoutLiveActivityTestFixtures
    private typealias State = WorkoutActivityAttributes.ContentState

    private func state(_ draft: TrainingLoggerDraft, finishing: Bool = false) -> State {
        State(projection: F.projection(draft), finishing: finishing)
    }

    // MARK: Mapping

    func testNormalProjectionMapsToPreviousPlusCurrentWithTheCompletionTarget() {
        var draft = F.normalDraft()
        draft.rest = F.rest(stopwatchSecondsAgo: 107)
        let state = state(draft)
        XCTAssertEqual(state.phase, .inProgress)
        XCTAssertEqual(state.layout, .previousAndCurrent)
        XCTAssertEqual(state.rows.map(\.role), [.previous, .current])
        XCTAssertEqual(state.rows.map(\.isTarget), [false, true])
        XCTAssertEqual(state.rows[0].valueText, "80 lb × 10")
        XCTAssertEqual(state.rows[1].valueText, "85 lb × 8")
        XCTAssertEqual(state.target, .init(exerciseId: "bench", setId: "b3"))
        XCTAssertEqual(state.revision, 5)
        XCTAssertEqual(state.completedSets, 2)
        XCTAssertEqual(state.totalSets, 7)
        XCTAssertEqual(state.progressText, "2/7 sets")
        XCTAssertEqual(state.label, "Chest · Shoulders")
        XCTAssertTrue(state.canCompleteSet)
        XCTAssertEqual(state.rest?.mode, .stopwatch)
        XCTAssertEqual(state.rest?.startedAt, F.now.addingTimeInterval(-107))
        XCTAssertNil(state.rest?.endsAt)
    }

    func testFinalSetAndPostFinalLayoutsAndMaxTwoRows() {
        var draft = F.normalDraft()
        draft.exercises[0].sets[2].isCompleted = true; draft.exercises[0].sets[2].completedAt = F.stamp(100)
        var mapped = state(draft)
        XCTAssertEqual(mapped.layout, .currentAndUpNext)
        XCTAssertEqual(mapped.rows.map(\.role), [.current, .upNext])
        XCTAssertEqual(mapped.rows.map(\.exerciseName), ["Incline Dumbbell Press", "Cable Lateral Raise"])

        draft.exercises[0].sets[3].isCompleted = true; draft.exercises[0].sets[3].completedAt = F.stamp(20)
        mapped = state(draft)
        XCTAssertEqual(mapped.layout, .completedAndUpNext)
        XCTAssertEqual(mapped.rows.map(\.role), [.completed, .upNext])
        XCTAssertEqual(mapped.rows.map(\.isTarget), [false, true], "Complete Set completes the Up Next row after an exercise ends.")
        XCTAssertEqual(mapped.target?.setId, "f1")
        XCTAssertLessThanOrEqual(mapped.rows.count, 2)
    }

    func testSupersetRowsCarryMemberLabelsAndPartnerNames() {
        let draft = F.session([
            F.exercise("a", "Cable Fly", sets: [F.set("a1", 1, done: F.stamp(60)), F.set("a2", 2)]),
            F.exercise("b", "Chest-Supported Row", sets: [F.set("b1", 1), F.set("b2", 2)]),
        ], relationships: [.init(id: "ss", relationshipType: "superset", memberExerciseIds: ["a", "b"])])
        let mapped = state(draft)
        XCTAssertEqual(mapped.rows.map(\.supersetLabel), ["A", "B"])
        XCTAssertEqual(mapped.rows[1].partnerName, "Cable Fly")
        XCTAssertEqual(mapped.rows[1].setNumber, 1, "Round 1: B1 follows A1.")
    }

    func testRestModesStopwatchCountdownAndOff() {
        var draft = F.normalDraft()
        XCTAssertNil(state(draft).rest, "Rest Off: no rest state.")
        draft.rest = F.countdown(startedSecondsAgo: 17, remaining: 73)
        let countdown = state(draft).rest
        XCTAssertEqual(countdown?.mode, .countdown)
        XCTAssertEqual(countdown?.endsAt, F.now.addingTimeInterval(73))
        draft.rest = F.rest(stopwatchSecondsAgo: 5)
        XCTAssertEqual(state(draft).rest?.mode, .stopwatch)
    }

    func testPhasesDisableCompleteSetAndDropRowsAndRest() {
        var draft = F.normalDraft()
        draft.rest = F.rest(stopwatchSecondsAgo: 10)

        draft.step = .review
        var mapped = state(draft)
        XCTAssertEqual(mapped.phase, .reviewing)
        XCTAssertNil(mapped.target)
        XCTAssertNil(mapped.rest)
        XCTAssertTrue(mapped.rows.isEmpty)
        XCTAssertFalse(mapped.canCompleteSet)

        draft.step = .workout
        mapped = state(draft, finishing: true)
        XCTAssertEqual(mapped.phase, .finishing, "A Finish in flight shows saving even before submissionState is set.")
        XCTAssertNil(mapped.target)

        draft.submissionState = .acceptedProcessing
        XCTAssertEqual(state(draft).phase, .finishing)

        draft.submissionState = nil
        draft.pausedAt = "2026-10-01T16:59:00Z"
        mapped = state(draft)
        XCTAssertEqual(mapped.phase, .paused)
        XCTAssertFalse(mapped.rows.isEmpty, "Paused Live Activity keeps the same authoritative set context.")
        XCTAssertNil(mapped.target)
        XCTAssertNil(mapped.rest, "ActivityKit timers must not animate while paused.")
        XCTAssertFalse(mapped.canCompleteSet)

        draft.pausedAt = nil
        draft.step = .complete
        XCTAssertEqual(state(draft).phase, .saved)
    }

    func testAllSetsCompleteHasNoTargetButKeepsTheLastCompletedRow() {
        let draft = F.session([F.exercise("a", "Bench", sets: [F.set("a1", 1, done: F.stamp(60)), F.set("a2", 2, done: F.stamp(10))])])
        let mapped = state(draft)
        XCTAssertEqual(mapped.phase, .allSetsComplete)
        XCTAssertNil(mapped.target)
        XCTAssertFalse(mapped.canCompleteSet)
        XCTAssertEqual(mapped.rows.map(\.role), [.completed])
        XCTAssertEqual(mapped.rows.map(\.isTarget), [false])
    }

    func testSavedStateFreezesElapsedAndClearsActions() {
        var draft = F.normalDraft()
        draft.rest = F.rest(stopwatchSecondsAgo: 10)
        let saved = state(draft).saved(completedAt: F.now)
        XCTAssertEqual(saved.phase, .saved)
        XCTAssertNil(saved.target)
        XCTAssertNil(saved.rest)
        XCTAssertTrue(saved.rows.isEmpty)
        XCTAssertEqual(saved.finishedAt, F.now)
        XCTAssertEqual(saved.completedSets, 2)
    }

    func testSignificantKeyIgnoresOnlyValueText() {
        let base = state(F.normalDraft())
        var typed = F.normalDraft()
        typed.exercises[0].sets[2].load = 90
        let edited = state(typed)
        XCTAssertNotEqual(base, edited)
        XCTAssertEqual(base.significantKey, edited.significantKey)
        var advanced = base
        advanced.revision += 1
        XCTAssertEqual(base.significantKey, advanced.significantKey, "A revision bump alone (typing) is not significant.")
        var completed = F.normalDraft()
        completed.exercises[0].sets[2].isCompleted = true
        completed.exercises[0].sets[2].completedAt = F.stamp(5)
        XCTAssertNotEqual(base.significantKey, state(completed).significantKey)
    }

    // MARK: Encoding, compatibility, payload

    func testAttributesAndStateRoundTrip() throws {
        var draft = F.normalDraft()
        draft.rest = F.countdown(startedSecondsAgo: 17, remaining: 73)
        let projection = F.projection(draft)
        let attributes = WorkoutActivityAttributes(projection: projection, authority: .founderProduction, startedAtFallback: F.now)
        let content = State(projection: projection)
        let decodedAttributes = try JSONDecoder().decode(WorkoutActivityAttributes.self, from: JSONEncoder().encode(attributes))
        let decodedContent = try JSONDecoder().decode(State.self, from: JSONEncoder().encode(content))
        XCTAssertEqual(decodedAttributes, attributes)
        XCTAssertEqual(decodedContent, content)
        XCTAssertEqual(attributes.authority, "founderProduction")
        XCTAssertEqual(attributes.schemaVersion, WorkoutActivityAttributes.currentSchemaVersion)
        XCTAssertEqual(attributes.sessionId, "session-1")
    }

    func testUnknownEnumValuesDecodeToSafeCasesAndExtraKeysAreIgnored() throws {
        let mapped = state(F.normalDraft())
        var json = String(decoding: try JSONEncoder().encode(mapped), as: UTF8.self)
        json = json.replacingOccurrences(of: "\"inProgress\"", with: "\"futurePhase\"")
            .replacingOccurrences(of: "\"previousAndCurrent\"", with: "\"futureLayout\"")
            .replacingOccurrences(of: "\"previous\"", with: "\"futureRole\"")
            .replacingOccurrences(of: "\"stopwatch\"", with: "\"futureMode\"")
        json = json.replacingOccurrences(of: "{\"schemaVersion\"", with: "{\"addedLater\":1,\"schemaVersion\"")
        let decoded = try JSONDecoder().decode(State.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.phase, .paused, "An unknown phase never offers Complete Set.")
        XCTAssertFalse(decoded.canCompleteSet)
        XCTAssertEqual(decoded.layout, .empty)
        XCTAssertEqual(decoded.rows.first?.role, .current)
        XCTAssertEqual(decoded.revision, mapped.revision)
    }

    func testWorstCasePayloadStaysUnderTheActivityKitLimit() throws {
        let long = String(repeating: "Incline Dumbbell Press ", count: 4)
        var draft = F.session([
            F.exercise(UUID().uuidString, long, sets: (1...6).map { F.set(UUID().uuidString, $0, done: $0 < 3 ? F.stamp(Double(600 - $0 * 10)) : nil) }),
            F.exercise(UUID().uuidString, long + "B", sets: (1...6).map { F.set(UUID().uuidString, $0) }),
        ])
        draft.relationships = [.init(id: UUID().uuidString, relationshipType: "superset", memberExerciseIds: draft.exercises.map(\.id))]
        draft.selectedAreaIds = (0..<12).map { "area-\($0)-yyyyyyyyyyyyyyyyyyyy" }
        draft.rest = .init(id: "rest|\(UUID().uuidString)|2026-10-01T16:59:50.000Z", mode: .countdown, startedAt: F.stamp(10),
                           endsAt: F.stamp(-80), durationSeconds: 90, sourceExerciseId: draft.exercises[0].id, sourceSetId: draft.exercises[0].sets[0].id)
        let projection = F.projection(draft)
        let attributes = WorkoutActivityAttributes(projection: projection, authority: .founderProduction, startedAtFallback: F.now)
        let size = try JSONEncoder().encode(attributes).count + JSONEncoder().encode(State(projection: projection)).count
        XCTAssertLessThanOrEqual(size, 3_072, "ActivityKit allows 4 KB of attributes + state (was \(size)).")
    }

    // MARK: Deep link

    func testDeepLinkConstructionRoundTripAndRejection() throws {
        let id = UUID().uuidString
        let url = try XCTUnwrap(WorkoutActivityDeepLink.url(sessionId: id))
        XCTAssertEqual(url.scheme, "physiqueos-workout")
        XCTAssertEqual(url.host, "open")
        XCTAssertEqual(WorkoutActivityDeepLink.sessionId(from: url), id)

        XCTAssertNil(WorkoutActivityDeepLink.url(sessionId: ""))
        XCTAssertNil(WorkoutActivityDeepLink.url(sessionId: "has space"))
        XCTAssertNil(WorkoutActivityDeepLink.url(sessionId: String(repeating: "a", count: 65)))
        for bad in ["https://open?session=\(id)", "physiqueos-workout://other?session=\(id)", "physiqueos-workout://open",
                    "physiqueos-workout://open?session=", "physiqueos-workout://open?session=../../x", "physiqueos-workout://open?session=a%20b"] {
            XCTAssertNil(WorkoutActivityDeepLink.sessionId(from: URL(string: bad)!), bad)
        }
    }

    func testInfoPlistRegistersTheSchemeAndLiveActivitySupport() throws {
        let info = Bundle.main.infoDictionary ?? [:]
        XCTAssertEqual(info["NSSupportsLiveActivities"] as? Bool, true)
        let schemes = (info["CFBundleURLTypes"] as? [[String: Any]])?.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] } ?? []
        XCTAssertTrue(schemes.contains(WorkoutActivityDeepLink.scheme))
    }

    func testTheExtensionIsEmbeddedAndSharesTheBuildNumber() throws {
        let plugIns = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let appex = plugIns.appendingPathComponent("PhysiqueOSLiveActivity.appex")
        let bundle = try XCTUnwrap(Bundle(url: appex))
        XCTAssertEqual(bundle.bundleIdentifier, "com.physiqueos.native.dev.WorkoutActivity")
        XCTAssertEqual(bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String, Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String)
        XCTAssertEqual(bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String, Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
        let point = (bundle.object(forInfoDictionaryKey: "NSExtension") as? [String: Any])?["NSExtensionPointIdentifier"] as? String
        XCTAssertEqual(point, "com.apple.widgetkit-extension")
    }
}
