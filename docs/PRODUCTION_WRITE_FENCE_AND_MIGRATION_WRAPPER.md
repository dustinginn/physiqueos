# Production write fence and migration wrapper

Implementation date: 2026-08-12 (America/Los_Angeles)

Status: **IMPLEMENTED, DEPLOYED, AND ACCEPTED INACTIVE ON LEGACY JSON. Production migration remains BLOCKED and unapproved.**

This patch closes the executable write-fence and guarded migration-wrapper defect found by the final operational audit. It does not migrate production, move evidence, enable authentication, switch canonical persistence, create infrastructure, or begin Phase 7/Native work.

## Authority and unchanged production baseline

The Founder/user approved assignment as migration operator, go/no-go authority, abort authority, rollback authority, primary alert recipient, backup-verification owner, post-cutover-validation owner, seven-day-stabilization owner, and later Native kill-switch owner. This role approval does not approve a migration window or final go/no-go.

Production now runs accepted safety source `e3b4f4505e9c2b5598901b002271933f45c24dbf`, build `HasDoRm5cgRE0FsXZU1Uu`, with JSON/file and local evidence canonical. The current audited source is Founder revision `119`, SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`, including the Aug 11 activity/nutrition/Workout Logger activity and Aug 12 weight. The capability is present but strictly inactive, so canonical behavior remains legacy-compatible.

## Durable server-owned control

`DurableMigrationControlStore` uses one private, server-local JSON envelope, atomic same-directory replacement, an exclusive lock, an ordered audit, optimistic expected version/state/epoch/composition checks, command fingerprints, and an integrity digest. The future production path is `private/founder/migration-control.json`; isolated operation is accepted only below `.tmp`.

The control stays available across application composition changes because it is outside both canonical domain stores. Missing, corrupt, locked, or unverifiable control fails canonical writes closed. It contains operational state and bounded audit metadata only, not credentials or Founder domain data. Before any future deployment of this patch, the operator must initialize and verify the inactive legacy control record; deploying without that record would intentionally fail closed rather than assume writes are safe.

| Fence state | Epoch | Composition | Writes | Meaning |
| --- | --- | --- | --- | --- |
| `inactive` | `legacy-json` | `legacy-json` | enabled | Current production-compatible state |
| `active` | `migration-fence` | `legacy-json` | paused | Reads may continue; final capture has not begun |
| `cutover-in-progress` | `migration-fence` | `legacy-json` | paused | Final capture/export/import/validation |
| `cutover-in-progress` | `postgres-canonical` | `postgres` | paused | Validated composition selected; first-write boundary not yet released |
| `completed` | `postgres-canonical` | `postgres` | enabled | Cutover accepted; stabilization |
| `aborted` | `legacy-json` | `legacy-json` | enabled | Safe pre-first-write return to unchanged legacy source |
| `recovery-required` | `postgres-canonical` | `postgres` | paused | A PostgreSQL write exists; forward repair required |

Activation, release, abort, composition switch, first-write recording, and recovery are explicit state-machine transitions. Each requires operator, command/correlation/operation identity and explicit expected version, fence state, epoch, and composition. Production CLI use additionally requires a command-specific exact confirmation phrase. Repeating the same command is idempotent; reusing its ID with different inputs fails.

## Central write interception and user response

Every method exposed by `createSeedRepositories` is classified as read-only or canonical-write. A test reflects over the live repository surface and fails on any unknown method. Canonical writes are intercepted at:

- the global Founder repository proxy;
- the atomic Founder runtime commit;
- `FounderStoreUnitOfWork.commit`;
- every Phase 3 command before its persistence port;
- upload/reconciliation routes before file or pending-state creation; and
- photo and DEXA evidence actions before file intake.

An active or unavailable fence returns server-owned `503 CANONICAL_WRITES_PAUSED`: writes are temporarily paused, the request was not applied, no canonical mutation occurred, and retry is allowed after maintenance. Wrong-store attempts fail with `WRONG_CANONICAL_STORE`; stale-epoch commands fail with `CANONICAL_STORE_EPOCH_MISMATCH`. The existing error presentation gives the same bounded message. Safe reads remain enabled. No invisible canonical replay queue was added.

After a PostgreSQL composition switch, legacy-direct mutations continue to pass through the legacy fence and are rejected as wrong-store. They cannot alter stale JSON. PostgreSQL transactional commands use the PostgreSQL fence and epoch. This deliberately fails closed for a route not yet using the shared application command boundary rather than pretending an in-memory legacy repository is durable PostgreSQL.

## Write/retry classification

| Surface | Classification during fence | Protection |
| --- | --- | --- |
| Phase 3 canonical commands | must pause | fence before port; epoch in receipt hash/outbox |
| Direct Founder repository/runtime/UoW writes | must pause | central proxy plus final commit guard |
| Evidence uploads and upload-created pending state | must pause | guard before file creation and repository mutation |
| Training reconciliation and Evidence Review mutations | must pause | route/repository guards |
| Browser Training Logger draft | noncanonical draft-safe | remains browser-local; no automatic canonical replay |
| Command receipt replay | fail closed across epochs | canonical epoch is part of payload hash |
| Outbox work | fail closed/reconcile | missing or mismatched epoch is rejected |
| Read models and published briefings | read-only | may continue where practical |

No canonical request accepted in one epoch can execute in another without an explicit matching epoch. Unknown repository methods and unknown inventory entries fail the readiness suite.

## Composition switch and wrapper

`CanonicalApplicationCompositionSelector` reads durable control at request-side composition resolution, checks optional expected mode/epoch, and selects only legacy or PostgreSQL. Unknown or unavailable state fails closed. The PostgreSQL composition reuses the accepted Phase 5 provider boundary, transactional Phase 3 commands, and authorized private-media service; client contracts do not change.

`ProductionMigrationOrchestrator` is the single strict-order wrapper. Dry-run executes build/source, backup, target-health, migration-script, and collection-inventory preflight and verifies control did not change. Execution then performs final source capture, deterministic export/package validation, import, authorized media work, import/read/command validation, composition switch, read verification, representative PostgreSQL write boundary, explicit fence release, post-cutover smoke, and stabilization entry. Production execution requires a separate explicit authorization input; this patch did not supply it.

The hard pre-first-write fence budget is ten minutes. Exceeding it automatically resets only the guarded target and returns to unchanged legacy. Failure before a first PostgreSQL write can abort to legacy even after composition selection. Once the first PostgreSQL write is recorded, automatic JSON fallback is impossible: failure enters `recovery-required`, keeps PostgreSQL canonical, and pauses writes for forward repair.

## Isolated acceptance evidence

The wrapper ran against four fresh, explicitly guarded local PostgreSQL 17 databases on `127.0.0.1:55433`, using only an immutable copy of revision 119. Migrations `000001` through `000004` were applied. The source stayed byte-identical at SHA-256 `cc4903f96145fb3a3059010a6de4ed1b9a31dd4fec3a4d6cf6a10d9ccebf4281`.

Two complete fresh-target runs passed with the same migration ID `cc4903f9-6145-7b3a-8059-010a6de4ed1b`, all 42 collections, 365 media objects, exact import validation, all 17 read surfaces, a PostgreSQL transactional representative write only after composition selection, durable first-write recording, explicit release, and post-cutover smoke.

| Measurement | Run A | Run B |
| --- | ---: | ---: |
| Preflight | 107 ms | 108 ms |
| Fence activation | 2.54 ms | 2.57 ms |
| Final snapshot | 1,294 ms | 1,308 ms |
| Export | 1,604 ms | 1,557 ms |
| Package validation | 271 ms | 272 ms |
| Import | 2,066 ms | 2,065 ms |
| Media | 1,542 ms | 1,557 ms |
| Import/read/command validation | 3,815 ms | 3,742 ms |
| Composition switch | 5.55 ms | 3.71 ms |
| Fence release | 1.54 ms | 1.64 ms |
| Post-switch smoke | 19.18 ms | 21.68 ms |
| Total fenced | 10.617 s | 10.528 s |
| Total | 10.727 s | 10.639 s |

The deliberate import failure reset the isolated target and ended `aborted / legacy-json / writes-enabled`, with no first write. The deliberate post-first-write smoke failure ended `recovery-required / postgres-canonical / writes-paused`, without legacy rollback. Unit tests separately prove safe abort after composition selection but before the first write, hard ten-minute abort, missing/corrupt control failure, activation/release idempotency, stale epoch rejection, outbox epoch rejection, and exact legacy file nonmutation under an active fence.

## Operational use and deployment gate

`scripts/operateMigrationControl.mjs` supports status, initialize, activate, begin, switch, record-first-write, release, abort, and require-recovery. Nonproduction targets require `--isolated true` below `.tmp`; production requires `--production true`, every explicit expectation, and an exact confirmation. `scripts/runMigrationWrapperRehearsal.mjs` refuses non-local or unguarded database names and is never a production importer.

## Production runner and live composition remediation (2026-08-13)

`scripts/runProductionMigration.mjs` is now the sole bounded production migration entrypoint. `scripts/productionMigrationEnvironmentAdapters.mjs` composes the durable control, exact deployed build/repository identity, final snapshot/export, PostgreSQL import, Spaces multipart/hash migration, provider composition, read parity, representative first write, rollback, recovery archive, and DigitalOcean backup verifier. Dry-run and execution enter the same `ProductionMigrationRunner` and accepted `ProductionMigrationOrchestrator`; execution additionally requires the exact runner-generated GO phrase. No individual control command sequence is a substitute.

The live application now resolves a production composition from the durable state on every uncached selection. `inactive/legacy-json/legacy-json` creates only the legacy JSON composition and does not initialize PostgreSQL or Spaces. `postgres/postgres-canonical` creates the PostgreSQL/Spaces composition. Any cross-mode epoch pair fails closed. The shared `FounderRepositories` facade resolves through that selection, while the raw legacy facade is consumed only by the legacy factory. Provider reads use the imported PostgreSQL snapshot; durable writes use `commands.execute`, clear the cached composition after success, and reload subsequent reads. A direct repository mutation without an explicitly durable PostgreSQL adapter returns `DIRECT_POSTGRES_REPOSITORY_WRITE_UNAVAILABLE`; there is no hidden legacy or in-memory fallback.

Trusted source identity is mandatory for export and is validated again before import. The current-copy scripts derive Git/build/runtime identity and contain no historical Phase 3 checkpoint default. Backup freshness is independently queried from DigitalOcean API v2 and must be at most 24 hours old for the exact cluster in online state. This gate has no override.

The actual runner completed two fresh guarded rehearsals of 42 collections, 365 media files, 17 reads, composition switch, transactional first write, fence release, and smoke. Import digest was identical across runs. Deliberate `verifyPackage` failure produced `aborted-to-legacy` with no first write; deliberate post-write smoke failure produced `forward-repair-required`. Live DigitalOcean API v2 verification then passed for exact online cluster `f544596d-594e-4aa4-a0a8-533bda0992c6`: latest backup `2026-08-13T06:54:12.000Z`, age 13.527 hours at verification, under the 24-hour threshold. Inactive production deployment remains pending, so production migration remains blocked and the fence remains inactive.

### Windows CLI entrypoint compatibility follow-up

The exact-checkpoint inactive-deployment preflight found that `runProductionMigration.mjs` passed a raw absolute Windows path such as `C:\...\productionMigrationEnvironmentAdapters.mjs` to dynamic `import()`. Node rejected the `c:` scheme before loading the adapter environment, runner, or orchestrator. The follow-up converts only filesystem module paths to standard `file:` URLs with `pathToFileURL()`, preserves valid `file:` URLs and package specifiers, resolves relative filesystem paths deterministically, rejects unsupported URL schemes, and restricts the production adapter to the scripts directory.

Deterministic coverage now imports a real temporary module through the same loader, including a Windows path containing spaces and backslashes, and spawns the actual CLI against a non-mutating adapter fixture. The CLI reaches the accepted `ProductionMigrationRunner` dry-run, runs every preflight adapter, supplies no final GO, records no control transition, and remains `inactive / legacy-json / legacy-json`. The exact committed build and credential-backed CLI preflight are required again before inactive deployment authorization; this source repair itself does not deploy or authorize migration.

### Canonical collection inventory remediation

The subsequent credential-backed CLI exposed a stale inventory assumption rather than missing Founder data. The original 42-entry registry included three values hydrated from code after raw JSON load. Raw Phase 4 revision 110, accepted revision 119, and revision 122 each contain the same 39 persisted canonical collection keys and omit `operatingRhythm`, `adaptiveTrustProfile`, and `milestones`. There was no intervening removal migration.

Manifest/package version 2 now records 39 required present, zero optional present/absent, and the three explicit exclusions: `operatingRhythm` as derived/noncanonical code-owned read context, `adaptiveTrustProfile` as future-only/inactive design, and standalone `milestones` as deprecated/retired. Unknown input and any missing one of the 39 remain fatal. Export cannot synthesize a value for an absent required key, and excluded input is recorded but never promoted to canonical data.

The exact-checkpoint Windows CLI dry-run passes source/build identity, encrypted recovery, live managed-backup freshness, guarded PostgreSQL and private Spaces health, migration/provider wiring, the corrected inventory contract, and the dry-run authorization boundary. It performs no capture, export, import, media move, fence transition, composition switch, authentication activation, or canonical write. This restores **READY FOR INACTIVE DEPLOYMENT** only; it does not authorize deployment or migration.

No safety-capability deployment was required or performed for source acceptance. During validation, the older Phase 1/2 scripts were found to direct their nominal production build at canonical `.next` while the task was running. The task was immediately stopped and the previously verified exact Phase 6 artifact was atomically restored using the approved lifecycle, restarted, and checked: build `RmjN47V8xsq3-6jSlZh-9`, source `6f497610...`, `/` 200, 12 referenced assets 200, and Founder SHA unchanged before/after. No safety-patch code was promoted. The Phase 1/2 validators now use guarded temporary dist directories like Phases 3-6, clean them afterward, and a deterministic test enforces all six mappings.

A later separately approved inactive-capability deployment must use the same stop/preflight/atomic-promote/restart/rollback lifecycle, initialize inactive legacy control before the new code can serve writes, and reverify exact Founder bytes and normal legacy behavior. Deploying the capability still would not authorize activating the fence.

## Remaining binary gates

The executable fence/wrapper defect is closed in accepted source. Production migration is still **BLOCKED** on all of the following:

- inspect and accept provider alert/capacity configuration and record delivered alert email;
- enable and verify the $40 billing alert;
- create an encrypted independently verified off-machine runtime/media backup and record key custody;
- approve retention;
- freshly verify Spaces private/versioned inventory/readback;
- approve the exact migration window and final go/no-go; and
- publish and, only if separately approved, deploy this inactive safety checkpoint with legacy behavior verified.

The role assignment and inactive deployment are approved. Alerts, billing, retention, migration window, and production migration are not approved by this patch. The next repository action after user acceptance is the required End Work Session checkpoint for this deployment documentation; it is not Phase 7.

## Inactive production deployment acceptance

Checkpoint `e3b4f4505e9c2b5598901b002271933f45c24dbf` was published before deployment, built once in an isolated clean clone, stamped with source identity, and accepted as build `HasDoRm5cgRE0FsXZU1Uu`. Preflight covered all 17 Phase 3 canonical commands, all 54 classified repository write methods, all nine canonical entry points, control restart durability, Phase 1-6/Training/Photo/ownership/persistence regressions, the 27-test migration-safety suite, targeted lint, diff, isolated production build, 20 routes, 25 assets/MIME types, and authorized media.

The production control was initialized before code promotion at `private/founder/migration-control.json`. Its ACL permits only the production user, SYSTEM, and Administrators. It contains no credentials or Founder domain data and is outside source control and `.next`. The exact state is version 1 `inactive / legacy-json / legacy-json`, reads/writes enabled, no migration operation, no fence, and no first-write boundary. Missing/corrupt/unavailable state now fails canonical writes closed; recovery is the guarded `operateMigrationControl.mjs status` plus an explicitly reviewed restoration or repair of the tamper-evident record, never an implicit default.

The canonical task stopped, the prebuilt artifact was atomically promoted, and the task restarted under Windows Scheduler ownership. Automatic rollback was armed but not invoked. The old `RmjN47V8xsq3-6jSlZh-9` build is retained at `.next.rollback-33020`. Local, LAN, and public route/asset/media acceptance passed. One additional canonical restart preserved the control file byte-for-byte and returned exact build/source with healthy routes.

Founder revision 119 remained `26,955,008` bytes with SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`. No production write was fabricated; inactive write availability is proven by exact-build isolated command/write-surface tests and the unchanged enabled operational state. No in-app browser session was available, so visual acceptance is not claimed.

