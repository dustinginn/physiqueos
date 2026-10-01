import Foundation

/// Reproduces `EnergyDailyReconciliationService.finalizeRow`,
/// `EnergyWeeklyAggregationService.aggregateEnergyWeeks`, and
/// `EnergyEvidenceService.createSummary`/`getRecentFourWeeklyEnergy` — pure
/// functions over a chronologically-ascending list of raw canonical daily
/// records, mirroring `WeightEvidenceCalculator`/`DEXAEvidenceCalculator`'s
/// own "raw entries in, scoped+derived report out" convention. Every
/// formula below is copied verbatim from source (cited per function), not
/// invented: intake/active-calories are canonical raw inputs, RMR is a
/// server-resolved carry-forward value fixtured per day (see
/// `EnergyDayFixture`'s own doc comment), and expenditure/balance/
/// completeness/weekly-average math is exactly the same deterministic
/// arithmetic the server performs — there is no OpenAI/PI call anywhere in
/// Energy's real dependency chain to avoid reimplementing.
enum EnergyEvidenceCalculator {
    // MARK: - Shared value formatting (`formatCalories`/`formatSignedCalories`, EnergyWeeklyChart.jsx)

    /// Used by the summary cards, both charts' detail panels, and the
    /// weekly/daily history rows alike — one shared formatter so all of
    /// them agree, matching how the web itself exports these two functions
    /// from a single module and imports them everywhere Energy values are
    /// displayed.
    static func formatCalories(_ value: Double?) -> String {
        guard let value else { return "Not available" }
        return "\(Int(value.rounded())) kcal"
    }

    /// Never color-coded by sign on the live page (see `EnergyDayRecord
    /// .energyBalance`'s doc comment) — this only controls the `+`/`-`
    /// prefix, matching source's own ASCII-adjacent sign convention already
    /// established for DEXA's delta formatting elsewhere in this codebase.
    static func formatSignedCalories(_ value: Double?) -> String {
        guard let value else { return "Not available" }
        let rounded = Int(value.rounded())
        if rounded == 0 { return "0 kcal" }
        return rounded > 0 ? "+\(rounded) kcal" : "-\(abs(rounded)) kcal"
    }

    // MARK: - Per-day derivation (`finalizeRow`, EnergyDailyReconciliationService.js)

    static func estimatedExpenditure(_ day: EnergyDayFixture) -> Double? {
        guard let rmr = day.rmr, let active = day.activeCalories else { return nil }
        return rmr + active
    }

    static func energyBalance(_ day: EnergyDayFixture) -> Double? {
        guard let intake = day.calorieIntake, let expenditure = estimatedExpenditure(day) else { return nil }
        return intake - expenditure
    }

    /// `"complete" | "nutrition-only" | "activity-only" | "missing-rmr" |
    /// "no-paired-evidence"` — verbatim decision order from `finalizeRow`.
    static func completeness(_ day: EnergyDayFixture) -> String {
        let hasNutrition = day.calorieIntake != nil
        let hasActiveCalories = day.activeCalories != nil
        if energyBalance(day) != nil { return "complete" }
        if hasNutrition && !hasActiveCalories { return "nutrition-only" }
        if !hasNutrition && day.hasActivityRecord { return "activity-only" }
        if hasNutrition && hasActiveCalories && day.rmr == nil { return "missing-rmr" }
        return "no-paired-evidence"
    }

    static func dayRecord(_ day: EnergyDayFixture) -> EnergyDayRecord {
        EnergyDayRecord(
            id: day.id, date: day.date, calorieIntake: day.calorieIntake, activeCalories: day.activeCalories,
            estimatedExpenditure: estimatedExpenditure(day), energyBalance: energyBalance(day),
            completeness: completeness(day),
            attributedScope: EvidenceChronology.attribution(forOccurrenceDate: day.date)
        )
    }

    // MARK: - Date math (Sunday–Saturday weeks, UTC-anchored like every other date-key utility in this codebase)

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static let dateKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    /// `getCanonicalWeekStart` — the Sunday on/before `dateString`.
    private static func weekStartKey(_ dateString: String) -> String {
        guard let date = TrainingDateFormatting.date(from: dateString) else { return dateString }
        let weekday = utcCalendar.component(.weekday, from: date) // 1 = Sunday
        let start = utcCalendar.date(byAdding: .day, value: -(weekday - 1), to: date) ?? date
        return dateKeyFormatter.string(from: start)
    }

    private static func addDays(_ dateString: String, _ amount: Int) -> String {
        guard let date = TrainingDateFormatting.date(from: dateString),
              let shifted = utcCalendar.date(byAdding: .day, value: amount, to: date) else { return dateString }
        return dateKeyFormatter.string(from: shifted)
    }

    private static func daysBetweenInclusive(_ start: String, _ end: String) -> Int {
        guard let startDate = TrainingDateFormatting.date(from: start), let endDate = TrainingDateFormatting.date(from: end),
              let days = utcCalendar.dateComponents([.day], from: startDate, to: endDate).day else { return 0 }
        return days + 1
    }

    /// Mirrors JS `Math.round` exactly (always rounds a `.5` toward
    /// positive infinity), not Swift's default away-from-zero rounding —
    /// matters for negative energy-balance averages landing on a half.
    static func average(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let mean = values.reduce(0, +) / Double(values.count)
        return (mean + 0.5).rounded(.down)
    }

    // MARK: - Weekly aggregation (`aggregateEnergyWeeks`, EnergyWeeklyAggregationService.js)

