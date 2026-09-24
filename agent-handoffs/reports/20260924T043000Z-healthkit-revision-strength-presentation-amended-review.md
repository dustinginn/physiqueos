# HealthKit revision recovery + Strength presentation — amended candidate review

Generated: 2026-09-24T04:30:00Z

Task ID: `codex-healthkit-revision-recovery-strength-presentation-20260923`

## Status

The first fresh-context review found blocking fail-open Strength projection and incomplete-energy attribution defects, plus bounded Log provenance, deferred-tombstone, and diagnostics gaps. Those findings are corrected in new exact Server and Native commits, both pushed to GitHub. A second fresh-context review is now running against the amended SHAs. Nothing was deployed or uploaded, and no production data or policy was mutated.

## Exact amended candidates

- Server: `74c5180518b3470e6307cd2d414c79b792397ef5`
  - presentation ancestor: `1f50421f9e9e046f7b4fd6b2c99571f9961a5a65`
  - daily-revision recovery ancestor: `61d54b47581fcf4818d1d1bc13f521487f46b5ff`
  - deployed base: `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`
- Native: `e0ed02be57fef76b237be3fe4621f946a02ab40c`
  - presentation ancestor: `85e07acb3982014c2faa375c7d31baa0744fb85b`
  - Build 56 base: `de0d3829836dd2e84327d268d4682c97260260e6`

Branches:

- `origin/codex/healthkit-revision-recovery-server`
- `origin/codex/healthkit-revision-recovery-native`

Both worktrees are clean at the exact amended commits.

## Review findings corrected

- The Server presentation boundary now requires an integrity-valid confirmed relationship with canonical history and claims, deterministic link identity, current matcher/schema, exact link authority, exact quarantine including `decidedBy`, same owner/date, an exact canonical Strength workout, and an active detailed trusted live Logger session. Cardio and malformed provenance fail closed.
- Canonical workout presentation now requires exact non-additive Activity policy, exact authority/quarantine, Strength family, coherent owner/date/source-observation provenance, and a canonical record revision/fingerprint.
- Missing whole-day Activity energy, missing confirmed workout energy, or any missing member of a multi-workout confirmed set keeps workout/non-workout attribution unknown. No `Number(null)` zero fabrication and no partial total.
- A multi-session Log day receives subtle Apple Health provenance when any existing Training row is backed by a confirmed attachment; it still creates no duplicate row.
- Repeated identical local-only Activity tombstones are deduplicated by exact partition identity so protected state does not grow indefinitely.
- Foreground query failures now persist a privacy-safe diagnostic error code. Founder labels distinguish upload attempt from successful query.
- A dedicated Nutrition collision/relaunch fixture now proves its revision floor is independent and recovers exactly like Activity.

## Verification

- Server changed-file ESLint and `git diff --check`: passed.
- Corrected production-shaped presentation suite: 13/13 passed.
- Wider corrected Server focused suites: 72/72 and final 46/46 passed.
- Server HealthKit run: 446/446 candidate-relevant assertions passed; the sole failure is the unchanged pre-existing `HealthKitWorkoutCanaryAudit` regex assertion already documented before this task.
- Missing-member energy mutation: failed the exact multi-workout regression as required, then was restored; final suite passed.
- Native Activity/Nutrition recovery suite: 37/37 passed.
- Native combined recovery/coordinator/Founder diagnostics/Workout Detail suite: 76/76 passed on the sole existing iPhone 17 Pro simulator.
- Prior full candidate verification remains valid for unchanged areas: Native 302/302 and Server focused/HealthKit ancestors were green, apart from the separately documented pre-existing Weight date assertions and canary-audit regex assertion.

## Invariants

- Production mutated: no.
- Server deployed: no.
- TestFlight uploaded: no.
- September 23 Activity repair attempted: no.
- Workout strategic eligibility: unchanged/off.
- Global `linkAutoConfirm`: unchanged/false.
- September 23 confirmed Strength relationship: unchanged.
- Logger content/data: unchanged.
- Cardio: not started.
- Simulator: only the existing iPhone 17 Pro was used.

## Next gate

Wait for the second fresh-context review of the exact amended SHAs. If clean, publish the final review checkpoint and stop for separate Founder authorization before any Server deployment. The bounded September 23 Activity dry-run is not ready until the reviewed Server and Native fixes are live; no repair apply is authorized.

## Flags

- AUTHORITY_REVERIFIED: YES
- DAILY_REVISION_HIGH_WATER_FIXED: CANDIDATE
- IDENTITY_COLLISION_REBASE_FIXED: CANDIDATE
- DURABLE_ACK_CANCELLATION_GAP_FIXED: CANDIDATE
- LOCKED_DEVICE_STATE_RESET_FIXED: CANDIDATE
- PULL_TO_REFRESH_RECOVERY_FIXED: CANDIDATE
- AN_REVISION_TESTS_PASS: YES
- SERVER_NEXT_EXPECTED_REVISION_IMPLEMENTED: CANDIDATE
- FOUNDER_DIAGNOSTICS_EXPOSED: CANDIDATE
- STRENGTH_PRESENTATION_FAIL_CLOSED: YES
- ACTIVITY_DOUBLE_COUNT_FREE: CANDIDATE
- LOGGER_DETAIL_UNCHANGED: YES
- FRESH_CONTEXT_REVIEWED: IN_PROGRESS_AMENDED_CANDIDATES
- SEP23_ACTIVITY_REPAIR_DRYRUN_READY: NO
- SEP23_ACTIVITY_REPAIRED: NO
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- READY_FOR_CARDIO: NO
- CONTAINS_SECRETS: NO
