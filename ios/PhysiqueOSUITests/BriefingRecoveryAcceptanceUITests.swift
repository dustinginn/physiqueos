import XCTest

/// Real-Simulator acceptance for the Recovery card on the shipping Weekly
/// and Monthly Briefing screens. The DEBUG review overlay supplies a
/// SYNTHETIC, production-shaped `recovery_card_v1` payload that runs through
/// the real decoder; the screens, section order and card are the shipping
/// SwiftUI implementation. No Founder Sleep data.
@MainActor
final class BriefingRecoveryAcceptanceUITests: XCTestCase {
    private let app = XCUIApplication()
    private let weeklyId = "weekly_briefing_2026-08-23_2026-08-29"
    private let monthlyId = "monthly_briefing_2026-08"

    override func setUp() async throws {
        continueAfterFailure = false
    }

    func testWeeklyCardSitsBetweenTrainingAndCoachsTakeForEveryStatus() {
        for (scenario, label) in [("green", "Green"), ("yellow", "Yellow"), ("red", "Red"), ("unavailable", "Not enough data")] {
            launch(briefing: weeklyId, scenario: scenario, appearance: scenario == "yellow" ? "light" : "dark")
            let order = appearanceOrder(["text:Training Response", "briefing.recovery.status", "text:COACH'S TAKE"])
            XCTAssertEqual(order, ["text:Training Response", "briefing.recovery.status", "text:COACH'S TAKE"], "\(scenario): Training → Recovery → Coach's Take")
            scroll(to: "briefing.recovery.status")
            XCTAssertEqual(element("briefing.recovery.status").label, "Recovery status: \(label)")
            scroll(to: "briefing.recovery.caveat")
            XCTAssertEqual(element("briefing.recovery.commentary").exists, scenario == "yellow" || scenario == "red", "\(scenario): commentary is Yellow/Red only")
            XCTAssertEqual(element("briefing.recovery.chart").exists, scenario != "unavailable")
            XCTAssertEqual(element("briefing.recovery.unavailable").exists, scenario == "unavailable")
            XCTAssertFalse(element("briefing.recovery.foam").exists, "unavailable foam authority hides the row")
            XCTAssertFalse(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] '_unavailable' OR label CONTAINS[c] 'score'")).firstMatch.exists, "no diagnostic codes or score copy")
        }
    }

    func testWeeklyChartAndFoamAreAccessible() {
        launch(briefing: weeklyId, scenario: "foam", appearance: "dark")
        scroll(to: "briefing.recovery.average")
        XCTAssertTrue(element("briefing.recovery.average").label.hasPrefix("Period average"))
        scroll(to: "briefing.recovery.foam")
        XCTAssertTrue(element("briefing.recovery.chart").label.hasPrefix("Weekly Sleep trend: Sunday"))
        XCTAssertTrue(element("briefing.recovery.chart").label.contains("Personal baseline 6 hours 45 minutes"))
        XCTAssertTrue(element("briefing.recovery.foam").exists)
    }

    func testMonthlyCardSitsBetweenEnergyAndNewBaselineWithWeeklyAggregates() {
        launch(briefing: monthlyId, scenario: "yellow", appearance: "dark")
        let order = appearanceOrder(["text:Energy Evolution", "briefing.recovery.status", "text:New Baseline"])
        XCTAssertEqual(Array(order.prefix(2)), ["text:Energy Evolution", "briefing.recovery.status"], "Energy → Recovery")
        if order.contains("text:New Baseline") {
            XCTAssertEqual(order.last, "text:New Baseline", "Recovery → New Baseline")
        }
        launch(briefing: monthlyId, scenario: "yellow", appearance: "dark")
        scroll(to: "briefing.recovery.average")
        XCTAssertTrue(element("briefing.recovery.average").label.hasPrefix("Month average"))
        scroll(to: "briefing.recovery.chart")
        XCTAssertTrue(element("briefing.recovery.chart").label.hasPrefix("Monthly Sleep trend by week: Week 1"))
    }

    func testNoRecoveryAnywhereWithoutAPublishedCard() {
        for scenario in [nil, "malformed"] {
            launch(briefing: weeklyId, scenario: scenario, appearance: "dark")
            let order = appearanceOrder(["text:Training Response", "briefing.recovery.status", "text:COACH'S TAKE"], forbidden: ["Recovery"])
            XCTAssertEqual(order, ["text:Training Response", "text:COACH'S TAKE"], "\(scenario ?? "absent"): no section, header or placeholder; the Briefing still renders")
        }
    }

