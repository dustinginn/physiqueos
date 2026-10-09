# Build 93 broader managed storage cleanup — HOLD after APFS recheck

- Date: 2026-10-09
- Authority: `agent-handoffs/inbox/prompts/20261009-codex-build93-broader-managed-storage-cleanup.md` at `df13f2b610b46918bd005a64ea6e3482139b1528`
- Scope: founder-authorized managed removal of verified inactive worktrees and disposable developer caches
- Result: **HOLD — final APFS availability is below the 25 GiB minimum**
- Native Build 93 candidate preserved: `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`
- Server Build 93 candidate preserved: `e03f6768627f49175c476208eca79c99ae3d5ee9`

## Executive result

Free APFS capacity increased from 12.27 GiB to a transient peak of 25.18 GiB, then settled through 24.17 GiB to a last pre-publication snapshot of 24.05 GiB. The 25 GiB minimum was not durably met; the final snapshot is 0.95 GiB below minimum and 5.95 GiB below the preferred 30 GiB reserve. Cleanup stopped because every remaining sizable item is protected, active, ambiguous, evidence-bearing, dirty/untracked/unpushed, or a current/release candidate.

No Xcode build or test, Server build, deployment, archive, TestFlight upload, Recovery activation, release-pointer update, credential change, production mutation, branch deletion, or process termination occurred.

## Capacity measurements

`df -k` was captured against both `/` and `/System/Volumes/Data`; both APFS views reported the same available-block count.

| Stage | UTC | Available KiB | Available GiB |
|---|---:|---:|---:|
| Before cleanup | 2026-10-09T13:33:55Z | 12,862,016 | 12.27 |
| After 21-worktree batch | 2026-10-09T13:40:51Z | 24,242,380 | 23.13 |
| After nine-cache batch | 2026-10-09T13:41:08Z | 25,088,072 | 23.93 |
| After superseded Build 89 worktree | 2026-10-09T13:42:14Z | 25,373,496 | 24.20 |
| After inactive pnpm store | 2026-10-09T13:42:29Z | 26,205,464 | 24.99 |
| Transient peak after inactive clang cache | 2026-10-09T13:43:44Z | 26,405,532 | 25.18 |
| After first sparse publication-worktree removal | 2026-10-09T13:47:08Z | 25,340,692 | 24.17 |
| Last pre-publication snapshot | 2026-10-09T13:48:36Z | 25,222,648 | 24.05 |

- Pre-delete logical size: 7,567,088 KiB (7.22 GiB).
- Final observed APFS availability increase: 12,360,632 KiB (11.79 GiB).
- Final shortfall to 25 GiB: 991,752 KiB (0.95 GiB).
- Final shortfall to 30 GiB: 6,234,632 KiB (5.95 GiB).

The APFS increase is larger than the logical target size because purgeable-space and filesystem accounting changed during removal. The 1.13 GiB drop after the transient peak occurred without restoring any removed target, demonstrating that the threshold crossing was not durable. APFS changes must not be interpreted as exact per-item physical reclamation.

## Inventory and eligibility controls

The inventory covered all 65 initially registered worktrees, exact Git status including untracked and ignored content, remote reachability after a fresh `git fetch origin`, local source branches, open descriptors, Claude job state/worktree references, Codex task state/current attachments, process state, package caches, shared Xcode caches, per-user compiler caches, simulators, archives, and protected production tooling.

A worktree was removed only when all of the following held:

- inactive/completed with no live Claude or Codex controller reference;
- clean tracked and untracked state;
- ignored content, if any, was regenerable dependency/cache material rather than evidence;
- no open descriptors;
- ordinary directory owned by `dustinginn:staff`;
- exact HEAD reachable from refreshed `origin/*` refs;
- not Build 93, a current attachment, Remote Control/bridge, blocked-job, release/current integration/candidate, production-tooling, or evidence worktree;
- removable through `git worktree remove` without `--force`.

The precise pre-delete plan was sealed locally at `/private/tmp/20261009-build93-managed-cleanup-plan.txt` before each bounded batch was applied.

## Managed worktrees removed

All 22 removals succeeded through `git worktree remove` without force. No branch was deleted.

