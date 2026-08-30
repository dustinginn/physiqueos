import Foundation

@Observable
final class LoggingSandboxStore {
    private(set) var weighIns: [String: LocalWeightEntry]
    var evidenceDraft: EvidenceIntakeDraft
    var interpretationState: EvidenceInterpretationState = .editing
    private(set) var reviews: [String: LocalEvidenceReview]

    init(
        now: Date = Date(),
        weighIns: [String: LocalWeightEntry] = [:],
        reviews: [String: LocalEvidenceReview] = [:]
    ) {
        self.weighIns = weighIns
        self.reviews = reviews
        self.evidenceDraft = .fresh(now: now)
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
        interpretationState = .editing
    }

    func removeAttachment(id: String) {
        evidenceDraft.attachments.removeAll { $0.id == id }
        interpretationState = .editing
    }

    func submitEvidence(now: Date = Date()) -> Result<String?, LoggingSandboxError> {
        guard evidenceDraft.hasContent else { return .failure(.init(message: "Add a photo, file, or details before continuing.")) }
        guard Calendar.current.startOfDay(for: evidenceDraft.occurrenceDate) <= Calendar.current.startOfDay(for: now) else {
            return .failure(.init(message: "Evidence cannot be dated in the future."))
        }
        interpretationState = .pending
        return .success(nil)
    }

    func finishInterpretation(now: Date = Date()) -> Result<String?, LoggingSandboxError> {
        guard interpretationState == .pending else {
            return .failure(.init(message: "No evidence is waiting for interpretation."))
        }
        switch evidenceDraft.scenario {
        case .ambiguous:
            interpretationState = .ambiguous
            return .success(nil)
        case .needsMoreInformation:
            interpretationState = .needsMoreInformation
            return .success(nil)
        case .unsupported:
            interpretationState = .unsupported
            return .success(nil)
        case .localFailure:
            interpretationState = .failed
            return .success(nil)
        default:
            guard let category = evidenceDraft.scenario.category else { return .failure(.init(message: "No review category is available.")) }
            return .success(createReview(category: category, scenario: evidenceDraft.scenario, now: now))
        }
    }

    func resolveAmbiguity(as category: EvidenceCategory, now: Date = Date()) -> String {
        createReview(category: category, scenario: scenario(for: category), now: now,
                     warning: "You resolved an ambiguous fixture classification. Verify every field before confirming.")
    }

    func continueAfterClarification(now: Date = Date()) -> Result<String, LoggingSandboxError> {
        guard !evidenceDraft.clarification.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .failure(.init(message: "Add the missing context before continuing."))
        }
        return .success(createReview(category: .generic, scenario: .generic, now: now,
                                     warning: "Additional context was supplied after the fixture requested more information."))
    }

    func continueUnsupportedAsGeneric(now: Date = Date()) -> String {
        createReview(category: .generic, scenario: .generic, now: now,
                     warning: "The source was not recognized. Only your description will be reviewed; no extracted facts are claimed.")
    }

    func retryInterpretation() { interpretationState = .editing }

    func review(id: String) -> LocalEvidenceReview? {
        if let review = reviews[id] { return review }
        if id.hasPrefix("local-review-") { return nil }
        // Web-backed pending fixture ids remain navigable without pretending
        // their server record exists in this sandbox.
        var draft = EvidenceIntakeDraft.fresh()
        draft.details = "Pending web review represented by a deterministic Native fixture."
        draft.attachments = [.init(id: "fixture-file", displayName: "pending-upload.png", source: .photos)]
        let fixture = LoggingSandboxFixtureFactory.review(id: id, category: .training, scenario: .training, draft: draft,
            warning: "This pending item is a local fixture representation, not a fetched production review.")
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

    func confirmReview(id: String) -> Result<LocalEvidenceReview, LoggingSandboxError> {
        guard var review = review(id: id) else { return .failure(.init(message: "This review is unavailable.")) }
        guard review.canConfirm else { return .failure(.init(message: "Complete required fields and include the evidence before confirming.")) }
        review.status = .confirmedLocally
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
        now: Date,
        warning: String? = nil
    ) -> String {
        let id = "local-review-\(UUID().uuidString)"
        reviews[id] = LoggingSandboxFixtureFactory.review(
            id: id, category: category, scenario: scenario, draft: evidenceDraft, now: now, warning: warning
        )
        interpretationState = .ready(reviewId: id)
        return id
    }

    private func scenario(for category: EvidenceCategory) -> EvidenceFixtureScenario {
        switch category {
        case .training: .training
        case .nutrition: .nutrition
        case .weight: .weight
        case .activity: .activity
        case .dexa: .dexa
        case .progressPhotos: .progressPhotos
        case .recovery: .recovery
        case .generic: .generic
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
