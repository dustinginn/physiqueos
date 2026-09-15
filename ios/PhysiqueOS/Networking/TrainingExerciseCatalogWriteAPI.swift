import Foundation

/// `training-catalog.my-library.add.v1` / `training-catalog.exercise.create.v1`
/// — the two Native production write commands behind the My Library / All
/// Exercises architecture. Both are thin wrappers over the server-owned
/// semantics `CanonicalPersistenceCommandPorts.addToMyLibrary`/
/// `createCanonicalExercise` implement: canonical duplicate/matching policy
/// (`CanonicalExerciseLibraryService.findCanonicalExerciseConflict`, the
/// SAME full-catalog check Web's own creation flow uses) stays server-side
/// — Native never reimplements it. A successful `createExercise` call only
/// returns the new exercise's id; the caller re-fetches
/// `TrainingLoggerAPI.fetchConfiguration()` to get it back with its
/// server-assigned Training Area bucket rather than Native re-deriving
/// that bucketing itself for one item.
protocol TrainingExerciseCatalogWriteAPI: Sendable {
    func addToMyLibrary(canonicalExerciseId: String) async throws
    func createExercise(
        canonicalName: String,
        primaryMuscleGroupId: String,
        equipment: String?,
        aliases: [String]
    ) async throws -> CreateCanonicalExerciseOutcome
}

enum CreateCanonicalExerciseOutcome: Sendable, Equatable {
    case created(canonicalExerciseId: String)
    case duplicate(existingCanonicalExerciseId: String, existingCanonicalExerciseName: String)
}

struct ProductionTrainingExerciseCatalogWriteAPI: TrainingExerciseCatalogWriteAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func addToMyLibrary(canonicalExerciseId: String) async throws {
        try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction)
        let payload = AddPayload(canonicalExerciseId: canonicalExerciseId)
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.addToMyLibrary, canonicalExerciseId,
        ])
        let _: ProductionCommandOutcome<AddResult> = try await api.submitCommand(
            ProductionCommandType.addToMyLibrary,
            idempotencyKey: idempotencyStore.resolvedKey(
                scope: "training-catalog.my-library.\(canonicalExerciseId)", signature: signature
            ),
            payload: payload
        )
    }

    func createExercise(
        canonicalName: String,
        primaryMuscleGroupId: String,
        equipment: String?,
        aliases: [String]
    ) async throws -> CreateCanonicalExerciseOutcome {
        try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction)
        let payload = CreatePayload(
            canonicalName: canonicalName,
            primaryMuscleGroupId: primaryMuscleGroupId,
            equipment: equipment,
            aliases: aliases.isEmpty ? nil : aliases
        )
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.createCanonicalExercise, canonicalName, primaryMuscleGroupId,
            equipment ?? "", aliases.joined(separator: ","),
        ])
        do {
            let outcome: ProductionCommandOutcome<CreateResult> = try await api.submitCommand(
                ProductionCommandType.createCanonicalExercise,
                idempotencyKey: idempotencyStore.resolvedKey(
                    scope: "training-catalog.exercise.create.\(canonicalName)", signature: signature
                ),
                payload: payload
            )
            guard let result = outcome.receipt.result else { throw ProductionNativeError.invalidResponse }
            return .created(canonicalExerciseId: result.exercise.id)
        } catch ProductionNativeError.conflict(let problem) where problem.code == "CANONICAL_EXERCISE_DUPLICATE" {
            guard
                let existingId = problem.recovery?.stringField("existingCanonicalExerciseId"),
                let existingName = problem.recovery?.stringField("existingCanonicalExerciseName")
            else { throw ProductionNativeError.conflict(problem) }
            return .duplicate(existingCanonicalExerciseId: existingId, existingCanonicalExerciseName: existingName)
        }
    }

    private struct AddPayload: Encodable { var canonicalExerciseId: String }
    private struct AddResult: Decodable {}
    private struct CreatePayload: Encodable {
        var canonicalName: String
        var primaryMuscleGroupId: String
        var equipment: String?
        var aliases: [String]?
    }
    private struct CreateResult: Decodable {
        struct Exercise: Decodable { var id: String }
        var exercise: Exercise
    }
}

struct NotAvailableTrainingExerciseCatalogWriteAPI: TrainingExerciseCatalogWriteAPI {
    struct NotAvailable: Error {}
    func addToMyLibrary(canonicalExerciseId: String) async throws { throw NotAvailable() }
    func createExercise(
        canonicalName: String, primaryMuscleGroupId: String, equipment: String?, aliases: [String]
    ) async throws -> CreateCanonicalExerciseOutcome { throw NotAvailable() }
}

private extension ProductionJSONValue {
    func stringField(_ key: String) -> String? {
        guard case .object(let fields) = self, case .string(let value) = fields[key] else { return nil }
        return value
    }
}
