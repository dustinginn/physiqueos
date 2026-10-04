import XCTest

/// Real-Simulator acceptance for the first locked-design implementation
/// pilot. The DEBUG launch seam supplies a source-shaped Foam Rolling
/// occurrence and appearance only; the screen, navigation, controls and
/// layout are the shipping SwiftUI implementation.
@MainActor
final class FoamRollingPriorityDetailUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testLockedDarkParityAndSkipSafety() {
        launch(appearance: "dark")
        assertLockedContentAndGeometry()
        capture("foam-rolling-simulator-dark")

        app.buttons["priorityDetail.markSkipped"].tap()
        // A first tap only opens the system confirmation; it must never
        // commit the skip by itself. The system dialog's Cancel button is
        // not consistently exposed by the iOS 26.5 simulator AX bridge, so
        // assert the safety invariant on the underlying real screen.
        XCTAssertTrue(app.staticTexts["PRIORITY"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["priorityDetail.markComplete"].exists)
        XCTAssertFalse(app.staticTexts["Priority skipped for today."].exists)
    }

    func testLockedMineralLightParity() {
        launch(appearance: "light")
        assertLockedContentAndGeometry()
        capture("foam-rolling-simulator-light")
    }

    private func launch(appearance: String) {
        app.launchArguments += [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.priority-pilot.enabled", "YES",
            "-physiqueos.priority-pilot.appearance", appearance,
        ]
        app.launch()
        XCTAssertTrue(app.staticTexts["PRIORITY"].waitForExistence(timeout: 8))
    }

    private func assertLockedContentAndGeometry() {
        for value in [
            "PRIORITY", "Foam Rolling", "Open", "Today · 7:15 PM",
            "What", "Complete the scheduled recovery support.",
            "When", "Daily · 7:15 PM", "Timing comes from the saved Support schedule.",
            "Execution Notes", "Saved Support note", "Focus on lower body after leg sessions.",
            "Why it matters", "Supports the current recovery strategy",
            "This recovery method supports training readiness and consistency.",
        ] {
            XCTAssertTrue(app.staticTexts[value].firstMatch.exists, "Missing locked copy: \(value)")
        }

        let complete = app.buttons["priorityDetail.markComplete"]
        let skipped = app.buttons["priorityDetail.markSkipped"]
        XCTAssertTrue(complete.exists && complete.isHittable)
        XCTAssertTrue(skipped.exists && skipped.isHittable)
        XCTAssertGreaterThanOrEqual(complete.frame.height, 52)
        XCTAssertGreaterThanOrEqual(skipped.frame.height, 44)
        XCTAssertFalse(app.tabBars.firstMatch.exists, "Locked Priority Detail has no persistent tab bar.")
    }

    private func capture(_ name: String) {
        Thread.sleep(forTimeInterval: 0.8)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        guard let directory = ProcessInfo.processInfo.environment["FOAM_ROLLING_SCREENSHOT_DIR"],
              !directory.isEmpty
        else { return }
        try? screenshot.pngRepresentation.write(
            to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
        )
    }
}
