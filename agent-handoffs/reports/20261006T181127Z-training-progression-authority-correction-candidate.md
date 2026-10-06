# Training progression authority correction · post-Build-89 Server candidate

- Status: **Training progression authority correction ready for post-Build-89 Server review.**
- Candidate SHA: `999a225a38ced9ddb16a65bbe840896472265468`
- Candidate branch: `codex/training-progression-authority-server-candidate-20261006`
- Candidate base: `b7eb1e397f0238df9ae904fd182ddbb51602e8d8` (`origin/combined-app-platform-cutover`, current Server progression/context lineage)
- Audit authority: `e6c10085e12da4223e6430bc1f47a9e0b6c4aa84`
- Task authority: `e5347f4d388b1fa4a953132865fc041c45d9d152`
- Build 89: unchanged; this is an isolated post-Build-89 Server candidate
- Production mutation / Server deploy / Native build bump / TestFlight: **none**

## Outcome

The candidate removes the split progression authority identified in the Cable Machine Front Raises audit. Training Logger progression is now Server-owned and executable only from the exact active Operating Plan Training Strategy. Eligibility and target selection are separate decisions: satisfying the Founder-approved gates makes progression eligible, while a suggested load is emitted only when history supports a real increment.

The correction preserves exact exercise, execution-variant and relationship-context partitions. It also includes a newly durable same-day Finish in the next Logger read, de-duplicates a canonical session, and leaves the existing training-cache invalidation path intact.

## Founder policy implemented

The supported strategy rule remains:

```text
type: double_progression_confirmed_sessions
condition: reach_top_of_rep_range
action: increase_load
```

The executable policy requires both independent gates:

1. the active strategy's configured successful-session count, with a Founder floor of two; Production's default is two; and
2. at least 14 elapsed days from the **first qualifying success** in the current exact prescription/load/exercise/variant/relationship context.

Repeated successful sessions do not reset the exposure clock. A new load or materially changed prescription begins a new run. Unsupported, missing, ambiguous or invalid active-strategy configuration fails closed instead of falling back to a separate Logger heuristic. Existing supported strategies that predate the new field receive the Founder-locked 14-day compatibility default; new strategy builds persist `minimumExposureDays: 14` explicitly.

Movement, user and phase cadence calculations remain available as diagnostic calibration only. They no longer decide eligibility.

## Qualifying-success semantics

- With an explicit strategy rep range, every completed working set must reach the configured top of the range at the same load context. An explicit `workingSetsRequired` count is honored exactly.
- Without a persisted prescription maximum, the transitional conservative rule requires repetition of the complete persisted set profile. It does not treat one best set as proof that all work reached a hidden top-of-range target.
- A regression below the prior comparable performance produces recovery guidance before progression eligibility is considered.
- Draft, pending, partial and superseded canonical evidence is excluded. Same-day durable canonical work is eligible after Finish, and duplicate representations of the same canonical session are collapsed.

Transitional limitation: canonical history does not yet carry an exercise-specific prescribed rep-range maximum for all existing prescriptions. For those records, repeated complete set-profile equality is the safe executable proxy. The candidate exposes that limitation in policy metadata rather than claiming a top-of-range fact the Server does not possess.

## Rep and load interaction

A rep change within the same load remains part of the current-load evidence stream, but only qualifying sessions extend the consecutive qualifying run. In explicit rep-range mode, all relevant sets must meet the configured maximum. In transitional mode, a changed full set profile starts a new qualifying profile run. A load, load type or unit change always starts a new current-load run and resets the success count/exposure anchor for that prescription context.

## Target selection is separate from eligibility

Eligibility does not invent a target. After both gates pass:

- if at least two prior positive load changes in the same unit/load type establish an increment, the candidate uses the smallest observed increment;
- the new-load rep target is the configured rep-range minimum when present, otherwise the prior safe behavior of two reps below the latest best set, never below one;
- if history does not support an increment, the status is still `progression_opportunity`, but the action becomes `consider_progression` and the target is explicitly unavailable.

There is no arbitrary cable, machine, free-weight or bodyweight increment table in this change.

## Server contract changes

`CoreNavigationReadService` now loads the owned Training protocols and protocol versions needed to resolve exactly one active Training Strategy. Zero, multiple, stale or otherwise ambiguous active authorities fail closed.

Progression recommendations retain the existing Native-consumed prescription fields and add transparent Server metadata, including:

