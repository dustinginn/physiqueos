# PhysiqueOS Native V1

Status: living canonical transition document

Last audited: 2026-08-12

Foundation design decision: approved for the initial Founder-stage direction; Phases 1-6 are accepted, including live synthetic DigitalOcean provider evidence, the production compatibility release, inactive operational-safety deployment, provider observability, and encrypted recovery acceptance. Production remains on the JSON/file runtime and no migration is authorized. Remaining approvals are recorded in sections 39-43 and the Phase 6 packet.

Accepted inactive-safety source: `e3b4f4505e9c2b5598901b002271933f45c24dbf`; production build: `HasDoRm5cgRE0FsXZU1Uu`; retained compatibility rollback: `RmjN47V8xsq3-6jSlZh-9`

Authority: current production behavior remains authoritative; this document records the approved transition constraints and must change when a material decision changes.

## 1. Readiness verdict

PhysiqueOS is **not ready for significant SwiftUI implementation**. It is ready for a substantial Windows-first preparation program.

The product and much of its domain logic are mature enough to specify a native client. The shared-client foundation is not. The production web application currently obtains an implicit Founder identity, reads and mutates an in-memory singleton, persists that singleton to one JSON file, stores evidence on the local filesystem, and exposes private evidence without an authentication boundary. A native client cannot safely share this model.

The first engineering milestone is therefore not an iOS shell. It is an authenticated, versioned, mobile-appropriate application boundary backed by durable canonical storage. Web must migrate to the same boundary or remain demonstrably equivalent through the same application services. SwiftUI begins only after the baseline contracts, identity model, persistence migration, and concurrency semantics are accepted.

No complete product domain is currently end-to-end safe for simultaneous web and native consumption. Many pure services are reusable, and selected write paths have strong transaction behavior, but the transport, identity, storage, and cross-client guarantees are missing.

## 2. Non-negotiable native principles

1. Web and iOS are clients of one live canonical state. iOS never ships with or initializes from a Founder-data snapshot.
2. The web app remains a fully functional fallback after iOS launch.
3. Strategy, Execution, Evidence, Progress Intelligence, Briefings, Goals, Confidence, and the Operating Plan keep their present ownership boundaries and semantics.
4. Domain decisions remain server-owned. Native may own presentation, local draft state, interaction, and platform adapters; it must not independently calculate canonical PI, Confidence, goal state, briefing eligibility, or evidence effects.
5. Every remotely retried write has an idempotency key. Every update that can conflict carries an expected resource version. Every response exposes the resulting canonical version.
6. Face ID and PIN are local unlock mechanisms, not server authentication. The app still authenticates every server request.
7. Founder health data and service secrets never ship in the downloadable app.
8. Track A establishes boring parity. Track B adds native capabilities only after parity and shared-state acceptance.
9. Apple behavior is not accepted until tested at the appropriate Apple validation level. Windows tests can prove contracts, not entitlement or device behavior.
10. A material deviation from this document must be recorded here and called out explicitly; chat history is not the decision record.

## 3. Current canonical system map

### 3.1 Classification

- **A — reusable now:** portable domain logic or read-model composition that can be retained behind a new boundary.
- **B — boundary needed:** requires an authenticated native-facing read or command API.
- **C — storage work needed:** depends on the singleton JSON runtime or local files and needs durable canonical persistence.
- **D — correctness work needed:** requires idempotency, optimistic concurrency, reconciliation, or multi-client tests.
- **E — product decision needed:** behavior cannot be finalized safely from source alone.

These labels are cumulative. “A” applies to components, not to an entire production workflow today.

### 3.2 Shared dependency spine

Current production:

```text
Next page / React screen / server action / route handler
  -> domain or orchestration service (sometimes logic remains in the UI/action)
  -> FounderRepositories global singleton
  -> in-memory repositories
  -> private/founder/runtime-store.json and private/founder/** files
  -> follow-on analysis, reconciliation, goal evaluation, briefing, or Home refresh
```

Evidence for this spine:

- The current user is the repository singleton rather than an authenticated request principal (`src/data/repositories/UserRepository.js:3-10`).
- repository methods are wrapped around a global runtime refresh (`src/data/repositories/founderRepositories.js:8-58`).
- the store is installed on `globalThis` and refreshed from disk (`src/data/repositories/founderRuntimeStore.js:214-221`, `src/data/repositories/founderRuntimeStore.js:334-367`).
- persistence serializes collections to a local JSON file and uses a filesystem lock/temp replacement (`src/data/repositories/founderRuntimeStore.js:224-301`, `src/data/repositories/founderRuntimeStore.js:932-938`).

Target:

```text
Web client ----\
                -> authenticated, versioned application API
iOS client ----/      -> canonical command/read-model services
                         -> transactional database + object storage
                         -> durable work/outbox + downstream processors
```

### 3.3 Domain and workflow inventory

| Domain | Current read/write chain | Native classification and required boundary |
|---|---|---|
| Home | `src/app/page.js` -> `HomeScreen` -> `HomeBriefingService`; the service reads most repositories, computes training/coaching/goal/focus state, and directly reads the runtime store (`src/domain/services/HomeBriefingService.js:38-116`, `src/domain/services/HomeBriefingService.js:117-182`, `src/domain/services/HomeBriefingService.js:207-290`). | A/B/C. Preserve composition rules, expose one bounded Home read model with revision, freshness, destination IDs, and no raw repository records. |
| Log | `src/app/log/page.js` reads current user, pending reviews, and same-day state (`src/app/log/page.js:14-53`); upload POST performs intake, package save, and review staging (`src/app/log/upload/route.js:24-93`). | B/C/D. Provide log-hub read model, upload-session API, and idempotent intake command. |
| Evidence intake | Upload route -> `EvidenceIntakeService` -> filesystem artifacts -> EvidencePackage -> EvidenceReview. Intake defaults an identity and derives submission IDs from time (`src/domain/services/EvidenceIntakeService.js:27-85`); artifacts are stored under `private/founder` (`src/domain/services/EvidenceIntakeService.js:893-915`). | B/C/D. Authenticated upload receipts, object storage, stable client-generated submission IDs, limits, content validation, retry/resume, ownership checks. |
| Evidence Review | Review screen/action -> `EvidenceReviewService` -> canonical confirmation commit -> `PostConfirmationOrchestrator`. The route action contains broad domain orchestration (`src/app/evidence/review/[reviewId]/actions.js:7-73`, `src/app/evidence/review/[reviewId]/actions.js:103-185`); downstream order is explicit (`src/domain/services/PostConfirmationOrchestrator.js:1-47`). | A/B/C/D. Extract command DTOs from the Next action; retain lower-level transaction and persisted step progress; version every edit and make confirm exactly-once. |
| Weight | Weight/check-in actions -> `MorningCheckInPersistenceService` -> weight/check-in/canonical evidence/analysis/briefing work in one unit of work (`src/domain/services/MorningCheckInPersistenceService.js:20-51`, `src/domain/services/MorningCheckInPersistenceService.js:54-175`). Repository correction is keyed by user/date, not request ID (`src/data/repositories/WeightRepository.js:14-54`). | A/B/C/D. Reuse orchestration; add command idempotency, resource versions, and time-zone-qualified local date. |
| Nutrition | intake/review -> canonical nutrition evidence -> post-confirm analysis/PI. Duplicate nutrition protection exists in the in-memory canonical repository (`src/data/repositories/CanonicalEvidenceRepository.js:180-203`). | A/B/C/D. Define normalized nutrition read/write DTOs and database uniqueness; test replay and corrections. |
| Training history | confirmed canonical evidence -> training context/read models -> Progress and goal evaluation. Context services default directly to Founder repositories (`src/domain/services/TrainingEvidenceContextService.js:1-9`, `src/domain/services/TrainingEvidenceContextService.js:80`). | A/B/C. Expose paginated history and detail read models; do not send the complete runtime store. |
| Live training | training page loads user/history (`src/app/log/training/page.js:8-40`); client owns browser recovery and reconciliation (`src/components/training/TrainingLoggerClient.jsx:70-148`, `src/components/training/TrainingLoggerClient.jsx:198-250`); finish stages Evidence Review. | A/B/C/D/E. See section 11. Stage 2 only. |
| Activity | context service -> canonical activity evidence/PI; default dependency is the Founder repository singleton (`src/domain/services/ActivityEvidenceContextService.js:1-14`). | A/B/C/D/E. Manual parity in Track A; HealthKit anchor, source, correction, and daily aggregation policy in Track B. |
| Photos | action stores uploads under the Founder filesystem and stages review (`src/app/evidence/photos/actions.js:105`); analysis and Photo Event briefing follow confirmation. | B/C/D. Object storage, upload receipts, ownership, metadata stripping/retention policy, paginated thumbnails and signed delivery. |
| DEXA | upload/action -> review -> canonical DEXA -> event narrative and appointment lifecycle. | A/B/C/D. Preserve event semantics; add upload/API/storage boundary and versioned appointment commands. |
| Check-ins/recovery | actions -> morning or recovery ingestion service -> multi-repository unit of work (`src/domain/services/RecoveryCheckInIngestionService.js:13-19`, `src/domain/services/RecoveryCheckInIngestionService.js:30-175`). | A/B/C/D. Good application-service basis; remove Founder/file assumptions and expose versioned commands. |
| Goals | Goals screen queries repositories and computes evaluation/intelligence/confidence itself (`src/screens/GoalsHubScreen.jsx:12-23`, `src/screens/GoalsHubScreen.jsx:62-140`). Goal transition review rejects every identity except a hard-coded Founder ID (`src/app/goals/transition/review/actions.js:14-16`). | A/B/C/D/E. Extract goal hub/detail/edit/transition read models and commands; bind identity at API, not in presentation. |
| Operating Plan | page reads protocols, reminders, contexts, and execution items; screen performs grouping/sorting/schedule mapping (`src/app/profile/operating-plan/page.js:11-26`, `src/screens/OperatingPlanScreen.jsx:142-287`). | A/B/C/D. Create canonical Plan read model and versioned protocol/execution commands. Move presentation-owned domain mapping out of React. |
| Protocols | repositories/services -> Operating Plan, Priority Detail, Daily Focus, notification intent. | A/B/C/D. Stable protocol occurrence IDs, versions, completion authority, schedule/time-zone contract. |
| Priorities/reminders | `DailyFocusService` derives focus and suppression from evidence (`src/domain/services/DailyFocusService.js:71-172`, `src/domain/services/DailyFocusService.js:250-365`); `PriorityDetailService` assembles detail and uses a fixed goal ID (`src/domain/services/PriorityDetailService.js:27-29`). | A/B/C/D. Reuse eligibility rules behind occurrence-based APIs; remove fixed goal coupling. |
| Notifications | reminder models and focus eligibility exist, but cadence notification dispatch is disabled (`src/domain/services/BriefingCadenceRegistryService.js:20-26`, `src/domain/services/BriefingCadenceRegistryService.js:46-98`). No production notification queue exists (`docs/NARRATIVE_SCHEDULE.md:31`). | D/E. Requires canonical intent/outbox, device registration, send-time eligibility, action command, and delivery decision. |
| Progress Intelligence | progress services assemble Weight/Nutrition/Training/Activity/Photos/DEXA from Founder repositories; reporting also reads files (`src/domain/services/ProgressReportingService.js:1-2`, `src/domain/services/ProgressReportingService.js:47`). | A/B/C. Server-owned read models, pagination/ranges, cache validators, media variants; canonical calculations stay server-side. |
| Confidence | goal/Home services calculate canonical confidence and sometimes accept the runtime store directly (`src/screens/GoalsHubScreen.jsx:107-111`). | A/B/C. Expose value, band, explanation, evidence timestamp, and calculation version; native only animates presentation. |
| Briefings | repository implements scheduled claims and event lifecycle (`src/data/repositories/DailyBriefingRepository.js:44-99`, `src/data/repositories/DailyBriefingRepository.js:115-176`); Home routing applies event/monthly/cadence precedence (`src/domain/services/HomeBriefingRoutingService.js:20-76`). | A/B/C/D. Paginated list/detail, stable availability event, lifecycle commands, generic destinations, and durable scheduler/outbox. |
| You/profile | `YouProfileService` is injection-friendly and builds a read model (`src/domain/services/YouProfileService.js:1-29`, `src/domain/services/YouProfileService.js:42-76`), but it describes Apple Health as suggested and reminders as app-visible (`src/domain/services/YouProfileService.js:212-257`). | A/B/C/E. Expose profile/settings/device-session API; update capability state only when implemented. |
| Authentication/identity | app layout has no session guard (`src/app/layout.js:19-31`); current user is a singleton; Founder seed has a fixed ID (`src/data/founderSeed/user.js:4`). | B/C/D/E. Critical blocker. See section 7. |
| Uploads/files | local multipart request -> local filesystem; private evidence GET validates path containment but not identity or ownership (`src/app/api/private-evidence/[...path]/route.js:13-35`). | B/C/D. Critical blocker. Authenticated object delivery, upload receipts, quotas, retention, authorization. |
| Navigation/deep links | screens/actions embed web paths; registry covers only a small subset (`src/navigation/navigationRegistry.js:1-32`). | B/E. Define typed destination IDs, versioned parameters, and mappings for web href, native route, and notification/share destinations. |

## 4. Hidden transition risks

### Critical

- **No request authentication or authorization.** A public tunnel plus an unauthenticated private-evidence route can expose health artifacts. Path containment is not user authorization (`src/app/api/private-evidence/[...path]/route.js:13-35`; `docs/REMOTE_MOBILE_TESTING.md:55-88`).
- **Founder data is source-coupled.** `src/data/founderSeed/` contains the fixed profile and historical health records; seed version is compiled into application source (`src/data/founderSeed/index.js:19-20`). Any native reuse or source distribution must exclude these records.
- **Single-host file persistence.** The runtime is a large JSON document on one Windows host. The runtime singleton and file merge are not a multi-client database (`src/data/repositories/founderRuntimeStore.js:57-96`, `src/data/repositories/founderRuntimeStore.js:224-301`).
- **Generic writes can publish stale collections.** The persistence layer preserves the latest collection only when the mutation names that collection (`src/data/repositories/founderRuntimeStore.js:244-275`); most repositories receive an unqualified `onChange` callback (`src/data/repositories/createSeedRepositories.js:30-107`).
- **Private OpenAI credentials are server secrets.** Provider adapters read `OPENAI_API_KEY` and send it as a bearer credential (`src/domain/transcription/OpenAITranscriptionProvider.js:3-5`, `src/domain/transcription/OpenAITranscriptionProvider.js:35-40`). iOS must call server application services, never providers directly.

### High

- **Presentation-owned business logic.** Goals and Operating Plan compute meaningful domain/read-model state in React (`src/screens/GoalsHubScreen.jsx:62-140`, `src/screens/OperatingPlanScreen.jsx:142-287`). Evidence confirmation orchestration is concentrated in a 1,000+ line Next action (`src/app/evidence/review/[reviewId]/actions.js:7-73`).
- **Selective transactional safety.** `FounderStoreUnitOfWork` provides revision checking and atomic replacement for selected workflows, but repository-wide participation is explicitly false (`src/data/repositories/FounderStoreUnitOfWork.js:34-46`, `src/data/repositories/FounderStoreUnitOfWork.js:55-95`).
- **Inconsistent concurrency.** Evidence review exposes a conditional update, but also supports blind create/update (`src/data/repositories/EvidenceReviewRepository.js:3-30`). Reminder completion can overwrite timestamps unless the evidence-specific path is used (`src/data/repositories/ReminderRepository.js:32-56`).
- **Browser-only draft recovery.** Live Workout recovery is localStorage JSON with no server draft, device continuity, or merge contract (`src/domain/services/TrainingLoggerDraftRecoveryService.js:1-23`).
- **Preview/production coupling.** The production Training Logger imports its state engine from `app/preview` (`src/components/training/TrainingLoggerClient.jsx:70`; `src/app/preview/training-logger/TrainingLoggerPreviewState.js:49-91`). Production branches are real, but fixture and production ownership share a module.
- **Timezone drift.** A good local-date utility exists (`src/domain/utils/localDate.js:1-24`), but actions still derive dates from UTC (`src/app/log/actions.js:130`, `src/app/evidence/photos/actions.js:518`, `src/app/evidence/dexa/actions.js:198`) and some routes hard-code Los Angeles (`src/app/log/upload/route.js:22`).
- **Mobile payload and cache contracts are absent.** No public pagination, ETag/version, delta sync, thumbnail, or invalidation contract exists for the composite read models.
- **Hard-coded runtime/deployment.** ngrok and Windows scheduler scripts include machine/path/origin assumptions (`scripts/physiqueosNgrokRuntime.mjs:1-23`, `scripts/deployPhysiqueOS.ps1:17`, `scripts/monitorPhysiqueOS.ps1:18-20`); server actions permit 50 MB payloads (`next.config.mjs:6-8`).

### Medium

- IDs and dates are embedded across Founder fixtures and selected services; for example Priority Detail fixes the primary goal and goal transition fixes the Founder identity.
- some append-only identity fallback is index-based, which is unsafe for concurrent replicas (`src/data/repositories/founderRuntimeStore.js:391-415`).
- `EvidenceIntakeService` uses a time-derived submission ID, which can collide and cannot reliably identify an offline replay (`src/domain/services/EvidenceIntakeService.js:32-41`).
- navigation return state is often encoded in ad hoc URL parameters rather than a shared destination contract.
- health/build metadata is available without authentication (`src/app/api/health/route.js:11-24`). Retain only the minimum public liveness response.

## 5. Canonical data and application boundary

### 5.1 Required server components

1. **Authenticated application API**, versioned independently from UI. JSON schemas/OpenAPI or equivalent must generate/validate TypeScript fixtures and Swift DTOs.
2. **Transactional relational persistence** for identity, goals, protocols, occurrences, evidence metadata, reviews, canonical evidence, briefings, notifications, revisions, and command receipts.
3. **Private object storage** for original evidence and derived media. Objects use opaque IDs; delivery is authorized and short-lived.
4. **Durable work/outbox** for post-confirm processing, Health reconciliation, briefing publication, and notifications. Work state must survive process restart.
5. **Observability and recovery:** structured audit events, redacted logs, health signals, alerting, encrypted backups, restore drill, and migration rollback.

