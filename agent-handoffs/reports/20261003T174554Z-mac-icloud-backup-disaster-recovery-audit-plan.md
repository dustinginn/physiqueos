# PhysiqueOS Mac iCloud backup / disaster-recovery audit and design

- Generated: 2026-10-03T17:45:54Z
- Task: audit and design only
- Prompt authority: `5b7ece032abc2a10fd83da6c6c36ad578f1c1e1b`
- Repository: `dustinginn/physiqueos`
- Status: **AUDIT COMPLETE / IMPLEMENTATION NOT STARTED**
- Mutations: no iCloud write, deletion, repository move, credential copy, keychain/signing change, production action, build, archive, simulator mutation, or scheduler installation

## Executive finding

The desired design is viable, but the current Mac has meaningful local-only recovery exposure that GitHub does not cover:

- two shared PhysiqueOS Git object databases contain **22 local branch tips not reachable from any freshly fetched `origin` branch**: 12 tips / 14 commits in the current development database and 10 tips in the legacy database;
- five worktrees have verified dirty or untracked state, including binary PNG changes, local reports, local operational scripts, and an older manual-weight implementation;
- 13 older checkouts under `~/Documents` could not complete a read-only status scan in a reasonable time and remain `UNKNOWN-REVIEW`;
- `iCloud Drive/Documents` points to `~/Documents`, so an older PhysiqueOS repository/worktree estate is already exposed through the Documents File Provider namespace. This is precisely the layout the new system should avoid. No repository was moved in this task;
- there is no Time Machine destination and no local Time Machine snapshot;
- seven signed Xcode archives (Builds 79–84) occupy about 673 MiB; one valid Apple Development signing identity exists in the login keychain, and seven provisioning profiles exist, but those credentials/private-key dependencies must never enter the iCloud recovery bundle;
- the dedicated `PhysiqueOS Backups` destination does not yet exist. iCloud Drive is locally available, but no off-device upload was attempted or claimed.

Recommended architecture: create a small, self-contained, immutable recovery directory in a local non-iCloud staging root; aggregate only Git objects absent from fresh GitHub refs; capture index/worktree/untracked state through a strict allowlist; include safe local tools and release receipts; fail closed on secret scanning; checksum and scratch-restore it; then copy under a temporary name into `iCloud Drive/PhysiqueOS Backups`, verify destination bytes, rename locally, and track upload evidence separately from local copy success.

## Scope, evidence, and limitations

Read-only evidence was collected from the current Mac and from a fresh fetch of all `origin` heads plus remote tag enumeration. The repository default branch was verified at the exact prompt authority before work began.

Searched repository surfaces:

- `~/Developer/PhysiqueOS`
- `~/Documents/GitHub`
- `~/GitHub`
- `~/.claude/jobs`
- `~/.codex/worktrees`
- `/private/tmp`

Credential values were not read or printed. DigitalOcean context names, certificate/profile metadata, file names, modes, sizes, hashes, tool versions, and sanitized Git metadata were inspected. A sandboxed signing query initially returned zero identities; the authorized host-context metadata query correctly returned one valid identity. That discrepancy is recorded so the future backup tool does not rely on sandboxed keychain visibility.

The 13 `~/Documents` checkouts are a deliberate uncertainty: `git status`/`git worktree list` against that File Provider-backed estate remained blocked for more than 30 seconds even with optional locks and fsmonitor disabled. Commands were stopped without changing state. Their refs and worktree registration were still inventoried directly from Git administrative metadata. They must be handled as `UNKNOWN-REVIEW`, not presumed clean.

Current data-volume free space was about **13 GiB**, below the standing 15 GiB floor for disk-intensive work. No build, archive, large copy, or restore drill was run.

## Threat model

| Threat | V1 protection | Residual / not protected |
|---|---|---|
| SSD death, lost/stolen Mac, macOS reinstall | GitHub plus an uploaded recovery generation | Work after the last successful remote generation; credentials intentionally excluded |
| Accidental repo deletion or Git/worktree corruption | Fresh-origin clone plus recovery refs, branch/SHA inventory, dirty-state payloads | Unsaved editor buffers and unclassified files |
| Dirty/uncommitted loss | Binary-safe staged/unstaged capture plus exact file hashes | Unknown untracked paths block publication until classified |
| Unpushed commit/branch loss | Fresh-origin reachability proof plus aggregated Git bundle | A run that never reaches remote upload status |
| Local-tool loss | Safe uploader/coordination source, receipts, versions, and restore notes | Tool credentials and auth sessions require reauthentication |
| Xcode archive loss | Optional separate release archive tier | Archives not selected for that tier; Apple-side retention is not treated as a local archive substitute |
| iCloud unavailable/full/offline | Local staged generation retained; no rotation | No off-device RPO improvement until sync resumes |
| Interrupted iCloud copy | Hidden/incomplete destination name, COMPLETE marker, checksum verification, final rename | File Provider may expose intermediate remote events; consumers must require COMPLETE + valid checksums |
| Corrupt bundle | Per-file SHA-256, bundle verification, scratch restore, destination re-hash | Silent corruption after all checks requires a later scrub or restore drill to detect |
| Secret inclusion | Strict allowlist + filename/content/high-entropy scan, fail closed | No detector is infallible; unknown files never pass automatically |
| Destructive/ransomware state copied as newest | Immutable generations, delayed retention, weekly/monthly/release generations | iCloud is synchronization, not WORM; deletion can propagate across devices |
| GitHub available but local-only state gone | Recovery Git bundle, dirty/untracked payloads, safe tool inventory | Raw agents/sessions, simulator data, secrets, and private production data are intentionally excluded |
| GitHub outage or account lockout | Local/iCloud bundle can contain local-only Git plus manifests | Pushed-only source is not duplicated in the small tier; optional second remote is still recommended |

