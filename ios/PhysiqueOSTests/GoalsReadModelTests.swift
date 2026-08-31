import XCTest
@testable import PhysiqueOS

final class GoalsReadModelTests: XCTestCase {
    private let api = FixtureGoalsAPI()

    func testGoalsLandingContainsActiveThenCompletedGoal() async throws {
        let hub = try await api.fetchGoalsHub()
        XCTAssertEqual(hub.activeGoal.title, "Build Lean Mass")
        XCTAssertEqual(hub.activeGoal.lifecycle, .active)
        XCTAssertEqual(hub.completedGoals.map(\.title), ["Visible Abs"])
        XCTAssertEqual(hub.orderedGoals.map(\.lifecycle), [.active, .completed])
    }

    func testAddGoalPreservesUnavailableProductionState() async throws {
        let hub = try await api.fetchGoalsHub()
        XCTAssertFalse(hub.addGoalAvailable)
        XCTAssertEqual(hub.addGoalMessage, "A new primary goal is not available right now.")
    }

    func testActiveGoalDetailPreservesObjectiveStatusAndWindow() async throws {
        let goal = try await activeGoal()
        XCTAssertEqual(goal.status, "Active Goal")
        XCTAssertTrue(goal.objective.contains("10 lb of lean mass"))
        XCTAssertFalse(goal.dateRange.isEmpty)
    }

    func testPhaseOneIsCompletedHistoryAndPhaseTwoIsActive() async throws {
        let goal = try await activeGoal()
        XCTAssertEqual(goal.orderedPhases.map(\.order), [1, 2])
        XCTAssertEqual(goal.orderedPhases[0].status, .completed)
        XCTAssertEqual(goal.orderedPhases[0].progress.percentage, 100)
        XCTAssertEqual(goal.orderedPhases[1].name, "Lean Mass Build")
        XCTAssertEqual(goal.orderedPhases[1].status, .active)
        XCTAssertEqual(goal.activePhase?.id, goal.orderedPhases[1].id)
    }

    func testGoalProgressConfidencePhaseProgressAndGuardrailRemainDistinct() async throws {
        let goal = try await activeGoal()
        let phase = try XCTUnwrap(goal.activePhase)
        XCTAssertEqual(goal.goalProgress.percentage, 27)
        XCTAssertEqual(goal.confidence.value, 68)
        XCTAssertEqual(phase.progress.percentage, 18)
        XCTAssertEqual(goal.guardrail.state, "On track")
        XCTAssertNotEqual(goal.goalProgress.percentage, goal.confidence.value)
        XCTAssertNotEqual(goal.goalProgress.percentage, phase.progress.percentage)
    }

    func testActiveGoalRetainsEveryWebBackedSection() async throws {
        let goal = try await activeGoal()
        XCTAssertFalse(goal.readiness.isEmpty)
        XCTAssertFalse(goal.guardrail.body.isEmpty)
        XCTAssertFalse(goal.evidence.date.isEmpty)
        XCTAssertFalse(goal.trainingProgress.comparisons.isEmpty)
        XCTAssertFalse(goal.turningPoints.isEmpty)
        XCTAssertEqual(goal.strategy.map(\.label), [
            "Energy", "Nutrition", "Activity", "Training",
            "Coaching Updates", "Peptide", "Supplement"
        ])
    }

    func testCompletedGoalRetainsRecapHighlightsPhotosCompositionAndUnlock() async throws {
        let goal = try await completedGoal()
        XCTAssertEqual(goal.status, "Completed")
        XCTAssertEqual(goal.highlights.count, 4)
        XCTAssertEqual(goal.photos.map(\.label), ["Beginning", "Completion"])
        XCTAssertFalse(goal.finalComposition.narrative.isEmpty)
        XCTAssertFalse(goal.achievedBy.isEmpty)
        XCTAssertEqual(goal.unlocked?.title, "Build Lean Mass")
    }

