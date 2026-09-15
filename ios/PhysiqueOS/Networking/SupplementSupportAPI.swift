import Foundation

protocol SupplementSupportAPI: Sendable {
    func fetchSupport(protocolId: String) async throws -> SupplementSupportDetail?
    func save(
        protocolId: String,
        supplementVersionId: String,
        expectedRevision: Int?,
        doseAmount: String,
        doseUnit: String,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> SupplementSupportSaveResult
}

struct SupplementSupportDetail: Decodable, Equatable, Sendable {
    var protocolId: String
    var supplementVersionId: String
    var goalId: String
    var executionId: String?
    var executionRevision: Int?
    var name: String
    var supportSummary: String
    var doseAmount: String
    var doseUnit: String
    var supportSchedule: OperatingPlanSupportScheduleReadModel
    var reminderPreference: OperatingPlanReminderPreference
    var notes: String

    var readModel: OperatingPlanSupplementSupportReadModel {
        .init(
            protocolId: protocolId,
            name: name,
            supportSummary: supportSummary,
            doseAmount: doseAmount,
            doseUnit: doseUnit,
            supportSchedule: supportSchedule,
            reminderPreference: reminderPreference,
            notes: notes
        )
    }
}

struct SupplementSupportSaveResult: Decodable, Equatable, Sendable {
    var status: String
    var protocolId: String
    var executionId: String?
    var executionRevision: Int?
    var reminderId: String?
}

struct ProductionSupplementSupportAPI: SupplementSupportAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchSupport(protocolId: String) async throws -> SupplementSupportDetail? {
        try await api.readResource(
            "operating-plan-supplement-support",
            query: ["protocolId": protocolId],
            as: SupplementSupportDetail.self
        ).data
    }

    func save(
        protocolId: String,
        supplementVersionId: String,
        expectedRevision: Int?,
        doseAmount: String,
        doseUnit: String,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> SupplementSupportSaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let payload = Payload(
            protocolId: protocolId,
            supplementVersionId: supplementVersionId,
            draft: .init(
                dose: .init(amount: doseAmount, unit: doseUnit),
                supportSchedule: supportSchedule,
                reminderPreference: reminderPreference.rawValue,
                notes: notes
            )
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.saveSupplementSupport,
            protocolId, supplementVersionId, expectedRevision.map(String.init) ?? "unconfigured",
            doseAmount, doseUnit, supportSchedule.frequency.rawValue,
            supportSchedule.daysOfWeek.map(\.rawValue).joined(separator: ","),
            String(supportSchedule.intervalDays), supportSchedule.timing.rawValue,
            supportSchedule.specificTime, supportSchedule.startDate, supportSchedule.endDate ?? "",
            reminderPreference.rawValue, notes,
        ])
        let outcome: ProductionCommandOutcome<SupplementSupportSaveResult> = try await api.submitCommand(
            ProductionCommandType.saveSupplementSupport,
            idempotencyKey: idempotencyStore.resolvedKey(
                scope: "operating-plan.supplement-support.\(protocolId)", signature: signature
            ),
            expectedVersion: expectedRevision.map(String.init),
            payload: payload
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private struct Payload: Encodable {
        var protocolId: String
        var supplementVersionId: String
        var draft: Draft
        struct Draft: Encodable {
            var dose: Dose
            var supportSchedule: OperatingPlanSupportScheduleReadModel
            var reminderPreference: String
            var notes: String
        }
        struct Dose: Encodable { var amount: String; var unit: String }
    }
}

struct NotAvailableSupplementSupportAPI: SupplementSupportAPI {
    struct NotAvailable: Error {}
    func fetchSupport(protocolId: String) async throws -> SupplementSupportDetail? { throw NotAvailable() }
    func save(
        protocolId: String,
        supplementVersionId: String,
        expectedRevision: Int?,
        doseAmount: String,
        doseUnit: String,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> SupplementSupportSaveResult { throw NotAvailable() }
}
