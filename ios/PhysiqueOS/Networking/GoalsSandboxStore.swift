import Foundation

struct GoalsSandboxError: Error, Equatable, LocalizedError {
    var message: String
    var errorDescription: String? { message }
}

/// Local-only mutable state for the fixture-backed Goals vertical,
/// mirroring `OperatingPlanSandboxStore`/`LoggingSandboxStore`'s
/// established role: loads the bundled fixture once, then Goal Edit,
/// Goal Transition, and Phase Transition commands mutate this in-memory
/// copy only. Nothing here reaches a server — a future live `GoalsAPI`
/// replaces this store's reads with authenticated ones and its commands
/// with real command-boundary calls, with no change required to the
/// screens that consume it.
///
/// Command boundaries mirror the real web services this was audited
/// against: `saveGoalPlan`/`saveGoalPhases` ↔ `GoalPlanUpdateService`/
/// `GoalPhasePersistenceService`; `saveTransitionDraft`/
/// `markTransitionReady`/`activateGoalTransition` ↔
/// `GoalTransitionService`/`ProductionGoalTransitionActivationService`/
/// `GoalTransitionActivationCoordinator`; `establishPhaseTransition` is
/// the honest, disclosed extension of `PhaseReviewCommitParticipants` (see
/// `GoalsSandboxModel.swift`'s Phase Transition doc comment for why this
/// goes beyond current web behavior).
@Observable
final class GoalsSandboxStore {
    private(set) var hub: GoalsHubReadModel
    private var activeGoal: ActiveGoalReadModel
    private var completedGoals: [CompletedGoalReadModel]
    private let supportingObjectives: [SupportingObjectiveReadModel]
    private(set) var addGoalAvailable: Bool
    private var addGoalMessage: String

    private var transitionDraft: GoalTransitionDraft
    private var protocolEditorDrafts: [String: ProtocolCategoryEditorDraft] = [:]
    private var transitionReady = false
    private var protocolTransitionReady = false
    private var issuedReviewToken: GoalTransitionReviewToken?

