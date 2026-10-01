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
        XCTAssertTrue(atFinal.isFinalSetOfUnit)
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
        XCTAssertFalse(advanced.isFinalSetOfUnit)
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

    // MARK: Superset round/unit semantics (Founder decision 4)

    /// One entry per step: the layout and rows the projection shows *before*
    /// completing its own current set, ending with the all-complete state.
    private func walk(_ draft: TrainingLoggerDraft, file: StaticString = #filePath, line: UInt = #line) throws -> [String] {
        var draft = draft
        var steps: [String] = []
        var tick = 600.0
        for _ in 0..<64 {
            let projection = try project(draft)
            XCTAssertLessThanOrEqual(projection.contextRows.count, 2, "Never more than two rows.", file: file, line: line)
            XCTAssertLessThanOrEqual(projection.contextRows.filter(\.isCompletionTarget).count, 1, file: file, line: line)
            let rows = projection.contextRows.map { "\($0.role.rawValue):\($0.set.setId)\($0.isCompletionTarget ? "*" : "")" }.joined(separator: " ")
            steps.append("\(projection.contextLayout.rawValue)\(projection.isFinalSetOfUnit ? "!" : "") [\(rows)]")
            guard let target = projection.currentSet else { return steps }
            let exerciseIndex = draft.exercises.firstIndex { $0.id == target.exerciseId }!
            let setIndex = draft.exercises[exerciseIndex].sets.firstIndex { $0.id == target.setId }!
            draft.exercises[exerciseIndex].sets[setIndex].isCompleted = true
            draft.exercises[exerciseIndex].sets[setIndex].completedAt = stamp(tick)
            tick -= 10
        }
        XCTFail("Walk did not terminate", file: file, line: line)
        return steps
    }

    private func superset(_ aSets: Int, _ bSets: Int, then tail: [TrainingLoggerDraftExercise] = [], before head: [TrainingLoggerDraftExercise] = []) -> TrainingLoggerDraft {
        let a = exercise("a", "Row", sets: (1...aSets).map { set("a\($0)", $0) })
        let b = exercise("b", "Curl", sets: (1...bSets).map { set("b\($0)", $0) })
        return session(head + [a, b] + tail, relationships: [.init(id: "ss", relationshipType: "superset", memberExerciseIds: ["a", "b"])])
    }

    private var ordinaryC: TrainingLoggerDraftExercise { exercise("c", "Press", sets: [set("c1", 1), set("c2", 2)]) }

    func testEqualSizeSupersetAlternatesAndOnlyFinishesWithTheLastRound() throws {
        let steps = try walk(superset(3, 3, then: [ordinaryC]))
        XCTAssertEqual(steps, [
            "currentOnly [current:a1*]",
            "previousAndCurrent [previous:a1 current:b1*]",
            "previousAndCurrent [previous:b1 current:a2*]",
            "previousAndCurrent [previous:a2 current:b2*]",
            "previousAndCurrent [previous:b2 current:a3*]",   // first member of the final round is NOT final
            "currentAndUpNext! [current:b3* upNext:c1]",       // the unit's last set
            "completedAndUpNext [completed:b3 upNext:c1*]",
            "previousAndCurrent! [previous:c1 current:c2*]",   // last unit: final set but no Up Next
            "completedOnly [completed:c2]",
        ])
    }

    func testSupersetMemberLabelsPartnersAndRoundIdentity() throws {
        var draft = superset(2, 2, then: [ordinaryC])
        var projection = try project(draft)
        XCTAssertEqual(projection.currentExercise?.supersetLabel, "A")
        XCTAssertEqual(projection.currentExercise?.supersetPartnerName, "Curl")
        draft.exercises[0].sets[0].isCompleted = true; draft.exercises[0].sets[0].completedAt = stamp(30)
        projection = try project(draft)
        XCTAssertEqual(projection.currentExercise?.supersetLabel, "B")
        XCTAssertEqual(projection.currentExercise?.supersetPartnerName, "Row")
        XCTAssertEqual(projection.currentSet?.setNumber, 1, "B1 is round 1.")
        XCTAssertEqual(projection.previousExercise?.supersetLabel, "A")
        XCTAssertNil(try project(session([exercise("c", "Press", sets: [set("c1", 1)])])).currentExercise?.supersetLabel)
    }

    func testUnequalSupersetWithShortFirstMemberDoesNotShowCompletedMidRound() throws {
        let steps = try walk(superset(1, 3, then: [ordinaryC]))
        XCTAssertEqual(steps, [
            "currentOnly [current:a1*]",
            "previousAndCurrent [previous:a1 current:b1*]",    // A is exhausted but the unit is not: no Completed + Up Next
            "previousAndCurrent [previous:b1 current:b2*]",
            "currentAndUpNext! [current:b3* upNext:c1]",
            "completedAndUpNext [completed:b3 upNext:c1*]",
            "previousAndCurrent! [previous:c1 current:c2*]",
            "completedOnly [completed:c2]",
        ])
    }

    func testUnequalSupersetWithShortSecondMemberFinishesOnTheLongMembersLastSet() throws {
        let steps = try walk(superset(3, 1, then: [ordinaryC]))
        XCTAssertEqual(Array(steps.prefix(5)), [
            "currentOnly [current:a1*]",
            "previousAndCurrent [previous:a1 current:b1*]",
            "previousAndCurrent [previous:b1 current:a2*]",    // B is exhausted but the unit is mid-way
            "currentAndUpNext! [current:a3* upNext:c1]",
            "completedAndUpNext [completed:a3 upNext:c1*]",
        ])
    }

    func testSingleSetSupersetMembers() throws {
        let steps = try walk(superset(1, 1, then: [ordinaryC]))
        XCTAssertEqual(Array(steps.prefix(3)), [
            "currentOnly [current:a1*]",
            "currentAndUpNext! [current:b1* upNext:c1]",       // B1 is the unit's last set
            "completedAndUpNext [completed:b1 upNext:c1*]",
        ])
    }

    func testSupersetAsTheLastUnitHasNoUpNextAndEndsCompletedOnly() throws {
        XCTAssertEqual(try walk(superset(2, 2)), [
            "currentOnly [current:a1*]",
            "previousAndCurrent [previous:a1 current:b1*]",
            "previousAndCurrent [previous:b1 current:a2*]",
            "previousAndCurrent! [previous:a2 current:b2*]",
            "completedOnly [completed:b2]",
        ])
    }

    func testEnteringASupersetFromAnOrdinaryExerciseAndBackToBackSupersets() throws {
        let head = exercise("h", "Squat", sets: [set("h1", 1)])
        XCTAssertEqual(Array(try walk(superset(1, 2, then: [ordinaryC], before: [head])).prefix(4)), [
            "currentAndUpNext! [current:h1* upNext:a1]",
            "completedAndUpNext [completed:h1 upNext:a1*]",    // single-set ordinary exercise: straight to Completed + Up Next
            "previousAndCurrent [previous:a1 current:b1*]",
            "currentAndUpNext! [current:b2* upNext:c1]",
        ])

        var twoSupersets = superset(1, 1)
        twoSupersets.exercises += [exercise("x", "X", sets: [set("x1", 1)]), exercise("y", "Y", sets: [set("y1", 1)])]
        twoSupersets.relationships.append(.init(id: "ss2", relationshipType: "superset", memberExerciseIds: ["x", "y"]))
        XCTAssertEqual(try walk(twoSupersets), [
            "currentOnly [current:a1*]",
            "currentAndUpNext! [current:b1* upNext:x1]",
            "completedAndUpNext [completed:b1 upNext:x1*]",
            "previousAndCurrent! [previous:x1 current:y1*]",
            "completedOnly [completed:y1]",
        ])
    }

    func testSupersetOutOfOrderCompletionStillFollowsTheLowestRound() throws {
        var draft = superset(3, 3, then: [ordinaryC])
        for offset in 0..<2 {
            draft.exercises[0].sets[offset].isCompleted = true
            draft.exercises[0].sets[offset].completedAt = stamp(Double(60 - offset * 10))
        }
        let projection = try project(draft)
        XCTAssertEqual(projection.currentSet?.setId, "b1", "The partner's lowest incomplete round comes first, not a3.")
        XCTAssertEqual(projection.previousSet?.setId, "a2")
        XCTAssertEqual(projection.contextLayout, .previousAndCurrent)
    }

    func testSupersetRedactionRemovesMemberLabelsAndPartnerNames() throws {
        let redacted = try project(superset(2, 2, then: [ordinaryC])).redacted()
        let encoded = String(decoding: try JSONEncoder().encode(redacted), as: UTF8.self)
        XCTAssertFalse(encoded.contains("Curl"))
        XCTAssertFalse(encoded.contains("Row"))
        XCTAssertNil(redacted.currentExercise?.supersetLabel)
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
        XCTAssertFalse(projection.isFinalSetOfUnit)
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
        XCTAssertFalse(encoded.contains("Fly"))
    }

    func testPayloadStaysSmallAndCarriesNoHistory() throws {
        let longName = String(repeating: "Incline Dumbbell Press ", count: 4)
        let exercises = (0..<40).map { index in
            let uuid = UUID().uuidString
            var item = exercise(uuid, "\(longName)\(index)", sets: (1...6).map { set(UUID().uuidString, $0, done: $0 < 3 ? stamp(Double(1000 - index)) : nil) })
            item.previousPerformance = .init(workoutDate: "2026-09-01", sets: [], contextLabel: String(repeating: "x", count: 500))
            return item
        }
        var draft = session(exercises)
        draft.selectedAreaIds = (0..<12).map { "area-\($0)-\(String(repeating: "y", count: 20))" }
        draft.rest = .init(id: "rest|\(UUID().uuidString)|2026-10-01T16:59:50.000Z", mode: .countdown, startedAt: stamp(10), endsAt: stamp(-80), durationSeconds: 90,
                           sourceExerciseId: exercises[0].id, sourceSetId: exercises[0].sets[0].id)
        let projection = try project(draft)
        let size = try JSONEncoder().encode(projection).count
        XCTAssertLessThanOrEqual(size, 3_072, "ActivityKit allows 4 KB for attributes + state; UUID ids and max-length names must stay under it (was \(size)).")
        XCTAssertLessThanOrEqual(projection.sessionLabel.count, TrainingSessionLiveProjection.labelLimit)
        XCTAssertLessThanOrEqual(projection.currentExercise?.name.count ?? 0, TrainingSessionLiveProjection.nameLimit)
    }

    func testProjectionDecodesUnknownPhaseSafely() throws {
        let projection = try project(session([exercise("bench", "Bench", sets: [set("b1", 1)])]))
        var json = String(decoding: try JSONEncoder().encode(projection), as: UTF8.self)
        json = json.replacingOccurrences(of: #""phase":"inProgress""#, with: #""phase":"someFutureCase""#)
        XCTAssertEqual(try JSONDecoder().decode(TrainingSessionLiveProjection.self, from: Data(json.utf8)).phase, .paused,
                       "An unknown future phase never exposes Complete Set.")
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
        XCTAssertTrue(after.isFinalSetOfUnit)
        XCTAssertEqual(after.upNextExercise?.name, "Fly")
        XCTAssertEqual(after.rest?.mode, .countdown)
        XCTAssertEqual(after.rest?.endsAt, now.addingTimeInterval(120))
        XCTAssertEqual(after.revision, 8)
    }
}
