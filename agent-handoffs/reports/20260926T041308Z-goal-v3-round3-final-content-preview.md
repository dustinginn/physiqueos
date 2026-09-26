# Active Goal V3 — Round-3 FINAL Founder content preview (production data, read-only)

Generated: 2026-09-26T04:13:08Z
Task id: `claude-active-goal-v3-round3-final-content-20260925`
Status: **FINAL FOUNDER CONTENT GATE.** Nothing deployed; no Build 61 prepared.

## How this preview was produced

- **Server data:** Server candidate `2a23eee7`, unchanged from round 2, run against **current production data** in one `REPEATABLE READ READ ONLY` transaction on the live runtime `09f04dc5` (deployment `e979ee19`). The probe ran at 2026-09-26T04:09:54Z with an explicit `ROLLBACK`, the success marker emitted once after rollback, and empty stderr. The `currentState` payload is byte-identical to the round-2 probe.
- **Rendering:** mirrors Native candidate `efcb8574` (`ActiveGoalCurrentStateSections` + `ActiveGoalFormat`) line for line.
- **Visual-role tags:** `[eyebrow]`, `[title]`, `[pill]`, `[caption]`, `[button]`, `[gauge]`.
- **Round-3 change:** Confidence is display-only. The page has no chevron, no tap target and **no Confidence detail sheet**; this preview contains no sheet section.
- **VoiceOver:** reads the Confidence block as one static element: "Confidence 79 percent, Moderate. You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues. As of the Sep 23 Midweek Briefing."

## A. Build 61 active Goal — complete page in screen order

```text

────────────────────────────────────────────────────────────────
1 · Hero (Active Goal card)
────────────────────────────────────────────────────────────────
[eyebrow] Active Goal
[title]   Build Lean Mass
Build 10 lb of lean mass by October 31, 2026
[edit pencil button when writes are permitted]
— divider —
[gauge] 79% · Moderate   (display-only: no chevron, not tappable)
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

```

## B. Primary-page dedupe map (every number on the page and where it appears)

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

Only two numbers appear twice, both by design, as in round 2:
- **8.1%** appears in the composition table and in the guardrail pill, because the guardrail status depends on the reading.
- **10 lb** appears in the goal destination and in the canonical V3 thesis, which is shown verbatim.

The detailed Confidence evidence is not on the page anywhere. That covers supports, limits, could-raise, could-lower, assumptions and "4.2 lb remain with 49 days left". The evidence stays in the Server contract.

## C. Unchanged from round 2

- **Section order:** Hero → Journey → Current progress → Guardrail → Training → Turning points → Coach's Take (last).
- **Section content:** Body Composition, Guardrail, Training and Turning-point copy are identical to round 2.
- **Coach's Take:** the canonical Sep 23 Midweek Coach's Take is shown verbatim. Its meal-log wording was accurate for that pre-graduation window, and the artifact is immutable.
- **Briefing engine:** the prospective coverage-aware intake-completeness fix in Server `2a23eee7` is preserved. The next naturally published briefing becomes the Goal's Coach's Take automatically.

Approve, or list edits. On approval, the release decision follows.
