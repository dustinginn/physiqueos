PhysiqueOS Mac storage audit + conflict-safe cleanup

TASK TYPE

New independent Codex chat.
Use High reasoning.

This is an OPERATIONS / STORAGE task only.

Two other Codex design workstreams are actively running in parallel.

This task MUST NOT interfere with:
- active design sessions;
- active git worktrees;
- current render jobs;
- current test/build jobs;
- Xcode processes;
- simulators needed by active sessions;
- current uncommitted work;
- current Git branches;
- GH artifact publication;
- iCloud backup material.

GOAL

Audit Mac storage, identify safe reclaim opportunities, perform a conservative cleanup where safety is provable, and leave enough free space for subsequent Native builds/design work.

This is not an aggressive disk purge.

SAFETY PRINCIPLE

Protect active work first.

Delete only:
1. clearly regenerable cache/build material that is not in active use;
2. stale temporary artifacts with proven non-use;
3. stale git worktrees that are clean, merged/published or otherwise explicitly disposable under existing repository safety rules;
4. old simulator/build caches where deletion cannot disrupt active work;
5. other high-confidence disposable files.

If safety is uncertain:
DO NOT DELETE.

Report it as a candidate instead.

CURRENT PARALLEL WORK

Assume at least these two design workstreams may currently be active:

1. briefing-light + Log density polish
2. Watch + Live Activity + Training Logger utility-surface design translation

There may be additional active Codex/Claude sessions.

Discover rather than assume.

PRE-CLEANUP AUDIT — REQUIRED

Before deleting anything, inventory:

SYSTEM
- total disk capacity;
- used;
- free;
- purgeable if available;
- largest top-level user directories relevant to development.

PHYSIQUEOS
- all PhysiqueOS git clones/worktrees;
- path;
- branch;
- HEAD;
- clean/dirty state;
- linked worktree status;
- last modification/activity indication where safely available;
- whether an active process has cwd/open files there where practical;
- whether branch/commit is published to origin;
- whether current GH work references it.

ACTIVE PROCESSES
Inspect for:
- Codex;
- Claude;
- git;
- xcodebuild;
- Xcode;
- simctl;
- Simulator;
- node renderers;
- Python;
- shell commands whose cwd is in PhysiqueOS worktrees;
- other obvious build/render processes.

Do not kill processes.

XCODE / APPLE DEV STORAGE
Audit:
- DerivedData;
- Archives;
- device support;
- simulator data;
- simulator caches;
- CoreSimulator devices;
- SwiftPM caches;
- Xcode caches;
- build intermediates.

Do not delete an archive required for an existing TestFlight/release audit unless clearly safe and reproducible.

Do not delete current signing/provisioning credentials.

Do not alter Keychain.

SIMULATORS
Audit:
- unavailable devices;
- old runtimes;
- large simulator data;
- active booted simulators.

Safe cleanup may include unavailable simulator devices if Apple tooling confirms they are unavailable and no active task depends on them.

Do not erase all simulators.

PACKAGE / DEV CACHES
Audit likely large caches:
- npm;
- pnpm/yarn if present;
- SwiftPM;
- Homebrew caches;
- pip;
- temporary render/browser caches;
- Playwright/browser downloads if present;
- other known regenerable development caches.

Do not remove installed development dependencies required by active work merely to save space.

TEMP / ARTIFACTS
Audit:
- /tmp and private temp PhysiqueOS work;
- old screenshots/renders;
- stale design harness outputs;
- duplicate generated artifacts;
- old build products.

Important:
GH-tracked design artifacts are source-controlled evidence.
Do not delete tracked repository artifacts merely because they are large.

If local duplicate/generated copies exist outside source control and are safely reproducible, they may be candidates.

GIT OBJECTS

Audit repository object/database size.

Safe maintenance such as normal git gc may be considered only when:
- no concurrent git operation;
- no active worktree operation could conflict;
- repository state is healthy.

Do not use destructive prune settings that could endanger unreferenced current work.

Do not expire reflogs aggressively.

WORKTREE SAFETY

Read existing PhysiqueOS disk/worktree safety documentation, including STANDING_DISK_SAFETY.md or equivalent.

Follow it.

For each candidate worktree removal require:
- not active;
- clean OR all useful work safely committed/published;
- not referenced by a live Codex/Claude session;
- not current cwd of a relevant process;
- branch/HEAD understood;
- no unique untracked artifacts worth preserving;
- removal uses git worktree tooling where applicable.