Not in scope: backup of production databases/cloud infrastructure, personal Mac files, Apple Health/iPhone data, email/browser data, raw Founder health exports, or full-machine bare-metal recovery.

## Point-in-time Mac inventory

### Host and toolchain

| Item | Observed | Classification |
|---|---|---|
| macOS | 26.6.2 (25G83), arm64 | `REPRODUCIBLE` inventory |
| Xcode | 27.0 (27A266a), selected at `/Applications/Xcode.app` | `REPRODUCIBLE` inventory |
| Swift | Apple Swift 6.4 | `REPRODUCIBLE` inventory |
| Git | Apple Git 2.54.0 | `REPRODUCIBLE` inventory |
| Node/npm | 22.23.2 / 10.9.8 under `~/.local/node/current` | `REPRODUCIBLE` inventory |
| Python | system Python 3.9.6 | `REPRODUCIBLE` inventory |
| doctl | 1.168.0 under `~/.local/bin` | `REPRODUCIBLE`; credentials separate |
| GitHub CLI | absent | `REPRODUCIBLE`; Git SSH transport works |
| Homebrew | absent | `REPRODUCIBLE` |
| XcodeGen/Tuist | absent | `REPRODUCIBLE`; not required |
| Project generator | tracked `ios/Scripts/generate_project.py`; generated Xcode project is tracked | `GITHUB-DURABLE` |
| Free data-volume space | about 13 GiB | `UNKNOWN-REVIEW` operational risk; below heavy-work floor |

### Git topology and durability

Five Git common-object databases were found, containing 75 present checkouts/worktrees and one stale linked-worktree registration:

| Common object database | Present checkouts | State |
|---|---:|---|
| current `~/Developer/PhysiqueOS/server/.git` | 34 | fully status-inventoried; 12 local-only branch tips |
| legacy `~/Documents/GitHub/physiqueos/.git` | 37 including primary checkout | 26 linked checkouts status-inventoried; 11 Documents checkouts `UNKNOWN-REVIEW`; 10 local-only branch tips |
| `~/Documents/GitHub/physiqueos-fresh-20260910/.git` | 2 | GitHub-reachable SHAs; filesystem status `UNKNOWN-REVIEW` |
| local handoff-publish clone | 1 | clean, GitHub durable |
| temporary Sleep audit bare repository | 1 | clean publication worktree, GitHub durable |

Current common database facts:

- worktree config is enabled;
- no stashes were present;
- no submodules were reported;
- common Git administrative data is about 114 MiB, of which packed objects are about 97 MiB;
- local-only closure is only 14 commits, 110 trees and 104 blobs (about 2.70 MiB logical; about 126 KiB currently compressed on disk);
- one canonical Git bundle can cover all 34 worktrees because they share the same object database, but it cannot by itself cover the legacy database unless a staging aggregator imports both ref sets.

Local branch tips not reachable from freshly fetched GitHub heads/tags in the current database:

| Branch | Tip | Local-only commits |
|---|---|---:|
| `claude/confidence-v3-shadow` | `53300b3e` | 3 |
| `claude/healthkit-workout-dormant-server` | `7bea5eb7` | 1 |
| `codex/auth-session-resilience-faceid-audit-20260929` | `bb979497` | 1 |
| `codex/healthkit-foundation-s1` | `f9ed0755` | 1 |
| `codex/healthkit-s1-integrated` | `13af4f8d` | 1 |
| `codex/healthkit-s1-postgres-acceptance` | `cf4c4710` | 1 |
| `codex/healthkit-s1-postgres-gate-complete` | `d505feab` | 1 |
| `codex/healthkit-s1-postgres-gate-final` | `ecae8a30` | 1 |
| `codex/healthkit-sleep-midnight-window-closeout-20261001` | `9945d40e` | 1 |
| `codex/phase4-migration-discovery-fix` | `4e924822` | 1 |
| `codex/strength-build62-root-cause-diagnosis` | `a39f2f3a` | 1 |
| `worktree-bridge-cse_01LTdZZXTqJ1pp9UKe6TVNY6` | `8256db4b` | 1 |

Legacy database tips not reachable from current GitHub heads/tags:

`claude/native-v1-activity-evidence` (`355eb6a4`), `claude/native-v1-operating-plan` (`50e54484`), `claude/native-v1-sandbox-weight-live` (`7257eba8`), `claude/native-v1-training-direct-upload` (`96cff909`), `claude/server-backend-plumbing-audit` (`c3be0c42`), `claude/server-evidence-chronology` (`e75f6570`), `codex/native-founder-auth-read-ios` (`2554bffb`), `codex/native-founder-auth-read-server` (`9ce6fdf4`), `codex/native-sandbox-authority` (`97a54312`), and `codex/server-plumbing-goal-phase-priority` (`4e76521c`).

The current remote has one tag (`native-v1.0-build40`), which does not make the local-only tips above durable.

### Detailed checkout/worktree inventory

Notation: `T/U` is tracked-dirty/untracked-file count. `B/A` is configured-upstream behind/ahead where it could be read safely. `reachable` means the exact HEAD is an ancestor of at least one freshly fetched current GitHub head. `local` means it is not. Detached/no-upstream checkouts use `n/a`; the File Provider-blocked legacy estate uses `unknown` rather than an invented answer.

Current development common database (34 checkouts, all status-inventoried):

