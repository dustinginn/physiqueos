Task id: pre-healthkit-storage-anchor-readiness-20260921

Goal

Prepare the Founder's Mac and Claude Remote Control environment for the next PhysiqueOS HealthKit phase. This is a bounded storage/authority/Remote-Control-anchor readiness task, not HealthKit implementation.

The Founder wants to continue working primarily from the phone while away from the Mac. Therefore this task must also make future Remote Control sessions start from accepted Build 48 without requiring the Founder to manually create or select a new worktree.

Do not begin HealthKit implementation in this task.

Current expected authorities, to reverify

Accepted Native:
bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a
Build 48, version 1.0 (48)

Production Server:
a428fbda42757620750264e63eaee18950ab7132
deployment d3783f4c-bc14-469b-b10c-93635a047325

Build 48 archive is intentionally retained:
~/Library/Developer/Xcode/Archives/2026-09-21/PhysiqueOS Build 48.xcarchive

Build 48 has been uploaded successfully through the Admin API-key/cloud-signing path. Do not re-upload it.

Remote Control architecture

Current intended model:
- persistent host currently launched from ~/Developer/PhysiqueOS/native-remote-control
- worktree.baseRef=head
- Remote Control spawn mode = isolated worktree
- current anchor may still be Build 47 f372699f
- future phone sessions must start from accepted Build 48 bbb46e19

The Founder may not have Mac access while traveling.

Part A: storage audit

First audit, do not delete anything yet.

Report:
- filesystem free/used space
- size of ~/Developer/PhysiqueOS and major child worktrees/directories
- git worktree list, including branch/HEAD, locked/prunable state, and whether each contains unique unpushed commits
- Xcode DerivedData relevant to PhysiqueOS
- local project .derived/build directories
- Xcode Archives, with Build 47 and Build 48 called out
- simulator/device support data only at a high level if materially large
- /tmp or PhysiqueOS scratch/export artifacts that are clearly regenerable
- old production build bundles/exports/replay scratch if present
- git object-store size/garbage state
- Downloads copy of the Admin .p8: do not read or print contents; determine only whether a redundant Downloads copy remains after secure installation

Classify each candidate as:
KEEP
SAFE_REGENERABLE_CLEANUP
STALE_WORKTREE_CANDIDATE
NEEDS_REVIEW

Do not delete a worktree merely because its task is complete. Prove it has no unique unpushed/unmerged work that must be preserved, or preserve the relevant commit/ref first.

Part B: cleanup

After the audit, clean SAFE_REGENERABLE_CLEANUP items without asking the Founder individually.

Authorized cleanup includes:
- DerivedData/build products that are regenerable
- temporary export/upload scratch
- stale /tmp PhysiqueOS payloads
- obsolete local build bundles/caches
- safely prunable Remote Control worktrees after proving no unique work is lost
- redundant Downloads copy of the Admin .p8 ONLY if the securely installed owner-only copy is verified and deletion can be performed without exposing key contents
- other obviously regenerable artifacts

Preserve:
- Build 48 archive
- Build 48 accepted commit/history
- current production Server source/worktree needed for operations
- GitHub handoff/control-plane data
- secure installed App Store Connect Admin key
- release helper/config
- any unique unpushed commit not safely preserved elsewhere
- Build 47 archive unless storage pressure makes its removal worthwhile; if considering removing it, first prove Build 48 archive is healthy and state why Build 47 rollback archive is no longer needed. Prefer KEEP unless meaningful space is recovered.

Do not clean simulator runtimes/device support aggressively unless storage remains constrained after safer cleanup.

After cleanup report free-space delta.

Part C: advance Remote Control anchor to Build 48

This is the critical travel-readiness requirement.

The persistent anchor path should remain:
~/Developer/PhysiqueOS/native-remote-control

Advance that anchor safely from its current accepted Native SHA to Build 48 bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a.

Requirements:
- preserve path
- do not rewrite/delete Build 48 history
- do not change origin/main
- do not alter the production Server branch
- do not create unnecessary permanent worktrees
- keep worktree.baseRef=head
- verify anchor working tree clean before and after
- verify exact HEAD = bbb46e19084a7b7e0860a1d5e84e20e2f6649d1a

If changing the anchor HEAD requires stopping/restarting the currently running claude rc process, handle as much as can safely be automated. Do not kill the only Remote Control host before you have a clear restart path.

