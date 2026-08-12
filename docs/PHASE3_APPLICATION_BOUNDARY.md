# Phase 3 application boundary inventory

Status: implementation candidate on `phase3-application-boundary`, based exactly on accepted Phase 2 checkpoint `bbb96894dde752d1ffd7e655a3e58a4aedd77f31`. The production deployment remains pinned to `dee69adb366b386d4f2e4999d688532f37fc37e8`; this document does not authorize promotion or cutover.

## Boundary model

The Phase 3 application layer accepts an authenticated principal, calls existing canonical domain services and repository ports, and returns a bounded versioned result. `createInactiveLegacyWebContext` is the sole compatibility composition for selected in-process web reads while production authentication is inactive. It derives the existing current Founder from the canonical repository and is explicitly barred from API authorization. All `/api/v1` routes continue through the fail-closed production authenticator.

The JSON/file repositories and current local evidence files remain canonical. PostgreSQL and Spaces are not activated for product reads or writes. No production data or file was migrated.

## Workflow ownership inventory

| Workflow | Presentation / entry | Existing canonical ownership and writes | Phase 3 classification and boundary |
| --- | --- | --- | --- |
| Home | `/`, `HomeScreen`, `HomeBriefingService` | Founder repositories; daily focus, goal, evidence, Confidence and briefing services; runtime store only for existing Confidence publication state | Read-model ready through `home.v1`; runtime-store dependency is injected. Web activation deferred. |
| Log/day | `/log`, `LogHubScreen` | evidence-review and canonical evidence repositories; `LoggedTodayService`; date grouping uses user timezone | Read composition extracted to `LogReadService`; `/log` individually uses the in-process legacy principal. |
| Evidence intake | `/log/upload` and evidence routes/actions | `EvidenceIntakeService`, private-file intake, review repository | `evidence-intake.create.v1` command contract; canonical port binding remains in-process and production file location is unchanged. |
| Evidence Review | review page and route-local actions | `EvidenceReviewService`, presentation service, review repository, post-confirmation orchestrator | `evidence-review.v1`; edit/confirm/dispose commands with principal, idempotency and expected version. |
| Weight | Log/check-in actions | weight repository and confirmation ingestion | `weight.submit.v1`; owner comes only from principal. |
| Nutrition | upload/review/confirmation screens and actions | evidence review, nutrition entries/context and downstream briefing/evaluation services | review read model plus `nutrition-evidence.confirm.v1`; no narrative rule changed. |
| Activity | evidence upload/review and PI screens | canonical evidence/activity projections | represented through evidence, Log and Progress reads; persistence migration only remains. |
| Training Logger | `/log/training` client and server actions | accepted Training Logger services, canonical training evidence, reconciliation | create/correct/logger-complete commands and Training preparation reads; no Live Workout Stage 2. |
| Training history/detail | Progress training routes | canonical evidence repository, occurrence-history service | `training.v1` history/detail, comparable occurrence and current logger suggestion. |
| Training Library | training knowledge screens | canonical exercise identity registry and relationship metadata | search, categories, detail, recent identity and typed exercise destination extracted. |
| Photos | `/evidence/photos`, review and photo-event flows | current evidence files, progress-photo/evidence repositories and post-confirm effects | photo upload destination and `photo-evidence.confirm.v1`; authorized-media contract added; no file move. |
| DEXA | `/evidence/dexa`, review and DEXA event flows | current evidence files, DEXA/evidence repositories and post-confirm effects | DEXA upload destination and `dexa-evidence.confirm.v1`; no file move. |
| Goals | `/goals`, `GoalsHubScreen` | goal evaluation/intelligence, completed preview, phase correction, transition-entry and Confidence publication services | composition extracted to `GoalsHubReadService`; web uses it with the compatibility principal; goal edit/transition commands added. |
| Operating Plan | profile Operating Plan page/screen and editors | activity/training/energy builders, protocol/context/reminder/execution repositories, tracking support | composition extracted to `OperatingPlanReadService`; page individually consumes its sections; protocol edit command and typed strategy/support destinations added. |
| Protocol/support editors | Operating Plan strategy, execution and tracking actions | strategy-specific domain services and Founder unit-of-work paths | `protocol.edit.v1` contract; UI-specific forms remain web-owned. Canonical mutation-port composition precedes any route cutover. |
| Priorities | Home cards, detail routes/actions | `PriorityDetailService`, daily-focus and execution projections, completion/reconciliation services | `priorities.v1`, priority complete and previous-day reconcile commands; eligibility remains domain-owned. |
| Check-ins | morning and recovery check-in routes/actions | check-in ingestion/persistence services and canonical repositories | `check-in.submit.v1`; application date context owns the local calendar day. |
| Progress Intelligence | `/progress` and stream reports | `ProgressReportingService` and evidence/domain projections | `progress.v1`; current order and stream meaning retained. |
| Confidence | Home, Goal preview/hub and briefing publication | `ActiveGoalConfidencePresentationReadService`; published runtime state | `confidence.v1`, including value, band, published source and explanation/rationale. Clients do not calculate it. |
| Briefings (all types) | briefing list/detail/event routes | daily-briefing repository, cadence classifier and existing narrative artifacts | generic `briefings.v1` list/detail supports known cadence/event types and future declared types; publication filtering unchanged. |
| You/profile | `/profile`, `YouProfileService` | user, goal, protocol and evidence repositories | `profile.v1`; web activation deferred. |
| Authorized media | evidence presentation routes | current local private files; Phase 2 private object provider remains inactive for product traffic | owner-scoped five-minute descriptor with local and future Spaces adapters; filesystem paths and object keys never enter the DTO. |
| Navigation/deep links | React `Link` hrefs and route resolvers | web routes previously leaked into composed data | typed destination registry plus web mapping for Home, Log, review/evidence, Goals/transition, plan strategy/support, priorities, briefings, Training, uploads, profile and Progress. Unmapped read-model links fail validation. |

