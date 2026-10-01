import XCTest
@testable import PhysiqueOS

/// Phase C historical-validation lane: separate, bounded, Founder-initiated.
final class HealthKitSleepHistoricalValidationTests: XCTestCase {
    private static let start = SleepFixtures.date("2026-09-02T01:00:00Z")
    private static let end = SleepFixtures.date("2026-10-02T01:00:00Z")

    static func block(overrides: [String: ProductionJSONValue] = [:]) -> ProductionJSONValue {
        var value: [String: ProductionJSONValue] = [
            "commandType": .string("healthkit.sleep.historical-validation.ingest.v1"),
            "contractVersion": .string("healthkit-sleep-historical-validation-v1"),
            "enabled": .bool(true),
            "runId": .string("hv-2026-10-02-30d"),
            "windowStart": .string("2026-09-02T01:00:00.000Z"),
            "windowEnd": .string("2026-10-02T01:00:00.000Z"),
        ]
        for (key, item) in overrides { value[key] = item }
        return .object(value)
    }

    func testCapabilityIsFailClosedAndNeverWiderThanThirtyOneDays() {
        XCTAssertNil(HealthKitSleepValidationCapability.resolve(nil))
        XCTAssertEqual(
            HealthKitSleepValidationCapability.resolve(Self.block()),
            HealthKitSleepValidationCapability(runId: "hv-2026-10-02-30d", windowStart: Self.start, windowEnd: Self.end)
        )
        for overrides: [String: ProductionJSONValue] in [
            ["enabled": .bool(false)],
            ["enabled": .string("true")],
            ["commandType": .string("healthkit.sleep.ingest.v1")],
            ["contractVersion": .string("v2")],
            ["runId": .string("BAD ID")],
            ["windowStart": .string("2026-08-01T01:00:00.000Z")],
            ["windowEnd": .string("2026-09-01T01:00:00.000Z")],
            ["windowEnd": .null],
        ] {
            XCTAssertNil(HealthKitSleepValidationCapability.resolve(Self.block(overrides: overrides)), "\(overrides)")
        }
    }

