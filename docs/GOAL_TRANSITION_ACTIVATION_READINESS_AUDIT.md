# Goal Transition Activation Readiness Audit

Date: 2026-07-19
Classification: High Risk, read-only
Decision: **Draft-ready, not safe to activate**

## Executive finding

The accepted Goal Creation and Protocol Transition drafts are persisted and internally ready. The production architecture is not activation-ready because it has no unit-of-work boundary, rollback, staged writes, compare-and-swap protection, or failure-propagating persistence contract across the required repositories. Activation must remain disabled.

The audit entry point is `auditGoalTransitionActivationReadiness`. It uses only repository reads and intentionally reports every missing transaction capability as a blocker. It is not an activation endpoint.

## Current production state

At the audit baseline, the primary source goal `goal_visible_abs_at_rest` is active. The supporting goals `goal_maintain_8_9_body_fat` and `goal_preserve_lean_mass` are also active. `GoalRepository.getActiveGoal()` selects the first `primary` goal for the user and does not itself require `status === "active"`; activation validation therefore must use `listGoals()` and enforce uniqueness and status explicitly.

Goal completion is currently a direct `GoalRepository.updateGoal()` performed by `VisibleAbsGoalCompletionService`. It persists `status: completed`, `completedAt`, completion evidence, transition readiness, and milestone relationships in one goal write. There is no coordinated replacement-goal creation and no rollback if a later transition step fails.

Repository ownership:

| State | Owner | Current lifecycle operation |
| --- | --- | --- |
| Goals | `GoalRepository` | `saveGoal`, `updateGoal` |
| Goal transition drafts | `GoalTransitionRepository` | `save` |
| Protocol transition drafts | `GoalProtocolTransitionRepository` | `save` |
| Protocol roots | `ProtocolRepository` | `saveProtocol`, `updateProtocol` |
| Protocol versions | `ProtocolVersionRepository` | `appendVersion`, `supersedeVersion` |
| Commitments | `ExecutionItemRepository` | `saveExecutionItem` |
| App reminders | `ReminderRepository` | `saveReminder`, completion methods |
| Briefing artifacts | `DailyBriefingRepository` | explicit artifact creation/replacement |

## Accepted transition drafts

Both artifacts live in `private/founder/runtime-store.json`, hydrate into the singleton founder runtime store, and are exposed through their dedicated repositories.

| Artifact | Persisted collection | Current identity and status |
| --- | --- | --- |
| Goal Creation | `goalTransitionDrafts` | `goal_transition_goal_visible_abs_at_rest`, `ready`, objective “Build Lean Mass” |
| Protocol Transition | `goalProtocolTransitionDrafts` | `protocol_transition_goal_transition_goal_visible_abs_at_rest`, `ready`, `readyForActivation: true` |

The protocol draft validation is valid with 15 prepared reviews, zero unresolved reviews, and zero unresolved groups. It contains nine generated routine rows and nine commitment previews. The goal draft contains accepted outcome, predictive, and explanatory evidence plus a Wednesday/Sunday briefing-cadence proposal.

These readiness flags mean the previews have passed draft validation. Neither draft has been applied, and no service implements the declared `GoalTransitionActivationService.applyAtomically` boundary. The existing activation contract explicitly reports `implemented: false`.

## Dependency map and protocol ownership

```text
active source goal
  -> accepted goal-transition draft
       -> accepted protocol-transition draft
            -> historical protocol + current version
            -> review disposition
            -> preview protocol draft (non-runtime)
            -> generated routine/commitment preview
            -> future protocol root + immutable v1 (not implemented)
                 -> replacement goal ownership
                 -> execution commitment
                 -> app reminder/cadence
```

Historical roots and versions already exist. Version IDs are unique, and version records carry author, change reason, prior-version reference, goal links, phase context, evidence basis, and confirmation provenance. Preview drafts retain `sourceProtocolId`, `sourceVersionId`, review disposition, and stable preview IDs.

What is missing is a production instantiator that converts each accepted preview into a new root/version pair with immutable lineage. `ProtocolVersionService.activateInitialProtocol()` is not a safe substitute: it appends the version before saving the protocol, performs two independent persists, and rejects a second active protocol of the same type. The coordinator must first determine disposition semantics without rewriting historical ownership:

- `keep`: preserve the root/version; add the replacement-goal relationship only through a new version if semantic ownership changes.
- `update`: create a new version on the existing root with explicit previous-version lineage.
- `pause` or `leave_behind`: end/supersede the current version and pause/complete the root; never delete it.
- `replace`: create a new root and v1 with `replacesProtocolId`, source-version provenance, and the new goal link; retire the old active instance in the same transaction.
- virtual review: create the supported new protocol type from its validated preview payload.

No current repository exposes deletion for protocols or versions, which is appropriate for history. The activation design must preserve that property.

## Commitment and scheduler boundaries

Commitments originate as deterministic preview descriptors in `GoalProtocolTransitionService.finalize()`. They are not `ExecutionItem` records and are not persisted when the draft is marked ready. Existing commitments are separately owned by `ExecutionItemRepository`; updates are whole-record upserts, and no delete/deactivate method exists.

