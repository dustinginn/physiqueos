# HealthKit Sleep — discovery and canonical architecture (read-only)

- task.id: `healthkit-sleep-discovery-architecture-20260930`
- prompt: `agent-handoffs/inbox/prompts/20260930T152500Z-healthkit-sleep-discovery-architecture.md` (origin/main 5a0a097e)
- agent: Claude, status: **complete (research/architecture); stopped at the Founder data-shape authorization gate**
- Nothing was implemented, built, deployed, uploaded, activated, backfilled or mutated. No production reads of Founder data were made. No code branch was created; there are no local-only code changes.

Note on inbox: `physiqueos-inbox fetch --agent claude` refused because `inbox/latest.json` still points at the completed 2026-09-23 Strength task (stale). The Founder named this prompt file directly, so I read it from origin/main and executed it. The inbox pointer was not updated, and this handoff is published without `--inbox-task-id`.

## 0. Authority (re-verified live, read-only)

| Item | Value |
|---|---|
| Production Server | **372c306b** (`/api/v1/health/live` buildId `physiqueos-372c306b-20260930`; ACTIVE deployment `4dac1b07`, 2026-09-30 15:20Z; Codex Photo deploy). This supersedes the 4a81f5b4 recorded in `latest.json`. |
| Server audited | 4a81f5b4 (Build 70 integrated server). It is an ancestor of 372c306b, with **zero diff in HealthKit, ingest-port, manifest, settlement or Recovery files**, so the audit is valid for prod. |
| Native audited | Build 71 = 71164900 (VALID, delivery e5e1d800) |
| Sleep ingestion | Not active anywhere |

## 1. Executive summary

1. **Sleep is already half-plumbed in Native, but dormant.**
   - `.sleepAnalysis` exists in the stream enum, the type registry (`HealthKitTypeRegistry.swift:49`), the query client (`HealthKitQueryClient.swift:554,586`) and the payload model.
   - It is part of `.initialRead`, so **the Founder's device was already asked for Sleep read permission** in the existing authorization sheet. There is no new prompt, and no new authorization *type* is needed for V1.
   - Delivery capability is `.localOnly("server_sleep_contract_deferred")`. The wire mapper throws for it, and the automatic coordinator's `streams` list is `[activitySummary, nutritionDailyTotal, workouts]`. Nothing observes, queries or uploads Sleep today.
2. **The Server has no Sleep contract.**
   - The four observation types are `activity_summary`, `nutrition_daily_total`, `workout` and `quantity_sample`. `quantity_sample` requires a numeric value plus unit, so it cannot carry category stages.
   - There is no deletion handling for any HealthKit type.
   - Recovery already has reserved slots:
     - `EVIDENCE_DOMAINS.RECOVERY`
     - `RecoveryEvidenceModel` `sleep_duration` in hours, currently `manual_check_in` only
     - `BriefingPeriodEvidence.recovery: null` ("filled when Sleep evidence is admitted")
     - `BriefingEvidenceSettlementPolicy.readinessDomains` ("Extend this list (e.g. add "sleep")")
     - Existing wake-date rule `assignPreviousNightSleepEvidenceDate`
3. **The Founder's Sleep data shape is not obtainable without a new build or Founder action.**
   - No existing code path reads Sleep samples on device.
   - No Apple Health export exists on this Mac (checked by filename only).
   - The Server has never received Sleep.
   - Per the prompt, I stopped here and specify the minimal options in §4. The only hint is the repo Founder seed, whose `acquisitionPreferences.sleep` is `["oura","apple_health","manual"]` and whose `avoidDuplicatingSources` includes `apple_watch` and `oura`. **Multi-source overlap (Watch plus Oura) must be assumed until disproven.**
4. **Recommended architecture:**
   - A new per-sample category observation type, with deletion and window-manifest support.
   - A **separate Sleep collection pair** (samples, nights), so batches do not scan all HealthKit observations.
   - Pure deterministic canonicalization into **sleep episodes grouped into a wake-date "sleep day"** (18:00→18:00 local window). This matches Apple Health's convention and the existing `assignPreviousNightSleepEvidenceDate`.
   - **Episode-level single-primary-source reconciliation.** Totals are never summed across sources, and secondary sources are preserved as corroborating/ignored with a reason.
   - Hourly background delivery, the Build 71 launch observer, an anchored query with an activation floor, and a recent-window re-read manifest for deletions.
5. **Unrelated but real findings from the audit:**
   - (a) Native Nutrition's observer maps to zero sample types, so its background-delivery registration is vacuous. Nutrition is effectively foreground/Activity-wake only.
   - (b) Per-sample workouts upload `HKSource.name` verbatim. For Apple Watch this is the user-assigned device name, which often contains a person's name. The Server stores it as-is. Sleep must not repeat this, and workouts should be normalized later.
   - (c) `deferredChanges` in the sync store is append-only, so a `.localOnly` stream that is ever queried grows the state file without bound. That is harmless today because Sleep is never queried.

## 2. Current architecture map (post Build 71)

### Native (`ios/PhysiqueOS`)

**Authorization**
- `HealthKitTypeRegistry.swift:24-76`: `.initialRead` = all read types (activity, nutrition, workouts, **sleep**). Write types are only body mass and body fat, under a future scope.
- `HealthKitAuthorizationCoordinator.swift:66-97`: gated by `featureGate.allows(.requestAuthorization)`. It never infers read-denial, as HealthKit hides it.

**Launch observers and background delivery**
- `PhysiqueOSApp.swift:22,28-32` + `AppEnvironment.swift:700-704` run `registerObserversForBackgroundLaunch`. This is Founder Production only, needs no network, and uses the cached owner identity plus the Keychain device identity.
- Frequency: `.immediate` for workouts, `.hourly` otherwise (`HealthKitQueryClient.swift:686-692`).
- Entitlement: `healthkit.background-delivery` = true.
- There is no `BGTaskScheduler` and no `UIBackgroundModes`.

