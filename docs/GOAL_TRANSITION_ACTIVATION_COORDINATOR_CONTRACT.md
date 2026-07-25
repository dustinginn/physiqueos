# Goal Transition Activation Coordinator Contract

Date: 2026-07-19
Classification: High Risk, read-only compatibility validation
Status: compatibility complete; execution unavailable

## Boundary

`validateGoalTransitionActivationCoordinatorCompatibility()` is the pure compatibility layer between the immutable Goal Transition Activation Transaction Plan and a future executing coordinator. It proves that every plan node has one execution classification, one known handler contract, and a complete payload.

It does not execute the plan, open `FounderStoreUnitOfWork`, construct mutation-capable staged repositories, call a mutation method, commit, publish, schedule work, generate briefings, or mutate production.

## Legal state model

The future coordinator has these states:

`idle`, `validating`, `planning`, `opening_transaction`, `staging`, `validating_staged_state`, `committing`, `committed`, `publishing`, `post_commit_pending`, `completed`, `failed_pre_commit`, `failed_committed`, and `aborted`.

The frozen transition table permits only forward execution and explicit terminal outcomes. In particular:

- failures and aborts before durable commit terminate with `committed: false`;
- a successful commit advances through `committed`;
- publication or required post-commit failure terminates at `failed_committed`, preserving `committed: true`;
- required pending effects use `post_commit_pending`;
- only complete success reaches `completed`.

Illegal transitions fail with `ACTIVATION_COORDINATOR_STATE_TRANSITION_INVALID`. The contract is pure and does not hold coordinator state.

## Result contract

The versioned result includes status, committed/completed flags, transition and plan identity, expected and committed revisions, commit ID, executed/skipped/failed operation IDs, failure stage and stable error details, pre-commit/post-commit failure flags, post-commit and pending effects, warnings, and lifecycle timestamps.

The validator enforces:

- every pre-commit failure has `committed: false`;
- every state after durable replacement has `committed: true`;
- a committed failure has `completed: false` and `postCommitFailure: true`;
- completion has no required pending effect;
- raw staged state is never returned.

Clocks belong to the future executor and must be injected for deterministic tests.

## Execution classes

Every operation maps to exactly one of:

1. `READ_ONLY_ASSERTION`
2. `STAGED_REPOSITORY_MUTATION`
3. `STAGED_INVARIANT_VALIDATION`
4. `UNIT_OF_WORK_COMMIT`
5. `RUNTIME_PUBLICATION`
6. `POST_COMMIT_EXTERNAL_EFFECT`
7. `DEFERRED_NON_EXECUTABLE`

Mutation nodes cannot be read-only, external effects cannot be staged mutations, and evidence operations are never dispatchable.

## Dispatch registry and repository mappings

The frozen registry is keyed by operation type. Each descriptor declares its execution class, repository or coordinator boundary, method, payload/result validator identity, payload schema version, phase, transaction/commit requirements, idempotency strategy, mutation category, and dry-compatibility support.

| Plan operation | Class | Repository or boundary | Method |
| --- | --- | --- | --- |
| `ASSERT_SOURCE_STATE` | read-only assertion | `assertions` | `assertSourceState` |
| `PRESERVE_SOURCE_HISTORY` | staged mutation | `goals` | `updateLifecycle` |
| `COMPLETE_SOURCE_GOAL` | staged mutation | `goals` | `updateLifecycle` |
| `CREATE_TARGET_GOAL` | staged mutation | `goals` | `addFutureGoal` |
| `CREATE_FUTURE_PROTOCOL` | staged mutation | `protocols` | `addFutureProtocol` |
| `CREATE_PROTOCOL_VERSION` | staged mutation | `protocolVersions` | `addFutureVersion` |
| `CREATE_PROTOCOL_PROVENANCE` | staged mutation | `protocolRelationships` | `addProvenance` |
| `LINK_PROTOCOL_TO_GOAL` | staged mutation | `protocolRelationships` | `linkFutureProtocolToGoal` |
| `CREATE_COMMITMENT` | staged mutation | `commitments` | `add` |
| `CREATE_REMINDER_INTENT` | staged mutation | `reminders` | `add` |
| `CREATE_SCHEDULER_INTENT` | staged mutation | `reminders` | `add` |
| `UPDATE_COACHING_CADENCE` | staged mutation | `briefingCadence` | `set` |
| `RESOLVE_COMPLETION_RECOMMENDATION` | staged mutation | `completionRecommendations` | `resolve` |
| `ACTIVATE_TARGET_GOAL` | staged mutation | `goals` | `updateLifecycle` |
| `VALIDATE_FINAL_STAGED_STATE` | staged invariant | `integrity` | `assertIntegrity` |
| `COMMIT_FOUNDER_STORE` | commit | `unitOfWork` | `commit` |
| `PUBLISH_LIVE_RUNTIME` | publication observation | `unitOfWork.commit` | `publishCommittedState` |
| `DECLARE_EXTERNAL_EFFECT` | post-commit declaration | `postCommitEffects` | `classifyEffect` |

