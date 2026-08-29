import Foundation

/// Native transport mirror of the web's Training evidence/history read
/// models. The web itself keeps three separate, independently-shaped
/// projections rather than one unified canonical model:
///
/// - the list/hub page's `trainingDays`
///   (`ProgressReportingService.getTrainingReportExtras`,
///   `src/domain/services/ProgressReportingService.js:907-990`, `:1143-1169`),
/// - the day page's `TrainingReadService.getDay`
///   (`src/application/training/TrainingReadService.js:25-113`), and
/// - the session-detail page's flat `TrainingSessionRecord`, enriched with
///   the underlying canonical `exercises`/`exerciseRelationshipGroups`
///   (`ProgressReportingService.js:1116-1141`,
///   `src/domain/models/trainingSessionEvidence.js:3098-3212`,
///   `src/domain/models/trainingExerciseRelationship.js`).
///
/// This file mirrors that same three-projection shape — deliberately not a
/// second, unified Swift canonical workout model — and only covers the
/// read-only history/detail vertical this slice implements. Live Workout
/// and the Training Logger's write-path/draft state are out of scope (see
/// `AppDestination.trainingLogger`).

// MARK: - Training landing page (`/progress/training`)
//
// Mirrors `ProgressPlaceholderScreen.jsx`'s `report.id === "training"`
// render path field-for-field: `TrainingEvidenceContext` (the scope
// selector) + `TrainingEvidenceReport` (the section list — Latest Training
// Day, Training Areas, Reporting, Recent Training History, Current
// Protocol, Related Goals, Data Sources). `report.trainingOverview` and
// `report.trainingUnderstanding` are real fields on the server's object
// but are never rendered by this screen — confirmed by reading
// `TrainingEvidenceReport` directly — so they are intentionally absent
// here rather than carried forward as a native-only "Overview" dashboard.

struct TrainingLandingReadModel: Codable, Equatable {
    /// `report.title` — "Training".
    var title: String
    /// `report.subtitle` — genuinely absent on the server's stream object
    /// for every stream (`buildProgressHub` never sets it); the header
    /// falls back to `"What PhysiqueOS currently understands."`
    /// (`ProgressPlaceholderScreen.jsx:73`), which the view applies when
    /// this is `nil` rather than the fixture repeating server behavior.
    var subtitle: String?
    /// `report.tone` — drives the header `IconBadge`'s color.
    var tone: HomeColorToken
    /// `evidenceContext` — `TrainingEvidenceContextService`'s scope
    /// selector ("Build Lean Mass" / "Visible Abs" / "All Training").
    var scope: TrainingScopeContext
    /// `report.latestTrainingDay` — `nil` when no training evidence exists
    /// yet (`LatestTrainingDayCard`'s own empty state).
    var latestTrainingDay: TrainingLandingDay?
    /// `report.trainingBreakdowns` projected through
    /// `getTrainingAreaNavigationGroups` — always the 10 canonical
    /// muscle-group categories, each with its own exercise count.
    var trainingAreas: [TrainingAreaSummary]
    /// `report.reportingLinks` — `getTrainingReportingLinks()`.
    var reportingLinks: [TrainingReportingLink]
    /// `report.trainingDays` — used for the "Recent Training History"
    /// preview (`trainingDays[0]`) and its "Show All" sheet.
    var trainingDays: [TrainingDaySummary]
    /// `report.currentProtocol`.
    var currentProtocol: TrainingProtocolSummary
    /// `report.relatedGoals`.
    var relatedGoals: [TrainingRelatedGoal]
    /// `report.sourceEvidence` — capped to 5 server-side
    /// (`TrainingSourceMetadataFooter`'s `items.slice(0, 5)`).
    var sourceEvidence: [TrainingSourceEvidenceItem]
}

/// `TrainingTimelineSelector`'s own props: `timeline.options` and
/// `timeline.dateRangeLabel` are the only fields it renders — the richer
/// `TrainingEvidenceContextService` object (`goalId`, `startDate`, `type`,
/// …) exists server-side but is not part of what this screen displays.
struct TrainingScopeContext: Codable, Equatable {
    var options: [TrainingScopeOption]
    var dateRangeLabel: String
}

struct TrainingScopeOption: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var selected: Bool
}

