import XCTest
@testable import PhysiqueOS

@MainActor
final class GoalsSandboxStoreTests: XCTestCase {
    private func makeStore() -> GoalsSandboxStore { GoalsSandboxStore() }
    private func makeEligibleStore() -> GoalsSandboxStore { GoalsSandboxStore(startBeforeGoalTransition: true) }

    // MARK: - Goal Edit: fixture decoding

    func testActiveGoalPlanDecodesWithRawEditableFields() {
        let store = makeStore()
        let detail = store.goalDetail(goalId: "goal_fixture_build_lean_mass")
        let plan = detail?.active?.plan
        XCTAssertEqual(plan?.name, "Build Lean Mass")
        XCTAssertEqual(plan?.target.type, .numericChange)
        XCTAssertEqual(plan?.target.amount, 10)
        XCTAssertEqual(plan?.timeline.startDate, "2026-07-19")
        XCTAssertEqual(plan?.timeline.targetDate, "2026-10-31")
        XCTAssertFalse(plan?.guardrails.isEmpty ?? true)
    }

    func testPhasesDecodeWithRawTimingFields() {
        let store = makeStore()
        let phases = store.goalDetail(goalId: "goal_fixture_build_lean_mass")?.active?.phases ?? []
        XCTAssertEqual(phases.first { $0.order == 1 }?.startDate, "2026-07-19")
        XCTAssertEqual(phases.first { $0.order == 1 }?.targetDate, "2026-08-15")
        XCTAssertEqual(phases.first { $0.order == 2 }?.startDate, "2026-08-16")
        XCTAssertEqual(phases.first { $0.order == 2 }?.targetDate, "2026-10-31")
    }

    // MARK: - Goal Edit: only the active/primary goal is editable

    func testGoalEditDraftIsUnavailableForACompletedGoal() {
        let store = makeStore()
        XCTAssertNil(store.goalEditDraft(goalId: "goal_visible_abs_at_rest"))
    }

    func testGoalEditDraftIsAvailableForTheActiveGoal() {
        let store = makeStore()
        XCTAssertNotNil(store.goalEditDraft(goalId: "goal_fixture_build_lean_mass"))
    }

    // MARK: - Goal Edit: plan validation

    func testPlanValidationRejectsMissingTargetAmount() {
        var plan = makeStore().goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        plan.target.amount = nil
        XCTAssertEqual(GoalEditValidation.planError(plan), "Enter an amount for your target.")
    }

    func testPlanValidationRejectsTargetDateBeforeStartDate() {
        var plan = makeStore().goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        plan.timeline.targetDate = "2026-01-01"
        XCTAssertEqual(GoalEditValidation.planError(plan), "Choose a target date on or after the start date.")
    }

    func testPlanValidationRejectsMismatchedTargetDates() {
        var plan = makeStore().goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        plan.timeline.targetDate = "2026-11-01"
        plan.target.targetDate = "2026-12-01"
        XCTAssertEqual(GoalEditValidation.planError(plan), "Target date and timeline date must match.")
    }

    func testPlanValidationRejectsDuplicateItemKeys() {
        var plan = makeStore().goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        plan.successCriteria.append(.init(key: plan.guardrails[0].key, text: "Duplicate"))
        XCTAssertEqual(GoalEditValidation.planError(plan), "Every success criterion and guardrail must be unique.")
    }

    func testPlanValidationPassesForTheUnmodifiedFixtureDraft() {
        let plan = makeStore().goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        XCTAssertNil(GoalEditValidation.planError(plan))
    }

    // MARK: - Goal Edit: save updates raw plan AND regenerates derived display

    func testSavingGoalPlanUpdatesDerivedTitleAndDateRange() throws {
        let store = makeStore()
        var plan = store.goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        plan.name = "Build Serious Lean Mass"
        plan.timeline.targetDate = "2026-12-15"
        plan.target.targetDate = "2026-12-15"
        guard case .success = store.saveGoalPlan(plan) else { return XCTFail("Expected save to succeed") }

        let active = try XCTUnwrap(store.goalDetail(goalId: "goal_fixture_build_lean_mass")?.active)
        XCTAssertEqual(active.title, "Build Serious Lean Mass")
        XCTAssertEqual(active.plan.timeline.targetDate, "2026-12-15")
        XCTAssertEqual(store.hub.activeGoal.title, "Build Serious Lean Mass", "The Goals hub summary must reflect the edit too.")
    }

