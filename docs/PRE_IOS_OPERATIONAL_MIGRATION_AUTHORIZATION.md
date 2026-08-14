# Pre-iOS operational migration authorization gate

Audit date: 2026-08-12 (America/Los_Angeles)

Classification: **BLOCKED only on exact-window approval and final explicit go/no-go. This document does not authorize canonical production migration.**

The accepted inactive operational-safety release is healthy on exact source `e3b4f4505e9c2b5598901b002271933f45c24dbf`, build `HasDoRm5cgRE0FsXZU1Uu`. The Founder has approved all recommended Founder-stage operational roles. Provider alerts, actual email delivery, the Founder-attested $40 billing alert, PostgreSQL capacity protection, Spaces inventory/readback, the control-inclusive encrypted recovery set, and the 35-day minimum retention policy are now accepted in `docs/ENCRYPTED_MIGRATION_RECOVERY.md`. The safety capability remains strictly inactive against legacy JSON/file. The exact window and final go/no-go remain unapproved.

## Immutable state and lineage

| Item | Verified state |
| --- | --- |
| Local branch / upstream | `phase6-compatibility-release` / `origin/phase6-compatibility-release`, synchronized `+0/-0` before this documentation patch |
| Phase 6 checkpoint at recovery capture | `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e` |
| Accepted inactive-safety production source | `e3b4f4505e9c2b5598901b002271933f45c24dbf` |
| Production build | `HasDoRm5cgRE0FsXZU1Uu` |
| Retained rollback source / build | `6f4976101cb21eb9d3a7e28ee9a960fcf34141c7` / `RmjN47V8xsq3-6jSlZh-9` |
| `origin/main` | `403107d14056868194b59861cc55e9f37c9ac6a1`, unchanged |
| Subsequent product patch | none affecting accepted production behavior; descendants contain operational-safety and readiness work |
| Migration scripts/runbook checkpoint | `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e` |

At final verification the canonical Windows task was `Running`, the canonical listener was PID 8404 under the Windows Scheduler service, runtime ownership was `canonical`, the local/LAN/public tunnel was healthy, and `/api/health` returned 200. The migration-control source/build identity is the accepted production source and build above. JSON/file persistence and current local evidence remain canonical. PostgreSQL, Spaces-backed production media, shared authentication, the production write fence, and Native work remain inactive.

## Fresh Founder source

The read-only audit found no user activity after the accepted Phase 6 baseline:

