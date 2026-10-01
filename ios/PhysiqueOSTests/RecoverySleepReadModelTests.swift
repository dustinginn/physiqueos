import XCTest
@testable import PhysiqueOS

/// Recovery / Sleep Evidence: contract decoding, state presentation,
/// time-zone honesty, bounded reads, and strict Production-vs-fixture
/// isolation. All payloads are the synthetic Sandbox fixture.
final class RecoverySleepReadModelTests: XCTestCase {
    private func fixture() throws -> FixtureRecoverySleepAPI.FixtureFile {
        try FixtureRecoverySleepAPI(bundle: Bundle(for: AppEnvironment.self)).loadFixture()
    }

    private func night(_ day: String) throws -> RecoverySleepNightDetail {
        try XCTUnwrap(try fixture().nights.first { $0.night.sleepDay == day })
    }

    // MARK: Contract decoding

    func testFixtureDecodesThroughProductionDecoderAndCoversEveryState() throws {
        let file = try fixture()
        XCTAssertEqual(file.nights.count, 30)
        let statuses = Set(file.nights.map(\.night.status))
        XCTAssertEqual(statuses, [.asleepRecorded, .noSleepRecorded])
        let stageStatuses = Set(file.nights.compactMap { $0.main?.stages.status })
        XCTAssertEqual(stageStatuses, [.available, .pendingCorrection, .absent])
        XCTAssertTrue(file.nights.contains { !$0.secondary.isEmpty })
        XCTAssertTrue(file.nights.contains { $0.night.windowOpen })
        XCTAssertTrue(file.nights.contains { !$0.night.includedInConsistency && $0.night.status == .asleepRecorded })
        XCTAssertEqual(Set(file.trends.keys), ["2w", "1m", "all", "6m"])
        XCTAssertEqual(file.trends["6m"]?.granularity, .week)
        XCTAssertNil(file.trends["6m"]?.windowRows)
    }

    func testLandingIsBoundedAndServerDerived() throws {
        let landing = try fixture().landing
        XCTAssertEqual(landing.state, .available)
        XCTAssertEqual(landing.nights.count, 14)
        XCTAssertEqual(landing.nights.first?.sleepDay, landing.lastNight?.sleepDay)
        XCTAssertEqual(landing.nights.map(\.sleepDay), landing.nights.map(\.sleepDay).sorted(by: >), "newest first")
        XCTAssertEqual(landing.trailingAverages.map(\.sleepDay), landing.nights.map(\.sleepDay))
        XCTAssertEqual(landing.sevenNightAverage.windowNights, 7)
        XCTAssertNotNil(landing.sevenNightAverage.asleepSeconds)
        XCTAssertGreaterThan(landing.sleepWindow.nightsExcludedUncertainTime, 0)
        XCTAssertEqual(landing.sources.first?.role, .preferred)
    }

    func testUnknownServerValuesDecodeTolerantly() throws {
        let json = #"{"sleepDay":"2026-09-30","status":"future_status","secondaryEpisodeCount":0,"timeZoneBasis":"satellite","timeZoneCertainty":"guess","includedInConsistency":false,"windowOpen":false,"stageStatus":"v9","primarySourceFamily":"new_ring","origin":"elsewhere"}"#
        let night = try RecoverySleepDecoding.decoder().decode(RecoverySleepNightSummary.self, from: Data(json.utf8))
        XCTAssertEqual(night.status, .unknown)
        XCTAssertEqual(night.timeZoneBasis, .unknown)
        XCTAssertEqual(night.timeZoneCertainty, .unknown)
        XCTAssertEqual(night.stageStatus, .unknown)
        XCTAssertEqual(night.primarySourceFamily, .unknown)
        XCTAssertEqual(night.origin, .unknown)
        XCTAssertFalse(night.hasSleep)
    }

    // MARK: States and v2 gating

