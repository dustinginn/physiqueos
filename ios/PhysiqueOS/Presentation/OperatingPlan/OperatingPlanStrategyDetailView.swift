import SwiftUI

/// `strategy/[strategyType]/[strategyId]/page.js` →
/// `OperatingPlanStrategyDetailScreen` — the generic Energy/Nutrition/
/// Training/Coaching Updates detail view. Energy has no `editHref` in web
/// (confirmed dead editor route); the other three show an "Edit Strategy"/
/// "Edit Coaching Updates" action into `OperatingPlanStrategyEditorView`.
///
/// Every Founder Production strategy reads its bounded canonical resource
/// and fails closed. Energy remains intentionally read-only; Coaching
/// Updates edits retain their canonical composite write boundary.
struct OperatingPlanStrategyDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let strategyType: String
    let strategyId: String
    let onNavigate: (AppDestination) -> Void

    @State private var productionNutritionDetail: NutritionStrategyDetail?
    @State private var productionTrainingDetail: TrainingStrategyDetail?
    @State private var productionEnergyDetail: EnergyStrategyDetail?
    @State private var productionCoachingDetail: CoachingUpdatesProductionDetail?
    @State private var isLoadingProduction = false
    @State private var loadError: String?

    private var isProductionNutrition: Bool {
        strategyType == "nutrition" && environment.nativeAuthority == .founderProduction
    }

    private var isProductionTraining: Bool {
        strategyType == "training" && environment.nativeAuthority == .founderProduction
    }

    private var isProductionManaged: Bool { environment.nativeAuthority == .founderProduction }

    private var detail: OperatingPlanStrategyDetailReadModel? {
        guard isProductionManaged else {
            return environment.operatingPlanStore.strategyDetail(strategyType: strategyType, strategyId: strategyId)
        }
        if isProductionNutrition {
            return productionNutritionDetail.map(Self.readModel(from:))
        }
        if isProductionTraining {
            return productionTrainingDetail.map(Self.readModel(from:))
        }
        if strategyType == "energy" { return productionEnergyDetail?.readModel }
        if strategyType == "briefings" { return productionCoachingDetail?.readModel }
        return nil
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
        .task(id: "\(strategyId):\(environment.nativeAuthority)") { await loadProductionIfNeeded() }
        .refreshable {
            if isProductionManaged {
                await environment.productionNativeAPI.invalidateReadResources([
                    "operating-plan-nutrition-strategy", "operating-plan-training-strategy",
                    "operating-plan-energy-strategy", "operating-plan-coaching-updates",
                ])
            }
            await loadProductionIfNeeded()
        }
    }

    @MainActor
    private func loadProductionIfNeeded() async {
        guard isProductionManaged else { return }
        isLoadingProduction = true
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            if isProductionNutrition {
                productionNutritionDetail = try await environment.nutritionStrategyAPI.fetchDetail(strategyId: strategyId)
            } else if isProductionTraining {
                productionTrainingDetail = try await environment.trainingStrategyAPI.fetchDetail(strategyId: strategyId)
            } else if strategyType == "energy" {
                productionEnergyDetail = try await environment.energyStrategyAPI.fetchDetail(strategyId: strategyId)
            } else if strategyType == "briefings" {
                productionCoachingDetail = try await environment.coachingUpdatesAPI.fetchDetail(strategyId: strategyId)
            }
        } catch {
            productionNutritionDetail = nil
            productionTrainingDetail = nil
            productionEnergyDetail = nil
            productionCoachingDetail = nil
            loadError = "This strategy couldn't be loaded. Pull to refresh or try again."
        }
    }

    private static func readModel(from detail: NutritionStrategyDetail) -> OperatingPlanStrategyDetailReadModel {
        OperatingPlanStrategyDetailReadModel(
            strategyType: .nutrition,
            strategyId: detail.protocolId,
            title: detail.title,
            purpose: detail.purpose,
            goal: detail.goal ?? "",
            startedDate: detail.startedDate,
            status: detail.status,
            fields: detail.fields,
            editLabel: "Edit Strategy",
            energyPhaseHistory: []
        )
    }

    private static func readModel(from detail: TrainingStrategyDetail) -> OperatingPlanStrategyDetailReadModel {
        OperatingPlanStrategyDetailReadModel(
            strategyType: .training,
            strategyId: detail.protocolId,
            title: detail.title,
            purpose: detail.purpose,
            goal: detail.goal ?? "",
            startedDate: detail.startedDate,
            status: detail.status,
            fields: detail.fields,
            editLabel: "Edit Strategy",
            energyPhaseHistory: []
        )
    }

    @ViewBuilder
    private var content: some View {
        if isProductionManaged, isLoadingProduction, detail == nil {
            ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
        } else if let detail {
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
            OperatingPlanUnavailableView(message: isProductionManaged ? (loadError ?? "This strategy is unavailable.") : "This strategy is unavailable.")
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
