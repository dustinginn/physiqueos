# WP2-C offline preparation handoff

This is a future operator procedure, NOT preparation or execution authority.
Publish/review this implementation first. Obtain a separate Founder preparation
GO before running any block below. WP2-B remains CLOSED PASS. No recovery packet,
real identity, execution authorization, claim, completion or restore belongs here.

## Architecture and trust boundary

Historical tooling ISOs remain exact 15-file evidence. Current generic tooling
media contains the machine-derived 13-file PowerShell import/call closure,
the root-level `b.cmd` Baseline entry point, age.exe, age-keygen.exe and
wp2c-tooling-manifest.json (17 files). A create-new baseline-handoff ISO adds
only wp2c-baseline-binding.json (18 files). The
manifest has schemaVersion, kind, entryPoints, files[{name,sha256,bytes}] and
secretsIncluded=false. Host-only operator/plan/recorder scripts are not payload.

A second, preparation-only ISO (P7B_C_PREP) contains exactly
preparation-plan.json and preparation-control.json. The latter pins plan bytes,
SHA-256, preparedStateId and tooling manifest. Unknown/missing/extra files fail.
It never contains an execution authorization, claim or packet. The plan binds
the actual collector inputs; static isolation/evaluation/capacity policy remains
owned by the hash-bound collector, not operator-supplied pass flags. Recovery
and execution Control media remain unchanged and are built only at a later GO.

Guest observations and the three actual synthetic-harness observations return as
WP2CP1:<canonical-JSON-byte-count>:<SHA256>:<gzip/base64>. Only whitespace may be
removed. The host bounds compressed/decompressed size, checks SHA/bytes/canonical
encoding, validates exact schemas and contextual bindings, then runs the existing
preparation evaluator. An arbitrary pass=true cannot substitute for report bytes.
The checksum detects transfer mistakes, not a malicious Founder fabricating
evidence. This deliberately remains a Founder-reviewed nonsecret transfer, not
an authentication protocol. No arbitrary attachments or free-text report fields.

Return transport is a host screenshot of guest console pixels, followed by host
Snipping Tool **Text actions** and host-only paste into the checked adapter. This
does not enable VMware clipboard. Microsoft documents Text actions copying text
from screenshots: https://support.microsoft.com/en-US/Windows/Apps/use-snipping-tool-to-capture-screenshots .
Verify Text actions is available with harmless text before either boot. If absent,
STOP; do not install software or improvise another channel. If OCR changes even
one non-whitespace character, import fails. Do not manually repair long hashes or
base64. Preserve the original guest output for read-only recapture/reconciliation.

All returned data is nonsecret. Host screenshots/clipboard may retain that data.
Never screenshot a real identity or vault. The synthetic test does not put its
fake value in result files; it returns counts/booleans only. End host clipboard
sequence observation BEFORE screenshot/text copying. No guest clipboard use.

## Before closing applications: save this ENTIRE procedure

Primary PC: NEW elevated x64 Windows PowerShell **5.1 Desktop ConsoleHost**, opened
with literal powershell.exe -NoProfile. No host reboot. Keep this shell and
Notepad open throughout. VMware and host 1Password are required later; Codex,
Chrome and VS Code are not. No real secret is needed. Do not stop production.

The current retained guest lacks all freshly pinned baseline facts. Therefore the
self-contained sequence includes a tooling-CD-only, read-only baseline boot,
clean shutdown, offline plan creation, then the install/test boot. This avoids
inventing marker/Git/OS/Tools identities. Both boots belong to the one future
preparation authority; neither runs restore. No snapshot revert is performed.

Choose exactly one entry: NEW initialization below, or the preserved-session
continuation section immediately after it. **For the preserved
wp2c-prepared-ff8a79e8ac1d46f8b9348a97579c0c35 session, SKIP the initialization
block entirely.** Do not rerun Initialize or BuildTooling on that directory.

Run this host initialization block ONLY for a NEW session after preparation GO. It derives current
source identities; verify the printed commit is the one named in that GO. The
session directory is create-new. Do not reuse an existing directory.