| Checkout (sanitized) | Branch / state | HEAD | T/U | B/A | Durability |
|---|---|---|---:|---:|---|
| `~/Developer/PhysiqueOS/server` | `claude/server-confidence-narrative-v3` | `0a07132c` | 0/0 | n/a | reachable |
| `/private/tmp/physiqueos-build83-main` | detached | `0679b399` | 0/0 | n/a | reachable |
| `/private/tmp/physiqueos-dexa-main` | `codex/dexa-healthkit-checkpoints-20261003` | `1728b1bb` | 0/0 | 0/0 | reachable |
| `~/.claude/jobs/a4bc60c7/tmp/rotool` | detached | `4025f175` | 0/0 | n/a | reachable |
| `~/.claude/jobs/a4bc60c7/tmp/srvD` | detached | `b81c784e` | 0/8 | n/a | reachable + local files |
| `~/.claude/jobs/ade665c9/tmp/srv` | `claude/priority-skip-capability-server-20261002` | `2d967e48` | 0/0 | 0/0 | reachable |
| `~/.codex/worktrees/46d0/...` | detached | `6071c2c3` | 0/0 | n/a | reachable |
| `~/.codex/worktrees/593b/...` | `codex/auth-session-resilience-faceid-audit-20260929` | `bb979497` | 0/0 | n/a | **local** |
| `~/.codex/worktrees/watch-phase0-foundation/...` | `codex/apple-watch-workout-v1-phase1a-overnight` | `a173f27b` | 14/0 | 0/0 | reachable + dirty |
| `~/.codex/worktrees/watch-phase0-main-report/...` | detached | `7a2fa585` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/build82-live-workout-finish-stall-audit-20261002` | matching Claude branch | `6ac2118f` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/build82-sleep-v3-integration-20261002` | matching Claude branch | `e2cbcd0c` | 0/0 | 0/0 | reachable |
| `~/Developer/PhysiqueOS/build83-first-real-workout-corrections-20261003` | matching Claude branch | `3e61dd21` | 14/0 | n/a | reachable + dirty |
| `~/Developer/PhysiqueOS/build83-server-20261003` | `claude/build83-server-cardio-d1d2-20261003` | `22925625` | 0/0 | n/a | reachable; withdrawn candidate |
| `~/Developer/PhysiqueOS/build83-server-cooldown-20261003` | `codex/build83-server-cooldown-noncardio-20261003` | `89fe0a03` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/confidence-v3-shadow` | `claude/confidence-v3-shadow` | `53300b3e` | 0/0 | n/a | **local (3 commits)** |
| `~/Developer/PhysiqueOS/dexa-healthkit-native-build84-20261003` | matching Codex branch | `bcd92c74` | 0/0 | 0/0 | reachable |
| `~/Developer/PhysiqueOS/dexa-healthkit-server-20261003` | matching Codex branch | `b47663b3` | 0/0 | 0/0 | reachable |
| `~/Developer/PhysiqueOS/dexa-healthkit-writeback-audit-plan-20261002` | matching Claude branch | `789aafd9` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/healthkit-sleep-prospective-canary-audit-20261002` | matching Claude branch | `61fbfce9` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/native-build78-completion-notification-polish-20261001` | `claude/priority-skip-peptides-foam-native-20261002` | `88d597b2` | 0/0 | 0/0 | reachable |
| `~/Developer/PhysiqueOS/native-build79-widget-priority-skip-integration-20261002` | `claude/native-build80-widget-number-formatting-20261002` | `1783691d` | 0/0 | 0/0 | reachable |
| `~/Developer/PhysiqueOS/native-live-activities-discovery-20261001` | matching Claude branch | `b6d98889` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/native-production-read-foundation` | `codex/healthkit-sleep-midnight-window-closeout-20261001` | `9945d40e` | 0/2 | 0/1 | **local + local files** |
| `~/Developer/PhysiqueOS/native-remote-control` | detached | `bbb46e19` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/native-workout-session-authority-20261001` | matching Claude branch | `c299fa29` | 0/0 | 0/0 | reachable |
| `~/Developer/PhysiqueOS/photos-staged-native` | `codex/build46-progress-photos-semantic-native` | `c4687e6e` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/progress-photos-flexible-cadence-20261002` | `claude/sleep-canon-v3-native-accept-20261002` | `3ed3eae7` | 0/0 | 0/0 | reachable |
| `server/.claude/worktrees/agent-a676...` | detached | `677d5e35` | 0/0 | n/a | reachable |
| `server/.claude/worktrees/bridge-cse_017...` | `claude/server-3am-briefings` | `ba250af1` | 0/0 | 581/0 | reachable |
| `server/.claude/worktrees/bridge-cse_01F...` | bridge branch | `bbb46e19` | 0/0 | n/a | reachable |
| `server/.claude/worktrees/bridge-cse_01L...` | `server/photo-legacy-session-fix-20260921` | `a428fbda` | 0/0 | n/a | reachable |
| `server/.claude/worktrees/healthkit-sleep-phase-a-fresh-20260930` | `claude/sleep-evidence-polish-20261001` | `fcd26309` | 0/0 | n/a | reachable |
| `~/Developer/PhysiqueOS/unified-v3-base` | detached | `895935bd` | 0/0 | n/a | reachable |

Legacy common database (primary + 36 present linked worktrees; one additional stale registration):

