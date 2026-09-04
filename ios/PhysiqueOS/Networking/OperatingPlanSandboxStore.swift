import Foundation

struct OperatingPlanSandboxError: Error, Equatable, LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

/// Local-only mutable state for the fixture-backed Operating Plan
/// vertical, mirroring `LoggingSandboxStore`'s established role: it loads
/// the bundled fixture once, then edits (Nutrition/Training/Coaching
/// Updates strategy, Peptide dosing, Recovery support, Supplement
/// strategy) mutate this in-memory copy only. Nothing here reaches a
/// server — a future live `OperatingPlanAPI` replaces this store's reads
/// with authenticated ones and its saves with real protocol-version
/// commands, with no change required to the screens that consume it.
@Observable
final class OperatingPlanSandboxStore {
    private(set) var landing: OperatingPlanReadModel
    private var strategyDetails: [String: OperatingPlanStrategyDetailReadModel]
    private var nutritionEditors: [String: NutritionStrategyEditorReadModel]
    private var trainingEditors: [String: TrainingStrategyEditorReadModel]
    private var coachingEditors: [String: CoachingUpdatesEditorReadModel]
    private var protocolDomains: [ProtocolCategory: OperatingPlanProtocolDomainReadModel]
    private var peptideExecutions: [String: OperatingPlanPeptideExecutionReadModel]
    private var recoverySupports: [String: OperatingPlanRecoverySupportReadModel]
    private var supplementSupports: [String: OperatingPlanSupplementSupportReadModel]
    private(set) var tracking: OperatingPlanTrackingReadModel
    private var supplements: [String: SupplementEditorReadModel]
    private var supplementLifecycle: [String: String]
    private let goalOptions: [OperatingPlanGoalLinkReadModel]
    private let goalTitle: String

