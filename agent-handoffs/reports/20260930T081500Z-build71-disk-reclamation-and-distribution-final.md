# Build 71 — safe disk reclamation + distribution: Build 71 UPLOADED and VALID; disk target (25 GiB) NOT reachable through authorized cleanup

Decisions: `.../20260930T080000Z-build71-safe-disk-reclamation-and-distribution.md` (parent `...T071500Z-build71-native-distribution.md`; prior checkpoint `20260930T073500Z-build71-distribution-checkpoint-disk-blocked.md`). Status: **complete — Build 71 VALID in TestFlight, awaiting Founder acceptance.** Server unchanged (`4a81f5b4`), no product-source change, HealthKit Sleep not started.

## BUILD 71
- Source: `claude/post70-background-reconcile-photo-viewer-20260930` @ **`71164900210f689480ed277205bf8a43b6d18ead`** (parent approved candidate `a9251927`; diff = 3 files/4 lines, build metadata only: `APP_BUILD_NUMBER` 70→71, two `CURRENT_PROJECT_VERSION` in pbxproj, the CFBundleVersion test literal). Worktree clean, HEAD verified immediately before archiving; project generation deterministic.
- Archive: `~/Library/Developer/Xcode/Archives/2026-09-30/PhysiqueOS-Build71.xcarchive` (retained). Release archive via Xcode: ARCHIVE SUCCEEDED. Version **1.0 (71)**, bundle `com.physiqueos.native.dev`, team `33GMTRM6G9`.
- Signing: `codesign --verify --deep --strict` valid; identifier/team match. dSYM UUID `3263FD34-E4D5-3B9D-920F-B1CFBA09FA05` matches the binary.
- **`PHYSIQUEOSSenderConstrainedRefreshEnrollment = false`** in the archived Info.plist (persistent-pairing enrollment untouched; Server flag unset).
- Guarded dry run: every check PASS (archive identity, 1.0 (71), signature, dSYM, 71 > 70, no prior upload) → WOULD UPLOAD. Upload via the established Xcode-only tool (`xcodebuild -exportArchive`, API-key auth; no browser, no re-authentication needed).
- **Delivery `e5e1d800-1100-4f55-be39-509cece826f8` — processing VALID (import VALID), `is-on-app-store-connect: True`**, uploaded 9/30/26 7:58 AM PDT; `last-uploaded-build` = 71.
- Validation: per the decision, no long suites re-run; the source candidate's results stand (1590/1590, Release compile, rendered viewer test, fresh review — see `20260930T064500Z-post70-background-reconcile-photo-inspection-final.md`). Exact-Build-71 gates run: metadata diff, deterministic generation, Release archive, identity/signature/dSYM/gate checks, upload dry run.
- Server deployment: **unchanged**. Persistent-pairing enrollment: **off/untouched**.

## DISK
**Pre-cleanup free: 14.2 GiB → before archive 16.3 GiB → after archive/upload 15.2 GiB** (15.2 after removing the archive DerivedData and Xcode dist temps). The archive step never ran below the 15 GiB floor.

### Inventory (read-only, aggregate; no filenames of private material)
| Category | Size / state | Classification |
|---|---|---|
| Xcode Archives | 7 archives × ~77–81 MB = ~0.54 GiB | Builds 64–68 old + VALID; 69/70 rollback |
| Xcode DerivedData (`~/Library/Developer/Xcode`) | 0 | — |
| CoreSimulator devices / user caches | 18 MB / 0 | one PhysiqueOS test sim, erased; not running |
| Root-owned `/Library/Developer/CoreSimulator` (runtimes 16 GiB, dyld caches 3 GiB) | ~19 GiB | system/tooling, not deleted |
| Git worktrees (dustinginn/physiqueos) | ~4.4 GiB across ~45 (most ~72 MB source-only; Codex `593b`/`3a4e` 843 MB each with dependencies) | mixed; see below |
| `.next` / generated Server output | 0.18 GiB (one, in the active Codex Photo Intelligence worktree) | active — kept |
| Claude job scratch (`~/.claude/jobs`) | 1.0 GiB (one 565 MB stale DerivedData) | 1 item generated build output |
| Claude transcripts (`~/.claude/projects`) | 1.1 GiB | session records, kept |
| `~/.codex` 5.3 GiB (worktrees 2.0, sessions 1.7, sqlite 1.0, plugins 0.3) and `~/.cache/codex-runtimes` 1.6 GiB | ~6.9 GiB | Codex Photo Intelligence active → preserved (default) |
| npm cache | 283 MB | regenerable |
| Not PhysiqueOS: `/Users/Shared` 81 GiB and `/Library` audio/app support ~114 GiB (Founder music libraries etc.), `/Applications` 31 GiB | ~226 GiB | protected, not touched |

