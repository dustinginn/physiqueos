Task id: weekly-v3-sep20-26-founder-feedback-diagnosis-20260927

FOUNDER FEEDBACK — WEEKLY BRIEFING SEP20–26

This is a diagnosis/design task first. Do not patch copy strings or regenerate the historical Sep20–26 briefing merely to make the example look better. Audit the V3 Weekly evidence-selection/narrative architecture, determine why the canonical data visible in the briefing did not become meaningful weekly narrative, and prepare the smallest generalizable fix. Historical published strategic artifacts remain immutable unless separately authorized.

CONTEXT

The Sep20–26 Weekly Briefing is structurally readable but fails the Founder's intended product semantics. The core issue is not that Confidence held at 79%. Confidence may correctly hold while the completed week still contains meaningful changes worth summarizing.

The engine appears over-oriented toward:
"Did confidence move / does strategy need to change?"
and insufficiently oriented toward:
"What actually characterized this completed week, how did it differ from the established routine/recent weeks, and what context should the Founder carry into next week?"

FOUNDER OBSERVATIONS

1. CONFIDENCE COPY — SINGLE WORKOUT IS WRONG LEVEL

Current confidence explanation says:
"Confidence holds. Bicep Curl Machine’s recent result does not move the overall goal outlook by itself; the rest of the evidence still needs to confirm the trend before confidence can shift."

Founder requirement:
Goal-confidence copy should never center a single workout/exercise result such as Bicep Curl Machine. A single workout is the wrong level of abstraction for overall Build Lean Mass goal confidence.

Confidence explanation should synthesize goal-level evidence: body composition trajectory, trend consistency, meaningful training/nutrition/activity/recovery patterns, guardrail status, evidence completeness, time remaining, etc., as applicable.

Individual exercise evidence can exist lower in evidence/detail surfaces but should not become the headline explanation for overall Goal Confidence unless a future explicit product rule establishes truly exceptional strategic materiality.

Audit why this one workout became the selected explanatory evidence and fix the selection/abstraction rule generally.

2. HERO NARRATIVE — TOO EMPTY / CHANGE-ONLY

Current hero:
"Nothing here calls for a change."
"The goal remains on course, and this check-in does not change that."

Founder requirement:
A Weekly Briefing is a recap of the completed week, not merely a strategy-change detector.

The hero does not need to manufacture a strategy change. It can say strategy remains unchanged while still summarizing the most important characteristics of the week.

Sep20–26 is a strong example:
- Founder was out of town Thursday through Saturday.
- Nutrition consistency changed materially during that period.
- Calorie intake was materially higher Thursday/Friday/Saturday than the established routine/recent pattern.
- Founder did not work out Friday or Saturday.
- Activity/wearable data should be interpreted with appropriate measurement-error humility rather than treated as exact truth.
- The briefing should recognize that this was a routine-disruption/travel-shaped week, place it in the broader Build Lean Mass context, and distinguish a temporary deviation from evidence requiring a strategy change.

Do not hard-code travel-specific copy. Build the ability to detect meaningful within-week and versus-baseline/recent-period pattern changes and elevate them into Weekly Narrative when material.

3. ENERGY BALANCE — DATA CARD CAN REMAIN DATA-ORIENTED, NARRATIVE MUST USE THE SIGNAL

Current Energy Balance card:
7/7 days paired
Calorie intake 2,639 kcal vs 2,500 target — On Plan
Active calories 789 kcal vs 800 target — On Plan
Avg intake 2639
Avg expenditure 2636
Avg balance +2
Daily chart visibly varies across the week.

Founder does not require prose inside this card. The card can remain a factual/data presentation.

But if weekly energy/nutrition patterns differ meaningfully from prior weeks or the established routine, the Narrative/Coach's Take should use that signal.

Audit whether averaging the entire week and categorical "On Plan" labeling is masking meaningful day-level distribution/change. A weekly average can look near target while several consecutive days differ substantially from routine.

The narrative engine should be able to reason over:
- daily distribution;
- consecutive deviations;
- comparison with recent weeks / established baseline;
- nutrition versus activity patterns;
- wearable uncertainty.

Do not overstate Apple Watch expenditure precision. Activity can be treated as directional/contextual with known wearable error while nutrition changes can still be recognized.

4. "STILL UNRESOLVED" SECTION SHOULD NOT BE PRESENT

Founder reports this section had previously been removed and appears to have returned/regressed.

Current copy:
"Some evidence was incomplete this period, so those areas are not part of the conclusion."
"One more confirming result is still needed before the current result is treated as settled."

Audit the canonical Weekly V3 presentation/narrative contract and history of this section. Determine whether this is:
- a Native presentation regression;
- a Server Narrative V3 field that should no longer be emitted/rendered;
- legacy fallback leakage;
- or another path discrepancy.

Founder requirement: remove the "Still Unresolved" section from the intended Weekly V3 experience. Preserve any necessary uncertainty internally in Confidence V3/evidence semantics; do not surface this generic section.

Do not remove useful specific uncertainty elsewhere merely to satisfy this. The problem is the generic "Still Unresolved" block.

