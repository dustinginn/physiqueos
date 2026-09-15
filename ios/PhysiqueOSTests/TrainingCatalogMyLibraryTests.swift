import XCTest
@testable import PhysiqueOS

/// Build 33: My Library / All Exercises. `pickerExercises` is proven
/// generically in `TrainingLoggerReadModel.swift`'s own model layer;
/// these tests prove the Native VIEW MODEL behavior layered on top —
/// selecting from All Exercises durably persists membership, and Create
/// New Exercise routes through the server's full-catalog duplicate check
/// rather than reimplementing matching policy in Swift.
final class TrainingCatalogMyLibraryTests: XCTestCase {
    private func exercise(
        _ id: String, name: String? = nil, areaId: String = "chest",
        previouslyPerformed: Bool = false, inMyLibrary: Bool? = nil
    ) -> TrainingLoggerCatalogExercise {
        TrainingLoggerCatalogExercise(
            canonicalExerciseId: id, name: name ?? id, areaId: areaId, equipment: nil,
            measurement: .repsLoad, previouslyPerformed: previouslyPerformed, inMyLibrary: inMyLibrary,
            history: [], progressionRecommendation: nil
        )
    }

    func testPickerScopesToMyLibraryByDefaultAndShowsFullCatalogWhenBrowsingAllExercises() {
        var draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-09-14")
        draft.selectedAreaIds = ["chest"]
        let catalog = [
            exercise("bench_press", inMyLibrary: true),
            exercise("dumbbell_reverse_lunge", inMyLibrary: false),
        ]

        let myLibrary = draft.pickerExercises(in: catalog, browseAll: false, query: "")
        XCTAssertEqual(myLibrary.map(\.canonicalExerciseId), ["bench_press"])

        let allExercises = draft.pickerExercises(in: catalog, browseAll: true, query: "")
        XCTAssertEqual(Set(allExercises.map(\.canonicalExerciseId)), ["bench_press", "dumbbell_reverse_lunge"])
    }

    @MainActor
    func testSelectingFromAllExercisesDurablyAddsToMyLibraryAndMarksItLocallyForThisSession() async throws {
        let catalogWriteAPI = RecordingCatalogWriteAPI()
        let api = StubTrainingLoggerAPI(exercises: [exercise("dumbbell_reverse_lunge", inMyLibrary: false)])
        let viewModel = TrainingLoggerViewModel(
            api: api, catalogWriteAPI: catalogWriteAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)

        let target = try XCTUnwrap(viewModel.configuration?.exercises.first)
        XCTAssertEqual(target.inMyLibrary, false)
        viewModel.toggleExerciseSelection(target)

        XCTAssertTrue(viewModel.isSelected(target))
        XCTAssertEqual(viewModel.configuration?.exercises.first?.inMyLibrary, false, "Membership must not be claimed before the canonical write succeeds.")
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(catalogWriteAPI.addedCanonicalExerciseIds, ["dumbbell_reverse_lunge"])
        XCTAssertEqual(viewModel.configuration?.exercises.first?.inMyLibrary, true)
    }

