import XCTest
@testable import PhysiqueOS

/// Regression coverage for the 3 real Nutrition Reporting screens
/// (Calories/Macros/Meals) — previously reduced to informational rows,
/// now ported. Exercises `NutritionReportingCalculator` directly (pure
/// aggregation logic) and `FixtureNutritionAPI.fetchNutritionReporting`
/// (integration: scope filtering, range filtering, navigation validity).
final class NutritionReportingCalculatorTests: XCTestCase {
    private let api = FixtureNutritionAPI()

    private func day(_ id: String, _ date: String, calories: Double, protein: Double, carbs: Double, fat: Double, meals: [NutritionMealRecord] = []) -> NutritionDayRecord {
        NutritionDayRecord(
            id: id, date: date, value: "\(Int(calories)) calories", detail: "", sourceEvidence: [],
            totals: NutritionMacroTotals(calories: calories, proteinG: protein, carbsG: carbs, fatG: fat, fiberG: nil),
            meals: meals
        )
    }

    private func meal(_ id: String, slot: NutritionMealSlot, calories: Double, protein: Double, carbs: Double, fat: Double, foodNames: [String]) -> NutritionMealRecord {
        NutritionMealRecord(
            id: id, slot: slot, name: nil, completeness: "complete",
            totals: NutritionMacroTotals(calories: calories, proteinG: protein, carbsG: carbs, fatG: fat, fiberG: nil),
            foods: foodNames.enumerated().map { NutritionFoodRecord(id: "\(id)-\($0.offset)", name: $0.element, brand: nil, servingSize: nil, servings: 1) },
            additionalFoodsDetected: false
        )
    }

    // MARK: - Week bucketing (Sunday–Saturday)