    /// Sunday–Saturday buckets, ascending by week start. `windowStart`/
    /// `windowEnd` are the selected scope's own canonical boundary dates
    /// (`EvidenceChronology.dateWindow`) — used only to compute each week's
    /// `expectedDayCount`/`partial` flag, so a week clipped by a Goal/Phase
    /// edge correctly expects fewer days rather than being flagged partial
    /// for days outside the selected window.
    ///
    /// Disclosed simplification: unlike source, this does not synthesize
    /// zero-evidence calendar-day rows for a scoped window
    /// (`reconcileEnergyDays`'s own `calendarDates` gap-filling pass) — only
    /// days that actually carry evidence appear, which is exactly the
    /// behavior source itself already uses for the unscoped "All" context.
    /// `expectedDayCount`/`partial` are still computed against the real
    /// calendar window, so a genuinely incomplete week is still correctly
    /// flagged; a week with literally zero evidence anywhere in it simply
    /// produces no row at all rather than an all-empty one.
    ///
    /// Each week's `attributedScope` is resolved from its own `weekStart`
    /// date as a representative indicator for the "All Energy" scope's
    /// mixed history — a week that straddles a Goal/Phase boundary is
    /// attributed to whichever owns its first day, the same
    /// representative-date convention already accepted for other
    /// aggregate/summary rows in this codebase.
    static func weekBuckets(days: [EnergyDayRecord], windowStart: String?, windowEnd: String?) -> [EnergyWeekRecord] {
        var groups: [String: [EnergyDayRecord]] = [:]
        for day in days {
            groups[weekStartKey(day.date), default: []].append(day)
        }
        return groups.keys.sorted().map { weekStart in
            let values = groups[weekStart] ?? []
            let weekEnd = addDays(weekStart, 6)
            let intake = values.compactMap(\.calorieIntake)
            let expenditure = values.compactMap(\.estimatedExpenditure)
            let complete = values.compactMap(\.energyBalance)
            let effectiveStart = windowStart.map { max($0, weekStart) } ?? weekStart
            let effectiveEnd = windowEnd.map { min($0, weekEnd) } ?? weekEnd
            let expectedDayCount = effectiveStart <= effectiveEnd ? daysBetweenInclusive(effectiveStart, effectiveEnd) : 0
            return EnergyWeekRecord(
                id: "energy-week-\(weekStart)", weekStart: weekStart, weekEnd: weekEnd,
                averageIntake: average(intake), averageExpenditure: average(expenditure), averageBalance: average(complete),
                completeDayCount: complete.count, evidenceDayCount: values.count, expectedDayCount: expectedDayCount,
                partial: values.count < expectedDayCount || complete.count < expectedDayCount,
                attributedScope: EvidenceChronology.attribution(forOccurrenceDate: weekStart)
            )
        }
    }

    /// `createSummary` — "Period Summary" 4 cards.
    static func summary(days: [EnergyDayRecord]) -> EnergySummary {
        EnergySummary(
            averageIntake: average(days.compactMap(\.calorieIntake)),
            averageExpenditure: average(days.compactMap(\.estimatedExpenditure)),
            averageBalance: average(days.compactMap(\.energyBalance)),
            completeDays: days.filter { $0.energyBalance != nil }.count,
            evidenceDays: days.count
        )
    }

    /// `getRecentFourWeeklyEnergy`, re-ordered ascending to match what the
    /// web's own `EnergyWeeklyChart` actually renders left-to-right after
    /// its own `[...weeks].reverse()` — the latest 4 weeks in the scoped
    /// window, oldest of the four first.
    static func recentFourWeeks(_ weeksAscending: [EnergyWeekRecord]) -> [EnergyWeekRecord] {
        Array(weeksAscending.suffix(4))
    }

    /// `filterWeeklyEnergyByRange`/`resolveLongRangeWindow` — narrows to the
    /// last N calendar months counted back from the latest week's own
    /// `weekEnd`, or everything for `.all`. Shared `EvidenceChartRange`
    /// type/semantics with Nutrition Reporting's own charts (see that
    /// type's doc comment).
    static func rangeFiltered(weeksAscending: [EnergyWeekRecord], range: EvidenceChartRange) -> [EnergyWeekRecord] {
        guard let months = range.months, let latest = weeksAscending.map(\.weekEnd).max() else { return weeksAscending }
        guard let latestDate = TrainingDateFormatting.date(from: latest),
              let cutoff = utcCalendar.date(byAdding: .month, value: -months, to: latestDate) else { return weeksAscending }
        let cutoffKey = dateKeyFormatter.string(from: cutoff)
        return weeksAscending.filter { $0.weekEnd >= cutoffKey }
    }

    /// Assembles the full scoped report — the one entry point
    /// `FixtureEnergyAPI` calls.
    static func report(
        allDays: [EnergyDayFixture], scope: EvidenceScopeSelection, allLabel: String, dataSources: [EnergyDataSource]
    ) -> EnergyReportReadModel {
        let scopedFixtures = EvidenceChronology.filter(allDays, scope: scope, date: \.date)
        let scopedDaysAscending = scopedFixtures.map(dayRecord).sorted { $0.date < $1.date }
        let window = EvidenceChronology.dateWindow(selected: scope)
        let windowStart = window.start ?? scopedDaysAscending.first?.date
        let windowEnd = window.end ?? scopedDaysAscending.last?.date
        let weeksAscending = weekBuckets(days: scopedDaysAscending, windowStart: windowStart, windowEnd: windowEnd)

        return EnergyReportReadModel(
            title: "Energy", heading: "Energy Balance", subtitle: "Intake and expenditure over time.",
            scope: EvidenceChronology.scopeContext(selected: scope, allLabel: allLabel),
            summary: summary(days: scopedDaysAscending),
            weeklyTrend: weeksAscending,
            recentFourWeeks: recentFourWeeks(weeksAscending),
            weeklyHistory: weeksAscending.reversed(),
            dailyHistory: scopedDaysAscending.reversed(),
            dataSources: dataSources
        )
    }
}
