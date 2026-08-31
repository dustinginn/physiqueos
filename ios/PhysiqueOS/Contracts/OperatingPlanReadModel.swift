import Foundation

/// Presentation read models for the currently reachable Operating Plan
/// vertical (`src/app/profile/operating-plan/**`, `src/app/profile/protocols/**`,
/// `src/application/plan/OperatingPlanReadService.js`,
/// `src/domain/services/OperatingPlanStrategyDetailService.js`).
///
/// Field names and section grouping mirror the web read models exactly —
/// Native does not evaluate strategy, does not compute review cadence, and
/// does not own protocol persistence. A future live `OperatingPlanAPI` will
/// decode the same server-owned presentation facts the fixture supplies
/// today. One deliberate native-only addition is called out explicitly
/// where it appears (`OperatingPlanEnergyPhaseSnapshotReadModel`): the web's
/// `OperatingPlanEnergyStrategyService` only ever resolves the single
/// *current* phase-bound Energy strategy and does not itself expose prior
/// phases' Energy strategies as a list, even though that history remains in
/// `goal.phases[]` — this type exists so the Native read model/UI
/// architecture does not erase that historical distinction while the real
/// history endpoint doesn't exist yet.
struct OperatingPlanReadModel: Codable, Equatable {
    var sections: [OperatingPlanSectionReadModel]
}

/// Mirrors `IconBadge.jsx`'s tone slots as actually used by
/// `OperatingPlanReadService.js`'s `section()` calls (`primary`, `effort`,
/// `success`, `evidence`).
enum OperatingPlanSectionTone: String, Codable, Equatable {
    case primary, effort, success, evidence

    var colorToken: HomeColorToken {
        switch self {
        case .primary: .primary
        case .effort: .effort
        case .success: .success
        case .evidence: .evidence
        }
    }
}

struct OperatingPlanSectionReadModel: Codable, Equatable, Identifiable {
    var id: String
    var iconKey: String
    var tone: OperatingPlanSectionTone
    var title: String
    var subtitle: String
    var items: [OperatingPlanSectionItemReadModel]
    /// `sections: { supplements: true }` — makes the landing screen render
    /// an "Add Supplement" header action alongside this section.
    var supplementsAction: Bool = false
}

struct OperatingPlanSectionItemReadModel: Codable, Equatable, Identifiable {
    var id: String
    var title: String
    var detail: String
    var destination: AppDestination?
    var status: String?
}

/// `composeOperatingPlanStrategyDetail`'s exact allowlist
/// (`OperatingPlanStrategyDetailService.js:32`) — Recovery, Peptides, and
/// Supplements are deliberately not strategy types; they route through the
/// Protocol domain surfaces instead (confirmed by source audit, not
/// assumed).
enum OperatingPlanStrategyType: String, Codable, Equatable, CaseIterable {
    case energy, nutrition, training, briefings

    var title: String {
        switch self {
        case .energy: "Energy"
        case .nutrition: "Nutrition"
        case .training: "Training"
        case .briefings: "Coaching Updates"
        }
    }
}

struct OperatingPlanStrategyFieldReadModel: Codable, Equatable, Identifiable {
    var id: String { label }
    var label: String
    var value: String
}

/// Mirrors `composeOperatingPlanStrategyDetail`'s common fields (`goal`,
/// `startedDate`, `status`, `editHref`/`editLabel`) plus the per-type
/// `field(label, value)` pairs (`OperatingPlanStrategyDetailService.js:61-122`).
/// Energy has no `editLabel` in web — confirmed dead editor route
/// (`energy/new` unconditionally redirects) — so `editLabel` stays `nil`
/// for `.energy` in every fixture/live payload.
struct OperatingPlanStrategyDetailReadModel: Codable, Equatable {
    var strategyType: OperatingPlanStrategyType
    var strategyId: String
    var title: String
    var purpose: String
    var goal: String
    var startedDate: String
    var status: String
    var fields: [OperatingPlanStrategyFieldReadModel]
    var editLabel: String?
    /// Native-only addition — see the type-level doc comment above.
    /// Always empty for non-`.energy` strategy types.
    var energyPhaseHistory: [OperatingPlanEnergyPhaseSnapshotReadModel]

