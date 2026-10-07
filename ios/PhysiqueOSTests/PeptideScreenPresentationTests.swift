import XCTest
import SwiftUI
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
            "\"Peptides\"", "eyebrow: \"Peptide\"", "StatusChip(text: viewModel.statusChipText",
            "\"Set a dose\"", "\"Add notes\"", "\"Planned change\"", "viewModel.pausedRowLabel", "\"Next dose\"",
            "\"Pause \\(detail.name)\"", "viewModel.resumeButtonTitle", "\"Try again\"", ".refreshable", "\"Pause \\(detail.name)?\"",
            "Upcoming doses and reminders stop until you resume. Your dose history is kept.",
            "Today's dose is still open. Starting today removes it. Choose Tomorrow if you haven't logged it yet.",
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
            "presentationDetents([.medium, .large])", "interactiveDismissDisabled(isSaving)", "\"Saving…\"", "\"Cancel\"",
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
        XCTAssertEqual(plain.resumedCopy(), "Resumed. Next dose Thu, Oct 1 · 9:45 PM.")
        let shifted = await model(try detail(
            nextDueDate: "2026-10-01", advancedPlan: true,
            plannedChanges: #"[{"startDate":"2026-10-15","dose":{"amount":2,"unit":"mg"},"label":"x"},{"startDate":"2026-10-29","dose":{"amount":2.5,"unit":"mg"},"label":"y"}]"#
        ))
        XCTAssertTrue(shifted.hasAdvancedPlan)
        XCTAssertEqual(shifted.resumedCopy(), "Resumed. Next dose Thu, Oct 1 · 9:45 PM. Planned changes moved to Oct 15 and Oct 29.")
        XCTAssertEqual(shifted.resumedCopy(previousChangeDates: ["2026-10-15", "2026-10-29"]), "Resumed. Next dose Thu, Oct 1 · 9:45 PM.", "Unmoved dates are not claimed as moved")
        XCTAssertEqual(shifted.resumedCopy(previousChangeDates: ["2026-10-08", "2026-10-22"]), "Resumed. Next dose Thu, Oct 1 · 9:45 PM. Planned changes moved to Oct 15 and Oct 29.")
        XCTAssertEqual(shifted.editableModel?.plannedChanges?.count, 2, "The Advanced draft starts from the full read")
        XCTAssertEqual(shifted.editableModel?.executionRevision, 5)
    }
}

// MARK: - Build 91 design boards (design branch only; not shipping)


/// Build 91 Operating Plan + DEXA routing review boards. Real SwiftUI built
/// from the app's own Priority-family tokens (the Oct 4 Operating Plan lock
/// shares the Priority canvas, #06121D / #F0EEE6) and Plus Jakarta Sans,
/// rendered at the locked 402 pt iPhone width in Dark and Mineral Light.
/// Presentation-only mockups: no route, read model or command changes.
/// Renders when `TEST_RUNNER_B91_BOARD_DIR` is set; otherwise skipped.
@MainActor
final class Build91OperatingPlanDesignBoardTests: XCTestCase {
    func testRenderOperatingPlanBoards() throws {
        guard let dir = ProcessInfo.processInfo.environment["B91_BOARD_DIR"] else {
            throw XCTSkip("Design boards render only when B91_BOARD_DIR is set.")
        }
        let boards: [(String, AnyView)] = [
            ("op-a1-landing", AnyView(B91Landing())),
            ("op-a2-coaching-detail", AnyView(B91CoachingDetail())),
            ("op-a3-dexa-scheduled", AnyView(B91DexaPage(state: .scheduled))),
            ("op-a4-dexa-not-scheduled", AnyView(B91DexaPage(state: .notScheduled))),
            ("op-a5-dexa-no-coaching", AnyView(B91DexaPage(state: .noCoaching))),
            ("op-a6-dexa-failed", AnyView(B91DexaPage(state: .failed))),
            ("op-a7-coaching-edit-dexa", AnyView(B91CoachingEditDexa())),
            ("op-b1-energy-detail", AnyView(B91EnergyDetail())),
            ("op-b2-nutrition-detail", AnyView(B91NutritionDetail())),
            ("op-c1-peptide-domain", AnyView(B91PeptideDomain())),
            ("op-c2-peptide-execution", AnyView(B91PeptideExecution())),
            ("op-d1-tracking", AnyView(B91Tracking())),
        ]
        for (name, view) in boards {
            for scheme in [ColorScheme.dark, .light] {
                let content = view
                    .frame(width: 402)
                    .background(B91.canvas)
                    .environment(\.colorScheme, scheme)
                let renderer = ImageRenderer(content: content)
                renderer.scale = 2
                renderer.proposedSize = ProposedViewSize(width: 402, height: nil)
                let image = try XCTUnwrap(renderer.uiImage, "\(name) did not render")
                let data = try XCTUnwrap(image.pngData())
                let suffix = scheme == .dark ? "dark" : "mineral"
                try data.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name)-\(suffix).png"))
            }
        }
    }
}