The inactive capability exists in production without changing canonical behavior. The fence was never activated. JSON/file and current local evidence remain canonical; PostgreSQL and Spaces remain noncanonical; authentication remains inactive; no migration operation or evidence move occurred.

## Operational-readiness gate closure

The later non-migration readiness patch accepted provider alerting and the control-inclusive recovery set; exact evidence is in `docs/ENCRYPTED_MIGRATION_RECOVERY.md`. App/worker and database alerts are enabled to the Founder email, actual Uptime email delivery was confirmed, the $40 billing alert is Founder-attested active, current staging/Space/database readiness is accepted, and recurring cost remains $30.15/month.

The encrypted packet reconciles source checkpoint `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e`, production build `HasDoRm5cgRE0FsXZU1Uu`, rollback `RmjN47V8xsq3-6jSlZh-9`, runtime SHA `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`, and control SHA `435BCAE703BA96E984D69C45FC808CBE404128E9137D14D99D8FAC836D4D32DE`. All 365 media hashes and 402 packet entries passed isolated restore. Matching local/off-machine encrypted copies have SHA-256 `D6C4729FA33D83B9A5A080323CB64E143E61839D2F0B0B6D3FE96A1848C93E48`.

These results close the alert/capacity/recovery bullets in the earlier remaining-gates list. The Founder accepted the complete 35-day minimum retention policy and its exit conditions on 2026-08-13; future deletion remains separately review-gated. Migration remains **BLOCKED** on exact-window approval and separate final go/no-go. The final pre-fence capture must refresh current runtime/media/control bytes. No fence, migration, composition switch, production auth, or evidence move occurred in this gate.

