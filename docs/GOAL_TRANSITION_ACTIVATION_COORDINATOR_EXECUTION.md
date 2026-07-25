# Goal Transition Activation Coordinator Execution

Date: 2026-07-19
Classification: High Risk, isolated execution only
Status: synthetic execution proven; production boundary prohibited

## Public contract

`createGoalTransitionActivationCoordinator(dependencies)` creates a single-use isolated execution instance. Its `execute()` method requires:

- authoritative validator result;
- immutable transaction plan;
- coordinator compatibility result;
- original activation source snapshot;
- injected pre-execution and pre-commit source revalidation functions;
- an explicitly bound `FounderStoreUnitOfWork`;
- injected `createActivationStagedRepositories` factory;
- explicit isolation metadata;
- optional synthetic post-commit handlers;
- injected clock.

`executeGoalTransitionActivation()` is a one-shot domain-module convenience entry point. Neither function is imported by a route, server action, UI component, startup hook, scheduler, or command handler.

There is no default runtime path, global repository lookup, production dependency resolver, or force flag.

## Isolation enforcement

Execution requires all of:

- `isolated: true`;
- `productionAllowed: false`;
- `productionActivationBoundaryAvailable: false`;
- store kind `synthetic`, `temporary`, or `test_only`;
- explicit store identity, isolated path, and production path;
- matching source-snapshot, isolation, and unit-of-work store identities;
- matching isolated snapshot and unit-of-work paths;
- a path different from the production founder store;
- an isolated unit-of-work binding.

The unit of work now exposes frozen binding metadata only. This does not change transaction or commit behavior. The source snapshot optionally carries the same isolated source identity in its semantic fingerprint.

Failure to prove isolation terminates before `begin()`.

## Execution algorithm

The coordinator follows the locked plan:

1. Enter `validating` and validate artifacts, compatibility, dependencies, and isolation.
2. Invoke read-only pre-execution source revalidation.
3. Enter `planning` and `opening_transaction`.
4. Open exactly one unit-of-work transaction at the normalized expected revision.
5. Enter `staging`; construct exactly one transaction-bound staged repository set.
6. Dispatch operations in ascending plan order through the frozen registry.
7. Record an operation only after successful completion and stop at the first failure.
8. Enter `validating_staged_state`; execute repository integrity and complete activation invariants.
9. Re-read committed source through pre-commit revalidation. Staged state is excluded.
10. Enter `committing`; call `commit()` exactly once with final staged validation.
11. Preserve the unit-of-work’s durable publication semantics.
12. Enter `committed` and `publishing`; record publication as the observed commit result.
13. Classify or execute only injected post-commit effects.
14. Return `post_commit_pending`, `completed`, or `failed_committed`.

No IDs, dispositions, ownership, or preview semantics are independently derived.

## Dispatch

The coordinator uses `GoalTransitionActivationDispatchRegistry` as its source of truth:

- goal lifecycle: `goals.updateLifecycle`;
- target creation: `goals.addFutureGoal`;
- protocol roots: `protocols.addFutureProtocol`;
- versions: `protocolVersions.addFutureVersion`;
- provenance: `protocolRelationships.addProvenance`;
- target links: `protocolRelationships.linkFutureProtocolToGoal`;
- commitments: `commitments.add`;
- reminders and scheduler intent: `reminders.add`;
- cadence: `briefingCadence.set`;
- recommendation resolution: `completionRecommendations.resolve`;
- final integrity: `assertIntegrity`;
- commit: transaction `commit`;
- publication: observed unit-of-work commit publication.

Clock placeholders explicitly encoded by the plan are materialized from the injected clock. No other payload interpretation occurs.

## Final staged invariants

The coordinator runs the full plan invariant node plus repository integrity. The combined checks prove:

- Visible Abs still exists, is completed, and is no longer primary;
- Build Lean Mass is the sole active primary and matches accepted opening/guardrail data;
- all 15 future roots, versions, provenance records, and target relationships exist;
- nine future-owned commitments, nine reminders, and one scheduler intent exist;
- twice-weekly cadence and recommendation resolution exist;
- historical protocols and versions are byte-semantically unchanged;
- evidence collections, relationships, and historical briefings are unchanged;
- future IDs exclude grouped preview identities;
- references resolve and staged revision remains the original expected revision.

