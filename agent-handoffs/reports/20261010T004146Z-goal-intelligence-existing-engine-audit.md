# Goal Intelligence: audit of the existing engine and both historical transitions (read-only)

- Task id: `claude-goal-intelligence-existing-engine-audit-20261009`
- Prompt: `agent-handoffs/inbox/prompts/20261009-claude-goal-intelligence-existing-engine-audit.md` at `7e92c1f8`
- Agent: Claude (Opus 5.5), Remote Control worktree `goal-intelligence-existing-engine-audit-20261009`
- Generated: 2026-10-10T00:41Z
- Status: **completed** (audit and report only; no implementation)
- Source audited: production Server `5e91aa5d` (`origin/combined-app-platform-cutover`, deployment `fc523740` ACTIVE, web and worker SHAs match). Native Build 93 `9d0a2069` (current accepted release).
- Production: two bounded read-only Postgres passes, **authorized by the Founder in chat on 2026-10-09** (details in §13).
- No goal or phase edits, no production writes, no deploy, no TestFlight, no release-pointer change. The DEXA-republication and Native Option B branches were not touched.

---

## 0. Bottom line

1. **Most of a goal-adaptation engine already exists.** The live V3 engine already calculates the following for every Weekly, Midweek, Monthly, DEXA and Photo briefing:
   - the rate of gain needed to hit the deadline compared with the observed rate;
   - a schedule state (`ahead_with_reserve` / `at_risk`);
   - projected days to completion;
   - a guardrail state;
   - a recommendation (`continue`, `monitor guardrail`, `review strategy`, `transition phase`, `transition goal`, `pause`).

   There is also a working approval mechanism with audit history, the Phase Review. It ran once, in production, on Aug 16. The work needed is **wiring and decision policy, not a new engine.**

2. **The engine already detects that the current goal is off track and does nothing with it.** In production, the Oct 9 DEXA assessment is:
   - **7.1 of 10 lb (71%)**, with **22 days** left to Oct 31;
   - **0.132 lb/day** needed vs **0.034 lb/day** expected (ratio **0.26**);
   - `scheduleState: at_risk`, **~86 more days** projected (about early January 2027);
   - body-fat guardrail `pressured`.

   Even so, the published recommendation was **`continue_with_guardrail_monitoring`**. The recommendation is chosen *before* the time projection runs, so the projection never influences it. No path anywhere proposes moving the deadline, resizing the target or changing the phase.

3. **Weekly and Midweek overstated the schedule for about 4 weeks.** "Passage of time is never evidence" is a deliberate rule (`ConfidenceV3ProjectionService.js:31-33`), so the time-remaining figure stays fixed at the last DEXA. Every V3 artifact from Sep 13 to Oct 6 reported **49 days remaining and `ahead_with_reserve`**, even though fewer days were actually left. My own recalculation for Oct 6: about 0.12 lb/day expected vs 4.2 lb ÷ 25 days ≈ 0.168 lb/day needed, so the ratio was about 0.72, which is already `at_risk`.

4. **Confidence and feasibility are conflated.** The live "Goal Confidence" is defined as `active_goal_completion_given_appropriate_continued_execution`, which is a probability-like *likelihood of finishing*. The word "feasibility" inside it means something different: whether the strategy has produced a response. In production on Oct 9 the trajectory was `at_risk` while `strategyEffectiveness.feasibility = demonstrated`.

5. **History, transition 1 (Visible Abs → Build Lean Mass):** the Founder directed it and confirmed it through a guided wizard. The target was hard-coded, not chosen by the engine. It committed atomically at **2026-07-21T04:53Z**, which was the evening of Jul 20 Pacific time.
   - "Jul 18" is the date of the final DEXA and photo. It is not the completion record.
   - "Jul 19" is the goal start date, set later by a repair.
   - The 10 lb / Oct 31 target was added afterwards through Goal Edit.

6. **History, transition 2 (Phase 1 "Establish Maintenance" → Phase 2 "Lean Mass Build"):**
   - The **published** Aug 15 DEXA briefing recommended **extend** ("Continue calibration until the unresolved questions become decidable").
   - That afternoon the recommendation policy was rewritten into a goal-aware cost-of-delay rule. Re-run at read time, it recommended **begin**.
   - The Founder chose begin on the web DEXA page at **2026-08-16T07:10:44Z** and typed in **2,500 kcal intake / 800 kcal activity**.
   - A reconciliation the next day moved the effective date back to **Aug 15**.

7. **The machinery that adapts goals stops at Phase 2.**
   - The active phase has no review milestone (`reviewMilestone: null`, `reviewState: not_required`, `plannedReviewAt: null`). Nothing will prompt a review or a goal decision at or before Oct 31.
   - There is no way to create, complete or revise the goal itself, apart from the one-time hard-coded Visible Abs flow.
   - Native has no approval surface. Phase Review is web-only and disabled in Native production.

---

## 1. Authority and method

| Item | Value |
|---|---|
| Production Server | `5e91aa5d11d34e9b717d456a1620cc8303373947`, deployment `fc523740-94be-4abc-a900-02f18cdf8831` ACTIVE. Web and worker `source_commit_hash` match; nothing in progress. Re-checked right before each read. |
| Native release | Build 93 `9d0a2069` (main `agent-handoffs/latest.json` authority) |
| Code reading | Detached checkout of the production branch in this session's worktree. Five parallel read-only tracers covered: engine and forecast, write paths and schema, Native and narratives, July history, Phase 1 history. I re-checked key claims against the source myself (cited below). |
| Note | `main` contains only handoffs and reports. The application source lives on `combined-app-platform-cutover`. All `src/...` paths refer to `5e91aa5d`; `ios/...` paths refer to `9d0a2069`. |

---

## 2. Architecture map

### 2.1 Where state lives (persisted contracts)

All canonical state is stored as one JSONB row per record in `physiqueos.canonical_<domain>_records`, keyed by `(owner, collection_name, record_id)` (`db/migrations/000003_phase4_canonical_domains.cjs:14-37`; collection map in `src/platform/migration/phase4DomainCollections.js`). There are no dedicated goal, phase, proposal or approval tables. Status values, dates and supersession links all live inside `payload`.

