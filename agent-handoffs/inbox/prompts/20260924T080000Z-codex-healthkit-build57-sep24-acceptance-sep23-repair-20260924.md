Task id: codex-healthkit-build57-sep24-acceptance-sep23-repair-20260924

Continue the primary HealthKit lane after real-device Build 57 installation.

Use the SAME HealthKit Codex A chat. Reasoning: High.

Read first:
agent-handoffs/reports/20260924T124636Z-healthkit-native57-testflight-valid.md
agent-handoffs/reports/20260924T050633Z-healthkit-revision-recovery-server-deployed.md
agent-handoffs/reports/20260924T012249Z-build55-activity-sync-409-loop-diagnostic.md
and the prior Build 57 task/report chain.

Founder real-device observations after installing Build 57 on September 24 Texas local time:
1. Sep 23 Traditional Strength Training detail now correctly shows one logical Logger workout plus attached Apple Health telemetry:
   source/device: Dustin's Apple Watch Ultra
   status: Confirmed with Workout Logger
   8:47 AM-9:57 AM
   1h 9m
   321 active cal
   100 bpm avg HR
   Logger exercises/sets/reps/load remain visible and unchanged.
2. Sep 23 Activity detail now shows:
   606 active cal
   102 exercise min
   5 stand hr
   1 linked workout
   321 workout cal
   286 non-workout active cal
   Total Calories Pending
   Move Goal Pending
This proves the Strength relationship-to-Activity workout-energy projection is now visible and working. The Sep 23 whole-day Activity total remains the known stale/incomplete 606 value.
3. Cardio is NOT yet reconciled/graduated. Do not start Cardio in this task. Cardio follows only after daily revision reliability and Sep 23 Activity reconciliation are accepted.

Critical calendar boundary:
It is September 24 in the Founder's current Texas local time.
Sep 23 is the historical poisoned/incomplete day.
Sep 24 is the clean new-day namespace.
Never conflate them and avoid ambiguous yesterday/today wording in reports.

PART 1 — Sep 24 clean-day acceptance, zero-write/read-only first

Reverify:
Production Server expected 63395579ed70611be8a57f032133a43a3bc67800 and deployment 117d8a2f-8cc1-4ef1-9247-1029c875e401 unless current authority proves otherwise.
Real-device Native Build 57 source 6cca05813ce26e3ddd8ff2dead9867bb4e7e3bb9 is installed.
No policy/strategic/Cardio change.

Run bounded read-only audits of automatic HealthKit Activity/Nutrition state for Sep 24 and the new Founder diagnostics. Determine:
- whether Sep 24 Activity has been automatically ingested after Build 57 install/open;
- sourceRevision/history progression and current aggregate;
- whether automatic-scope diagnostics show healthy lastAttempt/lastSuccess/lastError/abandonedBatch/revision-floor/durable-ack state;
- whether any HEALTHKIT_OBSERVATION_IDENTITY_COLLISION occurred on Sep 24;
- Nutrition Sep 24 state if any Apple Health nutrition data exists;
- whether Activity and Nutrition scopes remain independent;
- no force-quit/canary/manual sync was required.

Do not manufacture multiple advances. If only one Sep 24 revision exists so far, record that as the baseline and define a normal-use second observation checkpoint after additional Apple Health data changes. Founder should not need special diagnostic controls.

Publish the read-only baseline checkpoint to GitHub main before representing this chunk complete.

PART 2 — Sep 23 bounded repair design/dry-run only

After confirming fixed Build 57 + Server authority, design the smallest bounded repair for Sep 23 Activity only.

Important current facts:
- Sep 23 Server Activity remains stale at 606 active cal from the old revision loop unless fresh audit proves otherwise.
- Sep 23 Strength HealthKit workout contributes 321 active cal and is confirmed one-to-one with the Logger session.
- Do NOT infer the correct Sep 23 whole-day total from 321 or from the stale 606.
- Do NOT copy Sep 24 values backward.
- Do NOT fabricate cardio calories or whole-day totals.
- The repair must source the actual Sep 23 daily aggregate from Apple Health on the real device.
- The repair must use the corrected authoritative revision/rebase semantics and a fresh valid revision.
- Scope exactly Sep 23 Activity; no historical sweep and no Sep 24 mutation.
- Preserve quarantine/strategic boundaries.
- Verify no duplicate canonical day and monotonic history/revision after apply.
- Verify strategic digests/briefings/Confidence remain unchanged.

