# Pre-iOS Readiness Checkpoint

Status: active operational gate

Last audited: 2026-08-11

Implementation base revision: `a4c759fd`

Foundation design: Phase 1 accepted; Phase 2 local/provider-ready implementation validated on 2026-08-11 and paused at the explicit DigitalOcean provisioning gate. Production activation remains gated by the exit evidence below.

Companion decision record: `docs/PHYSIQUEOS_NATIVE_V1.md`

## Executive checkpoint

**Classification: BLOCKED for significant SwiftUI; READY for Windows-first foundation work.**

The production behavior is rich and well tested, but the current runtime is not a secure shared-client platform. The critical path is authentication/authorization, canonical persistence, private object storage, application APIs, and cross-client correctness. No production data was changed during this audit.

Observed production runtime checkpoint after the Founder's legitimate Aug 10-11 logging activity:

- runtime schema/version: `founder-seed-v2`
- persisted revision: `107`
- updated at: `2026-08-11T13:46:05.401Z`
- runtime file size: `25,964,481` bytes
- runtime SHA-256: `4FBE7875B334ACAE0199AAE223729E75AC4AC89D96EA7CAF830BF9B8F69CDCA1`
- audited source: 1,389 files under `src`, including 498 test files and 95 page/route files

Revision `104` was the valid pre-upload checkpoint. The Founder then uploaded Aug 10 Nutrition and Activity, completed the Aug 10 Foam Roll and Tesamorelin priorities, and entered the Aug 11 weight; revision `107` is therefore expected user-authored production state. The bounded acceptance harness observed the revision, size, and hash above unchanged before and after validation. Runtime record contents and credentials are intentionally omitted.

## Foundation decision snapshot

The repository-grounded recommendation is now concrete. Full rationale, contracts, schema families, migration rules, approvals, implementation file inventory, and the Phase 1 checkpoint are canonical in `docs/PHYSIQUEOS_NATIVE_V1.md` sections 18-33.

```text
production web + /api/v1 (one Next.js modular monolith)
                 -> authenticated application handlers
                 -> PostgreSQL 17 canonical state + private object storage
                 -> transactional outbox -> same-build background worker
future iOS ------/
```

- **Runtime:** DigitalOcean App Platform is approved as the eventual provider: an approved US region, one immutable build with web and worker process types, Managed PostgreSQL 17, and a private versioned DigitalOcean Space. Founder-stage cost targets USD 25-35/month and may not exceed USD 50/month without approval. Account owner, exact region, alert recipient, and operator remain required before provisioning; nothing was provisioned in Phase 1.
- **Persistence:** relational/JSONB bounded PostgreSQL schema; legacy IDs preserved as text, new IDs use UUIDv7 strings; `user_id` on every owned record; bigint aggregate versions; explicit SQL migrations; no runtime snapshot table.
- **Concurrency:** optimistic version checks, unique idempotency receipts with request hashes, database constraints, atomic multi-record commands, stable occurrence/source identities, and a durable transactional outbox. Stale state is rejected, never silently overwritten.
- **Files:** database-owned opaque object identity, private S3-compatible bytes, direct resumable uploads with verified receipts, five-minute authorized reads, versioning plus an independent backup copy. Filesystem paths and permanent URLs leave client contracts.
- **Authentication:** server-created Founder user, web passkey, authenticated web-issued one-time iOS pairing code, revocable device sessions, 10-minute access token, and rotating refresh credentials. Face ID/eight-digit PIN only unlock local credentials. Progressive PIN delays culminate in local credential invalidation and recovery-credential/re-enrollment; canonical Founder data is never deleted. The one-time high-entropy recovery credential is stored externally in the Founder's password manager, not delivered through consumer email/password recovery.
- **API:** REST/JSON `/api/v1`, OpenAPI 3.1, bounded read models and task commands, cursors/ETags/typed destinations/operations/change feed, RFC 9457-style errors, additive compatibility for current and previous accepted build for at least 180 days.
- **Cutover:** deterministic rehearsals on copies, compatibility release, short read-only final fence targeted below 10 minutes (automatic abort at 15 before a database write), complete snapshot/file verification, then web becomes the first production shared-platform client. No production dual-write.
- **Offline:** seven-day protected read cache and narrow safe command queue; sensitive edits/confirmation require live state. Live Workout later uses one editor lease and versioned durable autosave.
- **Stage 2 foundation:** create occurrence/outbox, Health source/checkpoint, notification-intent, and workout-draft identities/contracts on Windows; do not implement HealthKit, APNs presentation, or SwiftUI in this phase.

