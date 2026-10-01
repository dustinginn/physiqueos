import Foundation

/// One reviewed historical Recovery/Sleep Evidence import. It is deliberately
/// separate from both the validation corpus and prospective automatic Sleep.
enum HealthKitSleepHistoricalEvidenceContract {
    static let commandType = "healthkit.sleep.historical-evidence.ingest.v1"
    static let contractVersion = "healthkit-sleep-historical-evidence-v1"
    static let maximumSleepDays = 93
    static let maximumSamplesPerRun = 60_000
    static let disabledProblemCode = "HEALTHKIT_SLEEP_HISTORICAL_IMPORT_NOT_AUTHORIZED"
}

struct HealthKitSleepHistoricalEvidenceCapability: Equatable, Sendable {
    let runId: String
    let windowStart: Date
    let windowEnd: Date
    let startSleepDay: String
    let endSleepDay: String

    static func resolve(_ block: ProductionJSONValue?) -> Self? {
        guard case let .object(value)? = block,
              case .string(HealthKitSleepHistoricalEvidenceContract.commandType)? = value["commandType"],
              case .string(HealthKitSleepHistoricalEvidenceContract.contractVersion)? = value["contractVersion"],
              case .bool(true)? = value["enabled"],
              case let .string(runId)? = value["runId"],
              case let .string(startDay)? = value["startSleepDay"],
              case let .string(endDay)? = value["endSleepDay"],
              case let .string(startText)? = value["windowStart"],
              case let .string(endText)? = value["windowEnd"],
              runId == "sleep-evidence-2026-07-06-through-2026-10-06-v1",
              startDay == "2026-07-06", endDay == "2026-10-06",
              startText == "2026-07-06T01:00:00.000Z",
              endText == "2026-10-07T01:00:00.000Z",
              let start = HealthKitSleepCapability.parseInstant(startText),
              let end = HealthKitSleepCapability.parseInstant(endText), start < end,
              end.timeIntervalSince(start) <= Double(HealthKitSleepHistoricalEvidenceContract.maximumSleepDays + 1) * 86_400
        else { return nil }
        return Self(runId: runId, windowStart: start, windowEnd: end, startSleepDay: startDay, endSleepDay: endDay)
    }
}

protocol HealthKitSleepHistoricalEvidenceCapabilitySource: Sendable {
    func healthKitSleepHistoricalEvidenceBlock() async throws -> ProductionJSONValue?
}

extension ProductionNativeAPI: HealthKitSleepHistoricalEvidenceCapabilitySource {
    func healthKitSleepHistoricalEvidenceBlock() async throws -> ProductionJSONValue? {
        try await readContracts().healthKitSleepHistoricalEvidence
    }
}

struct HealthKitSleepHistoricalEvidenceWirePayload: Encodable, Equatable, Sendable {
    let batchId: String
    let runId: String
    let samples: [HealthKitSleepWireSample]
}

enum HealthKitSleepHistoricalEvidenceSubmitResult: Equatable, Sendable {
    case accepted(outcomes: [String: Int])
    case disabled
    case failed(code: String)
}

protocol HealthKitSleepHistoricalEvidenceSubmitting: Sendable {
    func submitSleepHistoricalEvidence(_ payload: HealthKitSleepHistoricalEvidenceWirePayload) async -> HealthKitSleepHistoricalEvidenceSubmitResult
}

struct ProductionHealthKitSleepHistoricalEvidenceSubmitter: HealthKitSleepHistoricalEvidenceSubmitting {
    private struct Result: Decodable, Sendable {
        struct Item: Decodable, Sendable { let externalId: String; let outcome: String }
        let contractVersion: String
        let batchId: String
        let runId: String
        let samples: [Item]
        let origin: String
        let strategicEvidenceEligibility: String
    }
    static let knownOutcomes: Set<String> = ["stored", "replayed", "refused_identity_conflict"]
    let api: ProductionNativeAPI

    func submitSleepHistoricalEvidence(_ payload: HealthKitSleepHistoricalEvidenceWirePayload) async -> HealthKitSleepHistoricalEvidenceSubmitResult {
        do {
            let outcome: ProductionCommandOutcome<Result> = try await api.submitCommand(
                HealthKitSleepHistoricalEvidenceContract.commandType,
                idempotencyKey: payload.batchId,
                payload: payload
            )
            guard outcome.outcome != .pending else { return .failed(code: "healthkit_sleep_evidence_receipt_pending") }
            guard let result = outcome.receipt.result,
                  result.contractVersion == HealthKitSleepHistoricalEvidenceContract.contractVersion,
                  result.batchId == payload.batchId, result.runId == payload.runId,
                  result.origin == "historical_evidence_import",
                  result.strategicEvidenceEligibility == "permanently_quarantined",
                  result.samples.map(\.externalId).sorted() == payload.samples.map(\.externalId).sorted(),
                  result.samples.allSatisfy({ Self.knownOutcomes.contains($0.outcome) })
            else { return .failed(code: "healthkit_sleep_evidence_acknowledgement_invalid") }
            return .accepted(outcomes: result.samples.reduce(into: [:]) { $0[$1.outcome, default: 0] += 1 })
        } catch let ProductionNativeError.conflict(problem) where problem.code == HealthKitSleepHistoricalEvidenceContract.disabledProblemCode {
            return .disabled
        } catch let error as ProductionNativeError {
            switch error {
            case let .validation(problem), let .conflict(problem), let .failedPrecondition(problem), let .preconditionRequired(problem):
                return .failed(code: problem.code)
            default: return .failed(code: "healthkit_sleep_evidence_upload_unavailable")
            }
        } catch { return .failed(code: "healthkit_sleep_evidence_upload_failed") }
    }
}

