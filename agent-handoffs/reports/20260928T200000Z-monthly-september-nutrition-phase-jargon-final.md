# Monthly final correction: nutrition completeness vs anomaly, canonical phase label, no analytical "read" jargon — regenerated September preview

- **Handoff:** `agent-handoffs/inbox/prompts/20260928T180000Z-monthly-september-nutrition-reliability-phase-jargon-final.md`
- **Agent:** claude · **Status: regenerated September Monthly ready for Founder/ChatGPT review. Not deployed, not published.**
- **Server candidate:** **`7242043f`** on `codex/weekly-v3-weekly-pattern-narrative`. It builds on the structurally accepted `086af316` with two commits: `e113c678`, the corrections, and `7242043f`, the fresh-review fixes.
- **What did not happen:** no deploy, no September Monthly published, no August or history regeneration, no production write (the audit was read-only), no Native build, and no notification, Photo-magnitude, auth, peptide, skip, PR-celebration or Sleep work.
- **The accepted Monthly structure is unchanged:** Hero → Training Progress → Energy Evolution → New Baseline → What Changed → Defining Moments → Month Ahead.

## 1. Nutrition reliability: source-level audit first

**Method.** For every September day, the audit read the canonical nutrition records and the HealthKit canonical days from production, with a zero-write probe (`BEGIN READ ONLY`, `transaction_read_only = on`, rolled back). It then cross-checked them against the read-only export. What each source records:
- **Screenshot-logged days (Sep 1–21):** meals, food entries and source artifact files.
- **HealthKit days (Sep 22 on):** a device daily aggregate, with its full-day assertion, source observations and revision history.

Production matched the export for every September day through Sep 26. Sep 27 has since completed (2,345 kcal) but is outside this preview window.

### The five disputed days