## Phase 1 implementation checkpoint

**Accepted as additive structural preparation; all shared-platform activation remains off.** Phase 1 added the versioned contract/error/identity/command layer, an initial OpenAPI 3.1 API skeleton, an explicit PostgreSQL migration, opt-in database composition, private-object ports with a deterministic test adapter, idempotency/version/transaction/outbox primitives, migration-manifest validation, and redacted observability/readiness seams.

The current production web application still uses the existing canonical JSON/file runtime. No DigitalOcean resources were provisioned, no PostgreSQL database was created or contacted, no authentication gate was activated, and no evidence was moved. The new readiness endpoint reports not ready and the protected platform endpoint denies access until later production composition is deliberately supplied.

Bounded validation on 2026-08-11 passed 15 test files / 90 tests, targeted lint, the production build, `git diff --check`, and smoke checks for `/api/health`, `/`, and `/log`. PostgreSQL/Docker was not available, so the migration has structural up/down coverage but still requires a real isolated-database integration test before activation.

The Windows worker environment has a 4 GB heap constraint. Unrestricted repository-wide concurrent Vitest execution can exhaust that environment and interleave production-state-dependent tests; the observed failed all-files run is classified as an environment/resource failure with test-order/concurrency contamination. It is not an acceptance gate and must not be rerun in that mode. Repository-wide coverage is not waived: future Windows validation must run explicit serial or tightly bounded groups, isolating production-state-dependent suites. `npm run validate:foundation` is the reusable Phase 1 checkpoint command unless the environment changes.

## Phase 2 local implementation and provisioning gate

**Local/provider-ready implementation passed; paid staging is not provisioned.** Phase 2 added PostgreSQL adapters for every foundation table, a second ownership/security migration, inactive Founder enrollment/session/recovery/passkey flows, a Spaces-compatible private-object adapter, a durable SQL outbox worker, async operational readiness, guarded backup/restore tools, and repository-owned DigitalOcean/container configuration.

Real PostgreSQL 17.10 validation ran on local port `55432` against synthetic-only guarded database `physiqueos_phase2_test`. Fresh migration, schema/constraints, transactions, idempotency uniqueness, receipt/outbox atomicity, authentication and refresh-reuse revocation, object relationships, restart persistence, expired-lease recovery, non-repeat of completed work, verified `pg_dump`/`pg_restore`, full down, and re-apply passed. The final local database is an empty re-applied foundation schema and is not a canonical store.

The proposed paid staging plan is App Platform `sfo` plus Managed PostgreSQL/Spaces `sfo3`: one $5 web container, one $5 worker container, one $15.15/month PostgreSQL 17 Basic Regular 1 GiB node, and one $5 Spaces Standard subscription. Base estimate: **$30.15/month**, excluding usage overages. No paid resource has been created. Explicit Founder approval is required before provisioning.

Provider-backed Spaces behavior, managed backups/object backup, actual App Platform deployment/rollback, injected-secret handling, staging negative tests, and browser passkey acceptance remain pending. If the plan is approved, work resumes inside Phase 2 using synthetic staging data only; Phase 3 does not begin automatically.

## Status legend

- **Ready:** suitable as-is for the next dependent step.
- **Needs work:** known engineering work, executable now.
- **Blocked:** a prerequisite or product decision prevents safe continuation.
- **Mac validation required:** can be prepared but not accepted outside Apple tooling.
- **Physical device required:** cannot be responsibly accepted on simulator/build evidence alone.
- **Future / Stage 2:** intentionally excluded from Track A.

## Prerequisite dashboard

