import Foundation

/// Read seam for Recovery / Sleep Evidence. Every screen reads exactly one
/// bounded resource: the landing (`recovery-sleep-landing`), a dated trend
/// range or page (`recovery-sleep-trends`), or one night
/// (`recovery-sleep-night`). Native never issues an unbounded history read.
protocol RecoverySleepAPI: Sendable {
    func fetchLanding(policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding
    func fetchTrends(range: RecoverySleepTrendRange) async throws -> RecoverySleepTrends
    func fetchNights(cursor: String?, limit: Int) async throws -> RecoverySleepNightsPage
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail
}

enum RecoverySleepReadPolicy: Sendable {
    case cacheFirst, reload
}

enum RecoverySleepAPIError: Error, Equatable {
    /// The Server does not serve Sleep Evidence. Shown as a calm "not
    /// available" state, never as an error.
    case notAvailable
    /// No night exists for the requested sleep day.
    case nightNotFound
}

/// Translates UI range selectors into explicit, bounded `startDate`/`endDate`
/// queries for `recovery-sleep-trends`.
enum RecoverySleepQuery {
    /// First sleep day of the reviewed historical Evidence import (the
    /// PhysiqueOS consistent-evidence boundary; Build 74
    /// `HealthKitSleepHistoricalEvidenceCapability` pins the same day). "All"
    /// never reaches earlier than this.
    static let evidenceStartSleepDay = "2026-07-06"
    /// Server: night granularity below 183 days, weekly at or above.
    static let weeklyThresholdDays = 183
    /// Server page maximum.
    static let maximumPageLimit = 100
    static let nightsPageLimit = 30

    struct Range: Equatable, Sendable {
        let startDate: String
        let endDate: String
        let limit: Int
    }

    static func isSleepDayKey(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
            && SleepEvidenceDay.date(value) != nil
    }

    /// Bounded dates for a selector, ending today (local). Night-granularity
    /// ranges request a full page (<= 100 nights) so charts are complete; an
    /// "All" span that would exceed one page is widened to the weekly
    /// threshold so the Server aggregates every night instead of truncating.
    static func range(_ selector: RecoverySleepTrendRange, today: String) -> Range {
        let days: Int
        switch selector {
        case .twoWeeks: days = 14
        case .oneMonth: days = 30
        case .threeMonths: days = 90
        case .sixMonths: days = weeklyThresholdDays
        case .all:
            // Always exactly the Evidence start through today. Between 101
            // and 182 days the Server returns the newest 100 nights (the
            // trends model flags that as truncated); from 183 days it is
            // weekly and complete.
            let start = min(evidenceStartSleepDay, today)
            return Range(startDate: start, endDate: today, limit: maximumPageLimit)
        }
        let start = SleepEvidenceDay.shift(today, days: -(days - 1)) ?? today
        return Range(startDate: start, endDate: today, limit: maximumPageLimit)
    }

    /// Bounds for paged night history: Evidence start through today.
    static func historyRange(today: String) -> (startDate: String, endDate: String) {
        let start = min(evidenceStartSleepDay, today)
        return (start, today)
    }
}

// MARK: - Founder Production (Server read models only; never fixtures)

struct ProductionRecoverySleepAPI: RecoverySleepAPI {
    let api: ProductionNativeAPI
    var today: @Sendable () -> String = { SleepEvidenceDay.today() }

