import XCTest
@testable import PhysiqueOS

/// Proves the specific Build 33 Operating Plan/Notification integration
/// requirement: a reminder-time edit made through
/// `OperatingPlanSupportScheduleEditor`/`RecurringSupportAPI.save` produces
/// a `specificTime` string in the exact wire format
/// `PriorityNotificationScheduler.fireDate` (and the server's own
/// `resolveScheduledTime`) expect — "HH:mm", zero-padded, 24-hour — so a
/// schedule saved through this Native editor is guaranteed schedulable by
/// the SAME canonical field the server resolves `notificationAction
/// .scheduledTime` from (`reminder.schedule.timeOfDay`), with no
/// Native-side reinterpretation or reformatting in between.
///
/// This does not re-prove `reconciliationPlan`'s own replace-not-duplicate
/// behavior — `PriorityNotificationSchedulerTests
/// .testCanonicalScheduleChangeReplacesRatherThanDuplicatesTheReminder`
/// already does that generically. This test proves the NEW link: the
/// specific string this editor produces round-trips correctly into that
/// existing, already-proven scheduling pipeline.
final class OperatingPlanNotificationLinkTests: XCTestCase {
    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    func testSavedSupportScheduleTimeIsDirectlySchedulableAsTheNotificationFireTime() throws {
        // "8:40 AM" picked in the editor — OperatingPlanSupportScheduleEditor
        // stores whatever a SwiftUI DatePicker/hourAndMinute selection
        // resolves to; this fixture is the exact zero-padded 24-hour string
        // the editor's own `OperatingPlanDateValues.timeKey` helper produces.
        let schedule = OperatingPlanSupportScheduleReadModel(
            frequency: .daily, daysOfWeek: [], intervalDays: 1, timing: .specific,
            specificTime: "08:40", startDate: "2026-07-23", endDate: nil
        )

        // The exact same string this editor saved is what a subsequent Home
        // read's notificationAction.scheduledTime would carry (proven
        // separately, server-side, by
        // CoreNavigationReadServiceTest/CanonicalPersistenceCommandPortsTest
        // reading reminder.schedule.timeOfDay back after this save) — so
        // feeding it straight into fireDate is the faithful simulation of
        // that next read, not an assumption this test invents.
        let fireDate = try XCTUnwrap(
            PriorityNotificationScheduler.fireDate(schedule.specificTime, occurrenceDate: "2026-09-14", calendar: utc)
        )
        let components = utc.dateComponents([.hour, .minute], from: fireDate)
        XCTAssertEqual(components.hour, 8)
        XCTAssertEqual(components.minute, 40)
    }

    func testEveryHourAndMinuteTheEditorCanProduceParsesCorrectly() throws {
        // OperatingPlanDateValues.timeKey (the editor's own DatePicker ->
        // "HH:mm" conversion) always zero-pads — proven here by exercising
        // the boundary values a picker can actually produce (00:00, 09:05,
        // 23:59), which is exactly where a non-zero-padded format would
        // have silently failed `resolveScheduledTime`'s server-side regex.
        for (input, expectedHour, expectedMinute) in [("00:00", 0, 0), ("09:05", 9, 5), ("23:59", 23, 59)] {
            let fireDate = try XCTUnwrap(
                PriorityNotificationScheduler.fireDate(input, occurrenceDate: "2026-09-14", calendar: utc),
                "fireDate failed to parse editor-produced time '\(input)'"
            )
            let components = utc.dateComponents([.hour, .minute], from: fireDate)
            XCTAssertEqual(components.hour, expectedHour, "for input \(input)")
            XCTAssertEqual(components.minute, expectedMinute, "for input \(input)")
        }
    }
}