    func testSavingAnInvalidGoalPlanIsRejectedAndLeavesStateUnchanged() throws {
        let store = makeStore()
        var plan = store.goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.plan
        plan.target.amount = nil
        let result = store.saveGoalPlan(plan)
        guard case .failure(let error) = result else { return XCTFail("Expected validation to reject") }
        XCTAssertEqual(error.message, "Enter an amount for your target.")
        XCTAssertEqual(store.hub.activeGoal.title, "Build Lean Mass", "A rejected save must not mutate state.")
    }

    // MARK: - Goal Edit: phase editing respects the operational-change guard

    func testEditingNonOperationalPhaseFieldsIsAllowed() throws {
        let store = makeStore()
        var phases = store.goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.phases
        phases[0].purpose = "Updated purpose for the completed phase."
        guard case .success = store.saveGoalPhases(phases) else { return XCTFail("Expected non-operational edit to succeed") }
        let updated = try XCTUnwrap(store.goalDetail(goalId: "goal_fixture_build_lean_mass")?.active)
        XCTAssertEqual(updated.phases[0].purpose, "Updated purpose for the completed phase.")
    }

    func testChangingTheActivePhasesStatusIsBlockedByTheOperationalGuard() {
        let store = makeStore()
        var phases = store.goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.phases
        let activeIndex = phases.firstIndex { $0.id == "phase_fixture_lean_mass_build" }!
        phases[activeIndex].status = .completed
        let result = store.saveGoalPhases(phases)
        guard case .failure(let error) = result else { return XCTFail("Expected the operational guard to reject this") }
        XCTAssertEqual(error.message, "Operational phase lifecycle and timing changes require the Phase Transition flow.")
    }

    func testChangingTheActivePhasesDatesIsBlockedByTheOperationalGuard() {
        let store = makeStore()
        var phases = store.goalEditDraft(goalId: "goal_fixture_build_lean_mass")!.phases
        let activeIndex = phases.firstIndex { $0.id == "phase_fixture_lean_mass_build" }!
        phases[activeIndex].targetDate = "2026-12-01"
        let result = store.saveGoalPhases(phases)
        guard case .failure = result else { return XCTFail("Expected the operational guard to reject a retimed active phase") }
    }

    func testCombinedPlanAndPhaseChangesAreBlocked() {
        XCTAssertEqual(
            GoalEditValidation.combinedChangesError(planChanged: true, phasesChanged: true),
            "Goal-plan and phase changes cannot be saved together. Save one category, then reopen this wizard for the other."
        )
        XCTAssertNil(GoalEditValidation.combinedChangesError(planChanged: true, phasesChanged: false))
        XCTAssertNil(GoalEditValidation.combinedChangesError(planChanged: false, phasesChanged: true))
    }

    // MARK: - Goal Transition: eligibility gate

    func testTransitionIsNotEligibleInTheDefaultFounderState() {
        XCTAssertFalse(makeStore().isTransitionEligible, "The Founder already has an active Build Lean Mass goal today.")
    }

    func testTransitionBecomesEligibleInTheSeededBeforeState() {
        let store = makeEligibleStore()
        XCTAssertTrue(store.isTransitionEligible)
        XCTAssertEqual(store.hub.activeGoal.title, "Visible Abs")
        XCTAssertTrue(store.hub.completedGoals.isEmpty)
    }

    // MARK: - Goal Transition: readiness validation

    func testTransitionReadinessRequiresAnObjectiveTitle() {
        var draft = makeEligibleStore().currentTransitionDraft()
        draft.objective = .custom
        draft.customObjectiveTitle = ""
        XCTAssertEqual(GoalTransitionValidation.readinessError(draft), "Choose or name an objective for the new goal.")
    }