```powershell
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.ToString() -notlike '5.1.*' -or -not [Environment]::Is64BitProcess){throw 'PS51_X64_REQUIRED'}
$repo='C:\Users\dusti\Documents\GitHub\physiqueos'
$op=Join-Path $repo 'scripts\phase7bWorkPackage2CPreparationOperator.ps1'
$commit=(& git -C $repo rev-parse HEAD).Trim(); if($LASTEXITCODE){throw 'GIT_HEAD'}
$commit
if((Read-Host 'Is this the exact separately authorized published preparation commit? Type YES') -cne 'YES'){throw 'STOP'}
$opHash=(Get-FileHash -LiteralPath $op -Algorithm SHA256).Hash
$opBytes=(Get-Item -LiteralPath $op).Length
function Prep([string]$mode){
  if((Get-Item -LiteralPath $op).Length -ne $opBytes -or (Get-FileHash -LiteralPath $op -Algorithm SHA256).Hash -cne $opHash){throw 'OPERATOR_CHANGED'}
  & $op -Mode $mode -SessionRoot $session -FounderPreparationApproved
}
$session='C:\Phase7B\host-evidence\379bb303\wp2c\preparation-handoff'
$toolingMedia=Join-Path $session 'tooling.iso'
$vm='C:\Users\dusti\Documents\Virtual Machines\phase7b-isolated-windows-restore-379bb303\phase7b-isolated-windows-restore-379bb303'
$ageRoot='C:\Users\dusti\AppData\Local\Microsoft\WinGet\Packages\FiloSottile.age_Microsoft.Winget.Source_8wekyb3d8bbwe\age'
$descriptor='C:\Phase7B\host-evidence\379bb303\wp2b\encrypted-primary\phase7b-wp2-fc48221852204c188c414a18f6c42bbd\phase7b-wp2-fc48221852204c188c414a18f6c42bbd-descriptor.json'
& $op -Mode Initialize -SessionRoot $session -ToolingCommit $commit -VmxPath ($vm+'.vmx') -SnapshotMetadataPath ($vm+'.vmsd') -DescriptorPath $descriptor -DescriptorSha256 (Get-FileHash -LiteralPath $descriptor -Algorithm SHA256).Hash.ToLowerInvariant() -AgePath (Join-Path $ageRoot 'age.exe') -AgeKeygenPath (Join-Path $ageRoot 'age-keygen.exe') -FounderPreparationApproved
Prep BuildTooling *>&1 | Out-File -LiteralPath (Join-Path $session 'tooling-step.txt') -Encoding utf8
Get-Content -LiteralPath (Join-Path $session 'tooling-step.txt')
notepad.exe (Join-Path $session 'OPERATOR.md')
notepad.exe (Join-Path $session 'tooling-step.txt')
```

Require INITIALIZED and PHASE7B_WP2C_MEDIA_CREATED, kind Tooling. Save all this
procedure to Notepad before the RAM checkpoint. tooling-step.txt contains the
complete guest baseline command and machine-generated pins. Do not edit pins.

### Alternative entry: immutable preserved-session continuation

Use ONLY after publication and a separate explicit continuation GO. Before that
GO, the read-only review supplies one hash-bound non-executable JSON pin file with
`originalRoot`, `sessionSha256`, `inventorySha256`, `vmxSha256`, `toolingCommit`
and `operator` (sha256/bytes). Its pins come from the preserved-file audit and
published checkout, not freshly blessing changed evidence. It is review input,
not an execution authorization or a live continuation context. A later compact
Founder launcher may supply its exact path/hash without hand-transcribing pins.

PRIMARY: NEW elevated x64 Windows PowerShell 5.1 ConsoleHost,
`powershell.exe -NoProfile`. Keep this shell through closeout. The following
replaces ONLY the initialization block; all later sections use the same `Prep`
function. Do not run both entries. No VM action occurs in context creation.