// MARK: Tokens and type

enum B91 {
    static var canvas: Color { PhysiqueOSTheme.priorityCanvas }
    static var ink: Color { PhysiqueOSTheme.priorityInk }
    static var muted: Color { PhysiqueOSTheme.priorityMuted }
    static var rule: Color { PhysiqueOSTheme.priorityRule }
    static var surface: Color { PhysiqueOSTheme.prioritySurface }
    static var raised: Color { PhysiqueOSTheme.prioritySurfaceRaised }
    static var teal: Color { PhysiqueOSTheme.priorityTeal }
    static var green: Color { PhysiqueOSTheme.priorityGreen }
    static var amber: Color { PhysiqueOSTheme.priorityAmber }
    static var cyan: Color { PhysiqueOSTheme.priorityCyan }
    static var purple: Color { PhysiqueOSTheme.priorityPurple }
    static var red: Color { PhysiqueOSTheme.priorityRed }
    static var navy: Color { PhysiqueOSTheme.priorityNavy }
    static var fieldStart: Color { PhysiqueOSTheme.priorityEvidenceStart }
    static var fieldEnd: Color { PhysiqueOSTheme.priorityEvidenceEnd }
    static var fieldInk: Color { PhysiqueOSTheme.priorityEvidenceInk }

    static func font(_ size: CGFloat, _ weight: CGFloat) -> Font { PlusJakartaSans.font(size: size, weight: weight) }
}

struct B91Text: View {
    let text: String
    var size: CGFloat
    var weight: CGFloat
    var color: Color = B91.ink
    var tracking: CGFloat = 0
    var uppercase = false
    var lineSpacing: CGFloat = 2

    init(_ text: String, _ size: CGFloat, _ weight: CGFloat, color: Color = B91.ink, tracking: CGFloat = 0, uppercase: Bool = false, lineSpacing: CGFloat = 2) {
        self.text = text; self.size = size; self.weight = weight; self.color = color
        self.tracking = tracking; self.uppercase = uppercase; self.lineSpacing = lineSpacing
    }

    var body: some View {
        Text(uppercase ? text.uppercased() : text)
            .font(B91.font(size, weight))
            .tracking(tracking)
            .lineSpacing(lineSpacing)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct B91Eyebrow: View {
    let text: String
    var color: Color = B91.purple
    init(_ text: String, color: Color = B91.purple) { self.text = text; self.color = color }
    var body: some View { B91Text(text, 10, 780, color: color, tracking: 1.3, uppercase: true) }
}

// MARK: Chrome

/// Status bar + back row + hairline, matching the locked boards' chrome.
struct B91Screen<Content: View>: View {
    let back: String
    var trailing: String? = nil
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                B91Text("9:41", 15, 700)
                Spacer()
                Image(systemName: "battery.75percent").font(.system(size: 14, weight: .semibold)).foregroundStyle(B91.ink)
            }
            .padding(.horizontal, 28)
            .frame(height: 50)
            HStack(spacing: 4) {
                Image(systemName: "chevron.left").font(.system(size: 13, weight: .bold))
                B91Text(back, 14, 650, color: B91.muted)
                Spacer()
                if let trailing { B91Text(trailing, 14, 700, color: B91.teal) }
            }
            .foregroundStyle(B91.muted)
            .padding(.horizontal, 18)
            .frame(height: 36)
            Rectangle().fill(B91.rule).frame(height: 1)
            VStack(alignment: .leading, spacing: 0) { content() }
                .padding(.horizontal, 18)
                .padding(.top, 20)
                .padding(.bottom, 36)
        }
        .background(B91.canvas)
    }
}

