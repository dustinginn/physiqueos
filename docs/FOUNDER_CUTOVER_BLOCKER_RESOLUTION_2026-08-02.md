# Founder cutover Checkpoint A blocker resolution

Status: blocker-resolution evidence in progress; no production cutover,
backup, deployment, Founder transaction, phase repair, Strategy/trajectory
seed or acceptance, Confidence publication, briefing replacement, or runtime
stop was authorized or performed.

## Worktree classification

The complete reviewed classification is machine-readable in
[`deployment/founder-cutover-manifest.json`](../deployment/founder-cutover-manifest.json).
It pins base commit `bb2c7399714af041a1f4b8dfeac09342d57cdc97` and classifies
the original 317 changed paths as:

- 212 accepted Confidence V2, phase, DEXA V2, rendering, persistence and
  cutover paths;
- 60 unrelated application paths preserved in the main worktree;
- 45 generated screenshots excluded from deployment;
- zero ambiguous paths.

`src/domain/utils/localDate.js` is the one explicit required dependency. The
accepted persisted-Confidence change in `HomeBriefingService` shares that file
boundary with already-present execution-focus argument plumbing. Both files are
reproduced byte-for-byte in the isolated identity; the remaining execution,
Morning Check-In, Evidence Review, peptide and training-library work stays
excluded. This coupling is explicit in the manifest rather than silently
broadening the source.

The first 214/58 audit was corrected during isolated validation: Morning
Check-In `actions.js` and its executable test import the excluded Morning
Priority reconciliation service and are not required by the accepted
architecture. They were moved to preserved scope, producing the final 212/60
split rather than silently importing that feature.

The blocker-resolution manifest, identity tool/test and this record are the
four additional operational paths. They are kept separate from the final
212-path architecture count and are included in the reproducible identity.

## Development-server isolation

The development tree was re-identified as:

| PID | Parent | Role / command evidence |
| ---: | ---: | --- |
| 14300 | 2416 (no longer present) | `npm-cli.js run dev -- --hostname 0.0.0.0` |
| 11748 | 14300 | npm-owned `cmd.exe` wrapper |
| 588 | 11748 | repository `next dev --hostname 0.0.0.0` |
| 3368 | 588 | Next development server child; listener `0.0.0.0:3001` |
| 3376 | 3368 | `.next/dev/build/...` child; internal listener `127.0.0.1:59021` |

The command paths resolved to this repository. The original parent terminal PID
2416 no longer existed, so no owning console remained for Ctrl+C. Targeted
`Stop-Process` and non-force tree termination were attempted first and were
unavailable. The verified tree rooted at PID 14300 was then stopped with
`taskkill.exe /PID 14300 /T /F`. No unrelated process was targeted.

After shutdown, PIDs 14300, 11748, 588, 3368 and 3376 were absent. Canonical
production PID 10476 remained scheduler-owned, healthy with HTTP 200, and the
only `0.0.0.0:3000` listener. The exact restart source was the manual command
`npm run dev -- --hostname 0.0.0.0`; do not run it before or during the later
cutover. No broad development tooling or scheduled task was disabled.

## Ngrok ownership and baseline decision

The active tunnel was proven canonical:

- scheduled task: `PhysiqueOS Ngrok Tunnel`, state `Running`, S4U principal
  `dusti`, Limited run level;
- executable: `C:\Users\dusti\AppData\Local\ngrok\ngrok.exe`;
- working directory: `C:\Users\dusti\AppData\Local\ngrok`;
- arguments: `http 3000`;
- PID: 8340, scheduler-owned in session 0;
- public URL: `https://float-departed-symphony.ngrok-free.dev`;
- upstream: `http://localhost:3000`;
- config: `C:\Users\dusti\AppData\Local\ngrok\ngrok.yml`;
- config SHA-256:
  `0E8E89B0704D7B715D71E34F2B2C1F17D9C3E3D2B925A398A8D10870AEC5D487`;
- one canonical process, zero foreign processes, healthy tunnel and upstream;
- observed connection/request counts prove the tunnel is in use.