| Concept | Where | Versioning | Production row count (Oct 9) |
|---|---|---|---|
| Goal (target, timeline, guardrails, `phases[]`, pointers) | `canonical_goal_records/goals` | **Updated in place.** Each phase has its own `revision` and `reviewMilestoneHistory[]`. | 4: 1 completed (Visible Abs), 1 active primary (Build Lean Mass), 2 legacy supporting goals still `active` |
| Goal transition drafts | `goalTransitionDrafts`, `goalProtocolTransitionDrafts` | Draft → applied or abandoned | 2 + 2 |
| Phase review decision / transaction | `phaseReviewDecisions`, `phaseReviewTransactions` | **Append-only** | 1 / 1 |
| Phase strategy / expected trajectory | `phaseStrategies`, `phaseExpectedTrajectories` | Accepted records, content-fingerprinted, `supersedesId` | 1 / 1 |
| Phase lifecycle read model | `phaseLifecycleReadModels` | Upsert; read only by reconciliation tooling | 1 |
| Strategy (Energy, Nutrition, Training, …) | `canonical_protocol_records/protocols` + `protocolVersions` | **Append-only versions** (`endedAt` + successor) | 24 / 29 |
| Operating Plan singleton | `canonical_plan_records/operatingPlan` | In place | 1. **Stale:** `primaryGoalId` is still `goal_visible_abs_at_rest`, last updated 2026-06-29 |
| Confidence / forecast history | `canonical_confidence_records/goalConfidenceHistory` (V2 + V3), `goalConfidenceSnapshots`, `confidenceInitializationArtifacts`, `confidenceActivationArtifacts` | Append-only, with predecessor links | 34 history rows (10 V3) |
| Published briefings | `canonical_briefing_records/dailyBriefings` | Immutable artifacts; phase attribution frozen at publication | 59 |
| Adaptive trust | `canonical_application_context.adaptive_trust_profile` | Seed/import only | — (**unused**, see §3) |

### 2.2 Evidence inputs

`src/domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js` builds the goal contract and evidence bindings:

- **Decisive outcome:** DEXA lean mass (`body_composition.lean_mass`) is the only evidence that moves goal progress. Bound at `:880-910`.
- **Guardrail:** DEXA body fat %, read against the 8–9% range, which is **parsed from the guardrail sentence** (`:1230-1253`).
- **Execution and context:** energy intake (MyFitnessPal or HealthKit), activity, training and strength progression, sleep, photos and scale weight. These change the execution multiplier, the narrative and coaching observations, but not measured progress.
- **Deadline:** `goal.timeline.targetDate` → `forecast.deadlineAt` (`:1072, :1085`).

### 2.3 Feasibility, attainability and time projection: three implementations, one live

| Implementation | What it computes | Status |
|---|---|---|
| **`intelligence/v3/ConfidenceV3ProjectionService.evaluateTrajectory`** (`:251-307`) | Needed rate = remaining ÷ days to `deadlineAt`. Observed rate = Δ lean mass between DEXAs ÷ days. That rate is discounted by persistence, evidence reliability, exposure and execution health. `rateRatio`, `scheduleState` ∈ {`ahead_with_reserve`, `complete`, `at_risk`, `not_applicable`}, `projectedDaysToCompletion` (`:296-304`). | **Live** in all five briefing families. Saved in each V3 assessment. |
| `forecast/GoalAttainabilityService.js` (V2, 2026-08-15) | Observed progress vs the accepted expected-trajectory envelope. `paceState`, `remainingFeasibility`, `outlook` ∈ {`feasible`, `uncertain`, `at_risk`, `unlikely`}. Runs **only when `timeline.constraintType === "firm"`** (`:9-11`). | **Live but narrow.** Called only by `ForecastEngine` inside the Phase Review commit (Starting Forecast) and a synthetic preview. |
| `confidenceV3/FeasibilityAssessmentService.js` + `ObservedOutcomePaceService` (2026-09-17) | Evidence-based feasibility states (`unproven` … `contradicted`) and pace ratios (ahead ≥ 1.5, on pace ≥ 0.85, behind ≥ 0.4) | **Unused / superseded.** None of the 12 modules in `src/domain/confidenceV3/**` can be reached from any route, worker or script. |

**Known limits of the live projection:**

- **Time does not count down between DEXAs.** `forecastAt` only moves forward when new authoritative outcome evidence arrives. Otherwise the previous outlook is reused (`:60-72`), and the comment at `:31-33` reads: "Passage of time is never evidence. A deadline may be reconsidered only when the caller supplies an explicit material semantic event". Effect in production: see §7.
- **`minimumStrategyExposureDays` defaults to 0** (adapter `:186-189`), so exposure always counts as adequate.

### 2.4 Guardrails: four classifiers, one with real consequences

| Classifier | Rule for an 8–9% range | Status |
|---|---|---|
| V3 `adaptLegacyGuardrailV3` (adapter `:1240-1245`) → `DeclarativeGoalEvaluator` | **Symmetric:** `watch` for any deviation; `pressured` ≥ 0.5 pt outside; `breached` ≥ 1.5 pt outside (≥ 10.5% or ≤ 6.5%) | **Live.** `breached` → `pause_and_investigate`, confidence ceiling 45. `watch`/`pressured` → monitoring wording only. |
| V2 `DEXAEventContextService.classifyBodyFatGuardrail` (`near_boundary`, 0.15 tolerance) | Symmetric | Live in DEXA briefing wording (`DEXAEventPlainLanguage.js:321-332`) |
| Phase Review guardrail deviation (`GoalAwarePhaseReviewRecommendationService.js:73-76`) | "slight" if ≤ max(0.1, range width) | Live only inside Phase Review |
| `confidenceV3/GuardrailTransitionService.js` | **Direction-aware** (below range is the safe side during a lean gain) | **Unused** |

There is no structured guardrail on the goal. All four are derived from the free-text sentence "Maintain approximately 8–9% body fat." by regex. In production, `v3Guardrails`, `goalContractV3`, `transitionCriteriaV3`, `forecastV3` and `timeline.flexibility` are **all absent or null** on the goal.

### 2.5 Confidence: what it measures

