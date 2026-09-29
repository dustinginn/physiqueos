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
    var goalId: String
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

enum OperatingPlanWeekday: String, Codable, CaseIterable, Identifiable {
    case sunday, monday, tuesday, wednesday, thursday, friday, saturday
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var shortLabel: String { String(label.prefix(3)) }
}

struct CoachingUpdateScheduleReadModel: Codable, Equatable {
    var enabled: Bool
    var day: OperatingPlanWeekday
    /// Exact local `HH:mm` value. The web uses 15-minute choices rather
    /// than a broad morning/afternoon bucket.
    var localTime: String
}

struct CoachingMonthlyScheduleReadModel: Codable, Equatable {
    var enabled: Bool
    var dayOfMonth: Int
    var localTime: String
}

enum ProgressPhotoCadence: String, Codable, CaseIterable, Identifiable {
    case weekly
    case everyTwoWeeks = "weekly_interval_2"
    var id: String { rawValue }
    var label: String { self == .weekly ? "Weekly" : "Every 2 weeks" }
}

struct CoachingProgressPhotosReadModel: Codable, Equatable {
    var cadence: ProgressPhotoCadence
    var day: OperatingPlanWeekday
    var timeOfDay: TimeOfDayChoice
    var specificTime: String?
    var reminderEnabled: Bool
}

enum DexaReminderPreference: String, Codable, CaseIterable, Identifiable {
    case weekBefore = "week_before"
    case dayBefore = "day_before"
    case morningOf = "morning_of"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .weekBefore: "Remind me 1 week before"
        case .dayBefore: "Remind me 1 day before"
        case .morningOf: "Remind me the morning of"
        }
    }
}

struct CoachingDexaReadModel: Codable, Equatable {
    var plannedDate: String
    var localTime: String
    var reminderPreferences: [DexaReminderPreference]
    var uploadReminder: Bool
    var preparationNote: String
}

enum CoachingNotificationPreference: String, Codable, CaseIterable, Identifiable {
    case notifyWhenReady = "notify_when_ready"
    case availableWithoutNotification = "available_without_notification"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .notifyWhenReady: "Notify me when an update is ready"
        case .availableWithoutNotification: "Keep updates available without a notification"
        }
    }
}

/// The complete currently reachable Coaching Updates editor contract.
/// Progress Photos and DEXA scheduling are part of this web form and must
/// remain visible even though their sandbox saves are local today.
struct CoachingUpdatesEditorReadModel: Codable, Equatable {
    var strategyId: String
    var midweek: CoachingUpdateScheduleReadModel
    var weekly: CoachingUpdateScheduleReadModel
    var monthly: CoachingMonthlyScheduleReadModel
    var photos: CoachingProgressPhotosReadModel
    var dexa: CoachingDexaReadModel
    var photoEventBriefingEnabled: Bool
    var dexaEventBriefingEnabled: Bool
    var notificationPreference: CoachingNotificationPreference
}

enum TimeOfDayChoice: String, Codable, CaseIterable, Identifiable {
    case morning, afternoon, evening, specific
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
    var lifecycleState: String? = nil
    var currentVersionId: String? = nil
    var name: String
    var purpose: String
    var supportSummary: String
    var currentDose: String?
    var currentSchedule: String?
    /// Optional for compatibility with the frozen Build 33 fixture and older
    /// production payloads. New production reads always project the value.
    var reminderEnabled: Bool?
    var editDestination: AppDestination?
}

// MARK: - Shared recurring Support schedule

enum SupportScheduleFrequency: String, Codable, CaseIterable, Identifiable {
    case daily, weekly
    case specificDays = "specific_days"
    case everyXDays = "every_x_days"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .daily: "Daily"
        case .weekly: "Weekly"
        case .specificDays: "Specific days"
        case .everyXDays: "Every X days"
        }
    }
}

