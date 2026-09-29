import SwiftUI

/// One pushed screen per peptide (design §3): a card whose rows are the
/// affordance (Dose / Days / Time / Notes open a focused sheet, Reminder is
/// an inline toggle), Pause or Resume under it, and an "Advanced · dose
/// plan" disclosure for the generator in plain language. The same
/// destination and chrome as Build 69; the in-place `isEditing` long form
/// survives only as the legacy fallback.
///
/// Feature detection (design §4 deploy order): the card, sheets and Pause
/// render only when the peptide-support read decodes `lifecycle`,
/// `currentDose` and `executionRevision`. Otherwise the Build 69 detail +
/// full editor path is shown (with the renamed copy), so this build can
/// never send a history-rewriting `stay` to a Server without S1.
///
/// Founder Production reads and writes the canonical peptide Support model
/// through PeptideSupportAPI / PeptideLifecycleAPI via
/// `PeptideSupportEditorViewModel`. A failed production read fails closed;
/// sandbox data is never substituted.
struct OperatingPlanPeptideExecutionView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let protocolId: String
    var onNavigate: (AppDestination) -> Void = { _ in }

    private enum Sheet: String, Identifiable {
        case dose, days, time, notes
        var id: String { rawValue }
    }

    @State private var viewModel: PeptideSupportEditorViewModel?
    @State private var activeSheet: Sheet?
    @State private var isConfirmingPause = false
    @State private var pauseStart: PeptideLifecycleEffectiveDate = .today
    @State private var reminderOverride: Bool?
    @State private var isAdvancedExpanded = false
    @State private var hasSeededAdvancedExpansion = false
    @State private var advancedDraft: OperatingPlanPeptideExecutionReadModel?
    @State private var isConfirmingRewrite = false
    @State private var showsAllHistory = false
    // Legacy fallback (no S4 payload): Build 69's in-place editor.
    @State private var isLegacyEditing = false
    @State private var legacyDraft: OperatingPlanPeptideExecutionReadModel?

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { isLegacyEditing ? (isLegacyEditing = false) : dismiss() } label: {
                    Label(isLegacyEditing ? "Cancel" : "Peptides", systemImage: isLegacyEditing ? "xmark" : "arrow.left")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: "\(protocolId):\(environment.nativeAuthority)") { await load() }
        .sheet(item: $activeSheet) { sheet in
            if let viewModel {
                switch sheet {
                case .dose:
                    PeptideChangeDoseSheet(viewModel: viewModel, onNavigate: onNavigate) { activeSheet = nil }
                case .days:
                    PeptideDaysSheet(viewModel: viewModel) { activeSheet = nil }
                case .time:
                    PeptideTimeSheet(viewModel: viewModel) { activeSheet = nil }
                case .notes:
                    PeptideNotesSheet(viewModel: viewModel) { activeSheet = nil }
                }
            }
        }
    }

    private func load() async {
        let model: PeptideSupportEditorViewModel
        if let existing = viewModel, existing.authority == environment.nativeAuthority {
            model = existing
        } else {
            model = PeptideSupportEditorViewModel(protocolId: protocolId, environment: environment)
            viewModel = model
        }
        await model.load()
        if !hasSeededAdvancedExpansion, model.detail != nil {
            hasSeededAdvancedExpansion = true
            isAdvancedExpanded = model.hasAdvancedPlan
        }
    }

    /// Production reads fail closed: a failed peptide-support read shows the
    /// unavailable copy, never the sandbox fixture.
    private var isProduction: Bool { environment.nativeAuthority == .founderProduction }

    @ViewBuilder
    private var content: some View {
        if let viewModel {
            switch viewModel.state {
            case .loading:
                ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
            case .failed(let message):
                OperatingPlanUnavailableView(message: isProduction ? message : PeptideSupportEditorViewModel.unavailableCopy)
            case .loaded(let detail):
                if viewModel.supportsSimpleEditor {
                    simpleScreen(viewModel, detail: detail)
                } else if isLegacyEditing, let legacyDraft {
                    legacyEditor(viewModel, draft: legacyDraft)
                } else {
                    legacyDetail(viewModel, detail: detail)
                }
            }
        } else {
            ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
        }
    }

    // MARK: - Simple screen (design §3)

    private func simpleScreen(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            OperatingPlanScreenHeader(eyebrow: "Peptide", title: detail.name, subtitle: detail.purpose)

            card(viewModel, detail: detail)

            if let errorMessage = viewModel.errorMessage, activeSheet == nil {
                OperatingPlanEditorErrorBanner(message: errorMessage)
            }

            lifecycleControls(viewModel, detail: detail)

            advancedDisclosure(viewModel, detail: detail)
        }
    }

    private func card(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) -> some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .center, spacing: 10) {
                    IconBadge(systemImage: OperatingPlanIcon.systemImage(for: "peptide"), color: .effort, size: .sm, isCircular: true)
                    Text(detail.name)
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Spacer(minLength: 6)
                    if viewModel.isPaused {
                        StatusChip(text: "Paused", color: .muted)
                    } else {
                        StatusChip(text: "Active", color: .success)
                    }
                }
                .padding(.bottom, 6)
                .accessibilityElement(children: .combine)

                actionRow(label: "Dose", value: viewModel.doseLabel ?? "Set a dose", identifier: "operatingPlan.peptide.row.dose", isSaving: viewModel.isSaving) {
                    activeSheet = .dose
                }
                actionRow(label: "Days", value: viewModel.daysLabel, identifier: "operatingPlan.peptide.row.days", isSaving: viewModel.isSaving) {
                    activeSheet = .days
                }
                actionRow(label: "Time", value: viewModel.timeLabel, identifier: "operatingPlan.peptide.row.time", isSaving: viewModel.isSaving) {
                    activeSheet = .time
                }
                if let next = viewModel.nextDoseLabel {
                    readOnlyRow(label: "Next dose", value: next)
                }
                if let planned = viewModel.plannedChangeLabel {
                    readOnlyRow(label: "Planned change", value: planned)
                }
                if let since = viewModel.pausedSinceLabel {
                    readOnlyRow(label: "Paused since", value: since)
                }
                reminderRow(viewModel)
                actionRow(label: "Notes", value: detail.notes.isEmpty ? "Add notes" : detail.notes, identifier: "operatingPlan.peptide.row.notes", isSaving: viewModel.isSaving) {
                    activeSheet = .notes
                }
            }
        }
    }

    /// A tappable row: label/value, trailing chevron, a 44pt target, read
    /// by VoiceOver as one button with a "Double tap to change" hint.
    private func actionRow(label: String, value: String, identifier: String, isSaving: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 8) {
                OperatingPlanFieldRow(label: label, value: value)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Double tap to change")
        .accessibilityIdentifier(identifier)
    }

    private func readOnlyRow(label: String, value: String) -> some View {
        OperatingPlanFieldRow(label: label, value: value)
            .frame(minHeight: 44)
    }

    /// Inline toggle that saves immediately. The switch shows the intended
    /// value while the save is in flight and reverts (with the banner under
    /// the card) when the Server refuses it.
    private func reminderRow(_ viewModel: PeptideSupportEditorViewModel) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Text("Reminder")
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Spacer(minLength: 8)
            Toggle("Reminder", isOn: Binding(
                get: { reminderOverride ?? viewModel.reminderEnabled },
                set: { enabled in
                    reminderOverride = enabled
                    Task { @MainActor in
                        _ = await viewModel.setReminder(enabled)
                        reminderOverride = nil
                    }
                }
            ))
            .labelsHidden()
            .tint(PhysiqueOSTheme.accent)
            .disabled(viewModel.isSaving)
            .accessibilityLabel("Reminder")
            .accessibilityIdentifier("operatingPlan.peptide.toggle.reminder")
        }
        .frame(minHeight: 44)
    }

    // MARK: - Pause / Resume (S3)

    @ViewBuilder
    private func lifecycleControls(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if viewModel.isPaused {
                PrimaryActionButton(title: "Resume \(detail.name)", isEnabled: !viewModel.isSaving) {
                    Task { @MainActor in _ = await viewModel.resume() }
                }
                .accessibilityIdentifier("operatingPlan.peptide.resume")
            } else {
                if viewModel.todayHasScheduledDose {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 10) {
                                Text("Starting")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Spacer(minLength: 8)
                                Menu {
                                    Button("Today") { pauseStart = .today }
                                    Button("Tomorrow") { pauseStart = .tomorrow }
                                } label: {
                                    HStack(spacing: 6) {
                                        Text(pauseStart == .tomorrow ? "Tomorrow" : "Today")
                                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                            .foregroundStyle(PhysiqueOSTheme.accent)
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                    }
                                }
                                .accessibilityIdentifier("operatingPlan.peptide.pause.start")
                            }
                            .frame(minHeight: 44)
                            Text("Today's dose is not marked complete; choose Tomorrow if you took it")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                Button("Pause \(detail.name)") { isConfirmingPause = true }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
                    .padding(.vertical, 8)
                    .disabled(viewModel.isSaving)
                    .accessibilityIdentifier("operatingPlan.peptide.pause")
                    .confirmationDialog(
                        "Pause \(detail.name)?",
                        isPresented: $isConfirmingPause,
                        titleVisibility: .visible
                    ) {
                        Button("Pause", role: .destructive) {
                            Task { @MainActor in _ = await viewModel.pause(effectiveDate: pauseStart) }
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text(Self.pauseDialogMessage(startsTomorrow: pauseStart == .tomorrow))
                    }
            }
            if let result = viewModel.resultMessage {
                Text(result)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("operatingPlan.peptide.lifecycle.result")
            }
        }
    }

    static func pauseDialogMessage(startsTomorrow: Bool) -> String {
        let base = "Upcoming doses and reminders stop until you resume. Your dose history is kept."
        return startsTomorrow ? base + " Pausing starts tomorrow." : base
    }

    // MARK: - Advanced · dose plan

    private func advancedDisclosure(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) -> some View {
        PhysiqueOSDisclosureRow(isExpanded: $isAdvancedExpanded) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Advanced · dose plan")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(viewModel.advancedSummary)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                    .rotationEffect(.degrees(isAdvancedExpanded ? 180 : 0))
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 44)
        } expanded: {
            advancedContent(viewModel, detail: detail)
        }
        .accessibilityIdentifier("operatingPlan.peptide.advanced.toggle")
    }

    @ViewBuilder
    private func advancedContent(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) -> some View {
        let draft = advancedDraft ?? PeptideSupportEditorViewModel.readModel(from: detail)
        let rewritesHistory = draft.dosing.pattern != .custom && draft.dosing.startDate < viewModel.today
        VStack(alignment: .leading, spacing: 18) {
            PeptideDosePlanEditor(
                dosing: Binding(
                    get: { (advancedDraft ?? PeptideSupportEditorViewModel.readModel(from: detail)).dosing },
                    set: { dosing in
                        var next = advancedDraft ?? PeptideSupportEditorViewModel.readModel(from: detail)
                        next.dosing = dosing
                        advancedDraft = next
                    }
                ),
                today: viewModel.today
            )

            if rewritesHistory || viewModel.isManualPlan {
                PrimaryActionButton(title: "Start a new plan from today", isEnabled: !viewModel.isSaving) {
                    startNewPlan(viewModel, detail: detail)
                }
                .accessibilityIdentifier("operatingPlan.peptide.advanced.startNew")
                Button("Save changes to this plan") { isConfirmingRewrite = true }
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
                    .disabled(viewModel.isSaving || viewModel.isManualPlan && draft.dosing.pattern == .custom)
                    .accessibilityIdentifier("operatingPlan.peptide.advanced.save")
                    .confirmationDialog(
                        "Rewrite your dose history?",
                        isPresented: $isConfirmingRewrite,
                        titleVisibility: .visible
                    ) {
                        Button("Rewrite history", role: .destructive) {
                            saveAdvanced(viewModel, draft: draft, rewriteHistory: true)
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("This plan starts \(PeptideSupportPresentation.shortDate(draft.dosing.startDate)), before today. Saving regenerates what your dose history says you took from that date. Choose Start a new plan from today to keep it.")
                    }
            } else {
                PrimaryActionButton(title: viewModel.isSaving ? "Saving…" : "Save plan", isEnabled: !viewModel.isSaving) {
                    saveAdvanced(viewModel, draft: draft, rewriteHistory: false)
                }
                .accessibilityIdentifier("operatingPlan.peptide.advanced.save")
            }

            doseHistory(viewModel)
        }
    }

    /// Seeds a steady plan from the current dose starting today; the user
    /// then picks how it changes and saves.
    private func startNewPlan(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) {
        var next = advancedDraft ?? PeptideSupportEditorViewModel.readModel(from: detail)
        if let dose = detail.currentDose {
            next.dosing.startingDoseAmount = dose.amount
            next.dosing.startingDoseUnit = dose.unit
        }
        next.dosing.startDate = viewModel.today
        if next.dosing.pattern == .custom { next.dosing.pattern = .stay }
        next.dosing.endDate = nil
        advancedDraft = next
    }

    private func saveAdvanced(_ viewModel: PeptideSupportEditorViewModel, draft: OperatingPlanPeptideExecutionReadModel, rewriteHistory: Bool) {
        Task { @MainActor in
            if await viewModel.advancedSave(draft: draft, rewriteHistory: rewriteHistory) {
                advancedDraft = nil
            }
        }
    }

    @ViewBuilder
    private func doseHistory(_ viewModel: PeptideSupportEditorViewModel) -> some View {
        let lines = viewModel.dosingHistoryLines
        if !lines.isEmpty {
            OperatingPlanSection("Dose history") {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array((showsAllHistory ? lines : Array(lines.prefix(3))).enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    }
                    if lines.count > 3 {
                        Button(showsAllHistory ? "Show less" : "Show all") { showsAllHistory.toggle() }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                            .frame(minHeight: 44)
                            .accessibilityIdentifier("operatingPlan.peptide.history.toggle")
                    }
                }
            }
        }
    }

    // MARK: - Legacy fallback (no S4 payload)

    /// Build 69's read-only detail, with the critique's copy: the rows say
    /// what the dose is and since when, never which "phase" it is.
    private func legacyDetail(_ viewModel: PeptideSupportEditorViewModel, detail: PeptideSupportDetail) -> some View {
        let active = detail.timeline.first { $0.status == "active" }
        let upcoming = detail.timeline.first { ["scheduled", "upcoming"].contains($0.status) }
        return VStack(alignment: .leading, spacing: 16) {
            OperatingPlanScreenHeader(eyebrow: "Peptide", title: detail.name, subtitle: detail.purpose)

            OperatingPlanSection("Current dose") {
                CardContainer(padding: .sm) {
                    VStack(alignment: .leading, spacing: 8) {
                        OperatingPlanFieldRow(label: "Dose", value: viewModel.doseLabel ?? "No current dose")
                        OperatingPlanFieldRow(label: "Since", value: active?.window ?? "No current dose")
                        OperatingPlanFieldRow(label: "Schedule", value: OperatingPlanSchedulePresentation.formatSupportSchedule(detail.supportSchedule))
                        if let nextDue = viewModel.nextDoseLabel { OperatingPlanFieldRow(label: "Next dose", value: nextDue) }
                        OperatingPlanFieldRow(
                            label: "Next change",
                            value: upcoming.map { "\(PeptideSupportPresentation.formatDose($0.doseAmount, $0.doseUnit)) · \($0.window)" } ?? "None planned"
                        )
                        if detail.state == .invalid { OperatingPlanFieldRow(label: "Status", value: "Set a dose") }
                    }
                }
            }

            if !detail.timeline.isEmpty {
                OperatingPlanSection("Dose history") {
                    VStack(spacing: 7) {
                        ForEach(detail.timeline) { phase in
                            CardContainer(padding: .sm) {
                                HStack {
                                    Text("\(PeptideSupportPresentation.formatDose(phase.doseAmount, phase.doseUnit)) · \(phase.window)")
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(phase.status == "active" ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textPrimary)
                                    Spacer()
                                }
                            }
                        }
                    }
                }
            }

            if let errorMessage = viewModel.errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }

            PrimaryActionButton(title: "Edit plan") {
                legacyDraft = PeptideSupportEditorViewModel.readModel(from: detail)
                viewModel.errorMessage = nil
                isLegacyEditing = true
            }
            .accessibilityIdentifier("operatingPlan.peptide.editSupport")
        }
    }

    /// Build 69's full editor (schedule, plan, reminder, notes, one Save),
    /// against a Server that does not yet serve the simple contract.
    private func legacyEditor(_ viewModel: PeptideSupportEditorViewModel, draft: OperatingPlanPeptideExecutionReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanScreenHeader(eyebrow: draft.name, title: "Edit plan", subtitle: "Describe the schedule and the dose plan you intend to follow. The dated plan is generated for you.")

            OperatingPlanSupportScheduleEditor(schedule: Binding(
                get: { draft.supportSchedule }, set: { legacyDraft?.supportSchedule = $0 }
            ))

            PeptideDosePlanEditor(dosing: Binding(
                get: { draft.dosing }, set: { legacyDraft?.dosing = $0 }
            ))

            OperatingPlanSection("Reminder") {
                HStack(spacing: 8) {
                    ForEach(OperatingPlanReminderPreference.allCases) { preference in
                        OperatingPlanChoicePill(title: preference.label, isSelected: draft.reminderPreference == preference, minHeight: 44) {
                            legacyDraft?.reminderPreference = preference
                        }
                    }
                }
            }

            OperatingPlanSection("Notes") {
                CardContainer(padding: .sm) {
                    TextField("Notes shown when this dose is opened", text: Binding(
                        get: { draft.notes }, set: { legacyDraft?.notes = $0 }
                    ), axis: .vertical)
                    .lineLimit(3...6)
                }
            }

            if let errorMessage = viewModel.errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
            PrimaryActionButton(title: viewModel.isSaving ? "Saving…" : "Save plan", isEnabled: !viewModel.isSaving) {
                Task { @MainActor in
                    if await viewModel.advancedSave(draft: draft, rewriteHistory: false) {
                        isLegacyEditing = false
                    }
                }
            }
            .accessibilityIdentifier("operatingPlan.peptide.save")
        }
    }
}