- version `founder-seed-v2`;
- revision `119`;
- updated `2026-08-12T16:02:21.133Z`;
- 26,955,008 bytes;
- SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`.

The current-copy exporter read the live runtime at capture time and proved identical before/after hashes. A future migration must repeat that capture under the final fence; revision 119 is audit evidence, not a hard-coded migration source.

## Founder-stage ownership recommendation

Recommend assigning **the Founder/user** as the one named migration operator, go/no-go authority, abort authority, rollback authority, primary alert recipient, backup-verification owner, post-cutover-validation owner, seven-day-stabilization owner, and later Native kill-switch owner. A second trusted alert/backup recipient is useful but optional.

The user approved this assignment on 2026-08-12. The Founder/user is the named owner for every listed Founder-stage operational role. This does not authorize a migration window or final go/no-go.

## DigitalOcean target and cost

The existing scoped `phase5-staging` context remained valid for its intended resources. Read-only evidence showed:

- App Platform app `bf57cf56-48cc-4cd6-90e4-a23ee5381741` in `sfo`, active on deployment `dd3934a7-ff2a-4184-8c00-b5fc75b95ddf`;
- public liveness and readiness both 200 on build `phase2-provider-staging-5517689`;
- worker component present at one 512 MiB instance and its dependency readiness represented by the green readiness endpoint;
- PostgreSQL cluster `f544596d-594e-4aa4-a0a8-533bda0992c6` in `sfo3`, PostgreSQL 17, one `db-s-1vcpu-1gb` node, 10 GiB, status `online`;
- managed backups at `2026-08-11T19:10:03Z` and `2026-08-12T07:10:12Z`; the latter was approximately 0.068 GB;
- expected four logical databases only; no restore cluster or additional billed component;
- encrypted secret key names remain present in the app specification without copying values into this record;
- the accepted private Space remains named in runtime configuration in `sfo3`; current private/versioned behavior is accepted Phase 2/5 evidence, but a fresh direct version/inventory read was not possible with the available scoped credentials.

The recurring base remains **USD 30.15/month**: $5 web, $5 worker, $15.15 database, and $5 Spaces. No resource, size, node, key, support plan, or paid monitor changed in this audit.

Capacity protection is freshly accepted. The cluster is online with 10,240 MiB allocated, dependency readiness is green, the latest managed backup is 0.0683214 GiB at `2026-08-12T07:10:12Z`, and enabled CPU, memory, and disk policies each alert the Founder above 70% for 10 minutes. The metrics endpoint was not exposed to the operator host because preserving the app-only database firewall is safer than weakening it solely for a point-in-time scrape. The active provider thresholds supply ongoing utilization warning; this gate added no node, resize, or paid monitor.

## Alert and billing gate — accepted 2026-08-12

The following was the superseded preconfiguration finding: the initial token permitted app/database inspection but returned 403 for Monitoring, Uptime, and Billing. The older `physiqueos-staging` context was expired and the default context contained no token. The app spec returned at that time contained no explicit alert array. Possible provider defaults were not credited without observable policy/recipient state.

Required zero-cost configuration, using the verified DigitalOcean account email as the primary recipient:

1. App Platform: failed deployment and failed domain; web CPU/RAM at 70% for 10 minutes; worker CPU/RAM at 70% for 10 minutes; restart count above normal; later production readiness via an Uptime check.
2. PostgreSQL: CPU, memory, and disk warning at 70% and critical at 85%; any availability/readiness failure blocks or fences writes.
3. Application-native after shared activation: heartbeat older than 120 seconds, oldest outbox row older than five minutes or any dead row, backup older than 24 hours or failed verification, three critical command failures in five minutes or any integrity failure, media checksum/authorization/readback failure, and later enrollment/recovery/refresh-reuse anomalies.
4. Billing: enable the team billing alert at **$40/month**, early enough to review before the approved $50 recurring ceiling. It is an email alert, not a spending cap.

DigitalOcean does not document a general non-triggering "send test" control. Use a temporary harmless Uptime check against a deliberately unavailable synthetic URL, confirm the email receipt, then remove only that synthetic check. Do not stop production or break the database. App/database rules that cannot be safely forced remain configuration-verified rather than live-trigger-tested.

The user must either complete this in the control panel or create a short-lived custom-scope token locally with `account:read`, `app:read`, `app:update`, `database:read`, `monitoring:read`, `monitoring:create`, `monitoring:update`, `uptime:read`, `uptime:create`, `uptime:update`, `uptime:delete`, and `billing:read`, then authenticate locally:

```powershell
.\.tmp\tools\doctl-current\bin\doctl.exe auth init --context operational-readiness
```

Do not paste the token into chat. Revoke it after the policy audit. Billing-alert enablement itself is a control-panel action. Record recipient, channel, test time, method, receipt confirmation, and any rule not safely trigger-tested.

The later accepted execution supersedes the preconfiguration text above. Eight App Platform policies are enabled with one Founder-email destination: deployment/domain failure plus web/worker CPU and memory greater than 70% for 10 minutes and restart count greater than 0.5 for 5 minutes. Three PostgreSQL policies are enabled for CPU, memory, and disk greater than 70% for 10 minutes. Alert-only deployment `e707a930-4a71-426d-a1f3-2d713917144b` is active and staging readiness remained 200.

A harmless two-region `.invalid` Uptime check reached global `DOWN` and the Founder confirmed receipt of the two-minute global-down email. The same single credited check now monitors staging `/api/v1/health/ready`; both regions were `UP` at final verification. The Founder separately completed the user-only billing control and attested that the account-email alert is active at $40. Current alert delivery: **verified**. Current billing alert: **Founder-attested active at $40**. Exact IDs, rules, delivery evidence, and cost treatment are in `docs/ENCRYPTED_MIGRATION_RECOVERY.md`.

## Fresh backup candidate and restore evidence

No backup was deleted. The audit created only read-only copies:

| Component | Identity / result |
| --- | --- |
| Repository/runtime backup | `<Documents>\PhysiqueOS Backups\PhysiqueOS_Backup_2026-08-12_12-36-05`; branch/checkpoint exact; bundle SHA-256 `E78C59EFE02EDD4037CF39A728DA44EF1C8F6312CC31376D6DF6B2603F0596FE`; manifest SHA-256 `57293846F3D3D6DF857F6473490BFE84CC5420E3F6D90B84734B7070D14586FF`; completeness passed |
| Current-copy package | `.tmp/operational-readiness-20260812`; all 42 collections, zero unknown collections, migration ID `cc4903f9-6145-7b3a-8059-010a6de4ed1b`, manifest digest `7e13eadd63883fb039eb48406b6a977bb4cae2216fbdb36b6ecfaf96ef61f822` |
| Media | 365 files, 274,094,226 bytes; every source/copy/manifest SHA-256 matched |
| Application artifact copy | exact build/source; 2,496 files, 82,360,379 bytes; deterministic inventory digest `4131acb01e89a6a48ccebe70f30cbbc161c3dc0bd32ff07418fec7f03fbb10ac` |
| Provider state | app/deployment/database IDs, regions, sizes, build, backup timestamps, database names, Space reference, and configuration key names only; no secret value written |

Restore verification passed without touching production:

- the Git bundle verified, cloned to an isolated directory, checked out exact checkpoint `c6c01215...`, passed `git fsck`, and had a clean tree;
- the runtime restored byte-for-byte at the exact SHA-256;
- all 365 restored media files reproduced the manifest sizes and hashes;
- a second canonical package export was byte-identical and consumable by the Phase 4 package reader;
- the accepted application artifact copy reproduced every file and inventory digest;
- the most recent live provider logical backup/isolated restore remains the accepted Phase 5 proof; PostgreSQL is not production-canonical, so no Founder database restore was required or attempted here.

The later control-inclusive packet is an **accepted pre-migration recovery set**. It is encrypted with `age` v1.3.1, exists locally and independently on `G:`, and restored exactly in isolation. Its 577,876,390-byte SHA-256 is `D6C4729FA33D83B9A5A080323CB64E143E61839D2F0B0B6D3FE96A1848C93E48`. It covers current runtime, all 365 media files, migration control, current repository checkpoint, accepted and rollback builds, migration package/scripts/manifests, provider inventory, and runbooks. The secret is held only in the Founder's password manager; plaintext workspaces and the temporary DPAPI file were deleted. Full evidence is in `docs/ENCRYPTED_MIGRATION_RECOVERY.md`. Repeat the final runtime/media/control capture immediately before migration.

### Measured preparation time

- runtime byte copy: 22 ms; two-file hash verification: 201 ms;
- combined runtime plus media snapshot: 1.786 s;
- canonical manifest/package generation: 1.640 s;
- second deterministic package proof: 1.938 s;
- repository/runtime bundle creation: 4.210 s; verification: 483 ms; isolated clone/fsck: 11.103 s;
- application artifact copy: 1.523 s; complete two-tree hashing/comparison: about 14.6 s;
- isolated runtime/media restore copy: 312 ms; full hash verification completed within the 1.5 s command;
- provider app/database/backup and public readiness checks: approximately four seconds of provider response time, excluding the blocked monitoring/billing calls.

All bulk backup, hashing, package construction, artifact preservation, and provider inventory should occur before the write fence. The fence should contain only final source capture/delta, final import/readback, composition switch, smoke, and release.

## Retention recommendation

Retain the final pre-cutover JSON/runtime and media snapshot for at least 35 days after successful migration and until all of the following are true: seven accepted stabilization days, one verified post-cutover PostgreSQL restore, verified media/object integrity, no remaining rollback trigger, and explicit user approval of a deletion review. During stabilization never delete the legacy runtime/media snapshot, manifests, rollback artifact, reconciliation logs, or provider recovery backup. Do not remove Founder source data in this gate.

The Founder explicitly accepted this recommendation and every listed exit
condition on 2026-08-13. This does not authorize deletion; the required future
deletion review remains separately gated.

## Executable fence and migration tooling resolution

The final audit found no executable control in the accepted Phase 6 source. The separately approved patch now implements the missing durable state machine, central write interception, epoch-bound commands/outbox, bounded operational control, deterministic application-composition selector, strict-order dry-run/execute orchestrator, clear maintenance problem, audit/status model, and pre-first-write versus post-first-write recovery boundary.

- implemented: server-only fencing intercepts classified canonical repository, runtime, unit-of-work, Phase 3 command, upload, photo, and DEXA mutations;
- implemented: isolated tests prove reads remain enabled while writes get a bounded 503 and no file mutation;
- implemented: canonical-store epoch binds commands, receipts, and outbox handling;
- implemented: deterministic, idempotent activation, release, abort, status, and audit; and
- implemented: guarded dry-run/execute wrapper and durable application-composition switch; the Phase 4/5 target guards remain intact.

Two fresh realistic isolated PostgreSQL migrations and deliberate pre-write/post-write failures passed. Exact design, inventory, commands, timings, and evidence are in `docs/PRODUCTION_WRITE_FENCE_AND_MIGRATION_WRAPPER.md`. At source acceptance the capability was inactive and not deployed; the later inactive-deployment evidence below supersedes that deployment status. Activation still requires separate authorization.

## Rollback confirmation

The current runbook distinction remains correct:

| Failure point | Required response |
| --- | --- |
| Before any PostgreSQL canonical write | abort the active operation, release the already-deployed fence back to inactive, and retain unchanged JSON canonical state and accepted build |
| During import before canonical switch | abort; discard/reset only the guarded target; JSON remains canonical |
| After import but before web switch | abort; keep legacy composition/writes; retain target for audit or reset it under guard |
| After web switch but before any new PostgreSQL user write | stop/fence, roll compatible code/composition back to unchanged JSON, verify its exact final hash |
| After the first new PostgreSQL canonical user write | stop/fence writes; preserve receipts/outbox; PostgreSQL remains canonical; use compatible-code rollback plus deterministic forward repair or separately reviewed reconciliation—never blindly restore stale JSON |

The executable state machine and wrapper enforce this pre-write/post-write distinction in isolated acceptance. The capability is deployed but remains strictly inactive; activation still requires separate authorization.

## Recommended future window

Recommended appointment: **Thursday, 2026-08-13, 8:30-9:15 PM America/Los_Angeles**, only if the Founder confirms all Workout Logger, evidence upload/review, weight/check-in, nutrition/activity, priority, protocol, Goal, and briefing actions are finished for the evening. Otherwise use the same 45-minute slot on the next quiet evening; do not migrate during a gym session or active upload.

- 8:30-8:40: final alert/backup/target/lineage checks;
- 8:40: announce and start the write-only fence;
- expected fence: 2-5 minutes;
- hard boundary: if the fence reaches ten minutes before composition switch/first accepted PostgreSQL write, abort and reopen legacy writes;
- remainder through 9:15: smoke, user confirmation, backup/readback, observation, or pre-write rollback.

Reads may remain available on the pinned legacy snapshot while the already-deployed write-only fence is active. The user should avoid every canonical write for the full announced window, not merely the expected 2-5 minute fence.

## Binary operational checklist

- [x] Phase 6 compatibility release accepted.
- [x] Phase 6 checkpoint remotely preserved.
- [x] Current production healthy.
- [x] Current source/build/branch lineage understood; no later product patch.
- [x] Founder approved as named migration/operator/go-no-go/abort/rollback owner.
- [x] Founder approved as primary alert/backup/post-cutover/stabilization/kill-switch owner.
- [x] DigitalOcean alert configuration inspected and accepted.
- [x] Alert delivery received and recorded.
- [x] $40 billing alert enabled and Founder-attested.
- [x] Fresh local production backup candidate captured without canonical mutation.
- [x] Local candidate integrity verified.
- [x] Local candidate restored in isolation.
- [x] Private backup encrypted with recovery-key custody recorded.
- [x] Off-machine replica completed and independently verified.
- [x] Legacy retention recommendation and all exit conditions accepted on 2026-08-13.
- [x] Provider app/database and public dependency readiness healthy.
- [x] Provider capacity configuration and ongoing CPU/memory/disk alerts verified without weakening the app-only firewall.
- [x] Fresh Spaces private/versioned inventory/readback verified with authorized credentials.
- [x] Migration package export reads the current live source and has zero unknown collections.
- [x] Production-guarded migration/composition-switch wrapper implemented and isolated-accepted in source.
- [x] Write-only maintenance fence implemented, isolated-tested, and inactive.
- [x] Rollback matrix preserves the pre-write/post-write distinction.
- [x] 2-5 minute estimate remains credible from measured copy/provider evidence.
- [x] Ten-minute pre-write abort threshold remains current.
- [x] No unresolved deterministic rehearsal migration defect.
- [x] No unresolved accepted provider rehearsal defect.
- [x] No unresolved accepted parity defect.
- [x] No unresolved Phase 6 compatibility defect.
- [x] No infrastructure cost increase.
- [x] Production authentication remains separate and inactive.
- [x] Web remains the permanent fallback.
- [ ] Exact migration window approved.
- [ ] Final explicit migration go/no-go approved.

Any false item keeps production migration blocked.

## Plain-language authorization packet

- **Ready now?** No. Technical/provider/recovery and retention gates are accepted, but exact-window approval and final explicit go/no-go are incomplete.
- **What will eventually move?** All 42 canonical Founder record collections from JSON to PostgreSQL and 365 current evidence/media files (plus any later files) from local storage to private versioned Spaces, using a fresh final snapshot.
- **What remains temporarily?** The exact legacy JSON/runtime, local media, encrypted backup, migration manifests/logs, and rollback build remain unchanged and read-only throughout stabilization.
- **Availability?** The plan is a 2-5 minute write pause, with reads available on the pinned legacy snapshot while the accepted, already-deployed write-only fence is active. Reserve 45 minutes for preflight, smoke, observation, and possible pre-write rollback.
- **User behavior?** Do not log a workout, upload/review evidence, enter check-ins/weight/nutrition/activity, complete priorities/protocols, or edit Goals/Plan during the announced window.
- **Failure before a new PostgreSQL write?** Abort and return to the unchanged JSON source/build.
- **Failure after a new PostgreSQL write?** Fence writes, keep PostgreSQL canonical, roll code compatibly, and repair/reconcile forward; never replace it with stale JSON.
- **Backups?** The byte-exact runtime/media/control/repository/build packet is age-encrypted, independently replicated to `G:`, and restored/verified. Provider managed backup and accepted isolated provider restore evidence also exist. Final pre-fence capture must refresh legitimate user changes.
- **Retention?** At least 35 days and until seven stable days, a post-cutover DB restore, media integrity, no rollback trigger, and explicit deletion review.
- **Authority/alerts?** Founder is approved for all roles; provider rules are enabled to the Founder account email and actual delivery was confirmed.
- **Cost/auth/UI/Workout Logger?** No planned cost increase from $30.15/month; the $50 ceiling remains. Authentication stays inactive. Product UI and Workout Logger behavior do not intentionally change.
- **Does iOS start afterward?** No. Migration begins a minimum seven accepted daily-use-day stabilization period. Native Baseline remains separately gated.
- **What later phrase authorizes migration?** Only an explicit instruction after every checklist item is true, naming the exact checkpoint/build/window, for example: `GO: authorize the canonical production migration from the published operational checkpoint during the approved 2026-08-13 8:30-9:15 PM PT window, using the verified backup packet and ten-minute pre-write abort rule.`

**Production migration is not authorized until the user gives an explicit go/no-go after reviewing the completed packet.**

## Exact remaining approvals/actions

1. Approve the exact migration window.
2. Give a separate final explicit go/no-go naming the accepted checkpoint/build/window after the final pre-fence refresh.

Final classification: **BLOCKED**.

## Inactive safety-capability deployment evidence (2026-08-12)

- source/checkpoint: `e3b4f4505e9c2b5598901b002271933f45c24dbf` on synchronized `phase6-compatibility-release`;
- production build: `HasDoRm5cgRE0FsXZU1Uu`; prior build `RmjN47V8xsq3-6jSlZh-9` retained at `.next.rollback-33020`;
- control: `private/founder/migration-control.json`, version 1, production, `inactive / legacy-json / legacy-json`, reads/writes enabled, one initialization audit entry, no operation/fence/first write;
- lifecycle: isolated single build and smoke, canonical stop, atomic promote, scheduled-task start, local/public acceptance, then one additional stop/start durability proof; automatic rollback was armed and not invoked;
- Founder integrity: revision 119, 26,955,008 bytes, SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`, byte-identical before/after/restart;
- product: 20-route local/LAN/public matrices, 25 referenced assets with correct MIME, authorized media, Evidence Review, TrainingSession, Progress, Timeline, Goals/Confidence, and inactive protected foundation routes passed; no production write was fabricated;
- migration isolation: JSON/file and local evidence remain canonical; PostgreSQL, Spaces, authentication, and migration remain inactive/noncanonical; the fence was never activated;
- visual evidence: no in-app browser session was available, so no visual acceptance is claimed; HTTP/rendering and static-asset acceptance passed;
- off-machine checkpoint: verified replica `G:\My Drive\PhysiqueOS Backups\PhysiqueOS_Backup_2026-08-12_16-40-49`, exact commit, verified bundle SHA-256 `BE6686ACE1237AFF1325D8B95B3EB01DBFA55AA42054F451FA207507E5DA0E07`.

