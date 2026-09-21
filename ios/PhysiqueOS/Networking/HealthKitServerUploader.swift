import Foundation

enum HealthKitUploadResult: Equatable, Sendable {
    case durablyAccepted(batchID: String, receiptIdentity: String)
    case transientFailure(code: String)
    case rejected(code: String)
}

/// What the Server reported for one accepted observation. The Server alone
/// decides whether a daily snapshot canonicalized; the app only shows it.
struct HealthKitCanonicalizationReport: Equatable, Sendable {
    let observationType: String
    let outcome: String
    let reconciliationState: String?
    let reason: String?
    let occurredAt: String?

    var wasCanonicalized: Bool {
        reconciliationState?.hasSuffix("_day_canonicalized") == true || reconciliationState == "workout_canonicalized"
    }
}

/// Collects the Server's per-observation reconciliation from durable
/// acknowledgements so the Founder screen can show canonicalized versus
/// deferred, instead of treating every acknowledgement as success.
final class HealthKitCanonicalizationLedger: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: [HealthKitCanonicalizationReport] = []

    func reset() { lock.lock(); stored = []; lock.unlock() }
    func record(_ reports: [HealthKitCanonicalizationReport]) { lock.lock(); stored += reports; lock.unlock() }
    func reports() -> [HealthKitCanonicalizationReport] { lock.lock(); defer { lock.unlock() }; return stored }
}

protocol HealthKitObservationUploader: Sendable {
    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult
}

struct ProductionHealthKitObservationUploader: HealthKitObservationUploader {
    private struct Result: Decodable, Sendable {
        struct Observation: Decodable, Sendable {
            struct Reconciliation: Decodable, Sendable {
                let state: String?
                let reason: String?
            }
            let observationType: String?
            let outcome: String?
            let occurredAt: String?
            let reconciliation: Reconciliation?
        }
        let status: String
        let batchId: String
        let cursorResponsibility: String
        let observations: [Observation]?
    }

    let api: ProductionNativeAPI
    var ledger: HealthKitCanonicalizationLedger? = nil

    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult {
        do {
            let payload = try HealthKitS1WireMapper.payload(for: partition)
            let outcome: ProductionCommandOutcome<Result> = try await api.submitCommand(
                HealthKitServerIngestionContract.commandType,
                idempotencyKey: partition.identity,
                payload: payload
            )
            guard outcome.outcome != .pending else {
                return .transientFailure(code: "healthkit_server_receipt_pending")
            }
            guard let result = outcome.receipt.result,
                  result.batchId == partition.identity,
                  result.cursorResponsibility == HealthKitServerIngestionContract.queryCursorAuthority
            else {
                return .transientFailure(code: "healthkit_server_acknowledgement_invalid")
            }
            ledger?.record((result.observations ?? []).map {
                HealthKitCanonicalizationReport(
                    observationType: $0.observationType ?? "unknown",
                    outcome: $0.outcome ?? "unknown",
                    reconciliationState: $0.reconciliation?.state,
                    reason: $0.reconciliation?.reason,
                    occurredAt: $0.occurredAt
                )
            })
            let receipt = outcome.receipt.commandId
                ?? outcome.receipt.operationId
                ?? "receipt:\(partition.identity)"
            return .durablyAccepted(batchID: result.batchId, receiptIdentity: receipt)
        } catch let error as ProductionNativeError {
            switch error {
            case let .validation(problem), let .failedPrecondition(problem),
                 let .preconditionRequired(problem), let .conflict(problem):
                return .rejected(code: problem.code)
            case .incompatibleContractVersion:
                return .rejected(code: "healthkit_server_contract_incompatible")
            case .authorityMismatch, .resourceMismatch:
                return .rejected(code: "healthkit_server_authority_invalid")
            default:
                return .transientFailure(code: "healthkit_server_upload_unavailable")
            }
        } catch let error as HealthKitSyncError {
            return .rejected(code: error.diagnosticCode)
        } catch {
            return .transientFailure(code: "healthkit_server_upload_failed")
        }
    }
}
