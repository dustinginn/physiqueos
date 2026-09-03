import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Energy Evidence vertical, exercised through
/// `FixtureEnergyAPI`. Energy has no sub-routes on the web (one page is the
/// entire vertical — see `EnergyReadModel.swift`'s doc comment), so this
/// file covers decoding, per-day derivation math, weekly aggregation,
/// Goal/Phase attribution and filtering, boundary dates, and empty states.
final class EnergyReadModelTests: XCTestCase {
    private let api = FixtureEnergyAPI()

    // MARK: - Fixture decoding integrity

    func testReportDecodesWithoutError() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        XCTAssertEqual(report.title, "Energy")
        XCTAssertEqual(report.heading, "Energy Balance")
        XCTAssertFalse(report.dailyHistory.isEmpty)
        XCTAssertFalse(report.dataSources.isEmpty)
    }

    func testScopeDefaultsToBuildLeanMass() async throws {
        let report = try await api.fetchEnergyReport()
        XCTAssertEqual(report.scope.options.filter(\.selected).map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)"])
    }

    // MARK: - Per-day derivation (`finalizeRow`)

    func testEstimatedExpenditureRequiresBothRMRAndActiveCalories() {
        let bothPresent = EnergyDayFixture(id: "a", date: "2026-08-16", calorieIntake: 2600, activeCalories: 600, hasActivityRecord: true, rmr: 2220)
        XCTAssertEqual(EnergyEvidenceCalculator.estimatedExpenditure(bothPresent), 2820)

        let missingRMR = EnergyDayFixture(id: "b", date: "2026-08-16", calorieIntake: 2600, activeCalories: 600, hasActivityRecord: true, rmr: nil)
        XCTAssertNil(EnergyEvidenceCalculator.estimatedExpenditure(missingRMR))

        let missingActive = EnergyDayFixture(id: "c", date: "2026-08-16", calorieIntake: 2600, activeCalories: nil, hasActivityRecord: true, rmr: 2220)
        XCTAssertNil(EnergyEvidenceCalculator.estimatedExpenditure(missingActive))
    }

    func testEnergyBalanceRequiresBothIntakeAndExpenditure() {
        let complete = EnergyDayFixture(id: "a", date: "2026-08-16", calorieIntake: 2600, activeCalories: 600, hasActivityRecord: true, rmr: 2220)
        XCTAssertEqual(EnergyEvidenceCalculator.energyBalance(complete), -220)

        let noIntake = EnergyDayFixture(id: "b", date: "2026-08-16", calorieIntake: nil, activeCalories: 600, hasActivityRecord: true, rmr: 2220)
        XCTAssertNil(EnergyEvidenceCalculator.energyBalance(noIntake))
    }

    /// Verbatim decision order from `finalizeRow` — every one of the 5
    /// completeness states must be reachable and correctly classified.
    func testCompletenessClassificationCoversAllFiveStates() {
        let complete = EnergyDayFixture(id: "a", date: "d", calorieIntake: 2600, activeCalories: 600, hasActivityRecord: true, rmr: 2220)
        XCTAssertEqual(EnergyEvidenceCalculator.completeness(complete), "complete")

        let nutritionOnly = EnergyDayFixture(id: "b", date: "d", calorieIntake: 2300, activeCalories: nil, hasActivityRecord: false, rmr: 2160)
        XCTAssertEqual(EnergyEvidenceCalculator.completeness(nutritionOnly), "nutrition-only")

        let activityOnly = EnergyDayFixture(id: "c", date: "d", calorieIntake: nil, activeCalories: 600, hasActivityRecord: true, rmr: 2185)
        XCTAssertEqual(EnergyEvidenceCalculator.completeness(activityOnly), "activity-only")

        let missingRMR = EnergyDayFixture(id: "d", date: "d", calorieIntake: 2400, activeCalories: 550, hasActivityRecord: true, rmr: nil)
        XCTAssertEqual(EnergyEvidenceCalculator.completeness(missingRMR), "missing-rmr")

        let noPairedEvidence = EnergyDayFixture(id: "e", date: "d", calorieIntake: nil, activeCalories: nil, hasActivityRecord: false, rmr: 2185)
        XCTAssertEqual(EnergyEvidenceCalculator.completeness(noPairedEvidence), "no-paired-evidence")
    }

    // MARK: - Value formatting

    func testFormatCaloriesAndSignedCalories() {
        XCTAssertEqual(EnergyEvidenceCalculator.formatCalories(2600), "2600 kcal")
        XCTAssertEqual(EnergyEvidenceCalculator.formatCalories(nil), "Not available")
        XCTAssertEqual(EnergyEvidenceCalculator.formatSignedCalories(220), "+220 kcal")
        XCTAssertEqual(EnergyEvidenceCalculator.formatSignedCalories(-220), "-220 kcal")
        XCTAssertEqual(EnergyEvidenceCalculator.formatSignedCalories(0), "0 kcal")
        XCTAssertEqual(EnergyEvidenceCalculator.formatSignedCalories(nil), "Not available")
    }

    // MARK: - History ordering

    func testDailyHistoryIsNewestFirst() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let dates = report.dailyHistory.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    func testWeeklyHistoryIsNewestFirst() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let starts = report.weeklyHistory.map(\.weekStart)
        XCTAssertEqual(starts, starts.sorted(by: >))
    }

    func testWeeklyTrendIsOldestFirst() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let starts = report.weeklyTrend.map(\.weekStart)
        XCTAssertEqual(starts, starts.sorted(by: <))
    }

    // MARK: - Goal/Phase attribution and filtering

    /// One fixture day (2026-05-20) deliberately predates the Visible Abs
    /// Goal's own `startDate` (2026-05-24) — every day on/after every real
    /// canonical Goal's start must carry attribution, but that one
    /// intentionally out-of-window day must not, proving out-of-window
    /// records are honestly left unattributed rather than guessed at (see
    /// `EvidenceChronology.attribution`'s own doc comment) instead of a
    /// blanket "every row always has a chip" assumption.
    func testEveryDailyRowWithinAKnownGoalWindowCarriesAttribution() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let withinGoalWindow = report.dailyHistory.filter { $0.date != "2026-05-20" }
        XCTAssertFalse(withinGoalWindow.isEmpty)
        XCTAssertTrue(withinGoalWindow.allSatisfy { $0.attributedScope != nil })
    }

    func testDayBeforeEveryCanonicalGoalStartIsHonestlyUnattributed() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let beforeAnyGoal = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-05-20" })
        XCTAssertNil(beforeAnyGoal.attributedScope)
    }

    func testVisibleAbsScopeExcludesBuildLeanMassEraDays() async throws {
        let report = try await api.fetchEnergyReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertTrue(report.dailyHistory.allSatisfy { $0.date >= "2026-05-24" && $0.date <= "2026-07-18" })
        XCTAssertEqual(report.dailyHistory.count, 3)
    }

    func testBuildLeanMassScopeExcludesVisibleAbsEraDays() async throws {
        let report = try await api.fetchEnergyReport(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        XCTAssertTrue(report.dailyHistory.allSatisfy { $0.date >= "2026-07-19" })
        XCTAssertEqual(report.dailyHistory.count, 11)
    }

    /// Build Lean Mass Phase 1 ("Establish Maintenance", 2026-07-19...
    /// 2026-08-15) vs Phase 2 ("Lean Mass Build", 2026-08-16...) must
    /// remain genuinely distinguishable — neither phase's days leak into
    /// the other's filtered view.
    func testPhaseScopeNarrowsToOnePhase() async throws {
        let phase1 = try await api.fetchEnergyReport(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        XCTAssertEqual(phase1.dailyHistory.count, 5)
        XCTAssertTrue(phase1.dailyHistory.allSatisfy { $0.date >= "2026-07-19" && $0.date <= "2026-08-15" })

        let phase2 = try await api.fetchEnergyReport(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-lean-mass-build"))
        XCTAssertEqual(phase2.dailyHistory.count, 6)
        XCTAssertTrue(phase2.dailyHistory.allSatisfy { $0.date >= "2026-08-16" })
    }

    // MARK: - Boundary dates

    func testLastVisibleAbsDayOwnedByVisibleAbs() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let boundaryDay = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-07-18" })
        XCTAssertEqual(boundaryDay.attributedScope?.goalId, EvidenceCanonicalGoalID.visibleAbs)
    }

    func testFirstPhase1DayOwnedByEstablishMaintenance() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let boundaryDay = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-07-19" })
        XCTAssertEqual(boundaryDay.attributedScope?.phaseName, "Establish Maintenance")
    }

    func testLastPhase1DayOwnedByEstablishMaintenanceNotLeanMassBuild() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let boundaryDay = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-08-15" })
        XCTAssertEqual(boundaryDay.attributedScope?.phaseName, "Establish Maintenance")
    }

    func testFirstPhase2DayOwnedByLeanMassBuildNotEstablishMaintenance() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let boundaryDay = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-08-16" })
        XCTAssertEqual(boundaryDay.attributedScope?.phaseName, "Lean Mass Build")
    }

    // MARK: - Timezone-safety of date-only fields (Pacific / far-ahead UTC)

    func testDateOnlyFormattingIsUnaffectedByDeviceTimeZone() {
        let originalTimeZone = NSTimeZone.default
        defer { NSTimeZone.default = originalTimeZone }

        NSTimeZone.default = TimeZone(identifier: "America/Los_Angeles")!
        let pacific = TrainingDateFormatting.short("2026-08-16")

        NSTimeZone.default = TimeZone(identifier: "Pacific/Kiritimati")!
        let farAheadUTC = TrainingDateFormatting.short("2026-08-16")

        XCTAssertEqual(pacific, "Aug 16")
        XCTAssertEqual(pacific, farAheadUTC)
    }

    // MARK: - Weekly aggregation

    func testWeekBucketsGroupBySundayStartAndComputeAverages() {
        let days = [
            EnergyDayRecord(id: "a", date: "2026-08-16", calorieIntake: 2600, activeCalories: 600, estimatedExpenditure: 2820, energyBalance: -220, completeness: "complete"),
            EnergyDayRecord(id: "b", date: "2026-08-18", calorieIntake: 2650, activeCalories: 610, estimatedExpenditure: 2830, energyBalance: -180, completeness: "complete"),
        ]
        let weeks = EnergyEvidenceCalculator.weekBuckets(days: days, windowStart: nil, windowEnd: nil)
        XCTAssertEqual(weeks.count, 1)
        let week = try! XCTUnwrap(weeks.first)
        XCTAssertEqual(week.weekStart, "2026-08-16") // 2026-08-16 is itself a Sunday
        XCTAssertEqual(week.weekEnd, "2026-08-22")
        XCTAssertEqual(week.averageIntake, 2625)
        XCTAssertEqual(week.completeDayCount, 2)
        XCTAssertEqual(week.evidenceDayCount, 2)
    }

    /// A week clipped by the scope's own boundary must expect fewer days,
    /// not be flagged partial just because it has fewer than 7 days of
    /// evidence when the scope itself only covers part of that week.
    func testExpectedDayCountRespectsTheScopeWindowNotAlwaysSeven() {
        let days = [
            EnergyDayRecord(id: "a", date: "2026-07-19", calorieIntake: 2450, activeCalories: 540, estimatedExpenditure: 2725, energyBalance: -275, completeness: "complete"),
        ]
        // Phase 1 starts 2026-07-19, a Sunday — the week [07-19...07-25]
        // is not clipped in this case, so expectedDayCount is the full 7.
        let unclipped = EnergyEvidenceCalculator.weekBuckets(days: days, windowStart: "2026-07-19", windowEnd: "2026-08-15")
        XCTAssertEqual(unclipped.first?.expectedDayCount, 7)
        XCTAssertEqual(unclipped.first?.partial, true) // only 1 of 7 expected days has evidence

        // A window that starts mid-week must clip expectedDayCount down.
        let clipped = EnergyEvidenceCalculator.weekBuckets(days: days, windowStart: "2026-07-22", windowEnd: "2026-08-15")
        XCTAssertEqual(clipped.first?.expectedDayCount, 4) // 07-22...07-25 inclusive
    }

    func testRecentFourWeeksReturnsAtMostFourInAscendingOrder() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        XCTAssertLessThanOrEqual(report.recentFourWeeks.count, 4)
        let starts = report.recentFourWeeks.map(\.weekStart)
        XCTAssertEqual(starts, starts.sorted(by: <))
    }

    // MARK: - Chart range filtering (pure logic, no coordinates)

    func testRangeFilteredNarrowsToMonthsFromLatestWeek() {
        let weeks = [
            EnergyWeekRecord(id: "w1", weekStart: "2026-05-24", weekEnd: "2026-05-30", averageIntake: 2300, averageExpenditure: nil, averageBalance: nil, completeDayCount: 0, evidenceDayCount: 1, expectedDayCount: 1, partial: false),
            EnergyWeekRecord(id: "w2", weekStart: "2026-08-16", weekEnd: "2026-08-22", averageIntake: 2600, averageExpenditure: 2820, averageBalance: -220, completeDayCount: 1, evidenceDayCount: 1, expectedDayCount: 7, partial: true),
        ]
        let oneMonth = EnergyEvidenceCalculator.rangeFiltered(weeksAscending: weeks, range: .oneMonth)
        XCTAssertEqual(oneMonth.map(\.id), ["w2"])
        let all = EnergyEvidenceCalculator.rangeFiltered(weeksAscending: weeks, range: .all)
        XCTAssertEqual(all.map(\.id), ["w1", "w2"])
    }

    func testRangeFilteredOnEmptySeriesReturnsEmpty() {
        XCTAssertTrue(EnergyEvidenceCalculator.rangeFiltered(weeksAscending: [], range: .oneMonth).isEmpty)
    }

    // MARK: - Empty state

    func testEmptyScopeProducesZeroedSummaryAndEmptyHistory() {
        let report = EnergyEvidenceCalculator.report(allDays: [], scope: .all, allLabel: "All Energy", dataSources: [])
        XCTAssertNil(report.summary.averageIntake)
        XCTAssertEqual(report.summary.completeDays, 0)
        XCTAssertEqual(report.summary.evidenceDays, 0)
        XCTAssertTrue(report.dailyHistory.isEmpty)
        XCTAssertTrue(report.weeklyHistory.isEmpty)
        XCTAssertTrue(report.weeklyTrend.isEmpty)
        XCTAssertTrue(report.recentFourWeeks.isEmpty)
    }

    // MARK: - Cross-link visibility (Nutrition Day / Activity)

    func testCrossLinkDataIsPresentOnlyWhenTheCorrespondingEvidenceExists() async throws {
        let report = try await api.fetchEnergyReport(scope: .all)
        let nutritionOnly = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-06-25" })
        XCTAssertNotNil(nutritionOnly.calorieIntake)
        XCTAssertNil(nutritionOnly.activeCalories)
        let activityOnly = try XCTUnwrap(report.dailyHistory.first { $0.date == "2026-07-22" })
        XCTAssertNil(activityOnly.calorieIntake)
        XCTAssertNotNil(activityOnly.activeCalories)
    }
}
