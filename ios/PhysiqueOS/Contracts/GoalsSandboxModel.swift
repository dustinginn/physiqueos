import Foundation

/// Goal Edit (`/goals/[goalId]/edit`) and Goal Transition (`/goals/transition/**`)
/// read/draft models — verified against source for this task
/// (`GoalEditWizardScreen.jsx`, `GoalEditDraftService.js`,
/// `GoalPlanUpdateService.js`, `GoalPhasePersistenceService.js`,
/// `GoalTransitionPreviewScreen.jsx`, `ProtocolTransitionPreviewScreen.jsx`,
/// `ProductionGoalTransitionActivationService.js`,
/// `GoalTransitionActivationCoordinator.js`,
/// `GoalTransitionActivationTransactionPlanBuilder.js`,
/// `PhaseReviewCommitParticipants.js`). Native does not evaluate goals,
/// does not run the real Phase Review Commit Coordinator, and does not own
/// canonical Goal identity — this is the same fixture-command boundary
/// established by `OperatingPlanSandboxStore`/`LoggingSandboxStore`.

// MARK: - Raw editable Goal Plan (source of truth for Goal Edit)

/// `goalPlanningInput.js`'s `target` shape. Native supports the two target
/// types the real completeness gate (`GoalOutcomeInterpretationService.
/// assessOverallGoalCompleteness`) actually requires for a real goal.
struct GoalTargetReadModel: Codable, Equatable {
    enum TargetType: String, Codable, CaseIterable, Identifiable {
        case numericChange = "numeric_change"
        case numericAbsolute = "numeric_absolute"
        var id: String { rawValue }
        var label: String { self == .numericChange ? "Change by an amount" : "Reach an absolute value" }
    }
    var type: TargetType
    var metric: String
    var direction: String
    var amount: Double?
    var targetValue: Double?
    var unit: String
    var description: String
    var targetDate: String?
}

struct GoalTimelineReadModel: Codable, Equatable {
    var startDate: String
    var targetDate: String?
}

/// `successCriteria`/`guardrails` line items — `key` is the stable,
/// immutable local identity `GoalEditDraftService.addGoalEditItem` assigns
/// (`GOAL_EDIT_LOCAL_KEY_IMMUTABLE` — a key can never change once set).
struct GoalPlanListItem: Codable, Equatable, Identifiable {
    var key: String
    var text: String
    var id: String { key }
}

/// The raw, editable Goal Plan — what `/goals/[goalId]/edit`'s
/// `goal_and_purpose`/`overall_goal`/`success_criteria`/`guardrails`
/// sections actually read and write. Distinct from `ActiveGoalReadModel`,
/// which is presentation-shaped (confidence, progress percentage, derived
/// strategy) — this is the source-of-truth plan those presentation fields
/// are regenerated from after a save, the same "raw editor + derived
/// display" split `OperatingPlanSandboxStore.saveTraining` already
/// establishes for Training Strategy.
struct GoalPlanReadModel: Codable, Equatable {
    var name: String
    var purpose: String
    var primaryOutcome: String
    var target: GoalTargetReadModel
    var timeline: GoalTimelineReadModel
    var successCriteria: [GoalPlanListItem]
    var guardrails: [GoalPlanListItem]
}

// MARK: - Goal Edit wizard

/// `GOAL_EDIT_CANONICAL_SECTION_ORDER` (`GoalEditDraftService.js`).
/// `.coaching` is real but inert on web (renders only static copy, no
/// inputs — confirmed by source audit) and is modeled identically here:
/// selectable, shown, never produces a diff.
enum GoalEditSection: String, Codable, CaseIterable, Identifiable {
    case goalAndPurpose = "goal_and_purpose"
    case phases
    case overallGoal = "overall_goal"
    case successCriteria = "success_criteria"
    case guardrails
    case coaching

    var id: String { rawValue }
    var title: String {
        switch self {
        case .goalAndPurpose: "Goal and purpose"
        case .phases: "Phases"
        case .overallGoal: "Overall goal"
        case .successCriteria: "Success criteria"
        case .guardrails: "Guardrails"
        case .coaching: "Coaching preferences"
        }
    }
}

/// The Goal Edit working draft. `phases` is a working copy of the goal's
/// existing phases for the Phases section only — the Edit wizard can
/// reorder/retitle/edit non-active phases and edit non-operational fields
/// of any phase, but (matching the real `PHASE_REVIEW_COORDINATOR_REQUIRED`
/// guard) can never change which phase is active or retime the active
/// phase; that requires the separate Phase Transition flow.
struct GoalEditDraft: Equatable {
    var selectedSections: Set<GoalEditSection> = []
    var plan: GoalPlanReadModel
    var phases: [GoalPhaseReadModel]
    var activePhaseId: String

