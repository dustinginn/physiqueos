# PhysiqueOS Mac iCloud recovery V1 — mandatory pre-iCloud checkpoint

## Authority and status

- Status: **LOCAL PHASE 7 PASS / FIRST ICLOUD WRITE AUTHORIZED BY FOUNDER BUT NOT YET PERFORMED**
- Repository: `dustinginn/physiqueos`
- Implementation branch: `codex/mac-icloud-backup-recovery-v1-20261003`
- Exact pushed implementation/tool SHA: `54b4ba82ed089a98e2c5950fecbe9b9a7a7e4dc8`
- Main-branch report commit: this report's publication commit on `origin/main`; exact SHA is verified and reported immediately after publication.
- Assignment authority: `b84428fe54121f5a0d5198157fe972d99586a59a`
- Audit authority: `4116f671f97613fc722aa77cd6a376ae2dd18b59`
- Intended exact destination: `~/Library/Mobile Documents/com~apple~CloudDocs/PhysiqueOS Backups`
- At report creation, that dedicated destination does not exist and **zero iCloud writes have occurred**.

## Implemented

- Tracked `scripts/operations/physiqueos-recovery` modes: `audit`, `dry-run`, `create`, `verify`, `restore-smoke-test`, and `status`, plus gated iCloud publication, archive, retention, scheduler and explicit hook operations.
- Local immutable staging under `~/Library/Application Support/PhysiqueOS Recovery/`.
- Fresh-origin Git aggregation across five discovered common object databases with collision-free recovery refs, stashes inventory, a verified local-only bundle, and an exact-ref-keyed bounded cache for File Provider-backed legacy objects.
- NUL-safe porcelain-v2 status capture; full-index binary staged/unstaged patches; exact worktree/index blobs, modes, deletions, symlinks, untracked inventory and content-addressed deduplication without changing active indexes/worktrees.
- Fail-closed scanner outcomes `PASS`, `FAIL_SECRET`, `FAIL_UNKNOWN_FILE`, and `FAIL_SCANNER_ERROR`; sanitized path/rule/count-only findings; pre-bundle unpushed Git-blob scan and post-extraction rescan.
- Safe guarded release-tool source, schema-validated receipts/state, tool/context/signing/profile/launch metadata, archive identity inventory and replacement-Mac runbook. No credentials are included.
- Build 84 (`current-valid`) and Build 83 (`previous-rollback`) are the only selected archive tier; both report version `1.0`, expected build numbers, three embedded archive profiles each, and zero private-key-like files. No standalone profile or signing private key is copied.
- SHA-256 manifest, per-file checksum manifest, `COMPLETE` marker, 100 MiB small-generation ceiling, `.incoming -> verify -> rename -> LATEST` publisher, upload-state semantics, first-generation retention guard, single-instance launchd design and recursion-safe explicit hooks.

## Exact local proof

First durable local generation:

- Generation: `PhysiqueOS-Recovery-20261003-191629Z`
- Source time: `2026-10-03T19:18:40Z`
- Size: `5,260,954` bytes
- Files checksummed: `95`
- Manifest SHA-256: `7b712856eb9437ffce9d0e9d63d12abb80f177fe7a1d2bb78f49eb9d1e96413d`
- Secret scan: `PASS`, zero findings
- Local-only refs restored at exact SHA: `22`
- Dirty worktrees recreated and exact status/hash/mode verified: `5`
- Safe guarded tool sources: `4`
- Schema-validated release receipts: `37`
- File Provider/legacy status-unknown checkouts: `14`; refs covered, dirty state explicitly not claimed

Commands actually run on the exact implementation candidate:

- Python deterministic suite: `18` tests, all pass.
- Swift/Foundation helper compile/run with disposable module cache: pass; non-iCloud `/private/tmp` correctly reports upload metadata unavailable/unknown.
- Live `audit`: pass; 22 recovery refs, 140 unpushed blobs scanned `PASS`, Build 84/83 identity pass, iCloud root available, dedicated destination absent.
- Full `dry-run`: pass; 5,260,955 bytes, 95 checksums, 22 refs restored, five dirty worktrees restored, secret rescan `PASS`, zero iCloud writes.
- Durable local `create`: pass.
- Exact-generation `verify`: pass.
- Exact-generation fresh-GitHub `restore-smoke-test`: pass; scratch removed after verification.
- `git diff --check`: pass.

Not run yet, by gate:

- No iCloud destination creation/copy.
- No restore test from iCloud destination bytes.
- No archive-tier iCloud copy.
- No launchd scheduler installation/bootstrap.
- No checkpoint/release hook installation.
- No retention deletion; generation #1 is deletion-ineligible by design.
- No independent second-session/device retrieval.

## Content classes and explicit exclusions

Included classes: local-only Git objects/refs, exact approved dirty/index/untracked state, safe guarded-tool source, validated release receipts/state, sanitized operational/tool/worktree/signing/archive metadata, checksum manifests and restore instructions.

Excluded classes: active repositories/worktrees, pushed source already authoritative on GitHub, credential/release configs, ASC keys, PATs/tokens, keychains/private keys, auth/session stores, raw production/health exports, DerivedData, simulators/device support, `node_modules`, `.next`, caches and production-read runtime bundles.

## iCloud truth semantics

The next step may establish `LOCAL_ICLOUD_CONTAINER_COMPLETE` only after destination rehash, final rename and `LATEST.json`. Foundation metadata may later establish `ICLOUD_UPLOAD_REPORTED_COMPLETE`. Neither state is `REMOTE_ICLOUD_SYNC_CONFIRMED`; only retrieval and checksum verification from a distinct iCloud session/device can establish that. Until then the independent remote state remains `REMOTE_ICLOUD_SYNC_UNKNOWN`.

## Safe next step

After this report is committed to and re-read from `origin/main`, proceed under the Founder's existing authorization to create exactly `iCloud Drive/PhysiqueOS Backups`, copy the first small generation through its `.incoming` path, destination-verify, rename, update `LATEST.json`, query supported Foundation metadata, and run the scratch restore from the final iCloud destination copy. Publish a second GH-main checkpoint immediately afterward.

The selected archive copy remains separately gated by the standing disk-safety floor: current free space is about 13.2 GiB, below the 15 GiB archive-operation floor. No unrelated data will be deleted to manufacture space.
