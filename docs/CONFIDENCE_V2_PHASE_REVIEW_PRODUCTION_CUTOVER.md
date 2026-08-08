# Confidence V2 and Phase Review production cutover

> **Superseded historical cutover (deployment completed 2026-08-03).** The authoritative production description is [Confidence V2 current state](./CONFIDENCE_V2_CURRENT_STATE.md). Retain this runbook as deployment evidence; do not execute its obsolete cutover steps as current operations.

Status: Checkpoint A blockers resolved; cutover not authorized or executed.

This runbook is the operator boundary for the canonical phase repair, Phase 2
activation-package seeding, runtime build/restart, and post-deployment
acceptance. It cross-references
[Confidence V2 Production Integration](./CONFIDENCE_V2_PRODUCTION_INTEGRATION.md),
[Phase Review Production Architecture](./PHASE_REVIEW_PRODUCTION_ARCHITECTURE.md),
[Phase Review Commit Coordinator](./PHASE_REVIEW_COMMIT_COORDINATOR.md),
[Phase 2 Activation Package](./PHASE_2_ACTIVATION_PACKAGE.md),
[Phase Review Production Boundary](./PHASE_REVIEW_PRODUCTION_BOUNDARY.md), and
[Architecture](./ARCHITECTURE.md).

No command in this document is authorized merely by its presence here. Each
backup, runtime change, Founder transaction, dry run, UI patch, publication and
rollback requires its own explicit approval.

## Fresh baseline: 2026-08-02

| Check | Verified value |
| --- | --- |
| Founder store | `private/founder/runtime-store.json` |
| SHA-256 | `242EF82A4EF8BAE6F9EF054DDAE3997CF0861700E5960EB5C51D25DEE08CB8BD` |
| Size | `18,277,398` bytes |
| Modified UTC | `2026-08-02T15:53:52.5941831Z` |
| Store revision | `58` |
| Store commit | `e0b9d7b6-0a1f-4ee9-b3ce-337249c162f0` |
| HTTP | `200` from `/api/health` |
| Listener | one `0.0.0.0:3000` listener, PID `10476` |
| Runtime | canonical scheduled task, Running and healthy; desired state `running` |
| ngrok | canonical PID `8340`; desired state `running`; public URL `https://float-departed-symphony.ngrok-free.dev`; upstream `http://localhost:3000` |
| Lock/temp artifacts | none |
| Goal fingerprint | `sha256_b3aac812a722bffc62515aae4a10e8bf74f290ad6a1722ce3e66e06bd85d49bb` |
| Phase 1 fingerprint | `sha256_3db138782db688faead2276bcd7e828baba11336430a7e03658a745fea499e1b` |

Baseline drift is a stop condition. Recompute every value at authorization
time. Do not substitute a newer hash into this runbook without regenerating and
reviewing the cutover package.

### Resolved Checkpoint A prerequisites

The later cutover must use the isolated source identity recorded in
[`FOUNDER_CUTOVER_BLOCKER_RESOLUTION_2026-08-02.md`](./FOUNDER_CUTOVER_BLOCKER_RESOLUTION_2026-08-02.md)
and the exact classification in
[`founder-cutover-manifest.json`](../deployment/founder-cutover-manifest.json).
The dirty main worktree is not a deployment source. Re-run source-hash,
excluded-path, focused-suite, lint, build and runbook verification against that
isolated workspace before authorizing a runtime stop.

No `next dev` / `npm run dev` process from this repository may exist at
Checkpoint A. The previously orphaned development tree rooted at PID `14300`
was stopped without changing production PID `10476`; do not restart the manual
`npm run dev -- --hostname 0.0.0.0` command before the cutover completes.

Ngrok is an independently scheduled production dependency and its canonical
baseline is now **running**, not stopped. Before the production stop, record its
PID, task definition, public URL, upstream and configuration hash. During the
bounded local-runtime stop, ngrok stays running and temporary upstream
unavailability is expected. After restart, require the same task definition,
public URL, upstream and configuration and, where practical, the same PID.

### Confidence correction to the proposed plan