**Observer-wake handling**
- `HealthKitObserverCompletionGate` is one-shot and guaranteed by `defer`. It is released after durable local staging and before upload.
- The wake runs inside `beginBackgroundTask` via `withBackgroundExecutionAssertion` (engine :91-111; `BackgroundExecutionAssertion.swift`).

**Anchored queries** (`HealthKitQueryClient.swift:88-173`)
- Each query is `HKAnchoredObjectQuery` with no limit, a secure-coded anchor and a 25 s timeout gate.
- Predicates:
  - nil (unbounded) when there are no bounds
  - explicit `[start,end)` with `.strictStartDate`
  - workouts: activation floor with `.strictEndDate`

**Persistence** (`HealthKitSyncPersistence.swift`)
- One JSON envelope per scope. Scope = {owner, enrolled device, stream, predicateVersion}.
- Written with `.completeFileProtectionUnlessOpen` and excluded from backup.
- Only one pending batch per scope. The cursor advances only when every partition is acknowledged, deferred or checkpointed.
- Corrupt-cursor recovery: at most 1 reset per scope, plus quarantine of undecodable files.

**Deletions**
- Mapped, but always local-deferred (`server_deletion_contract_deferred`). **Deletions never reach the Server for any type.**

**Wire** (`HealthKitObservationNormalizer.swift:283-352`)
- Command `healthkit.observations.ingest.v1`, at most 100 observations per batch.
- `Idempotency-Key` = partition identity (a digest of scope, cursors and content).
- Fields: `externalId` = lowercased HK UUID, `source{bundleIdentifier, sourceName, sourceRevision, productType, deviceModel, privacySafeDeviceProvenance}`, and `occurrence{localDate, timeZone, utcOffsetSeconds, startedAt, endedAt}`.
- **Metadata is never sent.** The internal allow-list is `HKWasUserEntered`, `HKExternalUUID` and `HKFoodType`.
- `localDate` = start-of-day of **startDate** in the `HKTimeZone` metadata zone, falling back to the device zone (`HealthKitQueryClient.swift:490-509`).

**Upload results**
- Transient: retried on the next wake or foreground.
- Rejected: batch abandoned.
- 409 collision recovery (revision floor) exists **only for** `activity_summary` and `nutrition_daily_total`.

**Gates reusable for Sleep**
- `HealthKitFeatureGate` (`.n1Automatic`).
- The per-stream `deliveryCapability` (`.s1` vs `.localOnly`).
- Server-advertised manifest flags read by `healthKitCanaryContract()`.
- The `nativeAuthority == .founderProduction` authority gate.
- The exact-day canary scope pattern (`HealthKitWorkoutCanaryDay`).

**UI and notifications**
- Evidence Hub streams are Server-driven (`EvidenceView.swift`). The canonical order already contains `recovery` and `health-metrics`.
- Automatic-scope diagnostics list Activity, Nutrition and Workouts only.
- The only HealthKit notification is "Workout needs review". There is no APNs.

**Locked device**
- State files, the device-identity Keychain item and the refresh credential all require unlock.
- A background wake while locked fails early, and recovery waits for the next wake or foreground.
- There is no `protectedDataDidBecomeAvailable` handling.

### Server (audited at 4a81f5b4, identical in prod 372c306b)

**Ingest**
- `POST /api/v1/native/commands`, handled by `ingestHealthKitObservations` (`CanonicalPersistenceCommandPorts.js:378-827`).
- Envelope validation: `HealthKitObservationService.js:475-657`.
- Idempotency: `command_receipts` (UNIQUE user + key). A thrown 4xx rolls back and leaves no receipt.

**Identity**
- `sha256(bundle␀type␀externalId)`.
- Daily snapshots also include the delivery device and the revision.
- Replay is judged by semantic plus legacy fingerprint.
- The per-batch read lists the **entire `healthKitObservations` collection** (Ports :398-417). This is an OOM-class cost for high-volume Sleep samples.

**Storage**
- JSON collections in `canonical_training_records` (`phase4DomainCollections.js`). A new collection is a map entry, with no DDL.
- Existing collections: `healthKitObservations`, `healthKitConfiguration`, `healthKitCanonicalDays`, `healthKitCanonicalWorkouts`, `healthKitWorkoutLinks` and `healthKitWorkoutLinkClaims`.

**Policies** (three independent, fail-closed records)
- The daily activation policy (domains enum `{activity, nutrition}`).
- The workout activation policy (`[cardio, strength]`, open-ended).
- The graduation policy (`projection` and `evidenceEligibility` scopes; `SUPPORTED_DOMAINS = [activity, nutrition, cardio_training]`; strategic use requires `complete_day`).
- The only writers are the runners in `src/platform/operations/`.

**Quarantine**
- `HealthKitEvidenceEligibilityPolicy.js`: `HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE = false`, a structural detector and a write guard.
- The only path to strategic use is the read-time graduation overlay.

**Day attribution**
- Snapshots trust the client `localDate`.
- Workouts use the start instant in the observation's zone.
- The Briefing zone comes from `BriefingScheduleAuthority` (03:00 generation; zone from Coaching Updates, then profile, then the `America/Los_Angeles` default).
- Settlement waits 180 min / retries every 30 min / waits at most 480 min.

**Recovery and Sleep hooks**
- `RecoveryEvidenceModel` (`sleep_duration`, hours 0–24, optional `sleepEpisode{start,end,timezone}`, source kinds = `manual_check_in` only).
- `RecoveryPISemanticContract` (confidence ceiling moderate).
- Confidence adapter maps sleep/recovery to `recovery_capacity`.
- `BriefingEvidencePicture.assessRecovery` is a placeholder that returns insufficient.

