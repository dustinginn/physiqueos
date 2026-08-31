import Foundation

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

    init(api: GoalsAPI) {
        self.api = api
    }

    func load() async {
        do {
            state = .loaded(try await api.fetchGoalsHub())
        } catch {
            state = .failed("Goals could not be loaded.")
        }
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
    private let goalId: String

    init(api: GoalsAPI, goalId: String) {
        self.api = api
        self.goalId = goalId
    }

    func load() async {
        do {
            guard let detail = try await api.fetchGoalDetail(goalId: goalId) else {
                state = .unavailable
                return
            }
            state = .loaded(detail)
        } catch {
            state = .failed("Goal details could not be loaded.")
        }
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
    private let goalId: String
    private let phaseId: String

    init(api: GoalsAPI, goalId: String, phaseId: String) {
        self.api = api
        self.goalId = goalId
        self.phaseId = phaseId
    }

    func load() async {
        do {
            guard let detail = try await api.fetchGoalPhase(goalId: goalId, phaseId: phaseId) else {
                state = .unavailable
                return
            }
            state = .loaded(detail)
        } catch {
            state = .failed("Phase details could not be loaded.")
        }
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
