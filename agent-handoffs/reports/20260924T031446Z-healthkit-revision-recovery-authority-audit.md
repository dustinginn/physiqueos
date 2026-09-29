# HealthKit daily-revision recovery and Strength presentation — authority/audit checkpoint

Generated: 2026-09-24T03:14:46Z

Task ID: `codex-healthkit-revision-recovery-strength-presentation-20260923`

## Status

Implementation is in progress. This checkpoint records the mandatory authority and root-cause audit before code changes.

## Authority reverified

- Production Server SHA: `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`
- Active deployment: `6c82ac17-00cd-41c0-ad06-5cdbf605ff1c`
- Deployment phase: ACTIVE, 9/9 steps successful
- Immutable `web` and `worker` source hashes: exact Server SHA
- Runtime build: `physiqueos-cb9d14f9-20260923`
- Public live: `ok`
- Public ready: `ready`, all nine checks green
- Native Build 56 SHA: `de0d3829836dd2e84327d268d4682c97260260e6`
- September 23 Strength relationship: confirmed one-to-one, confidence 95, `logger_session_window`
- Workout strategic eligibility: off/quarantined
- Global `linkAutoConfirm`: false
- Cardio: not started

## Build 56 root cause confirmed in source

The completed diagnostic remains accurate against exact Build 56:

1. Activity and Nutrition daily-snapshot revisions are stored only in the accepted HealthKit cursor's per-day entries.
2. A changed daily fingerprint proposes `previous.revision + 1`; if the accepted cursor is behind, it reuses an already-consumed Server revision.
3. `HEALTHKIT_OBSERVATION_IDENTITY_COLLISION` is classified as permanent, the pending batch is abandoned, and the accepted cursor is deliberately left unchanged. The next query therefore rebuilds the same poisoned revision forever.
4. The engine still checks cancellation immediately after a durably accepted Server upload and before local acknowledgement. Cancellation can preserve an accepted-but-unacknowledged batch/cursor gap.
5. The file store still treats any state-file read/decode error except owner mismatch as corruption, moves the healthy file to `.corrupt`, and writes an empty envelope. A protected-data/locked-device read failure can therefore lose revision floors.
6. The automatic coordinator queues one rerun only while the initial pass is in progress. A pull arriving during that rerun is allowed to coalesce and its request is cleared when the rerun finishes, so it need not force a pass newer than the pull.
7. Activity and Nutrition share the vulnerable daily-aggregate mechanism. Workout identity/revision semantics are separate and must not be changed.
8. The Server correctly refuses changed content under a reused daily identity, but its 409 currently carries no authoritative revision floor and the Native uploader reduces the problem to a code string, preventing deterministic rebase.

## Required correction confirmed

- Add Server `nextExpectedRevision` recovery metadata for daily Activity/Nutrition identity collisions only, while retaining fail-closed rejection.
- Preserve purpose mismatch and Workout behavior.
- Carry structured collision recovery through Native upload results.
- Persist per-day revision high-water independently of accepted cursor advancement and rebase it from the Server floor before abandoning a collision.
- Make accepted upload → local acknowledgement an uncancellable durability section.
- Distinguish protected-data/I/O unavailability from corrupt JSON; never quarantine/reset healthy state for access failure.
- Ensure a pull during a queued rerun schedules a later generation.
- Expose automatic Activity/Nutrition/Workout scope diagnostics on the Founder-only diagnostic surface.

## Mutation gates

No source, production data, policy, deployment, or TestFlight state changed in this checkpoint. Server deployment, Native upload, and the bounded September 23 Activity repair each remain separate Founder authorization gates.

## Next step

Implement the smallest Server and Native corrections with production-shaped regression tests, then run the relevant suites and a fresh-context adversarial review. Publish the reviewed exact candidates and stop for Server deployment authorization.

## Flags

- AUTHORITY_REVERIFIED: YES
- REVISION_LOOP_ROOT_CAUSE_CONFIRMED: YES
- SERVER_FIX_REQUIRED: YES
- NATIVE_BUILD_REQUIRED: YES
- PRODUCTION_MUTATED: NO
- SERVER_DEPLOYED: NO
- TESTFLIGHT_UPLOADED: NO
- CARDIO_STARTED: NO
- CONTAINS_SECRETS: NO