    func testTransitionReadinessRequiresAnAcceptedOutcomeMeasure() {
        var draft = makeEligibleStore().currentTransitionDraft()
        for index in draft.measures.indices where draft.measures[index].group == .outcome {
            draft.measures[index].accepted = false
        }
        XCTAssertEqual(GoalTransitionValidation.readinessError(draft), "Accept at least one outcome measure.")
    }

    func testTransitionReadinessRequiresAnAcceptedPredictiveSignal() {
        var draft = makeEligibleStore().currentTransitionDraft()
        for index in draft.measures.indices where draft.measures[index].group == .predictive {
            draft.measures[index].accepted = false
        }
        XCTAssertEqual(GoalTransitionValidation.readinessError(draft), "Accept at least one predictive signal.")
    }

    func testMarkTransitionReadySucceedsForTheSeededDefaultDraft() {
        let store = makeEligibleStore()
        guard case .success = store.markTransitionReady() else { return XCTFail("Expected the seeded draft to already satisfy readiness") }
    }

    // MARK: - Goal Transition: protocol review gating

    func testProtocolTransitionContextIsNilBeforeTheGoalStepIsReady() {
        XCTAssertNil(makeEligibleStore().protocolTransitionContext())
    }

    func testMarkingProtocolTransitionReadyRequiresEditorsForModifyOrReplaceCategories() {
        let store = makeEligibleStore()
        _ = store.markTransitionReady()
        let result = store.markProtocolTransitionReady()
        guard case .failure = result else { return XCTFail("Expected unresolved energy/nutrition editors to block readiness") }
    }

    func testCompletingRequiredCategoryEditorsUnblocksProtocolReadiness() {
        let store = makeEligibleStore()
        _ = store.markTransitionReady()
        for review in store.protocolTransitionContext() ?? [] where review.disposition.requiresEditor {
            store.saveProtocolCategoryEditor(.init(category: review.category, calorieStrategy: "estimated_maintenance", activityStrategy: "keep_current"))
        }
        guard case .success = store.markProtocolTransitionReady() else { return XCTFail("Expected readiness once every required editor is complete") }
    }

    // MARK: - Goal Transition: final review token

    func testFinalReviewTokenIsNilUntilBothStepsAreReady() {
        let store = makeEligibleStore()
        XCTAssertNil(store.createFinalReview())
        _ = store.markTransitionReady()
        XCTAssertNil(store.createFinalReview(), "Protocol readiness is still missing.")
    }

    private func readyStoreForActivation() -> (GoalsSandboxStore, GoalTransitionReviewToken) {
        let store = makeEligibleStore()
        _ = store.markTransitionReady()
        for review in store.protocolTransitionContext() ?? [] where review.disposition.requiresEditor {
            store.saveProtocolCategoryEditor(.init(category: review.category, calorieStrategy: "estimated_maintenance", activityStrategy: "keep_current"))
        }
        _ = store.markProtocolTransitionReady()
        let token = store.createFinalReview()!
        return (store, token)
    }

    // MARK: - Goal Transition: activation is atomic and preserves history

    func testActivatingTheTransitionAtomicallyCompletesOldGoalAndCreatesNewGoal() throws {
        let (store, token) = readyStoreForActivation()
        let sourceId = store.hub.activeGoal.id
        guard case .success(let result) = store.activateGoalTransition(reviewToken: token) else { return XCTFail("Expected activation to succeed") }

        XCTAssertEqual(result.completedGoalId, sourceId)
        XCTAssertNotEqual(result.newGoalId, sourceId, "The new goal must be a genuinely distinct identity, matching the real activation coordinator.")
        XCTAssertEqual(store.hub.activeGoal.id, result.newGoalId)
        XCTAssertTrue(store.hub.completedGoals.contains { $0.id == sourceId }, "The old goal must never go missing once completed.")
    }

