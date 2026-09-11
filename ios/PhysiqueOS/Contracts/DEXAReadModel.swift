import Foundation

/// Native transport mirror of the web's live DEXA Evidence page
/// (`/progress/dexa`, `DEXAReportScreen.jsx` ←
/// `DEXAEvidenceContextService.getDEXATimelineReport` →
/// `ProgressReportingService.buildDEXAReport`/`getDEXAReport`). This one
/// page IS both the scan-history list and the latest-scan detail/report —
/// there is no separate per-scan detail route on the web (confirmed by
/// this port's audit).
///
/// Two real, additional live DEXA surfaces exist on web and are
/// deliberately NOT ported in this pass:
///
/// - `/briefings/dexa/[scanId]` (+ its historical twin
///   `/briefings/review/[artifactId]`) — the "DEXA Event" narrative
///   comparison story. This is a Briefings-namespaced surface (server-
///   composed, OpenAI-adjacent editorial narrative, a goal-phase-review
///   decision UI) and falls under this task's own explicit "do not build
///   Briefing surfaces, do not trigger Events" instruction — the same
///   carve-out already applied to Photo Event Briefings. The much simpler
///   inline "since prior scan" delta shown directly ON `/progress/dexa`
///   itself (`DEXADelta` below) IS part of this page and IS ported.
/// - `/profile/operating-plan/execution/dexa` (next-DEXA-appointment
///   scheduling) — this belongs to the Operating Plan vertical (already
///   its own established Native surface), not Evidence; out of scope for
///   an Evidence-vertical pass.
///
/// Two fields `buildDEXAReport` computes but the live screen never
/// renders — `relatedGoals` (computed, never passed to
/// `EvidenceReportContext`) and `latestMuscleBalance` (computed,
/// zero references in `DEXAReportScreen.jsx`) — are correctly absent
/// here too, matching the established "field exists, screen doesn't
/// render it, so neither does this port" convention already used for
/// Activity's `currentActivityProtocol`.
struct DEXAReportReadModel: Equatable {
    var title: String
    var subtitle: String
    var scope: TrainingScopeContext
    var latestScan: DEXALatestScan?
    /// Body Fat / Fat Mass / Lean Mass / Weight (= totalMass) / RMR —
    /// always exactly 5 cards, `"Pending"` when `latestScan == nil`,
    /// matching the web's own always-rendered-but-possibly-pending grid.
    var summary: [DEXASummaryItem]
    /// `nil` when fewer than 2 scans are in the selected scope — the
    /// delta row itself is hidden then, matching web.
    var delta: DEXADelta?
    /// "Core Trends" drawer — body fat % first, then fat/lean/total
    /// mass and RMR.
    var bodyFatTrend: DEXAMetricSeries
    var coreTrends: [DEXAMetricSeries]
    /// "Supplemental Metrics" drawer — VAT mass/volume, android/gynoid
    /// fat %, A/G ratio, BMC, Total BMD, T-score, Z-score. `preview 3`
    /// slicing happens in the view, matching web's own
    /// `latestDetails.slice(0,3)` preview.
    var supplementalDetails: [DEXADetailRow]
    var supplementalTrends: [DEXAMetricSeries]
    /// "Regional Tissue Lean/Fat Mass" drawers — arms/legs/trunk shown
    /// collapsed, android/gynoid added when expanded, matching web's own
    /// preview/full split.
    var regionalLeanTrends: [DEXAMetricSeries]
    var regionalFatTrends: [DEXAMetricSeries]
    var history: [DEXAScanHistoryRow]
    var dataSources: [DEXADataSource]
}

struct DEXALatestScan: Equatable {
    var date: String
    var sourceLabel: String
    /// Founder Production only. The server projects the private BodySpec
    /// report as an opaque Native media identity; Sandbox fixtures never
    /// manufacture one.
    var sourceMediaId: String? = nil
}

struct DEXASummaryItem: Equatable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

/// `report.delta` — `latest - previous` where `previous` is the
/// second-to-last scan in the selected scope, matching
/// `ProgressReportingService.js:693-704` exactly. All 3 fields are signed
/// (`"-1.2"` / `"+0.8"`).
struct DEXADelta: Equatable {
    var bodyFatPercentagePoints: String
    var fatMassPounds: String
    var leanMassPounds: String
}

struct DEXATrendPoint: Equatable, Identifiable {
    var id: String
    var date: String
    var value: Double?
}

/// One trend series — the shared shape every DEXA chart (Core Trends,
/// Supplemental, Regional) uses, so one chart component serves all of
/// them rather than several near-duplicates.
struct DEXAMetricSeries: Equatable, Identifiable {
    var id: String { title }
    var title: String
    var unit: String
    var points: [DEXATrendPoint]
}

struct DEXADetailRow: Equatable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

/// A "Scan History" row — reverse-chronological, matching web's own
/// `history` ordering.
struct DEXAScanHistoryRow: Equatable, Identifiable {
    var id: String
    var date: String
    var bodyFatPercentage: String
    var fatMass: String
    var leanMass: String
    var restingMetabolicRate: String
    var sourceLabel: String
    var attributedScope: EvidenceScopeAttribution? = nil
    /// Founder Production only; delivered through the authenticated media
    /// transport rather than a provider URL, filesystem path, or object key.
    var sourceMediaId: String? = nil
}

struct DEXADataSource: Codable, Equatable, Identifiable {
    var name: String
    var status: String

    var id: String { name }
}

// MARK: - Raw canonical fixture shape (mirrors dexaScan.js / DEXAContract.js)

/// The raw, unscoped canonical DEXA scan — the fixture's source of truth
/// that `DEXAEvidenceCalculator` derives every scoped
/// `DEXAReportReadModel` from. Field selection mirrors
/// `src/domain/models/dexaScan.js`'s real shape (only the fields
/// `buildDEXAReport`/`DEXAReportScreen.jsx` actually render — `visceralFat`
/// (legacy, unused) and `muscleBalance` (computed, never rendered) are
/// deliberately not carried, matching the established "decode what a
/// screen actually renders" convention).
struct DEXACanonicalScanFixture: Codable, Equatable, Identifiable {
    var id: String
    var measuredAt: String
    var totalMassLb: Double
    var bodyFatPercentage: Double
    var fatMassLb: Double
    var leanMassLb: Double
    var boneMineralContentLb: Double
    var restingMetabolicRateKcal: Double
    var visceralAdiposeTissueMassLb: Double
    var visceralAdiposeTissueVolumeIn3: Double
    var androidFatPercentage: Double
    var gynoidFatPercentage: Double
    var androidGynoidRatio: Double
    var regional: DEXARegionalAssessmentFixture
    var totalBMD: Double
    var tScore: Double
    var zScore: Double
    var sourceLabel: String
}

/// `regionalAssessment` — one `{leanMassLb, fatMassLb}` pair per region.
/// `POSE_ORDER`-equivalent display order for DEXA regions is arms → legs
/// → trunk (preview) → android → gynoid (full), matching the web drawer's
/// own preview/full split.
struct DEXARegionalAssessmentFixture: Codable, Equatable {
    var arms: DEXARegionalValueFixture
    var legs: DEXARegionalValueFixture
    var trunk: DEXARegionalValueFixture
    var android: DEXARegionalValueFixture
    var gynoid: DEXARegionalValueFixture
}

struct DEXARegionalValueFixture: Codable, Equatable {
    var leanMassLb: Double
    var fatMassLb: Double
}
