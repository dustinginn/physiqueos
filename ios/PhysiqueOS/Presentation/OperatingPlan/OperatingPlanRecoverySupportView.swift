import SwiftUI

/// `execution/[executionId]/page.js` for the Recovery (foam-rolling)
/// support method — the generic `ExecutionItemBuilderScreen` fields
/// (cadence, days, time of day, support/reminder preference, notes),
/// mirrored here as a local `isEditing` toggle on one view rather than a
/// second push destination, matching the web's own `?edit=1` pattern.
/// Saves are local-only.
struct OperatingPlanRecoverySupportView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let executionId: String

    @State private var isEditing = false
    @State private var draft: OperatingPlanRecoverySupportReadModel?
    @State private var errorMessage: String?

    private var store: OperatingPlanSandboxStore { environment.operatingPlanStore }
    private var support: OperatingPlanRecoverySupportReadModel? { store.recoverySupport(executionId: executionId) }

    private static let weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

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
        if let support {
            if isEditing, let draft {
                editor(draft: draft)
            } else {
                detail(support)
            }
        } else {
            OperatingPlanUnavailableView(message: "This support method is unavailable.")
        }
    }

    private func detail(_ support: OperatingPlanRecoverySupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            OperatingPlanScreenHeader(eyebrow: "Recovery", title: support.name, subtitle: support.purpose)

            OperatingPlanSection("Current Support") {
                CardContainer(padding: .sm) {
                    VStack(alignment: .leading, spacing: 8) {
                        OperatingPlanFieldRow(label: "Summary", value: support.supportSummary)
                        OperatingPlanFieldRow(label: "Cadence", value: support.cadence.label)
                        if !support.days.isEmpty {
                            OperatingPlanFieldRow(label: "Days", value: support.days.joined(separator: ", "))
                        }
                        OperatingPlanFieldRow(label: "Time of Day", value: support.timeOfDay.label)
                        OperatingPlanFieldRow(label: "Reminder", value: support.support.label)
                    }
                }
            }

            PrimaryActionButton(title: "Edit Support") {
                draft = support
                isEditing = true
            }
            .accessibilityIdentifier("operatingPlan.recovery.editSupport")
        }
    }

    private func editor(draft: OperatingPlanRecoverySupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanScreenHeader(eyebrow: "Recovery", title: "Edit \(draft.name) Support", subtitle: "Adjust when and how this support method is scheduled.")

            OperatingPlanSection("Cadence") {
                HStack(spacing: 8) {
                    ForEach(ExecutionCadence.allCases) { cadence in
                        OperatingPlanChoicePill(title: cadence.label, isSelected: draft.cadence == cadence) {
                            self.draft?.cadence = cadence
                        }
                    }
                }
            }

            if draft.cadence == .specificWeekdays {
                OperatingPlanSection("Days") {
                    FlowPills(items: Self.weekdays, isSelected: { draft.days.contains($0) }, label: \.self) { day in
                        if let index = self.draft?.days.firstIndex(of: day) {
                            self.draft?.days.remove(at: index)
                        } else {
                            self.draft?.days.append(day)
                        }
                    }
                }
            }

            OperatingPlanSection("Time of Day") {
                HStack(spacing: 8) {
                    ForEach(TimeOfDayChoice.allCases) { choice in
                        OperatingPlanChoicePill(title: choice.label, isSelected: draft.timeOfDay == choice) {
                            self.draft?.timeOfDay = choice
                        }
                    }
                }
            }

            OperatingPlanSection("Reminder") {
                HStack(spacing: 8) {
                    ForEach(ExecutionSupport.allCases) { option in
                        OperatingPlanChoicePill(title: option.label, isSelected: draft.support == option) {
                            self.draft?.support = option
                        }
                    }
                }
            }

            if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
            PrimaryActionButton(title: "Save Support") { save(draft) }
                .accessibilityIdentifier("operatingPlan.recovery.save")
        }
    }

    private func save(_ model: OperatingPlanRecoverySupportReadModel) {
        switch store.saveRecoverySupport(model) {
        case .success:
            errorMessage = nil
            isEditing = false
        case .failure(let error):
            errorMessage = error.message
        }
    }
}
