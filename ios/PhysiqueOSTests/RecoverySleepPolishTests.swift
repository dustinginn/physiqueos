import SwiftUI
import UIKit
import XCTest
@testable import PhysiqueOS

/// Founder polish after Build 75: Goal time blocking, page stability,
/// shared chart date axis, and simplified historical time-zone presentation.
/// All payloads are synthetic.
final class RecoverySleepPolishTests: XCTestCase {
    private let bundle = Bundle(for: AppEnvironment.self)
    private let today = "2026-10-01"

    private func fixture() throws -> FixtureRecoverySleepAPI.FixtureFile {
        try FixtureRecoverySleepAPI(bundle: bundle).loadFixture()
    }

    private let leanMass = RecoverySleepGoalWindow(startDate: "2026-07-19", endDate: nil)
    private let visibleAbs = RecoverySleepGoalWindow(startDate: "2026-05-24", endDate: "2026-07-18")

    // MARK: A. Goal scope resolution

    func testScopePillsMatchTheOtherEvidenceVerticals() {
        XCTAssertEqual(RecoverySleepScope.allCases.map(\.label), ["Build Lean Mass", "Visible Abs", "All Sleep"])
        XCTAssertEqual(RecoverySleepScope.allCases.map(\.pillID), ["goal:build-lean-mass", "goal:visible-abs", "all"])
        XCTAssertEqual(RecoverySleepScope(pillID: "goal:visible-abs"), .visibleAbs)
        XCTAssertEqual(RecoverySleepScope(pillID: "all"), .all)
        XCTAssertNil(RecoverySleepScope(pillID: "goal:nope"))
        XCTAssertNil(RecoverySleepScope(pillID: "goal:all"))
    }

