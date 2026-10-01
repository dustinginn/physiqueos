import SwiftUI

/// `/profile/protocols/[protocolId]` when the resolved protocol's category
/// is Recovery, Peptide, or Supplement and it is active —
/// `StrategyDomainScreen.jsx`'s roll-up of every active protocol sharing
/// that category. `DOMAIN_PRESENTATION`'s icon/tone/title per category is
/// mirrored via `OperatingPlanIcon`/`ProtocolCategory`.
///
/// Supplement rows retain the distinct web Strategy and Support edit
/// concepts; Pause/Restore remains a separate lifecycle action.
///
/// Peptide rows read their pause from the S4 `executionLifecycle` key
/// (`lifecycleState` stays `active` for peptides so Build 69 keeps its
/// button). The entry button is always visible and says "Manage" — the
/// peptide screen is where Pause lives — and a paused peptide also gets a
/// one-tap "Resume" here so it is never unreachable.
struct OperatingPlanProtocolDomainView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let protocolId: String
    let onNavigate: (AppDestination) -> Void
    @State private var productionDomain: OperatingPlanProtocolDomainReadModel?
    @State private var isLoadingProduction = false
    @State private var loadError: String?
    @State private var lifecycleError: String?
    @State private var changingLifecycleProtocolId: String?

    private var domain: OperatingPlanProtocolDomainReadModel? {
        switch environment.nativeAuthority {
        case .sandbox: environment.operatingPlanStore.protocolDomain(protocolId: protocolId)
        case .founderProduction: productionDomain
        }
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
        .task(id: "\(protocolId):\(environment.nativeAuthority)") { await loadProductionIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        if environment.nativeAuthority == .founderProduction, isLoadingProduction, productionDomain == nil {
            ProgressView().tint(PhysiqueOSTheme.accent).frame(maxWidth: .infinity, minHeight: 240)
        } else if let domain {
            VStack(alignment: .leading, spacing: 16) {
                OperatingPlanScreenHeader(eyebrow: domain.category.rawValue.capitalized, title: domain.title, subtitle: domain.purpose)
                VStack(spacing: 8) {
                    ForEach(domain.methods) { method in
                        methodCard(method, category: domain.category)
                    }
                }
                if let lifecycleError {
                    OperatingPlanEditorErrorBanner(message: lifecycleError)
                }
            }
        } else {
            OperatingPlanUnavailableView(message: loadError ?? "This support strategy is unavailable.")
        }
    }

    @MainActor
    private func loadProductionIfNeeded() async {
        guard environment.nativeAuthority == .founderProduction else { return }
        isLoadingProduction = true
        loadError = nil
        defer { isLoadingProduction = false }
        do {
            productionDomain = try await environment.operatingPlanProtocolDomainAPI.fetchDomain(protocolId: protocolId)
        } catch {
            productionDomain = nil
            loadError = "This support strategy couldn't be loaded. Try again."
        }
    }

    private func methodCard(_ method: OperatingPlanSupportMethodReadModel, category: ProtocolCategory) -> some View {
        let status = Self.lifecycleStatus(
            method: method,
            category: category,
            sandboxStatus: environment.nativeAuthority == .sandbox ? sandboxLifecycleStatus(method, category: category) : nil
        )
        let isPaused = status == "paused"
        let lifecycleAction = OperatingPlanLifecycleActionReadModel(
            label: isPaused ? "Restore" : "Pause",
            isPause: !isPaused
        )
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
                    else if Self.showsReminderIndicator(method: method, lifecycleState: status) {
                        Image(systemName: "bell.fill")
                            .foregroundStyle(PhysiqueOSTheme.accent)
                            .accessibilityLabel("Reminder on")
                    }
                }
                OperatingPlanFieldRow(label: "Support", value: method.supportSummary)
                if let dose = method.currentDose {
                    OperatingPlanFieldRow(label: "Current Dose", value: dose)
                }
                if let schedule = method.currentSchedule {
                    OperatingPlanFieldRow(label: "Schedule", value: schedule)
                }
                HStack(spacing: 12) {
                    if category == .peptide {
                        if let editDestination = method.editDestination {
                            Button("Manage") { onNavigate(editDestination) }
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                                .accessibilityIdentifier("operatingPlan.domain.peptide.manage")
                        }
                        if isPaused {
                            Button("Resume") { resumePeptide(method) }
                                .disabled(changingLifecycleProtocolId == method.protocolId)
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                                .accessibilityIdentifier("operatingPlan.domain.peptide.resume")
                        }
                    } else if let editDestination = method.editDestination, !isPaused {
                        Button("Edit Support") { onNavigate(editDestination) }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    if category == .supplement {
                        if !isPaused {
                            Button("Edit Strategy") { onNavigate(.operatingPlanSupplementEdit(protocolId: method.protocolId)) }
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.accent)
                        }
                        Button(lifecycleAction.label) {
                            changeLifecycle(method, action: lifecycleAction)
                        }
                        .disabled(changingLifecycleProtocolId == method.protocolId)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(lifecycleAction.isPause ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.chartSuccess)
                    }
                }
            }
        }
    }

    /// Which lifecycle string the card chip follows. Supplements: the
    /// protocol `lifecycleState` (sandbox: the local store). Peptides: the
    /// S4 `executionLifecycle.state` — the protocol stays `active` while an
    /// execution is suspended — falling back to `active` when the Server
    /// does not project it yet. A sandbox status, when given, wins.
    static func lifecycleStatus(
        method: OperatingPlanSupportMethodReadModel,
        category: ProtocolCategory,
        sandboxStatus: String?
    ) -> String {
        if let sandboxStatus { return sandboxStatus }
        switch category {
        case .peptide: return method.executionLifecycle?.state ?? "active"
        default: return method.lifecycleState ?? "active"
        }
    }

    private func sandboxLifecycleStatus(_ method: OperatingPlanSupportMethodReadModel, category: ProtocolCategory) -> String? {
        switch category {
        case .supplement: environment.operatingPlanStore.supplementStatus(protocolId: method.protocolId)
        case .peptide: environment.operatingPlanStore.peptideLifecycleState(protocolId: method.protocolId)
        default: nil
        }
    }

    /// S3 resume from the domain card. The If-Match token is the
    /// `executionRevision` from a fresh peptide-support read — the domain
    /// read does not carry one — so a stale card can never resume blindly.
    private func resumePeptide(_ method: OperatingPlanSupportMethodReadModel) {
        switch environment.nativeAuthority {
        case .sandbox:
            environment.operatingPlanStore.setPeptidePaused(protocolId: method.protocolId, paused: false)
        case .founderProduction:
            Task { @MainActor in
                changingLifecycleProtocolId = method.protocolId
                lifecycleError = nil
                defer { changingLifecycleProtocolId = nil }
                do {
                    guard let revision = try await environment.peptideSupportAPI.fetchSupport(protocolId: method.protocolId)?.executionRevision else {
                        lifecycleError = "Refresh \(method.name) before resuming it."
                        return
                    }
                    _ = try await environment.peptideLifecycleAPI.resume(protocolId: method.protocolId, expectedRevision: revision)
                    await environment.productionNativeAPI.invalidateReadResources([
                        "operating-plan", "operating-plan-protocol-domain", "operating-plan-peptide-support",
                    ])
                    await environment.reconcileCanonicalPriorityNotifications()
                    await loadProductionIfNeeded()
                } catch {
                    lifecycleError = "\(method.name) was not resumed. Open Manage to try again."
                }
            }
        }
    }

    /// The card bell is owned only by this method's canonical reminder
    /// projection. Schedule existence, sibling methods, and category state
    /// are deliberately irrelevant.
    static func showsReminderIndicator(
        method: OperatingPlanSupportMethodReadModel,
        lifecycleState: String
    ) -> Bool {
        lifecycleState != "paused" && method.reminderEnabled == true
    }

    private func changeLifecycle(
        _ method: OperatingPlanSupportMethodReadModel,
        action: OperatingPlanLifecycleActionReadModel
    ) {
        switch environment.nativeAuthority {
        case .sandbox:
            environment.operatingPlanStore.setSupplementPaused(
                protocolId: method.protocolId,
                paused: action.isPause
            )
        case .founderProduction:
            guard let expectedCurrentVersionId = method.currentVersionId else {
                lifecycleError = "Refresh this supplement strategy before trying again."
                return
            }
            Task { @MainActor in
                changingLifecycleProtocolId = method.protocolId
                lifecycleError = nil
                defer { changingLifecycleProtocolId = nil }
                do {
                    _ = try await environment.supplementStrategyAPI.changeLifecycle(
                        protocolId: method.protocolId,
                        operation: action.isPause ? "pause" : "restore",
                        expectedCurrentVersionId: expectedCurrentVersionId
                    )
                    await environment.productionNativeAPI.invalidateReadResources([
                        "operating-plan", "operating-plan-protocol-domain",
                    ])
                    await loadProductionIfNeeded()
                } catch {
                    lifecycleError = "This Supplement lifecycle change was not saved. Refresh before retrying."
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
