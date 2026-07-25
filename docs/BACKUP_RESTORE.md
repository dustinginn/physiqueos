# PhysiqueOS Backup and Restore

The repository backup is a Git bundle containing all local branches and
reachable history. Founder runtime data is private, stored separately at
`private/founder/runtime-store.json`, and excluded by default.

## Create a backup

From the repository root:

```powershell
.\scripts\backupRepository.ps1 -DestinationDirectory "G:\My Drive\PhysiqueOS Backups"
```

Choose the actual synchronized Google Drive directory on the machine. The
script does not discover, authenticate, or configure Google Drive.

Runtime export is explicit and off by default. Only use the following after
reviewing the privacy implications of copying private Founder data:

```powershell
.\scripts\backupRepository.ps1 -DestinationDirectory "<destination>" -IncludeRuntime
```

No environment files, credentials, dependencies, build caches, logs, or
uploads are added to the Git bundle.

## Validate a backup

```powershell
git bundle verify "<backup>\physiqueos.bundle"
Get-FileHash "<backup>\physiqueos.bundle" -Algorithm SHA256
```

Compare the hash with `checksums.txt`. Repeat for `manifest.txt` and any
explicitly included runtime export.

## Restore source

```powershell
git clone "<backup>\physiqueos.bundle" physiqueos-restored
Set-Location physiqueos-restored
git checkout <saved-branch>
git rev-parse HEAD
```

Confirm the commit matches `manifest.txt`, then install and validate:

```powershell
npm ci
node_modules\.bin\vitest.cmd --config vitest.unit.config.js run
npm run lint
npm run build
```

## Restore Founder runtime data

A normal backup does not include Founder runtime data. If an explicitly
approved backup contains `optional-safe-runtime-export/runtime-store.json`,
stop the application, verify its checksum, preserve the existing runtime file,
and copy the exported file back to `private/founder/runtime-store.json`.

Runtime restoration changes production data and should be performed only as a
separately reviewed recovery operation.
