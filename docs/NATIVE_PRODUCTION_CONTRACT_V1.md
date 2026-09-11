# PhysiqueOS Native production contract v1

This document is the server-owned handoff for production Native integration. Swift is a client of these contracts; it does not own canonical identity, chronology, Energy derivation, Confidence reasoning, briefing selection, or media storage resolution.

## Package authority

- Implementation base: exact commit `392b42c9998373573fc68d3c229d0d9835af8735` from `origin/combined-app-platform-cutover`.
- Verified deployment at implementation start: deployment `b2f67fb1-b003-4022-ae9e-80690fbcf23d` was `ACTIVE` for DigitalOcean app `bf57cf56-48cc-4cd6-90e4-a23ee5381741`; both `/api/v1/health/live` and `/api/v1/health/ready` returned HTTP 200.
- Scope: server contract, canonical persistence adapters, intake endpoints, lifecycle reuse, tests, and provider-build evidence only. This package performs no deployment, schema migration, backfill, infrastructure mutation, production-data write, or Native Swift change.

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
| Weight reporting/history | `weight` | `ProgressEvidenceReadService.getWeight` + bounded Native projection | Goal context; history `limit` 1–365, default 90 | Ready; server-derived |
| Training Logger support | `training-logger` | `CoreNavigationReadService.getTrainingLogger` | none | Ready |
| Training landing/reporting | `training-landing`, `training-reporting` | `TrainingNavigationReadService`; reporting uses `TrainingReportingPresentationService` | Goal context | Ready; reporting presentation is server-derived |
| Training Library | `training-library` | `TrainingNavigationReadService.getLibrary` | Goal context, category path | Ready |
| Training Day | `training-day` | `TrainingNavigationReadService.getDay` | date, timezone | Ready |
| Training Session | `training-session` | `TrainingNavigationReadService.getSession` | canonical session ID | Ready |
| Exercise detail/history | `training-exercise` | `TrainingNavigationReadService.getExercise` | canonical exercise ID | Ready |
| Nutrition | `nutrition` | `ProgressEvidenceReadService.getNutrition` | Goal context | Ready |
| Activity | `activity` | `ProgressEvidenceReadService.getActivity` | Goal context | Ready |
| Energy | `energy` | `ProgressEvidenceReadService.getEnergy` composed through `EnergyEvidenceService.createProviderEnergyEvidenceReport` | Goal context | Ready; server-derived |
| DEXA latest/history/detail data | `dexa` | `ProgressEvidenceReadService.getDEXA` | Goal context | Ready |
| Progress Photos latest/history/comparison | `photos` | `ProgressPhotosReadService.getNativePhotosTimeline` | Goal context; session `limit` 1–50, default 12 | Ready; canonical bounded projection |
| Briefing history | `briefing-history` | `BriefingNavigationReadService.listNativeHistory` | summary rows only; `limit` 1–50, default 20; opaque artifact cursor | Ready |
| Weekly/Midweek/Monthly detail | `briefing` | `BriefingNavigationReadService.getNativeArtifact` | artifact ID, optional version | Ready; Weekly/Midweek use finished web presentation composition |
| DEXA Event | `dexa-event` | `BriefingNavigationReadService.getDexaArtifact` | scan ID | Ready |
| Photo Event | `photo-event` | `PhotoEventBriefingReadService.getPhotoEvent` | session ID | Ready |
| Current Confidence detail | `confidence` | active Goal canonical Confidence projection | current date optional | Ready |
| Evidence Review queue | `evidence-review-queue` | `CoreNavigationReadService.getLog` | none | Ready |
| Evidence Review detail | `evidence-review` | `EvidenceReviewReadService.getReview` | review ID | Ready |
| Evidence timeline | `timeline` | `EvidenceTimelineReadService.getPage` | limit 1–200 | Ready |

Goal-context reads accept `all`, `build-lean-mass`, or `visible-abs`. The server applies Package 3 chronology and preserves stored historical attribution. Training uses canonical exercise IDs; photo comparisons use canonical session/photo/media/pose identities; DEXA and Event readers preserve Package 5 binding; Briefings preserve Package 6 artifact-bound Confidence. The `energy` resource returns the finished, server-composed Energy report -- `timeline`, `summary` (average intake/expenditure/balance, complete/evidence day counts), `days` (per-day `calorieIntake`, `activeCalories`, `rmr`, `rmrScanId`, `rmrScanDate`, `estimatedExpenditure`, `expenditureKind`, `energyBalance`, `completeness`, `sources`), `weeks`, `recentFourWeeks`, `latestEvidenceDate`, `dataSources`, and `audit` -- never the raw Activity/Nutrition/DEXA source collections; clients must not reconcile Energy from those collections themselves.

The `weight` resource returns one revision-safe canonical current selection, seven recent weigh-ins, canonical rolling 3-day and 7-day averages (using at most one canonical weigh-in per intended day), newest-first weekly averages, Goal-appropriate extrema with dates, bounded newest-first history, Goal/Phase context, and DEXA markers. Same-day corrections are resolved by the canonical server reader before projection; Native never chooses among revisions. The `photos` resource returns bounded newest-first sessions containing only session identity/revision, intended capture date, frozen Goal/Phase attribution, completion/comparison status, canonical photo and pose identities, and current/prior opaque media delivery descriptors. It never returns storage paths, keys, URLs, fingerprints, or provider provenance.

