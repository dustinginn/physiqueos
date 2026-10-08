import Foundation

/// The single Weekly/Monthly Recovery card (`recovery_card_v1`).
///
/// The Server publishes it as an optional top-level `recovery` key of the
/// Native Briefing detail, ONLY for Weekly and Monthly artifacts that carry a
/// valid published Recovery envelope (>= 14 reliable prior nights). It is a
/// presentation contract: no Recovery Score, no Confidence coupling, no
/// causal claims. It lives on `WeeklyBriefingContent` / `MonthlyBriefingContent`
/// only, so Midweek, DEXA, Photo and Daily briefings cannot carry one.
struct BriefingRecoveryCard: Codable, Equatable {
    enum Cadence: String, Codable, Equatable { case weekly, monthly }

    enum Status: String, Codable, Equatable, CaseIterable {
        case green, yellow, red, unavailable

        /// Fixed product labels (never Server free text).
        var label: String {
            switch self {
            case .green: "Green"
            case .yellow: "Yellow"
            case .red: "Red"
            case .unavailable: "Not enough data"
            }
        }
    }

    enum TrendGranularity: String, Codable, Equatable {
        /// Weekly: one point per reliable night (wake date).
        case night
        /// Monthly: one point per Sunday-anchored week aggregate.
        case week
    }

    struct TrendPoint: Codable, Equatable {
        /// `YYYY-MM-DD`: the night's wake date, or the week's Sunday.
        var date: String
        var totalSleepMinutes: Double
    }

    struct Commentary: Codable, Equatable {
        /// Server-authored editorial title of a Yellow/Red card.
        var headline: String
        /// Monthly's distinct commentary-block title ("A multi-week shift");
        /// nil on Weekly.
        var title: String?
        var body: String
    }

    /// Execution context only: it never sets or changes the status.
    /// `completed + missed + excused == scheduled`; explicit Skips are excused.
    struct FoamRolling: Codable, Equatable {
        var completed: Int
        var scheduled: Int
        var missed: Int
        var excused: Int
    }

    var assessmentId: String
    var cadence: Cadence
    var status: Status
    var periodStartDate: String
    var periodEndDate: String
    var expectedNights: Int
    var observedNights: Int
    /// Period average asleep minutes; nil only for Not enough data.
    var averageMinutes: Double?
    /// Prior-28-night personal baseline (median asleep minutes).
    var baselineMinutes: Double
    /// Average minus baseline; nil when the average is unavailable.
    var deltaMinutes: Double?
    var baselineNights: Int
    var granularity: TrendGranularity
    var points: [TrendPoint]
    /// Inline Yellow/Red commentary only; Green stays quiet.
    var commentary: Commentary?
    /// Authoritative foam-rolling execution context only; nil hides the row.
    var foamRolling: FoamRolling?
}

/// Fail-closed decoding of the optional `recovery` key. Anything malformed,
/// for the wrong cadence, or out of shape returns nil: the card is treated
/// as missing and the rest of the Briefing renders untouched. Diagnostic
/// `dataLimitations` codes are never read, so they can never reach the UI.
enum BriefingRecoveryCardDecoder {
    static let schemaVersion = "recovery_card_v1"
    static let presentation = "single_recovery_card_v1"
    static let minimumBaselineNights = 14
    static let baselineLookbackNights = 28
    static let maximumMinutes = 1_440.0
    static let maximumTextLength = 400

