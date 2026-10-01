import XCTest

/// NON-SHIPPING: drives the fixture-backed Sleep Evidence prototype (Sandbox
/// + DEBUG + launch argument) and captures the Founder review screenshot set.
/// PNGs are written only when `SLEEP_PROTOTYPE_SCREENSHOT_DIR` is provided
/// (via `TEST_RUNNER_SLEEP_PROTOTYPE_SCREENSHOT_DIR`); otherwise this is a
/// pure navigation test. Also attached to the xcresult.
@MainActor
final class SleepEvidencePrototypeScreenshotUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
    }

    private func launch(prototype: Bool) {
        app.launchArguments += ["-physiqueos.native.authority-selection.v1", "sandbox"]
        if prototype { app.launchArguments += ["-physiqueos.sleep-evidence-prototype.v1", "YES"] }
        app.launch()
    }

    private func capture(_ name: String) {
        // Let charts and scroll deceleration settle.
        Thread.sleep(forTimeInterval: 1.2)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let directory = ProcessInfo.processInfo.environment["SLEEP_PROTOTYPE_SCREENSHOT_DIR"], !directory.isEmpty {
            let url = URL(fileURLWithPath: directory).appendingPathComponent("\(name).png")
            XCTAssertNoThrow(try screenshot.pngRepresentation.write(to: url))
        }
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func reveal(_ target: XCUIElement, up: Bool = true, maxSwipes: Int = 14) {
        for _ in 0..<maxSwipes where !(target.exists && target.isHittable) {
            up ? app.swipeUp(velocity: .slow) : app.swipeDown(velocity: .slow)
        }
        XCTAssertTrue(target.exists && target.isHittable, "Could not reveal \(target)")
    }

    /// Drags the element's row up to just below the navigation chrome.
    private func bringNearTop(_ target: XCUIElement) {
        let frame = app.frame
        let targetY = frame.height * 0.17
        guard target.frame.minY > targetY + 20 else { return }
        let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.width / 2, dy: target.frame.midY))
        let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: frame.width / 2, dy: targetY))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
    }

    private func text(_ value: String) -> XCUIElement {
        app.staticTexts[value].firstMatch
    }

    private func back() {
        app.navigationBars.buttons.firstMatch.tap()
    }

    func testRecoveryStaysPlaceholderWithoutPrototypeArgument() {
        launch(prototype: false)
        app.buttons["Evidence"].tap()
        let recovery = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Recovery")).firstMatch
        reveal(recovery)
        XCTAssertTrue(recovery.label.contains("Coming soon"), recovery.label)
        recovery.tap()
        XCTAssertFalse(element("sleep.recovery.landing").waitForExistence(timeout: 2))
    }

    func testCaptureSleepEvidencePrototypeScreens() {
        launch(prototype: true)

        // A. Evidence Hub with Recovery populated.
        app.buttons["Evidence"].tap()
        let recovery = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Recovery")).firstMatch
        XCTAssertTrue(recovery.waitForExistence(timeout: 10))
        // Gentle drags so the hub keeps its header-to-row context in frame.
        for _ in 0..<6 where !recovery.isHittable {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
            start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)))
        }
        XCTAssertTrue(recovery.isHittable)
        XCTAssertTrue(recovery.label.contains("Last night"), recovery.label)
        capture("A-evidence-hub-recovery")

        // B. Recovery landing, top.
        recovery.tap()
        XCTAssertTrue(element("sleep.recovery.landing").waitForExistence(timeout: 5))
        XCTAssertTrue(text("Last Night").waitForExistence(timeout: 5))
        capture("B-recovery-landing-top")

        // C. Recovery landing, lower (window, recent nights, sources).
        let windowHeader = text("Sleep Window")
        reveal(windowHeader)
        bringNearTop(windowHeader)
        capture("C1-recovery-landing-window")
        reveal(text("Data Sources"))
        capture("C2-recovery-landing-lower")

        // E/F. Night detail for an inferred-time-zone night.
        let inferredNight = element("sleep.night.2026-09-30")
        reveal(inferredNight)
        inferredNight.tap()
        XCTAssertTrue(element("sleep.night.screen").waitForExistence(timeout: 5))
        XCTAssertTrue(text("Timeline").waitForExistence(timeout: 5))
        capture("E-night-detail-top")
        reveal(text("Continuity"))
        capture("F1-night-detail-stages-continuity")
        let sourceToggle = element("sleep.sourceData.toggle")
        reveal(sourceToggle)
        sourceToggle.tap()
        reveal(text("Calculation"))
        capture("F2-night-detail-source-provenance")
        back()

        // D. Sleep Trends.
        let trends = element("sleep.trends")
        reveal(trends, up: false)
        trends.tap()
        XCTAssertTrue(element("sleep.trends.screen").waitForExistence(timeout: 5))
        XCTAssertTrue(text("Sleep Trends").waitForExistence(timeout: 5))
        capture("D1-sleep-trends-top")
        reveal(text("Continuity"))
        capture("D2-sleep-trends-window-continuity")
        reveal(element("sleep.stageMix.toggle"))
        capture("D3-sleep-trends-stage-mix-collapsed")
        back()

        // G. State example: a night whose stage detail is pending correction.
        let showAll = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Show All")).firstMatch
        reveal(showAll)
        showAll.tap()
        let pendingNight = element("sleep.night.2026-09-21")
        XCTAssertTrue(app.navigationBars["All Nights"].waitForExistence(timeout: 5))
        reveal(pendingNight)
        pendingNight.tap()
        XCTAssertTrue(text("Timeline").waitForExistence(timeout: 5))
        reveal(text("Continuity"))
        capture("G-state-pending-correction")
    }
}
