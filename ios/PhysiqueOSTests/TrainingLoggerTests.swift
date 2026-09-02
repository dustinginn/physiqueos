import XCTest
@testable import PhysiqueOS

final class TrainingLoggerTests: XCTestCase {
    private let api = FixtureTrainingLoggerAPI()

    private func configuration() async throws -> TrainingLoggerConfiguration {
        try await api.fetchConfiguration()
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

    func testNormalPickerOnlyShowsPerformedExercisesAndPrioritizesThemInBroadBrowse() async throws {
        let config = try await configuration()
        let draft = draft(areas: ["chest", "shoulders"])
        let normal = draft.pickerExercises(in: config.exercises, browseAll: false, query: "")
        XCTAssertTrue(normal.allSatisfy(\.previouslyPerformed))
        XCTAssertFalse(normal.map(\.name).contains("Dumbbell Lateral Raise"))
        let broad = draft.pickerExercises(in: config.exercises, browseAll: true, query: "")
        let firstRegistryOnly = try XCTUnwrap(broad.firstIndex(where: { !$0.previouslyPerformed }))
        XCTAssertTrue(broad[..<firstRegistryOnly].allSatisfy(\.previouslyPerformed))
        XCTAssertEqual(draft.pickerExercises(in: config.exercises, browseAll: true, query: "lateral").map(\.name), ["Dumbbell Lateral Raise"])
    }

    func testExerciseSelectionPresentationTracksSelectedStateCountAndCTA() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" })
        var draft = draft()
        var presentation = TrainingLoggerSelectionPresentation(draft: draft)
        XCTAssertEqual(presentation.selectedCount, 0)
        XCTAssertEqual(presentation.startTitle, "Start logging · 0 selected")
        XCTAssertFalse(presentation.canStart)
        draft.addExercise(bench)
        draft.addExercise(fly)
        XCTAssertTrue(draft.exercises.contains { $0.canonicalExerciseId == bench.canonicalExerciseId })
        XCTAssertFalse(draft.exercises.contains { $0.canonicalExerciseId == "push-ups" })
        presentation = TrainingLoggerSelectionPresentation(draft: draft)
        XCTAssertEqual(presentation.selectedCount, 2)
        XCTAssertEqual(presentation.startTitle, "Start logging · 2 selected")
        XCTAssertTrue(presentation.canStart)
        draft.removeExercise(id: draft.exercises[0].id)
        XCTAssertEqual(TrainingLoggerSelectionPresentation(draft: draft).selectedCount, 1)
    }

