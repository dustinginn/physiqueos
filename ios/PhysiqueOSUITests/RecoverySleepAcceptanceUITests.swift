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

/// Batch 3 Checkpoints B + C: the locked Training, Activity, Nutrition and
/// Weight hierarchies through the real Sandbox app shell (no review seam).
@MainActor
final class EvidenceTrainingNutritionWeightUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments += ["-physiqueos.native.authority-selection.v1", "sandbox"]
        app.launch()
        app.buttons["Evidence"].tap()
        XCTAssertTrue(element("evidence.hub.all").waitForExistence(timeout: 10))
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func reveal(_ target: XCUIElement, maxSwipes: Int = 10) {
        for _ in 0..<maxSwipes where !(target.exists && target.isHittable) {
            app.swipeUp(velocity: .slow)
        }
        for _ in 0..<maxSwipes where !(target.exists && target.isHittable) {
            app.swipeDown(velocity: .slow)
        }
        XCTAssertTrue(target.exists && target.isHittable, "Could not reveal \(target)")
    }

    private func open(stream id: String) {
        let row = element("evidence.stream.\(id)")
        reveal(row)
        row.tap()
        XCTAssertTrue(element("evidence.page.header").waitForExistence(timeout: 10), "\(id) header")
    }

    private func assertBack(_ label: String) {
        let back = element("evidence.back")
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        XCTAssertEqual(back.label, label)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44)
    }

    func testTrainingHierarchyAndContextualBackTrail() {
        open(stream: "training")
        assertBack("Evidence Hub")
        XCTAssertTrue(element("evidence.scope").exists)
        XCTAssertTrue(element("training.latestDay").exists)
        // All ten canonical Training Areas, in live order, each a >=44 pt target.
        var previous = CGRect.zero
        for (index, id) in ["chest", "back", "shoulders", "biceps", "triceps", "core", "quads", "hamstrings", "glutes", "calves"].enumerated() {
            let tile = element("training.area.\(id)")
            XCTAssertTrue(tile.exists, id)
            XCTAssertGreaterThanOrEqual(tile.frame.height, 44, id)
            if index > 0 { XCTAssertTrue(tile.frame.minY > previous.minY || tile.frame.minX > previous.minX, "\(id) order") }
            previous = tile.frame
        }
        let viewDay = element("training.latestDay.view")
        reveal(viewDay)
        viewDay.tap()
        XCTAssertTrue(element("training.day.sessions").waitForExistence(timeout: 10))
        assertBack("Training")
        let session = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "training.day.session.")).firstMatch
        XCTAssertTrue(session.exists)
        session.tap()
        XCTAssertTrue(element("training.session.correction").waitForExistence(timeout: 10))
        assertBack("Sep 1")
        element("evidence.back").tap()
        XCTAssertTrue(element("training.day.sessions").waitForExistence(timeout: 5))
    }

    func testTrainingReportingAndLibraryKeepRoutes() {
        open(stream: "training")
        let disclosure = element("training-reporting-disclosure")
        reveal(disclosure)
        disclosure.tap()
        let resistance = element("training-report-resistance")
        reveal(resistance)
        resistance.tap()
        XCTAssertTrue(element("training.report.resistanceSummary").waitForExistence(timeout: 10))
        assertBack("Training")
        XCTAssertTrue(app.staticTexts["Source"].exists || element("training.report.Recent PRs").exists)
        element("evidence.back").tap()
        let browse = element("training.areas.browse")
        reveal(browse)
        browse.tap()
        XCTAssertTrue(element("training.library.browse").waitForExistence(timeout: 10))
        XCTAssertTrue(element("training.library.area.calves").exists)
    }

    func testActivityRootHierarchyAndThreeRowHistory() {
        open(stream: "activity")
        assertBack("Evidence Hub")
        XCTAssertTrue(element("activity.latestDay").exists)
        reveal(element("activity.history"))
        XCTAssertTrue(element("activity.areas").exists)
        XCTAssertTrue(element("activity.linkedTraining").exists)
        XCTAssertTrue(element("activity.history.showAll").exists)
        element("activity.latestDay").tap()
        XCTAssertTrue(element("activity.day.metrics").waitForExistence(timeout: 10))
        assertBack("Activity")
    }

    func testNutritionRootReportsAndDay() {
        open(stream: "nutrition")
        XCTAssertTrue(element("nutrition.latestDay").exists)
        XCTAssertFalse(app.staticTexts["Nutrition Areas"].exists, "Locked correction hides the duplicate Areas block")
        for id in ["calories", "macros", "meals"] {
            XCTAssertTrue(element("nutrition.report.\(id)").exists, id)
        }
        let calories = element("nutrition.report.calories")
        reveal(calories)
        calories.tap()
        XCTAssertTrue(element("nutrition.report.summary").waitForExistence(timeout: 10))
        XCTAssertTrue(element("nutrition.report.caloriesTrend").exists)
        assertBack("Nutrition")
        element("evidence.back").tap()
        let latest = element("nutrition.latestDay")
        reveal(latest)
        latest.tap()
        XCTAssertTrue(element("nutrition.day.meals").waitForExistence(timeout: 10))
        XCTAssertTrue(element("nutrition.day.summary").exists)
    }

    /// Chart selection must never trap the page scroll: a vertical flick
    /// that starts on the Weight chart scrolls; a horizontal pan scrubs.
    func testWeightChartScrubsHorizontallyAndScrollsVertically() {
        open(stream: "weight")
        let chart = element("weight.trend")
        let selection = element("weight.trend.selection")
        XCTAssertTrue(selection.waitForExistence(timeout: 5))
        let before = selection.label
        let y = (chart.frame.minY + 140) / app.frame.height
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: y))
            .press(forDuration: 0, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: y)), withVelocity: .slow, thenHoldForDuration: 0.1)
        XCTAssertNotEqual(selection.label, before, "Horizontal scrub did not change the selected entry")
        let history = app.staticTexts["Weight History"]
        let top = history.frame.minY
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: y))
            .press(forDuration: 0, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast, thenHoldForDuration: 0)
        XCTAssertLessThan(history.frame.minY, top - 100, "A vertical swipe starting on the chart did not scroll the page")
    }

    func testWeightInlineDisclosureNeverAddsARoute() {
        open(stream: "weight")
        XCTAssertTrue(element("weight.summary").exists)
        XCTAssertTrue(element("weight.trend").exists)
        // Weekly Averages has more than three canonical weeks in this scope.
        let toggle = element("weight.weeklyAverages.toggle")
        reveal(toggle)
        XCTAssertEqual(toggle.label, "Show All")
        toggle.tap()
        XCTAssertEqual(element("weight.weeklyAverages.toggle").label, "Close")
        XCTAssertTrue(element("evidence.page.header").exists, "Show All expands in place")
    }

    // MARK: - B/C regression proof: every drawer, route and filter

    private func first(prefix: String, in container: XCUIElement? = nil) -> XCUIElement {
        (container ?? app).descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).firstMatch
    }

    private func count(prefix: String, in container: XCUIElement? = nil) -> Int {
        (container ?? app).descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix)).count
    }

    /// Taps the first row with `prefix` that is inside the open sheet
    /// (below its Done bar), never a row of the page behind it.
    private func tapSheetRow(prefix: String) {
        let doneBottom = element("evidence.sheet.done").frame.maxY
        let rows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
        let row = (0..<rows.count).map { rows.element(boundBy: $0) }.first { $0.isHittable && $0.frame.minY > doneBottom }
        XCTAssertNotNil(row, "No \(prefix) row in the sheet")
        row?.tap()
    }

    private func sheetRowCount(prefix: String) -> Int {
        let doneBottom = element("evidence.sheet.done").frame.maxY
        let rows = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
        return (0..<rows.count).map { rows.element(boundBy: $0) }.filter { $0.frame.minY > doneBottom }.count
    }

    private func tapSheetDone() {
        let done = element("evidence.sheet.done")
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        // iOS 26 draws a medium-detent sheet inset at 386/402 scale, so
        // the 44-pt Done target measures 44 x 386/402 on screen.
        XCTAssertGreaterThanOrEqual(done.frame.height, 44 * 386 / 402 - 0.5)
        done.tap()
        XCTAssertTrue(done.waitForNonExistence(timeout: 5), "Sheet did not dismiss")
    }

    /// Selecting a different scope pill re-reads the canonical scope.
    private func assertScopeSwitches() {
        let scope = element("evidence.scope")
        reveal(scope)
        let pills = scope.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH %@", "evidence.scope."))
        XCTAssertGreaterThanOrEqual(pills.count, 2)
        let target = (0..<pills.count).map { pills.element(boundBy: $0) }.first { !$0.isSelected }!
        let id = target.identifier
        target.tap()
        expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: element(id))
        waitForExpectations(timeout: 10)
    }

    private func horizontalPan(across target: XCUIElement, atY y: CGFloat) {
        let ny = y / app.frame.height
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: ny))
            .press(forDuration: 0, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: ny)), withVelocity: .slow, thenHoldForDuration: 0.1)
    }

    func testActivityLowerPageIsCompleteAndEveryRouteWorks() {
        open(stream: "activity")
        for id in ["activity.latestDay", "activity.areas", "activity.linkedTraining", "activity.history"] {
            reveal(element(id))
        }
        let history = element("activity.history")
        XCTAssertEqual(count(prefix: "activity.history.day.", in: history), 3, "3-row preview")
        // Preview row -> Activity Day -> back.
        first(prefix: "activity.history.day.", in: history).tap()
        XCTAssertTrue(element("activity.day.metrics").waitForExistence(timeout: 10))
        assertBack("Activity")
        element("evidence.back").tap()
        XCTAssertTrue(element("activity.history").waitForExistence(timeout: 5))
        // Show All -> full history sheet -> row -> Activity Day -> back -> Done.
        let showAll = element("activity.history.showAll")
        reveal(showAll)
        showAll.tap()
        XCTAssertTrue(element("evidence.sheet.done").waitForExistence(timeout: 5))
        XCTAssertGreaterThan(sheetRowCount(prefix: "activity.history.day."), 3, "Show All lists the full history")
        tapSheetRow(prefix: "activity.history.day.")
        XCTAssertTrue(element("activity.day.metrics").waitForExistence(timeout: 10))
        element("evidence.back").tap()
        tapSheetDone()
        // Goal/phase scope still re-reads the page.
        assertScopeSwitches()
        XCTAssertTrue(element("activity.areas").exists)
    }

    func testNutritionRootHistoryDrawerAndScope() {
        open(stream: "nutrition")
        let history = element("nutrition.history")
        reveal(history)
        XCTAssertEqual(count(prefix: "nutrition.history.day.", in: history), 3)
        first(prefix: "nutrition.history.day.", in: history).tap()
        XCTAssertTrue(element("nutrition.day.meals").waitForExistence(timeout: 10))
        XCTAssertTrue(element("nutrition.day.summary").exists)
        element("evidence.back").tap()
        let showAll = element("nutrition.history.showAll")
        reveal(showAll)
        showAll.tap()
        XCTAssertTrue(element("evidence.sheet.done").waitForExistence(timeout: 5))
        XCTAssertGreaterThan(sheetRowCount(prefix: "nutrition.history.day."), 3)
        tapSheetRow(prefix: "nutrition.history.day.")
        XCTAssertTrue(element("nutrition.day.meals").waitForExistence(timeout: 10))
        element("evidence.back").tap()
        tapSheetDone()
        assertScopeSwitches()
        XCTAssertTrue(element("nutrition.reporting").exists)
    }

    func testNutritionCaloriesRangeScrubAndDailyDrawer() {
        open(stream: "nutrition")
        let calories = element("nutrition.report.calories")
        reveal(calories)
        calories.tap()
        XCTAssertTrue(element("nutrition.report.caloriesTrend").waitForExistence(timeout: 10))
        // Range filter.
        let all = element("nutrition.report.range.all")
        reveal(all)
        all.tap()
        expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: element("nutrition.report.range.all"))
        waitForExpectations(timeout: 10)
        // Horizontal scrub changes the selected week; page still scrolls.
        let selection = element("nutrition.report.trend.selection")
        XCTAssertTrue(selection.waitForExistence(timeout: 5))
        let before = selection.label
        horizontalPan(across: element("nutrition.report.caloriesTrend"), atY: selection.frame.minY - 70)
        XCTAssertNotEqual(selection.label, before, "Horizontal scrub did not change the selected week")
        // Weekly + daily drawers.
        for rows in ["nutrition.report.rows.weekly-averages", "nutrition.report.rows.recent-daily-calories"] {
            reveal(element(rows))
        }
        let dailyShowAll = element("nutrition.report.rows.recent-daily-calories.showAll")
        reveal(dailyShowAll)
        dailyShowAll.tap()
        let done = element("evidence.sheet.done")
        XCTAssertTrue(done.waitForExistence(timeout: 5))
        tapSheetRow(prefix: "nutrition.report.day.")
        XCTAssertTrue(element("nutrition.day.meals").waitForExistence(timeout: 10), "Daily row opens Nutrition Day from the drawer")
        element("evidence.back").tap()
        tapSheetDone()
        let weeklyShowAll = element("nutrition.report.rows.weekly-averages.showAll")
        if weeklyShowAll.exists {
            reveal(weeklyShowAll)
            weeklyShowAll.tap()
            tapSheetDone()
        }
    }

    func testNutritionMacroSwitchingAndMealsDrawers() {
        open(stream: "nutrition")
        let macros = element("nutrition.report.macros")
        reveal(macros)
        macros.tap()
        XCTAssertTrue(element("nutrition.report.macroDistribution").waitForExistence(timeout: 10))
        let carbs = element("nutrition.report.macro.Carbohydrates")
        XCTAssertTrue(carbs.waitForExistence(timeout: 5))
        carbs.tap()
        expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: element("nutrition.report.macro.Carbohydrates"))
        waitForExpectations(timeout: 10)
        let macroDaily = element("nutrition.report.rows.recent-daily-macros.showAll")
        reveal(macroDaily)
        macroDaily.tap()
        tapSheetDone()
        element("evidence.back").tap()

        let meals = element("nutrition.report.meals")
        reveal(meals)
        meals.tap()
        XCTAssertTrue(element("nutrition.report.mealDistribution").waitForExistence(timeout: 10))
        // Meal-trend metric menu.
        let metric = element("nutrition.report.metricSelector")
        reveal(metric)
        let beforeMetric = metric.label
        metric.tap()
        app.buttons["Protein"].firstMatch.tap()
        expectation(for: NSPredicate(format: "label != %@", beforeMetric), evaluatedWith: element("nutrition.report.metricSelector"))
        waitForExpectations(timeout: 10)
        // Slot filter.
        let slot = first(prefix: "nutrition.report.trendSlot.Dinner")
        reveal(slot)
        slot.tap()
        expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: first(prefix: "nutrition.report.trendSlot.Dinner"))
        waitForExpectations(timeout: 10)
        // Every meals drawer that has more than three rows opens and closes;
        // meal history rows open Nutrition Day.
        for rows in ["weekly-meal-summary", "recurring-meals"] {
            let showAll = element("nutrition.report.rows.\(rows).showAll")
            if showAll.exists {
                reveal(showAll)
                showAll.tap()
                tapSheetDone()
            }
        }
        let historyShowAll = element("nutrition.report.rows.recent-meal-history.showAll")
        reveal(historyShowAll)
        historyShowAll.tap()
        XCTAssertTrue(element("evidence.sheet.done").waitForExistence(timeout: 5))
        tapSheetRow(prefix: "nutrition.report.day.")
        XCTAssertTrue(element("nutrition.day.meals").waitForExistence(timeout: 10))
        element("evidence.back").tap()
        tapSheetDone()
    }

    func testWeightScopeTapSelectionAndBothInlineDisclosures() {
        open(stream: "weight")
        // Tap selects a point without scrolling the page.
        let selection = element("weight.trend.selection")
        XCTAssertTrue(selection.waitForExistence(timeout: 5))
        let before = selection.label
        let y = (element("weight.trend").frame.minY + 140) / app.frame.height
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: y)).tap()
        XCTAssertNotEqual(selection.label, before, "Tap did not select a different entry")
        // Weekly averages and history expand in place and close again.
        for section in ["weight.weeklyAverages", "weight.history"] {
            let toggle = element("\(section).toggle")
            reveal(toggle)
            let rowsBefore = element(section).staticTexts.count
            XCTAssertEqual(toggle.label, "Show All")
            toggle.tap()
            XCTAssertEqual(element("\(section).toggle").label, "Close")
            XCTAssertGreaterThan(element(section).staticTexts.count, rowsBefore, "\(section) expands")
            element("\(section).toggle").tap()
            XCTAssertEqual(element("\(section).toggle").label, "Show All")
        }
        assertScopeSwitches()
        XCTAssertTrue(element("weight.summary").waitForExistence(timeout: 10))
    }
}


