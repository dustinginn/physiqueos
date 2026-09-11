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
    private let api: GoalsAPI
    private let store: GoalsSandboxStore
    private let usesSandboxStore: Bool

    init(api: GoalsAPI, store: GoalsSandboxStore, usesSandboxStore: Bool) {
        self.api = api
        self.store = store
        self.usesSandboxStore = usesSandboxStore
    }

    func load() async {
        if usesSandboxStore {
            state = .loaded(store.hub)
            return
        }
        do { state = .loaded(try await api.fetchGoalsHub()) }
        catch { state = .failed("Goals could not be loaded.") }
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
    private let api: GoalsAPI
    private let store: GoalsSandboxStore
    private let usesSandboxStore: Bool
    private let goalId: String

    init(api: GoalsAPI, store: GoalsSandboxStore, usesSandboxStore: Bool, goalId: String) {
        self.api = api
        self.store = store
        self.usesSandboxStore = usesSandboxStore
        self.goalId = goalId
    }

    func load() async {
        do {
            let detail = usesSandboxStore ? store.goalDetail(goalId: goalId) : try await api.fetchGoalDetail(goalId: goalId)
            guard let detail else { state = .unavailable; return }
            state = .loaded(detail)
        } catch { state = .failed("This goal could not be loaded.") }
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
    private let api: GoalsAPI
    private let store: GoalsSandboxStore
    private let usesSandboxStore: Bool
    private let goalId: String
    private let phaseId: String

    init(api: GoalsAPI, store: GoalsSandboxStore, usesSandboxStore: Bool, goalId: String, phaseId: String) {
        self.api = api
        self.store = store
        self.usesSandboxStore = usesSandboxStore
        self.goalId = goalId
        self.phaseId = phaseId
    }

    func load() async {
        do {
            if usesSandboxStore {
                guard let active = store.goalDetail(goalId: goalId)?.active,
                      let phase = active.phases.first(where: { $0.id == phaseId }) else {
                    state = .unavailable; return
                }
                state = .loaded(GoalPhaseDetailReadModel(
                    goalId: active.id, goalTitle: active.title, phase: phase,
                    goalProgress: active.goalProgress, confidence: active.confidence, guardrail: active.guardrail
                ))
            } else {
                guard let phase = try await api.fetchGoalPhase(goalId: goalId, phaseId: phaseId) else {
                    state = .unavailable; return
                }
                state = .loaded(phase)
            }
        } catch { state = .failed("This phase could not be loaded.") }
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