5. COACH'S TAKE — SHOULD SYNTHESIZE THE ACTUAL WEEK

Current:
Biggest Takeaway: "Nothing here calls for a change."
What To Do: "Nothing needs fixing right now. Keep the next few days clean and consistent."
Into Next Week:
1. Keep executing consistently. Keep the current setup in place.
2. The next DEXA will show whether this kind of progress continues while body fat stays in a good place.

Founder requirement:
Coach's Take is exactly where the briefing should convert the week's meaningful changes into contextual coaching.

For this week, conceptually:
- routine changed late in the week;
- intake rose;
- training paused Friday/Saturday;
- this can be acknowledged without chastising or overreacting;
- if strategy remains valid, coach can frame returning to normal routine next week and watching whether the temporary disruption persists.

Do not hard-code those words. The engine should generate grounded commentary from the actual selected weekly evidence.

"Nothing needs fixing" / "keep executing consistently" is inadequate when the evidence itself shows a meaningful break from the established routine.

PRODUCT PRINCIPLE TO PRESERVE

Separate these questions:

A. Goal Confidence:
Has evidence changed the probability/outlook of achieving the Goal?

B. Strategy recommendation:
Does the current plan need adjustment?

C. Weekly Narrative:
What meaningfully happened this completed week?

A and B may legitimately be "hold/no change" while C is still rich and specific.

Weekly Narrative must not collapse to generic no-change prose merely because Confidence and strategy recommendation hold.

EXPECTED AUDIT

Inspect the exact Sep20–26 canonical inputs and generated V3 artifacts read-only:
- daily nutrition/calories/macros;
- Activity/Apple Health;
- canonical Cardio/Training/Workout Logger;
- missed/no-training days;
- relevant weight/body-composition context;
- recent prior weeks needed to establish routine/baseline;
- evidence eligibility/materiality;
- Confidence V3 assessment;
- Narrative V3 selected evidence / prompts / intermediate representation;
- final Weekly output;
- Native presentation mapping.

Determine:
1. Whether the Thursday–Saturday nutrition increase is present canonically and eligible.
2. Whether Friday/Saturday no-training pattern is inferable from canonical training data and whether absence/non-event semantics currently exist.
3. Whether comparison-to-recent-week/routine features exist or Weekly V3 only reasons over current-window aggregates.
4. Why Bicep Curl Machine was elevated into Goal Confidence explanation.
5. Why hero and Coach's Take degraded to generic no-change language.
6. Why Still Unresolved is rendered again.
7. Whether Energy Balance "On Plan" thresholds/weekly averages are masking meaningful day-level variance.
8. Which changes belong to Server evidence-selection/Narrative/Confidence logic versus Native presentation.

DESIGN STANDARD

The fix must generalize beyond travel and beyond this Founder.

A strong Weekly engine should identify a small number of the most material weekly patterns, including deviations from established routine, while:
- not moralizing;
- not overreacting to one unusual day;
- not treating wearable expenditure as exact;
- not letting one exercise dominate goal-level confidence;
- not forcing Confidence movement or strategy changes;
- not fabricating causality;
- not treating missing data as proof of behavior unless canonical data supports the inference;
- maintaining historical artifact immutability.

Consider whether Weekly V3 needs explicit comparative features such as recent-baseline deltas, consecutive-day deviations, training-frequency/routine change, nutrition-distribution change, or selected-week-pattern summaries before Narrative generation. Do not jump straight to prompt wording if the evidence representation lacks these concepts.

VALIDATION

Prepare deterministic fixtures covering at minimum:
- confidence holds + materially different weekly routine => rich weekly narrative, no forced strategy change;
- several consecutive high-intake days hidden by a reasonable weekly average => narrative can surface the pattern;
- two missing/rest training days versus established frequency => surfaced only when canonical evidence supports it;
- one exercise PR/result => does not dominate Goal Confidence explanation;
- wearable activity near target with uncertain precision => contextual, not over-precise;
- ordinary stable week => concise no-change narrative remains appropriate;
- generic Still Unresolved section absent from Weekly V3 presentation;
- historical V2 and already-published V3 artifacts unchanged.

Fresh-context review the architecture and candidate.

RELEASE / SAFETY

Do not regenerate or mutate the published Sep20–26 Weekly Briefing.
Do not mutate production data.
Do not deploy Server changes.
Do not cut/upload a Native build.
Do not begin HealthKit Sleep.

The approved Native backlog item "Log tab returns directly to active Workout Logger session" remains queued for the next consolidated Native build; do not implement it inside this Weekly diagnosis unless later explicitly batched.

Previously deferred Progress Photos issues and Exercise Detail current-record/canonical-identity issue are DONE per Founder and must not be resurfaced absent regression.

Publish a GH report/pointer with:
- exact root causes;
- current-data audit;
- proposed architecture/fix split;
- candidate SHA(s) if implemented;
- deterministic validation;
- fresh-context review;
- whether Native work is required;
- recommendation for batching/release.

STANDING NOTIFICATION RULE

Whenever Claude stops for any reason, immediately push-notify Founder. Do not silently stop.

END TASK.
