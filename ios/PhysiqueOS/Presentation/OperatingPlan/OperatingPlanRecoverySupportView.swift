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
                        OperatingPlanFieldRow(label: "Schedule", value: OperatingPlanSandboxStore.formatSupportSchedule(support.supportSchedule))
                        OperatingPlanFieldRow(label: "Starts", value: OperatingPlanDateValues.readableDate(support.supportSchedule.startDate))
                        OperatingPlanFieldRow(label: "Ends", value: support.supportSchedule.endDate.map(OperatingPlanDateValues.readableDate) ?? "Until changed")
                        OperatingPlanFieldRow(label: "Reminder", value: support.reminderPreference.label)
                        if !support.notes.isEmpty { OperatingPlanFieldRow(label: "Execution Notes", value: support.notes) }
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

            OperatingPlanSupportScheduleEditor(schedule: Binding(
                get: { draft.supportSchedule }, set: { self.draft?.supportSchedule = $0 }
            ))

            OperatingPlanSection("Reminder") {
                HStack(spacing: 8) {
                    ForEach(OperatingPlanReminderPreference.allCases) { option in
                        OperatingPlanChoicePill(title: option.label, isSelected: draft.reminderPreference == option) {
                            self.draft?.reminderPreference = option
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
