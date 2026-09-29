# Monthly structural parity: September month-to-date candidate vs the approved August Monthly

- **Instruction:** Founder, 2026-09-28 — "verify structural/presentation parity against the August Monthly screenshots".
- **Agent:** claude · **Status: parity candidate ready for Founder/ChatGPT review. Not deployed, not published.**
- **Server candidate:** **`086af316`** on `codex/weekly-v3-weekly-pattern-narrative`. It builds on `15b6e447` with two new commits: `4587b2aa`, which projects the review into the approved skeleton, and `086af316`, which applies the parity-review fixes.
- **What did not happen:** no deploy, no September Monthly published, no August regeneration, no production write, no Native build, no auth/notification/Photo/Sleep work.

## Reference used

- **Screenshots:** the 11 Founder screenshots of the approved August Monthly, taken in the Native Sandbox.
- **Served artifact:** the screenshots render the **served August Monthly artifact** exactly: the same training tiles, the Energy "Aug 15–Aug 31" window at −199 kcal, and moment dates "2026-08-15". The raw ISO dates on the timeline show they came through Native's **production** mapper, `ProductionBriefingMapper.monthly(from:)`, and `MonthlyBriefingSections` (Build 68, `537f538b`). The Sandbox fixture has different content and date labels.
- **Consequence:** that artifact plus that mapper **is** the approved format, and it is the exact path a September Monthly will take.
- **Native Monthly in production:** as the Founder notes, production Native has never rendered a Monthly. The candidate targets the same mapper, which the screenshots show working.

## Verdict

The September candidate renders **the same seven cards in the same order, with the same components and field shapes**, as the approved August Monthly:

**Hero → Training Progress → Energy Evolution → New Baseline → What Changed → Defining Moments → Month Ahead.**

There are **no extra cards**. The V3 strategic card and the uncertainty card, which the previous candidate added, are gone. There are **no missing cards**: Defining Moments is restored and driven by canonical evidence.

The only intentional content-density change is the **compact Confidence** line.

## What changed versus the previous candidate (`15b6e447`)

