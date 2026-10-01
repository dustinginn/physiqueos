import SwiftUI

/// NON-SHIPPING visual prototype of the Sleep Evidence design (report
/// 20261001T032718Z). Everything here is synthetic and fixture-backed; there
/// is no Sleep read model, API, or production path behind it.
///
/// Reachable only when ALL of these hold:
///   1. a DEBUG build (Release compiles the code but `isEnabled` is a
///      constant `false`, so no production/TestFlight build can reach it);
///   2. the volatile launch argument
///      `-physiqueos.sleep-evidence-prototype.v1 YES` (argument domain only,
///      never persisted to UserDefaults);
///   3. the Sandbox authority. Founder Production never decorates the hub
///      or routes to these screens, even in DEBUG with the argument set.
enum SleepEvidencePrototype {
    static let launchArgumentKey = "physiqueos.sleep-evidence-prototype.v1"
    static let streamPrefix = "recovery/sleep/"
    static let trendsStreamId = "recovery/sleep/trends"
    static let nightStreamPrefix = "recovery/sleep/night/"

    /// Compile-time + launch-argument half of the gate.
    static var isEnabled: Bool {
        #if DEBUG
        let value = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)[launchArgumentKey]
        return (value as? String) == "YES" || (value as? Bool) == true
        #else
        return false
        #endif
    }

    static func isActive(authority: NativeAPIEnvironment) -> Bool {
        isActive(authority: authority, enabled: isEnabled)
    }

    /// Pure gate, exposed for tests.
    static func isActive(authority: NativeAPIEnvironment, enabled: Bool) -> Bool {
        enabled && authority == .sandbox
    }

    /// Replaces the Recovery placeholder row's summary in Sandbox only.
    static func decorate(_ hub: EvidenceHubReadModel, authority: NativeAPIEnvironment) -> EvidenceHubReadModel {
        decorate(hub, authority: authority, enabled: isEnabled)
    }

    static func decorate(_ hub: EvidenceHubReadModel, authority: NativeAPIEnvironment, enabled: Bool) -> EvidenceHubReadModel {
        guard isActive(authority: authority, enabled: enabled) else { return hub }
        var hub = hub
        let lastNight = SleepPrototypeFixture.shared.lastNight
        hub.streams = hub.streams.map { stream in
            guard stream.id == "recovery" else { return stream }
            var stream = stream
            stream.metric = "Last night · \(SleepFormat.duration(lastNight.asleepSeconds))"
            stream.trend = "Sleep from Apple Health"
            stream.status = .available
            stream.lastUpdated = lastNight.sleepDay
            return stream
        }
        return hub
    }
}

// MARK: - Prototype-local tokens (design §13; would move into PhysiqueOSTheme on implementation)

extension PhysiqueOSTheme {
    /// Recovery stream teal (`EvidenceStreamPresentation` "recovery").
    static let sleepTotal = Color(hex: 0x5EEAD4)
    static let sleepDeep = Color(hex: 0x6366F1)
    static let sleepCore = Color(hex: 0x60A5FA)
    static let sleepREM = Color(hex: 0xA78BFA)
    /// Neutral slate, deliberately not warning-amber.
    static let sleepAwake = Color(hex: 0xCBD5E1)
    static let sleepInBed = Color(hex: 0x94A3B8, opacity: 0.16)

    static func sleepColor(_ stage: SleepStage) -> Color {
        switch stage {
        case .awake: sleepAwake
        case .rem: sleepREM
        case .core: sleepCore
        case .deep: sleepDeep
        }
    }
}

// MARK: - Fixture model (synthetic; shaped like the sanitized Sept validation report)

enum SleepStage: String, CaseIterable, Identifiable {
    case awake, rem, core, deep
    var id: String { rawValue }
    var label: String {
        switch self {
        case .awake: "Awake"
        case .rem: "REM"
        case .core: "Core"
        case .deep: "Deep"
        }
    }
    var isAsleep: Bool { self != .awake }
}

struct SleepSegment: Identifiable, Hashable {
    let id: Int
    let stage: SleepStage
    let start: Date
    let end: Date
    var seconds: Int { Int(end.timeIntervalSince(start)) }
}

enum SleepStageDetailStatus: Equatable {
    case available
    /// A night still computed by an algorithm whose stage/awake values are
    /// known to be unreliable (sleep-canon-v1). No numbers are shown.
    case pendingCorrection
    case absent
}

struct SleepPrototypeNight: Identifiable, Hashable {
    var id: String { sleepDay }
    /// Wake date, YYYY-MM-DD.
    let sleepDay: String
    let timeZone: TimeZone
    let timeZoneInferred: Bool
    let start: Date
    let end: Date
    let inBedStart: Date
    let inBedEnd: Date
    let segments: [SleepSegment]
    let stageStatus: SleepStageDetailStatus
    let windowOpen: Bool
    let lastUpdated: Date
    let algorithmVersion: String
    let additionalSleep: [AdditionalSleep]

    struct AdditionalSleep: Hashable, Identifiable {
        var id: Date { start }
        let start: Date
        let end: Date
        let asleepSeconds: Int
        let sourceLabel: String
    }