Publication is an observed outcome of `FounderStoreUnitOfWork.commit`, not a separately callable repository write.

## Static repository contract seam

`ActivationStagedRepositoryContract` is the only seam added to the staged factory. It is deeply frozen, pure metadata. It describes repository method names and the existing guarantees that adapters are transaction-bound, persistence-disabled, closed after the transaction, scheduler-side-effect free, and unable to write evidence. It also records the protocol methods that intentionally reject historical mutation.

No staged mutation behavior or participating repository was changed.

## Payload compatibility

Each dispatch descriptor defines required payload paths. Compatibility additionally requires operation entity identity, assertions, write category, exact transition identity, the allowed phase, and dependencies already encoded by the validated immutable plan.

The checks fail closed for:

- missing goal, protocol, version, provenance, ownership, commitment, reminder, scheduler, cadence, recommendation, or lifecycle identities;
- missing source fingerprints or transition identity;
- grouped peptide or supplement preview IDs used as production protocol IDs;
- historical protocol IDs reused as future roots;
- historical protocol mutation or ownership reassignment;
- evidence repositories or evidence writes;
- repository/method mismatches and hidden interpretation needs.

The coordinator therefore never needs to reinterpret preview UI or guess an identity.

## Assertion and invariant coverage

The `assertSourceState` contract covers expected founder-store revision, transition and plan identity, activation-critical state, Goal Creation draft, Protocol Transition draft, active-goal state, historical protocol ownership, commitment source, scheduler source, and evidence-relationship fingerprints. This patch registers but does not evaluate those assertions.

The invariant registry recognizes every code exported by the transaction plan builder. Its future pure runner input is staged repository inspection, staged-state inspection, immutable historical baselines, expected write counts, source revisions, and invariant definitions. This covers active-primary uniqueness, source completion, target activation/configuration, protocol/version/provenance/ownership counts, historical immutability, grouped-ID exclusion, commitment/reminder/scheduler/cadence/recommendation reconciliation, briefing and evidence preservation, paused/left-behind behavior, referential integrity, exact writes, source stability, and expected revision.

Unknown assertion handlers or invariant codes are rejected.

## Commit and publication boundaries

Compatibility requires exactly one staged invariant node, exactly one later commit, and exactly one later publication node. Every staged mutation precedes commit and every external effect follows commit.

The commit maps only to `FounderStoreUnitOfWork.commit`, uses expected revision and plan identity, and is not blindly retryable after an ambiguous persistence outcome. Success must surface committed revision and commit ID.

Runtime publication remains owned by `FounderStoreUnitOfWork.commit`. It is not a second write and cannot precede durable replacement. A publication failure is a committed failure: `committed: true`, `completed: false`, with committed revision and commit ID retained.

## Post-commit effects

| Effect | Required | Deferred | Retryable/idempotent | Blocks completion | Rolls back store | Available |
| --- | --- | --- | --- | --- | --- | --- |
| External scheduler execution | yes | yes | yes | yes | no | no |
| Home reconciliation | no | yes | yes | no | no | no |
| Goals reconciliation | no | yes | yes | no | no | no |
| Protocols reconciliation | no | yes | yes | no | no | no |
| Evidence landing reconciliation | no | yes | yes | no | no | no |
| Briefing regeneration/catch-up policy | no | yes, non-automatic | yes | no | no | no |

