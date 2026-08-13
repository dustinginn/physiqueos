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
