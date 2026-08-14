# Pre-iOS Readiness Checkpoint

Status: active operational gate

Last audited: 2026-08-12

Accepted inactive-safety source: `e3b4f4505e9c2b5598901b002271933f45c24dbf`; production build: `HasDoRm5cgRE0FsXZU1Uu`; retained rollback build: `RmjN47V8xsq3-6jSlZh-9`

Foundation design: Phases 1-6 plus the executable write-fence/production-wrapper source, published checkpoint, inactive production deployment, provider observability, control-inclusive encrypted recovery, and the 35-day minimum retention policy are accepted. Production migration remains separately gated by exact-window approval and a final explicit go/no-go. Founder-stage operational ownership is approved.

Companion decision record: `docs/PHYSIQUEOS_NATIVE_V1.md`

## Executive checkpoint

**Classification: BLOCKED for significant SwiftUI; READY for Windows-first foundation work.**

The production behavior is rich and well tested, but the current runtime is not a secure shared-client platform. The critical path is authentication/authorization, canonical persistence, private object storage, application APIs, and cross-client correctness. No production data was changed during this audit.

Current production runtime checkpoint after the Founder's legitimate Aug 11-12 logging activity and Phase 6 compatibility deployment:

- runtime schema/version: `founder-seed-v2`
- persisted revision: `119`
- updated at: `2026-08-12T16:02:21.133Z`
- runtime file size: `26,955,008` bytes
- SHA-256: `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`
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

The current production web application still uses the existing canonical JSON/file runtime. DigitalOcean staging is synthetic and independent; no authentication gate was activated on production and no Founder evidence was moved. Production composition remains inactive while the dedicated staging foundation reports provider readiness.

Bounded validation on 2026-08-11 passed 15 test files / 90 tests, targeted lint, the production build, `git diff --check`, and smoke checks for `/api/health`, `/`, and `/log`. PostgreSQL/Docker was not available, so the migration has structural up/down coverage but still requires a real isolated-database integration test before activation.

The Windows worker environment has a 4 GB heap constraint. Unrestricted repository-wide concurrent Vitest execution can exhaust that environment and interleave production-state-dependent tests; the observed failed all-files run is classified as an environment/resource failure with test-order/concurrency contamination. It is not an acceptance gate and must not be rerun in that mode. Repository-wide coverage is not waived: future Windows validation must run explicit serial or tightly bounded groups, isolating production-state-dependent suites. `npm run validate:foundation` is the reusable Phase 1 checkpoint command unless the environment changes.

## Phase 2 local implementation and provisioning gate

**Local and provider-backed synthetic staging acceptance passed.** Phase 2 added PostgreSQL adapters for every foundation table, a second ownership/security migration, inactive Founder enrollment/session/recovery/passkey flows, a Spaces-compatible private-object adapter, a durable SQL outbox worker, async operational readiness, guarded backup/restore tools, and repository-owned DigitalOcean/container configuration.

Real PostgreSQL 17.10 validation ran on local port `55432` against synthetic-only guarded database `physiqueos_phase2_test`. Fresh migration, schema/constraints, transactions, idempotency uniqueness, receipt/outbox atomicity, authentication and refresh-reuse revocation, object relationships, restart persistence, expired-lease recovery, non-repeat of completed work, verified `pg_dump`/`pg_restore`, full down, and re-apply passed. The final local database is an empty re-applied foundation schema and is not a canonical store.

The proposed paid staging plan is App Platform `sfo` plus Managed PostgreSQL/Spaces `sfo3`: one $5 web container, one $5 worker container, one $15.15/month PostgreSQL 17 Basic Regular 1 GiB node, and one $5 Spaces Standard subscription. Base estimate: **$30.15/month**, excluding usage overages. No paid resource has been created. Explicit Founder approval is required before provisioning.