**Logging**
- `structuredLogger` redacts keys matching `health|evidence|content|token…`.

### Reusable for Sleep

**Native**
- Registry and authorization, including Sleep.
- The generic anchored-query path and category mapping.
- Staging, acknowledgement and cursor ordering.
- The completion and timeout gates and the background assertion.
- Launch registration.
- The manifest-flag gate pattern.
- The `.localOnly` dormant mode.

**Server**
- The command/receipt path, identity hashing and `putIfAbsent`.
- The `validation_only` purpose.
- Fail-closed policy records with exact or open-ended windows and no backfill.
- The read-time graduation overlay and the quarantine detector.
- The settlement gate.
- The coexistence (never-pick-a-winner) pattern with manual Evidence.

### Unsafe to reuse as-is

- **Start-date attribution:** `localDate` from startDate would split every overnight sleep across two days.
- **`.strictStartDate` explicit bounds** drop sleep that started before the window.
- **Quantity-only sample body:** no category value or stage.
- **Daily-total precedence** (coverage first, then higher revision, then cumulative dominance). It assumes totals only grow; sleep gets re-segmented and revised.
- **Single-device revision identity and no interval dedupe:** Watch, iPhone and Oura overlap would be double counted.
- **No deletions:** sleep edits and recomputes arrive as delete plus add.
- **Unbounded first-run predicate:** only workouts have an activation floor, so a Sleep first run would sweep all history. That would be a backfill violation.
- **Verbatim `sourceName`:** a privacy issue.
- **Fallback externalId `source-object:<type>:<date>`:** not unique.
- **Whole-collection scan per batch:** a cost problem at Sleep sample volume.
- **`deferredChanges` growth:** unbounded, as noted in §1.
- **Binary frequency choice** (workouts vs everything else).
- **Nutrition-style "all observerTypes" gap:** each stream needs an explicit observer mapping and a test.

## 3. Apple Sleep semantics

Labels: **[DOC]** = Apple documentation or the iOS 27.0 SDK headers; **[SUP]** = Apple Support or Apple DTS forum reply; **[INF]** = inferred or anecdotal.

**Type and values**
- **[DOC]** `HKCategoryTypeIdentifierSleepAnalysis` exists from iOS 8 / watchOS 2. The docs recommend `HKMetadataKeyTimeZone` for analysis.
- **[DOC]** Raw values:

| Value | Raw | Availability |
|---|---|---|
| `inBed` | 0 | |
| `asleepUnspecified` | 1 | iOS 16 / watchOS 9; deprecated `asleep` is the same raw value 1 |
| `awake` | 2 | iOS 10 |
| `asleepCore` | 3 | iOS 16 / watchOS 9 |
| `asleepDeep` | 4 | iOS 16 / watchOS 9 |
| `asleepREM` | 5 | iOS 16 / watchOS 9 |

- **[DOC]** `allAsleepValues` = {1,3,4,5} and excludes inBed and awake. The predicate is `HKCategoryValueSleepAnalysis.predicateForSamples(equalTo:)`.
  - V1 must query **all values**, not only asleep ones, to see inBed and awake.
  - Pre-iOS-16 or legacy writers produce only values 0 and 1.

**Sample model**
- **[DOC] (WWDC22 10005; enum page)** One value per sample. The inBed set is separate from the detailed stage set. Stage samples overlap inBed but **never overlap each other within a source**, and need not be contiguous.
- **[DOC]** Apple Watch writes awake only *between* sleep samples, so there may be no detailed samples covering the start or end of an inBed interval. **An inBed gap is not awake.**

**Apple Watch**
- **[SUP]** Tracking needs Track Sleep with Apple Watch on, about 1 h of wear and about 30% charge.
- **[SUP] (DTS)** The system only tracks sleep periods of 1 h or more, so **no sample exists for naps under 1 h**. There is no nap API.
- **[INF]** Watch data arrives after wake, when the watch syncs, and may be recomputed later.

**Sleep Score**
- **[SUP]** watchOS 26 added a Sleep Score (duration 50 / bedtime consistency 30 / interruptions 20).
- **[DOC, by absence]** It is **not exposed in HealthKit** (no identifier in the SDK 27 headers). We must not reconstruct or approximate it.

**Other writers**
- **[SUP / INF] iPhone:** "Track Time in Bed with iPhone" writes **inBed only**, from phone-usage inference.
- **[INF] Third parties:**
  - Oura and AutoSleep often write inBed plus asleep (with or without stages).
  - WHOOP writes asleep/awake with no stages.
  - Many writers use `asleepUnspecified`, overlap other sources, and sometimes re-export data they imported.
  - Classify by `sourceRevision.source.bundleIdentifier`; never by a fixed pattern.
- **[DOC] Manual entries:** Health's Add Data sets `HKMetadataKeyWasUserEntered`. **[INF]** Third-party manual entries may not set it.

**Sample fields [DOC]**
- `uuid`, `startDate` and `endDate` (absolute instants, no zone), `sourceRevision` (source name and bundle id, version, productType, OS version), optional `device` (name, manufacturer, model, hardware/firmware/software version, localIdentifier, UDI), and `metadata`.
- `HKMetadataKeyTimeZone` is *recommended*, not guaranteed. **[INF]** Watch samples usually carry it; third-party samples often don't.
- `SyncIdentifier` and `SyncVersion` are paired. A higher version replaces the sample: new UUID, old UUID deleted.

