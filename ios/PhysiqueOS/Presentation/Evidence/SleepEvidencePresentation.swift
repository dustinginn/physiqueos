import SwiftUI

/// Formatting and time-zone honesty rules for Recovery / Sleep Evidence.
/// Durations are always exact; clock times are only as certain as the
/// Server says the night's time zone is.
enum SleepEvidenceFormat {
    // ISO8601DateFormatter is thread-safe for parsing.
    nonisolated(unsafe) private static let isoFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) private static let isoPlain = ISO8601DateFormatter()

    static func instant(_ value: String?) -> Date? {
        guard let value else { return nil }
        return isoFractional.date(from: value) ?? isoPlain.date(from: value)
    }

    static func zone(_ identifier: String?) -> TimeZone {
        identifier.flatMap(TimeZone.init(identifier:)) ?? .current
    }

    static func duration(_ seconds: Int?) -> String {
        guard let seconds else { return "–" }
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return "\(minutes)m" }
        return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m"
    }

    static func spokenDuration(_ seconds: Int?) -> String {
        guard let seconds else { return "no data" }
        let minutes = Int((Double(seconds) / 60).rounded())
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(rest) minute\(rest == 1 ? "" : "s")" }
        return "\(hours) hour\(hours == 1 ? "" : "s") \(rest) minute\(rest == 1 ? "" : "s")"
    }

    static func clock(_ date: Date, in zone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = zone
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    static func shortClock(_ date: Date, in zone: TimeZone) -> String {
        clock(date, in: zone).replacingOccurrences(of: ":00", with: "")
    }

    static func zoneAbbreviation(_ zone: TimeZone, at date: Date) -> String {
        zone.abbreviation(for: date) ?? zone.identifier
    }

    private static let dayKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    /// "Tue, Sep 29" (or another style) from a YYYY-MM-DD sleep day.
    static func sleepDay(_ key: String, style: String = "EEE, MMM d") -> String {
        guard let date = dayKeyFormatter.date(from: key) else { return key }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = style
        return formatter.string(from: date)
    }

    /// Local-noon date of a sleep day in the viewer's calendar, so day-unit
    /// chart axes never shift a night onto a neighbouring day.
    static func chartDate(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let date = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        return date.addingTimeInterval(12 * 3600)
    }

    /// "9p", "12a" for minutes after 18:00.
    static func axisClock(_ minutesAfterSix: Double) -> String {
        let total = ((Int(minutesAfterSix) + 18 * 60) % 1440 + 1440) % 1440
        let hour = total / 60
        let display = hour % 12 == 0 ? 12 : hour % 12
        return "\(display)\(hour < 12 ? "a" : "p")"
    }

    /// "11:12 PM" for minutes after 18:00.
    static func clockFromMinutes(_ minutesAfterSix: Int) -> String {
        let total = ((minutesAfterSix + 18 * 60) % 1440 + 1440) % 1440
        let hour = total / 60
        let display = hour % 12 == 0 ? 12 : hour % 12
        return "\(display):\(String(format: "%02d", total % 60)) \(hour < 12 ? "AM" : "PM")"
    }
}

/// Clock-time honesty for one night, derived only from Server fields.
struct SleepClockPresentation: Equatable {
    let zone: TimeZone
    let certainty: RecoverySleepTimeZoneCertainty
    let includedInConsistency: Bool
    let start: Date?
    let end: Date?

    init(night: RecoverySleepNightSummary) {
        zone = SleepEvidenceFormat.zone(night.timeZone)
        certainty = night.timeZoneCertainty
        includedInConsistency = night.includedInConsistency
        start = SleepEvidenceFormat.instant(night.start)
        end = SleepEvidenceFormat.instant(night.end)
    }

    /// The Server flagged these clock times as unsuitable for consistency
    /// (e.g. uncertain historical zone during travel). Rows mark them.
    var isClockTimeCaution: Bool {
        !includedInConsistency && start != nil
    }

    /// Show the zone abbreviation whenever it isn't simply the viewer's own,
    /// recorded zone.
    var showsZone: Bool {
        guard let end else { return false }
        return zone.abbreviation(for: end) != TimeZone.current.abbreviation(for: end) || certainty != .recorded
    }

