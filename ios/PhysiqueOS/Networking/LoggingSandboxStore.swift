import Foundation

@Observable
final class LoggingSandboxStore {
    private(set) var weighIns: [String: LocalWeightEntry]
    var evidenceDraft: EvidenceIntakeDraft
    var interpretationState: EvidenceInterpretationState = .editing
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
    }

    func addAttachments(_ attachments: [SandboxAttachment]) {
        var identities = Set(evidenceDraft.attachments.map { "\($0.source.rawValue)|\($0.displayName)" })
        for attachment in attachments {
            let identity = "\(attachment.source.rawValue)|\(attachment.displayName)"
            if identities.insert(identity).inserted {
                evidenceDraft.attachments.append(attachment)
            }
        }
        syncPhotoIdentities()
        interpretationState = .editing
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
        guard Calendar.current.startOfDay(for: evidenceDraft.occurrenceDate) <= Calendar.current.startOfDay(for: now) else {
            return .failure(.init(message: "Evidence cannot be dated in the future."))
        }
        if evidenceDraft.scenario == .dexa {
            guard evidenceDraft.attachments.contains(where: { $0.source == .files && $0.displayName.lowercased().hasSuffix(".pdf") }) else {
                return .failure(.init(message: "Choose the raw DEXA PDF before continuing."))
            }
            guard evidenceDraft.dexa.hasRequiredValues, evidenceDraft.dexa.valuesConfirmed else {
                return .failure(.init(message: "Confirm the required DEXA values before continuing."))
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

    func finishInterpretation(now: Date = Date()) -> Result<String?, LoggingSandboxError> {
        guard interpretationState == .pending else {
            return .failure(.init(message: "No evidence is waiting for interpretation."))
        }
        let scenario = EvidenceSandboxRouter.scenario(for: evidenceDraft)
        guard let category = scenario.category else {
            return .failure(.init(message: "This upload could not be prepared for review."))
        }
        return .success(createReview(category: category, scenario: scenario, now: now))
    }

    func retryInterpretation() { interpretationState = .editing }

    func review(id: String) -> LocalEvidenceReview? {
        if let review = reviews[id] { return review }
        if id.hasPrefix("local-review-") { return nil }
        var draft = EvidenceIntakeDraft.fresh()
        let scenario: EvidenceFixtureScenario = id == "review-fixture-001" ? .weight : .generic
        draft.details = scenario == .weight ? "Morning weight" : "Uploaded evidence"
        draft.attachments = [.init(id: "pending-file", displayName: scenario == .weight ? "scale.png" : "evidence.png", source: .photos)]
        let fixture = LoggingSandboxFixtureFactory.review(
            id: id, category: scenario.category ?? .generic, scenario: scenario, draft: draft
        )
        reviews[id] = fixture
        return fixture
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
        interpretationState = .editing
    }

    private func createReview(
        category: EvidenceCategory,
        scenario: EvidenceFixtureScenario,
        now: Date
    ) -> String {
        let id = "local-review-\(UUID().uuidString)"
        reviews[id] = LoggingSandboxFixtureFactory.review(
            id: id, category: category, scenario: scenario, draft: evidenceDraft, now: now
        )
        interpretationState = .ready(reviewId: id)
        return id
    }

    private func syncPhotoIdentities() {
        let photos = evidenceDraft.attachments.filter { $0.source == .photos }
        let existing = Dictionary(uniqueKeysWithValues: evidenceDraft.photoIdentities.map { ($0.attachmentId, $0) })
        let defaults = LoggingSandboxFixtureFactory.defaultPhotoIdentities(for: photos)
        evidenceDraft.photoIdentities = photos.enumerated().map { index, attachment in
            existing[attachment.id] ?? defaults[index]
        }
    }

    static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
