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
    case confirmationTimedOut

    var errorDescription: String? {
        switch self {
        case .missingCanonicalExercise(let name): "\(name) does not have a canonical Production exercise identity."
        case .unsupportedDurationExercise(let name): "\(name) cannot be submitted because the current Production command does not accept duration sets."
        case .noCompletedSets: "Complete at least one valid set before submitting."
        case .confirmationTimedOut: "The workout is still processing. Check Training history shortly."
        }
    }
}

struct ProductionTrainingWriteAPI: TrainingWriteAPI {
    let api: ProductionNativeAPI
    let reviewAPI: EvidenceReviewAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func commit(_ draft: TrainingLoggerDraft) async throws -> TrainingCommitResult {
        try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction)
        let exercises = try draft.exercises.compactMap { exercise -> Exercise? in
            let completed = exercise.sets.filter(\.isCompleted)
            guard !completed.isEmpty else { return nil }
            guard let canonicalID = exercise.canonicalExerciseId, !canonicalID.isEmpty else {
                throw TrainingWriteError.missingCanonicalExercise(exercise.name)
            }
            guard exercise.measurement != .duration else {
                throw TrainingWriteError.unsupportedDurationExercise(exercise.name)
            }
            let unit = exercise.measurement == .bodyweightReps ? "bodyweight" : "lb"
            return Exercise(
                canonicalExerciseId: canonicalID,
                occurrenceId: exercise.id,
                executionVariant: exercise.executionVariant,
                sets: completed.map { SetPayload(setId: $0.id, reps: $0.reps ?? 0, load: unit == "bodyweight" ? 0 : ($0.load ?? 0), unit: unit) }
            )
        }
        guard !exercises.isEmpty else { throw TrainingWriteError.noCompletedSets }

        let supersets = draft.relationships.map {
            Superset(id: $0.id, memberExerciseIds: $0.memberExerciseIds)
        }
        let payload = Payload(
            sessionId: draft.id,
            localDate: draft.workoutDate,
            mode: draft.mode == .live ? "live" : "retrospective",
            exercises: exercises,
            supersets: supersets
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.commitTrainingSession,
            draft.id,
            draft.workoutDate,
            exercises.map { exercise in
                let sets = exercise.sets.map { "\($0.setId):\($0.reps):\($0.load):\($0.unit)" }.joined(separator: ",")
                return "\(exercise.canonicalExerciseId)|\(exercise.occurrenceId)|\(exercise.executionVariant?.key ?? "ordinary")|\(sets)"
            }.joined(separator: ";"),
            supersets.map { "\($0.id):\($0.memberExerciseIds.joined(separator: ","))" }.joined(separator: ";"),
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
        return result
    }

    private struct Payload: Encodable {
        var sessionId: String
        var localDate: String
        var mode: String
        var exercises: [Exercise]
        var supersets: [Superset]
    }

    private struct Exercise: Encodable {
        var canonicalExerciseId: String
        var occurrenceId: String
        var executionVariant: TrainingExecutionVariant?
        var sets: [SetPayload]
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