/// The "Latest Training Day" card's data — distinct from `TrainingDaySummary`
/// below (which only needs a row's worth of fields for the history
/// list/sheet): this card renders every session's own label/value/detail/
/// date/sourceEvidence, matching `RecordPreview`'s per-entry fields.
struct TrainingLandingDay: Codable, Equatable {
    var date: String
    var label: String
    /// Mirrors `getTrainingDaySummary(sessions)` — the exercise-navigation-
    /// category + activity-classification summary ("Chest · Triceps ·
    /// Walking"), precomputed the same way every other native read model
    /// carries server-formatted display strings rather than recomputing
    /// them client-side. `nil` when no exercises/activities resolve to a
    /// label, matching the web's own `daySummary && (...)` conditional.
    var daySummary: String?
    /// "View Training Day →" action.
    var destination: AppDestination
    var sessions: [TrainingSessionPreview]
}

/// A `RecordPreviewItem`-shaped session row — the same fields
/// `getTrainingRecords` produces, minus `exercises`/
/// `exerciseRelationshipGroups` (unused by this card; see
/// `TrainingSessionDetailReadModel` for the full session-detail shape).
struct TrainingSessionPreview: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var value: String
    var detail: String
    var date: String
    var sourceEvidence: [String]
    var destination: AppDestination
}

/// `getTrainingAreaNavigationGroups`'s per-category row
/// (`ProgressPlaceholderScreen.jsx:983-1010`) — always the 10 canonical
/// `TRAINING_AREA_NAV_GROUPS`, each carrying its own resolved exercise
/// count (`nil` detail when the count is zero, matching
/// `count ? "{count} exercises" : null`).
struct TrainingAreaSummary: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var exerciseCount: Int
    var destination: AppDestination
}

/// `getTrainingReportingLinks()` — always these exact 5 links today.
struct TrainingReportingLink: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var detail: String
    var destination: AppDestination
}

/// `report.currentProtocol` — static, server-authored copy
/// (`getTrainingReportExtras`), not derived from Founder data.
struct TrainingProtocolSummary: Codable, Equatable {
    var sourceOfTruth: String
    var dailyActivityTarget: String
    /// `CurrentProtocolCard`'s "Training objective" row —
    /// `protocol.resistanceTraining` server-side.
    var trainingObjective: String
    var goal: String
}

/// `getRelatedGoals`'s `{id, title, href}` shape — `href` always resolves
/// to `goal.detail`, so this reuses `AppDestination.goalDetail` rather
/// than inventing a new destination case.
struct TrainingRelatedGoal: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var destination: AppDestination
}

/// `getTrainingSourceEvidence`'s `{id, label, date, sources}` shape.
/// `date` is a genuine field on the server object but is not rendered by
/// `TrainingSourceMetadataFooter` (verified directly from source) — kept
/// here for field-for-field fidelity, unused by the view.
struct TrainingSourceEvidenceItem: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var date: String
    var sources: [String]
}

/// The list page's per-day row (`getTrainingDays`,
/// `ProgressReportingService.js:1143-1169`) — used for
/// `report.trainingDays` (the "Recent Training History" preview + its
/// "Show All" sheet). `summary` holds the same `getTrainingDaySummary`
/// text `TrainingLandingDay.daySummary` does — confirmed by reading
/// `TrainingDayHistoryPreview` and `TrainingHistorySheet` directly, both
/// call `getTrainingDaySummary(day.sessions)` rather than the server
/// object's separate (and, on this screen, never-rendered) `"N session(s)"`
/// `summary` field.
struct TrainingDaySummary: Codable, Equatable, Identifiable {
    var date: String
    var label: String
    var summary: String?
    var destination: AppDestination

    var id: String { date }
}

// MARK: - Training Day (`/progress/training/day/:date`)

/// `TrainingReadService.getDay`'s projection — distinct field names from
/// the list page's `TrainingDaySummary` on purpose; the web itself does
/// not unify them (`TrainingReadService.js:25-35`).
struct TrainingDayReadModel: Codable, Equatable {
    var date: String
    var label: String
    var summary: TrainingDaySummaryDetail
    var sessions: [TrainingDaySessionSummary]
}

struct TrainingDaySummaryDetail: Codable, Equatable {
    var bodyAreas: [String]
    var sessionCount: Int
    var strengthSessions: Int
    var exerciseCount: Int
    var hasWalking: Bool
    var hasCardio: Bool
}

/// `projectSessionSummary`, `TrainingReadService.js:85-113`.
struct TrainingDaySessionSummary: Codable, Equatable, Identifiable {
    var id: String
    var activityType: String
    var title: String
    var kind: TrainingSessionKind
    var exerciseCount: Int
    var bodyAreas: [String]
    var durationSeconds: Double?
    var distance: Double?
    var distanceUnit: String?
    var activeCalories: Double?
    var detail: String
    var destination: AppDestination
}