Important travel requirement:
Future phone-started Claude sessions must not require the Founder to visit the Mac to create/select a tree. The persistent host plus worktree.baseRef=head should automatically create isolated task worktrees from Build 48.

If the existing host process caches the old launch HEAD and therefore must be restarted to inherit Build 48, determine this explicitly.

If you can safely restart Remote Control without losing the current session/control channel, do so and verify.
If restarting the persistent host necessarily severs the only remote control connection and cannot be completed from the active session, STOP before killing it and publish the exact one-time Mac action the Founder must perform. Do not strand the Founder.

Part D: prove remote spawning

If the host can be safely aligned/restarted, perform a bounded proof that a newly spawned Remote Control worktree starts exactly at Build 48 bbb46e19.

Verify:
- git rev-parse HEAD exact Build 48 SHA
- clean working tree
- isolated Remote Control-managed worktree
- no accidental origin/main/server lineage
- no modification required from the Founder

Do not perform application edits in the proof worktree.

If the tool cannot self-spawn a second Remote Control session, prove all configuration/host facts available and state the one phone action needed to complete the proof. Do not invent a local worktree as a substitute for Remote Control's own spawn behavior.

Part E: HealthKit readiness audit only

Do not implement HealthKit.

Re-read the existing HealthKit foundation/handoffs and summarize the next implementation starting point.

Preserve the architecture invariant:
HealthKit source observation -> canonical PhysiqueOS Activity/Workout record where appropriate -> evidence eligibility for strategic interpretation where appropriate.

Ingestion/source provenance must not itself decide strategic meaning.

Confirm:
- current Server HealthKit foundation status/branch/commit if still relevant
- current Native HealthKit code/entitlements status
- what Build 48 already contains
- next smallest HealthKit implementation slice
- whether any stale branch needs rebasing/reconciliation onto current Server/Native authority before coding
- whether the 3 AM briefing-generation Server change should occur before or alongside the next HealthKit phase

Do not merge/deploy HealthKit branches in this task.

Backlog to preserve

1. Server: move ALL scheduled briefing generation to 3:00 AM local time while preserving cadence dates and intentionally allowing completed prior-day evidence plus ingestion/reconciliation buffer, including HealthKit sync latency. Audit Midweek, Weekly, Monthly and scheduled DEXA/event paths; test timezone/DST and post-midnight/pre-3AM evidence; no historical regeneration.

2. Native: Workout Logger active draft must eventually survive app termination, background eviction, phone restart, and app/TestFlight update with exact state and no duplicate submission.

3. Native: Photo Briefing production comparisons currently hide the Tap to expand affordance because the real payload fails the new canOpen/navigation condition even though fixture testing passed. Restore real production expandability in a future accumulated-fixes build; do not patch it here.

4. Optional Photo accessibility polish.

Travel readiness

At the end give a clear verdict:
PHONE_ONLY_HEALTHKIT_WORK_READY = YES/NO

YES means the Founder can start new Claude HealthKit tasks from the phone and receive isolated worktrees based on Build 48, with normal Git/deploy/Xcode/API-upload permissions already configured, without touching the Mac for routine work.

If NO, identify exactly what one-time Mac action remains.

GitHub completion

Claim and complete this task through the established inbox protocol.

Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
- before/after disk free
- storage inventory summary
- items removed
- worktrees removed/preserved and why
- unique commits preserved
- Build 47/48 archive status
- Admin key secure-copy/download-copy status without exposing contents
- anchor before/after SHA
- Remote Control host/restart status
- spawn proof
- production Server authority
- HealthKit readiness summary
- exact next task recommendation

Explicit flags:
STORAGE_AUDIT_COMPLETE
SAFE_CLEANUP_COMPLETE
DISK_SPACE_HEALTHY
BUILD48_ARCHIVE_PRESERVED
ADMIN_KEY_SECURE_COPY_PRESERVED
REDUNDANT_ADMIN_KEY_DOWNLOAD_REMOVED
REMOTE_CONTROL_ANCHOR_BUILD48
REMOTE_CONTROL_HOST_BUILD48_READY
REMOTE_CONTROL_SPAWN_BUILD48_PROVEN
PRODUCTION_SERVER_AUTHORITY_VERIFIED
HEALTHKIT_FOUNDATION_REVIEWED
THREE_AM_BRIEFING_CHANGE_QUEUED
PHONE_ONLY_HEALTHKIT_WORK_READY
FOUNDER_MAC_ACTION_REQUIRED
PRODUCTION_DATA_MUTATED_DURING_READINESS