    var editDestination: AppDestination? {
        guard editLabel != nil else { return nil }
        return .operatingPlanStrategyEdit(strategyType: strategyType.rawValue, strategyId: strategyId)
    }
}

/// A single phase's Energy strategy, current or historical. Reuses the
/// same goal/phase identity the Goals vertical's own fixture already
/// establishes (`goal_fixture_build_lean_mass`, `phase_fixture_maintenance`,
/// `phase_fixture_lean_mass_build`) so the two verticals describe one
/// consistent product story rather than inventing a second, contradictory
/// one.
struct OperatingPlanEnergyPhaseSnapshotReadModel: Codable, Equatable, Identifiable {
    var id: String
    var phaseName: String
    var phaseOrder: Int
    var isActive: Bool
    var caloricIntake: String
    var activityTarget: String
    var reviewCadence: String
    var note: String
}

// MARK: - Strategy editors (nutrition, training, coaching updates)

/// `StrategyEditorService.js`'s `proteinBasis` values.
enum ProteinBasis: String, Codable, CaseIterable, Identifiable {
    case bodyWeight = "body_weight"
    case fixedGrams = "fixed_grams"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .bodyWeight: "Per body weight"
        case .fixedGrams: "Fixed grams"
        }
    }
}

enum CarbohydrateStrategy: String, Codable, CaseIterable, Identifiable {
    case performance
    case balanced
    case lowerCarbohydrate = "lower_carbohydrate"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .performance: "Performance"
        case .balanced: "Balanced"
        case .lowerCarbohydrate: "Lower carbohydrate"
        }
    }
}

enum FatStrategy: String, Codable, CaseIterable, Identifiable {
    case sustainableMinimum = "sustainable_minimum"
    case balanced
    case higherFat = "higher_fat"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .sustainableMinimum: "Sustainable minimum"
        case .balanced: "Balanced"
        case .higherFat: "Higher fat"
        }
    }
}

struct NutritionStrategyEditorReadModel: Codable, Equatable {
    var strategyId: String
    var proteinBasis: ProteinBasis
    var proteinRatio: Double
    var fixedProteinGrams: Double
    var carbohydrateStrategy: CarbohydrateStrategy
    var fatStrategy: FatStrategy
}

/// `TRAINING_AREAS` (`StrategyEditorService.js`).
enum TrainingStrategyArea: String, Codable, CaseIterable, Identifiable {
    case arms, core
    case lowerBody = "lower_body"
    case back, chest, shoulders
    var id: String { rawValue }
    var label: String {
        switch self {
        case .arms: "Arms"
        case .core: "Core"
        case .lowerBody: "Lower Body"
        case .back: "Back"
        case .chest: "Chest"
        case .shoulders: "Shoulders"
        }
    }
}

enum ProgressionPace: String, Codable, CaseIterable, Identifiable {
    case conservative, moderate, aggressive
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

struct TrainingAreaFrequency: Codable, Equatable, Identifiable {
    var id: String { area.rawValue }
    var area: TrainingStrategyArea
    var count: Int
}

struct TrainingStrategyEditorReadModel: Codable, Equatable {
    var strategyId: String
    var frequencies: [TrainingAreaFrequency]
    var priorities: [TrainingStrategyArea]
    var progression: ProgressionPace

