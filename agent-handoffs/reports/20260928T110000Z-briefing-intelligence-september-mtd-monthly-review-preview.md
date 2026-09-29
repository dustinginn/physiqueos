# Briefing Intelligence: Monthly as a review of the month — September month-to-date preview for acceptance

- Handoff: `agent-handoffs/inbox/prompts/20260928T060000Z-briefing-intelligence-september-mtd-monthly-zine-preview.md`. It supersedes the preview portion of `…050000Z-…monthly-zine-realizer-refinement.md`.
- Agent: claude · Status: **September preview ready for Founder/ChatGPT acceptance. Nothing was deployed or published.**
- Server candidate: **`15b6e447`** on `codex/weekly-v3-weekly-pattern-narrative` (commits `c567158a`, `8f36b02f` and `15b6e447`, on top of the cross-briefing candidate `f563e1eb`).
- What did not happen: no deploy, no September Monthly created or published, September not marked complete, no historical artifact regenerated, no production write, no Native build, no Photo magnitude or Sleep work.

## A. Preview boundary

| | |
|---|---|
| Evidence window | **September 1 – September 26, 2026** (America/Los_Angeles), month to date |
| Latest complete canonical day included | **September 26**. Activity, nutrition and training are all present. Sep 27 is partial (one weigh-in and one training record) and is excluded. |
| Days remaining in September | **4** (Sep 27–30) |
| Generated at (preview clock) | 2026-09-27T22:50Z, just after the read-only export's latest update (2026-09-27T22:49Z) |
| Material coverage limitations | 5 food-log days were too incomplete to read (Sep 6, Sep 22, Sep 24–26). There were no weigh-ins on Sep 25–26. No September photo comparison. No recovery or sleep evidence (the slot stays unavailable; nothing is invented). |
| Confidence predecessor | The Sep 20–26 Weekly assessment (79%) |

The October 1 production Monthly will rerun over the completed month through the normal cadence. This preview says "so far" and "through September 26" wherever a count could otherwise read as final. The latest off-routine stretch reaches the through-date, and the preview says it is not yet known whether it has passed.

## What changed (engine, not copy)

- **One engine, a review contract.** The shared section contracts gain `REVIEW_CONTRACTS.monthly`, which defines eight editorial modules:
  - **opening:** what defined the month and what it means for the goal;
  - **strategy:** continue / change / uncertain;
  - **training**, **energy** and **trajectory** (composition, guardrail, scale);
  - **execution:** routine and activity, recurring vs one-off;
  - **other:** photos, and a declared recovery/sleep slot;
  - **month ahead.**

  Each module is **earned by the shared picture's own domain assessment or omitted with a reason**. Budgets are per module (760 words total). Confidence is capped at **2 sentences and 35 words**.
