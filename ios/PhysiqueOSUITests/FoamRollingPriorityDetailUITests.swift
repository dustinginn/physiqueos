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

    /// Overnight Lane A: every locked Priority Detail variant renders its
    /// own action set (and never an invalid one) on the shipping screen.
    func testPriorityFamilyVariantsRenderTheirLockedActionsOnly() {
        let expectations: [(variant: String, present: [String], absent: [String])] = [
            ("peptide", ["priorityDetail.amountTaken", "priorityDetail.markComplete", "priorityDetail.markSkipped"], []),
            ("supplement", ["priorityDetail.markComplete", "priorityDetail.markSkipped"], ["priorityDetail.amountTaken"]),
            ("paused", ["priorityDetail.goToPeptide", "priorityDetail.paused"], ["priorityDetail.markComplete", "priorityDetail.markSkipped"]),
            ("morning", ["priorityDetail.logWeight", "priorityDetail.markSkipped"], ["priorityDetail.markComplete"]),
            ("morning-completed", ["priorityDetail.viewWeight"], ["priorityDetail.markComplete", "priorityDetail.markSkipped", "priorityDetail.logWeight"]),
            ("photos", ["priorityDetail.evidenceAction", "priorityDetail.evidenceBanner", "priorityDetail.markSkipped"], ["priorityDetail.markComplete"]),
            ("dexa", ["priorityDetail.evidenceAction", "priorityDetail.evidenceBanner", "priorityDetail.markSkipped"], ["priorityDetail.markComplete"]),
            ("completed", ["priorityDetail.completed"], ["priorityDetail.markComplete", "priorityDetail.markSkipped"]),
            ("skipped", ["priorityDetail.skipped"], ["priorityDetail.markComplete", "priorityDetail.markSkipped"]),
            ("setup", ["priorityDetail.reviewSupport"], ["priorityDetail.markComplete"]),
            ("failed", ["priorityDetail.retry"], ["priorityDetail.markComplete"]),
            ("not-found", ["priorityDetail.retry"], ["priorityDetail.markComplete"]),
        ]
        for (index, expectation) in expectations.enumerated() {
            app.terminate()
            app.launchArguments = [
                "-physiqueos.native.authority-selection.v1", "sandbox",
                "-physiqueos.priority-pilot.enabled", "YES",
                "-physiqueos.priority-pilot.appearance", index.isMultiple(of: 2) ? "dark" : "light",
                "-physiqueos.priority-pilot.variant", expectation.variant,
            ]
            app.launch()
            XCTAssertTrue(app.staticTexts["PRIORITY"].waitForExistence(timeout: 8), expectation.variant)
            for identifier in expectation.present {
                let element = app.descendants(matching: .any)[identifier]
                XCTAssertTrue(element.waitForExistence(timeout: 3), "\(expectation.variant): missing \(identifier)")
            }
            for identifier in expectation.absent {
                XCTAssertFalse(app.descendants(matching: .any)[identifier].exists, "\(expectation.variant): unexpected \(identifier)")
            }
            for identifier in expectation.present where identifier.hasSuffix("markComplete") || identifier.hasSuffix("evidenceAction") {
                XCTAssertGreaterThanOrEqual(app.buttons[identifier].frame.height, 51.5, "\(expectation.variant) primary action height")
            }
            for identifier in expectation.present where identifier.hasSuffix("markSkipped") {
                XCTAssertGreaterThanOrEqual(app.buttons[identifier].frame.height, 43.5, "\(expectation.variant) Skip touch target")
            }
            XCTAssertFalse(app.tabBars.firstMatch.exists, "\(expectation.variant): no persistent tab bar")
        }
    }

    // MARK: Overnight Lane A — daily capture, Confidence, Watch appearance

    private func launchCapture(route: String, state: String, appearance: String, extra: [String] = []) {
        app.terminate()
        app.launchArguments = [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.appearance-review.value", appearance,
            "-physiqueos.appearance-review.route", route,
            "-physiqueos.capture-review", state,
        ] + extra
        app.launch()
    }

    func testMorningCheckInLockedDispositionsAndAtomicAction() {
        launchCapture(route: "morning-check-in", state: "morning-reconcile", appearance: "dark")
        let completed = app.buttons["morningCheckIn.tesamorelin.completed"]
        XCTAssertTrue(completed.waitForExistence(timeout: 8))
        XCTAssertTrue(completed.isSelected, "The chosen disposition is a selected trait, not color alone.")
        XCTAssertFalse(app.buttons["morningCheckIn.tesamorelin.skipped"].isSelected)
        XCTAssertTrue(app.buttons["morningCheckIn.foam.skipped"].isSelected)
        for id in ["morningCheckIn.tesamorelin.completed", "morningCheckIn.foam.note"] {
            XCTAssertGreaterThanOrEqual(app.buttons[id].frame.height, 44, id)
        }
        XCTAssertTrue(app.staticTexts["Yesterday’s unfinished priorities"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["morningCheckIn.weight"].exists)
        let save = app.buttons["morningCheckIn.save"]
        XCTAssertTrue(save.exists)
        XCTAssertGreaterThanOrEqual(save.frame.height, 51.5)

        launchCapture(route: "morning-check-in", state: "morning-complete", appearance: "light")
        XCTAssertTrue(app.staticTexts["Weigh-in complete"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["morningCheckIn.returnHome"].exists)
        XCTAssertFalse(app.buttons["morningCheckIn.save"].exists)
    }

    func testManualWeightRevealsReturnToLogOnlyAfterADurableSave() {
        launchCapture(route: "manual-weight", state: "weight-success", appearance: "light")
        XCTAssertTrue(app.buttons["manualWeighIn.returnToLog"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Weight saved for Sep 10, 2026."].exists)

        launchCapture(route: "manual-weight", state: "weight-processing", appearance: "dark")
        XCTAssertTrue(app.buttons["manualWeighIn.save"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["manualWeighIn.message"].exists)
        XCTAssertFalse(app.buttons["manualWeighIn.returnToLog"].exists, "Still reconciling is not a durable save.")

        launchCapture(route: "manual-weight", state: "weight-failed", appearance: "light")
        XCTAssertTrue(app.staticTexts["This weigh-in could not be saved."].waitForExistence(timeout: 8))
        XCTAssertFalse(app.buttons["manualWeighIn.returnToLog"].exists)
        XCTAssertGreaterThanOrEqual(app.buttons["manualWeighIn.save"].frame.height, 51.5)
    }

    func testConfidenceSheetShowsTheLockedV3GroupsWithoutAssumptions() {
        launchCapture(route: "home", state: "none", appearance: "dark",
                      extra: ["-physiqueos.redesign-review", "-physiqueos.confidence-review", "v3"])
        XCTAssertTrue(app.staticTexts["Why confidence is 79%"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Current confidence: Moderate"].exists)
        for title in ["Why confidence is here", "What increased it", "What supports it now", "What is holding it back"] {
            XCTAssertTrue(app.staticTexts[title].exists, "Missing \(title)")
        }
        XCTAssertFalse(app.staticTexts["Assumptions"].exists)

        launchCapture(route: "home", state: "none", appearance: "light",
                      extra: ["-physiqueos.redesign-review", "-physiqueos.confidence-review", "v2"])
        XCTAssertTrue(app.staticTexts["Why confidence is 74%"].waitForExistence(timeout: 10))
        for title in ["What changed", "What supports confidence", "What limits confidence", "What will make confidence clearer"] {
            XCTAssertTrue(app.staticTexts[title].exists, "Missing \(title)")
        }
    }

    /// Lane A addendum: the Apple Watch appearance is its own control on the
    /// accepted Appearance page and never changes the iPhone selection.
    func testWatchAppearanceIsAnIndependentAccessibleControl() {
        launchReview(route: "appearance", appearance: "dark")
        let watchMineral = app.buttons["appearance.watch.mineralLight"]
        XCTAssertTrue(watchMineral.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(watchMineral.frame.height, 44)
        let iPhoneDarkBefore = app.buttons["appearance.dark"].value as? String
        if !watchMineral.isHittable { app.swipeUp() }
        watchMineral.tap()
        XCTAssertEqual(watchMineral.value as? String, "Selected")
        XCTAssertEqual(app.buttons["appearance.watch.dark"].value as? String, "Not selected")
        XCTAssertEqual(app.buttons["appearance.dark"].value as? String, iPhoneDarkBefore, "iPhone selection unchanged")
        app.buttons["appearance.watch.dark"].tap()
        XCTAssertEqual(app.buttons["appearance.watch.dark"].value as? String, "Selected")
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

    func testHomePhysicalParityDark() {
        launchHomeParity(appearance: "dark")
        assertCorrectedHomeParity()
        capture("home-physical-parity-dark")
    }

    func testHomePhysicalParityMineralLight() {
        launchHomeParity(appearance: "light")
        assertCorrectedHomeParity()
        capture("home-physical-parity-light")
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

    private func launchHomeParity(appearance: String) {
        app.terminate()
        app.launchArguments = [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.appearance-review.value", appearance,
            "-physiqueos.appearance-review.route", "home",
            "-physiqueos.redesign-review",
        ]
        app.launch()
        XCTAssertTrue(app.staticTexts["4 weeks"].waitForExistence(timeout: 8))
    }

    private func assertCorrectedHomeParity() {
        for value in [
            "TARGET DATE", "Oct 31", "REMAINING", "4 weeks", "PROGRESS", "58%",
            "DESTINATION", "+10 lb lean", "PHASE2 · ACTIVE", "Lean Mass Build",
            "Aug 15 – Oct 31 · about 4 weeks remaining", "+5.8 of 10 lb",
        ] {
            XCTAssertTrue(app.staticTexts[value].firstMatch.exists, "Missing corrected Home copy: \(value)")
        }
        XCTAssertFalse(app.staticTexts["LATEST BRIEFING"].exists)
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
