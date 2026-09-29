# HealthKit current-day priority and September 23 repair — architecture audit

Generated: 2026-09-24T13:29:59Z

Task ID: `codex-healthkit-current-day-priority-sep23-repair-20260924`

## Status

The exact Build 57 implementation has been audited. The starvation defect is confirmed, and the smallest safe Native design is selected. Implementation, tests, mutation checks, and fresh-context review remain in progress. This checkpoint made no source, device, production, policy, strategic-eligibility, Strength, Logger, or Cardio mutation.

## Authority

- Native base / installed Build 57 source: `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`.
- Native branch: `origin/codex/healthkit-revision-recovery-native`; local worktree clean at audit start.
- Production Server source: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`.
- Active deployment from the durable deployment checkpoint: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`.
- Fresh public runtime build: `physiqueos-28ac1e4f-20260924`.
- Fresh `/health/live`: HTTP 200, `ok`.
- Fresh `/health/ready`: HTTP 200, `ready`, all nine checks green, migration 000014 and runtime-authority checks ready.
- Native installed authority remains Build 57. No device was foregrounded or operated.

## Exact root cause

Build 57 has four interacting behaviors:

1. `HealthKitSynchronizationEngine.synchronize` always resolves and delivers any pending batch before issuing a new query.
2. Automatic daily Activity and Nutrition call the query client with `bounds: nil`, which expands to the full 30-day lookback through the current local day.
3. Daily additions are normalized/sorted by external identity, putting older dates before newer dates.
4. A valid Server identity collision atomically records the per-day revision floor and abandons the entire staged batch; the next foreground generation re-queries the whole window.

Therefore a historical collision is recovered correctly but consumes the attempt before current-day data can be staged. A mere sort change is insufficient: a persisted historical transient batch would still be replayed before any current-day query. The current architecture also performs Activity's complete query/delivery before beginning Nutrition, so Activity history can delay Nutrition current-day freshness.

## Selected permanent correction

The permanent correction will separate daily aggregation into two local synchronization lanes while retaining one Server identity namespace:

- A new exact-current-local-day lane for Activity and Nutrition.
- The existing Build 57 automatic scope retained as the historical/catch-up lane, preserving its durable cursor and revision-floor recovery state.
- Both lanes normalize to the established Server `automatic` namespace; canary/test-day identities remain separate.
- Foreground generations attempt Activity current-day and Nutrition current-day before any historical work. Each scope records success/failure independently.
- Historical catch-up runs only afterward and cannot change or block the current-day lane's cursor, pending batch, acknowledgement, or revision floor.
- Workouts keep their existing cursor, activation floor, ingestion, reconciliation, and presentation semantics.
- Current-day bounds are derived on every attempt from `Calendar.autoupdatingCurrent` plus the injected clock; no Texas, Pacific, briefing, or fixed timezone is embedded.
- The existing historical lookback is not expanded and Server collision protections remain fail closed.
- A current-day collision may consume the validated Server revision floor and retry the same exact day once; no unbounded loop is introduced.
- Zero-valued daily aggregates are judged by returned observation presence, coverage, and revision, never by calories being positive.

This lane separation is required for crash/relaunch and transient-error safety. Sharing one pending-batch envelope and merely issuing the current-day query first would not satisfy the invariant.

## Bounded September 23 repair design

The one-shot tool will remain separate from permanent automatic synchronization:

- exact local date `2026-09-23` only;
- Activity only;
- exact-day HealthKit bounds derived using the current local calendar/timezone;
- a dedicated local repair scope that maps to the normal Server `automatic` namespace and stable enrolled-device identity;
- dry-run queries HealthKit and computes a sorted, privacy-safe aggregate digest without staging or uploading;
- a zero-valued returned aggregate is valid;
- the UI clearly separates DRY RUN from APPLY;
- production APPLY remains disabled in this candidate and hard-refuses without an injected explicit authorization capability;
- the apply contract is frozen to one existing canonical day, current/source revision 50, next successful revision 51, source count 51, and history count 50;
- any future authorized apply must re-query the exact day, require the aggregate digest to match the immediately preceding dry-run, permit only the expected revision-51 recovery and one exact-day retry, and cap requests at two;
- no September 24, Nutrition, Workout, Strength, Logger, policy, strategic, or unrelated mutation is permitted.

No Apple Health values will be embedded in source. The actual aggregate remains device-sourced at execution time.

## Test and review plan

Focused tests will cover current-day zero/nonzero presence, historical collision isolation, current-day collision retry, per-lane revision floors, Activity/Nutrition independence, foreground coalescing, relaunch, protected state, offline/reconnect, timezone rollover, unchanged historical bounds, and Workout regression.

Repair tests will cover exact date/scope/namespace, no-upload dry-run, zero aggregate, revision 50→51 contract, digest drift, authority/policy drift representation, duplicate-day refusal, maximum two requests, absent authorization refusal, and no unrelated mutation. Critical guards will be mutation-tested before the complete relevant Native HealthKit suite runs on the sole iPhone 17 Pro simulator.

An independent fresh-context adversarial review will examine the exact committed candidate. No archive or TestFlight upload is authorized.

## Invariants

- Production or device mutation: none.
- Server source/deployment mutation: none.
- TestFlight upload: none.
- September 23 repair: not applied.
- September 24 sync triggered: no.
- Policy/strategic eligibility: unchanged.
- Strength relationship and Logger: unchanged.
- Cardio: not started.
- Simulator use in this checkpoint: none.

## Flags

- AUTHORITY_REVERIFIED: YES
- SEP24_ZERO_VALUES_ALLOWED: YES
- CURRENT_DAY_FIRST_IMPLEMENTED: IN_PROGRESS
- CURRENT_DAY_HISTORICAL_ISOLATION_PASS: NOT_TESTED
- HISTORICAL_COLLISION_CANNOT_STARVE_CURRENT: DESIGN_SELECTED
- PER_DAY_REVISION_INDEPENDENT: DESIGN_SELECTED
- ACTIVITY_NUTRITION_SCOPE_INDEPENDENT: DESIGN_SELECTED
- ZERO_AGGREGATE_PRESENCE_TEST_PASS: NOT_TESTED
- TIMEZONE_ROLLOVER_PASS: NOT_TESTED
- SEP23_REPAIR_TOOL_IMPLEMENTED: IN_PROGRESS
- SEP23_REPAIR_DRYRUN_ONLY: YES
- SEP23_APPLY_AUTH_GATE_ENFORCED: DESIGN_SELECTED
- SEP23_DATE_SCOPE_HARD_BOUND: DESIGN_SELECTED
- SEP23_REVISION_50_51_GUARD: DESIGN_SELECTED
- SEP23_DIGEST_FENCE: DESIGN_SELECTED
- SEP23_MAX_TWO_REQUESTS: DESIGN_SELECTED
- SEP23_NO_UNRELATED_MUTATION: DESIGN_SELECTED
- MUTATION_TESTS_PASS: NOT_RUN
- NATIVE_TESTS_PASS: NOT_RUN
- FRESH_CONTEXT_REVIEWED: NO
- TESTFLIGHT_UPLOADED: NO
- SEP23_ACTIVITY_REPAIRED: NO
- READY_FOR_CARDIO: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO
