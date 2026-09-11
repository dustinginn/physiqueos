import SwiftUI

/// Founder Production's read-only Evidence Review detail — deliberately
/// minimal (see `EvidenceReviewDetailReadModel`'s doc comment for why).
/// No confirm/correct/reject/dismiss affordance exists here; those remain
/// the isolated Sandbox write flow (`LocalEvidenceReviewView`), which
/// Founder Production never routes to.
struct EvidenceReviewDetailView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let reviewId: String
    @State private var state: LoadState = .loading

    enum LoadState: Equatable {
        case loading
        case loaded(EvidenceReviewDetailReadModel?)
        case failed(String)
    }

    var body: some View {
        ScrollView {
            content
                .padding(.horizontal, 16)
                .padding(.top, 12)
        }
        .physiqueOSScrollBottomClearance()
        .background(PhysiqueOSTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .restoresInteractivePopGesture()
        .toolbarBackground(PhysiqueOSTheme.background, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button { dismiss() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Back")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    }
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
        }
        .task(id: environment.nativeAuthority) {
            state = .loading
            do {
                state = .loaded(try await environment.evidenceReviewAPI.fetchReview(reviewId: reviewId))
            } catch {
                state = .failed("This Evidence Review could not be loaded.")
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            ProgressView()
                .tint(PhysiqueOSTheme.accent)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .failed(let message):
            Text(message)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.none):
            Text("This Evidence Review could not be found.")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                .frame(maxWidth: .infinity, minHeight: 300)
        case .loaded(.some(let review)):
            VStack(alignment: .leading, spacing: 18) {
                header(for: review)
                itemsCard(review.items)
                Text("Read-only in Founder Production. Confirming, correcting, or dismissing this review is not available here.")
                    .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                    .foregroundStyle(PhysiqueOSTheme.textMuted)
            }
        }
    }

    private func header(for review: EvidenceReviewDetailReadModel) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Evidence Review")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text(Self.statusLabel(review.status))
                .physiqueOSFont(PhysiqueOSTypography.screenTitle)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            HStack(spacing: 8) {
                if let createdAt = review.createdAt {
                    Text(TrainingDateFormatting.short(createdAt))
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
                if let version = review.version {
                    Text("Version \(version)")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func itemsCard(_ items: [EvidenceReviewDetailItem]) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 10) {
                TrainingSectionHeaderView(title: "Captured Evidence")
                if items.isEmpty {
                    Text("No evidence items are attached to this review.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                } else {
                    VStack(spacing: 6) {
                        ForEach(items) { item in
                            HStack {
                                Text(Self.typeLabel(item.type))
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                                Spacer(minLength: 8)
                                if let date = item.date {
                                    Text(TrainingDateFormatting.short(date))
                                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
            }
        }
    }

    private static func statusLabel(_ status: String) -> String {
        switch status {
        case "pending": "Pending Review"
        case "commit_failed": "Needs Attention"
        case "partially_committed": "Partially Confirmed"
        case "committing": "Confirming"
        case "confirmed": "Confirmed"
        default: status.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private static func typeLabel(_ type: String) -> String {
        type.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