Definitions:
- `ConfidenceV3ProjectionService.js:3`: "Versioned coaching heuristic, not a statistically calibrated probability model."
- `:102`: `primaryDimension: "goal_completion"`.
- `:109`: meaning `active_goal_completion_given_appropriate_continued_execution`.

How the score is built:
- Weights (`:8`): strategy 0.35, progress 0.20, trajectory 0.25, execution 0.10, guardrails 0.10.
- Score = `min(ceiling, 20 + 75·strength − guardrailPenalty)`.
- Bands: high ≥ 80, moderate ≥ 55, otherwise low (`:107`).
- Outlook: favorable ≥ 75, uncertain ≥ 55, otherwise at_risk (`:241`).

**The conflation, verified:**
- The headline "Goal Confidence %" is a likelihood of reaching the goal. It is not "how well the system understands the evidence". `INTELLIGENCE_ENGINE.md:127` still describes the second meaning, so the docs contradict each other.
- Inside that score, `feasibility` (`unknown`/`testing`/`demonstrated`/`challenged`/`refuted`) means *the strategy has produced a qualifying response*, not *the target is reachable by the deadline*.
- The schedule only shifts the score through the 0.25 trajectory weight.
- Result on Oct 9: **confidence 70 (moderate, "uncertain")** while the trajectory said the goal needs about 4× the remaining time.

### 2.6 Decision ladder (what the engine recommends)

`StrategicInterpretationV3Engine.resolveRecommendation` (`src/domain/intelligence/v3/StrategicInterpretationV3Engine.js:316-331`). The first matching rule wins:

1. guardrail `breached` → `pause_and_investigate` (urgent)
2. goal achieved/exceeded and `onAchieved === transition_goal` → `transition_goal`
3. `phaseTransitionReady` → `transition_phase`. **Never fires**, because no code writes `phase.transitionCriteriaV3`.
4. strategy feasibility `challenged`/`refuted`, or a confirmed reversal of the leading indicator → `review_strategy`
5. guardrail `watch`/`pressured` → `continue_with_guardrail_monitoring`
6. otherwise → `continue_current_strategy`

**Structural gap:** `ConfidenceNarrativeV3Pipeline.js:23-36` calls `createStrategicInterpretationV3` (which includes the recommendation) **before** `projectConfidenceV3` (which includes the schedule). So `scheduleState: at_risk` cannot reach the ladder. No rung exists for "behind schedule", "deadline infeasible" or "conflicting constraints".

Each action becomes text only: `NarrativeV3CompositionService.js:1099-1111` and `DEXAEventPlainLanguage.js:274-300`, e.g. "Review the plan before continuing unchanged." **Nothing consumes the action as a proposal.**

Separate V2 signals (`ForecastEvaluationService.createDecisionSupport`, `:172-204`) define `strategy_adjustment_available`, `goal_review_becoming_relevant`, `goalContractChangesRequireAuthorization: true` and `automaticGoalRevisionAllowed: false`. Nothing consumes them.

### 2.7 Strategy, phase and goal changes: write paths and approval gates

| Level | Path | Who decides | Approval gate | Status |
|---|---|---|---|---|
| **Strategy** (protocol version) | Web Operating Plan strategy edit (`src/app/profile/operating-plan/strategy/.../edit/actions.js`). Native commands `operating-plan.*-strategy.save.v1` (allowlist `NativeProductionContractService.js:30-62`) | Founder, manually | Expected-version compare-and-set + `confirmedByUser` | **Live.** Energy is read-only in Native (`ios/.../AppEnvironment.swift:101-108`). Nothing links a briefing recommendation to a proposed strategy edit. |
| **Phase** (begin next / extend current) | Engine attaches `phaseReviewAuthorization` to an eligible artifact (`PhaseReviewArtifactService.js:6-84`) → web `PhaseReviewCard` on `/briefings/dexa/[scanId]` → `PhaseReviewAuthorizationService` → `PhaseReviewCommitCoordinator` (one unit of work, 8 participants, `PhaseReviewCommitParticipants.js:29-39`) | **Engine recommends, Founder decides.** Begin requires Founder-typed kcal intake and activity targets. | Founder actor, active goal, eligible artifact, unconsumed milestone, approval id/token bound to the store revision, recommendation fingerprint, idempotency key | **Live, web only, currently dormant:** the active phase has no milestone. Native: `phaseReview: nil` hard-coded (`ProductionBriefingMapper.swift:867`); route blocked: "Phase transitions are not available in Native production." (`AppDestinationRouterView.swift:63-65`) |
| **Phase structure** (future phases) | Goal Edit phase editor (`GoalPhasePersistenceService.js`) | Founder | Single-use review token. Any edit touching the current phase is rejected (`PHASE_REVIEW_COORDINATOR_REQUIRED`). | Live (web) |
| **Goal plan** (target, timeline, guardrails, preferences) | Goal Edit wizard → `GoalPlanUpdateService.js:51-112` | Founder | Review token + approved diff + plan fingerprint + source revision | **Live (web).** Edits in place; no history of earlier targets or deadlines. |
| **Goal transition** (complete → new goal) | `/goals/transition` wizard → `ProductionGoalTransitionActivationService` → `GoalTransitionActivationCoordinator` (atomic) | Founder, from **hard-coded** defaults (`GoalTransitionService.js:52-80`, always "Build Lean Mass") | In-memory single-use token, `founderConfirmed`, fingerprint revalidation | **Historical.** Source goal id is hard-coded. The entry point returns null once a `build_lean_mass` goal exists. |
| Generic `goal.edit.v1` / `goal.transition.v1` commands | `Phase3CommandService.js` | — | Command receipt only | Implemented but **unused** (not in the Native allowlist) |
| Create a new goal / complete Build Lean Mass | — | — | — | **Missing** (`docs/GOAL_CREATION_INTEGRATION.md`: "activation intentionally deferred") |

Built-in rules: "PI recommends; the user decides. Time may make a review due, but time never completes a phase." (`docs/PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md`). Every phase carries `automaticStrategyAdjustmentAllowed: false` and `majorChangeRequiresUserAuthorization: true`.

### 2.8 Timelines, deadlines, hard vs flexible

