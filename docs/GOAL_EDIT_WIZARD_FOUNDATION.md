# Goal Edit Wizard Foundation

## Canonical section routing

Goal Edit uses presentation-independent section identifiers in this order:
`goal_and_purpose`, `phases`, `overall_goal`, `success_criteria`, `guardrails`,
`coaching_preferences`, and `review`.

Legacy aliases normalize at the draft boundary: `goal` maps to
`goal_and_purpose`; `target_timeline` and `target_and_timeline` map to
`overall_goal`. Display labels normalize only for backward compatibility.
Aliases are deduplicated after normalization, and unknown identifiers are
rejected rather than rendered through another editor. `overall_goal` is routed
only to the destination editor; it never falls back to Goal and purpose.

Save actions are selected from the final-review token version. A goal-plan token
must call Goal Plan Update; a phase token must call Phase Persistence. Typed
rejections remain visible as recoverable UI states, and Back navigation clears
the spent result while retaining the working draft. No failure triggers an
automatic retry or replacement review token.

The production route `/goals/[goalId]/edit` builds a session-scoped
`goal_edit_draft_v1` from an independently editable active goal. Opening the
route reads the goal and adapts it into `goal_planning_v1`; it performs no write.
Original and working plans are separate immutable values, and the client retains
the draft while navigating the selected wizard sections.

The user first selects among goal and purpose, target and timeline, success
criteria, guardrails, and coaching preferences. Only selected sections appear
between the chooser and Review Changes. Phase editing is visibly marked “Coming
next” and cannot be selected. No phase recommendation runs automatically.

Criteria and guardrails share one local-key namespace. Existing supplied keys
remain stable. Missing keys receive deterministic `criterion_N` or
`guardrail_N` values. Every allocated key remains in `usedLocalKeys` after
deletion, preventing reuse or unrelated renumbering within the draft history.
Canonical normalization rejects collisions across both collections.

`GoalPlanDiffService` compares normalized plans structurally. It returns scalar,
target, timeline, criteria, guardrail, and coaching-preference changes; stable
keys identify added, modified, and removed collection members. It also identifies
unchanged sections, destination impact, and explicitly records that evidence and
history remain preserved.

Final review re-reads the live goal and compares a deterministic source revision
with the draft. A mismatch blocks review with a refresh-and-reconcile message;
there is no silent merge. A matching revision creates an immutable review token
and “Goal Edit Review Ready” state.

Commit is enabled only after the revision-checked Goal Plan Update service issues
a bound final-review token for a non-empty diff. Saving executes one atomic,
allowlisted founder-store transaction and reports success only after persistence
confirms it. Draft storage remains session-scoped because adding durable drafts
would require a new production repository or runtime-store contract.

The next Phase Editor patch may add phase-specific draft sections and explicit
suggestion adoption. This foundation does not create, persist, display, or alter
GoalPhase entities, and does not touch activation, protocols, briefings,
scheduling, completion, evidence, or Home.
