# Phase Review production boundary and Founder-store lock

> **Superseded historical boundary record (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Preserve the safety rationale below; do not use its disconnected/pre-deployment steps as current operating instructions.

Status: implemented and tested; server-only action deliberately disconnected;
not deployed and not authorized to mutate production.

The controlled deployment, backup, repair, package-seeding and acceptance
sequence is defined in
[`CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md`](./CONFIDENCE_V2_PHASE_REVIEW_PRODUCTION_CUTOVER.md).

This document extends
[Phase Review Production Architecture](./PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md),
[Phase Review Commit Coordinator](./PHASE_REVIEW_COMMIT_COORDINATOR.md),
[Phase 2 Activation Package](./PHASE_2_ACTIVATION_PACKAGE.md),
[Confidence V2 Production Integration](./CONFIDENCE_V2_PRODUCTION_INTEGRATION.md),
and [Architecture](./ARCHITECTURE.md).

## Process and writer inventory

The Founder runtime store is one whole-file JSON database at
`private/founder/runtime-store.json`. Port ownership is not write ownership.
Every independent process that can reach a persistence path can race even when
only one process listens on port 3000.

| Process or path | Lifetime / overlap | Founder-store write capability |
| --- | --- | --- |
| `PhysiqueOS Production Server` scheduled task | Long-lived Next server. The observed healthy listener was PID 10476 on port 3000. Requests and server actions can overlap. | Hosts all production server actions and route handlers that call repositories or mutation services. |
| `PhysiqueOS Runtime Monitor` scheduled task | Independent recurring process; may overlap the listener and start the server task when unhealthy. | Does not directly write Founder data in the audited runtime script, but process recovery does not serialize application writes. |
| ngrok | Long-lived independent forwarding process. | No direct store writer; it increases the set of requests reaching the listener and is not a lock. |
| Next request/server-action execution | Concurrent work inside the listener and potentially across replacement/diagnostic servers. | Goal editing/transition, morning logging, evidence review/upload, execution/protocol saves, briefing finalization and other repository-backed actions. |
| Goal Transition services | Request or script scoped and able to overlap other writers. | Production Goal activation, staged repositories, transition lineage and protocol transition mutations. |
| Confidence and briefing publication | Request/finalizer scoped and able to overlap other writers. | Canonical Confidence publication, cadence/DEXA/photo publication, lower-level evidence commits, weekly briefing persistence and Goal Confidence refresh/finalization. |
| Goal/phase and execution services | Request scoped. | Goal phase persistence, Goal plan updates, peptide/supplement management, DEXA appointments, training event/workout persistence, progress-photo schedules and protocol successors. |
| Repair, reconciliation and migration scripts | Separate manually started Node processes. | Phase/protocol repair utilities, transition lineage migration, July evidence reconciliations, terminology alignment and daily-briefing migrations can replace the whole file. |
| Tests, simulations and diagnostics | Separate Node/Vitest/Codex processes; may overlap a live server. | Production-safety tests normally clone/read, but any test or diagnostic that constructs production repositories is a potential writer and must use the canonical persistence boundary. |

The source audit found two canonical persistence families:

- `FounderStoreUnitOfWork`, used by transaction-oriented domain services; and
- `persistFounderRuntimeStore`, used by legacy `FounderRepositories` and the
  production Goal Transition repositories.

Both now acquire the same operating-system-visible lock before their final
fresh read, validation and whole-file replacement. Phase Review acquires it
earlier and passes verified ownership through the nested unit of work so the
same lock remains held through post-commit verification. Direct scripts that
bypass these canonical persistence functions remain operationally prohibited
from running concurrently and should be migrated before they are authorized
again. No external application scheduler was found; briefing schedule intent is
stored in the Founder database and finalization runs through application code.

### Audited entry-point detail

The mutation-capable or mutation-adjacent server-action inventory is:

- root actions; Goal edit and Goal Transition review/preview actions;
- morning check-in, log and upload, priority detail;
- DEXA/photo evidence intake, evidence review, and photo Briefing actions;
- operating-plan root, activity, energy, training and Strategy-edit actions;
- DEXA, peptide, supplement and generic execution actions; and
- training-session commit actions.

The API route audit covered evidence reprocessing, narrative-engine lab work,
photo interpretation/simulation, private evidence, health, voice transcription
and log upload. The mutation-adjacent route set is
`api/lab/evidence-reprocess`, `api/lab/narrative-engine`, and `log/upload`;
none is a Phase Review caller. All other inspected API routes are read,
interpretation, health or synthetic-preview surfaces.

Scheduled/cadence ownership is `runBriefingCadence.mjs` plus
`BriefingCadenceExecutorService` and its registry/continuity services. Its
publication/finalization graph includes canonical Briefing Confidence,
PI cadence, DEXA and Photo publications, energy/training finalization, Goal
Confidence persistence, and Weekly Briefing persistence. These writers now
reach the canonical unit-of-work lock; the cadence runner itself is not a
separate database lock.

The audited separate maintenance scripts that name or resolve the Founder store
are `july27StrengthCanonicalRepair.js`, `midweekControlledRegeneration.js`,
`piGoalConfidenceControlledReconciliation.js`,
`reconcile-founder-july-2026.mjs`,
`reconcileFounderJul25TrainingPerformanceEvents.js`,
`reconcileFounderJuly25PhotoEventV34.js`, `reconcileFounderProtocols.js`,
`recoverConfirmedDexaEvent.js`,
`registerCanonicalExerciseTerminologyAlignment.js`, the coaching/nutrition/
supplement protocol repair scripts, `reprocessFounderJul25TrainingReview.js`,
`transitionProtocolLineageMigration.js`, and the daily-Briefing migration.
`preparePlaywrightRuntimeStore.mjs` targets a test copy and
`backupRepository.ps1` reads/copies for backup. Scripts that call canonical
persistence inherit the lock; direct `fs` whole-file scripts must remain
stopped while the runtime is writable and must be migrated before operational
authorization.

## Lock architecture

`FounderStoreMutationLock` owns the namespace
`founder_runtime_store_whole_file_writer`.

- Store: `private/founder/runtime-store.json`
- Lock: `private/founder/runtime-store.json.mutation.lock`
- Recovery claim: `private/founder/runtime-store.json.mutation.lock.recovery`
- Bounded diagnostics:
  `private/founder/runtime-store.json.mutation-lock-diagnostics.json`

Acquisition uses exclusive atomic file creation (`open` with `wx`, mode 0600).
Ordinary writes wait at most 750 ms in 50 ms deterministic intervals. Phase
Review leases are bounded to five minutes; the generic default maximum hold is
two minutes. Acquisition returns typed busy, timeout, invalid-metadata,
other-host, live-owner, stale-recovery, acquisition and release errors. There
is no application force-unlock API.

The lock covers:

1. authorization-independent narrow request validation and server actor
   resolution happen before acquisition;
2. lock acquisition;
3. final fresh byte/store read;
4. authorization and expected store/phase revision validation;
5. participant prepare, validate and candidate commit;
6. candidate validation, atomic replacement and live-store publication;
7. fresh persisted post-commit verification, or complete pre-commit failure
   handling;
8. owner-verified release.

The lock is never released between participant preparation and persistence.
Because the database is a whole file, there is no per-Goal lock.

### Metadata and diagnostics

The lock stores its schema/namespace, absolute store path, SHA-256 token hash,
16-character safe identifier, PID, hostname, acquisition/expiration time,
maximum hold, operation, Goal ID, decision ID and request ID. The raw random
ownership token exists only in the owner process. Release re-reads the file and
requires the current token hash; a wrong owner cannot release it.

Diagnostics retain at most 100 acquisition, release and stale-recovery records:
operation, safe identifier, PID/host, timestamps, outcome, Goal/decision/request
IDs, starting/ending revision and error code. They contain no Founder evidence,
Confidence, protocol, health or presentation data. Diagnostic writes are
best-effort and cannot weaken ownership.

### Stale recovery

Age alone never permits deletion. Canonical automatic recovery requires all of:

- valid lock metadata and an expired explicit lease;
- the same hostname;
- an owner PID that is no longer alive;
- no `runtime-store.json.*.tmp` commit candidate;
- exclusive ownership of a short-lived recovery-claim file; and
- a second metadata/token-hash check immediately before atomic abandonment.

A live PID, another hostname, invalid/uncertain metadata, an active commit temp,
or an existing recovery claim fails closed. The service never auto-deletes an
other-host or unverifiable lock. An abandoned recovery claim also fails closed
for manual inspection; ordinary code does not force through it.

## Production coordinator factory

`createProductionPhaseReviewCoordinatorFactory()` takes no caller-supplied
participants, repositories, callbacks, actor, clock or authorization bypass. It
binds the canonical production store and live singleton, whole-store lock,
atomic coordinator, complete canonical participant registry, Strategy and
trajectory acceptance contracts, Starting Forecast, Goal Contract adapter,
Interpretation/Forecast/Narrative V2, numeric Confidence projection,
Confidence persistence, lifecycle read models, transaction logging, clock,
Founder actor resolver and artifact-bound authorization verifier. Construction
fails if required dependencies are absent.

The returned surface is only `execute`, `dryRun`, `inspectLock`, version and a
read-only dependency manifest. An isolated production-shaped factory accepts a
temporary store and refuses the exact production path; it exists for full-clone
verification and uses the same internal construction.

## Server action and authorization contract

`src/server/phase-review/actions.js` is marked `server-only` and exports commit
and dry-run functions. It has no UI, page, route, API client, scheduler,
briefing, startup or synthetic DEXA caller.

The request allow-list is exactly:

- `goalId`, `currentPhaseId`, `decisionId`, `selectedOutcome`;
- nullable `selectedDuration` and `selectedReviewAt`;
- `expectedPhaseRevision`, `expectedStoreRevision`, `idempotencyKey`;
- `originatingArtifactId`, `approvalId`, and `approvalToken`.

Unknown keys fail, including client actor, phase status, Goal ownership,
Strategy/trajectory IDs, recommendation copy, Confidence or arbitrary mutation
content. The actor is resolved server-side and must be `user_founder_001`.

Authorization is explicit and artifact-bound. The originating canonical daily
briefing or Confidence initialization artifact must contain an unexpired Phase
Review authorization for the exact Goal/current phase, allowed outcome,
expected revisions, approval ID and SHA-256 approval-token hash, and must record
an explicit user decision. Approval reuse is allowed only as an exact committed
idempotent replay; conflicting reuse fails.

Fresh-state validation under the lock requires an owned active primary Goal,
the exact active current phase, exact store/phase revisions and an allowed
lifecycle state.

### Begin validation

Begin additionally requires the next phase to be planned and unstarted; exactly
one accepted, unsuperseded, semantically valid, revision-matching Strategy and
Expected Trajectory; complete Starting Forecast dependencies; the canonical
July baseline and latest canonical Confidence context; and a valid originating
artifact. The start is derived server-side as the first full local day after
approval, so an August 15 decision produces an August 16 actual start. No
client-selected start, accepted package identity or Confidence value is used.

### Extend validation

Extend keeps the current phase active. It accepts one, two or three weeks, or a
custom date. The derived/selected review must be after the current review and no
later than the Goal target. The original review milestone, PI recommendation
and user selection remain distinct. Extend cannot activate Phase 2, replace or
activate Strategy/trajectory, create a Starting Forecast or append Confidence
history.

## Dry run and post-commit verification

Dry run acquires the same lock, performs the same fresh read, authorization,
revision validation, production-shaped coordinator construction and participant
pipeline. A nonpersisting unit of work captures the finalized candidate and
simulates the next revision/commit lineage. The boundary then verifies the
candidate and rechecks byte equality. It returns a narrow mutation summary and
never replaces the file, publishes the live singleton, appends a durable
decision/transaction, creates Confidence or mutates read models.

Before success is reported, Begin verification requires exactly one revision,
completed Phase 1, active Phase 2, valid Strategy/trajectory pointers, Starting
Forecast, decision, transaction and lifecycle read model. Extend verification
requires exactly one revision, active Phase 1, the updated date, preserved
original milestone, incremented extension count and successor projection, with
no Starting Forecast/Confidence addition or Strategy/trajectory activation.
Both compare protected Strategy/trajectory collections byte-for-byte and verify
protocols, protocol versions, briefings, evidence/packages, DEXA and photos are
unchanged.

A verification failure after persistence is a committed critical error. The
lock is released only after the failure is captured. No retry or reverse write
is attempted.

## Operational procedure

### Preflight and dry run

1. Confirm no migration, repair, transition, publication or maintenance script
   is running.
2. Capture a byte-for-byte store backup, SHA-256, length, modification time and
   current store/phase revisions.
3. Inspect the canonical lock and diagnostics. Do not proceed if ownership is
   uncertain.
4. Submit the exact explicit approval through the disconnected server boundary
   only after separately authorized wiring exists.
5. Run dry run; verify byte hash is unchanged and inspect the mutation summary.
6. Re-read revisions before the separately authorized commit request.

### Lock incidents

- **Owner alive:** fail closed; report safe owner identifier, PID, host,
  operation, acquisition/expiration and Goal/decision IDs. Do not delete.
- **Owner dead on this host:** inspect metadata, expiration, PID and commit temp
  files. The next canonical acquisition recovers it only when every stale rule
  passes and records the recovery.
- **Other host or invalid metadata:** fail closed, preserve files and
  diagnostics, stop writers, and conduct manual operational review. Do not
  force-unlock from application code.
- **Recovery claim exists:** fail closed and investigate the interrupted
  recovery and store/temp-file state before any manual action.

### Commit or verification incident

If persistence fails before replacement, discard the candidate and verify the
original hash. If a commit succeeds but post-verification fails, immediately
stop all Founder writers, preserve the store, lock diagnostics, transaction IDs
and byte backup, and do not retry. If the current revision still equals the
failed commit's revision and no later writer exists, an explicitly authorized
operator may atomically restore the byte-for-byte backup and rehydrate the live
store. If a later revision exists, never overwrite it: construct and review a
compensating transaction from the saved before-state. Verify final hash and all
protected collections either way.

## Deployment order and remaining authorization

This code does not create a production lock file until a writer runs after
deployment. Required, separately authorized actions remain:

1. review and approve this boundary and writer inventory;
2. create a production backup and maintenance/rollback window;
3. deploy lock/boundary code and separately authorize any runtime restart;
4. migrate or prohibit direct scripts that bypass canonical persistence;
5. explicitly authorize and execute the canonical Founder phase-date repair;
6. separately seed, review and accept Phase 2 Strategy;
7. separately seed, review and accept Phase 2 Expected Trajectory;
8. separately authorize Confidence V2 deployment/publication if desired;
9. separately wire an eligible artifact and production Phase Review control;
10. run authorized dry run and inspect it;
11. capture the Founder decision and separately authorize Begin or Extend;
12. execute once and perform independent post-deployment verification.

No step above is authorized by this patch. There was no deployment, restart,
repair, migration, production acceptance, phase decision, UI connection,
artifact regeneration, Confidence publication, task change or ngrok change.