| Gate | Status | Dependency | Exit evidence | Suggested owner |
|---|---|---|---|---|
| 0. Decision lock | Partially complete | product/operations choices | Provider direction/cost ceiling, recovery/PIN, native cache retention, passive source remediation, TestFlight, compatibility, and web fallback are approved; account/region/operator, object-deletion policy, notification details, Health types, and iOS floor remain gated at their implementation points | Product + platform |
| 1. Founder data/privacy containment | Blocked / critical | Gate 0 | no Founder records in distributable client/source artifact; credential rotation/remediation plan; privacy inventory | Security + backend |
| 2. Authenticated identity boundary | Server lifecycle ready locally; activation blocked / critical | Gate 0 | enrollment, recovery, pairing, passkey server, opaque access/refresh, replay revocation, logout/device revoke, principal, and negative tests exist inactive; browser passkey/staging and current-web integration remain | Backend + iOS security |
| 3. Durable canonical persistence | Foundation adapters proven locally; staging/cutover blocked / critical | Gates 0-1 | PostgreSQL 17.10 up/down/reapply, ownership, transactions, restart, backup/restore, and all foundation stores pass synthetic tests; managed staging, domain schemas/import, and rollback rehearsal remain | Backend/data |
| 4. Private object storage | Provider adapter ready; provider exercise blocked / critical | Gates 1-2 | Spaces multipart/read/inventory adapter and ownership/replay tests exist; real private bucket/versioning, provider checksum behavior, backup/restore, and evidence migration remain | Backend/security |
| 5. Durable downstream work | SQL worker proven locally; staging restart blocked | Gate 3 | claim/lease/retry/dead-letter/heartbeat and restart recovery pass with synthetic PostgreSQL work; managed staging worker and real domain handlers remain | Backend |
| 6. Native-facing contracts | Initial foundation ready; domain surface needs work | Gates 2-5 | common contracts and minimal health/platform OpenAPI are tested; bounded domain read models/commands, fixtures, change feed, and compatibility suite remain | Backend + clients |
| 7. Presentation logic extraction | Needs work | Gate 6 design | Goals/Operating Plan/Evidence orchestration and route mapping callable without React/Next | Domain/web |
| 8. Web cutover to shared boundary | Blocked by 2-7 | Gates 2-7 | web parity tests pass on migrated canonical store; no singleton/file path in production request flow | Web + backend |
| 9. Cross-client correctness | Blocked by 8 | Gate 8 | replay, stale update, simultaneous web/native, partial failure, and invalidation contract tests pass | QA/platform |
| 10. Track A SwiftUI | Blocked by 2-9 | Gates 2-9 | permitted to start only after Pre-iOS exit criteria; then Mac validation required | iOS |
| 11. Share Extension | Future / Stage 2 | Track A + upload receipts | extension/offline/termination contract tests; entitlement and device acceptance | iOS + backend |
| 12. Apple Health | Future / Stage 2 | Track A + Health policy | anchor/dedupe server tests; HealthKit entitlement, SDK, and physical-device acceptance | iOS + domain |
| 13. Notifications/actions | Future / Stage 2 | outbox + policy + API | generic intent engine, APNs/device tokens, suppression/action idempotency; physical-device acceptance | Backend + iOS |
| 14. Native motion/graphs | Future / Stage 2 | Track A read models | accessibility/Reduce Motion fixtures; Xcode and device acceptance | iOS/design |
| 15. Live Workout V1 | Future / Stage 2 | Track A + draft API + Health | complete experience, Windows preview, lifecycle/conflict/device acceptance | Domain + backend + iOS |
| 16. Release operations | Local configuration ready; provisioning approval required | all shipping gates | container/app-spec, manual promotion, build identity, local backup/restore, and cost plan exist; provider deployment/rollback, alerts, managed restore, TestFlight checklist, fallback drill, and daily-driver acceptance remain | Release owner |

## Critical findings that keep the gate closed

### Authentication and private data

