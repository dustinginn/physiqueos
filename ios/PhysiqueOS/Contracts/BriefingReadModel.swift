import Foundation

/// Read models for the Briefing vertical (Weekly/Midweek/Monthly/DEXA Event +
/// History + Home's latest-Briefing projection) — verified against source
/// for this task (`dailyBriefing.js`, `WeeklyNarrativeService.js`,
/// `MidweekBriefingService.js`, `MonthlyBriefingService.js`,
/// `DEXAEventNarrativeService.js`, `DEXAEventContextService.js`,
/// `PIDEXAEventLifecycleService.js`, `BriefingGoalConfidencePresentationService.js`,
/// `DailyBriefingHistory.js`, `DailyBriefingRepository.js`,
/// `HomeBriefingRoutingService.js`, `HomeBriefingService.js`,
/// `BriefingReviewArtifactResolver.js`). Photo Event Briefings are a later
/// batch — the shared `.event` cadence is modeled, but only DEXA's own
/// `dexa` content payload exists today; a `photo` payload would be added
/// alongside it the same way `weekly`/`midweek`/`monthly` already coexist.
///
/// Native does not recreate server intelligence: narrative text and
/// Confidence are opaque, server-authored fields carried by fixture data,
/// never composed or scored in Swift. Sections below mirror exactly what
/// each cadence's real screen renders (verified per-cadence against
/// source) — not the full internal narrative-composition machinery, which
/// stays server-owned even conceptually.

// MARK: - Identity, cadence, lifecycle

