import SwiftUI

/// The locked pending review band: uploads still awaiting the Founder's
/// review before they become canonical evidence. Each review routes to
/// `AppDestination.evidenceReview`; a likely duplicate keeps its warning.
struct PendingEvidenceReviewsCardView: View {
    let reviews: [PendingEvidenceReview]
    var onTap: (AppDestination) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Uploads ready to review")
                .logText(LogType.rowLabel)
                .foregroundStyle(PhysiqueOSTheme.redesignAmberInk)
                .accessibilityAddTraits(.isHeader)
            Text("Finish checking these uploads before adding them to your history.")
                .logText(LogType.meta12)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(Array(reviews.enumerated()), id: \.element.id) { index, review in
                Button { onTap(review.destination) } label: {
                    reviewItem(review)
                }
                .buttonStyle(.plain)
                .padding(.top, index == 0 ? 0 : 6)
                .accessibilityIdentifier("log.review.\(review.id)")
            }
        }
        .padding(.vertical, 11)
        .padding(.horizontal, 12)
        .padding(.leading, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LogBandBackground(tone: PhysiqueOSTheme.redesignAmberInk))
    }

    private func reviewItem(_ review: PendingEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(review.title)
                .logText(LogType.reviewTitle)
                .foregroundStyle(PhysiqueOSTheme.redesignInk)
                .padding(.top, 5)
            Text("\(review.date) · \(review.summary)")
                .logText(LogType.meta12)
                .foregroundStyle(PhysiqueOSTheme.redesignInkSecondary)
                .fixedSize(horizontal: false, vertical: true)
                // CSS `margin: 4px 0`; the bottom 4 collapses into the
                // action's 6 pt top margin.
                .padding(.top, 4)
            if review.likelyDuplicate {
                Label("This may be another copy of an earlier upload.", systemImage: "exclamationmark.triangle.fill")
                    .labelStyle(LogInlineWarningLabelStyle())
                    .logText(LogType.meta12)
                    .foregroundStyle(PhysiqueOSTheme.redesignAmberInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            }
            Text("Review before adding to your history →")
                .logText(LogType.action12)
                .foregroundStyle(PhysiqueOSTheme.redesignAmberInk)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel([
            review.title, review.date, review.summary,
            review.likelyDuplicate ? "This may be another copy of an earlier upload." : nil,
            "Review before adding to your history",
        ].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
    }
}

/// Icon + text so the duplicate warning is never color-only.
private struct LogInlineWarningLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            configuration.icon.font(.system(size: 10, weight: .bold))
            configuration.title
        }
    }
}