Provider-backed PostgreSQL, Spaces, App Platform deployment/rollback, encrypted-secret handling, staging negative tests, worker restart, and isolated database/object backup-restore are accepted. Browser/device passkey UX and all Apple validation remain pending. Phase 3 does not begin automatically.

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
| 0. Decision lock | Partially complete | product/operations choices | Provider account, regions, cost ceiling, recovery/PIN, native cache retention, passive source remediation, TestFlight, compatibility, and web fallback are approved; named alert/operator ownership, object-deletion policy, notification details, Health types, and iOS floor remain gated at their implementation points | Product + platform |
| 1. Founder data/privacy containment | Blocked / critical | Gate 0 | no Founder records in distributable client/source artifact; credential rotation/remediation plan; privacy inventory | Security + backend |
| 2. Authenticated identity boundary | Provider staging lifecycle accepted; production activation blocked / critical | Gate 0 | synthetic enrollment/recovery/pairing/passkey server/access-refresh/revoke/PIN negatives pass on provider PostgreSQL; browser/device passkey and production-web integration remain | Backend + iOS security |
| 3. Durable canonical persistence | Foundation provider staging accepted; domain migration/cutover blocked / critical | Gates 0-1 | PostgreSQL 17 provider up/down/reapply, ownership, transactions, restart, backup/isolated restore, semantic digest, and rollback pass; domain schemas/import and production cutover remain | Backend/data |
| 4. Private object storage | Provider staging accepted; production evidence migration blocked / critical | Gates 1-2 | private versioned Spaces multipart/read/hash/inventory/authorization/replay/abort/tombstone and restore verification pass; evidence migration and independent backup copy remain | Backend/security |
| 5. Durable downstream work | App Platform worker staging accepted; domain handlers blocked | Gate 3 | managed worker claim/lease/retry/dead-letter/heartbeat/restart/no-repeat pass with synthetic PostgreSQL work; real domain handlers remain | Backend |
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
| 16. Release operations | Provider staging deployment/rollback accepted; production release blocked | all shipping gates | foundation-only container, streamed encrypted spec, manual promotion, build identity, provider restore and rollback pass; named alerts, production fallback drill, TestFlight checklist, and daily-driver acceptance remain | Release owner |

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

Checkpoint: production-grade foundation adapters, local PostgreSQL durability, and provider-backed synthetic staging are complete. Phase 2 is accepted; Phase 3 extraction requires separate authorization and must preserve production isolation.

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

Phase 2 supersedes the final sentence for foundation evidence: real isolated PostgreSQL migration, provider-backed PostgreSQL/Spaces, App Platform web/worker, restart/durability, encrypted secrets, backup/restore, rollback, and security negatives are validated with synthetic staging data. Every Apple item remains unvalidated.

Phase 2 final bounded suites comprise Phase 1 foundation (9 files / 33 tests), Phase 2 foundation/security/operations (9 files / 52 tests), persistence isolation (2 files / 29 tests), adjacent application services (4 files / 29 tests), plus destructive-guarded PostgreSQL/provider cycles. The reusable `npm run validate:phase2` command runs these serially with targeted lint, production build, `git diff --check`, and Founder runtime hash comparison.

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

## Phase 2 provider-backed staging acceptance — 2026-08-11

This section supersedes earlier Phase 2 provisioning-pending statements. Provider-backed synthetic staging passed on the dedicated `phase2-provider-staging` branch; `origin/main` remained `403107d14056868194b59861cc55e9f37c9ac6a1`.

- Provisioned one `sfo` App Platform app with one 512 MiB web and one 512 MiB worker, one `sfo3` PostgreSQL 17 Basic Regular 1 GiB/1 vCPU cluster, and one `sfo3` private versioned Space. Exact safe IDs and operations are in `infra/digitalocean/README.md`. Base recurring cost is $30.15/month; the $50 ceiling is intact.
- Deployed foundation-only build `phase2-provider-staging-5517689`; final deployment `18151768-20b2-482a-adbe-169d06bd32c4` reports green configuration/database/schema/object/worker status. Product `/` and `/log` are absent in staging; operations authentication rejects missing/wrong tokens.
- PostgreSQL migrations, schema constraints/indexes/ownership, transactions, replay/idempotency, optimistic concurrency, strict provider CA, restart, down/reapply, dump, isolated restore, and semantic verification passed.
- Synthetic auth passed enrollment, peppered recovery, device/session/pairing, ten-minute access, 30/90-day refresh boundaries, replay-family/device/session revocation, replacement recovery without canonical deletion, passkey server lifecycle/owner negatives, and ten-failure PIN recovery. Browser/device passkey and Apple authentication were not claimed.
- Private Spaces passed private/versioned configuration, bucket-scoped runtime credentials, opaque owner keys, multipart, actual byte-derived SHA-256/length/MIME verification, replay/concurrent completion, expired/unsigned/cross-owner denial, abort cleanup, tombstone, inventory, and restored hashes. Two intentional fixture versions remain; obsolete failed-run versions were removed.
- The App Platform worker passed success, three-attempt bounded retry, redacted dead-letter, restart-surviving work, heartbeat recovery, lease recovery, `SKIP LOCKED`, graceful stop in the provider harness, and completed-work no-repeat.
- Rollback validation was valid, prior deployment health/provider state remained green, and the accepted build was restored without canonical synthetic state loss.
- Backup/restore matched database semantic digest `0969c9a7390ed775f5adb6abbdb036c4185568691b5bafce6e4d3022be945e30`, manifest digest `47fdf5ebc37394405b6bff7c4f278fa11236a81000b7293ceedd901cc811b2d9`, counts, IDs, relationships, migration metadata, inventory, and two object hashes. The local dump and temporary restore database were removed.

Provider acceptance found and fixed deterministic CA override, PostgreSQL receipt mapping, PostgreSQL dead-letter typing, and metadata-trusted object checksum defects before acceptance. Failed verification now deletes the provider version and records a terminal failed intent; interrupted multipart upload has an owner-scoped abort path. The public DigitalOcean ingress translates the handler's deliberate `/api/v1/platform` 503 into a provider 504/503 page; the API remains inactive and the direct handler contract still proves the intended 503 response.

