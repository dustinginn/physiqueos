import SwiftUI

struct LocalEvidenceReviewView: View {
    @Environment(AppEnvironment.self) private var environment
    @Environment(\.dismiss) private var dismiss
    let reviewId: String
    var onReturnToLog: () -> Void = {}

    @State private var errorMessage: String?
    @State private var showingDiscard = false

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            if let review = store.review(id: reviewId) {
                VStack(alignment: .leading, spacing: 16) {
                    if review.status == .confirmedLocally {
                        completion(review)
                    } else {
                        reviewContent(review)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            } else {
                Text("This local review is no longer available.")
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
            Text("The local review is removed. The app does not delete any production evidence because none was created.")
        }
    }

    private func reviewContent(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(review.category.title.uppercased()) FOUND")
                    .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                    .foregroundStyle(PhysiqueOSTheme.accent)
                Text("Does this look right?")
                    .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                    .foregroundStyle(PhysiqueOSTheme.textPrimary)
                Text("Review the interpreted fixture before the local confirmation boundary. Editable values are not production records.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }

            if let warning = review.warning {
                warningCard(warning)
            }

            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        IconBadge(systemImage: review.category.systemImage, color: .primary, size: .md)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(review.title)
                                .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                            Text(Self.dateFormatter.string(from: review.occurrenceDate))
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                    Divider()
                    metadataRow("Occurred", Self.dateFormatter.string(from: review.occurrenceDate))
                    metadataRow("Added locally", Self.dateTimeFormatter.string(from: review.addedAt))
                    metadataRow("Confidence", review.confidence)
                    metadataRow("Provenance", review.provenance)
                    Text("Occurrence and evidence-added time stay distinct for backdated intake.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
                }
            }

            sourceEvidence(review)
            categoryContext(review)
            editableFields(review)

            CardContainer {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Correction / reviewer note")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    TextEditor(text: correctionBinding)
                        .frame(minHeight: 76)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    Toggle("Include this evidence item", isOn: includedBinding)
                        .tint(PhysiqueOSTheme.accent)
                        .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                }
            }

            CardContainer(background: review.canConfirm ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceMuted) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Ready to add locally")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Text(review.canConfirm ? "1 evidence item included" : "Complete required fields and include the item to continue.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Text("Confirmation never claims a canonical object, Health sync, production upload, or history update.")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Medium)
                        .foregroundStyle(PhysiqueOSTheme.textMuted)
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

            PrimaryActionButton(title: "Confirm local review", isEnabled: review.canConfirm) {
                switch store.confirmReview(id: reviewId) {
                case .success: errorMessage = nil
                case .failure(let error): errorMessage = error.message
                }
            }
            .accessibilityIdentifier("evidenceReview.confirm")

