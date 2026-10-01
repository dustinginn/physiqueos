import XCTest
@testable import PhysiqueOS

/// Covers `PriorityOccurrenceCalculator.scheduleApplies`'s `startDate`
/// eligibility gate directly — part of the Build 32 notification-delivery
/// investigation's checklist ("whether the reminder start-date change to
/// today affects eligibility", "whether the original start date would
/// actually have been valid already"). This mirrors the server's own
/// `scheduleAppliesOnDate`; Native's live production Home path consumes
/// server-computed occurrences directly rather than re-deriving them, so
/// this is a fixture/sandbox-path correctness guard, not a live-path one —
/// but a daily reminder whose `startDate` sits in the past (the common,
/// steady-state case) or exactly on today (the day a schedule first takes
/// effect) must both still be eligible today, or Home would stop surfacing
/// it entirely.
final class PriorityOccurrenceCalculatorTests: XCTestCase {
    private static let dailyCadence = ExecutionCadence(type: .daily)

    func testStartDateInThePastLeavesADailyReminderEligibleToday() {
        let schedule = ExecutionSchedule(daysOfWeek: [], startDate: "2026-07-23")
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: schedule, cadence: Self.dailyCadence, localDate: "2026-09-14"))
    }

    func testStartDateOfTodayIsEligibleTheSameDay() {
        let schedule = ExecutionSchedule(daysOfWeek: [], startDate: "2026-09-14")
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: schedule, cadence: Self.dailyCadence, localDate: "2026-09-14"))
    }

    func testStartDateInTheFutureIsNotYetEligible() {
        let schedule = ExecutionSchedule(daysOfWeek: [], startDate: "2026-09-15")
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: schedule, cadence: Self.dailyCadence, localDate: "2026-09-14"))
    }

    func testNoStartDateAtAllIsAlwaysEligible() {
        let schedule = ExecutionSchedule(daysOfWeek: [])
        XCTAssertTrue(PriorityOccurrenceCalculator.scheduleApplies(schedule: schedule, cadence: Self.dailyCadence, localDate: "2026-09-14"))
    }

    func testEndDateInThePastMakesAPreviouslyValidScheduleIneligible() {
        let schedule = ExecutionSchedule(daysOfWeek: [], startDate: "2026-07-23", endDate: "2026-09-01")
        XCTAssertFalse(PriorityOccurrenceCalculator.scheduleApplies(schedule: schedule, cadence: Self.dailyCadence, localDate: "2026-09-14"))
    }
}
