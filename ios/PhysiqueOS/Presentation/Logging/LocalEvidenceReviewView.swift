import SwiftUI

struct LocalEvidenceReviewView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let reviewId: String
    var onReturnToLog: () -> Void = {}

    @State private var errorMessage: String?
    @State private var showingDiscard = false
    @State private var reprocessMessage: String?

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            if let review = store.review(id: reviewId) {
                VStack(alignment: .leading, spacing: 16) {
                    if review.status == .confirmed {
                        completion(review)
                    } else {
                        reviewContent(review)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            } else {
                Text("This review is no longer available.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .padding()
            }
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Evidence Review")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Discard this review?", isPresented: $showingDiscard, titleVisibility: .visible) {
            Button("Discard Review", role: .destructive) {
                store.discardReview(id: reviewId)
                dismiss()
            }
            Button("Keep Review", role: .cancel) {}
        } message: {
            Text("This review will not be added to your history. If you change your mind, you will need to start a new upload.")
        }
    }

    private func reviewContent(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(reviewEyebrow(review.category))
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text("Does this look right?")
                    .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text(reviewBody(review.category) + " Review what PhysiqueOS understood before saving it. You can exclude anything that should not become part of your history.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 12) {
                        IconBadge(systemImage: review.category.systemImage, color: .primary, size: .md)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.dateFormatter.string(from: review.occurrenceDate))
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            Text(review.title)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        }
                        Spacer()
                        Text(review.included ? "Included" : "Excluded")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(review.included ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceMuted)
                            .clipShape(Capsule())
                    }
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(review.fields) { field in metric(field) }
                    }
                    Button(review.included ? "Exclude from log" : "Include in log") {
                        store.updateReview(id: reviewId) { $0.included.toggle() }
                    }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PhysiqueOSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                }
            }

            CardContainer(background: review.canConfirm ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceMuted) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ready to add")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Text(review.included ? "1 evidence item" : "0 evidence items")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    if !review.included {
                        Text("Select at least one item to continue.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                    .foregroundStyle(PhysiqueOSTheme.destructive)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PhysiqueOSTheme.destructive.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            PrimaryActionButton(title: "Save included evidence", isEnabled: review.canConfirm) {
                switch store.confirmReview(id: reviewId) {
                case .success: errorMessage = nil
                case .failure(let error): errorMessage = error.message
                }
            }
            .accessibilityIdentifier("evidenceReview.confirm")

            Button("Read upload again") { reprocessMessage = "No newer interpretation is available." }
                .frame(maxWidth: .infinity, minHeight: 48)
                .background(PhysiqueOSTheme.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            if let reprocessMessage {
                Text(reprocessMessage)
                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 10) {
                Button("Save and return later") { dismiss() }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PhysiqueOSTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Button("Discard review", role: .destructive) { showingDiscard = true }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PhysiqueOSTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
        }
    }

    private func completion(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .center, spacing: 18) {
            Text(Self.dateFormatter.string(from: review.occurrenceDate))
                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            Image(systemName: "checkmark")
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                .frame(width: 64, height: 64)
                .background(PhysiqueOSTheme.surfaceAccent)
                .clipShape(Circle())
            Text("Review Complete")
                .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            Text("You finished checking this \(review.category.title.lowercased()) upload.")
                .multilineTextAlignment(.center)
                .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                .foregroundStyle(PhysiqueOSTheme.textSecondary)
            PrimaryActionButton(title: "Continue", action: onReturnToLog)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }

    private func metric(_ field: EvidenceReviewField) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(field.label.uppercased())
                .physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10)
                .foregroundStyle(PhysiqueOSTheme.textMuted)
            Text([field.value, field.unit].compactMap { $0 }.joined(separator: " "))
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
        .padding(10)
        .background(PhysiqueOSTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func reviewEyebrow(_ category: EvidenceCategory) -> String {
        switch category {
        case .training: "WORKOUT FOUND"
        case .nutrition: "NUTRITION FOUND"
        case .activity: "ACTIVITY FOUND"
        case .weight, .dexa, .progressPhotos, .generic: "UPLOAD FOUND"
        }
    }

    private func reviewBody(_ category: EvidenceCategory) -> String {
        switch category {
        case .training: "Looking through your training before you confirm it."
        case .nutrition: "Looking through your meals and daily totals before you confirm them."
        case .activity: "Looking through your activity before you confirm it."
        case .weight, .dexa, .progressPhotos, .generic: "Checking the details before you confirm them."
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter
    }()
}
