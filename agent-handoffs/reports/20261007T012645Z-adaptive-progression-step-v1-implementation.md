# Adaptive progression-step V1 implemented — HOLD pending accepted production shadow

- Generated: 2026-10-06 18:26 PDT / 2026-10-07T01:26:45Z
- Task authority: `a2d82968503f8a274bd8c7ede479dd410851e46a`
- Validated eligibility base: `999a225a38ced9ddb16a65bbe840896472265468`
- Adaptive V1 candidate: `1b6687ffbf016575e674d12406200c3792eb90a7`
- Candidate branch: `codex/adaptive-progression-step-v1-20261007`
- Current production Server / rollback authority: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Production-read tooling: byte-identical `d789ce2770eda2f9bdb13a48bbc572901f2c61e2`
- Recommendation: **HOLD / DO NOT DEPLOY**
- Production deployment or mutation: **NO**
- Native Build 89 / Build 90 touched: **NO**

## Executive decision

The small evidence-adaptive progression-step V1 is implemented, tested, committed, and pushed as isolated Server candidate `1b6687ff`. It starts exactly from `999a225a` and contains one implementation commit. The validated eligibility architecture remains in its original order and behavior; the new selector is called only after eligibility is true and after existing recovery precedence.

Local evidence and contract gates are green. The required deterministic regression fixtures produce the approved results:

- Pull-Up: **REP**, 4 × 8 at the same +25 lb;
- Cable Machine Front Raise: **REP**, 4 × 11 at the same 150 lb;
- Spider Curl: **Maintain**, selector not invoked at 13/14 exposure days.

The single authorized production console shadow completed its guarded read-only transport, canonical frame, runtime-SHA check, `transaction_read_only=on` fence, explicit rollback, success marker, zero remote exit, and post-read authority check. It then failed closed before accepting any exercise shadow because the sanitized active Training authority projection did not satisfy the exact one-active-protocol / one-active-version assertion: `STRATEGY_AUTHORITY_AMBIGUOUS`.

No second console call was made. Because the fresh production strategy authority was not accepted, the production Pull-Up/Cable/Spider comparisons cannot be claimed from this attempt. Under the task's deployment gate, the correct decision is **HOLD / DO NOT DEPLOY** despite the green implementation candidate.

## Candidate topology

| Item | Result |
| --- | --- |
| Parent | exact `999a225a38ced9ddb16a65bbe840896472265468` |
| Candidate | `1b6687ffbf016575e674d12406200c3792eb90a7` |
| Ahead / behind base | 1 / 0 |
| Larger prescription candidate used | no |
| Migration / backfill | none / none |
| Persisted learned state | none |

## Implemented V1 policy

Eligibility was not redesigned. The existing Server still owns:

- configured successful-session count;
- Founder 14-day compatibility floor;
- first qualifying-success exposure anchor;
- repeated successes not resetting exposure;
- load/material context changes resetting exposure;
- exact exercise, execution-variant, and relationship partitions;
- regression/recovery precedence;
- same-day semantics;
- fail-closed strategy ambiguity.

Only after those gates pass, the new selector recomputes a bounded exact-context summary from finalized canonical Training evidence.

### REP support

A rep step requires a complete uniform current working-set profile, known canonical load semantics, and an observed non-regressing same-load rep advance. It is allowed when the current load run is still rebuilding the immediate prior transition or when no load step is supported. The target is exactly +1 rep on every current working set at the same load.

### LOAD support

A load step requires exactly one positive increment size recurring at least twice across compatible exercise/variant/relationship/load-semantics/unit/set-count transitions. Current load must be positive, the current profile must meet every relevant historical pre-transition profile, and neither an unresolved current rebuild nor unresolved same-load regression may exist. Weighted-bodyweight increments can be established only by weighted-bodyweight → weighted-bodyweight transitions; bodyweight → weighted-bodyweight is a material transition but never an increment vote.

