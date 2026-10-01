import XCTest
@testable import PhysiqueOS

/// The non-shipping Sleep Evidence prototype must never reach Founder
/// Production, and its synthetic fixture must keep the shape the design was
/// validated against (30 nights, one source, staged, 40-90 segments).
final class SleepEvidencePrototypeTests: XCTestCase {
    private func hub() -> EvidenceHubReadModel {
        EvidenceHubReadModel(title: "Evidence", subtitle: "", streams: [
            EvidenceStreamSummary(id: "recovery", title: "Recovery", metric: "Coming soon", trend: "Sleep, HRV, readiness, and recovery.",
                                  lastUpdated: nil, status: .placeholder, tone: .muted, destination: .progressStream(streamId: "recovery")),
            EvidenceStreamSummary(id: "activity", title: "Activity", metric: "8,000 steps", trend: "", lastUpdated: nil,
                                  status: .available, tone: .success, destination: .progressStream(streamId: "activity")),
        ])
    }

    func testGateRequiresSandboxAndEnablement() {
        XCTAssertTrue(SleepEvidencePrototype.isActive(authority: .sandbox, enabled: true))
        XCTAssertFalse(SleepEvidencePrototype.isActive(authority: .founderProduction, enabled: true))
        XCTAssertFalse(SleepEvidencePrototype.isActive(authority: .sandbox, enabled: false))
        XCTAssertFalse(SleepEvidencePrototype.isActive(authority: .founderProduction, enabled: false))
    }

    func testGateIsClosedWithoutTheLaunchArgument() {
        // The unit-test host never passes the prototype launch argument.
        XCTAssertFalse(SleepEvidencePrototype.isEnabled)
        XCTAssertEqual(SleepEvidencePrototype.decorate(hub(), authority: .sandbox), hub())
    }

    func testProductionHubIsNeverDecorated() {
        XCTAssertEqual(SleepEvidencePrototype.decorate(hub(), authority: .founderProduction, enabled: true), hub())
    }

    func testSandboxDecorationOnlyTouchesRecovery() {
        let decorated = SleepEvidencePrototype.decorate(hub(), authority: .sandbox, enabled: true)
        let recovery = decorated.streams.first { $0.id == "recovery" }!
        XCTAssertTrue(recovery.metric.hasPrefix("Last night · "))
        XCTAssertEqual(recovery.status, .available)
        XCTAssertEqual(recovery.destination, .progressStream(streamId: "recovery"))
        XCTAssertEqual(decorated.streams.first { $0.id == "activity" }, hub().streams.first { $0.id == "activity" })
    }

    func testFixtureShapeMatchesValidatedDesignShape() {
        let fixture = SleepPrototypeFixture()
        XCTAssertEqual(fixture.nights.count, 30)
        XCTAssertEqual(Set(fixture.nights.map(\.sleepDay)).count, 30)
        XCTAssertEqual(fixture.nights.first?.sleepDay, "2026-10-01")
        XCTAssertTrue(fixture.nights.first!.windowOpen)
        XCTAssertEqual(fixture.nights.filter(\.timeZoneInferred).count, 3)
        XCTAssertEqual(fixture.nights.filter { $0.stageStatus == .pendingCorrection }.map(\.sleepDay), [SleepPrototypeFixture.pendingCorrectionDay])
        for night in fixture.nights {
            XCTAssertTrue((40...95).contains(night.segments.count), "\(night.sleepDay) has \(night.segments.count) segments")
            XCTAssertTrue((6 * 3600...8 * 3600).contains(night.asleepSeconds), "\(night.sleepDay) asleep \(night.asleepSeconds)")
            XCTAssertEqual(night.asleepSeconds, night.seconds(.core) + night.seconds(.deep) + night.seconds(.rem))
            XCTAssertLessThanOrEqual(night.inBedStart, night.start)
            XCTAssertGreaterThanOrEqual(night.inBedEnd, night.end)
            XCTAssertEqual(night.segments.first?.start, night.start)
            XCTAssertEqual(night.segments.last?.end, night.end)
            for (left, right) in zip(night.segments, night.segments.dropFirst()) {
                XCTAssertEqual(left.end, right.start)
                XCTAssertNotEqual(left.stage, right.stage)
            }
            XCTAssertNotEqual(night.segments.last?.stage, .awake)
        }
    }

    func testTrailingAverageNeedsThreeNights() {
        let fixture = SleepPrototypeFixture()
        XCTAssertNotNil(fixture.trailingAverageSeconds(endingAt: 0))
        XCTAssertNotNil(fixture.trailingAverageSeconds(endingAt: 27))
        XCTAssertNil(fixture.trailingAverageSeconds(endingAt: 28))
    }

    func testDurationFormatting() {
        XCTAssertEqual(SleepFormat.duration(7 * 3600 + 12 * 60), "7h 12m")
        XCTAssertEqual(SleepFormat.duration(34 * 60), "34m")
        XCTAssertEqual(SleepFormat.spokenDuration(7 * 3600 + 60), "7 hours 1 minute")
    }
}
