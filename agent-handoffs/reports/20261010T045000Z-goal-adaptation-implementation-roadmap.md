# Goal Adaptation: incremental implementation roadmap (plan only)

- Task id: `claude-goal-adaptation-implementation-roadmap-20261010`
- Generated: 2026-10-10T04:50Z
- **Status:** plan only. No code, schema, production, deployment or TestFlight change.
- **Basis:**
  - architecture audit `20261010T004146Z-goal-intelligence-existing-engine-audit.md` (main `ba50a591`);
  - accepted V2 design at design branch `7a23c4b0`;
  - Founder decisions in `20261010T044954Z-goal-adaptation-v2-final-acceptance-and-decisions.md`.
- **Authority, verified today:**
  - Production Server is `85a98025` (deployment `40122906`, ACTIVE; web and worker match). Native release is Build 94, `49829781`.
  - `git diff 5e91aa5d..85a98025` shows **no change** in the goal-intelligence engine, forecast, Phase Review or DEXA-route files. `git diff 9d0a2069..49829781` shows **no change** in Native Goals presentation or Goals contracts.
  - The audit's code references therefore still hold.

## Principles

1. **Extend, don't rebuild.**
   - Reuse the live V3 engine (`src/domain/intelligence/v3/**`), its per-artifact persistence, and the Phase Review approval and commit machinery.
   - Add exactly one new decision object: the adaptation recommendation.
   - Add one new versioned record: the goal-contract revision.
2. **Dormant first.** Every Server phase ships behind a flag, OFF. It first runs in shadow against production artifacts (read-only), and only then becomes visible.
3. **The user approves everything.** There are no automatic goal, phase, guardrail or Operating Plan changes, and each change gets one coordinated approval. `automaticGoalRevisionAllowed: false` and `automaticStrategyAdjustmentAllowed: false` stay invariant.
4. **The policy is frozen per release.** Decision thresholds live in a versioned `goal_adaptation_policy_vN` and are never changed on the day a decision is made. This addresses the Aug 15 lesson from the audit.
5. **Each phase is separately gated.** Every phase has its own Founder gate and its own GitHub report (per the reporting contract). Native work is sequenced after Build 94 and never shares a branch with the Codex lane.

## What is reused

| Need | Existing component (production `85a98025`) | How it is reused |
|---|---|---|
| Schedule, progress, required vs expected rate | `src/domain/intelligence/v3/ConfidenceV3ProjectionService.js` (`evaluateTrajectory`) | Timing for each option (with uncertainty) and the honest schedule state |
| Recommendation ladder | `src/domain/intelligence/v3/StrategicInterpretationV3Engine.js` (`resolveRecommendation`) | Gains new rungs; becomes aware of the schedule |
| Guardrail evaluation | `src/domain/intelligence/v3/DeclarativeGoalEvaluator.js` and `src/domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js` | Becomes direction-aware and structured (no text regex) |
| Direction semantics already designed | `src/domain/confidenceV3/GuardrailTransitionService.js` (dormant) | Its rules are moved into the V3 evaluator, after which the dead `confidenceV3/**` tree is retired |
| Publication in every briefing family | `src/domain/services/StrategicInterpretationPublicationServiceV3.js` | Attaches the recommendation and applies the trigger policy |
| Evidence and intake sufficiency | V3 adapter evidence bindings and intake-completeness signals; HealthKit canonical days | Input to the calibration checkpoint |
| Eligibility and authorization pattern | `src/domain/services/PhaseReviewEligibilityService.js`, `PhaseReviewArtifactService.js`, `PhaseReviewAuthorizationService.js` | The same pattern for adaptation (eligibility → authorization bound to a fingerprint) |
| Atomic multi-record commit | `src/domain/services/PhaseReviewCommitCoordinator.js`, `PhaseReviewCommitParticipants.js`, `ProductionPhaseReviewCoordinatorFactory.js` | Template for the adaptation commit, which adds new participants |
| Effective dates | `src/domain/services/PhaseTransitionDatePolicy.js` | Phase and plan effective dates |
| Append-only Operating Plan changes | `src/domain/services/ActiveProtocolSuccessorService.js` (`protocolVersions`) | Energy change plus optional edits; everything else carries forward |
| Goal plan edit semantics | `src/domain/services/GoalPlanUpdateService.js` | Field validation, now wrapped in versioning |
| Your Journey data | `src/domain/services/ActiveGoalCurrentStateService.js` (turning points), phases on the goal | Gains revisions, decisions and milestones |
| Briefing copy and placement | `src/domain/intelligence/v3/NarrativeV3CompositionService.js`, `BriefingGoalConfidencePresentationService.js`, `WeeklyBriefingPresentationService.js`, `MonthlyReviewPresentationService.js` | Goal decision card placed last; evidence coaching inside the existing Coach's Take and "Into Next Week" |
| Home priority | `src/domain/services/ExecutionPriorityProjectionService.js` | The dismissible decision priority |
| Native write path | `src/application/native/NativeProductionContractService.js` (command allowlist and receipts) | New, idempotent decide and defer commands |
| Native surfaces | `ios/PhysiqueOS/Presentation/Goals/GoalDetailView.swift` (Your Journey), `ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift` (today hard-codes `phaseReview: nil`) | Journey history; briefing decision card |