struct B91Header: View {
    let eyebrow: String
    let title: String
    var subtitle: String? = nil
    var status: B91Status? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center) {
                B91Eyebrow(eyebrow)
                Spacer()
                if let status { B91StatusPill(status: status) }
            }
            B91Text(title, 30, 800, tracking: -1.0, lineSpacing: 0)
            if let subtitle { B91Text(subtitle, 14, 450, color: B91.muted, lineSpacing: 3) }
        }
        .padding(.bottom, 18)
    }
}

enum B91Status { case active, paused, review, scheduled, notScheduled
    var label: String {
        switch self {
        case .active: "Active"
        case .paused: "Paused"
        case .review: "Review"
        case .scheduled: "Scheduled"
        case .notScheduled: "Not scheduled"
        }
    }
    var color: Color {
        switch self {
        case .active, .scheduled: B91.green
        case .paused, .notScheduled: B91.muted
        case .review: B91.amber
        }
    }
}

struct B91StatusPill: View {
    let status: B91Status
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(status.color).frame(width: 6, height: 6)
            B91Text(status.label, 11, 760, color: status.color)
        }
        .padding(.horizontal, 9)
        .frame(height: 22)
        .background(status.color.opacity(0.12), in: Capsule())
    }
}

struct B91IconTile: View {
    let systemName: String
    var tint: Color = B91.teal
    var size: CGFloat = 34
    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.42, weight: .bold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
}

// MARK: Components

