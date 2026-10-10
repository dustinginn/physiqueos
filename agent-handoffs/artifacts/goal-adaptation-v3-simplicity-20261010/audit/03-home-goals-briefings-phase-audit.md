# Audit: Home, Goals and briefings across a temporary phase

This is a read-only audit via `git show`. Commits examined: Native Build 94 `49829781` and Server production `85a98025`.

## Home: goal card (`HomeJourneyFieldView.swift`)

**Layout and real estate**

- The card is full width with 18pt padding, and its **height grows with each phase row**.
- The strip below the card has a fixed height of 104pt.
- The card is built from fixed slots:
  - "TRAJECTORY" eyebrow;
  - headline (24pt; the active phase name);
  - green timeline line (`friendlyTimeline`);
  - support line (the phase purpose);
  - 110×110 **goal** confidence ring;
  - four metrics: TARGET DATE, REMAINING, PROGRESS, DESTINATION;
  - "PRIMARY GOAL" with a date range;
  - one row per phase;
  - a 304pt-wide guardrail box (a text string, with no status).
- There is no spare slot for a badge or a second progress value.

**Problems that matter for a temporary phase**

- **PROGRESS shows the active phase's progress.** Goal progress is attached only to the phase whose `targetDate` equals the goal date. During a cut, PROGRESS would therefore show the cut's elapsed-time %.
- **Only `status == "active"` is tinted green and drives PROGRESS.** `review_due` and `paused` render as amber with the raw uppercased label ("REVIEW_DUE").
- **The connector gradient is hard-coded** for a completed → active sequence.
- **The label reads "PHASE2"**, with no space.
- **There is no temporary or phase-kind field anywhere.**

## Goals tab

- **The index card hard-codes "· Active phase".** `reviewState` is sent by the server but not decoded by Native.
- **Goal Detail (current-state layout) section order:** hero (goal confidence) → Your Journey (`GoalPhaseCard`s) → Body Composition (goal progress %) → Guardrail pill → Training → Turning Points (including `phase_transition`) → Coach's Take.
- **Native `GoalPhaseStatus` supports only completed, active and planned.** paused, review_due, review_pending_decision and superseded all show as "Planned".
- **Phase detail mixes up phase and goal progress.** "Goal progress" on the phase detail screen is actually the active phase's percentage, because of a mapping bug (`ProductionDailyDriverAPI.swift:609-614`).
- **There is no production Phase Review entry point.** The Native transition view is sandbox-only, and the DEXA `phaseReview` is hard-coded to nil.

## Server phase model

**What exists**

- Statuses: `planned, active, review_due, review_pending_decision, completed, superseded, paused`.
- `reviewState`: `due`, `pending_decision`, among others.
- Fields include `completionCriteria` and `plannedReviewAt`.
- Decisions: `begin_next_phase` and `extend_current_phase` only.

**What is missing**

- A phase kind (temporary), a resume-of-prior-phase link, and a "resumed" state.
- Phase-specific confidence or trajectory. Confidence is the goal confidence, re-keyed per phase, so it restarts at every phase change.

## Briefings (section order as rendered by Native)

| Briefing | Section order and notes |
|---|---|
| Weekly | Hero (confidence ring; chips Strategy = phase name, Week N, Next) → Energy → Weight → Body Composition → Training → Recovery → **Coach's Take** (Biggest Takeaway / What To Do / What To Watch / Into Next Week). A recommendation would go last. |
| Midweek | Hero (one confidence block; chip "Goal & Phase") → Energy/Weight/Body Comp/Training → Coach's Take (no Into Next Week). Documented as never recommending, with `protocolChangeRecommended: false` in code, **but there is no V3 guard.** |
| Monthly | Hero → … → **Coach's Take** → **Month Ahead** (strategy call, then priority cards). Month Ahead is last. |
| DEXA Event | Hero → Snapshot → What Measurably Changed (including "Measured Lean Tissue Change") → "Since Starting {phase}" → What This Scan Means → **Coach's Insight** (Biggest Win / Protect / Watch / Next) → optional Phase Review → Goal Completion handoff. |
| Photo Event | Hero (no confidence) → Snapshot → What Visibly Changed → Interpretation → **Coach's Insight** → optional completion decision. No phase review, no forecast. |

## Narrative inputs

**What V3 receives about the phase**

- Only `phaseId`, `label`, `startedAt`, `nextPhaseLabel` and `transitionCriteria`, plus the energy targets.
- The objective, weight direction, composition polarity and guardrails all come from the **goal**.
- As a result, Build Lean Mass always expects weight to go "up", and **a planned cut reads as `wrong_direction`, which is reported as a risk.**

**Known gaps**

- `phase_expected_trajectory_v1.weightTrajectory` is not wired into the narrative (`GoalEvidencePolicies.js:57-64`).
- The phase strategy's `acceptedBodyFatRange` is computed but dropped.
- The energy `mode`/`intent` is never used in copy.
- DEXA plain-language copy for a gaining goal contradicts a planned cut. Example: "Lower body fat isn't automatically better while you're building muscle."
- DEXA copy already distinguishes lean mass from muscle: "muscle plus water and other non-fat tissue".
- Photo copy branches on regexes against the goal title and phase name, not on structured phase intent. Photos never move confidence.
- V3 has no action for entering or exiting a temporary phase.
- Phase Review renders only on the web DEXA screen.
