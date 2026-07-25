# Canonical Goal Planning Input

`goalPlanningInput.js` defines the versioned, deterministic authoring boundary
shared by future Goal Creation, Goal Editing, previews, phase intelligence, and
eventual phase authoring. It is separate from the permissive production `Goal`
model and strict authored `GoalPhase` model because it represents an editable
plan, not persisted lifecycle state.

Version `goal_planning_v1` contains `goalType`, `name`, `purpose`,
`primaryOutcome`, structured `target` and `timeline` values, goal-level
`successCriteria` and `guardrails`, `currentState`, `planningSignals`, ordered
`proposedStages`, `coachingPreferences`, and `sourceContext`.

Targets support `numeric_change`, `numeric_absolute`, `event_completion`,
`behavior_consistency`, `qualitative`, and `unspecified`. Timelines support
`fixed_duration`, `target_date`, `event_date`, `open_ended`, and `unspecified`,
with `firm`, `adaptive`, or `aspirational` flexibility and `conservative`,
`balanced`, or `ambitious` ambition.

Normalization clones input, trims prose, preserves zero and false, normalizes
empty collections, validates enums and dates explicitly, uses GoalPhase duration
units, deterministically orders stages, validates backward-only dependencies,
preserves unknown fields under the existing goal-domain policy, and deeply
freezes the result. It never fabricates a target, date, stage, criterion, or
guardrail.

Proposed stages are planning data from `user`, `engine`, or `legacy_import`.
They have no persisted ID, goal ownership, status, or timestamps and are not
authored phases. Criteria and guardrails declare `overall_goal`,
`future_phase_candidate`, or `advisory_only` scope; guardrails remain owned by
the overall goal unless explicitly scoped otherwise.

Read-only adapters cover direct planning input, a Goal Creation-shaped draft,
the current goal-transition draft, and a legacy Goal. Every adapter records its
origin in `sourceContext` and exposes unavailable information as null,
`unspecified`, or an empty collection.

Phase intelligence accepts `goal_planning_v1` directly and maps canonical
signals and stage timing into its existing advisory result. A future wizard may
edit and compare this model, but persistence, diff application, phase authoring,
automatic acceptance, and lifecycle integration remain intentionally absent.
