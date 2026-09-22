Task id: healthkit-build52-real-device-selfheal-failure-20260922

Diagnose the confirmed real-device Build 52 automatic HealthKit self-heal failure. Continue in the same available Mac-originated Claude session. Sonnet High.

Founder confirms corrected Build 52 is installed.

Real-device acceptance result:
- Founder did NOT enable canary.
- Founder did NOT press manual Sync.
- Founder closed/reopened/foregrounded PhysiqueOS approximately four times.
- Expected design said the previously poisoned Activity stream should self-heal within two ordinary foregrounds.
- It did not.
- Log remains stale at Activity 166 active calories and Nutrition 456 kcal / 62P / 40C / about 7F.
- Earlier Apple Health reference for the same day was already Move 624 cal, Exercise 105 min, Stand 5 hr, Steps 5,218, and additional Nutrition data had been added.
- Therefore Build 52 real-device acceptance FAILED.

Preserve failure state. Do not ask Founder to enable canary, press manual Sync, reinstall, clear app data, or reset HealthKit state before read-only diagnosis.

Current expected authority:
Server 924d5e556ba418ceb64de828d4c6a7c06d99f769
deployment c2442650-a9a0-499e-bc42-59b81c0c8bae
Native Build 52 final reviewed SHA 4894e162b42f018745a12506ceacfe243a5fbb50
Build 52 Apple delivery 6b7d449f-ca94-49fa-957d-1534d20ec52d, VALID.

First: read-only diagnosis

Reverify authority.

Use bounded read-only production/runtime inspection to reconstruct what happened after Build 52 installation and the four foregrounds.

Determine, with timestamps where safely available:
1. Did Build 52 automatic coordinator start at all?
2. Did foreground #1 encounter the old permanently rejected Activity partition?
3. Did abandonPendingBatch execute locally? If local-only state cannot be observed remotely, infer only from subsequent network/runtime behavior and say what is unobservable.
4. Did foreground #2+ query HealthKit again?
5. Did Build 52 create a newly namespaced automatic Activity identity?
6. Did it attempt upload?
7. Did Server receive any new Activity intake after Build 52 install?
8. If received, exact response class/code and whether purpose-immutability collision is gone.
9. Did canonical Activity revision advance?
10. Did projection/evidence revision advance?
11. Repeat all relevant checks for Nutrition.
12. Are there new 4xx/5xx/runtime errors after Build 52 install?
13. Did authorization/permission state prevent query?
14. Did the automatic coordinator skip because of authority mode, lifecycle state, feature gate, in-flight/reentrancy guard, persisted cursor, persisted batch status, or another condition?
15. Could Native UI/read caching alone explain stale display? Prove against canonical Server state.

Compare expected Build 52 state machine to observed runtime behavior line-by-line.

Do not assume the prior Build 52 fix is correct merely because tests passed.

Specific suspicion to challenge

The prior design says abandonPendingBatch retires the rejected batch without advancing the cursor, then a later foreground re-queries and uses the new automatic namespace.

Verify that the state machine actually allows the second query after abandonment. Check:
- whether abandoned/rejected partition remains selected as pending;
- whether an in-flight guard remains latched;
- whether cursor/anchor remains at a point that causes the same partition to be regenerated incorrectly;
- whether revision-floor logic suppresses it;
- whether persisted Build 51 state decodes into Build 52 recovery semantics correctly;
- whether install/update lifecycle initializes the coordinator early enough;
- whether automatic coordinator only starts after a permission request callback that is not re-fired for already-authorized users;
- whether scenePhase/foreground hooks actually fire in Founder Production on real device;
- whether the feature gate is truly enabled in Release Build 52;
- whether external-ID namespacing is applied at the exact upload call site used on real device.

Nutrition

The Build 52 lineage includes the earlier Nutrition catch-up fix. Determine why Nutrition also remains stale after four foregrounds. This is critical evidence that the failure may be above the Activity-specific poisoned-partition layer (for example coordinator/lifecycle/query/upload not running at all).

Do not focus exclusively on the old Activity rejection.

Instrumentation decision

If current production logs cannot distinguish the Native stages because Build 52 lacks observability, do NOT guess and do NOT ask Founder to manually sync.

Implement minimal safe diagnostic telemetry in the next Native candidate sufficient to observe:
- coordinator start;
- foreground trigger;
- authorization result category without exposing private health data;
- Activity query completed + aggregate changed/unchanged;
- Nutrition query completed + aggregate changed/unchanged;
- batch state transition;
- upload attempted;
- upload response category/code;
- abandonment/recovery transition;
- revision/cursor decision.

