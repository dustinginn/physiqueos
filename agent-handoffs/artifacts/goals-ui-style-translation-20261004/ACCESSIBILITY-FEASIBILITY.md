# Accessibility and implementation feasibility

## Accessibility

- All actionable rows/buttons retain a 44 pt minimum target.
- Phase status is always written (`Completed`, `Active`) and not encoded by amber/green alone.
- Guardrail is labeled as a persistent Goal-level requirement and separated geometrically from the sequential phase rail.
- Progress bars require `accessibilityLabel`, `accessibilityValue` and the numeric percentage in visible text.
- Photo tiles require role + date labels; the intended production labels are “Beginning front relaxed photo, May 24” and “Completion front relaxed photo, Jul 18.”
- Dense composition tables should switch to stacked metric rows at larger accessibility sizes. No essential copy should truncate.
- Confidence remains static text, matching current semantics; it must not gain an accidental button trait.

## Reuse

Reusable locked-system primitives:

- Home immersive teal/navy trajectory field;
- phase timeline and progress treatment;
- mineral-light surface palette;
- briefing metric table, timeline and coaching field;
- `GoalAtmosphericCard`, `GoalSection`, `GoalProgressBlock`, `GoalPhaseCard`, `ProgressPhotoTile`, `GoalNavigationButton`.

Goal-specific primitives to formalize:

- `GoalTrajectoryHero`;
- `GoalJourneyRail`;
- `GoalGuardrailBand`;
- `GoalCompositionComparison`;
- `CompletedGoalPhotoPair`.

## Risks and tests

- Snapshot dark/light root, active Goal, both phase states and completed Goal.
- Contract snapshot the active section order and exact `active_goal_current_state_v1` projection.
- Unit-test conditional omission of empty completed-phase arrays.
- UI-test VoiceOver progress/status labels and 44 pt navigation targets.
- Media tests must prove first/final role selection, authenticated `mediaId` decode, retry/unavailable state and no pixel fallback.
- If a large completed-goal photo viewer is added, reuse the authenticated single-photo inspection architecture; do not leak private media URLs.