enum SupportScheduleTiming: String, Codable, CaseIterable, Identifiable {
    case morning, afternoon, evening, specific
    var id: String { rawValue }
    var label: String { self == .specific ? "Specific time" : rawValue.capitalized }
}

struct OperatingPlanSupportScheduleReadModel: Codable, Equatable {
    var frequency: SupportScheduleFrequency
    var daysOfWeek: [OperatingPlanWeekday]
    var intervalDays: Int
    var timing: SupportScheduleTiming
    var specificTime: String
    var startDate: String
    var endDate: String?
}

enum OperatingPlanReminderPreference: String, Codable, CaseIterable, Identifiable {
    case remind, none
    var id: String { rawValue }
    var label: String { self == .remind ? "Remind me" : "No reminder" }
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
    var holdDuration: Int
    var holdUnit: PeptideDoseStepUnit
    var decreaseAmount: Double
    var decreaseInterval: Int
    var decreaseUnit: PeptideDoseStepUnit
    var landingDoseAmount: Double
    var endDate: String?
}

struct PeptideDoseTimelinePhaseReadModel: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var window: String
    var doseAmount: Double
    var doseUnit: String
    var status: String
    /// Calendar dates of the phase (`YYYY-MM-DD`). Optional: the production
    /// read projects only the presentation `window`, while the sandbox
    /// fixture carries them so the local save can keep dated history the
    /// same way the Server's history-preserving composition does (S1).
    var startDate: String? = nil
    var endDate: String? = nil
}

// MARK: - Peptide lifecycle / current dose (S4 read additions)

/// `operating-plan-peptide-support.lifecycle` — a dated suspension window on
/// the execution item (`scheduleSuspensions`). `state` is a closed
/// `active|paused` vocabulary on the wire, decoded as a String so an
/// unexpected value degrades to "not paused" instead of failing the read.
struct PeptideLifecycleReadModel: Codable, Equatable, Sendable {
    var state: String
    var since: String?
    var history: [PeptideLifecycleEventReadModel]

    init(state: String, since: String? = nil, history: [PeptideLifecycleEventReadModel] = []) {
        self.state = state
        self.since = since
        self.history = history
    }

    private enum CodingKeys: String, CodingKey { case state, since, history }

    /// `history` decodes lossily: one malformed event never fails the read.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        state = try container.decode(String.self, forKey: .state)
        since = try container.decodeIfPresent(String.self, forKey: .since)
        history = try container.decodeIfPresent(LossyDecodableArray<PeptideLifecycleEventReadModel>.self, forKey: .history)?.elements ?? []
    }

    var isPaused: Bool { state == "paused" }
}

struct PeptideLifecycleEventReadModel: Codable, Equatable, Sendable {
    var state: String
    var effectiveDate: String
    var at: String
    var reason: String? = nil
}

/// `{ amount, unit }` as the Server emits `currentDose`, `plannedChanges[].dose`
/// and `dosingHistory[].dose`.
struct PeptideDoseValueReadModel: Codable, Equatable, Sendable {
    var amount: Double
    var unit: String
}

/// `currentPhase` — the dated window the current dose belongs to.
struct PeptideDosePhaseWindowReadModel: Codable, Equatable, Sendable {
    var startDate: String
    var endDate: String? = nil
}

/// One future dose change (`plannedChanges[]`), Server-labelled.
struct PeptidePlannedChangeReadModel: Codable, Equatable, Sendable {
    var startDate: String
    var dose: PeptideDoseValueReadModel
    var label: String
}

/// One past phase (`dosingHistory[]`, newest first).
struct PeptideDosingHistoryEntryReadModel: Codable, Equatable, Sendable {
    var startDate: String
    var endDate: String? = nil
    var dose: PeptideDoseValueReadModel
    var label: String
}