| Checkout group/name | Branch | HEAD | T/U | B/A / durability |
|---|---|---|---:|---|
| `~/Documents/GitHub/physiqueos` | `main` | `403107d1` | unknown | 538/0; reachable |
| six `~/Documents/.../.claude/worktrees/bridge-cse_*` checkouts | bridge branches | `254b7d40` (2), `403107d1` (3), `577edee5` (1) | unknown | unknown; HEADs reachable |
| `~/Documents/GitHub/physiqueos-energy-contract-correction` | `claude/native-energy-contract-correction` | `935a1a36` | unknown | unknown; reachable |
| `~/Documents/GitHub/physiqueos-native-v1` | `native-v1` | `5fec8c75` | unknown | unknown; reachable |
| `~/Documents/GitHub/physiqueos-native-v1-activity-evidence` | matching Claude branch | `355eb6a4` | unknown | **local** |
| `~/Documents/GitHub/physiqueos-native-v1-claude` | `claude/native-v1-training-direct-upload` | `96cff909` | unknown | **local** |
| `~/.codex/worktrees/2b6d/physiqueos-native-v1` | `codex/native-v1-logging-completeness` | `ab8fc1a8` | 0/0 | reachable |
| 15 `~/GitHub/physiqueos-native-v1-*` checkouts other than sandbox-weight-live | named feature branches | exact HEADs inventoried | 0/0 each | reachable |
| `~/GitHub/physiqueos-native-v1-sandbox-weight-live` | matching Claude branch | `7257eba8` | 0/0 | **local; remote branch absent** |
| `~/GitHub/physiqueos-sandbox-weight-manual` | `claude/server-sandbox-weight-manual` | `254b7d40` | 8/5 | reachable + dirty |
| `~/GitHub/physiqueos-sandbox-weight-manual-reconciled` | matching Claude branch | `bf365d94` | 0/0 | reachable |
| `~/GitHub/physiqueos-server-backend-plumbing-audit` | matching Claude branch | `c3be0c42` | 0/0 | **local; remote branch absent** |
| `~/GitHub/physiqueos-server-evidence-chronology` | matching Claude branch | `e75f6570` | 0/0 | **local; remote branch absent** |
| `~/GitHub/physiqueos-server-native-photo-acceptance` | matching Codex branch | `a67e77f5` | 0/0 | reachable |
| `~/GitHub/physiqueos-server-plumbing-goal-phase-priority` | matching Codex branch | `4e76521c` | 0/0 | **local; remote branch absent** |
| `~/GitHub/physiqueos-server-plumbing-goal-phase-priority-reconciled` | matching Codex branch | `2cc0f471` | 0/0 | reachable |
| `~/GitHub/physiqueos-server-plumbing-training` | matching Codex branch | `bb8fbd65` | 0/0 | reachable |
| `~/GitHub/physiqueos-server-plumbing-weight` | matching Codex branch | `07f8ef8d` | 0/0 | reachable |
| stale `/private/tmp/physiqueos-native-v1-build16-founder-corrections` registration | matching Codex branch | `c6df7a90` | no checkout | reachable; metadata only |

The four additional legacy local-only branches not represented by a present checked-out tip are `claude/native-v1-operating-plan`, `codex/native-founder-auth-read-ios`, `codex/native-founder-auth-read-server`, and `codex/native-sandbox-authority`; the staging aggregator must include them.

Other databases/checkouts:

| Checkout | Branch/state | HEAD | Status | Durability |
|---|---|---|---|---|
| `~/Documents/GitHub/physiqueos-fresh-20260910` | `main` | `403107d1` | unknown | reachable |
| `~/Documents/GitHub/physiqueos-energy-correction-recovered` | matching Claude branch | `935a1a36` | unknown | reachable |
| local handoff-publish clone | `main` | `67c6e5d3` | clean | reachable |
| temporary Sleep audit publication worktree | detached | `a19a7095` | clean | reachable |

All configured upstream comparisons that were available are reflected above. For legacy branches with no safely readable live upstream comparison, fresh exact-SHA reachability—not a stale local `origin/*`—is the durability authority. The future audit tool must persist this per-checkout table mechanically as JSON so no path is summarized away.

### Dirty, untracked, ignored, and unknown state

| Location / state | Observed | Classification |
|---|---|---|
| Watch Phase 1A worktree | 14 modified tracked Home-widget PNGs; binary diff about 1.90 MiB | `BACKUP-WORTHY` until reconciled |
| Build 83 Native worktree | the same 14 modified PNGs; identical binary-diff SHA-256 | `BACKUP-WORTHY`, deduplicable |
| primary Remote Control host worktree | two untracked sanitized Sleep reports, about 27 KiB | `BACKUP-WORTHY` after content scan |
| `srvD` temporary worktree | eight untracked Sleep diagnostic/acceptance `.mjs` files, about 48 KiB | `BACKUP-WORTHY` only by explicit allowlist and content scan |
| legacy manual-weight worktree | 8 modified tracked JS files + 5 untracked source/test paths; diff about 16 KiB and untracked about 20 KiB | `BACKUP-WORTHY` |
| 13 Documents checkouts | status did not finish; refs known | `UNKNOWN-REVIEW`; block a complete promotion until inventoried or explicitly waived |
| primary ignored roots | `.next/`, `.tmp/`, `node_modules/` | mixed; see below |
| tracked working-tree state | no staged changes detected in the verified dirty trees | inventory fact |
| stashes | none in the two principal object databases | inventory fact |

The ignored `.tmp/digitalocean` directory contains the approved production-read runner plus historical audit, dry-run, verification, and apply bundles. The approved runner's blob exactly matches the GitHub-durable source `scripts/operations/runAppConsoleContextGzipSourceOnOpen.mjs` at historical authority `4025f175`; it need not be backed up as a local-only artifact. Historical mutation/apply bundles are **not** automatically safe merely because they are scripts; exclude them by default and classify individually.

Large reproducible output currently includes about 1.53 GiB of two primary `node_modules` trees, about 671 MiB of one `.next` tree, another 184 MiB `.next`, and smaller generated output. These are `REPRODUCIBLE` and must not enter any bundle.

### Remote Control and agent coordination

