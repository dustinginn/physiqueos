import XCTest
@testable import PhysiqueOS

final class PriorityNotificationSchedulerTests: XCTestCase {
    @MainActor
    private final class AsyncGate {
        private var isOpen = false
        private var continuation: CheckedContinuation<Void, Never>?
        func wait() async {
            if isOpen { return }
            await withCheckedContinuation { continuation = $0 }
        }
        func open() {
            isOpen = true
            continuation?.resume()
            continuation = nil
        }
    }
    @MainActor
    private final class SnoozeProbe {
        var payloads: [PriorityNotificationScheduler.SnoozePayload] = []
        var requests: [UNNotificationRequest] = []
        var shouldReject = false

        func handle(_ payload: PriorityNotificationScheduler.SnoozePayload) async -> PriorityNotificationScheduler.SnoozeResult {
            payloads.append(payload)
            return await PriorityNotificationScheduler.scheduleSnooze(
                payload: payload,
                now: Date(timeIntervalSince1970: 1_789_500_000)
            ) { request in
                if self.shouldReject { throw URLError(.cannotConnectToHost) }
                self.requests.append(request)
            }
        }
    }

    @MainActor
    private final class CompletionProbe {
        var payloads: [PriorityNotificationDelegate.CompleteActionPayload] = []
        var cleaned: [String] = []
        var shouldReject = false

        func complete(_ payload: PriorityNotificationDelegate.CompleteActionPayload) throws {
            if shouldReject { throw URLError(.badServerResponse) }
            payloads.append(payload)
        }

        func cleanup(priorityId: String, occurrenceDate: String) {
            cleaned.append("\(priorityId)|\(occurrenceDate)")
        }
    }

    func testBriefingNotificationRequiresCanonicalPublishedMidweekCardAndDeepLinksToExactArtifact() throws {
        let card = HomeBriefingCard(
            id: "midweek_briefing_2026-09-16",
            sectionLabel: "Midweek Briefing",
            title: "Your Midweek Briefing is ready",
            prompt: "Review the published update.",
            createdAt: "2026-09-16T12:21:00.000Z",
            destination: .briefingDetail(briefingId: "midweek_briefing_2026-09-16")
        )
        let requests = BriefingReadyNotifier.requestsForNewPublications(cards: [card], observedIDs: [])
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(request.identifier, "briefing.ready.midweek_briefing_2026-09-16")
        XCTAssertEqual(request.content.categoryIdentifier, PriorityNotificationCategory.briefingReady)
        XCTAssertEqual(request.content.userInfo["briefingArtifactId"] as? String, card.id)
        let destinationJSON = try XCTUnwrap(request.content.userInfo["destinationJSON"] as? String)
        let destinationData = try XCTUnwrap(destinationJSON.data(using: .utf8))
        XCTAssertEqual(
            try JSONDecoder().decode(AppDestination.self, from: destinationData),
            .briefingDetail(briefingId: "midweek_briefing_2026-09-16")
        )
        XCTAssertTrue(BriefingReadyNotifier.requestsForNewPublications(
            cards: [card], observedIDs: [card.id]
        ).isEmpty)
    }

    @MainActor
    func testColdStartBriefingTapWaitsForNavigationConsumerAndPreservesExactIdentity() throws {
        let coordinator = NotificationDeepLinkCoordinator()
        let destination = AppDestination.briefingDetail(briefingId: "midweek_briefing_2026-09-16")
        XCTAssertTrue(coordinator.enqueue(identifier: "briefing.ready.midweek_briefing_2026-09-16", destination: destination))
        XCTAssertEqual(coordinator.pendingRequest?.destination, destination)
        XCTAssertEqual(coordinator.consume()?.destination, destination)
        XCTAssertNil(coordinator.pendingRequest)
    }

    @MainActor
    func testBackgroundResumeBriefingTapCanRouteAfterAnEarlierNotificationWasConsumed() {
        let coordinator = NotificationDeepLinkCoordinator()
        XCTAssertTrue(coordinator.enqueue(identifier: "briefing.ready.earlier", destination: .briefingList))
        XCTAssertNotNil(coordinator.consume())
        let exact = AppDestination.briefingDetail(briefingId: "midweek_briefing_2026-09-16")
        XCTAssertTrue(coordinator.enqueue(identifier: "briefing.ready.midweek", destination: exact))
        XCTAssertEqual(coordinator.consume()?.destination, exact)
    }

