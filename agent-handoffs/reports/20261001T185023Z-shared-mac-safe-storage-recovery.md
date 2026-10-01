# Shared Mac safe storage recovery

Timestamp: 2026-10-01T18:50:23Z  
Task type: operations / cleanup only  
Result: **target met; cleanup stopped at 25.003 GiB free**

## Executive summary

The shared Mac recovered from **11.019 GiB free to 25.003 GiB free**, a net gain of **13.984 GiB**. The 25 GiB safety target was reached, so no further deletion was performed.

Swap use fell naturally from **5,829.25 MiB to 3,752.31 MiB** after Simulator shutdown and cleanup. No swap files were touched. A later restart remains recommended to clear residual swap, but the machine is above the handoff's 15 GiB no-build safety floor and at the requested 25 GiB target.

The primary Remote Control checkout, Remote Control host processes, production/read tooling, credentials/signing material, Build 76, rollback Build 75, current source authorities, and every unpushed/dirty worktree were preserved.

## Before state

| Metric | Before |
|---|---:|
| Data-volume free space | 11,554,656 KiB / 11.019 GiB |
| Data-volume use | 421 GiB, 98% |
| Swap | 7,168 MiB allocated; 5,829.25 MiB used |
| Load averages | 4.08 / 3.44 / 3.94 |
| Memory-pressure free percentage | 55% |
| Xcode DerivedData | 837,780 KiB |
| Xcode Archives | 667,656 KiB |
| CoreSimulator per-device data | 16,156,800 KiB |
| Installed Simulator runtimes | 16,173,208 KiB |

Process inventory found one booted iOS 26.5 Simulator and its device processes. No `Xcode`, `xcodebuild`, Swift compiler/test, archive, export, Transporter, or upload process was active. Two Remote Control Claude sessions were active and intentionally preserved.

Archive inventory contained PhysiqueOS Builds 69 through 76. Simulator inventory contained five available iOS 26.5 devices and no unavailable devices; installed runtimes were iOS 26.5 and iOS 27.0.

## Actions performed

### Process and Simulator shutdown

- Proved no build, archive, export, or upload process was active.
- Ran `xcrun simctl shutdown all`; all five devices are now shutdown.
- Terminated two orphaned Xcode network `log stream` diagnostics from finished sessions.
- Preserved both Claude Remote Control host sessions and the Remote Control checkouts.
- Ran `xcrun simctl delete unavailable`; there were no unavailable devices to delete.

### DerivedData and completed build/test/render output

Removed all four completed `PhysiqueOS-*` DerivedData directories (651,244 KiB total) and the remaining reproducible Xcode module/stat caches. Final Xcode DerivedData size is 0 KiB.

Removed these completed `/private/tmp` generated-output directories (3,422,596 KiB total):

- `physiqueos-sleep-build74`
- `physiqueos-pr-celebration-derived`
- `physiqueos-phase1-test-derived`
- `physiqueos-pairing-canary-derived`
- `physiqueos-phase1-release-derived-unsandboxed`
- `physiqueos-workout-live-build`
- `physiqueos-workout-live-release`
- `physiqueos-phase1-release-derived`
- `physiqueos-clang-module-cache`
- `physiqueos-workout-live-clang-cache`

Also removed the project-local reproducible `.next/cache` (650,660 KiB). Built server output and production/read configuration were preserved.

Uncertain temporary copies containing screenshots/infrastructure content and dirty audit state were left in place rather than chased for additional space.

### Git worktrees

Each removed worktree was checked immediately before removal for:

1. clean tracked/index state;
2. no untracked files;
3. exact HEAD equality with an origin ref or exact HEAD ancestry on a named pushed origin authority.

Removed finished worktrees/checkouts:

| Path | HEAD / pushed authority |
|---|---|
| `/private/tmp/physiqueos-workout-pr-native-fix` | `69cad804`, exact `origin/codex/workout-pr-celebration-lifecycle-fix-20261001` |
| `/private/tmp/physiqueos-workout-pr-celebration-audit` | `b276d6bb`, exact pushed audit branch |
| `/private/tmp/physiqueos-sleep-report-main` | `c7bc28bd`, exact pushed report branch |
| `/private/tmp/physiqueos-sleep-evidence-server` | `b81c784e`, exact pushed server authority |
| `/private/tmp/physiqueos-founder-pairing-checkpoint` | `508a97d7`, exact pushed checkpoint branch |
| `/private/tmp/physiqueos-post70-native` | `71164900`, exact pushed branch |
| `/private/tmp/physiqueos-sleep-phase-a-server` | `372c306b`, contained on pushed sleep Phase A authority |
| `/private/tmp/physiqueos-workout-pr-native-audit` | `77681cd7`, contained on pushed celebration-fix authority |
| `/private/tmp/physiqueos-founder-pairing-canary` | `27910310`, contained on pushed pairing-canary authority |
| `/private/tmp/physiqueos-phase1.DksOC7/native` | `9dd958c6`, exact pushed Phase 1 native branch |
| `/private/tmp/physiqueos-phase1.DksOC7/repo` | `ccaf9c1f`, exact pushed Phase 1 server branch |
| `~/.codex/worktrees/3a4e/native-production-read-foundation` | `0420560b`, exact pushed auth branch |
| `~/.codex/worktrees/44b6/native-production-read-foundation` | `658f2dbc`, exact pushed pairing-handoff branch |
| `~/.codex/worktrees/dc55/native-production-read-foundation` | `0f1c77be`, contained on pushed Build 70 native authority |
| `~/.claude/jobs/2c900860/tmp/report-wt` | `a8ece713`, contained on `origin/main` |
| `~/Developer/PhysiqueOS/native-build47` | `f372699f`, contained on pushed Build 48 authority |