/// A navigable domain card on the Operating Plan root.
struct B91DomainCard: View {
    let icon: String
    var tint: Color = B91.teal
    let eyebrow: String
    let title: String
    let detail: String
    var status: B91Status? = .active
    var field = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            B91IconTile(systemName: icon, tint: field ? B91.fieldInk : tint)
            VStack(alignment: .leading, spacing: 3) {
                B91Eyebrow(eyebrow, color: field ? B91.fieldInk.opacity(0.75) : B91.muted)
                B91Text(title, 16, 760, color: field ? B91.fieldInk : B91.ink)
                B91Text(detail, 12, 450, color: field ? B91.fieldInk.opacity(0.8) : B91.muted)
                if let status { B91StatusPill(status: status).padding(.top, 5) }
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).foregroundStyle(field ? B91.fieldInk : B91.muted)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background {
            if field {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(LinearGradient(colors: [B91.fieldStart, B91.fieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing))
            } else {
                RoundedRectangle(cornerRadius: 16, style: .continuous).fill(B91.surface)
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(B91.rule, lineWidth: field ? 0 : 1))
    }
}

/// The teal-to-navy strategy identity field with Goal / Started / Status.
struct B91HeroField: View {
    let eyebrow: String
    let title: String
    let copy: String
    var goal = "Your Build Lean Mass goal"
    var started: String
    var status: String = "Active"

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            B91Eyebrow(eyebrow, color: B91.fieldInk.opacity(0.8))
            B91Text(title, 26, 800, color: B91.fieldInk, tracking: -0.8, lineSpacing: 0)
            B91Text(copy, 13, 450, color: B91.fieldInk.opacity(0.85), lineSpacing: 3)
            Rectangle().fill(B91.fieldInk.opacity(0.2)).frame(height: 1).padding(.top, 4)
            HStack(alignment: .top, spacing: 12) {
                fact("Goal", goal)
                fact("Started", started)
                VStack(alignment: .leading, spacing: 3) {
                    B91Eyebrow("Status", color: B91.fieldInk.opacity(0.7))
                    HStack(spacing: 5) {
                        Circle().fill(B91.green).frame(width: 6, height: 6)
                        B91Text(status, 13, 760, color: B91.fieldInk)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            ZStack(alignment: .bottomTrailing) {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(LinearGradient(colors: [B91.fieldStart, B91.fieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing))
                Circle().stroke(B91.fieldInk.opacity(0.10), lineWidth: 22)
                    .frame(width: 170, height: 170).offset(x: 60, y: 70)
            }
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            B91Eyebrow(label, color: B91.fieldInk.opacity(0.7))
            B91Text(value, 13, 760, color: B91.fieldInk)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct B91SectionTitle: View {
    let title: String
    var icon: String = "circle.grid.2x1.fill"
    var body: some View {
        HStack(spacing: 8) {
            B91IconTile(systemName: icon, size: 24)
            B91Text(title, 16, 760)
        }
        .padding(.top, 22).padding(.bottom, 10)
    }
}

/// A line-based field: uppercase label column, value, optional chevron.
struct B91FieldRow: View {
    let label: String
    let value: String
    var detail: String? = nil
    var chevron = false
    var accent: Color? = nil
    var toggle: Bool? = nil

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                B91Eyebrow(label, color: B91.muted).frame(width: 112, alignment: .leading)
                VStack(alignment: .leading, spacing: 2) {
                    B91Text(value, 14, 720, color: accent ?? B91.ink)
                    if let detail { B91Text(detail, 12, 450, color: B91.muted) }
                }
                Spacer(minLength: 4)
                if let toggle { B91Toggle(on: toggle) }
                if chevron { Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(B91.muted) }
            }
            .padding(.vertical, 13)
            .frame(minHeight: 44)
            Rectangle().fill(B91.rule).frame(height: 1)
        }
    }
}

struct B91Toggle: View {
    let on: Bool
    var body: some View {
        Capsule().fill(on ? B91.green : B91.rule)
            .frame(width: 46, height: 28)
            .overlay(alignment: on ? .trailing : .leading) {
                Circle().fill(.white).frame(width: 24, height: 24).padding(2).shadow(color: .black.opacity(0.15), radius: 1, y: 1)
            }
    }
}

struct B91MetricTile: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            B91Eyebrow(label, color: B91.fieldInk.opacity(0.75))
            B91Text(value, 20, 800, color: B91.fieldInk, tracking: -0.4, lineSpacing: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .background(LinearGradient(colors: [B91.fieldStart, B91.fieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct B91Button: View {
    enum Style { case primary, navy, quiet, destructive }
    let title: String
    var systemImage: String? = nil
    var style: Style = .primary

    var body: some View {
        HStack(spacing: 7) {
            if let systemImage { Image(systemName: systemImage).font(.system(size: 13, weight: .bold)) }
            B91Text(title, 15, 760, color: foreground)
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, minHeight: 50)
        .background {
            switch style {
            case .primary:
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(LinearGradient(colors: [B91.teal, B91.navy], startPoint: .leading, endPoint: .trailing))
            case .navy:
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(B91.navy)
            case .quiet:
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(B91.surface)
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(B91.rule, lineWidth: 1))
            case .destructive:
                RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(B91.red.opacity(0.55), lineWidth: 1.2)
            }
        }
    }

    private var foreground: Color {
        switch style {
        case .primary, .navy: .white
        case .quiet: B91.teal
        case .destructive: B91.red
        }
    }
}

struct B91Note: View {
    let icon: String
    var tint: Color = B91.cyan
    let title: String
    let copy: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).font(.system(size: 13, weight: .bold)).foregroundStyle(tint).frame(width: 18)
            VStack(alignment: .leading, spacing: 3) {
                B91Text(title, 13, 760)
                B91Text(copy, 12, 450, color: B91.muted, lineSpacing: 3)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(tint.opacity(0.22), lineWidth: 1))
    }
}

struct B91Card<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(.horizontal, 14)
            .background(B91.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(B91.rule, lineWidth: 1))
    }
}

// MARK: OP-A — root, Coaching Updates, Next DEXA Scan

struct B91Landing: View {
    var body: some View {
        B91Screen(back: "You") {
            B91Header(eyebrow: "Operating Plan", title: "Your Operating Plan",
                      subtitle: "Current strategy across every domain, and the protocols that support it.")
            VStack(spacing: 10) {
                B91DomainCard(icon: "bolt.fill", eyebrow: "Energy Strategy", title: "Current Phase Energy Plan",
                              detail: "2,500 kcal/day intake · 800 kcal/day activity · Monthly review", field: true)
                B91DomainCard(icon: "fork.knife", tint: B91.green, eyebrow: "Nutrition", title: "Macro Strategy",
                              detail: "1 g per lb · Performance carbohydrates")
                B91DomainCard(icon: "dumbbell.fill", tint: B91.purple, eyebrow: "Training", title: "Training Strategy",
                              detail: "9 area sessions · Chest/Back focus · Moderate")
                B91DomainCard(icon: "figure.cooldown", tint: B91.cyan, eyebrow: "Recovery", title: "Recovery Strategy",
                              detail: "1 current method")
                B91DomainCard(icon: "syringe.fill", tint: B91.purple, eyebrow: "Peptides", title: "Peptide Strategy",
                              detail: "1 active · 1 paused")
                B91DomainCard(icon: "pills.fill", tint: B91.green, eyebrow: "Supplements", title: "Supplement Strategy",
                              detail: "Current daily support")
                B91DomainCard(icon: "scalemass.fill", tint: B91.cyan, eyebrow: "Tracking", title: "Tracking",
                              detail: "Morning Weigh-In Support")
                B91DomainCard(icon: "text.bubble.fill", tint: B91.purple, eyebrow: "Coaching Updates", title: "Coaching Updates",
                              detail: "Midweek calibration and weekly synthesis")
            }
            B91Text("One title (no duplicate system title). A failed load shows Try Again in place of the cards.", 11, 500, color: B91.muted)
                .padding(.top, 14)
        }
    }
}

struct B91CoachingDetail: View {
    var body: some View {
        B91Screen(back: "Operating Plan") {
            B91HeroField(eyebrow: "Coaching Updates", title: "Wednesday and Sunday Coaching",
                         copy: "Turn current evidence into timely coaching without returning to routine daily briefings.",
                         started: "July 19, 2026")
            B91SectionTitle(title: "Strategy Detail", icon: "text.alignleft")
            B91FieldRow(label: "Midweek calibration", value: "Wednesday · 6:00 PM")
            B91FieldRow(label: "Weekly synthesis", value: "Sunday · 9:00 AM")
            B91FieldRow(label: "Routine daily briefings", value: "Off")
            B91FieldRow(label: "Notifications", value: "Notify when ready")
            B91FieldRow(label: "Event briefings", value: "Photo and DEXA remain active when eligible")
            B91SectionTitle(title: "Scheduled Evidence", icon: "calendar")
            B91Card {
                B91FieldRow(label: "Next DEXA scan", value: "Fri, Oct 9 · 7:30 AM", detail: "3 reminders · Upload reminder on", chevron: true)
                B91FieldRow(label: "Progress Photos", value: "Every 2 weeks on Saturday", detail: "Next: October 17", chevron: false)
            }
            B91Text("New: the saved DEXA appointment is visible here (read-only summary of the same Coaching Updates record) and opens Next DEXA Scan.", 11, 500, color: B91.muted)
                .padding(.top, 10)
            B91Button(title: "Edit Coaching Updates", style: .navy).padding(.top, 18)
        }
    }
}

struct B91DexaPage: View {
    enum Mode { case scheduled, notScheduled, noCoaching, failed }
    let state: Mode

