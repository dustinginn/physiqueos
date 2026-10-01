import XCTest
@testable import PhysiqueOS

/// Build 78: targeted in-app haptics for Priority completion / skip. Each
/// fires once, only after the canonical write is acknowledged, and never on
/// a load, refresh or refused action.
final class CompletionFeedbackAndNotificationCapabilityTests: XCTestCase {
    private actor PriorityReads: PriorityAPI {
        let occurrence: PriorityOccurrence
        init(_ occurrence: PriorityOccurrence) { self.occurrence = occurrence }
        func fetchExecutionItems() async throws -> [ExecutionItemFixture] { [] }
        func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence? { occurrence }
    }

    private actor Writes: PriorityCompletionWriteAPI {
        enum Mode { case succeed, fail, alreadyCompleted }
        let mode: Mode
        private(set) var calls = 0
        init(_ mode: Mode) { self.mode = mode }
        func complete(priorityId: String, occurrenceDate: String, context: PriorityCompletionContext?, expectedVersion: Int) async throws {
            calls += 1
            if mode == .fail { throw URLError(.notConnectedToInternet) }
        }
        func skip(priorityId: String, occurrenceDate: String, expectedVersion: Int) async throws {
            calls += 1
            switch mode {
            case .succeed: return
            case .fail: throw URLError(.notConnectedToInternet)
            case .alreadyCompleted: throw PrioritySkipError.alreadyCompleted
            }
        }
    }

    private func foamRolling(skippable: Bool = true) -> PriorityOccurrence {
        var occurrence = PriorityOccurrence(
            id: "foam", routePriorityId: "reminder-foam", executionItemId: "execution-foam", date: "2026-10-01",
            title: "Foam Rolling", subtitle: "Tonight", metadata: nil, changeLabel: nil,
            icon: .activity, color: .success, urgency: .available, completed: false, completable: true,
            expectedVersion: 5, actionLabel: nil, completionContext: nil, continueActionDestination: nil
        )
        occurrence.skippable = skippable
        occurrence.skipExpectedVersion = skippable ? 5 : nil
        return occurrence
    }

    @MainActor
    private func detail(_ occurrence: PriorityOccurrence, _ writes: Writes, _ feedback: RecordingFeedbackClient) -> PriorityDetailViewModel {
        PriorityDetailViewModel(
            api: PriorityReads(occurrence), writeAPI: writes,
            morningCheckInAPI: NotAvailableMorningCheckInAPI(), store: LoggingSandboxStore(),
            authority: .founderProduction, priorityId: "reminder-foam", occurrenceDate: "2026-10-01",
            feedback: feedback
        )
    }

    @MainActor
    func testPriorityDetailCompletionPlaysASubtleSuccessOnceAfterAcknowledgement() async {
        let feedback = RecordingFeedbackClient()
        let viewModel = detail(foamRolling(), Writes(.succeed), feedback)
        await viewModel.load()
        XCTAssertTrue(feedback.events.isEmpty, "Loading is passive: no haptic.")
        await viewModel.complete()
        XCTAssertEqual(feedback.events, [.priorityCompleted])
    }

    @MainActor
    func testPriorityDetailSkipPlaysALighterConfirmationOnce() async {
        let feedback = RecordingFeedbackClient()
        let writes = Writes(.succeed)
        let viewModel = detail(foamRolling(), writes, feedback)
        await viewModel.load()
        await viewModel.skip()
        XCTAssertEqual(feedback.events, [.prioritySkipped])
    }

    @MainActor
    func testRefusedOrFailedActionsPlayNothing() async {
        let feedback = RecordingFeedbackClient()
        let failing = detail(foamRolling(), Writes(.fail), feedback)
        await failing.load()
        await failing.complete()
        await failing.load()
        await failing.skip()

        let alreadyDone = detail(foamRolling(), Writes(.alreadyCompleted), feedback)
        await alreadyDone.load()
        await alreadyDone.skip()

        let notSkippable = Writes(.succeed)
        let unsupported = detail(foamRolling(skippable: false), notSkippable, feedback)
        await unsupported.load()
        await unsupported.skip()
        let calls = await notSkippable.calls
        XCTAssertEqual(calls, 0, "Skip is never sent where the Server did not offer it.")
        XCTAssertTrue(feedback.events.isEmpty)
    }

    func testHapticsStayBehindTheFeedbackClientAndAwayFromPassiveSurfaces() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let app = root.appendingPathComponent("PhysiqueOS")
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: app, includingPropertiesForKeys: nil))
        var generatorFiles: [String] = []
        var playSites: [String: Int] = [:]
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let text = try String(contentsOf: url, encoding: .utf8)
            if text.contains("FeedbackGenerator(") || text.contains(".sensoryFeedback(") || text.contains("CHHapticEngine") {
                generatorFiles.append(url.lastPathComponent)
            }
            let plays = text.components(separatedBy: ".play(.").count - 1
                + text.components(separatedBy: "playFeedback(.").count - 1
            if plays > 0 { playSites[url.lastPathComponent] = plays }
        }
        XCTAssertEqual(generatorFiles, ["PhysiqueOSFeedback.swift"], "UIKit haptics live only in the feedback client.")
        XCTAssertEqual(Set(playSites.keys), [
            "HomeView.swift",                      // inline Complete (sandbox + production)
            "PriorityDetailViewModel.swift",       // Mark Complete (sandbox + production), Mark Skipped
            "PriorityNotificationDelegate.swift",  // foreground-only notification Complete / Skip
            "TrainingReadModel.swift",             // the one-shot PR celebration
        ], "No haptics on navigation, charts, read-only screens, HealthKit or Workout set completion.")
    }
}
