import SwiftUI

struct LocalEvidenceReviewView: View {
    @Environment(AppEnvironment.self) private var environment
    let reviewId: String
    var onReturnToLog: () -> Void = {}
    @State private var errorMessage: String?
    @State private var rereadMessage: String?
    @State private var isRereading = false
    @State private var showingDiscard = false
    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            if let review = store.review(id: reviewId) {
                Group { if review.status == .confirmed { completion(review) } else { reviewBody(review) } }
                    .padding(.horizontal, 16).padding(.vertical, 12)
            } else {
                ContentUnavailableView("Review unavailable", systemImage: "doc.questionmark", description: Text("Return to Log and start a new upload."))
            }
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Evidence Review").navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Discard this review?", isPresented: $showingDiscard, titleVisibility: .visible) {
            Button("Discard Review", role: .destructive) { store.discardReview(id: reviewId); onReturnToLog() }
            Button("Keep Review", role: .cancel) {}
        } message: { Text("This review and its selected assets will be permanently removed.") }
    }

    private func reviewBody(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(reviewEyebrow(review)).physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
                Text("Does this look right?").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                Text("Review what PhysiqueOS found. Correct anything that was not read accurately, or exclude it from this upload.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }
            if let message = review.interpretationMessage { banner(message, destructive: false) }
            ForEach(review.items) { item in reviewSection(item, review: review) }
            if !review.canConfirm { banner(review.includedCount == 0 ? "Include at least one record to continue." : "Complete the highlighted fields before saving.", destructive: false) }
            if let errorMessage { banner(errorMessage, destructive: true) }
            PrimaryActionButton(title: "Save included evidence", isEnabled: review.canConfirm) {
                switch store.confirmReview(id: reviewId) { case .success: errorMessage = nil; case .failure(let error): errorMessage = error.message }
            }.accessibilityIdentifier("evidenceReview.confirm")
            if !review.sourceAssets.isEmpty {
                Button(isRereading ? "Reading upload…" : "Read upload again") { reread() }.secondaryReviewButton().disabled(isRereading)
                if let rereadMessage { banner(rereadMessage, destructive: false) }
            }
            Button("Save and return later", action: onReturnToLog).secondaryReviewButton()
            Button("Discard review", role: .destructive) { showingDiscard = true }
                .frame(maxWidth: .infinity, minHeight: 48).foregroundStyle(PhysiqueOSTheme.destructive)
                .background(PhysiqueOSTheme.destructive.opacity(0.10)).clipShape(RoundedRectangle(cornerRadius: 12))
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
        }
    }

    private func reviewSection(_ item: EvidenceReviewItem, review: LocalEvidenceReview) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 10) {
                    IconBadge(systemImage: item.category.systemImage, color: .primary, size: .md)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Self.dateFormatter.string(from: item.occurrenceDate)).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Text(item.title).physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    }
                    Spacer()
                    Text(item.included ? "Included" : "Excluded").physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .foregroundStyle(item.included ? PhysiqueOSTheme.chartSuccess : PhysiqueOSTheme.textMuted)
                }
                fields(item)
                if !item.exercises.isEmpty { exercises(item) }
                if !item.meals.isEmpty { meals(item) }
                if item.nutritionReplacementRequired { nutritionReplacement(item) }
                if item.category == .progressPhotos { photos(item, review: review) }
                Button(item.included ? "Exclude from upload" : "Include in upload") { store.updateReviewItem(reviewId: reviewId, itemId: item.id) { $0.included.toggle() } }.secondaryReviewButton()
            }.padding(.vertical, 8)
            Divider().overlay(PhysiqueOSTheme.divider)
        }
    }

    private func fields(_ item: EvidenceReviewItem) -> some View {
        VStack(spacing: 0) {
            ForEach(item.fields.filter { !["source", "goalRelationship", "linkedGoal"].contains($0.id) }) { field in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(field.label).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    Spacer()
                    if item.category == .progressPhotos {
                        Text(field.value.isEmpty ? "Needs review" : field.value).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                            .foregroundStyle(field.required && field.value.isEmpty ? Color.orange : PhysiqueOSTheme.textPrimary)
                    } else {
                        TextField(field.required ? "Required" : "Optional", text: fieldBinding(item, field)).multilineTextAlignment(.trailing)
                            .keyboardType(field.unit == nil ? .default : .decimalPad).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        if let unit = field.unit { Text(unit).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textMuted) }
                    }
                }.padding(.vertical, 9)
                Divider().overlay(PhysiqueOSTheme.divider)
            }
        }
    }

    private func exercises(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Exercises").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            ForEach(item.exercises) { exercise in
                VStack(alignment: .leading, spacing: 5) {
                    HStack {
                        TextField("Exercise", text: exerciseNameBinding(item, exercise)).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        Menu(exercise.variant ?? "Standard") { variant("Standard", exercise, item); variant("3-Second Pause", exercise, item); variant("Static Hold", exercise, item) }.physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    }
                    if let relationship = exercise.relationship { Text(relationship).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.accent) }
                    ForEach(Array(exercise.sets.enumerated()), id: \.element.id) { index, set in
                        if set.reps != nil || set.load != nil {
                            HStack(spacing: 8) {
                                Text("\(index + 1)").frame(width: 18, alignment: .leading)
                                TextField("Reps", text: setValueBinding(item, exercise, set, keyPath: \.reps)).keyboardType(.decimalPad)
                                Text("reps").foregroundStyle(PhysiqueOSTheme.textMuted)
                                TextField("Load", text: setValueBinding(item, exercise, set, keyPath: \.load)).keyboardType(.decimalPad)
                                Text(set.unit ?? "lb").foregroundStyle(PhysiqueOSTheme.textMuted)
                            }
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                            .padding(.vertical, 4)
                        } else {
                            Text("• \(set.summary)").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                        }
                    }
                }.padding(.vertical, 6)
            }
        }
    }

    private func meals(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Meals read from this upload").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            ForEach(item.meals) { meal in DisclosureGroup { ForEach(meal.foods) { food in Text(food.name).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).padding(.vertical, 3) } } label: { VStack(alignment: .leading, spacing: 2) { Text(meal.name).physiqueOSFont(PhysiqueOSTypography.label14Heavy); Text(meal.summary).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textSecondary) } } }
        }
    }

    private func nutritionReplacement(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Update this Nutrition Day").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            Picker("Nutrition update", selection: nutritionBinding(item)) { Text("Choose").tag(NutritionReviewDisposition?.none); ForEach(NutritionReviewDisposition.allCases) { Text($0.label).tag(Optional($0)) } }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
        }
    }

    private func photos(_ item: EvidenceReviewItem, review: LocalEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Confirm each pose").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            ForEach(item.photoIdentities) { identity in
                VStack(alignment: .leading, spacing: 8) {
                    if let asset = review.sourceAssets.first(where: { $0.id == identity.attachmentId }), let data = asset.data, let image = EvidenceAttachmentLoader.previewImage(data: data) { Image(uiImage: image).resizable().scaledToFill().frame(maxWidth: .infinity).frame(height: 180).clipped().clipShape(RoundedRectangle(cornerRadius: 10)) }
                    HStack { Text(identity.poseLabel).physiqueOSFont(PhysiqueOSTypography.caption12Semibold); Spacer(); Text(identity.confirmed ? "Confirmed" : "Needs review").physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.orange) }
                    HStack {
                        Menu("Orientation") { ForEach(ProgressPhotoOrientation.allCases.filter { $0 != .unconfirmed }) { value in Button(value.label) { updatePhoto(item, identity, orientation: value) } } }
                        Menu("Condition") { ForEach(ProgressPhotoContraction.allCases.filter { $0 != .unconfirmed }) { value in Button(value.label) { updatePhoto(item, identity, contraction: value) } } }
                    }.physiqueOSFont(PhysiqueOSTypography.caption12Semibold).tint(PhysiqueOSTheme.accent)
                    Button("Confirm pose") { confirmPhoto(item, identity) }.buttonStyle(.borderedProminent).tint(identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.orange).disabled(identity.orientation == .unconfirmed || identity.contraction == .unconfirmed)
                }.padding(10).background((identity.confirmed ? PhysiqueOSTheme.chartSuccess : Color.yellow).opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 12))
            }
            Text("Shared session details").physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            sessionChoiceRow(
                label: "Time of day",
                value: item.fields.first(where: { $0.id == "timeOfDay" })?.value,
                choices: ProgressPhotoTimeOfDay.allCases.map(\.label)
            ) { updateField(item, "timeOfDay", $0) }
            sessionChoiceRow(
                label: "Fasted",
                value: item.fields.first(where: { $0.id == "fasted" })?.value,
                choices: ["Yes", "No"]
            ) { updateField(item, "fasted", $0) }
        }
    }

    private func sessionChoiceRow(label: String, value: String?, choices: [String], onSelect: @escaping (String) -> Void) -> some View {
        HStack {
            Text(label).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Spacer()
            Menu {
                ForEach(choices, id: \.self) { choice in Button(choice) { onSelect(choice) } }
            } label: {
                HStack(spacing: 5) {
                    Text(value?.isEmpty == false ? value! : "Choose")
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
                .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                .foregroundStyle(value?.isEmpty == false ? PhysiqueOSTheme.textPrimary : Color.orange)
            }
        }
        .padding(.vertical, 9)
    }

    private func completion(_ review: LocalEvidenceReview) -> some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark").font(.system(size: 28, weight: .bold)).foregroundStyle(PhysiqueOSTheme.chartSuccess).frame(width: 64, height: 64).background(PhysiqueOSTheme.chartSuccess.opacity(0.14)).clipShape(Circle())
            Text(review.completionTitle).physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
            Text("Your included records have been reviewed.").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            PrimaryActionButton(title: "Continue", action: onReturnToLog)
        }.frame(maxWidth: .infinity).padding(.top, 40)
    }

    private func reread() { isRereading = true; rereadMessage = nil; Task { @MainActor in switch await store.reprocessReview(id: reviewId) { case .success: rereadMessage = "The selected upload was read again. Review the refreshed values."; case .failure(let error): errorMessage = error.message }; isRereading = false } }
    private func fieldBinding(_ item: EvidenceReviewItem, _ field: EvidenceReviewField) -> Binding<String> { .init(get: { store.review(id: reviewId)?.items.first(where: { $0.id == item.id })?.fields.first(where: { $0.id == field.id })?.value ?? "" }, set: { updateField(item, field.id, $0) }) }
    private func exerciseNameBinding(_ item: EvidenceReviewItem, _ exercise: EvidenceReviewExercise) -> Binding<String> { .init(
        get: { store.review(id: reviewId)?.items.first(where: { $0.id == item.id })?.exercises.first(where: { $0.id == exercise.id })?.name ?? "" },
        set: { value in store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in if let index = updated.exercises.firstIndex(where: { $0.id == exercise.id }) { updated.exercises[index].name = value } } }
    ) }
    private func setValueBinding(_ item: EvidenceReviewItem, _ exercise: EvidenceReviewExercise, _ set: EvidenceReviewSet, keyPath: WritableKeyPath<EvidenceReviewSet, String?>) -> Binding<String> { .init(
        get: { store.review(id: reviewId)?.items.first(where: { $0.id == item.id })?.exercises.first(where: { $0.id == exercise.id })?.sets.first(where: { $0.id == set.id })?[keyPath: keyPath] ?? "" },
        set: { value in store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in guard let exerciseIndex = updated.exercises.firstIndex(where: { $0.id == exercise.id }), let setIndex = updated.exercises[exerciseIndex].sets.firstIndex(where: { $0.id == set.id }) else { return }; updated.exercises[exerciseIndex].sets[setIndex][keyPath: keyPath] = value; updated.exercises[exerciseIndex].sets[setIndex].refreshSummary() } }
    ) }
    private func updateField(_ item: EvidenceReviewItem, _ id: String, _ value: String) { store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in if let index = updated.fields.firstIndex(where: { $0.id == id }) { updated.fields[index].value = value } } }
    private func updatePhoto(_ item: EvidenceReviewItem, _ identity: ProgressPhotoIdentityDraft, orientation: ProgressPhotoOrientation? = nil, contraction: ProgressPhotoContraction? = nil) { store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in guard let index = updated.photoIdentities.firstIndex(where: { $0.id == identity.id }) else { return }; if let orientation { updated.photoIdentities[index].orientation = orientation }; if let contraction { updated.photoIdentities[index].contraction = contraction }; updated.photoIdentities[index].confirmed = false } }
    private func confirmPhoto(_ item: EvidenceReviewItem, _ identity: ProgressPhotoIdentityDraft) { store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in guard let index = updated.photoIdentities.firstIndex(where: { $0.id == identity.id }) else { return }; updated.photoIdentities[index].confirmed = updated.photoIdentities[index].orientation != .unconfirmed && updated.photoIdentities[index].contraction != .unconfirmed } }
    private func variant(_ label: String, _ exercise: EvidenceReviewExercise, _ item: EvidenceReviewItem) -> some View { Button(label) { store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in if let index = updated.exercises.firstIndex(where: { $0.id == exercise.id }) { updated.exercises[index].variant = label == "Standard" ? nil : label } } } }
    private func nutritionBinding(_ item: EvidenceReviewItem) -> Binding<NutritionReviewDisposition?> { .init(get: { store.review(id: reviewId)?.items.first(where: { $0.id == item.id })?.nutritionDisposition }, set: { value in store.updateReviewItem(reviewId: reviewId, itemId: item.id) { $0.nutritionDisposition = value } }) }
    private func banner(_ text: String, destructive: Bool) -> some View { Text(text).physiqueOSFont(PhysiqueOSTypography.calloutStrong).foregroundStyle(destructive ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.textSecondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).background((destructive ? PhysiqueOSTheme.destructive : Color.yellow).opacity(0.10)).clipShape(RoundedRectangle(cornerRadius: 12)) }
    private func reviewEyebrow(_ review: LocalEvidenceReview) -> String { Set(review.items.map(\.category)).count > 1 ? "UPLOAD FOUND" : (review.category == .training ? "WORKOUT FOUND" : "\(review.category.title.uppercased()) FOUND") }
    private static let dateFormatter: DateFormatter = { let f = DateFormatter(); f.dateStyle = .medium; return f }()
}

private extension View { func secondaryReviewButton() -> some View { frame(maxWidth: .infinity, minHeight: 48).background(PhysiqueOSTheme.surfaceElevated).clipShape(RoundedRectangle(cornerRadius: 12)).physiqueOSFont(PhysiqueOSTypography.label14Heavy) } }
