# HealthKit daily-revision recovery — implementation checkpoint

Generated: 2026-09-24T03:37:00Z

Task ID: `codex-healthkit-revision-recovery-strength-presentation-20260923`

## Status

The fail-closed Server/Native reliability correction is implemented and its focused tests and mutation checks are green. Strength read-model/presentation work and fresh-context review remain in progress. Nothing was deployed or uploaded, and no production data or policy was mutated.

## Exact implementation commits

- Server candidate: `61d54b477b6e3df0987bca59149d3d546ddc2a66`
- Native candidate: `a30ad7404d89fad0d39303094de4ca80fa33bee9`
- Base Server: `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`
- Base Native / Build 56: `de0d3829836dd2e84327d268d4682c97260260e6`

The Native candidate ref is published as `origin/codex/healthkit-revision-recovery-native`. The Server commit remains in the isolated local review worktree; GitHub branch publication was denied by the execution safety gate, so no workaround was attempted.

## Server correction

- Daily Activity/Nutrition `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION` responses now include typed `healthkit-daily-revision-recovery-v1` metadata.
- `nextExpectedRevision` is calculated from the maximum durable Server-owned revision for the exact daily identity base, then incremented.
- Recovery includes only observation type, local date, received/next revisions, and an opaque SHA-256 identity digest.
- Purpose mismatch and Workout collision/replay behavior remain unchanged.
- A dedicated privacy-safe warning event records only the digest and revision facts.

## Native correction

- The uploader preserves and validates typed collision recovery facts instead of reducing every rejection to a code string.
- The file store atomically retires the rejected batch and persists a monotonic per-day revision floor separate from the accepted cursor.
- The next daily query overlays a sentinel fingerprint at `nextExpectedRevision - 1`, forcing current HealthKit content to be emitted at the fresh Server revision; successful acknowledgement clears the floor.
- A durably accepted Server response now enters an uncancellable local acknowledgement section.
- protected-data read failure returns `healthkit_state_protected_data_unavailable` and never quarantines or resets a healthy state file; writes use complete-file-protection-unless-open.
- Activity deletion retains the last issued per-day revision so disappearance/reappearance cannot regress to revision 1.
- Automatic foreground generations are monotonic: a pull during an already queued rerun schedules one later pass.
- Optional privacy-safe diagnostics expose active revision-floor count and last rebase facts while preserving Build 56 envelope decoding.

## Verification

- Server Native HealthKit ingestion contract: 14/14 passed.
- Server canonical persistence command suite: 41/41 passed.
- Server changed-file ESLint: passed.
- Native targeted iPhone 17 Pro simulator suites: 52/52 passed.
- Production-shaped Sep 23 daily collision fixture: revision 1 collision, Server floor 6, relaunch overlay revision 5, fresh revision 6 accepted, floor cleared.
- Protected-data fixture: state unchanged, no `.corrupt` file, pending batch retained.
- Accepted-then-cancelled fixture: cursor advances and pending batch clears.
- Queued-rerun fixture: third request during rerun produces exactly a third sequential pass.

## Mutation checks

- Removing the Server `+ 1` floor increment caused the recovery contract test to fail (`nextExpectedRevision` 5 instead of 6).
- Restoring the post-upload cancellation check caused the accepted-then-cancelled Native test to fail with `CancellationError` before acknowledgement.
- Both mutations were reverted; the exact candidates above contain the green implementations.

## Invariants

- Production mutated: no.
- Server deployed: no.
- TestFlight uploaded: no.
- September 23 Activity repaired: no; design/dry-run remains later and separately authorized.
- Workout strategic eligibility: unchanged/off.
- Global `linkAutoConfirm`: unchanged/false.
- Confirmed September 23 Strength relationship: unchanged.
- Cardio: not started.
- Only the existing iPhone 17 Pro simulator was used; no simulator was created.

## Next

Complete the confirmed-Strength Workout Detail / Activity / Log read-model and Native presentation slice, run the combined relevant suites, obtain a fresh-context adversarial review of the exact commits, publish the reviewed candidates, and stop for Server deployment authorization.

## Flags

- RELIABILITY_IMPLEMENTED: YES
- FOCUSED_TESTS_GREEN: YES
- MUTATION_CHECKS_GREEN: YES
- FRESH_CONTEXT_REVIEWED: NO
- STRENGTH_PRESENTATION_COMPLETE: NO
- PRODUCTION_MUTATED: NO
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- CARDIO_STARTED: NO
- CONTAINS_SECRETS: NO