    var zoneLabel: String? {
        guard let end else { return nil }
        return SleepEvidenceFormat.zoneAbbreviation(zone, at: end)
    }

    /// "11:12 PM – 7:04 AM", prefixed with "≈" when the Server says clock
    /// times are unsuitable as exact evidence.
    var window: String? {
        guard let start, let end else { return nil }
        let text = "\(SleepEvidenceFormat.clock(start, in: zone)) – \(SleepEvidenceFormat.clock(end, in: zone))"
        return isClockTimeCaution ? "≈ \(text)" : text
    }

    var provenanceText: String {
        switch certainty {
        case .recorded: "Recorded with the sleep data"
        case .inferred: "Inferred from your phone when it synced"
        case .uncertain: "Inferred long after this night — may be wrong if you travelled"
        case .unknown: "Not known"
        }
    }

    var shortProvenance: String {
        switch certainty {
        case .recorded: "recorded"
        case .inferred: "inferred at sync"
        case .uncertain: "uncertain"
        case .unknown: "unknown"
        }
    }
}

extension PhysiqueOSTheme {
    static func sleepColor(_ stage: RecoverySleepStage) -> Color {
        switch stage {
        case .awake: sleepAwake
        case .rem: sleepREM
        case .core: sleepCore
        case .deep: sleepDeep
        case .unspecified, .unknown: sleepUnspecified
        }
    }
}

extension RecoverySleepNightSummary {
    var clock: SleepClockPresentation { SleepClockPresentation(night: self) }

    var hasSleep: Bool { status == .asleepRecorded && asleepSeconds != nil }

    var statusText: String? {
        switch status {
        case .asleepRecorded: nil
        case .inBedOnly: "In bed · no sleep data"
        case .noSleepRecorded: "No sleep recorded"
        case .unknown: "Not available"
        }
    }
}

extension RecoverySleepWindowSummary {
    /// Guard for Server window medians, which are computed over raw local
    /// minutes of the day: when included nights straddle midnight (some
    /// before, some after 12 AM) such a median can land outside every
    /// included night. A median must lie within the included nights' own
    /// span, so a value outside it is withheld rather than shown. This
    /// never recomputes or replaces the Server value.
    func isPlausible(against rows: [SleepWindowChartRow]) -> Bool {
        let included = rows.filter(\.includedInConsistency)
        // A "typical" window needs at least 3 reliable nights (display rule).
        guard let start = typicalStartMinutes, let end = typicalEndMinutes, included.count >= 3 else { return false }
        let starts = included.map(\.startMinutes)
        let ends = included.map(\.endMinutes)
        return (starts.min()!...starts.max()!).contains(start) && (ends.min()!...ends.max()!).contains(end)
    }
}

/// Evidence Hub row for Recovery, from the Server landing only.
enum RecoverySleepHubSummary {
    static func stream(_ landing: RecoverySleepLanding) -> EvidenceStreamSummary {
        stream(landing, today: todayKey())
    }

    static func stream(_ landing: RecoverySleepLanding, today: String) -> EvidenceStreamSummary {
        let hasNight = landing.state == .available && landing.lastNight?.asleepSeconds != nil
        return EvidenceStreamSummary(
            id: "recovery", title: "Recovery",
            metric: metric(landing, today: today), trend: "Sleep from Apple Health.",
            lastUpdated: hasNight ? landing.lastNight?.sleepDay : nil,
            status: hasNight ? .available : .placeholder,
            tone: hasNight ? .success : .muted,
            destination: .progressStream(streamId: "recovery")
        )
    }

    /// "Last night · 7h 12m" when the newest night woke today; otherwise
    /// "Sep 28 · 6h 50m"; "Waiting for first synced night" before any data.
    static func metric(_ landing: RecoverySleepLanding, today: String) -> String {
        guard landing.state == .available, let night = landing.lastNight, let seconds = night.asleepSeconds else {
            return "Waiting for first synced night"
        }
        let prefix = night.sleepDay == today ? "Last night" : SleepEvidenceFormat.sleepDay(night.sleepDay, style: "MMM d")
        return "\(prefix) · \(SleepEvidenceFormat.duration(seconds))"
    }

    static func todayKey(now: Date = .now, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}
