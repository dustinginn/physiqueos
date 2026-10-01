import Foundation

// Recovery / Sleep Evidence read models — Native side of the
// `recovery-sleep*` read contract (proposal v0, documented in
// `docs/native-contracts/recovery-sleep-read-contract-v0.md`).
//
// Every number here is Server-derived from canonical Sleep days
// (sleep-canon-v2). Native never aggregates nights itself, never infers a
// time zone, and never shows stage/Awake/continuity values unless the
// Server marks them `available`. Display of Sleep in Evidence implies no
// strategic eligibility: there is deliberately no score, target, or
// good/bad field anywhere in this contract.

enum RecoverySleepResource {
    static let landing = "recovery-sleep"
    static let trends = "recovery-sleep-trends"
    static let nights = "recovery-sleep-nights"
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

enum RecoverySleepNightStatus: String, RecoverySleepTolerantEnum {
    case asleepRecorded = "asleep_recorded"
    case inBedOnly = "in_bed_only"
    case noSleepRecorded = "no_sleep_recorded"
    /// The sleep-day window closed but the device has not delivered yet.
    case awaitingDevice = "awaiting_device"
    case unknown
}

/// Whether stage / Awake / continuity values may be shown for a night.
enum RecoverySleepDetailStatus: String, RecoverySleepTolerantEnum {
    case available
    /// Computed by an algorithm version whose stage/Awake values are known to
    /// be unreliable (sleep-canon-v1); numbers are withheld by the Server.
    case pendingCorrection = "pending_correction"
    /// The counted source recorded no stage detail for this night.
    case absent
    case unknown
}

enum RecoverySleepTimeZoneBasis: String, RecoverySleepTolerantEnum {
    case sampleMetadata = "sample_metadata"
    case deviceAtIngest = "device_at_ingest"
    case unknown
}

/// How much the night's local clock times can be trusted.
enum RecoverySleepTimeZoneCertainty: String, RecoverySleepTolerantEnum {
    /// The source wrote the zone with the samples.
    case recorded
    /// The phone's zone when it synced, shortly after the night.
    case inferred
    /// Zone guessed long after the night (historical import); clock times may
    /// be wrong, e.g. during travel. Durations remain exact.
    case uncertain
    case unknown
}

enum RecoverySleepOrigin: String, RecoverySleepTolerantEnum {
    case prospective
    case historicalImport = "historical_import"
    case unknown
}

enum RecoverySleepSourceFamily: String, RecoverySleepTolerantEnum {
    case oura
    case appleWatch = "apple_watch"
    case appleIPhone = "apple_iphone"
    case appleOther = "apple_other"
    case sleepCycle = "sleep_cycle"
    case whoop
    case autosleep
    case thirdPartyOther = "third_party_other"
    case manual
    case unknown

    /// Family labels only — never bundle identifiers or device names.
    var label: String {
        switch self {
        case .oura: "Oura"
        case .appleWatch: "Apple Watch"
        case .appleIPhone: "iPhone"
        case .appleOther: "Apple Health"
        case .sleepCycle: "Sleep Cycle"
        case .whoop: "WHOOP"
        case .autosleep: "AutoSleep"
        case .thirdPartyOther: "Another app"
        case .manual: "Entered in Health"
        case .unknown: "Another source"
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

// MARK: - Shared night summary

struct RecoverySleepNightSummary: Decodable, Equatable, Sendable, Identifiable {
    var id: String { sleepDay }
    /// Wake date, YYYY-MM-DD (window [D-1 18:00, D 18:00) local).
    let sleepDay: String
    let status: RecoverySleepNightStatus
    let asleepSeconds: Int?
    let totalAsleepIncludingSecondarySeconds: Int?
    let secondaryEpisodeCount: Int
    /// Main-episode asleep extent (absolute instants, ISO-8601).
    let start: String?
    let end: String?
    let timeZone: String?
    let timeZoneBasis: RecoverySleepTimeZoneBasis
    let timeZoneCertainty: RecoverySleepTimeZoneCertainty
    /// Server decision: may this night's clock times count toward
    /// consistency (sleep-window) statistics?
    let includedInConsistency: Bool
    let windowOpen: Bool
    let windowClosesAt: String?
    let stageStatus: RecoverySleepDetailStatus
    let primarySourceFamily: RecoverySleepSourceFamily?
    let origin: RecoverySleepOrigin
}

struct RecoverySleepAverage: Decodable, Equatable, Sendable {
    /// nil until `nightCount >= minimumNights`.
    let asleepSeconds: Int?
    let nightCount: Int
    let windowNights: Int
    let minimumNights: Int
}

struct RecoverySleepWindowSummary: Decodable, Equatable, Sendable {
    /// Minutes after 18:00 local of the evening before the wake date
    /// (0...1440), so a window never splits at midnight.
    let typicalStartMinutes: Int?
    let typicalEndMinutes: Int?
    /// Median absolute deviation, minutes.
    let startSpreadMinutes: Int?
    let endSpreadMinutes: Int?
    let nightsIncluded: Int
    let nightsExcludedUncertainTime: Int
}

struct RecoverySleepSource: Decodable, Equatable, Sendable, Identifiable {
    var id: String { family.rawValue }
    enum Role: String, RecoverySleepTolerantEnum {
        case preferred, recording
        case notRecorded = "not_recorded"
        case unknown
    }
    let family: RecoverySleepSourceFamily
    let role: Role
    let nightsRecorded: Int
    let windowNights: Int
}

// MARK: - recovery-sleep (landing; one bounded read)

struct RecoverySleepLanding: Decodable, Equatable, Sendable {
    enum State: String, RecoverySleepTolerantEnum {
        case available
        /// Sleep is enabled but no night has been synced yet.
        case noData = "no_data"
        case unknown
    }

    struct AveragePoint: Decodable, Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let asleepSeconds: Int?
    }

    let state: State
    let lastNight: RecoverySleepNightSummary?
    /// The 14 sleep days ending at the newest one, newest first; days with
    /// no data are explicit entries, never omitted.
    let nights: [RecoverySleepNightSummary]
    let sevenNightAverage: RecoverySleepAverage
    let priorSevenNightAverage: RecoverySleepAverage
    /// Trailing 7-night average through each of `nights` (Server-derived).
    let trailingAverages: [AveragePoint]
    let sleepWindow: RecoverySleepWindowSummary
    let sources: [RecoverySleepSource]
    let evidenceStartSleepDay: String?
}

// MARK: - recovery-sleep-trends (bounded range)

enum RecoverySleepTrendRange: String, CaseIterable, Identifiable, Sendable {
    case twoWeeks = "2w", oneMonth = "1m", threeMonths = "3m", sixMonths = "6m", oneYear = "1y", all
    var id: String { rawValue }
    var label: String {
        switch self {
        case .twoWeeks: "2W"
        case .oneMonth: "1M"
        case .threeMonths: "3M"
        case .sixMonths: "6M"
        case .oneYear: "1Y"
        case .all: "All"
        }
    }
}

struct RecoverySleepTrends: Decodable, Equatable, Sendable {
    enum Granularity: String, RecoverySleepTolerantEnum {
        case night, week
        case unknown
    }

    struct TotalPoint: Decodable, Equatable, Sendable, Identifiable {
        var id: String { periodStart }
        /// Sleep day (night granularity) or week-start sleep day.
        let periodStart: String
        let asleepSeconds: Int?
        let nightCount: Int
        let trailingAverageSeconds: Int?
    }

    struct WindowRow: Decodable, Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let startMinutes: Int
        let endMinutes: Int
        let timeZoneCertainty: RecoverySleepTimeZoneCertainty
        let includedInConsistency: Bool
    }

    struct ContinuityRow: Decodable, Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let status: RecoverySleepDetailStatus
        let awakeInWindowSeconds: Int?
        let longestAsleepStretchSeconds: Int?
    }