Final bounded validation: Phase 1 9 files/33 tests, Phase 2 9 files/52 tests, persistence 2 files/29 tests, adjacent services 4 files/29 tests, guarded provider PostgreSQL cycles, targeted lint, production build, diff, staging/production smoke, worker restart, and rollback all passed. The known existing Turbopack whole-project trace warning remains. Production audit remains 13 pre-existing advisories (3 moderate, 10 high, 0 critical), with zero new dependencies/advisories from provider acceptance.

Founder integrity was identical before and after the final harness: `founder-seed-v2`, revision `109`, updated `2026-08-11T16:26:17.843Z`, 26,298,071 bytes, SHA-256 `11C73237AB5F8D19738762ED25C45293D539852B70442AF990A2A7266E560188`. Production `/`, `/log`, and `/api/health` returned 200. JSON/file persistence remains canonical; production evidence/auth/worker/routes do not use staging.

Phase 2 classification: **accepted for provider-backed synthetic staging only**. Phase 3 is the next dependency-ordered phase but remains separately gated. Run the end-work-session task before requesting Phase 3. No Founder migration/cutover/evidence move/auth activation, Native Baseline, SwiftUI, HealthKit, APNs, Share Extension, or Live Workout Stage 2 work is authorized by this acceptance.

## Phase 3 application boundary â€” 2026-08-11

Phase 3 was implemented on `phase3-application-boundary` from exact accepted Phase 2 checkpoint `bbb96894dde752d1ffd7e655a3e58a4aedd77f31`. The workflow inventory and contract details are canonical in `docs/PHASE3_APPLICATION_BOUNDARY.md`.

Implemented pre-iOS boundary work:

- principal-required versioned read envelopes for Home, Log, Evidence Review, Goals, Operating Plan, Priorities, Progress Intelligence, Confidence, generic briefings, Training and You/profile;
- task command dispatch for weight/check-in, evidence intake/review, priority/reconciliation, protocol, Goal, TrainingSession/Logger and nutrition/photo/DEXA confirmation, using UUIDv7 identity, idempotency, expected version where mutable and correlation propagation;
- a typed destination registry with web mapping and fail-fast unmapped-link validation;
- an owner-local, half-open calendar-day contract with deterministic Los Angeles DST tests;
- an owner-authorized five-minute media descriptor with path-hiding local-file and future Spaces adapters;
- generic briefing publication/list/detail contracts, server-owned Confidence output and Training history/detail/library/recent/comparable/suggestion boundaries; and
- bounded parity activation of Goals Hub, Log/day and Operating Plan web composition only. CSS, icons, layout and presentation formatting remain React-owned.

The only new API route is protected `/api/v1/capabilities`. Production auth remains deliberately inactive, so the route returns a structured 503 and reveals neither Founder data nor canonical-runtime details to an unauthenticated request. Domain endpoints were not speculated before authenticated transport composition exists.

Intentional read DTO differences are limited to stable icon keys instead of React components, typed destinations instead of raw hrefs, omission of server implementation fields, and added version/ETag/freshness metadata. Current ordering, labels, Goal/phase semantics, priority eligibility, evidence state, briefing publication behavior, Confidence source/value/explanation, Training history/comparison and date interpretation remain canonical-domain owned.

Production isolation is unchanged: current production remains pinned to `dee69adb366b386d4f2e4999d688532f37fc37e8`; JSON/file data and local evidence remain canonical; no migration, PostgreSQL cutover, Spaces evidence move, auth activation or DigitalOcean staging mutation occurred. Phase 3 does not satisfy the pre-iOS exit criteria by itself. Phase 4 remains an explicit separate authorization gate.

Final bounded acceptance passed 38 files / 216 tests: Phase 1 9 files/34 tests, Phase 2 9/52, Phase 3 9/44, persistence isolation 2/29, adjacent services 4/29, production Confidence parity 1/6, and extracted web regressions 4/22. Targeted lint, isolated production build, diff check, and isolated smoke passed. The isolated build returned 200 for `/`, `/log`, `/goals`, `/profile/operating-plan`, and `/api/v1/health/live`; protected capabilities returned the intended 503 while auth is inactive. Current pinned production remained 200 on `/`, `/log`, and `/api/health`.