**Deletions and edits [DOC]**
- Objects are immutable, so an edit is a delete plus an add.
- `HKAnchoredObjectQuery` returns `deletedObjects` (UUID plus metadata).
- **Deleted objects are temporary.** The store may purge them, so an anchor that has been offline too long can miss deletions. Apple advises observer plus background delivery plus anchored query.
- **We add a periodic recent-window re-read** as a safety net.

**Background delivery [DOC]**
- Frequency is a *maximum*: immediate, hourly, daily or weekly. Some types are clamped to hourly (the iOS example is stepCount).
- On watchOS, sleep is not on the immediate list. Whether iOS honors `.immediate` for sleepAnalysis is **undocumented [INF]**.
- The completion handler **must** be called; after 3 misses delivery stops.
- The `healthkit.background-delivery` entitlement is required from iOS 15.
- Background delivery cannot be tested in the Simulator.
- While locked, the store is inaccessible (`errorDatabaseInaccessible`).

**Source priority and totals**
- **[SUP]** The Health app applies the Data Sources priority order (manual first by default).
- **[DOC, by absence]** Raw queries do not apply it, and the order is not readable through the API. **Consumers must dedupe themselves.**
- **[SUP] (DTS)** Totals are the union of asleep intervals without counting overlaps. There is no sleep-schedule API.

**Date attribution [INF]**
- The Health Sleep chart uses an **18:00→18:00 "sleep day" attributed to the wake date**. This is community-sourced and not documented by Apple, but it matches common observation.

**Pitfalls**
- Overnight and DST handling: compute durations from instants and dates from the local zone.
- Travel produces overlapping or gap windows.
- Split sleep and naps.
- Late-arriving or recomputed Watch data.
- Legacy value-1-only data.

Key sources:
- developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis
- …/allasleepvalues
- …/hkanchoredobjectquery
- …/hkdeletedobject
- …/hkmetadatakeysyncidentifier
- …/enablebackgrounddelivery(for:frequency:withcompletion:)
- …/executing-observer-queries
- …/protecting-user-privacy
- developer.apple.com/videos/play/wwdc2022/10005
- support.apple.com/en-us/108906 (Sleep / Sleep Score)
- support.apple.com/en-us/108779 (source priority)
- developer.apple.com/forums/thread/762318 and /776851 (DTS)

## 4. Founder Sleep data shape

**Result: not obtained.** No safe existing read-only path exists:
- No Native code path queries Sleep samples. Sleep is excluded from the automatic streams and no canary reads it.
- The Server has never received Sleep.
- There is no local Health export (checked by filename only).
- Sleep read permission was already *requested* on device in `.initialRead`, but HealthKit hides whether read was granted.

**Known hint (repo seed, not device data):** the Founder seed lists Sleep acquisition as Oura, then Apple Health, then manual, and says to avoid duplicating Apple Watch and Oura. The design therefore assumes **Watch plus Oura overlap** until data proves otherwise.

**Minimal options** (none executed; each needs authorization):
- **Option A: Founder action, no build, about 2 minutes (recommended first).**
  - In the Health app, go to Browse → Sleep → Data Sources & Access and report which source *names/types* are listed, in priority order.
  - In the Sleep chart for 2–3 recent nights, report whether stages (Core/Deep/REM) show, whether "In Bed" shows, and whether any nap or second sleep period appears.
  - Share no times or values. This answers the only material decision (source preference).
- **Option B: diagnostic Native probe, which needs a new build, so not created here.**
  - A button in the existing Founder canary screen, behind the canary toggle, foreground only.
  - A single `HKSampleQuery` for sleepAnalysis (all values) over the last 14 sleep days.
  - Computed **on device only, with no network**: per source class (Apple Watch, iPhone, third party by bundle-id family, user-entered):
    - nights present, median samples per night, category values seen
    - whether inBed is present
    - `HKTimeZone` presence rate
    - rate of nights with cross-source asleep overlap
    - count of secondary episodes (naps / split sleep)
    - nights crossing midnight or DST
  - Rendered on screen as sanitized counts only: no times, durations or UUIDs. The Founder screenshots it.
  - It could ride in the next Native build as an inert diagnostic. It must not change `deliveryCapability` or the coordinator streams.

## 5. Canonical model (three layers plus a future projection)

Layer separation stays as accepted: **source observation → canonical Sleep → evidence eligibility → strategic interpretation.** Ingestion never decides meaning.

### A. Source observation: `healthkit_sleep_sample` (new observation type, new collection `healthKitSleepSamples`)

**Identity**
- `record_id = healthkit_sleep_sample_ + sha256(owner␀"sleep"␀lowercased HK UUID)`.
- Bundle id is deliberately **not** in the identity. `HKDeletedObject` carries only a UUID, so deletions must resolve by UUID alone.
- HK UUIDs are store-unique across sources.

**Fields**
- `externalId`: HK UUID.
- `categoryValue`: raw int 0–5.
- `stage`: `in_bed | asleep_unspecified | awake | asleep_core | asleep_deep | asleep_rem`.
- `stageSchemaVersion`: `hk-sleep-v1`. Unknown future raw values are stored as `unknown` and excluded from totals, never rejected.

**Timing**
- `startedAt` and `endedAt`, both required.
- `timeZone` plus `timeZoneSource`: `sample_metadata` or `device_at_ingest`.

**Source**
- `bundleIdentifier` and `sourceClass`, where sourceClass is:
  - `apple_watch`: Apple Health bundle with a Watch productType
  - `apple_iphone`
  - `third_party`: with a `bundleFamily` label from an allow-list, e.g. `oura`, `whoop`, `autosleep`; `other` if unknown
  - `user_entered`: `HKWasUserEntered` true
- `productTypeFamily` (e.g. `Watch`, `iPhone`, with the model string kept), `sourceVersion`.
- **No `sourceName`, device name, localIdentifier, UDI, serial or firmware.**

