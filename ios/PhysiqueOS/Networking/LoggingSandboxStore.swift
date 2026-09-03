import Foundation

@Observable
final class LoggingSandboxStore {
    private(set) var weighIns: [String: LocalWeightEntry]
    var evidenceDraft: EvidenceIntakeDraft
    var interpretationState: EvidenceInterpretationState = .editing
    private(set) var pipelineTimings = EvidencePipelineTimings()
    private(set) var reviews: [String: LocalEvidenceReview]

    /// The one canonical Operating Plan execution-item catalog — loaded
    /// once, shared by Home, the Priority detail screen, and Morning
    /// Check-In. See `PriorityReadModel.swift`'s type-level doc comment:
    /// this is not a Priority model of its own, it is the same catalog
    /// `PriorityOccurrenceCalculator` projects occurrences from everywhere.
    let executionItems: [ExecutionItemFixture]
    /// Mirrors the Reminder's own `completedAt` — keyed by occurrence id
    /// (`PriorityOccurrenceCalculator.occurrenceId`), append-only in spirit
    /// (a re-completion of the same id is idempotent, matching source).
    private(set) var priorityCompletions: [String: PriorityCompletionRecord]
    /// Mirrors one `DailyCheckIn.reconciliation[]` entry per occurrence —
    /// skip/note dispositions never touch `priorityCompletions` directly
    /// (only a `.completed` disposition also writes a completion record),
    /// matching the real server's own separation between the Reminder
    /// record and the DailyCheckIn's own reconciliation array.
    private(set) var priorityReconciliations: [String: PriorityReconciliationRecord]

    init(
        now: Date = Date(),
        weighIns: [String: LocalWeightEntry] = [:],
        reviews: [String: LocalEvidenceReview] = [:],
        executionItems: [ExecutionItemFixture] = PriorityCatalogLoader.loadExecutionItems(),
        priorityCompletions: [String: PriorityCompletionRecord] = [:],
        priorityReconciliations: [String: PriorityReconciliationRecord] = [:]
    ) {
        self.weighIns = weighIns
        self.reviews = reviews
        self.evidenceDraft = .fresh(now: now)
        self.executionItems = executionItems
        self.priorityCompletions = priorityCompletions
        self.priorityReconciliations = priorityReconciliations
    }

    // MARK: - Priorities (Home / Priority Detail / Morning Check-In shared engine)

    /// Today's occurrences — the exact list Home's "Today's Priorities"
    /// renders, computed the same way the Priority detail screen and
    /// Morning Check-In's "today" context would resolve the same id.
    func todaysPriorities(now: Date = Date()) -> [PriorityOccurrence] {
        let localDate = PriorityOccurrenceCalculator.localDateKey(now: now)
        return PriorityOccurrenceCalculator.project(executionItems: executionItems, completions: priorityCompletions, localDate: localDate, now: now)
    }

    /// A single occurrence by id, resolved from `executionItems` +
    /// `priorityCompletions` — the Priority detail screen's own fetch, so
    /// it can never disagree with what Home showed for the same id.
    func priorityOccurrence(id: String, now: Date = Date()) -> PriorityOccurrence? {
        let localDate = PriorityOccurrenceCalculator.localDateKey(now: now)
        guard let item = executionItems.first(where: { PriorityOccurrenceCalculator.occurrenceId(executionItemId: $0.id, localDate: localDate) == id }) else {
            return nil
        }
        return PriorityOccurrenceCalculator.occurrence(for: item, localDate: localDate, completions: priorityCompletions, now: now)
    }

    /// Yesterday's unfinished occurrences — `getPreviousDayIncompletePrioritySelection`,
    /// ported: scheduled yesterday, no completion, no terminal reconciliation.
    /// `canonicalEvidence` items (Morning Weigh-In) are additionally excluded
    /// when a matching weigh-in already exists for that date, mirroring the
    /// real server's evidence-based auto-completion.
    func previousDayUnfinishedPriorities(now: Date = Date()) -> [PriorityOccurrence] {
        let today = PriorityOccurrenceCalculator.localDateKey(now: now)
        guard let yesterday = PriorityOccurrenceCalculator.previousDateKey(today) else { return [] }
        return PriorityOccurrenceCalculator.previousDayIncomplete(
            executionItems: executionItems,
            completions: priorityCompletions,
            reconciliations: priorityReconciliations,
            previousLocalDate: yesterday,
            now: now,
            hasEvidence: { [weak self] item, date in
                guard item.id == "execution_morning_weigh_in", let self, let entry = self.weighIns[date] else { return false }
                return entry.value.isFinite
            }
        )
    }

    /// Completes an occurrence — mirrors `completeReminder`/
    /// `completeReminderFromEvidence`: a `context` with all three fields
    /// present (dose/protocolId/occurrenceDate) records an evidence-aware
    /// completion snapshot, matching the Priority detail screen's own
    /// server action. Idempotent: completing an already-completed
    /// occurrence again just re-confirms it (no duplicate/second record),
    /// matching source's own idempotent-completion behavior.
    func completePriority(occurrenceId: String, context: PriorityCompletionContext?, now: Date = Date()) {
        let iso = ISO8601DateFormatter().string(from: now)
        priorityCompletions[occurrenceId] = PriorityCompletionRecord(occurrenceId: occurrenceId, completedAt: iso, context: context)
    }

    /// Records a skip/note/completed disposition for a specific past
    /// occurrence — Morning Check-In's own reconciliation write. Only a
    /// `.completed` disposition also writes a `priorityCompletions` record
    /// (mirroring `MorningPriorityReconciliationService.save`'s own "only
    /// completed also completes the Reminder" rule); skip/note stay on the
    /// reconciliation record alone.
    func reconcilePriority(occurrenceId: String, occurrenceDate: String, disposition: PriorityDisposition, note: String, now: Date = Date()) {
        priorityReconciliations[occurrenceId] = PriorityReconciliationRecord(occurrenceId: occurrenceId, occurrenceDate: occurrenceDate, disposition: disposition, note: note)
        if disposition == .completed {
            completePriority(occurrenceId: occurrenceId, context: nil, now: now)
        }
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

    /// One combined atomic submit — real web behavior confirmed by this
    /// task's audit: weight and priority reconciliation share a single
    /// `&lt;form&gt;`/server action (`saveMorningCheckIn`), not two separate
    /// writes. `dispositions` must cover every occurrence
    /// `previousDayUnfinishedPriorities` currently returns; any missing
    /// entry fails validation the same way the real form's `required`
    /// radio group does.
    func saveMorningCheckIn(
        weightText: String,
        dispositions: [String: (disposition: PriorityDisposition, note: String)],
        now: Date = Date()
    ) -> Result<MorningCheckInResult, LoggingSandboxError> {
        let unfinished = previousDayUnfinishedPriorities(now: now)
        guard unfinished.allSatisfy({ dispositions[$0.id] != nil }) else {
            return .failure(.init(message: "Choose an outcome for each unfinished priority."))
        }
        switch saveWeighIn(weightText: weightText, unit: .lb, date: now, now: now) {
        case .failure(let error):
            return .failure(error)
        case .success(let weight):
            for occurrence in unfinished {
                guard let choice = dispositions[occurrence.id] else { continue }
                reconcilePriority(occurrenceId: occurrence.id, occurrenceDate: occurrence.date, disposition: choice.disposition, note: choice.note, now: now)
            }
            return .success(.init(weight: weight, reconciledPriorityCount: unfinished.count))
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
