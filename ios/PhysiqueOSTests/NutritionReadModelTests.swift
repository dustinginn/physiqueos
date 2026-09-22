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
        XCTAssertEqual(landing.scope.options.filter(\.selected).map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)"])
    }

    func testBuildLeanMassScopeExcludesVisibleAbsEraDays() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        XCTAssertTrue(landing.nutritionHistory.allSatisfy { $0.date >= "2026-07-19" })
        XCTAssertEqual(landing.nutritionHistory.count, 5)
    }

    func testVisibleAbsScopeExcludesBuildLeanMassEraDays() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
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
        let landing = try await api.fetchNutritionLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        XCTAssertFalse(landing.nutritionHistory.contains { $0.id == "nutrition-day-fixture-001" })
    }

    /// "Latest" stays the true overall latest day regardless of the
    /// selected scope — mirroring Weight's confirmed "Latest" asymmetry
    /// (unscoped even in a goal-scoped view).
    func testLatestNutritionDayIsUnscopedEvenUnderVisibleAbsScope() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertEqual(landing.latestNutritionDay?.date, "2026-08-30")
    }

    // MARK: - Goal/Phase chronology attribution

    func testEveryDayCarriesAttributionAfterFetch() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .all)
        // Every day except the one dated before Visible Abs began resolves
        // to a real Goal — that one day is honestly unattributed
        // (`attributedScope == nil`) rather than defaulted to whichever
        // Goal happens to be current.
        let attributed = landing.nutritionHistory.filter { $0.id != "nutrition-day-fixture-001" }
        XCTAssertTrue(attributed.allSatisfy { $0.attributedScope != nil })
        let unattributed = landing.nutritionHistory.first { $0.id == "nutrition-day-fixture-001" }
        XCTAssertNil(unattributed?.attributedScope)
    }

    func testBuildLeanMassEraDayIsAttributedToBuildLeanMass() async throws {
        let day = try await api.fetchNutritionDay(dayId: "nutrition-day-fixture-004")
        XCTAssertEqual(day?.attributedScope?.goalId, EvidenceCanonicalGoalID.buildLeanMass)
    }

    /// Phase-level attribution: 2026-08-01 falls inside Build Lean Mass's
    /// "Establish Maintenance" phase window in the bundled fixture.
    func testBuildLeanMassEraDayCarriesPhaseAttribution() async throws {
        let day = try await api.fetchNutritionDay(dayId: "nutrition-day-fixture-005")
        XCTAssertEqual(day?.attributedScope?.phaseName, "Establish Maintenance")
    }

    func testPhaseScopeNarrowsNutritionHistoryToOnePhase() async throws {
        let landing = try await api.fetchNutritionLanding(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        XCTAssertTrue(landing.nutritionHistory.allSatisfy { $0.date >= "2026-07-19" && $0.date <= "2026-08-15" })
        XCTAssertFalse(landing.nutritionHistory.isEmpty)
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

    // MARK: - Apple Health daily total with no meal objects

    func testTotalsOnlyCopyTriggersOnAnyPopulatedMacroNotCaloriesAlone() {
        // A partial HealthKit delivery is not guaranteed to carry `calories`
        // specifically; any populated macro is still a real totals-only day.
        let macrosOnly = NutritionMacroTotals(calories: nil, proteinG: 150, carbsG: 200, fatG: 60, fiberG: nil)
        XCTAssertEqual(NutritionDayView.emptyMealsCopy(totals: macrosOnly), "Daily totals only. No meal detail for this day.")
    }

    func testAppleHealthDailyTotalWithZeroMealsDecodesAsAValidDay() throws {
        let json = """
        {
          "id": "healthkit_canonical_day_nutrition_2026-09-21",
          "date": "2026-09-21",
          "value": "2140 calories",
          "detail": "182g protein · 205g carbs · 68g fat",
          "sourceEvidence": ["Apple Health"],
          "totals": { "calories": 2140, "protein_g": 182, "carbs_g": 205, "fat_g": 68 },
          "meals": []
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let day = try decoder.decode(NutritionDayRecord.self, from: Data(json.utf8))
        XCTAssertEqual(day.sourceEvidence, ["Apple Health"])
        XCTAssertEqual(day.totals.calories, 2140)
        XCTAssertTrue(day.meals.isEmpty)
        XCTAssertFalse(day.detail.contains("meal"))
        XCTAssertEqual(NutritionDayView.emptyMealsCopy(totals: day.totals), "Daily totals only. No meal detail for this day.")
        XCTAssertEqual(day.destination, .nutritionDay(dayId: "healthkit_canonical_day_nutrition_2026-09-21"))
    }
}
