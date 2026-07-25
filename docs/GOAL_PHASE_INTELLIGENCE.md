# Goal Phase Intelligence

Phase intelligence lives in `GoalPhaseRecommendationService`, a deterministic
domain-planning boundary. Existing goal evaluation services interpret evidence,
while the production transition service owns a specific live workflow; neither
is an appropriate place to introduce advisory goal design.

`recommendGoalPhases(input)` returns `recommendation` (`recommended`, `optional`,
or `not_recommended`), `confidence` (`high`, `medium`, or `low`), a concise
`rationale`, `sourceSignals`, ordered `suggestedPhases`, and
`userChoiceRequired`. Signals identify baseline, calibration, capacity,
strategy-change, horizon, deadline, explicit-sequence, continuous-behavior, and
insufficient-detail evidence.

Suggested phases are advisory DTOs, not `GoalPhase` entities. They deliberately
have no ID, goal ownership, status, or lifecycle timestamps. Supplied dates,
durations, criteria, and planning language are preserved; absent timing and
targets are not fabricated. Names and purposes may be deterministically inferred
from a recognized archetype. Overall guardrails remain owned by the goal and are
not copied into every suggestion.

`adaptSuggestedPhaseToGoalPhaseInput` requires authored `id` and `goalId` values,
adds explicit lifecycle fields, and validates the result through the strict
`GoalPhase` factory. A future wizard may offer use, customize, replace, or reject
the suggestions, but must never persist or select them silently. Recommended and
optional results therefore always require user choice.

This service is read-only. It does not query repositories, write phases, alter an
active goal, or participate in activation and completion lifecycles.