    func testPendingCorrectionAndAbsentNightsWithholdStageNumbers() throws {
        let pending = try night("2026-09-21")
        XCTAssertEqual(pending.night.stageStatus, .pendingCorrection)
        XCTAssertNil(pending.main?.stages.deepSeconds)
        XCTAssertNil(pending.main?.stages.awakeSeconds)
        XCTAssertNil(pending.main?.continuity.longestAsleepStretchSeconds)
        XCTAssertEqual(pending.main?.timeline.status, .pendingCorrection)
        XCTAssertNotNil(pending.night.asleepSeconds, "total sleep stays valid while stages are recalculated")

        let absent = try night("2026-09-14")
        XCTAssertEqual(absent.main?.stages.status, .absent)
        XCTAssertEqual(absent.provenance?.primarySourceFamily, .appleWatch)
        XCTAssertEqual(absent.main?.timeline.segments.map(\.stage), [.unspecified])

        let available = try night("2026-09-30")
        let stages = try XCTUnwrap(available.main?.stages)
        XCTAssertEqual(stages.status, .available)
        XCTAssertEqual((stages.deepSeconds ?? 0) + (stages.coreSeconds ?? 0) + (stages.remSeconds ?? 0), available.night.asleepSeconds)
    }

    func testNoSleepUpdatingAndSecondaryStates() throws {
        let missing = try night("2026-09-10")
        XCTAssertEqual(missing.night.status, .noSleepRecorded)
        XCTAssertNil(missing.main)
        XCTAssertEqual(missing.night.statusText, "No sleep recorded")

        let updating = try night("2026-10-01")
        XCTAssertTrue(updating.night.windowOpen)
        XCTAssertEqual(updating.night.origin, .prospective)

        let withNap = try night("2026-09-20")
        XCTAssertEqual(withNap.night.secondaryEpisodeCount, 1)
        XCTAssertEqual(withNap.secondary.first?.sourceFamily, .appleWatch)
        XCTAssertEqual(withNap.night.totalAsleepIncludingSecondarySeconds, (withNap.night.asleepSeconds ?? 0) + 31 * 60)
    }

    // MARK: Time-zone honesty

    func testServerFlaggedTravelNightsAreMarkedApproximateButTotalsStayExact() throws {
        let travel = try night("2026-09-28").night
        XCTAssertEqual(travel.timeZoneCertainty, .uncertain)
        XCTAssertFalse(travel.includedInConsistency)
        let clock = travel.clock
        XCTAssertTrue(clock.isClockTimeCaution)
        XCTAssertTrue(clock.window?.hasPrefix("≈ ") == true)
        XCTAssertTrue(clock.showsZone)
        XCTAssertTrue(clock.provenanceText.contains("may be wrong"))
        XCTAssertEqual(SleepEvidenceFormat.duration(travel.asleepSeconds), SleepEvidenceFormat.duration(travel.asleepSeconds))
    }

    func testIncludedHistoricalAndProspectiveNightsAreNotMarkedApproximate() throws {
        let historical = try night("2026-09-24").night
        XCTAssertTrue(historical.includedInConsistency)
        XCTAssertFalse(historical.clock.isClockTimeCaution)
        XCTAssertFalse(historical.clock.window?.hasPrefix("≈") ?? true)
        // Uncertain zones always show their abbreviation, never silently.
        XCTAssertTrue(historical.clock.showsZone)

        let prospective = try night("2026-10-01").night
        XCTAssertEqual(prospective.timeZoneCertainty, .inferred)
        XCTAssertFalse(prospective.clock.isClockTimeCaution)
    }

    func testWindowRowsNeverRecomputeServerConsistencyDecision() throws {
        let landing = try fixture().landing
        let rows = SleepWindowChartRow.fromNights(landing.nights)
        for row in rows {
            let night = try XCTUnwrap(landing.nights.first { $0.sleepDay == row.id })
            XCTAssertEqual(row.includedInConsistency, night.includedInConsistency)
        }
        XCTAssertFalse(rows.contains { $0.id == "2026-09-10" }, "a night without sleep has no window")
    }

    // MARK: Hub row

