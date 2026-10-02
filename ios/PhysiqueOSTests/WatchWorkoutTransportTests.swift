import XCTest
@testable import PhysiqueOS

final class WatchWorkoutTransportTests: XCTestCase {
    private func command(id: String, revision: Int = 4) -> WatchWorkoutCommand {
        .init(
            schemaVersion: WatchWorkoutContract.schemaVersion,
            commandId: id,
            mutationId: id,
            kind: .completeSet,
            sessionId: "session",
            expectedRevision: revision,
            exerciseId: "exercise",
            setId: "set",
            issuedAt: Date(timeIntervalSince1970: 10)
        )
    }

    func testOneMutationInFlightAndRetryKeepsIdentity() {
        var gate = WatchWorkoutCommandDeliveryGate()
        let first = command(id: "mutation-1")
        XCTAssertTrue(gate.begin(first))
        XCTAssertFalse(gate.begin(command(id: "mutation-2")))
        XCTAssertEqual(gate.pending, first)
        XCTAssertEqual(gate.pending?.mutationId, "mutation-1")
    }

    func testOutOfOrderAcknowledgementCannotClearNewerPendingMutation() {
        var gate = WatchWorkoutCommandDeliveryGate()
        XCTAssertTrue(gate.begin(command(id: "new")))
        let stale = WatchWorkoutAcknowledgement(
            schemaVersion: 1,
            commandId: "old",
            mutationId: "old",
            status: .applied,
            reason: nil,
            acknowledgedRevision: 3,
            projection: nil
        )
        XCTAssertFalse(gate.acknowledge(stale))
        XCTAssertEqual(gate.pending?.commandId, "new")
    }

    func testMatchingStaleAcknowledgementClearsPendingForAuthoritativeRefresh() throws {
        var gate = WatchWorkoutCommandDeliveryGate()
        let pending = command(id: "same")
        XCTAssertTrue(gate.begin(pending))
        let acknowledgement = WatchWorkoutAcknowledgement(
            schemaVersion: 1,
            commandId: "same",
            mutationId: "same",
            status: .stale,
            reason: .staleRevision,
            acknowledgedRevision: 8,
            projection: nil
        )
        let encoded = try WatchWorkoutWireCodec.encode(acknowledgement)
        let decoded = try WatchWorkoutWireCodec.decode(WatchWorkoutAcknowledgement.self, from: encoded)
        XCTAssertTrue(gate.acknowledge(decoded))
        XCTAssertNil(gate.pending)
    }
}
