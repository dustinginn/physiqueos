import XCTest
import UIKit
@testable import PhysiqueOS

/// Regression coverage for the Evidence Hub read-model contract introduced
/// in this slice.
final class EvidenceReadModelTests: XCTestCase {

    // MARK: - Fixture decoding integrity

    func testBundledFixtureDecodesWithoutError() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertFalse(model.title.isEmpty)
        XCTAssertFalse(model.streams.isEmpty)
    }

    /// Mirrors `EVIDENCE_HUB_CANONICAL_ORDER`
    /// (`src/domain/services/EvidenceHubUsageService.js:3-13`) exactly —
    /// `protocols` is archived and must never appear on the real Evidence
    /// Hub, so the fixture (and any future live payload) must not include
    /// it either.
    func testStreamsMatchTheCanonicalOrderAndExcludeArchivedProtocols() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertEqual(
            model.streams.map(\.id),
            ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "health-metrics"]
        )
        XCTAssertFalse(model.streams.map(\.id).contains("protocols"))
    }

    // MARK: - Locked Hub composition (Batch 3 Checkpoint A)

    /// The locked Hub (design `f7d72f19`, H1) keeps every real stream in
    /// Server order, drops the non-functional Health Metrics placeholder,
    /// and places the Timeline doorway last, after Recovery.
    func testLockedHubMovesTimelineAfterRecoveryAndHidesHealthMetrics() {
        let production = ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "timeline", "recovery", "health-metrics"]
            .map(Self.stream)
        let projected = EvidenceHubPresentation.lockedStreams(production)
        XCTAssertEqual(
            projected.map(\.id),
            ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "timeline"]
        )
        XCTAssertEqual(projected.last?.destination, .progressStream(streamId: "timeline"))
        XCTAssertEqual(projected.map(\.destination), projected.map { .progressStream(streamId: $0.id) })
    }

    /// Canonical availability wins: an authority without a Timeline stream
    /// (Sandbox) gets no synthesized Timeline row.
    func testLockedHubNeverSynthesizesATimelineRow() throws {
        let model = try Self.loadBundledFixture()
        let projected = EvidenceHubPresentation.lockedStreams(model.streams)
        XCTAssertEqual(
            projected.map(\.id),
            ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery"]
        )
        XCTAssertEqual(projected, model.streams.filter { $0.id != "health-metrics" })
    }

    func testTimelineEventDatesUseTheLockedLongForm() {
        XCTAssertEqual(TimelineDateFormatting.long("2026-09-10"), "Sep 10, 2026")
        XCTAssertEqual(TimelineDateFormatting.long("2026-08-01T07:30:00.000Z"), "Aug 1, 2026")
        XCTAssertEqual(TimelineDateFormatting.long("not-a-date"), "not-a-date")
    }

    func testLockedEvidenceTypeScaleMapsTheHarnessToIPhone17Pro() {
        XCTAssertEqual(EvidenceLockedStyle.pt(360), 402, accuracy: 0.0001)
        XCTAssertEqual(EvidenceLockedStyle.uiWeight(800).rawValue, UIFont.Weight.heavy.rawValue, accuracy: 0.0001)
        XCTAssertEqual(EvidenceLockedStyle.uiWeight(400).rawValue, UIFont.Weight.regular.rawValue, accuracy: 0.0001)
        XCTAssertGreaterThan(EvidenceLockedStyle.uiWeight(780).rawValue, UIFont.Weight.bold.rawValue)
        XCTAssertLessThan(EvidenceLockedStyle.uiWeight(780).rawValue, UIFont.Weight.heavy.rawValue)
    }

    private static func stream(_ id: String) -> EvidenceStreamSummary {
        EvidenceStreamSummary(
            id: id, title: id, metric: "", trend: "", lastUpdated: nil,
            status: .available, tone: .primary, destination: .progressStream(streamId: id)
        )
    }

    // MARK: - Every stream resolves to the intended destination

    func testEveryStreamDestinationIsAProgressStream() throws {
        let model = try Self.loadBundledFixture()
        for stream in model.streams {
            XCTAssertEqual(stream.destination.serverDestinationId, "progress.stream")
        }
    }

    /// The Training stream's destination must resolve to the real Training
    /// history screen via `AppDestinationRouterView`, not a placeholder —
    /// this is the first complete evidence vertical, so its wire shape
    /// must be exactly the one the router special-cases.
    func testTrainingStreamDestinationMatchesTheRouterSpecialCase() throws {
        let model = try Self.loadBundledFixture()
        let training = try XCTUnwrap(model.streams.first { $0.id == "training" })
        guard case .progressStream(let streamId) = training.destination else {
            return XCTFail("Expected a progressStream destination.")
        }
        XCTAssertEqual(streamId, "training")
    }

    // MARK: - Status is fail-closed and never implies a fake confirmation

    func testStatusDecodesToKnownCasesOnly() throws {
        let model = try Self.loadBundledFixture()
        for stream in model.streams {
            XCTAssertTrue(stream.status == .available || stream.status == .placeholder)
        }
    }

    func testUnknownStatusFailsClosed() {
        let json = Data(#"""
        {"id":"weight","title":"Weight","metric":"","trend":"","lastUpdated":null,"status":"confirmed","tone":"primary","destination":{"id":"progress.stream","parameters":{"streamId":"weight"}}}
        """#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(EvidenceStreamSummary.self, from: json))
    }

    // MARK: - Fixtures

    static func loadBundledFixture() throws -> EvidenceHubReadModel {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "EvidenceFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(EvidenceHubReadModel.self, from: data)
    }
}
