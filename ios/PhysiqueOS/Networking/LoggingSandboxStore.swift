import Foundation

@Observable
final class LoggingSandboxStore {
    private(set) var weighIns: [String: LocalWeightEntry]
    var evidenceDraft: EvidenceIntakeDraft
    var interpretationState: EvidenceInterpretationState = .editing
    private(set) var pipelineTimings = EvidencePipelineTimings()
    private(set) var reviews: [String: LocalEvidenceReview]
    private(set) var morningPriorities: [MorningPriorityItem]

    init(
        now: Date = Date(),
        weighIns: [String: LocalWeightEntry] = [:],
        reviews: [String: LocalEvidenceReview] = [:]
    ) {
        self.weighIns = weighIns
        self.reviews = reviews
        self.evidenceDraft = .fresh(now: now)
        let priorDay = Calendar.current.date(byAdding: .day, value: -1, to: now) ?? now
        self.morningPriorities = [
            .init(id: "priority-mobility", title: "Mobility", detail: "10 minutes", occurrenceDate: priorDay, disposition: nil, note: ""),
            .init(id: "priority-evening", title: "Evening routine", detail: "Complete before bed", occurrenceDate: priorDay, disposition: nil, note: ""),
        ]
    }

    @discardableResult
    func saveWeighIn(weightText: String, unit: WeightUnit, date: Date, now: Date = Date()) -> Result<LocalWeightEntry, LoggingSandboxError> {
        if let error = ManualWeighInValidation.error(weightText: weightText, unit: unit, date: date, maximumDate: now) {
            return .failure(.init(message: error))
        }
        let key = Self.dateKey(date)
        let prior = weighIns[key]
        let parsed = Double(weightText.trimmingCharacters(in: .whitespacesAndNewlines))!
        let value = (parsed * 10).rounded() / 10
        if let prior, prior.value == value, prior.unit == unit {
            return .success(prior)
        }
        let entry = LocalWeightEntry(
            dateKey: key,
            value: value,
            unit: unit,
            recordedAt: now,
            correctionCount: (prior?.correctionCount ?? -1) + 1
        )
        weighIns[key] = entry
        return .success(entry)
    }

    func weighIn(on date: Date) -> LocalWeightEntry? { weighIns[Self.dateKey(date)] }

    func updateMorningPriority(id: String, disposition: MorningPriorityDisposition, note: String? = nil) {
        guard let index = morningPriorities.firstIndex(where: { $0.id == id }) else { return }
        morningPriorities[index].disposition = disposition
        if let note { morningPriorities[index].note = note }
    }

    func saveMorningCheckIn(weightText: String, now: Date = Date()) -> Result<MorningCheckInResult, LoggingSandboxError> {
        guard morningPriorities.allSatisfy({ $0.disposition != nil }) else {
            return .failure(.init(message: "Choose an outcome for each unfinished priority."))
        }
        switch saveWeighIn(weightText: weightText, unit: .lb, date: now, now: now) {
        case .failure(let error): return .failure(error)
        case .success(let weight):
            return .success(.init(weight: weight, reconciledPriorityCount: morningPriorities.count))
        }
    }

    func resetEvidenceDraft(now: Date = Date()) {
        evidenceDraft = .fresh(now: now)
        interpretationState = .editing
        pipelineTimings = .init()
    }

    func addAttachments(_ attachments: [SandboxAttachment]) {
        var identities = Set(evidenceDraft.attachments.map(\.id))
        for attachment in attachments {
            if identities.insert(attachment.id).inserted {
                evidenceDraft.attachments.append(attachment)
            }
        }
        EvidenceLocalInterpretation.applyExtractedDEXAValues(to: &evidenceDraft)
        syncPhotoIdentities()
        interpretationState = .editing
    }

    func recordAssetLoading(duration: TimeInterval) {
        pipelineTimings.assetLoadingSeconds = duration
    }

    func removeAttachment(id: String) {
        evidenceDraft.attachments.removeAll { $0.id == id }
        evidenceDraft.photoIdentities.removeAll { $0.attachmentId == id }
        interpretationState = .editing
    }

    func moveAttachment(id: String, by offset: Int) {
        guard let index = evidenceDraft.attachments.firstIndex(where: { $0.id == id }) else { return }
        let destination = index + offset
        guard evidenceDraft.attachments.indices.contains(destination) else { return }
        evidenceDraft.attachments.swapAt(index, destination)
        syncPhotoIdentities()
    }

