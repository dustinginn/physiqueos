import Foundation

/// Read models for the recurring-Briefing vertical (Weekly/Midweek/Monthly +
/// History + Home's latest-Briefing projection) — verified against source
/// for this task (`dailyBriefing.js`, `WeeklyNarrativeService.js`,
/// `MidweekBriefingService.js`, `MonthlyBriefingService.js`,
/// `BriefingGoalConfidencePresentationService.js`,
/// `DailyBriefingHistory.js`, `DailyBriefingRepository.js`,
/// `HomeBriefingRoutingService.js`, `HomeBriefingService.js`,
/// `BriefingReviewArtifactResolver.js`). DEXA Event and Photo Event
/// Briefings are a later batch — nothing here models the `event` cadence.
///
/// Native does not recreate server intelligence: narrative text and
/// Confidence are opaque, server-authored fields carried by fixture data,
/// never composed or scored in Swift. Sections below mirror exactly what
/// each cadence's real screen renders (verified per-cadence against
/// source) — not the full internal narrative-composition machinery, which
/// stays server-owned even conceptually.

// MARK: - Identity, cadence, lifecycle

/// The real product's cadence discriminator on the shared `dailyBriefings`
/// collection (`artifact.cadence`). `.event` (DEXA/Photo) is a later batch
/// and is deliberately not modeled here.
enum BriefingCadence: String, Codable, CaseIterable, Identifiable, Equatable {
    case daily, midweek, weekly, monthly
    var id: String { rawValue }
    var label: String {
        switch self {
        case .daily: "Daily Briefing"
        case .midweek: "Midweek Briefing"
        case .weekly: "Weekly Briefing"
        case .monthly: "Monthly Briefing"
        }
    }
}

/// `isReadableMonthlyArtifact`'s status gate, generalized across cadences
/// — an artifact's own validity, distinct from `BriefingReconciliationWorkItemStatus`
/// (which tracks a reconciliation *task*, not the artifact's readability).
enum BriefingArtifactLifecycleState: String, Codable, Equatable {
    case published
    case failed
    case inProgress = "in_progress"
    case retired
    case superseded
}

/// `getBriefingOccurrenceIdentity()` (`DailyBriefingHistory.js`) — the
/// cadence+reporting-period composite key used to detect supersession/
/// collision, distinct from the persisted artifact `id`. Modeled as a
/// plain value here (not re-derived) since it is server-computed and
/// persisted alongside the artifact in the real system.
struct BriefingOccurrenceIdentity: Codable, Equatable {
    var value: String
}

struct BriefingEvidenceWindowReadModel: Codable, Equatable {
    var id: String
    var startDate: String
    var endDate: String
    /// The date the Briefing is generated/delivered — `deliveryDate` for
    /// Monthly (1st of the following month), `briefingDate` for Midweek
    /// (Wednesday by default), the day after `endDate` for Weekly.
    var briefingDate: String
    /// `window.relativeLabel` — e.g. "this completed week",
    /// "Sunday through Tuesday", or a month name for Monthly.
    var relativeLabel: String
    var timeZone: String
}

// MARK: - Goal/Phase attribution (frozen at generation, never re-resolved)

/// The Goal/Phase context a Briefing was generated under — verified this
/// is resolved ONCE at generation time and persisted (nested inside the
/// real artifact's `goalConfidence.assessmentContext` for Weekly/Midweek,
/// or `artifact.goalContext` for Monthly) and NEVER recomputed on later
/// reads. A historical Visible Abs Briefing stays Visible Abs forever,
/// even after a Goal Transition; a Phase 1 Briefing stays Phase 1 even
/// after Phase 2 begins. Native must never run a persisted Briefing
/// artifact back through `EvidenceChronology`/`GoalPhaseChronology` — that
/// resolver is for *current*, undated-artifact contexts only (e.g. what a
/// not-yet-generated Briefing would currently be scoped to).
struct BriefingGoalAttribution: Codable, Equatable {
    var goalId: String
    var goalTitle: String
    var phaseId: String?
    var phaseName: String?
}

