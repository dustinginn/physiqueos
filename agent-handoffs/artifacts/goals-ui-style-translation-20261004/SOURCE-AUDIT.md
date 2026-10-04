# Source audit

## Current production hierarchy

Build 85 exposes:

1. `GoalsView` — Goals root with one active primary Goal, completed Goal history and read-only Add Goal state.
2. `GoalDetailView` + `ActiveGoalCurrentStateSections` — current Build Lean Mass canonical page.
3. `GoalPhaseDetailView` — active and completed phase detail routes.
4. `CompletedGoalDetailContent` — completed Visible Abs at Rest journey.
5. loading, failed and unavailable states from the Goals view models.

The current Founder Production adapter does not expose product writes. Edit, Goal transition, Phase transition and protocol editing screens exist in source but are sandbox-only/unreachable in Founder Production and are not represented as active product UI.

`SupportingObjectiveDetailContent` exists, but `ProductionDailyDriverAPI.fetchGoalDetail` resolves only the active Goal and completed Goal. A supporting-objective route currently resolves to unavailable. That behavior is covered in the states board instead of inventing a reachable detail page.

## Active Goal authority

`active_goal_current_state_v1` owns section presence and exact content. Native order is:

`Hero → Your Journey → Body Composition → Guardrail → Training Progress → Evidence Turning Points → Coach's Take`.

Confidence is display-only. Production hides edit/transition actions. The legacy strategy grid, fictional next-review content and Confidence sheet are not in the current-state presentation.

## Phase data boundary

The production adapter maps full chronology but only the active phase receives current-purpose, evidence and Goal guardrail reference. Completed historical phases receive completion status, dates and progress; purpose/evidence/strategy/success/guardrail arrays are empty. The proposal conditionally omits empty groups rather than fabricating content. Implementing that cleanup would require a presentation-only empty-state guard.

The active phase evidence is the current production training summary. The phase's `readiness` string is body-composition cadence, not a transition promise.

The requested target / energy / activity / history / transition audit resolves as follows:

- Goal destination is production content and remains in the active Goal hero and overall progress treatment.
- Phase target/progress is represented by the canonical phase percentage, dates and measurement cadence.
- Energy/activity strategy does not exist as populated Founder Production phase-detail data. It appears only in legacy/sandbox strategy structures, so it is not fabricated here.
- Phase 1 history is the completed chronology entry and its distinct detail route.
- Transition/edit actions are hidden because `founderProduction.permitsProductWrites == false`; the router also sends phase transition to unavailable. Those flows are therefore audited but excluded from the Founder Production review set.

## Completed Goal and media

`CompletedGoalPreviewService` selects:

- the earliest goal-related `front-relaxed` photo;
- the qualified July 18 completion `front-relaxed` photo from the completion briefing when available, then exact-date/fallback canonical evidence.

The Native wire now carries opaque `mediaId` values and `CompletedGoalDetailContent` loads them through `.authenticatedProduction(mediaId:)`.

`ProgressPhotoTile` has authenticated loading/retry/unavailable states, but the tile has no tap action and no large inspection viewer. This is a current Goals media UX gap, not a fabricated design binding. The review harness redacts pixels while preserving role/date labels and the authenticated media requirement.
