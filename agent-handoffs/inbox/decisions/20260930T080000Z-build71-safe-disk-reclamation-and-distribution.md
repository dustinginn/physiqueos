Build 71 disk-reclamation authorization — inventory first, safely reclaim obsolete PhysiqueOS development artifacts, then continue distribution

STANDING REPORTING PROTOCOL

Before stopping for any reason, obey:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

PARENT DISTRIBUTION DECISION

agent-handoffs/inbox/decisions/20260930T071500Z-build71-native-distribution.md

CURRENT CHECKPOINT

agent-handoffs/reports/20260930T073500Z-build71-distribution-checkpoint-disk-blocked.md

Build 71 source:
claude/post70-background-reconcile-photo-viewer-20260930
71164900210f689480ed277205bf8a43b6d18ead

Current reported free space:
~14.16 GiB

DECISION

Founder has no additional personal files to remove.

Authorize Claude to inventory and safely reclaim obsolete/regenerable PhysiqueOS development artifacts.

Do NOT waive the 15 GiB heavy-operation floor.

Target:
prefer at least 25 GiB free before continuing Build 71 archive/upload, if that amount can be reached through clearly safe development-artifact cleanup.

PHASE 1 — READ-ONLY INVENTORY FIRST

Before deleting anything, produce a bounded disk-usage inventory covering likely PhysiqueOS development sources of growth.

At minimum inspect sizes/age/relevance of:

- Xcode Archives under ~/Library/Developer/Xcode/Archives;
- Xcode DerivedData;
- Xcode distribution/export/intermediate output;
- CoreSimulator device data and caches;
- PhysiqueOS .next directories and other generated Server build output across worktrees;
- temporary PhysiqueOS build/test/replay directories;
- git worktrees for dustinginn/physiqueos;
- Claude-managed/Remote-Control worktrees;
- Codex worktrees;
- ~/.codex;
- ~/.cache/codex-runtimes;
- npm/yarn/pnpm caches if relevant;
- other clearly identifiable PhysiqueOS-generated caches/artifacts.

Do not recursively dump sensitive filenames/content into GH.
Report aggregate path/category, approximate size, age/relevance, active/inactive classification, and proposed action.

Also determine whether the apparent fall from roughly ~30 GiB free to ~14 GiB can be reasonably accounted for by accumulated development artifacts.

Do not speculate beyond the inventory evidence.

PROTECTED — NEVER DELETE IN THIS TASK

Do not delete:

- any source repository required for current development;
- any uncommitted/unpushed work;
- credentials, signing identities, provisioning profiles, API keys, Keychain material;
- Founder private evidence/photos/files;
- production read-only harnesses needed for established operations unless clearly regenerable and approved below;
- current active Claude worktree;
- current active Codex Photo Intelligence worktree/session artifacts;
- current Build 71 source/worktree;
- current/active simulator or process-owned data unless safely shut down first;
- system files;
- user personal files;
- Chrome/browser profile data/cache;
- anything merely "large" without proving it is a regenerable development artifact.

Do not touch ~/.codex or ~/.cache/codex-runtimes while Codex Photo Intelligence is actively working unless you can prove a specific item is an obsolete unused runtime/cache version and its removal cannot affect the active session. Default: preserve both for now.

XCODE ARCHIVE RETENTION

Preserve:
- the local Build 70 archive as the immediate rollback/distribution predecessor;
- any Build 71 archive once created;
- any archive not yet confirmed successfully uploaded/VALID;
- any archive whose source/build identity cannot be confidently established.

Older PhysiqueOS archives may be deleted ONLY if:
- the build was already successfully uploaded/accepted/VALID;
- exact source SHA and release report exist in GH;
- it is older than the immediate predecessor Build 70;
- it is not required for a current rollback/distribution operation.

Record which build numbers/archive dates/sizes are removed.

Do not delete unrelated app archives.

DERIVED DATA / BUILD OUTPUT