| Date | kcal · P/C/F (g) | Source · entries · scope | Completeness evidence | Rule that fired (086af316) | Rule basis | Context (target 2,500; usual ≈ 2,480) | Recommendation |
|---|---|---|---|---|---|---|---|
| **Sep 6** | 3,920 · 183/385/191 | Screenshot log, 4 meals / 15 foods, built from **IMG_2489.png + IMG_2490.jpeg (Sep 5's own files)** + IMG_2488.jpeg | Food-for-food the same as Sep 5 (Spicy Salami Pizza, prime rib, Tiramisu…), from the **same source files**: not independent evidence of Sep 6 | `duplicate_day_totals` | integrity | above target | **Exclude.** The reason is duplicate source evidence, not matching totals. |
| **Sep 22** | 2,406 · 178/174/109 | HealthKit device aggregate, 6 source observations, revisions 456 → 2,406 → 2,406 | `complete_day`, `full_day_asserted` (high reliability); its own progressive revision history. **Founder confirmed accurate.** Totals are float-identical to Sep 21, which fits a repeated or copied food-app day. | `duplicate_day_totals` | integrity | near target | **Include.** Noted as a repeated day, not bad data. |
| **Sep 24** | 2,415 · 129/188/96 | HealthKit, 8 source observations, revisions 280 → 496 → 1,319 → 2,415 | `full_day_asserted` (high); logging built up through the day; food-app day check-marked (Founder screenshot) | `implausible_macro_profile` (protein z −3.7, share z −2.7) | **anomaly vs personal baseline** | near target; low protein | **Include.** Low protein is behavior. |
| **Sep 25** | 1,922 · 72/227/86 | HealthKit, 5 source observations, revisions 1,072 → 1,282 → 1,622 → 1,922 | `full_day_asserted` (high); built up through the day; check-marked. The device aggregate carries no entry-level detail. | `implausible_macro_profile` (−7.5 / −4.4) | **anomaly** | below target; low protein | **Include, with a limitation:** no entry-level detail is available to confirm completeness beyond the source's full-day assertion. |
| **Sep 26** | **2,915** · 129/320/131 | HealthKit, 3 source observations, revisions 505 → 2,915 | `full_day_asserted` (high) | `implausible_macro_profile` (−3.7 / −3.7) | **anomaly** | **above target**; low protein | **Include.** A high-intake day. |

**Comparison days:**
- **Sep 20, a high day that was always included:** 3,730 kcal, screenshot log, 4 meals / 7 foods. Included before and now.
- **Sep 17, an ordinary complete day:** 2,397 kcal, 4 meals / 12 foods. Included, with no anomaly.
- **Sep 23:** 2,677 kcal. Its macros don't add up to its calories (213 g fat alone is about 1,900 kcal). The Founder's food-app screenshot shows exactly these totals, so the canonical record mirrors the app faithfully; the mismatch is in the app's entries. Included.
- **Sep 27, a genuinely incomplete day:** at export time its source was marked `partial_day` (`partial_subtotal`, low reliability, 1,200 kcal). That is exactly what the completeness rule excludes. It has since completed at 2,345 kcal.

**Finding.** Three of the five exclusions (Sep 24–26) came from a rule that judged how **unusual** a day was against the person's own baseline, not how **complete** its record was. That includes a 2,915 kcal high day. A fourth (Sep 22) came from matching totals, which is not evidence of bad data. Only Sep 6 was a genuine completeness problem, and for a stronger reason than the one recorded.


### The reliability model fix (general; no special-cased dates)

- **A. Completeness: the only thing that excludes a day** (`BriefingIntelligence.detectReliabilityFindings`, `basis: "completeness"`):
  - **`partial_day`:** the source marks the day partial.
  - **`duplicate_source_evidence`:** the day's record is built from another day's own identifying source files (at least 2 shared files, one set containing the other). Generic labels like "Photo 1" prove nothing.
  - **`sparse_day`:** under 50% of the person's usual calories **and** collapsed protein **and** no full-day assertion **and** 3 or fewer entries (or entries unknown).
- **B. Anomaly: kept in every average and reported** (`intelligence.anomalies`, `effect: "kept_and_reported"`):
  - **`low_protein`:** protein far below the person's usual.
  - **`repeated_day_totals`:** totals match the previous day on independent evidence.

  Anomalies become nutrition facts. A run of two or more low-protein days is said in the Energy card, and only claims "even on days at or above target" when that is true of those days.
- **Day provenance.** Period days now carry their source evidence: artifacts, device observations, entry count and full-day assertion (`BriefingPeriodEvidence.nutritionEvidenceOf`).
- **Tests** (`BriefingNutritionReliability.test.js`, 12 cases):
  - an ordinary complete day;
  - a complete high day;
  - a complete low day;
  - a sparse low day, excluded;
  - the same low total with a full-day assertion, kept;
  - an unusual macro profile with strong entry coverage, kept and reported;
  - repeated totals on independent evidence, kept;
  - reused source files, excluded, while generic labels are not;
  - a single shared file or a partial overlap, kept;
  - a partial-day marker, excluded;
  - a run of high days, all kept;
  - a high day that moves the monthly average, counted.
- **Synthetic generators corrected.** Their "underlogged day" had cut protein at normal calories, which is the very assumption the Founder rejected. They now model real incompleteness (a fraction of the day, few entries, no full-day assertion) and real reuse (the same screenshot files). A fresh-context probe confirmed each synthetic case is caught by the intended rule, not by a side marker.

### Every September day, final classification (Sep 1–26)

| Date | kcal | P / C / F (g) | Source | Entries / revisions | Source completeness marker | Previous rule (086af316) | New classification | Behavioral note |
|---|---|---|---|---|---|---|---|---|
| 09-01 | 2450 | 172 / 186 / 112 | screenshot log (IMG_2239.png, IMG_2238.jpeg, IMG_2237.jpeg) | 4 meals / 15 foods | unknown; quality complete | — | include | near target |
| 09-02 | 2450 | 170 / 226 / 98 | screenshot log (IMG_2267.png, IMG_2266.jpeg, IMG_2265.jpeg) | 4 meals / 13 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-03 | 3926 | 203 / 370 / 174 | screenshot log (IMG_2283.jpeg, IMG_2282.jpeg, IMG_2281.jpeg) | 4 meals / 12 foods | unknown; quality complete | — | include | above target |
| 09-04 | 3564 | 245 / 319 / 142 | screenshot log (IMG_2525.jpeg, e7a671591654446a90ee9e98b402c410_images_file_2_0) | 3 meals / 10 foods | partial_meal_subtotal; quality complete | — | include | above target |
| 09-05 | 3920 | 184 / 384 / 192 | screenshot log (IMG_2490.jpeg, IMG_2489.png) | 4 meals / 15 foods | partial_meal_subtotal; quality complete | — | include | above target |
| 09-06 | 3920 | 183 / 385 / 191 | screenshot log (IMG_2490.jpeg, IMG_2489.png, IMG_2488.jpeg) | 4 meals / 15 foods | full_day_summary; quality complete | duplicate_day_totals (integrity) | **exclude** — duplicate_source_evidence (completeness): same screenshots as 2026-09-05 | above target |
| 09-07 | 2633 | 183 / 243 / 117 | screenshot log (IMG_2364.png, IMG_2363.jpeg, IMG_2362.jpeg) | 4 meals / 16 foods | unknown; quality complete | — | include | near target |
| 09-08 | 2311 | 165 / 223 / 96 | screenshot log (IMG_2519.jpeg, IMG_2518.jpeg) | 4 meals / 11 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-09 | 2256 | 180 / 203 / 82 | screenshot log (IMG_2542.png, IMG_2541.jpeg) | 4 meals / 14 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-10 | 2398 | 179 / 210 / 102 | screenshot log (IMG_2548.jpeg, IMG_2549.jpeg) | 4 meals / 13 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-11 | 2598 | 187 / 195 / 118 | screenshot log (evidence_submission_3DE32D79FEFC4CCEAB1599D25A10B469_images_file_1, evidence_submission_3DE32D79FEFC4CCEAB1599D25A10B469_images_file_2-0) | 4 meals / 7 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-12 | 4190 | 192 / 313 / 239 | screenshot log (Photo 1, Photo 2) | 4 meals / 4 foods | unknown; quality complete | — | include | above target |
| 09-13 | 2285 | 178 / 190 / 103 | screenshot log (Photo 1, Photo 2) | 4 meals / 16 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-14 | 2442 | 182 / 173 / 118 | screenshot log (evidence_submission_0E5F7598A4824F6CAEF0B4915CF6FA7C_images_file_1, Photo 3) | 4 meals / 12 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-15 | 2484 | 181 / 165 / 120 | screenshot log (evidence_submission_D6CF6380A6FE443FB1D99B2218386677_images_file_1, Photo 2) | 4 meals / 13 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-16 | 2664 | 211 / 166 / 133 | screenshot log (evidence_submission_8B65E85DB8FC412F8ABB33C6C4537BF4_images_file_1, Photo 2) | 3 meals / 10 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-17 | 2397 | 197 / 201 / 89 | screenshot log (evidence_submission_2228B6C092D04672910256EBBCBD9EE4_images_file_1, evidence_submission_2228B6C092D04672910256EBBCBD9EE4_images_file_2) | 4 meals / 12 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-18 | 2463 | 191 / 207 / 110 | screenshot log (evidence_submission_F08E88A4E31D49CDA8A29CE93065CE04_images_file_1, Photo 2) | 4 meals / 13 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-19 | 2467 | 157 / 261 / 99 | screenshot log (Photo 1, Photo 2) | 4 meals / 9 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-20 | 3730 | 194 / 400 / 152 | screenshot log (evidence_submission_BA430FAAC28E418089F79EFEB0E8908F_images_file_1, evidence_submission_BA430FAAC28E418089F79EFEB0E8908F_images_file_2) | 4 meals / 7 foods | partial_meal_subtotal; quality complete | — | include | above target |
| 09-21 | 2406 | 178 / 174 / 110 | screenshot log (Photo 1, Photo 2) | 4 meals / 15 foods | partial_meal_subtotal; quality complete | — | include | near target |
| 09-22 | 2406 | 178 / 174 / 109 | HealthKit device aggregate (America/Phoenix), rev 5 | revisions 456→2406→2406→0; 6 source observations | complete_day, full_day_asserted (high) | duplicate_day_totals (integrity) | include | near target; repeated day totals |
| 09-23 | 2677 | 168 / 284 / 213 | HealthKit device aggregate (America/Phoenix), rev 7 | revisions 456→400→1730→2677→2677→0; 8 source observations | complete_day, full_day_asserted (high) | — | include | near target |
| 09-24 | 2415 | 129 / 188 / 96 | HealthKit device aggregate (America/Phoenix), rev 7 | revisions 280→496→1319→2415→2415→0; 8 source observations | complete_day, full_day_asserted (high) | implausible_macro_profile (anomaly vs baseline) | include | near target; low protein |
| 09-25 | 1922 | 72 / 227 / 86 | HealthKit device aggregate (America/Chicago), rev 5 | revisions 1072→1282→1622→1922; 5 source observations | complete_day, full_day_asserted (high) | implausible_macro_profile (anomaly vs baseline) | include | below target; low protein |
| 09-26 | 2915 | 129 / 320 / 131 | HealthKit device aggregate (America/Los_Angeles), rev 3 | revisions 505→2915; 3 source observations | complete_day, full_day_asserted (high) | implausible_macro_profile (anomaly vs baseline) | include | above target; low protein |

**Effect on September:**
- 25 of 26 logged days now count (before: 21).
- Usable-day intake averages **2,735 kcal** (before: 2,796 on 21 days) against the 2,500 target. That is +9%, inside the plan's 10% tolerance, so it reads "a little above the plan's target". Protein averages 176 g.
- A real behavioral pattern now appears: **protein ran well below usual on Sep 24–26**.
- The energy tiles and bars were rebuilt from the same 25 days. The Sep 22–26 week now shows (5 usable days).
- The confirmed-accurate Sep 22 and the high Sep 26 are counted.

## 2. Phase label: authority fixed at its source

- **Root cause.** `MonthlyBriefingPresentationService.activeGoalWindow` **hard-coded the literal `· Phase 1`** (in place since Jul 29). It appended it to whichever phase was active. It was never reading stale Phase 1 history, a wrong selector or a date error. It was a fixed string, and it produced "Lean Mass Build · Phase 1" for every month.
- **Fix.** `phaseLabelOf(goal, activePhase)` takes the phase's position from the Goal's canonical phase list. It sorts by the phase records' own `order`, falling back to start date, so sparse orders are positions, not numbers. The phase is the one active at the month's end (`resolveCommittedPhaseContext`). September now reads **"Lean Mass Build · Phase 2"**; nothing is hard-coded.
- **Month spanning a transition.** The label names the phase active at the month's end, and the Energy card covers that phase's part of the month. For example, August would read "Lean Mass Build · Phase 2", Aug 15–31, which matches the approved format's window. The card's date range is computed from the days it shows.
- **Tests** (`MonthlyPhaseLabel.test.js`):
  - a month entirely in Phase 1;
  - a month entirely in Phase 2;
  - a spanning month;
  - start-date fallback;
  - sparse orders;
  - historical immutability: a stored Monthly keeps "Phase 1", since the projection runs only at first publication.

## 3. Analytical "read" jargon removed

**One shared rule, `BriefingLanguage.ANALYTICAL_READ_JARGON`**, targets the interpret/indicator sense:
- "clearest read", "earliest read";
- "complete enough to read", "easy/hard to read";
- "read the weekly balance", "Early read";
- "the waist reads tighter", "reads as".

Literal reading passes: "can be read on the web", "the scale that read 174 lb", "an authoritative reading of lean mass".

**Where the jargon was removed:**

| Surface | Examples, before → after |
|---|---|
| Shared realizer (every type) | "clearest read" → "clearest indicator"; "earliest read on progress" → "earliest sign of progress"; "complete enough to read" → counted with the reason; "read the weekly balance as directional… steadier read" → "treat the weekly balance as a rough guide… gives a better sense of"; "easy to read" → "clear"; Midweek "Early read:" → "Early days, but"; "make its reading easier to trust" → "make its result easier to trust" |
| Monthly / V3 surface projection | "Energy was a little hard to read" → "hard to judge"; "Composition read point" → "Composition checkpoint" |
| Weekly / Midweek services | "a clearer read on" → "a clearer picture of"; "need to be read together" → "judged together"; "clearest read on your week" → "clearest picture of your week" |
| DEXA | "reading progress into one scan" → "drawing conclusions from one scan"; "lean-tissue reading deserves context" → "result" |
| Photo (event service + interpreter prompt and copy) | "the waist reads tighter" → "looks tighter"; "the useful read" → "the useful takeaway"; "a fuller read" → "a fuller picture"; "clearer read" → "clearer view" |
| Confidence detail (presentation) | "does not replace today's reading" → "today's assessment" |
| Active Goal preview | "will be the real read" → "will show how things are really moving" |

**Guards:**
- **Section and review audits.** The rule runs on every generated section and Monthly module at runtime.
- **Template guard.** It scans the string literals of every in-scope template file.
- **Generated-output property.** 783 realized Midweek, Weekly, Monthly, DEXA and Photo briefings, plus the real September preview, contain no "read", "reads", "readable" or "reading" at all.

**Kept on purpose:**
- **Confidence interpretation text** says "an authoritative *reading*" in the literal measurement sense. That text is hashed into Confidence assessment ids; changing it would change the ids for identical Confidence and could make a retried or regenerated occurrence conflict. The fresh review caught this, and it was reverted.
- **Out of scope:** the Daily briefing web route and an internal lab screen.
- **Native-owned label "Baseline Read":** the fixed callout title on the approved New Baseline card. Changing it needs a Native build (follow-on).


## 4. Regenerated September Monthly (month to date)

- **Boundary:** September 1–26, 2026 (America/Los_Angeles). The latest complete canonical day is **September 26**; 4 days remain. The source is the read-only production export (latest update 2026-09-27T22:49Z), confirmed against production for Sep 21–26.
- **Engine-generated, zero-write, not hand-edited.** The pipeline is the real `prepareMonthlyOccurrence` followed by `publishMonthlyOccurrence({ dryRun: true })`.
- **Confidence and strategy:** 79%, delta 0, `continue_current_strategy`. They are identical with and without the engine, and the assessment id is identical too.
- **Word counts:**
  - review prose: **622** words (086af316: 626). By module: opening 44, Training 74, Energy 102, New Baseline 35, What Changed 140, Defining Moments 106, Month Ahead 121.
  - headline: 7 words;
  - compact Confidence: 19 words.
- **Structural parity with approved August:** all components preserved in the same order. There are **no extra cards and no missing cards** (the mechanical matrix is unchanged from the parity report). The Energy card now shows all four weekly bars.
- **"Read" jargon:** **0** occurrences of read, reads, readable or reading anywhere in the September presentation.

### What changed from 086af316 (every element that differs)

| Card | Element | 086af316 | Now |
|---|---|---|---|
| Energy Evolution | headline | Intake ran above the plan's target on the readable days. | Intake ran a little above the plan's target. |
| Energy Evolution | phase | Lean Mass Build · Phase 1 | Lean Mass Build · Phase 2 |
| Energy Evolution | narrative | Food was logged on all 26 days through September 26, and 21 were complete enough to read. On those days intake averaged about 2,800 calories against a 2,500 target, and protein held around 186 g, close to your usual. September 6, September 22, and September 24 through 26 were too patchy to read and are left out of that average. | Food was logged on all 26 days through September 26. Intake averaged about 2,750 calories against a 2,500 target, and protein averaged around 176 g, close to your usual. Protein ran well below your usual on September 24 through 26, even on days when total intake was at or above target. September 6's record repeats September 5's screenshots, so it is left out of the averages. |
| Energy Evolution | metric tile | Avg intake: 2796 kcal | Avg intake: 2735 kcal |
| Energy Evolution | metric tile | Avg expenditure: 2677 kcal | Avg expenditure: 2654 kcal |
| Energy Evolution | metric tile | Avg balance: 119 kcal | Avg balance: 81 kcal |
| Energy Evolution | metric tile | Balance magnitude: 119 kcal | Balance magnitude: 81 kcal |
| Energy Evolution | callout WHAT IT SHOWS | Expenditure is a wearable estimate, so read the weekly balance as directional; the scale's trend is the steadier read of where intake sits against the work. | Expenditure is a wearable estimate, so treat the weekly balance as a rough guide; the scale's trend gives a better sense of where intake sits against the work. |
| Energy Evolution | weekly bars | — | Sep 22–Sep 26: intake 2467 / expenditure 2552 / balance -85 kcal · 5 observed days |
| What Changed | theme card [training] | TRAINING \| Performance stayed the clearest read. \| Between checks, training is the earliest read on progress: it shows the work moving forward, not what the body is made of. | TRAINING \| Performance stayed the clearest indicator. \| Between checks, training is the earliest sign of progress: it shows the work moving forward, not what the body is made of. |
| What Changed | theme card [energy] | CALORIES \| Intake ran ahead of the plan. \| With the scale already climbing, the calorie number is the one to tighten, not to raise. Days too incomplete to read limit how sure that picture is. | CALORIES \| Intake leaned a little above the plan. \| That is still inside the plan's range, but it is the direction to keep an eye on. A day that couldn't be used limits how sure that picture is. |
| Month Ahead | narrative | Nothing in September argues for changing the plan. October's job is to keep the progress going on a steadier rhythm and a tighter calorie number. | Nothing in September argues for changing the plan. October's job is to keep the progress going on a steadier rhythm. |
| Month Ahead | priority card [energy] | Calories \| Bring intake back down to the target · Hit the target on most days rather than making up for it on one. A complete log every day makes intake the easiest part of October to read. | Calories \| Keep one record per day · A separate record for each day keeps October's intake accurate. |

### Full September Monthly, in Native display order

Rendered through a mirror of `ProductionBriefingMapper.monthly(from:)` and `MonthlyBriefingSections`. Labels marked "(Native)" are fixed Native text.

**Hero (BriefingLeadCard)**

| Element | Content |
|---|---|
| eyebrow | MONTHLY BRIEFING |
| range | September 1–26 |
| confidence | 79% · moderate · No meaningful change — Confidence holds. The September 12 DEXA sets the outlook, and a few off-routine days aren't enough to change it. |
| headline | Real measured progress, but two off-routine stretches. |
| narrative | So far, September has brought measured progress in lean mass on the September 12 DEXA, new training bests across most of the month, and two short off-routine stretches. You are more than halfway to the 10 lb lean-mass goal, with body fat at 8.1%. |
| feature card [baseline/evidence] | Lean mass · +5 lb · September 12 DEXA, since August 15 |
| feature card [training/training] | Training · 12 new bests · 21 training days |
| feature card [weight/primary] | Scale weight · +1.7 lb/week · 26-day trend |
| footer Goal & phase | Lean Mass Build |

**Training Progress**

| Element | Content |
|---|---|
| label | TRAINING PROGRESS |
| headline | Progress was spread across the month. |
| narrative | New bests came on 12 lifts through September 26, and they landed in three of the four weeks rather than in one good week. There were 21 training days, a few fewer than your usual rhythm; the missed days fall within the routine stretches below. |
| stat tile | Plated Chest Fly Machine \| 70 lb \| up from 50 lb · September 18 |
| stat tile | Sumo Squat Machine \| 15 reps at 180 lb \| up from 12 reps · September 10 |
| stat tile | Hyperextension Machine \| 95 lb \| up from 80 lb · September 17 |
| callout WHY IT MATTERS | Progress that lands week after week reflects the program rather than one good session, so it is the pattern October needs to keep. |

**Energy Evolution**

| Element | Content |
|---|---|
| label | ENERGY EVOLUTION |
| headline | Intake ran a little above the plan's target. |
| phase | Lean Mass Build · Phase 2 |
| dates | Sep 1–Sep 26 |
| narrative | Food was logged on all 26 days through September 26. Intake averaged about 2,750 calories against a 2,500 target, and protein averaged around 176 g, close to your usual. Protein ran well below your usual on September 24 through 26, even on days when total intake was at or above target. September 6's record repeats September 5's screenshots, so it is left out of the averages. |
| metric tile | Avg intake: 2735 kcal |
| metric tile | Avg expenditure: 2654 kcal |
| metric tile | Avg balance: 81 kcal |
| metric tile | Balance magnitude: 81 kcal |
| callout WHAT IT SHOWS | Expenditure is a wearable estimate, so treat the weekly balance as a rough guide; the scale's trend gives a better sense of where intake sits against the work. |
| weekly bars | Sep 1–Sep 7: intake 3157 / expenditure 2562 / balance 595 kcal · 6 observed days |
| weekly bars | Sep 8–Sep 14: intake 2640 / expenditure 2732 / balance -92 kcal · 7 observed days |
| weekly bars | Sep 15–Sep 21: intake 2659 / expenditure 2728 / balance -69 kcal · 7 observed days |
| weekly bars | Sep 22–Sep 26: intake 2467 / expenditure 2552 / balance -85 kcal · 5 observed days |

**New Baseline**

| Element | Content |
|---|---|
| label | NEW BASELINE |
| date (right) | September 12, 2026 |
| headline | The September 12 DEXA is the new reference point. |
| metric tile Body Fat | 8.1% |
| metric tile Lean Mass | 153.3 lb |
| metric tile Fat Mass | 14.2 lb |
| metric tile Reference Date | September 12, 2026 |
| narrative | It measured lean mass up 5 lb since August 15, and body fat stayed inside its limit. |
| callout BASELINE READ | The next DEXA will be compared with this one. |

**What Changed**

| Element | Content |
|---|---|
| label | WHAT CHANGED |
| header (Native) | September changed how progress should be judged. |
| theme card [training] | TRAINING \| Performance stayed the clearest indicator. \| Between checks, training is the earliest sign of progress: it shows the work moving forward, not what the body is made of. |
| theme card [energy] | CALORIES \| Intake leaned a little above the plan. \| That is still inside the plan's range, but it is the direction to keep an eye on. A day that couldn't be used limits how sure that picture is. |
| theme card [weight] | WEIGHT \| The scale kept climbing, as the goal expects. \| It can't tell lean mass apart from other weight; the next DEXA will. The weekly average went from about 170 lb in the first week to about 174 lb in the latest, roughly 1.7 lb a week on the recent trend. |
| theme card [routine] | ROUTINE \| Two short stretches, not a pattern. \| Together they cover eight days; outside them the routine held, and wearable activity stayed at its usual level. |

**Defining Moments**

| Element | Content |
|---|---|
| label | DEFINING MOMENTS |
| header (Native) | 4 moments defined September. |
| timeline [routine] | 2026-09-03 \| The first off-routine stretch began \| Calories ran above usual September 3 through 5, the wearable showed less activity September 4 through 7, and training stopped September 5 through 7. |
| timeline [baseline] | 2026-09-12 \| A new DEXA measured progress \| It became the reference point for the next scan, with body fat inside its limit. |
| timeline [training] | 2026-09-18 \| The month's biggest single step in training \| Plated Chest Fly Machine made the largest jump of any lift. |
| timeline [routine] | 2026-09-24 \| The latest off-routine stretch began \| The wearable showed less activity September 24 through 26, and training and weigh-ins stopped September 25 and 26. It runs up to the latest complete day, so whether it has passed isn't known yet. |

**Month Ahead**

| Element | Content |
|---|---|
| label | MONTH AHEAD |
| header (Native) | Turn September's signals into repeatable evidence. |
| narrative | Nothing in September argues for changing the plan. October's job is to keep the progress going on a steadier rhythm. |
| priority card [routine] | Routine \| Get the usual training rhythm back · Protecting the usual training days matters more than any single big week. |
| priority card [training] | Training \| Keep the progression going · Build on the lifts that moved; repeating a best matters as much as beating it. |
| priority card [energy] | Calories \| Keep one record per day · A separate record for each day keeps October's intake accurate. |
| priority card [weight] | Weight \| Watch the weekly weight average · One weigh-in never tells the trend; the weekly average does. |
| priority card [photos] | Photos \| Take a progress set · No photo comparison landed in September; a set on schedule keeps the visual check going. |
| priority card [baseline] | DEXA \| Use the next scan · It is the next direct measurement of the goal. |

### Structural parity matrix (approved August vs September candidate)

| Section | Component | August (approved) | September candidate | Status |
|---|---|---|---|---|
| Hero | Eyebrow MONTHLY BRIEFING + month range | 1 | 1 | **preserved** |
| Hero | Confidence ring, band, movement, explanation | 1 | 1 | **preserved** |
| Hero | Large editorial headline | 1 | 1 | **preserved** |
| Hero | Supporting narrative | 1 | 1 | **preserved** |
| Hero | Feature cards | 3 | 3 | **preserved** |
| Hero | Goal & phase footer | 1 | 1 | **preserved** |
| Training Progress | Section label | 1 | 1 | **preserved** |
| Training Progress | Editorial headline | 1 | 1 | **preserved** |
| Training Progress | Narrative | 1 | 1 | **preserved** |
| Training Progress | Standout stat tiles | 3 | 3 | **preserved** |
| Training Progress | Featured-lift highlight | 0 | 0 | not used by August (no featured-lift data); unchanged |
| Training Progress | WHY IT MATTERS callout | 1 | 1 | **preserved** |
| Energy Evolution | Section label | 1 | 1 | **preserved** |
| Energy Evolution | Editorial headline | 1 | 1 | **preserved** |
| Energy Evolution | Phase label | 1 | 1 | **preserved** |
| Energy Evolution | Phase dates | 1 | 1 | **preserved** |
| Energy Evolution | Narrative | 1 | 1 | **preserved** |
| Energy Evolution | Metric grid (4 tiles) | 4 | 4 | **preserved** |
| Energy Evolution | WHAT IT SHOWS callout | 1 | 1 | **preserved** |
| Energy Evolution | Weekly bar cards (+ Native legend) | 3 | 4 | **preserved** |
| New Baseline | Label + reference date | 1 | 1 | **preserved** |
| New Baseline | Editorial headline | 1 | 1 | **preserved** |
| New Baseline | Metric grid (Body Fat, Lean Mass, Fat Mass, Reference Date) | 4 | 4 | **preserved** |
| New Baseline | Narrative | 1 | 1 | **preserved** |
| New Baseline | BASELINE READ callout | 1 | 1 | **preserved** |
| What Changed | Label + header | 1 | 1 | **preserved** |
| What Changed | Thematic story cards | 3 | 4 | **preserved** |
| Defining Moments | Label + header | 1 | 1 | **preserved** |
| Defining Moments | Dated vertical timeline entries | 4 | 4 | **preserved** |
| Month Ahead | Label + large editorial close | 1 | 1 | **preserved** |
| Month Ahead | Narrative | 1 | 1 | **preserved** |
| Month Ahead | Priority cards | 5 | 6 | **preserved** |

Card order, August: Hero (BriefingLeadCard) → Training Progress → Energy Evolution → New Baseline → What Changed → Defining Moments → Month Ahead.

Card order, September: Hero (BriefingLeadCard) → Training Progress → Energy Evolution → New Baseline → What Changed → Defining Moments → Month Ahead.

Extra cards in September: **none**. Missing cards: **none**.

### Changes caused by the nutrition correction (domain assessments, patterns, synthesis)

- **Nutrition assessment:**
  - usable days 21 → 25;
  - unreliable dates [Sep 6, 22, 24, 25, 26] → [Sep 6];
  - readable-day intake state `above_plan` → `on_plan` (+9%, inside the 10% tolerance, so the copy says "a little above");
  - anomalies: low protein on Sep 24, 25 and 26, and a repeated-totals day on Sep 22.
- **Synthesis:** the `intake_vs_plan` insight stays restrained (one unusable day remains in the window), and the nutrition limitation is still said, now for the right reason.
- **Unchanged:** training, weight, routine, composition, Defining Moments, and the headline and opening.
- **Month Ahead:**
  - the close no longer asks for "a tighter calorie number";
  - the Calories card changes from "Bring intake back down to the target" to "Keep one record per day", because the one unusable day was a reused record, not an intake problem.

## 5. Cross-briefing safety (accepted real previews rerun)

| Briefing | Result | Why |
|---|---|---|
| **Weekly Sep 20–26** | **One change:** What To Do no longer ends with "Thursday through Saturday's food logs were too patchy to read…" | Sep 24–26 now count as complete days, and the sentence was jargon. |
| **Midweek Sep 20–22** | Takeaway "Early read: …" → "Early days, but …". The step changes from "Keep the current setup in place." to "Bring intake back down to the plan's target for the rest of the week." | Jargon, and Sep 22 now counts, so the three-day intake (about 2,850 kcal against 2,500, above tolerance) is usable for the first time. |
| **DEXA Sep 12** | identical | — |
| **Photo Sep 19** | identical | — |

- **Confidence:** every value is identical across all five briefings, **including the assessment ids** (Midweek and Weekly are byte-identical once the hashed "reading" text is kept).
- **Summary:** these diffs are legitimate consequences of corrected canonical inputs and the language rule, and none is silent.

## 6. Review and validation

- **Fresh-context review of `e113c678`: PASS-WITH-FIXES.** It confirmed:
  - completeness and anomaly are separated;
  - no rule excludes a day for being unusual, and none keeps one for being high;
  - the synthetic cases are caught by their intended rules;
  - the phase fix is at the source;
  - structure is unchanged;
  - the Weekly and Midweek diffs are legitimate;
  - there is no causal overreach.

  Its findings were fixed in `7242043f`:
  - **(Medium)** Hashed Confidence wording changed assessment ids. Reverted; ids are identical.
  - **(Medium)** The low-protein clause was always appended. It is now conditional.
  - **(Medium)** "Held to the plan" overstated a +9% average. Now "a little above".
  - **(Medium)** Sparse-day wording assumed an entry count. It now follows the evidence.
  - **(Low)** The duplicate rule could fire on a single shared file. It now needs at least two, with one set containing the other; tests added.
  - **(Low)** Phase position used raw `order`. It now uses the sorted index.
  - **(Low)** The jargon rule wrongly flagged literal uses and missed "reads as". Fixed, and the Active Goal preview line too.
  - **(Low)** Tone and a double mention of Sep 6. Fixed.
- **Tests:**
  - new suites: `BriefingNutritionReliability`, `BriefingLanguage`, `MonthlyPhaseLabel`;
  - updated tests assert the new wording and completeness semantics;
  - Monthly review audit: 0 issues across 270 synthetic months and on the real September.
  - Full repository: - At `e113c678` (the correction commit, before the review fixes): **9,135/9,443 passing, the same 303 environmental failures as the baseline, 0 new.**
  - At `7242043f`, the full run happened while the shared machine was at load 150. It flagged 21 tests, **all timeouts or `STACK_TRACE_ERROR` worker crashes**. Rerun individually:
    - every suite in the changed areas (the Briefing Intelligence suites, the language rule, the synthetic DEXA preview) passes;
    - the production ESM syntax-integrity test passes (it had timed out at 5.9 s against a 5 s limit);
    - the remaining script, subprocess-lock and scheduler-sweep tests are untouched by this change and fail only under load.
  - `node --check` passes on all 20 changed production files.
  - Wider suites (intelligence, services, presentation, Confidence V3, interpreters, briefing routes and screens; about 5,500 tests) show **0 new failures** when run with the machine settled.. Some runs happened while this shared machine hit load 180, where unrelated suites crash with `STACK_TRACE_ERROR`. The final comparison ran after load settled.
- **Determinism:** the September preview is byte-identical across runs, and the claim audit is empty.
- **Immutability:** historical artifacts are untouched. The review projection runs only at first publication; stored Monthlies keep their original format and label.

## Follow-ons (not started)

1. **Surface low-protein runs as a ranked insight in Weekly and Midweek.** They are Monthly-only today. The Sep 20–26 Weekly has three low-protein days and doesn't say so. This would change accepted Weekly and Midweek selection, so it needs its own acceptance.
2. **Spanning-month Energy card.** The tiles and bars cover the active phase's part of the month, while the Energy prose averages over the calendar month. September is unaffected (entirely inside one phase). For a month like August, the prose should say "since the phase began" or use the same window.
3. **Native:** the fixed "Baseline Read" callout label (jargon, Native-owned; next consolidated build). The Daily web briefing and the internal lab screen still use the jargon (out of scope).
4. **Sep 23:** the food app's own macros don't sum to its calories (fat 213 g). The canonical copy is faithful; flagged for the Founder only.
5. **Post-briefing backlog, unchanged:**
   - session-renewal resilience;
   - Face ID evaluation;
   - the Sep 27 Strength notification;
   - Logged Today;
   - the Log-tab shortcut;
   - Mark Skipped;
   - PR celebration;
   - the routine icon;
   - peptide Pause/Resume and dosing UX;
   - the Photo magnitude producer.

## Decision required

**Review the regenerated September Monthly.** If accepted, the cross-briefing candidate `7242043f` is ready for a deploy decision. It includes Midweek, Weekly and DEXA as accepted, the Photo wiring, and this Monthly.