- **Goal:**
  - `target.targetDate` and `timeline.{mode, startDate, targetDate, flexibility, …}`. The two target dates must agree (`goalPlanningInput.js:115-128`).
  - Production: `mode: target_date`, start `2026-07-19`, target `2026-10-31`, **`flexibility: null`**.
- **Phase:**
  - `plannedReviewAt`, `reviewMilestone.{earliestEligibleDate, latestEligibleDate, earlyReviewPolicy}`, `targetDate`, `timingMode`.
  - Production: the active Phase 2 has `targetDate 2026-10-31`, `timingMode target_date`, `reviewMilestone null`.
- **Hard vs flexible semantics exist in V2 only:**
  - `GoalPlanningTimelineFlexibility = firm | adaptive | aspirational` (+ `review_only`).
  - If unset, `target_date` → firm (`ProductionConfidenceContextAdapter.js:677-685`).
  - `GoalAttainabilityService` evaluates firm deadlines only.
  - **The live V3 path ignores flexibility.** Any `targetDate` is treated as a deadline.
  - The only deadline actually enforced: a phase extension may not go past `goal.timeline.targetDate` (`PhaseReviewAuthorizationService.js:233-235`).
- **Phase-review approvals have no `expiresAt`**, so the expiry check at `PhaseReviewAuthorizationService.js:127` never fires.

### 2.9 Outputs: where goal intelligence reaches the Founder

| Surface | Goal content | Off-track status? | Recommends an adaptation? | Founder can approve? |
|---|---|---|---|---|
| Weekly / Midweek (V3) | Progress, guardrail and confidence wording; `action` wording | Only as conditional confidence wording ("The remaining work is becoming harder to fit into the available time") | Prose only | No |
| Monthly (V3 review modules) | "New Baseline" card (measurement + guardrail + scale pace); "Month Ahead" | No forecast card. `MonthlyReviewPresentationService.js:91-93`: "The approved Monthly has no strategic or uncertainty card." | Prose only | No |
| DEXA Event (V3 + plain language, `5e91aa5d`) | `next` wording per action | No | Prose only ("It's time to review your plan rather than keep it unchanged…") | **Web only**, via PhaseReviewCard, and only while a milestone is open |
| Photo Event (V3) | V3 wording | No | Prose only | No |
| Native Home (`HomeJourneyFieldView`) | Phase name, "N weeks remaining", "X of Y lb gained" | **No.** Tone comes from phase status, not pace. | No | No |
| Native Active Goal (`active_goal_current_state_v1`) | Progress %, guardrail pill, turning points, Coach's Take | **No pace field.** Progress statuses are only measured/reached/awaiting. | Coach's Take text | "Edit Goal" and "Review Phase Transition" are hidden in production (`allowsWrites` = sandbox only) |
| Native Confidence sheet | Deep explanation including "X lb remain with N days left" and the schedule sentence | Text only | No | No |
| Native Goals hub | `statusLabel` • confidence | Legacy `GoalEvaluationService` falls back to **"On Track"** for Build Lean Mass (`GoalsHubReadService.js:100`; no lean-gain branch). Not verified in production. | No | "Add Goal" disabled |
| Web `TrajectoryCard.jsx` | Static mock ("Ahead of schedule.", 94) | — | — | Dead (storybook only) |

Shadow and planned wiring: `NarrativeV3SurfaceProjectionService.projectPhaseReview` / `projectGoalTransitionReview` (tests only, `persistenceWrites: 0`). `NarrativeV3ConsumerOwnership.js:28-41` marks `goal_transition_review` and `phase_review_recommendation` as **WIRE_LATER**.

---

## 3. Capability status

| Capability | Status |
|---|---|
| V3 strategic interpretation, guardrail evaluation, recommendation ladder | Implemented and live |
| V3 deadline trajectory (`scheduleState`, `projectedDaysToCompletion`) | Implemented and live, saved per artifact. **Does not affect any decision.** |
| V3 narrative / Coach's Take / confidence explanation | Implemented and live |
| `ActiveGoalCurrentStateService` (Native Active Goal) | Implemented and live (no pace field) |
| Phase Review: recommendation, authorization, atomic commit, Starting Forecast | Implemented and live (web). Used once. **Dormant: no milestone on the active phase.** |
| `GoalAwarePhaseReviewRecommendationService` (cost of delay vs value of information) | Live inside Phase Review. Inputs partly come from **regex over narrative text** (`:77-81`). |
| `PhaseTransitionDatePolicy` (`review_milestone_boundary`) | Live (the only policy) |
| `GoalAttainabilityService`, `ForecastEngine`, `BriefingForecastFinalizer`, `StartingForecastService` | Live only inside the Phase Review commit |
| `AuthorizedBriefingForecastAdapters`, `ForecastEvaluationService.createDecisionSupport` signals | Implemented but unused |
| `confidenceV3/**` (Feasibility, GuardrailTransition, ObservedOutcomePace, StrategicInterpretationService, …) | Implemented but unused / superseded (unreachable) |
| `AdaptiveTrustRepository` / profile | Implemented but unused (seed says "Not yet automated"; no consumers) |
| Goal transition wizard (Visible Abs → Build Lean Mass) | Historical (single-use) |
| `VisibleAbsGoalCompletionService` | Historical, **never used** (no completion record in production) |
| Founder Phase 2 activation package, post-Phase-2 reconciliation harness | Historical (one-off operator scripts, Aug 2026) |
| Goal edit (target, timeline, guardrails) | Live (web), updates in place |
| `TrajectoryCard.jsx` (web) | Dead mock |
| Off-track → adaptation proposal (deadline, target, strategy or phase) | **Missing** |
| Structured guardrail on the goal; direction-aware guardrail (live) | **Missing** (unused implementation exists) |
| Hard vs flexible deadline in the live engine | **Missing** (V2 semantics exist) |
| Native approval surface for any goal, phase or strategy proposal | **Missing** |
| Versioned goal-contract history (prior targets and deadlines) | **Missing** |
| Generic goal creation / completion of Build Lean Mass | **Missing** |
| Review milestone for a terminal phase / end-of-goal review | **Missing** |

---

## 4. History 1: Visible Abs → Build Lean Mass

### Timeline (production rows + code + docs)