- **Shared picture, multi-week facts:** every routine stretch, and whether the latest one reaches the period end; the weeks in which bests landed; readable-day intake, and **one** plan-relative intake verdict (V3's own tolerance); first-week vs latest-week scale averages. These are facts only. No selection or Confidence input changed.
- **Monthly editorial prose is now entirely the shared engine's.** The legacy Monthly editorial engine's prose no longer reaches the page, and on September's evidence it was **false** (see F). The review is projected onto the Monthly cards Native and web already render, so no Native change is needed. The energy figures are rebuilt over the month's readable days, so the bars, averages and prose describe the same days.
- **Compact Confidence everywhere:**
  - the Native hero uses the compact line;
  - the strategic card no longer repeats Confidence;
  - the web route renders the stored compact line instead of re-expanding it.
- **Formats stay as first published.** The review is applied to new Monthlies (and to corrections of Monthlies that already carried it). An older Monthly keeps its original format.
- **The other briefing types are untouched:** Midweek, Weekly, DEXA and Photo are byte-identical to `f563e1eb` across 2,160 synthetic cases and all four real previews.

## Method (zero-write)

- **Pipeline:** the real `prepareMonthlyOccurrence`, then `publishMonthlyOccurrence({ dryRun: true })` (the finalizer preview; nothing is committed).
- **Data:** in-memory, write-refusing repositories over the local read-only production export. The export stays in job tmp and is never published.
- **Preview-only harness settings:** the window is the real Monthly window, clipped to the latest complete day. The dry-run window is marked closed at the through-date, because the publisher registry only finalizes closed windows; the realizer reads month-to-date from `endDate < month end`.
- **Comparison run:** the same run without the engine gives the current-production comparison.

## B. The generated September Monthly, in display order

Engine-generated, zero-write, **not hand-edited**. Rendered in Native's `MonthlyBriefingSections` order: Hero (with compact Confidence) → strategic card (Coach's Take; the web shows the same text as a Coach's Take section) → Training Progress → Energy Evolution → New Baseline → What Changed → Month Ahead → uncertainty (none surfaced). A card whose module the review did not earn is not rendered; **Defining Moments is intentionally not rendered** (its dated events are told inside their own cards).

| Card | Field | Copy |
|---|---|---|
| Hero | Eyebrow · range | MONTHLY BRIEFING · September 1–26 · Month to date |
| Hero | Compact Confidence | 79% · No meaningful change — Confidence holds. The September 12 DEXA sets the outlook, and a few off-routine days aren't enough to change it. |
| Hero | Headline | Real measured progress, but two off-routine stretches. |
| Hero | Narrative | So far, September has brought measured progress in lean mass on the September 12 DEXA, new training bests across most of the month, and two short off-routine stretches. You are more than halfway to the 10 lb lean-mass goal, with body fat at 8.1%. |
| Hero | Highlight (data): Lean mass | +5 lb — September 12 DEXA, since August 15 |
| Hero | Highlight (data): Training | 12 new bests — 21 training days |
| Hero | Highlight (data): Scale weight | +1.7 lb/week — 26-day trend |
| Strategic card (Native) / Coach's Take (web) | Coach's Take | Put together, the measured result moved the goal forward and training kept progressing; the misses were short-lived rather than a slide. Nothing in the month argues for changing the plan; what to tighten is execution: keeping the usual sessions and the daily calorie number. What the month can't settle is how much of the scale's climb is lean mass. Intake is the least certain part of the picture, because some logged days were too incomplete to read. |
| Training Progress | Headline | Progress was spread across the month. |
| Training Progress | Narrative | New bests came on 12 lifts through September 26, and they landed in three of the four weeks rather than in one good week. There were 21 training days, a few fewer than your usual rhythm; the missed days fall within the routine stretches below. |
| Training Progress | Stat (data): Plated Chest Fly Machine | 70 lb — up from 50 lb · September 18 |
| Training Progress | Stat (data): Sumo Squat Machine | 15 reps at 180 lb — up from 12 reps · September 10 |
| Training Progress | Stat (data): Hyperextension Machine | 95 lb — up from 80 lb · September 17 |
| Training Progress | Why it matters | Between checks, performance is the clearest read on training: it shows the work moving forward, while lean mass itself is only measured by the DEXA. |
| Energy Evolution | Headline | Intake ran above the plan's target on the readable days. |
| Energy Evolution | Phase (data) | Lean Mass Build · Sep 1–Sep 26 |
| Energy Evolution | Narrative | Food was logged on all 26 days through September 26, and 21 were complete enough to read. On those days intake averaged about 2,800 calories against a 2,500 target, and protein held around 186 g, in line with your usual. September 6, September 22, and September 24 through 26 were too patchy to read and are left out of that average. |
| Energy Evolution | Insight | Expenditure is a wearable estimate, so read the weekly balance as directional; the scale's trend is the steadier read of where intake sits against the work. |
| Energy Evolution | Weekly bars (data) | Sep 1–Sep 7: 3157 in / 2562 out (6 readable days); Sep 8–Sep 14: 2640 in / 2732 out (7 readable days); Sep 15–Sep 21: 2659 in / 2728 out (7 readable days); Sep 22–Sep 26: not shown (1 readable day) |
| New Baseline | Metric grid (data) | Body fat 8.1% · Lean mass 153.3 lb · Fat mass 14.2 lb · Reference date September 12, 2026 |
| New Baseline | Headline | The September 12 DEXA is the new reference point. |
| New Baseline | Narrative | It measured lean mass up 5 lb since August 15, and body fat stayed inside its limit. On the scale, the weekly average went from about 170 lb in the first week to about 174 lb in the latest, roughly 1.7 lb a week on the recent trend. The scale can't tell lean mass apart from other weight, so it adds pace, not a verdict. |
| New Baseline | Baseline Read | The next DEXA will be compared with this one. |
| What Changed | Early-month stretch · September 3 through 7 | Calories ran above usual September 3 through 5, the wearable showed less activity September 4 through 7, and training stopped September 5 through 7. |
| What Changed | Late-month stretch · September 24 through 26 | The wearable showed less activity September 24 through 26, and training and weigh-ins stopped September 25 and 26. It runs up to the latest complete day, so whether it has passed isn't known yet. |
| What Changed | Pattern · Two short stretches, not a pattern. | Together they cover eight days; outside them the routine held, and wearable activity stayed at its usual level. |
| Month Ahead | Introduction | October's job is to keep the progress going on a steadier rhythm. |
| Month Ahead | Priority | Get the usual training rhythm back — Protecting the usual training days matters more than any single big week. |
| Month Ahead | Training | Keep the progression going — Build on the lifts that moved; repeating a best matters as much as beating it. |
| Month Ahead | Intake | Bring intake back down to the target — Hitting the target on most days across the month counts for more than any single day. |
| Month Ahead | Logging | Log complete days — A full day's log, every day, makes intake the easiest part of October to read. |
| Month Ahead | Watch | The weekly weight average — It shows the pace between scans; a single weigh-in never does. |
| Month Ahead | Next evidence | The next DEXA — It is the check that settles what the scale can't. |

Native supplies three fixed headers that are not Server copy: *"September changed how progress should be judged."* (What Changed), *"Turn September's signals into repeatable evidence."* (Month Ahead), and the card label *New Baseline* / callout *Baseline Read*. The Server cannot change them; see Follow-ons.

## C. Word counts

| Module | Card(s) | Prose words |
|---|---|---|
| opening | Hero headline + narrative | 44 |
| strategy | Strategic card · Coach's Take | 77 |
| training | Training Progress | 51 |
| energy | Energy Evolution | 71 |
| trajectory | New Baseline | 74 |
| execution | What Changed | 82 |
| ahead | Month Ahead | 93 |
| headline | Hero | 7 |
| **Total narrative** | | **499** |
| Compact Confidence | Hero | 19 (budget ≤ 35 words, ≤ 2 sentences) |

Data fields are not counted as prose: the highlight chips, lift stats, energy bars and the DEXA metric grid.

## D. Domain assessments (every goal-relevant domain, assessed before any prose was chosen)

| Domain | Status · state | Polarity | Key facts | Persistence / one-off | Reliability |
|---|---|---|---|---|---|
| body_composition | assessed · new_measurement | supportive | Sep 12 DEXA: lean mass 153.3 lb, +5 lb since 2026-08-15; new this month | one measurement (outcome) | measured |
| guardrail | assessed · clear | neutral | body fat 8.1% · clear | from the same scan | measured |
| body_trajectory | assessed · steady | neutral | Theil–Sen 1.68 lb/wk over 26 days (recent 2.04, earlier 2.59); first week ≈ 170.2, latest week ≈ 174.2; verdict steady (personal_trend_relative) | trend across the month (not accelerating) | scale weight; never read as composition |
| training | assessed · progressing | supportive | 12 lifts with new bests; bests in 3 of 4 weekly blocks; 21 training days vs usual ≈ 25.5; missed 2026-09-05, 2026-09-06, 2026-09-07, 2026-09-25, 2026-09-26 | progress **persistent** (3/4 weeks); misses inside two short stretches | logged sessions |
| nutrition | assessed · partly_unreadable | limiting | logged 26 days, readable 21; readable-day intake ≈ 2796 vs target 2500 (all-days avg 2780 withheld: restrained); protein 186 g (usual 184) | sustained above target on readable days | unreadable: 2026-09-06, 2026-09-22, 2026-09-24, 2026-09-25, 2026-09-26 |
| routine | assessed · changed | concern | 2026-09-03→2026-09-07 (activity+nutrition+training); 2026-09-24→2026-09-26 (activity+body+training, reaches through-date) | **recurring short** (8 of 26 days); neither persistent | cross-domain co-occurrence only; no cause claimed |
| activity | assessed · below_usual | neutral | tracked 26 days; plan state on_plan; dips 2026-09-24→2026-09-26, 2026-09-04→2026-09-07, 2026-09-04→2026-09-07, 2026-09-25→2026-09-26 | dips only inside the two stretches | **wearable estimate** |
| recovery | unavailable · no_recovery_evidence_yet | neutral | no canonical sleep/recovery evidence | — | unavailable (not invented) |
| visual_change | unavailable · no_photo_comparison | neutral | no photo comparison in September | — | unavailable |

## E. Holistic synthesis and section allocation

**Selected (complementary):** `body_composition|composition_result` (outcome; highest_value_for_goal); `training|training_progress` (progress; complements_body_composition); `body_trajectory|weight_trend` (progress; complements_body_composition+training+routine); `routine|routine_break` (execution; complements_body_composition+training). **Context:** `guardrail|guardrail_status`. **Limitation said:** `nutrition|nutrition_unclear`.

**Omitted from the opening, with reasons:** `nutrition|intake_vs_plan` — restrained:unreliable_days_in_average; `training|training_frequency` — told_within_a_selected_insight; `activity|activity_change` — told_within_a_selected_insight. (Each still informs its own module: training frequency → Training Progress; activity → What Changed; readable-day intake → Energy Evolution.)

| Module | Earned by | Job |
|---|---|---|
| opening | `body_composition|composition_result`, `training|training_progress`, `body_trajectory|weight_trend`, `routine|routine_break` | what defined the month; goal meaning |
| strategy | `body_composition|composition_result`, `training|training_progress`, `body_trajectory|weight_trend`, `routine|routine_break` | continue / change / uncertain |
| training | `training|training_progress`, `training|training_frequency` | progression, persistence, rhythm |
| energy | `nutrition|intake_vs_plan`, `nutrition|nutrition_unclear` | intake vs plan, reliability, wearable humility |
| trajectory | `body_composition|composition_result`, `body_trajectory|weight_trend` | composition, guardrail, scale pace |
| execution | `routine|routine_break` | routine & activity: recurring vs one-off |
| ahead | `routine|routine_break`, `body_trajectory|weight_trend`, `routine|routine_break` | priorities, next evidence, what to watch |
| ~~other~~ | omitted: `no_photo_comparison+no_recovery_evidence_yet` | photos / recovery earn space only with evidence |

**Anti-redundancy:** review audit **pass** — each quantity stated in one module only; no two modules share most of their content; every module within its sentence/word budget; claim restraint on every sentence. Section audit (headline/takeaway/strategy pairs): [].

## F. Comparison

| | Served August Monthly (V2) | f563e1eb Monthly preview (August) | **This September preview** | Accepted Weekly (Sep 20–26) |
|---|---|---|---|---|
| Narrative prose words | ≈ 660 | 100 | **499** | 182 |
| Confidence copy | long block (reason + 3 limiting + 3 unresolved) | 2 sentences | **19 words, 2 sentences** | 1–2 sentences |
| Cards with prose | hero, energy, changes (3 themes), moments (4), training, month ahead (5), new baseline | hero + strategic card only (modules were legacy V2) | **hero, strategic, training, energy, new baseline, what changed (3), month ahead (5)** | hero + coach card |
| Source of the prose | separate legacy Monthly editorial engine | shared engine (strategic card) + legacy modules | **shared engine for every card** | shared engine |

- **Against August (the format reference):** September uses the same editorial arc and cards: an opening, domain modules, and the month ahead. The body is somewhat shorter because the evidence decides each card, and nothing is padded. The difference that matters is truth. On September's evidence, the legacy editorial engine produces template copy that is **false**: *"The September 12 DEXA recorded where you started… it did not prove that you gained muscle"* (it measured +5 lb), *"Progress photos showed a steady physique"* (there were no September photos), and *"Several key lifts moved forward after the cut"* (the cut ended in July). The legacy output for this same window is shown below under Section G.
- **Against f563e1eb (too sparse):** the August preview there realized only the strategic card (about 110 words), and every module under it still came from the legacy editorial engine. Now every card is written by the shared engine, and the September body is about 4× richer.
- **Against the accepted Weekly:** the Weekly is a recap of about 182 words across its sections. The Monthly is a review: about 2.7× longer, split across seven single-job modules, with multi-week facts a week cannot hold (bests across the weekly blocks, two separate stretches, readable-day intake over the month, first-week vs latest-week scale average). The Monthly reuses no Weekly period sentence, and this is tested.

## G. Confidence / strategy independence, causal restraint, determinism

- **Confidence** is 79% (delta 0) with the engine and 79% (delta 0) without it. The **recommendation** is `continue_current_strategy` both ways. The **assessment identity** is identical (`confidence_assessment_v3|b508feb5511908a69560560…`). Its predecessor is the Sep 20–26 Weekly assessment (79%).
- **Claim restraint:** issues []. The review's own audit scans every sentence. There is no "the plan is working", no "because of", and no repair of past days. Exercise performance only illustrates training, and the Confidence line names only the DEXA and the routine.
- **Determinism:** a second run is byte-identical (true).
- **Without the engine, the same window renders** (current production code): headline *"Nothing here calls for a change."*, hero *"The goal remains on course, and this check-in does not change that."*. The modules underneath are the legacy template copy quoted in F.

## Validation

- **New `BriefingMonthlyReview.test.js`**, with properties over 270 synthetic months plus calendar and month-to-date windows:
  - a rich month is more than 1.3× the Weekly over the same evidence, with at least 6 modules;
  - a quiet month is less than 0.7× an eventful one; every module records what earned it;
  - all domains are assessed before any prose is selected, and each omission has a reason;
  - a domain without evidence gets no module; a month with no measurement tells the scale as pace only;
  - no Weekly period sentence is reused and there is no week-scoped wording (not a concatenation of Weeklies);
  - recurring vs one-off vs whole-month patterns are read differently;
  - Confidence stays within 2 sentences / 35 words and never mentions lifts; the cap holds even for one over-long sentence;
  - each quantity appears in one module only, and no two modules say the same thing;
  - coach voice holds, with no effectiveness or causal language and no repair of past days;
  - weight is never read as composition, wearable expenditure is treated as an estimate, and no expenditure figure appears as prose;
  - a month-to-date review never claims unseen days, and a closed month carries no month-to-date qualifiers;
  - a span that is not a calendar month is never named as one;
  - there is one intake verdict, and missed training days are pointed to the routine stretches only when they fall inside them;
  - recovery/sleep has a declared slot;
  - output is deterministic, and only the Monthly has a review.
- **New `MonthlyReviewPresentationService.test.js`:**
  - legacy prose is fully replaced;
  - energy figures are rebuilt for the window's readable days;
  - card tones are unique, because clients key cards by them;
  - the measurement card is synthesized when no matching legacy card exists, and the scale appears as a What Changed theme when there is no measurement;
  - a Monthly without a review is returned unchanged;
  - corrections keep their original format.
- **Test results:**
  - Briefing Intelligence plus Monthly presentation/web suites: **537/537** pass.
  - Full repository at `15b6e447`: **9113/9421 pass; the same 303 environmental failures as the baseline; 0 new**.
- **The other briefing types are unchanged:** the synthetic corpus diff against `f563e1eb` is Midweek 0/540, Weekly 0/540, DEXA 0/540 and Photo 0/540. The real Sep 20–26 Weekly, Sep 20–22 Midweek, Sep 12 DEXA and Sep 19 Photo previews are all byte-identical.

## Review history

1. **Fresh-context review of `c567158a`: PASS-WITH-FIXES**, 13 findings. The two High findings:
   - The Energy card showed legacy phase-wide bars and averages next to readable-day prose.
   - Native had duplicate card identities in What Changed.

   The Medium findings:
   - The measurement card was dropped without a legacy card.
   - A non-calendar span printed "in null".
   - The realizer made its own intake judgment.
   - Cards repeated each other.
   - Logging wording contradicted the Energy card.
   - The intake concern never reached the strategy.
   - Web lost eyebrows and showed empty callouts.
   - Month Ahead tones were assigned by position.
   - The correction path could rewrite history.
   - There were also month-to-date wording issues.

   All were fixed in `8f36b02f`.
2. **Verification of `8f36b02f`: PASS-WITH-FIXES**, 11/13 fixed. Still open or new:
   - My correction gate would have reverted a review-format Monthly to the legacy format.
   - `compactConfidence` could cut a sentence mid-thought.
   - The scale theme ignored an older standing DEXA.
   - A one-day weekly bar was shown as a weekly average.
   - There was a heading and eyebrow mismatch.

   All were fixed in `15b6e447`. The remaining repetition (the two stretches are named in the headline and the opening) is the headline and opening telling the same lead at two levels of detail, as in every briefing type. Every other card now points to the stretches without restating them.

## Follow-ons (not started)

1. **Native fixed headers (next consolidated Native build).** Three Monthly headers are Native-authored template text, not Server copy:
   - What Changed: "<Month> changed how progress should be judged."
   - Month Ahead: "Turn <Month>'s signals into repeatable evidence."
   - the "New Baseline" label and "Baseline Read" callout.

   They should read the Server's `title` and `eyebrow`. The Native strategic card label "Coach's Take" is already correct.
2. **Confidence-side consolidation.** `MonthlyEvidenceIntelligenceV3` still feeds Confidence as observations, deliberately unchanged here so that Confidence is identical. Folding its persistence concepts into the shared picture would move Confidence and needs its own authorization.
3. **Photo visual-magnitude producer** (queued as its own follow-up).
4. **Queued after acceptance:**
   1. the Sep 27 natural Strength reconciliation-review notification failure;
   2. Logged Today showing strength and cardio together;
   3. the Native Log-tab → active Workout Logger shortcut;
   4. the Photo magnitude producer.

## Decisions required

- **Accept or refine the September Monthly preview** (Section B). If accepted, the cross-briefing candidate (`15b6e447`, which includes the accepted Midweek, Weekly and DEXA work and the Photo wiring) is ready for a deploy decision.
- **Optional:** whether Defining Moments should come back as a dated timeline. It is currently omitted, because its events are told in their own cards.
