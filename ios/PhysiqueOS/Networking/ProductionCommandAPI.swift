import Foundation

/// The bounded production Native write allowlist
/// (`NATIVE_WRITE_COMMANDS` in `server/src/application/native/NativeProductionContractService.js`).
/// Every other command type defined server-side in `Phase3CommandService.js`
/// (there are many legacy ones, e.g. `training-session.create.v1`,
/// `activity-day.sync.v1`, `dexa-evidence.confirm.v1`) is explicitly
/// REJECTED by the Native command boundary with 400
/// `NATIVE_COMMAND_UNAVAILABLE` — this enum intentionally lists only the
/// eight accepted names so a typo or a legacy alias fails to compile
/// rather than surfacing as a runtime rejection.
enum ProductionCommandType {
    static let submitWeight = "weight.submit.v1"
    static let submitCheckIn = "check-in.submit.v1"
    static let completePriority = "priority.complete.v1"
    static let commitTrainingSession = "training-session.commit.v1"
    static let upsertNutritionDay = "nutrition-day.upsert.v1"
    static let upsertActivityDay = "activity-day.upsert.v1"
    static let editDexaReviewMeasurements = "dexa-review.measurements.v1"
    static let commitEvidenceReview = "evidence-review.commit.v1"
    static let disposeEvidenceReview = "evidence-review.dispose.v1"
    static let saveRecurringSupport = "operating-plan.recurring-support.save.v1"
    static let saveNutritionStrategy = "operating-plan.nutrition-strategy.save.v1"
    static let addToMyLibrary = "training-catalog.my-library.add.v1"
    static let createCanonicalExercise = "training-catalog.exercise.create.v1"
    static let saveTrainingStrategy = "operating-plan.training-strategy.save.v1"
    static let savePeptideSupport = "operating-plan.peptide-support.save.v1"
    static let saveSupplementSupport = "operating-plan.supplement-support.save.v1"
    static let saveSupplementStrategy = "operating-plan.supplement-strategy.save.v1"
    static let changeSupplementLifecycle = "operating-plan.supplement-lifecycle.change.v1"
    static let saveCoachingUpdates = "operating-plan.coaching-updates.save.v1"
}

struct ProductionCommandRequestMetadata: Encodable {
    var commandId: String
    var idempotencyKey: String
    var expectedVersion: String?
    var payloadVersion: String = "1"
}

struct ProductionCommandRequestEnvelope<Payload: Encodable>: Encodable {
    var commandType: String
    var metadata: ProductionCommandRequestMetadata
    var payload: Payload
}

/// `executeIdempotentCommand`'s response shape
/// (`server/src/application/commands/executeIdempotentCommand.js`):
/// `committed` is a first, successful execution; `replayed` is a retry
/// with an identical payload returning the SAME original receipt (proof
/// no second mutation happened); `pending` means another in-flight call
/// with the same idempotency key hasn't finished yet — Native should treat
/// this as "not yet confirmed," never as success.
struct ProductionCommandOutcome<Result: Decodable & Sendable>: Decodable, Sendable {
    enum Outcome: String, Decodable, Sendable {
        case committed
        case replayed
        case pending
    }

    struct Receipt: Decodable, Sendable {
        var status: String
        var result: Result?
        var operationId: String?
        var commandId: String?
    }

    var outcome: Outcome
    var receipt: Receipt
    /// Present only for `training-session.commit.v1` and
    /// `evidence-review.commit.v1` — `NativeProductionContractService.command()`
    /// durably accepts the reviewed package, releases its claim to the
    /// continuation worker, and merges that lifecycle result here. `state` is never
    /// `"stale"` for Native (that branch is web-interactive-only) — only
    /// `"processing"` (one more step remains; a background worker keeps
    /// driving it forward with no further action from Native) or
    /// `"confirmed"` (all steps complete). The confirmed canonical
    /// identity is deliberately NOT included here — Native must re-read
    /// the relevant resource (`dexa`, `training-day`, etc.) once confirmed.
    var confirmation: ProductionEvidenceReviewConfirmation?

    var isConfirmed: Bool { outcome != .pending }
}

/// Canonical occurrence completion. The read-side supplies both exact
/// occurrence identity and Reminder revision; Native never substitutes its
/// device date or guesses a version. Dose/protocol context is preserved for
/// specialized peptide occurrences while ordinary reminders use the same
/// canonical command without those optional fields.
protocol PriorityCompletionWriteAPI: Sendable {
    func complete(
        priorityId: String,
        occurrenceDate: String,
        context: PriorityCompletionContext?,
        expectedVersion: Int
    ) async throws
}

struct ProductionPriorityCompletionWriteAPI: PriorityCompletionWriteAPI {
    let api: ProductionNativeAPI
    let idempotencyStore: ProductionIdempotencyKeyStore