    var orderedSteps: [GoalEditSection] {
        GoalEditSection.allCases.filter { selectedSections.contains($0) }
    }
}

enum GoalEditValidation {
    /// `goalPlanningInput.js` + `assessOverallGoalCompleteness` — enforced
    /// only for a plan diff (i.e. when Overall Goal / Goal-and-purpose /
    /// Success criteria / Guardrails were edited).
    static func planError(_ plan: GoalPlanReadModel) -> String? {
        if plan.target.type == .numericChange, plan.target.amount == nil {
            return "Enter an amount for your target."
        }
        if plan.target.type == .numericAbsolute, plan.target.targetValue == nil {
            return "Enter a target value."
        }
        if let targetDate = plan.timeline.targetDate, targetDate < plan.timeline.startDate {
            return "Choose a target date on or after the start date."
        }
        if let planTargetDate = plan.target.targetDate, let timelineTargetDate = plan.timeline.targetDate,
           planTargetDate != timelineTargetDate {
            return "Target date and timeline date must match."
        }
        let keys = plan.successCriteria.map(\.key) + plan.guardrails.map(\.key)
        if Set(keys).count != keys.count {
            return "Every success criterion and guardrail must be unique."
        }
        if plan.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Enter a goal name."
        }
        return nil
    }

    /// `normalizeGoalPhaseCollection` + `requiresPhaseReviewCoordinator` —
    /// the operational-change guard is the one rule this wizard can never
    /// be used to bypass.
    static func phasesError(current: [GoalPhaseReadModel], proposed: [GoalPhaseReadModel], activePhaseId: String) -> String? {
        guard Set(proposed.map(\.order)).count == proposed.count, Set(proposed.map(\.id)).count == proposed.count else {
            return "Phase order and identity must stay unique."
        }
        guard proposed.filter({ $0.status == .active }).count <= 1 else {
            return "Only one phase can be active at a time."
        }
        let currentActive = current.first { $0.id == activePhaseId }
        let proposedActive = proposed.first { $0.id == activePhaseId }
        if currentActive?.status != proposedActive?.status || currentActive?.dates != proposedActive?.dates
            || currentActive?.startDate != proposedActive?.startDate || currentActive?.targetDate != proposedActive?.targetDate {
            return "Operational phase lifecycle and timing changes require the Phase Transition flow."
        }
        return nil
    }

    /// `combined_changes_blocked` — the wizard forces plan and phase
    /// changes into two separate saves.
    static func combinedChangesError(planChanged: Bool, phasesChanged: Bool) -> String? {
        (planChanged && phasesChanged)
            ? "Goal-plan and phase changes cannot be saved together. Save one category, then reopen this wizard for the other."
            : nil
    }
}

// MARK: - Goal Transition ("Add Goal") — Route A: /goals/transition

/// `GoalTransitionPreviewScreen.jsx`'s `SECTIONS`.
enum GoalTransitionSection: String, CaseIterable, Identifiable {
    case completion, objective, guardrails, evidence, operating, strategy, commitments, cadence, supporting, review
    var id: String { rawValue }
    var title: String {
        switch self {
        case .completion: "You're ready to choose what comes next."
        case .objective: "What comes next?"
        case .guardrails: "What should we protect?"
        case .evidence: "How we'll measure progress"
        case .operating: "Let's begin with calibration."
        case .strategy: "What should happen to your protocols next?"
        case .commitments: "Your Routine"
        case .cadence: "How often should we review progress?"
        case .supporting: "Anything you'd like to emphasize?"
        case .review: "Your New Goal"
        }
    }
}

enum GoalTransitionObjective: String, CaseIterable, Identifiable {
    case buildLeanMass = "build_lean_mass"
    case maintainPhysique = "maintain_current_physique"
    case improveStrength = "improve_strength"
    case improveAthleticPerformance = "improve_athletic_performance"
    case custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .buildLeanMass: "Build Lean Mass"
        case .maintainPhysique: "Maintain Current Physique"
        case .improveStrength: "Improve Strength"
        case .improveAthleticPerformance: "Improve Athletic Performance"
        case .custom: "Custom Objective"
        }
    }
}

struct GoalTransitionGuardrailChoice: Identifiable, Equatable {
    var id: String
    var title: String
    var detail: String
    var accepted: Bool
    var isCustom: Bool = false
}

