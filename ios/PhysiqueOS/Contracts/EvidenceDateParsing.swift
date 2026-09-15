import Foundation

/// A server-owned calendar date is not an instant. Anchor it at noon in
/// the device UI's calendar, preserving the date at UTC+14 and UTC-12.
/// A fixed UTC-noon anchor cannot cover both extremes.
enum EvidenceDateParsing {
    static func date(fromLocalDateString value: String, timeZone: TimeZone = .current) -> Date? {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard value.count == 10, parts.count == 3,
              parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12)) else { return nil }
        let readback = calendar.dateComponents([.year, .month, .day], from: date)
        guard readback.year == year, readback.month == month, readback.day == day else { return nil }
        return date
    }
}
