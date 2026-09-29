# Active Goal V3 — Round-2 Founder content-acceptance preview (production data, read-only)

Generated: 2026-09-26T03:58:10Z
Task id: `claude-active-goal-v3-content-architecture-round2-20260925` (continues `claude-active-goal-v3-current-state-coaching-20260925`)
Status: **AWAITING FOUNDER CONTENT ACCEPTANCE (round 2).** Nothing deployed; no Build 61 prepared.

## How this preview was produced

- Server candidate `2a23eee7` (branch `claude/active-goal-v3-server-20260925`) read model run against **current production data** in one `REPEATABLE READ READ ONLY` transaction on the live runtime `09f04dc5` (deployment `e979ee19`), explicit `ROLLBACK`, success marker once after rollback, empty stderr. Probe time 2026-09-26T03:56:59Z.
- Rendered as plain text by mirroring Native candidate `fb4df07d` (`ActiveGoalCurrentStateSections` + `ActiveGoalFormat` in `GoalDetailView.swift`, `ConfidenceDetailSheet`) line for line. `[eyebrow]`, `[title]`, `[pill]`, `[caption]`, `[button]`, `[gauge]`, `[provenance]` mark visual roles; `›` marks the tappable Confidence row. Every sentence is a Server field; Native formats numbers/dates and supplies labels only.

## A. Build 61 candidate — full page in screen order (Coach's Take last)

```text

────────────────────────────────────────────────────────────────
1 · Hero (Active Goal card)
────────────────────────────────────────────────────────────────
[eyebrow] Active Goal
[title]   Build Lean Mass
Build 10 lb of lean mass by October 31, 2026
[edit pencil button when writes are permitted]
— divider —
[gauge] 79% · Moderate  ›
You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.
[caption] As of the Sep 23 Midweek Briefing

────────────────────────────────────────────────────────────────
2 · The path — Your Journey
────────────────────────────────────────────────────────────────
[1] Phase 1  ·  Completed
    Establish Maintenance
    Started Jul 19 · Completed
[2] Phase 2  ·  Active
    Lean Mass Build
    Started Aug 15 · Monthly DEXA
Build meaningful lean mass from the newly established maintenance baseline while protecting body composition.

────────────────────────────────────────────────────────────────
3 · Current progress — Body Composition
────────────────────────────────────────────────────────────────
             Baseline Jul 18   Latest Sep 12          Change
Lean Mass           147.5 lb        153.3 lb         +5.8 lb
Fat Mass             12.8 lb         14.2 lb         +1.4 lb
Body Fat                7.7%            8.1%        +0.4 pts
Weight              167.4 lb        174.7 lb         +7.3 lb
[caption] DEXA · goal baseline and latest scan

Goal progress   58%
[████████████░░░░░░░░]
4.2 lb to go
[caption] Measured by monthly DEXA

────────────────────────────────────────────────────────────────
4 · Guardrail (card)
────────────────────────────────────────────────────────────────
[eyebrow] Guardrail
[title]   Maintain approximately 8–9% body fat
[pill]    8.1% · Within range
Inside the range, so the guardrail is not limiting the build.

────────────────────────────────────────────────────────────────
5 · Since Aug 15 · 38 training days — Training Progress
────────────────────────────────────────────────────────────────
15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down.
[trophy] Leg Press High And Narrow Feet   +67.2%
[trophy] Leg Extensions   +50.0%
[trophy] Hack Squats   +48.1%

────────────────────────────────────────────────────────────────
6 · Major milestones — Evidence Turning Points
────────────────────────────────────────────────────────────────
Jul 18
  Goal baseline DEXA
  The starting point every later scan is measured against.
Aug 15
  Establish Maintenance completed · Lean Mass Build began
  Establish Maintenance was completed and Lean Mass Build began. The Aug 15 DEXA showed +0.8 lb of lean mass from the baseline.
Sep 12
  Past halfway to the lean-mass target
  Lean mass rose 5.0 lb in the month since the Aug 15 scan, and body fat moved into the guardrail range.

────────────────────────────────────────────────────────────────
7 · Latest coaching — Coach's Take  (last section)
────────────────────────────────────────────────────────────────
[eyebrow] Sep 23 Midweek Briefing · Coach's Take
What To Do
  Keep executing consistently. Keep the current setup in place.
What To Watch
  Treat the calorie estimate as directional: calorie totals come from logged meals rather than a confirmed full-day total, active calories are a wearable estimate, and food and activity were both recorded on 2 of 3 days. Keep calorie targets where they are unless something more than the estimate calls for a change. The next DEXA will show whether this kind of progress continues while body fat stays in a good place.
[button] Open Midweek Briefing

────────────────────────────────────────────────────────────────
TAP ON CONFIDENCE → Confidence detail sheet
────────────────────────────────────────────────────────────────
Why confidence is 79%
The evidence currently supporting and limiting the overall trajectory.
[provenance] As of the Sep 23 Midweek Briefing
Current confidence: Moderate
You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.
What supports confidence
  • You added 5.0 lb of lean mass since August 15.
  • Body fat stayed controlled at 8.1%.
  • 4.2 lb remain with 49 days left.
What limits confidence
  • One excellent response does not guarantee the same result until the next DEXA.

```

