# HealthKit current-day priority and September 23 repair — implementation/test checkpoint

Generated: 2026-09-24T14:08:22Z

Task ID: `codex-healthkit-current-day-priority-sep23-repair-20260924`

## Status

The focused Native correction is implemented, committed, pushed, and green in the complete relevant HealthKit suite. The permanent automatic path now isolates and prioritizes the exact current local day for Activity and Nutrition before bounded historical catch-up. The separate September 23 Activity repair tool is implemented as exact-day dry-run tooling; production APPLY remains disabled and additionally requires a future explicit authorization capability. Fresh-context independent review remains pending. Nothing was deployed, uploaded, repaired, or otherwise mutated in production.

## Exact authority

- Native base / installed Build 57 source: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`.
- Exact Native candidate: `91de99a33c80c7b5bd9180b38fb79bbec34b5448`.
- Published candidate ref: `origin/codex/healthkit-revision-recovery-native`.
- Production Server source, reverified before implementation: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`.
- Production deployment: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`.
- Runtime build label: `physiqueos-28ac1e4f-20260924`.

Only eight Native HealthKit implementation/test files differ from Build 57. There are no Server changes and no Midweek candidate changes in this commit.

## Permanent current-day-first correction

- Added independent exact-current-day Activity and Nutrition synchronization scopes, derived on every run from the injected clock and `Calendar.autoupdatingCurrent`.
- Preserved the Build 57 historical scopes and their durable cursor/revision-floor state; historical pending work cannot run before or poison the new current-day state.
- Ordered each foreground generation as current Activity, current Nutrition, historical Activity, historical Nutrition, then the unchanged Workout path.
- Preserved the Server wire namespace `automatic` for both local daily lanes; canary/test-day namespaces remain separate.
- Kept Activity and Nutrition failures independent and preserved current-day success even when later historical work collides or fails.
- Retained monotonic foreground coalescing: a pull during an in-flight generation schedules one later generation with the same current-first ordering.
- Added an exact-day current collision recovery retry without weakening Server identity protections or expanding historical lookback.
- Kept zero-valued returned daily aggregates valid. Success is based on observation presence/coverage/revision, not positive calories.
- Workout activation, ingestion, reconciliation, and presentation behavior are unchanged.

## Bounded September 23 repair tooling

- Hard-bound to Activity on local date `2026-09-23`, using actual HealthKit query results and the normal `automatic` namespace/stable device identity.
- Dry-run performs the exact-day HealthKit query, validates the bounded observation set, computes a privacy-safe digest/summary, and performs no upload or durable staging.
- A returned zero-valued exact-day aggregate is valid.
- The Founder diagnostic UI exposes distinct DRY RUN and APPLY states, labels the operation as one-shot September 23 Activity repair, and leaves APPLY disabled as not authorized.
- Future apply code requires an explicit authorization capability and re-queries the exact day; it checks the dry-run digest, frozen runtime/policy facts, one canonical day, current/source revision 50, next revision 51, and strict recovery metadata.
- The apply engine permits at most the expected collision plus one immediate exact-day retry: two requests total. Any other date, stream, namespace, aggregate, revision, duplicate, authority, policy, or unrelated mutation shape fails closed.
- The success fixture predicts canonical revision 51, source count 51, and history count 50 without embedding Founder HealthKit values in source.

## Validation

All tests ran on the single existing iPhone 17 Pro simulator `A8157897-95ED-4480-9150-6136652A6519`; no simulator was created or used.

- Focused synchronization/coordinator suite: 75/75 passed during implementation.
- Final complete relevant Native HealthKit suite: 111/111 passed.
- Included suites: capability, synchronization, Founder canary, automatic synchronization coordinator, and query-client default bounds.
- `git diff --check`: passed before commit.
- Candidate branch is clean after commit and matches the pushed remote ref.

Coverage includes current-day zero/nonzero uploads, current/historical collision isolation, repeated historical collisions, current collision retry, independent revision floors, Activity/Nutrition cross-failure isolation, pull-to-refresh/coalescing order, relaunch, protected-data handling, offline resume, timezone rollover, unchanged historical bounds, Workout regression, and every bounded repair refusal/success path requested by the task.

## Mutation checks

Every injected defect was observed by a targeted failing test and then reverted before the final clean suite:

- swapping current Activity/Nutrition priority order;
- dropping a valid zero-valued current-day aggregate;
- relaxing the September 23 date/scope or unrelated-observation boundary;
- bypassing the repair digest fence;
- bypassing the authorization gate;
- widening the frozen revision 50→51 contract, including its independent continuity guard;
- reducing the maximum request boundary so the exact two-request fixture violated it.

The exact committed candidate contains none of the mutations.

## Invariants

- Production or Founder-device mutation: none.
- Server source/deployment mutation: none.
- TestFlight archive/upload: none.
- September 23 Activity repair: not applied.
- September 24 sync triggered: no.
- Policy and strategic eligibility: unchanged.
- Strength relationship and Logger: unchanged.
- Cardio: not started.
- Midweek Native work: not merged or packaged.

## Next

Run a fresh-context independent adversarial review of exact candidate `91de99a33c80c7b5bd9180b38fb79bbec34b5448`, address any findings with focused validation, then publish the final reviewed SHA and verdict. If clean, stop for separate TestFlight authorization. Repair authorization remains separate even after any future build upload.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP24_ZERO_VALUES_ALLOWED: YES
- CURRENT_DAY_FIRST_IMPLEMENTED: YES
- CURRENT_DAY_HISTORICAL_ISOLATION_PASS: YES
- HISTORICAL_COLLISION_CANNOT_STARVE_CURRENT: YES
- PER_DAY_REVISION_INDEPENDENT: YES
- ACTIVITY_NUTRITION_SCOPE_INDEPENDENT: YES
- ZERO_AGGREGATE_PRESENCE_TEST_PASS: YES
- TIMEZONE_ROLLOVER_PASS: YES
- SEP23_REPAIR_TOOL_IMPLEMENTED: YES
- SEP23_REPAIR_DRYRUN_ONLY: YES
- SEP23_APPLY_AUTH_GATE_ENFORCED: YES
- SEP23_DATE_SCOPE_HARD_BOUND: YES
- SEP23_REVISION_50_51_GUARD: YES
- SEP23_DIGEST_FENCE: YES
- SEP23_MAX_TWO_REQUESTS: YES
- SEP23_NO_UNRELATED_MUTATION: YES
- MUTATION_TESTS_PASS: YES
- NATIVE_TESTS_PASS: YES
- FRESH_CONTEXT_REVIEWED: NO
- TESTFLIGHT_UPLOADED: NO
- SEP23_ACTIVITY_REPAIRED: NO
- READY_FOR_CARDIO: NO
- GH_REPORT_PUBLISHED: PENDING
- CONTAINS_SECRETS: NO
