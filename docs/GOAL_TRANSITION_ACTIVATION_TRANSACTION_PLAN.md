# Goal Transition Activation Transaction Plan

Date: 2026-07-19
Classification: High Risk, read-only planning
Status: plan complete; execution unavailable

## Planning boundary

`buildGoalTransitionActivationTransactionPlan()` is the read-only bridge between the authoritative Goal Transition Activation Validator and a future coordinator.

It receives only the validator result. It does not read the founder runtime, open a unit of work, construct staged repositories, or call any mutation method.

The validator result now includes detached accepted draft values inside `validatedGoalDraft.value` and `validatedProtocolDraft.value`. This is the narrow planning-data seam required to build goal fields, reviewed protocol payloads, commitments, reminder intents, and cadence without rereading hidden production state.

Required input:

- `draftReady: true`
- validated Goal Creation and Protocol Transition draft values/fingerprints
- complete transition identity
- all authoritative source revisions/fingerprints
- validator-derived `futureProtocolPlan`
- reconciled expected write counts
- only explicitly planning-compatible blocking reason codes

Draft, ownership, identity, goal-state, commitment, scheduler, evidence, or provenance blockers reject planning.

## Result contract

The deeply immutable plan contains:

- `planId`, `planVersion`, and `planFingerprint`
- `planComplete`
- `executionInfrastructureReady`
- `executable`
- structured execution blockers
- transition identity
- source revisions and source-revision fingerprint
- expected and generated write counts
- exact ordered operations
- dependency graph
- pre-commit requirements
- staged invariants
- post-commit requirements
- external effects and deferred work
- non-semantic `builtAt`

Plan completeness never grants execution permission. `executable` remains `false` in this patch.

## Stable phases

Operations follow this exact phase sequence:

1. `PRECONDITION_ASSERTIONS`
2. `SOURCE_GOAL_COMPLETION`
3. `TARGET_GOAL_CREATION`
4. `FUTURE_PROTOCOL_CREATION`
5. `PROTOCOL_VERSION_CREATION`
6. `PROTOCOL_PROVENANCE_CREATION`
7. `PROTOCOL_OWNERSHIP_LINKING`
8. `COMMITMENT_CREATION`
9. `REMINDER_AND_SCHEDULER_INTENT`
10. `COACHING_AND_BRIEFING_CADENCE`
11. `COMPLETION_RECOMMENDATION_RESOLUTION`
12. `TARGET_GOAL_ACTIVATION`
13. `FINAL_STAGED_INVARIANT_VALIDATION`
14. `COMMIT`
15. `POST_COMMIT_PUBLICATION`
16. `POST_COMMIT_EXTERNAL_EFFECTS`

Every operation has a deterministic ID, contiguous order, earlier-only dependencies, repository/action boundary, entity identity, write category, payload, assertions, effect classification, and rollback model.

## Ordered mutation plan

The staged founder-store sequence is:

1. Revalidate every authoritative revision/fingerprint.
2. Additively preserve the Visible Abs historical chapter.
3. Stage Visible Abs completion and remove its primary role without deleting it.
4. Create Build Lean Mass as `paused`, non-primary, and prepared.
5. Create all 15 distinct future protocol roots using validator identities.
6. Create one deterministic initial version per future root.
7. Add 15 provenance relationships with ownership transfer explicitly false.
8. Link all 15 future roots to Build Lean Mass.
9. Add nine commitments owned by future roots.
10. Add nine commitment reminder intents and one scheduler intent.
11. Set the twice-weekly operating-plan coaching cadence without generating a briefing.
12. Add completion-recommendation resolution metadata without editing its source briefing.
13. Make Build Lean Mass the sole active primary only after every dependency.
14. Run the complete staged invariant suite.
15. Commit exactly once through compare-and-swap.
16. Publish the committed state once.
17. Defer all external effects until after commit.

Historical protocols and versions appear only as immutable provenance sources. Pause and Leave Behind dispositions produce no replacement root, version, provenance, target ownership, commitment, or reminder operations.

## Current accepted transition summary

For the locked production validation result:

- Plan ID: `goal_transition_activation_plan_d2af4c82cf72ac755b1ab19d`
- Plan fingerprint: `d2af4c82cf72ac755b1ab19dc15ce8e6c167cf34e32b055c3599a5927c227163`
- Total plan nodes: 97
- Founder-store mutation operations: 87
- Read-only assertion nodes: 2
- Post-commit external obligations: 6

