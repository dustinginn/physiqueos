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

/// Build 91 audit probe (design branch only): captures the panel pages after
/// a Digital Crown scroll and a swipe so the Mineral Light bottom edge can be
/// inspected. Captures land in `TEST_RUNNER_B91_WATCH_CAPTURE_DIR` when set.
final class WatchFooterProbeUITests: XCTestCase {
    override func setUp() { continueAfterFailure = true }

    private func capture(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["B91_WATCH_CAPTURE_DIR"] else { return }
        let data = XCUIScreen.main.screenshot().pngRepresentation
        try? data.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
    }

    private func run(_ fixture: String, probe: String?, appearance: String = "mineralLight") {
        let app = XCUIApplication()
        app.launchArguments = ["-watchFixture", fixture, "-watchAppearance", appearance]
        if let probe { app.launchArguments += ["-watchFooterProbe", probe] }
        app.launch()
        sleep(6)
        let tag = "\(fixture)-\(probe ?? "none")-\(appearance)"
        capture("\(tag)-0-rest")
        XCUIDevice.shared.rotateDigitalCrown(delta: 0.15)
        capture("\(tag)-1-crown-down")
        sleep(1)
        capture("\(tag)-2-crown-settled")
        XCUIDevice.shared.rotateDigitalCrown(delta: -0.3)
        sleep(1)
        capture("\(tag)-3-crown-back")
        app.swipeUp()
        capture("\(tag)-4-swipe-up")
        sleep(1)
        capture("\(tag)-5-swipe-settled")
        app.terminate()
    }

    func testPanelBottomEdge() {
        let only = ProcessInfo.processInfo.environment["B91_WATCH_PROBES"]
        if let only {
            for spec in only.split(separator: ",") {
                let parts = spec.split(separator: ":").map(String.init)
                run(parts[0], probe: parts[1] == "none" ? nil : parts[1], appearance: parts.count > 2 ? parts[2] : "mineralLight")
            }
            return
        }
        run("start", probe: nil)
        run("start", probe: "overflow")
        run("start", probe: "overflow-hidden")
        run("idle", probe: nil)
        run("orphan", probe: nil)
        run("start", probe: nil, appearance: "dark")
    }
}
