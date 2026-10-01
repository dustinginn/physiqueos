import XCTest
@testable import PhysiqueOS

final class HealthKitSleepHistoricalEvidenceTests: XCTestCase {
    private static let start = SleepFixtures.date("2026-07-06T01:00:00Z")
    private static let end = SleepFixtures.date("2026-10-07T01:00:00Z")

    static func block(overrides: [String: ProductionJSONValue] = [:]) -> ProductionJSONValue {
        var value: [String: ProductionJSONValue] = [
            "commandType": .string("healthkit.sleep.historical-evidence.ingest.v1"),
            "contractVersion": .string("healthkit-sleep-historical-evidence-v1"),
            "enabled": .bool(true),
            "runId": .string("sleep-evidence-2026-07-06-through-2026-10-06-v1"),
            "startSleepDay": .string("2026-07-06"),
            "endSleepDay": .string("2026-10-06"),
            "windowStart": .string("2026-07-06T01:00:00.000Z"),
            "windowEnd": .string("2026-10-07T01:00:00.000Z"),
        ]
        for (key, item) in overrides { value[key] = item }
        return .object(value)
    }

    func testCapabilityRequiresTheExactSourceControlledWindow() {
        XCTAssertEqual(
            HealthKitSleepHistoricalEvidenceCapability.resolve(Self.block()),
            .init(runId: "sleep-evidence-2026-07-06-through-2026-10-06-v1", windowStart: Self.start, windowEnd: Self.end, startSleepDay: "2026-07-06", endSleepDay: "2026-10-06")
        )
        for overrides: [String: ProductionJSONValue] in [
            ["enabled": .bool(false)],
            ["runId": .string("sleep-evidence-widened")],
            ["startSleepDay": .string("2026-07-05")],
            ["endSleepDay": .string("2026-10-07")],
            ["windowStart": .string("2026-07-05T01:00:00.000Z")],
            ["windowEnd": .string("2026-10-08T01:00:00.000Z")],
        ] {
            XCTAssertNil(HealthKitSleepHistoricalEvidenceCapability.resolve(Self.block(overrides: overrides)))
        }
    }

    func testClosedLaneReadsNothing() async {
        let reader = EvidenceReaderMock(additions: [])
        let submitter = EvidenceSubmitterMock()
        let runner = HealthKitSleepHistoricalEvidenceRunner(capabilitySource: EvidenceCapabilityMock(block: nil), reader: reader, submitter: submitter)
        let summary = await runner.run()
        XCTAssertEqual(summary.failureCode, "healthkit_sleep_evidence_import_not_enabled")
        let reads = await reader.calls()
        let payloads = await submitter.payloads()
        XCTAssertTrue(reads.isEmpty)
        XCTAssertTrue(payloads.isEmpty)
    }

    func testBoundedImportBatchesDeterministicallyAndReportsFirstRepresentableDay() async {
        let additions = (1...101).map { SleepFixtures.addition(id: $0, start: "2026-07-09T06:00:00Z", end: "2026-07-09T14:00:00Z", source: $0.isMultiple(of: 2) ? .oura : .watch) }
        let reader = EvidenceReaderMock(additions: Array(additions.reversed()))
        let submitter = EvidenceSubmitterMock()
        let runner = HealthKitSleepHistoricalEvidenceRunner(capabilitySource: EvidenceCapabilityMock(block: Self.block()), reader: reader, submitter: submitter)
        let first = await runner.run()
        _ = await runner.run()
        XCTAssertNil(first.failureCode)
        XCTAssertEqual(first.samplesRead, 101)
        XCTAssertEqual(first.samplesSent, 101)
        XCTAssertEqual(first.batches, 2)
        XCTAssertEqual(first.firstRepresentableSleepDay, "2026-07-09")
        let reads = await reader.calls()
        XCTAssertEqual(reads.first?.0, Self.start)
        XCTAssertEqual(reads.first?.1, Self.end)
        let payloads = await submitter.payloads()
        XCTAssertEqual(payloads.map(\.samples.count), [100, 1, 100, 1])
        XCTAssertEqual(payloads[0], payloads[2])
        XCTAssertEqual(payloads[1], payloads[3])
        XCTAssertTrue(payloads.allSatisfy { $0.runId == "sleep-evidence-2026-07-06-through-2026-10-06-v1" })
    }

    func testReadFailureAndOversizeFailClosed() async {
        let failed = HealthKitSleepHistoricalEvidenceRunner(capabilitySource: EvidenceCapabilityMock(block: Self.block()), reader: EvidenceReaderMock(additions: [], error: true), submitter: EvidenceSubmitterMock())
        let failedSummary = await failed.run()
        XCTAssertEqual(failedSummary.failureCode, "healthkit_sleep_evidence_read_failed")
        let oversized = HealthKitSleepHistoricalEvidenceRunner(capabilitySource: EvidenceCapabilityMock(block: Self.block()), reader: EvidenceReaderMock(additions: [], count: HealthKitSleepHistoricalEvidenceContract.maximumSamplesPerRun + 1), submitter: EvidenceSubmitterMock())
        let oversizedSummary = await oversized.run()
        XCTAssertEqual(oversizedSummary.failureCode, "healthkit_sleep_evidence_too_many_samples")
    }
}

private struct EvidenceCapabilityMock: HealthKitSleepHistoricalEvidenceCapabilitySource {
    let block: ProductionJSONValue?
    func healthKitSleepHistoricalEvidenceBlock() async throws -> ProductionJSONValue? { block }
}

private actor EvidenceReaderMock: HealthKitSleepHistoricalReader {
    let additions: [HealthKitQueryAddition]
    let count: Int?
    let error: Bool
    var received: [(Date, Date, Int)] = []
    init(additions: [HealthKitQueryAddition], count: Int? = nil, error: Bool = false) { self.additions = additions; self.count = count; self.error = error }
    func historicalSleepSamples(endingFrom start: Date, before end: Date, limit: Int) async throws -> [HealthKitQueryAddition] {
        received.append((start, end, limit))
        if error { throw HealthKitSyncError.operational(code: "read_failed") }
        if let count { return Array(repeating: SleepFixtures.addition(id: 1), count: min(count, limit)) }
        return additions
    }
    func calls() -> [(Date, Date, Int)] { received }
}

private actor EvidenceSubmitterMock: HealthKitSleepHistoricalEvidenceSubmitting {
    var sent: [HealthKitSleepHistoricalEvidenceWirePayload] = []
    func submitSleepHistoricalEvidence(_ payload: HealthKitSleepHistoricalEvidenceWirePayload) async -> HealthKitSleepHistoricalEvidenceSubmitResult {
        sent.append(payload)
        return .accepted(outcomes: ["stored": payload.samples.count])
    }
    func payloads() -> [HealthKitSleepHistoricalEvidenceWirePayload] { sent }
}
