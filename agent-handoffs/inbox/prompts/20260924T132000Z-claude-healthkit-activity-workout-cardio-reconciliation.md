Task id: claude-healthkit-activity-workout-cardio-reconciliation-20260924

Continue the primary HealthKit lane in the existing persistent “HealthKit Founder Takeover” Claude conversation. Reasoning: high.

Read first:
agent-handoffs/reports/20260924T152000Z-codex-to-claude-healthkit-transition.md
agent-handoffs/reports/20260924T151500Z-healthkit-current-day-priority-final-reviewed.md
agent-handoffs/reports/20260924T160500Z-healthkit-server-deploy-attempt-buildfailure.md
the corrected Server review report published by commit e76fd9abe5defbec8f2ca46b195e918ac3ca1322
the successful Server deployment report published by commit 1678506b8bafba6da4ac870f027ec0439ced0d95
the Build 58 archive report published by commit 90e7fddd3cde9ea0932dd407670ca751e2301688
the Build 58 upload/VALID report published by commit d5bb7a7b9f82ce98d976d507bd66757f69d8d967
and relevant earlier Strength/Activity reports linked by the transition authority.

Current exact authority:
Production Server is f8c28700ae32c3a01b1859a988df5f8177a3dd0b, active deployment b3e48c28-b002-4b5e-a48b-22acccba8093.
Founder installed Native Build 58, release SHA fd7eed02add35bb9016dcd873018cd0c4ef43265, based on reviewed Native 19cbfa10740c0ff5d10e638b57883027349c4b31.
Reverify authority before relying on it.

Founder real-device observations after Build 58:

September 24 normal automatic sync is now materially healthy:
- Log shows Nutrition 496 calories / 38P / 34C / 24F / Apple Health at the observation time.
- Log shows Activity 633 active calories / Apple Health.
- Founder reports Activity/calorie numbers are correct, Nutrition is correct, and both are syncing regularly.
- Recent Activity History shows Sep 24 = 633 active cal / 64 min.
This is strong real-device evidence that current-day Activity/Nutrition is no longer starved behind historical recovery. Do not regress this.

September 24 Apple Health workout sequence:
1. Indoor Walk: Sep 24, 11:04–11:22 AM, 17:47, 1.00 mi, 157 active cal, 186 total cal, avg HR 121 bpm.
2. Traditional Strength Training: Sep 24, 11:22–11:50 AM, 27:58, 206 active cal, 251 total cal, avg HR 120 bpm.
3. Indoor Walk: Sep 24, 11:50 AM–12:06 PM, 16:27, 1.01 mi, 188 active cal, 214 total cal, avg HR 143 bpm.

PhysiqueOS Sep 24 currently presents:
- Log Training: “Strength Training · 94 min”.
- Workout Detail: Traditional Strength Training, Sep 24, summary 11:22 AM–12:56 PM / 1h34m, with Logger exercises (Leg Press Machine sets 160/180/200/220 lb; Walking Lunge 2x20 @ 60 lb).
- Activity Linked Training Context shows Traditional Strength Training 2026-09-24T16:22:44Z–2026-09-24T17:56:51Z · 1h34m with those Logger exercises.
- Activity totals themselves are correct.
The 94-minute Strength window is not the discrete Apple Health Strength workout and appears to span/misattribute adjacent workout/session context. Diagnose rather than patch by assumption.

September 23 newly observed UI inconsistency:
- Apple Fitness for Sep 23 shows Move 782/700 cal, Exercise 107/60 min, Stand 12/6 hr.
- PhysiqueOS Recent Activity History now shows Sep 23 = 783 active cal / 107 min, which effectively agrees with Apple Fitness subject to rounding.
- But opening PhysiqueOS Sep 23 Activity Detail still shows the stale older snapshot: 606 active cal / 102 min, stand 5 hr, workout calories 321, non-workout calories 286, linked workouts 1.
Therefore do NOT assume the previously planned Sep 23 50→51 Activity repair is still required. First prove which canonical/revision/read-model powers each surface. A correct newer Sep 23 value may already exist and only the detail projection/cache/read path may be stale.
- No Sep 23 repair dry-run or apply is authorized in this task.

Product direction:
Bring Cardio into the DIAGNOSTIC/RECONCILIATION scope now because the real Sep 24 case is cardio → strength → cardio and workout attribution cannot be validated correctly while ignoring adjacent cardio. However, Cardio policy activation/canonicalization mutation is NOT authorized yet.

