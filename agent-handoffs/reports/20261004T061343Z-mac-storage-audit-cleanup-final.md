# PhysiqueOS Mac storage audit and conflict-safe cleanup — final

- Generated (UTC): `2026-10-04T06:13:43Z`
- Assignment authority: `8b82acfd569d3878166e96d8618fd1a475fc7987`
- Reporting branch: `codex/mac-storage-audit-cleanup-20261004`
- Pre-cleanup checkpoint: `ce95af38`
- Status: **COMPLETE — all material Tier 1/2 candidates proven safe in the active-work context were cleaned; 30 GiB was not safely reachable**

## Outcome

Two exact regenerable targets were deleted after process, Git-ignore, tracking, age, and open-handle gates. Data-volume free space rose from **14,020,088 KiB (13.371 GiB)** immediately before cleanup to **16,079,328 KiB (15.334 GiB)** at final measurement: a net filesystem gain of **2,059,240 KiB (1.964 GiB)**. The nominal allocated size of the two deleted targets was 2,234,800 KiB (2.131 GiB); concurrent macOS and active design work account for the difference.

The result is above the standing 15 GiB hard floor but below the preferred 20–30 GiB development reserve. The 30 GiB target could not be reached without touching active/ambiguous work, active tooling caches, current simulator/runtime state, unique logs, or protected recovery/release material, so cleanup stopped.

No process was killed or paused. No application source, current design artifact, worktree, branch, simulator, archive, signing asset, credential, production tool, or iCloud backup material was deleted or modified by this task.

## Before

| Metric | Value |
|---|---:|
| APFS container capacity | 494.4 GB decimal |
| Data-volume capacity (`df`) | 482,797,652 KiB (460.432 GiB) |
| Data-volume used | 441,966,944 KiB (421.493 GiB) |
| Data-volume available | **14,020,088 KiB (13.371 GiB)** |
| Swap | 4,096 MiB allocated; 3,235 MiB used |
| Purgeable | Not exposed as a separate value by `diskutil info` / `diskutil apfs list` on this host |

The earliest audit observation was 14,533,732 KiB free. Concurrent active work and creation of the isolated report worktree reduced that to the immutable 14,020,088 KiB pre-delete checkpoint used for reclamation math.

## Largest relevant contributors

Sizes are allocated `du` observations and are not all additive because simulator runtime volumes are mounted below `/private/var/run`.

| Size | Category | Safe-level path / disposition |
|---:|---|---|
| ~31.5 GiB | System runtime mounts, VM/logs/db | `/private/var`; protected/system-managed |
| ~30.7 GiB | Installed applications | `/Applications`; protected |
| ~19.4 GiB | Apple developer runtimes | `/Library/Developer`; active iOS/watchOS tooling, protected |
| ~6.35 GiB | Documents/File Provider + legacy Git database | `~/Documents`; unique/ambiguous, protected |
| ~4.67 GiB | Codex state/worktrees | `~/.codex`; active, protected |
| ~4.29 GiB | PhysiqueOS temp worktrees/design/build artifacts | `/private/tmp`; current/registered/ambiguous, protected |
| ~4.01 GiB | CoreSimulator user data | `~/Library/Developer/CoreSimulator`; booted acceptance device, protected |
| ~3.31 GiB | Claude state/jobs | `~/.claude`; active sessions/dirty work, protected |
| ~3.09 GiB | Developer worktrees | `~/Developer`; registered/current work, protected |
| ~2.30 GiB before cleanup | Legacy linked checkouts | `~/GitHub`; source/ambiguous File Provider work protected; only one ignored generated subtree removed |
| ~1.56 GiB | Codex dependency runtimes | `~/.cache/codex-runtimes`; active agent dependency, protected |
| ~1.48 GiB before cleanup | Apple media-analysis cache | deleted after proof |
| ~1.35 GiB | Power-management logs | `/private/var/log/powermanagement`; non-regenerable diagnostic history, preserved |

Xcode audit: DerivedData was 48 KiB; the sole Organizer archive was protected Build 85 at about 102 MiB; iOS/watchOS physical DeviceSupport caches were empty; no stale `.xcresult`, temporary `.xcarchive`, or distribution-staging directory remained. Package audit: npm cache was about 63 MiB; SwiftPM, pip, Homebrew, and Playwright caches were absent or negligible. Git objects were 333.12 MiB packed with zero garbage.

## Active and protected

- Codex app inventory showed three active PhysiqueOS tasks: this audit, `Translate Utility Surface Designs`, and `Explore PhysiqueOS Home UI`.
- Multiple Codex/node processes had cwd in the persistent Remote Control host `~/Developer/PhysiqueOS/native-production-read-foundation`.
- Claude shells and its background session had cwd in `build83-first-real-workout-corrections-20261003`.
- Xcode remained open, and its Git helper was actively running status against a legacy Documents/File Provider checkout.
- A developer service had cwd in `/private/tmp/physiqueos-build85-native`.
- The iPhone 17 Pro simulator `A8157897-95ED-4480-9150-6136652A6519` remained booted with PhysiqueOS and its Live Activity extension running. Four watchOS 27 devices remained shut down; there were no unavailable devices. Installed runtimes were iOS 26.5, iOS 27.0, and watchOS 27.0.
- The dirty Midweek translation tree, Home design DerivedData, utility-surface authority snapshot/extract, all current renders/screenshots, and every registered temporary design worktree were protected.
- Build 85's Organizer archive, one valid code-signing identity, seven provisioning profiles, Keychain, release receipts, App Store/Xcode configuration, and production credentials/tooling were not touched.

## Complete worktree audit

### Current shared Git database

There were **50 registered worktrees before cleanup**. `origin reachable` means the recorded HEAD was contained in at least one fetched `origin/*` ref; it is not a claim that dirty/untracked state was published. Open-PR linkage could not be independently queried because GitHub CLI is not installed, so no worktree was deleted on that basis.

All paths were also stat'ed and checked against process CWD/open-file evidence. Top-level directory mtimes are a weak signal for nested work, so the report treats live CWDs, Codex task status, Xcode Git activity, dirty state, and recent design lineage as the authoritative activity indication. Rows not explicitly labeled active had no relevant process CWD at the audit instant but were still preserved unless the separate deletion gates applied.

