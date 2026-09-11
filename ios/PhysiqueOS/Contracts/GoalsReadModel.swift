import Foundation

/// Presentation read models for the currently reachable Goals tab.
///
/// These values mirror the web Goals projections. Native does not evaluate
/// goals, calculate Confidence, advance phases, or infer guardrail state.
/// A future live `GoalsAPI` will decode the same server-owned presentation
/// facts that the fixture supplies today.
struct GoalsHubReadModel: Codable, Equatable {
    var activeGoal: GoalSummaryReadModel?
    var completedGoals: [GoalSummaryReadModel]
    var addGoalAvailable: Bool
    var addGoalMessage: String

    var orderedGoals: [GoalSummaryReadModel] {
        (activeGoal.map { [$0] } ?? []) + completedGoals
    }
}

enum GoalLifecycleState: String, Codable, Equatable {
    case active
    case completed
}

struct GoalSummaryReadModel: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var lifecycle: GoalLifecycleState
    var statusLabel: String
    var dateRange: String
    var achievement: String?
    var confidence: GoalConfidenceReadModel?
    var currentPhaseName: String?

    var destination: AppDestination { .goalDetail(goalId: id) }
}

struct GoalDetailReadModel: Codable, Equatable {
    var active: ActiveGoalReadModel?
    var completed: CompletedGoalReadModel?
    /// A lightweight, ongoing guardrail/supporting objective shown on Home
    /// alongside the primary Goal (e.g. "Maintain Strength Baseline",
    /// "Preserve Lean Mass") — real, distinct, individually-linked pages on
    /// the live product (`getGoalHref`'s own whitelist maps these to
    /// `/goals/maintenance`, `/goals/lean-mass`, thin single-purpose pages,
    /// confirmed by source audit — not the same rich multi-phase page the
    /// primary Goal gets). Deliberately its own minimal case rather than
    /// forced into `ActiveGoalReadModel`'s much larger shape (phases,
    /// turning points, training progress, …), none of which the real
    /// supporting-objective pages carry.
    var supporting: SupportingObjectiveReadModel?

    var id: String? { active?.id ?? completed?.id ?? supporting?.id }
}

/// Mirrors the real `/goals/maintenance`, `/goals/lean-mass`-style thin
/// supporting-objective pages: a title, a status line, and a short
/// narrative — no phases, no confidence ring, no training-progress
/// breakdown.
struct SupportingObjectiveReadModel: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var status: String
    var detail: String
    var narrative: String
}

struct ActiveGoalReadModel: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var status: String
    var objective: String
    var dateRange: String
    var confidence: GoalConfidenceReadModel
    var goalProgress: GoalProgressReadModel
    var phases: [GoalPhaseReadModel]
    var activePhaseId: String
    var readiness: [String]
    var guardrail: GoalGuardrailReadModel
    var evidence: GoalEvidenceAnchorReadModel
    var trainingProgress: GoalTrainingProgressReadModel
    var turningPoints: [GoalTurningPointReadModel]
    var strategy: [GoalStrategyItemReadModel]
    /// The raw, editable Goal Plan — `/goals/[goalId]/edit`'s source of
    /// truth. Every presentation field above (`title`, `objective`,
    /// `dateRange`, `guardrail`) is regenerated from this after a Goal
    /// Edit save, the same "raw editor → derived display" split
    /// `OperatingPlanSandboxStore` already establishes for Training/
    /// Nutrition/Coaching strategy edits.
    var plan: GoalPlanReadModel

    var activePhase: GoalPhaseReadModel? {
        phases.first { $0.id == activePhaseId && $0.status == .active }
    }

    var orderedPhases: [GoalPhaseReadModel] {
        phases.sorted { $0.order < $1.order }
    }

    var summary: GoalSummaryReadModel {
        GoalSummaryReadModel(
            id: id,
            title: title,
            lifecycle: .active,
            statusLabel: status,
            dateRange: dateRange,
            achievement: nil,
            confidence: confidence,
            currentPhaseName: activePhase?.name
        )
    }
}

struct GoalConfidenceReadModel: Codable, Equatable {
    var value: Int?
    var band: String
    var explanation: String
    var source: String
}

struct GoalProgressReadModel: Codable, Equatable {
    var percentage: Int
    var label: String
    var detail: String
}

enum GoalPhaseStatus: String, Codable, Equatable {
    case completed
    case active
    case planned

