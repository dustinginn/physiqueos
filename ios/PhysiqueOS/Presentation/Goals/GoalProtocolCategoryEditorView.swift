import SwiftUI

/// `/goals/transition/protocols/edit/[category]` (Route C of 5) —
/// `ProtocolTransitionBuilderScreen.jsx`. One generic, category-aware
/// editor rather than N bespoke screens — the same approach
/// `EvidenceIntakeView(initialScenario:)` already establishes for a
/// category-driven single screen. Energy gets the real interactive
/// calorie/activity choice fields found in source; every other category
/// gets a structured cadence editor (reusing the shared
/// `OperatingPlanSupportScheduleReadModel` shape) since that's what the
/// audited categories without a bespoke energy-style form actually use.
struct GoalProtocolCategoryEditorView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let category: String

    var body: some View {
        if let parsed = ProtocolTransitionCategory(rawValue: category) {
            GoalProtocolCategoryEditor(
                draft: environment.goalsSandboxStore.protocolEditorDraft(category: parsed),
                onSave: { draft in
                    environment.goalsSandboxStore.saveProtocolCategoryEditor(draft)
                    dismiss()
                }
            )
        } else {
            GoalUnavailableView(message: "This protocol category is unavailable.")
        }
    }
}

private struct GoalProtocolCategoryEditor: View {
    @State var draft: ProtocolCategoryEditorDraft
    let onSave: (ProtocolCategoryEditorDraft) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "Protocol Transition",
                    title: title,
                    subtitle: subtitle
                )
                if draft.category == .energy {
                    energyFields
                } else {
                    cadenceFields
                }
                PrimaryActionButton(title: "Save and continue") { onSave(draft) }
                    .accessibilityIdentifier("goalTransition.protocolEditor.save")
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var title: String {
        switch draft.category {
        case .energy: "Begin with maintenance calibration"
        case .nutrition: "Shape nutrition around calibration"
        default: "Update \(draft.category.label)"
        }
    }
    private var subtitle: String {
        switch draft.category {
        case .energy: "Choose how your energy target should begin."
        case .nutrition: "Nutrition follows the same calibration window as Energy."
        case .photos, .dexa: "Choose the cadence for this evidence type."
        default: "Choose how this protocol should carry forward."
        }
    }

    private var energyFields: some View {
        VStack(alignment: .leading, spacing: 16) {
            OperatingPlanSection("Calorie strategy") {
                VStack(spacing: 8) {
                    choicePill("increase_gradually", label: "Increase gradually", binding: $draft.calorieStrategy)
                    choicePill("estimated_maintenance", label: "Estimated maintenance", binding: $draft.calorieStrategy)
                }
            }
            OperatingPlanSection("Activity strategy") {
                VStack(spacing: 8) {
                    choicePill("keep_current", label: "Keep current activity", binding: $draft.activityStrategy)
                    choicePill("reduce_slightly", label: "Reduce slightly", binding: $draft.activityStrategy)
                }
            }
        }
    }

    private func choicePill(_ value: String, label: String, binding: Binding<String?>) -> some View {
        OperatingPlanChoicePill(title: label, isSelected: binding.wrappedValue == value) { binding.wrappedValue = value }
    }

    private var cadenceFields: some View {
        OperatingPlanSupportScheduleEditor(schedule: Binding(
            get: { draft.cadence ?? .init(frequency: .weekly, daysOfWeek: [.saturday], intervalDays: 1, timing: .morning, specificTime: "09:00", startDate: "2026-09-03", endDate: nil) },
            set: { draft.cadence = $0 }
        ))
    }
}
