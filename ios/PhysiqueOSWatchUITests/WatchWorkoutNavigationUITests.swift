import XCTest

/// Physical-gesture proof for the locked Watch interaction (Founder
/// correction for Build 83): from the primary execution screen a SWIPE
/// RIGHT (finger moving left to right) opens workout controls; vertical
/// paging stays Execution -> Workout Metrics -> Daily Totals. Driven against
/// the real shipping SwiftUI surfaces through the DEBUG fixture harness, so
/// no phone, HealthKit or network is involved.
final class WatchWorkoutNavigationUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func launch(_ fixture: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-watchFixture", fixture]
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    func testSwipeRightFromExecutionOpensControlsAndSwipeLeftReturns() {
        let app = launch("normal")
        let completeSet = element(app, "watch.execution.completeSet")
        XCTAssertTrue(completeSet.waitForExistence(timeout: 10), "Execution is the primary surface.")
        XCTAssertFalse(element(app, "watch.controls.title").isHittable)

        app.swipeRight()

        let title = element(app, "watch.controls.title")
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertTrue(title.isHittable, "Swipe RIGHT reveals the controls page.")
        XCTAssertTrue(element(app, "watch.controls.pauseResume").isHittable)
        XCTAssertTrue(element(app, "watch.controls.finish").isHittable)
        XCTAssertTrue(element(app, "watch.controls.cancel").isHittable)

        app.swipeLeft()
        XCTAssertTrue(completeSet.waitForExistence(timeout: 5))
        XCTAssertTrue(completeSet.isHittable, "Swipe left returns to execution.")
    }

    func testSwipeLeftFromExecutionDoesNotOpenControls() {
        let app = launch("normal")
        let completeSet = element(app, "watch.execution.completeSet")
        XCTAssertTrue(completeSet.waitForExistence(timeout: 10))
        app.swipeLeft()
        XCTAssertTrue(completeSet.isHittable, "Controls are never reached by swiping left.")
        XCTAssertFalse(element(app, "watch.controls.title").isHittable)
    }

    func testPausedWorkoutControlsKeepResumeAndCancel() {
        let app = launch("paused")
        XCTAssertTrue(element(app, "watch.execution").waitForExistence(timeout: 10))
        app.swipeRight()
        let resume = element(app, "watch.controls.pauseResume")
        XCTAssertTrue(resume.waitForExistence(timeout: 5))
        XCTAssertTrue(resume.isHittable)
        XCTAssertTrue(element(app, "watch.controls.cancel").isHittable, "Cancel is available while paused.")
    }

    func testVerticalPagingReachesMetricsThenDailyTotals() {
        let app = launch("normal")
        XCTAssertTrue(element(app, "watch.execution.completeSet").waitForExistence(timeout: 10))
        app.swipeUp()
        XCTAssertTrue(element(app, "watch.metrics").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["WORKOUT METRICS"].waitForExistence(timeout: 5))
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["DAILY TOTALS"].waitForExistence(timeout: 5))
        XCTAssertTrue(element(app, "watch.dailyTotals.freshness").exists)
    }

    func testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns() {
        let app = launch("final-workout")
        let finish = element(app, "watch.execution.finishWorkout")
        XCTAssertTrue(finish.waitForExistence(timeout: 10))
        XCTAssertTrue(element(app, "watch.rest").exists, "Rest runs before Finish.")
        finish.tap()

        XCTAssertTrue(element(app, "watch.finishConfirmation").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Finish workout?"].exists)
        XCTAssertFalse(element(app, "watch.rest").exists, "Rest stops on the Finish intent.")
        XCTAssertFalse(app.staticTexts["Finishing safely…"].exists)
        let notYet = element(app, "watch.finishConfirmation.notYet")
        XCTAssertTrue(notYet.isHittable)
        notYet.tap()
        XCTAssertTrue(finish.waitForExistence(timeout: 5))
    }

    func testControlsFinishUsesTheSameConfirmation() {
        let app = launch("normal")
        XCTAssertTrue(element(app, "watch.execution").waitForExistence(timeout: 10))
        app.swipeRight()
        let finish = element(app, "watch.controls.finish")
        XCTAssertTrue(finish.waitForExistence(timeout: 5))
        finish.tap()
        // The same confirmation component, in place on the controls page
        // (its container identifier is flattened into the controls page).
        XCTAssertTrue(app.staticTexts["Finish workout?"].waitForExistence(timeout: 5))
        XCTAssertTrue(element(app, "watch.finishConfirmation.notYet").exists)
        XCTAssertFalse(app.staticTexts["Finishing safely…"].exists)
    }

    func testWorkoutSavedHasAProminentDone() {
        let app = launch("summary")
        let done = element(app, "watch.summary.done")
        XCTAssertTrue(done.waitForExistence(timeout: 10))
        XCTAssertTrue(done.isHittable)
        done.tap()
        XCTAssertTrue(element(app, "watch.idle").waitForExistence(timeout: 5), "Done returns to idle.")
    }
}

