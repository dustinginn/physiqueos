import SwiftUI

/// Mirrors `TrainingLoggerCard` inside `LogHubScreen.jsx`: an accent-tinted
/// promo card linking to Training Logger. Training Logger itself is a
/// major later Stage 1 priority but explicitly out of scope for this
/// slice — tapping this card correctly represents the destination without
/// pretending the workflow exists (`AppDestination.trainingLogger`).
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
