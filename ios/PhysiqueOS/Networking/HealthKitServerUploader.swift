import Foundation

struct HealthKitDailyRevisionRecovery: Equatable, Sendable {
    static let schemaVersion = "healthkit-daily-revision-recovery-v1"

    let observationType: HealthKitS1ObservationType
    let localDate: String
    let receivedSourceRevision: UInt64
    let nextExpectedRevision: UInt64
    let identityDigest: String

    init(
        observationType: HealthKitS1ObservationType,
        localDate: String,
        receivedSourceRevision: UInt64,
        nextExpectedRevision: UInt64,
        identityDigest: String
    ) {
        self.observationType = observationType
        self.localDate = localDate
        self.receivedSourceRevision = receivedSourceRevision
        self.nextExpectedRevision = nextExpectedRevision
        self.identityDigest = identityDigest
    }

    init?(problem: ProductionProblemDetails) {
        guard problem.code == "HEALTHKIT_OBSERVATION_IDENTITY_COLLISION",
              case let .object(value) = problem.recovery,
              value["kind"]?.stringValue == "healthkit_daily_revision_collision",
              value["schemaVersion"]?.stringValue == Self.schemaVersion,
              let typeRaw = value["observationType"]?.stringValue,
              let observationType = HealthKitS1ObservationType(rawValue: typeRaw),
              observationType == .activitySummary || observationType == .nutritionDailyTotal,
              let localDate = value["localDate"]?.stringValue,
              Self.isLocalDate(localDate),
              let receivedSourceRevision = value["receivedSourceRevision"]?.uint64Value,
              let nextExpectedRevision = value["nextExpectedRevision"]?.uint64Value,
              nextExpectedRevision > receivedSourceRevision,
              let identityDigest = value["identityDigest"]?.stringValue,
              identityDigest.count == 64,
              identityDigest.allSatisfy({ $0.isHexDigit })
        else { return nil }
        self.observationType = observationType
        self.localDate = localDate
        self.receivedSourceRevision = receivedSourceRevision
        self.nextExpectedRevision = nextExpectedRevision
        self.identityDigest = identityDigest
    }

    private static func isLocalDate(_ value: String) -> Bool {
        guard value.count == 10 else { return false }
        let characters = Array(value)
        return characters[4] == "-" && characters[7] == "-" &&
            characters.enumerated().allSatisfy { index, character in
                index == 4 || index == 7 ? character == "-" : character.isNumber
            }
    }
}

enum HealthKitUploadResult: Equatable, Sendable {
    case durablyAccepted(batchID: String, receiptIdentity: String)
    case transientFailure(code: String)
    case rejected(code: String, recovery: HealthKitDailyRevisionRecovery? = nil)
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
                return .rejected(code: problem.code, recovery: HealthKitDailyRevisionRecovery(problem: problem))
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

private extension ProductionJSONValue {
    var stringValue: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }

    var uint64Value: UInt64? {
        // JSON numbers arrive as Double. Values above JavaScript's exact
        // integer range cannot be trusted as an authoritative revision and
        // converting the rounded 2^64 representation can trap.
        let maximumExactJSONInteger = 9_007_199_254_740_991.0
        guard case let .number(value) = self,
              value.isFinite,
              value.rounded(.towardZero) == value,
              value >= 0,
              value <= maximumExactJSONInteger
        else { return nil }
        return UInt64(value)
    }
}
