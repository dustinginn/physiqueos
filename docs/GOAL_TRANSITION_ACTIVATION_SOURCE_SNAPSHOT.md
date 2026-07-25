# Goal Transition Activation Source Snapshot

Date: 2026-07-19
Classification: High Risk, read-only source integrity
Status: source and artifacts match; execution unavailable

## Boundary and public contract

`captureGoalTransitionActivationSourceSnapshot()` is the authoritative bridge between committed founder source state and the locked validator, transaction plan, and coordinator compatibility artifacts.

It accepts two explicit read-only functions: one for the live committed founder runtime and one for the persisted founder store. Each is called exactly once. The results are immediately cloned, reduced to activation-scoped state, canonically fingerprinted, and deeply frozen. No repository, unit of work, staged adapter, persistence function, scheduler, briefing generator, or evidence writer is accepted or called.

The result contains:

- deterministic snapshot ID, version, and fingerprint;
- diagnostic `capturedAt`, excluded from identity;
- transition identity and normalized revision metadata;
- detached activation-scoped source state and validator-compatible source revisions;
- validator, plan, and coordinator comparison summaries;
- `sourceMatches`, `artifactsCompatible`, `executionAvailable`, and `activationReady`;
- ordered blockers and warnings;
- frozen pre-execution and pre-commit requirement contracts.

The adapter never returns a mutable reference to the live store or the full evidence payload.

## Activation-critical inventory

The snapshot includes:

- persisted/live revision metadata, `updatedAt`, and `lastCommitId`;
- accepted Goal Creation and Protocol Transition drafts;
- current goals, lifecycle, completion, and active-primary state;
- historical protocol roots and versions, including ownership/provenance source fields;
- existing commitments;
- reminders and scheduler-intent source state;
- coaching/briefing cadence source state;
- completion-recommendation source state;
- evidence relationship identifiers/metadata;
- transition identity, timezone, expected write counts, and future protocol identities.

Unrelated canonical evidence content is not included.

## One-read guarantee

For founder-store-owned state, one supplied live-store snapshot is authoritative. A separate single persisted read exists only to compare the compare-and-swap revision. Both reads are cloned before normalization, so later mutations cannot alter the result and repository calls cannot observe different runtime instances during construction.

The guarantee is process-level coherence of each supplied snapshot, not an operating-system lock spanning the two reads.

## Shared canonicalization

`GoalTransitionActivationCanonicalization` now owns stable key-sorted serialization, SHA-256 hashing, cloning, deep freezing, and deep-freeze inspection. The locked validator imports the shared fingerprint function, preserving its existing byte semantics and all current fingerprints.

Validator-compatible fingerprints retain the validator’s existing array ordering and null/undefined behavior. The adapter does not silently reorder semantic arrays or omit fields the validator previously hashed.

The complete source set contains:

- goal draft;
- protocol draft;
- active goal state;
- historical protocol ownership;
- commitment source;
- scheduler/cadence source;
- evidence relationships;
- complete activation-critical state;
- separately exposed completion-recommendation and cadence fingerprints for future versioned adoption.

## Revision normalization

Revision rules exactly follow `FounderStoreUnitOfWork`:

- a persisted non-negative safe integer is authoritative;
- an absent integer revision normalizes in memory to `0`;
- reading never persists or migrates revision `0`;
- the first legitimate unit-of-work commit from legacy state would compare at `0` and commit revision `1`;
- `updatedAt` and a legacy validator token are diagnostic only;
- negative, fractional, numeric-string, unsafe, or otherwise invalid revisions fail closed;
- live and persisted normalized revisions must match;
- `lastCommitId` is diagnostic and never revision authority.

The current plan contains the legacy `updatedAt` token. It is accepted only through an explicit compatibility rule: the token must equal the locked validator’s founder revision expectation while live and persisted state both authoritatively normalize to integer `0`. The future transaction is still bound to integer revision `0`.

## Artifact comparisons

### Validator

The adapter recomputes the authoritative validator result through the existing pure validator. It compares transition and draft IDs, all locked source fingerprints, expected write counts, future protocol identities, and optional versioned completion/cadence fingerprints.

