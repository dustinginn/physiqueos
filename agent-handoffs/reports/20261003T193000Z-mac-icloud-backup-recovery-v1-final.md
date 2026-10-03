# PhysiqueOS Mac iCloud backup / recovery V1 — final implementation report

## Result

Status: **IMPLEMENTED FOR THE SMALL DAILY/CHECKPOINT TIER; PARTIAL FOR ARCHIVE TIER AND INDEPENDENT REMOTE CONFIRMATION**

- Repository: `dustinginn/physiqueos`
- Implementation branch: `codex/mac-icloud-backup-recovery-v1-20261003`
- Exact final pushed tool SHA: `b53c26ed8d3be583dd8b0dd3becece436689bcd9`
- Assignment authority: `b84428fe54121f5a0d5198157fe972d99586a59a`
- Pre-iCloud main checkpoint: `b181dd54c98ba27aab6717eef2996d0ce3039d8c`
- Post-iCloud restore main checkpoint: `044b1b12b2dd528b76b77de6df2b38a0d5babc9f`
- Main-branch final-report commit: this report's publication commit on `origin/main`; exact SHA is verified and reported immediately after publication.

## First immutable generation

- ID: `PhysiqueOS-Recovery-20261003-191629Z`
- Manifest SHA-256: `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d`
- Size: `5,260,954` bytes
- Checksummed payload files: `95`
- Source time: `2026-10-03T19:18:40Z`
- Local source: `~/Library/Application Support/PhysiqueOS Recovery/generations/PhysiqueOS-Recovery-20261003-191629Z`
- Recovery path: `iCloud Drive/PhysiqueOS Backups/generations/PhysiqueOS-Recovery-20261003-191629Z`
- `LATEST.json`: `iCloud Drive/PhysiqueOS Backups/LATEST.json`

Content classes are 22 fresh-origin-unreachable Git refs, exact state for five dirty worktrees, four guarded release-tool sources, 37 schema-validated release receipts, safe tool/worktree/release/archive/signing metadata, checksums and the replacement-Mac runbook. Fourteen File Provider-backed legacy checkouts remain `UNKNOWN_FILE_PROVIDER_OR_TIMEOUT`; their common-database refs are included, but dirty-state coverage is not claimed.

## Verification

- Deterministic suite on final implementation: `22` tests, all pass.
- Clean exported `origin/main` scheduler review snapshot: `19` tests, all pass before the final fresh-upload, scheduled-upload failure and idempotent reinstall gates; all additional gates then pass in the 22-test final suite.
- Live read-only audit: `PASS`; 140 unpushed blobs scanned cleanly.
- Full local dry-run: `PASS`, zero iCloud writes.
- Local create/checksum/secret scan: `PASS`.
- Scratch restore from local generation: `PASS`.
- `.incoming -> destination rehash -> final rename -> LATEST` copy: `PASS`.
- Scratch restore from the final iCloud destination copy: `PASS`; 22 refs and five dirty states recreated exactly, safe tools syntax-checked, project regeneration deterministic, restored Git/package bytes rescanned cleanly.
- Installed source hashes equal the tracked source hashes.
- Launchd registration: loaded at `gui/502/com.physiqueos.recovery`, state idle, runs `1`, last exit `0`, next calendar trigger 03:30 local.
- RunAtLoad catch-up: `SKIPPED` correctly because last success was within 24 hours.
- Recursion test: the checkpoint hook given this recovery report returned `SKIPPED / recursion-prevention`.
- Retention generation-1 plan: disabled with `delete: []` and reason `first-generation-no-delete`.

## State truth table

- Local validation: `PASS` / `LOCAL_STAGING_COMPLETE`.
- Local iCloud-container copy: `LOCAL_ICLOUD_CONTAINER_COMPLETE`.
- Upload reported: Foundation returned `ICLOUD_UPLOAD_REPORTED_COMPLETE` twice, including a fresh query immediately before scheduler installation: 97/97 uploaded, 0 uploading, 0 errors, 0 unavailable.
- Latest live Foundation query at final install: `ICLOUD_UPLOAD_REPORTED_COMPLETE`, 97/97 uploaded. Intermediate queries returned all metadata unavailable; this instability is retained as evidence, future unknown/error states disable retention, and scheduled runs wait up to five minutes before failing closed and notifying.
- Independent remote confirmation: `REMOTE_ICLOUD_SYNC_UNKNOWN`.

