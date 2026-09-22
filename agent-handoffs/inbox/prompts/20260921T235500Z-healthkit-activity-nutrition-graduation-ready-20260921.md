Task id: healthkit-activity-nutrition-graduation-ready-20260921

Goal

Prepare the complete production graduation path for HealthKit Activity + Nutrition NOW, while the Sep 21 proving day continues, so that once the completed-day audit is GREEN there is no remaining backend/UI architecture work before the Founder can turn HealthKit fully live.

Build, test, review and, where safe, deploy dormant plumbing behind explicit OFF policy gates. Prepare Native UI integration in the next pending Native candidate as appropriate. Do NOT graduate/enable HealthKit Activity or Nutrition yet. The actual graduation switch waits for Founder approval after completed-day acceptance.

Claude chat continuity

Continue in the existing Claude Remote Control chat named "HealthKit Phase 2".
Inbox metadata uses chat_preference=continue_current_chat.

Product principle

Once HealthKit-derived Activity/Nutrition canonical facts are proven correct, they should become ordinary PhysiqueOS data.

V3 should reason about the canonical facts, not treat HealthKit as a separate strategic universe.

Source/provenance matters only for legitimate measurement semantics:
- Apple Watch active expenditure remains wearable-estimated.
- HealthKit Nutrition daily totals remain daily-total assertions with their source/reliability.
- Changing transport/source from screenshot/OCR/manual to HealthKit must not invent a different strategic fact when canonical values are identical.

Required regression invariant:
Given identical canonical Activity/Nutrition values and dates, replacing the transport/source representation with HealthKit should not materially change V3 interpretation except where source reliability/measurement uncertainty legitimately differs.

Authority

Reverify first.

Expected production Server:
3e5e6758e19b0b06885eb356a8a06a2b631251fb
deployment 0438721d-e4c1-44f9-9555-0d9ef4b91eec
schema 000014

Expected installed proving Native:
2bfbf54ad105a3a18189e811f06afc421741a7da
Build 49

Pending reviewed Workout Native candidate:
d96db0d0
Build 50 is not yet archived/uploaded and is waiting on Activity/Nutrition acceptance.

Sep 21 current proving state:
- one canonical HealthKit Activity day
- one canonical HealthKit Nutrition day
- first-sync audit GREEN
- Activity/Nutrition canonicalization ON only for exact test date
- strategic eligibility OFF
- normal Log/Evidence projections OFF
- completed-day audit still pending
Do not alter or revise those canonical records during this task.

Desired graduation state after future Founder switch

HealthKit canonical Activity/Nutrition should:
1. appear in normal PhysiqueOS read models and UI;
2. participate in ordinary Evidence eligibility;
3. feed V3/Confidence/briefings exactly as the same canonical facts from other trusted sources would;
4. retain Apple Health provenance and legitimate wearable/source uncertainty;
5. not duplicate/stack with another representation of the same underlying measurement;
6. not regenerate historical published briefings merely because graduation occurs.

The graduation switch must be explicit and reversible prospectively.

Current state vs future state

Current:
canonicalization = ON for bounded test day
normal projections = OFF
evidence eligibility = OFF
V3 = OFF

Prepare:
canonicalization = ON
normal projections = policy-controlled
evidence eligibility = policy-controlled
V3 = normal canonical eligibility when enabled

Do not set those prepared policy controls ON in production during this task.

Part A — audit current ordinary projections

Map the existing normal application paths for Activity and Nutrition:
- Home/Log summary
- Activity detail/history
- Nutrition detail/history
- Evidence Hub Activity/Nutrition
- briefing/V3 evidence adapters
- provenance/source presentation
- any completeness/status labels

Identify exactly why healthKitCanonicalDays are currently invisible and what the smallest adapter/projection change is.

Prefer projecting the accepted canonical day into existing read models over creating parallel HealthKit-specific screens/cards.

Part B — Native UI integration

Founder does NOT want a redesign.

Log page:
Keep existing layout/density.
The user should be able to answer:
- has Activity been logged today and roughly how much?
- has Nutrition been logged today and roughly how much?

Use the existing rows/cards.
Activity: show the normal Activity summary, including active calories where that is already the product metric.
Nutrition: show normal calories and macros only to the extent the existing compact row can display them without adding a dense new card.
A subtle existing source/provenance treatment may say Apple Health.

Do not create a new HealthKit dashboard/card/banner.

Other surfaces:
Reuse existing source/provenance UI.
Where source is already displayed, HealthKit-derived canonical records should display Apple Health (or the established product label) as source.