    func testWeekBucketsGroupSundayThroughSaturday() {
        // 2026-08-16 is a Sunday; 2026-08-22 is the following Saturday.
        let days = [day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70), day("b", "2026-08-22", calories: 2100, protein: 155, carbs: 205, fat: 72)]
        let weeks = NutritionReportingCalculator.weekBuckets(days: days)
        XCTAssertEqual(weeks.count, 1)
        XCTAssertEqual(weeks.first?.weekStart, "2026-08-16")
        XCTAssertEqual(weeks.first?.weekEnd, "2026-08-22")
        XCTAssertEqual(weeks.first?.days.count, 2)
    }

    func testWeekBucketsSplitAcrossAWeekBoundary() {
        let days = [day("a", "2026-08-22", calories: 2000, protein: 150, carbs: 200, fat: 70), day("b", "2026-08-23", calories: 2100, protein: 155, carbs: 205, fat: 72)]
        let weeks = NutritionReportingCalculator.weekBuckets(days: days)
        XCTAssertEqual(weeks.count, 2)
    }

    // MARK: - Range filtering

    func testRangeFilteredKeepsOnlyTheLastNMonthsFromTheLatestDay() {
        let days = [day("a", "2026-01-01", calories: 2000, protein: 150, carbs: 200, fat: 70), day("b", "2026-08-30", calories: 2100, protein: 155, carbs: 205, fat: 72)]
        let oneMonth = NutritionReportingCalculator.rangeFiltered(days: days, range: .oneMonth)
        XCTAssertEqual(oneMonth.map(\.id), ["b"])
        let all = NutritionReportingCalculator.rangeFiltered(days: days, range: .all)
        XCTAssertEqual(all.count, 2)
    }

    // MARK: - Calories report

    func testCaloriesPeriodSummaryComputesAverageAndExtremes() {
        let days = [
            day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70),
            day("b", "2026-08-17", calories: 2200, protein: 160, carbs: 210, fat: 75),
            day("c", "2026-08-18", calories: 1800, protein: 140, carbs: 190, fat: 65),
        ]
        let report = NutritionReportingCalculator.caloriesReport(days: days)
        let byLabel = Dictionary(uniqueKeysWithValues: report.periodSummary.map { ($0.label, $0.value) })
        XCTAssertEqual(byLabel["Average Calories"], "2000")
        XCTAssertTrue(byLabel["Highest Day"]?.hasPrefix("2200") ?? false)
        XCTAssertTrue(byLabel["Lowest Day"]?.hasPrefix("1800") ?? false)
    }

    func testCaloriesTargetLabelIsAlwaysUnavailable() {
        let report = NutritionReportingCalculator.caloriesReport(days: [])
        XCTAssertEqual(report.targetLabel, "Target unavailable for this period")
    }

    func testCaloriesWeeklyTrendDropsWeeksWithNoLoggedCalories() {
        let unlogged = NutritionDayRecord(id: "x", date: "2026-08-16", value: "", detail: "", sourceEvidence: [], totals: NutritionMacroTotals(calories: nil, proteinG: nil, carbsG: nil, fatG: nil, fiberG: nil), meals: [])
        let report = NutritionReportingCalculator.caloriesReport(days: [unlogged])
        XCTAssertNil(report.weeklyTrend.first?.value)
    }

    // MARK: - Macros report (distribution percentages, per-macro divisors)

    func testMacroDistributionSumsToExactlyOneHundredPercent() {
        // Equal grams of protein/carbs/fat -> unequal calorie shares
        // (4/4/9 kcal-per-gram), matching the web's own worked example.
        let days = [day("a", "2026-08-16", calories: 0, protein: 100, carbs: 100, fat: 100)]
        let distribution = NutritionReportingCalculator.macroDistribution(days: days)
        XCTAssertEqual(distribution.reduce(0) { $0 + $1.percentage }, 100)
    }

    func testMacroDistributionIsEmptyWhenNoMacrosLogged() {
        let days = [NutritionDayRecord(id: "x", date: "2026-08-16", value: "", detail: "", sourceEvidence: [], totals: NutritionMacroTotals(calories: nil, proteinG: nil, carbsG: nil, fatG: nil, fiberG: nil), meals: [])]
        XCTAssertTrue(NutritionReportingCalculator.macroDistribution(days: days).isEmpty)
    }

    func testAverageDailyMacrosUsesPerMacroLoggedDayDivisors() throws {
        let missingFat = NutritionDayRecord(id: "a", date: "2026-08-16", value: "", detail: "", sourceEvidence: [], totals: NutritionMacroTotals(calories: 2000, proteinG: 150, carbsG: 200, fatG: nil, fiberG: nil), meals: [])
        let full = day("b", "2026-08-17", calories: 2000, protein: 150, carbs: 200, fat: 80)
        let bars = NutritionReportingCalculator.averageDailyMacros(days: [missingFat, full])
        let fatBar = try XCTUnwrap(bars.first { $0.id == .fat })
        // Fat's average is computed over 1 logged day (80), not 2 -> 80, not 40.
        XCTAssertEqual(fatBar.averageGrams, 80)
        XCTAssertEqual(fatBar.loggedDayCount, 1)
    }

    func testMacrosReportSummaryReflectsTheSelectedMacro() {
        let days = [day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70)]
        let proteinReport = NutritionReportingCalculator.macrosReport(days: days, selectedMacro: .protein)
        XCTAssertEqual(proteinReport.periodSummary.first { $0.label == "Average per Logged Day" }?.value, "150g")
        let fatReport = NutritionReportingCalculator.macrosReport(days: days, selectedMacro: .fat)
        XCTAssertEqual(fatReport.periodSummary.first { $0.label == "Average per Logged Day" }?.value, "70g")
    }

    // MARK: - Meals report (distribution, macro mix, trend, recurring)

    func testMealDistributionCoversAllFourSlotsEvenWhenEmpty() {
        let d = day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [meal("m1", slot: .breakfast, calories: 500, protein: 40, carbs: 50, fat: 15, foodNames: ["Oatmeal"])])
        let distribution = NutritionReportingCalculator.mealDistribution(days: [d])
        XCTAssertEqual(Set(distribution.map(\.id)), [.breakfast, .lunch, .dinner, .snacks])
        XCTAssertEqual(distribution.first { $0.id == .breakfast }?.occurrenceCount, 1)
        XCTAssertEqual(distribution.first { $0.id == .lunch }?.occurrenceCount, 0)
    }

    func testMealMacroMixFiltersBySlot() {
        let d = day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [
            meal("m1", slot: .breakfast, calories: 500, protein: 40, carbs: 50, fat: 15, foodNames: ["Oatmeal"]),
            meal("m2", slot: .dinner, calories: 700, protein: 60, carbs: 60, fat: 25, foodNames: ["Salmon"]),
        ])
        let breakfastOnly = NutritionReportingCalculator.mealMacroMix(days: [d], slotFilter: .breakfast)
        let all = NutritionReportingCalculator.mealMacroMix(days: [d], slotFilter: .all)
        XCTAssertEqual(breakfastOnly.first { $0.id == .protein }?.grams, 40)
        XCTAssertEqual(all.first { $0.id == .protein }?.grams, 100)
    }

    func testMealTrendMealCountMetricCountsOccurrencesNotAverages() {
        let d = day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [
            meal("m1", slot: .breakfast, calories: 500, protein: 40, carbs: 50, fat: 15, foodNames: ["Oatmeal"]),
            meal("m2", slot: .dinner, calories: 700, protein: 60, carbs: 60, fat: 25, foodNames: ["Salmon"]),
        ])
        let trend = NutritionReportingCalculator.mealTrend(days: [d], slotFilter: .all, metric: .mealCount)
        XCTAssertEqual(trend.first?.value, 2)
    }

    func testRecurringMealsRequiresAtLeastTwoExactOccurrences() {
        let repeated = meal("m1", slot: .breakfast, calories: 500, protein: 40, carbs: 50, fat: 15, foodNames: ["Egg Whites", "Oatmeal"])
        let days = [
            day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [repeated]),
            day("b", "2026-08-17", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [repeated]),
            day("c", "2026-08-18", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [meal("m2", slot: .lunch, calories: 600, protein: 50, carbs: 55, fat: 18, foodNames: ["Turkey Sandwich"])]),
        ]
        let recurring = NutritionReportingCalculator.recurringMeals(days: days)
        XCTAssertEqual(recurring.count, 1)
        XCTAssertEqual(recurring.first?.occurrenceCount, 2)
        XCTAssertEqual(recurring.first?.slot, .breakfast)
        XCTAssertEqual(recurring.first?.averageCalories, 500)
        XCTAssertEqual(recurring.first?.averageProteinG, 40)
        XCTAssertEqual(recurring.first?.averageCarbohydratesG, 50)
        XCTAssertEqual(recurring.first?.averageFatG, 15)
    }

    func testHistoryGroupsAreNewestFirstWithMealsInCanonicalSlotOrder() {
        let d = day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [
            meal("m1", slot: .dinner, calories: 700, protein: 60, carbs: 60, fat: 25, foodNames: ["Salmon"]),
            meal("m2", slot: .breakfast, calories: 500, protein: 40, carbs: 50, fat: 15, foodNames: ["Oatmeal"]),
        ])
        let groups = NutritionReportingCalculator.historyGroups(days: [d])
        XCTAssertEqual(groups.first?.meals.map(\.slot), [.breakfast, .dinner])
    }

    func testWeeklyMealRowsPreservePerSlotCountsAndAverages() {
        let d = day("a", "2026-08-16", calories: 2000, protein: 150, carbs: 200, fat: 70, meals: [
            meal("m1", slot: .breakfast, calories: 500, protein: 40, carbs: 50, fat: 15, foodNames: ["Oatmeal"]),
            meal("m2", slot: .dinner, calories: 700, protein: 60, carbs: 60, fat: 25, foodNames: ["Salmon"]),
        ])
        let row = NutritionReportingCalculator.weeklyMealRows(days: [d]).first
        XCTAssertEqual(row?.slots.first { $0.slot == .breakfast }?.occurrenceCount, 1)
        XCTAssertEqual(row?.slots.first { $0.slot == .breakfast }?.averageCalories, 500)
        XCTAssertEqual(row?.slots.first { $0.slot == .dinner }?.averageCalories, 700)
        XCTAssertEqual(row?.slots.first { $0.slot == .lunch }?.occurrenceCount, 0)
    }

    // MARK: - API integration: report dispatch, scope, navigation

    func testUnknownReportIdReturnsNilRatherThanCrashing() async throws {
        let report = try await api.fetchNutritionReporting(
            reportId: "adherence", scope: .all, range: .all, macro: .protein,
            mealMacroMixSlot: .all, mealTrendSlot: .all, mealTrendMetric: .calories
        )
        XCTAssertNil(report)
    }

    func testCaloriesReportRespectsGoalScopeFiltering() async throws {
        let buildLeanMass = try await api.fetchNutritionReporting(
            reportId: "calories", scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass), range: .all, macro: .protein,
            mealMacroMixSlot: .all, mealTrendSlot: .all, mealTrendMetric: .calories
        )
        let visibleAbs = try await api.fetchNutritionReporting(
            reportId: "calories", scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs), range: .all, macro: .protein,
            mealMacroMixSlot: .all, mealTrendSlot: .all, mealTrendMetric: .calories
        )
        XCTAssertNotEqual(buildLeanMass?.calories?.dailyRows.count, visibleAbs?.calories?.dailyRows.count)
        XCTAssertFalse(buildLeanMass?.calories?.dailyRows.isEmpty ?? true)
        XCTAssertFalse(visibleAbs?.calories?.dailyRows.isEmpty ?? true)
    }

    func testMacrosReportDefaultsScopeToBuildLeanMassMatchingLandingPage() async throws {
        let report = try await api.fetchNutritionReporting(
            reportId: "macros", scope: NutritionScopeDefault.selection, range: .all, macro: .carbohydrates,
            mealMacroMixSlot: .all, mealTrendSlot: .all, mealTrendMetric: .calories
        )
        XCTAssertEqual(report?.scope.options.filter(\.selected).map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)"])
        XCTAssertEqual(report?.macros?.selectedMacro, .carbohydrates)
    }

    func testMealsReportCarriesDataSources() async throws {
        let report = try await api.fetchNutritionReporting(
            reportId: "meals", scope: .all, range: .all, macro: .protein,
            mealMacroMixSlot: .dinner, mealTrendSlot: .all, mealTrendMetric: .calories
        )
        XCTAssertFalse(report?.dataSources.isEmpty ?? true)
        XCTAssertEqual(report?.meals?.selectedMacroMixSlot, .dinner)
    }

    // MARK: - Landing page navigation wiring

    func testReportingLinksNavigateToTheRealReportDestinationsFromTheLandingPage() async throws {
        let landing = try await api.fetchNutritionLanding()
        let ids = Set(landing.reportingLinks.map(\.id))
        XCTAssertEqual(ids, ["calories", "macros", "meals"])
        for link in landing.reportingLinks {
            guard case .progressStream(let streamId) = link.destination else {
                return XCTFail("Expected a progressStream destination for \(link.id).")
            }
            XCTAssertEqual(streamId, "nutrition/reporting/\(link.id)")
        }
    }

    func testNutritionAreasRowsStayInformationalWithNoDestination() async throws {
        let landing = try await api.fetchNutritionLanding()
        XCTAssertTrue(landing.nutritionAreas.allSatisfy { $0.destination == nil })
    }

    // MARK: - Zero-meal daily totals (Apple Health)

    func testAverageMealsPerLoggedDayIgnoresDaysThatCarryTotalsButNoMealDetail() {
        let breakfast = meal("m1", slot: .breakfast, calories: 500, protein: 30, carbs: 50, fat: 15, foodNames: ["Oats"])
        let lunch = meal("m2", slot: .lunch, calories: 700, protein: 45, carbs: 60, fat: 20, foodNames: ["Rice"])
        let days = [
            day("detailed", "2026-09-19", calories: 2100, protein: 150, carbs: 200, fat: 70, meals: [breakfast, lunch]),
            day("healthkit", "2026-09-21", calories: 2140, protein: 182, carbs: 205, fat: 68, meals: []),
        ]
        let report = NutritionReportingCalculator.mealsReport(days: days, macroMixSlot: .all, trendSlot: .all, trendMetric: .mealCount)
        let average = report.periodSummary.first { $0.label == "Average Meals per Detailed Day" }
        // Locale-independent: parse back rather than compare the formatted string,
        // since String(format:) can localize the decimal separator.
        XCTAssertEqual(Double(average?.value ?? ""), 2.0)
        // Both days are still logged days; the totals-only day is not dropped.
        XCTAssertEqual(report.periodSummary.first { $0.label == "Logged Days" }?.value, "2 days")
    }

    func testTotalsOnlyDaysStillFeedTheCalorieAndMacroReports() {
        let days = [day("healthkit", "2026-09-21", calories: 2140, protein: 182, carbs: 205, fat: 68, meals: [])]
        let calories = NutritionReportingCalculator.caloriesReport(days: days)
        XCTAssertFalse(calories.periodSummary.isEmpty)
        XCTAssertNotNil(NutritionReportingCalculator.macrosReport(days: days, selectedMacro: .protein))
    }

    func testAMealsOnlyPeriodWithNoMealDetailStaysPendingNotZero() {
        let days = [day("healthkit", "2026-09-21", calories: 2140, protein: 182, carbs: 205, fat: 68, meals: [])]
        let report = NutritionReportingCalculator.mealsReport(days: days, macroMixSlot: .all, trendSlot: .all, trendMetric: .mealCount)
        XCTAssertEqual(report.periodSummary.first { $0.label == "Average Meals per Detailed Day" }?.value, "Pending")
    }

    func testTotalsOnlyDayIsDescribedAsTotalsOnlyNeverAsMissing() {
        let totals = NutritionMacroTotals(calories: 2140, proteinG: 182, carbsG: 205, fatG: 68, fiberG: nil)
        XCTAssertEqual(NutritionDayView.emptyMealsCopy(totals: totals), "Daily totals only. No meal detail for this day.")
        XCTAssertEqual(NutritionDayView.emptyMealsCopy(totals: NutritionMacroTotals(calories: nil, proteinG: nil, carbsG: nil, fatG: nil, fiberG: nil)), "No meals recorded for this day.")
    }
}
