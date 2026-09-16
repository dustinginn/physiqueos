import XCTest
@testable import PhysiqueOS

final class PriorityNotificationSchedulerTests: XCTestCase {
    func testBriefingNotificationRequiresCanonicalPublishedCardAndDeepLinksToExactArtifact() throws {
        let card = HomeBriefingCard(
            id: "weekly_briefing_2026-09-13",
            sectionLabel: "Weekly Briefing",
            title: "Your Weekly Briefing is ready",
            prompt: "Review the published update.",
            createdAt: "2026-09-15T19:21:00.000Z",
            destination: .briefingDetail(briefingId: "weekly_briefing_2026-09-13")
        )
        let requests = BriefingReadyNotifier.requestsForNewPublications(cards: [card], observedIDs: [])
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(request.identifier, "briefing.ready.weekly_briefing_2026-09-13")
        XCTAssertEqual(request.content.categoryIdentifier, PriorityNotificationCategory.briefingReady)
        let destinationData = try XCTUnwrap(request.content.userInfo["destination"] as? Data)
        XCTAssertEqual(
            try JSONDecoder().decode(AppDestination.self, from: destinationData),
            .briefingDetail(briefingId: "weekly_briefing_2026-09-13")
        )
        XCTAssertTrue(BriefingReadyNotifier.requestsForNewPublications(
            cards: [card], observedIDs: [card.id]
        ).isEmpty)
    }