| Path | HEAD | Branch | State | Origin reachable |
|---|---|---|---:|---|
| `~/Developer/PhysiqueOS/server` | `0a07132c1504` | `claude/server-confidence-narrative-v3` | clean | yes |
| `/private/tmp/physiqueos-build83-main` | `fdbdd4317fc4` | detached | clean | yes |
| `/private/tmp/physiqueos-build85-native` | `b8ee8690b194` | `codex/build85-watch-native-20261003` | clean / active service | yes |
| `/private/tmp/physiqueos-build85-server` | `3c0f4aefddbb` | `codex/build85-watch-server-20261003` | clean | yes |
| `/private/tmp/physiqueos-dexa-main` | `1728b1bba3ef` | `codex/dexa-healthkit-checkpoints-20261003` | clean | yes |
| `/private/tmp/physiqueos-home-design-main` | `f569e04c729b` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-home-round2-main` | `e6be0a1904b9` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-home-round3-main` | `961ea3352eb9` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-home-round4-main` | `03f2384b1e5c` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-mac-backup-audit` | `4116f671f976` | `codex/mac-icloud-backup-audit-20261003` | clean | yes |
| `/private/tmp/physiqueos-midweek-translation` | `bd1887ab95b5` | detached | dirty 20 / active design | yes |
| `/private/tmp/physiqueos-recovery-v1` | `5b641ec6e974` | `codex/mac-icloud-backup-recovery-v1-20261003` | clean | yes |
| `/private/tmp/physiqueos-selected-home-log-main` | `ba70f17d507c` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-weekly-creative` | `9ea135524813` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-weekly-faithful` | `685d0e9cdabc` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-weekly-hybrid` | `2aad8387bacd` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-weekly-ui` | `8cd29a8ff2a7` | detached | clean / protected design | yes |
| `/private/tmp/physiqueos-weekly-wide-leash` | `9fca0da9fbc2` | detached | clean / protected design | yes |
| `~/.claude/jobs/a4bc60c7/tmp/rotool` | `4025f17560e9` | detached | clean / operational tool | yes |
| `~/.claude/jobs/a4bc60c7/tmp/srvD` | `b81c784e5b8a` | detached | dirty 8 | yes |
| `~/.claude/jobs/ade665c9/tmp/srv` | `2d967e48cb6a` | `claude/priority-skip-capability-server-20261002` | clean | yes |
| `~/.codex/worktrees/46d0/native-production-read-foundation` | `6071c2c35614` | detached | clean | yes |
| `~/.codex/worktrees/593b/native-production-read-foundation` | `bb97949798c8` | `codex/auth-session-resilience-faceid-audit-20260929` | clean / local-only HEAD | **no** |
| `~/.codex/worktrees/utility-surfaces-design/native-production-read-foundation` | `8b82acfd569d` | detached | clean / active design attachment | yes |
| `~/.codex/worktrees/watch-phase0-foundation/native-production-read-foundation` | `a173f27b4a9a` | `codex/apple-watch-workout-v1-phase1a-overnight` | dirty 14 | yes |
| `~/.codex/worktrees/watch-phase0-main-report/native-production-read-foundation` | `7a2fa585a43b` | detached | clean | yes |
| `~/Developer/PhysiqueOS/build82-live-workout-finish-stall-audit-20261002` | `6ac2118fa020` | `claude/build82-live-workout-finish-stall-audit-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/build82-sleep-v3-integration-20261002` | `e2cbcd0cf40d` | `claude/build82-sleep-v3-integration-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/build83-first-real-workout-corrections-20261003` | `3e61dd215e84` | `claude/build83-first-real-workout-corrections-20261003` | dirty 14 / active Claude | yes |
| `~/Developer/PhysiqueOS/build83-server-20261003` | `22925625ba37` | `claude/build83-server-cardio-d1d2-20261003` | clean | yes |
| `~/Developer/PhysiqueOS/build83-server-cooldown-20261003` | `89fe0a0340ad` | `codex/build83-server-cooldown-noncardio-20261003` | clean | yes |
| `~/Developer/PhysiqueOS/confidence-v3-shadow` | `53300b3e1aba` | `claude/confidence-v3-shadow` | clean / local-only HEAD | **no** |
| `~/Developer/PhysiqueOS/dexa-healthkit-native-build84-20261003` | `bcd92c746026` | `codex/dexa-healthkit-native-build84-20261003` | clean | yes |
| `~/Developer/PhysiqueOS/dexa-healthkit-server-20261003` | `b47663b32372` | `codex/dexa-healthkit-server-20261003` | clean | yes |
| `~/Developer/PhysiqueOS/dexa-healthkit-writeback-audit-plan-20261002` | `789aafd9cc2b` | `claude/dexa-healthkit-writeback-audit-plan-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/healthkit-sleep-prospective-canary-audit-20261002` | `61fbfce9900d` | `claude/healthkit-sleep-prospective-canary-audit-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/native-build78-completion-notification-polish-20261001` | `88d597b25d49` | `claude/priority-skip-peptides-foam-native-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/native-build79-widget-priority-skip-integration-20261002` | `1783691debee` | `claude/native-build80-widget-number-formatting-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/native-live-activities-discovery-20261001` | `b6d98889a9eb` | `claude/workout-logger-live-activities-discovery-20261001` | clean | yes |
| `~/Developer/PhysiqueOS/native-production-read-foundation` | `9945d40ea89f` | `codex/healthkit-sleep-midnight-window-closeout-20261001` | dirty 3 / active persistent host / HEAD local-only | **no** |
| `~/Developer/PhysiqueOS/native-remote-control` | `bbb46e19084a` | detached | clean / Remote Control architecture | yes |
| `~/Developer/PhysiqueOS/native-workout-session-authority-20261001` | `c299fa29a14e` | `claude/workout-live-activities-phase1-20261001` | clean | yes |
| `~/Developer/PhysiqueOS/photos-staged-native` | `c4687e6e4aad` | `codex/build46-progress-photos-semantic-native` | clean | yes |
| `~/Developer/PhysiqueOS/progress-photos-flexible-cadence-20261002` | `3ed3eae7c698` | `claude/sleep-canon-v3-native-accept-20261002` | clean | yes |
| `~/Developer/PhysiqueOS/server/.claude/worktrees/agent-a67672255c434ec80` | `677d5e35825f` | detached | clean | yes |
| `~/Developer/PhysiqueOS/server/.claude/worktrees/bridge-cse_017jGf4JVzzLkUWYrPQ87Nup` | `ba250af13e66` | `claude/server-3am-briefings` | clean | yes |
| `~/Developer/PhysiqueOS/server/.claude/worktrees/bridge-cse_01FzuSawBd6k8qg8U9JqhrkM` | `bbb46e19084a` | bridge branch | clean | yes |
| `~/Developer/PhysiqueOS/server/.claude/worktrees/bridge-cse_01LTdZZXTqJ1pp9UKe6TVNY6` | `a428fbda4275` | `server/photo-legacy-session-fix-20260921` | clean | yes |
| `~/Developer/PhysiqueOS/server/.claude/worktrees/healthkit-sleep-phase-a-fresh-20260930` | `fcd2630906ae` | `claude/sleep-evidence-polish-20261001` | clean | yes |
| `~/Developer/PhysiqueOS/unified-v3-base` | `895935bdbec8` | detached | clean | yes |

The report-only worktree temporarily raised the registry to 51 and will be removed with `git worktree remove` after final publication, returning the current database to 50.

### Legacy Documents/File Provider Git database

The separate legacy common database reported **38 registered entries**. Registry enumeration succeeded, including the main Documents checkout, one stale/prunable missing temporary path, one Codex worktree, five other Documents checkouts, six nested Claude bridge worktrees, and twenty-five `~/GitHub/physiqueos-*` linked checkouts. Exact registry HEADs/branches were readable. Full dirty-state scanning returned `FAIL_SCANNER_ERROR` while Xcode was simultaneously running `git status` against this File Provider-backed repository. Therefore every entry—including the formally prunable missing pointer—was classified ambiguous/protected and no `worktree prune`, removal, or source deletion was attempted.

| Legacy registered path | HEAD | Branch / registry state |
|---|---|---|
| `~/Documents/GitHub/physiqueos` | `403107d14056` | `main`; Xcode/File Provider active |
| `/private/tmp/physiqueos-native-v1-build16-founder-corrections` | `c6df7a903953` | `codex/native-v1-build16-founder-corrections`; missing/prunable pointer, preserved |
| `~/.codex/worktrees/2b6d/physiqueos-native-v1` | `ab8fc1a8b784` | `codex/native-v1-logging-completeness` |
| `~/Documents/GitHub/physiqueos-energy-contract-correction` | `935a1a361c33` | `claude/native-energy-contract-correction` |
| `~/Documents/GitHub/physiqueos-native-v1` | `5fec8c75fd08` | `native-v1` |
| `~/Documents/GitHub/physiqueos-native-v1-activity-evidence` | `355eb6a430cb` | `claude/native-v1-activity-evidence` |
| `~/Documents/GitHub/physiqueos-native-v1-claude` | `96cff909f15d` | `claude/native-v1-training-direct-upload` |
| `~/Documents/GitHub/physiqueos/.claude/worktrees/bridge-cse_0128ozCCyP9Nt2i86myXDdzb` | `254b7d402803` | bridge branch |
| `~/Documents/GitHub/physiqueos/.claude/worktrees/bridge-cse_012cU9GcxNWbXM1Z718ahn1Z` | `403107d14056` | bridge branch |
| `~/Documents/GitHub/physiqueos/.claude/worktrees/bridge-cse_016QYs9bPZ9fwJbnXiX9CZxt` | `403107d14056` | bridge branch |
| `~/Documents/GitHub/physiqueos/.claude/worktrees/bridge-cse_019tNdiNRDzWEWbj2qzUcxaE` | `403107d14056` | bridge branch |
| `~/Documents/GitHub/physiqueos/.claude/worktrees/bridge-cse_01PxGRwr4roKYuEUz8KJeb31` | `254b7d402803` | bridge branch |
| `~/Documents/GitHub/physiqueos/.claude/worktrees/bridge-cse_01R8tLagXv42qeiduxdX3kga` | `577edee553f6` | bridge branch |
| `~/GitHub/physiqueos-native-v1-briefing-dexa` | `0194d23eb582` | `claude/native-v1-briefing-dexa` |
| `~/GitHub/physiqueos-native-v1-briefing-photo` | `71f2766ffcb0` | `claude/native-v1-briefing-photo` |
| `~/GitHub/physiqueos-native-v1-briefings-recurring` | `935eba00b144` | `claude/native-v1-briefings-recurring` |
| `~/GitHub/physiqueos-native-v1-build14-corrections` | `aaac4eb01a2c` | `codex/native-v1-build14-corrections` |
| `~/GitHub/physiqueos-native-v1-build15-corrections` | `459f87901e5b` | `codex/native-v1-build15-corrections` |
| `~/GitHub/physiqueos-native-v1-evidence-dexa-photos` | `b7c5a80a0709` | `claude/native-v1-evidence-dexa-photos` |
| `~/GitHub/physiqueos-native-v1-evidence-energy-interactions` | `e358a7ba6945` | `claude/native-v1-evidence-energy-interactions` |
| `~/GitHub/physiqueos-native-v1-evidence-nutrition-weight` | `73502dc4afca` | `claude/native-v1-evidence-nutrition-weight` |
| `~/GitHub/physiqueos-native-v1-goals-lifecycle` | `2332d7ba0a85` | `claude/native-v1-goals-lifecycle` |
| `~/GitHub/physiqueos-native-v1-morning-checkin` | `68ed2ee343d8` | `claude/native-v1-morning-checkin` |
| `~/GitHub/physiqueos-native-v1-next-physical` | `430644e521d5` | `claude/native-v1-next-physical` |
| `~/GitHub/physiqueos-native-v1-priorities-home` | `fe824d0f2031` | `claude/native-v1-priorities-home` |
| `~/GitHub/physiqueos-native-v1-sandbox-weight` | `b6fd2c0b1190` | `claude/native-v1-sandbox-weight-acceptance` |
| `~/GitHub/physiqueos-native-v1-sandbox-weight-live` | `7257eba8fd44` | `claude/native-v1-sandbox-weight-live` |
| `~/GitHub/physiqueos-native-v1-surface-completion` | `4cacd2f4cd82` | `claude/native-v1-surface-completion` |
| `~/GitHub/physiqueos-native-v1-training-library` | `202ad104c8df` | `claude/native-v1-training-library` |
| `~/GitHub/physiqueos-sandbox-weight-manual` | `254b7d402803` | `claude/server-sandbox-weight-manual` |
| `~/GitHub/physiqueos-sandbox-weight-manual-reconciled` | `bf365d9473dc` | `claude/server-sandbox-weight-manual-reconciled` |
| `~/GitHub/physiqueos-server-backend-plumbing-audit` | `c3be0c422d05` | `claude/server-backend-plumbing-audit` |
| `~/GitHub/physiqueos-server-evidence-chronology` | `e75f65707aaa` | `claude/server-evidence-chronology` |
| `~/GitHub/physiqueos-server-native-photo-acceptance` | `a67e77f5d55b` | `codex/server-native-photo-acceptance` |
| `~/GitHub/physiqueos-server-plumbing-goal-phase-priority` | `4e76521c4824` | `codex/server-plumbing-goal-phase-priority` |
| `~/GitHub/physiqueos-server-plumbing-goal-phase-priority-reconciled` | `2cc0f4716652` | `codex/server-plumbing-goal-phase-priority-reconciled` |
| `~/GitHub/physiqueos-server-plumbing-training` | `bb8fbd65e359` | `codex/server-plumbing-training` |
| `~/GitHub/physiqueos-server-plumbing-weight` | `07f8ef8dd642` | `codex/server-plumbing-weight` |

