import Foundation

/// Native transport mirror of the web's Activity Evidence page
/// (`/progress/activity`, `ProgressPlaceholderScreen.jsx`'s
/// `report.id === "activity"` render path, backed by
/// `ActivityEvidenceContextService.getActivityTimelineReport` →
/// `ProgressReportingService.buildActivityReport`,
/// `src/domain/services/ProgressReportingService.js:726-773`). Unlike
/// Training, the web keeps Activity's "latest day" and every history row
/// as the exact same object shape (`createActivityDayRecord`,
/// `ProgressReportingService.js:1300-1328`) — this file mirrors that with
/// one shared `ActivityDayRecord` used for the Latest Activity Day card,
/// every history/"Show All" row, and the Activity Day detail screen,
/// rather than inventing separate native projections the server doesn't
/// have.
///
/// Two deliberate scoping decisions carried from the web source audit for
/// this port (see `ActivityHistoryView`'s own doc comment for the
/// navigation-shape consequences):
///
/// - `activityAreas` intentionally has no `destination` field. The live
///   web page's four "Activity Areas" rows link to
///   `/progress/activity/reporting/*` routes that do not exist in the
///   Next.js app (confirmed 404 — no backing route file, unlike
///   Nutrition/Training's own `reporting/*` pages) — a genuine product bug,
///   not ported as if it were a real destination.
/// - `report.currentActivityProtocol` and `report.relatedGoals` are real
///   fields on the server's object but are explicitly never rendered for
///   `report.id === "activity"` (verified directly against the JSX
///   conditionals and `ActivityEvidenceContextProduction.test.js`'s own
///   regression assertion that "Current Activity Protocol" does not
///   appear) — intentionally absent from this read model rather than
///   carried forward unused.
struct ActivityLandingReadModel: Codable, Equatable {
    /// `report.title` — "Activity".
    var title: String
    /// `report.subtitle` — "Whole-day movement, energy output, and daily
    /// activity context."
    var subtitle: String
    /// `report.tone` — drives the header `IconBadge`'s color: `.success`
    /// once a latest day exists, `.effort` otherwise.
    var tone: HomeColorToken
    /// `evidenceContext` — the same "Build Lean Mass" / "Visible Abs" /
    /// "All Activity" scope selector every other Evidence stream shows.
    /// `getActivityTimelineReport` calls the shared
    /// `getTrainingEvidenceContext` purely as a date-window mechanism for
    /// Activity's own use — nothing Training-specific is baked into the
    /// selector itself, so this reuses `TrainingScopeContext`/
    /// `TrainingScopeSelectorView` directly rather than a parallel type.
    var scope: TrainingScopeContext
    /// `report.latestActivityDay` — `nil` when no Activity evidence exists
    /// yet (`LatestActivityDayCard`'s own empty state).
    var latestActivityDay: ActivityDayRecord?
    /// `report.activityAreas` — "Active Calories / Exercise Minutes /
    /// Workout Activity / Non-Workout Activity". See the type doc comment
    /// above: rendered as informational rows, not navigable.
    var activityAreas: [ActivityAreaSummary]
    /// `report.linkedTrainingContext` — same-day workout preview
    /// (`RecordPreview` entries), or empty when no workouts are linked.
    /// Non-clickable on the web (`RecordPreview` renders plain rows here,
    /// not links) — ported the same way.
    var linkedTrainingContext: [ActivityTrainingContextEntry]
    /// `report.activityHistory` — every known Activity day, already
    /// reverse-chronological (newest first), matching
    /// `getActivityDayRecords()`'s own `.reverse()` ordering. The view
    /// slices this into a preview (`ActivityHistoryView.historyPreviewLimit`,
    /// mirroring `ACTIVITY_HISTORY_PREVIEW_LIMIT`) plus a "Show All" sheet.
    var activityHistory: [ActivityDayRecord]
    /// `report.dataSources` — `getDataSources("activity")`, always these
    /// same 4 rows today.
    var dataSources: [ActivityDataSource]
}

/// `getActivityAreas()`'s per-row shape — deliberately no `destination`
/// field (see the type-level doc comment above).
struct ActivityAreaSummary: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var value: String
}

/// A `RecordPreview` entry inside "Linked Training Context" — the same
/// session-preview fields Training's own `RecordPreview` rows carry
/// (compare `TrainingSessionPreview`), minus a `destination` since these
/// rows are non-clickable on the web.
struct ActivityTrainingContextEntry: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var value: String
    var detail: String
    var date: String
    var sourceEvidence: [String]
}

/// `getDataSources("activity")`'s `{name, status}` pairs — status
/// vocabulary across the app is `"Connected" | "Suggested" | "Future" |
/// "Context"`, rendered as plain text with no color-coding (verified
/// directly against `EvidenceReportContext.jsx`'s `DataSourcesCard`).
struct ActivityDataSource: Codable, Equatable, Identifiable {
    var name: String
    var status: String

    var id: String { name }
}