    func setEvidenceScenario(_ scenario: EvidenceFixtureScenario) {
        evidenceDraft.scenario = scenario
        EvidenceLocalInterpretation.applyExtractedDEXAValues(to: &evidenceDraft)
        if scenario == .progressPhotos { syncPhotoIdentities() }
        interpretationState = .editing
    }

    func updatePhotoIdentity(id: String, _ mutation: (inout ProgressPhotoIdentityDraft) -> Void) {
        guard let index = evidenceDraft.photoIdentities.firstIndex(where: { $0.id == id }) else { return }
        mutation(&evidenceDraft.photoIdentities[index])
        interpretationState = .editing
    }

    func submitEvidence(now: Date = Date()) -> Result<String?, LoggingSandboxError> {
        guard evidenceDraft.hasContent else { return .failure(.init(message: "Add a photo, file, or details before continuing.")) }
        guard !evidenceDraft.attachments.contains(where: { $0.loadError != nil }) else {
            return .failure(.init(message: "Remove and reselect any item that could not be loaded."))
        }
        guard ManualWeighInValidation.calendar.startOfDay(for: evidenceDraft.occurrenceDate) <= ManualWeighInValidation.calendar.startOfDay(for: now) else {
            return .failure(.init(message: "Evidence cannot be dated in the future."))
        }
        if evidenceDraft.scenario == .dexa {
            guard evidenceDraft.attachments.contains(where: { $0.source == .files && $0.displayName.lowercased().hasSuffix(".pdf") }) else {
                return .failure(.init(message: "Choose the raw DEXA PDF before continuing."))
            }
        }
        if evidenceDraft.scenario == .progressPhotos {
            syncPhotoIdentities()
            guard !evidenceDraft.photoIdentities.isEmpty else {
                return .failure(.init(message: "Choose at least one progress photo."))
            }
            guard evidenceDraft.photoIdentities.allSatisfy(\.confirmed) else {
                return .failure(.init(message: "Confirm every photo identity before continuing."))
            }
            guard evidenceDraft.photoSession.originalUnedited else {
                return .failure(.init(message: "Confirm that these are original, unedited photos."))
            }
        }
        interpretationState = .pending
        return .success(nil)
    }

    @MainActor
    func finishInterpretation(now: Date = Date()) async -> Result<String?, LoggingSandboxError> {
        guard interpretationState == .pending else {
            return .failure(.init(message: "No evidence is waiting for interpretation."))
        }
        let start = ContinuousClock.now
        let prepared = await EvidenceLocalInterpretation.prepare(evidenceDraft)
        pipelineTimings.interpretationSeconds = seconds(since: start)
        evidenceDraft = prepared
        let reconciliationStart = ContinuousClock.now
        let scenario = EvidenceSandboxRouter.scenario(for: prepared)
        let id = "local-review-\(UUID().uuidString)"
        switch EvidenceLocalInterpretation.buildReview(id: id, draft: prepared, scenario: scenario) {
        case .failure(let error):
            interpretationState = .editing
            return .failure(error)
        case .success(var review):
            applyNutritionReconciliation(to: &review)
            reviews[id] = review
            pipelineTimings.reconciliationSeconds = seconds(since: reconciliationStart)
            pipelineTimings.reviewReadySeconds = (pipelineTimings.assetLoadingSeconds ?? 0) + (pipelineTimings.interpretationSeconds ?? 0) + (pipelineTimings.reconciliationSeconds ?? 0)
            evidenceDraft = .fresh(now: now)
            interpretationState = .ready(reviewId: id)
            return .success(id)
        }
    }

    func retryInterpretation() { interpretationState = .editing }

    func review(id: String) -> LocalEvidenceReview? {
        if let review = reviews[id] { return review }
        if id.hasPrefix("local-review-") { return nil }
        var draft = EvidenceIntakeDraft.fresh()
        let scenario: EvidenceFixtureScenario = id == "review-fixture-001" ? .weight : .generic
        draft.details = scenario == .weight ? "Weight value needs review" : "Upload details need review"
        guard case .success(let review) = EvidenceLocalInterpretation.buildReview(id: id, draft: draft, scenario: scenario) else { return nil }
        reviews[id] = review
        return review
    }

