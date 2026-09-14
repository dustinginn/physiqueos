import XCTest
@testable import PhysiqueOS

final class PriorityNotificationSchedulerTests: XCTestCase {
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    // MARK: - Identifiers

    func testIdentifiersAreStableAndDistinctFromSnoozeIdentifiers() {
        let scheduled = PriorityNotificationScheduler.identifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        let snoozed = PriorityNotificationScheduler.snoozeIdentifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        XCTAssertNotEqual(scheduled, snoozed)
        // Stable: calling again with the same inputs produces the exact same
        // identifier, so `add()` naturally replaces rather than duplicates.
        XCTAssertEqual(scheduled, PriorityNotificationScheduler.identifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13"))
    }

    // MARK: - fireDate: this is the whole point of the canonical-schedule
    // invariant — Native derives the actual notification instant purely
    // from the server's own `scheduledTime` + `occurrenceDate` strings, with
    // no separate Native-side schedule configuration to keep in sync.

    func testFireDateCombinesCanonicalOccurrenceDateAndScheduledTime() throws {
        let date = PriorityNotificationScheduler.fireDate("07:00", occurrenceDate: "2026-09-13", calendar: utc)
        let components = utc.dateComponents([.year, .month, .day, .hour, .minute], from: try XCTUnwrap(date))
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 9)
        XCTAssertEqual(components.day, 13)
        XCTAssertEqual(components.hour, 7)
        XCTAssertEqual(components.minute, 0)
    }

    func testFireDateChangesWhenTheCanonicalScheduledTimeChanges() throws {
        // Proves the propagation the Founder asked to see tested: the ONLY
        // input that changed here is the canonical scheduled time string —
        // exactly what a Foam Rolling schedule edit would change server-side.
        let morning = PriorityNotificationScheduler.fireDate("07:00", occurrenceDate: "2026-09-13", calendar: utc)
        let evening = PriorityNotificationScheduler.fireDate("18:45", occurrenceDate: "2026-09-13", calendar: utc)
        XCTAssertNotEqual(morning, evening)
        XCTAssertEqual(utc.component(.hour, from: try XCTUnwrap(evening)), 18)
        XCTAssertEqual(utc.component(.minute, from: try XCTUnwrap(evening)), 45)
    }

    func testFireDateRejectsMalformedInputRatherThanGuessing() {
        XCTAssertNil(PriorityNotificationScheduler.fireDate("morning", occurrenceDate: "2026-09-13", calendar: utc))
        XCTAssertNil(PriorityNotificationScheduler.fireDate("07:00", occurrenceDate: "not-a-date", calendar: utc))
        XCTAssertNil(PriorityNotificationScheduler.fireDate("", occurrenceDate: "2026-09-13", calendar: utc))
    }

    // MARK: - Wire decoding of the server's notificationAction contract