Nutrition:
A HealthKit Nutrition day with valid calories/protein/carbs/fat and zero meals must NOT render as incomplete/broken merely because meals are absent.
Do not fabricate meal rows.
If meal detail from MFP/manual exists independently, preserve it as detail according to canonical reconciliation rules without letting partial meal detail override authoritative daily totals.

Evidence Hub:
Once future graduation is ON, Activity/Nutrition should appear through the normal domain evidence/read-model pattern, not a HealthKit-specific evidence category.

If Native changes are needed, fold them into the pending next Native candidate based on current Build 49 / reviewed Build 50 lineage carefully. Audit ancestry first. Do not overwrite/recreate d96db0d0 blindly.

Do not archive/upload a new build during this task unless Founder explicitly authorizes after seeing scope. Prepare reviewed candidate and report whether the existing Build 50 candidate should be superseded/extended.

Part C — backend projection and source reconciliation

Prepare policy-gated projection from canonical HealthKit days into ordinary Activity/Nutrition reads.

Requirements:
- singleton logical day per domain/date in normal projections;
- deterministic source reconciliation;
- no duplicate display/evidence if HealthKit and screenshot/manual represent the same underlying measurement;
- source precedence must be semantic, not last-write-wins;
- provenance retained;
- observed/effective date owns the day, not ingestion time.

Activity:
HealthKit Apple Watch active energy is the same underlying wearable measurement whether previously transported by screenshot/OCR or direct HealthKit.
Do not stack the two.
Do not add workout calories on top of Move/active-energy totals.

Nutrition:
Daily totals are authority.
HealthKit/device daily totals can be canonical with zero meals.
Trustworthy asserted/device full-day totals outrank meal-derived/partial subtotals according to the established Nutrition authority contract.
Conflicts are surfaced/reconciled, not silently overwritten.

Part D — normal Evidence/V3 eligibility

Prepare a single ordinary canonical evidence path.

Do NOT create healthkitEvidence as a strategic parallel universe.

When future graduation policy is ON:
- eligible canonical Activity produces the same Activity evidence capability expected by V3;
- eligible canonical Nutrition produces the same Nutrition evidence capability expected by V3;
- Energy pairing uses those canonical values;
- source/reliability metadata travels with the observation;
- Apple Watch expenditure retains wearable-estimate semantics;
- Nutrition daily-total source reliability is represented;
- HealthKit source alone neither boosts nor suppresses strategic importance.

Required source-invariance tests:
1. Same Activity value/date from Apple Watch screenshot representation vs direct HealthKit representation -> same factual V3 Activity observation/value/direction, with only transport/reliability metadata differences.
2. Same Nutrition daily totals/date from trustworthy full-day source vs HealthKit daily aggregate -> same factual Nutrition values/adherence, with only source/reliability metadata differences.
3. Same canonical Energy inputs -> same Energy fact/balance; source metadata may alter uncertainty wording only where legitimate.
4. No duplicate V3 observation when two representations describe the same underlying day/measurement.

Confidence:
Do not mechanically change Confidence merely because source=HealthKit.
Any confidence consequence must follow the existing V3 evidence-quality model.

Briefings:
Future recurring briefings naturally consume graduated canonical data.
Do not regenerate historical briefings on graduation.
Late evidence continues existing reconciliation policy.

Part E — explicit graduation policy

Extend/refine the activation policy so these are independently controlled:
- canonicalization
- normal_projection_enabled
- evidence_eligibility_enabled

V3 follows ordinary evidence eligibility; avoid a redundant source-specific V3 switch if possible.

For the future Founder graduation action, require dry run showing:
- exact dates/domains affected
- normal projection changes
- Evidence additions/reconciliation
- V3 eligible observation changes
- duplicate suppression
- no historical briefing regeneration
- no Training/Workout changes

Rollback/deactivation:
Turning projection/evidence eligibility back OFF must stop future use without deleting canonical history.

Do not enable these flags in production now.

Part F — Sep 21 graduation simulation

Using a read-only export/current stored Sep 21 canonical HealthKit Activity/Nutrition records, simulate what WOULD happen if graduation were enabled.

Do not mutate production.

Report predicted:
- Log Activity row
- Log Nutrition row
- Activity/Nutrition detail/history source
- Evidence Hub records
- V3 factual observations
- Energy inputs
- Confidence input changes
- next future briefing eligibility
- duplicate/reconciliation behavior with any other Sep 21 source

This simulation is not acceptance of the incomplete day. It proves the plumbing is ready.

Part G — tests

