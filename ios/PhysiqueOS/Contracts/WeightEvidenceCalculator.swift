import Foundation

/// Reproduces `buildWeightSummary`/`getWeeklyAverages`/`getWeightExtreme`
/// (`src/domain/services/ProgressReportingService.js:556-606,2315-2349`)
/// exactly, including the parts that read as surprising: the Highest/
/// Lowest cards are a **hardcoded, literal `contextId` string match**, not
/// a computation over any goal-direction property. This port reproduces
/// that faithfully rather than "fixing" it — a future goal that isn't
/// literally `"build-lean-mass"` or `"visible-abs"` falls into the "all"-
/// style branch on the web today, and would do the same here.
enum WeightEvidenceCalculator {
    enum Extreme { case highest, lowest }

    /// The Weight Trend chart's y-axis domain — tight to the actual
    /// plotted min/max (`ProgressLineChart.jsx:18-23`'s own
    /// `Math.min`/`Math.max` over `points.map(p => p.value)`), with zero
    /// headroom padding above/below, exactly matching the web chart. A
    /// single-value domain (every point identical) gets a +1 pad purely so
    /// Swift Charts never receives a zero-width range — the web's own SVG
    /// math degrades the same way in that edge case (a flat line at
    /// mid-height), this just keeps the native chart rendering instead of
    /// crashing on an empty `ClosedRange`.
    static func chartYDomain(points: [WeightChartPoint]) -> ClosedRange<Double> {
        let values = points.compactMap(\.value)
        let minValue = values.min() ?? 0
        let maxValue = values.max() ?? 1
        return minValue...(maxValue > minValue ? maxValue : minValue + 1)
    }

    /// Nearest-x-neighbor scan — the Swift mirror of `updateActivePoint`
    /// (`ProgressLineChart.jsx:49-62`): given an arbitrary touched date,
    /// returns whichever plotted observation's own date is closest to it.
    /// `dateValue` is injected so this stays pure/testable without pulling
    /// in `TrainingDateFormatting`'s `Date` parsing as a hidden dependency.
    static func nearestPoint(to touchedDate: Date, in points: [WeightChartPoint], dateValue: (String) -> Date) -> WeightChartPoint? {
        points.min(by: { abs(dateValue($0.date).timeIntervalSince(touchedDate)) < abs(dateValue($1.date).timeIntervalSince(touchedDate)) })
    }

    /// `getWeightExtreme(weights, direction)` — a plain linear reduction,
    /// not a sort; ties keep the first-encountered (chronologically
    /// earliest) entry, matching the web's `reduce` exactly.
    static func extreme(_ weights: [WeightEntryFixture], _ direction: Extreme) -> WeightEntryFixture? {
        weights.reduce(into: WeightEntryFixture?.none) { result, entry in
            guard let current = result else { result = entry; return }
            switch direction {
            case .highest: if entry.value > current.value { result = entry }
            case .lowest: if entry.value < current.value { result = entry }
            }
        }
    }

    private static func formatWeight(_ entry: WeightEntryFixture?) -> String {
        guard let entry else { return "Pending" }
        return String(format: "%.1f %@", entry.value, entry.unit)
    }

    /// `summaryChange(label, first, last)` — `"Pending"` when either side
    /// is missing or identical (`first === last` on the web); otherwise a
    /// signed value, e.g. `"+3.0 lb"` / `"-4.0 lb"`.
    private static func formatChange(_ first: WeightEntryFixture?, _ last: WeightEntryFixture?) -> String {
        guard let first, let last, first.id != last.id else { return "Pending" }
        let delta = last.value - first.value
        let sign = delta >= 0 ? "+" : ""
        return String(format: "%@%.1f %@", sign, delta, last.unit)
    }

