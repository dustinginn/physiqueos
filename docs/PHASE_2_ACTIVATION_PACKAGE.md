# Phase 2 Strategy and Expected Trajectory activation package

Status: production-ready contracts and temporary-clone simulation; not seeded,
accepted, activated, deployed, or published.

The seven separately authorized production repair/draft/review/acceptance
transactions and their rollback gates are specified in
[`CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md`](./CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md).

This document extends [Goal Contract Architecture V2](./GOAL_CONTRACT_ARCHITECTURE_V2.md),
[Phase Review Production Architecture](./PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md),
[Phase Review Commit Coordinator](./PHASE_REVIEW_COMMIT_COORDINATOR.md), and
[Phase Review Production Boundary](./PHASE_REVIEW_PRODUCTION_BOUNDARY.md), and
[Confidence V2 Production Integration](./CONFIDENCE_V2_PRODUCTION_INTEGRATION.md).

## Canonical identity

- Goal: `goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass`
- Phase 1: `goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08`
- Phase 2: `goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78`
- Strategy: `phase_strategy|goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass|goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78|v1`
- Expected trajectory: `phase_expected_trajectory|goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass|goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78|v1`

The Goal remains a 10 lb lean-mass increase by October 31, 2026. The accepted
body-fat Guardrail remains approximately 8–9%. The package builder binds exact
IDs and target semantics; it does not infer production meaning from Goal names.

## Existing source audit

| Source | Classification | Phase 2 use |
| --- | --- | --- |
| Applied Goal transition `goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3` | Canonical, accepted, consumed | Objective, Guardrails, calibration assumptions, evidence roles, Wednesday/Sunday coaching anchors |
| Applied protocol transition `protocol_transition_goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3` | Canonical, accepted, consumed | Small energy adjustments, approximately 1 g/lb protein basis, activity/recovery carry-forward, retained training/peptide/supplement references |
| Active Goal record | Canonical and reusable | Goal identity, target, date, accepted Guardrails and evidence map |
| July 18 DEXA `evidence_submission_20260718144114116_pdf_1_2026_07_18` | Canonical baseline evidence | Normalized Starting Forecast baseline summary; the raw record is not copied |
| Operating plan `operating_plan_founder_alpha` | Stale Goal ownership; cut/Phase 1-specific | Not used for Phase 2 prescriptions; its old Goal ID and 1900–2200 kcal range are not promoted |
| Execution items and protocol occurrences | Execution-owned | Historical IDs only; schedules, completion, reminders, exercises and administrations are excluded |
| Strategy/Goal pages and briefing JSX | Presentation-only | Not a semantic source |
| Abandoned transition `goal_transition_goal_visible_abs_at_rest` | Superseded duplicate | Not used |

The applied transitions are Phase 2-ready for intent and adjustment logic. True
maintenance, productive surplus, optimal activity reduction, and expected
weight-gain rate remain explicit gaps rather than being filled from stale data.

## Strategy contract

`phase_strategy_v1` contains identity, revision, lifecycle, acceptance audit,
semantic fingerprint, field-level source lineage, purpose, nine required
domains, and the canonical Strategy Hypothesis.

The Strategy establishes a controlled-surplus response model rather than a
permanent calorie number. It retains approximately 1 g/lb protein, sufficient
energy/carbohydrate support, progressive overload, weekly activity
interpretation, recovery context, authorized briefing cadence, and accepted
protocol references. Training is supporting evidence, not proof of lean-mass
gain. Daily evidence is not a direct Confidence trigger. Body-fat pressure can
trigger review, never an automatic cut; major changes require authorization.

Every semantic field has lineage entries with `field`, `sourceType`, `sourceId`,
`sourceRevision`, `path`, and `classification`. Lineage covers purpose, every
domain and `strategyHypothesis`. Explicit activation requirements supply the
additional Monthly, DEXA Event and qualifying Photo Event cadence types.

Semantic fingerprint:
`sha256_188a8b174942b56addd4bbe2af04f47d1c1655931228f3008416196c2699c60c`.
Lifecycle audit fields are excluded, so authorized acceptance does not change it.

## Expected Trajectory contract

`phase_expected_trajectory_v1` derives elapsed and remaining windows from actual
activation, assigns no Phase 2 evidence before activation, and uses uncertain
cumulative ranges of 0–4 lb in the early window, 0–8 lb through repeat
validation, and 0–10 lb in the final window. These are broad planning ranges:
zero remains possible, partial progress has value, and 10 lb is not promised.

Body-fat pressure remains independent of Objective progress. Weight logic warns
on acceleration, stagnation and volatility without inventing a universal weekly
rate. Training logic separates isolated regression from sustained broad
stagnation.

Required milestones are the Starting Forecast, first Phase 2 cadence review,
first qualifying post-transition Photo Event, September DEXA or next consistently
prepared comparison, derived mid-phase review, and October 24–31 final assessment.
Each declares timing, purpose, expected evidence, uncertainty reduced, review
capability, and completion-support capability.

Semantic fingerprint:
`sha256_d9b661c29d7863ce01a1e0925cbc0c3f2eb5e51535772fa53a3c69041e3cbbb6`.

