import Foundation

// Recovery / Sleep Evidence read models.
//
// `RecoverySleepLive*` decode the LIVE Server contract exactly (Server
// b81c784e `HealthKitSleepEvidenceReadService`: resources
// `recovery-sleep-landing`, `recovery-sleep-trends`, `recovery-sleep-night`).
// `RecoverySleepAdapter` maps them into the presentation types the approved
// screens render. Server facts (totals, stage/continuity values, stage
// availability, time-zone uncertainty, window medians, page cursors) are
// passed through unchanged. The few display-only derivations are marked
// `DISPLAY-ONLY` below; none feeds anything strategic. There is no score,
// target or good/bad field anywhere.

enum RecoverySleepResource {
    static let landing = "recovery-sleep-landing"
    static let trends = "recovery-sleep-trends"
    static let night = "recovery-sleep-night"
}

/// Shared by the Sandbox fixture and tests so both decode exactly like
/// `ProductionNativeAPI.readResource` (camelCase keys, snake-case tolerant).
enum RecoverySleepDecoding {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}

/// Decodes an unrecognised raw value as `.unknown` instead of failing the
/// whole read, so a newer Server enum value can never blank the screen.
protocol RecoverySleepTolerantEnum: RawRepresentable, Decodable, Equatable, Sendable where RawValue == String {
    static var unknown: Self { get }
}

extension RecoverySleepTolerantEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .unknown
    }
}

// MARK: - Live Server contract (decode only)

struct RecoverySleepLiveNight: Decodable, Equatable, Sendable {
    enum Status: String, RecoverySleepTolerantEnum {
        case asleepRecorded = "asleep_recorded"
        case inBedOnly = "in_bed_only"
        case noSleepRecorded = "no_sleep_recorded"
        case unknown
    }

    enum StageStatus: String, RecoverySleepTolerantEnum {
        case available, unavailable
        case unknown
    }

    struct MainSleep: Decodable, Equatable, Sendable {
        let asleepSeconds: Int?
        let awakeSeconds: Int?
        let coreSeconds: Int?
        let deepSeconds: Int?
        let remSeconds: Int?
        let unspecifiedSeconds: Int?
        let inBedSeconds: Int?
    }

    struct Window: Decodable, Equatable, Sendable {
        let start: String
        let end: String
        let timeZone: String?
    }

    struct Segment: Decodable, Equatable, Sendable, Hashable {
        let stage: RecoverySleepStage
        let start: String
        let end: String
    }

    struct Stages: Decodable, Equatable, Sendable {
        let deepSeconds: Int?
        let coreSeconds: Int?
        let remSeconds: Int?
        let awakeSeconds: Int?
        let unspecifiedSeconds: Int?
    }

    struct Continuity: Decodable, Equatable, Sendable {
        let awakeInWindowSeconds: Int?
        let longestAsleepStretchSeconds: Int?
    }

    struct Secondary: Decodable, Equatable, Sendable {
        let start: String
        let end: String
        let asleepSeconds: Int?
        let timeZone: String?
        let source: String?
    }

    struct Completeness: Decodable, Equatable, Sendable {
        let asleepData: String?
        let stageDetail: String?
        let sourceBasis: String?
    }

    struct Provenance: Decodable, Equatable, Sendable {
        let origin: String?
        let ingestionPurpose: String?
        let computedAt: String?
    }

    let sleepDay: String
    let status: Status
    let mainSleep: MainSleep?
    let sleepWindow: Window?
    let timeline: [Segment]?
    let stageStatus: StageStatus
    let stages: Stages?
    let continuity: Continuity?
    let timeInBedSeconds: Int?
    let secondarySleep: [Secondary]?
    let totalAsleepIncludingSecondarySeconds: Int?
    let source: String?
    let corroboratingSources: [String]?
    let completeness: Completeness?
    let timeZoneBasis: String?
    let timeZoneUncertain: Bool?
    let algorithmVersion: String?
    let provenance: Provenance?
    let strategicEligible: Bool?
}

struct RecoverySleepLiveLanding: Decodable, Equatable, Sendable {
    struct Average: Decodable, Equatable, Sendable {
        let seconds: Int?
        let nightCount: Int
    }