The off-machine repository checkpoint closes the prior missing independent-replica gate. Its manifest intentionally says Founder runtime bytes are not included, and it predates the production control record. Therefore the later pre-migration encrypted recovery packet must add byte-exact runtime/media/control coverage and reconcile the restored control with build identity, its tamper-evident audit, the canonical data store, and provider state. The inactive deployment gate is closed; production migration remains **BLOCKED**.

## Final-gate remediation status (2026-08-13)

The source now contains the previously missing single production runner, real production adapters, and live durable composition path. Dry-run and execution share one `ProductionMigrationRunner`/`ProductionMigrationOrchestrator` graph; dry-run rejects a supplied final GO and makes no control, canonical, database, object, authentication, or evidence mutation. Execution requires the exact expected inactive state, operation ID, operator, source commit, build, runtime revision/hash, control version, and a separately supplied exact authorization phrase. Production execution was not invoked.

Exact-source manifests no longer use the historical Phase 3 revision. Trusted derivation records typed runtime, repository, application, script, package, schema, and operation identities; import rejects wrong build/commit/runtime/package/operation before database mutation. The independent provider verifier reports cluster identity/status, newest backup timestamp/age, the 24-hour threshold, PASS/BLOCKED, provider source, and verification time without credentials. Unavailable, wrong-cluster, missing, or stale metadata blocks the same runner preflight without override.

