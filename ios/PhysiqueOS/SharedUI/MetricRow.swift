import SwiftUI

/// Mirrors the inline `HeroMetric` helper in `HomeHeroCard.jsx`: an icon,
/// a small label, and a bold value, used for "Projected Finish" and
/// "Days Remaining".
struct MetricRow: View {
    let systemImage: String
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 8) {
            IconBadge(systemImage: systemImage, color: .evidence, size: .sm)
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                Text(value)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
