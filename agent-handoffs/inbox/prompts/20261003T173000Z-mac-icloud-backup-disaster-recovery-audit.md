PhysiqueOS Mac backup/disaster-recovery audit and plan.

TASK TYPE
Codex audit/design only. DO NOT write to iCloud, delete files, move active repos, copy credentials, alter signing/keychain, or install a scheduler.

Read the Mac disaster-recovery backlog section, STANDING_DISK_SAFETY.md, current Remote Control/worktree rules, and current release/production-access reports.

GOAL
Design recovery from total Mac loss using GitHub for pushed source plus a safe immutable recovery bundle copied to a dedicated iCloud Drive folder. Desired cadence: daily plus after major patches/releases.

CORE RULE
Do NOT put active Git repos/worktrees, Xcode build trees, DerivedData, simulator data, node_modules or caches directly under iCloud sync. Prefer:
active local state -> local staged immutable/versioned bundle -> validation/checksum/secret scan/restore smoke test -> atomic iCloud copy.

A. THREAT MODEL
Cover SSD death, lost/stolen Mac, macOS reinstall, accidental repo deletion, Git/worktree corruption, dirty/uncommitted loss, unpushed commit loss, local-tool loss, archive loss, unavailable iCloud, interrupted copy, corrupt bundle, secret inclusion, destructive/ransomware state copied into newest backup, and GitHub available while local non-Git state is gone. State what is not protected.

B. READ-ONLY MAC INVENTORY
Inventory without exposing secret values:
- all PhysiqueOS repo roots/worktrees, branch/SHA, dirty state, ahead/behind, untracked counts, unpushed commits, stashes, submodules/worktree config;
- what is already durable on GitHub vs local only;
- Remote Control host/setup and coder worktree conventions;
- local-only agent/coordination state needed to resume;
- approved production-read runner and safe local operational scripts;
- doctl context/config PRESENCE/NAMES only;
- guarded ASC uploader and release tooling;
- Xcode version, project generator, Organizer archives, provisioning/certificate metadata only, keychain dependency, device-support caches, DerivedData;
- simulator state and whether any is genuinely irreplaceable;
- ignored files, .tmp tools, release/build receipts, logs, shell scripts/aliases, launch agents/services used for PhysiqueOS.
Classify every item: REPRODUCIBLE, GITHUB-DURABLE, BACKUP-WORTHY, SECRET-NEVER-COPY, OPTIONAL-LARGE, UNKNOWN-REVIEW.

Never read/print credential contents.

C. ICLOUD DESTINATION AUDIT
Without writing:
- detect current user's iCloud Drive path/container and availability;
- recommend dedicated destination, likely "PhysiqueOS Backups";
- assess Optimize Storage implications;
- determine what local filesystem evidence can/cannot prove about remote iCloud upload completion.
Do not assume copy success means off-device durability. If remote completion cannot be proven programmatically, say so and design explicit status states.

D. IMMUTABLE BUNDLE DESIGN
Design a bundle like:
PhysiqueOS-Recovery-YYYYMMDD-HHMMSS/
MANIFEST.json
README-RESTORE.md
git/
local-state/
release-inventory/
tool-inventory/
checksums/

Capture only useful safe state.

Git:
- one or more git bundles containing local refs/commits not guaranteed on origin;
- binary-safe dirty tracked-state capture;
- safe untracked-file capture using explicit filters/allowlists;
- stashes;
- worktree/branch/SHA inventory;
- sanitized origin metadata.
Do not rely only on git diff.

Safe local artifacts:
- non-secret untracked operational scripts;
- release receipts if safe;
- archive inventory;
- configuration-name inventory;
- launch-service definitions;
- restoration notes.

NEVER COPY:
keychain databases, private signing keys, ASC private keys, PATs, DO tokens, database URLs, secret .env files, browser/session auth, SSH private keys, raw production/health exports, Claude/OpenAI auth/session tokens.

E. SECRET SCAN — FAIL CLOSED
Design deterministic filename/content scanning before any bundle leaves staging. Detect likely .env/.pem/.p8/keychain/credentials/tokens/auth headers/database URLs/private keys. Use denylist plus allowlist. Report only sanitized filenames/categories, never secret values. No iCloud copy unless PASS.