Isolated acceptance is PASS, including two full runner executions, deterministic import digest, legacy/provider selection, transactional PostgreSQL write, no dual write/fallback, pre-write abort, and post-write forward repair. A replacement database-read-only PAT then verified exact DigitalOcean cluster `f544596d-594e-4aa4-a0a8-533bda0992c6` online and newest backup `2026-08-13T06:54:12.000Z`, age 13.527 hours at `2026-08-13T20:25:48.094Z`, size 0.06846476 GiB: **PASS** under the mandatory 24-hour policy. The source is not yet published/deployed, so the current production application cannot yet be credited with this live composition path. Exact window and final migration GO remain pending; no prior approval is broadened.

## Current-lineage recovery refresh (2026-08-13)

The revision-119 / 365-media recovery packet is historical only. A new
credential-free packet now matches deployed source
`4f82619bd03c8f20331a45e126e1cfa79f199d2d`, build
`itQ9UXmsDRPssBzrFTPc5`, rollback `HasDoRm5cgRE0FsXZU1Uu`, Founder revision
122, runtime SHA-256
`92EE630BD314A6AB6D3F6F66D1B54D441BE508C91E50AB5FFD6A116A02D11D1C`,
372 media files, inactive control SHA-256
`435BCAE703BA96E984D69C45FC808CBE404128E9137D14D99D8FAC836D4D32DE`,
and package-v2 tooling. It includes a verified Git bundle through the exact
source, current/rollback build artifacts, runbooks, and secret-free fresh
provider inventory.

