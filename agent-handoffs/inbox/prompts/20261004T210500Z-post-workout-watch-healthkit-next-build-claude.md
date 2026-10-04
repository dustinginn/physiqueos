PhysiqueOS next Native build — post-workout Watch/HealthKit fixes + Foam Rolling pilot integration

TASK TYPE

Continue in the EXISTING Claude Remote Control chat that produced the 2026-10-04 live workout HealthKit/Watch audit.
Use High reasoning.
Implementation task for the next Native build candidate.
Do not create a new Claude chat.

CONTEXT FROM TODAY'S REAL WORKOUT

The Founder has now finished the workout.

During the session:
1. PhysiqueOS structured Workout Logger was running.
2. Watch Workout Metrics showed elapsed TIME but Active Calories, Total Calories and Heart Rate remained “—”.
3. Complete Set on Watch was noticeably laggy after phone/set state changes.
4. At roughly 10–15 feet from the iPhone, Complete Set sometimes did not enable/light until the Founder moved physically closer.
5. The Founder concluded PhysiqueOS was likely not recording a HealthKit workout.
6. Mid-workout, to preserve calorie/HR data, the Founder manually started Apple's Workout app using Traditional Strength Training for the remainder. That Apple strength workout is therefore intentionally truncated/late-starting relative to the PhysiqueOS structured session.
7. The same workout period also contains TWO Stair Stepper workouts.
8. The PhysiqueOS structured Logger session remains the canonical structured strength record and had the Watch/HealthKit problems already audited.

Today’s real workout evidence set is therefore:
- 2 Stair Stepper workouts;
- 1 truncated/late-start Apple Traditional Strength Training workout;
- 1 PhysiqueOS structured Workout Logger session.

Use this as a real reconciliation/acceptance case. Do not assume the Apple strength workout should automatically replace, merge with, or duplicate the structured Logger record.

PRIOR AUDIT AUTHORITY

Read the existing Claude audit:
agent-handoffs/reports/20261004T202256Z-live-workout-healthkit-watch-audit.md

Audit commit:
6682a426bb8a94694eb4e42d208b4e321d17cf38

The audit established:
- phone-started structured sessions do not start a Watch HKWorkoutSession;
- Watch metrics TIME uses phone anchors while HR/energy require the Watch HKLiveWorkoutBuilder;
- Health status can falsely claim HEALTH ON;
- activation/reachability refresh occupies the single-flight gate and disables Complete Set;
- phone-originated projection updates use application context only;
- runtime timing instrumentation is missing.

Reverify current Native/server authority before implementation. Do not assume Build 85 remains exact head after the Foam Rolling pilot work.

PART A — TODAY'S WORKOUT RECONCILIATION AUDIT FIRST

Before changing matching/reconciliation behavior, determine how the current app/server will ingest and represent today's exact set:
- two Stair Stepper workouts;
- truncated Apple Traditional Strength Training workout;
- PhysiqueOS structured Logger session.

Determine:
- whether both Stair Stepper workouts remain independent cardio observations/workouts;
- whether the truncated Apple strength workout will surface for Evidence Review / Pending Workout Match;
- whether it could incorrectly duplicate or overwrite the structured Logger strength session;
- how calories/HR from the truncated Apple workout contribute to Activity independently of structured strength evidence;
- whether current trusted correlation should or should not match the late-start Apple workout;
- whether any manual Founder action will be needed after sync.

Do NOT mutate production records merely to make today's data look cleaner.
Do NOT silently widen trusted matching/correlation policy.
Preserve the existing 120-second trust boundary unless a separately justified change is explicitly approved.

If current behavior safely leaves the truncated Apple strength workout for ordinary review/matching, preserve that.

PART B — HEALTHKIT WORKOUT FIX

Implement the smallest durable fix for the defect proven in the audit.

TARGET PRODUCT BEHAVIOR

A normal phone-started PhysiqueOS structured strength workout should be able to establish exactly one corresponding Watch HealthKit workout without requiring the Founder to remember the old Ready for Watch -> Start Workout sequence.

Prefer automatic HealthKit establishment when the Watch receives an active/paused structured PhysiqueOS session and:
- no live Watch HealthKit workout exists for that structured session;
- no stored/saved workout for that session already exists;
- required HealthKit capability/authorization is available.

Preserve the existing Watch-started flow.

Requirements:
- exactly-once/idempotent start;
- structured session identity remains authoritative;
- phone learns/stores the Watch Health start so finish/save semantics work;
- no duplicate HKWorkoutSession on replay/reconnect/relaunch;
- paused structured session establishes/enters the correct paused Health state;
- terminal/cancelled session never auto-starts;
- failure is visible and retryable;
- do not silently loosen trusted correlation timing for late starts.

If source constraints make safe auto-start materially worse than an explicit action, stop and explain before substituting a different product behavior.

PART C — TRUTHFUL HEALTH STATUS + METRICS

Fix Watch Health status so:
- HEALTH ON appears only when HealthKit lifecycle actually indicates recording/running/paused as appropriate;
- no active HealthKit workout is represented truthfully as NOT RECORDING TO HEALTH or equivalent concise locked-style language;
- failed start is explicit and retryable;
- Workout Metrics retains canonical TIME behavior but HR/Active/Total Calories populate from the live HealthKit builder when recording.

Do not fabricate metrics or fall back to unrelated daily Health values.

PART D — COMPLETE SET LATENCY

