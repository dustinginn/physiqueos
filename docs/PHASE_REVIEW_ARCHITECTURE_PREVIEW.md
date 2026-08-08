# Phase Review Architecture Preview

Production lifecycle, persistence, repair, and mutation ownership is defined in
`PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md`. This preview remains a disconnected
reference surface.

## Scope

Phase Review is a Goal lifecycle decision surface. The synthetic August 15 DEXA briefing is only its preview host. This implementation has no repository dependency, mutation command, server action, publication path, notification hook, or protocol hook.

PI recommends; the user decides. Calendar passage may make a review due, but cannot complete a phase or activate its successor.

The canonical card order is `Recommendation → Decision → Optional extension controls → Primary action`. Recommendation and Decision are separate concepts: PI owns the recommendation and explanation; the user owns the selected decision. Both decisions are always present. Only the Recommended badge and initial selection follow engine output.

## Downstream dependency audit

| Consumer | Current dependency | Production requirement for Phase Review |
| --- | --- | --- |
| Home | `HomeGoalTrajectoryService` derives the review date, progress, remaining days, and active/upcoming presentation; `HomeActiveChapterPresentationService` renders it. | Read the canonical planned-review projection. Never infer completion from elapsed time. |
| Goal page | `PhaseAwareActiveGoalPreviewService` renders phase cards, readiness, turning points, and planned review. | Show active status until authorization; show a projected next-phase start separately. |
| Goal/phase timelines | `HomeGoalTrajectoryService` derives timelines from start plus duration and exposes upcoming `targetDate`. | Make planned review an explicit revisable boundary, not an end date. |
| Phase progress/weeks | Home trajectory, Goal training progress, Midweek, and Weekly calculate progress and week labels. | Clamp display progress when review is due while keeping the phase active; recalculate from a revised review. |
| Planned review dates | `expectedPhaseReviewDate` consumers derive dates from phase duration. | Persist one canonical planned-review projection updated only by an authorized decision. |
| Milestones | Goal turning points, milestone repositories, Forecast milestones, and DEXA context consume date windows. | Reproject pending review-linked milestones; never rewrite completed evidence milestones. |
| Briefings | Midweek, Weekly, Monthly, DEXA, and Photo contexts consume active phase and phase age. | Read authorized state at each cutoff. Briefings must not enact decisions. |
| Evidence windows | Cadence window contracts, Goal training progress, and PI observations use date boundaries. | Closed evidence stays immutable; future phase-scoped windows rebase after authorization. |
| Confidence timeline | Assessments carry goal, phase, cutoff, publisher, and artifact lineage. | A decision is context, not a confidence rewrite. Start successor confidence only after activation. |
| Notifications | Reminders and cadence/execution scheduling contain date-based intents. | Reproject only pending review reminders after authorization; never touch delivered reminders. |
| Protocol activation | Goal protocol transition services and activation coordinator stage successor protocols. | Extension leaves protocols unchanged; activation waits for the authorized transition transaction. |
| Goal Transition | Production transition routes, repositories, validators, and activation services own the workflow. | Hand one authorized decision to an atomic phase-decision boundary; do not silently invoke Goal replacement. |
| Strategy activation | Operating-plan and strategy services project active state. | Next-phase strategy stays projected until authorization. |
| Forecast timing | Forecast timeline/milestone services and confidence publication use expected windows/cutoffs. | Future evaluations reproject; published forecasts remain immutable. |
| Hardcoded dates | `HOME_GOAL_TRAJECTORY.md` derives Jul 20 + four weeks = Aug 17; `ACTIVE_GOAL_PHASE_AWARE_PREVIEW.md` describes Jul 20–Aug 16 with review Aug 17. No non-test production source hardcodes Aug 17. | Replace documentation assumptions when production architecture lands; derive dates canonically. |
| Automatic completion | Timeline progress can reach its boundary while phase status remains independently active. | Review due is not phase complete; completion requires an authorized immutable decision. |

## Canonical production architecture

The phase lifecycle is `Started → Planned Review → Status`, not `Start → End`. August 15/17 is a planned review boundary, never an automatic phase end. An extension changes only the planned-review projection and leaves the phase active. The next phase has only a projected start until authorization.

Recommended ownership:

1. PI publishes an immutable recommendation with evidence and reasoning lineage.
2. Presentation collects one user selection without changing state.
3. A dedicated Phase Review command validates freshness and authorization.
4. One transaction appends the decision and applies its authorized projections.
5. Downstream read models rebuild; historical briefings, evidence, confidence, and forecasts remain unchanged.

## Future immutable decision record

```text
PhaseReviewDecision {
  id, goalId, phaseId,
  recommendation, recommendedDurationDays,
  selectedOutcome, selectedDurationDays, customReviewDate,
  originalReviewDate, newReviewDate, projectedNextPhaseStart,
  decidedAt,
  reasoningLineage[],
  decisionSource, recommendationSource, actorId,
  schemaVersion
}
```

The record is append-only. Corrections create a superseding decision with explicit lineage.