    @MainActor
    func testFailedMembershipWriteDoesNotClaimDurableMembershipAndCanBeRetried() async throws {
        let catalogWriteAPI = RecordingCatalogWriteAPI()
        catalogWriteAPI.failMembership = true
        let api = StubTrainingLoggerAPI(exercises: [exercise("leg_press", inMyLibrary: false)])
        let viewModel = TrainingLoggerViewModel(api: api, catalogWriteAPI: catalogWriteAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        let target = try XCTUnwrap(viewModel.configuration?.exercises.first)
        viewModel.toggleExerciseSelection(target)
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertTrue(viewModel.isSelected(target))
        XCTAssertEqual(viewModel.configuration?.exercises.first?.inMyLibrary, false)
        XCTAssertNotNil(viewModel.validationMessage)
        catalogWriteAPI.failMembership = false
        viewModel.toggleExerciseSelection(target)
        viewModel.toggleExerciseSelection(target)
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(viewModel.configuration?.exercises.first?.inMyLibrary, true)
    }

    @MainActor
    func testDeselectingAnExerciseNeverCallsAddToMyLibrary() async throws {
        let catalogWriteAPI = RecordingCatalogWriteAPI()
        let api = StubTrainingLoggerAPI(exercises: [exercise("bench_press", inMyLibrary: true)])
        let viewModel = TrainingLoggerViewModel(
            api: api, catalogWriteAPI: catalogWriteAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        let target = try XCTUnwrap(viewModel.configuration?.exercises.first)
        viewModel.toggleExerciseSelection(target)
        XCTAssertTrue(viewModel.isSelected(target))

        viewModel.toggleExerciseSelection(target)

        XCTAssertFalse(viewModel.isSelected(target))
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertTrue(catalogWriteAPI.addedCanonicalExerciseIds.isEmpty)
    }

    @MainActor
    func testCreatingAGenuinelyNewExerciseEntersMyLibraryAndTheCurrentWorkoutImmediately() async throws {
        let api = StubTrainingLoggerAPI(exercises: [])
        api.nextFetch = [exercise("chest_supported_row", areaId: "back", inMyLibrary: true)]
        let catalogWriteAPI = RecordingCatalogWriteAPI(createResult: .created(canonicalExerciseId: "chest_supported_row"))
        let viewModel = TrainingLoggerViewModel(
            api: api, catalogWriteAPI: catalogWriteAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        viewModel.isCreatingNewExercise = true

        viewModel.submitNewExercise(name: "Chest Supported Row", areaId: "back")
        try await Task.sleep(nanoseconds: 20_000_000)

        XCTAssertEqual(catalogWriteAPI.createdRequests.first?.canonicalName, "Chest Supported Row")
        XCTAssertEqual(catalogWriteAPI.createdRequests.first?.primaryMuscleGroupId, "back")
        XCTAssertTrue(viewModel.draft?.exercises.contains { $0.canonicalExerciseId == "chest_supported_row" } == true)
        XCTAssertFalse(viewModel.isCreatingNewExercise)
    }

    @MainActor
    func testCreatingADuplicateExerciseRequiresSelectionAndPersistsTheExistingMatch() async throws {
        let api = StubTrainingLoggerAPI(exercises: [])
        api.nextFetch = [exercise("leg_press", areaId: "quads", inMyLibrary: true)]
        let catalogWriteAPI = RecordingCatalogWriteAPI(
            createResult: .duplicate(existingCanonicalExerciseId: "leg_press", existingCanonicalExerciseName: "Leg Press")
        )
        let viewModel = TrainingLoggerViewModel(
            api: api, catalogWriteAPI: catalogWriteAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction
        )
        await viewModel.load()
        viewModel.start(mode: .live)
        viewModel.isCreatingNewExercise = true

        viewModel.submitNewExercise(name: "Leg Presses", areaId: "quads")
        try await Task.sleep(nanoseconds: 20_000_000)

        XCTAssertTrue(catalogWriteAPI.addedCanonicalExerciseIds.isEmpty)
        XCTAssertFalse(viewModel.draft?.exercises.contains { $0.canonicalExerciseId == "leg_press" } == true)
        let candidate = try XCTUnwrap(viewModel.newExerciseCandidates.first)
        await viewModel.selectExistingExercise(candidate)
        XCTAssertEqual(catalogWriteAPI.addedCanonicalExerciseIds, ["leg_press"])
        XCTAssertTrue(viewModel.draft?.exercises.contains { $0.canonicalExerciseId == "leg_press" } == true)
    }

    @MainActor
    func testAmbiguousCatalogMatchesAreNotSelectedUntilFounderChooses() async throws {
        let candidates = [CanonicalExerciseMatch(id: "row_one", name: "Row One"), CanonicalExerciseMatch(id: "row_two", name: "Row Two")]
        let api = StubTrainingLoggerAPI(exercises: [])
        api.nextFetch = [exercise("row_two", name: "Row Two", areaId: "back", inMyLibrary: true)]
        let writes = RecordingCatalogWriteAPI(createResult: .candidates(candidates))
        let viewModel = TrainingLoggerViewModel(api: api, catalogWriteAPI: writes, draftStore: MemoryTrainingLoggerDraftStore(), authority: .founderProduction)
        await viewModel.load()
        viewModel.start(mode: .live)
        viewModel.submitNewExercise(name: "Row", areaId: "back")
        try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(viewModel.newExerciseCandidates, candidates)
        XCTAssertTrue(writes.addedCanonicalExerciseIds.isEmpty)
        XCTAssertTrue(viewModel.draft?.exercises.isEmpty == true)
        await viewModel.selectExistingExercise(candidates[1])
        XCTAssertEqual(writes.addedCanonicalExerciseIds, ["row_two"])
        XCTAssertEqual(viewModel.draft?.exercises.map(\.canonicalExerciseId), ["row_two"])
    }

    @MainActor
    func testSandboxCreateNewExerciseStaysLocalAndProvisionalUnchanged() {
        let api = FixtureTrainingLoggerAPI()
        let catalogWriteAPI = RecordingCatalogWriteAPI()
        let viewModel = TrainingLoggerViewModel(
            api: api, catalogWriteAPI: catalogWriteAPI, draftStore: MemoryTrainingLoggerDraftStore(), authority: .sandbox
        )
        viewModel.draft = TrainingLoggerDraft.fresh(mode: .live, workoutDate: "2026-09-14")
        viewModel.draft?.selectedAreaIds = ["chest"]

        viewModel.submitNewExercise(name: "Brand New Machine", areaId: "chest")

        XCTAssertTrue(viewModel.draft?.exercises.contains { $0.isProvisional && $0.name == "Brand New Machine" } == true)
        XCTAssertTrue(catalogWriteAPI.createdRequests.isEmpty, "Sandbox must never call the production catalog write API.")
    }

    private final class StubTrainingLoggerAPI: TrainingLoggerAPI, @unchecked Sendable {
        private var exercises: [TrainingLoggerCatalogExercise]
        var nextFetch: [TrainingLoggerCatalogExercise]?

        init(exercises: [TrainingLoggerCatalogExercise]) {
            self.exercises = exercises
        }

        func fetchConfiguration() async throws -> TrainingLoggerConfiguration {
            if let nextFetch {
                exercises = nextFetch
                self.nextFetch = nil
            }
            return TrainingLoggerConfiguration(
                areas: [TrainingLoggerArea(id: "chest", label: "Chest"), TrainingLoggerArea(id: "back", label: "Back"), TrainingLoggerArea(id: "quads", label: "Quads")],
                variants: [],
                exercises: exercises
            )
        }
    }

    private final class RecordingCatalogWriteAPI: TrainingExerciseCatalogWriteAPI, @unchecked Sendable {
        var failMembership = false
        private(set) var addedCanonicalExerciseIds: [String] = []
        private(set) var createdRequests: [(canonicalName: String, primaryMuscleGroupId: String)] = []
        private let createResult: CreateCanonicalExerciseOutcome

        init(createResult: CreateCanonicalExerciseOutcome = .created(canonicalExerciseId: "unused")) {
            self.createResult = createResult
        }

        func addToMyLibrary(canonicalExerciseId: String) async throws {
            if failMembership { throw URLError(.notConnectedToInternet) }
            addedCanonicalExerciseIds.append(canonicalExerciseId)
        }

        func createExercise(
            canonicalName: String, primaryMuscleGroupId: String, equipment: String?, aliases: [String]
        ) async throws -> CreateCanonicalExerciseOutcome {
            createdRequests.append((canonicalName, primaryMuscleGroupId))
            return createResult
        }
    }
}
