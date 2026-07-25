# Goal Creation Production Integration

## Accepted preview

The Goal Creation preview is accepted and frozen for production integration. Its ten-section flow, editorial voice, interaction model, centered mobile composition, and persisted draft contract are the canonical Goal Creation design.

Production activation is intentionally deferred until Protocol Review and Protocol Editing are complete. Goal Creation must hand off directly to Protocol Review; it must not route through Home, a completion screen, or an active-goal dashboard first.

## Production sequence

```text
Goal Completion
→ Goal Creation
→ Protocol Review and Protocol Editing
→ Activation
```

1. The user confirms completion of the current goal.
2. The completed goal and its historical evidence remain preserved.
3. Goal Creation creates the next goal definition.
4. The new goal remains pending while its supporting strategy is reviewed.
5. The user enters Protocol Review and Protocol Editing immediately.
6. New protocol records are created for the new goal.
7. Existing protocols remain unchanged under the completed goal.
8. The new goal and supporting strategy may activate only after required protocol decisions are complete.

## Protocol preservation

Historical protocol records and versions are immutable during transition. They are never edited in place, reassigned, or deleted.

- **Keep as-is:** create a new protocol record for the new goal with the same effective strategy.
- **Create an updated version:** derive a new record from the historical protocol and apply reviewed changes there.
- **Replace:** create or select a different protocol for the new goal.
- **Pause:** preserve the historical protocol without creating an active equivalent yet.
- **Leave behind:** retain the protocol only with the completed goal.

Goal Creation records intent. It does not apply protocol changes.

## Protocol Review handoff

The internal integration boundary is `buildGoalTransitionProtocolReviewHandoff`, with the future destination represented by `GOAL_TRANSITION_PROTOCOL_REVIEW_ROUTE`.

The handoff retains:

- transition draft ID and completed source-goal ID
- new-goal draft ID and accepted next-goal definition
- primary goal, guardrails, and progress measurement
- calibration state, supporting objectives, and briefing cadence
- opening evidence baseline
- inherited protocol and source-version references
- intended protocol dispositions and proposed changes
- a return route to Goal Creation review

These are internal values and must not expose IDs or domain terminology in the interface.

Protocol Review preview now begins at `/preview/goals/transition/protocols`. Its work remains scoped to `GoalProtocolTransitionDraft` records; no production goal or protocol state is created or activated.

## Atomic activation boundary

`GoalTransitionActivationService.applyAtomically` is the reserved production boundary and is intentionally unimplemented. `buildAtomicGoalTransitionActivationContract()` represents the required contract.

The future operation must run as one transaction:

1. Validate the accepted Goal Creation draft.
2. Validate the reviewed protocol transition.
3. Complete the current goal.
4. Freeze its goal-to-protocol associations.
5. Create the new goal.
6. Create new protocol records with source provenance.
7. Link the new protocols to the new goal.
8. Generate new commitments.
9. Apply the accepted briefing cadence.
10. Activate the new goal and protocols.
11. Preserve every source-protocol relationship.
12. Persist every change together or roll back the entire transition.

Production atomic activation remains deferred.