// MARK: - Confidence (server-owned artifact field — never computed in Swift)

/// `BriefingGoalConfidencePresentationService.js`'s persisted block shape.
/// `score`/`band` are two separate fields (a number AND a label), not one
/// enum. `delta` is computed ONCE at publication time by comparing to the
/// canonical predecessor confidence snapshot for the same goal/phase, then
/// persisted — Native must display this value verbatim, never recompute
/// it from two separately-fetched artifacts.
struct BriefingConfidenceReadModel: Codable, Equatable {
    enum MovementDirection: String, Codable, Equatable {
        case increased, decreased, held, initial
    }

    var score: Int
    /// Raw band value (e.g. `"high"`); `bandLabel` below is the exact
    /// display label, matching `ConfidenceRing`'s own titleization.
    var band: String
    var priorScore: Int?
    var delta: Int?
    var movementDirection: MovementDirection
    var primaryReason: String
    var supportingReasons: [String]
    var limitingReasons: [String]
    var unresolvedUncertainty: [String]
    var goalId: String
    var phaseId: String?
    var capturedAt: String
    /// Opaque provenance marker (`"canonical_pi_snapshot"` on web) —
    /// carried through, never interpreted.
    var source: String

    var bandLabel: String {
        switch band {
        case "high": "High Confidence"
        case "moderate": "Moderate Confidence"
        case "low": "Low Confidence"
        default: band.capitalized
        }
    }

    var movementLabel: String {
        switch movementDirection {
        case .increased: "▲ Up \(delta.map { "\($0)" } ?? "") from last assessment"
        case .decreased: "▼ Down \(delta.map { "\(abs($0))" } ?? "") from last assessment"
        case .held: "— No change from last assessment"
        case .initial: "Initial assessment"
        }
    }
}

// MARK: - Publication / revision (no draft state on web — verified)

/// `revisionProvenance` — identical schema across all three cadences.
/// On regeneration the SAME artifact id is kept (a same-id in-place
/// revision, not a new artifact); the prior content is preserved inside
/// `replacedBriefingHistory`, not deleted.
struct BriefingRevisionProvenance: Codable, Equatable {
    var priorPublicationId: String
    var priorPublicationVersion: String
    var replacementTimestamp: String
    var reason: String
}

/// A prior version of this same artifact id, preserved after a
/// regeneration — mirrors `replacedBriefingHistory[]`. Minimal shape
/// (Native does not need the full nested narrative of a superseded
/// revision to prove the "old version preserved, not deleted" contract).
struct BriefingRevisionSnapshot: Codable, Equatable, Identifiable {
    var id: String { generatedAt }
    var generatedAt: String
    var headline: String
    var replacedReason: String
}

// MARK: - Weekly content (verified section list: hero+confidence+strategy
// context, reconciliation banner, Energy, Weight, Photos, Training, Body
// Composition, Coach's Take — nothing else renders on the real screen)

struct WeeklyEnergySection: Codable, Equatable {
    var pairedDayCount: Int
    var eligibleDayCount: Int
    var averageIntakeKcal: Int
    var averageExpenditureKcal: Int
    var averageBalanceKcal: Int
    var narrative: String
    /// Per-day bars for the interactive chart — `nil` when the real
    /// screen would fall back to the static coverage-grid variant
    /// (`chart.summaryOnly`).
    var dailyBalances: [BriefingDailyEnergyPoint]?
}

struct BriefingDailyEnergyPoint: Codable, Equatable, Identifiable {
    var id: String { date }
    var date: String
    var intakeKcal: Int?
    var expenditureKcal: Int?
    var hasPairedData: Bool
}

struct WeeklyWeightSection: Codable, Equatable {
    var averageWeightLb: Double
    var changeLb: Double
    var narrative: String
}

