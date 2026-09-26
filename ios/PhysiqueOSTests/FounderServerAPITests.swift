import Foundation
import XCTest
import SwiftUI
import UIKit
@testable import PhysiqueOS

final class FounderServerAPITests: XCTestCase {
    @MainActor
    func testHomeHandsOffNotificationsBeforeSlowSpeculativePrefetch() async throws {
        let model = HomeViewModel(api: FixtureHomeAPI(), priorityStore: LoggingSandboxStore(), goalsSandboxStore: GoalsSandboxStore(), briefingStore: BriefingSandboxStore(), appliesSandboxProjections: false)
        var calls: [String] = []
        var clock = ISO8601DateFormatter().date(from: "2026-09-15T19:20:50Z")!
        let fire = ISO8601DateFormatter().date(from: "2026-09-15T19:21:00Z")!
        await model.loadAndReconcileBeforePrefetch(reconcileNotifications: {
            guard case .loaded = model.state else { return XCTFail("Canonical Home must already be loaded") }
            calls.append("handoff")
            XCTAssertLessThan(clock, fire)
        }, prefetch: {
            calls.append("prefetch")
            clock = clock.addingTimeInterval(30)
        })
        XCTAssertEqual(calls, ["handoff", "prefetch"])
        XCTAssertGreaterThan(clock, fire, "The old prefetch-first sequence would miss this deadline")
    }

    func testProductionHomePreservesAllServerNotificationClassificationsAndFailsClosedOnUnknown() async throws {
        for classification in ["specialized_workflow_required", "direct_completion_allowed", "open_only", "unsupported_classification"] {
            var envelope = try JSONSerialization.jsonObject(with: Data(productionHomeJSON(priorityID: "reminder_foam_roll_daily", goalID: "goal-server", confidence: 74).utf8)) as! [String: Any]
            var payload = envelope["data"] as! [String: Any]
            var rows = payload["todaysFocus"] as! [[String: Any]]
            var action: [String: Any] = ["classification": classification, "scheduledTime": "12:21", "completionCommand": NSNull()]
            if classification == "direct_completion_allowed" {
                action["completionCommand"] = ["commandType": "priority.complete.v1", "expectedVersion": 33, "payload": ["priorityId": "completion-canonical", "occurrenceDate": "2026-09-10"]]
            }
            rows[0]["notificationAction"] = action
            payload["todaysFocus"] = rows
            envelope["data"] = payload
            let json = String(decoding: try JSONSerialization.data(withJSONObject: envelope), as: UTF8.self)
            let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["home": json])
            let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Isolated fixture")
            do {
                let home = try await ProductionHomeAPI(api: native).fetchHome()
                XCTAssertNotEqual(classification, "unsupported_classification", "Unknown classification must not silently become open-only")
                let decoded = try XCTUnwrap(home.todaysFocus.first?.notificationAction)
                XCTAssertEqual(decoded.classification.rawValue, classification)
                XCTAssertEqual(decoded.scheduledTime, "12:21")
                XCTAssertEqual(decoded.completionCommand != nil, classification == "direct_completion_allowed")
            } catch {
                if classification != "unsupported_classification" { throw error }
            }
        }
    }

    func testProductionPriorityDetailPreservesSpecializedNotificationAction() async throws {
        let json = productionEnvelope(resource: "priority", data: #"{"id":"reminder_foam_roll_daily","title":"Foam Rolling","subtitle":"Daily · 12:21 PM","status":"Active","sections":[],"executionContract":{"priorityId":"reminder_foam_roll_daily","occurrenceDate":"2026-09-15","expectedVersion":33},"notificationAction":{"classification":"specialized_workflow_required","workflow":"priority_detail","scheduledTime":"12:21","completionCommand":null}}"#)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["priority": json])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Isolated fixture")
        let value = try await ProductionPriorityAPI(api: native).fetchPriority(priorityId: "reminder_foam_roll_daily", occurrenceDate: "2026-09-15")
        let item = try XCTUnwrap(value)
        XCTAssertEqual(item.notificationAction?.classification, .specializedWorkflowRequired)
        XCTAssertEqual(item.notificationAction?.scheduledTime, "12:21")
        XCTAssertNil(item.notificationAction?.completionCommand)
    }

    func testProductionHomeForwardsIncidentNotificationActionThroughRealDecoder() async throws {
        let homeJSON = productionEnvelope(resource: "home", data: #"{"header":{"greeting":"Hello","name":"Founder"},"hero":{"mode":"active","goalLabel":"Current Goal","headline":"On track","supportLine":"Canonical state"},"nextBestAction":{"title":"Foam Rolling","icon":"activity","destination":{"id":"priority.detail","parameters":{"priorityId":"reminder_foam_roll_daily","occurrenceDate":"2026-09-15"}}},"briefingCards":[],"goals":[],"timezone":null,"todaysFocus":[{"id":"reminder_foam_roll_daily","executionId":"execution_foam_roll","occurrenceDate":"2026-09-15","label":"Foam Rolling","subtitle":"Daily · 12:21 PM","icon":"activity","color":"primary","state":"available","completed":false,"completable":false,"nextDueAt":null,"executionContract":{"priorityId":"reminder_foam_roll_daily","occurrenceDate":"2026-09-15","expectedVersion":33},"notificationAction":{"classification":"specialized_workflow_required","workflow":"priority_detail","scheduledTime":"12:21","completionCommand":null}}]}"#)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["home": homeJSON])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Isolated fixture")
        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let item = try XCTUnwrap(home.todaysFocus.first)
        XCTAssertEqual(item.notificationAction?.classification, .specializedWorkflowRequired)
        XCTAssertEqual(item.notificationAction?.scheduledTime, "12:21")
        XCTAssertNil(item.notificationAction?.completionCommand)
        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let now = ISO8601DateFormatter().date(from: "2026-09-15T19:20:00Z")!
        let id = "priority.scheduled.reminder_foam_roll_daily.2026-09-15"
        let plan = PriorityNotificationScheduler.reconciliationPlan(items: home.todaysFocus, existingScheduledIdentifiers: [id], now: now, calendar: pacific)
        XCTAssertEqual(plan.toAdd.map(\.identifier), [id])
        XCTAssertTrue(plan.toRemove.isEmpty)
        let trigger = try XCTUnwrap(plan.toAdd.first?.trigger as? UNCalendarNotificationTrigger)
        XCTAssertEqual(pacific.date(from: trigger.dateComponents), ISO8601DateFormatter().date(from: "2026-09-15T19:21:00Z"))
        XCTAssertEqual(trigger.dateComponents.timeZone?.identifier, "America/Los_Angeles")
        XCTAssertEqual(plan.toAdd.first?.content.categoryIdentifier, PriorityNotificationCategory.specializedWorkflow)
    }

    func testProductionHomePreservesStandalonePhotoPriorityDestinationForTapAndNotification() async throws {
        let homeJSON = productionEnvelope(resource: "home", data: #"{"header":{"greeting":"Hello","name":"Founder"},"hero":{"mode":"active","goalLabel":"Current Goal","headline":"On track","supportLine":"Canonical state"},"nextBestAction":{"title":"Weekly Progress Photo Set","icon":"camera","destination":{"id":"photo.upload","parameters":{}}},"briefingCards":[],"goals":[],"notificationTimeZone":"America/Los_Angeles","todaysFocus":[{"id":"reminder_weekly_progress_photo_set","executionId":"execution_progress_photos","occurrenceDate":"2026-09-20","label":"Weekly Progress Photo Set","subtitle":"Sunday morning","icon":"camera","color":"evidence","state":"upcoming","completed":false,"completable":false,"destination":{"id":"photo.upload","parameters":{}},"executionContract":{"priorityId":"reminder_weekly_progress_photo_set","occurrenceDate":"2026-09-20","expectedVersion":4},"notificationAction":{"classification":"specialized_workflow_required","workflow":"progress_photos","scheduledTime":"08:00","completionCommand":null}}]}"#)
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["home": homeJSON]
        )
        let native = ProductionNativeAPI(
            baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport
        )
        _ = try await native.pair(
            pairingCredential: String(repeating: "p", count: 43), displayName: "Isolated fixture"
        )

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let item = try XCTUnwrap(home.todaysFocus.first)
        XCTAssertEqual(item.destination, .photoUpload)
        XCTAssertEqual(item.notificationAction?.classification, .specializedWorkflowRequired)

        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: home.todaysFocus, existingScheduledIdentifiers: [],
            now: try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-20T14:00:00Z")),
            calendar: pacific
        )
        let request = try XCTUnwrap(plan.toAdd.first)
        XCTAssertEqual(request.content.categoryIdentifier, PriorityNotificationCategory.specializedWorkflow)
        let snapshot = PriorityNotificationDelegate.ResponseSnapshot(
            actionIdentifier: UNNotificationDefaultActionIdentifier,
            requestIdentifier: request.identifier,
            userInfo: request.content.userInfo,
            categoryIdentifier: request.content.categoryIdentifier
        )
        let destinationJSON = try XCTUnwrap(snapshot.open.destinationJSON)
        let notificationDestination = try JSONDecoder().decode(
            AppDestination.self, from: Data(destinationJSON.utf8)
        )
        XCTAssertEqual(notificationDestination, .photoUpload)
    }

    func testProductionHomeDecodesCanonicalFutureNotificationHorizonIndependentOfVisibleFocus() async throws {
        let data = #"{"header":{"greeting":"Good evening","name":"Founder"},"hero":{"mode":"active","goalLabel":"Current Goal","headline":"On track","supportLine":"Canonical state"},"nextBestAction":{"title":"Review today","icon":"target","destination":{"id":"goal.detail","parameters":{"goalId":"goal-canonical"}}},"briefingCards":[],"goals":[],"todaysFocus":[],"notificationTimeZone":"America/Los_Angeles","notificationOccurrences":[{"id":"reminder_morning_weight","occurrenceDate":"2026-09-17","label":"Morning Weigh-In","subtitle":"Morning","icon":"scale","color":"evidence","state":"upcoming","completed":false,"completable":false,"executionContract":{"priorityId":"reminder_morning_weight","occurrenceDate":"2026-09-17"},"notificationAction":{"classification":"specialized_workflow_required","workflow":"morning_check_in","scheduledTime":"05:30","completionCommand":null}},{"id":"reminder_fadogia","occurrenceDate":"2026-09-17","label":"Fadogia Agrestis","subtitle":"Morning","icon":"pills","color":"effort","state":"upcoming","completed":false,"completable":true,"executionContract":{"priorityId":"reminder_fadogia","occurrenceDate":"2026-09-17","expectedVersion":8},"notificationAction":{"classification":"direct_completion_allowed","workflow":"priority_detail","scheduledTime":"05:45","completionCommand":{"commandType":"priority.complete.v1","expectedVersion":8,"payload":{"priorityId":"reminder_fadogia","occurrenceDate":"2026-09-17"}}}}]}"#
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["home": productionEnvelope(resource: "home", data: data)]
        )
        let native = ProductionNativeAPI(
            baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport
        )
        _ = try await native.pair(
            pairingCredential: String(repeating: "p", count: 43), displayName: "Isolated fixture"
        )

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        XCTAssertTrue(home.todaysFocus.isEmpty)
        XCTAssertEqual(home.notificationCalendar.timeZone.identifier, "America/Los_Angeles")
        XCTAssertEqual(home.notificationScheduleItems.map(\.date), ["2026-09-17", "2026-09-17"])
        XCTAssertEqual(home.notificationScheduleItems.last?.icon, .pills)

        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let previousEvening = try XCTUnwrap(
            ISO8601DateFormatter().date(from: "2026-09-17T01:00:00Z")
        )
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: home.notificationScheduleItems,
            existingScheduledIdentifiers: [],
            now: previousEvening,
            calendar: pacific
        )
        XCTAssertEqual(Set(plan.toAdd.map(\.identifier)), [
            "priority.scheduled.reminder_morning_weight.2026-09-17",
            "priority.scheduled.reminder_fadogia.2026-09-17",
        ])
        let fires = try plan.toAdd.map { request in
            let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger)
            return try XCTUnwrap(pacific.date(from: trigger.dateComponents))
        }.sorted()
        XCTAssertEqual(fires, [
            try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-17T12:30:00Z")),
            try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-17T12:45:00Z")),
        ])
    }

    func testProductionHomeKeepsMorningWeighInCanonicalIdentityAnd0530Trigger() async throws {
        let homeJSON = productionEnvelope(resource: "home", data: #"{"header":{"greeting":"Good morning","name":"Founder"},"hero":{"mode":"active","goalLabel":"Current Goal","headline":"On track","supportLine":"Canonical state"},"nextBestAction":{"title":"Morning Weigh-In","icon":"scale","destination":{"id":"check-in","parameters":{"checkInType":"morning"}}},"briefingCards":[],"goals":[],"timezone":"America/Los_Angeles","todaysFocus":[{"id":"reminder_morning_weight","executionItemId":"execution_morning_weigh_in","occurrenceDate":"2026-09-16","label":"Morning Weigh-In","subtitle":"Overdue","metadata":"Daily · 5:30 AM","icon":"scale","color":"evidence","state":"overdue","completed":false,"completable":false,"executionContract":{"priorityId":"reminder_morning_weight","occurrenceDate":"2026-09-16","occurrenceKey":"reminder_morning_weight:2026-09-16","workflow":"morning_check_in","destination":"/check-in/morning"},"notificationAction":{"classification":"specialized_workflow_required","workflow":"morning_check_in","scheduledTime":"05:30","completionCommand":null}}]}"#)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["home": homeJSON])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Isolated fixture")

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let item = try XCTUnwrap(home.todaysFocus.first)
        XCTAssertEqual(item.id, "reminder_morning_weight")
        XCTAssertEqual(item.title, "Morning Weigh-In")
        XCTAssertEqual(item.notificationAction?.scheduledTime, "05:30")
        XCTAssertEqual(item.destination, .checkIn(checkInType: "morning"))

        var pacific = Calendar(identifier: .gregorian)
        pacific.timeZone = try XCTUnwrap(TimeZone(identifier: "America/Los_Angeles"))
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-16T12:20:00Z"))
        let plan = PriorityNotificationScheduler.reconciliationPlan(
            items: home.todaysFocus,
            existingScheduledIdentifiers: ["priority.scheduled.morning-check-in.2026-09-16"],
            now: now,
            calendar: pacific
        )
        let request = try XCTUnwrap(plan.toAdd.first)
        XCTAssertEqual(request.identifier, "priority.scheduled.reminder_morning_weight.2026-09-16")
        XCTAssertEqual(request.content.title, "Morning Weigh-In")
        XCTAssertEqual(request.content.categoryIdentifier, PriorityNotificationCategory.specializedWorkflow)
        let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger)
        XCTAssertEqual(pacific.date(from: trigger.dateComponents), ISO8601DateFormatter().date(from: "2026-09-16T12:30:00Z"))
        XCTAssertTrue(plan.toRemove.contains("priority.scheduled.morning-check-in.2026-09-16"))
    }

    func testInvalidatedReviewReadCannotJoinOldFlightOrEraseNewFlight() async throws {
        actor HeldReviewTransport: FounderHTTPTransport {
            let responses: [String]
            let started: [XCTestExpectation]
            var reads = 0
            var held: [Int: CheckedContinuation<Void, Never>] = [:]
            init(responses: [String], started: [XCTestExpectation]) {
                self.responses = responses
                self.started = started
            }
            func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
                let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
                if request.url?.path.hasSuffix("/auth/pair") == true { return (Data(responses[0].utf8), response) }
                reads += 1
                let index = reads
                if index <= 2 {
                    await withCheckedContinuation { continuation in
                        held[index] = continuation
                        started[index - 1].fulfill()
                    }
                } else { started[2].fulfill() }
                return (Data(responses[index == 1 ? 1 : 2].utf8), response)
            }
            func release(_ index: Int) { held.removeValue(forKey: index)?.resume() }
        }
        let oldStarted = expectation(description: "pre-disposition GET")
        let newStarted = expectation(description: "post-disposition GET")
        let unexpectedThird = expectation(description: "old completion must not detach new GET")
        unexpectedThird.isInverted = true
        let pending = productionEnvelope(resource: "evidence-review", data: #"{"review":{"id":"review-1","status":"pending","version":1}}"#)
        let discarded = productionEnvelope(resource: "evidence-review", data: #"{"review":{"id":"review-1","status":"discarded","version":2}}"#)
        let transport = HeldReviewTransport(responses: [sessionJSON(access: "a", refresh: "r"), pending, discarded], started: [oldStarted, newStarted, unexpectedThird])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Review race test")
        let api = ProductionEvidenceReviewAPI(api: native)
        let old = Task { try await api.fetchReview(reviewId: "review-1") }
        await fulfillment(of: [oldStarted], timeout: 2)
        await native.invalidateReadResources(["evidence-review"])
        let fresh = Task { try await api.fetchReview(reviewId: "review-1") }
        await fulfillment(of: [newStarted], timeout: 2)
        await transport.release(1)
        let oldValue = try await old.value
        XCTAssertEqual(oldValue?.version, 1)
        let joined = Task { try await api.fetchReview(reviewId: "review-1") }
        await fulfillment(of: [unexpectedThird], timeout: 0.2)
        await transport.release(2)
        let freshValue = try await fresh.value
        let joinedValue = try await joined.value
        XCTAssertEqual(freshValue?.status, "discarded")
        XCTAssertEqual(freshValue?.version, 2)
        XCTAssertEqual(joinedValue?.version, 2)
        let readCount = await transport.reads
        XCTAssertEqual(readCount, 2)
    }
    func testProductionExerciseConflictDecodesAllCandidatesWithoutAddingMembership() async throws {
        let conflict = #"{"status":409,"code":"CANONICAL_EXERCISE_DUPLICATE","title":"Choose an exercise","detail":"Several existing exercises match.","fieldErrors":[],"recovery":{"candidates":[{"id":"row_one","name":"Row One"},{"id":"row_two","name":"Row Two"}]}}"#
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), .json(409, conflict)])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Catalog test")
        let api = ProductionTrainingExerciseCatalogWriteAPI(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let result = try await api.createExercise(canonicalName: "Row", primaryMuscleGroupId: "back", equipment: nil, aliases: [])
        XCTAssertEqual(result, .candidates([CanonicalExerciseMatch(id: "row_one", name: "Row One"), CanonicalExerciseMatch(id: "row_two", name: "Row Two")]))
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2, "A duplicate response must not silently add membership or choose a candidate.")
    }
    func testProductionReadCacheReusesCanonicalEnvelopeAndInvalidatesNarrowly() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["weight": productionWeightJSON(value: 170.4)]
        )
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Cache test")

        _ = try await api.readWeight()
        _ = try await api.readWeight()
        var reads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/weight") == true }
        XCTAssertEqual(reads.count, 1)

        await api.invalidateReadResources(["weight"])
        _ = try await api.readWeight()
        reads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/weight") == true }
        XCTAssertEqual(reads.count, 2)
    }

    /// Regression for a real Build 33 defect: a training/workout command
    /// invalidated the cache key "log", but Log is actually cached under
    /// "evidence-review-queue" (`ProductionDailyDriverAPI.fetchLog()` calls
    /// `readResource("evidence-review-queue", ...)`) — the mismatch meant
    /// completing a workout never invalidated Log's cache at all, so a
    /// stale "Nothing logged yet" response could keep serving for up to
    /// the full cache TTL after a real, durably-committed workout.
    func testTrainingCommandsInvalidateTheActualLogCacheKey() async {
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: [:]))
        let affected = await api.resourcesAffected(by: "training-session.commit.v1")
        XCTAssertTrue(affected.contains("evidence-review-queue"), "Training commands must invalidate Log's real cache key, not a stale/unused one")
        XCTAssertFalse(affected.contains("log"), "\"log\" is not a real resource name — invalidating it is dead code")
    }

    func testEvidenceCommandsInvalidateTheActualLogCacheKey() async {
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: [:]))
        let affected = await api.resourcesAffected(by: "evidence-review.commit.v1")
        XCTAssertTrue(affected.contains("evidence-review-queue"))
        XCTAssertFalse(affected.contains("log"))
        for resource in ["training-library", "training-logger", "training-landing", "training-day", "training-session", "training-reporting"] {
            XCTAssertTrue(affected.contains(resource), "Training evidence changes must invalidate membership and reconciled workout projections.")
        }
    }

    func testWeightAndCheckInCommandsInvalidateTheirCanonicalReads() async {
        let api = ProductionNativeAPI(
            baseURL: testOrigin, credentialStore: MemoryCredentialStore(),
            transport: RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: [:])
        )
        let weight = await api.resourcesAffected(by: ProductionCommandType.submitWeight)
        XCTAssertEqual(weight, ["home", "weight"])
        let checkIn = await api.resourcesAffected(by: ProductionCommandType.submitCheckIn)
        XCTAssertEqual(checkIn, ["home", "weight", "morning-check-in", "priority"])
    }

    func testProductionReadCacheDeduplicatesConcurrentCanonicalReads() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["weight": productionWeightJSON(value: 170.4)]
        )
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Dedup test")

        async let first = api.readWeight()
        async let second = api.readWeight()
        _ = try await (first, second)

        let reads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/weight") == true }
        XCTAssertEqual(reads.count, 1)
    }

    func testNativeEnvironmentConfigurationPinsProductionAndPreservesSandbox() {
        XCTAssertEqual(NativeAPIEnvironment.founderProduction.baseURL.absoluteString, "https://physiqueos.dustinginn.com")
        XCTAssertEqual(NativeAPIEnvironment.founderProduction.routeFamily, "/api/v1/native")
        XCTAssertEqual(NativeAPIEnvironment.founderProduction.expectedAuthority, "founder-production")
        XCTAssertFalse(NativeAPIEnvironment.founderProduction.permitsProductWrites)

        XCTAssertEqual(NativeAPIEnvironment.sandbox.baseURL, FounderServerAPI.sandboxOrigin)
        XCTAssertEqual(NativeAPIEnvironment.sandbox.routeFamily, "/api/v1/native/sandbox")
        XCTAssertTrue(NativeAPIEnvironment.sandbox.permitsProductWrites)
    }

    func testAuthoritySelectionPersistsOnlyTheExplicitEnvironment() {
        let suite = "PhysiqueOS.NativeAuthoritySelection.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        XCTAssertNil(store.load())
        store.save(.founderProduction)
        XCTAssertEqual(store.load(), .founderProduction)
        store.save(.sandbox)
        XCTAssertEqual(store.load(), .sandbox)
    }

    func testAuthoritySwitchSelectsOnlyMatchingDailyDriverProviders() {
        let suite = "PhysiqueOS.DailyDriverProviderSelection.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let selection = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: selection)

        XCTAssertTrue(environment.homeAPI is FixtureHomeAPI)
        XCTAssertTrue(environment.goalsAPI is FixtureGoalsAPI)
        XCTAssertTrue(environment.trainingAPI is FixtureTrainingAPI)
        XCTAssertNil(environment.operatingPlanAPI)

        environment.selectNativeAuthority(.founderProduction)

        XCTAssertTrue(environment.homeAPI is ProductionHomeAPI)
        XCTAssertTrue(environment.goalsAPI is ProductionGoalsAPI)
        XCTAssertTrue(environment.trainingAPI is ProductionTrainingAPI)
        XCTAssertTrue(environment.nutritionAPI is ProductionNutritionAPI)
        XCTAssertTrue(environment.activityAPI is ProductionActivityAPI)
        XCTAssertTrue(environment.energyAPI is ProductionEnergyAPI)
        XCTAssertTrue(environment.priorityAPI is ProductionPriorityAPI)
        XCTAssertTrue(environment.trainingLoggerAPI is ProductionTrainingLoggerAPI)
        XCTAssertNotNil(environment.operatingPlanAPI)
        XCTAssertEqual(selection.load(), .founderProduction)
    }

    func testKeychainItemsAreAuthorityNamespacedWithoutWeakeningProtectionConfiguration() {
        let sandbox = KeychainFounderCredentialStore(namespace: .sandbox)
        let production = KeychainFounderCredentialStore(namespace: .founderProduction)

        XCTAssertEqual(sandbox.serviceIdentifier, "com.physiqueos.native.dev.founder-auth")
        XCTAssertEqual(production.serviceIdentifier, "com.physiqueos.native.founder-production-auth")
        XCTAssertNotEqual(sandbox.serviceIdentifier, production.serviceIdentifier)
        XCTAssertEqual(sandbox.accountIdentifier, production.accountIdentifier)
    }

    func testSandboxAndProductionCredentialsCannotOverwriteOrRevokeEachOther() throws {
        let vault = NamespacedMemoryCredentialVault()
        let sandbox = vault.store(namespace: .sandbox)
        let production = vault.store(namespace: .founderProduction)

        try sandbox.saveRefreshCredential("sandbox-refresh")
        try production.saveRefreshCredential("production-refresh")
        XCTAssertEqual(try sandbox.loadRefreshCredential(), "sandbox-refresh")
        XCTAssertEqual(try production.loadRefreshCredential(), "production-refresh")

        try production.deleteRefreshCredential()
        XCTAssertEqual(try sandbox.loadRefreshCredential(), "sandbox-refresh")
        XCTAssertNil(try production.loadRefreshCredential())
    }

    func testProductionPairingUsesAcceptedEndpointAndStoresOnlyProductionRefreshCredential() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r"))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "r", count: 43))
        let authenticatedDeviceId = try await api.authenticatedServerDeviceIdentity()
        XCTAssertEqual(authenticatedDeviceId, "server-device-1")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, ["/api/v1/native/auth/pair"])
        XCTAssertEqual(requests.first?.httpMethod, "POST")
        XCTAssertNil(requests.first?.value(forHTTPHeaderField: "Authorization"))
        let body = try XCTUnwrap(requests.first?.httpBody)
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(fields["platform"], "ios")
        XCTAssertEqual(fields["displayName"], "Founder iPhone")
    }

    func testHealthKitRepairAuthorityUsesServerDeviceAndReloadedReadOnlyPreflight() async throws {
        let preflight = productionEnvelope(
            resource: "healthkit-sep23-activity-repair-preflight",
            data: #"{"contractVersion":"healthkit-sep23-activity-repair-preflight-v1","localDate":"2026-09-23","authenticatedDeviceId":"server-device-1","runtimeSHA":"07ed8230be28c2bc4989e2167b028d0bf425c6fa","dailyPolicyDigest":"d5f0b571b6c046be9710a0551a6d4d230b249eb4088f79878f2647d3b5c40586","canonicalDayCount":1,"canonicalRevision":50,"canonicalSourceRevision":50,"sourceObservationCount":50,"historyCount":49,"september24ActivityCanonicalDayCount":0}"#
        )
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, preflight),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let authority = ProductionHealthKitObservationUploader(api: api)

        let authenticatedDeviceId = try await authority.healthKitAuthenticatedDeviceIdentity()
        XCTAssertEqual(authenticatedDeviceId, "server-device-1")
        let facts = try await authority.healthKitSeptember23ActivityRepairPreflight()

        XCTAssertTrue(facts.matchesFrozenContract)
        XCTAssertEqual(facts.authenticatedDeviceId, "server-device-1")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/auth/pair",
            "/api/v1/native/read/healthkit-sep23-activity-repair-preflight",
        ])
        XCTAssertEqual(requests.last?.httpMethod, "GET")
    }

    func testProductionProfileDecodesAndValidatesFounderAuthority() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionProfileJSON),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let profile = try await api.readProfile()

        XCTAssertEqual(profile.resource, "profile")
        XCTAssertEqual(profile.authority, "founder-production")
        XCTAssertEqual(profile.data.profile.identity?.displayName, "Founder")
        XCTAssertFalse(profile.data.authority.sandbox)
    }

    func testProductionContractsDecodeAdvertisedReadsWithoutEnablingWrites() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionContractsJSON),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let manifest = try await api.readContracts()

        XCTAssertEqual(manifest.contractVersion, "1")
        XCTAssertEqual(manifest.reads.map(\.resource), ["weight"])
        XCTAssertEqual(manifest.writes.map(\.commandType), ["weight.submit.v1"])
        XCTAssertFalse(NativeAPIEnvironment.founderProduction.permitsProductWrites)
    }

    func testPackage7WeightUsesGenericEnvelopeAndCanonicalRouteOnly() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionWeightJSON(value: 167.2, id: "weight-canonical")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let envelope = try await api.readWeight()

        XCTAssertEqual(envelope.contractVersion, "1")
        XCTAssertEqual(envelope.resource, "weight")
        XCTAssertEqual(envelope.data.currentWeight?.id, "weight-canonical")
        let paths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(paths.last, "/api/v1/native/read/weight")
        XCTAssertFalse(paths.contains("/api/v1/native/weight/summary"))
    }

    /// The completed `weight` contract (Patch 3 continuation) is a
    /// purpose-built Native projection — current/recentWeighIns/rolling
    /// averages/extrema/dexaContext are all server-computed and must be
    /// decoded and rendered verbatim, never re-derived. `extrema.goalRelevant`
    /// specifically replaces what used to be a Native-hardcoded contextId
    /// lookup table for which of Highest/Lowest to show.
    func testProductionWeightReportDecodesCompleteServerContractNotJustCurrentValue() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["weight": productionWeightFullJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let report = try await ProductionWeightEvidenceAPI(api: native).fetchWeightReport(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))

        XCTAssertEqual(report.current?.id, "weight-2")
        XCTAssertEqual(report.current?.value, "168.3 lb")
        XCTAssertEqual(report.recentWeighIns?.map(\.id), ["weight-2", "weight-1"])

        let rolling = try XCTUnwrap(report.rollingAverages)
        XCTAssertEqual(rolling.threeDay.value, 168.0)
        XCTAssertEqual(rolling.sevenDay.value, 167.7)

        // `extrema.goalRelevant` is server-decided (Build Lean Mass →
        // highest only) — the summary grid must respect it, never fall
        // back to a Native hardcoded lookup.
        let extrema = try XCTUnwrap(report.extrema)
        XCTAssertEqual(extrema.goalRelevant, ["highest"])
        XCTAssertEqual(extrema.highest?.value, 168.3)
        let summaryLabels = report.summary.map(\.label)
        XCTAssertTrue(summaryLabels.contains("Highest"))
        XCTAssertFalse(summaryLabels.contains("Lowest"))

        XCTAssertEqual(report.dexaContext?.latest?.id, "dexa-scan-1")
        XCTAssertEqual(report.dexaContext?.markers.count, 1)
        XCTAssertEqual(report.chart.markers.count, 1)

        // History arrives newest-first from the server; the chart must be
        // reversed to chronological for correct left-to-right rendering.
        XCTAssertEqual(report.history.map(\.id), ["weight-2", "weight-1"])
        XCTAssertEqual(report.chart.points.map(\.id), ["weight-1", "weight-2"])

        XCTAssertEqual(report.weeklyAverages.count, 1)
        XCTAssertEqual(report.page?.count, 2)
        XCTAssertEqual(report.page?.hasMore, false)

        // The pill selector must still work even though the completed
        // contract's `context` is the minimal shape (no server-sent
        // `options`/`dateRangeLabel`) — Native constructs the fixed
        // 3-pill chrome client-side from `contextId` alone.
        XCTAssertTrue(report.scope.options.contains { $0.label == "Build Lean Mass" && $0.selected })
    }

    func testEnvelopeFailsClosedOnAuthorityAndResourceMismatch() async throws {
        for (resource, authority, expected) in [
            ("weight", "founder-sandbox", "authority"),
            ("nutrition", "founder-production", "resource"),
        ] {
            let response = productionWeightJSON(value: 167.2, resource: resource, authority: authority)
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .json(200, response),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
            await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
                if expected == "authority" {
                    guard case ProductionNativeError.authorityMismatch = error else { return XCTFail("Expected authority mismatch") }
                } else {
                    guard case ProductionNativeError.resourceMismatch = error else { return XCTFail("Expected resource mismatch") }
                }
            }
        }
    }

    func testEnvelopeFailsClosedOnIncompatibleContractVersion() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionWeightJSON(value: 167.2, contractVersion: "2")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
            XCTAssertEqual(
                error as? ProductionNativeError,
                .incompatibleContractVersion(expected: "1", actual: "2")
            )
        }
    }

    func testProblemJSONPreservesFieldErrorsAndRecoveryWithoutStringMatching() async throws {
        let problem = #"{"problemVersion":"1","type":"https://physiqueos.app/problems/contract-validation-failed","title":"Invalid request","status":400,"code":"CONTRACT_VALIDATION_FAILED","detail":"One field is invalid.","instance":"/api/v1/native/read/weight","requestId":"request-1","fieldErrors":[{"field":"context","code":"invalid","detail":"Unsupported context."}],"recovery":{"action":"refresh"}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(400, problem),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
            guard case ProductionNativeError.validation(let details) = error else { return XCTFail("Expected validation error") }
            XCTAssertEqual(details.code, "CONTRACT_VALIDATION_FAILED")
            XCTAssertEqual(details.fieldErrors.first?.field, "context")
            XCTAssertEqual(details.recovery, .object(["action": .string("refresh")]))
        }
    }

    func testProblemStatusMappingCoversAuthenticationNotFoundPreconditionConflictAndTemporaryFailure() async throws {
        let cases: [(Int, String)] = [(401, "AUTHENTICATION_REQUIRED"), (404, "RESOURCE_NOT_FOUND"), (412, "STALE_VERSION"), (409, "CONFLICT"), (503, "INTERNAL_ERROR")]
        for (status, code) in cases {
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .json(status, productionProblemJSON(status: status, code: code)),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
            await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
                switch (status, error) {
                case (401, ProductionNativeError.unauthenticated),
                     (404, ProductionNativeError.notFound),
                     (412, ProductionNativeError.failedPrecondition),
                     (409, ProductionNativeError.conflict),
                     (503, ProductionNativeError.temporaryServer): break
                default: XCTFail("Unexpected status mapping: \(status), \(error)")
                }
            }
        }
    }

    func testProductionAccessRefreshRotatesCredentialAndRetriesReadOnce() async throws {
        let store = MemoryCredentialStore(refreshCredential: String(repeating: "r", count: 43))
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, productionWeightJSON(value: 167.2)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        let authenticatedDeviceId = try await api.authenticatedServerDeviceIdentity()
        XCTAssertEqual(authenticatedDeviceId, "server-device-1")
        _ = try await api.readWeight()

        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "s", count: 43))
        let paths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(paths, ["/api/v1/native/auth/refresh", "/api/v1/native/read/weight"])
    }

    func testProductionSessionRevocationDeletesOnlyInjectedProductionCredential() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"revoked":true}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        try await api.revokeCurrentSession()

        XCTAssertNil(try store.loadRefreshCredential())
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/native/auth/session")
        XCTAssertEqual(requests.last?.httpMethod, "DELETE")
    }

    /// Daily Driver Write Build: the guard moved from a blanket authority
    /// check to per-domain enablement. The deployed canonical command
    /// boundary enables only the accepted
    /// Daily Driver write domains. Sandbox remains independently writable.
    func testFounderProductionWriteGuardEnablesOnlyTheAcceptedDailyDriverDomainsAndSandboxRemainsIsolated() throws {
        XCTAssertEqual(
            NativeProductWriteDomain.enabledUnderFounderProduction,
            [.morningCheckInAndWeight, .workoutLogger, .nutrition, .activityEvidence, .evidenceReviewDismissal, .dexa, .progressPhotos, .priorityCompletion, .operatingPlan]
        )
        for domain in NativeProductWriteDomain.allCases {
            if NativeProductWriteDomain.enabledUnderFounderProduction.contains(domain) {
                XCTAssertNoThrow(try NativeProductWriteGuard.authorize(domain, in: .founderProduction), "\(domain) should be enabled under Founder Production")
            } else {
                XCTAssertThrowsError(try NativeProductWriteGuard.authorize(domain, in: .founderProduction)) { error in
                    XCTAssertEqual(error as? NativeWriteGuardError, .productionReadOnly(domain))
                }
            }
            XCTAssertNoThrow(try NativeProductWriteGuard.authorize(domain, in: .sandbox))
        }
        // Build 30 enables priority completion only after the read contract
        // supplies the canonical reminder version required by If-Match.
        XCTAssertNoThrow(try NativeProductWriteGuard.authorize(.priorityCompletion, in: .founderProduction))
    }

    // MARK: - Performance Phase 2: last-known Home, write retirement, request counts

    /// Snapshot fixtures are generated 2026-09-10T15:00Z; pin the same UTC day.
    private static func homeAPI(_ api: ProductionNativeAPI, now: Date = ISO8601DateFormatter().date(from: "2026-09-10T20:00:00Z")!, timeZone: String = "UTC") -> ProductionHomeAPI {
        ProductionHomeAPI(api: api, now: { now }, timeZone: { TimeZone(identifier: timeZone)! })
    }

    private static func temporarySnapshotStore() -> ProductionReadSnapshotStore {
        ProductionReadSnapshotStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("physiqueos-last-known-\(UUID().uuidString)", isDirectory: true))
    }

    /// Persists one authoritative Home through a fully paired API, then
    /// returns the shared snapshot store and credential store a relaunched
    /// process would reuse.
    private static func persistAuthoritativeHome(confidence: Int) async throws -> (ProductionReadSnapshotStore, MemoryCredentialStore) {
        let store = Self.temporarySnapshotStore()
        let credentials = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionHomeJSON(priorityID: "priority-old", goalID: "goal-server", confidence: confidence)),
        ])
        let first = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        _ = try await first.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        _ = try await Self.homeAPI(first).fetchHome()
        return (store, credentials)
    }

    func testLastKnownHomeSurvivesRelaunchWithoutAnyRequest() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([])
        let relaunched = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)

        let loaded = await Self.homeAPI(relaunched).lastKnownHome()
        let snapshot = try XCTUnwrap(loaded)
        XCTAssertEqual(snapshot.home.hero.confidence, 71)
        XCTAssertEqual(snapshot.generatedAt, "2026-09-10T15:00:00.000Z")
        let requestCount = await transport.requests.count
        XCTAssertEqual(requestCount, 0, "last-known Home must never touch the network")
    }

    func testLastKnownSnapshotIsNeverServedAsAReadResult() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, productionHomeJSON(priorityID: "priority-new", goalID: "goal-server", confidence: 74)),
        ])
        let relaunched = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)

        let home = try await Self.homeAPI(relaunched).fetchHome()
        XCTAssertEqual(home.hero.confidence, 74)
        let paths = await transport.requests.compactMap { $0.url?.path }
        XCTAssertEqual(paths.filter { $0.hasSuffix("/read/home") }.count, 1)
        let persisted = await Self.homeAPI(relaunched).lastKnownHome()
        let replaced = try XCTUnwrap(persisted)
        XCTAssertEqual(replaced.home.hero.confidence, 74, "each authoritative read replaces the snapshot")
    }

    @MainActor
    func testColdLaunchHomePaintsLabelledLastKnownWhenRefreshFails() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([.failure(URLError(.notConnectedToInternet))])
        let relaunched = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        let viewModel = HomeViewModel(
            api: Self.homeAPI(relaunched),
            priorityStore: LoggingSandboxStore(),
            goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: BriefingSandboxStore(),
            appliesSandboxProjections: false
        )

        await viewModel.load()

        guard case .loaded(let home) = viewModel.state else { return XCTFail("Expected last-known Home, got \(viewModel.state)") }
        XCTAssertEqual(home.hero.confidence, 71)
        XCTAssertTrue(viewModel.isShowingLastKnown)
        XCTAssertTrue(viewModel.lastKnownRefreshFailed)
        XCTAssertEqual(viewModel.lastKnownGeneratedAt, "2026-09-10T15:00:00.000Z")
        XCTAssertFalse(home.todaysFocus.isEmpty)
        XCTAssertTrue(home.todaysFocus.allSatisfy { !$0.completable }, "last-known priorities are never completable")
    }

    @MainActor
    func testColdLaunchHomeReplacesLastKnownWithAuthoritativeRead() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, productionHomeJSON(priorityID: "priority-new", goalID: "goal-server", confidence: 74)),
        ])
        let relaunched = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        let viewModel = HomeViewModel(
            api: Self.homeAPI(relaunched),
            priorityStore: LoggingSandboxStore(),
            goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: BriefingSandboxStore(),
            appliesSandboxProjections: false
        )

        await viewModel.load()

        guard case .loaded(let home) = viewModel.state else { return XCTFail("Expected authoritative Home") }
        XCTAssertEqual(home.hero.confidence, 74)
        XCTAssertEqual(home.todaysFocus.first?.id, "priority-new")
        XCTAssertTrue(home.todaysFocus.first?.completable == true)
        XCTAssertFalse(viewModel.isShowingLastKnown)
        XCTAssertFalse(viewModel.lastKnownRefreshFailed)

        // A warm revisit neither re-reads the snapshot nor re-requests Home.
        await viewModel.load()
        let homeReads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/home") == true }.count
        XCTAssertEqual(homeReads, 1)
    }

    func testPriorityCompletionRetiresLastKnownHome() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, productionCommandOutcomeJSON(result: #"{"status":"committed","record":{"id":"ignored"}}"#)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        let before = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNotNil(before)

        let writeAPI = ProductionPriorityCompletionWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        try await writeAPI.complete(priorityId: "completion-canonical", occurrenceDate: "2026-09-10", context: .init(occurrenceDate: "2026-09-10", dose: nil, protocolId: nil), expectedVersion: 7)

        let retired = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNil(retired, "a completed priority must not reappear from a pre-write snapshot on the next cold launch")
    }

    func testPairingClearsLastKnownHome() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "c", refresh: "t"))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        _ = try await api.pair(pairingCredential: String(repeating: "q", count: 43), displayName: "Founder iPhone")
        let cleared = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNil(cleared)
    }

    func testLastKnownHomeFromAnEarlierLocalDayIsRefused() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: SequencedFounderTransport([]), snapshotStore: store)
        let nextDay = ISO8601DateFormatter().date(from: "2026-09-11T00:30:00Z")!
        let refused = await Self.homeAPI(api, now: nextDay).lastKnownHome()
        XCTAssertNil(refused, "yesterday's Today's Focus must never be painted as last-known Home")
        let sameDay = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNotNil(sameDay)
    }

    func testRejectedRefreshCredentialRetiresLastKnownHome() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = SequencedFounderTransport([.problem(401, code: "REFRESH_CREDENTIAL_INVALID")])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        do {
            _ = try await Self.homeAPI(api).fetchHome()
            XCTFail("A revoked session must not read Home")
        } catch {}
        let retired = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNil(retired, "a Server-side revocation must not leave the session's Home on the device")
    }

    func testPullToRefreshInvalidationKeepsLastKnownHome() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: SequencedFounderTransport([]), snapshotStore: store)
        await api.invalidateReadResources(["home"], retainingLastKnown: true)
        let kept = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNotNil(kept, "an explicit refresh is not a write")
        await api.invalidateReadResources(["home"])
        let retired = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNil(retired)
    }

    func testHomeReadInFlightAcrossAWriteDoesNotRepersistPreWriteContent() async throws {
        let (store, credentials) = try await Self.persistAuthoritativeHome(confidence: 71)
        let transport = GatedHomeTransport(
            session: sessionJSON(access: "b", refresh: "s"),
            home: productionHomeJSON(priorityID: "priority-pre-write", goalID: "goal-server", confidence: 72)
        )
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        let read = Task { try await Self.homeAPI(api).fetchHome() }
        await transport.waitForHomeRequest()
        await api.invalidateReadResources(["home", "priority"])   // a write commits meanwhile
        await transport.releaseHome()
        _ = try await read.value
        let snapshot = await Self.homeAPI(api).lastKnownHome()
        XCTAssertNil(snapshot, "a read that started before the write must not persist its pre-write Home")
    }

    func testOnlyAllowlistedResourcesPersistLastKnownSnapshots() {
        XCTAssertEqual(ProductionNativeAPI.lastKnownSnapshotResources, ["home"])
        XCTAssertEqual(ProductionReadSnapshotStore.fileName(for: "home?presentationVersion=2"), "home%3FpresentationVersion%3D2")
    }

    func testForegroundRefreshOnlyForVisibleScreens() {
        XCTAssertTrue(ForegroundRefreshPolicy.shouldRefresh(phase: .active, isVisible: true))
        XCTAssertFalse(ForegroundRefreshPolicy.shouldRefresh(phase: .active, isVisible: false))
        XCTAssertFalse(ForegroundRefreshPolicy.shouldRefresh(phase: .background, isVisible: true))
        XCTAssertFalse(ForegroundRefreshPolicy.shouldRefresh(phase: .inactive, isVisible: true))
    }

    @MainActor
    func testProductionHomeUsesServerProjectionCachesWarmReadsAndExplicitlyRefetches() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionHomeJSON(priorityID: "priority-server-old", goalID: "goal-server", confidence: 71)),
            .json(200, productionHomeJSON(priorityID: "priority-server-new", goalID: "goal-server", confidence: 74)),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let viewModel = HomeViewModel(
            api: ProductionHomeAPI(api: native),
            priorityStore: LoggingSandboxStore(),
            goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: BriefingSandboxStore(),
            appliesSandboxProjections: false
        )

        await viewModel.load()
        guard case .loaded(let first) = viewModel.state else { return XCTFail("Expected production Home") }
        XCTAssertEqual(first.hero.confidence, 71)
        XCTAssertEqual(first.hero.mode, .phaseTrajectory)
        XCTAssertEqual(first.hero.primaryTimeline, "4 weeks remaining")
        XCTAssertNil(first.hero.daysRemaining)
        XCTAssertEqual(first.goals.first?.id, "goal-server")
        XCTAssertEqual(first.goals.first?.destination, .goalDetail(goalId: "goal-server"))
        XCTAssertEqual(first.goals.first?.current, "148.3")
        XCTAssertEqual(first.goals.first?.target, "10")
        // Home Phase Parity (Build 21 regression): Founder Production's
        // real Home renders EVERY phase of a two-phase goal — not just a
        // single collapsed active-phase summary line — matching
        // `GoalRow.jsx`'s `PhaseTrajectoryGoal` component (confirmed via a
        // live production comparison against physiqueos.dustinginn.com,
        // which showed both a completed "Phase 1 · Establish Maintenance"
        // card and an active "Phase 2 · Lean Mass Build" card, plus the
        // goal's guardrail, directly on Home). `order` is the server's
        // raw, ZERO-based phase index in both phase entries (confirmed
        // against the server's own test fixtures) — the `+ 1` display
        // ordinal is applied only by the view, never baked into the read
        // model, so this asserts the RAW order values survive the decode.
        XCTAssertEqual(first.goals.first?.presentation, .phaseTrajectory(HomePhaseTrajectory(
            targetDescription: "Build 10 lb of lean mass",
            overallTargetDate: "2026-10-31",
            guardrail: "Maintain approximately 8-9% body fat.",
            phases: [
                HomeGoalPhase(id: "phase-maintenance", order: 0, phaseName: "Establish Maintenance", status: "completed", presentationTone: "gold", progressType: "outcome", clampedProgressPercentage: 100, presentationLabel: "Completed", progressStatus: nil),
                HomeGoalPhase(id: "phase-lean-mass", order: 1, phaseName: "Lean Mass Build", status: "active", presentationTone: "green", progressType: "outcome", clampedProgressPercentage: 8, presentationLabel: "0.8 of 10 lb gained", progressStatus: "measured", startDate: "2026-08-16", calculatedPlannedReviewDate: "2026-10-08", timelineProgressState: "review_due"),
            ]
        )))
        XCTAssertEqual(first.todaysFocus.map(\.id), ["priority-server-old"])
        XCTAssertTrue(first.todaysFocus[0].completable)
        XCTAssertEqual(first.todaysFocus[0].expectedVersion, 7)
        XCTAssertEqual(first.todaysFocus[0].completionContext, .init(occurrenceDate: "2026-09-10", dose: nil, protocolId: nil))
        XCTAssertEqual(first.todaysFocus[0].destination, .priorityOccurrence(priorityId: "completion-canonical", occurrenceDate: "2026-09-10"))

        await viewModel.load()
        guard case .loaded(let cached) = viewModel.state else { return XCTFail("Expected cached production Home") }
        XCTAssertEqual(cached.hero.confidence, 71)
        await native.invalidateReadResources(["home"])
        await viewModel.load()
        guard case .loaded(let refreshed) = viewModel.state else { return XCTFail("Expected refreshed production Home") }
        XCTAssertEqual(refreshed.hero.confidence, 74)
        XCTAssertEqual(refreshed.todaysFocus.map(\.id), ["priority-server-new"])
        let homePaths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(Array(homePaths.suffix(2)), [
            "/api/v1/native/read/home", "/api/v1/native/read/home",
        ])
        let homePresentationVersions = await transport.requests.suffix(2).map { request in
            URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "presentationVersion" })?.value
        }
        XCTAssertEqual(homePresentationVersions, ["2", "2"])
    }

    func testCompletedMorningCheckInHomeCardKeepsExactCanonicalRouteAndOccurrenceDate() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["home": productionCompletedMorningHomeJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let occurrence = try XCTUnwrap(home.todaysFocus.first)

        XCTAssertTrue(occurrence.completed)
        XCTAssertEqual(occurrence.date, "2026-09-09")
        XCTAssertEqual(occurrence.destination, .priorityOccurrence(priorityId: "morning-check-in", occurrenceDate: "2026-09-09"))
    }

    func testProductionHomePreservesGroupedMorningSessionPresentation() async throws {
        let homeJSON = productionEnvelope(resource: "home", data: #"{"header":{"greeting":"Good morning","name":"Founder"},"hero":{"mode":"phase_trajectory","goalLabel":"Build Lean Mass","headline":"Lean Mass Build","supportLine":"Canonical trajectory","primaryTimeline":"7 weeks to goal target"},"nextBestAction":{"title":"Foam Rolling","icon":"activity","destination":{"id":"priority.detail","parameters":{"priorityId":"foam-rolling","occurrenceDate":"2026-09-13"}}},"briefingCards":[],"goals":[],"todaysFocus":[{"id":"morning-check-in","completionId":null,"executionId":"morning-check-in","occurrenceDate":"2026-09-13","label":"Morning Check-In","subtitle":"Complete today's scheduled morning evidence.","metadata":null,"changeLabel":null,"icon":"target","color":"primary","state":"available","completed":false,"completable":false,"actionLabel":null,"completionContext":null,"sessionItems":[{"id":"morning-weight","label":"Morning Weigh-In","completed":true,"satisfiedByEvidence":true},{"id":"sleep","label":"Sleep","completed":false,"satisfiedByEvidence":false}],"executionContract":{"priorityId":"morning-check-in","occurrenceDate":"2026-09-13","expectedVersion":12,"workflow":"morning_check_in","destination":"/check-in/morning"}}]}"#)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["home": homeJSON])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let occurrence = try XCTUnwrap(home.todaysFocus.first)
        XCTAssertEqual(home.hero.mode, .phaseTrajectory)
        XCTAssertEqual(home.hero.primaryTimeline, "7 weeks to goal target")
        XCTAssertEqual(occurrence.sessionItems, [
            PrioritySessionItem(id: "morning-weight", label: "Morning Weigh-In", completed: true, satisfiedByEvidence: true),
            PrioritySessionItem(id: "sleep", label: "Sleep", completed: false, satisfiedByEvidence: false),
        ])
        XCTAssertEqual(occurrence.destination, .checkIn(checkInType: "morning"))
    }

    func testProductionHomeAcceptsCanonicalStringExecutionDestinationAndKeepsExactOccurrenceIdentity() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["home": productionHomeJSON(priorityID: "reminder_foam_roll_daily", goalID: "goal-server", confidence: 74)]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let occurrence = try XCTUnwrap(home.todaysFocus.first)

        XCTAssertEqual(occurrence.date, "2026-09-10")
        XCTAssertEqual(occurrence.destination, .priorityOccurrence(priorityId: "completion-canonical", occurrenceDate: "2026-09-10"))
    }

    func testProductionHomeUsesArtifactIdentityForDEXABriefingDetail() async throws {
        let homeJSON = productionEnvelope(resource: "home", data: #"{"header":{"greeting":"Good morning","name":"Founder"},"hero":{"mode":"active","goalLabel":"Current Goal","headline":"On track","supportLine":"Canonical state"},"nextBestAction":{"title":"Review today","icon":"target","destination":{"id":"goal.detail","parameters":{"goalId":"goal-canonical"}}},"briefingCards":[{"id":"dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12","sectionLabel":"Event Briefing","title":"DEXA Analysis Ready","prompt":"Canonical narrative","createdAt":"2026-09-13T06:28:58.012Z","destination":{"id":"briefing.detail","parameters":{"briefingId":"dexa_scan|user_founder_001|2026-09-12","briefingType":"dexa"}}}],"goals":[],"todaysFocus":[]}"#)
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["home": homeJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let home = try await ProductionHomeAPI(api: native).fetchHome()
        let card = try XCTUnwrap(home.briefingCards.first)

        XCTAssertEqual(card.destination, .briefingDetail(briefingId: card.id))
    }

    func testProductionGoalsHandlesEmptyActiveStateAndPreservesCanonicalGoalPhaseIDs() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionEnvelope(resource: "goals", data: #"{"activeGoals":[],"completedGoals":[],"transitionEntry":null,"relationshipContext":{}}"#)),
            .json(200, productionGoalsJSON),
            .json(200, productionActiveGoalJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionGoalsAPI(api: native)

        let empty = try await api.fetchGoalsHub()
        XCTAssertNil(empty.activeGoal)
        XCTAssertTrue(empty.completedGoals.isEmpty)

        await native.invalidateReadResources(["goals"])
        let hub = try await api.fetchGoalsHub()
        let active = try XCTUnwrap(hub.activeGoal)
        let fetchedDetail = try await api.fetchGoalDetail(goalId: active.id)
        let detail = try XCTUnwrap(fetchedDetail?.active)
        XCTAssertEqual(active.id, "goal-canonical")
        XCTAssertEqual(active.currentPhaseName, "Foundation")
        XCTAssertEqual(detail.id, active.id)
        XCTAssertEqual(detail.activePhaseId, "phase-canonical")
        XCTAssertEqual(detail.activePhase?.id, "phase-canonical")

        // Confidence must carry movement/priorScore/delta and the full
        // explanation detail (supports/limits/what-changed/what's-next) —
        // a prior revision discarded everything but score/band/summary,
        // silently dropping data the server already computes and sends.
        XCTAssertEqual(detail.confidence.movement, "increased")
        XCTAssertEqual(detail.confidence.priorScore, 68)
        XCTAssertEqual(detail.confidence.delta, 6)
        let confidenceDetail = try XCTUnwrap(detail.confidence.detail)
        XCTAssertEqual(confidenceDetail.movementFactors, ["Confidence increased because training consistency improved."])
        XCTAssertEqual(confidenceDetail.supportingFactors, ["Training has been consistently strong for the last few weeks."])
        XCTAssertEqual(confidenceDetail.limitingFactors, ["Calories still need more consistency before we can tell whether this intake is right."])
        XCTAssertEqual(confidenceDetail.clarifyingFactors, ["Another body-composition check will confirm the trend."])
        XCTAssertEqual(confidenceDetail.summary, "Training and adherence have both been strong recently.")

        // `turningPoints[]` never carries an `id` on the wire — confirms a
        // stable id is still derived rather than the decode failing.
        let turningPoint = try XCTUnwrap(detail.turningPoints.first)
        XCTAssertEqual(turningPoint.id, "2026-07-19-Goal journey activated")
        XCTAssertEqual(turningPoint.title, "Goal journey activated")

        // `journey[]` carries the full chronology — a completed phase
        // must survive into `phases`, not just the currently active one,
        // and canonical numbering (not `journeyNumber - 1`) must be used.
        XCTAssertEqual(detail.orderedPhases.count, 2)
        let completedPhase = detail.orderedPhases[0]
        let activePhaseEntry = detail.orderedPhases[1]
        XCTAssertEqual(completedPhase.name, "Establish Maintenance")
        XCTAssertEqual(completedPhase.status, .completed)
        XCTAssertEqual(completedPhase.order, 1)
        XCTAssertEqual(completedPhase.progress.percentage, 100)
        XCTAssertEqual(activePhaseEntry.name, "Foundation")
        XCTAssertEqual(activePhaseEntry.status, .active)
        XCTAssertEqual(activePhaseEntry.order, 2)
        XCTAssertEqual(activePhaseEntry.id, "phase-canonical")

        // Historical (completed) phase detail must remain reachable, not
        // only the active phase — this is what makes Phase 1's own card
        // navigable in "Your Journey" instead of a dead end.
        let historical = try await api.fetchGoalPhase(goalId: "goal-canonical", phaseId: completedPhase.id)
        XCTAssertEqual(historical?.phase.name, "Establish Maintenance")
        XCTAssertEqual(historical?.phase.status, .completed)
    }

    /// Proves the chronology mapping is entirely data-driven — a
    /// three-phase journey with names/numbers that share nothing with any
    /// other fixture in this file must still come out in the right order,
    /// with the right names and statuses. If a future change reintroduced
    /// a hardcoded "Establish Maintenance"/"Lean Mass Build" or a
    /// two-phase assumption, this would catch it.
    func testProductionGoalChronologyIsFullyDataDrivenNotHardcodedToAnyPhaseNames() async throws {
        let threePhaseJourneyJSON = productionEnvelope(resource: "active-goal", data: #"{"goalId":"goal-canonical","phaseId":"phase-gamma","confidence":{"score":55,"band":"Moderate","summary":"Server confidence"},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Alpha Stage","number":1,"status":"Completed","dates":"Started Jan 1 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Beta Stage","number":2,"status":"Completed","dates":"Started Mar 1 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Gamma Stage","number":3,"status":"Active","dates":"Started Jun 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":40}],"currentPhase":{"id":"phase-gamma","goalId":"goal-canonical","title":"Gamma Stage","purpose":"Continue the plan","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain range","scope":"Every phase","body":"Server monitored","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[],"strategy":[]}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionGoalsJSON),
            .json(200, threePhaseJourneyJSON),
            .json(200, productionGoalsJSON),
            .json(200, threePhaseJourneyJSON),
            .json(200, productionGoalsJSON),
            .json(200, threePhaseJourneyJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionGoalsAPI(api: native)

        let fetchedDetail = try await api.fetchGoalDetail(goalId: "goal-canonical")
        let detail = try XCTUnwrap(fetchedDetail?.active)
        XCTAssertEqual(detail.orderedPhases.map(\.name), ["Alpha Stage", "Beta Stage", "Gamma Stage"])
        XCTAssertEqual(detail.orderedPhases.map(\.order), [1, 2, 3])
        XCTAssertEqual(detail.orderedPhases.map(\.status), [.completed, .completed, .active])
        XCTAssertEqual(detail.activePhase?.name, "Gamma Stage")
        XCTAssertEqual(detail.activePhaseId, "phase-gamma")

        // Every completed phase, not only the most recent one, must stay
        // independently reachable.
        let alpha = try await api.fetchGoalPhase(goalId: "goal-canonical", phaseId: detail.orderedPhases[0].id)
        let beta = try await api.fetchGoalPhase(goalId: "goal-canonical", phaseId: detail.orderedPhases[1].id)
        XCTAssertEqual(alpha?.phase.name, "Alpha Stage")
        XCTAssertEqual(beta?.phase.name, "Beta Stage")
    }

    func testProductionCompletedGoalUsesCanonicalReadWithoutWiringPrivatePhotosOrBriefings() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCompletedGoalsHubJSON),
            .json(200, productionCompletedGoalJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let detail = try await ProductionGoalsAPI(api: native).fetchGoalDetail(goalId: "goal-visible-abs")
        let completed = try XCTUnwrap(detail?.completed)
        XCTAssertEqual(completed.id, "goal-visible-abs")
        XCTAssertEqual(completed.achievement, "7.7% Body Fat")
        XCTAssertEqual(completed.highlights.map(\.title), ["The finish line aligned"])
        XCTAssertTrue(completed.photos.isEmpty)
        XCTAssertNil(completed.finalComposition.briefingDestination)
        XCTAssertEqual(completed.unlocked?.destination, .goalDetail(goalId: "goal-canonical"))
        let paths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(Array(paths.suffix(2)), ["/api/v1/native/read/goals", "/api/v1/native/read/completed-goal"])
    }

    func testProductionOperatingPlanAndPriorityUseCanonicalReadsAndVersionedCompletion() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionOperatingPlanJSON),
            .json(200, productionPriorityJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let plan = try await ProductionOperatingPlanAPI(api: native).fetchOperatingPlan()
        XCTAssertEqual(plan.sections.map(\.title), [
            "Energy Strategy", "Nutrition", "Training", "Recovery", "Peptides", "Supplements", "Tracking", "Coaching Updates",
        ])
        XCTAssertEqual(plan.sections.compactMap { $0.items.first?.destination }, [
            .operatingPlanStrategy(strategyType: "energy", strategyId: "energy-canonical"),
            .operatingPlanStrategy(strategyType: "nutrition", strategyId: "nutrition-canonical"),
            .operatingPlanStrategy(strategyType: "training", strategyId: "training-canonical"),
            .operatingPlanProtocolDomain(protocolId: "recovery-canonical"),
            .operatingPlanProtocolDomain(protocolId: "peptide-canonical"),
            .operatingPlanProtocolDomain(protocolId: "supplement-canonical"),
            .operatingPlanTracking,
            .operatingPlanStrategy(strategyType: "briefings", strategyId: "coaching-canonical"),
        ])
        XCTAssertTrue(plan.sections.first(where: { $0.title == "Supplements" })?.supplementsAction == true)

        let fetchedPriority = try await ProductionPriorityAPI(api: native).fetchPriority(priorityId: "priority-canonical", occurrenceDate: "2026-09-10")
        let priority = try XCTUnwrap(fetchedPriority)
        XCTAssertEqual(priority.id, "priority-canonical")
        XCTAssertEqual(priority.executionItemId, "execution-canonical")
        XCTAssertEqual(priority.date, "2026-09-10")
        XCTAssertTrue(priority.completable)
        XCTAssertEqual(priority.expectedVersion, 11)
        XCTAssertEqual(priority.completionContext, PriorityCompletionContext(occurrenceDate: "2026-09-10", dose: nil, protocolId: nil))
        XCTAssertEqual(priority.detailSections, [PrioritySectionReadModel(title: "Context", items: [PriorityDetailFieldReadModel(label: "Goal", detail: "Build Lean Mass")])])
        let requests = await transport.requests
        XCTAssertEqual(requests[1].url?.path, "/api/v1/native/read/operating-plan")
        XCTAssertEqual(requests[2].url?.path, "/api/v1/native/read/priority")
        XCTAssertEqual(URLComponents(url: requests[2].url!, resolvingAgainstBaseURL: false)?.queryItems,
                       [URLQueryItem(name: "occurrenceDate", value: "2026-09-10"), URLQueryItem(name: "priorityId", value: "priority-canonical")])
        XCTAssertNoThrow(try NativeProductWriteGuard.authorize(.priorityCompletion, in: .founderProduction))
        // Build 33: .operatingPlan is enabled for the recurring-support
        // shape (Recovery/Tracking) — see NativeProductWriteDomain
        // .enabledUnderFounderProduction's own doc comment for scope.
        XCTAssertNoThrow(try NativeProductWriteGuard.authorize(.operatingPlan, in: .founderProduction))
        XCTAssertThrowsError(try NativeProductWriteGuard.authorize(.goalAndPhaseTransitions, in: .founderProduction))
    }

    func testProductionPeptideSupportDecodesTheCanonicalEditorShape() async throws {
        let peptide = productionEnvelope(resource: "operating-plan-peptide-support", data: #"{"protocolId":"peptide-protocol","executionId":"execution-peptide","executionRevision":3,"name":"Retatrutide","purpose":"Support the active body-composition strategy.","state":"CANONICAL","supportSchedule":{"frequency":"weekly","daysOfWeek":["thursday"],"intervalDays":1,"timing":"specific","specificTime":"21:45","startDate":"2026-05-21","endDate":null},"dosing":{"pattern":"stay","startingDoseAmount":0.5,"startingDoseUnit":"mg","startDate":"2026-05-21","stepAmount":0,"stepInterval":1,"stepUnit":"weeks","targetDoseAmount":0,"holdDuration":1,"holdUnit":"weeks","decreaseAmount":0,"decreaseInterval":1,"decreaseUnit":"weeks","landingDoseAmount":0,"endDate":null},"timeline":[{"id":"execution-peptide:phase:1:2026-05-21","label":"Phase 1","window":"May 21, 2026 – Until changed","doseAmount":0.5,"doseUnit":"mg","status":"active"}],"reminderPreference":"remind","timingContext":"fasted_before_bed","notes":"Current plan"}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, peptide),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionPeptideSupportAPI(
            api: native,
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults())
        ).fetchSupport(protocolId: "peptide-protocol")
        let detail = try XCTUnwrap(fetched)

        XCTAssertEqual(detail.executionRevision, 3)
        XCTAssertEqual(detail.state, .canonical)
        XCTAssertEqual(detail.supportSchedule.specificTime, "21:45")
        XCTAssertEqual(detail.dosing.startingDoseAmount, 0.5)
        XCTAssertEqual(detail.timeline.first?.status, "active")
        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.url?.path, "/api/v1/native/read/operating-plan-peptide-support")
        XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems,
                       [URLQueryItem(name: "protocolId", value: "peptide-protocol")])
    }

    func testProductionOperatingPlanProtocolDomainDecodesTypedSupportDestination() async throws {
        let domain = productionEnvelope(resource: "operating-plan-protocol-domain", data: #"{"category":"peptide","title":"Peptide Strategy","purpose":"Canonical peptide support.","methods":[{"id":"peptide-protocol","protocolId":"peptide-protocol","name":"Retatrutide","purpose":"Body-composition support.","supportSummary":"Thu · 9:45 PM · 0.5 mg","currentDose":"0.5 mg","currentSchedule":"Thu · 9:45 PM","editDestination":{"id":"native.operating-plan.protocol.peptide","parameters":{"protocolId":"peptide-protocol"}}}]}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, domain),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let result = try await ProductionOperatingPlanProtocolDomainAPI(api: native)
            .fetchDomain(protocolId: "peptide-protocol")
        let method = try XCTUnwrap(result?.methods.first)
        XCTAssertEqual(result?.category, .peptide)
        XCTAssertEqual(method.editDestination, .operatingPlanPeptideExecution(protocolId: "peptide-protocol"))
        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.url?.path, "/api/v1/native/read/operating-plan-protocol-domain")
    }

    @MainActor
    func testSupplementCardsUseEachProductionReminderStateForBellAB() async throws {
        let domainJSON = productionEnvelope(resource: "operating-plan-protocol-domain", data: #"{"category":"supplement","title":"Supplement Strategy","purpose":"Canonical support.","methods":[{"id":"fadogia","protocolId":"fadogia","lifecycleState":"active","name":"Fadogia","purpose":"Support","supportSummary":"Daily","currentSchedule":"Daily","reminderEnabled":true},{"id":"electrolytes","protocolId":"electrolytes","lifecycleState":"active","name":"Electrolytes","purpose":"Support","supportSummary":"Daily","currentSchedule":"Daily","reminderEnabled":false}]}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, domainJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let domain = try await ProductionOperatingPlanProtocolDomainAPI(api: native)
            .fetchDomain(protocolId: "supplements")
        let methods = try XCTUnwrap(domain?.methods)
        let fadogia = try XCTUnwrap(methods.first { $0.id == "fadogia" })
        let electrolytes = try XCTUnwrap(methods.first { $0.id == "electrolytes" })

        XCTAssertTrue(OperatingPlanProtocolDomainView.showsReminderIndicator(
            method: fadogia, lifecycleState: fadogia.lifecycleState ?? "active"
        ))
        XCTAssertFalse(OperatingPlanProtocolDomainView.showsReminderIndicator(
            method: electrolytes, lifecycleState: electrolytes.lifecycleState ?? "active"
        ))
    }

    func testCanonicalUnconfiguredOperatingPlanDestinationRoundTripsWithoutWebRouting() throws {
        let data = Data(#"{"id":"native.operating-plan.status","parameters":{"domain":"energy","title":"Energy Strategy","detail":"No active strategy","status":"Not configured"}}"#.utf8)
        let destination = try JSONDecoder().decode(AppDestination.self, from: data)
        XCTAssertEqual(destination, .operatingPlanStatus(domain: "energy", title: "Energy Strategy", detail: "No active strategy", status: "Not configured"))
        XCTAssertEqual(try JSONDecoder().decode(AppDestination.self, from: JSONEncoder().encode(destination)), destination)
    }

    func testOperatingPlanPresentationHasExplicitProductionAuthorityBoundaries() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        func source(_ file: String) throws -> String {
            try String(contentsOf: root.appendingPathComponent("PhysiqueOS/Presentation/OperatingPlan/" + file), encoding: .utf8)
        }
        for file in ["OperatingPlanLandingView.swift", "OperatingPlanProtocolDomainView.swift", "OperatingPlanStrategyDetailView.swift", "OperatingPlanStrategyEditorView.swift", "OperatingPlanRecoverySupportView.swift", "OperatingPlanPeptideExecutionView.swift", "OperatingPlanSupplementSupportView.swift", "OperatingPlanSupplementEditorView.swift", "OperatingPlanTrackingView.swift"] {
            let text = try source(file)
            XCTAssertTrue(text.contains(".founderProduction"), file)
            XCTAssertFalse(text.contains("try?"), "Production errors must not be swallowed: " + file)
        }
        for file in ["OperatingPlanTrainingProtocolBuilderView.swift", "OperatingPlanDexaAppointmentView.swift"] {
            let text = try source(file)
            XCTAssertTrue(text.contains("environment.nativeAuthority == .founderProduction"), file)
            XCTAssertTrue(text.contains("OperatingPlanUnavailableView"), file)
        }
        let presentation = try source("OperatingPlanComponents.swift")
        XCTAssertFalse(presentation.contains("OperatingPlanSandboxStore"))
    }

    func testProductionSupplementSupportDecodesAndRoundTripsDualConcurrency() async throws {
        let json = productionEnvelope(resource: "operating-plan-supplement-support", data: #"{"protocolId":"supplement","supplementVersionId":"supplement-v1","goalId":"goal","executionId":"execution-supplement","executionRevision":3,"name":"Tongkat Ali","supportSummary":"Daily · Morning","doseAmount":"1","doseUnit":"capsule","supportSchedule":{"frequency":"daily","daysOfWeek":[],"intervalDays":1,"timing":"morning","specificTime":"","startDate":"2026-07-25","endDate":null},"reminderPreference":"remind","notes":"Current Support"}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, json),
            .json(200, #"{"outcome":"committed","receipt":{"status":"committed","result":{"status":"updated","protocolId":"supplement","executionId":"execution-supplement","executionRevision":4,"reminderId":"reminder-supplement"}}}"#),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Supplement test")
        let api = ProductionSupplementSupportAPI(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let fetched = try await api.fetchSupport(protocolId: "supplement")
        let detail = try XCTUnwrap(fetched)
        XCTAssertEqual(detail.readModel.doseAmount, "1")
        var schedule = detail.supportSchedule
        schedule.timing = .specific
        schedule.specificTime = "08:40"
        schedule.endDate = "2026-12-31"
        let saved = try await api.save(
            protocolId: detail.protocolId, supplementVersionId: detail.supplementVersionId,
            expectedRevision: detail.executionRevision, doseAmount: "2", doseUnit: "capsules",
            supportSchedule: schedule, reminderPreference: .remind, notes: "With breakfast"
        )
        XCTAssertEqual(saved.executionRevision, 4)
        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-Match"), "\"3\"")
        let envelope = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(envelope["commandType"] as? String, ProductionCommandType.saveSupplementSupport)
        let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
        XCTAssertEqual(payload["supplementVersionId"] as? String, "supplement-v1")
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual((draft["dose"] as? [String: String])?["amount"], "2")
        XCTAssertEqual((draft["supportSchedule"] as? [String: Any])?["specificTime"] as? String, "08:40")
    }

    func testProductionSupplementStrategyAndLifecycleUseCanonicalVersionTokens() async throws {
        let json = productionEnvelope(resource: "operating-plan-supplement-strategy-editor", data: #"{"mode":"edit","protocolId":"supplement","expectedCurrentVersionId":"supplement-v1","lifecycleState":"active","goalId":"goal","goalOptions":[{"id":"goal","title":"Build Lean Mass"}],"name":"Creatine","purpose":"Training support","role":"Daily support","startDate":"2026-07-25","initialStatus":"active"}"#)
        let receipt = #"{"outcome":"committed","receipt":{"status":"committed","result":{"status":"updated","operation":"edit","protocolId":"supplement","currentVersionId":"supplement-v2","lifecycleState":"active"}}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, json), .json(200, receipt), .json(200, receipt),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Supplement strategy test")
        let api = ProductionSupplementStrategyAPI(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let fetched = try await api.fetchEditor(protocolId: "supplement")
        let detail = try XCTUnwrap(fetched)
        var model = detail.readModel
        model.purpose = "Strength support"
        _ = try await api.save(detail, model: model)
        _ = try await api.changeLifecycle(protocolId: "supplement", operation: "pause", expectedCurrentVersionId: "supplement-v2")
        let requests = await transport.requests
        let writes = requests.filter { $0.url?.path.hasSuffix("/commands") == true }
        XCTAssertEqual(writes.count, 2)
        XCTAssertNil(writes[0].value(forHTTPHeaderField: "If-Match"))
        let edit = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(writes[0].httpBody)) as? [String: Any])
        let editPayload = try XCTUnwrap(edit["payload"] as? [String: Any])
        XCTAssertEqual((editPayload["draft"] as? [String: Any])?["expectedCurrentVersionId"] as? String, "supplement-v1")
        let lifecycle = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(writes[1].httpBody)) as? [String: Any])
        XCTAssertEqual(lifecycle["commandType"] as? String, ProductionCommandType.changeSupplementLifecycle)
        let lifecyclePayload = try XCTUnwrap(lifecycle["payload"] as? [String: Any])
        XCTAssertEqual(lifecyclePayload["operation"] as? String, "pause")
        XCTAssertEqual(lifecyclePayload["expectedCurrentVersionId"] as? String, "supplement-v2")
    }

    func testProductionEnergyStrategyIsCanonicalReadOnlyAndReadErrorsFailClosed() async throws {
        let json = productionEnvelope(resource: "operating-plan-energy-strategy", data: #"{"protocolId":"energy","title":"Maintenance Calibration","purpose":"Canonical energy strategy","goal":"Your Build Lean Mass goal","startedDate":"July 25, 2026","status":"Active","fields":[{"label":"Caloric Intake","value":"2300 kcal/day"}],"editLabel":null,"intentionallyReadOnly":true}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, json),
            .json(404, #"{"problemVersion":"1","status":404,"code":"RESOURCE_NOT_FOUND","title":"Unavailable"}"#),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Energy test")
        let api = ProductionEnergyStrategyAPI(api: native)
        let detail = try await api.fetchDetail(strategyId: "energy")
        XCTAssertNil(detail?.readModel.editDestination)
        XCTAssertEqual(detail?.readModel.fields.first?.value, "2300 kcal/day")
        do {
            _ = try await api.fetchDetail(strategyId: "missing")
            XCTFail("Production failures must not return a fixture detail")
        } catch {}
    }

    func testProductionCoachingEditorRoundTripsOneCompositeSaveAndAllConcurrencyFences() async throws {
        let json = productionEnvelope(resource: "operating-plan-coaching-updates", data: #"{"protocolId":"coaching","title":"Wednesday and Sunday Coaching","purpose":"Timely coaching","goal":"Your current goal","startedDate":"July 25, 2026","status":"Active","fields":[],"editLabel":"Edit Coaching Updates","context":{"expectedCurrentVersionId":"coaching-v1","expectedRevision":85,"expectedSemanticDigest":"coaching-digest","photoExpectedCurrentVersionId":"photos-v1","photoExpectedSemanticDigest":"photo-digest","dexaExpectedRevision":3},"editor":{"strategyId":"coaching","midweek":{"enabled":true,"day":"wednesday","localTime":"08:15"},"weekly":{"enabled":true,"day":"sunday","localTime":"09:00"},"monthly":{"enabled":true,"dayOfMonth":1,"localTime":"08:00"},"photos":{"cadence":"weekly_interval_2","day":"saturday","timeOfDay":"afternoon","reminderEnabled":true},"dexa":{"plannedDate":"2026-10-15","localTime":"07:30","reminderPreferences":["day_before"],"uploadReminder":true,"preparationNote":"Arrive hydrated"},"photoEventBriefingEnabled":true,"dexaEventBriefingEnabled":true,"notificationPreference":"available_without_notification"}}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, json),
            .json(200, #"{"outcome":"committed","receipt":{"status":"committed","result":{"status":"updated","protocolId":"coaching","revision":86,"coachingChanged":true,"photosChanged":true,"photoReminderChanged":true,"dexaChanged":true}}}"#),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Coaching test")
        let api = ProductionCoachingUpdatesAPI(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let fetched = try await api.fetchDetail(strategyId: "coaching")
        let detail = try XCTUnwrap(fetched)
        XCTAssertEqual(detail.editor.photos.cadence, .everyTwoWeeks)
        var model = detail.editor
        model.photos.day = .sunday
        model.photos.timeOfDay = .specific
        model.photos.specificTime = "17:35"
        model.photos.reminderEnabled = false
        model.dexa.plannedDate = "2026-10-22"
        model.dexa.preparationNote = "Updated clinic note"
        model.photoEventBriefingEnabled = false
        let saved = try await api.save(detail, model: model)
        XCTAssertEqual(saved.revision, 86)
        let requests = await transport.requests
        let writes = requests.filter { $0.url?.path.hasSuffix("/commands") == true }
        XCTAssertEqual(writes.count, 1, "Coaching, Photos, and DEXA must not be independent writes")
        let request = try XCTUnwrap(writes.first)
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-Match"), "\"85\"")
        let envelope = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(envelope["commandType"] as? String, ProductionCommandType.saveCoachingUpdates)
        let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
        XCTAssertEqual(payload["expectedCurrentVersionId"] as? String, "coaching-v1")
        XCTAssertEqual(payload["expectedSemanticDigest"] as? String, "coaching-digest")
        XCTAssertEqual(payload["photoExpectedCurrentVersionId"] as? String, "photos-v1")
        XCTAssertEqual(payload["photoExpectedSemanticDigest"] as? String, "photo-digest")
        XCTAssertEqual(payload["dexaExpectedRevision"] as? Int, 3)
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual((draft["photos"] as? [String: Any])?["day"] as? String, "sunday")
        XCTAssertEqual((draft["photos"] as? [String: Any])?["timeOfDay"] as? String, "specific")
        XCTAssertEqual((draft["photos"] as? [String: Any])?["specificTime"] as? String, "17:35")
        XCTAssertEqual((draft["dexa"] as? [String: Any])?["plannedDate"] as? String, "2026-10-22")
        let affected = await native.resourcesAffected(by: ProductionCommandType.saveCoachingUpdates)
        XCTAssertTrue(affected.isSuperset(of: ["operating-plan", "operating-plan-coaching-updates", "home", "priority", "photos", "dexa"]))
    }

    func testProductionPeptideEditorRoundTripsDoseScheduleAndExecutionRevision() async throws {
        let commandResult = #"{"outcome":"committed","receipt":{"status":"committed","result":{"status":"updated","protocolId":"peptide-protocol","executionId":"execution-peptide","executionRevision":4},"operationId":null,"commandId":"01911111-1111-7111-8111-111111111119"}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, commandResult),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionPeptideSupportAPI(
            api: native,
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults())
        )
        let schedule = OperatingPlanSupportScheduleReadModel(
            frequency: .weekly, daysOfWeek: [.thursday], intervalDays: 1,
            timing: .specific, specificTime: "20:30", startDate: "2026-05-21", endDate: nil
        )
        let dosing = PeptideDosingStrategyReadModel(
            pattern: .titrateUp, startingDoseAmount: 0.75, startingDoseUnit: "mg", startDate: "2026-05-21",
            stepAmount: 0.25, stepInterval: 1, stepUnit: .weeks, targetDoseAmount: 1.5,
            holdDuration: 1, holdUnit: .weeks, decreaseAmount: 0.25, decreaseInterval: 1,
            decreaseUnit: .weeks, landingDoseAmount: 0.75, endDate: nil
        )

        let saved = try await api.save(
            protocolId: "peptide-protocol", expectedRevision: 3,
            supportSchedule: schedule, dosing: dosing, timingContext: "fasted_before_bed",
            reminderPreference: .remind, notes: "Combined edit"
        )

        XCTAssertEqual(saved.executionRevision, 4)
        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.url?.path, "/api/v1/native/commands")
        XCTAssertEqual(request.value(forHTTPHeaderField: "If-Match"), "\"3\"")
        let envelope = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(envelope["commandType"] as? String, "operating-plan.peptide-support.save.v1")
        let payload = try XCTUnwrap(envelope["payload"] as? [String: Any])
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        let encodedSchedule = try XCTUnwrap(draft["supportSchedule"] as? [String: Any])
        let encodedDosing = try XCTUnwrap(draft["dosingStrategy"] as? [String: Any])
        let startingDose = try XCTUnwrap(encodedDosing["startingDose"] as? [String: Any])
        XCTAssertEqual(encodedSchedule["specificTime"] as? String, "20:30")
        XCTAssertEqual(encodedDosing["pattern"] as? String, "titrate_up")
        XCTAssertEqual(startingDose["amount"] as? Double, 0.75)
        XCTAssertEqual(draft["reminderPreference"] as? String, "remind")
    }

    /// Build 21 item 11 (Priority Detail timing parity): confirmed against
    /// the server's own `PriorityDetailService.js` — when a reminder's
    /// `schedule.timeOfDay` is an explicit `HH:MM` clock value (not a
    /// daypart keyword), the server's own "When" section text already
    /// says so verbatim (e.g. "Scheduled for 5:00 PM."). Native must
    /// never re-derive this from a vaguer field like a daypart label or
    /// the word "Tonight" — it only has to render whatever the "When"
    /// section already says, which `detailSections` already carries
    /// end-to-end since Build 21's full-sections decode. This fixture
    /// reproduces the real "Foam Rolling" recurring-protocol shape.
    func testProductionPriorityDetailSurfacesExplicitScheduledClockTimeVerbatim() async throws {
        let foamRollingJSON = productionEnvelope(resource: "priority", data: #"{"id":"foam-rolling","title":"Foam Rolling","subtitle":"Tonight","status":"Upcoming","sections":[{"title":"When","items":[{"label":"Schedule","detail":"Foam Rolling is scheduled Daily · 5:00 PM"}]},{"title":"Why it matters","items":[{"label":"Purpose","detail":"Supports recovery between resistance sessions."}]}],"completionContext":null,"executionContract":{"priorityId":"foam-rolling","occurrenceDate":"2026-09-11","occurrenceKey":"foam-rolling:2026-09-11","workflow":"priority_detail","destination":{"id":"priority.detail","parameters":{"priorityId":"foam-rolling"}}},"executionProjection":{"executionId":"execution-foam-rolling"}}"#)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["priority": foamRollingJSON])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionPriorityAPI(api: native).fetchPriority(priorityId: "foam-rolling")
        let priority = try XCTUnwrap(fetched)

        let whenSection = try XCTUnwrap(priority.detailSections?.first { $0.title == "When" })
        XCTAssertEqual(whenSection.items.first?.detail, "Foam Rolling is scheduled Daily · 5:00 PM")
        // The explicit clock time must survive completely untouched —
        // Native never invents, reformats, or derives a time from "Tonight".
        XCTAssertTrue(whenSection.items.first?.detail?.contains("5:00 PM") == true)
    }

    /// Build 22: production Priority detail carries its own exact-date
    /// Weight relationship. Native must not issue the current-day
    /// Morning Check-In read when a historical occurrence is opened.
    @MainActor
    func testPriorityDetailViewModelUsesOccurrenceBoundWeightWithoutCurrentDayFallback() async throws {
        struct StubPriorityAPI: PriorityAPI {
            let occurrence: PriorityOccurrence
            func fetchExecutionItems() async throws -> [ExecutionItemFixture] { [] }
            func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence? {
                XCTAssertEqual(occurrenceDate, "2026-09-10")
                return occurrence
            }
        }
        struct StubMorningCheckInAPI: MorningCheckInAPI {
            func fetchMorningCheckIn() async throws -> MorningCheckInReadModel {
                XCTFail("Production historical Priority must not fetch current Morning Check-In")
                throw NotAvailableMorningCheckInAPI.NotAvailable()
            }
        }

        let morningWeighIn = PriorityOccurrence(
            id: "priority-morning", executionItemId: "execution_morning_weigh_in", date: "2026-09-10",
            title: "Morning Check-In", subtitle: nil, metadata: nil, changeLabel: nil,
            icon: .target, color: .primary, urgency: .available, completed: true, completable: false,
            actionLabel: nil, completionContext: nil, continueActionDestination: nil,
            relatedWeight: PriorityRelatedWeight(canonicalId: "weight-1", date: "2026-09-10", value: 172.9, unit: "lb", version: 2)
        )
        let morningViewModel = PriorityDetailViewModel(
            api: StubPriorityAPI(occurrence: morningWeighIn), morningCheckInAPI: StubMorningCheckInAPI(),
            store: LoggingSandboxStore(), authority: .founderProduction, priorityId: "priority-morning", occurrenceDate: "2026-09-10"
        )
        await morningViewModel.load()
        guard case .loaded(.some(let loaded)) = morningViewModel.state else { return XCTFail("Expected occurrence") }
        XCTAssertEqual(loaded.relatedWeight?.canonicalId, "weight-1")
        XCTAssertEqual(loaded.relatedWeight?.date, "2026-09-10")
        XCTAssertNil(morningViewModel.morningCheckIn)
        XCTAssertEqual(loaded.destination, .priorityOccurrence(priorityId: "priority-morning", occurrenceDate: "2026-09-10"))
    }

    @MainActor
    func testPriorityDetailKeepsDurableCompletionWhenImmediateRefreshFails() async throws {
        let occurrence = PriorityOccurrence(
            id: "foam", routePriorityId: "reminder-foam", executionItemId: "execution-foam", date: "2026-09-13",
            title: "Foam Rolling", subtitle: "Tonight", metadata: nil, changeLabel: nil,
            icon: .activity, color: .success, urgency: .available, completed: false, completable: true,
            expectedVersion: 4, actionLabel: nil,
            completionContext: .init(occurrenceDate: "2026-09-13", dose: nil, protocolId: nil),
            continueActionDestination: nil
        )
        let priorityAPI = FirstPriorityThenFailureAPI(occurrence: occurrence)
        let writer = RecordingPriorityCompletionAPI()
        var cleanedOccurrences: [String] = []
        let viewModel = PriorityDetailViewModel(
            api: priorityAPI, writeAPI: writer, morningCheckInAPI: NotAvailableMorningCheckInAPI(),
            store: LoggingSandboxStore(), authority: .founderProduction,
            priorityId: "reminder-foam", occurrenceDate: "2026-09-13",
            notificationCleanup: { priorityId, occurrenceDate in
                cleanedOccurrences.append("\(priorityId)|\(occurrenceDate)")
            }
        )

        await viewModel.load()
        await viewModel.complete()

        guard case .loaded(.some(let acknowledged)) = viewModel.state else {
            return XCTFail("Durable completion must survive a later read outage")
        }
        XCTAssertTrue(acknowledged.completed)
        XCTAssertFalse(acknowledged.completable)
        let submissionCount = await writer.submissionCount
        XCTAssertEqual(submissionCount, 1)
        XCTAssertEqual(cleanedOccurrences, ["reminder-foam|2026-09-13"])
    }

    @MainActor
    func testPriorityDetailAcknowledgesCompletionBeforeNotificationReconciliation() async throws {
        let occurrence = PriorityOccurrence(
            id: "foam", routePriorityId: "reminder-foam", executionItemId: "execution-foam", date: "2026-09-13",
            title: "Foam Rolling", subtitle: "Tonight", metadata: nil, changeLabel: nil,
            icon: .activity, color: .success, urgency: .available, completed: false, completable: true,
            expectedVersion: 4, actionLabel: nil,
            completionContext: .init(occurrenceDate: "2026-09-13", dose: nil, protocolId: nil),
            continueActionDestination: nil
        )
        let writer = RecordingPriorityCompletionAPI()
        var stateWhenCleanupStarted: PriorityDetailViewModel.LoadState?
        var viewModel: PriorityDetailViewModel!
        viewModel = PriorityDetailViewModel(
            api: FirstPriorityThenFailureAPI(occurrence: occurrence), writeAPI: writer,
            morningCheckInAPI: NotAvailableMorningCheckInAPI(),
            store: LoggingSandboxStore(), authority: .founderProduction,
            priorityId: "reminder-foam", occurrenceDate: "2026-09-13",
            notificationCleanup: { _, _ in
                // Production cleanup performs a full canonical Home read here.
                stateWhenCleanupStarted = viewModel.state
            }
        )

        await viewModel.load()
        await viewModel.complete()

        guard case .loaded(.some(let seen)) = stateWhenCleanupStarted else {
            return XCTFail("Completion must be visibly acknowledged before notification reconciliation runs")
        }
        XCTAssertTrue(seen.completed)
        XCTAssertFalse(seen.completable)
    }

    @MainActor
    func testHomeKeepsDurablePriorityCompletionWhenReconciliationReadFails() async throws {
        let occurrence = PriorityOccurrence(
            id: "foam", routePriorityId: "reminder-foam", executionItemId: "execution-foam", date: "2026-09-13",
            title: "Foam Rolling", subtitle: "Tonight", metadata: nil, changeLabel: nil,
            icon: .activity, color: .success, urgency: .available, completed: false, completable: true,
            expectedVersion: 4, actionLabel: nil, completionContext: nil, continueActionDestination: nil
        )
        let initial = HomeReadModel(
            header: .init(greeting: "Good afternoon", name: "Founder"),
            hero: .init(mode: .phaseTrajectory, goalLabel: "Build Lean Mass", headline: "Lean Mass Build", supportLine: "Canonical", confidence: 62, confidenceDetail: nil, primaryTimeline: "7 weeks to goal target", projectedFinish: nil, daysRemaining: nil, actionLabel: nil, actionDestination: nil),
            nextBestAction: .init(title: "Foam Rolling", icon: .activity, destination: occurrence.destination),
            briefingCards: [], goals: [], todaysFocus: [occurrence]
        )
        let api = FirstHomeThenFailureAPI(home: initial)
        let viewModel = HomeViewModel(
            api: api, priorityStore: LoggingSandboxStore(), goalsSandboxStore: GoalsSandboxStore(),
            briefingStore: BriefingSandboxStore(), appliesSandboxProjections: false
        )

        await viewModel.load()
        await viewModel.reconcileAfterConfirmedPriorityCompletion(occurrenceID: "foam")

        guard case .loaded(let home) = viewModel.state else {
            return XCTFail("Durable completion must not become a Home load failure")
        }
        XCTAssertFalse(home.todaysFocus.contains { $0.id == "foam" })
    }

    /// `LogFixture.json`'s exact bundled values ("Strength Training · 52
    /// min", "3 meals · 2,140 calories", "Nothing logged yet", the August
    /// 28 "Check-in ready to review" pending item) were showing under
    /// Founder Production even before the Founder had logged anything
    /// today — `AppEnvironment.logAPI` was a stored constant that never
    /// switched with authority. This proves the corrected
    /// `ProductionLogAPI` reflects real canonical current-day state
    /// instead, and specifically that none of the fixture's values leak
    /// through.
    func testProductionLogReflectsCanonicalTodayNotFixtureTrainingNutritionOrActivity() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["evidence-review-queue": productionLogJSON, "weight": productionWeightForLogJSON(date: "2026-09-10", value: 172.9)]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertEqual(log.localDate, "2026-09-10")
        XCTAssertEqual(log.loggedToday.map(\.kind), [.training, .nutrition, .activity, .weight])
        // Logged Today's 4th row (Build 21): exact intended-date canonical
        // Weight, never a "latest weight" fallback — the fixture's
        // `current.date` matches `localDate` exactly.
        let weightRow = log.loggedToday[3]
        XCTAssertEqual(weightRow.summary, "172.9 lb")
        XCTAssertEqual(weightRow.destination, .progressStream(streamId: "weight"))

        let training = log.loggedToday[0]
        XCTAssertNotEqual(training.summary, "Strength Training · 52 min")
        XCTAssertEqual(training.summary, "Traditional Strength Training · 45 min")
        XCTAssertEqual(training.destination, .trainingSession(sessionId: "session-canonical"))

        let nutrition = log.loggedToday[1]
        XCTAssertNotEqual(nutrition.summary, "3 meals · 2,140 calories")
        XCTAssertEqual(nutrition.summary, "4 meals · 2300 calories")
        XCTAssertEqual(nutrition.destination, .nutritionDay(dayId: "nutrition-day-canonical"))

        let activity = log.loggedToday[2]
        XCTAssertNotEqual(activity.summary, "Nothing logged yet")
        XCTAssertEqual(activity.summary, "650 active calories")
        XCTAssertEqual(activity.destination, .activityDay(date: "2026-09-10"))

        // The pending review must be the real canonical one, never the
        // fixture's `review-fixture-001` / "Friday, August 28" entry.
        let review = try XCTUnwrap(log.pendingEvidenceReviews.first)
        XCTAssertNotEqual(review.id, "review-fixture-001")
        XCTAssertEqual(review.id, "review-canonical")
        XCTAssertEqual(review.date, "Thursday, September 10")
        XCTAssertEqual(review.destination, .evidenceReview(reviewId: "review-canonical"))
    }

    /// When nothing is genuinely logged yet and no review is genuinely
    /// pending, Founder Production must show that honestly (the server's
    /// own "Nothing logged yet" / an empty review queue) rather than
    /// falling back to fixture content to fill the screen.
    func testProductionLogWithNothingLoggedYetShowsHonestEmptyStateNotFixtureFallback() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "evidence-review-queue": productionEnvelope(resource: "evidence-review-queue", data: #"{"localDate":"2026-09-10","loggedToday":{"rows":[{"id":"training","summary":"Nothing logged yet","context":null,"recordId":null},{"id":"nutrition","summary":"Nothing logged yet","context":null,"recordId":null},{"id":"activity","summary":"Nothing logged yet","context":null,"recordId":null}]},"pendingEvidenceReviews":[]}"#),
                "weight": productionWeightForLogJSON(date: nil, value: nil),
            ]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertTrue(log.loggedToday.allSatisfy { $0.summary == "Nothing logged yet" })
        // The synthesized Weight row is still tappable (it always points at
        // the Weight progress stream) even with nothing logged today — only
        // the wire-decoded training/nutrition/activity rows go fully inert
        // (`destination == nil`) in the honest empty state.
        XCTAssertTrue(log.loggedToday.filter { $0.kind != .weight }.allSatisfy { $0.destination == nil })
        let weightRow = try XCTUnwrap(log.loggedToday.first { $0.kind == .weight })
        XCTAssertEqual(weightRow.destination, .progressStream(streamId: "weight"))
        XCTAssertTrue(log.pendingEvidenceReviews.isEmpty)
        XCTAssertFalse(log.hasPendingEvidenceReviews)
    }

    func testProductionLogSeparatesAcceptedProcessingFromActionableReviewsAndLoggedDurability() async throws {
        let processingJSON = productionEnvelope(
            resource: "evidence-review-queue",
            data: #"{"localDate":"2026-09-16","loggedToday":{"rows":[{"id":"training","summary":"Nothing logged yet","context":null,"recordId":null,"processing":false},{"id":"nutrition","summary":"Nutrition processing","context":"Confirmation accepted · No action required","recordId":null,"processing":true},{"id":"activity","summary":"Nothing logged yet","context":null,"recordId":null,"processing":false}]},"pendingEvidenceReviews":[],"processingEvidenceReviews":[{"id":"review-nutrition","localDate":"2026-09-16","domain":"nutrition","label":"Nutrition","status":"committing"}]}"#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "evidence-review-queue": processingJSON,
                "weight": productionWeightForLogJSON(date: nil, value: nil),
            ]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertTrue(log.pendingEvidenceReviews.isEmpty)
        XCTAssertFalse(log.hasPendingEvidenceReviews)
        let nutrition = try XCTUnwrap(log.loggedToday.first { $0.kind == .nutrition })
        XCTAssertEqual(nutrition.summary, "Nutrition processing")
        XCTAssertEqual(nutrition.context, "Confirmation accepted · No action required")
        XCTAssertEqual(nutrition.processing, true)
        XCTAssertNil(nutrition.destination, "Accepted processing is not fabricated as canonical logged data.")
        XCTAssertEqual(log.processingEvidenceReviews?.map(\.id), ["review-nutrition"])
    }

    func testAcceptedTrainingReviewCannotReappearAsReadyWhileQueueProjectionCatchesUp() async throws {
        let queue = productionEnvelope(
            resource: "evidence-review-queue",
            data: #"{"localDate":"2026-09-18","loggedToday":{"rows":[{"id":"training","summary":"Nothing logged yet","context":null,"recordId":null,"processing":false},{"id":"nutrition","summary":"Nothing logged yet","context":null,"recordId":null,"processing":false},{"id":"activity","summary":"Nothing logged yet","context":null,"recordId":null,"processing":false}]},"pendingEvidenceReviews":[{"id":"review-training","date":"Friday, September 18","title":"Training ready to review","summary":"1 session","likelyDuplicate":false}],"processingEvidenceReviews":[]}"#
        )
        let review = productionEnvelope(
            resource: "evidence-review",
            data: #"{"review":{"id":"review-training","status":"pending","createdAt":"2026-09-18T12:00:00Z","version":2,"interpretedEvidence":{"evidence_objects":[]}},"presentation":{"items":[],"summary":{"text":"","excludedText":""}}}"#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "evidence-review-queue": queue,
                "evidence-review": review,
                "weight": productionWeightForLogJSON(date: nil, value: nil),
            ]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        await native.acknowledgeAcceptedEvidenceReviewProcessing(.init(
            id: "review-training", localDate: "2026-09-18", domain: "training", label: "Training"
        ))

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertTrue(log.pendingEvidenceReviews.isEmpty)
        XCTAssertEqual(log.processingEvidenceReviews?.map(\.id), ["review-training"])
        let training = try XCTUnwrap(log.loggedToday.first { $0.kind == .training })
        XCTAssertEqual(training.summary, "Training processing")
        XCTAssertEqual(training.context, "Confirmation accepted · No action required")
        XCTAssertEqual(training.processing, true)
        XCTAssertNil(training.destination)
    }

    func testAcceptedReviewTerminalFailureRestoresReadyAndRetrySemantics() async throws {
        let queue = productionEnvelope(
            resource: "evidence-review-queue",
            data: #"{"localDate":"2026-09-18","loggedToday":{"rows":[{"id":"training","summary":"Nothing logged yet","context":null,"recordId":null},{"id":"nutrition","summary":"Nothing logged yet","context":null,"recordId":null},{"id":"activity","summary":"Nothing logged yet","context":null,"recordId":null}]},"pendingEvidenceReviews":[{"id":"review-training","date":"Friday, September 18","title":"Training needs another look","summary":"Retry available","likelyDuplicate":false}],"processingEvidenceReviews":[]}"#
        )
        let review = productionEnvelope(
            resource: "evidence-review",
            data: #"{"review":{"id":"review-training","status":"commit_failed","createdAt":"2026-09-18T12:00:00Z","version":3,"interpretedEvidence":{"evidence_objects":[]}},"presentation":{"items":[],"summary":{"text":"","excludedText":""}}}"#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["evidence-review-queue": queue, "evidence-review": review, "weight": productionWeightForLogJSON(date: nil, value: nil)]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        await native.acknowledgeAcceptedEvidenceReviewProcessing(.init(
            id: "review-training", localDate: "2026-09-18", domain: "training", label: "Training"
        ))

        let log = try await ProductionLogAPI(api: native).fetchLog()
        XCTAssertEqual(log.pendingEvidenceReviews.map(\.id), ["review-training"])
        XCTAssertTrue(log.processingEvidenceReviews?.isEmpty == true)
        XCTAssertEqual(log.pendingEvidenceReviews.first?.destination, .evidenceReview(reviewId: "review-training"))
    }

    /// The architectural defect was that `logAPI` could never have
    /// switched with authority no matter what either implementation
    /// returned — this confirms the property itself is now authority-
    /// aware, and that Sandbox keeps using the exact fixture instance it
    /// was constructed with (no regression to Sandbox's own Log behavior).
    @MainActor
    func testAppEnvironmentLogAPISwitchesWithAuthorityAndSandboxKeepsTheInjectedFixture() {
        final class ProbeLogAPI: LogAPI {
            func fetchLog() async throws -> LogReadModel {
                LogReadModel(localDate: "2026-01-01", loggedToday: [], pendingEvidenceReviews: [])
            }
        }
        let suite = "PhysiqueOS.LogAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        let probe = ProbeLogAPI()
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store, logAPI: probe)
        XCTAssertTrue((environment.logAPI as? ProbeLogAPI) === probe)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.logAPI is ProductionLogAPI)
        XCTAssertNil(environment.logAPI as? ProbeLogAPI)

        environment.selectNativeAuthority(.sandbox)
        XCTAssertTrue((environment.logAPI as? ProbeLogAPI) === probe)
    }

    func testProductionTrainingLibraryAndLoggerShareCanonicalUniverseAndUnknownIdentityFailsClosed() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionTrainingLibraryJSON(exerciseID: "canonical-incline-press", muscleGroup: "Chest")),
            .json(200, productionTrainingLoggerJSON(exerciseID: "canonical-incline-press", muscleGroup: "Chest")),
            .json(200, productionTrainingLibraryJSON(exerciseID: "canonical-unknown", muscleGroup: "Unmapped Muscle")),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetchedLibrary = try await ProductionTrainingAPI(api: native).fetchTrainingArea(areaId: "chest", scope: .all)
        let library = try XCTUnwrap(fetchedLibrary)
        let logger = try await ProductionTrainingLoggerAPI(api: native).fetchConfiguration()
        XCTAssertEqual(library.exercises.map(\.canonicalExerciseId), ["canonical-incline-press"])
        XCTAssertEqual(logger.exercises.map(\.canonicalExerciseId), ["canonical-incline-press"])
        XCTAssertEqual(library.exercises.map(\.canonicalExerciseId), logger.exercises.map(\.canonicalExerciseId))

        // The leaner `initialHistorySessions` projection (no `set_number`,
        // no presentation fields) must still decode into real set history.
        let history = try XCTUnwrap(logger.exercises.first?.history.first)
        XCTAssertEqual(history.sessionId, "session-canonical")
        XCTAssertEqual(history.workoutDate, "2026-09-09")
        XCTAssertEqual(history.sets.map(\.reps), [10, 8])
        XCTAssertEqual(history.sets.map(\.weight), [135, 145])
        XCTAssertEqual(history.sets.map(\.setNumber), [1, 2])
        XCTAssertEqual(logger.exercises.first?.progressionRecommendation?.eyebrow, "Maintain current performance")
        XCTAssertEqual(logger.exercises.first?.progressionRecommendation?.suggestedLoad, 145)
        XCTAssertEqual(logger.categorySuggestion?.label, "Biceps + Triceps")
        XCTAssertEqual(logger.categorySuggestion?.categoryIds, ["biceps", "triceps"])
        XCTAssertEqual(logger.categorySuggestion?.reason, "Repeated on Wednesdays across 6 confirmed workouts")

        await native.invalidateReadResources(["training-library"])
        await XCTAssertThrowsErrorAsync(try await ProductionTrainingAPI(api: native).fetchTrainingArea(areaId: "chest", scope: .all)) { error in
            XCTAssertEqual(error as? ProductionDailyDriverError,
                           .unknownCanonicalExerciseArea(exerciseID: "canonical-unknown", muscleGroupID: "Unmapped Muscle"))
        }
        XCTAssertNoThrow(try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction))
    }

    func testProductionLibraryMembershipIsRequiredAndAllCatalogCannotBecomeMyLibraryThroughCache() async throws {
        var response = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(productionTrainingLibraryJSON(exerciseID: "performed_press", muscleGroup: "Chest").utf8)) as? [String: Any])
        var data = try XCTUnwrap(response["data"] as? [String: Any])
        var report = try XCTUnwrap(data["report"] as? [String: Any])
        var exercises = try XCTUnwrap(report["canonicalExercises"] as? [[String: Any]])
        var background = try XCTUnwrap(exercises.first)
        background["canonicalExerciseId"] = "background_press"
        background["label"] = "Background Press"
        exercises.append(background)
        report["canonicalExercises"] = exercises
        data["report"] = report
        response["data"] = data
        let fullCatalogWithMembership = String(decoding: try JSONSerialization.data(withJSONObject: response), as: UTF8.self)
        data.removeValue(forKey: "myLibraryExerciseIds")
        response["data"] = data
        let missingMembership = String(decoding: try JSONSerialization.data(withJSONObject: response), as: UTF8.self)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, fullCatalogWithMembership), .json(200, fullCatalogWithMembership), .json(200, missingMembership),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test")
        let api = ProductionTrainingAPI(api: native)
        let mine = try await api.fetchTrainingArea(areaId: "chest", scope: .all)
        XCTAssertEqual(mine?.exercises.map(\.id), ["performed_press"])
        let all = try await api.fetchTrainingLibraryArea(areaId: "chest", scope: .all, browseAll: true)
        XCTAssertEqual(Set(all?.exercises.map(\.id) ?? []), ["performed_press", "background_press"])
        let mineAgain = try await api.fetchTrainingArea(areaId: "chest", scope: .all)
        XCTAssertEqual(mineAgain?.exercises.map(\.id), ["performed_press"])
        let requests = await transport.requests
        let libraryRequests = requests.filter { $0.url?.path.contains("training-library") == true }
        XCTAssertEqual(libraryRequests.count, 2)
        let scopes = libraryRequests.map { URLComponents(url: $0.url!, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "libraryScope" })?.value }
        XCTAssertEqual(scopes, ["my-library", "all"])
        await native.invalidateReadResources(["training-library"])
        await XCTAssertThrowsErrorAsync(try await api.fetchTrainingArea(areaId: "chest", scope: .all)) { error in
            XCTAssertEqual(error as? ProductionNativeError, .invalidResponse)
        }
    }

    func testHyperextensionUsesCanonicalGlutesNavigationRatherThanLowerBackAnatomy() async throws {
        let library = productionTrainingLibraryJSON(exerciseID: "hyperextension_machine", muscleGroup: "Lower Back")
            .replacingOccurrences(of: "\"primaryNavigationCategory\":\"lower back\"", with: "\"primaryNavigationCategory\":\"glutes\"")
        let logger = productionTrainingLoggerJSON(exerciseID: "hyperextension_machine", muscleGroup: "Lower Back")
            .replacingOccurrences(of: "\"primaryNavigationCategory\":\"lower back\"", with: "\"primaryNavigationCategory\":\"glutes\"")
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), .json(200, library), .json(200, logger)])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test")
        let area = try await ProductionTrainingAPI(api: native).fetchTrainingArea(areaId: "glutes", scope: .all)
        XCTAssertEqual(area?.exercises.map(\.id), ["hyperextension_machine"])
        let configuration = try await ProductionTrainingLoggerAPI(api: native).fetchConfiguration()
        XCTAssertEqual(configuration.exercises.first?.areaId, "glutes")
    }

    func testReadFailureDiagnosticRedactsIdentifiersAndExceptionDetails() {
        struct Key: CodingKey { var stringValue: String; var intValue: Int? { nil }; init(stringValue: String) { self.stringValue = stringValue }; init?(intValue: Int) { return nil } }
        let context = DecodingError.Context(codingPath: [], debugDescription: "Private response content must not escape")
        let safe = NativeReadFailureDiagnostics.classification(DecodingError.keyNotFound(Key(stringValue: "methods"), context))
        XCTAssertEqual(safe.kind, "missing-field")
        XCTAssertEqual(safe.field, "methods")
        let redacted = NativeReadFailureDiagnostics.classification(DecodingError.keyNotFound(Key(stringValue: "opaque-private-reference"), context))
        XCTAssertEqual(redacted.field, "redacted")
    }

    func testProductionTrainingExerciseUsesCanonicalCatalogAndServerPerformanceRecords() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionTrainingLibraryJSON(exerciseID: "canonical-incline-press", muscleGroup: "Chest")),
            .json(200, productionTrainingExerciseJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionTrainingAPI(api: native).fetchTrainingExercise(
            exerciseId: "canonical-incline-press",
            scope: .all
        )
        let exercise = try XCTUnwrap(fetched)
        XCTAssertEqual(exercise.id, "canonical-incline-press")
        XCTAssertEqual(exercise.title, "Incline Press")
        XCTAssertNil(exercise.benchmark)
        XCTAssertNil(exercise.lastSession)
        XCTAssertTrue(exercise.history.isEmpty)
        XCTAssertEqual(exercise.performanceRecords?.canonicalExerciseId, "canonical-incline-press")
        XCTAssertEqual(exercise.performanceRecords?.records.first?.sourceEventId, "event-canonical")

        let requests = await transport.requests
        XCTAssertEqual(Array(requests.suffix(2)).map { $0.url?.path }, [
            "/api/v1/native/read/training-library",
            "/api/v1/native/read/training-exercise",
        ])
        XCTAssertEqual(
            URLComponents(url: requests.last!.url!, resolvingAgainstBaseURL: false)?.queryItems,
            [
                URLQueryItem(name: "context", value: "all"),
                URLQueryItem(name: "exerciseId", value: "canonical-incline-press"),
            ]
        )
    }

    func testProductionGoalContextRejectsUnknownCanonicalIdentityInsteadOfAliasing() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(
            try await ProductionEnergyAPI(api: native).fetchEnergyReport(
                scope: EvidenceScopeSelection.goal(goalId: "goal-unrecognized")
            )
        ) { error in
            XCTAssertEqual(error as? ProductionDailyDriverError, .unsupportedGoalContext(id: "goal-unrecognized"))
        }
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 1, "An unknown Goal must fail before any resource read is sent.")
    }

    func testProductionNutritionAndActivityDecodeCanonicalDaysAndSelectExactContextRoutes() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionNutritionJSON),
            .json(200, productionActivityJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let nutrition = try await ProductionNutritionAPI(api: native).fetchNutritionLanding(scope: .all)
        XCTAssertEqual(nutrition.latestNutritionDay?.id, "nutrition-day-canonical")
        XCTAssertEqual(nutrition.latestNutritionDay?.totals.calories, 2_300)
        XCTAssertNil(nutrition.latestNutritionDay?.totals.fiberG)
        // The wire meal carries no `slot` key at all — confirms it's derived
        // from `name` ("Breakfast") rather than requiring the fixture-only key.
        XCTAssertEqual(nutrition.latestNutritionDay?.meals.first?.slot, .breakfast)
        XCTAssertEqual(nutrition.latestNutritionDay?.meals.first?.name, "Breakfast")
        // The wire sends a count (`0`), not a boolean — confirms both
        // representations decode rather than only the fixture's boolean.
        XCTAssertEqual(nutrition.latestNutritionDay?.meals.first?.additionalFoodsDetected, false)

        let activity = try await ProductionActivityAPI(api: native).fetchActivityLanding(scope: .all)
        XCTAssertEqual(activity.latestActivityDay?.id, "activity-day-canonical")
        XCTAssertEqual(activity.latestActivityDay?.activeCalories, 650)
        XCTAssertNil(activity.latestActivityDay?.totalCalories)
        // `linkedTrainingContext` entries never carry `date`/`sourceEvidence`
        // on the wire — confirms both decode as absent rather than failing.
        let linkedContext = try XCTUnwrap(activity.linkedTrainingContext.first)
        XCTAssertEqual(linkedContext.label, "Traditional Strength Training")
        XCTAssertNil(linkedContext.date)
        XCTAssertEqual(linkedContext.sourceEvidence, [])

        let requests = await transport.requests
        for request in requests.suffix(2) {
            XCTAssertEqual(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems,
                           [URLQueryItem(name: "context", value: "all")])
        }
        XCTAssertNoThrow(try NativeProductWriteGuard.authorize(.nutrition, in: .founderProduction))
        XCTAssertNoThrow(try NativeProductWriteGuard.authorize(.activityEvidence, in: .founderProduction))
    }

    func testProductionEnergyUsesFinishedServerReportPreservingMissingZeroPartialAndWeeklyValues() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionEnergyJSON),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let report = try await ProductionEnergyAPI(api: native).fetchEnergyReport(scope: .all)
        XCTAssertEqual(report.summary.averageBalance, -125)
        XCTAssertEqual(report.dailyHistory.map(\.id), ["2026-09-10", "2026-09-09"])
        XCTAssertNil(report.dailyHistory[0].calorieIntake)
        XCTAssertEqual(report.dailyHistory[1].calorieIntake, 0)
        XCTAssertEqual(report.dailyHistory[0].completeness, "activity-only")
        XCTAssertEqual(report.weeklyHistory.first?.averageBalance, -125)
        XCTAssertTrue(report.weeklyHistory.first?.partial == true)
        XCTAssertEqual(report.recentFourWeeks, report.weeklyHistory)
        XCTAssertEqual(report.weeklyTrend.map(\.id), ["week-server"])
        let energyPath = await transport.requests.last?.url?.path
        XCTAssertEqual(energyPath, "/api/v1/native/read/energy")
    }

    /// The Evidence Hub is not backed by its own native read resource (no
    /// `evidence`/`progress-hub` entry exists in the Package 7 contract
    /// manifest) — `ProductionEvidenceAPI` composes it from the same
    /// per-domain production reads Weight/Training/Nutrition/Activity/
    /// Energy already use. This is the regression this correction exists
    /// to add: before it, `AppEnvironment.evidenceAPI` was a constant
    /// `FixtureEvidenceAPI` that never switched with `nativeAuthority`, so
    /// Founder Production showed stale Sandbox fixture summaries (e.g.
    /// Weight "179.4 lb" instead of the real canonical value).
    @MainActor
    func testProductionEvidenceHubComposesRealPerDomainSummariesNotFixtureValues() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "weight": productionWeightJSON(value: 172.4, id: "weight-canonical"),
                "training-landing": productionTrainingLandingJSON,
                "training-library": productionEmptyTrainingLibraryJSON,
                "nutrition": productionNutritionJSON,
                "activity": productionActivityJSON,
                "energy": productionEnergyJSON,
                "dexa": productionDexaJSON,
                "photos": productionPhotosJSON,
            ]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let hub = try await ProductionEvidenceAPI(api: native).fetchEvidenceHub()
        let streamsByID = Dictionary(uniqueKeysWithValues: hub.streams.map { ($0.id, $0) })

        // Real canonical Weight, never the Sandbox fixture's stale 179.4 lb.
        XCTAssertEqual(streamsByID["weight"]?.metric, "172.4 lb")
        XCTAssertEqual(streamsByID["weight"]?.status, .available)

        // Real production Training/Nutrition/Activity/Energy summaries.
        XCTAssertEqual(streamsByID["training"]?.lastUpdated, "2026-09-09")
        XCTAssertEqual(streamsByID["nutrition"]?.lastUpdated, "2026-09-10")
        XCTAssertEqual(streamsByID["nutrition"]?.metric, "2300 calories")
        XCTAssertEqual(streamsByID["activity"]?.lastUpdated, "2026-09-10")
        XCTAssertEqual(streamsByID["activity"]?.metric, "650 active cal / 45 min")
        XCTAssertEqual(streamsByID["energy"]?.lastUpdated, "2026-09-10")

        // DEXA and Photos are both wired to real production reads (Patch 3
        // continuation) — must show the real latest scan/session, never a
        // placeholder or stale fixture.
        XCTAssertEqual(streamsByID["dexa"]?.status, .available)
        XCTAssertEqual(streamsByID["dexa"]?.metric, "14.2%")
        XCTAssertEqual(streamsByID["dexa"]?.lastUpdated, "2026-09-01")
        XCTAssertEqual(streamsByID["photos"]?.status, .available)
        XCTAssertEqual(streamsByID["photos"]?.lastUpdated, "2026-09-01")

        // Timeline is a genuinely new Founder Production feature with no
        // Sandbox equivalent — always shown available under Production.
        XCTAssertEqual(streamsByID["timeline"]?.status, .available)
        XCTAssertEqual(streamsByID["timeline"]?.destination, .progressStream(streamId: "timeline"))

        // Never-built surfaces keep the same "Coming soon" placeholder
        // Sandbox already shows — no regression there either.
        XCTAssertEqual(streamsByID["recovery"]?.metric, "Coming soon")
        XCTAssertEqual(streamsByID["health-metrics"]?.metric, "Coming soon")
    }

    /// The server already selects/scopes scans before this report is
    /// built, so Production must decode its output directly rather than
    /// re-running scan selection — and must reconcile several genuine
    /// wire-vs-Native naming/shape differences: `delta.{bodyFat,fatMass,
    /// leanMass}` (not `bodyFatPercentagePoints`/etc.), `charts[]` matched
    /// by stable `id` with Native's own titles/units applied (not the
    /// server's cosmetically different `label`/`suffix`), `regionalMassCharts[]`
    /// split by `-leanMass`/`-fatMass` id suffix, and `latestDetails` as a
    /// heterogeneous JSON tuple array (3 or 4 elements, precision optional).
    func testProductionDEXAReportDecodesRealServerShapeNotFixtureScanSelection() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["dexa": productionDexaJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let report = try await ProductionDEXAAPI(api: native).fetchDEXAReport(scope: .all)

        XCTAssertEqual(report.latestScan?.date, "2026-09-01")
        XCTAssertEqual(report.latestScan?.sourceMediaId, "media-dexa-2")
        let delta = try XCTUnwrap(report.delta)
        XCTAssertEqual(delta.bodyFatPercentagePoints, "-0.6")
        XCTAssertEqual(delta.fatMassPounds, "-1.1")
        XCTAssertEqual(delta.leanMassPounds, "+0.8")

        let totalMassTrend = try XCTUnwrap(report.coreTrends.first { $0.title == "Total Mass" })
        XCTAssertEqual(totalMassTrend.unit, "lb")
        let rmrTrend = try XCTUnwrap(report.coreTrends.first { $0.title == "RMR" })
        XCTAssertEqual(rmrTrend.unit, "kcal/day")

        let trunkFat = try XCTUnwrap(report.regionalFatTrends.first { $0.title == "Trunk" })
        XCTAssertEqual(trunkFat.points.map(\.value), [11.4, 10.8])

        // 3-element tuple ("Android Fat", no precision → defaults to 1),
        // 4-element tuple ("VAT Mass", precision 2), and a null value
        // ("T-score" → "Unavailable", never a crash or a fabricated 0).
        let detailsByLabel = Dictionary(uniqueKeysWithValues: report.supplementalDetails.map { ($0.label, $0.value) })
        XCTAssertEqual(detailsByLabel["VAT Mass"], "1.80 lb")
        XCTAssertEqual(detailsByLabel["Android Fat"], "18.4%")
        XCTAssertEqual(detailsByLabel["T-score"], "Unavailable")

        // History arrives newest-first from the server already — Production
        // must pass it straight through, never re-sort or reverse.
        XCTAssertEqual(report.history.map(\.date), ["2026-09-01", "2026-08-01"])
        XCTAssertEqual(report.history.first?.restingMetabolicRate, "1780 kcal/day")
        XCTAssertEqual(report.history.map(\.sourceMediaId), ["media-dexa-2", "media-dexa-1"])
    }

    /// The defect this guards against was architectural, not a data bug:
    /// `evidenceAPI` was a stored constant, so it could never have switched
    /// with authority no matter what either implementation returned.
    /// Confirms the property itself is authority-aware and Sandbox keeps
    /// using the exact fixture instance it was constructed with.
    @MainActor
    func testAppEnvironmentEvidenceAPISwitchesWithAuthorityAndSandboxKeepsTheInjectedFixture() {
        final class ProbeEvidenceAPI: EvidenceAPI {
            func fetchEvidenceHub() async throws -> EvidenceHubReadModel {
                EvidenceHubReadModel(title: "probe", subtitle: "probe", streams: [])
            }
        }
        let suite = "PhysiqueOS.EvidenceAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        let probe = ProbeEvidenceAPI()
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store, evidenceAPI: probe)
        XCTAssertTrue((environment.evidenceAPI as? ProbeEvidenceAPI) === probe)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.evidenceAPI is ProductionEvidenceAPI)
        XCTAssertNil(environment.evidenceAPI as? ProbeEvidenceAPI)

        environment.selectNativeAuthority(.sandbox)
        XCTAssertTrue((environment.evidenceAPI as? ProbeEvidenceAPI) === probe)
    }

    /// `dexaAPI` was a stored constant (never authority-aware) before
    /// Patch 3 — same architectural defect class as `evidenceAPI`/`logAPI`.
    @MainActor
    func testAppEnvironmentDEXAAPISwitchesWithAuthorityAndSandboxKeepsTheInjectedFixture() {
        final class ProbeDEXAAPI: DEXAAPI {
            func fetchDEXAReport(scope: EvidenceScopeSelection) async throws -> DEXAReportReadModel {
                DEXAReportReadModel(
                    title: "probe", subtitle: "probe", scope: TrainingScopeContext(options: [], dateRangeLabel: ""),
                    latestScan: nil, summary: [], delta: nil,
                    bodyFatTrend: DEXAMetricSeries(title: "probe", unit: "", points: []),
                    coreTrends: [], supplementalDetails: [], supplementalTrends: [],
                    regionalLeanTrends: [], regionalFatTrends: [], history: [], dataSources: []
                )
            }
        }
        let suite = "PhysiqueOS.DEXAAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        let probe = ProbeDEXAAPI()
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store, dexaAPI: probe)
        XCTAssertTrue((environment.dexaAPI as? ProbeDEXAAPI) === probe)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.dexaAPI is ProductionDEXAAPI)
        XCTAssertNil(environment.dexaAPI as? ProbeDEXAAPI)

        environment.selectNativeAuthority(.sandbox)
        XCTAssertTrue((environment.dexaAPI as? ProbeDEXAAPI) === probe)
    }

    /// `photosAPI` was a stored constant — never authority-aware — so
    /// tapping into Progress Photos under Founder Production silently
    /// rendered the bundled Sandbox fixture (photo sets, poses, dates) as
    /// if it were live data. Discovered via Simulator acceptance, not
    /// static review. Progress Photos' prior server-side gap (`poseId`/
    /// `comparisonStatus` missing from the wire) closed with the Patch 3
    /// continuation contract, so Founder Production now decodes real
    /// sessions through `ProductionPhotosAPI`, never a fixture fallback.
    @MainActor
    func testAppEnvironmentPhotosAPISwitchesWithAuthorityAndSandboxKeepsTheInjectedFixture() {
        let suite = "PhysiqueOS.PhotosAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")

        let fixture = FixturePhotosAPI()
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store, photosAPI: fixture)
        XCTAssertTrue((environment.photosAPI as? FixturePhotosAPI) != nil)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.photosAPI is ProductionPhotosAPI)
        XCTAssertNil(environment.photosAPI as? FixturePhotosAPI)

        environment.selectNativeAuthority(.sandbox)
        XCTAssertTrue(environment.photosAPI is FixturePhotosAPI)
    }

    /// The completed `photos` contract sends canonical pose identity,
    /// comparison status, and opaque current/prior media directly on each
    /// session — Native decodes this verbatim and must never re-select a
    /// same-pose comparison or fabricate a raw storage path/URL.
    func testProductionPhotosDecodesPoseIdentityComparisonStatusAndOpaqueMedia() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["photos": productionPhotosJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let landing = try await ProductionPhotosAPI(api: native).fetchPhotosLanding(scope: .goal(goalId: EvidenceCanonicalGoalID.buildLeanMass))

        XCTAssertEqual(landing.history.map(\.id), ["session-2", "session-1"])
        XCTAssertNil(landing.latestSet?.weightLabel)
        XCTAssertEqual(landing.latestSet?.comparisonAvailability, "1/2 poses have prior comparisons")

        let views = try XCTUnwrap(landing.latestSet?.views)
        let frontRelaxed = try XCTUnwrap(views.first { $0.poseId == .frontRelaxed })
        XCTAssertEqual(frontRelaxed.comparisonStatus, "comparable")
        XCTAssertEqual(frontRelaxed.comparedAgainst, "Aug 15")
        XCTAssertEqual(frontRelaxed.mediaId, "media-front-2")
        XCTAssertEqual(frontRelaxed.priorMediaId, "media-front-1")
        XCTAssertTrue(frontRelaxed.hasComparisonImage)
        XCTAssertEqual(frontRelaxed.interpretationSummary, "Canonical interpretation.")
        XCTAssertEqual(frontRelaxed.comparisonBullets, ["Waist looks tighter."])
        XCTAssertEqual(frontRelaxed.conditionSummary, "Comparable light and distance.")
        XCTAssertEqual(frontRelaxed.sourceHistory, "Compared Aug 15 and Sep 1.")

        let backFlexed = try XCTUnwrap(views.first { $0.poseId == .backFlexed })
        XCTAssertEqual(backFlexed.comparisonStatus, "no_prior_matching_pose")
        XCTAssertEqual(backFlexed.comparedAgainst, "No prior matching pose")
        XCTAssertFalse(backFlexed.hasComparisonImage)
        XCTAssertEqual(backFlexed.mediaId, "media-backflexed-2")
        XCTAssertNil(backFlexed.priorMediaId)
    }

    /// The completed `training-reporting` contract sends server-composed
    /// status groups/PRs/highlights/attention/categories directly
    /// (`TrainingReportingPresentationService`) — Native must decode and
    /// lay these out verbatim, never re-derive status classification or PR
    /// detection from raw performance observations. One payload covers
    /// every `reportId`; Native selects the requested section client-side.
    func testProductionTrainingReportingDecodesServerComposedPresentationNotRawObservations() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["training-reporting": productionTrainingReportingJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionTrainingAPI(api: native)

        let resistance = try await api.fetchTrainingReporting(reportId: "resistance", scope: .all)
        let resistanceReport = try XCTUnwrap(resistance?.resistance)
        XCTAssertEqual(resistance?.title, "Resistance Training")
        let improving = try XCTUnwrap(resistanceReport.statusGroups.first { $0.label == "Improving" })
        XCTAssertEqual(improving.items.map(\.label), ["Bench Press"])
        XCTAssertEqual(improving.tone, .success)
        XCTAssertEqual(resistanceReport.recentPrs.first?.detail, "New reps-at-load PR: 8 reps at 185 lb.")
        XCTAssertEqual(resistanceReport.categoryRollups.first?.label, "Chest")

        let history = try await api.fetchTrainingReporting(reportId: "history", scope: .all)
        let productionDays = try XCTUnwrap(history?.productionHistoryDays)
        XCTAssertEqual(productionDays.first?.label, "Sep 8")
        XCTAssertEqual(productionDays.first?.sessions.first?.label, "Push Day")
        XCTAssertNil(history?.historyDays)

        // Cardio has no dedicated payload in this pass — must fall back to
        // the same honest Foundation placeholder every other unimplemented
        // report id already shows, never a fabricated analytics section.
        let cardio = try await api.fetchTrainingReporting(reportId: "cardio", scope: .all)
        XCTAssertNotNil(cardio?.placeholderBody)
        XCTAssertNil(cardio?.resistance)
    }

    /// Timeline is a genuinely new Founder Production feature — the server
    /// already resolves cross-domain identity/chronology; Native decodes
    /// the one bounded page verbatim (newest-first, already server-sorted)
    /// and never invents pagination beyond `hasMore`/`totalCount`.
    func testProductionTimelineDecodesBoundedNewestFirstPage() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["timeline": productionTimelineJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let timeline = try await ProductionTimelineAPI(api: native).fetchTimeline()

        XCTAssertEqual(timeline.items.map(\.id), ["item-2", "item-1"])
        XCTAssertEqual(timeline.items.first?.tone, .evidence)
        XCTAssertEqual(timeline.hasMore, false)
        XCTAssertEqual(timeline.totalCount, 2)
    }

    @MainActor
    func testAppEnvironmentTimelineAPISwitchesWithAuthorityAndSandboxIsHonestlyUnavailable() async {
        let suite = "PhysiqueOS.TimelineAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store)

        XCTAssertTrue(environment.timelineAPI is NotAvailableTimelineAPI)
        do {
            _ = try await environment.timelineAPI.fetchTimeline()
            XCTFail("Expected NotAvailable to be thrown under Sandbox")
        } catch is NotAvailableTimelineAPI.NotAvailable {
            // expected
        } catch {
            XCTFail("Expected NotAvailable, got \(error)")
        }

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.timelineAPI is ProductionTimelineAPI)
    }

    func testProductionEvidenceReviewDecodesSystemicServerPresentationAcrossApprovedDomains() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["evidence-review": productionEvidenceReviewJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let review = try await ProductionEvidenceReviewAPI(api: native).fetchReview(reviewId: "review-1")

        XCTAssertEqual(review?.id, "review-1")
        XCTAssertEqual(review?.status, "pending")
        XCTAssertEqual(review?.version, 3)
        XCTAssertEqual(review?.items.map(\.id), ["object-1", "object-2", "object-3", "object-4", "object-5", "object-6"])
        XCTAssertEqual(review?.items.first?.type, "weight")
        XCTAssertEqual(review?.items.first?.date, "Sep 8, 2026")
        XCTAssertEqual(review?.summary, "6 evidence items detected")
        XCTAssertEqual(review?.excludedSummary, "1 item excluded")
        XCTAssertEqual(review?.items.first?.title, "Weight")
        XCTAssertEqual(review?.items.first?.sourceLabel, "Typed evidence")
        XCTAssertEqual(review?.items.first?.metrics.first, .init(label: "Weight", value: "170.4 lb"))
        XCTAssertFalse(review?.items[1].included ?? true)
        XCTAssertEqual(review?.items[1].photoSession?.sessionId, "object-2")
        XCTAssertEqual(review?.items[1].photoSession?.timeOfDay, "morning")
        XCTAssertEqual(review?.items[1].photoSession?.photos.map(\.poseId), ["front-relaxed", "back-flexed"])
        XCTAssertEqual(review?.items[2].exercises.first?.name, "Bench Press")
        XCTAssertEqual(review?.items[2].exercises.first?.sets, ["8 reps @ 185 lb", "6 reps @ 195 lb"])
        XCTAssertEqual(review?.items[2].exercises.first?.variantLabel, "Paused")
        XCTAssertEqual(review?.items[2].sourceFiles, ["workout.png"])
        XCTAssertEqual(review?.items[3].metrics.map(\.value), ["799 cal", "100 min"])
        XCTAssertEqual(review?.items[4].meals.first?.name, "Lunch")
        XCTAssertEqual(review?.items[4].meals.first?.foods.first?.name, "Chicken bowl")
        XCTAssertEqual(review?.items[4].reconciliation, "Meal totals match the daily total.")
        XCTAssertEqual(review?.items[4].typedEvidence, "Lunch: chicken bowl")
        XCTAssertEqual(review?.items[5].metrics.first, .init(label: "Total mass", value: "161.1 lb"))
        XCTAssertEqual(review?.items[5].dexaMeasurements?.leanMassLb, 148.3)
    }

    @MainActor
    func testProductionEvidenceReviewDecodesTypedWorkoutReconciliation() async throws {
        let detail = productionEnvelope(
            resource: "evidence-review",
            data: #"{"review":{"id":"healthkit_workout_reconciliation_one","status":"resolved_confirmed","version":2,"localDate":"2026-09-23"},"presentation":{"kind":"healthkit_workout_reconciliation","id":"healthkit_workout_reconciliation_one","status":"resolved_confirmed","version":"2","localDate":"2026-09-23","title":"Match Apple Health workout","summary":"Choose the matching Logger session, or choose No match.","workout":{"family":"strength","canonicalType":"traditional_strength_training","startedAt":"2026-09-23T17:00:00.000Z","endedAt":"2026-09-23T18:00:00.000Z"},"candidates":[{"loggerSessionCanonicalId":"logger-a","confidence":95,"basis":"logger_session_window","loggerSession":{"activityType":"Traditional Strength Training","startedAt":"2026-09-23T17:01:00.000Z","endedAt":"2026-09-23T17:59:00.000Z"}},{"loggerSessionCanonicalId":"logger-b","confidence":94,"basis":"temporal_and_telemetry","loggerSession":{"activityType":"Functional Strength Training","startedAt":"2026-09-23T17:02:00.000Z","endedAt":"2026-09-23T18:01:00.000Z"}}],"resolution":{"action":"confirm","selectedLoggerSessionCanonicalId":"logger-a","linkId":"link-a"}}}"#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["evidence-review": detail]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let review = try await ProductionEvidenceReviewAPI(api: native).fetchReview(reviewId: "healthkit_workout_reconciliation_one")

        XCTAssertEqual(review?.id, "healthkit_workout_reconciliation_one")
        XCTAssertEqual(review?.items, [])
        XCTAssertEqual(review?.summary, "Choose the matching Logger session, or choose No match.")
        XCTAssertEqual(review?.workoutReconciliation?.localDate, "2026-09-23")
        XCTAssertEqual(review?.workoutReconciliation?.workout.canonicalType, "traditional_strength_training")
        XCTAssertEqual(review?.workoutReconciliation?.candidates.map(\.loggerSessionCanonicalId), ["logger-a", "logger-b"])
        XCTAssertEqual(review?.workoutReconciliation?.candidates.first?.confidence, 95)
        let decoded = try XCTUnwrap(review)
        XCTAssertEqual(decoded.workoutReconciliation?.resolution?.selectedLoggerSessionCanonicalId, "logger-a")
        XCTAssertTrue(EvidenceReviewDetailView.reconciliationResolutionMatches(
            decoded,
            requestedReviewId: decoded.id,
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationResolutionMatches(
            decoded,
            requestedReviewId: decoded.id,
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-b"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationResolutionMatches(
            decoded,
            requestedReviewId: decoded.id,
            requestedAction: "no_match",
            loggerSessionCanonicalId: nil
        ))
        XCTAssertEqual(EvidenceReviewDetailView.occurrenceDateLabel(for: decoded), "Sep 23")
    }

    func testWorkoutReconciliationResolutionUsesRegisteredVersionedCommandAndStableIdempotency() async throws {
        let response = productionCommandOutcomeJSON(result: #"{"status":"resolved_confirmed","reviewId":"review-one","revision":3,"resolution":{"action":"confirm","selectedLoggerSessionCanonicalId":"logger-a","linkId":"link-one"},"strategicEvidenceEligibility":"quarantined"}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, response),
            .json(200, response),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let api = ProductionEvidenceReviewAPI(api: native)

        try await api.resolveWorkoutReconciliation(reviewId: "review-one", expectedVersion: "2", loggerSessionCanonicalId: "logger-a")
        try await api.resolveWorkoutReconciliation(reviewId: "review-one", expectedVersion: "2", loggerSessionCanonicalId: "logger-a")

        let requests = await transport.requests
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"2\"")
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"), requests[2].value(forHTTPHeaderField: "Idempotency-Key"))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        XCTAssertEqual(json["commandType"] as? String, ProductionCommandType.resolveWorkoutReconciliation)
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        XCTAssertEqual(payload["action"] as? String, "confirm")
        XCTAssertEqual(payload["loggerSessionCanonicalId"] as? String, "logger-a")
        let affected = await native.resourcesAffected(by: ProductionCommandType.resolveWorkoutReconciliation)
        XCTAssertTrue(affected.contains("evidence-review"))
        XCTAssertTrue(affected.contains("evidence-review-queue"))
        XCTAssertTrue(affected.contains("training-day"))
    }

    func testWorkoutReconciliationNoMatchOmitsLoggerIdentity() async throws {
        let response = productionCommandOutcomeJSON(result: #"{"status":"resolved_no_match","reviewId":"review-one","revision":3,"resolution":{"action":"no_match","selectedLoggerSessionCanonicalId":null,"linkId":null}}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, response),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        try await ProductionEvidenceReviewAPI(api: native).resolveWorkoutReconciliation(
            reviewId: "review-one",
            expectedVersion: "2",
            loggerSessionCanonicalId: nil
        )

        let requests = await transport.requests
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        XCTAssertEqual(payload["action"] as? String, "no_match")
        XCTAssertNil(payload["loggerSessionCanonicalId"])
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"2\"")
    }

    @MainActor
    func testWorkoutReconciliationNoMatchReadbackRequiresTheExactResolution() {
        let review = EvidenceReviewDetailReadModel(
            id: "review-one",
            status: "resolved_no_match",
            createdAt: nil,
            version: 3,
            items: [],
            workoutReconciliation: .init(
                localDate: "2026-09-23",
                title: "Match Apple Health workout",
                summary: "No match",
                workout: .init(
                    family: "strength",
                    canonicalType: "traditional_strength_training",
                    startedAt: "2026-09-23T17:00:00Z",
                    endedAt: "2026-09-23T18:00:00Z"
                ),
                candidates: [],
                resolution: .init(action: "no_match", selectedLoggerSessionCanonicalId: nil, linkId: nil)
            )
        )

        XCTAssertTrue(EvidenceReviewDetailView.reconciliationResolutionMatches(
            review,
            requestedReviewId: review.id,
            requestedAction: "no_match",
            loggerSessionCanonicalId: nil
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationResolutionMatches(
            review,
            requestedReviewId: review.id,
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationResolutionMatches(
            review,
            requestedReviewId: "review-other",
            requestedAction: "no_match",
            loggerSessionCanonicalId: nil
        ))
        var missingRevision = review
        missingRevision.version = nil
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationResolutionMatches(
            missingRevision,
            requestedReviewId: review.id,
            requestedAction: "no_match",
            loggerSessionCanonicalId: nil
        ))
    }

    @MainActor
    func testWorkoutReconciliationCommandSuccessRequiresExactTypedResolution() {
        let confirmed = WorkoutReconciliationCommandResult(
            status: "resolved_confirmed",
            reviewId: "review-one",
            revision: 3,
            resolution: .init(action: "confirm", selectedLoggerSessionCanonicalId: "logger-a", linkId: "link-one")
        )
        XCTAssertTrue(EvidenceReviewDetailView.reconciliationCommandResultMatches(
            confirmed,
            requestedReviewId: "review-one",
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationCommandResultMatches(
            confirmed,
            requestedReviewId: "review-one",
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-b"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationCommandResultMatches(
            .init(status: "already_resolved", reviewId: "review-one", revision: 3, resolution: confirmed.resolution),
            requestedReviewId: "review-one",
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationCommandResultMatches(
            .init(status: "resolved_confirmed", reviewId: "review-one", revision: 3,
                  resolution: .init(action: "confirm", selectedLoggerSessionCanonicalId: "logger-a", linkId: nil)),
            requestedReviewId: "review-one",
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationCommandResultMatches(
            .init(status: "resolved_confirmed", reviewId: "review-other", revision: 3, resolution: confirmed.resolution),
            requestedReviewId: "review-one",
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
        XCTAssertFalse(EvidenceReviewDetailView.reconciliationCommandResultMatches(
            .init(status: "resolved_confirmed", reviewId: "review-one", revision: nil, resolution: confirmed.resolution),
            requestedReviewId: "review-one",
            requestedAction: "confirm",
            loggerSessionCanonicalId: "logger-a"
        ))
    }

    /// The Server's corrected provenance owns the label: a Training review whose
    /// screenshots are large images reads "Screenshot", never "Progress photos", and
    /// Native renders exactly what the Server sent, for every evidence type.
    func testTrainingReviewShowsServerScreenshotProvenanceNeverProgressPhotos() async throws {
        let corrected = productionEvidenceReviewJSON
            .replacingOccurrences(of: #""sourceLabel":"Imported workout""#, with: #""sourceLabel":"Screenshot""#)
            .replacingOccurrences(of: #""sourceLabel":"Uploaded evidence""#, with: #""sourceLabel":"Progress photos""#)
            .replacingOccurrences(of: #"{"label":"Exercises","value":"1"}"#, with: #"{"label":"Exercises","value":"1"},{"label":"Source","value":"Screenshot"}"#)
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["evidence-review": corrected]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionEvidenceReviewAPI(api: native).fetchReview(reviewId: "review-1")
        let review = try XCTUnwrap(fetched)
        let byType = Dictionary(uniqueKeysWithValues: review.items.map { ($0.type, $0) })

        XCTAssertEqual(byType["training"]?.sourceLabel, "Screenshot")
        XCTAssertEqual(byType["training"]?.metrics.first { $0.label == "Source" }?.value, "Screenshot")
        for item in review.items where item.type != "photo_session" && item.type != "photos" {
            XCTAssertFalse((item.sourceLabel ?? "").contains("Progress photos"), "\(item.type) must not show Progress photos provenance")
            XCTAssertFalse(item.metrics.contains { $0.value.contains("Progress photos") }, "\(item.type) Source metric")
        }
        // The other evidence types decode with their Server-supplied provenance intact.
        XCTAssertEqual(byType["weight"]?.sourceLabel, "Typed evidence")
        XCTAssertEqual(byType["activity"]?.sourceLabel, "Screenshot")
        XCTAssertEqual(byType["nutrition"]?.sourceLabel, "Typed evidence")
        XCTAssertEqual(byType["dexa"]?.sourceLabel, "BodySpec PDF")
        XCTAssertEqual(byType["photo_session"]?.sourceLabel, "Progress photos", "a genuine Progress Photos item keeps its provenance")
    }

    func testNativeNeverDerivesProvenanceFromImageSizeOrFormat() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        for path in ["PhysiqueOS/Networking/EvidenceReviewAPI.swift", "PhysiqueOS/Presentation/Evidence/EvidenceReviewDetailView.swift"] {
            let source = try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
            XCTAssertFalse(source.contains("Progress photos\""), "\(path) must not author 'Progress photos' provenance")
            XCTAssertFalse(source.lowercased().contains("bytecount"), "\(path) must not classify by image size")
        }
    }

    func testProductionEvidenceReviewReturnsNilWhenReviewIsMissing() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["evidence-review": productionEnvelope(resource: "evidence-review", data: #"{"review":null}"#)]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let review = try await ProductionEvidenceReviewAPI(api: native).fetchReview(reviewId: "missing-review")

        XCTAssertNil(review)
    }

    @MainActor
    func testAppEnvironmentEvidenceReviewAPISwitchesWithAuthorityAndSandboxIsHonestlyUnavailable() async {
        let suite = "PhysiqueOS.EvidenceReviewAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store)

        XCTAssertTrue(environment.evidenceReviewAPI is NotAvailableEvidenceReviewAPI)
        do {
            _ = try await environment.evidenceReviewAPI.fetchReview(reviewId: "review-1")
            XCTFail("Expected NotAvailable to be thrown under Sandbox")
        } catch is NotAvailableEvidenceReviewAPI.NotAvailable {
            // expected
        } catch {
            XCTFail("Expected NotAvailable, got \(error)")
        }

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.evidenceReviewAPI is ProductionEvidenceReviewAPI)
    }

    /// Native preserves the server's newest-first order and follows its
    /// opaque cursor until every approved historical artifact is present.
    func testProductionBriefingHistoryDecodesBoundedThinRowsWithArtifactTypeDiscriminatingEvents() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing-history": productionBriefingHistoryJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let rows = try await ProductionBriefingAPI(api: native).fetchHistory()

        XCTAssertEqual(rows.map(\.artifactId), ["briefing-3", "briefing-2", "briefing-1"])
        XCTAssertEqual(rows[0].cadence, .weekly)
        XCTAssertEqual(rows[1].cadence, .event)
        XCTAssertTrue(rows[1].isDEXAEvent)
        XCTAssertFalse(rows[1].isPhotoEvent)
        XCTAssertEqual(rows[2].cadence, .event)
        XCTAssertTrue(rows[2].isPhotoEvent)
        XCTAssertEqual(rows[1].displayCadenceLabel, "DEXA Event Briefing")
        XCTAssertEqual(rows[2].displayCadenceLabel, "Photo Event Briefing")
        XCTAssertEqual(rows.map(\.colorToken), [.evidence, .success, .primary])
    }

    func testProductionBriefingHistoryIsolatesLegacyNullCadenceWithoutErasingCanonicalHistory() async throws {
        let liveShaped = productionEnvelope(resource: "briefing-history", data: #"{"items":[{"artifactId":"legacy-daily-1","artifactType":null,"cadence":null,"label":"Briefing","publicationDate":"2026-07-01T12:00:00.000Z","version":1},{"artifactId":"dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12","artifactType":"dexa_event","cadence":"event","label":"DEXA Event","publicationDate":"2026-09-13T06:28:58.012Z","version":2},{"artifactId":"weekly-1","artifactType":"scheduled","cadence":"weekly","label":"Weekly Briefing","publicationDate":"2026-09-08T14:00:00.000Z","version":1}],"page":{"limit":50,"hasMore":false,"nextCursor":null}}"#)
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing-history": liveShaped]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let rows = try await ProductionBriefingAPI(api: native).fetchHistory()

        XCTAssertEqual(rows.map(\.artifactId), [
            "dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12",
            "weekly-1",
        ])
        XCTAssertEqual(rows.map(\.displayCadenceLabel), ["DEXA Event Briefing", "Weekly Briefing"])
    }

    func testProductionBriefingDetailLoadsLiveShapedDEXAArtifactByArtifactIdentity() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "briefing": productionDEXAEventJSON.replacingOccurrences(
                    of: #""resource":"dexa-event""#,
                    with: #""resource":"briefing""#
                ),
            ]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "dexa_event_scan-canonical")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.id, "dexa_event_scan-canonical")
        XCTAssertEqual(result.dexa?.scanId, "scan-canonical")
        XCTAssertEqual(result.dexa?.progress.headline.first?.delta, "+0.80 lb")
        let request = await transport.requests.last
        XCTAssertEqual(URLComponents(url: try XCTUnwrap(request?.url), resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "artifactId" })?.value, "dexa_event_scan-canonical")
    }

    func testProductionBriefingHistoryFollowsCursorWithoutDroppingOlderWeeklyOrPhotoEvents() async throws {
        let firstPage = productionEnvelope(resource: "briefing-history", data: #"{"items":[{"artifactId":"latest-weekly","artifactType":"scheduled","cadence":"weekly","label":"Latest Weekly","publicationDate":"2026-09-13T12:00:00.000Z","version":1},{"artifactId":"dexa-sep-1","artifactType":"dexa_event","cadence":"event","label":"Sep 1 DEXA","publicationDate":"2026-09-01T12:00:00.000Z","version":1}],"page":{"limit":2,"hasMore":true,"nextCursor":"older-2"}}"#)
        let secondPage = productionEnvelope(resource: "briefing-history", data: #"{"items":[{"artifactId":"older-weekly","artifactType":"scheduled","cadence":"weekly","label":"Older Weekly","publicationDate":"2026-08-24T12:00:00.000Z","version":1},{"artifactId":"photo-aug-15","artifactType":"photo_event","cadence":"event","label":"Aug 15 Photo","publicationDate":"2026-08-15T12:00:00.000Z","version":1}],"page":{"limit":2,"hasMore":false,"nextCursor":null}}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, firstPage), .json(200, secondPage),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let rows = try await ProductionBriefingAPI(api: native).fetchHistory()

        XCTAssertEqual(rows.map(\.artifactId), ["latest-weekly", "dexa-sep-1", "older-weekly", "photo-aug-15"])
        let requests = await transport.requests
        let secondCursor = requests[2].url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }?.queryItems?.first(where: { $0.name == "cursor" })?.value
        XCTAssertEqual(secondCursor, "older-2")
    }

    func testProductionBriefingHistoryReconcilesEverySupportedFamilyTogether() async throws {
        let mixed = productionEnvelope(resource: "briefing-history", data: #"{"items":[{"artifactId":"weekly-new","artifactType":"scheduled","cadence":"weekly","label":"Weekly Briefing","publicationDate":"2026-09-13T12:00:00Z","version":1},{"artifactId":"midweek-one","artifactType":"scheduled","cadence":"midweek","label":"Midweek Briefing","publicationDate":"2026-09-09T12:00:00Z","version":1},{"artifactId":"monthly-one","artifactType":"scheduled","cadence":"monthly","label":"Monthly Briefing","publicationDate":"2026-09-01T12:00:00Z","version":1},{"artifactId":"dexa-one","artifactType":"dexa_event","cadence":"event","label":"DEXA Event","publicationDate":"2026-08-15T12:00:00Z","version":1},{"artifactId":"photo-one","artifactType":"photo_event","cadence":"event","label":"Photo Event","publicationDate":"2026-08-08T12:00:00Z","version":1},{"artifactId":"weekly-old","artifactType":"scheduled","cadence":"weekly","label":"Weekly Briefing","publicationDate":"2026-08-02T12:00:00Z","version":1},{"artifactId":"photo-old","artifactType":"photo_event","cadence":"event","label":"Photo Event","publicationDate":"2026-07-25T12:00:00Z","version":1},{"artifactId":"legacy-unsupported","artifactType":null,"cadence":null,"label":"Briefing","publicationDate":"2026-07-01T12:00:00Z","version":1}],"page":{"limit":50,"hasMore":false,"nextCursor":null}}"#)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["briefing-history": mixed])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let rows = try await ProductionBriefingAPI(api: native).fetchHistory()

        XCTAssertEqual(Set(rows.map(\.artifactId)), Set(["weekly-new", "midweek-one", "monthly-one", "dexa-one", "photo-one", "weekly-old", "photo-old"]))
        XCTAssertEqual(rows.filter { $0.cadence == .weekly }.count, 2)
        XCTAssertEqual(rows.filter(\.isPhotoEvent).count, 2)
        XCTAssertEqual(Set(rows.map(\.displayCadenceLabel)), Set(["Weekly Briefing", "Midweek Briefing", "Monthly Briefing", "DEXA Event Briefing", "Photo Event Briefing"]))
    }

    func testProductionShapedHistoryKeepsAllFivePhotoEventsVisibleAcrossCompleteCatalog() async throws {
        let families: [(prefix: String, type: String, cadence: String, count: Int)] = [
            ("weekly", "scheduled", "weekly", 10),
            ("midweek", "scheduled", "midweek", 7),
            ("monthly", "scheduled", "monthly", 2),
            ("dexa", "dexa_event", "event", 4),
            ("photo", "photo_event", "event", 5),
        ]
        var ordinal = 0
        let items = families.flatMap { family in
            (1...family.count).map { index -> String in
                ordinal += 1
                return #"{"artifactId":"\#(family.prefix)-\#(index)","artifactType":"\#(family.type)","cadence":"\#(family.cadence)","label":"\#(family.prefix)","publicationDate":"2026-08-\#(String(format: "%02d", 29 - ordinal))T12:00:00Z","version":1}"#
            }
        }
        let catalog = productionEnvelope(
            resource: "briefing-history",
            data: "{\"items\":[\(items.joined(separator: ","))],\"page\":{\"limit\":50,\"hasMore\":false,\"nextCursor\":null}}"
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing-history": catalog]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let rows = try await ProductionBriefingAPI(api: native).fetchHistory()

        XCTAssertEqual(rows.count, 28)
        XCTAssertEqual(rows.filter { $0.cadence == .weekly }.count, 10)
        XCTAssertEqual(rows.filter { $0.cadence == .midweek }.count, 7)
        XCTAssertEqual(rows.filter { $0.cadence == .monthly }.count, 2)
        XCTAssertEqual(rows.filter(\.isDEXAEvent).count, 4)
        XCTAssertEqual(rows.filter(\.isPhotoEvent).map(\.artifactId), ["photo-1", "photo-2", "photo-3", "photo-4", "photo-5"])
    }

    func testProductionWeeklyBriefingUsesFinishedServerPresentation() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing": productionWeeklyBriefingJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "weekly-1")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.cadence, .weekly)
        XCTAssertEqual(result.weekly?.heroHeadline, "Server-owned weekly conclusion")
        XCTAssertEqual(result.weekly?.energy?.averageBalanceKcal, -125)
        XCTAssertEqual(result.weekly?.training?.highlights?.first?.canonicalExerciseId, "bench-press")
        XCTAssertEqual(result.confidence?.score, 71)
        XCTAssertEqual(result.confidence?.presentationExplanation, "Canonical weekly Confidence explanation.")
        XCTAssertEqual(result.confidence?.movementLabel, "Confidence increased")
        let request = await transport.requests.last
        XCTAssertEqual(URLComponents(url: try XCTUnwrap(request?.url), resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "artifactId" })?.value, "weekly-1")
    }

    func testProductionWeeklyBriefingPreservesExactLiveEnergyAndTrainingShape() async throws {
        let live = productionEnvelope(resource: "briefing", data: #"{"schemaVersion":"1","artifact":{"artifactId":"weekly-live","artifactType":"scheduled","cadence":"weekly","version":1,"evidenceWindow":{"id":"weekly:2026-09-06:2026-09-12:America/Los_Angeles","startDate":"2026-09-06","endDate":"2026-09-12","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-13T07:02:58.048Z"},"goalPhaseAttribution":{"goalId":"goal","phaseId":"phase"},"historical":{"frozen":true,"artifactBound":true},"presentation":{"hero":{"periodLabel":"Completed week\nSep 6–Sep 12","goalLabel":"Build Lean Mass","headline":"Training moved forward, but calories still look low.","body":"Canonical weekly narrative.","confidence":{"score":62,"band":"moderate","priorScore":62,"delta":0,"movementDirection":"held","presentationExplanation":"Canonical explanation.","primaryReason":"Raw reason.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"goalId":"goal","phaseId":"phase","assessmentDate":"2026-09-13T07:02:58.048Z","source":"canonical_confidence_v2_snapshot"},"strategy":{"name":"Lean Mass Build","weekLabel":"Week 5","reviewLabel":""}},"energy":{"chart":{"title":"Daily intake vs estimated expenditure","points":[{"date":"2026-09-06","label":"Su","intake":3920,"expenditure":2188,"balance":1732,"complete":true},{"date":"2026-09-12","label":"Sa","intake":null,"expenditure":2838,"balance":null,"complete":false}]},"title":"Calories need more context.","averageIntake":2685.8,"averageExpenditure":2561.4,"averageBalance":170.5,"pairedDayCount":6,"eligibleDayCount":7,"narrative":"Canonical energy narrative."},"weight":null,"photos":null,"training":{"title":"Training progressed across most areas.","conclusion":"Canonical training narrative.","trainingDayCount":6,"status":{"stable":0,"improving":7,"plateauing":1,"regressing":1,"insufficient":0},"comparableCategoryCount":9,"insufficientCount":0,"highlights":[{"icon":"🏆","kind":"Record","unit":"lb volume","delta":675,"label":"New session-volume mark","value":4800,"exercise":"Hyperextension Machine","previous":4125,"percentChange":16.4}],"priorityCategories":[{"id":"triceps","label":"Triceps","status":"plateauing","statusLabel":"Plateauing","statusTone":"warning","comparableExerciseCount":3}],"available":true},"bodyComposition":null,"coachInsight":{"biggestWin":"Win.","keepBuilding":"Build.","watchNextWeek":"Watch.","actionItems":[]}}}"#)
        let canonicalLive = live.replacingOccurrences(
            of: #""presentationExplanation":"Canonical explanation.","primaryReason""#,
            with: #""presentationExplanation":"Canonical explanation.","movementLabel":"No meaningful change","primaryReason""#
        )
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["briefing": canonicalLive])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "weekly-live")
        let result = try XCTUnwrap(fetched)
        XCTAssertEqual(result.confidence?.presentationExplanation, "Canonical explanation.")
        XCTAssertEqual(result.weekly?.energy?.averageIntakeKcal, 2686)
        XCTAssertEqual(result.weekly?.energy?.averageExpenditureKcal, 2561)
        XCTAssertEqual(result.weekly?.energy?.averageBalanceKcal, 171)
        XCTAssertEqual(result.weekly?.energy?.dailyBalances?.map(\.date), ["2026-09-06", "2026-09-12"])
        XCTAssertEqual(result.weekly?.energy?.dailyBalances?.last?.hasPairedData, false)
        XCTAssertEqual(result.weekly?.training?.trainingDayCount, 6)
        let highlight = try XCTUnwrap(result.weekly?.training?.highlights?.first)
        XCTAssertEqual(highlight.exerciseName, "Hyperextension Machine")
        XCTAssertEqual(highlight.recordType, "New session-volume mark")
        XCTAssertEqual(highlight.performanceValue, "4,800 lb volume")
        XCTAssertEqual(highlight.absoluteDelta, 675)
        XCTAssertEqual(highlight.percentChange, 16.4)
        XCTAssertEqual(result.weekly?.training?.priorityGroups?.first?.tone, "warning")
    }

    func testProductionMidweekBriefingPreservesDistinctFinishedPresentation() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing": build31MidweekBriefingJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "midweek-1")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.cadence, .midweek)
        XCTAssertNil(result.weekly)
        XCTAssertEqual(result.midweek?.heroVerdict, "Server-owned midweek verdict")
        XCTAssertEqual(result.midweek?.prioritiesThroughSunday, ["Keep the plan steady."])
        XCTAssertEqual(result.midweek?.energy?.headline, "Intake and expenditure are close")
        XCTAssertEqual(result.midweek?.energy?.balanceHeadline, "99 kcal/day above")
        XCTAssertEqual(result.midweek?.energy?.averageIntakeKcal, 2954)
        XCTAssertEqual(result.midweek?.energy?.averageExpenditureKcal, 2856)
        XCTAssertEqual(result.midweek?.energy?.averageBalanceKcal, 99)
        XCTAssertEqual(result.midweek?.energy?.dailyBalances?.map(\.hasPairedData), [false, true, true])
        XCTAssertEqual(result.midweek?.energy?.dailyBalances?.map(\.balanceKcal), [nil, 598, -401])
        XCTAssertFalse(result.midweek?.energy?.headline?.contains("probably_") == true)
        XCTAssertEqual(result.midweek?.training?.priorityGroups?.map(\.areaId), ["core"])
        XCTAssertNil(result.midweek?.training?.priorityGroups?.first?.comparableExerciseCount)
        XCTAssertEqual(result.confidence?.presentationExplanation, "Canonical midweek Confidence explanation.")
        XCTAssertEqual(result.confidence?.movementLabel, "No meaningful change")
        XCTAssertEqual(result.midweek?.weight?.averageWeightLb, 170.4)
        XCTAssertEqual(result.midweek?.bodyComposition?.leanMassLb, "150.25 lb")
        XCTAssertEqual(result.midweek?.training?.headline, "Two lifts moved forward")
        XCTAssertEqual(result.midweek?.training?.watch?.exercise, "Back Squat")
        XCTAssertEqual(result.midweek?.coachRecommendation, "Use the full week.")
        XCTAssertEqual(result.attribution.phaseName, "Foundation")
    }

    func testProductionMidweekUsesCompleteCanonicalNarrativeV3WithoutExpandingCadence() async throws {
        let json = productionEnvelope(
            resource: "briefing",
            data: #"{"schemaVersion":"1","artifact":{"artifactId":"midweek-v3","artifactType":"scheduled","cadence":"midweek","version":3,"evidenceWindow":{"id":"window","startDate":"2026-09-13","endDate":"2026-09-15","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-16T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal","phaseId":"phase"},"historical":{"frozen":true,"artifactBound":true},"presentation":{"presentationModel":"canonical_narrative_v3","hero":{"verdict":"Canonical V3 headline.","summary":"Canonical V3 meaning."},"narrativeV3":{"summary":"Canonical V3 headline.","detail":"Canonical V3 detail.","sections":{"result":"Canonical V3 result.","meaning":"Canonical V3 meaning.","action":"Canonical V3 action.","watch":"Canonical V3 watch.","confidence":"Canonical V3 confidence."},"coachTake":"Canonical V3 coach take."},"coachTake":{"biggestTakeaway":"Canonical V3 coach take.","recommendation":"Canonical V3 action."},"goalConfidence":{"score":79,"band":"high","priorScore":79,"delta":0,"movementDirection":"held","presentationExplanation":"Canonical V3 confidence.","movementLabel":"No meaningful change","assessmentContext":{"goalId":"goal","phaseId":"phase"},"source":"canonical_pi_snapshot"},"activeGoal":{"id":"goal","name":"Build Lean Mass"},"activePhase":{"id":"phase","name":"Lean Mass Build"},"prioritiesThroughSunday":[]}}"#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["briefing": json]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "midweek-v3")
        let result = try XCTUnwrap(fetched)
        let narrative = try XCTUnwrap(result.midweek?.narrativeV3)
        XCTAssertEqual(narrative.summary, "Canonical V3 headline.")
        XCTAssertEqual(narrative.result, "Canonical V3 result.")
        XCTAssertEqual(narrative.action, "Canonical V3 action.")
        XCTAssertEqual(narrative.coachTake, "Canonical V3 coach take.")
        XCTAssertEqual(result.confidence?.score, 79)
    }

    func testProductionBriefingRejectsLocalConfidenceFallbackWhenCanonicalPresentationIsMissing() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing": productionMidweekBriefingJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(
            try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "midweek-1")
        ) { error in
            XCTAssertEqual(error as? ProductionNativeError, .invalidResponse)
        }
    }

    func testProductionMonthlyBriefingMapsPersistedDistinctPresentationWithoutNarrativeDerivation() async throws {
        let canonicalMonthly = productionMonthlyBriefingJSON.replacingOccurrences(
            of: #""movementDirection":"increased","primaryReason""#,
            with: #""movementDirection":"increased","presentationExplanation":"Canonical monthly Confidence explanation.","movementLabel":"Confidence increased","primaryReason""#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing": canonicalMonthly]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "monthly-1")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.cadence, .monthly)
        XCTAssertEqual(result.monthly?.heroHeadline, "Server-owned monthly thesis")
        XCTAssertEqual(result.monthly?.energyEvolution?.weeks.map(\.weekLabel), ["Sep 1–7"])
        XCTAssertEqual(result.monthly?.whatChangedSections?.first?.headline, "Consistency improved")
        XCTAssertEqual(result.monthly?.heroHighlights?.first?.value, "Three lifts advanced")
        XCTAssertEqual(result.monthly?.trainingProgress?.stats.first?.detail, "Across the completed month")
        XCTAssertEqual(result.confidence?.presentationExplanation, "Canonical monthly Confidence explanation.")
        XCTAssertEqual(result.confidence?.movementLabel, "Confidence increased")
        XCTAssertNil(result.weekly)
        XCTAssertNil(result.midweek)
    }

    func testProductionMonthlyBriefingDoesNotInventMissingEvidenceSections() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing": productionMonthlyBriefingWithOptionalSectionsMissingJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "monthly-minimal")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.monthly?.heroHeadline, "A legitimately sparse month")
        XCTAssertNil(result.monthly?.trainingProgress)
        XCTAssertNil(result.monthly?.energyEvolution)
        XCTAssertNil(result.monthly?.newBaseline)
    }

    func testProductionDEXAEventUsesCanonicalEventRouteAndFrozenArtifact() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["dexa-event": productionDEXAEventJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchDEXAEvent(scanId: "scan-canonical")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.dexa?.scanId, "scan-canonical")
        XCTAssertEqual(result.dexa?.scanDate, "2026-08-15")
        XCTAssertEqual(result.dexa?.priorScanDate, "2026-07-31")
        XCTAssertEqual(result.dexa?.hero.title, "Body fat stayed controlled, but new muscle is not established yet.")
        XCTAssertEqual(result.confidence?.movementLabel, "No meaningful change")
        XCTAssertEqual(result.confidence?.presentationExplanation, "The Aug 15 DEXA established a reliable baseline, but one scan cannot establish a lasting lean-mass response.")
        XCTAssertEqual(result.dexa?.progress.headline.first?.previous, "147.50 lb")
        XCTAssertEqual(result.dexa?.progress.headline.first?.current, "148.30 lb")
        XCTAssertEqual(result.dexa?.progress.headline.first?.delta, "+0.80 lb")
        XCTAssertEqual(result.dexa?.progress.regionalFat.first?.delta, "−0.04 lb")
        XCTAssertEqual(result.dexa?.progress.timeline.timelineLabel, "Since Starting the Lean Mass Phase")
        XCTAssertEqual(result.dexa?.progress.timeline.scans.map(\.date), ["2026-07-31", "2026-08-15"])
        XCTAssertEqual(result.dexa?.progress.timeline.summary, "Across this body-composition timeline, body fat moved from 7.7% to 7.6%, fat mass changed 0.0 lb, and measured lean tissue changed +0.8 lb.")
        let request = await transport.requests.last
        XCTAssertEqual(request?.url?.path, "/api/v1/native/read/dexa-event")
        XCTAssertEqual(URLComponents(url: try XCTUnwrap(request?.url), resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "scanId" })?.value, "scan-canonical")
    }

    func testProductionPhotoEventUsesCanonicalEventRouteAndOpaqueMediaIDs() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["photo-event": productionPhotoEventJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchPhotoEvent(sessionId: "session-canonical")
        let result = try XCTUnwrap(fetched)

        XCTAssertEqual(result.photo?.photoSessionId, "session-canonical")
        XCTAssertEqual(result.photo?.activeViews.first?.mediaId, "media-current")
        XCTAssertEqual(result.photo?.ordinaryComparisons.first?.priorMediaId, "media-prior")
        XCTAssertEqual(result.photo?.ordinaryComparisons.first?.currentMediaId, "media-current")
        let request = await transport.requests.last
        XCTAssertEqual(request?.url?.path, "/api/v1/native/read/photo-event")
        XCTAssertEqual(URLComponents(url: try XCTUnwrap(request?.url), resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "sessionId" })?.value, "session-canonical")
    }

    func testHistoryPhotoEventDetailPreservesAuthorizedPreviousAndCurrentMediaIdentities() async throws {
        let historyPayload = productionEnvelope(resource: "briefing", data: #"""
        {"artifact":{"id":"event_briefing_progress_photo_session-canonical","cadence":"event","version":1,"generatedAt":"2026-09-01T12:00:00Z","goalContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"briefing":{"photoEventNarrative":{"photoSessionId":"session-canonical","eventDate":"2026-09-01","activeViews":[],"cardContent":{"hero":{"title":"Canonical photo event","body":"Published narrative."},"snapshot":{"poses":["Front Relaxed"],"conditions":"Consistent"},"progress":{"comparisons":[{"id":"comparison-1","poseId":"front-relaxed","photoSessionId":"session-canonical","previousSessionId":"session-prior","previousDate":"2026-08-15","headline":"Canonical comparison.","previousMedia":{"mediaId":"media-prior","deliveryPath":"/api/v1/native/media/media-prior"},"media":{"mediaId":"media-current","deliveryPath":"/api/v1/native/media/media-current"}}]},"interpretation":{"paragraphs":[]},"coachInsight":{"body":""}}}}},"goals":[{"id":"goal-canonical","title":"Build Lean Mass"}]}
        """#)
        let canonicalHistoryPayload = historyPayload.replacingOccurrences(
            of: #""activeViews""#,
            with: #""goalConfidence":{"score":64,"band":"moderate","movementDirection":"held","presentationExplanation":"Canonical photo Confidence explanation.","movementLabel":"No meaningful change","primaryReason":"Canonical photo rationale.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"goalId":"goal-canonical","phaseId":"phase-canonical","assessmentDate":"2026-09-01T12:00:00Z","source":"canonical_pi_snapshot"},"activeViews""#
        )
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["briefing": canonicalHistoryPayload]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchBriefing(artifactId: "event_briefing_progress_photo_session-canonical")
        let result = try XCTUnwrap(fetched)
        let comparison = try XCTUnwrap(result.photo?.ordinaryComparisons.first)

        XCTAssertEqual(comparison.poseId, .frontRelaxed)
        XCTAssertEqual(comparison.priorSetId, "session-prior")
        XCTAssertEqual(comparison.priorMediaId, "media-prior")
        XCTAssertEqual(comparison.currentMediaId, "media-current")
        XCTAssertEqual(result.confidence?.presentationExplanation, "Canonical photo Confidence explanation.")
        XCTAssertEqual(result.confidence?.movementLabel, "No meaningful change")
    }

    func testProductionPhotoEventResolvesCanonicalCurrentAndPriorMediaForEveryPose() async throws {
        let views = PhotoPoseID.allCases.map { pose in
            #"{"id":"view-\#(pose.rawValue)","poseId":"\#(pose.rawValue)","headline":"Canonical","supportingObservations":[],"comparisonStatus":"comparable","establishesBaseline":false,"goalRelevance":"primary","media":{"mediaId":"current-\#(pose.rawValue)","deliveryPath":"/api/v1/native/media/current-\#(pose.rawValue)"}}"#
        }.joined(separator: ",")
        let comparisons = PhotoPoseID.allCases.map { pose in
            #"{"id":"comparison-\#(pose.rawValue)","poseId":"\#(pose.rawValue)","photoSessionId":"current-session","previousSessionId":"prior-session","previousDate":"2026-08-08","headline":"Canonical comparison","previousMedia":{"mediaId":"prior-\#(pose.rawValue)","deliveryPath":"/api/v1/native/media/prior-\#(pose.rawValue)"},"media":{"mediaId":"current-\#(pose.rawValue)","deliveryPath":"/api/v1/native/media/current-\#(pose.rawValue)"}}"#
        }.joined(separator: ",")
        let payload = productionEnvelope(resource: "photo-event", data: """
        {"artifactId":"photo-all-poses","completion":null,"narrative":{"photoSessionId":"current-session","eventDate":"2026-09-01","completion":"7/7 complete","supportingEvidence":{},"activeViews":[\(views)],"cardContent":{"hero":{"title":"Canonical hero","body":"Canonical body"},"snapshot":{"title":"Snapshot","poses":[],"conditions":"Canonical conditions"},"progress":{"title":"Progress","body":"Canonical progress","comparisons":[\(comparisons)]},"interpretation":{"title":"Interpretation","paragraphs":[]},"coachInsight":{"body":"Canonical coach"}}}}
        """)
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["photo-event": payload])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionBriefingAPI(api: native).fetchPhotoEvent(sessionId: "current-session")
        let photo = try XCTUnwrap(fetched?.photo)

        XCTAssertEqual(Set(photo.activeViews.map(\.poseId)), Set(PhotoPoseID.allCases))
        XCTAssertEqual(Set(photo.activeViews.compactMap(\.mediaId)), Set(PhotoPoseID.allCases.map { "current-\($0.rawValue)" }))
        XCTAssertEqual(Set(photo.ordinaryComparisons.compactMap(\.priorMediaId)), Set(PhotoPoseID.allCases.map { "prior-\($0.rawValue)" }))
        XCTAssertEqual(Set(photo.ordinaryComparisons.compactMap(\.currentMediaId)), Set(PhotoPoseID.allCases.map { "current-\($0.rawValue)" }))
    }

    @MainActor
    func testAppEnvironmentBriefingAPISwitchesWithAuthorityAndFounderProductionNeverLeaksSandboxFixture() async throws {
        let suite = "PhysiqueOS.BriefingAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store)

        XCTAssertTrue(environment.briefingAPI is FixtureBriefingAPI)
        let sandboxHistory = try await environment.briefingAPI.fetchHistory()
        XCTAssertFalse(sandboxHistory.isEmpty)

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.briefingAPI is ProductionBriefingAPI)
    }

    func testProductionMediaAcceptsAuthenticatedImageAndPDF() async throws {
        let fixtures = [
            ("image/jpeg", Data([0xFF, 0xD8, 0xFF, 0xD9])),
            ("image/png", Data([0x89, 0x50, 0x4E, 0x47])),
            ("image/heic", Data("ftypheic".utf8)),
            ("image/webp", Data([0x52, 0x49, 0x46, 0x46])),
            ("application/pdf", Data("%PDF-1.7".utf8)),
        ]
        for (contentType, bytes) in fixtures {
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .data(200, mimeType: contentType, bytes),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

            let media = try await api.readMedia(mediaId: "media_opaque_1")

            XCTAssertEqual(media.contentType, contentType)
            XCTAssertEqual(media.data, bytes)
            let request = await transport.requests.last
            XCTAssertEqual(request?.url?.path, "/api/v1/native/media/media_opaque_1")
            XCTAssertTrue(request?.value(forHTTPHeaderField: "Accept")?.contains("application/pdf") == true)
        }
    }

    func testProductionMediaRefreshesExpiredBearerAndRetriesOnce() async throws {
        let expired = productionProblemJSON(status: 401, code: "ACCESS_TOKEN_EXPIRED")
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(401, expired),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .data(200, mimeType: "application/pdf", Data("%PDF-1.7".utf8)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        _ = try await api.readMedia(mediaId: "media_opaque_1")

        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/auth/pair",
            "/api/v1/native/media/media_opaque_1",
            "/api/v1/native/auth/refresh",
            "/api/v1/native/media/media_opaque_1",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    /// The media route answers an expired 10-minute bearer with a plain 404 (never the
    /// 401 `ACCESS_TOKEN_EXPIRED` problem the JSON routes send), so the generic refresh
    /// never ran and a Retry resent the same stale bearer. Root cause of the first
    /// Sep 19 photo showing an unrecoverable "Retry photo".
    func testProductionMediaRefreshesOnceWhenTheRouteMasksAnExpiredBearerAsNotFound() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(404, mimeType: "text/plain", Data("Not found".utf8)),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .data(200, mimeType: "image/jpeg", Data([0xFF, 0xD8, 0xFF])),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let media = try await api.readMedia(mediaId: "media_opaque_1")

        XCTAssertEqual(media.contentType, "image/jpeg")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/auth/pair", "/api/v1/native/media/media_opaque_1",
            "/api/v1/native/auth/refresh", "/api/v1/native/media/media_opaque_1",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testProductionMediaGenuinelyMissingObjectRefreshesOnceThenStillFailsNotFound() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(404, mimeType: "text/plain", Data("Not found".utf8)),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .data(404, mimeType: "text/plain", Data("Not found".utf8)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readMedia(mediaId: "media_opaque_1")) { error in
            guard case .notFound = error as? ProductionNativeError else { return XCTFail("expected notFound, got \(error)") }
        }
        let count = await transport.requests.count
        XCTAssertEqual(count, 4, "bounded: one refresh and one re-read, never a loop")
    }

    @MainActor
    func testRetryAfterAFailedPhotoPerformsAnotherServerReadAndRecovers() async throws {
        let notFound = SequencedFounderTransport.Outcome.data(404, mimeType: "text/plain", Data("Not found".utf8))
        let jpeg = UIGraphicsImageRenderer(size: CGSize(width: 12, height: 16)).jpegData(withCompressionQuality: 0.9) { context in
            UIColor.darkGray.setFill(); context.fill(CGRect(x: 0, y: 0, width: 12, height: 16))
        }
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            notFound, .json(200, sessionJSON(access: "b", refresh: "s")), notFound,   // first load fails
            .data(200, mimeType: "image/jpeg", jpeg),                                   // Retry
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let store = FounderProductionPhotoMediaStore(api: api)

        await store.loadImage(mediaId: "media_opaque_1")
        XCTAssertEqual(store.imageStates["media_opaque_1"], .failed)
        let beforeRetry = await transport.requests.count

        await store.retryImage(mediaId: "media_opaque_1")

        let afterRetry = await transport.requests.count
        XCTAssertEqual(afterRetry - beforeRetry, 1, "Retry performs another Server media read")
        guard case .loaded = store.imageStates["media_opaque_1"] else { return XCTFail("Retry should recover the photo") }
        XCTAssertEqual(store.imageStates.count, 1, "no duplicated media entry for the same photo")
    }

    @MainActor
    func testPermanentMediaFailuresOfferNoRetryAndTransientOnesDo() {
        XCTAssertEqual(FounderProductionPhotoMediaStore.failureState(for: ProductionNativeError.unsupportedMediaType("text/html")), .unavailable)
        XCTAssertEqual(FounderProductionPhotoMediaStore.failureState(for: ProductionNativeError.notFound(nil)), .failed)
        XCTAssertEqual(FounderProductionPhotoMediaStore.failureState(for: ProductionNativeError.networkFailure), .failed)
        XCTAssertEqual(FounderProductionPhotoMediaStore.failureState(for: ProductionNativeError.invalidResponse), .failed)
    }

    @MainActor
    func testUndecodableImageBytesAreUnavailableNotRetryable() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(200, mimeType: "image/jpeg", Data([0x00, 0x01, 0x02])),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let store = FounderProductionPhotoMediaStore(api: api)
        await store.loadImage(mediaId: "media_opaque_1")
        XCTAssertEqual(store.imageStates["media_opaque_1"], .unavailable)
    }

    func testPhotoBriefingAvailabilityMapsServerPublicationAndNeverCachesAPendingAnswer() async throws {
        let published = productionPhotoEventJSON
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(404, #"{"type":"about:blank","title":"Not Found","status":404,"code":"RESOURCE_NOT_FOUND"}"#),
            .json(404, #"{"type":"about:blank","title":"Not Found","status":404,"code":"RESOURCE_NOT_FOUND"}"#),
            .json(200, published),
            .json(500, #"{"status":500,"code":"INTERNAL","title":"Failure","detail":null}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let briefings = ProductionBriefingAPI(api: api)

        let first = await briefings.photoBriefingAvailability(sessionId: "session-1")
        let second = await briefings.photoBriefingAvailability(sessionId: "session-1")
        let third = await briefings.photoBriefingAvailability(sessionId: "session-1")
        let fourth = await briefings.photoBriefingAvailability(sessionId: "session-1")

        XCTAssertEqual(first, .pending)
        XCTAssertEqual(second, .pending, "each poll reaches the Server")
        guard case .published(let artifactId) = third else { return XCTFail("a 200 photo-event is published") }
        XCTAssertFalse(artifactId.isEmpty)
        XCTAssertEqual(fourth, .unknown, "a Server failure is not treated as pending or published")
        let paths = await transport.requests.compactMap { $0.url?.path }.filter { $0.hasSuffix("photo-event") }
        XCTAssertEqual(paths.count, 4)
    }

    func testProductionMediaRejectsUnsupportedContentType() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(200, mimeType: "text/html", Data("no".utf8)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readMedia(mediaId: "media_opaque_1")) { error in
            XCTAssertEqual(error as? ProductionNativeError, .unsupportedMediaType("text/html"))
        }
    }

    @MainActor
    func testWeightProviderRefetchReplacesPriorProductionResult() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionWeightJSON(value: 168.0, id: "weight-old")),
            .json(200, productionWeightJSON(value: 167.2, id: "weight-new")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let viewModel = WeightHistoryViewModel(api: ProductionWeightEvidenceAPI(api: api))

        await viewModel.load()
        await api.invalidateReadResources(["weight"])
        await viewModel.load()

        guard case .loaded(let report) = viewModel.state else { return XCTFail("Expected loaded Weight") }
        XCTAssertEqual(report.history.first?.id, "weight-new")
        XCTAssertEqual(report.history.first?.value, "167.2 lb")
        let requestCount = await transport.requests.count
        XCTAssertEqual(requestCount, 3)
    }

    // MARK: - Daily Driver Write Build: production commands

    func testProductionSubmitWeightSendsIdempotencyKeyUUIDv7CommandIdAndDecodesResult() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCommandOutcomeJSON(result: #"{"status":"committed","weightId":"weight_2026_09_11","weightRevision":1,"checkInId":null,"checkInRevision":null,"analysisId":null,"intendedDate":"2026-09-11","goalIds":[],"continuationWorkItemIds":[]}"#)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        let result = try await writeAPI.submitWeight(localDate: "2026-09-11", value: 168.4, expectedVersion: nil)

        XCTAssertEqual(result.status, "committed")
        XCTAssertEqual(result.weightRevision, 1)
        let requests = await transport.requests
        let commandRequest = requests[1]
        XCTAssertEqual(commandRequest.url?.path, "/api/v1/native/commands")
        let idempotencyKey = commandRequest.value(forHTTPHeaderField: "Idempotency-Key")
        XCTAssertNotNil(idempotencyKey)
        XCTAssertNil(commandRequest.value(forHTTPHeaderField: "If-Match"))
        let body = try XCTUnwrap(commandRequest.httpBody)
        let decoded = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        XCTAssertEqual(decoded?["commandType"] as? String, "weight.submit.v1")
        let metadata = decoded?["metadata"] as? [String: Any]
        XCTAssertEqual(metadata?["idempotencyKey"] as? String, idempotencyKey)
        let commandId = try XCTUnwrap(metadata?["commandId"] as? String)
        XCTAssertTrue(isUUIDv7(commandId), "commandId '\(commandId)' must be a real UUIDv7")
        let payload = decoded?["payload"] as? [String: Any]
        XCTAssertEqual(payload?["localDate"] as? String, "2026-09-11")
        XCTAssertEqual(payload?["value"] as? Double, 168.4)
    }

    func testProductionSubmitWeightSendsIfMatchWhenExpectedVersionProvided() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCommandOutcomeJSON(result: #"{"status":"committed","weightId":"weight_2026_09_11","weightRevision":2,"checkInId":null,"checkInRevision":null,"analysisId":null,"intendedDate":"2026-09-11","goalIds":[],"continuationWorkItemIds":[]}"#)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        _ = try await writeAPI.submitWeight(localDate: "2026-09-11", value: 169.0, expectedVersion: "1")

        let requests = await transport.requests
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"1\"")
    }

    func testProductionMorningCheckInPreservesServerOccurrenceIdentityAndRevision() async throws {
        let result = #"{"status":"committed","weightId":"weight_2026_09_11","weightRevision":2,"checkInId":"check-in-1","checkInRevision":1,"analysisId":null,"intendedDate":"2026-09-11","goalIds":["goal-1"],"continuationWorkItemIds":[]}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCommandOutcomeJSON(result: result)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        _ = try await writeAPI.submitMorningCheckIn(
            localDate: "2026-09-11",
            value: 168.4,
            expectedVersion: "1",
            reconciliationSubmissions: [MorningCheckInReconciliationSubmission(
                priorityId: "priority-1",
                occurrenceDate: "2026-09-10",
                occurrenceKey: "server-owned-occurrence-key",
                disposition: "completed",
                note: "Done"
            )]
        )

        let requests = await transport.requests
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"1\"")
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        XCTAssertEqual(json["commandType"] as? String, "check-in.submit.v1")
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        let submissions = try XCTUnwrap(payload["reconciliationSubmissions"] as? [[String: Any]])
        XCTAssertEqual(submissions.first?["occurrenceKey"] as? String, "server-owned-occurrence-key")
        XCTAssertEqual(submissions.first?["priorityId"] as? String, "priority-1")
    }

    func testProductionMorningCheckInLostResponseRetryReusesIdempotencyIdentity() async throws {
        let result = #"{"status":"committed","weightId":"weight_2026_09_19","weightRevision":2,"checkInId":"check-in-1","checkInRevision":1,"analysisId":null,"intendedDate":"2026-09-19","goalIds":[],"continuationWorkItemIds":[]}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .failure(URLError(.timedOut)),
            .json(200, productionCommandOutcomeJSON(result: result, outcome: "replayed")),
        ])
        let api = ProductionNativeAPI(
            baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport
        )
        _ = try await api.pair(
            pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone"
        )
        let writeAPI = ProductionWeightWriteAPI(
            api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults())
        )
        let submissions = [MorningCheckInReconciliationSubmission(
            priorityId: "reminder-fadogia", occurrenceDate: "2026-09-18",
            occurrenceKey: "reminder-fadogia:2026-09-18", disposition: "completed", note: nil
        )]

        await XCTAssertThrowsErrorAsync(try await writeAPI.submitMorningCheckIn(
            localDate: "2026-09-19", value: 168.4, expectedVersion: "1",
            reconciliationSubmissions: submissions
        )) { error in
            XCTAssertEqual(error as? ProductionNativeError, .networkFailure)
        }
        _ = try await writeAPI.submitMorningCheckIn(
            localDate: "2026-09-19", value: 168.4, expectedVersion: "1",
            reconciliationSubmissions: submissions
        )

        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(
            requests[1].value(forHTTPHeaderField: "Idempotency-Key"),
            requests[2].value(forHTTPHeaderField: "Idempotency-Key")
        )
    }

    func testProductionSubmitWeightMapsStaleVersionAndPreconditionRequired() async throws {
        for (status, code): (Int, String) in [(412, "STALE_VERSION"), (428, "PRECONDITION_REQUIRED")] {
            let transport = SequencedFounderTransport([
                .json(200, sessionJSON(access: "a", refresh: "r")),
                .json(status, productionProblemJSON(status: status, code: code)),
            ])
            let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
            let writeAPI = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

            await XCTAssertThrowsErrorAsync(try await writeAPI.submitWeight(localDate: "2026-09-11", value: 169.0, expectedVersion: "1")) { error in
                switch (status, error as? ProductionNativeError) {
                case (412, .failedPrecondition(let problem)): XCTAssertEqual(problem.code, "STALE_VERSION")
                case (428, .preconditionRequired(let problem)): XCTAssertEqual(problem.code, "PRECONDITION_REQUIRED")
                default: XCTFail("Unexpected error for status \(status): \(String(describing: error))")
                }
            }
        }
    }

    /// A retry of the exact same logical write (same date/value) MUST
    /// reuse the same idempotency key so the server's own command-receipt
    /// replay — not a second client-generated key — is what prevents a
    /// duplicate mutation. A genuinely different value mints a fresh key.
    func testProductionIdempotencyKeyStoreReusesKeyOnlyForIdenticalSignature() {
        let store = ProductionIdempotencyKeyStore(defaults: Self.freshDefaults())
        let firstKey = store.resolvedKey(scope: "weight-submit.2026-09-11", signature: "weight.submit.v1\u{1F}2026-09-11\u{1F}168.4\u{1F}")
        let retryKey = store.resolvedKey(scope: "weight-submit.2026-09-11", signature: "weight.submit.v1\u{1F}2026-09-11\u{1F}168.4\u{1F}")
        let correctionKey = store.resolvedKey(scope: "weight-submit.2026-09-11", signature: "weight.submit.v1\u{1F}2026-09-11\u{1F}169.0\u{1F}")

        XCTAssertEqual(firstKey, retryKey)
        XCTAssertNotEqual(firstKey, correctionKey)
    }

    func testProductionPriorityCompletionPreservesCanonicalIdentityVersionAndDoseContext() async throws {
        let result = #"{"status":"committed","record":{"id":"ignored"}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCommandOutcomeJSON(result: result)),
            .json(200, productionCommandOutcomeJSON(result: result)),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionPriorityCompletionWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        try await writeAPI.complete(priorityId: "reminder-foam", occurrenceDate: "2026-09-13", context: .init(occurrenceDate: "2026-09-13", dose: nil, protocolId: nil), expectedVersion: 4)
        try await writeAPI.complete(priorityId: "reminder-tesamorelin", occurrenceDate: "2026-09-13", context: .init(occurrenceDate: "2026-09-13", dose: "0.5 mg", protocolId: "protocol-tesamorelin"), expectedVersion: 8)

        let requests = await transport.requests
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"4\"")
        XCTAssertEqual(requests[2].value(forHTTPHeaderField: "If-Match"), "\"8\"")
        let ordinary = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        let ordinaryPayload = try XCTUnwrap(ordinary["payload"] as? [String: Any])
        XCTAssertEqual(ordinary["commandType"] as? String, "priority.complete.v1")
        XCTAssertEqual(ordinaryPayload["priorityId"] as? String, "reminder-foam")
        XCTAssertEqual(ordinaryPayload["occurrenceDate"] as? String, "2026-09-13")
        let specialized = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[2].httpBody)) as? [String: Any])
        let specializedPayload = try XCTUnwrap(specialized["payload"] as? [String: Any])
        XCTAssertEqual(specializedPayload["dose"] as? String, "0.5 mg")
        XCTAssertEqual(specializedPayload["protocolId"] as? String, "protocol-tesamorelin")
    }

    func testProductionPriorityCompletionFailureIsNotAcceptedAsSuccess() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(412, productionProblemJSON(status: 412, code: "STALE_VERSION")),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionPriorityCompletionWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        await XCTAssertThrowsErrorAsync(try await writeAPI.complete(priorityId: "reminder-foam", occurrenceDate: "2026-09-13", context: nil, expectedVersion: 4)) { error in
            switch error as? ProductionNativeError {
            case .failedPrecondition(let problem):
                XCTAssertEqual(problem.code, "STALE_VERSION")
            default:
                XCTFail("Expected stale-version failure")
            }
        }
    }

    func testProductionPriorityCompletionRecoversLostAcknowledgementWithSameIdempotencyKey() async throws {
        let result = #"{"status":"already_completed","record":{"id":"reminder-fadogia"}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .failure(URLError(.timedOut)),
            .json(200, productionCommandOutcomeJSON(result: result, outcome: "replayed")),
        ])
        let api = ProductionNativeAPI(
            baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport
        )
        _ = try await api.pair(
            pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone"
        )
        let writeAPI = ProductionPriorityCompletionWriteAPI(
            api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults())
        )

        try await writeAPI.complete(
            priorityId: "reminder-fadogia", occurrenceDate: "2026-09-19",
            context: .init(occurrenceDate: "2026-09-19", dose: nil, protocolId: nil),
            expectedVersion: 8
        )

        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertEqual(
            requests[1].value(forHTTPHeaderField: "Idempotency-Key"),
            requests[2].value(forHTTPHeaderField: "Idempotency-Key")
        )
        let first = try XCTUnwrap(requests[1].httpBody)
        let second = try XCTUnwrap(requests[2].httpBody)
        var firstEnvelope = try XCTUnwrap(JSONSerialization.jsonObject(with: first) as? [String: Any])
        var secondEnvelope = try XCTUnwrap(JSONSerialization.jsonObject(with: second) as? [String: Any])
        var firstMetadata = try XCTUnwrap(firstEnvelope["metadata"] as? [String: Any])
        var secondMetadata = try XCTUnwrap(secondEnvelope["metadata"] as? [String: Any])
        firstMetadata.removeValue(forKey: "commandId")
        secondMetadata.removeValue(forKey: "commandId")
        firstEnvelope["metadata"] = firstMetadata
        secondEnvelope["metadata"] = secondMetadata
        XCTAssertEqual(firstEnvelope as NSDictionary, secondEnvelope as NSDictionary)
    }

    func testProductionMorningCheckInReadDecodesCanonicalOccurrenceIdentity() async throws {
        let body = #"{"contractVersion":"1","resource":"morning-check-in","authority":"founder-production","generatedAt":"2026-09-11T12:00:00.000Z","data":{"today":"2026-09-11","existingWeight":168.4,"previousWeight":168.8,"reconciliationItems":[{"id":"reminder-1","occurrenceKey":"reminder-1:2026-09-10","date":"2026-09-10","title":"Train","context":"Phase 2","kind":"execution"}]}}"#
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), .json(200, body)])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let result = try await ProductionMorningCheckInAPI(api: api).fetchMorningCheckIn()

        XCTAssertEqual(result.today, "2026-09-11")
        XCTAssertEqual(result.unfinishedPriorities.first?.id, "reminder-1")
        XCTAssertEqual(result.unfinishedPriorities.first?.occurrenceKey, "reminder-1:2026-09-10")
    }

    func testProductionTrainingCommitReplaysStagedReceiptUntilExplicitDurability() async throws {
        let result = #"{"status":"confirmation_requested","reviewId":"review-1","reviewRevision":1,"sessionId":"native-session-1","intendedDate":"2026-09-11","exerciseIds":["barbell_bench_press","pull_up"]}"#
        let response = #"{"outcome":"committed","receipt":{"status":"committed","result":"# + result + #", "operationId":null,"commandId":"01911111-1111-7111-8111-111111111111"},"confirmation":{"state":"processing","accepted":true,"reviewId":"review-1","continuationKey":"continuation","completedStep":null,"publication":null}}"#
        let durableResponse = response.replacingOccurrences(of: "\"completedStep\":null", with: "\"completedStep\":\"canonical_commit\",\"trainingSessionDurable\":true")
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, response),
            .json(404, #"{"type":"about:blank","title":"Not Found","status":404,"detail":"No durable session yet"}"#),
            .json(200, durableResponse),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionTrainingWriteAPI(
            api: api,
            reviewAPI: NotAvailableEvidenceReviewAPI(),
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()),
            durabilityRetryDelay: .zero
        )
        var draft = TrainingLoggerDraft(
            id: "native-session-1", mode: .live, workoutDate: "2026-09-11", selectedAreaIds: ["chest"],
            exercises: [TrainingLoggerDraftExercise(
                id: "occurrence-1", canonicalExerciseId: "barbell_bench_press", name: "Barbell Bench Press",
                areaId: "chest", measurement: .repsLoad, executionVariant: nil,
                sets: [TrainingLoggerDraftSet(id: "set-1", setNumber: 1, reps: 8, load: 185, durationSeconds: nil, isCompleted: true)],
                previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
                isProvisional: false, provenance: nil
            ), TrainingLoggerDraftExercise(
                id: "occurrence-2", canonicalExerciseId: "pull_up", name: "Pull-Ups",
                areaId: "back", measurement: .bodyweightReps, defaultLoadType: "bodyweight", executionVariant: nil,
                sets: [
                    TrainingLoggerDraftSet(id: "set-bw", setNumber: 1, reps: 8, load: nil, loadType: "bodyweight", durationSeconds: nil, isCompleted: true),
                    TrainingLoggerDraftSet(id: "set-added", setNumber: 2, reps: 6, load: 25, loadType: "external_load", durationSeconds: nil, isCompleted: true),
                    // A historical numeric zero must never reach the wire as external_load 0 lb.
                    TrainingLoggerDraftSet(id: "set-zero", setNumber: 3, reps: 5, load: 0, loadType: "external_load", durationSeconds: nil, isCompleted: true),
                ],
                previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
                isProvisional: false, provenance: nil
            )],
            relationships: [], step: .review, exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil, supportingEvidence: nil, supportingWorkouts: nil,
            supportingWorkoutFailureAssetIds: nil
        )
        draft.startedAt = "2026-09-11T14:00:00Z"
        draft.finishedAt = "2026-09-11T15:05:00Z"

        let committed = try await writeAPI.commit(draft)

        XCTAssertTrue(committed.isDurable)
        XCTAssertEqual(committed.status, "durable")
        XCTAssertEqual(committed.exerciseIds, ["barbell_bench_press", "pull_up"])
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 4)
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"), requests[3].value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertEqual(requests[1].timeoutInterval, 3)
        XCTAssertEqual(requests[3].timeoutInterval, 1)
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        XCTAssertEqual(json["commandType"] as? String, "training-session.commit.v1")
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        XCTAssertEqual(payload["startedAt"] as? String, "2026-09-11T14:00:00Z")
        XCTAssertEqual(payload["finishedAt"] as? String, "2026-09-11T15:05:00Z")
        let exercises = try XCTUnwrap(payload["exercises"] as? [[String: Any]])
        XCTAssertEqual(exercises.first?["canonicalExerciseId"] as? String, "barbell_bench_press")
        XCTAssertEqual((exercises.first?["sets"] as? [[String: Any]])?.first?["unit"] as? String, "lb")
        let bodyweightSets = try XCTUnwrap(exercises.last?["sets"] as? [[String: Any]])
        XCTAssertEqual(bodyweightSets[0]["loadType"] as? String, "bodyweight")
        XCTAssertNil(bodyweightSets[0]["load"])
        XCTAssertEqual(bodyweightSets[1]["loadType"] as? String, "external_load")
        XCTAssertEqual(bodyweightSets[1]["load"] as? Double, 25)
        XCTAssertEqual(bodyweightSets[1]["unit"] as? String, "lb")
        XCTAssertEqual(bodyweightSets[2]["loadType"] as? String, "bodyweight")
        XCTAssertNil(bodyweightSets[2]["load"], "unweighted bodyweight carries no external load value")
        XCTAssertEqual(bodyweightSets[2]["unit"] as? String, "bodyweight")
    }

    func testProductionTrainingCommitRecoversLostAcknowledgementWithSameIdempotencyKey() async throws {
        let readback = productionEnvelope(resource: "training-session", data: #"{"id":"training|authoritative|training_logger_draft_native-session-lost-ack","label":"Traditional Strength Training","value":"Shoulders · 1 exercise","detail":"","date":"2026-09-15","sourceEvidence":[],"exercises":[{"id":"occurrence-1","name":"Shoulder Press Machine","canonicalExerciseId":"shoulder_press_machine","executionVariant":null,"sets":[{"setNumber":1,"reps":8,"weight":100,"weightUnit":"lb","durationSeconds":null,"loadType":"external_load","setType":null}]}],"exerciseRelationshipGroups":[]}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .failure(URLError(.timedOut)),
            .json(200, readback),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionTrainingWriteAPI(
            api: api, reviewAPI: NotAvailableEvidenceReviewAPI(),
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()),
            durabilityRetryDelay: .zero
        )
        let draft = TrainingLoggerDraft(
            id: "native-session-lost-ack", mode: .live, workoutDate: "2026-09-15", selectedAreaIds: ["shoulders"],
            exercises: [TrainingLoggerDraftExercise(
                id: "occurrence-1", canonicalExerciseId: "shoulder_press_machine", name: "Shoulder Press Machine",
                areaId: "shoulders", measurement: .repsLoad, executionVariant: nil,
                sets: [TrainingLoggerDraftSet(id: "set-1", setNumber: 1, reps: 8, load: 100, durationSeconds: nil, isCompleted: true)],
                previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
                isProvisional: false, provenance: nil
            )], relationships: [], step: .review, exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil, supportingEvidence: nil, supportingWorkouts: nil,
            supportingWorkoutFailureAssetIds: nil
        )

        let committed = try await writeAPI.commit(draft)

        XCTAssertEqual(committed.sessionId, "native-session-lost-ack")
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertNil(requests[2].value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertEqual(requests[1].timeoutInterval, 3)
        XCTAssertEqual(requests[2].url?.path, "/api/v1/native/read/training-session")
    }

    func testProductionTrainingCommitStopsWithHonestProcessingStateAfterBoundedRecovery() async throws {
        let result = #"{"status":"confirmation_requested","reviewId":"review-processing","reviewRevision":1,"sessionId":"native-session-processing","intendedDate":"2026-09-15","exerciseIds":["shoulder_press_machine"]}"#
        let processing = #"{"outcome":"committed","receipt":{"status":"committed","result":"# + result + #", "operationId":null,"commandId":"01911111-1111-7111-8111-111111111111"},"confirmation":{"state":"processing","accepted":true,"reviewId":"review-processing","continuationKey":"continuation","completedStep":null,"publication":null}}"#
        let missing = #"{"type":"about:blank","title":"Not Found","status":404,"detail":"No durable session yet"}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, processing), .json(404, missing),
            .json(200, processing), .json(404, missing),
            .json(404, missing),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionTrainingWriteAPI(
            api: api, reviewAPI: NotAvailableEvidenceReviewAPI(),
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()),
            durabilityRetryDelay: .zero
        )
        let draft = TrainingLoggerDraft(
            id: "native-session-processing", mode: .live, workoutDate: "2026-09-15", selectedAreaIds: ["shoulders"],
            exercises: [TrainingLoggerDraftExercise(
                id: "occurrence-1", canonicalExerciseId: "shoulder_press_machine", name: "Shoulder Press Machine",
                areaId: "shoulders", measurement: .repsLoad, executionVariant: nil,
                sets: [TrainingLoggerDraftSet(id: "set-1", setNumber: 1, reps: 8, load: 100, durationSeconds: nil, isCompleted: true)],
                previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
                isProvisional: false, provenance: nil
            )], relationships: [], step: .review, exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil, supportingEvidence: nil, supportingWorkouts: nil,
            supportingWorkoutFailureAssetIds: nil
        )

        let outcomeResult = try await writeAPI.commit(draft)

        XCTAssertEqual(outcomeResult.status, "accepted_processing")
        XCTAssertFalse(outcomeResult.isDurable)
        XCTAssertEqual(outcomeResult.sessionId, draft.id)
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 6)
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"),
                       requests[3].value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertEqual(requests[1].timeoutInterval, 3)
        XCTAssertEqual(requests[3].timeoutInterval, 1)
        XCTAssertEqual(requests.filter { $0.url?.path == "/api/v1/native/read/training-session" }.count, 3)
    }

    /// Build 32: the structured TrainingSession must become durable
    /// immediately, never waiting on (or requiring) a supporting-evidence
    /// screenshot's interpretation — even when one is attached. `commit`
    /// must not touch the evidence-intake pipeline at all.
    func testProductionTrainingCommitNeverWaitsOnAttachedSupportingEvidence() async throws {
        let result = #"{"status":"confirmation_requested","reviewId":"review-training","reviewRevision":2,"sessionId":"native-session-media","intendedDate":"2026-09-11","exerciseIds":["barbell_bench_press"]}"#
        let response = #"{"outcome":"committed","receipt":{"status":"committed","result":"# + result + #", "operationId":null,"commandId":"01911111-1111-7111-8111-111111111111"},"confirmation":{"state":"confirmed","reviewId":"review-training","continuationKey":null,"completedStep":"complete","publication":null}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, response),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let attachments = MemoryTrainingLoggerAttachmentStore()
        let reference = try attachments.save(data: Data([1, 2, 3]), draftId: "native-session-media", assetId: "asset-1", displayName: "Workout.png")
        let defaults = Self.freshDefaults()
        let writeAPI = ProductionTrainingWriteAPI(
            api: native,
            reviewAPI: ProductionEvidenceReviewAPI(api: native),
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults),
            attachmentStore: attachments,
            bindingStore: TrainingEvidenceBindingStore(defaults: defaults)
        )
        let draft = TrainingLoggerDraft(
            id: "native-session-media", mode: .live, workoutDate: "2026-09-11", selectedAreaIds: ["chest"],
            exercises: [TrainingLoggerDraftExercise(
                id: "occurrence-1", canonicalExerciseId: "barbell_bench_press", name: "Barbell Bench Press",
                areaId: "chest", measurement: .repsLoad, executionVariant: nil,
                sets: [TrainingLoggerDraftSet(id: "set-1", setNumber: 1, reps: 8, load: 185, durationSeconds: nil, isCompleted: true)],
                previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil,
                isProvisional: false, provenance: nil
            )], relationships: [], step: .review, exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil,
            supportingEvidence: [TrainingLoggerSupportingEvidence(id: "asset-1", displayName: "Workout.png", source: .photos, storageReference: reference, contentType: "image/png")],
            supportingWorkouts: nil, supportingWorkoutFailureAssetIds: nil
        )

        let committed = try await writeAPI.commit(draft)

        XCTAssertEqual(committed.exerciseIds, ["barbell_bench_press"])
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, ["/api/v1/native/auth/pair", "/api/v1/native/commands"],
            "commit must never touch the evidence-intake pipeline, with or without an attachment.")
        let command = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests.last?.httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(command["payload"] as? [String: Any])
        XCTAssertNil(payload["supportingEvidenceReviewId"])
        XCTAssertNil(payload["supportingEvidenceReviewVersion"])
        // The screenshot bytes are deliberately still on disk after commit —
        // `reconcileSupportingEvidenceAfterCommit` (a separate, later step)
        // owns reading and then deleting them.
        XCTAssertEqual(try attachments.load(reference: reference), Data([1, 2, 3]))
    }

    /// The later, best-effort step that reconciles an attached screenshot
    /// onto the already-durable session: interprets it, then confirms its
    /// evidence review through the exact same `evidence-review.commit.v1`
    /// path every other evidence type uses. The intake carries the exact
    /// Logger target; date alone is never reconciliation authority. Cleans
    /// up the attachment file only after intake has accepted the bytes.
    func testReconcileSupportingEvidenceAfterCommitConfirmsScreenshotReview() async throws {
        let review = productionEnvelope(resource: "evidence-review", data: #"{"review":{"id":"review-training","status":"pending","createdAt":"2026-09-11T12:00:00.000Z","version":1,"interpretedEvidence":{"evidence_objects":[{"id":"training-object","evidence_type":"training","observed_at":"2026-09-11"}]}}}"#)
        let confirmResponse = #"{"outcome":"committed","receipt":{"status":"committed","result":null,"operationId":null,"commandId":"01911111-1111-7111-8111-111111111112"},"confirmation":{"state":"confirmed","reviewId":"review-training","continuationKey":null,"completedStep":"complete","publication":null}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(202, #"{"intakeId":"intake-training","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/api/v1/native/evidence/intakes/intake-training"}"#),
            .json(200, #"{"intakeId":"intake-training","status":"ready","reviewId":"review-training","reviewUrl":"/review","processingUrl":"/status"}"#),
            .json(200, review), .json(200, review.replacingOccurrences(of: "\"version\":1", with: "\"version\":2")), .json(200, confirmResponse),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let attachments = MemoryTrainingLoggerAttachmentStore()
        let reference = try attachments.save(data: Data([1, 2, 3]), draftId: "native-session-media", assetId: "asset-1", displayName: "Workout.png")
        let defaults = Self.freshDefaults()
        let writeAPI = ProductionTrainingWriteAPI(
            api: native,
            reviewAPI: ProductionEvidenceReviewAPI(api: native),
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults),
            attachmentStore: attachments,
            bindingStore: TrainingEvidenceBindingStore(defaults: defaults)
        )
        let draft = TrainingLoggerDraft(
            id: "native-session-media", mode: .live, workoutDate: "2026-09-11", selectedAreaIds: ["chest"],
            exercises: [], relationships: [], step: .complete, exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil,
            supportingEvidence: [TrainingLoggerSupportingEvidence(id: "asset-1", displayName: "Workout.png", source: .photos, storageReference: reference, contentType: "image/png")],
            supportingWorkouts: nil, supportingWorkoutFailureAssetIds: nil
        )

        await writeAPI.reconcileSupportingEvidenceAfterCommit(for: draft)

        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/auth/pair", "/api/v1/native/evidence/intakes",
            "/api/v1/native/evidence/intakes/intake-training", "/api/v1/native/read/evidence-review",
            "/api/v1/native/read/evidence-review",
            "/api/v1/native/commands",
        ], "Review concurrency is re-read before the supporting screenshot confirmation.")
        let intakeBody = try XCTUnwrap(String(data: try XCTUnwrap(requests[1].httpBody), encoding: .utf8))
        XCTAssertTrue(intakeBody.contains("name=\"targetTrainingDraftId\""))
        XCTAssertTrue(intakeBody.contains("native-session-media"))
        XCTAssertTrue(intakeBody.contains("name=\"targetTrainingSessionCanonicalId\""))
        XCTAssertTrue(intakeBody.contains("training|authoritative|training_logger_draft_native-session-media"))
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "If-Match"), "\"2\"")
        let command = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests.last?.httpBody)) as? [String: Any])
        XCTAssertEqual(command["commandType"] as? String, ProductionCommandType.commitEvidenceReview)
        XCTAssertEqual(command["payload"] as? [String: String], [
            "reviewId": "review-training",
            "targetTrainingSessionCanonicalId": "training|authoritative|training_logger_draft_native-session-media",
        ])
        XCTAssertThrowsError(try attachments.load(reference: reference), "the screenshot file is cleaned up once reconciliation finishes.")
    }

    func testSupportingEvidenceIntakeFailureRetainsExactDraftAttachmentForRecovery() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .failure(URLError(.networkConnectionLost)),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let attachments = MemoryTrainingLoggerAttachmentStore()
        let reference = try attachments.save(
            data: Data([1, 2, 3]), draftId: "native-session-recoverable", assetId: "asset-1", displayName: "Workout.png"
        )
        let defaults = Self.freshDefaults()
        let writeAPI = ProductionTrainingWriteAPI(
            api: native,
            reviewAPI: ProductionEvidenceReviewAPI(api: native),
            idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults),
            attachmentStore: attachments,
            bindingStore: TrainingEvidenceBindingStore(defaults: defaults)
        )
        let draft = TrainingLoggerDraft(
            id: "native-session-recoverable", mode: .live, workoutDate: "2026-09-16", selectedAreaIds: ["chest"],
            exercises: [], relationships: [], step: .complete, exercisePickerReturnStep: nil,
            exercisePickerExistingExerciseIds: nil,
            supportingEvidence: [TrainingLoggerSupportingEvidence(
                id: "asset-1", displayName: "Workout.png", source: .photos,
                storageReference: reference, contentType: "image/png"
            )],
            supportingWorkouts: nil, supportingWorkoutFailureAssetIds: nil
        )

        await writeAPI.reconcileSupportingEvidenceAfterCommit(for: draft)

        XCTAssertEqual(try attachments.load(reference: reference), Data([1, 2, 3]),
                       "pre-acceptance transport ambiguity must retain the exact draft's private evidence bytes.")
        let requestPaths = await transport.requests.map { $0.url?.path }
        XCTAssertEqual(requestPaths, [
            "/api/v1/native/auth/pair", "/api/v1/native/evidence/intakes",
        ])
    }

    func testProductionTrainingCommitCreatesFounderNamedExerciseWithSelectedArea() async throws {
        let result = #"{"status":"confirmation_requested","reviewId":"review-new-exercise","reviewRevision":1,"sessionId":"session","intendedDate":"2026-09-10","exerciseIds":["canonical-created-server-side"]}"#
        let response = #"{"outcome":"committed","receipt":{"status":"committed","result":"# + result + #","operationId":null,"commandId":"01911111-1111-7111-8111-111111111111"},"confirmation":{"state":"confirmed","reviewId":"review-new-exercise","continuationKey":null,"completedStep":"complete","publication":null}}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, response),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionTrainingWriteAPI(api: api, reviewAPI: NotAvailableEvidenceReviewAPI(), idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let draft = TrainingLoggerDraft(
            id: "session", mode: .past, workoutDate: "2026-09-10", selectedAreaIds: ["chest"],
            exercises: [TrainingLoggerDraftExercise(
                id: "occurrence", canonicalExerciseId: nil, name: "Fixture-only exercise", areaId: "chest",
                measurement: .repsLoad, executionVariant: nil,
                sets: [TrainingLoggerDraftSet(id: "set", setNumber: 1, reps: 8, load: 100, durationSeconds: nil, isCompleted: true)],
                previousPerformance: nil, progressionRecommendation: nil, progressionChoice: nil, isProvisional: true, provenance: nil
            )], relationships: [], step: .review, exercisePickerReturnStep: nil, exercisePickerExistingExerciseIds: nil,
            supportingEvidence: nil, supportingWorkouts: nil, supportingWorkoutFailureAssetIds: nil
        )

        _ = try await writeAPI.commit(draft)
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
        let command = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests.last?.httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(command["payload"] as? [String: Any])
        let exercises = try XCTUnwrap(payload["exercises"] as? [[String: Any]])
        XCTAssertNil(exercises[0]["canonicalExerciseId"])
        let provisional = try XCTUnwrap(exercises[0]["provisionalExercise"] as? [String: Any])
        XCTAssertEqual(provisional["name"] as? String, "Fixture-only exercise")
        XCTAssertEqual(provisional["primaryMuscleGroupId"] as? String, "chest")
    }

    func testProductionTrainingSessionDecodesOnlyOpaqueSupportingMedia() async throws {
        let data = #"{"id":"session-1","label":"Strength","value":"45 min","detail":"3 exercises","date":"2026-09-11","sourceEvidence":[],"exercises":[],"exerciseRelationshipGroups":[],"supportingMedia":[{"media":{"mediaId":"01999999-9999-4999-8999-999999999999","deliveryPath":"/api/v1/native/media/01999999-9999-4999-8999-999999999999"}}]}"#
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["training-session": productionEnvelope(resource: "training-session", data: data)]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        let fetched = try await ProductionTrainingAPI(api: native).fetchTrainingSession(sessionId: "session-1")
        let session = try XCTUnwrap(fetched)

        XCTAssertEqual(session.supportingMedia?.first?.media.mediaId, "01999999-9999-4999-8999-999999999999")
        let encoded = try JSONEncoder().encode(session)
        let text = try XCTUnwrap(String(data: encoded, encoding: .utf8))
        XCTAssertFalse(text.contains("media://"))
        XCTAssertFalse(text.localizedCaseInsensitiveContains("spaces"))
    }

    func testProductionNutritionWriteUsesFullDayReplacementAndPersistsReturnedFingerprint() async throws {
        let result = #"{"status":"source_committed_work_enqueued","canonicalId":"nutrition|2026-09-11|nutrition-day","revision":1,"recordVersion":1,"semanticFingerprint":"sha256_first","intendedDate":"2026-09-11","goalId":"goal-1","phaseId":"phase-1","continuationWorkItemIds":[],"lowerLevelWorkItemIds":[]}"#
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), .json(200, productionCommandOutcomeJSON(result: result))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let defaults = Self.freshDefaults()
        let revisions = ProductionDailyEvidenceRevisionStore(defaults: defaults)
        let writeAPI = ProductionDailyEvidenceWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults), revisionStore: revisions)

        let output = try await writeAPI.upsertNutrition(
            NutritionDayWrite(localDate: "2026-09-11", calories: 2400, proteinG: 190, carbsG: nil, fatG: nil, fiberG: nil),
            existingDayPresent: false
        )

        XCTAssertEqual(output.semanticFingerprint, "sha256_first")
        XCTAssertEqual(revisions.fingerprint(domain: "nutrition", date: "2026-09-11"), "sha256_first")
        let requests = await transport.requests
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        let totals = try XCTUnwrap(payload["dailyTotals"] as? [String: Any])
        XCTAssertEqual(totals["protein_g"] as? Double, 190)
        XCTAssertEqual((payload["source"] as? [String: String])?["modality"], "typed")
    }

    func testProductionTypedDailyCorrectionWithoutCanonicalFingerprintFailsClosed() async throws {
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r"))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let defaults = Self.freshDefaults()
        let writeAPI = ProductionDailyEvidenceWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults), revisionStore: ProductionDailyEvidenceRevisionStore(defaults: defaults))

        await XCTAssertThrowsErrorAsync(try await writeAPI.upsertActivity(
            ActivityDayWrite(localDate: "2026-09-11", activeCalories: 700, totalCalories: nil, exerciseMinutes: nil, standHours: nil, moveGoal: nil),
            existingDayPresent: true
        )) { error in
            XCTAssertEqual(error as? DailyEvidenceWriteError, .missingCorrectionFingerprint(domain: "Activity", date: "2026-09-11"))
        }
        let requestCount = await transport.requests.count
        XCTAssertEqual(requestCount, 1)
    }

    func testProductionActivityWriteDeclaresManualSourceAndNeverHealthKit() async throws {
        let result = #"{"status":"changed","canonicalId":"activity_day|2026-09-11","revision":1,"recordVersion":1,"semanticFingerprint":"sha256_activity","intendedDate":"2026-09-11","goalId":"goal-1","phaseId":"phase-1","continuationWorkItemIds":[],"lowerLevelWorkItemIds":[]}"#
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), .json(200, productionCommandOutcomeJSON(result: result))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let defaults = Self.freshDefaults()
        let writeAPI = ProductionDailyEvidenceWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults), revisionStore: ProductionDailyEvidenceRevisionStore(defaults: defaults))

        _ = try await writeAPI.upsertActivity(
            ActivityDayWrite(localDate: "2026-09-11", activeCalories: 700, totalCalories: 2800, exerciseMinutes: 45, standHours: 12, moveGoal: 650),
            existingDayPresent: false
        )

        let requests = await transport.requests
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        XCTAssertEqual((payload["source"] as? [String: String])?["modality"], "manual")
        XCTAssertFalse(String(data: try XCTUnwrap(requests[1].httpBody), encoding: .utf8)?.localizedCaseInsensitiveContains("healthkit") == true)
    }

    func testProductionDEXAEditSendsFullReplacementAndStableRetryIdentity() async throws {
        let result = #"{"status":"updated","reviewId":"review-1","revision":3,"updatedAt":"2026-09-11T12:00:00.000Z"}"#
        let response = productionCommandOutcomeJSON(result: result)
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), .json(200, response), .json(200, response)])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let writeAPI = ProductionDEXAWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let measurements = DEXAScanMeasurements(
            measuredAt: "2026-09-11", totalMassLb: 170, bodyFatPercentage: 14,
            fatMassLb: 23.8, leanMassLb: 140, boneMineralContentLb: 6.2,
            restingMetabolicRateKcal: nil, visceralAdiposeTissueMassLb: nil,
            visceralAdiposeTissueVolumeIn3: nil
        )

        _ = try await writeAPI.editMeasurements(reviewId: "review-1", evidenceObjectId: "dexa-1", expectedVersion: "2", measurements: measurements)
        _ = try await writeAPI.editMeasurements(reviewId: "review-1", evidenceObjectId: "dexa-1", expectedVersion: "2", measurements: measurements)

        let requests = await transport.requests
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"2\"")
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"), requests[2].value(forHTTPHeaderField: "Idempotency-Key"))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(json["payload"] as? [String: Any])
        let sent = try XCTUnwrap(payload["measurements"] as? [String: Any])
        XCTAssertEqual(Set(sent.keys), Set(["measuredAt", "totalMass", "bodyFatPercentage", "fatMass", "leanMass", "boneMineralContent", "restingMetabolicRate", "vatMass", "vatVolume"]))
        XCTAssertTrue(sent["restingMetabolicRate"] is NSNull)
    }

    func testReadyUploadResponseOpensReviewWithoutAnotherRead() async throws {
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r"))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test device")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let intake = ProductionEvidenceIntakeStatus(intakeId: "intake", status: "ready", reviewId: "review", reviewUrl: nil, processingUrl: nil)
        let reviewId = try await pipeline.readyReview(for: intake)
        XCTAssertEqual(reviewId, "review")
        let count = await transport.requests.count
        XCTAssertEqual(count, 1, "A published upload result needs no redundant GET")
    }

    func testUnpublishedReviewIdentityDoesNotCountAsReviewReady() async throws {
        let processing = #"{"intakeId":"intake","status":"processing","reviewId":"review","reviewUrl":null,"processingUrl":null}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, processing),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test device")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let intake = ProductionEvidenceIntakeStatus(intakeId: "intake", status: "processing", reviewId: "review", reviewUrl: nil, processingUrl: nil)
        await XCTAssertThrowsErrorAsync(try await pipeline.readyReview(for: intake, pollInterval: .zero, maxPolls: 0)) { error in
            XCTAssertEqual(error as? ProductionEvidenceIntakePipeline.Error, .stillProcessing)
        }
    }

    func testProcessingIntakeFollowsPublicationWithoutResubmitting() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"intakeId":"intake","status":"processing","reviewId":null}"#),
            .json(200, #"{"intakeId":"intake","status":"ready","reviewId":"review"}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test device")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let intake = ProductionEvidenceIntakeStatus(intakeId: "intake", status: "processing", reviewId: nil, reviewUrl: nil, processingUrl: nil)
        let reviewId = try await pipeline.readyReview(for: intake, pollInterval: .zero, maxPolls: 1)
        XCTAssertEqual(reviewId, "review")
        let requests = await transport.requests
        XCTAssertEqual(requests.dropFirst().map(\.httpMethod), ["GET", "GET"])
    }

    func testRunningAppReviewReadyObservationSurvivesOneAmbiguousStatusRead() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .failure(URLError(.networkConnectionLost)),
            .json(200, #"{"intakeId":"intake","status":"ready","reviewId":"review"}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test device")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        let reviewId = try await pipeline.awaitReadyIntakeResilient(
            intakeId: "intake", pollInterval: .zero, maxPolls: 2
        )

        XCTAssertEqual(reviewId, "review")
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
    }

    func testFailedIntakeDoesNotPromiseReviewReadyOrSubmitAgain() async throws {
        let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r"))])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test device")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let intake = ProductionEvidenceIntakeStatus(intakeId: "intake", status: "processing_failed", reviewId: nil, reviewUrl: nil, processingUrl: nil)
        await XCTAssertThrowsErrorAsync(try await pipeline.readyReview(for: intake)) { error in
            XCTAssertEqual(error as? ProductionEvidenceIntakePipeline.Error, .interpretationFailed)
        }
        let count = await transport.requests.count
        XCTAssertEqual(count, 1)
    }

    func testProductionEvidenceIntakeContentFingerprintDistinguishesEqualLengthFiles() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(202, #"{"intakeId":"intake-1","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/one"}"#),
            .json(202, #"{"intakeId":"intake-2","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/two"}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        _ = try await pipeline.submitIntake(scope: "nutrition-intake.2026-09-11", effectiveDate: "2026-09-11", expectedEvidenceType: "nutrition", files: [("one.png", "image/png", Data([1, 2, 3]))])
        _ = try await pipeline.submitIntake(scope: "nutrition-intake.2026-09-11", effectiveDate: "2026-09-11", expectedEvidenceType: "nutrition", files: [("one.png", "image/png", Data([3, 2, 1]))])

        let requests = await transport.requests
        XCTAssertNotEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"), requests[2].value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"), multipartField(named: "submissionIdentity", from: try XCTUnwrap(requests[1].httpBody)))
    }

    func testExplicitActivityIntakeCarriesBoundedLocalOCRWithoutReplacingTheImage() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(202, #"{"intakeId":"activity-fast","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/activity-fast"}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let extraction = "Move\n948/700 CAL\nExercise\n67/30 MIN\nStand\n13/12 HRS"

        _ = try await pipeline.submitIntake(
            scope: "activity-intake.2026-09-15", effectiveDate: "2026-09-15",
            expectedEvidenceType: "activity_day", clientExtractedText: extraction,
            files: [("activity.png", "image/png", Data([1, 2, 3]))]
        )

        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        let body = try XCTUnwrap(request.httpBody)
        XCTAssertEqual(multipartField(named: "clientExtractedText", from: body), extraction)
        XCTAssertTrue(String(decoding: body, as: UTF8.self).contains("filename=\"activity.png\""))
    }

    func testDismissedActivityReplacementRotatesIdentityOnceAndPreservesPredecessorLineage() async throws {
        let accepted = #"{"intakeId":"replacement-intake","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/replacement"}"#
        let replayed = #"{"intakeId":"replacement-intake","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/replacement"}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(409, productionProblemJSON(status: 409, code: "EVIDENCE_INTAKE_REPLACEMENT_REQUIRED")),
            .json(202, accepted),
            .json(202, replayed),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let defaults = Self.freshDefaults()
        let pipeline = ProductionEvidenceIntakePipeline(
            api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults)
        )
        let file = ("activity.png", "image/png", Data([8, 4, 1]))

        _ = try await pipeline.submitIntake(
            scope: "activity-intake.2026-09-16", effectiveDate: "2026-09-16",
            expectedEvidenceType: "activity_day", clientExtractedText: "Move\n841 cal\nExercise\n111 min",
            files: [file]
        )
        // Recreate the pipeline/store to model a process relaunch after the
        // replacement receipt was accepted. The exact replacement key and
        // predecessor lineage must both survive.
        let relaunched = ProductionEvidenceIntakePipeline(
            api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults)
        )
        _ = try await relaunched.submitIntake(
            scope: "activity-intake.2026-09-16", effectiveDate: "2026-09-16",
            expectedEvidenceType: "activity_day", clientExtractedText: "Move\n841 cal\nExercise\n111 min",
            files: [file]
        )

        let requests = await transport.requests
        let predecessor = try XCTUnwrap(requests[1].value(forHTTPHeaderField: "Idempotency-Key"))
        let replacement = try XCTUnwrap(requests[2].value(forHTTPHeaderField: "Idempotency-Key"))
        XCTAssertNotEqual(predecessor, replacement)
        XCTAssertEqual(multipartField(named: "submissionIdentity", from: try XCTUnwrap(requests[2].httpBody)), replacement)
        XCTAssertEqual(multipartField(named: "replacementForSubmissionIdentity", from: try XCTUnwrap(requests[2].httpBody)), predecessor)
        XCTAssertEqual(requests[3].value(forHTTPHeaderField: "Idempotency-Key"), replacement)
        XCTAssertEqual(multipartField(named: "replacementForSubmissionIdentity", from: try XCTUnwrap(requests[3].httpBody)), predecessor)
    }

    func testEvidenceConfirmationDecodesCanonicalDurabilityBoundary() throws {
        let value = try JSONDecoder().decode(
            ProductionEvidenceReviewConfirmation.self,
            from: Data(#"{"state":"processing","accepted":true,"reviewId":"review-activity","completedStep":"canonical_commit","canonicalStateDurable":true}"#.utf8)
        )
        XCTAssertEqual(value.state, "processing")
        XCTAssertEqual(value.canonicalStateDurable, true)
    }

    func testProductionEvidenceIntakeReportsTransferCompletionAtDurableAcceptance() async throws {
        actor Recorder {
            private(set) var values: [Double] = []
            func append(_ value: Double) { values.append(value) }
        }
        let recorder = Recorder()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(202, #"{"intakeId":"intake-progress","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/progress"}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        _ = try await pipeline.submitIntake(
            scope: "nutrition-intake.progress", effectiveDate: "2026-09-12", expectedEvidenceType: "nutrition",
            files: [("nutrition.png", "image/png", Data([1, 2, 3]))],
            onUploadProgress: { value in Task { await recorder.append(value) } }
        )

        try await Task.sleep(for: .milliseconds(20))
        let values = await recorder.values
        XCTAssertEqual(values.last, 1)
    }

    func testProductionEvidenceIntakeGuardAcceptsEnabledActivityDEXATrainingAndProgressPhotosTypes() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(202, #"{"intakeId":"activity-intake","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/activity"}"#),
            .json(202, #"{"intakeId":"dexa-intake","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/dexa"}"#),
            .json(202, #"{"intakeId":"training-intake","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/training"}"#),
            .json(202, #"{"intakeId":"photo-intake","status":"processing","reviewId":null,"reviewUrl":null,"processingUrl":"/photos"}"#),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        _ = try await pipeline.submitIntake(
            scope: "activity-intake.2026-09-11", effectiveDate: "2026-09-11", expectedEvidenceType: "activity_day",
            files: [("activity.png", "image/png", Data([1, 2, 3]))]
        )
        _ = try await pipeline.submitIntake(
            scope: "training-intake.session-1", effectiveDate: "2026-09-11", expectedEvidenceType: "training",
            files: [("workout.png", "image/png", Data([1, 2, 3]))]
        )
        _ = try await pipeline.submitIntake(
            scope: "dexa-intake.2026-09-11", effectiveDate: "2026-09-11", expectedEvidenceType: "dexa_scan",
            files: [("scan.pdf", "application/pdf", Data([0x25, 0x50, 0x44, 0x46]))]
        )
        let identities = #"[{"orientation":"front","contractionState":"relaxed","poseVariant":"standard","identityStatus":"confirmed","userConfirmedIdentity":true,"goalValidationRole":"primary","tags":[]}]"#
        _ = try await pipeline.submitIntake(
            scope: "photo-intake.2026-09-11", effectiveDate: "2026-09-11", expectedEvidenceType: "photo_session",
            photoIdentitiesJSON: identities, photoSessionTimeOfDay: "morning",
            photoSessionFasted: true, photoSessionPostWorkout: false, photoSessionPump: false,
            originalUnedited: true,
            // UTF-8 test bytes keep the multipart fixture inspectable; the
            // production picker supplies real image bytes and the Server
            // performs its independent signature validation.
            files: [("progress-photo.jpg", "image/jpeg", Data("photo-fixture".utf8))]
        )
        await XCTAssertThrowsErrorAsync(try await pipeline.submitIntake(
            scope: "unsupported-intake.2026-09-11", effectiveDate: "2026-09-11", expectedEvidenceType: "lab_panel",
            files: [("lab.png", "image/png", Data([1]))]
        )) { error in
            XCTAssertEqual(error as? NativeWriteGuardError, .productionReadOnly(.evidenceReview))
        }
        let requestCount = await transport.requests.count
        XCTAssertEqual(requestCount, 5)
        let requests = await transport.requests
        let photoBody = try XCTUnwrap(requests[4].httpBody)
        XCTAssertEqual(multipartField(named: "expectedEvidenceType", from: photoBody), "photo_session")
        XCTAssertEqual(multipartField(named: "photoIdentitiesJson", from: photoBody), identities)
        XCTAssertEqual(multipartField(named: "photoSessionTimeOfDay", from: photoBody), "morning")
        XCTAssertEqual(multipartField(named: "originalUnedited", from: photoBody), "true")
    }

    func testProductionEvidenceReviewDismissUsesVersionAndStableIdempotency() async throws {
        let result = #"{"status":"discarded","reviewId":"review-1","revision":2,"updatedAt":"2026-09-11T12:00:00.000Z"}"#
        let response = productionCommandOutcomeJSON(result: result)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, response), .json(200, response),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        // Disposition remains independently versioned and replay-safe.
        try await pipeline.dismissReview(domain: .evidenceReview, reviewId: "review-1", expectedVersion: "1")
        try await pipeline.dismissReview(domain: .evidenceReview, reviewId: "review-1", expectedVersion: "1")

        let requests = await transport.requests
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"1\"")
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Idempotency-Key"), requests[2].value(forHTTPHeaderField: "Idempotency-Key"))
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        XCTAssertEqual(json["commandType"] as? String, "evidence-review.dispose.v1")
        XCTAssertEqual((json["payload"] as? [String: String])?["disposition"], "discarded")
        let affected = await native.resourcesAffected(by: ProductionCommandType.disposeEvidenceReview)
        XCTAssertTrue(affected.contains("evidence-review"))
        XCTAssertTrue(affected.contains("evidence-review-queue"))
    }

    /// The Server refuses a photo review that cannot proceed with a 400 BEFORE it
    /// records a confirmation receipt. Native must treat that as a failure (never
    /// "Confirmation accepted"), and once the review is corrected the same
    /// Idempotency-Key retries cleanly because the refusal recorded nothing.
    func testPhotoReviewReadinessRefusalIsAFailureAndTheSameKeyRetriesAfterCorrection() async throws {
        let refusal = #"{"problemVersion":"1","type":"https://physiqueos.app/problems/photo-pose-unresolved","title":"This Evidence Review needs a correction before it can be confirmed.","status":400,"code":"PHOTO_POSE_UNRESOLVED","detail":"Choose a pose for the remaining photo before saving.","instance":"/api/v1/native/commands","requestId":"request-1","fieldErrors":[],"recovery":null}"#
        let accepted = productionCommandOutcomeJSON(result: #"{"status":"confirmation_requested","reviewId":"review-photo","revision":1}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(400, refusal), .json(200, accepted),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        do {
            _ = try await pipeline.commitReview(domain: .progressPhotos, reviewId: "review-photo", expectedVersion: "1")
            XCTFail("a Server readiness refusal must not look like an accepted confirmation")
        } catch let error as ProductionNativeError {
            guard case .validation(let problem) = error else { return XCTFail("expected a validation failure, got \(error)") }
            XCTAssertEqual(problem.code, "PHOTO_POSE_UNRESOLVED")
            XCTAssertFalse(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error))
            let copy = EvidenceReviewDetailView.errorMessage(for: error)
            XCTAssertTrue(copy.contains("can't be confirmed yet"))
            XCTAssertFalse(copy.lowercased().contains("accepted"))
        }

        // After correction, the successful path is unchanged and reuses the stable key.
        _ = try await pipeline.commitReview(domain: .progressPhotos, reviewId: "review-photo", expectedVersion: "1")
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3, "pair, the refused confirmation, and the corrected retry")
        let keys = requests.dropFirst().compactMap { $0.value(forHTTPHeaderField: "Idempotency-Key") }
        XCTAssertEqual(keys.count, 2)
        XCTAssertEqual(Set(keys).count, 1, "the retry after a recorded-nothing refusal keeps the same idempotency identity")
    }

    /// A resolved scheduled session shows its Goal; only a genuinely unresolved
    /// one says it needs review, and no raw wire enum ever reaches the screen.
    func testProductionReviewShowsTheResolvedGoalAndNeverARawEnum() async throws {
        func reviewJSON(goal: String) -> String {
            productionEnvelope(resource: "evidence-review", data: """
            {"review":{"id":"review-photo","status":"pending","version":1,"createdAt":"2026-09-20T13:50:00.000Z","interpreted_evidence":{"evidence_objects":[
              {"id":"session-1","evidence_type":"photo_session","capture_metadata":{"time_of_day":"afternoon"},"goal_relationship":\(goal),"photos":[{"id":"p1","pose_id":"front-relaxed","label":"Front Relaxed"}]}
            ]}},"presentation":{"summary":{"text":"1 evidence item detected"},"items":[]}}
            """)
        }
        for (goal, expected) in [
            (#"{"status":"resolved","goal_label":"Build Lean Mass"}"#, "Build Lean Mass"),
            (#"{"status":"resolved","goal_label":null}"#, "Linked goal"),
            (#"{"status":"needs_review","goal_label":null}"#, "Needs session review"),
            (#"{"status":"unrelated","goal_label":null}"#, "No goal linked"),
        ] {
            let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: ["evidence-review": reviewJSON(goal: goal)])
            let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
            _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
            let review = try await ProductionEvidenceReviewAPI(api: native).fetchReview(reviewId: "review-photo")
            let text = try XCTUnwrap(review?.items.first?.photoSession?.goalRelationship)
            XCTAssertEqual(text, expected)
            XCTAssertFalse(text.contains("needs_review") || text.contains("resolved"), text)
            XCTAssertEqual(review?.items.first?.photoSession?.timeOfDay, "afternoon")
        }
    }

    func testTrainingSupportingReviewConfirmationCarriesExactCanonicalSessionTarget() async throws {
        let response = productionCommandOutcomeJSON(result: #"{"status":"confirmation_requested","reviewId":"review-training","revision":2}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, response),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: native, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))
        let target = "training|authoritative|training_logger_draft_exact-draft"

        _ = try await pipeline.commitReview(
            domain: .workoutLogger,
            reviewId: "review-training",
            expectedVersion: "1",
            targetTrainingSessionCanonicalId: target
        )

        let requests = await transport.requests
        let json = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])
        let payload = try XCTUnwrap(json["payload"] as? [String: String])
        XCTAssertEqual(payload["reviewId"], "review-training")
        XCTAssertEqual(payload["targetTrainingSessionCanonicalId"], target)
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "If-Match"), "\"1\"")
    }

    func testProductionReviewReadDoesNotReuseCachedConcurrencyOrLifecycleState() async throws {
        let pending = productionEnvelope(resource: "evidence-review", data: #"{"review":{"id":"review-1","status":"pending","version":1,"createdAt":"2026-09-15T19:00:00.000Z"}}"#)
        let discarded = productionEnvelope(resource: "evidence-review", data: #"{"review":{"id":"review-1","status":"discarded","version":2,"createdAt":"2026-09-15T19:00:00.000Z"}}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, pending), .json(200, discarded),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Review test")
        let api = ProductionEvidenceReviewAPI(api: native)
        let first = try await api.fetchReview(reviewId: "review-1")
        let second = try await api.fetchReview(reviewId: "review-1")
        XCTAssertEqual(first?.status, "pending")
        XCTAssertEqual(second?.status, "discarded")
        XCTAssertEqual(second?.version, 2)
    }

    /// Build 21's central async-intake correction (item 6): a real Build 20
    /// defect was reporting "PhysiqueOS could not be reached" after a
    /// canonical write had actually succeeded, because Native conflated
    /// "the commit command itself failed" with "confirmation is still
    /// being polled." `awaitConfirmation` must throw `.timedOut` — never
    /// `.commitFailed` — when the review simply hasn't reached a terminal
    /// state within the polling budget, and must throw `.commitFailed`
    /// immediately, without exhausting the polling budget, when the server
    /// reports the review's commit itself failed.
    func testAwaitConfirmationDistinguishesStillProcessingFromGenuineCommitFailure() async throws {
        actor StuckReviewAPI: EvidenceReviewAPI {
            let status: String
            private(set) var fetchCount = 0
            init(status: String) { self.status = status }
            func fetchReview(reviewId: String) async throws -> EvidenceReviewDetailReadModel? {
                fetchCount += 1
                return EvidenceReviewDetailReadModel(id: reviewId, status: status, createdAt: nil, version: 1, items: [])
            }
        }
        let transport = RoutedFounderTransport(pairing: sessionJSON(access: "a", refresh: "r"), byResource: [:])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: Self.freshDefaults()))

        let stillProcessing = StuckReviewAPI(status: "pending")
        await XCTAssertThrowsErrorAsync(try await pipeline.awaitConfirmation(reviewAPI: stillProcessing, reviewId: "review-1", pollInterval: .zero, maxPolls: 2)) { error in
            XCTAssertEqual(error as? ProductionEvidenceIntakePipeline.Error, .timedOut)
        }

        let genuinelyFailed = StuckReviewAPI(status: "commit_failed")
        await XCTAssertThrowsErrorAsync(try await pipeline.awaitConfirmation(reviewAPI: genuinelyFailed, reviewId: "review-1", pollInterval: .zero, maxPolls: 30)) { error in
            XCTAssertEqual(error as? ProductionEvidenceIntakePipeline.Error, .commitFailed)
        }
        // The genuine failure must be reported on the very first read, not
        // after exhausting the entire polling budget.
        let failedFetchCount = await genuinelyFailed.fetchCount
        XCTAssertEqual(failedFetchCount, 1)
    }

    func testEvidenceMutationErrorsDistinguishUnknownAcceptanceFromKnownRejection() {
        XCTAssertTrue(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: ProductionNativeError.networkFailure))
        XCTAssertTrue(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: ProductionNativeError.invalidResponse))
        XCTAssertTrue(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: ProductionNativeError.temporaryServer(nil)))
        XCTAssertFalse(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: ProductionNativeError.notPaired))
        XCTAssertFalse(ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: TrainingWriteError.noCompletedSets))
    }

    @MainActor
    func testAppEnvironmentWeightWriteAPISwitchesWithAuthorityAndSandboxIsHonestlyUnavailable() async {
        let suite = "PhysiqueOS.WeightWriteAPIAuthoritySwitch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsNativeAuthoritySelectionStore(defaults: defaults, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .sandbox, authoritySelectionStore: store)

        XCTAssertTrue(environment.weightWriteAPI is NotAvailableWeightWriteAPI)
        do {
            _ = try await environment.weightWriteAPI.submitWeight(localDate: "2026-09-11", value: 168, expectedVersion: nil)
            XCTFail("Expected NotAvailable to be thrown under Sandbox")
        } catch is NotAvailableWeightWriteAPI.NotAvailable {
            // expected
        } catch {
            XCTFail("Expected NotAvailable, got \(error)")
        }

        environment.selectNativeAuthority(.founderProduction)
        XCTAssertTrue(environment.weightWriteAPI is ProductionWeightWriteAPI)
    }

    private static func freshDefaults() -> UserDefaults {
        let suite = "PhysiqueOS.IdempotencyStoreTests.\(UUID().uuidString)"
        return UserDefaults(suiteName: suite)!
    }

    private func isUUIDv7(_ value: String) -> Bool {
        guard let uuid = UUID(uuidString: value) else { return false }
        let bytes = withUnsafeBytes(of: uuid.uuid) { Array($0) }
        return (bytes[6] & 0xF0) == 0x70 && (bytes[8] & 0xC0) == 0x80
    }

    func testProductionFailuresNeverExposeCredentialMaterialInDescriptions() async throws {
        let access = String(repeating: "a", count: 43)
        let refresh = String(repeating: "r", count: 43)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, "not-json"),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")

        await XCTAssertThrowsErrorAsync(try await api.readWeight()) { error in
            let description = String(describing: error) + ((error as? LocalizedError)?.errorDescription ?? "")
            XCTAssertFalse(description.contains(access))
            XCTAssertFalse(description.contains(refresh))
        }
    }

    func testPairStoresOnlyRotatingRefreshAndUsesAccessTokenForTypedWeightRead() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        let session = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let result = try await api.readCurrentWeight()

        XCTAssertEqual(session.accessToken, String(repeating: "a", count: 43))
        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "r", count: 43))
        XCTAssertEqual(result.summary.currentWeight?.measurementDate, "2026-08-31")
        XCTAssertEqual(result.summary.currentWeight?.value, 168.4)
        let requests = await transport.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[1].value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testStoredRefreshCredentialRotatesBeforeFirstReadAfterRelaunch() async throws {
        let store = MemoryCredentialStore(refreshCredential: String(repeating: "r", count: 43))
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)

        let result = try await api.readCurrentWeight()

        XCTAssertEqual(result.summary.currentWeight?.unit, "lb")
        XCTAssertEqual(try store.loadRefreshCredential(), String(repeating: "s", count: 43))
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, ["/api/v1/native/sandbox/auth/refresh", "/api/v1/native/sandbox/weight/summary"])
        let refreshBody = try XCTUnwrap(requests[0].httpBody)
        XCTAssertEqual(try JSONSerialization.jsonObject(with: refreshBody) as? [String: String], ["refreshCredential": String(repeating: "r", count: 43)])
    }

    func testExpiredAccessRefreshesOnceAndRetriesTheNarrowRead() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(401, code: "ACCESS_TOKEN_EXPIRED"),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        let result = try await api.readCurrentWeight()

        XCTAssertEqual(result.summary.currentWeight?.id, "weight-1")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/sandbox/auth/pair", "/api/v1/native/sandbox/weight/summary",
            "/api/v1/native/sandbox/auth/refresh", "/api/v1/native/sandbox/weight/summary",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testNoStoredRefreshIsASeparateUnauthenticatedState() async {
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: SequencedFounderTransport([]))
        await XCTAssertThrowsErrorAsync(try await api.readCurrentWeight()) { error in
            XCTAssertEqual(error as? FounderServerError, .notPaired)
        }
    }

    func testRefreshReuseOrRevocationClearsTheStoredSession() async throws {
        for code in ["REFRESH_REUSE_DETECTED", "REFRESH_CREDENTIAL_REVOKED"] {
            let store = MemoryCredentialStore(refreshCredential: String(repeating: "r", count: 43))
            let transport = SequencedFounderTransport([.problem(401, code: code)])
            let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
            await XCTAssertThrowsErrorAsync(try await api.readCurrentWeight()) { error in
                XCTAssertEqual(error as? FounderServerError, .deviceOrSessionRevoked)
            }
            XCTAssertNil(try store.loadRefreshCredential())
        }
    }

    func testTypedFailureSeparatesScopeNetworkAndServerAvailability() async throws {
        let cases: [(SequencedFounderTransport.Outcome, FounderServerError)] = [
            (.problem(403, code: "AUTHORIZATION_DENIED"), .unauthorizedScope),
            (.failure(URLError(.notConnectedToInternet)), .networkFailure),
            (.problem(503, code: "INTERNAL_ERROR"), .serverUnavailable),
        ]
        for (outcome, expected) in cases {
            let store = MemoryCredentialStore()
            let transport = SequencedFounderTransport([.json(200, sessionJSON(access: "a", refresh: "r")), outcome])
            let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
            _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
            await XCTAssertThrowsErrorAsync(try await api.readCurrentWeight()) { error in
                XCTAssertEqual(error as? FounderServerError, expected)
            }
        }
    }

    func testSessionRevocationClearsKeychainMaterialOnlyAfterServerConfirmation() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"revoked":true}"#),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        try await api.revokeCurrentSession()

        XCTAssertNil(try store.loadRefreshCredential())
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.httpMethod, "DELETE")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testCalendarDateDTOIsDecodedWithoutTimezoneConversion() async throws {
        let oldTimeZone = TimeZone.ReferenceType.default
        TimeZone.ReferenceType.default = TimeZone(identifier: "America/Los_Angeles")!
        defer { TimeZone.ReferenceType.default = oldTimeZone }
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let result = try await api.readCurrentWeight()
        XCTAssertEqual(result.summary.currentWeight?.measurementDate, "2026-08-31")
    }

    func testWeightFastPathSendsOriginalBytesAndLocalCandidateToSandboxOnly() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, #"{"id":"review-1","status":"pending","version":1,"occurrenceDate":"2026-08-31","candidate":{"value":168.4,"unit":"lb","confidence":0.97,"disposition":"deterministic_review_ready"}}"#),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let candidate = NativeSandboxWeightCandidate(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-acceptance-1",
            candidateType: "weight",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb",
            confidence: 0.97,
            localParserVersion: "ios-vision-weight-v1",
            assetSha256: String(repeating: "a", count: 64),
            founderContext: nil,
            fieldProvenance: .init(value: .init(source: "native_local_extraction", regions: [.init(page: 1, text: "168.4 lb")]))
        )
        let asset = Data("actual screenshot bytes".utf8)

        let review = try await api.submitWeightCandidate(candidate, asset: asset, filename: "weight.png", contentType: "image/png")

        XCTAssertEqual(review.candidate.value, 168.4)
        let requests = await transport.requests
        let request = try XCTUnwrap(requests.last)
        XCTAssertEqual(request.url?.path, "/api/v1/native/sandbox/weight/candidates")
        XCTAssertTrue(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
        let body = try XCTUnwrap(request.httpBody)
        XCTAssertNotNil(body.range(of: asset))
        XCTAssertNotNil(body.range(of: Data("\"measurementDate\":\"2026-08-31\"".utf8)))
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testManualWeightRequestEncodesOnlyScalarFieldsWithNoMediaOrOCR() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        _ = try await api.submitManualWeight(request)

        let requests = await transport.requests
        let lastRequest = try XCTUnwrap(requests.last)
        XCTAssertEqual(lastRequest.url?.path, "/api/v1/native/sandbox/weight/manual")
        XCTAssertEqual(lastRequest.httpMethod, "POST")
        let body = try XCTUnwrap(lastRequest.httpBody)
        let fields = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(Set(fields.keys), ["submissionIdentity", "idempotencyKey", "measurementDate", "value", "unit"])
    }

    func testManualWeightSendsBearerAndDecodesConfirmedResponse() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        let result = try await api.submitManualWeight(request)

        XCTAssertEqual(result.status, "confirmed")
        XCTAssertEqual(result.value, 168.4)
        XCTAssertEqual(result.measurementDate, "2026-08-31")
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testManualWeightRefreshesExpiredAccessTokenOnceAndRetries() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(401, code: "ACCESS_TOKEN_EXPIRED"),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        let result = try await api.submitManualWeight(request)

        XCTAssertEqual(result.id, "weight-manual-1")
        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/sandbox/auth/pair", "/api/v1/native/sandbox/weight/manual",
            "/api/v1/native/sandbox/auth/refresh", "/api/v1/native/sandbox/weight/manual",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testManualWeightMeasurementDateRoundTripsWithoutTimezoneShift() async throws {
        let oldTimeZone = TimeZone.ReferenceType.default
        TimeZone.ReferenceType.default = TimeZone(identifier: "America/Los_Angeles")!
        defer { TimeZone.ReferenceType.default = oldTimeZone }
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        let result = try await api.submitManualWeight(request)

        XCTAssertEqual(result.measurementDate, "2026-08-31")
        let requests = await transport.requests
        let body = try XCTUnwrap(requests.last?.httpBody)
        XCTAssertNotNil(body.range(of: Data(#""measurementDate":"2026-08-31""#.utf8)))
    }

    func testManualWeightServerFailureDoesNotSynthesizeSuccess() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(503, code: "INTERNAL_ERROR"),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )

        await XCTAssertThrowsErrorAsync(try await api.submitManualWeight(request)) { error in
            XCTAssertEqual(error as? FounderServerError, .serverUnavailable)
        }
    }

    func testSandboxHostStaysPinnedAcrossPairManualWriteAndSummaryRefresh() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manualWeightResultJSON),
            .json(200, weightJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let request = NativeSandboxWeightManualRequest(
            submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
            idempotencyKey: "native-weight-manual-1",
            measurementDate: "2026-08-31",
            value: 168.4,
            unit: "lb"
        )
        _ = try await api.submitManualWeight(request)
        _ = try await api.readCurrentWeight()

        let requests = await transport.requests
        XCTAssertEqual(requests.count, 3)
        XCTAssertTrue(requests.allSatisfy { $0.url?.host == testOrigin.host && $0.url?.scheme == testOrigin.scheme })
    }

    func testManualSubmissionIdentityStaysStableForASameSignatureRetry() {
        let previous = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-1", idempotencyKey: "key-1")
        let fresh = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-2", idempotencyKey: "key-2")
        let signature = NativeSandboxWeightManualSubmission.signature(value: 168.4, unit: "lb", measurementDate: "2026-08-31")

        let resolved = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: signature,
            previousSignature: signature,
            previousIdentity: previous,
            freshIdentity: fresh
        )

        XCTAssertEqual(resolved, previous)
    }

    func testManualSubmissionIdentityIsFreshForADeliberateCorrection() {
        let previous = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-1", idempotencyKey: "key-1")
        let fresh = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-2", idempotencyKey: "key-2")
        let previousSignature = NativeSandboxWeightManualSubmission.signature(value: 168.4, unit: "lb", measurementDate: "2026-08-31")
        let correctedSignature = NativeSandboxWeightManualSubmission.signature(value: 169.0, unit: "lb", measurementDate: "2026-08-31")

        let resolved = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: correctedSignature,
            previousSignature: previousSignature,
            previousIdentity: previous,
            freshIdentity: fresh
        )

        XCTAssertEqual(resolved, fresh)
    }

    func testManualSubmissionIdentityIsFreshForTheFirstAttempt() {
        let fresh = NativeSandboxWeightManualSubmission.Identity(submissionIdentity: "sub-2", idempotencyKey: "key-2")
        let signature = NativeSandboxWeightManualSubmission.signature(value: 168.4, unit: "lb", measurementDate: "2026-08-31")

        let resolved = NativeSandboxWeightManualSubmission.resolvedIdentity(
            signature: signature,
            previousSignature: nil,
            previousIdentity: nil,
            freshIdentity: fresh
        )

        XCTAssertEqual(resolved, fresh)
    }

    func testPhotoManifestUsesTheAuthenticatedSandboxRouteAndStableViewIdentity() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        let manifest = try await api.readPhotoAcceptanceManifest()

        XCTAssertEqual(manifest.schemaVersion, "native-founder-photo-media-v1")
        XCTAssertEqual(manifest.sessions.first?.photos.first?.viewIdentity, "session-1-front-relaxed")
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/native/sandbox/photo-acceptance/manifest")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
    }

    func testPhotoManifestRefreshesExpiredAccessBeforeRetrying() async throws {
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .problem(401, code: "ACCESS_TOKEN_EXPIRED"),
            .json(200, sessionJSON(access: "b", refresh: "s")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        _ = try await api.readPhotoAcceptanceManifest()

        let requests = await transport.requests
        XCTAssertEqual(requests.map { $0.url?.path }, [
            "/api/v1/native/sandbox/auth/pair",
            "/api/v1/native/sandbox/photo-acceptance/manifest",
            "/api/v1/native/sandbox/auth/refresh",
            "/api/v1/native/sandbox/photo-acceptance/manifest",
        ])
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "b", count: 43))")
    }

    func testPhotoMediaRejectsPathInjectionBeforeMakingARequest() async throws {
        let transport = SequencedFounderTransport([])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)

        await XCTAssertThrowsErrorAsync(try await api.readPhotoAcceptanceMedia(mediaId: "../founder-object")) { error in
            XCTAssertEqual(error as? FounderServerError, .invalidResponse)
        }
        let requests = await transport.requests
        XCTAssertTrue(requests.isEmpty)
    }

    func testPhotoMediaUsesBearerAndReturnsOnlyImageBytes() async throws {
        let bytes = Data([0xFF, 0xD8, 0xFF, 0xD9])
        let store = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .data(200, mimeType: "image/jpeg", bytes),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: store, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")

        let result = try await api.readPhotoAcceptanceMedia(mediaId: "media_1")

        XCTAssertEqual(result, bytes)
        let requests = await transport.requests
        XCTAssertEqual(requests.last?.url?.path, "/api/v1/native/sandbox/photo-acceptance/media/media_1")
        XCTAssertEqual(requests.last?.value(forHTTPHeaderField: "Authorization"), "Bearer \(String(repeating: "a", count: 43))")
        XCTAssertTrue(requests.last?.value(forHTTPHeaderField: "Accept")?.contains("image/jpeg") == true)
    }

    @MainActor
    func testPhotoManifestCanRecoverAfterPairingWithoutRestartingTheApp() async throws {
        let credentialStore = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        let mediaStore = FounderPhotoMediaStore(api: api)

        await mediaStore.loadManifestIfNeeded()
        XCTAssertEqual(mediaStore.manifestState, .unavailable)

        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        await mediaStore.loadManifestIfNeeded()

        XCTAssertEqual(mediaStore.manifestState, .ready)
        XCTAssertEqual(mediaStore.sessions.map(\.photoSessionId), ["session-1"])
    }

    @MainActor
    func testPhotoStoreMapsManifestSessionsByExactDateAndPoseWithoutWrongFallback() async throws {
        let credentialStore = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, photoManifestJSON),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let mediaStore = FounderPhotoMediaStore(api: api)

        await mediaStore.loadManifestIfNeeded()

        XCTAssertEqual(mediaStore.sessions.map(\.captureDate), ["2026-07-18"])
        XCTAssertNotNil(mediaStore.resolvedItem(setId: "fixture", captureDate: "2026-07-18", poseId: .frontRelaxed))
        XCTAssertNil(mediaStore.resolvedItem(setId: "fixture", captureDate: "2026-07-18", poseId: .backFlexed))
        XCTAssertEqual(mediaStore.projectedSetsByID["session-1"]?.views.first?.id, "session-1-front-relaxed")
    }

    @MainActor
    func testPhotoBriefingComparisonUsesDistinctAuthorizedHistoricalSessionWhenFixtureDatesDiffer() async throws {
        let credentialStore = MemoryCredentialStore()
        let manifest = #"{"schemaVersion":"native-founder-photo-media-v1","authority":{"kind":"sandbox-founder-photo-acceptance","sandboxAuthorityId":"sandbox-1"},"sessions":[{"photoSessionId":"session-old","captureDate":"2026-08-08","photos":[{"viewIdentity":"session-old-front-relaxed","photoSessionId":"session-old","photoId":"photo-old","mediaId":"media_old","poseId":"front-relaxed","captureDate":"2026-08-08","contentType":"image/jpeg","pixelWidth":1200,"pixelHeight":1600,"delivery":{"kind":"authenticated_proxy","path":"/api/v1/native/sandbox/photo-acceptance/media/media_old"}}]},{"photoSessionId":"session-new","captureDate":"2026-08-22","photos":[{"viewIdentity":"session-new-front-relaxed","photoSessionId":"session-new","photoId":"photo-new","mediaId":"media_new","poseId":"front-relaxed","captureDate":"2026-08-22","contentType":"image/jpeg","pixelWidth":1200,"pixelHeight":1600,"delivery":{"kind":"authenticated_proxy","path":"/api/v1/native/sandbox/photo-acceptance/media/media_new"}}]}]}"#
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, manifest),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let mediaStore = FounderPhotoMediaStore(api: api)
        await mediaStore.loadManifestIfNeeded()

        let pair = mediaStore.resolvedComparisonItems(
            priorSetId: "photo-set-fixture-004",
            priorDate: "2026-08-16",
            currentSetId: "photo-set-fixture-005",
            currentDate: "2026-08-30",
            poseId: .frontRelaxed
        )

        XCTAssertEqual(pair.current?.photoSessionId, "session-new")
        XCTAssertEqual(pair.prior?.photoSessionId, "session-old")
        XCTAssertNotEqual(pair.prior?.viewIdentity, pair.current?.viewIdentity)
    }

    @MainActor
    func testPhotoStoreFailsClosedOnMismatchedServerViewIdentity() async throws {
        let credentialStore = MemoryCredentialStore()
        let invalidManifest = photoManifestJSON.replacingOccurrences(of: "session-1-front-relaxed", with: "wrong-view")
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, invalidManifest),
        ])
        let api = FounderServerAPI(baseURL: testOrigin, credentialStore: credentialStore, transport: transport)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Test iPhone")
        let mediaStore = FounderPhotoMediaStore(api: api)

        await mediaStore.loadManifestIfNeeded()

        XCTAssertEqual(mediaStore.manifestState, .unavailable)
        XCTAssertTrue(mediaStore.itemsByViewIdentity.isEmpty)
    }

    // MARK: - Activity Day Detail cache-consistency regression (Build 58)
    //
    // Founder-observed defect: "Recent Activity History" showed a fresh
    // Sep 23 revision (783 active cal / 107 min, HealthKit revision 51 /
    // `complete_day`) while "Activity Day Detail" for the exact same date
    // kept showing a stale snapshot (606 active cal / 102 min, revision 50 /
    // `partial_day`, ~4 hours older). Root cause: `ProductionActivityAPI`'s
    // Detail lookup (`fetchActivityDay`) always queried `context=all` while
    // History used the Founder's selected scope — two different cache keys
    // — and Detail had no explicit refresh trigger of its own, so it
    // depended entirely on whatever another, unrelated caller had last left
    // sitting in the shared `activity?context=all` bucket. The fix makes
    // Detail always bypass the cache (`policy: .reload`) instead of
    // inventing a new per-date server resource, matching the server's own
    // uncached `/read/activity` guarantee.

    func testActivityDayDetailNeverServesAnOlderRevisionThanHistoryOnceObserved() async throws {
        let revision50 = activityLandingFixtureJSON(
            latest: activityDayFixtureJSON(id: "activity-2026-09-23-r50", date: "2026-09-23", isToday: true, activeCalories: 606, exerciseMinutes: 102, value: "606 active cal / 102 min"),
            history: [activityDayFixtureJSON(id: "activity-2026-09-23-r50", date: "2026-09-23", isToday: true, activeCalories: 606, exerciseMinutes: 102, value: "606 active cal / 102 min")]
        )
        let revision51 = activityLandingFixtureJSON(
            latest: activityDayFixtureJSON(id: "activity-2026-09-23-r51", date: "2026-09-23", isToday: true, activeCalories: 782.7, exerciseMinutes: 107, value: "782.7 active cal / 107 min"),
            history: [activityDayFixtureJSON(id: "activity-2026-09-23-r51", date: "2026-09-23", isToday: true, activeCalories: 782.7, exerciseMinutes: 107, value: "782.7 active cal / 107 min")]
        )
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, revision50), // History's first load — canonical day still `partial_day`.
            .json(200, revision51), // History's pull-to-refresh — canonical day now `complete_day`.
            .json(200, revision51), // Detail opened immediately after — must be a genuine live read.
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Activity revision test")
        let api = ProductionActivityAPI(api: native)

        let firstLanding = try await api.fetchActivityLanding(scope: .all)
        XCTAssertEqual(firstLanding.latestActivityDay?.activeCalories, 606)

        // Mirrors `ActivityHistoryView.refreshable`.
        await native.invalidateReadResources(["activity"])
        let refreshedLanding = try await api.fetchActivityLanding(scope: .all)
        XCTAssertEqual(refreshedLanding.latestActivityDay?.activeCalories, 782.7)
        XCTAssertEqual(refreshedLanding.latestActivityDay?.exerciseMinutes, 107)

        // Detail opens right after — well inside the read cache's TTL, so a
        // pre-fix cache-first lookup on a shared bucket could still be
        // holding revision 50. It must never resolve to that value again.
        let detailDay = try await api.fetchActivityDay(date: "2026-09-23")
        XCTAssertEqual(detailDay?.activeCalories, 782.7)
        XCTAssertEqual(detailDay?.exerciseMinutes, 107)
        XCTAssertNotEqual(detailDay?.activeCalories, 606, "Activity Day Detail must never resolve to the superseded revision once a newer one has been observed")

        let activityReads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/activity") == true }
        XCTAssertEqual(activityReads.count, 3, "Detail must always perform its own live read rather than opportunistically reusing a cached response")
    }

    /// Requirement 7 (race/coalescing guard), exercised against the actual
    /// Activity resource and fixture values: an older in-flight response
    /// (revision 50, started before an invalidation) that resolves AFTER a
    /// newer response (revision 51, started after the invalidation) has
    /// already been stored must never be allowed to clobber the cache.
    /// Mirrors `testInvalidatedReviewReadCannotJoinOldFlightOrEraseNewFlight`'s
    /// proven pattern for a different resource, confirming
    /// `ProductionNativeAPI`'s generation-gated cache store (already shared,
    /// generic infrastructure — not something this fix needed to add)
    /// protects Activity the same way.
    func testActivityReadCacheRejectsAnOlderInFlightResponseArrivingAfterANewerOne() async throws {
        actor HeldActivityTransport: FounderHTTPTransport {
            let responses: [String]
            let started: [XCTestExpectation]
            var reads = 0
            var held: [Int: CheckedContinuation<Void, Never>] = [:]
            init(responses: [String], started: [XCTestExpectation]) {
                self.responses = responses
                self.started = started
            }
            func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
                let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
                if request.url?.path.hasSuffix("/auth/pair") == true { return (Data(responses[0].utf8), response) }
                reads += 1
                let index = reads
                if index <= 2 {
                    await withCheckedContinuation { continuation in
                        held[index] = continuation
                        started[index - 1].fulfill()
                    }
                } else { started[2].fulfill() }
                return (Data(responses[index == 1 ? 1 : 2].utf8), response)
            }
            func release(_ index: Int) { held.removeValue(forKey: index)?.resume() }
        }
        let oldStarted = expectation(description: "pre-invalidation activity GET")
        let newStarted = expectation(description: "post-invalidation activity GET")
        let unexpectedThird = expectation(description: "old completion must not detach the new GET")
        unexpectedThird.isInverted = true
        let revision50 = activityLandingFixtureJSON(
            latest: activityDayFixtureJSON(id: "activity-2026-09-23-r50", date: "2026-09-23", isToday: true, activeCalories: 606, exerciseMinutes: 102, value: "606 active cal / 102 min"),
            history: [activityDayFixtureJSON(id: "activity-2026-09-23-r50", date: "2026-09-23", isToday: true, activeCalories: 606, exerciseMinutes: 102, value: "606 active cal / 102 min")]
        )
        let revision51 = activityLandingFixtureJSON(
            latest: activityDayFixtureJSON(id: "activity-2026-09-23-r51", date: "2026-09-23", isToday: true, activeCalories: 782.7, exerciseMinutes: 107, value: "782.7 active cal / 107 min"),
            history: [activityDayFixtureJSON(id: "activity-2026-09-23-r51", date: "2026-09-23", isToday: true, activeCalories: 782.7, exerciseMinutes: 107, value: "782.7 active cal / 107 min")]
        )
        let transport = HeldActivityTransport(responses: [sessionJSON(access: "a", refresh: "r"), revision50, revision51], started: [oldStarted, newStarted, unexpectedThird])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Activity race test")
        let api = ProductionActivityAPI(api: native)

        let old = Task { try await api.fetchActivityLanding(scope: .all) }
        await fulfillment(of: [oldStarted], timeout: 2)
        await native.invalidateReadResources(["activity"])
        let fresh = Task { try await api.fetchActivityLanding(scope: .all) }
        await fulfillment(of: [newStarted], timeout: 2)
        await transport.release(1) // The stale (revision 50) response resolves only now, after the newer fetch already started.
        let oldValue = try await old.value
        XCTAssertEqual(oldValue.latestActivityDay?.activeCalories, 606)

        let joined = Task { try await api.fetchActivityLanding(scope: .all) }
        await fulfillment(of: [unexpectedThird], timeout: 0.2)
        await transport.release(2)
        let freshValue = try await fresh.value
        let joinedValue = try await joined.value
        XCTAssertEqual(freshValue.latestActivityDay?.activeCalories, 782.7)
        XCTAssertEqual(joinedValue.latestActivityDay?.activeCalories, 782.7, "A read taken after the newer fetch resolved must never rejoin/see the superseded revision-50 response")

        // The strongest check: a brand-new cache-first read afterward must
        // reuse the STORED cache entry, and that entry must be the newer
        // revision — proving the orphaned old flight never overwrote it.
        let afterward = try await api.fetchActivityLanding(scope: .all)
        XCTAssertEqual(afterward.latestActivityDay?.activeCalories, 782.7)
        let finalReadCount = await transport.reads
        XCTAssertEqual(finalReadCount, 2, "A subsequent cache-first read must reuse the stored revision-51 response, not reveal a corrupted (reverted-to-50) cache")
    }

    /// Requirements 3 & 4: looking up two different Activity dates never
    /// cross-contaminates, and invalidating Activity's cache (what History's
    /// pull-to-refresh and Detail's own refresh both do) never touches an
    /// unrelated resource's cache entry.
    func testActivityDayLookupsAcrossDatesDoNotCrossContaminateAndInvalidationStaysScopedToActivity() async throws {
        let dayLower = activityDayFixtureJSON(id: "activity-2026-09-22", date: "2026-09-22", isToday: false, activeCalories: 500, exerciseMinutes: 60, value: "500 active cal / 60 min")
        let dayUpper = activityDayFixtureJSON(id: "activity-2026-09-23", date: "2026-09-23", isToday: true, activeCalories: 782.7, exerciseMinutes: 107, value: "782.7 active cal / 107 min")
        let multiDay = activityLandingFixtureJSON(latest: dayUpper, history: [dayUpper, dayLower])
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["activity": multiDay, "weight": productionWeightJSON(value: 170.4)]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Activity cross-date test")
        let api = ProductionActivityAPI(api: native)

        let olderDay = try await api.fetchActivityDay(date: "2026-09-22")
        let newerDay = try await api.fetchActivityDay(date: "2026-09-23")
        XCTAssertEqual(olderDay?.activeCalories, 500)
        XCTAssertEqual(newerDay?.activeCalories, 782.7)
        XCTAssertNotEqual(olderDay?.id, newerDay?.id, "Two distinct dates must never resolve to the same record")

        // Prime an unrelated resource's cache.
        _ = try await native.readWeight()
        var weightReads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/weight") == true }
        XCTAssertEqual(weightReads.count, 1)

        await native.invalidateReadResources(["activity"])
        _ = try await native.readWeight()
        weightReads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/weight") == true }
        XCTAssertEqual(weightReads.count, 1, "Invalidating Activity's cache must never evict Weight's (or any other unrelated resource's) cache entry")
    }

    /// Requirement 5: Nutrition's own caching is a separate resource and
    /// this fix must not regress it. Unlike the fixed
    /// `ProductionActivityAPI.fetchActivityDay`, `ProductionNutritionAPI`
    /// was not touched at all — `fetchNutritionDay` still shares one cached
    /// read with `fetchNutritionLanding`, and Activity's own cache
    /// invalidation must never evict Nutrition's entry. Nothing in the
    /// shared `ProductionNativeAPI` caching layer (`readCacheKey`,
    /// `cacheLifetime`, `invalidateReadResources`) was changed by this fix.
    func testNutritionCachingIsUnaffectedByTheActivityDayDetailFix() async throws {
        let transport = RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: ["nutrition": productionNutritionJSON, "activity": productionActivityJSON]
        )
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Nutrition regression test")
        let nutritionAPI = ProductionNutritionAPI(api: native)

        _ = try await nutritionAPI.fetchNutritionLanding(scope: .all)
        let day = try await nutritionAPI.fetchNutritionDay(dayId: "nutrition-day-canonical")
        XCTAssertEqual(day?.totals.calories, 2_300)
        let nutritionReads = await transport.requests.filter { $0.url?.path.hasSuffix("/read/nutrition") == true }
        XCTAssertEqual(nutritionReads.count, 1, "Nutrition's landing and day lookup must still share exactly one cached network read — cache-bypass-on-read is scoped to Activity Day Detail only")

        _ = try await ProductionActivityAPI(api: native).fetchActivityLanding(scope: .all)
        await native.invalidateReadResources(["activity"])
        _ = try await nutritionAPI.fetchNutritionLanding(scope: .all)
        let nutritionReadsAfter = await transport.requests.filter { $0.url?.path.hasSuffix("/read/nutrition") == true }
        XCTAssertEqual(nutritionReadsAfter.count, 1, "Invalidating Activity's cache must never evict Nutrition's cache entry")
    }
}

private enum FocusedReadFailure: Error { case unavailable }

private actor FirstPriorityThenFailureAPI: PriorityAPI {
    let occurrence: PriorityOccurrence
    private var reads = 0

    init(occurrence: PriorityOccurrence) { self.occurrence = occurrence }

    func fetchExecutionItems() async throws -> [ExecutionItemFixture] { [] }

    func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence? {
        reads += 1
        guard reads == 1 else { throw FocusedReadFailure.unavailable }
        return occurrence
    }
}

private actor RecordingPriorityCompletionAPI: PriorityCompletionWriteAPI {
    private(set) var submissionCount = 0

    func complete(priorityId: String, occurrenceDate: String, context: PriorityCompletionContext?, expectedVersion: Int) async throws {
        submissionCount += 1
    }
}

private actor FirstHomeThenFailureAPI: HomeAPI {
    let home: HomeReadModel
    private var reads = 0

    init(home: HomeReadModel) { self.home = home }

    func fetchHome() async throws -> HomeReadModel {
        reads += 1
        guard reads == 1 else { throw FocusedReadFailure.unavailable }
        return home
    }
}

private let testOrigin = URL(string: "https://example.invalid")!
private let weightJSON = #"{"schemaVersion":"1","currentWeight":{"id":"weight-1","value":168.4,"unit":"lb","measurementDate":"2026-08-31"}}"#
private let manualWeightResultJSON = #"{"schemaVersion":"1","id":"weight-manual-1","status":"confirmed","measurementDate":"2026-08-31","value":168.4,"unit":"lb"}"#
private let photoManifestJSON = #"{"schemaVersion":"native-founder-photo-media-v1","authority":{"kind":"sandbox-founder-photo-acceptance","sandboxAuthorityId":"sandbox-1"},"sessions":[{"photoSessionId":"session-1","captureDate":"2026-07-18","photos":[{"viewIdentity":"session-1-front-relaxed","photoSessionId":"session-1","photoId":"photo-1","mediaId":"media_1","poseId":"front-relaxed","captureDate":"2026-07-18","contentType":"image/jpeg","pixelWidth":1200,"pixelHeight":1600,"delivery":{"kind":"authenticated_proxy","path":"/api/v1/native/sandbox/photo-acceptance/media/media_1"}}]}]}"#

private func productionEnvelope(resource: String, data: String) -> String {
    #"{"contractVersion":"1","resource":"\#(resource)","authority":"founder-production","generatedAt":"2026-09-10T15:00:00.000Z","data":\#(data)}"#
}

private func productionHomeJSON(priorityID: String, goalID: String, confidence: Int) -> String {
    productionEnvelope(resource: "home", data: """
    {
      "header":{"greeting":"Good morning","name":"Founder"},
      "hero":{"mode":"phase_trajectory","goalLabel":"Current Goal","headline":"Server headline","supportLine":"Server support","confidence":\(confidence),"confidenceDetail":null,"primaryTimeline":"4 weeks remaining","plannedReviewDate":"2026-10-08"},
      "nextBestAction":{"title":"Server action","icon":"target","destination":{"id":"goal.detail","parameters":{"goalId":"\(goalID)"}}},
      "briefingCards":[],
      "goals":[{"id":"\(goalID)","title":"Server Goal","icon":"dumbbell","color":"success","destination":{"id":"goal.detail","parameters":{"goalId":"\(goalID)"}},"presentation":{"mode":"phase_trajectory_goal","guardrail":"Maintain approximately 8-9% body fat.","trajectory":{"goalProgress":{"baselineValue":147.5,"latestValue":148.3,"targetAmount":10,"unit":"lb","clampedProgressPercentage":8},"activePhase":{"order":1,"phaseName":"Lean Mass Build"},"overallGoal":{"targetDescription":"Build 10 lb of lean mass","overallTargetDate":"2026-10-31"},"phases":[{"phaseId":"phase-maintenance","order":0,"phaseName":"Establish Maintenance","status":"completed","presentationTone":"gold","progress":{"progressType":"outcome","clampedProgressPercentage":100,"presentationLabel":"Completed"}},{"phaseId":"phase-lean-mass","order":1,"phaseName":"Lean Mass Build","status":"active","presentationTone":"green","startDate":"2026-08-16","calculatedPlannedReviewDate":"2026-10-08","timelineProgressState":"review_due","progress":{"progressType":"outcome","clampedProgressPercentage":8,"presentationLabel":"0.8 of 10 lb gained","status":"measured"}}]}}}],
      "todaysFocus":[{"id":"\(priorityID)","completionId":"completion-canonical","executionId":"execution-canonical","occurrenceDate":"2026-09-10","label":"Server Priority","subtitle":"Server-owned occurrence","metadata":"Production","changeLabel":null,"icon":"target","color":"primary","state":"available","completed":false,"completable":true,"actionLabel":"Complete","completionContext":{"occurrenceDate":"2026-09-10","dose":null,"protocolId":null},"executionContract":{"priorityId":"completion-canonical","occurrenceDate":"2026-09-10","occurrenceKey":"completion-canonical:2026-09-10","expectedVersion":7,"workflow":"priority_detail","destination":"/priorities/completion-canonical"}}]
    }
    """)
}

private let productionCompletedMorningHomeJSON = productionEnvelope(resource: "home", data: #"{"header":{"greeting":"Good morning","name":"Founder"},"hero":{"mode":"active","goalLabel":"Current Goal","headline":"Morning complete","supportLine":"Canonical state","confidence":null,"confidenceDetail":null,"primaryTimeline":null,"plannedReviewDate":null},"nextBestAction":{"title":"Review today","icon":"target","destination":{"id":"goal.detail","parameters":{"goalId":"goal-canonical"}}},"briefingCards":[],"goals":[],"todaysFocus":[{"id":"home-row-morning","completionId":"wrong-fallback-id","executionId":"execution-morning","occurrenceDate":null,"label":"Morning Check-In","subtitle":"Completed","metadata":"Production","changeLabel":null,"icon":"target","color":"success","state":"completed","completed":true,"actionLabel":null,"completionContext":null,"executionContract":{"priorityId":"morning-check-in","occurrenceDate":"2026-09-09","occurrenceKey":"morning-check-in:2026-09-09","workflow":"priority_detail","destination":{"id":"priority.detail","parameters":{"priorityId":"morning-check-in"}}}}]}"#)

private let productionGoalsJSON = productionEnvelope(resource: "goals", data: #"{"activeGoals":[{"id":"goal-canonical","title":"Build Lean Mass","status":"active","statusLabel":"On Track","confidence":{"value":74,"band":"Moderate","source":"server","explanation":"Server explanation"},"phase":{"id":"phase-canonical","name":"Foundation","status":"active","startedAt":"2026-09-01","plannedReviewAt":"2026-10-01"}}],"completedGoals":[],"transitionEntry":null,"relationshipContext":{"activeGoalId":"goal-canonical","activePhaseId":"phase-canonical"}}"#)

private let productionCompletedGoalsHubJSON = productionEnvelope(resource: "goals", data: #"{"activeGoals":[],"completedGoals":[{"id":"goal-visible-abs","title":"Visible Abs at Rest","status":"Completed","dates":"May 20 → Jul 18","achievement":"7.7% Body Fat"}],"transitionEntry":null,"relationshipContext":{}}"#)

private let productionCompletedGoalJSON = productionEnvelope(resource: "completed-goal", data: #"{"goalId":"goal-visible-abs","status":"completed","preview":{"readOnly":true,"canonicalGoalId":"goal-visible-abs","supportingGoalIds":[]},"hero":{"title":"Visible Abs at Rest","status":"Completed","dates":"May 20 → Jul 18","achievement":"7.7% Body Fat"},"recap":"Server recap","highlights":[{"date":"2026-07-18","title":"The finish line aligned","body":"Server evidence converged."}],"photos":{"beginning":null,"completion":null,"historyHref":"/progress/photos"},"finalComposition":{"scanId":"scan-canonical","date":"2026-07-18","bodyFat":"7.7%","leanMass":"147.5 lb","fatMass":"12.3 lb","weight":"159.8 lb","narrative":"Server conclusion","briefingHref":"/briefings/dexa/scan-canonical"},"achievedBy":["Server outcome"],"unlocked":{"title":"Build Lean Mass","destination":{"id":"goal.detail","parameters":{"goalId":"goal-canonical"}},"body":"Next canonical goal."}}"#)

/// A completed journey entry's `support` is genuinely `null` on the wire
/// (confirmed against a real Package 7 `active-goal` response) — this
/// fixture must include that null case, not just an active entry with a
/// populated `support`, or it can't catch a regression to
/// `Journey.support: String` non-optional.
private let productionActiveGoalJSON = productionEnvelope(resource: "active-goal", data: #"{"goalId":"goal-canonical","phaseId":"phase-canonical","confidence":{"score":74,"band":"Moderate","summary":"Server confidence","movement":"increased","priorScore":68,"delta":6,"explanation":{"qualitativeLevel":"Moderate","summary":"Training and adherence have both been strong recently.","supportingFactors":["Training has been consistently strong for the last few weeks."],"limitingFactors":["Calories still need more consistency before we can tell whether this intake is right."],"movementFactors":["Confidence increased because training consistency improved."],"clarifyingFactors":["Another body-composition check will confirm the trend."],"uncertaintyStatement":""}},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Establish Maintenance","number":1,"status":"Completed","dates":"Started Jul 19 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Foundation","number":2,"status":"Active","dates":"Started Sep 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":32}],"currentPhase":{"id":"phase-canonical","goalId":"goal-canonical","title":"Foundation","purpose":"Build deliberately","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain 8–9% body fat","scope":"Every phase","body":"DEXA is authoritative","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[{"title":"Goal journey activated","body":"The journey began.","date":"2026-07-19"}],"strategy":[{"label":"Energy","active":true}]}"#)

private let productionOperatingPlanJSON = productionEnvelope(resource: "operating-plan", data: #"{"sections":[{"iconKey":"energy","tone":"primary","title":"Energy Strategy","subtitle":"Active","items":[{"id":"energy-canonical","title":"Phase Execution","detail":"2300 kcal/day intake","status":"Active","destination":{"id":"plan.strategy","parameters":{"strategyType":"energy","strategyId":"energy-canonical"}}}]},{"iconKey":"nutrition","tone":"primary","title":"Nutrition","subtitle":"Active","items":[{"id":"nutrition-canonical","title":"Nutrition","detail":"Current strategy","status":"Active","destination":{"id":"plan.strategy","parameters":{"strategyType":"nutrition","strategyId":"nutrition-canonical"}}}]},{"iconKey":"training","tone":"effort","title":"Training","subtitle":"Active","items":[{"id":"training-canonical","title":"Training","detail":"Current strategy","status":"Active","destination":{"id":"plan.strategy","parameters":{"strategyType":"training","strategyId":"training-canonical"}}}]},{"iconKey":"recovery","tone":"success","title":"Recovery","subtitle":"Active","items":[{"id":"recovery","title":"Recovery Strategy","detail":"Foam Rolling","status":"Active","destination":{"id":"plan.support","parameters":{"supportType":"protocol","supportId":"recovery-canonical"}}}]},{"iconKey":"peptide","tone":"effort","title":"Peptides","subtitle":"Active","items":[{"id":"peptides","title":"Peptide Strategy","detail":"Retatrutide","status":"Active","destination":{"id":"plan.support","parameters":{"supportType":"protocol","supportId":"peptide-canonical"}}}]},{"iconKey":"supplement","tone":"success","title":"Supplements","subtitle":"Active","supplements":true,"items":[{"id":"supplements","title":"Supplement Strategy","detail":"Electrolytes","status":"Active","destination":{"id":"plan.support","parameters":{"supportType":"protocol","supportId":"supplement-canonical"}}}]},{"iconKey":"tracking","tone":"evidence","title":"Tracking","subtitle":"Active","items":[{"id":"tracking","title":"Tracking","detail":"Morning Weigh-In","status":"Active","destination":{"id":"plan.support","parameters":{"supportType":"tracking","supportId":"current"}}}]},{"iconKey":"coaching","tone":"primary","title":"Coaching Updates","subtitle":"Active","items":[{"id":"coaching-canonical","title":"Coaching Updates","detail":"Midweek and weekly","status":"Active","destination":{"id":"plan.strategy","parameters":{"strategyType":"briefings","strategyId":"coaching-canonical"}}}]}],"sourceVersions":{"energy":"4"},"relationshipContext":{"activeGoalId":"goal-canonical","activePhaseId":"phase-canonical"}}"#)

private let productionPriorityJSON = productionEnvelope(resource: "priority", data: #"{"id":"priority-canonical","title":"Morning weigh-in","subtitle":"Today","status":"Available","sections":[{"title":"Context","items":[{"label":"Goal","detail":"Build Lean Mass"}]}],"completionContext":{"occurrenceDate":"2026-09-10","dose":null,"protocolId":null},"executionContract":{"priorityId":"priority-canonical","occurrenceDate":"2026-09-10","occurrenceKey":"priority-canonical:2026-09-10","expectedVersion":11,"workflow":"priority_detail","destination":{"id":"priority.detail","parameters":{"priorityId":"priority-canonical"}}},"executionProjection":{"executionId":"execution-canonical"}}"#)

private func productionTrainingLibraryJSON(exerciseID: String, muscleGroup: String) -> String {
    productionEnvelope(resource: "training-library", data: """
    {"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"canonicalExercises":[{"canonicalExerciseId":"\(exerciseID)","label":"Incline Press","primaryMuscleGroupId":"\(muscleGroup)","primaryMuscleGroups":["\(muscleGroup)"],"regionLabel":"Upper Body","equipment":"Dumbbells","defaultMeasurement":"reps_load","defaultLoadType":"external"}]}}
    """)
        .replacingOccurrences(of: "\"report\":", with: "\"myLibraryExerciseIds\":[\"\(exerciseID)\"],\"report\":")
        .replacingOccurrences(of: "\"primaryMuscleGroupId\":", with: "\"primaryNavigationCategory\":\"\(muscleGroup.lowercased())\",\"primaryMuscleGroupId\":")
}

/// `coreNavigation.getTrainingLogger`'s `initialHistorySessions` are the
/// server's own leaner `projectTrainingHistorySession` projection, not the
/// full `training-session` presentation shape — `{id, evidence_type,
/// observed_at, exercises: [{id, canonicalExerciseId, name, body_region,
/// equipment, sets: [{reps, weight, weight_unit}]}]}`, with no
/// `set_number`, `label`, `value`, `detail`, or `sourceEvidence` anywhere
/// (confirmed against a real production response). This fixture must use
/// that exact leaner shape or it can't catch a regression to reusing
/// `TrainingSessionDetailReadModel` here.
private func productionTrainingLoggerJSON(exerciseID: String, muscleGroup: String) -> String {
    productionEnvelope(resource: "training-logger", data: """
    {"initialDate":"2026-09-10","initialCanonicalExercises":[{"id":"\(exerciseID)","name":"Incline Press","equipment":"Dumbbells","bodyRegion":"Upper Body","primaryMuscleGroups":["\(muscleGroup)"],"defaultMeasurement":"reps_load","defaultLoadType":"external"}],"initialHistorySessions":[{"id":"session-canonical","evidence_type":"training","observed_at":"2026-09-09","exercises":[{"id":"exercise-occurrence-canonical","canonicalExerciseId":"\(exerciseID)","name":"Incline Press","body_region":"Upper Body","equipment":"Dumbbells","sets":[{"reps":10,"weight":135,"weight_unit":"lb","load_type":"external_load"},{"reps":8,"weight":145,"weight_unit":"lb","load_type":"external_load"}]}]}],"initialPerformedExerciseIds":["\(exerciseID)"],"initialMyLibraryExerciseIds":["\(exerciseID)"],"initialCategorySuggestion":{"id":"confirmed_history_3_biceps_triceps","date":"2026-09-10","label":"Biceps + Triceps","categoryIds":["biceps","triceps"],"reason":"Repeated on Wednesdays across 6 confirmed workouts","source":"confirmed_training_evidence_history","historyReferences":["session-1","session-2","session-3","session-4","session-5","session-6"]},"initialProgressionRecommendations":[{"canonicalExerciseId":"\(exerciseID)","state":"maintain","eyebrow":"Maintain current performance","message":"Canonical recommendation.","prescription":"145 lb x 8","suggestedLoad":145,"suggestedLoadType":"external_load","suggestedReps":8,"suggestedUnit":"lb"}]}
    """)
        .replacingOccurrences(of: "\"bodyRegion\":", with: "\"primaryNavigationCategory\":\"\(muscleGroup.lowercased())\",\"bodyRegion\":")
}

private let productionTrainingExerciseJSON = productionEnvelope(resource: "training-exercise", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"entries":[]},"exerciseRecords":{"id":"records-canonical","heading":"Performance Records","canonicalExerciseId":"canonical-incline-press","canonicalExerciseName":"Incline Press","records":[{"id":"record-canonical","canonicalExerciseId":"canonical-incline-press","canonicalExerciseName":"Incline Press","title":"Volume PR","value":"4,200 lb","previousBaseline":null,"improvement":null,"detail":null,"workoutDate":"2026-09-09","executionVariant":null,"relationshipContext":null,"achievedValue":4200,"achievementType":"session_volume_pr","sourceEventId":"event-canonical"}],"visibleCount":1,"totalCount":1,"hiddenCount":0,"countLabel":null}}"#)

/// The Package 7 `nutrition` resource's canonical meal shape never carries
/// a `slot` key — only a free-text `name` ("Breakfast", "Lunch", "Dinner",
/// "Snacks", confirmed against a real production response). This fixture
/// must omit `slot` from `meals[]` or it can't catch a regression to a
/// non-optional `slot` decode requirement.
private let productionNutritionJSON = productionEnvelope(resource: "nutrition", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Nutrition","selected":true}]},"report":{"title":"Nutrition","subtitle":"Nutrition evidence","tone":"success","nutritionDays":[{"id":"nutrition-day-canonical","date":"2026-09-10","value":"2300 calories","detail":"180g protein · 220g carbs · 70g fat · 1 meal","sourceEvidence":["web"],"totals":{"calories":2300,"proteinG":180,"carbsG":220,"fatG":70,"fiberG":null},"meals":[{"id":"meal-canonical","name":"Breakfast","completeness":"complete","totals":{"calories":2300,"proteinG":180,"carbsG":220,"fatG":70,"fiberG":null},"foods":[],"additionalFoodsDetected":0}]}],"nutritionLibrary":[],"nutritionReportingLinks":[],"dataSources":[{"name":"Manual","status":"Connected"}]}}"#)

/// `getLinkedActivityTrainingContext` only ever emits
/// `{id, label, value, detail}` — no `date`/`sourceEvidence` (confirmed
/// against a real production response). This fixture must include a
/// non-empty entry in that exact leaner shape or it can't catch a
/// regression to non-optional `date`/`sourceEvidence` decode requirements.
private let productionActivityJSON = productionEnvelope(resource: "activity", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Activity","selected":true}]},"report":{"title":"Activity","subtitle":"Whole-day movement","tone":"success","latestActivityDay":{"id":"activity-day-canonical","label":"Daily Activity","value":"650 active cal / 45 min","detail":"1 workout linked","date":"2026-09-10","isToday":true,"activeCalories":650,"totalCalories":null,"exerciseMinutes":45,"standHours":12,"moveGoal":600,"exerciseGoal":30,"standGoal":12,"ringCompletion":null,"workoutActiveCalories":400,"nonWorkoutActiveCalories":250,"linkedTrainingSessionCount":1,"protocolStatus":"50 active calories above target."},"activityAreas":[],"linkedTrainingContext":[{"id":"training-canonical","label":"Traditional Strength Training","value":"356 active cal","detail":"1h 12m · 4 exercises"}],"activityHistory":[{"id":"activity-day-canonical","label":"Daily Activity","value":"650 active cal / 45 min","detail":"1 workout linked","date":"2026-09-10","isToday":true,"activeCalories":650,"totalCalories":null,"exerciseMinutes":45,"standHours":12,"moveGoal":600,"exerciseGoal":30,"standGoal":12,"ringCompletion":null,"workoutActiveCalories":400,"nonWorkoutActiveCalories":250,"linkedTrainingSessionCount":1,"protocolStatus":"50 active calories above target."}],"dataSources":[{"name":"Web","status":"Connected"}]}}"#)

/// Builds one `ActivityDayRecord`'s wire JSON (see `ActivityReadModel.swift`)
/// with every required field populated, varying only the identity/metrics
/// the Activity Day Detail regression tests above need to control.
private func activityDayFixtureJSON(
    id: String, date: String, isToday: Bool, activeCalories: Double, exerciseMinutes: Double,
    value: String, protocolStatus: String = "Activity context available."
) -> String {
    #"{"id":"\#(id)","label":"Daily Activity","value":"\#(value)","detail":"Evidence detail","date":"\#(date)","isToday":\#(isToday),"activeCalories":\#(activeCalories),"totalCalories":null,"exerciseMinutes":\#(exerciseMinutes),"standHours":12,"moveGoal":600,"exerciseGoal":30,"standGoal":12,"ringCompletion":null,"workoutActiveCalories":400,"nonWorkoutActiveCalories":250,"linkedTrainingSessionCount":1,"protocolStatus":"\#(protocolStatus)"}"#
}

/// Builds a full `activity` resource envelope (as `ProductionActivityAPI`
/// decodes it) from pre-built `activityDayFixtureJSON` day objects.
private func activityLandingFixtureJSON(latest: String, history: [String]) -> String {
    productionEnvelope(resource: "activity", data: """
    {"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Activity","selected":true}]},"report":{"title":"Activity","subtitle":"Whole-day movement","tone":"success","latestActivityDay":\(latest),"activityAreas":[],"linkedTrainingContext":[],"activityHistory":[\(history.joined(separator: ","))],"dataSources":[{"name":"Web","status":"Connected"}]}}
    """)
}

private let productionEnergyJSON = productionEnvelope(resource: "energy", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Energy","selected":true}]},"summary":{"averageIntake":2300,"averageExpenditure":2425,"averageBalance":-125,"completeDays":1,"evidenceDays":2},"days":[{"date":"2026-09-10","nutritionDayId":null,"activityDayId":"activity-1","calorieIntake":null,"activeCalories":500,"rmr":1700,"estimatedExpenditure":2200,"energyBalance":null,"completeness":"activity-only","sources":{"nutrition":[],"activity":["Activity"]}},{"date":"2026-09-09","nutritionDayId":"nutrition-1","activityDayId":"activity-2","calorieIntake":0,"activeCalories":600,"rmr":1700,"estimatedExpenditure":2300,"energyBalance":-2300,"completeness":"complete","sources":{"nutrition":["Web"],"activity":["Activity"]}}],"weeks":[{"id":"week-server","weekStart":"2026-09-07","weekEnd":"2026-09-13","averageIntake":2300,"averageExpenditure":2425,"averageBalance":-125,"completeDayCount":1,"evidenceDayCount":2,"expectedDayCount":4,"partial":true}],"recentFourWeeks":[{"id":"week-server","weekStart":"2026-09-07","weekEnd":"2026-09-13","averageIntake":2300,"averageExpenditure":2425,"averageBalance":-125,"completeDayCount":1,"evidenceDayCount":2,"expectedDayCount":4,"partial":true}],"latestEvidenceDate":"2026-09-10","dataSources":[{"name":"Nutrition","status":"Connected"}],"audit":{"nutritionDays":1,"activityDays":2,"overlappingDates":1}}"#)

private let productionWeightFullJSON = productionEnvelope(resource: "weight", data: #"{"schemaVersion":"1","context":{"contextId":"build-lean-mass","type":"active_goal","goalId":"goal-canonical","goalRevision":null,"phaseId":"phase-canonical","phaseRevision":null,"startDate":"2026-07-19","endDate":null},"current":{"id":"weight-2","date":"2026-09-10","value":168.3,"unit":"lb","revision":null,"label":"168.3 lb","detail":"Morning weight"},"recentWeighIns":[{"id":"weight-2","date":"2026-09-10","value":168.3,"unit":"lb","revision":null,"label":"168.3 lb","detail":"Morning weight"},{"id":"weight-1","date":"2026-09-09","value":167.7,"unit":"lb","revision":null,"label":"167.7 lb","detail":"Morning weight"}],"rollingAverages":{"threeDay":{"requestedDays":3,"observationCount":2,"startDate":"2026-09-08","endDate":"2026-09-10","value":168.0,"unit":"lb"},"sevenDay":{"requestedDays":7,"observationCount":2,"startDate":"2026-09-04","endDate":"2026-09-10","value":167.7,"unit":"lb"}},"weeklyAverages":[{"week":"Sep 8","sortDate":"2026-09-08","average":168.0,"weekOverWeek":null,"entries":2}],"extrema":{"goalRelevant":["highest"],"highest":{"id":"weight-2","date":"2026-09-10","value":168.3,"unit":"lb","revision":null},"lowest":{"id":"weight-1","date":"2026-09-09","value":167.7,"unit":"lb","revision":null}},"dexaContext":{"latest":{"id":"dexa-scan-1","date":"2026-09-01","label":"DEXA"},"markers":[{"id":"dexa-scan-1","date":"2026-09-01","label":"DEXA"}]},"history":[{"id":"weight-2","date":"2026-09-10","value":168.3,"unit":"lb","revision":null,"label":"168.3 lb","detail":"Morning weight"},{"id":"weight-1","date":"2026-09-09","value":167.7,"unit":"lb","revision":null,"label":"167.7 lb","detail":"Morning weight"}],"page":{"limit":90,"count":2,"hasMore":false}}"#)

private let productionPhotosJSON = productionEnvelope(resource: "photos", data: #"{"schemaVersion":"1","context":{"contextId":"build-lean-mass","type":"active_goal","goalId":"goal-canonical","goalRevision":null,"phaseId":"phase-canonical","phaseRevision":null,"startDate":"2026-07-19","endDate":null},"sessions":[{"sessionId":"session-2","revision":1,"intendedCaptureDate":"2026-09-01","goalId":"goal-canonical","phaseId":"phase-canonical","goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"completionStatus":"complete","comparisonStatus":"1/2 poses have prior comparisons","photos":[{"photoId":"photo-front-2","poseId":"front-relaxed","pose":{"id":"front-relaxed","label":"Front Relaxed","view":"front","pose":"relaxed"},"intendedCaptureDate":"2026-09-01","comparisonStatus":"comparable","media":{"mediaId":"media-front-2","deliveryPath":"/api/v1/native/media/media-front-2"},"galleryInterpretation":{"summary":"Canonical interpretation.","comparisonBullets":["Waist looks tighter."],"conditionSummary":"Comparable light and distance."},"sourceHistory":"Compared Aug 15 and Sep 1.","prior":{"sessionId":"session-1","photoId":"photo-front-1","poseId":"front-relaxed","intendedCaptureDate":"2026-08-15","media":{"mediaId":"media-front-1","deliveryPath":"/api/v1/native/media/media-front-1"}}},{"photoId":"photo-backflexed-2","poseId":"back-flexed","pose":{"id":"back-flexed","label":"Back Flexed","view":"back","pose":"flexed"},"intendedCaptureDate":"2026-09-01","comparisonStatus":"no_prior_matching_pose","media":{"mediaId":"media-backflexed-2","deliveryPath":"/api/v1/native/media/media-backflexed-2"},"prior":null}]},{"sessionId":"session-1","revision":1,"intendedCaptureDate":"2026-08-15","goalId":"goal-canonical","phaseId":"phase-canonical","goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"completionStatus":"complete","comparisonStatus":"0/1 poses have prior comparisons","photos":[{"photoId":"photo-front-1","poseId":"front-relaxed","pose":{"id":"front-relaxed","label":"Front Relaxed","view":"front","pose":"relaxed"},"intendedCaptureDate":"2026-08-15","comparisonStatus":"no_prior_matching_pose","media":{"mediaId":"media-front-1","deliveryPath":"/api/v1/native/media/media-front-1"},"prior":null}]}],"page":{"limit":12,"count":2,"hasMore":false}}"#)

private let productionTrainingReportingJSON = productionEnvelope(resource: "training-reporting", data: #"{"schemaVersion":"1","context":{"contextId":"all","type":"all_history","goalId":null,"goalRevision":null,"phaseId":null,"phaseRevision":null,"startDate":null,"endDate":null},"reporting":{"schemaVersion":"1","availableReports":[{"id":"resistance","label":"Resistance Training","detail":"Strength progression, PRs, and category momentum."},{"id":"history","label":"Training History","detail":"Recent canonical training days."},{"id":"cardio","label":"Cardio","detail":"Calories, distance, and heart-rate trends."}],"resistance":{"title":"Resistance Training","summary":"Strength progression, PRs, and category momentum from training history.","statusGroups":[{"status":"improving","label":"Improving","count":1,"exercises":[{"canonicalExerciseId":"bench-press","label":"Bench Press","status":"improving","latestEvidenceDate":"2026-09-08","detail":"Improving · Latest Sep 8, 2026"}]},{"status":"stable","label":"Stable","count":0,"exercises":[]},{"status":"plateauing","label":"Plateauing","count":0,"exercises":[]},{"status":"regressing","label":"Regressing","count":0,"exercises":[]},{"status":"insufficient_data","label":"Needs data","count":0,"exercises":[]}],"recentPrs":[{"canonicalExerciseId":"bench-press","label":"Bench Press","latestEvidenceDate":"2026-09-08","detail":"New reps-at-load PR: 8 reps at 185 lb."}],"highlights":[{"type":"exercise","canonicalExerciseId":"bench-press","label":"Bench Press","detail":"New reps-at-load PR: 8 reps at 185 lb."}],"needsAttention":[],"categories":[{"categoryId":"chest","label":"Chest","status":"improving","latestEvidenceDate":"2026-09-08","exerciseCount":3,"latestKnownSets":9,"latestKnownVolume":1200,"statusCounts":{"improving":2,"stable":1}}],"source":"canonical_training_sessions"},"history":{"title":"Training History","summary":"Recent canonical training days and their session identities.","days":[{"id":"day-2026-09-08","date":"2026-09-08","label":"Sep 8","sessions":[{"sessionId":"session-canonical-1","label":"Push Day","occurrenceDate":"2026-09-08","revision":1}]}]}}}"#)

private let productionTimelineJSON = productionEnvelope(resource: "timeline", data: #"{"items":[{"id":"item-2","type":"Weight","date":"2026-09-10","title":"Weight logged","detail":"168.3 lb","tone":"evidence"},{"id":"item-1","type":"Daily Briefing","date":"2026-09-09","title":"Midweek Briefing","detail":"Review the week so far.","tone":"primary"}],"hasMore":false,"totalCount":2,"limit":120}"#)

private let productionBriefingHistoryJSON = productionEnvelope(resource: "briefing-history", data: """
{
  "items": [
    {"artifactId":"briefing-3","artifactType":"scheduled","cadence":"weekly","label":"Weekly Briefing","publicationDate":"2026-09-10T12:00:00.000Z","version":1},
    {"artifactId":"briefing-2","artifactType":"dexa_event","cadence":"event","label":"DEXA Event","publicationDate":"2026-09-05T12:00:00.000Z","version":1},
    {"artifactId":"briefing-1","artifactType":"photo_event","cadence":"event","label":"Photo Event","publicationDate":"2026-09-01T12:00:00.000Z","version":1}
  ],
  "page": {"limit": 20, "hasMore": false, "nextCursor": null}
}
""")

private let productionWeeklyBriefingJSON = productionEnvelope(resource: "briefing", data: #"{"schemaVersion":"1","artifact":{"artifactId":"weekly-1","artifactType":"scheduled","cadence":"weekly","version":3,"evidenceWindow":{"id":"week-1","startDate":"2026-09-01","endDate":"2026-09-07","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-08T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"historical":{"frozen":true,"artifactBound":true},"presentation":{"hero":{"periodLabel":"Completed week\nSep 1–7","goalLabel":"Build Lean Mass","headline":"Server-owned weekly conclusion","body":"Published narrative.","confidence":{"score":71,"band":"moderate","priorScore":68,"delta":3,"movementDirection":"increased","presentationExplanation":"Canonical weekly Confidence explanation.","movementLabel":"Confidence increased","primaryReason":"Evidence strengthened.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"goalId":"goal-canonical","phaseId":"phase-canonical","assessmentDate":"2026-09-08T14:00:00.000Z","source":"canonical_pi_snapshot"},"strategy":{"name":"Foundation","weekLabel":"Week 2","reviewLabel":"Next review"}},"energy":{"averageIntake":2500,"averageExpenditure":2625,"averageBalance":-125,"pairedDayCount":7,"eligibleDayCount":7,"narrative":"Server energy read."},"weight":{"weeklyAverage":170.2,"change":0.4,"narrative":"Server weight read."},"photos":null,"training":{"title":"Training response","conclusion":"Server training conclusion.","status":{"improving":1,"stable":2},"comparableCategoryCount":3,"insufficientCount":0,"highlights":[{"canonicalExerciseId":"bench-press","label":"Bench Press","recordType":"Volume PR","headline":"New benchmark","detail":"Server detail","delta":"+100 lb","tone":"success"}],"priorityCategories":[],"available":true},"bodyComposition":null,"coachInsight":{"biggestWin":"Strong execution.","keepBuilding":"Keep building.","watchNextWeek":"Watch recovery.","actionItems":["Repeat the plan."]}}}"#)

private let productionMidweekBriefingJSON = productionEnvelope(resource: "briefing", data: #"{"schemaVersion":"1","artifact":{"artifactId":"midweek-1","artifactType":"scheduled","cadence":"midweek","version":2,"evidenceWindow":{"id":"midweek-1","startDate":"2026-09-06","endDate":"2026-09-08","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-09T14:00:00.000Z"},"goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"historical":{"frozen":true,"artifactBound":true},"presentation":{"hero":{"verdict":"Server-owned midweek verdict","summary":"Published midweek summary."},"energyBalance":{"headline":"Near maintenance so far","averageIntake":2475,"estimatedAverageExpenditure":2510,"estimatedDailyBalanceMidpoint":-35,"comparableDays":3,"interpretation":"Three paired days are available.","chartPoints":[{"date":"2026-09-06","intake":2450,"expenditure":2500,"balance":-50,"complete":true,"label":"Sun"},{"date":"2026-09-07","intake":2500,"expenditure":2520,"balance":-20,"complete":true,"label":"Mon"},{"date":"2026-09-08","intake":2475,"expenditure":2510,"balance":-35,"complete":true,"label":"Tue"}]},"training":{"performanceHeadline":"Two lifts moved forward","sessionsCompleted":2,"interpretation":"Training remained productive.","status":{"improving":2,"stable":1},"highlights":[{"canonicalExerciseId":"bench-press","exerciseName":"Bench Press","recordType":"Reps at load","performanceValue":"8 @ 185 lb","headline":"Bench advanced","detail":"A published strength signal.","delta":"+1 rep","tone":"success"}],"watch":{"exercise":"Back Squat","status":"watch","message":"Keep the next exposure technically clean."},"prioritySignals":[{"areaId":"chest","label":"Chest","status":"improving","comparableExerciseCount":2,"tone":"success"}]},"coachTake":{"biggestTakeaway":"Hold steady.","recommendation":"Use the full week."},"goalConfidence":{"score":69,"band":"moderate","movementDirection":"held","primaryReason":"Evidence held.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"assessmentContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"assessmentTimestamp":"2026-09-09T14:00:00.000Z","source":"canonical_pi_snapshot"},"activeGoal":{"id":"goal-canonical","name":"Build Lean Mass"},"activePhase":{"id":"phase-canonical","name":"Foundation"},"prioritiesThroughSunday":["Keep the plan steady."],"weightContext":{"averageWeight":170.4,"changeFromPriorComparable":0.2,"interpretation":"Weight is stable."},"bodyComposition":{"objective":"Use the scan as the baseline.","interpretation":"Lean mass remains the anchor.","newScan":{"date":"2026-09-01","bodyFatPercentage":8.55,"leanMass":150.25,"fatMass":14.1}}}}"#)

private let build31MidweekBriefingJSON = productionEnvelope(resource: "briefing", data: #"""
{
  "schemaVersion":"1",
  "artifact":{"artifactId":"midweek-1","artifactType":"scheduled","cadence":"midweek","version":2,"evidenceWindow":{"id":"midweek-1","startDate":"2026-09-06","endDate":"2026-09-08","timeZone":"America/Los_Angeles"},"publicationDate":"2026-09-09T14:00:00.000Z"},
  "goalPhaseAttribution":{"goalId":"goal-canonical","phaseId":"phase-canonical"},
  "historical":{"frozen":true,"artifactBound":true},
  "presentation":{
    "hero":{"verdict":"Server-owned midweek verdict","summary":"Published midweek summary."},
    "energyBalance":{"headline":"Intake and expenditure are close","balanceHeadline":"99 kcal/day above","averageIntake":2954,"estimatedAverageExpenditure":2856,"estimatedDailyBalanceMidpoint":99,"comparableDays":2,"interpretation":"Monday and Tuesday were close to maintenance; Sunday is missing data.","comparisonNarrative":"The prior comparable period averaged 272 kcal/day below.","chartTitle":"Energy Balance, Sunday–Tuesday","balanceDirection":"probably_above","chartPoints":[{"date":"2026-09-06","intake":null,"expenditure":null,"balance":null,"complete":false,"label":"Sun"},{"date":"2026-09-07","intake":3200,"expenditure":2602,"balance":598,"complete":true,"label":"Mon"},{"date":"2026-09-08","intake":2708,"expenditure":3109,"balance":-401,"complete":true,"label":"Tue"}]},
    "training":{"performanceHeadline":"Two lifts moved forward","sessionsCompleted":2,"interpretation":"Training remained productive.","status":{"improving":1,"stable":0},"highlights":[],"watch":{"exercise":"Back Squat","status":"watch","message":"Keep the next exposure technically clean."},"prioritySignals":[{"areaId":"lower-body","label":"Lower Body","statusLabel":"Stable","comparableExerciseCount":0,"tone":"muted"},{"areaId":"core","label":"Core","statusLabel":"Progressing across recent sessions.","tone":"success"},{"areaId":"arms","label":"Arms","statusLabel":"Leading this week's progress.","evidenceStatus":"absent","tone":"success"}]},
    "coachTake":{"biggestTakeaway":"Hold steady.","recommendation":"Use the full week."},
    "goalConfidence":{"score":69,"band":"moderate","movementDirection":"held","presentationExplanation":"Canonical midweek Confidence explanation.","movementLabel":"No meaningful change","primaryReason":"Evidence held.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"assessmentContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"assessmentTimestamp":"2026-09-09T14:00:00.000Z","source":"canonical_pi_snapshot"},
    "activeGoal":{"id":"goal-canonical","name":"Build Lean Mass"},"activePhase":{"id":"phase-canonical","name":"Foundation"},"prioritiesThroughSunday":["Keep the plan steady."],
    "weightContext":{"averageWeight":170.4,"changeFromPriorComparable":0.2,"interpretation":"Weight is stable."},
    "bodyComposition":{"objective":"Use the scan as the baseline.","interpretation":"Lean mass remains the anchor.","newScan":{"date":"2026-09-01","bodyFatPercentage":8.55,"leanMass":150.25,"fatMass":14.1}}
  }
}
"""#)

private let productionMonthlyBriefingJSON = productionEnvelope(resource: "briefing", data: #"{"artifact":{"id":"monthly-1","artifactType":"scheduled","cadence":"monthly","version":1,"generatedAt":"2026-10-01T14:00:00.000Z","evidenceWindow":{"id":"monthly:2026-09","startDate":"2026-09-01","endDate":"2026-09-30","briefingMonth":"2026-09","deliveryDate":"2026-10-01","timeZone":"America/Los_Angeles"},"goalContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"briefing":{"monthlyPresentation":{"hero":{"period":"September 1–30 · Delivered October 1","goal":"Foundation","title":"Server-owned monthly thesis","thesis":"Published monthly narrative.","highlights":[{"label":"Training","value":"Three lifts advanced","detail":"Across the completed month","icon":"training","tone":"success"}],"confidence":{"score":73,"band":"moderate","movementDirection":"increased","primaryReason":"The month strengthened the read.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"goalId":"goal-canonical","phaseId":"phase-canonical","assessmentDate":"2026-10-01T14:00:00.000Z","source":"canonical_pi_snapshot"}},"milestone":null,"training":{"title":"Training advanced","summary":"Server training month.","stats":[{"label":"Signal","value":"Improving","detail":"Across the completed month"}],"interpretation":"Repeatable strength.","next":"Continue."},"energy":{"title":"Energy Evolution","summary":"Server energy month.","whyItMatters":"Repeatability improved.","phaseLabel":"Foundation","phaseDates":"Sep 1–30","summaryMetrics":[{"label":"Avg intake","value":2500},{"label":"Avg expenditure","value":2450},{"label":"Avg balance","value":50}],"weekly":[{"id":"week-1","label":"Sep 1–7","intake":2500,"expenditure":2450,"balance":50,"missing":false}]},"newBaseline":{"title":"Baseline held","summary":"Frozen baseline.","callout":"Use the next DEXA.","facts":[{"label":"Body fat","value":"8.5%"},{"label":"Lean mass","value":"150 lb"},{"label":"Fat mass","value":"14 lb"},{"label":"Reference date","value":"September 1, 2026"}]},"changes":{"themes":[{"label":"Training","title":"Consistency improved","body":"Sessions repeated.","tone":"training"}]},"moments":{"moments":[{"date":"2026-09-15","label":"Midmonth benchmark","body":"A canonical moment."}]},"monthAhead":{"title":"October","thesis":"Keep building.","guidance":[{"label":"Training","value":"Progress","detail":"Repeat the program.","tone":"training"}]}}}},"goals":[{"id":"goal-canonical","title":"Build Lean Mass"}]}"#)

private let productionMonthlyBriefingWithOptionalSectionsMissingJSON = productionEnvelope(resource: "briefing", data: #"{"artifact":{"id":"monthly-minimal","artifactType":"scheduled","cadence":"monthly","version":1,"generatedAt":"2026-10-01T14:00:00.000Z","evidenceWindow":{"id":"monthly:2026-09","startDate":"2026-09-01","endDate":"2026-09-30","briefingMonth":"2026-09","deliveryDate":"2026-10-01","timeZone":"America/Los_Angeles"},"goalContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"briefing":{"monthlyPresentation":{"hero":{"period":"September 1–30","goal":"Foundation","title":"A legitimately sparse month","thesis":"Only published evidence is rendered."},"milestone":null,"training":null,"energy":null,"newBaseline":null,"changes":{"themes":[]},"moments":{"moments":[]},"monthAhead":null}}},"goals":[{"id":"goal-canonical","title":"Build Lean Mass"}]}"#)

private let productionDEXAEventJSON = productionEnvelope(resource: "dexa-event", data: #"{"artifact":{"id":"dexa_event_scan-canonical","artifactType":"event","cadence":"event","generatedAt":"2026-08-15T18:00:00.000Z","evidenceWindow":{"id":"dexa:scan-canonical","startDate":"2026-08-15","endDate":"2026-08-15","timeZone":"America/Los_Angeles"},"goalContext":{"goalId":"goal-canonical","phaseId":"phase-canonical"},"briefing":{"dexaEventNarrative":{"scanId":"scan-canonical","priorScanId":"scan-prior","priorScanDate":"2026-07-31","snapshot":{"scanId":"scan-canonical","scanDate":"2026-08-15","daysBetweenScans":15,"weight":161.1,"bodyFat":7.6,"fatMass":12.8,"leanMass":148.3,"rmr":1715},"hero":{"title":"Body fat stayed controlled, but new muscle is not established yet.","body":"The August 15 scan is the reliable phase baseline.","results":[{"emoji":"💪","label":"Lean Tissue Change","value":"+0.80 lb","context":"vs prior scan"},{"emoji":"📊","label":"Body Fat","value":"7.6%","context":"controlled"},{"emoji":"⚖️","label":"DEXA Weight Change","value":"+0.90 lb","context":"vs prior scan"},{"emoji":"🔥","label":"Fat Mass Change","value":"0.0 lb","context":"vs prior scan"}],"confidence":{"score":59,"band":"moderate","movementDirection":"held","presentationExplanation":"The Aug 15 DEXA established a reliable baseline, but one scan cannot establish a lasting lean-mass response.","movementLabel":"No meaningful change","primaryReason":"The plan remains on track.","supportingReasons":[],"limitingReasons":[],"unresolvedUncertainty":[],"goalId":"goal-canonical","phaseId":"phase-canonical","capturedAt":"2026-08-15T18:00:00.000Z","source":"canonical_pi_snapshot"}},"progress":{"headline":[{"label":"Lean Tissue","previous":{"value":147.5},"current":{"value":148.3},"delta":{"value":0.8},"displayUnit":"lb","precision":2},{"label":"Body Fat","previous":7.7,"current":7.6,"delta":-0.1,"displayUnit":"%","unit":"%","precision":1}],"regionalFat":[{"region":"Trunk","previous":5.22,"current":5.18,"delta":-0.04,"precision":2}],"regionalLean":[{"region":"Arms","previous":17.31,"current":17.47,"delta":0.16,"precision":2}],"supplemental":[{"label":"RMR","previous":1702,"current":1715,"delta":13,"displayUnit":"cal/day","unit":"cal/day","precision":0}],"timelineLabel":"Since Starting the Lean Mass Phase","timeline":{"available":true,"elapsedDays":15,"scans":[{"scanId":"scan-prior","date":"2026-07-31","bodyFat":7.7},{"scanId":"scan-canonical","date":"2026-08-15","bodyFat":7.6}],"metrics":[{"label":"Lean Tissue","unit":"lb","delta":0.8,"points":[{"scanId":"scan-prior","date":"2026-07-31","value":147.5},{"scanId":"scan-canonical","date":"2026-08-15","value":148.3}]}],"summary":{"bodyFat":{"previous":7.7,"current":7.6},"fatMass":{"delta":0.0},"leanMass":{"delta":0.8}}}},"interpretation":{"opening":"The August 15 DEXA is the phase baseline.","fatLoss":"Body fat stayed controlled.","leanMass":"One scan cannot establish a lasting response.","regional":"Regional changes remain small.","supportingEvidence":"The canonical PDF anchors this read.","uncertainty":"The next DEXA is the major check."},"coachInsight":{"biggestWin":"The baseline is reliable.","protect":"Keep the plan steady.","watch":"Watch the next scan.","next":"Compare the next DEXA against August 15."}}}},"goals":[{"id":"goal-canonical","title":"Build Lean Mass"}]}"#)

private let productionPhotoEventJSON = productionEnvelope(resource: "photo-event", data: #"{"artifactId":"event_briefing_progress_photo_session-canonical","completion":null,"narrative":{"photoSessionId":"session-canonical","eventDate":"2026-09-01","completion":"3/3 complete","supportingEvidence":{"weight":"170.0 lb"},"activeViews":[{"id":"view-current","poseId":"front-relaxed","label":"Front Relaxed","headline":"Waist held steady.","supportingObservations":[],"comparisonStatus":"comparable","establishesBaseline":false,"goalRelevance":"primary","media":{"mediaId":"media-current","deliveryPath":"/api/v1/native/media/media-current"}}],"cardContent":{"hero":{"title":"Frozen Photo conclusion","body":"Historical server narrative."},"snapshot":{"title":"Snapshot","poses":["Front Relaxed"],"conditions":"Consistent conditions"},"progress":{"title":"Progress","body":"Server comparison.","comparisons":[{"id":"comparison-1","poseId":"front-relaxed","photoSessionId":"session-canonical","previousSessionId":"session-prior","previousDate":"2026-08-15","headline":"Comparison held.","previousMedia":{"mediaId":"media-prior","deliveryPath":"/api/v1/native/media/media-prior"},"media":{"mediaId":"media-current","deliveryPath":"/api/v1/native/media/media-current"}}]},"interpretation":{"title":"Interpretation","paragraphs":["Server interpretation."]},"coachInsight":{"body":"Server coaching."}},"nextMilestone":{"label":"Next photo check"}}}"#)

private let productionEvidenceReviewJSON = productionEnvelope(resource: "evidence-review", data: """
{
  "review": {
    "id": "review-1",
    "status": "pending",
    "created_at": "2026-09-08T07:00:00.000Z",
    "version": 3,
    "interpreted_evidence": {
      "evidence_objects": [
        {"id": "object-1", "evidence_type": "weight", "observed_at": "2026-09-08"},
        {"id": "object-2", "evidence_type": "photo_session", "date": "2026-09-07", "capture_metadata":{"time_of_day":"morning"}, "goal_relationship":{"status":"resolved","goal_label":"Build Lean Mass"}, "photos":[{"id":"photo-front","pose_id":"front-relaxed","label":"Front Relaxed","orientation":"front","contraction_state":"relaxed","pose_variant":"standard"},{"id":"photo-rear","pose_id":"back-flexed","label":"Rear Flexed — Double Biceps","orientation":"rear","contraction_state":"flexed","pose_variant":"double_biceps"}]},
        {"id": "object-3", "evidence_type": "training", "observed_at": "2026-09-08", "exercises": [{"name":"Bench Press","sets":[{"reps":8,"weight":185},{"reps":6,"weight":195}]}]},
        {"id": "object-4", "evidence_type": "activity", "observed_at": "2026-09-11"},
        {"id": "object-5", "evidence_type": "nutrition", "observed_at": "2026-09-11"},
        {"id": "object-6", "evidence_type": "dexa_scan", "observed_at": "2026-08-15", "measured_at": "2026-08-15", "total_mass":{"value":161.1,"unit":"lb"}, "body_fat_percentage":7.6, "fat_mass":{"value":12.8,"unit":"lb"}, "lean_mass":{"value":148.3,"unit":"lb"}, "bone_mineral_content":{"value":7.2,"unit":"lb"}, "resting_metabolic_rate":{"value":1715,"unit":"kcal/day"}, "visceral_adipose_tissue":{"mass":{"value":0.3,"unit":"lb"},"volume":{"value":8.4,"unit":"in3"}}}
      ]
    }
  },
  "presentation": {
    "summary": {"text":"6 evidence items detected","excludedText":"1 item excluded"},
    "items": [
      {"type":"weight","date":"Sep 8, 2026","title":"Weight","noun":"weight entry","sourceLabel":"Typed evidence","included":true,"metrics":[{"label":"Weight","value":"170.4 lb"}],"object":{"id":"object-1","evidence_type":"weight","observed_at":"2026-09-08"}},
      {"type":"photo_session","date":"Sep 7, 2026","title":"Progress Photos","noun":"photo session","sourceLabel":"Uploaded evidence","included":false,"metrics":[{"label":"Coverage","value":"3 poses"}],"object":{"id":"object-2","evidence_type":"photo_session","date":"2026-09-07"}},
      {"type":"training","date":"Sep 8, 2026","title":"Strength Training","noun":"training session","sourceLabel":"Imported workout","sourceFiles":["workout.png"],"included":true,"metrics":[{"label":"Exercises","value":"1"}],"strengthSetDetails":[{"name":"Bench Press","sets":["8 reps @ 185 lb","6 reps @ 195 lb"],"variantLabel":"Paused","proposedNewExercise":false}],"object":{"id":"object-3","evidence_type":"training","observed_at":"2026-09-08"}},
      {"type":"activity","date":"Sep 11, 2026","title":"Activity","noun":"activity entry","sourceLabel":"Screenshot","included":true,"metrics":[{"label":"Active calories","value":"799 cal"},{"label":"Exercise","value":"100 min"}],"object":{"id":"object-4","evidence_type":"activity","observed_at":"2026-09-11"}},
      {"type":"nutrition","date":"Sep 11, 2026","title":"Nutrition","noun":"nutrition entry","sourceLabel":"Typed evidence","typedEvidence":"Lunch: chicken bowl","included":true,"metrics":[{"label":"Calories","value":"650 cal"},{"label":"Protein","value":"52 g"}],"meals":[{"id":"meal-1","name":"Lunch","summary":"650 cal · 52 g protein","foods":[{"id":"food-1","name":"Chicken bowl","brand":null,"serving":"1 serving","calories":"650 cal"}]}],"reconciliation":"Meal totals match the daily total.","object":{"id":"object-5","evidence_type":"nutrition","observed_at":"2026-09-11"}},
      {"type":"dexa","date":"Aug 15, 2026","title":"DEXA","noun":"DEXA scan","sourceLabel":"BodySpec PDF","included":true,"metrics":[{"label":"Total mass","value":"161.1 lb"},{"label":"Body fat","value":"7.6%"},{"label":"Lean tissue","value":"148.3 lb"},{"label":"Fat tissue","value":"12.8 lb"}],"object":{"id":"object-6","evidence_type":"dexa_scan","observed_at":"2026-08-15","measured_at":"2026-08-15","total_mass":{"value":161.1,"unit":"lb"},"body_fat_percentage":7.6,"fat_mass":{"value":12.8,"unit":"lb"},"lean_mass":{"value":148.3,"unit":"lb"},"bone_mineral_content":{"value":7.2,"unit":"lb"},"resting_metabolic_rate":{"value":1715,"unit":"kcal/day"},"visceral_adipose_tissue":{"mass":{"value":0.3},"volume":{"value":8.4}}}}
    ]
  }
}
""")

private let productionDexaJSON = productionEnvelope(resource: "dexa", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All DEXA","selected":true}]},"report":{"title":"DEXA","subtitle":"BodySpec body-composition scan history.","latestScan":{"date":"2026-09-01","sourceMedia":{"mediaId":"media-dexa-2","deliveryPath":"/api/v1/native/media/media-dexa-2"}},"summary":[{"label":"Body Fat","value":"14.2%"},{"label":"Fat Mass","value":"26.8 lb"},{"label":"Lean Mass","value":"156.4 lb"},{"label":"Weight","value":"183.2 lb"},{"label":"RMR","value":"1780 kcal"}],"delta":{"bodyFat":"-0.6","fatMass":"-1.1","leanMass":"+0.8"},"chart":{"points":[{"id":"scan-1","date":"2026-08-01","value":14.8},{"id":"scan-2","date":"2026-09-01","value":14.2}]},"charts":[{"id":"totalMass","label":"Weight","suffix":" lb","points":[{"id":"scan-1","date":"2026-08-01","value":184.3},{"id":"scan-2","date":"2026-09-01","value":183.2}]},{"id":"rmr","label":"RMR","suffix":" kcal","points":[{"id":"scan-1","date":"2026-08-01","value":1775},{"id":"scan-2","date":"2026-09-01","value":1780}]}],"regionalMassCharts":[{"id":"trunk-fatMass","label":"Trunk Fat Mass","suffix":" lb","points":[{"id":"scan-1","date":"2026-08-01","value":11.4},{"id":"scan-2","date":"2026-09-01","value":10.8}]}],"latestDetails":[["VAT Mass",1.8," lb",2],["Android Fat",18.4,"%"],["A/G Ratio",0.92,"",2],["T-score",null,""]],"history":[{"id":"scan-2","date":"2026-09-01","bodyFatPercentage":14.2,"totalMass":183.2,"fatMass":26.8,"leanMass":156.4,"rmr":1780,"sourceMedia":{"mediaId":"media-dexa-2","deliveryPath":"/api/v1/native/media/media-dexa-2"}},{"id":"scan-1","date":"2026-08-01","bodyFatPercentage":14.8,"totalMass":184.3,"fatMass":27.9,"leanMass":155.6,"rmr":1775,"sourceMedia":{"mediaId":"media-dexa-1","deliveryPath":"/api/v1/native/media/media-dexa-1"}}],"dataSources":[{"name":"BodySpec PDF Import","status":"Connected"}]}}"#)

private let productionTrainingLandingJSON = productionEnvelope(resource: "training-landing", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"title":"Training","subtitle":"Training evidence","tone":"success","latestTrainingDay":{"date":"2026-09-09","label":"Sep 9","summary":"Biceps · Triceps","destination":{"id":"progress.stream","parameters":{"streamId":"training"}},"sessions":[]},"reportingLinks":[],"trainingDays":[],"currentProtocol":{"sourceOfTruth":"Server","dailyActivityTarget":"1000 cal","resistanceTraining":"3x/week","goal":"Build Lean Mass"},"relatedGoals":[],"sourceEvidence":[]}}"#)

private let productionEmptyTrainingLibraryJSON = productionEnvelope(resource: "training-library", data: #"{"timeline":{"contextId":"all","goalId":null,"startDate":null,"endDate":null,"dateRangeLabel":"All time","options":[{"id":"all","label":"All Training","selected":true}]},"report":{"canonicalExercises":[]}}"#)
    .replacingOccurrences(of: "\"report\":", with: "\"myLibraryExerciseIds\":[],\"report\":")

/// The `evidence-review-queue` resource is `coreNavigation.getLog`'s real
/// response shape (`LoggedTodayService.composeLoggedTodaySummary` +
/// `LogReadService.projectPendingReviews`) — always exactly three
/// `loggedToday` rows (training, nutrition, activity, in that order),
/// each with `{id, summary, context, recordId}`; `recordId` is the
/// canonical record's own id, not a native-shaped destination object.
private func productionWeightForLogJSON(date: String?, value: Double?) -> String {
    let current = date.map { "{\"date\":\"\($0)\",\"value\":\(value ?? 0),\"unit\":\"lb\"}" } ?? "null"
    return productionEnvelope(resource: "weight", data: #"{"current":\#(current),"recentWeighIns":[],"weeklyAverages":[],"history":[],"dexaContext":{"latest":null,"markers":[]},"page":{"limit":90,"count":0,"hasMore":false},"context":{"contextId":"all","startDate":null,"endDate":null}}"#)
}

private let productionLogJSON = productionEnvelope(resource: "evidence-review-queue", data: #"{"localDate":"2026-09-10","loggedToday":{"rows":[{"id":"training","summary":"Traditional Strength Training · 45 min","context":null,"recordId":"session-canonical"},{"id":"nutrition","summary":"4 meals · 2300 calories","context":null,"recordId":"nutrition-day-canonical"},{"id":"activity","summary":"650 active calories","context":null,"recordId":"activity-day-canonical"}]},"pendingEvidenceReviews":[{"id":"review-canonical","date":"Thursday, September 10","title":"Check-in ready to review","summary":"1 weight entry","likelyDuplicate":false}]}"#)

private let productionProfileJSON = #"{"contractVersion":"1","resource":"profile","authority":"founder-production","generatedAt":"2026-09-10T15:00:00.000Z","data":{"profile":{"user":{"id":"user-founder","displayName":"Founder","firstName":"Dustin","lastName":null,"timezone":"America/Los_Angeles"},"operatingStatus":{"goals":1},"evidenceSources":[]},"authority":{"type":"founder-production","sandbox":false},"capabilities":{"read":true,"write":true,"media":true}}}"#
private let productionContractsJSON = #"{"contractVersion":"1","apiVersion":"v1","authority":"founder-production","authentication":"founder-device-bearer","bootstrap":{"issuerEndpoint":"/api/v1/native/auth/pairing-credentials","issuerAuthentication":"founder-web-session","pairEndpoint":"/api/v1/native/auth/pair","credentialLifetimeSeconds":600,"credentialUse":"single-use","authority":"founder-production"},"sandboxAuthority":"physically-isolated-separate-contract","errorFormat":"application/problem+json; problemVersion=1","dateSemantics":"intended local dates are YYYY-MM-DD","media":{"endpoint":"/api/v1/native/media/{mediaId}","identity":"opaque canonical media ID","authorization":"bearer, owner-scoped","cache":"private, no-store"},"reads":[{"resource":"weight","endpoint":"/api/v1/native/read/weight","service":"weightSummary.getCurrentWeight","auth":"founder-device-bearer","authority":"founder-production","goalPhase":"server-resolved","media":"opaque references only","pagination":"bounded"}],"writes":[{"commandType":"weight.submit.v1","endpoint":"/api/v1/native/commands","auth":"founder-device-bearer","authority":"founder-production","idempotency":"Idempotency-Key","revision":"If-Match"}]}"#

private func productionWeightJSON(
    value: Double,
    id: String = "weight-current",
    resource: String = "weight",
    authority: String = "founder-production",
    contractVersion: String = "1"
) -> String {
    """
    {"contractVersion":"\(contractVersion)","resource":"\(resource)","authority":"\(authority)","generatedAt":"2026-09-10T15:00:00.000Z","data":{"schemaVersion":"1","context":{"contextId":"all","type":"all_history","goalId":null,"goalRevision":null,"phaseId":null,"phaseRevision":null,"startDate":null,"endDate":null},"current":{"id":"\(id)","date":"2026-09-10","value":\(value),"unit":"lb","revision":null,"label":"\(value) lb","detail":"Morning weight"},"recentWeighIns":[{"id":"\(id)","date":"2026-09-10","value":\(value),"unit":"lb","revision":null,"label":"\(value) lb","detail":"Morning weight"}],"rollingAverages":{"threeDay":{"requestedDays":3,"observationCount":1,"startDate":"2026-09-10","endDate":"2026-09-10","value":\(value),"unit":"lb"},"sevenDay":{"requestedDays":7,"observationCount":1,"startDate":"2026-09-10","endDate":"2026-09-10","value":\(value),"unit":"lb"}},"weeklyAverages":[],"extrema":{"goalRelevant":["highest","lowest"],"highest":{"id":"\(id)","date":"2026-09-10","value":\(value),"unit":"lb","revision":null},"lowest":{"id":"\(id)","date":"2026-09-10","value":\(value),"unit":"lb","revision":null}},"dexaContext":{"latest":null,"markers":[]},"history":[{"id":"\(id)","date":"2026-09-10","value":\(value),"unit":"lb","revision":null,"label":"\(value) lb","detail":"Morning weight"}],"page":{"limit":90,"count":1,"hasMore":false}}}
    """
}

private func productionCommandOutcomeJSON(result: String, outcome: String = "committed") -> String {
    """
    {"outcome":"\(outcome)","receipt":{"status":"committed","result":\(result),"operationId":null,"commandId":"01911111-1111-7111-8111-111111111111"}}
    """
}

private func multipartField(named name: String, from data: Data) -> String? {
    guard let body = String(data: data, encoding: .utf8),
          let marker = body.range(of: "name=\"\(name)\"") else { return nil }
    let suffix = body[marker.upperBound...]
    guard let valueStart = suffix.range(of: "\r\n\r\n")?.upperBound else { return nil }
    let value = suffix[valueStart...]
    guard let valueEnd = value.range(of: "\r\n")?.lowerBound else { return nil }
    return String(value[..<valueEnd])
}

private func productionProblemJSON(status: Int, code: String) -> String {
    """
    {"problemVersion":"1","type":"https://physiqueos.app/problems/test","title":"Request failed","status":\(status),"code":"\(code)","detail":null,"instance":"/api/v1/native/read/weight","requestId":"request-1","fieldErrors":[],"recovery":null}
    """
}

private func sessionJSON(access: Character, refresh: Character) -> String {
    let accessToken = String(repeating: String(access), count: 43)
    let refreshCredential = String(repeating: String(refresh), count: 43)
    return """
    {"sessionId":"session-1","deviceId":"server-device-1","accessToken":"\(accessToken)","accessExpiresAt":"2026-09-01T12:10:00.000Z","refreshCredential":"\(refreshCredential)","refreshIdleExpiresAt":"2026-10-01T12:00:00.000Z","refreshAbsoluteExpiresAt":"2026-11-30T12:00:00.000Z"}
    """
}

private final class MemoryCredentialStore: FounderRefreshCredentialStore, @unchecked Sendable {
    private let lock = NSLock()
    private var refreshCredential: String?

    init(refreshCredential: String? = nil) {
        self.refreshCredential = refreshCredential
    }

    func loadRefreshCredential() throws -> String? {
        lock.withLock { refreshCredential }
    }

    func saveRefreshCredential(_ credential: String) throws {
        lock.withLock { refreshCredential = credential }
    }

    func deleteRefreshCredential() throws {
        lock.withLock { refreshCredential = nil }
    }
}

private final class NamespacedMemoryCredentialVault: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [FounderCredentialNamespace: String] = [:]

    func store(namespace: FounderCredentialNamespace) -> FounderRefreshCredentialStore {
        Store(vault: self, namespace: namespace)
    }

    private func load(_ namespace: FounderCredentialNamespace) -> String? {
        lock.withLock { values[namespace] }
    }

    private func save(_ credential: String, namespace: FounderCredentialNamespace) {
        lock.withLock { values[namespace] = credential }
    }

    private func delete(_ namespace: FounderCredentialNamespace) {
        _ = lock.withLock { values.removeValue(forKey: namespace) }
    }

    private final class Store: FounderRefreshCredentialStore, @unchecked Sendable {
        let vault: NamespacedMemoryCredentialVault
        let namespace: FounderCredentialNamespace

        init(vault: NamespacedMemoryCredentialVault, namespace: FounderCredentialNamespace) {
            self.vault = vault
            self.namespace = namespace
        }

        func loadRefreshCredential() throws -> String? { vault.load(namespace) }
        func saveRefreshCredential(_ credential: String) throws { vault.save(credential, namespace: namespace) }
        func deleteRefreshCredential() throws { vault.delete(namespace) }
    }
}

private actor SequencedFounderTransport: FounderHTTPTransport {
    enum Outcome: @unchecked Sendable {
        case json(Int, String)
        case data(Int, mimeType: String, Data)
        case problem(Int, code: String)
        case failure(Error)
    }

    private(set) var requests: [URLRequest] = []
    private var outcomes: [Outcome]

    init(_ outcomes: [Outcome]) {
        self.outcomes = outcomes
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        guard !outcomes.isEmpty else { throw URLError(.badServerResponse) }
        let outcome = outcomes.removeFirst()
        switch outcome {
        case .json(let status, let json):
            return (Data(json.utf8), response(status: status, request: request))
        case .data(let status, let mimeType, let data):
            return (data, response(status: status, request: request, mimeType: mimeType))
        case .problem(let status, let code):
            let json = """
            {"status":\(status),"code":"\(code)","title":"Request failed","detail":null}
            """
            return (Data(json.utf8), response(status: status, request: request))
        case .failure(let error):
            throw error
        }
    }

    private func response(status: Int, request: URLRequest, mimeType: String = "application/json") -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mimeType])!
    }
}

/// Routes by resource name (the last path segment) rather than a strict
/// request order. `ProductionEvidenceAPI` composes several independent
/// reads — one of which (`ProductionTrainingAPI.fetchTrainingLanding`)
/// itself fires two concurrent sub-requests — so a FIFO-sequenced mock
/// would be flaky: which of two concurrently-issued requests lands first
/// is not guaranteed. Order-independent routing sidesteps that entirely.
private actor RoutedFounderTransport: FounderHTTPTransport {
    private(set) var requests: [URLRequest] = []
    private let pairing: String
    private var pairingServed = false
    private let responsesByResource: [String: String]

    init(pairing: String, byResource responsesByResource: [String: String]) {
        self.pairing = pairing
        self.responsesByResource = responsesByResource
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        let path = request.url?.path ?? ""
        if !pairingServed, path.hasSuffix("/auth/pair") {
            pairingServed = true
            return (Data(pairing.utf8), response(request: request))
        }
        let resource = (request.url?.lastPathComponent).flatMap { $0.isEmpty ? nil : $0 } ?? ""
        guard let json = responsesByResource[resource] else {
            throw URLError(.badServerResponse)
        }
        return (Data(json.utf8), response(request: request))
    }

    private func response(request: URLRequest) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
    }
}

private func XCTAssertThrowsErrorAsync<T>(
    _ expression: @autoclosure () async throws -> T,
    _ errorHandler: (Error) -> Void,
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        _ = try await expression()
        XCTFail("Expected an error.", file: file, line: line)
    } catch {
        errorHandler(error)
    }
}

/// Holds the first `/read/home` response until released, so a test can
/// commit a write while that read is in flight.
private actor GatedHomeTransport: FounderHTTPTransport {
    private let session: String
    private let home: String
    private var homeArrived: CheckedContinuation<Void, Never>?
    private var homeRequested = false
    private var gate: CheckedContinuation<Void, Never>?
    private var released = false

    init(session: String, home: String) {
        self.session = session
        self.home = home
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let path = request.url?.path ?? ""
        let body: String
        if path.hasSuffix("/read/home") {
            homeRequested = true
            homeArrived?.resume()
            homeArrived = nil
            if !released { await withCheckedContinuation { gate = $0 } }
            body = home
        } else {
            body = session
        }
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!)
    }

    func waitForHomeRequest() async {
        if homeRequested { return }
        await withCheckedContinuation { homeArrived = $0 }
    }

    func releaseHome() {
        released = true
        gate?.resume()
        gate = nil
    }
}


// MARK: - Daily-driver local day / timezone rollover (deterministic matrix)

/// Pins "Today" semantics without wall-clock sleeps: every case injects the
/// instant and the device zone. Founder control: 2026-09-25T05:11Z is 00:11
/// Sep 25 in Texas and 22:11 Sep 24 in the canonical America/Los_Angeles.
final class DailyDriverLocalDayTests: XCTestCase {
    private static func instant(_ value: String) -> Date { ISO8601DateFormatter().date(from: value)! }
    private static func zone(_ id: String) -> TimeZone { TimeZone(identifier: id)! }
    private static func day(_ at: String, _ zone: String) -> DailyDriverLocalDay { .resolve(at: instant(at), in: Self.zone(zone)) }

    /// The shared Home fixture has no `notificationTimeZone` (its calendar would
    /// fall back to the host's zone); these tests pin the canonical zone.
    private static func canonicalHomeJSON(confidence: Int = 71) -> String {
        productionHomeJSON(priorityID: "priority-1", goalID: "goal-server", confidence: confidence)
            .replacingOccurrences(of: #""todaysFocus":"#, with: #""notificationTimeZone":"America/Los_Angeles","todaysFocus":"#)
    }

    private static func pairedAPI(_ transport: some FounderHTTPTransport, snapshotStore: ProductionReadSnapshotStore? = nil) async throws -> ProductionNativeAPI {
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport, snapshotStore: snapshotStore)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        return api
    }

    private static func routed() -> RoutedFounderTransport {
        RoutedFounderTransport(
            pairing: sessionJSON(access: "a", refresh: "r"),
            byResource: [
                "evidence-review-queue": productionLogJSON,
                "weight": productionWeightForLogJSON(date: "2026-09-10", value: 172.9),
                "home": canonicalHomeJSON(),
            ]
        )
    }

    private static func count(_ transport: RoutedFounderTransport, _ resource: String) async -> Int {
        await transport.requests.filter { $0.url?.lastPathComponent == resource }.count
    }

    @MainActor
    private static func environment(api: ProductionNativeAPI, at: String, zone: String) async -> AppEnvironment {
        let suite = "PhysiqueOS.DailyDriverDay.\(UUID().uuidString)"
        let selection = UserDefaultsNativeAuthoritySelectionStore(defaults: UserDefaults(suiteName: suite)!, key: "authority")
        let environment = AppEnvironment(nativeAuthority: .founderProduction, authoritySelectionStore: selection, productionNativeAPI: api)
        await environment.reevaluateDailyDriverDay(at: instant(at), timeZone: Self.zone(zone))
        return environment
    }

    // MARK: pure day resolution

    func testServerUTCDateDiffersFromDeviceLocalDate() {
        XCTAssertEqual(Self.day("2026-09-25T02:00:00Z", "UTC").dateKey, "2026-09-25")
        XCTAssertEqual(Self.day("2026-09-25T02:00:00Z", "America/Los_Angeles").dateKey, "2026-09-24")
    }

    func testEastwardZoneChangeIsAnImmediateNextDay() {
        let pacific = Self.day("2026-09-25T05:11:00Z", "America/Los_Angeles")
        let texas = Self.day("2026-09-25T05:11:00Z", "America/Chicago")
        XCTAssertEqual(pacific.dateKey, "2026-09-24")
        XCTAssertEqual(texas.dateKey, "2026-09-25")
        XCTAssertNotEqual(pacific, texas)
    }

    func testWestwardZoneChangeIsAnApparentPreviousDay() {
        XCTAssertEqual(Self.day("2026-09-25T08:30:00Z", "America/Los_Angeles").dateKey, "2026-09-25")
        XCTAssertEqual(Self.day("2026-09-25T08:30:00Z", "Pacific/Honolulu").dateKey, "2026-09-24")
    }

    func testZoneChangeWithoutDateChangeStillChangesTheDayIdentity() {
        let pacific = Self.day("2026-09-25T18:00:00Z", "America/Los_Angeles")
        let mountain = Self.day("2026-09-25T18:00:00Z", "America/Denver")
        XCTAssertEqual(pacific.dateKey, mountain.dateKey)
        XCTAssertNotEqual(pacific, mountain, "zone-partitioned caches must not be reused across zones")
    }

    func testDSTSpringForwardDayIs23HoursAndRollsOverAtLocalMidnight() {
        XCTAssertEqual(Self.day("2027-03-14T07:59:00Z", "America/Los_Angeles").dateKey, "2027-03-13")
        XCTAssertEqual(Self.day("2027-03-14T08:00:00Z", "America/Los_Angeles").dateKey, "2027-03-14") // 00:00 PST
        XCTAssertEqual(Self.day("2027-03-14T09:59:00Z", "America/Los_Angeles").dateKey, "2027-03-14") // 01:59 PST
        XCTAssertEqual(Self.day("2027-03-14T10:00:00Z", "America/Los_Angeles").dateKey, "2027-03-14") // 03:00 PDT
        XCTAssertEqual(Self.day("2027-03-15T06:59:00Z", "America/Los_Angeles").dateKey, "2027-03-14") // 23:59 PDT
        XCTAssertEqual(Self.day("2027-03-15T07:00:00Z", "America/Los_Angeles").dateKey, "2027-03-15")
    }

    func testDSTFallBackDayIs25HoursAndRollsOverAtLocalMidnight() {
        XCTAssertEqual(Self.day("2026-11-01T08:30:00Z", "America/Los_Angeles").dateKey, "2026-11-01") // 01:30 PDT
        XCTAssertEqual(Self.day("2026-11-01T09:30:00Z", "America/Los_Angeles").dateKey, "2026-11-01") // 01:30 PST
        XCTAssertEqual(Self.day("2026-11-02T07:59:00Z", "America/Los_Angeles").dateKey, "2026-11-01") // 23:59 PST
        XCTAssertEqual(Self.day("2026-11-02T08:00:00Z", "America/Los_Angeles").dateKey, "2026-11-02")
    }

    func testRolloverTriggersIncludeMidnightSignificantTimeAndZoneChange() {
        XCTAssertEqual(Set(DailyDriverDayTrigger.notificationNames), [
            .NSCalendarDayChanged, UIApplication.significantTimeChangeNotification, .NSSystemTimeZoneDidChange,
        ])
    }

    func testDayScopedResourcesCoverEveryTodaySurface() {
        for resource in ["home", "evidence-review-queue", "morning-check-in", "weight", "activity", "nutrition", "training-landing", "training-logger", "priority"] {
            XCTAssertTrue(DailyDriverLocalDay.dayScopedReadResources.contains(resource), resource)
        }
        // Immutable history/briefing artifacts are not day-scoped caches.
        XCTAssertFalse(DailyDriverLocalDay.dayScopedReadResources.contains("briefing"))
    }

    // MARK: environment rollover (foreground, background -> foreground)

    @MainActor
    func testForegroundAppCrossingLocalMidnightInvalidatesTodayReads() async throws {
        let transport = Self.routed()
        let api = try await Self.pairedAPI(transport)
        let environment = await Self.environment(api: api, at: "2026-09-25T06:59:00Z", zone: "America/Los_Angeles")
        let log = ProductionLogAPI(api: api, timeZone: { Self.zone("America/Los_Angeles") })
        _ = try await log.fetchLog()
        _ = try await log.fetchLog()
        let cached = await Self.count(transport, "evidence-review-queue")
        XCTAssertEqual(cached, 1, "same day: served from cache")

        // NSCalendarDayChanged at 00:00 PDT -> recomputed from the system clock.
        let changed = await environment.reevaluateDailyDriverDay(at: Self.instant("2026-09-25T07:00:30Z"), timeZone: Self.zone("America/Los_Angeles"))
        XCTAssertTrue(changed)
        XCTAssertEqual(environment.dailyDriverDay.dateKey, "2026-09-25")
        _ = try await log.fetchLog()
        let afterMidnight = await Self.count(transport, "evidence-review-queue")
        XCTAssertEqual(afterMidnight, 2, "Logged Today must re-read after local midnight, not serve yesterday's cache")
        let weightReads = await Self.count(transport, "weight")
        XCTAssertEqual(weightReads, 2, "Weight's today row re-reads too")
    }

    @MainActor
    func testBackgroundedBeforeMidnightForegroundedAfterRollsOver() async throws {
        let transport = Self.routed()
        let api = try await Self.pairedAPI(transport)
        let environment = await Self.environment(api: api, at: "2026-09-24T22:00:00Z", zone: "America/Los_Angeles")
        XCTAssertEqual(environment.dailyDriverDay.dateKey, "2026-09-24")
        // Suspended: no notification is delivered. The activation handler
        // recomputes from the system clock hours later.
        let changed = await environment.reevaluateDailyDriverDay(at: Self.instant("2026-09-25T15:30:00Z"), timeZone: Self.zone("America/Los_Angeles"))
        XCTAssertTrue(changed)
        XCTAssertEqual(environment.dailyDriverDay.dateKey, "2026-09-25")
        // A second activation the same day is a no-op (no needless invalidation).
        let again = await environment.reevaluateDailyDriverDay(at: Self.instant("2026-09-25T16:00:00Z"), timeZone: Self.zone("America/Los_Angeles"))
        XCTAssertFalse(again)
    }

    @MainActor
    func testTimezoneChangeRecomputesTodayAndPartitionsTheLogRead() async throws {
        let transport = Self.routed()
        let api = try await Self.pairedAPI(transport)
        let environment = await Self.environment(api: api, at: "2026-09-25T05:11:00Z", zone: "America/Los_Angeles")
        XCTAssertEqual(environment.dailyDriverDay.dateKey, "2026-09-24")
        let changed = await environment.reevaluateDailyDriverDay(at: Self.instant("2026-09-25T05:11:00Z"), timeZone: Self.zone("America/Chicago"))
        XCTAssertTrue(changed)
        XCTAssertEqual(environment.dailyDriverDay, DailyDriverLocalDay(dateKey: "2026-09-25", timeZoneIdentifier: "America/Chicago"))

        _ = try await ProductionLogAPI(api: api, timeZone: { Self.zone("America/Los_Angeles") }).fetchLog()
        _ = try await ProductionLogAPI(api: api, timeZone: { Self.zone("America/Chicago") }).fetchLog()
        let zones = await transport.requests
            .filter { $0.url?.lastPathComponent == "evidence-review-queue" }
            .map { URLComponents(url: $0.url!, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "timeZone" })?.value }
        XCTAssertEqual(zones, ["America/Los_Angeles", "America/Chicago"], "Logged Today names the device zone; a new zone never reuses the old zone's cache")
    }

    // MARK: Home last-known snapshot (Performance Phase 2 c736254b)

    private static func persistHome(at: String, zone: String) async throws -> (ProductionReadSnapshotStore, MemoryCredentialStore) {
        let store = ProductionReadSnapshotStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("physiqueos-daily-driver-\(UUID().uuidString)", isDirectory: true))
        let credentials = MemoryCredentialStore()
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, canonicalHomeJSON()),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: transport, snapshotStore: store)
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        _ = try await ProductionHomeAPI(api: api, now: { instant(at) }, timeZone: { Self.zone(zone) }).fetchHome()
        return (store, credentials)
    }

    private static func lastKnown(_ store: ProductionReadSnapshotStore, _ credentials: MemoryCredentialStore, at: String, zone: String) async -> HomeLastKnownSnapshot? {
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: credentials, transport: SequencedFounderTransport([]), snapshotStore: store)
        return await ProductionHomeAPI(api: api, now: { instant(at) }, timeZone: { Self.zone(zone) }).lastKnownHome()
    }

    func testHomeSnapshotFromThePriorLocalDayIsRefused() async throws {
        // Fixture envelope generatedAt = 2026-09-10T15:00Z (08:00 PDT Sep 10).
        let (store, credentials) = try await Self.persistHome(at: "2026-09-10T16:00:00Z", zone: "America/Los_Angeles")
        let sameDay = await Self.lastKnown(store, credentials, at: "2026-09-10T23:00:00Z", zone: "America/Los_Angeles")
        XCTAssertNotNil(sameDay)
        let nextDay = await Self.lastKnown(store, credentials, at: "2026-09-11T07:30:00Z", zone: "America/Los_Angeles")
        XCTAssertNil(nextDay, "00:30 Sep 11 local: yesterday's Today's Focus must not be painted")
    }

    func testHomeSnapshotCreatedInOneZoneIsNeverPaintedInAnother() async throws {
        let (store, credentials) = try await Self.persistHome(at: "2026-09-10T16:00:00Z", zone: "America/Los_Angeles")
        // Same absolute instant, device now in Tokyo (Sep 11 local).
        let tokyo = await Self.lastKnown(store, credentials, at: "2026-09-10T16:00:00Z", zone: "Asia/Tokyo")
        XCTAssertNil(tokyo)
        // Same date, different zone: still refused (zone-partitioned key).
        let denver = await Self.lastKnown(store, credentials, at: "2026-09-10T16:00:00Z", zone: "America/Denver")
        XCTAssertNil(denver)
        let back = await Self.lastKnown(store, credentials, at: "2026-09-10T16:00:00Z", zone: "America/Los_Angeles")
        XCTAssertNotNil(back)
    }

    func testHomeSnapshotIsRefusedWhenTheCanonicalBriefingDayHasTurned() async throws {
        // Device in UTC: generatedAt 15:00Z Sep 10 and now 23:30Z Sep 10 are the
        // same device day, but in the canonical America/Los_Angeles zone
        // (notificationTimeZone) it is still Sep 10 -> accepted; at 07:30Z Sep 11
        // the device (UTC) day is Sep 11 anyway. Use Tokyo-free case: device in
        // Honolulu, now 2026-09-11T08:30Z = 22:30 HST Sep 10 (same device day as
        // 05:00 HST Sep 10) but 01:30 PDT Sep 11 on the canonical calendar.
        let (store, credentials) = try await Self.persistHome(at: "2026-09-10T16:00:00Z", zone: "Pacific/Honolulu")
        let deviceSameDayCanonicalNext = await Self.lastKnown(store, credentials, at: "2026-09-11T08:30:00Z", zone: "Pacific/Honolulu")
        XCTAssertNil(deviceSameDayCanonicalNext, "priorities were projected for the canonical Sep 10; it is Sep 11 there")
        let bothSameDay = await Self.lastKnown(store, credentials, at: "2026-09-11T05:00:00Z", zone: "Pacific/Honolulu")
        XCTAssertNotNil(bothSameDay)
    }

    @MainActor
    func testDayChangeRetiresTheLastKnownHomeSnapshot() async throws {
        let store = ProductionReadSnapshotStore(directory: FileManager.default.temporaryDirectory
            .appendingPathComponent("physiqueos-daily-driver-\(UUID().uuidString)", isDirectory: true))
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, Self.canonicalHomeJSON()),
        ])
        let api = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport, snapshotStore: store)
        // Environment first (its initial evaluation is not under test), then persist.
        let environment = await Self.environment(api: api, at: "2026-09-10T16:00:00Z", zone: "America/Los_Angeles")
        _ = try await api.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let home = ProductionHomeAPI(api: api, now: { Self.instant("2026-09-10T23:00:00Z") }, timeZone: { Self.zone("America/Los_Angeles") })
        _ = try await home.fetchHome()
        let persisted = await home.lastKnownHome()
        XCTAssertNotNil(persisted, "precondition: a same-day snapshot is persisted")
        let unchanged = await environment.reevaluateDailyDriverDay(at: Self.instant("2026-09-10T23:30:00Z"), timeZone: Self.zone("America/Los_Angeles"))
        XCTAssertFalse(unchanged)
        let stillThere = await home.lastKnownHome()
        XCTAssertNotNil(stillThere, "a same-day activation must not discard the snapshot")
        let changed = await environment.reevaluateDailyDriverDay(at: Self.instant("2026-09-11T07:30:00Z"), timeZone: Self.zone("America/Los_Angeles"))
        XCTAssertTrue(changed)
        let afterRollover = await home.lastKnownHome()
        XCTAssertNil(afterRollover, "a rollover retires the persisted snapshot, not just the in-memory cache")
    }

    func testHomeSnapshotIsRefusedWhenOnlyTheDeviceDayHasTurned() async throws {
        // Device east of the canonical zone: 15:00Z = 20:30 IST Sep 10; 19:00Z = 00:30 IST Sep 11,
        // while the canonical America/Los_Angeles day is Sep 10 at both instants.
        let (store, credentials) = try await Self.persistHome(at: "2026-09-10T16:00:00Z", zone: "Asia/Kolkata")
        let sameDeviceDay = await Self.lastKnown(store, credentials, at: "2026-09-10T18:00:00Z", zone: "Asia/Kolkata")
        XCTAssertNotNil(sameDeviceDay)
        let deviceNextDay = await Self.lastKnown(store, credentials, at: "2026-09-10T19:00:00Z", zone: "Asia/Kolkata")
        XCTAssertNil(deviceNextDay, "the Founder's own day has turned; yesterday's Home is not today's")
    }

    func testHomeNotificationCalendarStaysCanonicalWhateverTheDeviceZone() async throws {
        let transport = Self.routed()
        let api = try await Self.pairedAPI(transport)
        let home = try await ProductionHomeAPI(api: api, timeZone: { Self.zone("America/Chicago") }).fetchHome()
        XCTAssertEqual(home.notificationCalendar.timeZone.identifier, "America/Los_Angeles", "briefing/priority schedule never follows travel")
    }

    // MARK: writes keep canonical dates; only the guard's "today" follows the device

    func testPlainWeighInNamesTheDeviceZoneAndKeepsItsLocalDate() async throws {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionCommandOutcomeJSON(result: #"{"status":"committed","weightId":"weight_2026_09_25","weightRevision":1,"checkInId":null,"checkInRevision":null,"analysisId":null,"intendedDate":"2026-09-25","goalIds":[],"continuationWorkItemIds":[]}"#)),
            .json(200, productionCommandOutcomeJSON(result: #"{"status":"committed","weightId":"weight_2026_09_25","weightRevision":2,"checkInId":"c","checkInRevision":1,"analysisId":null,"intendedDate":"2026-09-25","goalIds":[],"continuationWorkItemIds":[]}"#)),
        ])
        let api = try await Self.pairedAPI(transport)
        let suite = "PhysiqueOS.DailyDriverWeight.\(UUID().uuidString)"
        let writeAPI = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: UserDefaults(suiteName: suite)!))
        _ = try await writeAPI.submitWeight(localDate: "2026-09-25", value: 175.9, expectedVersion: nil)
        _ = try await writeAPI.submitMorningCheckIn(localDate: "2026-09-25", value: 175.9, expectedVersion: "1", reconciliationSubmissions: [])
        let requests = await transport.requests
        let weight = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[1].httpBody)) as? [String: Any])["payload"] as? [String: Any]
        XCTAssertEqual(weight?["localDate"] as? String, "2026-09-25", "the record's canonical date is exactly what was chosen")
        XCTAssertEqual(weight?["timeZone"] as? String, DailyDriverLocalDay.currentDeviceTimeZone().identifier)
        let checkIn = try XCTUnwrap(try JSONSerialization.jsonObject(with: XCTUnwrap(requests[2].httpBody)) as? [String: Any])["payload"] as? [String: Any]
        XCTAssertNil(checkIn?["timeZone"], "the Morning Check-In stays on the Server-owned canonical day")
    }

    func testWeighInRetryKeepsItsKeyInOneZoneAndGetsANewKeyAfterAZoneChange() async throws {
        let outcome = productionCommandOutcomeJSON(result: #"{"status":"committed","weightId":"weight_2026_09_25","weightRevision":1,"checkInId":null,"checkInRevision":null,"analysisId":null,"intendedDate":"2026-09-25","goalIds":[],"continuationWorkItemIds":[]}"#)
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")), .json(200, outcome), .json(200, outcome), .json(200, outcome),
        ])
        let api = try await Self.pairedAPI(transport)
        let defaults = UserDefaults(suiteName: "PhysiqueOS.DailyDriverWeightKey.\(UUID().uuidString)")!
        let pacific = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults), timeZone: { Self.zone("America/Los_Angeles") })
        let texas = ProductionWeightWriteAPI(api: api, idempotencyStore: ProductionIdempotencyKeyStore(defaults: defaults), timeZone: { Self.zone("America/Chicago") })
        _ = try await pacific.submitWeight(localDate: "2026-09-25", value: 175.9, expectedVersion: nil)
        _ = try await pacific.submitWeight(localDate: "2026-09-25", value: 175.9, expectedVersion: nil)
        _ = try await texas.submitWeight(localDate: "2026-09-25", value: 175.9, expectedVersion: nil)
        let keys = await transport.requests.dropFirst().map { $0.value(forHTTPHeaderField: "Idempotency-Key") }
        XCTAssertEqual(keys[0], keys[1], "an exact retry replays under the same key")
        XCTAssertNotEqual(keys[1], keys[2], "the zone is in the Server's payload hash, so it must be in the key's signature")
    }
}


/// Active Goal V3 current state (`active_goal_current_state_v1`): decode,
/// schema gate, lenient fallback, section contract and pure formatting.
final class ActiveGoalCurrentStateTests: XCTestCase {
    private func activeGoal(_ data: String) async throws -> ActiveGoalReadModel {
        let transport = SequencedFounderTransport([
            .json(200, sessionJSON(access: "a", refresh: "r")),
            .json(200, productionGoalsJSON),
            .json(200, productionEnvelope(resource: "active-goal", data: data)),
        ])
        let native = ProductionNativeAPI(baseURL: testOrigin, credentialStore: MemoryCredentialStore(), transport: transport)
        _ = try await native.pair(pairingCredential: String(repeating: "p", count: 43), displayName: "Founder iPhone")
        let detail = try await ProductionGoalsAPI(api: native).fetchGoalDetail(goalId: "goal-canonical")
        return try XCTUnwrap(detail?.active)
    }

    func testDecodesProductionShapedCurrentStateFaithfully() async throws {
        let goal = try await activeGoal(activeGoalWithCurrentStateJSON)
        let state = try XCTUnwrap(goal.currentState)
        XCTAssertEqual(state.schemaVersion, "active_goal_current_state_v1")

        // Baseline stays baseline; the latest authoritative DEXA drives current state.
        let composition = try XCTUnwrap(state.composition)
        XCTAssertEqual(composition.baseline?.date, "2026-07-18")
        XCTAssertEqual(composition.baseline?.role, "goal_baseline")
        XCTAssertEqual(composition.baseline?.leanMassLb, 147.5)
        XCTAssertEqual(composition.current.date, "2026-09-12")
        XCTAssertEqual(composition.current.role, "latest")
        XCTAssertEqual(composition.current.leanMassLb, 153.3)
        XCTAssertEqual(composition.current.fatMassLb, 14.2)
        XCTAssertEqual(composition.current.bodyFatPercent, 8.1)
        XCTAssertEqual(composition.current.weightLb, 174.7)
        XCTAssertFalse(composition.sameAsBaseline)
        XCTAssertEqual(composition.change?.leanMassLb, 5.8)

        let progress = try XCTUnwrap(state.progress)
        XCTAssertEqual(progress.achievedAmount, 5.8)
        XCTAssertEqual(progress.remainingAmount, 4.2)
        XCTAssertEqual(progress.percentComplete, 58)

        let guardrail = try XCTUnwrap(state.guardrail)
        XCTAssertEqual(guardrail.status, "clear")
        XCTAssertEqual(guardrail.position, "within")
        XCTAssertEqual(guardrail.measurement?.value, 8.1)
        XCTAssertEqual(guardrail.interpretation, "Inside the range, so the guardrail is not limiting the build.")

        let confidence = try XCTUnwrap(state.confidence)
        XCTAssertEqual(confidence.score, 79)
        XCTAssertEqual(confidence.band, "Moderate")
        XCTAssertEqual(confidence.summary, "You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.")
        XCTAssertEqual(confidence.publishedBy?.label, "Midweek Briefing")
        XCTAssertEqual(confidence.publishedBy?.publishedOn, "2026-09-23")

        let training = try XCTUnwrap(state.training)
        XCTAssertEqual(training.state, "established")
        XCTAssertFalse(training.summary.isEmpty)
        XCTAssertFalse(training.highlights.isEmpty)

        XCTAssertEqual(state.turningPoints.map(\.date), ["2026-07-18", "2026-08-15", "2026-09-12"])
        XCTAssertTrue(state.turningPoints[1].body.contains("+0.8 lb of lean mass from the baseline"))
        XCTAssertEqual(confidence.publishedBy?.asOfLabel, "As of the Sep 23 Midweek Briefing")

        let coachTake = try XCTUnwrap(state.coachTake)
        XCTAssertEqual(coachTake.attribution, "Sep 23 Midweek Briefing · Coach's Take")
        XCTAssertEqual(coachTake.cadence, "midweek")
        XCTAssertEqual(coachTake.sections.map(\.title), ["What To Do", "What To Watch"])
        XCTAssertEqual(coachTake.sections.first?.text, "Keep executing consistently. Keep the current setup in place.")

        // Legacy fields still decode for the same payload.
        XCTAssertEqual(goal.id, "goal-canonical")
        XCTAssertEqual(goal.activePhaseId, "phase-canonical")
    }

    func testRendersTheGoalHierarchyWithoutStrategyGridOrReviewCards() async throws {
        let goal = try await activeGoal(activeGoalWithCurrentStateJSON)
        let state = try XCTUnwrap(goal.currentState)
        XCTAssertEqual(ActiveGoalCurrentStateSections.renderedSections(for: state),
                       [.hero, .journey, .bodyComposition, .guardrail, .trainingProgress, .turningPoints, .coachTake])
        XCTAssertEqual(ActiveGoalCurrentStateSections.renderedSections(for: state).last, .coachTake, "Coach's Take closes the page")
        let names = ActiveGoalCurrentStateSections.Section.allCases.map(\.rawValue).joined(separator: " ").lowercased()
        XCTAssertFalse(names.contains("strategy"))
        XCTAssertFalse(names.contains("review"))
        XCTAssertFalse(names.contains("next"))

        var sparse = state
        sparse.coachTake = nil
        sparse.training = nil
        sparse.turningPoints = []
        XCTAssertEqual(ActiveGoalCurrentStateSections.renderedSections(for: sparse),
                       [.hero, .journey, .bodyComposition, .guardrail])
    }

    func testMalformedOrUnknownCurrentStateFallsBackToTheLegacyPageInsteadOfFailing() async throws {
        let malformed = try await activeGoal(activeGoalWithMalformedCurrentStateJSON)
        XCTAssertNil(malformed.currentState)
        XCTAssertEqual(malformed.id, "goal-canonical")
        let unknown = try await activeGoal(activeGoalWithUnknownCurrentStateJSON)
        XCTAssertNil(unknown.currentState)
        XCTAssertEqual(unknown.title, "Build Lean Mass")
    }

    func testCurrentStateConfidenceIsDisplayOnlyWithThesisAndProvenance() async throws {
        let goal = try await activeGoal(activeGoalWithCurrentStateJSON)
        let state = try XCTUnwrap(goal.currentState)
        let hero = try XCTUnwrap(ActiveGoalFormat.heroConfidence(state))
        XCTAssertEqual(hero.headline, "79% · Moderate")
        XCTAssertEqual(hero.thesis, state.confidence?.summary)
        XCTAssertEqual(hero.provenance, "As of the Sep 23 Midweek Briefing", "provenance comes from publisher metadata")
        XCTAssertEqual(hero.accessibilityLabel,
                       "Confidence 79 percent, Moderate. You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues. As of the Sep 23 Midweek Briefing.")
        XCTAssertFalse(hero.accessibilityLabel.contains(".."))
        var noBand = state
        noBand.confidence?.band = nil
        XCTAssertTrue(try XCTUnwrap(ActiveGoalFormat.heroConfidence(noBand)).accessibilityLabel.hasPrefix("Confidence 79 percent. "))
        // The detailed V3 evidence stays in the contract but never reaches the page:
        // scan every string the current-state page renders.
        var rendered = [hero.headline, hero.thesis ?? "", hero.provenance ?? "", state.phase?.purpose ?? "",
                        state.phase?.measurementCadence ?? "", state.guardrail?.title ?? "", state.guardrail?.interpretation ?? "",
                        state.training?.summary ?? ""]
        rendered += state.training?.highlights.map(\.name) ?? []
        rendered += state.turningPoints.flatMap { [$0.title, $0.body] }
        rendered += state.coachTake.map { [$0.attribution] + $0.sections.flatMap { [$0.title, $0.text] } } ?? []
        let pageText = rendered.joined(separator: " ")
        let detail = try XCTUnwrap(goal.confidence.detail, "the Server still serves the detail; it is simply not presented")
        for item in detail.supportingFactors + detail.limitingFactors {
            XCTAssertFalse(pageText.contains(item), "detail item leaked onto the page: \(item)")
        }
        XCTAssertFalse(pageText.contains("days left"))
        var noScore = state
        noScore.confidence?.score = nil
        XCTAssertNil(ActiveGoalFormat.heroConfidence(noScore))
    }

    func testCurrentStateGoalHasNoConfidenceInteractionWhileTheLegacyLayoutKeepsItsSheet() throws {
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("PhysiqueOS/Presentation/Goals/GoalDetailView.swift"), encoding: .utf8)
        let start = try XCTUnwrap(source.range(of: "struct ActiveGoalCurrentStateSections: View {"))
        let end = try XCTUnwrap(source.range(of: "enum ActiveGoalFormat {"))
        let currentState = String(source[start.lowerBound..<end.lowerBound])
        for forbidden in ["onTapGesture", "chevron", ".isButton", "ConfidenceDetailSheet", ".sheet(", "onShowConfidenceDetail", "isShowingConfidenceDetail"] {
            XCTAssertFalse(currentState.contains(forbidden), "current-state Goal must not contain \(forbidden)")
        }
        // The confidence block itself: static, one element, no control of any kind.
        let blockStart = try XCTUnwrap(currentState.range(of: "if let confidence = ActiveGoalFormat.heroConfidence(state) {"))
        let blockEnd = try XCTUnwrap(currentState.range(of: ".accessibilityAddTraits(.isStaticText)"))
        let block = String(currentState[blockStart.lowerBound..<blockEnd.upperBound])
        for forbidden in ["Button", "NavigationLink", "gesture", "Gesture", "accessibilityAction", "contentShape"] {
            XCTAssertFalse(block.contains(forbidden), "confidence block must not contain \(forbidden)")
        }
        XCTAssertTrue(block.contains(".accessibilityLabel(confidence.accessibilityLabel)"))
        XCTAssertFalse(String(source[end.lowerBound...]).contains("confidenceSheet"))
        // The legacy (no currentState) layout is unchanged: its sheet remains.
        let legacyStart = try XCTUnwrap(source.range(of: "private struct ActiveGoalDetailContent: View {"))
        let legacy = String(source[legacyStart.lowerBound..<start.lowerBound])
        XCTAssertTrue(legacy.contains("ConfidenceDetailSheet(confidence: goal.confidence.value ?? 0, detail: detail)"))
        XCTAssertTrue(legacy.contains("isShowingConfidenceDetail = true"), "the legacy hero can still open its sheet")
    }

    func testOneMalformedBlockHidesOnlyItsOwnSection() async throws {
        let goal = try await activeGoal(activeGoalWithOneMalformedBlockJSON)
        let state = try XCTUnwrap(goal.currentState)
        XCTAssertNil(state.training)
        XCTAssertNotNil(state.composition)
        XCTAssertNotNil(state.coachTake)
        XCTAssertEqual(ActiveGoalCurrentStateSections.renderedSections(for: state),
                       [.hero, .journey, .bodyComposition, .guardrail, .turningPoints, .coachTake])
    }

    func testFormatsNumbersAndDatesOnly() throws {
        XCTAssertEqual(ActiveGoalFormat.shortDate("2026-09-12"), "Sep 12")
        XCTAssertEqual(ActiveGoalFormat.shortDate("2026-07-18"), "Jul 18")
        XCTAssertEqual(ActiveGoalFormat.shortDate("not-a-date"), "not-a-date")
        XCTAssertEqual(ActiveGoalFormat.value(153.3, unit: " lb"), "153.3 lb")
        XCTAssertEqual(ActiveGoalFormat.value(nil, unit: " lb"), "—")
        XCTAssertEqual(ActiveGoalFormat.signed(5.8, unit: " lb"), "+5.8 lb")
        XCTAssertEqual(ActiveGoalFormat.signed(-0.4, unit: " pts"), "−0.4 pts")
        XCTAssertEqual(ActiveGoalFormat.signed(0, unit: " lb"), "+0.0 lb")
        XCTAssertEqual(ActiveGoalFormat.confidenceHeadline(score: 79, band: "Moderate"), "79% · Moderate")
        let progress = ActiveGoalCurrentStateReadModel.Progress(status: "measured", unit: "lb", targetAmount: 10, achievedAmount: 5.8,
                                                               remainingAmount: 4.2, percentComplete: 58, targetDate: "2026-10-31")
        // Current Progress states share + remaining; the change is in the table, the target/date in the hero.
        XCTAssertEqual(ActiveGoalFormat.remainingLabel(progress), "4.2 lb to go")
        for text in [ActiveGoalFormat.remainingLabel(progress) ?? ""] {
            XCTAssertFalse(text.contains("5.8"))
            XCTAssertFalse(text.contains("10"))
            XCTAssertFalse(text.contains("Oct"))
        }
        var reached = progress
        reached.remainingAmount = 0
        XCTAssertEqual(ActiveGoalFormat.remainingLabel(reached), "Target reached")
        var awaiting = progress
        awaiting.status = "awaiting_follow_up"
        awaiting.achievedAmount = 0
        awaiting.remainingAmount = 10
        XCTAssertEqual(ActiveGoalFormat.remainingLabel(awaiting), "Awaiting the next DEXA", "never restates the hero's target")
        let guardrail = ActiveGoalCurrentStateReadModel.Guardrail(title: "Maintain approximately 8–9% body fat", label: "8–9% body fat",
            measurement: .init(value: 8.1, date: "2026-09-12", source: "DEXA"), status: "clear", position: "within", interpretation: nil)
        XCTAssertEqual(ActiveGoalFormat.guardrailState(guardrail), "8.1% · Within range", "the scan date is the table's Latest column")
        var unknownPosition = guardrail
        unknownPosition.position = "sideways"
        XCTAssertNil(ActiveGoalFormat.guardrailState(unknownPosition))
        let scan = ActiveGoalCurrentStateReadModel.Scan(role: "goal_baseline", date: "2026-07-18", leanMassLb: 147.5, fatMassLb: nil, bodyFatPercent: nil, weightLb: nil)
        XCTAssertEqual(ActiveGoalFormat.compositionCaption(.init(authority: "DEXA", baseline: scan, current: scan, sameAsBaseline: true, change: nil)), "DEXA · goal baseline")
        XCTAssertEqual(ActiveGoalFormat.compositionCaption(.init(authority: "DEXA", baseline: nil, current: scan, sameAsBaseline: false, change: nil)), "DEXA · latest scan")
        let highlight = ActiveGoalCurrentStateReadModel.TrainingHighlight(name: "Hack Squats", region: "lower body", percentChange: 48.1, personalRecord: true)
        XCTAssertEqual(ActiveGoalFormat.highlightAccessibilityLabel(highlight), "Hack Squats, +48.1%, personal record")
        let training = ActiveGoalCurrentStateReadModel.Training(state: "forming", periodStart: "2026-08-15", periodEnd: "2026-08-16", trainingDayCount: 1,
            comparableMovementCount: 1, improvingCount: 1, regressingCount: 0, regions: [], highlights: [], summary: "s")
        XCTAssertEqual(ActiveGoalFormat.trainingEyebrow(training), "Since Aug 15 · 1 training day")
    }
}

private let activeGoalWithCurrentStateJSON = #"{"goalId":"goal-canonical","phaseId":"phase-canonical","confidence":{"status":"canonical_v3","score":79,"band":"Moderate","movement":"held","priorScore":79,"delta":0,"evidenceCutoff":"2026-09-23T06:59:59.999Z","publicationTimestamp":"2026-09-23T10:01:29.328Z","summary":"You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.","explanation":{"qualitativeLevel":"Moderate","summary":"You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.","supportingFactors":["You added 5.0 lb of lean mass since August 15.","Body fat stayed controlled at 8.1%.","4.2 lb remain with 49 days left."],"limitingFactors":["One excellent response does not guarantee the same result until the next DEXA."],"movementFactors":[],"clarifyingFactors":[],"uncertaintyStatement":"As of the Sep 23 Midweek Briefing."}},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Build 10 lb of lean mass by October 31, 2026"},"journey":[{"name":"Establish Maintenance","number":1,"status":"Completed","dates":"Started Jul 19 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Foundation","number":2,"status":"Active","dates":"Started Sep 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":32}],"currentPhase":{"id":"phase-canonical","goalId":"goal-canonical","title":"Foundation","purpose":"Build deliberately","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain 8–9% body fat","scope":"Every phase","body":"DEXA is authoritative","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[{"title":"Goal journey activated","body":"The journey began.","date":"2026-07-19"}],"strategy":[{"label":"Energy","active":true}],"currentState":{"schemaVersion":"active_goal_current_state_v1","asOf":"2026-09-25","composition":{"authority":"DEXA","baseline":{"role":"goal_baseline","scanId":"dexa_fixture_2026-07-18","date":"2026-07-18","leanMassLb":147.5,"fatMassLb":12.8,"bodyFatPercent":7.7,"weightLb":167.4},"current":{"role":"latest","scanId":"dexa_fixture_2026-09-12","date":"2026-09-12","leanMassLb":153.3,"fatMassLb":14.2,"bodyFatPercent":8.1,"weightLb":174.7},"sameAsBaseline":false,"change":{"leanMassLb":5.8,"fatMassLb":1.4,"bodyFatPoints":0.4,"weightLb":7.3}},"progress":{"metric":"lean_mass","unit":"lb","targetAmount":10,"targetDate":"2026-10-31","status":"measured","baselineDate":"2026-07-18","currentDate":"2026-09-12","achievedAmount":5.8,"remainingAmount":4.2,"rawPercent":58,"percentComplete":58},"guardrail":{"title":"Maintain approximately 8–9% body fat","label":"8–9% body fat","range":{"min":8,"max":9,"unit":"%"},"measurement":{"value":8.1,"date":"2026-09-12","source":"DEXA"},"status":"clear","position":"within","deviation":0,"interpretation":"Inside the range, so the guardrail is not limiting the build."},"phase":{"id":"phase-canonical","name":"Lean Mass Build","purpose":"Build meaningful lean mass from the newly established maintenance baseline while protecting body composition.","startDate":"2026-08-15","measurementCadence":"Measured by monthly DEXA"},"confidence":{"status":"canonical_v3","modelVersion":"canonical_confidence_assessment_v3","score":79,"band":"Moderate","movement":"held","delta":0,"priorScore":79,"assessmentId":"confidence_assessment_v3|fixture","summary":"You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.","summarySource":"narrative_v3.why_confidence","publishedBy":{"publisherType":"midweek_briefing","label":"Midweek Briefing","artifactId":"midweek_briefing_fixture_20260920_20260922","publishedAt":"2026-09-23T10:01:29.328Z","publishedOn":"2026-09-23","asOfLabel":"As of the Sep 23 Midweek Briefing"},"detail":{"whatSupportsIt":["You added 5.0 lb of lean mass since August 15.","Body fat stayed controlled at 8.1%.","4.2 lb remain with 49 days left."],"whatIsHoldingItBack":["One excellent response does not guarantee the same result until the next DEXA."],"whatCouldRaiseIt":["Consistent execution can strengthen confidence before the next DEXA.","The next DEXA showing that the progress continues.","Reaching the goal."],"whatCouldLowerIt":["Meaningful missed work or persistent departures from the plan.","Body fat moving outside the intended range of 8–9.","Training performance materially declining.","Progress stalling or a new result contradicting the current outlook.","Falling far enough behind that there is no longer enough time to finish the goal."],"assumptions":["The outlook depends on appropriate continued execution.","The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly.","Consistent execution supports the outlook, but any progress since the last outcome check is still unconfirmed.","This is a coaching outlook, not a measured statistical probability."]}},"training":{"state":"established","periodStart":"2026-08-15","periodEnd":"2026-09-25","sessionCount":39,"trainingDayCount":38,"comparableMovementCount":23,"improvingCount":15,"steadyCount":7,"regressingCount":1,"regions":[{"region":"lower body","status":"improving","movementCount":10,"improvingCount":8,"regressingCount":1},{"region":"upper body","status":"improving","movementCount":7,"improvingCount":4,"regressingCount":0},{"region":"arms","status":"improving","movementCount":4,"improvingCount":2,"regressingCount":0},{"region":"core","status":"steady","movementCount":1,"improvingCount":0,"regressingCount":0}],"highlights":[{"name":"Leg Press High And Narrow Feet","region":"lower body","status":"improving","percentChange":67.2,"currentVolumeLoad":13545,"previousVolumeLoad":8100,"personalRecord":true},{"name":"Leg Extensions","region":"lower body","status":"improving","percentChange":50,"currentVolumeLoad":5400,"previousVolumeLoad":3600,"personalRecord":true},{"name":"Hack Squats","region":"lower body","status":"improving","percentChange":48.1,"currentVolumeLoad":6000,"previousVolumeLoad":4050,"personalRecord":true}],"regressions":[{"name":"Single-Leg Leg Press","region":"lower body","percentChange":-16.5}],"summary":"15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down."},"turningPoints":[{"id":"dexa_baseline|2026-07-18","kind":"dexa_baseline","date":"2026-07-18","title":"Goal baseline DEXA","body":"The starting point every later scan is measured against."},{"id":"phase_transition|phase-canonical|2026-08-15","kind":"phase_transition","date":"2026-08-15","title":"Establish Maintenance completed · Lean Mass Build began","body":"Establish Maintenance was completed and Lean Mass Build began. The Aug 15 DEXA showed +0.8 lb of lean mass from the baseline."},{"id":"dexa_milestone|2026-09-12","kind":"dexa_milestone","date":"2026-09-12","title":"Past halfway to the lean-mass target","body":"Lean mass rose 5.0 lb in the month since the Aug 15 scan, and body fat moved into the guardrail range."}],"coachTake":{"artifactId":"midweek_briefing_fixture_20260920_20260922","cadence":"midweek","artifactType":"scheduled","briefingLabel":"Midweek Briefing","publishedAt":"2026-09-23T10:01:29.328Z","publishedOn":"2026-09-23","evidenceWindow":{"startDate":"2026-09-20","endDate":"2026-09-22"},"attribution":"Sep 23 Midweek Briefing · Coach's Take","sections":[{"kind":"action","title":"What To Do","text":"Keep executing consistently. Keep the current setup in place."},{"kind":"watch","title":"What To Watch","text":"Treat the calorie estimate as directional: calorie totals come from logged meals rather than a confirmed full-day total, active calories are a wearable estimate, and food and activity were both recorded on 2 of 3 days. Keep calorie targets where they are unless something more than the estimate calls for a change. The next DEXA will show whether this kind of progress continues while body fat stays in a good place."}]}}}"#
private let activeGoalWithMalformedCurrentStateJSON = #"{"goalId":"goal-canonical","phaseId":"phase-canonical","confidence":{"score":74,"band":"Moderate","summary":"Server confidence","movement":"increased","priorScore":68,"delta":6,"explanation":{"qualitativeLevel":"Moderate","summary":"Training and adherence have both been strong recently.","supportingFactors":["Training has been consistently strong for the last few weeks."],"limitingFactors":["Calories still need more consistency before we can tell whether this intake is right."],"movementFactors":["Confidence increased because training consistency improved."],"clarifyingFactors":["Another body-composition check will confirm the trend."],"uncertaintyStatement":""}},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Establish Maintenance","number":1,"status":"Completed","dates":"Started Jul 19 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Foundation","number":2,"status":"Active","dates":"Started Sep 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":32}],"currentPhase":{"id":"phase-canonical","goalId":"goal-canonical","title":"Foundation","purpose":"Build deliberately","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain 8–9% body fat","scope":"Every phase","body":"DEXA is authoritative","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[{"title":"Goal journey activated","body":"The journey began.","date":"2026-07-19"}],"strategy":[{"label":"Energy","active":true}],"currentState":{"composition":{"authority":"DEXA"}}}"#
private let activeGoalWithUnknownCurrentStateJSON = #"{"goalId":"goal-canonical","phaseId":"phase-canonical","confidence":{"score":74,"band":"Moderate","summary":"Server confidence","movement":"increased","priorScore":68,"delta":6,"explanation":{"qualitativeLevel":"Moderate","summary":"Training and adherence have both been strong recently.","supportingFactors":["Training has been consistently strong for the last few weeks."],"limitingFactors":["Calories still need more consistency before we can tell whether this intake is right."],"movementFactors":["Confidence increased because training consistency improved."],"clarifyingFactors":["Another body-composition check will confirm the trend."],"uncertaintyStatement":""}},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Establish Maintenance","number":1,"status":"Completed","dates":"Started Jul 19 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Foundation","number":2,"status":"Active","dates":"Started Sep 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":32}],"currentPhase":{"id":"phase-canonical","goalId":"goal-canonical","title":"Foundation","purpose":"Build deliberately","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain 8–9% body fat","scope":"Every phase","body":"DEXA is authoritative","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[{"title":"Goal journey activated","body":"The journey began.","date":"2026-07-19"}],"strategy":[{"label":"Energy","active":true}],"currentState":{"schemaVersion":"active_goal_current_state_v2","asOf":"2026-09-25","composition":{"authority":"DEXA","baseline":{"role":"goal_baseline","scanId":"dexa_fixture_2026-07-18","date":"2026-07-18","leanMassLb":147.5,"fatMassLb":12.8,"bodyFatPercent":7.7,"weightLb":167.4},"current":{"role":"latest","scanId":"dexa_fixture_2026-09-12","date":"2026-09-12","leanMassLb":153.3,"fatMassLb":14.2,"bodyFatPercent":8.1,"weightLb":174.7},"sameAsBaseline":false,"change":{"leanMassLb":5.8,"fatMassLb":1.4,"bodyFatPoints":0.4,"weightLb":7.3}},"progress":{"metric":"lean_mass","unit":"lb","targetAmount":10,"targetDate":"2026-10-31","status":"measured","baselineDate":"2026-07-18","currentDate":"2026-09-12","achievedAmount":5.8,"remainingAmount":4.2,"rawPercent":58,"percentComplete":58},"guardrail":{"title":"Maintain approximately 8–9% body fat","label":"8–9% body fat","range":{"min":8,"max":9,"unit":"%"},"measurement":{"value":8.1,"date":"2026-09-12","source":"DEXA"},"status":"clear","position":"within","deviation":0,"interpretation":"Inside the range, so the guardrail is not limiting the build."},"phase":{"id":"phase-canonical","name":"Lean Mass Build","purpose":"Build meaningful lean mass from the newly established maintenance baseline while protecting body composition.","startDate":"2026-08-15","measurementCadence":"Measured by monthly DEXA"},"confidence":{"status":"canonical_v3","modelVersion":"canonical_confidence_assessment_v3","score":79,"band":"Moderate","movement":"held","delta":0,"priorScore":79,"assessmentId":"confidence_assessment_v3|fixture","summary":"You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.","summarySource":"narrative_v3.why_confidence","publishedBy":{"publisherType":"midweek_briefing","label":"Midweek Briefing","artifactId":"midweek_briefing_fixture_20260920_20260922","publishedAt":"2026-09-23T10:01:29.328Z","publishedOn":"2026-09-23","asOfLabel":"As of the Sep 23 Midweek Briefing"},"detail":{"whatSupportsIt":["You added 5.0 lb of lean mass since August 15.","Body fat stayed controlled at 8.1%.","4.2 lb remain with 49 days left."],"whatIsHoldingItBack":["One excellent response does not guarantee the same result until the next DEXA."],"whatCouldRaiseIt":["Consistent execution can strengthen confidence before the next DEXA.","The next DEXA showing that the progress continues.","Reaching the goal."],"whatCouldLowerIt":["Meaningful missed work or persistent departures from the plan.","Body fat moving outside the intended range of 8–9.","Training performance materially declining.","Progress stalling or a new result contradicting the current outlook.","Falling far enough behind that there is no longer enough time to finish the goal."],"assumptions":["The outlook depends on appropriate continued execution.","The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly.","Consistent execution supports the outlook, but any progress since the last outcome check is still unconfirmed.","This is a coaching outlook, not a measured statistical probability."]}},"training":{"state":"established","periodStart":"2026-08-15","periodEnd":"2026-09-25","sessionCount":39,"trainingDayCount":38,"comparableMovementCount":23,"improvingCount":15,"steadyCount":7,"regressingCount":1,"regions":[{"region":"lower body","status":"improving","movementCount":10,"improvingCount":8,"regressingCount":1},{"region":"upper body","status":"improving","movementCount":7,"improvingCount":4,"regressingCount":0},{"region":"arms","status":"improving","movementCount":4,"improvingCount":2,"regressingCount":0},{"region":"core","status":"steady","movementCount":1,"improvingCount":0,"regressingCount":0}],"highlights":[{"name":"Leg Press High And Narrow Feet","region":"lower body","status":"improving","percentChange":67.2,"currentVolumeLoad":13545,"previousVolumeLoad":8100,"personalRecord":true},{"name":"Leg Extensions","region":"lower body","status":"improving","percentChange":50,"currentVolumeLoad":5400,"previousVolumeLoad":3600,"personalRecord":true},{"name":"Hack Squats","region":"lower body","status":"improving","percentChange":48.1,"currentVolumeLoad":6000,"previousVolumeLoad":4050,"personalRecord":true}],"regressions":[{"name":"Single-Leg Leg Press","region":"lower body","percentChange":-16.5}],"summary":"15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down."},"turningPoints":[{"id":"dexa_baseline|2026-07-18","kind":"dexa_baseline","date":"2026-07-18","title":"Goal baseline DEXA","body":"The starting point every later scan is measured against."},{"id":"phase_transition|phase-canonical|2026-08-15","kind":"phase_transition","date":"2026-08-15","title":"Establish Maintenance completed · Lean Mass Build began","body":"Establish Maintenance was completed and Lean Mass Build began. The Aug 15 DEXA showed +0.8 lb of lean mass from the baseline."},{"id":"dexa_milestone|2026-09-12","kind":"dexa_milestone","date":"2026-09-12","title":"Past halfway to the lean-mass target","body":"Lean mass rose 5.0 lb in the month since the Aug 15 scan, and body fat moved into the guardrail range."}],"coachTake":{"artifactId":"midweek_briefing_fixture_20260920_20260922","cadence":"midweek","artifactType":"scheduled","briefingLabel":"Midweek Briefing","publishedAt":"2026-09-23T10:01:29.328Z","publishedOn":"2026-09-23","evidenceWindow":{"startDate":"2026-09-20","endDate":"2026-09-22"},"attribution":"Sep 23 Midweek Briefing · Coach's Take","sections":[{"kind":"action","title":"What To Do","text":"Keep executing consistently. Keep the current setup in place."},{"kind":"watch","title":"What To Watch","text":"Treat the calorie estimate as directional: calorie totals come from logged meals rather than a confirmed full-day total, active calories are a wearable estimate, and food and activity were both recorded on 2 of 3 days. Keep calorie targets where they are unless something more than the estimate calls for a change. The next DEXA will show whether this kind of progress continues while body fat stays in a good place."}]}}}"#
private let activeGoalWithOneMalformedBlockJSON = #"{"goalId":"goal-canonical","phaseId":"phase-canonical","confidence":{"score":74,"band":"Moderate","summary":"Server confidence","movement":"increased","priorScore":68,"delta":6,"explanation":{"qualitativeLevel":"Moderate","summary":"Training and adherence have both been strong recently.","supportingFactors":["Training has been consistently strong for the last few weeks."],"limitingFactors":["Calories still need more consistency before we can tell whether this intake is right."],"movementFactors":["Confidence increased because training consistency improved."],"clarifyingFactors":["Another body-composition check will confirm the trend."],"uncertaintyStatement":""}},"hero":{"title":"Build Lean Mass","status":"Active Goal","destination":"Add 10 lb lean mass by December 2026"},"journey":[{"name":"Establish Maintenance","number":1,"status":"Completed","dates":"Started Jul 19 · Completed","progress":"Completed","support":null,"percentage":100},{"name":"Foundation","number":2,"status":"Active","dates":"Started Sep 1 · Evidence-led review","progress":"In progress","support":"Server support","percentage":32}],"currentPhase":{"id":"phase-canonical","goalId":"goal-canonical","title":"Foundation","purpose":"Build deliberately","progress":"In progress","review":"Evidence-led","evidence":"Server evidence","readiness":"Server readiness"},"readiness":[],"guardrail":{"title":"Maintain 8–9% body fat","scope":"Every phase","body":"DEXA is authoritative","observation":null},"evidence":{"goalBaseline":null,"phaseStart":null,"support":"Server support"},"turningPoints":[{"title":"Goal journey activated","body":"The journey began.","date":"2026-07-19"}],"strategy":[{"label":"Energy","active":true}],"currentState":{"schemaVersion":"active_goal_current_state_v1","asOf":"2026-09-25","composition":{"authority":"DEXA","baseline":{"role":"goal_baseline","scanId":"dexa_fixture_2026-07-18","date":"2026-07-18","leanMassLb":147.5,"fatMassLb":12.8,"bodyFatPercent":7.7,"weightLb":167.4},"current":{"role":"latest","scanId":"dexa_fixture_2026-09-12","date":"2026-09-12","leanMassLb":153.3,"fatMassLb":14.2,"bodyFatPercent":8.1,"weightLb":174.7},"sameAsBaseline":false,"change":{"leanMassLb":5.8,"fatMassLb":1.4,"bodyFatPoints":0.4,"weightLb":7.3}},"progress":{"metric":"lean_mass","unit":"lb","targetAmount":10,"targetDate":"2026-10-31","status":"measured","baselineDate":"2026-07-18","currentDate":"2026-09-12","achievedAmount":5.8,"remainingAmount":4.2,"rawPercent":58,"percentComplete":58},"guardrail":{"title":"Maintain approximately 8–9% body fat","label":"8–9% body fat","range":{"min":8,"max":9,"unit":"%"},"measurement":{"value":8.1,"date":"2026-09-12","source":"DEXA"},"status":"clear","position":"within","deviation":0,"interpretation":"Inside the range, so the guardrail is not limiting the build."},"phase":{"id":"phase-canonical","name":"Lean Mass Build","purpose":"Build meaningful lean mass from the newly established maintenance baseline while protecting body composition.","startDate":"2026-08-15","measurementCadence":"Measured by monthly DEXA"},"confidence":{"status":"canonical_v3","modelVersion":"canonical_confidence_assessment_v3","score":79,"band":"Moderate","movement":"held","delta":0,"priorScore":79,"assessmentId":"confidence_assessment_v3|fixture","summary":"You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.","summarySource":"narrative_v3.why_confidence","publishedBy":{"publisherType":"midweek_briefing","label":"Midweek Briefing","artifactId":"midweek_briefing_fixture_20260920_20260922","publishedAt":"2026-09-23T10:01:29.328Z","publishedOn":"2026-09-23","asOfLabel":"As of the Sep 23 Midweek Briefing"},"detail":{"whatSupportsIt":["You added 5.0 lb of lean mass since August 15.","Body fat stayed controlled at 8.1%.","4.2 lb remain with 49 days left."],"whatIsHoldingItBack":["One excellent response does not guarantee the same result until the next DEXA."],"whatCouldRaiseIt":["Consistent execution can strengthen confidence before the next DEXA.","The next DEXA showing that the progress continues.","Reaching the goal."],"whatCouldLowerIt":["Meaningful missed work or persistent departures from the plan.","Body fat moving outside the intended range of 8–9.","Training performance materially declining.","Progress stalling or a new result contradicting the current outlook.","Falling far enough behind that there is no longer enough time to finish the goal."],"assumptions":["The outlook depends on appropriate continued execution.","The forecast uses a reduced recent rate, not an assumption that the latest result repeats exactly.","Consistent execution supports the outlook, but any progress since the last outcome check is still unconfirmed.","This is a coaching outlook, not a measured statistical probability."]}},"training":{"state":"established"},"turningPoints":[{"id":"dexa_baseline|2026-07-18","kind":"dexa_baseline","date":"2026-07-18","title":"Goal baseline DEXA","body":"The starting point every later scan is measured against."},{"id":"phase_transition|phase-canonical|2026-08-15","kind":"phase_transition","date":"2026-08-15","title":"Establish Maintenance completed · Lean Mass Build began","body":"Establish Maintenance was completed and Lean Mass Build began. The Aug 15 DEXA showed +0.8 lb of lean mass from the baseline."},{"id":"dexa_milestone|2026-09-12","kind":"dexa_milestone","date":"2026-09-12","title":"Past halfway to the lean-mass target","body":"Lean mass rose 5.0 lb in the month since the Aug 15 scan, and body fat moved into the guardrail range."}],"coachTake":{"artifactId":"midweek_briefing_fixture_20260920_20260922","cadence":"midweek","artifactType":"scheduled","briefingLabel":"Midweek Briefing","publishedAt":"2026-09-23T10:01:29.328Z","publishedOn":"2026-09-23","evidenceWindow":{"startDate":"2026-09-20","endDate":"2026-09-22"},"attribution":"Sep 23 Midweek Briefing · Coach's Take","sections":[{"kind":"action","title":"What To Do","text":"Keep executing consistently. Keep the current setup in place."},{"kind":"watch","title":"What To Watch","text":"Treat the calorie estimate as directional: calorie totals come from logged meals rather than a confirmed full-day total, active calories are a wearable estimate, and food and activity were both recorded on 2 of 3 days. Keep calorie targets where they are unless something more than the estimate calls for a change. The next DEXA will show whether this kind of progress continues while body fat stays in a good place."}]}}}"#