    func seconds(_ stage: SleepStage) -> Int {
        segments.filter { $0.stage == stage }.reduce(0) { $0 + $1.seconds }
    }
    var asleepSeconds: Int { segments.filter { $0.stage.isAsleep }.reduce(0) { $0 + $1.seconds } }
    var awakeSeconds: Int { seconds(.awake) }
    var inBedSeconds: Int { Int(inBedEnd.timeIntervalSince(inBedStart)) }
    var totalIncludingAdditionalSeconds: Int { asleepSeconds + additionalSleep.reduce(0) { $0 + $1.asleepSeconds } }

    /// Longest run of consecutive asleep segments (awake or a gap breaks it).
    var longestAsleepStretchSeconds: Int {
        var best = 0
        var runStart: Date?
        var runEnd: Date?
        for segment in segments {
            if segment.stage.isAsleep {
                if let end = runEnd, end == segment.start, runStart != nil {
                    runEnd = segment.end
                } else {
                    runStart = segment.start
                    runEnd = segment.end
                }
                best = max(best, Int(runEnd!.timeIntervalSince(runStart!)))
            } else {
                runStart = nil
                runEnd = nil
            }
        }
        return best
    }

    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    /// Minutes after 18:00 of the previous local day (0...1440), in the
    /// night's own zone, so a sleep window never splits at midnight.
    func clockMinutes(_ date: Date) -> Double {
        let parts = calendar.dateComponents([.hour, .minute, .second], from: date)
        let minutes = Double((parts.hour ?? 0) * 60 + (parts.minute ?? 0)) + Double(parts.second ?? 0) / 60
        return (minutes - 18 * 60 + 1440).truncatingRemainder(dividingBy: 1440)
    }

    var wakeDate: Date {
        SleepFormat.dayKeyFormatter.date(from: sleepDay) ?? end
    }
}

/// Deterministic synthetic data: 30 nights, Oura primary, staged, one main
/// episode per night, 40-90 timeline segments, three nights with an
/// inferred time zone, the newest night still updating, and one night whose
/// stage detail is pending correction. No Founder values are used.
final class SleepPrototypeFixture: Sendable {
    static let shared = SleepPrototypeFixture()

    let nights: [SleepPrototypeNight]
    var lastNight: SleepPrototypeNight { nights[0] }

    let primarySourceLabel = "Oura"

    init() {
        nights = Self.generate()
    }

    func night(_ sleepDay: String) -> SleepPrototypeNight? {
        nights.first { $0.sleepDay == sleepDay }
    }

    /// Trailing average of the main-episode asleep time ending at `index`
    /// (newest-first array); nil when fewer than 3 of the 7 nights exist.
    func trailingAverageSeconds(endingAt index: Int, window: Int = 7) -> Int? {
        let slice = nights[index..<min(nights.count, index + window)]
        guard slice.count >= 3 else { return nil }
        return slice.reduce(0) { $0 + $1.asleepSeconds } / slice.count
    }

    static let pendingCorrectionDay = "2026-09-21"
    static let inferredDays: Set<String> = ["2026-09-28", "2026-09-29", "2026-09-30"]
    static let additionalSleepDay = "2026-09-20"

    private static func generate() -> [SleepPrototypeNight] {
        var rng = SeededGenerator(seed: 0x51EE_9C0D)
        let pacific = TimeZone(identifier: "America/Los_Angeles")!
        let central = TimeZone(identifier: "America/Chicago")!
        var result: [SleepPrototypeNight] = []
        let now = ISO8601DateFormatter().date(from: "2026-10-01T16:20:00Z")!
        for offset in 0..<30 {
            // Newest first: wake dates 2026-10-01 back to 2026-09-02.
            let wakeKey = SleepFormat.dayKey(addingDays: -offset, to: "2026-10-01")
            let inferred = inferredDays.contains(wakeKey)
            let zone = inferred ? central : pacific
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            let wakeDay = calendar.date(from: SleepFormat.components(of: wakeKey))!
            let bedMinute = 22 * 60 + 35 + rng.int(0...70) // 10:35-11:45 PM
            let asleepTarget = 6 * 3600 + 25 * 60 + rng.int(0...(80 * 60))
            let start = calendar.date(byAdding: .minute, value: bedMinute - 24 * 60, to: wakeDay)!
            let (segments, end) = timeline(start: start, targetAsleep: asleepTarget, rng: &rng)
            let inBedStart = start.addingTimeInterval(-Double(8 + rng.int(0...14)) * 60)
            let inBedEnd = end.addingTimeInterval(Double(6 + rng.int(0...18)) * 60)
            let additional: [SleepPrototypeNight.AdditionalSleep] = wakeKey == additionalSleepDay
                ? [.init(start: calendar.date(byAdding: .minute, value: 13 * 60 + 10, to: wakeDay)!,
                         end: calendar.date(byAdding: .minute, value: 13 * 60 + 45, to: wakeDay)!,
                         asleepSeconds: 31 * 60, sourceLabel: "Apple Watch")]
                : []
            result.append(SleepPrototypeNight(
                sleepDay: wakeKey,
                timeZone: zone,
                timeZoneInferred: inferred,
                start: start,
                end: end,
                inBedStart: inBedStart,
                inBedEnd: inBedEnd,
                segments: segments,
                stageStatus: wakeKey == pendingCorrectionDay ? .pendingCorrection : .available,
                windowOpen: offset == 0,
                lastUpdated: offset == 0 ? now.addingTimeInterval(-3 * 3600) : end.addingTimeInterval(2.5 * 3600),
                algorithmVersion: wakeKey == pendingCorrectionDay ? "sleep-canon-v1" : "sleep-canon-v2",
                additionalSleep: additional
            ))
        }
        return result
    }