The recommended concrete deployment is recorded in section 19: DigitalOcean App Platform for the web/API and worker, DigitalOcean Managed PostgreSQL 17, and a private versioned DigitalOcean Space. Provider, account, region, budget, and backup-retention approval remain product/operations decisions. The current workstation/ngrok runtime is not the App Store production boundary.

### 5.2 API shape

Use task-oriented resources rather than exposing repositories:

- Session: enroll, exchange/refresh, revoke device, profile, capability state.
- Read models: Home, Log hub, Goals hub/detail, Operating Plan, Priority detail, Progress summaries/series, briefing list/detail, review detail, Training history/session, You/settings.
- Commands: check-in, evidence intake/finalize, review edit/confirm, weight correction, goal/phase transition, protocol/execution completion, briefing lifecycle, notification action, live-workout draft/finish, Health sync batch.
- Media: create upload session, upload parts/background transfer, finalize, obtain authorized rendition.
- Sync: changed-resource feed or per-read-model versions for targeted refresh. Do not download a store snapshot.

Every mutation envelope includes:

```text
commandId          stable UUID generated by the initiating client
idempotencyKey     stable across transport retries
actor/device       established by the authenticated session
expectedVersion    required for edits; omitted only for true creates
clientOccurredAt   informational, never the sole ordering authority
clientTimeZone     IANA identifier
payloadVersion     schema version
```

The server returns `commandId`, outcome (`committed`, `replayed`, `conflict`, `rejected`, `pending`), canonical resource IDs/versions, and downstream-work status. Database constraints enforce user-scoped natural uniqueness and exactly-once command receipts. Do not use timestamps as identities.

### 5.3 Persistence migration

- Take a read-only source snapshot and checksum; never mutate the source during migration.
- Map every collection and private file to a versioned migration manifest.
- Import to a staging canonical store, validate counts, stable IDs, relationships, evidence ownership, hashes, and representative read-model parity.
- Freeze writes for the shortest final cutover window, import the delta, validate, then atomically switch the web application.
- Retain an encrypted rollback snapshot. Never make the app source seed a runtime fallback after cutover.
- Remove real Founder records from tracked source/history distribution according to an explicit credential/data-remediation plan. Repository history treatment is a security decision, not an ordinary cleanup.

## 6. Track A — Native Baseline

Track A is accepted before any Stage 2 feature is exposed. Its goal is faithful daily-driver parity through the shared boundary.

Required:

1. Secure enrollment, Face ID unlock with PIN fallback, authenticated Founder session, device revocation, and safe signed-out state.
2. Five-tab information architecture and all current daily-use destinations through typed `NavigationStack` routes and deep-link IDs.
3. Home, Goals, Operating Plan, Priorities, Progress Intelligence, Confidence, all briefing types/history, and You/profile read models.
4. Check-ins, weight, goal/plan/protocol/execution writes with optimistic concurrency and idempotent retry.
5. Standard in-app evidence upload, review/edit/confirm, canonical downstream processing, and authorized file/media presentation.
6. Nutrition, training, activity, photos, and DEXA manual workflows required for parity.
7. Training history and detail. Live Workout is not included; the existing manual/upload path remains.
8. Safe local cache for non-secret presentation data, protected at rest, bounded in retention, invalidated by server version, and erased on sign-out/device revoke.
9. Offline read behavior and a durable outbox only for commands explicitly designed for safe retry. Conflicts are surfaced; stale state never silently wins.
10. Web/native visibility tests in both directions and a web fallback drill.

Baseline does not include HealthKit, Share Extension, actionable notifications, native motion polish, or Live Workout. Standard upload, manual evidence, and the web client remain available while those enhancements are disabled.

## 7. Founder authentication and privacy model

### 7.1 Current state

- Founder identity is a fixed source record (`src/data/founderSeed/user.js:4`) returned without a session (`src/data/repositories/UserRepository.js:3-10`).
- Founder evidence metadata is in `src/data/founderSeed/`; current mutable state and files are under ignored `private/founder/` storage.
- the private-evidence handler authorizes a path, not a person (`src/app/api/private-evidence/[...path]/route.js:13-35`).
- the app has no middleware/session guard (`src/app/layout.js:19-31`).

### 7.2 Required Founder-only target

```text
first install -> one-time Founder enrollment -> device session issued
later launch  -> local biometric policy -> Face ID -> PIN fallback
request       -> short-lived access credential -> server resolves Founder principal
```

- Enrollment must be restricted (for example a short-lived one-time code or administrator-approved device bootstrap). App possession alone is not identity.
- Store refresh/device credentials only in Keychain. Prefer rotating, revocable refresh credentials and short-lived access tokens. Do not store the PIN or derive server credentials directly from it.
- Use LocalAuthentication for Face ID/passcode policy. An app-specific PIN fallback needs rate limiting, secure verifier storage, lockout, and a recovery/re-enrollment decision.
- The server owns `user`, `device`, `session`, and revocation records even with one Founder. Every row/object is user-scoped now so multi-user later changes authorization policy, not every DTO.
- Cache only data needed for offline presentation. Apply iOS file protection, minimize media caching, never cache provider keys, and redact notifications by user preference.
- On authentication failure, render no protected cached content until local unlock and session validation policy succeeds.

## 8. Evidence ingestion model

Evidence retains the current lifecycle:

```text
receipt -> artifact upload -> parse/interpret -> EvidencePackage
        -> pending EvidenceReview -> user edit/confirm
        -> canonical evidence transaction -> persisted downstream work
        -> PI / goal / briefing / Home projections
```

The lower-level confirmation service and post-confirm step ordering are useful canonical foundations (`src/domain/services/PILowerLevelCanonicalEvidenceCommitService.js:43-245`, `src/domain/services/PostConfirmationOrchestrator.js:1-47`). They must be made storage-agnostic and invoked by the application API, not duplicated in Swift.

Rules:

- Every submission has a stable client UUID and server receipt before expensive interpretation when possible.
- Upload finalization and review creation are idempotent. Package/review/canonical IDs cannot be overwritten across users.
- Confirmation is an exactly-once command with an expected review version. Downstream steps persist progress and can resume after interruption.
- Corrections produce explicit versions/audit history where canonical interpretation changes.
- Files remain private, encrypted, user-scoped, content-validated, size-limited, and delivered through authorization.
- Share Extension and in-app upload enter the same receipt pipeline. The extension never writes canonical evidence directly.

## 9. Apple Health model

Track A remains fully usable without Apple Health. Track B uses HealthKit as an evidence source, never as an alternative canonical store.

Required policy and contracts:

- enumerate read types, optional write types, purpose strings, availability state, and denied/restricted behavior;
- persist anchored-query state per user/device/type and handle changed and deleted samples;
- retain HealthKit UUID/source/bundle/device/metadata needed for deduplication without treating mutable display fields as identity;
- define authoritative source precedence and aggregation for Activity days;
- reconcile Apple workouts with manual/Live Workout evidence by source workout ID and bounded matching, never fuzzy double-counting;
- make every sync batch idempotent and resumable; server canonicalizes local date using the user time zone;
- do not break manual workflows when permission is denied, background delivery is late, or HealthKit is unavailable;
- decide whether PhysiqueOS writes workouts to HealthKit. Default for V1 should be read/reconcile only unless explicitly approved.

The existing training reconciliation code already models HealthKit ownership/match states and consumed source IDs (`src/domain/services/TrainingLoggerAppleHealthService.js:5-21`, `src/domain/services/TrainingLoggerAppleHealthService.js:88-219`). Extract its DTO and deterministic reconciliation rules for Windows contract tests.

## 10. Notification model

Principle: **the Operating Plan creates candidate occurrences; canonical evidence and state suppress them.** Apple frameworks deliver and present server-approved intents.

Current reminder/focus derivation is a useful rule source (`src/domain/services/DailyFocusService.js:71-172`, `src/domain/services/DailyFocusService.js:250-365`), but production notification dispatch is intentionally absent (`docs/NARRATIVE_SCHEDULE.md:31-37`).

Required canonical entities:

- scheduled occurrence with stable ID, user time zone, window, completion authority, related evidence requirement, and version;
- notification intent/outbox record with eligibility version, grouping key, destination ID, copy payload, redaction class, and dedupe key;
- device registration/token and notification preferences/quiet hours;
- delivery receipt and action command receipt.

Eligibility is computed when scheduling, recomputed immediately before sending, and rechecked when an action arrives. A completion action is allowed only for an occurrence whose authority is `manual` or `manual_confirmation`. Evidence-required items deep-link to the correct flow and cannot be falsely completed. There is no blanket “Complete All.” A combined notification carries independently addressable items and drops resolved items at send time.

Native V1 cases:

| Case | Canonical rule |
|---|---|
| Morning weigh-in | notify only inside the configured window when canonical same-day weight is missing. |
| Workout enrichment | prompt when a workout candidate exists but details/reconciliation remain unresolved. |
| End-of-day evidence | evaluate Workout, Nutrition, and Activity together; combine unresolved items; Health activity normally suppresses Activity. |
| Protocols | schedule from active protocol occurrences, including Foam Rolling, Peptides, Photos, DEXA, and applicable Supplements; respect completion authority. |
| DEXA | pre-appointment reminder; after appointment, request upload only while matching evidence is absent. |
| Briefings | publish a generic `briefing.available` event for **any** completed briefing type, not a cadence enum allowlist. |

Immediate background notification when the app is not running requires APNs/backend push. Local notifications are suitable for predictable schedule windows but cannot alone guarantee prompt delivery of a newly generated server briefing. The hybrid/push decision is required before implementation.

## 11. Live Workout V1

Live Workout is Stage 2 and all-or-nothing. A reduced logger does not ship.

### 11.1 Required experience

1. “What are you working today?” supports multi-select canonical training categories and learned day-pattern suggestions without silent selection.
2. “What movements are you doing today?” filters canonical movements by category with search, recents, and stable exercise IDs.
3. The server/client prepares a full session using the most recent comparable confirmed occurrence for each movement.
4. Large targets make confirmation of prior reps/weight the fast path while preserving edits, set changes, and movement changes during the session.
5. Draft survives backgrounding, process death, network loss, and safe continuation on another client according to an explicit single-editor/conflict policy.
6. Finish Workout submits one idempotent command, creates the canonical evidence/review outcome, and reconciles Apple Health without duplicates.
7. PR detection, interpretation, and celebration occur only after canonical evidence is logged.

Not V1: rest timer, Live Activity/Dynamic Island, voice logging.

### 11.2 Existing foundation and required extraction

- category/search, draft, occurrence, prepopulation, and state-recovery semantics exist in `TrainingLoggerPreviewState.js` (`src/app/preview/training-logger/TrainingLoggerPreviewState.js:225-369`, `src/app/preview/training-logger/TrainingLoggerPreviewState.js:489-900`).
- learned weekday suggestions exist and do not silently select (`src/domain/services/TrainingLoggerSuggestionService.js:5-58`).
- production uses browser localStorage recovery (`src/components/training/TrainingLoggerClient.jsx:110-148`).
- Apple-workout reconciliation and stable source ownership exist (`src/domain/services/TrainingLoggerAppleHealthService.js:88-219`).

Before the Windows interactive preview, extract a platform-neutral contract package containing categories, canonical exercise search inputs, suggestion DTO, comparable-occurrence DTO, versioned draft state/reducer, mutation commands, validation, serialization, and finish result. Remove production ownership from `app/preview` without changing behavior. The preview must consume the same fixtures/schema tests intended for the API and Swift client.

Add a server draft resource with `draftId`, `version`, `editorDeviceId`, mutation idempotency, autosave acknowledgement, abandon state, and finish command. Decide whether editing is single-device lease or optimistic multi-device; do not invent silent last-write-wins.

### 11.3 Windows boundary

Windows can fully implement and deterministically test selection, suggestions, prepopulation, draft transitions, replay, conflicts, finish command semantics, canonical evidence payload, PR-after-confirm ordering, and Health workout reconciliation fixtures. Xcode is required for Swift compilation/UI/state restoration and HealthKit adapters. Physical iPhone acceptance is required for gym ergonomics, long-running background/foreground behavior, battery/network transitions, Health workout matching, and haptics.

## 12. Apple capability inventory and Windows/Mac split

| Capability | Windows-safe preparation | Xcode/entitlement work | Physical iPhone acceptance |
|---|---|---|---|
| Shared API/DTOs | Complete schemas, fixtures, contract tests, server implementation. | Compile generated/handwritten Swift client and networking adapter. | Network transition and real-session smoke test. |
| Local authentication | Define session/unlock policy and mock state machine. | `LocalAuthentication`, privacy copy, Keychain integration. | Face ID success/failure/cancel, PIN fallback, lockout, reinstall/revoke. |
| Keychain/protected cache | Define token/cache lifecycle and ports. | Keychain access, file protection, app lifecycle implementation. | lock/reboot/background/data-protection validation. |
| HealthKit | DTOs, anchors, dedupe/reconciliation fixtures, failure policy. | HealthKit capability, usage descriptions, queries/background delivery. | permissions, real data, deleted samples, background delays, source conflicts. |
| Notifications | eligibility, grouping, suppression, action commands, APNs service tests. | UserNotifications categories/actions, permission UI, push entitlement/provisioning. | delivery, quiet modes, background/terminated actions, stale action rejection. |
| Background tasks | deterministic job/outbox state machine. | `BackgroundTasks`, background URLSession/Health delivery declarations. | scheduling is discretionary; test power/network/termination behavior. |
| Share Extension | receipt contract, offline queue fixtures, payload limits. | extension target, activation rules, Keychain/App Group access as selected. | host apps, large files, cancellation, no network, extension termination. |
| App Groups | decide only after Share architecture. | entitlement/provisioning when shared encrypted staging or metadata is needed. | extension-host handoff and data protection. |
| Photos picker | upload/metadata/media contracts. | PhotosPicker/PHPicker UI and permission behavior. | limited-library/privacy, large media, HEIC, metadata and memory. |
| Deep/universal links | typed destination registry and route fixtures. | URL handling, Associated Domains, server `apple-app-site-association`. | cold/warm launch, authentication gating, notification/share destinations. |
| State restoration | versioned navigation/draft models and tests. | SwiftUI scene phase/restoration implementation. | kill, memory pressure, background, OS upgrade build transition. |
| Network retry | command receipts, idempotency, conflict/outbox tests. | URLSession/background transfers, reachability-neutral retry. | airplane mode, captive/poor network, app termination. |
| SwiftUI UI/motion | design tokens, state fixtures, accessibility acceptance plan. | rendering, NavigationStack/TabView, Dynamic Type/VoiceOver/Reduce Motion. | touch targets, haptics, keyboard, real-device performance. |
| Signing/distribution | document bundle IDs/environments. | Apple Developer team, certificates, profiles, capabilities, TestFlight/App Store privacy metadata. | TestFlight install/update/rollback experience. |

Platform-neutral Swift can be authored on Windows, but it is “pre-code,” not accepted, until the real package and app targets compile and test with the selected Xcode/Swift versions.

## 13. Native interaction and motion decisions

### Required platform translation

- `TabView` preserves the five primary destinations; `NavigationStack` uses typed destinations rather than copying URL strings.
- native sheets are used for bounded selection/edit contexts; full evidence, goal, briefing, and review workflows remain navigable screens.
- Photos/file pickers replace browser file inputs while entering the same canonical upload pipeline.
- keyboard avoidance, 44-point minimum targets, Dynamic Type, VoiceOver labels/order, contrast, Reduce Motion, and state restoration are acceptance criteria.
- authentication-gated deep links retain their destination and resume after unlock.

### Native V1 enhancement

- animate Confidence wheel fill and progress changes only when data is fresh; tap opens the server-provided explanation/evidence basis.
- interactive graph scrub: touch/hold and drag across points; expose date/value accessibly and use subtle point-crossing haptics that disable with user/system settings.
- use haptics for confirmed canonical state changes, not speculative taps.
- safe context menus/swipe actions may expose reversible or explicitly confirmed item-level actions.
- Share Extension, actionable notifications, and native pickers reduce evidence friction.

### Future consideration

- widgets/App Intents/Siri, Lock Screen status, Live Activity/rest timer, voice logging, and richer workout-device integrations.

### Reject for V1

- gesture-only destructive/completion actions;
- blanket notification “Complete All”;
- duplicate native PI/Confidence/goal calculations;
- a redesigned information architecture or extra dashboard;
- ornamental motion that obscures evidence freshness or ignores Reduce Motion;
- native-only canonical behavior unavailable to the web fallback.

## 14. Offline, concurrency, and fallback rules

- Reads display a last-updated indicator when offline and never imply stale data is current.
- Commands are queued only when their semantic preconditions can be revalidated. Each retry reuses the same idempotency key.
- Edits use optimistic concurrency. On conflict, retain the local draft and show the new canonical state; never auto-overwrite.
- Uploads use persistent receipts and resumable/background transfer. An uploaded artifact is not canonical evidence until review/confirmation succeeds.
- App kill/relaunch restores safe drafts and navigation without replaying completed side effects.
- native adapters can fail independently. HealthKit failure falls back to manual Activity/Training; Share failure returns a recoverable receipt/draft; notification failure does not change Operating Plan state.
- Web is exercised as the fallback in every release candidate: an iOS write must appear on web and a web write must invalidate/refresh iOS.

## 15. Release safety and acceptance

```text
implemented
-> deterministic unit/schema/contract tests
-> adjacent domain regressions
-> migration and restore rehearsal
-> server build/deploy + web fallback validation
-> Swift package/app build
-> simulator UI/accessibility validation where meaningful
-> physical-device capability and lifecycle validation
-> web/iOS shared-state and conflict verification
-> explicit TestFlight daily-driver acceptance
-> production promotion
```

Strict gates apply to authentication, private media authorization, canonical writes, evidence confirmation, migration, HealthKit reconciliation, background sync, notifications/actions, Share Extension, uploads, offline retry, and concurrent web/iOS use.

Promotion uses immutable server/API and app build identifiers, compatibility policy, feature flags/kill switches for Track B, staged TestFlight rollout, and a tested rollback. The currently accepted build remains usable until its successor passes the gate. API evolution must retain compatibility with that accepted build for the documented support window.

## 16. Dependency-ordered implementation sequence

