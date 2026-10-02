# DEXA → Apple Health writeback — architecture/status audit and implementation plan

- Task: `agent-handoffs/inbox/prompts/20261002T233000Z-dexa-healthkit-writeback-audit-plan.md` (origin/main `31bc35ef`)
- Agent: Claude (Opus 5.5), fresh lane `claude/dexa-healthkit-writeback-audit-plan-20261002`
- Status: **COMPLETE — audit + plan only. Founder decisions pending. Implementation NOT started.**
- Generated (UTC): 2026-10-02T23:54:05Z
- Deadline context: Founder's DEXA appointment is **Friday 2026-10-09**

## 0. Safety statement

This task did not:
- write, save or delete any HealthKit sample;
- read or mutate production data, including any read-only production query;
- deploy anything, archive, upload, or create a Native build;
- run any simulator, `xcodebuild` or test suite.

Every finding comes from static source reading of:
- the Native Build 82 TestFlight source `e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c`, at the clean existing worktree `build82-sleep-v3-integration-20261002`;
- the iPhoneOS 27.0 SDK HealthKit headers;
- Apple's HealthKit documentation JSON.

Production Server `d0ff6596` has no DEXA, Weight or HealthKit-body differences from `e2cbcd0c`'s `src/` (`git diff --stat e2cbcd0c d0ff6596 -- src` touches no DEXA or weight files). The Server findings therefore describe production code.

The disk was 16 GiB free. Per `STANDING_DISK_SAFETY.md` no disk-intensive work was attempted. Note that 16 GiB is **below the 20 GiB reserve preferred for Phase C Native work**, so cleanup will be needed before implementation testing.

## 1. Executive summary

1. **Nothing writes body measurements to Apple Health today.**
   - The iPhone app writes nothing to HealthKit. The only HealthKit write is the Watch saving `traditionalStrengthTraining` workouts.
   - A **dormant** write registry already exists: `.weight → bodyMass` and `.bodyComposition → bodyFatPercentage`. It sits behind the `.futureBodyMeasurementWrite` scope and the `.healthKitWrite` operation, and both are excluded from every feature gate.
   - `NSHealthUpdateUsageDescription` already exists, and its copy mentions "weight".
   - A test explicitly forbids `leanBodyMass`.
2. **PhysiqueOS does not read body-composition types from HealthKit**, and daily Weight is **manual Morning Check-In only** (`weightEntries`).
   - The Server has no HealthKit `bodyMass` path into Weight. A body sample sent today as `quantity_sample` would be stored raw as `source_only` and would never reach Weight.
   - So **writing DEXA `bodyMass` to Apple Health would not contaminate PhysiqueOS's own daily Weight today.** It *would* put a second Weight point into Apple Health and every third-party app that reads Weight. That is the reason to exclude it (§K).
3. **The accepted point is the `canonical_commit` transaction.**
   - That transaction is where the canonical DEXA record `dexa_scan|<owner>|<YYYY-MM-DD>` is written to `canonicalEvidenceObjects` with `dexaRevision { logicalScanKey, revision, semanticFingerprint }`.
   - `review.status = "confirmed"` comes later, after 9 orchestrated steps. Writeback must key on the **canonical record**, not on the review.
4. **Apple Health semantics** (SDK iOS 27.0):
   - Body-composition types that exist: `bodyMass`, `bodyFatPercentage`, `leanBodyMass`, `bodyMassIndex`, `height`, `waistCircumference`.
   - No HealthKit type exists for bone mineral content, VAT, android/gynoid, regional mass, BMD, T-scores or Z-scores.
   - `basalEnergyBurned` is a **cumulative** energy quantity, not a rate, so RMR must not be mapped to it.
5. **Lean semantics are not interchangeable.**
   - PhysiqueOS `leanMass` is DEXA **lean soft tissue, excluding bone**. The contract enforces `total ≈ fat + lean + BMC`.
   - Apple's `leanBodyMass` is conventionally **fat-free mass** (body mass − fat mass, bone included). That is how scales populate it, and Apple's docs do not define it otherwise.
   - If Lean Body Mass is written, it should be written as **fat-free mass = totalMass − fatMass**, never as raw `leanMass`.
6. **Recommended V1:**
   - Write **Body Fat %** for sure, plus **Lean Body Mass = fat-free mass** if the Founder agrees.
   - Do **not** write Body Weight, RMR, BMI or anything else.
   - Writes are automatic after canonical acceptance, prospective-only (scans dated ≥ 2026-10-09).
   - Performed by a **Native idempotent reconciler** that converges Apple Health to a Server-owned "writeback intent", using `HKMetadataKeySyncIdentifier` / `HKMetadataKeySyncVersion` for exactly-once writes and automatic correction-replace.
   - Own samples are never re-ingested as evidence.
7. **The deadline is soft by design.** Eligibility is keyed on **scan date**, not confirmation time. If Build 83 lands after Oct 9, the Oct 9 scan still writes exactly once when the build is installed and the reconciler runs. Nothing has to be done by hand.

---

## A. Current DEXA flow (Server + Native)

