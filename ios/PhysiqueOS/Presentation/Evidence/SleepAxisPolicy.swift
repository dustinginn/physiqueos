import Foundation

/// One shared, range-aware date-axis policy for every longitudinal Sleep
/// chart (Total Sleep, Awake-in-window, Longest Continuous Sleep, Stage Mix,
/// the Sleep Window rows and the landing's 14-night chart).
///
/// The policy thins only the axis LABELS. Every data point is still plotted,
/// weekly Server aggregation is untouched, and tap/selection still exposes
/// the exact date and value. Ticks are explicit dates (never Swift Charts'
/// automatic ticks, which overlap on dense ranges), they are anchored to the
/// newest night and walk backwards so the labels on every chart land on the
/// same days, and ticks too close to either edge are dropped so a centered
/// label never clips.
///
/// Target density:
///   2W  about every 3 days     1M  about weekly      3M  about every 2 weeks
///   6M  about monthly          All about monthly (year shown when the span
///                              crosses a calendar year)
enum SleepAxisPolicy {
    enum Style: Equatable, Sendable {
        case everyThreeDays, weekly, biweekly, monthly

        init(_ selector: RecoverySleepTrendRange) {
            switch selector {
            case .twoWeeks: self = .everyThreeDays
            case .oneMonth: self = .weekly
            case .threeMonths: self = .biweekly
            case .sixMonths, .all: self = .monthly
            }
        }

        var strideDays: Int? {
            switch self {
            case .everyThreeDays: 3
            case .weekly: 7
            case .biweekly: 14
            case .monthly: nil
            }
        }
    }

    struct Tick: Equatable, Hashable, Sendable {
        let date: Date
        let label: String
    }

    /// The shared plan every chart on a screen consumes.
    struct Plan: Equatable, Sendable {
        let style: Style
        /// Chart x-domain: first point minus half a day through last point
        /// plus half a day (or a whole week for weekly points).
        let domain: ClosedRange<Date>
        let ticks: [Tick]

        var tickDates: [Date] { ticks.map(\.date) }
        func label(for date: Date) -> String? { ticks.first { $0.date == date }?.label }
    }

    /// Fraction of the domain kept free of ticks at each edge so a centered
    /// label (about 40 pt of a ~300 pt plot) never clips.
    static let edgeMarginFraction = 0.075

    /// Builds the plan for newest-first or oldest-first point dates (any
    /// order). `pointSpan` is the length of one plotted point (a day, or a
    /// week for weekly aggregation); it only widens the domain.
    static func plan(
        selector: RecoverySleepTrendRange,
        pointDates: [Date],
        pointSpan: TimeInterval = 86_400,
        calendar: Calendar = .current
    ) -> Plan {
        let style = Style(selector)
        guard let oldest = pointDates.min(), let newest = pointDates.max() else {
            let now = Date()
            return Plan(style: style, domain: now...now.addingTimeInterval(1), ticks: [])
        }
        let half = pointSpan / 2
        let domain = oldest.addingTimeInterval(-half)...max(newest.addingTimeInterval(half), oldest.addingTimeInterval(half * 2))
        return Plan(style: style, domain: domain, ticks: ticks(style: style, domain: domain, newest: newest, calendar: calendar))
    }

    static func ticks(style: Style, domain: ClosedRange<Date>, newest: Date, calendar: Calendar = .current) -> [Tick] {
        let length = domain.upperBound.timeIntervalSince(domain.lowerBound)
        guard length > 0 else { return [] }
        let margin = length * edgeMarginFraction
        let inside: (Date) -> Bool = { date in
            date.timeIntervalSince(domain.lowerBound) >= margin && domain.upperBound.timeIntervalSince(date) >= margin
        }
        var dates: [Date] = []
        if let strideDays = style.strideDays {
            var cursor = newest
            while cursor >= domain.lowerBound {
                if inside(cursor) { dates.append(cursor) }
                guard let previous = calendar.date(byAdding: .day, value: -strideDays, to: cursor) else { break }
                cursor = previous
            }
            dates.reverse()
        } else {
            // First of each month inside the domain, at the same local-noon
            // alignment the day-unit bars use.
            var components = calendar.dateComponents([.year, .month], from: domain.lowerBound)
            components.day = 1
            components.hour = 12
            var cursor = calendar.date(from: components) ?? domain.lowerBound
            while cursor <= domain.upperBound {
                if cursor >= domain.lowerBound, inside(cursor) { dates.append(cursor) }
                guard let next = calendar.date(byAdding: .month, value: 1, to: cursor) else { break }
                cursor = next
            }
        }
        let crossesYear = calendar.component(.year, from: domain.lowerBound) != calendar.component(.year, from: domain.upperBound)
        return dates.enumerated().map { index, date in
            Tick(date: date, label: label(date, style: style, includeYear: crossesYear && (index == 0 || calendar.component(.month, from: date) == 1), calendar: calendar))
        }
    }

    private static func label(_ date: Date, style: Style, includeYear: Bool, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        switch style {
        case .monthly: formatter.dateFormat = includeYear ? "MMM yyyy" : "MMM"
        default: formatter.dateFormat = includeYear ? "MMM d, yyyy" : "MMM d"
        }
        return formatter.string(from: date)
    }

    /// Row labels for the Sleep Window chart (one row per night): the same
    /// tick days as the plan, so its labels line up with every other chart.
    static func rowLabels(plan: Plan, rowDays: [String]) -> [String] {
        let wanted = Set(plan.ticks.map { SleepEvidenceDay.key($0.date) })
        return rowDays.filter { wanted.contains($0) }.map { SleepEvidenceFormat.sleepDay($0, style: "MMM d") }
    }
}