Desired end-state model:
- Whole-day Activity remains the authoritative Apple Health daily aggregate and includes all activity.
- Each Apple Health workout remains a distinct workout identity.
- Sep 24 Indoor Walk #1 remains its own cardio workout.
- Sep 24 Traditional Strength remains its own HealthKit Strength workout and reconciles to the structured Logger session.
- Sep 24 Indoor Walk #2 remains its own cardio workout.
- Activity workout calories should ultimately equal the sum of included linked workout calories; non-workout calories should derive from the whole-day aggregate minus included workout calories, without double counting.
- Cardio workouts must not become Training Logger sessions.
- Strength Logger detail remains authoritative for exercises/sets/reps/loads while Apple Health supplies trustworthy workout telemetry/provenance.
- Strategic eligibility remains separate and off/quarantined unless explicitly authorized later.

TASK: bounded read-only forensic reconciliation + minimal correction/graduation design. No production mutation.

Answer these questions with source/production evidence:

1. Sep 23 Activity history-vs-detail divergence
- Identify the exact Server endpoint/read model/query/projection used by Recent Activity History.
- Identify the exact Server endpoint/read model/query/projection used by Activity Day Detail.
- Read bounded production state for Sep 23 and enumerate all relevant source observations, canonical-day revision/current row/history state needed to explain 783/107 vs 606/102.
- Determine whether a newer correct canonical Sep 23 Activity day already exists.
- Determine whether the stale detail is caused by stale projection, cache, old record selection, revision ordering, API DTO mapping, Native cache, or another proven cause.
- Explicitly conclude whether the planned Sep23 50→51 device repair is STILL REQUIRED, NOT REQUIRED, or UNRESOLVED. Do not apply it.
- If not required, design the smallest read/presentation correction so detail and history resolve the same authoritative canonical day.
- Include stand hours/total calories/move goal semantics: do not fabricate values if the newer source lacks them.

2. Sep 24 current-day acceptance
- Run bounded read-only production audit proving Sep 24 Activity and Nutrition canonical presence/current revision/coverage after Build 58.
- Confirm regular revision advancement if production history supports it.
- Confirm no current-day 409 starvation/loop.
- Confirm Activity/Nutrition scope independence.
- Treat correct zero/nonzero values based on actual observations, not assumptions.
- Record current-day-first acceptance status separately from workout attribution status.

3. Sep 24 workout identity inventory
- Enumerate all Sep 24 raw HealthKit workout observations currently stored, including family/type, UUID/external identity, start/end, duration, active energy, total energy if stored, HR if stored, source/device, canonicalization status, deferred reason, policy eligibility, link status, and strategic eligibility.
- Prove whether both Indoor Walks reached the Server and whether they are raw/deferred due to family_not_in_activation_scope or another state.
- Prove the exact canonical HealthKit Strength workout telemetry stored for Sep 24.
- Compare that Strength workout to the Logger session and current relationship/link candidate.

4. Explain the 94-minute Strength presentation
- Trace the exact origin of 11:22–12:56 / 94 min shown in Log, Workout Detail, and Linked Training Context.
- Determine whether it comes from Logger session timestamps, canonical workout timestamps, relationship projection, merged training context, or another field.
- Compare with the actual Apple Health Strength interval 11:22–11:50.
- Determine whether the current relationship is linked to the correct Strength HKWorkout identity.
- Ensure neither Indoor Walk is accidentally merged into or linked as Strength.
- If Logger end time is absent or extends beyond the HK workout, define the correct presentation ownership: Apple Health telemetry should show the discrete HK workout interval/duration while Logger may separately expose Logger-session context if useful. Do not synthesize a Logger end time.