The load step exposes the evidence-supported next load and intentionally leaves next reps null. V1 never invents reset reps.

### Fail-closed cases

The selector returns `kind: none` for sparse evidence, a single increment observation without rep support, competing recurring increment sizes, unknown/contradictory load semantics, a non-uniform current profile, or no uniquely supported proposition. There is no rep range, exercise-name rule, low-rep threshold, ML model, new collection, migration, or stored learned state.

## Server contract and clients

The additive `progressionStep` object contains:

- `kind`: `reps | load | none`;
- `currentLoad`, `nextLoad`;
- `currentRepTarget`, `nextRepTarget`;
- canonical `loadType`, `unit`;
- stable `reasonCode` and `confidence`.

Legacy mapping is conservative:

- REP: current load plus the +1 rep target; `use_suggestion` remains safe;
- LOAD: evidence-supported next load, null reps, and `consider_progression`, so an older client cannot auto-apply a fabricated reset prescription;
- NONE: no suggested target.

The Web Logger now consumes the Server-projected ordinary and contextual recommendation arrays rather than recreating progression logic in client state. Native remains presentation-only and may ignore `progressionStep`; existing top-level fields remain available.

## Required real-case regression fixtures

### Weighted Pull-Up

Fixture: bodyweight 4 × 13 → +25 lb 4 × 6; three 4 × 6 sessions, one mixed 6/7 session, then two 4 × 7 sessions. Eligibility passes. The bodyweight → weighted transition cannot seed an added-load increment, the +25 run has advanced without regression, and the prior 4 × 13 profile remains unrecovered.

Result: `reps`, +25 lb, current 7, next 8, `same_load_rep_rebuild_supported`, supported.

### Cable Machine Front Raise

Fixture: 130 → 140 lb (+10), 4 × 13 → 4 × 12; 140 → 150 lb (+10), 4 × 12 → 4 × 9; current 150 lb run contains two 4 × 9 and five 4 × 10 sessions. Eligibility passes. The +10 size is recurrent evidence, but the current 4 × 10 remains below the immediate pre-transition 4 × 12 profile.

Result: `reps`, 150 lb, current 10, next 11, `same_load_rep_rebuild_supported`, supported. The selector does not choose 160 lb today and does not invent 8 reset reps.

### Spider Curl

Fixture: 50 lb, 4 × 11, three qualifying sessions, 13 exposure days.

Result: Maintain, `minimum_exposure_gate_pending`; selector not invoked.

## Files changed

- `src/domain/services/AdaptiveTrainingProgressionStepSelector.js`
- `src/domain/services/AdaptiveTrainingProgressionStepSelector.test.js`
- `src/domain/services/TrainingLoggerProgressionService.js`
- `src/domain/services/TrainingLoggerProgressionService.test.js`
- `src/application/core/CoreNavigationReadService.js`
- `src/application/core/CoreNavigationReadService.test.js`
- `src/app/preview/training-logger/TrainingLoggerPreviewState.js`
- `src/components/training/TrainingLoggerClient.jsx`
- `src/app/log/training/TrainingLoggerProductionState.test.js`
- `src/app/log/training/TrainingLoggerProductionIntegration.test.js`
- `vitest.phase6.config.js`
- `vitest.phase6.training.config.js`

## Local verification

Green candidate gates:

| Gate | Result |
| --- | --- |
| Focused V1 selector fixtures | **17/17** |
| Focused progression + Logger + Operating Plan | **137/137 across 13 files** |
| Exact Phase 6 Training | **185/185 across 17 files** |
| Core/Native projection contract | **38/38** |
| Web/Logger projection and state subset | **96/96 across 4 files** |
| Changed-file ESLint | clean |
| `git diff --check` | clean |

The broader Phase 6 run completed with **565 passing / 568 executed tests plus one suite unable to collect**. Its unchanged out-of-scope baseline failures are:

- two tests and `validate:phase6` require absent machine-local `private/founder/runtime-store.json`;
- one Photos route assertion expects the obsolete `getPhotosTimelineReport` source name;
- one provider-build portability assertion compares macOS `/var` with its `/private/var` canonical path.

The same baseline issues were already documented by the prior progression refinement. No out-of-scope file was changed to mask them.

## Single authorized production shadow

### Fresh authority

The pre-read control-plane check accepted production `b7eb1e39`. The mandatory post-read no-data check was green:

| Authority | Result |
| --- | --- |
| App | `bf57cf56-48cc-4cd6-90e4-a23ee5381741` / `physiqueos-foundation-staging` |
| Active deployment | `6fa4e887-8849-450b-b068-5bdb11b90009` |
| Phase / progress | ACTIVE / 9 of 9 |
| In-progress deployment | none |
| Web / worker source | exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` |
| Health / build | `ok` / `physiqueos-b7eb1e39-20261005` |

### Safety result

- approved context `physiqueos-final-cutover-config` only;
- d789ce27 runner/safety files verified byte-identical by Git object identity;
- one console attempt only;
- owner `user_founder_001` enforced inside the guarded payload but never emitted;
- one bounded 120-row-cap Training SELECT limited to the three predeclared canonical exercise IDs;
- bounded protocol/protocol-version SELECT;
- one `REPEATABLE READ READ ONLY` transaction;
- `transaction_read_only=on` required and accepted;
- runtime `PHYSIQUEOS_GIT_SHA` exact `b7eb1e39`;
- explicit rollback before the canonical frame and success marker;
- canonical frame, marker, zero remote exit, credential scan, and output bounds accepted;
- post-read deployment/source/build stable;
- no raw console output, owner identifier, credential, database binding, note/free text, or unrelated exercise exposed;
- no retry.

### Fail-closed result

The sanitized report did not satisfy the exact assertion that one active Training protocol resolves to one active current protocol version. The harness stopped with `STRATEGY_AUTHORITY_AMBIGUOUS` before accepting or emitting any exercise shadow. It is not safe to infer whether this reflects live protocol authority drift or a mismatch in the bounded authority projection without another explicitly authorized read.

Accordingly, the current-production versus V1 Cable/Pull-Up/Spider comparison remains **not accepted from fresh production**. The local real-evidence regression fixtures prove deterministic code behavior, but they do not substitute for the required fresh production shadow.

## Deployment and rollback package — not executed

### Candidate

- deploy candidate: `1b6687ffbf016575e674d12406200c3792eb90a7`;
- production ref: `refs/heads/combined-app-platform-cutover`;
- required pre-deploy source: exact `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- expected integration: one-commit normal fast-forward from `999a225a` only after the missing production proof is resolved and Founder separately authorizes deployment;
- migration/backfill/topology/cost delta: none / none / none / `$0`.

### Rollback identity

- rollback source: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`;
- no database down migration, evidence rewrite, Training Strategy mutation, or Native rollback is required;
- after any separately authorized future deployment, rollback must use the established force-with-lease guarded Server path and reverify ACTIVE 9/9 plus exact web/worker/runtime identity.

No deploy or rollback command was run in this task.

## Final recommendation

**HOLD / DO NOT DEPLOY `1b6687ffbf016575e674d12406200c3792eb90a7`.**

The implementation candidate is locally complete and ready for Founder code review, but the fresh production strategy authority was not accepted, so the required bounded production shadow is incomplete. A future task must explicitly authorize a new bounded read that resolves only the Training protocol/current-version projection before re-running the three-exercise shadow. Do not infer authority from the prior snapshot and do not deploy this candidate until that proof is green.

Notification: **Adaptive progression-step V1 is implemented and pushed; local gates are green; the single authorized production read failed closed at Training strategy authority, so deployment is held. No production mutation or Native Build 89/90 change occurred.**
