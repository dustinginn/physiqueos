# Goal Phase Intent Interpretation

Classification: Stabilization.

`GoalPhaseIntentInterpretationService` is a deterministic, immutable planning boundary. It accepts either a single-phase description or a whole-journey description and returns a strict, identity-free interpretation plan. The legacy `proposedPhase` view remains available for the proposal currently under review.

## Whole-journey interpretation

Clear sequencing language—such as `then`, `once`, `followed by`, or `before moving into`—can produce multiple proposals when the surrounding text describes materially different operational stages. Multiple sentences alone do not cause a split. Proposal order is contiguous and deterministic.

The result retains:

- the normalized full intent;
- keyed phase proposal envelopes;
- the current proposal index;
- remaining unconsumed intent;
- sequencing relationships;
- supplied, inferred, and unresolved values by phase;
- clarification questions, warnings, and internal interpretation quality.

Proposal keys are stable only within the draft interpretation. They are never authored phase IDs and never cross the persistence boundary.

## Proposal consumption

Each proposal has a draft-only state: `pending_review`, `accepted`, `revised`, `skipped`, or `replaced`. Accepting one proposal authors only that proposal and allocates its opaque phase ID through the existing draft service. Remaining proposals stay available. A later proposal automatically becomes the current review after the preceding proposal is accepted.

The Phase section cannot advance while a proposal remains pending. Skipping or discarding is explicit; later intent is never silently dropped. Active-phase selection remains a separate deliberate action after authoring.

## Later-phase context and duplicate protection

Interpretation receives the full intent, remaining intent, accepted authored phases, requested position, prior phase context, overall target, overall timeline, and overall guardrails. A materially duplicate proposal is stopped with focused clarification instead of repeating an accepted phase.

Dates and durations are associated with the nearest phase-specific language. Ambiguous ownership remains unresolved and requires clarification rather than being copied to every phase. Overall guardrails may be summarized in coaching context but are not copied into phase-specific guardrails unless the user explicitly scopes them to that phase.

## Revision

Revisions may identify a single phase or describe a whole-plan change. The selected proposal is regenerated as a complete valid proposal while unaffected proposals, accepted authored IDs, and later target dates remain unchanged. Malformed or unrecognized revisions return clarification.

## Persistence boundary

Interpretation results and conversational state are session-scoped and never persisted. Identity and lifecycle status are allocated only after individual approval. `GoalPhase` validation remains authoritative before review and persistence. GoalPhase persistence, review tokens, revision checks, replay protection, phase diffs, and atomic commit behavior are unchanged.

## Timeline capture integrity

A supplied duration always remains `fixed_duration`; a missing start date is unresolved timing, not permission to downgrade the phase to `completion_criteria`. Fixed-duration proposals require explicit start-date confirmation before authored acceptance. “Today” is resolved only through the trusted current-date boundary, never assumed from activation or evidence.

Expected review dates use start-date-plus-duration arithmetic. July 21 plus four weeks reaches the four-week mark on August 18. Fixed-duration phases persist the authoritative start date and duration; the calculated review date is presentation-only.

Draft-only timing provenance records supplied, interpreted, confirmed, and authored timing. Before a review token is requested, timeline integrity checks required fields, provenance fingerprints, reproducible expected dates, and adjacent-date coherence. A mismatch blocks review while preserving the draft. Existing phases are repaired only through Goal Planning’s normal advanced editor and revision-checked save path.