1. Approve only the cost/security/privacy/product decisions explicitly marked in section 18; complete Founder data containment.
2. Specify contracts, IDs, versions, errors, destinations, database schema, and migration mapping.
3. Implement authentication, PostgreSQL/object/outbox adapters, operations controls, and staging deployment.
4. Build application handlers and extract presentation-owned orchestration without behavior change.
5. Rehearse deterministic migration/restore, then cut the production web client to the shared canonical platform through the short write-fence plan.
6. Prove seven-day web operation, concurrency/replay/change visibility, compatibility, and fallback.
7. Complete notification/Health foundations, the Live Workout shared contract/Windows preview, and prepared Mac acceptance fixtures.
8. Declare **READY TO BEGIN NATIVE BASELINE** only when section 31 passes; then begin Track A SwiftUI.
9. Accept Track A on Mac/simulator/physical device and with two-way web parity.
10. Integrate and gate Track B independently: Share, Health, notifications, motion/graphs, then complete Live Workout.

Section 30 is the authoritative implementation roadmap and task classification.

## 17. Deferred features and known constraints

Deferred: rest timer, Live Activity/Dynamic Island, voice logging, widgets, Siri/App Intents, broad multi-user product UX, and nonessential IA redesign.

Known constraints:

- Mac access is limited; acceptance sessions must be batched around prepared fixtures/checklists, but device-critical tests cannot be waived.
- Founder-only reduces enrollment UX scope, not the need for real server authorization and user-scoped data.
- the current web application is the behavioral oracle during extraction, but its filesystem/singleton/deployment mechanics are not target architecture.
- briefing cadence today is Midweek Wednesday, Weekly Sunday, Monthly first day, with immediate Photo/DEXA event briefings; routine Daily is retired (`docs/NARRATIVE_SCHEDULE.md:5-31`). Native notification design must not revive obsolete cadence behavior.

## 18. Decision register and approval boundary

Engineering choices are recommendations in force for implementation planning unless an approval row says otherwise. An approval is required only where cost, account ownership, recovery policy, privacy, or user-visible behavior changes.

| Decision | Recommended choice | Why this is the minimum appropriate choice | Consequence / tradeoff | Approval before implementation |
|---|---|---|---|---|
| Production platform | DigitalOcean App Platform in a US region, Managed PostgreSQL 17, and private versioned Spaces; one application repository/image with web and worker processes. | It supplies the continuously running Node runtime, worker, scheduled jobs, TLS, database, object storage, secrets, health checks, and rollback PhysiqueOS actually needs without Kubernetes or several function vendors. | A provider dependency and recurring cost; Spaces needs an explicit backup copy because versioning is not an independent backup. | **Yes — Founder selects account owner, US region, budget, and billing alerts.** |
| Availability and ownership | One production web instance during foundation validation; two before iOS becomes the daily driver; one worker; a named Founder/platform operator receives alerts. | Founder-only traffic does not justify autoscaling, but the accepted native client should not depend on a developer workstation or a single replaceable process. | Two web instances cost more; database remains the shared state so scaling is safe. | **Yes — cost and named alert owner.** |
| Database access | PostgreSQL transactions through `pg`; explicit SQL migrations with `node-pg-migrate`; repository ports/adapters rather than an ORM-shaped domain. | Current domain services are JavaScript and repository-oriented. Explicit SQL keeps constraints and transactions visible while avoiding an ORM-driven domain rewrite. | More SQL is written by hand; this is preferable for the small, correctness-sensitive schema. | No. |
| Founder enrollment | Bootstrap the Founder server-side once; an authenticated web session issues a 10-minute, single-use device-pairing code. The iOS device registers and receives a revocable credential. Initial web enrollment uses a separately generated one-time bootstrap code. | No reusable master secret enters the app, and device replacement remains possible without public signup or email infrastructure. | Losing all enrolled devices and the recovery material requires an operator-assisted bootstrap. | **Yes — security/recovery procedure.** |
| Local PIN | Face ID is normal unlock. An app PIN is local only, minimum 8 digits, rate-limited with escalating delay; 10 failures erase local credentials and require re-enrollment. PINs are never recoverable or sent to the server. | It preserves the required local fallback without turning a low-entropy PIN into a reusable server credential. | Re-enrollment is deliberately required after lockout or forgotten PIN. | **Yes — destructive lockout behavior.** |
| Session lifetime | Opaque 10-minute access tokens; rotating refresh credentials with 30-day idle and 90-day absolute lifetime; refresh reuse revokes the device session family. Web uses Secure, HttpOnly, SameSite cookies with 12-hour idle and 30-day absolute lifetime. | Short access exposure, revocation, and simple server-side inspection are sufficient at Founder scale. | Periodic sign-in/re-enrollment is intentional. | No, unless the Founder wants different convenience/security limits. |
| API style and compatibility | REST/JSON under `/api/v1`, OpenAPI 3.1 schemas, additive V1 evolution, and support for the currently accepted plus immediately previous accepted native build for at least 180 days. | It is easy to exercise on Windows, maps cleanly to task resources, and avoids GraphQL/event-stream infrastructure. | Breaking changes require `/api/v2`; some response fields may be redundant for compatibility. | No. |
| Offline mutation scope | Queue only new evidence upload staging, new morning check-in/weight submissions, manual-authority occurrence completion, briefing opened/acknowledged, and Live Workout draft patches once Stage 2 exists. Require connectivity for corrections, evidence confirmation, goals, plan/protocol edits, phase transitions, destructive actions, and evidence-required completion. | These queued commands have stable identities and server-recheckable preconditions; broader offline editing would create a second synchronization product. | Some edits wait for connectivity; cached reads remain available. | No. |
| Cache and privacy | Seven-day encrypted read-model cache; media only in protected temporary storage for at most 24 hours; clear all protected caches on sign-out/revoke; no remote-wipe promise beyond revocation and next-online cleanup. | Enough for ordinary outages while bounding sensitive data. | Recently viewed information may be unavailable after expiry; a lost offline device relies on iOS data protection. | **Yes — privacy/retention expectation.** |
| Notification transport | Backend APNs for briefing availability and recomputed actions; local notifications only as a best-effort presentation fallback for predictable windows. | New server briefing availability cannot be delivered promptly by local scheduling alone. | Requires APNs credentials and device acceptance later. | **Yes — exact times, quiet hours, preview text, and preferences; transport choice itself is recommended.** |
| Notification completion | Only occurrences whose canonical authority is `manual` or `manual_confirmation` may complete from an action. Evidence-required occurrences route to evidence capture. | This follows the existing evidence-suppression rule and prevents false completion. | Some notification taps open a workflow instead of completing immediately. | **Yes — approve the occurrence-type allowlist before APNs work.** |
| Apple Health | Import and reconcile only in first Health release; no PhysiqueOS workout write-back. Persist source/sample identity, corrections, deletions, and checkpoints now. | Read/reconcile is sufficient to eliminate duplicate manual Activity/Workout evidence without two-way Health ownership. | Workouts still originate in their existing apps or PhysiqueOS and are not written to HealthKit initially. | **Yes — exact Health types, precedence, and aggregation before HealthKit implementation.** |
| Share Extension | Direct background upload when online; encrypted App Group staging only when offline or the extension is about to terminate. | It shares the normal upload-receipt pipeline while retaining a recoverable offline path. | App Group protection and cleanup add Apple-specific work in Stage 2. | No until Stage 2 acceptance details are finalized. |
| Live Workout ownership | One active editor lease per draft, explicit takeover after expiry, five-second maximum autosave interval, 30-day abandoned-draft retention, and Finish creates a pending Evidence Review. | Single-editor behavior avoids silent multi-device merging and preserves the current evidence-confirmation lifecycle. | A second device is read-only until takeover; finishing is not auto-confirmation. | No; changing Finish to auto-confirm would require product approval. |
| Object deletion and retention | Evidence objects are retained while referenced. User deletion creates a tombstone and 30-day recoverable grace period; garbage collection purges only unreferenced objects and preserves an audit tombstone. | Prevents broken history and accidental irreversible deletion. | Storage is not reclaimed immediately. | **Yes — privacy/retention policy.** |
| Distribution | Private TestFlight for baseline and daily-driver acceptance; decide public, unlisted, or private App Store distribution only after Track A acceptance. | Limited Mac access and Founder-only use favor the smallest reversible release channel. | TestFlight builds expire and are not a permanent distribution solution. | **Yes — Apple distribution choice before production release.** |
| Founder source remediation | Stop treating tracked Founder seed records as deployable production data; rotate exposed credentials; decide whether repository history must be rewritten only after a scoped exposure review. | A history rewrite is disruptive and should follow evidence, while deployable artifacts must become clean immediately. | Old commits may remain sensitive until the review and any rewrite are complete. | **Yes — history rewrite/rotation scope.** |
| iOS support floor | Select the oldest iOS/device version only during Mac baseline preparation, then hold it for the V1 support window. | The choice depends on actual Xcode/SDK and device availability, not Windows inference. | A newer floor reduces compatibility testing but excludes older hardware. | **Yes — during Mac acceptance preparation.** |

Recorded Founder decisions for the Phase 1 implementation boundary (2026-08-11):

- DigitalOcean is approved and provider-backed synthetic staging is provisioned at USD 30.15/month under the USD 50/month ceiling. App Platform uses `sfo`; PostgreSQL and Spaces use `sfo3`. Named billing-alert and long-term operator ownership remain required before production activation.
- Founder recovery uses a one-time high-entropy recovery credential created during enrollment and stored externally in the Founder's password manager. Consumer email/password recovery is excluded.
- The local fallback PIN is eight digits with progressive delay. Crossing the security threshold invalidates local credentials and requires the recovery credential/re-enrollment path; it never deletes canonical Founder data.
- The seven-day encrypted read-model cache and maximum 24-hour protected temporary media/upload retention are approved for later native implementation.
- Source remediation is passive for now: prevent sensitive Founder material from entering distributable artifacts and rotate credentials when indicated, but do not rewrite repository history without a separate scoped decision.
- Private TestFlight is approved for initial native acceptance. Final App Store distribution remains a later decision.
- High-safety compatibility and the production web fallback are approved requirements: no native release may make an unvalidated native build mandatory or weaken the web client.

These decisions supersede the corresponding approval wording in the table where they are more specific. Object-deletion retention, notification presentation policy, exact Apple Health types, iOS support floor, and named production alert/operator ownership remain unresolved at their later implementation gates.

## 19. Shared-platform architecture decision

### 19.1 Target topology

PhysiqueOS remains a **modular monolith**. One repository and one immutable build produce two continuously deployed process types. There is no iOS service, no repository service exposed over the network, and no second canonical store.

```text
Web browser / Next server components ----\
                                          -> application handlers -> domain services
iOS / future Share Extension ------------/            |
                                                       +-> PostgreSQL 17
                                                       +-> private object storage
                                                       +-> transactional outbox
                                                                 |
                                                         background worker
```

- `web`: the existing Next.js application serves the production web client and `/api/v1`. Server components and server actions call the same application handlers in-process with a web session principal; they do not make loopback HTTP calls. REST adapters call those handlers for native. This proves the same authorization, transaction, and read-model boundary while avoiding needless internal networking.
- `worker`: the same code/build claims database outbox/work rows with `FOR UPDATE SKIP LOCKED`, performs interpretation, briefing, confidence, reconciliation, media, and later notification work, and records attempts. A failed process never loses accepted work.
- `scheduler`: initially a small scheduled job only for cadence enqueue, integrity checks, and backup verification. Due notification work is claimed from `due_at` by the continuously running worker; it does not depend on a coarse cron interval.
- PostgreSQL is the only canonical record store. Object storage holds bytes; database rows own identity, authorization, lifecycle, checksum, and provenance.
- The Windows workstation becomes a development/operator client. Ngrok is retired from production access.