Server:
- projection OFF = current behavior unchanged
- projection ON = ordinary Activity/Nutrition read models populated
- eligibility OFF independent of projection ON
- eligibility ON = ordinary Evidence/V3 path
- source-invariance tests described above
- duplicate suppression/reconciliation
- Activity screenshot vs HealthKit same underlying wearable measurement
- Nutrition daily-total authority with zero meals
- no workout-calorie double count
- date/timezone
- policy rollback
- no historical briefing regeneration
- V3 golden/regression
- current Workout dormant foundation regression
- current Sep 21 proving state unaffected by deploy

Native if changed:
- existing Log layout retained
- HealthKit Activity appears in existing Activity row
- HealthKit Nutrition appears in existing Nutrition row
- source label uses existing provenance component
- zero-meal Nutrition daily totals render validly
- Evidence/detail surfaces decode/display normal projected records
- V2/historical records unchanged
- HealthKit/Workout regressions
- full Native suite/build

Part H — review/deploy

Independent fresh-context review exact Server and Native candidates.

Challenge:
- source invariance
- no duplicate evidence
- canonical daily-total semantics
- projection/eligibility independence
- no hidden V3 HealthKit special case
- UI density/no redesign
- zero-meal Nutrition validity
- Workout/Training unaffected
- current test-day state unaffected
- rollback
- historical briefing immutability

Server:
If dormant plumbing can be deployed with projection/eligibility OFF and all gates/review clear, deployment is Founder-authorized.
Require zero-write pre/post audit.
No schema migration unless surfaced before deploy.

Native:
Do not upload/archive automatically. Produce reviewed candidate and recommend whether to merge into pending Build 50 release after A+N acceptance.

Production postdeploy if Server changes:
- exact SHA
- live/ready
- zero-write audit
- Sep 21 canonical Activity/Nutrition byte/semantically unchanged
- projection remains OFF
- evidence eligibility remains OFF
- V3 remains OFF for HealthKit
- Workout activation OFF
- Training/briefings unchanged

Part I — graduation runbook

Produce an exact runbook for the future GREEN completed-day moment:

1. Verify completed Sep 21 audit GREEN.
2. Verify prepared Server/Native authority.
3. If Native build needed, archive/upload/install prepared next build.
4. Run graduation dry run.
5. Founder authorizes policy transition.
6. Enable normal projections + evidence eligibility for accepted HealthKit Activity/Nutrition prospectively/as explicitly scoped.
7. Verify Log/Evidence/source labels.
8. Verify V3 sees canonical facts once, not duplicates.
9. Verify no historical briefing regeneration.
10. Continue normal operation.

Do not execute steps 4-10 in this task.

Parallel performance work

Do not perform core-page performance optimization in this HealthKit task. That will be a separate Claude thread/task to avoid mixing domains.

Backlog preserved:
- completed-day Sep 21 sync/audit
- Workout Build 50/canary after A+N acceptance
- background delivery/durable revision floor
- core-page cold-start performance audit
- inbox publisher schema hardening
- Workout Logger draft survival
- Photo tap-to-expand production mismatch
- Coaching Updates delivery-time UI cleanup

GitHub protocol

Claim/complete through established inbox protocol.
Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
- current projection map
- Server changes/candidate/deploy
- Native changes/candidate
- UI delta
- source-invariance proof
- Sep 21 graduation simulation
- tests/review
- policy remains OFF
- exact future graduation runbook
- whether next Native Build 50 candidate now includes both Workout canary + A/N graduation UI

Explicit flags:
NORMAL_ACTIVITY_PROJECTION_READY
NORMAL_NUTRITION_PROJECTION_READY
LOG_UI_HEALTHKIT_READY
EVIDENCE_HUB_HEALTHKIT_READY
NUTRITION_ZERO_MEALS_VALID_UI
SOURCE_PROVENANCE_UI_READY
ACTIVITY_SOURCE_INVARIANCE_PROVEN
NUTRITION_SOURCE_INVARIANCE_PROVEN
ENERGY_SOURCE_INVARIANCE_PROVEN
DUPLICATE_STRATEGIC_OBSERVATION_PREVENTED
PROJECTION_POLICY_INDEPENDENT_OF_ELIGIBILITY
EVIDENCE_ELIGIBILITY_POLICY_READY
HISTORICAL_BRIEFING_REGEN_DISABLED
WORKOUT_FOUNDATION_UNCHANGED
SEP21_TESTDAY_UNCHANGED
SERVER_DORMANT_GRADUATION_PLUMBING_DEPLOYED
NATIVE_GRADUATION_CANDIDATE_READY
GRADUATION_SWITCH_ENABLED
READY_TO_GRADUATE_AFTER_COMPLETED_DAY_GREEN