The exact commitment creation point is after future goal and protocol IDs/versions have been staged and linked, but before any record becomes active. The materializer must turn preview descriptors into stable, idempotent `ExecutionItem` records carrying replacement-goal and future-protocol IDs. Old goal-scoped commitments must be staged as inactive/superseded rather than deleted.

Scheduling is currently data, not an external job system:

- Coaching cadence is proposed by the accepted transition drafts.
- App-visible reminders are owned by `ReminderRepository`; seed documentation explicitly distinguishes them from push notifications.
- Reminder schedules are embedded records. No external scheduled-job adapter, transactional scheduler, job receipt, or compensating cancellation API was found.
- Briefing cadence is transition metadata; scheduled briefing artifacts are owned by `DailyBriefingRepository`. Activation must change cadence configuration, not generate or rewrite briefing history.
- The operating rhythm is read-only seed/runtime context and has no write repository.

Because there is no external scheduler today, the first activation implementation should persist schedule intent in the same unit of work and leave external dispatch out of scope. If an external scheduler is later added, use an outbox written atomically with activation; dispatch after commit with idempotency keys and compensating cancellation.

## Transaction and runtime-store behavior

All repositories mutate their in-memory collection before invoking `onChange`. Each callback serializes the full founder store to a temporary file and replaces the runtime JSON file. That replacement is atomic for one persistence call only; it is not an atomic multi-repository transaction.

Important failure properties:

- No atomic commit, rollback, staged writes, write batching, transaction handle, or compare-and-swap revision exists.
- Persistence catches file errors and logs a warning instead of rethrowing. A repository call can return success while disk persistence failed.
- Protocol root/version activation already spans two independent callbacks.
- Calls without `mutatedCollection` can serialize all cached collections, creating stale-overwrite risk under concurrent writers.
- Repository proxies refresh the global singleton from disk before each method using file mtime and `updatedAt`. There is no explicit logical invalidation event.
- There is no separate active-goal, protocol, commitment, or scheduler cache. Those views are recomputed from the shared store, but any long-lived reference can still be stale.
- Non-persisted seed collections are rehydrated, not transaction participants.

Minimum prerequisite: a founder-store unit of work that acquires an activation lock, refreshes once, verifies a revision/hash, clones a candidate store, applies all changes to the candidate, validates global invariants, writes one replacement file, propagates failure, and swaps/invalidate the singleton only after durable success. A failed pre-rename write discards the candidate and leaves the original store untouched. A successful rename followed by cache refresh failure must reload from the committed file; it must not compensate by reversing durable domain history.

## Authoritative activation preconditions

The future validator must be a pure function over one locked, revisioned snapshot and must refuse activation unless all checks pass:

1. Request includes user, source goal, goal-draft, protocol-draft, expected store revision, and an idempotency key.
2. Goal draft exists, belongs to the user/source goal, is `ready`, and passes the full goal-draft validator.
3. Protocol draft exists, belongs to that goal draft/source goal, is `ready`, has `readyForActivation: true`, passes the full protocol validator, and has no unresolved review IDs/groups.
4. Exactly one active primary goal exists and it is the source goal; no replacement goal already exists for the transition/idempotency key.
5. Every historical protocol/version reference exists and matches the captured source identity; every active type has one unambiguous disposition.
6. Every preview protocol payload is valid, IDs are collision-free, lineage is complete, and resulting active-protocol uniqueness holds.
7. Generated commitment and reminder IDs are deterministic and collision-free; every link resolves to a staged goal/protocol.
8. The briefing cadence is supported and does not request briefing-history mutation.
9. Repository unit of work, durable atomic replace, failure propagation, lock, revision check, and post-commit reload are available.
10. Scheduler mode is explicitly `persisted_intent_only`, or an outbox participant is healthy; direct external scheduling is forbidden inside the transaction.
11. Candidate-state global validation passes: source completed, replacement is the sole active primary, protocol history retained, expected roots/versions active, drafts applied, no orphan links, and evidence records byte-identical.

The current read-only audit confirms the accepted-artifact checks but returns `activationSafe: false` until the architecture checks are implemented.

## Exact activation write set

All rows below are mutations to one candidate store and must result in **one durable commit**, not individual repository persists.

