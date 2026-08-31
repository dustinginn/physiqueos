import SwiftUI

/// `strategy/[strategyType]/[strategyId]/page.js` →
/// `OperatingPlanStrategyDetailScreen` — the generic Energy/Nutrition/
/// Training/Coaching Updates detail view. Energy has no `editHref` in web
/// (confirmed dead editor route); the other three show an "Edit Strategy"/
/// "Edit Coaching Updates" action into `OperatingPlanStrategyEditorView`.
struct OperatingPlanStrategyDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let strategyType: String
    let strategyId: String
    let onNavigate: (AppDestination) -> Void

    private var detail: OperatingPlanStrategyDetailReadModel? {
        environment.operatingPlanStore.strategyDetail(strategyType: strategyType, strategyId: strategyId)
    }

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
                Button { dismiss() } label: {
                    Label("Operating Plan", systemImage: "arrow.left")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let detail {
            VStack(alignment: .leading, spacing: 16) {
                OperatingPlanScreenHeader(eyebrow: detail.strategyType.title, title: detail.title, subtitle: detail.purpose)

                CardContainer(padding: .sm) {
                    VStack(alignment: .leading, spacing: 8) {
                        OperatingPlanFieldRow(label: "Goal", value: detail.goal)
                        OperatingPlanFieldRow(label: "Started", value: detail.startedDate)
                        OperatingPlanFieldRow(label: "Status", value: detail.status)
                    }
                }

                OperatingPlanSection("Strategy Detail") {
                    CardContainer(padding: .sm) {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(detail.fields) { field in
                                OperatingPlanFieldRow(label: field.label, value: field.value)
                            }
                        }
                    }
                }

                if !detail.energyPhaseHistory.isEmpty {
                    OperatingPlanSection("Phase History") {
                        VStack(spacing: 8) {
                            ForEach(detail.energyPhaseHistory) { snapshot in
                                energyPhaseCard(snapshot)
                            }
                        }
                    }
                }

                if let editLabel = detail.editLabel, let editDestination = detail.editDestination {
                    PrimaryActionButton(title: editLabel) { onNavigate(editDestination) }
                }
            }
        } else {
            OperatingPlanUnavailableView(message: "This strategy is unavailable.")
        }
    }

    private func energyPhaseCard(_ snapshot: OperatingPlanEnergyPhaseSnapshotReadModel) -> some View {
        CardContainer(padding: .sm, background: snapshot.isActive ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceElevated) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Phase \(snapshot.phaseOrder)")
                        .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                        .foregroundStyle(snapshot.isActive ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textMuted)
                    Spacer()
                    StatusChip(text: snapshot.isActive ? "Active" : "Completed", color: snapshot.isActive ? .success : .muted)
                }
                Text(snapshot.phaseName)
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                OperatingPlanFieldRow(label: "Caloric Intake", value: snapshot.caloricIntake)
                OperatingPlanFieldRow(label: "Activity Target", value: snapshot.activityTarget)
                OperatingPlanFieldRow(label: "Review Cadence", value: snapshot.reviewCadence)
                Text(snapshot.note)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }
}