/// Decodes an unkeyed container element by element, dropping the elements
/// that fail to decode instead of failing the whole array. Used for every
/// additive peptide list so one malformed Server element can never take
/// the peptide screen down.
struct LossyDecodableArray<Element: Decodable>: Decodable {
    var elements: [Element]

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var decoded: [Element] = []
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                decoded.append(element)
            } else {
                // Advance past the malformed element; without this the
                // container would never reach its end.
                _ = try? container.decode(LossyDecodableSkip.self)
            }
        }
        elements = decoded
    }
}

/// Accepts any JSON value so a malformed element can be consumed and skipped.
struct LossyDecodableSkip: Decodable {
    init(from decoder: Decoder) throws {}
}

struct OperatingPlanPeptideExecutionReadModel: Codable, Equatable {
    var protocolId: String
    var name: String
    var purpose: String
    var state: PeptideExecutionState
    var supportSchedule: OperatingPlanSupportScheduleReadModel
    var dosing: PeptideDosingStrategyReadModel
    var timeline: [PeptideDoseTimelinePhaseReadModel]
    var reminderPreference: OperatingPlanReminderPreference
    var notes: String
    var nextDue: String? = nil
    // S4 additions. Every key is optional with a default so the bundled
    // fixture and any older sandbox snapshot keep decoding unchanged.
    var executionRevision: Int? = nil
    var lifecycle: PeptideLifecycleReadModel? = nil
    var currentDose: PeptideDoseValueReadModel? = nil
    var currentDoseLabel: String? = nil
    var currentPhase: PeptideDosePhaseWindowReadModel? = nil
    var plannedChanges: [PeptidePlannedChangeReadModel]? = nil
    var dosingHistory: [PeptideDosingHistoryEntryReadModel]? = nil
    var dosingMode: String? = nil
    var advancedPlan: Bool? = nil
    var nextDueDate: String? = nil
    var nextDueTime: String? = nil
    var priorityId: String? = nil
}

// MARK: - Recovery support (generic execution item)

struct OperatingPlanRecoverySupportReadModel: Codable, Equatable {
    var executionId: String
    var name: String
    var purpose: String
    var supportSummary: String
    var supportSchedule: OperatingPlanSupportScheduleReadModel
    var reminderPreference: OperatingPlanReminderPreference
    var notes: String
    var nextDue: String? = nil
}

struct OperatingPlanSupplementSupportReadModel: Codable, Equatable {
    var protocolId: String
    var name: String
    var supportSummary: String
    var doseAmount: String
    var doseUnit: String
    var supportSchedule: OperatingPlanSupportScheduleReadModel
    var reminderPreference: OperatingPlanReminderPreference
    var notes: String
    var nextDue: String? = nil
}

struct OperatingPlanTrackingReadModel: Codable, Equatable {
    var executionId: String
    var title: String
    var purpose: String
    var currentSupport: String
    var completion: String
    var supportSchedule: OperatingPlanSupportScheduleReadModel
    var reminderPreference: OperatingPlanReminderPreference
    var notes: String
    var nextDue: String? = nil
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
        if model.pattern == .custom { return nil }
        guard model.startingDoseAmount > 0 else {
            return "Enter a starting dose greater than zero."
        }
        guard !model.startingDoseUnit.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return "Enter a dose unit."
        }
        guard model.startDate.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            return "Choose a valid dosing start date."
        }
        if let endDate = model.endDate, endDate < model.startDate {
            return "Choose an end date after the dosing start date."
        }
        if model.pattern.usesTarget {
            guard model.targetDoseAmount > 0 else {
                return "Enter a target dose greater than zero."
            }
            if model.pattern == .titrateUp || model.pattern == .upHoldDown,
               model.targetDoseAmount < model.startingDoseAmount {
                return "Target dose must be at least the starting dose."
            }
            if model.pattern == .titrateDown,
               model.targetDoseAmount >= model.startingDoseAmount {
                return "Target dose must be below the starting dose."
            }
        }
        if model.pattern.usesStep {
            guard model.stepAmount > 0, model.stepInterval > 0 else {
                return "Enter a step amount and interval greater than zero."
            }
        }
        if model.pattern.usesHold {
            guard model.holdDuration > 0, model.decreaseAmount > 0, model.decreaseInterval > 0,
                  model.landingDoseAmount > 0, model.landingDoseAmount <= model.targetDoseAmount else {
                return "Enter a hold duration greater than zero."
            }
        }
        return nil
    }
}

