import Foundation

/// Typed production Peptide Support boundary. The server hydrates this read
/// with the same peptide domain functions as Web and accepts the write through
/// the same extracted transition. Native carries only executionRevision for
/// concurrency and editable values; reminder identity, timeline history, and
/// protocol relationships remain canonical server state.
protocol PeptideSupportAPI: Sendable {
    func fetchSupport(protocolId: String) async throws -> PeptideSupportDetail?
    func save(
        protocolId: String,
        expectedRevision: Int?,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        dosing: PeptideDosingStrategyReadModel,
        timingContext: String,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> PeptideSupportSaveResult
    /// The same full save, optionally carrying `rewriteHistory: true` — the
    /// only way a strategy dated before today is accepted by the Server
    /// (`400 PEPTIDE_PLAN_REWRITES_HISTORY` otherwise). Only the Advanced
    /// editor sends it, after its explicit confirmation.
    func save(
        protocolId: String,
        expectedRevision: Int?,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        dosing: PeptideDosingStrategyReadModel,
        timingContext: String,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String,
        rewriteHistory: Bool
    ) async throws -> PeptideSupportSaveResult
}

extension PeptideSupportAPI {
    func save(
        protocolId: String,
        expectedRevision: Int?,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        dosing: PeptideDosingStrategyReadModel,
        timingContext: String,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> PeptideSupportSaveResult {
        try await save(
            protocolId: protocolId,
            expectedRevision: expectedRevision,
            supportSchedule: supportSchedule,
            dosing: dosing,
            timingContext: timingContext,
            reminderPreference: reminderPreference,
            notes: notes,
            rewriteHistory: false
        )
    }
}

struct PeptideSupportDetail: Decodable, Equatable, Sendable {
    var protocolId: String
    var executionId: String?
    var executionRevision: Int?
    var name: String
    var purpose: String
    var state: PeptideExecutionState
    var supportSchedule: OperatingPlanSupportScheduleReadModel
    var dosing: PeptideDosingStrategyReadModel
    var timeline: [PeptideDoseTimelinePhaseReadModel]
    var reminderPreference: OperatingPlanReminderPreference
    var timingContext: String
    var notes: String
    // S4 additions (`operating-plan-peptide-support`). All optional: a
    // Server that predates them, and every cached snapshot, still decodes.
    var nextDue: String? = nil
    var nextDueDate: String? = nil
    var nextDueTime: String? = nil
    var lifecycle: PeptideLifecycleReadModel? = nil
    var currentDose: PeptideDoseValueReadModel? = nil
    var currentDoseLabel: String? = nil
    var currentPhase: PeptideDosePhaseWindowReadModel? = nil
    var plannedChanges: [PeptidePlannedChangeReadModel]? = nil
    var dosingHistory: [PeptideDosingHistoryEntryReadModel]? = nil
    var dosingMode: String? = nil
    var advancedPlan: Bool? = nil
    var priorityId: String? = nil
    /// The owner's canonical local date the read was projected for, when the
    /// Server carries one. Native prefers it over the device date for
    /// "today"/"tomorrow" so the peptide screen agrees with Home.
    var localDate: String? = nil

    /// Feature detection for the simple editor (design §4 deploy order): the
    /// card, sheets and Pause exist only when the Server projects the
    /// lifecycle, the current dose and a revision token. Otherwise the
    /// existing Advanced-style editor path is the only path, so Native can
    /// never send a history-rewriting `stay` to a Server without S1.
    var supportsSimpleEditor: Bool {
        lifecycle != nil && currentDose != nil && executionRevision != nil
    }

    var isPaused: Bool { lifecycle?.isPaused ?? false }
}

extension PeptideSupportDetail {
    private enum CodingKeys: String, CodingKey {
        case protocolId, executionId, executionRevision, name, purpose, state, supportSchedule, dosing, timeline
        case reminderPreference, timingContext, notes, nextDue, nextDueDate, nextDueTime, lifecycle, currentDose
        case currentDoseLabel, currentPhase, plannedChanges, dosingHistory, dosingMode, advancedPlan, priorityId, localDate
    }