- `UserRepository.getCurrentUser()` returns the singleton user, not an authenticated principal (`src/data/repositories/UserRepository.js:3-10`).
- the root layout has no session guard (`src/app/layout.js:19-31`).
- the private evidence route checks only filesystem containment and has no session/user ownership check (`src/app/api/private-evidence/[...path]/route.js:13-35`).
- goal transition explicitly checks a fixed Founder ID (`src/app/goals/transition/review/actions.js:14-16`).
- real Founder seed/state is source-coupled under `src/data/founderSeed/`; the seed version is `founder-seed-v2` (`src/data/founderSeed/index.js:19-20`).
- server-side OpenAI credentials must remain behind server providers (`src/domain/transcription/OpenAITranscriptionProvider.js:3-5`, `src/domain/transcription/OpenAITranscriptionProvider.js:35-40`).

### Persistence and concurrent clients

- the store is a `globalThis` singleton refreshed from a local JSON file (`src/data/repositories/founderRuntimeStore.js:214-221`, `src/data/repositories/founderRuntimeStore.js:334-367`).
- persistence uses filesystem lock/temp replacement and rewrites the runtime document (`src/data/repositories/founderRuntimeStore.js:224-301`).
- append-only merge covers only selected collections (`src/data/repositories/founderRuntimeStore.js:57-73`, `src/data/repositories/founderRuntimeStore.js:303-331`).
- the stronger unit of work declares repository-wide participation false (`src/data/repositories/FounderStoreUnitOfWork.js:34-46`). Selected services use it correctly, including morning check-in and recovery ingestion, but it is not a general concurrency boundary (`src/domain/services/MorningCheckInPersistenceService.js:20-51`, `src/domain/services/RecoveryCheckInIngestionService.js:30-175`).
- EvidenceReview and Reminder repositories retain blind-update paths (`src/data/repositories/EvidenceReviewRepository.js:3-30`, `src/data/repositories/ReminderRepository.js:32-56`).

### Deployment and files

- evidence is stored under local `private/founder` paths (`src/domain/services/EvidenceIntakeService.js:893-915`).
- current remote access is a temporary ngrok workflow explicitly documented as unsuitable for sensitive production data (`docs/REMOTE_MOBILE_TESTING.md:55-88`).
- runtime/deploy scripts contain Windows machine and public tunnel assumptions (`scripts/physiqueosNgrokRuntime.mjs:1-23`, `scripts/deployPhysiqueOS.ps1:17`).
- there is no production notification queue (`docs/NARRATIVE_SCHEDULE.md:31`).

## Ready or reusable foundations

These assets reduce transition risk but do not open the gate by themselves:

- mature pure domain services and a large regression suite;
- lower-level canonical evidence commit with revision/idempotency behavior (`src/domain/services/PILowerLevelCanonicalEvidenceCommitService.js:43-245`);
- persisted post-confirm step ordering/recovery model (`src/domain/services/PostConfirmationOrchestrator.js:1-47`);
- atomic selected workflows through `FounderStoreUnitOfWork` (`src/data/repositories/FounderStoreUnitOfWork.js:55-282`);
- time-zone-aware date/window utility (`src/domain/utils/localDate.js:1-108`);
- Daily Focus evidence suppression logic (`src/domain/services/DailyFocusService.js:71-172`, `src/domain/services/DailyFocusService.js:250-365`);
- briefing precedence and event lifecycle (`src/domain/services/HomeBriefingRoutingService.js:20-76`, `src/data/repositories/DailyBriefingRepository.js:115-176`);
- Live Workout selection/draft/prepopulation and Health reconciliation semantics (`src/app/preview/training-logger/TrainingLoggerPreviewState.js:225-369`, `src/domain/services/TrainingLoggerAppleHealthService.js:88-219`);
- injection-friendly You profile read model (`src/domain/services/YouProfileService.js:1-76`).

## Dependency-ordered work queue

This is the operational summary. The authoritative dependency order, task classifications (`FOUNDATION BLOCKER`, `WINDOWS IMPLEMENTATION`, `WINDOWS VALIDATION`, `WINDOWS PRE-CODE / MAC ACCEPTANCE`, and `MAC/XCODE REQUIRED LATER`), phase exits, and the **READY TO BEGIN NATIVE BASELINE** gate are in `docs/PHYSIQUEOS_NATIVE_V1.md` sections 30-31. If the summaries differ, that detailed roadmap controls.

### Phase 0 — decisions and containment