| Order | Candidate write | Dependency and validation | Failure/rollback |
| --- | --- | --- | --- |
| 0 | No write: lock, refresh, revision check, validate all drafts/references, reserve idempotency key | Entire authoritative precondition set | Release lock; no state changed |
| 1 | Add activation record with `status: preparing`, IDs, revision, and deterministic write manifest | Validated inputs and collision-free IDs | Candidate discarded |
| 2 | Add replacement goal as `planned`/non-primary | Accepted goal draft; source snapshot and provenance attached | Candidate discarded |
| 3 | Append future protocol versions and add/update future protocol roots in non-active state | Replacement goal ID; disposition/lineage integrity | Candidate discarded; historical records untouched |
| 4 | Stage protocol retirement/supersession and replacement-goal links | All future roots/versions exist; active-type uniqueness evaluated on final candidate | Candidate discarded |
| 5 | Add replacement-goal execution items; mark source-only items superseded/inactive | Stable future goal/protocol IDs; exact generated-preview mapping | Candidate discarded |
| 6 | Add/update app reminder schedule intents; mark obsolete goal-scoped reminders inactive | Materialized commitments and supported cadence | Candidate discarded |
| 7 | Persist briefing cadence configuration only; do not create/change briefing artifacts | Accepted Wednesday/Sunday policy | Candidate discarded |
| 8 | Complete source goal and freeze its protocol/commitment association snapshot | Every replacement dependency already staged | Candidate discarded |
| 9 | Activate replacement goal as sole primary and activate future protocol roots/versions | Final-state uniqueness and link checks | Candidate discarded |
| 10 | Mark both transition drafts `applied`; finalize activation record | All candidate invariants pass | Candidate discarded |
| 11 | Atomically write the complete candidate store once | Lock and expected revision still valid | Temp discarded on failure; original bytes retained |
| 12 | Reload committed file and invalidate/swap singleton views | Durable commit exists | Retry reload from disk; never replay writes |
| 13 | Post-commit UI refresh/revalidation signal | Reloaded committed state | Retryable presentation concern, not rollback |

Evidence packages, canonical evidence, evidence reviews, photos, DEXA, weights, analyses, and existing briefing artifacts are outside the write set. Their serialized bytes must match the pre-transaction snapshot.

## Failure analysis

| Failure | Current corruption risk | Required protection |
| --- | --- | --- |
| Source goal completes before replacement creation | No active primary transition target | Source completion only in final candidate |
| Replacement goal saves before protocols | Active/visible goal with no executable plan | Create planned goal inside candidate |
| Version append succeeds but root save fails | Orphan active version | Candidate transaction; root/version invariant |
| Old protocol retires before replacement | Missing active protocol by type | Validate final dispositions, commit together |
| Protocol ID/version collision | Wrong lineage or overwrite | Deterministic IDs plus collision rejection |
| Commitment materialization fails | Active plan without execution commitments | Materialize and validate before activation flags |
| Existing commitment cannot be retired | Conflicting old/new instructions | Add lifecycle/supersession semantics before coordinator |
| Reminder/cadence write fails | Commitments and coaching schedule disagree | Persist schedule intent in same candidate |
| External scheduler fails | Durable state and external jobs diverge | Outbox/idempotent dispatch; no direct call in commit |
| Briefing cadence activation rewrites artifacts | Historical narrative corruption | Separate cadence configuration from artifacts |
| Persistence write/rename fails | In-memory state may differ; error currently swallowed | Candidate isolation and thrown durable-write errors |
| Concurrent writer lands during activation | Lost update/stale full-store overwrite | Lock plus expected revision/hash compare-and-swap |
| Cache refresh fails after commit | UI reads stale state | Reload durable file with retry; commit is authoritative |
| UI revalidation fails | UI temporarily stale | Retry presentation invalidation; no domain rollback |
| Draft applied flag fails after domain writes | Transition appears repeatable | Same atomic candidate and idempotency record |
| Activation retry after ambiguous response | Duplicate roots/commitments | Idempotency key and completed activation lookup |

## Smallest safe implementation sequence

1. **Patch A — Pure authoritative validator.** Implement the preconditions above against an immutable snapshot, including collision and final-state invariant simulation.
2. **Patch B — Founder-store unit of work.** Add lock, revision/hash, candidate clone, one durable atomic commit, propagated errors, reload, and fault-injection tests. No domain activation yet.
3. **Patch C — Lifecycle and lineage models.** Add activation record/idempotency schema, planned replacement-goal state, immutable source association snapshot, and commitment/reminder supersession fields.
4. **Patch D — Protocol transition materializer.** Convert accepted reviews/previews to deterministic roots/versions and validate keep/update/pause/leave-behind/replace semantics without persisting.
5. **Patch E — Commitment and cadence materializer.** Produce deterministic execution items and persisted schedule intent; explicitly exclude external dispatch and briefing artifact generation.
6. **Patch F — Atomic activation coordinator.** Apply the exact candidate write set through the unit of work, run final invariants, commit once, reload, and expose idempotent retry behavior.
7. **Patch G — Post-commit integration.** Add UI revalidation and, only if needed, an outbox-backed external scheduler consumer.

Each patch must include failure injection and byte-parity assertions for all collections outside its declared write set. Activation should not be exposed until Patch F passes end-to-end interruption tests at every write boundary.

## Audit non-mutation verification

The regression test instruments every mutating repository method to throw, runs the audit through read methods, asserts no mutator was called, and compares the complete fixture before/after. It also verifies returned audit data is detached from protocol, reminder, goal, version, and commitment relationships.

For the production audit, the runtime file hash, byte length, and last-write timestamp are captured before and after the test run. Scheduler state is represented only by reminders/cadence in this architecture; commitment, goal, protocol, version, transition, briefing, and evidence collections are also compared through the unchanged runtime bytes.