    func testGoalDetailLookupFailsClosed() async throws {
        let goal = try await api.fetchGoalDetail(goalId: "unknown")
        let phase = try await api.fetchGoalPhase(goalId: "unknown", phaseId: "unknown")
        let strategy = try await api.fetchGoalStrategy(goalId: "unknown", focus: .strategy)
        XCTAssertNil(goal)
        XCTAssertNil(phase)
        XCTAssertNil(strategy)
    }

    func testPhaseDetailPreservesGoalContextWithoutConflatingMeasures() async throws {
        let goal = try await activeGoal()
        let phase = try XCTUnwrap(goal.activePhase)
        let fetched = try await api.fetchGoalPhase(goalId: goal.id, phaseId: phase.id)
        let detail = try XCTUnwrap(fetched)
        XCTAssertEqual(detail.phase.status, .active)
        XCTAssertEqual(detail.goalProgress, goal.goalProgress)
        XCTAssertEqual(detail.confidence, goal.confidence)
        XCTAssertEqual(detail.guardrail, goal.guardrail)
    }

    func testStrategyAndProtocolRoutesReuseOneSourceReadModel() async throws {
        let goal = try await activeGoal()
        let fetchedStrategy = try await api.fetchGoalStrategy(goalId: goal.id, focus: .strategy)
        let fetchedProtocols = try await api.fetchGoalStrategy(goalId: goal.id, focus: .protocols)
        let strategy = try XCTUnwrap(fetchedStrategy)
        let protocols = try XCTUnwrap(fetchedProtocols)
        XCTAssertEqual(strategy.items, protocols.items)
        XCTAssertEqual(strategy.guardrail, protocols.guardrail)
        XCTAssertEqual(strategy.focus, .strategy)
        XCTAssertEqual(protocols.focus, .protocols)
    }

    func testGoalsDestinationsRoundTrip() throws {
        let destinations: [AppDestination] = [
            .goalDetail(goalId: "goal"),
            .goalPhase(goalId: "goal", phaseId: "phase"),
            .goalPlan(goalId: "goal", focus: .strategy),
            .goalPlan(goalId: "goal", focus: .protocols),
        ]
        for destination in destinations {
            let encoded = try JSONEncoder().encode(destination)
            XCTAssertEqual(try JSONDecoder().decode(AppDestination.self, from: encoded), destination)
        }
    }

    func testFixtureUsesSyntheticIdentityAndNaturalProductCopy() async throws {
        let hub = try await api.fetchGoalsHub()
        XCTAssertTrue(hub.activeGoal.id.contains("fixture"))
        let renderedCopy = (try await activeGoalCopy()).joined(separator: " ")
        for forbidden in ["server-owned", "canonical model", "production write", "device-only"] {
            XCTAssertFalse(renderedCopy.localizedCaseInsensitiveContains(forbidden))
        }
        for leaked in ["build_lean_mass", "goal_visible_abs_at_rest", "phase_fixture"] {
            XCTAssertFalse(renderedCopy.contains(leaked))
        }
    }

    private func activeGoal() async throws -> ActiveGoalReadModel {
        let hub = try await api.fetchGoalsHub()
        let detail = try await api.fetchGoalDetail(goalId: hub.activeGoal.id)
        return try XCTUnwrap(detail?.active)
    }

    private func completedGoal() async throws -> CompletedGoalReadModel {
        let hub = try await api.fetchGoalsHub()
        let id = try XCTUnwrap(hub.completedGoals.first?.id)
        let detail = try await api.fetchGoalDetail(goalId: id)
        return try XCTUnwrap(detail?.completed)
    }

    private func activeGoalCopy() async throws -> [String] {
        let goal = try await activeGoal()
        return [
            goal.title, goal.status, goal.objective, goal.goalProgress.label,
            goal.goalProgress.detail, goal.confidence.band, goal.confidence.explanation,
            goal.guardrail.title, goal.guardrail.state, goal.guardrail.scope, goal.guardrail.body,
        ] + goal.phases.flatMap { phase in
            [phase.name, phase.purpose, phase.progress.label, phase.progress.detail, phase.evidence]
                + phase.strategy + phase.successCriteria + phase.guardrails
        }
    }
}