The canonical `startPhysiqueOSNgrok.ps1` action reconciled only the stale
control metadata from `stopped` to `running`. Because the tunnel was already
healthy, it did not invoke the scheduled task. PID, process start time, task
definition, URL, upstream and config remained unchanged. Production start/stop
scripts contain no ngrok action; ngrok is independently monitored.

The later cutover must preserve ngrok while the local application is stopped.
Temporary upstream failure is expected during that bounded interval. After
production restart, require the same task definition, URL, upstream and config,
and the same PID where practical.

## Deployment identity and validation

The final isolated workspace is:

`C:\Users\dusti\AppData\Local\Temp\physiqueos-cutover-bb2c7399-20260802-final`

Its `deployment-identity.json` is the authority for the exact source-tree SHA,
all 216 source hashes (212 architecture plus four blocker-resolution paths),
the excluded-path preservation digest and the final `.next/BUILD_ID`. The hash
is intentionally not copied into this source document because doing so would
make the document self-referential.

Validation completed from isolated source with a transient full-store test
clone that was removed before lint, build and final identity verification:

- manifest, source-hash, excluded-path, production-PID protection and ngrok
  agreement tests passed;
- lock, backup, cutover, phase correction, Phase 2 activation, coordinator and
  production-boundary suites: 16 files / 94 tests passed;
- Confidence V2, Forecast, Interpretation, Narrative, canonical presentation,
  DEXA V2, Monthly, Weekly, Home and Goals suites: 42 files / 325 tests passed;
- broader serial accepted-source run: 62 files / 558 tests passed before four
  production-shaped workers exhausted the default 4 GB heap; the required
  affected boundary files then passed in the bounded 8 GB runs above;
- lint: zero errors and two pre-existing `<img>` warnings;
- production build: passed after `npm ci --offline --ignore-scripts`
  materialized dependencies inside the isolated filesystem root;
- diff integrity: all accepted source hashes matched, all excluded tracked
  paths remained at base content, excluded untracked paths and all screenshots
  were absent, and no Founder runtime store remained in the workspace.

Two production-window assertions remain intentionally unfixed because they are
baseline-fixture drift outside this blocker patch:

- `PIEnergyConfidenceFinalizationService.test.js` expects the old July 19-25
  cadence-owned state, while the current clone correctly resolves
  `awaiting_pair` for that stale pair;
- `WeeklyBriefingPersistenceService.test.js` expects regeneration of
  `weekly_briefing_2026-07-19_2026-07-25`, while the current canonical closed
  window is `weekly_briefing_2026-07-26_2026-08-01`.

The initial build attempt with a dependency junction failed before compilation
because Turbopack rejects `node_modules` symlinks outside its filesystem root.
This was infrastructure-only; the no-link workspace with locally cached,
materialized dependencies compiled successfully.

## Revised Checkpoint A

Checkpoint A is ready when the final identity is re-verified immediately before
the later maintenance window. The gate now requires:

- the exact isolated identity and successful build;
- canonical production healthy and still the only port-3000 listener;
- no `next dev`, test or diagnostic writer bound to production;
- the unchanged Founder hash/revision/commit and no lock/recovery/temp artifact;
- canonical ngrok desired and actual state both `running`, with the recorded
  task, PID, public URL, upstream and config unchanged.

This patch stops at Checkpoint A. The next authorization is a new, explicit
cutover maintenance-window authorization covering the deployment identity,
write freeze and canonical production stop. Backup creation, each of the seven
Founder transactions, restart, V2 lineage acceptance and later artifact-bound
dry runs continue to require their own approvals. There is still no eligible
artifact-bound Phase Review authorization.

## Runtime safety

The protected Founder store remained:

- SHA-256 `242EF82A4EF8BAE6F9EF054DDAE3997CF0861700E5960EB5C51D25DEE08CB8BD`;
- 18,277,398 bytes;
- revision 58;
- commit `e0b9d7b6-0a1f-4ee9-b3ce-337249c162f0`;
- no lock, recovery claim or commit temp artifact.

The only authorized runtime changes were stopping the non-canonical development
tree and reconciling canonical ngrok control metadata. The production runtime
and scheduled-task definitions were not changed.
