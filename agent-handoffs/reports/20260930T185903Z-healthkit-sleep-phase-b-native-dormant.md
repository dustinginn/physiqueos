# HealthKit Sleep Phase B: dormant Native ingestion path

- task.id: `healthkit-sleep-phase-b-native-dormant-20260930`
- prompt: `agent-handoffs/inbox/prompts/20260930T183100Z-healthkit-sleep-phase-b-native-dormant.md`
- agent: Claude
- status: **candidate complete**
- **NOT UPLOADED. Activation OFF.**
  - No TestFlight upload, no Server deploy, no policy write, no Founder Sleep ingest.
  - No Evidence, Home, Briefing or V3 work.

## 0. Authority

| Item | Value |
|---|---|
| Native base (verified) | **Build 72** `279103107f044141aa4c9a7487f281dc6fd19423`. Present only on `origin/codex/persistent-pairing-founder-canary-20260930`; the checkpoints branch adds reports only, no code. |
| Candidate branch | `claude/healthkit-sleep-phase-b-native-20260930` |
| Candidate SHA | **62d6b01be67e4e47e1c68224101b0e799e8714a1** (62d6b01b) |
| Phase A contract | Server `claude/healthkit-sleep-phase-a-server-20260930` @ `e1e56be696b558762544cd59fa801d7d749a8b76` (`healthkit-sleep-ingestion-v1`); report `20260930T180653Z-healthkit-sleep-phase-a-server-foundation.md` |
| Production Server | `372c306b` (re-verified live; ACTIVE deployment `01d9c20f`, 18:20Z, a spec-only update of the same code, superseding `efd356b0`). It has **no** Sleep command or manifest block, so this build is inert against production even if installed. |

State came only from GitHub (prompt, reports, remote branches). No `/private/tmp` state was used.

## 1. What changed (ios/ only)

**New files**
- `Contracts/HealthKitSleepModels.swift`: contract constants, fail-closed capability and gate, wire mapper, result validation, window-manifest planner and sender.
- `Networking/ProtectedDataRecoveryTrigger.swift`
- `PhysiqueOSTests/HealthKitSleepIngestionTests.swift`

**Changed files**
- Engine: Sleep gate plus floor re-filter, and a deactivation teardown.
- Query client:
  - Sleep floor predicate (never unbounded).
  - Privacy-safe Sleep mapping.
  - Window reader.
  - `disableBackgroundDelivery`.
  - Static observer-type mapping.
- Uploader: Sleep command branch, exact response classification, manifest submit.
- Batch builder: `.sleepV1` partitions.
- Persistence: bounded `deferredChanges`.
- Coordinator: dormant Sleep lane, run last.
- `AppEnvironment` / `PhysiqueOSApp` wiring.
- The manifest model gains a raw `healthKitSleepIngestion` field.
- Generator plus a regenerated `project.pbxproj`. The generator was verified byte-reproducible before the change.

## 2. Gate behavior

**Capability**
- `HealthKitSleepCapability.resolve` reads the raw manifest block (`ProductionJSONValue?`), so a malformed or future block can never break decoding of the whole manifest.
- It is **enabled only if all of these hold**:
  - `commandType` and `contractVersion` match exactly
  - `enabled == true`
  - `mode` is `operational` or `validation_only`
  - `effectiveSleepDay` is a valid date
  - `activationFloor` is a valid ISO instant
  - `endSleepDay` is null or a date ≥ the effective day
  - all four Server limits match (100 samples / 100 deletions / 1000 IDs / 96 h)
- Anything else resolves to disabled.

