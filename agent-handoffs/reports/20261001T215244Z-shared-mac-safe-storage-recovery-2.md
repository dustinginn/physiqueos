# Focused safe storage cleanup for Workout Live Activities Build 77

- Task id: `shared-mac-safe-storage-recovery-2-20261001`
- Generated (UTC): 2026-10-01T21:52:44Z
- Status: **complete — target met; cleanup stopped at 22.41 GiB free**
- Inputs read: `20261001T185023Z-shared-mac-safe-storage-recovery.md` (prior cleanup; it lives on branch `codex/workout-live-activities-visual-prototype-20261001`, not on main) and `20261001T214304Z-workout-live-activities-phase1-checkpoint-2.md` (Claude's blocker).

## Result
Free disk went from **14.87 GiB to 22.41 GiB (+7.5 GiB)** by deleting regenerated development artifacts from ONE finished job scratch directory. The target was at least 20 GiB, so I stopped there. No other cleanup was performed.

## Before
- Data volume free: 14.87 GiB (14.87 → 15.16 GiB while inventorying; another session had been consuming space).
- Swap 7,168 MiB allocated, 5,705 MiB used. Load average about 6.
- Processes: **no** `xcodebuild`, `swift-frontend`, archive, export, `altool`, Transporter or release-tool upload process was running (checked with `pgrep` immediately before deleting). One idle booted Simulator (iPhone 17 Pro, the shared test device).
- Xcode DerivedData: 0 B. `/private/tmp`: small (largest item 80 MiB). Archives: Build 75 and Build 76 only.
- The space was in one finished job's scratch folder: `~/.claude/jobs/a4bc60c7/tmp` held about 7.7 GiB, of which 7.27 GiB was regenerated build output.

## Actions
1. Proved no build/archive/upload was active, then ran `xcrun simctl shutdown all`; the one booted Simulator (idle) is now shut down. No Simulator was erased or deleted.
2. In `~/.claude/jobs/a4bc60c7/tmp` (a finished session's scratch directory) deleted only:
   - 11 derived-data build folders (`dd`, `dd-archive75`, `dd-impl`, `dd-impl-release`, `dd-int`, `dd-int-release`, `dd-pol`, `dd-pol2`, `dd-proto`, `dd-proto-release`, `dd-rel`);
   - 9 `*.xcresult` test-result bundles (UI/regression runs).
   Total 7.27 GiB. A last open-file check on those folders showed nothing using them.

## After
- Data volume free: **22.41 GiB** (target ≥ 20 GiB met; stopped).
- Swap still 5,705 MiB used (untouched, as instructed; a restart is the way to clear it). Load average was a point-in-time spike (about 37) right after the deletion.
- No Simulator booted; 5 devices shutdown; iOS 26.5 and iOS 27.0 runtimes present.

## Preserved (verified after cleanup)
- **Live Activities authority:** worktree `/Users/dustinginn/Developer/PhysiqueOS/native-workout-session-authority-20261001` on branch `claude/workout-live-activities-phase1-20261001`, HEAD **`c299fa29`**, clean (0 changes), and equal to the pushed origin branch (`ls-remote` = `c299fa29`). Build 77 is prepared in it (`596e3731`), not archived or uploaded. Claude can resume immediately.
- Retained archives: `PhysiqueOS-Build75.xcarchive` and `PhysiqueOS-Build76-polish.xcarchive` in `~/Library/Developer/Xcode/Archives/2026-10-01`, plus the Build 76 archive copy `~/.claude/jobs/a4bc60c7/tmp/arch/PhysiqueOS-76.xcarchive`.
- In the same job scratch directory I kept its production-read tooling worktree (`rotool`), its server worktree (`srvD`), its logs and scripts.
- Primary Remote Control host checkout `~/Developer/PhysiqueOS/native-production-read-foundation`, all Simulator runtimes and app/Health data, signing/provisioning material, credentials, the release-tool state (`last-uploaded-build` = 76), personal files and the macOS swap files: not touched.
- My own session's DerivedData (`~/.claude/jobs/a853226c/tmp/dd`, about 0.65 GiB) was also left in place; it is regenerable and Claude will reuse or replace it.

## Not done (not needed)
No worktree, archive, Simulator-data or cache purge. No restart. Nothing outside the one scratch directory was deleted.

## Next
Claude's Live Activities session can resume at `c299fa29`: re-run the full unit suite and UI journeys, archive Build 77, validate signing, upload and wait for VALID. Recommended: run `uptime`/`df` first, and keep xcodebuild in the foreground so a finished run cannot leave a stray process.