    var totalWeeklySessions: Int { frequencies.reduce(0) { $0 + $1.count } }
}

/// `CoachingUpdatesReadService`/`CoachingUpdatesEditorService`'s
/// coaching-cadence fields only. The web editor also bundles Progress
/// Photos recurrence and DEXA appointment scheduling into the same save —
/// Native intentionally does not reproduce that part: Progress Photos and
/// DEXA evidence intake/review are out of this slice's boundary. Editing
/// Coaching Updates here changes only the coaching-cadence fields the
/// detail screen itself displays.
struct CoachingUpdatesEditorReadModel: Codable, Equatable {
    var strategyId: String
    var midweekCalibrationEnabled: Bool
    var midweekTimeOfDay: TimeOfDayChoice
    var weeklySynthesisEnabled: Bool
    var weeklyTimeOfDay: TimeOfDayChoice
    var routineDailyBriefingsEnabled: Bool
    var notifyWhenReady: Bool
}

enum TimeOfDayChoice: String, Codable, CaseIterable, Identifiable {
    case morning, afternoon, evening, night
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

// MARK: - Protocols: domain roll-up (Recovery / Peptide / Supplement)

/// Categories observed across the audited source. Not every case is
/// reachable from every screen — `OperatingPlanProtocolDomainReadModel`
/// only ever resolves `.recovery`, `.peptide`, or `.supplement` (the three
/// categories `StrategyDomainScreen.jsx` rolls up).
enum ProtocolCategory: String, Codable, Equatable {
    case recovery, peptide, supplement, medication, training, nutrition, energy, briefings, weight, lifestyle
}

/// Mirrors `StrategyDomainScreen.jsx`'s `DOMAIN_PRESENTATION` map.
struct OperatingPlanProtocolDomainReadModel: Codable, Equatable {
    var category: ProtocolCategory
    var title: String
    var purpose: String
    var methods: [OperatingPlanSupportMethodReadModel]
}

struct OperatingPlanSupportMethodReadModel: Codable, Equatable, Identifiable {
    var id: String
    var protocolId: String
    var name: String
    var purpose: String
    var supportSummary: String
    var currentDose: String?
    var currentSchedule: String?
    var editDestination: AppDestination?
}

// MARK: - Peptide execution (dosing)

/// `classifyPeptideExecutionState` (`PeptideExecutionManagementService.js`).
enum PeptideExecutionState: String, Codable {
    case unconfigured = "UNCONFIGURED"
    case legacyCompatible = "LEGACY_COMPATIBLE"
    case canonical = "CANONICAL"
    case invalid = "INVALID"
}

/// `PeptideDosingStrategyModel.js`'s `pattern` values.
enum PeptideDosingPattern: String, Codable, CaseIterable, Identifiable {
    case stay
    case titrateUp = "titrate_up"
    case titrateDown = "titrate_down"
    case upHoldDown = "up_hold_down"
    case custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .stay: "Stay at starting dose"
        case .titrateUp: "Titrate up"
        case .titrateDown: "Titrate down"
        case .upHoldDown: "Up, hold, then down"
        case .custom: "Custom"
        }
    }

    var usesStep: Bool { self == .titrateUp || self == .titrateDown || self == .upHoldDown }
    var usesTarget: Bool { self == .titrateUp || self == .titrateDown || self == .upHoldDown }
    var usesHold: Bool { self == .upHoldDown }
}

enum PeptideDoseStepUnit: String, Codable, CaseIterable, Identifiable {
    case days, weeks
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

struct PeptideDosingStrategyReadModel: Codable, Equatable {
    var pattern: PeptideDosingPattern
    var startingDoseAmount: Double
    var startingDoseUnit: String
    var startDate: String
    var stepAmount: Double
    var stepInterval: Int
    var stepUnit: PeptideDoseStepUnit
    var targetDoseAmount: Double
    var holdDurationWeeks: Int
}

struct PeptideDoseTimelinePhaseReadModel: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var window: String
    var doseAmount: Double
    var doseUnit: String
    var status: String
}

struct OperatingPlanPeptideExecutionReadModel: Codable, Equatable {
    var protocolId: String
    var name: String
    var purpose: String
    var state: PeptideExecutionState
    var dosing: PeptideDosingStrategyReadModel
    var timeline: [PeptideDoseTimelinePhaseReadModel]
}

// MARK: - Recovery support (generic execution item)

