import XCTest
@testable import PhysiqueOS

/// Build 47: set-level load semantics follow the Server's read-time classifier
/// (`trainingSetLoadSemantics.js`). A weighted bodyweight set is never
/// "bodyweight"; an unweighted bodyweight set never becomes `external_load 0 lb`;
/// historical null/BW and numeric-zero bodyweight read the same; stored history
/// is never mutated; Previous consumes the repaired chronology.
final class TrainingLoadSemanticsTests: XCTestCase {
    private typealias Semantics = TrainingSetLoadSemantics
    private let bodyweightDefault = "bodyweight"

    // MARK: Classifier parity with the Server vectors

    func testClassifierMatchesServerVectors() {
        // Pull-Ups with no load are bodyweight; with added load are weighted bodyweight.
        XCTAssertEqual(Semantics.classify(weight: nil, weightUnit: "bodyweight", loadType: "bodyweight", defaultLoadType: bodyweightDefault), .bodyweight)
        XCTAssertEqual(Semantics.classify(weight: 25, weightUnit: "lb", loadType: "external_load", setType: "weighted_reps", defaultLoadType: bodyweightDefault), .weightedBodyweight)
        // Every historical bodyweight encoding reads the same.
        let encodings: [(Double?, String?, String?, String?)] = [
            (nil, "bodyweight", "bodyweight", "bodyweight_reps"), (nil, "bodyweight", nil, nil),
            (0, "bodyweight", "bodyweight", "bodyweight_reps"), (nil, nil, "bodyweight", "bodyweight_reps"),
            (0, "lb", "external_load", "weighted_reps"), (nil, nil, nil, nil),
        ]
        for (weight, unit, loadType, setType) in encodings {
            XCTAssertEqual(Semantics.classify(weight: weight, weightUnit: unit, loadType: loadType, setType: setType, defaultLoadType: bodyweightDefault), .bodyweight, "\(String(describing: (weight, unit, loadType, setType)))")
            XCTAssertEqual(Semantics.classify(weight: weight, weightUnit: unit, loadType: loadType, setType: setType, defaultLoadType: bodyweightDefault).comparisonLoad(weight: weight), 0)
        }
        // A machine or free-weight zero is never bodyweight; a missing load is unknown.
        XCTAssertEqual(Semantics.classify(weight: 0, weightUnit: "lb", loadType: "external_load", defaultLoadType: nil), .externalLoad)
        XCTAssertEqual(Semantics.classify(weight: 180, weightUnit: "lb", loadType: "external_load", defaultLoadType: nil).comparisonLoad(weight: 180), 180)
        XCTAssertEqual(Semantics.classify(weight: nil, defaultLoadType: nil), .unknown)
        XCTAssertNil(Semantics.unknown.comparisonLoad(weight: nil))
        XCTAssertEqual(Semantics.classify(weight: -5, defaultLoadType: bodyweightDefault), .unknown)
        XCTAssertEqual(Semantics.classify(weight: 25, weightUnit: "bodyweight", loadType: "bodyweight", defaultLoadType: bodyweightDefault), .unknown)
        // An explicit bodyweight marker is honoured on a non-bodyweight-default exercise.
        XCTAssertEqual(Semantics.classify(weight: nil, weightUnit: "bodyweight", loadType: "bodyweight", defaultLoadType: nil), .bodyweight)
    }

    // MARK: Weighted Pull-Ups

    func testWeightedPullUpIsNotLabelledBodyweightRepBest() {
        var workout = draft(date: "2026-09-20")
        workout.addExercise(pullUps(history: [
            record("2026-08-30", [set(1, reps: 10, weight: nil, unit: "bodyweight", loadType: "bodyweight")]),
            record("2026-09-13", [set(1, reps: 6, weight: 25, unit: "lb", loadType: "external_load")]),
        ]))
        XCTAssertEqual(workout.exercises[0].previousPerformance?.workoutDate, "2026-09-13")
        workout.exercises[0].sets = [.init(id: "s1", setNumber: 1, reps: 7, load: 25, loadType: "external_load", durationSeconds: nil, isCompleted: true)]
        let lines = workout.performanceAchievementLines
        XCTAssertEqual(lines, ["Pull-Ups · better reps at matched load"])
        XCTAssertFalse(lines.joined().contains("bodyweight rep best"))
    }