struct WeeklyPhotosSection: Codable, Equatable {
    var narrative: String
    /// The real screen's one navigable non-back link — routes to the
    /// Photo Event Briefing, which is a later batch. Native still models
    /// the destination honestly rather than omitting the field.
    var photoEventDestination: AppDestination?
}

struct WeeklyTrainingSection: Codable, Equatable {
    var comparableCategoryCount: Int
    var improvingCount: Int
    var steadyCount: Int
    var narrative: String
}

struct WeeklyBodyCompositionSection: Codable, Equatable {
    var scanDate: String
    var bodyFatPercent: String
    var leanMassLb: String
    var fatMassLb: String
    var objective: String
    var narrative: String
}

struct WeeklyCoachTakeSection: Codable, Equatable {
    var biggestTakeaway: String
    var recommendation: String
    /// "Into Next Week" — verified plain, non-navigable numbered list on
    /// the real screen (no hrefs).
    var intoNextWeek: [String]
}

struct WeeklyBriefingContent: Codable, Equatable {
    var periodLabel: String
    var reportingRangeLabel: String
    var heroHeadline: String
    var heroBody: String
    var strategyPhaseLabel: String?
    var strategyWeekLabel: String?
    var strategyNextMilestone: String?
    var energy: WeeklyEnergySection?
    var weight: WeeklyWeightSection?
    var photos: WeeklyPhotosSection?
    var training: WeeklyTrainingSection?
    var bodyComposition: WeeklyBodyCompositionSection?
    var coachTake: WeeklyCoachTakeSection
}

// MARK: - Midweek content (verified DISTINCT, smaller surface: Energy
// Balance, Weight Context, Training Response, Body Composition, Coach's
// Take — no photos, nothing navigable but the back link, Confidence is a
// pure passthrough of whatever is already current)

struct MidweekBriefingContent: Codable, Equatable {
    var reportingRangeLabel: String
    /// The real product's deliberately provisional framing — verified
    /// copy pattern: state what's observed, then defer any real decision
    /// to Sunday's Weekly Briefing.
    var heroVerdict: String
    var heroSummary: String
    var energy: WeeklyEnergySection?
    var weightContextNarrative: String?
    var trainingResponseNarrative: String?
    var bodyComposition: WeeklyBodyCompositionSection?
    var coachTakeNarrative: String
    /// "Priorities Through Sunday" — verified plain, non-navigable
    /// numbered list (max 3 on the real product).
    var prioritiesThroughSunday: [String]
}

// MARK: - Monthly content (verified section list: Hero, optional Goal
// Milestone, Training Progress, Energy Evolution [static, non-interactive
// bar chart], New Baseline, What Changed, Defining Moments, Month Ahead.
// No standalone "Strategy"/"Phase Transition" section — verified those are
// computed server-side but never rendered on the live screen.)

struct MonthlyGoalMilestoneSection: Codable, Equatable {
    var title: String
    var narrative: String
    /// Verified: production sets this to `/goals` when rendered; only
    /// present when a goal-completion story was actually selected for
    /// this month.
    var destination: AppDestination?
}

struct MonthlyTrainingProgressSection: Codable, Equatable {
    var narrative: String
    var stats: [BriefingStat]
}

struct BriefingStat: Codable, Equatable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

/// Static weekly-aggregate bars — verified NOT interactive on the real
/// screen (no hover/tap, pure CSS bar heights from server-supplied
/// numbers).
struct MonthlyEnergyEvolutionSection: Codable, Equatable {
    struct WeekBar: Codable, Equatable, Identifiable {
        var id: String { weekLabel }
        var weekLabel: String
        var averageIntakeKcal: Int
        var averageExpenditureKcal: Int
    }
    var weeks: [WeekBar]
    var averageIntakeKcal: Int
    var averageExpenditureKcal: Int
    var averageBalanceKcal: Int
}

