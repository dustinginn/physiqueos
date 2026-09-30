import Foundation

/// Phase C: Founder-authorized, bounded HISTORICAL Sleep validation.
///
/// Structurally separate from the ordinary (prospective) Sleep lane:
/// - its own Server command (`healthkit.sleep.historical-validation.ingest.v1`)
///   and manifest block (`healthKitSleepHistoricalValidation`);
/// - no observer, no background delivery, no anchored query, no cursor, no
///   durable staging: one explicit, foreground Founder action;
/// - it reads exactly the Server-advertised window (<= 30 sleep days ending
///   at the prospective activation floor) and nothing else;
/// - samples use the same privacy-safe mapping and Server-parity validation
///   as ordinary Sleep, but are stored by the Server only as validation data,
///   never canonical production history or strategic evidence.
enum HealthKitSleepHistoricalValidationContract {
    static let commandType = "healthkit.sleep.historical-validation.ingest.v1"
    static let contractVersion = "healthkit-sleep-historical-validation-v1"
    static let maximumSleepDays = 30
    /// Hard ceiling on one read. A real 30-night multi-source window is a few
    /// thousand samples; anything above this fails closed rather than paging.
    static let maximumSamplesPerRun = 20_000
    static let disabledProblemCode = "HEALTHKIT_SLEEP_HISTORICAL_VALIDATION_NOT_ENABLED"
}

/// The resolved, fail-closed validation window from the Server manifest.
struct HealthKitSleepValidationCapability: Equatable, Sendable {
    let runId: String
    let windowStart: Date
    let windowEnd: Date

    /// Absent, disabled, malformed, drifted, or over-long -> nil.
    static func resolve(_ block: ProductionJSONValue?) -> HealthKitSleepValidationCapability? {
        guard case let .object(value)? = block,
              case .string(HealthKitSleepHistoricalValidationContract.commandType)? = value["commandType"],
              case .string(HealthKitSleepHistoricalValidationContract.contractVersion)? = value["contractVersion"],
              case .bool(true)? = value["enabled"],
              case let .string(runId)? = value["runId"],
              runId.range(of: "^[a-z0-9][a-z0-9-]{6,62}[a-z0-9]$", options: .regularExpression) != nil,
              case let .string(startText)? = value["windowStart"],
              case let .string(endText)? = value["windowEnd"],
              let start = HealthKitSleepCapability.parseInstant(startText),
              let end = HealthKitSleepCapability.parseInstant(endText),
              start < end,
              // 30 sleep days plus DST/zone slack; never a wider read.
              end.timeIntervalSince(start) <= Double(HealthKitSleepHistoricalValidationContract.maximumSleepDays + 1) * 86_400
        else { return nil }
        return HealthKitSleepValidationCapability(runId: runId, windowStart: start, windowEnd: end)
    }
}

protocol HealthKitSleepValidationCapabilitySource: Sendable {
    func healthKitSleepHistoricalValidationBlock() async throws -> ProductionJSONValue?
}

extension ProductionNativeAPI: HealthKitSleepValidationCapabilitySource {
    func healthKitSleepHistoricalValidationBlock() async throws -> ProductionJSONValue? {
        try await readContracts().healthKitSleepHistoricalValidation
    }
}

/// Plain bounded HealthKit read of every Sleep sample (all sources, all
/// values) whose END lies in `[start, end)`, mapped exactly like ordinary
/// Sleep. `SystemHealthKitQueryClient` conforms.
protocol HealthKitSleepHistoricalReader: Sendable {
    func historicalSleepSamples(endingFrom start: Date, before end: Date, limit: Int) async throws -> [HealthKitQueryAddition]
}

struct HealthKitSleepValidationWirePayload: Encodable, Equatable, Sendable {
    let batchId: String
    let runId: String
    let samples: [HealthKitSleepWireSample]
}

enum HealthKitSleepValidationSubmitResult: Equatable, Sendable {
    case accepted(outcomes: [String: Int])
    case disabled
    case failed(code: String)
}

protocol HealthKitSleepValidationSubmitting: Sendable {
    func submitSleepHistoricalValidation(_ payload: HealthKitSleepValidationWirePayload) async -> HealthKitSleepValidationSubmitResult
}

struct ProductionHealthKitSleepValidationSubmitter: HealthKitSleepValidationSubmitting {
    private struct Result: Decodable, Sendable {
        struct Item: Decodable, Sendable { let externalId: String; let outcome: String }
        let contractVersion: String
        let batchId: String
        let runId: String
        let samples: [Item]
    }
    static let knownOutcomes: Set<String> = ["stored", "replayed", "refused_identity_conflict", "refused_outside_validation_window"]

    let api: ProductionNativeAPI

