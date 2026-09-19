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

/// Resolves the manual Weight write lifecycle without turning an unknown
/// transport outcome into a false failure. A committed command response is
/// durable proof on its own. When that response is lost, the same logical
/// submission is retried once (and therefore reuses its persisted
/// idempotency key) while fresh canonical Weight reads can independently
/// prove that the intended date/value is already durable.
@MainActor
struct WeightSubmissionLifecycle {
    enum Resolution: Equatable {
        case saved
        case processing
    }

    let invalidateWeightRead: () async -> Void
    let fetchWeightReport: () async throws -> WeightReportReadModel
    let submitWeight: (_ localDate: String, _ value: Double, _ expectedVersion: String?) async throws -> WeightSubmitResult

    func submit(localDate: String, value: Double) async throws -> Resolution {
        await invalidateWeightRead()
        let initial = try await fetchWeightReport()
        let expectedVersion = initial.revision(forDateKey: localDate).map(String.init)

        for attempt in 0..<2 {
            do {
                _ = try await submitWeight(localDate, value, expectedVersion)
                // The receipt proves durability. Refresh canonical Weight as
                // reconciliation, but never turn a later read outage into a
                // false write failure.
                await invalidateWeightRead()
                _ = try? await fetchWeightReport()
                return .saved
            } catch {
                guard ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) else {
                    throw error
                }
                await invalidateWeightRead()
                if let report = try? await fetchWeightReport(),
                   Self.contains(report, localDate: localDate, pounds: value) {
                    return .saved
                }
                if attempt == 1 { return .processing }
                // The exact WeightWriteAPI call resolves the same persisted
                // idempotency key. This is receipt recovery, not a new write.
            }
        }
        return .processing
    }

    static func contains(_ report: WeightReportReadModel, localDate: String, pounds: Double) -> Bool {
        let entries = [report.current].compactMap { $0 } + (report.recentWeighIns ?? []) + report.history
        return entries.contains { entry in
            guard entry.date == localDate,
                  let value = Double(entry.value.split(separator: " ").first.map(String.init) ?? entry.value)
            else { return false }
            return abs(value - pounds) < 0.051
        }
    }
}

/// The Morning Check-In command atomically combines Weight with canonical
/// priority reconciliation. A Weight read alone therefore cannot prove the
/// whole command committed after a lost response. Recover only by replaying
/// the exact idempotent command once; if its receipt is still unavailable,
/// surface an honest processing state rather than either failure or success.
@MainActor
struct MorningCheckInSubmissionLifecycle {
    enum Resolution: Equatable {
        case saved
        case processing
    }

    let invalidateWeightRead: () async -> Void
    let fetchWeightReport: () async throws -> WeightReportReadModel
    let submitCheckIn: (_ expectedVersion: String?) async throws -> WeightSubmitResult

    func submit(localDate: String) async throws -> Resolution {
        await invalidateWeightRead()
        let initial = try await fetchWeightReport()
        let expectedVersion = initial.revision(forDateKey: localDate).map(String.init)

        for attempt in 0..<2 {
            do {
                _ = try await submitCheckIn(expectedVersion)
                await invalidateWeightRead()
                return .saved
            } catch {
                guard ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) else {
                    throw error
                }
                if attempt == 1 { return .processing }
                // ProductionWeightWriteAPI resolves the same persisted key
                // from the unchanged date/value/reconciliation signature.
            }
        }
        return .processing
    }
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