**Metadata allow-list**
- `wasUserEntered` (bool) and `timeZone` (used for occurrence) only.
- SyncIdentifier/SyncVersion are not needed, because replacement arrives as delete plus add.

**Lifecycle**
- `ingestion{firstReceivedAt, batchId, deliveryDeviceId (auth-derived)}`.
- `lifecycle: live | deleted` with `deletedAt` and `deletionSource: hk_deleted_object | window_manifest`.
- Rows are never physically removed while referenced.
- `ingestionPurpose`: `operational | validation_only`.
- `evidenceEligibility`: always `not_assessed`.

**Collection design**
- Separate from `healthKitObservations` so batch reads are **scoped by `occurrence_date`**, set to the sample's candidate sleep-day key.

### B. Canonical sleep day / episodes (`healthKitSleepDays`, record id `healthkit_sleep_day_<YYYY-MM-DD>`)

The record is a pure function of live samples, plus a versioned algorithm id (`sleep-canon-v1`) and parameters. It stores `inputDigest` (a hash of sorted live sample ids and lifecycle) and a `revision`. The same digest is a replay no-op.

**Day-level fields**
- `sleepDay` (the wake-date key), `timeZone`, `algorithmVersion`, `revision`, `inputDigest`.
- `episodes[]`: see below.
- `mainEpisodeIndex`.
- `mainSleep{asleepSeconds, awakeSeconds, coreSeconds, deepSeconds, remSeconds, unspecifiedSeconds, inBedSeconds|null, stageCoverage}` from the main episode.
- `totalAsleepIncludingSecondarySeconds`.

**Episode fields**
- `start` and `end`: the extent of primary-source asleep and awake samples.
- `kind: main | secondary` (the presentation label nap vs split is a UI choice; §8, decision D4).
- `primarySource{sourceClass, bundleFamily}` and `reconciliation{candidates[], reason}`.
- Durations, all in **seconds** from union-of-intervals over the primary source:
  - `asleepSeconds`, including unspecified
  - `awakeSeconds`: only awake samples strictly inside the episode
  - `coreSeconds`, `deepSeconds`, `remSeconds`, `unspecifiedSeconds`
  - `stageCoverage = (core+deep+rem)/asleep`
- `inBedSeconds`: **only when reliable**. That means an inBed interval from the **same source** covers at least 90% of the episode span. Otherwise null.
- `sourceSampleIds[]` (contributing) and `corroboratingSampleIds[]` (other sources, not counted).
- `completeness`:
  - `complete`: episode ended, and ≥ 3 h since the last sample change or the sleep-day window closed
  - `provisional`
  - `stage_detail_absent`
  - `in_bed_only`: no asleep samples, **no total sleep emitted**
  - `manual_only`

**Explicitly not computed in V1**
- Sleep efficiency: not defensible across mixed inBed semantics.
- An awakenings count: the definition depends on epochs and differs by source.
- Any score. Apple's Sleep Score is not in HealthKit and we invent none.

### C. Future recovery-evidence projection (design only, dormant)

**Read-time overlay**, following the existing graduation pattern and never persisted into Evidence. It projects a `complete` main episode into the `RecoveryEvidenceModel` shape:
- metric `sleep_duration` in hours, 2 dp, from `asleepSeconds`
- `sleepEpisode{start,end,timezone}`
- new source kind `healthkit_sleep`
- `evidenceDate = sleepDay`, the same semantics as `assignPreviousNightSleepEvidenceDate`

**Candidate later facts, all descriptive and without thresholds:**
- total sleep; multi-night mean and dispersion (consistency)
- stage-coverage availability
- presence of large awake intervals ("major disruption", defined later)
- episode timing regularity

Eligibility needs a separate `healthkit_canonical_graduation_policy` domain (`sleep`), an `evidenceEligibility` scope and `complete` only. Before that happens, add `sleep` to `readinessDomains`. **None of this is enabled.**

## 6. Deterministic source reconciliation (`sleep-canon-v1`)

**Step 1: preserve every observation.** Reconciliation only chooses what is *counted*.

**Step 2: cluster episodes.** Within a sleep day, take the union over all sources of non-inBed asleep and awake intervals. Merge clusters separated by a gap ≤ 60 min into one episode.
- The 60 min gap is a technical parameter, versioned in `algorithmVersion`, not a coaching threshold.
- inBed-only intervals form an episode only if no asleep data exists in them, which gives `in_bed_only`.

**Step 3: choose one primary source per episode.** Candidates are the source lanes (`sourceClass` + `bundleFamily`) with asleep samples in the episode. Rank lexicographically:
1. **Non-manual beats `user_entered`.** A manual entry is used only when it is the sole asleep source; otherwise it is kept as `manual_coexisting`. This mirrors the "coexistence, never silently override" rule for Evidence. Manual Sleep *corrections* are future scope.
2. **Founder source preference, if set** (policy record `healthkit_sleep_source_preference`, optional). This is the extensibility hook, and it is empty by default.
3. **Stage detail:** a staged lane (any of values 3–5) beats unspecified-only.
4. **Coverage:** greater asleep coverage of the episode's union span, with ties within 5% treated as equal.
5. **Deterministic tie-break:** `apple_watch` > `third_party` > `apple_iphone`, then bundle id lexicographically.
- **Never "newest writer wins."**

**Step 4: compute totals from the primary lane only**, as a union of intervals so there is no in-lane double count if a writer overlaps itself. Rules:
- Stages count only inside the lane's own intervals.
- An awake sample is never asleep, and inBed is never asleep.
- A primary-lane `asleepUnspecified` interval that has *nested* stage samples from the same lane counts once, using the stage detail (per-second precedence: specific stage > unspecified).

