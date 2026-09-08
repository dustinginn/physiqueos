import Foundation

/// Native transport mirror of the web's live Weight Evidence page
/// (`/progress/weight`, `WeightReportScreen.jsx` ←
/// `WeightEvidenceContextService.getWeightTimelineReport` →
/// `ProgressReportingService.getWeightReport`). Unlike every other Evidence
/// vertical ported so far, Weight has **no day/detail route on the web at
/// all** — verified directly from source (no backing route file, and
/// history rows render as plain non-`Link` `<div>`s) — so this one read
/// model covers the entire page: landing, history, and trend, with no
/// separate day-detail projection to define.
///
/// This is also the one vertical where "port faithfully" deliberately does
/// **not** mean "add the missing pieces a Founder might expect": the
/// Highest/Lowest cards are a hardcoded, contextId-keyed lookup table on
/// the web — NOT derived from any goal-direction property — and streaks/
/// Related Goals are test-enforced absent. See `WeightEvidenceCalculator.swift`
/// for the literal branch this port reproduces rather than "fixes."
struct WeightReportReadModel: Codable, Equatable {
    /// `report.title` — "Weight".
    var title: String
    /// `report.subtitle` — "Weight evidence over time." (verified literal
    /// string from source, unlike Nutrition's unconfirmed one).
    var subtitle: String
    var scope: TrainingScopeContext
    /// `report.summary` — exactly 4 cards, whose labels/values depend on
    /// the selected scope (see `WeightEvidenceCalculator.summary`).
    var summary: [WeightSummaryCard]
    var chart: WeightChartData
    /// `report.weeklyAverages` — newest-first (`orderWeeklyAveragesNewestFirst`),
    /// capped to the last 6 weeks server-side.
    var weeklyAverages: [WeightWeeklyAverage]
    /// `report.history` — every scoped weight point, reversed (newest
    /// first), matching the web's own `[...points].reverse()`.
    var history: [WeightHistoryEntry]
    var dataSources: [WeightDataSource]
}

/// `summaryMetric`/`summaryChange`'s rendered output — plain label+value;
/// no icon/tone, matching `WeightReportScreen.jsx`'s literal `<Card>` grid.
struct WeightSummaryCard: Codable, Equatable, Identifiable {
    var label: String
    var value: String

    var id: String { label }
}

struct WeightChartPoint: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var value: Double?
    /// Already server-formatted: `"{value} {unit}"`, e.g. `"167.0 lb"`.
    var label: String
    /// `"Morning weight"` | `"Different weigh-in conditions"` —
    /// `weightEntry.context.isDefault`-driven, matching the history row's
    /// own `detail` field exactly (the same field, reused for both the
    /// chart point and the history row, as the web does).
    var detail: String
}

/// `chart.markers` — DEXA scan dates. `label` is decoded for field-for-
/// field fidelity but, matching the live web chart exactly, is never
/// rendered as visible text — `ProgressLineChart.jsx` draws only a dashed
/// guideline with no `<text>` element and no legend (verified directly
/// from source). The native chart reproduces that same unlabeled-guideline
/// look rather than inventing a label the real product doesn't show.
struct WeightChartMarker: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var label: String
}

struct WeightChartData: Codable, Equatable {
    var points: [WeightChartPoint]
    var markers: [WeightChartMarker]
}

/// `getWeeklyAverages`'s per-week row. `isBaseWeek` mirrors the web's own
/// "Base" label for the oldest week shown (`weekOverWeek == nil`), kept as
/// its own explicit flag rather than inferring "oldest" from array order,
/// since `weeklyAverages` here is already newest-first for display.
struct WeightWeeklyAverage: Codable, Equatable, Identifiable {
    var week: String
    var average: Double
    var weekOverWeek: Double?
    var isBaseWeek: Bool
    var entryCount: Int

    var id: String { week }
}

/// A `history` row — plain (non-navigating) on the web, matching
/// `WeightReportScreen.jsx:108-131`'s bare `<div>`s: no delta-per-row, no
/// id-based link. `attributedScope` is decoded/displayed for Goal/Phase
/// chronology fidelity even though there is no detail screen to push to.
struct WeightHistoryEntry: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var detail: String
    var value: String
    var attributedScope: EvidenceScopeAttribution? = nil
}

struct WeightDataSource: Codable, Equatable, Identifiable {
    var name: String
    var status: String

    var id: String { name }
}

/// The raw, unscoped weight entry — the fixture's source of truth that
/// `WeightEvidenceCalculator` derives every scoped `WeightReportReadModel`
/// from, mirroring `weightEntry.js`'s canonical shape closely enough for
/// this port's purposes (full `context`/`source`/`fieldProvenance` detail
/// is not consumed by the live Weight Evidence page and is not carried
/// here, matching the established "decode what a screen actually renders"
/// convention already used throughout this codebase).
struct WeightEntryFixture: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var value: Double
    var unit: String
    /// `context.isDefault` — `true` for the ordinary "Morning weight" case,
    /// `false` for a flagged "Different weigh-in conditions" entry.
    var isDefaultConditions: Bool
}

/// A DEXA scan's minimal weight-chart-relevant fields — `measuredAt` only;
/// the rest of a real DEXA scan record (body fat %, lean/fat mass, ...) is
/// a separate stream (`/progress/dexa`) this fixture does not duplicate.
struct DEXAScanFixture: Codable, Equatable, Identifiable {
    var id: String
    var date: String
}
