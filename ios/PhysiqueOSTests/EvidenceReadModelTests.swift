import XCTest
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
