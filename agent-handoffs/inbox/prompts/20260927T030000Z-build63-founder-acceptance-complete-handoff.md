Task id: build63-founder-acceptance-complete-handoff-20260927

PURPOSE

Self-contained Build 63 Founder acceptance handoff for Claude. Founder did not send separate Claude prompts during Build 63 acceptance. Treat this GH file as the complete authoritative record of the acceptance results and intended next work.

Do not require any missing chat context.

CURRENT BUILD

Native Build 63 was uploaded and Apple processed it VALID.
Final Build63 source: 1ef837815fc43b70996abd972d1648547db78f46
Reviewed functional candidate beneath build metadata: 8a88873e2764340373bc2f2a6d46a6d634387ca2

Reverify current Server authority and latest HealthKit/Cardio Phase1 authority before operating.

BUILD63 FOUNDER ACCEPTANCE RESULTS

1. LOGGED TODAY CARDIO — PASS

Founder verified Log -> Logged Today -> Training now displays Outdoor Walk on the Cardio-only day instead of "Nothing logged yet."

This satisfies the intended unified Training presentation for Logged Today.

Preserve this behavior. Do not regress it.

2. ACTIVE GOAL V3 YOUR JOURNEY PROGRESS — FAIL

Founder compared Goal -> Build Lean Mass -> Your Journey against Home.

Home correctly renders:
Phase 1 Establish Maintenance: full progress bar plus Completed semantic trailing text.
Phase 2 Lean Mass Build: partial green progress bar plus "5.8 of 10 lb gained."

Goal -> Your Journey in Build63 still renders the phase cards with NO progress bars at all.

This is failed acceptance of the existing requirement, not a new requirement.

The prior implementation report said PhaseProgressPresentation was shared but also noted a showsProgress:false path. Diagnose the actual Build63 production rendering path and production payload/state. Determine whether real production is taking the progress-suppressed path and why.

Required result:
Your Journey must actually render Home's accepted phase-progress visualization and semantic trailing text.
Do not add a redundant raw percentage.
Preserve accepted Goal ordering/content and current phase descriptions.
Prefer shared Home semantics rather than a divergent design.

Do not patch based only on component-sharing assumptions. Prove the real-path cause.

3. COMPLETED VISIBLE ABS TRANSFORMATION PHOTOS — FAIL

Founder opened completed Visible Abs Goal in Build63.

Both Beginning (2026-05-21) and Completion (2026-07-18) still render placeholders rather than the Founder's real canonical progress photos.

The Build63 implementation attempted to extract mediaId from the existing completed-goal photo href and render via ProgressPhotoTile. Real-device acceptance proves that implementation is insufficient.

Diagnose against actual production data and the exact Build63 path before changing code.

Determine:
exact Beginning/Completion completed-goal payload photo fields and href values;
whether the intended canonical first/final photos are selected server-side;
exact mediaId extraction result in Native;
whether extraction succeeds;
whether ProgressPhotoTile is actually invoked with the expected mediaId;
authenticated media request path/result;
whether the media endpoint returns/authorizes the image;
whether the relevant media record is valid, canonical, non-superseded, and available;
the exact reason the placeholder remains.

Do not invent new photo-selection/storage semantics unless production evidence proves the existing authority is insufficient.

Required result:
Beginning renders the actual first canonical Founder progress photo.
Completion renders the actual final canonical Founder progress photo.
Missing/unavailable photo fallback remains safe.

4. STRENGTH RECONCILIATION — FAIL, BUT BUILD63 DIAGNOSTICS FINALLY CAPTURED THE REAL FAILURE

Founder made one real Sep24 confirmation attempt in Build63 and did not repeatedly retry.

The review shown:
Sep24
Version 1
Apple Health Traditional Strength Training
Possible Logger session 1
60% match
Founder used the real confirm action.

Result remained:
Refresh required
"The reconciliation outcome could not be verified as the action you requested. Review the current result before trying again."

Founder then opened the new Workout Reconciliation Diagnostics screen.

AUTHORITATIVE DEVICE DIAGNOSTICS

Reconciliation log shows:
guard_check_passed
Action: confirm
Version: 1 (Int)

Then:
submit_attempt

Then:
submit_threw
Action: confirm
Outcome: acceptance_uncertain
Underlying at reconciliation layer: PhysiqueOS.ProductionNativeError #7 — server(nil)