**Step 5: never mix sources within V1 totals.** A gap-filling hybrid (Watch stages plus Oura for missing minutes) is deliberately out of V1. It is complex, error-prone and not needed for coaching. Secondary lanes remain visible as corroboration, with their own asleep totals shown only in night detail.

**Step 6: deletions and revisions.**
- A deletion marks the sample `deleted`, and any sleep day whose candidate window touches it is recomputed.
- An addition upserts the sample and recomputes the touched days.
- Recompute is a pure function, so the same input set gives the same `inputDigest` and a no-op.
- Duplicate or out-of-order delivery converges.

**Why this policy:** trusted-source-only is brittle when a device is missing a night. Pure completeness precedence can pick a coarse iPhone inBed estimate over a staged Watch night. User preference alone is empty on day one. The **combination** above works with zero configuration, is deterministic, handles missing-device nights (fallback to the next lane per episode) and lets the Founder pin Oura or Watch later with one record.

## 7. Night / date attribution

**Sleep day D** = the wake-date key. An episode belongs to sleep day D when its `end` falls in **[D-1 18:00, D 18:00) in the episode's zone**.
- The episode zone is the `timeZone` of its last primary-lane sample, falling back to the device zone at ingest.
- This matches the Apple Health convention **[INF]** and the existing Recovery rule `assignPreviousNightSleepEvidenceDate({checkInDate})`: last night's sleep belongs to the check-in/wake day.

**Main vs secondary:** the main episode is the one with the largest `asleepSeconds` in the sleep day; every other episode is secondary.
- A 15:00 nap ends in D's window, so it is a secondary episode of D.
- A 19:30 nap belongs to D+1. It is a secondary episode there and does not pollute the next night's main episode.

**Cases**
- **Late schedules:** 03:00→11:00 ends at 11:00, so it is sleep day D (correct).
- **Night-shift or very late wake:** an end at or after 18:00 is attributed to D+1. This is an accepted, documented edge; the Founder schedule is not night-shift.
- **Split sleep:** 23:00–02:00 plus 04:00–07:00 with a 2 h gap gives two episodes in D. The main is the larger; both are shown, and `totalAsleepIncludingSecondary` sums them. This is not double counting, because they are disjoint intervals.
- **DST:** durations are computed from instants and never from wall-clock subtraction. The fall-back night correctly measures 25 wall-hours of window.
- **Travel:** each episode uses its own zone, and two episodes may map to the same D. Both are kept, with a `timezone_shift` flag. An empty D stays empty, with nothing fabricated.

**Alignment with Briefing and daily evidence**
- A 03:00 Briefing for day D (generated at D+1 03:00 in the Briefing zone) sees sleep day D, whose window closed at D 18:00. It is `complete` by then, which aligns naturally with settlement.
- When Sleep later graduates, add `sleep` to `readinessDomains` with the same 180/30/480 settlement semantics.
- The Server re-derives the sleep day from instants plus zone. **The client `localDate` is advisory only.** This differs from Activity snapshots on purpose.

## 8. Prospective background sync (Build 71 lessons)

**Stream**
- Add `.sleepAnalysis` to the automatic coordinator's streams only when the Server manifest advertises `healthKitIngestion.sleepCanonicalActivation.enabled` (or a similar flag). It is off by default and falls back to `.localOnly` otherwise.
- New cursor namespace `healthkit-automatic-sleep-v1`.

**Registration**
- Register at process launch (the existing `registerObserversForBackgroundLaunch`), with an explicit observer type mapping for sleepAnalysis. Add a test so it never repeats the Nutrition zero-types gap.

**Frequency: `.hourly`**
- Sleep data lands in bursts after the watch syncs post-wake, and nothing downstream is time-critical: no review, no notification, Briefing at 03:00 next day.
- `.immediate` for sleepAnalysis is undocumented on iOS and not on watchOS's immediate list.
- Hourly bounds wake count and battery use, and foreground bootstrap catches up anyway.

**Anchored query**
- Query all category values (not `allAsleepValues`).
- **Activation floor** = instant of (start D0 − 1 day) 18:00 in the Founder zone, applied with `.strictEndDate` on sample end. Enforce it twice (query plus engine), like workouts, so a first run can never sweep history.
- The anchor is durable and per scope, with the existing single corrupt-cursor reset.

**Deletions**
- The Sleep stream must send deletions. New wire message: observation type `healthkit_sample_deletion{externalId}`, or a dedicated command `healthkit.observations.retract.v1`.
- **Window manifest safety net:** on foreground at most once every 12 h, re-read sleep days D-2…D with a plain sample query and send `{windowStart, windowEnd, liveExternalIds[]}`.
  - The Server marks as `deleted(window_manifest)` any live sample in the window absent from the list, scoped to samples whose `endedAt` lies in the window and ≥ the activation floor.
  - This covers purged `HKDeletedObject`s and anchor resets.

**Idempotency**
- The existing partition-identity key is used as-is.
- Server-side sample identity is by UUID, so the same content replays as a no-op.
- The same UUID with different content is **rejected as a contract violation** (HK objects are immutable). This is logged by digest only; the batch is not wedged, only that sample is refused. This is a lesson from the 409 revision loop.

**Recovery**
- Sleep uses no daily-revision counters, so the Activity/Nutrition 409 loop cannot occur.

**Execution and locked device**
- The wake runs under the existing background assertion.
- The completion handler is released after durable staging.
- Locked wakes fail early (protected state, Keychain and credential), which is expected for overnight sleep.
- Add a lightweight `protectedDataDidBecomeAvailable` trigger to run the coalesced bootstrap. Otherwise the first unlock foreground handles it.
- Explicitly **do not** relax file protection for health state.

