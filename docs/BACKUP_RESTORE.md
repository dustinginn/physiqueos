# PhysiqueOS Backup and Restore

Canonical `main` is the source of truth for accepted application code. A
production release snapshot may be preserved independently for provenance, but
required source must not live only in a dirty overlay repository or a Git
gitlink.

## What a complete backup means

A backup is complete only when all of these checks pass:

- the root working tree is clean and committed;
- the embedded-repository audit finds no unknown or unsafe nested repository;
- every required external preservation artifact is present and matches its
  recorded SHA-256;
- `git bundle verify` succeeds; and
- the bundle SHA-256 and audit result are recorded in `manifest.json`.

The repository policy is
`config/embedded-repository-policy.json`. Unconfigured nested `.git`
directories, nested `.git` files, linked worktrees, and mode-160000 entries
block End Work Session before `git add -A`. Intentional submodules or
generated-only nested state require a narrow, documented policy entry.

The August 2026 release provenance is identified by preservation set
`physiqueos-release-preservation-20260807-233817` and top-level manifest
SHA-256
`39FB2677712DCF6A6D9A8AF8C8F39329ED6ADF5248E5E89333BB2C834794DCBB`.
Canonical recovery does not depend on the original Desktop location. The full
path-by-path source disposition is recorded in
`deployment/cumulative-production-reconciliation-20260808.json`.

## Create a backup

From the repository root:

```powershell
.\scripts\backupRepository.ps1 -DestinationDirectory "G:\My Drive\PhysiqueOS Backups"
```

Choose the actual synchronized Google Drive directory on the machine. The
script does not discover, authenticate, or configure Google Drive. It refuses
to create a destination when the root is dirty or source completeness fails.

Runtime export is explicit and off by default. Only use the following after
reviewing the privacy implications of copying private Founder data:

```powershell
.\scripts\backupRepository.ps1 -DestinationDirectory "<destination>" -IncludeRuntime
```

The normal bundle does not add `.next`, `node_modules`, generated caches,
environment files, credentials, logs, uploads, or raw release archives. A
small read-only Founder identity snapshot is written to the manifest; Founder
data itself is excluded unless `-IncludeRuntime` is explicitly supplied.

Each backup contains:

- `physiqueos.bundle` — all reachable local Git history;
- `manifest.json` — commit, branch, bundle hash, verification status, external
  artifact identities, tool versions, and the read-only Founder snapshot;
- `backup-completeness.json` — the full nested-repository and external-artifact
  audit;
- `manifest.txt` — a concise compatibility summary; and
- `checksums.txt` — SHA-256 values for every other backup file.

## Complete a synchronized work session locally

When the current branch and its recorded upstream are already synchronized,
End Work Session can accept an existing verified local backup without pushing
or constructing another backup on a cloud-mounted filesystem:

```powershell
.\scripts\endWorkSession.ps1 `
  -LocalOnly `
  -VerifiedBackupPath "C:\path\to\PhysiqueOS_Backup_yyyy-MM-dd_HH-mm-ss" `
  -ExternalReplicationStatus pending
```

Local-only mode is explicit and fail-closed. It requires a clean worktree and
index, runs the embedded-repository and staged-file guards, requires a
configured upstream with exactly zero commits ahead and zero behind, and
revalidates the backup manifest, checksums, bundle, branch, HEAD, completeness
report, and configured preservation references. It does not push. A branch
with unpushed or missing commits cannot be closed in this mode.

External replication is separate from backup acceptance. Keep the verified
local backup until any cloud copy has been independently checked.

## Validate a backup

```powershell
git bundle verify "<backup>\physiqueos.bundle"
Get-FileHash "<backup>\physiqueos.bundle" -Algorithm SHA256
```

Compare the bundle hash with both `manifest.json` and `checksums.txt`. Verify
the other files against `checksums.txt`, then confirm that
`backup-completeness.json` reports `passed: true`.

An optional external release artifact is provenance-only when
`requiredForSourceRecovery` is false. A required external artifact must be
located through the policy's environment variable, and its manifest hash must
verify before backup can succeed. Rejected or superseded release source is
recorded in the reconciliation manifest and is not promoted into canonical
application source.

## Restore source

```powershell
git clone "<backup>\physiqueos.bundle" physiqueos-restored
Set-Location physiqueos-restored
git checkout <saved-branch>
git rev-parse HEAD
```

Confirm the commit matches `manifest.json`, then install and validate:

```powershell
npm ci
node_modules\.bin\vitest.cmd --config vitest.unit.config.js run
npm run lint
npm run build
```

If recovery requires an external artifact, follow the artifact's recorded
`recoveryInstructions` and verify its manifest SHA-256 before use. Never treat
a base-commit gitlink as proof that dirty overlay source was preserved.

## Restore Founder runtime data

A normal backup does not include Founder runtime data. If an explicitly
approved backup contains `optional-safe-runtime-export/runtime-store.json`,
stop the application, verify its checksum, preserve the existing runtime file,
and copy the exported file back to `private/founder/runtime-store.json`.

Runtime restoration changes production data and must be performed only as a
separately reviewed recovery operation.