    @MainActor
    func testAlreadyRunningBriefingTapIsIdempotentForTheSameNotificationResponse() {
        let coordinator = NotificationDeepLinkCoordinator()
        let destination = AppDestination.briefingDetail(briefingId: "midweek_briefing_2026-09-16")
        XCTAssertTrue(coordinator.enqueue(identifier: "briefing.ready.midweek", destination: destination))
        XCTAssertFalse(coordinator.enqueue(identifier: "briefing.ready.midweek", destination: destination))
        XCTAssertEqual(coordinator.consume()?.destination, destination)
        XCTAssertFalse(coordinator.enqueue(identifier: "briefing.ready.midweek", destination: destination))
        XCTAssertNil(coordinator.consume())
    }

    @MainActor
    func testConsumedNotificationIdentityFenceRemainsBoundedWithoutForgettingRecentResponses() {
        let coordinator = NotificationDeepLinkCoordinator()
        for index in 0..<129 {
            let identifier = "briefing.ready.\(index)"
            XCTAssertTrue(coordinator.enqueue(identifier: identifier, destination: .briefingList))
            XCTAssertEqual(coordinator.consume()?.identifier, identifier)
        }

        XCTAssertTrue(coordinator.enqueue(identifier: "briefing.ready.0", destination: .briefingList))
        XCTAssertNotNil(coordinator.consume())
        XCTAssertFalse(coordinator.enqueue(identifier: "briefing.ready.128", destination: .briefingList))
    }

    func testBriefingTapPayloadRejectsMissingInvalidOrMismatchedExactIdentity() throws {
        XCTAssertThrowsError(try PriorityNotificationDelegate.validatedDestination(
            userInfo: [:], categoryIdentifier: PriorityNotificationCategory.briefingReady
        ))
        XCTAssertThrowsError(try PriorityNotificationDelegate.validatedDestination(
            userInfo: ["destinationJSON": "not-json", "briefingArtifactId": "midweek"],
            categoryIdentifier: PriorityNotificationCategory.briefingReady
        ))
        let destination = try JSONEncoder().encode(AppDestination.briefingDetail(briefingId: "midweek-a"))
        XCTAssertThrowsError(try PriorityNotificationDelegate.validatedDestination(
            userInfo: [
                "destinationJSON": String(decoding: destination, as: UTF8.self),
                "briefingArtifactId": "midweek-b",
            ],
            categoryIdentifier: PriorityNotificationCategory.briefingReady
        ))
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

    @MainActor
    func testNotificationCompleteCleansTheExactOccurrenceOnlyAfterCanonicalSuccess() async throws {
        let request = try Self.actionablePeptideRequest()
        let probe = CompletionProbe()
        let delegate = PriorityNotificationDelegate(
            environment: nil,
            completeActionHandler: { try probe.complete($0) },
            completionCleanup: { priorityId, occurrenceDate in
                probe.cleanup(priorityId: priorityId, occurrenceDate: occurrenceDate)
            }
        )
        let snapshot = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.complete,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier
        )

        await delegate.handle(snapshot: snapshot)

        XCTAssertEqual(probe.payloads.count, 1)
        XCTAssertEqual(probe.payloads[0].dose, "0.5 mg")
        XCTAssertEqual(probe.cleaned, ["reminder_tesamorelin|2026-09-16"])
    }

    @MainActor
    func testRejectedNotificationCompleteNeverClearsItsNotification() async throws {
        let request = try Self.actionablePeptideRequest()
        let probe = CompletionProbe()
        probe.shouldReject = true
        let delegate = PriorityNotificationDelegate(
            environment: nil,
            completeActionHandler: { try probe.complete($0) },
            completionCleanup: { priorityId, occurrenceDate in
                probe.cleanup(priorityId: priorityId, occurrenceDate: occurrenceDate)
            }
        )
        await delegate.handle(snapshot: .init(
            actionIdentifier: PriorityNotificationActionIdentifier.complete,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier
        ))
        XCTAssertTrue(probe.cleaned.isEmpty)
    }