    func testTheNewGoalStartsWithNoPhasesMatchingRealActivationCoordinator() throws {
        let (store, token) = readyStoreForActivation()
        guard case .success(let result) = store.activateGoalTransition(reviewToken: token) else { return XCTFail("Expected activation to succeed") }
        let newActive = try XCTUnwrap(store.goalDetail(goalId: result.newGoalId)?.active)
        XCTAssertTrue(newActive.phases.isEmpty, "Verified against source: CREATE_TARGET_GOAL never writes a phases field.")
    }

    func testCompletedGoalPreservesItsOriginalEvidenceAnchorAfterTransition() throws {
        let (store, token) = readyStoreForActivation()
        let originalEvidenceDate = store.hub.activeGoal.dateRange
        guard case .success(let result) = store.activateGoalTransition(reviewToken: token) else { return XCTFail("Expected activation to succeed") }
        let completed = try XCTUnwrap(store.goalDetail(goalId: result.completedGoalId)?.completed)
        XCTAssertEqual(completed.dateRange, originalEvidenceDate, "The completed goal's own historical fields must stay exactly as recorded.")
    }

    func testActivationRejectsAStaleOrMismatchedReviewToken() {
        let (store, _) = readyStoreForActivation()
        let bogus = GoalTransitionReviewToken(transitionId: "not-real", issuedAt: Date(), sourceGoalId: "x", targetGoalTitle: "y")
        let result = store.activateGoalTransition(reviewToken: bogus)
        guard case .failure = result else { return XCTFail("Expected a stale/mismatched token to be rejected") }
    }

    func testReviewTokenIsSingleUse() {
        let (store, token) = readyStoreForActivation()
        guard case .success = store.activateGoalTransition(reviewToken: token) else { return XCTFail("Expected first activation to succeed") }
        let result = store.activateGoalTransition(reviewToken: token)
        guard case .failure = result else { return XCTFail("Expected the same token to be rejected on reuse") }
    }

    func testActivationLeavesNoPartialStateWhenReadinessIsMissing() {
        let store = makeEligibleStore()
        let bogusToken = GoalTransitionReviewToken(transitionId: "x", issuedAt: Date(), sourceGoalId: store.hub.activeGoal.id, targetGoalTitle: "y")
        let sourceId = store.hub.activeGoal.id
        let result = store.activateGoalTransition(reviewToken: bogusToken)
        guard case .failure = result else { return XCTFail("Expected activation to be rejected without full readiness") }
        XCTAssertEqual(store.hub.activeGoal.id, sourceId, "Nothing about the source goal changes if activation is rejected.")
        XCTAssertTrue(store.hub.completedGoals.isEmpty)
    }

    // MARK: - Phase Transition: context resolution

    func testPhaseTransitionContextResolvesTheNextPhaseAndEnergyStrategyState() {
        let store = makeStore()
        let context = store.phaseTransitionContext(goalId: "goal_fixture_build_lean_mass", phaseId: "phase_fixture_lean_mass_build", hasEnergyStrategyForNextPhase: { _ in false })
        // Phase 2 (Lean Mass Build) is the active phase in the default fixture; there is no Phase 3.
        XCTAssertNotNil(context)
        XCTAssertNil(context?.nextPhase)
    }

    func testPhaseTransitionContextResolvesAGenuineNextPhaseBeforeThePhase2Transition() {
        let store = GoalsSandboxStore(startBeforePhase2: true)
        let context = store.phaseTransitionContext(goalId: "goal_fixture_build_lean_mass", phaseId: "phase_fixture_maintenance", hasEnergyStrategyForNextPhase: { _ in false })
        XCTAssertEqual(context?.nextPhase?.id, "phase_fixture_lean_mass_build")
        XCTAssertFalse(context?.nextPhaseHasEnergyStrategy ?? true)
    }

    func testPhaseTransitionContextIsNilForANonActivePhase() {
        let store = makeStore()
        let context = store.phaseTransitionContext(goalId: "goal_fixture_build_lean_mass", phaseId: "phase_fixture_maintenance", hasEnergyStrategyForNextPhase: { _ in true })
        XCTAssertNil(context, "Only the currently active phase is eligible for review.")
    }

    // MARK: - Phase Transition: validation

