import SwiftUI

/// The peptide screen's focused sheets (design §3): one value each, a
/// medium detent, Cancel/Save, and the Server's refusal shown inside the
/// sheet so the typed value is never lost. Every Save goes through
/// `PeptideSupportEditorViewModel`; the sheet closes only on success.

// MARK: - Shared chrome

/// NavigationStack + medium detent + Cancel/Save, copying `DateField`'s
/// sheet precedent. `Saving…` disables both buttons; swiping away is a
/// Cancel except while a save is in flight.
struct PeptideEditorSheet<Content: View>: View {
    let title: String
    var saveTitle: String = "Save"
    let isSaving: Bool
    let canSave: Bool
    let errorMessage: String?
    let onCancel: () -> Void
    let onSave: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    content
                    if let errorMessage {
                        OperatingPlanErrorText(message: errorMessage)
                    }
                }
                .padding(16)
            }
            .background(OperatingPlanColor.canvas)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(OperatingPlanColor.canvas, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                        .disabled(isSaving)
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : saveTitle, action: onSave)
                        .disabled(isSaving || !canSave)
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.save")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isSaving)
    }
}

/// A caption under a sheet control.
struct PeptideSheetCaption: View {
    let text: String

    var body: some View {
        Text(text)
            .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
            .foregroundStyle(OperatingPlanColor.muted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A label/value pair inside a sheet card.
private struct PeptideSheetRow<Trailing: View>: View {
    let label: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 10) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                .foregroundStyle(OperatingPlanColor.ink)
            Spacer(minLength: 8)
            trailing
        }
        .frame(minHeight: 44)
    }
}

// MARK: - Change dose

/// S2: "keep this dose from a date". Amount + fixed unit + a 0.25 stepper,
/// a "Starts" menu (Today / Next dose / Pick a date…) and the caption that
/// says what happens to an existing plan. When the record has a plan with
/// future changes, "Only the next dose" hands off to the next occurrence's
/// Priority Detail instead of touching the plan at all.
struct PeptideChangeDoseSheet: View {
    enum Start: Equatable {
        case today, nextDose, pickedDate
    }

    enum Scope: Equatable {
        case fromDateOn, onlyNextDose
    }

    let viewModel: PeptideSupportEditorViewModel
    let onNavigate: (AppDestination) -> Void
    let onDismiss: () -> Void

    @State private var amountText: String
    @State private var unit: String
    @State private var start: Start = .today
    @State private var pickedDate: Date
    @State private var scope: Scope = .fromDateOn

    init(viewModel: PeptideSupportEditorViewModel, onNavigate: @escaping (AppDestination) -> Void, onDismiss: @escaping () -> Void) {
        self.viewModel = viewModel
        self.onNavigate = onNavigate
        self.onDismiss = onDismiss
        let dose = viewModel.detail?.currentDose
        let unitValue = dose?.unit ?? viewModel.detail?.dosing.startingDoseUnit ?? "mg"
        _amountText = State(initialValue: dose.map { PeptideSupportPresentation.formatDoseAmount($0.amount) } ?? "")
        _unit = State(initialValue: unitValue.isEmpty ? "mg" : unitValue)
        _pickedDate = State(initialValue: OperatingPlanDateValues.date(from: viewModel.today))
    }