    var label: String {
        switch self {
        case .completed: "Completed"
        case .active: "Active"
        case .planned: "Planned"
        }
    }
}

/// `goalPhase.js`'s `timingMode` — how a phase's end is determined.
enum GoalPhaseTimingMode: String, Codable, CaseIterable, Identifiable {
    case fixedDuration = "fixed_duration"
    case targetDate = "target_date"
    case completionCriteria = "completion_criteria"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .fixedDuration: "Planned duration"
        case .targetDate: "Reach a target date"
        case .completionCriteria: "Open-ended and evidence-led"
        }
    }
}

struct GoalPhaseReadModel: Codable, Equatable, Identifiable {
    var id: String
    var order: Int
    var name: String
    var status: GoalPhaseStatus
    var dates: String
    var purpose: String
    var progress: GoalProgressReadModel
    var evidence: String
    var strategy: [String]
    var successCriteria: [String]
    var guardrails: [String]
    /// Raw calendar-date boundaries (`yyyy-MM-dd`) backing the
    /// presentation-only `dates` string above — the fields Goal Edit's
    /// Phases section and the Phase Transition flow actually read/write.
    /// `startDate` is always present; `targetDate` is nil for an
    /// open-ended (`.completionCriteria`) phase.
    var startDate: String = ""
    var targetDate: String? = nil
    var timingMode: GoalPhaseTimingMode = .targetDate

    func destination(goalId: String) -> AppDestination {
        .goalPhase(goalId: goalId, phaseId: id)
    }
}

struct GoalGuardrailReadModel: Codable, Equatable {
    var title: String
    var state: String
    var scope: String
    var body: String
}

struct GoalEvidenceAnchorReadModel: Codable, Equatable {
    var date: String
    var bodyFat: String
    var leanMass: String
    var fatMass: String
    var weight: String
    var support: String
}

struct GoalTrainingProgressReadModel: Codable, Equatable {
    var reviewDate: String
    var state: String
    var interpretation: String
    var comparisons: [String]
    var muscleGroups: [GoalMuscleGroupProgressReadModel]
}

struct GoalMuscleGroupProgressReadModel: Codable, Equatable, Identifiable {
    var id: String { name }
    var name: String
    var status: String
}

struct GoalTurningPointReadModel: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var title: String
    var body: String
}

struct GoalStrategyItemReadModel: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var active: Bool
}

enum GoalPlanFocus: String, Codable, Equatable, Hashable {
    case strategy
    case protocols
}

struct GoalStrategyReadModel: Codable, Equatable {
    var goalId: String
    var goalTitle: String
    var objective: String
    var focus: GoalPlanFocus
    var items: [GoalStrategyItemReadModel]
    var guardrail: GoalGuardrailReadModel
}

struct GoalPhaseDetailReadModel: Codable, Equatable {
    var goalId: String
    var goalTitle: String
    var phase: GoalPhaseReadModel
    var goalProgress: GoalProgressReadModel
    var confidence: GoalConfidenceReadModel
    var guardrail: GoalGuardrailReadModel
}

struct CompletedGoalReadModel: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var status: String
    var dateRange: String
    var achievement: String
    var recap: String
    var highlights: [CompletedGoalHighlightReadModel]
    var photos: [CompletedGoalPhotoReadModel]
    var photoHistoryDestination: AppDestination
    var finalComposition: CompletedGoalCompositionReadModel
    var achievedBy: [String]
    var unlocked: CompletedGoalUnlockReadModel?

    var summary: GoalSummaryReadModel {
        GoalSummaryReadModel(
            id: id,
            title: title,
            lifecycle: .completed,
            statusLabel: status,
            dateRange: dateRange,
            achievement: achievement,
            confidence: nil,
            currentPhaseName: nil
        )
    }
}

struct CompletedGoalHighlightReadModel: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var title: String
    var body: String
}

struct CompletedGoalPhotoReadModel: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var date: String
    var systemImage: String
}

struct CompletedGoalCompositionReadModel: Codable, Equatable {
    var date: String
    var bodyFat: String
    var leanMass: String
    var fatMass: String
    var weight: String
    var narrative: String
    var briefingDestination: AppDestination?
}

struct CompletedGoalUnlockReadModel: Codable, Equatable {
    var title: String
    var body: String
    var destination: AppDestination
}