Write reconciliation:

| Category | Count |
| --- | ---: |
| Future protocol roots | 15 |
| Initial protocol versions | 15 |
| Active replacement protocols | 15 |
| Provenance relationships | 15 |
| Target-goal ownership links | 15 |
| Future commitments | 9 |
| Reminder intents | 9 |
| Scheduler intents | 1 |
| Briefing cadence writes | 1 |
| Goal creations | 1 |
| Goal lifecycle updates | 3 |
| Completion recommendation writes | 1 |
| Evidence writes | 0 |

## Fingerprint strategy

The plan uses canonical key-sorted serialization and SHA-256.

Semantic fingerprint input includes:

- transition identity
- every authoritative source revision
- expected and generated write counts
- validator-derived future identities
- every operation payload and dependency
- all pre-commit requirements
- every staged invariant
- post-commit requirements
- external effects
- repository-participation metadata

`builtAt` is excluded. Changing a draft fingerprint, source-state fingerprint, future identity, operation payload, expected count, dependency, or invariant changes the plan fingerprint and plan ID.

The plan ID is the prefix `goal_transition_activation_plan_` plus the first 24 hexadecimal characters of the plan fingerprint.

## Pre-commit requirements

The future coordinator must revalidate before staging and before commit:

- founder-store revision
- activation-critical fingerprint
- Goal Creation draft fingerprint
- Protocol Transition draft fingerprint
- active-goal-state fingerprint
- historical-protocol-ownership fingerprint
- commitment-source fingerprint
- scheduler-source fingerprint
- evidence-relationship fingerprint
- complete transition identity
- plan fingerprint

Any mismatch refuses execution. The builder encodes but does not evaluate these requirements.

## Final staged invariants

The stable invariant suite covers:

- source goal completion and historical preservation
- target existence and sole active-primary uniqueness
- exact future protocol, version, provenance, and ownership counts
- distinct future identities and immutable history
- commitment, reminder, scheduler, cadence, and recommendation counts/links
- no replacement for Pause or Leave Behind
- no dangling activation references
- unchanged historical briefings
- unchanged canonical evidence and evidence relationships
- exact expected-write reconciliation
- founder-store revision match
- activation fingerprint match

All invariants run after staged writes and before the commit node.

## Founder-store versus external effects

Atomic founder-store work includes goal lifecycle, future goals/protocols/versions, provenance, ownership, commitments, reminder/scheduler intent, cadence, and recommendation resolution.

External effects are declarations only:

- external scheduler execution
- Home reconciliation
- Goals reconciliation
- Protocols reconciliation
- Evidence landing reconciliation
- briefing regeneration/catch-up policy

External scheduling is post-commit only and retries idempotently from persisted intent. Failure never rolls back the committed founder-store transition.

## Planning-compatible validator blockers

The builder accepts only these existing infrastructure codes:

- `ATOMIC_TRANSACTION_UNAVAILABLE`
- `ATOMIC_COMMIT_UNAVAILABLE`
- `ROLLBACK_UNAVAILABLE`
- `STAGED_WRITES_UNAVAILABLE`
- `REVISION_LOCKING_UNAVAILABLE`
- `PERSISTENCE_ERROR_PROPAGATION_UNRELIABLE`

They are accepted for planning because capability wiring into the locked validator is intentionally deferred. They remain execution blockers and are not silently removed.

The plan also reports the missing coordinator, production activation boundary, and final fingerprint-revalidation integration.

## Why activation remains unavailable

The plan is descriptive and immutable. There is still no coordinator that:

- receives the plan;
- revalidates its fingerprints;
- opens the unit of work;
- creates the staged repository set;
- dispatches operations;
- evaluates final activation invariants;
- commits;
- processes post-commit obligations.

The narrowest next patch is a read-only coordinator contract and plan-dispatch compatibility validator. It should prove every operation maps to a staged repository method and define execution-state/error semantics without running the production transition.
## Atomic transition-draft consumption extension

The immutable plan now contains 97 nodes and 87 staged mutations. Two explicit operations
consume the Goal Creation and Protocol Transition drafts after target activation and
before final staged invariant validation. Generated write counts include one consumption
per draft and two total. Their plan payloads carry authority placeholders; the coordinator
binds the current immutable plan identity and the unit of work resolves commit metadata
inside the final atomic candidate.
