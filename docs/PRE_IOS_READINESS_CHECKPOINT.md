# Pre-iOS Readiness Checkpoint

Date: 2026-07-25
Classification: Stabilization
Behavioral reference: PhysiqueOS web application

## Repository baseline

- Branch: `main`
- Starting commit: `0c662f7f9ebb01481f47e460175f861f968674a1`
- Founder runtime revision: `22`
- Founder runtime SHA-256: `C0F10B08B9B31EC4B4D770B069D4423F1DFBC4224CC60483D327D0AB92F8B6D6`
- Founder runtime location: `private/founder/runtime-store.json`
- Node: `v24.18.0`
- npm: `11.16.0`
- Next.js: `16.2.9`
- Build command: `npm run build`
- Unit-test command: `node_modules/.bin/vitest.cmd --config vitest.unit.config.js run`
- Lint command: `npm run lint`
- Local development URL: `http://127.0.0.1:3000`
- LAN development URL: `http://192.168.1.69:3000`

The working tree began this checkpoint with the accumulated approved product work
still uncommitted. Local generated logs, caches, private runtime data, and
diagnostic artifacts are not part of the intended source checkpoint.

## Architectural ownership

The web application is the behavioral reference for the first iOS client.
Native presentation should preserve the established product semantics rather
than independently reinterpret them.

### Shared domain behavior

- Strategy describes why and what PhysiqueOS intends to do.
- Execution describes the active schedule, dose, timing, reminders, priority,
  notes, and phased implementation of a strategy.
- Canonical evidence repositories own reconciled evidence identity,
  provenance, deduplication, and historical continuity.
- Goal repositories and lifecycle services own canonical Goal identity,
  phases, transitions, and evaluation state.
- Protocol repositories, protocol versions, and successor transactions own
  canonical protocol identity and history.
- Existing Execution records retain stable identity across editing,
  hydration, and timeline changes.
- Interpretation, reconciliation, confidence, Goal evaluation, protocol
  successor logic, and evidence-to-briefing intelligence should remain shared
  domain logic.

### Web-only concerns

- Next.js routes, server actions, redirects, cache revalidation, and dynamic
  rendering are web delivery concerns.
- React screen composition, browser navigation, CSS, and the current mobile web
  shell are presentation concerns.
- iOS should consume equivalent read models and transactions without copying
  web routing or cache mechanics into the domain.

## Early iOS priorities

1. Apple Health ingestion with deterministic session matching.
2. Live workout drafts using stable training-session identity.
3. Incremental movement and set persistence.
4. Native notifications.
5. Native permission and integration management.
6. Local-first background processing and reliable resume behavior.

Apple Health imports and later workout enrichment must continue to represent
one session. Missing movement detail is context, not a reason to create a
second workout.

## Stability constraints

- Do not fork Goal, protocol, evidence, or Execution identity rules in native
  presentation code.
- Do not make UI labels authoritative for lifecycle or evidence state.
- Do not introduce a second persistence contract for iOS.
- Preserve archived protocol and historical evidence data until a separately
  reviewed historical-browsing design exists.

## Runtime backup coverage

The Founder runtime is a separate local JSON file and is intentionally excluded
from source-control backup. A Git bundle recovers source and reachable Git
history, but does not recover private Founder runtime data. Runtime export must
remain a separate, explicit, privacy-aware operation; this checkpoint does not
copy private health data to cloud storage.

## Readiness blocker resolution

The recurring-commitment blocker was resolved as a mixed regression. The
verified reconciliation fixture has five authoritative recurring Execution
records: Morning Weigh-in, Foam Rolling, Progress Photos, Retatrutide, and
Tesamorelin. A completed one-time DEXA record is not recurring. Unconfigured
supplement projections and a synthetic DEXA scheduling row are navigation
opportunities, not recurring commitments. Retained peptide Execution records
are relinked through their stable reminder-to-protocol identities.

The follow-up protocol-state diagnostic blocker was a stale dependency on the
optional historical migration marker. Diagnostic authority now comes from
active roots, current versions, Goal ownership, and stable Execution links.
The marker is reported only as historical context and does not affect health.

## Gate C: conservative cleanup

- Local Codex request markers and development-session logs are ignored.
- No ambiguous dead exports, helpers, routes, or source files were removed.
- Canonical source, tests, documentation, and backup tooling remain eligible for
  the checkpoint commit.
- Generated screenshots, caches, logs, private runtime data, and environment
  files remain outside the source checkpoint.

## Gate D: validation

- Serial unit suite: 304 files passed; 2,679 tests passed.
- ESLint: passed with zero errors and two existing `no-img-element` warnings.
- Production build and TypeScript validation: passed.
- Build retained one existing Turbopack dynamic filesystem trace warning.
- `git diff --check`: passed.
- Nineteen core, Goal, evidence, briefing, protocol, and Execution routes each
  returned HTTP 200 over both `127.0.0.1` and `192.168.1.69`.
- Founder runtime remained at revision 22 with SHA-256
  `C0F10B08B9B31EC4B4D770B069D4423F1DFBC4224CC60483D327D0AB92F8B6D6`.

Four initially failing regression assertions were stale relative to the locked
canonical state: configured-only supplement Execution presentation, the July
24 complete Energy day, Energy hub freshness, and the retained Retatrutide
Goal-link set. Only the assertions were reconciled; production behavior was not
changed.

## Gate E: source checkpoint policy

The checkpoint includes reviewed canonical source, tests, documentation,
dependency manifests, and repository tooling. It intentionally excludes
generated screenshots, private Founder runtime data, uploads, environment
files, logs, dependencies, and build caches.

## Gate F: backup readiness

No synchronized Google Drive filesystem mount was available during this
checkpoint. `scripts/backupRepository.ps1` therefore accepts an explicit
destination rather than guessing one.

The backup workflow was verified in a disposable local directory using Windows
PowerShell 5: bundle creation, `git bundle verify`, manifest generation,
checksum verification, clone-based restoration, and restored-commit equality
all passed. Runtime export remained off, and the disposable artifact was
removed. `docs/BACKUP_RESTORE.md` contains the source and optional private
runtime recovery procedure.