/// The three measurement groups from `GoalTransitionPreviewScreen.jsx`'s
/// Evidence section (outcome / predictive / explanatory).
enum GoalTransitionMeasureGroup: String, CaseIterable, Identifiable {
    case outcome, predictive, explanatory
    var id: String { rawValue }
    var label: String {
        switch self {
        case .outcome: "Outcome measures"
        case .predictive: "Predictive signals"
        case .explanatory: "Explanatory context"
        }
    }
}

struct GoalTransitionMeasureChoice: Identifiable, Equatable {
    var id: String
    var group: GoalTransitionMeasureGroup
    var title: String
    var accepted: Bool
}

/// `ProtocolTransitionCategoryModel` — the real category set.
enum ProtocolTransitionCategory: String, CaseIterable, Identifiable {
    case energy, nutrition, training, activity, recovery, weight, photos, dexa, briefings
    var id: String { rawValue }
    var label: String {
        switch self {
        case .energy: "Energy Balance"
        case .nutrition: "Nutrition"
        case .training: "Training"
        case .activity: "Activity"
        case .recovery: "Recovery"
        case .weight: "Weight Tracking"
        case .photos: "Progress Photos"
        case .dexa: "DEXA"
        case .briefings: "Briefings"
        }
    }
}

enum ProtocolCategoryDisposition: String, CaseIterable, Identifiable {
    case keep, modify, replace, pause, remove
    var id: String { rawValue }
    var label: String {
        switch self {
        case .keep: "Carry forward"
        case .modify: "Review and update"
        case .replace: "Replace"
        case .pause: "Pause"
        case .remove: "Leave behind"
        }
    }
    /// Whether choosing this disposition routes to the per-category editor
    /// (Route C) before it can be marked ready.
    var requiresEditor: Bool { self == .modify || self == .replace }
}

struct GoalTransitionProtocolReview: Identifiable, Equatable {
    var id: String { category.rawValue }
    var category: ProtocolTransitionCategory
    var disposition: ProtocolCategoryDisposition
    var edited: Bool = false
}

enum ReviewCadence: String, CaseIterable, Identifiable {
    case daily, twiceWeekly = "twice_weekly", weekly, custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .daily: "Daily"
        case .twiceWeekly: "Twice Weekly"
        case .weekly: "Weekly"
        case .custom: "Custom"
        }
    }
}

/// `saveLiveGoalTransitionSection`/`markReadyAction` — the Route A draft.
/// Reuses `TrainingStrategyArea` for supporting priorities (the real
/// muscle-group set is the same underlying concept the Training Strategy
/// Builder already models — Native does not stand up a second priority
/// enum for the same idea).
struct GoalTransitionDraft: Equatable {
    var objective: GoalTransitionObjective = .buildLeanMass
    var customObjectiveTitle: String = ""
    var guardrails: [GoalTransitionGuardrailChoice]
    var measures: [GoalTransitionMeasureChoice]
    var protocolReviews: [GoalTransitionProtocolReview]
    var cadence: ReviewCadence = .twiceWeekly
    var cadenceDays: [OperatingPlanWeekday] = [.wednesday, .sunday]
    var supportingPriorities: [TrainingStrategyArea] = [.chest, .shoulders, .arms]
    var isReady: Bool = false

    var objectiveTitle: String {
        objective == .custom ? customObjectiveTitle : objective.label
    }
}

enum GoalTransitionValidation {
    /// `validateGoalTransitionDraft`.
    static func readinessError(_ draft: GoalTransitionDraft) -> String? {
        if draft.objectiveTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "Choose or name an objective for the new goal."
        }
        guard draft.measures.contains(where: { $0.group == .outcome && $0.accepted }) else {
            return "Accept at least one outcome measure."
        }
        guard draft.measures.contains(where: { $0.group == .predictive && $0.accepted }) else {
            return "Accept at least one predictive signal."
        }
        return nil
    }
}

// MARK: - Goal Transition — Route B: /goals/transition/protocols

/// The per-category structured editor draft (Route C,
/// `/goals/transition/protocols/edit/[category]`) —
/// `ProtocolTransitionBuilderScreen.jsx`'s energy calorie/activity choices
/// generalized to the fields each category actually collects.
struct ProtocolCategoryEditorDraft: Equatable {
    var category: ProtocolTransitionCategory
    /// energy only: `increase_gradually` | `estimated_maintenance`.
    var calorieStrategy: String?
    /// energy only: `keep_current` | `reduce_slightly`.
    var activityStrategy: String?
    /// photos/dexa only: a structured cadence, reusing the shared support
    /// schedule shape `OperatingPlanSupportScheduleReadModel` already
    /// establishes rather than inventing a second cadence model.
    var cadence: OperatingPlanSupportScheduleReadModel?
    var isComplete: Bool = false
}