Weekly and Midweek `briefing` detail is a frozen, artifact-bound finished presentation. Weekly uses the same artifact adapter, editorial selector, screen presentation composer, phase-boundary interpretation, and historical Confidence explanation binding as web. Midweek uses the same editorial and Confidence presentation path as web. Native does not select narrative copy or reinterpret current data into a historical artifact. `training-reporting` returns the server-composed reporting projection (status groups, highlights, PRs, attention items, category rollups, and bounded day/session history) with canonical exercise/session identities; raw performance observations are not part of the Native response.

## Write matrix

Structured writes use `POST /api/v1/native/commands` with `{ commandType, metadata?, payload }` plus `Idempotency-Key`. The production Native allowlist is exactly the eight commands below; legacy Phase 3 command names are not accepted by this boundary.

| Domain | Command | Canonical rule |
|---|---|---|
| Weight | `weight.submit.v1` | intended local date + positive value; uses the same Morning Check-In persistence service as web; changed same-day value requires `If-Match` |
| Morning Check-In | `check-in.submit.v1` | intended local date + weight value and optional daily context/reconciliation; creates the canonical Weight, Check-In, analysis, and briefing reconciliation records |
| Priority | `priority.complete.v1` | canonical reminder ID + occurrence date; first completion requires `If-Match`; replay of that occurrence is a no-op |
| Training | `training-session.commit.v1` | canonical exercise IDs and performed sets; validates unit and superset occurrence identities, then commits the same Training evidence package used by web |
| Nutrition day | `nutrition-day.upsert.v1` | one owner/date lineage; full-day replacement; optional prior semantic fingerprint; server freezes Goal/Phase attribution and stages Energy/briefing continuation work |
| Activity day | `activity-day.upsert.v1` | one owner/date lineage with explicit `manual`, `typed`, or `screenshot` provenance; direct device-health and HealthKit writes are rejected |
| DEXA review measurements | `dexa-review.measurements.v1` | canonical review + DEXA object IDs and validated measurements; every edit requires `If-Match` |
| Evidence Review commit | `evidence-review.commit.v1` | canonical review ID; `If-Match` starts or resumes the existing web confirmation lifecycle, including canonical commit and durable continuation |

DEXA PDF, Nutrition screenshot, and Activity screenshot intake use `POST /api/v1/native/evidence/intakes` as `multipart/form-data`; status is read at `GET /api/v1/native/evidence/intakes/{intakeId}`. `Idempotency-Key` must equal the UUID submission identity. DEXA accepts exactly one signature-validated PDF. Nutrition and Activity accept one to four signature-validated PNG, JPEG, or WebP screenshots. The foreground stores verified artifacts and returns a durable processing receipt; provider worker interpretation stages the ordinary Evidence Review. Native edits DEXA measurements there and confirms through the same canonical lifecycle as web.

Activity has no Native HealthKit/direct-device path in this package. Manual structured entry uses `activity-day.upsert.v1`; screenshots use asynchronous intake and Evidence Review. Replaying identical daily evidence is provenance-only/no-op as determined by canonical reconciliation. A changed day creates one canonical revision and preserves its originally frozen Goal/Phase attribution.

## Native/provider implementation invariants

- `/api/v1/native/contracts` returns the machine-readable route/service manifest.
- Client-safe projection removes filesystem, repository, object-key, credential, and runtime fields and translates known web destinations to typed destinations.
- The API never returns generic collection mutation capability.
- Current Confidence and historical Confidence remain server-owned and distinct.
- Weekly, Midweek, Monthly, DEXA Event, and Photo Event artifacts are returned as persisted artifacts; Native does not regenerate them.
- Weekly and Midweek persisted artifacts are passed through their artifact-only server presentation composers before delivery; no live evidence is read to revise historical meaning.
- Native Weight, Photos, Briefing detail, Energy, and Training Reporting are finished server projections. Native renders these contracts and does not derive chronology, comparisons, rolling averages, extrema, narrative selection, Confidence, or reporting group semantics.
- Training, Nutrition, and Activity structured writes flow through the lower-level canonical evidence commit service, which stages PI Energy/Training and briefing reconciliation work without running those continuations inside the request.
- Weight and Morning Check-In use the web Morning Check-In service. Priority completion uses the canonical reminder occurrence repository. DEXA confirmation uses the web Evidence Review lifecycle and its durable continuation worker.
- Energy remains a read projection from Nutrition, Activity, and applicable DEXA RMR.
- No API route calls OpenAI or PI at render time.

## Staged integration order

1. Pair a production Founder device through the existing production pairing flow.
2. Enable the profile and read contracts only; compare against fixture-backed Native views.
3. Enable bounded daily-driver reads and opaque media.
4. Enable one write domain at a time with idempotency and stale-revision acceptance.
5. Keep Sandbox credentials, URLs, and data stores separate throughout.

This package makes the server contract production-write-capable after its commit is deployed. It does not deploy itself, alter infrastructure, migrate schema, backfill records, or mutate production Founder data.