This proves the missing/undecodable review-version theory is NOT the cause of this attempt. The guard passed with version 1.

Network diagnostics for the actual command request at the same attempt show:
/api/v1/native/commands
NSURLErrorDomain code -999
"cancelled"
NSLocalizedDescription=cancelled

Nearby device network diagnostics also show:
/api/v1/native/read/home at approximately 7:26 PM:
NSURLErrorDomain -1001
"The request timed out."

An earlier /api/v1/native/commands around 7:25 PM:
NSURLErrorDomain -1005
"The network connection was lost."

INTERPRETATION REQUIREMENT

Do not write another blind retry.

The Build63 instrumentation did its job: the actual confirmation URLSession request is being cancelled.

Diagnose WHY.

Trace task ownership/cancellation propagation end-to-end:
Use Logger session action/control;
SwiftUI Task creation and lifetime;
EvidenceReviewDetailView state changes;
load/refetch behavior;
navigation/view lifecycle;
resolveWorkoutReconciliation;
ProductionEvidenceReviewAPI;
ProductionNativeAPI.perform;
auth/token refresh;
shared URLSession/transport ownership;
any request/session invalidation or replacement;
background/foreground events;
HealthKit background activity;
concurrent refresh tasks;
Task cancellation propagation.

Distinguish with evidence:
A. app-owned Swift concurrency cancellation caused by view/task lifecycle;
B. URLSession cancellation caused by request/session replacement/invalidation;
C. external network transition/connectivity surfacing as -999;
D. another deterministic app-owned cause.

The nearby -1001 and -1005 prove broader network instability existed, but they do NOT by themselves prove the reconciliation -999 was externally caused. Establish causality.

If source/tests prove an app-owned cancellation mechanism, prepare the smallest correct fix with RED/GREEN coverage.

If source evidence cannot distinguish app-owned vs external cancellation, extend the existing diagnostics specifically around:
Task.isCancelled;
task creation/ownership identity;
view lifecycle/disappearance;
cancellation handlers;
URLSession task cancellation context;
network-path/reachability context if available through existing architecture.

Do not ask Founder for another reconciliation attempt until the next diagnostic/fix candidate is materially different and explicitly authorized.

5. RECONCILIATION-REVIEW NOTIFICATIONS

Preserve the feature shipped in Build61+.
Natural-event Founder acceptance remains pending.
Do not regress it.

6. PERFORMANCE PHASE2 — ACCEPTED

Founder accepted Home/performance behavior during Build61 acceptance.
Preserve.

7. TRAINING / CARDIO — ACCEPTED

HealthKit Cardio operational presentation is accepted.
Training Day/detail correctly shows Outdoor Walk.
Logged Today Cardio now passes in Build63.
Preserve.

8. HEALTHKIT CARDIO PHASE1 / V3 — COMPLETE AND LIVE

Cardio operational pipeline and Cardio strategic graduation are complete/live from the separate Server lane.

Production policy now includes:
activity
nutrition
cardio_training

Cardio can prospectively enter normal evidence eligibility/V3 interpretation.
Strength remains separate.
Historical strategic artifacts were not regenerated.
Do not alter Cardio strategic policy in this task.

NEXT WORK

Diagnose and prepare fixes for the three Build63 failed acceptance areas:
A. Strength cancellation root cause or next deterministic observability;
B. Your Journey actual progress-bar rendering path;
C. Completed Visible Abs actual photo/media rendering path.

Logged Today Cardio is PASS and should not be reopened except for regression protection.

Do not cut another Native build yet.
Do not bump build number.
Do not archive/upload.
Do not operate Founder device.
Do not retry Sep24 Strength.
Do not mutate production data.
Use bounded read-only production diagnostics where needed.
Do not deploy Server code unless a separately proven Server defect later receives explicit authorization.

VALIDATION

For any fixes produced:
use deterministic RED/GREEN tests;
include negative-space coverage;
run relevant full Native suites;
Release build;
fresh-context review the combined candidate;
preserve exact ancestry from Build63.

Publish a GH report/pointer containing:
Build63 acceptance matrix;
Strength -999 diagnosis and evidence;
Journey root cause/fix;
Visible Abs photo root cause/fix;
candidate SHA if produced;
tests/review;
remaining evidentiary limits;
recommended next Native candidate;
confirmation no new build/release occurred.

END HANDOFF.
