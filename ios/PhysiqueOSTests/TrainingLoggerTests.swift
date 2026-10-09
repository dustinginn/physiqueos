import XCTest
import SwiftUI
import UIKit
@testable import PhysiqueOS

final class TrainingLoggerTests: XCTestCase {
    private let api = FixtureTrainingLoggerAPI()

    private func configuration() async throws -> TrainingLoggerConfiguration {
        try await api.fetchConfiguration()
    }

    func testEveryLibraryEligibleExerciseIsSelectableInLoggerForSameTrainingArea() async throws {
        let config = try await configuration()
        for area in config.areas {
            var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-09-08")
            draft.selectedAreaIds = [area.id]
            let pickerIDs = Set(draft.pickerExercises(in: config.exercises, browseAll: false, query: "").map(\.canonicalExerciseId))
            let canonicalIDs = Set(config.exercises.filter { $0.areaId == area.id }.map(\.canonicalExerciseId))
            XCTAssertEqual(pickerIDs, canonicalIDs, "Logger and Library diverged for \(area.label)")
        }
    }

    func testShouldersColdStartShowsFullCanonicalLibrarySelection() async throws {
        let config = try await configuration()
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-09-08")
        draft.selectedAreaIds = ["shoulders"]
        let names = draft.pickerExercises(in: config.exercises, browseAll: false, query: "").map(\.name)
        XCTAssertEqual(names.count, 8)
        XCTAssertTrue(names.contains("Shoulder Press Machine"))
        XCTAssertTrue(names.contains("Face Pull"))
    }