    var body: some View {
        B91Screen(back: "DEXA tomorrow") {
            switch state {
            case .scheduled: scheduled
            case .notScheduled: notScheduled
            case .noCoaching: noCoaching
            case .failed: failed
            }
        }
    }

    private var header: some View {
        B91Header(eyebrow: "DEXA · Coaching Updates", title: "Next DEXA Scan",
                  subtitle: "Your appointment and reminders. Completed scans live in Evidence.",
                  status: state == .scheduled ? .scheduled : state == .notScheduled ? .notScheduled : nil)
    }

    private var scheduled: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            VStack(alignment: .leading, spacing: 8) {
                B91Eyebrow("Appointment", color: B91.fieldInk.opacity(0.8))
                B91Text("Fri, Oct 9", 30, 800, color: B91.fieldInk, tracking: -1)
                B91Text("7:30 AM · Pacific Time · in 3 days", 14, 650, color: B91.fieldInk.opacity(0.85))
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [B91.fieldStart, B91.fieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            B91SectionTitle(title: "Reminders", icon: "bell.fill")
            B91FieldRow(label: "1 week before", value: "On", accent: B91.green)
            B91FieldRow(label: "1 day before", value: "On", accent: B91.green)
            B91FieldRow(label: "Morning of", value: "On", accent: B91.green)
            B91FieldRow(label: "Upload results", value: "Remind me after the appointment")
            B91SectionTitle(title: "Preparation", icon: "sparkles")
            B91Text("Use consistent morning preparation conditions.", 14, 600)
            B91SectionTitle(title: "After the scan", icon: "doc.text.magnifyingglass")
            B91FieldRow(label: "DEXA Event briefing", value: "On", detail: "Generated when the scan is confirmed in Evidence", accent: B91.green)
            VStack(spacing: 10) {
                B91Button(title: "Edit DEXA Schedule", systemImage: "calendar.badge.clock", style: .primary)
                B91Button(title: "Open Coaching Updates", style: .quiet)
            }
            .padding(.top, 22)
            B91Text("Saved together with Progress Photos in Coaching Updates — one record, one Save.", 11, 500, color: B91.muted)
                .padding(.top, 10)
        }
    }

