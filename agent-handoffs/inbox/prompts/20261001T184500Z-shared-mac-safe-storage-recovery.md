PhysiqueOS shared Mac — safe pre-restart disk/resource recovery

TASK TYPE

Operations / cleanup only.

No product coding.
No production deployment.
No TestFlight upload.
No GitHub source mutation except the required cleanup report/checkpoint.
No branch rebasing/merging.

PURPOSE

The shared Mac is critically constrained after several concurrent Xcode/Simulator/Claude/Codex sessions.

Latest observed by Claude:
- swap approximately 17 GB;
- free disk fell to approximately 3.6 GiB;
- system load peaked near 240.

All known coding sessions are now finished.

Founder cannot restart the Mac immediately and authorizes safe cleanup of disposable/generated resources before restart.

TARGET

Recover at least 25 GiB free disk if safely possible.
Prefer 30 GiB+.

Do not chase the target by deleting uncertain/user data.

A restart will still happen later to clear remaining swap, but this task should reclaim everything safely reclaimable first.

CURRENT AUTHORITIES TO PRESERVE

Sleep:
- Build 76 VALID.
- Native source fcd26309 on claude/sleep-evidence-polish-20261001.
- Production Server b81c784e.
- Build 76 archive may be retained as the most recent useful local archive.

Workout Logger authority foundation:
- branch claude/workout-logger-session-authority-foundation-20261001
- pushed candidate 8398c076
- not yet compiled/tested due resource blocker.
MUST preserve source/worktree if still needed, or if removing worktree prove exact HEAD is pushed and can be recreated.

Workout Live Activity prototype:
- branch codex/workout-live-activities-visual-prototype-20261001
- candidate cc57ddf1 / report commit f18bd4a6
- pushed.
Prototype source can be recreated from GitHub.

PR celebration:
- branch codex/workout-pr-celebration-lifecycle-fix-20261001
- candidate 69cad804
- pushed.
Preserve source authority; worktree may be removable only after exact push verification.

Primary Remote Control host checkout:
~/Developer/PhysiqueOS/native-production-read-foundation
MUST NOT DELETE.

Production/read tooling and credentials:
MUST NOT DELETE OR MODIFY.

A. INVENTORY FIRST

Before deleting anything, capture:
- df -h for boot/data volume;
- du summaries for the largest safe candidate directories;
- swap status;
- memory pressure;
- currently running Xcode, Simulator, xcodebuild, swift, Claude/Codex-related build processes;
- git worktree list;
- Xcode DerivedData size;
- Xcode Archives size by archive/build/date;
- CoreSimulator device data size;
- Simulator runtimes size, but distinguish installed SDK/runtime from per-device data;
- /private/tmp PhysiqueOS/test/build/worktree directories;
- SwiftPM/Xcode caches;
- other obviously generated PhysiqueOS build outputs.

Do not scan arbitrary personal documents/photos/mail.

Publish/record a sanitized before-state.

B. STOP FINISHED HEAVY PROCESSES

Because Founder states all coder sessions are finished:

Safely terminate/quit only idle finished development processes:
- Simulator app/processes;
- booted simulator devices via simctl shutdown all;
- idle Xcode processes if no archive/upload/build is active;
- orphaned xcodebuild/swift test/compiler processes tied to finished tasks;
- orphaned prototype render/test processes.

Before terminating xcodebuild/archive/upload:
prove no current upload/archive is active.

Do not terminate Remote Control host process required for future access unless it is proven safe/restartable and unnecessary.

Do not kill unrelated user apps/processes.

Recheck disk/memory after process shutdown.

C. DERIVED DATA

Safe to remove Xcode DerivedData for completed PhysiqueOS builds/tests.

Prefer:
~/Library/Developer/Xcode/DerivedData/PhysiqueOS-*
and clearly related finished test/prototype DerivedData.

If other unrelated projects exist, do not delete their DerivedData unless clearly disposable and needed; report instead.

Measure bytes reclaimed.

D. /private/tmp GENERATED OUTPUTS