/// `NewBaseline` — verified this refers to the DEXA scan that closes the
/// PRIOR goal and opens the CURRENTLY active one (the "starting point" of
/// the current Goal/Phase), never an arbitrary historical anchor and
/// never "the start of a cut." Build Lean Mass is not itself a cut —
/// verified against current source: it is the goal that begins AFTER a
/// completed cut goal: the reference DEXA date is the day that prior goal
/// closed.
struct MonthlyNewBaselineSection: Codable, Equatable {
    var referenceDateLabel: String
    var bodyFatPercent: String
    var leanMassLb: String
    var fatMassLb: String
    var narrative: String
}

struct MonthlyBriefingContent: Codable, Equatable {
    var monthLabel: String
    var heroHeadline: String
    var heroBody: String
    var heroGoalLabel: String
    var goalMilestone: MonthlyGoalMilestoneSection?
    var trainingProgress: MonthlyTrainingProgressSection
    var energyEvolution: MonthlyEnergyEvolutionSection
    var newBaseline: MonthlyNewBaselineSection
    var whatChanged: [String]
    var definingMoments: [BriefingStat]
    var monthAhead: [String]
}

// MARK: - The Briefing artifact (one type, cadence-discriminated content)

/// One recurring-Briefing artifact — the single identity Home, History,
/// Detail, and Morning Check-In's `BriefingReconciliationWorkItem` all
/// share (verified: every one of those keys off the same `artifact.id`
/// on the real product; `publicationRootId === artifact.id`).
struct BriefingReadModel: Codable, Equatable, Identifiable {
    var id: String
    var occurrence: BriefingOccurrenceIdentity
    var cadence: BriefingCadence
    var generatedAt: String
    var evidenceWindow: BriefingEvidenceWindowReadModel
    var lifecycleState: BriefingArtifactLifecycleState
    var attribution: BriefingGoalAttribution
    var confidence: BriefingConfidenceReadModel?
    var revisionProvenance: BriefingRevisionProvenance?
    var replacedHistory: [BriefingRevisionSnapshot]

    var weekly: WeeklyBriefingContent?
    var midweek: MidweekBriefingContent?
    var monthly: MonthlyBriefingContent?

    /// Whether this artifact has ever been revised/republished — verified
    /// this is represented by a non-nil `revisionProvenance` plus a
    /// non-empty `replacedHistory`, not a boolean flag on the real model.
    var isRevised: Bool { revisionProvenance != nil && !replacedHistory.isEmpty }

    /// Title shown in History — verified exact per-cadence format
    /// (`artifactTitle()`, `src/app/briefings/review/page.js`).
    var historyTitle: String {
        switch cadence {
        case .monthly: "Monthly Briefing · \(monthly?.monthLabel ?? evidenceWindow.relativeLabel)"
        case .midweek: "Midweek Briefing"
        case .weekly: weekly?.heroHeadline ?? "Weekly Briefing"
        case .daily: "Daily Briefing"
        }
    }

    /// Subtitle shown in History — verified exact per-cadence format.
    var historySubtitle: String {
        switch cadence {
        case .monthly: "Delivered \(Self.shortDate(evidenceWindow.briefingDate))"
        case .midweek: "Sun–Tue · \(Self.shortDate(evidenceWindow.startDate))–\(Self.shortDate(evidenceWindow.endDate))"
        case .weekly, .daily: "\(Self.shortDate(evidenceWindow.startDate))–\(Self.shortDate(evidenceWindow.endDate))"
        }
    }

    /// `"YYYY-MM-DD"` → `"MMM d"`, UTC-anchored so a device timezone never
    /// shifts a date-only field to the adjacent calendar day (the same
    /// contract `TrainingDateFormatting.short` establishes for Evidence
    /// dates). Falls back to the raw value for a malformed key.
    private static func shortDate(_ dateKey: String) -> String {
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = TimeZone(identifier: "UTC")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: String(dateKey.prefix(10))) else { return dateKey }
        let display = DateFormatter()
        display.calendar = Calendar(identifier: .gregorian)
        display.locale = Locale(identifier: "en_US_POSIX")
        display.timeZone = TimeZone(identifier: "UTC")
        display.dateFormat = "MMM d"
        return display.string(from: date)
    }
}