**`HealthKitSleepActivationGate`**
- Lock-guarded and persisted as last-known state in UserDefaults. It holds no health data: a flag, a mode, dates and the floor instant.
- A background launch can therefore decide without a network call.
- Absent state means OFF.
- A Server 409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED` latches it off until the next manifest read.
- A bounded window is **not** cut off by the device clock. The Server refuses after-window samples individually, and a clock cutoff would strand late in-window data and staged batches.

**Sleep runs only when all of these hold**
- the manifest capability is present
- `enabled` is true
- the floor is valid
- Native authority is Founder Production (launch registration and bootstrap are already gated on it)
- the feature gate allows the operation (`.n1Automatic`)

Otherwise Sleep **never queries HealthKit**. It is checked at the engine (before any pending delivery or query), at the query client (predicate `.refused`), at the observer registration, and at the window reader.

**Deactivation**
- When the capability turns inactive, Sleep background delivery is disabled and the observer is stopped.
- This happens only if this device had registered it (a durable marker). A never-activated device makes no HealthKit call.

## 3. Observer, query and floor

**Architecture choice:** the Sleep observer is registered only while the capability is active, which is the cleanest option. While dormant there are no wakes at all.

**Registration**
- At process launch, from the persisted state (`registerObserversForBackgroundLaunch`).
- On foreground bootstrap, after a fresh manifest read.
- Idempotent through the engine's per-scope registration guard.
- The concrete type is exactly `HKCategoryTypeIdentifierSleepAnalysis`, tested so it never maps to zero types (unlike the Nutrition daily-total gap), at `.hourly` frequency.

**Anchored query**
- It returns all category values, and unknown future raw values pass through unchanged (for example 6 and 42).
- Cursor namespace: `healthkit-automatic-sleep-v1`.
- The floor is `activationFloor` from the manifest, **enforced twice**:
  - by the HealthKit predicate on sample end (`.strictEndDate`; caller bounds are ignored for Sleep, and there is never an unbounded first run)
  - by the engine, which re-filters out additions with `endedAt < floor`
- A sample that starts before the floor and ends after it is kept, matching Phase A exactly.
- An anchor reset (corrupt cursor) uses the existing single bounded recovery and stays floor-bound (tested).

## 4. Sample mapping and privacy

**Wire sample fields**, exactly:
- `externalId` (lowercased UUID)
- `categoryValue` (raw Int)
- `startedAt` / `endedAt` (ISO-8601 with milliseconds and `Z`)
- `timeZone` plus `timeZoneSource` (`sample_metadata` when an IANA `HKTimeZone` is present, otherwise the device zone with `device_at_ingest`)
- `wasUserEntered`
- `source{bundleIdentifier, sourceVersion, productType}`

**Never sent, and never staged locally for Sleep:**
- `HKSource.name` (set to empty in the Sleep branch)
- `HKDevice`, localIdentifier, UDI, firmware or hardware details
- the metadata dictionary

**Server-parity validation**
- A sample the Server would 400 is deferred locally (`healthkit_sleep_sample_shape_invalid`) rather than wedging the lane in a 400 loop. That covers:
  - a span over 24 h
  - text over 300 characters
  - a non-IANA zone
  - a raw value outside 0…1000

**Source preference:** there is no Native source preference and no Oura rule. Oura, Watch and Sleep Cycle bundle IDs pass through unchanged, and the Server policy decides the canonical primary.

**Logs and diagnostics:** codes and counts only. There are no timestamps, durations or stages in diagnostics, and the new code writes no logs.

## 5. Deletions and window manifest

**Deletions**
- `HKDeletedObject` UUIDs from the Sleep anchored query go in the **same** partitions as samples: at most 100 samples plus 100 deletions per request.
- They are idempotent through the staged partition identity used as the Idempotency-Key.
- Deletion before add and an unknown UUID both reach the Server as tombstone input, and the Server converges them.
- A retry replays the identical request.

**Window manifest (`HealthKitSleepWindowManifestSender`)**
- Runs at most once every 12 h, during foreground bootstrap, under a bounded timeout.
- Window: `[max(now − 72 h, activationFloor), now]`, so it never precedes the floor and never exceeds 96 h.
- Reads with a plain `HKSampleQuery`, **all sources**, with a ±60 s read slack. Extra live IDs are harmless.
- **Fails closed** and sends nothing when:
  - the HealthKit read fails
  - the live list is **empty**, which is what a revoked Sleep read permission also produces, so it is never trusted to retire Server data
  - there are **more than 1000 IDs** (the read is limited to 1001 to detect this); reported, not truncated
- The cadence is durable (UserDefaults timestamp) and is recorded **only** on Server acceptance.
- A 409 latches the gate.

## 6. Background execution

The Build 71 architecture is reused unchanged:
- process-launch observer registration
- anchored query and durable protected staging
- an observer completion released exactly once (one-shot gate plus `defer`)
- a background execution assertion around the wake
- no Log dependency and no notifications

**Locked device**
- A wake while locked fails early on the protected state read, releases the completion, and advances nothing. Protected state is not quarantined (tested).
- **New:** `ProtectedDataRecoveryTrigger`, installed at process launch rather than on a view, so it also covers a background-launched process. On `protectedDataDidBecomeAvailable` it runs the coalesced `bootstrap()`, Founder Production only.
- File protection is unchanged (`.completeFileProtectionUnlessOpen`).

**Ordering:** the Sleep lane runs **after** every existing bootstrap step, so the Activity, Nutrition and Workouts ordering and timing are unchanged.

## 7. `deferredChanges` bound (shared persistence fix)

- `FileHealthKitSynchronizationStore.maximumRetainedDeferredChanges = 32` per envelope, retired oldest first.
- Every retirement is counted in the new optional diagnostics `deferredChangesRetiredCount` and `lastDeferredChangesRetiredAt`, so nothing disappears silently. Old envelopes still decode.
- Deferred changes are local-only records the Server contract cannot accept: Activity and Workout deletions, and invalid Sleep shapes. The cursor has already passed them and nothing in production reads them.
- Unsent Server-required data never lives there; it stays a pending batch. Replay, idempotency and cursor semantics are unchanged.
- Regression: the existing Activity, Nutrition and Workouts persistence tests pass, and a new test shows 40 deferrals retain 32, count 8, and the cursor reaches generation 40.

## 8. Server response handling (Phase A exact)

**200**
- Acknowledged **only** if the result has `contractVersion == healthkit-sleep-ingestion-v1`, the same `batchId`, and **exactly** the submitted sample and deletion IDs, each with a known Phase A outcome:
  - samples: `stored`, `replayed`, `refused_identity_conflict`, `refused_before_activation_floor`, `refused_after_activation_window`, `deleted_before_arrival`
  - deletions: `deleted`, `already_deleted`, `tombstoned`
- Per-sample refusals are durable Server decisions, so the partition is acknowledged and the cursor advances.
- Anything else counts as a transient failure: the batch is kept and the cursor held.

**409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED`**
- Transient.
- The staged batch is **kept** and the cursor is **not** advanced.
- The gate latches off, so there are no further queries or uploads.
- After a later manifest read re-enables, the **same** staged partition is delivered (tested).
- It is never a permanent rejection.

