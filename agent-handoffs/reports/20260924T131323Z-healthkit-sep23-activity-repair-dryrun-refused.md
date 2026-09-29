# September 23 Activity repair dry-run — refused pending bounded Native transport

Generated: 2026-09-24T13:13:23Z

Task ID: `codex-healthkit-build57-sep24-acceptance-sep23-repair-20260924`

## Result

The read-only September 23 Activity repair dry-run failed closed and made no mutation. The repair is not apply-ready: installed Build 57 has no operational transport that can upload only September 23 Activity in the normal automatic namespace, the exact current Apple Health aggregate has not yet been read from the phone, and a September 24 Activity baseline has not been established.

The repair design is now bounded. Its expected successful Server mutation is exactly one new September 23 Activity observation at source revision 51 and one update of the existing September 23 canonical Activity day from revision 50 to 51, with revision history advancing from 49 to 50. The values must be the actual exact-day Apple Health aggregate read on the device immediately before upload; they must not be copied, inferred, or fabricated.

No repair, device sync, Server/data mutation, Native build, upload, policy change, strategic-eligibility change, Strength mutation, or Cardio work occurred.

## Current authority

- Initial HealthKit audit authority: Server `63395579ed70611be8a57f032133a43a3bc67800`, deployment `117d8a2f-8cc1-4ef1-9247-1029c875e401`.
- Current production Server authority: `28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d`.
- Current deployment: `e8c3bed3-20f6-4f5c-b34a-d27ab0881480`, ACTIVE 9/9.
- Runtime build: `physiqueos-28ac1e4f-20260924`; web and worker source/stamps are exact.
- Native real-device authority: installed Build 57, source `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`.

The authority changed during this read-only task because a separately authorized Midweek Server candidate deployed concurrently. Git ancestry and the exact `63395579..28ac1e4f` diff show that the intervening commits affect Midweek briefing work only and do not touch HealthKit, Activity, database, or migration paths. The repair dry-run was rerun against exact current runtime `28ac1e4f`; the first attempt against the retiring deployment stopped before database access.

## Read-only dry-run contract

The successful production dry-run used the exact runtime gate, one owner-scoped connection, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, required `transaction_read_only=on`, used parameterized reads, explicitly rolled back, and emitted `PHYSIQUEOS_SEP23_ACTIVITY_REPAIR_DRYRUN_SUCCESS` only after rollback.

Dry-run outcome: `refused`.

Refusal reasons:

1. `ACTUAL_SEP23_APPLE_HEALTH_ACTIVITY_AGGREGATE_REQUIRED`
2. `BUILD57_HAS_NO_EXACT_DAY_AUTOMATIC_SCOPE_REPAIR_TRANSPORT`
3. `SEP24_ACTIVITY_BASELINE_NOT_ESTABLISHED`

## Frozen production facts

September 23 Activity:

- Stable canonical ID: `healthkit_canonical_day_activity_2026-09-23`.
- Canonical revision: 50.
- Canonical source revision: 50.
- Maximum durable source revision: 50.
- Source observation count: 50.
- Revision history count: 49.
- Coverage: `partial_day`.
- Last canonical update: `2026-09-23T18:35:26.307Z`.
- Stable values digest: `d83f06dac0181cb0d46ffc6f388a09df4219ac28e6d40c7cf049d1905cc37ea7`.

Related scope facts:

- September 23 Nutrition is independently healthy at canonical/source revision 5, four history rows, five source observations, and `complete_day`; it does not need repair.
- September 24 Activity canonical-day count: 0.
- September 24 Nutrition canonical-day count: 0.
- Daily policy digest: `d5f0b571b6c046be9710a0551a6d4d230b249eb4088f79878f2647d3b5c40586`.
- Workout policy digest: `dc7ba152cf5e9dd528e380bed6bc036601c15a222766b90acdf753d1817f2f4b`.
- Policies remain strategically quarantined; Workout auto-confirm remains off.
- Strategic evidence, briefing, analysis, and confidence digests remained unchanged across the read-only audit.

## Why Build 57 cannot safely perform this repair

Build 57's normal automatic Activity synchronization uses the standard 30-day lookback. Production evidence shows it walking older collided days one attempt at a time, from August 25 through August 28, before it can reach current data. Foregrounding the app or invoking normal refresh therefore cannot guarantee a September-23-only mutation.

The existing exact-day alternatives are not substitutes:

- Validation sync uses a validation-only identity and remains raw rather than updating the automatic canonical day.
- Canonical test-day sync uses a separate test-day identity/revision stream; its low revision would remain superseded behind the existing automatic revision 50.
- Manual canary sync is not authorized and does not satisfy the automatic-namespace repair contract.

A Server-only correction is also refused. The Server must not manufacture Apple Health values, reuse the stale approximately 606-calorie payload, infer a total from the 321 workout calories, or copy September 24 values.

## Smallest safe repair design

A new reviewed Native candidate is required with a dedicated, one-shot operational Activity repair path that is hard-bound to all of the following:

- local date exactly `2026-09-23`;
- Activity only;
- the normal automatic namespace and stable device identity;
- no Nutrition;
- no September 24 or other date;
- no historical sweep and no deletions;
- a local dry-run that queries the exact September 23 Apple Health interval, displays the aggregate and digest, and performs no upload;
- an apply path that requires separate Founder authorization and the exact frozen Server facts above;
- a maximum of two requests for the target day only: an initial fail-closed collision may return `nextExpectedRevision=51`, after which Native may persist that exact floor and immediately retry only September 23 at revision 51;
- acceptance of recovery metadata only when observation type, date, current revision, received revision, and next expected revision exactly match the frozen contract;
- a drift fence requiring the apply-time device aggregate digest to equal the immediately preceding local dry-run digest.

