# Goals and Phase editors, plus design tokens: PhysiqueOS iOS Build 94 (`498297815a3e`)

This is a read-only audit. Everything was read with `git show` / `git grep` at the release commit, which this condensed record summarizes. All paths are relative to `ios/PhysiqueOS/`.

## Key findings

1. **Every Goal and Phase editor is sandbox-only.**
   - Edit, Add Goal (transition), protocol transition and Phase Review all write to the in-memory `GoalsSandboxStore`, which is backed by `Resources/GoalsFixture.json`.
   - The production `GoalsAPI` has 4 GET reads and no writes.
   - Production hides the entry points:
     - Edit Goal and Review Phase Transition are gated by `permitsProductWrites`, which is true only for `.sandbox`.
     - The router blocks `.goalPhaseTransition` with "Phase transitions are not available in Native production."
     - The hub sets `addGoalAvailable: false`.
2. **Missing from the editors:**
   - No numeric target, unit or type controls.
   - No phase type, duration or completion mode (time/outcome/hybrid).
   - No structured body-fat range or firm/flexible flag. Guardrails are free-text list items.
   - No review-checkpoint editor.
   - No unsaved-changes prompt anywhere.

   Some of these exist in the model but nothing in Presentation renders them:
   - `GoalTargetReadModel` has `type`, `metric`, `direction`, `amount`, `targetValue` and `unit`.
   - `GoalPhaseTimingMode` has `fixed_duration` / `target_date` / `completion_criteria`.
3. **The protocol category editor does not cascade into the Operating Plan.**
   - Its drafts are stored and flagged `edited`.
   - Activation turns protocol reviews into strategy label/active pairs only.
   - The only Goals → Operating Plan write is the sandbox Phase Review Energy Strategy (`establishPhaseEnergyStrategy`).

## Goal Edit Wizard (`Presentation/Goals/GoalEditWizardView.swift`)

**Chrome:** `ProtocolBuilderShell` with eyebrow "GOAL EDIT", "Step X of N" and a progress bar. The buttons are Back and Continue, where Continue becomes "Save changes" on the last step.

**Step 1:** "What would you like to edit?" Multi-select:
- Goal and purpose
- Phases
- Overall goal
- Success criteria
- Guardrails
- Coaching preferences

**One step per selected section:**
- **Goal and purpose:** name, purpose and primary outcome (text fields).
- **Phases:** name and purpose per phase. The active phase shows "Active — locked timing", and timing changes require Phase Transition.
- **Overall goal:** a free-text outcome, a "Journey begins" date and a "Target date".
- **Success criteria and Guardrails:** list editors with Add and Delete. Items are free text.
- **Coaching preferences:** static text, "Briefing cadence, reminders, and scheduling remain unchanged."

**Final step:** "Review changes" shows a summary of the after-state with no before/after comparison, and the footer "Existing evidence and history remain intact."

**Saving goal-plan and phase changes together is blocked:** "Goal-plan and phase changes cannot be saved together…"

**Validation runs only at save.** Messages:
- "Enter an amount for your target."
- "Enter a target value."
- "Choose a target date on or after the start date."
- "Target date and timeline date must match."
- "Every success criterion and guardrail must be unique."
- "Enter a goal name."
- Phases: "Only one phase can be active at a time." / "Operational phase lifecycle and timing changes require the Phase Transition flow."

**Leaving the wizard:**
- No Cancel and no discard confirmation; leaving the wizard silently discards the draft.
- "Back to goal" pushes a new detail page rather than popping (inferred).

**A transitioned goal is a dead end:** it is created with `amount: nil`. No UI sets the amount, so later plan saves fail validation.

## Add Goal / Goal Transition (Routes A to E, sandbox seam only)

### Route A: "GOAL CREATION", 10 steps

| # | Step | Content |
|---|---|---|
| 1 | Ready | Intro |
| 2 | "What comes next?" | Build Lean Mass / Maintain / Strength / Athletic Performance / Custom |
| 3 | "What should we protect?" | Guardrail toggles: 8–9% body fat, Gain gradually, Protect recovery, Preserve strength |
| 4 | "How we'll measure progress" | Measure toggles |
| 5 | Calibration | Explainer |
| 6 | "What should happen to your protocols next?" | Per category (Energy, Nutrition, Training, Activity, Recovery, Weight Tracking, Progress Photos, DEXA, Briefings): Carry forward / Review and update / Replace / Pause / Leave behind |
| 7 | Routine | |
| 8 | "How often should we review progress?" | Daily / Twice Weekly / Weekly / Custom, with weekday pills |
| 9 | Emphasis | Muscle-area pills |
| 10 | "Your New Goal" | Review |