## Fixes folded in along the way (from the audit)

| Fix | Phase |
|---|---|
| Phase-overlap chronology defect: Phase 1 `completedAt` Aug 16 vs Phase 2 start Aug 15 | C |
| The active or terminal phase has no review milestone | C |
| `operatingPlan.primaryGoalId` is stale | C |
| Phase Review inputs are regex-parsed from narrative text | A |
| `FounderPhaseCorrectionService` projection runs on every read | C (remove once covered by tests) |
| Goals hub falls back to "On Track" | D |
| Dead `confidenceV3/**` tree | A (harvest the rules, then delete) |

---

## Phase 0: policy, contracts and golden fixtures

Server only. No runtime wiring. Size **S**.

**Policy: `goal_adaptation_policy_v1` (versioned constants)**

- **Calibration checkpoint (decision 1):** at least 28 days in the current goal or phase.
  - **Evidence sufficiency**, proposed defaults:
    - at least one DEXA at or after the phase-start baseline;
    - morning weight on at least 4 of 7 days on average;
    - intake coverage on at least 5 of 7 days, where HealthKit-synced days count automatically;
    - training logged against plan.
  - **Adherence**, proposed default: intake within the plan's tolerance on most days, with activity and training at or near plan.
  - If either test fails, the result is `not_eligible_improve_evidence` or `not_eligible_improve_adherence`. That result produces coaching, never an adaptation card.
- **Below range while building (decision 2):**
  - The first reading below range produces `below_range_watch`, which is coaching and monitoring only.
  - If the downward trend persists across the following weekly evaluations, the result is `below_range_review`, which makes the goal eligible for adaptation. Proposed default: 3 consecutive weekly evaluations, or confirmation by the next DEXA.
- **Trigger matrix:**
  - Weekly and Monthly: originate.
  - DEXA: may originate.
  - Photo: may originate only when its evidence is reliable and corroborated.
  - Midweek: links only.
- **Materiality thresholds:**
  - when calories are shown on review;
  - when a recommendation is superseded, based on fingerprints of evidence, plan and goal revision.

**Contracts (additive collections in `canonical_goal_records`, mapped in `src/platform/migration/phase4DomainCollections.js`)**

- **`goalAdaptationRecommendations`:**
  - id, goal and phase, triggering artifact, policy version, evidence fingerprint;
  - ranked options, each with feasibility and timing (including uncertainty) and validation rules;
  - lifecycle: `open → snoozed_until_weekly | kept_current_plan | removed_from_home | decided | superseded`;
  - `supersededBy`, `notificationIntentId`.
