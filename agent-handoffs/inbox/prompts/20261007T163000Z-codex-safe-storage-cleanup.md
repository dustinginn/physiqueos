PhysiqueOS Mac — safe storage cleanup after Build 90 / Build 91 / Build 92 parallel work

Run this in the existing PC/Mac Codex operations conversation that has access to the PhysiqueOS Mac host.

Do NOT create sub-chats, child tasks, additional Codex sessions, or new worktrees.

TASK TYPE

SAFE STORAGE CLEANUP.

This is operational cleanup only.

Do NOT modify product source.
Do NOT commit product code.
Do NOT delete Git worktrees.
Do NOT deploy.
Do NOT mutate production.
Do NOT bump/upload builds.

CONTEXT

Recent work has generated substantial Xcode/test/design artifacts across:
- Build 90 release;
- Build 91 Evidence;
- Build 91 Operating Plan + Watch;
- Universal Priority Skip;
- Build 92 Training Variant work;
- design-board renderers;
- multiple simulator/unit/UI/Release runs.

We need to reclaim safe regenerable storage while preserving all current development authority and release artifacts.

PROTECTED — NEVER DELETE

Do not delete or modify:

1. ANY Git repository or Git worktree.
2. ANY uncommitted source/config/report/artifact file.
3. ANY Xcode Archive, especially:
   - Build 89 archive;
   - Build 90 archive;
   - any other retained release archive.
4. TestFlight/export receipts needed for release audit.
5. App Store Connect credentials/API keys.
6. signing certificates/profiles/keychain data.
7. DigitalOcean credentials/config.
8. production-read tooling.
9. Founder media/photos/files.
10. design review boards or agent-handoffs artifacts/reports.
11. iOS/watchOS Simulator runtimes.
12. Xcode itself or SDKs.
13. package-manager caches unless specifically proven safe and large; default is preserve.
14. current Build 91/92 candidate branches/worktrees.
15. any active process's working directory/output.
16. anything uncertain.

ACTIVE WORK SAFETY

Before deletion:

- enumerate PhysiqueOS Git worktrees;
- enumerate running Claude/Codex/Remote Control/Xcode/xcodebuild/simctl/test processes relevant to PhysiqueOS;
- identify active DerivedData/result bundles/build paths if possible;
- do not remove any artifact currently being written/read by an active process;
- do not stop active Claude/Codex/Remote Control sessions;
- do not kill Xcode/test processes merely to reclaim space.

If active builds/tests make a category unsafe, skip it and report it.

INVENTORY FIRST

Record:
- free disk space before;
- size of ~/Library/Developer/Xcode/DerivedData;
- PhysiqueOS-specific DerivedData entries;
- recent .xcresult bundles;
- simulator device-data footprint;
- PhysiqueOS build/test output directories;
- temporary archives/export directories;
- any obvious completed design-board renderer scratch output outside the repository;
- /tmp and user temp PhysiqueOS-specific scratch where ownership is clear.

Do not run broad destructive scans across personal directories.

SAFE DELETION CATEGORIES

Priority 1 — PhysiqueOS DerivedData

Delete completed/stale PhysiqueOS DerivedData directories only when no active process references them.

DerivedData is regenerable.

Do not delete an active build's DerivedData.

Priority 2 — stale PhysiqueOS xcresult/test bundles

Delete completed .xcresult/test-result bundles that:
- are not inside protected Git/report/artifact directories;
- are not release audit artifacts;
- are not being used by an active process;
- are clearly from completed PhysiqueOS test runs.

Preserve any bundle explicitly referenced by a current report if the report depends on the local bundle for acceptance evidence.

Priority 3 — completed build intermediates

Delete regenerable:
- build/;
- DerivedSources;
- intermediates;
- temporary Release/Debug products;
- SwiftPM/Xcode build products local to completed PhysiqueOS lanes;
only where clearly regenerable and not inside a protected archive.

Priority 4 — simulator devices

Do NOT delete simulator runtimes.

First:
- list devices;
- identify dedicated temporary PhysiqueOS test simulators created by completed lanes;
- verify they are shut down;
- verify no active process/session owns them.

Delete only clearly disposable completed-lane test simulator devices.

Do NOT delete the Founder's normal development simulators or any simulator with uncertain ownership.

Use xcrun simctl delete unavailable where safe, but report what it removes.

Priority 5 — temporary PhysiqueOS scratch

Remove only clearly identifiable completed PhysiqueOS temporary files under safe temp locations.

No broad rm of /tmp.
No broad cache purge.

ARCHIVES

List retained PhysiqueOS archives and sizes.

DO NOT DELETE ANY ARCHIVE.

Specifically verify Build 89 and Build 90 archives remain after cleanup.

DESIGN ARTIFACTS

Do not delete Git-tracked review boards.

If there are duplicate raw simulator screenshots/capture intermediates outside Git that were only used to generate already-committed boards, they may be removed ONLY if:
- their generated boards are committed/pushed;
- they are not referenced by active work;
- ownership is unambiguous.

Prefer preserving if uncertain.

REMOTE CONTROL / WORKTREES

Do not run git worktree prune if it could remove active metadata.

You may run read-only:
git worktree list
git status
process checks.

Do not delete Claude-managed worktrees.

Do not clean untracked files inside worktrees with git clean.

XCODE CACHES

Do not perform a global Xcode cache purge beyond PhysiqueOS-specific DerivedData unless free space remains critically low and a specific safe category is proven.

Do not delete:
- DeviceSupport;
- SDKs;
- simulator runtimes;
- provisioning;
- Archives.

TARGET

Aim for at least 30 GiB free if safely achievable using only the approved regenerable categories.

If 30 GiB cannot be reached safely:
STOP at the safe boundary and report remaining largest safe/unsafe categories.

Do not chase the target by deleting uncertain data.

POST-CLEANUP VERIFICATION

Record:
- free disk space after;
- total GiB reclaimed;
- each deletion category and size;
- remaining DerivedData;
- remaining active test/build artifacts skipped;
- simulator devices deleted;
- retained archive list;
- Git worktree list unchanged;
- active Remote Control/Codex/Claude processes unaffected.

Verify:
- Build 89 archive exists;
- Build 90 archive exists;
- all Git worktrees still exist;
- no source worktree became dirty due to cleanup;
- no active build/session was interrupted.

REPORT

Do not create a source commit merely for cleanup.

If the repository's handoff convention requires a report, publish only a report-only artifact using the narrow reports-only workflow and do NOT modify latest.json/latest.md.

Report:
- before free space;
- after free space;
- reclaimed amount;
- exact categories removed;
- exact categories deliberately preserved;
- active work skipped;
- archives retained;
- worktrees retained;
- any remaining storage concern.

Status:
PhysiqueOS safe storage cleanup complete.

STOP.

END TASK.