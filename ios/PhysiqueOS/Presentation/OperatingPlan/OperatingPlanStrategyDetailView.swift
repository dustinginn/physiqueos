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

    var backTitle: String = "Operating Plan"

    private var pageTitle: String { OperatingPlanStrategyType(rawValue: strategyType)?.title ?? "Strategy" }

    var body: some View {
        OperatingPlanScrollPage {
            content
        }
        .operatingPlanChrome(back: backTitle)
        .accessibilityIdentifier("operatingPlan.strategy.\(strategyType)")
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
            OperatingPlanLoadingView()
        } else if let detail {
            loaded(detail)
        } else if isProductionManaged {
            OperatingPlanFailureView(
                title: "This strategy couldn't be loaded",
                message: loadError.map { _ in "Nothing was changed. Check your connection and try again." } ?? "This strategy is unavailable.",
                retry: loadError == nil ? nil : { Task { await loadProductionIfNeeded() } }
            )
        } else {
            OperatingPlanFailureView(title: "Unavailable", message: "This strategy is unavailable.")
        }
    }

    /// Locked strategy detail: the identity field, then the strategy
    /// itself. Energy / Nutrition / Training lead with two metric tiles;
    /// Coaching Updates is a line list plus its Scheduled Evidence card.
    private func loaded(_ detail: OperatingPlanStrategyDetailReadModel) -> some View {
        let isCoaching = detail.strategyType == .briefings
        let tiles = isCoaching ? [] : Array(detail.fields.prefix(2))
        let lines = isCoaching ? detail.fields : Array(detail.fields.dropFirst(tiles.count))
        return VStack(alignment: .leading, spacing: 0) {
            OperatingPlanHeroField(
                eyebrow: isCoaching ? "Coaching Updates" : "\(detail.strategyType.title) Strategy",
                title: detail.title,
                copy: detail.purpose,
                facts: [(label: "Goal", value: detail.goal), (label: "Started", value: Self.startedValue(detail.startedDate))].filter { !$0.value.isEmpty },
                status: detail.status.isEmpty ? nil : detail.status
            )
            .accessibilityIdentifier("operatingPlan.strategy.hero")

            OperatingPlanGroupTitle(isCoaching ? "Strategy Detail" : "Current Strategy", icon: isCoaching ? "text.alignleft" : OperatingPlanIcon.systemImage(for: detail.strategyType.rawValue))
            if !tiles.isEmpty {
                HStack(alignment: .top, spacing: 10) {
                    ForEach(tiles) { field in
                        OperatingPlanMetricTile(label: field.label, value: field.value)
                    }
                }
                .padding(.bottom, 4)
            }
            ForEach(lines) { field in
                OperatingPlanLine(field.label, field.value)
            }

            if !detail.energyPhaseHistory.isEmpty {
                OperatingPlanGroupTitle("Phase History", icon: "clock.arrow.circlepath")
                VStack(spacing: 8) {
                    ForEach(detail.energyPhaseHistory) { snapshot in
                        energyPhaseCard(snapshot)
                    }
                }
            }

            if isCoaching, let scheduled = scheduledEvidence {
                scheduledEvidenceCard(scheduled)
            }

            if detail.strategyType == .energy {
                Text("Read-only by design: Energy follows the active phase.")
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanCaption)
                    .foregroundStyle(OperatingPlanColor.muted)
                    .padding(.top, 14)
            }

            if let editLabel = detail.editLabel, let editDestination = detail.editDestination {
                OperatingPlanButton(title: editLabel, style: isCoaching ? .navy : .primary) {
                    OperatingPlanNavigationContext.navigate(editDestination, from: pageTitle, using: onNavigate)
                }
                .padding(.top, 20)
                .accessibilityIdentifier("operatingPlan.strategy.edit")
            }
        }
    }

    // MARK: Scheduled Evidence (Coaching Updates, Founder D3)

    /// The DEXA appointment and Progress Photos cadence, read from the same
    /// Coaching Updates record (presentation only; it edits nothing).
    private var scheduledEvidence: (dexa: NextDexaScanPresentation, photos: CoachingProgressPhotosReadModel)? {
        let editor: CoachingUpdatesEditorReadModel? = isProductionManaged
            ? productionCoachingDetail?.editor
            : environment.operatingPlanStore.coachingEditor(strategyId: strategyId)
        guard let editor else { return nil }
        let today = OperatingPlanDateValues.dateKey(from: Date())
        return (NextDexaScanPresentation(dexa: editor.dexa, eventBriefingEnabled: editor.dexaEventBriefingEnabled, today: today), editor.photos)
    }

    private func scheduledEvidenceCard(_ scheduled: (dexa: NextDexaScanPresentation, photos: CoachingProgressPhotosReadModel)) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            OperatingPlanGroupTitle("Scheduled Evidence", icon: "calendar")
            OperatingPlanSurface {
                Button {
                    OperatingPlanNavigationContext.navigate(.operatingPlanDexaAppointment, from: pageTitle, using: onNavigate)
                } label: {
                    OperatingPlanLine("Next DEXA scan", scheduled.dexa.summaryText,
                                      detail: scheduled.dexa.isScheduled ? scheduled.dexa.remindersSummary : "Schedule it in Coaching Updates") {
                        OperatingPlanChevron()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens Next DEXA Scan")
                .accessibilityIdentifier("operatingPlan.coaching.nextDexa")
                OperatingPlanLine("Progress Photos", scheduled.photos.cadenceSummary,
                                  detail: Self.nextPhotoLabel(scheduled.photos), showsRule: false)
                    .accessibilityIdentifier("operatingPlan.coaching.photos")
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("operatingPlan.coaching.scheduledEvidence")
        }
    }

    /// The Server phrases it "Started Aug 16, 2026"; under the hero's
    /// "Started" label only the date is shown.
    static func startedValue(_ startedDate: String) -> String {
        startedDate.hasPrefix("Started ") ? String(startedDate.dropFirst("Started ".count)) : startedDate
    }

    static func nextPhotoLabel(_ photos: CoachingProgressPhotosReadModel) -> String? {
        let today = OperatingPlanDateValues.dateKey(from: Date())
        guard let date = ProgressPhotoCadencePreview.firstOccurrence(edited: photos, saved: photos, today: today) else { return nil }
        return "Next: \(OperatingPlanDateValues.readableDate(date))"
    }

    private func energyPhaseCard(_ snapshot: OperatingPlanEnergyPhaseSnapshotReadModel) -> some View {
        OperatingPlanSurface(tone: snapshot.isActive ? .field : .paper, verticalPadding: 12) {
            HStack {
                Text("Phase \(snapshot.phaseOrder)")
                    .physiqueOSFont(PhysiqueOSTypography.operatingPlanEyebrow)
                    .foregroundStyle(snapshot.isActive ? OperatingPlanColor.fieldInk : OperatingPlanColor.muted)
                Spacer()
                OperatingPlanStatusPill(text: snapshot.isActive ? "Active" : "Completed", tone: snapshot.isActive ? .green : .muted)
            }
            Text(snapshot.phaseName)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardTitle)
                .foregroundStyle(snapshot.isActive ? OperatingPlanColor.fieldInk : OperatingPlanColor.ink)
                .padding(.top, 4)
            OperatingPlanLine("Caloric Intake", snapshot.caloricIntake)
            OperatingPlanLine("Activity Target", snapshot.activityTarget)
            OperatingPlanLine("Review Cadence", snapshot.reviewCadence, showsRule: false)
            Text(snapshot.note)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldDetail)
                .foregroundStyle(OperatingPlanColor.muted)
        }
    }
}