    func containsReview(id: String) -> Bool {
        reviews[id] != nil
    }

    func updateReview(id: String, _ mutation: (inout LocalEvidenceReview) -> Void) {
        guard var review = review(id: id) else { return }
        mutation(&review)
        reviews[id] = review
    }

    func updateReviewItem(reviewId: String, itemId: String, _ mutation: (inout EvidenceReviewItem) -> Void) {
        updateReview(id: reviewId) { review in
            guard let index = review.items.firstIndex(where: { $0.id == itemId }) else { return }
            mutation(&review.items[index])
        }
    }

    func confirmReview(id: String) -> Result<LocalEvidenceReview, LoggingSandboxError> {
        guard var review = review(id: id) else { return .failure(.init(message: "This review is unavailable.")) }
        guard review.canConfirm else { return .failure(.init(message: "Complete required fields and include the evidence before confirming.")) }
        review.status = .confirmed
        reviews[id] = review
        evidenceDraft = .fresh()
        interpretationState = .editing
        return .success(review)
    }

    func discardReview(id: String) {
        reviews.removeValue(forKey: id)
        evidenceDraft = .fresh()
        interpretationState = .editing
    }

    @MainActor
    func reprocessReview(id: String) async -> Result<LocalEvidenceReview, LoggingSandboxError> {
        guard let existing = reviews[id] else { return .failure(.init(message: "This review is unavailable.")) }
        var draft = EvidenceIntakeDraft.fresh(now: existing.occurrenceDate)
        draft.occurrenceDate = existing.occurrenceDate
        draft.details = existing.typedDetails
        draft.attachments = existing.sourceAssets
        let category = Set(existing.items.filter(\.included).map(\.category))
        draft.scenario = category.count == 1 ? scenario(for: category.first!) : .automatic
        let prepared = await EvidenceLocalInterpretation.prepare(draft)
        let selectedScenario = category.count > 1 ? .mixed : draft.scenario
        switch EvidenceLocalInterpretation.buildReview(id: id, draft: prepared, scenario: selectedScenario) {
        case .failure(let error): return .failure(error)
        case .success(var refreshed):
            applyNutritionReconciliation(to: &refreshed)
            reviews[id] = refreshed
            return .success(refreshed)
        }
    }

    private func syncPhotoIdentities() {
        let photos = evidenceDraft.attachments.filter { $0.source == .photos }
        let existing = Dictionary(uniqueKeysWithValues: evidenceDraft.photoIdentities.map { ($0.attachmentId, $0) })
        let defaults = EvidenceLocalInterpretation.defaultPhotoIdentities(for: photos)
        evidenceDraft.photoIdentities = photos.enumerated().map { index, attachment in
            existing[attachment.id] ?? defaults[index]
        }
    }

    static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = ManualWeighInValidation.calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func applyNutritionReconciliation(to review: inout LocalEvidenceReview) {
        let confirmedNutritionDates = Set(reviews.values
            .filter { $0.status == .confirmed }
            .flatMap(\.items)
            .filter { $0.category == .nutrition && $0.included }
            .map { Self.dateKey($0.occurrenceDate) })
        for index in review.items.indices where review.items[index].category == .nutrition {
            let hasExistingDay = confirmedNutritionDates.contains(Self.dateKey(review.items[index].occurrenceDate))
            review.items[index].nutritionReplacementRequired = hasExistingDay
            if hasExistingDay, review.items[index].nutritionScope == .fullDay {
                // A full Nutrition Day cannot be added as though it were one
                // extra meal. Match the web's automatic day-update semantics.
                review.items[index].nutritionDisposition = .replaceExisting
            }
        }
    }

    private func scenario(for category: EvidenceCategory) -> EvidenceFixtureScenario {
        switch category {
        case .training: .workout
        case .nutrition: .nutrition
        case .weight: .weight
        case .activity: .activity
        case .dexa: .dexa
        case .progressPhotos: .progressPhotos
        case .labs: .labs
        case .recovery: .recovery
        case .generic: .generic
        }
    }

    private func seconds(since start: ContinuousClock.Instant) -> Double {
        let duration = start.duration(to: .now)
        return Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1_000_000_000_000_000_000
    }
}
