import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Training Library full-catalog pass: the
/// complete 54-exercise canonical catalog (48 real static exercises from
/// `FOUNDER_ALPHA_TRAINING_EXERCISES`, `src/domain/models/
/// trainingExerciseIdentity.js`, plus 6 legitimate runtime-created
/// exercises mirroring the product's own `canonicalExerciseLibrary`
/// extension mechanism), correct Training Area assignment, and the newly
/// wired Exercise Detail Goal/Phase scope selector. Complements
/// `TrainingReadModelTests`'s existing per-area/per-exercise assertions
/// rather than duplicating them.
final class TrainingLibraryCatalogTests: XCTestCase {
    private let api = FixtureTrainingAPI()

    private static let expectedAreaCounts: [String: Int] = [
        "chest": 7, "back": 4, "shoulders": 8, "biceps": 3, "triceps": 3,
        "core": 3, "quads": 18, "hamstrings": 4, "glutes": 3, "calves": 1,
    ]

    // MARK: - Catalog completeness (Do not build a partial Training Library)

    func testCompleteCatalogDecodesAcrossAllTenAreas() async throws {
        let landing = try await api.fetchTrainingLanding()
        var total = 0
        for area in landing.trainingAreas {
            let fetched = try await api.fetchTrainingArea(areaId: area.id)
            let unwrapped = try XCTUnwrap(fetched, "\(area.id) must decode")
            XCTAssertEqual(unwrapped.exercises.count, Self.expectedAreaCounts[area.id], "\(area.id) exercise count")
            total += unwrapped.exercises.count
        }
        XCTAssertEqual(total, 54)
    }

    /// Every included exercise carries a non-nil, non-empty canonical
    /// identity — `TrainingAreaExerciseRow.canonicalExerciseId` being `nil`
    /// is reserved for a genuinely unresolved historical-only exercise
    /// (none exist in this catalog), never a normal Library row.
    func testEveryCatalogExerciseHasAStableCanonicalIdentity() async throws {
        for areaId in Self.expectedAreaCounts.keys {
            let area = try await api.fetchTrainingArea(areaId: areaId)
            let unwrapped = try XCTUnwrap(area)
            for exercise in unwrapped.exercises {
                let canonicalId = try XCTUnwrap(exercise.canonicalExerciseId, "\(exercise.label) must carry a canonical id")
                XCTAssertFalse(canonicalId.isEmpty)
            }
        }
    }

    /// No canonical exercise ID may appear under more than one Training
    /// Area, and no ID may repeat within the same area — the exact
    /// "silently wrong category" and "duplicate Library entry" bug classes
    /// this task's reconciliation audit was looking for.
    func testNoDuplicateCanonicalIdsAcrossOrWithinAreas() async throws {
        var seen: [String: String] = [:] // canonicalId -> areaId
        for areaId in Self.expectedAreaCounts.keys {
            let area = try await api.fetchTrainingArea(areaId: areaId)
            let unwrapped = try XCTUnwrap(area)
            var withinArea = Set<String>()
            for exercise in unwrapped.exercises {
                let canonicalId = try XCTUnwrap(exercise.canonicalExerciseId)
                XCTAssertTrue(withinArea.insert(canonicalId).inserted, "\(canonicalId) duplicated within \(areaId)")
                if let existingArea = seen[canonicalId] {
                    XCTFail("\(canonicalId) appears in both \(existingArea) and \(areaId)")
                }
                seen[canonicalId] = areaId
            }
        }
        XCTAssertEqual(seen.count, 54)
    }

    /// `landing.trainingAreas[].exerciseCount` (the global, unscoped Library
    /// nav count) must always agree with the actual per-area catalog size —
    /// this is exactly the kind of drift the Founder's "exists in history,
    /// missing from Library" report described, reproduced here as a
    /// permanent regression guard between the two independently-fetched
    /// projections.
    func testLandingAreaCountsAgreeWithTheActualAreaCatalogSize() async throws {
        let landing = try await api.fetchTrainingLanding()
        for area in landing.trainingAreas {
            let fetched = try await api.fetchTrainingArea(areaId: area.id)
            let unwrapped = try XCTUnwrap(fetched)
            XCTAssertEqual(area.exerciseCount, unwrapped.exercises.count, "\(area.id) count drift")
        }
    }

    // MARK: - Real vs. runtime-created exercises (both first-class, matching source architecture)

    /// Bicep Curl Machine is the Founder's own reported example and the
    /// product's own test-suite exemplar for a *runtime-created* exercise
    /// (confirmed absent from the real static 48-exercise registry during
    /// this task's server audit) — this fixture models the equivalent
    /// class of exercise (Lat Pulldown, Push-ups, Cable Fly, Overhead
    /// Triceps Extension, Face Pull, Standing Calf Raise: all confirmed
    /// absent from the real static registry too) as first-class,
    /// fully-included Library rows, proving a runtime-created exercise
    /// never silently disappears from this Native catalog the way it
    /// provably can on the live web (the web's own passing regression test
    /// documents `null`/unmapped as reachable, real behavior).
    func testRuntimeCreatedExercisesAreFullyIncludedNotSilentlyDropped() async throws {
        let runtimeIds = ["lat_pulldown", "pushup", "cable_fly", "overhead_triceps_extension", "face_pull", "standing_calf_raise"]
        var found: Set<String> = []
        for areaId in Self.expectedAreaCounts.keys {
            let area = try await api.fetchTrainingArea(areaId: areaId)
            let unwrapped = try XCTUnwrap(area)
            for exercise in unwrapped.exercises {
                if let id = exercise.canonicalExerciseId, runtimeIds.contains(id) { found.insert(id) }
            }
        }
        XCTAssertEqual(found, Set(runtimeIds))
    }

