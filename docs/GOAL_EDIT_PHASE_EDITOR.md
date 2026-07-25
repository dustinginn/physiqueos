# Goal Edit Phase Editor

Classification: High Risk. This production-facing editor can author the active structure of a live goal.

The `/goals/[goalId]/edit` route extends the existing session-only `goal_edit_draft_v1` with separate immutable original and working authored-phase collections. Capability is checked against the existing production persistence service before the Phases section is offered. Compatibility phases are never copied into authored state.

Users can explicitly request explainable suggestions, accept or customize them, create phases manually, or keep the goal continuous. Opaque IDs are allocated only after acceptance or manual creation and remain reserved in draft history after deletion. Exactly one active phase must be deliberately selected for a non-empty collection on an active goal.

Final Review shows the phase collection diff separately from goal-plan changes. A phase-only save obtains a revision- and fingerprint-bound `goal_phase_review_v1` token and constructs the persistence command on the server. Mixed goal-plan and phase changes are blocked and must be saved in separate wizard sessions, preventing partial two-write outcomes.

The editor does not change protocols, evidence, briefings, scheduling, activation, completion, supporting goals, Home, or Goals presentation. Automatic transition policy is stored as intent only; no automatic transition is executed.
# Timeline editing

Advanced phase details preserve the current timing model and its values. Planned-duration phases expose start date, duration, and unit; target-date phases expose their target date; evidence-led phases explicitly state that they have no planned end date. Changing models clears only incompatible timing fields.

Final Review shows each phase’s authoritative timing and the presentation-only expected review date. The convention is start date plus calendar duration: July 21 plus four weeks is August 18. Timeline integrity must pass before the existing phase review-token service is called. No timing provenance or calculated date is persisted onto `GoalPhase`.
