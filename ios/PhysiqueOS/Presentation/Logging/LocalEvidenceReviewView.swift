import SwiftUI

struct LocalEvidenceReviewView: View {
    @Environment(AppEnvironment.self) private var environment
    let reviewId: String
    var onReturnToLog: () -> Void = {}

    @State private var errorMessage: String?
    @State private var showingDiscard = false
    @State private var reprocessMessage: String?

    private var store: LoggingSandboxStore { environment.loggingSandboxStore }

    var body: some View {
        ScrollView {
            if let review = store.review(id: reviewId) {
                Group {
                    if review.status == .confirmed { completion(review) }
                    else { reviewContent(review) }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            } else {
                ContentUnavailableView("Review unavailable", systemImage: "doc.questionmark", description: Text("Return to Log and start a new upload."))
                    .padding()
            }
        }
        .background(PhysiqueOSTheme.background)
        .navigationTitle("Evidence Review")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Discard this review?", isPresented: $showingDiscard, titleVisibility: .visible) {
            Button("Discard Review", role: .destructive) {
                store.discardReview(id: reviewId)
                onReturnToLog()
            }
            Button("Keep Review", role: .cancel) {}
        } message: {
            Text("This review will not be added to your history. If you change your mind, you will need to start a new upload.")
        }
    }

    private func reviewContent(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(reviewEyebrow(review)).physiqueOSFont(PhysiqueOSTypography.screenEyebrow).foregroundStyle(PhysiqueOSTheme.accent)
                Text("Does this look right?").physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
                Text("Review what PhysiqueOS understood before saving it. You can exclude anything that should not become part of your history.")
                    .physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            }

            ForEach(review.items) { item in reviewCard(item) }

            CardContainer(background: review.includedCount > 0 ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceMuted) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Ready to add").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    Text("\(review.includedCount) evidence \(review.includedCount == 1 ? "item" : "items")").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                    if review.excludedCount > 0 {
                        Text("\(review.excludedCount) excluded").physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                    if !review.canConfirm {
                        Text(review.includedCount == 0 ? "Select at least one item to continue." : "Finish the highlighted review choices before saving.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }

            if let errorMessage { banner(errorMessage, destructive: true) }
            PrimaryActionButton(title: "Save included evidence", isEnabled: review.canConfirm) {
                switch store.confirmReview(id: reviewId) {
                case .success: errorMessage = nil
                case .failure(let error): errorMessage = error.message
                }
            }
            .accessibilityIdentifier("evidenceReview.confirm")

            if !review.sourceAssets.isEmpty {
                Button("Read upload again") { reprocessMessage = "This review is already up to date." }.secondaryReviewButton()
                if let reprocessMessage { banner(reprocessMessage, destructive: false) }
            }

            HStack(spacing: 10) {
                Button("Save and return later", action: onReturnToLog).secondaryReviewButton()
                Button("Discard review", role: .destructive) { showingDiscard = true }.secondaryReviewButton()
            }
        }
    }

