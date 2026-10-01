import SwiftUI

/// Mirrors `TrainingLoggerCard` inside `LogHubScreen.jsx`: an accent-tinted
/// promo card linking to the fixture-backed Native Training Logger through
/// the typed `AppDestination.trainingLogger` route.
struct TrainingLoggerCardView: View {
    var onTap: (AppDestination) -> Void

    var body: some View {
        Button { onTap(.trainingLogger) } label: {
            CardContainer(padding: .sm, background: PhysiqueOSTheme.surfaceAccent) {
                HStack(spacing: 12) {
                    IconBadge(systemImage: "dumbbell.fill", color: .primary, size: .md)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Training Logger")
                            .physiqueOSFont(PhysiqueOSTypography.cardHeading20)
                            .foregroundStyle(PhysiqueOSTheme.textPrimary)
                        Text("Start a workout or log a past workout with exercises, sets, variants, and supersets.")
                            .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(PhysiqueOSTheme.accent)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
