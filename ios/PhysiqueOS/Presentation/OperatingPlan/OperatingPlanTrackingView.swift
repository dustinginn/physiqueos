import SwiftUI

struct OperatingPlanTrackingView: View {
    @Environment(AppEnvironment.self) private var environment
    let onNavigate: (AppDestination) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "TRACKING",
                    title: "Tracking",
                    subtitle: "Define the recurring measurements PhysiqueOS uses to understand how your plan is working."
                )
                OperatingPlanSection("Current Tracking Routines") {
                    CardContainer(padding: .md) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(environment.operatingPlanStore.tracking.title)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                            Text(environment.operatingPlanStore.tracking.purpose)
                                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            OperatingPlanFieldRow(label: "Current Support", value: environment.operatingPlanStore.tracking.currentSupport)
                            OperatingPlanFieldRow(label: "Completion", value: environment.operatingPlanStore.tracking.completion)
                            PrimaryActionButton(title: "Edit Support") {
                                onNavigate(.operatingPlanTrackingSupport(executionId: environment.operatingPlanStore.tracking.executionId))
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Tracking")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct OperatingPlanTrackingSupportView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let executionId: String

    @State private var draft: OperatingPlanTrackingReadModel?
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            if let draft {
                VStack(alignment: .leading, spacing: 18) {
                    OperatingPlanScreenHeader(
                        eyebrow: "TRACKING SUPPORT",
                        title: "Edit Support",
                        subtitle: "Set when this measurement is expected and whether Home should remind you. Weight evidence completes it automatically."
                    )
                    OperatingPlanSupportScheduleEditor(schedule: Binding(
                        get: { draft.supportSchedule },
                        set: { self.draft?.supportSchedule = $0 }
                    ))
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
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        }
                    }
                    if let errorMessage { OperatingPlanEditorErrorBanner(message: errorMessage) }
                    PrimaryActionButton(title: "Save Support") { save(draft) }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
            }
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if draft == nil, environment.operatingPlanStore.tracking.executionId == executionId {
                draft = environment.operatingPlanStore.tracking
            }
        }
    }

    private func save(_ model: OperatingPlanTrackingReadModel) {
        switch environment.operatingPlanStore.saveTracking(model) {
        case .success: dismiss()
        case .failure(let error): errorMessage = error.message
        }
    }
}