    func fetchLanding(policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding {
        let live = try await read(RecoverySleepResource.landing, query: ["throughDate": today()],
                                  policy: policy == .reload ? .reload : .cacheFirst, as: RecoverySleepLiveLanding.self)
        return RecoverySleepAdapter.landing(live)
    }

    func fetchTrends(range selector: RecoverySleepTrendRange) async throws -> RecoverySleepTrends {
        let range = RecoverySleepQuery.range(selector, today: today())
        let live = try await read(RecoverySleepResource.trends,
                                  query: ["startDate": range.startDate, "endDate": range.endDate, "limit": String(range.limit)],
                                  policy: .cacheFirst, as: RecoverySleepLiveTrends.self)
        return RecoverySleepAdapter.trends(live)
    }

    func fetchNights(cursor: String?, limit: Int) async throws -> RecoverySleepNightsPage {
        let bounds = RecoverySleepQuery.historyRange(today: today())
        var query = ["startDate": bounds.startDate, "endDate": bounds.endDate,
                     "limit": String(min(max(1, limit), RecoverySleepQuery.maximumPageLimit))]
        if let cursor {
            guard RecoverySleepQuery.isSleepDayKey(cursor) else { throw RecoverySleepAPIError.nightNotFound }
            query["cursor"] = cursor
        }
        let live = try await read(RecoverySleepResource.trends, query: query, policy: .cacheFirst, as: RecoverySleepLiveTrends.self)
        return RecoverySleepAdapter.page(live)
    }

    /// A night is "day truth" (late samples, recomputation): always live.
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail {
        guard RecoverySleepQuery.isSleepDayKey(sleepDay) else { throw RecoverySleepAPIError.nightNotFound }
        // The live route answers a sleep day without a record with 404
        // RESOURCE_NOT_FOUND (it never serves `data: null`); the landing has
        // already established that the resource family exists.
        do {
            let live = try await api.readResource(RecoverySleepResource.night, query: ["sleepDay": sleepDay], policy: .reload,
                                                  as: RecoverySleepLiveNightDetail?.self).data
            guard let live else { throw RecoverySleepAPIError.nightNotFound }
            return RecoverySleepAdapter.detail(live)
        } catch ProductionNativeError.notFound {
            throw RecoverySleepAPIError.nightNotFound
        }
    }

    private func read<Payload: Decodable & Sendable>(
        _ resource: String, query: [String: String], policy: ProductionNativeAPI.ReadPolicy, as type: Payload.Type
    ) async throws -> Payload {
        do {
            return try await api.readResource(resource, query: query, policy: policy, as: type).data
        } catch ProductionNativeError.notFound {
            // An authority without the Sleep read model has no route.
            throw RecoverySleepAPIError.notAvailable
        }
    }
}

// MARK: - Sandbox (bundled synthetic fixture; never reachable from Production)

/// Serves `RecoverySleepFixture.json` — synthetic projected nights in the
/// live Server shape, generated by `ios/Scripts/generate_recovery_sleep_fixture.py`
/// — through the same rules the Server read service applies (newest first,
/// bounded date filtering, cursor paging, weekly aggregation at >= 183 days),
/// decoded with the production decoder configuration. Requested dates are
/// shifted so "today" maps onto the fixture's newest night.
struct FixtureRecoverySleepAPI: RecoverySleepAPI {
    enum FixtureError: Error { case resourceNotFound }

    struct FixtureFile: Decodable, Sendable {
        struct Examples: Decodable, Sendable {
            let landing: RecoverySleepLiveLanding
            let trendsNight: RecoverySleepLiveTrends
            let trendsPage2: RecoverySleepLiveTrends
            let trendsWeek: RecoverySleepLiveTrends
            let night: RecoverySleepLiveNight
        }

        let anchorSleepDay: String
        let nights: [RecoverySleepLiveNight]
        let examples: Examples
    }

    private let bundle: Bundle
    private let today: @Sendable () -> String

    init(bundle: Bundle = .main, today: @escaping @Sendable () -> String = { SleepEvidenceDay.today() }) {
        self.bundle = bundle
        self.today = today
    }