The durable operating procedure is `agent-handoffs/CLAUDE_PHONE_HANDOFF.md` on GitHub. The current Mac has Claude and Codex processes plus the established current Remote Control host checkout and a detached `native-remote-control` checkout. No dedicated Claude listener could be proven from the listener inventory; Remote Control may use outbound connectivity, so process presence is not proof of phone reachability.

`~/.claude` is about 3.31 GiB and `~/.codex` about 4.09 GiB. They contain settings, histories, SQLite state, caches/runtimes, and credential/auth files. Raw agent directories are `SECRET-NEVER-COPY`, not recovery payloads. Durable GitHub handoffs and the sanitized worktree manifest are the recovery authority. A later tool may emit a schema-whitelisted, value-redacted settings inventory; it must not copy `~/.claude/.credentials.json`, `~/.codex/auth.json`, session databases, histories, transcripts, or caches.

### Production-read and release tooling

DigitalOcean context names present: `default`, `physiqueos-audit`, `physiqueos-deploy` (current), `physiqueos-final-cutover-config`, `physiqueos-native-sandbox-ops`, `physiqueos-production-deploy`, and `physiqueos-production-migrate`. Only names/presence were read. The doctl config is mode 0600 and is `SECRET-NEVER-COPY`. The approved bounded production-read runner is GitHub-reproducible; credentials remain provider/local reauthentication state.

`~/.physiqueos-release` is about 560 KiB and contains four local-only executable/library source files, ExportOptions, state, 37 JSON release receipts (Builds 48–84), and upload logs. The four source blobs are not found in current Git history. They are `BACKUP-WORTHY` after strict content scanning. JSON receipts and `last-uploaded-build` are small and useful; include them after schema validation. Raw upload logs are optional and should be excluded by default or redacted/scanned. `release.conf`, its backup, and the `~/.appstoreconnect` container are `SECRET-NEVER-COPY`.

The App Store Connect secret container is present (two files, about 8 KiB); only presence/count/mode were inspected. SSH private material is likewise `SECRET-NEVER-COPY`.

### Xcode, signing, archives, and simulator

| Item | Observed | Classification |
|---|---|---|
| DerivedData | about 41 MiB | `REPRODUCIBLE`; exclude |
| DeviceSupport | currently zero in the checked legacy paths | `REPRODUCIBLE`; exclude |
| CoreSimulator | about 2.46 GiB; one iPhone and five Watch devices, all shutdown | `OPTIONAL-LARGE`, but raw device/Health data is excluded |
| Xcode archives | 7 archives, about 673 MiB total | `OPTIONAL-LARGE`; selected release tier only |
| Build 79 | 1.0 (79), about 91 MiB | uploaded history; optional |
| Build 80 | 1.0 (80), about 91 MiB | uploaded history; optional |
| Build 81 | 1.0 (81), about 91 MiB | uploaded history; optional |
| Build 82 | two archives, about 98 MiB each | duplicate/specialized release artifacts; optional |
| Build 83 | 1.0 (83), about 101 MiB | prior rollback candidate; recommended selected tier |
| Build 84 | 1.0 (84), about 102 MiB | current release; recommended selected tier |
| Signing identity | one valid Apple Development identity in `login.keychain-db` | `SECRET-NEVER-COPY` private key; metadata only |
| Provisioning profiles | seven profiles for app, extension, and Watch; expire Aug/Oct 2027 | `REPRODUCIBLE` via Apple/Xcode; do not copy in V1 |
| Xcode account directory | legacy checked path absent | reauthentication required |

`security find-identity` proves the current keychain can pair the public certificate with a usable private key. It does **not** prove that private key exists anywhere off this Mac. A replacement Mac should normally sign into Xcode with the Founder's Apple Account and create/download a new development identity/profile set. An encrypted private-key export, if ever desired, must be a separate Founder-controlled credential-backup project and must never be placed in this bundle. The App Store Connect API key path can upload but does not replace Xcode development signing/provisioning.

Simulator state is not needed for deterministic recovery. Source fixtures and test definitions belong in Git; raw Simulator databases may contain health/test data and should not be copied. Recreate devices and re-run deterministic seeding.

### Launch services, shell, and other backup systems

No PhysiqueOS/Claude/Codex/DigitalOcean-specific user/system launch agent was found and no scheduler is installed. The small `.zshrc` has no aliases/functions. There is no Time Machine destination and no local Time Machine snapshot.

## Classification policy

| Class | Current items |
|---|---|
| `GITHUB-DURABLE` | freshly reachable commits/branches/tags; tracked project generator; source/handoffs; approved production-read runner source |
| `REPRODUCIBLE` | Xcode/CLT, Node/npm, Python, doctl binary, Git, project generation, dependencies from lockfiles, DerivedData, `.next`, `node_modules`, Simulator runtimes/devices, DeviceSupport |
| `BACKUP-WORTHY` | 22 local-only branch tips; verified dirty/index/worktree state; explicitly approved untracked source/reports; local-only guarded release-tool source; schema-validated release receipts/state; sanitized worktree/tool/signing/profile inventories |
| `SECRET-NEVER-COPY` | keychains/private keys, ASC `.p8` and config, doctl tokens/config, SSH private keys, PATs, database URLs, `.env`, browser/session auth, Claude/Codex auth/session/history DBs, raw production/health exports, release credential configs |
| `OPTIONAL-LARGE` | selected signed `.xcarchive` generations only; raw logs only if separately justified; no simulator image/data tier in V1 |
| `UNKNOWN-REVIEW` | 13 Documents checkouts; any new untracked path; historical mutation/apply bundles; any file that misses allowlist, type, size, or scan rules |

## iCloud destination and remote-durability semantics

