Task id: healthkit-build51-foreground-catchup-regression-20260922

Investigate and fix the real-device Build 51 automatic Activity/Nutrition catch-up failure. Continue in the existing HealthKit Phase 2 Claude chat. Sonnet High.

Do not ask Founder to use the canary or manual Sync until diagnosis preserves the current failure state.

Observed real-device production facts after installing Build 51:
- Founder used PhysiqueOS normally and did not intentionally trigger manual HealthKit sync.
- Founder closed/reopened the app; Log did not advance.
- Apple Health at about 11:03 AM Sep 22 showed Move 624 cal, Exercise 105 min, Stand 5 hr, Steps 5,218.
- PhysiqueOS Log at about 11:08 AM still showed Activity 166 active calories and Nutrition 456 calories / 62P / 40C / 7F, Apple Health source.
- Founder also added additional Nutrition data after that earlier snapshot.
- PhysiqueOS Activity Evidence Report at about 11:14 AM still showed Sep 22: 166.268 active cal / 30 min, stand 2 hr, 3 workouts linked, workout calories 541 cal, non-workout calories 0, move goal pending.
This confirms the projected canonical Activity day itself is stale, not merely the compact Log row.
- Do not assume the displayed 3 linked workouts means HealthKit Workout canary is active; determine their existing source/link semantics.
- Manual HealthKit path was previously proven to work.
- Production canonicalization is open-ended from Sep 22; projection and evidence eligibility are live from Sep 22; Sep 21 remains validation-only.

First perform read-only production audit before changing state:
1. Reverify Server and Native Build 51 authority.
2. Inspect raw HealthKit observations received for Sep 22 after Build 51 install. Determine whether any automatic observation/upload occurred after the earlier manual/canonical snapshot.
3. Inspect current canonical Activity/Nutrition revisions and timestamps.
4. Determine whether failure is:
   a) coordinator not starting;
   b) HealthKit permission/authorization issue;
   c) foreground lifecycle hook not firing;
   d) HealthKit query returning stale/no data;
   e) revision/anchor logic suppressing legitimate updates;
   f) upload not firing/failing;
   g) Server canonicalization/revision rejection;
   h) projection/read cache stale despite canonical update;
   i) combination.
5. Compare automatic path directly to the known-working manual Sync path at code level without invoking manual Sync.

Trace exact path:
scene/app foreground -> HealthKitAutomaticSynchronizationCoordinator -> authorization/registration -> HealthKit queries/aggregation -> revision generation -> upload -> acknowledgement -> Server raw observation -> canonicalization -> projection -> Native read/cache refresh.

Important lifecycle clarification:
The Founder said "closed and opened the app." Do not assume this means force-terminated versus backgrounded; diagnose both foreground activation and cold launch hooks from code. The guaranteed design requirement is that any ordinary app launch/foreground performs catch-up automatically without visiting Founder Production.

Activity discrepancy to explain:
Apple Health Move 624 vs canonical 166.268;
Exercise 105 vs canonical 30;
Stand 5 vs canonical 2;
Steps should also be compared.
Evidence Report shows workout calories 541 while active calories are only 166.268 and non-workout 0. Audit whether this is an existing Activity reconciliation/display inconsistency or simply stale daily aggregate paired with independently existing workouts. Do not double-count workout calories.

Nutrition:
Determine current Apple Health aggregate from the raw HealthKit query/code path if safely observable; explain whether new nutrition samples should produce a new daily aggregate revision. Do not fabricate meal records.

If root cause requires Native change:
- implement smallest correct fix on top of Build 51 lineage;
- preserve Workout canary capability;
- preserve Sandbox isolation;
- preserve broad HealthKit permission decision already authorized;
- run full Native unit suite and relevant UI acceptance suite;
- mutation-test lifecycle/automatic-sync guards;
- independent fresh-context review;
- prepare next Native build (Build 52 unless current release numbering dictates otherwise).
Do not mix the previously logged Build 52 performance optimization or Training performance-record backlog into this emergency HealthKit fix.

If Server change is required, test/review/deploy only the bounded fix and preserve Sep21 exclusion/no-backfill.

Acceptance before declaring fixed:
- with canary/manual Sync unused, ordinary foreground/cold launch queries current Apple Health Activity + Nutrition;
- changed Apple Health values generate a new revision and upload automatically;
- Server canonical day advances exactly once;
- Log and Evidence read models reflect the new canonical revision without manual diagnostic action;
- repeat foreground with unchanged HealthKit values is idempotent/no duplicate;
- Sep21 remains excluded;
- Workout activation remains OFF;
- no Sandbox permission regression.

If a new build is shipped, real-device final acceptance must again avoid canary/manual Sync. Ask Founder only to install/open normally and report values.

Publish handoff at Founder-action blocker and final completion.

Flags:
BUILD51_AUTOMATIC_RAW_OBSERVATION_FOUND
BUILD51_FOREGROUND_HOOK_FIRED
BUILD51_HEALTHKIT_QUERY_CURRENT
BUILD51_REVISION_SUPPRESSED
BUILD51_UPLOAD_ATTEMPTED
BUILD51_SERVER_CANONICAL_ADVANCED
BUILD51_PROJECTION_STALE_ONLY
ACTIVITY_DAILY_VS_WORKOUT_RECONCILIATION_CORRECT
NUTRITION_AUTOMATIC_AGGREGATE_CURRENT
ROOT_CAUSE_FOUND
NATIVE_FIX_REQUIRED
SERVER_FIX_REQUIRED
NEXT_BUILD_REQUIRED
MANUAL_SYNC_USED_DURING_DIAGNOSIS
SEP21_UNCHANGED
WORKOUT_ACTIVATION_ENABLED
READY_FOR_REAL_DEVICE_AUTOMATIC_RETEST
