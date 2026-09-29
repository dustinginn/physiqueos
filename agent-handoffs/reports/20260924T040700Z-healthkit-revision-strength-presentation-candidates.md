# HealthKit revision recovery + Strength presentation — candidate checkpoint

Generated: 2026-09-24T04:07:00Z

Task ID: `codex-healthkit-revision-recovery-strength-presentation-20260923`

## Status

The complete Server and Native candidates are frozen and under fresh-context independent review. The daily Activity/Nutrition revision-loop recovery, Founder automatic-scope diagnostics, and confirmed-Strength Workout Detail / Activity / Log presentation are implemented. Nothing was deployed or uploaded, no production data or policy was mutated, and Cardio was not started.

## Exact candidates

- Server: `1f50421f9e9e046f7b4fd6b2c99571f9961a5a65`
  - reliability ancestor: `61d54b477b6e3df0987bca59149d3d546ddc2a66`
  - deployed base: `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`
- Native: `85e07acb3982014c2faa375c7d31baa0744fb85b`
  - reliability ancestor: `a30ad7404d89fad0d39303094de4ca80fa33bee9`
  - Build 56 base: `de0d3829836dd2e84327d268d4682c97260260e6`

Both exact worktrees were clean after commit.

## Strength presentation

- A new fail-closed Server projection accepts only an integrity-valid, confirmed one-to-one relationship whose canonical workout remains quarantined, strategically ineligible, HealthKit-owned for telemetry, Logger-owned for training content, and non-additive to daily Activity.
- Workout Detail remains one Logger session with byte-identical exercises/sets and adds a compact Apple Health/Watch attachment containing available start/end/duration, active/total energy, heart rate, and distance.
- Activity attributes linked workout energy from the confirmed canonical HealthKit workout, leaves the whole-day Activity total unchanged, derives non-workout energy without double counting, floors impossible negative remainder at zero, and emits a visible anomaly instead of hiding inconsistency.
- Missing HealthKit workout energy remains missing even if stale Logger energy exists.
- Multiple workouts aggregate deterministically and deduplicate by canonical workout identity.
- Log changes the existing confirmed Strength row to `Strength Training · Apple Health`; it creates no second row and makes no claim for candidate/unconfirmed relationships.
- A production-shaped September 23 fixture uses the audited workout/session/link/claim identities, confirmed version/confidence/basis, four exercises/sixteen sets, quarantines, and stale 606-calorie Activity state.

## Founder diagnostics

The Founder canary screen now has a read-only card for the exact automatic Activity, Nutrition, and Workout scopes. It shows scope, last attempt/query/acknowledgement, pending and abandoned counts, cursor generation, revision-floor count, last rebase day/floor, and current error. It does not start a sync and exposes no HealthKit values or device identity.

## Verification

- Server changed-file ESLint and diff checks: passed.
- Server focused presentation/ingestion/core/training/store suites: 89/89 passed.
- Server Activity-focused Progress suite: 3/3 passed.
- Server HealthKit suite excluding one unchanged pre-existing canary-audit assertion: 441/441 passed.
- Native recovery/presentation/diagnostics suites on the sole iPhone 17 Pro simulator: 81/81 passed.
- Native Founder API/canary/Log/Training read-model suites on the same simulator: 302/302 passed.
- Restored Native Workout Detail presentation suite after mutation: 8/8 passed.

Known unrelated baseline failures were kept out of the candidate: two date-sensitive Weight assertions in the full Progress Evidence file (`Invalid time value`) and one unchanged Workout-canary operation-source regex assertion. The failing files are byte-identical to the Server candidate parent.

## Mutation checks

- Reliability mutations already proved the Server `+1` floor and Native uncancellable accepted-to-ack boundary load-bearing.
- Inverting the confirmed-link presentation gate failed 8/9 production-shaped tests.
- Inverting the non-additive workout guard failed 8/9 production-shaped tests.
- Removing Native's attached-HealthKit header suppression failed the exact duplicate-telemetry test.
- Every mutation was restored and the final green suites rerun.

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
- Simulator inventory: only the existing iPhone 17 Pro device was used; no device/runtime was added or deleted.

## Next

Complete the in-flight fresh-context adversarial review of the exact candidates. If it returns clean, publish the review result and stop for separate Founder authorization before any Server deployment. Native/TestFlight and the bounded September 23 Activity repair remain later, separately authorized gates.

## Flags

- DAILY_REVISION_HIGH_WATER_FIXED: YES
- IDENTITY_COLLISION_REBASE_FIXED: YES
- DURABLE_ACK_CANCELLATION_GAP_FIXED: YES
- LOCKED_DEVICE_STATE_RESET_FIXED: YES
- PULL_TO_REFRESH_RECOVERY_FIXED: YES
- SERVER_NEXT_EXPECTED_REVISION_IMPLEMENTED: YES
- FOUNDER_DIAGNOSTICS_EXPOSED: YES
- WORKOUT_DETAIL_HEALTHKIT_PROVENANCE_VISIBLE: CANDIDATE
- WORKOUT_DETAIL_HEALTHKIT_TELEMETRY_VISIBLE: CANDIDATE
- ACTIVITY_WORKOUT_CALORIES_CORRECT: CANDIDATE
- ACTIVITY_NONWORKOUT_CALORIES_CORRECT: CANDIDATE
- ACTIVITY_DOUBLE_COUNT_FREE: CANDIDATE
- LOG_HEALTHKIT_PROVENANCE_VISIBLE: CANDIDATE
- LOGGER_DETAIL_UNCHANGED: YES
- FRESH_CONTEXT_REVIEWED: IN_PROGRESS
- SEP23_ACTIVITY_REPAIR_DRYRUN_READY: NO
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- READY_FOR_CARDIO: NO
- CONTAINS_SECRETS: NO