No raw HealthKit values or sensitive payloads in telemetry.

Fix

If root cause is determinable now, implement smallest correct fix.

If diagnostic instrumentation is needed first, it may ship with the fix or as part of the next build, but do not create a manual-debug dependency.

Preserve:
- no routine canary;
- no routine manual Sync;
- Sep21 validation-only;
- Sep22+ canonicalization/projection/evidence;
- purpose immutability;
- automatic identity namespace;
- Workout activation OFF;
- Sandbox isolation;
- Nutrition fix;
- no duplicate canonical days.

Testing

Reproduce the actual upgrade state where possible:
Build 51 persisted rejected Activity state -> install/launch new candidate -> foreground 1 -> foreground 2 -> self-heal.
Also test already-authorized HealthKit permissions on launch; do not only test fresh permission grant.

Test both Activity and Nutrition.

Full Native suite + relevant UI acceptance suite.
Mutation-test root-cause guard.
Fresh-context independent review.

Release

This is now the next sequential build after Build 52; expected Build 53 if a Native fix/instrumentation build is required.

The previously planned performance optimization, Training performance-record audit, and generic rejection circuit-breaker backlog move to Build 54. Do not mix them into this HealthKit acceptance fix.

If a new build is ready and upload requires explicit Founder approval, ASK THE FOUNDER DIRECTLY IN THE CLAUDE CHAT and wait for approval, then continue. Do not stop/publish blocked merely because contemporaneous Founder authorization is required. Stop only if Founder declines or the host remains technically unable after approval.

Real-device acceptance after next build:
- no canary;
- no manual Sync;
- ordinary open/foreground only;
- verify both Activity and Nutrition advance toward current Apple Health;
- repeat unchanged foreground idempotent.

Publish handoff at substantive blocker and completion.

Flags:
BUILD52_COORDINATOR_STARTED
BUILD52_FOREGROUND_TRIGGER_OBSERVED
BUILD52_ACTIVITY_QUERY_OBSERVED
BUILD52_NUTRITION_QUERY_OBSERVED
BUILD52_ACTIVITY_UPLOAD_OBSERVED
BUILD52_NUTRITION_UPLOAD_OBSERVED
BUILD52_NEW_NAMESPACE_OBSERVED
BUILD52_ACTIVITY_SERVER_RECEIVED
BUILD52_NUTRITION_SERVER_RECEIVED
BUILD52_ACTIVITY_CANONICAL_ADVANCED
BUILD52_NUTRITION_CANONICAL_ADVANCED
BUILD52_UI_CACHE_ONLY_FAILURE
POISONED_PARTITION_ABANDONED
SECOND_FOREGROUND_REQUERY_OCCURRED
ROOT_CAUSE_FOUND
DIAGNOSTIC_TELEMETRY_REQUIRED
NATIVE_FIX_REQUIRED
SERVER_FIX_REQUIRED
NEXT_BUILD_REQUIRED
FULL_NATIVE_SUITE_PASSED
UI_ACCEPTANCE_SUITE_PASSED
INDEPENDENT_REVIEW_APPROVED
MANUAL_SYNC_USED
CANARY_USED
SEP21_UNCHANGED
WORKOUT_ACTIVATION_ENABLED
READY_FOR_REAL_DEVICE_RETEST


LIVE FOUNDER UPDATE — 2026-09-22 approximately 16:41 Founder-local

While this task is being investigated, without using the canary or manual Sync, Nutrition eventually advanced automatically on Build 52 after a long delay. The ordinary Log now shows:
- Nutrition 2,406 calories
- 178g protein
- 174g carbohydrates
- 109g fat
- source Apple Health

Activity remains stale at 166 active calories on the same Log screen.

This materially narrows the failure:
- automatic Nutrition ingestion/canonicalization/projection can succeed on Build 52, though latency may be significant;
- the automatic coordinator is therefore not globally dead;
- Activity remains independently stuck/stale and should remain the primary failure to trace;
- investigate timestamps of the successful Nutrition observation/upload/canonical revision to determine whether it arrived from background delivery, foreground catch-up, delayed retry, or another automatic trigger;
- quantify the observed latency if possible and decide whether it is expected iOS/HealthKit delivery behavior or a PhysiqueOS retry/scheduling problem;
- do not regress Nutrition while fixing Activity.

Updated acceptance: Activity must still self-heal without canary/manual Sync. Nutrition should continue advancing automatically, and its latency characteristics must be explained rather than simply marked pass/fail.
