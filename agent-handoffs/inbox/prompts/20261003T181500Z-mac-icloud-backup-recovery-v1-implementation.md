PhysiqueOS Mac iCloud backup/disaster-recovery — IMPLEMENT approved V1 plan

TASK TYPE
Codex implementation + local proof + first real iCloud backup + restore verification + scheduler/hooks, using hard gates.

Founder approves the audit recommendations and wants to proceed. Time Machine is intentionally OUT OF SCOPE; do not block V1 on it and do not keep it as a required follow-up.

READ FIRST
agent-handoffs/reports/20261003T174554Z-mac-icloud-backup-disaster-recovery-audit-plan.md
Audit authority: main 4116f671f97613fc722aa77cd6a376ae2dd18b59

Read the durable backlog Mac disaster-recovery section, STANDING_DISK_SAFETY.md, current GH checkpoint protocol, release workflow, and Remote Control/worktree rules.

FOUNDER-APPROVED V1 DECISIONS

Destination:
iCloud Drive/PhysiqueOS Backups

Cadence:
- daily at 03:30 local;
- next-wake/login catch-up if missed;
- post-major-main-checkpoint;
- post-TestFlight-VALID release.

Retention:
- 14 daily;
- 8 weekly;
- 12 monthly;
- 12 release/checkpoint generations;
- rotation only on a later successful run after upload-reported completion;
- always keep at least 3 uploaded small generations;
- if remote/upload state is unknown, disable retention deletion.

Archive tier:
- include selected signed xcarchives separately;
- initially current VALID Build 84 + previous rollback Build 83;
- later current VALID + previous rollback + explicitly named milestones;
- never archive DerivedData/device support/simulator data.

Untracked:
strict explicit path/type/size allowlist.
Unknown untracked content blocks promotion and alerts.
Do not silently capture unknowns.

Second destination / Time Machine:
NOT part of V1.
Founder accepts iCloud Drive as the off-device recovery solution for this project.
Do not require or implement Time Machine.

CORE SAFETY

Never put active repos/worktrees under iCloud.
Never copy secrets.
Never export keychains/signing private keys.
Never reset/stash/clean active worktrees to make a backup.
Never delete source state because backup succeeded.
Never claim remote iCloud durability merely because local copy succeeded.

PHASE 1 — REVERIFY AUDIT FACTS

Before implementation:
- re-fetch origin;
- re-inventory current/legacy Git common databases;
- re-identify local-only refs;
- re-identify dirty/untracked state;
- recheck disk floor;
- recheck iCloud root availability;
- preserve the 13 Documents/File Provider checkouts as UNKNOWN unless safely resolved.

If material drift invalidates the design, publish checkpoint and stop.

PHASE 2 — IMPLEMENT TOOL

Implement a tracked, reviewed tool under an appropriate repo scripts/operations location.

Preferred command name:
physiqueos-recovery

Required modes:
- audit
- dry-run
- create
- verify
- restore-smoke-test
- status

No credentials embedded.

Use a local staging root outside iCloud:
~/Library/Application Support/PhysiqueOS Recovery/

Bundle schema:
PhysiqueOS-Recovery-YYYYMMDD-HHMMSSZ/
  MANIFEST.json
  README-RESTORE.md
  COMPLETE
  git/
  local-state/
  release-inventory/
  tool-inventory/
  checksums/

Use canonical sorted JSON manifests and version the schema.

PHASE 3 — GIT CAPTURE

Implement fresh-origin reachability, not stale local origin refs.

Aggregate recovery refs from every discovered PhysiqueOS common Git object database into a temporary bare staging repo using collision-free namespaces.

Capture:
- local-only branch tips/commits;
- stashes if any;
- worktree branch/SHA inventory;
- remote prerequisites.

Create/verify a Git bundle sufficient to restore local-only refs.

Dirty state:
- NUL-safe porcelain v2 inventory;
- staged binary full-index patch;
- unstaged binary full-index patch;
- exact current bytes for modified tracked files;
- exact index blobs for staged files;
- modes/deletions/renames/symlink targets;
- content-addressed deduplication.

Untracked:
only explicit approved allowlist.
Unknown = fail closed.

Do not alter active worktree/index.

PHASE 4 — SECRET SCANNER

Implement fail-closed scanning before promotion.

Required outcomes:
PASS
FAIL_SECRET
FAIL_UNKNOWN_FILE
FAIL_SCANNER_ERROR

