# Goals coverage matrix

| Screen / state | Source component | Canonical data | Navigation | Design template | Mocked | Covered |
|---|---|---|---|---|---:|---:|
| Goals root · loaded | `GoalsView` | `goals` hub | Goal detail | strategic index | yes | yes |
| Active Build Lean Mass | `ActiveGoalCurrentStateSections` | `active_goal_current_state_v1` | phase + briefing | immersive trajectory + analytical body | yes, dark/light | yes |
| Your Journey | `GoalPhaseCard` within active Goal | full `journey[]` chronology | phase detail | sequential rail + progress | focused dark/light | yes |
| Guardrail relationship | active Goal + phase context | current Goal guardrail | none | parallel cross-phase constraint | focused dark/light | yes |
| Current Phase 2 | `GoalPhaseDetailView` | mapped active phase | back to Goal | phase lead + populated evidence + Goal context | yes, dark/light | yes |
| Completed Phase 1 | `GoalPhaseDetailView` | mapped historical phase | back to Goal | completed lead + canonical Goal context | yes, dark/light | yes |
| Completed Visible Abs | `CompletedGoalDetailContent` | `completed-goal` | photos history, final briefing, current Goal | completed journey | yes, dark/light | yes |
| Beginning / completion photos | `ProgressPhotoTile` | authenticated production `mediaId` | photo history | redacted design harness; real binding preserved | focused dark/light | yes |
| Loading | Goals/Goal/Phase view models | async state | n/a | centered progress | representative | yes |
| Error | `GoalsView` failed state | Server message | pull refresh | concise state | representative | yes |
| Empty/read-only | `GoalsView` loaded hub | no active/completed + Add unavailable | none | Add Goal disabled | representative | yes |
| Goal unavailable | `GoalUnavailableView` | unresolved ID | back | concise state | representative | yes |
| Supporting objective detail | `SupportingObjectiveDetailContent` | not resolvable by production adapter | unavailable | current behavior | unavailable state | yes |
| Goal edit | `GoalEditWizardView` | sandbox store | sandbox only | excluded from Founder Production | no | n/a — unreachable |
| Goal transition | `GoalTransitionWizardView` | sandbox store | sandbox only | excluded from Founder Production | no | n/a — unreachable |
| Phase transition | `GoalTransition*` / `PhaseTransitionView` | sandbox store | sandbox only | excluded from Founder Production | no | n/a — unreachable |
| Strategy / protocol editors | `GoalStrategyView` / protocol editors | legacy/sandbox | not linked by current-state Founder page | excluded from current hierarchy | no | n/a — unreachable |

No current Founder Production route/state is uncovered.