## B. Dedupe map — every number on the PRIMARY page (above the tap-through sheet) and where it appears

Generated from the rendered page above (phase numbers, days of month and years excluded; "15 of 23" and "38 training days" appear once, in Training).

```text
     10 lb  x2  1 · Hero (Active Goal card) | 1 · Hero (Active Goal card)
      8.1%  x2  3 · Current progress — Body Composition | 4 · Guardrail (card)
  +0.4 pts  x1  3 · Current progress — Body Composition
   +0.8 lb  x1  6 · Major milestones — Evidence Turning Points
   +1.4 lb  x1  3 · Current progress — Body Composition
    +48.1%  x1  5 · Since Aug 15 · 38 training days — Training Progress
   +5.8 lb  x1  3 · Current progress — Body Composition
    +50.0%  x1  5 · Since Aug 15 · 38 training days — Training Progress
    +67.2%  x1  5 · Since Aug 15 · 38 training days — Training Progress
   +7.3 lb  x1  3 · Current progress — Body Composition
   12.8 lb  x1  3 · Current progress — Body Composition
   14.2 lb  x1  3 · Current progress — Body Composition
  147.5 lb  x1  3 · Current progress — Body Composition
  153.3 lb  x1  3 · Current progress — Body Composition
  167.4 lb  x1  3 · Current progress — Body Composition
  174.7 lb  x1  3 · Current progress — Body Composition
    3 days  x1  7 · Latest coaching — Coach's Take  (last section)
    4.2 lb  x1  3 · Current progress — Body Composition
    5.0 lb  x1  6 · Major milestones — Evidence Turning Points
       58%  x1  3 · Current progress — Body Composition
      7.7%  x1  3 · Current progress — Body Composition
       79%  x1  1 · Hero (Active Goal card)
        9%  x1  4 · Guardrail (card)

```

Only two numbers appear twice, both by design:
- **8.1%** — the Latest column of the composition table and the guardrail pill. The round-2 rule allows the guardrail to show the reading because its status depends on it; the pill no longer repeats the scan date.
- **10 lb** — the hero destination and the canonical V3 thesis ("…halfway to the 10 lb lean-mass goal"), which is shown verbatim and never rewritten.

Everything else appears exactly once:
- +5.8 lb, 58% and 4.2 lb to go only in Current progress;
- +0.8 lb only in the Aug 15 milestone;
- +5.0 lb only in the Sep 12 milestone;
- 79% only in the hero.

## C. Round-2 changes vs round 1

- **Coach's Take is the last section**, after Turning Points ("given everything above, here is the latest coaching").
- **Current Progress:** "Goal progress 58%" + bar + "4.2 lb to go". It no longer restates "5.8 of 10 lb", which is in the table's Change column, or the target date, which is in the hero.
- **Guardrail:** pill "8.1% · Within range", then one line: "Inside the range, so the guardrail is not limiting the build." No restated lean-mass or progress numbers.
- **Training:** "15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down."
  - The goal-thesis conclusion ("…supports adding lean mass") is removed.
  - The region chips are removed; they duplicated the sentence.
- **Turning points are concise:**
  - Jul 18: "The starting point every later scan is measured against."
  - Aug 15: keeps its unique +0.8 lb.
  - Sep 12: "Lean mass rose 5.0 lb in the month since the Aug 15 scan, and body fat moved into the guardrail range."
  - None of them repeats 147.5 / 153.3 / +5.8 / 8.1%.
- **Confidence sheet:** "As of the Sep 23 Midweek Briefing" sits at the top of the sheet, from publisher metadata; the date is not hard-coded. The stored "4.2 lb remain with 49 days left" is kept verbatim and is now explicitly dated to that assessment. The hero caption uses the same label.

## D. Coach's Take "logged meals" sentence — diagnosed

- **Source.** The Sep 23 Midweek What To Watch clause "calorie totals come from logged meals rather than a confirmed full-day total" comes from the V3 `energy_intake_uncertainty` vocabulary. It fires for `meal_derived_unverified` nutrition days. Proven read-only on production:
  - Sep 20 and Sep 21 are pre-graduation MyFitnessPal meal-log days. HealthKit graduation starts Sep 22; Sep 21's complete HealthKit day was out of scope.
  - Sep 22–24 are Apple Health full-day totals with no ambiguity.
  - The Sep 23 sentence was therefore accurate for its window (Sep 22 had no data yet at generation). **It stays verbatim; the historical artifact is immutable.**