/// Fixture-side projection of the web's pure
/// `generatePeptideDosingTimeline` helper. It does not evaluate treatment
/// decisions; it only keeps the editable structured strategy and its
/// generated read presentation coherent inside the sandbox.
enum PeptideDosingTimelineBuilder {
    static func build(from model: PeptideDosingStrategyReadModel) -> [PeptideDoseTimelinePhaseReadModel]? {
        guard model.pattern != .custom, PeptideDosingValidation.error(model: model) == nil,
              let start = date(from: model.startDate) else { return nil }

        var entries: [(date: Date, dose: Double, note: String)] = [(start, model.startingDoseAmount, "")]
        switch model.pattern {
        case .stay:
            break
        case .titrateUp:
            addSteps(to: &entries, direction: 1, amount: model.stepAmount, interval: model.stepInterval, unit: model.stepUnit, target: model.targetDoseAmount)
        case .titrateDown:
            addSteps(to: &entries, direction: -1, amount: model.stepAmount, interval: model.stepInterval, unit: model.stepUnit, target: model.targetDoseAmount)
        case .upHoldDown:
            addSteps(to: &entries, direction: 1, amount: model.stepAmount, interval: model.stepInterval, unit: model.stepUnit, target: model.targetDoseAmount)
            entries[entries.count - 1].note = "Hold for \(model.holdDuration) \(model.holdUnit.rawValue)"
            let decreaseStart = add(model.holdDuration, unit: model.holdUnit, to: entries[entries.count - 1].date)
            if model.landingDoseAmount < model.targetDoseAmount {
                entries.append((decreaseStart, max(model.targetDoseAmount - model.decreaseAmount, 0), ""))
                addSteps(to: &entries, direction: -1, amount: model.decreaseAmount, interval: model.decreaseInterval, unit: model.decreaseUnit, target: model.landingDoseAmount)
            }
        case .custom:
            return nil
        }

        return entries.enumerated().map { index, entry in
            let end = index < entries.count - 1
                ? add(-1, unit: .days, to: entries[index + 1].date)
                : model.endDate.flatMap(date(from:))
            let window = end.map { "\(display(entry.date)) – \(display($0))" } ?? "\(display(entry.date)) – Until changed"
            return PeptideDoseTimelinePhaseReadModel(
                id: "generated-phase-\(index + 1)",
                label: entry.note.isEmpty ? "Phase \(index + 1)" : entry.note,
                window: window,
                doseAmount: rounded(entry.dose),
                doseUnit: model.startingDoseUnit,
                status: index == entries.count - 1 ? "active" : "completed",
                startDate: dateFormatter.string(from: entry.date),
                endDate: end.map { dateFormatter.string(from: $0) }
            )
        }
    }