Filename denylist includes:
.env*
.pem
.key
.p8
.p12
.mobileprovision
.keychain*
SSH private key names
.netrc
.npmrc
.pypirc
credential/auth/cookie/session DBs
doctl credential config
ASC credential config
release credential config

Content checks:
private-key headers;
known token patterns;
authorization headers;
JWT-like values;
password/secret/API-key assignments;
credential-bearing DB URLs;
cloud/service-account material;
high-entropy candidates outside approved binaries.

Never print matching secret content.
Reports contain only relative path/category/rule/count.

Scan new/unpushed Git blobs BEFORE making opaque bundle.
Post-package extraction scan again.

PHASE 5 — SAFE LOCAL ARTIFACTS

Include only after schema/secret scan:
- safe local-only guarded release-tool source, excluding configs/credentials;
- schema-validated release receipts/state;
- approved sanitized reports/source;
- archive inventory;
- provisioning/profile metadata only;
- signing certificate fingerprint/expiry metadata only;
- doctl context NAMES only;
- tool versions;
- Remote Control/worktree setup inventory;
- safe launch-service inventory;
- restoration notes.

Never include credential values.

Production-read runner should be regenerated from GitHub, not copied if already durable there.

PHASE 6 — XCODE ARCHIVE TIER

Prepare separate archive tier for Build 84 and Build 83 only initially.

Before copying:
- verify each archive identity/version/build;
- verify it is the intended VALID/rollback artifact;
- checksum it;
- ensure no credential/private-key export is bundled.

Keep archive tier separate from daily small bundle so daily backups stay small.

PHASE 7 — LOCAL CREATE + VERIFY + RESTORE DRILL

Before ANY iCloud write:
1. run audit;
2. run dry-run;
3. create first local staging generation;
4. secret scan PASS;
5. checksum every file;
6. Git bundle verify;
7. scratch restore from fresh GitHub clone;
8. recreate local-only refs;
9. recreate representative dirty worktree state;
10. compare exact SHA/status/file hashes/modes/untracked inventory;
11. restore safe tools to scratch and syntax/help-test only;
12. run ios/Scripts/generate_project.py and verify deterministic result;
13. repeat secret scan on restored/promoted bytes.

If any gate fails:
NO ICLOUD WRITE.
Publish checkpoint with sanitized failure.

PHASE 8 — FIRST ICLOUD COPY

Founder authorizes creation of exact destination:
~/Library/Mobile Documents/com~apple~CloudDocs/PhysiqueOS Backups

Only after Phase 7 PASS:
- create destination if absent;
- copy first small generation under .incoming-<generation>-<uuid>;
- checksum destination bytes against manifest;
- rename locally to final generation name;
- update LATEST.json last.

Track states distinctly:
LOCAL_STAGING_COMPLETE
LOCAL_ICLOUD_CONTAINER_COMPLETE
ICLOUD_UPLOAD_REPORTED_COMPLETE
REMOTE_ICLOUD_SYNC_CONFIRMED
REMOTE_ICLOUD_SYNC_UNKNOWN

Use supported Foundation ubiquitous-item metadata to determine whether every final file reports uploaded/not-uploading/no-error where available.

Do NOT label REMOTE_ICLOUD_SYNC_CONFIRMED from local metadata alone.

For first generation, if possible without requiring another physical device, use a distinct iCloud surface/session retrieval. If true independent retrieval cannot be automated safely, stop at ICLOUD_UPLOAD_REPORTED_COMPLETE and give Founder one simple verification step. Do not misstate status.

PHASE 9 — ARCHIVE COPY

After first small generation passes:
copy Build 84 + Build 83 archive tier to dedicated archive location under PhysiqueOS Backups using same temp/checksum/upload-state discipline.

Do not copy all seven archives.

PHASE 10 — RETENTION

Implement retention logic but do not delete anything on the first successful generation.

Rules:
- deletion only on a later successful run;
- new generation must be locally valid and ICLOUD_UPLOAD_REPORTED_COMPLETE;
- remote/upload unknown disables deletion;
- minimum 3 uploaded small generations;
- retention categories approved above;
- archive tier separately retains current VALID + previous rollback + named milestones.

Add dry-run retention output.

PHASE 11 — SCHEDULER

Only after first real iCloud small generation is valid and upload-reported complete:
install a user launchd agent for daily 03:30 local with next-wake/login catch-up semantics as practical.

