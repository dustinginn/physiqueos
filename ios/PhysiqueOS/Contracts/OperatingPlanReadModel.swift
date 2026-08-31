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
    case morning, afternoon, evening
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
                status: index == entries.count - 1 ? "active" : "completed"
            )
        }
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