    func complete(
        priorityId: String,
        occurrenceDate: String,
        context: PriorityCompletionContext?,
        expectedVersion: Int
    ) async throws {
        try NativeProductWriteGuard.authorize(.priorityCompletion, in: .founderProduction)
        guard context?.occurrenceDate == nil || context?.occurrenceDate == occurrenceDate else {
            throw ProductionNativeError.invalidResponse
        }
        let signature = ProductionIdempotentSubmission.signature([
            ProductionCommandType.completePriority, priorityId, occurrenceDate,
            context?.dose ?? "", context?.protocolId ?? "", String(expectedVersion),
        ])
        let scope = "priority-complete.\(priorityId).\(occurrenceDate)"
        let idempotencyKey = idempotencyStore.resolvedKey(scope: scope, signature: signature)
        let payload = PriorityCompletionPayload(
            priorityId: priorityId,
            occurrenceDate: occurrenceDate,
            dose: context?.dose,
            protocolId: context?.protocolId
        )
        for attempt in 0..<2 {
            do {
                let outcome: ProductionCommandOutcome<PriorityCompletionResult> = try await api.submitCommand(
                    ProductionCommandType.completePriority,
                    idempotencyKey: idempotencyKey,
                    expectedVersion: String(expectedVersion),
                    payload: payload
                )
                guard outcome.isConfirmed, outcome.receipt.result != nil else {
                    throw ProductionNativeError.invalidResponse
                }
                return
            } catch {
                guard attempt == 0,
                      ProductionEvidenceIntakePipeline.acceptanceIsUncertain(after: error)
                else { throw error }
                // A lost response may follow a durable commit. Repeating the
                // exact envelope identity asks the Server for the original
                // command receipt and cannot create a second completion.
            }
        }
    }
}

private struct PriorityCompletionPayload: Encodable {
    var priorityId: String
    var occurrenceDate: String
    var dose: String?
    var protocolId: String?
}

private struct PriorityCompletionResult: Decodable, Sendable {
    var status: String
}

struct NotAvailablePriorityCompletionWriteAPI: PriorityCompletionWriteAPI {
    struct NotAvailable: Error {}
    func complete(
        priorityId: String,
        occurrenceDate: String,
        context: PriorityCompletionContext?,
        expectedVersion: Int
    ) async throws {
        throw NotAvailable()
    }
}

/// `executeEvidenceReviewConfirmation(mode:"native")`'s result
/// (`server/src/app/evidence/review/[reviewId]/actions.js`). `"confirmed"`
/// means the full 9-step canonical commit orchestration (canonical commit,
/// scheduled-completion reconciliation, analysis, Goal evaluation, event
/// eligibility, Briefing/Event generation, Home refresh) has finished —
/// Goal/Phase attribution and any DEXA/Training Event Briefing are already
/// generated by this point, automatically, with no further Native action.
/// `"processing"` with `accepted == true` means the version-protected
/// reviewed package and continuation are durable; a durable outbox worker
/// advances every remaining checkpoint with no additional Native call —
/// poll the underlying read resource (`evidence-review`, `dexa`,
/// `training-day`) rather than re-issuing the command.
struct ProductionEvidenceReviewConfirmation: Decodable, Sendable {
    var state: String
    var accepted: Bool?
    var reviewId: String?
    var continuationKey: String?
    var completedStep: String?
    var publication: String?
    /// True only after canonical_commit has durably written the domain
    /// record required by immediate Nutrition/Activity/DEXA/Training reads.
    /// Analysis, Goal evaluation, Events, and Briefings may still continue.
    var canonicalStateDurable: Bool?
    /// A staged receipt alone is not workout durability. The server sets
    /// this only after Training's canonical commit has completed.
    var trainingSessionDurable: Bool?
}

/// `AsyncEvidenceIntakeService`'s `responseFor(...)` shape
/// (`server/src/application/evidence/AsyncEvidenceIntakeService.js`) — the
/// same shape for both the initial `POST .../evidence/intakes` accept
/// (HTTP 202) and every `GET .../evidence/intakes/{intakeId}` poll.
/// `"processing"` means interpretation hasn't finished; `"ready"` means
/// `reviewId` is now populated (safe to fetch `evidence-review`); this
/// never returns "ready" synchronously from the initial POST for a real
/// DEXA PDF or screenshot — always poll.
struct ProductionEvidenceIntakeStatus: Decodable, Equatable, Sendable {
    var intakeId: String
    var status: String
    var reviewId: String?
    var reviewUrl: String?
    var processingUrl: String?
    var acceptedAt: String?
    var interpretationStartedAt: String?
    var reviewReadyAt: String?
    /// Staged-media progress (`mediaState`, per-artifact `expected`/`stored`);
    /// absent on aggregate intakes. `status` alone never claims complete
    /// media: incomplete media reads as `"processing"`.
    var mediaState: String?
    var mediaComplete: Bool?
    var expectedArtifactCount: Int?
    var storedArtifactCount: Int?
    var artifacts: [ProductionEvidenceIntakeArtifactProgress]?
    var artifactId: String?
    var artifactOutcome: String?
    var lastErrorCode: String?

    var isReady: Bool { status == "ready" }
    var isFailed: Bool { status == "processing_failed" }
}