    func testWeightedPullUpNeverComparesAgainstAnUnloadedBodyweightBest() {
        var workout = draft(date: "2026-09-20")
        workout.addExercise(pullUps(history: [record("2026-09-13", [set(1, reps: 10, weight: nil, unit: "bodyweight", loadType: "bodyweight")])]))
        workout.exercises[0].sets = [.init(id: "s1", setNumber: 1, reps: 7, load: 25, loadType: "external_load", durationSeconds: nil, isCompleted: true)]
        XCTAssertTrue(workout.performanceAchievementLines.isEmpty, "7 reps at +25 lb has no matched prior load, so it is not a rep best")
    }

    func testUnweightedBodyweightRepBestStillDetectsAcrossNullAndZeroHistory() {
        var workout = draft(date: "2026-09-20")
        workout.addExercise(pullUps(history: [record("2026-09-13", [set(1, reps: 8, weight: 0, unit: "lb", loadType: "external_load")])]))
        workout.exercises[0].sets = [.init(id: "s1", setNumber: 1, reps: 9, load: nil, loadType: "bodyweight", durationSeconds: nil, isCompleted: true)]
        XCTAssertEqual(workout.performanceAchievementLines, ["Pull-Ups · bodyweight rep best"])
    }

    func testAddedLoadTypedOverAPrepopulatedBodyweightSetIsWeightedNotUnknown() {
        var workout = draft(date: "2026-09-20")
        workout.addExercise(pullUps(history: [record("2026-09-13", [
            set(1, reps: 6, weight: 25, unit: "lb", loadType: "external_load"),
            set(2, reps: 8, weight: nil, unit: "bodyweight", loadType: "bodyweight", setType: "bodyweight_reps"),
        ])]))
        // Second prepopulated set is bodyweight; the user then types 25 lb over it
        // without the marker being reset (the real UI flow).
        XCTAssertEqual(workout.exercises[0].sets[1].loadType, "bodyweight")
        workout.exercises[0].sets[1].load = 25
        workout.exercises[0].sets[1].reps = 7
        workout.exercises[0].sets[1].isCompleted = true
        XCTAssertEqual(workout.exercises[0].sets[1].loadSemantics(defaultLoadType: bodyweightDefault), .weightedBodyweight)
        XCTAssertEqual(workout.exercises[0].sets[1].writeRepresentation(defaultLoadType: bodyweightDefault).loadType, "external_load")
        XCTAssertEqual(workout.performanceAchievementLines, ["Pull-Ups · better reps at matched load"])
    }

    func testMachineRepsAtMatchedLoadStillWorks() {
        let row = TrainingLoggerCatalogExercise(
            canonicalExerciseId: "seated_cable_row", name: "Seated Cable Rows", areaId: "back", equipment: "cable",
            measurement: .repsLoad, defaultLoadType: nil, previouslyPerformed: true,
            history: [record("2026-09-13", [set(1, reps: 12, weight: 110, unit: "lb", loadType: "external_load")])],
            progressionRecommendation: nil
        )
        var workout = draft(date: "2026-09-20")
        workout.addExercise(row)
        workout.exercises[0].sets = [.init(id: "s1", setNumber: 1, reps: 13, load: 110, loadType: "external_load", durationSeconds: nil, isCompleted: true)]
        XCTAssertEqual(workout.performanceAchievementLines, ["Seated Cable Rows · better reps at matched load"])
    }

    // MARK: Unweighted bodyweight serialization