1. Assign a named release/platform owner.
2. Record approval for the blocking rows in `docs/PHYSIQUEOS_NATIVE_V1.md` section 18; engineering choices are already recommended.
3. Inventory Founder records, files, credentials, logs, backups, and repository history exposure. Decide remediation and rotate affected credentials.
4. Freeze the contract that source seed data is never shipped to iOS and is not a production fallback after migration.

Exit: privacy threat model and data-flow diagram approved; distribution/auth/hosting direction recorded.

### Phase 1 — contracts before implementation

Checkpoint: the bounded common-contract and foundation-schema subset is implemented and validated inactive. The broader domain contract map and real isolated PostgreSQL verification remain required; Phase 1 completion does not satisfy any production-activation gate by itself.

1. Define canonical user/resource/occurrence IDs and per-resource versions.
2. Define the command envelope, idempotency receipts, conflict/error vocabulary, local-date/time-zone contract, and audit event fields.
3. Define typed destination IDs and web/native mappings.
4. Specify mobile read models, pagination, ranges, media renditions, cache validators, and freshness.
5. Build shared schema fixtures/golden payloads for TypeScript and eventual Swift.

Exit: schema tests pass and no contract exposes repositories, runtime snapshots, server paths, or provider secrets.

### Phase 2 — canonical platform

Checkpoint: production-grade foundation adapters and local PostgreSQL durability are complete. The phase is deliberately paused before paid provisioning; provider-backed staging acceptance is still part of Phase 2 and must complete before Phase 3 extraction begins.

1. Add authenticated enrollment/session/revoke/profile boundary.
2. Add transactional database schema and uniqueness/version constraints.
3. Add private object storage, upload receipts, authorized delivery, quotas, and retention.
4. Add durable job/outbox processing and redacted observability.
5. Add encrypted backup and restore automation.
6. Adapt domain/application services to ports over the new persistence layer.

Exit: destructive-free migration rehearsal, restart recovery, auth negative tests, and restore drill pass.

### Phase 3 — extraction and web parity

1. Extract Home/Goals/Operating Plan/Progress/Confidence/Briefing read-model composition from presentation coupling.
2. Extract Evidence Review commands/orchestration from the Next action while preserving behavior.
3. Normalize Check-in/Weight/Goal/Plan/Protocol writes behind versioned command handlers.
4. remove raw UTC date fallbacks in user-day commands; use one request time-zone context (`src/app/log/actions.js:130`, `src/app/evidence/photos/actions.js:518`, `src/app/evidence/dexa/actions.js:198`).
5. Migrate Founder data/files with checksums, relationship validation, parity snapshots, cutover, and rollback.
6. Run web entirely against the shared boundary and exercise the fallback drill.

Exit: the web application has full daily-use parity on the durable store; no production request depends on the runtime JSON or private local files.

### Phase 4 — multi-client and Windows preparation

1. Add concurrent web/native-client simulator tests and cache invalidation/change feed.
2. Extract production Training Logger logic from `app/preview`; build the complete Windows interactive prototype against the shared contract.
3. Build notification eligibility/grouping/action engines and Health sync/reconciliation fixtures without Apple adapters.
4. Finalize Track A screen/workflow acceptance checklist and prepared Mac test fixtures.

Exit: all Pre-iOS exit criteria below pass. Significant SwiftUI work may then begin.

### Phase 5 — Track A and Track B

Track A: native shell, secure session, parity read models/writes/evidence/files/offline behavior, simulator/device validation, two-way web parity, TestFlight acceptance.

Track B, independently gated: Share Extension; HealthKit; notifications/actions; motion/graphs; complete Live Workout V1. No partial Live Workout release.

## Files/services requiring pre-iOS change