**Boundaries**
- **No Log dependency and no notifications:** Sleep never produces a review or push.
- Store deferred changes bounded (fix the append-only `deferredChanges`) before any `.localOnly` Sleep query is ever enabled.

## 9. Minimal V1 product surfaces

**Evidence Hub: a "Sleep" stream** under Recovery (canonical order already includes `recovery`). A nightly list shows:
- sleep day
- main-episode asleep duration and time span (local)
- a stage mini-bar when `stageCoverage` ≥ 0.5
- a source chip (e.g. "Apple Watch"; "+1 source" when corroborated)
- a completeness chip (Provisional / Stages unavailable / In bed only / Manual)

**Night detail**
- A simple timeline of stages or asleep/awake for the primary source, plus totals (asleep, awake, core/deep/REM/unspecified).
- In-bed time only when reliable.
- Secondary episodes listed below.
- Provenance: primary source, corroborating sources with their asleep totals, reconciliation reason, and last updated.

**Not in V1**
- Home summary: skipped. Home is coaching-first, and Sleep is not strategically eligible, so a Home tile would imply meaning it doesn't yet have. Revisit at graduation.
- A Log flow or confirmation.
- Manual Sleep entry in PhysiqueOS: future. The morning check-in already captures manual sleep hours and remains separate coexisting Evidence.

**Later graduation:** Briefing and V3 Recovery integration.

## 10. Privacy and data minimization

**HealthKit authorization**
- The existing `.initialRead` already includes only `sleepAnalysis` for Sleep.
- **Do not add** `sleepApneaEvent`, `appleSleepingWristTemperature`, `appleSleepingBreathingDisturbances` or `sleepChanges`.

**Wire fields**
- Allowed: UUID, raw value, start/end, zone plus zone source, bundle id, source class/family, productType family, source version, `wasUserEntered`.
- **Excluded:** `HKSource.name` (device names contain personal names), `HKDevice` name, localIdentifier, UDI and firmware, and every other metadata key.
  - The same normalization should later be back-applied to per-sample workouts, which send `sourceName` verbatim today.

**Logs and diagnostics**
- Codes, counts and digests only. No timestamps, durations or stage values.
- Server structured logs already redact `health*` keys. Sleep keys must be added to the redaction set and tested.

**Retention**
- Live and deleted samples are retained as provenance for canonical days. Deleted samples keep only identity, lifecycle and the sleep-day key needed for idempotency. A purge of intervals after N days is optional and a later decision.
- A canonical day references sample ids, not copies.

**Handoffs:** no Founder sleep records, times or durations in GitHub ever. Shape reports are counts and ratios only.

## 11. Migration and ownership implications

**Server** (owner: Server lane)
- New observation type `healthkit_sleep_sample` plus a deletion/retract message.
- New collections `healthKitSleepSamples` and `healthKitSleepDays` (map entries in `phase4DomainCollections`). **No DDL** unless the generic table lacks an owner+collection+occurrence_date index, which must be verified in Phase A.
- New fail-closed policy record `healthkit_sleep_canonical_activation_policy` with an exact start `effectiveSleepDay`, `openEnded`, no backfill and quarantined.
- A manifest flag and a `validation_only` path.
- The pure `SleepCanonicalizer` plus runner/audit extensions.
- The redaction update.

**Native** (owner: Native lane)
- The wire mapper case, `deliveryCapability` switched to `.s1`, and the manifest-flag gate.
- A streams entry behind the flag, plus the observer mapping and floor.
- Deletion upload and the window manifest.
- Bounded deferred changes and the `protectedDataDidBecomeAvailable` trigger.
- The Evidence UI (read models are Server-driven).

**Separate follow-up fixes:** the Nutrition observer gap and `sourceName` normalization.

## 12. Phased plan

**A: Server contracts, schema and synthetic tests (no activation, deployable dormant)**
- Observation type, deletion contract, collections, policy record (absent means off) and the canonicalizer (`sleep-canon-v1`).
- Full synthetic test matrix (§13).
- Scoped reads, no whole-collection scans.
- Deploying only with Founder authorization; dormant verification = zero-write audit.

**B: Native dormant read path (inert build)**
- Mapper, flag-gated stream, observer mapping, activation floor, deletions, window manifest, bounded deferrals and the unlock trigger.
- Unit tests with a fake store: the anchor reset, locked-device, duplicate and out-of-order rows.
- The flag is absent, so no Sleep query runs.
- The Option B diagnostic probe could ship here if authorized.

**C: private Founder prospective canary**
- After the Founder chooses **D0** (decision D1).
- Activate the policy, starting as `validation_only` for 2–3 nights, then operational.
- Read-only acceptance audit against the on-device Health chart: per-night totals within tolerance, main episode correct, no double count, deletion round-trip.

**D: Evidence UI graduation**
- The Sleep stream and night detail read models, then the Native views. Still no strategic eligibility.

**E: strategic eligibility (separate task)**
- Graduation-policy `sleep` domain, the Recovery projection overlay and the `readinessDomains` addition.
- V3 Confidence/Narrative, with its own review and Founder authorization. No thresholds are invented before this.

## 13. Deterministic test matrix (synthetic; Phase A Server + Phase B Native)