| When (UTC) | Event | Source |
|---|---|---|
| 2026-05-24 | Visible Abs `startDate` (no numeric target; completion = body fat ≤ 9% + relaxed-front photo check) | prod `goals`; `src/data/founderSeed/goals.js`; `GoalEvaluationService.js:89` |
| 2026-07-11 | Cut protocols confirmed: 1,900–2,150 kcal, 1,000 active kcal, 165 g protein | `src/fixtures/briefingFamilyV3/strategyAuthority.json` |
| 2026-07-18 14:41 | **Final DEXA uploaded:** 147.5 lb lean, 7.7% body fat, 167.4 lb total. Ingestion incident later re-extracted in place. | fixture `dexaScans.json`; `ConfirmedDexaEventRecoveryService.js` |
| 2026-07-18 ~22:41 | Final relaxed-front photo session (Photo Event = completion briefing) | `CompletedGoalPreviewService.test.js:17-21` |
| 2026-07-19 17:05 → 18:05 | First ("preview") goal transition draft created, then **abandoned** | **prod** `goalTransitionDrafts` |
| 2026-07-19 18:51 → 07-20 02:39 | First protocol transition draft, left `ready` (orphan) | **prod** `goalProtocolTransitionDrafts` |
| 2026-07-20 05:45 | Visible Abs still active, `userDecisionPending: true` | `docs/GOAL_TRANSITION_ACTIVATION_PRODUCTION_BASELINE_RECONCILIATION.md` |
| 2026-07-21 04:06 → 04:08 | **Live draft** created and accepted (`applied`) | **prod** |
| 2026-07-21 04:08 → 04:35 | Live protocol transition draft (15 protocol reviews) accepted | **prod** |
| (between) | First "Confirm and activate" failed at op 34 (`CREATE_PROTOCOL_PROVENANCE`) before commit; fixed; re-confirmed | `docs/PRODUCTION_GOAL_TRANSITION_INTEGRATION.md` |
| **2026-07-21 04:53:31.756** | **Atomic commit:** Visible Abs → `completed` (`confirmed_by_atomic_transition`, `preserveExistingEvidence: true`); Build Lean Mass activated 3 ms later | **prod** `goals`; `GoalTransitionActivationTransactionPlanBuilder.js:237-290` |
| 2026-07-22 00:52 | Phase 1 "Establish Maintenance" + Phase 2 "Lean Mass Build" created via the Goal Edit phase editor | **prod** phase `createdAt` |
| ~07-21/22 (inferred) | Target `+10 lb lean mass by 2026-10-31` entered via Goal Edit (the transition draft has no target fields) | code; **prod** `target` |
| 2026-07-23 16:54 | Protocol reconciliation migration: the 15 new protocols promoted, cut protocols superseded (activation had left both sets live) | `ProtocolReconciliationMigrationService.js`; `docs/PROTOCOL_STATE_DIAGNOSTIC_2026-07-23.md` |
| ~2026-08-02/03 | `founder_build_lean_mass_phase_repair_v1`: goal and Phase 1 start set to **2026-07-19**, Phase 1 review set to **2026-08-15** | `FounderPhaseCorrectionService.js:12-14`; `docs/CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md` |

### What was created

- **Goal:** "Build Lean Mass", `primaryOutcome` "Build 10 lb of lean mass", `target {numeric_change, lean_mass, +10 lb, 2026-10-31, baselineValue: null}`.
- **Guardrails:** four accepted sentences, including "Maintain approximately 8–9% body fat."
- **Opening approach:** calibration. **Cadence:** Wednesday/Sunday.
- **Energy protocol:** "Maintenance Calibration", with no calorie number.
- **Nutrition:** 167 g protein (1 g/lb × the Jul 18 DEXA weight).
- **The Operating Plan record never moved** and still points at Visible Abs.

### Baseline and evidence carry-over

There is no explicit link. `target.baselineValue` is null. The baseline is chosen at read time as the last DEXA on or before `timeline.startDate` (`DEXAEventContextService.js:47-52,247`), which makes Jul 18 the baseline only because of the later start-date repair. The Jul 18 and Aug 15 scans still list only the legacy goal ids in `relatedGoalIds`.

### Founder-directed vs engine-generated

| Element | Origin |
|---|---|
| Choice of next goal ("Build Lean Mass"), its reason text, the four guardrails, evidence roles, calibration opening | **Hard-coded template** (`GoalTransitionService.js:52-80`, `recommendationSource: coach_transition_v1`). Not computed from evidence. |
| Accepting the guardrails and protocol dispositions; confirming activation | **Founder** (explicit "Confirm and activate") |
| 10 lb / Oct 31 target; the phase plan | **Founder** via Goal Edit (no engine involvement found) |
| Completing Visible Abs | A side effect of the transition. The dedicated completion button/service was never used. |
| Start date of Jul 19 | Operator repair script (Founder-approved cutover), applied ~2 weeks later |

---

## 5. History 2: Phase 1 → Phase 2 inside Build Lean Mass

### Timeline