    /// `medianStartMinute`/`medianEndMinute` are local minutes of the day
    /// (0-1439) over nights with a window and no time-zone uncertainty.
    struct Window: Decodable, Equatable, Sendable {
        let medianStartMinute: Int?
        let medianEndMinute: Int?
        let startSpreadMinutes: Int?
        let endSpreadMinutes: Int?
        let nightsUsed: Int
        let inferredNightsExcluded: Int
    }

    struct Source: Decodable, Equatable, Sendable {
        let label: String
    }

    let schemaVersion: String?
    let lastNight: RecoverySleepLiveNight?
    let nights: [RecoverySleepLiveNight]
    let sevenNightAverage: Average
    let window: Window
    let sources: [Source]
    let strategicUse: String?
}

struct RecoverySleepLiveTrends: Decodable, Equatable, Sendable {
    enum Granularity: String, RecoverySleepTolerantEnum {
        case night, week
        case unknown
    }

    struct Range: Decodable, Equatable, Sendable {
        let startDate: String
        let endDate: String
    }

    struct WeekPoint: Decodable, Equatable, Sendable {
        let weekStart: String
        let averageAsleepSeconds: Int?
        let nightCount: Int
    }

    struct Page: Decodable, Equatable, Sendable {
        let limit: Int
        let count: Int
        let nextCursor: String?
    }

    let schemaVersion: String?
    let range: Range
    let granularity: Granularity
    /// Nights (night granularity, page-limited) or week points (week).
    let nightSeries: [RecoverySleepLiveNight]
    let weekSeries: [WeekPoint]
    let nights: [RecoverySleepLiveNight]
    let page: Page
    let strategicUse: String?

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, range, granularity, series, nights, page, strategicUse
    }

    init(schemaVersion: String?, range: Range, granularity: Granularity, nightSeries: [RecoverySleepLiveNight],
         weekSeries: [WeekPoint], nights: [RecoverySleepLiveNight], page: Page, strategicUse: String?) {
        self.schemaVersion = schemaVersion
        self.range = range
        self.granularity = granularity
        self.nightSeries = nightSeries
        self.weekSeries = weekSeries
        self.nights = nights
        self.page = page
        self.strategicUse = strategicUse
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decodeIfPresent(String.self, forKey: .schemaVersion)
        range = try container.decode(Range.self, forKey: .range)
        granularity = try container.decode(Granularity.self, forKey: .granularity)
        nights = try container.decodeIfPresent([RecoverySleepLiveNight].self, forKey: .nights) ?? []
        page = try container.decode(Page.self, forKey: .page)
        strategicUse = try container.decodeIfPresent(String.self, forKey: .strategicUse)
        if granularity == .week {
            weekSeries = try container.decodeIfPresent([WeekPoint].self, forKey: .series) ?? []
            nightSeries = []
        } else {
            nightSeries = try container.decodeIfPresent([RecoverySleepLiveNight].self, forKey: .series) ?? []
            weekSeries = []
        }
    }
}

/// `recovery-sleep-night`: one flat projected night plus schema/strategic use.
/// The Server returns `data: null` for a sleep day with no record.
typealias RecoverySleepLiveNightDetail = RecoverySleepLiveNight

// MARK: - Presentation enums

enum RecoverySleepNightStatus: Equatable, Sendable {
    case asleepRecorded, inBedOnly, noSleepRecorded, unknown
}

/// Whether stage / Awake / continuity values may be shown for a night.
enum RecoverySleepDetailStatus: Equatable, Sendable {
    /// Server `stageStatus == available` (sleep-canon-v2 or v3, staged).
    case available
    /// Computed by an older algorithm whose stage/Awake values are not shown.
    case pendingCorrection
    /// Server `stageStatus == unavailable` under v2/v3: no stage detail.
    case absent
    case unknown
}

enum RecoverySleepTimeZoneCertainty: Equatable, Sendable {
    /// Zone recorded with the samples.
    case recorded
    /// Phone zone at a near-time sync.
    case inferred
    /// Server `timeZoneUncertain`: zone guessed long after the night
    /// (historical import); clock times may be wrong during travel.
    case uncertain
    case unknown
}

enum RecoverySleepOrigin: Equatable, Sendable {
    /// `historical_evidence_import`: permanently Evidence-only.
    case historicalImport
    /// `validation_only` / `operational`: synced after D0.
    case prospective
    case unknown

