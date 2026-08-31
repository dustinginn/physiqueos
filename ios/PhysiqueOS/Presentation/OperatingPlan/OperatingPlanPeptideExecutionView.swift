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
    @State private var draft: PeptideDosingStrategyReadModel?
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
                editor(execution: execution, draft: draft)
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
                        OperatingPlanFieldRow(label: "Pattern", value: execution.dosing.pattern.label)
                        OperatingPlanFieldRow(label: "Starting Dose", value: "\(formatted(execution.dosing.startingDoseAmount)) \(execution.dosing.startingDoseUnit)")
                        if execution.dosing.pattern.usesTarget {
                            OperatingPlanFieldRow(label: "Target Dose", value: "\(formatted(execution.dosing.targetDoseAmount)) \(execution.dosing.startingDoseUnit)")
                        }
                        if execution.dosing.pattern.usesStep {
                            OperatingPlanFieldRow(label: "Step", value: "+\(formatted(execution.dosing.stepAmount)) \(execution.dosing.startingDoseUnit) every \(execution.dosing.stepInterval) \(execution.dosing.stepUnit.label.lowercased())")
                        }
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
                draft = execution.dosing
                isEditing = true
            }
            .accessibilityIdentifier("operatingPlan.peptide.editSupport")
        }
    }

    private func editor(execution: OperatingPlanPeptideExecutionReadModel, draft: PeptideDosingStrategyReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanScreenHeader(eyebrow: "Peptide", title: "Edit \(execution.name) Support", subtitle: "Adjust the dosing pattern. Timeline history is preserved.")

            OperatingPlanSection("Pattern") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(PeptideDosingPattern.allCases) { pattern in
                        OperatingPlanChoicePill(title: pattern.label, isSelected: draft.pattern == pattern) {
                            self.draft?.pattern = pattern
                        }
                    }
                }
            }

            OperatingPlanSection("Starting Dose") {
                doseStepper(value: Binding(get: { draft.startingDoseAmount }, set: { self.draft?.startingDoseAmount = $0 }), unit: draft.startingDoseUnit)
            }

            if draft.pattern.usesTarget {
                OperatingPlanSection("Target Dose") {
                    doseStepper(value: Binding(get: { draft.targetDoseAmount }, set: { self.draft?.targetDoseAmount = $0 }), unit: draft.startingDoseUnit)
                }
            }

            if draft.pattern.usesStep {
                OperatingPlanSection("Step") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            Stepper(value: Binding(get: { draft.stepAmount }, set: { self.draft?.stepAmount = $0 }), in: 0...5, step: 0.25) {
                                Text("+\(formatted(draft.stepAmount)) \(draft.startingDoseUnit) per step")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                            Stepper(value: Binding(get: { draft.stepInterval }, set: { self.draft?.stepInterval = $0 }), in: 1...12) {
                                Text("Every \(draft.stepInterval) \(draft.stepUnit.label.lowercased())")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            }
                        }
                    }
                }
            }

            if draft.pattern.usesHold {
                OperatingPlanSection("Hold Duration") {
                    CardContainer(padding: .sm) {
                        Stepper(value: Binding(get: { draft.holdDurationWeeks }, set: { self.draft?.holdDurationWeeks = $0 }), in: 0...12) {
                            Text("\(draft.holdDurationWeeks) weeks")
                                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        }
                    }
                }
            }

            if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
            PrimaryActionButton(title: "Save Dosing") { save(draft) }
                .accessibilityIdentifier("operatingPlan.peptide.save")
        }
    }

    private func doseStepper(value: Binding<Double>, unit: String) -> some View {
        CardContainer(padding: .sm) {
            Stepper(value: value, in: 0...20, step: 0.25) {
                Text("\(formatted(value.wrappedValue)) \(unit)")
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
            }
        }
    }

    private func save(_ model: PeptideDosingStrategyReadModel) {
        switch store.savePeptideDosing(protocolId: protocolId, model: model) {
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
