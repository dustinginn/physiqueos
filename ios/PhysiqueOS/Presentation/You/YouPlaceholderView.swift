import SwiftUI

/// Mostly-placeholder "You" tab (the web's Founder profile/settings route,
/// `route: "profile"` in `bottomNavigation.js`, rendered by
/// `YouScreen.jsx`). Replaces the prior slice's `ProfilePlaceholderView` —
/// same scope, renamed to match the corrected `AppTab.you` case and its
/// "You" label — but now adds the one real doorway `YouScreen.jsx` itself
/// exposes into a built-out vertical: Operating Plan
/// (`/profile/operating-plan`). This is the smallest source-faithful route
/// into Operating Plan the current navigation architecture needs; the
/// screen's other two doorways (Goals, Integrations) and its Operating
/// Status card remain out of this slice's scope.
struct YouPlaceholderView: View {
    let onNavigate: (AppDestination) -> Void
    @Environment(AppEnvironment.self) private var environment
    @State private var validationAction: DEXAValidationAction?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(eyebrow: "YOU", title: "What PhysiqueOS knows.", subtitle: "Your operating profile, evidence sources, protocols, and preferences in one place.")

                Button { onNavigate(.operatingPlan) } label: {
                    OperatingPlanRow(
                        iconKey: "coaching",
                        color: .primary,
                        title: "Operating Plan",
                        detail: "Current strategy and protocols across every domain"
                    )
                }
                .buttonStyle(.plain)

                Button { onNavigate(.founderServerConnection) } label: {
                    OperatingPlanRow(
                        iconKey: "tracking",
                        color: .evidence,
                        title: "Founder device connection",
                        detail: "Manage the live Founder Production connection"
                    )
                }
                .buttonStyle(.plain)

                if environment.nativeAuthority == .founderProduction {
                    dexaHealthSettings
                }

                Text("Founder profile and settings arrive in a later slice.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .confirmationDialog(
            validationAction?.title ?? "DEXA validation",
            isPresented: Binding(
                get: { validationAction != nil },
                set: { if !$0 { validationAction = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let validationAction {
                Button(validationAction.buttonTitle, role: validationAction == .delete ? .destructive : nil) {
                    let action = validationAction.rawValue
                    self.validationAction = nil
                    Task { await environment.dexaHealthKitWritebackCoordinator.runPhysicalValidation(action: action) }
                }
            }
            Button("Cancel", role: .cancel) { validationAction = nil }
        } message: {
            Text(validationAction?.message ?? "")
        }
    }

    private var dexaHealthSettings: some View {
        let coordinator = environment.dexaHealthKitWritebackCoordinator
        return CardContainer {
            VStack(alignment: .leading, spacing: 14) {
                Toggle(isOn: Binding(
                    get: { coordinator.isEnabled },
                    set: { enabled in
                        if enabled { Task { await coordinator.enable() } }
                        else { coordinator.disable() }
                    }
                )) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("DEXA → Apple Health")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Body Fat % and calculated fat-free Lean Body Mass only. No DEXA Weight.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
                .tint(PhysiqueOSTheme.accent)

                Text(coordinator.state.label)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)

                if coordinator.isEnabled {
                    Button("Retry writeback") { Task { await coordinator.reconcilePermanent() } }
                        .buttonStyle(.bordered)

                    Divider().overlay(PhysiqueOSTheme.divider)
                    Text("Founder physical validation · Sep 12")
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("Writes exactly the guarded canonical scan, verifies both PhysiqueOS-owned samples, then supports exact deletion. Run only during the physical validation session.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    HStack {
                        Button("Write validation samples") { validationAction = .write }
                            .buttonStyle(.borderedProminent)
                        Button("Delete validation samples", role: .destructive) { validationAction = .delete }
                            .buttonStyle(.bordered)
                    }
                }
            }
        }
    }
}

private enum DEXAValidationAction: String {
    case write, delete
    var title: String { self == .write ? "Write Sep 12 validation samples?" : "Delete Sep 12 validation samples?" }
    var buttonTitle: String { self == .write ? "Write and verify" : "Delete exactly these samples" }
    var message: String {
        self == .write
            ? "This is a deliberate physical test. PhysiqueOS will write only the real canonical Sep 12 Body Fat % and calculated fat-free Lean Body Mass."
            : "PhysiqueOS will delete only its two owned Sep 12 validation samples after verifying their exact identities."
    }
}