/// The real product's cadence discriminator on the shared `dailyBriefings`
/// collection (`artifact.cadence`). `.event` covers both DEXA and Photo
/// event Briefings on the real product (`artifactType: "event"`,
/// `cadence: "event"` — the same literal value for both trigger types,
/// discriminated instead by `trigger.evidenceType`); only DEXA's content is
/// modeled in this pass via `BriefingReadModel.dexa`.
enum BriefingCadence: String, Codable, CaseIterable, Identifiable, Equatable {
    case daily, midweek, weekly, monthly, event
    var id: String { rawValue }
    var label: String {
        switch self {
        case .daily: "Daily Briefing"
        case .midweek: "Midweek Briefing"
        case .weekly: "Weekly Briefing"
        case .monthly: "Monthly Briefing"
        case .event: "DEXA Event Briefing"
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

// MARK: - DEXA Event content (verified section list: Hero [title/body/
// results grid/optional milestones] → Snapshot → Progress [Since-Last-Scan
// headline, Regional Fat/Lean Change, Other Notable Changes, the amber
// "Cut Timeline" module] → Interpretation → Coach's Insight → optional
// read-only Phase Review → optional Goal Completion Handoff. Verified NOT
// present on the real screen: a forecast section, a revision/republication
// banner, any interactive chart (`CutTimeline` is a static per-scan point
// grid — no hover/tap), and a rendered Confidence ring — see
// `BriefingReadModel.confidence`'s note below.)

struct DEXAHeroResult: Codable, Equatable, Identifiable {
    var id: String { label }
    var emoji: String
    var label: String
    var value: String
    var context: String
}

struct DEXABriefingHero: Codable, Equatable {
    var title: String
    var body: String
    /// Always the 2×2 grid on the real screen: DEXA Weight, Body Fat, Fat
    /// Mass, Lean Tissue.
    var results: [DEXAHeroResult]
    /// The conditional emerald "Phase milestone" box — empty when this
    /// scan isn't a milestone moment.
    var milestones: [String]
}

struct DEXABriefingSnapshot: Codable, Equatable {
    var scanDate: String
    var daysBetweenScans: Int
    var weightLb: String
    var bodyFatPercent: String
    var fatMassLb: String
    var leanMassLb: String
    /// `nil` omits the "Estimated RMR" footnote, matching the real
    /// screen's own `snapshot.rmr != null` guard.
    var restingMetabolicRateKcal: String?
}

struct DEXAComparisonMetric: Codable, Equatable, Identifiable {
    var id: String { label }
    var label: String
    var previous: String
    var current: String
    var delta: String
}

struct DEXARegionalChangeMetric: Codable, Equatable, Identifiable {
    var id: String { region }
    var region: String
    var previous: String
    var current: String
    var delta: String
}

struct DEXATimelinePoint: Codable, Equatable, Identifiable {
    var id: String { scanId }
    var scanId: String
    var date: String
    var value: String
}

struct DEXATimelineMetricTrack: Codable, Equatable, Identifiable {
    var id: String { label }
    var label: String
    var unit: String
    var points: [DEXATimelinePoint]
    var delta: String
}

/// The amber "Cut Timeline" module — verified this uses a **different**
/// baseline than the "Since Last Scan" headline comparisons above: the
/// current Phase's own baseline scan (`goal.phase.dexaBaselineScanId`, or
/// else the latest eligible scan on/before the Phase's — or, for a goal
/// without phases, the Goal's — start date), never the immediately-prior
/// scan and never a Goal-level baseline (that field is computed
/// server-side but never rendered). `timelineLabel` reads "Since Starting
/// {Phase Name}" when a Phase exists, else "Available Body-Composition
/// History". Verified non-interactive: a static per-scan point grid, no
/// hover/tap/tooltip.
struct DEXACutTimeline: Codable, Equatable {
    var timelineLabel: String
    var isSimulated: Bool
    var baselineDate: String
    var currentDate: String
    var elapsedDays: Int
    var scans: [DEXATimelinePoint]
    var metrics: [DEXATimelineMetricTrack]
    var summary: String
}

struct DEXAProgressSection: Codable, Equatable {
    /// "Since Last Scan" — DEXA Weight, Body Fat, Fat Mass, Lean Tissue vs.
    /// the immediately-previous scan.
    var headline: [DEXAComparisonMetric]
    var regionalFat: [DEXARegionalChangeMetric]
    var regionalLean: [DEXARegionalChangeMetric]
    /// "Other Notable Changes" — VAT, A:G Ratio, RMR; verified real
    /// behavior only includes an entry when both prior and current values
    /// are present.
    var supplemental: [DEXAComparisonMetric]
    var timeline: DEXACutTimeline
}

struct DEXAInterpretationSection: Codable, Equatable {
    var opening: String
    /// Label varies by narrative branch on the real product (e.g. a
    /// fat-loss guardrail framing vs. a lean-mass-gain framing) — carried
    /// as opaque server-authored text/label rather than a fixed enum.
    var primaryLabel: String
    var primaryText: String
    var leanMassText: String
    var regionalText: String
    /// Present only when the real narrative actually composed a
    /// phase-and-strategy paragraph.
    var phaseMeaning: String?
    /// Present only when something genuinely stood out this scan.
    var stoodOut: String?
    var supportingEvidenceText: String
    var uncertaintyText: String
}

struct DEXACoachInsightSection: Codable, Equatable {
    var biggestWin: String
    var protect: String
    var watch: String
    var next: String
}

/// Verified real behavior: the historical replay route
/// (`/briefings/review/[artifactId]`) always renders this card
/// `readOnly`; only the direct, current-scan route
/// (`/briefings/dexa/[scanId]`) can render it as a live, submittable
/// decision. Native renders it read-only always — the interactive
/// decision-submission variant is a genuine write path
/// (`submitProductionPhaseReviewDecision`) and is intentionally not
/// ported in this pass (see this task's final report).
struct DEXAPhaseReviewSummary: Codable, Equatable {
    var title: String
    var promptText: String
    var options: [String]
    var recordedDecisionLabel: String?
}

/// The one real conditional CTA on this screen — verified hard-coded to
/// the "Visible Abs at Rest" fat-loss-goal-completion narrative branch,
/// routing to Photo evidence intake. Native reuses the existing, already-
/// built `.photoUpload` destination rather than inventing a new one.
struct DEXAGoalCompletionHandoff: Codable, Equatable {
    var questionText: String
    var actionLabel: String
    var actionDestination: AppDestination
}

struct DEXABriefingContent: Codable, Equatable {
    var scanId: String
    /// `nil` exactly on the first-scan/baseline narrative path
    /// (`composeFirstDEXAEventNarrative`) — see `isBaselineScan`.
    var priorScanId: String?
    var scanDate: String
    var priorScanDate: String?
    var daysBetweenScans: Int
    var hero: DEXABriefingHero
    var snapshot: DEXABriefingSnapshot
    var progress: DEXAProgressSection
    var interpretation: DEXAInterpretationSection
    var coachInsight: DEXACoachInsightSection
    var phaseReview: DEXAPhaseReviewSummary?
    var goalCompletionHandoff: DEXAGoalCompletionHandoff?

    var isBaselineScan: Bool { priorScanId == nil }
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
    /// For `cadence == .event` (DEXA): the artifact genuinely carries a
    /// persisted `goalConfidence` block (built by the same
    /// `createBriefingGoalConfidenceBlockFromV2` finalizer every other
    /// cadence uses), so this field is populated and decodable for
    /// fixture/test/continuity purposes — but verified against source: the
    /// real DEXA Event Briefing screen checks `hero.confidence` (which the
    /// real narrative composer never sets) rather than
    /// `narrative.goalConfidence`, so **no Confidence ring ever renders on
    /// the real production or historical DEXA screen**. This looks like an
    /// unwired real-product gap, not a deliberate omission — Native
    /// deliberately does not "fix" it by rendering a ring the real product
    /// doesn't show; `DEXABriefingSections` intentionally omits
    /// `BriefingConfidenceCard`. See this task's final report.
    var confidence: BriefingConfidenceReadModel?
    var revisionProvenance: BriefingRevisionProvenance?
    var replacedHistory: [BriefingRevisionSnapshot]
    /// `lifecycle.consumedAt` — verified real behavior (`isEventActiveForHome`,
    /// `HomeBriefingRoutingService.js`): an `.event` artifact stays eligible
    /// to win Home's latest-Briefing selection indefinitely (no same-day
    /// window, unlike Photo events) until it is consumed. `nil` means still
    /// active; a timestamp means it has been consumed and Home falls
    /// through to the ordinary Monthly/Weekly/Midweek precedence. Only
    /// meaningful for `cadence == .event`; always `nil` for every other
    /// cadence. Native does not build an interactive "mark as consumed"
    /// write — see this task's final report for why.
    var eventConsumedAt: String? = nil

    var weekly: WeeklyBriefingContent?
    var midweek: MidweekBriefingContent?
    var monthly: MonthlyBriefingContent?
    /// DEXA Event Briefing content — populated only when `cadence == .event`
    /// and the triggering evidence was a DEXA scan (the only event trigger
    /// type modeled this pass; see the type-level doc comment).
    var dexa: DEXABriefingContent?

    /// Whether this artifact has ever been revised/republished — verified
    /// this is represented by a non-nil `revisionProvenance` plus a
    /// non-empty `replacedHistory`, not a boolean flag on the real model.
    var isRevised: Bool { revisionProvenance != nil && !replacedHistory.isEmpty }

    /// Title shown in History — verified exact per-cadence format
    /// (`artifactTitle()`, `src/app/briefings/review/page.js`).
    /// Verified real behavior: History's own `artifactTitle()`
    /// (`src/app/briefings/review/page.js`) only special-cases
    /// `cadence === "monthly"`/`"midweek"` — an `event` artifact falls
    /// through to the generic branch, which reads `briefing?.hero?.title`.
    /// A DEXA event artifact's narrative nests under
    /// `briefing.dexaEventNarrative.hero.title`, not `briefing.hero.title`,
    /// so on the real product this renders the raw artifact id
    /// (`"dexa_event_<scanId>"`) instead of real title text — a verified
    /// product gap, not a deliberate design. Native gives DEXA rows their
    /// own sensible title/subtitle here rather than reproducing that
    /// fallback bug; this is disclosed in this task's final report.
    var historyTitle: String {
        switch cadence {
        case .monthly: "Monthly Briefing · \(monthly?.monthLabel ?? evidenceWindow.relativeLabel)"
        case .midweek: "Midweek Briefing"
        case .weekly: weekly?.heroHeadline ?? "Weekly Briefing"
        case .daily: "Daily Briefing"
        case .event: dexa?.hero.title ?? "DEXA Event Briefing"
        }
    }

    /// Subtitle shown in History — verified exact per-cadence format.
    var historySubtitle: String {
        switch cadence {
        case .monthly: "Delivered \(Self.shortDate(evidenceWindow.briefingDate))"
        case .midweek: "Sun–Tue · \(Self.shortDate(evidenceWindow.startDate))–\(Self.shortDate(evidenceWindow.endDate))"
        case .weekly, .daily: "\(Self.shortDate(evidenceWindow.startDate))–\(Self.shortDate(evidenceWindow.endDate))"
        case .event: "DEXA scan · \(Self.shortDate(dexa?.scanDate ?? evidenceWindow.startDate))"
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