/// `createActivityDayRecord()`'s output shape
/// (`ProgressReportingService.js:1300-1328`) — used identically for the
/// Latest Activity Day card, every "Recent Activity History"/"Show All"
/// row, and the Activity Day detail screen. `exerciseGoal`, `standGoal`,
/// and `ringCompletion` are genuine fields on the server object but are
/// never rendered by the live `ActivityMetricGrid` (verified directly from
/// source) — decoded here for field-for-field fidelity, intentionally
/// unused by `metricTiles` below, the same "field exists, screen doesn't
/// render it" pattern already documented on
/// `TrainingLandingReadModel.trainingOverview`.
struct ActivityDayRecord: Codable, Equatable, Identifiable {
    var id: String
    /// `"Daily Activity"` — carried for field-for-field fidelity; no
    /// current Native screen renders it (the Native headers use their own
    /// section titles, matching how the web's own Latest/History
    /// components never surface this label either).
    var label: String
    /// Already server-formatted: `"{move_calories} active cal / {N} min"`.
    var value: String
    /// Already server-formatted: `"{total} total calories · {N} workouts
    /// linked · {non-workout} non-workout active cal"`.
    var detail: String
    /// A bare `yyyy-MM-dd` calendar-day key — Activity days are date-only,
    /// never a full timestamp (see `ActivityDayView`'s and
    /// `ActivityHistoryView`'s use of `TrainingDateFormatting`/
    /// `TrainingDayView.formatCompactDate`, both UTC-anchored so this key
    /// is never reinterpreted through a local-timezone midnight shift).
    var date: String
    var isToday: Bool
    var activeCalories: Double?
    var totalCalories: Double?
    var exerciseMinutes: Double?
    var standHours: Double?
    var moveGoal: Double?
    var exerciseGoal: Double?
    var standGoal: Double?
    var ringCompletion: ActivityRingCompletion?
    var workoutActiveCalories: Double?
    var nonWorkoutActiveCalories: Double?
    var linkedTrainingSessionCount: Int
    /// Already server-formatted interpretive copy — the only claim-like
    /// text on the live Activity Evidence page (e.g. `"153 active calories
    /// above the recorded daily target."`, or the neutral `"Activity
    /// context available."` when no target is recorded). A plain `String`
    /// carrying pre-formatted server copy, matching the established
    /// Contracts idiom for server-derived presentation fields (see
    /// `TrainingExerciseBenchmark.comparison`) — never recomputed from the
    /// numeric fields above.
    var protocolStatus: String
}

/// `daily_activity.ring_completion` — move/exercise/stand completion
/// percentages. Decoded for fidelity; not rendered anywhere on the live
/// Activity Evidence page today (the only place in the web codebase that
/// renders these at all is the non-live `/lab/narrative-engine` dev tool,
/// as plain text, not a ring — confirmed directly from source).
struct ActivityRingCompletion: Codable, Equatable {
    var move: Double?
    var exercise: Double?
    var stand: Double?
}

/// One tile in `ActivityMetricGridView` — mirrors `ActivityMetricGrid`'s
/// `metrics` array (`ProgressPlaceholderScreen.jsx:564-575`) exactly: 8
/// tiles, in this order. There is no "Steps" tile on the current
/// production page — verified directly from source; the app's own
/// intake/OCR sandbox uses an unrelated Active/Exercise/Steps/Stand
/// vocabulary for a different, Logging-side concept, not this canonical
/// read model.
struct ActivityMetricTile: Identifiable, Equatable {
    var label: String
    var value: String

    var id: String { label }
}

extension ActivityDayRecord {
    /// Mirrors `formatOptionalCalories`/`formatOptionalMinutes`/
    /// `formatOptionalHours` exactly: `"{n} cal"` / `"{n} min"` / `"{n}
    /// hr"`, or `"Pending"` when the value isn't present/finite. These are
    /// genuinely computed client-side from raw numeric fields on the web
    /// too (`ActivityMetricGrid` is itself a small presentation component
    /// over the same record), so replicating the formatting here — rather
    /// than shipping eight pre-formatted strings — matches the same
    /// read/transport boundary the web itself uses.
    var metricTiles: [ActivityMetricTile] {
        [
            ActivityMetricTile(label: "Active Calories", value: Self.formatCalories(activeCalories)),
            ActivityMetricTile(label: "Total Calories", value: Self.formatCalories(totalCalories)),
            ActivityMetricTile(label: "Exercise Minutes", value: Self.formatMinutes(exerciseMinutes)),
            ActivityMetricTile(label: "Stand Hours", value: Self.formatHours(standHours)),
            ActivityMetricTile(label: "Workout Calories", value: Self.formatCalories(workoutActiveCalories)),
            ActivityMetricTile(label: "Non-Workout Calories", value: Self.formatCalories(nonWorkoutActiveCalories)),
            ActivityMetricTile(label: "Move Goal", value: Self.formatCalories(moveGoal)),
            ActivityMetricTile(label: "Linked Workouts", value: String(linkedTrainingSessionCount)),
        ]
    }

    private static func formatCalories(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return "\(formatNumber(value)) cal"
    }

    private static func formatMinutes(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return "\(formatNumber(value)) min"
    }

    private static func formatHours(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "Pending" }
        return "\(formatNumber(value)) hr"
    }

    private static func formatNumber(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }
}