Founder integrity remained exact: revision `110`, updated `2026-08-12T02:05:50.820Z`, 26,402,081 bytes, SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D`. This is the fresh post-user-activity baseline, and no validation step mutated it.

Failure disposition is complete. One generic-briefing `unknown` fallback was a deterministic new boundary defect and was corrected. React source-string tests became extraction-aware fixture corrections. Disabled PowerShell npm scripts were an environment-shell issue. A non-acceptance grouped legacy run reproduced the known 4 GB heap limit, stale protocol-reconciliation fixture text, and a current-state Retatrutide assumption; those were classified as environment/resource, unrelated pre-existing fixture, and production-state-dependent respectively. The accepted serial harness avoids that contamination. The known existing Turbopack whole-project trace warning remains. No deterministic Phase 3 product/foundation regression is unresolved.

Phase 3 classification: **accepted as an additive, production-isolated application-boundary and bounded web-parity checkpoint.** This does not authorize branch push/merge, production deployment, Phase 4, persistence migration, evidence transfer, auth activation or Apple implementation. Run the end-work-session task before separately authorizing Phase 4.

## Phase 4 persistence rehearsal — 2026-08-11

Phase 4 was implemented on `phase4-persistence-rehearsal` from exact accepted Phase 3 checkpoint `694d3cac7158c3ebdbafcef6a61699be52d5937a`. The detailed design, measurements, rollback proof, and draft production runbook are in `docs/PHASE4_PERSISTENCE_REHEARSAL.md`.

The accepted local-only path maps all 42 canonical collections into ten owner-scoped PostgreSQL domain families with preserved legacy identities, versions, dates, source identity, provenance, relationships, media metadata, and guarded import history. A physically isolated read-only snapshot of revision 110 exported deterministically: 1,220 records, 361 media objects, 271,434,316 media bytes, package digest `ace5c5f1e6cfd3c3b3fe60f3d88920c50703e89e45d552a327e5ca5a0e0bbae8`. No unknown collection was discarded.

Two fresh imports, rollback/reset, and verified backup/restore reproduced database/media digest `63413b01be8e211b9406dfec766ec2b646dd95d07b17416888eea7dc1867ed47`. Golden parity passed 17 read surfaces and all 17 commands. Stale/retry/concurrency, duplicate occurrence/source, interrupted transaction, response-loss replay, ownership, media authorization, path/key non-disclosure, secret-manifest scan, migration down/reapply, and local-object hashes passed. Persistence-independent canonical ETags and the typed legacy daily-briefing destination were corrected after realistic JSONB parity exposed them.

Local timing was under three seconds for each major copy/export/import step; the safe future production write-fence estimate is 2-5 minutes with the existing under-ten-minute target. No write fence, production migration, web cutover, auth activation, evidence move, deployment, or provider change occurred. DigitalOcean recurring cost remains $30.15/month.

Phase 4 classification: **accepted as a deterministic, repeatable, reversible local persistence rehearsal; production remains JSON/file canonical.** Phase 5 is not automatic. Before Phase 5, run the end-work-session task so the implementation, reports, and living documents have a preserved checkpoint. The recommended next phase is a separately approved production-cutover readiness review plus synthetic provider composition validation; it is not Apple implementation and does not itself authorize migration.

Final bounded acceptance passed 38 files / 200 tests plus the guarded PostgreSQL cycle, targeted lint, production build, isolated smoke, diff check, current production smoke, and data/secret scans. Founder revision 110 remained byte-identical at SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D`; no concurrent Founder activity occurred during the final gate. `origin/main`, `origin/phase2-provider-staging`, and `origin/phase3-application-boundary` remained at their accepted commits, and no Phase 4 remote branch was published.

## Phase 5 production-cutover readiness — 2026-08-11

Phase 5 began on `phase5-cutover-readiness` from exact accepted Phase 4 checkpoint `622ba8dd8684c36107dc6c6c49bc39080eb53a4f`. Detailed implementation evidence, the hardened non-executed production runbook, authentication sequence, monitoring plan, backup set, rollback matrix, web/API compatibility contract, lineage recommendation, binary checklist, and authorization packet are canonical in `docs/PHASE5_CUTOVER_READINESS.md`.

Local Phase 5 proof passes: a deterministic package populates all 42 collections with 370 representative synthetic records and three synthetic media objects; PostgreSQL import/validation, all 17 read surfaces, all 17 commands, replay/payload drift/atomicity/concurrency/duplicates/ownership, and isolated backup/restore reproduce exact digests. The implementation adds guarded provider composition and media/worker harnesses without changing client contracts or production composition.

Live provider proof passed on the existing app, one-node PostgreSQL cluster, and private Space with synthetic data only. All 42 collections / 370 records, three versioned media objects / 111 bytes, 17 read surfaces, 17 commands, concurrency/retry, opaque authorized media, provider readiness, real web/worker restart, and isolated backup/restore passed. Clean import was 19.879 s, validation 2.193 s, media 1.910 s, reads 32 ms, commands 3.829 s, backup 2.267 s, backup plus restore 10.207 s, operational readiness 2.133 s, and the actual platform restart 42.829 s. The temporary firewall, restore database, and local dump were removed; no paid resource or key was created.

