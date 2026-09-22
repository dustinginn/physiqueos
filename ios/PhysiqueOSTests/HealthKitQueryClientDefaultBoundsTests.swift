import Foundation
import XCTest
@testable import PhysiqueOS

/// `SystemHealthKitQueryClient.defaultLookbackBounds` is the fix for a real
/// Build 51 production regression: the general incremental sync path
/// (`HealthKitSynchronizationEngine.synchronize`) always calls
/// `execute(..., bounds: nil)`, and `executeNutritionDailyTotal` used to
/// throw `healthkit_nutrition_bounds_required` whenever `bounds` was nil --
/// meaning automatic Nutrition catch-up unconditionally failed on every
/// single foreground. `executeActivitySummary` already self-computed a
/// default window; Nutrition did not. This tests the now-shared helper
/// directly (pure, no `HKHealthStore` involved) rather than the HealthKit-
/// dependent query methods themselves, which cannot run in CI.
final class HealthKitQueryClientDefaultBoundsTests: XCTestCase {
    private func utcCalendar() -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    func testDefaultBoundsAlwaysIncludesToday() {
        let calendar = utcCalendar()
        let now = ISO8601DateFormatter().date(from: "2026-09-22T18:20:00Z")!
        let bounds = SystemHealthKitQueryClient.defaultLookbackBounds(from: now, lookbackDays: 30, calendar: calendar)

        XCTAssertEqual(bounds.endLocalDate, "2026-09-22")
        XCTAssertTrue(bounds.contains(localDate: "2026-09-22"))
    }

    func testDefaultBoundsSpansExactlyTheRequestedLookbackWindow() {
        let calendar = utcCalendar()
        let now = ISO8601DateFormatter().date(from: "2026-09-22T00:00:00Z")!
        let bounds = SystemHealthKitQueryClient.defaultLookbackBounds(from: now, lookbackDays: 5, calendar: calendar)

        // 5 days back from Sep 22 inclusive of both ends is Sep 17...Sep 22.
        XCTAssertEqual(bounds.startLocalDate, "2026-09-17")
        XCTAssertEqual(bounds.endLocalDate, "2026-09-22")
        XCTAssertTrue(bounds.contains(localDate: "2026-09-17"))
        XCTAssertTrue(bounds.contains(localDate: "2026-09-22"))
        XCTAssertFalse(bounds.contains(localDate: "2026-09-16"))
        XCTAssertFalse(bounds.contains(localDate: "2026-09-23"))
    }

    /// `endDateExclusive` must be the START of the day AFTER today, not
    /// today's start -- otherwise a bounded HealthKit query built from these
    /// bounds would exclude today's own samples entirely.
    func testEndDateExclusiveIsTheStartOfTheDayAfterToday() {
        let calendar = utcCalendar()
        let now = ISO8601DateFormatter().date(from: "2026-09-22T14:21:57Z")!
        let bounds = SystemHealthKitQueryClient.defaultLookbackBounds(from: now, lookbackDays: 1, calendar: calendar)

        let expectedEnd = ISO8601DateFormatter().date(from: "2026-09-23T00:00:00Z")!
        XCTAssertEqual(bounds.endDateExclusive, expectedEnd)
    }

    func testZeroLookbackDaysStillIncludesOnlyToday() {
        let calendar = utcCalendar()
        let now = ISO8601DateFormatter().date(from: "2026-09-22T09:00:00Z")!
        let bounds = SystemHealthKitQueryClient.defaultLookbackBounds(from: now, lookbackDays: 0, calendar: calendar)

        XCTAssertEqual(bounds.startLocalDate, "2026-09-22")
        XCTAssertEqual(bounds.endLocalDate, "2026-09-22")
    }
}
