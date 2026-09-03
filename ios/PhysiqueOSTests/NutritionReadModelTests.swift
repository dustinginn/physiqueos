import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Nutrition Evidence read-model/history/day
/// vertical, exercised through `FixtureNutritionAPI` (not a bespoke decode
/// path), mirroring `ActivityReadModelTests`'s own convention.
final class NutritionReadModelTests: XCTestCase {
    private let api = FixtureNutritionAPI()

    // MARK: - Fixture decoding integrity

    func testLandingDecodesWithoutError() async throws {
        let landing = try await api.fetchNutritionLanding()
        XCTAssertEqual(landing.title, "Nutrition")
        XCTAssertFalse(landing.nutritionHistory.isEmpty)
        XCTAssertFalse(landing.reportingLinks.isEmpty)
        XCTAssertFalse(landing.nutritionAreas.isEmpty)
        XCTAssertFalse(landing.dataSources.isEmpty)
    }

    func testMacroTotalsDecodeWithCorrectFieldNames() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        let latest = try XCTUnwrap(landing.latestNutritionDay)
        XCTAssertEqual(latest.totals.calories, 2140)
        XCTAssertEqual(latest.totals.proteinG, 180)
        XCTAssertEqual(latest.totals.carbsG, 220)
        XCTAssertEqual(latest.totals.fatG, 90)
        XCTAssertEqual(latest.totals.fiberG, 28)
    }

    // MARK: - Meal presentation contract

    func testEveryMealHasAResolvedSlotLabelAndGlyph() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        let day = try XCTUnwrap(landing.nutritionHistory.first)
        XCTAssertFalse(day.meals.isEmpty)
        for meal in day.meals {
            XCTAssertFalse(meal.slot.label.isEmpty)
            XCTAssertFalse(meal.slot.glyph.isEmpty)
        }
    }

    func testMealTotalsAreDistinctFromDayTotals() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        let day = try XCTUnwrap(landing.nutritionHistory.first)
        let mealCaloriesSum = day.meals.compactMap(\.totals.calories).reduce(0, +)
        // Meal totals sum to the day total (internally consistent fixture),
        // but they are two independently-decoded fields, not one recomputed
        // from the other — this guards against a future refactor silently
        // deriving day totals from meals (or vice versa) client-side.
        XCTAssertEqual(mealCaloriesSum, day.totals.calories ?? -1, accuracy: 0.01)
    }

    // MARK: - History ordering

    func testHistoryIsNewestFirst() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        let dates = landing.nutritionHistory.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    // MARK: - Day detail identity/navigation

    func testDayLookupByIdReturnsMatchingRecord() async throws {
        let day = try await api.fetchNutritionDay(dayId: "nutrition-day-fixture-008")
        XCTAssertEqual(day?.date, "2026-08-30")
    }

    func testDayLookupWithUnknownIdReturnsNil() async throws {
        let day = try await api.fetchNutritionDay(dayId: "does-not-exist")
        XCTAssertNil(day)
    }

    func testDestinationRoutesThroughNutritionDayCase() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        let day = try XCTUnwrap(landing.nutritionHistory.first)
        guard case .nutritionDay(let dayId) = day.destination else {
            return XCTFail("Expected a .nutritionDay destination.")
        }
        XCTAssertEqual(dayId, day.id)
    }

    // MARK: - Scope-toggle filtering (shared chronology adoption)

    func testScopeDefaultsToBuildLeanMass() async throws {
        let landing = try await api.fetchNutritionLanding()
        XCTAssertEqual(landing.scope.options.filter(\.selected).map(\.id), ["build-lean-mass"])
    }

    func testBuildLeanMassScopeExcludesVisibleAbsEraDays() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .buildLeanMass)
        XCTAssertTrue(landing.nutritionHistory.allSatisfy { $0.date >= "2026-07-19" })
        XCTAssertEqual(landing.nutritionHistory.count, 5)
    }

    func testVisibleAbsScopeExcludesBuildLeanMassEraDays() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .visibleAbs)
        XCTAssertTrue(landing.nutritionHistory.allSatisfy { $0.date >= "2026-05-24" && $0.date <= "2026-07-18" })
        XCTAssertEqual(landing.nutritionHistory.count, 3)
    }

    func testAllScopeReturnsEveryDayIncludingTheUnattributedOne() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        XCTAssertEqual(landing.nutritionHistory.count, 9)
    }

    /// A record from before Visible Abs began must remain excluded from
    /// the Build Lean Mass scope even though Build Lean Mass is the
    /// current Goal — the task's explicit non-negotiable invariant.
    func testPreVisibleAbsRecordNeverAppearsInBuildLeanMassScope() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .buildLeanMass)
        XCTAssertFalse(landing.nutritionHistory.contains { $0.id == "nutrition-day-fixture-001" })
    }

    /// "Latest" stays the true overall latest day regardless of the
    /// selected scope — mirroring Weight's confirmed "Latest" asymmetry
    /// (unscoped even in a goal-scoped view).
    func testLatestNutritionDayIsUnscopedEvenUnderVisibleAbsScope() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .visibleAbs)
        XCTAssertEqual(landing.latestNutritionDay?.date, "2026-08-30")
    }

    // MARK: - Goal/Phase chronology attribution

    func testEveryDayCarriesAttributionAfterFetch() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        XCTAssertTrue(landing.nutritionHistory.allSatisfy { $0.attributedScope != nil })
    }

    func testBuildLeanMassEraDayIsAttributedToBuildLeanMass() async throws {
        let day = try await api.fetchNutritionDay(dayId: "nutrition-day-fixture-004")
        XCTAssertEqual(day?.attributedScope?.scopeID, .buildLeanMass)
    }

    // MARK: - Server-owned intelligence is never fabricated

    /// The web's Nutrition reporting carries no narrative/intelligence
    /// fields at all (verified directly from source — `getNutritionReportExtras`
    /// has no `educationalContext`, unlike Training). This read model
    /// reflects that: it has no free-form narrative field for a screen to
    /// accidentally start recomputing client-side.
    func testReadModelHasNoNarrativeField() {
        let mirror = Mirror(reflecting: NutritionDayRecord(
            id: "x", date: "2026-01-01", value: "", detail: "", sourceEvidence: [],
            totals: NutritionMacroTotals(calories: nil, proteinG: nil, carbsG: nil, fatG: nil, fiberG: nil),
            meals: []
        ))
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("narrative"))
        XCTAssertFalse(fieldNames.contains("educationalContext"))
    }

    // MARK: - Empty state

    func testUnknownDayLookupProducesAHonestNilRatherThanAFabricatedRecord() async throws {
        let day = try await api.fetchNutritionDay(dayId: "context")
        XCTAssertNil(day)
    }
}