    func testUnweightedBodyweightSetsSerializeAsBodyweightWithNoLoad() {
        for load in [nil, 0.0] as [Double?] {
            for loadType in [nil, "bodyweight", "external_load"] as [String?] {
                let set = TrainingLoggerDraftSet(id: "s", setNumber: 1, reps: 8, load: load, loadType: loadType, durationSeconds: nil, isCompleted: true)
                let write = set.writeRepresentation(defaultLoadType: bodyweightDefault)
                XCTAssertNil(write.load, "load=\(String(describing: load)) type=\(String(describing: loadType))")
                XCTAssertEqual(write.loadType, "bodyweight")
                XCTAssertEqual(write.unit, "bodyweight")
            }
        }
    }

    func testWeightedBodyweightAndMachineLoadsSerializeAsExternalLoad() {
        let weighted = TrainingLoggerDraftSet(id: "s", setNumber: 1, reps: 7, load: 25, loadType: "external_load", durationSeconds: nil, isCompleted: true)
        XCTAssertEqual(weighted.writeRepresentation(defaultLoadType: bodyweightDefault).loadType, "external_load")
        XCTAssertEqual(weighted.writeRepresentation(defaultLoadType: bodyweightDefault).load, 25)
        XCTAssertEqual(weighted.writeRepresentation(defaultLoadType: bodyweightDefault).unit, "lb")
        // A machine set at 0 is a genuine external zero, never coerced to bodyweight.
        let machineZero = TrainingLoggerDraftSet(id: "m", setNumber: 1, reps: 12, load: 0, loadType: "external_load", durationSeconds: nil, isCompleted: true)
        let write = machineZero.writeRepresentation(defaultLoadType: nil)
        XCTAssertEqual(write.loadType, "external_load")
        XCTAssertEqual(write.load, 0)
    }

    func testHistoricalZeroBodyweightIsNotPrepopulatedAsZeroExternalLoad() {
        var workout = draft(date: "2026-09-20")
        workout.addExercise(hangingLegRaises(history: [
            record("2026-09-13", [set(1, reps: 18, weight: 0, unit: "lb", loadType: "external_load", setType: "weighted_reps")]),
        ]))
        let prepopulated = workout.exercises[0].sets[0]
        XCTAssertNil(prepopulated.load)
        XCTAssertEqual(prepopulated.loadType, "bodyweight")
        XCTAssertEqual(prepopulated.writeRepresentation(defaultLoadType: bodyweightDefault).loadType, "bodyweight")
        // Keeping the previous performance follows the same normalization.
        workout.exercises[0].sets[0].load = 5
        workout.keepPreviousPerformance(for: workout.exercises[0].id)
        XCTAssertNil(workout.exercises[0].sets[0].load)
        XCTAssertEqual(workout.exercises[0].sets[0].loadType, "bodyweight")
    }

    func testProgressionSuggestionOfZeroExternalLoadOnBodyweightExerciseBecomesBodyweight() {
        var pull = pullUps(history: [record("2026-09-13", [set(1, reps: 8, weight: 0, unit: "lb", loadType: "external_load")])])
        pull.progressionRecommendation = .init(
            state: .opportunity, eyebrow: "Progression", message: "m", prescription: "0 lb x 9",
            suggestedLoad: 0, suggestedLoadType: "external_load", suggestedReps: 9, suggestedUnit: "lb"
        )
        var workout = draft(date: "2026-09-20")
        workout.addExercise(pull)
        workout.applyProgressionSuggestion(to: workout.exercises[0].id)
        XCTAssertNil(workout.exercises[0].sets[0].load)
        XCTAssertEqual(workout.exercises[0].sets[0].loadType, "bodyweight")
    }

    // MARK: Zero-load bodyweight display

