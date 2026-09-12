import Foundation

/// `weight.submit.v1` / `check-in.submit.v1` (`CanonicalPersistenceCommandPorts.js`'s
/// `commitMorningCheckIn`) — both commands share the exact same server port
/// (the real `MorningCheckInPersistenceService` the web Morning Check-In
/// screen uses) and response shape; they differ only in whether previous-
/// day Priority reconciliation runs alongside the weight write. Native
/// never recreates that persistence logic — it only supplies the intended
/// local date, the value, and (for Check-In) the reconciliation choices
/// the Founder already made, verbatim.
protocol WeightWriteAPI: Sendable {
    /// Manual Weigh-In — a plain weight submission, no Priority
    /// reconciliation. `expectedVersion` is required by the server only
    /// when a same-day entry already exists AND its value differs from
    /// `value`; omit it for a brand-new day or an identical resubmission.
    func submitWeight(localDate: String, value: Double, expectedVersion: String?) async throws -> WeightSubmitResult

    /// Morning Check-In — the same weight write, PLUS previous-day
    /// Priority dispositions in one atomic server-side action (mirrors
    /// `MorningCheckInPersistenceService.save`'s real combined behavior).
    func submitMorningCheckIn(
        localDate: String,
        value: Double,
        expectedVersion: String?,
        reconciliationSubmissions: [MorningCheckInReconciliationSubmission]
    ) async throws -> WeightSubmitResult
}

/// `parseMorningPriorityReconciliationFormData`'s real field shape
/// (`server/src/domain/services/MorningPriorityReconciliationService.js`).
/// `occurrenceKey` is returned by the production `morning-check-in` read.
/// Native passes it through verbatim and never reconstructs occurrence
/// identity from the reminder id and date.
struct MorningCheckInReconciliationSubmission: Encodable, Equatable {
    var occurrenceKey: String
    var priorityId: String
    var occurrenceDate: String
    var disposition: String
    var note: String?

    init(priorityId: String, occurrenceDate: String, occurrenceKey: String, disposition: String, note: String?) {
        self.occurrenceKey = occurrenceKey
        self.priorityId = priorityId
        self.occurrenceDate = occurrenceDate
        self.disposition = disposition
        self.note = (note?.isEmpty ?? true) ? nil : note
    }
}

/// `commitMorningCheckIn`'s `outcome.result` shape verbatim
/// (`CanonicalPersistenceCommandPorts.js`). `weightRevision`/`checkInRevision`
/// are the exact Postgres revisions Native should cache if it expects to
/// correct the same date again without a fresh read.
struct WeightSubmitResult: Decodable, Equatable, Sendable {
    var status: String
    var weightId: String?
    var weightRevision: Int?
    var checkInId: String?
    var checkInRevision: Int?
    var analysisId: String?
    var intendedDate: String?
    var goalIds: [String]?
    var continuationWorkItemIds: [String]?
}

struct ProductionWeightWriteAPI: WeightWriteAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func submitWeight(localDate: String, value: Double, expectedVersion: String?) async throws -> WeightSubmitResult {
        try await submit(
            commandType: ProductionCommandType.submitWeight,
            scope: "weight-submit.\(localDate)",
            localDate: localDate,
            value: value,
            expectedVersion: expectedVersion,
            reconciliationSubmissions: nil
        )
    }

    func submitMorningCheckIn(
        localDate: String,
        value: Double,
        expectedVersion: String?,
        reconciliationSubmissions: [MorningCheckInReconciliationSubmission]
    ) async throws -> WeightSubmitResult {
        try await submit(
            commandType: ProductionCommandType.submitCheckIn,
            scope: "check-in-submit.\(localDate)",
            localDate: localDate,
            value: value,
            expectedVersion: expectedVersion,
            reconciliationSubmissions: reconciliationSubmissions
        )
    }

    private func submit(
        commandType: String,
        scope: String,
        localDate: String,
        value: Double,
        expectedVersion: String?,
        reconciliationSubmissions: [MorningCheckInReconciliationSubmission]?
    ) async throws -> WeightSubmitResult {
        try NativeProductWriteGuard.authorize(.morningCheckInAndWeight, in: .founderProduction)
        let signature = ProductionIdempotentSubmission.signature([
            commandType, localDate, String(value), expectedVersion ?? "new",
            reconciliationSubmissions.map(signatureFragment) ?? "",
        ])
        let idempotencyKey = idempotencyStore.resolvedKey(scope: scope, signature: signature)
        let payload = Payload(localDate: localDate, value: value, reconciliationSubmissions: reconciliationSubmissions)
        let outcome: ProductionCommandOutcome<WeightSubmitResult> = try await api.submitCommand(
            commandType,
            idempotencyKey: idempotencyKey,
            expectedVersion: expectedVersion,
            payload: payload
        )
        guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
        return result
    }

    private func signatureFragment(_ submissions: [MorningCheckInReconciliationSubmission]) -> String {
        submissions.map { "\($0.occurrenceKey)=\($0.disposition)|\($0.note ?? "")" }.sorted().joined(separator: ",")
    }

    private struct Payload: Encodable {
        var localDate: String
        var value: Double
        var reconciliationSubmissions: [MorningCheckInReconciliationSubmission]?
    }
}

/// Sandbox keeps its existing, unrelated `LoggingSandboxStore` write path —
/// this conformance exists only so callers can share one `WeightWriteAPI`-
/// typed seam across authorities without an authority check at every call
/// site. It is never actually invoked under Sandbox (views call the store
/// directly there, matching every other domain's established pattern).
struct NotAvailableWeightWriteAPI: WeightWriteAPI {
    struct NotAvailable: Error {}

    func submitWeight(localDate: String, value: Double, expectedVersion: String?) async throws -> WeightSubmitResult {
        throw NotAvailable()
    }

    func submitMorningCheckIn(
        localDate: String,
        value: Double,
        expectedVersion: String?,
        reconciliationSubmissions: [MorningCheckInReconciliationSubmission]
    ) async throws -> WeightSubmitResult {
        throw NotAvailable()
    }
}
