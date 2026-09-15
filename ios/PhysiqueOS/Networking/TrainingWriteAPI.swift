import Foundation

protocol TrainingWriteAPI: Sendable {
    /// Commits the structured TrainingSession only — exercises, sets, reps,
    /// load. This must become durable immediately and never waits on
    /// supporting-evidence screenshots, regardless of whether any are
    /// attached or how far along their interpretation is.
    func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult
    /// Starts (or resumes) interpreting any attached supporting-evidence
    /// screenshots as soon as they are attached. Purely a head start for
    /// `reconcileSupportingEvidenceAfterCommit`; `commit` never consumes or
    /// waits on this.
    func prewarmSupportingEvidence(for draft: TrainingLoggerDraft) async
    /// Reconciles any attached supporting-evidence screenshots onto the
    /// already-durable session named by `commit`'s result, entirely in the
    /// background. Confirms the screenshots' own evidence review through the
    /// same `evidence-review.commit.v1` path every other evidence type uses
    /// — its existing duplicate-detection already merges same-day training
    /// evidence rather than creating a second copy, so this needs no
    /// training-specific merge logic of its own. Best-effort: a failure here
    /// (a screenshot that never finishes interpreting, a review that stays
    /// ambiguous) leaves the screenshot's evidence review exactly where the
    /// normal standalone Evidence Review flow would — reachable and
    /// confirmable later — never lost, and never reverses the session's
    /// already-durable commit.
    func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async
}

extension TrainingWriteAPI {
    func prewarmSupportingEvidence(for draft: TrainingLoggerDraft) async {}
    func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async {}
}

struct TrainingCommitResult: Decodable, Equatable, Sendable {
    var status: String
    var reviewId: String
    var reviewRevision: Int?
    var sessionId: String
    var intendedDate: String
    var exerciseIds: [String]
}

enum TrainingWriteError: Error, Equatable, LocalizedError {
    case missingCanonicalExercise(String)
    case unsupportedDurationExercise(String)
    case noCompletedSets
    case attachmentUnavailable(String)
    case attachmentReviewUnavailable
    case confirmationTimedOut

    var errorDescription: String? {
        switch self {
        case .missingCanonicalExercise(let name): "Refresh the exercise catalog before logging \(name)."
        case .unsupportedDurationExercise(let name): "Duration sets for \(name) can't be logged here yet."
        case .noCompletedSets: "Complete at least one valid set before submitting."
        case .attachmentUnavailable(let name): "\(name) could not be uploaded. The workout draft is still saved."
        case .attachmentReviewUnavailable: "The supporting workout screenshots could not be prepared. The workout draft is still saved."
        case .confirmationTimedOut: "The workout is still processing. Check Training history shortly."
        }
    }
}

struct ProductionTrainingWriteAPI: TrainingWriteAPI {
    let api: ProductionNativeAPI
    let reviewAPI: EvidenceReviewAPI
    let idempotencyStore: ProductionIdempotencyKeyStore
    let attachmentStore: TrainingLoggerAttachmentStore
    let bindingStore: TrainingEvidenceBindingStore

    init(
        api: ProductionNativeAPI,
        reviewAPI: EvidenceReviewAPI,
        idempotencyStore: ProductionIdempotencyKeyStore,
        attachmentStore: TrainingLoggerAttachmentStore = FileTrainingLoggerAttachmentStore(),
        bindingStore: TrainingEvidenceBindingStore = TrainingEvidenceBindingStore()
    ) {
        self.api = api
        self.reviewAPI = reviewAPI
        self.idempotencyStore = idempotencyStore
        self.attachmentStore = attachmentStore
        self.bindingStore = bindingStore
    }

