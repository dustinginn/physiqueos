Task id: codex-healthkit-current-day-priority-sep23-repair-20260924

Continue the primary HealthKit lane. Founder authorizes implementation and independent review of the smallest safe Native correction for Activity synchronization architecture plus the bounded September 23 Activity repair capability. This authorization is for CODE/TEST/REVIEW ONLY. It is NOT authorization for TestFlight upload or any repair/data mutation.

Use the SAME HealthKit Codex A chat. Reasoning: High.

Read first:
agent-handoffs/reports/20260924T130511Z-healthkit-build57-sep24-baseline-strength-acceptance.md
agent-handoffs/reports/20260924T131323Z-healthkit-sep23-activity-repair-dryrun-refused.md
agent-handoffs/reports/20260924T130954Z-midweek-server-deployment-complete.md
and the Build 57 implementation/review chain.

Fresh Founder fact that materially changes interpretation:
As of the current September 24 Texas-local acceptance boundary, Founder has NOT logged nutrition, performed a workout, or otherwise done intentional tracked activity for September 24. Therefore a legitimate Sep 24 Apple Health daily aggregate may currently be all zeros or near-zero depending on passive HealthKit fields. Do NOT treat zero Activity/Nutrition values as absence or failure. Distinguish:
A. no Sep 24 canonical observation/day exists;
B. a valid Sep 24 canonical observation/day exists with zero values.
The current production audit established A: no canonical Sep 24 Activity day exists. Acceptance must allow an actual zero-valued day once uploaded.

Current production authority expected unless reverified otherwise:
Server 28ac1e4f51afdf3a30f2fb50fcb5c95148a2709d
deployment e8c3bed3-20f6-4f5c-b34a-d27ab0881480
Native installed Build 57 source 6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9.
Reverify, do not assume.

Known defect:
Build 57 fixed deterministic revision rebase but automatic Activity uses a 30-day batch ordered oldest-first. Historical identity collisions (observed Aug 25->28) terminate each attempt before current-day upload, so current-day freshness is starved behind historical recovery. This is unacceptable production architecture.

Primary architecture requirement:
CURRENT-DAY FRESHNESS MUST NEVER BE BLOCKED BY HISTORICAL COLLISION RECOVERY.

Implement the smallest robust correction. Audit exact code first, then choose the minimal design consistent with these invariants:

1. Current local day is its own highest-priority Activity/Nutrition synchronization unit.
2. Query/upload the current day first, independently of historical/catch-up dates.
3. A historical collision/rebase/refusal cannot prevent the current-day attempt or poison its durable acknowledgement.
4. Historical recovery may continue afterward in bounded fashion, but must be isolated from current-day success.
5. Per-day revision high-water remains monotonic and independent.
6. One failed historical date cannot block later/current dates.
7. Activity and Nutrition remain independent scopes.
8. Pull-to-refresh/foreground coalescing cannot reorder this into historical-first starvation.
9. Local-date/time-zone transitions are explicit. Founder is currently in Texas; do not hard-code a timezone or assume the Sep 20-22 briefing timezone.
10. A legitimate current-day zero-valued aggregate is still a valid observation. Presence/coverage/revision determine success, not calories > 0.
11. No broad historical backfill is introduced. Existing no-backfill policy semantics remain.
12. Workout ingestion/reconciliation semantics remain unchanged.
13. Strategic eligibility/quarantine remains unchanged.

Prefer current-day-first partitioning over silently skipping errors. Do not weaken Server identity collision protections. Preserve nextExpectedRevision recovery.

Sep 23 exact-day repair capability:
Implement the bounded one-shot operational Native repair path described in the dry-run report, hard-bound to:
- date 2026-09-23 only;
- Activity only;
- normal automatic namespace/stable device identity;
- no Nutrition;
- no Sep 24 or other date;
- no historical sweep;
- query actual exact-day Apple Health aggregate from device;
- local dry-run computes/displays privacy-safe aggregate summary + digest and uploads nothing;
- apply is unavailable unless separately authorized in a future step;
- drift fence between local dry-run digest and apply-time digest;
- frozen Server facts: existing Sep 23 canonical/source revision 50, expected next successful revision 51, exactly one canonical day;
- permit at most the exact expected fail-closed collision/rebase to nextExpectedRevision=51 and one immediate Sep23-only retry;
- recovery metadata accepted only when observation type/date/namespace/current/received/nextExpected all match;
- refuse any unexpected revision, duplicate day, policy drift, server authority drift, aggregate drift, Sep24 mutation, Nutrition/Strength/Logger/strategic mutation.
Do not embed/fabricate Sep23 values in code. They must come from HealthKit at execution time.

The operational repair UI must be Founder-only/diagnostic, clearly labeled one-shot Sep 23 Activity repair, with separate DRY RUN and APPLY states. In this task, APPLY must remain impossible/not authorized for production execution. It is acceptable to implement the apply code behind an explicit authorization token/gate for later reviewed use, but do not invoke it.

