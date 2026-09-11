import XCTest

@MainActor
final class TrainingAcceptanceUITests: XCTestCase {
    private let app = XCUIApplication()

    private func launchInSandbox() {
        continueAfterFailure = false
        // The app deliberately persists its selected Native authority.
        // Acceptance journeys verify the bundled Sandbox presentation, so
        // pin that authority in the process argument domain instead of
        // inheriting a prior Founder Production selection from Simulator.
        app.launchArguments += ["-physiqueos.native.authority-selection.v1", "sandbox"]
        app.launch()
    }

    private func launchTraining() {
        launchInSandbox()
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

        swipeBackToTrainingLanding()
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

    func testCorrectedEvidenceJourneys() throws {
        launchInSandbox()

        openEvidenceStream(named: "Weight")
        assertText("Weekly Averages")
        scrollToText("Weight History")
        attachScreenshot("13-weight-evidence")
        navigateBackToEvidenceHub()

        openEvidenceStream(named: "DEXA")
        assertText("DEXA")
        scrollToText("Since Prior Scan")
        attachScreenshot("14a-dexa-since-prior-scan")
        scrollToText("Core Trends")
        attachScreenshot("14-dexa-evidence")
        navigateBackToEvidenceHub()

        openEvidenceStream(named: "Photos")
        assertText("Progress Photos")
        let photoBriefing = app.buttons["Read Photo Briefing"]
        XCTAssertTrue(photoBriefing.waitForExistence(timeout: 5), "Photo briefing action was missing.")
        attachScreenshot("15-photo-evidence")

        let latestPhotoSet = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "photo set")
        ).firstMatch
        XCTAssertTrue(latestPhotoSet.waitForExistence(timeout: 5), "Latest photo set was not actionable.")
        latestPhotoSet.tap()
        assertText("PROGRESS PHOTO EVIDENCE")
        assertText("Front Relaxed")
        attachScreenshot("16-photo-evidence-detail-sheet")
        app.buttons["Close"].tap()
        navigateBackToEvidenceHub()

