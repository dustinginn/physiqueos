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
}