    private func reviewCard(_ item: EvidenceReviewItem) -> some View {
        CardContainer {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 12) {
                    IconBadge(systemImage: item.category.systemImage, color: .primary, size: .md)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Self.dateFormatter.string(from: item.occurrenceDate)).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.textSecondary)
                        Text(item.title).physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                    }
                    Spacer()
                    Text(item.included ? "Included" : "Excluded").physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(item.included ? PhysiqueOSTheme.surfaceAccent : PhysiqueOSTheme.surfaceMuted).clipShape(Capsule())
                }

                if !item.fields.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(item.fields) { metric($0) }
                    }
                }
                if !item.exercises.isEmpty { exerciseReview(item) }
                if !item.meals.isEmpty { mealReview(item) }
                if item.nutritionReplacementRequired { nutritionReplacement(item) }
                if item.category == .progressPhotos { photoReview(item) }

                Button(item.included ? "Exclude from log" : "Include in log") {
                    store.updateReviewItem(reviewId: reviewId, itemId: item.id) { $0.included.toggle() }
                }
                .secondaryReviewButton()
            }
        }
    }

    private func exerciseReview(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Exercises").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            ForEach(item.exercises) { exercise in
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(exercise.name).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        Spacer()
                        Menu(exercise.variant.map { "Variant: \($0)" } ?? "Add variant") {
                            variantButton("Standard", exercise: exercise, item: item)
                            variantButton("3-Second Pause", exercise: exercise, item: item)
                            variantButton("Static Hold", exercise: exercise, item: item)
                        }.physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                    }
                    if let relationship = exercise.relationship {
                        Text(relationship).physiqueOSFont(PhysiqueOSTypography.caption12Semibold).foregroundStyle(PhysiqueOSTheme.accent)
                    }
                    ForEach(exercise.sets) { set in
                        Text("• \(set.summary)").physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
                .padding(12).background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func variantButton(_ label: String, exercise: EvidenceReviewExercise, item: EvidenceReviewItem) -> some View {
        Button(label) {
            store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in
                guard let index = updated.exercises.firstIndex(where: { $0.id == exercise.id }) else { return }
                updated.exercises[index].variant = label == "Standard" ? nil : label
            }
        }
    }

    private func mealReview(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Meals").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            ForEach(item.meals) { meal in
                DisclosureGroup {
                    VStack(spacing: 8) {
                        ForEach(meal.foods) { food in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(food.name).physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                                    Text(food.detail).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
                                }
                                Spacer()
                                if let calories = food.calories { Text(calories).physiqueOSFont(PhysiqueOSTypography.caption12Semibold) }
                            }
                        }
                    }.padding(.top, 8)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.name).physiqueOSFont(PhysiqueOSTypography.label14Heavy)
                        Text(meal.summary).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
                .padding(12).background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func nutritionReplacement(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Update this Nutrition Day").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            Text("Choose how this upload should relate to the Nutrition Day already on this date.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            Picker("Nutrition update", selection: nutritionDispositionBinding(item)) {
                Text("Choose").tag(NutritionReviewDisposition?.none)
                ForEach(NutritionReviewDisposition.allCases) { Text($0.label).tag(Optional($0)) }
            }.pickerStyle(.menu).tint(PhysiqueOSTheme.accent)
            Text("Projected daily total: 2,475 cal. Unchanged meals will remain unchanged.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
        }
        .padding(12).background(PhysiqueOSTheme.surfaceAccent).clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func photoReview(_ item: EvidenceReviewItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Match each photo to its pose").physiqueOSFont(PhysiqueOSTypography.label14Heavy)
            ForEach(item.photoIdentities) { identity in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(identity.poseLabel).physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
                        Text(identity.goalRole.label).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
                    }
                    Spacer()
                    Menu("Edit pose") {
                        ForEach(ProgressPhotoOrientation.allCases) { orientation in
                            Button(orientation.label) { updateReviewPhoto(item, identity, orientation) }
                        }
                    }
                }
                .padding(10).background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 10))
            }
            Text("Shared session details").physiqueOSFont(PhysiqueOSTypography.caption12Semibold)
            Text("\(item.fields.first(where: { $0.id == "timeOfDay" })?.value ?? "Needs session review") · \(item.fields.first(where: { $0.id == "goalRelationship" })?.value ?? "Needs session review"). These values apply once to every photo in this capture session.")
                .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            HStack(spacing: 8) {
                Menu("Time of day") {
                    ForEach(["Morning", "Afternoon", "Evening"], id: \.self) { value in
                        Button(value) { updateReviewField(item, id: "timeOfDay", value: value) }
                    }
                }
                Menu("Goal relationship") {
                    Button("Linked Goal") { updateReviewField(item, id: "goalRelationship", value: "Linked Goal") }
                    Button("Context only") { updateReviewField(item, id: "goalRelationship", value: "Context only") }
                }
            }
            .physiqueOSFont(PhysiqueOSTypography.caption12Semibold).tint(PhysiqueOSTheme.accent)
        }
    }

    private func updateReviewField(_ item: EvidenceReviewItem, id: String, value: String) {
        store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in
            guard let index = updated.fields.firstIndex(where: { $0.id == id }) else { return }
            updated.fields[index].value = value
        }
    }

    private func updateReviewPhoto(_ item: EvidenceReviewItem, _ identity: ProgressPhotoIdentityDraft, _ orientation: ProgressPhotoOrientation) {
        store.updateReviewItem(reviewId: reviewId, itemId: item.id) { updated in
            guard let index = updated.photoIdentities.firstIndex(where: { $0.id == identity.id }) else { return }
            updated.photoIdentities[index].orientation = orientation
            updated.photoIdentities[index].confirmed = true
        }
    }

    private func nutritionDispositionBinding(_ item: EvidenceReviewItem) -> Binding<NutritionReviewDisposition?> {
        .init(get: { store.review(id: reviewId)?.items.first(where: { $0.id == item.id })?.nutritionDisposition }, set: { value in
            store.updateReviewItem(reviewId: reviewId, itemId: item.id) { $0.nutritionDisposition = value }
        })
    }

    private func completion(_ review: LocalEvidenceReview) -> some View {
        VStack(alignment: .center, spacing: 18) {
            Image(systemName: "checkmark").font(.system(size: 28, weight: .bold)).foregroundStyle(PhysiqueOSTheme.chartSuccess)
                .frame(width: 64, height: 64).background(PhysiqueOSTheme.surfaceAccent).clipShape(Circle())
            Text(review.completionTitle).physiqueOSFont(PhysiqueOSTypography.uploadingHeading24)
            Text("You finished reviewing \(review.includedCount) evidence \(review.includedCount == 1 ? "item" : "items").")
                .multilineTextAlignment(.center).physiqueOSFont(PhysiqueOSTypography.cardBody14Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
            if review.items.contains(where: { $0.included && $0.category == .training && !$0.exercises.isEmpty }) {
                CardContainer {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Workout achievements").physiqueOSFont(PhysiqueOSTypography.cardHeading16)
                        Label("Bench Press · Reps-at-load record", systemImage: "trophy.fill")
                            .physiqueOSFont(PhysiqueOSTypography.label14Heavy).foregroundStyle(PhysiqueOSTheme.accent)
                        Text("180 lb · improved from the matched prior best of 7 reps.")
                            .physiqueOSFont(PhysiqueOSTypography.caption12Medium).foregroundStyle(PhysiqueOSTheme.textSecondary)
                    }
                }
            }
            PrimaryActionButton(title: "Continue", action: onReturnToLog)
        }
        .frame(maxWidth: .infinity).padding(.top, 40)
    }

    private func metric(_ field: EvidenceReviewField) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(field.label.uppercased()).physiqueOSFont(PhysiqueOSTypography.deepPageEyebrow10).foregroundStyle(PhysiqueOSTheme.textMuted)
            Text([field.value, field.unit].compactMap { $0 }.joined(separator: " ")).physiqueOSFont(PhysiqueOSTypography.label14Heavy).lineLimit(3)
        }
        .frame(maxWidth: .infinity, minHeight: 58, alignment: .topLeading)
        .padding(10).background(PhysiqueOSTheme.surfaceMuted).clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func banner(_ text: String, destructive: Bool) -> some View {
        Text(text).physiqueOSFont(PhysiqueOSTypography.calloutStrong)
            .foregroundStyle(destructive ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.textSecondary)
            .padding(12).frame(maxWidth: .infinity, alignment: .leading)
            .background((destructive ? PhysiqueOSTheme.destructive : PhysiqueOSTheme.surfaceMuted).opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func reviewEyebrow(_ review: LocalEvidenceReview) -> String {
        if Set(review.items.map(\.category)).count > 1 { return "UPLOAD FOUND" }
        return switch review.category {
        case .training: "WORKOUT FOUND"
        case .nutrition: "NUTRITION FOUND"
        case .activity: "ACTIVITY FOUND"
        case .weight, .dexa, .progressPhotos, .labs, .recovery, .generic: "UPLOAD FOUND"
        }
    }

    private static let dateFormatter: DateFormatter = { let formatter = DateFormatter(); formatter.dateStyle = .medium; return formatter }()
}

private extension View {
    func secondaryReviewButton() -> some View {
        frame(maxWidth: .infinity, minHeight: 48)
            .background(PhysiqueOSTheme.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .physiqueOSFont(PhysiqueOSTypography.label14Heavy)
    }
}
