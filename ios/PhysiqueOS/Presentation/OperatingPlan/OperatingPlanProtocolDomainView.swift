import SwiftUI

/// `/profile/protocols/[protocolId]` when the resolved protocol's category
/// is Recovery, Peptide, or Supplement and it is active —
/// `StrategyDomainScreen.jsx`'s roll-up of every active protocol sharing
/// that category. `DOMAIN_PRESENTATION`'s icon/tone/title per category is
/// mirrored via `OperatingPlanIcon`/`ProtocolCategory`.
///
/// Native enhancement: Supplement rows additionally surface Pause/Restore
/// inline (`supplementActions.js`'s `pauseSupplement`/`restoreSupplement`)
/// rather than only via a separately-routed non-active protocol detail
/// screen — the web reaches that action from a harder-to-discover path;
/// surfacing it directly on the row is a presentation choice, not a claim
/// about a different web layout.
struct OperatingPlanProtocolDomainView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let protocolId: String
    let onNavigate: (AppDestination) -> Void

    private var domain: OperatingPlanProtocolDomainReadModel? {
        environment.operatingPlanStore.protocolDomain(protocolId: protocolId)
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
        if let domain {
            VStack(alignment: .leading, spacing: 16) {
                OperatingPlanScreenHeader(eyebrow: domain.category.rawValue.capitalized, title: domain.title, subtitle: domain.purpose)
                VStack(spacing: 8) {
                    ForEach(domain.methods) { method in
                        methodCard(method, category: domain.category)
                    }
                }
            }
        } else {
            OperatingPlanUnavailableView(message: "This support strategy is unavailable.")
        }
    }

    private func methodCard(_ method: OperatingPlanSupportMethodReadModel, category: ProtocolCategory) -> some View {
        let status = category == .supplement ? environment.operatingPlanStore.supplementStatus(protocolId: method.protocolId) : "active"
        let isPaused = status == "paused"
        return CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 10) {
                    IconBadge(systemImage: OperatingPlanIcon.systemImage(for: category.rawValue), color: colorToken(for: category), size: .sm, isCircular: true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(method.name)
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text(method.purpose)
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer(minLength: 6)
                    if isPaused { StatusChip(text: "Paused", color: .muted) }
                }
                OperatingPlanFieldRow(label: "Support", value: method.supportSummary)
                if let dose = method.currentDose {
                    OperatingPlanFieldRow(label: "Current Dose", value: dose)
                }
                if let schedule = method.currentSchedule {
                    OperatingPlanFieldRow(label: "Schedule", value: schedule)
                }
                HStack(spacing: 12) {
                    if let editDestination = method.editDestination, !isPaused {
                        Button("Edit Support") { onNavigate(editDestination) }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    if category == .supplement {
                        let action = environment.operatingPlanStore.lifecycleAction(protocolId: method.protocolId)
                        Button(action.label) {
                            environment.operatingPlanStore.setSupplementPaused(protocolId: method.protocolId, paused: action.isPause)
                        }
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(action.isPause ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.chartSuccess)
                    }
                }
            }
        }
    }

    private func colorToken(for category: ProtocolCategory) -> HomeColorToken {
        switch category {
        case .recovery: .success
        case .peptide: .effort
        case .supplement: .success
        default: .primary
        }
    }
}
