# Activation Staged Repository Factory

Date: 2026-07-19
Classification: High Risk repository-participation foundation
Status: implemented and isolated; activation remains unavailable

## Repository inventory

The activation-relevant production state is not split into one repository per concept:

| Concern | Existing owner | Existing behavior |
| --- | --- | --- |
| Goal records, primary identity, lifecycle, completion record | `GoalRepository` | Constructor accepts a goals array; writes call optional `onChange`; `updateGoal` assigns wall-clock `updatedAt` |
| Completion recommendation source | Daily/Photo Event briefing data read by `VisibleAbsGoalCompletionService` | The source recommendation is historical briefing data and must not be mutated; accepted resolution is eventually represented by goal completion state |
| Protocol roots and goal ownership | `ProtocolRepository` | Constructor accepts a protocol array; writes call `onChange`; returned records can retain array references |
| Protocol versions and version provenance | `ProtocolVersionRepository` | Constructor accepts a versions array; append/supersede call `onChange` |
| Protocol provenance | Protocol root/version fields | No separate provenance repository currently exists |
| Commitments | `ExecutionItemRepository` | Constructor accepts an execution-item array; whole-record upsert calls `onChange` |
| Reminders and founder-store scheduler intent | `ReminderRepository` | Constructor accepts a reminder array; saves/completions call `onChange`; records are app-visible intent, not external jobs |
| Briefing coaching cadence | Goal transition draft proposal; future persisted configuration belongs under `operatingPlan.coachingCadence` | No dedicated cadence repository currently exists |
| Operating plan | `OperatingPlanRepository` | Closes over one injected object and calls `onChange` on mutation |

`FounderRepositories` constructs these repositories once over the live singleton and supplies `persistFounderRuntimeStore` through `onChange`. That construction is correct for existing non-transactional callers but unsafe for isolated activation staging.

## Factory contract

`createActivationStagedRepositories({ stagedFounderStore, transaction, futureProtocolPlan, liveFounderStore, now })` returns:

- `goals`
- `protocols`
- `protocolVersions`
- `protocolRelationships`
- `commitments`
- `reminders`
- `briefingCadence`
- `completionRecommendations`
- `metadata`
- `persistence`
- `assertTransaction()`
- `inspectStagedState()`
- `assertIntegrity()`

The factory does not construct or call the production repository singleton.

## Shared staged-state architecture

The founder-store transaction passes its one `structuredClone` snapshot to the factory. Every adapter closes over that exact object; no adapter clones or owns a secondary collection. Read results are cloned for caller safety, while mutations update the shared staged collections directly.

This makes a goal created through `goals` immediately resolvable by `protocolRelationships`, and a protocol created through `protocols` immediately available to `protocolVersions` and `commitments`. The live singleton remains unchanged until the unit-of-work publishes after durable commit.

Repository metadata includes the transaction ID, expected revision, one shared staged-store identity token, participating repositories, excluded repositories, and `persistenceDisabled: true`.

## Persistence suppression and transaction binding

The staged adapters are purpose-built state adapters. They receive no `onChange`, file writer, scheduler, backup, or production-store accessor. They expose no ordinary save/flush method.

The explicit `persistence.persist()` and `persistence.flush()` probes throw `STAGED_REPOSITORY_PERSISTENCE_FORBIDDEN`, making bypass attempts observable rather than silently ignored.

Every operation checks that its transaction is still `open`. An operation that fails aborts the transaction, so earlier staged changes cannot be committed after a later repository failure. Once the unit of work commits or aborts, all adapters throw `STAGED_REPOSITORY_TRANSACTION_CLOSED`. `assertTransaction()` rejects a different transaction ID with `STAGED_REPOSITORY_TRANSACTION_MISMATCH`.

A staged repository set is never promoted into a live repository set.

## Identity-plan consumption

The factory accepts only explicit identities from the authoritative validator’s `futureProtocolPlan`. It does not generate protocol IDs.

At construction it rejects:

- missing identities;
- duplicate future identities;
- collisions with historical protocol IDs;
- peptide or supplement presentation-preview IDs used as production IDs.

`protocols.addFutureProtocol()` requires a matching plan entry and records the transition, review, and historical source identity. The factory therefore cannot reinterpret grouped preview cards as production records.

## Historical protocol protection

Historical protocol roots and versions are snapshotted when the factory is created. No staged adapter exposes a successful historical update, deletion, or ownership-reassignment operation. Those attempts throw stable immutable-history errors and abort the transaction.

Future protocol provenance may reference an existing historical root/version, but it always records `ownershipTransferred: false`. The integrity check compares every historical root and version with its original staged snapshot before commit, catching direct object mutation as well as adapter misuse.

## Embedded state adapters

Two activation concerns do not currently have dedicated repositories:

- `briefingCadence` stages only `operatingPlan.coachingCadence`. It never creates or edits briefing artifacts.
- `completionRecommendations` stages accepted resolution metadata on the goal. It never edits the Daily or Event Briefing that supplied the historical recommendation.

The future plan builder must define their final record schemas and semantics. This factory only proves they can participate in the same atomic snapshot.

## Integrity boundary

`assertIntegrity()` validates repository-participation concerns:

- historical protocols and versions are byte-equivalent to their staged baseline;
- future protocol goal links resolve;
- provenance cannot transfer ownership;
- commitment protocol links resolve;
- evidence, DEXA, photo, weight, check-in, analysis, and briefing-artifact collections are unchanged.

It intentionally does not reproduce the Goal Transition Activation Validator or encode activation ordering.

## Included and excluded repositories

Participating:

- goals
- protocols
- protocol versions
- protocol relationships/provenance
- commitments
- reminders
- briefing cadence configuration
- completion recommendation resolution

Explicitly excluded:

- canonical evidence, packages, and reviews
- weights
- DEXA
- photos
- daily check-ins
- Daily/Weekly/Monthly/Event briefing artifacts
- analyses
- nutrition context

No external scheduler participates. Reminder records are only founder-store intent.

## Combined commit behavior

Integration tests construct live repositories before a transaction, stage a future goal, lifecycle update, protocol/version/provenance/goal link, commitment, reminder, cadence, and completion recommendation, and verify:

1. Live repositories see none of them before commit.
2. One unit-of-work commit advances the revision once and produces one commit ID.
3. The existing live repository instances see all changes after controlled publication.
4. Mutation, validation, persistence, and stale-revision failures publish none of the staged changes.

## Capability reporting

`getActivationStagedRepositoryCapabilities()` reports repository participation only when every underlying founder-store capability is true. It reports:

- `repositoryParticipation`
- exact participating and excluded repository lists
- `activationRepositoryFactoryAvailable`
- `independentPersistenceDisabled`
- `canonicalEvidenceExcluded`
- external scheduler and briefing artifacts excluded
- `activationCoordinatorAvailable: false`

## Known limitations and next patch

The factory proves repository participation but does not define the real activation write plan, final schemas for embedded cadence/resolution state, final staged invariants, or pre-commit validator fingerprint revalidation. Cross-process locking remains outside the founder-store foundation.

Activation remains unavailable. The narrowest next patch is a deterministic, read-only Activation Transaction Plan Builder that consumes the authoritative validator result and produces the ordered staged operations and final invariant specification without executing them.
## Transition draft participants

`goalTransitionDrafts.consume` and `protocolTransitionDrafts.consume` now participate in
the same staged founder-store snapshot. They validate accepted, unconsumed,
non-superseded, fingerprint-matching drafts and preserve all non-lifecycle content.
Neither adapter installs `onChange` or independent persistence.
