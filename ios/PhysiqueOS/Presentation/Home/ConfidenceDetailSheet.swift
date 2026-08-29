import SwiftUI

/// Mirrors `HomeConfidenceDetailBody` inside `HomeConfidenceDetail.jsx`: the
/// bottom-sheet explanation shown when the Confidence ring is tapped. The
/// web has no separate "Confidence" screen/route today — this is an
/// in-place detail sheet on Home, not a navigation destination, and native
/// preserves that rather than inventing a route the product doesn't have.
struct ConfidenceDetailSheet: View {
    let confidence: Int
    let detail: ConfidenceDetail

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Why confidence is \(confidence)%")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)

                Text("Current confidence: \(detail.qualitativeLevel)")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)

                factorGroup(systemImage: "checkmark.circle.fill", title: "What supports confidence", items: detail.supportingFactors)
                factorGroup(systemImage: "questionmark.circle.fill", title: "What limits confidence", items: detail.limitingFactors)
                factorGroup(systemImage: "chart.line.uptrend.xyaxis", title: "What will make confidence clearer", items: detail.clarifyingFactors)

                if !detail.uncertaintyStatement.isEmpty {
                    Text(detail.uncertaintyStatement)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(20)
        }
        .background(PhysiqueOSTheme.surfaceElevated)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private func factorGroup(systemImage: String, title: String, items: [String]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Label(title, systemImage: systemImage)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .labelStyle(.titleAndIcon)
                    .tint(PhysiqueOSTheme.accent)
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 6) {
                        Text("•")
                        Text(item)
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}