| When (UTC unless noted) | Event | Source |
|---|---|---|
| Jul 19 → Aug 15 | Phase 1 "Establish Maintenance": `completion_criteria` timing, `completionDecisionRequired`, milestone `planned_phase_review` (DEXA only, early review prohibited, recommendation required) | **prod** phase; `FounderPhaseCorrectionService.js:42` |
| ~Aug 2–3 | Phase 2 strategy and expected trajectory **authored ahead of time** (hard-coded package):<br>• energy intent `move_from_maintenance_calibration_to_controlled_surplus_when_supported`<br>• `fixedCaloriePrescription: false`<br>• trajectory bands of 0–4 lb by Sep 15, 0–8 lb by Oct 15, 0–10 lb by Oct 31<br>• `universalWeeklyRate: null`<br>• guardrail response `recommend_evidence_based_strategy_review`, `automaticCutAllowed: false` | `FounderPhase2ActivationPackageService.js`; `docs/PHASE_2_ACTIVATION_PACKAGE.md` |
| Aug 15 (day) | BodySpec DEXA: 148.3 lb lean (+0.8 from baseline), **7.6%** body fat (below the 8–9% range). DEXA intake and briefing fixes shipped the same day (`86ca8fc2`, `4758bd37`, `fccd26b2`). | `agent-handoffs/reports/20260926T031806Z-goal-v3-candidates-acceptance.md` |
| Aug 15 | **Published DEXA Event recommendation: `extend_current_phase`**, rationale "Continue calibration until the unresolved questions become decidable." Phase-review presentation: `continue_current_phase`. | **prod** artifact `dexa_event_…_2026_08_15.phaseReviewAuthorization` |
| Aug 15 15:19 PT | `f0fa9869` "Add goal-aware Phase 2 readiness flow": new `GoalAwarePhaseReviewRecommendationService`; Begin now requires typed targets; recommendation fingerprint | git |
| Aug 15 17:54 PT | `3f183d63`: removed `forecast_at_risk`/`forecast_unlikely` as vetoes ("Goal-outcome pressure is not itself a safety concern"); added `GoalAttainabilityService` | git |
| Aug 15 22:58 / 23:45 PT | `1e8dea8c`, `9d1562f8`: milestone-authorization and artifact-identity fixes (blockers to commit) | git |
| **2026-08-16 07:10:44.450Z** (Aug 16 00:10 PT) | **Founder decision committed:**<br>• `recommendedOutcome: begin_next_phase` (read-time re-evaluation), `selectedOutcome: begin_next_phase`<br>• `phaseReadinessConclusion: sufficiently_resolved_to_proceed`<br>• rationale: "…not conclusively proven, and the Guardrail remains slightly outside its exact range. The remaining uncertainty is bounded enough to act because the evidence is stable, another 14 days has meaningful Goal cost…"<br>• targets **2,500 kcal/day intake, 800 kcal/day activity**, weekly evaluation, `reviewed_small_changes`<br>• transaction `committed` at 07:10:45.709Z | **prod** `phaseReviewDecisions`, `phaseReviewTransactions` |
| same commit | Phase 1 → `completed` (`completedAt` = decision time, milestone consumed). Phase 2 → `active` (weekly monitoring, monthly DEXA-anchored strategic review, `automaticStrategyAdjustmentAllowed: false`). Strategy and trajectory v1 accepted. New Energy protocol version. Starting Forecast `forecast_uncertain` / moderate. Lifecycle read model written. | **prod** |
| Aug 16 (09:12–16:42 PT) | `264a6306` added `PhaseTransitionDatePolicy` (`review_milestone_boundary`) + `PostPhase2CoreReconciliationService`. The reconciliation moved the Phase 2 start, goal `currentPhaseStartedAt`, Energy v2 `effectiveAt` and v1 `endedAt` from **Aug 17 → Aug 15**. The decision record itself kept `projectedNextPhaseStart: 2026-08-17`. `01b8ff41` added the Weekly Aug 9–15 phase-boundary overlay, gold completed phases and the "major transition" turning point. | git; **prod** (decision says 08-17, phase says 08-15) |
| Sep 10 / Sep 26 / Sep 28 | Fallout fixes: Native labelled Lean Mass Build "Phase 1" (`045fc48c`); Goal V3 turning point/guardrail scan (Server `2a23eee7`); Monthly hard-coded "· Phase 1" (`e113c678`) | git |

### Founder-directed vs engine-generated

- **Engine:** the published Aug 15 briefing said **extend**. A **policy rewritten the same day** (goal-aware cost of delay: 14 days ÷ 77 days left ≈ 18% → "high"; guardrail deviation 0.4 pt → "slight"), re-evaluated at read time on the DEXA page, said **begin**. The decision records the re-evaluated recommendation.
- **Founder:** selected begin, typed both calorie targets (no code computes them), and authorized. The commits that changed the policy carry no Claude co-author.
- **Not involved:** `FeasibilityAssessmentService` and `GuardrailTransitionService` (created a month later) and the V3 engine (Sep 17).

---

## 6. What worked in both transitions (reuse these)

1. **Founder approval with a single atomic commit and an audit trail.**
   - Goal activation: single-use token, fingerprint revalidation, one coordinator commit.
   - Phase Review: approval bound to artifact and store revision, idempotency key, 8-participant unit of work, append-only decision and transaction records.
   - The first activation failed **before** commit and left no partial state. That is the right failure mode.
2. **Recommendation separated from decision.** The engine's recommended outcome and the Founder's selected outcome are stored side by side, with a fingerprint check that rejects stale recommendations (`RECOMMENDATION_STALE`).
3. **Append-only strategy history.** Energy v1 → v2 is a supersession, not an overwrite, which is why the October Energy phase-history audit could reconstruct it.
4. **Frozen attribution in published briefings.** Past artifacts keep the goal and phase they were published under; history is not rewritten.
5. **A Starting Forecast for each new phase** (`confidenceInitializationArtifacts` keyed by decision id) gives every phase its own forecast origin.
6. **A cost-of-delay vs value-of-information rule** that weighs remaining goal runway. It is the right *shape* for deadline-aware adaptation.

What went wrong, and should not be repeated:
- Hard-coded goal templates and one-off operator scripts.
- Dates repaired after the fact (Jul 19 and Aug 15 both came from repairs).
- Decision policy rewritten on decision day.
- Recommendation inputs parsed from narrative text by regex.
- The operating plan left stale.
- A transition that left two protocol sets active.
- No milestone created for the successor phase.

---

## 7. Current state (production, Oct 9): the gap in action

V3 assessments in `goalConfidenceHistory` (newest last):

| Artifact | Fraction done | Days remaining used | Needed / expected lb/day | Ratio | `scheduleState` | Guardrail | Recommendation | Outlook score |
|---|---|---|---|---|---|---|---|---|
| V3 activation baseline (Sep 18) | 0.58 | 49 | 0.0857 / — | 1.17 | ahead_with_reserve | clear | continue_current_strategy | 78.6 |
| Weekly Sep 13–19 | 0.58 | 49 | 0.0857 / — | 1.22 | ahead_with_reserve | clear | continue | 78.8 |
| Photo Sep 19 | 0.58 | 49 | — | 1.22 | ahead_with_reserve | clear | continue | 78.8 |
| Midweek Sep 20–22 | 0.58 | 49 | 0.0857 / 0.102 | 1.25 | ahead_with_reserve | clear | continue | 78.9 |
| Weekly Sep 20–26 | 0.58 | 49 | — | 1.29 | ahead_with_reserve | clear | continue | 79.1 |
| Midweek Sep 27–29 / **Monthly Sep** | 0.58 | 49 | — | 1.33 | ahead_with_reserve | clear | continue | 79.2 |
| Weekly Sep 27–Oct 3 | 0.58 | 49 | — | 1.38 | ahead_with_reserve | clear | continue | 79.4 |
| Midweek Oct 4–6 | 0.58 | **49 (really ~25)** | 0.0857 / ~0.121 | 1.42 | ahead_with_reserve | clear | continue | 79.5 |
| **DEXA Oct 9** | **0.71** | **22** | **0.1318 / 0.0337** | **0.26** | **at_risk** | **pressured** | **continue_with_guardrail_monitoring** | **70.0 ("uncertain")** |

