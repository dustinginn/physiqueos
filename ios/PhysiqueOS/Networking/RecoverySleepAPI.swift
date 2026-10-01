import Foundation

/// Read seam for Recovery / Sleep Evidence. Every screen reads exactly one
/// bounded resource: the landing (`recovery-sleep-landing`), a dated trend
/// range or page (`recovery-sleep-trends`), or one night
/// (`recovery-sleep-night`). Every read is made inside the selected Goal
/// scope's range (a Goal's canonical dates intersected with the available
/// Sleep Evidence); Native never issues an unbounded history read and never
/// requests dates outside the range.
protocol RecoverySleepAPI: Sendable {
    /// The Evidence "today" the scope ranges are resolved against.
    func today() -> String
    /// The canonical Goal date windows for Build Lean Mass and Visible Abs.
    func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow]
    func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding
    func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends
    func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage
    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail
}

extension RecoverySleepAPI {
    /// The unscoped ("All Sleep") landing, e.g. for the Evidence Hub row.
    func fetchLanding(policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding {
        try await fetchLanding(range: RecoverySleepScopeResolver.resolve(scope: .all, goalWindow: nil, today: today()), policy: policy)
    }
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
    /// `HealthKitSleepHistoricalEvidenceCapability` pins the same day). No
    /// scope ever reaches earlier than this.
    static let evidenceStartSleepDay = "2026-07-06"
    /// Server: night granularity below 183 days, weekly at or above.
    static let weeklyThresholdDays = 183
    /// Server page maximum.
    static let maximumPageLimit = 100
    static let nightsPageLimit = 30
    /// The landing snapshot looks back this many nights.
    static let landingLookbackDays = 30
    static let landingNights = 14

    struct Range: Equatable, Sendable {
        let startDate: String
        let endDate: String
        let limit: Int
    }

    static func isSleepDayKey(_ value: String) -> Bool {
        value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
            && SleepEvidenceDay.date(value) != nil
    }

    /// Bounded dates for a selector inside a scope. The selector counts back
    /// from the scope's last day (today for current scopes, the Goal's final
    /// day for a completed Goal) and never reaches before the scope's first
    /// day. Night-granularity ranges request a full page (<= 100 nights); the
    /// span length alone decides night vs weekly on the Server. `nil` when
    /// the scope has no Sleep Evidence (no read is made).
    static func range(_ selector: RecoverySleepTrendRange, scope: RecoverySleepScopeRange) -> Range? {
        guard !scope.isEmpty else { return nil }
        let days: Int
        switch selector {
        case .twoWeeks: days = 14
        case .oneMonth: days = 30
        case .threeMonths: days = 90
        case .sixMonths: days = weeklyThresholdDays
        case .all:
            return Range(startDate: scope.startDate, endDate: scope.endDate, limit: maximumPageLimit)
        }
        let counted = SleepEvidenceDay.shift(scope.endDate, days: -(days - 1)) ?? scope.endDate
        return Range(startDate: max(counted, scope.startDate), endDate: scope.endDate, limit: maximumPageLimit)
    }

    /// The snapshot window behind a Goal-scoped landing: the last
    /// `landingLookbackDays` of the scope, never before its first day.
    static func landingRange(scope: RecoverySleepScopeRange) -> Range? {
        guard !scope.isEmpty else { return nil }
        let counted = SleepEvidenceDay.shift(scope.endDate, days: -(landingLookbackDays - 1)) ?? scope.endDate
        return Range(startDate: max(counted, scope.startDate), endDate: scope.endDate, limit: landingLookbackDays)
    }
}

// MARK: - Founder Production (Server read models only; never fixtures)

struct ProductionRecoverySleepAPI: RecoverySleepAPI {
    let api: ProductionNativeAPI
    var clock: @Sendable () -> String = { SleepEvidenceDay.today() }

    func today() -> String { clock() }