    /// Keeps Build 69's strict decoding for the established keys and decodes
    /// every additive list lossily (a malformed element never fails the read).
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        protocolId = try container.decode(String.self, forKey: .protocolId)
        executionId = try container.decodeIfPresent(String.self, forKey: .executionId)
        executionRevision = try container.decodeIfPresent(Int.self, forKey: .executionRevision)
        name = try container.decode(String.self, forKey: .name)
        purpose = try container.decode(String.self, forKey: .purpose)
        state = try container.decode(PeptideExecutionState.self, forKey: .state)
        supportSchedule = try container.decode(OperatingPlanSupportScheduleReadModel.self, forKey: .supportSchedule)
        dosing = try container.decode(PeptideDosingStrategyReadModel.self, forKey: .dosing)
        timeline = try container.decode([PeptideDoseTimelinePhaseReadModel].self, forKey: .timeline)
        reminderPreference = try container.decode(OperatingPlanReminderPreference.self, forKey: .reminderPreference)
        timingContext = try container.decode(String.self, forKey: .timingContext)
        notes = try container.decode(String.self, forKey: .notes)
        nextDue = try container.decodeIfPresent(String.self, forKey: .nextDue)
        nextDueDate = try container.decodeIfPresent(String.self, forKey: .nextDueDate)
        nextDueTime = try container.decodeIfPresent(String.self, forKey: .nextDueTime)
        lifecycle = try container.decodeIfPresent(PeptideLifecycleReadModel.self, forKey: .lifecycle)
        currentDose = try container.decodeIfPresent(PeptideDoseValueReadModel.self, forKey: .currentDose)
        currentDoseLabel = try container.decodeIfPresent(String.self, forKey: .currentDoseLabel)
        currentPhase = try container.decodeIfPresent(PeptideDosePhaseWindowReadModel.self, forKey: .currentPhase)
        plannedChanges = try container.decodeIfPresent(LossyDecodableArray<PeptidePlannedChangeReadModel>.self, forKey: .plannedChanges)?.elements
        dosingHistory = try container.decodeIfPresent(LossyDecodableArray<PeptideDosingHistoryEntryReadModel>.self, forKey: .dosingHistory)?.elements
        dosingMode = try container.decodeIfPresent(String.self, forKey: .dosingMode)
        advancedPlan = try container.decodeIfPresent(Bool.self, forKey: .advancedPlan)
        priorityId = try container.decodeIfPresent(String.self, forKey: .priorityId)
        localDate = try container.decodeIfPresent(String.self, forKey: .localDate)
    }

    /// The sandbox fixture in the production read's shape, so one editor
    /// model serves both authorities. `timingContext` is a Server-owned
    /// pass-through the fixture never carries.
    init(sandbox model: OperatingPlanPeptideExecutionReadModel) {
        self.init(
            protocolId: model.protocolId,
            executionId: nil,
            executionRevision: model.executionRevision,
            name: model.name,
            purpose: model.purpose,
            state: model.state,
            supportSchedule: model.supportSchedule,
            dosing: model.dosing,
            timeline: model.timeline,
            reminderPreference: model.reminderPreference,
            timingContext: "",
            notes: model.notes,
            nextDue: model.nextDue,
            nextDueDate: model.nextDueDate,
            nextDueTime: model.nextDueTime,
            lifecycle: model.lifecycle,
            currentDose: model.currentDose,
            currentDoseLabel: model.currentDoseLabel,
            currentPhase: model.currentPhase,
            plannedChanges: model.plannedChanges,
            dosingHistory: model.dosingHistory,
            dosingMode: model.dosingMode,
            advancedPlan: model.advancedPlan,
            priorityId: model.priorityId,
            localDate: nil
        )
    }
}

struct PeptideSupportSaveResult: Decodable, Equatable, Sendable {
    var status: String
    var protocolId: String
    var executionId: String?
    var executionRevision: Int?
}

struct ProductionPeptideSupportAPI: PeptideSupportAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchSupport(protocolId: String) async throws -> PeptideSupportDetail? {
        let envelope = try await api.readResource(
            "operating-plan-peptide-support",
            query: ["protocolId": protocolId],
            as: PeptideSupportDetail.self
        )
        return envelope.data
    }

