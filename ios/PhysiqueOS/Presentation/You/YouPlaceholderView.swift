import SwiftUI

/// Founder-locked You hierarchy. Only routes with working Build 86 Native
/// contracts are exposed; deferred profile, source, and sign-out actions do
/// not appear as dead controls.
struct YouPlaceholderView: View {
    let onNavigate: (AppDestination) -> Void
    var onSelectGoals: () -> Void = {}
    @Environment(AppEnvironment.self) private var environment
    @State private var validationAction: DEXAValidationAction?
    @State private var showDexaOptInExplanation = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RedesignPageHeader(
                    eyebrow: "YOU",
                    title: "What PhysiqueOS knows.",
                    subtitle: "Your operating profile, strategy and preferences in one place."
                )
                operatingStatus
                VStack(spacing: 0) {
                    YouNavigationRow(icon: "target", tint: PhysiqueOSTheme.redesignPurple, title: "Goals", detail: "Current journey and completed goals", action: onSelectGoals)
                    Divider().overlay(PhysiqueOSTheme.redesignRule).padding(.leading, 60)
                    YouNavigationRow(icon: "slider.horizontal.3", tint: PhysiqueOSTheme.redesignTeal, title: "Operating Plan", detail: "Strategy and protocols across every domain") { onNavigate(.operatingPlan) }
                    Divider().overlay(PhysiqueOSTheme.redesignRule).padding(.leading, 60)
                    YouNavigationRow(icon: "gearshape.fill", tint: PhysiqueOSTheme.redesignAmber, title: "Settings", detail: "Appearance on this iPhone") { onNavigate(.settings) }
                        .accessibilityIdentifier("you.settings")
                }
                .background(PhysiqueOSTheme.redesignPaper)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(PhysiqueOSTheme.redesignRule))

                VStack(alignment: .leading, spacing: 8) {
                    Text("CONNECTION")
                        .font(.system(size: 10, weight: .bold)).tracking(0.9)
                        .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    YouNavigationRow(
                        icon: "antenna.radiowaves.left.and.right",
                        tint: PhysiqueOSTheme.redesignCyan,
                        title: "Founder device connection",
                        detail: "Manage the live Founder Production connection"
                    ) { onNavigate(.founderServerConnection) }
                    .background(PhysiqueOSTheme.redesignPaper)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.redesignRule))
                }

                if environment.nativeAuthority == .founderProduction {
                    dexaHealthSettings
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.redesignCanvas)
        .toolbar(.hidden, for: .navigationBar)
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

    private var operatingStatus: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("OPERATING STATUS")
                        .font(.system(size: 10, weight: .bold)).tracking(0.9)
                        .foregroundStyle(PhysiqueOSTheme.redesignGreen)
                    Text("Your system is connected.")
                        .font(.system(size: 20, weight: .heavy))
                        .foregroundStyle(Color(hex: 0xF7FBFA))
                }
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.redesignGreen)
            }
            Text("Canonical goals and strategy remain available in their established homes.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color(hex: 0xF7FBFA).opacity(0.76))
            Divider().overlay(Color(hex: 0xF7FBFA).opacity(0.18))
            HStack {
                statusMetric("AUTHORITY", environment.nativeAuthority.displayName)
                statusMetric("MODE", environment.nativeAuthority == .founderProduction ? "Live" : "Sandbox")
            }
        }
        .padding(18)
        .background(LinearGradient(colors: [Color(hex: 0x0B6F69), Color(hex: 0x112750)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func statusMetric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.system(size: 9, weight: .bold)).tracking(0.7).foregroundStyle(Color(hex: 0xF7FBFA).opacity(0.58))
            Text(value).font(.system(size: 14, weight: .heavy)).foregroundStyle(Color(hex: 0xF7FBFA))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var dexaHealthSettings: some View {
        let coordinator = environment.dexaHealthKitWritebackCoordinator
        return VStack(alignment: .leading, spacing: 14) {
            Toggle(isOn: Binding(
                get: { coordinator.isEnabled },
                set: { enabled in
                    if enabled { showDexaOptInExplanation = true }
                    else { coordinator.disable() }
                }
            )) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("DEXA → Apple Health")
                        .font(.system(size: 16, weight: .heavy))
                        .foregroundStyle(PhysiqueOSTheme.redesignInk)
                    Text("Body Fat % and calculated fat-free Lean Body Mass only. No DEXA Weight.")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
            }
            .tint(PhysiqueOSTheme.redesignTeal)

            Text(coordinator.state.label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)

            if coordinator.isEnabled {
                Button("Retry writeback") { Task { await coordinator.reconcilePermanent() } }
                    .buttonStyle(.bordered)

                Divider().overlay(PhysiqueOSTheme.redesignRule)
                Text("Founder physical validation · Sep 12")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(PhysiqueOSTheme.redesignInk)
                Text("Writes exactly the guarded canonical scan, verifies both PhysiqueOS-owned samples, then supports exact deletion. Run only during the physical validation session.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                HStack {
                    Button("Write validation samples") { validationAction = .write }
                        .buttonStyle(.borderedProminent)
                    Button("Delete validation samples", role: .destructive) { validationAction = .delete }
                        .buttonStyle(.bordered)
                }
            }
        }
        .padding(16)
        .background(PhysiqueOSTheme.redesignPaper)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(PhysiqueOSTheme.redesignRule))
    }
}