    init(_ raw: String?) {
        switch raw {
        case "historical_evidence_import": self = .historicalImport
        case "validation_only", "operational": self = .prospective
        default: self = .unknown
        }
    }
}

enum RecoverySleepStage: String, RecoverySleepTolerantEnum, CaseIterable {
    case awake
    case rem = "asleep_rem"
    case core = "asleep_core"
    case deep = "asleep_deep"
    case unspecified = "asleep_unspecified"
    case unknown

    static var allCases: [RecoverySleepStage] { [.awake, .rem, .core, .deep, .unspecified] }

    var label: String {
        switch self {
        case .awake: "Awake"
        case .rem: "REM"
        case .core: "Core"
        case .deep: "Deep"
        case .unspecified: "Asleep"
        case .unknown: "Other"
        }
    }
}

// MARK: - Presentation types

struct RecoverySleepNightSummary: Equatable, Sendable, Identifiable {
    var id: String { sleepDay }
    /// Wake date, YYYY-MM-DD (window [D-1 18:00, D 18:00) local).
    let sleepDay: String
    let status: RecoverySleepNightStatus
    let asleepSeconds: Int?
    let totalAsleepIncludingSecondarySeconds: Int?
    let secondaryEpisodeCount: Int
    let start: String?
    let end: String?
    let timeZone: String?
    let timeZoneCertainty: RecoverySleepTimeZoneCertainty
    /// The Server's own window-consistency rule (`sleepWindow` present and
    /// not `timeZoneUncertain`). Never recomputed differently here.
    let includedInConsistency: Bool
    let windowOpen: Bool
    let windowClosesAt: String?
    let stageStatus: RecoverySleepDetailStatus
    let sourceLabel: String?
    let origin: RecoverySleepOrigin
}

struct RecoverySleepAverage: Equatable, Sendable {
    let asleepSeconds: Int?
    let nightCount: Int
    let windowNights: Int
}

struct RecoverySleepWindowSummary: Equatable, Sendable {
    /// Minutes after 18:00 local (0...1440), converted from the Server's
    /// minute-of-day medians so the axis never splits at midnight.
    let typicalStartMinutes: Int?
    let typicalEndMinutes: Int?
    let startSpreadMinutes: Int?
    let endSpreadMinutes: Int?
    let nightsIncluded: Int
    let nightsExcludedUncertainTime: Int
}

struct RecoverySleepSource: Equatable, Sendable, Identifiable {
    var id: String { label }
    enum Role: Equatable, Sendable { case counted, alsoRecorded }
    let label: String
    let role: Role
}

struct RecoverySleepLanding: Equatable, Sendable {
    enum State: Equatable, Sendable { case available, noData }

    struct AveragePoint: Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let asleepSeconds: Int?
    }

    let state: State
    let lastNight: RecoverySleepNightSummary?
    /// Up to 14 nights with records, newest first (days without a record
    /// are absent and render as chart gaps).
    let nights: [RecoverySleepNightSummary]
    /// Server `sevenNightAverage`.
    let sevenNightAverage: RecoverySleepAverage
    /// DISPLAY-ONLY: mean of the next up-to-7 recorded nights shown here.
    let priorSevenNightAverage: RecoverySleepAverage
    /// DISPLAY-ONLY trailing 7-day mean of the Server totals shown here.
    let trailingAverages: [AveragePoint]
    let sleepWindow: RecoverySleepWindowSummary
    let sources: [RecoverySleepSource]
}

enum RecoverySleepTrendRange: String, CaseIterable, Identifiable, Sendable {
    case twoWeeks = "2w", oneMonth = "1m", threeMonths = "3m", sixMonths = "6m", all
    var id: String { rawValue }
    var label: String {
        switch self {
        case .twoWeeks: "2W"
        case .oneMonth: "1M"
        case .threeMonths: "3M"
        case .sixMonths: "6M"
        case .all: "All"
        }
    }
}

struct RecoverySleepTrends: Equatable, Sendable {
    enum Granularity: Equatable, Sendable { case night, week }

    struct TotalPoint: Equatable, Sendable, Identifiable {
        var id: String { periodStart }
        /// Sleep day (night granularity) or week start (week).
        let periodStart: String
        let asleepSeconds: Int?
        let nightCount: Int
        /// DISPLAY-ONLY trailing 7-day mean (night granularity only).
        let trailingAverageSeconds: Int?
    }

