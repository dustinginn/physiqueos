# Recovery Briefing V1 — one-card prototype and Server shadow assessment

- Status: **reviewed candidate; intentionally unwired and not deployed**
- Repository: `dustinginn/physiqueos`
- Report generated: 2026-10-01T22:45:16Z
- Production Server source base: `5804e88dac0db6bb04cf43647d6387efeab25906` (`origin/combined-app-platform-cutover`)
- Implementation branch: `codex/recovery-briefing-v1-shadow-assessment-server`
- Pushed candidate SHA: `1bfa92ef874c3c96f05b23a9d3cbdfb956384156`
- Deployed Recovery SHA: **none**
- Main report publication base: `f80ffe7b0fffb3f29bf45fd52829abdb84690e6d`

## Executive result

Recovery Briefing V1 now has a non-shipping one-card visual prototype and a versioned, pure Server shadow-assessment candidate. The candidate implements the approved personal-baseline, persistence, magnitude, foam, and training semantics without wiring itself into Briefing publication, V3, Goal/Strategy Confidence, Narrative, recommendations, settlement readiness, clients, schedules, repositories, or persistence.

Deployment was deliberately refused. There is no approved production `recovery_shadow_input_authority_v1`, schedule, or validation-only composition boundary. The shadow entry point therefore remains unreachable from production and fails closed without explicit authority. This is the safest independently reversible result: the production system is unchanged.

## One-card visual revision

The prototype now renders exactly one contiguous Recovery card:

- no Recovery-specific secondary hero;
- no separate headline card;
- no nested/inset commentary card;
- textual Green/Yellow/Red/Not enough data status, so meaning is not color-only;
- period average, prior-28-night baseline comparison, and Sleep trend remain;
- Green has no commentary;
- Yellow/Red commentary is ordinary inline text inside the same card;
- foam rolling remains a small execution row;
- insufficient data is neutral.

All screenshots are synthetic/redacted, 500×900 PNGs, and were regenerated and visually inspected on the exact candidate SHA:

1. [Weekly Green](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/weekly-green.png)
2. [Weekly Yellow](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/weekly-yellow.png)
3. [Weekly Red](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/weekly-red.png)
4. [Midweek Green](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/midweek-green.png)
5. [Monthly Yellow](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/monthly-yellow.png)
6. [Insufficient data](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/insufficient-data.png)
7. [Green with imperfect foam](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/green-imperfect-foam.png)
8. [Yellow while training holds](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/yellow-training-holds.png)
9. [Red with corroboration](https://github.com/dustinginn/physiqueos/blob/1bfa92ef874c3c96f05b23a9d3cbdfb956384156/agent-handoffs/artifacts/recovery-briefing-v1/screenshots/red-corroborated.png)

The self-contained prototype is at `agent-handoffs/artifacts/recovery-briefing-v1/prototype/index.html` on the candidate SHA.

## Assessment contract and implementation

New versioned components:

- `recovery_status_policy_v1` in `RecoveryBriefingPolicyV1.js`;
- `recovery_briefing_v1` in `RecoveryBriefingAssessmentServiceV1.js`;
- `recovery_briefing_shadow_result_v1` and fail-closed `recovery_shadow_input_authority_v1` in `RecoveryBriefingShadowServiceV1.js`;
- a serializable JSON Schema artifact with shadow, non-strategic, no-persistence, no-Confidence, no-causality, and foam-invariance constants.

The assessment is pure and deterministic. Inputs carry the exact closed period/cadence/timezone, explicit evidence cutoff/evaluation time, normalized Sleep duration, bounded training context, and foam occurrences. The result contains deterministic assessment identity/digest, schema/policy versions, status and reasons, coverage, personal baseline, period summary, trend projection, foam context, optional training corroboration, inline commentary contract, limitations, and evidence lineage.

Internal threshold decisions use unrounded values; rounding occurs only in serialized presentation fields. Dates are strict calendar dates, evidence available after the cutoff is excluded, current-period data never enters the baseline, and future records cannot change a closed assessment.

## Baseline and candidate policy

Baseline:

- exactly the prior 28 calendar-night window immediately before the period, using reliable duration nights;
- current period excluded in full;
- no later sleep day and no record available after the evidence cutoff;
- minimum 14 usable nights;
- center = median total Sleep minutes;
- robust spread = `max(15m, 1.4826 × MAD)`;
- timezone-uncertain rows may support reliable duration only and cannot create clock-time claims.

Night flags:

- material low: `baseline median − max(30m, robust spread)`;
- severe low: `baseline median − max(75m, 2 × robust spread)`.

Cadence rules match the approved design exactly:

- Weekly: at least 5/7 nights; Yellow = ≥3 material-low, run ≥2, and material period-average deficit; sleep-only Red = ≥5 severe, run ≥4, and severe average deficit; corroborated Red = already-Yellow Sleep + ≥2 severe nights + independent material training constraint.
- Midweek: all three Sunday–Tuesday nights; Yellow = ≥2 sequential material-low plus average deficit of at least `max(45m, robust spread)`; Red is unavailable.
- Monthly: at least 20 nights; Yellow = ≥2 week-like Yellow subperiods or ≥12 material-low nights; sleep-only Red = ≥60% severe and severe average deficit; corroborated Red = Monthly Yellow + ≥6 severe nights + independent material training constraint.

These are calibration parameters, not medical thresholds.

## Foam and training semantics

Foam rolling is `execution_context_only`. It cannot set, escalate, or rescue status. Authoritative schedule counts do not mix observed-only completions into their numerator, and pre-schedule observed completions have no invented denominator.

Training can corroborate only an already-material severe Sleep pattern. It cannot make typical Sleep non-Green. Current training must be explicitly bounded to the Recovery period, backed by evidence, and compared with the preceding four eligible comparable weekly periods; Monthly expectation is scaled by period length. Negative/fractional sessions, insufficient baselines, missing evidence, planned rest, deload, travel, illness, injury, and schedule changes fail closed or become explicit limitations. Commentary may say an association accompanied/followed the Sleep pattern; causality is always `not_inferred`.

Repeated associations were not implemented as status logic or user-facing metadata.

## Shadow architecture and isolation proof

The chosen architecture is operational and persistence-free:

- the assessment and shadow runner import only the new policy/assessment modules plus Node hashing;
- no repository/store dependency;
- no runtime clock dependency;
- no artifact publication;
- no shadow collection;
- no client read path;
- no schedule;
- no composition-root import;
- no installed input authority;
- no historical linkage or backfill.

The runner rejects missing/disabled/malformed authority; any authority permitting persistence, client reads, Briefing publication, strategic eligibility, or historical backfill; mixed/operational purpose; historical purpose in top-level or nested provenance; and prospective validation-only rows lacking trusted availability time. Its isolation ledger fixes every strategic/user-facing mutation to false and persistence to `none`.

Repository-wide reference inspection found no existing application/composition, Briefing, V3, Confidence, Narrative, recommendation, client, or persistence path importing the shadow runner. The branch diff changes no existing shipping Server or Native source.

## Historical and production safety

No production query, write, backfill, historical assessment, Briefing rewrite, Confidence mutation, strategic evidence, or deployment occurred in this task.

The already-authorized July–September zero-write aggregate replay from the design phase remains the calibration evidence. It was not rerun and its sanitized aggregate artifact is unchanged. No nightly Founder values are included here.

Sleep remains validation-only and strategically quarantined. Existing strategic-quarantine, strategic-eligibility, evidence-read, and V3 pipeline regression tests pass.

## Oct 2 canary

At report time it was 2026-10-01 15:45 PDT; the October 2 natural canary was not yet observable. It was not manually triggered or queried. Because no approved Recovery shadow input boundary is installed, even a naturally arriving validation-only night will not enter this candidate until a separately reviewed authority/composition change is approved.

## Verification on exact candidate

Passed on `1bfa92ef874c3c96f05b23a9d3cbdfb956384156`:

- focused Vitest: **6 files, 89 tests passed**;
  - Recovery assessment and adversarial/metamorphic tests;
  - Recovery shadow authority/isolation tests;
  - HealthKit Sleep strategic eligibility;
  - HealthKit Sleep strategic quarantine;
  - HealthKit Sleep evidence read;
  - Confidence/Narrative V3 pipeline.
- prototype/artifact verifier: one-card rendering across 9 scenarios, shadow schema guardrails, and sanitized zero-write replay invariants;
- ESLint on all five new Server source/test files;
- Node syntax checks on all three new source modules;
- `git diff --check`;
- nine screenshots rendered and visually inspected.

Fresh independent review focused on strategic leakage, historical mutation, baseline/no-lookahead correctness, threshold exactness, foam invariance, training non-causality, serialized integrity, and shadow isolation. Review findings were fixed and re-reviewed. Final review result: **no remaining findings**. The review independently required the candidate to remain unwired because production lacks an approved input authority/composition boundary.

Not run:

- no full repository test suite or production build, proportional to the isolated/unwired source;
- no live production query or mutation;
- no deploy/canary trigger;
- no Web/Native integration or simulator/device work.

## Deployment and rollback

Deployment: **none**. Production Server and shipping Native are unchanged. The prior design report recorded deployment authority `35f5cea0-535d-445e-8b76-1d7db5f98943` at Server source `5804e88d…`; this task did not independently re-query the provider because deployment was intentionally refused.

Rollback today is deletion/abandonment of the feature branch; there is no runtime state to reverse. If later integrated, rollback is removal of the single composition import/authority record because the assessment remains repository-free and no historical data migration is required.

## Future additive Briefing seam

A later publication phase should be a separate reviewed change:

1. install a Server-owned, prospective-only non-strategic input authority with an explicit effective Sleep day;
2. compose the pure assessment only after the existing closed period/evidence cutoff is established;
3. calibrate shadow output without persistence or clients;
4. after Founder approval, add one optional immutable `recoveryAssessment` field to newly generated Weekly/Midweek/Monthly artifacts only;
5. place the single Server-authored card in the approved cadence position;
6. keep Sleep out of settlement readiness and keep Recovery out of V3/Confidence;
7. add clients only after stored-contract and accessibility review.

No historical artifacts should be rewritten.

## Remaining state and next recommendation

Blocker to active shadow execution: no approved non-strategic validation-only input authority/composition boundary.

Recommended next phase: wait for the October 2 Sleep canary to arrive naturally and complete Sleep acceptance first. Then review a narrowly scoped, prospective-only composition proposal. Do not deploy or wire this branch until that boundary is independently approved.

The implementation worktree was clean after commit. The original checkout's unrelated pre-existing untracked reports were preserved untouched. Temporary test configuration/cache files were not committed. No credentials, private production exports, raw Founder evidence, or unredacted health data were pushed.
