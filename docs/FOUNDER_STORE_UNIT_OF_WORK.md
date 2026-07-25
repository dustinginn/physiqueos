# Founder-Store Unit-of-Work Foundation

Date: 2026-07-19
Classification: High Risk persistence foundation
Scope: generic founder-store persistence only; no goal-transition orchestration

## Previous persistence behavior

The canonical owner is the singleton returned by `getFounderRuntimeStore()` in `founderRuntimeStore.js`. It hydrates `private/founder/runtime-store.json` into one global object. `FounderRepositories` are constructed once over that object and its nested collection references.

Existing repository writes mutate live collections first and then call `persistFounderRuntimeStore()`. That writer serializes the persisted collections, writes a same-directory temporary file, and attempts a rename. Its error path logs and returns rather than propagating. If rename retries fail, it uses a non-atomic copy fallback. The live object can therefore report a successful mutation when persistence failed, and several repository calls cannot form one semantic transaction.

The existing `updatedAt` value is wall-clock metadata and refresh ordering. It is not an optimistic-concurrency revision. Runtime refresh checks file mtime and `updatedAt`, then merges normalized data into the singleton so existing repository array references remain usable. No general runtime backup is created; special recovery and migration scripts own their own explicit backups.

The new unit-of-work is a separate strict path. Existing repository behavior is intentionally unchanged in this patch.
Once a unit-of-work revision exists, the legacy writer preserves `revision` and
`lastCommitId` without advancing them. A legacy file with no revision remains
revisionless through ordinary reads and is not migrated incidentally.

## Public contract

`createFounderStoreUnitOfWork({ filePath, liveStore, ...adapters })` returns:

- `begin()`: capture the persisted revision and create a deeply isolated staged store.
- `execute({ mutate, validate })`: convenience boundary for begin, asynchronous staged mutation, validation, and commit.
- `capabilities`: the guarantees implemented by this founder-store primitive.

A transaction exposes:

- `expectedRevision`
- `status`: `open`, `committing`, `committed`, or `aborted`
- `inspect()`: a detached read of staged state
- `mutate(callback)`: pass only the staged state to a synchronous or asynchronous callback
- `commit({ validate })`: validate, compare-and-swap, persist once, and publish once
- `abort()`: discard staging without writes

Commit and mutation cannot be repeated after commit or abort. Callback results are returned only inside the successful commit result.

## Revision and legacy compatibility

The authoritative schema field is:

```json
{ "revision": 0 }
```

Revision is a non-negative safe integer. A persisted legacy store with no valid `revision` reads deterministically as revision `0`; reading or beginning a transaction does not migrate or rewrite it. The first legitimate successful commit from that legacy state persists revision `1`. Every later successful commit advances exactly once. Failed and stale transactions do not advance it.

`updatedAt` remains audit/display metadata. `lastCommitId` records the successful unit-of-work commit identity for diagnostics but is not a concurrency token.

## Isolation and publication

Beginning a transaction uses `structuredClone(liveStore)`. All nested staged mutations are therefore detached from the singleton and from repository-held collection references. No staged repositories are introduced yet.

After durable replacement, publication recursively updates the existing live object and mutates existing arrays in place. This preserves repository references while making the new revision and all collection changes visible as one synchronous publication operation. The default publisher performs no I/O or domain callbacks.

If an injected publisher fails after replacement, the error is explicitly marked `committed: true`. The persisted file is authoritative and must be reloaded; the API never claims that durable state rolled back.

## Compare-and-swap and atomic persistence

Commit uses a per-file in-process mutex. Inside that mutex it:

1. Runs staged validation.
2. Reads the persisted store and checks the expected revision.
3. Builds the candidate with `revision + 1`, `updatedAt`, and `lastCommitId`.
4. Serializes the complete candidate.
5. Creates a unique same-directory temporary file with exclusive-create semantics.
6. Writes, flushes with `fsync`, and closes the temporary file.
7. Re-reads the persisted revision immediately before installation.
8. Atomically renames the temporary file over the store.
9. Synchronizes the containing directory on platforms where Node supports it; Windows treats the rename completion as the available boundary.
10. Publishes the committed candidate to the live singleton.

There is no copy fallback. Rename failure propagates and leaves the previous store authoritative. Pre-install failures discard staged state and remove the temporary file where possible.

A cleanup failure after successful installation is a warning, not a false rollback. Directory-sync unavailability is also returned as a post-install warning.

## Errors

`FounderStoreUnitOfWorkError` preserves the original `cause` and exposes stable codes:

- `FOUNDER_STORE_REVISION_CONFLICT`
- `FOUNDER_STORE_TRANSACTION_CLOSED`
- `FOUNDER_STORE_TRANSACTION_ABORTED`
- `FOUNDER_STORE_STAGE_FAILED`
- `FOUNDER_STORE_VALIDATION_FAILED`
- `FOUNDER_STORE_SERIALIZATION_FAILED`
- `FOUNDER_STORE_TEMP_WRITE_FAILED`
- `FOUNDER_STORE_ATOMIC_REPLACE_FAILED`
- `FOUNDER_STORE_PERSISTENCE_FAILED`
- `FOUNDER_STORE_PUBLICATION_FAILED`

Errors include only commit identity, revisions, failure stage, and committed status. Staged state and user evidence are not logged or embedded.

## Capabilities and limitations

The capability provider reports the generic founder-store primitive’s actual guarantees:

- cross-store state can be staged and committed in one replacement;
- same-file atomic commit;
- rollback by non-publication before replacement;
- staged writes;
- optimistic revision checking;
- persistence errors propagate.

It also reports `repositoryParticipation: false` and `crossProcessLocking: false`. Existing repositories are not yet scoped to staged state, so goal activation remains unavailable.

The in-process mutex prevents two overlapping commits in this process from both winning at one revision. Cross-process writers are rechecked immediately before rename, but compare-and-swap alone leaves a small time-of-check/time-of-use window between that read and rename. This patch does not claim distributed locking or protection from an external non-cooperating writer in that window.

## Next patch

The narrowest next concern is a staged repository factory that constructs only activation-required repositories against the unit-of-work snapshot with persistence callbacks disabled. It should prove that all scoped repository mutations remain staged and that one unit-of-work commit publishes their combined result. It must not implement the activation coordinator.
## Candidate finalization seam

`commit` optionally accepts generic `finalizeCandidate` and `validateFinalized`
callbacks. They run after authoritative commit ID/revision assignment and the final CAS,
but before serialization. This supports atomic resolution and validation of metadata that
must equal the returned commit result without adding goal-transition knowledge to the
unit of work.