    func submitSleepHistoricalValidation(_ payload: HealthKitSleepValidationWirePayload) async -> HealthKitSleepValidationSubmitResult {
        do {
            let outcome: ProductionCommandOutcome<Result> = try await api.submitCommand(
                HealthKitSleepHistoricalValidationContract.commandType,
                idempotencyKey: payload.batchId,
                payload: payload
            )
            guard outcome.outcome != .pending,
                  let result = outcome.receipt.result,
                  result.contractVersion == HealthKitSleepHistoricalValidationContract.contractVersion,
                  result.batchId == payload.batchId,
                  result.runId == payload.runId,
                  result.samples.map(\.externalId).sorted() == payload.samples.map(\.externalId).sorted(),
                  result.samples.allSatisfy({ Self.knownOutcomes.contains($0.outcome) })
            else { return .failed(code: "healthkit_sleep_validation_acknowledgement_invalid") }
            return .accepted(outcomes: result.samples.reduce(into: [:]) { $0[$1.outcome, default: 0] += 1 })
        } catch let ProductionNativeError.conflict(problem) where problem.code == HealthKitSleepHistoricalValidationContract.disabledProblemCode {
            return .disabled
        } catch let error as ProductionNativeError {
            switch error {
            case let .validation(problem), let .conflict(problem), let .failedPrecondition(problem), let .preconditionRequired(problem):
                return .failed(code: problem.code)
            default:
                return .failed(code: "healthkit_sleep_validation_upload_unavailable")
            }
        } catch {
            return .failed(code: "healthkit_sleep_validation_upload_failed")
        }
    }
}

/// What the Founder sees: counts only, no times, durations, or sources.
struct HealthKitSleepValidationRunSummary: Equatable, Sendable {
    var runId: String
    var samplesRead = 0
    var samplesNotRepresentable = 0
    var samplesSent = 0
    var batches = 0
    var outcomes: [String: Int] = [:]
    var failureCode: String?
}

/// One explicit, foreground, idempotent run. Re-running is safe: batch
/// identities are deterministic in the run and sample UUIDs, and the Server
/// replays identical samples.
actor HealthKitSleepHistoricalValidationRunner {
    private let capabilitySource: any HealthKitSleepValidationCapabilitySource
    private let reader: any HealthKitSleepHistoricalReader
    private let submitter: any HealthKitSleepValidationSubmitting
    private var running = false

    init(
        capabilitySource: any HealthKitSleepValidationCapabilitySource,
        reader: any HealthKitSleepHistoricalReader,
        submitter: any HealthKitSleepValidationSubmitting
    ) {
        self.capabilitySource = capabilitySource
        self.reader = reader
        self.submitter = submitter
    }

    /// The currently advertised window, or nil when the lane is closed.
    func currentCapability() async -> HealthKitSleepValidationCapability? {
        HealthKitSleepValidationCapability.resolve(try? await capabilitySource.healthKitSleepHistoricalValidationBlock())
    }

    func run() async -> HealthKitSleepValidationRunSummary {
        guard !running else { return .init(runId: "", failureCode: "healthkit_sleep_validation_in_progress") }
        running = true
        defer { running = false }
        guard let capability = await currentCapability() else {
            return .init(runId: "", failureCode: "healthkit_sleep_validation_not_enabled")
        }
        var summary = HealthKitSleepValidationRunSummary(runId: capability.runId)
        let additions: [HealthKitQueryAddition]
        do {
            additions = try await reader.historicalSleepSamples(
                endingFrom: capability.windowStart,
                before: capability.windowEnd,
                limit: HealthKitSleepHistoricalValidationContract.maximumSamplesPerRun + 1
            )
        } catch {
            summary.failureCode = "healthkit_sleep_validation_read_failed"
            return summary
        }
        guard additions.count <= HealthKitSleepHistoricalValidationContract.maximumSamplesPerRun else {
            summary.failureCode = "healthkit_sleep_validation_too_many_samples"
            return summary
        }
        summary.samplesRead = additions.count
        let normalizer = HealthKitObservationNormalizer()
        var samples: [HealthKitSleepWireSample] = []
        for addition in additions {
            // Second window check on the device side; the Server checks again.
            guard let endedAt = addition.occurrence.endedAt,
                  endedAt >= capability.windowStart, endedAt < capability.windowEnd,
                  let sample = try? HealthKitSleepWireMapper.sample(normalizer.normalize(addition))
            else { summary.samplesNotRepresentable += 1; continue }
            samples.append(sample)
        }
        samples.sort { $0.externalId < $1.externalId }
        for start in stride(from: 0, to: samples.count, by: HealthKitSleepIngestionContract.maximumSamplesPerBatch) {
            let chunk = Array(samples[start..<min(start + HealthKitSleepIngestionContract.maximumSamplesPerBatch, samples.count)])
            let material = ([capability.runId] + chunk.map { "\($0.externalId)|\($0.categoryValue)|\($0.startedAt)|\($0.endedAt)" }).joined(separator: "\u{0}")
            let payload = HealthKitSleepValidationWirePayload(
                batchId: "healthkit_sleep_validation_\(HealthKitStableDigest.hex(material))",
                runId: capability.runId,
                samples: chunk
            )
            switch await submitter.submitSleepHistoricalValidation(payload) {
            case let .accepted(outcomes):
                summary.batches += 1
                summary.samplesSent += chunk.count
                for (key, count) in outcomes { summary.outcomes[key, default: 0] += count }
            case .disabled:
                summary.failureCode = "healthkit_sleep_validation_not_enabled"
                return summary
            case let .failed(code):
                summary.failureCode = code
                return summary
            }
        }
        return summary
    }
}