| Area | Files | Required change |
|---|---|---|
| Identity | `src/data/repositories/UserRepository.js`, `src/app/layout.js`, protected routes/actions | replace implicit singleton identity with authenticated request principal and authorization. |
| Source data | `src/data/founderSeed/**`, `src/data/seed/**` | remove real Founder data from distributable/runtime initialization; retain synthetic fixtures only. |
| Persistence | `src/data/repositories/founderRuntimeStore.js`, `founderRepositories.js`, `createSeedRepositories.js`, repositories | port to transactional, user-scoped durable adapters; add versions/constraints/receipts. |
| Unit of work | `src/data/repositories/FounderStoreUnitOfWork.js` | preserve transaction semantics against real database transactions; cover every canonical multi-write command. |
| Media | `src/app/api/private-evidence/[...path]/route.js`, upload/actions, `EvidenceIntakeService.js` | authenticated object storage/upload receipt/rendition boundary. |
| Evidence review | `src/app/evidence/review/[reviewId]/actions.js`, `EvidenceReviewService.js`, confirmation/orchestrator services | presentation-independent command API, exactly-once confirmation, persistent downstream status. |
| Home | `src/domain/services/HomeBriefingService.js`, `src/screens/HomeScreen.jsx` | portable bounded Home read model without global store/browser route assumptions. |
| Goals | `src/screens/GoalsHubScreen.jsx`, goal screens/actions | extract repository queries/calculations and fixed IDs to canonical read/command services. |
| Operating Plan | `src/app/profile/operating-plan/page.js`, `src/screens/OperatingPlanScreen.jsx` | canonical Plan read model, occurrence/version/completion authority. |
| Progress/PI | `src/domain/services/*EvidenceContextService.js`, `ProgressReportingService.js` | remove default Founder/file dependencies; add mobile series/detail/media APIs. |
| Briefings | `DailyBriefingRepository.js`, cadence/routing/generator services | durable claims/publication, generic availability event, paginated read/lifecycle API. |
| Notifications | `DailyFocusService.js`, reminder/cadence services, empty notification placeholders | canonical occurrence eligibility, intent/outbox, grouping, action authorization and dedupe. |
| Navigation | route strings, `src/navigation/navigationRegistry.js` | exhaustive typed destination registry with web/native/deep-link mappings. |
| Time | upload/evidence/check-in actions and suggestion service | one authenticated-user time-zone context and DST boundary tests. |
| Live Workout | `TrainingLoggerClient.jsx`, `app/preview/training-logger/TrainingLoggerPreviewState.js`, recovery/reconciliation routes/services | shared contract package, server draft/version/replay, production ownership outside preview. |
| Deployment | `scripts/physiqueos*`, ngrok/monitor/deploy scripts, `next.config.mjs` | supported TLS production runtime, secrets, jobs, observability, upload sizing and compatibility. |

## Required regression and contract tests

### Security/privacy

- unauthenticated, expired, revoked, wrong-user, object-ID guessing, and path traversal attempts for every protected endpoint/media object;
- no Founder records, service secrets, server paths, or private media in the iOS artifact, public JS, logs, notifications, crash reports, fixtures, or source release;
- local unlock/session expiry/device revoke/reinstall matrix; cache unavailable before policy permits and erased on sign-out/revoke.

### Canonical writes and concurrency

- identical idempotency key replay returns the original result and creates no duplicate;
- same key/different payload is rejected;
- two simultaneous commands allow at most one non-replay commit where uniqueness applies;
- stale iOS edit cannot overwrite newer web state; local draft survives conflict;
- interrupted multi-write command is atomic or resumes from durable step progress;
- correction/history semantics preserve canonical auditability;
- database constraints cover evidence package, review confirmation, canonical evidence, protocol occurrence, briefing publication, notification action, Health sample, and Live Workout finish identities.

### Evidence/uploads

- upload interruption/resume/finalize replay, duplicate Share/in-app submissions, large/invalid/mismatched media, authorization, metadata policy, retention, and derived rendition;
- review edits use expected version; confirmation is exactly once; restart between each post-confirm step converges;
- same canonical write is visible on web and native read models with matching versions.

### Read models/sync

- golden parity fixtures for Home, Goals, Operating Plan, Priorities, PI, Confidence, every briefing type, You, and Log;
- pagination/range boundaries, ETag/version invalidation, empty/partial/loading/error states, forward-compatible unknown fields and enum values;
- no read model requires a full runtime snapshot or unbounded media payload.

### Time and lifecycle