```powershell
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.ToString() -notlike '5.1.*' -or -not [Environment]::Is64BitProcess){throw 'PS51_X64_REQUIRED'}
$repo='C:\Users\dusti\Documents\GitHub\physiqueos'
$op=Join-Path $repo 'scripts\phase7bWorkPackage2CPreparationOperator.ps1'
$reviewPath=Read-Host 'Exact separately reviewed NONSECRET continuation pin-file path'
$reviewSha=Read-Host 'Exact reviewed pin-file SHA256 (not a secret)'
if($reviewSha -cnotmatch '^[0-9a-f]{64}$' -or (Get-FileHash -LiteralPath $reviewPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $reviewSha){throw 'REVIEW_PIN_MISMATCH'}
$review=Get-Content -LiteralPath $reviewPath -Raw | ConvertFrom-Json
$opHash=$review.operator.sha256; $opBytes=$review.operator.bytes
if((Get-Item -LiteralPath $op).Length -ne $opBytes -or (Get-FileHash -LiteralPath $op -Algorithm SHA256).Hash.ToLowerInvariant() -cne $opHash){throw 'OPERATOR_CHANGED'}
# Create once. On ANY failure stop; do not rerun or delete partial output.
$creation=@(& $op -Mode CreateContinuation -SessionRoot $review.originalRoot -OriginalSessionSha256 $review.sessionSha256 -OriginalInventorySha256 $review.inventorySha256 -OriginalVmxSha256 $review.vmxSha256 -ToolingCommit $review.toolingCommit -FounderPreparationApproved)
$creation
# Require CONTINUATION_NONEXECUTABLE and created=true. EXISTS is read-only
# reporting, not permission to repeat a boot. Stop for review on EXISTS.
$created=$creation[-1] | ConvertFrom-Json
if($created.classification -cne 'PHASE7B_WP2C_PREPARATION_CONTINUATION_NONEXECUTABLE' -or $created.created -cne $true){throw 'CONTINUATION_REVIEW_REQUIRED'}
Import-Module (Join-Path $repo 'scripts\phase7bWorkPackage2CPreparationContinuation.psm1')
$original=Read-Phase7BWP2COriginalPreparation $review.originalRoot $review.sessionSha256 $review.inventorySha256
$session=Get-Phase7BWP2CContinuationRoot $review.originalRoot $original.settings.preparedStateId $review.toolingCommit
$continuationPath=Join-Path $session 'continuation.json'
$continuationSha=$created.identity.sha256
if($created.path -cne $continuationPath){throw 'CONTINUATION_PATH_MISMATCH'}
$selected=Read-Phase7BWP2CPreparationContinuation $continuationPath $continuationSha $repo
$toolingMedia=$selected.document.current.toolingMediaPath
function Prep([string]$mode){
  if((Get-Item -LiteralPath $op).Length -ne $opBytes -or (Get-FileHash -LiteralPath $op -Algorithm SHA256).Hash.ToLowerInvariant() -cne $opHash){throw 'OPERATOR_CHANGED'}
  & $op -Mode $mode -SessionRoot $session -ContinuationPath $continuationPath -ContinuationSha256 $continuationSha -FounderPreparationApproved
}
$toolingMedia
notepad.exe (Join-Path $repo 'docs\PHASE7B_WP2C_PREPARATION_OPERATOR.md')
```

Save the complete generated guest baseline command and tooling-CD discovery line
from that output to Notepad BEFORE closing applications. It uses the current
manifest pin. Do not use the original session's tooling-step.txt or OPERATOR.md.
The original ISO remains untouched historical evidence. The new path ends in
`tooling-current.iso`, not the original `tooling.iso`. All later `Prep` modes and
their outputs belong to the selected continuation directory. The current operator
revalidates both lineages on each call; no silent latest-context selection.
The full remaining procedure below is identical for both entries.

If a separately published semantic VM-binding correction is required after an
authorized VMware optical save, STOP using the block above. A separate Founder GO
must select the exact immutable parent continuation and exact stopped raw VMX pin,
then invoke operator mode `CreateVmBindingContinuation` once. That mode creates a
new `wp2c\vm-bindings\<preparedStateId>\<currentCommit>` context and distinct
`tooling-semantic-current.iso`; it never edits the parent continuation or original
session. Require
`PHASE7B_WP2C_PREPARATION_VM_BINDING_CONTINUATION_NONEXECUTABLE`, created=true,
then use only exact `VmBindingPath` and `VmBindingSha256` parameters for every
later `Prep` mode. The source-owned refreshed offline handoff must be generated
and reviewed before any boot. Parent/current media, a legacy whole-VMX hash or a
manually selected latest context are never substitutes.

