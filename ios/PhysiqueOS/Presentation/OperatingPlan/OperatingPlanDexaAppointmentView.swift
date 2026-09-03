import SwiftUI

/// `/profile/operating-plan/execution/dexa` — `DexaAppointmentDetailScreen`
/// / `DexaAppointmentEditorScreen` (`DexaAppointmentScreen.jsx`). Reached
/// from Priority Detail's "View DEXA Appointment" action before the scan
/// date, and directly from a URL otherwise — there is no Operating Plan
/// landing card for it (the real landing's Tracking section only surfaces
/// Morning Weigh-In). Reads/writes the same `dexaAppointment`
/// (`CoachingDexaReadModel`) the Coaching Updates editor already owns, so
/// the two real web entry points to this one execution item stay in sync.
struct OperatingPlanDexaAppointmentView: View {
    @Environment(AppEnvironment.self) private var environment
    @State private var isEditing = false

    private var store: OperatingPlanSandboxStore { environment.operatingPlanStore }

    var body: some View {
        Group {
            if isEditing {
                OperatingPlanDexaAppointmentEditor(
                    initial: store.dexaAppointment ?? CoachingDexaReadModel(plannedDate: "", localTime: "", reminderPreferences: [], uploadReminder: false, preparationNote: ""),
                    onSave: { model in
                        let result = store.saveDexaAppointment(model)
                        if case .success = result { isEditing = false }
                        return result
                    },
                    onCancel: { isEditing = false }
                )
            } else {
                detail
            }
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Next DEXA Scan")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var detail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "DEXA EXECUTION",
                    title: "Next DEXA Scan",
                    subtitle: "Plan an optional future appointment. Completed scans remain in Evidence."
                )

                let item = store.dexaAppointment.flatMap { $0.plannedDate.isEmpty ? nil : $0 }

                CardContainer(padding: .md) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item != nil ? "Scheduled appointment" : "Not scheduled")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        if let item {
                            Text(Self.summary(item))
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            if !store.dexaAppointment!.plannedDate.isEmpty {
                                Text("America/Los_Angeles")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textMuted)
                            }
                        }
                    }
                }

                if let item {
                    CardContainer(padding: .md) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("REMINDERS").physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
                            Text(Self.reminderSummary(item))
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                    }
                    if !item.preparationNote.isEmpty {
                        CardContainer(padding: .md) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("PREPARATION NOTE").physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted)
                                Text(item.preparationNote)
                                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                        }
                    }
                }

                PrimaryActionButton(title: item != nil ? "Edit schedule" : "Schedule DEXA") { isEditing = true }
                    .accessibilityIdentifier("operatingPlan.dexa.edit")
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
    }

    static func summary(_ item: CoachingDexaReadModel) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        let dateText = formatter.date(from: item.plannedDate).map { date -> String in
            let display = DateFormatter()
            display.locale = Locale(identifier: "en_US")
            display.dateFormat = "MMMM d"
            return display.string(from: date)
        } ?? item.plannedDate
        let timeText = item.localTime.isEmpty ? "" : OperatingPlanSandboxStore.formattedLocalTime(item.localTime)
        return [dateText, timeText].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    static func reminderSummary(_ item: CoachingDexaReadModel) -> String {
        var values = item.reminderPreferences.map(\.label)
        if item.uploadReminder { values.append("Upload-results reminder") }
        return values.isEmpty ? "None" : values.joined(separator: " · ")
    }
}

private struct OperatingPlanDexaAppointmentEditor: View {
    @State var draft: CoachingDexaReadModel
    let onSave: (CoachingDexaReadModel) -> Result<Void, OperatingPlanSandboxError>
    let onCancel: () -> Void
    @State private var errorMessage: String?

    init(initial: CoachingDexaReadModel, onSave: @escaping (CoachingDexaReadModel) -> Result<Void, OperatingPlanSandboxError>, onCancel: @escaping () -> Void) {
        _draft = State(initialValue: initial)
        self.onSave = onSave
        self.onCancel = onCancel
    }

    private static var tomorrow: Date {
        Calendar(identifier: .gregorian).date(byAdding: .day, value: 1, to: Date()) ?? Date()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(eyebrow: "DEXA EXECUTION", title: "Next DEXA Scan", subtitle: "Plan an optional future appointment. Completed scans remain in Evidence.")

                if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }

                OperatingPlanSection("Appointment") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 12) {
                            DateField(date: Binding(
                                get: { draft.plannedDate.isEmpty ? Self.tomorrow : OperatingPlanDateValues.date(from: draft.plannedDate) },
                                set: { draft.plannedDate = OperatingPlanDateValues.dateKey(from: $0) }
                            ), maximumDate: .distantFuture, minimumDate: Self.tomorrow, label: "Future date")
                            DatePicker("Time (optional)", selection: Binding(
                                get: { OperatingPlanDateValues.time(from: draft.localTime) },
                                set: { draft.localTime = OperatingPlanDateValues.timeKey(from: $0) }
                            ), displayedComponents: .hourAndMinute)
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                        }
                    }
                }

                if !draft.plannedDate.isEmpty {
                    OperatingPlanSection("Reminders") {
                        CardContainer(padding: .sm) {
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(DexaReminderPreference.allCases) { preference in
                                    Toggle(preference.label, isOn: Binding(
                                        get: { draft.reminderPreferences.contains(preference) },
                                        set: { enabled in
                                            if enabled, !draft.reminderPreferences.contains(preference) {
                                                draft.reminderPreferences.append(preference)
                                            } else if !enabled {
                                                draft.reminderPreferences.removeAll { $0 == preference }
                                            }
                                        }
                                    )).physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                                }
                                Divider().overlay(PhysiqueOSTheme.divider)
                                Toggle("Remind me after the appointment to upload my DEXA results", isOn: $draft.uploadReminder)
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy).tint(PhysiqueOSTheme.accent)
                            }
                        }
                    }
                }

                OperatingPlanSection("Preparation note") {
                    CardContainer(padding: .sm) {
                        TextField("Optional", text: $draft.preparationNote, axis: .vertical)
                            .lineLimit(2...5).textFieldStyle(.roundedBorder)
                    }
                }

                PrimaryActionButton(title: draft.plannedDate.isEmpty ? "Clear schedule" : "Save schedule") {
                    switch onSave(draft) {
                    case .success: errorMessage = nil
                    case .failure(let error): errorMessage = error.message
                    }
                }
                .accessibilityIdentifier("operatingPlan.dexa.save")
                Button("Cancel", action: onCancel)
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
    }
}
