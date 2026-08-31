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
    }
}
