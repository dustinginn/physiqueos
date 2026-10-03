# PhysiqueOS recovery V1

`physiqueos-recovery` creates immutable, checksummed recovery generations without placing a live Git checkout in iCloud Drive. GitHub remains authoritative for pushed source; each generation contains only local-only Git closure, explicitly approved dirty/untracked state, sanitized operational inventory, and safe guarded-tool source.

## Safety model

- Local staging is `~/Library/Application Support/PhysiqueOS Recovery/`.
- The only cloud destination is `~/Library/Mobile Documents/com~apple~CloudDocs/PhysiqueOS Backups`.
- Unknown untracked content, a scanner error, a secret match, a special file, a symlink escape, a checksum mismatch, or a small generation over 100 MiB fails closed.
- Active worktrees, indexes, refs, credentials, keychains, private keys, auth sessions, production/health exports, build trees, DerivedData, simulators, dependencies, and caches are never copied.
- The 13 File Provider-blocked Documents checkouts remain explicitly `UNKNOWN_FILE_PROVIDER_OR_TIMEOUT`; their Git refs are still recovered from the legacy common object database. The tool does not claim dirty-state coverage for them.
- `.xcarchive` capture is separate. Only Build 84 and Build 83 are selected. An embedded provisioning profile is permitted only as an inseparable component of those two identity-verified archives; no profile is copied separately, and any private-key-like file blocks archive capture.

## Operator flow

```sh
scripts/operations/physiqueos-recovery audit
scripts/operations/physiqueos-recovery dry-run
scripts/operations/physiqueos-recovery create --reason manual
scripts/operations/physiqueos-recovery verify --source '<local-generation-path>'
scripts/operations/physiqueos-recovery restore-smoke-test --source '<local-generation-path>'
scripts/operations/physiqueos-recovery publish-icloud --source '<local-generation-path>'
scripts/operations/physiqueos-recovery restore-smoke-test --source '<iCloud-generation-path>'
scripts/operations/physiqueos-recovery copy-archives
scripts/operations/physiqueos-recovery install-scheduler
scripts/operations/physiqueos-recovery status
```

`publish-icloud` stages `.incoming-<generation>-<uuid>`, verifies all destination checksums, renames to the immutable final name, and updates `LATEST.json` last. Local copy success is `LOCAL_ICLOUD_CONTAINER_COMPLETE`. Foundation ubiquitous-item metadata may report `ICLOUD_UPLOAD_REPORTED_COMPLETE`, but it can never establish independent off-device durability; that remains `REMOTE_ICLOUD_SYNC_UNKNOWN` until a distinct iCloud session/device retrieves and verifies the generation.

The installed launch agent runs at 03:30 local. `StartCalendarInterval` supplies macOS wake coalescing, while `RunAtLoad` provides login catch-up; the tool skips a catch-up when a successful source capture is less than 24 hours old. It uses a nonblocking single-instance lock and rotates its logs at 1 MiB with three retained files.

After installation, explicit hooks live under `~/Library/Application Support/PhysiqueOS Recovery/hooks/`:

- `after-major-main-checkpoint --report-path <durable-report>`
- `after-testflight-valid --report-path <durable-release-report>`

Call them only after the referenced report is on GH `main` and, for release, TestFlight is `VALID`. Recovery reports and an already-active recovery process are rejected to prevent recursion.

## Retention

The planner keeps 14 daily, 8 weekly, 12 monthly, and 12 release/checkpoint generations, with a floor of three uploaded small generations. First-generation deletion is disabled. Any upload/error/unknown state disables deletion. Archive retention is separate. V1 exposes the deterministic plan but does not rotate generation #1.

The generated `README-RESTORE.md` is the replacement-Mac runbook. It requires fresh authentication for Apple/iCloud, GitHub, DigitalOcean, App Store Connect/Xcode signing, and Claude Remote Control; old auth/session state is never restored.
