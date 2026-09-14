import Foundation

/// `operating-plan-recurring-support` (read) / `operating-plan.recurring-
/// support.save.v1` (write) — the one canonical server-owned workflow
/// behind every "recurring support" execution item: Recovery's Foam
/// Rolling, Tracking's Morning Weigh-In, and any future domain reusing the
/// same shape. Both read and write are thin wrappers over the exact same
/// `RecurringSupportManagementService` Web's own `saveFoamRollingSupport`/
/// `saveMorningWeighInSupport` actions call — Native never re-derives
/// schedule/reminder semantics itself. A reminder-time edit made through
/// this API changes `reminder.schedule.timeOfDay` — the same field
/// `notificationAction.scheduledTime` is resolved from server-side — so
/// Home and local notification reconciliation observe the new time on
/// their next read/sync with no separate Native-side schedule to keep in
/// sync.
protocol RecurringSupportAPI: Sendable {
    func fetchSupport(executionId: String) async throws -> RecurringSupportDetail?
    func save(
        protocolId: String,
        protocolCategory: String,
        executionId: String,
        reminderId: String,
        expectedRevision: Int,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> RecurringSupportSaveResult
}

struct RecurringSupportDetail: Decodable, Equatable, Sendable {
    var protocolId: String
    var protocolCategory: String
    var executionId: String
    var reminderId: String?
    var title: String
    var purpose: String
    var supportSummary: String
    var hydration: Hydration

    struct Hydration: Decodable, Equatable, Sendable {
        var executionRevision: Int
        var supportSchedule: OperatingPlanSupportScheduleReadModel
        var reminderPreference: OperatingPlanReminderPreference
        var notes: String
    }
}

struct RecurringSupportSaveResult: Decodable, Equatable, Sendable {
    var status: String
    var executionId: String
    var executionRevision: Int?
}

struct ProductionRecurringSupportAPI: RecurringSupportAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func fetchSupport(executionId: String) async throws -> RecurringSupportDetail? {
        let envelope = try await api.readResource(
            "operating-plan-recurring-support", query: ["executionId": executionId], as: RecurringSupportDetail.self
        )
        return envelope.data
    }

    func save(
        protocolId: String,
        protocolCategory: String,
        executionId: String,
        reminderId: String,
        expectedRevision: Int,
        supportSchedule: OperatingPlanSupportScheduleReadModel,
        reminderPreference: OperatingPlanReminderPreference,
        notes: String
    ) async throws -> RecurringSupportSaveResult {
        try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction)
        let payload = Payload(
            protocolId: protocolId, protocolCategory: protocolCategory, executionId: executionId, reminderId: reminderId,
            draft: Payload.Draft(supportSchedule: supportSchedule, reminderPreference: reminderPreference.rawValue, notes: notes)
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.saveRecurringSupport, protocolId, executionId, reminderId, String(expectedRevision),
            supportSchedule.frequency.rawValue, supportSchedule.daysOfWeek.map(\.rawValue).joined(separator: ","),
            String(supportSchedule.intervalDays), supportSchedule.timing.rawValue, supportSchedule.specificTime,
            supportSchedule.startDate, supportSchedule.endDate ?? "", reminderPreference.rawValue, notes,
        ])
        let scope = "operating-plan.recurring-support.\(executionId)"
        let outcome: ProductionCommandOutcome<RecurringSupportSaveResult> = try await api.submitCommand(
            ProductionCommandType.saveRecurringSupport,
            idempotencyKey: idempotencyStore.resolvedKey(scope: scope, signature: signature),
            expectedVersion: String(expectedRevision),
            payload: payload
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private struct Payload: Encodable {
        var protocolId: String
        var protocolCategory: String
        var executionId: String
        var reminderId: String
        var draft: Draft

        struct Draft: Encodable {
            var supportSchedule: OperatingPlanSupportScheduleReadModel
            var reminderPreference: String
            var notes: String
        }
    }
}

struct NotAvailableRecurringSupportAPI: RecurringSupportAPI {
    struct NotAvailable: Error {}

    func fetchSupport(executionId: String) async throws -> RecurringSupportDetail? { throw NotAvailable() }
    func save(
        protocolId: String, protocolCategory: String, executionId: String, reminderId: String, expectedRevision: Int,
        supportSchedule: OperatingPlanSupportScheduleReadModel, reminderPreference: OperatingPlanReminderPreference, notes: String
    ) async throws -> RecurringSupportSaveResult { throw NotAvailable() }
}
