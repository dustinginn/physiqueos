import XCTest

@MainActor
final class TrainingAcceptanceUITests: XCTestCase {
    private let app = XCUIApplication()

    private func launchTraining() {
        continueAfterFailure = false
        app.launch()
        openTrainingLanding()
    }

    func testLibraryAreaAndExerciseHistoryJourney() throws {
        launchTraining()
        assertText("Latest Training Day")
        assertText("Training Areas")
        attachScreenshot("01-training-landing")

        tapText("Browse >")
        assertText("Browse by muscle group and jump straight to exercises.")
        attachScreenshot("02-training-library")

        tapText("Chest")
        assertText("Bench Press")
        attachScreenshot("03-training-area-chest")

        tapText("Bench Press")
        assertText("Current Benchmark")
        scrollToText("Performance Records")
        attachScreenshot("04-exercise-benchmark-performance-records")

        scrollToText("Last Session")
        scrollToText("Recent History")
        attachScreenshot("05-exercise-last-session-recent-history")
    }

    func testReportingJourneys() throws {
        launchTraining()
        openReportingDisclosure()
        tapText("Resistance Training")
        assertText("Resistance Summary")
        attachScreenshot("06-resistance-reporting")
        scrollToText("Category Rollups")
        assertText("Details")

        navigateBack()
        openReportingDisclosure()
        tapText("History")
        assertText("Training History")
        assertText("Wednesday, August 26")
        attachScreenshot("07-history-reporting")

        navigateBack()
        openReportingDisclosure()
        tapText("Cardio")
        assertText("Foundation")
        attachScreenshot("08-cardio-foundation-reporting")
    }

    func testRecentHistoryTrainingDayWorkoutAndCorrectionJourney() throws {
        launchTraining()
        scrollToText("Recent Training History")
        tapText("Show All >")
        assertText("Recent Training History")
        assertText("Wednesday, August 26")
        attachScreenshot("09-recent-training-history-show-all")

        tapText("Wednesday, August 26")
        assertText("TRAINING DAY")
        assertText("Aug 26, 2026")
        attachScreenshot("10-training-day")

        tapText("Traditional Strength Training")
        assertText("WORKOUT DETAIL")
        assertText("Session Details")
        attachScreenshot("11-workout-detail")

        scrollToText("Add / Correct Workout Details")
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 3), "Correction editor was not reachable.")
        editor.tap()
        editor.typeText("Cable row\n12 x 100 lb")
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 3), "The correction editor keyboard dismissal control was missing.")
        done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 2), "The correction editor keyboard did not dismiss.")
        let save = app.buttons["Save workout details"]
        XCTAssertTrue(save.waitForExistence(timeout: 3) && save.isHittable, "Save workout details was not actionable.")
        save.tap()
        XCTAssertFalse((editor.value as? String)?.contains("Cable row") == true, "The local correction was not accepted.")
        scrollToText("Saved to this device only — Native has no live correction endpoint yet. The original evidence above stays exactly as recorded.")
        attachScreenshot("12-add-correct-workout-details")
    }

    private func openTrainingLanding() {
        let evidenceTab = app.tabBars.buttons["Evidence"]
        XCTAssertTrue(evidenceTab.waitForExistence(timeout: 5), "Evidence tab was not available.")
        evidenceTab.tap()

        let trainingRow = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH[c] %@", "Training.")
        ).firstMatch
        XCTAssertTrue(trainingRow.waitForExistence(timeout: 5), "Training evidence row was not available.")
        trainingRow.tap()
        assertText("Latest Training Day")
    }

    private func openReportingDisclosure() {
        let resistance = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "Resistance Training")
        ).firstMatch
        if resistance.exists && resistance.isHittable { return }
        tapButton(identifier: "training-reporting-disclosure")
        XCTAssertTrue(resistance.waitForExistence(timeout: 3), "Reporting destinations did not expand.")
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

    private func tapButton(identifier: String) {
        let button = app.descendants(matching: .any)[identifier]
        for _ in 0..<12 where !button.exists || !button.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(button.exists && button.isHittable, "Could not scroll to button: \(identifier)")
        button.tap()
    }

    private func navigateBack() {
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Navigation back control was missing.")
        back.tap()
        assertText("Latest Training Day")
    }

    private func attachScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