struct HealthKitSleepHistoricalEvidenceRunSummary: Equatable, Sendable {
    var runId: String
    var firstRepresentableSleepDay: String?
    var samplesRead = 0
    var samplesNotRepresentable = 0
    var samplesSent = 0
    var batches = 0
    var outcomes: [String: Int] = [:]
    var failureCode: String?
}

actor HealthKitSleepHistoricalEvidenceRunner {
    private static let encoder: JSONEncoder = { let value = JSONEncoder(); value.outputFormatting = [.sortedKeys]; return value }()
    private let capabilitySource: any HealthKitSleepHistoricalEvidenceCapabilitySource
    private let reader: any HealthKitSleepHistoricalReader
    private let submitter: any HealthKitSleepHistoricalEvidenceSubmitting
    private var running = false

    init(capabilitySource: any HealthKitSleepHistoricalEvidenceCapabilitySource, reader: any HealthKitSleepHistoricalReader, submitter: any HealthKitSleepHistoricalEvidenceSubmitting) {
        self.capabilitySource = capabilitySource; self.reader = reader; self.submitter = submitter
    }

    func currentCapability() async -> HealthKitSleepHistoricalEvidenceCapability? {
        HealthKitSleepHistoricalEvidenceCapability.resolve(try? await capabilitySource.healthKitSleepHistoricalEvidenceBlock())
    }

    func run() async -> HealthKitSleepHistoricalEvidenceRunSummary {
        guard !running else { return .init(runId: "", failureCode: "healthkit_sleep_evidence_import_in_progress") }
        running = true; defer { running = false }
        guard let capability = await currentCapability() else { return .init(runId: "", failureCode: "healthkit_sleep_evidence_import_not_enabled") }
        var summary = HealthKitSleepHistoricalEvidenceRunSummary(runId: capability.runId)
        let additions: [HealthKitQueryAddition]
        do {
            additions = try await reader.historicalSleepSamples(endingFrom: capability.windowStart, before: capability.windowEnd, limit: HealthKitSleepHistoricalEvidenceContract.maximumSamplesPerRun + 1)
        } catch { summary.failureCode = "healthkit_sleep_evidence_read_failed"; return summary }
        guard additions.count <= HealthKitSleepHistoricalEvidenceContract.maximumSamplesPerRun else { summary.failureCode = "healthkit_sleep_evidence_too_many_samples"; return summary }
        summary.samplesRead = additions.count
        let normalizer = HealthKitObservationNormalizer()
        var samples: [HealthKitSleepWireSample] = []
        for addition in additions {
            guard let endedAt = addition.occurrence.endedAt, endedAt >= capability.windowStart, endedAt < capability.windowEnd,
                  let sample = try? HealthKitSleepWireMapper.sample(normalizer.normalize(addition))
            else { summary.samplesNotRepresentable += 1; continue }
            samples.append(sample)
        }
        samples.sort { $0.externalId < $1.externalId }
        summary.firstRepresentableSleepDay = samples.compactMap { sample in
            Self.sleepDay(for: sample.endedAt, timeZone: sample.timeZone)
        }.sorted().first
        for start in stride(from: 0, to: samples.count, by: HealthKitSleepIngestionContract.maximumSamplesPerBatch) {
            let chunk = Array(samples[start..<min(start + HealthKitSleepIngestionContract.maximumSamplesPerBatch, samples.count)])
            let material = (try? Self.encoder.encode(chunk)).map { Data(capability.runId.utf8) + Data([0]) + $0 } ?? Data()
            let payload = HealthKitSleepHistoricalEvidenceWirePayload(batchId: "healthkit_sleep_evidence_\(HealthKitStableDigest.hex(material))", runId: capability.runId, samples: chunk)
            switch await submitter.submitSleepHistoricalEvidence(payload) {
            case let .accepted(outcomes): summary.batches += 1; summary.samplesSent += chunk.count; for (key, count) in outcomes { summary.outcomes[key, default: 0] += count }
            case .disabled: summary.failureCode = "healthkit_sleep_evidence_import_not_enabled"; return summary
            case let .failed(code): summary.failureCode = code; return summary
            }
        }
        return summary
    }

    private static func sleepDay(for instant: String, timeZone: String) -> String? {
        guard let date = HealthKitSleepCapability.parseInstant(instant), let zone = TimeZone(identifier: timeZone) else { return nil }
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = zone
        let components = calendar.dateComponents([.year, .month, .day, .hour], from: date)
        guard let year = components.year, let month = components.month, let day = components.day else { return nil }
        var base = DateComponents(); base.calendar = calendar; base.timeZone = zone; base.year = year; base.month = month; base.day = day
        guard let local = calendar.date(from: base) else { return nil }
        let wake = (components.hour ?? 0) >= 18 ? calendar.date(byAdding: .day, value: 1, to: local)! : local
        let out = calendar.dateComponents([.year, .month, .day], from: wake)
        return String(format: "%04d-%02d-%02d", out.year!, out.month!, out.day!)
    }
}
