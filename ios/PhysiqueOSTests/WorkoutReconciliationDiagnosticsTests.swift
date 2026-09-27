import Foundation
import XCTest
@testable import PhysiqueOS

final class WorkoutReconciliationDiagnosticsTests: XCTestCase {
    private func freshDefaults(_ name: String) -> UserDefaults {
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @MainActor
    func testRecordsAndReadsBackEventsNewestFirst() throws {
        let defaults = freshDefaults("WorkoutReconciliationDiagnosticsTests.order")
        WorkoutReconciliationDiagnostics.record(.init(capturedAt: Date(timeIntervalSince1970: 1), stage: "guard_check_passed", reviewId: "r1", action: "confirm"), defaults: defaults)
        WorkoutReconciliationDiagnostics.record(.init(capturedAt: Date(timeIntervalSince1970: 2), stage: "submit_attempt", reviewId: "r1", action: "confirm"), defaults: defaults)
        let events = WorkoutReconciliationDiagnostics.recentEvents(defaults: defaults)
        XCTAssertEqual(events.map(\.stage), ["submit_attempt", "guard_check_passed"])
    }

    @MainActor
    func testCapsAt64Events() throws {
        let defaults = freshDefaults("WorkoutReconciliationDiagnosticsTests.cap")
        for index in 0..<70 {
            WorkoutReconciliationDiagnostics.record(.init(capturedAt: Date(), stage: "submit_attempt", reviewId: "r\(index)", action: "confirm"), defaults: defaults)
        }
        XCTAssertEqual(WorkoutReconciliationDiagnostics.recentEvents(defaults: defaults).count, 64)
    }

    @MainActor
    func testPreservesUnderlyingErrorIdentity() throws {
        let defaults = freshDefaults("WorkoutReconciliationDiagnosticsTests.error")
        WorkoutReconciliationDiagnostics.record(.init(
            capturedAt: Date(), stage: "submit_threw", reviewId: "r1", action: "confirm",
            underlyingErrorDomain: "NSURLErrorDomain", underlyingErrorCode: -999, underlyingErrorDescription: "cancelled"
        ), defaults: defaults)
        let event = try XCTUnwrap(WorkoutReconciliationDiagnostics.recentEvents(defaults: defaults).first)
        XCTAssertEqual(event.underlyingErrorDomain, "NSURLErrorDomain")
        XCTAssertEqual(event.underlyingErrorCode, -999)
        XCTAssertEqual(event.underlyingErrorDescription, "cancelled")
    }

    @MainActor
    func testClearRemovesAllEvents() throws {
        let defaults = freshDefaults("WorkoutReconciliationDiagnosticsTests.clear")
        WorkoutReconciliationDiagnostics.record(.init(capturedAt: Date(), stage: "submit_attempt", reviewId: "r1", action: "confirm"), defaults: defaults)
        WorkoutReconciliationDiagnostics.clear(defaults: defaults)
        XCTAssertTrue(WorkoutReconciliationDiagnostics.recentEvents(defaults: defaults).isEmpty)
    }

    @MainActor
    func testPreservesTaskCancellationStateAtCatch() throws {
        // The -999 "cancelled" case is ambiguous from the underlying NSError
        // alone: it fires both when the app's OWN enclosing Task was
        // cancelled (Swift's URLSession bridging cancels the in-flight
        // request when its owning Task is cancelled) and when the OS cancels
        // the connection for an external reason. `Task.isCancelled`, read at
        // the exact catch site, disambiguates the two without guessing.
        let defaults = freshDefaults("WorkoutReconciliationDiagnosticsTests.taskCancelled")
        WorkoutReconciliationDiagnostics.record(.init(
            capturedAt: Date(), stage: "submit_threw", reviewId: "r1", action: "confirm",
            underlyingErrorDomain: "NSURLErrorDomain", underlyingErrorCode: -999, underlyingErrorDescription: "cancelled",
            taskWasCancelledAtCatch: true
        ), defaults: defaults)
        let event = try XCTUnwrap(WorkoutReconciliationDiagnostics.recentEvents(defaults: defaults).first)
        XCTAssertEqual(event.taskWasCancelledAtCatch, true)
    }

    func testDescribePreservesNSErrorDomainAndCode() throws {
        let error = NSError(domain: "NSURLErrorDomain", code: -999, userInfo: [NSLocalizedDescriptionKey: "cancelled"])
        let described = WorkoutReconciliationDiagnostics.describe(error)
        XCTAssertEqual(described.domain, "NSURLErrorDomain")
        XCTAssertEqual(described.code, -999)
    }
}

final class NetworkFailureDiagnosticsTests: XCTestCase {
    private func freshDefaults(_ name: String) -> UserDefaults {
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testRecordsUnderlyingErrorForACommandPath() throws {
        let defaults = freshDefaults("NetworkFailureDiagnosticsTests.record")
        let error = NSError(domain: "NSURLErrorDomain", code: -1001, userInfo: [NSLocalizedDescriptionKey: "The request timed out."])
        NetworkFailureDiagnostics.record(path: "founder/commands", error: error, defaults: defaults)
        let event = try XCTUnwrap(NetworkFailureDiagnostics.recentEvents(defaults: defaults).first)
        XCTAssertEqual(event.path, "founder/commands")
        XCTAssertEqual(event.errorDomain, "NSURLErrorDomain")
        XCTAssertEqual(event.errorCode, -1001)
    }

    func testCapsAt64Events() throws {
        let defaults = freshDefaults("NetworkFailureDiagnosticsTests.cap")
        for _ in 0..<70 {
            NetworkFailureDiagnostics.record(path: "founder/commands", error: NSError(domain: "x", code: 0), defaults: defaults)
        }
        XCTAssertEqual(NetworkFailureDiagnostics.recentEvents(defaults: defaults).count, 64)
    }

    func testClearRemovesAllEvents() throws {
        let defaults = freshDefaults("NetworkFailureDiagnosticsTests.clear")
        NetworkFailureDiagnostics.record(path: "founder/commands", error: NSError(domain: "x", code: 0), defaults: defaults)
        NetworkFailureDiagnostics.clear(defaults: defaults)
        XCTAssertTrue(NetworkFailureDiagnostics.recentEvents(defaults: defaults).isEmpty)
    }
}
