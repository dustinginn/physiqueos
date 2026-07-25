# Goal Transition Activation atomic draft consumption

## Scope

This isolated-only extension closes the replay gap identified before Production Goal
Transition Integration. It does not add a production service, capability, route, action,
API, UI, scheduler invocation, or coordinator import.

## Draft inventory and existing lifecycle

| Draft | Founder-store collection | Ordinary repository | Pre-activation lifecycle |
| --- | --- | --- | --- |
| Goal Creation transition | `goalTransitionDrafts` | `GoalTransitionRepository` | `status: ready`, no `appliedAt` |
| Protocol Transition | `goalProtocolTransitionDrafts` | `GoalProtocolTransitionRepository` | `status: ready`, `readyForActivation: true`, no `appliedAt` |

Both ordinary repositories edit their live collection and invoke an `onChange` callback.
That path remains appropriate for draft editing but does not participate in activation.
The Protocol Transition draft points to the Goal Creation transition through
`goalTransitionDraftId`.

The existing terminal lifecycle convention is retained: atomic consumption changes
`status` to `applied`, sets `appliedAt`, and adds explicit consumption metadata. All
accepted configuration, decisions, readiness data, provenance, and timestamps remain
preserved.

## Immutable plan extension

Two deterministic operations were added after target activation and before final staged
validation:

- `activation_op_086_consume_goal_transition_draft`
- `activation_op_087_consume_protocol_transition_draft`

They dispatch `CONSUME_GOAL_TRANSITION_DRAFT` and
`CONSUME_PROTOCOL_TRANSITION_DRAFT` to separate staged repositories. The protocol
operation depends on target activation and successful goal-draft consumption. Final
staged validation depends on both, and commit still depends only on the final invariant.

Current production-shaped artifact identity:

- Plan ID: `goal_transition_activation_plan_373f06672a4019766056a84a`
- Plan fingerprint:
  `373f06672a4019766056a84a63c5b593126b5aa395d610191c94e2b59a3b017e`
- Compatibility fingerprint:
  `1c6b23fd72302da17140c1b260bc65029dfed1047b754961fb13c51a219d981d`

These are diagnostic preview-era identities. A future live walkthrough must regenerate
fresh artifacts.

Accounting is now 97 total nodes and 87 staged mutations: one source assertion, one
final invariant, one commit, one publication, and six post-commit effects. New generated
counts are one Goal Transition consumption, one Protocol Transition consumption, and two
total draft consumptions.

## Staged repository contract

`ActivationStagedRepositoryFactory` now participates with
`goalTransitionDrafts.consume` and `protocolTransitionDrafts.consume`. Both operate on
the same transaction-owned founder-store snapshot as every other activation mutation.
They expose no persistence callback, reject live/cross-transaction/closed transaction
use, and validate draft type, ID, shared transition ID, ready state, unconsumed state,
non-superseded state, and the accepted draft fingerprint.

The staged consumption record is:

```text
status: applied
consumed: true
consumedAt / appliedAt
activationConsumption:
  consumed
  consumedByTransitionId
  activationPlanId / activationPlanFingerprint
  sourceGoalId / targetGoalId
  draftFingerprintAtConsumption
  activationCommitId
  activationCommittedRevision
  pendingCommitMetadata
```

Plan ID and fingerprint are injected from the trusted immutable plan by the coordinator.
The plan payload contains only recognized authority placeholders. Client-supplied commit
IDs and revisions are invalid.

## Candidate commit metadata model

`FounderStoreUnitOfWork.commit` has a generic `finalizeCandidate` and
`validateFinalized` seam:

1. Existing staged validation runs.
2. The commit mutex is acquired and persisted revision is checked.
3. The unit of work creates the isolated committed candidate and assigns its authoritative
   next revision, commit ID, and `updatedAt`.
4. `finalizeCandidate` resolves both pending draft records with that revision and commit
   ID.
5. `validateFinalized` verifies the complete candidate.
6. Serialization, one atomic replacement, and live publication proceed.

Neither callback can persist independently. A callback failure, candidate validation
failure, serialization failure, temporary-write failure, atomic-replace failure, or CAS
failure publishes no staged state. Existing callers that omit the callbacks are unchanged.

## Invariants and replay protection

The registry now includes stable invariants for both drafts being consumed, consumed
together, matching transition/plan/commit/revision identity, preserved accepted content,
and reconciled collection counts.

Pre-finalization validation requires two valid staged consumption intents with null
commit metadata. Post-finalization validation requires:

- both drafts present exactly once and `applied`;
- identical non-empty authoritative commit IDs and committed revisions;
- current transition, plan ID/fingerprint, source goal, and target goal;
- fingerprints matching the accepted source drafts;
- no supersession or accepted-content mutation.

The validator emits explicit consumed and mismatched-consumption blockers. Source snapshot
capture now retains both complete draft collections and resolves the requested transition
by identity, including after it becomes `applied`. Pre-commit revalidation still reads the
unchanged live committed source, so staged consumption cannot contaminate it. After commit,
fresh validation and snapshotting reject replay.

## Failure behavior

Failure of either consumption handler aborts the transaction. If the second fails after
the first staged mutation, neither is published. Every pre-commit failure leaves both
persisted and live drafts ready, unconsumed, and without commit metadata.

If durable replacement succeeds but live publication fails, both persisted drafts remain
consumed with revision and commit ID, the coordinator returns `committed: true`, and replay
is rejected. No rollback or post-commit draft write occurs.

## Verification and limitations

All write tests use temporary production-shaped stores. The 87 staged mutation operations
retain individual fault injection, including both consumption operations. Historical
protocols, evidence relationships, canonical evidence, and briefings remain excluded from
mutation.

Cross-process locking remains unavailable. Production activation remains unavailable and
forbidden until a separate Production Goal Transition Integration patch is reviewed.

Final verification passed 15 serial test files / 491 tests, ESLint, production-boundary
scans, and `git diff --check`. The production runtime remained unchanged before and after:
SHA-256 `05B02BC6B64FEE2CD04BAEF067C2504B6C3FD6E1B5D0F9E3769CCE3633AD86F2`,
7,828,274 bytes, mtime `2026-07-20T05:22:13.184Z`, `updatedAt`
`2026-07-20T05:22:13.145Z`, with revision and `lastCommitId` absent.