- **`goalContractRevisions`:** append-only. Each revision records version, target, timeline (with `flexibility`), structured guardrails, phase plan, reason, decision id and author. The goal keeps a `contractRevision` pointer.
- **Structured guardrail:** `{ metric, lower, upper, lowerMeaning, upperMeaning, effectivePeriod: phase | until_date | permanent | condition }`.
- **Phase types:** a new `temporary_leaning` type, with end rules `outcome | time | first_of` and a review-on-time-limit milestone. `src/domain/models/phaseStrategy.js` today hard-codes lean-gain purposes, so it is generalized.
- **Journey event contract:** revisions, transitions, milestones and decisions, for Your Journey (decision 3).

**Golden fixtures**

- Sanitized replays of the production V3 assessments from Sep 13 to Oct 9 (values from the audit).
- Synthetic cases:
  - below-range watch, then persistent;
  - evidence insufficient;
  - adherence insufficient;
  - Midweek trigger (must not originate);
  - a superseded recommendation.

**Exit criteria:** contract tests pass; documentation is in `docs/`; zero runtime imports.

**Founder gate:** approve the proposed default thresholds, or adjust them.

## Phase A: honest schedule and decision rungs

Server only, shadow. Size **M**.

- **Runway:** the remaining runway between DEXAs uses elapsed time, but only in the denominator (`ConfidenceV3ProjectionService`). The measured rate stays evidence-only.
- **Ordering:** in `ConfidenceNarrativeV3Pipeline`, the recommendation is computed after the projection, or receives `scheduleState`.
- **New rungs:**
  - `review_timeline`: at risk, guardrail clear;
  - `resolve_constraint_conflict`: at risk and guardrail pressured or breached;
  - `below_range_watch` → `below_range_review`.

  Each is gated by the calibration checkpoint (decision 1).
- **Guardrail:** direction-aware and structured in the evaluator; regex inputs in `GoalAwarePhaseReviewRecommendationService` are replaced by V3 fields.
- **Evidence coaching:** when not eligible because of evidence or adherence, the engine emits concrete improvement items into the existing Coach's Take and "Into Next Week" fields. It never prompts for data HealthKit already syncs.
- **Output:** an `adaptationEligibility` block persisted inside each V3 assessment. Nothing is rendered.

**Tests:**
- Oct 6 replay gives `at_risk`.
- Oct 9 replay gives `resolve_constraint_conflict`.
- The Aug 15 Phase Review outcome is unchanged.
- Midweek never originates.
- Below-range watch moves to review only after it persists.
- The full V3 and briefing suites show no regressions.

**Gate:** a read-only production dry-run over every stored V3 artifact, producing a "would have said" table. The Founder reviews it, then authorizes a dormant deploy.

## Phase B: options, ranking, revalidation and energy calibration

Server only, shadow. Size **L**.

- **Option generator:**
  - options: lean out first, keep building with revised limits, keep current plan, custom;
  - ranking, with the top option recommended only when evidence supports it (Q1);
  - timing for each option with uncertainty, reusing `evaluateTrajectory` on each option's assumptions (Q3).
- **Server-authoritative validation:**
  - an unchanged firm ceiling is incompatible with "keep building" above current body fat;
  - keeping a likely-unachievable date is allowed with a persistent warning;
  - range edits higher or lower, with an effective period.
- **Lifecycle:**
  - recommendation persistence;
  - revalidation on entry and at approval;
  - supersede on a material fingerprint change (Q2);
  - a single notification intent per recommendation id;
  - the Home priority projection (`ExecutionPriorityProjectionService`);
  - "Not now" states.
- **Energy calibration service (shadow):** proposes intake and activity *ranges* with uncertainty, drawn from the Founder's own history:
  - May–Jul cut;
  - current build at 2,500/800;
  - DEXA deltas;
  - intake, activity and weight trend.

  It is backtested against historical periods and never shown until validated. Until then, the UI keeps the "calculated" placeholder.

**Tests:** option and validation unit tests, revalidation and supersede, calibration backtests with error bounds.

**Gate:** the Founder reviews shadow recommendations for recent weeks and the calibration backtest.

## Phase C: approval and atomic commit

Server, flag OFF. Size **L**.

