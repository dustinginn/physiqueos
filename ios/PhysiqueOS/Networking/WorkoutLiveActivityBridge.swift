import Foundation

/// Composition-root glue for the Workout Live Activity: owns the
/// coordinator, attaches it to the selected authority, and installs the
/// Complete Set handler the intent's `perform()` calls. The handler routes to
/// `TrainingSessionAuthority.completeSet`, the same typed operation the
/// Logger uses, so there is exactly one mutation implementation.
@MainActor
final class WorkoutLiveActivityBridge {
    let coordinator: WorkoutLiveActivityCoordinator
    private unowned let environment: AppEnvironment

    init(environment: AppEnvironment, client: WorkoutLiveActivityClient = ActivityKitWorkoutLiveActivityClient()) {
        self.environment = environment
        self.coordinator = WorkoutLiveActivityCoordinator(client: client, areaLabels: { [:] })
    }

    /// Installs the intent handler. Called from the App initializer (a
    /// background launch to run an intent still constructs the App).
    func install() {
        WorkoutActivityIntentRuntime.handler = { [weak self] request in
            await MainActor.run { self?.complete(request) ?? .unavailable }
        }
        attachToSelectedAuthority()
    }

    func attachToSelectedAuthority() {
        coordinator.attach(
            to: environment.trainingSessionAuthority(for: environment.nativeAuthority),
            environment: environment.nativeAuthority
        )
    }

    /// Foreground / launch: adopt, dedupe and clean up, then sync.
    func reconcile() {
        attachToSelectedAuthority()
        coordinator.reconcile()
    }

    /// Resolves one Complete Set tap. Never throws and never partially
    /// applies: the authority either accepts the exact (session, exercise,
    /// set, revision) or rejects it with a reason.
    func complete(_ request: WorkoutCompleteSetRequest) -> WorkoutCompleteSetOutcome {
        guard let authorityEnvironment = NativeAPIEnvironment(rawValue: request.authority) else { return .unavailable }
        let authority = environment.trainingSessionAuthority(for: authorityEnvironment)
        let outcome = authority.completeSet(
            sessionId: request.sessionId, exerciseId: request.exerciseId, setId: request.setId,
            context: .intent(mutationId: request.mutationId, expectedRevision: request.expectedRevision)
        )
        // Render the result before a background process can suspend.
        Task { @MainActor [coordinator] in await coordinator.flush() }
        return Self.map(outcome)
    }

    static func map(_ outcome: TrainingSessionMutationOutcome) -> WorkoutCompleteSetOutcome {
        switch outcome {
        case .applied: .applied
        case .unchanged: .unchanged
        case .duplicate: .duplicate
        case .rejected(let reason):
            switch reason {
            case .staleRevision, .exerciseNotFound, .setNotFound: .stale
            case .sessionNotFound, .sessionEnded: .sessionEnded
            case .sessionNotMutable, .originNotPermitted, .revisionRequired, .restNotFound, .writesNotAuthorized: .notMutable
            case .setValuesIncomplete: .invalidValues
            case .persistenceFailed: .persistenceFailed
            }
        }
    }
}