Fix the proven defect where read-only refresh occupies the mutation gate.

Acceptance:
- a read-only projection refresh does not disable Complete Set when the Watch already has a valid active projection and reachable command path;
- Complete Set still has exactly-once mutation semantics;
- stale revision races reconcile safely;
- actual mutations still serialize correctly;
- lost/slow replies retain safe retry semantics.

Add timing instrumentation around:
scene/display activation -> reachability -> refresh issued -> acknowledgement -> projection applied -> Complete Set enabled.

Use that instrumentation to distinguish remaining reachability/platform delay from app-created delay.

PART E — PHONE -> WATCH DELIVERY

Do not blindly rewrite WatchConnectivity.

After Part D and instrumentation, assess the application-context-only phone -> Watch push path.

If source/tests and measured/simulated behavior justify an immediate reachable message push in addition to application context:
- implement it as an additive fast path;
- retain application context as durable/coalesced fallback;
- deduplicate by projection revision;
- do not create message storms or duplicate mutations.

If measurement is insufficient, leave this optimization out of this build and document it for physical-device validation.

The Founder specifically observed failure/lag around 10–15 feet from the phone, improving when moving closer. Treat this as an important physical-device acceptance case, not as proof of a particular transport root cause.

PART F — FOAM ROLLING IMPLEMENTATION

Include the already accepted Foam Rolling Priority Detail implementation pilot in this next build.

Pilot authority:
Implementation commit b65deb00098713d824f14064e0362726997b5991
Report:
agent-handoffs/reports/20261004T205243Z-foam-rolling-priority-parity-pilot.md

Preserve the accepted implementation exactly unless integration conflicts require a bounded correction.

Include:
- Dark + Mineral Light Foam Rolling Priority Detail implementation;
- exact canonical content/behavior;
- setup-required Review Support route fix to canonical Recovery Support;
- completion/skip safety;
- existing deterministic tests.

Do NOT scale the redesign to the rest of Priority Detail family in this build.

PART G — THEME BOUNDARY

The broader app-wide System/Dark/Light implementation is NOT part of this build task yet. The Founder wants that immediately after all remaining design surfaces are locked.

For this build:
- preserve the Foam Rolling pilot's bounded Mineral Light implementation/capture mechanism;
- do not prematurely migrate the whole app theme architecture;
- do not create a competing global theme solution.

PART H — TESTS

Add deterministic coverage for at minimum:
1. phone-started active structured session establishes HealthKit exactly once;
2. replay/reconnect does not double-start;
3. paused session behavior;
4. terminal/cancelled session never starts;
5. Health start failure + retry;
6. phone authority receives/stores Health start identity/timestamp exactly once;
7. finish produces exactly one Health save leg;
8. truthful Health status lifecycle matrix;
9. metrics source behavior;
10. activation refresh does not disable Complete Set;
11. Complete Set during/racing refresh is not lost or duplicated;
12. stale revision reconciliation;
13. any additive immediate projection push, if implemented, deduplicates correctly;
14. Foam Rolling pilot regression suite;
15. today's reconciliation case at the policy/unit level where feasible: two cardio workouts remain distinct and a late-start Apple strength workout cannot silently become a trusted duplicate of the structured session.

Run relevant Native unit/UI tests and Release compile including Watch/Live Activity targets.

PART I — NEXT BUILD CANDIDATE

Prepare the code as the next Native build candidate, but DO NOT upload to TestFlight until Founder/ChatGPT reviews the implementation report unless the existing workflow explicitly requires a local archive/build number reservation.

Do not open/login to App Store Connect or Apple Developer in a browser.
If Xcode authentication is required later, tell the Founder.

Report exactly:
- implementation authority/base;
- commits integrated;
- today's workout reconciliation findings;
- HealthKit start behavior before/after;
- Watch latency behavior before/after;
- whether immediate phone->Watch push was included or deferred;
- Foam Rolling integration status;
- tests;
- Release build result;
- physical-device checks still required;
- recommended build number if applicable.

PART J — PHYSICAL DEVICE ACCEPTANCE PLAN

The next build must explicitly validate:
- start a normal structured strength workout on iPhone and use Watch without Ready for Watch ceremony;
- Watch immediately/automatically records HealthKit exactly once;
- HR/Active/Total Calories populate;
- truthful Health status;
- Complete Set responsiveness at normal proximity and specifically around 10–15 feet;
- wrist-down/wrist-up behavior;
- phone-originated set changes;
- pause/resume;
- finish and exactly-one Health workout save;
- no duplicate strength workout;
- Foam Rolling Priority Detail on physical iPhone;
- Foam Rolling completion/skip/setup route;
- Dark appearance now; Mineral Light pilot only until global theme architecture lands.

IMPLEMENTATION DELTA LEDGER

Review agent-handoffs/DESIGN_IMPLEMENTATION_DELTA_LEDGER.md.
Resolve only entries genuinely fixed by this work.
Do not close the timed-set projection issue unless independently fixed/tested.
Do not close unrelated Settings/theme/Evidence/design deltas.

OUTPUT

Publish a concise implementation report under agent-handoffs/reports/.
Publish normal latest/reporting pointers.
If screenshots/artifacts are useful, make them main-visible.
No production mutation.
No TestFlight upload yet.

STOP after the next-build candidate is implemented, tested, compiled, documented and ready for Founder/ChatGPT review.

END TASK.