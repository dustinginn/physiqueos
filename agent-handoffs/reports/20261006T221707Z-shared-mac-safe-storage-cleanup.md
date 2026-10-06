# Shared Mac safe storage cleanup complete

- **Task id:** `claude-safe-shared-mac-storage-cleanup-20261006`
- **Prompt:** `agent-handoffs/inbox/prompts/20261006T224500Z-claude-safe-shared-mac-storage-cleanup.md` @ `2d642b65`
- **Agent:** Claude, in the same Remote Control conversation and worktree as the Build 90 remaining-redesign lane. No new session or worktree was created.
- **Scope:** operational cleanup only. There was no build, test run, TestFlight upload, Server deploy, production mutation, or source / Git change.

## Result

| Measure | Value |
|---|---|
| Free space before | **7.60 GiB** (`/System/Volumes/Data`) |
| Free space after | **28.27 GiB** |
| Observed change | +20.67 GiB |
| Removed by this task (sum of measured sizes) | **≈18.6 GiB** |

The volume is shared by two macOS users and many concurrent agent sessions, so free space moves independently of this task. That is why the observed change differs from the measured sum.

**The 30 GiB target was not reached.** Every remaining candidate failed at least one of the prompt's certainty conditions, so per the prompt the task stopped here rather than delete anything uncertain.

## Removed (allowed categories only, literal absolute paths, each verified first)

### A. PhysiqueOS Xcode DerivedData: 10.21 GiB

These were custom `-derivedDataPath` folders inside completed / idle Claude lane job directories. Each one was confirmed to be DerivedData (`Build/`, `Logs/` and `info.plist` present, no `.git`). Each `info.plist` `WorkspacePath` was a PhysiqueOS lane `ios/PhysiqueOS.xcodeproj`. No `xcodebuild` was running.

| Lane (job state) | Folders | Size |
|---|---|---|
| Batch 2 prep (superseded by Build 88) | `dd` | 1.46 GiB |
| Build 90 Founder design round (done; regenerable) | `tmp/dd`, `tmp/ddr`, `tmp/ddw` | 1.63 GiB |
| Evidence app-open reliability (integrated in Build 88) | `tmp/dd`, `tmp/dd-b3`, `tmp/dd-b3-release`, `tmp/dd-release` | 2.82 GiB |
| Overnight Lane B (done) | `tmp/dd`, `tmp/dd-release` | 1.50 GiB |
| Overnight Lane A (done) | `tmp/dd-ios`, `tmp/dd-ios-base`, `tmp/dd-release`, `tmp/dd-watch`, `tmp/dd-watch-base`, `tmp/dd-watch-rel` | 2.80 GiB |

The default `~/Library/Developer/Xcode/DerivedData` holds only per-project `Logs` (about 0 GiB) and was left alone.

### B. Stale PhysiqueOS xcresult bundles: about 2.86 GiB

- **Batch 3 integration** (`int`, `int2`, `int3`): `unit` / `ui` / `watch.xcresult`, 1.61 GiB. Their text logs (`unit.log`, `ui.log`, `release.log`) were kept.
- **Overnight Lane B:** 25 `unit-*` / `ui-*.xcresult`, about 1.16 GiB.
- **Build 89 release validation** under `/private/tmp`: 7 `physiqueos-build89-*.xcresult`, about 0.09 GiB. Build 89 is VALID and its report is published.

Reports and review boards were not touched.

### C. Other build intermediates: none found

No other PhysiqueOS `Intermediates.noindex` exists outside the DerivedData already removed.

### D. Completed-lane simulators: 5.50 GiB

The three Overnight Lane A devices were deleted with `xcrun simctl delete`:
- LaneA iPhone 17 Pro `68973E9B`;
- LaneA Watch Ultra3 49mm `F2533984`;
- LaneA Watch S12 42mm `671187C2`.