    @MainActor
    func testFutureNotificationRetriesOneStaleVersionOnlyAfterExactOccurrenceRefresh() async throws {
        let request = try Self.actionablePeptideRequest()
        var submittedVersions: [Int] = []
        var resolverCalls = 0
        var cleanupCalls: [String] = []
        let stale = ProductionProblemDetails(
            problemVersion: "1", type: nil, title: "Stale version", status: 412,
            code: "STALE_VERSION", detail: nil, instance: nil, requestId: nil,
            fieldErrors: [], recovery: nil
        )
        let delegate = PriorityNotificationDelegate(
            environment: nil,
            completeActionHandler: { payload in
                submittedVersions.append(try XCTUnwrap(payload.expectedVersion))
                if submittedVersions.count == 1 {
                    throw ProductionNativeError.failedPrecondition(stale)
                }
            },
            staleCompletionResolver: { original in
                resolverCalls += 1
                XCTAssertEqual(original.priorityId, "reminder_tesamorelin")
                XCTAssertEqual(original.occurrenceDate, "2026-09-16")
                XCTAssertEqual(original.dose, "0.5 mg")
                XCTAssertEqual(original.protocolId, "protocol_tesamorelin")
                return .init(
                    commandType: original.commandType, expectedVersion: 12,
                    priorityId: original.priorityId, occurrenceDate: original.occurrenceDate,
                    dose: original.dose, protocolId: original.protocolId
                )
            },
            postActionReconciliation: {},
            completionCleanup: { priorityId, occurrenceDate in
                cleanupCalls.append("\(priorityId)|\(occurrenceDate)")
            }
        )

        await delegate.handle(snapshot: .init(
            actionIdentifier: PriorityNotificationActionIdentifier.complete,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier
        ))

        XCTAssertEqual(submittedVersions, [7, 12])
        XCTAssertEqual(resolverCalls, 1)
        XCTAssertEqual(cleanupCalls, ["reminder_tesamorelin|2026-09-16"])
    }

    @MainActor
    func testFutureNotificationDoesNotRetryNonStaleFailure() async throws {
        let request = try Self.actionablePeptideRequest()
        var attempts = 0
        var resolverCalls = 0
        let delegate = PriorityNotificationDelegate(
            environment: nil,
            completeActionHandler: { _ in
                attempts += 1
                throw URLError(.cannotConnectToHost)
            },
            staleCompletionResolver: { _ in
                resolverCalls += 1
                return nil
            },
            completionCleanup: { _, _ in XCTFail("rejected completion must not clean notifications") }
        )
        await delegate.handle(snapshot: .init(
            actionIdentifier: PriorityNotificationActionIdentifier.complete,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier
        ))
        XCTAssertEqual(attempts, 1)
        XCTAssertEqual(resolverCalls, 0)
    }

