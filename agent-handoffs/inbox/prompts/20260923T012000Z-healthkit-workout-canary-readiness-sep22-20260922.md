Task id: healthkit-workout-canary-readiness-sep22-20260922

Perform a strictly read-only readiness audit for the first real HealthKit Workout canary using Founder-local date 2026-09-22.

This task must NOT interfere with the separately active Activity/Nutrition Build 52 investigation. Use a separate existing Mac-originated Claude chat/session. Do not use or modify that task's worktree. Sonnet High.

Audit only. Do not activate Workout policy, upload/sync workouts, link anything, mutate production, deploy, build, change code, or alter Activity/Nutrition state.

Context

Founder completed a real strength workout today in PhysiqueOS Workout Logger and confirmed the workout. The normal Log currently shows Training: Strength Training · Outdoor Walk.

Apple Health also has workout data for today. Build 52 contains the previously reviewed dormant Workout canary capability. Workout activation has remained OFF throughout Activity/Nutrition work.

Goal

Determine whether the system is safely ready to activate a one-day Workout canary for Sep 22 and exactly what should happen when Founder later taps "Sync workouts for this day."

Reverify current authority from live sources. Expected hints only:
Server 924d5e556ba418ceb64de828d4c6a7c06d99f769
deployment c2442650-a9a0-499e-bc42-59b81c0c8bae
Native Build 52 4894e162b42f018745a12506ceacfe243a5fbb50
Do not trust hints without verification.

Read-only audit

1. Verify Workout activation/policy is currently OFF and no Sep 22 Workout canary policy is active.
2. Verify Build 52 still contains the reviewed Workout canary upload capability and that subsequent Activity/Nutrition fixes did not remove/change its intended contract.
3. Inspect the Server Workout HealthKit intake/canonicalization/matching/link-candidate architecture and current dormant policy semantics.
4. Verify separation invariant:
HealthKit Workout observation -> canonical Workout record/candidate -> potential linkage to existing PhysiqueOS Workout Logger session -> strategic evidence eligibility separately.
HealthKit ingestion must not itself overwrite Logger exercises/sets/load or silently decide strategic meaning.
5. Read-only inspect today's existing PhysiqueOS Training/Workout Logger canonical state sufficiently to identify the completed strength session and any existing cardio/walk records, without exposing Founder-sensitive payloads in GitHub handoff.
6. Determine what Apple Health workout types Build 52 would upload for Sep 22 if canary activated. Do not query private HealthKit from the Mac; infer only from contract/code and already-canonical/non-sensitive production metadata. Founder device will perform actual upload later.
7. Confirm expected handling of:
   - Apple Health Strength Training corresponding to today's completed Logger session;
   - Outdoor Walk/cardio workout(s) on the same date;
   - multiple workouts in one day;
   - time overlap/tolerance;
   - duplicate/retry/idempotency;
   - an Apple workout with no Logger counterpart;
   - a Logger session with no Apple counterpart.
8. Verify that first canary behavior is candidate/matching-oriented and does NOT:
   - create duplicate detailed Training sessions;
   - replace exercises/sets/reps/load;
   - auto-link an ambiguous match without the designed confirmation/reconciliation semantics;
   - activate V3/Confidence/briefing eligibility merely because HealthKit supplied a workout;
   - alter Activity/Nutrition policies.
9. Verify identity namespace/purpose semantics for Workout cannot collide with the Activity/Nutrition automatic/canary identities recently fixed. Specifically inspect the Workout predicateVersion/namespace registration added as defense-in-depth in the Build 52 lineage.
10. Verify whether the existing Build 52 Founder Production "Sync workouts for this day" control is enabled only after server activation and what exact acknowledgement/status the Founder should expect.
11. Determine whether a one-day exact Sep 22 canary is still the safest first activation or whether architecture now supports a better bounded form. Do not activate anything.
12. Produce exact post-upload acceptance checks for the coordinating agent:
   - number/types of raw Workout observations;
   - canonical Workout records/candidates;
   - strength-to-Logger match candidate;
   - ambiguity/confidence/match basis;
   - no duplicate Training session;
   - Logger exercises/sets/load byte/logically unchanged;
   - walk/cardio remains separate and does not attach to strength;
   - retry idempotency;
   - Workout strategic evidence/V3 remains OFF unless separately authorized;
   - Activity/Nutrition unchanged.

Important product intent

The strength workout is the first priority because PhysiqueOS already owns detailed strength structure through Workout Logger. Apple Health Workout should provide trustworthy source observation/session metadata and enable reconciliation/linking, not become a competing detailed workout log.

Cardio is expected to be simpler and is a fast follow after strength canary acceptance. Do not implement or activate cardio here.

Output

Return GREEN / YELLOW / RED readiness.

GREEN means it is safe for a separate authorized activation step to enable Workout canary for Sep 22 and then ask Founder to tap "Sync workouts for this day" exactly once.

If GREEN, specify the exact activation policy values and the exact Founder action that should follow, but DO NOT execute them.

If YELLOW/RED, identify the precise blocker and smallest correction needed.

Publish a sanitized completion handoff to GitHub. Do not overwrite or disrupt the currently claimed Activity/Nutrition inbox task. If the single inbox protocol cannot safely publish this parallel task without displacing the active task, publish the report under agent-handoffs/reports and tell the Founder/ChatGPT the report path; do not mutate inbox/latest.json.

Flags:
WORKOUT_ACTIVATION_CURRENTLY_OFF
BUILD52_WORKOUT_CANARY_CAPABILITY_PRESENT
WORKOUT_NAMESPACE_SAFE
SEP22_LOGGER_STRENGTH_SESSION_PRESENT
MULTIPLE_WORKOUT_DAY_SUPPORTED
STRENGTH_MATCHING_SEMANTICS_SAFE
AMBIGUOUS_MATCH_AUTO_LINK_PREVENTED
LOGGER_DETAIL_OVERWRITE_PREVENTED
DUPLICATE_TRAINING_SESSION_PREVENTED
WORKOUT_V3_ELIGIBILITY_OFF
ACTIVITY_NUTRITION_UNCHANGED
READY_FOR_SEP22_WORKOUT_CANARY