        openEvidenceStream(named: "Energy")
        assertText("Weekly History")
        assertText("Recent Daily Energy")
        app.scrollViews.firstMatch.swipeUp(velocity: .fast)
        app.scrollViews.firstMatch.swipeUp(velocity: .fast)
        attachScreenshot("17-energy-evidence")
    }

    func testBriefingParityJourneys() throws {
        launchInSandbox()

        let latestBriefing = app.buttons["home.latestBriefing"]
        XCTAssertTrue(latestBriefing.waitForExistence(timeout: 5), "The current Briefing was not available from Home.")
        latestBriefing.tap()
        openBriefingHistory()
        openBriefingFromHistory(containing: "Two weeks into the surplus, the gain is real")
        assertText("DEXA EVENT BRIEFING")
        assertText("Two weeks into the surplus, the gain is real — and mostly lean.")
        assertText("Current Scan")
        attachScreenshot("18-dexa-event-briefing")
        scrollToText("What Measurably Changed")
        attachScreenshot("18b-dexa-what-measurably-changed")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Monthly Briefing · August 2026")
        assertText("August established the starting line for building muscle.")
        attachScreenshot("19-monthly-opening")
        scrollToText("TRAINING PROGRESS")
        attachScreenshot("19b-monthly-training")
        scrollToText("ENERGY EVOLUTION")
        attachScreenshot("19c-monthly-energy-evolution")
        scrollToText("NEW BASELINE")
        attachScreenshot("19d-monthly-new-baseline")
        scrollToText("WHAT CHANGED")
        attachScreenshot("19d2-monthly-what-changed")
        scrollToText("DEFINING MOMENTS")
        attachScreenshot("19e-monthly-defining-moments")
        scrollToText("MONTH AHEAD")
        attachScreenshot("19f-monthly-month-ahead")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Midweek Briefing")
        assertText("Nothing here changes last week's plan.")
        attachScreenshot("20-midweek-briefing")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Two straight weeks of clean progression.")
        assertText("Two straight weeks of clean progression.")
        scrollToText("ENERGY BALANCE")
        attachScreenshot("21-weekly-energy")
        scrollToElement(identifier: "briefing.trainingResponse", maxSwipes: 30)
        attachScreenshot("21b-weekly-training")
        scrollToText("COACH'S TAKE")
        attachScreenshot("21c-coachs-take")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Four poses in, the visual story matches the scan.")
        assertText("PHOTO EVENT")
        assertText("Four poses in, the visual story matches the scan.")
        scrollToText("What Changed")
        attachScreenshot("22-photo-event-comparison")
    }

    func testFounderCorrectionMidweekTrainingResponseJourney() throws {
        launchInSandbox()

        let latestBriefing = app.buttons["home.latestBriefing"]
        XCTAssertTrue(latestBriefing.waitForExistence(timeout: 5), "Latest Briefing was not available from Home.")
        latestBriefing.tap()
        openBriefingHistory()
        openBriefingFromHistory(containing: "Midweek Briefing")
        assertText("Nothing here changes last week's plan.")
        scrollToElement(identifier: "briefing.trainingResponse", maxSwipes: 30)
        assertText("3,620 lb volume")
        attachScreenshot("20b-midweek-training")
    }

    func testFounderCorrectionHomeConfidenceAndLoggerShoulders() throws {
        launchInSandbox()

        assertText("CONFIDENCE")
        attachScreenshot("23-home-confidence")

        app.tabBars.buttons["Log"].tap()
        let logger = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Training Logger")).firstMatch
        XCTAssertTrue(logger.waitForExistence(timeout: 5), "Training Logger was not available from Log.")
        logger.tap()
        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        assertText("Choose exercises")
        assertButtonLabel(containing: "Shoulder Press Machine")
        assertButtonLabel(containing: "Face Pull")
        attachScreenshot("24-logger-shoulders-canonical-catalog")

        tapButton(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")
        tapButton(identifier: "trainingLogger.cancelWorkout")
        let alert = app.alerts["Cancel this workout?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 3), "Cancel Workout did not use a centered system alert.")
        XCTAssertTrue(alert.buttons["Cancel Workout"].exists, "The destructive confirmation action was missing.")
        XCTAssertTrue(alert.buttons["Keep Workout"].exists, "The safe dismissal action was missing.")
        attachScreenshot("25-logger-cancel-workout-alert")
        alert.buttons["Keep Workout"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["trainingLogger.workoutIdentity"].waitForExistence(timeout: 3),
            "Dismissing the alert did not preserve the in-progress workout."
        )
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

    private func openEvidenceStream(named name: String) {
        let evidenceTab = app.tabBars.buttons["Evidence"]
        XCTAssertTrue(evidenceTab.waitForExistence(timeout: 5), "Evidence tab was not available.")
        evidenceTab.tap()

        let row = app.buttons.matching(
            NSPredicate(format: "label BEGINSWITH[c] %@", "\(name).")
        ).firstMatch
        for _ in 0..<12 where !row.exists || !row.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(row.exists && row.isHittable, "\(name) evidence row was not available.")
        row.tap()
    }

    private func navigateBackToEvidenceHub() {
        let back = app.navigationBars.buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Evidence navigation back control was missing.")
        back.tap()
        assertText("All Evidence")
    }

    private func openBriefingHistory() {
        let history = app.buttons["Briefing History"]
        XCTAssertTrue(history.waitForExistence(timeout: 5), "Briefing History action was missing.")
        history.tap()
        assertText("Briefing History")
    }

    private func openBriefingFromHistory(containing text: String) {
        let row = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@", text)
        ).firstMatch
        for _ in 0..<16 where !row.exists || !row.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(row.exists && row.isHittable, "Briefing history row was not available: \(text)")
        row.tap()
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

    @discardableResult
    private func scrollToElement(identifier: String, maxSwipes: Int = 12) -> XCUIElement {
        let element = app.descendants(matching: .any)[identifier]
        for _ in 0..<maxSwipes where !element.exists || !element.isHittable {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.82))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.20))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0.02)
        }
        XCTAssertTrue(element.exists && element.isHittable, "Could not scroll to visible element: \(identifier)")
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

    private func swipeBackToTrainingLanding() {
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5))
        let destination = app.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5))
        edge.press(forDuration: 0.12, thenDragTo: destination, withVelocity: .slow, thenHoldForDuration: 0.12)
        assertText("Latest Training Day")
    }

    @discardableResult
    private func assertButtonLabel(containing text: String, timeout: TimeInterval = 5) -> XCUIElement {
        let element = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] %@", text)
        ).firstMatch
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Missing actionable label: \(text)")
        return element
    }

    private func attachScreenshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
