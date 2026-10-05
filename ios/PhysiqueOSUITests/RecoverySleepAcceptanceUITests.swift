import XCTest

/// Sandbox acceptance for Recovery / Sleep Evidence (synthetic fixture).
/// Screenshots are attached to the xcresult and, when
/// `RECOVERY_SLEEP_SCREENSHOT_DIR` is provided (via the `TEST_RUNNER_`
/// prefix), written as PNGs for review.
@MainActor
final class RecoverySleepAcceptanceUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments += ["-physiqueos.native.authority-selection.v1", "sandbox"]
        app.launch()
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func text(_ value: String) -> XCUIElement {
        app.staticTexts[value].firstMatch
    }

    private func reveal(_ target: XCUIElement, up: Bool = true, maxSwipes: Int = 14) {
        for _ in 0..<maxSwipes where !(target.exists && target.isHittable) {
            up ? app.swipeUp(velocity: .slow) : app.swipeDown(velocity: .slow)
        }
        XCTAssertTrue(target.exists && target.isHittable, "Could not reveal \(target)")
    }

    private func bringNearTop(_ target: XCUIElement) {
        let frame = app.frame
        let targetY = frame.height * 0.17
        guard target.frame.minY > targetY + 20 else { return }
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: frame.width / 2, dy: target.frame.midY))
            .press(forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: frame.width / 2, dy: targetY)), withVelocity: .slow, thenHoldForDuration: 0.3)
    }

    private func capture(_ name: String) {
        Thread.sleep(forTimeInterval: 1.0)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let directory = ProcessInfo.processInfo.environment["RECOVERY_SLEEP_SCREENSHOT_DIR"], !directory.isEmpty {
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
        }
    }

    private func openRecovery() -> XCUIElement {
        app.buttons["Evidence"].tap()
        let recovery = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Recovery")).firstMatch
        XCTAssertTrue(recovery.waitForExistence(timeout: 10))
        for _ in 0..<6 where !recovery.isHittable {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
                .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)))
        }
        return recovery
    }

    func testHubRecoveryLandingNightJourneyWithHonestStates() {
        let recovery = openRecovery()
        XCTAssertTrue(recovery.label.contains("Last night"), recovery.label)
        capture("A-hub-recovery")
        recovery.tap()

        XCTAssertTrue(element("sleep.recovery.landing").waitForExistence(timeout: 5))
        XCTAssertTrue(text("Last Night").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Still updating from Apple Health"].exists)
        capture("B-landing-top")

        let window = text("Sleep Window")
        reveal(window)
        bringNearTop(window)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Historical clock times are approximate.")).firstMatch.exists)
        capture("C1-landing-window")
        reveal(text("Data Sources"))
        capture("C2-landing-lower")

        // Server-flagged travel night: approximate clock times, exact total.
        let travel = element("sleep.night.2026-09-29")
        reveal(travel)
        XCTAssertTrue(travel.label.contains("Clock times approximate"), travel.label)
        travel.tap()
        XCTAssertTrue(element("sleep.night.screen").waitForExistence(timeout: 5))
        XCTAssertTrue(text("Timeline").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Historical clock times are approximate.")).firstMatch.exists)
        capture("E-night-top")
        reveal(text("Continuity"))
        capture("F1-night-stages-continuity")
        let toggle = element("sleep.sourceData.toggle")
        reveal(toggle)
        toggle.tap()
        reveal(text("Calculation"))
        XCTAssertTrue(text("sleep-canon-v2").exists)
        capture("F2-night-source-provenance")
        app.navigationBars.buttons.firstMatch.tap()

        // Trends: range selector, weekly long range, stage mix collapsed.
        let trends = element("sleep.trends")
        reveal(trends, up: false)
        trends.tap()
        XCTAssertTrue(element("sleep.trends.screen").waitForExistence(timeout: 5))
        XCTAssertTrue(text("Total Sleep").waitForExistence(timeout: 5))
        capture("D1-trends-top")
        reveal(text("Continuity"))
        capture("D2-trends-window-continuity")
        let stageMix = element("sleep.stageMix.toggle")
        reveal(stageMix)
        XCTAssertEqual(stageMix.value as? String, "Collapsed")
        capture("D3-trends-stage-mix-collapsed")
        reveal(element("sleep.range.6m"), up: false)
        element("sleep.range.6m").tap()
        // The Sandbox Evidence spans < 183 days, so 6M stays nightly (weekly only past the Server threshold).
        XCTAssertTrue(text("Total Sleep").waitForExistence(timeout: 5))
        element("sleep.range.2w").tap()
        XCTAssertTrue(text("Total Sleep").waitForExistence(timeout: 5))
        app.navigationBars.buttons.firstMatch.tap()

        // Show All (paged) → pending-correction night.
        let showAll = element("sleep.showAll")
        reveal(showAll)
        showAll.tap()
        XCTAssertTrue(app.navigationBars["All Nights"].waitForExistence(timeout: 5))
        let pending = element("sleep.night.2026-09-21")
        reveal(pending)
        pending.tap()
        XCTAssertTrue(text("Timeline").waitForExistence(timeout: 5))
        reveal(text("Continuity"))
        XCTAssertTrue(app.staticTexts["Stage detail is being recalculated."].exists)
        capture("G-pending-correction")
    }

    func testGoalScopeBlocksTimeAndEdgeSwipeBackStillWorks() {
        openRecovery().tap()
        XCTAssertTrue(element("sleep.recovery.landing").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Jul 6 → Present"].waitForExistence(timeout: 5), "All Sleep starts at the Evidence boundary")

        let abs = app.buttons["Visible Abs"].firstMatch
        XCTAssertTrue(abs.waitForExistence(timeout: 5))
        abs.tap()
        let absRange = app.staticTexts["Jul 6 → Jul 18"].waitForExistence(timeout: 8)
        if !absRange { print("DEBUG-TREE", app.staticTexts.allElementsBoundByIndex.prefix(40).map(\.label)) }
        XCTAssertTrue(absRange, "completed Goal intersected with Evidence")
        XCTAssertTrue(text("Final Night").waitForExistence(timeout: 5))
        capture("H1-goal-visible-abs")

        // The same scope applies on Trends.
        let trends = element("sleep.trends")
        reveal(trends)
        trends.tap()
        XCTAssertTrue(element("sleep.trends.screen").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Jul 6 → Jul 18"].waitForExistence(timeout: 5))
        capture("H2-goal-trends")

        // Leading-edge swipe-back still pops (native navigation untouched).
        let edge = app.coordinate(withNormalizedOffset: CGVector(dx: 0.0, dy: 0.5))
        edge.withOffset(CGVector(dx: 2, dy: 0))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)), withVelocity: .fast, thenHoldForDuration: 0)
        XCTAssertTrue(element("sleep.recovery.landing").waitForExistence(timeout: 5))
        XCTAssertFalse(element("sleep.trends.screen").exists)

        let lean = app.buttons["Build Lean Mass"].firstMatch
        reveal(lean, up: false)
        lean.tap()
        XCTAssertTrue(app.staticTexts["Jul 19 → Present"].waitForExistence(timeout: 8))
        app.buttons["All Sleep"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Jul 6 → Present"].waitForExistence(timeout: 8))
    }

    func testAdditionalSleepAndUnstagedNight() {
        openRecovery().tap()
        XCTAssertTrue(element("sleep.recovery.landing").waitForExistence(timeout: 5))
        let showAll = element("sleep.showAll")
        reveal(showAll)
        showAll.tap()
        XCTAssertTrue(app.navigationBars["All Nights"].waitForExistence(timeout: 5))

        let withNap = element("sleep.night.2026-09-20")
        reveal(withNap)
        XCTAssertTrue(withNap.label.contains("2026") == false)
        withNap.tap()
        reveal(element("sleep.additional"))
        XCTAssertTrue(text("Additional Sleep").exists)
        capture("H-additional-sleep")
        app.navigationBars.buttons.firstMatch.tap()

        let unstaged = element("sleep.night.2026-09-14")
        reveal(unstaged)
        unstaged.tap()
        reveal(text("Stages"))
        XCTAssertTrue(text("Stage detail is not available from this source for this night.").waitForExistence(timeout: 5))
        capture("I-unstaged-night")
    }
}

/// Batch 3 Checkpoint A: the locked Evidence Hub + Timeline through the real
/// app shell. `-physiqueos.evidence-review` supplies the deterministic
/// production-shaped Hub (Timeline before Recovery, Health Metrics
/// placeholder present) and Timeline feed; it exists only in Debug.
@MainActor
final class EvidenceHubTimelineUITests: XCTestCase {
    private let app = XCUIApplication()
    private let lockedOrder = ["training", "nutrition", "weight", "photos", "dexa", "activity", "energy", "recovery", "timeline"]

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments += ["-physiqueos.native.authority-selection.v1", "sandbox"]
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func streamRow(_ id: String, in section: String) -> XCUIElement {
        element(section).descendants(matching: .any)["evidence.stream.\(id)"].firstMatch
    }

    private func reveal(_ target: XCUIElement) {
        for _ in 0..<10 where !(target.exists && target.isHittable) {
            app.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(target.exists && target.isHittable, "Could not reveal \(target)")
    }

    func testLockedHubHierarchyRowsAndTimelineRoundTrip() {
        app.launchArguments += ["-physiqueos.evidence-review"]
        app.launch()
        app.buttons["Evidence"].tap()

        XCTAssertTrue(element("evidence.hub.all").waitForExistence(timeout: 10))
        XCTAssertTrue(element("evidence.header.evidence").exists)
        let recentRows = element("evidence.hub.recentlyUsed").descendants(matching: .any)
            .matching(NSPredicate(format: "identifier BEGINSWITH %@", "evidence.stream."))
        XCTAssertEqual(Set(recentRows.allElementsBoundByIndex.map(\.identifier)), ["evidence.stream.training", "evidence.stream.photos"])
        XCTAssertTrue(streamRow("training", in: "evidence.hub.recentlyUsed").exists)
        XCTAssertTrue(streamRow("photos", in: "evidence.hub.recentlyUsed").exists)

        // Locked order, Health Metrics absent, every row a full-width >=44 pt button.
        XCTAssertFalse(element("evidence.stream.health-metrics").exists)
        var previousY = -CGFloat.infinity
        let width = app.windows.firstMatch.frame.width
        for id in lockedOrder {
            let row = streamRow(id, in: "evidence.hub.all")
            XCTAssertTrue(row.exists, "Missing \(id)")
            XCTAssertGreaterThan(row.frame.minY, previousY, "\(id) out of locked order")
            XCTAssertGreaterThanOrEqual(row.frame.height, 44, "\(id) tap target")
            XCTAssertGreaterThan(row.frame.width, width * 0.88, "\(id) is not a full-row target")
            previousY = row.frame.minY
        }
        XCTAssertTrue(streamRow("weight", in: "evidence.hub.all").label.hasPrefix("Weight. Latest: 179.4 lb"))

        let timeline = streamRow("timeline", in: "evidence.hub.all")
        reveal(timeline)
        timeline.tap()

        XCTAssertTrue(element("evidence.timeline.events").waitForExistence(timeout: 10))
        let ids = ["weight-1", "briefing-1", "photo-1", "dexa-1", "workout-1", "activity-1", "upload-1", "protocol-1"]
        var eventY = -CGFloat.infinity
        for id in ids {
            let event = element("evidence.timeline.event.\(id)")
            XCTAssertTrue(event.exists, "Missing event \(id)")
            XCTAssertGreaterThan(event.frame.minY, eventY, "\(id) out of Server order")
            eventY = event.frame.minY
        }
        XCTAssertTrue(element("evidence.timeline.event.weight-1").label.hasPrefix("Weight, Sep 10, 2026. Weight logged"))
        XCTAssertEqual(element("evidence.timeline.count").label, "Showing 8 of 124")
        XCTAssertEqual(element("evidence.timeline.events").descendants(matching: .button).count, 0, "Timeline rows must not navigate")

        let back = element("evidence.timeline.back")
        XCTAssertTrue(back.isHittable)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44)
        back.tap()
        XCTAssertTrue(element("evidence.hub.all").waitForExistence(timeout: 5))
    }

    func testSandboxHubKeepsCanonicalAvailabilityWithoutATimelineRow() {
        app.launch()
        app.buttons["Evidence"].tap()
        XCTAssertTrue(element("evidence.hub.all").waitForExistence(timeout: 10))
        XCTAssertTrue(streamRow("recovery", in: "evidence.hub.all").exists)
        XCTAssertFalse(element("evidence.stream.timeline").exists)
        XCTAssertFalse(element("evidence.stream.health-metrics").exists)
    }

    func testLockedLoadingFailureAndEmptyStates() {
        app.launchArguments += ["-physiqueos.evidence-review", "-physiqueos.evidence-review.state", "failed"]
        app.launch()
        app.buttons["Evidence"].tap()
        XCTAssertTrue(element("evidence.hub.failure").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Evidence could not be loaded."].exists)
        app.terminate()

        app.launchArguments = ["-physiqueos.native.authority-selection.v1", "sandbox",
                               "-physiqueos.evidence-review", "-physiqueos.evidence-review.state", "empty",
                               "-physiqueos.appearance-review.route", "evidence-timeline"]
        app.launch()
        XCTAssertTrue(element("evidence.timeline.empty").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["No Timeline entries yet."].exists)
        XCTAssertFalse(element("evidence.timeline.count").exists)
        app.terminate()

        app.launchArguments = ["-physiqueos.native.authority-selection.v1", "sandbox",
                               "-physiqueos.evidence-review", "-physiqueos.evidence-review.state", "loading"]
        app.launch()
        app.buttons["Evidence"].tap()
        XCTAssertTrue(element("evidence.hub.loading").waitForExistence(timeout: 10))
    }
}