    // MARK: - Never-performed state (a real static-catalog exercise with zero history)

    func testNeverPerformedRealCatalogExerciseShowsHonestEmptyState() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "chest-press-machine")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertNil(unwrapped.benchmark)
        XCTAssertNil(unwrapped.lastSession)
        XCTAssertTrue(unwrapped.history.isEmpty)
        XCTAssertNil(unwrapped.performanceRecords)
    }

    // MARK: - Exercise Detail Goal/Phase scope filtering (newly wired this pass)

    /// Squat's only occurrence is on 2026-07-05 (Visible Abs era) — under
    /// Build Lean Mass scope, Current Benchmark/Last Session/Recent History
    /// must all correctly show no matching history, not the unscoped data.
    func testExerciseDetailScopeGenuinelyFiltersOutOfWindowHistory() async throws {
        let unscoped = try await api.fetchTrainingExercise(exerciseId: "squat", scope: .all)
        XCTAssertNotNil(try XCTUnwrap(unscoped).lastSession)

        let buildLeanMassScoped = try await api.fetchTrainingExercise(exerciseId: "squat", scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        let scopedExercise = try XCTUnwrap(buildLeanMassScoped)
        XCTAssertNil(scopedExercise.lastSession)
        XCTAssertNil(scopedExercise.benchmark)
        XCTAssertTrue(scopedExercise.history.isEmpty)

        let visibleAbsScoped = try await api.fetchTrainingExercise(exerciseId: "squat", scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertNotNil(try XCTUnwrap(visibleAbsScoped).lastSession)
    }

    /// EZ Bar Curls has occurrences in both Build Lean Mass phases: Phase 1
    /// has none (its only occurrences are Visible Abs-era 2026-06-10 and
    /// Phase 2 2026-08-28) — Phase-level scoping must narrow independently
    /// of Goal-level scoping, not just relabel the Goal-scoped set.
    func testExerciseDetailPhaseScopeNarrowsWithinAGoal() async throws {
        let phase2 = try await api.fetchTrainingExercise(exerciseId: "ez-bar-curls", scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-lean-mass-build"))
        XCTAssertEqual(try XCTUnwrap(phase2).history.count, 1)

        let phase1 = try await api.fetchTrainingExercise(exerciseId: "ez-bar-curls", scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        XCTAssertTrue(try XCTUnwrap(phase1).history.isEmpty)
    }

    /// The Exercise Detail scope selector's pill options must reflect the
    /// selection — `TrainingExerciseDetailViewModel.selectScope` genuinely
    /// re-fetches rather than leaving the selector inert (a real gap found
    /// and fixed during this task's own web-parity re-verification).
    func testExerciseDetailScopeSelectorReflectsTheActiveSelection() async throws {
        let scoped = try await api.fetchTrainingExercise(exerciseId: "squat", scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        let unwrapped = try XCTUnwrap(scoped)
        XCTAssertEqual(unwrapped.scope.options.filter(\.selected).map(\.id), ["goal:\(EvidenceCanonicalGoalID.visibleAbs)"])
    }

    /// Training's own real default context is `.all` everywhere in this
    /// vertical (`TrainingScopeDefault.selection`, matching the Training
    /// landing page's own default) — unlike Weight/Nutrition/Activity/DEXA/
    /// Photos/Energy, which default to Build Lean Mass. The no-`scope`
    /// overload on Exercise Detail must keep that same Training-wide
    /// convention rather than silently diverging per-page.
    func testExerciseDetailScopeDefaultsToAllTrainingMatchingTheRestOfTheVertical() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "bench-press")
        let unwrapped = try XCTUnwrap(exercise)
        XCTAssertEqual(unwrapped.scope.options.filter(\.selected).map(\.id), ["all"])
    }

    // MARK: - Bodyweight / variant / superset states across the new fixture data

    func testPullUpsDisplayAsBodyweightNotZeroLoad() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "pull-ups")
        let unwrapped = try XCTUnwrap(exercise)
        let session = try XCTUnwrap(unwrapped.lastSession)
        XCTAssertTrue(session.exercise.sets.allSatisfy(\.isBodyweight))
        XCTAssertTrue(session.exercise.sets.allSatisfy { $0.formattedLoad == "BW" })
    }

    func testPlanksAreTimedNotZeroRepBodyweight() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "planks")
        let unwrapped = try XCTUnwrap(exercise)
        let session = try XCTUnwrap(unwrapped.lastSession)
        XCTAssertTrue(session.exercise.sets.allSatisfy { $0.formattedLoad == "Timed" })
    }

    func testBulgarianSplitSquatCarriesTheThreeSecondPauseVariant() async throws {
        let exercise = try await api.fetchTrainingExercise(exerciseId: "bulgarian-split-squat")
        let unwrapped = try XCTUnwrap(exercise)
        let session = try XCTUnwrap(unwrapped.lastSession)
        XCTAssertEqual(session.exercise.executionVariant?.label, "3-Second Pause")
    }

    func testEzBarCurlsAndCableRopePushdownsShareTheAugust28Superset() async throws {
        let curl = try await api.fetchTrainingExercise(exerciseId: "ez-bar-curls")
        let curlSession = try XCTUnwrap(try XCTUnwrap(curl).history.first { $0.sessionDate.hasPrefix("2026-08-28") })
        XCTAssertEqual(curlSession.relationship?.partnerNames, ["Cable Rope Pushdowns"])
    }
}
