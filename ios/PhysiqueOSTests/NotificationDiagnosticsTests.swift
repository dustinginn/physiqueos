import XCTest
@testable import PhysiqueOS

/// Covers `NotificationDiagnostics`'s pure classification/description logic
/// directly — the part of the Build 32 investigation's diagnostic
/// requirement that's testable without a live `UNUserNotificationCenter`
/// (unlike `makeReport` itself, which reads the live center's actual
/// pending state and can't be exercised end-to-end in a test). Proves the
/// tool would correctly answer "why didn't this fire" for the exact defect
/// class this investigation found: a `notificationAction.scheduledTime`
/// that resolved to nil server-side.
final class NotificationDiagnosticsTests: XCTestCase {
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private static let referenceNow = ISO8601DateFormatter().date(from: "2026-09-13T05:00:00Z")!

    // MARK: - itemOutcome classification

    func testNilScheduledTimeIsClassifiedAsSkipWithAnExplicitReason() {
        let item = Self.item(scheduledTime: nil)
        let outcome = NotificationDiagnostics.itemOutcome(
            item: item, existingScheduledIds: [], planAddedIds: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(outcome.outcome, .skip)
        XCTAssertTrue(
            outcome.reason.contains("did not resolve a scheduledTime"),
            "Expected the reason to name the exact failed condition, got: \(outcome.reason)"
        )
        XCTAssertNil(outcome.canonicalScheduledTime)
    }

    func testEligibleNewItemIsClassifiedAsCreate() {
        let item = Self.item(scheduledTime: "07:00")
        let scheduledId = PriorityNotificationScheduler.identifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        let outcome = NotificationDiagnostics.itemOutcome(
            item: item, existingScheduledIds: [], planAddedIds: [scheduledId], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(outcome.outcome, .create)
        XCTAssertEqual(outcome.canonicalScheduledTime, "07:00")
    }

    func testEligibleItemAlreadyPendingIsClassifiedAsReplace() {
        let item = Self.item(scheduledTime: "18:45")
        let scheduledId = PriorityNotificationScheduler.identifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        let outcome = NotificationDiagnostics.itemOutcome(
            item: item, existingScheduledIds: [scheduledId], planAddedIds: [scheduledId], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(outcome.outcome, .replace)
    }

    func testCompletedItemStillPendingIsClassifiedAsRemove() {
        let item = Self.item(scheduledTime: "07:00", completed: true)
        let scheduledId = PriorityNotificationScheduler.identifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        let outcome = NotificationDiagnostics.itemOutcome(
            item: item, existingScheduledIds: [scheduledId], planAddedIds: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(outcome.outcome, .remove)
    }

    func testPastScheduledTimeIsClassifiedAsSkipNamingWhyNotJustUnexplained() {
        let item = Self.item(scheduledTime: "02:00")
        let outcome = NotificationDiagnostics.itemOutcome(
            item: item, existingScheduledIds: [], planAddedIds: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(outcome.outcome, .skip)
        XCTAssertTrue(outcome.reason.contains("not in the future"), "got: \(outcome.reason)")
    }

    // MARK: - Trigger description / nextTriggerDate resolution — proves
    // "physical-device pending request mapping/next trigger date logic" is
    // sound, independent of when the test happens to run.

    func testCalendarTriggerNextFireDateResolvesToTheExactRequestedInstant() throws {
        // A fixed, far-future date so this is never flaky regardless of
        // when the suite runs — the point under test is date-component
        // resolution, not proximity to "now". `timeZone` is set explicitly
        // (matching `PriorityNotificationScheduler.request`'s own fix) so
        // this resolves against UTC regardless of the test runner's own
        // system time zone — UNCalendarNotificationTrigger falls back to
        // Calendar.current for any DateComponents that don't carry one.
        var components = DateComponents()
        components.timeZone = utc.timeZone
        components.year = 2099
        components.month = 1
        components.day = 1
        components.hour = 8
        components.minute = 40
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let (description, nextFireDate) = NotificationDiagnostics.describe(trigger, calendar: utc)
        XCTAssertTrue(description.contains("hour:8"))
        XCTAssertTrue(description.contains("minute:40"))
        let resolved = try XCTUnwrap(nextFireDate)
        let resolvedComponents = utc.dateComponents([.year, .month, .day, .hour, .minute], from: resolved)
        XCTAssertEqual(resolvedComponents.year, 2099)
        XCTAssertEqual(resolvedComponents.month, 1)
        XCTAssertEqual(resolvedComponents.day, 1)
        XCTAssertEqual(resolvedComponents.hour, 8)
        XCTAssertEqual(resolvedComponents.minute, 40)
    }

    func testNoTriggerIsDescribedAsImmediateWithNoNextFireDate() {
        let (description, nextFireDate) = NotificationDiagnostics.describe(nil, calendar: utc)
        XCTAssertEqual(description, "immediate (no trigger)")
        XCTAssertNil(nextFireDate)
    }

    // MARK: - Fixtures

    private static func item(scheduledTime: String?, completed: Bool = false) -> PriorityOccurrence {
        PriorityOccurrence(
            id: "reminder_foam_roll",
            executionItemId: "reminder_foam_roll",
            date: "2026-09-13",
            title: "Foam Rolling",
            subtitle: "Evening",
            metadata: nil,
            changeLabel: nil,
            icon: .activity,
            color: .primary,
            urgency: .available,
            completed: completed,
            completable: true,
            expectedVersion: 3,
            actionLabel: nil,
            completionContext: nil,
            notificationAction: PriorityNotificationAction(
                classification: .directCompletionAllowed,
                scheduledTime: scheduledTime,
                completionCommand: PriorityNotificationCompletionCommand(
                    commandType: "priority.complete.v1",
                    expectedVersion: 3,
                    payload: PriorityNotificationCompletionPayload(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
                )
            )
        )
    }
}
