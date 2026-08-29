import XCTest
@testable import PhysiqueOS

/// Guards the Stage 1 tab set against silent information-architecture
/// drift. `AppTab` encodes a product decision — the actual live web
/// bottom navigation (`src/fixtures/bottomNavigation.js`) — not an
/// implementation detail, so an accidental reorder, rename, or removal
/// here should fail a test rather than only be caught by eyeballing the
/// simulator.
final class AppTabTests: XCTestCase {
    func testFiveTabsInEstablishedOrder() {
        XCTAssertEqual(
            AppTab.allCases.map(\.title),
            ["Home", "Goals", "Log", "Evidence", "You"]
        )
    }

    /// Log is the center tab of five — a deliberate product requirement,
    /// not incidental to whatever order the cases happen to be declared in.
    func testLogIsTheCenterTab() {
        XCTAssertEqual(AppTab.allCases.count, 5)
        XCTAssertEqual(AppTab.allCases[2], .log)
    }

    func testEveryTabHasAStableIdentityAndSystemImage() {
        for tab in AppTab.allCases {
            XCTAssertEqual(tab.id, tab.rawValue)
            XCTAssertFalse(tab.systemImageName.isEmpty)
        }
    }

    /// The prior foundation slice's Progress/Coach/Profile root tabs were a
    /// stale information architecture the web does not have — guards
    /// against that structure silently reappearing (e.g. a bad merge or a
    /// future slice reintroducing the old planning-doc set).
    func testOldRootTabStructureCannotReturnSilently() {
        let titles = Set(AppTab.allCases.map(\.title))
        XCTAssertFalse(titles.contains("Progress"))
        XCTAssertFalse(titles.contains("Coach"))
        XCTAssertFalse(titles.contains("Profile"))
        XCTAssertNil(AppTab(rawValue: "progress"))
        XCTAssertNil(AppTab(rawValue: "coach"))
        XCTAssertNil(AppTab(rawValue: "profile"))
    }

    /// The Evidence tab's underlying route/icon key is `"progress"` (its
    /// href is `/progress`, the Evidence Hub page) and You's is
    /// `"profile"` — both differ from their tab label, mirroring
    /// `bottomNavigation.js` exactly.
    func testServerRouteKeysMatchTheWebFixtureNotTheTabLabel() {
        XCTAssertEqual(AppTab.evidence.serverRouteKey, "progress")
        XCTAssertEqual(AppTab.you.serverRouteKey, "profile")
        XCTAssertEqual(AppTab.home.serverRouteKey, "home")
        XCTAssertEqual(AppTab.goals.serverRouteKey, "goals")
        XCTAssertEqual(AppTab.log.serverRouteKey, "log")
    }
}
