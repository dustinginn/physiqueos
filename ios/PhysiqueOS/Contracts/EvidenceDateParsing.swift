import Foundation

/// Parses the server-computed `localDate` (`LogReadModel.localDate`, a
/// plain `yyyy-MM-dd` string with no time/zone component) into a `Date`
/// anchored to UTC noon-of-day semantics via a UTC-timezone formatter —
/// not the device's local timezone — so the parsed value never silently
/// shifts to the previous or next calendar day depending on where the
/// device happens to be. This is presentation-layer parsing of a value the
/// server already resolved in the Founder's timezone; it does not
/// recompute what day it is (see docs/PHYSIQUEOS_NATIVE_V1.md's
/// timezone-drift concern from the Track A audit).
enum EvidenceDateParsing {
    static func date(fromLocalDateString value: String) -> Date? {
        formatter.date(from: value)
    }

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()
}