Local copy success was never equated with remote durability. Even a stable Foundation uploaded report would remain the local File Provider's assertion, not proof that a replacement Mac can retrieve identical bytes.

## Scheduler and hooks

- Launch agent: `~/Library/LaunchAgents/com.physiqueos.recovery.plist`
- Installed independent executable: `~/Library/Application Support/PhysiqueOS Recovery/bin/physiqueos-recovery`
- Daily cadence: 03:30 local via `StartCalendarInterval`; `RunAtLoad` supplies login catch-up and macOS coalesces missed calendar jobs after wake.
- Single-instance lock, 1 MiB/three-generation bounded logs, silent success and failure notifications are implemented.
- Scheduled runs use a bounded upload-status wait; upload error or unavailable completion returns failure and takes the notification path rather than silently reporting success.
- Checkpoint hook: `~/Library/Application Support/PhysiqueOS Recovery/hooks/after-major-main-checkpoint`
- Release hook: `~/Library/Application Support/PhysiqueOS Recovery/hooks/after-testflight-valid`
- Hooks are explicit: invoke only after the durable GH-main or TestFlight-VALID report exists. Recovery reports and active recovery runs cannot recurse.

## Retention and archives

Retention policy is implemented as 14 daily, 8 weekly, 12 monthly and 12 release/checkpoint generations, with at least three uploaded small generations. It cannot delete generation #1. Any current upload unknown/error disables deletion. No backup was deleted or rotated in this task.

Build 84 (`current-valid`) and Build 83 (`previous-rollback`) are the only selected archives. Both are version/build verified, each has 52 files, and neither contains a private-key-like file. The exact archive package/checksum flow is implemented, but the real archive copy was not run: about 13 GiB is free, below the standing 15 GiB heavy-operation floor. No cache, repository, worktree or user data was deleted to create space.

## No-secret and non-mutation statement

Secret scanning passed before Git bundle creation, before local promotion, during verification and after scratch extraction. No matching values were ever logged. The bundle excludes credentials, keychains/signing private keys, ASC/doctl/release credential configs, PATs/tokens, auth sessions, raw production/health exports, DerivedData, simulators/device data, `node_modules`, `.next` and caches. No active worktree/index/ref was reset, stashed, cleaned, moved or deleted. The old Documents worktrees were not moved or deleted.

## Replacement-Mac runbook

The exact ordered runbook is inside every generation at `README-RESTORE.md`. The safe sequence is Apple/iCloud login and 2FA; install Xcode/toolchain; authenticate and fresh-clone GitHub outside iCloud; verify the generation; import reviewed `refs/recovery/*`; reconstruct dirty state only in scratch worktrees; restore only safe tools; regenerate the Xcode project; separately reauthenticate DigitalOcean, App Store Connect/Xcode signing and Claude Remote Control; then rerun deterministic health checks. Old auth/session files are never restored.

## Genuine Founder actions remaining

1. **Independent remote confirmation:** from a distinct iCloud surface/session, download `PhysiqueOS-Recovery-20261003-191629Z`, then provide the downloaded directory to `physiqueos-recovery verify --source <downloaded-directory>`. Recommendation: use iCloud.com or another Mac, not the local Finder copy; only a passing checksum/restore may mark `REMOTE_ICLOUD_SYNC_CONFIRMED`.
2. **Archive-tier disk floor:** make at least 15 GiB free before Build 84/83 archive capture. Recommendation: provide 3–5 GiB of additional headroom through a separately approved cleanup, then run `physiqueos-recovery copy-archives`; do not delete source state or existing backups.

No decisions are required about destination, cadence, retention, archive selection, untracked policy, Time Machine or a second V1 destination; those were already resolved by the Founder.