    private var amount: Double? {
        Double(amountText.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces))
    }

    private var nextDoseDate: String? {
        guard let next = viewModel.detail?.nextDueDate, next != viewModel.today else { return nil }
        return next
    }

    private var effectiveDate: String {
        switch start {
        case .today: viewModel.today
        case .nextDose: nextDoseDate ?? viewModel.today
        case .pickedDate: OperatingPlanDateValues.dateKey(from: pickedDate)
        }
    }

    private var startLabel: String {
        switch start {
        case .today: "Today"
        case .nextDose: "Next dose (\(nextDoseDate.map(PeptideSupportPresentation.shortDate) ?? ""))"
        case .pickedDate: PeptideSupportPresentation.shortDate(effectiveDate)
        }
    }

    private var canSave: Bool {
        if scope == .onlyNextDose { return nextOccurrenceDestination != nil }
        guard let amount, amount > 0 else { return false }
        return effectiveDate >= viewModel.today
    }

    /// "Only the next dose" hands off to the dose that is open right now, so
    /// it is offered only when that dose is today's.
    private var offersOnlyNextDose: Bool {
        viewModel.hasAdvancedPlan && viewModel.todayHasScheduledDose
    }

    private var nextOccurrenceDestination: AppDestination? {
        guard let priorityId = viewModel.detail?.priorityId, let date = viewModel.detail?.nextDueDate else { return nil }
        return .priorityOccurrence(priorityId: priorityId, occurrenceDate: date)
    }

    var body: some View {
        PeptideEditorSheet(
            title: "Change dose",
            saveTitle: scope == .onlyNextDose ? "Open next dose" : "Save",
            isSaving: viewModel.isSaving,
            canSave: canSave,
            errorMessage: viewModel.errorMessage,
            onCancel: { viewModel.errorMessage = nil; onDismiss() },
            onSave: save
        ) {
            if offersOnlyNextDose {
                HStack(spacing: 8) {
                    OperatingPlanChoicePill(title: "From \(PeptideSupportPresentation.shortDate(effectiveDate)) on", isSelected: scope == .fromDateOn, minHeight: 44) { scope = .fromDateOn }
                    OperatingPlanChoicePill(title: "Only the next dose", isSelected: scope == .onlyNextDose, minHeight: 44) { scope = .onlyNextDose }
                }
                .accessibilityIdentifier("operatingPlan.peptide.sheet.dose.scope")
            }

            if scope == .onlyNextDose {
                OperatingPlanSurface(verticalPadding: 10) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Record what you actually take")
                            .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                            .foregroundStyle(OperatingPlanColor.ink)
                        PeptideSheetCaption(text: "Your plan stays as it is. Open next dose\(viewModel.nextDoseLabel.map { " (\($0))" } ?? "") and enter the amount you took when you mark it complete.")
                    }
                }
            } else {
                OperatingPlanSurface(verticalPadding: 10) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 10) {
                            NumericEditField(text: $amountText, accessibilityLabel: "Dose amount", placeholder: "0")
                                .frame(width: 96, height: 44)
                                .accessibilityIdentifier("operatingPlan.peptide.sheet.dose.amount")
                            Text(unit)
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                                .foregroundStyle(OperatingPlanColor.ink)
                            Spacer(minLength: 8)
                            Stepper(
                                value: Binding(
                                    get: { amount ?? 0 },
                                    set: { amountText = PeptideSupportPresentation.formatDoseAmount(max(0, $0)) }
                                ),
                                in: 0...1000,
                                step: 0.25
                            ) { EmptyView() }
                            .labelsHidden()
                            .accessibilityLabel("Dose")
                            .accessibilityValue("\(amountText) \(unit)")
                        }
                        PeptideSheetRow(label: "Starts") {
                            Menu {
                                Button("Today") { start = .today }
                                if let nextDoseDate {
                                    Button("Next dose (\(PeptideSupportPresentation.shortDate(nextDoseDate)))") { start = .nextDose }
                                }
                                Button("Pick a date…") { start = .pickedDate }
                            } label: {
                                HStack(spacing: 6) {
                                    Text(startLabel)
                                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                                        .foregroundStyle(OperatingPlanColor.teal)
                                    Image(systemName: "chevron.up.chevron.down")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(OperatingPlanColor.muted)
                                }
                            }
                            .accessibilityLabel("Starts")
                            .accessibilityValue(startLabel)
                            .accessibilityIdentifier("operatingPlan.peptide.sheet.dose.starts")
                        }
                        if start == .pickedDate {
                            DateField(
                                date: $pickedDate,
                                maximumDate: .distantFuture,
                                minimumDate: OperatingPlanDateValues.date(from: viewModel.today),
                                label: "Start date"
                            )
                        }
                    }
                }
                if let amount, amount > 0, let caption = viewModel.changeDoseCaption(amount: amount, unit: unit, effectiveDate: effectiveDate) {
                    PeptideSheetCaption(text: caption)
                }
                if effectiveDate < viewModel.today {
                    PeptideSheetCaption(text: PeptideSupportEditorViewModel.pastDateCopy)
                }
            }
        }
        .onAppear { viewModel.errorMessage = nil }
    }

    private func save() {
        if scope == .onlyNextDose {
            guard let destination = nextOccurrenceDestination else { return }
            viewModel.errorMessage = nil
            onDismiss()
            onNavigate(destination)
            return
        }
        guard let amount else { return }
        Task { @MainActor in
            if await viewModel.changeDose(amount: amount, unit: unit, effectiveDate: effectiveDate) {
                onDismiss()
            }
        }
    }
}

