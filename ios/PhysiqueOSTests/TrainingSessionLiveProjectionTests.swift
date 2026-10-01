import XCTest
@testable import PhysiqueOS

/// The pure future-Live-Activity projection: previous + current set,
/// final-set -> Up Next, supersets, measurement kinds, rest clocks, phases,
/// redaction and payload size. No ActivityKit is involved.
final class TrainingSessionLiveProjectionTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-10-01T17:00:00Z")!

    private func stamp(_ secondsAgo: TimeInterval) -> String {
        TrainingSessionClock.string(from: now.addingTimeInterval(-secondsAgo))
    }

    private func set(_ id: String, _ number: Int, reps: Double? = 8, load: Double? = 185, duration: Double? = nil,
                     loadType: String? = nil, done: String? = nil) -> TrainingLoggerDraftSet {
        TrainingLoggerDraftSet(id: id, setNumber: number, reps: reps, load: load, loadType: loadType,
                               durationSeconds: duration, isCompleted: done != nil, completedAt: done)
    }

    private func exercise(_ id: String, _ name: String, measurement: TrainingLoggerMeasurement = .repsLoad,
                          defaultLoadType: String? = nil, sets: [TrainingLoggerDraftSet]) -> TrainingLoggerDraftExercise {
        TrainingLoggerDraftExercise(
            id: id, canonicalExerciseId: id, name: name, areaId: "chest", measurement: measurement,
            defaultLoadType: defaultLoadType, executionVariant: nil, sets: sets, previousPerformance: nil,
            progressionRecommendation: nil, progressionChoice: nil, isProvisional: false, provenance: nil
        )
    }

    private func session(_ exercises: [TrainingLoggerDraftExercise], relationships: [TrainingLoggerDraftRelationship] = [],
                         step: TrainingLoggerStep = .workout) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-10-01", startedAt: "2026-10-01T16:20:00Z")
        draft.id = "session-1"
        draft.selectedAreaIds = ["chest", "triceps"]
        draft.exercises = exercises
        draft.relationships = relationships
        draft.step = step
        draft.revision = 7
        return draft
    }

    private func project(_ draft: TrainingLoggerDraft) throws -> TrainingSessionLiveProjection {
        try XCTUnwrap(TrainingSessionLiveProjection.make(from: draft, areaLabels: ["chest": "Chest", "triceps": "Triceps"], now: now))
    }

    func testRepsLoadPreviousAndCurrentSet() throws {
        let draft = session([
            exercise("bench", "Bench Press", sets: [set("b1", 1, done: stamp(200)), set("b2", 2, reps: 6, load: 195, done: stamp(100)), set("b3", 3, reps: 6, load: 195)]),
            exercise("dips", "Dips", measurement: .bodyweightReps, defaultLoadType: "bodyweight", sets: [set("d1", 1, reps: 12, load: nil)]),
        ])
        let projection = try project(draft)
        XCTAssertEqual(projection.sessionId, "session-1")
        XCTAssertEqual(projection.revision, 7)
        XCTAssertEqual(projection.sessionLabel, "Chest · Triceps")
        XCTAssertEqual(projection.startedAt, ISO8601DateFormatter().date(from: "2026-10-01T16:20:00Z"))
        XCTAssertEqual(projection.phase, .inProgress)
        XCTAssertEqual(projection.previousSet?.setId, "b2")
        XCTAssertEqual(projection.previousSet?.valueText, "195 lb × 6")
        XCTAssertEqual(projection.currentExercise?.name, "Bench Press")
        XCTAssertEqual(projection.currentSet?.setId, "b3")
        XCTAssertEqual(projection.currentSet?.setNumber, 3)
        XCTAssertEqual(projection.currentSet?.setCount, 3)
        XCTAssertEqual(projection.progress, .init(completedSets: 2, totalSets: 4, completedExercises: 0, totalExercises: 2))
        XCTAssertFalse(projection.isWorkoutComplete)
    }

    func testFinalSetExposesUpNextExerciseAndCompletionAdvancesContext() throws {
        var draft = session([
            exercise("bench", "Bench Press", sets: [set("b1", 1, done: stamp(200)), set("b2", 2)]),
            exercise("dips", "Dips", measurement: .bodyweightReps, defaultLoadType: "bodyweight", sets: [set("d1", 1, reps: 12, load: nil), set("d2", 2, reps: 10, load: 25)]),
        ])
        let atFinal = try project(draft)
        XCTAssertTrue(atFinal.isFinalSetOfExercise)
        XCTAssertEqual(atFinal.currentSet?.setId, "b2")
        XCTAssertEqual(atFinal.upNextExercise?.name, "Dips")
        XCTAssertEqual(atFinal.upNextSet?.setId, "d1")
        XCTAssertEqual(atFinal.upNextSet?.valueText, "BW × 12")

        draft.exercises[0].sets[1].isCompleted = true
        draft.exercises[0].sets[1].completedAt = stamp(1)
        let advanced = try project(draft)
        XCTAssertEqual(advanced.previousSet?.setId, "b2")
        XCTAssertEqual(advanced.currentExercise?.name, "Dips")
        XCTAssertEqual(advanced.currentSet?.setId, "d1")
        XCTAssertFalse(advanced.isFinalSetOfExercise)
        XCTAssertEqual(advanced.upNextSet?.setId, "d2")
        XCTAssertNil(advanced.upNextExercise, "Up Next stays in the same exercise.")
        XCTAssertEqual(advanced.upNextSet?.valueText, "BW + 25 lb × 10")
        XCTAssertEqual(advanced.progress.completedExercises, 1)
    }

    func testTwoRowRuleAcrossTheFinalSetTransition() throws {
        func rows(_ projection: TrainingSessionLiveProjection) -> [String] {
            projection.contextRows.map { "\($0.role.rawValue):\($0.set.setId)\($0.isCompletionTarget ? "*" : "")" }
        }
        var draft = session([
            exercise("bench", "Bench", sets: [set("b1", 1), set("b2", 2), set("b3", 3)]),
            exercise("fly", "Fly", sets: [set("f1", 1), set("f2", 2)]),
        ])
        var projection = try project(draft)
        XCTAssertEqual(projection.contextLayout, .currentOnly)
        XCTAssertEqual(rows(projection), ["current:b1*"])

        draft.exercises[0].sets[0].isCompleted = true; draft.exercises[0].sets[0].completedAt = stamp(60)
        projection = try project(draft)
        XCTAssertEqual(projection.contextLayout, .previousAndCurrent)
        XCTAssertEqual(rows(projection), ["previous:b1", "current:b2*"])

        draft.exercises[0].sets[1].isCompleted = true; draft.exercises[0].sets[1].completedAt = stamp(30)
        projection = try project(draft)
        XCTAssertEqual(projection.contextLayout, .currentAndUpNext, "Final set: Previous drops away.")
        XCTAssertEqual(rows(projection), ["current:b3*", "upNext:f1"])
        XCTAssertEqual(projection.contextRows.last?.exercise?.name, "Fly")

        draft.exercises[0].sets[2].isCompleted = true; draft.exercises[0].sets[2].completedAt = stamp(5)
        projection = try project(draft)
        XCTAssertEqual(projection.contextLayout, .completedAndUpNext)
        XCTAssertEqual(rows(projection), ["completed:b3", "upNext:f1*"], "Up Next is now what Complete Set completes.")
        XCTAssertEqual(projection.contextRows.first?.exercise?.name, "Bench")

        draft.exercises[1].sets[0].isCompleted = true; draft.exercises[1].sets[0].completedAt = stamp(1)
        projection = try project(draft)
        XCTAssertEqual(projection.contextLayout, .previousAndCurrent)
        XCTAssertEqual(rows(projection), ["previous:f1", "current:f2*"], "Last set of the workout has no Up Next, so back to Previous + Current.")

        draft.exercises[1].sets[1].isCompleted = true; draft.exercises[1].sets[1].completedAt = stamp(0)
        projection = try project(draft)
        XCTAssertEqual(projection.contextLayout, .completedOnly)
        XCTAssertEqual(rows(projection), ["completed:f2"])
    }

    func testSupersetNeverShowsThreeRows() throws {
        let row = exercise("row", "Row", sets: [set("r1", 1, done: stamp(40)), set("r2", 2)])
        let curl = exercise("curl", "Curl", sets: [set("c1", 1, done: stamp(20)), set("c2", 2)])
        let draft = session([row, curl], relationships: [.init(id: "ss", relationshipType: "superset", memberExerciseIds: ["row", "curl"])])
        let projection = try project(draft)
        XCTAssertLessThanOrEqual(projection.contextRows.count, 2)
        XCTAssertEqual(projection.contextRows.map(\.set.setId), ["r2", "c2"], "Row's final set: Current + Up Next (partner).")
        XCTAssertEqual(projection.contextLayout, .currentAndUpNext)
    }

    func testTimedSets() throws {
        let draft = session([exercise("plank", "Plank", measurement: .duration, sets: [
            set("p1", 1, reps: nil, load: nil, duration: 45, done: stamp(60)), set("p2", 2, reps: nil, load: nil, duration: 60),
        ])])
        let projection = try project(draft)
        XCTAssertEqual(projection.previousSet?.valueText, "45 s")
        XCTAssertEqual(projection.currentSet?.valueText, "60 s")
        XCTAssertEqual(projection.currentExercise?.measurement, .duration)
    }

    func testSupersetAlternatesMembersAndNamesPartner() throws {
        let row = exercise("row", "Cable Row", sets: [set("r1", 1), set("r2", 2)])
        let curl = exercise("curl", "Curl", sets: [set("c1", 1), set("c2", 2)])
        let press = exercise("press", "Press", sets: [set("x1", 1)])
        var draft = session([row, press, curl], relationships: [.init(id: "ss", relationshipType: "superset", memberExerciseIds: ["row", "curl"])])

        var projection = try project(draft)
        XCTAssertEqual(projection.currentSet?.setId, "r1", "A superset is one unit at its first member's position.")
        XCTAssertEqual(projection.currentExercise?.supersetPartnerName, "Curl")
        XCTAssertEqual(projection.upNextSet?.setId, "c1", "After row set 1 comes curl set 1, not the next row set.")

        draft.exercises[0].sets[0].isCompleted = true; draft.exercises[0].sets[0].completedAt = stamp(30)
        projection = try project(draft)
        XCTAssertEqual(projection.currentSet?.setId, "c1")
        XCTAssertEqual(projection.upNextSet?.setId, "r2")

        draft.exercises[2].sets[0].isCompleted = true; draft.exercises[2].sets[0].completedAt = stamp(10)
        projection = try project(draft)
        XCTAssertEqual(projection.currentSet?.setId, "r2")
        XCTAssertEqual(projection.previousSet?.setId, "c1")
    }

    func testFollowsTheFounderAfterOutOfOrderCompletion() throws {
        var draft = session([
            exercise("a", "A", sets: [set("a1", 1), set("a2", 2)]),
            exercise("b", "B", sets: [set("b1", 1), set("b2", 2)]),
            exercise("c", "C", sets: [set("c1", 1, done: stamp(5)), set("c2", 2)]),
        ])
        var projection = try project(draft)
        XCTAssertEqual(projection.currentSet?.setId, "c2", "The cursor follows the most recent completion, not list order.")
        XCTAssertEqual(projection.upNextExercise?.name, "A", "After the last unit it wraps to earlier unfinished work.")

        draft.exercises[2].sets[0].completedAt = nil // older draft without timestamps
        projection = try project(draft)
        XCTAssertEqual(projection.currentSet?.setId, "a1", "Without timestamps the first unfinished exercise is current.")
        XCTAssertNil(projection.previousSet, "Nothing before the current set in list order is complete.")
    }

    func testWorkoutComplete() throws {
        let draft = session([exercise("bench", "Bench", sets: [set("b1", 1, done: stamp(100)), set("b2", 2, done: stamp(5))])])
        let projection = try project(draft)
        XCTAssertTrue(projection.isWorkoutComplete)
        XCTAssertNil(projection.currentSet)
        XCTAssertNil(projection.upNextSet)
        XCTAssertFalse(projection.isFinalSetOfExercise)
        XCTAssertEqual(projection.previousSet?.setId, "b2")
    }

    func testRestStopwatchCountdownAndOff() throws {
        var draft = session([exercise("bench", "Bench", sets: [set("b1", 1, done: stamp(30)), set("b2", 2)])])
        XCTAssertNil(try project(draft).rest, "Off: no rest state, nothing to render.")

        draft.rest = .init(id: "r", mode: .stopwatch, startedAt: stamp(30), endsAt: nil, durationSeconds: nil, sourceExerciseId: "bench", sourceSetId: "b1")
        var rest = try XCTUnwrap(try project(draft).rest)
        XCTAssertEqual(rest.mode, .stopwatch)
        XCTAssertEqual(now.timeIntervalSince(rest.startedAt), 30, accuracy: 0.001)
        XCTAssertNil(rest.endsAt)

        draft.rest = .init(id: "r", mode: .countdown, startedAt: stamp(30), endsAt: stamp(-60), durationSeconds: 90, sourceExerciseId: "bench", sourceSetId: "b1")
        rest = try XCTUnwrap(try project(draft).rest)
        XCTAssertEqual(rest.endsAt!.timeIntervalSince(now), 60, accuracy: 0.001)
        XCTAssertFalse(rest.isExpired)

        draft.rest?.endsAt = stamp(1)
        XCTAssertEqual(try project(draft).rest?.isExpired, true)
        XCTAssertEqual(try project(draft).currentSet?.setId, "b2", "Expiry does not advance the workout.")

        draft.step = .summary
        XCTAssertNil(try project(draft).rest, "Rest renders only during set entry.")
    }

    func testPhasesAndEligibility() throws {
        var draft = session([exercise("bench", "Bench", sets: [set("b1", 1)])], step: .areas)
        XCTAssertEqual(try project(draft).phase, .planning)
        draft.step = .workout; draft.beginAddingExercises()
        XCTAssertEqual(try project(draft).phase, .inProgress)
        draft.finishExerciseSelection(); draft.step = .review
        XCTAssertEqual(try project(draft).phase, .reviewing)
        draft.submissionState = .acceptedProcessing
        XCTAssertEqual(try project(draft).phase, .finishing)
        draft.submissionState = nil; draft.leftAt = "2026-10-01T16:59:00Z"
        XCTAssertEqual(try project(draft).phase, .paused)
        draft.step = .complete
        XCTAssertEqual(try project(draft).phase, .complete)
        draft.mode = .past
        XCTAssertNil(TrainingSessionLiveProjection.make(from: draft, now: now), "Retrospective entries have no live session.")
    }

    func testRedactionRemovesNamesValuesAndAreas() throws {
        let draft = session([exercise("bench", "Bench Press", sets: [set("b1", 1, done: stamp(20)), set("b2", 2)]),
                             exercise("fly", "Fly", sets: [set("f1", 1)])])
        let redacted = try project(draft).redacted()
        XCTAssertEqual(redacted.sessionLabel, "Workout")
        XCTAssertEqual(redacted.currentExercise?.name, "Exercise")
        XCTAssertNil(redacted.currentSet?.valueText)
        XCTAssertNil(redacted.previousSet?.load)
        XCTAssertEqual(redacted.currentSet?.setId, "b2", "Identity for Complete Set survives redaction.")
        let encoded = String(decoding: try JSONEncoder().encode(redacted), as: UTF8.self)
        XCTAssertFalse(encoded.contains("Bench"))
        XCTAssertFalse(encoded.contains("Chest"))
    }

    func testPayloadStaysSmallAndCarriesNoHistory() throws {
        let longName = String(repeating: "Incline Dumbbell Press ", count: 4)
        let exercises = (0..<40).map { index in
            var item = exercise("exercise-\(index)", "\(longName)\(index)", sets: (1...6).map { set("s\(index)-\($0)", $0, done: $0 < 3 ? stamp(Double(1000 - index)) : nil) })
            item.previousPerformance = .init(workoutDate: "2026-09-01", sets: [], contextLabel: String(repeating: "x", count: 500))
            return item
        }
        var draft = session(exercises)
        draft.selectedAreaIds = (0..<12).map { "area-\($0)-\(String(repeating: "y", count: 20))" }
        draft.rest = .init(id: "rest|s0-1|x", mode: .countdown, startedAt: stamp(10), endsAt: stamp(-80), durationSeconds: 90, sourceExerciseId: "exercise-0", sourceSetId: "s0-1")
        let projection = try project(draft)
        let size = try JSONEncoder().encode(projection).count
        XCTAssertLessThanOrEqual(size, 2_048, "ActivityKit allows 4 KB for attributes + state; keep ≥2× headroom (was \(size)).")
        XCTAssertLessThanOrEqual(projection.sessionLabel.count, TrainingSessionLiveProjection.labelLimit)
        XCTAssertLessThanOrEqual(projection.currentExercise?.name.count ?? 0, TrainingSessionLiveProjection.nameLimit)
    }

    func testProjectionDecodesUnknownPhaseSafely() throws {
        let projection = try project(session([exercise("bench", "Bench", sets: [set("b1", 1)])]))
        var json = String(decoding: try JSONEncoder().encode(projection), as: UTF8.self)
        json = json.replacingOccurrences(of: #""phase":"inProgress""#, with: #""phase":"someFutureCase""#)
        XCTAssertEqual(try JSONDecoder().decode(TrainingSessionLiveProjection.self, from: Data(json.utf8)).phase, .inProgress)
    }

    @MainActor
    func testProjectionOfAuthorityStateMatchesAfterIntentCompletion() throws {
        let draft = session([exercise("bench", "Bench", sets: [set("b1", 1), set("b2", 2)]), exercise("fly", "Fly", sets: [set("f1", 1)])])
        let authority = TrainingSessionAuthority(
            store: MemoryTrainingLoggerDraftStore(drafts: [draft]), environment: .sandbox,
            restPreferences: FixedTrainingRestPreferences(.countdown(seconds: 120)), now: { [now] in now }
        )
        let before = try project(try XCTUnwrap(authority.draft(id: "session-1")))
        let target = try XCTUnwrap(before.currentSet)
        XCTAssertEqual(authority.completeSet(sessionId: before.sessionId, exerciseId: target.exerciseId, setId: target.setId,
                                             context: .intent(mutationId: "la", expectedRevision: before.revision)), .applied(revision: 8))
        let after = try project(try XCTUnwrap(authority.draft(id: "session-1")))
        XCTAssertEqual(after.previousSet?.setId, "b1")
        XCTAssertEqual(after.currentSet?.setId, "b2")
        XCTAssertTrue(after.isFinalSetOfExercise)
        XCTAssertEqual(after.upNextExercise?.name, "Fly")
        XCTAssertEqual(after.rest?.mode, .countdown)
        XCTAssertEqual(after.rest?.endsAt, now.addingTimeInterval(120))
        XCTAssertEqual(after.revision, 8)
    }
}