Confidence V2 is already canonical in this exact baseline. The current
assessment is
`confidence_assessment_v2|925235158896c0135d8d1c3d8ceb703c2577e8a08da42b0f82bf5132581ee45c`,
published by `weekly_briefing` from
`weekly_briefing_2026-07-26_2026-08-01`. History contains two V1 records followed
by this V2 record. It is immutable production history.

Therefore this runbook does **not** schedule a future “first V2 publication.”
It first accepts or blocks on the existing V2 lineage, preserves V1
compatibility/history, and treats the next natural authorized publication as a
V2 successor. No deployment-time assessment is allowed.

## Dependency and writer audit

| Dependency | Source / path | Classification |
| --- | --- | --- |
| Runtime ownership | `startPhysiqueOS.ps1`, `stopPhysiqueOS.ps1`, `statusPhysiqueOS.ps1`, `monitorPhysiqueOS.ps1`, scheduled tasks | Safe when canonical scripts and control state are used. Monitor remains scheduled but honors `desiredState: stopped`. |
| Build | `npm run build`; Next `.next` output | Must run while the canonical runtime is stopped. Building over the directory used by a live server is prohibited. |
| Founder persistence | `FounderStoreUnitOfWork`, `persistFounderRuntimeStore` | Safe; both use the whole-store cross-process lock. |
| Lock | `runtime-store.json.mutation.lock`; recovery claim; bounded diagnostics | Safe; inspect before backup and every transaction. A stale/uncertain lock fails closed. |
| Backup | `createFounderRuntimeBackup.mjs`, `lib/founderRuntimeBackup.mjs` | Safe only after write freeze. Detects source changes, uses exclusive names and verifies byte hash/manifest. |
| Phase repair | `FounderPhaseCorrectionService`, `FounderProductionCutoverService` | Prepared, unexecuted; one authorized transaction. |
| Strategy/trajectory | `FounderPhase2ActivationPackageService`, model validators | Prepared, unexecuted; immutable exact fingerprints. |
| Acceptance | `PhaseActivationPackageAcceptanceService` | Safe only as two explicit lifecycle transitions per record; no seed-and-accept shortcut. |
| Stage executor | `executeFounderCutoverStage.mjs` | High risk. Executes exactly one authorized stage, holds the canonical lock through post-verification, and requires verified backup, revision, source hash, approval and exact confirmation. |
| Confidence publishing | canonical publication service, publisher registry, shared finalizer | Already live in the baseline. No restart publisher; Daily evidence and Energy/Training cannot publish. |
| Home / Goals | canonical persisted Confidence read and committed-phase projection services | Read-only. No evidence-presence fallback or local percentage calculation. |
| Phase Review | production factory, server-only action, dry-run unit of work, verifier | Prepared and disconnected. No production caller. |
| Synthetic DEXA / Phase Review preview | isolated preview route and card | Unrelated to production authorization; remain isolated. |
| Briefing History | persisted captured artifact/assessment reads | Safe and immutable; do not regenerate for cutover. |
| Existing `backupRepository.ps1 -IncludeRuntime` | repository-oriented optional copy | Must not be used as the canonical cutover backup: it lacks source-change detection and the required Founder lineage manifest. |
| `deployPhysiqueOS.ps1` | stop/build/start plus public ngrok assertion | Must not be used for this cutover. It combines independently authorized high-risk stages even though ngrok is now intentionally running. |

### Direct-write and bypass classification

These must be prohibited throughout the window: July reconciliation scripts,
protocol repair scripts, controlled Weekly/Midweek regeneration, DEXA recovery,
training-review reprocessing, transition-lineage migration, the historical
daily-Briefing migration, terminology registration, and any ad-hoc Node,
Vitest, Playwright or Codex process bound to production repositories.

Scripts using canonical persistence inherit the lock but are still prohibited
to keep the seven-revision plan deterministic. Direct `fs.writeFileSync` /
`renameSync` scripts must be migrated to the canonical lock before future
general use. `preparePlaywrightRuntimeStore.mjs` is unrelated when it targets
only its test copy. Repository backup, diff, log cleanup and read-only status
scripts are unrelated to Founder mutation.