**400** (`HEALTHKIT_SLEEP_PRIVATE_FIELD_REJECTED` / `HEALTHKIT_SLEEP_CONTRACT_INVALID`) and other permanent problems
- Fail closed as an implementation bug.
- The batch is abandoned without a cursor advance (the existing fail-closed path), and only the problem code goes to diagnostics.
- Server-parity validation (§4) keeps valid data from reaching this path.

## 9. Tests and results

All were run on the simulator (iPhone 17 Pro) against the exact candidate source. Builds used a job-scoped DerivedData folder.

**Targeted Sleep suite:** `HealthKitSleepIngestionTests`, **36/36 pass**. It covers:
- **Gate:** capability absent, off, malformed (13 variants) and valid; the bounded window is not clock-cut; the gate persists and latches off on 409.
- **Engine gating:** an inactive gate means no query, staging, observer, background delivery or resume; Sleep is refused outside its dedicated cursor namespace.
- **Upload and cursor:**
  - Samples and deletions are uploaded together.
  - The cursor advances only after a durable acknowledgement, and a duplicate delivery replays the identical request.
  - Batches over 100 changes partition within the contract limits.
- **Floor:** the activation floor prevents backfill, a floor-straddling sample is kept, and anchor-reset recovery stays floor-bound.
- **Stage values:** all raw values 0–5 plus unknown future values (6, 42) pass through.
- **Deletions:** a deletion-only batch and deletion-before-add both reach the Server.
- **Server responses:**
  - 409: staged data is retained, the cursor is held, the gate latches off, and the same partition resumes after re-enable.
  - 400: fails closed without advancing the cursor.
  - Classification matches Phase A.
  - A result must acknowledge every identity with a known outcome.
- **Observer and background:**
  - The observer registers the concrete `sleepAnalysis` type at `.hourly`, and registration is idempotent.
  - A locked-device wake releases its completion with no progress and no quarantine.
  - The `protectedDataDidBecomeAvailable` trigger installs once and fires.