| # | Stage | Exact current behavior | Citation (relative to repo root at `e2cbcd0c`) |
|---|---|---|---|
| 1 | Intake | **Native:** Files picker, PDF only for DEXA (`expectedEvidenceType = "dexa_scan"`) → `POST /api/v1/native/evidence/intakes` → `AsyncEvidenceIntakeService.accept`. Idempotency = type + date + SHA-256 of the file. **Web:** `/evidence/dexa` → `createDexaPdfReviewPackage` (synchronous) or `/log/upload` (same async intake as Native). Images are not accepted as DEXA. | `ios/.../ProductionEvidenceUploadView.swift:52,246-254,763-766`; `ProductionEvidenceIntakePipeline.swift:44-137`; `src/app/api/v1/native/evidence/intakes/route.js`; `NativeEvidenceIntakeRequest.js:245-252`; `src/app/evidence/dexa/actions.js:13-71` |
| 2 | Detection / classification | `validateDexaPdfUpload`. The async worker sends any PDF to `interpretPdfEvidence`. | `EvidenceIntakeInterpretationWorker.js:45-109`; `EvidenceIntakeService.js:1014-1031` |
| 3 | Extraction | `parseBodySpecDexaText`. Fields: summary BF%, total, fat, lean, BMC; RMR (cal/day); regional; android/gynoid/AG; VAT mass and volume; BMD/T/Z. **Date only** from the "Measured Date" header. **No scan time.** | `src/domain/interpreters/PdfInterpreter.js:89-376` |
| 4 | Evidence Review | Staged with `status: "pending"` (`evidence_review_<submission>`). **Correct** (pre-confirm only): Native `dexa-review.measurements.v1` (full replace of 9 fields, If-Match) or the web equivalent; sets `parser_confidence: "user_corrected"`. | `EvidenceReviewService.js:29-62,361-391`; `ios/.../DEXAWriteAPI.swift:31-77`; `CanonicalPersistenceCommandPorts.js:2433-2469` |
| 5 | Confirm / Correct / Dismiss | **Confirm:** Native `evidence-review.commit.v1` (If-Match) and web `confirmEvidenceReview`. Both call `executeEvidenceReviewConfirmation`. **Dismiss:** Native `evidence-review.dispose.v1` is allowed only from `pending` or `commit_failed`. **Web `discardEvidenceReview` has no status guard**: it can relabel an already-confirmed review "discarded", but it never touches the canonical record (latent defect, §I). | `src/app/evidence/review/[reviewId]/actions.js:202,238-468,1475-1489`; `EvidenceReviewService.js:495-501`; `CanonicalPersistenceCommandPorts.js:2811-2836` |
| 6 | Canonical persistence | `PostConfirmationOrchestrator` runs `canonical_commit` → `compatibility_writes` → `scheduled_completion` → `analysis` → `training_performance_events` → `goal_evaluation` → `event_eligibility` → `briefing` → `home_refresh`. `canonical_commit` runs `mutateCanonicalRuntime` → `reconcileConfirmedEvidencePackage` → `createCanonicalDexaScanRecord` in one Postgres transaction. Durable commit claims run one step in-process; the rest continue via outbox `evidence.review.continue`. Native receives `{state:"processing", accepted, canonicalStateDurable}`. | `PostConfirmationOrchestrator.js:1-11`; `actions.js:389-406,834-840`; `PILowerLevelCanonicalEvidenceCommitService.js:44-283`; `CanonicalEvidenceService.js:63-97,292` |
| 7 | DEXA Evidence UI | Native `GET /api/v1/native/read/dexa` → `buildDEXAReport`, which reads the compatibility `dexaScans` collection only. History rows are `{id, date, bodyFatPercentage, fatMass, leanMass, rmr, sourceMedia}` as formatted strings. **They carry no canonicalId, revision, fingerprint, time or totalMass.** | `nativeProductionContractManifest.js:99`; `ProgressReportingService.js:785-890`; `ios/.../ProductionDailyDriverAPI.swift:1976-2147` |
| 8 | Goal / body-composition interpretation | DEXA is `AUTHORITATIVE_DIRECT` for body fat and lean. Goal maps `lean_mass→leanMass`, `fat_mass→fatMass`, `body_fat→bodyFatPercentage`, `total_mass→totalMass`. `BodyCompositionEstimateService` anchors on the latest DEXA, then the scale-weight trend. Active Goal V3 says "DEXA remains authoritative for body composition". | `EvidenceAuthorityService.js:32-42`; `GoalProgressContextService.js:4-13`; `BodyCompositionEstimateService.js:7-77`; `PhaseAwareActiveGoalPreviewService.js:105,192-193` |
| 9 | Fields / units | See the table below. | `src/domain/models/dexaScan.js:21-73`; `DEXAContract.js` |
| 10 | Correction / update | **No post-confirm edit command exists.** A correction is a re-upload for the **same date** plus confirm. It keeps the same `canonicalId` and bumps `revision` once, only if `semanticFingerprint` changed. The prior state is snapshotted to `dexaRevisionHistory`. A provenance-only re-import is a no-op with no downstream work. | `CanonicalDexaScanService.js:100-161`; `CanonicalEvidenceService.js:371-378` |
| 11 | Duplicate handling | Logical identity = owner + scan date. Two active lineages on one date = hard invariant failure. Readers dedupe by date and prefer the highest revision. Native intake's `duplicate_of_existing_scan` is always false; real dedupe happens at canonical reconciliation. | `CanonicalEvidenceService.js:68-72`; `CanonicalDexaScanService.js:53-88`; `PdfInterpreter.js:315` |
| 12 | Historical imports | **13 Founder-seed scans** (2024-06-10 … 2026-06-20, IDs `dexa_YYYY_MM_DD`) exist **only in the compatibility `dexaScans`**. They have no `canonicalId`, no `dexaRevision` and no `extraction_engine`, and they would fail the production contract. **App-confirmed canonical scans:** 2026-07-18, 2026-08-15 and 2026-09-12; 2026-09-12 has the new-format ID `dexa_scan\|user_founder_001\|2026-09-12`. Earlier ones carry legacy ID formats. That is about 16 distinct dates, per code and fixtures. **I did not reconcile this against the prompt's "15/15", and I ran no production read**; V1 is prospective-only, so the count does not change the plan. | `src/data/founderSeed/dexaScans.js:113-439`; `src/fixtures/briefingFamilyV3/dexaScans.json` |
| 13 | Server / client split | The Server owns extraction, review, canonical state, interpretation and IDs. Native owns upload, review UI and command dispatch. **Native has no DEXA-specific canonical state and no HealthKit role for DEXA.** | — |

**Canonical DEXA fields** (stored units). Only total, fat, lean and BF% matter for V1.

