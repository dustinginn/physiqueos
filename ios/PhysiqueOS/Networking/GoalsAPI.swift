import Foundation

protocol GoalsAPI: Sendable {
    func fetchGoalsHub() async throws -> GoalsHubReadModel
    func fetchGoalDetail(goalId: String) async throws -> GoalDetailReadModel?
    func fetchGoalPhase(goalId: String, phaseId: String) async throws -> GoalPhaseDetailReadModel?
    func fetchGoalStrategy(goalId: String, focus: GoalPlanFocus) async throws -> GoalStrategyReadModel?
}

struct FixtureGoalsAPI: GoalsAPI {
    enum FixtureError: Error {
        case resourceNotFound
    }

    private struct FixtureFile: Codable {
        var activeGoal: ActiveGoalReadModel
        var completedGoals: [CompletedGoalReadModel]
        var addGoalAvailable: Bool
        var addGoalMessage: String
    }

    private func loadFixture() throws -> FixtureFile {
        guard let url = Bundle.main.url(forResource: "GoalsFixture", withExtension: "json") else {
            throw FixtureError.resourceNotFound
        }
        return try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: url))
    }

    func fetchGoalsHub() async throws -> GoalsHubReadModel {
        let fixture = try loadFixture()
        return GoalsHubReadModel(
            activeGoal: fixture.activeGoal.summary,
            completedGoals: fixture.completedGoals.map(\.summary),
            addGoalAvailable: fixture.addGoalAvailable,
            addGoalMessage: fixture.addGoalMessage
        )
    }

    func fetchGoalDetail(goalId: String) async throws -> GoalDetailReadModel? {
        let fixture = try loadFixture()
        if fixture.activeGoal.id == goalId {
            return GoalDetailReadModel(active: fixture.activeGoal, completed: nil)
        }
        if let completed = fixture.completedGoals.first(where: { $0.id == goalId }) {
            return GoalDetailReadModel(active: nil, completed: completed)
        }
        return nil
    }

    func fetchGoalPhase(goalId: String, phaseId: String) async throws -> GoalPhaseDetailReadModel? {
        let goal = try loadFixture().activeGoal
        guard goal.id == goalId, let phase = goal.phases.first(where: { $0.id == phaseId }) else {
            return nil
        }
        return GoalPhaseDetailReadModel(
            goalId: goal.id,
            goalTitle: goal.title,
            phase: phase,
            goalProgress: goal.goalProgress,
            confidence: goal.confidence,
            guardrail: goal.guardrail
        )
    }

    func fetchGoalStrategy(goalId: String, focus: GoalPlanFocus) async throws -> GoalStrategyReadModel? {
        let goal = try loadFixture().activeGoal
        guard goal.id == goalId else { return nil }
        return GoalStrategyReadModel(
            goalId: goal.id,
            goalTitle: goal.title,
            objective: goal.objective,
            focus: focus,
            items: goal.strategy,
            guardrail: goal.guardrail
        )
    }
}
