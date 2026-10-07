# Training progression step intelligence refined — candidate ready for Founder review

## Decision

**HOLD — DO NOT DEPLOY.**

The refined Server candidate is complete and pushed for Founder review, but the active production Training Strategy does not contain the exercise-level prescription fields required to prove deterministic rep-versus-load steps. Deploying the code alone would safely fail closed for target selection; it would not make Cable Machine Front Raises or weighted Pull-Ups deterministically actionable. Keep both the original `999a225a` candidate and this refined candidate out of production until a separately reviewed Training Strategy version supplies authoritative prescriptions and the combined package is re-shadowed.

No production deployment, production mutation, interactive authentication, credential change, production read, or Native Build 89/90 change occurred.

## Candidate authority

- Refined candidate: `a7d3ef8ac90d6ebc92cf00d34645496105f57a3a`
- Branch: `codex/training-progression-step-intelligence-20261007`
- Exact parent: `999a225a38ced9ddb16a65bbe840896472265468`
- Production Server remains: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8`
- Production-shadow evidence authority: `1e42df817065bdb3e7afc85c8dce06ac6cb47b6e`
- Task authority / current report parent: `594ef1e32d9e37542406bc7e46e798aff7005b72`

## Prescription-authority audit

The end-to-end trace found:

1. Operating Plan Training Strategy is the canonical policy authority. It stores progression pace and `double_progression_confirmed_sessions` with `reach_top_of_rep_range -> increase_load`, configured successful-session count, minimum exposure, and exercise overrides.
2. The Training protocol builder explicitly records that exercise-specific rep prescription and equipment-increment authority are not configured.
3. Strategy Editor preserves the progression object while editing pace but does not add exercise prescriptions.
4. Logger draft/read uses performed-history sets and Server-projected recommendations. It has no independent planned rep range, working-set count, rep increment, or reset-rep authority.
5. Finalized canonical Training evidence stores observed sets, identity, variant, and relationship context; it is evidence, not prospective prescription authority.
6. The canonical exercise registry contains identity/taxonomy, not executable per-exercise progression prescriptions.

The prior bounded production shadow already proved that the active production strategy has the rule and `successfulSessionsRequired: 2`, but no exercise override or rep-range maximum in the progression strategy. Because the repository audit found no downstream canonical prescription source, another production read was unnecessary and was not performed.

## Refined policy

Eligibility and step selection are now separate decisions.

Eligibility preserves the accepted architecture:

- exact canonical exercise, execution variant, and relationship partition;
- regression/recovery precedence;
- configured successful-session count, never below two;
- Founder floor of 14 days;
- exposure anchored to the first qualifying success at the current load in the active prescription context;
- repeated successes do not move the anchor;
- a rep change at the same load does not reset load exposure;
- a load change starts a new exposure run;
- a new immutable protocol-version effective date partitions prior prescription evidence;
- adaptive cadence remains diagnostic only.

Step selection requires explicit strategy prescription authority:

- `repRange.minimum` and `repRange.maximum`;
- `workingSetsRequired`;
- `repIncrement`;
- optional `loadResetRepTarget` (otherwise the explicit rep-range minimum is the authoritative reset);
- optional `prescriptionId` for provenance;
- existing historical load increments for a deterministic next load.

No low-rep threshold and no exercise-name heuristic exists.

## Step model and evidence rules

The additive Server contract exposes `progressionStep.kind` as `reps`, `load`, or `none`, plus current/next rep target, rep-range bounds, working-set count, current/next load, reset target, reason code, and strategy-field provenance.

- Below the prescribed ceiling: after the current rep step has the configured confirmations and load exposure has matured, recommend the configured next rep increment at the same load.
- At the prescribed ceiling: require the configured confirmations at the ceiling itself; lower-rep confirmations cannot authorize a load increase.
- At the ceiling with a safe historical increment: recommend load progression and reset reps from explicit strategy authority.
- At the ceiling without a safe increment: return a load-progression opportunity with no invented load target.
- Missing/incomplete prescription authority: eligibility may mature, but step selection returns `kind: none`, `consider_progression`, and no invented target.
- Regression continues to return recovery before any progression step.

The web Logger now consumes the same Server projections already supplied to Native instead of recalculating progression in client state. Existing Native fields (`status`, `recommendedAction`, `suggestedLoad`, `suggestedReps`, and related metadata) remain intact; clients may ignore the additive `progressionStep` object.

## Required production regression fixtures

### Cable Machine Front Raises

Deterministic fixture: ordinary / standalone, 150 lb, 4 x 10, five qualifying sessions, 2026-09-08 anchor, 28 exposure days, two required sessions, 14-day floor, compatible +10 lb history.

- With explicit 4 sets, 8–10 range, +1 rep step, and reset target 8: **load progression to 160 lb x 8**.
- Without that explicit top/reset authority: **fail closed; no 160 x 8 target**.

The active production strategy currently lacks that authority, so the production-real conclusion is fail closed until a new reviewed strategy version supplies it.

### Spider Curls

Deterministic fixture: 50 lb, 4 x 11, three qualifying sessions, 2026-09-23 anchor, 13 exposure days on 2026-10-06.

- Result: **Maintain**, `minimum_exposure_gate_pending`, regardless of which later step would apply.
- This preserves the exact 13/14-day boundary.

### Weighted Pull-Ups

Deterministic fixture: ordinary / standalone, body weight +25 lb external load, 4 x 7, two qualifying sessions, 2026-09-20 anchor, 16 exposure days, no safe historical load increment.

- With explicit 4 sets, 6–8 range, and +1 rep step: **rep progression to 4 x 8 at the same +25 lb**.
- If 7 is configured as the top: the step becomes load progression, but the next load remains unavailable without safe increment evidence.
- Without explicit rep-range/increment authority: **fail closed; no invented 8-rep target**.

The active production strategy currently lacks that authority, so the production-real conclusion is fail closed until a new reviewed strategy version supplies it.

## Schema and contract changes

- Progression policy version: `training_progression_policy_v3`.
- Prescription schema marker: `training_double_progression_prescription_v1`.
- Existing default-rule and exercise-override extension points accept general prescription fields; no Founder-only or exercise-hard-coded logic was added.
- Active protocol version ID and effective date are projected as read-time authority metadata, so a material immutable strategy-version change resets the eligible prescription evidence window.
- `progressionStep` is additive and backward compatible.
- No database migration or history rewrite is required.
- No backfill should infer rep ranges. Historical observed sets remain evidence only.

## Production strategy requirement

A later immutable Training protocol version/update is required before deterministic production targets can ship. Founder-reviewed exercise prescriptions must be supplied for each movement that should receive automatic steps, minimally:

- canonical exercise ID;
- prescription ID/version;
- rep-range minimum and maximum;
- working-set count;
- rep increment;
- optional explicit load-reset rep target;
- effective date.

Cable, Spider Curl, and Pull-Up values must come from canonical program authority, not from these regression examples or from performed history.

## Verification

Green:

- Focused progression + Logger + Operating Plan: **187/187** across 13 files.
- Phase 6 Training gate: **181/181** across 16 files.
- Native/Core additive projection contract: **38/38**.
- Earlier accepted candidate gates remain represented and were extended; all existing progression cases stayed green.
- Changed-file ESLint: clean, zero warnings/errors.
- `git diff --check`: clean.

The broader Phase 6 command completed with **561 passing / 564 executed tests plus one suite unable to collect**. Its four failures are outside this candidate's changed surface:

- two tests require the absent machine-local `private/founder/runtime-store.json`;
- one pre-existing Photos route source assertion expects an obsolete function name;
- one provider-build portability assertion compares macOS `/var` with its `/private/var` canonical path.

None is in a changed file or caused by the progression refinement. They remain visible rather than being masked or modified in this lane.

## Recommended deployment sequence

1. Keep `999a225a` and `a7d3ef8a` held.
2. Founder reviews and approves the general step model and the exact canonical prescription source/values.
3. Create a new immutable Training Strategy version with explicit exercise prescriptions; do not backfill inferred ranges into history.
4. Re-run local progression, Phase 6 Training, Logger/Operating Plan, lint, and Native projection gates.
5. Re-run the proven bounded read-only production shadow on identical sanitized Cable/Spider/Pull-Up evidence using the new strategy version as candidate data, without mutating production.
6. Require explicit DEPLOY authorization for the combined Server code + strategy package.
7. Deploy Server first; Native remains presentation-only and requires no Build 89/90 change.

## Rollback

- Code rollback: redeploy the current production Server `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` (or the immediately preceding approved deployment authority).
- Strategy rollback: restore the prior immutable Training protocol version pointer through the established authorized protocol-version rollback path.
- No database down migration or evidence rewrite is required.
- Existing clients ignore the additive step metadata.

## Final recommendation

**HOLD / DO NOT DEPLOY.** The refined implementation is ready for Founder review, but production prescription authority must be explicitly versioned and re-shadowed before deterministic rep/load targets are deployable.
