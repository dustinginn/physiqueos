import Foundation

// MARK: - Training Reporting (`/progress/training/reporting/:reportId`)
//
// Mirrors `getReportingContent` (`TrainingKnowledgeScreen.jsx`) exactly:
// `reportId` is a closed 6-value set (`getTrainingReportingLinks()` —
// resistance, cardio, volume, frequency, consistency, history). Verified
// directly from source that only Resistance and History have real content;
// Cardio/Volume/Frequency/Consistency all fall through to an identical
// static "Foundation" placeholder card today — porting more than that
// placeholder for those four would be inventing analytics the web itself
// does not have.

struct TrainingReportingReadModel: Identifiable {
    var id: String
    var eyebrow: String
    var title: String
    var summary: String
    /// Populated only for `cardio`/`volume`/`frequency`/`consistency` —
    /// the literal "Foundation" card body text every one of those pages
    /// shows verbatim on the web today.
    var placeholderBody: String?
    /// Populated only for `resistance`.
    var resistance: TrainingResistanceReportReadModel?
    /// Populated only for `history` — reuses `TrainingDayReadModel` as-is
    /// (date/label/summary/sessions), the same shape `TrainingDayView`
    /// already renders, since `TrainingDayHistoryCard`'s per-day/per-
    /// session fields are identical to what that type already carries.
    var historyDays: [TrainingDayReadModel]?
}

/// `getResistanceReportingContent`'s section data — a fixture-backed
/// *presentation* of already-classified status/PR/rollup facts, not a
/// port of the web's 800+-line detection engine
/// (`TrainingPerformanceIntelligenceService.js`). Native supplies these as
/// synthetic pre-classified fixture facts, exactly the same way every
/// other Training screen already treats server-computed strings (e.g. a
/// session's `detail` line) as given, not re-derived from raw sets.
struct TrainingResistanceReportReadModel {
    /// Improving / Stable / Plateauing / Regressing, in that order —
    /// `StatusDrawers`' four fixed categories.
    var statusGroups: [TrainingResistanceStatusGroup]
    /// `getRecentPrs` — derived from the same `TrainingPerformanceEvent`
    /// fixture data `TrainingExerciseDetailReadModel.performanceRecords`
    /// uses, not a separate/duplicated PR list.
    var recentPrs: [TrainingReportingLinkRow]
    var highlights: [TrainingReportingLinkRow]
    var needsAttention: [TrainingReportingLinkRow]
    /// `CategoryRollups` — reuses the same 10 canonical areas the
    /// Training landing page's own "Training Areas" grid already shows.
    var categoryRollups: [TrainingReportingLinkRow]
}

struct TrainingResistanceStatusGroup: Identifiable {
    var label: String
    var items: [TrainingReportingLinkRow]

    var id: String { label }
    var count: Int { items.count }
}

/// A generic label/detail/destination row — reused across Recent PRs,
/// Highlights, Needs Attention, Category Rollups, and each status group's
/// drill-down list, matching how the web's own `AnalysisLink`/
/// `InformationListItem` rows are similarly interchangeable across these
/// sections.
struct TrainingReportingLinkRow: Identifiable {
    var id: String
    var label: String
    var detail: String?
    var destination: AppDestination
}
