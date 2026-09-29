import XCTest
@testable import PhysiqueOS

/// The simplified peptide screen (design §3): the copy rules the
/// iOS-product lens fixed, the presentation helpers behind the card rows
/// and sheets, and the shared controls it promoted.
@MainActor
final class PeptideScreenPresentationTests: XCTestCase {
    private var root: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    }

    private func source(_ path: String) throws -> String {
        try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    private static let peptideScreenFiles = [
        "PhysiqueOS/Presentation/OperatingPlan/OperatingPlanPeptideExecutionView.swift",
        "PhysiqueOS/Presentation/OperatingPlan/PeptideSupportSheets.swift",
        "PhysiqueOS/Presentation/OperatingPlan/PeptideDosePlanEditor.swift",
        "PhysiqueOS/Presentation/OperatingPlan/PeptideSupportEditorViewModel.swift",
    ]

    // MARK: - Copy rules (source scans)

    func testPeptideScreenNeverShowsGeneratorVocabulary() throws {
        let forbidden = [
            "Titrate", "Landing", "landing dose", "Stay at starting dose", "Hold and Landing", "Final State",
            "Execution Notes", "Dosing Timeline", "Needs dosing update", "Current phase", "No active phase",
            "Not active", "Until changed", "Target Dose", "Edit Support", "\"Custom\"", "\"Pattern\"", "titration",
        ]
        for file in Self.peptideScreenFiles {
            let text = try source(file)
            for phrase in forbidden {
                XCTAssertFalse(text.contains(phrase), "\(file) must not show '\(phrase)'")
            }
            XCTAssertFalse(text.contains("Form {"), "\(file): no SwiftUI Form")
            XCTAssertFalse(text.contains("insetGrouped"), "\(file): no insetGrouped List")
        }
    }

    func testPatternLabelsArePlainLanguageAndCustomIsNeverOffered() {
        XCTAssertEqual(PeptideDosingPattern.stay.label, "Keep this dose")
        XCTAssertEqual(PeptideDosingPattern.titrateUp.label, "Increase step by step")
        XCTAssertEqual(PeptideDosingPattern.titrateDown.label, "Decrease step by step")
        XCTAssertEqual(PeptideDosingPattern.upHoldDown.label, "Increase, hold, then decrease")
        XCTAssertEqual(PeptideDosingPattern.custom.label, "Manual plan")
        XCTAssertFalse(PeptideDosingPattern.selectable.contains(.custom))
        XCTAssertEqual(PeptideDosingPattern.selectable.count, 4)
    }

    func testPeptideScreenKeepsTheDesignChromeAndCopy() throws {
        let view = try source("PhysiqueOS/Presentation/OperatingPlan/OperatingPlanPeptideExecutionView.swift")
        for required in [
            "\"Peptides\"", "eyebrow: \"Peptide\"", "StatusChip(text: \"Paused\"", "StatusChip(text: \"Active\"",
            "\"Set a dose\"", "\"Add notes\"", "\"Planned change\"", "\"Paused since\"", "\"Next dose\"",
            "\"Pause \\(detail.name)\"", "\"Resume \\(detail.name)\"", "\"Pause \\(detail.name)?\"",
            "Upcoming doses and reminders stop until you resume. Your dose history is kept.",
            "Today's dose is not marked complete; choose Tomorrow if you took it",
            "\"Advanced · dose plan\"", "\"Start a new plan from today\"", "\"Dose history\"", "\"Show all\"",
            "Rewrite your dose history?", "confirmationDialog", "PhysiqueOSDisclosureRow", "PrimaryActionButton",
            "accessibilityHint(\"Double tap to change\")", ".accessibilityElement(children: .combine)", "minHeight: 44",
            "restoresInteractivePopGesture", "navigationBarBackButtonHidden(true)", "toolbarBackground(PhysiqueOSTheme.background",
            "supportsSimpleEditor", ".founderProduction",
        ] {
            XCTAssertTrue(view.contains(required), "peptide screen must contain \(required)")
        }
        XCTAssertFalse(view.contains("try?"))
        for identifier in [
            "operatingPlan.peptide.row.dose", "operatingPlan.peptide.row.days", "operatingPlan.peptide.row.time",
            "operatingPlan.peptide.row.notes", "operatingPlan.peptide.toggle.reminder", "operatingPlan.peptide.pause",
            "operatingPlan.peptide.resume", "operatingPlan.peptide.advanced.toggle", "operatingPlan.peptide.advanced.save",
        ] {
            XCTAssertTrue(view.contains("\"\(identifier)\""), identifier)
        }
    }

    func testSheetsUseAMediumDetentCancelSaveAndKeepTheValueOnFailure() throws {
        let sheets = try source("PhysiqueOS/Presentation/OperatingPlan/PeptideSupportSheets.swift")
        for required in [
            "presentationDetents([.medium])", "interactiveDismissDisabled(isSaving)", "\"Saving…\"", "\"Cancel\"",
            "OperatingPlanEditorErrorBanner", "\"operatingPlan.peptide.sheet.save\"", "viewModel.errorMessage = nil",
            "NumericEditField", "step: 0.25", "accessibilityLabel(\"Dose\")", "\"Pick a date…\"", "\"Today\"",
            "\"Only the next dose\"", ".priorityOccurrence(priorityId:", "datePickerStyle(.wheel)", "labelsHidden()",
            "\"Repeat every N days instead\"", "OperatingPlanChoicePill", "minHeight: 44", "PeptideSupportPresentation.seedTime",
            "bucketCaption", "minimumDate: OperatingPlanDateValues.date(from: viewModel.today)",
        ] {
            XCTAssertTrue(sheets.contains(required), "sheets must contain \(required)")
        }
        XCTAssertFalse(sheets.contains("try?"))
        XCTAssertFalse(sheets.contains("Picker(") && sheets.contains(".segmented"), "No segmented control in the sheets")
    }

    func testDomainCardOffersManageAndResumeForPeptides() throws {
        let domain = try source("PhysiqueOS/Presentation/OperatingPlan/OperatingPlanProtocolDomainView.swift")
        XCTAssertTrue(domain.contains("Button(\"Manage\")"))
        XCTAssertTrue(domain.contains("Button(\"Resume\")"))
        XCTAssertTrue(domain.contains("executionLifecycle"))
        XCTAssertTrue(domain.contains("peptideLifecycleAPI.resume("))
        XCTAssertTrue(domain.contains("peptideSupportAPI.fetchSupport("), "Resume takes its If-Match from a fresh peptide-support read")
        XCTAssertFalse(domain.contains("try?"))
    }

    func testDomainChipFollowsExecutionLifecycleForPeptidesAndProtocolStateOtherwise() throws {
        func method(_ json: String) throws -> OperatingPlanSupportMethodReadModel {
            try JSONDecoder().decode(OperatingPlanSupportMethodReadModel.self, from: Data(json.utf8))
        }
        let legacy = try method(#"{"id":"m","protocolId":"p","name":"Retatrutide","purpose":"x","supportSummary":"s","lifecycleState":"active"}"#)
        XCTAssertNil(legacy.executionLifecycle, "A payload without the S4 key still decodes")
        XCTAssertEqual(OperatingPlanProtocolDomainView.lifecycleStatus(method: legacy, category: .peptide, sandboxStatus: nil), "active")

        let paused = try method(#"{"id":"m","protocolId":"p","name":"Retatrutide","purpose":"x","supportSummary":"s","lifecycleState":"active","executionLifecycle":{"state":"paused","since":"2026-09-12"}}"#)
        XCTAssertEqual(paused.executionLifecycle?.since, "2026-09-12")
        XCTAssertEqual(OperatingPlanProtocolDomainView.lifecycleStatus(method: paused, category: .peptide, sandboxStatus: nil), "paused")
        XCTAssertEqual(OperatingPlanProtocolDomainView.lifecycleStatus(method: paused, category: .supplement, sandboxStatus: nil), "active", "Supplements keep reading the protocol lifecycle")
        XCTAssertEqual(OperatingPlanProtocolDomainView.lifecycleStatus(method: legacy, category: .peptide, sandboxStatus: "paused"), "paused", "The sandbox store wins under the sandbox authority")
    }

    // MARK: - Shared controls

    func testDisclosureRowIsSharedAndHonoursReduceMotion() throws {
        let row = try source("PhysiqueOS/SharedUI/PhysiqueOSDisclosureRow.swift")
        XCTAssertTrue(row.contains("@Environment(\\.accessibilityReduceMotion)"))
        XCTAssertTrue(row.contains("withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2))"))
        XCTAssertTrue(row.contains(".accessibilityValue(isExpanded ? \"Expanded\" : \"Collapsed\")"))
        let training = try source("PhysiqueOS/Presentation/Training/TrainingHistoryView.swift")
        XCTAssertFalse(training.contains("struct TrainingDisclosureRow"), "The private copy is gone")
        XCTAssertTrue(training.contains("PhysiqueOSDisclosureRow(isExpanded:"))
    }

    func testFieldRowStacksLabelAboveValueAtAccessibilitySizes() throws {
        let components = try source("PhysiqueOS/Presentation/OperatingPlan/OperatingPlanComponents.swift")
        XCTAssertTrue(components.contains("@Environment(\\.dynamicTypeSize)"))
        XCTAssertTrue(components.contains("dynamicTypeSize.isAccessibilitySize"))
        XCTAssertTrue(components.contains("frame(width: 132, alignment: .leading)"), "The regular layout is unchanged")
        XCTAssertTrue(components.contains("var minHeight: CGFloat? = nil"), "Pills opt into a 44pt target; existing editors keep the compact pill")
    }

    // MARK: - Presentation helpers

    func testDaysFormatterCases() {
        func schedule(_ frequency: SupportScheduleFrequency, _ days: [OperatingPlanWeekday] = [], interval: Int = 1) -> OperatingPlanSupportScheduleReadModel {
            .init(frequency: frequency, daysOfWeek: days, intervalDays: interval, timing: .specific, specificTime: "21:45", startDate: "2026-05-21", endDate: nil)
        }
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.sunday, .monday, .tuesday, .wednesday, .thursday])), "Sun–Thu")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.thursday])), "Thursday")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.daily)), "Every day")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, OperatingPlanWeekday.allCases)), "Every day")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.specificDays, [.monday, .thursday])), "Mon, Thu")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.everyXDays, interval: 3)), "Every 3 days")
        XCTAssertEqual(PeptideSupportPresentation.formatDays(schedule(.everyXDays, interval: 2)), "Every other day")
        XCTAssertEqual(PeptideSupportPresentation.formatWeekdays([]), "No days chosen")
    }

    func testNextDoseFormatterCases() {
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-09-29", time: "21:45", today: "2026-09-29"), "Today · 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-09-30", time: "21:45", today: "2026-09-29"), "Tomorrow · 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.formatNextDose(date: "2026-10-01", time: "21:45", today: "2026-09-29"), "Thu, Oct 1 · 9:45 PM")
        XCTAssertNil(PeptideSupportPresentation.formatNextDose(date: nil, time: nil, today: "2026-09-29"))
    }

    func testDoseLabelTrimsTrailingZeros() {
        XCTAssertEqual(PeptideSupportPresentation.formatDose(2.50, "mg"), "2.5 mg")
        XCTAssertEqual(PeptideSupportPresentation.formatDose(3.0, "mg"), "3 mg")
        XCTAssertEqual(PeptideSupportPresentation.formatDose(0.125, "mg"), "0.125 mg")
    }

    func testTimeSheetSeedsFromTheBucketAndPreviewsTheWeekday() {
        func schedule(_ timing: SupportScheduleTiming, time: String = "", days: [OperatingPlanWeekday] = [.thursday], frequency: SupportScheduleFrequency = .specificDays) -> OperatingPlanSupportScheduleReadModel {
            .init(frequency: frequency, daysOfWeek: days, intervalDays: 1, timing: timing, specificTime: time, startDate: "2026-05-21", endDate: nil)
        }
        XCTAssertEqual(PeptideSupportPresentation.seedTime(for: schedule(.morning)), "08:00")
        XCTAssertEqual(PeptideSupportPresentation.seedTime(for: schedule(.afternoon)), "13:00")
        XCTAssertEqual(PeptideSupportPresentation.seedTime(for: schedule(.evening)), "20:00")
        XCTAssertEqual(PeptideSupportPresentation.seedTime(for: schedule(.specific, time: "21:45")), "21:45")
        XCTAssertEqual(PeptideSupportPresentation.seedTime(for: schedule(.specific, time: "")), "08:00", "A blank specific time never seeds an unrelated 09:00")
        XCTAssertEqual(PeptideSupportPresentation.bucketCaption(for: schedule(.evening)), "Currently set to Evening")
        XCTAssertNil(PeptideSupportPresentation.bucketCaption(for: schedule(.specific, time: "21:45")))

        XCTAssertEqual(PeptideSupportPresentation.timePreview(schedule(.specific), localTime: "21:45"), "Thursdays at 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.timePreview(schedule(.specific, days: [.sunday, .monday, .tuesday, .wednesday, .thursday]), localTime: "21:45"), "Sun–Thu at 9:45 PM")
        XCTAssertEqual(PeptideSupportPresentation.timePreview(schedule(.specific, days: [], frequency: .daily), localTime: "08:00"), "Every day at 8:00 AM")
        XCTAssertEqual(PeptideSupportPresentation.timePreview(schedule(.specific, days: [.monday], frequency: .weekly), localTime: "09:05"), "Mondays at 9:05 AM")
    }

    func testDaysSheetSeedsEveryDayForDailyAndNothingForAnInterval() {
        func schedule(_ frequency: SupportScheduleFrequency, _ days: [OperatingPlanWeekday] = []) -> OperatingPlanSupportScheduleReadModel {
            .init(frequency: frequency, daysOfWeek: days, intervalDays: 3, timing: .evening, specificTime: "", startDate: "2026-05-21", endDate: nil)
        }
        XCTAssertEqual(PeptideSupportPresentation.seedDays(for: schedule(.daily)), OperatingPlanWeekday.allCases)
        XCTAssertEqual(PeptideSupportPresentation.seedDays(for: schedule(.specificDays, [.thursday, .sunday])), [.sunday, .thursday])
        XCTAssertEqual(PeptideSupportPresentation.seedDays(for: schedule(.weekly, [.monday])), [.monday])
        XCTAssertEqual(PeptideSupportPresentation.seedDays(for: schedule(.everyXDays)), [])
    }

    func testDateListsAndPauseCopy() {
        XCTAssertEqual(PeptideSupportPresentation.joinDates(["2026-10-08"]), "Oct 8")
        XCTAssertEqual(PeptideSupportPresentation.joinDates(["2026-10-08", "2026-10-22"]), "Oct 8 and Oct 22")
        XCTAssertEqual(PeptideSupportPresentation.joinDates(["2026-10-08", "2026-10-15", "2026-10-22"]), "Oct 8, Oct 15 and Oct 22")
        XCTAssertEqual(PeptideSupportPresentation.joinDates([]), "")
        XCTAssertEqual(
            OperatingPlanPeptideExecutionView.pauseDialogMessage(startsTomorrow: false),
            "Upcoming doses and reminders stop until you resume. Your dose history is kept."
        )
        XCTAssertTrue(OperatingPlanPeptideExecutionView.pauseDialogMessage(startsTomorrow: true).hasSuffix("Pausing starts tomorrow."))
    }

    // MARK: - View model rows for the new screen

    private func detail(nextDueDate: String?, advancedPlan: Bool, plannedChanges: String, lifecycle: String = #"{"state":"active","since":null,"history":[]}"#) throws -> PeptideSupportDetail {
        let next = nextDueDate.map { "\"\($0)\"" } ?? "null"
        let json = """
        {"protocolId":"peptide-protocol","executionId":"execution-peptide","executionRevision":5,"name":"Retatrutide","purpose":"Support the active strategy.","state":"CANONICAL","supportSchedule":{"frequency":"specific_days","daysOfWeek":["thursday"],"intervalDays":1,"timing":"specific","specificTime":"21:45","startDate":"2026-05-21","endDate":null},"dosing":{"pattern":"up_hold_down","startingDoseAmount":0.5,"startingDoseUnit":"mg","startDate":"2026-05-21","stepAmount":0.25,"stepInterval":1,"stepUnit":"weeks","targetDoseAmount":2,"holdDuration":4,"holdUnit":"weeks","decreaseAmount":0.25,"decreaseInterval":1,"decreaseUnit":"weeks","landingDoseAmount":1.5,"endDate":null},"timeline":[],"reminderPreference":"remind","timingContext":"fasted_before_bed","notes":"","nextDue":null,"nextDueDate":\(next),"nextDueTime":"21:45","lifecycle":\(lifecycle),"currentDose":{"amount":1.5,"unit":"mg"},"currentDoseLabel":"1.5 mg","currentPhase":{"startDate":"2026-08-06","endDate":null},"plannedChanges":\(plannedChanges),"dosingHistory":[],"dosingMode":"structured","advancedPlan":\(advancedPlan),"priorityId":"reminder-peptide","localDate":"2026-09-29"}
        """
        return try JSONDecoder().decode(PeptideSupportDetail.self, from: Data(json.utf8))
    }

    private final class FixedSupportAPI: PeptideSupportAPI, @unchecked Sendable {
        let detail: PeptideSupportDetail
        init(_ detail: PeptideSupportDetail) { self.detail = detail }
        func fetchSupport(protocolId: String) async throws -> PeptideSupportDetail? { detail }
        func save(protocolId: String, expectedRevision: Int?, supportSchedule: OperatingPlanSupportScheduleReadModel, dosing: PeptideDosingStrategyReadModel, timingContext: String, reminderPreference: OperatingPlanReminderPreference, notes: String, rewriteHistory: Bool) async throws -> PeptideSupportSaveResult {
            .init(status: "updated", protocolId: protocolId, executionId: nil, executionRevision: 6)
        }
    }

    private func model(_ detail: PeptideSupportDetail) async -> PeptideSupportEditorViewModel {
        let model = PeptideSupportEditorViewModel(
            protocolId: "peptide-protocol", authority: .founderProduction, supportAPI: FixedSupportAPI(detail),
            lifecycleAPI: NotAvailablePeptideLifecycleAPI(), store: OperatingPlanSandboxStore(), deviceToday: { "2026-09-29" }
        )
        await model.load()
        return model
    }

    func testTodayHasScheduledDoseOnlyWhenTheNextDueDateIsToday() async throws {
        let today = await model(try detail(nextDueDate: "2026-09-29", advancedPlan: false, plannedChanges: "[]"))
        XCTAssertTrue(today.todayHasScheduledDose)
        let later = await model(try detail(nextDueDate: "2026-10-01", advancedPlan: false, plannedChanges: "[]"))
        XCTAssertFalse(later.todayHasScheduledDose)
        let paused = await model(try detail(nextDueDate: nil, advancedPlan: false, plannedChanges: "[]", lifecycle: #"{"state":"paused","since":"2026-09-12","history":[]}"#))
        XCTAssertFalse(paused.todayHasScheduledDose)
        XCTAssertEqual(paused.pausedSinceLabel, "Sep 12")
        XCTAssertEqual(paused.nextDoseLabel, "Paused")
        XCTAssertTrue(paused.reminderEnabled)
    }

    func testResumedCopyNamesTheNextDoseAndMovedPlannedChanges() async throws {
        let plain = await model(try detail(nextDueDate: "2026-10-01", advancedPlan: false, plannedChanges: "[]"))
        XCTAssertEqual(plain.resumedCopy, "Resumed. Next dose Thu, Oct 1 · 9:45 PM.")
        let shifted = await model(try detail(
            nextDueDate: "2026-10-01", advancedPlan: true,
            plannedChanges: #"[{"startDate":"2026-10-15","dose":{"amount":2,"unit":"mg"},"label":"x"},{"startDate":"2026-10-29","dose":{"amount":2.5,"unit":"mg"},"label":"y"}]"#
        ))
        XCTAssertTrue(shifted.hasAdvancedPlan)
        XCTAssertEqual(shifted.resumedCopy, "Resumed. Next dose Thu, Oct 1 · 9:45 PM. Planned changes moved to Oct 15 and Oct 29.")
        XCTAssertEqual(shifted.editableModel?.plannedChanges?.count, 2, "The Advanced draft starts from the full read")
        XCTAssertEqual(shifted.editableModel?.executionRevision, 5)
    }
}