    /// Sandbox projection of the Server's history-preserving composition
    /// (design S1): the stored timeline becomes the frozen phases before
    /// `strategy.startDate` plus the phases the strategy generates, in this
    /// order — (a) drop every existing phase with `start >= startDate`;
    /// (b) if the last remaining phase is open or ends on/after `startDate`,
    /// close it at `startDate − 1`; (c) append the generated phases. Phase
    /// statuses are then resolved against `today`. Returns nil when the
    /// strategy cannot generate (custom / invalid), exactly like `build`.
    /// Existing phases without dates cannot be frozen honestly, so a legacy
    /// undated timeline falls back to the generated phases alone.
    static func compose(
        existing: [PeptideDoseTimelinePhaseReadModel],
        strategy: PeptideDosingStrategyReadModel,
        today: String
    ) -> [PeptideDoseTimelinePhaseReadModel]? {
        guard let generated = build(from: strategy) else { return nil }
        guard existing.allSatisfy({ $0.startDate != nil }) else {
            return generated.map { resolveStatus($0, today: today) }
        }
        let cut = strategy.startDate
        var frozen = existing.filter { ($0.startDate ?? "") < cut }
        if let lastIndex = frozen.indices.last {
            let last = frozen[lastIndex]
            if last.endDate == nil || (last.endDate ?? "") >= cut,
               let cutDate = date(from: cut) {
                let closedOn = add(-1, unit: .days, to: cutDate)
                frozen[lastIndex].endDate = dateFormatter.string(from: closedOn)
                frozen[lastIndex].window = "\(display(date(from: last.startDate ?? "") ?? closedOn)) – \(display(closedOn))"
            }
        }
        let renumbered = generated.enumerated().map { index, phase -> PeptideDoseTimelinePhaseReadModel in
            var copy = phase
            copy.id = "generated-phase-\(frozen.count + index + 1)"
            if copy.label.hasPrefix("Phase ") { copy.label = "Phase \(frozen.count + index + 1)" }
            return copy
        }
        return (frozen + renumbered).map { resolveStatus($0, today: today) }
    }

    /// `upcoming` / `active` / `completed` by calendar date, mirroring the
    /// Server's `projectPeptideTimeline` status vocabulary.
    static func resolveStatus(_ phase: PeptideDoseTimelinePhaseReadModel, today: String) -> PeptideDoseTimelinePhaseReadModel {
        guard let start = phase.startDate else { return phase }
        var copy = phase
        if start > today {
            copy.status = "upcoming"
        } else if let end = phase.endDate, end < today {
            copy.status = "completed"
        } else {
            copy.status = "active"
        }
        return copy
    }

    private static func addSteps(
        to entries: inout [(date: Date, dose: Double, note: String)],
        direction: Double,
        amount: Double,
        interval: Int,
        unit: PeptideDoseStepUnit,
        target: Double
    ) {
        var current = entries[entries.count - 1].dose
        var currentDate = entries[entries.count - 1].date
        for _ in 0..<500 where abs(current - target) > 0.000_001 {
            let candidate = rounded(current + direction * amount)
            current = direction > 0 ? min(candidate, target) : max(candidate, target)
            currentDate = add(interval, unit: unit, to: currentDate)
            entries.append((currentDate, current, ""))
        }
    }

    private static func date(from value: String) -> Date? { dateFormatter.date(from: value) }
    private static func add(_ count: Int, unit: PeptideDoseStepUnit, to date: Date) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.date(byAdding: .day, value: count * (unit == .weeks ? 7 : 1), to: date) ?? date
    }
    private static func display(_ date: Date) -> String { displayFormatter.string(from: date) }
    private static func rounded(_ value: Double) -> Double { (value * 1_000_000).rounded() / 1_000_000 }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    private static let displayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "MMM d"
        return formatter
    }()
}

enum RecoverySupportValidation {
    static func error(model: OperatingPlanRecoverySupportReadModel) -> String? {
        SupportScheduleValidation.error(model: model.supportSchedule)
    }
}

// MARK: - DEXA Appointment (`/profile/operating-plan/execution/dexa`)

/// `validateDexaAppointmentDraft` (`DexaAppointmentManagementService.js`) —
/// an empty `plannedDate` is always valid (it means "clear the schedule");
/// a non-empty one must be a real future date, and `localTime` if present
/// must be `HH:mm`.
enum DexaAppointmentValidation {
    static func error(model: CoachingDexaReadModel, today: String) -> String? {
        guard !model.plannedDate.isEmpty else { return nil }
        guard model.plannedDate.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              model.plannedDate > today else {
            return "Choose a future date for your next DEXA."
        }
        if !model.localTime.isEmpty,
           model.localTime.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) == nil {
            return "Choose a valid local appointment time."
        }
        return nil
    }
}