    struct WindowRow: Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let startMinutes: Int
        let endMinutes: Int
        let timeZoneCertainty: RecoverySleepTimeZoneCertainty
        let includedInConsistency: Bool
    }

    struct ContinuityRow: Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let status: RecoverySleepDetailStatus
        let awakeInWindowSeconds: Int?
        let longestAsleepStretchSeconds: Int?
    }

    struct StageMixRow: Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let status: RecoverySleepDetailStatus
        let deepSeconds: Int?
        let coreSeconds: Int?
        let remSeconds: Int?
    }

    let startDate: String
    let endDate: String
    let granularity: Granularity
    /// DISPLAY-ONLY mean of the plotted Server totals.
    let averageAsleepSeconds: Int?
    let nightsWithData: Int
    /// Night granularity hit the Server page limit: only the newest nights
    /// are plotted (shown explicitly in the UI, never silently).
    let isTruncated: Bool
    let totalSleep: [TotalPoint]
    let windowRows: [WindowRow]?
    let continuity: [ContinuityRow]?
    let stageMix: [StageMixRow]?
}

struct RecoverySleepNightsPage: Equatable, Sendable {
    let items: [RecoverySleepNightSummary]
    let nextCursor: String?
}

struct RecoverySleepNightDetail: Equatable, Sendable {
    struct Stages: Equatable, Sendable {
        let status: RecoverySleepDetailStatus
        let deepSeconds: Int?
        let coreSeconds: Int?
        let remSeconds: Int?
        let unspecifiedSeconds: Int?
        let awakeSeconds: Int?
    }

    struct Continuity: Equatable, Sendable {
        let status: RecoverySleepDetailStatus
        let awakeInWindowSeconds: Int?
        let longestAsleepStretchSeconds: Int?
    }

    typealias Segment = RecoverySleepLiveNight.Segment

    struct Timeline: Equatable, Sendable {
        let status: RecoverySleepDetailStatus
        let segments: [Segment]
    }

    struct Main: Equatable, Sendable {
        let start: String
        let end: String
        /// The live contract has no in-bed instants (duration only).
        let inBedStart: String?
        let inBedEnd: String?
        let inBedSeconds: Int?
        let stages: Stages
        let continuity: Continuity
        let timeline: Timeline
    }

    struct Secondary: Equatable, Sendable, Identifiable {
        var id: String { start }
        let start: String
        let end: String
        let asleepSeconds: Int
        let sourceLabel: String?
    }

    struct Provenance: Equatable, Sendable {
        let primarySourceLabel: String
        let corroboratingLabels: [String]
        let algorithmVersion: String
        let lastRecomputedAt: String?
        let origin: RecoverySleepOrigin
        let timeZoneBasis: String?
    }

    let night: RecoverySleepNightSummary
    let main: Main?
    let secondary: [Secondary]
    let provenance: Provenance?
}

// MARK: - Adapter (live -> presentation)

enum RecoverySleepAdapter {
    /// Algorithms whose stage, Awake and continuity values may be shown:
    /// sleep-canon-v2 (historical, permanently) and sleep-canon-v3 (ordinary
    /// prospective nights once the Server activates coherent Oura copy
    /// selection). Anything else (sleep-canon-v1) is still "Being recalculated".
    static let stageCapableAlgorithms: Set<String> = ["sleep-canon-v2", "sleep-canon-v3"]

    static func detailStatus(_ night: RecoverySleepLiveNight) -> RecoverySleepDetailStatus {
        // Numbers are only ever shown when the Server says `available`.
        let stageCapable = night.algorithmVersion.map { stageCapableAlgorithms.contains($0) } ?? false
        switch night.stageStatus {
        case .available: return stageCapable ? .available : .pendingCorrection
        case .unavailable: return stageCapable ? .absent : .pendingCorrection
        case .unknown: return .unknown
        }
    }

    static func certainty(_ night: RecoverySleepLiveNight) -> RecoverySleepTimeZoneCertainty {
        if night.timeZoneUncertain == true { return .uncertain }
        switch night.timeZoneBasis {
        case "sample_metadata": return .recorded
        case "device_at_ingest": return .inferred
        default: return .unknown
        }
    }

