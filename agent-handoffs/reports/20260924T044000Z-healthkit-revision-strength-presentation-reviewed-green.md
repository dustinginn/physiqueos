# HealthKit revision recovery + Strength presentation — reviewed GREEN

Generated: 2026-09-24T04:40:00Z

Task ID: `codex-healthkit-revision-recovery-strength-presentation-20260923`

## Verdict

GREEN for deployment-gated continuation. The exact amended Server and Native candidates passed a fresh-context independent adversarial review with no remaining blocking or high-severity findings.

No Server deployment, TestFlight upload, September 23 repair, production/data mutation, strategic-policy change, or Cardio work occurred.

## Exact reviewed candidates

- Server: `63395579ed70611be8a57f032133a43a3bc67800`
  - daily-revision recovery ancestor: `61d54b47581fcf4818d1d1bc13f521487f46b5ff`
  - deployed base: `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`
  - GitHub branch: `origin/codex/healthkit-revision-recovery-server`
- Native: `e0ed02be57fef76b237be3fe4621f946a02ab40c`
  - Build 56 base: `de0d3829836dd2e84327d268d4682c97260260e6`
  - GitHub branch: `origin/codex/healthkit-revision-recovery-native`

Both exact worktrees are clean.

## Reliability result

- Server 409 responses expose typed, bounded, authoritative `nextExpectedRevision` facts for valid daily Activity/Nutrition identity collisions while preserving purpose mismatch, replay, lower/reused-revision, and integer-overflow refusal.
- Native persists per-scope/per-day revision floors, rebases the next query to a genuinely fresh revision, survives relaunch, and keeps Activity and Nutrition independent.
- Durable Server acceptance crosses an uncancellable local acknowledgement boundary before the cursor can advance.
- Protected-data unavailability does not quarantine/reset a healthy state file.
- Foreground/pull generations and queued reruns cannot leave later refreshes hostage to an older in-flight task.
- Repeated exact local-only tombstones are deduplicated; direct query failures persist a privacy-safe diagnostic code.
- Founder diagnostics remain read-only and label upload attempts separately from successful queries.

## Strength presentation result

- The presentation boundary requires the exact confirmed Strength-only relationship, one-to-one claims, current matcher/schema, deterministic link identity, same owner/date, exact authority/quarantine, exact non-additive Activity policy, canonical HealthKit workout provenance, and active detailed trusted live Logger provenance.
- The real production Logger identity pair is supported and validated:
  - outer `training|authoritative|training_logger_draft_<session>`;
  - inner `training_logger_session_<session>`.
- Workout Detail remains one logical Logger workout and adds compact Apple Health/Watch provenance and available telemetry.
- Activity keeps the whole-day total authoritative, uses confirmed HealthKit workout energy descriptively, derives non-workout energy without addition/double counting, reports impossible negative-remainder anomalies, and remains unknown when the daily total or any confirmed workout energy member is missing.
- Log adds subtle Apple Health provenance to the existing row, including aggregate multi-session days, without creating a duplicate row.
- The production-shaped September 23 fixture retains four exercises/sixteen sets and the audited confirmed relationship facts.

## Independent review and tests

Fresh-context verdict: CLEAN.

- Server HealthKit regressions: 445/445 passed.
- Separate known canary file: 1 passed; 1 unchanged pre-existing operation-source regex assertion failed.
- Native focused recovery/diagnostics/presentation suites: 84/84 passed on the sole existing iPhone 17 Pro simulator.
- Changed-file ESLint: passed.
- Server and Native `git diff --check`: passed.
- Missing-member workout-energy mutation failed the intended regression, was restored, and the final suite passed.
- The two known Weight failures remain date-sensitive `Invalid time value` failures in untouched Weight logic; the other 17 tests in that file passed.

## Production and policy invariants

- Production Server remains `cb9d14f90ac6851bd7f3cb884b76cba98a3774ce`.
- Installed Native remains Build 56 / `de0d3829836dd2e84327d268d4682c97260260e6`.
- September 23 confirmed Strength relationship: unchanged.
- Workout strategic eligibility: off.
- Global `linkAutoConfirm`: false.
- Logger data/content: unchanged.
- September 23 Activity repair: not dry-run and not applied.
- Nutrition repair need: not yet evaluated live.
- Cardio: not started.

## Next authorization gate

Founder authorization is required before deploying exact Server candidate `63395579ed70611be8a57f032133a43a3bc67800` with the established force-rebuild, runtime SHA/build stamping, authority/health verification, and zero-write verification procedure.

Only after that deployment, and a separately authorized Native archive/TestFlight upload, can the bounded September 23 Activity repair be prepared against the live fixed client/server. Any repair apply remains a separate authorization.

## Flags

- AUTHORITY_REVERIFIED: YES
- REVISION_LOOP_ROOT_CAUSE_CONFIRMED: YES
- DAILY_REVISION_HIGH_WATER_FIXED: REVIEWED_CANDIDATE
- IDENTITY_COLLISION_REBASE_FIXED: REVIEWED_CANDIDATE
- DURABLE_ACK_CANCELLATION_GAP_FIXED: REVIEWED_CANDIDATE
- LOCKED_DEVICE_STATE_RESET_FIXED: REVIEWED_CANDIDATE
- PULL_TO_REFRESH_RECOVERY_FIXED: REVIEWED_CANDIDATE
- AN_REVISION_TESTS_PASS: YES
- SERVER_NEXT_EXPECTED_REVISION_IMPLEMENTED: REVIEWED_CANDIDATE
- FOUNDER_DIAGNOSTICS_EXPOSED: REVIEWED_CANDIDATE
- STRENGTH_CONFIRMED_RELATIONSHIP_PRESENT: YES
- WORKOUT_DETAIL_HEALTHKIT_PROVENANCE_VISIBLE: REVIEWED_CANDIDATE
- WORKOUT_DETAIL_HEALTHKIT_TELEMETRY_VISIBLE: REVIEWED_CANDIDATE
- ACTIVITY_WORKOUT_CALORIES_CORRECT: REVIEWED_CANDIDATE
- ACTIVITY_NONWORKOUT_CALORIES_CORRECT: REVIEWED_CANDIDATE
- ACTIVITY_DOUBLE_COUNT_FREE: YES
- LOG_HEALTHKIT_PROVENANCE_VISIBLE: REVIEWED_CANDIDATE
- LOGGER_DETAIL_UNCHANGED: YES
- DUPLICATE_TRAINING_SESSION_PRESENT: NO
- WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED: NO
- SERVER_FIX_REQUIRED: YES
- SERVER_DEPLOYED: NO
- NATIVE_BUILD_REQUIRED: YES
- NATIVE_BUILD_NUMBER: UNASSIGNED_NEXT_BUILD
- TESTFLIGHT_UPLOADED: NO
- SEP23_ACTIVITY_REPAIR_DRYRUN_READY: NO
- SEP23_ACTIVITY_REPAIRED: NO
- SEP23_NUTRITION_REPAIR_NEEDED: NOT_YET_EVALUATED_LIVE
- READY_FOR_CARDIO: NO
- FRESH_CONTEXT_REVIEWED: CLEAN
- CONTAINS_SECRETS: NO