    func testActiveBuildLeanMassIntersectsEvidenceAndEndsToday() {
        let range = RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: leanMass, today: today)
        XCTAssertEqual(range.startDate, "2026-07-19")
        XCTAssertEqual(range.endDate, today)
        XCTAssertFalse(range.isEmpty)
        XCTAssertTrue(range.isCurrent)
        XCTAssertEqual(range.dateLabel, "Jul 19 → Present")
    }

    func testCompletedVisibleAbsIsClampedToTheEvidenceStart() {
        let range = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: visibleAbs, today: today)
        XCTAssertEqual(range.startDate, "2026-07-06", "the Goal began May 24 but Sleep Evidence starts Jul 6")
        XCTAssertEqual(range.endDate, "2026-07-18")
        XCTAssertFalse(range.isCurrent)
        XCTAssertEqual(range.dateLabel, "Jul 6 → Jul 18")
    }

    func testAllUsesTheFullEvidenceRange() {
        let range = RecoverySleepScopeResolver.resolve(scope: .all, goalWindow: nil, today: today)
        XCTAssertEqual(range.startDate, "2026-07-06")
        XCTAssertEqual(range.endDate, today)
        XCTAssertTrue(range.isCurrent)
    }

    func testBoundaryAndEmptyIntersections() {
        // A Goal ending exactly on the Evidence start keeps that single day.
        let oneDay = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: .init(startDate: "2026-05-24", endDate: "2026-07-06"), today: today)
        XCTAssertFalse(oneDay.isEmpty)
        XCTAssertEqual(oneDay.startDate, oneDay.endDate)
        // A Goal that ended the day before Evidence starts is empty.
        let before = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: .init(startDate: "2026-05-24", endDate: "2026-07-05"), today: today)
        XCTAssertTrue(before.isEmpty)
        XCTAssertEqual(before.dateLabel, "No Sleep Evidence in this Goal's dates")
        // A Goal that starts after today is empty.
        XCTAssertTrue(RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: .init(startDate: "2026-10-02", endDate: nil), today: today).isEmpty)
        // A Goal starting today is a single current day.
        let startsToday = RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: .init(startDate: today, endDate: nil), today: today)
        XCTAssertFalse(startsToday.isEmpty)
        XCTAssertTrue(startsToday.isCurrent)
        // Unknown Goal dates never read.
        XCTAssertTrue(RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: nil, today: today).isEmpty)
        // Never earlier than the Evidence start, never later than today.
        for goal in [leanMass, visibleAbs] {
            let range = RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: goal, today: today)
            XCTAssertGreaterThanOrEqual(range.startDate, "2026-07-06")
            XCTAssertLessThanOrEqual(range.endDate, today)
        }
    }

    func testTrendSelectorsCountBackFromTheScopeEndAndNeverLeaveTheScope() throws {
        let abs = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: visibleAbs, today: today)
        let twoWeeks = try XCTUnwrap(RecoverySleepQuery.range(.twoWeeks, scope: abs))
        XCTAssertEqual(twoWeeks.endDate, "2026-07-18")
        XCTAssertEqual(twoWeeks.startDate, "2026-07-06", "14 days back would be Jul 5; clamped to the scope start")
        for selector in RecoverySleepTrendRange.allCases {
            let bounds = try XCTUnwrap(RecoverySleepQuery.range(selector, scope: abs))
            XCTAssertGreaterThanOrEqual(bounds.startDate, abs.startDate, "\(selector)")
            XCTAssertLessThanOrEqual(bounds.endDate, abs.endDate, "\(selector)")
        }
        let empty = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: .init(startDate: "2026-05-24", endDate: "2026-07-05"), today: today)
        XCTAssertNil(RecoverySleepQuery.range(.all, scope: empty))
        XCTAssertNil(RecoverySleepQuery.landingRange(scope: empty))
    }

    // MARK: A. Store

    @MainActor
    func testStoreLoadsWindowsOnDemandAndResetsWithTheAuthority() async throws {
        let store = RecoverySleepScopeStore()
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        XCTAssertEqual(store.selected, .all)
        XCTAssertNotNil(store.range(today: today), "All Sleep needs no Goal dates")
        store.select(.visibleAbs)
        XCTAssertNil(store.range(today: today), "a Goal's range is unknown until its dates load")
        await store.loadWindows(api: api, authority: "sandbox")
        XCTAssertEqual(store.selected, .visibleAbs, "the first load keeps a Goal tapped before the dates arrived")
        let range = try XCTUnwrap(store.range(today: today))
        XCTAssertEqual(range.startDate, "2026-07-06")
        XCTAssertEqual(range.endDate, "2026-07-18")
        XCTAssertEqual(store.scopeContext(today: today).options.map(\.selected), [false, true, false])
        XCTAssertEqual(store.scopeContext(today: today).dateRangeLabel, "Jul 6 → Jul 18")
        await store.loadWindows(api: api, authority: "founderProduction")
        XCTAssertEqual(store.selected, .all, "a new authority starts from All Sleep")
    }

    @MainActor
    func testStoreReportsFailedGoalDates() async {
        let store = RecoverySleepScopeStore()
        await store.loadWindows(api: FailingGoalWindowsAPI(), authority: "founderProduction")
        store.select(.buildLeanMass)
        XCTAssertEqual(store.windowsState, .failed)
        XCTAssertNil(store.range(today: today))
        XCTAssertEqual(store.scopeContext(today: today).dateRangeLabel, "Goal dates could not be loaded")
    }

    @MainActor
    func testSecondCallerWaitsForTheInFlightGoalDatesInsteadOfReturningEmpty() async throws {
        let store = RecoverySleepScopeStore()
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        store.select(.visibleAbs)
        let first = Task { @MainActor in await store.loadWindows(api: api, authority: "sandbox") }
        let second = Task { @MainActor in await store.loadWindows(api: api, authority: "sandbox") }
        await first.value
        await second.value
        XCTAssertEqual(store.windowsState, .loaded)
        XCTAssertNotNil(store.range(today: today), "the Goal range exists once both callers return")
    }

    @MainActor
    func testSupersededScopeReadsNeverOverwriteTheNewerScope() async throws {
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        let all = RecoverySleepScopeResolver.resolve(scope: .all, goalWindow: nil, today: today)
        let abs = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: visibleAbs, today: today)
        let model = RecoverySleepLandingViewModel(api: api)
        XCTAssertEqual(model.state(for: all), .loading, "nothing is shown before a scope has loaded")
        await model.load(range: all)
        guard case .loaded(let allLanding) = model.state(for: all) else { return XCTFail("All should load") }
        XCTAssertEqual(allLanding.nights.first?.sleepDay, "2026-10-01")
        XCTAssertEqual(model.state(for: abs), .loading, "another scope never shows All's nights")
        await model.load(range: abs)
        guard case .loaded(let absLanding) = model.state(for: abs) else { return XCTFail("Visible Abs should load") }
        XCTAssertTrue(absLanding.nights.allSatisfy { $0.sleepDay <= "2026-07-18" })
        XCTAssertEqual(model.state(for: all), .loading)

        let trends = RecoverySleepTrendsViewModel(api: api)
        await trends.select(.all, range: all)
        await trends.select(.all, range: abs)
        guard case .loaded(let scoped) = trends.state(for: abs) else { return XCTFail("scoped trends") }
        XCTAssertTrue(scoped.totalSleep.allSatisfy { $0.periodStart <= "2026-07-18" })
        XCTAssertEqual(trends.state(for: all), .loading)
    }

    // MARK: A. Requests stay inside the scope

    func testGoalScopeNeverRequestsDatesOutsideItsRange() async throws {
        let file = try fixture()
        let trendsJSON = try exampleJSON("trendsNight")
        let transport = PolishStubTransport { path, query in
            switch path {
            case "photos":
                let contexts = ["build-lean-mass": #"{"contextId":"build-lean-mass","startDate":"2026-07-19","endDate":null}"#,
                                "visible-abs": #"{"contextId":"visible-abs","startDate":"2026-05-24","endDate":"2026-07-18"}"#]
                return (200, Self.envelope("photos", #"{"context":\#(contexts[query["context"] ?? ""] ?? "null")}"#))
            case "recovery-sleep-trends": return (200, Self.envelope("recovery-sleep-trends", trendsJSON))
            default: return (404, #"{"title":"Not found","status":404,"code":"NOT_FOUND","fieldErrors":[]}"#)
            }
        }
        let api = ProductionRecoverySleepAPI(api: try await pairedAPI(transport), clock: { "2026-10-01" })
        let windows = try await api.fetchGoalWindows()
        XCTAssertEqual(windows[.buildLeanMass]?.startDate, "2026-07-19")
        XCTAssertNil(windows[.buildLeanMass]?.endDate)
        XCTAssertEqual(windows[.visibleAbs]?.endDate, "2026-07-18")

        let abs = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: windows[.visibleAbs], today: today)
        _ = try await api.fetchLanding(range: abs, policy: .cacheFirst)
        for selector in RecoverySleepTrendRange.allCases { _ = try await api.fetchTrends(selector: selector, range: abs) }
        _ = try await api.fetchNights(cursor: nil, limit: 30, range: abs)
        _ = try await api.fetchNights(cursor: "2026-07-12", limit: 30, range: abs)

        let reads = await transport.reads.filter { $0.path == "recovery-sleep-trends" || $0.path == "recovery-sleep-landing" }
        XCTAssertFalse(reads.contains { $0.path == "recovery-sleep-landing" }, "a Goal landing is derived from one bounded trends read")
        XCTAssertGreaterThanOrEqual(reads.count, 2, "bounded reads were made")
        for read in reads {
            let start = try XCTUnwrap(read.query["startDate"])
            let end = try XCTUnwrap(read.query["endDate"])
            XCTAssertGreaterThanOrEqual(start, "2026-07-06")
            XCTAssertLessThanOrEqual(end, "2026-07-18")
            XCTAssertLessThanOrEqual(start, end)
        }
        _ = file

        let lean = RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: windows[.buildLeanMass], today: today)
        _ = try await api.fetchLanding(range: lean, policy: .cacheFirst)
        let allReads = await transport.reads
        let leanRead = try XCTUnwrap(allReads.last)
        XCTAssertEqual(leanRead.query["endDate"], today)
        XCTAssertGreaterThanOrEqual(try XCTUnwrap(leanRead.query["startDate"]), "2026-07-19")
        XCTAssertEqual(leanRead.query["limit"], "30")
    }

    func testEmptyGoalRangeMakesNoRead() async throws {
        let transport = PolishStubTransport { _, _ in (500, "") }
        let api = ProductionRecoverySleepAPI(api: try await pairedAPI(transport), clock: { "2026-10-01" })
        let empty = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: .init(startDate: "2026-05-24", endDate: "2026-07-05"), today: today)
        let landing = try await api.fetchLanding(range: empty, policy: .cacheFirst)
        XCTAssertEqual(landing.state, .noData)
        XCTAssertTrue(landing.nights.isEmpty)
        let trends = try await api.fetchTrends(selector: .all, range: empty)
        XCTAssertTrue(trends.totalSleep.isEmpty)
        let page = try await api.fetchNights(cursor: nil, limit: 30, range: empty)
        XCTAssertTrue(page.items.isEmpty)
        XCTAssertNil(page.nextCursor)
        let reads = await transport.reads
        XCTAssertTrue(reads.isEmpty, "no request is made for an empty range")
    }

    // MARK: A. Scoped landing / history / trends leak nothing

    func testGoalScopedSandboxHasNoNightsOutsideTheRange() async throws {
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        let abs = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: visibleAbs, today: today)
        let lean = RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: leanMass, today: today)

        let landing = try await api.fetchLanding(range: abs, policy: .cacheFirst)
        XCTAssertFalse(landing.nights.isEmpty)
        XCTAssertTrue(landing.nights.allSatisfy { $0.sleepDay >= "2026-07-06" && $0.sleepDay <= "2026-07-18" })
        XCTAssertEqual(landing.lastNight?.sleepDay, landing.nights.first?.sleepDay)
        XCTAssertLessThanOrEqual(landing.nights.first?.sleepDay ?? "", "2026-07-18", "the Goal ended Jul 18")

        let leanLanding = try await api.fetchLanding(range: lean, policy: .cacheFirst)
        XCTAssertEqual(leanLanding.nights.count, 14)
        XCTAssertTrue(leanLanding.nights.allSatisfy { $0.sleepDay >= "2026-07-19" })

        for selector in RecoverySleepTrendRange.allCases {
            let trends = try await api.fetchTrends(selector: selector, range: abs)
            XCTAssertTrue(trends.totalSleep.allSatisfy { $0.periodStart >= "2026-07-06".prefix(10) && $0.periodStart <= "2026-07-18" }, "\(selector)")
        }
        let absAll = try await api.fetchTrends(selector: .all, range: abs)
        XCTAssertEqual(absAll.totalSleep.count, 13, "every Visible Abs night inside the Evidence range")
        XCTAssertEqual(absAll.totalSleep.last?.periodStart, "2026-07-06")
        XCTAssertEqual(absAll.totalSleep.first?.periodStart, "2026-07-18")

        let leanAll = try await api.fetchTrends(selector: .all, range: lean)
        XCTAssertEqual(leanAll.totalSleep.last?.periodStart, "2026-07-19")
        XCTAssertEqual(leanAll.totalSleep.count + absAll.totalSleep.count, 85 - 0, "the two Goals partition the fixture's nights (3 days without a record each way)")
    }

    @MainActor
    func testGoalScopedNightHistoryPagesInsideTheRangeWithoutDuplicates() async throws {
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        let lean = RecoverySleepScopeResolver.resolve(scope: .buildLeanMass, goalWindow: leanMass, today: today)
        let model = RecoverySleepNightsViewModel(api: api, range: lean, pageSize: 20)
        await model.loadFirstPage()
        while model.canLoadMore { await model.loadMore() }
        XCTAssertEqual(Set(model.items.map(\.sleepDay)).count, model.items.count)
        XCTAssertTrue(model.items.allSatisfy { $0.sleepDay >= "2026-07-19" && $0.sleepDay <= today })
        XCTAssertEqual(model.items.last?.sleepDay, "2026-07-19")
        let empty = RecoverySleepScopeResolver.resolve(scope: .visibleAbs, goalWindow: .init(startDate: "2026-05-24", endDate: "2026-07-05"), today: today)
        let emptyModel = RecoverySleepNightsViewModel(api: api, range: empty)
        await emptyModel.loadFirstPage()
        XCTAssertTrue(emptyModel.items.isEmpty)
    }

    func testScopedLandingDerivesAveragesFromInRangeNightsAndExcludesUncertainClockTimes() throws {
        let nights = try fixture().nights.filter { $0.sleepDay >= "2026-09-19" && $0.sleepDay <= "2026-10-01" }.sorted { $0.sleepDay > $1.sleepDay }
        let live = RecoverySleepLiveTrends(
            schemaVersion: "recovery-sleep-trends-v1", range: .init(startDate: "2026-09-19", endDate: "2026-10-01"), granularity: .night,
            nightSeries: nights, weekSeries: [], nights: nights,
            page: .init(limit: 30, count: nights.count, nextCursor: nil), strategicUse: "quarantined"
        )
        let landing = RecoverySleepAdapter.scopedLanding(live)
        XCTAssertEqual(landing.nights.count, min(14, nights.count))
        let seven = nights.filter { $0.status == .asleepRecorded }.prefix(7).compactMap { $0.mainSleep?.asleepSeconds }
        XCTAssertEqual(landing.sevenNightAverage.asleepSeconds, RecoverySleepStats.roundedMean(Array(seven)))
        // Only the prospective (reliable) newest night participates in the formal window.
        let reliable = nights.prefix(14).filter { $0.timeZoneUncertain != true }
        XCTAssertEqual(landing.sleepWindow.nightsIncluded, reliable.count)
        XCTAssertEqual(landing.sleepWindow.nightsExcludedUncertainTime, nights.prefix(14).filter { $0.timeZoneUncertain == true }.count)
        XCTAssertGreaterThan(landing.sleepWindow.nightsExcludedUncertainTime, 0)
        XCTAssertEqual(landing.state, .available)
    }

    func testProspectiveReliableNightsParticipateInConsistencyOnceTheyAccrue() throws {
        func night(_ day: String, startUTC: String, endUTC: String, uncertain: Bool) throws -> RecoverySleepLiveNight {
            try RecoverySleepDecoding.decoder().decode(RecoverySleepLiveNight.self, from: Data(#"{"sleepDay":"\#(day)","status":"asleep_recorded","stageStatus":"available","algorithmVersion":"sleep-canon-v2","mainSleep":{"asleepSeconds":25200},"sleepWindow":{"start":"\#(startUTC)","end":"\#(endUTC)","timeZone":"America/Los_Angeles"},"timeZoneUncertain":\#(uncertain),"provenance":{"origin":"\#(uncertain ? "historical_evidence_import" : "validation_only")"}}"#.utf8))
        }
        // Three reliable prospective nights (about 11 PM - 7 AM Pacific) plus two uncertain historical ones.
        let nights = [
            try night("2026-10-05", startUTC: "2026-10-05T06:10:00.000Z", endUTC: "2026-10-05T14:00:00.000Z", uncertain: false),
            try night("2026-10-04", startUTC: "2026-10-04T06:20:00.000Z", endUTC: "2026-10-04T14:05:00.000Z", uncertain: false),
            try night("2026-10-03", startUTC: "2026-10-03T06:00:00.000Z", endUTC: "2026-10-03T13:55:00.000Z", uncertain: false),
            try night("2026-10-02", startUTC: "2026-10-02T09:00:00.000Z", endUTC: "2026-10-02T16:00:00.000Z", uncertain: true),
            try night("2026-10-01", startUTC: "2026-10-01T09:30:00.000Z", endUTC: "2026-10-01T16:30:00.000Z", uncertain: true),
        ]
        let live = RecoverySleepLiveTrends(schemaVersion: nil, range: .init(startDate: "2026-10-01", endDate: "2026-10-05"), granularity: .night,
                                           nightSeries: nights, weekSeries: [], nights: nights, page: .init(limit: 30, count: 5, nextCursor: nil), strategicUse: "quarantined")
        let landing = RecoverySleepAdapter.scopedLanding(live)
        XCTAssertEqual(landing.sleepWindow.nightsIncluded, 3, "reliable prospective nights count")
        XCTAssertEqual(landing.sleepWindow.nightsExcludedUncertainTime, 2, "uncertain historical nights stay out of the statistics")
        // Typical window is computed midnight-safe: about 11:10 PM - 7:00 AM.
        XCTAssertEqual(landing.sleepWindow.typicalStartMinutes, 310)
        XCTAssertEqual(landing.sleepWindow.typicalEndMinutes, 780)
        let rows = SleepWindowChartRow.fromNights(landing.nights)
        XCTAssertTrue(landing.sleepWindow.isPlausible(against: rows))
    }

    // MARK: C. Shared date-axis policy

    private func noonDates(_ keys: [String]) -> [Date] { keys.compactMap { SleepEvidenceFormat.chartDate($0) } }

    private func dayKeys(from start: String, count: Int) -> [String] {
        (0..<count).compactMap { SleepEvidenceDay.shift(start, days: $0) }
    }

    func testEachSelectorGetsItsTargetDensity() {
        let cases: [(RecoverySleepTrendRange, Int, ClosedRange<Int>, Int?)] = [
            (.twoWeeks, 14, 3...5, 3),
            (.oneMonth, 30, 3...5, 7),
            (.threeMonths, 90, 4...7, 14),
            (.sixMonths, 183, 4...6, nil),
            (.all, 88, 1...3, nil),
        ]
        for (selector, days, expectedCount, strideDays) in cases {
            let dates = noonDates(dayKeys(from: SleepEvidenceDay.shift("2026-10-01", days: -(days - 1)) ?? "2026-07-06", count: days))
            let plan = SleepAxisPolicy.plan(selector: selector, pointDates: dates)
            XCTAssertTrue(expectedCount.contains(plan.ticks.count), "\(selector): \(plan.ticks.map(\.label))")
            if let strideDays {
                for (a, b) in zip(plan.ticks, plan.ticks.dropFirst()) {
                    XCTAssertEqual(Calendar.current.dateComponents([.day], from: a.date, to: b.date).day, strideDays, "\(selector)")
                }
            }
        }
    }

    func testTicksStayInsideTheDomainAwayFromEdgesAndAlignWithBars() {
        for (selector, days) in [(RecoverySleepTrendRange.twoWeeks, 14), (.oneMonth, 30), (.threeMonths, 90), (.sixMonths, 183), (.all, 88)] {
            let keys = dayKeys(from: SleepEvidenceDay.shift("2026-10-01", days: -(days - 1)) ?? "2026-07-06", count: days)
            let dates = noonDates(keys)
            let plan = SleepAxisPolicy.plan(selector: selector, pointDates: dates)
            let length = plan.domain.upperBound.timeIntervalSince(plan.domain.lowerBound)
            XCTAssertEqual(plan.ticks.count, Set(plan.ticks.map(\.label)).count, "labels are unique for \(selector)")
            for tick in plan.ticks {
                XCTAssertTrue(plan.domain.contains(tick.date))
                let leftFraction = tick.date.timeIntervalSince(plan.domain.lowerBound) / length
                XCTAssertGreaterThanOrEqual(leftFraction, SleepAxisPolicy.edgeMarginFraction - 0.0001, "\(selector) \(tick.label)")
                XCTAssertGreaterThanOrEqual(1 - leftFraction, SleepAxisPolicy.edgeMarginFraction - 0.0001, "\(selector) \(tick.label)")
                if selector != .sixMonths && selector != .all {
                    XCTAssertTrue(dates.contains(tick.date), "day ticks land exactly on a plotted night (\(selector))")
                }
            }
        }
    }

    func testLabelsNeverCrowdAtPhoneWidths() {
        // A plot is at least ~280 pt wide on any supported iPhone; a label is
        // ~44 pt. Every adjacent pair of ticks must leave at least that gap.
        for (selector, days) in [(RecoverySleepTrendRange.twoWeeks, 14), (.oneMonth, 30), (.threeMonths, 90), (.sixMonths, 183), (.all, 88), (.all, 120)] {
            let keys = dayKeys(from: SleepEvidenceDay.shift("2026-10-01", days: -(days - 1)) ?? "2026-07-06", count: days)
            let plan = SleepAxisPolicy.plan(selector: selector, pointDates: noonDates(keys))
            let length = plan.domain.upperBound.timeIntervalSince(plan.domain.lowerBound)
            for (a, b) in zip(plan.ticks, plan.ticks.dropFirst()) {
                let points = b.date.timeIntervalSince(a.date) / length * 280
                XCTAssertGreaterThanOrEqual(points, 38, "\(selector) \(a.label)→\(b.label) only \(Int(points)) pt apart")
            }
            XCTAssertLessThanOrEqual(plan.ticks.count, 8, "\(selector)")
        }
    }

    func testAllIncludesTheYearWhenCrossingACalendarYear() {
        let keys = dayKeys(from: "2026-07-06", count: 250) // Jul 6 2026 → Mar 12 2027
        let plan = SleepAxisPolicy.plan(selector: .all, pointDates: noonDates(keys))
        XCTAssertEqual(plan.style, .monthly)
        let labels = plan.ticks.map(\.label)
        XCTAssertTrue(labels.contains("Jan 2027"), "\(labels)")
        XCTAssertTrue(labels.first?.contains("2026") == true, "the first label carries its year when the span crosses a year: \(labels)")
        XCTAssertTrue(labels.contains("Mar 2027") == false, "only January and the first tick carry a year: \(labels)")
        // Within one calendar year no year is shown.
        let single = SleepAxisPolicy.plan(selector: .all, pointDates: noonDates(dayKeys(from: "2026-07-06", count: 88)))
        XCTAssertFalse(single.ticks.contains { $0.label.contains("20") })
    }

    func testDenseEightySevenNightDataKeepsEveryPointAndOnlyThinsLabels() throws {
        let landing = RecoverySleepAdapter.landing(try fixture().examples.landing)
        XCTAssertEqual(landing.nights.count, 14)
        let nights = try fixture().nights
        XCTAssertEqual(nights.count, 85)
        let live = RecoverySleepLiveTrends(schemaVersion: nil, range: .init(startDate: "2026-07-06", endDate: today), granularity: .night,
                                           nightSeries: nights.sorted { $0.sleepDay > $1.sleepDay }, weekSeries: [],
                                           nights: nights.sorted { $0.sleepDay > $1.sleepDay }, page: .init(limit: 100, count: nights.count, nextCursor: nil), strategicUse: "quarantined")
        let trends = RecoverySleepAdapter.trends(live)
        let points = SleepTotalChartPoint.fromTrends(trends)
        XCTAssertEqual(points.count, 85, "no nightly point is dropped for label density")
        let plan = SleepAxisPolicy.plan(selector: .all, pointDates: points.map(\.date))
        XCTAssertLessThanOrEqual(plan.ticks.count, 3)
        // Window rows are labelled on the same days as the plan.
        let rows = SleepWindowChartRow.fromTrends(trends.windowRows ?? [])
        let rowLabels = SleepAxisPolicy.rowLabels(plan: plan, rowDays: rows.map(\.id))
        XCTAssertEqual(rowLabels.count, plan.ticks.count)
        XCTAssertEqual(trends.continuity?.count, 85)
    }

    // MARK: D. Time-zone presentation

    func testHistoricalClockTimesAreApproximateWhileTotalsStayExactAndStillExcluded() throws {
        let historical = RecoverySleepAdapter.summary(try fixture().nights.first { $0.sleepDay == "2026-09-29" }!)
        XCTAssertFalse(historical.includedInConsistency, "formal consistency still excludes the night")
        XCTAssertTrue(historical.clock.window?.hasPrefix("≈ ") == true, "a small approximate marker where a clock time is shown")
        XCTAssertNotNil(historical.asleepSeconds)
        let rows = SleepWindowChartRow.fromNights([historical])
        XCTAssertEqual(rows.count, 1)
        XCTAssertFalse(rows[0].includedInConsistency, "the exclusion fact is preserved even though the bar is no longer faded")

        let prospective = RecoverySleepAdapter.summary(try fixture().nights.first { $0.sleepDay == "2026-10-01" }!)
        XCTAssertTrue(prospective.includedInConsistency)
        XCTAssertFalse(prospective.clock.window?.contains("≈") ?? true)
    }

    func testOneConciseNoteReplacesTheTechnicalWording() {
        let note = SleepEvidenceCopy.approximateClockTimes
        XCTAssertEqual(note, "Historical clock times are approximate. Sleep duration is exact. Historical time zones were not preserved, so sleep and wake times may shift during travel.")
        for forbidden in ["device_at_ingest", "ingest", "inferred", "uncertain"] {
            XCTAssertFalse(note.lowercased().contains(forbidden), forbidden)
        }
        let historical = SleepClockPresentation(night: RecoverySleepAdapter.summary(try! fixture().nights.first { $0.sleepDay == "2026-09-29" }!))
        XCTAssertEqual(historical.shortProvenance, "estimated")
        XCTAssertFalse(historical.provenanceText.lowercased().contains("device_at_ingest"))
    }

    // MARK: B. Page stability (real UIKit)

    @MainActor
    func testContentAreaPopIsSuppressedOnlyWhileAStablePageIsVisibleAndEdgePopSurvives() throws {
        guard #available(iOS 26.0, *) else { throw XCTSkip("The content-area pop recognizer is iOS 26+.") }
        let root = UIViewController()
        let navigation = UINavigationController(rootViewController: root)
        let window = makeWindow(width: 390)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        let content = try XCTUnwrap(navigation.interactiveContentPopGestureRecognizer)
        XCTAssertTrue(content.isEnabled, "the OS default: a content-area back drag is live")

        let stable = UIHostingController(rootView: Text("Stable page").suppressesContentAreaPopGesture().restoresInteractivePopGesture())
        navigation.pushViewController(stable, animated: false)
        pump()
        XCTAssertFalse(content.isEnabled, "dragging cards or charts can no longer pull the page sideways")
        XCTAssertTrue(navigation.interactivePopGestureRecognizer?.isEnabled == true, "the leading-edge swipe-back stays")

        // A second stable page: never flickers back on between pages.
        let second = UIHostingController(rootView: Text("Second stable page").suppressesContentAreaPopGesture().restoresInteractivePopGesture())
        navigation.pushViewController(second, animated: false)
        pump()
        XCTAssertFalse(content.isEnabled)
        XCTAssertTrue(navigation.interactivePopGestureRecognizer?.isEnabled == true)

        // A page that does not opt in gets the OS behavior back.
        let ordinary = UIHostingController(rootView: Text("Ordinary page"))
        navigation.pushViewController(ordinary, animated: false)
        pump()
        XCTAssertTrue(content.isEnabled, "other pages keep the system behavior")

        navigation.popToViewController(root, animated: false)
        pump()
        XCTAssertTrue(content.isEnabled)
        XCTAssertFalse(ContentAreaPopRegistry.isSuppressed(navigation))
        window.isHidden = true
    }

    @MainActor
    func testRecoveryPagesHaveNoHorizontalOverflowAtSupportedWidths() async throws {
        let suite = "PhysiqueOS.RecoverySleepLayout.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        for width in [375.0, 390.0, 402.0, 430.0, 440.0] {
            let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority"))
            let screens: [(String, AnyView)] = [
                ("landing", AnyView(RecoveryEvidenceView())),
                ("trends", AnyView(RecoverySleepTrendsView())),
                ("night", AnyView(RecoverySleepNightView(sleepDay: "2026-09-29"))),
            ]
            for (name, view) in screens {
                let host = UIHostingController(rootView: NavigationStack { view }.environment(environment).preferredColorScheme(.dark))
                let window = makeWindow(width: width)
                window.rootViewController = host
                window.makeKeyAndVisible()
                await settle()
                var scrolls: [UIScrollView] = []
                func collect(_ view: UIView) { if let scroll = view as? UIScrollView { scrolls.append(scroll) }; view.subviews.forEach(collect) }
                collect(window)
                let pages = scrolls.filter { $0.bounds.width > 100 && $0.bounds.height > 100 }
                XCTAssertFalse(pages.isEmpty, "\(name) @\(width)")
                for page in pages {
                    XCTAssertLessThanOrEqual(page.contentSize.width, page.bounds.width + 0.5, "\(name) @\(width): content \(page.contentSize.width) vs viewport \(page.bounds.width)")
                    XCTAssertFalse(page.alwaysBounceHorizontal, "\(name) @\(width)")
                }
                window.isHidden = true
            }
        }
    }

    @MainActor
    private func makeWindow(width: CGFloat) -> UIWindow {
        let frame = CGRect(x: 0, y: 0, width: width, height: 874)
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            let window = UIWindow(windowScene: scene)
            window.frame = frame
            return window
        }
        return UIWindow(frame: frame)
    }

    @MainActor
    private func pump() { RunLoop.main.run(until: Date().addingTimeInterval(0.6)) }

    @MainActor
    private func settle() async {
        for _ in 0..<12 {
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
    }

    // MARK: Helpers

    private static func envelope(_ resource: String, _ data: String) -> String {
        #"{"contractVersion":"1","resource":"\#(resource)","authority":"founder-production","generatedAt":"2026-10-01T15:00:00.000Z","data":\#(data)}"#
    }

    private func exampleJSON(_ key: String) throws -> String {
        let url = try XCTUnwrap(bundle.url(forResource: "RecoverySleepFixture", withExtension: "json"))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let examples = try XCTUnwrap(object["examples"] as? [String: Any])
        return try XCTUnwrap(String(data: try JSONSerialization.data(withJSONObject: try XCTUnwrap(examples[key])), encoding: .utf8))
    }

    private func pairedAPI(_ transport: PolishStubTransport) async throws -> ProductionNativeAPI {
        let native = ProductionNativeAPI(baseURL: URL(string: "https://example.invalid")!, credentialStore: PolishMemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Synthetic test")
        return native
    }
}

// MARK: - Test doubles

private struct FailingGoalWindowsAPI: RecoverySleepAPI {
    func today() -> String { "2026-10-01" }
    func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow] { throw RecoverySleepAPIError.notAvailable }
    func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding { throw RecoverySleepAPIError.notAvailable }
    func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends { throw RecoverySleepAPIError.notAvailable }
    func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage { throw RecoverySleepAPIError.notAvailable }
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail { throw RecoverySleepAPIError.notAvailable }
}