| Field | Unit | Note |
|---|---|---|
| `totalMass` | lb | DEXA total = fat + lean soft tissue + BMC (±1.0 lb, contract) |
| `bodyFatPercentage` | percent 0–100 | contract: `fat ≈ total × BF%/100` (±0.8 lb) |
| `fatMass` | lb | |
| `leanMass` | lb | **Lean soft tissue, excluding BMC** |
| `boneMineralContent` | lb | |
| `restingMetabolicRate` | kcal/day | BodySpec **estimate**, not a calorimetric measurement |
| `visceralAdiposeTissue.mass` / `.volume` | lb / in³ | |
| `androidFatPercentage`, `gynoidFatPercentage`, `androidGynoidRatio` | %, ratio | |
| `regionalAssessment.*` | lb / % | arms/legs/trunk/android/gynoid/total |
| `boneDensity` | g/cm², T/Z | seed and parser disagree on T/Z mapping (pre-existing) |
| **absent** | — | BMI, height, fat-free mass, scan time, timezone |

**The exact accepted point.** HealthKit writeback may occur **only for a canonical DEXA record that exists in `canonicalEvidenceObjects` with `quality.status: "active"`**. That record exists once the `canonical_commit` transaction has committed (`canonicalStateDurable: true`). Writeback should not wait for `review.status = "confirmed"`:
- the canonical record is already authoritative for Goal and Confidence at that point;
- the later steps (briefing, home refresh) are unrelated to body measurements and can be `partially_committed`.

Never write from extraction output, review drafts, `pending` or `commit_failed` reviews, or the compatibility `dexaScans` collection. That collection contains contract-invalid seeds.

---

## B. Current HealthKit body-composition status (Native Build 82, `e2cbcd0c`)

| Item | Current state | Citation |
|---|---|---|
| Entitlements | iPhone: `healthkit`, `healthkit.background-delivery`. Watch: `healthkit`. No `healthkit.access` (not needed). | `ios/PhysiqueOS/Supporting/PhysiqueOS.entitlements:9-12`; `ios/PhysiqueOSWatch/PhysiqueOSWatch.entitlements:5-6` |
| Read-type authorization | Activity, Nutrition, Workouts, Sleep only (`HealthKitTypeRegistry.physiqueOSV1`). **No** `bodyMass`, `bodyFatPercentage`, `leanBodyMass`, `height` or `bodyMassIndex` reads. | `ios/PhysiqueOS/Networking/HealthKitTypeRegistry.swift:24-49` |
| Write-type authorization | **Dormant:** `.weight → bodyMass`, `.bodyComposition → bodyFatPercentage` under scope `.futureBodyMeasurementWrite`, which only tests ever request. `.healthKitWrite` is excluded from `.n1Automatic`. | `HealthKitTypeRegistry.swift:51-54,69-75`; `HealthKitCapabilityModels.swift:9,36-41` |
| `leanBodyMass` | **Explicitly excluded by a test** (`testUnsupportedDEXAMappingsRemainExcluded`) | `ios/PhysiqueOSTests/HealthKitCapabilityTests.swift:98-102` |
| `height`, `bodyMassIndex` | absent everywhere | — |
| Daily Weight source | **Manual Morning Check-In only** (`weight.submit.v1` / `check-in.submit.v1` → `weightEntries`, one record per local date, latest wins, prior values in `correctionHistory`). No HealthKit, no smart scale. | `ios/.../WeightWriteAPI.swift`; `MorningCheckInPersistenceService.js:191-226`; `src/domain/weight/canonicalWeight.js` |
| Body-composition ingestion | None, on both Native and Server. A body sample sent as `quantity_sample` would be stored raw as `source_only` (`CanonicalPersistenceCommandPorts.js:594-596`). | — |
| Current HealthKit writes | iPhone: **none** (no `HKHealthStore.save` or `delete`, no `HKQuantitySample(` outside tests). Watch: workouts via `HKLiveWorkoutBuilder`, tagged `HKMetadataKeyExternalUUID = structuredSessionId`. | `ios/PhysiqueOSWatch/WatchWorkoutHealthController.swift:48-95,184-194` |
| Source filtering / provenance | Each upload carries `bundleIdentifier`, `sourceName`, `sourceRevision` and device. **No own-bundle exclusion exists anywhere** (Native or Server). The trusted-Watch-bundle allowlist defaults to `[]` in production composition. `HKSource.default()` is unused. | `HealthKitQueryClient.swift:581-587`; `phase4PostgresComposition.js:172`; `CanonicalPersistenceCommandPorts.js:246` |
| Usage strings | Share: "…synchronize fitness, activity, nutrition, workout, and recovery information…". **Update exists:** "PhysiqueOS may write canonical body measurements, such as weight and supported body-composition measurements, to Apple Health when you enable that feature." | `ios/PhysiqueOS/Supporting/Info.plist:33-36` |
| Authorization UX | `bootstrap()` requests `.initialRead` on every Founder Production foreground; this is a no-op once determined. The Founder canary "Request Apple Health authorization" requests `.initialRead`. **No UI requests write authorization.** `authorizationStatus(for:)` is never used. | `HealthKitAutomaticSynchronizationCoordinator.swift:456-466`; `HealthKitSleepCanaryView.swift:28-39` |
| Observers | Observer and background delivery cover activity, workouts and sleep only. **No body-type observer.** New body writes would wake nothing in PhysiqueOS. | `HealthKitQueryClient.swift:797-877` |
| Bundle IDs | iPhone `com.physiqueos.native.dev`; Watch `com.physiqueos.native.dev.watchkitapp` | `project.pbxproj:2461,2629` |

**Will new permissions trigger an authorization sheet?** Yes. HealthKit shows a sheet for any type whose sharing status is `notDetermined`, and none of the body write types has ever been requested in production. Read types are already determined, so a **write-only** request shows a sheet listing only the new write types.

The request must be its own scope, triggered by an explicit Founder action. It must **not** be added to `.initialRead`, because that would prompt on launch.