    /// - Parameters:
    ///   - value: the response's top-level `recovery` value (may be nil).
    ///   - cadence: the artifact cadence the screen is rendering. Anything
    ///     other than Weekly or Monthly always yields nil.
    ///   - window: the artifact's evidence window; when its dates are known
    ///     the card period must match them exactly.
    ///   - now: the decoding clock; a period that has not closed is refused.
    static func decode(
        _ value: BriefingJSONValue?,
        cadence: BriefingCadence,
        window: BriefingEvidenceWindowReadModel?,
        now: Date = Date()
    ) -> BriefingRecoveryCard? {
        let expectedCadence: BriefingRecoveryCard.Cadence
        switch cadence {
        case .weekly: expectedCadence = .weekly
        case .monthly: expectedCadence = .monthly
        case .daily, .midweek, .event: return nil
        }
        guard let value, value.object != nil,
              value["schemaVersion"]?.literalString == schemaVersion,
              value["presentation"]?.literalString == presentation,
              value["cadence"]?.literalString == expectedCadence.rawValue,
              let assessmentId = nonEmpty(value["assessmentId"]?.literalString),
              let status = value["status"]?["state"]?.literalString.flatMap(BriefingRecoveryCard.Status.init(rawValue:)),
              let period = value["period"],
              let start = calendarDate(period["startDate"]?.literalString),
              let end = calendarDate(period["endDate"]?.literalString),
              let expectedNights = integer(period["expectedNights"]),
              let observedNights = integer(period["observedNights"]),
              let sleep = value["sleep"],
              let baseline = minutes(sleep["baselineMinutes"]),
              let baselineNights = integer(sleep["baselineNights"]),
              let trend = sleep["trend"],
              let granularity = trend["granularity"]?.literalString.flatMap(BriefingRecoveryCard.TrendGranularity.init(rawValue:))
        else { return nil }

        // Period shape: exact Sunday–Saturday week or one calendar month,
        // closed before `now`, and the artifact's own window when known.
        let days = dayCount(from: start, through: end)
        switch expectedCadence {
        case .weekly:
            guard days == 7, weekday(start) == 1, granularity == .night else { return nil }
        case .monthly:
            guard isFirstOfMonth(start), isLastOfMonth(end), (28...31).contains(days), granularity == .week else { return nil }
        }
        guard expectedNights == days, (0...expectedNights).contains(observedNights) else { return nil }
        if let window, let windowStart = calendarDate(window.startDate), let windowEnd = calendarDate(window.endDate) {
            guard windowStart == start, windowEnd == end else { return nil }
        }
        guard end < startOfToday(now, timeZone: window?.timeZone) else { return nil }

        // A published card always rests on >= 14 reliable prior nights.
        guard (minimumBaselineNights...baselineLookbackNights).contains(baselineNights) else { return nil }
        guard (sleep["baselineLookbackNights"].map { integer($0) == baselineLookbackNights } ?? true) else { return nil }

        var average: Double?
        if let raw = sleep["averageMinutes"], raw.isNullValue == false {
            guard let parsed = minutes(raw) else { return nil }
            average = parsed
        } else {
            average = nil
        }
        // Not enough data shows no average or delta (approved design: "—"):
        // a partial-period mean must not read as a result.
        if status == .unavailable { average = nil }
        // Only Not enough data may lack an average; it never shows a delta.
        if status != .unavailable, average == nil { return nil }
        let delta: Double?
        if average == nil {
            delta = nil
        } else if case .number(let published)? = sleep["deltaFromBaselineMinutes"] {
            guard published.isFinite, abs(published) <= maximumMinutes else { return nil }
            delta = published
        } else {
            delta = average.map { $0 - baseline }
        }

        guard let points = trendPoints(trend["points"], granularity: granularity, start: start, end: end) else { return nil }
        switch granularity {
        case .night:
            guard points.count == observedNights else { return nil }
        case .week:
            guard points.count <= 6, observedNights == 0 || !points.isEmpty else { return nil }
        }
        if status != .unavailable, points.isEmpty { return nil }

        let commentary: BriefingRecoveryCard.Commentary?
        if status == .yellow || status == .red,
           value["commentary"]?["visible"]?.bool == true,
           let headline = boundedText(value["commentary"]?["headline"]?.literalString),
           let body = boundedText(value["commentary"]?["body"]?.literalString) {
            commentary = .init(headline: headline, title: boundedText(value["commentary"]?["title"]?.literalString), body: body)
        } else {
            commentary = nil
        }

        return BriefingRecoveryCard(
            assessmentId: assessmentId,
            cadence: expectedCadence,
            status: status,
            periodStartDate: key(start),
            periodEndDate: key(end),
            expectedNights: expectedNights,
            observedNights: observedNights,
            averageMinutes: average,
            baselineMinutes: baseline,
            deltaMinutes: delta,
            baselineNights: baselineNights,
            granularity: granularity,
            points: points,
            commentary: commentary,
            foamRolling: foamRolling(value["foamRolling"])
        )
    }

