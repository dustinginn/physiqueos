import Foundation

/// `Phase3Command` (`server/src/application/commands/Phase3CommandService.js`)
/// — the exact command-type literals Founder Production's command endpoint
/// accepts. Kept as Swift constants (not free strings) so a typo fails to
/// compile rather than surfacing as a runtime `CONTRACT_VALIDATION_FAILED`.
/// Only the Daily Driver Write Build's enabled domains are listed here —
/// add the rest only when their domain is actually enabled.
enum ProductionCommandType {
    static let submitWeight = "weight.submit.v1"
    static let submitCheckIn = "check-in.submit.v1"
    static let completePriority = "priority.complete.v1"
    static let createTrainingSession = "training-session.create.v1"
    static let correctTrainingSession = "training-session.correct.v1"
    static let completeTrainingLogger = "training-logger.complete.v1"
    static let upsertNutritionDay = "nutrition-day.upsert.v1"
    static let syncActivityDay = "activity-day.sync.v1"
    static let createEvidenceIntake = "evidence-intake.create.v1"
    static let confirmDexaEvidence = "dexa-evidence.confirm.v1"
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
struct ProductionCommandOutcome<Result: Decodable>: Decodable {
    enum Outcome: String, Decodable {
        case committed
        case replayed
        case pending
    }

    struct Receipt: Decodable {
        var status: String
        var result: Result?
        var operationId: String?
        var commandId: String?
    }

    var outcome: Outcome
    var receipt: Receipt

    var isConfirmed: Bool { outcome != .pending }
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