private actor PolishStubTransport: FounderHTTPTransport {
    struct Read: Sendable {
        let path: String
        let query: [String: String]
    }

    private let responder: @Sendable (String, [String: String]) -> (Int, String)
    private(set) var reads: [Read] = []

    init(responder: @escaping @Sendable (String, [String: String]) -> (Int, String)) { self.responder = responder }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let url = try XCTUnwrap(request.url)
        if url.path.hasSuffix("/auth/pair") {
            let token = String(repeating: "a", count: 43)
            let refresh = String(repeating: "r", count: 43)
            let session = #"{"sessionId":"session-1","deviceId":"server-device-1","accessToken":"\#(token)","accessExpiresAt":"2099-09-01T12:10:00.000Z","refreshCredential":"\#(refresh)","refreshIdleExpiresAt":"2099-10-01T12:00:00.000Z","refreshAbsoluteExpiresAt":"2099-11-30T12:00:00.000Z"}"#
            return (Data(session.utf8), HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let query = Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
        reads.append(Read(path: url.lastPathComponent, query: query))
        let (status, body) = responder(url.lastPathComponent, query)
        return (Data(body.utf8), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
}

private final class PolishMemoryCredentialStore: FounderRefreshCredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var credential: String?
    func loadRefreshCredential() throws -> String? { lock.withLock { credential } }
    func saveRefreshCredential(_ credential: String) throws { lock.withLock { self.credential = credential } }
    func deleteRefreshCredential() throws { lock.withLock { credential = nil } }
}

/// Build 90 Founder-approved Recovery/Sleep presentation: the lighter
/// Continuity point/line keeps non-available nights as explicit gaps, and the
/// nightly Total Sleep line floats (delta 6) while bar summaries stay zero-based.
final class RecoverySleepRedesignPresentationTests: XCTestCase {
    private func row(_ day: String, _ status: RecoverySleepDetailStatus, awake: Int? = 1200) -> RecoverySleepTrends.ContinuityRow {
        RecoverySleepTrends.ContinuityRow(sleepDay: day, status: status, awakeInWindowSeconds: awake, longestAsleepStretchSeconds: awake.map { $0 * 5 })
    }

    func testContinuitySplitsRunsAtNonAvailableNightsAndBridgesTheGap() {
        // Newest first, as the Server sends them; Sep 21 has no stage detail.
        let rows = [row("2026-09-23", .available), row("2026-09-22", .available), row("2026-09-21", .absent),
                    row("2026-09-20", .available), row("2026-09-19", .available)]
        let series = SleepContinuitySeries(rows: rows) { $0.awakeInWindowSeconds.map { Double($0) / 60 } }
        XCTAssertEqual(series.points.map(\.day), ["2026-09-19", "2026-09-20", "2026-09-22", "2026-09-23"])
        XCTAssertEqual(series.points.map(\.run), [0, 0, 1, 1])
        XCTAssertEqual(series.bridges.count, 1)
        XCTAssertEqual(series.bridges.first?.from.day, "2026-09-20")
        XCTAssertEqual(series.bridges.first?.to.day, "2026-09-22")
        XCTAssertFalse(series.points.contains { $0.day == "2026-09-21" }, "a gap night is never interpolated")
    }

    func testRecalculatingAndMissingValueNightsAreGapsAndEdgesAreNotBridged() {
        let rows = [row("2026-09-24", .pendingCorrection), row("2026-09-23", .available), row("2026-09-22", .available, awake: nil),
                    row("2026-09-21", .available), row("2026-09-20", .unknown)]
        let series = SleepContinuitySeries(rows: rows) { $0.awakeInWindowSeconds.map(Double.init) }
        XCTAssertEqual(series.points.map(\.day), ["2026-09-21", "2026-09-23"])
        XCTAssertEqual(series.bridges.count, 1)
        XCTAssertTrue(SleepContinuitySeries(rows: [row("2026-09-20", .absent)]) { $0.awakeInWindowSeconds.map(Double.init) }.points.isEmpty)
    }

    func testNightlyLineFloatsWhileBarSummariesStartAtZero() {
        let date = Date(timeIntervalSince1970: 0)
        let points = [SleepTotalChartPoint(id: "a", date: date, asleepSeconds: 6 * 3600 + 12 * 60, averageSeconds: nil),
                      SleepTotalChartPoint(id: "b", date: date, asleepSeconds: 7 * 3600 + 40 * 60, averageSeconds: nil),
                      SleepTotalChartPoint(id: "c", date: date, asleepSeconds: nil, averageSeconds: nil)]
        XCTAssertEqual(SleepTotalChart.floorHours(points: points, style: .area), 5)
        XCTAssertEqual(SleepTotalChart.floorHours(points: points, style: .bars), 0)
        let short = [SleepTotalChartPoint(id: "s", date: date, asleepSeconds: 50 * 60, averageSeconds: nil)]
        XCTAssertEqual(SleepTotalChart.floorHours(points: short, style: .area), 0, "the floor never goes below zero")
    }

    func testLockedStagePaletteCoversEveryStage() {
        for stage in RecoverySleepStage.allCases + [.unknown] {
            _ = SleepPalette.stage(stage)
        }
        XCTAssertNotEqual(UIColor(SleepPalette.awake).resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)),
                          UIColor(SleepPalette.awake).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)),
                          "every stage color resolves for both Dark and Mineral Light")
    }
}