            HStack(spacing: 10) {
                Button("Save and return later") { dismiss() }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PhysiqueOSTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Button("Discard", role: .destructive) { showingDiscard = true }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PhysiqueOSTheme.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
        }
    }

    private func sourceEvidence(_ review: LocalEvidenceReview) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 9) {
                Text("Source evidence")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                if review.sourceAssets.isEmpty {
                    Label("Typed details only", systemImage: "text.alignleft")
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                } else {
                    ForEach(review.sourceAssets) { asset in
                        HStack {
                            Label(asset.displayName, systemImage: asset.source == .photos ? "photo" : "doc")
                                .lineLimit(1)
                            Spacer()
                            Text(asset.source.rawValue)
                                .foregroundStyle(PhysiqueOSTheme.textMuted)
                        }
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    }
                }
                if !review.typedDetails.isEmpty {
                    Text(review.typedDetails)
                        .physiqueOSFont(PhysiqueOSTypography.body14Regular)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(PhysiqueOSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    private func categoryContext(_ review: LocalEvidenceReview) -> some View {
        CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
            VStack(alignment: .leading, spacing: 6) {
                Text(categoryHeading(review.category))
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                Text(categoryExplanation(review.category))
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
        }
    }

    private func editableFields(_ review: LocalEvidenceReview) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Interpreted fields")
                    .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                ForEach(review.fields) { field in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Text(field.label)
                            if field.required { Text("Required").foregroundStyle(PhysiqueOSTheme.accent) }
                        }
                        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        HStack {
                            TextField("Needs review", text: fieldBinding(field.id))
                                .textFieldStyle(.plain)
                                .padding(11)
                                .background(PhysiqueOSTheme.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            if let unit = field.unit {
                                Text(unit)
                                    .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    .foregroundStyle(PhysiqueOSTheme.textSecondary)
                            }
                        }
                        if !field.isValid {
                            Text(field.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                 ? "This value is required."
                                 : "Enter a valid number.")
                                .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                .foregroundStyle(PhysiqueOSTheme.destructive)
                        }
                    }
                }
            }
        }
    }

    private func completion(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("DEVICE ONLY")
                .physiqueOSFont(PhysiqueOSTypography.screenEyebrow)
                .foregroundStyle(PhysiqueOSTheme.accent)
            Text("Local review complete")
                .physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
            CardContainer(background: PhysiqueOSTheme.surfaceAccent) {
                VStack(alignment: .leading, spacing: 10) {
                    Label("\(review.category.title) fixture confirmed", systemImage: "checkmark.circle.fill")
                        .physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        .foregroundStyle(PhysiqueOSTheme.chartSuccess)
                    Text("The review boundary was exercised. Nothing was uploaded, added to canonical history, reconciled into a TrainingSession, or synced with Apple Health.")
                        .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium)
                        .foregroundStyle(PhysiqueOSTheme.textSecondary)
                }
            }
            PrimaryActionButton(title: "Return to Log", action: onReturnToLog)
            Button("Review confirmed details") {
                store.updateReview(id: reviewId) { $0.status = .awaitingConfirmation }
            }
            .frame(maxWidth: .infinity)
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            .foregroundStyle(PhysiqueOSTheme.accent)
        }
    }

    private func warningCard(_ text: String) -> some View {
        CardContainer(background: PhysiqueOSTheme.chartEffort.opacity(0.10)) {
            Label(text, systemImage: "exclamationmark.triangle.fill")
                .physiqueOSFont(PhysiqueOSTypography.calloutStrong)
                .foregroundStyle(PhysiqueOSTheme.textPrimary)
        }
    }

    private func metadataRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label).foregroundStyle(PhysiqueOSTheme.textMuted)
            Spacer()
            Text(value).multilineTextAlignment(.trailing)
        }
        .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
    }

    private func categoryHeading(_ category: EvidenceCategory) -> String {
        switch category {
        case .training: "Add / Correct Workout Details"
        case .nutrition: "Nutrition day and meal context"
        case .weight: "Uploaded evidence—not a manual weigh-in"
        case .activity: "Daily activity and workout ownership"
        case .dexa: "Source-supported DEXA measurements"
        case .progressPhotos: "Capture session and orientations"
        case .recovery: "Energy and recovery context"
        case .generic: "Unclassified evidence"
        }
    }

    private func categoryExplanation(_ category: EvidenceCategory) -> String {
        switch category {
        case .training:
            "Strength/cardio identity, exercise details, variants, and Apple Health relationships stay explicit. This does not create a second Training model."
        case .nutrition:
            "Calories, protein, carbohydrates, fat, and meal/day scope remain editable. A live replacement/additive reconciliation decision is still required before production use."
        case .weight:
            "This is a reviewed value extracted from uploaded evidence. It remains conceptually separate from the typed Morning Weigh-In path."
        case .activity:
            "ActivityDay totals remain separate from workouts. Apple Health is named as provenance only; continuous HealthKit sync is unavailable."
        case .dexa:
            "Only fields supported by the current web contract are shown. Correct any fixture value before confirming."
        case .progressPhotos:
            "All selected photos stay grouped by their historical capture date. Orientations and notes can be corrected before confirmation."
        case .recovery:
            "The web review falls back to a generic evidence card for recovery/energy types; Native preserves the source-supported fields without inventing a canonical schema."
        case .generic:
            "Only retained source and user-entered description are asserted. No unsupported classification or extracted values are implied."
        }
    }

    private func fieldBinding(_ fieldId: String) -> Binding<String> {
        .init(
            get: { store.review(id: reviewId)?.fields.first(where: { $0.id == fieldId })?.value ?? "" },
            set: { value in
                store.updateReview(id: reviewId) { review in
                    guard let index = review.fields.firstIndex(where: { $0.id == fieldId }) else { return }
                    review.fields[index].value = value
                }
                errorMessage = nil
            }
        )
    }

    private var correctionBinding: Binding<String> {
        .init(
            get: { store.review(id: reviewId)?.correctionNote ?? "" },
            set: { value in store.updateReview(id: reviewId) { $0.correctionNote = value } }
        )
    }

    private var includedBinding: Binding<Bool> {
        .init(
            get: { store.review(id: reviewId)?.included ?? false },
            set: { value in store.updateReview(id: reviewId) { $0.included = value } }
        )
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter
    }()

    private static let dateTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}
