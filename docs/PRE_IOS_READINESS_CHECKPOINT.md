# Pre-iOS Readiness Checkpoint

Status: active operational gate

Last audited: 2026-08-10

Audited revision: `f6944940232a`

Foundation design: complete and recommended 2026-08-10; implementation remains gated by the explicit approvals and exit evidence below

Companion decision record: `docs/PHYSIQUEOS_NATIVE_V1.md`

## Executive checkpoint

**Classification: BLOCKED for significant SwiftUI; READY for Windows-first foundation work.**

The production behavior is rich and well tested, but the current runtime is not a secure shared-client platform. The critical path is authentication/authorization, canonical persistence, private object storage, application APIs, and cross-client correctness. No production data was changed during this audit.

Observed read-only runtime checkpoint on 2026-08-10:

- runtime schema/version: `founder-seed-v2`
- persisted revision: `104`
- updated at: `2026-08-10T20:54:10.693Z`
- runtime file size: approximately 25.8 MB
- audited source: 1,389 files under `src`, including 498 test files and 95 page/route files

The prior checkpoint’s lower runtime revision was stale, so operational status must never be inferred from an old document. Runtime record contents and credentials are intentionally omitted.

## Foundation decision snapshot

The repository-grounded recommendation is now concrete. Full rationale, contracts, schema families, migration rules, approvals, and implementation file inventory are canonical in `docs/PHYSIQUEOS_NATIVE_V1.md` sections 18-32.

```text
production web + /api/v1 (one Next.js modular monolith)
                 -> authenticated application handlers
                 -> PostgreSQL 17 canonical state + private object storage
                 -> transactional outbox -> same-build background worker
future iOS ------/
```