| Logical KiB | Removed checkout | Preserved HEAD |
|---:|---|---|
| 645,172 | `.codex/worktrees/0493/native-production-read-foundation` | `2b56c93f717663e792782ff7fefc0ac1f8690578` |
| 645,124 | `.codex/worktrees/2b01/native-production-read-foundation` | `e6c10085e12da4223e6430bc1f47a9e0b6c4aa84` |
| 864,044 | `.codex/worktrees/c6bb/native-production-read-foundation` | `999a225a38ced9ddb16a65bbe840896472265468` |
| 101,524 | `.codex/worktrees/foam-rolling-parity-pilot/native-production-read-foundation` | `d065c15675bcc4fa3603618dc43da7b3d90bfbde` |
| 100,884 | `.codex/worktrees/global-appearance-infrastructure/native-production-read-foundation` | `d5359e33845cba20a212dade24c25e94f02aee6e` |
| 182,620 | `.codex/worktrees/redesign-batch3-evidence/native-production-read-foundation` | `87d77cd7f0a7a78508d743a875d6ad77cdd1cdf4` |
| 82,288 | `.codex/worktrees/watch-phase0-main-report/native-production-read-foundation` | `7a2fa585a43b0719087868eba3e5f7567d6335ef` |
| 277,984 | `.codex/worktrees/build-89-small-fixes/native-production-read-foundation` | `e8f834497256de124a240d773563810147966a07` |
| 100,812 | `dexa-healthkit-native-build84-20261003` | `bcd92c74602695766c270fe6af052de45afece4b` |
| 80,196 | `dexa-healthkit-server-20261003` | `b47663b32372a78010dbc8e4aa41303012d98dc7` |
| 546,548 | `live-workout-healthkit-watch-audit-20261004` | `53b11c6479a24b6baeafa12b710c761384278ecb` |
| 95,564 | `native-build78-completion-notification-polish-20261001` | `88d597b25d49f773a12b7dcff3930b0f237a7a46` |
| 267,032 | `native-redesign-completeness-audit-20261006` | `96e724a9f40f9178a16ea492958c3acd4b1b282e` |
| 100,916 | `native-watch-healthkit-build86-20261004` | `4f78fce663fb16c3cc6930b3b8e576a328defcbe` |
| 95,444 | `native-workout-session-authority-20261001` | `c299fa29a14e04a4a22ac782d4610a4562e4f6e0` |
| 288,096 | `overnight-lane-a-watch-live-priorities-20261006` | `f3579d87b2f111bd6da0e78ff928e7492efffc00` |
| 282,240 | `overnight-lane-b-briefings-redesign-20261006` | `156808fae50fc99ddbd6e1f0e3e90abec69ed26b` |
| 72,800 | `photos-staged-native` | `c4687e6e4aad497848748fdca0c14ae6b1993751` |
| 96,600 | `progress-photos-flexible-cadence-20261002` | `3ed3eae7c698988086d24b568256d1987e279e44` |
| 267,032 | `redesign-batch3-evidence-takeover-20261005` | `7fce3b9708c063f3c6b58571778c595012b5de6d` |
| 382,212 | `server/.claude/worktrees/build91-remaining-redesign-watch-audit-20261007` | `b944ad1e5503ffa6d924e733abb2f3ba68e90ce2` |
| 87,760 | `server/.claude/worktrees/healthkit-sleep-phase-a-fresh-20260930` | `fcd2630906ae4aaefb5cc5a0b295aa99c1b59191` |

Worktree logical total: **5,662,892 KiB**.

The detached duplicate at `c6bb` was removed only after confirming its exact commit remained reachable from 16 remote refs and the named progression candidate worktree/branches remained protected.

## Disposable caches removed

Every cache root was an ordinary `dustinginn:staff` directory with no open descriptor. Only exact subpaths were removed; no parent-directory wipe or broad prune was used.

