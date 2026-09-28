# Briefing Intelligence: cross-briefing wiring — Midweek, Monthly, DEXA, Photo previews for acceptance

- Handoff: `agent-handoffs/inbox/prompts/20260928T040000Z-briefing-intelligence-cross-briefing-realizer-wiring.md`
- Agent: claude · Status: **previews ready for Founder/ChatGPT acceptance — nothing deployed**
- Server candidate: **`f563e1eb`** on `codex/weekly-v3-weekly-pattern-narrative` (on top of accepted `6abbed64`; commits `07f0ae92`, `10a7f166`, `cc2cb267`, `f563e1eb`)
- Production: untouched. No deploy, no historical regeneration, no production write, no Native build, no Sleep ingestion. The notification and Native follow-ups have not started.

## What changed

One engine now serves all five briefing types. For each briefing it builds one evidence picture, then one holistic synthesis. After that come the briefing-type policy (purpose, horizon, authority, information budget, section contract) and one shared realizer. The realizer carries per-type words, keyed by role (weekly / midweek / monthly / outcome check / visual check). There are no per-type engines.

- **Publishers now pass period evidence to the shared engine:** Midweek, Monthly, DEXA and Photo (create and regenerate). Weekly already did this. Reads are guarded: if an evidence read fails, the briefing falls back to the previous path rather than failing.
- **Midweek** is the lightest type:
  - the recap is placed "so far this week", and the takeaway reads "Early read: …";
  - it has a single coaching line and no goal-meaning section, within 120 words;
  - it never states complete-week findings, and never watches days that have already passed.
- **Monthly** is richer than Weekly:
  - the recap has up to three insights, with calendar dates;
  - persistence is labelled: a one-off "isn't a pattern", while a persistent issue lasted "most of the month";
  - a domain may speak twice only in two different roles (for example, training progress and training frequency);
  - it looks ahead to "the coming month", never "next month" after the month it tells.
- **DEXA** is outcome-led:
  - the new measurement leads the headline and the recap;
  - the lead-up is context, never a cause: "the off-routine stretch before this check is context, not a reason to change course";
  - no step or watch comes from lead-up execution, and there is no "plan worked" language.
- **Photo** is led by the visual result:
  - the depth scales with a measured visual change (a strong change allows 2 recap insights, 3 coaching lines and 240 words; otherwise 1, 1 and 150);
  - a first set is described as a baseline, never as "compared";
  - a DEXA measured before the photos is standing context, never "new";
  - it does not restate corroborating measurements.
- **The composer guard** falls back to the prior path if a realization breaks the headline length, the sentence cap or the rule against semantically equivalent sections. The claim-restraint audit is recorded, not thrown.
- **Sleep stays extensible:** recovery is a domain the picture already considers (`recovery (unavailable)`); no ingestion was started.
- **Weekly is unchanged:** 720 synthetic Weekly realizations and the real Sep 20–26 preview are byte-identical to accepted `6abbed64`.

## Production gap (Photo)

The canonical photo producer records per-pose qualitative observations and a model confidence. It never records an amount of visual change. With production data, the engine therefore says only that the photos were compared, or that they set a baseline. The visible / subtle / little-change paths are real code, but they are reachable only with a visual-magnitude producer. They are demonstrated below on a synthetic fixture. **Follow-on:** a canonical visual-magnitude producer.

## Method (zero-write)

Every preview ran offline over the local read-only founder export. The export stays in job tmp and is never published. All repositories are in memory, and writes are refused, so nothing can reach production.

- **Midweek:** the real `MidweekBriefingService`, with a capturing lifecycle, then the real V3 `prepare`.
- **Monthly:** the real `generateForCurrentWindow`, with a capturing occurrence publisher, then `publishMonthlyOccurrence({ dryRun: true })`.
- **DEXA and Photo:** the accepted golden family harness, plus period evidence from the export.

Every type ran with and without the engine, to prove that Confidence and strategy are independent of it.

## 1. Midweek — Sep 20–22 (real data)