## Deleted

| Category | Exact target | Pre-delete allocation | Why safe / proof |
|---|---|---:|---|
| Apple-generated cache | `~/Library/Containers/com.apple.mediaanalysisd/Data/Library/Caches` | 1,553,788 KiB (1.482 GiB) | Entire target was under `Library/Caches`; no source media included; exact `lsof +D` was empty immediately before deletion; previously proven regenerable. Incremental free-space gain: 1,559,472 KiB. |
| Next.js provider-check build output | `~/GitHub/physiqueos-server-plumbing-goal-phase-priority-reconciled/.next-provider-check` | 681,012 KiB (0.650 GiB) | Git-ignore rule `/.next-provider-check*/`; `git ls-files` proved untracked; worktree status was clean and identical before/after; contents were Next cache/server/standalone output; last written 2026-09-09; exact `lsof +D` empty. Incremental free-space gain: 685,424 KiB. |

The second deletion removed only the ignored generated subtree. The legacy linked worktree, its `.git` pointer, all tracked files, screenshots, and unique source remained.

## Not deleted — Tier 3 / Founder decision or inactive-window requirement

| Estimated size | Candidate | Why preserved |
|---:|---|---|
| ~19.6 GiB | Installed iOS/watchOS runtimes | iOS 26.5 is booted; iOS 27/watchOS 27 support current Native/Watch work. Removing runtimes is a large re-download and requires a separate retention decision. |
| ~4.3 GiB | `/private/tmp` PhysiqueOS worktrees/design artifacts | Current design sessions, dirty translation work, registered worktrees, or ambiguous evidence. |
| ~4.0 GiB | Simulator user data | Booted iPhone acceptance environment and four retained Watch devices. |
| ~1.56 GiB | Codex dependency runtimes | Multiple active Codex tasks depend on them. |
| ~1.35 GiB | Power-management `.asl` history | Not regenerable; potentially diagnostic; no retention authorization. |
| ~3.3 GiB | Claude jobs/session state | Active Claude process plus dirty/unpublished work risk. |
| ~4.7 GiB | Codex sessions/worktrees/state | Active tasks, persistent host, and local-only commits. |
| ~2.3 GiB before cleanup | Legacy linked checkouts | File Provider/ownership ambiguity; active Xcode Git process; recovery scanner could not fully inventory dirty state. |
| ~102 MiB | Build 85 Organizer archive | Current signed release artifact. |
| ~203 MiB | iCloud Build 84/83 archive tier | Protected recovery material; local container copies complete, independent remote durability remains unconfirmed. |