    private var notScheduled: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            B91Note(icon: "calendar.badge.plus", tint: B91.cyan, title: "No DEXA scan scheduled",
                    copy: "Add the date and time to get reminders and a DEXA Event briefing after the scan.")
            B91SectionTitle(title: "Last scan", icon: "chart.bar.doc.horizontal")
            B91FieldRow(label: "Most recent", value: "Sep 12, 2026", detail: "View in Evidence → DEXA", chevron: true)
            VStack(spacing: 10) {
                B91Button(title: "Schedule DEXA Scan", systemImage: "calendar.badge.plus", style: .primary)
                B91Button(title: "Open Coaching Updates", style: .quiet)
            }
            .padding(.top, 22)
        }
    }

    private var noCoaching: some View {
        VStack(alignment: .leading, spacing: 0) {
            B91Header(eyebrow: "DEXA", title: "Next DEXA Scan",
                      subtitle: "DEXA scheduling belongs to Coaching Updates.")
            B91Note(icon: "exclamationmark.circle", tint: B91.amber, title: "Coaching Updates isn't active",
                    copy: "Your Operating Plan has no active Coaching Updates strategy, so there is no DEXA schedule to show or edit.")
            B91Button(title: "Open Operating Plan", style: .quiet).padding(.top, 22)
        }
    }

    private var failed: some View {
        VStack(alignment: .leading, spacing: 0) {
            B91Header(eyebrow: "DEXA · Coaching Updates", title: "Next DEXA Scan")
            B91Note(icon: "wifi.exclamationmark", tint: B91.amber, title: "Couldn't load your DEXA schedule",
                    copy: "Nothing was changed. Check your connection and try again.")
            B91Button(title: "Try Again", systemImage: "arrow.clockwise", style: .navy).padding(.top, 22)
        }
    }
}

struct B91CoachingEditDexa: View {
    var body: some View {
        B91Screen(back: "Cancel") {
            B91Header(eyebrow: "Coaching Updates", title: "Edit Coaching Updates",
                      subtitle: "Opened at DEXA. Midweek, Weekly, Monthly and Progress Photos are above and save together.")
            HStack(spacing: 6) {
                Image(systemName: "arrow.up").font(.system(size: 11, weight: .bold))
                B91Text("Midweek · Weekly · Monthly · Progress Photos", 12, 650, color: B91.muted)
            }
            .foregroundStyle(B91.muted)
            .padding(.bottom, 12)
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    B91Text("DEXA", 18, 800)
                    Spacer()
                    B91Text("From Next DEXA Scan", 11, 700, color: B91.amber)
                }
                .padding(.top, 14).padding(.bottom, 6)
                B91Text("Schedule your next scan and choose the in-app reminders that support it.", 12, 450, color: B91.muted)
                    .padding(.bottom, 4)
                B91FieldRow(label: "Next scan date", value: "Oct 9, 2026", chevron: true)
                B91FieldRow(label: "Time", value: "7:30 AM", chevron: true)
                B91FieldRow(label: "Preparation note", value: "Use consistent morning preparation conditions.")
                B91FieldRow(label: "1 week before", value: "", toggle: true)
                B91FieldRow(label: "1 day before", value: "", toggle: true)
                B91FieldRow(label: "Morning of", value: "", toggle: true)
                B91FieldRow(label: "Upload reminder", value: "After the appointment", toggle: true)
                B91FieldRow(label: "DEXA Event briefing", value: "", toggle: true)
            }
            .padding(.horizontal, 14)
            .background(B91.amber.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(B91.amber.opacity(0.35), lineWidth: 1.2))
            B91Button(title: "Save Coaching Updates", style: .navy).padding(.top, 18)
            B91Text("Same atomic editor and Save as today (expectedCurrentVersionId; stale saves fail closed). Only the scroll anchor is new.", 11, 500, color: B91.muted)
                .padding(.top, 10)
        }
    }
}