The concrete target is DigitalOcean App Platform plus Managed PostgreSQL 17 and private Spaces in the nearest approved US region. App Platform supports services, non-routable workers, scheduled jobs, health/liveness checks, encrypted runtime variables, and deployment rollback. Managed PostgreSQL supplies TLS, trusted sources, pooling, daily backups, and seven-day point-in-time recovery. Spaces supports private objects, presigned URLs, multipart upload, and versioning, but not independent built-in backups; the backup design below compensates. Provider evidence: [App Platform workers](https://docs.digitalocean.com/products/app-platform/how-to/manage-workers/), [scheduled jobs](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/), [deployment rollback](https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/), [managed PostgreSQL restore](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/), [private/presigned Spaces objects](https://docs.digitalocean.com/products/spaces/how-to/set-file-permissions/), and [Spaces versioning](https://docs.digitalocean.com/products/spaces/how-to/enable-versioning/).

### 19.2 Complexity boundary

| Horizon | Include |
|---|---|
| **Required now** | production/staging environments; TLS web/API service; one worker; PostgreSQL; private versioned object bucket; transactional outbox; auth/session/device records; migrations; structured logs; readiness/liveness; backups and restore drill; feature flags; immutable build ID; manual promotion/rollback. |
| **Useful soon, before native daily-driver** | second production web instance; error aggregation such as Sentry; external uptime check; cross-region encrypted object copy; operations dashboard over jobs/sessions/migration status; APNs credentials and delivery worker only when notifications enter Stage 2. |
| **Future multi-user concern** | delegated administration, public signup/recovery, billing, tenant quotas, per-user encryption keys, data export/deletion UX, row-level database security as defense in depth, workload partitioning, read replicas. User scoping and authorization exist now; these product systems do not. |
| **Unnecessary now** | Kubernetes, microservices, Kafka, Redis as a queue, GraphQL, event sourcing as the primary store, CQRS infrastructure, multi-region active/active, a separate native backend, or a full offline synchronization engine. |

### 19.3 Deployment and recovery

- CI runs lint, unit/contract tests, schema compatibility, a production build, and migration dry-run. The same commit/image promotes to staging, then production manually.
- Expand-only database migrations run as a pre-deploy job. Contract/removal migrations wait until every supported web/native build no longer reads the old shape. Application rollback never assumes database rollback.
- Runtime secrets are encrypted environment variables with runtime-only scope: database credentials, object keys, token signing/pepper material, OpenAI keys, and later APNs credentials. They are separate per environment and never enter client bundles or build logs.
- App rollback uses a prior successful immutable deployment. Database recovery restores to a new cluster, is validated, then connection configuration is promoted. Do not restore over the current primary.
- Use provider daily/PITR recovery plus a nightly encrypted logical database export retained for 35 days and 12 monthly exports. Enable object versioning; copy new object versions and a checksum manifest nightly to an independently credentialed backup bucket in a second region. Retain deleted versions for at least 35 days. Run a representative database-and-object restore quarterly.
- Target RPO is 24 hours for independent backup loss and the provider PITR window for database operator error; target RTO is four hours for Founder-only V1. The Founder/platform operator receives failed deploy, unhealthy service, failed job, backup, storage-integrity, and database alerts.

## 20. Canonical PostgreSQL design

### 20.1 Modeling rules

Use PostgreSQL 17 through `pg`, explicit SQL migrations, and narrow repository ports. Do not serialize `PERSISTED_COLLECTIONS` into one JSONB row. The current runtime contains at least 40 named collections, including duplicated `confidenceInitializationArtifacts` in the persistence list (`src/data/repositories/founderRuntimeStore.js:15-56`), merges selected records as append-only (`src/data/repositories/founderRuntimeStore.js:57-73`), and hydrates tracked seeds into mutable state (`src/data/repositories/founderRuntimeStore.js:100-211`). That shape is a migration input, not a target schema.

Use a bounded relational/JSONB hybrid:

- relational columns and foreign keys own user, stable identity, status, dates, relationships, versions, uniqueness, and query/index fields;
- JSONB may retain evolving domain payloads such as interpreted evidence, briefing presentation, strategy details, and calculation explanations, always with `schema_version` and validated at the application boundary;
- immutable history/version rows preserve prior canonical meaning; mutable aggregate heads point to the current version;
- generated read models may be cached or materialized, but are disposable projections, never alternate truth.

Preserve every valid legacy identifier as text during migration. New server resources and client `commandId` values use UUIDv7 string form. Do not rewrite an old identity merely to make it UUID-shaped. Every user-owned table has `user_id`; authorization always supplies it from the session, never from an untrusted request body.

### 20.2 Schema families

| Family | Canonical records |
|---|---|
| Identity/control | `users`, `user_profiles`, `devices`, `sessions`, `refresh_credentials`, `enrollment_tokens`, `command_receipts`, `resource_changes`, `audit_events`, `feature_flags`, `client_build_policies`, `schema_migrations`. |
| Strategy/Goal | `goals`, `goal_phases`, `goal_versions`, `goal_transition_drafts`, `goal_transition_transactions`, `phase_review_decisions`, `phase_strategies`, `phase_expected_trajectories`, `milestones`, and active/current pointers. Completed Goals remain ordinary immutable/history-visible states, not archived blobs. |
| Operating Plan/Execution | `operating_plans`, strategy records, `protocols`, immutable `protocol_versions`, `execution_items`, `scheduled_occurrences`, `occurrence_completions`, `reminders`, energy links, and reconciliation records. |
| Evidence intake | `evidence_submissions`, `upload_sessions`, `stored_objects`, `evidence_artifacts`, `evidence_packages`, `evidence_reviews`, `review_revisions`, `review_confirmations`, `evidence_provenance_edges`. |
| Canonical evidence | a common `canonical_evidence` identity/provenance envelope plus bounded records for `weight_entries`, `nutrition_days`, `activity_days`, `training_sessions`, `training_exercises`, `training_sets`, `photo_sessions`, `progress_photos`, `dexa_scans`, `daily_check_ins`, and recovery evidence. Do not query arbitrary evidence JSON for core identity or uniqueness. |
| Intelligence/publication | `analyses`, PI observation/current-state records discovered during extraction, `confidence_snapshots`, `confidence_history`, `briefings`, `briefing_versions`, `briefing_publications`, `briefing_reconciliation_work`, and evidence-window/provenance links. |
| Async/integration | `outbox_messages`, `work_attempts`, `operations`, later `notification_intents`, `notification_deliveries`, `external_sources`, `health_samples`, `health_sync_checkpoints`, `workout_reconciliations`, and Live Workout draft tables. |

This inventory includes the current persisted collections and canonical concepts visible in `createSeedRepositories` (`src/data/repositories/createSeedRepositories.js:1-100`) and `founderRuntimeStore` (`src/data/repositories/founderRuntimeStore.js:15-56`, `src/data/repositories/founderRuntimeStore.js:100-211`). Migration discovery must fail closed if a source key is neither mapped nor explicitly classified as derived/noncanonical.

### 20.3 Transactions, versions, and history

- Every mutable aggregate has a `version bigint not null` starting at 1. An update is `... where id = ? and user_id = ? and version = expectedVersion`, increments once, and inserts a `resource_changes` sequence in the same transaction. `updated_at` is display/audit data, not a concurrency token.
- Commands affecting several aggregates use one PostgreSQL transaction and lock only the aggregate heads needed. Morning Check-In, recovery ingestion, evidence confirmation, goal/phase transition, protocol successor activation, priority completion, Live Workout finish, and publication/current-pointer changes are atomic.
- Side effects are not performed inside the database transaction. The transaction writes an outbox row; a worker retries. This carries forward the useful selected-unit-of-work behavior (`src/data/repositories/FounderStoreUnitOfWork.js:55-282`) without pretending all repositories already participate (`src/data/repositories/FounderStoreUnitOfWork.js:34-46`).
- `command_receipts` is unique on `(user_id, idempotency_key)`, stores a canonical request hash, command type, status, response/operation reference, and expiry. Same key/same hash returns the first result; same key/different hash is rejected.
- Scheduled occurrences receive a server ID and a unique generation key `(user_id, source_type, source_id, source_version, local_date, slot_key)`. Schedule regeneration returns the existing occurrence rather than inventing a timestamp identity.
- Audit events record actor/session/device, request/correlation/command IDs, command type, affected IDs and before/after versions, outcome, and redacted change summary. Sensitive evidence bodies are not duplicated in general logs. Domain-specific history tables retain the actual prior canonical value when history matters.
- Schema migrations are ordered, immutable, tested from an empty database and a scrubbed migration snapshot, and run once under an advisory lock. Use expand/backfill/validate/contract; destructive contract steps are separate releases.

### 20.4 Dangerous-write constraints

| Workflow | Database authority |
|---|---|
| Evidence intake/confirmation | unique client submission per user; unique package per submission/version; one confirmation per review; review `expectedVersion`; canonical evidence provenance unique to confirmation and item identity. |
| Goals/phase transitions | goal aggregate version; one active phase per goal and at most one active primary goal per user where current semantics require it; immutable transition transaction ID; protocol successor changes in the same transaction. |
| Protocol/priority completion | immutable protocol versions; unique occurrence generation key; at most one effective completion per occurrence; correction creates a revision/reversal instead of overwriting history. |
| Morning Check-In | unique `(user_id, local_date)` check-in head; weight/evidence/reconciliation/outbox written atomically; retries return the command receipt. |
| Briefing/confidence | unique publication key per user/type/evidence window/calculation version; immutable versions and atomic current pointer; publication outbox is deduplicated. |
| Training/Live Workout | external source identity and draft finish are unique; one canonical TrainingSession per accepted finish/source; training sets have stable IDs, not array-index identity. |
| Uploads | unique object ID and upload completion; expected checksum/length; repeated provider completion callbacks converge on the same verified receipt. |
| Health | unique `(user_id, source_namespace, source_sample_id)`; corrections update source revision and append reconciliation history; deletions tombstone the sample and recompute affected aggregates. |
| Notification actions | unique action command; occurrence eligibility/version rechecked in the completion transaction; resolved/evidence-required actions cannot be replayed into a false completion. |

Simultaneous web/iOS edits are serialized by constraints and expected versions. The loser receives the new canonical representation and version; no path silently overwrites it. PostgreSQL `READ COMMITTED` plus row locks/conditional updates is sufficient; use `SERIALIZABLE` only for a proven cross-aggregate invariant that constraints and explicit locks cannot express.

## 21. Private object-storage design

### 21.1 Identity and authorization

- A `stored_objects` row owns `object_id`, `user_id`, bucket/key/version, SHA-256, byte length, detected MIME type, original safe filename, lifecycle state, created/verified/deleted timestamps, and provenance. Domain records reference `object_id`, never a filesystem path or permanent URL.
- Object keys are opaque and nonsemantic: `users/{opaqueUserId}/objects/{objectId}/original` and `.../renditions/{renditionId}`. The key is an implementation detail and does not authorize access.
- Buckets, listings, originals, and renditions remain private. The API resolves the authenticated user, verifies ownership/reference authorization, and either streams a small object or issues a single-object presigned GET URL with a five-minute maximum lifetime. Do not enable a public CDN for Founder evidence.
- Service access keys are server/worker secrets with separate least-privilege credentials. Clients receive only narrowly scoped presigned operations.

### 21.2 Upload and read lifecycle

1. `POST /api/v1/uploads` creates a user-scoped receipt in `created`, declares expected size/type/checksum when known, and returns single-part or multipart instructions.
2. The client uploads directly to object storage. Parts may resume with the same receipt; the receipt and part identities survive app termination.
3. `POST /api/v1/uploads/{id}/complete` is idempotent. The server checks provider state, length, checksum, magic bytes/type, limits, and ownership; unsafe or mismatched bytes become `quarantined`/`failed`.
4. A transaction marks the object `verified` and attaches it to exactly one evidence submission/artifact relationship. Interpretation begins from an outbox message.
5. Reads return an authorized media descriptor with object/rendition ID, content metadata, expiry, and ETag. The client refreshes authorization rather than persisting a URL.

Abandoned multipart uploads expire after 24 hours. Originals are immutable. A transformed rendition is a new object linked to its original and transform version. Evidence deletion tombstones the domain link first; object garbage collection waits 30 days and verifies no live references. Legal/privacy policy may shorten or extend that grace only through an explicit decision.

### 21.3 Existing-file migration and recovery

Inventory every source artifact under the configured Founder private root, including paths referenced by evidence packages, photos, DEXA, analysis/reporting, and any orphan candidate. For each file, record relative legacy path, length, mtime (informational), SHA-256, detected MIME, referenced record IDs, destination object ID/key/version, and upload verification status in a signed/versioned manifest. Upload without changing the source; verify the remote checksum by readback; create database relationships; then prove every old web evidence view resolves through an object handle.

Do not place the legacy relative path in a client DTO. Retain it only in the migration manifest/provenance metadata. Duplicate bytes may share a checksum for verification but do not silently collapse distinct historical artifacts. Enable bucket versioning, maintain a nightly independently credentialed cross-region copy plus checksum manifest, and include representative object readback in quarterly restore drills. Spaces versioning protects mistaken overwrite/delete; it is not a substitute for the independent copy.

## 22. Founder authentication and session design

### 22.1 Enrollment and sessions

1. An operator-only Windows CLI creates the one Founder `users` row and a random 256-bit, 15-minute, single-use bootstrap secret. Store only its hash. This command can run against staging first and must never print reusable session credentials into logs.
2. The Founder redeems it over TLS in the web client and registers a WebAuthn passkey. The server creates a web device/session and sets Secure, HttpOnly, SameSite cookies. Write requests also require an origin check and CSRF token.
3. From authenticated You > Devices, the Founder requests a 10-minute, single-use iOS pairing code. The iOS app registers a device identity and exchanges the code for a rotating opaque refresh credential. Possession of the binary or a copied pairing code after use is insufficient.
4. Access tokens are opaque random bearer values, valid for 10 minutes and stored only in memory on iOS; the database stores a keyed hash. The refresh credential is stored in Keychain with `ThisDeviceOnly` protection, rotates on every use, expires after 30 idle/90 absolute days, and has family reuse detection. Device/session revocation invalidates refresh credentials immediately and access tokens at their next lookup/expiry.
5. Every protected request resolves a server-side principal containing `userId`, `deviceId`, `sessionId`, scopes/capabilities, and auth time. Request payload `userId` is ignored or rejected. The Founder row is a normal user row with a role/capability assignment, so later multi-user auth changes enrollment and policy rather than resource ownership.

Do not create public signup, password reset, subscription, or onboarding. Recovery is operator-assisted: revoke the lost device from web if possible; otherwise use sealed recovery material to issue a new one-time web bootstrap, then revoke all old sessions. A replaced device always re-enrolls. Logout revokes the current session/refresh family and clears Keychain and protected caches; “revoke device” revokes every session for that device. An authenticated Devices screen lists name, platform, created/last-seen time, current state, and revoke action without exposing token material.

### 22.2 Face ID and PIN

Face ID and the app PIN gate local access only. After a successful local unlock, the app may use the Keychain-held device credential to refresh a server session. Neither result is sent as proof of Founder identity.

- Face ID is the normal LocalAuthentication path. Cancellation does not silently fall through; the user chooses PIN fallback.
- The Founder sets an app PIN after enrollment. Store only a slow verifier and rate-limit state in protected Keychain data. Require at least eight digits, delay after the third failure, escalate delay, and after ten failures erase local credentials/cache and require device re-enrollment.
- There is no PIN recovery. With a valid biometric session the Founder may set a new PIN; otherwise re-enroll. Reinstall is treated as a new device enrollment, not a credential recovery path.
- The app locks after five minutes in background by default and whenever protected data becomes unavailable. A valid local unlock does not bypass an expired/revoked server session.
- iOS implementation details remain subject to Keychain/LocalAuthentication build and physical-device acceptance; Windows tests cover only the policy state machine.

## 23. Versioned application API

### 23.1 Protocol rules

- REST/JSON uses `/api/v1`; OpenAPI 3.1 is canonical for transport schemas. JSON Schema fixtures validate JavaScript handlers and later generate or validate Swift DTOs. Unknown additive response fields must be ignored by clients; unknown enum values map to an explicit unsupported state.
- Use nouns for read resources and task-specific command endpoints for behavior. Never expose generic repository CRUD or a runtime-store snapshot.
- Collection reads use opaque cursor pagination with deterministic `(sort_key, id)` ordering and bounded `limit` (default 25, maximum 100). Time-series APIs require a bounded range and return units/time zone.
- Read models return `resourceVersion`, `generatedAt`, `freshThrough`, and an ETag. `If-None-Match` may return `304`. Aggregate/read-model versions are validators, not a promise that every underlying row shares one number.
- Edits send `If-Match`/`expectedVersion`; a stale precondition returns `412`. A valid-current request blocked by a domain invariant returns `409`. Validation returns RFC 9457-style `application/problem+json` with stable `type`, `code`, `title`, `status`, field errors, `requestId`, and safe recovery metadata. No stack, SQL, path, secret, or raw provider response is returned.
- Every write supplies `Idempotency-Key` and `commandId`. Creates may omit `expectedVersion`; any overwrite/correction/edit may not. The server returns the canonical receipt and versions for committed or replayed commands.
- Work that outlives an HTTP request returns `202`, an `operationId`, `Location`, and current state. `GET /operations/{id}` exposes queued/running/succeeded/failed/retryable status and result destinations. Push/change feeds may notify later; polling remains supported.
- Requests carry `X-Request-ID` (server creates one if absent), client platform/version/build, and IANA time zone where local-day semantics apply. The server supplies canonical time and never trusts client timestamps as identities.

### 23.2 Contract map

The endpoint names below are the required resource surface, not a commitment to one file per route.

| Product area | Read contracts | Command contracts | Existing service ownership / extraction |
|---|---|---|---|
| Home | `GET /home` with current briefing, focus/priority cards, confidence summary, freshness, and destination IDs. | lifecycle acknowledgement only; Home does not own domain mutation. | Preserve `HomeBriefingRoutingService`; adapt `HomeBriefingService` away from the runtime store (`src/domain/services/HomeBriefingService.js:38-116`, `src/domain/services/HomeBriefingService.js:207-290`). |
| Log | `GET /log`, pending reviews, current-day evidence state. | create/finalize submission and typed/manual evidence commands. | Extract page/upload orchestration from `src/app/log/page.js:14-53` and `src/app/log/upload/route.js:24-93`; retain `EvidenceIntakeService` interpretation behind storage ports. |
| Evidence/Review | paginated timeline/package/review detail, provenance, downstream status. | edit review, resolve exercise, confirm, retry failed downstream operation. | Put `EvidenceReviewService`, lower-level confirmation, and `PostConfirmationOrchestrator` behind one application command. Remove orchestration and filesystem ownership from `src/app/evidence/review/[reviewId]/actions.js:7-185`. |
| Weight/Check-ins | bounded history/current day and reconciliation state. | submit morning check-in, correct weight, submit recovery check-in. | `MorningCheckInPersistenceService` and `RecoveryCheckInIngestionService` are application-service bases; replace file UoW with DB transaction and consistent local-date context. |
| Nutrition/Activity | day/history/readiness read models with provenance and source status. | manual submission/correction through evidence lifecycle; Health batch later. | Reuse evidence context/reporting services after removing default Founder repositories. Enforce day/source uniqueness in DB. |
| Training | history/session/comparable occurrence, exercise library/search/suggestions. | manual evidence now; draft patch/finish later. | Reuse canonical training, suggestion, and reconciliation services; move production state ownership out of `app/preview`. |
| Photos/DEXA | sessions/scans, authorized renditions, appointment/evidence status, event briefing links. | upload/finalize, review confirmation, appointment commands. | Preserve Photo/DEXA domain services; replace local filesystem actions with upload/object application handlers. |
| Goals | hub/detail/completed history/forecast/transition review. | edit, create transition draft, review/commit transition. | Move composition/calculation out of `GoalsHubScreen` (`src/screens/GoalsHubScreen.jsx:62-140`) and fixed identity out of transition action (`src/app/goals/transition/review/actions.js:14-16`). |
| Operating Plan/Protocols | plan, strategy detail, protocol current/version history, occurrences. | create/edit/retire strategy or protocol; activate successor; complete/correct occurrence. | Extract grouping/schedule mapping from React (`src/screens/OperatingPlanScreen.jsx:142-287`); keep successor/version services canonical. |
| Priorities | current list/detail with occurrence, authority, suppression reason, destination. | complete/correct manual occurrence or route to required evidence. | Reuse `DailyFocusService` evidence suppression; remove fixed goal coupling from `PriorityDetailService` (`src/domain/services/PriorityDetailService.js:27-29`). |
| Progress/Confidence | bounded domain series, summaries, explanations, evidence basis, calculation version. | normally none; explicit recalculation is an operator/application operation, not client CRUD. | Keep PI/Confidence server-owned; remove direct file/default Founder dependencies from evidence context/reporting services. |
| Briefings | paginated all-type list, detail/version history, availability/current routing. | opened/acknowledged; operator regeneration is separate. | Preserve lifecycle/routing services; persist claim/publication/outbox. Emit generic `briefing.available` for every type. |
| You/profile | profile, settings, capabilities, devices/sessions, integration state. | update bounded settings, create pairing code, revoke session/device, logout. | `YouProfileService` is injection-friendly (`src/domain/services/YouProfileService.js:1-76`); replace placeholder capability copy with actual server state. |
| Uploads/media | upload receipt/parts/status and authorized media descriptor. | create, refresh parts, complete, abort. | Replace `private/founder` paths and unauthenticated private-evidence GET (`src/app/api/private-evidence/[...path]/route.js:13-35`). |

Typed destination identifiers are part of every relevant response: for example `home`, `log`, `evidence.review`, `evidence.detail`, `goal.detail`, `plan`, `priority.detail`, `progress.stream`, `briefing.detail`, `training.session`, `dexa.upload`, and `workout.draft`. Parameters are schema-validated stable IDs. Expand `src/navigation/navigationRegistry.js:1-32` into a complete shared registry with web URL and native route mappings; notifications and API responses never invent raw web paths.

### 23.3 Web use of the boundary

The application boundary is a set of authenticated application handlers, not merely HTTP route files. Next server components/actions obtain the web principal and call handlers directly; `/api/v1` validates the native principal and calls the same handlers. Both paths receive DTOs, versions, command receipts, and structured errors. Neither may import concrete PostgreSQL repositories outside dependency composition. HTTP contract tests and selected end-to-end web flows must also exercise `/api/v1`, so transport behavior is proven before Swift depends on it.

## 24. Retry, idempotency, and concurrency contract

### 24.1 Command lifecycle

In one transaction the command handler: authenticates and authorizes; reserves or reads the idempotency receipt; compares the request hash and expected versions; validates domain preconditions; writes canonical state, audit/change rows, and outbox messages; completes the receipt; then commits. A response lost after commit is harmless: replay returns the stored result. A transaction interrupted before commit changes nothing. A worker side effect records its own dedupe key and attempt state.

| Scenario | Required behavior |
|---|---|
| Same record open on web/iOS | Both read version N. First valid write commits N+1; second gets `412 stale_version`, canonical N+1, and safe reapply metadata. Local edits are retained. |
| iOS retries after timeout / app kill | Reuse the same key and command ID. The server returns the committed receipt or safely attempts the not-yet-committed command. Never infer failure from a missing response. |
| Repeated Evidence confirmation | Unique review confirmation plus command receipt returns the original confirmation/operation. Downstream outbox rows are unique per confirmation and step. |
| Repeated upload completion callback | Receipt state and object checksum make finalize convergent; same bytes return verified state, mismatched bytes fail without attachment. |
| Repeated priority or notification completion | Unique occurrence completion/action receipt returns the original result. Eligibility and evidence authority are rechecked at commit time. |
| Repeated workout finish | Unique `(user_id, draft_id)` finish result. Replay returns the Evidence Review destination and never creates a second TrainingSession/package. |
| Morning Check-In retry/reconciliation | Command receipt plus unique user/local-date aggregate; the entire check-in/weight/evidence/outbox transaction commits or rolls back. A later correction is a new versioned command. |
| Background retry after server success | The queued command keeps its key until a terminal receipt is received. Backoff with jitter; do not mint a new key on retry. |
| Outbox worker crash | Lease expires; another worker claims the row. Handler-level dedupe and unique publication/source keys make the operation convergent. |

Command receipts for ordinary writes remain at least 180 days, and forever (or for the domain record lifetime) for irreversible boundary commands such as evidence confirmation, goal transition, Live Workout finish, Health import batch, and notification completion. This is small at Founder scale and avoids an expiry reopening duplicate risk.

### 24.2 Change visibility

Each committed transaction allocates monotonic `resource_changes.sequence` rows for affected resource/read-model keys. Native requests `GET /changes?after={sequence}` after foreground/reconnect and refreshes only named read models; it does not replay domain events or download raw tables. Web cache invalidation is triggered after commit from the same change set. The response includes a bounded `nextCursor`; if a cursor is too old, the server returns `resync_required` and the client refetches bounded read models.

## 25. Conservative offline and local-cache policy

- Native V1 is online-authoritative, not offline-first. Cache only versioned application read models needed for recent daily use. Encrypt at rest, use iOS complete-until-first-unlock/complete protection as appropriate, require local unlock before display, retain no longer than seven days, and clearly show `lastUpdatedAt` when the server is unavailable.
- Keep thumbnails/opened media only in protected temporary storage, maximum 24 hours, and set authorized responses so permanent URL caching is impossible. Never cache original DEXA/photo/evidence files merely for convenience.
- Live state is required for authentication enrollment/recovery, review confirmation, evidence correction, goals/phases, Operating Plan/protocol changes, destructive actions, device management, and evidence-required occurrence completion.
- The Track A local command queue allowlist is: new morning check-in/weight submission, manual-authority occurrence completion, briefing opened/acknowledged, and evidence upload staging/finalization after a receipt can be obtained. Live Workout draft patches join only in Stage 2. Every queued item stores its key, schema version, base resource version, dependency/receipt IDs, retry count, and last safe error.
- An evidence file selected offline may be held in encrypted app-controlled staging with a client submission ID. It is not “uploaded” or canonical until a server receipt and verified completion exist. Apply the same bounded retention/cleanup policy later to the Share Extension App Group.
- Retry transient network/`429`/`5xx` failures with exponential backoff and jitter; stop on auth, validation, conflict, revoked device, or permanent upload failure. A conflict retains the local draft and displays canonical state; there is no automatic last-write-wins merge.
- On sign-out, revoke, PIN lockout, or account mismatch, delete access/refresh credentials, read cache, media, queued commands, and locally staged evidence. Remote revoke takes effect immediately on the server and triggers local cleanup the next time the app connects; there is no claim of offline remote wipe.

## 26. Stage 2 foundations that must exist now

### 26.1 Notification foundation

Do not implement APNs or native presentation during foundation work. Implement only the durable identities and generic work contracts that avoid a later data migration:

- `scheduled_occurrences`: stable ID, source type/ID/version, local date, IANA time zone, eligible window, status/version, completion authority, evidence requirement/query, and destination.
- `notification_intents`: user/occurrence or publication references, `due_at`, eligibility input version, grouping/dedupe key, redaction class, typed destination, copy-template identifier/variables, status, and version.
- `outbox_messages`: generic durable dispatch request; notification delivery is a later handler, not a domain write.
- later `device_push_registrations`, preferences/quiet hours, `notification_deliveries`, and action receipts attach to existing users/devices/occurrences.

Occurrence generation is idempotent. Scheduling computes candidate eligibility, the worker recomputes immediately before delivery, and an action command recomputes again inside its transaction. Evidence can therefore suppress a previously queued intent. Combined reminders share a grouping key but contain independently addressable occurrence items; resolved items drop at send time. There is no “Complete All.”

The canonical cases remain: missing morning weight inside its window; unresolved workout enrichment; combined end-of-day Workout/Nutrition/Activity evidence with Health suppression; active protocol occurrences; DEXA pre-appointment and post-appointment upload states; and `briefing.available` for **any** newly published briefing type. A manual-authority action may complete idempotently; an evidence-required action returns a route destination and does not complete.

### 26.2 Apple Health foundation

Add schema/contracts and deterministic fixtures now; do not implement HealthKit:

- `external_sources` identifies namespace, device, bundle/source identifier, product/version, and trust/precedence classification.
- `health_sync_checkpoints` is per user/device/sample type and stores a generation, opaque protected anchor/checkpoint payload or digest, last accepted batch ID, version, and timestamps. Server code does not interpret Apple anchor bytes.
- `health_samples` stores stable HealthKit UUID/source namespace, type, start/end, original unit/value or bounded payload, source revision, received time, active/deleted state, and provenance. A unique source identity makes batch replay safe.
- `health_import_batches` records client batch ID, checkpoint precondition/result, counts, command receipt, and affected date range. Corrections/deletions append reconciliation history and enqueue bounded recomputation.
- `workout_reconciliations` links source workout, canonical/manual/Live Workout evidence, match state/reason, consumed source identity, and version. Never delete manual fallback merely because Health sync is delayed or denied.

The first Health release is read/reconcile only. Activity aggregation and source precedence are versioned server policy, not iOS calculations. A PhysiqueOS-created workout retains its own stable identity so later write-back can add an external-source link without creating another TrainingSession. Extract the useful current matching semantics from `TrainingLoggerAppleHealthService` (`src/domain/services/TrainingLoggerAppleHealthService.js:88-219`) into platform-neutral fixtures.

### 26.3 Live Workout foundation

Live Workout stays all-or-nothing Stage 2. Its shared contract is:

- `workout_drafts`: `draftId`, user, status (`active`, `finishing`, `finished`, `abandoned`), selected category IDs, movement/order state, start/local-date/time-zone, `version`, `lastClientSequence`, `editorDeviceId`, lease expiry, last acknowledged time, and schema version.
- child movement/set rows have stable IDs so insert/reorder/edit is not array-position identity; a compact validated snapshot may accompany them for recovery but is not the only queryable identity.
- create returns learned suggestions without selecting them. Movement search filters the canonical exercise library. Preparation stores comparable-occurrence references and prepopulation provenance so later history changes do not invisibly rewrite the draft.
- one device holds a 90-second renewable editor lease. Other devices may read; takeover is explicit after expiry (or explicit release) and creates an audit event. There is no simultaneous merge or silent last-write-wins.
- patches carry draft version, monotonic client sequence, and idempotency key. The client persists locally first and sends after meaningful edits with a maximum five-second delay. An acknowledgement returns accepted sequence, draft version, canonical snapshot hash, and lease expiry.
- recovery compares last acknowledged version/sequence. Unacknowledged local operations are replayed with their original IDs; stale conflict preserves them for review. Abandoned inactive drafts expire after 30 days.
- Finish requires the lease and expected version. One idempotent transaction marks the draft finished, freezes its snapshot, creates one EvidencePackage and pending EvidenceReview, writes provenance/outbox, and stores the finish receipt. Canonical `TrainingSession` creation remains downstream of confirmation and has a unique link to the finished draft/review. PR/progress/celebration work runs only after canonical confirmation.

The Windows interactive preview must use the real DTO schemas and an in-memory/HTTP test adapter to exercise: two prompts, suggestions, filtering/search, preparation/prepopulation, fast confirm/modify, set/movement changes, autosave acknowledgement, kill/recovery, offline replay, lease expiry/takeover, stale conflict, repeated Finish, Evidence Review creation, post-confirm TrainingSession, and Apple Health reconciliation fixtures. Production state/reducer ownership must first move out of `src/app/preview/training-logger/TrainingLoggerPreviewState.js`; the existing browser localStorage service (`src/domain/services/TrainingLoggerDraftRecoveryService.js:1-23`) becomes only a legacy web adapter until cutover.

## 27. Web cutover and canonical migration

### 27.1 Migration rule

Do not dual-write the current JSON store and PostgreSQL in production. The runtime persistence can publish stale collections unless a mutation names the exact collection (`src/data/repositories/founderRuntimeStore.js:244-275`), and many current repositories receive generic callbacks (`src/data/repositories/createSeedRepositories.js:1-100`). Treating that mechanism as a change log would create an unprovable migration.

Use **bulk rehearsal plus a short final read-only write fence**:

1. Build all database/object adapters, application handlers, auth, migration, verification, and rollback tooling against synthetic fixtures and read-only copies. Production remains unchanged.
2. Deploy a compatibility web release that can use either legacy or shared adapters via a server-only flag, but writes to only one backend at a time. It includes an authenticated maintenance/read-only mode and client draft preservation.
3. Take a locked, read-only runtime snapshot plus private-file manifest. Import to staging repeatedly until deterministic verification and representative web/API parity pass. No production Founder record is mutated.
4. Provision production users/auth, database, bucket, worker paused, and import an early baseline while the legacy web keeps operating. This reduces final transfer volume but is never treated as current.
5. Schedule the final cutover. Drain in-flight evidence interpretation/confirmation and cadence work. Enable the write fence: existing web reads may continue from the legacy snapshot, while writes show a short maintenance message and retain client drafts.
6. Under the existing global mutation lock, take the final runtime snapshot and filesystem manifest. Import/upsert the complete deterministic source (not an inferred event delta), upload missing object hashes, and run the critical verifier.
7. If verification passes, switch the server-only canonical-backend flag, run smoke writes with explicit non-Production synthetic/cutover records where allowed or read-only production checks, resume the worker, and enable web writes. Target the fence at under 10 minutes; automatically abort and reopen legacy writes at 15 minutes if the shared platform has not accepted a canonical write.
8. Once any real post-cutover database write succeeds, PostgreSQL remains canonical. Code may roll back to a compatible prior build, but state never rolls back to JSON. Before that first write only, the flag may return to the unchanged final legacy snapshot.
9. Observe for at least seven daily-use days, run two-way visibility and backup checks, then make legacy runtime/file access read-only and remove it from production composition. Retain the encrypted cutover snapshot per the approved retention policy; never resume seed hydration as fallback.

This creates a brief write pause, not a logging blackout or stale dual-write interval. Evidence selected during the fence stays in the browser/client draft until writes reopen. If experience shows the final import cannot reliably fit 10 minutes, implement a lock-safe snapshot copier and repeat; do not introduce ad hoc dual-write.

### 27.2 Deterministic migration manifest

Every migration run has `migration_id`, source revision/commit, runtime SHA-256, source-created timestamp, importer version, target schema version, and a per-domain result. The importer is rerunnable into an empty target and idempotent into its own migration namespace. It fails on an unknown top-level source key, duplicate identity with different content, dangling relationship, missing required owner, missing referenced file, or checksum mismatch.

For each family compare before/after counts, exact legacy IDs, owner, foreign-key relationships, state/status, canonical date/time zone, version/history order, and semantic digest. Include at minimum:

- Founder profile/settings and one authenticated user mapping;
- active/completed Goals, phases, transitions, forecasts/expected trajectories, milestones, phase reviews/strategies/lifecycle records;
- Operating Plan, rhythm/trust/configuration still canonically active, protocols and immutable versions/lineage, energy links, execution/support items, reminders, generated occurrences, completion history;
- weights, Daily/Morning/Recovery Check-Ins, reconciliation history, nutrition, activity, training sessions/sets/performance events/library, photos/PhotoSessions, DEXA scans/appointments;
- evidence submissions/packages/reviews/confirmations, canonical evidence, source artifacts, analyses, provenance edges, correction/reprocessing state;
- every briefing type/version/publication/lifecycle and reconciliation work;
- confidence snapshots/history/continuity/initialization/finalization work and any current pointer;
- migration markers and other active work/receipt collections discovered from `PERSISTED_COLLECTIONS` (`src/data/repositories/founderRuntimeStore.js:15-56`).

File checks compare relative-path inventory, reference count, byte length, SHA-256, detected MIME, remote version/checksum, and authorized readback. Representative golden workflows compare legacy and shared read models for Home, Log, Goals, Plan, priorities, each Progress stream, Confidence, all briefing types, You, Evidence Review, and media. Critical scalar assertions include current active Goal/phase/protocol versions, latest weight, current-day evidence, pending reviews, next occurrences, current briefing, and current Confidence calculation version.

Produce machine-readable JSON and a human summary. Acceptance requires zero unexplained differences; intentional normalization is enumerated with source/target hashes and an approved rule. A dry run always uses copies and a separate database/bucket prefix. The migration tool never calls a production mutation service merely to test parity.

## 28. Observability and release safety

The minimum system must answer what failed, for whom, whether state committed, whether web still works, and whether a native feature can be disabled.

- Every request has request/correlation ID, authenticated user/device/session IDs (opaque), client build, route/command type, duration, result code, and resulting command/operation ID. Logs are structured JSON and redact evidence bodies, tokens, object keys/URLs, PIN/auth material, provider prompts/responses, and health values by default.
- Every critical write has a command receipt and audit event. The operations view can answer `not_seen`, `rejected`, `committed`, `replayed`, or `committed_with_pending/failed_downstream_work` without inspecting raw logs.
- Public `/livez` reports only process liveness and build ID. Platform readiness uses `/readyz` with database/migration and worker-dependency checks but no sensitive details. Authenticated `/api/v1/ops/status` exposes schema/migration version, last successful backup verification, object probe, outbox depth/oldest age/dead letters, worker heartbeat, and deployment build.
- Alert on failed deploy, health/liveness, error-rate threshold, database saturation/storage, worker heartbeat, old/dead outbox work, failed cadence/publication, backup age/failure, and object integrity probe. Start with provider logs/alerts plus a small error aggregator before daily-driver use; do not add a full metrics warehouse.
- Feature flags are server-owned, environment-scoped, audited, default-safe, and may target platform/build/capability. Track B features (Health, notifications, Share, Live Workout) each have an independent kill switch and a documented web/manual fallback. A flag cannot bypass authorization or migrate canonical data.
- Every response supplies server build/API schema identifiers; every mutation audit records them. CI archives OpenAPI/schema fixtures and migration checksum for each immutable deployment.
- Release promotion is staging -> production web validation -> migration/backup check -> native capability enablement. Roll back code through App Platform; repair data forward or restore to a new validated database only under an incident runbook. Always test that web daily-use workflows remain available with every native flag off.

## 29. API compatibility and staged native releases

- `/api/v1` changes are additive: add optional fields/endpoints/enums with unknown handling; never rename/remove/change meaning for a supported build. Database changes follow expand/contract independently.
- Support the currently accepted native build and the immediately previous accepted build for at least 180 days from the newer build's acceptance. If only one build has ever been accepted, it remains supported until a successor completes daily-driver acceptance plus 14 stable days.
- `GET /api/v1/capabilities` returns server API/schema version, minimum/recommended client build, enabled capabilities, per-capability contract version, and fallback destination. Use capability negotiation only where a feature actually varies; do not turn it into a second API version system.
- An old supported build receives the response shape and semantics it already understands while newer fields are ignored. A disabled/unknown feature returns a structured unavailable result and web/manual destination, not corrupt partial behavior.
- Raise the minimum build only for a demonstrated security or canonical-data risk, after the replacement is validated and the Founder approves. Return `426` with a safe message only then. Normal feature evolution must never force installation of an unvalidated build.
- A breaking contract is `/api/v2`, deployed alongside V1 through the documented support window. The web client may adopt new handlers earlier but cannot cause V1 removal. Web compatibility is tested in the same deployment matrix.

## 30. Dependency-ordered Windows implementation roadmap

No significant SwiftUI implementation starts until Phase 8 reaches the named gate.

### Phase 0 — decision lock and privacy containment

| Class | Work | Exit evidence |
|---|---|---|
| **FOUNDATION BLOCKER** | Approve section 18 rows for provider/account/region/budget/operator, enrollment recovery and PIN lockout, cache/object retention, distribution, source-history remediation, and initial privacy expectations. | Signed decision record; named operator; no open choice changes schema/auth/deployment. |
| **WINDOWS VALIDATION** | Inventory tracked/ignored Founder data, private artifacts, secrets, logs, backups, and repository history exposure without changing production. | Versioned inventory/threat model; credential rotation plan; distributable-artifact denylist. |

### Phase 1 — contracts and schema

Implementation checkpoint (2026-08-11): the bounded Phase 1 structural subset is complete and intentionally inactive. Shared contracts, identity/error/command/concurrency primitives, an initial OpenAPI surface, PostgreSQL foundation migration, private-object abstraction, migration-manifest validation, and observability/readiness seams now exist. This is not a production database, authentication, object-store, worker, deployment, domain API, or cutover completion; those remain gated below.

| Class | Work | Exit evidence |
|---|---|---|
| **WINDOWS IMPLEMENTATION** | Add OpenAPI/JSON schemas, error vocabulary, command envelope/receipts, typed destinations, pagination/cache/change-feed contracts, and golden synthetic fixtures. | Contract tests; no DTO exposes a repository, server path, secret, or runtime snapshot. |
| **WINDOWS IMPLEMENTATION** | Add PostgreSQL migrations for identity/control, canonical domain families, versions/history, objects/uploads, outbox/work, occurrences, and future Health/notification/Workout identities. | Empty/upgraded DB tests; all invariants named in section 20 have constraints or transaction tests. |
| **WINDOWS VALIDATION** | Model review against every current `PERSISTED_COLLECTIONS` key and domain inventory. | Explicit mapped/derived classification; zero unowned source keys. |

### Phase 2 — platform adapters and operations

Implementation checkpoint (2026-08-11): production-grade foundation adapters are implemented and validated locally and against provider-backed synthetic DigitalOcean staging. Phase 2 is accepted; production activation, canonical migration, evidence movement, and auth cutover remain separately gated.

| Class | Work | Exit evidence |
|---|---|---|
| **FOUNDATION BLOCKER** | Implement Founder bootstrap, web passkey session, device pairing, opaque access/refresh rotation, authorization principal, revoke/logout, and negative tests. | Unauthenticated/expired/revoked/wrong-user/CSRF tests pass. |
| **WINDOWS IMPLEMENTATION** | Implement PostgreSQL repository adapters/UoW, object receipt/multipart/authorized-read adapters, transactional outbox/worker, structured logging, feature flags, health, build metadata, backup/restore tooling. | Restart/replay/dead-letter tests; object guessing/path traversal tests; restore drill in nonproduction. |
| **WINDOWS IMPLEMENTATION** | Add DigitalOcean app spec/container/deploy scripts for staging and production with web/worker/jobs, runtime-only secrets, trusted database source, health checks, alerts, and manual promotion. | Staging deployment survives restart/rollback and has no persistent local-file dependency. |

### Phase 3 — application boundary and extraction

| Class | Work | Exit evidence |
|---|---|---|
| **WINDOWS IMPLEMENTATION** | Build application handlers and `/api/v1` adapters in dependency order: session/profile; uploads; Log/Evidence/Review; check-ins/weight; Home; Goals; Plan/protocols/priorities; Progress/Confidence; briefings; training/media. | Golden read/command contracts and authorization/concurrency suites pass. |
| **WINDOWS IMPLEMENTATION** | Extract Goals and Operating Plan read-model logic from React, Evidence confirmation from the Next action, Home/runtime dependencies, route/destination mapping, and default Founder repository/file dependencies. | React/Next layers are thin; application handlers run in Node tests with injected adapters. |
| **WINDOWS VALIDATION** | Run legacy/new semantic parity fixtures and all existing adjacent domain regressions. | No unexplained behavioral diff; current web remains unchanged on legacy flag. |

### Phase 4 — migration rehearsal

| Class | Work | Exit evidence |
|---|---|---|
| **WINDOWS IMPLEMENTATION** | Build read-only snapshot/file-manifest importer, deterministic verifier, reports, cutover fence/flag, and rollback scripts. | Repeated isolated imports produce identical IDs/counts/digests/hashes. |
| **WINDOWS VALIDATION** | Rehearse full database/object import, auth enrollment, worker pause/resume, timeout abort, restore, and representative workflows on copies. | Under-10-minute measured final-delta plan; zero production mutation; signed rehearsal report. |

### Phase 5 — production web cutover

| Class | Work | Exit evidence |
|---|---|---|
| **FOUNDATION BLOCKER** | Approve cutover window and encrypted rollback retention after rehearsal. | Go/no-go checklist and communication/abort owner. |
| **WINDOWS IMPLEMENTATION** | Deploy compatibility release, final fenced import, switch web to shared handlers/PostgreSQL/objects, resume worker, and retire ngrok production access. | PostgreSQL is canonical; web daily use succeeds; legacy source unchanged/read-only. |
| **WINDOWS VALIDATION** | Seven-day integrity watch, two-way simulated-client visibility, replay/stale/partial-failure suites, backup and object restore, web fallback drill with native flags disabled. | No unresolved critical discrepancy; old JSON/files absent from production request flow. |

### Phase 6 — shared-client reliability

| Class | Work | Exit evidence |
|---|---|---|
| **WINDOWS IMPLEMENTATION** | Complete change feed/cache validators, operation polling, idempotency retention, concurrent-client simulator, feature/build policy, and capability negotiation. | Old/current simulated clients pass compatibility, conflict, timeout, and lost-response matrix. |
| **WINDOWS IMPLEMENTATION** | Add notification occurrence/intent engine and Health source/checkpoint/reconciliation schemas/fixtures without Apple adapters. | Deterministic evidence suppression and Health replay/correction/deletion tests. |

### Phase 7 — Track A preparation and Live Workout contract

| Class | Work | Exit evidence |
|---|---|---|
| **WINDOWS IMPLEMENTATION** | Extract Live Workout platform-neutral contract/reducer; implement server draft/lease/autosave/finish semantics and the complete Windows interactive preview. | Required preview matrix in section 26 passes; no production import from `app/preview`. |
| **WINDOWS PRE-CODE / MAC ACCEPTANCE** | Prepare Swift DTO/client/state packages, mock Keychain/LocalAuthentication/Health/notification adapters, design tokens, accessibility IDs, and batched Xcode/device checklists. | Source/schema fixtures ready; explicitly not accepted as compiled Apple code. |
| **WINDOWS VALIDATION** | Run the complete Pre-iOS gate audit below. | Gate report says READY or lists blockers; no inferred Apple acceptance. |

### Phase 8 — READY TO BEGIN NATIVE BASELINE

When every exit criterion in section 31 is true, status changes to **READY TO BEGIN NATIVE BASELINE**. Only then begin the Track A SwiftUI shell/client.

### Later Apple work

| Class | Work |
|---|---|
| **MAC/XCODE REQUIRED LATER** | Create/compile/sign Swift package and app; SwiftUI navigation/rendering; Keychain/LocalAuthentication; Photos/file pickers; URLSession/background transfers; deep/universal links; accessibility and state restoration. |
| **MAC/XCODE REQUIRED LATER** | Stage 2 entitlements/adapters: Share Extension/App Group, HealthKit, APNs/UserNotifications/BackgroundTasks, and complete Live Workout UI. |
| **MAC/XCODE REQUIRED LATER** | Archive/TestFlight/App Store metadata, privacy manifests, simulator and physical-device acceptance. Face ID, protected data, real Health/APNs/background/extension behavior, gym ergonomics, and TestFlight lifecycle require physical iPhone evidence. |

## 31. READY TO BEGIN NATIVE BASELINE exit criteria

- [ ] All section 18 decisions marked approval are recorded to the degree needed for Track A; later exact notification/Health timing may remain Stage 2-gated.
- [ ] Founder privacy inventory/threat model is approved; deployable source/builds contain no real Founder seed, private media, provider key, or reusable bootstrap/session credential.
- [ ] Staging and production run outside the workstation with TLS web/API, PostgreSQL, private versioned objects, worker, secrets, health/alerts, feature flags, and immutable build identity.
- [ ] Founder bootstrap, web authentication, iOS device-pairing contract, token rotation/reuse detection, revoke/logout, and negative authorization tests pass.
- [ ] Database constraints, expected versions, idempotency receipts, atomic command transactions, audit/change records, and outbox restart/replay tests pass for every dangerous workflow.
- [ ] Private upload/resume/finalize/read/delete authorization, checksum/type validation, rendition, retention, and object-backup restore tests pass.
- [ ] OpenAPI V1, errors, pagination, ETags, typed destinations, operation status, changes, capabilities, and golden TypeScript/future-Swift fixtures are stable.
- [ ] Required Track A application handlers/read models exist without React, Next route, global Founder repository, runtime JSON, or local-file ownership.
- [ ] Deterministic data/object migration and restore rehearsal passes on copies, including counts, IDs, relationships, critical values, semantic digests, and file hashes.
- [ ] Production web has operated successfully on the new canonical platform for at least seven daily-use days and remains fully functional with every native feature flag disabled.
- [ ] Stale simultaneous edits, lost responses, retries, duplicate confirmations/completions/finish, worker crash, app-kill simulation, and web/native two-way visibility tests pass.
- [ ] The currently accepted/previous-build compatibility and kill-switch policy is implemented and tested with simulated clients.
- [ ] Track A screen/workflow acceptance checklist and batched Mac/simulator/physical-device plan are approved; no Apple-only behavior is claimed validated on Windows.

## 32. Expected implementation change surface

No file in this table is changed merely by this foundation-design decision; it is the anticipated implementation scope.

| Area | Expected files/services |
|---|---|
| Contracts | new `openapi/physiqueos-v1.yaml`, `src/contracts/**`, schema fixtures/generators, typed destination registry; expand `src/navigation/navigationRegistry.js`. |
| Application layer | new `src/application/auth/**`, `home/**`, `log/**`, `evidence/**`, `check-ins/**`, `goals/**`, `plan/**`, `progress/**`, `briefings/**`, `training/**`, `uploads/**`, `operations/**`; one handler per read model/command, independent of transport. |
| API/web adapters | new `src/app/api/v1/**`; thin existing pages/server actions under `src/app/**`; auth middleware/session composition in `src/app/layout.js` and protected route helpers. |
| Database | new `db/migrations/**`, `src/platform/database/**`, PostgreSQL repository adapters and transaction composition; dependencies/scripts in `package.json`. Replace production composition in `src/data/repositories/founderRepositories.js`, `createSeedRepositories.js`, `founderRuntimeStore.js`, and `FounderStoreUnitOfWork.js` while retaining isolated legacy/migration readers until retirement. |
| Authentication | new `src/platform/auth/**`, device/session repositories and operator bootstrap CLI; `UserRepository.js`, You/profile/device screens, middleware, and protected handlers. |
| Objects/uploads | new `src/platform/object-storage/**`, upload/application handlers and migration manifest; replace `src/app/log/upload/route.js`, photo/DEXA upload actions, `EvidenceIntakeService.js` filesystem ports, `src/app/api/private-evidence/[...path]/route.js`, and direct file reads such as `ProgressReportingService.js`. |
| Evidence transaction | `src/app/evidence/review/[reviewId]/actions.js`, `EvidenceReviewService.js`, `CanonicalEvidenceConfirmationCommitService.js`, `PILowerLevelCanonicalEvidenceCommitService.js`, `PostConfirmationOrchestrator.js`, evidence/package/review/canonical repositories and downstream work services. |
| Read-model extraction | `HomeBriefingService.js`/Home screen; `GoalsHubScreen.jsx` and goal actions/screens; Operating Plan page/screen/actions; Priority services; all evidence context/Progress/Confidence services; briefing repositories/services/pages; `YouProfileService.js`. |
| Async/notifications/Health | new `src/platform/jobs/**`, outbox/operation repositories, occurrence/notification intent services, Health source/checkpoint/import/reconciliation contracts; adapt briefing cadence/reconciliation and PI confidence work services. |
| Live Workout | move reusable production ownership from `src/app/preview/training-logger/TrainingLoggerPreviewState.js`; update `TrainingLoggerClient.jsx`, `TrainingLoggerDraftRecoveryService.js`, suggestion/progression/canonical commit/Apple Health services; add application draft/finish handlers and Windows preview adapter. |
| Migration/operations | new `scripts/exportFounderMigrationManifest.mjs`, `importFounderCanonicalStore.mjs`, `verifyFounderCanonicalMigration.mjs`, `cutoverSharedPlatform.mjs`, restore/backup verification and reports. Existing Founder backup/cutover scripts remain read-only references until deliberately retired. |
| Deployment | new `infra/digitalocean/app.yaml` (or equivalent committed app spec), container/build/start scripts, environment templates with no secrets, CI promotion/compatibility checks; retire production responsibility from `scripts/physiqueosNgrokRuntime.mjs`, Windows scheduler/deploy/monitor scripts, and the 50 MB server-action upload path in `next.config.mjs`. |
| Tests | contract/schema/golden fixtures, PostgreSQL integration tests, auth/media negative suites, migration parity, outbox restart, concurrent simulated clients, API compatibility, cutover/rollback, backup/object restore, and web fallback end-to-end tests alongside existing domain regressions. |

Repository-grounded deviation from the prior roadmap: foundation extraction precedes SwiftUI and the production web cutover precedes native dependency. The earlier product aspiration to prioritize Apple Health/Live Workout cannot determine implementation order because the current singleton, filesystem, unauthenticated route, and presentation-owned orchestration are shared-state blockers. Their product scope remains; their sequencing moves behind the shared-platform gate.

## 33. Phase 1 implementation checkpoint

Status on 2026-08-11: **accepted as an additive, production-isolated structural foundation; inactive by design.** The implementation started from clean checkpoint `a4c759fd`. The current JSON/file runtime remains canonical and no existing production module imports or depends on the new foundation composition.

Implemented:

- Versioned contracts for UUIDv7/new identifiers, exact legacy-ID preservation, canonical JSON/request hashing, structured application problems, typed destinations, cursor pagination, command receipts, operations, and authenticated principals.
- An atomic idempotent-command primitive with stable source/occurrence identity, expected-version checking, payload-mismatch rejection, and transactional receipt/outbox behavior.
- A PostgreSQL foundation migration for users/profiles, devices and hash-only credentials, sessions, operations, command receipts, outbox messages, private object metadata/upload intents, worker heartbeats, feature flags, and migration runs. Explicit `node-pg-migrate` up/down definitions and lazy opt-in database composition were added; no database is contacted unless explicitly enabled.
- Private-object contracts and a deterministic in-memory test adapter with ownership authorization and read handles capped at five minutes. No provider URL or server path enters a client contract.
- Correlation IDs, redacting structured logs, build identity, health/readiness/heartbeat primitives, and fail-closed feature flags.
- A deliberately small OpenAPI 3.1 surface: public `/api/v1/health/live`, inactive readiness at `/api/v1/health/ready`, and protected `/api/v1/platform`. The production authenticator denies access as `FOUNDATION_AUTH_INACTIVE`; only tests may inject the explicit test authenticator.
- A deterministic migration-manifest builder that recognizes the enumerated current source collections and fails closed on an unknown source. It reads and validates; it does not import or mutate production.
- A bounded Windows acceptance harness (`npm run validate:foundation`) and single-worker Vitest configuration.

Intentionally inactive or deferred:

- DigitalOcean provisioning, executable deployment specifications, production secrets, PostgreSQL production adapters, database migration/import, object transfer, real Founder enrollment/session activation, a durable worker, domain-facing APIs, and production web cutover.
- SwiftUI, Xcode, TestFlight execution, HealthKit, APNs, Share Extension, and every other Apple-specific implementation.
- Existing Founder runtime persistence and evidence locations are unchanged and remain authoritative.

Validation evidence:

- Focused foundation: 9 files / 32 tests passed serially.
- Persistence isolation: 2 files / 29 tests passed serially.
- Adjacent application services: 4 files / 29 tests passed serially.
- Total bounded regression result: 15 files / 90 tests passed; targeted lint, production build, and `git diff --check` passed.
- Current web smoke checks passed for `/api/health`, `/`, and `/log` against the unchanged production path.
- PostgreSQL/Docker tooling was unavailable locally, so migration acceptance is structural up/down verification rather than a real isolated-database integration test. A real database test remains required before activation.
- The user-authored Aug 10 Nutrition/Activity uploads and Foam Roll/Tesamorelin completions plus the Aug 11 weight moved the legitimate production checkpoint to revision `107`. The bounded acceptance harness observed revision `107`, size `25,964,481` bytes, and SHA-256 `4FBE7875B334ACAE0199AAE223729E75AC4AC89D96EA7CAF830BF9B8F69CDCA1` both before and after validation.

Windows validation constraint: the current worker environment has a 4 GB heap. One unrestricted repository-wide concurrent Vitest run exhausted that environment after approximately ten minutes and mixed production-state-dependent tests across workers. That result is classified as an environment/resource failure with test-order/concurrency contamination, not as evidence of a product regression. Do not repeat that execution mode or increase the heap merely to force it through. Repository-wide coverage remains required, but on this environment it must be executed as explicit deterministic groups, serially or with tightly bounded workers, with production-state-dependent suites isolated. The reusable Phase 1 harness is the accepted checkpoint command unless the environment changes.

No architecture deviation was introduced. The only Phase 1 implementation refinements were the recorded recovery/PIN semantics, passive source-remediation scope, and bounded Windows test execution strategy. Phase 2 subsequently began from the preserved `7e99af27` checkpoint and is recorded separately below.

## 34. Phase 2 implementation and provisioning checkpoint

Status on 2026-08-11: **Phase 2 provider-backed synthetic staging acceptance passed.** The provider run resumed from accepted provisioning checkpoint `403107d1` on dedicated branch `phase2-provider-staging`. No Founder data or evidence was copied, and the production JSON/file runtime remains canonical.

Implemented production-grade foundation adapters:

- PostgreSQL stores for users/profiles, devices, access/refresh/recovery credentials, sessions, passkeys/challenges/pairing, operations, command receipts, outbox messages, stored objects/upload intents, worker heartbeats, feature flags, migration runs, security events, and backup runs.
- Migration `000002_phase2_platform_operations` adds database-enforced cross-owner constraints, passkey/pairing/security state, upload-completion claims and receipts, terminal worker state, and backup metadata. It remains additive to the Phase 1 schema and has explicit down SQL.
- Founder authentication lifecycle behind an inactive boundary: single-Founder enrollment lock, one-time recovery material, device pairing, opaque ten-minute access tokens, rotating refresh families, refresh-reuse family revocation, session/device logout and revocation, replacement-device recovery, authenticated principals, server-side WebAuthn verification, and an eight-digit local-PIN state policy. Face ID/PIN remain local unlock only; no PIN or reusable secret is committed.
- A DigitalOcean Spaces-compatible S3 adapter for private owner-scoped keys, server-initiated multipart uploads, bounded signed part URLs, verified completion receipts, length/MIME/checksum checks where the provider exposes the checksum, five-minute reads, immutable originals, tombstones, interrupted-completion claims, and inventory. Provider identifiers remain internal.
- A durable PostgreSQL outbox worker using `FOR UPDATE SKIP LOCKED`, leases, bounded exponential retry, terminal failure, dedupe constraints, heartbeat, correlation propagation, redacted logs, clean stop, lease-expiry recovery, and replay-safe handlers. No current domain workflow is connected.
- Async operational readiness for database reachability, schema compatibility, optional object-provider reachability, worker heartbeat freshness, and required configuration. Public results expose only stable check codes; deeper composition remains behind the inactive staging flag.
- Guarded `pg_dump`/`pg_restore`, tamper-evident backup manifests, object-inventory support, and isolated-restore naming checks.
- A secret-free DigitalOcean app-spec template, a sensitive rendered-spec workflow, a Founder-data-denying `.dockerignore`, a web/worker container definition, and manual-deploy configuration. The template uses no provider resource ID and has `deploy_on_push: false`.

Local PostgreSQL acceptance:

- PostgreSQL 17.10 was installed locally on dedicated port `55432`; validation is hard-guarded to a database whose name begins `physiqueos_phase2_test` and uses synthetic fixtures only.
- Fresh up, complete schema inventory, ownership/foreign-key constraints, idempotency uniqueness, transaction rollback, receipt/outbox atomicity, optimistic concurrency, opaque access authentication, refresh rotation/reuse revocation, and stored-object relationships passed.
- Sessions/revocations, feature flags, stored-object metadata, command receipts, outbox work, and migration state survived pool/process-boundary restart checks. Expired worker leases were recovered and completed work was not repeated.
- `pg_dump` produced a verified custom-format backup, `pg_restore` restored a deliberately removed durable flag, full down removed the foundation tables, and re-apply recreated the schema. The final local test database contains the re-applied empty foundation schema, not Founder data.

Provider status and provisioning gate:

- Recommended location: App Platform region `sfo`, with Managed PostgreSQL and Spaces in `sfo3`.
- Proposed resources: one 512 MiB shared web container ($5.00/month), one 512 MiB shared worker container ($5.00/month), one-node Managed PostgreSQL 17 Basic Regular 1 GiB ($15.15/month), and one private versioned Spaces Standard subscription ($5.00/month).
- Base recurring estimate: **$30.15/month**, plus only usage overages. No dedicated egress IP, standby database, load balancer, second web instance, or paid monitoring service is included. The plan remains below the approved $50 ceiling.
- Explicit approval is required before creating these paid resources. Provider-backed object behavior, staging deployment, browser passkey behavior, secret injection, managed backup, object backup, rollback, and staging negative tests remain unvalidated until that approval.

Production isolation:

- Phase 2 composition activates only when `PHYSIQUEOS_PHASE2_STAGING_ENABLED=1` plus the explicit database/object flags and required secrets are supplied. Default/current production composition remains inactive and fail-closed.
- Existing production domain repositories, routes, evidence paths, worker workflows, and authentication gate do not depend on the new adapters. The additive readiness route preserves its Phase 1 inactive response unless the staging flag is deliberately enabled.
- No canonical migration, production cutover, evidence move, auth activation, SwiftUI, HealthKit, APNs, Share Extension, or Live Workout Stage 2 work occurred.

Validation failures were classified and corrected rather than suppressed: a restore-credential process-argument leak and a refresh-reuse rollback issue were deterministic foundation defects; a `pg_dump` connection-environment issue was a deterministic backup defect; standalone ESM resolution and one async fake runner were harness defects; and one ownership probe hit an earlier uniqueness constraint because of a synthetic fixture defect. The earlier unrestricted all-files/4 GB limitation remains governed by section 33. No deterministic regression remains after bounded acceptance.

Final bounded acceptance passed Phase 1 (9 files / 32 tests), Phase 2 (7 files / 42 tests), persistence isolation (2 files / 29 tests), adjacent application services (4 files / 29 tests), the standalone PostgreSQL durability cycle, targeted lint, production build, and `git diff --check`. Current and freshly built web smoke checks passed with the shared platform inactive/fail-closed. The Founder runtime remained revision `107`, size `25,964,481` bytes, and SHA-256 `4FBE7875B334ACAE0199AAE223729E75AC4AC89D96EA7CAF830BF9B8F69CDCA1`.

`npm audit --omit=dev` continues to report 13 production-tree advisories (3 moderate, 10 high) in the pre-existing Next/PDF/CSS/image/CLI dependency graph. Dependency tracing does not attribute any reported advisory to the newly added AWS S3 or SimpleWebAuthn packages. No broad or major-version audit fix was applied inside this high-safety foundation patch; dependency remediation remains a separately reviewed release blocker.

The next dependency-ordered phase is Phase 3 application-boundary/domain extraction, but it must not start automatically. Run the end-work-session task and obtain the separately required Phase 3 authorization first. Phase 3 must preserve the current production JSON/file runtime until its own migration/cutover gates are approved.

## 35. Phase 2 provider-backed staging acceptance

Provider acceptance on 2026-08-11 provisioned exactly one App Platform app in `sfo` with one 512 MiB web service and one 512 MiB worker, one PostgreSQL 17 Basic Regular 1 GiB/1 vCPU cluster in `sfo3`, and one private versioned Space in `sfo3`. The recurring base is $30.15/month, below the $50/month ceiling. Safe identifiers, active deployment, overage exposure, and operating details are recorded in `infra/digitalocean/README.md`.

The final staging build is `phase2-provider-staging-5517689` from commit `55176896cb9bd2053c1092538ecbf0aa0a09eb56`. It is a foundation-only container sourced from the dedicated staging branch; `origin/main` remained `403107d14056868194b59861cc55e9f37c9ac6a1`. Encrypted runtime variables contain staging-only database/CA, bucket-scoped Spaces credentials, credential pepper, and operations token. The rendered app spec was streamed to App Platform and not persisted.

Real-provider acceptance passed:

- PostgreSQL fresh migration, schema/constraints/indexes/ownership, transaction/idempotency/optimistic concurrency, strict CA verification, down/reapply, restart, and isolated backup/restore;
- synthetic enrollment/recovery/device/session/pairing, opaque ten-minute access tokens, 30-day idle and 90-day absolute refresh fields, refresh-reuse family revocation, device/session revocation, replacement recovery without canonical deletion, passkey server challenge lifecycle/owner mismatch, and ten-failure PIN recovery policy;
- private/versioned Spaces multipart upload, owner-scoped opaque keys, actual downloaded-byte SHA-256 plus length/MIME checks, replay/concurrent completion, five-minute maximum authorized read, expired/unsigned/cross-owner denial, abort cleanup, tombstone, inventory, and restored object hashes;
- deployed App Platform worker success, bounded retry/dead-letter, heartbeat, restart survival, lease recovery, redacted failure, and no repeat; and
- validated rollback to the prior known-good deployment, health/provider-state preservation, and restoration to the accepted build.

The provider run exposed and corrected four deterministic foundation defects before acceptance: connection-string TLS settings overriding the explicit CA, PostgreSQL command-receipt snake/camel replay mapping, PostgreSQL dead-letter timestamp inference, and trusting upload metadata rather than hashing provider bytes. It also added terminal cleanup for failed object verification and owner-scoped interrupted-upload abort. Standalone backup-manifest import resolution and an initial absent PostgreSQL executable path were harness/environment issues. No deterministic security, provider, migration, durability, or product regression remains.

Final bounded validation passed Phase 1 (9 files / 33 tests), Phase 2 (9 files / 52 tests), persistence isolation (2 files / 29 tests), adjacent services (4 files / 29 tests), guarded provider PostgreSQL migration/backup/restore, targeted lint, production build, `git diff --check`, staging smoke, and deployed worker/rollback checks. `npm audit --omit=dev` remains 13 pre-existing production-tree advisories (3 moderate, 10 high, 0 critical); this provider acceptance added no dependency and no new advisory.

Founder isolation remained exact at revision `109`, updated `2026-08-11T16:26:17.843Z`, size `26,298,071`, SHA-256 `11C73237AB5F8D19738762ED25C45293D539852B70442AF990A2A7266E560188`. Current production `/`, `/log`, and `/api/health` returned 200 after acceptance. Production still does not depend on staging PostgreSQL, Spaces, auth, worker, or App Platform. No production migration, cutover, evidence move, auth activation, Native Baseline, SwiftUI, HealthKit, APNs, Share Extension, or Live Workout Stage 2 work occurred.

## 36. Phase 3 application boundary checkpoint

Status on 2026-08-11: **implemented on dedicated branch `phase3-application-boundary` from exact accepted baseline `bbb96894dde752d1ffd7e655a3e58a4aedd77f31`; final bounded acceptance is recorded in the readiness checkpoint.** Neither `origin/main` nor `origin/phase2-provider-staging` was changed, and no branch was pushed during implementation.

Phase 3 adds authenticated presentation-independent read handlers for Home, Log/day, Evidence Review, Goals, Operating Plan, Priorities, Progress Intelligence, Confidence, all briefing types, Training, and You/profile. It adds task command contracts for the approved daily writes, typed destinations with explicit web mapping, a DST-safe owner-local date contract, and authorized-media delivery through current-local and future-Spaces adapters. The full workflow ownership map and intentional representation differences are in `docs/PHASE3_APPLICATION_BOUNDARY.md`.

Only three web compositions were individually activated after deterministic parity proof: Goals Hub composition, Log/day composition, and Operating Plan composition. Their React components retain visual ownership. No broad page cutover occurred. The inactive compatibility principal is in-process web-only and is rejected as an API authorization mechanism.

OpenAPI is `1.0.0-foundation.3`. Protected `/api/v1/capabilities` is the only new HTTP endpoint. It remains fail-closed as `FOUNDATION_AUTH_INACTIVE`; no authenticated Founder domain API or unauthenticated Founder data surface was created. JSON/file persistence and current local evidence remain canonical.

Phase 3 did not deploy or change DigitalOcean staging, alter the production deployment pinned to `dee69adb366b386d4f2e4999d688532f37fc37e8`, migrate Founder data, move evidence, activate authentication, cut production web to PostgreSQL, or begin Native Baseline/SwiftUI/HealthKit/APNs/Share Extension/Live Workout Stage 2 work. Phase 4 remains separately gated and must start with synthetic/copy persistence adapters and command-port parity before any production migration or cutover proposal.

Final bounded acceptance passed 38 files / 216 tests: Phase 1 9/34, Phase 2 9/52, Phase 3 9/44, persistence isolation 2/29, adjacent services 4/29, production Confidence parity 1/6, and extracted web presentation regressions 4/22. Targeted lint, isolated production build, `git diff --check`, and isolated smoke for `/`, `/log`, `/goals`, `/profile/operating-plan`, `/api/v1/health/live`, and protected `/api/v1/capabilities` passed. The separate pinned production instance continued returning 200 for `/`, `/log`, and `/api/health`. The isolated build directory and server were removed/stopped; the live production process was untouched.

Founder integrity was identical immediately before and after validation: `founder-seed-v2`, revision `110`, updated `2026-08-12T02:05:50.820Z`, 26,402,081 bytes, SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D`. Revision 110 is the accepted fresh baseline after the user's legitimate Aug 10 nutrition upload and Tesamorelin/Foam Rolling completions; Phase 3 made no canonical runtime mutation.

Failure classification: the first generic-briefing fixture exposed that the legacy classifier's `unknown` sentinel prevented declared future types from surfacing, a deterministic application-boundary defect corrected before acceptance. Static Goals tests that searched for orchestration strings in React became test-fixture defects after the authorized extraction and now inspect the application service. PowerShell's disabled `npm.ps1` was an environment-shell constraint; `npm.cmd` is the accepted invocation. A deliberately grouped production-dependent legacy run reproduced the documented 4 GB heap exhaustion and also encountered stale protocol-reconciliation expectations plus current Retatrutide-state assumptions; these are respectively environment/resource, unrelated pre-existing fixture mismatch, and production-state-dependent results, not accepted signals. The final harness isolates bounded deterministic groups and leaves none unresolved. The build continues to report the known pre-existing broad filesystem trace from `EvidenceIntakeService`/the upload route.

## 37. Phase 4 persistence rehearsal checkpoint

Status on 2026-08-11: implemented and locally accepted on `phase4-persistence-rehearsal` from exact Phase 3 checkpoint `694d3cac7158c3ebdbafcef6a61699be52d5937a`. The schema, copy/export/import contract, rollback evidence, timings, and draft production runbook are canonical in `docs/PHASE4_PERSISTENCE_REHEARSAL.md`.

Phase 4 adds ten bounded PostgreSQL domain families covering every one of the 42 canonical source collections, explicit ownership/identity/version/date/source/provenance fields, relationship/media/import metadata, deterministic copy-only export/import tooling, local private-object migration, and a non-production composition for the same Phase 3 read and command boundary. It does not store the complete runtime as one opaque blob and it does not activate this composition in production.

The realistic local snapshot contained revision 110, 1,220 canonical records and 361 private media objects (271,434,316 bytes). Two fresh imports produced identical database/media digest `63413b01be8e211b9406dfec766ec2b646dd95d07b17416888eea7dc1867ed47`; export bytes, counts, exact IDs, relationships, critical values, and media hashes were deterministic. Seventeen read surfaces and all 17 commands passed parity. Rollback/reset, interrupted transaction, replay/payload drift, expected-version concurrency, duplicate occurrence/source identity, cross-owner denial, verified backup/restore, migration down/reapply, and post-restore parity passed.

Measured local work was 1.929 s snapshot copy, 1.697 s export/inventory, 2.143-2.471 s database import, 1.674 s local media copy, 0.974-1.018 s validation, and 1.389 s read parity. The future production fence remains a 2-5 minute operational estimate with an under-ten-minute target; no fence occurred here.

Production JSON/file state and local evidence remain canonical and unmoved. No production deployment, route composition, authentication, DigitalOcean resource, recurring cost, staging state, Founder data, or evidence was changed. Phase 4 is a rehearsal only and does not authorize Phase 5, production cutover, Native Baseline, SwiftUI, HealthKit, APNs, Share Extension, or Live Workout Stage 2.

Final bounded acceptance passed 38 files / 200 tests, the complete guarded PostgreSQL cycle, targeted lint, production build, isolated smoke, `git diff --check`, current production smoke, and generated-data/secret scans. Founder revision 110 and SHA-256 `8D5E31EB50AE2CC5487024C18989D0AC167BE2D2AFB353D6BAE18F7A269F453D` remained exact. The first smoke attempt was a deterministic harness-path defect and was corrected before the complete passing rerun; the pre-existing Turbopack filesystem trace warning remains. Run the end-work-session task before requesting Phase 5.

## 38. Phase 5 production-cutover readiness checkpoint

Status on 2026-08-11: **Phase 5 technical acceptance passes on local and live synthetic DigitalOcean evidence; production migration remains separately gated and is not authorized.** Work is isolated on `phase5-cutover-readiness` from exact Phase 4 checkpoint `622ba8dd8684c36107dc6c6c49bc39080eb53a4f`. The operational record, runbook, rollback matrix, checklist, and authorization packet are in `docs/PHASE5_CUTOVER_READINESS.md`.

Phase 5 adds an all-42-collection synthetic runtime/package generator, additive provider media validation metadata, a DigitalOcean PostgreSQL/Spaces application composition using the same Phase 3 contracts, provider-only media/operations harnesses, strict database/bucket/owner/CA guards, and executable cutover/auth/compatibility/rollback policy tests. An AES-256-GCM application grant keeps provider URLs, paths, keys, and versions out of client DTOs and rechecks owner/expiry on server-side redemption.

At scale 10 the synthetic package contains 370 canonical records and three tiny synthetic media objects. Local PostgreSQL import/validation, 17 read surfaces, all 17 commands, stale/replay/payload-drift/concurrency/duplicate/atomic-outbox/ownership protections, and isolated backup/restore passed. Package digest is `49f8f0698aeb7fd6b492472343eafbb4f454562a4af5abe31ecd88a2b42bb507`; restored database/media digest is `ed66b5062569f9f6148bcd511b62721767eab15bb0cf55f9b9ccb5cda611678a`.

The hardened runbook separates persistence/media cutover from authentication. Web moves to PostgreSQL/Spaces first with auth inactive and a bounded server-only compatibility principal; recovery credential/passkey enrollment occurs only after shared-store web stability. The production artifact lifecycle is locked: stop canonical process/task, build/preflight in isolation, atomically promote, restart, and verify routes/assets/build identity/runtime ownership. Never rebuild canonical `.next` in place while an older process serves it.

The provisional production write fence remains 2-5 minutes with a ten-minute hard approval boundary before first PostgreSQL write. After any accepted PostgreSQL write, JSON is never blindly restored as canonical. Web remains the first shared-state client and permanent fallback. `/api/v1` stays additive, supports current plus previous accepted native builds for at least 180 days, and keeps independent future native kill switches.

Live provider acceptance passed on the existing $30.15/month staging footprint: 42 collections / 370 synthetic records, three versioned objects / 111 bytes, 17 read surfaces, 17 commands, concurrency/retry, encrypted opaque media handles, dependency readiness, real App Platform restart, and exact backup/isolated restore. Provider critical work measured about 40 seconds excluding restart and about 83 seconds including restart, supporting the 2-5 minute estimate and ten-minute hard boundary. The temporary firewall, restore database, and dump were removed; the accepted synthetic test database/objects remain. No full-access token, new Space key, paid resource, cost change, Founder upload, production deployment, auth activation, evidence move, or write fence occurred.

Phase 5 is **ACCEPTED** for rehearsal/provider readiness. The later final operational audit found that production execution still lacks an executable write fence and production-guarded migration/composition wrapper, so migration is **BLOCKED**, not authorized. The immutable compatibility release is accepted, but operator/abort/alert ownership, alert delivery, encrypted off-machine backups, missing safety controls, and the migration-window go/no-go remain separately gated. This is not Native Baseline.
## 39. Phase 6 compatibility-release acceptance (2026-08-12)

Phase 6 is accepted as a compatibility deployment against the unchanged Founder JSON/file runtime. Exact source `6f4976101cb21eb9d3a7e28ee9a960fcf34141c7`, production build `RmjN47V8xsq3-6jSlZh-9`, refreshed Founder revision `119`, deployment evidence, operational ownership, alerts, backups, migration authorization packet, and the unstarted seven-day stabilization plan are canonical in `docs/PHASE6_COMPATIBILITY_RELEASE.md`.

This is a deliberate roadmap clarification: Phase 6 is the compatibility-release acceptance gate before canonical migration, not Native Baseline. PostgreSQL, Spaces, Founder authentication, production migration, the write fence, and every Apple/Native capability remain inactive and separately gated. Rehearsal evidence is accepted, but execution is blocked on the missing fence/wrapper implementation plus user approval of named ownership, verified alert delivery, encrypted off-machine backup/retention, the exact window, and final go/no-go.

## 40. Final operational migration-authorization audit (2026-08-12)

The final non-migration audit is canonical in `docs/PRE_IOS_OPERATIONAL_MIGRATION_AUTHORIZATION.md`. It verified the exact Phase 6 source/build and healthy production task, fresh revision-119 runtime, all-42-collection current-copy export, 365 media hashes, deterministic package, repository/runtime bundle restore, exact application-artifact copy, live staging readiness, online PostgreSQL, and fresh provider backup without changing canonical production.

The audit corrected an earlier readiness overstatement: the accepted source contains guarded rehearsal tools and rollback policy, but no executable write-only maintenance fence, canonical backend switch, or production-guarded migration wrapper. Alert/billing policy visibility and delivery are also unverified with the available scoped token, and the fresh backup candidate is local/unencrypted without a verified off-machine replica. These are hard false gates. Classification is **BLOCKED**, and migration is not authorized. The missing operational-safety implementation must be separately approved, implemented, bounded-tested, and compatibility-accepted before a final go/no-go.

## 41. Executable operational-safety gate (2026-08-12)

The separately approved safety patch closes the missing source gate with a tamper-evident durable migration-control state machine, central legacy repository/runtime/UoW interception, Phase 3 command fencing, early upload guards, canonical-store epoch protection for receipts/outbox, deterministic legacy/PostgreSQL application-composition selection, bounded operational commands, status/audit reporting, and one strict-order dry-run/execute migration orchestrator. Exact architecture and evidence are canonical in `docs/PRODUCTION_WRITE_FENCE_AND_MIGRATION_WRAPPER.md`.

The live repository inventory has zero unknown methods. While fenced, reads remain available and writes receive a structured 503 proving the request was not applied. Legacy writes fail closed after PostgreSQL selection. Two fresh guarded local PostgreSQL runs migrated all 42 collections and 365 media objects from an immutable revision-119 copy in 10.617 s and 10.528 s fenced time. An import failure returned safely to unchanged legacy; a post-first-write failure entered PostgreSQL `recovery-required` and prohibited stale-JSON rollback.

The Founder/user is approved for every Founder-stage operational role. At source acceptance this capability was inactive and not deployed; the later section 42 supersedes that deployment status. Production migration remained **BLOCKED** on alert/billing delivery, encrypted recovery coverage, retention, published/inactive deployment acceptance, exact window, and explicit final go/no-go. Phase 7, Native Baseline, SwiftUI, authentication, and migration did not begin.

## 42. Inactive operational-safety deployment acceptance (2026-08-12)

Exact published checkpoint `e3b4f4505e9c2b5598901b002271933f45c24dbf` was built in isolation and deployed as immutable build `HasDoRm5cgRE0FsXZU1Uu` through the canonical stop, atomic promote, scheduled-task restart, and rollback-on-failure lifecycle. The previous accepted build `RmjN47V8xsq3-6jSlZh-9` is retained at `.next.rollback-33020`.

Production migration control is `inactive / legacy-json / legacy-json`, with reads and writes enabled, no fence ID, no migration operation, and no PostgreSQL first-write boundary. The private server-local control is `private/founder/migration-control.json`; it was initialized once before promotion and survived an additional canonical restart byte-identically. JSON/file and current local evidence remain canonical, PostgreSQL and Spaces remain noncanonical, and authentication remains inactive. No fence was activated, no migration ran, and no evidence moved.

Founder revision `119`, size `26,955,008`, updated `2026-08-12T16:02:21.133Z`, and SHA-256 `CC4903F96145FB3A3059010A6DE4ED1B9A31DD4FEC3A4D6CF6A10D9CCEBF4281` were unchanged before deployment, after deployment, and after restart. Bounded Phase 1-6, Training, Photo, ownership, persistence, migration-safety, lint, diff, isolated-build, local/LAN/public route, asset/MIME, and authorized-media checks passed. No in-app browser session was available, so no visual acceptance is claimed.

The verified off-machine repository checkpoint at `G:\My Drive\PhysiqueOS Backups\PhysiqueOS_Backup_2026-08-12_16-40-49` preserves exact commit `e3b4f450...` with verified bundle SHA-256 `BE6686ACE1237AFF1325D8B95B3EB01DBFA55AA42054F451FA207507E5DA0E07`. It closes the prior missing independent checkpoint-replica gate. The later section 43 supersedes its intentional lack of Founder runtime/control bytes with a separate encrypted recovery archive and restore proof.

The inactive-safety deployment gate is **CLOSED**. The later section 43 closes provider alert/capacity/delivery, billing, Spaces, encrypted recovery, and retention. Production migration remains **BLOCKED** on the exact window and explicit final go/no-go. Phase 7, Native Baseline, SwiftUI, authentication, and migration remain unstarted.

## 43. Provider observability and encrypted recovery acceptance (2026-08-12)

The later operational-readiness patch closes the provider-alert, delivery, billing, capacity-warning, Spaces, encrypted-recovery, off-machine-replica, restore, and key-custody gates. Eight App Platform alerts, three PostgreSQL 70%/10-minute alerts, and one credited two-region staging-readiness Uptime alert are active to the Founder account email. A harmless global-down signal produced an email the Founder confirmed receiving. The Founder attested that the user-only $40 billing alert is active. Recurring base remains $30.15/month.

Fresh Spaces inspection proved versioning enabled, anonymous bucket/object reads denied, authenticated readback successful, five live objects / 178 bytes, 11 versions / 400 bytes, and no incomplete multipart upload. PostgreSQL remains online on the one-node 10 GiB plan with green readiness and a latest 0.0683214 GiB managed backup. The app-only database firewall was preserved; no operator trusted source was added.

The 577,876,390-byte `age`-encrypted recovery archive has SHA-256 `D6C4729FA33D83B9A5A080323CB64E143E61839D2F0B0B6D3FE96A1848C93E48`. Local and independent `G:` copies match. Isolated decryption verified 402 packet entries, all 365 media hashes, revision-119 runtime, inactive control, repository checkpoint `c55141dd53dabf3d0d7da2b82ec50f8beaae8b5e`, accepted build, rollback build, migration package, scripts, and runbooks. Plaintext workspaces and the temporary DPAPI secret were deleted; the primary recovery secret exists only in the Founder's password manager. See `docs/ENCRYPTED_MIGRATION_RECOVERY.md`.

The Founder explicitly approved the complete 35-day minimum retention policy
and all listed exit conditions on 2026-08-13. This does not authorize later
deletion, which still requires its own explicit review. Production and Founder
state were not mutated: JSON/file and local evidence remain canonical, the
fence remains inactive, reads/writes remain enabled, and PostgreSQL/Spaces/auth
remain noncanonical/inactive. Migration is **BLOCKED only on exact-window
approval and a separate final go/no-go**. Phase 7, Native Baseline, and SwiftUI
remain unstarted.

## 44. Final-gate migration remediation source checkpoint (2026-08-13)

The final pre-fence gate later identified three narrower blockers: the accepted orchestrator had no single executable production runner and the live web application did not consume its provider composition; current-copy export tooling still stamped the historical Phase 3 commit; and managed PostgreSQL backup age could not be independently established at authorization time. The remediation source now provides one dry-run/execution runner over the accepted orchestrator, durable mode/epoch-selected live composition, a selector-backed shared repository facade with fail-closed direct PostgreSQL writes, trusted typed source identity, import-time identity matching, production Spaces media adapters, and a read-only DigitalOcean backup verifier with a hard 24-hour threshold.

The actual runner passed twice against fresh guarded local PostgreSQL targets using the immutable revision-119 copy: 42 collections, 365 media objects, 17 read surfaces, identical import digest `dbac5c9c...acc6`, a durable representative PostgreSQL write, and 12.258/11.464-second fenced intervals. A deliberate pre-write failure returned to legacy with no first write; a post-write failure entered `recovery-required`. Phase 1-6 and focused remediation gates, isolated build `4ezOZsM1Bzn_CL3b05yuR`, 20 routes, 25 assets, and Founder-integrity checks passed. Current production remains build `HasDoRm5cgRE0FsXZU1Uu`, inactive legacy JSON, and unchanged Founder revision 122.

The independent backup sub-gate is now closed. DigitalOcean API v2 verified exact cluster `f544596d-594e-4aa4-a0a8-533bda0992c6` (`physiqueos-p2-staging-pg`, PostgreSQL 17, `sfo3`) online, with latest managed backup `2026-08-13T06:54:12.000Z`, age 13.527 hours at `2026-08-13T20:25:48.094Z`, size 0.06846476 GiB: **PASS** under the 24-hour rule. The database-read-only PAT was not recorded. The source still requires checkpoint publication and a separately approved inactive compatibility deployment before live composition readiness can be credited. No fence, migration, persistence switch, evidence movement, authentication activation, Phase 7, Native Baseline, or SwiftUI work occurred.

## 45. Windows production-runner entrypoint compatibility (2026-08-13)

The exact-checkpoint inactive-deployment preflight found one remaining executable defect: Windows passed the production adapter as a raw absolute `C:\...` path to ESM `import()`, which Node treated as the unsupported `c:` URL scheme. The production-migration-only loader now uses standard `pathToFileURL()` conversion for filesystem paths, keeps valid file URLs and package specifiers usable, resolves relative paths deterministically, restricts the accepted production adapter to its scripts root, and rejects unsupported URL schemes and path escape.

Windows-specific regression coverage imports a real module from a path with spaces and spawns the actual production CLI against a synthetic non-mutating environment. It reaches `ProductionMigrationRunner` and the accepted orchestrator, executes the full dry-run preflight list, supplies no final GO, and records no control transition. The final exact committed build and real-adapter dry-run remain part of the inactive-deployment gate. Production remains `e3b4f450...` / `HasDoRm5cgRE0FsXZU1Uu` in inactive legacy mode; no fence, migration, persistence switch, evidence movement, authentication activation, Phase 7, Native Baseline, or SwiftUI work occurred.

## 46. Canonical collection inventory contract v2 (2026-08-13)

The real Windows adapter dry-run reached inventory and exposed that the historical 42-collection Phase 4 package had counted three code-hydrated entries that were never part of persisted Founder JSON. Raw revision 110, accepted revision 119, and current revision 122 all have 39 persisted canonical collections and omit the same three keys; no schema migration removed them. The stale registry originated in `7e99af27af69c912d8d5b6219d2afc4ac3f67618`, when the normalized application runtime rather than raw persistence ownership became the package shape.

Contract `founder-canonical-collections-v2` and package/manifest version 2 explicitly classify the exceptions. `operatingRhythm` is **derived/noncanonical state** whose currently effective Founder context remains code-owned and composed at read time. `adaptiveTrustProfile` is **future-only/inactive design collection** and has no production consumer or command. The old standalone `milestones` collection is **deprecated/retired**; future Forecast milestone structures remain nested Goal/phase design and are not this empty legacy seed. The migration has 39 required persisted collections, zero optional persisted collections, and three excluded names. Historical inputs containing an excluded key are recognized and recorded but not migrated.

Revision 122 current-copy export found 39/39 required, zero optional, three excluded absent, zero unknown, zero missing mandatory, 1,259 records, 6,612 relationships, and 372 media files. Its two package exports were byte-identical. The no-placeholder rule is executable: normalization cannot manufacture a missing mandatory collection; unknown or missing mandatory input fails closed; excluded values never create package keys or rows. Founder operating-rhythm presentation parity is preserved by an explicit noncanonical composition overlay, while no current read/write path depends on adaptive trust or the retired standalone milestones collection.

The exact-checkpoint build, bounded Phase 1-6/migration/persistence/security/Training/Photo validation, isolated legacy smoke, and credential-backed real Windows CLI dry-run pass. The CLI verifies recovery, current managed backup, guarded PostgreSQL, private Spaces, wiring, provider composition, corrected collection inventory, and the no-final-GO dry-run boundary without changing control or canonical state. This checkpoint is **READY FOR INACTIVE DEPLOYMENT** only. No deployment, fence, migration, persistence switch, evidence move, authentication activation, final pre-fence go/no-go, Phase 7, Native Baseline, or SwiftUI work occurred.

## 47. Current-lineage encrypted recovery acceptance (2026-08-13)

The prior encrypted recovery packet was correctly rejected as current evidence
after Founder runtime/media activity and migration remediation advanced beyond
its revision-119 lineage. A fresh read-only capture now covers revision 122,
all 372 media files, exact inactive control, deployed source/build
`4f82619bd03c8f20331a45e126e1cfa79f199d2d` /
`itQ9UXmsDRPssBzrFTPc5`, retained rollback, package-v2 migration tooling,
current runbooks, a verified source bundle, and fresh secret-free provider
inventory.

The current encrypted artifact is 769,020,390 bytes with SHA-256
`E8E63CACB09F706D8CBD939E3536D3807DF070D67CC8B156448F7548D47AF741`.
Its independent Google Drive copy is byte-identical. Isolated decryption
verified all 6,596 packet files, runtime/control/media hashes, source
reachability and `git fsck`, both build identities, and nonmutating loading of
the production runner, orchestrator, Windows CLI loader, package-v2 exporter,
39-required/3-excluded registry, composition selector, and provider adapters.
No live credential or recovery passphrase was included.

Temporary plaintext and decrypted artifacts plus the DPAPI passphrase copy
were removed after verification. Production remained healthy and writable in
inactive legacy JSON mode; there was no deployment, restart, fence, migration,
evidence move, provider mutation, authentication activation, Phase 7, Native
Baseline, or SwiftUI work. The recovery refresh is accepted and permits a new
final pre-fence gate, subject to fresh live-alignment/backup checks and separate
migration authority.

## 48. Provider-side production dry-run execution boundary (2026-08-13)

The final pre-fence gate correctly rejected a Windows-hosted provider check: the
managed PostgreSQL firewall trusts only App Platform app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`, so the operator host timed out rather
than proving target health. The firewall remains unchanged. Production
provider checks are now designed as a control-plane/provider-plane operation:
Windows validates the live build, Founder runtime, migration control,
collection contract, rollback artifact, and encrypted packet; it submits only
those nonsecret identities to a protected App Platform endpoint. A durable
PostgreSQL migration-run/outbox record is then claimed by the existing worker,
which invokes the accepted `ProductionMigrationRunner` and
`ProductionMigrationOrchestrator` inside the network boundary already trusted
by PostgreSQL and Spaces.

The remote command is fixed to `dryRun=true`, has an explicit operation and
correlation ID, exact operator/environment/source/build/runtime/control/
recovery identities, canonical payload fingerprinting, exact-replay
idempotency, payload-drift rejection, and no arbitrary command field. The
existing operations bearer token protects submit and status. Ordinary product
sessions and anonymous requests have no access; product authentication remains
inactive. Database, Spaces, provider-API, and recovery secrets remain encrypted
server environment variables and are neither accepted in the request nor
returned in status or logs.

The deployment attestation pins Founder revision `122`, runtime SHA-256
`92EE630BD314A6AB6D3F6F66D1B54D441BE508C91E50AB5FFD6A116A02D11D1C`,
and 372 media files / 276,646,284 bytes with deterministic inventory SHA-256
`5BED8E9231031F10F58AA189116E7054F2CE2CA2607D30C4D7AE2F987D715391`.
The Windows client recomputes these live; any later legitimate Founder/runtime
or media activity blocks the remote request until recovery evidence and the
provider attestation are refreshed together.

The worker performs private PostgreSQL connectivity, exact cluster-host and
PostgreSQL-17/schema checks, DigitalOcean backup freshness under 24 hours,
private/versioned Spaces and incomplete-multipart checks, provider composition
construction, package-v2/manifest-v2 availability, and the 39-required/
3-excluded contract through the same accepted runner. Target database counts
and Space inventory are digested before and after; any change fails the dry-run.
The provider control store is immutable and throws on transition. Windows
direct use of the production adapter against a DigitalOcean host now fails with
`MIGRATION_PROVIDER_EXECUTION_BOUNDARY_REQUIRED` and never silently falls back
to a direct connection.

This capability is source-only until a separately authorized App Platform
compatibility deployment and synthetic remote rehearsal complete. Deployment
must not add a paid component, weaken the firewall, enable the fence, import
Founder data, move evidence, select PostgreSQL, or activate authentication.

## 49. Provider-side production dry-run live acceptance (2026-08-13)

Checkpoint `73c612a539ba056e5dd3b0634a80859f83910787` is deployed on
DigitalOcean App Platform as provider build `provider-dry-run-73c612a`.
Deployment `0d27de79-169a-4fda-a16c-ad868d46b7e4` retains one 512 MiB web
component and one 512 MiB worker, the existing alerts, and the existing
$30.15/month resource topology. The capability remains inert at startup and
can be reached only through the authenticated fixed dry-run operation.

The operations-authentication incident was a workstation credential-loading
error: the accepted DPAPI file contains a `PSCredential`, with the bearer token
in its protected password field. Loading the object as though it were a scalar
produced the observed 401. Correct extraction authenticated successfully;
missing, wrong, stale, and ordinary product credentials remained 401. No token
rotation, authentication weakening, or product-authentication activation was
required.

Exactly one accepted operation,
`phase6-provider-dry-run-20260814-0330`, ran from the existing App Platform
worker and reached terminal `succeeded` / `READY`. It verified PostgreSQL
17.10, schema `000004_phase5_provider_readiness`, logical database
`physiqueos_phase5_test_provider_20260811`, the 39-required/3-excluded
collection contract, package/manifest v2, worker health, and private/versioned
Spaces with zero incomplete multipart uploads. The database connection uses
the provider's TLS public hostname from App Platform because this app has no
VPC; the managed-database firewall still has exactly one trusted source, app
`bf57cf56-48cc-4cd6-90e4-a23ee5381741`. No workstation rule or broader source
was added.

The independently read managed backup was `2026-08-13T06:54:12Z`, 19.759
hours old at remote verification, size 0.06846476 GiB, and passed the 24-hour
rule. The canonical target/Space digest was identical before and after:
`d388cca324ed6f45044c6f3256d485e5bc1fb09b5ef9b2507fa62d5d4fc312ae`.
Founder revision 122 and its runtime/media/control/recovery identities remained
exact. Production remains fence-inactive, `legacy-json` epoch and composition,
reads/writes enabled, no migration operation or first PostgreSQL canonical
write, local evidence canonical, and production authentication inactive.

This closes the provider-side dry-run acceptance gate only. The final
pre-fence GO/NO-GO may now be repeated after the required repository
checkpoint. It does not grant final GO, migration execution, a write pause,
Founder import, canonical-store switch, evidence movement, authentication
activation, Phase 7, Native Baseline, or SwiftUI work.
## 43. Combined provider-runtime and persistence architecture revision (2026-08-13)

The persistence-only and App-Platform-first/legacy-persistence sequences are superseded. The selected pre-iOS architecture is one coordinated transition from the Windows full product plus legacy JSON/media to the App Platform full Next.js product plus authority-gated worker plus PostgreSQL/private Spaces. The reason is structural: Windows cannot consume the App-Platform-only database target, while App Platform cannot safely host canonical JSON/media on ephemeral disk. No bridge, temporary durable legacy store, dual writer, or shadow canonical client database is introduced.

The source now contains a full provider product image/spec, PostgreSQL-backed complete Founder runtime composition, transactionally authority-gated mutations, private versioned media upload/read composition, a durable runtime-authority state machine, transfer receipts, worker gating, and a combined rehearsal orchestrator. Provider mode fails closed rather than falling back to the Founder file runtime. Web and future iOS remain peer clients of the same application/API boundary, PostgreSQL state, and private media ownership model.

The authoritative design, phase sequence, one-time fenced transfer, routing/control/worker handoff, first-provider-write boundary, rollback rules, security model, timing gate, cost, and future authorization sequence are in `docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md`. This checkpoint does not deploy the product image, change public routing, activate a fence, migrate Founder data/media, alter authentication, or begin iOS work. The previous final migration GO is permanently invalid.

## 44. Provider compatibility remediation (2026-08-14)

Provider packaging now treats repository-root `tmp` as forbidden private/generated input independently from `.tmp`. Current tracked Founder-derived Playwright runtime and private briefing-image copies are removed forward-only, while Docker context, Next tracing, runtime-layer pruning, and an independent artifact scanner enforce the boundary. No Git history rewrite occurred.

The shared web/iOS backend architecture is unchanged. Migration `000005` adds an explicit durable non-authoritative compatibility state for isolated provider data. It cannot own public routing or migration control, cannot enable production writes or combined execution, and cannot record the provider production first-write boundary. Compatibility web commands, uploads, and worker work require that exact state and guarded Phase 5 database; normal production provider mode retains strict authority acquisition. Live provider preparation and deployment remain separately gated.

Provider packaging now treats a known Founder owner identifier as a hard artifact violation. Legacy seed defaults are detached from production repository factories, the standalone web trace excludes scripts/tests, and the worker is copied from a deterministic provider-safe dependency graph rather than the whole source tree.