enum ExecutionCadence: String, Codable, CaseIterable, Identifiable {
    case daily
    case weekly
    case specificWeekdays = "specific_weekdays"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .daily: "Daily"
        case .weekly: "Weekly"
        case .specificWeekdays: "Specific days"
        }
    }
}

enum ExecutionSupport: String, Codable, CaseIterable, Identifiable {
    case inApp = "in_app"
    case none
    var id: String { rawValue }
    var label: String { self == .inApp ? "In-app reminder" : "No reminder" }
}

struct OperatingPlanRecoverySupportReadModel: Codable, Equatable {
    var executionId: String
    var name: String
    var purpose: String
    var supportSummary: String
    var cadence: ExecutionCadence
    var days: [String]
    var timeOfDay: TimeOfDayChoice
    var support: ExecutionSupport
    var notes: String
}

// MARK: - Supplement strategy editor

struct OperatingPlanGoalLinkReadModel: Codable, Equatable, Identifiable {
    var id: String
    var title: String
}

struct OperatingPlanLifecycleActionReadModel: Codable, Equatable {
    var label: String
    var isPause: Bool
}

struct SupplementEditorReadModel: Codable, Equatable {
    enum Mode: String, Codable { case create, edit }

    var mode: Mode
    var protocolId: String?
    var goalId: String
    var goalOptions: [OperatingPlanGoalLinkReadModel]
    var name: String
    var purpose: String
    var role: String
    var startDate: String
    var initialStatus: String
}

// MARK: - Editor validation (pure, mirrors StrategyEditorService's ranges)

enum NutritionStrategyValidation {
    static func error(model: NutritionStrategyEditorReadModel) -> String? {
        guard (0.5...2.0).contains(model.proteinRatio) || model.proteinBasis == .fixedGrams else {
            return "Protein ratio must be between 0.5 and 2 g per lb."
        }
        guard (50...400).contains(model.fixedProteinGrams) || model.proteinBasis == .bodyWeight else {
            return "Fixed protein must be between 50 and 400 g."
        }
        return nil
    }
}

enum TrainingStrategyValidation {
    static func error(model: TrainingStrategyEditorReadModel) -> String? {
        guard model.frequencies.allSatisfy({ (0...7).contains($0.count) }) else {
            return "Weekly frequency must be between 0 and 7 sessions per area."
        }
        guard model.totalWeeklySessions >= 1 else {
            return "Choose at least one weekly training session."
        }
        guard !model.priorities.isEmpty else {
            return "Choose at least one training priority."
        }
        return nil
    }
}

enum PeptideDosingValidation {
    static func error(model: PeptideDosingStrategyReadModel) -> String? {
        guard model.startingDoseAmount > 0 else {
            return "Enter a starting dose greater than zero."
        }
        if model.pattern.usesTarget {
            guard model.targetDoseAmount > 0 else {
                return "Enter a target dose greater than zero."
            }
        }
        if model.pattern.usesStep {
            guard model.stepAmount > 0, model.stepInterval > 0 else {
                return "Enter a step amount and interval greater than zero."
            }
        }
        if model.pattern.usesHold {
            guard model.holdDurationWeeks > 0 else {
                return "Enter a hold duration greater than zero."
            }
        }
        return nil
    }
}

enum RecoverySupportValidation {
    static func error(model: OperatingPlanRecoverySupportReadModel) -> String? {
        if model.cadence == .specificWeekdays, model.days.isEmpty {
            return "Choose at least one day."
        }
        return nil
    }
}

enum SupplementStrategyValidation {
    static func error(model: SupplementEditorReadModel) -> String? {
        guard !model.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "Enter a supplement name."
        }
        guard !model.purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "Enter a purpose."
        }
        guard !model.role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "Describe the current strategy or role."
        }
        guard !model.goalId.isEmpty else {
            return "Choose a goal."
        }
        if model.mode == .create, model.startDate.isEmpty {
            return "Choose a start date."
        }
        return nil
    }
}