The path must refuse on a missing aggregate, any other date or scope, `nextExpectedRevision` other than 51, runtime/policy/day/digest drift, duplicate canonical days, unexpected September 24 state change, or any proposed Nutrition/Strength/Logger/strategic mutation.

This design must be implemented, mutation-tested, run through focused suites, and independently reviewed before archive or upload authorization is requested. A separate authorization will then be required for any TestFlight upload, and another fresh authorization will be required for the actual device repair.

## Exact predicted successful mutation

If and only if all prerequisites and drift fences pass, the bounded repair predicts:

1. Create exactly one operational Activity source observation for `activity-summary:automatic:2026-09-23` with source revision 51, `complete_day` coverage, the stable automatic device identity, and the exact Apple Health values/digest read from the phone.
2. Update only `healthkit_canonical_day_activity_2026-09-23` from canonical/source revision 50 to 51, append exactly one history row so the history count becomes 50, and point it to the new source observation.
3. Preserve every other invariant listed below.

No exact caloric or movement values are predicted yet because the fresh device query is a mandatory input. Reporting a guessed value would violate the repair contract.

## Required post-write invariants

An independent audit after a separately authorized apply must prove:

- exactly one new September 23 Activity observation;
- exactly one September 23 canonical Activity day, at canonical/source revision 51;
- history count exactly 50 and source observation count exactly 51;
- coverage `complete_day` and values/digest equal the authorized device dry-run;
- no September 24 Activity or Nutrition mutation;
- September 23 Nutrition unchanged at revision 5;
- the confirmed Strength relationship and Logger detail unchanged;
- the Activity presentation still contains one linked workout with 321 workout calories, while non-workout calories recompute as `max(actual active calories - 321, 0)`;
- policy, strategic eligibility, canonical evidence, analysis, briefing, and confidence digests unchanged;
- no unrelated data mutation.

## Strength acceptance status

The Founder's Build 57 observations pass Workout Detail HealthKit provenance and telemetry, unchanged Logger content, one linked workout, 321 workout calories, visible non-workout derivation, and no duplicate Training row. The confirmed confidence-95 relationship remains quarantined and strategically inert. The remaining presentation observation is the Log row label, expected to read `Strength Training · Apple Health` without a second row.

Full September 23 Activity correctness is not claimed while its whole-day canonical aggregate remains stale.

## September 24 and future second-advance plan

September 24 Activity has no baseline, so a second revision advance cannot yet be tested. After a corrected bounded/current-day flow establishes revision 1 from ordinary behavior, a later material Apple Health change must advance that date to revision 2 without force-quit, canary controls, or manual Test Day sync. The durable acknowledgement must advance, and no 409 may remain. Nutrition should be evaluated independently if Apple Health contains materially changed nutrition data.

Cardio remains blocked until Activity repair and ordinary second-advance acceptance are complete.

## Durable checkpoints

- September 24 baseline/Strength acceptance report: `agent-handoffs/reports/20260924T130511Z-healthkit-build57-sep24-baseline-strength-acceptance.md`, published in commit `136395d66bffa27a792cbcead0817d28fb6d3c3b`.
- Concurrent Midweek deployment authority report: `agent-handoffs/reports/20260924T130954Z-midweek-server-deployment-complete.md`, published in commit `8165c0bdb4d82be799763f925ccae06983011912`.
- This report supersedes the repair-planning status and current authority fields in the earlier baseline checkpoint; it does not alter the immutable facts recorded there at its audit boundary.

## Flags

- AUTHORITY_REVERIFIED: YES
- BUILD57_REAL_DEVICE_INSTALLED: YES
- SEP24_ACTIVITY_BASELINE_PRESENT: NO
- SEP24_ACTIVITY_REVISION: ABSENT
- SEP24_ACTIVITY_LAST_SUCCESS_HEALTHY: NO
- SEP24_ACTIVITY_409_FREE: NO
- SEP24_NUTRITION_BASELINE_PRESENT: NO
- SEP24_SCOPE_INDEPENDENCE_HEALTHY: YES
- SEP23_ACTIVITY_STILL_STALE: YES
- SEP23_ACTIVITY_CURRENT_REVISION: 50
- SEP23_REPAIR_PLAN_READY: YES
- SEP23_REPAIR_DRYRUN_READY: NO_REFUSED_PREREQUISITES
- SEP23_REPAIR_AUTHORIZED: NO
- SEP23_ACTIVITY_REPAIRED: NO
- SEP23_NUTRITION_REPAIR_NEEDED: NO
- STRENGTH_DETAIL_PROVENANCE_PASS: YES
- STRENGTH_DETAIL_TELEMETRY_PASS: YES
- STRENGTH_ACTIVITY_321_PASS: YES
- STRENGTH_LOG_PROVENANCE_PASS: PENDING_FOUNDER_OBSERVATION
- SEP24_SECOND_ADVANCE_PASS: NOT_TESTED
- READY_FOR_CARDIO: NO
- GH_REPORT_PUBLISHED: YES
- CONTAINS_SECRETS: NO