Local iCloud Drive root exists at `~/Library/Mobile Documents/com~apple~CloudDocs`; `bird` and `fileproviderd` are running. The proposed `PhysiqueOS Backups` folder does not exist. No capacity or remote-object assertion was made.

Apple exposes read-only ubiquitous-item metadata that reports whether an item is in iCloud, uploading, uploaded, or has an uploading error. Finder also distinguishes `Waiting to Upload`, `Out of Space`, `Downloaded`, and `In iCloud`. Those are stronger signals than local copy completion, but they are still the local system/File Provider's report. They do not provide an independent remote checksum or prove that a replacement Mac can retrieve identical bytes.

Required state machine:

1. `LOCAL_STAGING_COMPLETE` — source selection, secret scan, checksums, and scratch restore passed outside iCloud.
2. `LOCAL_ICLOUD_CONTAINER_COMPLETE` — bytes copied into the local iCloud container, every destination checksum matches, COMPLETE exists, and local rename succeeded.
3. `ICLOUD_UPLOAD_REPORTED_COMPLETE` — every final file reports ubiquitous, uploaded, not uploading, and no uploading error through supported Foundation metadata; Finder must not report waiting/out-of-space/ineligible.
4. `REMOTE_ICLOUD_SYNC_CONFIRMED` — a distinct device/session or iCloud.com downloads the final generation and verifies its manifest/checksums.
5. `REMOTE_ICLOUD_SYNC_UNKNOWN` — default when step 3 is unavailable/ambiguous or step 4 has not run.

Automation may claim step 3 if all supported metadata agrees. It must never translate local copy success into step 3 or step 4. V1's routine success notification should say `iCloud upload reported complete`; quarterly and first-copy drills should establish step 4.

Optimize Mac Storage may evict older local bytes after they upload. Keep the last two small recovery generations downloaded locally when practical, but always validate a retrieved copy before restore. Archive-tier items should not be assumed resident. The local staging copy must not be deleted merely because a placeholder exists.

Official references:

- Apple Foundation uploaded-state key: https://developer.apple.com/documentation/foundation/urlresourcekey/ubiquitousitemisuploadedkey
- Apple Finder iCloud status meanings: https://support.apple.com/guide/mac-help/check-icloud-drive-file-and-folder-status-mchlc994344b/mac
- Apple Optimize/Keep Downloaded behavior: https://support.apple.com/guide/mac-help/work-with-folders-and-files-in-icloud-drive-mchl1a02d711/mac

## Immutable bundle design

Local staging root (not under Desktop/Documents/iCloud):

`~/Library/Application Support/PhysiqueOS Recovery/staging/<generation>.incomplete/`

Final generation:

```text
PhysiqueOS-Recovery-YYYYMMDD-HHMMSSZ/
  MANIFEST.json
  README-RESTORE.md
  COMPLETE
  git/
    physiqueos-local.bundle
    refs.json
    worktrees.json
    remotes.json
  local-state/
    <worktree-id>/
      status-v2.z
      index.patch
      worktree.patch
      tracked-files/
      untracked-files/
      files.json
  release-inventory/
    receipts/
    state.json
    archives.json
    signing-metadata.json
  tool-inventory/
    versions.json
    safe-tools/
    doctl-context-names.json
    remote-control.json
  checksums/
    SHA256SUMS
    secret-scan.json
    restore-smoke-test.json
```

`MANIFEST.json` is canonical sorted JSON and records schema version, generation ID, reason (`daily`, `checkpoint`, `release`), source timestamp, origin URL sanitized to host/owner/repo, fresh remote-ref digest, selected/excluded paths with classification, source file hashes/modes, and every validation state. `COMPLETE` is written only after local validation and is included in the final checksum set. The generation is chmod read-only after completion; checksums, not permissions, are the integrity authority.

### Git aggregation

Do not bundle every checkout or copy a live `.git` directory.

1. Create a temporary bare aggregator inside local staging.
2. Fetch fresh GitHub heads/tags into `refs/remotes/origin/*` without mutating active repositories.
3. Import every local head and stash from each discovered common object database into collision-free `refs/recovery/<database-id>/heads/*` and `refs/recovery/<database-id>/stash` namespaces.
4. Prove each worktree HEAD as either reachable from a fresh origin ref or included under a recovery ref.
5. Create one PhysiqueOS bundle containing recovery refs and objects absent from fresh origin refs, with the remote SHAs recorded as prerequisites.
6. Run `git bundle verify`; clone/fetch it in scratch before promotion.

This allows one canonical bundle to cover the current and legacy worktree estates because they share the same upstream repository, while preserving their independent local namespaces. If another origin appears, create one bundle per origin.

### Dirty/index/worktree capture

Never reset, clean, stash, checkout, or write an active index.

For each non-clean worktree:

- record base HEAD, branch, upstream, sparse/submodule/worktree config, file modes, and NUL-delimited `git status --porcelain=v2`;
- generate separate binary-safe `git diff --cached --binary --full-index` and `git diff --binary --full-index` patches;
- additionally copy exact current bytes for modified tracked files and exact index blobs for staged paths into a content-addressed store, recording deletions/renames/symlink targets explicitly;
- capture untracked files only through the approved path/type/size allowlist;
- hash every captured file and compare restored status and hashes in scratch.

The exact-file store prevents recovery from depending only on patch interpretation and safely preserves binary PNG state. Identical content across worktrees is stored once and referenced by hash.

### Safe local artifacts

Default V1 inclusions after scanning:

- local-only guarded release-tool source (`bin/*`, `lib/*`) but not configs;
- schema-validated release receipt JSON and sanitized `last-uploaded-build` state;
- explicit current untracked reports/source listed in the allowlist;
- generated inventories for archives, provisioning/profile names and expiry, signing certificate fingerprint/expiry, doctl context names, tool versions, Remote Control/worktree setup, launch-service names, and restore notes.

Default exclusions include all `.tmp` payloads except an explicitly named allowlist entry; current approved production runner source is already GitHub-durable and should be regenerated from GitHub.

## Fail-closed secret scanning

Promotion stops on any unknown, scan error, unreadable file, symlink escape, special file, oversize path, or match. Reports contain only relative path, category, scanner version, rule ID, and count—never matching text, line contents, entropy sample, or secret value.

Required gates:

1. **Selection allowlist:** path, type/MIME, maximum size, and expected source classification must match.
2. **Filename denylist:** `.env*`, `*.pem`, `*.key`, `*.p8`, `*.p12`, `*.mobileprovision`, `*.keychain*`, SSH private-key names, `.netrc`, `.npmrc`, `.pypirc`, auth/credentials/cookies/session databases, doctl config, ASC config, and release credential configs.
3. **Content rules:** private-key headers; GitHub/DO/AWS/token formats; bearer/basic authorization; JWT-like tokens; password/secret/API-key assignments; credential-bearing database URLs; cloud/service-account material; high-entropy candidates outside approved binary formats.
4. **Structured validation:** receipt JSON and state files must match explicit schemas with rejected unknown fields.
5. **Git-object scan:** enumerate paths and scan decoded new/unpushed blobs before creating the opaque bundle; reject secret-named paths and suspicious contents.
6. **Binary policy:** only tracked or explicitly approved PNG/archive formats pass; validate magic/MIME and provenance. Unknown binary untracked files fail.
7. **Post-package extraction scan:** restore into scratch and repeat selection/content checks against the exact promoted bytes.

Exit states: `PASS`, `FAIL_SECRET`, `FAIL_UNKNOWN_FILE`, `FAIL_SCANNER_ERROR`. Only `PASS` may continue.

## Checksums, atomic copy, and corruption behavior

1. Stage locally outside iCloud under a generation-specific incomplete directory.
2. Write manifest and human restore guide.
3. Run source and packaged secret scans.
4. SHA-256 every payload/metadata file into sorted `checksums/SHA256SUMS`.
5. Run Git bundle verification and scratch restore.
6. Write `COMPLETE`; finalize local checksums; make generation read-only.
7. Copy to `iCloud Drive/PhysiqueOS Backups/.incoming-<generation>-<uuid>`.
8. Re-hash every destination file and require exact manifest equality.
9. Rename within the same local iCloud directory to the final immutable generation name. This is local namespace atomicity, not a claim about remote atomicity.
10. Wait asynchronously for supported ubiquitous-item upload metadata. Record reported status/error per file.
11. Atomically replace `LATEST.json` last, only after the final directory exists and upload is reported complete. `LATEST.json` is a convenience pointer; restore can scan generations if it is missing/corrupt.
12. Retain the local staged generation until policy permits removal; never delete source state.

An incomplete remote directory is harmless because restore ignores any directory without `COMPLETE` and a valid checksum set.

## Scratch restore drill and PASS contract

Use a newly created local scratch directory outside iCloud; never restore over active worktrees.

1. Clone current GitHub origin into a new object database.
2. Verify `origin/main` and recorded remote prerequisites.
3. Verify and fetch the recovery bundle into recovery namespaces.
4. Recreate each local-only branch at its recorded exact SHA.
5. For each captured dirty worktree, create a scratch worktree at its exact base SHA, restore index delta, worktree delta, exact tracked bytes, and approved untracked files.
6. Compare branch/SHA, status-v2 records, modes/symlinks, file hashes, and untracked inventory exactly.
7. Restore safe tools into a scratch tool root; run syntax/help checks only, never credentials or provider actions.
8. Run `python3 ios/Scripts/generate_project.py` in scratch and prove the generated project matches the recorded deterministic output.
9. Verify release receipt schemas and inventories.

PASS requires: bundle verifies; every expected ref resolves; every local-only object is present; every captured status/file hash matches; no extra file appears; secret scan remains PASS; safe tools parse; project generation is deterministic; and no credential is required. Missing GitHub/network, unknown worktree state, or any mismatch is a failed generation that must not be promoted.

## New-Mac recovery runbook

1. Founder sets up macOS, FileVault, Apple Account/iCloud Drive, and downloads/keeps the selected recovery generation locally.
2. Verify the generation's COMPLETE marker and SHA-256 manifest before executing any included file.
3. Install the recorded Xcode/toolchain and CLI versions; install Node/npm, Python, Git, doctl, Claude/Codex as needed.
4. Reauthenticate GitHub and clone `dustinginn/physiqueos` into `~/Developer/PhysiqueOS`—never Desktop/Documents/iCloud.
5. Fetch and verify the recovery Git bundle; recreate local-only branches from recovery refs.
6. Recreate only required worktrees from the sanitized manifest under local non-iCloud paths.
7. Restore staged/unstaged/exact tracked state and allowlisted untracked files in scratch first; compare exact status; then deliberately apply to chosen recovered worktrees.
8. Restore scanned safe release/coordination tools; regenerate the production-read runner from its GitHub source.
9. Founder reauthenticates GitHub SSH, DigitalOcean contexts, App Store Connect API access, Xcode Apple Account/signing, and Claude Remote Control. Do not restore old auth/session files.
10. Verify a valid code-signing identity and app/extension/Watch provisioning. Generate a new development identity through Apple/Xcode if the old private key is unavailable.
11. Run project-generator determinism, focused source tests, release-tool dry run, and bounded provider read-only health checks. Do not deploy/upload/mutate production as part of recovery.
12. Start a fresh Remote Control host from the correct recovered worktree and validate phone handoff.