    func testMidweekDEXAAndPhotoNeverRenderRecoveryEvenWhenInjected() {
        for briefing in ["midweek_briefing_2026-09-06_2026-09-08", "dexa_event_dexa-fixture-005", "event_briefing_progress_photo_photo-set-fixture-005"] {
            launch(briefing: briefing, scenario: "red", appearance: "dark")
            XCTAssertTrue(element("briefing.nav.history").waitForExistence(timeout: 8), briefing)
            let seen = appearanceOrder(["briefing.recovery.status", "briefing.recovery.average", "briefing.recovery.chart"], forbidden: ["Recovery"])
            XCTAssertEqual(seen, [], "\(briefing) rendered Recovery UI")
        }
    }

    /// Code-acceptance captures of the real shipping card (synthetic data).
    func testCaptureWeeklyAndMonthlyCardsInDarkAndMineralLight() {
        for appearance in ["dark", "light"] {
            for (briefing, scenario, name) in [(weeklyId, "green", "weekly-green"), (weeklyId, "yellow", "weekly-yellow"), (weeklyId, "red", "weekly-red"), (weeklyId, "unavailable", "weekly-not-enough-data"), (monthlyId, "yellow", "monthly-yellow"), (monthlyId, "green", "monthly-green")] {
                launch(briefing: briefing, scenario: scenario, appearance: appearance)
                scroll(to: "briefing.recovery.status")
                bringToTop(element("briefing.recovery.status"))
                capture("recovery-\(name)-\(appearance == "light" ? "mineral-light" : "dark")")
            }
        }
    }

    // MARK: Helpers

    private func launch(briefing: String, scenario: String?, appearance: String) {
        app.terminate()
        app.launchArguments = [
            "-physiqueos.native.authority-selection.v1", "sandbox",
            "-physiqueos.appearance.preference.v1", appearance,
            "-physiqueos.appearance-review.route", "briefing:\(briefing)",
        ] + (scenario.map { ["-physiqueos.recovery-review.scenario", $0] } ?? [])
        app.launch()
    }

    /// `text:<label>` matches a static text by label (case-insensitive);
    /// anything else is an accessibility identifier.
    private func element(_ key: String) -> XCUIElement {
        if key.hasPrefix("text:") {
            return app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", String(key.dropFirst(5)))).firstMatch
        }
        return app.descendants(matching: .any)[key]
    }

    /// SwiftUI exposes only on-screen scroll content to accessibility, so
    /// walk the page in short drags and record the order identifiers first
    /// appear (a `forbidden` static text appearing is recorded too).
    private func appearanceOrder(_ identifiers: [String], forbidden: [String] = []) -> [String] {
        XCTAssertTrue(element("briefing.nav.history").waitForExistence(timeout: 8))
        var order: [String] = []
        var previousTop: CGFloat?
        for _ in 0..<40 {
            for identifier in identifiers where !order.contains(identifier) && element(identifier).exists {
                order.append(identifier)
            }
            for text in forbidden where element("text:\(text)").exists && !order.contains(text) {
                order.append(text)
            }
            if forbidden.isEmpty, order.count == identifiers.count { break }
            let probe = app.descendants(matching: .any).matching(NSPredicate(format: "identifier BEGINSWITH 'briefing.'")).firstMatch
            let top = probe.exists ? probe.frame.minY : nil
            // The page stopped moving: its end is reached.
            if let previousTop, let top, abs(previousTop - top) < 1 { break }
            previousTop = top
            drag(by: 0.35)
        }
        return order
    }

    private func scroll(to identifier: String) {
        for _ in 0..<30 where !(element(identifier).exists && element(identifier).isHittable) {
            drag(by: 0.3)
        }
        XCTAssertTrue(element(identifier).exists, "\(identifier) never appeared")
    }

    private func drag(by fraction: CGFloat) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -app.frame.height * fraction)))
    }

    /// Scrolls until the section's top sits just below the status bar.
    private func bringToTop(_ section: XCUIElement) {
        // `section` is the status row; the card head sits ~150 pt above it.
        for _ in 0..<14 {
            let offset = section.frame.minY - 330
            if abs(offset) < 40 { break }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: offset > 0 ? 0.8 : 0.3))
            let distance = max(min(offset, app.frame.height * 0.5), -app.frame.height * 0.4)
            start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -distance)))
        }
    }

    private func capture(_ name: String) {
        Thread.sleep(forTimeInterval: 0.8)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let directory = ProcessInfo.processInfo.environment["RECOVERY_SCREENSHOT_DIR"], !directory.isEmpty else { return }
        try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent("\(name).png"))
    }
}
