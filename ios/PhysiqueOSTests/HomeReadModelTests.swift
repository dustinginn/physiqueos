import XCTest
@testable import PhysiqueOS

/// Regression coverage for the Home read-model contract introduced in this
/// slice. These tests protect the boundary the Native V1 design depends on:
/// native must decode and display server-owned values, never derive them.
final class HomeReadModelTests: XCTestCase {

    // MARK: - Fixture decoding integrity

    func testBundledFixtureDecodesWithoutError() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertFalse(model.header.name.isEmpty)
        XCTAssertFalse(model.goals.isEmpty)
        XCTAssertNotNil(model.hero.confidence)
    }

    func testFixtureExercisesBothGoalPresentationModes() throws {
        let model = try Self.loadBundledFixture()
        let hasPrimary = model.goals.contains { if case .primary = $0.presentation { return true } else { return false } }
        let hasSupporting = model.goals.contains { if case .supporting = $0.presentation { return true } else { return false } }
        XCTAssertTrue(hasPrimary, "Fixture should exercise the primary-goal presentation.")
        XCTAssertTrue(hasSupporting, "Fixture should exercise the supporting-objective presentation.")
    }

    // MARK: - Confidence is supplied, never recomputed

    /// Decodes two fixtures that differ only in their confidence value and
    /// asserts the decoded model reflects each value exactly. `HomeReadModel`
    /// decoding is a pure structural mapping with no arithmetic over
    /// `confidence` anywhere in its `init(from:)` path — this test would
    /// catch a future change that started deriving or clamping the value
    /// during decode instead of passing it through untouched.
    func testConfidenceValueIsPassedThroughVerbatim() throws {
        for expected in [0, 42, 100] {
            let json = Self.confidenceOnlyFixture(confidence: expected)
            let model = try JSONDecoder().decode(HomeReadModel.self, from: json)
            XCTAssertEqual(model.hero.confidence, expected)
        }
    }

    func testMissingConfidenceDecodesToNilNotZero() throws {
        let json = Self.confidenceOnlyFixture(confidence: nil)
        let model = try JSONDecoder().decode(HomeReadModel.self, from: json)
        XCTAssertNil(model.hero.confidence, "Absent confidence must stay absent, never default to 0 or another computed value.")
    }

    // MARK: - Section visibility follows fixture state

    func testEmptyBriefingCardsHidesTheSection() throws {
        var model = try Self.loadBundledFixture()
        model.briefingCards = []
        XCTAssertFalse(model.hasBriefingCards)
    }

    func testNonEmptyBriefingCardsShowsTheSection() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertTrue(model.hasBriefingCards)
    }

    func testEmptyTodaysFocusHidesTheSection() throws {
        var model = try Self.loadBundledFixture()
        model.todaysFocus = []
        XCTAssertFalse(model.hasTodaysFocus)
    }

    // MARK: - Typed, bounded route intent

    func testDestinationRoundTripsThroughTheServerWireShape() throws {
        let destinations: [AppDestination] = [
            .goalDetail(goalId: "goal_fixture_lean_definition"),
            .checkIn(checkInType: "morning"),
            .photoUpload,
            .dexaUpload,
            .briefingDetail(briefingId: "briefing-daily-fixture-001"),
            .briefingList,
            .priorityDetail(priorityId: "priority-fixture-001"),
        ]
        for destination in destinations {
            let data = try JSONEncoder().encode(destination)
            let decoded = try JSONDecoder().decode(AppDestination.self, from: data)
            XCTAssertEqual(decoded, destination)
        }
    }

    func testDestinationWireShapeMatchesServerIdFormat() throws {
        // Guards against a native-only id format drifting from the server's
        // actual DestinationId strings (src/contracts/v1/destination.js).
        let data = try JSONEncoder().encode(AppDestination.goalDetail(goalId: "abc"))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["id"] as? String, "goal.detail")
        let parameters = object?["parameters"] as? [String: Any]
        XCTAssertEqual(parameters?["goalId"] as? String, "abc")
    }

    func testUnknownDestinationIdFailsClosedRatherThanGuessing() {
        let json = Data(#"{"id": "some.unrecognized.destination", "parameters": {}}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(AppDestination.self, from: json))
    }

    func testEveryHomeInteractionCarriesAResolvableDestination() throws {
        let model = try Self.loadBundledFixture()
        XCTAssertNotNil(model.nextBestAction.destination)
        for card in model.briefingCards where card.destination != nil {
            XCTAssertEqual(card.destination?.serverDestinationId, "briefing.detail")
        }
        for goal in model.goals where goal.destination != nil {
            XCTAssertEqual(goal.destination?.serverDestinationId, "goal.detail")
        }
    }

    // MARK: - Natural prose capitalization

    /// Mirrors the product rule in
    /// `src/domain/presentation/proseCapitalization.js`: internal domain
    /// nouns (Goal, Confidence, Evidence, ...) must read as ordinary English
    /// mid-sentence, not as proper nouns. This does not reimplement that
    /// module — it checks the same narrow rule against the prose fields
    /// Home actually renders, so fixture/live copy that violates it fails a
    /// test instead of only being caught by eyeballing the simulator.
    func testProseCopyUsesNaturalMidSentenceCapitalization() throws {
        let model = try Self.loadBundledFixture()
        var prose = [model.hero.headline, model.hero.supportLine]
        if let detail = model.hero.confidenceDetail {
            prose += detail.supportingFactors + detail.limitingFactors + detail.clarifyingFactors
            if !detail.uncertaintyStatement.isEmpty { prose.append(detail.uncertaintyStatement) }
        }
        for sentence in prose {
            XCTAssertTrue(
                NaturalCapitalizationCheck.violations(in: sentence).isEmpty,
                "Unnatural mid-sentence capitalization in: \"\(sentence)\""
            )
        }
    }

    /// The bundled fixture's own copy happens to contain no mid-sentence
    /// domain nouns, so the assertion above would pass even if the checker
    /// were broken. This test exercises the checker directly against a
    /// deliberately bad and a deliberately fine string, so a regression in
    /// the rule itself — not just in fixture copy — is caught.
    func testNaturalCapitalizationCheckDetectsMidSentenceViolations() {
        XCTAssertEqual(
            NaturalCapitalizationCheck.violations(in: "Your Goal is progressing well."),
            ["Goal"]
        )
        XCTAssertTrue(
            NaturalCapitalizationCheck.violations(in: "Weight trends are good. Confidence continues to build.").isEmpty,
            "Sentence-initial capitalization must not be flagged."
        )
    }

    // MARK: - Fixtures

    static func loadBundledFixture() throws -> HomeReadModel {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "HomeFixture", withExtension: "json"))
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(HomeReadModel.self, from: data)
    }

    static func confidenceOnlyFixture(confidence: Int?) -> Data {
        let confidenceLiteral = confidence.map(String.init) ?? "null"
        let json = """
        {
          "header": { "greeting": "Good morning,", "name": "Alex" },
          "hero": {
            "mode": "active", "goalLabel": "Test Goal", "headline": "On track.",
            "supportLine": "Keep executing the plan.", "confidence": \(confidenceLiteral),
            "confidenceDetail": null, "projectedFinish": null, "daysRemaining": null,
            "actionLabel": null, "actionDestination": null
          },
          "nextBestAction": { "title": "Log Morning Weight", "icon": "scale", "destination": { "id": "check-in", "parameters": { "checkInType": "morning" } } },
          "briefingCards": [],
          "goals": [],
          "todaysFocus": []
        }
        """
        return Data(json.utf8)
    }
}

