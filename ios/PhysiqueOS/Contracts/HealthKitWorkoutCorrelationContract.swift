import Foundation

/// A phone-owned allowlist of exact structured sessions that a trusted
/// PhysiqueOS Watch workout may claim. The registry is scoped to one owner;
/// arbitrary HealthKit metadata is never treated as join authority.
struct HealthKitTrustedWorkoutCorrelationContext: Sendable {
    struct SessionEnvelope: Equatable, Sendable {
        var sessionId: UUID
        var ownerKey: String
        var startedAt: Date
        var endedAt: Date?
    }

    var trustedSourceBundleIdentifiers: Set<String>
    var traditionalStrengthTrainingActivityTypes: Set<String>
    var ownerKey: String
    var sessions: [SessionEnvelope]
    var clockToleranceSeconds: TimeInterval

    static let disabled = Self(
        trustedSourceBundleIdentifiers: [],
        traditionalStrengthTrainingActivityTypes: [],
        ownerKey: "",
        sessions: [],
        clockToleranceSeconds: 0
    )
}

enum HealthKitTrustedWorkoutCorrelation {
    /// Returns the canonical lowercase UUID only when every trust check
    /// passes: configured source identity, UUID syntax and exact registry
    /// membership, traditional strength + indoor, owner scope, and temporal
    /// containment. Any ambiguity degrades to an ordinary uncorrelated
    /// HealthKit workout rather than guessing.
    static func extract(
        externalUUID: String?,
        sourceBundleIdentifier: String,
        activityType: String,
        isIndoorWorkout: Bool?,
        startedAt: Date?,
        endedAt: Date?,
        context: HealthKitTrustedWorkoutCorrelationContext
    ) -> String? {
        guard context.trustedSourceBundleIdentifiers.contains(sourceBundleIdentifier),
              context.traditionalStrengthTrainingActivityTypes.contains(activityType),
              isIndoorWorkout == true,
              let externalUUID,
              let sessionUUID = UUID(uuidString: externalUUID),
              let startedAt,
              let endedAt, endedAt >= startedAt
        else { return nil }
        let matches = context.sessions.filter { envelope in
            guard let envelopeEnd = envelope.endedAt else { return false }
            return envelope.sessionId == sessionUUID
                && envelope.ownerKey == context.ownerKey
                && startedAt >= envelope.startedAt.addingTimeInterval(-context.clockToleranceSeconds)
                && endedAt <= envelopeEnd.addingTimeInterval(context.clockToleranceSeconds)
        }
        guard matches.count == 1 else { return nil }
        return sessionUUID.uuidString.lowercased()
    }
}
