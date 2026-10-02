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
            schemaVersion: 1,
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
            schemaVersion: 1,
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
}