## Provider-side production dry-run transport (2026-08-13)

The production runner remains authoritative, but its provider-dependent
preflight must execute inside DigitalOcean App Platform. The Windows operator
client is a control plane only. It validates local production/runtime/control/
recovery/rollback identities, then submits a typed request to
`POST /api/v1/operations/production-migration-dry-runs` and polls the protected
`GET /api/v1/operations/production-migration-dry-runs/:operationId` status.
Both routes require the existing operations bearer token; no credential is
placed in a URL.

The web process writes an idempotent `production-migration-dry-run` migration-run audit
and matching `operations.production-migration-dry-run` outbox message in one
foundation-database transaction. The existing worker claims the durable
message, so client disconnects and expired leases do not lose work. Exact
replay returns the existing operation; changed payload under the same ID is
rejected. Worker success/failure and a redacted result are durable and safe to
poll after restart.

Inside the worker, a thin provider environment supplies nonmutating adapters to
the accepted `ProductionMigrationRunner`. Its control store is immutable and
throws on every transition. All execution-stage adapters throw
`REMOTE_DRY_RUN_EXECUTION_FORBIDDEN`. Before/after target database counts and
Space inventory digests must match. The runner must still validate source/build,
runtime attestation, recovery/control digests, backup freshness, target health,
provider composition, package-v2 tooling, and the 39-required/3-excluded
inventory before returning its no-final-GO READY boundary.