private struct YouNavigationRow: View {
    let icon: String
    let tint: Color
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(tint)
                    .frame(width: 38, height: 38)
                    .background(tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.system(size: 16, weight: .heavy)).foregroundStyle(PhysiqueOSTheme.redesignInk)
                    Text(detail).font(.system(size: 12, weight: .medium)).foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)).foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
            }
            .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
            .padding(.horizontal, 14)
        }
        .buttonStyle(.plain)
    }
}

struct SettingsView: View {
    let onNavigate: (AppDestination) -> Void
    @Environment(AppAppearanceStore.self) private var appearance

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RedesignPageHeader(eyebrow: "SETTINGS", title: "Settings", subtitle: "Preferences available on this iPhone.")
                VStack(alignment: .leading, spacing: 8) {
                    Text("APP")
                        .font(.system(size: 10, weight: .bold)).tracking(0.9)
                        .foregroundStyle(PhysiqueOSTheme.redesignPurple)
                    YouNavigationRow(
                        icon: "circle.lefthalf.filled",
                        tint: PhysiqueOSTheme.redesignPurple,
                        title: "Appearance",
                        detail: appearance.selection == .light ? "Mineral Light" : appearance.selection.title
                    ) { onNavigate(.appearance) }
                    .background(PhysiqueOSTheme.redesignPaper)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(PhysiqueOSTheme.redesignRule))
                    .accessibilityIdentifier("settings.appearance")
                }
                Text(versionLabel)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 12)
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
        }
        .background(PhysiqueOSTheme.redesignCanvas)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.redesignCanvas, for: .navigationBar)
    }

    private var versionLabel: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        return "PhysiqueOS \(version) · Build \(build)"
    }
}

struct AppearanceView: View {
    @Environment(AppAppearanceStore.self) private var appearance

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RedesignPageHeader(eyebrow: "APPEARANCE", title: "Choose how PhysiqueOS looks.", subtitle: "System is the default. Light uses the locked Mineral Light palette.")
                VStack(spacing: 12) {
                    ForEach(AppAppearance.allCases) { option in
                        Button { appearance.select(option) } label: {
                            HStack(spacing: 14) {
                                AppearancePreview(option: option)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(option.title).font(.system(size: 17, weight: .heavy)).foregroundStyle(PhysiqueOSTheme.redesignInk)
                                    Text(option.detail).font(.system(size: 12, weight: .medium)).foregroundStyle(PhysiqueOSTheme.redesignInkSecondary).multilineTextAlignment(.leading)
                                }
                                Spacer(minLength: 4)
                                Image(systemName: appearance.selection == option ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 23, weight: .semibold))
                                    .foregroundStyle(appearance.selection == option ? PhysiqueOSTheme.redesignPurple : PhysiqueOSTheme.redesignInkSecondary.opacity(0.5))
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                            .background(PhysiqueOSTheme.redesignPaper)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(appearance.selection == option ? PhysiqueOSTheme.redesignPurple : PhysiqueOSTheme.redesignRule, lineWidth: appearance.selection == option ? 2 : 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("appearance.\(option.rawValue)")
                        .accessibilityValue(appearance.selection == option ? "Selected" : "Not selected")
                        .accessibilityAddTraits(appearance.selection == option ? .isSelected : [])
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 12)
        }
        .background(PhysiqueOSTheme.redesignCanvas)
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(PhysiqueOSTheme.redesignCanvas, for: .navigationBar)
    }
}

private struct AppearancePreview: View {
    let option: AppAppearance
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10).fill(option == .dark ? Color(hex: 0x061019) : option == .light ? Color(hex: 0xE8ECE5) : PhysiqueOSTheme.redesignSoft)
            VStack(spacing: 4) {
                Capsule().fill(option == .light ? Color(hex: 0x087E78) : Color(hex: 0x3BD2CA)).frame(width: 34, height: 7)
                HStack(spacing: 3) {
                    RoundedRectangle(cornerRadius: 3).fill(Color(hex: 0xAA98FF)).frame(width: 15, height: 18)
                    RoundedRectangle(cornerRadius: 3).fill(Color(hex: 0xEFB84F)).frame(width: 15, height: 18)
                }
            }
        }
        .frame(width: 58, height: 58)
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(PhysiqueOSTheme.redesignRule))
        .accessibilityHidden(true)
    }
}

private struct RedesignPageHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(eyebrow).font(.system(size: 11, weight: .bold)).tracking(1).foregroundStyle(PhysiqueOSTheme.redesignPurple)
            Text(title).font(.system(size: 30, weight: .heavy)).foregroundStyle(PhysiqueOSTheme.redesignInk)
            Text(subtitle).font(.system(size: 14, weight: .medium)).foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