    func save(
        protocolId: String,
        expectedRevision: Int?,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        dosing: PeptideDosingStrategyReadModel,
        timingContext: String,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String,
        rewriteHistory: Bool
    ) async throws -> PeptideSupportSaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let payload = Payload(
            protocolId: protocolId,
            draft: .init(
                supportSchedule: supportSchedule,
                dosingStrategy: .init(dosing),
                timingContext: timingContext,
                reminderPreference: reminderPreference.rawValue,
                notes: notes,
                rewriteHistory: rewriteHistory ? true : nil
            )
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.savePeptideSupport,
            protocolId,
            expectedRevision.map(String.init) ?? "unconfigured",
            supportSchedule.frequency.rawValue,
            supportSchedule.daysOfWeek.map(\.rawValue).joined(separator: ","),
            String(supportSchedule.intervalDays),
            supportSchedule.timing.rawValue,
            supportSchedule.specificTime,
            supportSchedule.startDate,
            supportSchedule.endDate ?? "",
            dosing.pattern.rawValue,
            String(dosing.startingDoseAmount),
            dosing.startingDoseUnit,
            dosing.startDate,
            String(dosing.stepAmount),
            String(dosing.stepInterval),
            dosing.stepUnit.rawValue,
            String(dosing.targetDoseAmount),
            String(dosing.holdDuration),
            dosing.holdUnit.rawValue,
            String(dosing.decreaseAmount),
            String(dosing.decreaseInterval),
            dosing.decreaseUnit.rawValue,
            String(dosing.landingDoseAmount),
            dosing.endDate ?? "",
            timingContext,
            reminderPreference.rawValue,
            notes,
            rewriteHistory ? "rewrite-history" : "",
        ])
        let outcome: ProductionCommandOutcome<PeptideSupportSaveResult> = try await api.submitCommand(
            ProductionCommandType.savePeptideSupport,
            idempotencyKey: idempotencyStore.resolvedKey(
                scope: "operating-plan.peptide-support.\(protocolId)",
                signature: signature
            ),
            expectedVersion: expectedRevision.map(String.init),
            payload: payload
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private struct Payload: Encodable {
        var protocolId: String
        var draft: Draft

        struct Draft: Encodable {
            var supportSchedule: OperatingPlanSupportScheduleReadModel
            var dosingStrategy: DosingStrategy
            var timingContext: String
            var reminderPreference: String
            var notes: String
            /// Encoded only when true; the Build 69 draft shape is otherwise
            /// byte-for-byte unchanged.
            var rewriteHistory: Bool?
        }

        struct DosingStrategy: Encodable {
            var pattern: String
            var startingDose: Dose
            var startDate: String
            var stepAmount: Double
            var stepInterval: Int
            var stepUnit: String
            var targetDose: Double
            var holdDuration: Int
            var holdUnit: String
            var decreaseAmount: Double
            var decreaseInterval: Int
            var decreaseUnit: String
            var landingDose: Double
            var endDate: String?

            init(_ model: PeptideDosingStrategyReadModel) {
                pattern = model.pattern.rawValue
                startingDose = Dose(amount: model.startingDoseAmount, unit: model.startingDoseUnit)
                startDate = model.startDate
                stepAmount = model.stepAmount
                stepInterval = model.stepInterval
                stepUnit = model.stepUnit.rawValue
                targetDose = model.targetDoseAmount
                holdDuration = model.holdDuration
                holdUnit = model.holdUnit.rawValue
                decreaseAmount = model.decreaseAmount
                decreaseInterval = model.decreaseInterval
                decreaseUnit = model.decreaseUnit.rawValue
                landingDose = model.landingDoseAmount
                endDate = model.endDate
            }
        }

        struct Dose: Encodable {
            var amount: Double
            var unit: String
        }
    }
}

struct NotAvailablePeptideSupportAPI: PeptideSupportAPI {
    struct NotAvailable: Error {}

    func fetchSupport(protocolId: String) async throws -> PeptideSupportDetail? { throw NotAvailable() }
    func save(
        protocolId: String,
        expectedRevision: Int?,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        dosing: PeptideDosingStrategyReadModel,
        timingContext: String,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String,
        rewriteHistory: Bool
    ) async throws -> PeptideSupportSaveResult { throw NotAvailable() }
}