F. GIT SAFETY
Prove pushed commits exist on origin; identify/capture unpushed refs; capture dirty/untracked safely; never reset/stash/clean working trees as part of backup. Verify a scratch restore can reconstruct exact branch/SHA/status. Decide whether one canonical repo-level git bundle can cover all worktrees.

G. XCODE/SIGNING/RELEASE
Determine backup vs documentation:
- no DerivedData/device support;
- inventory Xcode/generator;
- decide whether selected signed xcarchives deserve a separate lower-frequency backup tier.
Do not export signing private keys/keychain in this task.
Flag whether current signing depends on a private key existing only on this Mac and explain replacement-Mac recovery options safely.

H. TOOLING RECOVERY
Map restore of guarded ASC uploader, production-read runner, doctl, GitHub auth, Remote Control host, Xcode CLI, Python/Node dependencies. Separate safe tool source/config from credentials requiring reauthentication.

I. CADENCE
Recommend exact cadence:
- daily small metadata/git/local-state bundle;
- post-major-patch/release bundle;
- optional weekly/release archive tier.
Simplicity/reliability over clever incremental complexity.

J. RETENTION
Size from actual measured state and recommend daily/weekly/monthly/release retention. Never rotate/delete old backup until new bundle is staged, checksummed, restore-smoke-tested and copied to iCloud as far as can be verified. No retention deletion implementation now.

K. ATOMICITY/CORRUPTION
Design:
1 local staging outside iCloud;
2 manifest;
3 secret scan;
4 checksum every file;
5 restore smoke test;
6 COMPLETE marker;
7 copy to iCloud under incomplete/temp name;
8 destination checksum verify;
9 atomic rename if supported;
10 update LATEST last.
Distinguish LOCAL_ICLOUD_CONTAINER_COMPLETE from REMOTE_ICLOUD_SYNC_CONFIRMED or UNKNOWN. Never claim remote durability without evidence.

L. RESTORE DRILL
Design real scratch restore:
clone origin, import git bundle, restore dirty/untracked, recreate worktree inventory, verify SHA/status, restore safe tools, run project generator. No secrets required; document re-auth separately. Define PASS.

M. NEW-MAC RUNBOOK
Ordered runbook:
macOS/iCloud -> Xcode/toolchain -> Git/GitHub/doctl/etc -> clone -> retrieve verified bundle -> restore unpushed/dirty -> recreate worktrees -> safe tools -> reauthenticate GitHub/DO/ASC/Xcode/Remote Control -> verify signing -> deterministic health checks -> resume.
Identify Founder-only actions.

N. AUTOMATION DESIGN
Design but DO NOT install a native macOS backup tool/script with modes:
audit, dry-run, create, verify, restore-smoke-test, status.
Daily scheduling should use launchd or equivalent and not depend on Claude/Codex being alive. Post-major-patch/release can be invoked by coder/release workflow. Silent success, alert failure/stale if feasible.

O. RPO
Recommend recovery point objectives:
pushed code near-zero via GitHub;
local dirty/unpushed <=24h via daily plus post-major-patch.
Assess whether lightweight hourly local snapshot adds value.

P. STORAGE
Measure likely small-bundle size and selected archive size. Avoid iCloud churn.

Q. FOUNDER DECISIONS
End with only genuine choices, each with recommendation:
1 destination folder;
2 cadence;
3 retention;
4 signed xcarchive inclusion/frequency;
5 untracked-file allowlist policy;
6 optional second off-device destination later.

R. PHASED IMPLEMENTATION
Phase 1 audit/design.
Phase 2 implement local backup tool/dry-run.
Phase 3 secret scan + restore smoke test.
Phase 4 Founder approves exact iCloud destination; first real copy.
Phase 5 restore drill from iCloud copy.
Phase 6 install scheduler + release hook.
Hard gate: no iCloud writes before Founder approval.

S. REPORT
Publish agent-handoffs/reports/<timestamp>-mac-icloud-backup-disaster-recovery-audit-plan.md
Update durable backlog with findings, risks, plan, decisions pending, implementation NOT started.
Follow mandatory GH-main protocol.
