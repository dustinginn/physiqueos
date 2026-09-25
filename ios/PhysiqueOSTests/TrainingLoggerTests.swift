import XCTest
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

    func testCompletionAchievementRequiresActualImprovementAgainstComparableHistory() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench_press" })
        var draft = draft()
        draft.addExercise(bench)
        draft.exercises[0].sets[0].isCompleted = true
        XCTAssertTrue(draft.performanceAchievementLines.isEmpty)
        draft.exercises[0].sets[0].load = 999
        draft.exercises[0].sets[0].reps = 20
        XCTAssertTrue(draft.performanceAchievementLines.isEmpty, "A load absent from prior history is not matched-load evidence.")
        let comparableSet = try XCTUnwrap(draft.exercises[0].previousPerformance?.sets.first)
        draft.exercises[0].sets[0].load = comparableSet.weight
        draft.exercises[0].sets[0].reps = try XCTUnwrap(comparableSet.reps) + 1
        XCTAssertEqual(draft.performanceAchievementLines, ["Bench Press · better reps at matched load"])
        draft.exercises[0].previousPerformance = nil
        XCTAssertTrue(draft.performanceAchievementLines.isEmpty, "No comparable context must never invent a PR.")
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
        XCTAssertEqual(viewModel.availableCategorySuggestion?.label, "Biceps + Triceps")
        XCTAssertFalse(viewModel.isCategorySuggestionAccepted)
        viewModel.acceptCategorySuggestion()
        XCTAssertEqual(viewModel.draft?.selectedAreaIds, ["biceps", "triceps"])
        XCTAssertTrue(viewModel.isCategorySuggestionAccepted)
        viewModel.update { $0.toggleArea("triceps") }
        XCTAssertEqual(viewModel.draft?.selectedAreaIds, ["biceps"], "Founder override must remain authoritative.")
        XCTAssertFalse(viewModel.isCategorySuggestionAccepted)
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

    /// A successful canonical submission must clear the device-only draft —
    /// there is nothing left to resume once the server holds the canonical
    /// session. This exercises the exact `submit()` → `completeLocalCapture()`
    /// → `draftStore.discard()` path in `TrainingLoggerViewModel.swift`.
    @MainActor
    func testSuccessfulSubmissionClearsThePersistedDraft() async throws {
        let store = MemoryTrainingLoggerDraftStore()
        let viewModel = TrainingLoggerViewModel(api: api, writeAPI: StubSucceedingTrainingWriteAPI(), draftStore: store, authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        viewModel.update { $0.exercises = [] }
        XCTAssertNotNil(store.load())

        await viewModel.submit()

        XCTAssertNil(store.load(), "A confirmed canonical submission must clear the local draft.")
        XCTAssertNil(viewModel.savedDraft)
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
        for _ in 0..<100 where store.load() != nil {
            try? await Task.sleep(for: .milliseconds(10))
        }

        XCTAssertNil(store.load())
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

        XCTAssertEqual(store.loadAll().map(\.id), [sibling.id])
        XCTAssertEqual(reopened.savedDrafts.map(\.id), [sibling.id])
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

        XCTAssertNil(store.load())
        XCTAssertNil(viewModel.savedDraft)
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

        XCTAssertNil(store.load(), "A canonically-successful commit must clear the draft even if the refresh afterward fails.")
        XCTAssertNil(viewModel.savedDraft)
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

        XCTAssertNil(store.load())
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

        XCTAssertNil(store.load())
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
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String, "60")
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.physiqueos.native.dev")
    }
}
