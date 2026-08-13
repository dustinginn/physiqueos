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

The normal End Work Session workflow is local-first:

1. create and fully verify the backup under the user's Documents folder;
2. copy the completed backup directory to external storage with bounded,
   restartable Robocopy settings; and
3. compare every external file with the local source by size and SHA-256.

Default destinations are:

- local: `<Documents>\PhysiqueOS Backups`; and
- external: `G:\My Drive\PhysiqueOS Backups`.

Override either destination when needed:

```powershell
.\scripts\endWorkSession.ps1 `
  -LocalBackupDirectory "D:\Local PhysiqueOS Backups" `
  -ExternalBackupDirectory "H:\My Drive\PhysiqueOS Backups"
```

`-BackupDestination` remains a compatibility alias for
`-ExternalBackupDirectory`; even with that older name, backup construction
still occurs at the local destination first. To accept the verified local
backup while intentionally deferring external replication, pass
`-SkipExternalReplication`. The output will record external replication as
pending and will not imply off-machine protection.

The destination-agnostic backup primitive can also be run directly against a
safe local filesystem destination:

```powershell
.\scripts\backupRepository.ps1 `
  -DestinationDirectory "$([Environment]::GetFolderPath('MyDocuments'))\PhysiqueOS Backups"
```

Do not construct the backup directly on a cloud-mounted filesystem. The
primitive refuses to create a backup when the root is dirty or source
completeness fails.

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

## Recover pending external replication

If Google Drive is unavailable, frozen, or exceeds the bounded replication
timeout, End Work Session retains and accepts the local backup, reports
external replication as failed or pending, and identifies off-machine backup
as requiring follow-up. Local acceptance does not mean disaster-recovery
replication is complete.

When Drive for Desktop is healthy, replicate the already verified local
backup without rebuilding it:

```powershell
node .\scripts\replicateRepositoryBackup.mjs `
  --source "C:\path\to\PhysiqueOS_Backup_yyyy-MM-dd_HH-mm-ss" `
  --external-root "G:\My Drive\PhysiqueOS Backups" `
  --timeout-ms 900000
```

Replication uses recursive restartable copying, two retries with a two-second
wait, normal file/date attributes, and no mirroring or destination deletion.
Robocopy exit codes below 8 are eligible for acceptance; the replica is not
accepted until its complete file inventory, sizes, and SHA-256 hashes match
the retained local backup. Never delete the local backup merely because the
external replica verifies.

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

## Restore migration-control state

After the inactive operational-safety deployment, the server-owned control
record is `private/founder/migration-control.json`. It contains no secrets or
Founder domain records, but it determines the canonical-store epoch,
composition, and whether writes are permitted. It must not live in `.next`,
must not be inferred from the deployed build alone, and must not be silently
reinitialized after first deployment.

Every explicitly approved operational or pre-migration backup that includes
Founder runtime/media must also include the byte-exact control record and its
SHA-256. Restore only while the canonical task is stopped. Verify the
tamper-evident envelope and audit through the guarded status command, then
reconcile all of the following before restart:

- application source commit and build ID;
- control fence state, epoch, composition, version, operation ID, and audit;
- canonical runtime or PostgreSQL recovery identity;
- object-provider inventory/state; and
- whether a first PostgreSQL canonical write was ever recorded.

A missing or corrupt control record fails canonical writes closed. Before any
PostgreSQL first write, an accepted recovery may restore the exact inactive
legacy record with matching runtime/build evidence. After a first PostgreSQL
write, never restore an older legacy control record or silently reinitialize;
retain PostgreSQL as canonical and use the separately reviewed forward-repair
procedure. Control restoration is an operational state mutation and always
requires explicit authorization.

## Restore the encrypted migration recovery packet

The accepted pre-migration artifact and exact evidence are recorded in
`docs/ENCRYPTED_MIGRATION_RECOVERY.md`. Its filename is
`physiqueos-migration-recovery-20260812.tar.age`, size 577,876,390 bytes,
SHA-256 `D6C4729FA33D83B9A5A080323CB64E143E61839D2F0B0B6D3FE96A1848C93E48`.
Matching encrypted copies exist locally below `.tmp` and in the established
`G:\My Drive\PhysiqueOS Backups\Migration Recovery 2026-08-12` location.

Use official `age` v1.3.1 or a compatible later release with
`age-plugin-batchpass`. Retrieve the unique passphrase from the Founder's
password-manager entry `PhysiqueOS migration recovery 2026-08-12`; never put
it in Git, a manifest, DigitalOcean environment, command line, or plaintext
file. Decrypt and extract only into a new isolated directory, then:

1. verify `manifests/packet-files-sha256.json` in full;
2. verify the runtime/control hashes against the completeness record;
3. verify all entries in `manifests/media-sha256.json`;
4. run `git bundle verify` and confirm checkpoint `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e` is recoverable;
5. confirm accepted build `HasDoRm5cgRE0FsXZU1Uu` and rollback build `RmjN47V8xsq3-6jSlZh-9`;
6. confirm the migration manifest, script identities, provider inventory, and recovery instructions exist; and
7. delete the decrypted temporary workspace after verification.

Never restore over a running canonical task. Recovery verification does not
authorize production restoration, fence activation, migration, or canonical
composition change. The secret's only continuing custody location is the
Founder's password manager; the temporary DPAPI copy used for packet creation
was deleted after successful restore verification.