Determine whether Sep 23 Nutrition actually needs repair, separately and read-only. Do not mutate Nutrition merely for symmetry.

Prepare a precise repair dry-run/device action plan with current Server facts, expected source revision, expected canonical mutation, invariants, and rollback/refusal behavior.

STOP and request separate Founder authorization before ANY device-triggered Sep 23 repair upload or Server/data mutation.

PART 3 — Strength acceptance record

Record the Founder real-device acceptance:
- Workout Detail HealthKit provenance: PASS
- Workout Detail HealthKit telemetry: PASS
- Logger detail unchanged: PASS based on visible expected session content plus existing invariant audit
- Activity linked workout count: PASS
- Activity workout calories = 321: PASS
- Activity non-workout derivation visible: PASS, but whole-day denominator remains stale pending Sep 23 repair
- no duplicate Training workout: PASS
- Log provenance should be checked/read-only if possible; if Founder device observation is still needed, request only that screenshot/check after the audit.
Do not claim full Sep 23 Activity correctness until whole-day repair is completed.

PART 4 — Sep 24 second-advance acceptance

If the initial Sep 24 baseline exists, define the next natural checkpoint:
- Founder continues normal day/use;
- after Apple Health Activity changes materially, normal app foreground or Log pull-to-refresh should create a higher Sep 24 revision;
- no force quit;
- no canary/manual test-day;
- verify second revision > first, no 409 loop, durable ack advanced.
Nutrition can be validated similarly when new Apple Health nutrition data changes.

Do not block the Sep 23 repair dry-run design on waiting hours for a second Sep 24 advance if the first baseline is healthy. Keep the two workstreams logically separate.

Cardio boundary:
Do not activate/reconcile Cardio yet.
Once Sep 24 revision recovery is proven and Sep 23 Activity is repaired/accepted, publish READY_FOR_CARDIO recommendation. Cardio should then be its own prospective graduation task, including safe treatment of the existing Sep 23 cardio workouts so they are not stranded/double-counted.

Standing GitHub publication rule:
A substantive chunk is NOT complete until a timestamped report is committed to GitHub main.
Publish after the Sep 24 baseline audit, after the Sep 23 repair dry-run design, and after any later apply/acceptance.
Primary HealthKit lane updates latest.json/latest.md.
Every chat completion must give report commit SHA + path.
If publication fails, say REPORT NOT PUBLISHED and do not claim completion.

Standing simulator/disk rule:
Use/retain only iPhone 17 Pro simulator. No other simulator devices. Targeted cleanup only.

Immediate next step:
Run the bounded Sep 24 read-only automatic-sync baseline audit and Strength acceptance recording. Then design/dry-run the Sep 23 Activity repair and publish both. Stop for Founder authorization before any Sep 23 repair action.

Flags:
AUTHORITY_REVERIFIED
BUILD57_REAL_DEVICE_INSTALLED
SEP24_ACTIVITY_BASELINE_PRESENT
SEP24_ACTIVITY_REVISION
SEP24_ACTIVITY_LAST_SUCCESS_HEALTHY
SEP24_ACTIVITY_409_FREE
SEP24_NUTRITION_BASELINE_PRESENT
SEP24_SCOPE_INDEPENDENCE_HEALTHY
SEP23_ACTIVITY_STILL_STALE
SEP23_ACTIVITY_CURRENT_REVISION
SEP23_REPAIR_PLAN_READY
SEP23_REPAIR_DRYRUN_READY
SEP23_REPAIR_AUTHORIZED
SEP23_ACTIVITY_REPAIRED
SEP23_NUTRITION_REPAIR_NEEDED
STRENGTH_DETAIL_PROVENANCE_PASS
STRENGTH_DETAIL_TELEMETRY_PASS
STRENGTH_ACTIVITY_321_PASS
STRENGTH_LOG_PROVENANCE_PASS
SEP24_SECOND_ADVANCE_PASS
READY_FOR_CARDIO
GH_REPORT_PUBLISHED
