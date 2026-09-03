import XCTest
@testable import PhysiqueOS

/// Regression coverage for the DEXA Evidence vertical, exercised through
/// `FixtureDEXAAPI`. DEXA has no history/day-detail route split on the
/// web (one page is both the scan history and the latest-scan report —
/// see `DEXAReadModel.swift`'s doc comment), so this file covers
/// decoding, delta/summary computation, chart series, Goal/Phase
/// attribution and filtering, and empty states.
final class DEXAReadModelTests: XCTestCase {
    private let api = FixtureDEXAAPI()

    // MARK: - Fixture decoding integrity

    func testReportDecodesWithoutError() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        XCTAssertEqual(report.title, "DEXA")
        XCTAssertEqual(report.summary.count, 5)
        XCTAssertFalse(report.history.isEmpty)
        XCTAssertFalse(report.dataSources.isEmpty)
    }

    func testLatestScanAndSummaryReflectTheMostRecentScopedScan() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        XCTAssertEqual(report.latestScan?.date, "2026-08-30")
        XCTAssertEqual(report.summary.first { $0.label == "Body Fat" }?.value, "9.4%")
        XCTAssertEqual(report.summary.first { $0.label == "Weight" }?.value, "179.4 lb")
    }

    // MARK: - Delta (since prior scan)

    func testDeltaIsComputedFromTheLastTwoScopedScans() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        // 2026-08-16 BF 9.0 -> 2026-08-30 BF 9.4 => +0.4 pts
        XCTAssertEqual(report.delta?.bodyFatPercentagePoints, "+0.4 pts")
    }

    func testDeltaIsNilWithFewerThanTwoScopedScans() {
        let delta = DEXAEvidenceCalculator.delta(scopedScansAscending: [])
        XCTAssertNil(delta)
        let single = DEXAEvidenceCalculator.delta(scopedScansAscending: [
            DEXACanonicalScanFixture(id: "a", measuredAt: "2026-08-30", totalMassLb: 179, bodyFatPercentage: 9, fatMassLb: 16, leanMassLb: 159, boneMineralContentLb: 7, restingMetabolicRateKcal: 2200, visceralAdiposeTissueMassLb: 1, visceralAdiposeTissueVolumeIn3: 18, androidFatPercentage: 11, gynoidFatPercentage: 8, androidGynoidRatio: 1.4, regional: DEXARegionalAssessmentFixture(arms: .init(leanMassLb: 18, fatMassLb: 2), legs: .init(leanMassLb: 55, fatMassLb: 5), trunk: .init(leanMassLb: 73, fatMassLb: 8), android: .init(leanMassLb: 10, fatMassLb: 1), gynoid: .init(leanMassLb: 18, fatMassLb: 2)), totalBMD: 1.2, tScore: 0, zScore: 0.5, sourceLabel: "BodySpec PDF"),
        ])
        XCTAssertNil(single)
    }

    // MARK: - Chart series

    func testBodyFatTrendCarriesOnePointPerScopedScan() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        XCTAssertEqual(report.bodyFatTrend.points.count, 5)
    }

    func testRegionalTrendsAreOrderedArmsLegsTrunkAndroidGynoid() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        XCTAssertEqual(report.regionalLeanTrends.map(\.title), ["Arms", "Legs", "Trunk", "Android", "Gynoid"])
        XCTAssertEqual(report.regionalFatTrends.map(\.title), ["Arms", "Legs", "Trunk", "Android", "Gynoid"])
    }

    func testSupplementalDetailsCoverAllNineFields() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        XCTAssertEqual(report.supplementalDetails.map(\.label), [
            "VAT Mass", "VAT Volume", "Android Fat %", "Gynoid Fat %", "A/G Ratio",
            "Bone Mineral Content", "Total BMD", "T-Score", "Z-Score",
        ])
    }

    // MARK: - History ordering

    func testHistoryIsNewestFirst() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        let dates = report.history.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    // MARK: - Goal/Phase attribution and filtering

    func testEveryHistoryRowCarriesAttribution() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        XCTAssertTrue(report.history.allSatisfy { $0.attributedScope != nil })
    }

    func testBuildLeanMassScopeExcludesVisibleAbsEraScans() async throws {
        let report = try await api.fetchDEXAReport(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        XCTAssertTrue(report.history.allSatisfy { $0.date >= "2026-07-19" })
        XCTAssertEqual(report.history.count, 2)
    }

    func testVisibleAbsScopeExcludesBuildLeanMassEraScans() async throws {
        let report = try await api.fetchDEXAReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertTrue(report.history.allSatisfy { $0.date >= "2026-05-24" && $0.date <= "2026-07-18" })
        XCTAssertEqual(report.history.count, 3)
    }

    func testPhaseScopeNarrowsToOnePhase() async throws {
        let phase2 = try await api.fetchDEXAReport(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-lean-mass-build"))
        XCTAssertEqual(phase2.history.count, 2)
        let phase1 = try await api.fetchDEXAReport(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        XCTAssertTrue(phase1.history.isEmpty)
    }

    func testScopeDefaultsToBuildLeanMass() async throws {
        let report = try await api.fetchDEXAReport()
        XCTAssertEqual(report.scope.options.filter(\.selected).map(\.id), ["goal:\(EvidenceCanonicalGoalID.buildLeanMass)"])
    }

    // MARK: - Boundary dates

    func testDayBeforeGoalTransitionOwnedByPriorGoal() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        let boundaryScan = try XCTUnwrap(report.history.first { $0.date == "2026-07-18" })
        XCTAssertEqual(boundaryScan.attributedScope?.goalId, EvidenceCanonicalGoalID.visibleAbs)
    }

    func testFirstDayOfNewPhaseOwnedByNewPhase() async throws {
        let report = try await api.fetchDEXAReport(scope: .all)
        let boundaryScan = try XCTUnwrap(report.history.first { $0.date == "2026-08-16" })
        XCTAssertEqual(boundaryScan.attributedScope?.phaseName, "Lean Mass Build")
    }

    // MARK: - Empty state

    func testEmptyScopeProducesPendingSummaryAndNilLatestAndDelta() {
        let report = DEXAEvidenceCalculator.report(allScans: [], scope: .all, allLabel: "All DEXA", dataSources: [])
        XCTAssertNil(report.latestScan)
        XCTAssertNil(report.delta)
        XCTAssertTrue(report.summary.allSatisfy { $0.value == "Pending" })
        XCTAssertTrue(report.history.isEmpty)
        XCTAssertTrue(report.bodyFatTrend.points.isEmpty)
    }

    // MARK: - Server-owned fields correctly absent

    /// `buildDEXAReport` computes `relatedGoals`/`latestMuscleBalance` but
    /// the live screen never renders either — correctly absent here too.
    func testReadModelHasNoRelatedGoalsOrMuscleBalanceField() {
        let mirror = Mirror(reflecting: DEXAReportReadModel(
            title: "", subtitle: "", scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
            latestScan: nil, summary: [], delta: nil,
            bodyFatTrend: DEXAMetricSeries(title: "", unit: "", points: []),
            coreTrends: [], supplementalDetails: [], supplementalTrends: [],
            regionalLeanTrends: [], regionalFatTrends: [], history: [], dataSources: []
        ))
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("relatedGoals"))
        XCTAssertFalse(fieldNames.contains("latestMuscleBalance"))
    }
}