Requirements:
- independent of Claude/Codex;
- single-instance lock;
- bounded logs;
- no secrets/environment credentials;
- silent success;
- failure notification for:
  secret scan failure,
  unknown file,
  iCloud unavailable/upload error,
  size ceiling,
  restore failure,
  stale last success >30h.

Do not run heavy archive tier daily.

PHASE 12 — CHECKPOINT/RELEASE HOOKS

Implement safe explicit hooks:
- after major GH-main checkpoint;
- after TestFlight VALID.

They should invoke a small backup generation only after the durable main/release report is published.

Avoid recursion:
backup's own GH report must not trigger another backup indefinitely.

Release hook may invoke archive-tier capture when appropriate.

PHASE 13 — STATUS UX

At minimum CLI status should clearly show:
- latest generation;
- reason;
- source time;
- local validation PASS/FAIL;
- iCloud local copy state;
- iCloud upload-reported state;
- independent remote-confirmation state;
- age;
- last failure;
- next scheduled run;
- archive tier status.

Human-readable LATEST/README.

PHASE 14 — FIRST REAL RESTORE VALIDATION

After iCloud copy:
perform restore-smoke-test FROM THE ICLOUD DESTINATION COPY, not merely local staging.

If bytes are locally evicted/placeholders, download/coordinate first without deleting anything.

PASS criteria from audit report.

Do not apply recovered state to active development; scratch only.

PHASE 15 — DOCUMENT NEW-MAC RUNBOOK

Ship README-RESTORE with exact safe ordered steps.

Founder actions clearly marked:
- Apple/iCloud login + 2FA;
- GitHub auth;
- DO auth;
- ASC/Xcode auth/signing;
- Claude Remote Control auth;
- any signing identity recreation.

Do not suggest restoring old auth/session files.

SIZE / DISK GATES

Small generation expected 5–25 MiB.
Hard review ceiling 100 MiB.
Crossing ceiling = fail closed.

Respect STANDING_DISK_SAFETY.
Do not perform archive copy or large restore if below required floor.

UNKNOWN DOCUMENTS CHECKOUTS

The old ~/Documents Git/File Provider estate is NOT to be deleted/moved in this task.

Attempt bounded safe classification if the new tool can inspect Git admin state without blocking.
If still UNKNOWN, record it.
Backup local refs from the legacy common object DB regardless, where safely possible.
Do not claim dirty-state coverage for checkouts that cannot be read.

Later migration out of Documents is separate.

TESTS

Add deterministic tests for:
- manifest schema/canonicalization;
- local-ref reachability;
- git bundle creation/verify;
- binary dirty state;
- staged vs unstaged;
- untracked allowlist;
- unknown blocks;
- secret filename/content;
- no secret value in logs;
- symlink escape;
- special files;
- oversize;
- checksum mismatch;
- incomplete generation ignored;
- iCloud status state machine;
- upload unknown;
- retention no-delete first run;
- retention disabled when upload unknown;
- minimum 3 generations;
- scheduler lock/catch-up;
- recursion prevention;
- archive selection;
- restore exact status;
- failure notification path.

Fresh independent review before enabling scheduler.

FOUNDER ACCEPTANCE / DECISIONS ALREADY RESOLVED

Do not ask again about:
- destination;
- 03:30 cadence;
- retention counts;
- Build84+83 archive tier;
- strict untracked allowlist;
- Time Machine/second destination for V1.

Only stop for Founder input if:
- a real secret/unknown file requires allowlisting;
- iCloud destination/access is unavailable;
- independent remote confirmation requires a manual Founder action;
- signing/archive facts materially differ;
- implementation review finds a blocker requiring product choice.

REPORTING

Publish an early checkpoint after local Phase 7 validation.

Before any iCloud write, GH checkpoint must state:
- exact tool SHA;
- secret scan result;
- restore result;
- selected bundle size/content classes;
- no secrets;
- exact destination.

Then proceed because Founder has already authorized the exact destination and first copy IF those gates pass.

Publish another checkpoint after first iCloud generation/upload status and restore-from-iCloud test.

Final report:
- tool SHA;
- first generation id;
- manifest digest;
- size;
- local/iCloud/upload/remote states;
- archive tier state;
- restore test;
- scheduler install/status;
- hooks;
- retention implementation state;
- known UNKNOWN checkouts;
- no-secret statement;
- exact new-Mac recovery path.

Update durable backlog from BACKLOG to IMPLEMENTED/PARTIAL as facts warrant.

Follow mandatory GH-main protocol at every stop.

END TASK.