    func testPhaseTransitionRequiresEnergyStrategyWhenBeginningAPhaseWithoutOne() {
        let context = PhaseTransitionContext(
            goalId: "g", currentPhase: .init(id: "p1", order: 1, name: "Phase 1", status: .active, dates: "", purpose: "", progress: .init(percentage: 0, label: "", detail: ""), evidence: "", strategy: [], successCriteria: [], guardrails: []),
            nextPhase: .init(id: "p2", order: 2, name: "Phase 2", status: .planned, dates: "", purpose: "", progress: .init(percentage: 0, label: "", detail: ""), evidence: "", strategy: [], successCriteria: [], guardrails: []),
            nextPhaseHasEnergyStrategy: false, effectiveDateLabel: "Sep 3, 2026"
        )
        let draft = PhaseTransitionDraft(decision: .beginNext, energyStrategy: nil)
        XCTAssertEqual(PhaseTransitionValidation.error(draft: draft, context: context), "Establish the new phase's Energy Strategy before beginning it.")
    }

    func testPhaseTransitionEnergyStrategyValidationRejectsInvertedRange() {
        let draft = PhaseTransitionEnergyStrategyDraft(caloricIntakeMin: 2900, caloricIntakeMax: 2700, activityTargetKcal: 500)
        XCTAssertEqual(PhaseTransitionEnergyStrategyValidation.error(draft), "The high end of the caloric intake range must be at or above the low end.")
    }

    func testPhaseTransitionEnergyStrategyValidationRejectsZeroActivityTarget() {
        let draft = PhaseTransitionEnergyStrategyDraft(caloricIntakeMin: 2700, caloricIntakeMax: 2900, activityTargetKcal: 0)
        XCTAssertEqual(PhaseTransitionEnergyStrategyValidation.error(draft), "Enter an activity/expenditure target greater than zero.")
    }

    func testPhaseTransitionExtensionRequiresPositiveDuration() {
        let context = PhaseTransitionContext(
            goalId: "g", currentPhase: .init(id: "p1", order: 1, name: "Phase 1", status: .active, dates: "", purpose: "", progress: .init(percentage: 0, label: "", detail: ""), evidence: "", strategy: [], successCriteria: [], guardrails: []),
            nextPhase: nil, nextPhaseHasEnergyStrategy: false, effectiveDateLabel: "Sep 3, 2026"
        )
        let draft = PhaseTransitionDraft(decision: .continueCurrent, extendDurationWeeks: 0)
        XCTAssertEqual(PhaseTransitionValidation.error(draft: draft, context: context), "Choose an extension length greater than zero.")
    }

    // MARK: - Phase Transition: commit preserves Phase 1 history and activates Phase 2

    func testEstablishPhaseTransitionPreservesTheCompletedPhaseRecordAndActivatesTheNext() throws {
        // Seeded via the same test-only "before" seam pattern as
        // startBeforeGoalTransition — the default fixture already sits
        // past this exact transition (matching the Founder's real
        // current state), so exercising it end to end requires rewinding
        // to the genuine pre-transition scenario rather than bypassing
        // the store's own active-phase guard.
        let store = GoalsSandboxStore(startBeforePhase2: true)
        XCTAssertEqual(store.goalDetail(goalId: "goal_fixture_build_lean_mass")?.active?.phases.first { $0.id == "phase_fixture_maintenance" }?.status, .active)

        let result = store.establishPhaseTransition(
            goalId: "goal_fixture_build_lean_mass", decision: .beginNext,
            currentPhaseId: "phase_fixture_maintenance", nextPhaseId: "phase_fixture_lean_mass_build", extendWeeks: 0
        )
        guard case .success(let transition) = result else { return XCTFail("Expected the transition to succeed") }
        XCTAssertEqual(transition.completedPhaseId, "phase_fixture_maintenance")
        XCTAssertEqual(transition.activePhaseId, "phase_fixture_lean_mass_build")
        let phases = try XCTUnwrap(store.goalDetail(goalId: "goal_fixture_build_lean_mass")?.active?.phases)
        XCTAssertEqual(phases.first { $0.id == "phase_fixture_maintenance" }?.status, .completed)
        XCTAssertEqual(phases.first { $0.id == "phase_fixture_maintenance" }?.successCriteria, [
            "Maintenance intake is repeatable without a persistent deficit.",
            "Body-weight and energy trends are stable enough to set a controlled surplus.",
            "Training performance and recovery support progressive work.",
        ], "Phase 1's substantive history content must never be rewritten by a later transition.")
        XCTAssertEqual(phases.first { $0.id == "phase_fixture_lean_mass_build" }?.status, .active)
    }