/// Test-only mirror of the product's mid-sentence capitalization rule.
/// Not shipped in the app target — it exists to check fixture/live copy in
/// tests, the same way the web repository's equivalent module is only
/// exercised from its own test suite.
enum NaturalCapitalizationCheck {
    static let domainNouns = [
        "Training", "Energy", "Weight", "Photos", "Goal", "Recovery", "Activity",
        "Strategy", "Phase", "Forecast", "Confidence", "Evidence", "Guardrail",
        "Nutrition", "Review", "Baseline", "Trajectory", "Protocol",
    ]

    static func violations(in text: String) -> [String] {
        guard !text.isEmpty else { return [] }
        var found: [String] = []
        for noun in domainNouns {
            guard let regex = try? NSRegularExpression(pattern: "\\b\(noun)\\b") else { continue }
            let range = NSRange(text.startIndex..., in: text)
            for match in regex.matches(in: text, range: range) {
                guard let matchRange = Range(match.range, in: text) else { continue }
                let prefix = text[text.startIndex..<matchRange.lowerBound].trimmingCharacters(in: .whitespaces)
                if prefix.isEmpty || prefix.hasSuffix(".") || prefix.hasSuffix("!") || prefix.hasSuffix("?") { continue }
                found.append(noun)
            }
        }
        return found
    }
}