    /// `buildWeightSummary` — the literal 3-branch lookup table, verified
    /// directly against `WeightEvidenceContextService.test.js:64-104`.
    /// Originally keyed on a flat `contextId` string; now keyed on which
    /// canonical Goal is focused by the selection (a specific Phase of that
    /// Goal still counts as "focused on that Goal" — the Highest/Lowest
    /// branch is a Goal-level fact, Phase selection only narrows which
    /// entries are considered). `allWeights` and `scopedWeights` are both
    /// chronologically ascending (oldest first); for `.all`, callers pass
    /// `scopedWeights == allWeights`.
    static func summary(scope: EvidenceScopeSelection, allWeights: [WeightEntryFixture], scopedWeights: [WeightEntryFixture]) -> [WeightSummaryCard] {
        let overallLatest = allWeights.last
        let scopedFirst = scopedWeights.first
        let scopedLatest = scopedWeights.last
        let scopedPrevious = scopedWeights.count >= 2 ? scopedWeights[scopedWeights.count - 2] : nil
        let highest = extreme(scopedWeights, .highest)
        let lowest = extreme(scopedWeights, .lowest)

        switch scope.focusedGoalID {
        case EvidenceCanonicalGoalID.buildLeanMass:
            return [
                WeightSummaryCard(label: "Latest", value: formatWeight(overallLatest)),
                WeightSummaryCard(label: "Since Start", value: formatChange(scopedFirst, overallLatest)),
                WeightSummaryCard(label: "Highest", value: formatWeight(highest)),
                WeightSummaryCard(label: "Lowest", value: formatWeight(lowest)),
            ]
        case EvidenceCanonicalGoalID.visibleAbs:
            return [
                WeightSummaryCard(label: "Latest", value: formatWeight(scopedLatest)),
                WeightSummaryCard(label: "Since Start", value: formatChange(scopedFirst, scopedLatest)),
                WeightSummaryCard(label: "Last Change", value: formatChange(scopedPrevious, scopedLatest)),
                WeightSummaryCard(label: "Lowest", value: formatWeight(lowest)),
            ]
        default:
            // `.all`, or a future Goal id this literal lookup doesn't
            // recognize — falls into the same "all"-style branch the web
            // itself falls into for an unrecognized contextId.
            return [
                WeightSummaryCard(label: "Latest", value: formatWeight(overallLatest)),
                WeightSummaryCard(label: "Since First", value: formatChange(allWeights.first, overallLatest)),
                WeightSummaryCard(label: "Highest", value: formatWeight(extreme(allWeights, .highest))),
                WeightSummaryCard(label: "Lowest", value: formatWeight(extreme(allWeights, .lowest))),
            ]
        }
    }

    /// `getWeeklyAverages` — groups by ISO week (Monday start; the web's
    /// exact `getWeekStartKey` day-of-week convention was not independently
    /// re-derivable from this port's audit, so Monday — the common ISO-8601
    /// default — is used as a documented, reasonable choice), averages
    /// each week, computes week-over-week against the immediately prior
    /// week in the FULL scoped series (so the oldest of the kept last-6
    /// weeks still gets a real delta when an earlier week exists), then
    /// keeps only the most recent 6 weeks, newest-first for display.
    static func weeklyAverages(scopedWeights: [WeightEntryFixture]) -> [WeightWeeklyAverage] {
        guard !scopedWeights.isEmpty else { return [] }
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")

        func weekStart(_ dateString: String) -> Date? {
            guard let date = formatter.date(from: String(dateString.prefix(10))) else { return nil }
            let weekday = calendar.component(.weekday, from: date) // 1 = Sunday
            let daysSinceMonday = (weekday + 5) % 7
            return calendar.date(byAdding: .day, value: -daysSinceMonday, to: date)
        }

        var groups: [Date: [WeightEntryFixture]] = [:]
        for entry in scopedWeights {
            guard let key = weekStart(entry.date) else { continue }
            groups[key, default: []].append(entry)
        }

        let orderedKeys = groups.keys.sorted()
        let averagesByKey: [Date: Double] = groups.mapValues { entries in
            entries.reduce(0) { $0 + $1.value } / Double(entries.count)
        }

        let allWeeks: [(key: Date, average: Double, weekOverWeek: Double?)] = orderedKeys.enumerated().map { index, key in
            let average = averagesByKey[key] ?? 0
            let weekOverWeek: Double? = index > 0 ? average - (averagesByKey[orderedKeys[index - 1]] ?? average) : nil
            return (key, average, weekOverWeek)
        }

        let kept = Array(allWeeks.suffix(6))
        let labelFormatter = DateFormatter()
        labelFormatter.dateFormat = "MMM d"
        labelFormatter.timeZone = TimeZone(identifier: "UTC")

        return kept.reversed().map { week in
            WeightWeeklyAverage(
                week: labelFormatter.string(from: week.key),
                average: week.average,
                weekOverWeek: week.weekOverWeek,
                isBaseWeek: week.weekOverWeek == nil,
                entryCount: groups[week.key]?.count ?? 0
            )
        }
    }
}
