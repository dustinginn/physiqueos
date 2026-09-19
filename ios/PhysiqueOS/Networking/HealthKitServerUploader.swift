import Foundation

enum HealthKitUploadResult: Equatable, Sendable {
    case durablyAccepted(batchID: String, receiptIdentity: String)
    case transientFailure(code: String)
    case rejected(code: String)
}

protocol HealthKitObservationUploader: Sendable {
    func upload(_ partition: HealthKitStagedPartition) async -> HealthKitUploadResult
}

struct ProductionHealthKitObservationUploader: HealthKitObservationUploader {
    private struct Result: Decodable, Sendable {
        let status: String
        let batchId: String
        let cursorResponsibility: String
    }

    let api: ProductionNativeAPI

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
