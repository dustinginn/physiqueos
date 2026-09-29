PhysiqueOS standing disk-space safety rule

Applies to every Codex and Claude engineering, testing, build, archive, simulator, worktree, and release task on the Mac.

This is a mandatory operational invariant, not an optional cleanup suggestion.

Hard floor:
- Never intentionally begin or continue a disk-intensive operation when free disk space is below 15 GiB.
- Disk-intensive operations include Xcode build/archive, xcodebuild test, large simulator/UI-test runs, DerivedData generation, webpack/production builds that create substantial artifacts, creation of additional worktrees expected to build/test, and TestFlight archive preparation.
- Preferred operating reserve is >=20 GiB before Xcode archive/full Native suites or other known-heavy operations.

Required checks:
1. At the start of any task expected to build/test/archive or create substantial artifacts, check free disk space.
2. Re-check before every full Native suite, Xcode archive, or other known-heavy build.
3. During repeated test/build loops, periodically re-check rather than assuming the starting reserve remains available.
4. If free space falls below 15 GiB, STOP before the next disk-intensive operation and safely reclaim space.
5. If an operation itself drives free space dangerously low, stop/recover as soon as safely possible; do not continue stacking artifacts.

Safe cleanup priority:
- stale/regenerable Xcode DerivedData;
- stale .xcresult/test result bundles;
- temporary build/test products;
- obsolete temporary PhysiqueOS worktrees only after proving they are clean, inactive, fully represented by reachable commits/branches, and not used by a persistent Claude/Codex host;
- simulator/build caches that are clearly regenerable;
- old archives only when they are already uploaded/accepted or otherwise safely reproducible and are not the sole release artifact.

Never delete merely to satisfy the floor:
- source code or uncommitted work;
- active Git worktrees;
- persistent Claude conversation/session data;
- credentials/signing assets;
- App Store/Xcode configuration;
- production tooling;
- Git branches/commits/reports;
- current release artifacts that are the only reproducible copy;
- active HealthKit/Midweek or other concurrent-lane worktrees.

Concurrency:
Before removing a worktree or temp directory, enumerate active/registered worktrees and persistent Claude/Codex hosts and prove the target is not in use by another lane.

Failure behavior:
- ENOSPC is a hard stop.
- Do not keep retrying failed commands under critically low disk conditions.
- Restore >=15 GiB free (preferably >=20 GiB for heavy Native work), verify with df -h, then resume from the last known-good state.
- If safe cleanup cannot restore the floor without touching protected artifacts, stop and ask the Founder.

Reporting:
Any task that encounters the disk floor or performs cleanup must report free space before/after and what was removed.

Prompt inheritance:
All future PhysiqueOS Codex/Claude prompts should explicitly state that this standing rule applies and instruct the agent to read agent-handoffs/STANDING_DISK_SAFETY.md before disk-intensive work.