Founder-only actions: Apple Account/iCloud sign-in and 2FA; GitHub/DO/ASC/Claude authentication; Apple signing identity decisions; approval of the exact first iCloud destination/copy; and any later credential backup/export.

## Cadence, RPO, retention, and storage

Recommended V1 cadence:

- **daily small generation at 03:30 local time**, with launchd running it on next wake/login if missed and a single-instance lock;
- **post-checkpoint generation** immediately after a major pushed patch/main handoff;
- **post-release generation** after TestFlight reports VALID and the main report/receipt is published;
- **weekly/release archive tier** only for selected `.xcarchive` files.

RPO:

- pushed source/handoffs: near-zero subject to GitHub availability;
- local-only commits, dirty and approved untracked state: target <=24 hours while the Mac can run, plus post-checkpoint/release capture;
- a missed/asleep/offline Mac extends RPO until the next successful run;
- hourly local snapshots would help accidental deletion but not SSD loss/theft and add operational complexity. Do not add them in V1; reconsider only if 24-hour dirty-state RPO proves inadequate.

Measured small-state inputs are tiny: about 2.7 MiB logical current local-only Git closure, about 1.9 MiB deduplicated PNG dirty state, tens of KiB of source/report deltas, and about 560 KiB of release tooling/receipts. The legacy Git database is only about 10 MiB total. A normal small generation should be approximately 5–25 MiB; set a **100 MiB hard review ceiling**. Crossing it fails promotion rather than silently absorbing caches/data.

Archive tier: Build 84 + Build 83 are about 203 MiB together; all seven current archives are about 673 MiB. Simulator data (2.46 GiB), agent directories (about 7.4 GiB combined), dependencies, and build caches remain excluded.

Recommended retention:

- 14 daily generations;
- 8 weekly generations;
- 12 monthly generations;
- 12 release/checkpoint generations;
- archive tier: current VALID archive + previous rollback archive + explicitly named milestones.

Never rotate in the same transaction that creates a generation. Rotation may happen only on a later successful run, after the new generation has local validation and `ICLOUD_UPLOAD_REPORTED_COMPLETE`; keep at least three uploaded small generations regardless of policy. If remote status is unknown, retention deletion is disabled. No retention deletion is implemented in this phase.

## Automation design (not installed)

One native macOS command, proposed name `physiqueos-recovery`, with modes:

- `audit` — read-only inventory/classification; no staging or iCloud writes;
- `dry-run` — compute selection, size, secret-scan plan, and expected refs without bundle/copy;
- `create` — local staging, validation, and—only after destination approval—iCloud promotion;
- `verify` — checksums, Git bundle, status metadata, and iCloud reported-state verification;
- `restore-smoke-test` — fresh scratch clone/restore and PASS report;
- `status` — last run, age, validation stage, upload-reported state, and stale/failure reason.

Implementation should use a small audited Swift/Foundation status helper for ubiquitous-item metadata plus shell/Python standard tools for Git, manifests, checksums, and scanning. A launchd agent should invoke it independently of Claude/Codex, with no embedded secrets, no network credential values, a lock, bounded logs, silent success, and a notification only for failure, unknown files, secret scan failure, iCloud unavailable/upload error, size-ceiling breach, or stale last success (>30 hours). Post-release invocation should be a separate explicit release-workflow hook, not inferred from arbitrary filesystem changes.

No script, launch agent, directory, retention job, or iCloud destination was created in this phase.

## Phased implementation

1. **Phase 1 — complete:** audit/design and Founder decisions.
2. **Phase 2:** implement local tool with `audit`/`dry-run` and deterministic manifests; no iCloud writes.
3. **Phase 3:** implement fail-closed secret scan, Git aggregation, checksums, and scratch restore; prove locally.
4. **Phase 4 hard gate:** Founder approves the exact destination; create `PhysiqueOS Backups` and perform the first real atomic copy.
5. **Phase 5:** retrieve that copy through a distinct iCloud surface/device/session and verify checksums.
6. **Phase 6:** install launchd schedule and release/checkpoint hook; enable retention only after multiple proven generations.

Existing repositories under `~/Documents` should later be reviewed and, if still active, deliberately migrated to non-iCloud local paths only after their local-only/dirty state is captured and ownership is clear. That is a separate controlled operation, not part of backup implementation and not authorized here.

## Founder decisions required before implementation

1. **Destination folder:** approve `iCloud Drive/PhysiqueOS Backups`. **Recommendation: approve exactly this dedicated folder; never use Desktop/Documents or place live repositories inside it.**
2. **Cadence:** choose the daily time and checkpoint trigger. **Recommendation: 03:30 local daily with next-wake catch-up, plus immediate post-major-main-checkpoint and post-TestFlight-VALID runs.**
3. **Retention:** approve generation counts. **Recommendation: 14 daily, 8 weekly, 12 monthly, 12 release/checkpoint; rotation only on a later upload-reported-successful run.**
4. **Signed xcarchives:** decide whether to add the separate large tier. **Recommendation: yes—post-release only, retain current VALID + previous rollback + named milestones; begin with Builds 84 and 83, not all archives daily.**
5. **Untracked-file policy:** choose strict allowlist versus broader automatic capture. **Recommendation: strict explicit path/type/size allowlist; any unknown blocks promotion and alerts, while the local failed staging report remains.**
6. **Second off-device destination:** decide whether to plan one after iCloud V1. **Recommendation: yes, later—add an encrypted independent destination or Time Machine because iCloud sync alone does not protect against propagated deletion/account loss; do not delay V1 for it.**