Write status, unlike read status, **is** observable: `authorizationStatus(for:)` returns `.sharingAuthorized`, `.sharingDenied` or `.notDetermined`. "Permission Needed" can therefore be displayed precisely, per type.

The existing usage-string copy covers writing. It mentions "weight", so it should be edited if Weight is excluded. Editing it does not re-prompt.

---

## C. Apple Health data-type mapping (verified against the iOS 27.0 SDK headers)

| DEXA measurement | HealthKit type | Writable | Unit / aggregation | Maps without distortion? | Health app surfaces? | V1 |
|---|---|---|---|---|---|---|
| Total mass | `HKQuantityTypeIdentifierBodyMass` | yes | mass (stored kg), discrete | **Semantically a weight, but a different measurement context.** It goes into the same series as daily scale weights (§K). | Yes, Body Measurements › Weight | **No** (recommended) |
| Body fat % | `HKQuantityTypeIdentifierBodyFatPercentage` | yes | `HKUnit.percent()`, discrete, **fraction 0–1** (8.1 % → `0.081`) | **Yes**; DEXA BF% = fat ÷ total, the same definition | Yes, Body Fat Percentage | **Yes** |
| Lean mass (DEXA lean soft tissue) | `HKQuantityTypeIdentifierLeanBodyMass` | yes | mass, discrete | **Not as-is.** Apple does not define composition; the de facto meaning (scales, Health's own pairing with weight and BF%) is fat-free mass = weight − fat, **including bone**. Raw `leanMass` would be about 6–8 lb low and inconsistent with BF%. | Yes, Lean Body Mass | **Yes, only as fat-free mass = totalMass − fatMass** (Founder decision 1) |
| Bone mineral content | — (no type in the SDK) | — | — | no type exists | — | **No** (PhysiqueOS only) |
| VAT mass / volume | — | — | — | no type exists | — | No |
| Android / gynoid % / ratio | — | — | — | no type exists | — | No |
| Regional lean / fat | — | — | — | no type exists | — | No |
| BMD / T / Z | — | — | — | no type exists | — | No |
| RMR | `basalEnergyBurned` exists but is **cumulative energy** ("Resting Energy" burned over an interval), written continuously by Apple Watch | yes | kcal, **cumulative** | **No.** A kcal/day rate *estimate* is not burned energy. Writing it would add about 2,100 kcal of "resting energy" to the scan day, on top of the Watch's own basal energy samples. | — | **No (never)** |
| BMI | `bodyMassIndex` | yes | count, discrete | Not a DEXA measurement; derived from weight and height, and PhysiqueOS stores no height | — | No |
| Height | `height` | yes | m | Not stored in canonical DEXA | — | No |
| Waist circumference | `waistCircumference` | yes | m | DEXA does not measure it | — | No |

**Write units.** Write BF% as `HKQuantity(unit: .percent(), doubleValue: bf/100)`. Write lean body mass in `HKUnit.pound()` from the canonical lb values, so the value round-trips exactly. HealthKit converts for display.

---

## D. Source-of-truth / semantic decisions

1. **DEXA total mass → Body Weight. Recommend: do NOT write.**
   - It is a different measurement context: time of day, hydration, clothing and post-scan state. Per the Founder, DEXA total has historically differed from their scale; for reference, the Sep 12 DEXA total was 174.7 lb. A DEXA point would be a second weight on scan day and a visible step in Apple Health's Weight chart and in every third-party app that reads Weight.
   - Health's data-source priority is designed to resolve overlapping data. For discrete Weight samples, every source's points stay visible in Health, and **third-party apps reading HealthKit receive all samples regardless of priority**. Priority does not "cleanly distinguish" it.
   - It adds nothing to the body-composition story once BF% and lean body mass are written.
   - It does not affect PhysiqueOS today (§K), so this is purely about Apple Health and third-party integrity.
   - Consequence: the dormant `.weight → bodyMass` write type must be **removed** from the write registry, otherwise the permission sheet would ask for Weight write access (least privilege).
2. **Body Fat %. Recommend: write the accepted DEXA BF% at the scan timestamp.**
   - It is high quality and semantically exact. It coexists with any smart-scale BF%: the samples sit side by side, and the DEXA sample is distinguishable by source (PhysiqueOS) and device name ("DEXA").
   - No PhysiqueOS-side conflict exists, because PhysiqueOS ingests no BF% from HealthKit.
3. **Lean Body Mass. Recommend: write as fat-free mass = `totalMass − fatMass`, labelled with metadata `derivation = fat_free_mass_total_minus_fat`.**
   - This equals lean soft tissue + BMC (within the contract's ±1.0 lb).
   - Use `total − fat` rather than `lean + BMC` so that Health's Weight × (1 − BF%) identity holds exactly for the DEXA instant.
   - **Never write raw `leanMass` (lean soft tissue).**
   - Alternative: do not write Lean Body Mass at all (BF% only). This is the most conservative choice and avoids any definitional debate.
   - Founder decision 1. The existing `leanBodyMass` exclusion test must be deliberately flipped if accepted.
4. **Bone mass:** no HealthKit type. Keep it PhysiqueOS-only.
5. **RMR / BMR:** never map. There is no rate type, and `basalEnergyBurned` is cumulative and Watch-owned. The value is a BodySpec estimate.

---

## E. Timestamp semantics

The canonical DEXA has a **date only** (`measuredAt = YYYY-MM-DD`) and **no timezone**; the parser extracts no time. HealthKit discrete samples need an instant (`startDate == endDate`).

**Rule (deterministic, Server-computed, in priority order):**
1. **Known scan time.** If a *future* canonical field carries an explicit scan time, use it.
2. **Appointment time.** Otherwise, if the DEXA appointment that `scheduled_completion` reconciled to this scan (`completedEvidenceDate == scanDate`) has `preferredSchedule.timeOfDay`, use **that local time in the appointment's `timezone`**. Set metadata `timePrecision = appointment_time`.
3. **Date only.** Otherwise use **12:00 local on the scan date** in the owner's coaching timezone (the appointment timezone, else the Server's `America/Los_Angeles` default). Set `timePrecision = date`.

Local noon cannot shift the calendar day under any realistic timezone ambiguity.

Also:
- Set `HKMetadataKeyTimeZone` to the IANA zone used.
- **Never** use import, upload, confirmation or reconciliation time.
- A **corrected scan date** creates a new canonical lineage (§I), so it writes at the new date, and the old lineage must be withdrawn.
- **A PDF imported days later** still writes at the scan date, not the import date.

Practical prep: make sure the Oct 9 appointment in PhysiqueOS has its **local time** filled in. The sample then lands at the real appointment time.

---

## F. Write trigger and architecture

**Constraint:** only an authorized Apple device can write HealthKit. The Server can never write.

**Options evaluated:**

| Option | Assessment |
|---|---|
| 1. Native writes immediately on Confirm | Misses web confirms, app kills and offline cases. It would write from review data before canonical durability. Insufficient alone. |
| 2. Server records a pending instruction and Native performs it | Correct authority. A push queue alone is brittle: acks are lost and queues drift. |
| 3. Native observes the canonical accepted DEXA and writes idempotently | Robust, but needs Server-owned eligibility and stable IDs. |
| 4. Manual "Save to Apple Health" button | Safe, but has friction and forgets future scans. |
| 5. Hybrid: automatic plus visible status and retry | Best UX. |

**Recommendation: options 2+3+5 as a declarative, converging reconciler.**

- **Server (authority).** A new read `GET /api/v1/native/read/dexa-healthkit-writeback` (or an additive block on the `dexa` read) returns **writeback intents** derived **only** from active canonical DEXA records that pass a Server-owned, versioned policy `dexa_healthkit_writeback_policy`. The policy is shaped like the existing HealthKit activation and graduation policies: `{ enabled, effectiveFromScanDate: "2026-10-09", measurements: [...], schemaVersion }`.

  Each intent contains:
  - `logicalScanKey`, `canonicalRevision`, `state: active | withdrawn`;
  - `sampleInstant` (ISO), `timeZone`, `timePrecision`;
  - per measurement: `kind`, `value`, `unit`, `syncIdentifier`, `syncVersion`, plus `derivation` for lean body mass.

  The Server computes every value. Native does no DEXA math or unit logic beyond constructing `HKQuantity`.
- **Native (executor).** `DEXAHealthWritebackReconciler`, a new iPhone-app type, runs on:
  - a successful DEXA confirm command;
  - scene-active (the existing foreground hook);
  - DEXA screen refresh;
  - Founder "Retry".

  On each run it:
  1. fetches intents;
  2. checks per-type `authorizationStatus(for:)`;
  3. queries **own-source** samples by sync identifier;
  4. saves missing or stale samples, and deletes withdrawn ones;
  5. reports a receipt.

  It runs in the foreground only, because protected data is unavailable while locked. `HKErrorDatabaseInaccessible` means retry on the next run. V1 needs no BGTask.
- **Server receipt (status only).** A new command `dexa.healthkit-writeback.receipt.v1` uses `command_receipts` idempotency and a small ledger collection keyed `(logicalScanKey, kind)`: `{ syncVersion, outcome: saved | already_present | permission_needed | failed | deleted, hkSampleUUID?, reportedAt }`. It exists so web and Native can display status. **HealthKit itself, queried by sync identifier, is the source of truth for "was it written".** The ledger never gates a write.

**Required behavior:**

| Situation | Behavior |
|---|---|
| Confirmed on Native | After `canonicalStateDurable`, Native triggers the reconciler. The sample appears within seconds. |
| Confirmed on web / other surface | Native picks it up at the next foreground. Status shows Pending until then. |
| Phone offline | No intents can be fetched, so nothing is written. Writes happen at the next online foreground. Native never writes from cached review data. |
| Health permission denied | Status shows "Permission Needed" for that type. Nothing is written for it. Granted types still write (partial grant). Retry deep-links to Settings › Health › PhysiqueOS. |
| App killed before the write | The next run converges. |
| App killed after the HealthKit save but before the receipt | The next run finds the own-source sample with an equal sync version, reports `already_present`, and does not write again. |
| Write fails | Status "Failed" with Retry. Automatic retry happens on the next foreground. No tight loops; at most one attempt per intent per run. |
| Later retry | Idempotent via sync identifier (§G). |

---

## G. Idempotency / provenance

**Identity.** One logical sample per `(logicalScanKey, measurementKind)`.

- `HKMetadataKeySyncIdentifier = "physiqueos.dexa.v1." + hex(sha256("dexa-hk-v1|" + logicalScanKey + "|" + kind))[0..32]`. It is opaque, so no owner ID or date appears in Apple Health.
- `HKMetadataKeySyncVersion = canonicalRevision` (an integer; it grows monotonically, because a correction bumps the revision).
- `HKMetadataKeyExternalUUID`: the same digest formatted as a UUID. This follows the precedent of the Watch workout's external UUID and is useful for cross-device matching.
- Apple documents the rule: saving an object with an existing sync identifier **replaces** it when the new sync version is **greater**; both keys must be set together. `HKHealthStore.h` states that "an application may only delete objects that it previously saved."
- Behavior on an **equal or lower** version is not documented: it may be a no-op, an error, or keep the old object. **The design therefore always queries before saving** and never relies on a blind re-save. Phase C must still pin the equal-version behavior on a device or simulator.

**Minimal metadata.** No values beyond the sample, no PDF content, no owner ID:
- `PhysiqueOSSchema = "dexa-hk-writeback-v1"`
- `PhysiqueOSMeasurementKind = "bodyFatPercentage" | "leanBodyMass"`
- `PhysiqueOSDerivation = "fat_free_mass_total_minus_fat"` (lean body mass only)
- `PhysiqueOSTimePrecision = "appointment_time" | "date"`
- `HKMetadataKeyTimeZone`
- `HKDevice(name: "DEXA scan", manufacturer: <canonical provider or nil>)`, so Health's sample details show "DEXA", not a scale
- `HKMetadataKeyWasUserEntered` is **not** set; the value is a measured device result that the Founder verified.

**Source validation on re-read.** A sample is "ours" only if **both** `sample.sourceRevision.source == HKSource.default()` (the iPhone bundle) **and** the schema metadata key is present. Metadata alone is never trusted.

---

## H. Feedback-loop / re-ingestion prevention

**Today the loop is structurally impossible.** No observer, anchored query or uploader reads body types, and the Server would hold any body `quantity_sample` as `source_only`. The design still makes it explicit and tested, so a future body-type read cannot regress it.

**Recommendation: ignore PhysiqueOS-owned body samples entirely in generic ingestion.** Do not ingest them as linked observations, and do not "reconcile" them to the scan. They are *derived from* the canonical DEXA, which is already the authority, so re-ingesting them can only double count.

- **Native (primary).** Every current or future body-type ingestion query must use `NOT predicateForObjects(from: HKSource.default())`. The writeback reconciler's own query, which *is* own-source, lives in a separate code path that **never** feeds `HealthKitObservationNormalizer` or the uploader.
- **Server (defense in depth).** Ingestion rejects or neutralizes `quantity_sample` with `sampleType ∈ {bodyFatPercentage, leanBodyMass, bodyMass}` when `source.bundleIdentifier` is a PhysiqueOS bundle (`com.physiqueos.native.*`). These are recorded as `source_only` with `reconciliation.reason = "physiqueos_owned_writeback"`, are never evidence-eligible (`HEALTHKIT_STRATEGIC_EVIDENCE_ELIGIBLE = false` already holds), and trigger no writeback intent.
- **Spoofing.** Another bundle's sample carrying PhysiqueOS-looking metadata is foreign data. Because body types are not ingested, it is ignored; it is never matched to a DEXA.
- **No recursion.** Intents derive only from canonical DEXA records, never from HealthKit observations. No ingestion path can create a canonical DEXA.

**Loop test:** DEXA accepted → HealthKit save → (simulated) observer wake → full ingestion pass → assert:
- 0 new observations eligible as evidence;
- 0 canonical changes;
- 0 new intents;
- 0 additional saves;
- `weightEntries` unchanged;
- Confidence inputs unchanged.

---

## I. Corrections / delete-replace

**HealthKit rules:**
- An app may delete only samples it saved.
- A sync identifier with a higher sync version atomically replaces the old sample.
- The app cannot touch other apps' samples.

| Event | Canonical effect today | Writeback behavior (recommended) |
|---|---|---|
| Measurement correction (same-date re-upload, fingerprint changed) | Same lineage, revision + 1 | The intent carries the new `syncVersion`; Native saves and HealthKit **replaces** the old sample automatically. There is never a moment with two samples. If a *non-written* field changed (e.g., VAT), the replacement carries identical values, which is harmless. |
| Provenance-only re-import | No revision change | No-op. |
| Written value becomes null or unavailable | Revision + 1 | That measurement's intent becomes `withdrawn`, so Native deletes the own sample by sync identifier. |
| Scan-date correction | Today this creates a **new lineage**, and the old one stays active; **no product supersede path exists**. | New lineage → new samples at the new date. The old lineage must be marked superseded (explicit `supersedes_canonical_id`) → `withdrawn` → Native deletes the old samples. Until a supersede product path exists, a date correction is operator-assisted. |
| Dismiss after confirm | Native: not allowed. Web `discardEvidenceReview`: **no status guard** (a latent defect); it relabels the review but leaves the canonical record active. | Writeback keys on the canonical record, so it is unaffected. Recommend adding a `pending`/`commit_failed` guard to web discard in the same Server change (small, separate commit). |
| Canonical deleted | No delete exists | Not applicable. If a delete is ever added, it must emit `withdrawn`. |
| Writeback disabled (setting or policy off) | — | Stop future writes. **Do not delete** prior samples automatically; offer an explicit "Remove PhysiqueOS DEXA data from Apple Health" action. |

The correction policy is Founder decision 5: automatic replace is recommended.

---

## J. Historical DEXA

- About 16 historical dates exist: 13 seed-only, contract-invalid, with no canonical identity, plus about 3 app-confirmed canonical. Seed scans **cannot** produce intents, because intents require active canonical records with `dexaRevision`. Even a backfill would cover at most the 3 canonical scans unless the seeds are canonicalized first.
- **Recommendation: prospective-only.** `effectiveFromScanDate = 2026-10-09`. The Server never emits an intent for an earlier scan date, and tests assert this.
- Alternatives:
  - a bounded backfill of BF% (+ lean body mass) for canonical Jul 18, Aug 15 and Sep 12, using the same reconciler and a separate Founder-authorized policy widening;
  - a full historical backfill. This would first require canonicalizing the 13 seed scans, a separate data project, and it is not recommended.
- **No backfill was performed or authorized.**

---

## K. Daily Weight interaction

| Question | Finding |
|---|---|
| Current Weight canonical source | `weightEntries` (`canonical_checkin_records`), manual Morning Check-In / web Log / Evidence Review only. One record per local date; latest wins. |
| HealthKit Weight ingestion | None. A HealthKit bodyMass sample would be stored raw as `source_only` and never reach `weightEntries`. |
| Would a DEXA bodyMass sample appear in PhysiqueOS daily Weight? | **No, not today.** It would appear in Apple Health's Weight and in any third-party app. Latent risk: any future "read Weight from Apple Health" feature would pick it up unless that feature implements §H's own-source exclusion. |
| Same-day multiple samples | Apple Health keeps every sample. PhysiqueOS keeps one per day (latest), plus correction history. |
| Source priority | It does not hide discrete samples from charts or from third-party readers. |
| Home / Goal / Briefing implications | All read `weightEntries` and DEXA canonical directly, never HealthKit. **Zero impact** from any HealthKit writeback choice. |

**Recommendation: exclude DEXA bodyMass from writeback** (Founder decision 2).

---

## L. Apple Health UX

- **One-time ask, and an app setting.**
  - At the first eligible moment, show a PhysiqueOS sheet with Allow / Not now. The first eligible moment is the Phase D pre-scan setup, or else the first eligible DEXA confirm.
  - Suggested copy: **"Save confirmed DEXA body composition to Apple Health — Body Fat % and Lean Body Mass are saved once each time you confirm a DEXA scan. Weight and other DEXA results stay in PhysiqueOS."**
  - Allow then triggers the system sheet, which lists only the write types.
  - Add a persistent toggle at **You › Apple Health › "Save confirmed DEXA results"**. Default is ON after Allow, OFF after "Not now". Turning it OFF stops future writes; deleting existing samples is a separate explicit action.
- **Status on DEXA scan detail and Review result.** One quiet line: `Apple Health: Saved · Pending · Permission Needed · Failed`.
  - Failed and Permission Needed get a Retry or Open Settings action.
  - **No toast or banner on success.** "Saved" is passive.
- **Usage string edit.** "PhysiqueOS saves confirmed DEXA body-composition results (body fat percentage and lean body mass) to Apple Health when you enable that feature." This removes the "weight" wording if Weight is excluded.

---

## M. Security / privacy

- **The Server never touches HealthKit.** It only projects intents and records receipts.
- **No values in logs.** Receipts and logs carry the sync identifier, kind, outcome and error code only. No BF%, mass or dates appear in Native logs or telemetry.
- **Minimal metadata** (§G): opaque identifiers, no owner ID, no PDF or raw extraction content, no provider document IDs.
- **Least privilege.** Write types are only those in the accepted V1 set. **Remove `bodyMass`** from `writeTypesByDomain`. Add no read types for body measurements.
- **Writes require a valid intent.** No write is attempted without an active canonical intent under an enabled policy with an effective date ≤ scan date. Writes run in the foreground only.

---

## N. Test plan

Unit tests use a protocol-faked HealthKit store, so they need no simulator. One integration test file runs against simulator HealthKit, which is available in the iOS Simulator, under the disk rule.

**Authorization**
- Granted (both types): writes both.
- Denied: no write; status Permission Needed; no retry loop.
- `notDetermined`: no write, and no system prompt outside the explicit opt-in.
- Partial (BF% granted, lean body mass denied): BF% written, lean body mass Permission Needed.
- Opt-in triggers a request containing **only** the V1 write types, never `bodyMass`, and none from `bootstrap()`.

**Write**
- First save: correct type, unit, value (0.081), instant, timezone, sync identifier and version, metadata, device.
- Retry after success: own sample found with equal version → no save, `already_present`.
- App killed after the HealthKit save and before the receipt: the next run does not duplicate.
- Server offline: no write, Pending; writes on reconnect.
- Duplicate confirm or replayed command: one sample.
- Exact same PDF re-import (provenance-only): no revision change, no-op.
- Correction (revision + 1): replaced. Exactly one own sample per identity remains, carrying the new value and version.
- Measurement withdrawn: deleted.
- Supersede or date correction: old deleted, new written.
- Policy disabled: no writes, no deletes.
- Device locked (`DatabaseInaccessible`): deferred, then succeeds.
- **Pin HealthKit's behavior when the same sync identifier is saved with an equal sync version** (Phase C, simulator).

**Mapping**
- BF% 8.1 → `percent()` 0.081 (not 8.1 or 0.0081).
- Lean body mass = total − fat (e.g., 174.7 − 14.2 = 160.5 lb), **not** `leanMass` 153.3.
- lb unit round-trip; kg display conversion.
- A missing field emits no intent for that kind.
- The contract-consistency check (§A) holds on every emitted intent.

**Feedback**
- Own sample observed: excluded on Native (source predicate); Server rejects or neutralizes a PhysiqueOS-bundle body sample.
- Source metadata missing on an own sample: still excluded, because the source predicate is primary.
- Spoofed schema metadata from another bundle: treated as foreign; no DEXA linkage, no intent.
- Full loop test (§H): zero evidence, zero canonical change, zero additional saves, `weightEntries` unchanged.

**Weight**
- If Weight is excluded: no `bodyMass` in the authorization request or in the saves.
- If the Founder chooses to include Weight: same-day scale (PhysiqueOS-internal, unaffected) plus DEXA point; assert PhysiqueOS Weight is unchanged and the sample carries device "DEXA scan".

**Historical**
- Canonical scans dated 2026-07-18, 2026-08-15 and 2026-09-12 produce **zero** intents under the policy.
- Seed scans produce zero.
- 2026-10-09 produces intents.
- The effective date is enforced on the Server and asserted again in Native.

---

## O. Current build / delivery

- **Current authority:**
  - Production Server `d0ff6596` (deployment 64533990).
  - Native TestFlight **Build 82** `e2cbcd0c`, Founder-installed. It contains Sleep v3 and the Watch Phase 1A cancel parity work: `a173f27b` is an ancestor of `e2cbcd0c`.
  - Build 82 physical acceptance is still pending: Watch start/cancel and the Sleep natural nights.
- **Landing.** DEXA writeback is a **narrow additive iPhone-only change on top of `e2cbcd0c` → Build 83**: the reconciler, the registry edit, status UI, a settings toggle and the usage string. There are no Watch changes, so it does not disturb Watch acceptance. If a Watch fix becomes necessary before Oct 9, consolidate it into Build 83 rather than shipping two builds.
- **Server.** One additive deploy:
  - policy record (dormant/disabled);
  - intent read projection;
  - receipt command and ledger;
  - own-bundle body-sample neutralization;
  - web-discard guard.

  Deploy dormant, then enable the policy after the Phase D checks.

**Schedule:**

| Phase | When | Content |
|---|---|---|
| A — Decisions | Sat Oct 3 | Founder answers §P |
| B — Implementation | Sat Oct 3 – Mon Oct 5 | Server and Native as above; independent fresh-context review |
| C — Synthetic validation | Mon Oct 5 – Tue Oct 6 | Unit plus simulator HealthKit tests using a **synthetic** DEXA intent fixture. **Free the disk to ≥ 20 GiB first** (currently 16 GiB). Server tests against synthetic records. Server deployed **dormant**. Build 83 archived, uploaded, TestFlight VALID. |
| D — Physical pre-scan verification | Wed Oct 7 – Thu Oct 8 | Founder installs Build 83 remotely. **Opt-in → system sheet** (verify it lists only the V1 types). With Founder authorization, a **synthetic canary**: write one clearly-marked test BF% sample, verify it in Health (source PhysiqueOS, device "DEXA scan"), delete it via the app, verify it is gone. Enable the policy with `effectiveFromScanDate = 2026-10-09`; verify zero historical intents. |
| E — Real scan acceptance | Fri Oct 9 → | Scan → PDF via Priority → Files → review → confirm → canonical revision 1 → reconciler writes BF% (+ lean body mass) at the appointment time → verify in Health, the receipt ledger, and that PhysiqueOS Weight, Evidence and Confidence are unchanged → report. |

**Slip safety.** If Build 83 or the policy enable lands after Oct 9, the Oct 9 scan writes exactly once whenever the reconciler first runs, because eligibility is by scan date. The Founder can confirm the DEXA on Build 82 as normal.

---

## P. Founder decisions (genuine product choices only)

| # | Decision | Recommended | Alternative(s) | Consequence |
|---|---|---|---|---|
| 1 | Which DEXA measurements to write | **Body Fat % + Lean Body Mass written as fat-free mass (total − fat)** | (a) BF% only; (b) BF% + raw DEXA lean soft tissue (**not recommended**: it understates lean body mass by the BMC amount, about 6–8 lb, and contradicts Weight × (1 − BF%)) | Recommended: Health shows a coherent DEXA composition. Lean body mass is about 7 lb higher than PhysiqueOS's "Lean tissue" number, which is expected and labeled. BF%-only avoids that difference entirely. |
| 2 | Write DEXA total mass to Apple Health Weight | **No** | Yes, with device "DEXA scan" | Recommended: Health and third-party Weight trends stay scale-only. Yes: a second weight on scan day with a systematic DEXA offset, visible in Health and other apps. PhysiqueOS Weight is unaffected either way. |
| 3 | Historical scans | **Prospective-only (scan date ≥ 2026-10-09)** | (a) Bounded backfill of the 3 canonical scans (Jul 18, Aug 15, Sep 12); (b) full backfill, which first requires canonicalizing the 13 seed scans | Recommended: zero historical HealthKit mutation. (a) adds 3 data points per type once, via a separate authorization. (b) is a data project of its own. |
| 4 | Trigger | **Automatic after canonical acceptance, with a quiet status line and Retry** | Manual "Save to Apple Health" button per scan | Recommended: writes once with no extra step and survives web confirms and app kills. Manual: friction, and future scans can be forgotten. |
| 5 | Correction after a write | **Automatic replace** (sync version; old sample replaced, withdrawn values deleted) | Ask before replacing each time | Recommended: Health always matches canonical DEXA, with no duplicates. Ask: Health can stay stale until the Founder responds. |
| 6 | Setting / opt-in | **One-time opt-in sheet, plus a persistent toggle in You › Apple Health; turning it off stops future writes without auto-deleting** | (a) Always on, no toggle; (b) toggle that also deletes existing samples when turned off | Recommended: explicit consent and reversible. (b) makes off destructive by default. |
| 7 | Phase D physical canary (authorization) | **Authorize one synthetic test BF% sample, written and then deleted by PhysiqueOS, on Oct 7–8** | Skip; the first physical write is the real Oct 9 scan | Recommended: proves permission, source, device and delete on the real phone before the scan. Skipping leaves the first real write unrehearsed. |

Not Founder decisions (engineering defaults, stated above): timestamp rule (§E), identifier and metadata design (§G), feedback-loop policy (§H), never mapping RMR, BMC, VAT or regional values.

---

## Q. Incidental findings (not fixed; recorded)

1. Web `discardEvidenceReview` lacks the `pending`/`commit_failed` guard that Native dispose has (`actions.js:1475-1489`, `EvidenceReviewService.js:495-501`).
2. Unverified (static reading only): on a same-date DEXA re-import, the `briefing` step may look up the scan by the *new* evidence object ID, while the read-model row keeps the original ID (`actions.js:1025-1026,1220-1227`; `DEXAEventNarrativeService.js:633-634`). If DEXA Event briefings are enabled, this could throw on corrections. Verify before relying on correction-by-re-upload.
3. The production trusted-Watch-bundle allowlist is `[]` (`phase4PostgresComposition.js:172`), and the Native `trustedSourceBundleIdentifiers` context is `.disabled`. This is already tracked by the Watch lane ("independent post-acceptance review before enabling").
4. Seed and parser disagree on bone T/Z-score field mapping (pre-existing; not used by writeback).

## Checkpoint fields

- Repository: `dustinginn/physiqueos`
- Implementation branches/SHAs: **none** (audit only)
- Audit source authority: Native `e2cbcd0c` (Build 82, TestFlight f3d09d99); Server production `d0ff6596` (deployment 64533990, from the latest pointer; not reverified live, and no production access was used)
- Tests/builds run: none, by design
- Deploy/TestFlight: none
- Production mutated: no. HealthKit written: no. Backfill: no.
- Blockers: Founder decisions §P (1–7)
- Next safe step: Founder answers §P, then a Phase B implementation prompt (Server dormant + Native Build 83 on `e2cbcd0c`)
- Local-only work: none. No private Founder data was created or pushed.