    @MainActor
    func testSnoozeDelegateRunningAppUsesValueSnapshotOnceAndPreservesActionContext() async throws {
        let request = try Self.actionablePeptideRequest()
        let payload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: request))
        let probe = SnoozeProbe()
        let delegate = PriorityNotificationDelegate(environment: nil) { await probe.handle($0) }
        let snapshot = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.snooze,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier,
            snooze: payload
        )

        await delegate.handle(snapshot: snapshot)
        await delegate.handle(snapshot: snapshot) // duplicate callback

        XCTAssertEqual(probe.payloads.count, 1)
        let snoozed = try XCTUnwrap(probe.requests.first)
        XCTAssertEqual(probe.requests.count, 1)
        XCTAssertEqual(snoozed.identifier, "priority.snoozed.reminder_tesamorelin.2026-09-16.attempt.1")
        XCTAssertEqual(snoozed.content.categoryIdentifier, PriorityNotificationCategory.specializedActionable)
        XCTAssertEqual(snoozed.content.userInfo["priorityId"] as? String, "reminder_tesamorelin")
        XCTAssertEqual(snoozed.content.userInfo["occurrenceDate"] as? String, "2026-09-16")
        XCTAssertEqual(snoozed.content.userInfo["payloadDose"] as? String, "0.5 mg")
        XCTAssertEqual(snoozed.content.userInfo["payloadProtocolId"] as? String, "protocol_tesamorelin")
        XCTAssertEqual((snoozed.trigger as? UNTimeIntervalNotificationTrigger)?.timeInterval, 3_600)
        XCTAssertFalse((snoozed.trigger as? UNTimeIntervalNotificationTrigger)?.repeats ?? true)
    }

    @MainActor
    func testSnoozeColdLaunchAndBackgroundResumeUseTheSameSafeSnapshotBoundary() async throws {
        let request = try Self.actionablePeptideRequest()
        let payload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: request))
        let snapshot = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.snooze,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier,
            snooze: payload
        )

        for _ in 0..<2 { // newly-created delegate (cold launch), retained delegate (resume)
            let probe = SnoozeProbe()
            let delegate = PriorityNotificationDelegate(environment: nil) { await probe.handle($0) }
            await delegate.handle(snapshot: snapshot)
            XCTAssertEqual(probe.requests.count, 1)
        }
    }

    @MainActor
    func testSnoozeMissingPayloadAndNotificationCenterFailureFailSafeWithoutCanonicalMutation() async throws {
        let request = try Self.actionablePeptideRequest()
        let probe = SnoozeProbe()
        probe.shouldReject = true
        let delegate = PriorityNotificationDelegate(environment: nil) { await probe.handle($0) }
        let invalid = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.snooze,
            requestIdentifier: request.identifier,
            userInfo: [:],
            categoryIdentifier: request.content.categoryIdentifier,
            snooze: nil
        )
        await delegate.handle(snapshot: invalid)
        XCTAssertTrue(probe.payloads.isEmpty)

        let payload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: request))
        let valid = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.snooze,
            requestIdentifier: request.identifier + ".failure",
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier,
            snooze: payload
        )
        await delegate.handle(snapshot: valid)
        XCTAssertEqual(probe.payloads.count, 1)
        XCTAssertTrue(probe.requests.isEmpty)
    }

    @MainActor
    func testAllRegisteredActionLifecycleKindsDecodeOrFailClosedWithoutCrash() async throws {
        let environment = AppEnvironment(nativeAuthority: .sandbox)
        let completeHandled = expectation(description: "complete-owned-work")
        let openHandled = expectation(description: "open-owned-work")
        openHandled.expectedFulfillmentCount = 3
        let delegate = PriorityNotificationDelegate(
            environment: environment,
            snoozeHandler: { _ in
                XCTFail("non-snooze actions must not schedule a snooze")
                return .rejected(identifier: "unexpected")
            },
            completeActionHandler: { _ in completeHandled.fulfill() },
            openActionHandler: { identifier, destination in
                openHandled.fulfill()
                return environment.notificationDeepLinkCoordinator.enqueue(
                    identifier: identifier, destination: destination
                )
            },
            postActionReconciliation: {},
            completionCleanup: { _, _ in }
        )
        let priority = try Self.actionablePeptideRequest()
        let destination = try XCTUnwrap(priority.content.userInfo["destinationJSON"] as? String)
        let openInfo: [AnyHashable: Any] = ["destinationJSON": destination]
        let actions = [
            PriorityNotificationDelegate.ResponseSnapshot(
                actionIdentifier: PriorityNotificationActionIdentifier.complete,
                requestIdentifier: priority.identifier,
                userInfo: priority.content.userInfo,
                categoryIdentifier: priority.content.categoryIdentifier
            ),
            PriorityNotificationDelegate.ResponseSnapshot(
                actionIdentifier: UNNotificationDefaultActionIdentifier,
                requestIdentifier: "priority.open",
                userInfo: openInfo,
                categoryIdentifier: PriorityNotificationCategory.openOnly
            ),
            PriorityNotificationDelegate.ResponseSnapshot(
                actionIdentifier: UNNotificationDefaultActionIdentifier,
                requestIdentifier: "evidence.reviewReady.review-1",
                userInfo: openInfo,
                categoryIdentifier: PriorityNotificationCategory.evidenceReviewReady
            ),
        ]
        for (index, action) in actions.enumerated() {
            let completion = expectation(description: "action-\(index)-completed")
            delegate.dispatch(snapshot: action) { completion.fulfill() }
            await fulfillment(of: [completion], timeout: 1)
        }

        let briefingDestination = try JSONEncoder().encode(AppDestination.briefingDetail(briefingId: "midweek-1"))
        let briefingCompletion = expectation(description: "briefing-completed")
        delegate.dispatch(snapshot: .init(
            actionIdentifier: UNNotificationDefaultActionIdentifier,
            requestIdentifier: "briefing.ready.midweek-1",
            userInfo: [
                "destinationJSON": String(decoding: briefingDestination, as: UTF8.self),
                "briefingArtifactId": "midweek-1",
            ],
            categoryIdentifier: PriorityNotificationCategory.briefingReady
        )) { briefingCompletion.fulfill() }
        await fulfillment(of: [briefingCompletion], timeout: 1)
        await fulfillment(of: [completeHandled, openHandled], timeout: 1)
        XCTAssertEqual(environment.notificationDeepLinkCoordinator.pendingRequest?.destination,
                       .briefingDetail(briefingId: "midweek-1"))
    }

    @MainActor
    func testDelegateBoundaryCompletesExactlyOnceForDuplicateSnoozeAndInvalidPayload() async throws {
        let request = try Self.actionablePeptideRequest()
        let payload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: request))
        let probe = SnoozeProbe()
        let snoozeHandled = expectation(description: "snooze-owned-work")
        let delegate = PriorityNotificationDelegate(environment: nil) {
            let result = await probe.handle($0)
            snoozeHandled.fulfill()
            return result
        }
        let valid = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.snooze,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier,
            snooze: payload
        )
        let invalid = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: PriorityNotificationActionIdentifier.snooze,
            requestIdentifier: "invalid.snooze",
            userInfo: [:],
            categoryIdentifier: request.content.categoryIdentifier,
            snooze: nil
        )
        for (index, snapshot) in [valid, valid, invalid].enumerated() {
            let completed = expectation(description: "delegate-completion-\(index)")
            completed.expectedFulfillmentCount = 1
            completed.assertForOverFulfill = true
            delegate.dispatch(snapshot: snapshot) { completed.fulfill() }
            await fulfillment(of: [completed], timeout: 1)
        }
        await fulfillment(of: [snoozeHandled], timeout: 1)
        XCTAssertEqual(probe.payloads.count, 1)
        XCTAssertEqual(probe.requests.count, 1)
    }

    @MainActor
    func testAppleCompletionIsPromptWhileLiveShapedCompleteAndReconciliationRemainPending() async throws {
        for (label, request) in [
            ("direct", try Self.directCompletionRequest()),
            ("peptide", try Self.actionablePeptideRequest()),
        ] {
            let commandGate = AsyncGate()
            let homeFetchGate = AsyncGate()
            let notificationSyncGate = AsyncGate()
            let commandStarted = expectation(description: "\(label)-command-started")
            let homeFetchStarted = expectation(description: "\(label)-home-fetch-started")
            let notificationSyncStarted = expectation(description: "\(label)-notification-sync-started")
            let workFinished = expectation(description: "\(label)-work-finished")
            let environment = AppEnvironment(nativeAuthority: .sandbox)
            let delegate = PriorityNotificationDelegate(
                environment: environment,
                completeActionHandler: { _ in
                    commandStarted.fulfill()
                    await commandGate.wait()
                },
                postActionReconciliation: {
                    // Live-shaped reconciliation: the canonical Home reread
                    // and notification-center horizon sync are independently
                    // slow, but neither owns Apple's callback lifetime.
                    homeFetchStarted.fulfill()
                    await homeFetchGate.wait()
                    notificationSyncStarted.fulfill()
                    await notificationSyncGate.wait()
                    workFinished.fulfill()
                },
                completionCleanup: { _, _ in }
            )
            let appleCompleted = expectation(description: "\(label)-apple-completed")
            appleCompleted.assertForOverFulfill = true
            delegate.dispatch(snapshot: .init(
                actionIdentifier: PriorityNotificationActionIdentifier.complete,
                requestIdentifier: request.identifier,
                userInfo: request.content.userInfo,
                categoryIdentifier: request.content.categoryIdentifier
            )) { appleCompleted.fulfill() }

            await fulfillment(of: [appleCompleted], timeout: 0.25)
            await fulfillment(of: [commandStarted], timeout: 1)
            commandGate.open()
            await fulfillment(of: [homeFetchStarted], timeout: 1)
            homeFetchGate.open()
            await fulfillment(of: [notificationSyncStarted], timeout: 1)
            notificationSyncGate.open()
            await fulfillment(of: [workFinished], timeout: 1)
        }
    }

    @MainActor
    func testAppleCompletionIsPromptForDelayedSnoozeReviewAndBriefingRoutes() async throws {
        let priority = try Self.actionablePeptideRequest()
        let snoozePayload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: priority))
        let reviewDestination = try JSONEncoder().encode(AppDestination.evidenceReview(reviewId: "review-1"))
        let briefingDestination = try JSONEncoder().encode(AppDestination.briefingDetail(briefingId: "midweek-1"))
        let cases: [(String, PriorityNotificationDelegate.ResponseSnapshot)] = [
            ("snooze", .init(
                actionIdentifier: PriorityNotificationActionIdentifier.snooze,
                requestIdentifier: priority.identifier,
                userInfo: priority.content.userInfo,
                categoryIdentifier: priority.content.categoryIdentifier,
                snooze: snoozePayload
            )),
            ("review", .init(
                actionIdentifier: UNNotificationDefaultActionIdentifier,
                requestIdentifier: "evidence.reviewReady.review-1",
                userInfo: ["destinationJSON": String(decoding: reviewDestination, as: UTF8.self)],
                categoryIdentifier: PriorityNotificationCategory.evidenceReviewReady
            )),
            ("briefing", .init(
                actionIdentifier: UNNotificationDefaultActionIdentifier,
                requestIdentifier: "briefing.ready.midweek-1",
                userInfo: [
                    "destinationJSON": String(decoding: briefingDestination, as: UTF8.self),
                    "briefingArtifactId": "midweek-1",
                ],
                categoryIdentifier: PriorityNotificationCategory.briefingReady
            )),
        ]
        for (label, snapshot) in cases {
            let gate = AsyncGate()
            let workStarted = expectation(description: "\(label)-work-started")
            let workFinished = expectation(description: "\(label)-work-finished")
            let environment = AppEnvironment(nativeAuthority: .sandbox)
            let delegate = PriorityNotificationDelegate(
                environment: environment,
                snoozeHandler: { payload in
                    workStarted.fulfill()
                    await gate.wait()
                    workFinished.fulfill()
                    return .accepted(identifier: payload.originalRequestIdentifier + ".snoozed")
                },
                openActionHandler: { _, _ in
                    workStarted.fulfill()
                    await gate.wait()
                    workFinished.fulfill()
                    return true
                },
                postActionReconciliation: {}
            )
            let appleCompleted = expectation(description: "\(label)-apple-completed")
            appleCompleted.assertForOverFulfill = true
            delegate.dispatch(snapshot: snapshot) { appleCompleted.fulfill() }
            await fulfillment(of: [appleCompleted], timeout: 0.25)
            await fulfillment(of: [workStarted], timeout: 1)
            gate.open()
            await fulfillment(of: [workFinished], timeout: 1)
        }
    }

    @MainActor
    func testRepeatedSnoozeAttemptsUseDistinctIdentifiersAndCompletionCleansAllAttempts() async throws {
        let firstRequest = try Self.actionablePeptideRequest()
        let firstPayload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: firstRequest))
        var requests: [UNNotificationRequest] = []
        let first = await PriorityNotificationScheduler.scheduleSnooze(payload: firstPayload) { requests.append($0) }
        guard case .accepted(let firstID) = first else { return XCTFail("first snooze rejected") }
        let secondPayload = try XCTUnwrap(PriorityNotificationScheduler.SnoozePayload(request: requests[0]))
        let second = await PriorityNotificationScheduler.scheduleSnooze(payload: secondPayload) { requests.append($0) }
        guard case .accepted(let secondID) = second else { return XCTFail("second snooze rejected") }
        XCTAssertNotEqual(firstID, secondID)
        XCTAssertTrue(firstID.hasSuffix(".attempt.1"))
        XCTAssertTrue(secondID.hasSuffix(".attempt.2"))

        let plan = PriorityNotificationScheduler.completionCleanupPlan(
            items: [Self.scheduledOccurrence(id: "reminder_tesamorelin", date: "2026-09-16", time: "17:00", completed: true)],
            pendingIdentifiers: [firstID, secondID],
            deliveredIdentifiers: [firstID, secondID]
        )
        XCTAssertEqual(Set(plan.pendingIdentifiers), Set([firstID, secondID]))
        XCTAssertEqual(Set(plan.deliveredIdentifiers), Set([firstID, secondID]))
    }

    func testPriorityRequestBudgetLeavesHeadroomForReviewBriefingAndSnoozeRequests() {
        let items = (0..<60).map { index in
            Self.scheduledOccurrence(id: "priority-\(index)", date: "2026-09-18", time: "17:00")
        }
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: items,
            existingScheduledIdentifiers: [],
            now: ISO8601DateFormatter().date(from: "2026-09-17T00:00:00Z")!,
            calendar: utc
        )
        XCTAssertEqual(plan.toAdd.count, PriorityNotificationScheduler.maximumPriorityRequests)
        XCTAssertLessThanOrEqual(plan.toAdd.count, 40)

        let previouslyOverBudget = Set(items.map {
            PriorityNotificationScheduler.identifier(priorityId: $0.id, occurrenceDate: $0.date)
        })
        let trimmed = PriorityNotificationScheduler.reconciliationPlan(
            items: items,
            existingScheduledIdentifiers: previouslyOverBudget,
            now: ISO8601DateFormatter().date(from: "2026-09-17T00:00:00Z")!,
            calendar: utc
        )
        XCTAssertEqual(trimmed.toRemove.count, 20)
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

    func testCompletedOccurrenceTargetsExactPendingDeliveredAndSnoozedNotificationsOnly() {
        let completed = Self.foamRolling(scheduledTime: "07:00", completed: true)
        let scheduled = PriorityNotificationScheduler.identifier(
            priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13"
        )
        let snoozed = PriorityNotificationScheduler.snoozeIdentifier(
            priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13"
        )
        let future = PriorityNotificationScheduler.identifier(
            priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-14"
        )
        let unrelated = PriorityNotificationScheduler.identifier(
            priorityId: "reminder_tesamorelin", occurrenceDate: "2026-09-13"
        )
        let reviewReady = "evidence.reviewReady.review-1"

        let plan = PriorityNotificationScheduler.completionCleanupPlan(
            items: [completed],
            pendingIdentifiers: [scheduled, snoozed, future, unrelated, reviewReady],
            deliveredIdentifiers: [scheduled, snoozed, future, unrelated, reviewReady]
        )

        XCTAssertEqual(plan.pendingIdentifiers, [scheduled, snoozed].sorted())
        XCTAssertEqual(plan.deliveredIdentifiers, [scheduled, snoozed].sorted())
        XCTAssertFalse(plan.pendingIdentifiers.contains(future))
        XCTAssertFalse(plan.deliveredIdentifiers.contains(unrelated))
        XCTAssertFalse(plan.deliveredIdentifiers.contains(reviewReady))
    }

    @MainActor
    func testCompletionCleanupIsIdempotentAndFailureNeverBecomesCanonicalFailure() async {
        let scheduled = PriorityNotificationScheduler.identifier(
            priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-13"
        )
        let plan = PriorityNotificationScheduler.CompletionCleanupPlan(
            pendingIdentifiers: [scheduled], deliveredIdentifiers: [scheduled]
        )
        var pendingCalls: [[String]] = []
        var deliveredCalls: [[String]] = []
        let first = await PriorityNotificationScheduler.executeCompletionCleanup(
            plan: plan,
            removePending: { pendingCalls.append($0) },
            removeDelivered: { deliveredCalls.append($0) }
        )
        let second = await PriorityNotificationScheduler.executeCompletionCleanup(
            plan: .init(pendingIdentifiers: [], deliveredIdentifiers: []),
            removePending: { pendingCalls.append($0) },
            removeDelivered: { deliveredCalls.append($0) }
        )
        XCTAssertEqual(first, .init(pendingRemoved: true, deliveredRemoved: true))
        XCTAssertEqual(second, .init(pendingRemoved: true, deliveredRemoved: true))
        XCTAssertEqual(pendingCalls, [[scheduled]])
        XCTAssertEqual(deliveredCalls, [[scheduled]])

        let failed = await PriorityNotificationScheduler.executeCompletionCleanup(
            plan: plan,
            removePending: { _ in throw URLError(.cannotRemoveFile) },
            removeDelivered: { _ in throw URLError(.cannotRemoveFile) }
        )
        XCTAssertEqual(failed, .init(pendingRemoved: false, deliveredRemoved: false))
    }

    func testMissingCompletedNotificationIsSafe() {
        let plan = PriorityNotificationScheduler.completionCleanupPlan(
            items: [Self.foamRolling(scheduledTime: "07:00", completed: true)],
            pendingIdentifiers: [], deliveredIdentifiers: []
        )
        XCTAssertTrue(plan.pendingIdentifiers.isEmpty)
        XCTAssertTrue(plan.deliveredIdentifiers.isEmpty)
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

    func testCompletedTodayRemovesOnlyTodayAndPreservesTomorrowInTheForwardHorizon() {
        let today = Self.scheduledOccurrence(
            id: "reminder_morning_weight", date: "2026-09-17", time: "05:30", completed: true
        )
        let tomorrow = Self.scheduledOccurrence(
            id: "reminder_morning_weight", date: "2026-09-18", time: "05:30"
        )
        let todayID = PriorityNotificationScheduler.identifier(
            priorityId: today.id, occurrenceDate: today.date
        )
        let tomorrowID = PriorityNotificationScheduler.identifier(
            priorityId: tomorrow.id, occurrenceDate: tomorrow.date
        )
        let now = ISO8601DateFormatter().date(from: "2026-09-17T01:00:00Z")!
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [today, tomorrow],
            existingScheduledIdentifiers: [todayID, tomorrowID],
            now: now,
            calendar: utc
        )

        XCTAssertTrue(plan.toRemove.contains(todayID))
        XCTAssertFalse(plan.toRemove.contains(tomorrowID))
        XCTAssertEqual(plan.toAdd.map(\.identifier), [tomorrowID])
    }

    func testEditedFutureScheduleReplacesTheExactOccurrenceWithoutDuplication() throws {
        let original = Self.scheduledOccurrence(
            id: "reminder_fadogia", date: "2026-09-18", time: "05:45"
        )
        let edited = Self.scheduledOccurrence(
            id: "reminder_fadogia", date: "2026-09-18", time: "06:15"
        )
        let identifier = PriorityNotificationScheduler.identifier(
            priorityId: original.id, occurrenceDate: original.date
        )
        let now = ISO8601DateFormatter().date(from: "2026-09-17T01:00:00Z")!
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [edited, edited],
            existingScheduledIdentifiers: [identifier],
            now: now,
            calendar: utc
        )

        XCTAssertEqual(plan.toAdd.map(\.identifier), [identifier])
        XCTAssertTrue(plan.toRemove.isEmpty)
        XCTAssertEqual(try Self.fireHourMinute(plan.toAdd[0], calendar: utc), [6, 15])
    }

    func testDisablingReminderRemovesItsExactFutureRequestsWithoutRetroactiveReplacement() {
        let future = PriorityNotificationScheduler.identifier(
            priorityId: "reminder_fadogia", occurrenceDate: "2026-09-18"
        )
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: [], existingScheduledIdentifiers: [future],
            now: Self.referenceNow, calendar: utc
        )

        XCTAssertEqual(plan.toRemove, [future])
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
    /// snoozed identifier for an occurrence that's no longer in the bounded
    /// canonical horizon is untouched by ordinary stale-request cleanup —
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

    func testFutureOccurrenceFireDatePreservesLocalClockAcrossDSTBoundary() throws {
        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))

        let beforeFallback = try XCTUnwrap(PriorityNotificationScheduler.fireDate(
            "05:30", occurrenceDate: "2026-10-31", calendar: pacific
        ))
        let afterFallback = try XCTUnwrap(PriorityNotificationScheduler.fireDate(
            "05:30", occurrenceDate: "2026-11-02", calendar: pacific
        ))

        XCTAssertEqual(ISO8601DateFormatter().string(from: beforeFallback), "2026-10-31T12:30:00Z")
        XCTAssertEqual(ISO8601DateFormatter().string(from: afterFallback), "2026-11-02T13:30:00Z")
        XCTAssertEqual(pacific.component(.hour, from: beforeFallback), 5)
        XCTAssertEqual(pacific.component(.hour, from: afterFallback), 5)
    }

    // MARK: - Fixtures

    private static let referenceNow = ISO8601DateFormatter().date(from: "2026-09-13T05:00:00Z")!

    private static func actionablePeptideRequest() throws -> UNNotificationRequest {
        let action = try JSONDecoder().decode(PriorityNotificationAction.self, from: Data(#"{"classification":"specialized_workflow_required","workflow":"peptide_protocol","scheduledTime":"17:00","completionCommand":{"commandType":"priority.complete.v1","expectedVersion":7,"payload":{"priorityId":"reminder_tesamorelin","occurrenceDate":"2026-09-16","dose":"0.5 mg","protocolId":"protocol_tesamorelin"}}}"#.utf8))
        var item = foamRolling(scheduledTime: "17:00")
        item.id = "reminder_tesamorelin"
        item.date = "2026-09-16"
        item.notificationAction = action
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-16T00:00:00Z"))
        return try XCTUnwrap(PriorityNotificationScheduler.reconciliationPlan(
            items: [item], existingScheduledIdentifiers: [], now: now, calendar: utcCalendar
        ).toAdd.first)
    }

    private static func directCompletionRequest() throws -> UNNotificationRequest {
        let item = scheduledOccurrence(id: "reminder_foam_roll", date: "2026-09-16", time: "17:00")
        var direct = item
        direct.completable = true
        direct.expectedVersion = 7
        direct.notificationAction = PriorityNotificationAction(
            classification: .directCompletionAllowed,
            scheduledTime: "17:00",
            completionCommand: PriorityNotificationCompletionCommand(
                commandType: ProductionCommandType.completePriority,
                expectedVersion: 7,
                payload: .init(priorityId: "reminder_foam_roll", occurrenceDate: "2026-09-16")
            )
        )
        return try XCTUnwrap(PriorityNotificationScheduler.reconciliationPlan(
            items: [direct], existingScheduledIdentifiers: [],
            now: ISO8601DateFormatter().date(from: "2026-09-16T00:00:00Z")!, calendar: utcCalendar
        ).toAdd.first)
    }

    private static var utcCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

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

    private static func scheduledOccurrence(
        id: String, date: String, time: String, completed: Bool = false
    ) -> PriorityOccurrence {
        PriorityOccurrence(
            id: id,
            routePriorityId: id,
            executionItemId: id,
            date: date,
            title: id,
            subtitle: nil,
            metadata: nil,
            changeLabel: nil,
            icon: .target,
            color: .primary,
            urgency: .upcoming,
            completed: completed,
            completable: false,
            expectedVersion: nil,
            actionLabel: nil,
            completionContext: nil,
            notificationAction: PriorityNotificationAction(
                classification: .openOnly,
                scheduledTime: time,
                completionCommand: nil
            )
        )
    }

    private static func fireHourMinute(_ request: UNNotificationRequest, calendar: Calendar) throws -> [Int] {
        let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger)
        let date = try XCTUnwrap(calendar.date(from: trigger.dateComponents))
        return [calendar.component(.hour, from: date), calendar.component(.minute, from: date)]
    }
}