- reason and reason code;
- history references and exact comparison context;
- executable policy source/version/qualification mode and limitation;
- required and qualifying success counts;
- exposure start, elapsed days and minimum days;
- separate session-count, exposure and overall eligibility gates;
- diagnostic cadence calibration; and
- target-selection availability and provenance.

The same policy is applied to standalone and exact contextual/superset recommendations. These additions are backward-compatible for Native decoders that ignore unknown fields.

## Migration and backfill

- Database migration: **none**.
- Historical-data rewrite/backfill: **none**.
- Recommendation repair job: **none**; recommendations are generated on read.
- Protocol compatibility: existing supported default rules without `minimumExposureDays` execute with the locked 14-day compatibility default. Newly built strategies persist the field.

## Verification

All progression-relevant gates are green on the candidate:

| Gate | Result |
| --- | --- |
| Phase 6 Training suite | **16 files, 167 tests passed** |
| Focused policy / protocol / Logger / read-contract / Native-contract / Postgres suite | **6 files, 128 tests passed** |
| ESLint on changed JavaScript files | clean |
| `git diff --check` | clean |

Coverage includes weekly, twice-weekly, every-other-week and greater-than-14-day schedules; the former skip-workout inversion; configured two- and three-success policies; pending session and exposure gates; first-success anchoring; regression; load reset; rep behavior; explicit top-range/all-set qualification; partial set shapes; same-day Finish and duplicate canonical-session handling; aliases; variants; standalone and superset contexts; cadence diagnostics; goal/phase behavior; evidence-supported target selection; and active-strategy fail-closed paths.

The repository-wide unit configuration was also attempted. It is not a valid clean-room gate in this worktree: unrelated baseline suites require `private/founder/runtime-store.json`, bind localhost where the sandbox returns `EPERM`, assume a different repository root, or assert stale contracts. The focused and Phase 6 suites above contain the progression surface and pass without progression failures.

## Production-read limitation

No live Founder Production query was run. The repository-authorized production SQL path is PC-only, while this lane ran on the isolated Mac worktree. This does not affect the deterministic source correction or regression coverage, but current production session IDs, exact relationship groups and live strategy payload should be confirmed through the approved bounded, owner-scoped, read-only PC path before or during post-deploy validation.

## Native follow-up

No Native source change is required to activate the Server correction. Existing required recommendation fields remain compatible, additive unknown metadata can be ignored, training command cache invalidation is preserved, and the Server contract test proves that a durable same-day Finish appears on refresh.

A later Native lane may optionally decode and present the new reason/gate/exposure transparency. That is presentation work only; Native must not recreate the progression policy or target math. This candidate does not change Build 89, bump a build number, archive, upload, or ship TestFlight.

## Post-Build-89 review and release sequence

1. Review candidate `999a225a38ced9ddb16a65bbe840896472265468` as a Server-only correction after Build 89 work is complete.
2. Run the focused and Phase 6 suites again in the Server integration environment, then merge the candidate through the normal Server lineage without importing it into Build 89 source.
3. If the approved PC runner is available, perform the bounded owner-scoped read to confirm the live active strategy and Founder case context; do not mutate production.
4. Deploy the Server through the normal controlled release path.
5. Validate Cable Machine Front Raises plus one known Maintain and one known Opportunity case, checking both gate transparency and exact context partitioning.
6. Consider optional Native presentation of the additive transparency fields in a later build only after Server behavior is accepted.

## Rollback

Rollback is a Server-code revert to the pre-candidate progression/read-service commits and a normal Server redeploy. No schema, canonical evidence, protocol history or Native artifact must be rolled back because the candidate performs no migration, backfill or durable recommendation write. If the new policy cannot resolve exactly one active strategy, its fail-closed behavior already suppresses unsafe guidance.

## Candidate commit stack

1. `12ee18dafc75eae2fd5bed42cb1d41dff69f48f8` — implementation plan
2. `3dfbc4c3c7fad5eb63f6bfb06c4b348c86ff1c9f` — strategy-owned progression authority
3. `999a225a38ced9ddb16a65bbe840896472265468` — boundary and regression coverage

## Explicit non-actions

- No Build 89 source or release-authority change.
- No Server deployment.
- No production write or mutation.
- No Native build-number bump.
- No archive, distribution, or TestFlight action.
- No implementation merge to `main`; this handoff is report-only.
