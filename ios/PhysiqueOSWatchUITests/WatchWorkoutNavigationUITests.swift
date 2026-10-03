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
        XCTAssertTrue(element(app, "watch.finishConfirmation").waitForExistence(timeout: 5))
        XCTAssertTrue(element(app, "watch.finishConfirmation.notYet").exists)
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
