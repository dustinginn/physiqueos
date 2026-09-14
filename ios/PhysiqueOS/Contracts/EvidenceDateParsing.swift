import Foundation

/// Parses the server-computed `localDate` (`LogReadModel.localDate`, a
/// plain `yyyy-MM-dd` string with no time/zone component) into a `Date`
/// anchored to UTC noon-of-day — the same `"${date}T12:00:00Z"` convention
/// `PriorityOccurrenceCalculator.noonUTC` establishes — rather than UTC
/// midnight. Callers here (e.g. `DateField`) hand the result to
/// `Calendar.current`-based UI (SwiftUI's `DatePicker`, default-timezone
/// `DateFormatter`s), which reads back the *device-local* calendar day of
/// whatever `Date` they're given. A UTC-midnight anchor reads back as the
/// PREVIOUS local day on every negative-UTC-offset device (every US time
/// zone) — noon-UTC stays within the correct local day for any real-world
/// offset (UTC-12…UTC+14), so the calendar day this represents is never
/// reinterpreted incorrectly regardless of where the device happens to be.
/// This is presentation-layer parsing of a value the server already
/// resolved in the Founder's timezone; it does not recompute what day it is
/// (see docs/PHYSIQUEOS_NATIVE_V1.md's timezone-drift concern from the
/// Track A audit).
enum EvidenceDateParsing {
    static func date(fromLocalDateString value: String) -> Date? {
        formatter.date(from: value).map { $0.addingTimeInterval(12 * 3600) }
    }

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()
}
