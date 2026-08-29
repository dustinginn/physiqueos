import SwiftUI

private let iconMap: [HomeActionIcon: String] = [
    .activity: "figure.strengthtraining.traditional",
    .analysis: "chart.bar.fill",
    .camera: "camera.fill",
    .check: "checkmark.circle.fill",
    .scale: "scalemass.fill",
    .syringe: "syringe.fill",
    .target: "list.clipboard.fill",
]

/// Mirrors `NextBestAction.jsx`/`ActionButton.jsx`: the single full-width
/// primary CTA button below the hero card.
struct NextBestActionView: View {
    let action: HomeNextBestAction
    var onTap: (AppDestination) -> Void

    var body: some View {
        Button { onTap(action.destination) } label: {
            HStack(spacing: 12) {
                Image(systemName: iconMap[action.icon] ?? "scalemass.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(.white.opacity(0.16))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                Text(action.title)
                    .physiqueOSFont(PhysiqueOSTypography.primaryActionLabel)
                    .foregroundStyle(.white)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(PhysiqueOSTheme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.title)
        .accessibilityAddTraits(.isButton)
    }
}