// MARK: - Goal Transition — Route D/E: review + success

struct GoalTransitionReviewToken: Equatable {
    var transitionId: String
    var issuedAt: Date
    var sourceGoalId: String
    var targetGoalTitle: String
}

struct GoalTransitionReviewSummary: Equatable {
    var openingPhaseLabel: String
    var guardrailSummary: String
    var coachingCadenceSummary: String
    var protocolsPreparedCount: Int
    var commitmentsSummary: String
    var reminderIntentsSummary: String
}

struct GoalTransitionActivationResult: Equatable {
    var completedGoalId: String
    var newGoalId: String
    var newGoalTitle: String
    var committedAt: Date
    var pendingExternalEffectCount: Int
}

// MARK: - Phase Transition (honest domain-contract extension)
//
// The live web product does NOT prompt for a new Energy Strategy during a
// same-Goal Phase transition today — verified by direct source audit of
// `PhaseReviewCard.jsx` (only a Begin/Continue decision, no Energy
// Strategy field of any kind) and `PhaseReviewCommitParticipants.js`
// (the STRATEGY participant *requires* an already-`accepted` Phase
// Strategy and rejects the whole transaction if one doesn't already
// exist — it never creates or solicits one). The one place a Phase 2
// Energy Strategy with numeric targets gets built
// (`FounderPhase2ActivationPackageService.js`) is a hardcoded,
// non-interactive backend migration script, never a UI action. This is a
// disclosed, deliberate gap this task's product requirement asks Native
// to close honestly rather than reproduce — modeled below as a real,
// tested command, not merely a UI mock.

enum PhaseTransitionDecision: String, CaseIterable, Identifiable {
    case beginNext = "begin_next_phase"
    case continueCurrent = "continue_current_phase"
    var id: String { rawValue }
}

/// The new numeric Energy Strategy Native requires when beginning a phase
/// that doesn't already have one — the exact two figures the task names:
/// a new caloric intake target and a new activity/expenditure target.
struct PhaseTransitionEnergyStrategyDraft: Equatable {
    var caloricIntakeMin: Int
    var caloricIntakeMax: Int
    var activityTargetKcal: Int
    var reviewCadence: String = "Every 2 weeks"
    var note: String = ""
}

enum PhaseTransitionEnergyStrategyValidation {
    static func error(_ draft: PhaseTransitionEnergyStrategyDraft) -> String? {
        guard draft.caloricIntakeMin > 0, draft.caloricIntakeMax > 0 else {
            return "Enter a caloric intake target greater than zero."
        }
        guard draft.caloricIntakeMax >= draft.caloricIntakeMin else {
            return "The high end of the caloric intake range must be at or above the low end."
        }
        guard draft.activityTargetKcal > 0 else {
            return "Enter an activity/expenditure target greater than zero."
        }
        return nil
    }
}

struct PhaseTransitionContext: Equatable {
    var goalId: String
    var currentPhase: GoalPhaseReadModel
    var nextPhase: GoalPhaseReadModel?
    /// Whether `nextPhase` already has an accepted Energy Strategy on file
    /// (`OperatingPlanEnergyPhaseSnapshotReadModel` for that phase) — if
    /// not, and the decision is `.beginNext`, an Energy Strategy draft is
    /// required before the transition can commit.
    var nextPhaseHasEnergyStrategy: Bool
    var effectiveDateLabel: String
}

struct PhaseTransitionDraft: Equatable {
    var decision: PhaseTransitionDecision = .beginNext
    var extendDurationWeeks: Int = 2
    var energyStrategy: PhaseTransitionEnergyStrategyDraft?
}

enum PhaseTransitionValidation {
    static func error(draft: PhaseTransitionDraft, context: PhaseTransitionContext) -> String? {
        if draft.decision == .beginNext {
            guard context.nextPhase != nil else { return "There is no next phase to begin." }
            if !context.nextPhaseHasEnergyStrategy {
                guard let energy = draft.energyStrategy else {
                    return "Establish the new phase's Energy Strategy before beginning it."
                }
                if let error = PhaseTransitionEnergyStrategyValidation.error(energy) { return error }
            }
        } else if draft.decision == .continueCurrent {
            guard draft.extendDurationWeeks > 0 else { return "Choose an extension length greater than zero." }
        }
        return nil
    }
}

struct PhaseTransitionResult: Equatable {
    var goalId: String
    var completedPhaseId: String
    var activePhaseId: String
    var committedAt: Date
}