    struct StageMixRow: Decodable, Equatable, Sendable, Identifiable {
        var id: String { sleepDay }
        let sleepDay: String
        let status: RecoverySleepDetailStatus
        let deepSeconds: Int?
        let coreSeconds: Int?
        let remSeconds: Int?
    }

    let range: String
    let granularity: Granularity
    let averageAsleepSeconds: Int?
    let nightsWithData: Int
    let totalSleep: [TotalPoint]
    /// Night granularity only; nil for weekly ranges.
    let sleepWindow: RecoverySleepWindowSummary?
    let windowRows: [WindowRow]?
    let continuity: [ContinuityRow]?
    let stageMix: [StageMixRow]?
}

// MARK: - recovery-sleep-nights (paged list)

struct RecoverySleepNightsPage: Decodable, Equatable, Sendable {
    let items: [RecoverySleepNightSummary]
    let nextCursor: String?
}

// MARK: - recovery-sleep-night (one scoped read)

struct RecoverySleepNightDetail: Decodable, Equatable, Sendable {
    struct Stages: Decodable, Equatable, Sendable {
        let status: RecoverySleepDetailStatus
        let deepSeconds: Int?
        let coreSeconds: Int?
        let remSeconds: Int?
        let unspecifiedSeconds: Int?
        let awakeSeconds: Int?
    }

    struct Continuity: Decodable, Equatable, Sendable {
        let status: RecoverySleepDetailStatus
        let awakeInWindowSeconds: Int?
        let longestAsleepStretchSeconds: Int?
    }

    struct Segment: Decodable, Equatable, Sendable, Hashable {
        let stage: RecoverySleepStage
        let start: String
        let end: String
    }

    struct Timeline: Decodable, Equatable, Sendable {
        let status: RecoverySleepDetailStatus
        let segments: [Segment]
    }

    struct Main: Decodable, Equatable, Sendable {
        let start: String
        let end: String
        let inBedStart: String?
        let inBedEnd: String?
        let inBedSeconds: Int?
        let stages: Stages
        let continuity: Continuity
        let timeline: Timeline
    }

    struct Secondary: Decodable, Equatable, Sendable, Identifiable {
        var id: String { start }
        let start: String
        let end: String
        let asleepSeconds: Int
        let sourceFamily: RecoverySleepSourceFamily
    }

    struct Corroborating: Decodable, Equatable, Sendable, Identifiable {
        var id: String { sourceFamily.rawValue }
        let sourceFamily: RecoverySleepSourceFamily
        let usable: Bool
    }

    struct Provenance: Decodable, Equatable, Sendable {
        let primarySourceFamily: RecoverySleepSourceFamily
        let preferenceApplied: Bool
        /// sleep-canon reconciliation reason code (never shown raw).
        let reason: String
        let corroborating: [Corroborating]
        let algorithmVersion: String
        let lastRecomputedAt: String?
    }

    let night: RecoverySleepNightSummary
    let main: Main?
    let secondary: [Secondary]
    let provenance: Provenance?
}
