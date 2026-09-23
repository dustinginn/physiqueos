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

    // MARK: - resolvedBounds: the exact seam that pins the Nutrition regression class

    /// `resolvedBounds` is what both `executeActivitySummary` and
    /// `executeNutritionDailyTotal` now call in the exact position where
    /// `executeNutritionDailyTotal` used to `guard let bounds else { throw
    /// .operational(code: "healthkit_nutrition_bounds_required") }`. It is
    /// non-optional and non-throwing by construction, so calling it with
    /// `requested: nil` -- exactly what `HealthKitSynchronizationEngine.
    /// synchronize` always passes -- can never reproduce that regression
    /// through this call site: reintroducing a "bounds required" throw
    /// would require adding a brand new guard/throw at the call site, not
    /// merely deleting a fallback.
    func testResolvedBoundsNeverRequiresExplicitBoundsForEitherDailyAggregateStream() {
        let calendar = utcCalendar()
        let now = ISO8601DateFormatter().date(from: "2026-09-22T18:20:00Z")!
        let bounds = SystemHealthKitQueryClient.resolvedBounds(requested: nil, from: now, lookbackDays: 30, calendar: calendar)

        XCTAssertEqual(bounds.endLocalDate, "2026-09-22")
        XCTAssertTrue(bounds.contains(localDate: "2026-09-22"))
    }

    /// The canary/canonical-test-day paths always pass explicit bounds, and
    /// those must win over the default lookback window unchanged.
    func testResolvedBoundsPrefersExplicitBoundsWhenGiven() {
        let calendar = utcCalendar()
        let now = ISO8601DateFormatter().date(from: "2026-09-22T18:20:00Z")!
        let explicit = HealthKitQueryBounds(
            startDateInclusive: ISO8601DateFormatter().date(from: "2026-09-01T00:00:00Z")!,
            endDateExclusive: ISO8601DateFormatter().date(from: "2026-09-02T00:00:00Z")!,
            startLocalDate: "2026-09-01",
            endLocalDate: "2026-09-01",
            timeZoneIdentifier: "UTC"
        )
        let bounds = SystemHealthKitQueryClient.resolvedBounds(requested: explicit, from: now, lookbackDays: 30, calendar: calendar)

        XCTAssertEqual(bounds, explicit)
    }

    // MARK: - samplePredicateDecision: the Workout activation floor seam

    private func explicitBounds() -> HealthKitQueryBounds {
        HealthKitQueryBounds(
            startDateInclusive: ISO8601DateFormatter().date(from: "2026-09-11T07:00:00Z")!,
            endDateExclusive: ISO8601DateFormatter().date(from: "2026-09-12T07:00:00Z")!,
            startLocalDate: "2026-09-11",
            endLocalDate: "2026-09-11",
            timeZoneIdentifier: "America/Los_Angeles"
        )
    }

    /// The automatic path (`bounds: nil`) on the Workout stream with a
    /// configured floor is the ONE case that gets the floor predicate --
    /// the first anchor-less run would otherwise sweep all workout history.
    func testFloorAppliesOnlyToWorkoutsWithNilBounds() {
        let floor = ISO8601DateFormatter().date(from: "2026-09-23T07:00:00Z")!
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .workouts, requested: nil, workoutFloor: floor),
            .workoutFloor(floor)
        )
        for other in [HealthKitSynchronizationStream.heartRate, .activeEnergy, .sleepAnalysis, .stepCount] {
            XCTAssertEqual(
                SystemHealthKitQueryClient.samplePredicateDecision(stream: other, requested: nil, workoutFloor: floor),
                .unbounded,
                "\(other)"
            )
        }
    }

    /// The Founder's exact-day Workout canary always passes explicit bounds,
    /// and those must win over the floor exactly as before Build 54.
    func testExplicitBoundsWinOverTheFloor() {
        let floor = ISO8601DateFormatter().date(from: "2026-09-23T07:00:00Z")!
        let explicit = explicitBounds()
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .workouts, requested: explicit, workoutFloor: floor),
            .explicit(explicit)
        )
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .heartRate, requested: explicit, workoutFloor: nil),
            .explicit(explicit)
        )
    }

    /// A client constructed without a floor (every test, and any caller that
    /// does not opt in) is byte-for-byte the pre-Build-54 anchor-only query.
    func testNilFloorLeavesTheWorkoutStreamUnbounded() {
        XCTAssertEqual(
            SystemHealthKitQueryClient.samplePredicateDecision(stream: .workouts, requested: nil, workoutFloor: nil),
            .unbounded
        )
    }

    /// The decision-to-predicate mapping: no predicate for the unbounded
    /// case (anchor only), a real `NSPredicate` for both bounded cases.
    /// `HKQuery.predicateForSamples` is a pure class method (no
    /// `HKHealthStore`), so this is safe to exercise directly.
    func testUnboundedDecisionYieldsNoPredicateAndBoundedDecisionsYieldOne() {
        let floor = ISO8601DateFormatter().date(from: "2026-09-23T07:00:00Z")!
        XCTAssertNil(SystemHealthKitQueryClient.samplePredicate(for: .unbounded))
        XCTAssertNotNil(SystemHealthKitQueryClient.samplePredicate(for: .workoutFloor(floor)))
        XCTAssertNotNil(SystemHealthKitQueryClient.samplePredicate(for: .explicit(explicitBounds())))
    }

    /// The floor predicate is END-date semantics on purpose (`.strictEndDate`
    /// with no upper bound): a session that started before the floor and
    /// ended after it must still be delivered, and the Server decides its
    /// local day. A regression to `.strictStartDate` (or to the overlap
    /// default, which also mentions `startDate` once an upper bound exists)
    /// changes the `predicateFormat` and fails here.
    func testWorkoutFloorPredicateBoundsByEndDateOnlyNeverStartDate() throws {
        let floor = ISO8601DateFormatter().date(from: "2026-09-23T07:00:00Z")!
        let predicate = try XCTUnwrap(SystemHealthKitQueryClient.samplePredicate(for: .workoutFloor(floor)))
        let format = predicate.predicateFormat
        XCTAssertTrue(format.contains("endDate"), format)
        XCTAssertFalse(format.contains("startDate"), format)
        XCTAssertTrue(format.contains(">="), format)
        XCTAssertTrue(format.contains(String(format: "%.6f", floor.timeIntervalSinceReferenceDate)), format)
    }

    /// The canary's explicit bounds keep their pre-Build-54 shape exactly:
    /// `.strictStartDate` over `[startDateInclusive, endDateExclusive)`,
    /// i.e. both operands are on `startDate`.
    func testExplicitBoundsPredicateKeepsStartDateSemantics() throws {
        let bounds = explicitBounds()
        let predicate = try XCTUnwrap(SystemHealthKitQueryClient.samplePredicate(for: .explicit(bounds)))
        let format = predicate.predicateFormat
        XCTAssertTrue(format.contains("startDate >="), format)
        XCTAssertTrue(format.contains("startDate <"), format)
        XCTAssertFalse(format.contains("endDate"), format)
        XCTAssertTrue(format.contains(String(format: "%.6f", bounds.startDateInclusive.timeIntervalSinceReferenceDate)), format)
        XCTAssertTrue(format.contains(String(format: "%.6f", bounds.endDateExclusive.timeIntervalSinceReferenceDate)), format)
    }
}