    func testClosedLaneReadsNothing() async {
        let reader = ValidationReaderMock(additions: [])
        let submitter = ValidationSubmitterMock()
        let runner = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: nil), reader: reader, submitter: submitter
        )
        let summary = await runner.run()
        XCTAssertEqual(summary.failureCode, "healthkit_sleep_validation_not_enabled")
        let reads = await reader.calls()
        let sent = await submitter.payloads()
        XCTAssertTrue(reads.isEmpty)
        XCTAssertTrue(sent.isEmpty)
    }

    func testReadsExactlyTheAdvertisedWindowAndSubmitsPrivacySafeBatches() async throws {
        let additions = (1...150).map { SleepFixtures.addition(id: $0, start: "2026-09-20T06:00:00Z", end: "2026-09-20T14:00:00Z", source: $0.isMultiple(of: 2) ? .oura : .watch) }
            + [
                SleepFixtures.addition(id: 900, start: "2026-08-20T06:00:00Z", end: "2026-08-20T14:00:00Z"), // outside window
                SleepFixtures.addition(id: 901, start: "2026-09-19T00:00:00Z", end: "2026-09-20T06:00:00Z"), // 30 h: not representable
            ]
        let reader = ValidationReaderMock(additions: additions)
        let submitter = ValidationSubmitterMock()
        let runner = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: Self.block()), reader: reader, submitter: submitter
        )
        let summary = await runner.run()
        XCTAssertNil(summary.failureCode)
        XCTAssertEqual(summary.samplesRead, 152)
        XCTAssertEqual(summary.samplesNotRepresentable, 2)
        XCTAssertEqual(summary.samplesSent, 150)
        XCTAssertEqual(summary.batches, 2)
        XCTAssertEqual(summary.outcomes, ["stored": 150])
        let reads = await reader.calls()
        XCTAssertEqual(reads.count, 1)
        XCTAssertEqual(reads.first?.0, Self.start)
        XCTAssertEqual(reads.first?.1, Self.end)
        let payloads = await submitter.payloads()
        XCTAssertEqual(payloads.map(\.samples.count), [100, 50])
        XCTAssertTrue(payloads.allSatisfy { $0.runId == "hv-2026-10-02-30d" })
        let text = String(decoding: try JSONEncoder().encode(payloads[0]), as: UTF8.self)
        for forbidden in ["\"sourceName\"", "\"device\"", "\"metadata\"", "\"deletions\"", "\"windowManifest\""] {
            XCTAssertFalse(text.contains(forbidden), forbidden)
        }
    }

    func testRerunIsIdempotentWithDeterministicBatchIdentities() async {
        let additions = (1...5).map { SleepFixtures.addition(id: $0, start: "2026-09-20T06:00:00Z", end: "2026-09-20T14:00:00Z") }
        let submitter = ValidationSubmitterMock()
        let runner = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: Self.block()),
            reader: ValidationReaderMock(additions: additions.reversed()), submitter: submitter
        )
        _ = await runner.run()
        _ = await runner.run()
        let payloads = await submitter.payloads()
        XCTAssertEqual(payloads.count, 2)
        XCTAssertEqual(payloads[0], payloads[1])
    }

    func testRerunAfterDeviceZoneChangeUsesANewRequestIdentity() async {
        let first = SleepFixtures.addition(id: 1, start: "2026-09-20T06:00:00Z", end: "2026-09-20T14:00:00Z", zone: "America/Los_Angeles", zoneSource: nil)
        let second = SleepFixtures.addition(id: 1, start: "2026-09-20T06:00:00Z", end: "2026-09-20T14:00:00Z", zone: "America/New_York", zoneSource: nil)
        let submitter = ValidationSubmitterMock()
        for addition in [first, second] {
            let runner = HealthKitSleepHistoricalValidationRunner(
                capabilitySource: ValidationCapabilityMock(block: Self.block()),
                reader: ValidationReaderMock(additions: [addition]), submitter: submitter
            )
            _ = await runner.run()
        }
        let payloads = await submitter.payloads()
        XCTAssertEqual(payloads.count, 2)
        XCTAssertNotEqual(payloads[0].batchId, payloads[1].batchId,
                          "different bytes must never reuse an Idempotency-Key")
    }

    func testFailsClosedOnReadErrorTooManySamplesAndDisabledServer() async {
        let tooMany = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: Self.block()),
            reader: ValidationReaderMock(additions: [], count: HealthKitSleepHistoricalValidationContract.maximumSamplesPerRun + 1),
            submitter: ValidationSubmitterMock()
        )
        let tooManySummary = await tooMany.run()
        XCTAssertEqual(tooManySummary.failureCode, "healthkit_sleep_validation_too_many_samples")

        let failing = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: Self.block()),
            reader: ValidationReaderMock(additions: [], error: true), submitter: ValidationSubmitterMock()
        )
        let failingSummary = await failing.run()
        XCTAssertEqual(failingSummary.failureCode, "healthkit_sleep_validation_read_failed")

        let disabledSubmitter = ValidationSubmitterMock(result: .disabled)
        let disabled = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: Self.block()),
            reader: ValidationReaderMock(additions: [SleepFixtures.addition(id: 1, start: "2026-09-20T06:00:00Z", end: "2026-09-20T14:00:00Z")]),
            submitter: disabledSubmitter
        )
        let disabledSummary = await disabled.run()
        XCTAssertEqual(disabledSummary.failureCode, "healthkit_sleep_validation_not_enabled")
        XCTAssertEqual(disabledSummary.samplesSent, 0)
    }

    func testValidationLaneNeverTouchesTheOrdinarySleepGate() async {
        let gate = SleepFixtures.inactiveGate()
        let runner = HealthKitSleepHistoricalValidationRunner(
            capabilitySource: ValidationCapabilityMock(block: Self.block()),
            reader: ValidationReaderMock(additions: [SleepFixtures.addition(id: 1, start: "2026-09-20T06:00:00Z", end: "2026-09-20T14:00:00Z")]),
            submitter: ValidationSubmitterMock()
        )
        _ = await runner.run()
        XCTAssertNil(gate.activeFloor(at: SleepFixtures.now), "prospective Sleep stays off")
        XCTAssertNil(gate.currentCapability())
    }
}

private struct ValidationCapabilityMock: HealthKitSleepValidationCapabilitySource {
    let block: ProductionJSONValue?
    func healthKitSleepHistoricalValidationBlock() async throws -> ProductionJSONValue? { block }
}

private actor ValidationReaderMock: HealthKitSleepHistoricalReader {
    private let additions: [HealthKitQueryAddition]
    private let count: Int?
    private let error: Bool
    private var received: [(Date, Date, Int)] = []

    init(additions: [HealthKitQueryAddition], count: Int? = nil, error: Bool = false) {
        self.additions = additions
        self.count = count
        self.error = error
    }

    func historicalSleepSamples(endingFrom start: Date, before end: Date, limit: Int) async throws -> [HealthKitQueryAddition] {
        received.append((start, end, limit))
        if error { throw HealthKitSyncError.operational(code: "read_failed") }
        if let count { return Array(repeating: SleepFixtures.addition(id: 1), count: min(count, limit)) }
        return additions
    }

    func calls() -> [(Date, Date, Int)] { received }
}

private actor ValidationSubmitterMock: HealthKitSleepValidationSubmitting {
    private let result: HealthKitSleepValidationSubmitResult?
    private var sent: [HealthKitSleepValidationWirePayload] = []

    init(result: HealthKitSleepValidationSubmitResult? = nil) { self.result = result }

    func submitSleepHistoricalValidation(_ payload: HealthKitSleepValidationWirePayload) async -> HealthKitSleepValidationSubmitResult {
        sent.append(payload)
        return result ?? .accepted(outcomes: ["stored": payload.samples.count])
    }

    func payloads() -> [HealthKitSleepValidationWirePayload] { sent }
}
