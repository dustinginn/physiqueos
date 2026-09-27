import XCTest

/// Proves the Goal detail page's "Your Journey" phase cards use the same
/// progress-bar visual treatment as Home's `PhaseTrajectoryPhaseCard`
/// (shared via `PhaseProgressPresentation`): one semantic label trailing
/// the bar, never a separate raw percentage number alongside it. The bundled
/// Sandbox "Build Lean Mass" goal fixture has a completed phase ("Establish
/// Maintenance", 100%, "Phase complete") and an active one ("Lean Mass
/// Build", 18%, "Phase 2 in progress"), covering both phase states.
@MainActor
final class GoalsAcceptanceUITests: XCTestCase {
    private let app = XCUIApplication()

    private func launchInSandbox() {
        continueAfterFailure = false
        app.launchArguments += ["-physiqueos.native.authority-selection.v1", "sandbox"]
        app.launch()
    }

    func testJourneyPhaseCardsShowOneLabelPerPhaseNeverARedundantSeparatePercentage() throws {
        launchInSandbox()
        app.buttons["Goals"].tap()
        tapText("Build Lean Mass")
        scrollToText("Your Journey")

        assertText("Establish Maintenance")
        assertText("Phase complete")
        assertText("Lean Mass Build")
        assertText("Phase 2 in progress")

        // Negative space: the prior design paired each label with its own
        // separate "\(percentage)%" text; the shared treatment shows the
        // percentage only via the bar's fill and VoiceOver value, never as
        // a second on-screen number next to the label.
        XCTAssertFalse(app.staticTexts["100%"].exists, "Completed phase must not show a redundant separate percentage next to its label.")
        XCTAssertFalse(app.staticTexts["18%"].exists, "Active phase must not show a redundant separate percentage next to its label.")
    }

    @discardableResult
    private func assertText(_ text: String, timeout: TimeInterval = 5) -> XCUIElement {
        let element = app.staticTexts[text].firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Missing visible text: \(text)")
        return element
    }

    @discardableResult
    private func scrollToText(_ text: String, maxSwipes: Int = 12) -> XCUIElement {
        let element = app.staticTexts[text].firstMatch
        for _ in 0..<maxSwipes where !element.exists || !element.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "Could not scroll to visible text: \(text)")
        return element
    }

    private func tapText(_ text: String) {
        let element = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@", text)
        ).firstMatch
        for _ in 0..<12 where !element.exists || !element.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(element.exists && element.isHittable, "Could not scroll to actionable control: \(text)")
        element.tap()
    }
}