**Purpose (policy):** `what_is_emerging_so_far`. **Section contract:** headline (≤8 words) → recap placed "so far this week" → early-read takeaway → one execution line → step → watch; no goal-meaning section; 120-word budget; no complete-week findings.

| Section | **Shared engine (this candidate)** | Current production code without the engine | Currently served artifact |
|---|---|---|---|
| Hero headline | Strong training so far. | Nothing here calls for a change. | Machine lateral raises reached 90 lb, up from the previous best of 85 lb. |
| Hero paragraph / What It Means | So far this week, training kept moving forward, with new bests on five lifts. | The goal remains on course, and this check-in does not change that. | Training is still moving in the direction this build needs between DEXA checks. |
| Goal Confidence | Confidence holds. The September 12 DEXA still sets the outlook, and nothing so far this week changes it. | Confidence holds. The last DEXA still sets the outlook, and nothing in this check-in changes it. | Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook. |
| Biggest Takeaway | Early read: the performance gains are real, and that is the part to keep. | Nothing here calls for a change. | Machine lateral raises reached 90 lb, up from the previous best of 85 lb. |
| What To Do (Coach's Take) | Keep pushing the same lifts; Hack Squats went from 6 to 12 reps at 115 lb. | Nothing needs fixing right now. Keep the next few days clean and consistent. | Leg Extensions reaching 90 lb is a training milestone worth recognizing. |
| Into Next Week (action) | Keep the current setup in place. | Keep executing consistently. Keep the current setup in place. | Keep executing consistently. Keep the current setup in place. |
| What To Watch | Watch the weekly weight average. | The next DEXA will show whether this kind of progress continues while body fat stays in a good place. | Treat the calorie estimate as directional: calorie totals come from logged meals rather than a confirmed full-day total, active calories are a wearable estimate, and food and activity were both recorded on 2 of 3 days. Keep calorie targets where they are unless something more than the estimate calls for a change. The next DEXA will show whether this kind of progress continues while body fat stays in a good place. |

**Confidence and strategy:** 79% (delta 0), recommendation `continue_current_strategy` — identical to the run without the engine (79%, same assessment identity `confidence_assessment_v3|0dad4c3c19e1703…`). The stored Midweek published 79% with the same recommendation.

**Domains considered:** body_composition (assessed: standing_measurement); training (assessed: progressing); body_trajectory (assessed: steady); guardrail (assessed: clear); nutrition (assessed: partly_unreadable); routine (assessed: steady); activity (assessed: above_plan); recovery (unavailable); visual_change (unavailable).

**Selected (complementary insights):** `training\|training_progress` (progress, highest_value_for_goal); `body_trajectory\|weight_trend` (progress, complements_training). Context: `body_composition\|composition_result`, `guardrail\|guardrail_status`. Limitations said: `nutrition\|nutrition_unclear`.

**Omitted, with reasons:** `nutrition\|intake_vs_plan` — restrained:unreliable_days_in_average; `routine\|routine_steady` — below_briefing_floor.

**Audits:** structural pass; text pass (59 words); claim restraint [] (no effectiveness/causal or repair-the-past language).

Replayed through the real `MidweekBriefingService` (in-memory repositories over the read-only export, capturing lifecycle) and the real V3 prepare. The served text comes from older production code; the evidence and Confidence are the same.

## 2. Monthly — August 2026 (real data, dry run)

**Purpose (policy):** `multi_week_synthesis_and_strategy_fit`. **Section contract:** headline → recap of up to three insights (multi-week) → goal meaning → Confidence → takeaway → coaching → step → watch; calendar dates; persistence labels (one-off vs persistent); a domain may speak twice only in two different capacities; 320-word budget.

| Section | **Shared engine (this candidate)** | Current production code without the engine | Currently served artifact |
|---|---|---|---|
| Hero headline | Strong training month. | There is not enough reliable evidence yet to judge the result. | August established the starting line for building muscle. |
| Hero paragraph / What It Means | Training kept moving forward, with new bests on 18 lifts, your weight has been rising about 1 lb a week over the last four weeks, and there were more training days than usual. Nothing this month changes the direction of the 10 lb lean-mass goal. |  | You finished the cut, established a DEXA baseline, and created early training momentum. Those are encouraging first steps toward building muscle, but they are too early to confirm a body-composition change. Your calorie intake is also moving closer to supporting stronger training. September needs to show that performance and calorie consistency can hold across a full month. |
| Goal Confidence | Confidence moved up because consistent execution is supporting the goal. The next useful result still needs to show the progress continuing. | Confidence moved up because consistent execution is supporting the goal. The next useful result still needs to show the progress continuing. | — |
| Biggest Takeaway | The performance gains are real, and that is the part to keep. | There is not enough reliable evidence yet to judge the result. | — |
| What To Do (Coach's Take) | Keep pushing the same lifts; Hyperextension Machine did about 68% more work than the session before. August 4's food log looks copied from the day before; a fresh log each day from here on keeps the next check honest. | Hold the plan steady for now. The next useful result needs to be clean enough to guide a decision. | — |
| Into Next Week (action) | Keep the current setup in place. | Keep executing consistently. Keep the current setup in place. | — |
| What To Watch | The next DEXA should show whether lean mass is moving in the right direction under the build plan. | The next DEXA should show whether lean mass is moving in the right direction under the build plan. | — |

**Confidence and strategy:** 63% (delta 1), recommendation `continue_current_strategy` — identical with and without the engine (63%, delta 1). The served August Monthly is a V2 artifact (57%); this is a V3 recomputation for acceptance, not a replacement.

**Domains considered:** body_composition (unavailable); training (assessed: progressing); body_trajectory (assessed: steady); guardrail (assessed: clear); nutrition (assessed: partly_unreadable); routine (assessed: steady); activity (assessed: below_usual); recovery (unavailable); visual_change (unavailable).

**Selected (complementary insights):** `training\|training_progress` (progress, highest_value_for_goal); `body_trajectory\|weight_trend` (progress, complements_training); `training\|training_frequency` (execution, complements_training). Context: `guardrail\|guardrail_status`. Limitations said: `nutrition\|nutrition_unclear`.

**Omitted, with reasons:** `nutrition\|intake_vs_plan` — restrained:unreliable_days_in_average; `routine\|routine_steady` — not_enough_to_add_beside_what_was_said; `activity\|activity_change` — below_briefing_floor.

**Audits:** structural pass; text pass (110 words); claim restraint [] (no effectiveness/causal or repair-the-past language).

Generated by the real `prepareMonthlyOccurrence` and `publishMonthlyOccurrence({ dryRun: true })` (finalizer.preview; nothing committed). The Monthly cross-source intelligence still feeds Confidence as evidence (unchanged).

## 3. DEXA — Sep 12 (real data)

**Purpose (policy):** `outcome_checkpoint_with_preceding_execution`. **Section contract:** outcome-led: the new measurement leads headline and recap; goal meaning = where the result puts the goal and the guardrail; takeaway reads the result and places the lead-up as context; lead-up execution never becomes a step or a watch on past dates; 260-word budget.

| Section | **Shared engine (this candidate)** | Current production code without the engine | Currently served artifact |
|---|---|---|---|
| Hero headline | New DEXA shows progress. | This is a huge win. | Lean mass increased while body fat stayed controlled. |
| Hero paragraph / What It Means | The new DEXA showed lean mass up 5 lb, but the routine ran off its usual pattern just before this check. You are more than halfway to the 10 lb lean-mass goal, with body fat at 8.1%. | You are more than halfway to the 10 lb lean-mass goal. The measured progress in lean mass is real, and nothing in the evidence calls for changing the build plan. | Measured lean tissue increased 5.0 lb since the last scan, while body fat moved from 7.6% to 8.1%. The useful question is whether you are adding muscle without letting body fat move beyond the range you chose. |
| Goal Confidence | Confidence jumped because the DEXA measured a standout result: you added 5.0 lb of lean mass since August 15, with body fat still controlled at 8.1%. You are more than halfway to the 10 lb lean-mass goal. There is still uncertainty about finishing within the remaining time if progress slows. | Confidence jumped because the DEXA measured a standout result: you added 5.0 lb of lean mass since August 15, with body fat still controlled at 8.1%. You are more than halfway to the 10 lb lean-mass goal. There is still uncertainty about finishing within the remaining time if progress slows. | — |
| Biggest Takeaway | The measured result moves the goal forward; the off-routine stretch before this check is context, not a reason to change course. | This is a huge win. You added 5.0 lb of lean mass since August 15, while body fat stayed controlled at 8.1%. | — |
| What To Do (Coach's Take) | Your weight has been rising about 1.6 lb a week over the last four weeks, in the direction the goal wants. | This is exactly what this build needed: you added 5.0 lb of lean mass, with body fat still controlled at 8.1%. Measured progress puts the goal more than halfway there. Nothing here calls for a change. Keep executing and use the next DEXA to see whether this level of progress continues. | — |
| Into Next Week (action) | Keep the current setup in place. | Stay the course. There is no reason to change the plan right now. Keep executing consistently. Reconsider only if something meaningful changes. | — |
| What To Watch | Watch the weekly weight average and whether the usual training rhythm holds over the next few weeks. | The next DEXA is about whether this kind of progress continues while body fat stays in a good place. | — |

**Confidence and strategy:** 76% (delta +14), recommendation `continue_current_strategy` — identical without the engine. (The +14 movement comes from the accepted golden harness predecessor, as in the DEXA golden test.)

**Domains considered:** body_composition (assessed: new_measurement); training (assessed: interrupted); body_trajectory (assessed: steady); guardrail (assessed: clear); nutrition (assessed: partly_unreadable); routine (assessed: changed); activity (assessed: below_usual); recovery (unavailable); visual_change (unavailable).

**Selected (complementary insights):** `body_composition\|composition_result` (outcome, briefing_lead_domain); `body_trajectory\|weight_trend` (progress, complements_body_composition+routine); `routine\|routine_break` (execution, complements_body_composition). Context: `guardrail\|guardrail_status`. Limitations said: none.

**Omitted, with reasons:** `training\|training_frequency` — told_within_a_selected_insight; `activity\|activity_change` — told_within_a_selected_insight; `nutrition\|nutrition_unclear` — limitation_constrains_nothing_said.

**Audits:** structural pass; text pass (106 words); claim restraint [] (no effectiveness/causal or repair-the-past language).

The accepted DEXA golden harness (reduced founder records exactly as at generation) with period evidence from the read-only export.

## 4. Photo — Sep 19 (real data)

**Purpose (policy):** `visual_change_with_corroboration`. **Section contract:** visual-result-led; recap of one insight and one coaching line unless a measured strong visual change deepens it (two recap insights, three coaching lines, 240 words); 150-word budget otherwise.

| Section | **Shared engine (this candidate)** | Current production code without the engine | Currently served artifact |
|---|---|---|---|
| Hero headline | New photos, compared with the last set. | This is a huge win. | Nothing in the current evidence calls for a change. |
| Hero paragraph / What It Means | The new photos were compared pose by pose with the last comparable set. The September 12 DEXA showed lean mass up 5 lb with body fat at 8.1%, and that remains the picture to build on. | You are more than halfway to the 10 lb lean-mass goal. The measured progress in lean mass is real, and nothing in the evidence calls for changing the build plan. | You are more than halfway to the 10 lb lean-mass goal. The build plan is working, and nothing here changes that conclusion. |
| Goal Confidence | Confidence jumped because the DEXA measured a standout result: you added 5.0 lb of lean mass since August 15, with body fat still controlled at 8.1%. You are more than halfway to the 10 lb lean-mass goal. There is still uncertainty about finishing within the remaining time if progress slows. | Confidence jumped because the DEXA measured a standout result: you added 5.0 lb of lean mass since August 15, with body fat still controlled at 8.1%. You are more than halfway to the 10 lb lean-mass goal. There is still uncertainty about finishing within the remaining time if progress slows. | Confidence holds. Nothing new changes the outlook for the goal. |
| Biggest Takeaway | Nothing in the lead-up to these photos calls for a different approach. | This is a huge win. You added 5.0 lb of lean mass since August 15, while body fat stayed controlled at 8.1%. | Nothing in the current evidence calls for a change. The next DEXA already established that the build plan is working. |
| What To Do (Coach's Take) | The routine ran off its usual pattern midway through the lead-up; the usual days and times from here keep the next comparison clean. | This is exactly what this build needed: you added 5.0 lb of lean mass, with body fat still controlled at 8.1%. Measured progress puts the goal more than halfway there. Nothing here calls for a change. Keep executing and use the next DEXA to see whether this level of progress continues. | You are more than halfway to the 10 lb lean-mass goal. The last DEXA still supports the plan. The plan is working. Stay consistent. Keep executing. The next DEXA is about whether this kind of progress continues while body fat stays in a good place—not whether the plan works. That question has been answered. |
| Into Next Week (action) | Keep the current setup in place. | Stay the course. There is no reason to change the plan right now. Keep executing consistently. Reconsider only if something meaningful changes. | Stay the course. There is no reason to change the plan right now. Keep executing consistently. Reconsider only if something meaningful changes. |
| What To Watch | Watch the weekly weight average. | The next DEXA is about whether this kind of progress continues while body fat stays in a good place. | The next DEXA is about whether this kind of progress continues while body fat stays in a good place—not whether the plan works. That question has been answered. |

**Confidence and strategy:** 76% (delta +14), recommendation `continue_current_strategy` — identical without the engine.

**Domains considered:** body_composition (assessed: standing_measurement); training (assessed: interrupted); body_trajectory (assessed: steady); guardrail (assessed: clear); nutrition (assessed: partly_unreadable); routine (assessed: changed); activity (assessed: below_usual); recovery (unavailable); visual_change (assessed: compared_magnitude_not_measured).

**Selected (complementary insights):** `visual_change\|visual_comparison` (outcome, briefing_lead_domain); `routine\|routine_break` (execution, complements_visual_change). Context: `body_composition\|composition_result`, `guardrail\|guardrail_status`. Limitations said: none.

**Omitted, with reasons:** `training\|training_frequency` — told_within_a_selected_insight; `body_trajectory\|weight_trend` — information_budget_reached; `activity\|activity_change` — told_within_a_selected_insight; `nutrition\|nutrition_unclear` — limitation_constrains_nothing_said.

**Audits:** structural pass; text pass (89 words); claim restraint [] (no effectiveness/causal or repair-the-past language).

**Production-data gap.** The canonical photo producer records per-pose qualitative observations (and a model *confidence*), not an amount of visual change. The engine therefore leads with the fact that the photos were compared (or set a baseline) and never states how much they changed. The strong-visual path is demonstrated below on a synthetic fixture.

### Photo — synthetic fixture (not founder data): the same engine with a measured visual change

| Visual change | Budget (recap insights / coaching lines / words) | Headline | Hero paragraph | Takeaway | What To Do |
|---|---|---|---|---|---|
| visible | 2 / 3 / 240 | New photos show visible change. | The new photos show a visible change, and the new DEXA showed lean mass up 2 lb. You are more than halfway to the goal, with body fat at 9.5%. | Nothing in the lead-up to these photos calls for a different approach. | Keep pushing the same lifts; Lift A moved up to 105 lb from 100. Your weight has been rising about 0.5 lb a week over the last four weeks, in the direction the goal wants. |
| subtle | 1 / 1 / 150 | New photos show subtle change. | The new photos show a subtle change. The September 19 DEXA showed lean mass up 2 lb with body fat at 9.5%, and that remains the picture to build on. | Nothing in the lead-up to these photos calls for a different approach. | Keep logging the same way; it keeps the picture easy to read. |
| none | 1 / 1 / 150 | New photos, little visible change. | The new photos look much like the last set. The September 19 DEXA showed lean mass up 2 lb with body fat at 9.5%, and that remains the picture to build on. | Nothing in the lead-up to these photos calls for a different approach. | Keep logging the same way; it keeps the picture easy to read. |
| not measured | 1 / 1 / 150 | New photos, compared with the last set. | The new photos were compared pose by pose with the last comparable set. The September 19 DEXA showed lean mass up 2 lb with body fat at 9.5%, and that remains the picture to build on. | Nothing in the lead-up to these photos calls for a different approach. | Keep logging the same way; it keeps the picture easy to read. |
| baseline | 1 / 1 / 150 | New photos set a baseline. | The new photos set a baseline for later comparisons. The September 19 DEXA showed lean mass up 2 lb with body fat at 9.5%, and that remains the picture to build on. | Nothing in the lead-up to these photos calls for a different approach. | Keep logging the same way; it keeps the picture easy to read. |

## Proof properties (all four types)

- **Confidence and strategy independence:** in every real preview and in `CrossBriefingPublicationIndependence.test.js`, Confidence, delta, movement and recommendation are identical with and without the engine (Midweek 79/0, Monthly 63/+1, DEXA 76/+14, Photo 76/+14; all `continue_current_strategy`).
- **Causal restraint:** the claim-restraint audit is empty on every preview. There is no effectiveness or causal language, and nothing asks the person to repair the past.
- **Non-redundancy:** the section audit passes on every preview. There is one insight per domain unless a Monthly complementary role applies; lead-up items are "told within a selected insight" rather than repeated; no section restates another.
- **Immutability:** served artifacts are shown as stored. Nothing was regenerated or written, and the served Sep 12 DEXA, Sep 19 Photo, Sep 20–22 Midweek and August Monthly keep their original wording.

## Validation

- **Shared Briefing Intelligence suite:** 157/157 pass. It includes the new `BriefingCrossTypeRealization.test.js`, which checks cross-type properties across Midweek, Weekly, Monthly, DEXA and Photo (budgets, section roles, midweek provisionality, monthly persistence, outcome-led events, photo depth scaling and baseline, event freshness, no watching of past days).
- **Full repo at `f563e1eb`:** 9089/9397 tests pass. The 303 failures are the same set as the baseline (environmental), with **0 new**.
- **Weekly:** 720 synthetic realizations and the real Sep 20–26 preview are identical to `6abbed64`.

## Review history

Three fresh-context reviews were run.
1. Round 1 found the Photo baseline described as "compared", the Midweek "so far" misplacement, a missing composer guard, and Monthly depth.
2. Round 2 found Weekly copy drift, a Monthly watch on a past date, the double "so far" in Midweek, and read guards.
3. The verification of `10a7f166` passed with fixes and no High findings. It found event freshness against the policy, "next month" after the month told, and weight-trend placement.

All findings are fixed and covered by tests. In a final pass, the Photo coaching line was made forward-looking (`f563e1eb`).

## Follow-ons (not started)

1. **Monthly cross-source intelligence** (`MonthlyEvidenceIntelligenceV3`) still feeds Confidence as observations, and Energy-variability reliability is separate from the shared picture. It should consolidate into the shared engine (review M4).
2. **Photo:** a canonical visual-magnitude producer (see the production gap above).
3. **Composer guard:** it does not pre-check the non-period watch or the Confidence body.
4. **Photo with no visual observation at all** leads with other evidence. It is acceptable, but it could get an explicit rule.
5. After acceptance, the queued items in the handoff's order:
   1. the Sep 27 Strength reconciliation-review notification failure;
   2. Logged Today showing strength and cardio together;
   3. the Native Log-tab → active Workout Logger shortcut (approved for the next consolidated Native build).

## Decisions required

- Accept or refine the four previews (Midweek, Monthly, DEXA, Photo).
- Then authorize a Server deploy of `f563e1eb`. It supersedes `6abbed64`, which was release-ready but not deployed.