- **`GoalAdaptationCommitCoordinator`**, built on the Phase Review coordinator pattern: token bound to store revision, idempotency key, unit of work. Its participants:
  1. decision record;
  2. goal-contract revision (n → n+1, n retained);
  3. structured guardrail revision with an effective period;
  4. phase transitions: pause Lean Mass Build at its measured progress, and start a `temporary_leaning` phase or a revised build;
  5. milestones: outcome DEXA, time-limit review (Q4), next calibration checkpoint;
  6. `protocolVersions` for Energy plus any optional edits, with all other strategies carried forward;
  7. Starting Forecast;
  8. Journey events;
  9. recommendation set to `decided`.
- **Revalidation:** a stale recommendation at approval is rejected and superseded.
- **Native commands:** `goal-adaptation.decide.v1` and `goal-adaptation.defer.v1` (remind with Weekly, keep plan, remove from Home), added to the `NativeProductionContractService` allowlist with receipt idempotency.
- **Fixes:** chronology overlap, terminal-phase milestone gap, stale Operating Plan pointer.

**Tests:**
- fault injection per participant (all-or-nothing);
- idempotent replay;
- no automatic transition reachable from any path;
- memory budget on the 1 GB worker (the photo-confirmation OOM history);
- read-model parity.

**Gate:** Founder-authorized guarded Server deploy with the flag OFF; postdeploy zero-write audit.

## Phase D: Native presentation

The first Build after Build 94. Size **L**.

- **Briefings:** the goal decision card appears last in the DEXA, Weekly and Monthly mappers (`ProductionBriefingMapper.swift`). Midweek shows a link only.
- **Home and notification:** Home priority, the "Not now" sheet, and a detail-free notification.
- **Decision flow:** Option B screen → Keep building, or Leaning setup → Operating Plan sheet → Review & approve → Phase started.
- **Later states:** Phase complete (honest measured changes) and Time-limit review.
- **Your Journey (decision 3):** `GoalDetailView` "The path · Your Journey" interleaves phase cards with revision, decision and milestone entries. There is no separate history page.
- **Goals hub:** the "On Track" fallback is replaced by real status.
- **Build approach:** feature-flagged, with Sandbox fixtures; UI tests in Dark and Mineral Light at 135% type. A design-parity review is held against the accepted V2 board.

**Gate:** Founder design-parity review, then TestFlight under release authority (Codex or Claude per assignment). The release pointer is updated only on accepted release.

## Phase E: activation

Staged. Size **S**.

1. Shadow visible to the Founder only: read-only proposals, approval disabled.
2. Founder approval enabled.
3. Monitoring, then reporting.

The kill switch stays on the Server flag, and each step has its own GitHub report.

---

## Sequencing

| Phase | Depends on | Lane | Ships |
|---|---|---|---|
| 0 | — | Server (Claude) | Docs and contracts only |
| A | 0 | Server | Dormant deploy |
| B | A | Server | Dormant deploy |
| C | B | Server | Deploy, flag OFF |
| D | C contract frozen; Build 94 accepted | Native | TestFlight build after Build 94 |
| E | C + D | Both | Flag flips (Founder) |

Phases A and B can overlap. Phase D can start on frozen contracts with fixtures, but nothing turns on before Phase C is live and audited.

## Risks

| Risk | Mitigation |
|---|---|
| Recommendations driven by noisy single scans | Calibration checkpoint; persistence windows; supersede rules |
| Calorie advice not grounded in evidence | Energy calibration stays shadow until backtested; placeholders never become prescriptions |
| Multi-record commit failures | Proven Phase Review coordinator pattern; fault-injection tests |
| Worker memory | Bounded loads, measured against the 1 GB worker |
| Lane collisions | Separate branches; Native after Build 94; no shared release pointer |

## Decision needed now

- **Approve Phase 0 + Phase A as the next bounded task.** Server only, dormant, ending in a read-only "would have said" replay for review.
- The proposed threshold defaults (evidence, adherence, below-range persistence) are reviewed at the Phase 0 gate; they do not block the start.

## Tests

Not applicable: plan only. File paths were verified on production `85a98025`.

## Safety

| | |
|---|---|
| implemented | no |
| production access | control-plane read only |
| deployed / TestFlight | no / no |
| release pointer | unchanged |
| other lanes | Codex Build 94 untouched |
