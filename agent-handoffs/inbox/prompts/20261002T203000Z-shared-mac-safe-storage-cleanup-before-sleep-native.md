Shared Mac safe storage cleanup before Build 82 Sleep compatibility integration

TASK TYPE

Claude operational cleanup only.

Goal:
Recover enough reproducible storage to return the Mac comfortably above 20 GiB free before integrating/testing the sleep-canon-v3 Native compatibility patch.

DO NOT change application source.
DO NOT change Server.
DO NOT deploy.
DO NOT upload.
DO NOT delete anything that risks current Watch physical acceptance state or unpushed work.

READ FIRST

Latest Watch Build 82 checkpoint:
agent-handoffs/reports/20261002T173031Z-watch-v1-cancel-workout-parity-physical-checkpoint.md

Sleep v3 report:
agent-handoffs/reports/20261002T201500Z-healthkit-sleep-canon-v3-copy-coherence.md

Previous safe cleanup report if useful:
agent-handoffs/reports/20261001T185023Z-shared-mac-safe-storage-recovery.md

Mandatory GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

CURRENT IMPORTANT AUTHORITIES

Watch Build 82 implementation:
a173f27b4a9ab208021a1f3cd7febc7402cf3b42
branch codex/apple-watch-workout-v1-phase1a-overnight

Shipping Native:
Build 81
6a0932517cbd8de165bf25c7637a2d2d6fea03dc

Sleep Native compatibility candidate:
3ed3eae7
branch claude/sleep-canon-v3-native-accept-20261002

Production Server:
d0ff65965233fa44e108387f01b649a2bdb476df
v3 deployed dormant.

A. INVENTORY FIRST

Record:
- df -h /;
- vm.swapusage;
- largest directories under relevant Xcode/PhysiqueOS temp/build areas;
- active xcodebuild/simctl/Xcode/Claude/Codex processes;
- git worktrees;
- dirty/untracked/unpushed state for every PhysiqueOS worktree that could be affected;
- archives;
- DerivedData;
- simulator caches/logs;
- Swift module/build caches;
- temporary Phase 1A/Build 82 artifacts.

Do not delete during inventory.

B. HARD PRESERVATION RULES

MUST preserve:
- every dirty/uncommitted source change;
- every unpushed commit/branch;
- Watch Build 82 implementation worktree/branch;
- Sleep v3 Native candidate branch;
- current shipping Native authority;
- signed development/provisioning profiles;
- Xcode account/authentication;
- Apple Developer credentials/signing material;
- physical-device pairing/trust;
- simulator devices and their app/Health data unless explicitly proven disposable;
- current production-read tooling;
- DigitalOcean contexts/PATs;
- source archives/reports;
- any archive needed as the most recent rollback/release authority.

Do not manually delete swap files.

Do not remove the installed development apps from Founder iPhone/Watch.

C. SAFE CLEANUP CANDIDATES

Prefer, in order:
1. DerivedData for completed/old builds;
2. reproducible Watch/Build 82 temporary DerivedData;
3. old temporary xcresult bundles;
4. old simulator build products/caches that do not remove simulator devices/data;
5. Swift/clang module caches if reproducible;
6. old /private/tmp PhysiqueOS archives/builds that are not current rollback/release authorities;
7. completed pushed clean worktrees verified safe to remove;
8. old TestFlight/archive artifacts superseded by retained authorities.

Before removing any worktree:
- verify clean;
- verify branch pushed;
- verify exact commit reachable from origin;
- verify not needed by active Claude/Codex session.

D. WATCH / BUILD 82 PRESERVATION

Build 82 physical development candidate is installed and accepted for Cancel lifecycle.

Preserve:
- a173f27b implementation;
- current Watch signing/provisioning state;
- AppIcon source/assets;
- HealthKit profile;
- paired-device setup.

The old temporary archive may be deleted only if:
- it is reproducible from pushed source;
- no unique signing/debug evidence would be lost;
- the latest report contains sufficient signed-archive evidence;
- a newer retained archive/authority is not required for rollback.

Prefer keeping the latest Build 82 archive until after Sleep integration if disk permits.

E. SLEEP CANDIDATE PRESERVATION

Preserve:
3ed3eae7
and its branch/commit authority.

Do not run its simulator tests during cleanup.

F. RESOURCE FLOOR

Target:
>=20 GiB free.

Hard minimum after cleanup:
>=15 GiB.

If safe cleanup cannot reach 20 GiB without touching preserved state:
STOP and report options.
Do not waive preservation rules.

G. PROCESS SAFETY

Stop only reproducible build/simulator processes that are clearly inactive/finished and consuming storage/resources.

Do not kill active Remote Control hosts required for current workflows.

Do not terminate an active coder session without verifying it is complete.

H. POST-CLEANUP VERIFY

Record:
- df -h /;
- vm.swapusage;
- git status/branch/SHA for Watch and Sleep candidate;
- Xcode signing/profile presence sufficient for later Build 82 work;
- physical device tooling still sees iPhone/Watch if available;
- no preserved worktree lost.

I. REPORT

Publish:
agent-handoffs/reports/<timestamp>-shared-mac-safe-storage-cleanup-before-sleep-native.md

Include:
- before/after free space;
- swap;
- exactly what categories were removed;
- worktrees removed with proof;
- preserved archives;
- preserved authorities;
- signing/device state;
- any remaining large safe candidates.

No secrets.

MANDATORY GH PROTOCOL

Before stopping:
- publish report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- provide exact main report SHA.

END TASK.
