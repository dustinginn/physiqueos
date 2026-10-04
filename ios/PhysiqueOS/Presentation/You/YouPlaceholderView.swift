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
    @State private var showDexaOptInExplanation = false

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

                Button { onNavigate(.settings) } label: {
                    settingsRow(
                        icon: "gearshape.fill",
                        title: "Settings",
                        detail: "Appearance on this iPhone"
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("you.settings")

                Text("Profile and data-source settings remain intentionally deferred.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .alert("Save DEXA results to Apple Health?", isPresented: $showDexaOptInExplanation) {
            Button("Continue") {
                Task { await environment.dexaHealthKitWritebackCoordinator.enable() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("PhysiqueOS saves Body Fat Percentage and calculated fat-free Lean Body Mass. Weight and other DEXA results stay in PhysiqueOS. Apple will show the write-only Health authorization next.")
        }
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

    private func settingsRow(icon: String, title: String, detail: String) -> some View {
        CardContainer(padding: .sm) {
            HStack(spacing: 10) {
                IconBadge(systemImage: icon, color: .primary, size: .sm, isCircular: true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text(detail)
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
                Spacer(minLength: 6)
                Image(systemName: "chevron.right")
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private var dexaHealthSettings: some View {
        let coordinator = environment.dexaHealthKitWritebackCoordinator
        return CardContainer {
            VStack(alignment: .leading, spacing: 14) {
                Toggle(isOn: Binding(
                    get: { coordinator.isEnabled },
                    set: { enabled in
                        if enabled { showDexaOptInExplanation = true }
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

/// Deliberately narrow Settings shell. The accepted Profile, Data Sources
/// and Sign Out designs remain deferred until their product contracts land;
/// this screen exposes no dead destinations.
struct SettingsView: View {
    let onNavigate: (AppDestination) -> Void
    @Environment(AppAppearanceStore.self) private var appearance

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "SETTINGS",
                    title: "Settings",
                    subtitle: "Device-local presentation preferences."
                )

                Button { onNavigate(.appearance) } label: {
                    CardContainer(padding: .sm) {
                        HStack(spacing: 12) {
                            IconBadge(systemImage: "circle.lefthalf.filled", color: .primary, size: .sm, isCircular: true)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Appearance")
                                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Text(appearance.selection.title == "Light" ? "Mineral Light" : appearance.selection.title)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("settings.appearance")

                Text("Profile, data sources, and account actions are not available in this implementation slice.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AppearanceView: View {
    @Environment(AppAppearanceStore.self) private var appearance

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                OperatingPlanScreenHeader(
                    eyebrow: "APPEARANCE",
                    title: "Choose how PhysiqueOS looks.",
                    subtitle: "System is the default. Light uses the locked Mineral Light palette."
                )

                VStack(spacing: 10) {
                    ForEach(AppAppearance.allCases) { option in
                        Button { appearance.select(option) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: option.systemImage)
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(option.semanticColor)
                                    .frame(width: 38, height: 38)
                                    .background(option.semanticColor.opacity(0.14), in: Circle())

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(option.title)
                                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                    Text(option.detail)
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                                        .multilineTextAlignment(.leading)
                                }

                                Spacer(minLength: 8)
                                Image(systemName: appearance.selection == option ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 23, weight: .semibold))
                                    .foregroundStyle(appearance.selection == option ? PhysiqueOSTheme.accent : PhysiqueOSTheme.textMuted)
                                    .accessibilityHidden(true)
                            }
                            .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                        }
                        .buttonStyle(AppearanceChoiceButtonStyle(isSelected: appearance.selection == option))
                        .accessibilityIdentifier("appearance.\(option.rawValue)")
                        .accessibilityValue(appearance.selection == option ? "Selected" : "Not selected")
                        .accessibilityAddTraits(appearance.selection == option ? .isSelected : [])
                    }
                }

                Text("Selecting Dark or Light moves the checkmark and applies that appearance immediately across the app.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct AppearanceChoiceButtonStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(14)
            .background(isSelected ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(isSelected ? PhysiqueOSTheme.accent : PhysiqueOSTheme.divider, lineWidth: isSelected ? 2 : 1)
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}

private extension AppAppearance {
    var systemImage: String {
        switch self {
        case .system: "iphone.gen3"
        case .dark: "moon.stars.fill"
        case .light: "sun.max.fill"
        }
    }

    var semanticColor: Color {
        switch self {
        case .system: PhysiqueOSTheme.chartEvidence
        case .dark: PhysiqueOSTheme.accent
        case .light: PhysiqueOSTheme.chartEffort
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