    /// Test-only seam: the fixture always ships in the Founder's real
    /// current state (Visible Abs already completed, Build Lean Mass
    /// already active, `addGoalAvailable: false`) — this is the one way
    /// to exercise the genuinely-eligible-for-transition path the real
    /// `ProductionGoalTransitionEntryPointService` gate exists for.
    /// Test-only seam: the fixture always ships already past the real
    /// Phase 1 → Phase 2 transition (matching the Founder's real current
    /// state) — this rewinds Phase 2 to `.planned` and Phase 1 back to
    /// `.active` so the transition can be genuinely exercised end to end,
    /// the same rationale as `startBeforeGoalTransition` above.
    init(bundle: Bundle = .main, startBeforeGoalTransition: Bool = false, startBeforePhase2: Bool = false) {
        guard let url = bundle.url(forResource: "GoalsFixture", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let fixture = try? JSONDecoder().decode(GoalsFixtureFile.self, from: data)
        else {
            fatalError("GoalsFixture.json is missing or malformed — it ships in the app bundle and must always decode.")
        }
        self.activeGoal = fixture.activeGoal
        self.completedGoals = fixture.completedGoals
        self.supportingObjectives = fixture.supportingObjectives
        self.addGoalAvailable = fixture.addGoalAvailable
        self.addGoalMessage = fixture.addGoalMessage
        self.transitionDraft = GoalsSandboxStore.seedTransitionDraft()
        self.hub = GoalsHubReadModel(
            activeGoal: fixture.activeGoal.summary,
            completedGoals: fixture.completedGoals.map(\.summary),
            addGoalAvailable: fixture.addGoalAvailable,
            addGoalMessage: fixture.addGoalMessage
        )

        if startBeforeGoalTransition {
            seedPreTransitionState()
        }
        if startBeforePhase2 {
            seedPrePhase2State()
        }
    }

    // MARK: - Reads (mirror FixtureGoalsAPI)

    func goalDetail(goalId: String) -> GoalDetailReadModel? {
        if activeGoal.id == goalId { return GoalDetailReadModel(active: activeGoal, completed: nil, supporting: nil) }
        if let completed = completedGoals.first(where: { $0.id == goalId }) {
            return GoalDetailReadModel(active: nil, completed: completed, supporting: nil)
        }
        if let supporting = supportingObjectives.first(where: { $0.id == goalId }) {
            return GoalDetailReadModel(active: nil, completed: nil, supporting: supporting)
        }
        return nil
    }

    // MARK: - Goal Edit

    /// `getGoalEditCapability`-equivalent: only the active, primary goal
    /// is editable — mirrors `page.js`'s `status !== "active" || !primary`
    /// gate exactly.
    func goalEditDraft(goalId: String) -> GoalEditDraft? {
        guard activeGoal.id == goalId else { return nil }
        return GoalEditDraft(plan: activeGoal.plan, phases: activeGoal.phases, activePhaseId: activeGoal.activePhaseId)
    }

    /// `saveGoalEditChanges` → `ProductionGoalPlanUpdateService.commit`.
    /// Only plan-shaped fields change; identity/status/phases are
    /// untouched (mirrors the real allowlist transaction guard) and every
    /// derived presentation field is regenerated from the new plan.
    @discardableResult
    func saveGoalPlan(_ plan: GoalPlanReadModel) -> Result<Void, GoalsSandboxError> {
        if let error = GoalEditValidation.planError(plan) { return .failure(.init(message: error)) }
        activeGoal.plan = plan
        activeGoal.title = plan.name
        activeGoal.objective = plan.primaryOutcome.isEmpty ? plan.purpose : plan.primaryOutcome
        activeGoal.dateRange = Self.dateRangeLabel(start: plan.timeline.startDate, end: plan.timeline.targetDate)
        activeGoal.guardrail.body = plan.guardrails.map(\.text).joined(separator: " · ")
        hub.activeGoal = activeGoal.summary
        return .success(())
    }

    /// `saveGoalPhaseChanges` → `ProductionGoalPhasePersistenceService.commit`.
    /// Rejects with the same message the real `PHASE_REVIEW_COORDINATOR_
    /// REQUIRED` guard produces if the proposed phases would alter which
    /// phase is active or retime it — that must go through
    /// `establishPhaseTransition` instead.
    @discardableResult
    func saveGoalPhases(_ phases: [GoalPhaseReadModel]) -> Result<Void, GoalsSandboxError> {
        if let error = GoalEditValidation.phasesError(current: activeGoal.phases, proposed: phases, activePhaseId: activeGoal.activePhaseId) {
            return .failure(.init(message: error))
        }
        activeGoal.phases = phases
        hub.activeGoal = activeGoal.summary
        return .success(())
    }

    // MARK: - Goal Transition — Route A (`/goals/transition`)

    /// `ProductionGoalTransitionEntryPointService` — real eligibility gate.
    var isTransitionEligible: Bool { addGoalAvailable }

    func currentTransitionDraft() -> GoalTransitionDraft { transitionDraft }

    /// `saveLiveGoalTransitionSection` — merges a section's edits into the
    /// persistent draft; every "Next" click on web calls this.
    func saveTransitionDraft(_ draft: GoalTransitionDraft) {
        transitionDraft = draft
    }

    /// `markReadyAction` → `GoalTransitionService.markReady`.
    @discardableResult
    func markTransitionReady() -> Result<Void, GoalsSandboxError> {
        if let error = GoalTransitionValidation.readinessError(transitionDraft) { return .failure(.init(message: error)) }
        transitionDraft.isReady = true
        transitionReady = true
        return .success(())
    }

    // MARK: - Goal Transition — Route B/C (`/goals/transition/protocols[/edit/:category]`)

    func protocolTransitionContext() -> [GoalTransitionProtocolReview]? {
        guard transitionReady else { return nil }
        return transitionDraft.protocolReviews
    }

    func protocolEditorDraft(category: ProtocolTransitionCategory) -> ProtocolCategoryEditorDraft {
        protocolEditorDrafts[category.rawValue] ?? ProtocolCategoryEditorDraft(category: category)
    }

    /// `saveLiveTransitionProtocolDraft` → `GoalProtocolTransitionService.saveProtocolDraft`.
    func saveProtocolCategoryEditor(_ draft: ProtocolCategoryEditorDraft) {
        var completed = draft
        completed.isComplete = true
        protocolEditorDrafts[draft.category.rawValue] = completed
        if let index = transitionDraft.protocolReviews.firstIndex(where: { $0.category == draft.category }) {
            transitionDraft.protocolReviews[index].edited = true
        }
    }

    /// `markLiveProtocolTransitionReady`. Every category whose disposition
    /// `requiresEditor` must have a completed editor draft first.
    @discardableResult
    func markProtocolTransitionReady() -> Result<Void, GoalsSandboxError> {
        let unresolved = transitionDraft.protocolReviews.filter { review in
            review.disposition.requiresEditor && !(protocolEditorDrafts[review.id]?.isComplete ?? false)
        }
        guard unresolved.isEmpty else {
            return .failure(.init(message: "Finish reviewing \(unresolved.map(\.category.label).joined(separator: ", ")) before continuing."))
        }
        protocolTransitionReady = true
        return .success(())
    }

    // MARK: - Goal Transition — Route D/E (final review + activation)

    /// `createFinalReview` — mints a single-use review token, mirroring
    /// the real TTL/binding-fingerprint pattern's *intent* (single-use,
    /// scoped to this draft) without the full multi-actor token
    /// infrastructure a single-device fixture app doesn't need.
    func createFinalReview() -> GoalTransitionReviewToken? {
        guard transitionReady, protocolTransitionReady else { return nil }
        let token = GoalTransitionReviewToken(
            transitionId: "transition_\(UUID().uuidString.prefix(8))",
            issuedAt: Date(),
            sourceGoalId: activeGoal.id,
            targetGoalTitle: transitionDraft.objectiveTitle
        )
        issuedReviewToken = token
        return token
    }

    func finalReviewSummary() -> GoalTransitionReviewSummary {
        GoalTransitionReviewSummary(
            openingPhaseLabel: "Maintenance calibration",
            guardrailSummary: transitionDraft.guardrails.filter(\.accepted).map(\.title).joined(separator: " · "),
            coachingCadenceSummary: "\(transitionDraft.cadence.label) · \(transitionDraft.cadenceDays.map(\.shortLabel).joined(separator: ", "))",
            protocolsPreparedCount: transitionDraft.protocolReviews.filter { $0.disposition != .remove }.count,
            commitmentsSummary: "\(transitionDraft.supportingPriorities.map(\.label).joined(separator: ", ")) prioritized",
            reminderIntentsSummary: "\(transitionDraft.protocolReviews.count) execution reminders will be generated"
        )
    }

    /// `activateProductionGoalTransition` → `GoalTransitionActivationCoordinator.execute`.
    /// ATOMIC: validates everything, THEN commits the old-goal-completion
    /// and new-goal-creation together — never one without the other. The
    /// new goal starts with NO phases (verified against source: the real
    /// activation coordinator's `CREATE_TARGET_GOAL` payload never writes
    /// a `phases` field), matching the confirmed fact that Goal Transition
    /// and Phase Transition are separate, uncoupled mechanisms. Evidence,
    /// Priorities, and Briefing history for the completed goal are never
    /// touched — this store has no method that could touch them.
    @discardableResult
    func activateGoalTransition(reviewToken: GoalTransitionReviewToken) -> Result<GoalTransitionActivationResult, GoalsSandboxError> {
        guard let issued = issuedReviewToken, issued == reviewToken else {
            return .failure(.init(message: "This review changed while you were confirming it. Review the latest version and try again."))
        }
        guard transitionReady, protocolTransitionReady else {
            return .failure(.init(message: "Finish preparing the goal and protocols before activating."))
        }
        if let error = GoalTransitionValidation.readinessError(transitionDraft) { return .failure(.init(message: error)) }

        let now = Date()
        let today = Self.dateKey(now)
        let newGoalId = "goal_transition_\(reviewToken.transitionId)"

        // Complete the source goal — additive lifecycle fields only, every
        // other field (evidence, phases, history) stays byte-identical.
        var completedFromActive = activeGoal
        completedFromActive.status = "Completed"
        let completedRecord = CompletedGoalReadModel(
            id: activeGoal.id,
            title: activeGoal.title,
            status: "Completed · Transitioned",
            dateRange: activeGoal.dateRange,
            achievement: "Transitioned into \(transitionDraft.objectiveTitle)",
            recap: "This goal was completed and superseded by \(transitionDraft.objectiveTitle). Its evidence and history remain exactly as recorded.",
            highlights: [],
            photos: [],
            photoHistoryDestination: .progressStream(streamId: "photos"),
            finalComposition: CompletedGoalCompositionReadModel(
                date: today, bodyFat: activeGoal.evidence.bodyFat, leanMass: activeGoal.evidence.leanMass,
                fatMass: activeGoal.evidence.fatMass, weight: activeGoal.evidence.weight,
                narrative: "Preserved exactly as it stood at transition.", briefingDestination: nil
            ),
            achievedBy: [],
            unlocked: nil
        )

        // Create the new goal — active, primary, phases: [] (matches real
        // web: the activation coordinator never writes phases).
        let newGoal = ActiveGoalReadModel(
            id: newGoalId,
            title: transitionDraft.objectiveTitle,
            status: "Active",
            objective: transitionDraft.objectiveTitle,
            dateRange: "Started \(Self.longDateLabel(now))",
            confidence: .init(value: 0, band: "Building", explanation: "Confidence begins accumulating as new evidence arrives.", source: "New goal"),
            goalProgress: .init(percentage: 0, label: "Just started", detail: "No evidence has been recorded for this goal yet."),
            phases: [],
            activePhaseId: "",
            readiness: ["Establish your opening calibration window.", "Confirm your first review checkpoint."],
            guardrail: .init(
                title: transitionDraft.guardrails.first(where: \.accepted)?.title ?? "No guardrail selected",
                state: "Active",
                scope: "Goal-wide",
                body: transitionDraft.guardrails.filter(\.accepted).map(\.title).joined(separator: " · ")
            ),
            evidence: activeGoal.evidence,
            trainingProgress: .init(reviewDate: "Pending", state: "Building baseline", interpretation: "Awaiting the first review window.", comparisons: [], muscleGroups: []),
            turningPoints: [.init(id: "turning-point-transition", date: today, title: "Goal transition activated", body: "\(activeGoal.title) was completed and \(transitionDraft.objectiveTitle) began.")],
            strategy: transitionDraft.protocolReviews.map { .init(id: $0.id, label: $0.category.label, active: $0.disposition != .remove) },
            plan: GoalPlanReadModel(
                name: transitionDraft.objectiveTitle, purpose: transitionDraft.objectiveTitle, primaryOutcome: transitionDraft.objectiveTitle,
                target: .init(type: .numericChange, metric: "lean_mass", direction: "increase", amount: nil, targetValue: nil, unit: "lb", description: transitionDraft.objectiveTitle, targetDate: nil),
                timeline: .init(startDate: today, targetDate: nil),
                successCriteria: [], guardrails: transitionDraft.guardrails.filter(\.accepted).map { .init(key: $0.id, text: $0.title) }
            )
        )

        completedGoals.append(completedRecord)
        activeGoal = newGoal
        addGoalAvailable = false
        hub = GoalsHubReadModel(activeGoal: newGoal.summary, completedGoals: completedGoals.map(\.summary), addGoalAvailable: false, addGoalMessage: addGoalMessage)
        issuedReviewToken = nil

        return .success(.init(completedGoalId: completedRecord.id, newGoalId: newGoal.id, newGoalTitle: newGoal.title, committedAt: now, pendingExternalEffectCount: 1))
    }

    // MARK: - Phase Transition (honest domain-contract extension — see GoalsSandboxModel.swift)

    func phaseTransitionContext(goalId: String, phaseId: String, hasEnergyStrategyForNextPhase: (String) -> Bool) -> PhaseTransitionContext? {
        guard activeGoal.id == goalId, let current = activeGoal.phases.first(where: { $0.id == phaseId }), current.status == .active else { return nil }
        let next = activeGoal.phases.first { $0.order == current.order + 1 }
        return PhaseTransitionContext(
            goalId: goalId, currentPhase: current, nextPhase: next,
            nextPhaseHasEnergyStrategy: next.map { hasEnergyStrategyForNextPhase($0.id) } ?? false,
            effectiveDateLabel: Self.longDateLabel(Date())
        )
    }

    /// `PhaseReviewCommitParticipants` (`current_phase`/`next_phase`
    /// participants) — Phase 1 stays in `phases[]` marked `.completed`
    /// (never removed/overwritten); Phase 2 becomes `.active`. Evidence,
    /// Priorities, and Protocol history are untouched — this method
    /// exists on `GoalsSandboxStore` alone and never reaches those stores.
    @discardableResult
    func establishPhaseTransition(goalId: String, decision: PhaseTransitionDecision, currentPhaseId: String, nextPhaseId: String?, extendWeeks: Int) -> Result<PhaseTransitionResult, GoalsSandboxError> {
        guard activeGoal.id == goalId, let currentIndex = activeGoal.phases.firstIndex(where: { $0.id == currentPhaseId }),
              activeGoal.phases[currentIndex].status == .active else {
            return .failure(.init(message: "This phase is unavailable."))
        }
        let now = Date()
        switch decision {
        case .continueCurrent:
            guard extendWeeks > 0 else { return .failure(.init(message: "Choose an extension length greater than zero.")) }
            let extendedTarget = Self.dateKey(Calendar.gregorianUTC.date(byAdding: .weekOfYear, value: extendWeeks, to: now) ?? now)
            activeGoal.phases[currentIndex].targetDate = extendedTarget
            activeGoal.phases[currentIndex].dates = "Started \(Self.shortDateLabel(activeGoal.phases[currentIndex].startDate)) · Target \(Self.shortDateLabel(extendedTarget))"
            hub.activeGoal = activeGoal.summary
            return .success(.init(goalId: goalId, completedPhaseId: currentPhaseId, activePhaseId: currentPhaseId, committedAt: now))
        case .beginNext:
            guard let nextPhaseId, let nextIndex = activeGoal.phases.firstIndex(where: { $0.id == nextPhaseId }) else {
                return .failure(.init(message: "There is no next phase to begin."))
            }
            let today = Self.dateKey(now)
            activeGoal.phases[currentIndex].status = .completed
            activeGoal.phases[currentIndex].targetDate = today
            activeGoal.phases[currentIndex].progress = .init(percentage: 100, label: "Phase complete", detail: activeGoal.phases[currentIndex].progress.detail)
            activeGoal.phases[nextIndex].status = .active
            activeGoal.phases[nextIndex].startDate = today
            activeGoal.phases[nextIndex].dates = "Started \(Self.shortDateLabel(today))" + (activeGoal.phases[nextIndex].targetDate.map { " · Target \(Self.shortDateLabel($0))" } ?? "")
            activeGoal.activePhaseId = nextPhaseId
            hub.activeGoal = activeGoal.summary
            return .success(.init(goalId: goalId, completedPhaseId: currentPhaseId, activePhaseId: nextPhaseId, committedAt: now))
        }
    }

    // MARK: - Test-only pre-transition seed

    /// Rewinds the fixture to a state where Visible Abs is still the
    /// active/primary goal and Build Lean Mass has not been created yet —
    /// the state `ProductionGoalTransitionEntryPointService` requires
    /// before the real "Add Goal" entry point shows at all.
    private func seedPreTransitionState() {
        guard let visibleAbs = completedGoals.first(where: { $0.id == "goal_visible_abs_at_rest" }) else { return }
        completedGoals.removeAll { $0.id == "goal_visible_abs_at_rest" }
        activeGoal = ActiveGoalReadModel(
            id: visibleAbs.id, title: visibleAbs.title, status: "Ready to transition", objective: "Reached the target — ready for what's next.",
            dateRange: visibleAbs.dateRange, confidence: .init(value: 92, band: "High", explanation: "Goal criteria met.", source: "Final review"),
            goalProgress: .init(percentage: 100, label: "Complete", detail: visibleAbs.achievement),
            phases: [], activePhaseId: "", readiness: ["Confirm final DEXA evidence.", "Choose what comes next."],
            guardrail: .init(title: "Maintain approximately 8-9% body fat", state: "Met", scope: "Goal-wide", body: visibleAbs.recap),
            evidence: .init(date: visibleAbs.finalComposition.date, bodyFat: visibleAbs.finalComposition.bodyFat, leanMass: visibleAbs.finalComposition.leanMass, fatMass: visibleAbs.finalComposition.fatMass, weight: visibleAbs.finalComposition.weight, support: visibleAbs.finalComposition.narrative),
            trainingProgress: .init(reviewDate: "Complete", state: "Goal met", interpretation: visibleAbs.recap, comparisons: [], muscleGroups: []),
            turningPoints: visibleAbs.highlights.map { .init(id: $0.id, date: $0.date, title: $0.title, body: $0.body) },
            strategy: [],
            plan: .init(
                name: visibleAbs.title, purpose: visibleAbs.recap, primaryOutcome: visibleAbs.achievement,
                target: .init(type: .numericAbsolute, metric: "body_fat_percentage", direction: "decrease", amount: nil, targetValue: 9, unit: "%", description: visibleAbs.achievement, targetDate: nil),
                timeline: .init(startDate: "2026-04-01", targetDate: visibleAbs.finalComposition.date),
                successCriteria: [], guardrails: [.init(key: "guardrail-body-fat", text: "Maintain approximately 8-9% body fat")]
            )
        )
        addGoalAvailable = true
        addGoalMessage = "Visible Abs is ready to transition into a new goal."
        hub = GoalsHubReadModel(activeGoal: activeGoal.summary, completedGoals: completedGoals.map(\.summary), addGoalAvailable: true, addGoalMessage: addGoalMessage)
        transitionDraft = GoalsSandboxStore.seedTransitionDraft()
    }

    /// Rewinds Build Lean Mass's phases to their pre-transition state:
    /// Phase 1 (Establish Maintenance) active, Phase 2 (Lean Mass Build)
    /// planned and not yet started — the exact scenario the task's
    /// Phase 1 → Phase 2 Energy Strategy requirement is about.
    private func seedPrePhase2State() {
        guard activeGoal.id == "goal_fixture_build_lean_mass",
              let phase1Index = activeGoal.phases.firstIndex(where: { $0.id == "phase_fixture_maintenance" }),
              let phase2Index = activeGoal.phases.firstIndex(where: { $0.id == "phase_fixture_lean_mass_build" })
        else { return }
        activeGoal.phases[phase1Index].status = .active
        activeGoal.phases[phase1Index].targetDate = nil
        activeGoal.phases[phase1Index].dates = "Started Jul 19"
        activeGoal.phases[phase1Index].progress = .init(percentage: 60, label: "Phase in progress", detail: "Maintenance is being established.")
        activeGoal.phases[phase2Index].status = .planned
        activeGoal.phases[phase2Index].startDate = ""
        activeGoal.phases[phase2Index].dates = "Not started"
        activeGoal.phases[phase2Index].progress = .init(percentage: 0, label: "Not started", detail: "Awaiting the Phase 1 review.")
        activeGoal.activePhaseId = "phase_fixture_maintenance"
        hub.activeGoal = activeGoal.summary
    }

    private static func seedTransitionDraft() -> GoalTransitionDraft {
        GoalTransitionDraft(
            guardrails: [
                .init(id: "guardrail-body-fat", title: "Maintain approximately 8-9% body fat", detail: "Keep body composition within the range established during the prior goal.", accepted: true),
                .init(id: "guardrail-gradual-gain", title: "Gain gradually", detail: "Avoid rapid weight change that risks excess fat gain.", accepted: true),
                .init(id: "guardrail-recovery", title: "Protect recovery", detail: "Do not sacrifice recovery for faster progress.", accepted: true),
                .init(id: "guardrail-strength", title: "Preserve strength", detail: "Working sets should not regress during the transition.", accepted: false),
            ],
            measures: [
                .init(id: "measure-dexa", group: .outcome, title: "DEXA body composition", accepted: true),
                .init(id: "measure-weight-trend", group: .predictive, title: "Weekly weight trend", accepted: true),
                .init(id: "measure-training-volume", group: .predictive, title: "Training volume progression", accepted: true),
                .init(id: "measure-recovery", group: .explanatory, title: "Recovery and sleep context", accepted: false),
            ],
            protocolReviews: ProtocolTransitionCategory.allCases.map { .init(category: $0, disposition: $0 == .energy || $0 == .nutrition ? .modify : .keep) }
        )
    }

    // MARK: - Formatting helpers

    private static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.gregorianUTC
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Los_Angeles")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func longDateLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.timeZone = TimeZone(identifier: "America/Los_Angeles")
        formatter.dateStyle = .long
        return formatter.string(from: date)
    }

    private static func shortDateLabel(_ dateKey: String) -> String {
        let input = DateFormatter()
        input.calendar = Calendar.gregorianUTC
        input.locale = Locale(identifier: "en_US_POSIX")
        input.timeZone = TimeZone(identifier: "UTC")
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: dateKey) else { return dateKey }
        let output = DateFormatter()
        output.locale = Locale(identifier: "en_US")
        output.timeZone = TimeZone(identifier: "UTC")
        output.dateFormat = "MMM d"
        return output.string(from: date)
    }

    private static func dateRangeLabel(start: String, end: String?) -> String {
        "\(shortDateLabel(start))" + (end.map { " → \(shortDateLabel($0))" } ?? " → Open-ended")
    }
}

extension Calendar {
    static let gregorianUTC: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()
}

/// Decode shape for `GoalsFixture.json` — matches `FixtureGoalsAPI.FixtureFile`.
private struct GoalsFixtureFile: Codable {
    var activeGoal: ActiveGoalReadModel
    var completedGoals: [CompletedGoalReadModel]
    var supportingObjectives: [SupportingObjectiveReadModel] = []
    var addGoalAvailable: Bool
    var addGoalMessage: String
}
