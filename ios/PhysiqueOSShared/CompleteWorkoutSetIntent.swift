import AppIntents
import Foundation

/// What a Complete Set tap asks for. Carries the exact identity the Live
/// Activity was rendered from, so a stale or replayed tap can never complete
/// a different set.
struct WorkoutCompleteSetRequest: Sendable, Equatable {
    var sessionId: String
    var authority: String
    var exerciseId: String
    var setId: String
    var expectedRevision: Int
    /// Unique per user action (generated when the tap is performed).
    var mutationId: String
}

/// How the app resolved a request. Every outcome other than `applied`
/// changes nothing (or, for `unchanged`/`duplicate`, nothing new).
enum WorkoutCompleteSetOutcome: String, Sendable, Equatable {
    case applied
    case unchanged
    case duplicate
    case stale
    case sessionEnded
    case notMutable
    case invalidValues
    case persistenceFailed
    /// The app side was not ready (the extension, or a launch race).
    case unavailable
}

/// Process-wide hook the app installs at launch. The intent's `perform()`
/// runs in the APP process (never in the extension) and must use the same
/// `TrainingSessionAuthority.completeSet` operation as the Logger; this hook
/// is the only seam, so there is exactly one mutation implementation.
enum WorkoutActivityIntentRuntime {
    nonisolated(unsafe) static var handler: (@Sendable (WorkoutCompleteSetRequest) async -> WorkoutCompleteSetOutcome)?

    /// A headless launch can run `perform()` before the app finishes wiring;
    /// wait briefly for the handler instead of dropping the tap.
    static func resolve(_ request: WorkoutCompleteSetRequest, waitingUpTo seconds: Double = 5) async -> WorkoutCompleteSetOutcome {
        var waited = 0.0
        while handler == nil, waited < seconds {
            try? await Task.sleep(for: .milliseconds(50))
            waited += 0.05
        }
        guard let handler else { return .unavailable }
        return await handler(request)
    }
}

/// The Live Activity's Complete Set button. A `LiveActivityIntent`, so the
/// system runs it in the app's process without foregrounding the app.
struct CompleteWorkoutSetIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Complete Set"
    static let description = IntentDescription("Completes the current set of your active workout.")
    static let isDiscoverable = false
    static let openAppWhenRun = false
    /// Completing a set from the Lock Screen is the point of the control, so
    /// it is explicitly allowed while locked; the authority still refuses
    /// stale, duplicate, wrong-phase and invalid taps.
    static let authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

    @Parameter(title: "Session") var sessionId: String
    @Parameter(title: "Authority") var authority: String
    @Parameter(title: "Exercise") var exerciseId: String
    @Parameter(title: "Set") var setId: String
    @Parameter(title: "Revision") var expectedRevision: Int

    init() {
        sessionId = ""; authority = ""; exerciseId = ""; setId = ""; expectedRevision = 0
    }

    init(sessionId: String, authority: String, exerciseId: String, setId: String, expectedRevision: Int) {
        self.sessionId = sessionId
        self.authority = authority
        self.exerciseId = exerciseId
        self.setId = setId
        self.expectedRevision = expectedRevision
    }

    func perform() async throws -> some IntentResult {
        let request = WorkoutCompleteSetRequest(
            sessionId: sessionId, authority: authority, exerciseId: exerciseId, setId: setId,
            expectedRevision: expectedRevision, mutationId: UUID().uuidString
        )
        _ = await WorkoutActivityIntentRuntime.resolve(request)
        return .result()
    }
}