- DST spring/fall, travel/time-zone change, local midnight, delayed upload, future/late evidence, and server/client clock skew;
- app cold/warm start, background, kill during draft/upload/confirm, low memory, offline/reconnect, build upgrade, and restored deep link.

### HealthKit and notifications

- Health batch replay, anchors, corrections/deletions, multiple sources, authorization denial, late background delivery, workout manual/Health reconciliation, and manual fallback;
- notification schedule/send/action eligibility, evidence suppression, combined unresolved items, generic any-briefing availability, stale action, duplicate tap, wrong device/user, quiet hours, and evidence-required non-completion.

### Cross-client fallback

- iOS write appears on web; web write invalidates/appears on iOS;
- native failure/feature flag does not disable equivalent web/manual workflow;
- old accepted app build remains API-compatible during new-build acceptance;
- database/object backup restore reproduces representative read models and file hashes.

## Apple acceptance queue

### Windows fully safe

- server architecture, persistence, APIs, schemas/DTOs, migration tooling, idempotency/concurrency engines, deterministic notification eligibility, Health reconciliation fixtures, Live Workout state engine/preview, web parity, documentation, and prepared test plans.

### Windows pre-code / Mac acceptance

- platform-neutral Swift DTO/client/state code, SwiftUI view-model design, mock Apple adapters, route registry, design tokens, accessibility identifiers. These are not accepted until built/tested with the selected Xcode and SDK.

### Mac/Xcode required

- Swift package/app compilation, SwiftUI rendering/navigation, simulator behavior, entitlements, signing, Keychain/LocalAuthentication adapters, HealthKit/UserNotifications/BackgroundTasks APIs, Share Extension target, Associated Domains, archive/TestFlight/App Store metadata.

### Physical device required

- Face ID/PIN lifecycle, protected data after lock/reboot, real Health permissions/data/background delivery, APNs delivery/action behavior when terminated, extension behavior from real host apps, background upload/retry, deep links across lifecycle states, haptics/graph scrubbing, Live Workout gym ergonomics and long-session lifecycle, TestFlight install/update.

## Pre-iOS exit criteria

Significant SwiftUI work may begin only when all are true:

- [ ] required approvals in Native V1 section 18 are recorded and a Founder/platform alert owner is named;
- [ ] Founder data/privacy threat model and source-remediation plan are approved; no distributable artifact contains Founder data, private media, provider secrets, or reusable auth credentials;
- [ ] the authenticated user-scoped API, session rotation/revocation, CSRF boundary, and private media authorization pass negative tests;
- [ ] PostgreSQL, private versioned object storage, outbox worker, secrets, health/alerts, flags, and immutable builds are deployed outside the workstation;
- [ ] expected-version, idempotency, transaction, audit/change, outbox restart, and dangerous-workflow constraint suites pass;
- [ ] upload resume/finalize/read/delete authorization and database/object backup-restore drills pass;
- [ ] deterministic migration rehearsal passes on copies without altering production source, including counts, IDs, relationships, semantic digests, and file hashes;
- [ ] versioned OpenAPI schemas, destinations, command receipts, operations, changes, capabilities, pagination/cache, and structured error contracts are stable;
- [ ] all required Track A read models and commands exist without React/Next-only, singleton runtime, or local-file ownership;
- [ ] production web has run successfully for seven daily-use days on the shared canonical platform and remains fully functional with all native flags disabled;
- [ ] replay, lost-response, stale-write, concurrent-client, partial-failure, app-kill simulation, and two-way visibility suites pass;
- [ ] accepted/previous native-build compatibility and independent kill switches pass simulated-client tests;
- [ ] Track A daily-use workflow checklist and prepared Mac/simulator/physical-device acceptance plan are approved.

## Current validation evidence

Phase 1 is now implemented as inactive, additive code. The accepted bounded run executed these groups sequentially: focused foundation (9 files / 32 tests), persistence isolation (2 files / 29 tests), and adjacent application services (4 files / 29 tests). All 15 files / 90 tests passed. Targeted lint, production Next.js build, `git diff --check`, and current-runtime smoke checks passed. No unresolved deterministic product or foundation regression remains.

Failures encountered and disposition:

- One new error-contract assertion expected an error title where the implementation correctly exposed the detail as the JavaScript `Error.message`: **test fixture/assertion defect**, corrected in the test.
- New route tests initially relied on a Vitest-unconfigured `@/` alias: **test-harness/module-resolution defect**, corrected by using relative imports in only the new routes.
- The first reusable harness run passed all tests/lint but Windows returned `EINVAL` while spawning `npm.cmd` for the build: **test-harness defect**, corrected by invoking the local Next CLI through Node.
- The earlier unrestricted all-files run exceeded the 4 GB worker heap after approximately ten minutes and surfaced concurrently observed production-state tests: **environment/resource failure plus test-order/concurrency contamination**. No individual result from that run is treated as a regression without bounded deterministic reproduction, and no bounded reproduction failed.
- Full repository lint previously exceeded the available command window without producing an error: **environment/tool-duration limitation**. Targeted lint over the complete changed surface is the accepted result for this patch.

The runtime checkpoint was revision `107`, size `25,964,481` bytes, modified `2026-08-11T13:46:05.401Z`, SHA-256 `4FBE7875B334ACAE0199AAE223729E75AC4AC89D96EA7CAF830BF9B8F69CDCA1` both before and after the final harness. No stale Vitest/Jest/test-worker process attributable to the failed run remained, and no process was terminated. Existing production Node processes were left untouched.

The implementation did not provision infrastructure, migrate or activate PostgreSQL, activate authentication, move evidence, alter canonical persistence, cut over the web, create iOS code, or claim Apple validation. Xcode, simulator, device, HealthKit, notification, Share Extension, signing, real-database migration, provider object storage, worker restart, backup, and restore status remain unvalidated.

Phase 2 supersedes the final sentence only for local foundation evidence: real isolated PostgreSQL migration, local restart/durability, and local database backup/restore are now validated. Provider-backed staging and every Apple item remain unvalidated.

Phase 2 bounded suites currently comprise Phase 1 foundation (9 files / 32 tests), Phase 2 foundation/security/operations (7 files / 42 tests), persistence isolation (2 files / 29 tests), adjacent application services (4 files / 29 tests), plus the standalone destructive-guarded PostgreSQL cycle. The reusable `npm run validate:phase2` command runs these serially with targeted lint, production build, `git diff --check`, and Founder runtime hash comparison.

Phase 2 encountered and resolved:

- **deterministic foundation regression:** restore initially placed the database URL in process arguments; credentials now travel only through the child environment;
- **deterministic foundation regression:** refresh-reuse family revocation initially occurred in a transaction that then threw and would roll back; revocation now commits before the 401 is raised, and the real database test proves persistence;
- **deterministic backup regression:** `pg_dump` initially failed to honor a full URL in `PGDATABASE` on Windows; both backup and restore now use parsed libpq environment variables and the nondefault port is proven;
- **test-harness defect:** standalone Node could not resolve extensionless Phase 2 database imports; standalone execution paths now use explicit `.js` resolution;
- **test fixture defect:** an ownership probe first hit the intended one-upload-per-object uniqueness constraint; a distinct synthetic object now reaches and proves the owner constraint;
- **test fixture defect:** one object-service fake transaction runner returned a non-Promise; it now models the asynchronous production runner;
- **environment/network constraint:** the first sandboxed npm dependency download timed out; the approved network retry succeeded;
- **unrelated existing warning:** production build still reports the known broad filesystem trace from `EvidenceIntakeService`/the existing upload route.

No deterministic product or foundation regression remains. The current Founder runtime checkpoint remains revision `107`, size `25,964,481` bytes, SHA-256 `4FBE7875B334ACAE0199AAE223729E75AC4AC89D96EA7CAF830BF9B8F69CDCA1`.

Final documentation-complete acceptance confirmed that exact Founder checkpoint. The pre-existing production server continued returning 200 for `/`, `/log`, and `/api/health`. A temporary isolated server from the new production build returned 200 for those routes and `/api/v1/health/live`, while inactive `/api/v1/health/ready` and `/api/v1/platform` correctly returned 503; the temporary server was then stopped and its logs removed.
