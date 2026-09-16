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
    /// Read-only startup recovery for an old local draft whose exact
    /// deterministic canonical identity may already be durable. Returns
    /// true only when identity, date, exercises, sets, variants, and
    /// relationships all match; callers may then safely clear local state.
    func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool
}

extension TrainingWriteAPI {
    func prewarmSupportingEvidence(for draft: TrainingLoggerDraft) async {}
    func reconcileSupportingEvidenceAfterCommit(for draft: TrainingLoggerDraft) async {}
    func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool { false }
}

struct TrainingCommitResult: Decodable, Equatable, Sendable {
    var status: String
    var reviewId: String?
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
    let durabilityRetryDelay: Duration

    init(
        api: ProductionNativeAPI,
        reviewAPI: EvidenceReviewAPI,
        idempotencyStore: ProductionIdempotencyKeyStore,
        attachmentStore: TrainingLoggerAttachmentStore = FileTrainingLoggerAttachmentStore(),
        bindingStore: TrainingEvidenceBindingStore = TrainingEvidenceBindingStore(),
        durabilityRetryDelay: Duration = .milliseconds(500)
    ) {
        self.api = api
        self.reviewAPI = reviewAPI
        self.idempotencyStore = idempotencyStore
        self.attachmentStore = attachmentStore
        self.bindingStore = bindingStore
        self.durabilityRetryDelay = durabilityRetryDelay
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
            startedAt: draft.startedAt,
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
        let confirmationStartedAt = Date()
        do {
            let outcome = try await submitDurableTrainingCommand(
                payload: payload, idempotencyKey: key,
                expectedExerciseIds: exercises.compactMap(\.canonicalExerciseId)
            )
            if let recovered = outcome.recovered {
                EvidenceLifecycleDiagnostics.recordConfirmation(
                    milliseconds: Int(Date().timeIntervalSince(confirmationStartedAt) * 1_000),
                    outcome: "training_durable_readback"
                )
                return recovered
            }
            guard let commandOutcome = outcome.commandOutcome else { throw TrainingWriteError.confirmationTimedOut }
            guard commandOutcome.outcome != .pending, let result = commandOutcome.receipt.result,
                  commandOutcome.confirmation?.state == "confirmed" || commandOutcome.confirmation?.trainingSessionDurable == true else {
                throw TrainingWriteError.confirmationTimedOut
            }
            EvidenceLifecycleDiagnostics.recordConfirmation(
                milliseconds: Int(Date().timeIntervalSince(confirmationStartedAt) * 1_000),
                outcome: "training_durable_acknowledgement"
            )
            // Explicit Training durability acknowledgement is the boundary,
            // not the staged command receipt. Downstream work stays asynchronous;
            // a fully completed evidence pipeline is not required.
            // Any supporting-evidence binding is intentionally left in place here
            // (not cleared) — reconciling it onto this now-durable session is a
            // separate, later step; see `reconcileSupportingEvidenceAfterCommit`.
            return result
        } catch {
            EvidenceLifecycleDiagnostics.recordConfirmation(
                milliseconds: Int(Date().timeIntervalSince(confirmationStartedAt) * 1_000),
                outcome: "training_unresolved"
            )
            throw error
        }
    }

