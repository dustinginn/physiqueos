import Foundation

/// The future authenticated server command boundary for promoting a
/// direct-upload provisional exercise occurrence to a real canonical
/// Training Logger exercise.
///
/// **No conforming implementation exists.** Native has no connected
/// server API for Training canonicalization today. The isolated server
/// sandbox is operational, but it deliberately exposes no approved
/// canonical exercise-creation command. This protocol exists purely as the
/// defined seam a future, authenticated implementation can bind to with no
/// further model or view change; nothing in the app calls it, injects a
/// conformance for it, or claims a fabricated `canonicalExerciseId` in its
/// absence. Evidence
/// Review's "Create New Exercise" action today only records the Founder's
/// proposed Training Area on the occurrence itself
/// (`EvidenceReviewExercise.proposedAreaId`) — the local, honest half of
/// this contract — and leaves `isProvisional`/`canonicalExerciseId`
/// unchanged until a real command exists.
///
/// Reuses Workout Logger's own domain concepts rather than inventing a
/// second exercise-creation model: `TrainingLoggerDraftExercise`'s
/// provisional-exercise shape (`addProvisionalExercise(name:areaId:)`,
/// `TrainingLoggerReadModel.swift`) already establishes that a name and a
/// Training Area are the only inputs a provisional exercise needs before
/// it can become canonical — `TrainingExerciseCreationRequest` mirrors
/// that shape exactly, plus the direct-upload occurrence identity a
/// server command needs to know which occurrence to reconcile.
///
/// Execution variants deliberately have no equivalent creation command
/// here: `TrainingExecutionVariant`'s own documented model
/// (`Contracts/TrainingReadModel.swift`) treats variants as freeform
/// occurrence-level text, not a separately persisted registry entity —
/// there is nothing to "create" server-side once the Founder has typed a
/// variant label, so inventing a variant-creation request would impose
/// registry semantics the canonical architecture does not have.
protocol TrainingExerciseCanonicalizationCommand: Sendable {
    /// Promotes one provisional exercise occurrence to a canonical
    /// Training Logger exercise. `request.occurrenceId` must match exactly
    /// one `EvidenceReviewExercise.id` — this call must never affect any
    /// other occurrence, including another occurrence that happens to
    /// share the same typed exercise name.
    func createExercise(_ request: TrainingExerciseCreationRequest) async throws -> TrainingExerciseCreationResponse
}

/// Everything Native already knows about a provisional direct-upload
/// exercise occurrence at the moment the Founder confirms "Create New
/// Exercise." Sets/reps/load are deliberately not included: they remain
/// occurrence data on `EvidenceReviewExercise.sets` that a separate,
/// already-established evidence-confirmation path owns — this request
/// only carries the identity fields a canonicalization command changes.
struct TrainingExerciseCreationRequest: Equatable, Sendable {
    var reviewId: String
    var occurrenceId: String
    var proposedName: String
    var areaId: String
}

struct TrainingExerciseCreationResponse: Equatable, Sendable {
    var canonicalExerciseId: String
}