    func testIncidentRecoveryProjectionCreatesPacific1221RequestWithoutDirectCompletion() throws {
        // Raw owner/reminder timezone fields are absent/null on the server;
        // canonical resolution is Pacific. Native receives resolved HH:mm,
        // not those raw fields, and uses the device's Pacific calendar.
        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        var item = Self.foamRolling(scheduledTime: "12:21")
        item.id = "reminder_foam_roll_daily"
        item.executionItemId = "execution_foam_roll"
        item.date = "2026-09-15"
        item.notificationAction = try JSONDecoder().decode(PriorityNotificationAction.self, from: Data(#"{"classification":"specialized_workflow_required","workflow":"priority_detail","destination":{"priorityId":"reminder_foam_roll_daily","occurrenceDate":"2026-09-15"},"scheduledTime":"12:21","completionCommand":null,"nextDueAt":null}"#.utf8))
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-15T19:20:00Z"))
        let plan = PriorityNotificationScheduler.reconciliationPlan(items: [item], existingScheduledIdentifiers: [], now: now, calendar: pacific)
        XCTAssertEqual(plan.toAdd.count, 1)
        XCTAssertTrue(plan.toRemove.isEmpty)
        let request = try XCTUnwrap(plan.toAdd.first)
        XCTAssertEqual(request.identifier, "priority.scheduled.reminder_foam_roll_daily.2026-09-15")
        XCTAssertEqual(request.content.categoryIdentifier, PriorityNotificationCategory.specializedWorkflow)
        let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger)
        XCTAssertFalse(trigger.repeats)
        XCTAssertEqual(trigger.dateComponents.timeZone?.identifier, "America/Los_Angeles")
        XCTAssertEqual(pacific.date(from: trigger.dateComponents), ISO8601DateFormatter().date(from: "2026-09-15T19:21:00Z"))
        XCTAssertNil(item.notificationAction?.completionCommand)
    }
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

    func testDoseAwarePeptideUsesActionableSpecializedCategoryAndPreservesDoseContext() throws {
        let json = #"{"classification":"specialized_workflow_required","workflow":"peptide_protocol","scheduledTime":"21:45","completionCommand":{"commandType":"priority.complete.v1","expectedVersion":4,"payload":{"priorityId":"reminder_retatrutide","occurrenceDate":"2026-09-15","dose":"0.5 mg","protocolId":"protocol_retatrutide"}}}"#
        let action = try JSONDecoder().decode(PriorityNotificationAction.self, from: Data(json.utf8))
        var item = Self.foamRolling(scheduledTime: "21:45")
        item.id = "reminder_retatrutide"
        item.date = "2026-09-15"
        item.notificationAction = action
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-15T20:00:00Z"))
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [], now: now, calendar: utc
        )
        let request = try XCTUnwrap(plan.toAdd.first)
        XCTAssertEqual(request.content.categoryIdentifier, PriorityNotificationCategory.specializedActionable)
        XCTAssertTrue(request.content.body.contains("Scheduled dose 0.5 mg"))
        XCTAssertEqual(request.content.userInfo["payloadDose"] as? String, "0.5 mg")
        XCTAssertEqual(request.content.userInfo["payloadProtocolId"] as? String, "protocol_retatrutide")
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

    /// The Build 32 physical-device investigation's leading finding: the
    /// server's `resolveScheduledTime` can resolve to `null` for a
    /// `timeOfDay` value that still displays correctly elsewhere (an
    /// asymmetry proven separately against the server's own source). This
    /// proves the Native-side CONSEQUENCE of that in isolation: when
    /// `notificationAction.scheduledTime` is nil, no request is created —
    /// silently, with no error — reproducing "Home shows the correct time
    /// but no notification ever fires" exactly.
    func testNilCanonicalScheduledTimeSilentlySkipsSchedulingRatherThanGuessing() {
        let item = Self.foamRolling(scheduledTime: nil)
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertTrue(plan.toAdd.isEmpty)
        XCTAssertTrue(plan.toRemove.isEmpty)
    }

    func testSameDayFutureScheduledTimeCreatesARequest() {
        // referenceNow is 2026-09-13T05:00:00Z; 07:00 the same day is future.
        let item = Self.foamRolling(scheduledTime: "07:00")
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertEqual(plan.toAdd.count, 1)
    }

    func testSameDayPastScheduledTimeIsSkippedRatherThanFiringImmediately() {
        // referenceNow is 2026-09-13T05:00:00Z; 02:00 the same day already
        // passed — must not schedule a notification that would fire the
        // instant it's added (or not fire at all, depending on iOS's own
        // handling of a past trigger), and must not be silently treated as
        // "tomorrow" either.
        let item = Self.foamRolling(scheduledTime: "02:00")
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertTrue(plan.toAdd.isEmpty)
    }

    func testAuthorizationDeniedOrNotDeterminedPreventsScheduling() {
        XCTAssertFalse(PriorityNotificationScheduler.canSchedule(authorizationStatus: .denied))
        XCTAssertFalse(PriorityNotificationScheduler.canSchedule(authorizationStatus: .notDetermined))
    }

    func testAuthorizationGrantedOrProvisionalAllowsScheduling() {
        XCTAssertTrue(PriorityNotificationScheduler.canSchedule(authorizationStatus: .authorized))
        XCTAssertTrue(PriorityNotificationScheduler.canSchedule(authorizationStatus: .provisional))
    }

    /// Snooze and canonical requests must never be confused by cleanup: a
    /// snoozed identifier for an occurrence that's no longer in `items` at
    /// all (the common "past occurrence" case, since only TODAY's
    /// occurrences ever appear in `items`) is untouched by reconciliation —
    /// `toRemove` only ever targets the `scheduledPrefix` set it was given.
    func testReconciliationNeverTargetsASnoozeIdentifierItWasNotToldAbout() {
        let snoozeIdentifier = PriorityNotificationScheduler.snoozeIdentifier(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-12")
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [], existingScheduledIdentifiers: [], now: Self.referenceNow, calendar: utc
        )
        XCTAssertFalse(plan.toRemove.contains(snoozeIdentifier))
    }

    /// A valid, freshly-created request must never be removed by the very
    /// same reconciliation pass that just created it — re-running
    /// reconciliation with the identical item and the identifier it
    /// produced last time (simulating the app now knowing it's pending)
    /// must leave it alone.
    func testReconciliationDoesNotDeleteTheValidRequestItJustCreated() throws {
        let item = Self.foamRolling(scheduledTime: "07:00")
        let firstPlan = PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [], now: Self.referenceNow, calendar: utc
        )
        let identifier = try XCTUnwrap(firstPlan.toAdd.first?.identifier)

        let secondPlan = PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [identifier], now: Self.referenceNow, calendar: utc
        )
        XCTAssertFalse(secondPlan.toRemove.contains(identifier))
    }

    /// `fireDate` must resolve the Founder's own local wall-clock hour in
    /// whatever real time zone `calendar` carries — not a hardcoded offset.
    /// Proven here against a genuine named zone distinct from UTC, so this
    /// only passes if the calendar argument is actually honored.
    func testFireDateResolvesTheHourInTheGivenTimeZoneNotUTC() throws {
        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let date = try XCTUnwrap(PriorityNotificationScheduler.fireDate("08:40", occurrenceDate: "2026-09-14", calendar: pacific))
        let components = pacific.dateComponents([.hour, .minute], from: date)
        XCTAssertEqual(components.hour, 8)
        XCTAssertEqual(components.minute, 40)
        // The same instant read back in UTC is a different wall-clock hour
        // (Pacific is behind UTC) — proving the fire instant is genuinely
        // anchored to the Pacific interpretation, not incidentally correct.
        XCTAssertNotEqual(utc.component(.hour, from: date), 8)
    }

    // MARK: - Fixtures

    private static let referenceNow = ISO8601DateFormatter().date(from: "2026-09-13T05:00:00Z")!

    private static func foamRolling(scheduledTime: String?, completed: Bool = false) -> PriorityOccurrence {
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