The local and off-machine encrypted copies are 769,020,390 bytes with SHA-256
`E8E63CACB09F706D8CBD939E3536D3807DF070D67CC8B156448F7548D47AF741`.
Isolated decrypt/restore verified all 6,596 packet files, every media hash,
runtime/control, source reachability, both build identities, and nonmutating
migration-tool loading. The existing password-manager secret was reused and
the temporary DPAPI/plaintext/decrypted artifacts were removed. Production
stayed healthy, writable, and strictly `inactive / legacy-json / legacy-json`.

Recovery evidence is current enough to rerun the final pre-fence gate. That
gate must still recheck live alignment, provider backup freshness, exact
window, and final explicit GO. No fence or migration is authorized here.

## Provider-side dry-run authorization boundary (2026-08-13)

The previous final gate did not reach READY because its real production CLI
attempted private PostgreSQL connectivity from the Windows control plane. The
accepted firewall intentionally permits only App Platform app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`; it remains unchanged and the operator
workstation remains untrusted for database connections.

The remediation separates responsibilities without adding a second migration
implementation. Windows captures and validates live production source/build,
Founder revision/hash, inactive migration-control state/digest, current
encrypted recovery checksum, rollback identity, and the 39/3 collection
contract. It submits those nonsecret expectations with explicit operation,
correlation, operator, and environment identities. The authenticated App
Platform worker loads the same `ProductionMigrationRunner` and orchestrator and
performs all provider-dependent checks using encrypted server environment
credentials. The status contract returns only state, timestamps, identities,
redacted check summaries, backup age, worker heartbeat, no-mutation proof,
failure code, and final dry-run classification.

The current provider attestation is revision `122`, runtime SHA-256
`92EE630BD314A6AB6D3F6F66D1B54D441BE508C91E50AB5FFD6A116A02D11D1C`,
372 media files / 276,646,284 bytes, and media-inventory SHA-256
`5BED8E9231031F10F58AA189116E7054F2CE2CA2607D30C4D7AE2F987D715391`.
The control client hashes every live media file and the protected endpoint
fails closed if runtime/media lineage no longer matches the provider-pinned
recovery state.

The remote operation cannot carry a final migration authorization and its
server-side adapters cannot call any execution-stage operation. It cannot
activate the fence, pause writes, create a canonical PostgreSQL write, import
Founder data, upload production media, switch composition, or activate
authentication. A migration-run audit row and outbox message are the only expected
noncanonical audit effects. Same-ID/same-payload requests replay status;
same-ID/different-payload requests fail closed.

Before another final GO/NO-GO, a separately authorized inert App Platform
deployment must prove authenticated submit/status, worker execution, private
target connectivity, fresh backup metadata, private/versioned Space checks,
provider composition, durable restart/reconnect behavior, and unchanged target
inventories against synthetic data. That rehearsal is not a migration and does
not replace the later exact final user authorization.

### Live provider-side dry-run evidence (2026-08-13)

The bounded capability is active but inert on App Platform deployment
`0d27de79-169a-4fda-a16c-ad868d46b7e4`, source
`73c612a539ba056e5dd3b0634a80859f83910787`, provider build
`provider-dry-run-73c612a`. The prior operations-auth 401 was caused by loading
the DPAPI-protected `PSCredential` incorrectly on Windows; using its protected
password field restored the intended bearer value. The server secret was not
rotated or weakened, and all negative authentication cases still reject.

One authorized invocation, `phase6-provider-dry-run-20260814-0330`, completed
`succeeded` / `READY` through the durable web/outbox/worker path. It proved the
accepted PostgreSQL cluster, PostgreSQL 17.10, migration level
`000004_phase5_provider_readiness`, logical database
`physiqueos_phase5_test_provider_20260811`, a 19.759-hour managed backup,
private/versioned Spaces, current worker/build identity, provider composition,
package/manifest v2, 39 required and three excluded collections, and no dual
write. The database endpoint is the managed public TLS hostname reached only
from the App Platform app; the database firewall remains exactly App-only.

The canonical before/after digest matched at
`d388cca324ed6f45044c6f3256d485e5bc1fb09b5ef9b2507fa62d5d4fc312ae`.
The only durable change was the allowed noncanonical operation/audit record.
This evidence authorizes repeating the final pre-fence decision process after
the repository checkpoint. It does not constitute final GO and does not
authorize fence activation, write pause, import, canonical PostgreSQL writes,
evidence movement, authentication activation, or migration execution.
## Authorization invalidation and replacement model (2026-08-13)

Every prior persistence-only migration authorization is permanently invalidated. The next possible production authorization must bind the combined runtime and persistence transition described in `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`. In addition to the existing Founder, media, control, database, Spaces, recovery, source/build, retention, and no-writes fields, it must bind the exact full provider deployment/source/build, runtime-authority tuple, routing target, worker handoff, measured write-pause range, pre-first-provider-write abort rule, and post-first-write provider-canonical recovery rule.

This source patch is not that authorization. A compatibility deployment, provider acceptance, recovery refresh, and new final preflight remain separate required stages.