### Route B: "PROTOCOL TRANSITION", 5 steps

Ends with "Ready for Activation". Activation is blocked while editor-required categories are unreviewed.

### Route C: protocol category editor

- **Energy:**
  - "Calorie strategy": Increase gradually / Estimated maintenance.
  - "Activity strategy": Keep current activity / Reduce slightly.
- **Other categories:** the shared schedule editor.
- "Save and continue". No validation.

### Route D: final review

- "Activate {objective}", using a single-use review token.
- Rows: Opening phase, Guardrail, Coaching cadence, Protocols prepared, Commitments, Reminder intents.
- "Confirm and activate".
- Stale token error: "This review changed while you were confirming it…"

### Route E: success

- "Goal transition committed".
- Notes that scheduler synchronization is pending.

## Phase Review (`Presentation/Goals/PhaseTransitionView.swift`, sandbox)

**Decision:**
- "Begin {next}" or "Continue {current}".
- Continuing shows "Extend by N week(s)", range 1–8, default 2.

**"New Energy Strategy":** shown when the next phase has no Energy snapshot.

| Field | Default |
|---|---|
| Caloric intake low | 2750 |
| Caloric intake high | 2850 |
| Activity/expenditure target (kcal/day) | 550 |
| Note | (optional) |

- The review cadence is fixed at "Every 2 weeks".
- **Validation messages:**
  - "Establish the new phase's Energy Strategy before beginning it."
  - "Enter a caloric intake target greater than zero."
  - "The high end of the caloric intake range must be at or above the low end."
  - "Enter an activity/expenditure target greater than zero."
- **Commit:** the Energy snapshot is written first, then the phase change. This is "validate both, then commit", not a transaction.

## Your Journey (`GoalDetailView`)

- `GoalSection("The path", "Your Journey")` with `GoalPhaseCard`s:
  - number tile, "Phase N" and status, name, dates, an 8pt progress bar;
  - tone: completed = amber, active = green, planned = neutral.
- The guardrail is a server-interpreted pill, "{value}% · Within/Below/Above range". It is not editable.

## Design tokens (`SharedUI/PhysiqueOSTheme.swift`)

**Appearance:** System / Dark / Mineral Light.

**Redesign vocabulary** (used by Home and Goals, and by the board phones):

| Token | Dark | Mineral Light |
|---|---|---|
| canvas | #061019 | #E8ECE5 |
| paper | #0F1C2A | #FBFAF4 |
| soft | #132334 | #EEF2ED |
| ink | #F3F8FA | #102431 |
| ink2 | #C3D2D9 | #526970 |
| muted | #92A5AF | #5D7279 |
| teal | #3BD2CA | #087E78 |
| green | #55E39A | #16875F |
| amber (ink) | #EFB84F | #925500 |
| purple | #AA98FF | #5C3FD2 |
| red | #FF697A | #B83D4B |
| cyan | #3BC6DD | #107F99 |
| field gradient | #087B70 → #132751 | #CBE6E2 → #B9D5DD |
| coach field | #122A55 | #DDE8F1 |

**The editors use older token families:**
- Legacy baseline: background #080D18 / #F0EEE6 with a violet accent.
- Operating Plan "priority*" family: canvas #06121D / #F0EEE6, navy selected pills #123D61.

As a result, the edit flows sit on a different canvas than the pages that launch them. **The redesign proposes one vocabulary:** the redesign tokens for every editor.

**Type:**
- Font: Plus Jakarta Sans, scaled with Dynamic Type through `@ScaledMetric`.
- Screen title 30/800; card heading 20/800 and 16/800; body 14 medium; caption 12; section label 11 bold caps (+0.12em); primary button 17 semibold.

**Radii:** card 14 (CardContainer), rows and buttons 16, goal hero 30, phase card 24.

**Touch targets:** at least 44pt; wizard buttons 48pt.