System swap could release several GiB after a user-directed restart or application shutdown, but this task was explicitly forbidden from stopping another agent and did not use that lever. No further material Tier 1/2 candidate remained once active-work protections were applied.

## After and validation

| Metric | Result |
|---|---:|
| Data-volume used | 439,907,704 KiB (419.529 GiB) |
| Data-volume available | **16,079,328 KiB (15.334 GiB)** |
| Net filesystem gain | **2,059,240 KiB (1.964 GiB)** |

- Primary common Git database: `git fsck --connectivity-only --no-reflogs` exited 0. It reported ordinary dangling objects but no corruption; none were pruned or expired.
- Registered worktrees: all 50 original current-database worktrees remained present. No worktree was removed. The isolated report worktree is temporary and report-only.
- Protected-state hashes remained byte-for-byte unchanged for Watch Phase 0 (`954b5c…`), Build 83 first-real-workout corrections (`954b5c…`), and Claude `srvD` (`ecd3cf…`). Codex `593b` and `confidence-v3-shadow` remained at their local-only heads.
- Concurrent active design progress continued during cleanup: the persistent host stayed on the same branch/HEAD but moved from 3 to 61 dirty paths, while the Midweek detached tree advanced `bd1887ab… -> c626e475…` and 20 -> 32 dirty paths. Those changes were made by the active design workstreams, not by the two exact deletion commands, and were preserved.
- Codex, Xcode, Claude, the Claude background session, the booted simulator, and the PhysiqueOS simulator app were still alive. No process was killed or paused.
- Persistent Remote Control host, active Build 83 worktree, all current design paths, utility authority extract, and Home design DerivedData were present.
- Build 85 archive was present. One valid code-signing identity and seven provisioning profiles were present. Keychain and account/configuration material were not altered.
- Recovery generation `PhysiqueOS-Recovery-20261003-191629Z` verified independently from both local and iCloud-container paths: 95 checksums, 95-file secret scan PASS, 5,260,954 bytes, manifest SHA-256 `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d` for both copies.
- Recovery status remained `LOCAL_ICLOUD_CONTAINER_COMPLETE` and generation upload metadata remained `ICLOUD_UPLOAD_REPORTED_COMPLETE` (97/97). Independent remote confirmation remains `REMOTE_ICLOUD_SYNC_UNKNOWN`. Build 84/83 archive-tier copies remain locally complete in the iCloud container and retain their pre-existing upload-metadata errors; nothing in backup storage was evicted, deleted, or rotated.
- The recovery `audit` command's only failure was `FAIL_SCANNER_ERROR` for the concurrently active legacy Documents Git database. Direct registry/HEAD queries succeeded, but the task failed closed and preserved all 38 entries. This is an inventory limitation, not evidence of current-database corruption or recovery-generation checksum failure.
- Report branch diff contains operational documentation only. No shipping Native/Server/Web source or production behavior changed.

## Recommended trigger

Run the next conflict-safe audit when free space falls below **30 GiB**, and always stop disk-intensive work below **15 GiB**. The best next low-risk opportunity is an inactive window after design/Codex/Xcode/Simulator work closes: re-audit completed temp design outputs and Codex runtimes, then decide simulator runtime retention separately. Do not create an automation for this trigger.
