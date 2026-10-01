import SwiftUI

/// Mirrors `PendingEvidenceReviews` inside `LogHubScreen.jsx`: uploads
/// still awaiting the Founder's review before they become canonical
/// evidence. Tapping a review routes to `AppDestination.evidenceReview` —
/// Evidence Review itself remains a future slice, but the entry point and
/// its meaning (this evidence is NOT canonical yet) must be represented
/// correctly.
struct PendingEvidenceReviewsCardView: View {
    let reviews: [PendingEvidenceReview]
    var onTap: (AppDestination) -> Void

    var body: some View {
        CardContainer(padding: .sm) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    IconBadge(systemImage: "list.clipboard.fill", color: .primary, size: .sm)
                    Text("Uploads ready to review")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.textPrimary)
                }
                Text("Finish checking these uploads before adding them to your history.")
                    .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                VStack(spacing: 8) {
                    ForEach(reviews) { review in
                        Button { onTap(review.destination) } label: {
                            reviewRow(review)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func reviewRow(_ review: PendingEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(review.title)
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text(review.date)
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Text(review.summary)
                .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            if review.likelyDuplicate {
                Text("This may be another copy of an earlier upload.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.chartEffort)
            }
            Text("Review before adding to your history")
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.accent)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
