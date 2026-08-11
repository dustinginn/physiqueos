# Training Logger Web V1.2

Training Logger Web V1.2 keeps the Logger as a proposal surface and Evidence Review as the authoritative confirmation boundary.

## Evidence Review details

Logger-origin strength reviews present every proposed exercise and performed set from the authoritative proposed `TrainingSession`. The compact review includes the exercise name, formatted reps/load or bodyweight values, execution Variant, and human-readable Superset partners. Internal canonical and occurrence identifiers are not part of this summary.

## New exercise lifecycle

The Logger accepts only a proposed exercise name and one existing user-facing training category. An exact canonical name or alias reuses the existing exercise. A genuinely unmatched name becomes an unresolved provisional occurrence in the recoverable local draft.

The provisional occurrence can use the normal Logger set, Variant, and Superset interactions. It does not mutate the canonical exercise registry. Evidence Review requires the user to map the occurrence to an existing exercise, confirm a new canonical definition, or remove it. A new definition and the confirmed workout are committed atomically only after final confirmation.

Once confirmed, the new canonical exercise enters the shared registry and its confirmed workout occurrence enters normal Training history. Later Logger sessions discover it through the same performed-history and broader-registry paths used by every other exercise.

## Swap behavior

`Swap exercise` replaces the movement in an existing workout occurrence. The occurrence identifier remains stable so a structurally valid Superset can retain its position. The replacement clears the old Variant and old set values, then loads its own comparable history and progression state; a provisional replacement starts with empty first-use sets. A swap that would duplicate another canonical exercise in the workout is rejected.

Draft serialization preserves both provisional creation and swaps without writing Training, Evidence Review, or canonical exercise records.

## Native continuity

The future native client should use the same lifecycle: local provisional draft state, authoritative Evidence Review resolution, and one atomic final commit. No web-only canonicalization path is introduced here.
