Task id: healthkit-sep22-workout-canary-activation-20260923

Activate and execute the already-GREEN bounded Sep 22 HealthKit Workout canary, with Founder authorization and a single Founder device sync, then perform the post-sync audit.

Continue in the current Claude HealthKit chat. Sonnet High.

Notification requirement:
Notify/question the Founder in Claude chat whenever explicit authorization is needed, when the physical-device sync action is ready, and when substantive work completes. If Founder authorization is the only blocker, ask directly, wait for the response, then continue. Do not terminate the task merely to request permission.

Reverify current authority. Expected hints:
Production Server 4b362591cb5f80c599f8f45eb7f392de7c44a36f
deployment d4754b09-ff14-4c1f-ab9b-8d4ea5814d85
Native Build 53 SHA 1c57556f

Prior readiness report:
agent-handoffs/reports/20260923T040537Z-healthkit-formatting-deployed-workout-readiness-green.md
Readiness GREEN.
Workout policy OFF.
0 Workout observations/canonical workouts/links/claims.
1 existing Sep 22 Logger strength session.
No ambiguous auto-links.
Workout strategic/V3 leakage 0.
Activation MUST occur before Founder taps Workout Sync.

Scope:
Exact Founder-local date 2026-09-22 only.
Workout policy kind only.
Quarantined canary.
No historical backfill.
No open-ended Workout activation.
No auto-confirm of ambiguous matching.
No Workout strategic evidence/V3/Confidence/briefing eligibility.
Do not alter Activity/Nutrition policy or data.
Do not touch the older Activity Founder Canary toggle.

Part 1 — preactivation

Reverify readiness has not drifted since the GREEN report.
Run the established dry-run for the exact-date Workout canary.
Run bounded zero-write pre-audit.
Confirm existing Logger strength session integrity baseline.
Confirm Activity/Nutrition canonical state/digests baseline sufficient to prove unchanged afterward.
Confirm Workout observations/canonical/link/claim counts remain zero before activation.

Part 2 — authorization and activation

Before the production policy write, ask the Founder directly in Claude chat for explicit authorization to activate the Sep 22 Workout canary with these exact semantics.

After Founder approves:
activate the exact-date Workout policy for 2026-09-22 only using the established guarded path.
Verify active policy exactly matches intended values.
Run post-activation zero-write/invariant audit.
At this point no Workout observation should yet have been uploaded.

Part 3 — Founder physical-device checkpoint

Only after policy activation is verified, notify the Founder and instruct exactly:
Open Founder Production on Build 53.
Do NOT turn on the older "Enable this canary" Activity historical-validation toggle.
Scroll to the Workout canary section.
Confirm Workout day is 2026-09-22.
Tap "Sync workouts for this day" exactly once.
Do not press Activity/Nutrition diagnostic controls.
Send Claude the resulting Workout canary status/acknowledgement or screenshot.

Wait for Founder response before continuing.

Part 4 — immediate post-sync audit

After Founder confirms the single tap:
inspect the Workout ingestion outcome without asking for a second sync unless diagnosis proves it is safe and necessary.

Audit:
raw Workout observation count and workout types;
canonical Workout records/candidates;
Strength Training observation corresponding to the existing Sep 22 Logger session;
matching/link-candidate result and match basis;
ambiguity state;
Outdoor Walk/cardio separation;
multiple same-day workout handling;
idempotency/duplicate state;
Logger strength detail integrity against baseline;
duplicate detailed Training session count;
Workout claims/links;
Workout strategic evidence/V3/Confidence/briefing eligibility remains OFF;
Activity/Nutrition canonical state/digests unchanged;
no unexpected briefing regeneration.

Strength acceptance:
Apple Health Strength Training is safely ingested/canonicalized.
It reconciles to the correct existing Logger strength session according to the designed matching semantics.
Logger remains authoritative for exercises, sets, reps, load, variants, supersets, notes and detailed structure.
No duplicate detailed Training session.
No unsafe ambiguous auto-link.

Outdoor Walk acceptance:
remains distinct from Strength;
does not attach to the Strength Logger session;
document whether it becomes an unmatched canonical Workout/candidate and what that implies for future cardio work.
Do not graduate cardio here.

Important known limitation:
Build 53 emits no sourceRevision for workouts. A re-query with changed aggregates for the same HKWorkout UUID can fail closed with 409 rather than update. Do not treat this as blocking the first canary unless encountered. If encountered, preserve evidence and report it; do not weaken purpose/identity protections.

If defect found:
preserve state;
diagnose before requesting another sync;
do not auto-activate open-ended Workout ingestion;
do not silently mutate Logger data.

If canary passes:
mark Strength canary accepted and specify the next bounded step toward cardio canary / Workout graduation. Do not execute graduation in this task.

No Native build should be required merely to run this canary. If a real code defect is discovered, report the smallest fix and whether the existing pending formatting-only Native work is irrelevant (formatting was Server-side and already deployed).

Publish final handoff and notify Founder.

Flags:
WORKOUT_PREACTIVATION_GREEN
FOUNDER_AUTHORIZED_WORKOUT_CANARY
SEP22_WORKOUT_CANARY_ACTIVATED
WORKOUT_POLICY_EXACT_DATE_ONLY
FOUNDER_WORKOUT_SYNC_COMPLETED
WORKOUT_OBSERVATIONS_RECEIVED
STRENGTH_WORKOUT_OBSERVATION_RECEIVED
STRENGTH_CANONICAL_WORKOUT_CREATED
STRENGTH_MATCHED_CORRECT_LOGGER_SESSION
AMBIGUOUS_MATCH_AUTO_LINK_PREVENTED
OUTDOOR_WALK_OBSERVATION_RECEIVED
OUTDOOR_WALK_REMAINS_SEPARATE
DUPLICATE_TRAINING_SESSION_PRESENT
LOGGER_DETAIL_MUTATED
WORKOUT_V3_ELIGIBILITY_ENABLED
ACTIVITY_NUTRITION_UNCHANGED
STRENGTH_CANARY_ACCEPTED
READY_FOR_CARDIO_CANARY
SECOND_SYNC_REQUIRED
CODE_FIX_REQUIRED