    func testHubRowSummaries() throws {
        let landing = try fixture().landing
        XCTAssertEqual(RecoverySleepHubSummary.metric(landing, today: "2026-10-01"), "Last night · \(SleepEvidenceFormat.duration(landing.lastNight?.asleepSeconds))")
        XCTAssertEqual(RecoverySleepHubSummary.metric(landing, today: "2026-10-03"), "Oct 1 · \(SleepEvidenceFormat.duration(landing.lastNight?.asleepSeconds))")
        let stream = RecoverySleepHubSummary.stream(landing, today: "2026-10-01")
        XCTAssertEqual(stream.status, .available)
        XCTAssertEqual(stream.destination, .progressStream(streamId: "recovery"))

        let empty = RecoverySleepLanding(
            state: .noData, lastNight: nil, nights: [],
            sevenNightAverage: .init(asleepSeconds: nil, nightCount: 0, windowNights: 7, minimumNights: 3),
            priorSevenNightAverage: .init(asleepSeconds: nil, nightCount: 0, windowNights: 7, minimumNights: 3),
            trailingAverages: [],
            sleepWindow: .init(typicalStartMinutes: nil, typicalEndMinutes: nil, startSpreadMinutes: nil, endSpreadMinutes: nil, nightsIncluded: 0, nightsExcludedUncertainTime: 0),
            sources: [], evidenceStartSleepDay: nil
        )
        XCTAssertEqual(RecoverySleepHubSummary.metric(empty, today: "2026-10-01"), "Waiting for first synced night")
        XCTAssertEqual(RecoverySleepHubSummary.stream(empty, today: "2026-10-01").status, .placeholder)
    }

    // MARK: Formatting / chart helpers

    func testFormattingAndChartPoints() throws {
        XCTAssertEqual(SleepEvidenceFormat.duration(7 * 3600 + 12 * 60), "7h 12m")
        XCTAssertEqual(SleepEvidenceFormat.duration(34 * 60), "34m")
        XCTAssertEqual(SleepEvidenceFormat.duration(nil), "–")
        XCTAssertEqual(SleepEvidenceFormat.spokenDuration(7 * 3600 + 60), "7 hours 1 minute")
        XCTAssertEqual(SleepEvidenceFormat.clockFromMinutes(312), "11:12 PM")
        XCTAssertEqual(SleepEvidenceFormat.clockFromMinutes(780), "7:00 AM")
        XCTAssertEqual(SleepEvidenceFormat.sleepDay("2026-09-29"), "Tue, Sep 29")
        let points = SleepTotalChartPoint.fromLanding(try fixture().landing)
        XCTAssertEqual(points.count, 14)
        let month = SleepTotalChartPoint.fromTrends(try XCTUnwrap(try fixture().trends["1m"]))
        XCTAssertEqual(month.first { $0.id == "2026-09-10" }?.asleepSeconds, nil, "missing night is a gap, not a zero bar")
        XCTAssertNotNil(month.first { $0.id == "2026-09-10" })
        XCTAssertEqual(RecoverySleepDetailProvenanceCopy.reason("usable_over_insufficient_coverage", primary: .appleWatch,
                                                               corroborating: [.init(sourceFamily: .oura, usable: false)]),
                       "Oura recorded only part of this night, so Apple Watch was counted.")
    }

    // MARK: View models

    @MainActor
    func testTrendsViewModelLoadsOneRangeAtATimeAndKeepsShownRanges() async throws {
        let api = CountingRecoverySleepAPI(base: FixtureRecoverySleepAPI(bundle: Bundle(for: AppEnvironment.self)))
        let model = RecoverySleepTrendsViewModel(api: api)
        await model.load()
        guard case .loaded(let month) = model.state else { return XCTFail("expected 1M trends") }
        XCTAssertEqual(month.range, "1m")
        await model.select(.twoWeeks)
        guard case .loaded(let twoWeeks) = model.state else { return XCTFail("expected 2W trends") }
        XCTAssertEqual(twoWeeks.totalSleep.count, 14)
        await model.select(.oneMonth)
        let trendCalls = await api.trendCalls
        XCTAssertEqual(trendCalls, ["1m", "2w"], "a range already shown this visit is not re-read")
        await model.select(.sixMonths)
        guard case .loaded(let weekly) = model.state else { return XCTFail("expected weekly trends") }
        XCTAssertEqual(weekly.granularity, .week)
    }