API/action inspection found no Phase Review caller. The only action references
are definitions in `src/server/phase-review/actions.js`. `PhaseReviewCard` is
used only by the synthetic August 15 DEXA preview.

## Canonical sequence and ordering rationale

The proposed sequence is revised as follows:

1. Obtain a maintenance window and operationally prohibit every writer.
2. Verify the reviewed isolated deployment identity, absent development server,
   and canonical healthy ngrok running baseline.
3. Capture the live store/runtime/task/ngrok/Git/build baseline.
4. Explicitly stop the canonical runtime with `stopPhysiqueOS.ps1`.
5. Verify runtime `desiredState: stopped`, ngrok desired state still `running`,
   no listener, no lock/recovery claim, no
   commit temp, and no maintenance/test process.
6. Create and verify the immutable byte backup.
7. Build the application from the isolated deployment workspace while the
   runtime remains stopped.
8. Commit only the phase repair; verify and checkpoint.
9. Append only the Strategy draft; verify.
10. Move only Strategy to `ready_for_review`; verify.
11. Explicitly accept only Strategy; verify.
12. Append only the trajectory draft; verify.
13. Move only trajectory to `ready_for_review`; verify.
14. Explicitly accept only trajectory; verify.
15. Verify final revision/package fingerprints and all protected hashes.
16. Start with `startPhysiqueOS.ps1` and verify ownership/health.
17. Accept or block on the existing V2 Confidence lineage and exercise all read
   surfaces without regeneration.
18. After a real eligible artifact and explicit approval exist, run Continue
   and Begin dry runs separately and prove byte equality.
19. In a separate authorized patch, wire the locked production Phase Review
   control.
20. Leave the real Begin/Extend decision uncommitted until the Founder chooses.

Stopping precedes backup because a live request can race a copy even when the
backup tool detects it. Building occurs after backup and while stopped because
`.next` is the canonical listener's live build directory. Repair precedes
package generation because package semantics bind the corrected phase. Strategy
acceptance precedes trajectory seeding to keep every checkpoint and revision
unambiguous. The runtime starts only after offline data verification. Dry runs
come after start/read acceptance and require real artifact authorization.

## Write-freeze procedure

The monitor task does not need to be disabled. `stopPhysiqueOS.ps1` writes
runtime `desiredState: stopped`; the monitor then exits before runtime recovery
or the Briefing cadence runner. Ngrok remains independently scheduled with
`ngrokDesiredState: running`; do not stop it or alter either scheduled-task
definition.

Later authorized steps:

```powershell
Set-Location C:\Users\dusti\Documents\GitHub\physiqueos

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\statusPhysiqueOS.ps1
netstat -ano | Select-String ':3000\s+.*LISTENING'

# Separate approval required here.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stopPhysiqueOS.ps1

Get-Content .\logs\physiqueos-runtime-control.json -Raw
Get-Content .\logs\physiqueos-ngrok-control.json -Raw
netstat -ano | Select-String ':3000\s+.*LISTENING'
Get-ChildItem .\private\founder -Filter 'runtime-store.json.mutation*'
Get-ChildItem .\private\founder -Filter 'runtime-store.json.*.tmp'
Get-Process node -ErrorAction SilentlyContinue
```

Stop if runtime `desiredState` is not `stopped`, ngrok desired state is not
`running`, ngrok ownership/URL/upstream/config changes, any application listener
remains, a lock/recovery claim/temp exists, or an unexplained Node process can
load production code.
Scheduled finalizers cannot run while the runtime is stopped and the monitor
honors intentional stop. All manual writers remain prohibited even though the
cutover executor also acquires the lock.

## Backup package

Use an approved private destination outside the repository. Do not run this
command until backup creation is separately authorized and the runtime is
stopped.

```powershell
node .\scripts\createFounderRuntimeBackup.mjs `
  --destination "<approved-private-backup-root>" `
  --operator "<operator-id>"
```

The immutable directory contains `runtime-store.json` and `manifest.json`.
The manifest records source/backup path, size, modified time and SHA-256; store
revision/commit; Goal, phase and latest Confidence IDs/fingerprints; Git commit,
build identity, operator and timestamp. It refuses overwrite, active lock,
recovery claim or commit temp; re-reads source after copy; validates byte/hash
equality; and publishes only after verification.

