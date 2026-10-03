# PhysiqueOS Mac iCloud recovery V1 — post-copy and iCloud-restore checkpoint

## Authority and status

- Status: **FIRST SMALL GENERATION LOCAL COPY + UPLOAD-REPORTED + RESTORE-FROM-ICLOUD PASS**
- Repository: `dustinginn/physiqueos`
- Implementation branch: `codex/mac-icloud-backup-recovery-v1-20261003`
- First-generation tool SHA: `54b4ba82ed089a98e2c5950fecbe9b9a7a7e4dc8`
- Latest pushed status/archive-integrity implementation SHA: `6a3e61992c4f237fff881611dc4be76e62cf4438`
- Mandatory pre-iCloud `origin/main` checkpoint: `b181dd54c98ba27aab6717eef2996d0ce3039d8c`
- Main-branch report commit: this report's publication commit on `origin/main`; exact SHA is verified and reported immediately after publication.

## First generation

- Generation: `PhysiqueOS-Recovery-20261003-191629Z`
- Manifest SHA-256: `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d`
- Size: `5,260,954` bytes
- Checksummed payload files: `95`
- iCloud final-file count reported by Foundation: `97` (payload plus generation metadata files)
- Exact destination: `~/Library/Mobile Documents/com~apple~CloudDocs/PhysiqueOS Backups/generations/PhysiqueOS-Recovery-20261003-191629Z`
- Local state: `LOCAL_STAGING_COMPLETE`
- iCloud-container state: `LOCAL_ICLOUD_CONTAINER_COMPLETE`
- Upload state: `ICLOUD_UPLOAD_REPORTED_COMPLETE` — 97 uploaded, 0 uploading, 0 errors, 0 metadata-unavailable
- Independent remote state: `REMOTE_ICLOUD_SYNC_UNKNOWN`

## Verified operation

The dedicated destination was created only after the pre-write report was committed to and re-read from `origin/main`. The publisher copied under `.incoming-<generation>-<uuid>`, reverified the destination checksums and scanner result, renamed to the final immutable generation name, and atomically updated `LATEST.json` last. No active repository or worktree was placed under iCloud.

The required `restore-smoke-test` was then run from the final iCloud destination copy, not local staging. Result:

- checksum verification: `PASS`;
- secret rescan: `PASS`, zero findings;
- local-only refs restored at exact SHA: `22`;
- dirty worktrees reconstructed with exact status/hash/mode: `5`;
- fresh GitHub clone and Git bundle verify/import: `PASS`;
- restored Git-object rescan: `PASS`;
- safe tool syntax checks: `PASS`;
- deterministic Xcode project regeneration: `PASS`;
- scratch state removed after verification.

The first Foundation query immediately after copy reported transient uploading/errors. A later supported Foundation metadata refresh, after exact generation re-verification, reported all 97 files uploaded with no uploading/error/unavailable state. The transient result is retained as operational evidence rather than hidden.

## Safety and exclusions

- No credentials, keychains, signing private keys, PATs/tokens, auth sessions, credential configs, raw production/health exports, DerivedData, simulator/device data, `node_modules` or caches were copied.
- No active worktree/index/ref was mutated.
- No existing backup was deleted or rotated; this is generation #1.
- The 14 File Provider/legacy status-unknown checkouts remain recorded without claiming dirty-state coverage; their common-database refs are included.
- Build 84/83 archives were not copied because free space remains about 13.2 GiB, below the standing 15 GiB archive-operation floor. Selection/identity/private-key checks pass; copy remains deferred, not silently skipped.
- Time Machine/second destination remain intentionally outside V1.

## Remaining gates

- Run a fresh clean-snapshot implementation review before launchd enablement.
- If clear, install the independent 03:30 local launchd agent and explicit post-main-checkpoint/post-TestFlight-VALID hooks. The first RunAtLoad catch-up must skip because this generation is fresh.
- Confirm retention dry-run shows generation #1 deletion disabled.
- Independent remote durability is not proven by Foundation metadata. A distinct iCloud session/device must retrieve and checksum-verify the generation before state may become `REMOTE_ICLOUD_SYNC_CONFIRMED`.

No Founder decision is needed for the already-approved scheduler/hook installation. Independent remote confirmation will require one Founder action after the implementation checkpoint is complete.