// MARK: - Days

/// Seven weekday chips; all seven is the Server's `daily` cadence, anything
/// else `specific_days`. "Repeat every N days instead" reveals the interval
/// stepper. Save is disabled with no day chosen.
struct PeptideDaysSheet: View {
    let viewModel: PeptideSupportEditorViewModel
    let onDismiss: () -> Void

    @State private var selected: Set<OperatingPlanWeekday>
    @State private var usesInterval: Bool
    @State private var interval: Int
    @ScaledMetric(relativeTo: .body) private var chipMinimum: CGFloat = 64

    init(viewModel: PeptideSupportEditorViewModel, onDismiss: @escaping () -> Void) {
        self.viewModel = viewModel
        self.onDismiss = onDismiss
        let schedule = viewModel.detail?.supportSchedule
        _selected = State(initialValue: Set(schedule.map(PeptideSupportPresentation.seedDays(for:)) ?? []))
        _usesInterval = State(initialValue: schedule?.frequency == .everyXDays)
        // Switching a weekly schedule to "every N days" opens at 2, not at
        // the meaningless "every 1 day".
        _interval = State(initialValue: schedule?.frequency == .everyXDays ? max(1, schedule?.intervalDays ?? 2) : 2)
    }

    private var orderedSelection: [OperatingPlanWeekday] {
        OperatingPlanWeekday.allCases.filter { selected.contains($0) }
    }

    private var preview: String {
        let cadence = usesInterval
            ? PeptideSupportPresentation.formatInterval(interval)
            : PeptideSupportPresentation.formatWeekdays(orderedSelection)
        let time = viewModel.timeLabel
        return time.isEmpty ? cadence : "\(cadence) · \(time)"
    }

    private var canSave: Bool { usesInterval || !selected.isEmpty }

    var body: some View {
        PeptideEditorSheet(
            title: "Days",
            isSaving: viewModel.isSaving,
            canSave: canSave,
            errorMessage: viewModel.errorMessage,
            onCancel: { viewModel.errorMessage = nil; onDismiss() },
            onSave: save
        ) {
            OperatingPlanSurface(verticalPadding: 10) {
                VStack(alignment: .leading, spacing: 12) {
                    if usesInterval {
                        Stepper(value: $interval, in: 1...365) {
                            Text(PeptideSupportPresentation.formatInterval(interval))
                                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                                .foregroundStyle(OperatingPlanColor.ink)
                        }
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.days.interval")
                        PeptideSheetCaption(text: "Counting from your next dose.")
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: chipMinimum), spacing: 8)], alignment: .leading, spacing: 8) {
                            ForEach(OperatingPlanWeekday.allCases) { day in
                                OperatingPlanChoicePill(title: day.shortLabel, isSelected: selected.contains(day), minHeight: 44) {
                                    if selected.contains(day) { selected.remove(day) } else { selected.insert(day) }
                                }
                                .accessibilityLabel(day.label)
                            }
                        }
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.days.chips")
                    }
                    Text(preview)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                        .foregroundStyle(OperatingPlanColor.ink)
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.days.preview")
                    Button(usesInterval ? "Choose days of the week instead" : "Repeat every N days instead") {
                        usesInterval.toggle()
                    }
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(OperatingPlanColor.teal)
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("operatingPlan.peptide.sheet.days.mode")
                }
            }
        }
        .onAppear { viewModel.errorMessage = nil }
    }

    private func save() {
        Task { @MainActor in
            let saved = usesInterval
                ? await viewModel.changeInterval(everyNDays: interval)
                : await viewModel.changeDays(daysOfWeek: orderedSelection)
            if saved { onDismiss() }
        }
    }
}