/// `classifySession`, `TrainingReadService.js:169-174`.
enum TrainingSessionKind: String, Codable {
    case strength, walking, cardio, other
}

// MARK: - TrainingSession detail (`/progress/training/session/:id`)

/// The session-detail page's data shape — `ProgressReportingService`'s
/// flat `TrainingSessionRecord` (`getTrainingRecords`), not the raw
/// canonical evidence object: `label`/`value`/`detail`/`date` are already
/// server-formatted display strings, matching exactly what
/// `TrainingKnowledgeScreen.jsx`'s session mode renders (session `mode`,
/// not a dedicated "detail" screen — verified directly from source).
struct TrainingSessionDetailReadModel: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var value: String
    var detail: String
    var date: String
    var sourceEvidence: [String]
    var exercises: [TrainingExerciseOccurrence]
    var exerciseRelationshipGroups: [TrainingExerciseRelationshipGroup]
}

/// Mirrors `normalizeTrainingExercises`'s per-occurrence shape
/// (`trainingSessionEvidence.js:3098-3151`) — the genuine canonical field
/// names, not a native re-derivation.
struct TrainingExerciseOccurrence: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var canonicalExerciseId: String?
    var executionVariant: TrainingExecutionVariant?
    var sets: [TrainingSet]
}

/// `src/domain/models/trainingExecutionVariant.js` — variants are freeform
/// captured text ("Static Hold", "3-Second Pause", "Slow Eccentric" are
/// real examples from the web's own test fixtures), not a closed enum;
/// native must not constrain this to a fixed case set.
struct TrainingExecutionVariant: Codable, Equatable {
    var key: String
    var label: String
    var rawLabel: String
}

/// Mirrors `normalizeTrainingSets` (`trainingSessionEvidence.js:3153-3212`)
/// exactly, including its snake_case canonical field names (`set_number`,
/// `weight_unit`, ...) — decoded via `TrainingAPI`'s
/// `.convertFromSnakeCase` key strategy rather than translating them into a
/// native-only shape.
struct TrainingSet: Codable, Equatable, Identifiable {
    var setNumber: Int
    var reps: Double?
    var weight: Double?
    var weightUnit: String?
    var durationSeconds: Double?
    var loadType: String?
    var setType: String?

    var id: String { String(setNumber) }
}

/// `src/domain/models/trainingExerciseRelationship.js` — the only
/// relationship type the server currently supports is `"superset"`
/// (`TRAINING_EXERCISE_RELATIONSHIP_TYPES.SUPERSET`).
struct TrainingExerciseRelationshipGroup: Codable, Equatable, Identifiable {
    var id: String
    var relationshipType: String
    var memberExerciseIds: [String]
}

// MARK: - Presentation helpers mirroring `src/presentation/trainingPresentation.js`

extension TrainingSet {
    /// Mirrors `isBodyweightSet`.
    var isBodyweight: Bool {
        weightUnit == "bodyweight" || loadType == "bodyweight" || setType == "bodyweight_reps"
    }

    /// Mirrors `formatTrainingLoad`.
    var formattedLoad: String {
        if durationSeconds != nil { return "Timed" }
        guard let weight, !isBodyweight else { return "BW" }
        return "\(Self.formatNumber(weight)) \(weightUnit ?? "lb")"
    }

    /// Mirrors the session-detail screen's own `formatSetDetail`
    /// (`TrainingKnowledgeScreen.jsx:1492-1504`).
    var formattedDetail: String {
        if let durationSeconds { return Self.formatDuration(durationSeconds) }
        let repsText = reps.map(Self.formatNumber) ?? "?"
        if isBodyweight { return "\(repsText) reps · BW" }
        return "\(repsText) reps @ \(formattedLoad)"
    }

    private static func formatNumber(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(value)
    }

    private static func formatDuration(_ seconds: Double) -> String {
        let total = Int(seconds)
        let minutes = total / 60
        let remaining = total % 60
        if minutes > 0 { return remaining > 0 ? "\(minutes)m \(remaining)s" : "\(minutes)m" }
        return "\(remaining)s"
    }
}

extension TrainingExerciseOccurrence {
    /// Mirrors `formatTrainingExerciseOccurrenceLabel`
    /// (`src/domain/models/trainingExecutionVariant.js:52-56`): the
    /// exercise name, plus " · {variant label}" only when a variant was
    /// actually captured.
    var occurrenceLabel: String {
        guard let executionVariant else { return name }
        return "\(name) · \(executionVariant.label)"
    }
}
