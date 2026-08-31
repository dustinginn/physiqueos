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
    private var supplements: [String: SupplementEditorReadModel]
    private var supplementLifecycle: [String: String]
    private let goalOptions: [OperatingPlanGoalLinkReadModel]
    private let goalTitle: String

    init(bundle: Bundle = .main) {
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
        self.supplements = Dictionary(uniqueKeysWithValues: fixture.supplements.map { ($0.protocolId ?? "", $0) })
        self.supplementLifecycle = fixture.supplementLifecycle
        self.goalOptions = fixture.goalOptions
        self.goalTitle = fixture.goalOptions.first?.title ?? "Build Lean Mass"
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
            let currentPhase = detail.fields.first(where: { $0.label == "Current Goal Phase" })?.value ?? "Lean Mass Build"
            detail.fields = Self.trainingFields(model, currentGoalPhase: currentPhase)
            strategyDetails[model.strategyId] = detail
        }
        return .success(())
    }

    // MARK: - Coaching Updates editor

    func coachingEditor(strategyId: String) -> CoachingUpdatesEditorReadModel? {
        coachingEditors[strategyId]
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
    func savePeptideDosing(protocolId: String, model: PeptideDosingStrategyReadModel) -> Result<Void, OperatingPlanSandboxError> {
        if let error = PeptideDosingValidation.error(model: model) {
            return .failure(.init(message: error))
        }
        guard var execution = peptideExecutions[protocolId] else {
            return .failure(.init(message: "This peptide protocol is unavailable."))
        }
        execution.dosing = model
        execution.state = .canonical
        peptideExecutions[protocolId] = execution
        if let category = category(forProtocolId: protocolId), var domain = protocolDomains[category],
           let index = domain.methods.firstIndex(where: { $0.protocolId == protocolId }) {
            domain.methods[index].currentDose = Self.formatDose(model.startingDoseAmount, model.startingDoseUnit)
            protocolDomains[category] = domain
        }
        return .success(())
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
            editDestination: .operatingPlanSupplementEdit(protocolId: protocolId)
        )
        if let index = domain.methods.firstIndex(where: { $0.protocolId == protocolId }) {
            domain.methods[index] = method
        } else {
            domain.methods.append(method)
        }
        protocolDomains[.supplement] = domain
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
            .init(label: "Current Goal Phase", value: currentGoalPhase),
            .init(label: "Training Context", value: "Goal-level strategy"),
        ]
    }

    static func coachingFields(_ model: CoachingUpdatesEditorReadModel) -> [OperatingPlanStrategyFieldReadModel] {
        [
            .init(label: "Midweek Calibration", value: "\(model.midweekCalibrationEnabled ? "On" : "Off") · \(model.midweekTimeOfDay.label)"),
            .init(label: "Weekly Synthesis", value: "\(model.weeklySynthesisEnabled ? "On" : "Off") · \(model.weeklyTimeOfDay.label)"),
            .init(label: "Routine Daily Briefings", value: model.routineDailyBriefingsEnabled ? "On" : "Off"),
            .init(label: "Notifications", value: model.notifyWhenReady ? "Notify when ready" : "Available without notification"),
            .init(label: "Event Briefings", value: "Photo and DEXA remain active when eligible"),
        ]
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
    var supplements: [SupplementEditorReadModel]
    var supplementLifecycle: [String: String]
    var goalOptions: [OperatingPlanGoalLinkReadModel]
}
