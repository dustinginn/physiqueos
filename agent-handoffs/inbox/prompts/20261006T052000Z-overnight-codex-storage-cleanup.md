PhysiqueOS overnight Mac storage cleanup — Codex lane

GOAL

Safely reclaim Mac disk space after the Build 88 release and recent parallel Native work without deleting anything needed for the shipped Build 88 authority, active source repositories, credentials, or irreplaceable artifacts.

This is CLEANUP ONLY.

AUTHORITIES TO PROTECT

Build 88 source:
7fce3b9708c063f3c6b58571778c595012b5de6d

Build 88 archive:
~/Library/Developer/Xcode/Archives/2026-10-05/PhysiqueOS-Build88-7fce3b97.xcarchive

Build 88 is VALID in TestFlight.

Production Server:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
deployment 6fa4e887

Do not modify Git source, production, TestFlight, signing configuration, release tooling or credentials.

AUDIT FIRST

Measure free disk before cleanup.

Inventory large reclaimable categories, especially:
Xcode DerivedData;
old Xcode archives other than Build 88 and any explicitly protected recent release archives;
simulator caches / unavailable simulator runtimes or device data that are safe to remove;
temporary build products;
test result bundles;
stale multi-GB build folders created by recent Claude/Codex lanes;
obsolete Remote Control / git worktrees;
repository-local temporary artifacts;
package/build caches that can be safely regenerated;
old downloaded simulator support/device support where clearly disposable;
other large PhysiqueOS development artifacts.

Do not guess. Measure paths/sizes.

GIT / WORKTREE SAFETY

Before deleting any worktree:
verify it is not the primary working tree;
verify no uncommitted changes;
verify commits are pushed/reachable;
verify it is not an active Claude/Codex Remote Control worktree;
verify it does not contain the only copy of an artifact.

Do not remove worktrees currently used by the two overnight Claude lanes.

If uncertain, leave it.

PROTECT

Never delete:
Build 88 archive above;
current source repository;
.git data needed by active branches;
signing certificates/profiles/keys;
App Store Connect credentials;
release uploader;
production access configuration;
Founder media/photos;
database material;
uncommitted work;
active RC worktrees;
the latest useful design review packages/reports;
anything whose safety cannot be proven.

CLEANUP

Prefer low-risk high-yield cleanup:
DerivedData;
stale test/build output;
safe caches;
old inactive build folders;
proven-stale clean worktrees.

Do not uninstall Xcode or required SDKs.
Do not delete all simulators indiscriminately if current development needs them.

VALIDATE

After cleanup:
measure free disk again;
report total reclaimed;
verify repository/worktrees remain healthy;
verify Build 88 archive still exists;
verify active Claude worktrees remain intact;
verify no source changes.

Do not run expensive full builds merely to validate cleanup.

OUTPUT

Publish a short GH handoff report with:
free space before;
free space after;
GB reclaimed;
largest items removed;
items deliberately retained and why;
remaining large candidates requiring Founder decision;
worktree safety audit.

Do not take over latest.json/latest.md from Build 88.

LAST STEP

After cleanup is complete, check GH for the staged Claude A and Claude B prompts and confirm their worktrees were not touched. Do not start or control those Claude sessions unless explicitly instructed elsewhere.

STOP.

END TASK.