    func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
        try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction)
        let exercises = try draft.exercises.compactMap { exercise -> Exercise? in
            let completed = exercise.sets.filter(\.isCompleted)
            guard !completed.isEmpty else { return nil }
            let canonicalID = exercise.canonicalExerciseId?.isEmpty == false ? exercise.canonicalExerciseId : nil
            let provisional: ProvisionalExercise?
            if canonicalID == nil {
                guard exercise.isProvisional,
                      !exercise.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      !exercise.areaId.isEmpty
                else { throw TrainingWriteError.missingCanonicalExercise(exercise.name) }
                provisional = .init(name: exercise.name, primaryMuscleGroupId: exercise.areaId)
            } else {
                provisional = nil
            }
            return Exercise(
                canonicalExerciseId: canonicalID,
                provisionalExercise: provisional,
                occurrenceId: exercise.id,
                executionVariant: exercise.executionVariant,
                sets: completed.map { set in
                    let defaultsToBodyweight = exercise.defaultLoadType == "bodyweight"
                    let bodyweightOnly = defaultsToBodyweight && set.load == nil
                    return SetPayload(
                        setId: set.id,
                        reps: set.reps,
                        durationSeconds: set.durationSeconds,
                        load: bodyweightOnly ? nil : set.load,
                        loadType: bodyweightOnly ? "bodyweight" : "external_load",
                        unit: bodyweightOnly ? "bodyweight" : "lb"
                    )
                }
            )
        }
        guard !exercises.isEmpty else { throw TrainingWriteError.noCompletedSets }

        let supersets = draft.relationships.map {
            Superset(id: $0.id, memberExerciseIds: $0.memberExerciseIds)
        }
        // The structured TrainingSession must become durable immediately —
        // interpreting any attached supporting screenshots (which can take up
        // to a minute) is never a prerequisite for that. Any supporting
        // evidence is reconciled onto the session separately, in the
        // background, once it's ready (see `reconcileSupportingEvidenceAfterCommit`).
        let payload = Payload(
            sessionId: draft.id,
            localDate: draft.workoutDate,
            mode: draft.mode == .live ? "live" : "retrospective",
            exercises: exercises,
            supersets: supersets,
            supportingEvidenceReviewId: nil,
            supportingEvidenceReviewVersion: nil
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.commitTrainingSession,
            draft.id,
            draft.workoutDate,
            exercises.map { exercise in
                let sets = exercise.sets.map { set in
                    "\(set.setId):\(set.reps.map { String($0) } ?? "-"):\(set.durationSeconds.map { String($0) } ?? "-"):\(set.load.map { String($0) } ?? "-"):\(set.loadType):\(set.unit)"
                }.joined(separator: ",")
                let identity = exercise.canonicalExerciseId ?? "new:\(exercise.provisionalExercise?.name ?? ""):\(exercise.provisionalExercise?.primaryMuscleGroupId ?? "")"
                return "\(identity)|\(exercise.occurrenceId)|\(exercise.executionVariant?.key ?? "ordinary")|\(sets)"
            }.joined(separator: ";"),
            supersets.map { "\($0.id):\($0.memberExerciseIds.joined(separator: ","))" }.joined(separator: ";"),
        ])
        let key = idempotencyStore.resolvedKey(scope: "training-session.\(draft.id)", signature: signature)
        let outcome: ProductionCommandOutcome<TrainingCommitResult> = try await api.submitCommand(
            ProductionCommandType.commitTrainingSession,
            idempotencyKey: key,
            payload: payload
        )
        guard outcome.outcome != .pending, let result = outcome.receipt.result,
              outcome.confirmation?.state == "confirmed" || outcome.confirmation?.trainingSessionDurable == true else {
            throw TrainingWriteError.confirmationTimedOut
        }
        // Explicit Training durability acknowledgement is the boundary,
        // not the staged command receipt. Downstream work stays asynchronous;
        // a fully completed evidence pipeline is not required.
        // Any supporting-evidence binding is intentionally left in place here
        // (not cleared) — reconciling it onto this now-durable session is a
        // separate, later step; see `reconcileSupportingEvidenceAfterCommit`.
        return result
    }

    func prewarmSupportingEvidence(for draft: TrainingLoggerDraft) async {
        // Always recompute against the asset list as of THIS call: a caller
        // (the view model) is expected to serialize successive prewarms, so
        // an existing cached binding here would only ever be stale — from an
        // earlier attachment that didn't yet include everything on `draft`.
        bindingStore.remove(draftId: draft.id)
        _ = try? await prepareSupportingEvidence(for: draft)
    }

    func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async {
        // Whatever `prepareSupportingEvidence` needs the attachment files
        // for happens inside this call — safe to clean them up unconditionally
        // once it returns, succeeding or not.
        defer { attachmentStore.removeAll(draftId: draft.id) }
        guard let binding = try? await prepareSupportingEvidence(for: draft) else { return }
        guard let review = try? await reviewAPI.fetchReview(reviewId: binding.reviewId),
              let version = review.version
        else { return }
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: idempotencyStore)
        _ = try? await pipeline.commitReview(
            domain: .workoutLogger, reviewId: binding.reviewId, expectedVersion: String(version)
        )
        bindingStore.remove(draftId: draft.id)
    }

    private func prepareSupportingEvidence(for draft: TrainingLoggerDraft) async throws -> TrainingEvidenceBinding? {
        guard !draft.supportingEvidenceAssets.isEmpty else { return nil }
        if let existing = bindingStore.load(draftId: draft.id) { return existing }

        let files = try draft.supportingEvidenceAssets.map { asset -> (filename: String, contentType: String, data: Data) in
            guard let reference = asset.storageReference, let contentType = asset.contentType else {
                throw TrainingWriteError.attachmentUnavailable(asset.displayName)
            }
            let data: Data
            do { data = try attachmentStore.load(reference: reference) }
            catch { throw TrainingWriteError.attachmentUnavailable(asset.displayName) }
            return (asset.displayName, contentType, data)
        }
        let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: idempotencyStore)
        let intake = try await pipeline.submitIntake(
            scope: "training-evidence.\(draft.id)",
            effectiveDate: draft.workoutDate,
            expectedEvidenceType: "training",
            files: files
        )
        let reviewId = try await pipeline.awaitReadyIntake(intakeId: intake.intakeId)
        guard let review = try await reviewAPI.fetchReview(reviewId: reviewId), let version = review.version else {
            throw TrainingWriteError.attachmentReviewUnavailable
        }
        let binding = TrainingEvidenceBinding(reviewId: reviewId, reviewVersion: version)
        bindingStore.save(binding, draftId: draft.id)
        return binding
    }

    private struct Payload: Encodable {
        var sessionId: String
        var localDate: String
        var mode: String
        var exercises: [Exercise]
        var supersets: [Superset]
        var supportingEvidenceReviewId: String?
        var supportingEvidenceReviewVersion: Int?
    }

    private struct Exercise: Encodable {
        var canonicalExerciseId: String?
        var provisionalExercise: ProvisionalExercise?
        var occurrenceId: String
        var executionVariant: TrainingExecutionVariant?
        var sets: [SetPayload]
    }

    private struct ProvisionalExercise: Encodable {
        var name: String
        var primaryMuscleGroupId: String
    }

    private struct SetPayload: Encodable {
        var setId: String
        var reps: Double?
        var durationSeconds: Double?
        var load: Double?
        var loadType: String
        var unit: String
    }

    private struct Superset: Encodable {
        var id: String
        var memberExerciseIds: [String]
    }
}

struct NotAvailableTrainingWriteAPI: TrainingWriteAPI {
    struct NotAvailable: Error {}
    func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult { throw NotAvailable() }
}
