import SwiftUI

struct OperatingPlanSupplementSupportView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let protocolId: String

    @State private var isEditing = false
    @State private var draft: OperatingPlanSupplementSupportReadModel?
    @State private var errorMessage: String?

    private var support: OperatingPlanSupplementSupportReadModel? {
        environment.operatingPlanStore.supplementSupport(protocolId: protocolId)
    }

    var body: some View {
        ScrollView {
            content.padding(.horizontal, 16).padding(.top, 12)
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
                    Label(isEditing ? "Cancel" : "Supplement Strategy", systemImage: isEditing ? "xmark" : "arrow.left")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    @ViewBuilder private var content: some View {
        if let support {
            if isEditing, let draft { editor(draft) } else { detail(support) }
        } else {
            OperatingPlanUnavailableView(message: "This supplement support is unavailable.")
        }
    }

    private func detail(_ support: OperatingPlanSupplementSupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            OperatingPlanScreenHeader(eyebrow: "SUPPLEMENT SUPPORT", title: support.name, subtitle: support.supportSummary)
            OperatingPlanSection("Current Support") {
                CardContainer(padding: .sm) {
                    VStack(alignment: .leading, spacing: 10) {
                        OperatingPlanFieldRow(label: "Dose / Quantity", value: [support.doseAmount, support.doseUnit].filter { !$0.isEmpty }.joined(separator: " "))
                        OperatingPlanFieldRow(label: "Schedule", value: OperatingPlanSandboxStore.formatSupportSchedule(support.supportSchedule))
                        OperatingPlanFieldRow(label: "Reminder", value: support.reminderPreference.label)
                        if !support.notes.isEmpty { OperatingPlanFieldRow(label: "Execution Notes", value: support.notes) }
                    }
                }
            }
            PrimaryActionButton(title: "Edit Support") {
                draft = support
                isEditing = true
            }
        }
    }

    private func editor(_ draft: OperatingPlanSupplementSupportReadModel) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            OperatingPlanScreenHeader(eyebrow: "EDIT SUPPORT", title: draft.name, subtitle: "Keep the quantity, schedule, reminder, and optional context aligned with your current strategy.")
            OperatingPlanSection("Dose / Quantity") {
                CardContainer(padding: .sm) {
                    HStack(spacing: 10) {
                        TextField("Amount", text: Binding(get: { draft.doseAmount }, set: { self.draft?.doseAmount = $0 }))
                            .keyboardType(.decimalPad)
                        TextField("Unit", text: Binding(get: { draft.doseUnit }, set: { self.draft?.doseUnit = $0 }))
                    }
                    .textFieldStyle(.roundedBorder)
                }
            }
            OperatingPlanSupportScheduleEditor(schedule: Binding(
                get: { draft.supportSchedule }, set: { self.draft?.supportSchedule = $0 }
            ), sectionNumber: "2")
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
                    TextField("Optional context, such as take with food", text: Binding(get: { draft.notes }, set: { self.draft?.notes = $0 }), axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
            PrimaryActionButton(title: "Save Support") { save(draft) }
        }
    }

    private func save(_ model: OperatingPlanSupplementSupportReadModel) {
        switch environment.operatingPlanStore.saveSupplementSupport(model) {
        case .success: errorMessage = nil; isEditing = false
        case .failure(let error): errorMessage = error.message
        }
    }
}
