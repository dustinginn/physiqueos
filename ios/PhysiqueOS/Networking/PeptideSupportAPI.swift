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
        notes: String
    ) async throws -> PeptideSupportSaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let payload = Payload(
            protocolId: protocolId,
            draft: .init(
                supportSchedule: supportSchedule,
                dosingStrategy: .init(dosing),
                timingContext: timingContext,
                reminderPreference: reminderPreference.rawValue,
                notes: notes
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
        notes: String
    ) async throws -> PeptideSupportSaveResult { throw NotAvailable() }
}