// MARK: - Training Protocol Builder (`/profile/operating-plan/training/new`)

/// `TrainingProtocolBuilderScreen.jsx` step 2's four objectives.
enum TrainingBuilderObjective: String, Codable, CaseIterable, Identifiable {
    case preserveLeanMass = "preserve_lean_mass"
    case recomposition
    case maximizeMuscleGrowth = "maximize_muscle_growth"
    case improvePerformance = "improve_performance"
    var id: String { rawValue }

    var label: String {
        switch self {
        case .preserveLeanMass: "Preserve lean mass"
        case .recomposition: "Recomposition"
        case .maximizeMuscleGrowth: "Maximize muscle growth"
        case .improvePerformance: "Improve performance"
        }
    }
    var detail: String {
        switch self {
        case .preserveLeanMass: "Maintain the muscle and strength you already have while limiting losses during a deficit or transition."
        case .recomposition: "Gradually add muscle while keeping body fat relatively stable."
        case .maximizeMuscleGrowth: "Prioritize adding muscle as efficiently as possible."
        case .improvePerformance: "Prioritize strength, work capacity, or athletic output over physique change."
        }
    }
    var impact: String {
        switch self {
        case .preserveLeanMass: "Progression can be slower, and maintaining performance may count as success."
        case .recomposition: "Progress is slower than a dedicated bulk, but it fits well near maintenance calories."
        case .maximizeMuscleGrowth: "This usually requires a calorie surplus, stronger recovery, and some tolerance for fat gain."
        case .improvePerformance: "Exercise selection and progression will be judged primarily by performance outcomes."
        }
    }
    /// `objectiveLabel` (`TrainingProtocolBuilderService.js`) — the review-screen summary sentence.
    var reviewSummary: String {
        switch self {
        case .preserveLeanMass: "Preserve lean mass through the end of the cut, then restore performance in maintenance."
        case .recomposition: "Improve body composition while building steady training performance."
        case .maximizeMuscleGrowth: "Make muscle growth the primary outcome of the training plan."
        case .improvePerformance: "Make measurable training performance the primary outcome."
        }
    }
}

/// `TrainingProtocolBuilderScreen.jsx` step 8's three nutrition phases.
enum TrainingBuilderNutritionPhase: String, Codable, CaseIterable, Identifiable {
    case deficit, maintenance, surplus
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var detail: String {
        switch self {
        case .deficit: "Calories are below maintenance, so training is mainly protecting muscle and strength."
        case .maintenance: "Calories are near energy balance, allowing performance to recover and gradual progression to resume."
        case .surplus: "Calories are above maintenance to provide more energy for recovery and growth."
        }
    }
    var impact: String {
        switch self {
        case .deficit: "Progression may slow, and maintaining performance can still represent a successful phase."
        case .maintenance: "Muscle gain is possible, but rapid increases in lean mass should not be assumed."
        case .surplus: "Volume and progression can be pushed more aggressively, with some potential body-fat gain accepted."
        }
    }
}

/// `TrainingProtocolBuilderScreen.jsx` step 9's four recovery safeguards.
enum TrainingBuilderRecoveryGate: String, Codable, CaseIterable, Identifiable {
    case recoveryDeclines = "recovery_declines"
    case painDevelops = "pain_develops"
    case performanceRegresses = "performance_regresses"
    case evidenceIncomplete = "evidence_incomplete"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .recoveryDeclines: "Recovery declines"
        case .painDevelops: "Pain develops"
        case .performanceRegresses: "Performance regresses"
        case .evidenceIncomplete: "The evidence is incomplete"
        }
    }
    var detail: String {
        switch self {
        case .recoveryDeclines: "Hold increases when your recovery trend no longer supports more demand."
        case .painDevelops: "Avoid progressing through a new or worsening pain signal."
        case .performanceRegresses: "Pause when repeated sessions show performance moving backward."
        case .evidenceIncomplete: "Wait when there isn't enough reliable training evidence to judge readiness."
        }
    }
}

