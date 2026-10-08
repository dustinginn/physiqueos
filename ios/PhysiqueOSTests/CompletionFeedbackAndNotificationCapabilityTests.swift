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

    private actor OneShotPriorityReads: PriorityAPI {
        let occurrence: PriorityOccurrence
        private var reads = 0
        init(_ occurrence: PriorityOccurrence) { self.occurrence = occurrence }
        func fetchExecutionItems() async throws -> [ExecutionItemFixture] { [] }
        func fetchPriority(priorityId: String, occurrenceDate: String?) async throws -> PriorityOccurrence? {
            reads += 1
            if reads == 1 { return occurrence }
            throw URLError(.notConnectedToInternet)
        }
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

    @MainActor
    func testAcknowledgedSkipStaysTerminalAndRemovesCapabilityWhenRefreshIsUncertain() async {
        var occurrence = foamRolling(skippable: false)
        occurrence.projectedSkipCommand = .init(
            commandType: ProductionCommandType.skipPriority, expectedVersion: 5,
            payload: .init(priorityId: "reminder-foam", occurrenceDate: occurrence.date)
        )
        let viewModel = PriorityDetailViewModel(
            api: OneShotPriorityReads(occurrence), writeAPI: Writes(.succeed),
            morningCheckInAPI: NotAvailableMorningCheckInAPI(), store: LoggingSandboxStore(),
            authority: .founderProduction, priorityId: "reminder-foam", occurrenceDate: occurrence.date
        )
        await viewModel.load()
        await viewModel.skip()
        guard case .loaded(.some(let acknowledged)) = viewModel.state else {
            return XCTFail("A durable Skip must survive an uncertain refresh.")
        }
        XCTAssertTrue(acknowledged.skipped)
        XCTAssertFalse(acknowledged.completable)
        XCTAssertNil(acknowledged.canonicalSkipCommand, "A terminal acknowledgement must not re-offer Skip.")
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

extension CompletionFeedbackAndNotificationCapabilityTests {
    private actor SplitWrites: PriorityCompletionWriteAPI {
        private(set) var completions: [PriorityCompletionContext?] = []
        private(set) var skips: [String] = []
        func complete(priorityId: String, occurrenceDate: String, context: PriorityCompletionContext?, expectedVersion: Int) async throws {
            completions.append(context)
        }
        func skip(priorityId: String, occurrenceDate: String, expectedVersion: Int) async throws {
            skips.append("\(priorityId)|\(occurrenceDate)|\(expectedVersion)")
        }
    }

    private func peptide() -> PriorityOccurrence {
        var occurrence = PriorityOccurrence(
            id: "tesamorelin", routePriorityId: "reminder_tesamorelin", executionItemId: "execution_tesamorelin",
            date: "2026-10-02", title: "Tesamorelin", subtitle: "Evening", metadata: nil, changeLabel: nil,
            icon: .activity, color: .primary, urgency: .available, completed: false, completable: true,
            expectedVersion: 9, actionLabel: nil,
            completionContext: .init(occurrenceDate: "2026-10-02", dose: "0.5 mg", protocolId: "protocol_tesamorelin"),
            continueActionDestination: nil
        )
        occurrence.doseAdjustableState = true
        occurrence.skippable = true
        occurrence.skipExpectedVersion = 9
        return occurrence
    }

    @MainActor
    func testPeptideDetailSkipRecordsNoDoseAndLeavesCompletionDoseAware() async {
        let feedback = RecordingFeedbackClient()
        let writes = SplitWrites()
        let viewModel = PriorityDetailViewModel(
            api: PriorityReads(peptide()), writeAPI: writes,
            morningCheckInAPI: NotAvailableMorningCheckInAPI(), store: LoggingSandboxStore(),
            authority: .founderProduction, priorityId: "reminder_tesamorelin", occurrenceDate: "2026-10-02",
            feedback: feedback
        )
        await viewModel.load()
        await viewModel.skip()
        let skips = await writes.skips
        let completions = await writes.completions
        XCTAssertEqual(skips, ["reminder_tesamorelin|2026-10-02|9"], "priority.skip.v1 carries identity and version only.")
        XCTAssertTrue(completions.isEmpty, "Skipping never records a dose or a completion.")
        XCTAssertEqual(feedback.events, [.prioritySkipped])

        let completing = PriorityDetailViewModel(
            api: PriorityReads(peptide()), writeAPI: writes,
            morningCheckInAPI: NotAvailableMorningCheckInAPI(), store: LoggingSandboxStore(),
            authority: .founderProduction, priorityId: "reminder_tesamorelin", occurrenceDate: "2026-10-02"
        )
        await completing.load()
        await completing.complete(dose: "0.4 mg")
        let after = await writes.completions
        XCTAssertEqual(after.first??.dose, "0.4 mg", "Took a different amount is unchanged.")
        XCTAssertEqual(after.first??.protocolId, "protocol_tesamorelin")
    }

    func testPeptideSkipConfirmationSaysNoAmountIsRecorded() {
        XCTAssertTrue(PriorityDetailView.skipConfirmationMessage(isDose: true).contains("No amount is recorded"))
        XCTAssertFalse(PriorityDetailView.skipConfirmationMessage(isDose: false).contains("dose"))
    }

    @MainActor
    func testSkippableEvidenceAndSupplementDetailsUseTheSameProjectedSkipWithoutCompletionOrEvidence() async {
        let writes = SplitWrites()
        let feedback = RecordingFeedbackClient()
        let variants: [(String, AppDestination?)] = [
            ("Fadogia", nil),
            ("Morning Weight", .checkIn(checkInType: "morning")),
            ("Progress Photos", .photoUpload),
        ]
        for (index, variant) in variants.enumerated() {
            let priorityId = "priority-\(index)"
            var occurrence = PriorityOccurrence(
                id: priorityId, routePriorityId: priorityId, executionItemId: "execution-\(index)",
                date: "2026-10-07", title: variant.0, subtitle: nil, metadata: nil,
                changeLabel: nil, icon: .target, color: .primary, urgency: .available,
                completed: false, completable: variant.1 == nil, expectedVersion: 20 + index,
                actionLabel: variant.1 == nil ? nil : "Open", completionContext: nil,
                continueActionDestination: variant.1
            )
            occurrence.projectedSkipCommand = .init(
                commandType: ProductionCommandType.skipPriority, expectedVersion: 20 + index,
                payload: .init(priorityId: priorityId, occurrenceDate: occurrence.date)
            )
            let viewModel = PriorityDetailViewModel(
                api: PriorityReads(occurrence), writeAPI: writes,
                morningCheckInAPI: NotAvailableMorningCheckInAPI(), store: LoggingSandboxStore(),
                authority: .founderProduction, priorityId: priorityId,
                occurrenceDate: occurrence.date, feedback: feedback
            )
            await viewModel.load()
            await viewModel.skip()
        }
        let skips = await writes.skips
        let completions = await writes.completions
        XCTAssertEqual(skips.count, variants.count)
        XCTAssertTrue(completions.isEmpty, "Universal Skip never routes through completion or fabricates evidence.")
        XCTAssertEqual(feedback.events, Array(repeating: .prioritySkipped, count: variants.count))
    }

    @MainActor
    func testDexaReminderRefusesForgedCompleteAndSkipThroughDetailModel() async {
        let writes = SplitWrites()
        let feedback = RecordingFeedbackClient()
        let priorityId = "dexa-appointment:2026-10-08:appointment"
        var occurrence = PriorityOccurrence(
            id: priorityId, routePriorityId: priorityId, executionItemId: "execution_next_dexa",
            date: "2026-10-08", title: "DEXA appointment", subtitle: "Today at 7:30 AM",
            metadata: nil, changeLabel: nil, icon: .target, color: .evidence, urgency: .upcoming,
            completed: false, completable: true, expectedVersion: 8,
            actionLabel: "View DEXA Appointment", completionContext: .init(occurrenceDate: "2026-10-08"),
            continueActionDestination: .operatingPlanDexaAppointment,
            notificationAction: .init(
                classification: .specializedWorkflowRequired, workflow: "dexa_appointment",
                scheduledTime: "07:30", completionCommand: nil,
                skipCommand: .init(
                    commandType: ProductionCommandType.skipPriority, expectedVersion: 8,
                    payload: .init(priorityId: priorityId, occurrenceDate: "2026-10-08")
                )
            )
        )
        occurrence.projectedSkipCommand = occurrence.notificationAction?.skipCommand
        let viewModel = PriorityDetailViewModel(
            api: PriorityReads(occurrence), writeAPI: writes,
            morningCheckInAPI: NotAvailableMorningCheckInAPI(), store: LoggingSandboxStore(),
            authority: .founderProduction, priorityId: priorityId,
            occurrenceDate: occurrence.date, feedback: feedback
        )

        await viewModel.load()
        await viewModel.complete()
        await viewModel.skip()

        let completions = await writes.completions
        let skips = await writes.skips
        XCTAssertTrue(completions.isEmpty)
        XCTAssertTrue(skips.isEmpty)
        XCTAssertTrue(feedback.events.isEmpty)
    }
}
