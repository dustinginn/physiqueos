import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Log read-model contract and the
/// destination/validation seams introduced in this slice.
final class LogReadModelTests: XCTestCase {

    // MARK: - Fixture decoding integrity

    func testBundledFixtureDecodesWithoutError() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertEqual(model.loggedToday.count, 3)
        XCTAssertFalse(model.localDate.isEmpty)
    }

    /// `composeLoggedTodaySummary` (`src/domain/services/LoggedTodayService.js`)
    /// always returns training, nutrition, activity in that exact order —
    /// this is product-significant, not incidental, so a fixture/decoder
    /// change that silently reorders them should fail a test.
    func testLoggedTodayRowsPreserveProductOrder() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertEqual(model.loggedToday.map(\.kind), [.training, .nutrition, .activity])
    }

    func testFixtureExercisesBothPopulatedAndEmptyRowStates() throws {
        let model = try Self.loadBundledFixture()
        let populated = model.loggedToday.filter { $0.destination != nil }
        let empty = model.loggedToday.filter { $0.destination == nil }
        XCTAssertFalse(populated.isEmpty, "Fixture should exercise at least one populated, tappable row.")
        XCTAssertFalse(empty.isEmpty, "Fixture should exercise at least one empty, non-tappable row.")
    }

    // MARK: - Section visibility follows fixture state

    func testEmptyPendingReviewsHidesTheSection() throws {
        var model = try Self.loadBundledFixture()
        model.pendingEvidenceReviews = []
        XCTAssertFalse(model.hasPendingEvidenceReviews)
    }

    func testNonEmptyPendingReviewsShowsTheSection() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertTrue(model.hasPendingEvidenceReviews)
    }

    // MARK: - Every visible Log entry resolves to the intended destination

    func testLoggedTodayDestinationsMatchTheirRowKind() throws {
        let model = try Self.loadBundledFixture()
        for row in model.loggedToday {
            guard let destination = row.destination else { continue }
            switch row.kind {
            case .training:
                // A single confirmed session routes to a specific session;
                // otherwise it falls back to the generic progress stream —
                // both are legitimate per the server's own destination
                // patterns (destinationFromWebHref).
                XCTAssertTrue(
                    destination.serverDestinationId == "training.session"
                        || destination.serverDestinationId == "progress.stream"
                )
            case .nutrition, .activity:
                XCTAssertEqual(destination.serverDestinationId, "progress.stream")
            }
        }
    }

    func testPendingReviewDestinationIsEvidenceReview() throws {
        let model = try Self.loadBundledFixture()
        for review in model.pendingEvidenceReviews {
            XCTAssertEqual(review.destination.serverDestinationId, "evidence.review")
            guard case .evidenceReview(let reviewId) = review.destination else {
                return XCTFail("Expected an evidenceReview destination.")
            }
            XCTAssertEqual(reviewId, review.id)
        }
    }

    // MARK: - New AppDestination cases: wire shape and fail-closed decoding

    func testNewDestinationCasesRoundTripThroughTheServerWireShape() throws {
        let destinations: [AppDestination] = [
            .evidenceReview(reviewId: "review-1"),
            .trainingSession(sessionId: "session-1"),
            .progressStream(streamId: "nutrition"),
            .trainingLogger,
        ]
        for destination in destinations {
            let data = try JSONEncoder().encode(destination)
            let decoded = try JSONDecoder().decode(AppDestination.self, from: data)
            XCTAssertEqual(decoded, destination)
        }
    }

    /// The web's own typed-destination registry currently has no dedicated
    /// Training Logger destination id — `/log/training` maps to the same
    /// `log` id as `/log` itself. This is a real, source-verified current
    /// product fact, not a native invention, so decoding `"log"` must
    /// resolve to `.trainingLogger` rather than failing.
    func testTrainingLoggerAliasesTheServerLogDestinationId() throws {
        let json = Data(#"{"id": "log", "parameters": {}}"#.utf8)
        let decoded = try JSONDecoder().decode(AppDestination.self, from: json)
        XCTAssertEqual(decoded, .trainingLogger)
        XCTAssertEqual(AppDestination.trainingLogger.serverDestinationId, "log")
    }

    func testUnsupportedDestinationIdStillFailsClosed() {
        let json = Data(#"{"id": "something.unsupported", "parameters": {}}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(AppDestination.self, from: json))
    }

    // MARK: - Direct weigh-in validation mirrors the server's exact messages

    func testWeighInValidationAcceptsInBoundsWeights() {
        XCTAssertNil(DirectWeighInValidation.validationError(forWeightText: "165.2"))
        XCTAssertNil(DirectWeighInValidation.validationError(forWeightText: "50"))
        XCTAssertNil(DirectWeighInValidation.validationError(forWeightText: "1000"))
    }

    func testWeighInValidationRejectsEmptyOrNonNumeric() {
        XCTAssertEqual(DirectWeighInValidation.validationError(forWeightText: ""), "Enter a valid weight.")
        XCTAssertEqual(DirectWeighInValidation.validationError(forWeightText: "abc"), "Enter a valid weight.")
    }

    func testWeighInValidationRejectsOutOfBoundsWeights() {
        XCTAssertEqual(DirectWeighInValidation.validationError(forWeightText: "49.9"), "Weight must be between 50 and 1,000 lb.")
        XCTAssertEqual(DirectWeighInValidation.validationError(forWeightText: "1000.1"), "Weight must be between 50 and 1,000 lb.")
    }

    // MARK: - No fake canonical success

    /// The weigh-in validator never returns a message implying the weigh-in
    /// was saved — every possible outcome is either a validation failure
    /// or (by construction in `UploadCardView`) an explicit "isn't
    /// connected" status. This guards against a future edit accidentally
    /// wiring a false-success string into the validator itself.
    func testWeighInValidationNeverClaimsSuccess() {
        let probes = ["", "abc", "0", "49.9", "165.2", "1000", "1000.1", "-5"]
        for probe in probes {
            let message = DirectWeighInValidation.validationError(forWeightText: probe) ?? ""
            XCTAssertFalse(message.localizedCaseInsensitiveContains("saved"))
            XCTAssertFalse(message.localizedCaseInsensitiveContains("success"))
        }
    }

    // MARK: - Fixtures

    static func loadBundledFixture() throws -> LogReadModel {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "LogFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(LogReadModel.self, from: data)
    }
}
