import Foundation

/// Reads through `GoalsSandboxStore` — the mutable source of truth Goal
/// Edit/Goal Transition commands write to — rather than the stateless
/// `GoalsAPI`, so the Goals tab reflects a fixture-session edit
/// immediately. `GoalStrategyViewModel` below is unaffected by this
/// task's commands and is left on `GoalsAPI`.
@Observable
@MainActor
final class GoalsViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(GoalsHubReadModel)
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let store: GoalsSandboxStore

    init(store: GoalsSandboxStore) {
        self.store = store
    }

    func load() {
        state = .loaded(store.hub)
    }
}

@Observable
@MainActor
final class GoalDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(GoalDetailReadModel)
        case unavailable
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let store: GoalsSandboxStore
    private let goalId: String

    init(store: GoalsSandboxStore, goalId: String) {
        self.store = store
        self.goalId = goalId
    }

    func load() {
        guard let detail = store.goalDetail(goalId: goalId) else {
            state = .unavailable
            return
        }
        state = .loaded(detail)
    }
}

@Observable
@MainActor
final class GoalPhaseDetailViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(GoalPhaseDetailReadModel)
        case unavailable
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let store: GoalsSandboxStore
    private let goalId: String
    private let phaseId: String

    init(store: GoalsSandboxStore, goalId: String, phaseId: String) {
        self.store = store
        self.goalId = goalId
        self.phaseId = phaseId
    }

    func load() {
        guard let active = store.goalDetail(goalId: goalId)?.active,
              let phase = active.phases.first(where: { $0.id == phaseId }) else {
            state = .unavailable
            return
        }
        state = .loaded(GoalPhaseDetailReadModel(
            goalId: active.id, goalTitle: active.title, phase: phase,
            goalProgress: active.goalProgress, confidence: active.confidence, guardrail: active.guardrail
        ))
    }
}

@Observable
@MainActor
final class GoalStrategyViewModel {
    enum LoadState: Equatable {
        case loading
        case loaded(GoalStrategyReadModel)
        case unavailable
        case failed(String)
    }

    private(set) var state: LoadState = .loading
    private let api: GoalsAPI
    private let goalId: String
    private let focus: GoalPlanFocus

    init(api: GoalsAPI, goalId: String, focus: GoalPlanFocus) {
        self.api = api
        self.goalId = goalId
        self.focus = focus
    }

    func load() async {
        do {
            guard let strategy = try await api.fetchGoalStrategy(goalId: goalId, focus: focus) else {
                state = .unavailable
                return
            }
            state = .loaded(strategy)
        } catch {
            state = .failed("Goal strategy could not be loaded.")
        }
    }
}
