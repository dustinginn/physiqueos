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

    func testAppearanceControlAppliesImmediateNonColorSelectionState() {
        app.launchArguments += [
            "-physiqueos.native.authority-selection.v1", "sandbox",
        ]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["You"].waitForExistence(timeout: 8))
        app.tabBars.buttons["You"].tap()
        XCTAssertTrue(app.buttons["you.settings"].waitForExistence(timeout: 5))
        app.buttons["you.settings"].tap()
        XCTAssertTrue(app.buttons["settings.appearance"].waitForExistence(timeout: 5))
        app.buttons["settings.appearance"].tap()

        let light = app.buttons["appearance.light"]
        XCTAssertTrue(light.waitForExistence(timeout: 5))
        light.tap()
        XCTAssertEqual(light.value as? String, "Selected")
        XCTAssertEqual(app.buttons["appearance.dark"].value as? String, "Not selected")
        capture("appearance-control-mineral-light")

        app.buttons["appearance.dark"].tap()
        XCTAssertEqual(app.buttons["appearance.dark"].value as? String, "Selected")
        capture("appearance-control-dark")
    }

    /// Build 87 Founder finding: You/Settings navigation rows must respond
    /// across the whole visible row -- leading content, center whitespace and
    /// the trailing chevron -- not only the label. Dark and Mineral both run
    /// so hit behavior is shown to be appearance-independent.
    func testYouAndSettingsNavigationRowsActivateAcrossTheWholeRow() {
        let offsets: [CGFloat] = [0.06, 0.5, 0.96]
        for (index, offset) in offsets.enumerated() {
            let appearance = index.isMultiple(of: 2) ? "dark" : "light"

            launchReview(route: "you", appearance: appearance)
            tapRow("you.settings", at: offset)
            XCTAssertTrue(app.buttons["settings.appearance"].waitForExistence(timeout: 5), "You → Settings missed at x=\(offset) (\(appearance))")
            tapRow("settings.appearance", at: offset)
            XCTAssertTrue(app.buttons["appearance.light"].waitForExistence(timeout: 5), "Settings → Appearance missed at x=\(offset) (\(appearance))")

            launchReview(route: "you", appearance: appearance)
            tapRow("you.operatingPlan", at: offset)
            XCTAssertTrue(app.staticTexts["OPERATING PLAN"].waitForExistence(timeout: 5), "You → Operating Plan missed at x=\(offset) (\(appearance))")

            launchReview(route: "you", appearance: appearance)
            tapRow("you.goals", at: offset)
            XCTAssertTrue(app.tabBars.buttons["Goals"].waitForSelection(timeout: 5), "You → Goals missed at x=\(offset) (\(appearance))")

            launchReview(route: "you", appearance: appearance)
            tapRow("you.founderConnection", at: offset)
            XCTAssertTrue(app.segmentedControls.buttons["Founder Production"].waitForExistence(timeout: 5), "You → Founder device connection missed at x=\(offset) (\(appearance))")
        }
    }

    private func tapRow(_ identifier: String, at horizontalOffset: CGFloat) {
        let row = app.buttons[identifier]
        XCTAssertTrue(row.waitForExistence(timeout: 5), "\(identifier) is missing")
        row.coordinate(withNormalizedOffset: CGVector(dx: horizontalOffset, dy: 0.5)).tap()
    }

    func testRepresentativeShippingSurfacesDark() {
        captureRepresentativeSurfaces(appearance: "dark")
    }

    func testRepresentativeShippingSurfacesMineralLight() {
        captureRepresentativeSurfaces(appearance: "light")
    }

    func testSystemAppearanceResolution() {
        launchReview(route: "home", appearance: "system")
        capture("system-resolved-home")
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

    private func captureRepresentativeSurfaces(appearance: String) {
        for route in [
            "home", "log", "briefing", "evidence", "training-logger",
            "goals", "operating-plan", "you", "appearance", "manual-weight",
        ] {
            launchReview(route: route, appearance: appearance)
            capture("\(appearance)-\(route)")
        }
    }

    private func launchReview(route: String, appearance: String) {
        app.terminate()
        app.launchArguments = [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.appearance.preference.v1", appearance,
            "-physiqueos.appearance-review.route", route,
        ]
        app.launch()
        XCTAssertEqual(app.state, .runningForeground)
        Thread.sleep(forTimeInterval: 1.2)
    }

    private func capture(_ name: String) {
        Thread.sleep(forTimeInterval: 0.8)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        guard let directory = ProcessInfo.processInfo.environment["APPEARANCE_SCREENSHOT_DIR"]
                ?? ProcessInfo.processInfo.environment["FOAM_ROLLING_SCREENSHOT_DIR"],
              !directory.isEmpty
        else { return }
        try? screenshot.pngRepresentation.write(
            to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
        )
    }
}

private extension XCUIElement {
    func waitForSelection(timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if isSelected { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return isSelected
    }
}