    /// Training's server boundary deliberately does not acknowledge success
    /// until the canonical TrainingSession is durable. Production proved
    /// that this can take ~19 seconds. Do not paper over that latency with a
    /// longer transport deadline: wait briefly for the interactive path and,
    /// if acknowledgement is still ambiguous, replay the exact same payload with
    /// the exact same persisted idempotency key. The server can only return
    /// the original receipt; it cannot create a second workout.
    private func submitDurableTrainingCommand(
        payload: Payload,
        idempotencyKey: String,
        expectedExerciseIds: [String]
    ) async throws -> DurableTrainingOutcome {
        // Keep the interactive ambiguity budget bounded. The initial request
        // gets the ordinary <=3s target; one short same-key replay plus
        // canonical readback distinguishes a lost acknowledgement from work
        // that is genuinely still processing. We do not turn a server-side
        // continuation into a minute-long blocking spinner.
        let maximumAttempts = 2
        var lastUncertainError: Swift.Error?
        for attempt in 0..<maximumAttempts {
            do {
                let outcome: ProductionCommandOutcome<TrainingCommitResult> = try await api.submitCommand(
                    ProductionCommandType.commitTrainingSession,
                    idempotencyKey: idempotencyKey,
                    timeoutInterval: attempt == 0 ? 3 : 1,
                    payload: payload
                )
                let durable = outcome.confirmation?.state == "confirmed" || outcome.confirmation?.trainingSessionDurable == true
                if outcome.outcome != .pending, durable {
                    return .init(commandOutcome: outcome, recovered: nil)
                }
            } catch {
                guard ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error) else { throw error }
                lastUncertainError = error
            }
            if let recovered = try? await durableCanonicalReadback(
                payload: payload, expectedExerciseIds: expectedExerciseIds
            ) {
                return .init(commandOutcome: nil, recovered: recovered)
            }
            if attempt + 1 < maximumAttempts {
                try await Task.sleep(for: durabilityRetryDelay)
            }
        }
        if let recovered = try? await durableCanonicalReadback(payload: payload, expectedExerciseIds: expectedExerciseIds) {
            return .init(commandOutcome: nil, recovered: recovered)
        }
        if let lastUncertainError { throw lastUncertainError }
        throw TrainingWriteError.confirmationTimedOut
    }

    private func durableCanonicalReadback(
        payload: Payload,
        expectedExerciseIds: [String]
    ) async throws -> TrainingCommitResult? {
        let canonicalId = "training|authoritative|training_logger_draft_\(payload.sessionId)"
        let session = try await api.readResource(
            "training-session", query: ["sessionId": canonicalId], as: TrainingSessionDetailReadModel.self
        ).data
        guard session.id == canonicalId, session.date == payload.localDate else { return nil }
        let actualExerciseIds = session.exercises.compactMap(\.canonicalExerciseId)
        guard Set(actualExerciseIds) == Set(expectedExerciseIds),
              session.exercises.reduce(0, { $0 + $1.sets.count }) == payload.exercises.reduce(0, { $0 + $1.sets.count })
        else { return nil }
        return TrainingCommitResult(
            status: "durable_readback", reviewId: nil, sessionId: payload.sessionId,
            intendedDate: payload.localDate, exerciseIds: actualExerciseIds
        )
    }

    func isDraftAlreadyDurable(_ draft: TrainingLoggerDraft) async -> Bool {
        let canonicalId = "training|authoritative|training_logger_draft_\(draft.id)"
        guard let session = try? await api.readResource(
            "training-session", query: ["sessionId": canonicalId],
            as: TrainingSessionDetailReadModel.self
        ).data,
              session.id == canonicalId,
              session.date == draft.workoutDate
        else { return false }

        let expectedExercises = draft.exercises.compactMap { exercise -> TrainingLoggerDraftExercise? in
            exercise.sets.contains(where: \.isCompleted) ? exercise : nil
        }
        guard session.exercises.count == expectedExercises.count else { return false }
        for expected in expectedExercises {
            guard let actual = session.exercises.first(where: { $0.id == expected.id }),
                  actual.canonicalExerciseId == expected.canonicalExerciseId,
                  (expected.canonicalExerciseId != nil || actual.name == expected.name),
                  actual.executionVariant?.key == expected.executionVariant?.key
            else { return false }
            let expectedSets = expected.sets.filter(\.isCompleted).sorted { $0.setNumber < $1.setNumber }
            let actualSets = actual.sets.sorted { $0.setNumber < $1.setNumber }
            guard expectedSets.count == actualSets.count else { return false }
            for (left, right) in zip(expectedSets, actualSets) {
                let expectedLoadType = left.loadType ?? (expected.defaultLoadType == "bodyweight" && left.load == nil
                    ? "bodyweight" : "external_load")
                let expectedWeightUnit = expectedLoadType == "bodyweight" ? "bodyweight" : "lb"
                guard left.setNumber == right.setNumber,
                      left.reps == right.reps,
                      left.durationSeconds == right.durationSeconds,
                      left.load == right.weight,
                      expectedLoadType == right.loadType,
                      expectedWeightUnit == right.weightUnit
                else { return false }
            }
        }
        let expectedRelationships = draft.relationships.map {
            ($0.id, $0.relationshipType, $0.memberExerciseIds)
        }.sorted { $0.0 < $1.0 }
        let actualRelationships = session.exerciseRelationshipGroups.map {
            ($0.id, $0.relationshipType, $0.memberExerciseIds)
        }.sorted { $0.0 < $1.0 }
        guard expectedRelationships.count == actualRelationships.count else { return false }
        return zip(expectedRelationships, actualRelationships).allSatisfy { expected, actual in
            expected.0 == actual.0 && expected.1 == actual.1 && expected.2 == actual.2
        }
    }

    private struct DurableTrainingOutcome {
        var commandOutcome: ProductionCommandOutcome<TrainingCommitResult>?
        var recovered: TrainingCommitResult?
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
            domain: .workoutLogger,
            reviewId: binding.reviewId,
            expectedVersion: String(version),
            targetTrainingSessionCanonicalId: "training|authoritative|training_logger_draft_\(draft.id)"
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
        var startedAt: String?
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
