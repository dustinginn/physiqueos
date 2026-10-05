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

    /// Graduated capabilities no longer expose diagnostic or manual-trigger
    /// UI on the Founder Production page; only session controls (and, while
    /// connected, the temporary Sleep canary) remain.
    func testFounderProductionPageCarriesNoObsoleteDiagnostics() throws {
        launchInSandbox()
        app.buttons["You"].tap()
        tapText("Founder device connection")
        app.segmentedControls.buttons["Founder Production"].tap()
        assertText("Founder Production connection")
        XCTAssertFalse(app.buttons["founder.notifications.diagnostics"].exists)
        XCTAssertFalse(app.buttons["founder.workoutReconciliation.diagnostics"].exists)
        XCTAssertFalse(app.staticTexts["HEALTHKIT FOUNDER CANARY"].exists)
    }

    func testDatePickerTodayIsReachableWithoutSavingEvidence() throws {
        launchInSandbox()
        app.buttons["Log"].tap()
        tapText("Log weight for another date")
        assertText("Log Weight")
        let dateField = app.buttons["Date measured"]
        XCTAssertTrue(dateField.waitForExistence(timeout: 5))
        dateField.tap()
        let today = app.buttons["datePicker.today"]
        XCTAssertTrue(today.waitForExistence(timeout: 5))
        XCTAssertTrue(today.isEnabled)
        today.tap()
        app.buttons["Done"].tap()
        XCTAssertTrue(dateField.waitForExistence(timeout: 5))
        // Picker navigation only: never submit even sandbox evidence here.
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

        let august26 = app.staticTexts["Wednesday, August 26"].firstMatch
        XCTAssertTrue(august26.waitForExistence(timeout: 3) && august26.isHittable, "Training history date was not actionable.")
        august26.tap()
        assertText("TRAINING DAY")
        assertText("Aug 26, 2026")
        attachScreenshot("10-training-day")

        tapText("Traditional Strength Training")
        assertText("WORKOUT DETAIL")
        assertText("Workout Summary")
        assertText("420 active cal")
        // Structured workouts show the unified exercise/set breakdown,
        // not a second generated serialization under Session Details.
        assertText("Exercises")
        assertText("Bench Press")
        XCTAssertFalse(app.staticTexts["Session Details"].exists, "The generated workout summary duplicated the structured breakdown.")
        XCTAssertEqual(app.staticTexts.matching(identifier: "Bench Press").count, 1, "The exercise was rendered more than once.")
        XCTAssertEqual(app.staticTexts.matching(identifier: "420 active cal").count, 1, "Workout calories were duplicated in the header or generated summary.")
        attachScreenshot("11-workout-detail")

        scrollToText("Add / Correct Workout Details")
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 3), "Correction editor was not reachable.")
        editor.tap()
        if !app.keyboards.firstMatch.waitForExistence(timeout: 1) { editor.tap() }
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 2), "The correction editor did not receive keyboard focus.")
        editor.typeText("Cable row\n12 x 100 lb")
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 3), "The correction editor keyboard dismissal control was missing.")
        done.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 2), "The correction editor keyboard did not dismiss.")
        let save = app.buttons["Save workout details"]
        XCTAssertTrue(save.waitForExistence(timeout: 3) && save.isHittable, "Save workout details was not actionable.")
        save.tap()
        XCTAssertFalse((editor.value as? String)?.contains("Cable row") == true, "The local correction was not accepted.")
        scrollToText("Saved to this device only. Your original workout is unchanged.")
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
        attachScreenshot("18a-briefing-history-identities-and-colors")
        openBriefingFromHistory(containing: "Two weeks into the surplus, the gain is real")
        assertText("DEXA EVENT BRIEFING")
        assertText("Two weeks into the surplus, the gain is real — and mostly lean.")
        assertText("Current Scan")
        attachScreenshot("18-dexa-event-briefing")
        scrollToLabel(containing: "What Measurably Changed")
        attachScreenshot("18b-dexa-what-measurably-changed")
        scrollToLabel(containing: "Regional Fat Change", maxSwipes: 20)
        attachScreenshot("18c-dexa-regional-fat")
        scrollToLabel(containing: "Measured Lean Tissue Change", maxSwipes: 20)
        attachScreenshot("18d-dexa-regional-lean")
        scrollToLabel(containing: "Since Starting the Lean Mass Phase", maxSwipes: 20)
        attachScreenshot("18e-dexa-body-composition-timeline")
        scrollToLabel(containing: "What This Scan Means", maxSwipes: 20)
        attachScreenshot("18f-dexa-meaning")
        scrollToLabel(containing: "Coach's Insight", maxSwipes: 20)
        attachScreenshot("18g-dexa-coach-insight")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Monthly Briefing · August 2026")
        assertText("August established the starting line for building muscle.")
        attachScreenshot("19-monthly-opening")
        scrollToLabel(containing: "Training Progress")
        attachScreenshot("19b-monthly-training")
        scrollToLabel(containing: "Energy Evolution")
        attachScreenshot("19c-monthly-energy-evolution")
        scrollToLabel(containing: "Future scans can now be compared", maxSwipes: 40)
        attachScreenshot("19d-monthly-new-baseline")
        scrollToLabel(containing: "What Changed")
        attachScreenshot("19d2-monthly-what-changed")
        scrollToLabel(containing: "Defining Moments")
        attachScreenshot("19e-monthly-defining-moments")
        scrollToLabel(containing: "Month Ahead")
        attachScreenshot("19f-monthly-month-ahead")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Midweek Briefing")
        assertText("Nothing here changes last week's plan.")
        attachScreenshot("20-midweek-briefing")
        scrollToLabel(containing: "Energy Balance")
        attachScreenshot("20a-midweek-energy")
        scrollToLabel(containing: "Weight Context")
        attachScreenshot("20a2-midweek-weight")
        scrollToLabel(containing: "7,500 lb", maxSwipes: 30)
        attachScreenshot("20b-midweek-training")
        scrollToLabel(containing: "Body Composition")
        attachScreenshot("20c-midweek-body-composition")
        scrollToLabel(containing: "Coach's Take")
        attachScreenshot("20d-midweek-coachs-take")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Two straight weeks of clean progression.")
        assertText("Two straight weeks of clean progression.")
        scrollToLabel(containing: "Energy Balance")
        attachScreenshot("21-weekly-energy")
        scrollToLabel(containing: "3,340 lb volume", maxSwipes: 30)
        attachScreenshot("21b-weekly-training")
        scrollToLabel(containing: "Coach's Take")
        attachScreenshot("21c-coachs-take")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Four poses in, the visual story matches the scan.")
        assertText("PHOTO EVENT")
        assertText("Four poses in, the visual story matches the scan.")
        scrollToLabel(containing: "Matching historical views show what changed")
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
        scrollToLabel(containing: "7,500 lb", maxSwipes: 30)
        assertText("7,500 lb")
        scrollToLabel(containing: "Machine lateral raises have been stable")
        attachScreenshot("20b-midweek-training")
    }

    func testFounderCorrectionWeeklyAndPhotoBriefingJourney() throws {
        launchInSandbox()

        let latestBriefing = app.buttons["home.latestBriefing"]
        XCTAssertTrue(latestBriefing.waitForExistence(timeout: 5), "Latest Briefing was not available from Home.")
        latestBriefing.tap()
        openBriefingHistory()
        openBriefingFromHistory(containing: "Two straight weeks of clean progression.")
        scrollToLabel(containing: "Energy Balance")
        scrollToLabel(containing: "3,340 lb volume", maxSwipes: 30)
        assertText("3,340 lb volume")
        openBriefingHistory()

        openBriefingFromHistory(containing: "Four poses in, the visual story matches the scan.")
        scrollToLabel(containing: "Matching historical views show what changed")
        attachScreenshot("22-photo-event-comparison")
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

        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
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

        // The kept workout is the active session and would route every later
        // journey's Log tap straight into the Logger. Leave it saved, as the
        // other Logger journeys do.
        tapButton(identifier: "trainingLogger.inlineSaveAndLeave")
        XCTAssertTrue(app.tabBars.buttons["Log"].waitForExistence(timeout: 3), "Save & Leave did not return to Log.")
    }

    /// Build 21 item 2 acceptance: Save & Leave must persist the complete
    /// in-progress draft, and reopening Workout Logger — a fresh push of
    /// the same view, exactly like the Founder backgrounding and
    /// reopening the app — must offer to resume that exact draft rather
    /// than silently losing it or starting over.
    func testSaveAndLeavePersistsAndReopeningWorkoutLoggerRestoresTheDraft() throws {
        launchInSandbox()

        openWorkoutLoggerFromLog()
        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")

        let markComplete = app.buttons["Mark set complete"].firstMatch
        XCTAssertTrue(markComplete.waitForExistence(timeout: 3), "Set-completion control was not reachable.")
        markComplete.tap()
        XCTAssertTrue(app.buttons["Mark set incomplete"].firstMatch.waitForExistence(timeout: 3), "Marking a set complete did not update its control.")
        attachScreenshot("26-workout-in-progress-before-save-and-leave")

        tapButton(identifier: "trainingLogger.inlineSaveAndLeave")
        XCTAssertTrue(app.tabBars.buttons["Log"].waitForExistence(timeout: 3), "Save & Leave did not return to Log.")

        // Reopen Workout Logger as an entirely fresh push — this is the
        // real regression: the Founder's Build 20 report was specifically
        // that the draft did NOT restore after Save & Leave and reopen.
        openWorkoutLoggerFromLog()
        assertText("SAVED WORKOUTS")
        let resume = app.buttons["Resume"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 3), "Resume workout control was not offered after reopening.")
        attachScreenshot("27-saved-workout-offered-after-reopen")

        resume.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["trainingLogger.workoutIdentity"].waitForExistence(timeout: 3),
            "Resuming did not return to the in-progress workout."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["trainingLogger.exerciseCard.Shoulder Press Machine"].waitForExistence(timeout: 3),
            "The exact exercise added before Save & Leave was not restored."
        )
        XCTAssertTrue(app.buttons["Mark set incomplete"].firstMatch.waitForExistence(timeout: 3), "The completed-set state was not restored exactly.")
        attachScreenshot("28-resumed-workout-matches-saved-draft")

        // Resume is durable now, so the resumed workout is the active session
        // and would route the next test's Log tap straight into the Logger.
        // Leave it saved, as the journey began.
        tapButton(identifier: "trainingLogger.inlineSaveAndLeave")
    }

    /// Live Activities Phase 1: the Logger exposes the rest preference
    /// (Stopwatch by default; Countdown and Off selectable).
    func testRestPreferenceMenuDefaultsToStopwatchAndSwitchesMode() throws {
        launchInSandbox()
        openWorkoutLoggerFromLog()
        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")

        let menu = app.buttons["trainingLogger.restPreference"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5), "Rest preference control was not reachable.")
        XCTAssertTrue(menu.label.contains("Stopwatch"), "Stopwatch is the default rest mode (was \(menu.label)).")
        attachScreenshot("40-rest-preference-stopwatch-default")

        menu.tap()
        let off = app.buttons["Off"].firstMatch
        XCTAssertTrue(off.waitForExistence(timeout: 3), "Off was not offered.")
        off.tap()
        XCTAssertTrue(app.buttons["trainingLogger.restPreference"].label.contains("Off"))

        app.buttons["trainingLogger.restPreference"].tap()
        let countdown = app.buttons["Countdown"].firstMatch
        XCTAssertTrue(countdown.waitForExistence(timeout: 3), "Countdown was not offered.")
        countdown.tap()
        XCTAssertTrue(app.buttons["trainingLogger.restPreference"].label.contains("Countdown"))
        attachScreenshot("41-rest-preference-countdown")

        // Restore the default and leave the workout saved, like the other journeys.
        app.buttons["trainingLogger.restPreference"].tap()
        app.buttons["Stopwatch"].firstMatch.tap()
        tapButton(identifier: "trainingLogger.inlineSaveAndLeave")
    }

    /// Live Activities Phase 1: starting a workout and completing a set keeps
    /// the app healthy while it is backgrounded (the Live Activity itself is
    /// system UI; screenshots of it are captured out-of-band by the release
    /// acceptance procedure, and the physical-device checklist covers the rest).
    /// Holds on the Home Screen for `WORKOUT_LA_HOLD_SECONDS` (default 3).
    func testWorkoutStartedAndSetCompletedThenBackgroundedDoesNotDisturbTheApp() throws {
        launchInSandbox()
        openWorkoutLoggerFromLog()
        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")
        fillFirstSet(reps: "10", load: "100")
        let markComplete = app.buttons["Mark set complete"].firstMatch
        XCTAssertTrue(markComplete.waitForExistence(timeout: 3))
        markComplete.tap()
        XCTAssertTrue(app.buttons["Mark set incomplete"].firstMatch.waitForExistence(timeout: 3))

        XCUIDevice.shared.press(.home)
        let hold = Double(ProcessInfo.processInfo.environment["WORKOUT_LA_HOLD_SECONDS"] ?? "") ?? 3
        Thread.sleep(forTimeInterval: hold)
        app.activate()
        XCTAssertTrue(app.buttons["Mark set incomplete"].firstMatch.waitForExistence(timeout: 5), "The workout was lost across backgrounding.")
        tapButton(identifier: "trainingLogger.inlineSaveAndLeave")
    }

    /// Build 21 item 1 acceptance: the screenshot-attachment card Workout
    /// Review promises ("Check every completed set and add optional Apple
    /// Health screenshots") must actually be reachable, and a workout with
    /// no attachment must still say so honestly on the confirmation
    /// screen — never silently omitting the line Build 20 always showed
    /// in Sandbox.
    func testWorkoutReviewScreenshotCardIsReachableThroughConfirmation() throws {
        launchInSandbox()

        openWorkoutLoggerFromLog()
        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")
        fillFirstSet(reps: "10", load: "45")
        app.buttons["Mark set complete"].firstMatch.tap()

        tapButton(identifier: "trainingLogger.finishWorkout")
        assertText("Review your workout")
        assertText("Supporting workout screenshots")
        XCTAssertTrue(app.buttons["Photos"].firstMatch.waitForExistence(timeout: 3), "The screenshot attachment picker was not reachable from Workout Review.")
        XCTAssertTrue(app.buttons["Files"].firstMatch.waitForExistence(timeout: 3), "The file attachment picker was not reachable from Workout Review.")
        attachScreenshot("29-workout-review-screenshot-card")

        tapButton(identifier: "trainingLogger.finishReview")
        assertText("Finish this workout?")
        assertText("No supporting screenshots attached")
        attachScreenshot("30-confirmation-honest-no-attachment")

        tapButton(identifier: "trainingLogger.completeLocal")
        assertText("Workout logged")
        // Build 78: Workout Complete is owed until Return to Log, so leave
        // it explicitly (later journeys start from an ordinary Log tab).
        tapText("Return to Log")
    }

    /// Build 78 (Performance Record lifecycle): a finished workout's Workout
    /// Complete survives a tab switch -- entering Log again routes back to
    /// it -- and Return to Log is the only acknowledgement, after which Log
    /// behaves normally again.
    func testWorkoutCompleteSurvivesATabSwitchUntilReturnToLog() throws {
        launchInSandbox()
        openWorkoutLoggerFromLog()
        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")
        fillFirstSet(reps: "8", load: "50")
        app.buttons["Mark set complete"].firstMatch.tap()
        tapButton(identifier: "trainingLogger.finishWorkout")
        tapButton(identifier: "trainingLogger.finishReview")
        tapButton(identifier: "trainingLogger.completeLocal")
        assertText("Workout logged")
        attachScreenshot("50-workout-complete")

        // Leave without acknowledging (system Back), as if the Founder moved
        // on before the records arrived; Log is at its root again.
        let back = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(back.waitForExistence(timeout: 3), "Workout Complete had no Back control.")
        back.tap()
        let loggerEntry = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Training Logger")).firstMatch
        XCTAssertTrue(loggerEntry.waitForExistence(timeout: 5))
        app.tabBars.buttons["Home"].tap()
        app.tabBars.buttons["Log"].tap()
        assertText("Workout logged")
        attachScreenshot("51-workout-complete-routed-after-tab-switch")

        tapText("Return to Log")
        let logger = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Training Logger")).firstMatch
        XCTAssertTrue(logger.waitForExistence(timeout: 5), "Return to Log did not return to the ordinary Log page.")
        app.tabBars.buttons["Home"].tap()
        app.tabBars.buttons["Log"].tap()
        XCTAssertTrue(logger.waitForExistence(timeout: 5), "An acknowledged completion must not route Log again.")
        XCTAssertFalse(app.staticTexts["Workout logged"].exists)
    }

    /// Home Screen widget: Start Logger / Resume Workout links are
    /// navigation only. Start opens the Logger without creating a workout;
    /// a live workout is reopened (never duplicated); a stale Resume link
    /// falls back safely to the Logger.
    func testHomeWidgetStartAndResumeLinksOpenTheLoggerWithoutCreatingAWorkout() throws {
        launchInSandbox()
        let start = URL(string: "physiqueos-workout://widget?route=start&authority=sandbox")!
        let staleResume = URL(string: "physiqueos-workout://widget?route=resume&session=missing-session&authority=sandbox")!

        app.open(start)
        XCTAssertTrue(
            app.descendants(matching: .any)["trainingLogger.start"].waitForExistence(timeout: 5),
            "The widget Start link did not open the Logger landing."
        )
        XCTAssertFalse(app.descendants(matching: .any)["trainingLogger.workoutIdentity"].exists, "Start must not create a workout.")
        attachScreenshot("60-widget-start-opens-logger")

        app.tabBars.buttons["Home"].tap()
        app.open(staleResume)
        XCTAssertTrue(
            app.descendants(matching: .any)["trainingLogger.start"].waitForExistence(timeout: 5),
            "A stale Resume link did not fall back to the Logger landing."
        )

        tapButton(identifier: "trainingLogger.start")
        tapButton(identifier: "trainingLogger.area.shoulders")
        tapText("Choose exercises")
        selectExercise(identifier: "trainingLogger.exercise.shoulder_press_machine")
        tapButton(identifier: "trainingLogger.startLogging")
        XCTAssertTrue(app.descendants(matching: .any)["trainingLogger.workoutIdentity"].waitForExistence(timeout: 3))

        app.tabBars.buttons["Home"].tap()
        app.open(start)
        XCTAssertTrue(
            app.descendants(matching: .any)["trainingLogger.exerciseCard.Shoulder Press Machine"].waitForExistence(timeout: 5),
            "With a live workout the widget link must reopen it, not start another."
        )
        attachScreenshot("61-widget-link-reopens-live-workout")

        // Leave the workout saved so later journeys start from the Log root.
        tapButton(identifier: "trainingLogger.inlineSaveAndLeave")
    }

    private func fillFirstSet(reps: String, load: String) {
        let repsField = app.textFields["Set 1 reps"]
        XCTAssertTrue(repsField.waitForExistence(timeout: 3), "Set 1 reps field was not reachable.")
        repsField.tap()
        repsField.typeText(reps)
        let loadField = app.textFields["Set 1 optional external load"]
        XCTAssertTrue(loadField.waitForExistence(timeout: 3), "Set 1 load field was not reachable.")
        loadField.tap()
        loadField.typeText(load)
        if app.keyboards.firstMatch.exists { app.buttons["Done"].firstMatch.tap() }
    }

    private func openWorkoutLoggerFromLog() {
        app.tabBars.buttons["Log"].tap()
        let logger = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Training Logger")).firstMatch
        XCTAssertTrue(logger.waitForExistence(timeout: 5), "Training Logger was not available from Log.")
        logger.tap()
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
        for _ in 0..<40 where !history.exists || !history.isHittable {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.965, dy: 0.22))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.965, dy: 0.78))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0.02)
        }
        XCTAssertTrue(history.waitForExistence(timeout: 5), "Briefing History action was missing.")
        XCTAssertTrue(history.isHittable, "Briefing History action could not be brought on screen.")
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
    private func scrollToLabel(containing text: String, maxSwipes: Int = 40) -> XCUIElement {
        let element = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS[c] %@", text)
        ).firstMatch
        for _ in 0..<maxSwipes where !element.exists || !element.isHittable {
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.965, dy: 0.78))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.965, dy: 0.22))
            start.press(forDuration: 0.05, thenDragTo: end, withVelocity: .fast, thenHoldForDuration: 0.02)
        }
        XCTAssertTrue(element.exists && element.isHittable, "Could not scroll to visible label containing: \(text)")
        return element
    }

    @discardableResult
    private func scrollToElement(identifier: String, maxSwipes: Int = 12) -> XCUIElement {
        let element = app.descendants(matching: .any)[identifier]
        for _ in 0..<maxSwipes where !element.exists || !element.isHittable {
            app.swipeUp(velocity: .fast)
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

    private func selectExercise(identifier: String) {
        var button = app.buttons.matching(identifier: identifier).firstMatch
        let persistentAction = app.buttons["trainingLogger.startLogging"]
        for _ in 0..<12 where
            !button.exists
            || !button.isHittable
            || (persistentAction.exists && button.frame.maxY >= persistentAction.frame.minY)
        {
            app.swipeUp()
            button = app.buttons.matching(identifier: identifier).firstMatch
        }
        XCTAssertTrue(button.exists && button.isHittable, "Could not scroll to exercise: \(identifier)")
        XCTAssertTrue(
            !persistentAction.exists || button.frame.maxY < persistentAction.frame.minY,
            "Exercise remained obscured by the persistent action: \(identifier)"
        )
        button.tap()
        XCTAssertTrue(button.isSelected, "Exercise selection did not persist: \(identifier)")
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

    private func attachScreenshot(_: String) {}
}

/// Batch 2 locked-design parity captures. Drives the real sandbox Logger
/// (no state seams) and writes full-screen PNGs only when
/// `LOGGER_PARITY_DIR` is set; otherwise the journeys still run as
/// interaction regression coverage for the redesigned surfaces.
@MainActor
final class LoggerParityCaptureUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testCheckpoint2ActiveWorkoutDark() { checkpoint2(appearance: "dark") }
    func testCheckpoint2ActiveWorkoutMineralLight() { checkpoint2(appearance: "light") }

    private func checkpoint2(appearance: String) {
        launch(appearance: appearance, route: "training-logger")
        startWorkout(areas: ["chest", "core"], exercises: ["Bench Press", "Cable Fly", "Push-ups", "Planks"])

        // Pre-first-set state: Ready for Watch offered, Finish disabled.
        XCTAssertTrue(app.buttons["trainingLogger.readyForWatch"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["trainingLogger.finishWorkout"].isEnabled)
        capture("cp2-ready-\(appearance)")
        app.buttons["trainingLogger.readyForWatch"].tap()
        XCTAssertTrue(app.buttons["Ready on Watch"].waitForExistence(timeout: 3))
        capture("cp2-ready-on-\(appearance)")
        app.buttons["trainingLogger.readyForWatch"].tap()

        // Complete two sets: Done states, progress, success tint; Ready hides.
        let complete = app.buttons["Mark set complete"].firstMatch
        XCTAssertTrue(complete.waitForExistence(timeout: 3))
        complete.tap()
        app.buttons["Mark set complete"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Mark set incomplete"].firstMatch.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["trainingLogger.readyForWatch"].exists)
        XCTAssertTrue(app.buttons["trainingLogger.finishWorkout"].isEnabled)
        XCTAssertGreaterThanOrEqual(app.buttons["Mark set incomplete"].firstMatch.frame.width, 43.9)
        XCTAssertGreaterThanOrEqual(app.buttons["Mark set incomplete"].firstMatch.frame.height, 43.9)
        capture("cp2-active-\(appearance)")

        // Bodyweight and timed rows further down the same workout.
        app.swipeUp()
        app.swipeUp()
        capture("cp2-set-types-\(appearance)")
        app.swipeDown()
        app.swipeDown()

        // Numeric focus with the system decimal keyboard (Finish hides).
        let load = app.textFields["Set 1 optional external load"].firstMatch
        XCTAssertTrue(load.waitForExistence(timeout: 3))
        load.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["trainingLogger.finishWorkout"].exists)
        capture("cp2-keyboard-\(appearance)")
        app.buttons["Done"].firstMatch.tap()

        // Exercise relationship menu, then a superset pair.
        let actions = app.buttons["trainingLogger.exerciseActions.Bench Press"]
        XCTAssertTrue(actions.waitForExistence(timeout: 3))
        actions.tap()
        XCTAssertTrue(app.buttons["Superset"].waitForExistence(timeout: 3))
        capture("cp2-menu-\(appearance)")
        app.buttons["Superset"].tap()
        let pair = app.buttons["Pair with Cable Fly"]
        XCTAssertTrue(pair.waitForExistence(timeout: 3))
        pair.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "SUPERSET A")).firstMatch.waitForExistence(timeout: 3))
        capture("cp2-superset-\(appearance)")

        // Cancel safety: confirmation first, then the explicit discard.
        app.buttons["trainingLogger.cancelWorkout"].tap()
        XCTAssertTrue(app.alerts["Cancel this workout?"].waitForExistence(timeout: 3))
        capture("cp2-cancel-\(appearance)")
        app.alerts["Cancel this workout?"].buttons["Cancel Workout"].tap()
    }

    func testCheckpoint3EntrySelectionDark() { checkpoint3(appearance: "dark") }
    func testCheckpoint3EntrySelectionMineralLight() { checkpoint3(appearance: "light") }

    private func checkpoint3(appearance: String) {
        // One deterministic saved draft for the entry state.
        launch(appearance: appearance, route: "training-logger", extra: ["-physiqueos.logger-review.candidate"])
        discardSavedDrafts()
        startWorkout(areas: ["chest"], exercises: ["Bench Press"])
        app.buttons["trainingLogger.inlineSaveAndLeave"].tap()

        launch(appearance: appearance, route: "training-logger", extra: ["-physiqueos.logger-review.candidate"])
        XCTAssertTrue(app.buttons["trainingLogger.start"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Resume"].firstMatch.waitForExistence(timeout: 5))
        capture("cp3-entry-\(appearance)")

        app.buttons["trainingLogger.start"].tap()
        for area in ["chest", "back"] {
            let button = app.buttons["trainingLogger.area.\(area)"]
            XCTAssertTrue(button.waitForExistence(timeout: 5))
            button.tap()
        }
        capture("cp3-areas-\(appearance)")

        app.buttons["Choose exercises"].tap()
        for name in ["Bench Press", "Cable Fly"] {
            let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(name),")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 5))
            row.tap()
        }
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@", "Bench Press, selected")).firstMatch.exists)
        capture("cp3-picker-\(appearance)")

        let search = app.textFields["trainingLogger.exerciseSearch"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        search.tap()
        search.typeText("cable")
        capture("cp3-search-\(appearance)")
        if let typed = search.value as? String {
            search.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: typed.count))
        }
        search.typeText("\n")

        app.buttons["trainingLogger.browseAll"].tap()
        XCTAssertTrue(app.staticTexts["All Exercises · the full exercise catalog"].waitForExistence(timeout: 3))
        capture("cp3-browse-all-\(appearance)")
        app.buttons["trainingLogger.browseAll"].tap()

        let create = app.buttons["trainingLogger.createNewExercise"]
        for _ in 0..<6 where !create.isHittable { app.swipeUp() }
        create.tap()
        XCTAssertTrue(app.buttons["trainingLogger.submitNewExercise"].waitForExistence(timeout: 3))
        for _ in 0..<3 { app.swipeUp() }
        capture("cp3-create-\(appearance)")
        for _ in 0..<8 { app.swipeDown() }
        create.tap()

        app.buttons["trainingLogger.startLogging"].tap()
        let addExercise = app.buttons["trainingLogger.addExercise"]
        XCTAssertTrue(addExercise.waitForExistence(timeout: 5))
        addExercise.tap()
        XCTAssertTrue(app.staticTexts["Add exercises"].waitForExistence(timeout: 3))
        for _ in 0..<6 { app.swipeDown() }
        capture("cp3-add-exercise-\(appearance)")
        app.buttons["trainingLogger.startLogging"].tap()

        app.buttons["trainingLogger.cancelWorkout"].tap()
        XCTAssertTrue(app.alerts["Cancel this workout?"].waitForExistence(timeout: 3))
        app.alerts["Cancel this workout?"].buttons["Cancel Workout"].tap()
        discardSavedDrafts()
    }

    func testCheckpoint4ReviewFinishCompleteDark() { checkpoint4(appearance: "dark") }
    func testCheckpoint4ReviewFinishCompleteMineralLight() { checkpoint4(appearance: "light") }

    private func checkpoint4(appearance: String) {
        // Review -> Final Confirmation -> Complete with Server-shaped records.
        launch(appearance: appearance, route: "training-logger", extra: ["-physiqueos.logger-review.records"])
        discardSavedDrafts()
        startWorkout(areas: ["chest"], exercises: ["Bench Press", "Cable Fly"])
        completeTwoSetsAndOpenReview()
        capture("cp4-review-\(appearance)")
        app.buttons["trainingLogger.finishReview"].tap()
        XCTAssertTrue(app.staticTexts["Finish this workout?"].waitForExistence(timeout: 3))
        capture("cp4-confirm-\(appearance)")
        app.buttons["trainingLogger.completeLocal"].tap()
        XCTAssertTrue(app.staticTexts["Workout logged"].waitForExistence(timeout: 5))
        capture("cp4-complete-records-\(appearance)")
        app.buttons["Return to Log"].tap()

        // Complete without records (L14).
        launch(appearance: appearance, route: "training-logger")
        discardSavedDrafts()
        startWorkout(areas: ["chest"], exercises: ["Bench Press"])
        completeTwoSetsAndOpenReview()
        app.buttons["trainingLogger.finishReview"].tap()
        app.buttons["trainingLogger.completeLocal"].tap()
        XCTAssertTrue(app.staticTexts["Workout logged"].waitForExistence(timeout: 5))
        capture("cp4-complete-\(appearance)")
        app.buttons["Return to Log"].tap()

        // Durability states the sandbox cannot reach (DEBUG presentation seam).
        for state in ["saving", "waiting", "retry"] {
            launch(appearance: appearance, route: "training-logger", extra: ["-physiqueos.logger-review.finish", state])
            discardSavedDrafts()
            startWorkout(areas: ["chest"], exercises: ["Bench Press"])
            completeTwoSetsAndOpenReview()
            app.buttons["trainingLogger.finishReview"].tap()
            XCTAssertTrue(app.staticTexts["Finish this workout?"].waitForExistence(timeout: 3))
            capture("cp4-\(state)-\(appearance)")
            // Leave without finishing; the saved draft is discarded next launch.
            let saveAndLeave = app.buttons["trainingLogger.saveAndLeave"]
            if saveAndLeave.waitForExistence(timeout: 2) { saveAndLeave.tap() }
        }
        launch(appearance: appearance, route: "training-logger")
        discardSavedDrafts()
    }

    private func completeTwoSetsAndOpenReview() {
        let complete = app.buttons["Mark set complete"].firstMatch
        XCTAssertTrue(complete.waitForExistence(timeout: 3))
        complete.tap()
        app.buttons["Mark set complete"].firstMatch.tap()
        app.buttons["trainingLogger.finishWorkout"].tap()
        XCTAssertTrue(app.staticTexts["Review your workout"].waitForExistence(timeout: 3))
    }

    func testCheckpoint5WorkoutMatchDark() { checkpoint5(appearance: "dark") }
    func testCheckpoint5WorkoutMatchMineralLight() { checkpoint5(appearance: "light") }

    private func checkpoint5(appearance: String) {
        for outcome in ["confirm", "no-match"] {
            launch(appearance: appearance, route: "log",
                   extra: ["-physiqueos.redesign-review", "-physiqueos.log-review.state", "workout-match"])
            let entry = app.buttons["log.review.review-workout-match-fixture"]
            XCTAssertTrue(entry.waitForExistence(timeout: 8))
            if outcome == "confirm" { capture("cp5-log-entry-\(appearance)") }
            entry.tap()
            let confirm = app.buttons["evidenceReview.workoutReconciliation.confirm.1"]
            XCTAssertTrue(confirm.waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["evidenceReview.workoutReconciliation.confirm.2"].exists)
            XCTAssertTrue(app.buttons["evidenceReview.workoutReconciliation.noMatch"].exists)
            if outcome == "confirm" {
                capture("cp5-match-\(appearance)")
                confirm.tap()
                XCTAssertTrue(app.staticTexts["Match confirmed"].waitForExistence(timeout: 5))
                capture("cp5-confirmed-\(appearance)")
            } else {
                app.buttons["evidenceReview.workoutReconciliation.noMatch"].tap()
                XCTAssertTrue(app.staticTexts["No match recorded"].waitForExistence(timeout: 5))
                capture("cp5-no-match-\(appearance)")
            }
            XCTAssertTrue(app.buttons["evidenceReview.backToLog"].exists)
        }
    }

    private func discardSavedDrafts() {
        let start = app.buttons["trainingLogger.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        let discard = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "trainingLogger.discard.")).firstMatch
        for _ in 0..<12 where discard.exists {
            discard.tap()
        }
    }

    // MARK: Journey helpers

    private func launch(appearance: String, route: String, extra: [String] = []) {
        app.terminate()
        app.launchArguments = [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.appearance.preference.v1", appearance,
            "-physiqueos.appearance-review.route", route,
        ] + extra
        app.launch()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 10))
    }

    private func startWorkout(areas: [String], exercises: [String]) {
        let start = app.buttons["trainingLogger.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        start.tap()
        for area in areas {
            let button = app.buttons["trainingLogger.area.\(area)"]
            XCTAssertTrue(button.waitForExistence(timeout: 5))
            button.tap()
        }
        let choose = app.buttons["Choose exercises"]
        XCTAssertTrue(choose.waitForExistence(timeout: 5))
        choose.tap()
        for name in exercises {
            var row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(name),")).firstMatch
            for _ in 0..<6 where !(row.exists && row.isHittable) { app.swipeUp() }
            if !row.exists {
                // Not in My Library: use the full catalog, as a person would.
                for _ in 0..<8 { app.swipeDown() }
                let browse = app.buttons["trainingLogger.browseAll"]
                if browse.waitForExistence(timeout: 2) { browse.tap() }
                row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(name),")).firstMatch
                for _ in 0..<10 where !(row.exists && row.isHittable) { app.swipeUp() }
            }
            XCTAssertTrue(row.exists, "Exercise \(name) not found")
            row.tap()
        }
        let startLogging = app.buttons["trainingLogger.startLogging"]
        XCTAssertTrue(startLogging.waitForExistence(timeout: 5))
        startLogging.tap()
        XCTAssertTrue(app.descendants(matching: .any)["trainingLogger.workoutIdentity"].waitForExistence(timeout: 5))
    }

    private func capture(_ name: String) {
        Thread.sleep(forTimeInterval: 0.9)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let directory = ProcessInfo.processInfo.environment["LOGGER_PARITY_DIR"] else { return }
        try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
    }
}