`ActivationStagedRepositoryFactory.inspectStagedState()` now permits read-only inspection during `committing`, solely so the unit-of-work commit validator can repeat the final invariant suite. Inspection remains unavailable after commit/abort.

## Revalidation

Pre-execution revalidation occurs before transaction open. Failure means no transaction, staged repositories, or executed operations.

Pre-commit revalidation occurs after staged invariants and immediately before commit. It compares the original committed source with newly read live/persisted committed state. It never compares staged future state with the original source.

## Commit and publication

The coordinator opens one transaction and commits once. Legacy isolated state normalizes to revision `0`; successful commit persists revision `1`, one commit ID, and one complete state candidate. The unit of work atomically replaces the isolated file and publishes that state to the isolated live object.

Serialization, temporary-write, atomic-replacement, or compare-and-swap failures remain `failed_pre_commit`, `committed: false`.

If durable replacement succeeds but live publication fails, the result is `failed_committed`, `committed: true`, `completed: false`, with committed revision and commit ID. The coordinator never claims rollback.

## Post-commit effects

All six declarations are processed only after durable commit/publication:

- external scheduler execution is required, unavailable by default, idempotent, and pending;
- an injected synthetic scheduler handler can complete it;
- scheduler failure returns committed/incomplete and never rolls back;
- Home, Goals, Protocols, and Evidence reconciliation remain deferred;
- briefing regeneration/catch-up remains deferred and non-automatic.

No production effect executor exists.

## Idempotency

A coordinator instance is single use. A second `execute()` call fails with `ACTIVATION_COORDINATOR_ALREADY_EXECUTED`.

A pre-commit retry requires a new coordinator, source snapshot, validation, compatibility proof, and transaction. A committed source is rejected on a fresh attempt through source lifecycle and conflict checks. The coordinator has no retry loop and never reuses a committed or aborted transaction.

## Synthetic proof

The production-shaped synthetic fixture starts without a persisted revision and commits:

- final state `post_commit_pending` by default;
- `committed: true`;
- `completed: false`;
- expected revision `0`;
- committed revision `1`;
- commit ID `synthetic-commit-1`;
- all 97 operations accounted for;
- one required scheduler effect pending.

With an injected successful synthetic scheduler handler, status is `completed` and `completed: true`.

Final isolated additions:

- 1 Build Lean Mass goal;
- 15 protocol roots;
- 15 initial versions;
- 15 provenance records;
- 15 target ownership links;
- 9 commitments;
- 9 reminder intents;
- 1 scheduler intent;
- 1 cadence write;
- 1 recommendation resolution.

All historical protocols, versions, evidence, evidence relationships, and briefing artifacts remain unchanged.

## Failure classification

Stable codes distinguish input/artifact/isolation failures, pre-execution failure, transaction opening, staged construction, dependency/dispatch/result failures, final invariant failure, pre-commit drift, commit failure, committed publication failure, post-commit effect failure/pending state, and repeated execution.

Every pre-commit path aborts or discards staging and publishes nothing. Required post-commit failure preserves `committed: true`.

## Production prohibition and concurrency

No production activation boundary exists, and production paths are rejected. All execution tests use temporary isolated files.

Source recapture and compare-and-swap narrow concurrency risk but do not provide cross-process file locking. The locked unit-of-work limitation remains.

## Why live activation remains unavailable

The app has no activation route, action, API, button, startup hook, or production dependency assembly. The coordinator can run only when a caller explicitly supplies matching isolated bindings.

## Recommended next patch

The narrowest next patch is a stabilization and adversarial audit of this isolated coordinator: fault-injection review, operation-accounting audit, invariant mutation testing, and isolation-boundary import scanning. Production wiring should remain out of scope.
## Atomic draft finalization

The coordinator stages both draft consumption operations in plan order. At commit it asks
the generic unit-of-work finalizer to resolve authoritative commit metadata, then validates
the finalized candidate before serialization. No post-commit draft write exists.