- **Predicate:** the Sleep predicate is always the floor and never unbounded; the Workout and other predicates are unchanged.
- **Wire and privacy:**
  - The wire carries exactly the Phase A keys; forbidden keys are absent.
  - Oura, Watch, Sleep Cycle and manual bundles pass through with no Native preference.
  - `wasUserEntered` is carried, and zone metadata present or missing is recorded explicitly.
  - Only pure Sleep partitions use the Sleep command.
- **Window manifest:**
  - The plan honors the 12 h cadence and never precedes the floor.
  - All sources are included, and cadence is recorded only on acceptance.
  - It fails closed on a read error, an empty list, or more than 1000 IDs.
  - It stays inert while the gate is off and latches off on 409.
- **Deferred changes:** bounded, with every retirement counted.
- **Coordinator:**
  - Launch registers Sleep only when the persisted capability is active, and never queries.
  - Bootstrap runs Sleep only when the manifest enables it, with Activity/Nutrition/Workouts scopes unchanged.
  - The last-known capability is kept when the manifest read fails.
  - Deactivation turns delivery off only if this device registered it, and only once.
- **Review regressions:** contract-impossible samples (a 30 h sample, a `GMT+0500` zone) are deferred locally while the valid sample is delivered; only named IANA zones are accepted.

**HealthKit regressions**, all pass except the updated expectations noted below:
- `HealthKitSynchronizationTests` 55
- `HealthKitFounderCanaryTests` 12
- `HealthKitAutomaticSynchronizationCoordinatorTests` 29, which includes the Build 71/72 launch registration and Workout floor
- `HealthKitWorkoutActivationFloorTests`
- `HealthKitAutomaticWorkoutFloorEngineTests`
- `HealthKitCapabilityTests`
- `HealthKitQueryClientDefaultBoundsTests` 12
- `HealthKitWorkoutIndoorOutdoorFidelityTests`
- `BackgroundExecutionAssertionTests`

**Existing tests updated for the intentional behavior change** (Sleep is no longer `.localOnly`):
- `HealthKitFounderCanaryTests`: the capability assertion is now `.sleepV1`.
- `HealthKitQueryClientDefaultBoundsTests`: Sleep is now `.refused` without a floor.
- `HealthKitSynchronizationTests`: the old "Sleep durably deferred" test was replaced by "Sleep without active gate never queries/stages/uploads".

**Full `PhysiqueOSTests`:** 1625/1626 pass. The single failure is `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture`; it is date-dependent and unrelated (no Peptide code is touched), and it was not re-verified on the base build.

**Release compile:** `xcodebuild -configuration Release -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO`, **BUILD SUCCEEDED** at the final source.

**Not run:**
- UI tests or a simulator tour (not needed; no UI).
- A device run of real HealthKit background delivery (it cannot be tested in the Simulator; it is a Phase C device acceptance item).
- Server integration against a live Phase A deploy (not deployed). The contract was verified statically by the fresh reviewer against e1e56be6.

## 10. Fresh review

An independent fresh-context reviewer (a read-only subagent) did two static rounds against items 1–14 of the prompt. It also verified the contract statically against Server e1e56be6.

**Round 1 (eb0c233a plus pending edits)**
- **Blockers:** none.
- **Should-fixes:**
  - **S1:** one sample the Server would 400 (over 24 h, a non-IANA zone, or overlong text) would wedge Sleep in a 400 loop.
  - **S2:** a bounded window was cut off by the device clock, stranding late data and staged batches.
  - **S3:** the manifest send had no timeout and could hang the shared bootstrap.
  - **S4:** Sleep background delivery was never disabled after deactivation.
- **Nits:**
  - N1: gate save race
  - N2/N3: the unlock trigger and deferred bound apply to all streams (accepted by design)
  - N4: pre-floor deletion tombstones (accepted)
  - N5–N9: minor (documented)
- **Native↔Server contract:** the manifest keys and types, wire fields, ISO/UUID/idempotency-key formats, 409/400 codes, and result shape plus outcome strings **all match. No Server change is required.**

**Round 2 (62d6b01b)**
- S1–S4, N1 and N6 are verified fixed.
- The dispatch check passes: the protocol-requirement default extensions do not shadow the real engine or system implementations.
- A never-activated device makes no HealthKit call.
- **Verdict: no remaining blockers or should-fix items.**
- Remaining nits (all minor):
  - zone-set caching
  - staged `localDate` under a fallback zone (local only)
  - UTF-16 vs Character length counting
  - newer device ICU zones

