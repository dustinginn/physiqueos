import SwiftUI

/// `execution/peptides/[protocolId]/page.js` — dosing detail and, behind
/// the web's own `?edit=1` toggle on the same route, the dosing-pattern
/// editor (`PeptideDosingStrategyModel.js`). Mirrored here as a local
/// `isEditing` toggle on one view rather than a second push destination,
/// matching the web's own same-route pattern. Saves are local-only.
struct OperatingPlanPeptideExecutionView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let protocolId: String

    @State private var isEditing = false
    @State private var draft: OperatingPlanPeptideExecutionReadModel?
    @State private var errorMessage: String?

    private var store: OperatingPlanSandboxStore { environment.operatingPlanStore }
    private var execution: OperatingPlanPeptideExecutionReadModel? { store.peptideExecution(protocolId: protocolId) }

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
                Button { isEditing ? (isEditing = false) : dismiss() } label: {
                    Label(isEditing ? "Cancel" : "Support", systemImage: isEditing ? "xmark" : "arrow.left")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let execution {
            if isEditing, let draft {
                editor(draft: draft)
            } else {
                detail(execution)
            }
        } else {
            OperatingPlanUnavailableView(message: "This peptide protocol is unavailable.")
        }
    }

    private func detail(_ execution: OperatingPlanPeptideExecutionReadModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            OperatingPlanScreenHeader(eyebrow: "Peptide", title: execution.name, subtitle: execution.purpose)

            OperatingPlanSection("Current Dosing") {
                CardContainer(padding: .sm) {
                    VStack(alignment: .leading, spacing: 8) {
                        OperatingPlanFieldRow(label: "Current dose", value: currentDose(execution))
                        OperatingPlanFieldRow(label: "Current phase", value: currentPhase(execution))
                        OperatingPlanFieldRow(label: "Schedule", value: OperatingPlanSandboxStore.formatSupportSchedule(execution.supportSchedule))
                        OperatingPlanFieldRow(label: "Next dose change", value: nextDoseChange(execution))
                        OperatingPlanFieldRow(label: "Status", value: execution.state == .invalid ? "Needs dosing update" : "Current")
                    }
                }
            }

            OperatingPlanSection("Dosing Timeline") {
                VStack(spacing: 7) {
                    ForEach(execution.timeline) { phase in
                        CardContainer(padding: .sm) {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(phase.label)
                                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(phase.window)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                }
                                Spacer()
                                Text("\(formatted(phase.doseAmount)) \(phase.doseUnit)")
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(phase.status == "active" ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                            }
                        }
                    }
                }
            }

            PrimaryActionButton(title: "Edit Support") {
                draft = execution
                isEditing = true
            }
            .accessibilityIdentifier("operatingPlan.peptide.editSupport")
        }
    }

    private func editor(draft: OperatingPlanPeptideExecutionReadModel) -> some View {
        let dosing = draft.dosing
        return VStack(alignment: .leading, spacing: 18) {
            OperatingPlanScreenHeader(eyebrow: "PEPTIDE SUPPORT", title: "Edit Support", subtitle: "Describe the schedule and dosing strategy you intend to follow. The dated support plan is generated for you.")

            OperatingPlanSupportScheduleEditor(schedule: Binding(
                get: { draft.supportSchedule }, set: { self.draft?.supportSchedule = $0 }
            ))

            OperatingPlanSection("Pattern") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(PeptideDosingPattern.allCases) { pattern in
                        OperatingPlanChoicePill(title: pattern.label, isSelected: dosing.pattern == pattern) {
                            self.draft?.dosing.pattern = pattern
                        }
                    }
                }
            }

            if dosing.pattern != .custom {
                OperatingPlanSection("Starting Dose") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            doseStepper(value: Binding(get: { dosing.startingDoseAmount }, set: { self.draft?.dosing.startingDoseAmount = $0 }), unit: dosing.startingDoseUnit)
                            TextField("Unit", text: Binding(
                                get: { dosing.startingDoseUnit },
                                set: { self.draft?.dosing.startingDoseUnit = $0 }
                            ))
                            .textFieldStyle(.roundedBorder)
                            .textInputAutocapitalization(.never)
                        }
                    }
                    DateField(date: Binding(
                        get: { OperatingPlanDateValues.date(from: dosing.startDate) },
                        set: { self.draft?.dosing.startDate = OperatingPlanDateValues.dateKey(from: $0) }
                    ), label: "Dosing start date")
                }
            }

            if dosing.pattern.usesTarget {
                OperatingPlanSection("Target Dose") {
                    doseStepper(value: Binding(get: { dosing.targetDoseAmount }, set: { self.draft?.dosing.targetDoseAmount = $0 }), unit: dosing.startingDoseUnit)
                }
            }

            if dosing.pattern.usesStep {
                OperatingPlanSection("Step") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            Stepper(value: Binding(get: { dosing.stepAmount }, set: { self.draft?.dosing.stepAmount = $0 }), in: 0...5, step: 0.25) {
                                Text("\(dosing.pattern == .titrateDown ? "−" : "+")\(formatted(dosing.stepAmount)) \(dosing.startingDoseUnit) per step")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            Stepper(value: Binding(get: { dosing.stepInterval }, set: { self.draft?.dosing.stepInterval = $0 }), in: 1...12) {
                                Text("Every \(dosing.stepInterval) \(dosing.stepUnit.label.lowercased())")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            intervalUnitPicker(value: Binding(
                                get: { dosing.stepUnit }, set: { self.draft?.dosing.stepUnit = $0 }
                            ))
                        }
                    }
                }
            }

            if dosing.pattern.usesHold {
                OperatingPlanSection("Hold and Landing") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                        Stepper(value: Binding(get: { dosing.holdDuration }, set: { self.draft?.dosing.holdDuration = $0 }), in: 1...52) {
                            Text("Hold for \(dosing.holdDuration) \(dosing.holdUnit.label.lowercased())")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                        intervalUnitPicker(value: Binding(
                            get: { dosing.holdUnit }, set: { self.draft?.dosing.holdUnit = $0 }
                        ))
                        Stepper(value: Binding(get: { dosing.decreaseAmount }, set: { self.draft?.dosing.decreaseAmount = $0 }), in: 0...5, step: 0.25) {
                            Text("Decrease by \(formatted(dosing.decreaseAmount)) \(dosing.startingDoseUnit)")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        }
                        Stepper(value: Binding(get: { dosing.decreaseInterval }, set: { self.draft?.dosing.decreaseInterval = $0 }), in: 1...12) {
                            Text("Decrease every \(dosing.decreaseInterval) \(dosing.decreaseUnit.label.lowercased())")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        }
                        intervalUnitPicker(value: Binding(
                            get: { dosing.decreaseUnit }, set: { self.draft?.dosing.decreaseUnit = $0 }
                        ))
                        Stepper(value: Binding(get: { dosing.landingDoseAmount }, set: { self.draft?.dosing.landingDoseAmount = $0 }), in: 0...20, step: 0.25) {
                            Text("Landing dose \(formatted(dosing.landingDoseAmount)) \(dosing.startingDoseUnit)")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        }
                        }
                    }
                }
            }

            if dosing.pattern != .custom {
                OperatingPlanSection("Final State") {
                    HStack(spacing: 8) {
                        OperatingPlanChoicePill(title: "Until changed", isSelected: dosing.endDate == nil) { self.draft?.dosing.endDate = nil }
                        OperatingPlanChoicePill(title: "Choose end date", isSelected: dosing.endDate != nil) {
                            self.draft?.dosing.endDate = dosing.endDate ?? dosing.startDate
                        }
                    }
                    if dosing.endDate != nil {
                        DateField(date: Binding(
                            get: { OperatingPlanDateValues.date(from: dosing.endDate ?? dosing.startDate) },
                            set: { self.draft?.dosing.endDate = OperatingPlanDateValues.dateKey(from: $0) }
                        ), label: "End date")
                    }
                }
            }

            OperatingPlanSection("Reminder") {
                HStack(spacing: 8) {
                    ForEach(OperatingPlanReminderPreference.allCases) { preference in
                        OperatingPlanChoicePill(title: preference.label, isSelected: draft.reminderPreference == preference) {
                            self.draft?.reminderPreference = preference
                        }
                    }
                }
            }

            OperatingPlanSection("Execution Notes") {
                CardContainer(padding: .sm) {
                    TextField("Optional notes shown when this priority is opened", text: Binding(
                        get: { draft.notes }, set: { self.draft?.notes = $0 }
                    ), axis: .vertical)
                    .lineLimit(3...6)
                }
            }

            if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
            PrimaryActionButton(title: "Save Support") { save(draft) }
                .accessibilityIdentifier("operatingPlan.peptide.save")
        }
    }

    private func doseStepper(value: Binding<Double>, unit: String) -> some View {
        Stepper(value: value, in: 0...20, step: 0.25) {
            Text("\(formatted(value.wrappedValue)) \(unit)")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
    }

    private func intervalUnitPicker(value: Binding<PeptideDoseStepUnit>) -> some View {
        HStack(spacing: 8) {
            ForEach(PeptideDoseStepUnit.allCases) { unit in
                OperatingPlanChoicePill(title: unit.label, isSelected: value.wrappedValue == unit) {
                    value.wrappedValue = unit
                }
            }
        }
    }

    private func currentDose(_ execution: OperatingPlanPeptideExecutionReadModel) -> String {
        guard let phase = execution.timeline.first(where: { $0.status == "active" }) else { return "No active phase" }
        return "\(formatted(phase.doseAmount)) \(phase.doseUnit)"
    }

    private func currentPhase(_ execution: OperatingPlanPeptideExecutionReadModel) -> String {
        guard let phase = execution.timeline.first(where: { $0.status == "active" }) else { return "Not active" }
        return phase.window
    }

    private func nextDoseChange(_ execution: OperatingPlanPeptideExecutionReadModel) -> String {
        guard let phase = execution.timeline.first(where: { ["scheduled", "upcoming"].contains($0.status) }) else {
            return "None scheduled"
        }
        return "\(phase.window) · \(formatted(phase.doseAmount)) \(phase.doseUnit)"
    }

    private func save(_ model: OperatingPlanPeptideExecutionReadModel) {
        switch store.savePeptideExecution(model) {
        case .success:
            errorMessage = nil
            isEditing = false
        case .failure(let error):
            errorMessage = error.message
        }
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(format: "%.2f", value)
    }
}