    /// Test-only seam: the fixture always ships with an active Training
    /// strategy (matching the current Founder's real state), so this is
    /// the one way to exercise the genuinely-unconfigured path the real
    /// `/profile/operating-plan/training/new` page's own
    /// `if (context.activeProtocol) redirect(...)` guard exists for.
    /// Defaults to `false` for every real call site.
    init(bundle: Bundle = .main, startWithoutActiveTrainingProtocol: Bool = false) {
        guard let url = bundle.url(forResource: "OperatingPlanFixture", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let fixture = try? JSONDecoder().decode(OperatingPlanFixtureFile.self, from: data)
        else {
            fatalError("OperatingPlanFixture.json is missing or malformed — it ships in the app bundle and must always decode.")
        }
        self.landing = fixture.landing
        self.strategyDetails = Dictionary(uniqueKeysWithValues: fixture.strategyDetails.map { ($0.strategyId, $0) })
        self.nutritionEditors = Dictionary(uniqueKeysWithValues: fixture.nutritionEditors.map { ($0.strategyId, $0) })
        self.trainingEditors = Dictionary(uniqueKeysWithValues: fixture.trainingEditors.map { ($0.strategyId, $0) })
        self.coachingEditors = Dictionary(uniqueKeysWithValues: fixture.coachingEditors.map { ($0.strategyId, $0) })
        self.protocolDomains = Dictionary(uniqueKeysWithValues: fixture.protocolDomains.compactMap { key, value in
            ProtocolCategory(rawValue: key).map { ($0, value) }
        })
        self.peptideExecutions = Dictionary(uniqueKeysWithValues: fixture.peptideExecutions.map { ($0.protocolId, $0) })
        self.recoverySupports = Dictionary(uniqueKeysWithValues: fixture.recoverySupports.map { ($0.executionId, $0) })
        self.supplementSupports = Dictionary(uniqueKeysWithValues: fixture.supplementSupports.map { ($0.protocolId, $0) })
        self.tracking = fixture.tracking
        self.supplements = Dictionary(uniqueKeysWithValues: fixture.supplements.map { ($0.protocolId ?? "", $0) })
        self.supplementLifecycle = fixture.supplementLifecycle
        self.goalOptions = fixture.goalOptions
        self.goalTitle = fixture.goalOptions.first?.title ?? "Build Lean Mass"
        if startWithoutActiveTrainingProtocol {
            trainingEditors[Self.trainingBuilderStrategyId] = nil
            strategyDetails[Self.trainingBuilderStrategyId] = nil
        }
        refreshTrainingLandingSection()
    }

    // MARK: - Strategy detail

    func strategyDetail(strategyType: String, strategyId: String) -> OperatingPlanStrategyDetailReadModel? {
        guard let detail = strategyDetails[strategyId], detail.strategyType.rawValue == strategyType else { return nil }
        return detail
    }

    // MARK: - Nutrition editor

    func nutritionEditor(strategyId: String) -> NutritionStrategyEditorReadModel? {
        nutritionEditors[strategyId]
    }

    @discardableResult
    func saveNutrition(_ model: NutritionStrategyEditorReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = NutritionStrategyValidation.error(model: model) {
            return .failure(.init(message: error))
        }
        nutritionEditors[model.strategyId] = model
        if var detail = strategyDetails[model.strategyId] {
            detail.fields = Self.nutritionFields(model)
            strategyDetails[model.strategyId] = detail
        }
        return .success(())
    }

    // MARK: - Training editor

    func trainingEditor(strategyId: String) -> TrainingStrategyEditorReadModel? {
        trainingEditors[strategyId]
    }

    @discardableResult
    func saveTraining(_ model: TrainingStrategyEditorReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = TrainingStrategyValidation.error(model: model) {
            return .failure(.init(message: error))
        }
        trainingEditors[model.strategyId] = model
        if var detail = strategyDetails[model.strategyId] {
            let currentPhase = detail.fields.first(where: { $0.label == "Current Phase" })?.value ?? "Lean Mass Build"
            detail.fields = Self.trainingFields(model, currentGoalPhase: currentPhase)
            strategyDetails[model.strategyId] = detail
        }
        return .success(())
    }

    // MARK: - Coaching Updates editor

    func coachingEditor(strategyId: String) -> CoachingUpdatesEditorReadModel? {
        coachingEditors[strategyId]
    }

    // MARK: - Tracking

    @discardableResult
    func saveTracking(_ model: OperatingPlanTrackingReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = SupportScheduleValidation.error(model: model.supportSchedule) {
            return .failure(.init(message: error))
        }
        tracking = model
        return .success(())
    }

    @discardableResult
    func saveCoaching(_ model: CoachingUpdatesEditorReadModel) -> Result<Void, OperatingPlanSandboxError> {
        coachingEditors[model.strategyId] = model
        if var detail = strategyDetails[model.strategyId] {
            detail.fields = Self.coachingFields(model)
            strategyDetails[model.strategyId] = detail
        }
        return .success(())
    }

    // MARK: - Phase 2 Energy Strategy (honest domain-contract extension — see GoalsSandboxModel.swift)

    private static let energyStrategyId = "strategy_fixture_energy"

    func hasEnergyStrategy(forPhaseId phaseId: String) -> Bool {
        strategyDetails[Self.energyStrategyId]?.energyPhaseHistory.contains { $0.id == phaseId } ?? false
    }

    /// Appends a new, active `OperatingPlanEnergyPhaseSnapshotReadModel`
    /// for the phase beginning, flips every prior snapshot's `isActive` to
    /// false WITHOUT removing or overwriting them (Phase 1's calibration
    /// history stays exactly as recorded), and updates the live Energy
    /// Strategy landing/detail fields to reflect the new active numbers —
    /// the same "raw command + regenerated derived display" pattern every
    /// other save method here follows.
    @discardableResult
    func establishPhaseEnergyStrategy(goalId: String, phaseId: String, phaseName: String, phaseOrder: Int, caloricMin: Int, caloricMax: Int, activityTarget: Int, reviewCadence: String, note: String) -> Result<Void, OperatingPlanSandboxError> {
        guard caloricMax >= caloricMin, caloricMin > 0, activityTarget > 0 else {
            return .failure(.init(message: "Enter a valid caloric intake range and activity target."))
        }
        guard var detail = strategyDetails[Self.energyStrategyId] else {
            return .failure(.init(message: "Energy Strategy is unavailable."))
        }
        let snapshot = OperatingPlanEnergyPhaseSnapshotReadModel(
            id: phaseId, goalId: goalId, phaseName: phaseName, phaseOrder: phaseOrder, isActive: true,
            caloricIntake: "\(caloricMin)–\(caloricMax) kcal/day", activityTarget: "\(activityTarget) active kcal/day",
            reviewCadence: reviewCadence, note: note
        )
        var history = detail.energyPhaseHistory.map { entry -> OperatingPlanEnergyPhaseSnapshotReadModel in
            var copy = entry
            copy.isActive = false
            return copy
        }
        if let existingIndex = history.firstIndex(where: { $0.id == phaseId }) {
            history[existingIndex] = snapshot
        } else {
            history.append(snapshot)
        }
        detail.energyPhaseHistory = history
        detail.fields = [
            .init(label: "Current Energy Phase", value: phaseName),
            .init(label: "Caloric Intake", value: snapshot.caloricIntake),
            .init(label: "Activity Target", value: snapshot.activityTarget),
            .init(label: "Calibration Approach", value: "\(reviewCadence) · Small adjustments"),
        ]
        strategyDetails[Self.energyStrategyId] = detail

        if let sectionIndex = landing.sections.firstIndex(where: { $0.id == "energy" }), var item = landing.sections[sectionIndex].items.first {
            item.title = "\(phaseName) Energy Strategy"
            item.detail = "\(snapshot.caloricIntake) · \(snapshot.activityTarget) · \(reviewCadence) review"
            landing.sections[sectionIndex].items = [item]
        }
        return .success(())
    }

    // MARK: - DEXA Appointment (`/profile/operating-plan/execution/dexa`)

    /// Reuses the SAME `CoachingDexaReadModel` the Coaching Updates editor
    /// already reads and writes (`coachingEditors[…].dexa`) — the real
    /// web's standalone appointment page and its Coaching Updates form
    /// both ultimately edit one `execution_next_dexa` execution item, so
    /// Native must not stand up a second, disconnected copy of this data.
    /// An empty `plannedDate` represents "not scheduled" (the web's
    /// `item === null` state), matching `DexaAppointmentDetailScreen`.
    var dexaAppointment: CoachingDexaReadModel? {
        coachingEditors.values.first?.dexa
    }

    @discardableResult
    func saveDexaAppointment(_ model: CoachingDexaReadModel, today: String = OperatingPlanSandboxStore.todayDateKey()) -> Result<Void, OperatingPlanSandboxError> {
        if let error = DexaAppointmentValidation.error(model: model, today: today) {
            return .failure(.init(message: error))
        }
        guard var editor = coachingEditors.values.first else {
            return .failure(.init(message: "Coaching settings are unavailable."))
        }
        editor.dexa = model
        coachingEditors[editor.strategyId] = editor
        if var detail = strategyDetails[editor.strategyId] {
            detail.fields = Self.coachingFields(editor)
            strategyDetails[editor.strategyId] = detail
        }
        return .success(())
    }

    // MARK: - Training Protocol Builder (`/profile/operating-plan/training/new`)

    private static let trainingBuilderStrategyId = "strategy_fixture_training"

    /// `training-protocol-create` vs `training-protocol-active`
    /// (`OperatingPlanScreen.jsx: buildTrainingPlanItem`) — whether the
    /// landing shows a "Create Protocol" row (and the builder route
    /// actually renders) or the active strategy row.
    var hasActiveTrainingProtocol: Bool {
        trainingEditors[Self.trainingBuilderStrategyId] != nil
    }

    /// `getBuilderContext` — on web this redirects away before rendering
    /// anything once a protocol is already active; Native returns that
    /// same fact for the screen to gate on instead of showing the wizard.
    func trainingProtocolBuilderContext() -> TrainingProtocolBuilderContextReadModel {
        TrainingProtocolBuilderContextReadModel(
            hasActiveProtocol: hasActiveTrainingProtocol,
            defaultFrequencies: TrainingStrategyArea.allCases.map { TrainingAreaFrequency(area: $0, count: Self.defaultTrainingFrequency[$0] ?? 0) },
            defaultRhythm: Self.defaultTrainingRhythm,
            effectiveDateLabel: Self.longDateLabel(Date())
        )
    }

    /// `createFounderTrainingProtocolActivation` + the version's write into
    /// `store.protocols`/`store.protocolVersions` on web — Native's
    /// equivalent commit is populating `trainingEditors` and
    /// `strategyDetails` for this same strategy id, then refreshing the
    /// landing row so Training flips from "Create Protocol" to "Active"
    /// exactly like the real page does after `activateInitialProtocol`.
    @discardableResult
    func activateTrainingProtocol(_ draft: TrainingProtocolBuilderDraft) -> Result<Void, OperatingPlanSandboxError> {
        guard !hasActiveTrainingProtocol else {
            return .failure(.init(message: "A Training strategy is already active."))
        }
        if let error = TrainingProtocolBuilderValidation.error(draft: draft) {
            return .failure(.init(message: error))
        }
        let editor = TrainingStrategyEditorReadModel(
            strategyId: Self.trainingBuilderStrategyId,
            frequencies: draft.frequencies,
            priorities: draft.priorities,
            progression: draft.progressionPace
        )
        trainingEditors[Self.trainingBuilderStrategyId] = editor
        strategyDetails[Self.trainingBuilderStrategyId] = OperatingPlanStrategyDetailReadModel(
            strategyType: .training,
            strategyId: Self.trainingBuilderStrategyId,
            title: "Maintenance Training Strategy",
            purpose: draft.objective.reviewSummary,
            goal: goalTitle,
            startedDate: "Started \(Self.longDateLabel(Date()))",
            status: "Active",
            fields: Self.trainingFields(editor, currentGoalPhase: "Maintenance"),
            editLabel: "Edit Training Strategy",
            energyPhaseHistory: []
        )
        refreshTrainingLandingSection()
        return .success(())
    }

    private func refreshTrainingLandingSection() {
        guard let index = landing.sections.firstIndex(where: { $0.id == "training" }) else { return }
        landing.sections[index].items = [
            hasActiveTrainingProtocol
                ? OperatingPlanSectionItemReadModel(
                    id: Self.trainingBuilderStrategyId,
                    title: "\(trainingEditors[Self.trainingBuilderStrategyId]?.totalWeeklySessions ?? 0) area sessions · \((trainingEditors[Self.trainingBuilderStrategyId]?.progression.label ?? "")) progression",
                    detail: "Priorities: \((trainingEditors[Self.trainingBuilderStrategyId]?.priorities.map(\.label).joined(separator: ", ")) ?? "")",
                    destination: .operatingPlanStrategy(strategyType: "training", strategyId: Self.trainingBuilderStrategyId),
                    status: nil
                )
                : OperatingPlanSectionItemReadModel(
                    id: "training-protocol-create",
                    title: "Training",
                    detail: "Define weekly frequency and progression strategy",
                    destination: .operatingPlanTrainingStrategyBuilder,
                    status: "Create Protocol"
                ),
        ]
    }

    static let defaultTrainingFrequency: [TrainingStrategyArea: Int] = [
        .arms: 2, .core: 2, .lowerBody: 2, .back: 1, .chest: 1, .shoulders: 1,
    ]
    static let defaultTrainingRhythm: [TrainingBuilderRhythmDay] = [
        .init(day: .monday, focus: [.chest, .shoulders], isFlexibleRecovery: false),
        .init(day: .tuesday, focus: [.lowerBody], isFlexibleRecovery: false),
        .init(day: .wednesday, focus: [.arms, .core], isFlexibleRecovery: false),
        .init(day: .thursday, focus: [.back], isFlexibleRecovery: false),
        .init(day: .friday, focus: [.lowerBody], isFlexibleRecovery: false),
        .init(day: .saturday, focus: [.arms, .core], isFlexibleRecovery: false),
        .init(day: .sunday, focus: [], isFlexibleRecovery: true),
    ]

    private static func longDateLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "America/Los_Angeles")
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }

    // MARK: - Protocol domain (Recovery / Peptide / Supplement roll-up)

    private func category(forProtocolId protocolId: String) -> ProtocolCategory? {
        for (category, domain) in protocolDomains where domain.methods.contains(where: { $0.protocolId == protocolId }) {
            return category
        }
        return nil
    }

    func protocolDomain(protocolId: String) -> OperatingPlanProtocolDomainReadModel? {
        guard let category = category(forProtocolId: protocolId) else { return nil }
        return protocolDomains[category]
    }

    // MARK: - Peptide execution / dosing

    func peptideExecution(protocolId: String) -> OperatingPlanPeptideExecutionReadModel? {
        peptideExecutions[protocolId]
    }

    @discardableResult
    func savePeptideExecution(_ model: OperatingPlanPeptideExecutionReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = SupportScheduleValidation.error(model: model.supportSchedule) ?? PeptideDosingValidation.error(model: model.dosing) {
            return .failure(.init(message: error))
        }
        var saved = model
        if let generated = PeptideDosingTimelineBuilder.build(from: model.dosing) {
            saved.timeline = generated
            saved.state = .canonical
        }
        peptideExecutions[saved.protocolId] = saved
        if let category = category(forProtocolId: saved.protocolId), var domain = protocolDomains[category],
           let index = domain.methods.firstIndex(where: { $0.protocolId == saved.protocolId }) {
            let current = saved.timeline.first(where: { $0.status == "active" })
            domain.methods[index].currentDose = current.map { Self.formatDose($0.doseAmount, $0.doseUnit) }
                ?? Self.formatDose(saved.dosing.startingDoseAmount, saved.dosing.startingDoseUnit)
            domain.methods[index].currentSchedule = Self.formatSupportSchedule(saved.supportSchedule)
            protocolDomains[category] = domain
        }
        return .success(())
    }

    @discardableResult
    func savePeptideDosing(protocolId: String, model: PeptideDosingStrategyReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = PeptideDosingValidation.error(model: model) {
            return .failure(.init(message: error))
        }
        guard var execution = peptideExecutions[protocolId] else {
            return .failure(.init(message: "This peptide protocol is unavailable."))
        }
        execution.dosing = model
        return savePeptideExecution(execution)
    }

    // MARK: - Recovery support

    func recoverySupport(executionId: String) -> OperatingPlanRecoverySupportReadModel? {
        recoverySupports[executionId]
    }

    @discardableResult
    func saveRecoverySupport(_ model: OperatingPlanRecoverySupportReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = RecoverySupportValidation.error(model: model) {
            return .failure(.init(message: error))
        }
        recoverySupports[model.executionId] = model
        if var domain = protocolDomains[.recovery],
           let index = domain.methods.firstIndex(where: { $0.editDestination == .operatingPlanRecoverySupport(executionId: model.executionId) }) {
            domain.methods[index].supportSummary = Self.formatSupportSchedule(model.supportSchedule)
            protocolDomains[.recovery] = domain
        }
        return .success(())
    }

    // MARK: - Supplement support

    func supplementSupport(protocolId: String) -> OperatingPlanSupplementSupportReadModel? {
        supplementSupports[protocolId]
    }

    @discardableResult
    func saveSupplementSupport(_ model: OperatingPlanSupplementSupportReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = SupportScheduleValidation.error(model: model.supportSchedule) {
            return .failure(.init(message: error))
        }
        supplementSupports[model.protocolId] = model
        if var domain = protocolDomains[.supplement],
           let index = domain.methods.firstIndex(where: { $0.protocolId == model.protocolId }) {
            domain.methods[index].supportSummary = Self.formatSupportSchedule(model.supportSchedule)
            protocolDomains[.supplement] = domain
        }
        return .success(())
    }

    // MARK: - Supplement strategy

    func supplementEditor(protocolId: String?) -> SupplementEditorReadModel {
        if let protocolId, let existing = supplements[protocolId] {
            return existing
        }
        return SupplementEditorReadModel(
            mode: .create,
            protocolId: nil,
            goalId: goalOptions.first?.id ?? "",
            goalOptions: goalOptions,
            name: "",
            purpose: "",
            role: "",
            startDate: Self.todayDateKey(),
            initialStatus: "active"
        )
    }

    @discardableResult
    func saveSupplement(_ model: SupplementEditorReadModel) -> Result<String, OperatingPlanSandboxError> {
        if let error = SupplementStrategyValidation.error(model: model) {
            return .failure(.init(message: error))
        }
        let protocolId = model.protocolId ?? "protocol_local_supplement_\(UUID().uuidString.prefix(8))"
        var saved = model
        saved.protocolId = protocolId
        supplements[protocolId] = saved

        var domain = protocolDomains[.supplement] ?? OperatingPlanProtocolDomainReadModel(
            category: .supplement, title: "Supplement Strategy",
            purpose: "Daily support supplements alongside the current training block.", methods: []
        )
        let method = OperatingPlanSupportMethodReadModel(
            id: "method-\(protocolId)", protocolId: protocolId, name: saved.name, purpose: saved.purpose,
            supportSummary: saved.role, currentDose: nil, currentSchedule: nil,
            editDestination: .operatingPlanSupplementSupport(protocolId: protocolId)
        )
        if let index = domain.methods.firstIndex(where: { $0.protocolId == protocolId }) {
            domain.methods[index] = method
        } else {
            domain.methods.append(method)
        }
        protocolDomains[.supplement] = domain
        if supplementSupports[protocolId] == nil {
            supplementSupports[protocolId] = OperatingPlanSupplementSupportReadModel(
                protocolId: protocolId,
                name: saved.name,
                supportSummary: "Daily · Morning",
                doseAmount: "",
                doseUnit: "",
                supportSchedule: OperatingPlanSupportScheduleReadModel(
                    frequency: .daily,
                    daysOfWeek: [],
                    intervalDays: 1,
                    timing: .morning,
                    specificTime: "",
                    startDate: saved.startDate,
                    endDate: nil
                ),
                reminderPreference: .none,
                notes: ""
            )
        }
        supplementLifecycle[protocolId] = model.mode == .create ? "active" : (supplementLifecycle[protocolId] ?? "active")
        return .success(protocolId)
    }

    func supplementStatus(protocolId: String) -> String {
        supplementLifecycle[protocolId] ?? "active"
    }

    func lifecycleAction(protocolId: String) -> OperatingPlanLifecycleActionReadModel {
        let isActive = supplementStatus(protocolId: protocolId) == "active"
        return .init(label: isActive ? "Pause" : "Restore", isPause: isActive)
    }

    func setSupplementPaused(protocolId: String, paused: Bool) {
        supplementLifecycle[protocolId] = paused ? "paused" : "active"
    }

    // MARK: - Presentation formatting (mirrors StrategyEditorService's own copy)

    static func nutritionFields(_ model: NutritionStrategyEditorReadModel) -> [OperatingPlanStrategyFieldReadModel] {
        let protein = model.proteinBasis == .fixedGrams
            ? "\(Int(model.fixedProteinGrams)) g"
            : "\(Self.trimmed(model.proteinRatio)) g per lb bodyweight"
        return [
            .init(label: "Protein Target", value: protein),
            .init(label: "Carbohydrate Approach", value: model.carbohydrateStrategy.label),
            .init(label: "Fat Approach", value: model.fatStrategy.label),
            .init(label: "Macro Philosophy", value: "\(model.carbohydrateStrategy.label) carbohydrates paired with \(model.fatStrategy.label.lowercased()) fat, adjusted around training days."),
        ]
    }

    static func trainingFields(_ model: TrainingStrategyEditorReadModel, currentGoalPhase: String) -> [OperatingPlanStrategyFieldReadModel] {
        [
            .init(label: "Weekly Structure", value: "\(model.totalWeeklySessions) area sessions"),
            .init(label: "Training Focus", value: model.priorities.map(\.label).joined(separator: ", ")),
            .init(label: "Progression", value: model.progression.label),
            .init(label: "Current Phase", value: currentGoalPhase),
        ]
    }

    static func coachingFields(_ model: CoachingUpdatesEditorReadModel) -> [OperatingPlanStrategyFieldReadModel] {
        [
            .init(label: "Midweek Calibration", value: coachingScheduleSummary(model.midweek)),
            .init(label: "Weekly Synthesis", value: coachingScheduleSummary(model.weekly)),
            .init(label: "Routine Daily Briefings", value: "Off"),
            .init(label: "Notifications", value: model.notificationPreference == .notifyWhenReady ? "Notify when ready" : "Available without notification"),
            .init(label: "Event Briefings", value: eventBriefingSummary(model)),
        ]
    }

    static func formatSupportSchedule(_ model: OperatingPlanSupportScheduleReadModel) -> String {
        let cadence: String
        switch model.frequency {
        case .daily: cadence = "Daily"
        case .weekly: cadence = model.daysOfWeek.first.map { "\($0.label)s" } ?? "Weekly"
        case .specificDays: cadence = model.daysOfWeek.map(\.shortLabel).joined(separator: ", ")
        case .everyXDays: cadence = model.intervalDays == 2 ? "Every other day" : "Every \(model.intervalDays) days"
        }
        let time = model.timing == .specific ? formattedLocalTime(model.specificTime) : model.timing.label
        return [cadence, time].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private static func coachingScheduleSummary(_ model: CoachingUpdateScheduleReadModel) -> String {
        model.enabled ? "On · \(model.day.label) · \(formattedLocalTime(model.localTime))" : "Off"
    }

    private static func eventBriefingSummary(_ model: CoachingUpdatesEditorReadModel) -> String {
        let enabled = [model.photoEventBriefingEnabled ? "Photo" : nil, model.dexaEventBriefingEnabled ? "DEXA" : nil].compactMap { $0 }
        return enabled.isEmpty ? "Off" : "\(enabled.joined(separator: " and ")) active when eligible"
    }

    static func formattedLocalTime(_ value: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        guard let date = formatter.date(from: value) else { return value }
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private static func formatDose(_ amount: Double, _ unit: String) -> String {
        "\(trimmed(amount)) \(unit)"
    }

    private static func trimmed(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func todayDateKey() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}

/// Decode shape for `OperatingPlanFixture.json`, kept separate from the
/// presentation read models above since the fixture's top level (grouped
/// by editor/domain kind, keyed collections) is a storage convenience, not
/// a claimed server response shape.
private struct OperatingPlanFixtureFile: Codable {
    var landing: OperatingPlanReadModel
    var strategyDetails: [OperatingPlanStrategyDetailReadModel]
    var nutritionEditors: [NutritionStrategyEditorReadModel]
    var trainingEditors: [TrainingStrategyEditorReadModel]
    var coachingEditors: [CoachingUpdatesEditorReadModel]
    var protocolDomains: [String: OperatingPlanProtocolDomainReadModel]
    var peptideExecutions: [OperatingPlanPeptideExecutionReadModel]
    var recoverySupports: [OperatingPlanRecoverySupportReadModel]
    var supplementSupports: [OperatingPlanSupplementSupportReadModel]
    var tracking: OperatingPlanTrackingReadModel
    var supplements: [SupplementEditorReadModel]
    var supplementLifecycle: [String: String]
    var goalOptions: [OperatingPlanGoalLinkReadModel]
}