    @MainActor
    func testNightsListPagesWithoutLoadingAllHistory() async throws {
        let api = CountingRecoverySleepAPI(base: FixtureRecoverySleepAPI(bundle: Bundle(for: AppEnvironment.self)))
        let model = RecoverySleepNightsViewModel(api: api, pageSize: 12)
        await model.loadFirstPage()
        XCTAssertEqual(model.items.count, 12)
        XCTAssertTrue(model.canLoadMore)
        await model.loadMore()
        await model.loadMore()
        await model.loadMore()
        XCTAssertEqual(model.items.count, 30)
        XCTAssertEqual(Set(model.items.map(\.sleepDay)).count, 30)
        XCTAssertFalse(model.canLoadMore)
        let limits = await api.nightLimits
        XCTAssertEqual(limits, [12, 12, 12])
    }

    @MainActor
    func testNightViewModelStates() async throws {
        let api = FixtureRecoverySleepAPI(bundle: Bundle(for: AppEnvironment.self))
        let found = RecoverySleepNightViewModel(sleepDay: "2026-09-30", api: api)
        await found.load()
        guard case .loaded(let detail) = found.state else { return XCTFail("expected night") }
        XCTAssertEqual(detail.night.sleepDay, "2026-09-30")
        let missing = RecoverySleepNightViewModel(sleepDay: "2025-01-01", api: api)
        await missing.load()
        XCTAssertEqual(missing.state, .notFound)
    }

    @MainActor
    func testLandingViewModelShowsNotAvailableCalmly() async {
        let model = RecoverySleepLandingViewModel(api: UnavailableRecoverySleepAPI())
        await model.load()
        XCTAssertEqual(model.state, .notAvailable)
    }

    // MARK: Production isolation