Authorized to remove clearly regenerable stale PhysiqueOS:
- DerivedData;
- .next output;
- build/export temp directories;
- test DerivedData;
- stale simulator test output;
- npm cache entries where safe;
- other generated build products.

Prefer targeted PhysiqueOS-only cleanup over global deletion.

SIMULATORS

May erase/delete clearly stale simulator data created for PhysiqueOS testing if:
- no relevant simulator process/test is active;
- the runtime/device is not needed by an active agent;
- doing so does not uninstall required simulator runtimes unnecessarily.

Do not remove simulator runtimes merely for space without reporting first unless they are clearly obsolete duplicates and safe.

GIT WORKTREES

You may remove a finished PhysiqueOS worktree only if ALL are true:
- worktree is clean;
- all commits are pushed;
- its branch exists remotely;
- no Claude/Codex/other active process/session is using it;
- it is not the current Build 71 worktree;
- it is not the active Codex Photo Intelligence worktree;
- no private untracked/ignored evidence needed for current work resides there.

Before removal:
- verify clean;
- verify remote branch/SHA;
- verify no active process has cwd/open use;
- preserve branch; remove worktree only, not branch.

Do not remove a worktree solely because it is old if activity status is uncertain.

TEMP / PRIVATE JOB DIRECTORIES

Private temp job directories may contain Founder evidence or replay harnesses.

Do not delete them merely because they are under /tmp or /private/tmp.

Only remove one if:
- it is clearly generated build output OR
- the owning task is complete;
- no active process/session uses it;
- no unique private evidence/reproducibility material would be lost.

If uncertain, preserve and report.

CLEANUP EXECUTION

After inventory:
1. choose the safest highest-yield deletions;
2. record free space before each major category;
3. delete only authorized artifacts;
4. record actual reclaimed space;
5. stop cleanup once comfortably above target; do not maximize deletion for its own sake.

Aim for >=25 GiB if safely achievable.

If safe authorized cleanup cannot reach at least 15 GiB:
STOP and report.
Do not archive Build 71.

If it reaches >=15 GiB but not 25 GiB:
- report why;
- Build 71 may continue if there is sufficient practical headroom for the known archive operation;
- prefer >=18–20 GiB before archive if possible.

ONGOING RETENTION POLICY PROPOSAL

In the report, propose a conservative automated/manual retention policy for future PhysiqueOS development, such as:

- retain current and immediately previous VALID TestFlight archives;
- remove older PhysiqueOS archives once source SHA + release report + VALID upload are confirmed;
- clean stale PhysiqueOS DerivedData after accepted builds;
- remove finished clean pushed worktrees after their agent/task is closed;
- periodically clean generated .next/test output;
- preserve active agent caches/runtimes.

Do NOT implement a recurring daemon/automation in this task.

CONTINUE BUILD 71

Once safe free-space threshold is restored, continue the already-authorized Build 71 distribution from the exact pushed source:
71164900210f689480ed277205bf8a43b6d18ead

Do not change product source.

Perform:
- Release archive;
- archive identity verification;
- version/build 1.0 (71);
- signature/dSYM verification;
- confirm PHYSIQUEOSSenderConstrainedRefreshEnrollment=false;
- guarded upload dry-run;
- Xcode-only upload;
- wait for VALID/TestFlight status.

No Server deployment.

REPORTING

Publish a final GH report before stopping containing:

DISK:
- pre-cleanup free space;
- inventory summary by category;
- deleted artifacts/categories;
- explicit old Build archives removed;
- reclaimed amount;
- final free space before archive;
- final free space after archive/upload;
- protected categories intentionally preserved;
- evidence-based explanation for recent disk growth;
- proposed future retention policy.

BUILD 71:
- exact SHA;
- archive identity;
- signing/dSYM;
- upload/delivery ID;
- VALID/TestFlight status;
- persistent-pairing gate state;
- Server unchanged;
- Founder acceptance checklist.

If cleanup or distribution blocks:
publish checkpoint before stopping.

END DECISION.
