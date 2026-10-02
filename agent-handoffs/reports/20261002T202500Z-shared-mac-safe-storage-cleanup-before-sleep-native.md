# Shared Mac safe storage cleanup before Sleep Native integration

- Task id: `shared-mac-safe-storage-cleanup-before-sleep-native-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T203000Z-shared-mac-safe-storage-cleanup-before-sleep-native.md` (main `09651326`)
- Generated (UTC): 2026-10-02T20:25:00Z
- Agent: Claude
- Status: **complete. Target met: 12.81 → 21.33 GiB free (+8.5 GiB). Cleanup stopped once over 20 GiB.**
- No application source, Server, production, TestFlight, signing, device or simulator change.

## Before
- Data volume free: **12.81 GiB** (below the 15 GiB floor).
- Swap: 5,120 MiB allocated, about 3,801 MiB used. Load average about 5.7.
- Processes: no `xcodebuild`, `swift-frontend`, `XCBBuildService`, `clang`/`ld` or Next/Vitest build was running. Xcode (GUI) was open and was left alone. The Codex/ChatGPT helper processes were not touched.
- Largest areas:
  - iOS DeviceSupport 6.6 GB and watchOS DeviceSupport 3.5 GB (only the current 27.0.1 versions of the physical devices);
  - simulator devices 4.2 GB;
  - Xcode DerivedData 2.6 GB (1.5 GB Codex Watch worktree build, plus module caches);
  - `/private/tmp` 2.0 GB;
  - `~/.codex` 4.0 GB;
  - `~/GitHub` 9.1 GB (25 inactive PhysiqueOS clones from Sep 2–9).
- Simulator runtimes: iOS 26.5 (8.5 GB; hosts the shared booted iPhone 17 Pro), iOS 27.0 (8.1 GB; no devices), watchOS 27.0 (3.8 GB; 5 Watch simulators).
- No local Time Machine snapshots.

## Removed (all reproducible build output; proved unused first)
1. **Four temporary Watch/Phase 1A DerivedData folders in `/private/tmp`** (about 1.7 GiB):
   - `physiqueos-phase1a-signing-dd`
   - `physique-watch-audit-derived`
   - `PhysiqueOSWatchCallbackTests`
   - `PhysiqueOSWatchPhysicalDerivedData`

   Each contained only DerivedData structure (`Build`, `ModuleCache.noindex`, `Logs`, …). No open files (`lsof`), no build process, last written between Oct 1 21:38 and Oct 2 09:27.

   → 14.54 GiB free.
2. **`node_modules` and `.next` build output only** (about 6.8 GiB) in 7 inactive `~/GitHub` clones, last modified Sep 2–9:
   - `physiqueos-sandbox-weight-manual`
   - `physiqueos-sandbox-weight-manual-reconciled`
   - `physiqueos-server-native-photo-acceptance`
   - `physiqueos-server-plumbing-goal-phase-priority`
   - `physiqueos-server-plumbing-goal-phase-priority-reconciled`
   - `physiqueos-server-plumbing-training`
   - `physiqueos-server-plumbing-weight`

   Both directories are git-ignored and untracked in every clone, so no source file was touched. Tracked-change counts were identical before and after. That includes `physiqueos-sandbox-weight-manual`, whose 8 uncommitted source changes are **preserved**. A clone can be restored with `npm ci` / `next build`.

   → **21.33 GiB free.**

No worktree was removed, so there are no worktree proofs to give. No archive, simulator device, simulator runtime, DeviceSupport, cache of another tool, swap file or session data was deleted.

## After
- Data volume free: **21.33 GiB** (`df` reports 21 Gi).
- Swap: 5,120 MiB allocated, about 3,793 MiB used. Unchanged and not touched; a restart is the only way to clear it.