    func testDecodesDirectCompletionAllowedWithCompletionCommand() throws {
        let json = #"""
        {
          "classification": "direct_completion_allowed",
          "scheduledTime": "07:00",
          "completionCommand": {
            "commandType": "priority.complete.v1",
            "expectedVersion": 3,
            "payload": { "priorityId": "reminder_foam_roll", "occurrenceDate": "2026-09-13" }
          }
        }
        """#
        let action = try JSONDecoder().decode(PriorityNotificationAction.self, from: try XCTUnwrap(json.data(using: .utf8)))
        XCTAssertEqual(action.classification, .directCompletionAllowed)
        XCTAssertEqual(action.scheduledTime, "07:00")
        XCTAssertEqual(action.completionCommand?.commandType, "priority.complete.v1")
        XCTAssertEqual(action.completionCommand?.expectedVersion, 3)
        XCTAssertEqual(action.completionCommand?.payload.priorityId, "reminder_foam_roll")
        XCTAssertEqual(action.completionCommand?.payload.occurrenceDate, "2026-09-13")
    }

    func testDecodesSpecializedAndOpenOnlyWithoutACompletionCommand() throws {
        let specializedJSON = #"{"classification":"specialized_workflow_required","scheduledTime":"07:00","completionCommand":null}"#
        let specialized = try JSONDecoder().decode(PriorityNotificationAction.self, from: try XCTUnwrap(specializedJSON.data(using: .utf8)))
        XCTAssertEqual(specialized.classification, .specializedWorkflowRequired)
        XCTAssertNil(specialized.completionCommand)

        let openOnlyJSON = #"{"classification":"open_only","scheduledTime":null,"completionCommand":null}"#
        let openOnly = try JSONDecoder().decode(PriorityNotificationAction.self, from: try XCTUnwrap(openOnlyJSON.data(using: .utf8)))
        XCTAssertEqual(openOnly.classification, .openOnly)
        XCTAssertNil(openOnly.scheduledTime)
        XCTAssertNil(openOnly.completionCommand)
    }

    // MARK: - reconciliationPlan: the schedule-change acceptance requirement.
    // `sync` needs a live, AUTHORIZED UNUserNotificationCenter — authorization
    // can't be granted programmatically in a test — so the actual decision
    // logic is factored out as this pure function specifically so this
    // invariant is provable without one.

    func testCanonicalScheduleChangeReplacesRatherThanDuplicatesTheReminder() throws {
        // First sync: Foam Rolling is scheduled for 07:00, nothing pending yet.
        let morningItem = Self.foamRolling(scheduledTime: "07:00")
        let firstPlan = PriorityNotificationScheduler.reconciliationPlan(
            items: [morningItem], existingScheduledIdentifiers: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(firstPlan.toAdd.count, 1)
        XCTAssertTrue(firstPlan.toRemove.isEmpty)
        let scheduledIdentifier = try XCTUnwrap(firstPlan.toAdd.first?.identifier)
        XCTAssertEqual(try Self.fireHourMinute(firstPlan.toAdd[0], calendar: utc), [7, 0])

        // The canonical schedule changes server-side (07:00 -> 18:45) — the
        // ONLY input that's different is the item's own scheduledTime.
        // `existingScheduledIdentifiers` reflects what's ACTUALLY pending
        // after the first sync applied `firstPlan.toAdd`.
        let eveningItem = Self.foamRolling(scheduledTime: "18:45")
        let secondPlan = PriorityNotificationScheduler.reconciliationPlan(
            items: [eveningItem], existingScheduledIdentifiers: [scheduledIdentifier], now: Self.referenceNow, calendar: utc
        )

        // The identifier is IDENTICAL — this is what makes `add()`'s
        // documented same-identifier-replaces behavior sufficient: applying
        // `secondPlan.toAdd` to a live center overwrites the 07:00 request
        // in place. There is no moment where both a 07:00 and an 18:45
        // request are simultaneously pending.
        XCTAssertEqual(secondPlan.toAdd.count, 1)
        XCTAssertEqual(secondPlan.toAdd.first?.identifier, scheduledIdentifier)
        XCTAssertEqual(try Self.fireHourMinute(secondPlan.toAdd[0], calendar: utc), [18, 45])
        // And nothing needs an explicit removal for this case — the
        // identifier is still desired, just with fresh content/trigger.
        XCTAssertTrue(secondPlan.toRemove.isEmpty)
    }

    func testCompletingAPriorityCancelsItsScheduledAndSnoozedNotificationsEvenIfNeverPreviouslyTrackedAsPending() {
        let identifier = PriorityNotificationScheduler.identifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        let snoozeIdentifier = PriorityNotificationScheduler.snoozeIdentifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13")
        let completedItem = Self.foamRolling(scheduledTime: "07:00", completed: true)

        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [completedItem], existingScheduledIdentifiers: [identifier], now: Self.referenceNow, calendar: utc
        )
        XCTAssertTrue(plan.toAdd.isEmpty)
        XCTAssertTrue(plan.toRemove.contains(identifier))
        XCTAssertTrue(plan.toRemove.contains(snoozeIdentifier))
    }

    func testAPriorityNoLongerPresentIsTreatedAsStaleAndCancelled() {
        let staleIdentifier = PriorityNotificationScheduler.identifier(priorityId: "reminder_old", occurrenceDate: "2026-09-13")
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [], existingScheduledIdentifiers: [staleIdentifier], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(plan.toRemove, [staleIdentifier])
    }

    // MARK: - Fixtures

    private static let referenceNow = ISO8601DateFormatter().date(from: "2026-09-13T05:00:00Z")!

    private static func foamRolling(scheduledTime: String, completed: Bool = false) -> PriorityOccurrence {
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

    private static func fireHourMinute(_ request: UNNotificationRequest, calendar: Calendar) throws -> [Int] {
        let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger)
        let date = try XCTUnwrap(calendar.date(from: trigger.dateComponents))
        return [calendar.component(.hour, from: date), calendar.component(.minute, from: date)]
    }
}
