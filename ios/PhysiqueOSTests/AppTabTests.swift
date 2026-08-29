import XCTest
@testable import PhysiqueOS

/// Guards the Stage 1 tab set against silent information-architecture
/// drift. `AppTab` encodes a product decision (docs/INFORMATION_ARCHITECTURE.md),
/// not an implementation detail, so an accidental reorder, rename, or
/// removal here should fail a test rather than only be caught by
/// eyeballing the simulator.
final class AppTabTests: XCTestCase {
    func testFiveTabsInEstablishedOrder() {
        XCTAssertEqual(
            AppTab.allCases.map(\.title),
            ["Home", "Log", "Progress", "Coach", "Profile"]
        )
    }

    func testEveryTabHasAStableIdentityAndSystemImage() {
        for tab in AppTab.allCases {
            XCTAssertEqual(tab.id, tab.rawValue)
            XCTAssertFalse(tab.systemImageName.isEmpty)
        }
    }
}