`scripts/runRemoteProductionMigrationDryRun.mjs` is the Windows control client.
The older direct adapter now rejects DigitalOcean production-provider targets
outside `PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY=digitalocean-app-platform` with
`MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED`; a timeout is no longer the
expected control flow. Local isolated databases remain available to explicit
synthetic rehearsal. The remote capability is inert until separately deployed
and explicitly invoked; it never auto-runs at web or worker startup.

## Provider-side dry-run accepted live (2026-08-13)

Exact source `73c612a539ba056e5dd3b0634a80859f83910787` is running as
provider build `provider-dry-run-73c612a` on App Platform deployment
`0d27de79-169a-4fda-a16c-ad868d46b7e4`. The web endpoint accepted the correct
operations principal after the Windows client correctly extracted the token
from its DPAPI-protected `PSCredential`; negative credentials remained 401.
The worker then claimed exactly one typed dry-run operation,
`phase6-provider-dry-run-20260814-0330`, and reused the production runner and
orchestrator to terminal `READY`.

Live evidence includes PostgreSQL 17.10 at migration
`000004_phase5_provider_readiness`, the accepted migration logical database,
fresh managed backup age 19.759 hours, private/versioned Spaces, healthy worker,
39-required/3-excluded inventory, and unchanged provider topology. Because the
app has no VPC, the worker uses the managed public TLS authority; the cluster
still trusts only the exact App Platform app and no workstation source was
added. The canonical database/Space digest remained
`d388cca324ed6f45044c6f3256d485e5bc1fb09b5ef9b2507fa62d5d4fc312ae`
before and after.

The wrapper never crossed the authorization boundary: migration control is
still inactive with legacy JSON canonical, reads and writes enabled, no
operation/fence/first PostgreSQL canonical write, and authentication inactive.
Only the noncanonical durable audit record was created. The result permits a
new final pre-fence gate after repository closeout; it is not final GO and does
not authorize any migration action.