// MARK: OP-B — strategy details

struct B91EnergyDetail: View {
    var body: some View {
        B91Screen(back: "Operating Plan") {
            B91HeroField(eyebrow: "Energy Strategy", title: "Lean Mass Build Energy Plan",
                         copy: "Follow the current intake and activity targets for this phase while watching how the body responds and keeping the Guardrail in view.",
                         started: "August 15, 2026")
            B91SectionTitle(title: "Current Strategy", icon: "bolt.fill")
            HStack(spacing: 10) {
                B91MetricTile(label: "Plan type", value: "Following the active phase's targets")
                B91MetricTile(label: "Caloric intake", value: "2,500 kcal/day")
            }
            .padding(.bottom, 4)
            B91FieldRow(label: "Activity target", value: "800 kcal/day")
            B91FieldRow(label: "Evidence monitoring", value: "Weekly evidence review")
            B91FieldRow(label: "Strategic review", value: "Monthly · DEXA and body composition aligned")
            B91FieldRow(label: "Strategy changes", value: "Adjusted as the evidence supports it")
            B91Text("Read-only by design: Energy follows the active phase. No Edit action.", 11, 500, color: B91.muted).padding(.top, 12)
        }
    }
}

struct B91NutritionDetail: View {
    var body: some View {
        B91Screen(back: "Operating Plan") {
            B91HeroField(eyebrow: "Nutrition Strategy", title: "Macro Strategy",
                         copy: "Define how daily intake is composed across protein, carbohydrates, and fats to support your Build Lean Mass goal.",
                         started: "July 25, 2026")
            B91SectionTitle(title: "Current Strategy", icon: "fork.knife")
            HStack(spacing: 10) {
                B91MetricTile(label: "Protein target", value: "1 g per lb of body weight")
                B91MetricTile(label: "Carbohydrate approach", value: "Performance")
            }
            .padding(.bottom, 4)
            B91FieldRow(label: "Fat approach", value: "Sustainable Minimum")
            B91FieldRow(label: "Macro philosophy", value: "Flexible across training and rest days")
            B91Button(title: "Edit Strategy", style: .primary).padding(.top, 20)
        }
    }
}

// MARK: OP-C — Peptides

struct B91PeptideDomain: View {
    var body: some View {
        B91Screen(back: "Operating Plan") {
            B91Header(eyebrow: "Peptides", title: "Peptide Strategy",
                      subtitle: "Active dosing strategies supporting body composition and recovery.")
            VStack(spacing: 12) {
                peptide(name: "Retatrutide", purpose: "Support nutrition consistency and body-composition direction.",
                        dose: "1.5 mg", schedule: "Thursday · 9:45 PM", status: .paused)
                peptide(name: "Tesamorelin", purpose: "Support recovery and training consistency.",
                        dose: "0.5 mg", schedule: "Sun–Thu · 10:29 PM", status: .active)
            }
            B91Text("Manage and Resume are full 44 pt controls (today: 12 pt text buttons).", 11, 500, color: B91.muted).padding(.top, 12)
        }
    }

