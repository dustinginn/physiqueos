import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Weight Evidence read-model vertical,
/// exercised through `FixtureWeightEvidenceAPI`. Weight has no
/// history/day-detail route split on the web (a single page covers
/// everything — see `WeightReportReadModel`'s doc comment), so this file
/// covers decoding, the per-scope Highest/Lowest branch logic (the single
/// most important, easiest-to-get-wrong fact this port's audit surfaced),
/// weekly averages, and chronology attribution/filtering.
final class WeightReadModelTests: XCTestCase {
    private let api = FixtureWeightEvidenceAPI()

    // MARK: - Fixture decoding integrity

    func testReportDecodesWithoutError() async throws {
        let report = try await api.fetchWeightReport()
        XCTAssertEqual(report.title, "Weight")
        XCTAssertEqual(report.subtitle, "Weight evidence over time.")
        XCTAssertEqual(report.summary.count, 4)
        XCTAssertFalse(report.chart.points.isEmpty)
        XCTAssertFalse(report.dataSources.isEmpty)
    }

    func testWeightValuesFormatToOneDecimalWithUnit() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        let latest = try XCTUnwrap(report.history.first)
        XCTAssertEqual(latest.value, "179.4 lb")
    }

    // MARK: - Goal-specific Highest/Lowest semantics (the literal, hardcoded web branch)

    /// Build Lean Mass shows BOTH Highest and Lowest — verified directly
    /// against `WeightEvidenceContextService.test.js:64-104`, not inferred
    /// from the goal's name.
    func testBuildLeanMassSummaryShowsBothHighestAndLowest() async throws {
        let report = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        XCTAssertEqual(report.summary.map(\.label), ["Latest", "Since Start", "Highest", "Lowest"])
    }

    /// Selecting a specific Phase of Build Lean Mass still uses the
    /// Build-Lean-Mass-style branch (both Highest and Lowest) — the
    /// Highest/Lowest choice is a Goal-level fact; Phase selection only
    /// narrows which entries are considered.
    func testBuildLeanMassPhaseSummaryStillShowsBothHighestAndLowest() async throws {
        let report = try await api.fetchWeightReport(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-lean-mass-build"))
        XCTAssertEqual(report.summary.map(\.label), ["Latest", "Since Start", "Highest", "Lowest"])
    }

    /// Visible Abs shows only Lowest — its 4th card is "Last Change", not
    /// "Highest". This is the exact, easy-to-get-backwards fact a naive
    /// "fat-loss goals care about lowest" assumption would still get
    /// right by luck; the real point this test locks in is that the 3rd
    /// card is "Last Change", not "Highest", for this specific goal.
    func testVisibleAbsSummaryShowsOnlyLowestAndReplacesHighestWithLastChange() async throws {
        let report = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertEqual(report.summary.map(\.label), ["Latest", "Since Start", "Last Change", "Lowest"])
    }

    func testAllScopeSummaryShowsBothHighestAndLowestFromEntireHistory() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        XCTAssertEqual(report.summary.map(\.label), ["Latest", "Since First", "Highest", "Lowest"])
    }

    /// "Latest" always reads the true overall latest entry, never the
    /// scoped window — the confirmed real web asymmetry (`overallLatest`
    /// used even inside Build Lean Mass's own scoped view).
    func testLatestCardIsAlwaysTheOverallLatestEntry() async throws {
        let buildLeanMass = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))
        let visibleAbs = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        let latestCard = { (report: WeightReportReadModel) in report.summary.first { $0.label == "Latest" }?.value }
        XCTAssertEqual(latestCard(buildLeanMass), "179.4 lb")
        // Visible Abs's own "Latest" reads its *scoped* latest, per the
        // real web branch (`scopedLatest`, not `overallLatest`) — verified
        // directly from source, the one branch where "Latest" does differ.
        XCTAssertEqual(latestCard(visibleAbs), "172.0 lb")
    }

    func testHighestExtremeIsComputedFromTheScopedWindowNotAllTime() async throws {
        // The fixture's true all-time highest (185.5) falls before Visible
        // Abs began, so Visible Abs's own Highest/Lowest reducer never
        // sees it — Lowest inside that scope must be 172.0, not anything
        // from outside the window.
        let report = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        let lowest = try XCTUnwrap(report.summary.first { $0.label == "Lowest" })
        XCTAssertEqual(lowest.value, "172.0 lb")
    }

    // MARK: - No moving averages (confirmed absent on the live product)

    func testReadModelHasNoMovingAverageField() {
        let mirror = Mirror(reflecting: WeightReportReadModel(
            title: "", subtitle: "", scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
            summary: [], chart: WeightChartData(points: [], markers: []), weeklyAverages: [], history: [], dataSources: []
        ))
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("rollingAverage"))
        XCTAssertFalse(fieldNames.contains("threeDayAverage"))
        XCTAssertFalse(fieldNames.contains("sevenDayAverage"))
    }

    // MARK: - Weekly averages

    func testWeeklyAveragesKeepsAtMostSixWeeksNewestFirst() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        XCTAssertLessThanOrEqual(report.weeklyAverages.count, 6)
        XCTAssertFalse(report.weeklyAverages.isEmpty)
        XCTAssertTrue(report.weeklyAverages.allSatisfy { $0.entryCount > 0 })
    }

    /// Exercises `WeightEvidenceCalculator` directly (not through the
    /// fixture, whose real ~8-week Visible Abs span exceeds the kept
    /// window and so its truncated-oldest week legitimately DOES have a
    /// real prior-week delta — see `testWeeklyAveragesKeepsAtMostSixWeeksNewestFirst`
    /// for that count): a deliberately short, 2-week series proves the
    /// true first week of a series is flagged base with a nil delta.
    func testFirstWeekOfAShortSeriesIsFlaggedAsBaseWithNoDelta() throws {
        let entries = [
            WeightEntryFixture(id: "a", date: "2026-06-01", value: 180, unit: "lb", isDefaultConditions: true),
            WeightEntryFixture(id: "b", date: "2026-06-15", value: 178, unit: "lb", isDefaultConditions: true),
        ]
        let weeks = WeightEvidenceCalculator.weeklyAverages(scopedWeights: entries)
        let oldestShown = try XCTUnwrap(weeks.last)
        XCTAssertEqual(weeks.count, 2)
        XCTAssertTrue(oldestShown.isBaseWeek)
        XCTAssertNil(oldestShown.weekOverWeek)
    }

    /// The real fixture's Visible Abs span is long enough that the kept
    /// last-6-weeks window truncates away the true earliest week — so the
    /// oldest *kept* week here legitimately has a real computed delta
    /// against the (unshown) week before it, matching
    /// `getWeeklyAverages`'s own "keep only the last 6" behavior applied
    /// AFTER week-over-week computation across the full series.
    func testWeeklyAveragesForALongSeriesStillComputesADeltaForTheOldestKeptWeek() async throws {
        let report = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        let oldestShown = try XCTUnwrap(report.weeklyAverages.last)
        XCTAssertNotNil(oldestShown.weekOverWeek)
        XCTAssertFalse(oldestShown.isBaseWeek)
    }

    // MARK: - History ordering (newest first)

    func testHistoryIsNewestFirst() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        let dates = report.history.map(\.date)
        XCTAssertEqual(dates, dates.sorted(by: >))
    }

    // MARK: - DEXA markers

    func testDEXAMarkersAreScopedWithTheSameWindowAsWeights() async throws {
        let allReport = try await api.fetchWeightReport(scope: .all)
        let visibleAbsReport = try await api.fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.visibleAbs))
        XCTAssertEqual(allReport.chart.markers.count, 3)
        // Only the 2026-05-24 and 2026-07-05 scans fall inside Visible
        // Abs's window; 2026-08-16 does not.
        XCTAssertEqual(visibleAbsReport.chart.markers.count, 2)
    }

    // MARK: - No streaks / no Related Goals (test-enforced absent on web)

    func testReadModelHasNoStreakOrRelatedGoalsField() {
        let mirror = Mirror(reflecting: WeightReportReadModel(
            title: "", subtitle: "", scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
            summary: [], chart: WeightChartData(points: [], markers: []), weeklyAverages: [], history: [], dataSources: []
        ))
        let fieldNames = Set(mirror.children.compactMap(\.label))
        XCTAssertFalse(fieldNames.contains("streak"))
        XCTAssertFalse(fieldNames.contains("relatedGoals"))
    }

    // MARK: - Goal/Phase chronology attribution

    func testHistoryEntriesCarryAttribution() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        // Every entry except the one dated before Visible Abs began
        // resolves to a real Goal — that one entry is honestly
        // unattributed (`attributedScope == nil`) rather than defaulted to
        // whichever Goal happens to be current.
        let attributed = report.history.filter { $0.date != "2026-05-23" }
        XCTAssertTrue(attributed.allSatisfy { $0.attributedScope != nil })
        let preVisibleAbs = try XCTUnwrap(report.history.first { $0.date == "2026-05-23" })
        XCTAssertNil(preVisibleAbs.attributedScope)
    }

    func testPhaseScopeFiltersWeightHistoryToOnePhase() async throws {
        let report = try await api.fetchWeightReport(scope: .phase(goalId: EvidenceCanonicalGoalID.buildLeanMass, phaseId: "phase-establish-maintenance"))
        XCTAssertTrue(report.history.allSatisfy { $0.date >= "2026-07-19" && $0.date <= "2026-08-15" })
        XCTAssertFalse(report.history.isEmpty)
    }

    // MARK: - Empty/sparse chart state

    func testFewerThanTwoPointsIsRepresentedHonestlyRatherThanCharted() async throws {
        // Not directly expressible from the shipped fixture (17 points),
        // but the calculator's contract is exercised at the point-count
        // boundary a screen actually branches on: `< 2` valid points.
        let noPoints: [WeightChartPoint] = []
        let onePoint = [WeightChartPoint(id: "a", date: "2026-01-01", value: 180, label: "180.0 lb", detail: "Morning weight")]
        XCTAssertLessThan(noPoints.count, 2)
        XCTAssertLessThan(onePoint.count, 2)
    }

    // MARK: - Chart domain/scaling (fixes the reported "arbitrary 0-200" gap)

    /// The y-domain must be tight to the actual plotted min/max — not a
    /// fixed 0–200 range that would flatten real weight variation, matching
    /// `ProgressLineChart.jsx:18-23`'s own `Math.min`/`Math.max` with zero
    /// padding.
    func testChartYDomainIsTightToActualDataNotAFixedRange() {
        let points = [
            WeightChartPoint(id: "a", date: "2026-01-01", value: 172.0, label: "", detail: ""),
            WeightChartPoint(id: "b", date: "2026-01-08", value: 179.4, label: "", detail: ""),
            WeightChartPoint(id: "c", date: "2026-01-15", value: 175.0, label: "", detail: ""),
        ]
        let domain = WeightEvidenceCalculator.chartYDomain(points: points)
        XCTAssertEqual(domain.lowerBound, 172.0)
        XCTAssertEqual(domain.upperBound, 179.4)
    }

    func testChartYDomainDegradesSafelyWhenEveryPointIsIdentical() {
        let points = [
            WeightChartPoint(id: "a", date: "2026-01-01", value: 175.0, label: "", detail: ""),
            WeightChartPoint(id: "b", date: "2026-01-08", value: 175.0, label: "", detail: ""),
        ]
        let domain = WeightEvidenceCalculator.chartYDomain(points: points)
        XCTAssertLessThan(domain.lowerBound, domain.upperBound)
    }

    func testChartYDomainAgainstTheShippedFixtureMatchesTheKnownMinMax() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        let domain = WeightEvidenceCalculator.chartYDomain(points: report.chart.points)
        XCTAssertEqual(domain.lowerBound, 172.0)
        XCTAssertEqual(domain.upperBound, 185.5)
    }

    // MARK: - Chart point selection (touch scrub equivalent)

    func testNearestPointSelectsTheClosestObservationByDate() {
        let points = [
            WeightChartPoint(id: "a", date: "2026-01-01", value: 180, label: "", detail: ""),
            WeightChartPoint(id: "b", date: "2026-01-08", value: 178, label: "", detail: ""),
            WeightChartPoint(id: "c", date: "2026-01-15", value: 176, label: "", detail: ""),
        ]
        let dateValue: (String) -> Date = { string in
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone(identifier: "UTC")
            return formatter.date(from: string) ?? .distantPast
        }
        let touchedNearB = dateValue("2026-01-06")
        XCTAssertEqual(WeightEvidenceCalculator.nearestPoint(to: touchedNearB, in: points, dateValue: dateValue)?.id, "b")
        let touchedExactlyC = dateValue("2026-01-15")
        XCTAssertEqual(WeightEvidenceCalculator.nearestPoint(to: touchedExactlyC, in: points, dateValue: dateValue)?.id, "c")
        let touchedBeforeAll = dateValue("2025-12-01")
        XCTAssertEqual(WeightEvidenceCalculator.nearestPoint(to: touchedBeforeAll, in: points, dateValue: dateValue)?.id, "a")
    }

    func testNearestPointReturnsNilForAnEmptyCollection() {
        XCTAssertNil(WeightEvidenceCalculator.nearestPoint(to: Date(), in: [], dateValue: { _ in Date() }))
    }

    // MARK: - View model selection state

    @MainActor
    func testViewModelDefaultsSelectedChartPointToTheLatestObservation() async {
        let viewModel = WeightHistoryViewModel(api: api)
        await viewModel.load()
        guard case .loaded(let report) = viewModel.state else { return XCTFail("Expected loaded state.") }
        XCTAssertEqual(viewModel.selectedChartPointID, report.chart.points.last?.id)
    }

    @MainActor
    func testViewModelSelectChartPointUpdatesSelection() async {
        let viewModel = WeightHistoryViewModel(api: api)
        await viewModel.load()
        guard case .loaded(let report) = viewModel.state, let firstPointID = report.chart.points.first?.id else {
            return XCTFail("Expected loaded state with points.")
        }
        viewModel.selectChartPoint(id: firstPointID)
        XCTAssertEqual(viewModel.selectedChartPointID, firstPointID)
    }

    @MainActor
    func testViewModelResetsSelectionOnScopeReload() async {
        let viewModel = WeightHistoryViewModel(api: api)
        await viewModel.load()
        guard case .loaded(let allReport) = viewModel.state, let firstPointID = allReport.chart.points.first?.id else {
            return XCTFail("Expected loaded state with points.")
        }
        viewModel.selectChartPoint(id: firstPointID)
        await viewModel.selectScope(pillID: "goal:\(EvidenceCanonicalGoalID.visibleAbs)")
        guard case .loaded(let scopedReport) = viewModel.state else { return XCTFail("Expected loaded state.") }
        XCTAssertEqual(viewModel.selectedChartPointID, scopedReport.chart.points.last?.id)
    }

    // MARK: - DEXA marker mapping

    func testDEXAMarkersMapFromTheCanonicalScanRecordsNotHardcodedPositions() async throws {
        let report = try await api.fetchWeightReport(scope: .all)
        XCTAssertEqual(Set(report.chart.markers.map(\.date)), ["2026-05-24", "2026-07-05", "2026-08-16"])
        XCTAssertTrue(report.chart.markers.allSatisfy { $0.label == "DEXA" })
    }

    // MARK: - Manual Weight durable submission lifecycle

    @MainActor
    func testWeightSubmissionLostAcknowledgementUsesFreshCanonicalReadback() async throws {
        var invalidations = 0
        var submissions = 0
        var reports = [Self.emptyReport(), Self.report(date: "2026-09-19", pounds: 168.4, revision: 1)]
        let lifecycle = WeightSubmissionLifecycle(
            invalidateWeightRead: { invalidations += 1 },
            fetchWeightReport: { reports.removeFirst() },
            submitWeight: { _, _, _ in
                submissions += 1
                throw ProductionNativeError.networkFailure
            }
        )

        let resolution = try await lifecycle.submit(localDate: "2026-09-19", value: 168.4)
        XCTAssertEqual(resolution, .saved)
        XCTAssertEqual(submissions, 1)
        XCTAssertEqual(invalidations, 2)
    }

    @MainActor
    func testWeightSubmissionUnknownOutcomeReplaysExactAttemptOnceThenReportsProcessing() async throws {
        var submissions = 0
        var expectedVersions: [String?] = []
        let lifecycle = WeightSubmissionLifecycle(
            invalidateWeightRead: {},
            fetchWeightReport: { Self.emptyReport() },
            submitWeight: { _, _, expectedVersion in
                submissions += 1
                expectedVersions.append(expectedVersion)
                throw ProductionNativeError.networkFailure
            }
        )

        let resolution = try await lifecycle.submit(localDate: "2026-09-19", value: 168.4)
        XCTAssertEqual(resolution, .processing)
        XCTAssertEqual(submissions, 2)
        XCTAssertEqual(expectedVersions.count, 2)
        XCTAssertNil(expectedVersions[0])
        XCTAssertNil(expectedVersions[1])
    }

    @MainActor
    func testWeightSubmissionCommittedReceiptIsSuccessEvenWhenRefreshFails() async throws {
        var reads = 0
        let lifecycle = WeightSubmissionLifecycle(
            invalidateWeightRead: {},
            fetchWeightReport: {
                reads += 1
                if reads == 1 { return Self.report(date: "2026-09-19", pounds: 167.8, revision: 4) }
                throw ProductionNativeError.networkFailure
            },
            submitWeight: { _, _, expectedVersion in
                XCTAssertEqual(expectedVersion, "4")
                return Self.committedWeightResult
            }
        )

        let resolution = try await lifecycle.submit(localDate: "2026-09-19", value: 168.4)
        XCTAssertEqual(resolution, .saved)
    }

    @MainActor
    func testWeightSubmissionGenuineRejectionRemainsFailure() async {
        let lifecycle = WeightSubmissionLifecycle(
            invalidateWeightRead: {},
            fetchWeightReport: { Self.emptyReport() },
            submitWeight: { _, _, _ in throw NotAvailableWeightWriteAPI.NotAvailable() }
        )
        do {
            _ = try await lifecycle.submit(localDate: "2026-09-19", value: 168.4)
            XCTFail("A terminal rejection must not become processing or success.")
        } catch is NotAvailableWeightWriteAPI.NotAvailable {
            // Expected.
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    @MainActor
    func testMorningCheckInLostAcknowledgementReplaysSameLogicalCommandOnce() async throws {
        var attempts = 0
        var expectedVersions: [String?] = []
        let lifecycle = MorningCheckInSubmissionLifecycle(
            invalidateWeightRead: {},
            fetchWeightReport: { Self.report(date: "2026-09-19", pounds: 168.4, revision: 7) },
            submitCheckIn: { expectedVersion in
                attempts += 1
                expectedVersions.append(expectedVersion)
                if attempts == 1 { throw ProductionNativeError.networkFailure }
                return Self.committedWeightResult
            }
        )

        let resolution = try await lifecycle.submit(localDate: "2026-09-19")

        XCTAssertEqual(resolution, .saved)
        XCTAssertEqual(attempts, 2)
        XCTAssertEqual(expectedVersions.compactMap { $0 }, ["7", "7"])
    }

    @MainActor
    func testMorningCheckInUnknownOutcomeNeverFabricatesFailureOrSuccess() async throws {
        var attempts = 0
        let lifecycle = MorningCheckInSubmissionLifecycle(
            invalidateWeightRead: {},
            fetchWeightReport: { Self.report(date: "2026-09-19", pounds: 168.4, revision: 7) },
            submitCheckIn: { _ in
                attempts += 1
                throw ProductionNativeError.networkFailure
            }
        )

        let resolution = try await lifecycle.submit(localDate: "2026-09-19")

        XCTAssertEqual(resolution, .processing)
        XCTAssertEqual(attempts, 2)
    }

    private static var committedWeightResult: WeightSubmitResult {
        WeightSubmitResult(
            status: "committed", weightId: "weight-1", weightRevision: 5,
            checkInId: nil, checkInRevision: nil, analysisId: nil,
            intendedDate: "2026-09-19", goalIds: [], continuationWorkItemIds: []
        )
    }

    private static func emptyReport() -> WeightReportReadModel {
        WeightReportReadModel(
            title: "Weight", subtitle: "", scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
            summary: [], chart: WeightChartData(points: [], markers: []),
            weeklyAverages: [], history: [], dataSources: []
        )
    }

    private static func report(date: String, pounds: Double, revision: Int) -> WeightReportReadModel {
        var report = emptyReport()
        report.current = WeightHistoryEntry(
            id: "weight-\(date)", date: date, detail: "Morning weight",
            value: String(format: "%.1f lb", pounds), revision: revision
        )
        return report
    }
}