    // MARK: Validation helpers

    private static func trendPoints(_ value: BriefingJSONValue?, granularity: BriefingRecoveryCard.TrendGranularity, start: Date, end: Date) -> [BriefingRecoveryCard.TrendPoint]? {
        guard case .array(let items)? = value else { return nil }
        var points: [BriefingRecoveryCard.TrendPoint] = []
        var previous: Date?
        for item in items {
            guard let date = calendarDate(item["label"]?.literalString),
                  let total = minutes(item["totalSleepMinutes"]) else { return nil }
            if let previous, date <= previous { return nil }
            switch granularity {
            case .night:
                guard date >= start, date <= end else { return nil }
            case .week:
                // Sunday anchors; the first may precede a month starting mid-week.
                guard weekday(date) == 1, date <= end, dayCount(from: date, through: start) <= 7 else { return nil }
            }
            points.append(.init(date: key(date), totalSleepMinutes: total))
            previous = date
        }
        return points
    }

    private static func foamRolling(_ value: BriefingJSONValue?) -> BriefingRecoveryCard.FoamRolling? {
        guard let state = value?["state"]?.literalString, ["on_track", "mixed"].contains(state),
              let scheduled = integer(value?["scheduledOccurrences"]), scheduled > 0,
              let completed = integer(value?["completedOccurrences"]), (0...scheduled).contains(completed)
        else { return nil }
        // A card without the split (pre-correction Server) reads every
        // not-completed occurrence as missed; a present split must add up.
        let excused = value?["excusedOccurrences"].flatMap(integer) ?? 0
        let missed = value?["missedOccurrences"].flatMap(integer) ?? scheduled - completed - excused
        guard missed >= 0, completed + missed + excused == scheduled,
              (state == "mixed") == (missed > 0) else { return nil }
        return .init(completed: completed, scheduled: scheduled, missed: missed, excused: excused)
    }

    private static func minutes(_ value: BriefingJSONValue?) -> Double? {
        guard case .number(let number)? = value, number.isFinite, number > 0, number <= maximumMinutes else { return nil }
        return number
    }

    private static func integer(_ value: BriefingJSONValue?) -> Int? {
        guard case .number(let number)? = value, number.isFinite, number >= 0, number.rounded() == number, number <= 10_000 else { return nil }
        return Int(number)
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private static func boundedText(_ value: String?) -> String? {
        guard let text = nonEmpty(value), text.count <= maximumTextLength else { return nil }
        return text
    }

    // MARK: Calendar (Gregorian, date keys anchored at UTC noon)

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    private static let parser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = calendar
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }()

    static func calendarDate(_ value: String?) -> Date? {
        guard let value, value.count == 10, let date = parser.date(from: value), parser.string(from: date) == value else { return nil }
        return date
    }

    static func key(_ date: Date) -> String { parser.string(from: date) }

    private static func dayCount(from start: Date, through end: Date) -> Int {
        (calendar.dateComponents([.day], from: start, to: end).day ?? -1) + 1
    }

    private static func weekday(_ date: Date) -> Int { calendar.component(.weekday, from: date) }

    private static func isFirstOfMonth(_ date: Date) -> Bool { calendar.component(.day, from: date) == 1 }

    private static func isLastOfMonth(_ date: Date) -> Bool {
        guard let next = calendar.date(byAdding: .day, value: 1, to: date) else { return false }
        return calendar.component(.day, from: next) == 1
    }

    /// Today's date key in the briefing's zone, as a UTC-anchored date.
    private static func startOfToday(_ now: Date, timeZone identifier: String?) -> Date {
        let zone = identifier.flatMap(TimeZone.init(identifier:)) ?? TimeZone(identifier: "America/Los_Angeles")!
        var local = Calendar(identifier: .gregorian)
        local.timeZone = zone
        let parts = local.dateComponents([.year, .month, .day], from: now)
        return calendar.date(from: parts) ?? now
    }
}

extension BriefingJSONValue {
    var isNullValue: Bool { if case .null = self { true } else { false } }
}