### Deleted (authorized, regenerable/obsolete only) and reclaimed
| Step | Deleted | Free after |
|---|---|---|
| start | — | 14.20 GiB |
| Xcode Archives Build **64, 65, 66, 67, 68** (2026-09-26/27, 77 MB each ≈ 385 MB; all VALID per `receipt-b6N.json` and each has GH release reports) | 5 archives | 14.58 |
| Stale generated DerivedData in old job scratch (`~/.claude/jobs/8d89eddb/tmp/dd`, 565 MB) | 1 dir | 15.14 |
| 14 finished Claude worktrees (each verified clean, HEAD == remote branch tip, no process cwd; branches kept on remote, only the worktree removed): peptide-ux-server, foam-skip, next-build-server-candidate, server-session-performance-records, server-records-on-prod, server-priority-skip, log-provenance, strength-review-autoconfirm-gap, weight-weekly, native-weight-rows, build54-automatic-workouts, build53-healthkit-latency-fix, bridge-cse_01A2po…, native-midweek-v3 (≈1.0 GiB) | 14 worktrees | 16.16 |
| my own scratch (`/private/tmp/peptide-base`, `pep-tc` ≈ 86 MB) + superseded `physiqueos-peptide-native` worktree (73 MB, pushed) | 3 | 16.31 |
(Earlier same-task cleanup of Xcode dist temps + npm cache ≈ +0.4 GiB is included in the 14.2 start.) Total reclaimed this task ≈ 2.1 GiB directly, ≈ 2.5 GiB including the pre-start items.

### Preserved on purpose
Archives **Build 69 and Build 70** (rollback/predecessor) and **Build 71**; the Build 70/71 source worktrees (`build70-native`, `build70-server`, `post70-native`), `daily-driver-native` (Build 69 source), `prod-446bc964` and `production-readonly-mac-bootstrap` (harnesses), all Codex worktrees, `~/.codex`, `~/.cache/codex-runtimes`, the active Photo Intelligence worktree and its `.next`, worktrees whose branch has no remote, Founder files and audio libraries, browser data, credentials/signing/API keys, other jobs' scratch containing possible evidence (`88374fff`, `7477fce1`, `2c900860` and the read-only harness dirs).

### Evidence-based explanation of the ~30 → ~14 GiB fall
Evidence, not history: I have no earlier disk snapshot, so the exact decline cannot be reconstructed. What the inventory shows: (1) PhysiqueOS development artifacts are small in total — archives 0.5 GiB, DerivedData 0, simulator 18 MB, worktrees ~4.4 GiB, generated output ~0.2 GiB; deleting every authorized one yielded ~2 GiB. (2) **The dominant, current, non-development consumer is macOS swap: `/System/Volumes/VM` = 12 GiB (`vm.swapusage`: 11.4 GiB of 12 GiB used, ~6.3M pageouts, load ~6, 3 user sessions, ~30 Chrome and 74 helper Node processes)** — it lives on the same APFS container and shrinks free space by up to that amount under memory pressure. (3) Only 5 user-visible files >150 MB changed in two days (two Codex sqlite files ~0.9 GiB, Claude binaries ~0.4 GiB, a wallpaper video 0.45 GiB) — no multi-GiB development growth. So the 25 GiB target is **not reachable by authorized development-artifact cleanup**; the practical levers left are outside this authorization: reducing memory pressure (quitting heavy apps/agents or a reboot returns swap), and, with Codex's Photo Intelligence session finished, its ~6.9 GiB (`~/.codex` worktrees/sessions, `codex-runtimes`).

### Proposed retention policy (not implemented; no daemon created)
1. Keep the current and immediately previous VALID TestFlight archives (plus any not yet VALID).
2. Delete older PhysiqueOS archives once source SHA + GH release report + VALID receipt are confirmed.
3. Delete task DerivedData/Xcode dist temps immediately after every gate (I now recheck free space before every build).
4. Remove finished clean pushed worktrees when their task/agent closes (branch stays on remote); treat worktrees with no remote branch as needing an owner decision.
5. Periodically delete `.next` and other generated test/build output in inactive lanes.
6. Preserve active agent caches/runtimes; review Codex's after its session ends.
7. Before heavy work, check both free space and `vm.swapusage`; large swap use means close apps before deleting anything.

## Founder acceptance (Build 71, narrow)
1. **Strength notification:** finish a Watch Strength workout with a matching Logger session, do NOT open Log (app backgrounded/closed). After HealthKit delivers (unlock and wait a minute if needed) expect "Workout needs review"; tap opens that exact review; no duplicate notification/review.
2. **Photo Briefing:** tap a snapshot/comparison photo → full-screen viewer; pinch/pan/double-tap; swipe Previous ↔ Current; Close/drag-down; briefing position preserved; sharp enough for detail.
3. **Progress Photos Evidence set detail:** same viewer from Previous/Current; page state preserved.
No retest of accepted Build 70 workflows unless a regression is seen. Natural-event items still pending: Workout Complete PR/confetti, paused-peptide Thursday behavior.

## Limitations / follow-ups
iOS controls HealthKit wake timing; Evidence landing thumbnails still navigate to set detail; HealthKit Sleep only after this batch is accepted.
## Local-only state
None: Build 71 worktree clean and pushed; archives retained locally per policy; probe/inventory scratch stays in the local job dir (no Founder data pushed).