## Acceptance lifecycle

Allowed states are `draft`, `ready_for_review`, `accepted`, `rejected`, and
`superseded`.

- Draft revision 0 becomes ready-for-review revision 1 after validation.
- Revision 1 becomes accepted revision 2 only with actor-bound
  `phase_activation_package_acceptance` authorization.
- Ready records may be rejected; accepted records may be superseded with an
  explicit replacement reference.
- Acceptance stores `acceptedAt`, `acceptedBy`, `acceptanceId`,
  `acceptanceIdempotencyKey`, and `acceptedRevision`.
- Stale revisions and idempotency conflicts fail closed; exact persisted replay
  is idempotent.
- Accepted semantic content is fingerprint-checked and immutable.

The coordinator requires exactly one accepted record per collection, exact Goal
and Phase, decision-bound expected revisions, complete content, valid lineage,
and no supersession. It no longer changes accepted records to an `active` state.
Goal and read-model pointers activate their use while records remain byte-exact.

## Strategy versus Execution ownership

| Concern | Strategy owns | Execution owns |
| --- | --- | --- |
| Energy/nutrition | Intent, small-change rules, signals, weekly flexibility | Intake logs, meals, screenshots and exact daily targets |
| Training | Overload intent, priority rule, interpretation conditions | Exercise IDs, sets, session structure and schedule |
| Activity | Health/body-fat intent, adjustment logic, weekly interpretation | Exact daily targets and completed activity |
| Recovery | Adaptation intent and review context | Protocol steps, reminders, occurrences and completion |
| Coaching | Cadence types and Confidence publication boundary | Generated briefing instances and delivery times |
| Peptides/supplements | Preserve accepted intent/references; no new claims | Dosage, administration, reminder, occurrence and completion |
| Guardrail | Range, pressure triggers, review/authorization rules | Evidence capture and completion state |

Validation rejects Execution-owned keys such as schedules, exact dates/times,
reminders, occurrences, completion, dosage/administration and exercise IDs.

## Starting Forecast input package

`phase_2_starting_forecast_input_package_v1` is constructed only after both
accepted records pass coordinator validation. It includes the canonical Goal
Contract with explicitly injected accepted semantics, accepted records, active
Phase 2, prior Goal/Phase 1 references, sorted historical Execution IDs, normalized
July 18 baseline (7.7%, 147.5 lb lean, 12.8 lb fat), latest canonical Confidence
V2 reference, Phase Review lineage, remaining timeline, semantic gaps, typed
Starting Forecast context, and deterministic SHA-256 fingerprint.

It excludes raw evidence, JSX, presentation copy, synthetic DEXA values,
unaccepted drafts, and V1 numeric conversion as V2 meaning. Repeated construction
from identical inputs is byte-equivalent.

## Future Founder seeding and acceptance plan

This plan is not authorized by this patch.

1. Verify the runtime byte hash/store revision, active primary Goal, corrected
   Phase 1 state/revision, planned Phase 2, and absence of matching records.
2. Make a whole-file byte backup and record its SHA-256 hash.
3. Perform the separately authorized canonical phase-date repair. Re-read and
   verify before Strategy work.
4. Append the Strategy draft to `phaseStrategies`; validate to revision 1. After
   explicit Founder authorization, accept revision 2 as `user_founder_001` with
   key `accept-founder-phase-2-strategy-v1`.
5. Append the trajectory draft to `phaseExpectedTrajectories`; validate to
   revision 1. After separate explicit authorization, accept revision 2 as
   `user_founder_001` with key `accept-founder-phase-2-trajectory-v1`.
6. Verify exactly one accepted unsuperseded record at each exact ID, revision 2,
   correct semantic fingerprint, actor, timestamp, acceptance ID/key, and no
   active Phase 2 pointer.
7. Only after the August 15 review and separate Begin authorization, submit a
   decision with `expectedStrategyRevision: 2` and
   `expectedTrajectoryRevision: 2`.

Expected file fingerprints change once per separately authorized whole-file
transaction: date repair, Strategy lifecycle, trajectory lifecycle, and later
activation. Confidence deployment/publication and production wiring remain
separate.

Verification queries count exact Goal/Phase/status/revision matches, compare
semantic fingerprints, reject competitors, verify no pre-Begin Goal pointers,
and compare protected hashes for protocols, Execution, briefings, evidence,
DEXA, photos and transition history.

On failure before replacement, discard the candidate. On failed post-write
verification, stop, atomically restore the whole-file backup, verify the original
byte hash, and rehydrate the singleton. Never synthesize a reverse patch.

## Deployment order and safety

1. Contract code/tests (this patch).
2. Separately authorized phase-date repair.
3. Separately authorized Strategy lifecycle.
4. Separately authorized trajectory lifecycle.
5. Confidence V2 deployment/publication enablement, if approved.
6. Phase Review boundary deployment and production wiring, if separately
   approved; the server action is currently disconnected.
7. User-authorized August 15 Begin decision.

This patch performs none of steps 2–7. It does not deploy, restart, migrate,
publish Confidence, create production artifacts, activate Phase 2, complete
Phase 1, or mutate Founder storage.