    private func draft(
        mode: TrainingLoggerMode = .live,
        date: String = "2026-08-30",
        areas: [String] = ["chest"]
    ) -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: mode, workoutDate: date)
        draft.selectedAreaIds = areas
        return draft
    }

    func testTrainingLoggerRouteKeepsServerLogDestinationContract() {
        XCTAssertEqual(AppDestination.trainingLogger.serverDestinationId, "log")
    }

    @MainActor
    func testRepeatedPristineStartCreatesOnlyOneSession() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: store)
        await viewModel.load()
        let start = try XCTUnwrap(Self.testDate("2026-10-07T18:30:00Z"))

        viewModel.start(mode: .live, date: start)
        let firstID = try XCTUnwrap(viewModel.draft?.id)
        viewModel.start(mode: .live, date: start)

        XCTAssertEqual(viewModel.draft?.id, firstID)
        XCTAssertEqual(store.loadAll().count, 1, "A double tap must not create a sibling workout.")
    }

    @MainActor
    func testLoggerRefusalCopyIsTruthfulAndNonDestructive() {
        XCTAssertEqual(
            TrainingLoggerViewModel.refusalMessage(for: .sessionPaused),
            "Resume this workout before changing sets or notes."
        )
        XCTAssertEqual(
            TrainingLoggerViewModel.refusalMessage(for: .staleRevision(current: 4)),
            "This workout changed elsewhere. Review the latest values before trying again."
        )
        XCTAssertEqual(
            TrainingLoggerViewModel.refusalMessage(for: .sessionNotMutable),
            "This workout is being saved and can't be changed right now."
        )
        XCTAssertEqual(
            TrainingLoggerViewModel.refusalMessage(for: .persistenceFailed),
            "This change couldn't be saved on this device. Your workout is unchanged; try again."
        )
    }

    @MainActor
    func testDiscardRefusalKeepsExactDraftAndShowsInlineReason() async throws {
        var saved = draft(mode: .live, date: "2026-10-07", areas: ["biceps"])
        saved.id = "saving-draft"
        let store = MemoryTrainingLoggerDraftStore(draft: saved)
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: store)
        await viewModel.load()
        XCTAssertTrue(viewModel.sessionAuthority.beginSubmission(sessionId: saved.id))

        viewModel.discardSavedDraft(draftId: saved.id)

        XCTAssertEqual(store.loadAll(), [saved])
        XCTAssertEqual(viewModel.savedDrafts, [saved])
        XCTAssertEqual(
            viewModel.validationMessage,
            "This workout is being saved and can't be changed right now."
        )
        viewModel.sessionAuthority.endSubmission(sessionId: saved.id)
    }

    func testLoggerRefusalPresentationAndLogHelperUseShippingIdentifiers() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let view = try String(
            contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift"),
            encoding: .utf8
        )
        let ui = try String(
            contentsOf: root.appendingPathComponent("PhysiqueOSUITests/TrainingAcceptanceUITests.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(view.contains("accessibilityIdentifier(\"trainingLogger.validation\")"))
        XCTAssertTrue(view.contains("validation(viewModel)"), "Entry and active Logger flows must surface refusals inline.")
        XCTAssertTrue(ui.contains("matching(identifier: \"log.trainingLogger\")"))
        XCTAssertTrue(ui.contains("[\"trainingLogger.workoutIdentity\"]"), "The helper must handle Log's live-workout routing rule.")
    }

    func testCanonicalAreasDecodeInWebOrderAndSupportMultiSelect() async throws {
        let config = try await configuration()
        XCTAssertEqual(config.areas.map(\.label), ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Core", "Quads", "Hamstrings", "Glutes", "Calves"])
        var draft = draft()
        draft.toggleArea("back")
        XCTAssertEqual(draft.selectedAreaIds, ["chest", "back"])
        draft.toggleArea("chest")
        XCTAssertEqual(draft.selectedAreaIds, ["back"])
    }

    func testPickerShowsAllEligibleExercisesAndPrioritizesPreviouslyPerformedOnColdStart() async throws {
        let config = try await configuration()
        let draft = draft(areas: ["chest", "shoulders"])
        let normal = draft.pickerExercises(in: config.exercises, browseAll: false, query: "")
        XCTAssertTrue(normal.map(\.name).contains("Lateral Raise"))
        let firstUnperformed = try XCTUnwrap(normal.firstIndex(where: { !$0.previouslyPerformed }))
        XCTAssertTrue(normal[..<firstUnperformed].allSatisfy(\.previouslyPerformed))
        let broad = draft.pickerExercises(in: config.exercises, browseAll: true, query: "")
        let firstRegistryOnly = try XCTUnwrap(broad.firstIndex(where: { !$0.previouslyPerformed }))
        XCTAssertTrue(broad[..<firstRegistryOnly].allSatisfy(\.previouslyPerformed))
        XCTAssertEqual(draft.pickerExercises(in: config.exercises, browseAll: true, query: "lateral").map(\.name), ["Lateral Raise", "Lateral Raises Machine"])
    }

    func testExerciseSelectionPresentationTracksSelectedStateCountAndCTA() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        var draft = draft()
        var presentation = TrainingLoggerSelectionPresentation(draft: draft)
        XCTAssertEqual(presentation.selectedCount, 0)
        XCTAssertEqual(presentation.startTitle, "Start logging · 0 selected")
        XCTAssertFalse(presentation.canStart)
        draft.addExercise(bench)
        draft.addExercise(fly)
        XCTAssertTrue(draft.exercises.contains { $0.canonicalExerciseId == bench.canonicalExerciseId })
        XCTAssertFalse(draft.exercises.contains { $0.canonicalExerciseId == "pushup" })
        presentation = TrainingLoggerSelectionPresentation(draft: draft)
        XCTAssertEqual(presentation.selectedCount, 2)
        XCTAssertEqual(presentation.startTitle, "Start logging · 2 selected")
        XCTAssertTrue(presentation.canStart)
        draft.removeExercise(id: draft.exercises[0].id)
        XCTAssertEqual(TrainingLoggerSelectionPresentation(draft: draft).selectedCount, 1)
    }

    func testAddingExerciseReusesExactPreviousPerformanceAndPrepopulatesSets() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        var draft = draft()
        draft.addExercise(bench)
        let exercise = try XCTUnwrap(draft.exercises.first)
        XCTAssertEqual(exercise.previousPerformance?.workoutDate, "2026-08-25")
        XCTAssertEqual(exercise.previousPerformance?.contextLabel, "Ordinary · Standalone")
        XCTAssertEqual(exercise.sets.map(\.reps), [8, 8, 7])
        XCTAssertEqual(exercise.sets.map(\.load), [135, 135, 135])
        XCTAssertTrue(exercise.sets.allSatisfy { !$0.isCompleted })
        XCTAssertEqual(exercise.previousPerformance?.compactLine, "Previous 8 x 135 lb · 2026-08-25 · Ordinary · Standalone")
    }

    func testLiveAndPastWorkoutPresentationUseOperationalIdentity() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        var live = draft()
        live.addExercise(bench)
        var livePresentation = TrainingLoggerWorkoutPresentation(live)
        XCTAssertEqual(livePresentation.eyebrow, "Workout in progress")
        XCTAssertEqual(livePresentation.context, "Started now · 1 exercise")
        XCTAssertEqual(livePresentation.progress, "0/3 sets")
        XCTAssertFalse(livePresentation.canFinish)
        live.exercises[0].sets[0].isCompleted = true
        livePresentation = TrainingLoggerWorkoutPresentation(live)
        XCTAssertEqual(livePresentation.progress, "1/3 sets")
        XCTAssertTrue(livePresentation.canFinish)

        var past = draft(mode: .past, date: "2026-08-28")
        past.addExercise(bench)
        let pastPresentation = TrainingLoggerWorkoutPresentation(past)
        XCTAssertEqual(pastPresentation.eyebrow, "Past workout entry")
        XCTAssertEqual(pastPresentation.context, "2026-08-28 · 1 exercise")
    }

    /// Performance records are canonical Server output; the Logger must never
    /// compute its own "better performance" claims.
    func testLoggerNoLongerComputesPerformanceClaims() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let model = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Contracts/TrainingLoggerReadModel.swift"), encoding: .utf8)
        let view = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift"), encoding: .utf8)
        XCTAssertFalse(model.contains("performanceAchievementLines"))
        XCTAssertFalse(view.contains("performanceAchievementLines"))
        XCTAssertFalse(view.contains("\"Better performance\""))
    }

    func testPreviousPerformanceIsStrictlyBeforePastWorkoutDate() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        var draft = draft(mode: .past, date: "2026-08-22")
        draft.addExercise(bench)
        XCTAssertNil(draft.exercises.first?.previousPerformance, "Future sessions must not prepopulate a past workout.")
        XCTAssertEqual(draft.exercises.first?.sets.count, 3)
    }

    func testVariantComparisonIsolationUsesVariantHistoryOnly() async throws {
        let config = try await configuration()
        let spider = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "spider_curl" })
        let variant = try XCTUnwrap(config.variants.first { $0.key == "slow_eccentric" })
        var draft = draft(areas: ["biceps"])
        draft.addExercise(spider)
        let id = try XCTUnwrap(draft.exercises.first?.id)
        XCTAssertNil(draft.exercises.first?.previousPerformance)
        draft.applyVariant(variant, to: id, catalog: config.exercises)
        XCTAssertEqual(draft.exercises.first?.previousPerformance?.workoutDate, "2026-08-21")
        XCTAssertEqual(draft.exercises.first?.previousPerformance?.contextLabel, "Slow Eccentric")
        draft.applyVariant(nil, to: id, catalog: config.exercises)
        XCTAssertNil(draft.exercises.first?.previousPerformance)
    }

    func testProgressionSuggestionAppearsOnlyForExplicitExactComparableContext() async throws {
        let config = try await configuration()
        let pushdown = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_pushdown" })
        let variant = try XCTUnwrap(config.variants.first)
        var draft = draft(areas: ["triceps"])
        draft.addExercise(pushdown)
        let exerciseId = try XCTUnwrap(draft.exercises.first?.id)
        XCTAssertEqual(draft.exercises.first?.progressionRecommendation?.eyebrow, "Maintain current performance")
        XCTAssertEqual(draft.exercises.first?.progressionChoice, .previous)
        draft.applyProgressionSuggestion(to: exerciseId)
        XCTAssertEqual(draft.exercises.first?.progressionChoice, .suggestion)
        XCTAssertEqual(draft.exercises.first?.sets.map(\.reps), [12, 12, 12])
        XCTAssertEqual(draft.exercises.first?.sets.map(\.load), [50, 50, 50])
        draft.applyVariant(variant, to: exerciseId, catalog: config.exercises)
        XCTAssertNil(draft.exercises.first?.previousPerformance)
        XCTAssertNil(draft.exercises.first?.progressionRecommendation)
        XCTAssertNil(draft.exercises.first?.progressionChoice)
    }

    func testBodyweightDefaultExercisesAlwaysAllowOptionalPerSetExternalLoad() {
        let pullUps = TrainingLoggerCatalogExercise(
            canonicalExerciseId: "pull_up", name: "Pull-Ups", areaId: "back", equipment: "bodyweight",
            measurement: .bodyweightReps, defaultLoadType: "bodyweight", previouslyPerformed: true,
            history: [.init(
                sessionId: "pull-prior", workoutDate: "2026-08-30", executionVariant: nil, relationship: nil,
                sets: [.init(setNumber: 1, reps: 6, weight: 25, weightUnit: "lb", durationSeconds: nil, loadType: "external_load", setType: "weighted_reps")]
            )],
            progressionRecommendation: .init(
                state: .opportunity, eyebrow: "Progression opportunity", message: "Canonical recommendation.",
                prescription: "25 lb x 7", suggestedLoad: 25, suggestedLoadType: "external_load",
                suggestedReps: 7, suggestedUnit: "lb"
            )
        )
        let hangingRaises = TrainingLoggerCatalogExercise(
            canonicalExerciseId: "hanging_leg_raise", name: "Hanging Leg Raises", areaId: "core", equipment: "bodyweight",
            measurement: .bodyweightReps, defaultLoadType: "bodyweight", previouslyPerformed: true,
            history: [.init(
                sessionId: "raise-prior", workoutDate: "2026-08-30", executionVariant: nil, relationship: nil,
                sets: [.init(setNumber: 1, reps: 18, weight: nil, weightUnit: "bodyweight", durationSeconds: nil, loadType: "bodyweight", setType: "bodyweight_reps")]
            )], progressionRecommendation: nil
        )
        var workout = draft(date: "2026-09-13", areas: ["back", "core"])
        workout.addExercise(pullUps)
        workout.addExercise(hangingRaises)

        XCTAssertEqual(workout.exercises[0].previousPerformance?.compactLine, "Previous 6 x 25 lb · 2026-08-30 · Ordinary · Standalone")
        XCTAssertEqual(workout.exercises[0].sets.first?.load, 25)
        XCTAssertEqual(workout.exercises[1].previousPerformance?.compactLine, "Previous 18 x BW · 2026-08-30 · Ordinary · Standalone")
        XCTAssertNil(workout.exercises[1].sets.first?.load)
        let targets = TrainingLoggerNumericFocusOrder.targets(for: workout)
        XCTAssertEqual(targets.filter { $0.exerciseId == workout.exercises[0].id }.map(\.kind), [.reps, .load])
        XCTAssertEqual(targets.filter { $0.exerciseId == workout.exercises[1].id }.map(\.kind), [.reps, .load])

        workout.exercises[0].sets[0].load = nil
        XCTAssertNil(workout.exercises[0].sets[0].load, "Removing added load returns the set to bodyweight-only.")
        workout.exercises[1].sets[0].load = 10
        workout.addSet(to: workout.exercises[1].id)
        workout.exercises[1].sets[1].load = 15
        XCTAssertEqual(workout.exercises[1].sets.map(\.load), [10, 15])
    }

    func testCanonicalRecommendationActionsRemainEditableAndNoRecommendationWithholds() {
        let recommendation = TrainingLoggerProgressionRecommendation(
            state: .maintain, eyebrow: "Maintain current performance", message: "Canonical recommendation.",
            prescription: "110 lb x 14", suggestedLoad: 110, suggestedLoadType: "external_load",
            suggestedReps: 14, suggestedUnit: "lb"
        )
        let history = TrainingLoggerHistoryRecord(
            sessionId: "previous", workoutDate: "2026-08-30", executionVariant: nil, relationship: nil,
            sets: [.init(setNumber: 1, reps: 14, weight: 110, weightUnit: "lb", durationSeconds: nil, loadType: "external_load", setType: "weighted_reps")]
        )
        let row = TrainingLoggerCatalogExercise(
            canonicalExerciseId: "seated_cable_row", name: "Seated Cable Rows", areaId: "back", equipment: "cable",
            measurement: .repsLoad, defaultLoadType: nil, previouslyPerformed: true,
            history: [history], progressionRecommendation: recommendation
        )
        let without = TrainingLoggerCatalogExercise(
            canonicalExerciseId: "new_row", name: "New Row", areaId: "back", equipment: "cable",
            measurement: .repsLoad, defaultLoadType: nil, previouslyPerformed: true,
            history: [history], progressionRecommendation: nil
        )
        var workout = draft(date: "2026-09-13", areas: ["back"])
        workout.addExercise(row)
        workout.addExercise(without)
        let id = workout.exercises[0].id
        workout.applyProgressionSuggestion(to: id)
        XCTAssertEqual(workout.exercises[0].sets[0].reps, 14)
        XCTAssertEqual(workout.exercises[0].sets[0].load, 110)
        workout.exercises[0].sets[0].reps = 15
        XCTAssertEqual(workout.exercises[0].sets[0].reps, 15, "Suggestion remains editable.")
        workout.keepPreviousPerformance(for: id)
        XCTAssertEqual(workout.exercises[0].sets[0].reps, 14)
        XCTAssertEqual(workout.exercises[0].sets[0].load, 110)
        workout.exercises[0].sets[0].load = 115
        XCTAssertEqual(workout.exercises[0].sets[0].load, 115, "Previous choice remains editable.")
        XCTAssertNil(workout.exercises[1].progressionRecommendation)
    }

    func testSupersetComparisonIsolationUsesCanonicalPartnerIdentity() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        var draft = draft()
        draft.addExercise(bench)
        draft.addExercise(fly)
        let benchId = draft.exercises[0].id
        let flyId = draft.exercises[1].id
        draft.setSuperset(firstId: benchId, secondId: flyId, catalog: config.exercises)
        XCTAssertEqual(draft.relationships.count, 1)
        XCTAssertEqual(draft.relationshipContext(for: benchId)?.partnerCanonicalExerciseIds, ["cable_fly"])
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-08-20")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.workoutDate, "2026-08-20")
        draft.removeSuperset(containing: benchId, catalog: config.exercises)
        XCTAssertTrue(draft.relationships.isEmpty)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-08-25")
    }

    func testSetEditingAddingAndRemovingRemainCompactAndOrdered() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        var draft = draft()
        draft.addExercise(bench)
        let id = draft.exercises[0].id
        draft.exercises[0].sets[0].reps = 9
        draft.exercises[0].sets[0].load = 140
        draft.addSet(to: id)
        XCTAssertEqual(draft.exercises[0].sets.last?.setNumber, 4)
        XCTAssertEqual(draft.exercises[0].sets.last?.reps, 7)
        let removeId = draft.exercises[0].sets[1].id
        draft.removeSet(exerciseId: id, setId: removeId)
        XCTAssertEqual(draft.exercises[0].sets.map(\.setNumber), [1, 2, 3])
        XCTAssertEqual(draft.exercises[0].sets[0].reps, 9)
        XCTAssertEqual(draft.exercises[0].sets[0].load, 140)
    }

    func testActiveAndPastWorkoutsAddExercisesWithoutLosingSetEditsOrCreatingDuplicates() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        for mode in [TrainingLoggerMode.live, .past] {
            var draft = draft(mode: mode)
            draft.addExercise(bench)
            draft.exercises[0].sets[0].reps = 12
            draft.exercises[0].sets[0].isCompleted = true
            draft.step = .workout
            draft.beginAddingExercises()
            XCTAssertTrue(draft.isAddingExercises)
            XCTAssertTrue(draft.exerciseWasPresentBeforePicker(bench))
            draft.addExercise(bench)
            draft.addExercise(fly)
            draft.finishExerciseSelection()
            XCTAssertEqual(draft.step, .workout)
            XCTAssertEqual(draft.exercises.count, 2)
            XCTAssertEqual(draft.exercises[0].sets[0].reps, 12)
            XCTAssertTrue(draft.exercises[0].sets[0].isCompleted)
        }
    }

    func testNumericFocusOrderSkipsInapplicableFieldsAcrossMeasurementTypes() async throws {
        let config = try await configuration()
        var draft = draft(areas: ["chest", "core"])
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "pushup" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "plank" }))
        let targets = TrainingLoggerNumericFocusOrder.targets(for: draft)
        XCTAssertEqual(targets.filter { $0.exerciseId == draft.exercises[0].id }.map(\.kind), [.reps, .load, .reps, .load, .reps, .load])
        XCTAssertEqual(
            targets.filter { $0.exerciseId == draft.exercises[1].id }.map(\.kind),
            Array(repeating: [.reps, .load], count: draft.exercises[1].sets.count).flatMap { $0 }
        )
        XCTAssertEqual(
            targets.filter { $0.exerciseId == draft.exercises[2].id }.map(\.kind),
            Array(repeating: [.duration, .load], count: draft.exercises[2].sets.count).flatMap { $0 }
        )
        XCTAssertEqual(TrainingLoggerNumericFocusOrder.next(after: targets[0].id, in: draft), targets[1].id)
        XCTAssertNil(TrainingLoggerNumericFocusOrder.next(after: targets.last!.id, in: draft))
    }

    func testSupportingWorkoutEvidencePreservesOrderDeduplicatesAndRemoves() {
        var draft = draft()
        let photo = TrainingLoggerSupportingEvidence(id: "p", displayName: "Health 1.png", source: .photos)
        let file = TrainingLoggerSupportingEvidence(id: "f", displayName: "Health 2.pdf", source: .files)
        draft.addSupportingEvidence([photo, file, photo])
        XCTAssertEqual(draft.supportingEvidenceAssets, [photo, file])
        // Adding asset metadata alone never synthesizes a workout result —
        // that only happens once real local interpretation reports back.
        XCTAssertTrue(draft.supportingWorkoutObservations.isEmpty)

        draft.setSupportingWorkoutInterpretation(assetId: "p", workout: .stairStepper(sourceEvidenceIds: ["p"]))
        draft.setSupportingWorkoutInterpretation(assetId: "f", workout: nil)
        XCTAssertEqual(draft.supportingWorkoutObservations.map(\.sourceEvidenceIds), [["p"]])
        XCTAssertEqual(draft.supportingWorkoutFailureIds, ["f"])

        draft.removeSupportingEvidence(id: photo.id)
        XCTAssertEqual(draft.supportingEvidenceAssets, [file])
        XCTAssertTrue(draft.supportingWorkoutObservations.isEmpty)
        XCTAssertEqual(draft.supportingWorkoutFailureIds, ["f"])
    }

    func testSupportingWorkoutInterpretationKeepsMultipleScreenshotsAsDistinctWorkouts() {
        var draft = draft()
        let stairs = TrainingLoggerSupportingEvidence(id: "stairs", displayName: "Stairs.png", source: .photos)
        let run = TrainingLoggerSupportingEvidence(id: "run", displayName: "Run.png", source: .photos)
        draft.addSupportingEvidence([stairs, run])

        draft.setSupportingWorkoutInterpretation(assetId: "stairs", workout: .stairStepper(sourceEvidenceIds: ["stairs"]))
        let runWorkout = TrainingLoggerSupportingWorkout(
            id: "supporting-run", activityName: "Outdoor Run", category: "Cardio", durationMinutes: 31,
            activeCalories: 402, totalCalories: nil, averageHeartRate: 151, distance: 3.2, distanceUnit: "mi",
            sourceEvidenceIds: ["run"], recordOwner: .activity
        )
        draft.setSupportingWorkoutInterpretation(assetId: "run", workout: runWorkout)

        XCTAssertEqual(Set(draft.supportingWorkoutObservations.map(\.activityName)), ["Stair Stepper", "Outdoor Run"])
        XCTAssertEqual(draft.supportingWorkoutObservations.first { $0.sourceEvidenceIds == ["stairs"] }?.activityName, "Stair Stepper")
        XCTAssertEqual(draft.supportingWorkoutObservations.first { $0.sourceEvidenceIds == ["run"] }?.activityName, "Outdoor Run")
        XCTAssertTrue(draft.supportingWorkoutFailureIds.isEmpty)
    }

    // MARK: - Real Apple Health screenshot interpretation
    // Exercises `EvidenceLocalInterpretation.supportingWorkout`, the exact
    // shared local-extraction function Workout Logger's reconciliation
    // screen now calls on real OCR'd text instead of always returning the
    // fixture Stair Stepper result.

    func testRealAppleHealthTextInterpretsIntoTheActualUploadedWorkout() {
        let text = """
        Stair Stepper
        Workout Time 42:18
        Active Calories 386
        Total Calories 512
        Average Heart Rate 128
        """
        let workout = EvidenceLocalInterpretation.supportingWorkout(id: "supporting-a", sourceEvidenceIds: ["a"], from: text)
        let resolved = try? XCTUnwrap(workout)

        XCTAssertEqual(resolved?.activityName, "Stair Stepper")
        XCTAssertEqual(resolved?.category, "Cardio")
        XCTAssertEqual(resolved?.activeCalories, 386)
        XCTAssertEqual(resolved?.totalCalories, 512)
        XCTAssertEqual(resolved?.averageHeartRate, 128)
        XCTAssertEqual(resolved?.sourceEvidenceIds, ["a"])
    }

    func testAppleHealthStrengthScreenshotDoesNotBecomeCardioFromIncidentalExerciseText() {
        let text = """
        Traditional Strength Training
        Workout Time 1:11:51
        Active Calories 380
        Exercises included seated rowing
        """

        let workout = EvidenceLocalInterpretation.supportingWorkout(id: "strength", sourceEvidenceIds: ["strength-image"], from: text)

        XCTAssertEqual(workout?.activityName, "Traditional Strength Training")
        XCTAssertEqual(workout?.category, "Strength")
        XCTAssertEqual(workout?.recordOwner, .trainingSession)
        XCTAssertEqual(workout?.durationMinutes ?? 0, 71.85, accuracy: 0.001)
    }

    func testAppleFitnessMultilineStrengthTitleAndSemanticMetrics() throws {
        // Sanitized Vision text structure; no private image is retained.
        let text = """
        Traditional
        Strength Training
        September 15, 2026, 7:58-8:55 AM Apple Watch
        Workout Time
        0:57:37
        Total Calories
        382CAL
        Active Calories
        288CAL
        Avg. Heart Rate
        106BPM
        """
        let workout = try XCTUnwrap(EvidenceLocalInterpretation.supportingWorkout(id: "strength", sourceEvidenceIds: ["image"], from: text))
        XCTAssertEqual(workout.activityName, "Traditional Strength Training")
        XCTAssertEqual(workout.recordOwner, .trainingSession)
        XCTAssertEqual(workout.durationMinutes, 57 + 37.0 / 60, accuracy: 0.001)
        XCTAssertEqual(workout.activeCalories, 288)
        XCTAssertEqual(workout.totalCalories, 382)
        XCTAssertEqual(workout.averageHeartRate, 106)
    }

    func testTwoDifferentRealScreenshotsInterpretIntoTwoDistinctWorkouts() {
        let stairsText = "Stair Stepper\nWorkout Time 42:18\nActive Calories 386"
        let runText = "Outdoor Run\nWorkout Time 31:00\nActive Calories 402\nDistance 3.2 mi"
        let stairs = EvidenceLocalInterpretation.supportingWorkout(id: "supporting-stairs", sourceEvidenceIds: ["stairs"], from: stairsText)
        let run = EvidenceLocalInterpretation.supportingWorkout(id: "supporting-run", sourceEvidenceIds: ["run"], from: runText)

        XCTAssertEqual(stairs?.activityName, "Stair Stepper")
        XCTAssertEqual(run?.activityName, "Outdoor Run")
        XCTAssertEqual(run?.distance, 3.2)
        XCTAssertNotEqual(stairs?.id, run?.id)
        XCTAssertNotEqual(stairs?.sourceEvidenceIds, run?.sourceEvidenceIds)
    }

    /// Text with no recognizable cardio/strength workout signal — the
    /// real "could not read" case a garbled or unrelated screenshot
    /// produces. Must return `nil`, never a fixture/demo fallback.
    func testUnreadableAppleHealthTextFailsInterpretationRatherThanFallingBackToTheFixture() {
        let workout = EvidenceLocalInterpretation.supportingWorkout(id: "supporting-x", sourceEvidenceIds: ["x"], from: "Some unrelated screenshot text with no workout data")
        XCTAssertNil(workout)
    }

    func testFailedSupportingWorkoutInterpretationDoesNotFallBackToTheFixture() {
        var draft = draft()
        let unreadable = TrainingLoggerSupportingEvidence(id: "unreadable", displayName: "Blurry.png", source: .photos)
        draft.addSupportingEvidence([unreadable])

        draft.setSupportingWorkoutInterpretation(assetId: "unreadable", workout: nil)

        XCTAssertTrue(draft.supportingWorkoutObservations.isEmpty)
        XCTAssertEqual(draft.supportingWorkoutFailureIds, ["unreadable"])
        XCTAssertFalse(draft.supportingWorkoutObservations.contains { $0.activityName == "Stair Stepper" })
    }

    func testMixedGymVisitPreservesStrengthDetailAndSeparateCardioOwnership() async throws {
        let config = try await configuration()
        var draft = draft()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        draft.addExercise(bench)
        draft.addExercise(fly)
        let benchID = draft.exercises[0].id
        draft.applyVariant(config.variants[1], to: benchID, catalog: config.exercises)
        draft.setSuperset(firstId: benchID, secondId: draft.exercises[1].id, catalog: config.exercises)
        draft.exercises[0].sets[0].reps = 8
        draft.exercises[0].sets[0].load = 145
        draft.exercises[0].sets[0].isCompleted = true
        draft.addSupportingEvidence([.init(id: "health", displayName: "Apple Health.png", source: .photos)])
        draft.setSupportingWorkoutInterpretation(assetId: "health", workout: .stairStepper(sourceEvidenceIds: ["health"]))

        XCTAssertEqual(draft.exercises.map(\.name), ["Bench Press", "Cable Fly"])
        XCTAssertEqual(draft.exercises[0].sets[0].reps, 8)
        XCTAssertEqual(draft.exercises[0].sets[0].load, 145)
        XCTAssertNotNil(draft.exercises[0].executionVariant)
        XCTAssertEqual(draft.relationshipContext(for: benchID)?.relationshipType, "superset")

        let cardio = try XCTUnwrap(draft.supportingWorkoutObservations.first)
        XCTAssertEqual(cardio.activityName, "Stair Stepper")
        XCTAssertEqual(cardio.durationMinutes, 42)
        XCTAssertEqual(cardio.activeCalories, 386)
        XCTAssertEqual(cardio.averageHeartRate, 128)
        XCTAssertEqual(cardio.recordOwner, .activity)
        XCTAssertNotEqual(cardio.recordOwner, .trainingSession)
    }

    func testBodyweightAndTimedSetsPreserveTheirMeasurementSemantics() async throws {
        let config = try await configuration()
        let pushups = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "pushup" })
        let plank = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "plank" })
        var draft = draft(areas: ["chest", "core"])
        draft.addExercise(pushups)
        draft.addExercise(plank)
        XCTAssertEqual(draft.exercises[0].measurement, .bodyweightReps)
        XCTAssertNil(draft.exercises[0].sets[0].load)
        XCTAssertEqual(draft.exercises[0].sets[0].reps, 20)
        XCTAssertEqual(draft.exercises[1].measurement, .duration)
        XCTAssertEqual(draft.exercises[1].sets[0].durationSeconds, 45)
        XCTAssertNil(draft.exercises[1].sets[0].validationMessage(for: .duration))
    }

    func testExerciseRemovalAlsoRemovesRelationshipAndOrderingCanChange() async throws {
        let config = try await configuration()
        var draft = draft()
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" }))
        let first = draft.exercises[0].id
        let second = draft.exercises[1].id
        draft.setSuperset(firstId: first, secondId: second, catalog: config.exercises)
        draft.moveExercise(id: second, offset: -1)
        XCTAssertEqual(draft.exercises[0].id, second)
        draft.removeExercise(id: first)
        XCTAssertEqual(draft.exercises.count, 1)
        XCTAssertTrue(draft.relationships.isEmpty)
    }

    func testSubstitutionIsAtomicAndRejectsDuplicateCanonicalIdentity() async throws {
        let config = try await configuration()
        var draft = draft(areas: ["chest", "back"])
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        let lat = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "lat_pulldown" })
        draft.addExercise(bench)
        draft.addExercise(fly)
        let firstId = draft.exercises[0].id
        draft.swapExercise(id: firstId, with: lat)
        XCTAssertEqual(draft.exercises[0].canonicalExerciseId, "lat_pulldown")
        XCTAssertEqual(draft.exercises[0].sets.first?.load, 110)
        draft.swapExercise(id: firstId, with: fly)
        XCTAssertEqual(draft.exercises[0].canonicalExerciseId, "lat_pulldown", "A duplicate canonical exercise must not be created.")
    }

    func testNewExerciseIsProvisionalAndNeverClaimsCanonicalSuccess() {
        var draft = draft()
        draft.addProvisionalExercise(name: "  Sandbox Press  ", areaId: "chest")
        XCTAssertEqual(draft.exercises.first?.name, "Sandbox Press")
        XCTAssertNil(draft.exercises.first?.canonicalExerciseId)
        XCTAssertEqual(draft.exercises.first?.isProvisional, true)
        XCTAssertTrue(draft.exercises.first?.provenance?.contains("requires canonical review") == true)
        draft.addProvisionalExercise(name: "sandbox press", areaId: "chest")
        XCTAssertEqual(draft.exercises.count, 1)
    }

    func testDraftRoundTripPreservesPastDateVariantSupersetAndSetEdits() async throws {
        let config = try await configuration()
        var draft = draft(mode: .past, date: "2026-08-28")
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        draft.addExercise(bench)
        draft.addExercise(fly)
        draft.applyVariant(config.variants[1], to: draft.exercises[0].id, catalog: config.exercises)
        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: config.exercises)
        draft.exercises[0].sets[0].reps = 11
        draft.step = .workout
        let store = MemoryTrainingLoggerDraftStore()
        store.save(draft)
        XCTAssertEqual(store.load(), draft)
        XCTAssertEqual(store.load()?.workoutDate, "2026-08-28")
        store.discard()
        XCTAssertNil(store.load())
    }

    func testLegacySingleDraftMigratesLosslesslyIntoMultipleDraftCollection() throws {
        let suite = "TrainingLoggerDraftMigrationTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let key = "logger-drafts"
        var legacy = draft(mode: .past, date: "2026-09-15", areas: ["shoulders"])
        legacy.id = "legacy-sep-15"
        legacy.supportingEvidence = [.init(id: "image-1", displayName: "Workout.png", source: .photos, storageReference: "legacy-sep-15/image-1", contentType: "image/png")]
        defaults.set(try JSONEncoder().encode(legacy), forKey: key)

        let store = UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: key)
        XCTAssertEqual(store.loadAll(), [legacy])

        var sibling = draft(mode: .live, date: "2026-09-16", areas: ["quads"])
        sibling.id = "new-sep-16"
        store.save(sibling)
        XCTAssertEqual(Set(store.loadAll().map(\.id)), [legacy.id, sibling.id])
        XCTAssertEqual(store.loadAll().first(where: { $0.id == legacy.id }), legacy)

        let relaunchedStore = UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: key)
        XCTAssertEqual(Set(relaunchedStore.loadAll().map(\.id)), [legacy.id, sibling.id], "Every draft must survive app restart independently.")
    }

    /// The DEBUG UI-test isolation seam clears only the Sandbox draft
    /// collection (with its attachments) and the rest preference, and only
    /// when its launch argument is present.
    @MainActor
    func testSandboxUITestIsolationClearsOnlySandboxTrainingStateOnRequest() throws {
        let suite = "SandboxTrainingUITestIsolation.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let attachments = MemoryTrainingLoggerAttachmentStore()
        let sandbox = UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: SandboxTrainingUITestIsolation.sandboxDraftKey)
        let founder = UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: "physiqueos.founder-production.trainingLogger.localDraft.v1")
        var active = draft(mode: .live, date: "2026-10-08", areas: ["chest"])
        active.id = "sandbox-active"
        sandbox.save(active)
        var production = draft(mode: .live, date: "2026-10-08", areas: ["back"])
        production.id = "founder-active"
        founder.save(production)
        let sandboxImage = try attachments.save(data: Data([1]), draftId: active.id, assetId: "a", displayName: "a.png")
        let founderImage = try attachments.save(data: Data([2]), draftId: production.id, assetId: "b", displayName: "b.png")
        defaults.set("countdown", forKey: UserDefaultsTrainingRestPreferences.globalKey)
        defaults.set(Data([1]), forKey: SandboxTrainingUITestIsolation.sandboxTerminalLedgerKey)
        defaults.set(Data([2]), forKey: "physiqueos.founderProduction.trainingSession.terminalLedger.v1")
        defaults.set(true, forKey: "physiqueos.workoutComplete.celebrated.\(active.id)")
        defaults.set(true, forKey: "physiqueos.workoutComplete.celebrated.\(production.id)")

        XCTAssertFalse(SandboxTrainingUITestIsolation.applyIfRequested(arguments: [], defaults: defaults, attachments: attachments))
        XCTAssertEqual(sandbox.loadAll().map(\.id), [active.id], "No argument, no reset")

        XCTAssertFalse(SandboxTrainingUITestIsolation.applyIfRequested(
            arguments: [SandboxTrainingUITestIsolation.argument], defaults: defaults, attachments: attachments),
                       "A reset needs its per-test token")
        XCTAssertTrue(SandboxTrainingUITestIsolation.applyIfRequested(
            arguments: [SandboxTrainingUITestIsolation.argument, "test-1"], defaults: defaults, attachments: attachments))
        XCTAssertTrue(sandbox.loadAll().isEmpty)
        XCTAssertThrowsError(try attachments.load(reference: sandboxImage))
        XCTAssertNil(defaults.object(forKey: UserDefaultsTrainingRestPreferences.globalKey))
        XCTAssertNil(defaults.object(forKey: SandboxTrainingUITestIsolation.sandboxTerminalLedgerKey))
        XCTAssertNil(defaults.object(forKey: "physiqueos.workoutComplete.celebrated.\(active.id)"))
        XCTAssertNotNil(defaults.object(forKey: "physiqueos.founderProduction.trainingSession.terminalLedger.v1"))
        XCTAssertNotNil(defaults.object(forKey: "physiqueos.workoutComplete.celebrated.\(production.id)"))
        XCTAssertEqual(founder.loadAll().map(\.id), [production.id], "Founder Production drafts are never touched")
        XCTAssertEqual(try attachments.load(reference: founderImage), Data([2]))
        XCTAssertEqual(SandboxTrainingUITestIsolation.sandboxDraftKey, "physiqueos.trainingLogger.localDraft.v1",
                       "must match AppEnvironment's Sandbox draft store key")

        // A relaunch within the same test (XCUITest `open(_:)`) carries the
        // same token and keeps the workout that test started.
        var started = draft(mode: .live, date: "2026-10-08", areas: ["shoulders"])
        started.id = "started-in-test-1"
        sandbox.save(started)
        XCTAssertFalse(SandboxTrainingUITestIsolation.applyIfRequested(
            arguments: [SandboxTrainingUITestIsolation.argument, "test-1"], defaults: defaults, attachments: attachments))
        XCTAssertEqual(sandbox.loadAll().map(\.id), [started.id])
        // The next test's token resets again.
        XCTAssertTrue(SandboxTrainingUITestIsolation.applyIfRequested(
            arguments: [SandboxTrainingUITestIsolation.argument, "test-2"], defaults: defaults, attachments: attachments))
        XCTAssertTrue(sandbox.loadAll().isEmpty)
    }

    @MainActor
    func testMultipleSameDayDraftsStartResumeAndDiscardByExactIdentity() async throws {
        var first = draft(mode: .past, date: "2026-09-16", areas: ["biceps"])
        first.id = "same-day-first"
        var second = draft(mode: .past, date: "2026-09-16", areas: ["triceps"])
        second.id = "same-day-second"
        let store = MemoryTrainingLoggerDraftStore(drafts: [first, second])
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: store)
        await viewModel.load()

        XCTAssertEqual(Set(viewModel.savedDrafts.map(\.id)), [first.id, second.id])
        viewModel.resume(draftId: second.id)
        XCTAssertEqual(viewModel.draft?.id, second.id)
        XCTAssertEqual(viewModel.draft?.selectedAreaIds, ["triceps"])

        viewModel.discardSavedDraft(draftId: first.id)
        XCTAssertEqual(store.loadAll().map(\.id), [second.id])
        XCTAssertEqual(viewModel.draft?.id, second.id, "Discarding a sibling must not disturb the resumed draft.")

        viewModel.start(mode: .past, date: try XCTUnwrap(Self.testDate("2026-09-16T07:20:00Z")))
        let thirdId = try XCTUnwrap(viewModel.draft?.id)
        XCTAssertNotEqual(thirdId, second.id)
        XCTAssertEqual(Set(store.loadAll().map(\.id)), [second.id, thirdId])
    }

    @MainActor
    func testStartingLiveWorkoutWithExistingDraftCreatesIndependentPersistedIdentity() async throws {
        var saved = draft(mode: .past, date: "2026-09-15", areas: ["shoulders"])
        saved.id = "preserved-sep-15"
        let store = MemoryTrainingLoggerDraftStore(draft: saved)
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: store)
        await viewModel.load()

        let liveStart = try XCTUnwrap(Self.testDate("2026-09-16T14:20:00Z"))
        viewModel.start(mode: .live, date: liveStart)

        let live = try XCTUnwrap(viewModel.draft)
        XCTAssertNotEqual(live.id, saved.id)
        XCTAssertEqual(live.workoutDate, "2026-09-16")
        XCTAssertNotNil(live.startedAt)
        XCTAssertEqual(Set(store.loadAll().map(\.id)), [saved.id, live.id])
        XCTAssertEqual(store.loadAll().first(where: { $0.id == saved.id }), saved, "Starting live must never overwrite or inherit the saved draft.")
    }

    func testDraftAttachmentsAndIdempotencyAreExactIdentityScoped() throws {
        let attachments = MemoryTrainingLoggerAttachmentStore()
        let first = try attachments.save(data: Data([1]), draftId: "draft-a", assetId: "shared-name", displayName: "Workout.png")
        let second = try attachments.save(data: Data([2]), draftId: "draft-b", assetId: "shared-name", displayName: "Workout.png")
        XCTAssertNotEqual(first, second)
        attachments.removeAll(draftId: "draft-a")
        XCTAssertThrowsError(try attachments.load(reference: first))
        XCTAssertEqual(try attachments.load(reference: second), Data([2]))

        let suite = "TrainingLoggerIdempotencyIsolation.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let keys = ProductionIdempotencyKeyStore(defaults: defaults)
        let keyA = keys.resolvedKey(scope: "training-session.draft-a", signature: "same-payload")
        let keyB = keys.resolvedKey(scope: "training-session.draft-b", signature: "same-payload")
        XCTAssertNotEqual(keyA, keyB)
        XCTAssertEqual(keys.resolvedKey(scope: "training-session.draft-a", signature: "same-payload"), keyA)
    }

    @MainActor
    func testSavedDraftCardsUseTrustworthyDateTimeCategoryAndExerciseCount() async throws {
        let config = try await FixtureTrainingLoggerAPI().fetchConfiguration()
        var saved = TrainingLoggerDraft.fresh(
            mode: .live,
            workoutDate: "2026-09-15",
            startedAt: "2026-09-16T00:36:00Z"
        )
        saved.id = "presentation-draft"
        saved.selectedAreaIds = ["shoulders"]
        saved.addExercise(try XCTUnwrap(config.exercises.first { $0.areaId == "shoulders" }))
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: MemoryTrainingLoggerDraftStore(draft: saved))
        await viewModel.load()

        let presentation = viewModel.savedDraftPresentation(saved)
        XCTAssertEqual(presentation.date, "Sep 15")
        XCTAssertNotNil(presentation.time)
        XCTAssertEqual(presentation.detail, "Shoulders · 1 exercise")
    }

    @MainActor
    func testSuggestedTodayUsesServerOwnedMultiCategoryCombinationAndRemainsOverridable() async throws {
        struct SuggestionAPI: TrainingLoggerAPI {
            var base: TrainingLoggerConfiguration
            func fetchConfiguration() async throws -> TrainingLoggerConfiguration { base }
        }
        var config = try await FixtureTrainingLoggerAPI().fetchConfiguration()
        config.categorySuggestion = .init(
            id: "confirmed_history_3_biceps_triceps",
            date: TrainingLoggerViewModel.dateKey(Date()),
            label: "Biceps + Triceps",
            categoryIds: ["biceps", "triceps"],
            reason: "Repeated on Wednesdays across 6 confirmed workouts",
            source: "confirmed_training_evidence_history",
            historyReferences: (1...6).map { "session-\($0)" }
        )
        let viewModel = TrainingLoggerViewModel(api: SuggestionAPI(base: config), draftStore: MemoryTrainingLoggerDraftStore())
        await viewModel.load()
        viewModel.start(mode: .live)
        let originalSuggestion = try XCTUnwrap(viewModel.availableCategorySuggestion)
        XCTAssertEqual(originalSuggestion.label, "Biceps + Triceps")
        XCTAssertFalse(viewModel.isCategorySuggestionAccepted)
        XCTAssertFalse(viewModel.isAreaSelected("biceps"))
        XCTAssertFalse(viewModel.isAreaSelected("triceps"))

        // The card action selects the exact same canonical draft fields read
        // by the corresponding Training Area tiles.
        viewModel.toggleCategorySuggestion()
        XCTAssertEqual(viewModel.draft?.selectedAreaIds, ["biceps", "triceps"])
        XCTAssertTrue(viewModel.isCategorySuggestionAccepted)
        XCTAssertTrue(viewModel.isAreaSelected("biceps"))
        XCTAssertTrue(viewModel.isAreaSelected("triceps"))

        // Toggling a tile immediately updates the card's selected state.
        viewModel.update { $0.toggleArea("triceps") }
        XCTAssertEqual(viewModel.draft?.selectedAreaIds, ["biceps"], "Founder override must remain authoritative.")
        XCTAssertFalse(viewModel.isCategorySuggestionAccepted)
        XCTAssertTrue(viewModel.isAreaSelected("biceps"))
        XCTAssertFalse(viewModel.isAreaSelected("triceps"))
        viewModel.update { $0.toggleArea("triceps") }
        XCTAssertTrue(viewModel.isCategorySuggestionAccepted)

        // Tapping the selected card applies the same multi-select toggles and
        // both the card and its tiles become unselected from one draft state.
        viewModel.toggleCategorySuggestion()
        XCTAssertEqual(viewModel.draft?.selectedAreaIds, [])
        XCTAssertFalse(viewModel.isCategorySuggestionAccepted)
        XCTAssertFalse(viewModel.isAreaSelected("biceps"))
        XCTAssertFalse(viewModel.isAreaSelected("triceps"))
        XCTAssertEqual(viewModel.availableCategorySuggestion, originalSuggestion, "Selection must not mutate suggestion calculation or evidence.")
    }

    func testSuggestedTodaySelectionControlHasExplicitAccessibleStatesAndCanonicalWiring() throws {
        let unselected = TrainingLoggerSuggestedAreaSelectionPresentation(
            suggestionLabel: "Shoulders",
            isSelected: false
        )
        XCTAssertEqual(unselected.systemImage, "circle")
        XCTAssertEqual(unselected.accessibilityLabel, "Select suggested Shoulders")
        XCTAssertEqual(unselected.accessibilityValue, "Not selected")
        XCTAssertGreaterThanOrEqual(TrainingLoggerSuggestedAreaSelectionPresentation.minimumControlTarget, 44)

        let selected = TrainingLoggerSuggestedAreaSelectionPresentation(
            suggestionLabel: "Shoulders",
            isSelected: true
        )
        XCTAssertEqual(selected.systemImage, "checkmark.circle.fill")
        XCTAssertEqual(selected.accessibilityLabel, "Deselect suggested Shoulders")
        XCTAssertEqual(selected.accessibilityValue, "Selected")

        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let view = try String(
            contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(view.contains("action: { viewModel.toggleCategorySuggestion() }"))
        XCTAssertTrue(view.contains("let selected = viewModel.isAreaSelected(area.id)"))
    }

    @MainActor
    func testSuggestedTodaySelectionControlRendersDarkAndMineralUnselectedAndSelected() throws {
        let suggestion = TrainingLoggerCategorySuggestion(
            id: "review-shoulders",
            date: "2026-10-06",
            label: "Shoulders",
            categoryIds: ["shoulders"],
            reason: "Repeated on Tuesdays across confirmed workouts",
            source: "confirmed_training_evidence_history",
            historyReferences: ["session-1", "session-2", "session-3"]
        )
        let directory = ProcessInfo.processInfo.environment["BUILD89_LOGGER_SCREENSHOT_DIR"].map {
            URL(fileURLWithPath: $0, isDirectory: true)
        }
        if let directory {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }

        for (appearance, scheme) in [("dark", ColorScheme.dark), ("light", ColorScheme.light)] {
            for selected in [false, true] {
                let state = selected ? "selected" : "unselected"
                let surface = VStack(alignment: .leading, spacing: 12) {
                    Text("WHAT ARE YOU TRAINING?")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    TrainingLoggerSuggestedAreaCard(
                        suggestion: suggestion,
                        isSelected: selected,
                        action: {}
                    )
                    HStack(spacing: 9) {
                        TrainingLoggerAreaChoiceLabel(title: "Shoulders", isSelected: selected)
                        TrainingLoggerAreaChoiceLabel(title: "Biceps", isSelected: false)
                    }
                }
                .padding(16)
                .frame(width: 390)
                .fixedSize(horizontal: false, vertical: true)
                .background(PhysiqueOSTheme.redesignCanvas)
                .environment(\.colorScheme, scheme)

                let renderer = ImageRenderer(content: surface)
                renderer.scale = 3
                let image = try XCTUnwrap(renderer.uiImage)
                let data = try XCTUnwrap(image.pngData())
                XCTAssertGreaterThan(data.count, 12_000, "\(appearance) \(state) render was unexpectedly empty")
                let attachment = XCTAttachment(image: image)
                attachment.name = "C5-logger-suggested-\(appearance)-\(state)"
                attachment.lifetime = .keepAlways
                add(attachment)
                if let directory {
                    try data.write(
                        to: directory.appendingPathComponent("C5-logger-suggested-\(appearance)-\(state).png"),
                        options: .atomic
                    )
                }
            }
        }
    }

    @MainActor
    func testInsufficientHistorySuggestionIsAbsent() async {
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: MemoryTrainingLoggerDraftStore())
        await viewModel.load()
        viewModel.start(mode: .live)
        XCTAssertNil(viewModel.availableCategorySuggestion)
    }

    private static func testDate(_ value: String) -> Date? { ISO8601DateFormatter().date(from: value) }

    @MainActor
    func testSaveAndLeavePersistsWhileCancelDiscardsLocalDraft() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(api: api, draftStore: store)
        await viewModel.load()
        viewModel.start(mode: .live)
        XCTAssertNotNil(store.load())
        viewModel.persist()
        XCTAssertNotNil(store.load(), "Save & Leave must retain the current device-only draft.")
        viewModel.cancelWorkout()
        XCTAssertNil(store.load(), "Cancel must intentionally discard the local draft.")
        XCTAssertNil(viewModel.draft)
        XCTAssertNil(viewModel.savedDraft)
    }

    func testSummaryCountsOnlyCompletedSetsAndRealContext() async throws {
        let config = try await configuration()
        var draft = draft()
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" }))
        draft.exercises[0].sets[0].isCompleted = true
        draft.exercises[1].sets[0].isCompleted = true
        draft.applyVariant(config.variants[0], to: draft.exercises[0].id, catalog: config.exercises)
        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: config.exercises)
        XCTAssertEqual(draft.summary(), .init(exerciseCount: 2, completedSetCount: 2, variantCount: 1, supersetCount: 1))
    }

    // MARK: - Build 21: Save & Leave draft survives a full reopen, attachments included

    /// Reproduces "reopen the app after Save & Leave" with two independently
    /// constructed view models sharing only the on-disk-shaped draft store
    /// (never the same in-memory instance) — the first view model's process
    /// is gone by the time the second one calls `load()`/`resume()`, exactly
    /// like a real relaunch. Every field needed to resume exactly (date,
    /// exercise identity/ordering, sets, reps, load, variant, superset
    /// relationship, and a pending screenshot attachment) must survive.
    @MainActor
    func testResumeAfterReopenRestoresCompleteDraftIncludingPendingAttachments() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let first = TrainingLoggerViewModel(api: api, draftStore: store, authority: .sandbox)
        await first.load()
        first.start(mode: .live)
        first.update { $0.workoutDate = "2026-08-30" }
        let config = try await api.fetchConfiguration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable_fly" })
        first.update {
            $0.addExercise(bench)
            $0.addExercise(fly)
            $0.applyVariant(config.variants[1], to: $0.exercises[0].id, catalog: config.exercises)
            $0.setSuperset(firstId: $0.exercises[0].id, secondId: $0.exercises[1].id, catalog: config.exercises)
            $0.exercises[0].sets[0].reps = 11
            $0.exercises[0].sets[0].load = 155
            $0.addSupportingEvidence([TrainingLoggerSupportingEvidence(id: "asset-1", displayName: "IMG_0001.jpg", source: .photos)])
        }
        let persisted = try XCTUnwrap(first.draft)

        // Simulate the app being reopened: a brand-new view model, backed by
        // the same durable store, with no in-memory link to `first`.
        let reopened = TrainingLoggerViewModel(api: api, draftStore: store, authority: .sandbox)
        await reopened.load()
        XCTAssertEqual(reopened.savedDraft, persisted, "Reopening must see the exact persisted draft before resume() is even called.")
        reopened.resume()
        XCTAssertEqual(reopened.draft, persisted)
        XCTAssertEqual(reopened.draft?.workoutDate, "2026-08-30")
        XCTAssertEqual(reopened.draft?.exercises.map(\.id), persisted.exercises.map(\.id))
        XCTAssertEqual(reopened.draft?.relationships, persisted.relationships)
        XCTAssertEqual(reopened.draft?.supportingEvidenceAssets, persisted.supportingEvidenceAssets)
        XCTAssertEqual(reopened.draft?.exercises.first?.sets.first?.reps, 11)
        XCTAssertEqual(reopened.draft?.exercises.first?.sets.first?.load, 155)
    }

    @MainActor
    func testResumeAfterReopenRetainsPrivateAttachmentBytesForCanonicalUpload() async throws {
        let draftStore = MemoryTrainingLoggerDraftStore()
        let attachmentStore = MemoryTrainingLoggerAttachmentStore()
        let first = TrainingLoggerViewModel(
            api: api, draftStore: draftStore, attachmentStore: attachmentStore, authority: .founderProduction
        )
        await first.load()
        first.start(mode: .live)
        first.update {
            $0.addSupportingEvidence([
                TrainingLoggerSupportingEvidence(id: "asset-private", displayName: "Workout.png", source: .photos),
            ])
        }
        try first.retainSupportingEvidence(
            assetId: "asset-private", data: Data([0x89, 0x50, 0x4E, 0x47]), contentType: "image/png"
        )
        let reference = try XCTUnwrap(first.draft?.supportingEvidenceAssets.first?.storageReference)

        let reopened = TrainingLoggerViewModel(
            api: api, draftStore: draftStore, attachmentStore: attachmentStore, authority: .founderProduction
        )
        await reopened.load()
        reopened.resume()

        XCTAssertEqual(reopened.draft?.supportingEvidenceAssets.first?.storageReference, reference)
        XCTAssertEqual(try attachmentStore.load(reference: reference), Data([0x89, 0x50, 0x4E, 0x47]))
    }

    // MARK: - Build 21: submission outcome controls draft lifecycle

    @MainActor
    func testSaveAndLeaveMarksTheDraftLeftAndResumingClearsIt() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: StubSucceedingTrainingWriteAPI(), draftStore: store, authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        let id = try XCTUnwrap(viewModel.draft?.id)
        viewModel.saveAndLeave()
        XCTAssertNotNil(store.loadAll().first { $0.id == id }?.leftAt)
        viewModel.resume(draftId: id)
        XCTAssertNil(viewModel.draft?.leftAt, "Resuming makes it the in-progress workout again.")
    }

    private static func record(
        _ id: String,
        exerciseId: String = "bench_press",
        exercise: String = "Bench Press",
        type: TrainingPerformanceEventType = .sessionVolumePR,
        title: String = "Session volume record",
        value: String = "4,200 lb"
    ) -> TrainingPerformanceRecord {
        TrainingPerformanceRecord(
            id: "training_library_record_\(id)", canonicalExerciseId: exerciseId, canonicalExerciseName: exercise,
            title: title, value: value, previousBaseline: "Previous: 4,000 lb",
            improvement: "Improved by 200 lb", detail: "Previous: 4,000 lb · Improved by 200 lb",
            workoutDate: "2026-09-28", executionVariant: nil, relationshipContext: nil,
            achievedValue: 4200, achievementType: type, sourceEventId: "training_performance_event_\(id)"
        )
    }

    /// Durable commit whose result carries (or omits) the Server's records,
    /// with a separate session read-back for the fallback path.
    private actor RecordsTrainingWriteAPI: TrainingWriteAPI {
        let resultRecords: TrainingSessionPerformanceRecords?
        let readBackRecords: [TrainingPerformanceRecord]?
        private(set) var readBacks = 0
        init(resultRecords: TrainingSessionPerformanceRecords?, readBackRecords: [TrainingPerformanceRecord]?) {
            self.resultRecords = resultRecords
            self.readBackRecords = readBackRecords
        }
        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            TrainingCommitResult(status: "durable", reviewId: nil, reviewRevision: nil, sessionId: draft.id,
                                 intendedDate: draft.workoutDate, exerciseIds: [], performanceRecords: resultRecords)
        }
        func sessionPerformanceRecords(for draft: TrainingLoggerDraft) async -> [TrainingPerformanceRecord]? {
            readBacks += 1
            return readBackRecords
        }
    }

    private actor RetryRecordsTrainingWriteAPI: TrainingWriteAPI {
        struct Failure: LocalizedError {
            var errorDescription: String? { "This workout could not be saved." }
        }

        let record: TrainingPerformanceRecord
        private var attempts = 0

        init(record: TrainingPerformanceRecord) { self.record = record }

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            attempts += 1
            if attempts == 1 { throw Failure() }
            return TrainingCommitResult(
                status: "durable", reviewId: nil, reviewRevision: nil,
                sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: [],
                performanceRecords: .init(status: "completed", records: [record])
            )
        }
    }

    private actor RecoveredRecordsTrainingWriteAPI: TrainingWriteAPI {
        let records: [TrainingPerformanceRecord]

        init(records: [TrainingPerformanceRecord]) { self.records = records }

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            TrainingCommitResult(
                status: "accepted_processing", reviewId: nil, reviewRevision: nil,
                sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: []
            )
        }

        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { true }

        func sessionPerformanceRecords(for draft: TrainingLoggerDraft) async -> [TrainingPerformanceRecord]? {
            records
        }
    }

    private actor DelayedRecordsTrainingWriteAPI: TrainingWriteAPI {
        let record: TrainingPerformanceRecord

        init(record: TrainingPerformanceRecord) { self.record = record }

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            TrainingCommitResult(
                status: "durable", reviewId: nil, reviewRevision: nil,
                sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: []
            )
        }

        func sessionPerformanceRecords(for draft: TrainingLoggerDraft) async -> [TrainingPerformanceRecord]? {
            try? await Task.sleep(for: .milliseconds(50))
            return [record]
        }
    }

    @MainActor
    func testCompletionShowsTheServersRecordsFromTheCommitResult() async throws {
        let records = [
            Self.record("a"),
            Self.record("b", exerciseId: "back_squat", exercise: "Squat"),
        ]
        let writeAPI = RecordsTrainingWriteAPI(resultRecords: .init(status: "completed", records: records), readBackRecords: nil)
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, draftStore: store, authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        await viewModel.submit()
        XCTAssertEqual(viewModel.completedPerformanceRecords, records)
        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true,
                       "The presentation survives navigation until the Founder acknowledges it.")
        let readBacks = await writeAPI.readBacks
        XCTAssertEqual(readBacks, 0, "An authoritative commit result needs no read-back.")
    }

    @MainActor
    func testCompletionShowsOneAuthoritativeRecord() async throws {
        let record = Self.record("only")
        let writeAPI = RecordsTrainingWriteAPI(
            resultRecords: .init(status: "completed", records: [record]),
            readBackRecords: nil
        )
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI,
            draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()

        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertEqual(viewModel.completedPerformanceRecords, [record])
    }

    @MainActor
    func testCompletionWithNoNewRecordShowsNothing() async throws {
        let writeAPI = RecordsTrainingWriteAPI(resultRecords: .init(status: "completed", records: []), readBackRecords: [Self.record("x")])
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        await viewModel.submit()
        XCTAssertTrue(viewModel.completedPerformanceRecords.isEmpty, "No record: no section, no confetti.")
    }

    @MainActor
    func testCompletionFallsBackToTheSessionReadWhenTheResultHasNoRecords() async throws {
        let writeAPI = RecordsTrainingWriteAPI(resultRecords: .init(status: "deferred", records: []), readBackRecords: [Self.record("late")])
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: writeAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        await viewModel.submit()
        for _ in 0..<50 where viewModel.completedPerformanceRecords.isEmpty { try await Task.sleep(nanoseconds: 10_000_000) }
        XCTAssertEqual(viewModel.completedPerformanceRecords.map(\.id), ["training_library_record_late"])
    }

    @MainActor
    func testRecoveredDurableCompletionLoadsAuthoritativeSessionRecords() async throws {
        let record = Self.record("recovered")
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecoveredRecordsTrainingWriteAPI(records: [record]),
            draftStore: MemoryTrainingLoggerDraftStore(),
            authority: .founderProduction,
            durabilityRecoveryMaxAttempts: 2,
            durabilityRecoveryDelay: .milliseconds(1)
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()
        for _ in 0..<50 where viewModel.draft?.step != .complete || viewModel.completedPerformanceRecords.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertEqual(viewModel.completedPerformanceRecords, [record])
    }

    @MainActor
    func testRelaunchRestoresProvenDurableCompletionWithAuthoritativeRecords() async throws {
        var pending = draft()
        pending.submissionState = .acceptedProcessing
        let store = MemoryTrainingLoggerDraftStore(draft: pending)
        let record = Self.record("reopened")
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecoveredRecordsTrainingWriteAPI(records: [record]),
            draftStore: store,
            authority: .founderProduction
        )

        await viewModel.load()
        for _ in 0..<50 where viewModel.completedPerformanceRecords.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true,
                       "Canonical durability converts the retry draft into a durable pending presentation.")
        XCTAssertEqual(viewModel.draft?.id, pending.id)
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertNil(viewModel.draft?.submissionState)
        XCTAssertEqual(viewModel.completedPerformanceRecords, [record])
    }

    @MainActor
    func testAcknowledgingCompletionIsTheOnlyPointThatClearsThePendingPresentation() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let record = Self.record("acknowledged")
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecordsTrainingWriteAPI(
                resultRecords: .init(status: "completed", records: [record]),
                readBackRecords: nil
            ),
            draftStore: store,
            authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        await viewModel.submit()

        XCTAssertNotNil(store.load())
        viewModel.acknowledgeCompletion()

        XCTAssertNil(store.load())
        XCTAssertNil(viewModel.draft)
        XCTAssertTrue(viewModel.completedPerformanceRecords.isEmpty)
    }

    @MainActor
    func testPendingCompletionSurvivesViewModelRecreationAndReadsRecordsAgain() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let record = Self.record("after-navigation")
        let first = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecordsTrainingWriteAPI(
                resultRecords: .init(status: "completed", records: [record]),
                readBackRecords: [record]
            ),
            draftStore: store,
            authority: .founderProduction
        )
        await first.load()
        first.start(mode: .live)
        let draftID = try XCTUnwrap(first.draft?.id)
        await first.submit()

        let recreated = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecordsTrainingWriteAPI(resultRecords: nil, readBackRecords: [record]),
            draftStore: store,
            authority: .founderProduction
        )
        await recreated.load()
        for _ in 0..<50 where recreated.completedPerformanceRecords.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(recreated.draft?.id, draftID)
        XCTAssertEqual(recreated.draft?.step, .complete)
        XCTAssertEqual(recreated.completedPerformanceRecords, [record])
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
    }

    /// Integration with the Log-tab routing: a relaunch-recovered completion of
    /// an earlier workout never hides the workout in progress -- resuming it
    /// (what the Log-tab hint does) switches to it and drops the old records.
    @MainActor
    func testResumingTheInProgressWorkoutReplacesARecoveredEarlierCompletion() async throws {
        var submitted = draft()
        submitted.submissionState = .acceptedProcessing
        var inProgress = TrainingLoggerDraft.fresh(mode: .live, workoutDate: submitted.workoutDate,
                                                   startedAt: ISO8601DateFormatter().string(from: Date()))
        inProgress.step = .workout
        let store = MemoryTrainingLoggerDraftStore(draft: submitted)
        store.save(inProgress)
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: DurableDraftIDsProbeTrainingWriteAPI(durableIDs: [submitted.id]),
            draftStore: store,
            authority: .founderProduction
        )
        await viewModel.load()
        XCTAssertEqual(viewModel.draft?.id, submitted.id)
        XCTAssertEqual(viewModel.draft?.step, .complete)

        viewModel.resume(draftId: inProgress.id)
        XCTAssertEqual(viewModel.draft?.id, inProgress.id)
        XCTAssertEqual(viewModel.draft?.step, .workout)
        XCTAssertTrue(viewModel.completedPerformanceRecords.isEmpty)
    }

    @MainActor
    func testFailureAndRetryCannotCelebrateBeforeAuthoritativeSuccess() async throws {
        let suite = "celebration-retry-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let record = Self.record("retry")
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: RetryRecordsTrainingWriteAPI(record: record),
            draftStore: MemoryTrainingLoggerDraftStore(),
            authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        let key = "retry-session"

        await viewModel.submit()

        XCTAssertNotEqual(viewModel.draft?.step, .complete)
        XCTAssertTrue(viewModel.completedPerformanceRecords.isEmpty)
        XCTAssertFalse(
            WorkoutCelebrationGate.claim(key: key, hasRecords: false, reduceMotion: false, defaults: defaults),
            "A failed commit has no authoritative record result and cannot celebrate."
        )

        await viewModel.submit()

        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertEqual(viewModel.completedPerformanceRecords, [record])
        XCTAssertTrue(WorkoutCelebrationGate.claim(key: key, hasRecords: true, reduceMotion: false, defaults: defaults))
    }

    @MainActor
    func testStartingAnotherWorkoutClearsRecordsAndRejectsLatePriorReadback() async throws {
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: DelayedRecordsTrainingWriteAPI(record: Self.record("late-prior")),
            draftStore: MemoryTrainingLoggerDraftStore(),
            authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        let firstId = try XCTUnwrap(viewModel.draft?.id)
        await viewModel.submit()
        XCTAssertEqual(viewModel.draft?.id, firstId)
        XCTAssertEqual(viewModel.draft?.step, .complete)

        viewModel.start(mode: .live)
        XCTAssertNotEqual(viewModel.draft?.id, firstId)
        XCTAssertTrue(viewModel.completedPerformanceRecords.isEmpty)
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertTrue(
            viewModel.completedPerformanceRecords.isEmpty,
            "A late authoritative read for the prior session cannot leak onto the next workout."
        )
    }

    func testRecordsDecodeLossilyAndNeverBreakADurableCommitResult() throws {
        let json = Data(#"""
        {"status":"durable","sessionId":"d1","intendedDate":"2026-09-28","exerciseIds":[],
         "performanceRecords":{"status":"completed","records":[
           {"id":"r1","sourceEventId":"e1","canonicalExerciseId":"pull_up","canonicalExerciseName":"Pull-Ups","achievementType":"session_volume_pr",
            "title":"Session volume record","value":"675 lb","previousBaseline":"Previous: 600 lb","improvement":"Improved by 75 lb",
            "detail":"Previous: 600 lb · Improved by 75 lb","workoutDate":"2026-09-28","achievedValue":675,"orderingKey":"x"},
           {"id":"r2","achievementType":"a_future_record_type","title":"?"},
           42]}}
        """#.utf8)
        let result = try JSONDecoder().decode(TrainingCommitResult.self, from: json)
        XCTAssertTrue(result.isDurable)
        XCTAssertEqual(result.performanceRecords?.isAuthoritative, true)
        XCTAssertEqual(result.performanceRecords?.records.map(\.id), ["r1"])
        let older = try JSONDecoder().decode(TrainingCommitResult.self, from: Data(#"{"status":"durable","sessionId":"d1","intendedDate":"2026-09-28","exerciseIds":[]}"#.utf8))
        XCTAssertNil(older.performanceRecords, "An older Server/receipt simply has no records field.")
        let garbage = try JSONDecoder().decode(TrainingCommitResult.self, from: Data(#"{"status":"durable","sessionId":"d1","intendedDate":"2026-09-28","exerciseIds":[],"performanceRecords":"nope"}"#.utf8))
        XCTAssertEqual(garbage.performanceRecords?.isAuthoritative, false)
    }

    func testRecordsCardGroupsMultipleRecordsForOneCanonicalExercise() {
        let records = [
            Self.record("volume"),
            Self.record(
                "reps-125", type: .repsAtLoadPR,
                title: "Reps-at-load record", value: "13 reps at 125 lb"
            ),
            Self.record(
                "reps-135", type: .repsAtLoadPR,
                title: "Reps-at-load record", value: "10 reps at 135 lb"
            ),
        ]
        let presentation = NewPerformanceRecordsPresentation(records: records, visibleLimit: 3)

        XCTAssertEqual(presentation.groups.count, 1, "One canonical exercise name is shown once, not repeated per event.")
        XCTAssertEqual(presentation.groups[0].canonicalExerciseId, "bench_press")
        XCTAssertEqual(presentation.groups[0].records, records, "Canonical Server order and record types stay intact.")
        XCTAssertNil(presentation.moreLabel)
    }

    func testRecordsCardUsesCanonicalIdentityInsteadOfDisplayName() {
        let records = [
            Self.record("a", exerciseId: "curl_machine_a", exercise: "Curl Machine"),
            Self.record("b", exerciseId: "curl_machine_b", exercise: "Curl Machine"),
        ]
        let presentation = NewPerformanceRecordsPresentation(records: records, visibleLimit: 3)

        XCTAssertEqual(presentation.groups.map(\.canonicalExerciseId), ["curl_machine_a", "curl_machine_b"])
        XCTAssertEqual(presentation.groups.map(\.canonicalExerciseName), ["Curl Machine", "Curl Machine"])
    }

    func testRecordsCardPreservesCanonicalRecordTypePresentation() {
        let records = [
            Self.record("volume"),
            Self.record(
                "reps", type: .repsAtLoadPR,
                title: "Reps-at-load record", value: "13 reps at 125 lb"
            ),
        ]
        let presented = NewPerformanceRecordsPresentation(records: records, visibleLimit: 3).groups[0].records

        XCTAssertEqual(presented.map(\.achievementType), [.sessionVolumePR, .repsAtLoadPR])
        XCTAssertEqual(presented.map(\.title), ["Session volume record", "Reps-at-load record"])
        XCTAssertEqual(presented.map(\.value), ["4,200 lb", "13 reps at 125 lb"])
    }

    func testRecordsCardShowsTheFirstFewAndSummarizesTheRest() {
        let many = (1...5).map {
            Self.record("r\($0)", exerciseId: "exercise_\($0)", exercise: "Exercise \($0)")
        }
        let presentation = NewPerformanceRecordsPresentation(records: many, visibleLimit: 3)
        XCTAssertEqual(
            presentation.groups.flatMap(\.records).map(\.id),
            ["training_library_record_r1", "training_library_record_r2", "training_library_record_r3"]
        )
        XCTAssertEqual(presentation.moreLabel, "+2 more records")
        XCTAssertEqual(NewPerformanceRecordsPresentation(records: Array(many.prefix(4)), visibleLimit: 3).moreLabel, "+1 more record")
        XCTAssertNil(NewPerformanceRecordsPresentation(records: [Self.record("one")], visibleLimit: 3).moreLabel)
    }

    func testCelebrationRequiresRecordsAndPlaysOnlyOnceAcrossRecreation() {
        let suite = "celebration-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertFalse(WorkoutCelebrationGate.claim(key: "no-record", hasRecords: false, reduceMotion: false, defaults: defaults))
        XCTAssertTrue(WorkoutCelebrationGate.claim(key: "k1", hasRecords: true, reduceMotion: false, defaults: defaults))
        XCTAssertFalse(
            WorkoutCelebrationGate.claim(key: "k1", hasRecords: true, reduceMotion: false, defaults: defaults),
            "A recreated or reopened completion view never celebrates the same session again."
        )
        XCTAssertTrue(
            WorkoutCelebrationGate.claim(key: "k2", hasRecords: true, reduceMotion: false, defaults: defaults),
            "Each canonical session gets its own first presentation."
        )
        XCTAssertFalse(WorkoutCelebrationGate.claim(key: nil, hasRecords: true, reduceMotion: false, defaults: defaults))
    }

    func testHiddenPresentationCannotConsumeTheCelebration() {
        let suite = "celebration-hidden-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertFalse(
            WorkoutCelebrationGate.claim(
                key: "late-record", hasRecords: true, reduceMotion: false,
                presentationVisible: false, defaults: defaults
            )
        )
        XCTAssertTrue(
            WorkoutCelebrationGate.claim(
                key: "late-record", hasRecords: true, reduceMotion: false,
                presentationVisible: true, defaults: defaults
            ),
            "A record arriving while Home/Evidence is visible remains eligible when Workout Complete returns."
        )
    }

    func testReduceMotionConsumesTheOneShotWithoutAnimatingLater() {
        let suite = "celebration-reduce-motion-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertFalse(
            WorkoutCelebrationGate.claim(key: "k1", hasRecords: true, reduceMotion: true, defaults: defaults),
            "Reduce Motion suppresses confetti."
        )
        XCTAssertFalse(
            WorkoutCelebrationGate.claim(key: "k1", hasRecords: true, reduceMotion: false, defaults: defaults),
            "Turning Reduce Motion off after reopening must not replay the consumed celebration."
        )
    }

    func testBuild85ConfettiIsNoticeablyLargerButStillBrief() {
        XCTAssertEqual(PerformanceRecordConfettiStyle.particleCount, 36)
        XCTAssertGreaterThan(PerformanceRecordConfettiStyle.particleCount, 20)
        XCTAssertGreaterThanOrEqual(PerformanceRecordConfettiStyle.minimumParticleSize, 7)
        XCTAssertGreaterThanOrEqual(PerformanceRecordConfettiStyle.maximumParticleSize, 10)
        XCTAssertGreaterThan(PerformanceRecordConfettiStyle.horizontalBaseSpread, 55)
        XCTAssertLessThanOrEqual(PerformanceRecordConfettiStyle.duration, 1)
    }

    private struct StubSucceedingTrainingWriteAPI: TrainingWriteAPI {
        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            TrainingCommitResult(status: "durable", reviewId: "review-1", reviewRevision: 1, sessionId: draft.id, intendedDate: draft.workoutDate, exerciseIds: draft.exercises.map(\.id))
        }
    }

    private struct StubFailingTrainingWriteAPI: TrainingWriteAPI {
        struct Failure: LocalizedError { var errorDescription: String? { "This workout could not be saved." } }
        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult { throw Failure() }
    }

    private actor DraftCapturingTrainingWriteAPI: TrainingWriteAPI {
        private(set) var committedDraft: TrainingLoggerDraft?

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            committedDraft = draft
            return TrainingCommitResult(
                status: "durable", reviewId: nil, reviewRevision: nil,
                sessionId: draft.id, intendedDate: draft.workoutDate,
                exerciseIds: draft.exercises.map(\.id)
            )
        }
    }

    private struct DurableDraftProbeTrainingWriteAPI: TrainingWriteAPI {
        let isDurable: Bool
        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            throw StubFailingTrainingWriteAPI.Failure()
        }
        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { isDurable }
    }

    private struct DurableDraftIDsProbeTrainingWriteAPI: TrainingWriteAPI {
        let durableIDs: Set<String>
        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            throw StubFailingTrainingWriteAPI.Failure()
        }
        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { durableIDs.contains(draft.id) }
    }

    private actor AcceptedTrainingWriteAPI: TrainingWriteAPI {
        let becomesDurable: Bool
        let durableIDs: Set<String>?
        private(set) var commitCalls = 0

        init(becomesDurable: Bool, durableIDs: Set<String>? = nil) {
            self.becomesDurable = becomesDurable
            self.durableIDs = durableIDs
        }

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            commitCalls += 1
            return TrainingCommitResult(
                status: "accepted_processing", reviewId: nil, reviewRevision: nil,
                sessionId: draft.id, intendedDate: draft.workoutDate,
                exerciseIds: draft.exercises.map(\.id)
            )
        }

        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool {
            durableIDs?.contains(draft.id) ?? becomesDurable
        }
    }

    private actor DurableSupportingEvidenceProbe: TrainingWriteAPI {
        let durableIDs: Set<String>
        private(set) var reconciledIDs: [String] = []

        init(durableIDs: Set<String>) { self.durableIDs = durableIDs }

        func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
            throw StubFailingTrainingWriteAPI.Failure()
        }
        func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { durableIDs.contains(draft.id) }
        func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async {
            reconciledIDs.append(draft.id)
        }
    }

    @MainActor
    func testLoadClearsOnlyAnExactlyProvenDurableLegacyDraft() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let staleDraft = draft()
        store.save(staleDraft)
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: DurableDraftProbeTrainingWriteAPI(isDurable: true),
            draftStore: store,
            authority: .founderProduction
        )

        await viewModel.load()

        XCTAssertNil(store.load())
        XCTAssertNil(viewModel.savedDraft)
        XCTAssertEqual(viewModel.loadState, .loaded)
    }

    @MainActor
    func testLoadPreservesDraftWhenExactDurableIdentityCannotBeProven() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let unresolvedDraft = draft()
        store.save(unresolvedDraft)
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: DurableDraftProbeTrainingWriteAPI(isDurable: false),
            draftStore: store,
            authority: .founderProduction
        )

        await viewModel.load()

        XCTAssertEqual(store.load(), unresolvedDraft)
        XCTAssertEqual(viewModel.savedDraft, unresolvedDraft)
        XCTAssertEqual(viewModel.loadState, .loaded)
    }

    @MainActor
    func testStartupReconcilesOnlyExactDurableDraftAndPreservesSameDateSibling() async throws {
        var durable = draft(date: "2026-09-15", areas: ["shoulders"])
        durable.id = "durable-exact-id"
        var sibling = draft(date: "2026-09-15", areas: ["shoulders"])
        sibling.id = "legitimate-same-date-sibling"
        let store = MemoryTrainingLoggerDraftStore(drafts: [durable, sibling])
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: DurableDraftIDsProbeTrainingWriteAPI(durableIDs: [durable.id]),
            draftStore: store,
            authority: .founderProduction
        )

        await viewModel.load()

        XCTAssertEqual(store.loadAll().map(\.id), [sibling.id])
        XCTAssertEqual(viewModel.savedDrafts.map(\.id), [sibling.id])
    }

    @MainActor
    func testRelaunchContinuesExactTargetSupportingEvidenceAfterStructuredDraftBecomesDurable() async throws {
        var durable = draft(date: "2026-09-16", areas: ["biceps", "triceps"])
        durable.id = "durable-with-support"
        durable.supportingEvidence = [
            TrainingLoggerSupportingEvidence(
                id: "strength", displayName: "Strength.png", source: .photos,
                storageReference: "drafts/durable-with-support/strength", contentType: "image/png"
            ),
        ]
        var sibling = draft(date: "2026-09-16", areas: ["biceps", "triceps"])
        sibling.id = "same-date-sibling"
        let store = MemoryTrainingLoggerDraftStore(drafts: [durable, sibling])
        let writeAPI = DurableSupportingEvidenceProbe(durableIDs: [durable.id])
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, draftStore: store, authority: .founderProduction
        )

        await viewModel.load()
        for _ in 0..<100 {
            if !(await writeAPI.reconciledIDs).isEmpty { break }
            await Task.yield()
        }

        XCTAssertEqual(store.loadAll().map(\.id), [sibling.id])
        let reconciledIDs = await writeAPI.reconciledIDs
        XCTAssertEqual(reconciledIDs, [durable.id])
    }

    /// A successful canonical submission must replace the writable draft
    /// with a read-only pending completion. The exact identity remains only
    /// until the Founder acknowledges Workout Complete, so a navigation or
    /// process restart cannot lose late-arriving Server records.
    @MainActor
    func testSuccessfulSubmissionPersistsOnlyThePendingCompletion() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: StubSucceedingTrainingWriteAPI(), draftStore: store, authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        viewModel.update { $0.exercises = [] }
        XCTAssertNotNil(store.load())

        await viewModel.submit()

        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
        XCTAssertNil(viewModel.savedDraft, "A pending presentation is never a resumable saved workout.")
        XCTAssertNil(viewModel.validationMessage)
    }

    /// A failed canonical submission must preserve the exact draft so the
    /// Founder never loses in-progress work to a transient server/network
    /// failure — only success clears it.
    @MainActor
    func testFailedSubmissionPreservesThePersistedDraft() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let finish = try XCTUnwrap(Self.testDate("2026-09-23T14:56:31Z"))
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: StubFailingTrainingWriteAPI(), draftStore: store,
            authority: .founderProduction, now: { finish }
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()

        XCTAssertEqual(store.load()?.finishedAt, "2026-09-23T14:56:31Z")
        XCTAssertEqual(viewModel.draft?.finishedAt, "2026-09-23T14:56:31Z")
        XCTAssertNotNil(viewModel.validationMessage)
    }

    @MainActor
    func testLiveSubmissionPersistsAndSendsOneStableFinishedAtBeforeCommit() async throws {
        let start = try XCTUnwrap(Self.testDate("2026-09-23T13:53:26Z"))
        let finish = try XCTUnwrap(Self.testDate("2026-09-23T14:56:31Z"))
        let writeAPI = DraftCapturingTrainingWriteAPI()
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, draftStore: store,
            authority: .founderProduction, now: { finish }
        )
        await viewModel.load()
        viewModel.start(mode: .live, date: start)

        await viewModel.submit()

        let committed = await writeAPI.committedDraft
        XCTAssertEqual(committed?.startedAt, "2026-09-23T13:53:26Z")
        XCTAssertEqual(committed?.finishedAt, "2026-09-23T14:56:31Z")
        XCTAssertEqual(viewModel.draft?.finishedAt, committed?.finishedAt)
        XCTAssertEqual(viewModel.draft?.step, .complete)
    }

    @MainActor
    func testAcceptedProcessingSubmissionShowsHonestStateAndRetainsExactDraft() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let writeAPI = AcceptedTrainingWriteAPI(becomesDurable: false)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, draftStore: store, authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        let submittedID = try XCTUnwrap(viewModel.draft?.id)

        await viewModel.submit()

        XCTAssertEqual(store.loadAll().map(\.id), [submittedID])
        XCTAssertEqual(store.loadAll().first?.submissionState, .acceptedProcessing)
        XCTAssertTrue(viewModel.isAwaitingDurability)
        XCTAssertEqual(
            viewModel.processingMessage,
            "Finishing workout… PhysiqueOS has accepted it. You can safely leave while it finishes."
        )
        XCTAssertNil(viewModel.validationMessage)
    }

    @MainActor
    func testAcceptedSubmissionAutoClearsOnlyAfterExactDurabilityWithoutSecondCommit() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let writeAPI = AcceptedTrainingWriteAPI(becomesDurable: true)
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, draftStore: store, authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()
        for _ in 0..<100 where store.load()?.submissionState != nil {
            try? await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
        let commitCalls = await writeAPI.commitCalls
        XCTAssertEqual(commitCalls, 1, "Readback proof must resolve the accepted command without resubmitting it.")
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertNil(viewModel.processingMessage)
        XCTAssertNil(viewModel.validationMessage)
    }

    @MainActor
    func testRelaunchResolvesPersistedAcceptedDraftByExactIdentityWithoutReplay() async throws {
        var pending = draft(date: "2026-09-16", areas: ["biceps", "triceps"])
        pending.id = "accepted-persisted-draft"
        pending.submissionState = .acceptedProcessing
        let sibling = draft(date: "2026-09-16", areas: ["biceps", "triceps"])
        let store = MemoryTrainingLoggerDraftStore(drafts: [pending, sibling])
        let writeAPI = AcceptedTrainingWriteAPI(becomesDurable: true, durableIDs: [pending.id])
        let reopened = TrainingLoggerViewModel(
            api: api, writeAPI: writeAPI, draftStore: store, authority: .founderProduction
        )

        await reopened.load()

        XCTAssertEqual(Set(store.loadAll().map(\.id)), Set([pending.id, sibling.id]))
        XCTAssertEqual(reopened.savedDrafts.map(\.id), [sibling.id],
                       "The durable draft is no longer an editable session.")
        XCTAssertEqual(reopened.sessionAuthority.pendingCompletion(id: pending.id)?.step, .complete)
        XCTAssertEqual(store.loadAll().first(where: { $0.id == pending.id })?.completionPresentationPending, true)
        XCTAssertEqual(reopened.draft?.id, pending.id, "Workout Complete is presented for the exact recovered draft.")
        let commitCalls = await writeAPI.commitCalls
        XCTAssertEqual(commitCalls, 0)
    }

    // MARK: - Build 25: canonical commit success must be final regardless of a later refresh

    /// A `TrainingLoggerAPI` whose `fetchConfiguration()` succeeds up to
    /// `failFromCall` and then throws `error` on every call after — used to
    /// let `load()`'s configuration fetch succeed while `submit()`'s
    /// post-commit refresh fails, without touching the real network.
    private actor RefreshFailingTrainingLoggerAPI: TrainingLoggerAPI {
        private let fixture = FixtureTrainingLoggerAPI()
        private let failFromCall: Int
        private let error: Error
        private var callCount = 0
        init(failFromCall: Int, error: Error) {
            self.failFromCall = failFromCall
            self.error = error
        }
        func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
            callCount += 1
            if callCount >= failFromCall { throw error }
            return try await fixture.fetchConfiguration()
        }
    }

    @MainActor
    private func submittedDraftViewModel(
        refreshAPI: TrainingLoggerAPI, store: MemoryTrainingLoggerDraftStore
    ) -> TrainingLoggerViewModel {
        let viewModel = TrainingLoggerViewModel(
            api: refreshAPI, writeAPI: StubSucceedingTrainingWriteAPI(), draftStore: store, authority: .founderProduction
        )
        return viewModel
    }

    /// The baseline: commit succeeds, the post-success refresh also
    /// succeeds — everything behaves as before this fix.
    @MainActor
    func testCommitSucceedsAndConfigurationRefreshSucceeds() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = submittedDraftViewModel(refreshAPI: FixtureTrainingLoggerAPI(), store: store)
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()

        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
        XCTAssertNil(viewModel.savedDraft, "A pending presentation is never a resumable saved workout.")
        XCTAssertNil(viewModel.validationMessage)
        XCTAssertNil(viewModel.refreshWarning)
        XCTAssertEqual(viewModel.draft?.step, .complete)
    }

    /// The proven Build 24/25 defect: once `commit(draft)` has already
    /// succeeded, a plain network failure on the unrelated post-success
    /// `fetchConfiguration()` refresh must NOT be reported as "this workout
    /// could not be saved," and must NOT resurrect the local draft.
    @MainActor
    func testCommitSucceedsButConfigurationRefreshNetworkFailureIsNonDestructive() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = submittedDraftViewModel(
            refreshAPI: RefreshFailingTrainingLoggerAPI(failFromCall: 2, error: ProductionNativeError.networkFailure),
            store: store
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        XCTAssertNotNil(store.load())

        await viewModel.submit()

        XCTAssertEqual(store.load()?.step, .complete,
                       "A canonically-successful commit must retain only its pending completion if refresh fails.")
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
        XCTAssertNil(viewModel.savedDraft, "A pending presentation is never a resumable saved workout.")
        XCTAssertNil(viewModel.validationMessage, "A post-success refresh failure must never be reported as a submission failure.")
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertNotNil(viewModel.refreshWarning, "The refresh failure must surface as a separate, non-destructive notice.")
    }

    /// Same invariant when the refresh fails because of an expired/failed
    /// token refresh (401), the exact mechanism behind the real production
    /// incident ("PhysiqueOS could not be reached" after a real commit).
    @MainActor
    func testCommitSucceedsButConfigurationRefreshAuthFailureIsNonDestructive() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = submittedDraftViewModel(
            refreshAPI: RefreshFailingTrainingLoggerAPI(failFromCall: 2, error: ProductionNativeError.unauthenticated(nil)),
            store: store
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()

        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
        XCTAssertNil(viewModel.validationMessage)
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertNotNil(viewModel.refreshWarning)
    }

    /// Same invariant when the refresh simply times out.
    @MainActor
    func testCommitSucceedsButConfigurationRefreshTimeoutIsNonDestructive() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = submittedDraftViewModel(
            refreshAPI: RefreshFailingTrainingLoggerAPI(failFromCall: 2, error: URLError(.timedOut)),
            store: store
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()

        XCTAssertEqual(store.load()?.step, .complete)
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
        XCTAssertNil(viewModel.validationMessage)
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertNotNil(viewModel.refreshWarning)
    }

    /// A genuine commit failure (including a stale/idempotency conflict
    /// surfaced by the write API) must still report failure and must still
    /// preserve the draft — this fix must not weaken that existing
    /// invariant, only the unrelated post-success refresh.
    @MainActor
    func testActualCommitFailureStillReportsFailureAndPreservesDraft() async throws {
        struct ConflictFailure: LocalizedError {
            var errorDescription: String? { "The resource changed after it was loaded." }
        }
        struct ConflictWriteAPI: TrainingWriteAPI {
            func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult { throw ConflictFailure() }
        }
        let finish = try XCTUnwrap(Self.testDate("2026-09-23T14:56:31Z"))
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: ConflictWriteAPI(), draftStore: store,
            authority: .founderProduction, now: { finish }
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        await viewModel.submit()

        XCTAssertEqual(store.load()?.finishedAt, "2026-09-23T14:56:31Z")
        XCTAssertEqual(viewModel.draft?.finishedAt, "2026-09-23T14:56:31Z")
        XCTAssertEqual(viewModel.validationMessage, "The resource changed after it was loaded.")
        XCTAssertNil(viewModel.refreshWarning)
    }

    func testInteractivePopPolicyEnablesOnlyPushedDestinations() {
        XCTAssertFalse(InteractivePopGesturePolicy.shouldEnable(viewControllerCount: 1))
        XCTAssertTrue(InteractivePopGesturePolicy.shouldEnable(viewControllerCount: 2))
    }

    /// `CFBundleVersion` must be bumped in lockstep with
    /// `ios/Scripts/generate_project.py`'s `APP_BUILD_NUMBER` on every
    /// release; this assertion was last updated for Build 60 and needs the
    /// same one-line bump on the next release, exactly like that constant.
    func testAppDeclaresExemptEncryptionAndCurrentBuildInSourceControlledConfiguration() throws {
        let usesNonExemptEncryption = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool)
        XCTAssertFalse(usesNonExemptEncryption)
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String, "1.0")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String, "92")
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.physiqueos.native.dev")
    }
}

// MARK: - Build 78: Performance Record celebration lifecycle on the session authority

extension TrainingLoggerTests {
    @MainActor
    func testMultipleRecordsSurviveRelaunchFromThePersistedStoreUntilReturnToLog() async throws {
        let suite = "b78-relaunch-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let key = "b78.drafts"
        let records = [Self.record("a"), Self.record("b", exerciseId: "back_squat", exercise: "Squat")]
        let first = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecordsTrainingWriteAPI(resultRecords: .init(status: "completed", records: records), readBackRecords: records),
            draftStore: UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: key),
            authority: .founderProduction
        )
        await first.load()
        first.start(mode: .live)
        let id = try XCTUnwrap(first.draft?.id)
        await first.submit()
        XCTAssertEqual(first.completedPerformanceRecords, records)

        // A new process: fresh store object, fresh authority, fresh view model.
        let relaunched = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecordsTrainingWriteAPI(resultRecords: nil, readBackRecords: records),
            draftStore: UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: key),
            authority: .founderProduction
        )
        await relaunched.load()
        for _ in 0..<50 where relaunched.completedPerformanceRecords.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertEqual(relaunched.draft?.id, id)
        XCTAssertEqual(relaunched.draft?.step, .complete)
        XCTAssertEqual(relaunched.completedPerformanceRecords, records, "Authoritative records are re-read, never replayed from memory.")
        XCTAssertTrue(relaunched.savedDrafts.isEmpty, "The durable workout is never an editable session again.")
        XCTAssertEqual(relaunched.sessionAuthority.logTabRoutingTarget()?.id, id, "Log routes back to the owed Workout Complete.")

        relaunched.acknowledgeCompletion()
        XCTAssertNil(relaunched.draft)
        XCTAssertNil(relaunched.sessionAuthority.logTabRoutingTarget())
        XCTAssertTrue(UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: key).loadAll().isEmpty,
                      "Return to Log is the cleanup boundary.")

        let afterAcknowledge = TrainingLoggerViewModel(
            api: api, writeAPI: RecordsTrainingWriteAPI(resultRecords: nil, readBackRecords: records),
            draftStore: UserDefaultsTrainingLoggerDraftStore(defaults: defaults, key: key), authority: .founderProduction
        )
        await afterAcknowledge.load()
        XCTAssertNil(afterAcknowledge.draft, "An acknowledged completion never replays.")
    }

    @MainActor
    func testNoRecordCompletionIsStillOwedButHasNothingToCelebrate() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(
            api: api,
            writeAPI: RecordsTrainingWriteAPI(resultRecords: .init(status: "completed", records: []), readBackRecords: []),
            draftStore: store, authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        await viewModel.submit()
        XCTAssertEqual(viewModel.draft?.step, .complete)
        XCTAssertTrue(viewModel.completedPerformanceRecords.isEmpty)
        XCTAssertEqual(store.load()?.completionPresentationPending, true)
    }

    @MainActor
    func testLegacyDurableResidueWithoutTheSubmittedLifecycleNeverBecomesAPendingCelebration() async throws {
        var residue = draft(date: "2026-09-16", areas: ["biceps"])
        residue.id = "legacy-residue"
        let store = MemoryTrainingLoggerDraftStore(drafts: [residue])
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: AcceptedTrainingWriteAPI(becomesDurable: true, durableIDs: [residue.id]),
            draftStore: store, authority: .founderProduction
        )
        await viewModel.load()
        XCTAssertTrue(store.loadAll().isEmpty, "The legacy cleanup contract is preserved.")
        XCTAssertNil(viewModel.sessionAuthority.pendingCompletion())
    }

    @MainActor
    func testDurableCommitEndsTheLiveActivitySessionOnceAndCannotBeResurrected() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let authority = TrainingSessionAuthority(store: store, environment: .founderProduction)
        var changes: [TrainingSessionChange.Kind] = []
        let observation = authority.observeChanges { changes.append($0.kind) }
        defer { observation.cancel() }
        let viewModel = TrainingLoggerViewModel(
            api: api, writeAPI: StubSucceedingTrainingWriteAPI(), sessionAuthority: authority, authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live, date: Date())
        let id = try XCTUnwrap(viewModel.draft?.id)
        await viewModel.submit()

        XCTAssertEqual(changes.filter { $0 == .ended(.committed) }.count, 1,
                       "The Live Activity coordinator still sees exactly one committed end.")
        XCTAssertNil(authority.draft(id: id))
        XCTAssertNil(authority.liveActivitySubject(at: Date()), "A pending presentation is never a Live Activity subject.")
        XCTAssertNil(authority.activeLiveSession())
        XCTAssertEqual(authority.pendingCompletion()?.id, id)
        XCTAssertEqual(authority.endCommittedSession(sessionId: id, retainingPresentation: true), .rejected(.sessionEnded),
                       "A second recovery cannot create a second presentation.")

        var stale = try XCTUnwrap(authority.pendingCompletion(id: id))
        stale.step = .workout
        stale.completionPresentationPending = nil
        XCTAssertEqual(authority.replace(stale), .rejected(.sessionEnded),
                       "A late whole-draft write never resurrects the committed workout.")
        let relaunched = TrainingSessionAuthority(store: store, environment: .founderProduction)
        XCTAssertEqual(relaunched.replace(stale), .rejected(.sessionEnded), "Not after a relaunch either.")
        XCTAssertTrue(relaunched.drafts.isEmpty)
    }

    @MainActor
    func testRoutedResumeOfAPendingCompletionPresentsItAndReloadsRecords() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let record = Self.record("routed")
        let first = TrainingLoggerViewModel(
            api: api, writeAPI: RecordsTrainingWriteAPI(resultRecords: .init(status: "completed", records: [record]), readBackRecords: [record]),
            draftStore: store, authority: .founderProduction
        )
        await first.load()
        first.start(mode: .live)
        let id = try XCTUnwrap(first.draft?.id)
        await first.submit()

        // Same authority, a screen that already showed something else.
        let second = TrainingLoggerViewModel(
            api: api, writeAPI: RecordsTrainingWriteAPI(resultRecords: nil, readBackRecords: [record]),
            sessionAuthority: first.sessionAuthority, authority: .founderProduction
        )
        second.resume(draftId: id)
        for _ in 0..<50 where second.completedPerformanceRecords.isEmpty {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertEqual(second.draft?.id, id)
        XCTAssertEqual(second.draft?.step, .complete)
        XCTAssertEqual(second.completedPerformanceRecords, [record])
    }

    // MARK: Celebration one-shot + haptic

    @MainActor
    func testCelebrationHapticPlaysOnceOnlyWhenVisible() {
        let suite = "b78-celebration-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let feedback = RecordingFeedbackClient()
        func present(visible: Bool, reduceMotion: Bool = false, hasRecords: Bool = true, key: String? = "session-1") -> Bool {
            WorkoutCelebrationGate.present(
                key: key, hasRecords: hasRecords, reduceMotion: reduceMotion,
                presentationVisible: visible, feedback: feedback, defaults: defaults
            )
        }

        XCTAssertFalse(present(visible: false), "A late record read on a hidden tab cannot consume the celebration.")
        XCTAssertTrue(feedback.events.isEmpty, "No haptic while hidden.")
        XCTAssertTrue(present(visible: true), "Visible first presentation: confetti.")
        XCTAssertEqual(feedback.events, [.performanceRecordCelebration])
        XCTAssertFalse(present(visible: true), "A re-render or revisit never replays.")
        XCTAssertFalse(present(visible: false))
        XCTAssertEqual(feedback.events, [.performanceRecordCelebration], "Exactly one haptic per celebration.")

        XCTAssertFalse(present(visible: true, hasRecords: false, key: "no-records"))
        XCTAssertFalse(present(visible: true, key: nil))
        XCTAssertEqual(feedback.events.count, 1, "No record, no identity: no celebration.")
    }

    @MainActor
    func testReduceMotionSuppressesConfettiButNotTheCelebrationHaptic() {
        let suite = "b78-reduce-motion-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let feedback = RecordingFeedbackClient()
        XCTAssertFalse(WorkoutCelebrationGate.present(
            key: "session-rm", hasRecords: true, reduceMotion: true,
            presentationVisible: true, feedback: feedback, defaults: defaults
        ), "No animation under Reduce Motion.")
        XCTAssertEqual(feedback.events, [.performanceRecordCelebration],
                       "Haptics follow the system haptic settings, not Reduce Motion.")
        XCTAssertFalse(WorkoutCelebrationGate.present(
            key: "session-rm", hasRecords: true, reduceMotion: false,
            presentationVisible: true, feedback: feedback, defaults: defaults
        ), "Turning Reduce Motion off later never replays it.")
        XCTAssertEqual(feedback.events.count, 1)
    }

    func testWorkoutCompleteWiresTheVisibleSurfaceHapticAndReturnToLogBoundary() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let logger = try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift"), encoding: .utf8)
        XCTAssertTrue(logger.contains("isPresentationVisible: isSurfaceVisible && scenePhase == .active"),
                      "Neither a hidden tab nor a backgrounded app can consume the one-shot.")
        XCTAssertTrue(logger.contains("feedback: environment.feedback"))
        XCTAssertTrue(logger.contains("viewModel.acknowledgeCompletion()\n                dismiss()"))
        XCTAssertFalse(logger.contains("UIImpactFeedbackGenerator") || logger.contains("UINotificationFeedbackGenerator"),
                       "Haptics go through the feedback client only.")
    }

    private struct LoggerSetTypographyReviewSpec: Identifiable {
        let id: String
        let title: String
        let valueSize: CGFloat
        let valueWeight: CGFloat
        let setSize: CGFloat
        let setWeight: CGFloat

        var valueFont: UIFont {
            PlusJakartaSans.uiFont(size: UIFontMetrics.default.scaledValue(for: valueSize), weight: valueWeight)
        }

        var setFont: Font {
            PlusJakartaSans.font(size: UIFontMetrics.default.scaledValue(for: setSize), weight: setWeight)
        }
    }

    private static let loggerSetTypographyReviewSpecs = [
        LoggerSetTypographyReviewSpec(id: "current", title: "Current · 12 Regular", valueSize: 12, valueWeight: 400, setSize: 12, setWeight: 700),
        LoggerSetTypographyReviewSpec(id: "option-a", title: "Option A · 14 Regular", valueSize: 14, valueWeight: 400, setSize: 12, setWeight: 700),
        LoggerSetTypographyReviewSpec(id: "option-b", title: "Option B · 16 Semibold", valueSize: 16, valueWeight: 600, setSize: 12, setWeight: 700),
        LoggerSetTypographyReviewSpec(id: "option-c", title: "Option C · 15 Medium + 13 Set", valueSize: 15, valueWeight: 500, setSize: 13, setWeight: 700),
    ]

    func testLoggerSetTypographyOptionsAreRestrainedAndFitRepresentativeValues() throws {
        let specs = Self.loggerSetTypographyReviewSpecs
        XCTAssertEqual(specs.map(\.valueSize), [12, 14, 16, 15])
        XCTAssertEqual(LoggerType.fieldValuePointSize, specs[2].valueSize, "Founder-selected Option B must remain the shipping Logger value size.")
        XCTAssertEqual(LoggerType.fieldValueWeight, specs[2].valueWeight, "Founder-selected Option B must remain the shipping Logger value weight.")
        XCTAssertEqual(specs[2].valueFont.pointSize, LoggerType.fieldValueFont.pointSize, accuracy: 0.01)
        XCTAssertTrue(specs[0...2].map(\.valueSize).elementsEqual([12, 14, 16]))
        XCTAssertEqual(specs[3].setSize, 13, "Only balanced Option C explores a proportional SET-number increase.")

        // The real 390 pt Logger grid leaves roughly 103 pt per numeric
        // field. Keep generous insets while checking all requested shapes.
        for spec in specs {
            for value in ["1", "12", "125", "1250", "102.5"] {
                let width = (value as NSString).size(withAttributes: [.font: spec.valueFont]).width
                XCTAssertLessThan(width, 84, "\(spec.title) clips representative value \(value)")
            }
        }
    }

    @MainActor
    func testLoggerSetTypographyOptionsRenderFromShippingNumericFieldsInDarkAndMineral() throws {
        for (appearance, scheme) in [("light", ColorScheme.light), ("dark", ColorScheme.dark)] {
            for spec in Self.loggerSetTypographyReviewSpecs {
                let view = LoggerSetTypographyReviewSurface(spec: spec)
                    .frame(width: 390, height: 430)
                    .environment(\.colorScheme, scheme)
                let image = renderLoggerTypographyReview(view)
                let data = try XCTUnwrap(image.pngData())
                XCTAssertGreaterThan(data.count, 25_000, "\(appearance) \(spec.title) render was unexpectedly empty")
                let attachment = XCTAttachment(image: image)
                attachment.name = "logger-set-type-\(appearance)-\(spec.id)"
                attachment.lifetime = .keepAlways
                add(attachment)
            }
        }
    }

    @MainActor
    private func renderLoggerTypographyReview<V: View>(_ view: V) -> UIImage {
        let size = CGSize(width: 390, height: 430)
        let host = UIHostingController(rootView: view)
        host.safeAreaRegions = []
        host.view.bounds = CGRect(origin: .zero, size: size)
        host.view.backgroundColor = .clear
        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.isHidden = false
        host.view.layoutIfNeeded()
        return UIGraphicsImageRenderer(size: size).image { _ in
            host.view.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: true)
        }
    }

    private struct LoggerSetTypographyReviewSurface: View {
        let spec: LoggerSetTypographyReviewSpec

        var body: some View {
            VStack(alignment: .leading, spacing: 12) {
                Text("ACTIVE WORKOUT")
                    .logText(LoggerType.eyebrow10)
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                Text("Shoulder Press Machine")
                    .logText(LoggerType.cardTitle15)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text("Ordinary · Standalone · Previous 10 × 90 lb")
                    .logText(LoggerType.context10)
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                VStack(spacing: 0) {
                    LoggerSetTypographyReviewHeader()
                    LoggerSetTypographyReviewRow(spec: spec, number: 1, reps: "12", load: "160", completed: true)
                    LoggerSetTypographyReviewRow(spec: spec, number: 2, reps: "10", load: "90", completed: false)
                    LoggerSetTypographyReviewRow(spec: spec, number: 3, reps: "8", load: "102.5", completed: false)
                    LoggerSetTypographyReviewRow(spec: spec, number: 4, reps: "3", load: "1250", completed: false)
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 10, weight: .bold))
                        Text("Add set").logText(LoggerType.addSet11)
                    }
                    .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .background(PhysiqueOSTheme.redesignPaper, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(PhysiqueOSTheme.redesignHairline, lineWidth: 1))
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(PhysiqueOSTheme.redesignCanvas)
        }
    }

    private struct LoggerSetTypographyReviewHeader: View {
        var body: some View {
            LoggerSetTypographyReviewGrid {
                Text("Set")
            } primary: {
                Text("Reps")
            } load: {
                Text("Load (lb)")
            } done: {
                Text("Done").frame(maxWidth: .infinity)
            } remove: {
                Color.clear
            }
            .logText(LoggerType.columnHeader8)
            .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
            .frame(height: 28)
            .background(PhysiqueOSTheme.redesignSoft)
        }
    }

    private struct LoggerSetTypographyReviewRow: View {
        let spec: LoggerSetTypographyReviewSpec
        let number: Int
        @State var reps: String
        @State var load: String
        let completed: Bool

        init(spec: LoggerSetTypographyReviewSpec, number: Int, reps: String, load: String, completed: Bool) {
            self.spec = spec
            self.number = number
            _reps = State(initialValue: reps)
            _load = State(initialValue: load)
            self.completed = completed
        }

        var body: some View {
            LoggerSetTypographyReviewGrid {
                Text("\(number)")
                    .font(spec.setFont)
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
            } primary: {
                NumericEditField(
                    text: $reps,
                    accessibilityLabel: "Set \(number) reps",
                    fieldBackground: PhysiqueOSTheme.redesignSoft,
                    font: spec.valueFont,
                    textColor: PhysiqueOSTheme.redesignInk,
                    placeholderColor: PhysiqueOSTheme.redesignUtilityMuted
                )
                .frame(height: 36)
            } load: {
                NumericEditField(
                    text: $load,
                    accessibilityLabel: "Set \(number) optional external load",
                    fieldBackground: PhysiqueOSTheme.redesignSoft,
                    font: spec.valueFont,
                    textColor: PhysiqueOSTheme.redesignInk,
                    placeholderColor: PhysiqueOSTheme.redesignInkSecondary
                )
                .frame(height: 36)
            } done: {
                Image(systemName: completed ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 32, weight: .regular))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(
                        completed ? PhysiqueOSTheme.redesignCanvas : PhysiqueOSTheme.redesignUtilityMuted,
                        completed ? PhysiqueOSTheme.redesignGreen : PhysiqueOSTheme.redesignUtilityMuted
                    )
                    .frame(width: 44, height: 44)
            } remove: {
                Image(systemName: "delete.left")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(PhysiqueOSTheme.redesignUtilityMuted)
                    .frame(width: 32, height: 44)
            }
            .frame(minHeight: 52)
            .background(completed ? PhysiqueOSTheme.redesignGreen.opacity(0.09) : Color.clear)
            .overlay(alignment: .bottom) {
                Rectangle().fill(PhysiqueOSTheme.redesignHairline).frame(height: 1)
            }
        }
    }

    private struct LoggerSetTypographyReviewGrid<Number: View, Primary: View, Load: View, Done: View, Remove: View>: View {
        @ViewBuilder let number: () -> Number
        @ViewBuilder let primary: () -> Primary
        @ViewBuilder let load: () -> Load
        @ViewBuilder let done: () -> Done
        @ViewBuilder let remove: () -> Remove

        var body: some View {
            HStack(spacing: 6) {
                number().frame(width: 28)
                primary().frame(maxWidth: .infinity)
                load().frame(maxWidth: .infinity)
                done().frame(width: 48, alignment: .leading)
                remove().frame(width: 36, alignment: .leading)
            }
            .padding(.horizontal, 8)
        }
    }
}

/// Build 87 workout reliability lane: the production `training-logger`
/// history keeps the Server's superset context, so pairing exercises shows
/// superset-context history (and standalone history excludes supersets),
/// and guidance never rewrites a completed set.
@MainActor
final class Build87SupersetHistoryContextTests: XCTestCase {
    /// Production-shaped `initialHistorySessions`: 09-14 is a Leg Extension +
    /// Sissy Squat superset, 09-28 a standalone Leg Extension session.
    private static let historyJSON = #"""
    [
      {"id":"s-0928","evidence_type":"training","observed_at":"2026-09-28","exercises":[
        {"id":"E-LE-0928","canonicalExerciseId":"leg_extension","name":"Leg Extensions","sets":[{"reps":15,"weight":90,"weight_unit":"lb"},{"reps":15,"weight":90,"weight_unit":"lb"}]}
      ],"exerciseRelationshipGroups":[]},
      {"id":"s-0914","evidence_type":"training","observed_at":"2026-09-14","exercises":[
        {"id":"E-LE-0914","canonicalExerciseId":"leg_extension","name":"Leg Extensions","sets":[{"reps":15,"weight":80,"weight_unit":"lb"},{"reps":15,"weight":80,"weight_unit":"lb"}]},
        {"id":"E-SS-0914","canonicalExerciseId":"sissy_squat","name":"Sissy Squats","sets":[{"reps":12,"weight":50,"weight_unit":"lb"},{"reps":12,"weight":50,"weight_unit":"lb"}]}
      ],"exerciseRelationshipGroups":[{"id":"g-0914","relationshipType":"superset","memberExerciseIds":["E-LE-0914","E-SS-0914"]}]},
      {"id":"s-0825","evidence_type":"training","observed_at":"2026-08-25","exercises":[
        {"id":"E-SS-0825","canonicalExerciseId":"sissy_squat","name":"Sissy Squats","sets":[{"reps":13,"weight":45,"weight_unit":"lb"},{"reps":13,"weight":45,"weight_unit":"lb"}]}
      ]}
    ]
    """#

    private func sessions() throws -> [ProductionTrainingLoggerAPI.HistorySession] {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode([ProductionTrainingLoggerAPI.HistorySession].self, from: Data(Self.historyJSON.utf8))
    }

    private func catalog() throws -> [TrainingLoggerCatalogExercise] {
        let sessions = try sessions()
        let standalone = TrainingLoggerProgressionRecommendation(
            state: .maintain, eyebrow: "Maintain current performance", message: "Canonical recommendation.",
            prescription: "90 lb x 15", suggestedLoad: 90, suggestedLoadType: "external_load",
            suggestedReps: 15, suggestedUnit: "lb"
        )
        return [("leg_extension", "Leg Extensions"), ("sissy_squat", "Sissy Squats")].map { id, name in
            TrainingLoggerCatalogExercise(
                canonicalExerciseId: id, name: name, areaId: "quads", equipment: nil,
                measurement: .repsLoad, defaultLoadType: nil, previouslyPerformed: true,
                history: ProductionTrainingLoggerAPI.history(for: id, in: sessions),
                progressionRecommendation: id == "leg_extension" ? standalone : nil
            )
        }
    }

    private func freshDraft() -> TrainingLoggerDraft {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-10-05", startedAt: "2026-10-05T15:07:18Z")
        draft.selectedAreaIds = ["quads"]
        draft.step = .workout
        return draft
    }

    func testProductionHistoryKeepsTheServerSupersetContextAndStandaloneSessionsStayStandalone() throws {
        let history = ProductionTrainingLoggerAPI.history(for: "leg_extension", in: try sessions())
        XCTAssertEqual(history.map(\.workoutDate), ["2026-09-28", "2026-09-14"])
        XCTAssertNil(history[0].relationship, "A session without groups is standalone.")
        XCTAssertEqual(history[1].relationship, TrainingLoggerHistoryRelationship(
            relationshipType: "superset", partnerNames: ["Sissy Squats"], partnerCanonicalExerciseIds: ["sissy_squat"]
        ))
        let sissy = ProductionTrainingLoggerAPI.history(for: "sissy_squat", in: try sessions())
        XCTAssertEqual(sissy.first?.relationship?.partnerCanonicalExerciseIds, ["leg_extension"])
        XCTAssertNil(sissy.last?.relationship, "Missing exerciseRelationshipGroups (older payloads) stays standalone.")
    }

    func testPairingShowsSupersetContextHistoryAndUnpairingReturnsToStandalone() throws {
        let catalog = try catalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        let legExtension = draft.exercises[0].id
        let sissy = draft.exercises[1].id
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-09-28")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.workoutDate, "2026-08-25",
                       "Standalone Sissy history no longer absorbs the 09-14 superset session.")

        draft.setSuperset(firstId: legExtension, secondId: sissy, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-09-14")
        XCTAssertEqual(draft.exercises[0].previousPerformance?.sets.first?.weight, 80)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.contextLabel, "Superset with Sissy Squats")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.workoutDate, "2026-09-14")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.sets.first?.reps, 12)
        XCTAssertNil(draft.exercises[0].progressionRecommendation,
                     "Standalone Suggested/Maintain is withheld in superset context (existing design).")

        draft.removeSuperset(containing: legExtension, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-09-28")
        XCTAssertNotNil(draft.exercises[0].progressionRecommendation)
        XCTAssertEqual(draft.exercises[1].previousPerformance?.workoutDate, "2026-08-25")
    }

    func testRemovingASupersetPartnerReturnsTheSurvivorToStandalone() throws {
        let catalog = try catalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: catalog)
        draft.removeExercise(id: draft.exercises[1].id, catalog: catalog)
        XCTAssertTrue(draft.relationships.isEmpty)
        XCTAssertNil(draft.relationshipContext(for: draft.exercises[0].id))
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-09-28")
        XCTAssertNotNil(draft.exercises[0].progressionRecommendation)
    }

    func testGuidanceNeverRewritesOrUncompletesACompletedSet() throws {
        let catalog = try catalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        let id = draft.exercises[0].id
        draft.exercises[0].sets[0].reps = 30
        draft.exercises[0].sets[0].load = 40
        draft.exercises[0].sets[0].isCompleted = true
        let completed = draft.exercises[0].sets[0]

        draft.applyProgressionSuggestion(to: id)
        XCTAssertEqual(draft.exercises[0].sets[0], completed)
        XCTAssertEqual(draft.exercises[0].sets[1].load, 90, "Uncompleted sets take the suggestion.")

        draft.keepPreviousPerformance(for: id)
        XCTAssertEqual(draft.exercises[0].sets[0], completed)
        XCTAssertTrue(draft.exercises[0].sets[0].isCompleted)
    }

    func testSupersetContextValuesReachTheWatchProjectionThroughTheAuthority() throws {
        let catalog = try catalog()
        var initial = freshDraft()
        initial.id = "session-b87"
        initial.addExercise(catalog[0])
        initial.addExercise(catalog[1])
        let store = Build83FinishLifecycleTests.Store([initial])
        let authority = TrainingSessionAuthority(
            store: store, environment: .founderProduction,
            restPreferences: FixedTrainingRestPreferences(nil),
            terminalLedger: MemoryTrainingSessionTerminalLedgerStore(),
            now: { Date(timeIntervalSince1970: 1_790_000_000) }
        )
        let legExtension = initial.exercises[0].id
        let sissy = initial.exercises[1].id
        _ = authority.edit(sessionId: "session-b87") { $0.setSuperset(firstId: legExtension, secondId: sissy, catalog: catalog) }
        _ = authority.edit(sessionId: "session-b87") { $0.keepPreviousPerformance(for: legExtension) }
        let draft = try XCTUnwrap(authority.draft(id: "session-b87"))
        let projection = try XCTUnwrap(WatchWorkoutProjection.make(draft: draft, authority: authority, now: Date(timeIntervalSince1970: 1_790_000_000)))
        let target = try XCTUnwrap(projection.rows.first { $0.isCompletionTarget })
        XCTAssertEqual(target.exerciseId, legExtension)
        XCTAssertEqual(target.repsText, "15")
        XCTAssertEqual(target.loadText?.contains("80"), true, "The Watch shows the superset-context previous load.")
        XCTAssertNotNil(target.supersetLabel)
    }

    /// Build 92: the phone-selected canonical variant reaches the Watch as a
    /// display-only label; the set's own values are unchanged.
    func testSelectedExecutionVariantLabelReachesTheWatchProjectionThroughTheAuthority() throws {
        let catalog = try catalog()
        var initial = freshDraft()
        initial.id = "session-b92-variant"
        initial.addExercise(catalog[0])
        let store = Build83FinishLifecycleTests.Store([initial])
        let authority = TrainingSessionAuthority(
            store: store, environment: .founderProduction,
            restPreferences: FixedTrainingRestPreferences(nil),
            terminalLedger: MemoryTrainingSessionTerminalLedgerStore(),
            now: { Date(timeIntervalSince1970: 1_790_000_000) }
        )
        let exerciseId = initial.exercises[0].id
        let before = try XCTUnwrap(WatchWorkoutProjection.make(draft: initial, authority: authority, now: Date(timeIntervalSince1970: 1_790_000_000)))
        XCTAssertNil(before.rows.first { $0.isCompletionTarget }?.variantLabel)
        let selection = TrainingExecutionVariant(key: "static_hold", label: "Static Hold", rawLabel: "Static Hold", variantId: "tev_static_hold_fixture")
        _ = authority.edit(sessionId: "session-b92-variant") { $0.applyVariant(selection, to: exerciseId, catalog: catalog) }
        let draft = try XCTUnwrap(authority.draft(id: "session-b92-variant"))
        XCTAssertEqual(draft.exercises[0].sets, initial.exercises[0].sets)
        let projection = try XCTUnwrap(WatchWorkoutProjection.make(draft: draft, authority: authority, now: Date(timeIntervalSince1970: 1_790_000_000)))
        let target = try XCTUnwrap(projection.rows.first { $0.isCompletionTarget })
        XCTAssertEqual(target.variantLabel, "Static Hold")
        XCTAssertEqual(target.repsText, before.rows.first { $0.isCompletionTarget }?.repsText)
    }

    // MARK: 2-B contextual row refill (Founder-approved 2026-10-05)

    /// Adds a third exercise with only standalone history (no superset
    /// history with anyone) and Server contextual recommendations for Leg
    /// Extensions with Sissy Squats and with Pendulum.
    private func richCatalog() throws -> [TrainingLoggerCatalogExercise] {
        var rich = try catalog()
        let supersetMaintain = TrainingLoggerProgressionRecommendation(
            state: .maintain, eyebrow: "Maintain current performance", message: "Superset context.",
            prescription: "80 lb x 15", suggestedLoad: 80, suggestedLoadType: "external_load",
            suggestedReps: 15, suggestedUnit: "lb"
        )
        let pendulumContext = TrainingLoggerProgressionRecommendation(
            state: .opportunity, eyebrow: "Progression opportunity", message: "Other context.",
            prescription: "70 lb x 12", suggestedLoad: 70, suggestedLoadType: "external_load",
            suggestedReps: 12, suggestedUnit: "lb"
        )
        rich[0].contextualProgressionRecommendations = [
            .init(relationshipType: "superset", relationshipKey: "superset|partners:sissy_squat", partnerCanonicalExerciseIds: ["sissy_squat"], recommendation: supersetMaintain),
            .init(relationshipType: "superset", relationshipKey: "superset|partners:pendulum_squat_machine", partnerCanonicalExerciseIds: ["pendulum_squat_machine"], recommendation: pendulumContext),
        ]
        rich.append(TrainingLoggerCatalogExercise(
            canonicalExerciseId: "pendulum_squat_machine", name: "Pendulum Squat Machine", areaId: "quads", equipment: nil,
            measurement: .repsLoad, defaultLoadType: nil, previouslyPerformed: true,
            history: [.init(sessionId: "s-0901", workoutDate: "2026-09-01", executionVariant: nil, relationship: nil,
                            sets: [.init(setNumber: 1, reps: 11, weight: 55, weightUnit: "lb", durationSeconds: nil)])],
            progressionRecommendation: nil
        ))
        return rich
    }

    func testPairingRefillsOnlyUntouchedUncompletedRowsFromSupersetHistory() throws {
        let catalog = try richCatalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        draft.addSet(to: draft.exercises[0].id)
        draft.exercises[0].sets[0].isCompleted = true
        let completed = draft.exercises[0].sets[0]
        draft.exercises[1].sets[0].reps = 20
        draft.exercises[1].sets[0].isManuallyEdited = true
        let edited = draft.exercises[1].sets[0]

        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].sets[0], completed, "Completed rows never change.")
        XCTAssertEqual(draft.exercises[0].sets[1].load, 80)
        XCTAssertEqual(draft.exercises[0].sets[1].reps, 15)
        XCTAssertEqual(draft.exercises[0].sets[2].load, 80, "Extra rows take the last contextual set.")
        XCTAssertEqual(draft.exercises[1].sets[0], edited, "Hand-edited rows never change.")
        XCTAssertEqual(draft.exercises[1].sets[1].load, 50)
        XCTAssertEqual(draft.exercises[1].sets[1].reps, 12)
    }

    func testUnpairingRefillsUntouchedRowsFromStandaloneHistory() throws {
        let catalog = try richCatalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        let legExtension = draft.exercises[0].id
        draft.setSuperset(firstId: legExtension, secondId: draft.exercises[1].id, catalog: catalog)
        draft.exercises[0].sets[0].isCompleted = true
        draft.removeSuperset(containing: legExtension, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].sets[0].load, 80, "The completed superset row stays as performed.")
        XCTAssertEqual(draft.exercises[0].sets[1].load, 90)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-09-28")
        XCTAssertEqual(draft.exercises[1].sets[0].reps, 13, "Sissy returns to its standalone 08-25 history.")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.contextLabel, "Ordinary · Standalone")
    }

    func testPairingWithNoContextualHistoryKeepsCurrentValuesAndClaimsNoPrevious() throws {
        let catalog = try richCatalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[2])
        let before = draft.exercises.map(\.sets)
        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: catalog)
        XCTAssertEqual(draft.exercises.map(\.sets), before, "No history in the new context: values are kept, never cleared.")
        XCTAssertNil(draft.exercises[0].previousPerformance, "Previous never borrows another context's history.")
        XCTAssertNil(draft.exercises[1].previousPerformance)
        XCTAssertNil(draft.exercises[0].progressionRecommendation,
                     "Without contextual history there is no Suggested/Maintain claim (even if a recommendation exists).")
    }

    func testRePairingRecomputesEveryAffectedMemberAndLeavesNoStaleContext() throws {
        let catalog = try richCatalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        draft.addExercise(catalog[2])
        let legExtension = draft.exercises[0].id
        let sissy = draft.exercises[1].id
        let pendulum = draft.exercises[2].id
        draft.setSuperset(firstId: legExtension, secondId: sissy, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].progressionRecommendation?.suggestedLoad, 80)

        draft.setSuperset(firstId: legExtension, secondId: pendulum, catalog: catalog)
        XCTAssertEqual(draft.relationshipContext(for: legExtension)?.partnerCanonicalExerciseIds, ["pendulum_squat_machine"])
        XCTAssertNil(draft.exercises[0].previousPerformance, "No stale 09-14 Sissy-context Previous.")
        XCTAssertNil(draft.exercises[0].progressionRecommendation, "The Sissy-context recommendation never survives re-pairing.")
        XCTAssertEqual(draft.exercises[0].sets[0].load, 80, "No pendulum-context history: current values kept.")
        XCTAssertNil(draft.relationshipContext(for: sissy), "The former partner is standalone again.")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.workoutDate, "2026-08-25")
        XCTAssertEqual(draft.exercises[1].sets[0].reps, 13, "The former partner refilled from standalone history.")
    }

    func testReorderingExercisesKeepsTheSameContextAndRows() throws {
        let catalog = try richCatalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: catalog)
        let before = draft.exercises
        draft.moveExercise(id: draft.exercises[0].id, offset: 1)
        XCTAssertEqual(draft.exercises.map(\.id), before.reversed().map(\.id))
        XCTAssertEqual(draft.exercises.first { $0.id == before[0].id }, before[0], "Partner identity is order-free: nothing recomputes.")
    }

    // MARK: 2-C Server contextual recommendation selection

    func testOnlyTheRecommendationForTheCurrentGroupingIsSelectedAndUnpairRestoresStandalone() throws {
        let catalog = try richCatalog()
        var draft = freshDraft()
        draft.addExercise(catalog[0])
        draft.addExercise(catalog[1])
        let legExtension = draft.exercises[0].id
        XCTAssertEqual(draft.exercises[0].progressionRecommendation?.suggestedLoad, 90, "Standalone Server recommendation.")
        draft.setSuperset(firstId: legExtension, secondId: draft.exercises[1].id, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].progressionRecommendation?.message, "Superset context.")
        XCTAssertEqual(draft.exercises[0].progressionChoice, .previous)
        XCTAssertNil(draft.exercises[1].progressionRecommendation, "Sissy has no Server contextual recommendation: no claim.")
        draft.removeSuperset(containing: legExtension, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].progressionRecommendation?.suggestedLoad, 90)
    }

    func testAManualEditThroughTheAuthorityProtectsTheRowFromContextualRefill() throws {
        let catalog = try richCatalog()
        var initial = freshDraft()
        initial.id = "session-edit"
        initial.addExercise(catalog[0])
        initial.addExercise(catalog[1])
        let store = Build83FinishLifecycleTests.Store([initial])
        let authority = TrainingSessionAuthority(
            store: store, environment: .founderProduction,
            restPreferences: FixedTrainingRestPreferences(nil),
            terminalLedger: MemoryTrainingSessionTerminalLedgerStore(),
            now: { Date(timeIntervalSince1970: 1_790_000_000) }
        )
        let legExtension = initial.exercises[0].id
        let firstSet = initial.exercises[0].sets[0].id
        XCTAssertTrue(authority.setValue(sessionId: "session-edit", exerciseId: legExtension, setId: firstSet, field: .load, value: 100).isAccepted)
        _ = authority.edit(sessionId: "session-edit") { $0.setSuperset(firstId: legExtension, secondId: initial.exercises[1].id, catalog: catalog) }
        let draft = try XCTUnwrap(authority.draft(id: "session-edit"))
        XCTAssertEqual(draft.exercises[0].sets[0].load, 100)
        XCTAssertEqual(draft.exercises[0].sets[0].isManuallyEdited, true)
        XCTAssertEqual(draft.exercises[0].sets[1].load, 80)
    }

    func testTheWatchProjectionShowsTheAppliedContextualSuggestion() throws {
        let catalog = try richCatalog()
        var initial = freshDraft()
        initial.id = "session-watch-2c"
        initial.addExercise(catalog[0])
        initial.addExercise(catalog[1])
        let store = Build83FinishLifecycleTests.Store([initial])
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let authority = TrainingSessionAuthority(
            store: store, environment: .founderProduction,
            restPreferences: FixedTrainingRestPreferences(nil),
            terminalLedger: MemoryTrainingSessionTerminalLedgerStore(),
            now: { now }
        )
        let legExtension = initial.exercises[0].id
        _ = authority.edit(sessionId: "session-watch-2c") { $0.setSuperset(firstId: legExtension, secondId: initial.exercises[1].id, catalog: catalog) }
        let paired = try XCTUnwrap(authority.draft(id: "session-watch-2c"))
        let refreshed = try XCTUnwrap(WatchWorkoutProjection.make(draft: paired, authority: authority, now: now))
        XCTAssertEqual(refreshed.rows.first { $0.isCompletionTarget }?.loadText?.contains("80"), true,
                       "Pairing alone already refreshes the Watch through the authority revision.")
        _ = authority.edit(sessionId: "session-watch-2c") { $0.applyProgressionSuggestion(to: legExtension) }
        let applied = try XCTUnwrap(authority.draft(id: "session-watch-2c"))
        XCTAssertEqual(applied.exercises[0].progressionChoice, .suggestion)
        let projection = try XCTUnwrap(WatchWorkoutProjection.make(draft: applied, authority: authority, now: now))
        let target = try XCTUnwrap(projection.rows.first { $0.isCompletionTarget })
        XCTAssertEqual(target.repsText, "15")
        XCTAssertEqual(target.loadText?.contains("80"), true)
        XCTAssertGreaterThan(applied.currentRevision, paired.currentRevision)
    }
}


// MARK: - Build 92 Training Execution Variants (Create + Select)

final class TrainingExecutionVariantTests: XCTestCase {
    private static let staticHold = TrainingExecutionVariantChoice(
        variantId: "tev_spider_static_hold", key: "static_hold", label: "Static Hold",
        legacyKeys: ["static_hold"], status: "active", provenance: "legacy_seed",
        selection: TrainingExecutionVariant(key: "static_hold", label: "Static Hold", rawLabel: "Static Hold", variantId: "tev_spider_static_hold")
    )
    private static let slowEccentric = TrainingExecutionVariantChoice(
        variantId: "tev_spider_slow_eccentric", key: "slow_eccentric", label: "Slow Eccentric",
        legacyKeys: [], status: "active", provenance: "user_created",
        selection: TrainingExecutionVariant(key: "slow_eccentric", label: "Slow Eccentric", rawLabel: "Slow Eccentric", variantId: "tev_spider_slow_eccentric")
    )
    private static let legacyStaticHold = TrainingExecutionVariant(key: "static_hold", label: "Static Hold", rawLabel: "static hold")

    private func record(_ date: String, load: Double, reps: Double, variant: TrainingExecutionVariant? = nil) -> TrainingLoggerHistoryRecord {
        TrainingLoggerHistoryRecord(
            sessionId: "session-\(date)", workoutDate: date, executionVariant: variant, relationship: nil,
            sets: [TrainingSet(setNumber: 1, reps: reps, weight: load, weightUnit: "lb", durationSeconds: nil, loadType: "external_load", setType: nil)]
        )
    }

    private func spider(choices: [TrainingExecutionVariantChoice]? = [staticHold]) -> TrainingLoggerCatalogExercise {
        TrainingLoggerCatalogExercise(
            canonicalExerciseId: "spider_curl", name: "Spider Curls", areaId: "biceps", equipment: nil,
            measurement: .repsLoad, previouslyPerformed: true, inMyLibrary: true,
            history: [
                record("2026-09-01", load: 100, reps: 10),
                record("2026-09-05", load: 35, reps: 12, variant: Self.legacyStaticHold),
            ],
            progressionRecommendation: nil, executionVariants: choices
        )
    }

    private func bench() -> TrainingLoggerCatalogExercise {
        TrainingLoggerCatalogExercise(
            canonicalExerciseId: "bench_press", name: "Bench Press", areaId: "chest", equipment: nil,
            measurement: .repsLoad, previouslyPerformed: false, inMyLibrary: true, history: [], progressionRecommendation: nil
        )
    }

    func testIdentityIsStableAcrossLegacyKeysAndSelectionsAndLegacyWithoutChoices() {
        let choices = [Self.staticHold, Self.slowEccentric]
        XCTAssertEqual(TrainingExecutionVariantIdentity.identity(of: nil, choices: choices), "ordinary")
        XCTAssertEqual(TrainingExecutionVariantIdentity.identity(of: Self.legacyStaticHold, choices: choices), "tev_spider_static_hold")
        XCTAssertEqual(TrainingExecutionVariantIdentity.identity(of: Self.staticHold.selection, choices: choices), "tev_spider_static_hold")
        // No choices: exactly the pre-Build-92 key partition.
        XCTAssertEqual(TrainingExecutionVariantIdentity.identity(of: Self.staticHold.selection, choices: []), "static_hold")
        let superSet = TrainingExecutionVariant(key: "super_set", label: "Super Set", rawLabel: "super set")
        XCTAssertEqual(TrainingExecutionVariantIdentity.identity(of: superSet, choices: choices), "super_set")
        var reserved = Self.staticHold
        reserved.key = "super_set"
        XCTAssertFalse(reserved.isSelectable, "A Super Set choice is never selectable")
        var retired = Self.staticHold
        retired.status = "retired"
        XCTAssertFalse(retired.isSelectable)
    }

    func testPreviousPerformanceUsesStableIdentityKeepsSetsAndStaysPartitionedFromOrdinary() throws {
        let catalog = [spider(choices: [Self.staticHold, Self.slowEccentric])]
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-09-10")
        draft.addExercise(catalog[0])
        let id = try XCTUnwrap(draft.exercises.first?.id)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.sets.first?.weight, 100, "Ordinary history only")
        draft.exercises[0].sets[0].reps = 9
        draft.exercises[0].sets[0].load = 90
        let setsBefore = draft.exercises[0].sets

        draft.applyVariant(Self.staticHold.selection, to: id, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].executionVariant?.variantId, "tev_spider_static_hold")
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-09-05", "Legacy Static Hold history resolves to the definition")
        XCTAssertEqual(draft.exercises[0].previousPerformance?.sets.first?.weight, 35)
        XCTAssertEqual(draft.exercises[0].sets, setsBefore, "Switching a variant never clears or rewrites sets")

        draft.applyVariant(Self.slowEccentric.selection, to: id, catalog: catalog)
        XCTAssertNil(draft.exercises[0].previousPerformance, "A new variant borrows no Ordinary or Static Hold evidence")
        XCTAssertNil(draft.exercises[0].progressionRecommendation)

        draft.applyVariant(nil, to: id, catalog: catalog)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.sets.first?.weight, 100)
        XCTAssertEqual(draft.exercises[0].sets, setsBefore)
    }

    func testSelectedVariantSurvivesDraftPersistenceAndLegacyDraftsDecode() throws {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-09-10")
        draft.addExercise(spider())
        draft.applyVariant(Self.staticHold.selection, to: draft.exercises[0].id, catalog: [spider()])
        let restored = try JSONDecoder().decode(TrainingLoggerDraft.self, from: JSONEncoder().encode(draft))
        XCTAssertEqual(restored.exercises[0].executionVariant, Self.staticHold.selection)
        let encoded = try XCTUnwrap(String(data: JSONEncoder().encode(Self.staticHold.selection), encoding: .utf8))
        XCTAssertTrue(encoded.contains("\"variantId\":\"tev_spider_static_hold\""), "The finish payload carries the stable identity")
        let legacy = try JSONDecoder().decode(TrainingExecutionVariant.self, from: Data(#"{"key":"static_hold","label":"Static Hold","rawLabel":"Static Hold"}"#.utf8))
        XCTAssertNil(legacy.variantId)
        XCTAssertFalse(String(data: try JSONEncoder().encode(legacy), encoding: .utf8)!.contains("variantId"), "Ordinary/legacy writes are unchanged")
        let oldConfiguration = try JSONDecoder().decode(
            TrainingLoggerConfiguration.self,
            from: Data(#"{"areas":[],"variants":[],"exercises":[]}"#.utf8)
        )
        XCTAssertNil(oldConfiguration.supportsExecutionVariantCreation)
    }

    @MainActor
    func testChoicesArePerExerciseAndCreateRequiresTheServerContract() async throws {
        let writer = VariantCatalogWriter()
        let viewModel = try await workout(exercises: [spider(), bench()], writer: writer, supportsCreation: true)
        let spiderExercise = try XCTUnwrap(viewModel.draft?.exercises.first { $0.canonicalExerciseId == "spider_curl" })
        let benchExercise = try XCTUnwrap(viewModel.draft?.exercises.first { $0.canonicalExerciseId == "bench_press" })
        XCTAssertEqual(viewModel.variantChoices(for: spiderExercise).map(\.variantId), ["tev_spider_static_hold"])
        XCTAssertEqual(viewModel.variantChoices(for: benchExercise), [], "One exercise's variants never leak to another")
        XCTAssertTrue(viewModel.canCreateVariant(for: benchExercise))

        let oldServer = try await workout(exercises: [spider(choices: nil)], writer: writer, supportsCreation: nil)
        let oldSpider = try XCTUnwrap(oldServer.draft?.exercises.first)
        XCTAssertEqual(oldServer.variantChoices(for: oldSpider), [])
        XCTAssertFalse(oldServer.canCreateVariant(for: oldSpider), "An older Server offers Ordinary only, no Create")

        let sandbox = try await workout(exercises: [spider()], writer: writer, supportsCreation: true, authority: .sandbox)
        XCTAssertFalse(sandbox.canCreateVariant(for: try XCTUnwrap(sandbox.draft?.exercises.first)), "No local-only variants")
    }

    @MainActor
    func testCreatedVariantIsInsertedForThatExerciseAndSelectedImmediately() async throws {
        let writer = VariantCatalogWriter()
        writer.results = [.success(TrainingExecutionVariantCreation(status: "created", choice: Self.slowEccentric))]
        let viewModel = try await workout(exercises: [spider(), bench()], writer: writer, supportsCreation: true)
        let target = try XCTUnwrap(viewModel.draft?.exercises.first { $0.canonicalExerciseId == "spider_curl" })
        viewModel.beginCreatingVariant(for: target)
        await viewModel.submitNewVariant(name: "  Slow   Eccentric ")
        XCTAssertEqual(writer.requests.map(\.displayName), ["Slow Eccentric"])
        XCTAssertEqual(writer.requests.map(\.canonicalExerciseId), ["spider_curl"])
        XCTAssertNil(viewModel.variantCreation, "The sheet closes on success")
        let selected = try XCTUnwrap(viewModel.draft?.exercises.first { $0.id == target.id })
        XCTAssertEqual(selected.executionVariant?.variantId, "tev_spider_slow_eccentric")
        XCTAssertEqual(viewModel.variantChoices(for: selected).map(\.label), ["Slow Eccentric", "Static Hold"])
        let benchExercise = try XCTUnwrap(viewModel.draft?.exercises.first { $0.canonicalExerciseId == "bench_press" })
        XCTAssertEqual(viewModel.variantChoices(for: benchExercise), [])
    }

    @MainActor
    func testExistingOrReactivatedVariantIsReusedNotDuplicated() async throws {
        let writer = VariantCatalogWriter()
        writer.results = [.success(TrainingExecutionVariantCreation(status: "already_exists", choice: Self.staticHold))]
        let viewModel = try await workout(exercises: [spider()], writer: writer, supportsCreation: true)
        let target = try XCTUnwrap(viewModel.draft?.exercises.first)
        viewModel.beginCreatingVariant(for: target)
        await viewModel.submitNewVariant(name: "static hold")
        let selected = try XCTUnwrap(viewModel.draft?.exercises.first)
        XCTAssertEqual(selected.executionVariant?.variantId, "tev_spider_static_hold")
        XCTAssertEqual(viewModel.variantChoices(for: selected).map(\.variantId), ["tev_spider_static_hold"], "No duplicate choice")
    }

    @MainActor
    func testFailedCreateKeepsPriorSelectionAndRetrySucceeds() async throws {
        let writer = VariantCatalogWriter()
        writer.results = [
            .failure(URLError(.notConnectedToInternet)),
            .failure(TrainingExecutionVariantRejection(code: "TRAINING_EXECUTION_VARIANT_NAME_RESERVED", message: "Ordinary is the default execution and is always available.")),
            .success(TrainingExecutionVariantCreation(status: "created", choice: Self.slowEccentric)),
        ]
        let viewModel = try await workout(exercises: [spider()], writer: writer, supportsCreation: true)
        let target = try XCTUnwrap(viewModel.draft?.exercises.first)
        viewModel.selectVariant(Self.staticHold, for: target.id)
        viewModel.beginCreatingVariant(for: target)

        await viewModel.submitNewVariant(name: "Slow Eccentric")
        XCTAssertNotNil(viewModel.variantCreation, "The sheet stays open for a truthful retry")
        XCTAssertTrue(viewModel.variantCreationMessage?.contains("hasn't changed") == true)
        XCTAssertEqual(viewModel.draft?.exercises.first?.executionVariant?.variantId, "tev_spider_static_hold")

        await viewModel.submitNewVariant(name: "Ordinary")
        XCTAssertEqual(viewModel.variantCreationMessage, "Ordinary is the default execution and is always available.")
        XCTAssertEqual(viewModel.draft?.exercises.first?.executionVariant?.variantId, "tev_spider_static_hold")

        await viewModel.submitNewVariant(name: "Slow Eccentric")
        XCTAssertNil(viewModel.variantCreation)
        XCTAssertNil(viewModel.variantCreationMessage)
        XCTAssertEqual(viewModel.draft?.exercises.first?.executionVariant?.variantId, "tev_spider_slow_eccentric")
        XCTAssertEqual(writer.requests.count, 3)

        viewModel.beginCreatingVariant(for: try XCTUnwrap(viewModel.draft?.exercises.first))
        await viewModel.submitNewVariant(name: String(repeating: "x", count: 41))
        XCTAssertEqual(writer.requests.count, 3, "Over-length names never reach the Server")
        XCTAssertNotNil(viewModel.variantCreationMessage)
    }

    @MainActor
    func testCreateDoesNotSelectOnAnExerciseRemovedWhileTheRequestWasInFlight() async throws {
        let writer = VariantCatalogWriter()
        writer.results = [.success(TrainingExecutionVariantCreation(status: "created", choice: Self.slowEccentric))]
        let viewModel = try await workout(exercises: [spider(), bench()], writer: writer, supportsCreation: true)
        let target = try XCTUnwrap(viewModel.draft?.exercises.first { $0.canonicalExerciseId == "spider_curl" })
        let catalog = viewModel.configuration?.exercises ?? []
        writer.onCreate = { @MainActor in viewModel.update { $0.removeExercise(id: target.id, catalog: catalog) } }
        viewModel.beginCreatingVariant(for: target)
        await viewModel.submitNewVariant(name: "Slow Eccentric")
        XCTAssertNil(viewModel.draft?.exercises.first { $0.id == target.id })
        XCTAssertNil(viewModel.draft?.exercises.first { $0.canonicalExerciseId == "bench_press" }?.executionVariant, "Never applied to another exercise")
        XCTAssertEqual(viewModel.configuration?.exercises.first { $0.canonicalExerciseId == "spider_curl" }?.executionVariantChoices.map(\.variantId),
                       ["tev_spider_slow_eccentric", "tev_spider_static_hold"], "The canonical choice is still available next time")
    }

    // MARK: Helpers

    @MainActor
    private func workout(
        exercises: [TrainingLoggerCatalogExercise],
        writer: VariantCatalogWriter,
        supportsCreation: Bool?,
        authority: NativeAPIEnvironment = .founderProduction
    ) async throws -> TrainingLoggerViewModel {
        let viewModel = TrainingLoggerViewModel(
            api: VariantLoggerAPI(exercises: exercises, supportsCreation: supportsCreation),
            catalogWriteAPI: writer, draftStore: MemoryTrainingLoggerDraftStore(), authority: authority
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        let catalog = viewModel.configuration?.exercises ?? []
        viewModel.update { draft in catalog.forEach { draft.addExercise($0) } }
        return viewModel
    }

    private struct VariantLoggerAPI: TrainingLoggerAPI {
        var exercises: [TrainingLoggerCatalogExercise]
        var supportsCreation: Bool?
        func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
            TrainingLoggerConfiguration(
                areas: [TrainingLoggerArea(id: "biceps", label: "Biceps"), TrainingLoggerArea(id: "chest", label: "Chest")],
                variants: [], exercises: exercises, supportsExecutionVariantCreation: supportsCreation
            )
        }
    }

    private final class VariantCatalogWriter: TrainingExerciseCatalogWriteAPI, @unchecked Sendable {
        var results: [Result<TrainingExecutionVariantCreation, Error>] = []
        var onCreate: (@MainActor () -> Void)?
        private(set) var requests: [(canonicalExerciseId: String, displayName: String)] = []

        func addToMyLibrary(canonicalExerciseId: String) async throws {}
        func createExercise(
            canonicalName: String, primaryMuscleGroupId: String, equipment: String?, aliases: [String]
        ) async throws -> CreateCanonicalExerciseOutcome { .created(canonicalExerciseId: "unused") }
        func createExecutionVariant(canonicalExerciseId: String, displayName: String) async throws -> TrainingExecutionVariantCreation {
            requests.append((canonicalExerciseId, displayName))
            if let onCreate { await onCreate() }
            guard !results.isEmpty else { throw URLError(.badServerResponse) }
            return try results.removeFirst().get()
        }
    }
}