/// Batch 3 Checkpoint D: Progress Photos + DEXA journeys on the locked
/// record surfaces. Synthetic review media (generated mannequin renders,
/// Debug only) gives the inspector real pixels without Founder photos.
@MainActor
final class EvidencePhotosDEXAUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments += [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.evidence-review.synthetic-photos",
        ]
        app.launch()
        app.buttons["Evidence"].tap()
        XCTAssertTrue(element("evidence.hub.all").waitForExistence(timeout: 10))
    }

    private func element(_ identifier: String) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func reveal(_ target: XCUIElement, maxSwipes: Int = 14) {
        for _ in 0..<maxSwipes where !(target.exists && target.isHittable) {
            app.swipeUp(velocity: .slow)
        }
        for _ in 0..<maxSwipes where !(target.exists && target.isHittable) {
            app.swipeDown(velocity: .slow)
        }
        XCTAssertTrue(target.exists && target.isHittable, "Could not reveal \(target)")
    }

    private func open(stream id: String) {
        let row = element("evidence.stream.\(id)")
        reveal(row)
        row.tap()
    }

    private func waitForValue(_ identifier: String, _ value: String, timeout: TimeInterval = 5) {
        expectation(for: NSPredicate(format: "value == %@", value), evaluatedWith: element(identifier))
        waitForExpectations(timeout: timeout)
    }

    func testPhotosRootDetailPagerSourceHistoryAndInspector() {
        open(stream: "photos")
        XCTAssertTrue(app.staticTexts["Progress Photos"].waitForExistence(timeout: 10))
        XCTAssertTrue(element("evidence.back").exists)
        XCTAssertEqual(element("evidence.back").label, "Evidence Hub")
        XCTAssertTrue(element("photos.latestSet").exists)
        XCTAssertTrue(element("photos.briefing.read").exists)
        XCTAssertGreaterThanOrEqual(element("photos.briefing.read").frame.height, 44)

        // Uploaded Photos expands and closes in place.
        let toggle = element("photos.history.toggle")
        reveal(toggle)
        XCTAssertEqual(toggle.value as? String, "Collapsed")
        toggle.tap()
        waitForValue("photos.history.toggle", "Expanded")
        element("photos.history.toggle").tap()
        waitForValue("photos.history.toggle", "Collapsed")

        // Latest Photo Set opens the large Photo Set sheet on the first pose.
        let latest = element("photos.latestSet")
        reveal(latest)
        latest.tap()
        XCTAssertTrue(element("photos.detail").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["PROGRESS PHOTO EVIDENCE"].exists)
        XCTAssertTrue(app.staticTexts["Front Relaxed"].exists)
        XCTAssertTrue(element("photos.detail.previous").exists, "Previous and Current are shown together")
        XCTAssertTrue(element("photos.detail.current").exists)
        XCTAssertFalse(element("photos.detail.previousPose").isEnabled, "First pose disables Previous")

        // Source History expands in place.
        let source = element("photos.detail.sourceHistory")
        reveal(source)
        XCTAssertEqual(source.value as? String, "Collapsed")
        source.tap()
        waitForValue("photos.detail.sourceHistory", "Expanded")

        // Tapping Current opens the shared inspector at Current; Close dismisses it.
        let current = element("photos.detail.current")
        reveal(current)
        current.tap()
        let close = element("photoInspection.close")
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        XCTAssertGreaterThanOrEqual(close.frame.height, 44)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Front Relaxed · Current")).firstMatch.exists)
        close.tap()
        XCTAssertTrue(close.waitForNonExistence(timeout: 5))

        // Next steps to the next canonical pose.
        let next = element("photos.detail.nextPose")
        reveal(next)
        next.tap()
        XCTAssertTrue(app.staticTexts["Back Relaxed"].waitForExistence(timeout: 5))
        XCTAssertTrue(element("photos.detail.previousPose").isEnabled)

        element("photos.detail.close").tap()
        XCTAssertTrue(element("photos.detail").waitForNonExistence(timeout: 5))
        XCTAssertTrue(element("photos.latestSet").exists)
    }

    func testDEXAOrderAndEveryIndependentDisclosure() {
        open(stream: "dexa")
        XCTAssertTrue(app.staticTexts["DEXA"].waitForExistence(timeout: 10))
        let order = ["dexa.latestScan", "dexa.summary", "dexa.sincePriorScan", "dexa.coreTrends", "dexa.supplemental", "dexa.regionalLean", "dexa.regionalFat", "dexa.history"]
        // Every locked section exists, and adjacent sections keep the locked
        // order (compared while both are on screen).
        for (upper, lower) in zip(order, order.dropFirst()) {
            reveal(element(lower))
            if element(upper).isHittable {
                XCTAssertLessThan(element(upper).frame.minY, element(lower).frame.minY, "\(upper) before \(lower)")
            }
        }
        // Core Trends is always open with five charts.
        for title in ["Body Fat %", "Fat Mass", "Lean Mass", "Total Mass", "RMR"] {
            let chart = element("dexa.chart.\(title)")
            reveal(chart)
            XCTAssertTrue(chart.exists, title)
        }
        for (toggleID, chartID) in [
            ("dexa.supplemental.toggle", "dexa.supplemental.charts"),
            ("dexa.regionalLean.toggle", "dexa.regionalLean.charts"),
            ("dexa.regionalFat.toggle", "dexa.regionalFat.charts"),
            ("dexa.history.toggle", nil as String?),
        ] {
            let toggle = element(toggleID)
            reveal(toggle)
            XCTAssertEqual(toggle.value as? String, "Collapsed", toggleID)
            if let chartID { XCTAssertFalse(element(chartID).exists, "\(chartID) hidden while collapsed") }
            toggle.tap()
            waitForValue(toggleID, "Expanded")
            if let chartID { XCTAssertTrue(element(chartID).waitForExistence(timeout: 5), chartID) }
            reveal(element(toggleID))
            element(toggleID).tap()
            waitForValue(toggleID, "Collapsed")
        }
    }

    /// The DEXA chart must never trap page scrolling: a tap selects, a
    /// horizontal pan scrubs, and a vertical swipe that starts on the chart
    /// scrolls the page.
    func testDEXAChartTapScrubAndVerticalScroll() {
        open(stream: "dexa")
        let chart = element("dexa.chart.Body Fat %")
        reveal(chart)
        // Bring the chart to mid-screen so both drags start on it.
        for _ in 0..<4 where chart.frame.midY > app.frame.height * 0.55 { app.swipeUp(velocity: .slow) }
        let initial = chart.value as? String ?? ""
        XCTAssertFalse(initial.isEmpty)
        attach("1-default-latest-scan")

        chart.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)).tap()
        let afterTap = chart.value as? String ?? ""
        XCTAssertNotEqual(afterTap, initial, "Tap did not select another scan")
        attach("2-after-tap")

        chart.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5))
            .press(forDuration: 0, thenDragTo: chart.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)), withVelocity: .slow, thenHoldForDuration: 0.1)
        XCTAssertNotEqual(chart.value as? String ?? "", afterTap, "Horizontal scrub did not change the selection")
        attach("3-after-horizontal-scrub")

        let section = element("dexa.coreTrends")
        let top = section.frame.minY
        chart.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0, thenDragTo: chart.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: -2.5)), withVelocity: .fast, thenHoldForDuration: 0)
        XCTAssertLessThan(section.frame.minY, top - 100, "A vertical swipe starting on the DEXA chart did not scroll the page")
        attach("4-after-vertical-swipe-on-chart")
    }

    private func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "dexa-chart-\(name)"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