Readiness classification: **Phase 5 rehearsal/provider evidence accepted; the later final operational audit found missing executable fence/wrapper controls, so production migration is BLOCKED and not authorized; significant SwiftUI remains BLOCKED.** The 2-5 minute estimate remains supported and the ten-minute hard boundary remains, but cannot be used until the fence is implemented and accepted. Production JSON/file state/evidence/auth/deployment are unchanged. No Founder data was uploaded; no production cutover, auth activation, evidence move, write fence, Native Baseline, SwiftUI, HealthKit, APNs, Share Extension, or Live Workout Stage 2 work occurred.

Final Phase 5 bounded validation passed 48 test files / 221 tests, targeted lint, production build, isolated smoke, and diff checks. Founder revision 110, 26,402,081 bytes, and SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D` remained exact. The known Turbopack broad-trace warning remains.
## Phase 6 production compatibility checkpoint (2026-08-12)

Production now runs accepted descendant source `6f4976101cb21eb9d3a7e28ee9a960fcf34141c7`, build `RmjN47V8xsq3-6jSlZh-9`, against the unchanged canonical JSON/file runtime. The refreshed legitimate Founder checkpoint is revision `119`, `26,955,008` bytes, updated `2026-08-12T16:02:21.133Z`, SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281`; it includes the Aug 11 Activity/Nutrition/Workout Logger activity and Aug 12 weight and remained byte-identical across validation and deployment.

Bounded Phase 1-6, Training, Photo, ownership, persistence-isolation, lint, build, local/LAN/public routes, 24 static assets, authorized media, and fail-closed inactive-provider/auth checks pass. Full evidence and the updated migration packet are in `docs/PHASE6_COMPATIBILITY_RELEASE.md`.

Readiness classification: **Phase 6 compatibility accepted; canonical migration BLOCKED pending separate named-role approval, verified alert delivery, verified production backup/retention acceptance, exact migration-window approval, and final go/no-go. Native Baseline remains blocked until a later migration plus seven accepted daily-use days.**

## Final operational migration-authorization audit (2026-08-12)

The evidence-backed checklist and authorization packet are in `docs/PRE_IOS_OPERATIONAL_MIGRATION_AUTHORIZATION.md`. Production, Founder revision 119, JSON/file canonical ownership, local evidence, inactive authentication, and the accepted source/build were unchanged. A fresh runtime/media/package/repository/build candidate restored exactly in isolation, and DigitalOcean staging plus its managed PostgreSQL backup were healthy.

Classification remains **BLOCKED**. In addition to user approval of roles, alerts, billing, backup retention, and the exact window, the accepted source lacks the executable write-only fence and production-guarded migration/composition-switch wrapper required by its own runbook. The new private backup copies are local and unencrypted and have no verified off-machine replica. No migration or Native work may begin until those false binary gates are closed and a new published checkpoint is reviewed.

## Executable write-fence checkpoint (2026-08-12)

The Founder/user has approved every recommended Founder-stage operational role. The separately approved source patch now implements and isolated-accepts the durable write fence, explicit legacy/PostgreSQL epoch and composition state machine, central canonical-write interception, clear 503 maintenance behavior, epoch-bound receipts/outbox, guarded operator controls, operational status/audit, strict dry-run/execute wrapper, deterministic pre-first-write abort, and post-first-write forward-repair boundary. See `docs/PRODUCTION_WRITE_FENCE_AND_MIGRATION_WRAPPER.md`.

Two fresh guarded PostgreSQL runs reproduced all 42 collections, 365 media objects, exact validation, 17 read surfaces, representative transactional PostgreSQL write, and post-switch smoke in about 10.6 seconds of fenced time. Import failure returned to legacy; post-first-write failure remained PostgreSQL canonical with writes paused. Production was not deployed or changed.

At source acceptance, readiness remained **BLOCKED** on provider alert/capacity inspection and delivered email, the $40 billing alert, encrypted recovery coverage/key custody, retention, checkpoint publication/inactive deployment, exact migration window, and explicit final go/no-go. Publication and inactive deployment are now closed by the later section below; the other gates remain. Do not start Phase 7 or Native work.

## Inactive operational-safety production acceptance (2026-08-12)

The required End Work Session produced and published exact checkpoint `e3b4f4505e9c2b5598901b002271933f45c24dbf`. Its verified off-machine repository replica is `G:\My Drive\PhysiqueOS Backups\PhysiqueOS_Backup_2026-08-12_16-40-49`, with bundle SHA-256 `BE6686ACE1237AFF1325D8B95B3EB01DBFA55AA42054F451FA207507E5DA0E07` and exact Founder identity snapshot. The later encrypted recovery acceptance adds runtime/media/control, current checkpoint, build, provider, and restore coverage; the Founder accepted the complete retention policy on 2026-08-13.

The exact checkpoint was built once in isolation as `HasDoRm5cgRE0FsXZU1Uu`, smoked without rebuilding, then promoted through canonical stop/atomic replace/start with automatic rollback armed. The old `RmjN47V8xsq3-6jSlZh-9` build remains at `.next.rollback-33020`. A deliberate additional canonical restart preserved the new build and control state.