If the selected semantic media predates the guest-local baseline launcher, a
separate Founder GO must create exactly one baseline-handoff continuation before
another boot. `CreateBaselineHandoffContinuation` reads the semantic bridge as
immutable parent provenance and creates
`wp2c\baseline-handoffs\<preparedStateId>\<currentCommit>\`, distinct
`tooling-baseline-current.iso`, and `baseline-handoff.json`. Every resumed mode
then requires the exact `BaselineHandoffPath` and `BaselineHandoffSha256`.
Historical media is never overwritten and no latest handoff is auto-selected.

Create a temporary host 1Password Login item with ONLY the public invalid test
value below in its password field, using that field's supported Type in window
action (not whole-login Auto-Type). No TOTP/automatic submission. Do not assume a
custom field or secure note supports this action. Do not open the real vault
item containing the recovery identity. In the host shell, this displays only the
fixed fake value (74 characters, invalid native age alphabet):

```powershell
'AGE-SECRET-KEY-' + ('I' * 59)
```

Copying this fake value into the temporary item is allowed BEFORE the clipboard
observation interval. Close that display before testing. No software purchases.

## Powered-off configuration and first RAM gate

Founder, VMware Workstation UI on PRIMARY: exact VM
phase7b-isolated-windows-restore-379bb303 must be Powered Off, not suspended.
Current lineage must be S1-physiqueos-bootstrap-inert; preserve S0 and S1. Do not
revert, clone, create a snapshot or answer a moved/copied-VM prompt; STOP on one.
4096 MiB, 2 vCPUs, EFI/Secure Boot remain unchanged. Shared folders/HGFS, clipboard
and drag/drop remain disabled. Do not start any other VM.

Under the separately granted preparation authority only, use powered-off VM
Settings to retain NAT type but clear network adapter Connected and Connect at
power on. Use TWO existing/approved SATA CD/DVD image devices, not a third:

- First: ISO = the exact `$toolingMedia` path printed/selected above; Connect at power on checked.
- Second: add one CD/DVD device only if absent; ISO = the same current tooling media for
  now, Connect at power on unchecked. Do not attach any old/recovery ISO.

Two slots are already required by the published host preparation contract. The
new arrangement uses both for tools+plan on the second boot; no hot swapping or
extra optical device beyond those two is necessary. The checker rejects other
configuration drift. Do not hand-edit VMX after a failed check.

All remaining instructions are now available. Founder chooses which nonessential
applications to close. Keep Notepad, this PowerShell, VMware and host 1Password.
Required available host memory is >=7 GiB, host C: free space >=120 GiB. No process
is killed by the operator. Do not stop production or lower either requirement.

```powershell
Prep Ram
```

If RAM FAIL, close only applications you choose and deliberately rerun ONLY
`Prep Ram`. When >=7 GiB, immediately before VMware Power On:

```powershell
Prep PreBootBaseline
```

Require PHASE7B_WP2C_PREPARATION_PREBOOT_PASS. On any other result STOP. The script
does not boot the VM. Founder now powers on the exact VM in VMware UI.

## Guest baseline, return, clean shutdown

ISOLATED GUEST: NEW elevated x64 Windows PowerShell 5.1, powershell.exe -NoProfile.
Visually identify the optical drive labeled `P7B_C_TOOLS`, then replace `X` with
that displayed drive letter and type exactly four characters:

```powershell
X:\b
```

`b.cmd` starts System32 Windows PowerShell with `-NoProfile` and process-only
`-ExecutionPolicy Bypass`, then invokes only the authoritative Baseline launcher.
The authoritative launcher, not the operator, discovers exactly one tooling
volume and validates the externally bound guest and tooling identities.

Clipboard sharing stays disabled. Do not use VMware Paste. A wrong drive or
missing, duplicate,
modified, wrong-guest or wrong-tooling binding/media stops before Baseline.
The command reads only guest identity, marker, repository HEAD, Git/OS/Tools and
offline HGFS state; it neither installs tooling nor writes guest evidence.

Capture only its WP2CP1 block using host Snipping Tool. Text actions -> select/copy
only that block. Preserve a host Notepad copy. No real vault/secret in the picture.
Guest shell, after a successful baseline:

```powershell
Stop-Computer
```

Wait for Powered Off. Do not Suspend/Power Off forcibly. Host existing shell:

```powershell
Prep ImportBaseline
```

Paste the nonsecret token at the prompt, then END on its own line. Require
PHASE7B_WP2C_PREPARATION_BASELINE_IMPORTED. Wrong checksum/identity => STOP; no
plan created. No manual token repair. Preserve output for review.

```powershell
Prep BuildPreparation *>&1 | Out-File -LiteralPath (Join-Path $session 'preparation-step.txt') -Encoding utf8
Get-Content -LiteralPath (Join-Path $session 'preparation-step.txt')
notepad.exe (Join-Path $session 'preparation-step.txt')
```

Require PLAN_CREATED_NONEXECUTABLE and MEDIA_CREATED kind Preparation (the plan
result is validated internally). The output contains COMPLETE guest install and
session commands, all pins derived locally; nothing needs another chat reply.

## Second RAM gate, install and full guest inspection

Powered Off VMware UI: first CD stays at `$toolingMedia`, connected. Second CD becomes
session preparation.iso, Connect at power on checked. Network remains disconnected.
Do not change anything else. No recovery media is present.

```powershell
Prep Ram
Prep PreBoot
```

Require >=7 GiB and PREBOOT_PASS immediately before manually powering on. A RAM
failure permits deliberate read-only RAM recheck, not automatic boot. In a NEW
elevated guest powershell.exe -NoProfile, apply the process-only policy block above
and run the emitted Install command. Require PHASE7B_WP2C_TOOLING_INSTALLED.

Installer verifies exact optical file set/binaries, guest marker/identity,
corroborated HGFS, disconnected network, inert tasks/runtime, capacity and roots
before creating the versioned tooling directory. It never overwrites the S1 app
repository or a previous install. A partial/colliding install => STOP, no deletion.

Close that guest shell. Open NEW elevated powershell.exe -NoProfile, same process
policy block, then the COMPLETE Session commands from preparation-step.txt. The
approved preparation CD is located automatically; a writable arbitrary plan is
not accepted. The real collector/pre-mutation gate runs BEFORE synthetic UI/output.

Fresh checks include exact VMware/guest/application/marker/tooling, clean app repo,
PS5.1 x64, .NET/WinForms/compression, Tools/service/driver corroboration, 4096 MiB /
2 vCPU, Windows edition/build/license and >=1440 evaluation minutes, NTFS/path/
reparse safety, empty incoming/restore, disabled tasks/stopped controls, credential
exclusions, no app/database/port3000, no HGFS/mapped share and no external NIC/routes/
connections. Installed age/keygen hashes and versions must be exact. Do not activate,
download, resize disks or change the guest to force a PASS.

Capacity policy is unchanged: install payload bytes +1 GiB free; incoming packet
bytes +1 GiB; restore volume packet + ZIP + bounded expanded bytes +1 GiB. The
plan derives these sizes from accepted descriptor METADATA only; no packet reads
or decryption. maximumExpandedBytes remains bounded by accepted ZIP bytes.

## Three finite synthetic groups (no real identity)

Before allowing the first guest prompt to continue, PRIMARY existing shell:

```powershell
Prep EntryReview
```

It records host clipboard sequence and waits. Do not copy anything or take/copy
screenshots during this interval. In the guest follow the three prompts:

1. **first-field**: host 1Password Type in window, explicitly select guest masked
   field one; independently target field two with the same fake value. Check
   masked content entered. Click confirmation (never auto-submit). Both must
   compare exactly with the source fixed fake string: 74 characters each.
2. **canary**: with a harmless blank host Notepad as canary, exercise deliberate
   wrong-field/destination selection and guest/host focus change. Do not approve
   typing until the correct guest target is selected. Exercise one controlled
   focus change while the fake typing operation is pending. Observe both guest
   fields and the canary. Unexpected text in the canary/other field => STOP, reject
   this mechanism. Cancel this dialog rather than confirming it.
3. **interrupt**: minimize/restore the VMware console during the controlled fake
   operation, interrupt and cancel the guest dialog. Any unexpected input => STOP.
   Cancel (do not confirm). Observe no ghost submission or persistent tooling file
   containing the fake value. The harness itself only returns count/boolean data.

These are finite configuration tests, not a universal focus-containment claim.
Founder focus selection remains residual risk. Do not claim an unperformed check
passed. No fallback to clipboard, another password manager or secret transport.
Each guest case requires explicit YES that no unexpected input occurred; otherwise
stop. The guest then rechecks inertness and writes only the nonsecret envelope.

Return to host EntryReview, press Enter BEFORE any copy/screenshot. Equal host
clipboard sequence is required; guest sequence is checked for each dialog. Enter
observed product versions and explicitly confirm only checks actually performed.
Require PHASE7B_WP2C_PREPARATION_FOUNDER_REVIEW_RECORDED. A failed check rejects
entry use; it does not authorize repair/retry with a real identity.

## Final nonsecret return, shutdown, record

Guest shows PHASE7B_WP2C_PREPARATION_RETURN_READY_NONEXECUTABLE and a WP2CP1 block.
Guest file: C:\Phase7B\isolated\379bb303\preparation-output\<preparedStateId>\preparation-return.json.
Now host Snipping Tool Text actions may copy ONLY the token into host Notepad.
At typical tested shape it is about 2 KiB, not a large JSON transcription. Multiple
screenshots/line wrapping are acceptable; no lost/duplicated characters. Never edit
the checksum to force acceptance. Preserve host token before shutting down guest.

Guest existing elevated shell:

```powershell
Stop-Computer
```

Wait for Powered Off. Do not suspend/snapshot/revert/detach media or change VMX.
Host existing shell (keep memory >=7 GiB until record):

```powershell
Prep ImportReturn
Prep Record
```

ImportReturn prompts for token then END. Require RETURN_CHECKED before Record.
Record requires exact returned bytes, actual source observations, checked Founder
synthetic review and current cold host state; final classification must be:
PHASE7B_WP2C_PREPARATION_RECORDED_NONEXECUTABLE.

Final host files, create-new under session\accepted:
guest-report.json, identity-entry-validation.json, preparation-return.json,
preparation.json (written LAST). The last file retains published wp2c-preparation
schema and adds preparationHandoff pins for plan, preparation ISO/descriptor,
tooling ISO, report/return/review. Existing hostObservation/guestObservation bind
RAM/config/S1/evaluation/capacity/HGFS/runtime/offline/shutdown. Non-execution flags
remain wp2cExecuted=false, packetDecrypted=false, executionClaimCreated=false,
authorizationConsumed=false; handoff realIdentityUsed=false and
invalidSyntheticValueOnly=true. This is NOT WP2-C restore PASS.

For a continuation, preparation.json additionally carries `preparationLineage`:
the exact continuation path/hash/bytes, original session/init commit/operator/
ISO/manifest and current continuation commit/operator/Host/ISO/manifest. The
original directory is never the output destination and remains byte-identical.
For a semantic VM-binding continuation this is schema version 2 and additionally
binds the immutable parent continuation, its legacy VM config hash, and the exact
semantic mode/hash plus stopped raw VMX identity used at bridge creation.

Preserve final JSON/identities, close test canary windows, and later remove the
temporary synthetic 1Password item yourself if desired (never the real recovery
item). Reopen Codex/Chrome only after cold closeout. Return nonsecret result for
Founder review. No S2 or new preparation snapshot: bank exact cold prepared state,
preserve S0/S1. Recovery media/execution contract/authorization/real identity remain
a later boundary. Preparation cost is $0; STOP if any purchase is required.

## Failure and retry rules

Read-only RAM/preflight failures before changes may be deliberately rechecked
after the Founder resolves the exact environmental issue. The operator never
automatically retries. Wrong identity, schema, checksum, missing media, unexpected
contents/input, evaluation/capacity failure, installer collision, boot/shutdown
failure or partial evidence => STOP and preserve outputs. No automatic revert,
deletion, forced shutdown or authorization regeneration. A failed text import
before persistence does not consume restore authority; read-only recapture may
be reviewed, but never alter the returned source bytes. After ambiguous mutation,
read-only reconciliation and renewed Founder direction are required. Preparation
does not create/consume a restore execution claim or imply a restore GO.