Record the returned directory as `$backupDirectory`. Re-run verification before
each transaction by using the stage executor, which refuses an invalid manifest.

## Phase repair package

Preconditions:

- source store hash and revision exactly match the authorized stage input;
- Goal ID is the exact Founder active primary Build Lean Mass Goal;
- Goal fingerprint is
  `sha256_b3aac812a722bffc62515aae4a10e8bf74f290ad6a1722ce3e66e06bd85d49bb`;
- Phase 1 ID is `goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08`;
- Phase 2 ID is `goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78`;
- no phase decision, accepted package competitor, lock or commit temp exists.

Expected Goal fingerprint after repair:
`sha256_b9ce793570eb7bdf1448ef8681c09cf4f81f0f4556a36473b0b9e5e515af5017`.

Idempotency key:
`founder_build_lean_mass_phase_repair_v1|goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass|sha256_b9ce793570eb7bdf1448ef8681c09cf4f81f0f4556a36473b0b9e5e515af5017`.

The transaction changes only `timeline.startDate`, the two phases' canonical
start/review/status fields, completion-decision requirement, current/projected
pointers, and initializes empty `phaseReviewDecisions` and
`phaseLifecycleReadModels` only if absent. Phase 1 becomes active from July 19
with August 15 planned review and null completion. Phase 2 remains planned,
unstarted and projected for August 16. Goal target remains October 31.

Protocols, versions, Briefings, evidence/packages, DEXA, photos, Confidence
history/snapshot, transitions and Strategy/trajectory collections must remain
byte-semantically unchanged. No decision, Forecast, publication or artifact is
appended.

## Strategy and trajectory package

| Stage | Expected store revision | Candidate revision | Required record result |
| --- | ---: | ---: | --- |
| Repair | 58 | 59 | corrected Goal; empty lifecycle collections initialized |
| Strategy draft | 59 | 60 | status `draft`, revision 0 |
| Strategy review | 60 | 61 | status `ready_for_review`, revision 1 |
| Strategy accept | 61 | 62 | status `accepted`, revision 2 |
| Trajectory draft | 62 | 63 | status `draft`, revision 0 |
| Trajectory review | 63 | 64 | status `ready_for_review`, revision 1 |
| Trajectory accept | 64 | 65 | status `accepted`, revision 2 |

Strategy:

- ID: `phase_strategy|goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass|goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78|v1`
- content fingerprint:
  `sha256_188a8b174942b56addd4bbe2af04f47d1c1655931228f3008416196c2699c60c`
- actor: `user_founder_001`
- acceptance key: `accept-founder-phase-2-strategy-v1`

Trajectory:

- ID: `phase_expected_trajectory|goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass|goal_phase_8d7d4fae-084d-44e7-832a-994d5b735f78|v1`
- content fingerprint:
  `sha256_d9b661c29d7863ce01a1e0925cbc0c3f2eb5e51535772fa53a3c69041e3cbbb6`
- actor: `user_founder_001`
- acceptance key: `accept-founder-phase-2-trajectory-v1`

Every stage rejects the wrong store/record revision, fingerprint drift,
duplicates, conflicting replay and missing stage-bound approval. Acceptance
uses the real acceptance service and preserves accepted bytes. Exact replay is
idempotent and performs no commit.

## Operator transaction command

Run each row above manually and separately. Never loop these commands. Use the
previous command's `endingHash` as the next command's
`--expected-source-hash`. Stop if the revision or hash is unexpected.

```powershell
node .\scripts\executeFounderCutoverStage.mjs `
  --stage "<exact-stage-name>" `
  --expected-store-revision "<table-revision>" `
  --expected-source-hash "<current-whole-file-sha256>" `
  --backup-directory "$backupDirectory" `
  --approval-id "<separate-stage-approval-id>" `
  --operator "<operator-id>" `
  --confirm "AUTHORIZE PRODUCTION <exact-stage-name> REVISION <table-revision>"