    /// DISPLAY-ONLY: the sleep-day window closes at 18:00 on the wake date
    /// in the night's zone; before that late samples may still arrive.
    static func windowClosesAt(_ night: RecoverySleepLiveNight) -> Date? {
        let parts = night.sleepDay.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = night.sleepWindow?.timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 18))
    }

    static func summary(_ night: RecoverySleepLiveNight, now: Date = .now) -> RecoverySleepNightSummary {
        let status: RecoverySleepNightStatus = switch night.status {
        case .asleepRecorded: .asleepRecorded
        case .inBedOnly: .inBedOnly
        case .noSleepRecorded: .noSleepRecorded
        case .unknown: .unknown
        }
        let closes = windowClosesAt(night)
        return RecoverySleepNightSummary(
            sleepDay: night.sleepDay,
            status: status,
            asleepSeconds: night.mainSleep?.asleepSeconds,
            totalAsleepIncludingSecondarySeconds: night.totalAsleepIncludingSecondarySeconds,
            secondaryEpisodeCount: night.secondarySleep?.count ?? 0,
            start: night.sleepWindow?.start,
            end: night.sleepWindow?.end,
            timeZone: night.sleepWindow?.timeZone,
            timeZoneCertainty: certainty(night),
            includedInConsistency: night.sleepWindow != nil && night.timeZoneUncertain != true,
            windowOpen: closes.map { now < $0 } ?? false,
            windowClosesAt: closes.map { ISO8601DateFormatter().string(from: $0) },
            stageStatus: detailStatus(night),
            sourceLabel: night.source,
            origin: RecoverySleepOrigin(night.provenance?.origin ?? night.provenance?.ingestionPurpose)
        )
    }

    /// Minute of day (0-1439) -> minutes after 18:00 (0-1439).
    static func minutesAfterSix(fromMinuteOfDay minute: Int?) -> Int? {
        minute.map { (($0 - 18 * 60) % 1440 + 1440) % 1440 }
    }

    /// DISPLAY-ONLY trailing mean over the 7 calendar days ending at each
    /// night, using only nights present in `nights`; nil below 3 nights.
    static func trailingAverages(_ nights: [RecoverySleepNightSummary]) -> [String: Int] {
        var result: [String: Int] = [:]
        for night in nights {
            guard let end = SleepEvidenceDay.date(night.sleepDay) else { continue }
            let window = nights.filter { other in
                guard let day = SleepEvidenceDay.date(other.sleepDay), other.asleepSeconds != nil else { return false }
                let delta = end.timeIntervalSince(day) / 86_400
                return delta >= 0 && delta < 7
            }
            if window.count >= 3 {
                result[night.sleepDay] = window.compactMap(\.asleepSeconds).reduce(0, +) / window.count
            }
        }
        return result
    }

    static func landing(_ live: RecoverySleepLiveLanding, now: Date = .now) -> RecoverySleepLanding {
        let nights = live.nights.map { summary($0, now: now) }
        let averages = trailingAverages(nights)
        let recorded = nights.filter { $0.status == .asleepRecorded && $0.asleepSeconds != nil }
        let prior = Array(recorded.dropFirst(7).prefix(7)).compactMap(\.asleepSeconds)
        let primaryLabels = Set(live.nights.compactMap(\.source))
        return RecoverySleepLanding(
            state: live.lastNight == nil && live.nights.isEmpty ? .noData : .available,
            lastNight: live.lastNight.map { summary($0, now: now) },
            nights: nights,
            sevenNightAverage: RecoverySleepAverage(asleepSeconds: live.sevenNightAverage.seconds, nightCount: live.sevenNightAverage.nightCount, windowNights: 7),
            priorSevenNightAverage: RecoverySleepAverage(asleepSeconds: prior.isEmpty ? nil : prior.reduce(0, +) / prior.count, nightCount: prior.count, windowNights: 7),
            trailingAverages: nights.map { RecoverySleepLanding.AveragePoint(sleepDay: $0.sleepDay, asleepSeconds: averages[$0.sleepDay]) },
            sleepWindow: RecoverySleepWindowSummary(
                typicalStartMinutes: minutesAfterSix(fromMinuteOfDay: live.window.medianStartMinute),
                typicalEndMinutes: minutesAfterSix(fromMinuteOfDay: live.window.medianEndMinute),
                startSpreadMinutes: live.window.startSpreadMinutes,
                endSpreadMinutes: live.window.endSpreadMinutes,
                nightsIncluded: live.window.nightsUsed,
                nightsExcludedUncertainTime: live.window.inferredNightsExcluded
            ),
            sources: live.sources.map { RecoverySleepSource(label: $0.label, role: primaryLabels.contains($0.label) ? .counted : .alsoRecorded) }
        )
    }

    /// A Goal with no Sleep Evidence in its dates (no read is made).
    static func emptyLanding() -> RecoverySleepLanding {
        RecoverySleepLanding(
            state: .noData, lastNight: nil, nights: [],
            sevenNightAverage: RecoverySleepAverage(asleepSeconds: nil, nightCount: 0, windowNights: 7),
            priorSevenNightAverage: RecoverySleepAverage(asleepSeconds: nil, nightCount: 0, windowNights: 7),
            trailingAverages: [],
            sleepWindow: RecoverySleepWindowSummary(typicalStartMinutes: nil, typicalEndMinutes: nil, startSpreadMinutes: nil, endSpreadMinutes: nil, nightsIncluded: 0, nightsExcludedUncertainTime: 0),
            sources: []
        )
    }

    static func emptyTrends(startDate: String, endDate: String) -> RecoverySleepTrends {
        RecoverySleepTrends(startDate: startDate, endDate: endDate, granularity: .night, averageAsleepSeconds: nil, nightsWithData: 0,
                            isTruncated: false, totalSleep: [], windowRows: [], continuity: [], stageMix: [])
    }

    /// The Goal-scoped landing snapshot, derived from ONE bounded trends read
    /// (<= 30 newest nights inside the Goal's dates, so nothing outside the
    /// range is ever requested). It applies the same rules the Server landing
    /// does: 14 nights shown, the 7-night average over the 7 newest recorded
    /// nights, and window statistics over nights with a window and a reliable
    /// time zone. DISPLAY-ONLY derivation from Server totals and facts. The
    /// typical window is taken in minutes-after-18:00 space, so it is
    /// midnight-safe.
    static func scopedLanding(_ live: RecoverySleepLiveTrends, now: Date = .now) -> RecoverySleepLanding {
        let all = live.nights
        let shownLive = Array(all.prefix(RecoverySleepQuery.landingNights))
        let shown = shownLive.map { summary($0, now: now) }
        let recorded = all.filter { $0.status == .asleepRecorded && $0.mainSleep?.asleepSeconds != nil }
        let seven = recorded.prefix(7).compactMap { $0.mainSleep?.asleepSeconds }
        let prior = recorded.dropFirst(7).prefix(7).compactMap { $0.mainSleep?.asleepSeconds }
        let averages = trailingAverages(shown)
        let included = shownLive.compactMap { night -> RecoverySleepTrends.WindowRow? in
            night.timeZoneUncertain == true ? nil : windowRow(night)
        }
        let starts = included.map(\.startMinutes)
        let ends = included.map(\.endMinutes)
        let primaryLabels = Set(shownLive.compactMap(\.source))
        let labels = Set(all.flatMap { ([$0.source].compactMap { $0 }) + ($0.corroboratingSources ?? []) }).sorted()
        return RecoverySleepLanding(
            state: shown.isEmpty ? .noData : .available,
            lastNight: shownLive.first { $0.status == .asleepRecorded }.map { summary($0, now: now) } ?? shown.first,
            nights: shown,
            sevenNightAverage: RecoverySleepAverage(asleepSeconds: RecoverySleepStats.roundedMean(seven), nightCount: seven.count, windowNights: 7),
            priorSevenNightAverage: RecoverySleepAverage(asleepSeconds: RecoverySleepStats.roundedMean(Array(prior)), nightCount: prior.count, windowNights: 7),
            trailingAverages: shown.map { RecoverySleepLanding.AveragePoint(sleepDay: $0.sleepDay, asleepSeconds: averages[$0.sleepDay]) },
            sleepWindow: RecoverySleepWindowSummary(
                typicalStartMinutes: RecoverySleepStats.median(starts),
                typicalEndMinutes: RecoverySleepStats.median(ends),
                startSpreadMinutes: RecoverySleepStats.mad(starts),
                endSpreadMinutes: RecoverySleepStats.mad(ends),
                nightsIncluded: included.count,
                nightsExcludedUncertainTime: shownLive.filter { $0.timeZoneUncertain == true }.count
            ),
            sources: labels.map { RecoverySleepSource(label: $0, role: primaryLabels.contains($0) ? .counted : .alsoRecorded) }
        )
    }

    static func windowRow(_ night: RecoverySleepLiveNight) -> RecoverySleepTrends.WindowRow? {
        guard let window = night.sleepWindow,
              let start = SleepEvidenceInstant.parse(window.start), let end = SleepEvidenceInstant.parse(window.end) else { return nil }
        let zone = window.timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
        let endMinutes = SleepEvidenceInstant.minutesAfterSix(end, zone)
        let startMinutes = SleepEvidenceInstant.minutesAfterSix(start, zone)
        return RecoverySleepTrends.WindowRow(
            sleepDay: night.sleepDay,
            // A sleep that began before 18:00 of its window would wrap; clamp
            // it to the window start so the bar never inverts.
            startMinutes: startMinutes <= endMinutes ? startMinutes : 0,
            endMinutes: endMinutes,
            timeZoneCertainty: certainty(night),
            includedInConsistency: night.timeZoneUncertain != true
        )
    }

    static func trends(_ live: RecoverySleepLiveTrends, now: Date = .now) -> RecoverySleepTrends {
        if live.granularity == .week {
            let points = live.weekSeries.map {
                RecoverySleepTrends.TotalPoint(periodStart: $0.weekStart, asleepSeconds: $0.averageAsleepSeconds, nightCount: $0.nightCount, trailingAverageSeconds: nil)
            }
            let weighted = live.weekSeries.compactMap { point in point.averageAsleepSeconds.map { ($0, point.nightCount) } }
            let nightTotal = weighted.reduce(0) { $0 + $1.1 }
            return RecoverySleepTrends(
                startDate: live.range.startDate, endDate: live.range.endDate, granularity: .week,
                averageAsleepSeconds: nightTotal > 0 ? weighted.reduce(0) { $0 + $1.0 * $1.1 } / nightTotal : nil,
                nightsWithData: live.weekSeries.reduce(0) { $0 + $1.nightCount },
                isTruncated: false,
                totalSleep: points, windowRows: nil, continuity: nil, stageMix: nil
            )
        }
        let summaries = live.nightSeries.map { summary($0, now: now) }
        let averages = trailingAverages(summaries)
        let totals = summaries.compactMap(\.asleepSeconds)
        return RecoverySleepTrends(
            startDate: live.range.startDate, endDate: live.range.endDate, granularity: .night,
            averageAsleepSeconds: totals.isEmpty ? nil : totals.reduce(0, +) / totals.count,
            nightsWithData: totals.count,
            isTruncated: live.page.nextCursor != nil,
            totalSleep: summaries.map {
                RecoverySleepTrends.TotalPoint(periodStart: $0.sleepDay, asleepSeconds: $0.asleepSeconds, nightCount: $0.asleepSeconds == nil ? 0 : 1, trailingAverageSeconds: averages[$0.sleepDay])
            },
            windowRows: live.nightSeries.compactMap(windowRow),
            continuity: live.nightSeries.map { night in
                let status = detailStatus(night)
                return RecoverySleepTrends.ContinuityRow(
                    sleepDay: night.sleepDay, status: status,
                    awakeInWindowSeconds: status == .available ? night.continuity?.awakeInWindowSeconds : nil,
                    longestAsleepStretchSeconds: status == .available ? night.continuity?.longestAsleepStretchSeconds : nil
                )
            },
            stageMix: live.nightSeries.map { night in
                let status = detailStatus(night)
                return RecoverySleepTrends.StageMixRow(
                    sleepDay: night.sleepDay, status: status,
                    deepSeconds: status == .available ? night.stages?.deepSeconds : nil,
                    coreSeconds: status == .available ? night.stages?.coreSeconds : nil,
                    remSeconds: status == .available ? night.stages?.remSeconds : nil
                )
            }
        )
    }

    static func page(_ live: RecoverySleepLiveTrends, now: Date = .now) -> RecoverySleepNightsPage {
        RecoverySleepNightsPage(items: live.nights.map { summary($0, now: now) }, nextCursor: live.page.nextCursor)
    }

    static func detail(_ night: RecoverySleepLiveNight, now: Date = .now) -> RecoverySleepNightDetail {
        let status = detailStatus(night)
        let available = status == .available
        let main: RecoverySleepNightDetail.Main? = night.sleepWindow.map { window in
            RecoverySleepNightDetail.Main(
                start: window.start, end: window.end, inBedStart: nil, inBedEnd: nil,
                inBedSeconds: night.timeInBedSeconds,
                stages: RecoverySleepNightDetail.Stages(
                    status: status,
                    deepSeconds: available ? night.stages?.deepSeconds : nil,
                    coreSeconds: available ? night.stages?.coreSeconds : nil,
                    remSeconds: available ? night.stages?.remSeconds : nil,
                    unspecifiedSeconds: available ? night.stages?.unspecifiedSeconds : nil,
                    awakeSeconds: available ? night.stages?.awakeSeconds : nil
                ),
                continuity: RecoverySleepNightDetail.Continuity(
                    status: status,
                    awakeInWindowSeconds: available ? night.continuity?.awakeInWindowSeconds : nil,
                    longestAsleepStretchSeconds: available ? night.continuity?.longestAsleepStretchSeconds : nil
                ),
                // Unstaged (absent) timelines are a single asleep lane and carry
                // no stage numbers; older-algorithm timelines are withheld.
                timeline: RecoverySleepNightDetail.Timeline(
                    status: status,
                    segments: status == .pendingCorrection || status == .unknown ? [] : (night.timeline ?? [])
                )
            )
        }
        return RecoverySleepNightDetail(
            night: summary(night, now: now),
            main: main,
            secondary: (night.secondarySleep ?? []).map {
                RecoverySleepNightDetail.Secondary(start: $0.start, end: $0.end, asleepSeconds: $0.asleepSeconds ?? 0, sourceLabel: $0.source)
            },
            provenance: night.source.map {
                RecoverySleepNightDetail.Provenance(
                    primarySourceLabel: $0,
                    corroboratingLabels: night.corroboratingSources ?? [],
                    algorithmVersion: night.algorithmVersion ?? "unknown",
                    lastRecomputedAt: night.provenance?.computedAt,
                    origin: RecoverySleepOrigin(night.provenance?.origin ?? night.provenance?.ingestionPurpose),
                    timeZoneBasis: night.timeZoneBasis
                )
            }
        )
    }
}