Production control is version 1 at `private/founder/migration-control.json`: `inactive`, `legacy-json` epoch, `legacy-json` composition, reads/writes enabled, no migration operation, no fence, and no first PostgreSQL write. JSON/file and local evidence remain canonical; PostgreSQL, Spaces, worker dependency, and authentication remain inactive/noncanonical. Founder revision 119 and SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281` remained exact across initialization, deployment, and restart.

All bounded deterministic regressions, safety tests, validator isolation, targeted lint, isolated build/smoke, local/LAN/public route and asset/MIME checks, representative detail routes, and authorized media passed. An in-app browser session was unavailable, so no visual acceptance is claimed. The inactive deployment gate is **CLOSED**; the later provider/recovery section closes alerts, delivery, billing, Spaces, encrypted recovery, and retention. Production migration remains **BLOCKED** on the exact window and final go/no-go. Run End Work Session after accepting these documentation changes; do not start Phase 7 or Native work.

## Provider and recovery gate closure (2026-08-12)

Provider observability and recovery evidence are now accepted in `docs/ENCRYPTED_MIGRATION_RECOVERY.md`. App deployment/domain plus web/worker CPU, memory, and restart alerts are enabled; PostgreSQL CPU/memory/disk alert above 70% for 10 minutes; a two-region Uptime global-down test produced an email the Founder confirmed, and that single credited check now monitors staging readiness. The Founder attested that the account-email billing alert is active at $40. The $30.15/month base and existing resource topology are unchanged.

Spaces remains private/versioned and passed authenticated inventory/readback. PostgreSQL remains online with green dependency readiness, 10 GiB allocation, current managed backup, and active sustained-pressure policies; its app-only firewall was not weakened for operator scraping.

The control-inclusive encrypted archive is 577,876,390 bytes, SHA-256 `D6C4729FA33D83B9A5A080323CB64E143E61839D2F0B0B6D3FE96A1848C93E48`. Matching encrypted copies exist locally and at `G:\My Drive\PhysiqueOS Backups\Migration Recovery 2026-08-12`. Isolated decryption verified the revision-119 runtime, inactive control SHA, all 365 media objects, checkpoint `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e`, accepted/rollback builds, migration manifests/scripts, provider inventory, and runbooks. Key custody is password-manager only; plaintext staging and the temporary DPAPI file were removed.

Binary status: alerts **PASS**; delivery **PASS**; billing **PASS (Founder-attested)**; PostgreSQL capacity protection **PASS**; Spaces **PASS**; encrypted packet/off-machine replica/restore/key custody **PASS**; retention **PASS (Founder-approved 2026-08-13)**; exact window **PENDING**; final go/no-go **PENDING**. Migration remains blocked and Native work remains unstarted.

## Critical final-gate remediation checkpoint (2026-08-13)

Source remediation now closes the code-level portions of the three later NO-GO findings. `scripts/runProductionMigration.mjs` is the single production entrypoint and invokes the accepted orchestrator through the same adapters in dry-run and execution. It validates exact inactive control, application/repository/script commit, build ID, runtime revision/hash, recovery packet, schema, Spaces, collection inventory, provider composition, and independent managed-backup freshness before execution can accept the separately generated exact GO phrase. The live shared repository facade and Phase 3 pages resolve the server-owned legacy/PostgreSQL composition by durable mode plus epoch; legacy remains the default and direct uncomposed PostgreSQL repository writes fail closed rather than fall back or mutate an in-memory snapshot.

Trusted manifest identity now keeps runtime revision/hash, repository commit, application build/source, migration script, package, schema, and operation ID distinct. Import rejects stale/wrong identity before opening a database connection. The stale Phase 3 constant was removed from current-copy tooling. The actual runner passed two complete isolated rehearsals and the required pre-write abort/post-write recovery cases. Bounded Phase 1-6 plus focused migration, persistence, security, provider, Training, and Photo validation passed; isolated build/smoke preserved revision 122, 27,428,694 bytes, SHA-256 `92EE630BD314A6AB6D3F6F66D1B54D441BE508C91E50AB5FFD6A116A02D11D1C`.

The backup-freshness blocker is **CLOSED**: DigitalOcean API v2 independently verified exact cluster `f544596d-594e-4aa4-a0a8-533bda0992c6` online and latest managed backup `2026-08-13T06:54:12.000Z`, age 13.527 hours at `2026-08-13T20:25:48.094Z`, size 0.06846476 GiB, therefore PASS under the 24-hour rule. The remediation source is not checkpointed or deployed; production remains `e3b4f450...` / `HasDoRm5cgRE0FsXZU1Uu`, legacy JSON, with the fence inactive. Run End Work Session, then request exact build/commit interruption and rollback authorization for an inactive compatibility deployment. Do not begin Phase 7 or Native work.

## Windows production-runner entrypoint follow-up (2026-08-13)

The first exact-checkpoint deployment preflight found one additional source blocker: the Windows CLI supplied a raw `C:\...` path to ESM `import()`, so Node rejected the `c:` scheme before any migration adapter or preflight ran. The narrow follow-up uses Node's `pathToFileURL()` through a production-migration-only loader, constrains the concrete adapter to the scripts directory, preserves valid `file:` URLs and package specifiers, and rejects unsupported schemes or filesystem escape.

A spawned actual-CLI regression now proves that Windows paths, spaces, backslashes, relative paths, existing file URLs, missing files, and unsupported schemes behave deterministically. The fixture reaches the accepted runner/orchestrator dry-run with every preflight adapter, no final GO, and zero control transitions. Exact committed-source build, real adapter dry-run, isolated smoke, and production-integrity rechecks remain required before the inactive-deployment classification can become READY. Production remains unchanged and no migration authority is created by this fix.

## Canonical collection inventory contract remediation (2026-08-13)

The real adapter dry-run then reached collection inventory and correctly exposed a historical contract error: Phase 4's reported 42 represented a hydrated runtime package, not 42 persisted JSON collections. All inspected raw accepted snapshots contain 39 required persisted collections. The additional three were introduced into the migration list in `7e99af27af69c912d8d5b6219d2afc4ac3f67618` from `createFounderRuntimeStore` output; `PERSISTED_COLLECTIONS` never owned them and no accepted migration later removed them.

The corrected version-2 inventory classifies `operatingRhythm` as derived/noncanonical code-owned read context, `adaptiveTrustProfile` as future-only/inactive design, and standalone `milestones` as deprecated/retired. There are no optional persisted collections. Export/import covers all 39 mandatory collections, records the three exclusions deterministically, refuses unknown keys or any missing mandatory key, and never fabricates placeholders. Current revision 122 proves 39 expected/39 present, zero optional, three excluded, zero unknown, zero missing mandatory, 1,259 records, 6,612 discovered relationships, and 372 media files. Two exports were byte-identical with manifest digest `38e925320fbba23631d752bc2a06a190b9059ffb506ea9d33b9e72df406a108a` and canonical-state digest `5c4fac66c75a58da1decd1d64d82a5cc8ffbb292381bf88468c24c0262e13818`.

Affected read parity preserves the Founder operating-rhythm context as an application-composition overlay and finds no production adaptive-trust or standalone-milestone reader/writer. The exact-checkpoint Windows CLI dry-run passes the revised inventory plus all prior non-mutating preflight gates. Production remains on the accepted legacy build with inactive fence, legacy JSON epoch/composition, enabled reads/writes, local canonical evidence, noncanonical PostgreSQL/Spaces, and inactive authentication. The remediation is **READY FOR INACTIVE DEPLOYMENT**, subject to separate stop/promote/start authorization; it does not authorize the final pre-fence gate or migration.

## Current-lineage encrypted recovery refresh (2026-08-13)

The final-gate recovery blocker is closed. The old revision-119 / 365-media
packet remains retained but is stale and historical. The replacement captures
revision 122 (27,428,694 bytes; SHA-256
`92EE630BD314A6AB6D3F6F66D1B54D441BE508C91E50AB5FFD6A116A02D11D1C`),
372 media files / 276,646,284 bytes, exact inactive control, source
`4f82619bd03c8f20331a45e126e1cfa79f199d2d`, build
`itQ9UXmsDRPssBzrFTPc5`, retained rollback, package-v2 tooling, current
runbooks, and fresh secret-free provider inventory.

The new encrypted local and Google Drive copies match at 769,020,390 bytes and
SHA-256
`E8E63CACB09F706D8CBD939E3536D3807DF070D67CC8B156448F7548D47AF741`.
Isolated decrypt/restore passed the 6,596-file completeness manifest, every
media hash, runtime/control, Git bundle/`fsck`/current-source reachability,
build/rollback identities, and packet-contained migration-tool smoke. Six
live secret values had zero exact/pattern matches. Temporary plaintext,
decrypted, and DPAPI artifacts were removed; production remained untouched.

Binary recovery status: **PASS / RECOVERY PACKET REFRESH ACCEPTED**. The final
pre-fence gate may be rerun after the required End Work Session checkpoint and
must freshly verify live packet alignment and managed-backup age. Phase 7 and
Native work remain unstarted.

## Provider execution-boundary remediation (2026-08-13)

The final live gate was blocked because the production dry-run was launched
from Windows while PostgreSQL correctly trusted App Platform only. The timeout
was an execution-location defect, not a database-health defect, and no operator
IP was added. Source now supplies a protected one-shot remote dry-run command,
durable operation/outbox execution by the existing App Platform worker,
protected polling status, and a Windows control client. The worker delegates to
the accepted production runner/orchestrator and performs private PostgreSQL,
backup, Spaces, provider-composition, package, and collection-contract checks.

The request schema permits identities and hashes only, enforces Founder as the
configured operator and production as the environment, rejects execution/final
GO and unknown fields, and binds retries to a SHA-256 payload fingerprint.
Provider secrets remain server-side. Direct production-provider validation
from Windows fails with `MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED`.
Database and Space inventories must be identical before and after the remote
run. Unit/synthetic coverage proves authentication, idempotency, payload-drift
rejection, worker replay, client reconnect/polling, identity mismatch, no
control transition, and no provider mutation.

The source does not change the current readiness verdict by itself. The
capability must be deployed inertly to the existing no-cost-increase App
Platform footprint and exercised against the accepted synthetic target before
the final production pre-fence gate can be rerun. Production remains healthy,
writable, and canonical on legacy JSON; no migration is authorized.

## Provider-side dry-run live acceptance (2026-08-13)

The source-only boundary is now deployed and accepted. DigitalOcean deployment
`0d27de79-169a-4fda-a16c-ad868d46b7e4` runs exact checkpoint
`73c612a539ba056e5dd3b0634a80859f83910787` as
`provider-dry-run-73c612a` on the existing one-web/one-worker topology. The
operations 401 was not a server mismatch or revoked credential: the local
DPAPI artifact is a `PSCredential`, and the token must be read from its
protected password field. Correct loading returned 200 while wrong, missing,
stale, and ordinary product credentials remained rejected. No secret value is
recorded here.

Operation `phase6-provider-dry-run-20260814-0330` was submitted once, claimed
durably by the worker, and finished `succeeded` / `READY`. Provider-side checks
proved PostgreSQL 17.10 and schema `000004_phase5_provider_readiness` in
`physiqueos_phase5_test_provider_20260811`, current managed backup
`2026-08-13T06:54:12Z` at age 19.759 hours, and the private/versioned `sfo3`
Space with zero incomplete multipart uploads. The app has no VPC, so the final
database URL uses the provider's public TLS authority from inside App Platform;
access remains restricted by the unchanged sole App trusted-source firewall
rule. Earlier wrong-database, unavailable-private-host, and passwordless-API-URI
attempts failed closed and did not change canonical state.

No-mutation verification passed with identical before/after digest
`d388cca324ed6f45044c6f3256d485e5bc1fb09b5ef9b2507fa62d5d4fc312ae`.
Founder revision 122, 372-media inventory, inactive migration control, recovery
packet, production source/build, legacy JSON canonical mode, and inactive
authentication remained exact. Post-run local and LAN checks passed the full
20-route matrix, 25 current CSS/JavaScript assets and MIME types, authorized
media, and exact production health identity. The previously accepted public
path was not retransmitted during this closeout because the execution
environment blocked sending Founder-facing pages/media through the external
tunnel; this is a privacy constraint, not a product or migration defect.

Classification: **PROVIDER-SIDE DRY-RUN ACCEPTED — READY TO REPEAT FINAL
PRE-FENCE GATE** after End Work Session preserves these documentation changes.
No final GO is granted. Fence activation, migration execution, write pause,
Founder import, PostgreSQL canonical write, Spaces production-evidence move,
authentication activation, Phase 7, and Native implementation remain
unauthorized.
## Combined architecture checkpoint (2026-08-13)

The former persistence-first checkpoint is superseded by the combined App Platform runtime plus PostgreSQL/Spaces cutover architecture in `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`. Readiness now means readiness to deploy the exact full provider product in a **non-authoritative compatibility state**, not readiness to migrate production.

Before any new final GO, the exact checkpoint must be preserved, isolated-built, separately deployed for provider-backed full-product acceptance, capacity and combined timing measured, the recovery packet refreshed/restored, and a fresh drift-sensitive preflight completed. Windows/legacy JSON/local media remain authoritative and writable in the meantime; production control remains inactive and authentication remains inactive. The old GO and its inherited write-pause estimate cannot be reused.

## 2026-08-14 compatibility-remediation gate

The first full-product predeployment build was blocked because tracked root `tmp` contained a Founder-derived runtime snapshot and private briefing PNG that standalone tracing placed in the image. The repaired source removes only the current tracked copies through forward history, adds root-`tmp` Git/Docker/tracing exclusions, final-layer pruning, and a deterministic privacy scanner for product and worker artifacts. Existing Git history is not rewritten.

Migration `000005` now represents compatibility as a distinct non-authoritative state rather than a production state with a flag. Compatibility access requires the exact isolated database and environment, retains Windows public/canonical authority, forbids a production operation and first-write boundary, and is revalidated before web commands, media completion, and worker polling. Live App-spec inspection, isolated database migration/initialization, fresh synthetic import, provider web/worker boot, and deployment authorization remain open gates; no provider or production mutation is recorded by this source remediation.
