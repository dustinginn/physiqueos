# Active Goal V3 — Founder content-acceptance preview (production data, read-only)

Generated: 2026-09-26T03:18:06Z
Task id: `claude-active-goal-v3-current-state-coaching-20260925`
Status: **AWAITING FOUNDER CONTENT ACCEPTANCE.** Nothing is deployed; no Build 61 prepared. Do not deploy until the Founder approves this content.

## How this preview was produced

- Server candidate `0a245c5c` (branch `claude/active-goal-v3-server-20260925`; product code identical to the probed `8586950d`) read model, run against **current production data** inside one `REPEATABLE READ READ ONLY` transaction on the live runtime (`09f04dc5`, deployment `e979ee19`), explicit `ROLLBACK`, success marker emitted once after rollback, empty stderr. Probe time 2026-09-26T03:15:30Z.
- Rendered as plain text by mirroring, line for line, the Native candidate `efadb35e` view (`ActiveGoalCurrentStateSections` + `ActiveGoalFormat` in `GoalDetailView.swift`) and, for section B, the installed Build 60 legacy view. `[eyebrow]`, `[title]`, `[pill]`, `[caption]`, `[button]`, `[gauge]` mark visual roles; `›` marks the tappable Confidence row. Every sentence comes from the Server payload; Native only formats numbers/dates.

## A. Build 61 candidate (Native `efadb35e` + Server `0a245c5c`) — full page in screen order

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
[caption] From the Sep 23 Midweek Briefing

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
3 · Where the goal stands — Body Composition
────────────────────────────────────────────────────────────────
             Baseline Jul 18   Latest Sep 12          Change
Lean Mass           147.5 lb        153.3 lb         +5.8 lb
Fat Mass             12.8 lb         14.2 lb         +1.4 lb
Body Fat                7.7%            8.1%        +0.4 pts
Weight              167.4 lb        174.7 lb         +7.3 lb
[caption] DEXA · goal baseline and latest scan

5.8 of 10 lb lean mass gained   58%
[████████████░░░░░░░░]
4.2 lb to go · target Oct 31
[caption] Measured by monthly DEXA

────────────────────────────────────────────────────────────────
4 · Guardrail (card)
────────────────────────────────────────────────────────────────
[eyebrow] Guardrail
[title]   Maintain approximately 8–9% body fat
[pill]    8.1% on Sep 12 DEXA · Within range
Body fat is 8.1%, inside the 8–9% range, while lean mass is up since the goal baseline. The build is adding lean mass without pushing body fat out of range.

────────────────────────────────────────────────────────────────
5 · Since Aug 15 · 38 training days — Training Progress
────────────────────────────────────────────────────────────────
15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down. Training is progressing in a way that supports adding lean mass.
[trophy] Leg Press High And Narrow Feet   +67.2%
[trophy] Leg Extensions   +50.0%
[trophy] Hack Squats   +48.1%
Lower Body: Improving  |  Upper Body: Improving  |  Arms: Improving  |  Core: Steady

────────────────────────────────────────────────────────────────
6 · Latest coaching — Coach's Take
────────────────────────────────────────────────────────────────
[eyebrow] Sep 23 Midweek Briefing · Coach's Take
What To Do
  Keep executing consistently. Keep the current setup in place.
What To Watch
  Treat the calorie estimate as directional: calorie totals come from logged meals rather than a confirmed full-day total, active calories are a wearable estimate, and food and activity were both recorded on 2 of 3 days. Keep calorie targets where they are unless something more than the estimate calls for a change. The next DEXA will show whether this kind of progress continues while body fat stays in a good place.
[button] Open Midweek Briefing

────────────────────────────────────────────────────────────────
7 · Major milestones — Evidence Turning Points
────────────────────────────────────────────────────────────────
Jul 18
  Goal baseline DEXA
  Lean mass measured 147.5 lb at 7.7% body fat. Progress toward the goal is measured from this scan.
Aug 15
  Establish Maintenance completed · Lean Mass Build began
  Establish Maintenance finished. The Aug 15 DEXA measured 148.3 lb of lean mass, +0.8 lb from the goal baseline. That was enough to move forward with confidence — the focus now shifts to Lean Mass Build.
Sep 12
  Past halfway to the lean-mass target
  The Sep 12 DEXA measured 153.3 lb of lean mass, +5.0 lb since the Aug 15 scan and +5.8 lb from the goal baseline. Body fat moved into the 8–9% range at 8.1%.

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

```

## B. Interim: installed Build 60 after a Server-only release of `0a245c5c`

Build 60 keeps its legacy layout (it cannot hide the hard-coded "Goal review comes next" card, the Evidence Anchors card or the Current Strategy grid — only Build 61 removes them), but every fact/sentence it shows is corrected by the Server.

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
Evidence in View: 15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down. Training is progressing in a way that supports adding lean mass.
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
Body fat is 8.1%, inside the 8–9% range, while lean mass is up since the goal baseline. The build is adding lean mass without pushing body fat out of range.
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
15 of 23 comparable movements are improving, led by lower body, upper body and arms. Single-Leg Leg Press is down. Training is progressing in a way that supports adding lean mass.

────────────────────────────────────────────────────────────────
8 · MAJOR MILESTONES — Evidence Turning Points
────────────────────────────────────────────────────────────────
2026-07-18
  Goal baseline DEXA
  Lean mass measured 147.5 lb at 7.7% body fat. Progress toward the goal is measured from this scan.
2026-08-15
  Establish Maintenance completed · Lean Mass Build began
  Establish Maintenance finished. The Aug 15 DEXA measured 148.3 lb of lean mass, +0.8 lb from the goal baseline. That was enough to move forward with confidence — the focus now shifts to Lean Mass Build.
2026-09-12
  Past halfway to the lean-mass target
  The Sep 12 DEXA measured 153.3 lb of lean mass, +5.0 lb since the Aug 15 scan and +5.8 lb from the goal baseline. Body fat moved into the 8–9% range at 8.1%.

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

```

## C. Items for Founder judgment (not changed by this task)

1. **Coach's Take "What To Watch" (Sep 23 Midweek, verbatim):** "calorie totals come from logged meals rather than a confirmed full-day total…" — rendered verbatim per the no-rewrite rule. If this caveat is stale given HealthKit-graduated days, it is a briefing-engine question (the Midweek diagnostic's open day-selection-precedence thread), not a Goal fix.
2. **The Sep 23 Midweek suppressed its Biggest Takeaway** ("Leg Extensions reaching 90 lb…", a second movement not decision-changing), so the Goal shows only What To Do / What To Watch — exactly what the briefing showed.
3. **Confidence sheet "4.2 lb remain with 49 days left"** is stored Sep 23 assessment text (V3 `whatSupportsItNow`); on Sep 26 the true remaining window is 35 days. Shown verbatim; the hero caption dates the source ("From the Sep 23 Midweek Briefing") but the sheet itself does not. Options: accept; or add an "As of Sep 23" line to the sheet (Native label only); the next V3 publication (Weekly, Sep 27) refreshes it.
4. **Phase-transition turning point** keeps the existing milestone copy "That was enough to move forward with confidence — the focus now shifts to Lean Mass Build." (only its arithmetic was fixed: +0.8 lb, not +5.8 lb).
5. **"Measured by monthly DEXA"** cadence caption and **"Started Aug 15 · Monthly DEXA"** phase dates replace the former "Monthly review" / "Strategic Review" language.
6. **Training highlights** are the top three improving movements by volume-load change since Aug 15 (all personal records); "Core: Steady" rests on one comparable movement.

Approve, or list edits, before any deployment.