    /// ~90-minute cycles: early cycles carry more Deep, later more REM, with
    /// brief awakenings between cycles. Stage boundaries are minute-aligned.
    private static func timeline(start: Date, targetAsleep: Int, rng: inout SeededGenerator) -> ([SleepSegment], Date) {
        var segments: [SleepSegment] = []
        var cursor = start
        var asleep = 0
        var cycle = 0
        func add(_ stage: SleepStage, _ minutes: Int) {
            guard minutes > 0 else { return }
            let end = cursor.addingTimeInterval(Double(minutes) * 60)
            if let last = segments.last, last.stage == stage {
                segments[segments.count - 1] = SleepSegment(id: last.id, stage: stage, start: last.start, end: end)
            } else {
                segments.append(SleepSegment(id: segments.count, stage: stage, start: cursor, end: end))
            }
            if stage.isAsleep { asleep += minutes * 60 }
            cursor = end
        }
        while asleep < targetAsleep {
            let deepWeight = max(0, 3 - cycle)
            let remWeight = min(4, cycle + 1)
            // Each cycle alternates core with short deep/REM bouts so a night
            // lands in the 40-90 segment range the real data showed.
            let bouts = 5 + rng.int(0...3)
            for bout in 0..<bouts {
                add(.core, 4 + rng.int(0...9))
                if bout < deepWeight + 1 && deepWeight > 0 { add(.deep, 3 + rng.int(0...(4 * deepWeight))) }
                if bout >= bouts - remWeight { add(.rem, 3 + rng.int(0...(3 * remWeight))) }
                if rng.int(0...9) == 0 { add(.awake, 1 + rng.int(0...2)) }
                if asleep >= targetAsleep { break }
            }
            if asleep < targetAsleep { add(.awake, 2 + rng.int(0...6)) }
            cycle += 1
        }
        if segments.last?.stage == .awake {
            let last = segments.removeLast()
            cursor = last.start
        }
        return (segments, cursor)
    }
}

struct SeededGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state >> 33
    }
    mutating func int(_ range: ClosedRange<Int>) -> Int {
        range.lowerBound + Int(next() % UInt64(range.count))
    }
}

// MARK: - Formatting

enum SleepFormat {
    static let dayKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()



    static func components(of dayKey: String) -> DateComponents {
        let parts = dayKey.split(separator: "-").compactMap { Int($0) }
        return DateComponents(year: parts[0], month: parts[1], day: parts[2])
    }

    static func dayKey(addingDays days: Int, to dayKey: String) -> String {
        let date = dayKeyFormatter.date(from: dayKey)!
        return dayKeyFormatter.string(from: date.addingTimeInterval(Double(days) * 86_400))
    }

    static func duration(_ seconds: Int) -> String {
        let minutes = Int((Double(seconds) / 60).rounded())
        if minutes < 60 { return "\(minutes)m" }
        return "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m"
    }

    static func spokenDuration(_ seconds: Int) -> String {
        let minutes = Int((Double(seconds) / 60).rounded())
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(rest) minutes" }
        return "\(hours) hour\(hours == 1 ? "" : "s") \(rest) minute\(rest == 1 ? "" : "s")"
    }

    static func clock(_ date: Date, in zone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = zone
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    static func zoneAbbreviation(_ zone: TimeZone, at date: Date) -> String {
        zone.abbreviation(for: date) ?? zone.identifier
    }

    /// "Tue, Sep 29" from a wake-date key.
    static func wakeDate(_ dayKey: String, style: String = "EEE, MMM d") -> String {
        guard let date = dayKeyFormatter.date(from: dayKey) else { return dayKey }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = style
        return formatter.string(from: date)
    }

    /// Clock label for minutes-after-18:00 values on window axes.
    static func clockAxisLabel(_ minutesAfterSix: Double) -> String {
        let total = (Int(minutesAfterSix) + 18 * 60) % 1440
        let hour = total / 60
        let display = hour % 12 == 0 ? 12 : hour % 12
        return "\(display)\(hour < 12 ? "a" : "p")"
    }

    static func clockFromAxis(_ minutesAfterSix: Double) -> String {
        let total = (Int(minutesAfterSix.rounded()) + 18 * 60) % 1440
        let hour = total / 60
        let minute = total % 60
        let display = hour % 12 == 0 ? 12 : hour % 12
        return "\(display):\(String(format: "%02d", minute)) \(hour < 12 ? "AM" : "PM")"
    }
}