| Logical KiB | Removed cache | Regeneration impact |
|---:|---|---|
| 356,608 | `~/.npm/_cacache` | npm download/content cache; re-download on demand |
| 30,464 | `~/.npm/_npx` | transient npx package cache; re-download on demand |
| 63,756 | `~/Library/Caches/node-gyp` | native-header/build cache; rebuilt on demand |
| 13,672 | `~/Library/Caches/pip` | Python package download cache; re-download on demand |
| 107,052 | `~/Library/Caches/com.apple.python` | Python compiler/runtime cache; regenerated on demand |
| 237,952 | `Xcode/DerivedData/SDKExplicitPrecompiledModules` | shared precompiled modules; Xcode rebuilds |
| 21,856 | `Xcode/DerivedData/ModuleCache.noindex` | module cache; Xcode rebuilds |
| 2,696 | `Xcode/DerivedData/SDKStatCaches.noindex` | SDK stat cache; Xcode rebuilds |
| 28 | `Xcode/DerivedData/CompilationCache.noindex` | compilation cache; Xcode rebuilds |
| 865,084 | `~/Library/pnpm/store/v11` | inactive content-addressed store; future installs may re-download |
| 205,028 | per-user `C/clang` cache | inactive compiler cache; regenerated on demand |

Cache logical total: **1,904,196 KiB**.

The pnpm store was last modified September 23, had no open descriptor or recent file, and was not the configured store for the current PhysiqueOS root or either Build 93 candidate. Installed executables, lockfiles, credentials, active `node_modules`, the repository-local store, Codex runtime dependencies, Claude installation/session data, and local Node installation were preserved.

The clang cache was last modified October 3 and had no open descriptor. No `clang`, `clangd`, `swift-frontend`, `xcodebuild`, or `XCBBuildService` process was active. Adjacent Simulator rendering, active-app, and Xcode distribution caches were not touched.

## Post-cleanup verification

- All 22 removed HEADs remain reachable from one or more refreshed remote-tracking refs; reachability ranges from 1 to 62 refs.
- All 18 named source branches from removed checkouts remain present locally; corresponding remote refs remain present where applicable.
- Registered worktrees changed from 65 to 43 solely through the 22 recorded managed removals.
- Pre-cleanup worktree manifest SHA-256: `0055590269a546d5d54ad41c6cce41ab93b7d8f317be65035b817399ba418cc5`.
- Post-cleanup worktree manifest SHA-256: `8430ba64f3363fb769aa59e89492f78eb50839ccd73a6e5b23d160cac1e12e72`.
- Build 85–92 archive-path manifest remained `ac991e4edef2544fd2fd5e6ed8afbb578a9663c0d59a7a70bf5443ff480d24ff`.
- The Native candidate is clean at `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`.
- The Server candidate is clean at `e03f6768627f49175c476208eca79c99ae3d5ee9`.
- Current-task candidate worktrees remain clean at `f92f2291b403cf0839d9c01d8125de5166bff48e` and `d2b39b6d283d1033c8894e96c9720039befdd881`.
- Remote Control remains clean at `bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a`.
- The locked Recovery worktree remains clean at `a7e8a363cd836a54cee4baabd6d768ec1a62c7e0`.
- Dirty, untracked, unpushed, remote-less, blocked-job, current integration, release, and candidate worktrees verified during inventory remain registered and present.
- The blocked Build 91 Evidence job worktree remains present.
- All three located `.tmp/digitalocean` production-runner directories remain present.
- Build 85–92 archives remain present and unchanged.
- The B91 Evidence simulator remains present.
- Codex runtime dependencies, Claude installation/session history, local Node installation, repository-local package state, credentials/signing material, private historical-correction material, personal data, and completed-job evidence were not removed or modified.
- No Xcode/build/upload-related process was active after cleanup.

## Remaining path to the preferred 30 GiB target

No additional item met the current authorization and confidence bar. Reclaiming the 0.95 GiB minimum shortfall—or the 5.95 GiB preferred-target shortfall—would require a separate Founder choice among protected or ambiguous classes, such as selected completed-job evidence, historical release/current-candidate worktrees, or app-managed archival of additional persistent worktrees after owner review. The protected B91 simulator, release archives, production runners, active runtimes/stores, dirty or unpushed work, credentials, and personal data should not be used to close this gap.

## Readiness and rollback

**HOLD.** The last pre-publication snapshot is 24.05 GiB, below the required 25 GiB minimum and the preferred 30 GiB reserve. Do not start the Build 93 gate, deployment, archive, or upload from this state. A later cleanup or Founder-authorized choice must restore the floor, followed by a fresh live measurement.

Worktree rollback is branch/commit reconstruction: every named branch was retained, every removed HEAD remains remote-reachable, and a checkout can be recreated with `git worktree add` if needed. Cache rollback is regeneration or package re-download. No production or release rollback is required because neither was touched.