## Preserved and verified after cleanup
- **Watch Build 82 implementation:** `~/.codex/worktrees/watch-phase0-foundation/native-production-read-foundation`, branch `codex/apple-watch-workout-v1-phase1a-overnight`. HEAD **`a173f27b4a9ab208021a1f3cd7febc7402cf3b42`** equals the origin branch head. The 14 pre-existing dirty files are unchanged (preserved).
- **Sleep Native candidate:** `~/Developer/PhysiqueOS/progress-photos-flexible-cadence-20261002`, branch `claude/sleep-canon-v3-native-accept-20261002`. HEAD **`3ed3eae7`** equals origin, clean. Its simulator tests were not run, as instructed.
- **Shipping Native:** Build 81 `6a093251`. Archive kept.
- **Production Server:** `d0ff6596` (v3 dormant). Untouched.
- **Archives retained:**
  - `~/Library/Developer/Xcode/Archives/` Builds 79, 80 and 81;
  - `/private/tmp/PhysiqueOS-WatchCancel-B82.xcarchive` (latest Build 82 signed archive, kept until after the Sleep integration);
  - `/private/tmp/PhysiqueOS-Phase1A.xcarchive`.
- **All 24 registered git worktrees are intact.** The unpushed or dirty ones are untouched: the Codex primary host `native-production-read-foundation`, `593b`, and `confidence-v3-shadow`.
- **Signing:**
  - 1 valid code-signing identity;
  - all three Build 82 provisioning profiles present (iPhone `00df369f…`, WorkoutActivity `2a695b81…`, Watch `f4ef7d4e…`; 6 profiles total);
  - Xcode account list present.

  Nothing in signing, keychain or accounts was touched.
- **Physical devices:** iPhone (iPhone18,1, iOS 27.0.1) and Apple Watch (Watch7,12, watchOS 27.0.1) are both still **paired** in `devicectl`. Neither was connected at the moment of the check, so there was no tunnel. Their DeviceSupport (current OS) and the installed development apps were not touched.
- **Simulators:** all 6 simulator devices are intact, with their app and Health data: the shared iPhone 17 Pro on iOS 26.5 plus 5 Watch simulators. All runtimes are intact.
- **Production-read tooling and credentials:** untouched. That covers `~/.claude/jobs/a4bc60c7/tmp/rotool`, doctl contexts, `~/.physiqueos-release`, and `~/.appstoreconnect`.

## Remaining larger candidates (not needed; not touched)
- Xcode DerivedData for the Codex Watch worktree (1.5 GB) plus `ModuleCache.noindex` (0.56 GB) and `SDKExplicitPrecompiledModules` (0.6 GB). These are reproducible, but Xcode is open and may be in use for Watch acceptance, so delete them only when Xcode is idle.
- The iOS 27.0 simulator runtime (8.1 GB) has no devices, but it is the newest runtime. Re-downloading is large, so remove it only with Founder consent.
- `/private/tmp/PhysiqueOS-Phase1A.xcarchive` (98 MB), which Build 82 supersedes.
- Older job scratch folders in `~/.claude/jobs` (about 0.7 GB) and 18 source-only `~/GitHub` clones (about 68 MB each).
- Codex app caches and runtimes (about 3.2 GB) belong to the Codex tooling and should not be touched by Claude.

## Next
The Sleep Native compatibility patch `3ed3eae7` can now be integrated into the Build 82 Watch candidate. Its focused `RecoverySleepReadModelTests` and the regression suites can run once free disk is 15 GiB or more (currently 21.33 GiB). Re-check `df` before each heavy step: concurrent builds move free space by ±3 GiB.

## Safety flags
`TARGET_MET_21_33_GIB` · `NO_SOURCE_CHANGE` · `NO_WORKTREE_REMOVED` · `WATCH_A173F27B_INTACT` · `SLEEP_3ED3EAE7_INTACT` · `SIGNING_INTACT` · `DEVICES_PAIRED` · `SIMULATORS_INTACT` · `SWAP_UNTOUCHED`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