Important: the general current-day-first fix and the Sep23 one-shot repair are separate concepts. The former is permanent production behavior. The latter is temporary/bounded operational tooling and must not become a generic historical-sync feature.

Sep24 acceptance semantics after a future build:
Because Founder currently has no intentional Sep24 tracked activity/nutrition, the first valid Sep24 Activity day may contain zero values. Acceptance is:
- canonical day PRESENT;
- source observation PRESENT;
- coverage/revision valid;
- durable ack healthy;
- no blocking historical collision;
NOT "active calories > 0".
A later natural Apple Health change should advance Sep24 revision monotonically without force quit/canary/manual test-day.

Testing required:
Permanent current-day-first:
- current day zero aggregate uploads successfully;
- current day nonzero aggregate uploads;
- oldest historical date collides but current day still succeeds in same foreground generation;
- multiple historical collisions do not block current day;
- current-day collision rebase/retry works;
- historical and current revision floors remain independent;
- Activity collision does not block Nutrition;
- Nutrition collision does not block Activity;
- pull-to-refresh during in-flight sync;
- queued rerun/coalescing preserves current-day-first;
- app relaunch;
- locked/protected state;
- offline/reconnect;
- timezone/local-date rollover;
- no backfill expansion;
- no Workout regression.

Sep23 repair:
- dry-run reads only Sep23 and uploads nothing;
- zero-valued Sep23 aggregate is valid if HealthKit returns it;
- wrong date/scope/namespace refuses;
- server current revision !=50 refuses;
- nextExpectedRevision !=51 refuses;
- duplicate canonical day refuses;
- device digest drift refuses;
- policy/runtime authority drift refuses;
- max two Sep23 requests;
- no Sep24/Nutrition/Workout/Strength/Logger/strategic mutation;
- exact successful fixture predicts source count 51/history 50/canonical revision 51;
- apply authorization absent -> hard refusal.

Mutation-test critical guards:
current-day priority ordering; per-day independence; zero-valued presence semantics; Sep23 date/scope; revision 50->51; digest fence; max-request count; authorization gate; no-unrelated-mutation guard.

Review:
Run focused Native suites and relevant full HealthKit Native suite on only the existing iPhone 17 Pro simulator.
Fresh-context independent adversarial review exact candidate.
If review finds Server changes necessary, stop and report; do not deploy.
Do not archive/upload TestFlight without separate Founder authorization.

Native build sequencing:
Codex B has a reviewed Midweek Native candidate based on Codex A Build57 lineage, but do NOT merge/package Midweek Native in this HealthKit correction candidate unless explicitly instructed later. Keep this candidate focused so the HealthKit reliability/repair behavior can be accepted independently. The next actual build number must be resolved at release time; do not race Codex B.

Cardio remains blocked until:
- permanent current-day-first fix accepted;
- Sep23 Activity repaired and verified;
- current-day baseline and later monotonic advance accepted.
Then publish READY_FOR_CARDIO.

Standing GitHub publication rule:
Every substantive chunk must be published to GitHub main under agent-handoffs/reports/ before being called complete.
Primary HealthKit lane updates latest.json/latest.md.
Chat updates include commit SHA + report path.
If publication fails, say REPORT NOT PUBLISHED.
Publish at least: architecture/code audit checkpoint; implementation/test checkpoint; fresh-review final candidate.

Standing simulator/disk:
Only iPhone 17 Pro simulator. No other simulator devices/runtimes. Targeted cleanup only.

Immediate next step:
Audit exact Build57 batching/coalescing implementation, implement permanent current-day-first isolation and bounded Sep23 repair tooling, mutation-test, run focused/full relevant Native suites, fresh-context review, publish final exact candidate. STOP for separate TestFlight authorization. Do not foreground/operate Founder's device, upload a build, repair Sep23, change policy/strategic eligibility, or begin Cardio.

Flags:
AUTHORITY_REVERIFIED
SEP24_ZERO_VALUES_ALLOWED
CURRENT_DAY_FIRST_IMPLEMENTED
CURRENT_DAY_HISTORICAL_ISOLATION_PASS
HISTORICAL_COLLISION_CANNOT_STARVE_CURRENT
PER_DAY_REVISION_INDEPENDENT
ACTIVITY_NUTRITION_SCOPE_INDEPENDENT
ZERO_AGGREGATE_PRESENCE_TEST_PASS
TIMEZONE_ROLLOVER_PASS
SEP23_REPAIR_TOOL_IMPLEMENTED
SEP23_REPAIR_DRYRUN_ONLY
SEP23_APPLY_AUTH_GATE_ENFORCED
SEP23_DATE_SCOPE_HARD_BOUND
SEP23_REVISION_50_51_GUARD
SEP23_DIGEST_FENCE
SEP23_MAX_TWO_REQUESTS
SEP23_NO_UNRELATED_MUTATION
MUTATION_TESTS_PASS
NATIVE_TESTS_PASS
FRESH_CONTEXT_REVIEWED
TESTFLIGHT_UPLOADED
SEP23_ACTIVITY_REPAIRED
READY_FOR_CARDIO
GH_REPORT_PUBLISHED