/// Build 91 (Founder D5): the shared panel page lays out without a
/// ScrollView when it fits (no system scroll chrome under the action in
/// Mineral Light) and still scrolls when accessibility text overflows.
final class WatchPanelFooterUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launch(_ fixture: String, appearance: String = "mineralLight", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-watchFixture", fixture, "-watchAppearance", appearance] + extra
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ identifier: String) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    func testDefaultSizePanelsFitWithoutAScrollViewInBothAppearances() {
        let cases: [(String, String, String)] = [
            ("start", "mineralLight", "watch.start"),
            ("idle", "mineralLight", "watch.idle.refresh"),
            ("idle-unavailable", "mineralLight", "watch.idle.refresh"),
            ("start", "dark", "watch.start"),
        ]
        for (fixture, appearance, action) in cases {
            let app = launch(fixture, appearance: appearance)
            let button = element(app, action)
            XCTAssertTrue(button.waitForExistence(timeout: 15), "\(fixture) \(appearance)")
            XCTAssertTrue(button.isHittable, "\(fixture): the action is on screen without scrolling.")
            // Page identifiers (watch.idle, watch.orphan) replace the inner
            // panel identifier, so the structural check is the ScrollView.
            XCTAssertEqual(app.scrollViews.count, 0, "\(fixture) \(appearance): fits, so no ScrollView")
            app.terminate()
        }
    }

    /// The orphan prompt fits a 49 mm screen (no ScrollView). On the 42 mm
    /// case its two actions are taller than the screen, as in Build 90, so
    /// the page uses the overflow fallback (bottom edge effect hidden); both
    /// actions must still be reachable.
    func testOrphanPromptKeepsBothActionsReachable() {
        let app = launch("orphan")
        XCTAssertTrue(element(app, "watch.orphan").waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["End & Save"].isHittable)
        if app.windows.firstMatch.frame.height >= 240 {
            XCTAssertEqual(app.scrollViews.count, 0, "49 mm: fits, so no ScrollView")
        }
        let discard = app.buttons["Discard"]
        var swipes = 0
        while !discard.isHittable && swipes < 4 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(discard.isHittable)
    }

    func testAccessibilityTextOverflowStillScrollsToTheAction() {
        let app = launch("orphan", extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        XCTAssertTrue(element(app, "watch.orphan").waitForExistence(timeout: 15))
        XCTAssertGreaterThan(app.scrollViews.count, 0, "An overflowing page falls back to scrolling.")
        let discard = app.buttons["Discard"]
        var swipes = 0
        while !discard.isHittable && swipes < 6 {
            app.swipeUp()
            swipes += 1
        }
        XCTAssertTrue(discard.isHittable, "The last action stays reachable by scrolling.")
    }
}

/// Build 93 primary workout action continuity: Complete Set (execution),
/// Finish Workout (final set) and the Finish confirmation render the iPhone
/// Finish Workout amber in each Watch appearance. Real shipping SwiftUI via
/// the DEBUG fixture harness; captures are simulator code-acceptance only.
final class WatchPrimaryActionThemeUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    func testPrimaryWorkoutActionsRenderInBothAppearances() {
        let cases: [(String, String)] = [
            ("normal", "watch.execution.completeSet"),
            ("final-workout", "watch.execution.finishWorkout"),
            ("finish-confirmation", "watch.finishConfirmation.finish"),
        ]
        for appearance in ["dark", "mineralLight"] {
            for (fixture, identifier) in cases {
                let app = XCUIApplication()
                app.launchArguments = ["-watchFixture", fixture, "-watchAppearance", appearance]
                app.launch()
                let action = app.descendants(matching: .any).matching(identifier: identifier).firstMatch
                XCTAssertTrue(action.waitForExistence(timeout: 15), "\(fixture) \(appearance)")
                XCTAssertTrue(action.isHittable, "\(fixture) \(appearance): the primary action is on screen")
                capture(app, name: "watch-\(fixture)-\(appearance)")
                app.terminate()
            }
        }
    }

    private func capture(_ app: XCUIApplication, name: String) {
        Thread.sleep(forTimeInterval: 0.8)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let directory = ProcessInfo.processInfo.environment["WATCH_THEME_SCREENSHOT_DIR"], !directory.isEmpty else { return }
        let size = app.windows.firstMatch.frame.height >= 240 ? "large" : "small"
        try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name)-\(size).png"))
    }
}
