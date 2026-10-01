# Shared Mac conservative storage audit during active Native Build 78

Generated: 2026-10-01T23:49:30Z  
Status: complete  
Repository: `dustinginn/physiqueos`  
Task type: operations / storage only; no product or application source changes

## Outcome

The shared Mac was inventoried while Claude's Native Build 78 task remained active. Cleanup was deliberately limited to five completed, unrelated, clean, pushed report/recovery worktrees.

Free space increased from **22.330 GiB to 22.746 GiB**, reclaiming **0.416 GiB**. The machine remains above the 15 GiB heavy-build safety floor. The opportunistic 25 GiB stop target was not reached, but no ambiguous or active Build 78 storage was risked.

Claude's Build 78 worktree, processes, dedicated DerivedData path, Simulator, temporary session paths, and local changes remained untouched. No process was stopped.

## Active Build 78 protection boundary

The active task is `agent-handoffs/inbox/prompts/20261001T233000Z-native-build78-completion-notification-polish.md`.

Protected state identified before cleanup:

- Worktree: `~/Developer/PhysiqueOS/native-build78-completion-notification-polish-20261001`
- Branch: `claude/native-build78-completion-notification-polish-20261001`
- Starting/current checked-out HEAD at inventory: `c299fa29a14e04a4a22ac782d4610a4562e4f6e0` (Build 77 shipping authority)
- Local state: active, dirty integration state with modified, untracked, and unmerged files; no file in this worktree was changed or removed by the audit
- Active ownership evidence: Claude process and `caffeinate` both held this worktree as their current directory
- Reserved DerivedData: `~/Library/Developer/Xcode/DerivedData/PhysiqueOS-aadwkavqlocxxlgpmjhxqqreoxcp` (0 KiB at both snapshots; retained)
- Dedicated Simulator: `B78 Lane iPhone 17 Pro` (`39DED764-30F2-4E68-A351-FDC5E9BF2B70`, iOS 27.0, shutdown, 1,738,484 KiB); retained without erase, cache deletion, or shutdown command
- Active `/private/tmp/claude-502` session paths; retained

No `Xcode`, `xcodebuild`, Swift compiler/test, `XCBBuildService`, archive/export/upload, or Simulator app/device process was active at the two snapshots. This was treated only as a point-in-time observation; no Build 78 path was considered disposable.

## Before inventory

| Metric | Before |
|---|---:|
| Data-volume free space | 23,414,928 KiB / **22.330 GiB** |
| Data-volume use | 412 GiB, 95% |
| Swap | 5,120 MiB allocated; **4,257.31 MiB used** |
| Memory-pressure free percentage | 47% |
| Load averages | 30.85 / 89.49 / 53.22 |
| Xcode DerivedData | 0 KiB (Build 78 path present and protected) |
| Xcode Archives | 266,228 KiB |
| Xcode cache | 3,228 KiB |
| SwiftPM cache | 160 KiB |
| npm cache | 64,320 KiB |
| Codex runtime cache | 1,638,060 KiB (in use; retained) |

### Archives

All archives were retained:

- Build 77: 91,568 KiB
- Build 76: 87,600 KiB
- Build 75: 87,060 KiB

No archive, dSYM, signing material, provisioning profile, or credential was touched.

### Simulator inventory

All devices were available; there were no unavailable devices to delete.

- iOS 26.5: generic iPhone 17 Pro plus four named Polish devices, all shutdown
- iOS 27.0: dedicated `B78 Lane iPhone 17 Pro`, shutdown
- iOS 26.5 and iOS 27.0 runtimes retained

No Simulator device, device cache, device data, or runtime was modified.

### Generated storage candidates

The largest clearly identifiable candidates were completed report/recovery worktrees under `/private/tmp` at approximately 80 MiB each. Other remaining candidates were deliberately retained:

- `physiqueos-server-372c` (79,436 KiB): temporary source/audit copy with screenshots and infrastructure content; ambiguous
- `physiqueos-native-7116` (74,120 KiB): temporary source/audit copy with screenshots; ambiguous
- `physiqueos-gh-audit.J1yDpg` (55,756 KiB): dirty audit clone; local state preserved
- `physiqueos-report.YkgCeI` (8,796 KiB): small; not needed to meet a safety floor
- `genchk` (7,960 KiB): provenance not sufficiently clear
- Native read bundles/maps (about 32 MiB): production/read tooling-related; preserved
- Codex runtime cache (1,638,060 KiB): actively used by this Codex session; preserved
- npm/Xcode/SwiftPM caches: small and not worth risking active work

## Cleanup performed

Each removed worktree passed all of these gates immediately before removal:

1. no tracked/index changes;
2. no untracked files;
3. exact HEAD present on a named pushed origin ref or contained on `origin/main`;
4. no open file handles;
5. clearly unrelated to active Build 78.

Removed:

| Worktree | HEAD / pushed authority | Inventoried size |
|---|---|---:|
| `/private/tmp/physiqueos-recovery-briefing-v1` | `f9d31f02`, exact pushed design branch | 81,920 KiB |
| `/private/tmp/physiqueos-recovery-report-main` | `05cd06c0`, contained on `origin/main` | 80,132 KiB |
| `/private/tmp/physiqueos-recovery-shadow-report` | `a9f0a3cb`, contained on `origin/main` | 80,172 KiB |
| `/private/tmp/physiqueos-recovery-shadow-v1` | `1bfa92ef`, exact pushed shadow branch | 81,348 KiB |
| `/private/tmp/physiqueos-sleep-report-main-20261001` | `e5e105c2`, contained on `origin/main` | 80,076 KiB |

Only stale worktree metadata was pruned afterward. No broad worktree cleanup was performed.

## Worktrees after cleanup

| HEAD | Branch/state | Worktree | Disposition |
|---|---|---|---|
| `0a07132c` | `claude/server-confidence-narrative-v3` | `~/Developer/PhysiqueOS/server` | retained primary Server checkout |
| `4025f175` | detached | `~/.claude/jobs/a4bc60c7/tmp/rotool` | retained production/read tooling |
| `b81c784e` | detached, dirty | `~/.claude/jobs/a4bc60c7/tmp/srvD` | retained dirty source authority |
| `6071c2c3` | detached | `~/.codex/worktrees/46d0/...` | retained; no need for broader purge |
| `bb979497` | `codex/auth-session-resilience-faceid-audit-20260929` | `~/.codex/worktrees/593b/...` | retained; no proven pushed authority |
| `53300b3e` | `claude/confidence-v3-shadow` | `~/Developer/PhysiqueOS/confidence-v3-shadow` | retained; no proven pushed authority |
| `c299fa29` | `claude/native-build78-completion-notification-polish-20261001` | active Build 78 worktree | **protected active work** |
| `b6d98889` | `claude/workout-logger-live-activities-discovery-20261001` | Live Activities discovery | retained |
| `d051e32a` | `codex/healthkit-sleep-midnight-window-closeout-20261001` | primary Remote Control host checkout | **protected** |
| `bbb46e19` | detached | `native-remote-control` | retained Remote Control tooling |
| `c299fa29` | `claude/workout-live-activities-phase1-20261001` | Build 77 authority worktree | retained |
| `c4687e6e` | `codex/build46-progress-photos-semantic-native` | photos staged Native | retained |
| `677d5e35` | detached | Server Claude agent worktree | retained |
| `ba250af1` | `claude/server-3am-briefings` | Server Claude bridge | retained |
| `bbb46e19` | Remote Control bridge branch | Server Claude bridge | retained |
| `a428fbda` | `server/photo-legacy-session-fix-20260921` | Server Claude bridge | retained |
| `fcd26309` | `claude/sleep-evidence-polish-20261001` | Sleep authority worktree | retained |
| `895935bd` | detached | unified v3 base | retained |

## After state

| Metric | After | Change |
|---|---:|---:|
| Data-volume free space | 23,850,636 KiB / **22.746 GiB** | **+0.416 GiB** |
| Data-volume use | 411 GiB, 95% | -1 GiB rounded |
| Swap | 5,120 MiB allocated; **4,233.31 MiB used** | -24.00 MiB used |
| Memory-pressure free percentage | 42% | point-in-time during active work |
| Load averages | 8.42 / 58.16 / 46.01 | point-in-time during active work |

No process was stopped. No cache, archive, Simulator data, DerivedData, application source, product code, signing material, credential, personal file, production/read tooling, or macOS swap file was deleted.

## Authority, safety, and next step

- Shipping Native authority at task start remained Build 77 / `c299fa29`.
- Build 78 was still an active local integration at the final snapshot; this storage audit makes no claim about its eventual candidate, tests, archive, upload, or VALID status.
- Active Build 78 work remained untouched and visibly continued changing during the audit.
- The machine is above the 15 GiB heavy-build safety floor but below the opportunistic 25 GiB target.
- Safe next step: let Claude finish Build 78 without interference, then restart the Mac as Founder planned to clear residual swap.
- No tests, builds, deploys, uploads, or product reviews were run by this operations task.
- Two unrelated pre-existing untracked reports remain in the primary host checkout and were intentionally not staged or changed.
- No private Founder data or local evidence was published.

This report is the only task artifact intended for publication, along with the standard latest pointers. The exact containing `origin/main` commit is reported after push and remote re-verification.