    func testNullAndNumericZeroBodyweightHistoryDisplayIdenticallyAsBW() {
        let nullLoad = set(1, reps: 18, weight: nil, unit: "bodyweight", loadType: "bodyweight").classified(defaultLoadType: bodyweightDefault)
        let zeroExternal = set(1, reps: 18, weight: 0, unit: "lb", loadType: "external_load", setType: "weighted_reps").classified(defaultLoadType: bodyweightDefault)
        XCTAssertEqual(nullLoad.formattedLoad, "BW")
        XCTAssertEqual(zeroExternal.formattedLoad, "BW")
        XCTAssertEqual(zeroExternal.glance, nullLoad.glance)
        XCTAssertEqual(zeroExternal.glance, "18 x BW")
        XCTAssertEqual(zeroExternal.formattedDetail, "18 reps · BW")
        XCTAssertEqual(TrainingExerciseHistoryCalculator.compare(nullLoad, zeroExternal), 0, "the same performance ranks equal")
    }

    func testHistoricalRecordIsNotMutatedByClassification() {
        let stored = set(1, reps: 18, weight: 0, unit: "lb", loadType: "external_load", setType: "weighted_reps")
        _ = stored.classified(defaultLoadType: bodyweightDefault)
        XCTAssertEqual(stored.weight, 0)
        XCTAssertEqual(stored.loadType, "external_load")
        XCTAssertNil(stored.loadSemantics)
    }

    func testWeightedBodyweightAndMachineZeroDoNotDisplayAsBW() {
        let weighted = set(1, reps: 7, weight: 25, unit: "lb", loadType: "external_load", setType: "weighted_reps").classified(defaultLoadType: bodyweightDefault)
        XCTAssertEqual(weighted.formattedLoad, "25 lb")
        XCTAssertFalse(weighted.isBodyweight)
        let machineZero = set(1, reps: 12, weight: 0, unit: "lb", loadType: "external_load").classified(defaultLoadType: nil)
        XCTAssertEqual(machineZero.formattedLoad, "0 lb")
    }

    func testServerSuppliedSemanticsAreHonouredWithoutAnExerciseDefault() {
        var zero = set(1, reps: 12, weight: 0, unit: "lb", loadType: "external_load")
        XCTAssertEqual(zero.formattedLoad, "0 lb", "unclassified sets keep the stored representation")
        zero.loadSemantics = "bodyweight"
        XCTAssertEqual(zero.formattedLoad, "BW")
        XCTAssertEqual(zero.classified(defaultLoadType: nil).loadSemantics, "bodyweight", "the Server's value is never overridden")
    }

    func testTrainingLoggerHistoryDecodesAndPreservesServerLoadSemantics() throws {
        let json = #"[{"id":"s1","observed_at":"2026-09-13T15:00:00.000Z","exercises":[{"canonicalExerciseId":"pull_up","sets":[{"reps":7,"weight":25,"weight_unit":"lb","load_type":"external_load","measurement_type":"weighted_reps","load_semantics":"weighted_bodyweight"},{"reps":9,"weight":0,"weight_unit":"lb","load_type":"external_load","measurement_type":"weighted_reps","load_semantics":"bodyweight"}]}]}]"#
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let sessions = try decoder.decode([ProductionTrainingLoggerAPI.HistorySession].self, from: Data(json.utf8))
        let history = ProductionTrainingLoggerAPI.history(for: "pull_up", defaultLoadType: bodyweightDefault, in: sessions)
        let sets = try XCTUnwrap(history.first?.sets)
        XCTAssertEqual(sets.map(\.loadSemantics), ["weighted_bodyweight", "bodyweight"])
        XCTAssertEqual(sets.map(\.formattedLoad), ["25 lb", "BW"])
        XCTAssertEqual(history.first?.workoutDate, "2026-09-13")
    }

    // MARK: Previous chronology (repaired Sep 13 present)

