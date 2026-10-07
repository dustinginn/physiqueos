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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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

    var backTitle: String = "Operating Plan"

    var body: some View {
        OperatingPlanScrollPage {
            content
        }
        .operatingPlanChrome(back: backTitle)
        .accessibilityIdentifier("operatingPlan.domain")
        .task(id: "\(protocolId):\(environment.nativeAuthority)") { await loadProductionIfNeeded() }
        .refreshable {
            if environment.nativeAuthority == .founderProduction {
                await environment.productionNativeAPI.invalidateReadResources(["operating-plan-protocol-domain"])
            }
            await loadProductionIfNeeded()
        }
    }

    @ViewBuilder
    private var content: some View {
        if environment.nativeAuthority == .founderProduction, isLoadingProduction, productionDomain == nil {
            OperatingPlanLoadingView()
        } else if let domain {
            OperatingPlanHeader(eyebrow: domain.category.rawValue.capitalized, title: domain.title, subtitle: domain.purpose)
            VStack(spacing: 12) {
                ForEach(domain.methods) { method in
                    methodCard(method, category: domain.category, domainTitle: Self.pageTitle(for: domain.category))
                }
            }
            if let lifecycleError {
                OperatingPlanErrorText(message: lifecycleError).padding(.top, 14)
            }
        } else {
            OperatingPlanFailureView(
                title: "This support strategy couldn't be loaded",
                message: loadError == nil ? "This support strategy is unavailable." : "Nothing was changed. Check your connection and try again.",
                retry: loadError == nil ? nil : { Task { await loadProductionIfNeeded() } }
            )
        }
    }

    /// The crumb title this domain gives the pages it opens.
    static func pageTitle(for category: ProtocolCategory) -> String {
        switch category {
        case .peptide: "Peptides"
        case .supplement: "Supplements"
        case .recovery: "Recovery"
        default: category.rawValue.capitalized
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

    private func methodCard(_ method: OperatingPlanSupportMethodReadModel, category: ProtocolCategory, domainTitle: String) -> some View {
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
        let isChanging = changingLifecycleProtocolId == method.protocolId
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                OperatingPlanIconTile(systemImage: OperatingPlanIcon.systemImage(for: category.rawValue), tint: OperatingPlanColor.tint(for: category.rawValue))
                VStack(alignment: .leading, spacing: 3) {
                    Text(method.name)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardTitle)
                        .foregroundStyle(OperatingPlanColor.ink)
                    Text(method.purpose)
                        .physiqueOSFont(PhysiqueOSTypography.operatingPlanCardDetail)
                        .foregroundStyle(OperatingPlanColor.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                if isPaused {
                    OperatingPlanStatusPill(text: "Paused", tone: .muted)
                } else {
                    HStack(spacing: 6) {
                        if Self.showsReminderIndicator(method: method, lifecycleState: status) {
                            Image(systemName: "bell.fill")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(OperatingPlanColor.teal)
                                .accessibilityLabel("Reminder on")
                        }
                        OperatingPlanStatusPill(text: "Active", tone: .green)
                    }
                }
            }
            if method.currentDose != nil || method.currentSchedule != nil {
                HStack(alignment: .top, spacing: 12) {
                    if let dose = method.currentDose { fact("Current dose", dose) }
                    if let schedule = method.currentSchedule { fact("Schedule", schedule) }
                }
            } else {
                fact("Support", method.supportSummary)
            }
            actions(method, category: category, domainTitle: domainTitle, isPaused: isPaused, isChanging: isChanging, lifecycleAction: lifecycleAction)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(OperatingPlanColor.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(OperatingPlanColor.rule, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("operatingPlan.domain.method.\(method.protocolId)")
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldLabel)
                .foregroundStyle(OperatingPlanColor.muted)
            Text(value)
                .physiqueOSFont(PhysiqueOSTypography.operatingPlanFieldValue)
                .foregroundStyle(OperatingPlanColor.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// Full-size (>= 44 pt) actions replacing the old 12 pt text buttons:
    /// navigation actions side by side (stacked at accessibility sizes),
    /// a Supplement's lifecycle action on its own row.
    @ViewBuilder
    private func actions(
        _ method: OperatingPlanSupportMethodReadModel,
        category: ProtocolCategory,
        domainTitle: String,
        isPaused: Bool,
        isChanging: Bool,
        lifecycleAction: OperatingPlanLifecycleActionReadModel
    ) -> some View {
        VStack(spacing: 10) {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 10) { primaryButtons(method, category: category, domainTitle: domainTitle, isPaused: isPaused, isChanging: isChanging) }
            } else {
                HStack(spacing: 10) { primaryButtons(method, category: category, domainTitle: domainTitle, isPaused: isPaused, isChanging: isChanging) }
            }
            if category == .supplement {
                OperatingPlanButton(title: lifecycleAction.label, style: lifecycleAction.isPause ? .destructive : .navy, isEnabled: !isChanging) {
                    changeLifecycle(method, action: lifecycleAction)
                }
                .accessibilityIdentifier("operatingPlan.domain.supplement.lifecycle")
            }
        }
    }

    @ViewBuilder
    private func primaryButtons(
        _ method: OperatingPlanSupportMethodReadModel,
        category: ProtocolCategory,
        domainTitle: String,
        isPaused: Bool,
        isChanging: Bool
    ) -> some View {
        if category == .peptide {
            if let editDestination = method.editDestination {
                OperatingPlanButton(title: "Manage", style: .quiet) {
                    OperatingPlanNavigationContext.navigate(editDestination, from: domainTitle, using: onNavigate)
                }
                .accessibilityIdentifier("operatingPlan.domain.peptide.manage")
            }
            if isPaused {
                OperatingPlanButton(title: "Resume", systemImage: "play.fill", style: .navy, isEnabled: !isChanging) { resumePeptide(method) }
                    .accessibilityIdentifier("operatingPlan.domain.peptide.resume")
            }
        } else {
            if let editDestination = method.editDestination, !isPaused {
                OperatingPlanButton(title: "Edit Support", style: .quiet) {
                    OperatingPlanNavigationContext.navigate(editDestination, from: domainTitle, using: onNavigate)
                }
                .accessibilityIdentifier("operatingPlan.domain.editSupport")
            }
            if category == .supplement, !isPaused {
                OperatingPlanButton(title: "Edit Strategy", style: .quiet) {
                    onNavigate(.operatingPlanSupplementEdit(protocolId: method.protocolId))
                }
                .accessibilityIdentifier("operatingPlan.domain.supplement.editStrategy")
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

}