/// Generalizes the exact safe-retry-vs-genuine-correction policy already
/// proven for Weight (`NativeSandboxWeightManualSubmission`/
/// `resolvedIdentity(signature:previousSignature:previousIdentity:freshIdentity:)`)
/// to every Production write domain: a retry of the SAME logical write
/// (identical content) must reuse the SAME idempotency key so the server's
/// command-receipt replay returns the original outcome; a genuine new
/// value (a real correction, a different occurrence, a different day)
/// must mint a FRESH key so it is never mistaken for a duplicate. Native
/// never invents its own notion of "this write already happened" beyond
/// this — the server's command receipt is the single source of truth.
enum ProductionIdempotentSubmission {
    /// A stable, order-independent content signature for a write attempt.
    /// Callers hash together every field that would change the server-side
    /// mutation's outcome (value, date, identity, revision target) — NOT
    /// incidental fields like a freshly-generated command id.
    static func signature(_ components: [String]) -> String {
        components.joined(separator: "\u{1F}")
    }

    /// Reuses `previousKey` when this attempt's `signature` matches the
    /// last attempt's (a safe retry — network failure, app relaunch,
    /// duplicate tap); mints a fresh key otherwise (a genuine new write).
    static func resolvedKey(
        signature: String,
        previousSignature: String?,
        previousKey: String?,
        freshKey: @autoclosure () -> String = UUID().uuidString
    ) -> String {
        if signature == previousSignature, let previousKey { return previousKey }
        return freshKey()
    }
}

/// Persists the last-submitted signature/idempotency-key pair per logical
/// write unit (a date, a session id, a review id) across relaunches —
/// UserDefaults-backed since this is small, non-sensitive bookkeeping, not
/// credential material. Every Production write domain shares this one
/// store rather than inventing its own persistence, keyed by a caller-owned
/// `scope` string (e.g. `"weight.2026-09-11"`, `"training-session.<id>"`).
/// A relaunch mid-submission (app killed right after a request went out
/// but before the response arrived) still retries with the SAME key
/// instead of risking a duplicate canonical mutation.
final class ProductionIdempotencyKeyStore: @unchecked Sendable {
    private let defaults: UserDefaults
    private let lock = NSLock()

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func resolvedKey(scope: String, signature: String) -> String {
        lock.lock()
        defer { lock.unlock() }
        let signatureKey = "physiqueos.idempotency.\(scope).signature"
        let keyKey = "physiqueos.idempotency.\(scope).key"
        let replacementKey = "physiqueos.idempotency.\(scope).replacement-predecessor"
        let previousSignature = defaults.string(forKey: signatureKey)
        let key = ProductionIdempotentSubmission.resolvedKey(
            signature: signature,
            previousSignature: previousSignature,
            previousKey: defaults.string(forKey: keyKey)
        )
        if previousSignature != signature {
            defaults.removeObject(forKey: replacementKey)
        }
        defaults.set(signature, forKey: signatureKey)
        defaults.set(key, forKey: keyKey)
        return key
    }

    /// Replaces one terminally ineligible intake identity while preserving
    /// convergence across duplicate callbacks. If another callback already
    /// rotated the same key, return that replacement instead of creating a
    /// second intake.
    func rotatedKey(scope: String, signature: String, replacing priorKey: String) -> String {
        lock.lock()
        defer { lock.unlock() }
        let signatureKey = "physiqueos.idempotency.\(scope).signature"
        let keyKey = "physiqueos.idempotency.\(scope).key"
        let replacementKey = "physiqueos.idempotency.\(scope).replacement-predecessor"
        if defaults.string(forKey: signatureKey) == signature,
           let current = defaults.string(forKey: keyKey), current != priorKey {
            return current
        }
        let replacement = UUID().uuidString
        defaults.set(signature, forKey: signatureKey)
        defaults.set(replacement, forKey: keyKey)
        defaults.set(priorKey, forKey: replacementKey)
        return replacement
    }

    /// Returns the immutable dismissed/rejected predecessor associated with
    /// the current replacement key. Persisting this beside the idempotency
    /// key makes a retry or app relaunch reproduce the exact same request
    /// context instead of conflicting with its own durable receipt.
    func replacementPredecessor(scope: String, signature: String, currentKey: String) -> String? {
        lock.lock()
        defer { lock.unlock() }
        guard defaults.string(forKey: "physiqueos.idempotency.\(scope).signature") == signature,
              defaults.string(forKey: "physiqueos.idempotency.\(scope).key") == currentKey else {
            return nil
        }
        return defaults.string(forKey: "physiqueos.idempotency.\(scope).replacement-predecessor")
    }

    /// Clears bookkeeping for a scope once its write is durably confirmed
    /// and will never be retried again (e.g. after a terminal success) —
    /// optional hygiene, not required for correctness.
    func forget(scope: String) {
        lock.lock()
        defer { lock.unlock() }
        defaults.removeObject(forKey: "physiqueos.idempotency.\(scope).signature")
        defaults.removeObject(forKey: "physiqueos.idempotency.\(scope).key")
        defaults.removeObject(forKey: "physiqueos.idempotency.\(scope).replacement-predecessor")
    }
}