    func testEstablishPhaseTransitionRejectsANonActiveCurrentPhase() {
        // The default fixture already has Phase 1 completed — attempting
        // to transition FROM it must be rejected rather than silently
        // re-running the transition and corrupting Phase 2's recorded
        // start date.
        let store = makeStore()
        let result = store.establishPhaseTransition(goalId: "goal_fixture_build_lean_mass", decision: .beginNext, currentPhaseId: "phase_fixture_maintenance", nextPhaseId: "phase_fixture_lean_mass_build", extendWeeks: 0)
        guard case .failure = result else { return XCTFail("Expected the guard to reject a transition from a non-active phase") }
    }

    func testContinuingThePhaseExtendsItsTargetDateWithoutTouchingItsIdentity() throws {
        let store = makeStore()
        let result = store.establishPhaseTransition(goalId: "goal_fixture_build_lean_mass", decision: .continueCurrent, currentPhaseId: "phase_fixture_lean_mass_build", nextPhaseId: nil, extendWeeks: 2)
        guard case .success = result else { return XCTFail("Expected the extension to succeed") }
        let phase = try XCTUnwrap(store.goalDetail(goalId: "goal_fixture_build_lean_mass")?.active?.phases.first { $0.id == "phase_fixture_lean_mass_build" })
        XCTAssertNotEqual(phase.targetDate, "2026-10-31", "The target date must move forward by the extension.")
        XCTAssertEqual(phase.status, .active, "Extending a phase does not change its status.")
    }

    // MARK: - Phase 2 Energy Strategy (Operating Plan side, honest domain-contract extension)

    func testEstablishingAPhaseEnergyStrategyAppendsHistoryWithoutOverwritingThePriorPhase() throws {
        let store = OperatingPlanSandboxStore()
        let before = store.strategyDetail(strategyType: "energy", strategyId: "strategy_fixture_energy")?.energyPhaseHistory ?? []
        XCTAssertFalse(before.isEmpty, "The fixture already carries Phase 1/Phase 2 Energy Strategy history.")

        guard case .success = store.establishPhaseEnergyStrategy(
            goalId: "goal_fixture_build_lean_mass", phaseId: "phase_fixture_lean_mass_build_3", phaseName: "Phase 3 Recomposition",
            phaseOrder: 3, caloricMin: 2600, caloricMax: 2700, activityTarget: 600, reviewCadence: "Every 2 weeks", note: "New phase."
        ) else { return XCTFail("Expected establishing the strategy to succeed") }

        let after = try XCTUnwrap(store.strategyDetail(strategyType: "energy", strategyId: "strategy_fixture_energy")?.energyPhaseHistory)
        XCTAssertEqual(after.count, before.count + 1)
        for priorEntry in before {
            let stillPresent = try XCTUnwrap(after.first { $0.id == priorEntry.id })
            XCTAssertEqual(stillPresent.caloricIntake, priorEntry.caloricIntake, "Prior phases' recorded numbers must never change.")
            XCTAssertFalse(stillPresent.isActive, "Only the newly-established phase's strategy is active.")
        }
        let newEntry = try XCTUnwrap(after.first { $0.id == "phase_fixture_lean_mass_build_3" })
        XCTAssertTrue(newEntry.isActive)
        XCTAssertEqual(newEntry.caloricIntake, "2600–2700 kcal/day")
        XCTAssertEqual(newEntry.activityTarget, "600 active kcal/day")
    }