// MARK: - Time

/// A native wheel seeded from the exact time, or from the bucket
/// (morning 08:00 / afternoon 13:00 / evening 20:00) with "Currently set
/// to Evening" so a bucket is only overwritten knowingly.
struct PeptideTimeSheet: View {
    let viewModel: PeptideSupportEditorViewModel
    let onDismiss: () -> Void

    @State private var time: Date
    private let seedTime: String

    init(viewModel: PeptideSupportEditorViewModel, onDismiss: @escaping () -> Void) {
        self.viewModel = viewModel
        self.onDismiss = onDismiss
        let seed = viewModel.detail.map { PeptideSupportPresentation.seedTime(for: $0.supportSchedule) } ?? "08:00"
        seedTime = seed
        _time = State(initialValue: OperatingPlanDateValues.time(from: seed))
    }

    private var localTime: String { OperatingPlanDateValues.timeKey(from: time) }

    private var preview: String {
        guard let schedule = viewModel.detail?.supportSchedule else { return "" }
        return PeptideSupportPresentation.timePreview(schedule, localTime: localTime)
    }

    var body: some View {
        PeptideEditorSheet(
            title: "Time",
            isSaving: viewModel.isSaving,
            // Nothing to save until the wheel moves (an untouched bucket such
            // as "Evening" is never silently rewritten to an exact time).
            canSave: localTime != seedTime,
            errorMessage: viewModel.errorMessage,
            onCancel: { viewModel.errorMessage = nil; onDismiss() },
            onSave: save
        ) {
            OperatingPlanSurface(verticalPadding: 10) {
                VStack(alignment: .leading, spacing: 8) {
                    DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .tint(OperatingPlanColor.teal)
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.time.wheel")
                    Text(preview)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                        .foregroundStyle(OperatingPlanColor.ink)
                        .accessibilityIdentifier("operatingPlan.peptide.sheet.time.preview")
                    if let schedule = viewModel.detail?.supportSchedule, let caption = PeptideSupportPresentation.bucketCaption(for: schedule) {
                        PeptideSheetCaption(text: caption)
                    }
                }
            }
        }
        .onAppear { viewModel.errorMessage = nil }
    }

    private func save() {
        Task { @MainActor in
            if await viewModel.changeTime(localTime) { onDismiss() }
        }
    }
}

// MARK: - Notes

struct PeptideNotesSheet: View {
    let viewModel: PeptideSupportEditorViewModel
    let onDismiss: () -> Void

    @State private var notes: String
    private let originalNotes: String

    init(viewModel: PeptideSupportEditorViewModel, onDismiss: @escaping () -> Void) {
        self.viewModel = viewModel
        self.onDismiss = onDismiss
        originalNotes = viewModel.detail?.notes ?? ""
        _notes = State(initialValue: viewModel.detail?.notes ?? "")
    }

    var body: some View {
        PeptideEditorSheet(
            title: "Notes",
            isSaving: viewModel.isSaving,
            canSave: notes.trimmingCharacters(in: .whitespacesAndNewlines) != originalNotes.trimmingCharacters(in: .whitespacesAndNewlines),
            errorMessage: viewModel.errorMessage,
            onCancel: { viewModel.errorMessage = nil; onDismiss() },
            onSave: save
        ) {
            OperatingPlanSurface(verticalPadding: 10) {
                TextField("Notes shown when this dose is opened", text: $notes, axis: .vertical)
                    .lineLimit(4...8)
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                    .foregroundStyle(OperatingPlanColor.ink)
                    .accessibilityIdentifier("operatingPlan.peptide.sheet.notes.field")
            }
        }
        .onAppear { viewModel.errorMessage = nil }
    }

    private func save() {
        Task { @MainActor in
            if await viewModel.setNotes(notes.trimmingCharacters(in: .whitespacesAndNewlines)) { onDismiss() }
        }
    }
}