    private func peptide(name: String, purpose: String, dose: String, schedule: String, status: B91Status) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                B91IconTile(systemName: "syringe.fill", tint: B91.purple)
                VStack(alignment: .leading, spacing: 3) {
                    B91Text(name, 16, 780)
                    B91Text(purpose, 12, 450, color: B91.muted)
                }
                Spacer()
                B91StatusPill(status: status)
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) { B91Eyebrow("Current dose", color: B91.muted); B91Text(dose, 14, 760) }
                    .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) { B91Eyebrow("Schedule", color: B91.muted); B91Text(schedule, 14, 760) }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: 10) {
                B91Button(title: "Manage", style: .quiet)
                if status == .paused { B91Button(title: "Resume", systemImage: "play.fill", style: .navy) }
            }
        }
        .padding(14)
        .background(B91.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(B91.rule, lineWidth: 1))
    }
}

struct B91PeptideExecution: View {
    var body: some View {
        B91Screen(back: "Peptides") {
            B91Header(eyebrow: "Peptide", title: "Retatrutide",
                      subtitle: "Support nutrition consistency and body-composition direction as you work toward your Build Lean Mass goal.",
                      status: .paused)
            B91Card {
                B91FieldRow(label: "Dose", value: "1.5 mg", chevron: true)
                B91FieldRow(label: "Days", value: "Thursday", chevron: true)
                B91FieldRow(label: "Time", value: "9:45 PM", chevron: true)
                B91FieldRow(label: "Next dose", value: "Paused", detail: "Reminders stop until you resume")
                B91FieldRow(label: "Planned change", value: "2.5 mg · Oct 8", accent: B91.amber)
                B91FieldRow(label: "Reminder", value: "", toggle: true)
                B91FieldRow(label: "Notes", value: "Fasted before bed.", chevron: true)
            }
            B91Button(title: "Resume Retatrutide", systemImage: "play.fill", style: .navy).padding(.top, 16)
            HStack {
                B91Text("Advanced · dose plan", 14, 760)
                Spacer()
                Image(systemName: "chevron.down").font(.system(size: 12, weight: .bold)).foregroundStyle(B91.muted)
            }
            .frame(minHeight: 44)
            .padding(.top, 10)
            VStack(alignment: .leading, spacing: 10) {
                B91Eyebrow("Current plan", color: B91.fieldInk.opacity(0.8))
                B91Text("Increase, hold, then decrease · finished Aug 6", 16, 780, color: B91.fieldInk)
                ForEach([("0.5 mg", "May 21 – May 27", B91.amber), ("1.0 mg", "May 28 – Jun 3", B91.amber), ("1.5 mg", "Aug 6 – Until changed", B91.teal)], id: \.0) { step in
                    HStack(spacing: 10) {
                        Circle().stroke(step.2, lineWidth: 2.5).frame(width: 12, height: 12)
                        VStack(alignment: .leading, spacing: 1) {
                            B91Text(step.0, 14, 760, color: B91.fieldInk)
                            B91Text(step.1, 11, 500, color: B91.fieldInk.opacity(0.75))
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LinearGradient(colors: [B91.fieldStart, B91.fieldEnd], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            HStack {
                B91Text("Dose history · 7 entries", 13, 700)
                Spacer()
                B91Text("Show all", 13, 760, color: B91.teal)
            }
            .frame(minHeight: 44)
        }
    }
}

// MARK: OP-D — Tracking

struct B91Tracking: View {
    var body: some View {
        B91Screen(back: "Operating Plan") {
            B91Header(eyebrow: "Tracking", title: "Tracking", subtitle: "Recurring measurements that keep the evidence current.")
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    B91IconTile(systemName: "scalemass.fill", tint: B91.cyan)
                    VStack(alignment: .leading, spacing: 3) {
                        B91Eyebrow("Current tracking routine", color: B91.muted)
                        B91Text("Morning Weigh-In", 17, 780)
                        B91Text("Daily · after waking · reminder 6:30 AM", 12, 450, color: B91.muted)
                    }
                    Spacer()
                    B91StatusPill(status: .active)
                }
                B91FieldRow(label: "Next due", value: "Tomorrow · 6:30 AM")
                B91FieldRow(label: "Completion", value: "Completes from your logged weight", detail: "Evidence-owned — no manual check-off")
                B91Button(title: "Edit Support", style: .quiet)
            }
            .padding(14)
            .background(B91.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(B91.rule, lineWidth: 1))
        }
    }
}