Audit and remove finished-task generated outputs such as:
- xcodebuild DerivedData paths;
- Swift test scratch paths;
- Live Activity prototype render outputs that are committed/pushed;
- Sleep test scratch outputs;
- temporary archives/exports;
- temporary audit bundles containing code only;
- stale temporary PhysiqueOS worktrees ONLY under the worktree rules below.

Do not delete a path merely because it is under /private/tmp if ownership/purpose is unclear.

E. GIT WORKTREES

Run git worktree list with HEAD/branch.

For each candidate finished worktree:
1. verify branch name;
2. verify HEAD;
3. verify exact HEAD exists on origin / branch is pushed;
4. verify worktree clean or inspect untracked/modified files;
5. if dirty, DO NOT delete unless every change is proven generated/disposable or already captured elsewhere;
6. preserve the primary host checkout;
7. preserve Claude authority worktree 8398c076 if convenient for immediate resume; if it consumes meaningful space and is clean/pushed, it may be removed only after documenting exact recreation command/ref.

Prune stale worktree metadata only after filesystem cleanup.

Never delete an unpushed commit.

F. XCODE ARCHIVES

Inventory:
~/Library/Developer/Xcode/Archives

Identify PhysiqueOS archives by version/build.

Retention policy for this cleanup:
- KEEP Build 76 archive.
- KEEP the most useful immediately prior rollback archive if modest in size, preferably Build 75.
- Older PhysiqueOS archives whose exact source is in GitHub and whose TestFlight build is already VALID may be deleted if needed.
- Do not delete unrelated app archives.
- Do not delete dSYMs outside an archive independently if their provenance/need is unclear.
- Report exactly which PhysiqueOS build archives were removed and space reclaimed.

If archives are not a meaningful contributor, leave them alone.

G. SIMULATOR DATA

Run:
xcrun simctl list devices
xcrun simctl list runtimes

First:
xcrun simctl shutdown all

Then consider:
xcrun simctl delete unavailable
This is safe for unavailable devices.

Audit per-device CoreSimulator data.

Do NOT delete currently supported simulator runtimes merely to hit target.
Do NOT remove the only useful current iPhone/iOS simulator device unless necessary and explicitly justified.

If many redundant current devices exist, report candidates first; prefer clearing device contents only if clearly disposable and no acceptance fixture depends on them.

Avoid downloading/reinstalling runtimes later unnecessarily.

H. CACHES

If still below target after DerivedData/tmp/archives:
audit:
- Xcode caches;
- SwiftPM build/cache data;
- module caches;
- SourcePackages checkouts/artifacts.

Delete only reproducible caches, not source repositories or signing assets.

Prefer project-local/generated caches over global caches.

Do not delete:
- Keychains;
- provisioning profiles;
- certificates;
- Apple account data;
- SSH/Git credentials;
- DigitalOcean config;
- API keys;
- .env/production bindings;
- user documents.

I. SWAP

Do NOT manually delete /private/var/vm/swapfile* while macOS is running.

Do not attempt unsafe purge tricks.

After heavy processes stop, report whether swap/free disk improves naturally.

Founder will restart later if swap remains large.

J. SAFETY FLOOR

If free disk reaches >=30 GiB:
stop deleting and report.

If >=25 GiB but <30:
stop unless there is an obviously safe large generated artifact.

If <25 GiB:
continue only through the authorized safe categories above.

If still <15 GiB after all safe cleanup:
STOP and recommend restart before any Xcode/Swift build.

K. AFTER STATE

Report:
- free disk before/after;
- GiB reclaimed;
- swap before/after;
- memory pressure/load if available;
- processes stopped;
- DerivedData removed;
- tmp outputs removed;
- worktrees removed/pruned;
- archives removed/retained;
- Simulator cleanup;
- caches removed;
- exact current git authorities preserved;
- whether Claude 8398c076 can safely resume;
- whether restart is still recommended.

L. GH REPORT

Publish:
agent-handoffs/reports/<timestamp>-shared-mac-safe-storage-recovery.md

This report may be committed from a clean existing checkout without altering application source.

Do not include credentials, usernames beyond normal repo paths, private personal file listings, or unrelated personal storage details.

Publish GH before stopping.

END TASK.