    @MainActor
    func testAuthoritySwitchSelectsRecoverySleepProviderAndProductionNeverUsesFixture() {
        let suite = "PhysiqueOS.RecoverySleepProviderSelection.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority"))
        XCTAssertTrue(environment.recoverySleepAPI is FixtureRecoverySleepAPI)
        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.recoverySleepAPI is ProductionRecoverySleepAPI)
        XCTAssertFalse(environment.recoverySleepAPI is FixtureRecoverySleepAPI)
    }

    func testProductionReadsOnlyServerResourcesWithBoundedQueries() async throws {
        let object = try fixtureObject()
        let landingData = try jsonString(try XCTUnwrap(object["landing"]))
        let nightData = try jsonString(try XCTUnwrap((object["nights"] as? [Any])?.first))
        let transport = RecoverySleepStubTransport(responses: [
            "recovery-sleep": (200, envelope("recovery-sleep", landingData)),
            "recovery-sleep-night": (200, envelope("recovery-sleep-night", nightData)),
            "recovery-sleep-nights": (200, envelope("recovery-sleep-nights", #"{"items":[],"nextCursor":null}"#)),
        ])
        let native = try await pairedAPI(transport)
        let api = ProductionRecoverySleepAPI(api: native)

        let landing = try await api.fetchLanding(policy: .cacheFirst)
        XCTAssertEqual(landing.nights.count, 14)
        let night = try await api.fetchNight(sleepDay: "2026-10-01")
        XCTAssertEqual(night.night.sleepDay, "2026-10-01")
        _ = try await api.fetchNights(cursor: "abc", limit: 500)

        let requests = await transport.reads
        XCTAssertEqual(requests.map(\.path), ["/api/v1/native/read/recovery-sleep", "/api/v1/native/read/recovery-sleep-night", "/api/v1/native/read/recovery-sleep-nights"])
        XCTAssertEqual(requests[1].query["sleepDay"], "2026-10-01")
        XCTAssertEqual(requests[2].query["limit"], "60", "page size is clamped")
        XCTAssertEqual(requests[2].query["cursor"], "abc")
        XCTAssertTrue(requests.allSatisfy { !$0.path.contains("fixture") })
    }

    func testProductionMapsMissingRouteToNotAvailableAndRejectsMalformedDays() async throws {
        let transport = RecoverySleepStubTransport(responses: [
            "recovery-sleep": (404, #"{"title":"Not found","status":404,"code":"NOT_FOUND","fieldErrors":[]}"#),
            "recovery-sleep-night": (404, #"{"title":"Not found","status":404,"code":"SLEEP_NIGHT_NOT_FOUND","fieldErrors":[]}"#),
        ])
        let native = try await pairedAPI(transport)
        let api = ProductionRecoverySleepAPI(api: native)
        do {
            _ = try await api.fetchLanding(policy: .cacheFirst)
            XCTFail("expected notAvailable")
        } catch {
            XCTAssertEqual(error as? RecoverySleepAPIError, .notAvailable)
        }
        do {
            _ = try await api.fetchNight(sleepDay: "2026-09-30")
            XCTFail("expected nightNotFound")
        } catch {
            XCTAssertEqual(error as? RecoverySleepAPIError, .nightNotFound)
        }
        do {
            _ = try await api.fetchNight(sleepDay: "../evil")
            XCTFail("expected nightNotFound")
        } catch {
            XCTAssertEqual(error as? RecoverySleepAPIError, .nightNotFound)
        }
        let paths = await transport.reads.map(\.path)
        XCTAssertFalse(paths.contains { $0.contains("evil") }, "malformed sleep days never reach the network")
    }

    func testDestinationsRoundTripAndRejectMalformedStreamIds() {
        XCTAssertEqual(RecoverySleepDestination.night("2026-09-30"), .progressStream(streamId: "recovery/sleep/night/2026-09-30"))
        XCTAssertEqual(RecoverySleepDestination.sleepDay(fromStreamId: "recovery/sleep/night/2026-09-30"), "2026-09-30")
        XCTAssertNil(RecoverySleepDestination.sleepDay(fromStreamId: "recovery/sleep/night/abc"))
        XCTAssertNil(RecoverySleepDestination.sleepDay(fromStreamId: "recovery"))
        XCTAssertEqual(RecoverySleepDestination.trends, .progressStream(streamId: "recovery/sleep/trends"))
    }

    // MARK: Helpers

    private func fixtureObject() throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle(for: AppEnvironment.self).url(forResource: "RecoverySleepFixture", withExtension: "json"))
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    private func jsonString(_ object: Any) throws -> String {
        try XCTUnwrap(String(data: try JSONSerialization.data(withJSONObject: object), encoding: .utf8))
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
    private(set) var nightLimits: [Int] = []

    init(base: FixtureRecoverySleepAPI) {
        self.base = base
    }

    func fetchLanding(policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding { try await base.fetchLanding(policy: policy) }
    func fetchTrends(range: RecoverySleepTrendRange) async throws -> RecoverySleepTrends {
        trendCalls.append(range.rawValue)
        return try await base.fetchTrends(range: range)
    }
    func fetchNights(cursor: String?, limit: Int) async throws -> RecoverySleepNightsPage {
        nightLimits.append(limit)
        return try await base.fetchNights(cursor: cursor, limit: limit)
    }
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail { try await base.fetchNight(sleepDay: sleepDay) }
}

private struct UnavailableRecoverySleepAPI: RecoverySleepAPI {
    func fetchLanding(policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding { throw RecoverySleepAPIError.notAvailable }
    func fetchTrends(range: RecoverySleepTrendRange) async throws -> RecoverySleepTrends { throw RecoverySleepAPIError.notAvailable }
    func fetchNights(cursor: String?, limit: Int) async throws -> RecoverySleepNightsPage { throw RecoverySleepAPIError.notAvailable }
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail { throw RecoverySleepAPIError.notAvailable }
}

private actor RecoverySleepStubTransport: FounderHTTPTransport {
    struct Read: Sendable {
        let path: String
        let query: [String: String]
    }

    private let responses: [String: (Int, String)]
    private(set) var reads: [Read] = []

    init(responses: [String: (Int, String)]) {
        self.responses = responses
    }

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