    /// The canonical Goal windows come from the Server's own Goal/Phase
    /// context (`context.startDate` / `context.endDate`), the same source the
    /// other Evidence verticals use; one tiny read per Goal.
    func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow] {
        async let leanMass = goalWindow(.buildLeanMass)
        async let visibleAbs = goalWindow(.visibleAbs)
        return try await [.buildLeanMass: leanMass, .visibleAbs: visibleAbs]
    }

    private func goalWindow(_ scope: RecoverySleepScope) async throws -> RecoverySleepGoalWindow {
        do {
            let payload = try await api.readResource("photos", query: ["context": scope.rawValue, "limit": "1"], policy: .cacheFirst, as: GoalContextPayload.self).data
            return RecoverySleepGoalWindow(startDate: payload.context.startDate, endDate: payload.context.endDate)
        } catch ProductionNativeError.notFound {
            throw RecoverySleepAPIError.notAvailable
        }
    }

    private struct GoalContextPayload: Decodable, Sendable { let context: NativeGoalPhaseContext }

    func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding {
        let readPolicy: ProductionNativeAPI.ReadPolicy = policy == .reload ? .reload : .cacheFirst
        if range.isEmpty { return RecoverySleepAdapter.emptyLanding() }
        if range.scope == .all {
            let live = try await read(RecoverySleepResource.landing, query: ["throughDate": range.endDate], policy: readPolicy, as: RecoverySleepLiveLanding.self)
            return RecoverySleepAdapter.landing(live)
        }
        // A Goal's snapshot is derived from ONE bounded trends read so no night
        // outside the Goal's dates is ever requested or shown.
        guard let window = RecoverySleepQuery.landingRange(scope: range) else { return RecoverySleepAdapter.emptyLanding() }
        let live = try await read(
            RecoverySleepResource.trends,
            query: ["startDate": window.startDate, "endDate": window.endDate, "limit": String(window.limit)],
            policy: readPolicy, as: RecoverySleepLiveTrends.self
        )
        return RecoverySleepAdapter.scopedLanding(live)
    }

    func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends {
        guard let bounds = RecoverySleepQuery.range(selector, scope: range) else {
            return RecoverySleepAdapter.emptyTrends(startDate: range.startDate, endDate: range.endDate)
        }
        let live = try await read(
            RecoverySleepResource.trends,
            query: ["startDate": bounds.startDate, "endDate": bounds.endDate, "limit": String(bounds.limit)],
            policy: .cacheFirst, as: RecoverySleepLiveTrends.self
        )
        return RecoverySleepAdapter.trends(live)
    }