All of these held:
- **Lane state:** Lane A was Founder-approved, integrated in Build 89, and shipped.
- **Shut down:** each device was Shutdown.
- **No current use:** no current session used them. The only reference elsewhere was a device listing in the Build 90 design-round transcript, and that lane created and used its own B90 devices.
- **No unique data:** the iPhone photo library holds only the six stock simulator sample photos. Their hashes are identical to two other simulators.

CoreSimulator Devices went from 16.34 GiB to 10.84 GiB.

### E. Capture intermediates: 0.05 GiB

This lane's own scroll-frame captures were removed. Before removal, the final boards were confirmed:
- committed in `7e501714`;
- pushed (17 package files present on the remote branch);
- remotely readable (raw image HTTP 200).

## Inspected and retained

| Item | Size | Why retained |
|---|---|---|
| LaneB Briefings iPhone 17 Pro simulator | 3.44 GiB | **Booted** (active simulator) |
| B90 iPhone / B90 Watch Ultra3 / B90 Watch S12 simulators | 3.98 GiB | They belong to the Build 90 Founder-changes lane, which awaits Founder picks and implementation |
| Codex Build89 iPhone 17 Pro simulator | 3.37 GiB | Whether a Codex session still needs it can't be proven |
| Batch3 / Batch2 / EvidenceReliability simulators, stock watch devices | about 0.06 GiB | Negligible |
| Other lanes' `shots` / `refs` / `ro` / `pkg` temp folders | under 1 GiB total | Not individually proven to be pure capture intermediates with pushed boards |
| `/private/tmp` progression report/audit folders and tar | about 1.7 GiB | Codex progression worktrees / reports (not allowed) |
| All Git worktrees (58), `~/.codex` worktrees / sessions, `~/Developer` | — | Not authorized |
| Xcode Archives (2026-09-29 … 2026-10-06), runtimes, Xcode, `~/Library/Caches`, Trash, Homebrew / npm / Docker | — | Not authorized |

## Authority verification (existence / readability only)

| Check | Result |
|---|---|
| Build 89 archive `PhysiqueOS-Build89-51399425.xcarchive` | present (119 MB, CFBundleVersion 89) |
| Build 89 shipped `51399425b683d6a6e36b5c91836290259e31a7e0` | reachable (commit) |
| Build 90 Founder design package `3d7c54abdde81b937974d68f4da7f3a40d08ce50` | reachable |
| Build 90 Energy/Recovery candidate `7e5017140e2608a5c71d7d6fc66320d89988578e` | reachable |
| Progression candidate `999a225a38ced9ddb16a65bbe840896472265468` | reachable (`codex/training-progression-authority-server-candidate-20261006`) |
| Production deploy branch `combined-app-platform-cutover` | at `b7eb1e39` (unchanged) |
| Production-access branches | `codex/production-access-portability-stage1` `d789ce27`; `codex/production-readonly-mac-bootstrap-handoff` `4025f175` |
| doctl configuration | `config.yaml` present; all contexts listed, untouched |
| Release tooling / App Store Connect material | `~/.physiqueos-release` and `~/.appstoreconnect` present, untouched |
| Git worktrees | 58 registered, none missing or prunable; the current worktree is clean at `7e501714` |

**Note on the production read-only bootstrap.** The `/private/tmp/physiqueos-production-readonly-mac-bootstrap` working folder named in older notes was **already absent before this task**: it did not appear in the pre-cleanup `/private/tmp` inventory, and `/private/tmp` is wiped on reboot. Its source branch `codex/production-readonly-mac-bootstrap-handoff` is intact. This task deleted only the seven named `physiqueos-build89-*.xcresult` bundles under `/private/tmp`.

## Recommendation

Reaching 30–40 GiB would need a Founder decision on the retained items. Most valuable:
1. Retire the Codex Build89 simulator (3.37 GiB) if no Codex lane needs it.
2. Shut down and delete the LaneB Briefings simulator (3.44 GiB) after confirming nothing is using it.
3. Retire the B90 simulators once the Build 90 Founder-changes lane finishes.

Most of the volume (about 425 GiB used) belongs to the other macOS user and the system. This user's whole footprint is small by comparison.

**Status:** Shared Mac safe storage cleanup complete.