Worktree metadata was pruned after filesystem cleanup. Dirty or unpushed worktrees were not removed.

### Archives

Removed obsolete PhysiqueOS archives according to policy:

- Build 69: 79,480 KiB
- Build 70: 82,164 KiB
- Build 71: 82,920 KiB
- Build 72: 82,932 KiB
- Build 73: 83,888 KiB
- Build 74: 81,612 KiB

Total archive payload removed: 492,996 KiB.

Retained:

- **Build 76** (`PhysiqueOS-Build76-polish.xcarchive`, 87,600 KiB)
- **Build 75** rollback (`PhysiqueOS-Build75.xcarchive`, 87,060 KiB)

No dSYM was removed independently, and no unrelated archive was touched.

### Simulator data and caches

- Retained all five available device definitions and all app/Health data.
- Retained all four named Polish acceptance devices.
- Retained both iOS 26.5 and iOS 27.0 runtimes.
- Did not reset or delete any available Simulator device.
- Removed only the reproducible `data/Library/Caches` directories from the five shutdown devices (2,743,648 KiB inventoried before removal).

Final CoreSimulator data size is 10,848,676 KiB, down from 16,156,800 KiB. The runtime payload remains 16,173,208 KiB and was not modified.

### Explicitly not touched

- `/private/var/vm/swapfile*`
- Keychains, provisioning profiles, certificates, Apple account data
- SSH/Git credentials, DigitalOcean configuration, API keys, `.env`/production bindings
- Personal documents/photos/mail
- Primary host checkout `~/Developer/PhysiqueOS/native-production-read-foundation`
- Production/read tooling and the detached Remote Control checkout
- Any dirty or unpushed source state

## After state

| Metric | After | Change |
|---|---:|---:|
| Data-volume free space | 26,217,540 KiB / **25.003 GiB** | **+13.984 GiB** |
| Data-volume use | 409 GiB, 95% | improved from 421 GiB, 98% |
| Swap | 5,120 MiB allocated; **3,752.31 MiB used** | -2,076.94 MiB used |
| Load averages | 3.97 / 5.80 / 5.23 | point-in-time; no build processes active |
| Memory-pressure free percentage | 58% | +3 points |
| Xcode DerivedData | 0 KiB | -837,780 KiB |
| Xcode Archives | 174,660 KiB | Builds 75 and 76 only |
| CoreSimulator per-device data | 10,848,676 KiB | -5,308,124 KiB |

No `Xcode`, `Simulator`, `xcodebuild`, Swift compiler/test, `XCBBuildService`, archive/export, or uploader process was present in the final process check.

## Preserved authorities and resume status

- Sleep native: `fcd2630906ae4aaefb5cc5a0b295aa99c1b59191` on `origin/claude/sleep-evidence-polish-20261001`; worktree preserved.
- Sleep production server: `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8` on `origin/codex/sleep-evidence-server-deploy-20261001`; pushed authority preserved, and the dirty detached server worktree was not removed.
- Workout Logger authority: `8398c076bce440cbb0d4cd385bbccef5943b35e8` on `origin/claude/workout-logger-session-authority-foundation-20261001`; worktree preserved, clean, and exact-origin-equal.
- Workout Live Activity prototype/report: `f18bd4a6ba3c7baa26f4eb18e1d1ed86d1065788` on `origin/codex/workout-live-activities-visual-prototype-20261001`; primary checkout preserved.
- PR celebration: `69cad804e2ac7d74ed98914e1601f2e7863dadc3` on `origin/codex/workout-pr-celebration-lifecycle-fix-20261001`; local temporary worktree removed only after exact push verification.
- Build 76 remains the valid current build; Build 75 remains the retained rollback archive.

Claude can safely resume `8398c076`: its dedicated worktree remains present, clean, and exactly equal to the pushed origin branch. A restart is still recommended when convenient to clear the remaining 3.66 GiB of used swap, but the system is no longer below the build safety floor.

