# Encrypted migration recovery and provider-alert acceptance

Acceptance date: 2026-08-12 (America/Los_Angeles)

Classification: **ACCEPTED for pre-migration recovery and provider observability. Production migration remains separately blocked.**

This record closes the alert configuration/delivery, $40 billing-alert,
PostgreSQL capacity-warning, Spaces readiness, encrypted recovery,
off-machine replica, restore, and key-custody gates. It does not authorize a
write fence, migration, canonical-store switch, production authentication,
Phase 7, Native Baseline, or SwiftUI.

## Preserved production state

- repository branch/checkpoint at capture: `phase6-compatibility-release` / `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e`;
- accepted production source/build: `e3b4f4505e9c2b5598901b002271933f45c24dbf` / `HasDoRm5cgRE0FsXZU1Uu`;
- rollback source/build: `6f4976101cb21eb9d3a7e28ee9a960fcf34141c7` / `RmjN47V8xsq3-6jSlZh-9`;
- Founder runtime: revision 119, 26,955,008 bytes, updated `2026-08-12T16:02:21.133Z`, SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`;
- migration control: version 1, `inactive / legacy-json / legacy-json`, reads/writes enabled, no operation/fence/first PostgreSQL write, SHA-256 `435BCAE703BA96E984D69C45FC808CBE404128E9137D14D99D8FAC836D4D32DE`;
- media: 365 files / 274,094,226 bytes: 13 DEXA, 323 evidence, 29 photos.

Read-only capture proved the runtime and control hashes unchanged before and
after copying. Every source/copy media size and SHA-256 matched. JSON/file and
local evidence remained canonical; production authentication remained
inactive.

## Provider alert acceptance

DigitalOcean App Platform has eight enabled Founder-email policies:

| Scope | Rule | Trigger |
| --- | --- | --- |
| App | deployment failure | event |
| App | domain failure | event |
| Web | CPU | greater than 70% for 10 minutes |
| Web | memory | greater than 70% for 10 minutes |
| Web | restart count | greater than 0.5 for 5 minutes, so the first integer restart triggers |
| Worker | CPU | greater than 70% for 10 minutes |
| Worker | memory | greater than 70% for 10 minutes |
| Worker | restart count | greater than 0.5 for 5 minutes, so the first integer restart triggers |

The alert-only app-spec deployment
`e707a930-4a71-426d-a1f3-2d713917144b` is `ACTIVE`; staging readiness
remained HTTP 200. Seventy percent sustained for ten minutes gives a
Founder-stage warning before resource exhaustion while filtering brief
spikes. The restart threshold is intentionally sensitive because either
component should be stable at this stage.

The preceding 24-hour App Platform view was quiet: web CPU was approximately
1.95% and memory 16%; worker CPU was approximately 3.1% and memory 17.8%; both
restart counters were zero.

The three existing managed PostgreSQL default policies were updated in place,
not duplicated. CPU, memory, and disk each alert the Founder email when usage
is greater than 70% for 10 minutes. The cluster remains online, one PostgreSQL
17 `db-s-1vcpu-1gb` node with 10,240 MiB storage. The latest managed backup is
`2026-08-12T07:10:12Z`, 0.0683214 GiB. Staging readiness is green. Direct raw
metrics scraping was deliberately not enabled because the database trusted
source correctly remains the staging app only; weakening that firewall solely
for observation was rejected. The live provider alerts supply the ongoing
CPU/memory/disk capacity guard.

The scoped provider metrics endpoint credentials were retrievable, but the
operator-host scrape timed out at the intentionally app-only firewall. Current
raw database CPU, memory, used/remaining storage, and connection pressure are
therefore not claimed. Online state, 10 GiB allocation, green dependency
readiness, a current small managed backup, and continuous 70% CPU/memory/disk
warnings provide the accepted capacity protection. No observed provider state
creates a current single-Founder migration-capacity concern; connection
pressure remains application/provider-readiness owned rather than a separately
accepted raw metric.

A temporary two-region synthetic `.invalid` HTTPS check triggered a
two-minute global-down alert. Both `us_east` and `us_west` reached `DOWN`, and
the Founder confirmed actual receipt of the DigitalOcean email. The same
single credited check was then repurposed, rather than creating a second
check, as persistent `PhysiqueOS staging readiness` monitoring for
`/api/v1/health/ready`. It is enabled in `us_east` and `us_west`, with a
two-minute global-down Founder-email alert; both regions were `UP` at final
verification. DigitalOcean credits one Uptime check per month, so the recurring
base remains unchanged.

The test and receipt occurred on 2026-08-12. An exact receipt timestamp was not
independently available, so this record credits actual receipt but does not
invent a minute-level delivery time.

The Founder completed DigitalOcean's user-only Billing control and attested
that the account-email billing alert is active at **$40/month**. This is an
early warning, not a spending cap. The approved recurring ceiling remains $50
and the observed recurring base remains $30.15.

After final provider verification, the revoked and temporary local `doctl`
contexts were removed. This does not revoke provider-side PATs; the Founder
should revoke the two successful short-lived operational-readiness PATs in the
DigitalOcean control panel after accepting this record.

Signals without a provider-native channel remain application-owned after
shared activation: migration control outside an approved window, required
worker heartbeat older than 120 seconds, oldest outbox work older than five
minutes or any dead row, backup older than 24 hours or failed restore,
critical command/integrity failure, media completion/hash/readback failure,
unexpected recovery-required state, PostgreSQL composition mismatch, and
canonical epoch mismatch. No new notification platform was built in this gate.

## Spaces acceptance

The accepted private Space is `physiqueos-p2-staging-20260811-b36ea183` in
`sfo3`. Its bucket-scoped runtime credential—not a broad provisioning key—proved:

- versioning `Enabled`;
- anonymous bucket and representative-object access both HTTP 403;
- authenticated representative-object readback succeeded (36 bytes);
- 5 current objects / 178 bytes under `private/`;
- 11 versions / 400 bytes;
- zero delete markers and zero incomplete multipart uploads.

Bucket ACL and lifecycle administration correctly returned `AccessDenied` to
the bucket-scoped runtime key. Privacy was independently established by the
anonymous 403 probes. No object was written, deleted, or made public.
The five current objects are retained synthetic acceptance evidence; no
orphaned temporary object was identified. Bucket outbound-transfer usage is
not exposed through the bucket-scoped S3 inventory path and is not claimed.

## Recovery packet

The control-inclusive packet contains:

- byte-exact Founder runtime, migration-control record, and all 365 media files;
- media and complete packet SHA-256 manifests;
- current migration package, validation copy, copy/export report, migration ID, and integrity metadata;
- a verified Git bundle containing checkpoint `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e`, SHA-256 `F3AD44C5D932DAE43FCF7115A751F7D44D1B9EB075A5E59865ED5CC7A375643B`;
- TAR artifacts for accepted production build `HasDoRm5cgRE0FsXZU1Uu` and rollback build `RmjN47V8xsq3-6jSlZh-9`;
- exact source/build identity files;
- migration/control/backup scripts and their SHA-256 inventory;
- current operational authorization, fence, backup, provider, and Native-readiness runbooks;
- a secret-free provider target/alert/capacity/Spaces inventory;
- backup completeness and recovery instructions.

Exact known operations credentials, Spaces keys, peppers, short-lived API
tokens, and the recovery passphrase were scanned against all 403 assembled
files: zero matches. No `.env`, credential CLIXML, private key, provider
secret, API token, or plaintext recovery secret is present.

## Encryption, replication, and restore

Encryption used the official, digest-verified Windows release of `age` v1.3.1
and its included `age-plugin-batchpass`. The user generated a unique
34-character password-manager secret. The plugin used its default scrypt work
factor 18; the age payload format uses authenticated ChaCha20-Poly1305 file
encryption. The passphrase existed only in the password manager, a temporary
Windows DPAPI-protected file, and process memory. It was never placed in a
command line, log, manifest, repository, provider environment, or archive.

Encrypted artifact:

- filename: `physiqueos-migration-recovery-20260812.tar.age`;
- bytes: **577,876,390**;
- SHA-256: **`D6C4729FA33D83B9A5A080323CB64E143E61839D2F0B0B6D3FE96A1848C93E48`**;
- local encrypted copy: `.tmp/migration-recovery-20260812-2227/physiqueos-migration-recovery-20260812.tar.age`;
- independent encrypted copy: `G:\My Drive\PhysiqueOS Backups\Migration Recovery 2026-08-12\physiqueos-migration-recovery-20260812.tar.age`.

Local and off-machine byte sizes and SHA-256 matched. A fresh isolated restore
decrypted and extracted successfully, verified 402 packet-manifest entries,
all 365 media entries, the exact runtime/control hashes, Git bundle, accepted
and rollback build/source identities, migration manifest, scripts, provider
inventory, and recovery runbook. The isolated decrypted workspace, plaintext
packet/TAR, and temporary DPAPI credential were then deleted. Both encrypted
copies remain.

## Key custody and recovery

The primary secret is the Founder's password-manager entry named
`PhysiqueOS migration recovery 2026-08-12`. No second plaintext secret copy is
required at Founder stage. For recovery, retrieve that entry, install a
compatible `age` release plus `age-plugin-batchpass`, decrypt into a new
isolated directory, extract the TAR, verify `manifests/packet-files-sha256.json`,
and verify the Git bundle before any restore decision. Never restore over a
running canonical task. Restoring production data or control state requires
separate explicit authorization.

## Retention and remaining authority

Recommendation: retain the final pre-cutover legacy runtime/media/control
snapshot for at least 35 days after successful migration and until all of the
following are true: seven accepted stabilization days, one verified
post-cutover PostgreSQL restore, verified media/object integrity, no remaining
rollback trigger, and explicit user approval of a deletion review.

The Founder explicitly accepted this complete 35-day minimum policy and all
listed exit conditions on 2026-08-13. This acceptance does not approve any
future deletion; deletion review remains a separate explicit decision after
every exit condition is satisfied. Production migration remains **BLOCKED**
only on:

1. approval of the exact migration window; and
2. a separate final explicit go/no-go naming the accepted checkpoint/build/window.

The final pre-fence procedure must still repeat the read-only runtime/media/
control capture so the migration operates on the latest legitimate Founder
state. This document is recovery evidence, not migration authorization.

## Current-lineage packet refresh (2026-08-13)

The earlier revision-119 packet remains retained for historical audit, but it
became stale after legitimate Founder activity and the accepted migration
remediation lineage. It must not be used as the current final-gate recovery
evidence. The replacement packet was captured read-only while production
remained healthy and writable; no fence, restart, deployment, migration,
canonical-store switch, evidence move, authentication activation, or provider
mutation occurred.

Current capture identity:

- source/build: `4f82619bd03c8f20331a45e126e1cfa79f199d2d` /
  `itQ9UXmsDRPssBzrFTPc5`;
- retained rollback: `.next.rollback-22712`, source
  `e3b4f4505e9c2b5598901b002271933f45c24dbf`, build
  `HasDoRm5cgRE0FsXZU1Uu`;
- Founder runtime: revision 122, updated `2026-08-13T15:11:57.160Z`,
  27,428,694 bytes, SHA-256
  `92EE630BD314A6AB6D3F6F66D1B54D441BE508C91E50AB5FFD6A116A02D11D1C`;
- collections: `founder-canonical-collections-v2`, 39/39 required, zero
  optional, three excluded, zero unknown/missing, 1,259 canonical records and
  6,612 relationships;
- media: 372 files / 276,646,284 bytes: 13 DEXA / 20,642,431 bytes,
  330 evidence / 189,428,874 bytes, and 29 photos / 66,574,979 bytes;
- control: SHA-256
  `435BCAE703BA96E984D69C45FC808CBE404128E9137D14D99D8FAC836D4D32DE`,
  version 1, `inactive / legacy-json / legacy-json`, reads/writes enabled, no
  migration/fence/operation/first PostgreSQL write; and
- package: `phase4-canonical-package-v2`, migration ID
  `92ee630b-d314-76ab-8d3f-6f66d1b54d44`, manifest digest
  `3d1dc15aeb95d9b03451945b7ccc6273c829120a374b966494e4735d49be18e4`.

The packet contains 6,596 files including the byte-exact runtime, all media
with SHA-256/MIME/relationship inventory, control record, package-v2 export,
current migration/runtime source, current runbooks, provider inventory, exact
current/rollback build artifacts, and a verified Git bundle through the
current source. Bundle SHA-256 is
`623751742A67009606280A3E71037BC4CD9B3867143FC7AA556527B0B22EF972`;
isolated clone, checkout, `git fsck`, and reachability of `cbe8b321...`,
`f3cae37...`, and `4f82619...` passed. The current build contains 2,673 files
/ 93,380,792 bytes; rollback contains 2,509 files / 83,636,938 bytes. Neither
contains Founder runtime or migration-control bytes.

Fresh read-only provider inventory recorded the existing App Platform app,
online PostgreSQL 17 cluster `f544596d-594e-4aa4-a0a8-533bda0992c6` in
`sfo3`, 10,240 MiB one-node tier, latest managed backup
`2026-08-13T06:54:12Z`, and private/versioned Space
`physiqueos-p2-staging-20260811-b36ea183` with 5 current objects / 178 bytes,
11 versions / 400 bytes, and zero delete markers or incomplete multipart
uploads. Provider inventory digest is
`9734AF7934EBB36147E15D8A66563C5447B4C64A187608E7FACD055248EB26A8`;
no provider secret is present.

The final credential scan covered all five live provider credential values
plus the recovery passphrase across all 6,596 files / 762,741,724 bytes and
found zero exact or high-risk pattern matches. Encryption reused the existing
password-manager entry with `age` v1.3.1, `age-plugin-batchpass`, scrypt work
factor 18, and authenticated ChaCha20-Poly1305 payload encryption.

Current encrypted artifact:

- filename: `physiqueos-migration-recovery-20260813-current-lineage.tar.age`;
- size: **769,020,390 bytes**;
- SHA-256:
  **`E8E63CACB09F706D8CBD939E3536D3807DF070D67CC8B156448F7548D47AF741`**;
- local: `.tmp/migration-recovery-20260813-current-lineage/physiqueos-migration-recovery-20260813-current-lineage.tar.age`;
- off-machine: `G:\My Drive\PhysiqueOS Backups\Migration Recovery 2026-08-13 Current Lineage\physiqueos-migration-recovery-20260813-current-lineage.tar.age`.

Local/off-machine sizes and SHA-256 match. A fresh isolated decrypt reproduced
the 768,832,512-byte plaintext TAR exactly at SHA-256
`B9C1AEA80DCAB8AC62D55C7421AAF825B3373C656E54E9332A21BE8574FB978F`.
Full manifest, runtime, 372 media files, control, build/rollback, provider
inventory, restored Git bundle, and packet-contained runner/orchestrator,
Windows loader, exporter, collection registry, composition selector, and
adapter loading all passed. The recovery passphrase remains password-manager
custodied; temporary plaintext/decrypted workspaces and its temporary DPAPI
copy were removed after verification.

At closeout the live source/build/runtime/media/control remained aligned with
this packet. This refresh is **RECOVERY PACKET REFRESH ACCEPTED**. The final
pre-fence gate may be rerun, but it must recheck packet/live alignment and
managed-backup freshness. It still does not authorize a fence or migration.
