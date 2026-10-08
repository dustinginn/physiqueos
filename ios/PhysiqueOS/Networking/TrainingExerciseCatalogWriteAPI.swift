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
    func createExecutionVariant(canonicalExerciseId: String, displayName: String) async throws -> TrainingExecutionVariantCreation
}

enum CreateCanonicalExerciseOutcome: Sendable, Equatable {
    case created(canonicalExerciseId: String)
    case duplicate(existingCanonicalExerciseId: String, existingCanonicalExerciseName: String)
    case candidates([CanonicalExerciseMatch])
}

struct CanonicalExerciseMatch: Sendable, Equatable, Identifiable {
    var id: String
    var name: String
}

/// `training-catalog.execution-variant.create.v1` (Build 92). The Server owns
/// normalization, identity, duplicate detection and provenance; Native sends
/// only the canonical exercise and a display name. `created`,
/// `reactivated` and `already_exists` all return the canonical choice to
/// select; none of them is an error.
struct TrainingExecutionVariantCreation: Sendable, Equatable {
    var status: String
    var choice: TrainingExecutionVariantChoice
}

/// The Server refused this name for a reason the Founder can act on (for
/// example Ordinary/Superset are reserved, or the name is too long). The
/// message is the Server's own explanation.
struct TrainingExecutionVariantRejection: Error, Equatable {
    var code: String
    var message: String
}

extension TrainingExerciseCatalogWriteAPI {
    /// Default for catalog writers that predate Build 92 (Sandbox, tests):
    /// creation is unavailable, so no local-only variant is ever invented.
    func createExecutionVariant(canonicalExerciseId: String, displayName: String) async throws -> TrainingExecutionVariantCreation {
        throw NotAvailableTrainingExerciseCatalogWriteAPI.NotAvailable()
    }
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
            if case .object(let fields) = problem.recovery,
               case .array(let values) = fields["candidates"] {
                let candidates = values.compactMap { value -> CanonicalExerciseMatch? in
                    guard let id = value.stringField("id"), let name = value.stringField("name") else { return nil }
                    return CanonicalExerciseMatch(id: id, name: name)
                }
                guard !candidates.isEmpty, candidates.count == values.count else { throw ProductionNativeError.invalidResponse }
                return .candidates(candidates)
            }
            guard
                let existingId = problem.recovery?.stringField("existingCanonicalExerciseId"),
                let existingName = problem.recovery?.stringField("existingCanonicalExerciseName")
            else { throw ProductionNativeError.conflict(problem) }
            return .duplicate(existingCanonicalExerciseId: existingId, existingCanonicalExerciseName: existingName)
        }
    }

    func createExecutionVariant(canonicalExerciseId: String, displayName: String) async throws -> TrainingExecutionVariantCreation {
        try NativeProductWriteGuard.authorize(.workoutLogger, in: .founderProduction)
        // One logical create = one exercise + one normalized name. A retry
        // (timeout, lost response, relaunch, repeated tap) reuses the SAME
        // idempotency key so the Server replays its receipt instead of
        // creating twice; the key is forgotten after a terminal answer so a
        // later, deliberate create is a fresh command.
        let normalizedName = displayName
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
            .lowercased()
        let scope = "training-catalog.execution-variant.create.\(canonicalExerciseId).\(normalizedName)"
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.createTrainingExecutionVariant, canonicalExerciseId, normalizedName,
        ])
        let idempotencyKey = idempotencyStore.resolvedKey(scope: scope, signature: signature)
        do {
            let outcome: ProductionCommandOutcome<VariantResult> = try await api.submitCommand(
                ProductionCommandType.createTrainingExecutionVariant,
                idempotencyKey: idempotencyKey,
                payload: VariantPayload(canonicalExerciseId: canonicalExerciseId, displayName: displayName)
            )
            guard outcome.outcome != .pending, let result = outcome.receipt.result else {
                throw ProductionNativeError.invalidResponse
            }
            let choice = TrainingExecutionVariantChoice(
                variantId: result.variant.variantId,
                key: result.variant.key,
                label: result.variant.label,
                legacyKeys: result.variant.legacyKeys,
                status: result.variant.status,
                provenance: result.variant.provenance,
                selection: result.selection
            )
            guard ["created", "reactivated", "already_exists"].contains(result.status),
                  result.variant.canonicalExerciseId == canonicalExerciseId,
                  choice.isSelectable else { throw ProductionNativeError.invalidResponse }
            idempotencyStore.forget(scope: scope)
            return TrainingExecutionVariantCreation(status: result.status, choice: choice)
        } catch ProductionNativeError.validation(let problem) where problem.code.hasPrefix("TRAINING_EXECUTION_VARIANT_") {
            idempotencyStore.forget(scope: scope)
            throw TrainingExecutionVariantRejection(code: problem.code, message: problem.title)
        } catch ProductionNativeError.notFound(let problem) where problem?.code == "CANONICAL_EXERCISE_UNAVAILABLE" {
            idempotencyStore.forget(scope: scope)
            throw TrainingExecutionVariantRejection(code: "CANONICAL_EXERCISE_UNAVAILABLE", message: "Variants can't be created for this exercise.")
        }
    }

    private struct VariantPayload: Encodable { var canonicalExerciseId: String; var displayName: String }
    private struct VariantResult: Decodable {
        struct Variant: Decodable {
            var variantId: String
            var canonicalExerciseId: String
            var key: String
            var label: String
            var legacyKeys: [String]?
            var status: String?
            var provenance: String?
        }
        var status: String
        var variant: Variant
        var selection: TrainingExecutionVariant
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