**Items confirmed**

| Item | Result |
|---|---|
| No history sweep or backfill | PASS |
| No Native source preference | PASS |
| No strategic or UI leakage | PASS |
| Privacy-safe wire and staging | PASS |
| Deletions and manifests converge | PASS |
| 409 never drops data | PASS |
| Cursor semantics | PASS |
| Concrete `sleepAnalysis` observer, hourly | PASS |
| Bounded deferred state | PASS |
| Build 71/72 Strength background fix not regressed | PASS |
| Persistent pairing and auth untouched | PASS |

## 11. Resource and disk state

- Disk: 36–38 GiB free throughout, above the 15 GiB floor.
- Swap: about 1.3 of 2 GiB used, stable.
- Builds used a job-scoped DerivedData folder, not the shared one. Two scratch checkouts were used and removed. No Codex state was touched.

## 12. Status

- **Upload: NOT UPLOADED.** No archive, no TestFlight.
- **Activation: OFF.** No policy was written, the production manifest has no Sleep block, and no Founder Sleep was ingested.
- Server deploy: none; Phase A is not merged or deployed.

## 13. Exact requirements for the Phase C prospective Founder canary

**1. Deploy Phase A Server** (e1e56be6, dormant), authorized. Then verify:
- the served manifest shows `healthKitSleepIngestion.enabled:false`
- `healthkit.sleep.ingest.v1` returns 409 while the policy is absent
- `healthKitSleepSamples` and `healthKitSleepDays` have zero rows

**2. Ship this Native path** in an authorized build and install it. Dormancy check on device: no Sleep observer (launch outcome `sleepActive=false`).

**3. Founder decides D0 and mode.** Recommended: D0 = the first night after install, `validation_only` for 2–3 nights, then `operational`.

**4. Guarded Server operation** writes `healthkit_sleep_canonical_activation_policy`:
- `{status:"enabled", schemaVersion:"healthkit-sleep-activation-policy-v1", effectiveSleepDay:D0, timeZone:"America/Los_Angeles", mode, openEnded:true, strategicEvidenceEligibility:"quarantined", historicalBackfill:false}`
- Optionally, `healthkit_sleep_source_preference_policy` with `preferredSources:[{sourceFamily:"oura"}]`.
- Both need a runner with a dry run and a zero-write audit, and Founder authorization.

**5. On device:** foreground once, so the manifest read activates the gate. Verify:
- the Sleep observer and background delivery are registered
- the first sync is floor-bound

**6. Read-only acceptance audit per night, by counts and digests only:**
- no samples before the floor
- per-night totals match the Health app within tolerance
- the main episode is correct and there is no double count
- the Oura primary is chosen when usable
- one deletion round trip and one window-manifest acceptance

**7. Rollback:** remove or disable the policy record. The Server then answers 409, Native latches off, keeps its staged data, and turns off Sleep background delivery on the next bootstrap.

## 14. Remaining decisions and notes

- D0, mode and time zone; the Oura preference write; deploy authorization for Phase A; Native build and upload authorization.
- **Accepted scope notes from review:**
  - The deferred-changes bound and the unlock trigger apply to all automatic streams, by design (the prompt allowed a shared fix).
  - Each bootstrap does one extra bounded manifest GET while dormant.
  - Deletions are forwarded without a floor check, which produces identity-only Server tombstones for pre-floor UUIDs.
  - Two Apple Watches would share a Server lane.
- **Optional Server consideration (not a Phase B mismatch):** window-manifest retirement is per owner, not per delivery device. It only matters if a second device ever uploads Sleep.
- **Unrelated failure:** `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` fails. The test is date-dependent (pause "today" against fixed fixture dates), no Peptide code is touched, and I did not re-verify it on the base build.

## 15. Recommended next prompt

> "HealthKit Sleep Phase C preparation: (1) with Founder authorization, deploy the dormant Phase A Server (e1e56be6) and verify dormancy; (2) cut an authorized Native build from `claude/healthkit-sleep-phase-b-native-20260930` @ 62d6b01b (integrated with current Native authority) and upload; (3) prepare, but do not run, a guarded Sleep activation/preference policy runner with dry run and zero-write audit. Stop for Founder D0 and mode."

## 16. Local-only state

- None unpushed.
- Scratch-only: job-scoped DerivedData and logs.
- No private Founder data, exports or harnesses.