| Previous candidate | Now |
|---|---|
| **Defining Moments omitted** | **Restored.** The engine picks the month's defining dated events from canonical evidence: a new measurement, each routine stretch, the largest single lift step, new photos. It ranks them by weight, keeps at most four, and shows them in date order with ISO dates, as approved. |
| **What Changed** held dated routine stretches | **Thematic story cards per domain, as approved:** Training, Calories, Weight, Routine, plus Recovery when its assessor has evidence. Each says how that evidence should now be judged. The dated stretches moved to Defining Moments. |
| **Extra V3 strategic (Coach's Take) card and uncertainty card** after the hero | **Removed:** the approved Monthly has neither. The strategy call now opens the Month Ahead narrative. The canonical V3 narrative stays at `briefing.narrativeV3`. |
| **Month Ahead** cards labelled Priority / Watch / Next evidence | **Domain-labelled priority cards, as approved:** Routine, Training, Calories, Weight, Photos, DEXA, each rendered as "value · detail". |
| **New Baseline** carried the scale trend | **The scan's card, as approved.** The scale's numbers moved to the Weight theme, as the approved Weight theme carried them. |
| **Energy phase label** stripped of "· Phase 1" | **The approved label, verbatim.** |
| **Native detail and review routes** re-expanded the compact Confidence line | **Stored compact line on every read path:** Native, web and review. |
| **Legacy editorial narrative** stored beside the review | **Removed.** `monthlyNarrative` keeps only the review's title and thesis; legacy `selectedPerformanceStories` is dropped. |

## Component parity matrix

Counts are the elements Native renders for each component, derived mechanically from the Native mapper mirror for both artifacts.

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
| Energy Evolution | Weekly bar cards (+ Native legend) | 3 | 3 | **preserved** |
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

### Status of every component

**Preserved:** every component that exists in August (see the matrix). Counts differ only where the evidence differs:
- What Changed has **4 theme cards** (August had 3). September has a routine story (two off-routine stretches) that August lacked.
- Month Ahead has **6 priority cards** (August had 5). A Routine priority is added, again from the routine stretches.
- There are **3 weekly energy bars** (August had 3).

**Dynamically omitted, because the evidence cannot support them:**
- **Goal Milestone:** no milestone was reached (the same as August).
- **Featured-lift highlights:** none in the approved format's data either.
- **The 4th weekly energy bar (Sep 22–26):** only one readable day that week. A single day is not shown as a weekly average. Native drops the card; web shows a missing placeholder. The Energy narrative names the excluded days.

**Still discrepant (Low, none structural):**
1. **Generic icon on routine cards.** The `routine` tone has no dedicated Native icon, so it renders the generic sparkles icon on two timeline entries, one What Changed card and one Month Ahead card. August's Calories theme card also rendered sparkles. *Native follow-up, not required:* add a `routine` icon.
2. **Month-to-date label.** "Month to date" appears only on web. Native shows the range "September 1–26", which itself signals month to date. This affects the preview only; the Oct 1 Monthly is a closed month.
3. **Hero feature-card colours.** The tones are evidence / effort / primary; August's were effort / evidence / success. Same component, colour only.

**Cannot be established from source alone:**
- how six Month Ahead cards and four What Changed cards wrap on screen;
- how a positive energy balance (+119 kcal) looks in the tiles and bars.

## Full September month-to-date Monthly, in Native display order

This is engine-generated, zero-write, and not hand-edited, for September 1–26 with 4 days remaining. It is rendered through a mirror of `ProductionBriefingMapper.monthly(from:)` and `MonthlyBriefingSections`. Labels marked "(Native)" are fixed Native text.


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
| headline | Intake ran above the plan's target on the readable days. |
| phase | Lean Mass Build · Phase 1 |
| dates | Sep 1–Sep 26 |
| narrative | Food was logged on all 26 days through September 26, and 21 were complete enough to read. On those days intake averaged about 2,800 calories against a 2,500 target, and protein held around 186 g, close to your usual. September 6, September 22, and September 24 through 26 were too patchy to read and are left out of that average. |
| metric tile | Avg intake: 2796 kcal |
| metric tile | Avg expenditure: 2677 kcal |
| metric tile | Avg balance: 119 kcal |
| metric tile | Balance magnitude: 119 kcal |
| callout WHAT IT SHOWS | Expenditure is a wearable estimate, so read the weekly balance as directional; the scale's trend is the steadier read of where intake sits against the work. |
| weekly bars | Sep 1–Sep 7: intake 3157 / expenditure 2562 / balance 595 kcal · 6 observed days |
| weekly bars | Sep 8–Sep 14: intake 2640 / expenditure 2732 / balance -92 kcal · 7 observed days |
| weekly bars | Sep 15–Sep 21: intake 2659 / expenditure 2728 / balance -69 kcal · 7 observed days |

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
| theme card [training] | TRAINING \| Performance stayed the clearest read. \| Between checks, training is the earliest read on progress: it shows the work moving forward, not what the body is made of. |
| theme card [energy] | CALORIES \| Intake ran ahead of the plan. \| With the scale already climbing, the calorie number is the one to tighten, not to raise. Days too incomplete to read limit how sure that picture is. |
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
| narrative | Nothing in September argues for changing the plan. October's job is to keep the progress going on a steadier rhythm and a tighter calorie number. |
| priority card [routine] | Routine \| Get the usual training rhythm back · Protecting the usual training days matters more than any single big week. |
| priority card [training] | Training \| Keep the progression going · Build on the lifts that moved; repeating a best matters as much as beating it. |
| priority card [energy] | Calories \| Bring intake back down to the target · Hit the target on most days rather than making up for it on one. A complete log every day makes intake the easiest part of October to read. |
| priority card [weight] | Weight \| Watch the weekly weight average · One weigh-in never tells the trend; the weekly average does. |
| priority card [photos] | Photos \| Take a progress set · No photo comparison landed in September; a set on schedule keeps the visual check going. |
| priority card [baseline] | DEXA \| Use the next scan · It is the next direct measurement of the goal. |

## Server versus Native ownership

| Section | Server supplies (engine-driven) | Native supplies (fixed) | Native change needed for parity |
|---|---|---|---|
| Hero | headline; narrative; feature cards (label, value, detail, icon, tone); goal footer; Confidence block (score, band, movement label, **compact explanation**) | eyebrow "MONTHLY BRIEFING", range from `hero.period`, confidence ring layout | none |
| Training Progress | headline; narrative; stat tiles; Why It Matters text | label "TRAINING PROGRESS", callout title "Why It Matters", tile layout | none |
| Energy Evolution | headline; phase label and dates; narrative; 4 metric values (readable days in the window); What It Shows text; weekly bars (readable days; weeks with fewer than 3 are hidden) | label, callout title "What It Shows", legend, bar rendering | none |
| New Baseline | headline; metric grid values; narrative; Baseline Read text | label "NEW BASELINE", callout title, grid labels | none |
| What Changed | theme cards (label, headline, story, tone) | label, header "<Month> changed how progress should be judged.", icons by tone | optional `routine` icon |
| Defining Moments | timeline entries (ISO date, title, story, tone) | label, header "N moments defined <Month>.", vertical timeline, icons | optional `routine` icon |
| Month Ahead | narrative (strategy call + the coming month's job); priority cards (label, value, detail, tone) | label, header "Turn <Month>'s signals into repeatable evidence.", card grid | none |

**No Native change is required for exact structural parity.**

## Proof: canonical evidence, not legacy template copy

- **Defining Moments** come from the shared evidence picture only. They are tested deterministically over 270 synthetic months plus month-to-date windows. Each entry is earned by a canonical fact:
  - **2026-09-03:** the routine-shift characterization (Sep 3–7);
  - **2026-09-12:** the body-composition measurement date;
  - **2026-09-18:** the top training milestone's `observedAt`, Plated Chest Fly, the largest relative gain (+40%);
  - **2026-09-24:** the routine shift (Sep 24–26), which reaches the through-date.

  A test asserts moments are in date order, inside the window, at most four, each tied to a canonical ID, and never contain the legacy template phrases (for example "steady physique", "established the starting point").
- **Prose provenance:** a mechanical check compared every prose string in the September presentation (42 strings of five words or more, excluding the Confidence snapshot) with the legacy editorial output for the same window. **Zero legacy sentences survive.** The one shared string is the Month Ahead skeleton header, which Native renders as fixed text anyway. All 42 trace to the shared engine's review modules.
- **Truthfulness:** the fresh-context reviewer checked every figure against the evidence picture and found all of them consistent. Checked items:
  - 12 bests, in 3 of 4 weeks;
  - 21 training days against a usual 25.5;
  - 26 logged days, 21 readable;
  - intake 2,796 against a 2,500 target;
  - protein 186 g;
  - the excluded dates;
  - the 5-day and 3-day stretches;
  - a 1.68 lb/week trend, with weekly averages 170.2 → 174.2 lb;
  - DEXA +5 lb lean mass, 8.1% body fat;
  - no photo comparison this month.

## Proof: the shared Briefing Intelligence is the only intelligence source

- **Every module is realized from the shared picture and synthesis.** Each module is produced by `realizeReview` in `v3/HolisticNarrativeV3.js` from `BriefingEvidencePicture` (domain assessments) and `BriefingHolisticSynthesis`. It runs under `REVIEW_CONTRACTS.monthly` in `shared/BriefingSectionContracts.js`, which is the approved skeleton.
- **The legacy Monthly preview service still runs, but only as a data supplier:**
  - base data: the energy days that drive the rebuilt bars, the DEXA metric grid, the phase label, the hero goal label;
  - the Confidence-side cross-source observations, which are unchanged.

  **None of its prose or judgments reach the page.** `MonthlyReviewPresentationService` replaces every prose field, removes cards the review did not earn, and drops the legacy narrative sub-objects.
- **Confidence and strategy are independent of the engine:** 79%, delta 0, `continue_current_strategy`, identical with and without it.

## Validation

- **Tests:**
  - Briefing Intelligence plus Monthly presentation suites: **521/521** pass. They include a new skeleton-parity test (module order, card shapes, unique identities), a Defining Moments evidence test, and a compact-Confidence read-path test.
  - Full repository at `086af316`: **9116/9424** pass, the same 303 environmental failures as the baseline, **0 new**.
- **Deterministic review audit** (budgets, one quantity per module, no story sentence repeated across modules, claim restraint, compact Confidence): **0 issues** across 270 synthetic months, and 0 on the real September preview (647 prose words; August's approved prose was about 660).
- **Other briefing types:**
  - The synthetic corpus shows Midweek, Weekly, DEXA and Photo at **0/540** changed each against `f563e1eb`.
  - The real Sep 20–26 Weekly, Sep 20–22 Midweek, Sep 12 DEXA and Sep 19 Photo previews are byte-identical.
- **Determinism:** the September preview is byte-identical across runs, and the claim audit is empty.

## Fresh-context review

**Parity review of `4587b2aa`: PASS-WITH-FIXES.** Structure, order, field shapes and identities all match August exactly. The findings, all fixed in `086af316`:
- **(High)** The Native detail and review routes re-expanded the compact Confidence line.
- **(Medium)** Legacy editorial narrative was still stored in the artifact.
- **(Medium)** "More than halfway" versus the "+5 lb" feature card could read inconsistently. No change was made here: both are true, since the goal is measured from its own baseline, but it is flagged for Founder copy review.
- **(Low)** Null guards were missing.
- **(Low)** Repetition of the scale-as-pace point.

Earlier rounds on this candidate line are recorded in the prior reports.

## Decisions required

1. **Accept or refine the September Monthly** in the approved format. If accepted, the cross-briefing candidate `086af316` is ready for a deploy decision.
2. **Optional Native follow-up** for the next consolidated build: a `routine` icon.
