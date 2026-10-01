import XCTest
@testable import PhysiqueOS

/// Recovery / Sleep Evidence against the LIVE Server contract (b81c784e):
/// decoding, adapter semantics, bounded ranges and paging, time-zone honesty,
/// strategic quarantine passthrough, and Production-vs-fixture isolation.
/// All payloads are synthetic.
final class RecoverySleepReadModelTests: XCTestCase {
    private let bundle = Bundle(for: AppEnvironment.self)

    private func fixture() throws -> FixtureRecoverySleepAPI.FixtureFile {
        try FixtureRecoverySleepAPI(bundle: bundle).loadFixture()
    }

    private func allRange(_ today: String = "2026-10-01") -> RecoverySleepScopeRange {
        RecoverySleepScopeResolver.resolve(scope: .all, goalWindow: nil, today: today)
    }

    private func liveNight(_ day: String) throws -> RecoverySleepLiveNight {
        try XCTUnwrap(try fixture().nights.first { $0.sleepDay == day })
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try RecoverySleepDecoding.decoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: Live decode

    func testLiveExamplesDecodeThroughProductionDecoder() throws {
        let examples = try fixture().examples
        XCTAssertEqual(examples.landing.schemaVersion, "recovery-sleep-evidence-v1")
        XCTAssertEqual(examples.landing.strategicUse, "quarantined")
        XCTAssertEqual(examples.landing.nights.count, 14)
        XCTAssertEqual(examples.trendsNight.granularity, .night)
        XCTAssertEqual(examples.trendsNight.nightSeries.count, examples.trendsNight.nights.count)
        XCTAssertEqual(examples.trendsWeek.granularity, .week)
        XCTAssertFalse(examples.trendsWeek.weekSeries.isEmpty)
        XCTAssertTrue(examples.trendsWeek.nightSeries.isEmpty)
        XCTAssertNotNil(examples.trendsPage2.page.nextCursor)
        XCTAssertEqual(examples.night.algorithmVersion, "sleep-canon-v2")
        XCTAssertEqual(examples.night.provenance?.origin, "historical_evidence_import")
        XCTAssertEqual(examples.night.strategicEligible, false)
    }

    func testUnknownServerValuesDecodeTolerantly() throws {
        let night = try decode(RecoverySleepLiveNight.self, #"{"sleepDay":"2026-10-02","status":"future","stageStatus":"pending_v3","timeline":[{"stage":"asleep_light_v9","start":"2026-10-02T06:00:00.000Z","end":"2026-10-02T07:00:00.000Z"}],"timeZoneBasis":"satellite","provenance":{"origin":"future_import"}}"#)
        XCTAssertEqual(night.status, .unknown)
        XCTAssertEqual(night.stageStatus, .unknown)
        XCTAssertEqual(night.timeline?.first?.stage, .unknown)
        let summary = RecoverySleepAdapter.summary(night)
        XCTAssertEqual(summary.stageStatus, .unknown)
        XCTAssertEqual(summary.origin, .unknown)
        XCTAssertEqual(summary.timeZoneCertainty, .unknown)
        XCTAssertFalse(summary.hasSleep)
        let detail = RecoverySleepAdapter.detail(night)
        XCTAssertNil(detail.main, "no window -> no main episode rendering")
    }

    func testNightDetailNullDataDecodes() throws {
        let envelope = #"{"contractVersion":"1","resource":"recovery-sleep-night","authority":"founder-production","generatedAt":"2026-10-01T15:00:00.000Z","data":null}"#
        let decoded = try RecoverySleepDecoding.decoder().decode(ProductionResponseEnvelope<RecoverySleepLiveNightDetail?>.self, from: Data(envelope.utf8))
        XCTAssertNil(decoded.data)
    }

    // MARK: Stage gating (never show numbers unless Server says available)

    func testStageAvailabilityMapping() throws {
        let staged = RecoverySleepAdapter.detail(try liveNight("2026-09-29"))
        XCTAssertEqual(staged.night.stageStatus, .available)
        XCTAssertNotNil(staged.main?.stages.deepSeconds)
        XCTAssertNotNil(staged.main?.continuity.longestAsleepStretchSeconds)
        XCTAssertFalse(staged.main?.timeline.segments.isEmpty ?? true)

        let unstaged = RecoverySleepAdapter.detail(try liveNight("2026-09-14"))
        XCTAssertEqual(unstaged.night.stageStatus, .absent)
        XCTAssertNil(unstaged.main?.stages.deepSeconds, "unavailable stages are withheld even though the Server sends values")
        XCTAssertNil(unstaged.main?.stages.awakeSeconds)
        XCTAssertNil(unstaged.main?.continuity.longestAsleepStretchSeconds)
        XCTAssertEqual(unstaged.main?.timeline.segments.map(\.stage), [.unspecified])
        XCTAssertEqual(unstaged.provenance?.corroboratingLabels, ["Oura"])

        let older = RecoverySleepAdapter.detail(try liveNight("2026-09-21"))
        XCTAssertEqual(older.night.stageStatus, .pendingCorrection)
        XCTAssertNil(older.main?.stages.deepSeconds)
        XCTAssertTrue(older.main?.timeline.segments.isEmpty ?? false)
        XCTAssertNotNil(older.night.asleepSeconds, "total sleep stays valid")

        // A Server `available` for a non-v2 night is never trusted for numbers.
        let json = #"{"sleepDay":"2026-09-01","status":"asleep_recorded","stageStatus":"available","algorithmVersion":"sleep-canon-v1","stages":{"deepSeconds":1},"sleepWindow":{"start":"2026-09-01T06:00:00.000Z","end":"2026-09-01T13:00:00.000Z","timeZone":"America/Los_Angeles"}}"#
        XCTAssertNil(RecoverySleepAdapter.detail(try decode(RecoverySleepLiveNight.self, json)).main?.stages.deepSeconds)
    }

    // MARK: Time zone / origin / quarantine

    func testHistoricalUncertainNightsAreApproximateAndExcluded() throws {
        let historical = RecoverySleepAdapter.summary(try liveNight("2026-09-29"))
        XCTAssertEqual(historical.origin, .historicalImport)
        XCTAssertEqual(historical.timeZoneCertainty, .uncertain)
        XCTAssertFalse(historical.includedInConsistency)
        XCTAssertTrue(historical.clock.isClockTimeCaution)
        XCTAssertTrue(historical.clock.window?.hasPrefix("≈ ") == true)
        XCTAssertNotNil(historical.asleepSeconds, "total sleep stays exact")

        let prospective = RecoverySleepAdapter.summary(try liveNight("2026-10-01"))
        XCTAssertEqual(prospective.origin, .prospective)
        XCTAssertEqual(prospective.timeZoneCertainty, .inferred)
        XCTAssertTrue(prospective.includedInConsistency)
        XCTAssertFalse(prospective.clock.isClockTimeCaution)
    }

    func testOriginMappingToleratesLiveAndFutureValues() {
        XCTAssertEqual(RecoverySleepOrigin("historical_evidence_import"), .historicalImport)
        XCTAssertEqual(RecoverySleepOrigin("validation_only"), .prospective)
        XCTAssertEqual(RecoverySleepOrigin("operational"), .prospective)
        XCTAssertEqual(RecoverySleepOrigin("something_new"), .unknown)
        XCTAssertEqual(RecoverySleepOrigin(nil), .unknown)
    }

    func testUpdatingWindowDerivesFromSleepDayAndZone() throws {
        let night = try liveNight("2026-10-01")
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let morning = calendar.date(from: DateComponents(year: 2026, month: 10, day: 1, hour: 9))!
        let evening = calendar.date(from: DateComponents(year: 2026, month: 10, day: 1, hour: 19))!
        XCTAssertTrue(RecoverySleepAdapter.summary(night, now: morning).windowOpen)
        XCTAssertFalse(RecoverySleepAdapter.summary(night, now: evening).windowOpen)
    }

    func testSecondarySleepCarriesLabelOnly() throws {
        let detail = RecoverySleepAdapter.detail(try liveNight("2026-09-20"))
        XCTAssertEqual(detail.secondary.count, 1)
        XCTAssertEqual(detail.secondary.first?.sourceLabel, "Apple Watch")
        XCTAssertEqual(detail.night.secondaryEpisodeCount, 1)
        XCTAssertEqual(detail.night.totalAsleepIncludingSecondarySeconds, (detail.night.asleepSeconds ?? 0) + 31 * 60)
    }

    // MARK: Landing adapter

    func testLandingAdapterPassesServerFactsThrough() throws {
        let live = try fixture().examples.landing
        let landing = RecoverySleepAdapter.landing(live)
        XCTAssertEqual(landing.state, .available)
        XCTAssertEqual(landing.sevenNightAverage.asleepSeconds, live.sevenNightAverage.seconds)
        XCTAssertEqual(landing.sevenNightAverage.nightCount, live.sevenNightAverage.nightCount)
        XCTAssertEqual(landing.sleepWindow.nightsIncluded, live.window.nightsUsed)
        XCTAssertEqual(landing.sleepWindow.nightsExcludedUncertainTime, live.window.inferredNightsExcluded)
        XCTAssertEqual(landing.sleepWindow.typicalStartMinutes, RecoverySleepAdapter.minutesAfterSix(fromMinuteOfDay: live.window.medianStartMinute))
        XCTAssertEqual(Set(landing.sources.map(\.label)), Set(live.sources.map(\.label)))
        XCTAssertEqual(landing.sources.first { $0.label == "Oura" }?.role, .counted)
        XCTAssertEqual(landing.nights.map(\.sleepDay), live.nights.map(\.sleepDay))
        // Exclusion follows the Server's own predicate, night by night.
        for night in landing.nights { XCTAssertEqual(night.includedInConsistency, night.timeZoneCertainty != .uncertain) }
    }

    func testNoDataLanding() throws {
        let live = try decode(RecoverySleepLiveLanding.self, #"{"schemaVersion":"recovery-sleep-evidence-v1","lastNight":null,"nights":[],"sevenNightAverage":{"seconds":null,"nightCount":0},"window":{"medianStartMinute":null,"medianEndMinute":null,"startSpreadMinutes":null,"endSpreadMinutes":null,"nightsUsed":0,"inferredNightsExcluded":0},"sources":[],"strategicUse":"quarantined"}"#)
        let landing = RecoverySleepAdapter.landing(live)
        XCTAssertEqual(landing.state, .noData)
        XCTAssertEqual(RecoverySleepHubSummary.metric(landing, today: "2026-10-01"), "Waiting for first synced night")
        XCTAssertEqual(RecoverySleepHubSummary.stream(landing, today: "2026-10-01").status, .placeholder)
    }

    func testHubRowSummaries() throws {
        let landing = RecoverySleepAdapter.landing(try fixture().examples.landing)
        let duration = SleepEvidenceFormat.duration(landing.lastNight?.asleepSeconds)
        XCTAssertEqual(RecoverySleepHubSummary.metric(landing, today: "2026-10-01"), "Last night · \(duration)")
        XCTAssertEqual(RecoverySleepHubSummary.metric(landing, today: "2026-10-03"), "Oct 1 · \(duration)")
        XCTAssertEqual(RecoverySleepHubSummary.stream(landing, today: "2026-10-01").destination, .progressStream(streamId: "recovery"))
    }

    func testWindowMedianGuardWithholdsMidnightStraddlingMedian() throws {
        func row(_ id: String, _ start: Int, _ end: Int) -> SleepWindowChartRow {
            SleepWindowChartRow(id: id, label: id, startMinutes: start, endMinutes: end, includedInConsistency: true)
        }
        // 11:50 PM and 12:20 AM starts: a raw minute-of-day median is ~12:05 PM.
        // A sleep that starts before 18:00 of its window is clamped, never inverted.
        let early = try RecoverySleepDecoding.decoder().decode(RecoverySleepLiveNight.self, from: Data(#"{"sleepDay":"2026-10-03","status":"asleep_recorded","stageStatus":"unavailable","algorithmVersion":"sleep-canon-v2","sleepWindow":{"start":"2026-10-02T00:00:00.000Z","end":"2026-10-02T08:00:00.000Z","timeZone":"America/Los_Angeles"},"timeZoneUncertain":false}"#.utf8))
        let clamped = try XCTUnwrap(RecoverySleepAdapter.windowRow(early))
        XCTAssertLessThanOrEqual(clamped.startMinutes, clamped.endMinutes)
        let rows = [row("a", 350, 780), row("b", 380, 790), row("c", 365, 785)]
        let straddled = RecoverySleepWindowSummary(typicalStartMinutes: RecoverySleepAdapter.minutesAfterSix(fromMinuteOfDay: 725), typicalEndMinutes: 785,
                                                   startSpreadMinutes: 0, endSpreadMinutes: 5, nightsIncluded: 2, nightsExcludedUncertainTime: 0)
        XCTAssertFalse(straddled.isPlausible(against: rows))
        let sound = RecoverySleepWindowSummary(typicalStartMinutes: 365, typicalEndMinutes: 785, startSpreadMinutes: 15, endSpreadMinutes: 5, nightsIncluded: 2, nightsExcludedUncertainTime: 0)
        XCTAssertTrue(sound.isPlausible(against: rows))
        XCTAssertFalse(sound.isPlausible(against: Array(rows.prefix(2))), "fewer than 3 reliable nights shows no typical window")
        XCTAssertFalse(sound.isPlausible(against: rows.map { SleepWindowChartRow(id: $0.id, label: $0.label, startMinutes: $0.startMinutes, endMinutes: $0.endMinutes, includedInConsistency: false) }))
    }

    // MARK: Ranges / paging

    func testRangeSelectorsAreBoundedAndUseServerGranularity() throws {
        let today = "2026-10-01"
        func range(_ selector: RecoverySleepTrendRange, today: String = today) throws -> RecoverySleepQuery.Range {
            try XCTUnwrap(RecoverySleepQuery.range(selector, scope: allRange(today)))
        }
        let twoWeeks = try range(.twoWeeks)
        XCTAssertEqual(twoWeeks.startDate, "2026-09-18")
        XCTAssertEqual(twoWeeks.endDate, today)
        XCTAssertEqual(SleepEvidenceDay.span(try range(.oneMonth).startDate, today), 30)
        // Until the Evidence is that old, 3M / 6M are clamped to its start.
        XCTAssertEqual(try range(.threeMonths).startDate, "2026-07-06")
        XCTAssertEqual(try range(.sixMonths).startDate, "2026-07-06")
        let later = "2027-03-01"
        XCTAssertEqual(SleepEvidenceDay.span(try range(.threeMonths, today: later).startDate, later), 90)
        XCTAssertEqual(SleepEvidenceDay.span(try range(.sixMonths, today: later).startDate, later), 183, "weekly at the Server threshold")
        let all = try range(.all)
        XCTAssertEqual(all.startDate, "2026-07-06", "All starts at the Evidence boundary, never earlier")
        XCTAssertEqual(all.limit, 100)
        // No scope ever reaches before the Evidence start, at any date.
        for later in ["2026-12-01", "2027-02-01", "2027-06-01"] {
            XCTAssertEqual(try range(.all, today: later).startDate, "2026-07-06", later)
            XCTAssertGreaterThanOrEqual(try range(.sixMonths, today: later).startDate, "2026-07-06", later)
        }
        for selector in RecoverySleepTrendRange.allCases {
            let bounds = try range(selector)
            XCTAssertLessThanOrEqual(bounds.startDate, bounds.endDate)
            XCTAssertLessThanOrEqual(SleepEvidenceDay.span(bounds.startDate, bounds.endDate) ?? 9999, 3660)
        }
    }

    func testSandboxEmulationMatchesServerPortExamples() async throws {
        let file = try fixture()
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        XCTAssertEqual(api.today(), file.anchorSleepDay)
        let landing = try await api.fetchLanding(policy: .cacheFirst)
        let expected = RecoverySleepAdapter.landing(file.examples.landing, now: landing.lastNight.map { _ in Self.anchorNow } ?? .now)
        XCTAssertEqual(landing.nights.map(\.sleepDay), expected.nights.map(\.sleepDay))
        XCTAssertEqual(landing.sevenNightAverage, expected.sevenNightAverage)
        XCTAssertEqual(landing.sleepWindow, expected.sleepWindow)
        XCTAssertEqual(landing.sources.map(\.label), expected.sources.map(\.label))

        let week = try await api.fetchTrends(selector: .all, range: allRange("2027-03-01")) // span >= 183 days: weekly at the Server threshold
        XCTAssertEqual(week.granularity, .week)
        XCTAssertEqual(week.totalSleep.map(\.periodStart), file.examples.trendsWeek.weekSeries.map(\.weekStart))
        XCTAssertEqual(week.totalSleep.map(\.asleepSeconds), file.examples.trendsWeek.weekSeries.map(\.averageAsleepSeconds))
        XCTAssertEqual(week.totalSleep.map(\.nightCount), file.examples.trendsWeek.weekSeries.map(\.nightCount))

        let month = try await api.fetchTrends(selector: .oneMonth, range: allRange())
        XCTAssertEqual(month.granularity, .night)
        XCTAssertEqual(month.totalSleep.map(\.periodStart), file.examples.trendsNight.nightSeries.map(\.sleepDay))
    }

    private static var anchorNow: Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar.date(from: DateComponents(year: 2026, month: 10, day: 1, hour: 9, minute: 41))!
    }

    @MainActor
    func testNightsPagingHasNoDuplicatesAndEnds() async throws {
        let file = try fixture()
        let model = RecoverySleepNightsViewModel(api: FixtureRecoverySleepAPI(bundle: bundle), range: allRange(), pageSize: 20)
        await model.loadFirstPage()
        XCTAssertEqual(model.items.count, 20)
        while model.canLoadMore { await model.loadMore() }
        XCTAssertEqual(model.items.count, file.nights.count)
        XCTAssertEqual(Set(model.items.map(\.sleepDay)).count, file.nights.count)
        XCTAssertEqual(model.items.map(\.sleepDay), model.items.map(\.sleepDay).sorted(by: >))
        XCTAssertEqual(model.items.last?.sleepDay, "2026-07-06")
    }

    @MainActor
    func testTrendsViewModelReadsEachRangeOnce() async throws {
        let file = try fixture()
        _ = file
        let api = CountingRecoverySleepAPI(base: FixtureRecoverySleepAPI(bundle: bundle))
        let model = RecoverySleepTrendsViewModel(api: api)
        let range = allRange()
        await model.load(range: range)
        await model.select(.twoWeeks, range: range)
        await model.select(.oneMonth, range: range)
        let calls = await api.trendCalls
        XCTAssertEqual(calls, ["1m", "2w"])
        await model.select(.all, range: range)
        guard case .loaded(let all) = model.state else { return XCTFail("expected All trends") }
        XCTAssertEqual(all.totalSleep.last?.periodStart, "2026-07-06", "All reaches the Evidence start")
    }

    @MainActor
    func testNightViewModelStatesAndNotAvailable() async throws {
        let file = try fixture()
        _ = file
        let api = FixtureRecoverySleepAPI(bundle: bundle)
        let found = RecoverySleepNightViewModel(sleepDay: "2026-09-29", api: api)
        await found.load()
        guard case .loaded(let detail) = found.state else { return XCTFail("expected night") }
        XCTAssertEqual(detail.provenance?.origin, .historicalImport)
        XCTAssertEqual(detail.provenance?.algorithmVersion, "sleep-canon-v2")
        let missing = RecoverySleepNightViewModel(sleepDay: "2026-09-10", api: api)
        await missing.load()
        XCTAssertEqual(missing.state, .notFound)
        let unavailable = RecoverySleepLandingViewModel(api: UnavailableRecoverySleepAPI())
        await unavailable.load(range: allRange())
        XCTAssertEqual(unavailable.state, .notAvailable)
    }

    // MARK: Production isolation and live request shapes

    @MainActor
    func testAuthoritySwitchAndProductionNeverUsesFixture() {
        let suite = "PhysiqueOS.RecoverySleepProviderSelection.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority"))
        XCTAssertTrue(environment.recoverySleepAPI is FixtureRecoverySleepAPI)
        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.recoverySleepAPI is ProductionRecoverySleepAPI)
    }

    func testProductionUsesLiveResourcesWithBoundedQueries() async throws {
        let file = try fixture()
        let transport = RecoverySleepStubTransport(responses: [
            "recovery-sleep-landing": (200, envelope("recovery-sleep-landing", try json(file.examples.landing, key: "landing"))),
            "recovery-sleep-trends": (200, envelope("recovery-sleep-trends", try json(file.examples.trendsPage2, key: "trendsPage2"))),
            "recovery-sleep-night": (200, envelope("recovery-sleep-night", "null")),
        ])
        let api = ProductionRecoverySleepAPI(api: try await pairedAPI(transport), clock: { "2026-10-01" })
        let landing = try await api.fetchLanding(policy: .cacheFirst)
        XCTAssertEqual(landing.nights.count, 14)
        _ = try await api.fetchTrends(selector: .threeMonths, range: allRange())
        let page = try await api.fetchNights(cursor: "2026-09-11", limit: 500, range: allRange())
        XCTAssertEqual(page.nextCursor, file.examples.trendsPage2.page.nextCursor)
        do {
            _ = try await api.fetchNight(sleepDay: "2026-09-10")
            XCTFail("null night must be not found")
        } catch { XCTAssertEqual(error as? RecoverySleepAPIError, .nightNotFound) }

        let reads = await transport.reads
        XCTAssertEqual(reads.map(\.path), ["/api/v1/native/read/recovery-sleep-landing", "/api/v1/native/read/recovery-sleep-trends",
                                           "/api/v1/native/read/recovery-sleep-trends", "/api/v1/native/read/recovery-sleep-night"])
        XCTAssertEqual(reads[0].query["throughDate"], "2026-10-01")
        XCTAssertEqual(reads[1].query["startDate"], "2026-07-06", "3M never reaches before the Evidence start")
        XCTAssertEqual(reads[1].query["endDate"], "2026-10-01")
        XCTAssertEqual(reads[1].query["limit"], "100")
        XCTAssertEqual(reads[2].query["startDate"], "2026-07-06", "history never reaches before the Evidence start")
        XCTAssertEqual(reads[2].query["cursor"], "2026-09-11")
        XCTAssertEqual(reads[2].query["limit"], "100", "page size is clamped to the Server maximum")
        XCTAssertEqual(reads[3].query["sleepDay"], "2026-09-10")
        XCTAssertTrue(reads.allSatisfy { $0.query["range"] == nil }, "no obsolete range parameter")
    }

    func testProductionMissingRouteIsNotAvailableAndBadInputNeverHitsNetwork() async throws {
        let transport = RecoverySleepStubTransport(responses: [
            "recovery-sleep-landing": (404, #"{"title":"Not found","status":404,"code":"NOT_FOUND","fieldErrors":[]}"#),
        ])
        let api = ProductionRecoverySleepAPI(api: try await pairedAPI(transport), clock: { "2026-10-01" })
        do {
            _ = try await api.fetchLanding(policy: .cacheFirst)
            XCTFail("expected notAvailable")
        } catch { XCTAssertEqual(error as? RecoverySleepAPIError, .notAvailable) }
        do {
            _ = try await api.fetchNight(sleepDay: "../evil")
            XCTFail("expected nightNotFound")
        } catch { XCTAssertEqual(error as? RecoverySleepAPIError, .nightNotFound) }
        do {
            _ = try await api.fetchNights(cursor: "not-a-day", limit: 20, range: allRange())
            XCTFail("expected rejection")
        } catch { XCTAssertEqual(error as? RecoverySleepAPIError, .nightNotFound) }
        let paths = await transport.reads.map(\.path)
        XCTAssertEqual(paths, ["/api/v1/native/read/recovery-sleep-landing"])
    }

    /// The live route serves a sleep day without a record as 404
    /// RESOURCE_NOT_FOUND; Native shows "No sleep was recorded".
    func testProductionMissingNightIsNightNotFound() async throws {
        let transport = RecoverySleepStubTransport(responses: [
            "recovery-sleep-night": (404, #"{"title":"The requested resource is unavailable.","status":404,"code":"RESOURCE_NOT_FOUND","fieldErrors":[]}"#),
        ])
        let api = ProductionRecoverySleepAPI(api: try await pairedAPI(transport), clock: { "2026-10-01" })
        do {
            _ = try await api.fetchNight(sleepDay: "2026-10-01")
            XCTFail("expected nightNotFound")
        } catch { XCTAssertEqual(error as? RecoverySleepAPIError, .nightNotFound) }
    }

    func testDestinationsRoundTrip() {
        XCTAssertEqual(RecoverySleepDestination.night("2026-09-30"), .progressStream(streamId: "recovery/sleep/night/2026-09-30"))
        XCTAssertEqual(RecoverySleepDestination.sleepDay(fromStreamId: "recovery/sleep/night/2026-09-30"), "2026-09-30")
        XCTAssertNil(RecoverySleepDestination.sleepDay(fromStreamId: "recovery/sleep/night/abc"))
        XCTAssertEqual(RecoverySleepDestination.trends, .progressStream(streamId: "recovery/sleep/trends"))
    }

    // MARK: Real Founder Production capture (local-only, env-gated)

    /// Decodes envelopes captured read-only from the live Server (directory in
    /// `RECOVERY_SLEEP_LIVE_CAPTURE_DIR`, never committed) through exactly the
    /// production decoder + adapter. Prints sanitized structure only.
    func testLiveFounderProductionCaptureDecodesAndAdapts() throws {
        guard let directory = ProcessInfo.processInfo.environment["RECOVERY_SLEEP_LIVE_CAPTURE_DIR"], !directory.isEmpty else {
            throw XCTSkip("No live capture provided (local acceptance only).")
        }
        func load<T: Decodable & Sendable>(_ name: String, _ type: T.Type) throws -> ProductionResponseEnvelope<T> {
            let data = try Data(contentsOf: URL(fileURLWithPath: directory).appendingPathComponent(name))
            return try RecoverySleepDecoding.decoder().decode(ProductionResponseEnvelope<T>.self, from: data)
        }
        var report: [String] = []

        let landingEnvelope = try load("landing.json", RecoverySleepLiveLanding.self)
        XCTAssertEqual(landingEnvelope.resource, RecoverySleepResource.landing)
        XCTAssertEqual(landingEnvelope.data.strategicUse, "quarantined")
        let landing = RecoverySleepAdapter.landing(landingEnvelope.data)
        XCTAssertEqual(landing.state, .available)
        XCTAssertNotNil(landing.lastNight?.asleepSeconds)
        XCTAssertEqual(landing.nights.count, 14)
        XCTAssertNotNil(landing.sevenNightAverage.asleepSeconds)
        let rows = SleepWindowChartRow.fromNights(landing.nights)
        for night in landing.nights where night.origin == .historicalImport {
            XCTAssertEqual(night.timeZoneCertainty, .uncertain)
            XCTAssertFalse(night.includedInConsistency)
            XCTAssertTrue(night.clock.isClockTimeCaution)
        }
        XCTAssertEqual(landing.sleepWindow.nightsExcludedUncertainTime, landing.nights.filter { !$0.includedInConsistency }.count)
        report.append("landing nights=\(landing.nights.count) excluded=\(landing.sleepWindow.nightsExcludedUncertainTime) used=\(landing.sleepWindow.nightsIncluded) typicalShown=\(landing.sleepWindow.isPlausible(against: rows)) sources=\(landing.sources.count) origins=\(Set(landing.nights.map { "\($0.origin)" }).sorted())")

        for (name, expected) in [("2w", RecoverySleepTrends.Granularity.night), ("1m", .night), ("3m", .night), ("6m", .week), ("all", .night)] {
            let envelope = try load("trends-\(name).json", RecoverySleepLiveTrends.self)
            XCTAssertEqual(envelope.data.strategicUse, "quarantined")
            let trends = RecoverySleepAdapter.trends(envelope.data)
            XCTAssertEqual(trends.granularity, expected, name)
            if expected == .night {
                XCTAssertEqual(trends.totalSleep.count, envelope.data.nights.count, name)
                XCTAssertEqual(Set(trends.totalSleep.map(\.periodStart)).count, trends.totalSleep.count, name)
                XCTAssertNil(envelope.data.page.nextCursor, "\(name): a night range must fit one page")
            }
            report.append("trends \(name) granularity=\(trends.granularity) points=\(trends.totalSleep.count) nights=\(trends.nightsWithData) windowRows=\(trends.windowRows?.count ?? 0) continuityAvailable=\(trends.continuity?.filter { $0.status == .available }.count ?? 0)")
        }

        var paged: [String] = []
        var index = 0
        var cursor: String?
        repeat {
            let envelope = try load("page-\(index).json", RecoverySleepLiveTrends.self)
            let page = RecoverySleepAdapter.page(envelope.data)
            paged += page.items.map(\.sleepDay)
            cursor = page.nextCursor
            index += 1
        } while cursor != nil
        XCTAssertEqual(Set(paged).count, paged.count, "no duplicate nights across pages")
        XCTAssertEqual(paged, paged.sorted(by: >))
        XCTAssertEqual(paged.last, RecoverySleepQuery.evidenceStartSleepDay)
        report.append("paging pages=\(index) nights=\(paged.count) unique=\(Set(paged).count) earliest=\(paged.last ?? "-")")

        for day in ["2026-09-29", "2026-08-15", "2026-07-06"] {
            let envelope = try load("night-\(day).json", RecoverySleepLiveNightDetail?.self)
            let live = try XCTUnwrap(envelope.data)
            let detail = RecoverySleepAdapter.detail(live)
            XCTAssertEqual(detail.night.stageStatus, .available, day)
            XCTAssertNotNil(detail.main?.stages.deepSeconds, day)
            XCTAssertNotNil(detail.main?.continuity.longestAsleepStretchSeconds, day)
            XCTAssertFalse(detail.main?.timeline.segments.isEmpty ?? true, day)
            XCTAssertEqual(detail.provenance?.origin, .historicalImport, day)
            XCTAssertEqual(detail.provenance?.algorithmVersion, "sleep-canon-v2", day)
            XCTAssertEqual(detail.night.timeZoneCertainty, .uncertain, day)
            XCTAssertEqual(live.strategicEligible, false, day)
            report.append("night \(day) stages=available segments=\(detail.main?.timeline.segments.count ?? 0) inBed=\(detail.main?.inBedSeconds != nil) origin=historicalImport tz=uncertain")
        }
        let prospective = try load("night-2026-10-02.json", RecoverySleepLiveNightDetail?.self)
        report.append("night 2026-10-02 present=\(prospective.data != nil)")
        print("RECOVERY_SLEEP_LIVE_ACCEPTANCE " + report.joined(separator: " | "))
    }

    // MARK: Helpers

    private func json<T>(_ value: T, key: String) throws -> String {
        let url = try XCTUnwrap(bundle.url(forResource: "RecoverySleepFixture", withExtension: "json"))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let examples = try XCTUnwrap(object["examples"] as? [String: Any])
        return try XCTUnwrap(String(data: try JSONSerialization.data(withJSONObject: try XCTUnwrap(examples[key])), encoding: .utf8))
    }

    private func envelope(_ resource: String, _ data: String) -> String {
        #"{"contractVersion":"1","resource":"\#(resource)","authority":"founder-production","generatedAt":"2026-10-01T15:00:00.000Z","data":\#(data)}"#
    }

    private func pairedAPI(_ transport: RecoverySleepStubTransport) async throws -> ProductionNativeAPI {
        let native = ProductionNativeAPI(baseURL: URL(string: "https://example.invalid")!, credentialStore: RecoverySleepMemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Synthetic test")
        return native
    }
}

// MARK: - Test doubles

private actor CountingRecoverySleepAPI: RecoverySleepAPI {
    let base: FixtureRecoverySleepAPI
    private(set) var trendCalls: [String] = []

    init(base: FixtureRecoverySleepAPI) { self.base = base }

    nonisolated func today() -> String { base.today() }
    func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow] { try await base.fetchGoalWindows() }
    func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding { try await base.fetchLanding(range: range, policy: policy) }
    func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends {
        trendCalls.append(selector.rawValue)
        return try await base.fetchTrends(selector: selector, range: range)
    }
    func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage { try await base.fetchNights(cursor: cursor, limit: limit, range: range) }
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail { try await base.fetchNight(sleepDay: sleepDay) }
}

private struct UnavailableRecoverySleepAPI: RecoverySleepAPI {
    func today() -> String { "2026-10-01" }
    func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow] { throw RecoverySleepAPIError.notAvailable }
    func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding { throw RecoverySleepAPIError.notAvailable }
    func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends { throw RecoverySleepAPIError.notAvailable }
    func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage { throw RecoverySleepAPIError.notAvailable }
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail { throw RecoverySleepAPIError.notAvailable }
}

private actor RecoverySleepStubTransport: FounderHTTPTransport {
    struct Read: Sendable {
        let path: String
        let query: [String: String]
    }

    private let responses: [String: (Int, String)]
    private(set) var reads: [Read] = []

    init(responses: [String: (Int, String)]) { self.responses = responses }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let url = try XCTUnwrap(request.url)
        if url.path.hasSuffix("/auth/pair") {
            let token = String(repeating: "a", count: 43)
            let refresh = String(repeating: "r", count: 43)
            let session = #"{"sessionId":"session-1","deviceId":"server-device-1","accessToken":"\#(token)","accessExpiresAt":"2099-09-01T12:10:00.000Z","refreshCredential":"\#(refresh)","refreshIdleExpiresAt":"2099-10-01T12:00:00.000Z","refreshAbsoluteExpiresAt":"2099-11-30T12:00:00.000Z"}"#
            return (Data(session.utf8), HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        reads.append(Read(path: url.path, query: Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })))
        guard let (status, body) = responses[url.lastPathComponent] else { throw URLError(.badServerResponse) }
        return (Data(body.utf8), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
}

private final class RecoverySleepMemoryCredentialStore: FounderRefreshCredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var credential: String?
    func loadRefreshCredential() throws -> String? { lock.withLock { credential } }
    func saveRefreshCredential(_ credential: String) throws { lock.withLock { self.credential = credential } }
    func deleteRefreshCredential() throws { lock.withLock { credential = nil } }
}