    func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage {
        guard !range.isEmpty else { return RecoverySleepNightsPage(items: [], nextCursor: nil) }
        var query = ["startDate": range.startDate, "endDate": range.endDate,
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
/// decoded with the production decoder configuration. The Sandbox is frozen
/// at the fixture's newest sleep day so it behaves identically on any date.
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

    /// The fixture's newest sleep day (also stored in the file).
    static let anchorSleepDay = "2026-10-01"

    private let bundle: Bundle
    private let goalWindows: [RecoverySleepScope: RecoverySleepGoalWindow]

    init(
        bundle: Bundle = .main,
        goalWindows: [RecoverySleepScope: RecoverySleepGoalWindow] = FixtureRecoverySleepAPI.canonicalGoalWindows()
    ) {
        self.bundle = bundle
        self.goalWindows = goalWindows
    }

    /// The Sandbox's canonical Goals (`EvidenceChronologyFixture.json`), the
    /// same chronology every other Sandbox Evidence vertical filters by.
    static func canonicalGoalWindows() -> [RecoverySleepScope: RecoverySleepGoalWindow] {
        var windows: [RecoverySleepScope: RecoverySleepGoalWindow] = [:]
        for goal in EvidenceChronology.canonicalGoals {
            let window = RecoverySleepGoalWindow(startDate: goal.startDate, endDate: goal.targetDate)
            if goal.id == EvidenceCanonicalGoalID.buildLeanMass { windows[.buildLeanMass] = window }
            if goal.id == EvidenceCanonicalGoalID.visibleAbs { windows[.visibleAbs] = window }
        }
        return windows
    }

    func today() -> String { Self.anchorSleepDay }

    func loadFixture() throws -> FixtureFile {
        guard let url = bundle.url(forResource: "RecoverySleepFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        return try RecoverySleepDecoding.decoder().decode(FixtureFile.self, from: Data(contentsOf: url))
    }

    func fetchGoalWindows() async throws -> [RecoverySleepScope: RecoverySleepGoalWindow] { goalWindows }

    func fetchLanding(range: RecoverySleepScopeRange, policy: RecoverySleepReadPolicy) async throws -> RecoverySleepLanding {
        if range.isEmpty { return RecoverySleepAdapter.emptyLanding() }
        let fixture = try loadFixture()
        if range.scope == .all {
            let end = range.endDate
            let rows = newest(fixture.nights, from: SleepEvidenceDay.shift(end, days: -(RecoverySleepQuery.landingLookbackDays - 1)) ?? end, through: end)
            let shown = Array(rows.prefix(RecoverySleepQuery.landingNights))
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
            return RecoverySleepAdapter.landing(live, now: anchoredNow())
        }
        guard let window = RecoverySleepQuery.landingRange(scope: range) else { return RecoverySleepAdapter.emptyLanding() }
        let live = trends(fixture, start: window.startDate, end: window.endDate, limit: window.limit, cursor: nil)
        return RecoverySleepAdapter.scopedLanding(live, now: anchoredNow())
    }

    func fetchTrends(selector: RecoverySleepTrendRange, range: RecoverySleepScopeRange) async throws -> RecoverySleepTrends {
        guard let bounds = RecoverySleepQuery.range(selector, scope: range) else {
            return RecoverySleepAdapter.emptyTrends(startDate: range.startDate, endDate: range.endDate)
        }
        let fixture = try loadFixture()
        return RecoverySleepAdapter.trends(trends(fixture, start: bounds.startDate, end: bounds.endDate, limit: bounds.limit, cursor: nil), now: anchoredNow())
    }

    func fetchNights(cursor: String?, limit: Int, range: RecoverySleepScopeRange) async throws -> RecoverySleepNightsPage {
        guard !range.isEmpty else { return RecoverySleepNightsPage(items: [], nextCursor: nil) }
        let fixture = try loadFixture()
        let live = trends(fixture, start: range.startDate, end: range.endDate, limit: min(max(1, limit), RecoverySleepQuery.maximumPageLimit), cursor: cursor)
        return RecoverySleepAdapter.page(live, now: anchoredNow())
    }

    func fetchNight(sleepDay: String) async throws -> RecoverySleepNightDetail {
        let fixture = try loadFixture()
        guard let night = fixture.nights.first(where: { $0.sleepDay == sleepDay }) else { throw RecoverySleepAPIError.nightNotFound }
        return RecoverySleepAdapter.detail(night, now: anchoredNow())
    }

    private func newest(_ nights: [RecoverySleepLiveNight], from start: String, through end: String) -> [RecoverySleepLiveNight] {
        nights.filter { $0.sleepDay >= start && $0.sleepDay <= end }.sorted { $0.sleepDay > $1.sleepDay }
    }

    /// The fixture's "now": mid-morning on its newest sleep day, so the
    /// newest night is still inside its update window in Sandbox.
    private func anchoredNow() -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let parts = Self.anchorSleepDay.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 9, minute: 41)) ?? .now
    }

    /// Mirrors the Server `trends` rules over the fixture nights.
    private func trends(_ fixture: FixtureFile, start: String, end: String, limit: Int, cursor: String?) -> RecoverySleepLiveTrends {
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
