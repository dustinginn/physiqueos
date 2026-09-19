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
                VStack(alignment: .leading, spacing: 4) {
                    Text("Why confidence is \(confidence)%")
                        .physiqueOSFont(PhysiqueOSTypography.sheetTitle)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    Text("The evidence currently supporting and limiting the overall trajectory.")
                        .physiqueOSFont(PhysiqueOSTypography.sheetDescription)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }

                Text("Current confidence: \(detail.qualitativeLevel)")
                    .physiqueOSFont(PhysiqueOSTypography.sheetSectionHeading)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)

                if let why = detail.whyConfidence, !why.isEmpty {
                    narrativeSection(title: "Why confidence is here", text: why)
                } else if !detail.summary.isEmpty {
                    Text(detail.summary)
                        .physiqueOSFont(PhysiqueOSTypography.sheetBody)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }

                if detail.schemaVersion == "home_confidence_presentation_v3" {
                    factorGroup(systemImage: "arrow.up.right.circle.fill", title: "What increased it", items: detail.whatIncreasedIt)
                    factorGroup(systemImage: "checkmark.circle.fill", title: "What supports it now", items: detail.whatSupportsItNow)
                    factorGroup(systemImage: "exclamationmark.circle.fill", title: "What is holding it back", items: detail.whatIsHoldingItBack)
                    factorGroup(systemImage: "chart.line.uptrend.xyaxis", title: "What could raise it", items: detail.whatCouldRaiseIt)
                    factorGroup(systemImage: "chart.line.downtrend.xyaxis", title: "What could lower it", items: detail.whatCouldLowerIt)
                    if let nextEvidence = detail.nextEvidence, !nextEvidence.isEmpty {
                        narrativeSection(title: "Next evidence", text: nextEvidence)
                    }
                    if let coachTake = detail.coachTake, !coachTake.isEmpty {
                        narrativeSection(title: "Coach's take", text: coachTake)
                    }
                    factorGroup(systemImage: "info.circle.fill", title: "Assumptions", items: detail.assumptions)
                } else {
                    factorGroup(systemImage: "arrow.left.arrow.right.circle.fill", title: "What changed", items: detail.movementFactors)
                    factorGroup(systemImage: "checkmark.circle.fill", title: "What supports confidence", items: detail.supportingFactors)
                    factorGroup(systemImage: "questionmark.circle.fill", title: "What limits confidence", items: detail.limitingFactors)
                    factorGroup(systemImage: "chart.line.uptrend.xyaxis", title: "What will make confidence clearer", items: detail.clarifyingFactors)
                }

                if detail.schemaVersion != "home_confidence_presentation_v3",
                   !detail.uncertaintyStatement.isEmpty {
                    Text(detail.uncertaintyStatement)
                        .physiqueOSFont(PhysiqueOSTypography.sheetBody)
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

    private func narrativeSection(title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .physiqueOSFont(PhysiqueOSTypography.sheetSectionHeading)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(text)
                .physiqueOSFont(PhysiqueOSTypography.sheetBody)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
    }

    @ViewBuilder
    private func factorGroup(systemImage: String, title: String, items: [String]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Label(title, systemImage: systemImage)
                    .physiqueOSFont(PhysiqueOSTypography.sheetSectionHeading)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                    .labelStyle(.titleAndIcon)
                    .tint(PhysiqueOSTheme.accent)
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: 6) {
                        Text("•")
                        Text(item)
                    }
                    .physiqueOSFont(PhysiqueOSTypography.sheetBody)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
    }
}