What this shows:
- From Sep 12 to Oct 9 the projection never shortened the runway, so for four weeks every briefing said "ahead with reserve". My recalculation with the true remaining days gives about 0.72 by Oct 6.
- On Oct 9 both constraints bind at once:
  - **Schedule:** about 2.9 lb remain, which at the current rate needs ~86 days, against 22 left.
  - **Guardrail:** `pressured` means ≥ 0.5 pt outside 8–9%.
- That combination is the classic case for a Founder decision: extend the deadline, accept a partial target, or change strategy (e.g. stop pushing surplus). The engine's answer was "continue, watch the guardrail".
- The active phase has no review milestone, so no Phase Review will appear.

---

## 8. Gap analysis (verified)

| # | Gap | Evidence | Effect |
|---|---|---|---|
| G1 | Schedule state never reaches the recommendation | Pipeline order `:23-36`; ladder `:316-331` | An off-track goal still says "continue" |
| G2 | Runway frozen between DEXAs | `ConfidenceV3ProjectionService.js:31-33,60-72` | Overstated schedule for weeks (§7) |
| G3 | No adaptation proposal object (deadline, target, strategy or phase) | No collection or contract; V2 decision-support fields unconsumed | Nothing for the Founder to approve |
| G4 | No review milestone for the active or terminal phase, and no end-of-goal review | prod `reviewMilestone: null`; `PhaseReviewCommitParticipants.js:166-177` | No prompt before or at Oct 31; the goal cannot complete |
| G5 | No hard vs flexible deadline in V3 | V3 reads `targetDate` only; prod `flexibility: null` | Can't tell "Oct 31 is a soft aim" from "Oct 31 is an event" |
| G6 | Confidence conflated with goal-completion likelihood; "feasibility" overloaded | §2.5 | Moderate confidence alongside an infeasible schedule confuses the coaching |
| G7 | Guardrail is free text, symmetric, parsed by regex in 4 places | §2.4 | Direction-blind (below range during a gain is "watch"); fragile |
| G8 | Phase Review inputs regex-parsed from narrative text | `GoalAwarePhaseReviewRecommendationService.js:77-81` | Wording changes can flip decisions |
| G9 | Goal contract edited in place, no version history | `GoalPlanUpdateService` | A deadline change would erase the original commitment |
| G10 | No Native approval surface | `phaseReview: nil`; router block; sandbox-only writes | Founder decisions require the web app |
| G11 | No generic goal completion or creation | §2.7 | Cannot finish Build Lean Mass or start the next goal |
| G12 | Monthly has no strategic or forecast card; Weekly and Midweek show schedule only inside confidence wording | `MonthlyReviewPresentationService.js:91-93` | Recommendations are hard to see |

### Latent defects found (not fixed; for the backlog)

- **Overlapping phase dates.** Phase 1 `completedAt 2026-08-16T07:10Z` and Phase 2 `startedAt 2026-08-15` (prod). `CanonicalGoalPhaseChronologyService.isEffectiveOn` treats both phases as effective on **2026-08-15**, and `resolveCanonicalGoalPhaseChronology` would throw "Multiple phases are effective…" for `asOf=2026-08-15`. Production impact unknown: artifacts with persisted phase ids bypass this.
- **Mismatched start dates.** The decision record keeps `projectedNextPhaseStart 2026-08-17`, while the phase and protocol say Aug 15. This is intentional (immutable decision), but readers must not treat the decision as date authority.
- **Stale flag on the Aug 15 artifact.** Its stored `phaseReviewAuthorization.consumed` is still `false`, although the goal's milestone is consumed. Read-time logic handles this; the stored flag is misleading.
- **Founder-specific read path.** `projectFounderBuildLeanMassPhaseCorrection` (hard-coded dates) still runs on every read path (currently a no-op).
- **Stale Operating Plan.** `operatingPlan.primaryGoalId` still points at the completed Visible Abs goal, with the 1,900–2,200 kcal cut range.
- **Legacy supporting goals still active.** "Maintain 8–9% body fat" and "Preserve lean mass" are still `active` (non-primary) and feed the legacy Goals-hub evaluator.
- **Unused `confidenceV3/**`.** It duplicates the live engine and should be retired or harvested (the direction-aware guardrail is worth keeping).

---

## 9. How to extend the current engine: recommended incremental plan

Principle: **reuse the live V3 engine, the V3 assessment record and the Phase Review approval pipeline.** Add the missing decision rules and one new proposal type. No new engine.

**Step 1: Make the schedule honest (Server, small).**
- Apply the elapsed-time runway at read and publish time *without* treating time as evidence. Keep the measured rate frozen between DEXAs, but recompute `timeRemainingDays`/`requiredRate` from `asOf`. This changes the "Passage of time is never evidence" rule for the *denominator* only. **Founder decision D1.**
- Move the recommendation step after the projection (or pass `scheduleState` into it).
- Add ladder rungs: `review_timeline` (at risk, guardrail clear) and `resolve_constraint_conflict` (at risk *and* guardrail pressured).
- Golden tests: the production Oct 9 and Oct 6 assessments.

**Step 2: Structured goal contract (Server, small, one data migration with Founder approval).**
- Persist `timeline.flexibility` (`firm|adaptive|aspirational`).
- Make the 8–9% guardrail structured, with a direction (`lowerBoundMeaning: safe_direction`, `upperBoundMeaning: unsafe_direction`), reusing `GuardrailTransitionService`'s model.
- Stop using regex over narrative text in Phase Review; use V3 fields instead.