/// One day of the preferred weekly rhythm editor (step 5) — `focus` is
/// empty and `isFlexibleRecovery` is true for a day left open, mirroring
/// `WeeklySplitEditor`'s "Flexible / Recovery" toggle.
struct TrainingBuilderRhythmDay: Codable, Equatable, Identifiable {
    var id: String { day.rawValue }
    var day: OperatingPlanWeekday
    var focus: [TrainingStrategyArea]
    var isFlexibleRecovery: Bool
}

/// `getBuilderContext` (`TrainingProtocolBuilderService.js`) — whether a
/// protocol is already active gates the entire route on web (the page
/// redirects to `/profile/operating-plan?training=active` before ever
/// rendering the wizard), so Native mirrors the same gate rather than
/// always showing the builder.
struct TrainingProtocolBuilderContextReadModel: Codable, Equatable {
    var hasActiveProtocol: Bool
    var defaultFrequencies: [TrainingAreaFrequency]
    var defaultRhythm: [TrainingBuilderRhythmDay]
    var effectiveDateLabel: String
}

/// The wizard's in-progress selections (`TrainingProtocolBuilderScreen.jsx`'s
/// local `useState` fields), collected into one draft so the 11 steps and
/// the review/activation call operate on a single testable value rather
/// than scattered view state.
struct TrainingProtocolBuilderDraft: Equatable {
    var objective: TrainingBuilderObjective = .preserveLeanMass
    var priorities: [TrainingStrategyArea] = [.arms, .core, .lowerBody]
    var frequencies: [TrainingAreaFrequency]
    var rhythm: [TrainingBuilderRhythmDay]
    var progressionPace: ProgressionPace = .moderate
    var nutritionPhase: TrainingBuilderNutritionPhase = .maintenance
    var recoveryGates: [TrainingBuilderRecoveryGate] = [.recoveryDeclines, .painDevelops, .performanceRegresses, .evidenceIncomplete]

    var totalWeeklySessions: Int { frequencies.reduce(0) { $0 + $1.count } }

    init(context: TrainingProtocolBuilderContextReadModel) {
        frequencies = context.defaultFrequencies
        rhythm = context.defaultRhythm
    }
}

/// `validateTrainingProtocolInput` (`TrainingProtocolBuilderService.js`).
enum TrainingProtocolBuilderValidation {
    static func error(draft: TrainingProtocolBuilderDraft) -> String? {
        guard !draft.priorities.isEmpty else { return "Choose at least one physique priority." }
        guard draft.frequencies.allSatisfy({ (0...4).contains($0.count) }) else {
            return "Choose a valid weekly frequency for every area."
        }
        guard draft.rhythm.count == 7 else { return "Define a preferred rhythm for each day of the week." }
        return nil
    }
}

enum SupportScheduleValidation {
    static func error(model: OperatingPlanSupportScheduleReadModel) -> String? {
        guard model.startDate.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            return "Choose a valid start date."
        }
        if let endDate = model.endDate, endDate < model.startDate { return "Choose an end date after the start date." }
        if [.weekly, .specificDays].contains(model.frequency), model.daysOfWeek.isEmpty { return "Choose at least one day." }
        if model.frequency == .weekly, model.daysOfWeek.count != 1 { return "Choose one weekly day." }
        if model.frequency == .everyXDays, model.intervalDays < 1 { return "Choose a valid day interval." }
        if model.timing == .specific,
           model.specificTime.range(of: #"^([01]\d|2[0-3]):[0-5]\d$"#, options: .regularExpression) == nil {
            return "Choose a valid time."
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