All effects are post-commit only. Historical briefing artifacts remain unchanged.

## Idempotency and failure rules

Staged mutations are never independently retried. After a pre-commit failure, a fresh transaction may be reconstructed from the immutable plan only after fresh validation. Creation IDs are deterministic; duplicates fail closed unless an empty retry state supports exact reapplication. Lifecycle changes carry expected-state assertions.

Post-commit effects use persisted intent identity, transition identity, or plan ID as idempotency material. Scheduler retries must not duplicate jobs; UI reconciliation is state-derived and repeatable.

Any failure before commit aborts with no post-commit work. A committed or publication result marked committed is never represented as rolled back. Required effect failure preserves `committed: true` and returns incomplete. Executed operation IDs stop at the failure boundary, and dependencies must have succeeded before dispatch.

## Current immutable plan coverage

Current plan:

- Plan ID: `goal_transition_activation_plan_d2af4c82cf72ac755b1ab19d`
- Plan fingerprint: `d2af4c82cf72ac755b1ab19dc15ce8e6c167cf34e32b055c3599a5927c227163`
- Total nodes accounted for exactly once: 97 of 97
- Read-only assertions: 1
- Staged repository mutations: 87
- Final staged invariant validations: 1
- Unit-of-work commits: 1
- Runtime publications: 1
- Post-commit effects: 6
- Evidence writes: 0

The plan’s two read-only nodes are the precondition assertion and final staged invariant; they intentionally belong to different execution classes.

There are no unmapped, ambiguous, or unsupported current operations.

## Compatibility fingerprint

The deterministic SHA-256 fingerprint uses canonical key-sorted serialization over plan ID/fingerprint, dispatch descriptors, static repository contract, assertion/invariant/effect registries, legal-state model, result-contract version/rules, and commit/publication contracts.

`evaluatedAt` is excluded. A plan, mapping, repository method, payload requirement, state transition, invariant handler, or effect-classification change changes the fingerprint.

The current plan and contract produce `8002621a6312e7237d5e7f5252ca9de8cbfebecb8e763b5bf4e38c43c49067c1`.

## Current result and execution readiness

For the current immutable plan:

- `compatible: true`
- `coordinatorContractComplete: true`
- `dispatchRegistryComplete: true`
- `stagedRepositoryCoverageComplete: true`
- `assertionCoverageComplete: true`
- `invariantCoverageComplete: true`
- `commitBoundaryCompatible: true`
- `publicationBoundaryCompatible: true`
- `postCommitEffectCoverageComplete: true`
- `executingCoordinatorAvailable: false`
- `productionActivationBoundaryAvailable: false`
- `externalEffectExecutorsAvailable: false`
- `executionReady: false`

The blockers are `ACTIVATION_COORDINATOR_EXECUTOR_UNAVAILABLE`, `ACTIVATION_COORDINATOR_PRODUCTION_BOUNDARY_UNAVAILABLE`, and `ACTIVATION_COORDINATOR_EXTERNAL_EXECUTOR_UNAVAILABLE`.

The current legacy plan revision token also requires a future read adapter to normalize it to the unit-of-work integer revision. Cross-process locking remains explicitly outside this patch.

## Why activation remains unavailable

This contract proves dispatch compatibility only. No executing coordinator, production activation boundary, external scheduler executor, final authoritative revalidation adapter, or retry worker exists. Visible Abs remains active; Build Lean Mass has not been created.

## Recommended next patch

The narrowest next concern is a read-only activation source snapshot and revision-normalization adapter with final fingerprint revalidation. It should reconcile the current legacy revision token with the unit-of-work integer revision and prove freshness immediately before a future transaction, without opening a transaction or executing the plan.

The executing coordinator and production activation boundary should remain out of scope until that adapter is reviewed and locked.
## Draft-consumption dispatch

The registry maps exactly one Goal Transition and one Protocol Transition consumption
operation to their staged repositories in the `TRANSITION_DRAFT_CONSUMPTION` phase.
Compatibility accounting is now 97 total nodes and 87 staged mutations.
