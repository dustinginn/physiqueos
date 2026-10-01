import Foundation

/// Native transport mirror of the web's live Energy Evidence experience
/// (`/progress/energy`, `EnergyEvidenceScreen.jsx` ←
/// `getEnergyEvidenceReport` in `src/domain/services/EnergyEvidenceService.js`).
/// Unlike DEXA/Weight, Energy has genuinely **one page and no sub-routes at
/// all** — confirmed by this port's audit: `src/app/progress/energy/`
/// contains only `page.js` and its own regression test, no nested
/// directories or dynamic segments. Week/day drill-down is in-page (a
/// "Show All" sheet plus each chart's own point-selection detail panel),
/// not separate routes — the same Native pattern already established for
/// Weight/DEXA's own single-page verticals.
///
/// A completely separate concept lives elsewhere and is deliberately NOT
/// built here: **Operating Plan → Energy Strategy**
/// (`/profile/operating-plan/strategy/energy/[protocolId]`, "Current Energy
/// Strategy" / "Maintenance Calibration" / phase-mode copy). This is not a
/// scope cut — it is the real, audited web architecture: a dedicated
/// regression test (`EnergyEvidenceScreen.test.js`) asserts the *Evidence*
/// page never renders "Current Energy Strategy", "Maintenance Calibration",
/// "Related Goals", "View Strategy", or any interpretive/coaching phrasing
/// ("on track", "increase calories"). Energy Evidence is pure deterministic
/// arithmetic over raw intake/activity/DEXA-RMR data — no OpenAI/PI call
/// exists anywhere in its dependency chain.
struct EnergyReportReadModel: Equatable {
    /// `"Energy"` — the eyebrow above `"Energy Balance"`.
    var title: String
    /// `"Energy Balance"` — the page's own `<h1>`.
    var heading: String
    /// `"Intake and expenditure over time."`
    var subtitle: String
    /// The "Viewing" context selector — Energy reuses Training's own
    /// context/chronology service verbatim on web
    /// (`getActivityTimelineReport`-adjacent `getTrainingEvidenceContext`),
    /// so this is the same shared `TrainingScopeContext`/
    /// `EvidenceChronology` Goal+contextual-Phase pattern every other
    /// Evidence vertical uses — not a bespoke Energy filter.
    var scope: TrainingScopeContext
    /// "Period Summary" — 4 cards, always present.
    var summary: EnergySummary
    /// "Energy Over Time" — weekly average intake/estimated-expenditure,
    /// ascending by week, full scoped history (the chart's own 1M/3M/6M/1Y/
    /// All range selector narrows this client-side, mirroring
    /// `resolveLongRangeWindow`'s equivalent already established for
    /// Nutrition Reporting).
    var weeklyTrend: [EnergyWeekRecord]
    /// "Weekly Energy Balance" — `getRecentFourWeeklyEnergy`'s own latest-4
    /// slice, ascending (oldest of the four first, matching the web's own
    /// left-to-right bar order).
    var recentFourWeeks: [EnergyWeekRecord]
    /// "Weekly History" — newest first, full scoped history.
    var weeklyHistory: [EnergyWeekRecord]
    /// "Recent Daily Energy" — newest first, full scoped history.
    var dailyHistory: [EnergyDayRecord]
    var dataSources: [EnergyDataSource]
}

/// `createSummary(days)` — 4 cards, `nil` averages render as "Not
/// available" (`formatCalories`/`formatSignedCalories`'s own null case).
struct EnergySummary: Codable, Equatable {
    var averageIntake: Double?
    var averageExpenditure: Double?
    var averageBalance: Double?
    var completeDays: Int
    var evidenceDays: Int
}

/// `createActivityDayRecord`-sibling for Energy: `reconcileEnergyDays`'
/// per-day output shape, attributed via the shared chronology like every
/// other Evidence history row.
struct EnergyDayRecord: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    /// `day.calorieIntake` — canonical raw (the selected nutrition day's
    /// logged total), `nil` when no nutrition evidence exists for the date.
    var calorieIntake: Double?
    /// `day.activeCalories` — canonical raw (the activity day's move
    /// calories), `nil` when no activity evidence exists for the date.
    var activeCalories: Double?
    /// `day.estimatedExpenditure` — server-derived: `rmr + activeCalories`
    /// when both are present, `nil` otherwise (`finalizeRow`,
    /// `EnergyDailyReconciliationService.js`). Web never shows a raw Apple
    /// Health "total calories" figure — this estimated figure is the only
    /// expenditure value that exists on this page.
    var estimatedExpenditure: Double?
    /// `day.energyBalance` — server-derived: `calorieIntake -
    /// estimatedExpenditure` when both are present, `nil` otherwise. Never
    /// color-coded by sign on the live page (verified directly from
    /// source: `getEnergyMetricValueClass` uses one fixed neutral class for
    /// "balance" regardless of value) — Native mirrors that neutrality.
    var energyBalance: Double?
    /// `"complete" | "nutrition-only" | "activity-only" | "missing-rmr" |
    /// "no-paired-evidence"` — `finalizeRow`'s own completeness
    /// classification, verbatim.
    var completeness: String
    var attributedScope: EvidenceScopeAttribution? = nil
}

/// `aggregateEnergyWeeks`'s own output shape — Sunday–Saturday buckets.
struct EnergyWeekRecord: Codable, Equatable, Identifiable {
    var id: String
    var weekStart: String
    var weekEnd: String
    var averageIntake: Double?
    var averageExpenditure: Double?
    var averageBalance: Double?
    var completeDayCount: Int
    var evidenceDayCount: Int
    var expectedDayCount: Int
    /// `values.length < expectedDayCount || complete.length < expectedDayCount`
    /// — a week clipped by the scope's own boundary correctly expects fewer
    /// days, so a short week at a Goal/Phase edge isn't misflagged partial.
    var partial: Bool
    var attributedScope: EvidenceScopeAttribution? = nil
}

struct EnergyDataSource: Codable, Equatable, Identifiable {
    var name: String
    var status: String

    var id: String { name }
}

// MARK: - Raw canonical fixture shape

/// The raw, unscoped canonical daily record `EnergyEvidenceCalculator`
/// derives every scoped `EnergyReportReadModel` from — mirrors
/// `WeightEntryFixture`/`DEXACanonicalScanFixture`'s own "raw entries in,
/// scoped+derived report out" convention.
///
/// `rmr` is fixtured directly per day rather than re-deriving
/// `resolveHistoricalRmr`'s DEXA-scan-lookback carry-forward in Swift: the
/// server already resolves "most recent prior DEXA scan's RMR, carried
/// forward" into this per-day value before it ever reaches a report, so
/// fixturing the resolved value (like every other raw-entry fixture in this
/// codebase) is the correct read/transport boundary — recomputing the
/// lookback itself in Swift would be reaching past this boundary to
/// re-derive something the server already resolved, not "mirroring server
/// ownership."
struct EnergyDayFixture: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var calorieIntake: Double?
    var activeCalories: Double?
    /// `hasActivity = activityDayId != null` on the server — an Activity
    /// day record can exist for a date with `activeCalories` still `nil`
    /// (an uploaded-but-incomplete day), which is exactly what
    /// distinguishes `"activity-only"` from `"no-paired-evidence"` in
    /// `finalizeRow`'s completeness rule. Decoded separately from
    /// `activeCalories` for that reason.
    var hasActivityRecord: Bool
    var rmr: Double?
}