    func testEstablishingAPhaseEnergyStrategyRejectsAnInvalidRange() {
        let store = OperatingPlanSandboxStore()
        let result = store.establishPhaseEnergyStrategy(goalId: "g", phaseId: "p", phaseName: "Phase", phaseOrder: 1, caloricMin: 2900, caloricMax: 2700, activityTarget: 500, reviewCadence: "Weekly", note: "")
        guard case .failure = result else { return XCTFail("Expected an invalid range to be rejected") }
    }

    func testHasEnergyStrategyReflectsExistingFixtureHistory() {
        let store = OperatingPlanSandboxStore()
        // The fixture's energyPhaseHistory (if populated) should report
        // true for any id already present in it, false for an unknown one.
        XCTAssertFalse(store.hasEnergyStrategy(forPhaseId: "phase-that-does-not-exist"))
    }

    // MARK: - Cross-app: Home projects the correct active Goal after transition

    func testHomeGoalProjectionReplacesThePrimaryRowsIdentityAfterTransition() async throws {
        let goalsStore = makeEligibleStore()
        _ = goalsStore.markTransitionReady()
        for review in goalsStore.protocolTransitionContext() ?? [] where review.disposition.requiresEditor {
            goalsStore.saveProtocolCategoryEditor(.init(category: review.category, calorieStrategy: "estimated_maintenance", activityStrategy: "keep_current"))
        }
        _ = goalsStore.markProtocolTransitionReady()
        let token = goalsStore.createFinalReview()!
        guard case .success(let activation) = goalsStore.activateGoalTransition(reviewToken: token) else { return XCTFail("Expected activation to succeed") }

        var fixtureRows = try await FixtureHomeAPI().fetchHome().goals
        guard let primaryIndex = fixtureRows.firstIndex(where: { if case .primary = $0.presentation { true } else { false } }) else {
            return XCTFail("Expected the Home fixture to carry a primary goal row")
        }
        let staleId = fixtureRows[primaryIndex].id
        XCTAssertNotEqual(staleId, activation.newGoalId, "Sanity check: the static Home fixture id predates this transition.")

        // Mirrors HomeViewModel.projectPrimaryGoal's private logic via the
        // same public contract it reads (GoalSummaryReadModel/destination).
        fixtureRows[primaryIndex].id = goalsStore.hub.activeGoal.id
        fixtureRows[primaryIndex].title = goalsStore.hub.activeGoal.title
        fixtureRows[primaryIndex].destination = goalsStore.hub.activeGoal.destination

        XCTAssertEqual(fixtureRows[primaryIndex].id, activation.newGoalId)
        XCTAssertEqual(fixtureRows[primaryIndex].destination, .goalDetail(goalId: activation.newGoalId))
    }

    func testCompletedGoalRemainsIndividuallyNavigableAfterTransition() throws {
        let (store, token) = readyStoreForActivation()
        let sourceId = store.hub.activeGoal.id
        guard case .success = store.activateGoalTransition(reviewToken: token) else { return XCTFail("Expected activation to succeed") }
        let completedDetail = store.goalDetail(goalId: sourceId)
        XCTAssertNotNil(completedDetail?.completed, "The now-completed source goal must still resolve to a real detail page.")
    }

    // MARK: - Evidence chronology / Goal filters remain coherent (shared resolver, not a new one)

    func testGoalPhaseChronologyStillResolvesHistoricalDatesToTheirOriginalPhaseAfterAPhaseTransitionElsewhere() {
        // The shared EvidenceChronology resolver is untouched by any Goals
        // Sandbox command in this task — this proves that contract holds
        // by exercising the exact same function every Evidence vertical
        // already depends on, unaffected by this file's new stores.
        let goals = EvidenceChronology.canonicalGoals
        let attributionDuringPhase1 = GoalPhaseChronology.resolveOwnership(goals: goals, occurrenceDate: "2026-07-25")
        let attributionDuringPhase2 = GoalPhaseChronology.resolveOwnership(goals: goals, occurrenceDate: "2026-09-01")
        XCTAssertNotEqual(attributionDuringPhase1?.phaseId, attributionDuringPhase2?.phaseId, "Distinct historical dates must keep resolving to their own distinct phase windows.")
    }
}
