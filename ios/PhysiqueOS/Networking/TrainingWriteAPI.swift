import Foundation

protocol TrainingWriteAPI: Sendable {
    func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult
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
        case .missingCanonicalExercise(let name): "\(name) does not have a canonical Production exercise identity."
        case .unsupportedDurationExercise(let name): "\(name) cannot be submitted because the current Production command does not accept duration sets."
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
            guard exercise.measurement != .duration else {
                throw TrainingWriteError.unsupportedDurationExercise(exercise.name)
            }
            let unit = exercise.measurement == .bodyweightReps ? "bodyweight" : "lb"
            return Exercise(
                canonicalExerciseId: canonicalID,
                provisionalExercise: provisional,
                occurrenceId: exercise.id,
                executionVariant: exercise.executionVariant,
                sets: completed.map { SetPayload(setId: $0.id, reps: $0.reps ?? 0, load: unit == "bodyweight" ? 0 : ($0.load ?? 0), unit: unit) }
            )
        }
        guard !exercises.isEmpty else { throw TrainingWriteError.noCompletedSets }

        let supersets = draft.relationships.map {
            Superset(id: $0.id, memberExerciseIds: $0.memberExerciseIds)
        }
        let supportingBinding = try await prepareSupportingEvidence(for: draft)
        let payload = Payload(
            sessionId: draft.id,
            localDate: draft.workoutDate,
            mode: draft.mode == .live ? "live" : "retrospective",
            exercises: exercises,
            supersets: supersets,
            supportingEvidenceReviewId: supportingBinding?.reviewId,
            supportingEvidenceReviewVersion: supportingBinding?.reviewVersion
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.commitTrainingSession,
            draft.id,
            draft.workoutDate,
            exercises.map { exercise in
                let sets = exercise.sets.map { "\($0.setId):\($0.reps):\($0.load):\($0.unit)" }.joined(separator: ",")
                let identity = exercise.canonicalExerciseId ?? "new:\(exercise.provisionalExercise?.name ?? ""):\(exercise.provisionalExercise?.primaryMuscleGroupId ?? "")"
                return "\(identity)|\(exercise.occurrenceId)|\(exercise.executionVariant?.key ?? "ordinary")|\(sets)"
            }.joined(separator: ";"),
            supersets.map { "\($0.id):\($0.memberExerciseIds.joined(separator: ","))" }.joined(separator: ";"),
            supportingBinding?.reviewId ?? "no-supporting-evidence",
            supportingBinding.map { String($0.reviewVersion) } ?? "",
        ])
        let key = idempotencyStore.resolvedKey(scope: "training-session.\(draft.id)", signature: signature)
        let outcome: ProductionCommandOutcome<TrainingCommitResult> = try await api.submitCommand(
            ProductionCommandType.commitTrainingSession,
            idempotencyKey: key,
            payload: payload
        )
        guard outcome.outcome != .pending, let result = outcome.receipt.result else {
            throw TrainingWriteError.confirmationTimedOut
        }
        if outcome.confirmation?.state != "confirmed" {
            let pipeline = ProductionEvidenceIntakePipeline(api: api, idempotencyStore: idempotencyStore)
            do {
                try await pipeline.awaitConfirmation(reviewAPI: reviewAPI, reviewId: result.reviewId)
            } catch {
                throw TrainingWriteError.confirmationTimedOut
            }
        }
        bindingStore.remove(draftId: draft.id)
        return result
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
        var reps: Double
        var load: Double
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