- **Live engine defect, fixed in `6fe25d5e` + `2a23eee7`.** The clause was not coverage-aware. The upcoming Weekly (Sep 20–26: 2 meal-log days, 5 HealthKit days) would have claimed that all calorie totals came from logged meals, and would have tempered the estimate through the wearable item. Now:
  - A minority of meal-derived days is low-materiality: not surfaced, no tempering, no Energy caveat. That is the same as an all-HealthKit week.
  - A majority names its share ("on 4 of the 7 days with calorie totals, …").
  - Windows where every day is meal-derived keep the established wording, so historical replays are unchanged.
  - Missing, partial or conflicting totals are still high.
  - Future Midweeks (Sep 27+) are all HealthKit days and carry no meal-log language.
- The Goal page shows the **canonical Sep 23 Coach's Take verbatim**. That is the actual latest published briefing; the Goal does not rewrite it locally.

## E. Build 60 interim (Server `2a23eee7` released before Build 61)

Build 60 keeps its hard-coded legacy layout (Goal review card, Evidence Anchors, strategy grid) but every Server-owned fact and sentence is corrected. Its sheet ends with "As of the Sep 23 Midweek Briefing."

```text

────────────────────────────────────────────────────────────────
1 · HERO
────────────────────────────────────────────────────────────────
[eyebrow] Active Goal
[title]   Build Lean Mass
Build 10 lb of lean mass by October 31, 2026
— divider —
[gauge] 79% · Moderate  ›      Build 10 lb of lean mass by October 31, 2026
You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.

────────────────────────────────────────────────────────────────
2 · THE PATH — Your Journey
────────────────────────────────────────────────────────────────
[1] Phase 1  ·  Completed
    Establish Maintenance
    Started Jul 19 · Completed
    Completed   100%
[2] Phase 2  ·  Active
    Lean Mass Build
    Started Aug 15 · Monthly DEXA
    5.8 of 10 lb gained   58%

────────────────────────────────────────────────────────────────
3 · WHERE YOU ARE — Current Phase
────────────────────────────────────────────────────────────────
Lean Mass Build
Build meaningful lean mass from the newly established maintenance baseline while protecting body composition.
Goal Progress: 58%     Strategic Review: Monthly DEXA
Evidence in View: 15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down.
What's Next: Body composition progress is measured by monthly DEXA.

────────────────────────────────────────────────────────────────
4 · WHAT'S NEXT — Goal review comes next  (hard-coded Build 60 card)
────────────────────────────────────────────────────────────────
  (no bullet items — Server sends none for the final phase)

────────────────────────────────────────────────────────────────
5 · NON-NEGOTIABLE — Guardrail
────────────────────────────────────────────────────────────────
Maintain approximately 8–9% body fat
Applies across every phase
Inside the range, so the guardrail is not limiting the build.
[pill] 8.1% on Sep 12 DEXA — within the 8–9% range

────────────────────────────────────────────────────────────────
6 · WHAT PROGRESS MEANS — Evidence Anchors
────────────────────────────────────────────────────────────────
Goal Progress 58%   |   Remaining 42%
Goal baseline DEXA · 2026-07-18
Body Fat 7.7%   Lean Mass 147.5 lb   Fat Mass 12.8 lb   Weight 167.4 lb
Weight and energy
Weight has been trending up, consistent with the plan. The current targets are 2,500 kcal/day intake and 800 kcal/day activity. DEXA is still what ultimately confirms body composition, not scale weight alone.

────────────────────────────────────────────────────────────────
7 · LONG-TERM PERFORMANCE — Training Progress
────────────────────────────────────────────────────────────────
Server-derived      Monthly DEXA
15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down.

────────────────────────────────────────────────────────────────
8 · MAJOR MILESTONES — Evidence Turning Points
────────────────────────────────────────────────────────────────
2026-07-18
  Goal baseline DEXA
  The starting point every later scan is measured against.
2026-08-15
  Establish Maintenance completed · Lean Mass Build began
  Establish Maintenance was completed and Lean Mass Build began. The Aug 15 DEXA showed +0.8 lb of lean mass from the baseline.
2026-09-12
  Past halfway to the lean-mass target
  Lean mass rose 5.0 lb in the month since the Aug 15 scan, and body fat moved into the guardrail range.

────────────────────────────────────────────────────────────────
9 · HOW THE GOAL IS SUPPORTED — Current Strategy  (Build 60 only)
────────────────────────────────────────────────────────────────
[Energy: Goal support]  [Nutrition: Goal support]  [Activity: Goal support]  [Training: Goal support]  [Coaching Updates: Goal support]  [Peptide: Goal support]  [Supplement: Goal support]
[button] Review Strategy
[button] Review Protocols

────────────────────────────────────────────────────────────────
TAP ON CONFIDENCE → Confidence detail sheet
────────────────────────────────────────────────────────────────
Why confidence is 79%
The evidence currently supporting and limiting the overall trajectory.
Current confidence: Moderate
You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.
What supports confidence
  • You added 5.0 lb of lean mass since August 15.
  • Body fat stayed controlled at 8.1%.
  • 4.2 lb remain with 49 days left.
What limits confidence
  • One excellent response does not guarantee the same result until the next DEXA.
[As of the Sep 23 Midweek Briefing.]

```

Approve, or list edits, before any deployment.