```

The executor requires intentional runtime stop, no listener, a verified backup,
exact hash/revision/confirmation, and an explicit stage approval. It acquires
the whole-store lock before its fresh read, commits one unit of work, verifies
exactly one revision, lifecycle result and protected collections, then releases
the lock. It cannot execute multiple stages.

## Confidence V2 acceptance and next natural successor

Deployment does not activate Confidence by writing data. The reader continues
to support the two V1 historical records and the current V2 record. Home and
Goals read the persisted current assessment; historical Briefings render their
captured assessment. Restart, phase repair and package seeding are not
publishers. Daily evidence, Energy and Training cannot publish.

Before start acceptance, verify the existing V2 record's weekly publisher,
artifact, predecessor, evidence cutoff, semantic fingerprint, immutable history
and Home/Goals parity. The next natural authorized Midweek, Weekly, Monthly,
DEXA or qualifying Photo Briefing may publish a successor through the registry
and shared finalizer. Goal initialization is irrelevant because this Goal
already has canonical history.

For the next natural successor capture publisher, evidence cutoff, prior/current
assessment IDs, Structured Interpretation, Forecast, numeric projection,
Narrative, artifact, transaction/commit, history, Home, Goals and Briefing
History results.

- **Accepted:** registered natural publisher, exact predecessor, atomic
  artifact/assessment commit, immutable history, and matching movement /
  explanation across Home, Goals and Briefing.
- **Accepted with tuning needed:** every contract/invariant passes, but bounded
  Narrative wording or non-semantic presentation tuning is required.
- **Rollback/blocker:** unauthorized publisher, wrong predecessor/cutoff,
  non-atomic publication, history rewrite, conflicting percentage/band/
  explanation, or protected data mutation.

Do not generate a synthetic Briefing and do not replace an artifact to test
publication.

## Production dry-run package

The resulting post-package store revision is expected to be 65 and repaired
Phase 1 revision is expected to be 0. These are re-read, never trusted.

Continue template:

```json
{
  "goalId": "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
  "currentPhaseId": "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08",
  "decisionId": "phase-review-dry-run-extend-2-weeks-<approval-id>",
  "selectedOutcome": "extend_current_phase",
  "selectedDuration": "2_weeks",
  "selectedReviewAt": null,
  "expectedPhaseRevision": 0,
  "expectedStoreRevision": 65,
  "idempotencyKey": "phase-review-dry-run-extend-2-weeks-<approval-id>",
  "originatingArtifactId": "<eligible-artifact-id>",
  "approvalId": "<explicit-approval-id>",
  "approvalToken": "<secret-token-matching-artifact-hash>"
}
```

Begin uses the same identities/revisions and null duration/date, with
`selectedOutcome: begin_next_phase` and unique Begin decision/idempotency IDs.
It must resolve an August 16 start and accepted Strategy/trajectory revision 2.

There are currently **zero eligible artifact-bound authorizations**. This is a
hard gate. Do not insert a fixture or bypass. Once a real eligible artifact and
explicit decision exist, put one request in an operator-private temporary JSON
file and run, separately:

```powershell
node .\scripts\runFounderPhaseReviewDryRun.mjs `
  --request "<operator-private-request.json>" `
  --expected-source-hash "<current-sha256>" `
  --confirm "AUTHORIZE PRODUCTION PHASE REVIEW DRY RUN <decision-id>"
```

Success requires the real lock, fresh authorization/revision validation, full
participants and candidate verification, `committed: false`, candidate revision
66, byte-identical source, no decision/transaction/Confidence/read-model write,
and released lock. Continue additionally proves no Strategy activation,
Starting Forecast or Phase 2 activation. Begin proves accepted packages and the
planned Starting Forecast without persisting them.

## Build, restart and acceptance

With the verified backup and runtime still stopped:

```powershell
npm run lint
npm run build
```