    func testAddingExerciseReusesExactPreviousPerformanceAndPrepopulatesSets() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
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
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
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
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
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
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        var draft = draft(mode: .past, date: "2026-08-22")
        draft.addExercise(bench)
        XCTAssertNil(draft.exercises.first?.previousPerformance, "Future sessions must not prepopulate a past workout.")
        XCTAssertEqual(draft.exercises.first?.sets.count, 3)
    }

    func testVariantComparisonIsolationUsesVariantHistoryOnly() async throws {
        let config = try await configuration()
        let spider = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "spider-curls" })
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
        let pushdown = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-triceps-pushdown" })
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

    func testSupersetComparisonIsolationUsesCanonicalPartnerIdentity() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" })
        var draft = draft()
        draft.addExercise(bench)
        draft.addExercise(fly)
        let benchId = draft.exercises[0].id
        let flyId = draft.exercises[1].id
        draft.setSuperset(firstId: benchId, secondId: flyId, catalog: config.exercises)
        XCTAssertEqual(draft.relationships.count, 1)
        XCTAssertEqual(draft.relationshipContext(for: benchId)?.partnerCanonicalExerciseIds, ["cable-fly"])
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-08-20")
        XCTAssertEqual(draft.exercises[1].previousPerformance?.workoutDate, "2026-08-20")
        draft.removeSuperset(containing: benchId, catalog: config.exercises)
        XCTAssertTrue(draft.relationships.isEmpty)
        XCTAssertEqual(draft.exercises[0].previousPerformance?.workoutDate, "2026-08-25")
    }

    func testSetEditingAddingAndRemovingRemainCompactAndOrdered() async throws {
        let config = try await configuration()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
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
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" })
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
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "push-ups" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "plank" }))
        let targets = TrainingLoggerNumericFocusOrder.targets(for: draft)
        XCTAssertEqual(targets.filter { $0.exerciseId == draft.exercises[0].id }.map(\.kind), [.reps, .load, .reps, .load, .reps, .load])
        XCTAssertEqual(targets.filter { $0.exerciseId == draft.exercises[1].id }.map(\.kind), Array(repeating: .reps, count: draft.exercises[1].sets.count))
        XCTAssertEqual(targets.filter { $0.exerciseId == draft.exercises[2].id }.map(\.kind), [.duration, .duration, .duration])
        XCTAssertEqual(TrainingLoggerNumericFocusOrder.next(after: targets[0].id, in: draft), targets[1].id)
        XCTAssertNil(TrainingLoggerNumericFocusOrder.next(after: targets.last!.id, in: draft))
    }

    func testSupportingWorkoutEvidencePreservesOrderDeduplicatesAndRemoves() {
        var draft = draft()
        let photo = TrainingLoggerSupportingEvidence(id: "p", displayName: "Health 1.png", source: .photos)
        let file = TrainingLoggerSupportingEvidence(id: "f", displayName: "Health 2.pdf", source: .files)
        draft.addSupportingEvidence([photo, file, photo])
        XCTAssertEqual(draft.supportingEvidenceAssets, [photo, file])
        XCTAssertEqual(draft.supportingWorkoutObservations.first?.sourceEvidenceIds, ["p", "f"])
        draft.removeSupportingEvidence(id: photo.id)
        XCTAssertEqual(draft.supportingEvidenceAssets, [file])
        XCTAssertEqual(draft.supportingWorkoutObservations.first?.sourceEvidenceIds, ["f"])
    }

    func testMixedGymVisitPreservesStrengthDetailAndSeparateCardioOwnership() async throws {
        let config = try await configuration()
        var draft = draft()
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" })
        draft.addExercise(bench)
        draft.addExercise(fly)
        let benchID = draft.exercises[0].id
        draft.applyVariant(config.variants[1], to: benchID, catalog: config.exercises)
        draft.setSuperset(firstId: benchID, secondId: draft.exercises[1].id, catalog: config.exercises)
        draft.exercises[0].sets[0].reps = 8
        draft.exercises[0].sets[0].load = 145
        draft.exercises[0].sets[0].isCompleted = true
        draft.addSupportingEvidence([.init(id: "health", displayName: "Apple Health.png", source: .photos)])

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
        let pushups = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "push-ups" })
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
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" }))
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
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" })
        let lat = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "lat-pulldown" })
        draft.addExercise(bench)
        draft.addExercise(fly)
        let firstId = draft.exercises[0].id
        draft.swapExercise(id: firstId, with: lat)
        XCTAssertEqual(draft.exercises[0].canonicalExerciseId, "lat-pulldown")
        XCTAssertEqual(draft.exercises[0].sets.first?.load, 110)
        draft.swapExercise(id: firstId, with: fly)
        XCTAssertEqual(draft.exercises[0].canonicalExerciseId, "lat-pulldown", "A duplicate canonical exercise must not be created.")
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
        let bench = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" })
        let fly = try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" })
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
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "bench-press" }))
        draft.addExercise(try XCTUnwrap(config.exercises.first { $0.canonicalExerciseId == "cable-fly" }))
        draft.exercises[0].sets[0].isCompleted = true
        draft.exercises[1].sets[0].isCompleted = true
        draft.applyVariant(config.variants[0], to: draft.exercises[0].id, catalog: config.exercises)
        draft.setSuperset(firstId: draft.exercises[0].id, secondId: draft.exercises[1].id, catalog: config.exercises)
        XCTAssertEqual(draft.summary(), .init(exerciseCount: 2, completedSetCount: 2, variantCount: 1, supersetCount: 1))
    }

    func testInteractivePopPolicyEnablesOnlyPushedDestinations() {
        XCTAssertFalse(InteractivePopGesturePolicy.shouldEnable(viewControllerCount: 1))
        XCTAssertTrue(InteractivePopGesturePolicy.shouldEnable(viewControllerCount: 2))
    }

    func testAppDeclaresExemptEncryptionAndBuildTwelveInSourceControlledConfiguration() throws {
        let usesNonExemptEncryption = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool)
        XCTAssertFalse(usesNonExemptEncryption)
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String, "1.0")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String, "12")
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.physiqueos.native.dev")
    }
}