Current result: match.

### Transaction plan

The adapter verifies the supported plan version, deep immutability, derived plan identity, transition identity, normalized/legacy-compatible expected revision, expected writes, future protocol identities, and source-revision fingerprint. It does not rebuild or mutate the supplied plan.

Current result: match.

### Coordinator compatibility

The adapter validates supported coordinator state/result, invariant, dispatch, and repository contract versions. It recomputes the pure compatibility result for the supplied immutable plan and compares the compatibility fingerprint.

`executionReady: false` does not invalidate artifact compatibility.

Current result: match.

## Pre-execution revalidation

`revalidateGoalTransitionActivationPreExecution()` must be called before a future coordinator opens a unit of work. It requires:

- normalized revision equal to the plan expectation;
- matching live and persisted revisions;
- matching transition, drafts, all source fingerprints, plan, and coordinator fingerprints;
- accepted, unconsumed drafts;
- Visible Abs as the sole active primary;
- no conflicting Build Lean Mass production goal;
- no prior committed activation for the transition.

It performs no transaction operation.

## Pre-commit revalidation

`revalidateGoalTransitionActivationPreCommit()` compares the original committed snapshot with a newly captured committed live/persisted source immediately before commit. It verifies unchanged revisions, commit ID, drafts, consumption state, artifact fingerprints, and activation-critical source state, plus the transaction’s original expected revision.

The staged future state is deliberately ignored by this comparison. Staged mutations are expected to differ from the original committed source. `FounderStoreUnitOfWork` compare-and-swap remains the final persistence authority.

## Stable mismatches and warnings

Stable mismatch codes cover required inputs, invalid/conflicting revisions, live/persisted drift, every source-fingerprint family, plan identity/revision/writes/future identities, compatibility fingerprint, unsupported versions, consumed transitions, target conflicts, changed source goal, unreadable state, and canonicalization failures.

Warnings are deterministic and currently report:

- legacy revision normalized to `0`;
- legacy token retained as diagnostics;
- cross-process locking unavailable;
- external scheduler executor unavailable;
- production activation boundary unavailable;
- UI reconciliation deferred;
- briefing regeneration/catch-up policy deferred.

Warnings never hide a mismatch.

## Snapshot identity

The snapshot fingerprint uses canonical SHA-256 over semantic source content, normalized revision metadata, validator expectations, plan ID/fingerprint, and coordinator compatibility fingerprint. `capturedAt` is excluded.

Current production:

- Snapshot ID: `goal_transition_activation_source_b2dff01d5de492ae267eac41`
- Snapshot fingerprint: `b2dff01d5de492ae267eac41930f7a4470bac75d3b8b36daabd762c8f1892bbf`
- Normalized revision: `0`
- Revision present: `false`
- Legacy normalized: `true`
- Compare-and-swap eligible: `true`
- `sourceMatches: true`
- `artifactsCompatible: true`
- `executionAvailable: false`
- `activationReady: false`
- Mismatches: none

## Cross-process limitation

The snapshot proves state only at capture time. Pre-execution and pre-commit recapture narrow the drift window, and unit-of-work compare-and-swap performs the final persisted revision check. Without OS-level or distributed locking, a cross-process time-of-check/time-of-use window remains. This patch reports but does not solve it.

## Why activation remains unavailable

There is still no executing coordinator or production activation boundary. External scheduler execution is unavailable, and reconciliation/briefing policies remain deferred. The adapter only proves source freshness and artifact agreement.

## Recommended next patch

The narrowest next concern is an executing coordinator implementation exercised only against an isolated synthetic founder store and forbidden from production wiring. It should consume the locked plan, compatibility contract, and this pre-execution/pre-commit adapter while leaving the production activation boundary absent.

Production activation wiring should remain a separate later review.
## Consumed-draft replay protection

Source state now includes both complete draft collections and resolves the requested
transition by identity even after its status becomes `applied`. Fresh validation and
snapshot capture therefore identify consumed drafts and reject replay, while pre-commit
revalidation correctly continues to compare the unchanged committed source.