Stop on any error. After all seven commits and offline verification, separately
authorize:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\startPhysiqueOS.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\statusPhysiqueOS.ps1
netstat -ano | Select-String ':3000\s+.*LISTENING'
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/health
```

Capture old/new production PID, task definition/ownership, deployment source
identity, `.next/BUILD_ID`, HTTP build identity, ngrok PID/control/task/URL/
upstream/config before and after, and the post-start Founder hash.
There must be exactly one listener and no store hash change merely from start.
Do not install or alter tasks and do not stop or restart ngrok.

### Acceptance matrix

- **Runtime:** HTTP 200; one canonical listener; scheduled ownership; healthy
  monitor; no stale lock/temp; ngrok remains canonical and running with the same
  task, public URL, upstream and configuration.
- **Founder:** revision 65; exact repair; one accepted Strategy and trajectory;
  no Phase Review decision; Phase 1 active; Phase 2 planned; no Starting
  Forecast; existing Confidence/Briefings unchanged.
- **Home:** July 19 start, August 15 planned review, Phase 1 active, no false end
  or activation, current persisted V2 assessment.
- **Goals:** canonical statuses/projection, no August 17 fixed end, no automatic
  transition, same persisted Confidence.
- **Briefings:** historical bytes unchanged; Weekly redundant label remains
  removed; DEXA V2 and Phase Review previews remain isolated; history renders
  captured Confidence.
- **Confidence:** existing V2 lineage accepted; no deployment assessment; V1
  history readable; movement/explanation invariant; no Daily/Energy/Training
  publisher.
- **Dry runs:** both pass only after real artifact authorization; production
  bytes unchanged; lock diagnostics show clean acquire/release.

## Rollback checkpoints

| Checkpoint | Decision |
| --- | --- |
| A — before any Founder write | Abort; no restore. Source remains production truth. |
| B — after repair, before package seeding | If no later revision/write exists, stop runtime and restore the exact byte backup with explicit approval. Otherwise compensate. |
| C — after any Strategy/trajectory stage, before start | Same rule: exact restore only when current revision is the expected last cutover revision and no later write exists. |
| D — after start, before any later natural publication/write | Stop runtime; roll back application/build and restore byte backup only if the store has no later write. |
| E — after any later natural V2 successor or other write | Never blindly restore. Preserve immutable lineage and use an explicitly designed compensating transaction. |

Before restoration verify backup manifest/hash, runtime intentional stop, no
listener/lock/temp, current revision and absence of later writes. Preserve the
failed store and diagnostics. Restore `runtime-store.json` byte-for-byte through
an approved atomic replacement, verify the original hash and revision, then
rehydrate through a separately approved start. If later writes exist, retain
the backup as evidence and build a Goal/package-scoped compensating transaction;
never overwrite unrelated evidence, Briefings or Confidence.

## Stop conditions and unresolved blockers

Stop for any baseline/hash/revision/fingerprint drift; live/uncertain lock;
listener after stop; unexplained writer; build/lint failure; backup mismatch;
unexpected commit count; protected collection change; duplicate package;
publication or phase decision; runtime ownership mismatch; or failed read
acceptance.

Current blockers requiring resolution/approval:

1. Existing V2 Confidence lineage must be reviewed because the proposed “first
   V2 after deployment” boundary has already occurred.
2. No eligible artifact-bound Phase Review authorization exists, so production
   dry-run requests cannot yet be credentialed.
3. The production action remains disconnected; UI wiring is a later patch.
4. Direct-write maintenance scripts remain operationally prohibited and should
   be migrated to the canonical lock before general future use.
5. Backup destination, operator IDs, seven approval IDs, deployment window and
   rollback authority are intentionally unresolved operator inputs.
6. The isolated deployment identity must be re-verified immediately before the
   separately authorized runtime stop; never substitute the dirty main worktree.

## Explicit authorization ledger

Separate approval is still required for: maintenance freeze; stop; private
backup creation; build/deployment; each of seven Founder transactions; start;
existing V2 lineage acceptance; each production dry run; UI wiring; the next
natural publication acceptance; the eventual Begin/Extend decision; any
restore, code rollback or compensating transaction. No approval may be inferred
from an earlier stage.

## Preparation safety attestation

This preparation did not invoke backup creation against production, stop/start,
deployment, phase repair, seeding, acceptance, publication, artifact
replacement, production dry run, migration, UI wiring, task changes or ngrok
changes. All transaction and backup execution tests use temporary full clones or
small temporary fixtures.