5. Cardio graduation design using the real Sep 24 case
- Audit current workout family classifier/policy semantics for Indoor Walk/cardio.
- Design the smallest prospective Cardio graduation that makes both Sep24 walks first-class canonical cardio workouts while preserving their distinct UUIDs/telemetry and not creating Training Logger sessions.
- Critical historical/deferred trap: prior out-of-scope workout observations may have been stored as workout_canonicalization_deferred / family_not_in_activation_scope and documented as never reconsidered by a later policy. Determine the exact state of Sep24 walks and design an explicit safe reconciliation path if they are already deferred. Do not assume enabling Cardio will retroactively reconsider them.
- Bound any reconciliation to the known Founder case/dates/identities needed for acceptance; no broad historical sweep.
- Cardio auto-confirm/link semantics should be explicit. There is normally no structured Logger session for cardio, so do not force the Strength relationship model onto cardio.
- Keep Cardio strategically quarantined/off initially.
- Preserve whole-day Activity totals; canonicalizing cardio must not create duplicate active calories in the daily aggregate.

6. Unified correction sequence
Return a minimal ordered plan that reconciles:
A. Sep23 Activity detail consistency;
B. Sep24 Strength telemetry/presentation;
C. Sep24 two cardio workouts;
D. Activity workout/non-workout attribution;
without disturbing correct current-day Activity/Nutrition ingestion.

Classify each required change as:
- Server code only;
- Native presentation only;
- policy activation;
- bounded data reconciliation;
- no change needed.

Separate authorization gates. Do not bundle policy/data writes into code fixes.

Important safety/authority:
- Production reads must use the established approved read-only path and transaction guarantees. No production writes.
- Do not use screenshots as authoritative database facts; they are Founder observations to reconcile against production.
- Do not modify current production, policy, canonical records, relationships, strategic eligibility, Sep23 data, or Cardio state.
- Do not archive/upload another Native build.
- Do not regenerate briefings or touch Midweek.
- Do not change correct Activity/Nutrition current-day behavior.
- Do not infer workout calorie attribution from whole-day arithmetic when exact workout telemetry exists.

Testing/design expectations:
If a code defect is proven, identify exact files/surfaces and propose focused regressions using production-shaped fixtures, including:
- history/detail same-canonical-revision parity;
- adjacent cardio-strength-cardio identity isolation;
- Strength presentation uses HK telemetry for HK workout duration;
- Logger exercises remain attached without overwriting HK telemetry;
- Cardio canonicalization does not create Logger sessions;
- Activity whole-day total remains invariant when workout attribution changes;
- workout calories/non-workout calories recompute without double counting;
- deferred cardio reconciliation is bounded/idempotent.

GitHub publication:
Publish a timestamped forensic report to agent-handoffs/reports/ on main before calling the audit complete.
Update primary latest.json/latest.md because Claude owns the HealthKit lane.
Include exact production authority, read-only audit proof, conclusions, minimal correction plan, authorization gates, and exact next recommended action.
If publication fails, say REPORT NOT PUBLISHED.

Claude phone-host durability:
Remain in the existing persistent HealthKit Founder Takeover conversation. The proven persistent mechanism is Claude Code --bg plus --remote-control, hosted under the Claude daemon/PTY infrastructure and independent of transient Codex/terminal lifetime. Do not create a new conversation or move engineering work to the old Build41 workspace.

Immediate next step:
Run the bounded read-only production/source audit above. Do not mutate anything. Publish findings and stop for Founder direction before implementation, policy activation, or reconciliation.

Flags:
AUTHORITY_REVERIFIED
SEP24_CURRENT_DAY_ACTIVITY_ACCEPTED
SEP24_CURRENT_DAY_NUTRITION_ACCEPTED
SEP24_REVISION_ADVANCEMENT_PROVEN
SEP23_HISTORY_DETAIL_DIVERGENCE_PROVEN
SEP23_CURRENT_CANONICAL_REVISION
SEP23_REPAIR_STILL_REQUIRED
SEP23_REPAIR_NOT_REQUIRED
SEP24_WORKOUT_INVENTORY_COMPLETE
SEP24_WALK1_FOUND
SEP24_STRENGTH_FOUND
SEP24_WALK2_FOUND
SEP24_STRENGTH_HK_INTERVAL_PROVEN
SEP24_94MIN_ORIGIN_PROVEN
STRENGTH_LINK_IDENTITY_CORRECT
CARDIO_DEFERRED_STATE_PROVEN
CARDIO_GRADUATION_DESIGN_READY
ACTIVITY_DOUBLE_COUNT_GUARD_DEFINED
UNIFIED_CORRECTION_PLAN_READY
PRODUCTION_MUTATED
POLICY_MUTATED
CARDIO_ACTIVATED
SEP23_REPAIRED
GH_REPORT_PUBLISHED
