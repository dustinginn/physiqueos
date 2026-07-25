# Goal Transition Activation Coordinator Stabilization Audit

Date: 2026-07-19
Classification: Stabilization, adversarial isolated execution
Decision: isolated coordinator hardened; production activation remains prohibited

## Scope and threat model

This audit attacks the isolated coordinator as if its caller, artifacts, injected boundaries, transaction implementation, staged data, and post-commit handlers were hostile or defective.

The audit covers operation accounting, every staged-operation failure boundary, dependency and plan forgery, artifact tampering, invariant corruption, reference isolation, unit-of-work failures, ambiguous commit results, publication semantics, effect ordering, replay, isolation aliases, production imports, implicit paths, result contracts, determinism, and production runtime integrity.

All execution uses temporary synthetic stores. The production founder store is read only for before/after integrity checks.

## Operation accounting

The authoritative plan reconciles exactly:

| Class | Nodes |
| --- | ---: |
| Staged mutations | 85 |
| Read-only source assertion | 1 |
| Final staged invariant | 1 |
| Unit-of-work commit | 1 |
| Runtime publication | 1 |
| Post-commit declarations | 6 |
| Total | 95 |

Successful and scheduler-pending executions contain all 95 IDs exactly once, no unknown or duplicate IDs, and no skipped IDs. Commit, publication, and all declarations are individually accounted for.

An exhaustive parameterized test injects failure at each of the 85 staged mutation operations. Every case:

- reports the exact failing operation ID;
- contains exactly the prior plan IDs in `executedOperationIds`;
- excludes the failing and all later operations;
- performs no commit or effect;
- leaves isolated persisted/live state byte-semantically unchanged.

## Dependency and plan-forgery attacks

Forged plans are rejected before transaction open. Attacks include:

- unknown, later, duplicate, missing, cyclic, and removed dependencies;
- reordered operations or altered order numbers;
- target activation with dependencies removed;
- changed plan ID/fingerprint/version/transition/revision/counts;
- removed, added, or duplicated operations and IDs;
- altered repositories, actions, payload identities, and operation types;
- removed historical/evidence invariants;
- early/duplicate commit, missing publication, and early external effect;
- grouped preview, historical, or colliding future identities;
- inserted evidence write and historical protocol mutation.

The coordinator recomputes compatibility against the immutable semantic plan; it does not trust object freezing or the displayed plan ID alone.

## Artifact mismatch attacks

Independent validator, plan, compatibility, and snapshot mismatches fail before mutation.

The audit proved a defect: the executor previously trusted `sourceMatches`, `artifactsCompatible`, and the supplied snapshot fingerprint without recomputing snapshot identity.

Narrow fix:

- the source snapshot now returns the exact semantic validator expectations and artifact bindings already used by its fingerprint;
- `validateGoalTransitionActivationSourceSnapshotIntegrity()` reconstructs the semantic input and verifies both snapshot fingerprint and derived snapshot ID;
- the coordinator invokes this validation before transaction open.

The production snapshot fingerprint is unchanged.

## Invariant mutation matrix

Forty-eight staged-state corruptions are injected immediately before final validation.

| Family | Mutations detected |
| --- | --- |
| Goals | removed source/target, wrong lifecycle, multiple/no active primary, wrong opening/guardrail/identity/provenance, unrelated source-history mutation |
| Protocols | missing/extra roots or versions, missing provenance, ownership transfer, deleted/mutated history, grouped ID, wrong ownership, inactive replacement |
| Commitments/reminders | missing/extra/duplicate/dangling records and historical/missing protocol ownership |
| Scheduler/cadence | missing/duplicate/altered scheduler intent, missing or changed cadence |
| Recommendation | unresolved, wrong transition, altered historical content |
| Evidence/briefings | changed/removed/added evidence relationships and historical briefing artifacts; changed evidence content |

Every mutation fails before commit and publishes zero changes.

Narrow invariant corrections:

- exact total protocol/version/commitment/reminder counts, not presence alone;
- exact future version/root identities and planned lifecycle;
- source historical fields unchanged outside the planned lifecycle allowlist;
- target transition provenance required;
- reminder-to-commitment/protocol and scheduler identity/status checks;
- top-level recommendation history preservation;
- evidence-relationship preservation added to the staged factory baseline.

## Historical, evidence, and briefing preservation

Canonical semantic comparisons prove:

- only planned Visible Abs lifecycle/resolution fields change;
- unrelated historical goal data is unchanged;
- historical protocol roots, versions, and ownership are unchanged;
- evidence content and evidence relationships are unchanged;
- historical briefing artifacts are unchanged;
- recommendation history remains unchanged apart from additive goal resolution metadata;
- no historical protocol owns a future commitment.

No evidence or briefing repository participates. No generator, scheduler, narrative service, persistence callback, `flush`, or independent `persist` method is reachable through dispatch.

## Staged isolation

The coordinator and existing staged-factory suites verify nested goal, protocol, relationship, commitment, reminder, cadence, and recommendation mutations remain invisible until publication.

Repository sets are transaction-bound and reject cross-transaction use, abort/commit reuse, live-store backing, independent persistence, and post-close access. Results and errors expose no staged state. Post-commit handlers receive a deeply frozen, approved effect envelope only.

The audit proved effect envelopes were detached but not immutable. They are now deeply frozen before handler invocation.

## Unit-of-work fault matrix

Coordinator and locked unit-of-work tests cover:

- begin and mutation callback;
- staged validation;
- serialization;
- temporary creation/write;
- revision checks before and immediately before replacement;
- atomic replacement;
- directory synchronization warning;
- publication;
- cleanup before and after commit;
- stale/concurrent transactions;
- transaction lifecycle misuse.

All pre-commit failures leave revision, persisted state, and live state unchanged and invoke no effect. Cleanup-only and directory-sync failures after durable commit remain warnings rather than false rollback.

## Commit ambiguity

The audit attacks:

- committed false or missing;
- committed true with missing revision or commit ID;
- wrong revision;
- success reported without persisted/live change;
- publication failure after replacement.

The audit proved a defect: any `{ committed: true }` object previously advanced to effects even with missing/wrong revision or commit ID.

Narrow fixes:

- committed revision must equal expected revision plus one;
- commit ID must be a non-empty string;
- an injected read-only confirmation must prove isolated live and persisted revision/commit ID/state agreement before effects;
- malformed committed claims return `failed_committed`, never rollback;
- malformed uncommitted results return `failed_pre_commit`;
- no malformed result can invoke an effect.

The real unit of work still owns durable truth. The confirmation is a stabilization check against defective injected boundaries.

## Publication

Publication remains integrated into `FounderStoreUnitOfWork.commit`.

- It occurs once and only after atomic replacement.
- Successful publication produces matching live/persisted isolated state.
- Publication failure returns `failed_committed`, `committed: true`, committed revision, and commit ID.
- No effects run after publication failure.
- Recovery cannot trigger a second coordinator commit on the same instance.

## External effects

The scheduler:

- never runs before commit or after pre-commit failure;
- receives a frozen envelope containing only effect payload, transition identity, plan ID, revision, and commit ID;
- receives the stable persisted intent idempotency key;
- must return `{ completed: true, idempotencyKey: expectedKey }`;
- remains pending when no handler exists;
- returns committed/incomplete on throw, partial application, or malformed success.

The audit proved a defect: arbitrary handler return values, including `undefined`, were previously treated as success. Exact success acknowledgement and idempotency-key agreement are now required.

Home, Goals, Protocols, Evidence landing, and briefing policy remain optional/deferred. Optional handler failure never rolls back or changes founder-store commit truth.

## Replay and idempotency

Tests reject:

- sequential and concurrent second calls on one coordinator instance;
- stale snapshot/plan after revision advance;
- committed transition replay;
- deterministic-ID replay;
- stale attempts following another commit;
- reused closed/aborted transaction and repository sets.

A pre-commit retry requires fresh artifacts, snapshot, coordinator instance, and transaction. Pending scheduler work is retried as an effect, never by replaying founder-store activation.

## Isolation bypass

The audit covers missing/altered metadata, production capability, identity mismatch, source-reader mismatch, relative aliases, separator aliases, Windows case variation, normalized duplicate paths, and filesystem symlink aliases where creation is permitted.

The audit proved lexical `path.resolve()` was insufficient for symlink/junction aliases. Path comparison now uses platform-native `realpath` when the path exists and falls back to normalized absolute paths only for nonexistent paths.

The source adapter must expose matching store identity/path binding metadata. Unit-of-work binding remains frozen. There is no environment, working-directory, singleton, or default production-path fallback.

Residual limitation: filesystem aliases created or changed after validation remain subject to normal filesystem race behavior. Cross-process locking and filesystem handle pinning are intentionally out of scope.

## Production boundary scans

Automated scans cover:

- application and API routes;
- server actions;
- UI components;
- services, startup/runtime modules, jobs, and command handlers;
- public index/barrel exports;
- package scripts and migration/recovery scripts;
- static imports, dynamic imports, requires, and re-exports.

No production module reaches `GoalTransitionActivationCoordinator`, `executeGoalTransitionActivation`, or `createGoalTransitionActivationCoordinator`.

The executor source also contains no production runtime path, singleton/runtime-store resolver, environment fallback, founder repository container, or persistence import.

## Result contract and determinism

Every returned terminal result is validated by the locked coordinator result contract.

- Pre-commit: uncommitted, incomplete, no commit metadata/effects.
- Publication failure: committed/incomplete with revision and commit ID.
- Scheduler pending: committed/incomplete with retryable required pending effect.
- Scheduler failure: committed/incomplete with post-commit failure.
- Complete: committed/completed with no required pending effect.

Identical source, plan, deterministic clock, transaction ID, and commit ID produce identical operation ordering, accounting, pending effects, error boundary, and final semantic state.

One accounting defect was corrected: after staged validation, the last staged operation ID was previously retained while pre-commit revalidation ran. It is now cleared so a pre-commit boundary failure does not falsely blame the invariant operation.

## Defects and narrow fixes

| Defect | Classification | Fix |
| --- | --- | --- |
| Snapshot fingerprint trusted | Artifact integrity | Recompute snapshot fingerprint/ID before begin |
| Presence-only final counts | Invariant gap | Exact baseline-plus-plan counts and identities |
| Evidence relationships absent from staged baseline | Preservation gap | Add relationship snapshot to integrity baseline |
| Mutable effect envelope | Isolation hardening | Deep-freeze approved handler input |
| Arbitrary effect return accepted | Effect ambiguity | Require explicit completion and matching idempotency key |
| Malformed committed result accepted | Commit ambiguity | Validate revision/commit ID and confirm isolated state |
| Lexical path aliases only | Isolation bypass | Native realpath comparison |
| Pre-commit failure retained invariant ID | Result accuracy | Clear operation boundary after staging |

No accepted transition semantics, plan operation, repository ownership, or production wiring changed.

## Production integrity incident and recommendation

The production runtime changed externally during the audit window and therefore did **not** remain byte-identical to the captured baseline:

| Field | Before | After |
| --- | --- | --- |
| SHA-256 | `4AEF4956075C5D75CA67DB2860521D07D8E7E324736AC066881055B759EABFA7` | `05B02BC6B64FEE2CD04BAEF067C2504B6C3FD6E1B5D0F9E3769CCE3633AD86F2` |
| Size | 7,782,919 | 7,828,274 |
| Modified UTC | `2026-07-20T02:51:00.8560170Z` | `2026-07-20T05:22:13.1838273Z` |
| `updatedAt` | `2026-07-20T02:51:00.823Z` | `2026-07-20T05:22:13.145Z` |
| Persisted revision | absent | absent |
| `lastCommitId` | absent | absent |

The isolated coordinator has no production path/default/import, every production-alias attack terminated before `begin()`, and all executing fixtures used OS temporary files. The changed store still has Visible Abs as the active primary, no persisted revision/commit ID, nine protocols, five protocol versions, six execution items, and five reminders; it does not contain the isolated activation’s 15 new roots/versions, nine new commitments, ten new reminder/scheduler records, or revision `1`. This is consistent with an unrelated legacy persistence write, not coordinator execution.

The production file was not overwritten or repaired. This audit cannot be declared production-integrity-clean until the external write is reviewed and a new baseline is explicitly accepted.

The narrowest next patch is a production-runtime drift diagnostic and stabilization lock review. Production activation wiring should remain out of scope.

## Production baseline reconciliation lock

The focused read-only reconciliation is complete and returned **LOCKED**. The drift was
attributable to one confirmed evidence upload plus its canonical record and derived
analysis; no activation-critical drift or coordinator signature was found. A controlled
no-activity window remained byte-for-byte and semantically stable.

The accepted baseline and full limitations are recorded in
`docs/GOAL_TRANSITION_ACTIVATION_PRODUCTION_BASELINE_RECONCILIATION.md`. This lock does
not add or authorize a production activation boundary.
## Atomic draft-consumption compatibility extension

The later isolated-only compatibility extension adds two staged operations and raises
accounting from 95/85 to 97/87 total/staged nodes. The adversarial per-operation fault
matrix covers both. This does not add a production execution boundary.
