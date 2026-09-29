# Build 57 September 24 baseline and Strength acceptance — Activity not yet accepted

Generated: 2026-09-24T13:05:11Z

Task ID: `codex-healthkit-build57-sep24-acceptance-sep23-repair-20260924`

## Result

The bounded read-only September 24 baseline is not yet healthy. Production contains no September 24 Activity canonical day and no September 24 Nutrition canonical day. Build 57's daily-revision recovery is active, but the Activity scope is traversing historical collisions from the oldest date in its 30-day lookback and has not reached September 24.

No application, device sync, Server/data, policy, strategic-eligibility, Strength, or Cardio mutation was initiated by this audit.

## Authority

- Production Server: exact `63395579ed70611be8a57f032133a43a3bc67800`.
- Active deployment: `117d8a2f-8cc1-4ef1-9247-1029c875e401`, ACTIVE 9/9.
- Web and worker deployment source: exact Server SHA.
- Runtime build: `physiqueos-63395579-20260924`.
- Native real-device authority: installed Build 57 source `6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9`, corroborated by the Build-57-only recovery progression described below and the Founder's post-install presentation observations.
- Daily policy: enabled for Activity and Nutrition from September 22, no historical backfill, strategically quarantined.
- Workout policy: Strength only from September 23, no historical backfill, strategically quarantined, `linkAutoConfirm=false`.
- Cardio: not started.

## Read-only audit contract

Two production audits were run against the exact runtime. Each used one owner-scoped connection, `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, required `transaction_read_only=on`, used parameterized reads, explicitly rolled back, and emitted its success marker only after rollback. Production log retrieval was read-only and filtered to privacy-safe collision/receipt events.

## September 24 baseline

At the audit boundary:

- September 24 Activity observations: 0.
- September 24 Activity canonical days: 0.
- September 24 Activity revision/source revision: absent.
- September 24 Nutrition observations: 0.
- September 24 Nutrition canonical days: 0.
- September 24 Nutrition revision/source revision: absent.
- Duplicate September 23–24 canonical days: 0.
- September 24 identity collision: none observed; the Activity batch has not reached September 24.
- Automatic Activity scope overall 409-free: no.

The absence is not a stale Native cache: the production database itself has no September 24 daily aggregate.

## Build 57 recovery progression and scope health

Before Build 57 was available, Build 56 repeatedly collided on August 25. After Build 57 installation, the Server observed the Build-57-only recovery progression:

| UTC | scope | local date | received revision | next expected | result |
|---|---|---:|---:|---:|---|
| 12:51:14 | Activity | 2026-08-25 | 1 | 2 | fail-closed 409 |
| 12:52:02 | Activity | 2026-08-26 | 1 | 2 | fail-closed 409 |
| 12:53:22 | Activity | 2026-08-27 | 1 | 2 | fail-closed 409 |
| 12:53:37 | Activity | 2026-08-28 | 1 | 2 | fail-closed 409 |

Moving to a different historical collision on the next attempt proves that Native consumed each Server `nextExpectedRevision` and persisted a revision floor. However, the 30-day Activity batch encounters the oldest unresolved identity first, so current-day ingestion is blocked behind a date-by-date collision walk. No subsequent Activity receipt was committed by the audit boundary.

The exact device-local diagnostics values cannot be read from the Server. Based on authoritative Server evidence, the Activity card should show recent attempts/queries, abandoned collision batches, nonzero revision floors, a last rebase at August 28 to revision 2, and a collision error with no new September 24 durable acknowledgement. A Founder screenshot/check is still required to validate those exact local facts without pressing any sync control.

## Activity/Nutrition independence

Nutrition succeeded independently while Activity was colliding:

- September 23 Nutrition advanced to canonical/source revision 5.
- Revision history count: 4.
- Coverage: `complete_day`.
- Latest durable observation/canonical update: `2026-09-24T12:51:15.742Z`.
- Evidence eligibility remains quarantined and strategically ineligible.

The deployment audit had September 23 Nutrition at revision 4, so revision 5 is a fresh successful device-to-Server advance. This proves Activity and Nutrition scope isolation. It also proves September 23 Nutrition does not need a repair merely for symmetry. No September 24 nutrition data is yet present; the audit does not infer that Apple Health contains any for that date.

## September 23 Activity remains stale

- Canonical revision/source revision: 50.
- Revision history count: 49.
- Source observation count: 50.
- Last update: `2026-09-23T18:35:26.307Z`.
- Stored active calories: approximately 606.041.
- Stored exercise minutes: 102.
- Stored stand hours: 5.
- Stored steps: approximately 6,429.
- Coverage: `partial_day`.
- Evidence eligibility: quarantined; strategic eligible: false.

These facts match the Founder's visible stale 606-calorie denominator. The separate 321 workout-calorie projection is working but does not repair the whole-day Activity aggregate.

## Strength real-device acceptance record

Founder-observed Build 57 behavior and the independent Server audit establish:

- Workout Detail HealthKit provenance: PASS.
- Workout Detail HealthKit telemetry: PASS.
- Logger detail unchanged: PASS; expected session remains four exercises and sixteen sets.
- Activity linked workout count: PASS, exactly one.
- Activity workout calories: PASS, 321.
- Activity non-workout derivation: PASS, visible as 286; the whole-day denominator remains stale.
- Duplicate Training workout: PASS, none visible; Server retains one September 23 Strength workout and one confirmed relationship.
- Relationship status: confirmed, confidence 95, quarantined, strategically ineligible.
- Log provenance label: PENDING FOUNDER OBSERVATION. Expected Build 57 row is `Strength Training · Apple Health`; no second row should appear.

Full September 23 Activity correctness is not claimed.

## Mutation invariants

- Production Server/data mutation by this audit: none.
- Device-triggered sync by this audit: none.
- Manual canary/test-day sync: not used.
- September 23 Activity repair: not applied.
- September 23 Nutrition repair: not needed on current read-only evidence and not applied.
- Policy/strategic eligibility: unchanged.
- Confirmed Strength relationship/Logger session: unchanged.
- Cardio: not started.
- Simulator: not used.

## Next

Complete and publish the bounded September 23 Activity repair dry-run/refusal design with the newly discovered 30-day collision walk included. Do not trigger another automatic Activity pass until the plan is separately authorized, because a normal foreground may continue the historical collision walk.

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
- SEP23_REPAIR_PLAN_READY: NO
- SEP23_REPAIR_DRYRUN_READY: NO
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
