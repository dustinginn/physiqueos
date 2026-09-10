# PhysiqueOS Native production contract v1

This document is the server-owned handoff for production Native integration. Swift is a client of these contracts; it does not own canonical identity, chronology, Energy derivation, Confidence reasoning, briefing selection, or media storage resolution.

## Authority and authentication

- An authenticated Founder web session creates a one-time production pairing credential with `POST /api/v1/native/auth/pairing-credentials`. The request must come from the configured application origin. The server chooses the canonical production owner; the request cannot name or override an owner.
- The pairing credential is an opaque 256-bit secret, stored only as an HMAC-SHA-256 hash, expires after 10 minutes, and is consumed atomically by `POST /api/v1/native/auth/pair`. Concurrent reuse creates exactly one device/session; every later attempt fails closed.
- Pairing issuance and consumption are recorded in `security_events` without credential material. The pairing row records owner, issued time, expiry, and consumed time; the consumption event binds the credential identity to the resulting device and session.
- Production Native then uses `/api/v1/native/auth/refresh` and `/session` with the existing opaque Founder-device bearer credentials. Browser cookies are neither accepted nor required after pairing.
- The authenticated principal must resolve to the configured canonical production owner. Cross-owner access fails as `RESOURCE_NOT_FOUND`.
- Native Sandbox uses separate routes, database, owner, credential pepper, outbox namespace, and media namespace. A Sandbox bearer cannot authorize a production Native resource.
- `/api/v1/native/profile` returns a client-safe profile, `founder-production` authority, `sandbox: false`, and capability flags. It does not expose PostgreSQL, Spaces, runtime-authority, or application deployment identities.

## Shared protocol

- API version: `v1`; contract version: `1`.
- Errors use `application/problem+json` with `problemVersion: "1"`, a stable `code`, status, field errors, and optional recovery information.
- Writes use `Idempotency-Key`. Correction commands that declare an expected resource version also use `If-Match`.
- Daily evidence corrections use the current semantic fingerprint, because that fingerprint is the canonical revision precondition for Nutrition and Activity.
- Calendar evidence dates are explicit `YYYY-MM-DD` intended local dates. ISO timestamps and IANA timezones remain separate fields. Clients must not derive an intended day by slicing UTC.
- History is bounded by service-specific date windows or limits. Timeline is additionally capped at 200 items per request.
- Media is requested by opaque canonical media ID at `/api/v1/native/media/{mediaId}`. DEXA, Progress Photos, completed-Goal, and Event read projections expose a single delivery descriptor (`mediaId`, `deliveryPath`) wherever canonical media is available, so clients never need a catalog side-channel. The route re-authenticates the bearer principal, owner-scopes catalog lookup, validates image/PDF content type, and returns `private, no-store`. Object keys and public Spaces URLs are never contract fields.

## Read surface matrix

All reads below use `GET /api/v1/native/read/{resource}` unless a different route is shown.

| Native surface | Resource / route | Canonical service | Key inputs | Status |
|---|---|---|---|---|
| Profile/current authority | `/api/v1/native/profile` | core profile + auth boundary | none | Ready |
| Home | `home` | `CoreNavigationReadService.getHome` | none | Ready |
| Goals landing | `goals` | `CoreNavigationReadService.getGoals` | none | Ready |
| Active Goal / Phases / Confidence | `active-goal` | `ActiveGoalReadService.getPreview` | `currentDate` optional; includes canonical `goalId` and `phaseId` | Ready |
| Completed Visible Abs Goal | `completed-goal` | `CompletedGoalReadService.getVisibleAbs` | none | Ready |
| Operating Plan | `operating-plan` | `CoreNavigationReadService.getOperatingPlan` | none | Ready |
| Priority detail | `priority` | `PriorityNavigationReadService.getPriorityDetail` | `priorityId` | Ready |
| Morning Check-In context | `morning-check-in` | `CoreNavigationReadService.getMorningCheckIn` | none | Ready |
| Weight summary | `weight` | `FounderWeightSummaryReadService.getCurrentWeight` | none | Ready |
| Training Logger support | `training-logger` | `CoreNavigationReadService.getTrainingLogger` | none | Ready |
| Training landing/reporting | `training-landing`, `training-reporting` | `TrainingNavigationReadService` | Goal context | Ready |
| Training Library | `training-library` | `TrainingNavigationReadService.getLibrary` | Goal context, category path | Ready |
| Training Day | `training-day` | `TrainingNavigationReadService.getDay` | date, timezone | Ready |
| Training Session | `training-session` | `TrainingNavigationReadService.getSession` | canonical session ID | Ready |
| Exercise detail/history | `training-exercise` | `TrainingNavigationReadService.getExercise` | canonical exercise ID | Ready |
| Nutrition | `nutrition` | `ProgressEvidenceReadService.getNutrition` | Goal context | Ready |
| Activity | `activity` | `ProgressEvidenceReadService.getActivity` | Goal context | Ready |
| Energy | `energy` | `ProgressEvidenceReadService.getEnergy` composed through `EnergyEvidenceService.createProviderEnergyEvidenceReport` | Goal context | Ready; server-derived |
| DEXA latest/history/detail data | `dexa` | `ProgressEvidenceReadService.getDEXA` | Goal context | Ready |
| Progress Photos latest/history/comparison | `photos` | `ProgressPhotosReadService.getPhotosTimeline` | Goal context | Ready |
| Briefing history | `briefing-history` | `BriefingNavigationReadService.listNativeHistory` | summary rows only; `limit` 1–50, default 20; opaque artifact cursor | Ready |
| Weekly/Midweek/Monthly detail | `briefing` | `BriefingNavigationReadService.getArtifact` | artifact ID, optional version | Ready |
| DEXA Event | `dexa-event` | `BriefingNavigationReadService.getDexaArtifact` | scan ID | Ready |
| Photo Event | `photo-event` | `PhotoEventBriefingReadService.getPhotoEvent` | session ID | Ready |
| Current Confidence detail | `confidence` | active Goal canonical Confidence projection | current date optional | Ready |
| Evidence Review queue | `evidence-review-queue` | `CoreNavigationReadService.getLog` | none | Ready |
| Evidence Review detail | `evidence-review` | `EvidenceReviewReadService.getReview` | review ID | Ready |
| Evidence timeline | `timeline` | `EvidenceTimelineReadService.getPage` | limit 1–200 | Ready |

