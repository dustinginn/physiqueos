# PhysiqueOS Mac storage audit — pre-cleanup checkpoint

- Generated (UTC): `2026-10-04T06:06:43Z`
- Assignment authority: `8b82acfd569d3878166e96d8618fd1a475fc7987`
- Reporting branch: `codex/mac-storage-audit-cleanup-20261004`
- Status: **AUDIT COMPLETE / SAFE CLEANUP NOT YET STARTED**

## Disk baseline

- APFS container capacity: 494.4 GB decimal.
- Data volume (`df`): 482,797,652 KiB capacity, 441,966,944 KiB used, **14,020,088 KiB available (13.371 GiB)**.
- The machine is below the standing 15 GiB hard floor. No disk-intensive build, test, archive, or render was started by this task.
- Swap is 4,096 MiB allocated / 3,235 MiB used. It will not be altered because active agents and applications must not be stopped.

## Active and protected

- Codex reports three active PhysiqueOS tasks in the shared Remote Control host: this audit, `Translate Utility Surface Designs`, and `Explore PhysiqueOS Home UI`.
- Multiple Codex/node processes have cwd `~/Developer/PhysiqueOS/native-production-read-foundation`; this persistent host is protected.
- Claude processes and shells have cwd in `build83-first-real-workout-corrections-20261003`; that worktree is protected.
- Xcode is open. Xcode's source-control service is actively inspecting a legacy Documents/File Provider checkout.
- The iPhone 17 Pro simulator is booted and the PhysiqueOS app and Live Activity extension are running. Simulator devices, runtimes, caches, and data are protected.
- Current design outputs and registered temporary design worktrees under `/private/tmp` are protected, including the dirty Midweek translation tree and authority/render artifacts for the two active design tasks.
- The Build 85 Organizer archive, signing/provisioning assets, Keychain, release receipts, production tooling, and credentials are protected.
- The PhysiqueOS Recovery local generation and iCloud Drive backup/archive tier are protected. No backup retention or eviction is authorized here.

## Repository/worktree audit

- Shared current Git database: 50 registered worktrees, all present.
- Dirty registered worktrees preserved: Remote Control host (3 paths at baseline), Midweek translation (20), Watch Phase 0 (14), Build 83 first-real-workout corrections (14), and Claude `srvD` (8).
- Local-only/unpublished registered heads preserved: Codex `593b`, `confidence-v3-shadow`, and the Remote Control host's ahead commit.
- Twenty-five legacy `~/GitHub/physiqueos-*` linked checkouts point into the Documents/File Provider common database. They remain protected because ownership/durability is ambiguous and Xcode is currently querying that repository.
- Git object database is healthy at the inventory level: 5 packs, 333.12 MiB packed, zero garbage. No GC/prune is planned while concurrent Git/Xcode activity exists.

## Cleanup classification

### Tier 1 / safe now after exact recheck

1. `~/Library/Containers/com.apple.mediaanalysisd/Data/Library/Caches` — 1,553,788 KiB. It contains Apple-generated caches only; `lsof +D` found no open handle. This same class was previously removed safely and is regenerable.
2. `~/GitHub/physiqueos-server-plumbing-goal-phase-priority-reconciled/.next-provider-check` — 681,012 KiB. Git proves it is ignored by `/.next-provider-check*/`, untracked, composed of Next.js cache/build/standalone output, last written 2026-09-09, and has no open handle. Source and the linked worktree itself will remain.

Both targets will be rechecked for open handles and exact path/size immediately before deletion.

### Tier 3 / not authorized for deletion

- Codex runtimes (1,638,060 KiB): active agent dependency cache.
- `/private/tmp` PhysiqueOS design/build material (about 4.3 GiB): recent, registered, active, or ambiguous current artifacts.
- CoreSimulator user data (about 4.0 GiB) and installed runtimes (about 19.6 GiB): active simulator/Xcode environment.
- macOS power-management logs (about 1.35 GiB): old records are not regenerable; no deletion without a separate retention decision.
- Legacy linked worktrees and other Claude/Codex state: session or unpublished-work risk.
- Build 85 archive and all iCloud recovery material: protected release/recovery evidence.

The 30 GiB target is not safely reachable while active work is protected. Cleanup will stop after proven Tier 1/2 candidates, even if the target remains unmet.

## Safety statement

No application source, worktree, branch, simulator, archive, credential, signing asset, process, or backup material has been deleted or modified. The only change is this report-only checkpoint.
