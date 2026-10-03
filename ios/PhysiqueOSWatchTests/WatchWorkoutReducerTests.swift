import XCTest
@testable import PhysiqueOSWatch

final class WatchWorkoutReducerTests: XCTestCase {
    @MainActor
    func testCallbackBridgeRelaysReplyFromBackgroundQueue() async {
        let relayed = expectation(description: "reply relayed to MainActor")
        let expected = Data([0x50, 0x4f, 0x53])
        let handler = WatchWorkoutCallbackBridge.reply { data in
            XCTAssertEqual(data, expected)
            relayed.fulfill()
        }

        await Task.detached { handler(expected) }.value
        await fulfillment(of: [relayed], timeout: 1)
    }

    @MainActor
    func testCallbackBridgeRelaysFailureFromBackgroundQueue() async {
        let relayed = expectation(description: "failure relayed to MainActor")
        let handler = WatchWorkoutCallbackBridge.failure {
            relayed.fulfill()
        }

        await Task.detached { handler(NSError(domain: "test", code: 1)) }.value
        await fulfillment(of: [relayed], timeout: 1)
    }

    func testGateRequiresMatchingAcknowledgement() {
        let command = WatchWorkoutCommand(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "command",
            mutationId: "mutation",
            kind: .pause,
            sessionId: "session",
            expectedRevision: 9,
            exerciseId: nil,
            setId: nil,
            issuedAt: .init(timeIntervalSince1970: 1)
        )
        var gate = WatchWorkoutCommandDeliveryGate()
        XCTAssertTrue(gate.begin(command))
        XCTAssertFalse(gate.acknowledge(.init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: "late-command",
            mutationId: "late-mutation",
            status: .applied,
            reason: nil,
            acknowledgedRevision: 10,
            projection: nil
        )))
        XCTAssertEqual(gate.pending, command)
    }

    func testTotalCaloriesRequiresBothComponents() {
        var metrics = WatchWorkoutMetrics(elapsedActiveSeconds: 60)
        metrics.activeCalories = 80
        XCTAssertNil(metrics.totalCalories)
        metrics.basalCalories = 20
        XCTAssertEqual(metrics.totalCalories, 100)
    }

    @MainActor
    func testCancelConfirmationCanBeDismissedWithoutChangingWorkout() throws {
        let store = WatchWorkoutStore(session: nil)
        let active = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("normal")?.projection)
        store.apply(active)
        store.showControls()

        store.requestCancelWorkout()
        XCTAssertTrue(store.cancelConfirmationVisible)
        store.dismissCancelWorkout()

        XCTAssertFalse(store.cancelConfirmationVisible)
        XCTAssertEqual(store.projection?.sessionId, active.sessionId)
        XCTAssertEqual(store.page, .controls)
    }

    @MainActor
    func testTerminalCancellationClearsExecutionControlsMetricsAndPendingPresentation() async throws {
        let store = WatchWorkoutStore(session: nil)
        let active = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("paused")?.projection)
        store.apply(active)
        store.showControls()
        store.requestCancelWorkout()
        store.health.installDebugMetrics(
            heartRate: 68, activeCalories: 21, basalCalories: 9, averageHeartRate: 70
        )

        store.apply(.terminal(
            sessionId: active.sessionId,
            revision: active.revision,
            phase: .cancelled
        ))
        await Task.yield()

        XCTAssertNil(store.projection)
        XCTAssertEqual(store.page, .workout)
        XCTAssertFalse(store.cancelConfirmationVisible)
        XCTAssertNil(store.notice)
        XCTAssertNil(store.health.currentHeartRateBPM)
        XCTAssertNil(store.health.activeCalories)
        XCTAssertNil(store.health.basalCalories)
        XCTAssertEqual(store.health.lifecycle, .cancelled)

        var late = active
        late.revision += 1
        store.apply(late)
        XCTAssertNil(store.projection, "A delayed pre-cancel projection cannot resurrect the workout.")

        var prepared = try XCTUnwrap(WatchWorkoutPreviewFixtures.make("start")?.projection)
        prepared.sessionId = "next-prepared-session"
        store.apply(prepared)
        XCTAssertEqual(store.projection?.sessionId, "next-prepared-session")
        XCTAssertEqual(store.projection?.phase, .prepared)
    }

    @MainActor
    func testHealthKitCancelPolicyDiscardsInsteadOfSavingWorkout() {
        XCTAssertEqual(WatchWorkoutHealthController.cancellationDisposition, .discard)
    }
}