    func testPreviousUsesRepairedSep13AndNeverResurrectsAug30() {
        for exercise in [pullUps(history: chronology(pull: true)), hangingLegRaises(history: chronology(pull: false))] {
            var sep20 = draft(date: "2026-09-20")
            sep20.addExercise(exercise)
            XCTAssertEqual(sep20.exercises[0].previousPerformance?.workoutDate, "2026-09-13", "\(exercise.name): Sep 13 is the previous for a Sep 20 draft")

            var sep27 = draft(date: "2026-09-27")
            sep27.addExercise(exercise)
            XCTAssertEqual(sep27.exercises[0].previousPerformance?.workoutDate, "2026-09-20", "\(exercise.name): Sep 20 is the previous for a later draft")

            var sep13 = draft(date: "2026-09-13")
            sep13.addExercise(exercise)
            XCTAssertEqual(sep13.exercises[0].previousPerformance?.workoutDate, "2026-08-30", "Aug 30 is only previous to a draft before Sep 13")
        }
    }

    func testPreviousLineDisplaysBothBodyweightEncodingsAsBW() {
        var workout = draft(date: "2026-09-27")
        workout.addExercise(hangingLegRaises(history: chronology(pull: false)))
        XCTAssertEqual(workout.exercises[0].previousPerformance?.compactLine, "Previous 20 x BW · 2026-09-20 · Ordinary · Standalone")
        XCTAssertNil(workout.exercises[0].sets[0].load)
    }

    // MARK: Fixtures

    private func draft(date: String) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: date)
        draft.selectedAreaIds = ["back", "core"]
        return draft
    }

    private func set(_ number: Int, reps: Double, weight: Double?, unit: String?, loadType: String?, setType: String? = nil) -> TrainingSet {
        .init(setNumber: number, reps: reps, weight: weight, weightUnit: unit, durationSeconds: nil, loadType: loadType, setType: setType)
    }

    private func record(_ date: String, _ sets: [TrainingSet]) -> TrainingLoggerHistoryRecord {
        .init(sessionId: "session-\(date)", workoutDate: date, executionVariant: nil, relationship: nil, sets: sets)
    }

    /// Aug 30 (original), Sep 13 (the repaired Logger workout, presented out of
    /// order on purpose), Sep 20. Sets mix null-load and numeric-zero encodings.
    private func chronology(pull: Bool) -> [TrainingLoggerHistoryRecord] {
        if pull {
            return [
                record("2026-09-20", [set(1, reps: 7, weight: 25, unit: "lb", loadType: "external_load", setType: "weighted_reps")]),
                record("2026-08-30", [set(1, reps: 8, weight: nil, unit: "bodyweight", loadType: "bodyweight", setType: "bodyweight_reps")]),
                record("2026-09-13", [set(1, reps: 6, weight: 25, unit: "lb", loadType: "external_load", setType: "weighted_reps")]),
            ]
        }
        return [
            record("2026-09-13", [set(1, reps: 18, weight: 0, unit: "lb", loadType: "external_load", setType: "weighted_reps")]),
            record("2026-09-20", [set(1, reps: 20, weight: nil, unit: "bodyweight", loadType: "bodyweight", setType: "bodyweight_reps")]),
            record("2026-08-30", [set(1, reps: 15, weight: 0, unit: "bodyweight", loadType: "bodyweight", setType: "bodyweight_reps")]),
        ]
    }

    private func pullUps(history: [TrainingLoggerHistoryRecord]) -> TrainingLoggerCatalogExercise {
        .init(
            canonicalExerciseId: "pull_up", name: "Pull-Ups", areaId: "back", equipment: "bodyweight",
            measurement: .bodyweightReps, defaultLoadType: bodyweightDefault, previouslyPerformed: true,
            history: history, progressionRecommendation: nil
        )
    }

    private func hangingLegRaises(history: [TrainingLoggerHistoryRecord]) -> TrainingLoggerCatalogExercise {
        .init(
            canonicalExerciseId: "hanging_leg_raise", name: "Hanging Leg Raises", areaId: "core", equipment: "bodyweight",
            measurement: .bodyweightReps, defaultLoadType: bodyweightDefault, previouslyPerformed: true,
            history: history, progressionRecommendation: nil
        )
    }
}