| # | Case | Expected |
|---|---|---|
| 1 | Simple overnight (unspecified 23:00–07:00, one source) | Sleep day = wake date. Asleep 8 h, `stage_detail_absent`. |
| 2 | Staged Apple Watch night (core/deep/REM plus inter-sleep awake) | Stage sums = asleep. Awake counted only between sleep. `stageCoverage` = 1. inBed null (no inBed samples). |
| 3 | asleepUnspecified fallback plus nested stages in the same lane | Per-second precedence gives no double count. |
| 4 | inBed plus asleep overlap (same source) | inBed not counted as asleep. `inBedSeconds` set only if coverage ≥ 90%. |
| 5 | Awake inside episode, and awake at edges without sleep either side | Inside counts as awake; never asleep. |
| 6 | Third-party overlap (Watch staged plus Oura staged, same night) | One primary per the ranking. Other lane is corroborating. Asleep = primary only. |
| 7 | Manual entry alone / manual plus sensor | Alone: `manual_only`. With sensor: sensor primary, manual coexisting. |
| 8 | Nap 14:00–15:10 plus prior night | Secondary episode of the same sleep day. Main unchanged. |
| 9 | Nap 19:30–20:40 | Attributed to D+1 as secondary. Does not merge with the D+1 main (gap > 60 min). |
| 10 | Split sleep (2 h gap) | Two episodes. Main = larger. Total including secondary = sum. |
| 11 | Short gap (40 min awake, no sample) | Single episode (gap ≤ 60). Gap not counted as awake. |
| 12 | DST spring-forward / fall-back nights | Durations from instants. Correct sleep day. |
| 13 | Timezone travel (sample zones differ; zone missing uses fallback) | Per-episode zone. `timeZoneSource` recorded. Flag set. No fabricated day. |
| 14 | Deletion via `HKDeletedObject` | Sample marked deleted. Day recomputed. Replay no-op. |
| 15 | Revision (delete old UUID plus add new UUID, recomputed stages) | Converges to the new totals. Revision++. Digest changes once. |
| 16 | Duplicate delivery (same batch twice; same sample in two batches) | Receipt replay / identity no-op. Same digest. |
| 17 | Out-of-order delivery (additions after deletion; stage samples in reversed batches) | Final state independent of order. |
| 18 | Same UUID with different content | Sample refused (digest logged), batch not wedged. |
| 19 | Locked-device background wake | Fails early and releases completion. No cursor advance. The next unlock/foreground converges. |
| 20 | Anchor reset / corrupt cursor | Bounded reset. Re-read is idempotent. Window manifest reconciles deletions missed while the anchor was invalid. |
| 21 | Window manifest omits a live sample | Marked deleted(window_manifest). Samples outside the window are untouched. |
| 22 | Activation floor | Samples ending before the floor are never sent or stored. A floor-straddling night is included only if its end is ≥ the floor. |
| 23 | Unknown future raw value (e.g. 6) | Stored as `unknown` and excluded from totals. No crash. |
| 24 | inBed-only night (iPhone) | `in_bed_only`. No total sleep emitted. |

## 14. Founder decisions (only those needed before implementation)

- **D1: Prospective start sleep day D0.** Recommended: the first night after the Phase C canary build is installed. Needed before Phase C, not before A/B.
- **D2: Data-shape check.** Option A (2-minute Health-app look, no build), and/or authorize the Option B on-device probe in the next Native build. Recommended: A now; B only if A shows ≥ 2 asleep sources.
- **D3: Bounded historical read for UI/design validation.** Recommended: yes, 14 nights, `validation_only`, display/design only, never strategic, never touching Briefings or Confidence. Only if you want realistic UI before the prospective canary accrues nights. Otherwise no.
- **D4: Nap presentation.** Recommended: show secondary episodes in night detail and label them "Nap" when entirely between 09:00 and 18:00 local, otherwise "Additional sleep". Keep the list's headline number as main sleep only.
- **Source preference:** only if D2 shows Watch and Oura both staging nightly. The default ranking picks deterministically without it.

Resolved technically (no decision needed):
- wake-date 18:00 window
- hourly delivery
- episode-level single primary source
- no efficiency, awakenings or score in V1
- manual never overrides sensor
- no Home tile in V1

## 15. Risks and open questions

- **Founder Sleep read permission** may have been denied at the original prompt, which is undetectable. In that case Phase C shows zero nights, and the fix is a Settings toggle (Founder action).
- Actual Watch-plus-Oura overlap patterns are unknown until D2. The ranking may need the preference record.
- Whether iOS honors hourly background delivery reliably overnight while the phone is locked is undocumented. Expect the practical latency to be "at first unlock".
- The generic records table index on `occurrence_date` must be verified (Phase A), or scoped reads need a migration.
- Deleted-object purge timing is undocumented, so the window manifest is the backstop. Its window size (3 sleep days) is a tunable parameter.
- The 18:00 boundary misattributes night-shift-like schedules. This is accepted and documented.
- Existing issues discovered: the Nutrition observer registers zero types; per-sample workout `sourceName` privacy; unbounded `deferredChanges`. These are recommended as separate small tasks.

## 16. Tests / builds / reviews

- **Run:** none. This was read-only research. Claims were spot-verified by reading source at the cited lines (Native 71164900; Server 4a81f5b4 ≡ prod 372c306b for all HealthKit files).
- **Not run:** any tests, builds, simulators, device operations or production reads.
- **Deploy/TestFlight:** none. **Production mutated:** no.
- **Local-only work:** none. No code, no private Founder data, no harness.

## 17. Recommended next prompt

> "HealthKit Sleep Phase A: implement Server Sleep contracts dormant. Add the `healthkit_sleep_sample` observation type plus a deletion/window-manifest contract, the `healthKitSleepSamples`/`healthKitSleepDays` collections with scoped reads, the fail-closed `healthkit_sleep_canonical_activation_policy` (absent = off), and a pure `sleep-canon-v1` canonicalizer (18:00 wake-date sleep day, 60-min episode clustering, episode-level primary-source ranking per report 20260930T153000Z) with the full synthetic test matrix #1–24 (Server-applicable rows). Verify the records-table index. No deploy, no policy write, no Native build. Publish a candidate report."

In parallel, the Founder can do D2 Option A (Health → Sleep → Data Sources & Access; stages / In Bed / naps visible yes/no), which needs no build.