    func loadFixture() throws -> FixtureFile {
        guard let url = bundle.url(forResource: "RecoverySleepFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        return try RecoverySleepDecoding.decoder().decode(FixtureFile.self, from: Data(contentsOf: url))
    }

    /// Fixture-relative day for a requested (device-relative) day.
    private func shifted(_ day: String, fixture: FixtureFile) -> String {
        guard let offset = SleepEvidenceDay.span(today(), fixture.anchorSleepDay) else { return day }
        return SleepEvidenceDay.shift(day, days: offset - 1) ?? day
    }

    private func newest(_ nights: [RecoverySleepLiveNight], from start: String, through end: String) -> [RecoverySleepLiveNight] {
        nights.filter { $0.sleepDay >= start && $0.sleepDay <= end }.sorted { $0.sleepDay > $1.sleepDay }
    }

    func fetchLanding(policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding {
        let fixture = try loadFixture()
        let end = fixture.anchorSleepDay
        let rows = newest(fixture.nights, from: SleepEvidenceDay.shift(end, days: -29) ?? end, through: end)
        let shown = Array(rows.prefix(14))
        let seven = rows.filter { $0.status == .asleepRecorded }.prefix(7).compactMap { $0.mainSleep?.asleepSeconds }
        let eligible = shown.filter { $0.sleepWindow != nil && $0.timeZoneUncertain != true }
        let starts = eligible.compactMap { minuteOfDay($0.sleepWindow?.start, $0.sleepWindow?.timeZone) }
        let ends = eligible.compactMap { minuteOfDay($0.sleepWindow?.end, $0.sleepWindow?.timeZone) }
        let labels = Set(rows.flatMap { [$0.source].compactMap { $0 } + ($0.corroboratingSources ?? []) }).sorted()
        let live = RecoverySleepLiveLanding(
            schemaVersion: "recovery-sleep-evidence-v1",
            lastNight: shown.first { $0.status == .asleepRecorded } ?? shown.first,
            nights: shown,
            sevenNightAverage: .init(seconds: seven.isEmpty ? nil : Int((Double(seven.reduce(0, +)) / Double(seven.count)).rounded()), nightCount: seven.count),
            window: .init(medianStartMinute: Self.median(starts), medianEndMinute: Self.median(ends),
                          startSpreadMinutes: Self.mad(starts), endSpreadMinutes: Self.mad(ends),
                          nightsUsed: eligible.count, inferredNightsExcluded: shown.filter { $0.timeZoneUncertain == true }.count),
            sources: labels.map { .init(label: $0) },
            strategicUse: "quarantined"
        )
        return RecoverySleepAdapter.landing(live, now: anchoredNow(fixture))
    }

    func fetchTrends(range selector: RecoverySleepTrendRange) async throws -> RecoverySleepTrends {
        let fixture = try loadFixture()
        let range = RecoverySleepQuery.range(selector, today: today())
        return RecoverySleepAdapter.trends(try trends(fixture, start: shifted(range.startDate, fixture: fixture),
                                                      end: shifted(range.endDate, fixture: fixture), limit: range.limit, cursor: nil),
                                           now: anchoredNow(fixture))
    }

    func fetchNights(cursor: String?, limit: Int) async throws -> RecoverySleepNightsPage {
        let fixture = try loadFixture()
        let bounds = RecoverySleepQuery.historyRange(today: fixture.anchorSleepDay)
        return RecoverySleepAdapter.page(try trends(fixture, start: bounds.startDate, end: bounds.endDate,
                                                    limit: min(max(1, limit), RecoverySleepQuery.maximumPageLimit), cursor: cursor),
                                         now: anchoredNow(fixture))
    }

    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail {
        let fixture = try loadFixture()
        guard let night = fixture.nights.first(where: { $0.sleepDay == sleepDay }) else { throw RecoverySleepAPIError.nightNotFound }
        return RecoverySleepAdapter.detail(night, now: anchoredNow(fixture))
    }

    /// The fixture's "now": mid-morning on its newest sleep day, so the
    /// newest night is still inside its update window in Sandbox.
    private func anchoredNow(_ fixture: FixtureFile) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let parts = fixture.anchorSleepDay.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 9, minute: 41)) ?? .now
    }

    /// Mirrors the Server `trends` rules over the fixture nights.
    private func trends(_ fixture: FixtureFile, start: String, end: String, limit: Int, cursor: String?) throws -> RecoverySleepLiveTrends {
        let span = SleepEvidenceDay.span(start, end) ?? 1
        var rows = newest(fixture.nights, from: start, through: end)
        if let cursor { rows = rows.filter { $0.sleepDay < cursor } }
        let projected = Array(rows.prefix(limit))
        let weekly = span >= RecoverySleepQuery.weeklyThresholdDays
        var weekSeries: [RecoverySleepLiveTrends.WeekPoint] = []
        if weekly {
            let groups = Dictionary(grouping: rows) { Self.monday($0.sleepDay) }
            weekSeries = groups.keys.sorted(by: >).map { week in
                let values = (groups[week] ?? []).compactMap { $0.mainSleep?.asleepSeconds }
                return .init(weekStart: week,
                             averageAsleepSeconds: values.isEmpty ? nil : Int((Double(values.reduce(0, +)) / Double(values.count)).rounded()),
                             nightCount: values.count)
            }
        }
        return RecoverySleepLiveTrends(
            schemaVersion: "recovery-sleep-trends-v1", range: .init(startDate: start, endDate: end),
            granularity: weekly ? .week : .night, nightSeries: weekly ? [] : projected, weekSeries: weekSeries,
            nights: projected,
            page: .init(limit: limit, count: projected.count, nextCursor: rows.count > limit ? projected.last?.sleepDay : nil),
            strategicUse: "quarantined"
        )
    }

    private func minuteOfDay(_ instant: String?, _ zone: String?) -> Int? {
        guard let date = SleepEvidenceInstant.parse(instant) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone.flatMap(TimeZone.init(identifier:)) ?? .current
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
    }

    static func median(_ values: [Int]) -> Int? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let count = sorted.count
        return count % 2 == 1 ? sorted[(count - 1) / 2] : Int((Double(sorted[count / 2 - 1] + sorted[count / 2]) / 2).rounded())
    }

    static func mad(_ values: [Int]) -> Int? {
        guard let center = median(values) else { return nil }
        return median(values.map { abs($0 - center) })
    }

    static func monday(_ key: String) -> String {
        guard let date = SleepEvidenceDay.date(key) else { return key }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let weekday = calendar.component(.weekday, from: date) // 1 = Sunday
        return SleepEvidenceDay.shift(key, days: -((weekday + 5) % 7)) ?? key
    }
}