## Versioned contracts

Read models: `home.v1`, `log.v1`, `evidence-review.v1`, `goals.v1`, `operating-plan.v1`, `priorities.v1`, `progress.v1`, `confidence.v1`, `briefings.v1`, `training.v1`, and `profile.v1`.

Commands: weight/check-in submission; evidence intake; evidence review edit/confirm/dispose; priority completion; previous-day reconciliation; protocol edit; Goal edit/transition; TrainingSession create/correct; Training Logger complete; nutrition/photo/DEXA confirmation. All require a principal. Edit/reconciliation/confirmation commands require an expected version. All carry UUIDv7 command identity, idempotency key, optional correlation identity and payload version through the existing atomic receipt/outbox primitive.

Read envelopes include contract/model/resource versions, generated/fresh-through times, ETag, bounded data and enumerated intentional differences. Raw web `href` values become typed destinations. Filesystem, provider, repository and runtime-store implementation fields are rejected or removed.

## Date and timezone contract

The authenticated application date context resolves the owner timezone first, then a validated client timezone, then `America/Los_Angeles`. It identifies a local `YYYY-MM-DD` calendar day and its UTC half-open interval. Calendar-day shifting never uses elapsed 24-hour arithmetic. Tests prove the 23-hour 2026 Los Angeles spring-forward day, the 25-hour fall-back day, local-midnight ownership, invalid-zone rejection and impossible-date rejection. Existing domain scheduling and briefing semantics are otherwise unchanged.

## Intentional DTO differences

- React icon components become stable visual keys/tones; web maps those keys back to the same icons.
- Web URLs become typed destinations; query-string return context remains a web presentation concern.
- Server-only persistence/file/provider fields are absent.
- Read results add contract/resource versions, ETag, freshness and explicit intentional-difference metadata.
- Log pending-review items add canonical local date, destination and version while retaining displayed date/title/summary/order/duplicate meaning.

These are representation changes only. No product rule, label, ordering, Goal/phase meaning, priority eligibility, briefing publication rule, Confidence calculation or Training comparison rule is intentionally changed.

## API and activation

The only Phase 3 HTTP addition is protected `GET /api/v1/capabilities`. It reports implemented contract registries only after authentication. Production authentication is inactive, so the route deterministically returns `FOUNDATION_AUTH_INACTIVE`; it cannot expose the canonical runtime or Founder data. Domain read/write routes were not added because their production authentication and transport composition are not activated. This is deliberate non-speculation, not missing cutover work.

## Remaining dependency-ordered work

Phase 3 proves handler and deterministic fixture parity, but intentionally does not bind every existing web mutation action to the new command dispatcher. Before product persistence migration, each command port still needs a separately reviewed canonical adapter and old/new mutation fixture proving exact downstream effects. Phase 4 should migrate/rehearse persistence against synthetic/copy data, then activate individually proven web paths behind flags. Production auth, Founder migration, evidence transfer and production cutover remain separate explicit gates. Apple work remains behind the complete pre-iOS exit criteria.