/// Shared day/instant helpers usable from Contracts (no SwiftUI).
enum SleepEvidenceDay {
    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func key(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func shift(_ key: String, days: Int) -> String? {
        date(key).map { self.key($0.addingTimeInterval(Double(days) * 86_400)) }
    }

    static func span(_ start: String, _ end: String) -> Int? {
        guard let a = date(start), let b = date(end) else { return nil }
        return Int((b.timeIntervalSince(a) / 86_400).rounded()) + 1
    }

    static func today(now: Date = .now, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

enum SleepEvidenceInstant {
    // ISO8601DateFormatter is thread-safe for parsing.
    nonisolated(unsafe) private static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    static func parse(_ value: String?) -> Date? {
        guard let value else { return nil }
        return fractional.date(from: value) ?? plain.date(from: value)
    }

    static func minutesAfterSix(_ date: Date, _ zone: TimeZone) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return ((parts.hour ?? 0) * 60 + (parts.minute ?? 0) - 18 * 60 + 1440) % 1440
    }
}

/// Small, JavaScript-`Math.round`-compatible statistics for DISPLAY-ONLY
/// derivations (Goal-scoped snapshot). Server facts are never recomputed by
/// these in the unscoped path.
enum RecoverySleepStats {
    static func roundHalfUp(_ value: Double) -> Int { Int((value + 0.5).rounded(.down)) }

    static func roundedMean(_ values: [Int]) -> Int? {
        values.isEmpty ? nil : roundHalfUp(Double(values.reduce(0, +)) / Double(values.count))
    }

    static func median(_ values: [Int]) -> Int? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let count = sorted.count
        return count % 2 == 1 ? sorted[(count - 1) / 2] : roundHalfUp(Double(sorted[count / 2 - 1] + sorted[count / 2]) / 2)
    }

    static func mad(_ values: [Int]) -> Int? {
        guard let center = median(values) else { return nil }
        return median(values.map { abs($0 - center) })
    }
}