Never rm -rf a git worktree as the first method.

Do not remove the persistent Remote Control host worktree:
~/Developer/PhysiqueOS/native-production-read-foundation

unless existing architecture explicitly says otherwise. Treat it as protected.

Do not disturb the user's Remote Control spawn-mode setup.

ICLOUD BACKUP SAFETY

The Founder selected iCloud Drive as the Mac backup/recovery strategy.

Do not delete:
- iCloud backup bundles;
- manifests;
- recovery snapshots;
- backup scripts/config;
- anything under the designated PhysiqueOS iCloud backup location unless existing retention policy explicitly authorizes pruning and safety is proven.

If iCloud Drive reports local disk consumption:
audit it, but do not evict/delete backup material in this task without explicit Founder authorization.

CLEANUP TIERS

Classify findings:

TIER 1 — SAFE NOW
Clearly regenerable and not in active use.
May delete automatically.

TIER 2 — SAFE WITH PROOF
Can delete only after explicit automated checks establish non-use and recoverability.
May delete if every gate passes.

TIER 3 — FOUNDER DECISION
Large but potentially useful/unique.
Do not delete.
Report.

TIER 4 — PROTECTED
Never touch in this task.

TARGET

Aim to restore a comfortable development buffer.

Historical Native work indicated approximately 20 GiB could be needed for heavier test/build lanes.

Prefer at least:
30 GiB free if achievable through Tier 1/2 cleanup without risk.

Do not chase the target by escalating into risky deletions.

If safe cleanup yields less, stop and report.

EXECUTION PLAN

Phase 1:
Read safety docs and inspect active work.

Phase 2:
Publish an audit checkpoint BEFORE destructive cleanup if any candidate is not obviously trivial.

Phase 3:
Perform Tier 1 cleanup.

Phase 4:
Re-measure disk.

Phase 5:
Perform Tier 2 cleanup only with all proof gates satisfied.

Phase 6:
Re-measure and validate repositories/worktrees.

POST-CLEANUP VALIDATION

Require:
- active worktrees still exist;
- active branches/HEADs unchanged;
- dirty state unchanged for protected active work;
- no active process was killed;
- git worktree list healthy;
- primary repository fsck/status reasonable;
- persistent Remote Control host intact;
- iCloud backup path intact;
- current design artifacts intact;
- Xcode project/source intact;
- no production/server credentials touched.

Do NOT run heavy full Native tests merely to validate storage cleanup.

A lightweight repository integrity/status check is enough.

REPORTING

Create a durable report:

agent-handoffs/reports/<timestamp>-mac-storage-audit-cleanup.md

Include:

BEFORE
- disk capacity;
- used;
- free.

LARGEST CONTRIBUTORS
- size;
- category;
- path at a safe non-secret level.

ACTIVE/PROTECTED
- active worktrees/sessions protected;
- why.

DELETED
For every deletion:
- category;
- path/category;
- size reclaimed;
- why safe;
- proof used.

NOT DELETED
- Tier 3 candidates;
- estimated size;
- why Founder decision would be needed.

AFTER
- used;
- free;
- total reclaimed.

VALIDATION
- git/worktree health;
- active-work protection;
- Remote Control host;
- iCloud backup integrity;
- no shipping/source mutation.

GH / SOURCE RULE

Do not commit generated cleanup noise.

The only repository change should be:
- this operational report;
- backlog/storage documentation only if genuinely needed.

Do not modify application source.

If repository source unexpectedly changes:
STOP and investigate.

CONFLICT RULE

If an active design/build session makes a candidate path ambiguous:
skip that candidate.

Never pause or stop another agent to reclaim disk.

BACKLOG

Update storage/operations backlog with:
- cleanup date;
- free space after cleanup;
- major remaining Tier 3 candidates;
- next recommended cleanup trigger.

Recommended future trigger:
when free disk falls below a safe development threshold, e.g. 30 GiB, unless existing standing policy specifies another threshold.

Do not create an automation in this task.

STOP CONDITIONS

Stop immediately if:
- active worktree ownership cannot be determined for a deletion candidate;
- git reports corruption;
- iCloud backup integrity is uncertain;
- cleanup would require deleting unique/unpublished work;
- credentials/signing assets would be affected;
- another active task is using a candidate directory.

Otherwise complete all safe cleanup and publish the report.

END TASK.