- **Runtime:** DigitalOcean App Platform in an approved US region, one immutable build with web and worker process types, Managed PostgreSQL 17, and a private versioned DigitalOcean Space. Start with one web instance during foundation validation and move to two before iOS daily-driver acceptance. Provider/account/region/budget and operator approval are still required.
- **Persistence:** relational/JSONB bounded PostgreSQL schema; legacy IDs preserved as text, new IDs use UUIDv7 strings; `user_id` on every owned record; bigint aggregate versions; explicit SQL migrations; no runtime snapshot table.
- **Concurrency:** optimistic version checks, unique idempotency receipts with request hashes, database constraints, atomic multi-record commands, stable occurrence/source identities, and a durable transactional outbox. Stale state is rejected, never silently overwritten.
- **Files:** database-owned opaque object identity, private S3-compatible bytes, direct resumable uploads with verified receipts, five-minute authorized reads, versioning plus an independent backup copy. Filesystem paths and permanent URLs leave client contracts.
- **Authentication:** server-created Founder user, web passkey, authenticated web-issued one-time iOS pairing code, revocable device sessions, 10-minute access token, rotating refresh credentials. Face ID/eight-digit PIN only unlock local credentials; forgotten/locked PIN requires re-enrollment.
- **API:** REST/JSON `/api/v1`, OpenAPI 3.1, bounded read models and task commands, cursors/ETags/typed destinations/operations/change feed, RFC 9457-style errors, additive compatibility for current and previous accepted build for at least 180 days.
- **Cutover:** deterministic rehearsals on copies, compatibility release, short read-only final fence targeted below 10 minutes (automatic abort at 15 before a database write), complete snapshot/file verification, then web becomes the first production shared-platform client. No production dual-write.
- **Offline:** seven-day protected read cache and narrow safe command queue; sensitive edits/confirmation require live state. Live Workout later uses one editor lease and versioned durable autosave.
- **Stage 2 foundation:** create occurrence/outbox, Health source/checkpoint, notification-intent, and workout-draft identities/contracts on Windows; do not implement HealthKit, APNs presentation, or SwiftUI in this phase.

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
| 0. Decision lock | Blocked (design complete; approvals pending) | product/operations choices | approve the rows explicitly marked in Native V1 section 18 that affect provider/cost, auth recovery, privacy/retention, distribution, and source remediation | Product + platform |
| 1. Founder data/privacy containment | Blocked / critical | Gate 0 | no Founder records in distributable client/source artifact; credential rotation/remediation plan; privacy inventory | Security + backend |
| 2. Authenticated identity boundary | Blocked / critical | Gate 0 | enrollment/session/revoke endpoints; every protected read/write/media request derives Founder from session; negative auth tests | Backend + iOS security |
| 3. Durable canonical persistence | Needs work / critical | Gates 0-1 | transactional database, user-scoped schema, revisions/idempotency constraints, migration/rollback rehearsal | Backend/data |
| 4. Private object storage | Needs work / critical | Gates 1-2 | authorized uploads/renditions, stable receipts, size/content policy, encrypted backup/restore | Backend/security |
| 5. Durable downstream work | Needs work | Gate 3 | evidence/briefing/notification work survives restart, records progress, retries idempotently, observable failures | Backend |
| 6. Native-facing contracts | Needs work | Gates 2-5 | versioned schemas for read models, commands, errors, destinations, pagination/cache, generated/validated fixtures | Backend + clients |
| 7. Presentation logic extraction | Needs work | Gate 6 design | Goals/Operating Plan/Evidence orchestration and route mapping callable without React/Next | Domain/web |
| 8. Web cutover to shared boundary | Blocked by 2-7 | Gates 2-7 | web parity tests pass on migrated canonical store; no singleton/file path in production request flow | Web + backend |
| 9. Cross-client correctness | Blocked by 8 | Gate 8 | replay, stale update, simultaneous web/native, partial failure, and invalidation contract tests pass | QA/platform |
| 10. Track A SwiftUI | Blocked by 2-9 | Gates 2-9 | permitted to start only after Pre-iOS exit criteria; then Mac validation required | iOS |
| 11. Share Extension | Future / Stage 2 | Track A + upload receipts | extension/offline/termination contract tests; entitlement and device acceptance | iOS + backend |
| 12. Apple Health | Future / Stage 2 | Track A + Health policy | anchor/dedupe server tests; HealthKit entitlement, SDK, and physical-device acceptance | iOS + domain |
| 13. Notifications/actions | Future / Stage 2 | outbox + policy + API | generic intent engine, APNs/device tokens, suppression/action idempotency; physical-device acceptance | Backend + iOS |
| 14. Native motion/graphs | Future / Stage 2 | Track A read models | accessibility/Reduce Motion fixtures; Xcode and device acceptance | iOS/design |
| 15. Live Workout V1 | Future / Stage 2 | Track A + draft API + Health | complete experience, Windows preview, lifecycle/conflict/device acceptance | Domain + backend + iOS |
| 16. Release operations | Needs work | all shipping gates | immutable builds, compatibility/rollback, TestFlight checklist, fallback drill, monitoring, explicit daily-driver acceptance | Release owner |

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

1. Define canonical user/resource/occurrence IDs and per-resource versions.
2. Define the command envelope, idempotency receipts, conflict/error vocabulary, local-date/time-zone contract, and audit event fields.
3. Define typed destination IDs and web/native mappings.
4. Specify mobile read models, pagination, ranges, media renditions, cache validators, and freshness.
5. Build shared schema fixtures/golden payloads for TypeScript and eventual Swift.

Exit: schema tests pass and no contract exposes repositories, runtime snapshots, server paths, or provider secrets.

### Phase 2 — canonical platform

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

The audit and foundation-design phase performed read-only source/runtime inspection and documentation-only edits. It selected a recommended architecture and migration sequence but did not alter production data, refactor production source, provision infrastructure, implement persistence/API/auth, create iOS code, or claim Apple validation. Xcode, simulator, device, HealthKit, notification, Share Extension, and signing status remain unvalidated.