Goal-context reads accept `all`, `build-lean-mass`, or `visible-abs`. The server applies Package 3 chronology and preserves stored historical attribution. Training uses canonical exercise IDs; photo comparisons use canonical session/photo/media/pose identities; DEXA and Event readers preserve Package 5 binding; Briefings preserve Package 6 artifact-bound Confidence. The `energy` resource returns the finished, server-composed Energy report -- `timeline`, `summary` (average intake/expenditure/balance, complete/evidence day counts), `days` (per-day `calorieIntake`, `activeCalories`, `rmr`, `rmrScanId`, `rmrScanDate`, `estimatedExpenditure`, `expenditureKind`, `energyBalance`, `completeness`, `sources`), `weeks`, `recentFourWeeks`, `latestEvidenceDate`, `dataSources`, and `audit` -- never the raw Activity/Nutrition/DEXA source collections; clients must not reconcile Energy from those collections themselves.

## Write matrix

Writes use `POST /api/v1/native/commands` with `{ commandType, metadata?, payload }` plus `Idempotency-Key`.

| Domain | Command | Canonical rule |
|---|---|---|
| Weight | `weight.submit.v1` | same intended day; direct/Morning context is explicit in payload |
| Morning Check-In | `check-in.submit.v1` | intended local date and canonical reconciliation payload |
| Priority | `priority.complete.v1` | canonical Priority ID + occurrence date; optional typed execution context |
| Evidence intake | `evidence-intake.create.v1` | staged source identity; no direct canonical mutation |
| Evidence Review | `evidence-review.edit.v1`, `.confirm.v1`, `.dispose.v1` | expected version; confirmation resolves through the canonical review command boundary |
| Training | `training-session.create.v1`, `.correct.v1`, `training-logger.complete.v1` | canonical exercise/session IDs; expected version for correction/completion |
| Nutrition day | `nutrition-day.upsert.v1` | one owner/date lineage; complete-day correction; semantic-fingerprint precondition |
| Activity day / HealthKit | `activity-day.sync.v1` | one owner/date lineage; source identity + checkpoint; semantic-fingerprint precondition |
| Goal/strategy | `goal.edit.v1`, `goal.transition.v1`, `protocol.edit.v1` | expected version and server-owned Goal/Phase rules |
| Evidence confirmation aliases | `nutrition-evidence.confirm.v1`, `photo-evidence.confirm.v1`, `dexa-evidence.confirm.v1` | review ID and expected version |

HealthKit sends a recomputed canonical day for additions, source corrections, and deletions. Replaying the same source identity and payload is a no-op. A changed daily aggregate must include the prior semantic fingerprint, which creates one Activity revision while preserving provenance and precedence. The checkpoint is opaque client synchronization state; it is not evidence identity.

## Native/provider implementation invariants

- `/api/v1/native/contracts` returns the machine-readable route/service manifest.
- Client-safe projection removes filesystem, repository, object-key, credential, and runtime fields and translates known web destinations to typed destinations.
- The API never returns generic collection mutation capability.
- Current Confidence and historical Confidence remain server-owned and distinct.
- Weekly, Midweek, Monthly, DEXA Event, and Photo Event artifacts are returned as persisted artifacts; Native does not regenerate them.
- Nutrition/Activity corrections flow through Package 4 canonical reconciliation. Energy remains a read projection from Nutrition, Activity, and applicable DEXA RMR.
- No API route calls OpenAI or PI at render time.

## Staged integration order

1. Pair a production Founder device through the existing production pairing flow.
2. Enable the profile and read contracts only; compare against fixture-backed Native views.
3. Enable bounded daily-driver reads and opaque media.
4. Enable one write domain at a time with idempotency and stale-revision acceptance.
5. Keep Sandbox credentials, URLs, and data stores separate throughout.

This manifest is a technical readiness contract. It does not itself enable Founder data in Native or authorize a production write acceptance.