**Step 3: Goal-contract revision proposal (Server).**
- A new append-only `goalContractRevisions` collection (proposal → accepted/declined/superseded). Types: deadline change, target change, phase plan change, strategy-review request.
- Generated deterministically from the Step 1 rungs, carrying the evidence fingerprint and the V3 assessment id. **Never auto-applied.**
- Commit through the existing Phase Review coordinator pattern (token bound to store revision, idempotency key, unit of work).
- Keep the original contract. The goal stores `contractRevision`, and history shows every prior target and deadline.
- Add a review milestone to the active phase and a terminal "goal assessment" milestone (e.g. Oct 24–31, already described in the Phase 2 trajectory).

**Step 4: Surfacing (Native + briefings).**
- Weekly and Midweek: one "Plan check" line when a proposal is open. Monthly: a "Goal timeline" card. Weekly/Midweek/Monthly is the review cadence already defined in `PHASE_EXECUTION_CADENCE`.
- DEXA: Phase Review / proposal card.
- Native: a read-only proposal card first, then an approve/decline command added to the Native allowlist (receipt-idempotent).
- Retire the "On Track" fallback and the dead `TrajectoryCard`.

**Step 5 (later): generic goal completion and next-goal creation**, replacing the hard-coded Visible Abs flow. Leave this out of the next phase.

Guardrails for every step:
- No automatic goal, deadline, target or strategy change (`automaticGoalRevisionAllowed: false` stays).
- Any proposal carries the engine recommendation **and** a Founder override with a reason.
- Proposals expire or are superseded when the evidence fingerprint changes.
- Decision policy is versioned and frozen before a review window opens. No same-day policy rewrites.

---

## 10. Founder product decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Should time remaining count down between DEXAs (measured rate frozen, runway shrinking)? | **Yes** |
| D2 | Is Oct 31 firm, adaptive or aspirational? (Production has `flexibility: null`, so V2 treats it as firm.) | Founder call. Default for physique goals: **adaptive** |
| D3 | What should the engine propose when the schedule is at risk and the guardrail is clear: extend the deadline, accept a partial target, or a strategy review first? | Strategy review first, then timeline |
| D4 | When the schedule is at risk **and** the guardrail is pressured: protect the guardrail (extend the deadline) or the deadline (accept fat gain)? | **Protect the guardrail**, consistent with `automaticCutAllowed: false` and the Phase 2 guardrail response |
| D5 | Should goal revisions keep the original deadline as history and show "revised from Oct 31"? | **Yes** (versioned contract) |
| D6 | Is the 8–9% band direction-aware (below range acceptable during a gain)? | **Yes** |
| D7 | Should the approval surface be Native-first, or web first then Native? | Native read-only card first, then a Native approve command |
| D8 | Should confidence be split into "goal-completion outlook" and "evidence certainty", or relabelled? | Relabel now ("Goal outlook"); split later |
| D9 | Should the immediate Oct 9 situation be decided manually by the Founder now, outside this project? | Founder call. The engine has no path for it today. |

---

## 11. Recommended next bounded phase

**"Goal Adaptation Phase A — honest schedule + decision rungs (Server only, dormant presentation)."**

Scope:
- Steps 1 and 2 above.
- Golden tests against the production Sep 13 → Oct 9 V3 assessments.
- A read-only production dry-run that shows what each Weekly, Midweek, Monthly and DEXA would have recommended.
- No production writes, no republication, no Native work.

Exit criteria:
- The Oct 9 replay yields `resolve_constraint_conflict` / `review_timeline`.
- The Oct 6 replay yields `at_risk`.
- Founder approval of D1–D4 and D6 before implementation starts.

Phase B (proposal object + milestones) and Phase C (Native surfacing) follow, each with its own approval.

---

## 12. Unknowns

- Whether the Native Goals hub currently shows "On Track" for Build Lean Mass. It is inferred from code; the read model was not queried.
- Whether any production read has ever hit the Aug 15 overlapping-phase-date throw.
- Exact Goal Edit timing of the 10 lb / Oct 31 target, and the pre-repair start and phase dates. The JSON-store era kept no field history; Windows-host backups would be needed.
- Whether the Founder uses the web routes `/briefings/dexa/*` or `/briefings/review/*` at all today.
- Native history before the monorepo import `cf00c234` (2026-09-30).
- The Aug 15 published-vs-re-evaluated recommendation split is proven by production rows. *Why* the policy was rewritten that afternoon (Founder, ChatGPT or Codex direction) is not recorded in Git or handoffs before Sep 21.

---

## 13. Production read-only audit record

- **Authorization:** Founder in chat, 2026-10-09 ("authorize read-only prod audit"), after the auto-mode permission classifier had blocked the first attempt.
- **Runner:** the approved Mac console runner (`runAppConsoleContextGzipFile.mjs` from `4025f175`, restored into the ignored `.tmp/digitalocean/`), context `physiqueos-final-cutover-config`, app `bf57cf56…`, component `web`.
- **Gates:**
  - control-plane deployment `fc523740` ACTIVE, web and worker = `5e91aa5d`, nothing in progress;
  - payload requires runtime `PHYSIQUEOS_GIT_SHA` == `5e91aa5d…`;
  - owner = Founder.
- **Transaction handling:**
  - `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`;
  - `SHOW transaction_read_only` = **on**;
  - owner-scoped parameterized `SELECT`s only, `LIMIT`-bounded;
  - explicit `ROLLBACK`.
- **Results:** two passes. Markers `…20261009B` and `…20261009C` were each seen exactly once. Neither pass reported a failure and both exited 0.
- **Output:** only sanitized projections (owner id and e-mail scrubbed, strings truncated). No credentials, no raw evidence, no media. The raw output stayed in the session scratch directory and was not committed.
- **Writes:** none.

## 14. Safety

| Field | Value |
|---|---|
| production_mutated | false |
| deployed | false |
| testflight_uploaded | false |
| release pointer changed | false |
| goal/phase edits | none |
| other lanes' branches touched | none (DEXA republication, Native Option B / Build 94 untouched) |
| source changes | none (report only) |
