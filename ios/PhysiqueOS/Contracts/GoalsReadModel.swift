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
    /// Present only when the Server serves `active_goal_current_state_v1`;
    /// when present the page renders it instead of the legacy sections.
    var currentState: ActiveGoalCurrentStateReadModel? = nil

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
    var movement: String? = nil
    var priorScore: Int? = nil
    var delta: Int? = nil
    var detail: ConfidenceDetail? = nil
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

    enum CodingKeys: String, CodingKey {
        case id, date, title, body
    }

    init(id: String, date: String, title: String, body: String) {
        self.id = id
        self.date = date
        self.title = title
        self.body = body
    }

    /// The Package 7 `active-goal` resource's `turningPoints[]` entries
    /// never carry an `id` — only `{title, body, date}` (confirmed against
    /// a real production response). Turning points are a narrative
    /// timeline never referenced elsewhere by identity, so a stable id
    /// derived from the two fields that are always present (`date` and
    /// `title`) is a safe SwiftUI list key, not a fabricated identity —
    /// the fixture's own explicit `id` still decodes directly when present.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        date = try container.decode(String.self, forKey: .date)
        title = try container.decode(String.self, forKey: .title)
        body = try container.decode(String.self, forKey: .body)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? "\(date)-\(title)"
    }
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

// MARK: - Active Goal current state (`active_goal_current_state_v1`)

/// Server-owned current state of the active Goal. Every fact and every
/// sentence of interpretation comes from the Server: baseline vs latest
/// authoritative DEXA, deterministic progress, the V3 guardrail reading,
/// Confidence V3's goal-level explanation, structured training progress,
/// selective turning points and the latest published briefing's Coach's
/// Take. Native renders these fields and composes no coaching of its own.
struct ActiveGoalCurrentStateReadModel: Codable, Equatable {
    var schemaVersion: String
    var asOf: String?
    var composition: Composition?
    var progress: Progress?
    var guardrail: Guardrail?
    var phase: Phase?
    var confidence: Confidence?
    var training: Training?
    var turningPoints: [GoalTurningPointReadModel]
    var coachTake: CoachTake?

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, asOf, composition, progress, guardrail, phase, confidence, training, turningPoints, coachTake
    }

    init(schemaVersion: String, asOf: String? = nil, composition: Composition? = nil, progress: Progress? = nil,
         guardrail: Guardrail? = nil, phase: Phase? = nil, confidence: Confidence? = nil, training: Training? = nil,
         turningPoints: [GoalTurningPointReadModel] = [], coachTake: CoachTake? = nil) {
        self.schemaVersion = schemaVersion
        self.asOf = asOf
        self.composition = composition
        self.progress = progress
        self.guardrail = guardrail
        self.phase = phase
        self.confidence = confidence
        self.training = training
        self.turningPoints = turningPoints
        self.coachTake = coachTake
    }

    /// Only `schemaVersion` is required. Every block decodes independently,
    /// so a drifted or malformed block hides only its own section instead
    /// of dropping the whole current-state page back to the legacy layout.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(String.self, forKey: .schemaVersion)
        asOf = try? container.decodeIfPresent(String.self, forKey: .asOf)
        composition = try? container.decodeIfPresent(Composition.self, forKey: .composition)
        progress = try? container.decodeIfPresent(Progress.self, forKey: .progress)
        guardrail = try? container.decodeIfPresent(Guardrail.self, forKey: .guardrail)
        phase = try? container.decodeIfPresent(Phase.self, forKey: .phase)
        confidence = try? container.decodeIfPresent(Confidence.self, forKey: .confidence)
        training = try? container.decodeIfPresent(Training.self, forKey: .training)
        turningPoints = (try? container.decodeIfPresent([GoalTurningPointReadModel].self, forKey: .turningPoints)) ?? []
        coachTake = try? container.decodeIfPresent(CoachTake.self, forKey: .coachTake)
    }

    struct Scan: Codable, Equatable {
        var role: String
        var date: String
        var leanMassLb: Double
        var fatMassLb: Double?
        var bodyFatPercent: Double?
        var weightLb: Double?
    }

    struct Change: Codable, Equatable {
        var leanMassLb: Double?
        var fatMassLb: Double?
        var bodyFatPoints: Double?
        var weightLb: Double?
    }

    struct Composition: Codable, Equatable {
        var authority: String
        var baseline: Scan?
        var current: Scan
        var sameAsBaseline: Bool
        var change: Change?
    }

    struct Progress: Codable, Equatable {
        var status: String
        var unit: String
        var targetAmount: Double
        var achievedAmount: Double?
        var remainingAmount: Double?
        var percentComplete: Int?
        var targetDate: String?
    }

    struct Measurement: Codable, Equatable {
        var value: Double
        var date: String
        var source: String
    }

    struct Guardrail: Codable, Equatable {
        var title: String
        var label: String
        var measurement: Measurement?
        var status: String
        var position: String?
        var interpretation: String?
    }

    struct Phase: Codable, Equatable {
        var id: String?
        var name: String?
        var purpose: String?
        var startDate: String?
        var measurementCadence: String?
    }

    struct Publisher: Codable, Equatable {
        var label: String?
        var publishedOn: String?
    }

    struct ConfidenceDetailLists: Codable, Equatable {
        var whatSupportsIt: [String]
        var whatIsHoldingItBack: [String]
        var whatCouldRaiseIt: [String]
        var whatCouldLowerIt: [String]
        var assumptions: [String]
    }

    struct Confidence: Codable, Equatable {
        var status: String
        var score: Int?
        var band: String?
        var movement: String?
        var delta: Int?
        var summary: String?
        var publishedBy: Publisher?
        var detail: ConfidenceDetailLists?
    }

    struct TrainingHighlight: Codable, Equatable {
        var name: String
        var region: String?
        var percentChange: Double?
        var personalRecord: Bool?
    }

    struct TrainingRegion: Codable, Equatable, Identifiable {
        var id: String { region }
        var region: String
        var status: String
        var movementCount: Int
    }

    struct Training: Codable, Equatable {
        var state: String
        var periodStart: String
        var periodEnd: String
        var trainingDayCount: Int
        var comparableMovementCount: Int
        var improvingCount: Int
        var regressingCount: Int
        var regions: [TrainingRegion]
        var highlights: [TrainingHighlight]
        var summary: String
    }

    struct CoachSection: Codable, Equatable, Identifiable {
        var id: String { kind }
        var kind: String
        var title: String
        var text: String
    }

    struct CoachTake: Codable, Equatable {
        var artifactId: String
        var cadence: String
        var briefingLabel: String
        var publishedOn: String
        var attribution: String
        var sections: [CoachSection]
    }

    static let supportedSchemaVersion = "active_goal_current_state_v1"
}

/// Decodes a nested value without letting a malformed or unknown shape fail
/// the whole Goal payload: an unusable `currentState` falls back to the
/// legacy sections instead of turning the page into an error.
struct LenientDecodable<Value: Decodable>: Decodable {
    let value: Value?
    init(from decoder: Decoder) throws {
        value = try? Value(from: decoder)
    }
}
