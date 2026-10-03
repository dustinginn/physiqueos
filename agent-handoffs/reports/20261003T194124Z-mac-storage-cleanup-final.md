# PhysiqueOS Mac storage cleanup — final

- Status: **COMPLETE**
- Scope: conservative Mac storage cleanup, integrity verification, recovery health check, and deferred Build 84 + Build 83 archive-tier copy
- Recovery authority entering the task: `0bf8fea9b4733ef83a2a0a74a4c037ef8947bf7c` on `origin/main`
- Repository: `dustinginn/physiqueos`
- Reporting branch: `codex/mac-icloud-backup-recovery-v1-20261003`
- Main-branch report commit: this report's publication commit on `origin/main`; exact SHA is verified and reported immediately after publication

## Outcome

The cleanup raised data-volume free space from **13,813,984 KiB (13.174 GiB)** to **22,279,712 KiB (21.248 GiB)** before the archive-tier copy. The filesystem-level gain was **8,465,728 KiB (8.074 GiB)**. Cleanup stopped at that point under the standing rule not to chase maximum disk usage.

The separately authorized Build 84 + Build 83 archive tier then consumed **240,032 KiB (0.229 GiB)**. The final observation was **22,096,724 KiB (21.073 GiB)** free, still above the preferred 20 GiB floor and well above the hard 15 GiB floor.

No active or registered repository/worktree, dirty state, Git object database, local-only recovery ref, recovery generation, Organizer archive, simulator device, credential/signing material, receipt, operational tool, source file, Founder evidence, Health data, or unknown File Provider checkout was deleted or modified.

## Fresh inventory and classification

| Candidate/class | Measured size | Classification and action |
|---|---:|---|
| Apple `mediaanalysisd` e5 bundle cache | 6,756,004 KiB | Reproducible cache under the app container's `Data/Library/Caches`; no source media and no open file handles. Deleted. |
| Codex/ChatGPT Sparkle installation staging | 1,654,604 KiB | Oct 1 cached updater payload under `~/Library/Caches`; no open file handle. Deleted. |
| Google Chrome cache | 577,072 KiB | Reproducible browser cache; Chrome was not running and no handle was open. Deleted. |
| User CoreSimulator devices | 2,574,060 KiB | Current iPhone 17 Pro / iOS 26.5 and Apple Watch / watchOS 27 acceptance environment. Preserved. |
| System CoreSimulator runtimes | 20,058,808 KiB | Installed development runtimes, not classified as cleanup-safe in this task. Preserved. |
| Xcode Organizer archives | 688,596 KiB | Signed/release artifacts, including protected Builds 84 and 83. Preserved. |
| Xcode DerivedData | 42,404 KiB | Reproducible, but Xcode and its build services were active. Preserved; too small to justify application disruption after the target was met. |
| Codex dependency runtimes | 1,638,060 KiB | Reproducible download cache but in active use by agent tooling. Preserved. |
| Claude/Codex state | `~/.claude` 3,466,112 KiB; `~/.codex` 4,298,092 KiB | Contains sessions, registered worktrees, dirty/local state and credentials/config. Preserved; no broad cleanup attempted. |
| Registered `/private/tmp` worktrees | about 51-83 MiB each | Present in the common Git worktree registry. Preserved regardless of age. |
| UNKNOWN Documents/File Provider checkouts | 14 | Recovery audit still classifies them unknown/time-limited. Preserved. |

The iPhone 17 Pro simulator alone used 2,048,424 KiB and the paired Apple Watch Ultra 4 used 525,584 KiB. Those are the current Native/Watch deterministic-acceptance devices and were intentionally not erased.

## Exact deletion ledger

| Exact path | Category | Pre-delete allocated size | Durability/safety proof |
|---|---|---:|---|
| `~/Library/Containers/com.apple.mediaanalysisd/Data/Library/Caches` | Apple-generated model/media-analysis cache | 6,756,004 KiB (6.443 GiB) | Entire measured payload was under `Library/Caches`; its 6,667,396 KiB dominant child was `com.apple.e5rt.e5bundlecache/25G83`. No source media path or open file handle was included. Rebuildable by macOS. |
| `~/Library/Caches/com.openai.codex/org.sparkle-project.Sparkle/Installation` | Stale app-update staging | 1,654,604 KiB (1.578 GiB) | Cached Oct 1 installation payload only. The live updater executable was in the separate `Launcher` directory and had no open handle in this target. Re-downloadable. |
| `~/Library/Caches/Google/Chrome` | Browser cache | 577,072 KiB (0.550 GiB) | Chrome was not running; no open target handle; cache is network-reproducible. |

Nominal measured allocation removed was **8,987,680 KiB (8.571 GiB)**. The independently measured filesystem gain was **8,465,728 KiB (8.074 GiB)**; the difference is expected from concurrent system activity and APFS allocation accounting. These were direct cache deletions and are not recoverable as deleted bytes, but all three sources regenerate or redownload their content.

Free-space checkpoints:

| Checkpoint | Available |
|---|---:|
| Before cleanup | 13,813,984 KiB (13.174 GiB) |
| After Apple media-analysis cache | 20,609,020 KiB (19.654 GiB) |
| After app/browser caches; cleanup stop | 22,279,712 KiB (21.248 GiB) |
| Immediately before archive tier | 22,305,948 KiB (21.273 GiB) |
| Immediately after archive tier | 22,065,916 KiB (21.044 GiB) |
| Final observation | 22,096,724 KiB (21.073 GiB) |

The proposed but unapplied smaller candidates were left alone after the requested floor was reached: five completed Xcode distribution staging directories (441,932 KiB total), task-local Swift/Python caches (94,672 KiB), and a 97,092 KiB bare origin probe. The origin probe was confirmed unregistered, bare, `git fsck`-clean, and limited to origin refs plus the already-present `native-v1.0-build40` tag. No deletion was needed.

## Git/worktree integrity

The installed recovery audit returned `PASS` after cleanup:

- **22/22 local-only recovery refs remain present** with their recorded SHAs.
- The common Server database still reports **36 registered worktrees**; none was removed or pruned.
- All **five recorded dirty-worktree status SHA-256 values match byte-for-byte** with generation `PhysiqueOS-Recovery-20261003-191629Z`:
  - `~/.claude/jobs/a4bc60c7/tmp/srvD` — `98682dc1...a92`
  - Watch Phase 0 worktree — `8f9dbfe6...711`
  - Build 83 corrections worktree — `8f9dbfe6...711`
  - Remote Control/current task worktree — `01b57043...e34`
  - sandbox-weight manual worktree — `2f317467...0c0`
- Build 84 Native remains `bcd92c74602695766c270fe6af052de45afece4b`.
- Server companion remains `b47663b32372a78010dbc8e4aa41303012d98dc7`.
- The current Remote Control worktree remains at `9945d40ea89f68f0bd743c281fa8fe1e89a05b48`, one commit ahead with the same two untracked reports recorded by recovery V1.
- The 14 unknown File Provider/legacy worktrees were not touched.

## Recovery-system health

- Live audit: `PASS` at `2026-10-03T19:39:41Z`.
- Latest generation: `PhysiqueOS-Recovery-20261003-191629Z`.
- Local validation: `PASS`.
- Local and iCloud-container manifest SHA-256 still match: `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d`.
- Both local and iCloud generation copies still allocate 5,396 KiB.
- Scheduler remains installed for 03:30 local; launchd is idle, has run once, and reports last exit `0`.
- Current generation state remains `LOCAL_ICLOUD_CONTAINER_COMPLETE`.
- The earlier 97/97 upload-reported-complete observation remains historical evidence. Current live metadata and independent remote confirmation remain conservatively `REMOTE_ICLOUD_SYNC_UNKNOWN`.
- The first audit invocation was blocked by the command sandbox before it could create its temporary directory; it could not update state. The same installed audit was immediately rerun with access to its own application-support directory and passed. Final status has `last_failure: null`.

No recovery generation was deleted or rotated.

## Build 84 + Build 83 archive tier

The floor projection allowed the previously deferred tier to proceed. Exactly two archives were copied:

| Build | iCloud-container destination | Files in checksum manifest | Checksum mismatches | Local state |
|---|---|---:|---:|---|
| 84 | `PhysiqueOS Backups/archives/PhysiqueOS-1.0-Build84-current-valid-Archive` | 52 | 0 | `LOCAL_ICLOUD_CONTAINER_COMPLETE` |
| 83 | `PhysiqueOS Backups/archives/PhysiqueOS-1.0-Build83-previous-rollback-Archive` | 52 | 0 | `LOCAL_ICLOUD_CONTAINER_COMPLETE` |

Each destination contains `Archive.xcarchive`, `ARCHIVE-CHECKSUMS.json`, and `MANIFEST.json`. The original Organizer archives remain in place and unchanged. No other historical archive was copied.

The immediate File Provider query returned `ICLOUD_UPLOAD_ERROR` for each archive directory, with two metadata errors and unavailable per-file metadata. Therefore this report proves the complete local iCloud-container copies and their checksums only. It **does not** claim upload-reported completion or independent off-device durability for the archive tier. A later supported File Provider observation or independent re-download is still required for that stronger claim.

## Remaining opportunities

No further deletion is recommended now. If space pressure returns:

1. The completed Xcode distribution staging directories (about 432 MiB) and task-local compiler caches (about 93 MiB) are the next low-risk candidates after rechecking that no distribution/build process is active.
2. DerivedData is only about 41 MiB and can be cleared after Xcode is closed; it is not worth interrupting active development for this amount.
3. The 1.56 GiB Codex runtime cache is reproducible but should only be cleared after all Codex/ChatGPT work is closed.
4. The 2.45 GiB simulator device set and 19.13 GiB installed simulator runtimes are large, but currently support the Native/Watch acceptance environment and are not cleanup-safe without a separate runtime/device retention decision.
5. Claude job storage and Codex sessions/worktrees are not classified safe. Any future cleanup must prove completion, non-registration, clean state, and remote/local durability per candidate before deletion.

The system now has adequate headroom for normal operations. Do not pursue the larger ambiguous opportunities merely to maximize free space.

